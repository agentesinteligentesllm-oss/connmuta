import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	KEYRING_PROBE_BOT_ID,
	SECRET_STORE_FALLBACK_CONDITION,
	selectSecretStore,
} from "../../src/secret-store/index.js";
import type { SecretStore } from "../../src/secret-store/types.js";

/**
 * The selection probe (`src/secret-store/index.ts`, PT-09 fallback half, design §6).
 *
 * The probe runs once at daemon start; its verdict decides which store is live for the daemon's
 * whole life. The keyring is **injected** here so both verdicts are deterministic: a test that
 * depended on this machine's real credential store could only ever exercise one of them, and making
 * the real keyring fail on a healthy machine is not something a test can do honestly.
 */

/** A fixture bot id, deliberately seven digits: it can never satisfy the 8–10 digit token shape (PT-22). */
const BOT_ID = "1234567";

/** A fixture token shaped like a real one but unmistakably synthetic. */
const FIXTURE_TOKEN = `${BOT_ID}:${"A".repeat(35)}`;

/** What a broken credential store reports; the probe must turn it into the fallback, not a crash. */
const KEYRING_UNAVAILABLE_MESSAGE = "The platform credential store could not be opened";

/** The probe account the selector must use (design §6: a round trip on a probe account). */
const PROBE_ACCOUNT = "__probe__";

/** How a fake keyring misbehaves, if at all. */
type KeyringFault = "none" | "set-throws" | "get-throws" | "silent-write" | "throws-token-shaped-message";

/** A keyring stand-in that records every call, so the probe's round trip and its cleanup are observable. */
interface FakeKeyring extends SecretStore {
	readonly entries: Map<string, string>;
	readonly calls: string[];
}

function fakeKeyring(fault: KeyringFault = "none"): FakeKeyring {
	const entries = new Map<string, string>();
	const calls: string[] = [];
	return {
		kind: "keychain",
		entries,
		calls,
		async set(botId, token) {
			calls.push(`set:${botId}`);
			if (fault === "set-throws") throw new Error(KEYRING_UNAVAILABLE_MESSAGE);
			if (fault === "throws-token-shaped-message") {
				throw new Error(`keyring refused entry carrying ${FIXTURE_TOKEN}`);
			}
			if (fault === "silent-write") return;
			entries.set(botId, token);
		},
		async get(botId) {
			calls.push(`get:${botId}`);
			if (fault === "get-throws") throw new Error(KEYRING_UNAVAILABLE_MESSAGE);
			return entries.get(botId) ?? null;
		},
		async delete(botId) {
			calls.push(`delete:${botId}`);
			entries.delete(botId);
		},
	};
}

/** Runs `body` against a fresh temp home and removes the home afterwards. */
async function inHome(body: (home: string) => Promise<void>): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-select-"));
	try {
		await body(home);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}

test("the fallback condition is named `secret_store_fallback`", () => {
	// Design §6 names the name itself, and `status` renders it; pinning the literal is what keeps a
	// rename from silently changing what the operator sees.
	assert.equal(SECRET_STORE_FALLBACK_CONDITION, "secret_store_fallback");
	assert.equal(KEYRING_PROBE_BOT_ID, PROBE_ACCOUNT);
});

test("a keyring that round-trips is selected as the live store, and the probe entry is cleaned up", async () => {
	await inHome(async (home) => {
		const keyring = fakeKeyring();
		const selection = await selectSecretStore(home, { keyring });

		assert.equal(selection.store, keyring);
		assert.equal(selection.store.kind, "keychain");
		assert.equal(selection.condition, undefined, "a successful probe raises no condition");
		assert.equal(selection.fallbackReason, undefined);
		assert.deepEqual(
			keyring.calls,
			[`set:${PROBE_ACCOUNT}`, `get:${PROBE_ACCOUNT}`, `delete:${PROBE_ACCOUNT}`],
			"the probe must write, read back, then remove its entry",
		);
		assert.equal(keyring.entries.size, 0, "the probe entry must not survive a successful probe");
	});
});

test("a keyring that throws is refused: the fallback is selected and `secret_store_fallback` is raised", async () => {
	await inHome(async (home) => {
		const keyring = fakeKeyring("set-throws");
		const selection = await selectSecretStore(home, { keyring });

		assert.equal(selection.store.kind, "file");
		assert.equal(selection.condition, SECRET_STORE_FALLBACK_CONDITION);
		assert.equal(selection.fallbackReason, KEYRING_UNAVAILABLE_MESSAGE);
		assert.ok(keyring.calls.includes(`delete:${PROBE_ACCOUNT}`), "the probe entry must be cleaned up on refusal too");

		// The store it hands back must work, not merely be chosen: a fallback that cannot round-trip
		// would turn the keychain's failure into the daemon's.
		await selection.store.set(BOT_ID, FIXTURE_TOKEN);
		assert.equal(await selection.store.get(BOT_ID), FIXTURE_TOKEN);
		await selection.store.delete(BOT_ID);
		assert.equal(await selection.store.get(BOT_ID), null);
	});
});

test("a keyring whose write is silently dropped is refused (the probe checks the read-back)", async () => {
	await inHome(async (home) => {
		const selection = await selectSecretStore(home, { keyring: fakeKeyring("silent-write") });

		assert.equal(selection.store.kind, "file");
		assert.equal(selection.condition, SECRET_STORE_FALLBACK_CONDITION);
		assert.ok(
			(selection.fallbackReason ?? "").length > 0,
			"a mismatch must explain itself for the condition's detail",
		);
	});
});

test("a keyring that fails on read is refused as well", async () => {
	await inHome(async (home) => {
		const selection = await selectSecretStore(home, { keyring: fakeKeyring("get-throws") });

		assert.equal(selection.store.kind, "file");
		assert.equal(selection.condition, SECRET_STORE_FALLBACK_CONDITION);
		assert.equal(selection.fallbackReason, KEYRING_UNAVAILABLE_MESSAGE);
	});
});

test("the fallback reason is redacted before it can reach a log or a condition", async () => {
	await inHome(async (home) => {
		const selection = await selectSecretStore(home, { keyring: fakeKeyring("throws-token-shaped-message") });

		assert.equal(selection.fallbackReason, "keyring refused entry carrying <redacted>");
		assert.equal(
			(selection.fallbackReason ?? "").includes(FIXTURE_TOKEN),
			false,
			"the fallback reason carried the token literal",
		);
	});
});
