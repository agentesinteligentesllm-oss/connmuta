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
 * **What a host failure actually does — measured, not intended.** An earlier version of this paragraph said
 * that a genuine failure propagates. It does not, and the mechanism matters more than the wording, so here it
 * is: the host's extension-facing `sendMessage` is a **synchronous wrapper over an async method** that reports
 * the rejection to its own error surface — `sendMessage: (message, options) => { this.sendCustomMessage(message,
 * options).catch(err => runner.emitError({ event: "send_message", error: … })) }` — and its declared type is
 * `void` (`@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:1221`). It cannot throw. So a ring
 * that was never delivered resolves here, this function records it as rung, and the shipped `DoorbellWatcher`
 * commits the doorbell cursor and does not re-read that window. **The message is not lost** — the doorbell
 * cursor is not the session's own client cursor, so the session still sees the row when it fetches — but the
 * *ring* is not retried and the live session is not told. Making delivery verifiable is a design decision with
 * its own ADR (verify the ring, or refuse to advance a cursor for an unverifiable one), so it is filed rather
 * than improvised here. What this function still guarantees is narrower and exact: it does not catch a throw
 * from the collaborator it was handed.
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
		// Only after the call returned: a throw above is a non-delivery, and a non-delivery must not start the
		// next ring's cooldown. Note what this guard actually covers: the real host cannot throw (see the module
		// doc), so it protects against an injected collaborator, not against a live host failing to deliver.
		lastRingAt = at;
	};
}
