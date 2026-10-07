import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ChannelNotification } from "../../channel/notify.js";
import {
	PI_DOORBELL_CUSTOM_TYPE,
	PI_RING_BUDGET_PER_WINDOW,
	PI_RING_BUDGET_WINDOW_MS,
	PI_RING_COOLDOWN_MS,
} from "../../channel-pi/constants.js";
import { createPiRinger, type PiMessenger } from "../../channel-pi/host.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * `channel-pi/host.ts` (ADR-0036, ODD task `odd/tasks/f7c-pi-host-doorbell.md` T1). What this file
 * pins is the whole behavioural surface of the ring: its exact shape, that its content is the
 * notification's and nothing else, the cooldown's merge-not-queue semantics, and that a host failure
 * propagates so the shipped `DoorbellWatcher` can turn it into `deliver_failed` and retry.
 *
 * The fake is the smallest thing that satisfies `PiMessenger`: the adapter calls exactly one host
 * method, so nothing else needs standing in.
 */

interface Sent {
	readonly message: { customType: string; content: string; display: boolean };
	readonly options: { triggerTurn: boolean; deliverAs: "steer" | "followUp" };
}

/** A sink for the ringers whose subject is not the report surface; `warn` is now required, so every
 * instantiation names one. The surface itself is pinned by the budget tests and by `channel-pi/main.test.ts`. */
const noopWarn = (): void => {};

function recordingPi(): { sent: Sent[]; pi: PiMessenger } {
	const sent: Sent[] = [];
	return {
		sent,
		pi: {
			sendMessage: (message, options) => {
				sent.push({ message, options });
			},
		},
	};
}

function throwingPi(): PiMessenger {
	return {
		sendMessage: () => {
			throw new Error("This extension ctx is stale after session replacement or reload");
		},
	};
}

/** A notification as `channel/notify.ts` builds one: template text plus the closed meta key set. */
function notification(content = "3 new conmuta envelopes are waiting. Call conmuta_fetch to read them."): ChannelNotification {
	return { content, meta: { count: "3", senders: "@luisgtz-agent", types: "REQUEST", threads: "02e84054e0a6" } };
}

test("the ring sends exactly one attributable message that triggers a turn, and reassembles nothing", async () => {
	const { sent, pi } = recordingPi();
	const ring = createPiRinger({ pi, warn: noopWarn });

	await ring(notification());

	assert.equal(sent.length, 1, "one doorbell event must produce exactly one ring");
	assert.deepEqual(
		sent[0].message,
		{
			customType: PI_DOORBELL_CUSTOM_TYPE,
			content: notification().content,
			display: true,
		},
		"the ring's content must be the notification's own text, carrying no prose this module invented",
	);
	assert.deepEqual(
		sent[0].options,
		{ triggerTurn: true, deliverAs: "followUp" },
		"a ring must start a turn and must queue behind the turn in flight rather than interrupt it",
	);
});

test("the ring is attributable, so it can never be read as the human's own message", async () => {
	const { sent, pi } = recordingPi();
	await createPiRinger({ pi, warn: noopWarn })(notification());

	assert.equal(sent[0].message.customType, "conmuta-doorbell");
	assert.notEqual(sent[0].message.customType, "", "an empty custom type would make the ring unattributable");
});

test("a second ring inside the cooldown is merged, not queued, and it resolves so the watcher can advance its cursor (ADR-0038 pin 2)", async () => {
	let clock = 0;
	const { sent, pi } = recordingPi();
	const ring = createPiRinger({ pi, now: () => clock, warn: noopWarn });

	await ring(notification());
	clock = PI_RING_COOLDOWN_MS - 1;
	// The merged call must RESOLVE, not reject. The watcher commits its cursor only after `deliver` settles, so a
	// rejection here would look like a delivery failure and make it back off and re-read a window it just handled.
	// This is the adapter half of ADR-0038 pin 2; the watcher half (a resolved `deliver` is followed by the cursor
	// commit) is pinned in `test/channel/doorbell-loop.test.ts`.
	await assert.doesNotReject(ring(notification()));

	assert.equal(sent.length, 1, "a ring inside the cooldown must not start another turn");
});

test("a ring after the cooldown goes through", async () => {
	let clock = 0;
	const { sent, pi } = recordingPi();
	const ring = createPiRinger({ pi, now: () => clock, warn: noopWarn });

	await ring(notification());
	clock = PI_RING_COOLDOWN_MS;
	await ring(notification());

	assert.equal(sent.length, 2, "the cooldown must end, or the adapter would ring once per session");
});

test("a host failure propagates instead of being swallowed, so the watcher reports it and retries", async () => {
	// Restored name, and the reason is in the record: this pins a state the shipped host CAN reach. The host's
	// extension API object calls `assertActive()` before delegating
	// (`dist/core/extensions/loader.js:302-305`) and throws `Error(state.staleMessage)` once the runtime is stale
	// (`:113-115`), so a ring attempted after a replacement, reload or shutdown throws synchronously — which is
	// what `throwingPi` fabricates, and what session 72 measured live. An earlier correction in this PR renamed
	// this test on the belief that the host cannot throw; that belief came from reading only the runtime layer
	// beneath this one, and it was wrong. The half the host really does swallow is the *asynchronous* rejection,
	// which is the disposition ADR-0038 accepts (best-effort) and the module documents. The watcher's half of
	// ADR-0038 pin 1 — a rejected `deliver` is `deliver_failed`, the cursor is NOT advanced, and the same window
	// is read again — is pinned in `test/channel/doorbell-loop.test.ts`.
	const ring = createPiRinger({ pi: throwingPi(), warn: noopWarn });

	await assert.rejects(() => ring(notification()), /stale after session replacement or reload/);
});

test("a failed ring does not start the cooldown, so the retry can still ring", async () => {
	let clock = 0;
	let fail = true;
	const { sent, pi } = recordingPi();
	const flaky: PiMessenger = {
		sendMessage: (message, options) => {
			if (fail) {
				throw new Error("host refused the message");
			}
			pi.sendMessage(message, options);
		},
	};
	const ring = createPiRinger({ pi: flaky, now: () => clock, warn: noopWarn });

	await assert.rejects(() => ring(notification()));
	fail = false;
	clock += 1;
	await ring(notification());

	assert.equal(sent.length, 1, "a ring that never landed must not suppress the next one");
});

/**
 * B-129 / ADR-0036 decision 6. The cooldown alone is a *rate* limit, not a cap: at one ring per
 * {@link PI_RING_COOLDOWN_MS} an attended session can ring 240 times an hour, and every ring is a model turn.
 * These tests pin the absolute bound the ADR's own test table claims — the third row, "One read in flight,
 * cooldown and per-window budget hold under a burst and under `saturated`" — and that the table declared pinned
 * while the shipped adapter had no budget at all. Before this unit the whole row was false for its second half.
 *
 * The window is exercised on the injected clock, so a test spends a modelled hour in microseconds. Every clock
 * step here is `PI_RING_COOLDOWN_MS + 1`, i.e. the cheapest path that can actually ring: these tests are about
 * the budget, not the cooldown, so the cooldown is never the thing doing the suppressing.
 */

/** How far the clock moves for one ring that is past the cooldown: the cheapest ring the budget must count. */
const PAST_COOLDOWN_MS = PI_RING_COOLDOWN_MS + 1;

test("the per-window budget caps rings even when the cooldown has long expired (B-129, ADR-0036 decision 6)", async () => {
	let clock = 0;
	const { sent, pi } = recordingPi();
	const ring = createPiRinger({ pi, now: () => clock, warn: noopWarn });

	// Three more than the cap, each one past the cooldown and all of them inside a single window.
	for (let i = 0; i < PI_RING_BUDGET_PER_WINDOW + 3; i += 1) {
		await ring(notification());
		clock += PAST_COOLDOWN_MS;
	}

	assert.equal(
		sent.length,
		PI_RING_BUDGET_PER_WINDOW,
		"the cooldown bounds how often a ring fires, not how many: without this cap the same burst would ring unbounded within the window",
	);
	assert.ok(
		(PI_RING_BUDGET_PER_WINDOW + 3) * PAST_COOLDOWN_MS <= PI_RING_BUDGET_WINDOW_MS,
		"the test itself is only meaningful while the whole burst fits inside one window (a larger burst would refill the window instead of testing the cap)",
	);
});

test("the budget is a sliding window: a ring goes through again once the oldest leaves it (B-129)", async () => {
	let clock = 0;
	const { sent, pi } = recordingPi();
	const ring = createPiRinger({ pi, now: () => clock, warn: noopWarn });

	for (let i = 0; i < PI_RING_BUDGET_PER_WINDOW; i += 1) {
		await ring(notification());
		clock += PAST_COOLDOWN_MS;
	}
	assert.equal(sent.length, PI_RING_BUDGET_PER_WINDOW, "the budget must be spendable in full first");

	await ring(notification());
	assert.equal(sent.length, PI_RING_BUDGET_PER_WINDOW, "still inside the window, the cap holds");

	// Move the clock far enough that the first ring (and, at this step, every ring) is now older than the window.
	clock += PI_RING_BUDGET_WINDOW_MS;
	await ring(notification());
	assert.equal(
		sent.length,
		PI_RING_BUDGET_PER_WINDOW + 1,
		"an exhausted budget must refill, or one busy hour would silence the ring for the life of the session",
	);
});

test("the window slides rather than bucketing: a burst straddling a window boundary is still one window's budget (B-129)", async () => {
	let clock = 0;
	const { sent, pi } = recordingPi();
	const ring = createPiRinger({ pi, now: () => clock, warn: noopWarn });

	// Judgment Day round 1 (PR #114) proved by mutation that a **fixed-bucket** window passed every other budget
	// test in this file, leaving ADR-0036's "the window slides … rather than a fixed bucket" unpinned. This
	// schedule is the discriminator and nothing else here can tell the two apart: spend the whole budget so the
	// LAST ring lands one cooldown before a window boundary, then ring twice just past it. A sliding window still
	// holds all twenty recent rings and suppresses both (20 sent); a fixed bucket resets at the boundary and lets
	// both through (22 sent).
	clock = PI_RING_BUDGET_WINDOW_MS - PI_RING_BUDGET_PER_WINDOW * PAST_COOLDOWN_MS;
	for (let i = 0; i < PI_RING_BUDGET_PER_WINDOW; i += 1) {
		await ring(notification());
		clock += PAST_COOLDOWN_MS;
	}
	assert.equal(sent.length, PI_RING_BUDGET_PER_WINDOW, "the budget must be spent in full before the boundary is crossed");

	assert.ok(clock >= PI_RING_BUDGET_WINDOW_MS, "the schedule must actually cross a window boundary");
	await ring(notification());
	clock += PAST_COOLDOWN_MS;
	await ring(notification());

	assert.equal(
		sent.length,
		PI_RING_BUDGET_PER_WINDOW,
		"crossing a boundary must not refill the budget: the window slides over the last hour, it does not bucket into whole hours",
	);
});

test("a saturated doorbell burst is bounded too: the cap counts rings, and `saturated` grants none (B-129)", async () => {
	let clock = 0;
	const { sent, pi } = recordingPi();
	const ring = createPiRinger({ pi, now: () => clock, warn: noopWarn });
	// `buildNotification` sets this meta key when the peek window is full. The cap must not depend on it: a
	// saturated doorbell is the *most* likely storm, so it is exactly where the budget has to hold.
	const saturated: ChannelNotification = {
		content: notification().content,
		meta: { ...notification().meta, saturated: "true" },
	};

	for (let i = 0; i < PI_RING_BUDGET_PER_WINDOW * 2; i += 1) {
		await ring(saturated);
		clock += PAST_COOLDOWN_MS;
	}

	assert.equal(sent.length, PI_RING_BUDGET_PER_WINDOW, "a saturated announcement is one more ring, never a licence to ring twice as often");
	assert.ok(
		PI_RING_BUDGET_PER_WINDOW * 2 * PAST_COOLDOWN_MS <= PI_RING_BUDGET_WINDOW_MS,
		"the doubled burst must still fit one window, or the assertion above would be measuring a refill",
	);
});

test("a ring merged by the cooldown consumes no budget, because it started no turn (B-129)", async () => {
	let clock = 0;
	const { sent, pi } = recordingPi();
	const ring = createPiRinger({ pi, now: () => clock, warn: noopWarn });

	// Each iteration is one real ring plus one merged ring: if a merge were charged to the budget, the cap would
	// be reached in half the iterations and fewer than the full budget of turns would ever fire.
	for (let i = 0; i < PI_RING_BUDGET_PER_WINDOW; i += 1) {
		await ring(notification());
		clock += 1; // inside the cooldown of the ring just sent → merged
		await ring(notification());
		clock += PAST_COOLDOWN_MS; // past the cooldown → the next iteration rings
	}

	assert.equal(
		sent.length,
		PI_RING_BUDGET_PER_WINDOW,
		"only a ring that reaches sendMessage may be counted; a merged announcement is not a turn",
	);
});

test("a budget-suppressed ring says so through the adapter's own surface, with a message stable enough to be said once (B-129)", async () => {
	let clock = 0;
	const { pi } = recordingPi();
	const warnings: string[] = [];
	const ring = createPiRinger({ pi, now: () => clock, warn: (message) => warnings.push(message) });

	for (let i = 0; i < PI_RING_BUDGET_PER_WINDOW; i += 1) {
		await ring(notification());
		clock += PAST_COOLDOWN_MS;
	}
	assert.deepEqual(warnings, [], "a ring that fires is not a warning");

	await ring(notification());
	await ring(notification());
	assert.equal(warnings.length, 2, "each suppressed ring reaches the surface; the adapter's `warnOnce` is what makes it once per session");
	assert.match(warnings[0], /budget/i, "the operator has to be able to tell an exhausted budget from a quiet bus");
	assert.equal(
		warnings[0],
		warnings[1],
		"the message must be byte-stable, or `warnOnce`'s keyed gate could never dedupe it and the report would repeat every tick",
	);
});

/**
 * ADR-0038 pin 4 (2026-10-07). This is a **text guard, and it is honest about what it cannot do**: it proves
 * the claims are present and that the known contradiction shapes are absent. It cannot prove the prose is
 * semantically right — a sentence rewritten with the same words still passes — so it is a drift alarm, not a
 * proof. The independent verifier of this unit demonstrated that limit by rewriting the runbook body to "The
 * message is NOT guaranteed at all." and watching a phrase-only guard pass: the `forbidden` set is what closes
 * exactly that shape, and the residual is stated here rather than papered over.
 */
const GUARANTEE_DOCS: ReadonlyArray<{
	readonly label: string;
	readonly path: string;
	readonly phrases: readonly RegExp[];
	/** The contradiction shapes this guard can catch: a sentence that negates the message guarantee. */
	readonly forbidden: readonly RegExp[];
}> = [
	{
		label: "`channel-pi/host.ts`'s module doc",
		path: "channel-pi/host.ts",
		phrases: [/best-effort/i, /message[*_]* (?:is not lost|stays guaranteed)/i, /ADR-0038/],
		forbidden: [/\bnot guaranteed\b/i, /\bno guarantee\b/i, /\bnot a guarantee\b/i],
	},
	{
		label: "the runbook",
		path: "docs/runbooks/host-doorbell-pi.md",
		phrases: [/best-effort/i, /message is guaranteed/i, /ADR-0038/, /retried/i, /pinned by a test/i],
		forbidden: [/\bnot guaranteed\b/i, /\bno guarantee\b/i, /\bnot a guarantee\b/i],
	},
];

test("the module doc and the runbook state the same guarantee as these tests: the ring is best-effort, the message is guaranteed (ADR-0038 pin 4)", () => {
	for (const { label, path, phrases, forbidden } of GUARANTEE_DOCS) {
		const text = readFileSync(join(REPO_ROOT, path), "utf8");
		for (const phrase of phrases) {
			assert.match(text, phrase, `${label} must state ${phrase}`);
		}
		for (const contradiction of forbidden) {
			assert.doesNotMatch(text, contradiction, `${label} must not contradict the guarantee (${contradiction})`);
		}
	}
});
