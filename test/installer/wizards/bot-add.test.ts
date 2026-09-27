import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { parseRegistryDocument, type Registry } from "../../../src/registry/schema.js";
import { serializeRegistry } from "../../../src/registry/writer.js";
import { createFileFallbackStore } from "../../../src/secret-store/file-fallback.js";
import type { SecretStoreSelection } from "../../../src/secret-store/index.js";
import { REGISTRY_VERSION } from "../../../src/shared/constants.js";
import { TELEGRAM_BOT_TOKEN_RE } from "../../../src/shared/secrets.js";
import type { Prompter } from "../../../src/installer/prompter.js";
import { runBotAdd } from "../../../src/installer/wizards/bot-add.js";

/**
 * `installer/wizards/bot-add.ts` (spec.md:61-83, design.md §6 D-37; tasks.md PR-11 sub-task
 * 11.1/11.2): masked token intake, `getMe` through the daemon's own redacting client, then a
 * secret-store write followed by one registry commit.
 *
 * Real `node:sqlite` ledger and a real `registry.json`, mirroring `test/installer/registry-commit.
 * test.ts`'s own harness; the secret store is the real ACL'd file fallback
 * (`secret-store/file-fallback.ts`) rather than a hand-rolled fake, and `selectSecretStoreImpl` is
 * always injected so the suite never touches the real OS keychain (`migration/main.test.ts`'s own
 * established pattern for the identical concern).
 */

const BOT_ID = 900000123;
const BOT_USERNAME = "carol_example_bot";
const NOW = new Date("2026-09-26T10:00:00.000Z");
const FIXTURE_TOKEN = `${BOT_ID}:${"A".repeat(35)}`;
const TOKEN_SHAPE_RE = new RegExp(TELEGRAM_BOT_TOKEN_RE.source);

const CANCEL = Symbol("cancel");

/** A `Prompter` fake whose `password()` answers a scripted token, or the cancel symbol. */
function fakePrompter(answer: string | typeof CANCEL): Prompter {
	return {
		async password() {
			return answer === CANCEL ? CANCEL : answer;
		},
		async text() {
			throw new Error("not used by this suite");
		},
		async select() {
			throw new Error("not used by this suite");
		},
		async multiselect() {
			throw new Error("not used by this suite");
		},
		async confirm() {
			throw new Error("not used by this suite");
		},
		isCancel(value) {
			return value === CANCEL;
		},
	};
}

/** A real, schema-valid empty {@link Registry}. */
function emptyRegistry(): Registry {
	const parsed = parseRegistryDocument({ registry_version: REGISTRY_VERSION, bots: [], groups: [], projects: [], bindings: [] });
	assert.equal(parsed.ok, true, "fixture must itself be valid");
	if (!parsed.ok) {
		throw new Error("unreachable");
	}
	return parsed.registry;
}

/** A temp home, an open ledger, and a seeded empty `registry.json`; both are closed/removed after. */
function withBotAddFixture(
	run: (fixture: { readonly db: DatabaseSync; readonly homeDir: string; readonly registryPath: string }) => Promise<void>,
): Promise<void> {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-bot-add-"));
	const ledger = openLedger({ homeDir });
	const registryPath = join(homeDir, "registry.json");
	writeFileSync(registryPath, serializeRegistry(emptyRegistry()), "utf8");
	return run({ db: ledger.db, homeDir, registryPath }).finally(() => {
		ledger.db.close();
		rmSync(homeDir, { recursive: true, force: true });
	});
}

/** Injects the real file-fallback store rooted at `homeDir`, never the real OS keychain. */
async function fakeSelectSecretStore(homeDir: string): Promise<SecretStoreSelection> {
	return { store: createFileFallbackStore(homeDir) };
}

test("a cancelled token prompt returns cancelled with no network call, no write and no secret", async () => {
	await withBotAddFixture(async ({ db, homeDir, registryPath }) => {
		const beforeRegistry = readFileSync(registryPath, "utf8");
		let fetchCalled = false;

		const outcome = await runBotAdd({
			db,
			registryPath,
			homeDir,
			prompter: fakePrompter(CANCEL),
			fetchImpl: (async () => {
				fetchCalled = true;
				throw new Error("must never be called");
			}) as unknown as typeof fetch,
			now: () => NOW,
			selectSecretStoreImpl: fakeSelectSecretStore,
		});

		assert.deepEqual(outcome, { outcome: "cancelled" });
		assert.equal(fetchCalled, false);
		assert.equal(readFileSync(registryPath, "utf8"), beforeRegistry, "registry.json must be untouched");
		assert.equal(await createFileFallbackStore(homeDir).get(String(BOT_ID)), null, "no secret must be written");
	});
});

test("a successful bot add stores the token and records the bot, never leaking the token into registry.json", async () => {
	await withBotAddFixture(async ({ db, homeDir, registryPath }) => {
		const outcome = await runBotAdd({
			db,
			registryPath,
			homeDir,
			prompter: fakePrompter(FIXTURE_TOKEN),
			fetchImpl: (async () =>
				new Response(JSON.stringify({ ok: true, result: { id: BOT_ID, is_bot: true, username: BOT_USERNAME } }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})) as unknown as typeof fetch,
			now: () => NOW,
			selectSecretStoreImpl: fakeSelectSecretStore,
		});

		assert.deepEqual(outcome, { outcome: "added", bot_id: BOT_ID, username: BOT_USERNAME });

		const storedToken = await createFileFallbackStore(homeDir).get(String(BOT_ID));
		assert.equal(storedToken, FIXTURE_TOKEN, "the secret store must hold the exact token");

		const registryText = readFileSync(registryPath, "utf8");
		const parsed = parseRegistryDocument(JSON.parse(registryText));
		assert.equal(parsed.ok, true);
		if (parsed.ok) {
			assert.deepEqual([...parsed.registry.bots], [
				{
					bot_id: BOT_ID,
					username: BOT_USERNAME,
					token_ref: { store: "file", path: join(homeDir, "secrets", `${BOT_ID}.token`) },
					added_at: NOW.toISOString(),
				},
			]);
		}
		assert.equal(registryText.includes(FIXTURE_TOKEN), false, "registry.json must never carry the raw token");
	});
});

test("a getMe rejection returns getMe-failed and makes no registry or secret-store write", async () => {
	await withBotAddFixture(async ({ db, homeDir, registryPath }) => {
		const beforeRegistry = readFileSync(registryPath, "utf8");

		const outcome = await runBotAdd({
			db,
			registryPath,
			homeDir,
			prompter: fakePrompter(FIXTURE_TOKEN),
			fetchImpl: (async () => {
				throw new TypeError("Failed to fetch");
			}) as unknown as typeof fetch,
			now: () => NOW,
			selectSecretStoreImpl: fakeSelectSecretStore,
		});

		assert.equal(outcome.outcome, "getMe-failed");
		assert.equal(readFileSync(registryPath, "utf8"), beforeRegistry, "registry.json must be untouched");
		assert.equal(await createFileFallbackStore(homeDir).get(String(BOT_ID)), null, "no secret must be written");
	});
});

test("a non-bot account is refused the same way a getMe rejection is, with no write", async () => {
	await withBotAddFixture(async ({ db, homeDir, registryPath }) => {
		const outcome = await runBotAdd({
			db,
			registryPath,
			homeDir,
			prompter: fakePrompter(FIXTURE_TOKEN),
			fetchImpl: (async () =>
				new Response(JSON.stringify({ ok: true, result: { id: BOT_ID, is_bot: false, username: BOT_USERNAME } }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})) as unknown as typeof fetch,
			now: () => NOW,
			selectSecretStoreImpl: fakeSelectSecretStore,
		});

		assert.equal(outcome.outcome, "getMe-failed");
		assert.equal(await createFileFallbackStore(homeDir).get(String(BOT_ID)), null, "no secret must be written");
	});
});

test("(11.2 redaction pin) a getMe failure whose message and stack embed the full token URL never leaks the token", async () => {
	await withBotAddFixture(async ({ db, homeDir, registryPath }) => {
		const outcome = await runBotAdd({
			db,
			registryPath,
			homeDir,
			prompter: fakePrompter(FIXTURE_TOKEN),
			fetchImpl: (async () => {
				const err = new Error(`fetch failed: https://api.telegram.org/bot${FIXTURE_TOKEN}/getMe`);
				err.stack = `${err.message}\n    at fakeFetch (test/installer/wizards/bot-add.test.ts:1:1)`;
				throw err;
			}) as unknown as typeof fetch,
			now: () => NOW,
			selectSecretStoreImpl: fakeSelectSecretStore,
		});

		assert.equal(outcome.outcome, "getMe-failed");
		if (outcome.outcome === "getMe-failed") {
			assert.doesNotMatch(outcome.message, TOKEN_SHAPE_RE);
			assert.equal(outcome.message.includes(FIXTURE_TOKEN), false);
		}
	});
});

test("a registry-commit failure surfaces its outcome and leaves the orphan secret in place (design.md §6)", async () => {
	await withBotAddFixture(async ({ db, homeDir, registryPath }) => {
		writeFileSync(registryPath, "not json at all", "utf8");

		const outcome = await runBotAdd({
			db,
			registryPath,
			homeDir,
			prompter: fakePrompter(FIXTURE_TOKEN),
			fetchImpl: (async () =>
				new Response(JSON.stringify({ ok: true, result: { id: BOT_ID, is_bot: true, username: BOT_USERNAME } }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})) as unknown as typeof fetch,
			now: () => NOW,
			selectSecretStoreImpl: fakeSelectSecretStore,
		});

		assert.equal(outcome.outcome, "registry-commit-failed");
		if (outcome.outcome === "registry-commit-failed") {
			assert.equal(outcome.detail.outcome, "current-invalid");
		}
		assert.equal(readFileSync(registryPath, "utf8"), "not json at all", "an unparseable registry.json is left untouched");
		// The secret write already happened (design.md §6's disclosed ordering): a refused commit leaves
		// an orphan secret, never undone here, that the next `bot add` for this bot overwrites.
		assert.equal(await createFileFallbackStore(homeDir).get(String(BOT_ID)), FIXTURE_TOKEN);
	});
});
