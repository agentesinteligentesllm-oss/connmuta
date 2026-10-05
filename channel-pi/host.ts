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
 * **A genuine failure propagates.** `pi.sendMessage` throws when the session is no longer live (the
 * host invalidates the extension's runtime at replacement, reload or shutdown). That is a real
 * non-delivery, and the watcher already knows what to do with it — `deliver_failed`, one paced retry,
 * and no cursor advance — so this function must not swallow it.
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
		// Only after the call returned: a throw above is a non-delivery, and a non-delivery must not
		// start the next ring's cooldown.
		lastRingAt = at;
	};
}
