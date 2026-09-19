import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { POSIX_PRIVATE_DIR_MODE, POSIX_PRIVATE_FILE_MODE } from "../shared/constants.js";
import type { SecretStore } from "./types.js";

/**
 * The ACL'd file fallback (`secret-store/file-fallback.ts`, design §6, PT-09 fallback half, PT-19).
 *
 * One file per bot under `<homeDir>/secrets/<bot_id>.token`, used only when the OS keychain failed
 * its startup probe. **New code, not vendored** (design §12 has no row for `secret-store/*`), so the
 * module begins with its imports and carries no `Provenance:` header.
 *
 * **The write is atomic, and the private mode is applied where it can take effect.** The token is
 * written to a sibling temp file and then renamed over the target, so a reader never observes a
 * half-written token and a crash mid-write leaves the committed file untouched. The mode is passed
 * to `writeFileSync`, which applies it **only when the file is created** — so a temp file left by an
 * interrupted earlier write is removed first. Without that removal the rename would carry the stale
 * file's mode onto the committed token, and the `0600` this module promises (and PT-19 asserts on
 * POSIX) would silently not hold for that one file. `rename` preserves the temp file's mode, so the
 * committed file is private even under a loose `umask`.
 *
 * **Windows relies on inheritance, never on this module.** There is no `icacls` call here: the
 * daemon bundle stays free of `child_process` (design §6, PT-28). The file inherits the daemon
 * home's DACL, which the installer/doctor applies once; PT-19 proves that inheritance in test code.
 *
 * **`mkdirSync` runs on every `set`, not in the constructor.** `createFileFallbackStore` is called by
 * the startup probe even on a machine that never stores a token, and a probe must not create the
 * daemon home by merely asking which store is live. `recursive: true` makes the repeated call
 * idempotent (the mode is ignored once the directory exists).
 */

/** The directory under the daemon home that holds fallback token files (design §6). */
const SECRETS_DIR_NAME = "secrets";

/** Suffix of a committed token file. */
const TOKEN_SUFFIX = ".token";

/** Suffix of the write-ahead temp file a token passes through before it is renamed into place. */
const TEMP_SUFFIX = ".token.tmp";

/** Builds the fallback store rooted at `homeDir` (the daemon's own home, not the process cwd). */
export function createFileFallbackStore(homeDir: string): SecretStore {
	const dir = join(homeDir, SECRETS_DIR_NAME);
	const tokenPath = (botId: string): string => join(dir, `${botId}${TOKEN_SUFFIX}`);

	return {
		kind: "file",
		async get(botId) {
			try {
				return readFileSync(tokenPath(botId), "utf8");
			} catch (error) {
				// Only a missing file is "no token"; any other failure (permissions, I/O) must surface,
				// because reporting it as "no token" would send the daemon looking for a `bot add` that
				// already happened.
				if (isErrno(error, "ENOENT")) {
					return null;
				}
				throw error;
			}
		},
		async set(botId, token) {
			mkdirSync(dir, { recursive: true, mode: POSIX_PRIVATE_DIR_MODE });
			const tempPath = join(dir, `${botId}${TEMP_SUFFIX}`);
			removeIfPresent(tempPath);
			writeFileSync(tempPath, token, { encoding: "utf8", mode: POSIX_PRIVATE_FILE_MODE });
			renameSync(tempPath, tokenPath(botId));
		},
		async delete(botId) {
			try {
				unlinkSync(tokenPath(botId));
			} catch (error) {
				if (!isErrno(error, "ENOENT")) {
					throw error;
				}
			}
		},
	};
}

/** Deletes `path` if it exists, and does nothing if it does not. */
function removeIfPresent(path: string): void {
	try {
		unlinkSync(path);
	} catch (error) {
		if (!isErrno(error, "ENOENT")) {
			throw error;
		}
	}
}

/** Whether `error` is a filesystem error carrying the given `code` (`ENOENT`, `EACCES`, …). */
function isErrno(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { readonly code?: unknown }).code === code
	);
}
