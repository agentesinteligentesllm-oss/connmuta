import { test } from "node:test";
import assert from "node:assert/strict";

import type { SecretStore } from "../../src/secret-store/types.js";

/**
 * `SecretStore` (`src/secret-store/types.ts`) is a types-only module, so this twin pins it the way
 * `test/shared/thread-record.test.ts` pins `ThreadRecord`: every literal below is built **against**
 * the interface, and a renamed, removed or newly-optional member therefore stops `tsc -b` instead of
 * shipping a contract that `keyring.ts`, `file-fallback.ts` and the selection probe no longer share.
 * The negative pins use the repository's own directive idiom (`test/registry/invariants.test.ts`,
 * `test/shared/tool-output.test.ts`): if the type ever widens to admit what the directive suppresses,
 * the line compiles cleanly and `tsc` fails with TS2578, so the regression cannot pass `npm test`.
 *
 * The interface is the whole of PR-14's surface for a backend: `kind`, `get`, `set`, `delete`
 * (design §6). There is no runtime value here to construct, so nothing in this file reaches disk or
 * the credential store.
 */

/** A fixture bot id, seven digits so it can never satisfy the 8–10 digit token shape (PT-22). */
const BOT_ID = "1234567";

/**
 * An in-memory implementation of the interface, built as a literal so the compiler checks every
 * member's name, arity and return type — and the `readonly` on `kind`.
 */
function sampleStore(kind: SecretStore["kind"]): SecretStore {
	const entries = new Map<string, string>();
	return {
		kind,
		async get(botId) {
			return entries.get(botId) ?? null;
		},
		async set(botId, token) {
			entries.set(botId, token);
		},
		async delete(botId) {
			entries.delete(botId);
		},
	};
}

test("a store carries exactly the interface's four members, and each backend kind is representable", () => {
	const keychain = sampleStore("keychain");
	const file = sampleStore("file");

	assert.deepEqual(Object.keys(keychain).sort(), ["delete", "get", "kind", "set"]);
	assert.equal(keychain.kind, "keychain");
	assert.equal(file.kind, "file");
});

test("`kind` is readonly: a store's backend is fixed when the selection probe picks it", () => {
	const store = sampleStore("file");
	// The daemon selects one store at startup and hands it out; a mid-run swap would mean tokens
	// written to one backend and read from the other. `readonly` is what makes that unrepresentable.
	// @ts-expect-error `kind` is readonly on SecretStore.
	store.kind = "keychain";
});

test("the interface round-trips through set and get, and get reports null for a missing entry", async () => {
	const store = sampleStore("file");

	assert.equal(await store.get(BOT_ID), null);
	await store.set(BOT_ID, "placeholder-token");
	assert.equal(await store.get(BOT_ID), "placeholder-token");
	await store.delete(BOT_ID);
	assert.equal(await store.get(BOT_ID), null);
});

test("every operation returns a promise, so no store call blocks the daemon's event loop", () => {
	const store = sampleStore("keychain");

	const written: Promise<void> = store.set(BOT_ID, "placeholder-token");
	const read: Promise<string | null> = store.get(BOT_ID);
	const removed: Promise<void> = store.delete(BOT_ID);

	assert.equal(written instanceof Promise, true);
	assert.equal(read instanceof Promise, true);
	assert.equal(removed instanceof Promise, true);
});

test("the `kind` union admits only the two backends the selection probe chooses between", () => {
	const store: SecretStore = sampleStore("keychain");
	// `"keyring"` (the package name) is not a backend: design §6 admits the OS keychain and the ACL'd
	// fallback file, and a third value would make the probe's two-branch verdict unrepresentable —
	// the first test pins those two members, this one pins that nothing else joins them.
	// @ts-expect-error an unknown backend must not satisfy the interface.
	const stranger: SecretStore = { ...store, kind: "keyring" };
	assert.equal(stranger.kind, "keyring");
});
