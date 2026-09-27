import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { runSystemChecks, type Finding } from "../../../src/doctor/checks/system.js";
import { openLedger, LEDGER_FILE_NAME } from "../../../src/ledger/open.js";
import { hardenHomeAcl } from "../../../src/installer/acl.js";
import { icaclsExePath, REAL_EXEC_FILE, EXEC_FILE_OPTIONS, type ExecFileImpl } from "../../../src/installer/exec.js";
import { POSIX_PRIVATE_DIR_MODE } from "../../../src/shared/constants.js";

/**
 * `doctor/checks/system.ts` (design.md §9.1, spec.md "Offline/system tier checks the machine, not the
 * registry content"; tasks.md 14.1). A real temp home per scenario, never the real `~/.conmuta`.
 */

// dist/test/doctor/checks/system.test.js -> repo root is four levels up.
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const CORRUPT_FIXTURE_PATH = join(REPO_ROOT, "test", "fixtures", "ledger-corrupt.db");

/** A pid `isProcessAlive` reliably reads as dead (mirrors `test/daemon/lifecycle/lock.test.ts`). */
const DEAD_PID = 999999999;

function withTempHome(run: (homeDir: string) => void): void {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-doctor-system-"));
	try {
		run(homeDir);
	} finally {
		rmSync(homeDir, { recursive: true, force: true });
	}
}

function findingOf(findings: readonly Finding[], id: string): Finding {
	const finding = findings.find((f) => f.id === id);
	assert.ok(finding !== undefined, `expected a finding with id '${id}'`);
	return finding as Finding;
}

/** The trustee name `icacls` resolves unambiguously, mirroring `acl.ts`'s own private construction. */
function qualifiedCurrentUser(): string {
	const { username } = userInfo();
	const domain = process.env.USERDOMAIN ?? "";
	return domain === "" ? username : `${domain}\\${username}`;
}

test("runSystemChecks returns exactly one finding per check, in a fixed order", () => {
	withTempHome((homeDir) => {
		const findings = runSystemChecks({ homeDir });
		assert.deepEqual(
			findings.map((f) => f.id),
			["node-floor", "launcher-paths", "home-writable", "ledger", "daemon-lock", "spawn-lock", "home-acl", "secrets-acl"],
		);
	});
});

test("node-floor check passes on the real, at-or-above-floor process.version", () => {
	withTempHome((homeDir) => {
		const finding = findingOf(runSystemChecks({ homeDir }), "node-floor");
		assert.equal(finding.status, "pass");
	});
});

test("node-floor check fails on a faked below-floor process.version, restored after", () => {
	// Same idiom as `test/cli/main.test.ts`'s own Node-floor gate tests: no injection seam exists for
	// this Node built-in, so this is a scoped, finally-restored override.
	const originalDescriptor = Object.getOwnPropertyDescriptor(process, "version");
	try {
		Object.defineProperty(process, "version", { value: "v0.1.0", configurable: true });
		withTempHome((homeDir) => {
			const finding = findingOf(runSystemChecks({ homeDir }), "node-floor");
			assert.equal(finding.status, "fail");
		});
	} finally {
		if (originalDescriptor) {
			Object.defineProperty(process, "version", originalDescriptor);
		}
	}
});

test("launcher-paths check passes when the current interpreter and the built CLI entry point exist", () => {
	withTempHome((homeDir) => {
		const finding = findingOf(runSystemChecks({ homeDir }), "launcher-paths");
		assert.equal(finding.status, "pass");
	});
});

test("launcher-paths check fails when process.execPath cannot be resolved, restored after", () => {
	const originalDescriptor = Object.getOwnPropertyDescriptor(process, "execPath");
	try {
		Object.defineProperty(process, "execPath", { value: join(tmpdir(), "conmuta-no-such-node-binary"), configurable: true });
		withTempHome((homeDir) => {
			const finding = findingOf(runSystemChecks({ homeDir }), "launcher-paths");
			assert.equal(finding.status, "fail");
		});
	} finally {
		if (originalDescriptor) {
			Object.defineProperty(process, "execPath", originalDescriptor);
		}
	}
});

test("home-writable check reports pass and 'not yet created' before setup ever runs", () => {
	withTempHome((homeDir) => {
		const notYetCreated = join(homeDir, "never-created");
		const finding = findingOf(runSystemChecks({ homeDir: notYetCreated }), "home-writable");
		assert.equal(finding.status, "pass");
		assert.match(finding.detail, /not yet created/);
	});
});

test("home-writable check passes for a real, writable temp home", () => {
	withTempHome((homeDir) => {
		const finding = findingOf(runSystemChecks({ homeDir }), "home-writable");
		assert.equal(finding.status, "pass");
		assert.match(finding.detail, /is writable/);
	});
});

test(
	"home-writable check fails for a home directory with no write permission (POSIX)",
	{ skip: process.platform === "win32" },
	() => {
		withTempHome((homeDir) => {
			statSync(homeDir); // sanity: directory exists before we lock it down
			chmodSync(homeDir, 0o500);
			try {
				const finding = findingOf(runSystemChecks({ homeDir }), "home-writable");
				assert.equal(finding.status, "fail");
			} finally {
				chmodSync(homeDir, 0o700);
			}
		});
	},
);

test("ledger check reports pass and 'not yet created' before setup ever runs", () => {
	withTempHome((homeDir) => {
		const finding = findingOf(runSystemChecks({ homeDir }), "ledger");
		assert.equal(finding.status, "pass");
		assert.match(finding.detail, /not yet created/);
	});
});

test("ledger check passes for a healthy, freshly-opened ledger", () => {
	withTempHome((homeDir) => {
		const opened = openLedger({ homeDir });
		assert.equal(opened.status, "opened");
		opened.db.close();

		const finding = findingOf(runSystemChecks({ homeDir }), "ledger");
		assert.equal(finding.status, "pass");
		assert.match(finding.detail, /quick_check: ok/);
	});
});

test("a corrupt ledger is diagnosed as a fail finding, quarantining nothing and leaving the bytes untouched", () => {
	withTempHome((homeDir) => {
		const dbPath = join(homeDir, LEDGER_FILE_NAME);
		const corrupted = readFileSync(CORRUPT_FIXTURE_PATH);
		writeFileSync(dbPath, corrupted);

		const finding = findingOf(runSystemChecks({ homeDir }), "ledger");
		assert.equal(finding.status, "fail");

		// Never quarantines: the file is still exactly the corrupt fixture, byte for byte, and no
		// `ledger.corrupt-*` sibling was ever created.
		assert.deepEqual(readFileSync(dbPath), corrupted);
		const siblings = readdirSync(homeDir).filter((name) => name.startsWith("ledger.corrupt-"));
		assert.deepEqual(siblings, [], "a read-only diagnostic must never quarantine");
	});
});

test("an absent daemon.lock is reported pass", () => {
	withTempHome((homeDir) => {
		const finding = findingOf(runSystemChecks({ homeDir }), "daemon-lock");
		assert.equal(finding.status, "pass");
		assert.match(finding.detail, /absent/);
	});
});

test("a live-held daemon.lock is reported pass", () => {
	withTempHome((homeDir) => {
		const runDir = join(homeDir, "run");
		mkdirSync(runDir, { recursive: true });
		const lockPath = join(runDir, "daemon.lock");
		writeFileSync(lockPath, JSON.stringify({ pid: process.pid, acquired_at: Date.now() }), "utf8");

		const finding = findingOf(runSystemChecks({ homeDir }), "daemon-lock");
		assert.equal(finding.status, "pass");
		assert.match(finding.detail, /live process/);
	});
});

test("a stale daemon.lock (dead pid) is reported as a fail finding, and the lock file is left untouched", () => {
	withTempHome((homeDir) => {
		const runDir = join(homeDir, "run");
		mkdirSync(runDir, { recursive: true });
		const lockPath = join(runDir, "daemon.lock");
		const original = JSON.stringify({ pid: DEAD_PID, acquired_at: Date.now() });
		writeFileSync(lockPath, original, "utf8");

		const finding = findingOf(runSystemChecks({ homeDir }), "daemon-lock");
		assert.equal(finding.status, "fail");
		assert.match(finding.detail, /stale/);

		// No corrective action: the lock file must still exist, byte-identical.
		assert.equal(existsSync(lockPath), true);
		assert.equal(readFileSync(lockPath, "utf8"), original);
	});
});

test("a stale spawn.lock (dead pid) is reported as a fail finding under its own id, and is left untouched", () => {
	withTempHome((homeDir) => {
		const runDir = join(homeDir, "run");
		mkdirSync(runDir, { recursive: true });
		const lockPath = join(runDir, "spawn.lock");
		const original = JSON.stringify({ pid: DEAD_PID, acquired_at: Date.now() });
		writeFileSync(lockPath, original, "utf8");

		const findings = runSystemChecks({ homeDir });
		const spawnLock = findingOf(findings, "spawn-lock");
		assert.equal(spawnLock.status, "fail");

		// The daemon's own lock is unaffected by a stale spawn lock.
		const daemonLock = findingOf(findings, "daemon-lock");
		assert.equal(daemonLock.status, "pass");

		assert.equal(readFileSync(lockPath, "utf8"), original);
	});
});

test(
	"home-acl and secrets-acl check pass POSIX/mode for a home with the correct mode",
	{ skip: process.platform === "win32" },
	() => {
		withTempHome((homeDir) => {
			chmodSync(homeDir, POSIX_PRIVATE_DIR_MODE);
			const secretsDir = join(homeDir, "secrets");
			mkdirSync(secretsDir, { recursive: true, mode: POSIX_PRIVATE_DIR_MODE });

			const findings = runSystemChecks({ homeDir });
			assert.equal(findingOf(findings, "home-acl").status, "pass");
			assert.equal(findingOf(findings, "secrets-acl").status, "pass");
		});
	},
);

test(
	"home-acl check fails POSIX/mode for a home with the wrong mode",
	{ skip: process.platform === "win32" },
	() => {
		withTempHome((homeDir) => {
			chmodSync(homeDir, 0o755);
			try {
				const finding = findingOf(runSystemChecks({ homeDir }), "home-acl");
				assert.equal(finding.status, "fail");
			} finally {
				chmodSync(homeDir, POSIX_PRIVATE_DIR_MODE);
			}
		});
	},
);

test(
	"home-acl check passes on Windows against a real, hardened scratch home",
	{ skip: process.platform !== "win32" },
	() => {
		withTempHome((homeDir) => {
			REAL_EXEC_FILE(icaclsExePath(), [homeDir, "/reset"], EXEC_FILE_OPTIONS);
			hardenHomeAcl({ homeDir });

			const finding = findingOf(runSystemChecks({ homeDir }), "home-acl");
			assert.equal(finding.status, "pass", finding.detail);
		});
	},
);

test(
	"home-acl check passes with a fake icacls reporting exactly the current user (Windows argv shape)",
	{ skip: process.platform !== "win32" },
	() => {
		withTempHome((homeDir) => {
			const user = qualifiedCurrentUser();
			const execImpl: ExecFileImpl = (_file, args) => {
				const path = args[0] as string;
				return `${path} ${user}:(OI)(CI)(F)\n\nSuccessfully processed 1 files; Failed processing 0 files\n`;
			};

			const finding = findingOf(runSystemChecks({ homeDir, execImpl }), "home-acl");
			assert.equal(finding.status, "pass");
		});
	},
);

test(
	"home-acl check fails with a fake icacls reporting more than one trustee (Windows argv shape)",
	{ skip: process.platform !== "win32" },
	() => {
		withTempHome((homeDir) => {
			const execImpl: ExecFileImpl = (_file, args) => {
				const path = args[0] as string;
				return (
					`${path} SOMEDOMAIN\\otheruser:(OI)(CI)(F)\n` +
					`                        BUILTIN\\Administrators:(OI)(CI)(F)\n\n` +
					`Successfully processed 1 files; Failed processing 0 files\n`
				);
			};

			const finding = findingOf(runSystemChecks({ homeDir, execImpl }), "home-acl");
			assert.equal(finding.status, "fail");
			assert.match(finding.detail, /ACL trustees:/);
		});
	},
);
