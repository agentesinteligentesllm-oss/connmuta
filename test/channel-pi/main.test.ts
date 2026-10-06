import { test } from "node:test";
import assert from "node:assert/strict";

import type { DaemonLink, DoorbellResponse } from "../../channel/daemon-link.js";
import { createConmutaDoorbellRegistration, isInteractiveHost, type PiExtensionHost, type PiHostContext } from "../../channel-pi/main.js";
import { PI_INTERACTIVE_HOST_ENV, PI_INTERACTIVE_MODE } from "../../channel-pi/constants.js";
import type { BindingResult } from "../../src/client/binding.js";
import { EXIT_UNBOUND_PROJECT, PROJECT_FILE_SCHEMA_VERSION } from "../../src/shared/constants.js";

/**
 * `channel-pi/main.ts` (ADR-0036, ODD task `odd/tasks/f7c-pi-host-doorbell.md` T2). This file pins the
 * part of the adapter that is easiest to get silently wrong and hardest to notice: the lifecycle.
 *
 * What is at stake: the host loads extensions in modes that never begin a session, so anything started in
 * the factory leaks; a session can start more than once (reload, resume, replacement), so a second start
 * must not leave a second loop polling; and a shutdown that arrives before any start must be harmless
 * because cancellation, reload and process exit all converge on it. None of those is observable by
 * reading the code once, and all of them are observable here.
 *
 * The collaborators are injected — the house pattern `channel/main.ts` already uses — so the lifecycle is
 * asserted without a real binding walk, a real daemon or a real host.
 */

interface Registered {
	readonly name: string;
	readonly handler: (event: unknown, ctx: PiHostContext) => unknown;
}

function fakeHost(): { host: PiExtensionHost; registered: Registered[]; notes: string[] } {
	const registered: Registered[] = [];
	const notes: string[] = [];
	const host: PiExtensionHost = {
		sendMessage: () => {},
		on: (name, handler) => {
			registered.push({ name, handler });
		},
	};
	return { host, registered, notes };
}

const ctxWithNotes = (notes: string[], mode: PiHostContext["mode"] = PI_INTERACTIVE_MODE): PiHostContext => ({
	mode,
	ui: { notify: (message) => notes.push(message) },
});

/** A refusal the walk-up really produces, so the warning text is exercised rather than imagined. */
const UNBOUND: BindingResult = {
	ok: false,
	refusal: { kind: "no_project_file_found", exitCode: EXIT_UNBOUND_PROJECT, searchedFrom: "/nowhere/below" },
};

/** A valid project file; the registry-level validation is not what this file is about. */
const BOUND: BindingResult = {
	ok: true,
	path: "/bound/conmuta.json",
	file: {
		schema_version: PROJECT_FILE_SCHEMA_VERSION,
		project_id: "conmuta-repo",
		group_id: -5419222443,
		roster: [{ agent_id: "@kairo-agent", user_id: 1234567, username: "kairo" }],
	},
};

/**
 * A link whose read never settles until it is aborted — the shape of a real long poll into a quiet bus,
 * and the only fake that lets a test observe "a read is in flight" without a busy loop.
 */
function pendingLink(): { link: DaemonLink; polls: AbortSignal[]; closes: () => number } {
	const polls: AbortSignal[] = [];
	let closes = 0;
	const link: DaemonLink = {
		readDoorbell: (_afterSeq, _timeoutS, signal) =>
			new Promise<DoorbellResponse>((_resolve, reject) => {
				if (signal === undefined) {
					reject(new Error("the watcher must pass a signal"));
					return;
				}
				polls.push(signal);
				signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
			}),
		commitCursor: async () => 0,
		close: async () => {
			closes += 1;
		},
	};
	return { link, polls, closes: () => closes };
}

/** Lets the loop's own microtask chain reach its first read without asserting on scheduling. */
async function until(predicate: () => boolean, label: string): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		if (predicate()) {
			return;
		}
		await new Promise((resolve) => setImmediate(resolve));
	}
	assert.fail(`timed out waiting for ${label}`);
}

const handlerFor = (registered: Registered[], name: string): Registered["handler"] => {
	const found = registered.find((entry) => entry.name === name);
	assert.ok(found, `expected the adapter to register ${name}`);
	return found.handler;
};

test("the adapter registers exactly the two lifecycle events and nothing else", () => {
	const { host, registered } = fakeHost();
	createConmutaDoorbellRegistration(host);

	assert.deepEqual(
		registered.map((entry) => entry.name),
		["session_start", "session_shutdown"],
		"a third registration would be an effect the factory is not supposed to have",
	);
});

test("an unbound session warns once, starts nothing, and does not throw", async () => {
	const { host, registered, notes } = fakeHost();
	let linkCalls = 0;
	createConmutaDoorbellRegistration(host, {
		resolveBinding: () => UNBOUND,
		createLink: () => {
			linkCalls += 1;
			throw new Error("no link may be created for an unbound session");
		},
	});

	await handlerFor(registered, "session_start")({ reason: "startup" }, ctxWithNotes(notes));

	assert.equal(linkCalls, 0, "an unbound session must create no link");
	assert.equal(notes.length, 1, "the refusal must be said exactly once, not swallowed");
	assert.match(notes[0], /^pi-host-doorbell: no conmuta\.json found above \/nowhere\/below$/);
});

test("a bound session puts exactly one doorbell read in flight, and says nothing when it is healthy", async () => {
	const { host, registered, notes } = fakeHost();
	const { link, polls } = pendingLink();
	createConmutaDoorbellRegistration(host, { resolveBinding: () => BOUND, createLink: () => link });

	const ctx = ctxWithNotes(notes);
	await handlerFor(registered, "session_start")({ reason: "startup" }, ctx);
	await until(() => polls.length === 1, "the first doorbell read");

	assert.equal(notes.length, 0, "a healthy session must not warn");
	assert.equal(polls[0].aborted, false);
});

// B-124: a harness subagent is `pi --mode rpc` WITHOUT the interactive-host marker, and ringing it starts an
// automatic turn before the caller's task, whose prompt is then rejected with "Agent is already processing".
// The adapter arms only for a session a person is sitting in: the terminal TUI, or the interactive RPC host
// (the desktop app sets PI_INTERACTIVE_HOST_ENV=1 and the runner strips it from every subagent child).

const NOT_SERVED: readonly { readonly label: string; readonly mode: PiHostContext["mode"]; readonly env: NodeJS.ProcessEnv }[] = [
	{ label: "a headless rpc child (no interactive marker)", mode: "rpc", env: {} },
	{ label: "an rpc run with the interactive marker set to 0", mode: "rpc", env: { [PI_INTERACTIVE_HOST_ENV]: "0" } },
	{ label: "a json run", mode: "json", env: {} },
	{ label: "a print run", mode: "print", env: {} },
	{ label: "a host that omits the run mode", mode: undefined, env: {} },
];

for (const { label, mode, env } of NOT_SERVED) {
	test(`${label} arms no watcher, mints no link and says nothing (B-124)`, async () => {
		const { host, registered, notes } = fakeHost();
		let linkCalls = 0;
		const { link, polls } = pendingLink();
		createConmutaDoorbellRegistration(host, {
			resolveBinding: () => BOUND,
			createLink: () => {
				linkCalls += 1;
				return link;
			},
			env,
		});

		await handlerFor(registered, "session_start")({ reason: "startup" }, { mode, ui: { notify: (message) => notes.push(message) } });

		assert.equal(linkCalls, 0, "a programmatic session must not mint a daemon session");
		assert.equal(polls.length, 0, "a programmatic session must not hold the doorbell");
		assert.equal(notes.length, 0, "declining to arm is a correct no-op, not a failure to report");
	});
}

test("an interactive terminal session still arms: the gate removes the programmatic case, not the feature", async () => {
	const { host, registered, notes } = fakeHost();
	const { link, polls } = pendingLink();
	createConmutaDoorbellRegistration(host, { resolveBinding: () => BOUND, createLink: () => link });

	await handlerFor(registered, "session_start")({ reason: "startup" }, ctxWithNotes(notes, PI_INTERACTIVE_MODE));
	await until(() => polls.length === 1, "the first doorbell read");

	assert.equal(notes.length, 0, "the ring is armed and healthy");
});

test("an interactive RPC host still arms: the desktop app's marker is honored (B-124)", async () => {
	const { host, registered, notes } = fakeHost();
	const { link, polls } = pendingLink();
	createConmutaDoorbellRegistration(host, {
		resolveBinding: () => BOUND,
		createLink: () => link,
		env: { [PI_INTERACTIVE_HOST_ENV]: "1" },
	});

	await handlerFor(registered, "session_start")({ reason: "startup" }, ctxWithNotes(notes, "rpc"));
	await until(() => polls.length === 1, "the first doorbell read");

	assert.equal(notes.length, 0, "an attended RPC session is served, not declined");
});

test("the interactive-host predicate is exactly tui or rpc-with-marker", () => {
	assert.equal(isInteractiveHost("tui", {}), true);
	assert.equal(isInteractiveHost("rpc", { [PI_INTERACTIVE_HOST_ENV]: "1" }), true);
	assert.equal(isInteractiveHost("rpc", {}), false, "a harness child is rpc without the marker");
	assert.equal(isInteractiveHost("rpc", { [PI_INTERACTIVE_HOST_ENV]: "0" }), false);
	assert.equal(isInteractiveHost("rpc", { [PI_INTERACTIVE_HOST_ENV]: "true" }), false, "only the exact host value counts");
	assert.equal(isInteractiveHost("json", { [PI_INTERACTIVE_HOST_ENV]: "1" }), false);
	assert.equal(isInteractiveHost("print", {}), false);
	assert.equal(isInteractiveHost(undefined, { [PI_INTERACTIVE_HOST_ENV]: "1" }), false);
});

test("a second session_start stops the first loop and releases the link it held (B-127)", async () => {
	const { host, registered, notes } = fakeHost();
	const first = pendingLink();
	const second = pendingLink();
	let created = 0;
	createConmutaDoorbellRegistration(host, {
		resolveBinding: () => BOUND,
		createLink: () => [first.link, second.link][created++]!,
	});

	const start = handlerFor(registered, "session_start");
	const ctx = ctxWithNotes(notes);
	await start({ reason: "startup" }, ctx);
	await until(() => first.polls.length === 1, "the first doorbell read");
	await start({ reason: "reload" }, ctx);
	await until(() => second.polls.length === 1, "the second doorbell read");

	assert.equal(first.polls[0]!.aborted, true, "the superseded loop must be stopped");
	assert.equal(second.polls[0]!.aborted, false, "the current loop must keep polling");
	assert.equal(first.closes(), 1, "the superseded link still held a daemon session slot; a reload must release it");
	assert.equal(second.closes(), 0, "the link the reload created is the live one and must stay open");

	await handlerFor(registered, "session_shutdown")({ reason: "quit" }, ctx);
	assert.equal(second.closes(), 1, "shutdown closes the current link");
	assert.equal(first.closes(), 1, "and the superseded link is never closed twice");
});

test("a persistent failure is said once through the UI, not once per retry (B-127, the module doc's own promise)", async (t) => {
	const { host, registered, notes } = fakeHost();
	const failing: DaemonLink = {
		readDoorbell: async () => {
			throw new Error("no live daemon run file");
		},
		commitCursor: async () => 0,
		close: async () => {},
	};
	createConmutaDoorbellRegistration(host, {
		resolveBinding: () => BOUND,
		createLink: () => failing,
		// Each sleep yields a macrotask, which is what lets this test's own turns run between ticks.
		sleep: () => new Promise((resolve) => setImmediate(resolve)),
	});

	const ctx = ctxWithNotes(notes);
	// Registered before the start so a failing assertion cannot leave the loop spinning and hold the runner open.
	t.after(async () => {
		await handlerFor(registered, "session_shutdown")({ reason: "quit" }, ctx);
	});

	await handlerFor(registered, "session_start")({ reason: "startup" }, ctx);
	await until(() => notes.length >= 1, "the first failure warning");
	for (let turn = 0; turn < 50; turn += 1) {
		await new Promise((resolve) => setImmediate(resolve));
	}
	assert.equal(notes.length, 1, `each condition is said once per session, got ${notes.length}: ${notes[0]}`);
});

test("shutdown closes the link once, and only that link", async () => {
	const { host, registered, notes } = fakeHost();
	const { link, closes } = pendingLink();
	createConmutaDoorbellRegistration(host, { resolveBinding: () => BOUND, createLink: () => link });

	const ctx = ctxWithNotes(notes);
	await handlerFor(registered, "session_start")({ reason: "startup" }, ctx);
	await handlerFor(registered, "session_shutdown")({}, ctx);

	assert.equal(closes(), 1);
});

test("shutdown before any start is harmless: no link is minted to close, and nothing throws", async () => {
	const { host, registered, notes } = fakeHost();
	let linkCalls = 0;
	const { link } = pendingLink();
	createConmutaDoorbellRegistration(host, {
		resolveBinding: () => BOUND,
		createLink: () => {
			linkCalls += 1;
			return link;
		},
	});

	await handlerFor(registered, "session_shutdown")({}, ctxWithNotes(notes));

	assert.equal(linkCalls, 0, "a session that never started must not mint a session against the daemon");
	assert.equal(notes.length, 0);
});
