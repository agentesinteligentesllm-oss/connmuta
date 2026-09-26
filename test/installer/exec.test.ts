import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import {
	EXEC_FILE_OPTIONS,
	REAL_EXEC_FILE,
	icaclsExePath,
	regExePath,
	runIcacls,
	runReg,
	type ExecFileImpl,
} from "../../src/installer/exec.js";

/**
 * `installer/exec.ts` (design.md §12.2, D-50; tasks.md PR-08 sub-task 8.1): the sole exec allow-list
 * module. Asserts argv shape only — no test here ever spawns a real subprocess; the real `icacls`
 * round trip lives in `acl.test.ts`.
 */

interface RecordedExecCall {
	readonly file: string;
	readonly args: readonly string[];
	readonly options: typeof EXEC_FILE_OPTIONS;
}

function createFakeExec(): { execImpl: ExecFileImpl; calls: RecordedExecCall[] } {
	const calls: RecordedExecCall[] = [];
	const execImpl: ExecFileImpl = (file, args, options) => {
		calls.push({ file, args, options });
		return "";
	};
	return { execImpl, calls };
}

/** What `icaclsExePath`/`regExePath` must resolve to, reconstructed the same way this module builds it. */
function expectedSystem32Path(exeName: string): string {
	return join(process.env.SystemRoot ?? "C:\\Windows", "System32", exeName);
}

test("icaclsExePath resolves to an absolute path under SystemRoot\\System32", () => {
	const path = icaclsExePath();
	assert.ok(isAbsolute(path), `expected an absolute path, got: ${path}`);
	assert.equal(path, expectedSystem32Path("icacls.exe"));
});

test("regExePath resolves to an absolute path under SystemRoot\\System32", () => {
	const path = regExePath();
	assert.ok(isAbsolute(path), `expected an absolute path, got: ${path}`);
	assert.equal(path, expectedSystem32Path("reg.exe"));
});

test("runIcacls calls the injected exec implementation exactly once with the absolute icacls path, literal argv, and no shell", () => {
	const fake = createFakeExec();
	const args = ["C:\\some\\home", "/inheritance:r", "/grant:r", "user:(OI)(CI)F"];

	runIcacls(args, fake.execImpl);

	assert.equal(fake.calls.length, 1, "icacls must be invoked exactly once");
	assert.equal(fake.calls[0]?.file, icaclsExePath());
	assert.deepEqual(fake.calls[0]?.args, args);
	assert.equal(fake.calls[0]?.options.shell, false);
});

test("runReg calls the injected exec implementation exactly once with the absolute reg path, literal argv, and no shell", () => {
	const fake = createFakeExec();
	const args = ["query", "HKCU\\Software\\Foo"];

	runReg(args, fake.execImpl);

	assert.equal(fake.calls.length, 1, "reg must be invoked exactly once");
	assert.equal(fake.calls[0]?.file, regExePath());
	assert.deepEqual(fake.calls[0]?.args, args);
	assert.equal(fake.calls[0]?.options.shell, false);
});

test("runIcacls never string-builds its command: each call forwards args as the exact literal array given, unconcatenated", () => {
	const fake = createFakeExec();
	const args = ["C:\\home with spaces\\x", "/inheritance:r", "/grant:r", "DOMAIN\\user:(OI)(CI)F"];

	runIcacls(args, fake.execImpl);

	assert.ok(Array.isArray(fake.calls[0]?.args), "argv must be a literal array, never a joined string");
	assert.equal(fake.calls[0]?.args.length, 4);
	for (const [index, value] of args.entries()) {
		assert.equal(fake.calls[0]?.args[index], value);
	}
});

test("EXEC_FILE_OPTIONS always disables the shell", () => {
	assert.equal(EXEC_FILE_OPTIONS.shell, false);
});

test("the default execImpl is the real node:child_process execFileSync, by reference", () => {
	// Never invoke the default for real in this file: `icacls.exe`/`reg.exe` are only exercised for
	// real in `acl.test.ts`'s scratch-directory round trip. Reference identity is the whole guarantee.
	assert.equal(REAL_EXEC_FILE, execFileSync);
});

test("installer/acl.ts (this PR's only sibling module) never imports node:child_process directly", () => {
	const source = readFileSync(new URL("../../src/installer/acl.js", import.meta.url), "utf8");
	assert.doesNotMatch(
		source,
		/require\(\s*["']node:child_process["']\s*\)|from\s+["']node:child_process["']/,
		"acl.js must reach the system only through exec.ts's runners, never child_process directly",
	);
});
