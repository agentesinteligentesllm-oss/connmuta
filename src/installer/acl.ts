import { chmodSync } from "node:fs";
import { userInfo } from "node:os";

import { POSIX_PRIVATE_DIR_MODE } from "../shared/constants.js";
import { runIcacls, type ExecFileImpl } from "./exec.js";

/**
 * Hardens the daemon home's DACL (Windows) or mode (POSIX), applied once by `setup` (design.md §11,
 * D-49, THREAT-MODEL §5.5).
 *
 * On Windows this strips inherited ACEs and grants the current user full control with the inheritable
 * `(OI)(CI)` flags (D-49; THREAT-MODEL §5.5 documents the same command), so files the daemon creates
 * later under the home (identity file, ledger, fallback token file) inherit the grant. `icacls`'s
 * `/grant:r` **replaces** rather than appends the named trustee's access, so re-running this on an
 * already-hardened home reissues the identical grant instead of duplicating or widening it.
 *
 * On POSIX there is no ACL and no inheritance to set up — design §11 is a Windows-only mechanism, since
 * `fs.chmod` on Windows only ever touches the read-only bit (THREAT-MODEL §5.5). The equivalent here is
 * the same owner-only **directory** mode this codebase already uses everywhere else it creates
 * `~/.conmuta` and its subdirectories ({@link POSIX_PRIVATE_DIR_MODE}, 0700) — not the file mode PT-19
 * already pins for individual secret files, which would strip the execute bit a directory needs to be
 * traversable at all.
 */

/** What {@link hardenHomeAcl} needs. */
export interface HardenHomeAclOptions {
	/** The daemon home; `~/.conmuta` in production, a scratch directory in tests. */
	readonly homeDir: string;
	/** Overridable for tests; defaults to real `installer/exec.ts` icacls runner. Windows only. */
	readonly execImpl?: ExecFileImpl;
}

/**
 * The trustee name `icacls` needs to resolve unambiguously (design.md §11): `os.userInfo().username`,
 * qualified by `USERDOMAIN` when present. An unqualified bare name can be read as a domain instead of a
 * user on a host where the computer name, the user domain and the username coincide, granting an empty
 * account and stripping the current user's own access once combined with `/inheritance:r`.
 */
function qualifiedCurrentUser(): string {
	const { username } = userInfo();
	const domain = process.env.USERDOMAIN ?? "";
	return domain === "" ? username : `${domain}\\${username}`;
}

/** Hardens `homeDir` for the current platform (design.md §11, D-49). */
export function hardenHomeAcl(options: HardenHomeAclOptions): void {
	if (process.platform !== "win32") {
		chmodSync(options.homeDir, POSIX_PRIVATE_DIR_MODE);
		return;
	}
	const grantee = `${qualifiedCurrentUser()}:(OI)(CI)F`;
	runIcacls([options.homeDir, "/inheritance:r", "/grant:r", grantee], options.execImpl);
}
