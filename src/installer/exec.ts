import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { win32 } from "node:path";

/**
 * The installer's sole exec allow-list (D-50, design.md §12.2): the only place under `src/installer/`
 * that calls into `node:child_process`. Both this PR's `acl.ts` and PR-09's `autostart.ts` reach the
 * system only through the two runners this module exposes.
 *
 * Node has no registry API and no Windows ACL API, so both operations must shell out. Every target is
 * resolved to an absolute path under `%SystemRoot%\System32`, never a bare command name: the same
 * reasoning `installer/launcher.ts`'s `realpathSync(process.execPath)` already applies to the launched
 * Node binary — a bare command can resolve to a different, possibly attacker-planted binary earlier on
 * `PATH`, or simply fail under `spawn`'s no-shell mode, as a bare `conmuta` does on Windows.
 */

/** Directory every allow-listed executable is resolved under, per `%SystemRoot%` (design.md §12.2, D-50). */
const SYSTEM32_DIR_NAME = "System32";

/** Fallback for `%SystemRoot%` on the rare host where the environment variable is unset. */
const DEFAULT_SYSTEM_ROOT = "C:\\Windows";

/** The only two allow-listed executables (D-50): Windows ACL and registry access have no Node API. */
const ICACLS_EXE_NAME = "icacls.exe";
const REG_EXE_NAME = "reg.exe";

/** Resolves `%SystemRoot%`, falling back to {@link DEFAULT_SYSTEM_ROOT} when the environment omits it. */
function systemRoot(): string {
	return process.env.SystemRoot ?? DEFAULT_SYSTEM_ROOT;
}

/** Absolute, allow-listed path to `icacls.exe`. */
export function icaclsExePath(): string {
	// Always win32 join/isAbsolute (not the platform-default `node:path`): these paths are Windows-shaped
	// (backslash `SystemRoot`) regardless of the host running the test suite, and both executables only
	// ever exist on Windows — the platform-default join broke `isAbsolute` on a POSIX CI runner (native
	// review finding R3-posix-path-assertions-fail).
	return win32.join(systemRoot(), SYSTEM32_DIR_NAME, ICACLS_EXE_NAME);
}

/** Absolute, allow-listed path to `reg.exe`. */
export function regExePath(): string {
	return win32.join(systemRoot(), SYSTEM32_DIR_NAME, REG_EXE_NAME);
}

/** `execFileSync` options fixed for every allow-listed call: never a shell, output captured as text. */
export const EXEC_FILE_OPTIONS: ExecFileSyncOptionsWithStringEncoding = { shell: false, encoding: "utf8" };

/** The low-level exec call this module needs — real `child_process.execFileSync` by default, injectable for tests. */
export type ExecFileImpl = (file: string, args: readonly string[], options: typeof EXEC_FILE_OPTIONS) => string;

/**
 * The real exec implementation, named so a test can assert the default binds to it by reference
 * (`assert.equal(REAL_EXEC_FILE, execFileSync)`) without ever having to invoke it for real.
 */
export const REAL_EXEC_FILE: ExecFileImpl = execFileSync;

/** Runs `icacls.exe` with a literal `args` array. Throws on a non-zero exit (`execFileSync`'s own behavior). */
export function runIcacls(args: readonly string[], execImpl: ExecFileImpl = REAL_EXEC_FILE): string {
	return execImpl(icaclsExePath(), args, EXEC_FILE_OPTIONS);
}

/** Runs `reg.exe` with a literal `args` array. Throws on a non-zero exit (`execFileSync`'s own behavior). */
export function runReg(args: readonly string[], execImpl: ExecFileImpl = REAL_EXEC_FILE): string {
	return execImpl(regExePath(), args, EXEC_FILE_OPTIONS);
}
