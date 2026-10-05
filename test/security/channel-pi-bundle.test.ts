/**
 * Static bundle-conformance assertions for the Pi host adapter (`channel-pi/`, ADR-0036; ODD task
 * `odd/tasks/f7c-pi-host-doorbell.md` T3). New test-only code, modeled on `channel-bundle.test.ts` —
 * read that file first; this one states only where it diverges and why.
 *
 * **The load-bearing rule here is a different one.** The Claude Code adapter's closure has no send path
 * to ban, so its test bans `.sendMessage(` outright: that call belongs to the daemon's Telegram client.
 * This adapter *must* call a method with that name — `pi.sendMessage` is how a ring enters the live
 * session — so banning the shape would ban the feature. What is pinned instead is the same guarantee by
 * a sharper route: the whole tree that owns sending (`src/daemon/`) is unreachable from this closure, no
 * Telegram URL or `getUpdates` call exists in it, and **exactly one module calls `.sendMessage(`, in
 * exactly one place: `channel-pi/host.js`**. A second call site anywhere in the closure fails the test,
 * so the adapter cannot grow a second escape hatch without the change being deliberate.
 *
 * B-100(b): `computeClosure` follows only relative specifiers, so a bare-specifier dependency wrapping
 * process spawning or a network client would never enter this closure's own file set. The allow-list
 * rule below closes that: any bare specifier not already reviewed and listed fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { computeClosure, bareSpecifiers } from "./closure.js";
import {
	hasAutonomousTimerReference,
	hasChildProcessReference,
	hasTimersModuleReference,
	sendMessageCallLines,
} from "./predicates.js";

/** `dist/`, two levels above this compiled file. Not `DIST_SRC_DIR` (`dist/src/`): the adapter lives in `dist/channel-pi/`. */
const DIST_DIR = fileURLToPath(new URL("../../", import.meta.url));
const ENTRY = "channel-pi/main.js";

/**
 * The real closure is 18 files (three `channel-pi/`, three `channel/`, nine `src/shared/` and three
 * `src/client/` modules). The floor leaves room for a legitimate merge or split while still catching a
 * walk that collapsed to a handful of files.
 */
const MIN_BUNDLE_FILES = 14;

/** Modules the entry's own imports must reach: if one is missing, the walk broke, not the adapter. */
const SENTINEL_MODULES = [
	"channel-pi/main.js",
	"channel-pi/host.js",
	"channel-pi/constants.js",
	"channel/daemon-link.js",
	"channel/doorbell-loop.js",
	"channel/notify.js",
	"src/client/binding.js",
	"src/client/run-file.js",
	"src/shared/roster-hash.js",
];

/** The same closed `fs` allow-list the Claude Code adapter's closure holds: the project-tree reader and the daemon run-file reader. */
const FS_ALLOWLIST: readonly string[] = ["src/client/binding.js", "src/client/run-file.js"];

/** The only closure file allowed to arm a timer: the shipped paced loop's own retry sleep. */
const TIMER_ALLOWLIST: readonly string[] = ["channel/doorbell-loop.js"];

/** The only closure file allowed to call `.sendMessage(`, and it must be this adapter's ring, once. */
const RING_MODULE = "channel-pi/host.js";
const RING_CALL_SITES = 1;

/** Every bare specifier the real closure reaches, reviewed one by one. A new one fails until deliberately added. */
const ALLOWED_BARE_SPECIFIERS: readonly string[] = ["node:crypto", "node:fs", "node:os", "node:path", "zod"];

/** Transport, send and Telegram-client code all live under it; no `daemon/` path may be reachable from a host adapter. */
const FORBIDDEN_PREFIX = "src/daemon/";
const FORBIDDEN_MODULE_RULE = "reaches src/daemon/ (transport, send and Telegram-client code live there)";

const TELEGRAM_API_URL_RE = /["']https?:\/\/api\.telegram\.org/;
const GET_UPDATES_CALL_RE = /\.getUpdates\s*\(/;

/** Anchored on the quoted module specifier, so static `from`, bare `import`, dynamic `import()` and `require()` all match. */
const FS_SPECIFIER_RE = /["'](?:node:)?fs(?:\/promises)?["']/;
const SQLITE_SPECIFIER_RE = /["']node:sqlite["']/;
const KEYRING_SPECIFIER_RE = /["']@napi-rs\/keyring["']/;
const CHILD_PROCESS_SPECIFIER_RE = /["'](?:node:)?child_process["']/;

const isForbiddenModule = (path: string): boolean => path.startsWith(FORBIDDEN_PREFIX);

interface Rule {
	readonly name: string;
	readonly violates: (path: string, source: string) => boolean;
	/** Synthetic `[path, source]` modules that MUST each trip this rule: no rule is an unfalsifiable claim (ADR-12). */
	readonly seeds: ReadonlyArray<readonly [path: string, source: string]>;
}

const RULES: readonly Rule[] = [
	{
		name: FORBIDDEN_MODULE_RULE,
		violates: (path) => isForbiddenModule(path),
		seeds: [
			["src/daemon/transport/direct.js", "export {};"],
			["src/daemon/send/send-path.js", "export {};"],
			["src/daemon/telegram.js", "export {};"],
		],
	},
	{
		name: "references child_process",
		violates: (_path, source) => hasChildProcessReference(source) || CHILD_PROCESS_SPECIFIER_RE.test(source),
		seeds: [["channel-pi/main.js", 'import { spawn } from "node:child_process";']],
	},
	{
		name: "references fs or fs/promises outside the allow-list",
		violates: (path, source) => FS_SPECIFIER_RE.test(source) && !FS_ALLOWLIST.includes(path),
		seeds: [
			["channel-pi/main.js", 'import { readFileSync } from "node:fs";'],
			["channel-pi/main.js", 'import "node:fs";'],
			["channel-pi/main.js", 'import fs from "fs";'],
			["channel-pi/main.js", 'import { readFile } from "node:fs/promises";'],
			["channel-pi/main.js", 'const fs = await import("node:fs");'],
			["channel-pi/main.js", 'const fs = require("fs");'],
		],
	},
	{
		name: "references node:sqlite",
		violates: (_path, source) => SQLITE_SPECIFIER_RE.test(source),
		seeds: [["channel-pi/main.js", 'import { DatabaseSync } from "node:sqlite";']],
	},
	{
		name: "references @napi-rs/keyring",
		violates: (_path, source) => KEYRING_SPECIFIER_RE.test(source),
		seeds: [["channel-pi/main.js", 'import keyring from "@napi-rs/keyring";']],
	},
	{
		name: "references a bare specifier outside the reviewed allow-list",
		violates: (_path, source) => bareSpecifiers(source).some((s) => !ALLOWED_BARE_SPECIFIERS.includes(s)),
		seeds: [["channel-pi/main.js", 'import cp from "cross-spawn";']],
	},
	{
		name: "arms a timer outside the allow-list",
		violates: (path, source) => hasAutonomousTimerReference(source) && !TIMER_ALLOWLIST.includes(path),
		seeds: [["channel-pi/main.js", "setTimeout(tick, 1000);"]],
	},
	{
		name: "references node:timers",
		violates: (_path, source) => hasTimersModuleReference(source),
		seeds: [["channel-pi/main.js", 'import { scheduler } from "node:timers/promises";']],
	},
	{
		name: "references the Telegram API URL",
		violates: (_path, source) => TELEGRAM_API_URL_RE.test(source),
		seeds: [["channel-pi/main.js", 'const url = "https://api.telegram.org/bot";']],
	},
	{
		name: "calls .getUpdates(",
		violates: (_path, source) => GET_UPDATES_CALL_RE.test(source),
		seeds: [["channel-pi/main.js", "await client.getUpdates(params);"]],
	},
	{
		name: `calls .sendMessage( outside ${RING_MODULE}, or more than ${RING_CALL_SITES} time(s) there`,
		violates: (path, source) => {
			const sites = sendMessageCallLines(source).length;
			return path === RING_MODULE ? sites > RING_CALL_SITES : sites > 0;
		},
		seeds: [
			["channel-pi/main.js", "return this.client.sendMessage(params);"],
			[RING_MODULE, "a.sendMessage(x);\nb.sendMessage(y);"],
		],
	},
];

/** Every rule the closure breaks, as `<path>: <rule>` labels; `[]` means clean. Pure, so the real bundle and the seeds share one judge. */
function findViolations(contents: ReadonlyMap<string, string>): string[] {
	return [...contents].flatMap(([path, source]) =>
		RULES.filter((rule) => rule.violates(path, source)).map((rule) => `${path}: ${rule.name}`),
	);
}

const relToDist = (file: string, distDir: string = DIST_DIR): string => relative(distDir, file).split("\\").join("/");

function bundleContents(entry: string, distDir: string = DIST_DIR): Map<string, string> {
	const contents = new Map<string, string>();
	for (const file of computeClosure(join(distDir, entry))) {
		contents.set(relToDist(file, distDir), readFileSync(file, "utf8"));
	}
	return contents;
}

function pathsMatching(contents: ReadonlyMap<string, string>, predicate: (source: string) => boolean): string[] {
	return [...contents]
		.filter(([, source]) => predicate(source))
		.map(([path]) => path)
		.sort();
}

test("channel-pi bundle: closure is non-vacuous and reaches the expected sentinel modules", () => {
	const contents = bundleContents(ENTRY);
	assert.ok(
		contents.size >= MIN_BUNDLE_FILES,
		`channel-pi closure has only ${contents.size} files, expected at least ${MIN_BUNDLE_FILES} — the closure walker may have silently truncated`,
	);
	for (const sentinel of SENTINEL_MODULES) {
		assert.ok(contents.has(sentinel), `expected ${sentinel} in the channel-pi closure`);
	}
});

test("channel-pi bundle: no module reaches src/daemon/, child_process, node:sqlite, keyring, foreign fs or timers, or a Telegram call", () => {
	assert.deepEqual(findViolations(bundleContents(ENTRY)), []);
});

test("channel-pi bundle: fs is confined to the two shipped readers, in every import form", () => {
	assert.deepEqual(pathsMatching(bundleContents(ENTRY), (source) => FS_SPECIFIER_RE.test(source)), FS_ALLOWLIST);
});

test("channel-pi bundle: the ring is the only .sendMessage( call site in the whole closure", () => {
	const contents = bundleContents(ENTRY);
	assert.deepEqual(
		pathsMatching(contents, (source) => sendMessageCallLines(source).length > 0),
		[RING_MODULE],
		"the adapter may reach the host's message API in exactly one module",
	);
	assert.equal(
		sendMessageCallLines(contents.get(RING_MODULE) ?? "").length,
		RING_CALL_SITES,
		"and exactly once there, so a second escape hatch fails this test",
	);
});

test("channel-pi bundle: only the shipped paced loop arms a timer, and it cannot reach src/daemon/", () => {
	const contents = bundleContents(ENTRY);
	assert.deepEqual(pathsMatching(contents, hasAutonomousTimerReference), TIMER_ALLOWLIST);
	assert.deepEqual(pathsMatching(contents, hasTimersModuleReference), []);

	for (const timerModule of TIMER_ALLOWLIST) {
		const ownClosure = [...bundleContents(timerModule).keys()];
		// A walk that followed no import would satisfy the exclusion below vacuously.
		assert.notDeepEqual(ownClosure, [timerModule], `${timerModule}'s own closure holds nothing but itself`);
		assert.deepEqual(ownClosure.filter(isForbiddenModule), [], `${timerModule}'s own closure must exclude src/daemon/ modules`);
	}
});

test("channel-pi bundle: src/daemon/ exists in dist/, so the whole-tree ban protects something real", () => {
	assert.ok(existsSync(join(DIST_DIR, FORBIDDEN_PREFIX)), `${FORBIDDEN_PREFIX} does not exist under dist/, so banning it would protect nothing`);
});

for (const rule of RULES) {
	test(`channel-pi bundle: the "${rule.name}" rule is non-vacuous (seeded negatives)`, () => {
		assert.ok(rule.seeds.length > 0, "a rule without a seed cannot be shown to fail");
		for (const [path, source] of rule.seeds) {
			const violations = findViolations(new Map([[path, source]]));
			assert.ok(
				violations.includes(`${path}: ${rule.name}`),
				`expected "${path}: ${rule.name}" among violations, got: ${violations.join(", ") || "none"}`,
			);
		}
	});
}

test("channel-pi bundle: the allow-listed modules are not violations (seeded positives)", () => {
	const contents = new Map([
		["channel/doorbell-loop.js", "const timer = setTimeout(resolve, delayMs);"],
		["src/client/binding.js", 'import { readFileSync } from "node:fs";'],
		["src/client/run-file.js", 'import { readFileSync } from "node:fs";'],
		[RING_MODULE, "deps.pi.sendMessage(message, options);"],
	]);
	assert.deepEqual(findViolations(contents), []);
});

test("channel-pi bundle: the walk catches a forbidden module two hops from the entry (temp-dir fixture)", () => {
	const distDir = mkdtempSync(join(tmpdir(), "channel-pi-bundle-"));
	try {
		const files = {
			"channel-pi/main.js": 'import "./mid.js";',
			"channel-pi/mid.js": 'import "../src/daemon/transport/x.js";',
			"src/daemon/transport/x.js": "export {};",
		};
		for (const [relPath, source] of Object.entries(files)) {
			const file = join(distDir, relPath);
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, source);
		}

		const contents = bundleContents(ENTRY, distDir);

		assert.deepEqual([...contents.keys()].sort(), Object.keys(files).sort());
		assert.deepEqual(findViolations(contents), [`src/daemon/transport/x.js: ${FORBIDDEN_MODULE_RULE}`]);
	} finally {
		rmSync(distDir, { recursive: true, force: true });
	}
});
