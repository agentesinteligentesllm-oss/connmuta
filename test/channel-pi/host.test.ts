import { test } from "node:test";
import assert from "node:assert/strict";

import type { ChannelNotification } from "../../channel/notify.js";
import { PI_DOORBELL_CUSTOM_TYPE, PI_RING_COOLDOWN_MS } from "../../channel-pi/constants.js";
import { createPiRinger, type PiMessenger } from "../../channel-pi/host.js";

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
	const ring = createPiRinger({ pi });

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
	await createPiRinger({ pi })(notification());

	assert.equal(sent[0].message.customType, "conmuta-doorbell");
	assert.notEqual(sent[0].message.customType, "", "an empty custom type would make the ring unattributable");
});

test("a second ring inside the cooldown is merged, not queued, and it resolves so the watcher can advance its cursor", async () => {
	let clock = 0;
	const { sent, pi } = recordingPi();
	const ring = createPiRinger({ pi, now: () => clock });

	await ring(notification());
	clock = PI_RING_COOLDOWN_MS - 1;
	await ring(notification());

	assert.equal(sent.length, 1, "a ring inside the cooldown must not start another turn");
});

test("a ring after the cooldown goes through", async () => {
	let clock = 0;
	const { sent, pi } = recordingPi();
	const ring = createPiRinger({ pi, now: () => clock });

	await ring(notification());
	clock = PI_RING_COOLDOWN_MS;
	await ring(notification());

	assert.equal(sent.length, 2, "the cooldown must end, or the adapter would ring once per session");
});

test("a host failure propagates instead of being swallowed, so the watcher reports it and retries", async () => {
	const ring = createPiRinger({ pi: throwingPi() });

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
	const ring = createPiRinger({ pi: flaky, now: () => clock });

	await assert.rejects(() => ring(notification()));
	fail = false;
	clock += 1;
	await ring(notification());

	assert.equal(sent.length, 1, "a ring that never landed must not suppress the next one");
});
