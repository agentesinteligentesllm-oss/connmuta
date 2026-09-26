import { join } from "node:path";

import type { RegistryTokenRef } from "../registry/schema.js";
import type { SecretStoreSelection } from "../secret-store/index.js";

/**
 * Builds the `RegistryTokenRef` a bot's registry entry stores (design.md §6).
 *
 * **Disclosed duplication.** `secret-store/keyring.ts`'s own `ACCOUNT_PREFIX` and
 * `secret-store/file-fallback.ts`'s own directory/suffix are not exported (both units are already
 * merged), so the three constants below mirror `migration/main.ts:82-89`'s own private mirrors rather
 * than re-exporting from an already-shipped unit across a compile boundary neither module was built
 * to cross. Converging the two call sites onto one shared export is a backlog row, not a drive-by
 * edit of a merged file.
 */

/** Mirrors `secret-store/keyring.ts`'s own private `ACCOUNT_PREFIX` ("bot:"), which that module does not export. */
const REGISTRY_TOKEN_ACCOUNT_PREFIX = "bot:";

/** Mirrors `secret-store/file-fallback.ts`'s own private directory name, which that module does not export. */
const FALLBACK_SECRETS_DIR_NAME = "secrets";

/** Mirrors `secret-store/file-fallback.ts`'s own private token-file suffix, which that module does not export. */
const FALLBACK_TOKEN_SUFFIX = ".token";

/**
 * Builds the token reference a bot's registry entry stores, from the same {@link SecretStoreSelection}
 * `selectSecretStore` returns.
 *
 * Produces the identical shape `migration/main.ts`'s own private construction produces for the same
 * inputs: a keychain selection yields `{ store: "keychain", account: "bot:<botId>" }`; a file-fallback
 * selection yields `{ store: "file", path: "<homeDir>/secrets/<botId>.token" }`.
 */
export function buildRegistryTokenRef(homeDir: string, botId: number, selection: SecretStoreSelection): RegistryTokenRef {
	return selection.store.kind === "keychain"
		? { store: "keychain", account: `${REGISTRY_TOKEN_ACCOUNT_PREFIX}${botId}` }
		: { store: "file", path: join(homeDir, FALLBACK_SECRETS_DIR_NAME, `${botId}${FALLBACK_TOKEN_SUFFIX}`) };
}
