import type { ChannelNotification } from "../channel/notify.js";
import { MILLISECONDS_PER_MINUTE, PI_DOORBELL_CUSTOM_TYPE, PI_RING_BUDGET_PER_WINDOW, PI_RING_BUDGET_WINDOW_MS, PI_RING_COOLDOWN_MS } from "./constants.js";

/**
 * The Pi host adapter's ring (`channel-pi/host.ts`, ADR-0036): the one function this adapter hands to
 * the shipped `DoorbellWatcher` as its `deliver`.
 *
 * **A ring, not a message.** The content comes straight from {@link ChannelNotification}, whose text
 * `channel/notify.ts` writes as a template over the count, the product name and the fetch tool name;
 * no peer prose can reach it, because the daemon's doorbell never reads the message-text column and the
 * summary's own fields are pattern-pinned by its schema. This module adds no content of its own.
 *
 * **Why a cooldown and not a queue.** See `PI_RING_COOLDOWN_MS`: a ring that arrives while the session
 * is already awake from a previous ring is merged into the next one. Merging is expressed by resolving
 * normally, so the watcher commits its cursor and moves on; rejecting would instead look like a
 * delivery failure and make the watcher back off and re-read the same window.
 *
 * **The cooldown is a rate limit; the budget is the cap (B-129, ADR-0036 decision 6).** The cooldown alone
 * bounds how *often* a ring fires, not how many — at one ring per fifteen seconds a busy session can ring 240
 * times an hour, and every ring is a model turn. {@link PI_RING_BUDGET_PER_WINDOW} per
 * {@link PI_RING_BUDGET_WINDOW_MS} is the absolute bound, spent on the same currency the satellite's wake
 * budget spends. A ring the budget suppresses resolves without ringing, exactly like a cooldown merge — the row
 * is not lost (the doorbell cursor is not the client cursor, ADR-0038) — and it is reported once per session,
 * because a session that has quietly stopped ringing and a bus with nothing on it are indistinguishable from
 * inside the session. The two bounds are checked in a deliberate order: **cooldown first**, because a merged
 * ring starts no turn and must not be charged to the budget.
 *
 * **What a host failure actually does — two layers, measured, and an earlier note in this file got it wrong.**
 * The failure story has two halves, and they behave oppositely:
 *
 *  - **A stale context THROWS.** The host hands the extension an API object whose `sendMessage` calls
 *    `assertActive()` first (`@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:302-305`), and
 *    `assertActive` throws `Error(state.staleMessage)` once the runtime was replaced, reloaded or shut down
 *    (`:113-115`). A call in that state throws **synchronously**, and that is the half this function must not
 *    swallow: the throw propagates, the shipped `DoorbellWatcher` records `deliver_failed`, backs off, and does
 *    **not** commit the cursor — so the ring IS retried. Session 72 measured this: *“a call after the session
 *    ended throws a stale-runtime error that would crash an unguarded watcher.”*
 *  - **A live session's failed delivery is swallowed.** One layer down, the runtime binds
 *    `sendMessage: (message, options) => { this.sendCustomMessage(message, options).catch(err =>
 *    runner.emitError({ event: "send_message", … })) }`, and the declared type is `void`. A rejection from there is
 *    reported to the host's own error surface and never reaches this function, so the ring resolves, the watcher
 *    commits the cursor, and that window is not re-read. The *message* is not lost — the doorbell cursor is not
 *    the session's own client cursor, so the session still sees the row when it fetches — but the ring is not
 *    retried and the session is not told. That half is **accepted, not open**: the ring is best-effort and that is
 *    decided (ADR-0038, option (b), confirmed 2026-10-07), and the bound is pinned by a test rather than narrated
 *    here — a ring that resolved without being delivered leaves the *message* visible to the session's own client
 *    cursor, which is the property that makes best-effort acceptable (`test/daemon/serve/fetch.test.ts`). The
 *    *message* stays guaranteed while the nudge does not; the half this function *can* see, the stale-context
 *    throw just above, keeps being retried.
 *
 * The PR #106 audit read only the lower layer, concluded the API “cannot throw”, and the writer corrected this
 * file on that report; the follow-up audit read the upper layer and found the correction itself wrong. What
 * survives is the two-case statement above. The lesson is in the record, not just here: a delegated finding has to
 * be falsified, not merely quoted — the repo's own session-72 note already said the call throws.
 */

/**
 * The only Pi API member this adapter calls, declared structurally so a test fake needs nothing else and
 * the host's real extension API object is assignable without this repository depending on the host's
 * package. `triggerTurn` is what makes a ring start a turn at all; `deliverAs: "followUp"` queues it
 * behind the turn in flight instead of derailing it, and is ignored when the session is idle.
 */
export interface PiMessenger {
	sendMessage(
		message: { customType: string; content: string; display: boolean },
		options: { triggerTurn: boolean; deliverAs: "steer" | "followUp" },
	): void;
}

export interface PiRingerDeps {
	readonly pi: PiMessenger;
	/** Injected so the cooldown and the budget window are asserted without a real clock; production uses `Date.now`. */
	readonly now?: () => number;
	/**
	 * Where a ring the adapter declined to send is reported. The one condition that reaches this surface is an
	 * exhausted budget ({@link PI_RING_BUDGET_PER_WINDOW}), which is not a failure but must not be a silence
	 * either: a session that has stopped ringing and a bus with nothing on it look identical from inside the
	 * session, and the module doc's rule is that this adapter reports health it does not have to nobody. The
	 * caller owns the frequency — `channel-pi/main.ts` passes its per-session, message-keyed `warnOnce` gate
	 * (B-127), which is why the message below is byte-stable.
	 *
	 * **Required, not optional (Judgment Day round 1, PR #114).** Two blind judges independently showed that an
	 * optional `warn` makes the adapter's own "reported once per session" guarantee deletable in silence: removing
	 * `warn: warnOnce` from `channel-pi/main.ts` left the whole suite green, so the guarantee could become "never
	 * reported" while every document still claimed it shipped. Requiring the field turns that deletion into a
	 * compile error — the same move ADR-0037 made when it stopped enumerating bad arguments and made the bad shape
	 * unrepresentable. Every instantiation must now name the surface it reports on.
	 */
	readonly warn: (message: string) => void;
}

/**
 * The one line an exhausted budget produces, and it is **byte-stable on purpose**: `channel-pi/main.ts` owns the
 * "each condition is said once" promise with a `warnOnce` gate keyed by the message (B-127), so a message that
 * varied — with a count, an age or a timestamp — could never be deduped and would repeat on every suppressed
 * ring. It names the bound and the remedy without inventing a number: the caller reads the window in minutes
 * from the constant.
 */
const RING_BUDGET_SPENT_MESSAGE =
	`the ring budget is spent (${PI_RING_BUDGET_PER_WINDOW} rings per ${PI_RING_BUDGET_WINDOW_MS / MILLISECONDS_PER_MINUTE} minutes); ` +
	"rings resume as the window refills, and `conmuta_fetch` still returns every row";

/** Builds the watcher's `deliver`: at most one ring per {@link PI_RING_COOLDOWN_MS}, and at most
 * {@link PI_RING_BUDGET_PER_WINDOW} per {@link PI_RING_BUDGET_WINDOW_MS}. */
export function createPiRinger(deps: PiRingerDeps): (notification: ChannelNotification) => Promise<void> {
	const now = deps.now ?? Date.now;
	const warn = deps.warn;
	let lastRingAt: number | undefined;
	/** Ring timestamps inside the current window, pruned on use — the sliding shape `runner/loop.ts` uses, and
	 * deliberately not a fixed bucket: a bucket lets one burst straddle a boundary and spend two windows' worth
	 * back to back, which is the opposite of an absolute cap. */
	let rings: number[] = [];

	return async (notification) => {
		const at = now();
		const previous = lastRingAt;
		if (previous !== undefined && at - previous < PI_RING_COOLDOWN_MS) {
			return;
		}
		// Second, and that order is the point: the branch above started no turn, so charging it here would spend the
		// cap on rings that never happened and would silence the session early. Only a call that reaches
		// `sendMessage` — below — is recorded.
		const windowStart = at - PI_RING_BUDGET_WINDOW_MS;
		rings = rings.filter((ringedAt) => ringedAt > windowStart);
		if (rings.length >= PI_RING_BUDGET_PER_WINDOW) {
			// Resolve, do not reject: like a cooldown merge, this is a handled announcement, not a delivery failure —
			// rejecting would make the watcher back off and re-read a window whose row it already accounted for.
			warn(RING_BUDGET_SPENT_MESSAGE);
			return;
		}
		deps.pi.sendMessage(
			{ customType: PI_DOORBELL_CUSTOM_TYPE, content: notification.content, display: true },
			{ triggerTurn: true, deliverAs: "followUp" },
		);
		// Only after the call returned: a stale context throws from that call (see the module doc), and a throw is a
		// non-delivery that must not start the next ring's cooldown or spend a budget slot. The host's *asynchronous*
		// failures are the other half of that doc — they never reach this guard because they never reach this call.
		lastRingAt = at;
		rings.push(at);
	};
}
