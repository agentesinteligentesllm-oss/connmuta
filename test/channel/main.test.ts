import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { DaemonLink, DoorbellResponse } from "../../channel/daemon-link.js";
import { parseChannelArgs, runChannel, type ParsedChannelArgs, type RunChannelOptions } from "../../channel/main.js";
import { buildNotification, CHANNEL_INSTRUCTIONS } from "../../channel/notify.js";
import {
	CHANNEL_HOST_LABEL,
	CHANNEL_SERVER_NAME,
	EXIT_PROJECT_MISMATCH,
	EXIT_UNBOUND_PROJECT,
	EXIT_USAGE,
	PROJECT_FILE_NAME,
	PROJECT_FILE_SCHEMA_VERSION,
} from "../../src/shared/constants.js";
import type { ProjectFile } from "../../src/shared/project-file.js";
import { computeRosterHash } from "../../src/shared/roster-hash.js";
import { SERVER_VERSION } from "../../src/shared/version.js";
import {
	hasAutonomousTimerReference,
	hasChildProcessReference,
	hasFsModuleReference,
	hasTimersModuleReference,
	hasUnboundedLoopReference,
} from "../security/predicates.js";

/**
 * `channel/main.ts` (F4 PR-05d, design D6/D7/D9, spec `channel-doorbell`; Alpha CONSENSUS
 * `bus-v2-f4-apply-pr05d-001`). A scripted link plays the daemon, the SDK `Client` over an in-memory
 * transport plays Claude Code, and an injected emitter plays the process signals, so the core is driven
 * with no network, no real stdio and no real signal. Three cases spawn the built entry to prove what an
 * in-process run cannot: stdout stays empty and the process ends on its own. Every id is a placeholder
 * (AGENTS.md §3).
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ENTRY = `${REPO_ROOT}dist/channel/main.js`;
/** Generous ceiling for an in-process shutdown; a run that ignores its bound blows far past it. */
const PROMPT_BOUND_MS = 2000;
/** Covers a cold `node` start plus the SDK import on a slow machine. */
const REAL_ENTRY_BOUND_MS = 15_000;
/** A child that outlives this is killed, so a regression fails the test instead of leaving a process that hangs the runner. */
const CHILD_KILL_MS = 10_000;
/** Test-only shutdown bound: a real wait, but short enough to keep the suite fast. */
const SHORT_SHUTDOWN_MS = 50;
const PROJECT_ID = "prj-example";
const GROUP_ID = -1001234567890;
const ROSTER = [{ agent_id: "@claude", user_id: 111, username: "opuser" }];
const FILE: ProjectFile = { schema_version: PROJECT_FILE_SCHEMA_VERSION, project_id: PROJECT_ID, group_id: GROUP_ID, roster: ROSTER };
const PROJECT_FILE_TEXT = JSON.stringify(FILE);
/** Planted in a rejected project file: the refusal line may count its problems but must never echo them. */
const LEAK_MARKER = "hunter2-marker";
/** Everything `channel/main.ts` may import, one anchored matcher per source; a specifier that none accepts breaks the adapter closure. */
const ALLOWED_SPECIFIERS: readonly RegExp[] = [
	/^node:events$/, // the signal emitter's type
	/^@modelcontextprotocol\/sdk\/server\/(?:index|stdio)\.js$/, // the MCP server and its stdio transport
	/^@modelcontextprotocol\/sdk\/shared\/transport\.js$/, // the transport type
	/^\.\/(?:daemon-link|doorbell-loop|notify)\.js$/, // the adapter's own modules
	/^\.\.\/src\/shared\/[\w-]+\.js$/, // any shared module: pure code, no daemon, spawn or timer
	/^\.\.\/src\/client\/binding\.js$/, // the project-file resolver, the one thin-client module the adapter reuses
];
const FORBIDDEN_SPECIFIER = /client\/(?:main|run-state|spawn|handshake|ipc-stub)|daemon\//;
/**
 * Floor for the import scan, below the module's real import count (11 when this was written) so dropping an
 * import does not break the test, yet above what a scan whose pattern stopped matching would still find.
 */
const MIN_SCANNED_SPECIFIERS = 8;

const bell = (covered: number): DoorbellResponse => ({
	count: 1,
	senders: ["@alpha-one"],
	types: ["REQUEST"],
	threads: ["0123456789ab"],
	covered_through_seq: covered,
	saturated: false,
});

type Read = (afterSeq: number, signal: AbortSignal | undefined) => Promise<DoorbellResponse>;
/** Stays in flight until the caller aborts, then rejects the way the real link's `ABORTED` does. */
const untilAborted: Read = (_afterSeq, signal) =>
	new Promise((_resolve, reject) => {
		signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
	});
/** Ignores the signal and never settles: the handshake-in-flight case the shutdown bound exists for. */
const hung: Read = () => new Promise(() => undefined);

function tempDir(t: TestContext): string {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-channel-main-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

/** A link and binding resolver that record what `runChannel` hands them; the link is lazy, so no network is possible. */
function scripted(read: Read = untilAborted) {
	const seen = {
		reads: [] as Array<{ afterSeq: number; signal: AbortSignal | undefined }>,
		closeCalls: 0,
		identities: [] as unknown[],
		bindingRequests: [] as unknown[],
		polled: Promise.withResolvers<void>(),
	};
	const link: DaemonLink = {
		commitCursor: async (commitSeq) => commitSeq ?? 0,
		readDoorbell: (afterSeq, _timeoutS, signal) => {
			seen.reads.push({ afterSeq, signal });
			seen.polled.resolve();
			return read(afterSeq, signal);
		},
		close: async () => {
			seen.closeCalls += 1;
		},
	};
	const wiring: Pick<RunChannelOptions, "resolveProjectBindingImpl" | "createLinkImpl"> = {
		resolveProjectBindingImpl: (request) => {
			seen.bindingRequests.push(request);
			return { ok: true, path: PROJECT_FILE_NAME, file: FILE };
		},
		createLinkImpl: (deps) => {
			seen.identities.push(deps.identity);
			return link;
		},
	};
	return { seen, wiring };
}

const forbiddenLink = (): never => {
	throw new Error("no link may be created on a refusal");
};

/** Runs the core against the scripted link with a connected in-memory `Client`; resolves once the client's `initialize` completes. */
async function startChannel({ read, ...overrides }: Partial<RunChannelOptions> & { read?: Read } = {}) {
	const { seen, wiring } = scripted(read);
	const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "test-client", version: "0.0.0" });
	const notifications: unknown[] = [];
	const rang = Promise.withResolvers<void>();
	client.fallbackNotificationHandler = async ({ method, params }) => {
		notifications.push({ method, params });
		rang.resolve();
	};
	const stderr: string[] = [];
	const signals = new EventEmitter();
	const running = runChannel({
		project: PROJECT_ID,
		stderr: (line) => stderr.push(line),
		transport: serverTransport,
		signals,
		...wiring,
		...overrides,
	});
	await client.connect(clientTransport);
	return { client, running, stderr, signals, notifications, rang: rang.promise, seen };
}
type Rig = Awaited<ReturnType<typeof startChannel>>;

const listeners = (rig: Rig): number => rig.signals.listenerCount("SIGINT") + rig.signals.listenerCount("SIGTERM");

test("registers only the claude/channel experimental capability, never a permission key, under its own name and instructions", { timeout: PROMPT_BOUND_MS }, async () => {
	const rig = await startChannel();
	const capabilities = rig.client.getServerCapabilities();
	assert.ok(capabilities?.experimental !== undefined && Object.hasOwn(capabilities.experimental, "claude/channel"));
	assert.equal(Object.hasOwn(capabilities.experimental, "claude/channel/permission"), false, "omitted as a key, not false");
	assert.deepEqual(capabilities, { experimental: { "claude/channel": {} } });
	assert.deepEqual(rig.client.getServerVersion(), { name: CHANNEL_SERVER_NAME, version: SERVER_VERSION });
	assert.equal(rig.client.getInstructions(), CHANNEL_INSTRUCTIONS);
	await rig.client.close();
	assert.equal(await rig.running, 0);
});

test("resolves the binding with the thin client's resolver inputs and hands the link the identity derived from it", { timeout: PROMPT_BOUND_MS }, async () => {
	const rig = await startChannel({ cwd: "some-dir" });
	// `requireProjectFlag: true` is ADR-0033's asymmetry: this bin's argv is written per binding by the
	// daemon, not once per tree by a host config, so it keeps the pre-amendment strict `--project`.
	assert.deepEqual(rig.seen.bindingRequests, [{ project: PROJECT_ID, cwd: "some-dir", requireProjectFlag: true }]);
	assert.deepEqual(rig.seen.identities, [
		{ projectId: PROJECT_ID, groupId: GROUP_ID, rosterHash: computeRosterHash(ROSTER), host: CHANNEL_HOST_LABEL },
	]);
	await rig.client.close();
	await rig.running;
});

test("a ring from the link reaches the client as one notifications/claude/channel event with content and meta", { timeout: PROMPT_BOUND_MS }, async () => {
	const ring = bell(7);
	const answers = [ring];
	const rig = await startChannel({
		read: (afterSeq, signal) => {
			const next = answers.shift();
			return next === undefined ? untilAborted(afterSeq, signal) : Promise.resolve(next);
		},
	});
	await rig.rang;
	const expected = buildNotification(ring);
	assert.deepEqual(rig.notifications, [
		{ method: "notifications/claude/channel", params: { content: expected?.content, meta: expected?.meta } },
	]);
	await rig.client.close();
	assert.equal(await rig.running, 0);
	assert.equal(rig.notifications.length, 1, "the adapter wrote nothing else to the transport");
});

test("without a project it refuses with EXIT_USAGE before resolving a binding or creating a link", async () => {
	const stderr: string[] = [];
	const exitCode = await runChannel({
		project: undefined,
		stderr: (line) => stderr.push(line),
		resolveProjectBindingImpl: forbiddenLink,
		createLinkImpl: forbiddenLink,
	});
	assert.equal(exitCode, EXIT_USAGE);
	assert.deepEqual(stderr, [`${CHANNEL_SERVER_NAME}: --project is required`]);
});

const REFUSALS: ReadonlyArray<{ name: string; setup: (dir: string) => void; exitCode: number; message: RegExp }> = [
	{ name: "no project file exists above the directory", setup: () => undefined, exitCode: EXIT_UNBOUND_PROJECT, message: /found above/ },
	{
		name: "the project file is bound to another project",
		setup: (dir) => writeFileSync(join(dir, PROJECT_FILE_NAME), PROJECT_FILE_TEXT.replace(PROJECT_ID, "prj-other")),
		exitCode: EXIT_PROJECT_MISMATCH,
		message: /bound to 'prj-other', expected 'prj-example'/,
	},
	{
		name: "the project file is invalid",
		setup: (dir) => writeFileSync(join(dir, PROJECT_FILE_NAME), JSON.stringify({ ...FILE, leak: LEAK_MARKER })),
		exitCode: EXIT_UNBOUND_PROJECT,
		message: /not a valid project file \(\d+ problem\(s\)\)/,
	},
	{
		name: "the project file cannot be read",
		setup: (dir) => mkdirSync(join(dir, PROJECT_FILE_NAME)),
		exitCode: EXIT_UNBOUND_PROJECT,
		message: /could not be read/,
	},
];
for (const refusal of REFUSALS) {
	test(`with the real resolver it exits ${refusal.exitCode} when ${refusal.name}, creating no link`, { timeout: PROMPT_BOUND_MS }, async (t) => {
		const cwd = tempDir(t);
		refusal.setup(cwd);
		const stderr: string[] = [];
		const exitCode = await runChannel({ project: PROJECT_ID, cwd, stderr: (line) => stderr.push(line), createLinkImpl: forbiddenLink });
		assert.equal(exitCode, refusal.exitCode);
		assert.equal(stderr.length, 1);
		assert.ok(stderr[0]?.startsWith(`${CHANNEL_SERVER_NAME}: `));
		assert.match(stderr[0] ?? "", refusal.message);
		assert.equal(stderr[0]?.includes(LEAK_MARKER), false, "problems are counted, never echoed");
	});
}

const SHUTDOWN_TRIGGERS: ReadonlyArray<[string, (rig: Rig) => unknown]> = [
	["the client closing the transport", (rig) => rig.client.close()],
	["SIGINT", (rig) => rig.signals.emit("SIGINT")],
	["SIGTERM", (rig) => rig.signals.emit("SIGTERM")],
];
for (const [name, trigger] of SHUTDOWN_TRIGGERS) {
	test(`${name} aborts the in-flight poll, closes the link once, exits 0 and leaves no signal listener`, { timeout: PROMPT_BOUND_MS }, async () => {
		const rig = await startChannel();
		await rig.seen.polled;
		assert.equal(rig.seen.reads[0]?.signal?.aborted, false);
		assert.equal(listeners(rig), 2, "one listener per shutdown signal while running");
		await trigger(rig);
		assert.equal(await rig.running, 0);
		assert.equal(rig.seen.reads[0]?.signal?.aborted, true);
		assert.equal(rig.seen.closeCalls, 1);
		assert.equal(listeners(rig), 0);
		assert.deepEqual(rig.stderr, []);
	});
}

test("a poll that ignores the abort cannot hold the exit past the shutdown bound", { timeout: PROMPT_BOUND_MS }, async () => {
	const rig = await startChannel({ read: hung, shutdownTimeoutMs: SHORT_SHUTDOWN_MS });
	await rig.seen.polled;
	await rig.client.close();
	assert.equal(await rig.running, 0);
	assert.equal(rig.seen.closeCalls, 1, "the link is still closed once the bound elapses");
});

test("a crashed doorbell loop is reported, shuts everything down and exits 1", { timeout: PROMPT_BOUND_MS }, async () => {
	const malformed = { ...bell(1), senders: null } as unknown as DoorbellResponse;
	const rig = await startChannel({ read: async () => malformed });
	assert.equal(await rig.running, 1);
	assert.equal(rig.stderr.length, 1);
	assert.ok(rig.stderr[0]?.startsWith(`${CHANNEL_SERVER_NAME}: doorbell loop stopped:`));
	assert.equal(rig.seen.closeCalls, 1);
	assert.equal(listeners(rig), 0);
});

test("a transport that fails to start ends with one message-only stderr line and exit 1, closing the link", { timeout: PROMPT_BOUND_MS }, async () => {
	const failing: Transport = {
		start: async () => {
			throw new Error("simulated transport failure");
		},
		send: async () => undefined,
		close: async () => undefined,
	};
	const { seen, wiring } = scripted();
	const stderr: string[] = [];
	const exitCode = await runChannel({ project: PROJECT_ID, stderr: (line) => stderr.push(line), transport: failing, ...wiring });
	assert.equal(exitCode, 1);
	assert.deepEqual(stderr, [`${CHANNEL_SERVER_NAME}: simulated transport failure`]);
	assert.equal(seen.closeCalls, 1);
});

const ARGS_CASES: ReadonlyArray<[string, string[], ParsedChannelArgs]> = [
	["--project with a separate value", ["--project", "x"], { ok: true, project: "x" }],
	["--project=value", ["--project=x"], { ok: true, project: "x" }],
	["no arguments, left to the core's own refusal", [], { ok: true, project: undefined }],
	["--project without a value", ["--project"], { ok: false }],
	["an unknown flag", ["--verbose"], { ok: false }],
	["an extra positional", ["--project", "x", "y"], { ok: false }],
	["a repeated --project", ["--project", "x", "--project=y"], { ok: false }],
];
for (const [name, argv, expected] of ARGS_CASES) {
	test(`parseChannelArgs reads ${name}`, () => {
		assert.deepEqual(parseChannelArgs(argv), expected);
	});
}

const ENTRY_CASES: ReadonlyArray<{ name: string; args: string[]; exitCode: number; message: RegExp }> = [
	{ name: "no arguments", args: [], exitCode: EXIT_USAGE, message: /--project is required/ },
	{ name: "an unknown flag", args: ["--bogus"], exitCode: EXIT_USAGE, message: /usage: / },
	{ name: "an unbound project", args: ["--project", "some-id"], exitCode: EXIT_UNBOUND_PROJECT, message: /found above/ },
];
for (const { name, args, exitCode, message } of ENTRY_CASES) {
	test(`the built entry exits ${exitCode} for ${name}, with one stderr line and nothing on stdout`, { timeout: REAL_ENTRY_BOUND_MS }, (t) => {
		const result = spawnSync(process.execPath, [ENTRY, ...args], { cwd: tempDir(t), encoding: "utf8" });
		assert.equal(result.status, exitCode);
		assert.equal(result.stdout, "");
		assert.match(result.stderr, message);
	});
}

test("the built entry exits 0 by itself when stdin ends, which the SDK's stdio transport never reports", { timeout: REAL_ENTRY_BOUND_MS }, async (t) => {
	const cwd = tempDir(t);
	writeFileSync(join(cwd, PROJECT_FILE_NAME), PROJECT_FILE_TEXT);
	// An empty home keeps the child away from any real daemon run file.
	const env = { ...process.env, HOME: cwd, USERPROFILE: cwd };
	const child = spawn(process.execPath, [ENTRY, "--project", PROJECT_ID], { cwd, env, timeout: CHILD_KILL_MS });
	t.after(() => child.kill());
	let stdout = "";
	child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
	const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
	child.stdin.end();
	assert.equal(await exited, 0);
	assert.equal(stdout, "");
});

test("channel/main.ts stays inside the adapter closure: shebang, no spawn, timer, loop, fs or stdout, one guarded exit, imports allow-listed", () => {
	const source = readFileSync(`${REPO_ROOT}channel/main.ts`, "utf8");
	assert.match(source, /^#!\/usr\/bin\/env node\r?\n/);
	assert.equal(hasChildProcessReference(source), false);
	assert.equal(hasTimersModuleReference(source), false);
	assert.equal(hasFsModuleReference(source), false);
	assert.equal(hasUnboundedLoopReference(source), false);
	assert.equal(hasAutonomousTimerReference(source), false, "doorbell-loop.ts is the only channel file that may arm a timer");
	assert.equal(source.includes("process.stdout"), false, "stdout carries MCP frames only");
	assert.equal([...source.matchAll(/process\.exit\(/g)].length, 1);
	assert.ok(source.indexOf("process.exit(") > source.indexOf("if (import.meta.main)"), "the only exit is in the guarded entry, never the core");
	const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "");
	assert.ok(specifiers.length >= MIN_SCANNED_SPECIFIERS, "non-vacuous: the scan must see the module's imports");
	for (const specifier of specifiers) {
		assert.ok(
			ALLOWED_SPECIFIERS.some((allowed) => allowed.test(specifier)),
			`import outside the allow-list: ${specifier}`,
		);
		assert.doesNotMatch(specifier, FORBIDDEN_SPECIFIER);
	}
});
