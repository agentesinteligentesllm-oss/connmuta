import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PRODUCT_NAME } from "../../src/shared/constants.js";
import { AUTOSTART_LAUNCHD_LABEL, AUTOSTART_RUN_KEY, AUTOSTART_VALUE_NAME, BACKUP_SUFFIX_PREFIX } from "../../src/installer/constants.js";
import { CLI_ENTRY } from "../../src/installer/launcher.js";
import { runReg, type ExecFileImpl } from "../../src/installer/exec.js";
import {
	DAEMON_ENTRY,
	buildLaunchdPlist,
	buildWindowsAutostartCommand,
	disableAutostart,
	disableMacAutostart,
	disableWindowsAutostart,
	enableAutostart,
	enableMacAutostart,
	enableWindowsAutostart,
} from "../../src/installer/autostart.js";

/**
 * `installer/autostart.ts` (design.md §10, D-40, D-47; tasks.md PR-09 sub-tasks 9.1-9.4): start-at-login
 * registration, opt-in, idempotent, and fully removable on both platforms.
 *
 * Windows argv-shape assertions inject a fake exec implementation; the idempotence and foreign-value
 * assertions run a real `reg.exe` round trip against a **scratch** key (never the real Run key),
 * deleted in `finally` — mirroring `acl.test.ts`'s established real-round-trip pattern. All Windows
 * tests are skipped on non-Windows hosts, matching `acl.test.ts`'s own precedent (the module's Windows
 * functions always take the Windows branch regardless of host OS, so gating is about which CI leg this
 * suite's Windows behavior is meant to run on, not about whether the fake-exec path would work
 * elsewhere). macOS assertions run on every host: the plist write has no real OS dependency (no
 * `launchctl` call, per design), so the real file-write logic is exercised for real against a scratch
 * temp directory everywhere, never the real `~/Library/LaunchAgents`.
 */

// ---------------------------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------------------------

interface RecordedRegCall {
	readonly args: readonly string[];
}

/** A fake `reg.exe` with an in-memory single-key store, enough to exercise query/add/delete round trips. */
function createFakeReg(): { execImpl: ExecFileImpl; calls: RecordedRegCall[] } {
	const store = new Map<string, string>();
	const calls: RecordedRegCall[] = [];
	const execImpl: ExecFileImpl = (_file, args) => {
		calls.push({ args });
		const [verb, , , valueName] = args;
		if (verb === "query") {
			const data = store.get(valueName);
			if (data === undefined) {
				throw new Error("fake reg.exe: ERROR: The system was unable to find the specified registry key or value.");
			}
			return `HKEY_CURRENT_USER\\Software\\Fake\\Run\n    ${valueName}    REG_SZ    ${data}\n\n`;
		}
		if (verb === "add") {
			const dataIndex = args.indexOf("/d");
			store.set(valueName, args[dataIndex + 1] ?? "");
			return "The operation completed successfully.\n";
		}
		if (verb === "delete") {
			store.delete(valueName);
			return "The operation completed successfully.\n";
		}
		throw new Error(`fake reg.exe: unsupported verb: ${verb}`);
	};
	return { execImpl, calls };
}

test(
	"buildWindowsAutostartCommand quotes the node path and the CLI entry, then appends the literal daemon start",
	{ skip: process.platform !== "win32" },
	() => {
		const command = buildWindowsAutostartCommand();
		assert.match(command, /^".+node\.exe" ".+" daemon start$/, command);
		assert.ok(command.includes(`"${CLI_ENTRY}"`), "must quote the exact CLI_ENTRY path");
	},
);

test(
	"Windows: enableWindowsAutostart queries first, then adds exactly one Run-key value, no other exec call",
	{ skip: process.platform !== "win32" },
	() => {
		const fake = createFakeReg();

		const outcome = enableWindowsAutostart({ execImpl: fake.execImpl });

		assert.equal(outcome, "created");
		assert.equal(fake.calls.length, 2, "expected exactly a query then an add, no service/Task-Scheduler call");
		assert.equal(fake.calls[0]?.args[0], "query");
		assert.equal(fake.calls[1]?.args[0], "add");
		assert.deepEqual(fake.calls[1]?.args.slice(0, 6), [
			"add",
			AUTOSTART_RUN_KEY,
			"/v",
			AUTOSTART_VALUE_NAME,
			"/t",
			"REG_SZ",
		]);
		assert.equal(fake.calls[1]?.args[fake.calls[1].args.length - 1], "/f");
	},
);

test(
	"Windows: re-running enableWindowsAutostart against identical data is a no-op (idempotent, reg query first)",
	{ skip: process.platform !== "win32" },
	() => {
		const fake = createFakeReg();

		const first = enableWindowsAutostart({ execImpl: fake.execImpl });
		const second = enableWindowsAutostart({ execImpl: fake.execImpl });

		assert.equal(first, "created");
		assert.equal(second, "noop");
		const addCalls = fake.calls.filter((call) => call.args[0] === "add");
		assert.equal(addCalls.length, 1, "a second identical run must not issue a second add");
	},
);

test(
	"Windows: disableWindowsAutostart removes our value and reports noop when nothing is registered",
	{ skip: process.platform !== "win32" },
	() => {
		const fake = createFakeReg();

		const noop = disableWindowsAutostart({ execImpl: fake.execImpl });
		assert.equal(noop, "noop");

		enableWindowsAutostart({ execImpl: fake.execImpl });
		const removed = disableWindowsAutostart({ execImpl: fake.execImpl });
		assert.equal(removed, "removed");
		assert.equal(disableWindowsAutostart({ execImpl: fake.execImpl }), "noop", "a second disable is a noop");
	},
);

test(
	"Windows: a reg.exe spawn failure (missing binary) rethrows instead of being treated as \"value absent\"",
	{ skip: process.platform !== "win32" },
	() => {
		const spawnFailure: ExecFileImpl = () => {
			const error = new Error("spawn reg.exe ENOENT") as NodeJS.ErrnoException;
			error.code = "ENOENT";
			throw error;
		};

		assert.throws(() => enableWindowsAutostart({ execImpl: spawnFailure }), /ENOENT/);
		assert.throws(() => disableWindowsAutostart({ execImpl: spawnFailure }), /ENOENT/);
	},
);

test(
	"Windows: real reg.exe round trip against a scratch key — idempotent write, then removal leaves a foreign value untouched",
	{ skip: process.platform !== "win32" },
	() => {
		const scratchRunKey = `HKCU\\Software\\${PRODUCT_NAME}-test-${randomUUID()}`;
		const foreignValueName = "SomeOtherApp";
		const foreignData = "foreign-data";
		try {
			// Seed a foreign value under the scratch key first, through the same real reg.exe this suite
			// is about to exercise, so the key exists even before our own value is ever written.
			runReg(["add", scratchRunKey, "/v", foreignValueName, "/t", "REG_SZ", "/d", foreignData, "/f"]);

			const created = enableWindowsAutostart({ runKey: scratchRunKey });
			assert.equal(created, "created");
			const noop = enableWindowsAutostart({ runKey: scratchRunKey });
			assert.equal(noop, "noop", "re-running against the real scratch key must be idempotent");

			const removed = disableWindowsAutostart({ runKey: scratchRunKey });
			assert.equal(removed, "removed");

			assert.equal(
				disableWindowsAutostart({ runKey: scratchRunKey }),
				"noop",
				"our value is already gone after the first removal",
			);

			// The foreign value must survive both of our writes and our removal, data untouched.
			const foreignQuery = runReg(["query", scratchRunKey, "/v", foreignValueName]);
			assert.match(foreignQuery, new RegExp(`${foreignValueName}\\s+REG_SZ\\s+${foreignData}`));
		} finally {
			try {
				runReg(["delete", scratchRunKey, "/f"]);
			} catch {
				// Key was never created (an earlier assertion threw first); nothing to clean up.
			}
		}
	},
);

// ---------------------------------------------------------------------------------------------
// macOS
// ---------------------------------------------------------------------------------------------

test("buildLaunchdPlist installs Label, ProgramArguments in order, RunAtLoad true, and no KeepAlive key at all", () => {
	const plist = buildLaunchdPlist("/usr/local/bin/node", "/opt/conmuta/dist/src/daemon/main.js");

	assert.match(plist, /<key>Label<\/key>\s*<string>(.*?)<\/string>/);
	assert.match(plist, new RegExp(`<string>${AUTOSTART_LAUNCHD_LABEL.replace(/\./g, "\\.")}</string>`));
	assert.match(
		plist,
		/<key>ProgramArguments<\/key>\s*<array>\s*<string>\/usr\/local\/bin\/node<\/string>\s*<string>\/opt\/conmuta\/dist\/src\/daemon\/main\.js<\/string>\s*<\/array>/,
	);
	assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
	assert.doesNotMatch(plist, /KeepAlive/, "must carry no KeepAlive key at all (design.md §10)");
});

test("buildLaunchdPlist XML-escapes path text", () => {
	const plist = buildLaunchdPlist('/path/with "quote" & <angle>', "/entry");
	assert.doesNotMatch(plist, /<angle>/, "a literal < must be escaped, never emitted as a tag");
	assert.ok(plist.includes("&amp;"), "a literal & must be escaped");
});

test("DAEMON_ENTRY resolves to the real compiled daemon entry point", () => {
	assert.ok(DAEMON_ENTRY.endsWith("main.js"));
	assert.ok(DAEMON_ENTRY.includes("daemon"));
	assert.ok(existsSync(DAEMON_ENTRY), "DAEMON_ENTRY must resolve to the real compiled daemon entry point");
});

function withScratchLaunchAgentsDir(body: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-autostart-"));
	try {
		body(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("macOS: enableMacAutostart creates exactly one plist at the expected path", () => {
	withScratchLaunchAgentsDir((dir) => {
		const outcome = enableMacAutostart({ launchAgentsDir: dir });
		assert.equal(outcome, "created");

		const expectedPath = join(dir, `${AUTOSTART_LAUNCHD_LABEL}.plist`);
		assert.ok(existsSync(expectedPath));
		const content = readFileSync(expectedPath, "utf8");
		assert.match(content, /<key>RunAtLoad<\/key>\s*<true\/>/);
		assert.doesNotMatch(content, /KeepAlive/);
	});
});

test("macOS: re-running enableMacAutostart with identical content is a no-op, no backup file appears", () => {
	withScratchLaunchAgentsDir((dir) => {
		enableMacAutostart({ launchAgentsDir: dir });
		const outcome = enableMacAutostart({ launchAgentsDir: dir });

		assert.equal(outcome, "noop");
		const entries = readdirSync(dir);
		assert.equal(entries.length, 1, `expected only the plist itself, found: ${entries.join(", ")}`);
	});
});

test("macOS: enableMacAutostart rewrites with a backup when existing content under our label differs", () => {
	withScratchLaunchAgentsDir((dir) => {
		const path = join(dir, `${AUTOSTART_LAUNCHD_LABEL}.plist`);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			path,
			buildLaunchdPlist("/old/node", "/old/dist/src/daemon/main.js"),
			"utf8",
		);

		const outcome = enableMacAutostart({ launchAgentsDir: dir, now: () => new Date("2026-01-01T00:00:00Z") });

		assert.equal(outcome, "written");
		const entries = readdirSync(dir);
		assert.equal(entries.length, 2, "expected the rewritten plist plus exactly one backup");
		assert.ok(entries.some((name) => name.includes(BACKUP_SUFFIX_PREFIX)), "expected a pre-edit backup sibling");
	});
});

test("macOS: enableMacAutostart refuses to overwrite a foreign plist (different Label) at our own path", () => {
	withScratchLaunchAgentsDir((dir) => {
		const path = join(dir, `${AUTOSTART_LAUNCHD_LABEL}.plist`);
		mkdirSync(dir, { recursive: true });
		const foreignContent = buildLaunchdPlist("/foreign/node", "/foreign/entry").replace(AUTOSTART_LAUNCHD_LABEL, "io.someoneelse.daemon");
		writeFileSync(path, foreignContent, "utf8");

		assert.throws(() => enableMacAutostart({ launchAgentsDir: dir }), /refusing to overwrite/);
		assert.equal(readFileSync(path, "utf8"), foreignContent, "a foreign Label must never be overwritten, not even with a backup");
	});
});

test("macOS: disableMacAutostart removes only a plist whose Label matches ours", () => {
	withScratchLaunchAgentsDir((dir) => {
		const absent = disableMacAutostart({ launchAgentsDir: dir });
		assert.equal(absent, "noop");

		enableMacAutostart({ launchAgentsDir: dir });
		const removed = disableMacAutostart({ launchAgentsDir: dir });
		assert.equal(removed, "removed");
		assert.equal(existsSync(join(dir, `${AUTOSTART_LAUNCHD_LABEL}.plist`)), false);
	});
});

test("macOS: disableMacAutostart leaves a foreign plist (different Label) at our own path untouched", () => {
	withScratchLaunchAgentsDir((dir) => {
		const path = join(dir, `${AUTOSTART_LAUNCHD_LABEL}.plist`);
		mkdirSync(dir, { recursive: true });
		const foreignContent = buildLaunchdPlist("/foreign/node", "/foreign/entry").replace(
			AUTOSTART_LAUNCHD_LABEL,
			"io.someoneelse.daemon",
		);
		writeFileSync(path, foreignContent, "utf8");

		const outcome = disableMacAutostart({ launchAgentsDir: dir });

		assert.equal(outcome, "noop");
		assert.equal(readFileSync(path, "utf8"), foreignContent, "a foreign Label must never be removed");
	});
});

// ---------------------------------------------------------------------------------------------
// Platform dispatch
// ---------------------------------------------------------------------------------------------

test(
	"enableAutostart/disableAutostart delegate to the current platform's implementation without touching real locations",
	{ skip: process.platform !== "win32" && process.platform !== "darwin" },
	() => {
		withScratchLaunchAgentsDir((dir) => {
			const scratchRunKey = `HKCU\\Software\\${PRODUCT_NAME}-test-${randomUUID()}`;
			try {
				const enabled = enableAutostart({ runKey: scratchRunKey, launchAgentsDir: dir });
				assert.equal(enabled, "created", "the scratch target must be genuinely absent beforehand");
				if (process.platform === "win32") {
					const queried = runReg(["query", scratchRunKey, "/v", AUTOSTART_VALUE_NAME]);
					assert.match(queried, new RegExp(AUTOSTART_VALUE_NAME), "expected the scratch Run-key value to have been created");
				} else {
					assert.equal(existsSync(join(dir, `${AUTOSTART_LAUNCHD_LABEL}.plist`)), true, "expected the scratch plist to have been created");
				}

				const disabled = disableAutostart({ runKey: scratchRunKey, launchAgentsDir: dir });
				assert.equal(disabled, "removed");
				if (process.platform === "darwin") {
					assert.equal(existsSync(join(dir, `${AUTOSTART_LAUNCHD_LABEL}.plist`)), false, "expected the scratch plist to have been removed");
				}
			} finally {
				if (process.platform === "win32") {
					try {
						runReg(["delete", scratchRunKey, "/f"]);
					} catch {
						// Key was never created, or already removed by the test itself; nothing to clean up.
					}
				}
			}
		});
	},
);
