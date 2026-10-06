import { test } from "node:test";
import assert from "node:assert/strict";

import { RUNNER_NAME } from "../../runner/constants.js";
import { CHANNEL_HOST_LABEL } from "../../src/shared/constants.js";
import { PI_DOORBELL_CUSTOM_TYPE, PI_DOORBELL_HOST_LABEL, PI_INTERACTIVE_HOST_ENV, PI_INTERACTIVE_MODE, PI_RING_COOLDOWN_MS } from "../../channel-pi/constants.js";

/**
 * `channel-pi/constants.ts` (ADR-0036). Three values look trivial and are not, which is why they get a
 * test rather than a comment alone.
 *
 * The two identifiers are **stable contracts, not internal names**: the host label is what
 * `conmuta status` and `conmuta doctor` show for this adapter's cursor row, and the custom type is what
 * the runbook tells an operator to look for in the transcript. Renaming either silently breaks
 * documentation and operator tooling, so a rename has to fail here first and be made deliberately —
 * ADR-12's rule, applied to the values themselves rather than to the behaviour around them.
 */

test("the adapter's host label collides with neither existing consumer's", () => {
	assert.notEqual(
		PI_DOORBELL_HOST_LABEL,
		RUNNER_NAME,
		"the doorbell cursor row is keyed per client session, so two consumers sharing a label are indistinguishable in status and doctor",
	);
	assert.notEqual(PI_DOORBELL_HOST_LABEL, CHANNEL_HOST_LABEL);
	assert.notEqual(RUNNER_NAME, CHANNEL_HOST_LABEL);
	assert.ok(PI_DOORBELL_HOST_LABEL.length > 0);
});

test("the identifiers an operator reads are pinned to their exact spelling", () => {
	assert.equal(PI_DOORBELL_HOST_LABEL, "pi-host-doorbell");
	assert.equal(PI_DOORBELL_CUSTOM_TYPE, "conmuta-doorbell");
});

test("the interactive-host gate's two literals are pinned (B-124)", () => {
	// Both are the host's own vocabulary, and a one-token edit on either silently switches the machine-wide
	// ring off (a wrong mode string, or a marker no host sets). Pin them so that edit fails here first.
	assert.equal(PI_INTERACTIVE_MODE, "tui");
	assert.equal(PI_INTERACTIVE_HOST_ENV, "GENTLE_SHELL_INTERACTIVE_HOST");
});

test("the ring cooldown is a positive whole number of milliseconds", () => {
	assert.ok(Number.isInteger(PI_RING_COOLDOWN_MS), "a fractional cooldown would be a unit mistake, not a preference");
	assert.ok(PI_RING_COOLDOWN_MS > 0, "a non-positive cooldown would ring on every announcement, which is the cost this bound exists to avoid");
	assert.ok(Number.isFinite(PI_RING_COOLDOWN_MS));
});
