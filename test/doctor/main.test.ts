import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDoctorMain } from "../../src/doctor/main.js";
import { hardenHomeAcl } from "../../src/installer/acl.js";
import { icaclsExePath, REAL_EXEC_FILE, EXEC_FILE_OPTIONS } from "../../src/installer/exec.js";
import { POSIX_PRIVATE_DIR_MODE } from "../../src/shared/constants.js";

/**
 * `doctor/main.ts` (design.md §9.1; tasks.md 14.5): the offline tier-dispatch entry point. Always
 * called with an explicit `homeDir` — never the default `~/.conmuta` — matching every other test in
 * this suite (`mkdtempSync`, never the real home).
 *
 * Mirrors `test/installer/wizards/bot-add.test.ts`'s own async fixture shape: the helper itself
 * returns the `run(...).finally(cleanup)` promise chain, so every caller awaits one promise rather
 * than racing cleanup against an unresolved async body.
 */

function withTempHome(prefix: string, run: (homeDir: string) => Promise<void>): Promise<void> {
	const homeDir = mkdtempSync(join(tmpdir(), prefix));
	return run(homeDir).finally(() => {
		rmSync(homeDir, { recursive: true, force: true });
	});
}

/** Hardens `homeDir` so every ACL/mode-dependent finding is guaranteed to pass, on either platform. */
function hardenForCleanRun(homeDir: string): void {
	if (process.platform === "win32") {
		REAL_EXEC_FILE(icaclsExePath(), [homeDir, "/reset"], EXEC_FILE_OPTIONS);
	}
	hardenHomeAcl({ homeDir });
	mkdirSync(join(homeDir, "secrets"), { recursive: true, mode: POSIX_PRIVATE_DIR_MODE });
}

test("runDoctorMain prints one line per finding through io.out", async () => {
	await withTempHome("conmuta-doctor-main-", async (homeDir) => {
		const lines: string[] = [];
		const result = await runDoctorMain({ homeDir, io: { out: (line) => lines.push(line) } });

		assert.equal(lines.length, 8, "expected one printed line per system-tier finding");
		for (const line of lines) {
			assert.match(line, /^\[(pass|warn|fail)\] [a-z-]+: /);
		}
		assert.equal(typeof result.exitCode, "number");
	});
});

test("runDoctorMain returns exitCode 0 when every finding passes", async () => {
	await withTempHome("conmuta-doctor-main-clean-", async (homeDir) => {
		hardenForCleanRun(homeDir);
		const lines: string[] = [];
		const result = await runDoctorMain({ homeDir, io: { out: (line) => lines.push(line) } });

		assert.equal(result.exitCode, 0, `expected a clean run; got lines:\n${lines.join("\n")}`);
		assert.ok(lines.every((line) => !line.startsWith("[fail]")), `expected no [fail] line; got:\n${lines.join("\n")}`);
	});
});

test("runDoctorMain returns a non-zero exitCode when at least one finding fails (a stale daemon.lock)", async () => {
	await withTempHome("conmuta-doctor-main-fail-", async (homeDir) => {
		const runDir = join(homeDir, "run");
		mkdirSync(runDir, { recursive: true });
		writeFileSync(join(runDir, "daemon.lock"), JSON.stringify({ pid: 999999999, acquired_at: Date.now() }), "utf8");

		const lines: string[] = [];
		const result = await runDoctorMain({ homeDir, io: { out: (line) => lines.push(line) } });

		assert.notEqual(result.exitCode, 0);
		assert.ok(
			lines.some((line) => line.startsWith("[fail] daemon-lock:")),
			`expected a [fail] daemon-lock line; got:\n${lines.join("\n")}`,
		);
	});
});
