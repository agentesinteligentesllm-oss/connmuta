import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { DoorbellResponse } from "../../channel/daemon-link.js";
import { abortableSleep, DoorbellWatcher, type DoorbellWatcherDeps } from "../../channel/doorbell-loop.js";
import { buildNotification, type ChannelNotification } from "../../channel/notify.js";
import { CHANNEL_RETRY_BACKOFF_SECONDS, FETCH_LONGPOLL_MAX_SECONDS } from "../../src/shared/constants.js";
import {
	hasAutonomousTimerReference,
	hasChildProcessReference,
	hasFsModuleReference,
	hasTimersModuleReference,
	hasUnboundedLoopReference,
} from "../security/predicates.js";

/**
 * `channel/doorbell-loop.ts` (F4 PR-05c, design D7/D11/D12, spec `channel-doorbell`; Alpha CONSENSUS
 * `bus-v2-f4-apply-pr05c-001`). A scripted link, deliver and sleep play the daemon and the host, so no
 * network call is made and no backoff is really waited. Every id is a placeholder (AGENTS.md §3).
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MILLISECONDS_PER_SECOND = 1000;
const BACKOFF_MS = CHANNEL_RETRY_BACKOFF_SECONDS * MILLISECONDS_PER_SECOND;
/** The seq the fake cursor row holds when the watcher bootstraps. */
const BOOTSTRAP_SEQ = 5;
/** A real-timer sleep long enough to tell "waited" from "returned at once", short enough to keep the suite fast. */
const SHORT_SLEEP_MS = 20;
/** A sleep nobody waits out: only an abort may end it inside a test. */
const LONG_SLEEP_MS = 60 * MILLISECONDS_PER_SECOND;
/** Generous ceiling for anything that must return promptly; well below both `LONG_SLEEP_MS` and `BACKOFF_MS`. */
const PROMPT_BOUND_MS = 1000;
const ALLOWED_SPECIFIER = /^(?:\.\/daemon-link\.js|\.\/notify\.js|\.\.\/src\/shared\/constants\.js)$/;

const bell = (covered: number, overrides: Partial<DoorbellResponse> = {}): DoorbellResponse => ({
	count: 1,
	senders: ["@alpha-one"],
	types: ["REQUEST"],
	threads: ["0123456789ab"],
	covered_through_seq: covered,
	saturated: false,
	...overrides,
});
const quiet = (covered: number): DoorbellResponse => bell(covered, { count: 0, senders: [], types: [], threads: [] });
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const activeTimers = (): number => process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
const abortListeners = (signal: AbortSignal): number => getEventListeners(signal, "abort").length;

/** One scripted `readDoorbell` answer: a summary, an error to throw, or a function that may abort before throwing. */
type ReadStep = DoorbellResponse | Error | ((controller: AbortController) => never);

interface RigOptions {
	readonly reads?: readonly ReadStep[];
	/** Answers to successive `commitCursor()` calls; once empty, `BOOTSTRAP_SEQ`. */
	readonly bootstrap?: ReadonlyArray<number | Error>;
	readonly commit?: (seq: number) => Promise<number>;
	readonly deliver?: (notification: ChannelNotification) => Promise<void>;
	/** `instant` records and returns; `until-abort` records and waits for the abort; `default` injects no sleep at all. */
	readonly sleep?: "instant" | "until-abort" | "default";
}

/**
 * A watcher over recording fakes. What ends a scripted `run` is exhaustion: the read after the last step aborts
 * the signal and throws, which the watcher must treat as a silent stop, so that read is the last entry of `readArgs`.
 */
function rig(options: RigOptions = {}) {
	const { commit = async (seq: number) => seq, deliver = async () => undefined, sleep = "instant" } = options;
	const script = [...(options.reads ?? [])];
	const bootstrap = [...(options.bootstrap ?? [BOOTSTRAP_SEQ])];
	const controller = new AbortController();
	const log: string[] = [];
	const readArgs: Array<[number, number, AbortSignal | undefined]> = [];
	const delivered: ChannelNotification[] = [];
	const sleeps: number[] = [];
	const warnings: string[] = [];
	let sleepEntered!: () => void;
	const sleeping = new Promise<void>((resolve) => (sleepEntered = resolve));

	const link: DoorbellWatcherDeps["link"] = {
		commitCursor: async (...args: [commitSeq?: number]) => {
			log.push(`commit(${args.map(String).join()})`);
			if (args[0] !== undefined) {
				return commit(args[0]);
			}
			const next = bootstrap.shift() ?? BOOTSTRAP_SEQ;
			if (next instanceof Error) {
				throw next;
			}
			return next;
		},
		readDoorbell: async (afterSeq, timeoutS, signal) => {
			log.push(`read(${afterSeq})`);
			readArgs.push([afterSeq, timeoutS, signal]);
			const step = script.shift();
			if (step === undefined) {
				controller.abort();
				throw new Error("script exhausted");
			}
			if (step instanceof Error) {
				throw step;
			}
			return typeof step === "function" ? step(controller) : step;
		},
	};
	const fakeSleep: NonNullable<DoorbellWatcherDeps["sleep"]> = async (ms, signal) => {
		sleeps.push(ms);
		sleepEntered();
		if (sleep === "until-abort" && !signal.aborted) {
			await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
		}
	};
	const watcher = new DoorbellWatcher({
		link,
		deliver: async (notification) => {
			log.push("deliver");
			delivered.push(notification);
			await deliver(notification);
		},
		sleep: sleep === "default" ? undefined : fakeSleep,
		warn: (message) => void warnings.push(message),
	});
	return { watcher, controller, log, readArgs, delivered, sleeps, warnings, sleeping };
}

test("the first tick ensures the cursor with commitCursor() and no argument, then reads after that seq with the long-poll bound and the signal", async () => {
	const r = rig({ reads: [quiet(9)] });
	assert.equal(await r.watcher.tick(r.controller.signal), "silent");
	assert.deepEqual(r.log, ["commit()", "read(5)"]);
	assert.deepEqual(r.readArgs, [[BOOTSTRAP_SEQ, FETCH_LONGPOLL_MAX_SECONDS, r.controller.signal]]);
});

test("a failed bootstrap returns link_failed with a warning, and the next tick retries the bootstrap", async () => {
	const r = rig({ bootstrap: [new Error("no live daemon run file")], reads: [quiet(5)] });
	assert.equal(await r.watcher.tick(), "link_failed");
	assert.deepEqual(r.warnings, ["doorbell link failed: no live daemon run file"]);
	assert.deepEqual(r.log, ["commit()"]);
	assert.equal(await r.watcher.tick(), "silent");
	assert.deepEqual(r.log, ["commit()", "commit()", "read(5)"]);
});

test("a ring is bootstrap, read, deliver, then a commit of covered_through_seq, and the next read starts there", async () => {
	const r = rig({ reads: [bell(8), quiet(8)] });
	assert.equal(await r.watcher.tick(), "rang");
	assert.deepEqual(r.log, ["commit()", "read(5)", "deliver", "commit(8)"]);
	assert.deepEqual(r.delivered, [buildNotification(bell(8))]);
	await r.watcher.tick();
	assert.deepEqual(r.log.slice(4), ["read(8)"]);
});

test("the commit happens strictly after deliver resolves", async () => {
	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	const r = rig({ reads: [bell(8)], deliver: () => held });
	const ticking = r.watcher.tick();
	await flush();
	assert.deepEqual(r.log, ["commit()", "read(5)", "deliver"]);
	release();
	assert.equal(await ticking, "rang");
	assert.equal(r.log.at(-1), "commit(8)");
});

test("a rejected deliver returns deliver_failed, commits nothing, and the next tick re-reads the same after_seq and re-rings", async () => {
	let rejectNext = true;
	const r = rig({
		reads: [bell(8), bell(8)],
		deliver: async () => {
			if (rejectNext) {
				rejectNext = false;
				throw new Error("stdio closed");
			}
		},
	});
	assert.equal(await r.watcher.tick(), "deliver_failed");
	assert.deepEqual(r.warnings, ["doorbell deliver failed: stdio closed"]);
	assert.deepEqual(r.log, ["commit()", "read(5)", "deliver"]);
	assert.equal(await r.watcher.tick(), "rang");
	assert.deepEqual(r.readArgs.map(([afterSeq]) => afterSeq), [5, 5]);
	assert.equal(r.delivered.length, 2);
	assert.deepEqual(r.delivered[0], r.delivered[1]);
	assert.equal(r.log.at(-1), "commit(8)");
});

test("a failed commit after a delivered ring warns, still returns rang, and still advances the watermark (D12)", async () => {
	const r = rig({ reads: [bell(8), quiet(8)], commit: () => Promise.reject(new Error("cursor row gone")) });
	assert.equal(await r.watcher.tick(), "rang");
	assert.deepEqual(r.warnings, ["doorbell cursor commit failed: cursor row gone"]);
	await r.watcher.tick();
	assert.deepEqual(r.readArgs.map(([afterSeq]) => afterSeq), [5, 8]);
	assert.equal(r.delivered.length, 1, "no duplicate ring");
});

test("count 0 is silent: no deliver, no commit past the bootstrap, and the next read starts at the advanced seq (D11)", async () => {
	const r = rig({ reads: [quiet(9), quiet(12)] });
	assert.equal(await r.watcher.tick(), "silent");
	assert.equal(await r.watcher.tick(), "silent");
	assert.deepEqual(r.log, ["commit()", "read(5)", "read(9)"]);
	assert.deepEqual(r.delivered, []);
	assert.deepEqual(r.warnings, []);
});

test("a failed read returns link_failed and warns with the error message", async () => {
	const r = rig({ reads: [new Error("connection refused")] });
	assert.equal(await r.watcher.tick(r.controller.signal), "link_failed");
	assert.deepEqual(r.warnings, ["doorbell link failed: connection refused"]);
});

test("a rejection that is not an Error is reported as an unknown error", async () => {
	const failedRead = rig({ reads: [() => { throw "not an error"; }] });
	const failedDeliver = rig({ reads: [bell(8)], deliver: () => Promise.reject("not an error") });
	await failedRead.watcher.tick();
	await failedDeliver.watcher.tick();
	assert.deepEqual(failedRead.warnings, ["doorbell link failed: unknown error"]);
	assert.deepEqual(failedDeliver.warnings, ["doorbell deliver failed: unknown error"]);
});

const BACKOFF_CASES: ReadonlyArray<readonly [string, RigOptions, number]> = [
	["a failed read", { reads: [new Error("boom"), new Error("boom")] }, 2],
	["a failed bootstrap", { bootstrap: [new Error("boom")] }, 1],
	["a rejected deliver", { reads: [bell(8), bell(8)], deliver: () => Promise.reject(new Error("boom")) }, 2],
	["a ring", { reads: [bell(8)] }, 0],
	["a silent tick", { reads: [quiet(8)] }, 0],
];

for (const [name, options, backoffs] of BACKOFF_CASES) {
	test(`run makes ${backoffs} backoff sleep(s) of CHANNEL_RETRY_BACKOFF_SECONDS after ${name}`, async () => {
		const r = rig(options);
		await r.watcher.run(r.controller.signal);
		assert.deepEqual(r.sleeps, Array<number>(backoffs).fill(BACKOFF_MS));
	});
}

test("a saturated page is followed by an immediate re-read with no sleep in between", async () => {
	const r = rig({ reads: [bell(8, { count: 3, saturated: true }), bell(11)] });
	await r.watcher.run(r.controller.signal);
	assert.deepEqual(r.readArgs.map(([afterSeq]) => afterSeq), [5, 8, 11]);
	assert.deepEqual(r.sleeps, []);
	assert.equal(r.delivered[0]?.meta.saturated, "true");
});

test("a link error after the signal aborted is silent: no warning, no backoff sleep, and run exits", async () => {
	const r = rig({ reads: [(controller) => { controller.abort(); throw new Error("aborted by the caller"); }] });
	await r.watcher.run(r.controller.signal);
	assert.deepEqual(r.log, ["commit()", "read(5)"]);
	assert.deepEqual(r.warnings, []);
	assert.deepEqual(r.sleeps, []);
});

test("tick returns link_failed without a warning when the bootstrap or the read fails after abort", async () => {
	const bootstrapFails = rig({ bootstrap: [new Error("aborted by the caller")] });
	bootstrapFails.controller.abort();
	const readFails = rig({ reads: [(controller) => { controller.abort(); throw new Error("aborted by the caller"); }] });
	for (const r of [bootstrapFails, readFails]) {
		assert.equal(await r.watcher.tick(r.controller.signal), "link_failed");
		assert.deepEqual(r.warnings, []);
	}
});

test("a pre-aborted signal makes run resolve with zero link calls", async () => {
	const r = rig({ reads: [bell(8)] });
	r.controller.abort();
	await r.watcher.run(r.controller.signal);
	assert.deepEqual(r.log, []);
	assert.deepEqual(r.sleeps, []);
});

test("run returns promptly when the signal aborts inside the backoff sleep", { timeout: PROMPT_BOUND_MS }, async () => {
	const r = rig({ reads: [new Error("boom"), bell(8)], sleep: "until-abort" });
	const running = r.watcher.run(r.controller.signal);
	await r.sleeping;
	assert.deepEqual(r.sleeps, [BACKOFF_MS]);
	r.controller.abort();
	await running;
	assert.equal(r.readArgs.length, 1, "no read after the abort");
	assert.deepEqual(r.delivered, []);
});

test("the default sleep is the abortable one: run leaves the real backoff as soon as the signal aborts", { timeout: PROMPT_BOUND_MS }, async () => {
	const timersBefore = activeTimers();
	const r = rig({ reads: [new Error("boom")], sleep: "default" });
	const running = r.watcher.run(r.controller.signal);
	await flush();
	assert.equal(activeTimers(), timersBefore + 1, "the real backoff timer is armed");
	r.controller.abort();
	await running;
	assert.equal(activeTimers(), timersBefore, "and cleared by the abort");
	assert.equal(r.readArgs.length, 1);
});

test("the default warn writes one line to stderr", async () => {
	const written: string[] = [];
	const stderr = mock.method(process.stderr, "write", (chunk: string) => (written.push(chunk), true));
	try {
		const link: DoorbellWatcherDeps["link"] = {
			commitCursor: () => Promise.reject(new Error("no live daemon run file")),
			readDoorbell: () => Promise.reject(new Error("unreachable")),
		};
		await new DoorbellWatcher({ link, deliver: async () => undefined }).tick();
	} finally {
		stderr.mock.restore();
	}
	assert.deepEqual(written, ["doorbell link failed: no live daemon run file\n"]);
});

test("abortableSleep resolves after its delay and leaves no abort listener on the shared signal", { timeout: PROMPT_BOUND_MS }, async () => {
	const { signal } = new AbortController();
	const started = performance.now();
	await abortableSleep(SHORT_SLEEP_MS, signal);
	assert.ok(performance.now() - started >= SHORT_SLEEP_MS / 2, "it waited for the timer");
	assert.equal(abortListeners(signal), 0);
});

test("abortableSleep resolves promptly and clears its timer when the signal aborts mid-sleep", { timeout: PROMPT_BOUND_MS }, async () => {
	const controller = new AbortController();
	const timersBefore = activeTimers();
	const sleeping = abortableSleep(LONG_SLEEP_MS, controller.signal);
	assert.equal(activeTimers(), timersBefore + 1);
	controller.abort();
	await sleeping;
	assert.equal(activeTimers(), timersBefore, "the pending timer was cleared");
	assert.equal(abortListeners(controller.signal), 0);
});

test("abortableSleep with a pre-aborted signal resolves at once, arms no timer and adds no listener", { timeout: PROMPT_BOUND_MS }, async () => {
	const signal = AbortSignal.abort();
	const timersBefore = activeTimers();
	await abortableSleep(LONG_SLEEP_MS, signal);
	assert.equal(activeTimers(), timersBefore);
	assert.equal(abortListeners(signal), 0);
});

test("channel/doorbell-loop.ts is the one timer file yet stays spawn-free, fs-free and bounded, writes only to stderr, and imports only the allow-list", () => {
	const source = readFileSync(`${REPO_ROOT}channel/doorbell-loop.ts`, "utf8");
	assert.equal(hasChildProcessReference(source), false);
	assert.equal(hasTimersModuleReference(source), false);
	assert.equal(hasFsModuleReference(source), false);
	assert.equal(hasUnboundedLoopReference(source), false);
	assert.equal(hasAutonomousTimerReference(source), true, "the one channel file the closure allow-list lets arm a timer");
	assert.ok(source.includes("while (!signal.aborted)"), "the loop is bounded by the caller's signal");
	assert.equal(source.includes("process.stdout"), false, "stdout carries MCP frames only");
	assert.ok(source.includes("process.stderr"), "the default warn goes to stderr");
	assert.doesNotMatch(source, /\bDaemonLinkError\b/, "the watcher never branches on the link's error code");
	assert.match(source, /import type \{[^}]*\} from "\.\/daemon-link\.js"/, "the link is a type-only import");
	const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "");
	assert.ok(specifiers.length >= 3, "non-vacuous: the scan must see the module's imports");
	for (const specifier of specifiers) {
		assert.match(specifier, ALLOWED_SPECIFIER);
	}
});
