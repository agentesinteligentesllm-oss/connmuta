import { Entry } from "@napi-rs/keyring";

import { KEYRING_SERVICE } from "../shared/constants.js";
import type { SecretStore } from "./types.js";

/**
 * The OS keychain adapter (`secret-store/keyring.ts`, design §6, PT-09).
 *
 * One credential per bot: service `KEYRING_SERVICE` (`"conmuta"`) and account `bot:<bot_id>`, which
 * is the shape design §6 fixes and what `bot add` / the v1 migration write against.
 *
 * **New code, not vendored.** design §12 carries no row for `secret-store/*`, so this module begins
 * with its imports and carries no `Provenance:` header — `test/security/provenance.test.ts` reads a
 * file's *leading* `/**` block, and `test/fixtures/v1-provenance.json` stays at its eleven entries.
 *
 * **Two measured API facts this adapter depends on** (`@napi-rs/keyring` 2.1.0, the pinned release;
 * the sync `Entry` class is used, not `AsyncEntry`, because every call here is made from an
 * already-async path and a sync round trip is one fewer promise to interleave):
 *
 * - `getPassword()` returns `null` when there is no entry — it does not throw, so no existence
 *   probe is needed before reading. That maps directly onto {@link SecretStore.get}'s `null`.
 * - `deletePassword()` returns `false` when there was nothing to delete and only throws when a
 *   credential exists but could not be removed. The `false` case is the interface's documented
 *   "no-op if it does not exist", so the result is deliberately not inspected; a real refusal still
 *   propagates, because a token that could not be deleted must not look deleted.
 *
 * A backend that is missing or inaccessible throws from `Entry` itself. That is exactly what
 * `selectSecretStore` (`secret-store/index.ts`) probes for at daemon start; this adapter never
 * swallows such a throw, because swallowing it here would turn "no keychain" into "no token".
 */

/** Account-name prefix design §6 fixes for a bot's credential (`bot:<bot_id>`). */
const ACCOUNT_PREFIX = "bot:";

/** Builds the keyring store the daemon uses when the keychain passes its startup probe. */
export function createKeyringStore(): SecretStore {
	return {
		kind: "keychain",
		async get(botId) {
			return new Entry(KEYRING_SERVICE, ACCOUNT_PREFIX + botId).getPassword();
		},
		async set(botId, token) {
			new Entry(KEYRING_SERVICE, ACCOUNT_PREFIX + botId).setPassword(token);
		},
		async delete(botId) {
			new Entry(KEYRING_SERVICE, ACCOUNT_PREFIX + botId).deletePassword();
		},
	};
}
