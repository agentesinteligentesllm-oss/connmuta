import type { ChannelNotification } from "../channel/notify.js";
import { PI_DOORBELL_CUSTOM_TYPE, PI_RING_COOLDOWN_MS } from "./constants.js";

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
	/** Injected so the cooldown is asserted without a real clock; production uses `Date.now`. */
	readonly now?: () => number;
}

/** Builds the watcher's `deliver`: at most one ring per {@link PI_RING_COOLDOWN_MS}. */
export function createPiRinger(deps: PiRingerDeps): (notification: ChannelNotification) => Promise<void> {
	const now = deps.now ?? Date.now;
	let lastRingAt: number | undefined;

	return async (notification) => {
		const at = now();
		const previous = lastRingAt;
		if (previous !== undefined && at - previous < PI_RING_COOLDOWN_MS) {
			return;
		}
		deps.pi.sendMessage(
			{ customType: PI_DOORBELL_CUSTOM_TYPE, content: notification.content, display: true },
			{ triggerTurn: true, deliverAs: "followUp" },
		);
		// Only after the call returned: a stale context throws from that call (see the module doc), and a throw is a
		// non-delivery that must not start the next ring's cooldown. The host's *asynchronous* failures are the other
		// half of that doc — they never reach this guard because they never reach this call at all.
		lastRingAt = at;
	};
}
