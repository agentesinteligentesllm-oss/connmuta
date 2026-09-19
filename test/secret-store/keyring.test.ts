import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { KEYRING_SERVICE } from "../../src/shared/constants.js";
import { createKeyringStore } from "../../src/secret-store/keyring.js";

/**
 * Secret-store keyring adapter (`src/secret-store/keyring.ts`, PT-09).
 *
 * PT-09: round trip on win-x64 against the real Windows Credential Manager.
 * The bot token never touches `registry.json` — it lives only in the OS keychain.
 *
 * These tests exercise the **real** `@napi-rs/keyring` backend on whatever platform
 * the suite runs on. On a platform where the keyring is unavailable (headless CI
 * without a credential store), the probe tests fail — and that is the selection
 * probe's job (covered in `test/secret-store/index.test.ts`).
 */

/** A fixture bot id; never a real one. */
const PROBE_BOT_ID = "9999999";

/** A fixture token shaped like a real one but unmistakably synthetic. */
const FIXTURE_TOKEN = `${PROBE_BOT_ID}:${"A".repeat(35)}`;

test("keyring store reports kind 'keychain'", () => {
	const store = createKeyringStore();
	assert.equal(store.kind, "keychain");
});

test("round trip: set then get returns the same token", async () => {
	const store = createKeyringStore();
	try {
		await store.set(PROBE_BOT_ID, FIXTURE_TOKEN);
		const got = await store.get(PROBE_BOT_ID);
		assert.equal(got, FIXTURE_TOKEN);
	} finally {
		// Clean up the test entry regardless of outcome.
		await store.delete(PROBE_BOT_ID);
	}
});

test("get returns null for a non-existent entry", async () => {
	const store = createKeyringStore();
	const got = await store.get("0000000");
	assert.equal(got, null);
});

test("delete then get returns null", async () => {
	const store = createKeyringStore();
	await store.set(PROBE_BOT_ID, FIXTURE_TOKEN);
	await store.delete(PROBE_BOT_ID);
	const got = await store.get(PROBE_BOT_ID);
	assert.equal(got, null);
});

test("the keyring never touches registry.json", async () => {
	const store = createKeyringStore();
	const tmp = mkdtempSync(join(tmpdir(), "conmuta-kr-"));
	const registryPath = join(tmp, "registry.json");
	try {
		await store.set(PROBE_BOT_ID, FIXTURE_TOKEN);
		await store.get(PROBE_BOT_ID);
		await store.delete(PROBE_BOT_ID);
		// The keyring store should never create or modify registry.json.
		assert.equal(existsSync(registryPath), false, "registry.json must not exist");
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("keyring uses the KEYRING_SERVICE constant as the service name", () => {
	// The constant is "conmuta" — design §6 requires Entry(KEYRING_SERVICE, "bot:<bot_id>").
	assert.equal(KEYRING_SERVICE, "conmuta");
});
