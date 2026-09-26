import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { buildRegistryTokenRef } from "../../src/installer/token-ref.js";
import type { SecretStore } from "../../src/secret-store/types.js";
import type { SecretStoreSelection } from "../../src/secret-store/index.js";

/**
 * `installer/token-ref.ts` (design.md §6; tasks.md PR-07 sub-task 7.5): the same `RegistryTokenRef`
 * shape `migration/main.ts`'s own private construction produces, given the same secret-store
 * selection.
 */

const HOME_DIR = "/home/example/.conmuta";
const BOT_ID = 100000001;

/** A minimal fake `SecretStore`; only `kind` is read by {@link buildRegistryTokenRef}. */
function fakeStore(kind: "keychain" | "file"): SecretStore {
	return {
		kind,
		get: async () => null,
		set: async () => undefined,
		delete: async () => undefined,
	};
}

function selectionFor(kind: "keychain" | "file"): SecretStoreSelection {
	return { store: fakeStore(kind) };
}

test("a keychain selection produces {store: 'keychain', account: 'bot:<botId>'}", () => {
	const ref = buildRegistryTokenRef(HOME_DIR, BOT_ID, selectionFor("keychain"));

	assert.deepEqual(ref, { store: "keychain", account: "bot:100000001" });
});

test("a file-fallback selection produces {store: 'file', path: '<homeDir>/secrets/<botId>.token'}", () => {
	const ref = buildRegistryTokenRef(HOME_DIR, BOT_ID, selectionFor("file"));

	assert.deepEqual(ref, { store: "file", path: join(HOME_DIR, "secrets", "100000001.token") });
});

test("a different bot id changes the account/path but nothing else", () => {
	const otherBotId = 900000002;

	const keychainRef = buildRegistryTokenRef(HOME_DIR, otherBotId, selectionFor("keychain"));
	assert.deepEqual(keychainRef, { store: "keychain", account: "bot:900000002" });

	const fileRef = buildRegistryTokenRef(HOME_DIR, otherBotId, selectionFor("file"));
	assert.deepEqual(fileRef, { store: "file", path: join(HOME_DIR, "secrets", "900000002.token") });
});

test("a different home directory changes only the file arm's path, not the keychain arm", () => {
	const otherHome = "/home/other/.conmuta";

	const keychainRef = buildRegistryTokenRef(otherHome, BOT_ID, selectionFor("keychain"));
	assert.deepEqual(keychainRef, { store: "keychain", account: "bot:100000001" });

	const fileRef = buildRegistryTokenRef(otherHome, BOT_ID, selectionFor("file"));
	assert.deepEqual(fileRef, { store: "file", path: join(otherHome, "secrets", "100000001.token") });
});
