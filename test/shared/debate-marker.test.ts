import { test } from "node:test";
import assert from "node:assert/strict";

import {
	containsInlinePatchShape,
	decodeDebateBody,
	DEBATE_TURN_WIRE_MAPPING,
	encodeDebateTurn,
	type DebateTurnMarker,
} from "../../src/shared/debate-marker.js";
import { DEBATE_MARKER_PREFIX } from "../../src/shared/constants.js";
import { ABANDON_BASIS_VALUE, RESOLVED_BASIS_VALUES, envelopeSchema, normalizeBody } from "../../src/shared/envelope.js";

/**
 * Arena-light debate-turn body markers (`shared/debate-marker.ts`, F5, D7, design.md Decision (b)/(d)).
 *
 * A debate turn rides an EXISTING wire envelope as a one-line body marker (spec "Debate turns map
 * onto existing wire types") — this suite pins the exact delimiter, the round-trip for every
 * `DebateTurnKind`, the wire-mapping scenario, and the pointer-only vs. inline-patch boundary. All
 * pure functions; no ledger, no `DatabaseSync`.
 */

const NOW = "2026-03-01T10:00:00.000Z";
const DEBATE_ID = "1a2b3c4d5e6f";
const PROPOSAL_EID = "a1b2c3d4e5f6";
const CONSENSUS_EID = "f6e5d4c3b2a1";

test("encodeDebateTurn follows design.md Decision (b)'s literal one-line delimiter format", () => {
	const encoded = encodeDebateTurn({ turn: "AUDIT", verdict: "APPROVE", text: "ship it", refs: ["commit:abc123", "PR:#9"] });
	assert.equal(encoded, "[ARENA-LIGHT:AUDIT:APPROVE] ship it refs: commit:abc123; PR:#9");
});

test("encodeDebateTurn omits the refs suffix entirely when there are none, so 'no refs yet' stays distinguishable from an empty ref", () => {
	const encoded = encodeDebateTurn({ turn: "PROPOSAL", text: "Let's use JWT for session auth", refs: [] });
	assert.equal(encoded, "[ARENA-LIGHT:PROPOSAL] Let's use JWT for session auth");
});

test("every encoded marker starts with DEBATE_MARKER_PREFIX", () => {
	const encoded = encodeDebateTurn({ turn: "ESCALATE", text: "no agreement after 3 rounds", refs: [] });
	assert.equal(encoded.startsWith(DEBATE_MARKER_PREFIX), true);
});

const ROUND_TRIP_FIXTURES: readonly DebateTurnMarker[] = [
	{ turn: "PROPOSAL", text: "Use JWT for session auth", refs: [] },
	{ turn: "AUDIT", verdict: "APPROVE_WITH_CHANGES", text: "Looks good but rotate the secret", refs: ["memory:sess-42"] },
	{ turn: "COUNTER", verdict: "REJECT", text: "Rotation breaks existing sessions", refs: ["commit:abc123", "PR:#17"] },
	{ turn: "CONSENSUS", text: "Agreed on a 30-day rotation window", refs: ["ADR-0031"] },
	{ turn: "ESCALATE", text: "No agreement reached after the round cap", refs: [] },
];

test("encodeDebateTurn/decodeDebateBody round-trips every DebateTurnKind, with and without refs", () => {
	for (const marker of ROUND_TRIP_FIXTURES) {
		const encoded = encodeDebateTurn(marker);
		assert.equal(encoded.includes("\n"), false, `encoded marker must stay one line: ${encoded}`);
		assert.deepEqual(decodeDebateBody(encoded), [marker], `round-trip failed for ${marker.turn}`);
	}
});

test("a built PROPOSAL envelope is REQUEST with no basis, and its body decodes back to the same marker", () => {
	const parsed = envelopeSchema.safeParse({
		eid: PROPOSAL_EID,
		type: "REQUEST",
		from: "@alpha",
		to: "@beta",
		thread: DEBATE_ID,
		ts: NOW,
		body: encodeDebateTurn({ turn: "PROPOSAL", text: "Let's use JWT for session auth", refs: [] }),
	});

	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.type, "REQUEST");
	assert.equal(parsed.data.basis, undefined);
	assert.deepEqual(decodeDebateBody(parsed.data.body), [{ turn: "PROPOSAL", text: "Let's use JWT for session auth", refs: [] }]);
});

test("a built CONSENSUS envelope is RESOLVED with basis context-shared, and its body decodes back to the same marker", () => {
	const parsed = envelopeSchema.safeParse({
		eid: CONSENSUS_EID,
		type: "RESOLVED",
		from: "@beta",
		to: "@alpha",
		thread: DEBATE_ID,
		ts: NOW,
		body: encodeDebateTurn({ turn: "CONSENSUS", text: "Agreed, ship it", refs: ["commit:abc123", "PR:#42"] }),
		basis: "context-shared",
	});

	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.type, "RESOLVED");
	assert.equal(parsed.data.basis, "context-shared");
	assert.deepEqual(decodeDebateBody(parsed.data.body), [{ turn: "CONSENSUS", text: "Agreed, ship it", refs: ["commit:abc123", "PR:#42"] }]);
});

test("DEBATE_TURN_WIRE_MAPPING matches the spec's marker table exactly, and its basis values are the ones envelope.ts already exports", () => {
	assert.deepEqual(DEBATE_TURN_WIRE_MAPPING.PROPOSAL, { type: "REQUEST" });
	assert.deepEqual(DEBATE_TURN_WIRE_MAPPING.AUDIT, { type: "REPLY" });
	assert.deepEqual(DEBATE_TURN_WIRE_MAPPING.COUNTER, { type: "REPLY" });
	assert.deepEqual(DEBATE_TURN_WIRE_MAPPING.CONSENSUS, { type: "RESOLVED", basis: "context-shared" });
	assert.deepEqual(DEBATE_TURN_WIRE_MAPPING.ESCALATE, { type: "RESOLVED", basis: ABANDON_BASIS_VALUE });
	// Non-vacuous: the two values this table's RESOLVED rows use really are members of envelope.ts's
	// own closed basis set, not coincidentally-matching string literals redeclared here.
	assert.equal((RESOLVED_BASIS_VALUES as readonly string[]).includes(DEBATE_TURN_WIRE_MAPPING.CONSENSUS.basis as string), true);
	assert.equal((RESOLVED_BASIS_VALUES as readonly string[]).includes(DEBATE_TURN_WIRE_MAPPING.ESCALATE.basis as string), true);
});

test("decodeDebateBody returns undefined for an ordinary chat message carrying no marker at all", () => {
	assert.equal(decodeDebateBody("hey, did you see the new deploy?"), undefined);
});

test("decodeDebateBody fails closed (undefined) when the turn is not one of the five known kinds", () => {
	assert.equal(decodeDebateBody("[ARENA-LIGHT:BOGUS] whatever this is"), undefined);
});

test("decodeDebateBody fails closed (undefined) when the verdict is not one of the three known values", () => {
	assert.equal(decodeDebateBody("[ARENA-LIGHT:AUDIT:MAYBE] whatever this is"), undefined);
});

test("decodeDebateBody decodes correctly even when its input has already passed through normalizeBody's newline collapse", () => {
	const marker: DebateTurnMarker = { turn: "COUNTER", verdict: "REJECT", text: "ship it later", refs: ["commit:abc123", "PR:#9"] };
	const encoded = encodeDebateTurn(marker);
	// Simulate what a hand-typed, not-yet-normalized body might have looked like before
	// `normalizeBody` (daemon/send/validate.ts) ever ran on it: a stray newline where a space is now.
	// By the time decodeDebateBody runs in production, that newline is already gone — this proves the
	// decoder does not depend on it being there in the first place.
	const asIfTypedWithNewlines = encoded.replace(" ship it later ", "\nship it later\n");
	const afterNormalize = normalizeBody(asIfTypedWithNewlines);
	assert.deepEqual(decodeDebateBody(afterNormalize), [marker]);
});

test("containsInlinePatchShape is true for a literal 'diff --git' header", () => {
	const diff = "diff --git a/src/foo.ts b/src/foo.ts index abc123..def456 100644";
	assert.equal(containsInlinePatchShape(diff), true);
});

test("containsInlinePatchShape is true for a unified-diff hunk header alone", () => {
	const hunk = "context before @@ -12,7 +12,9 @@ function foo() { context after";
	assert.equal(containsInlinePatchShape(hunk), true);
});

test("containsInlinePatchShape is true for a unified-diff old/new file-header pair", () => {
	const filePair = "--- a/src/foo.ts +++ b/src/foo.ts some trailing text";
	assert.equal(containsInlinePatchShape(filePair), true);
});

test("containsInlinePatchShape is false for pointer-only text: a commit sha, a PR number, a path, a memory id", () => {
	assert.equal(containsInlinePatchShape("commit a1b2c3d, PR #42"), false);
	assert.equal(containsInlinePatchShape("see src/daemon/send/validate.ts:191"), false);
	assert.equal(containsInlinePatchShape("memory id sdd/f5-arena-light-two-party/design"), false);
});

test("containsInlinePatchShape is false for prose that contains only one half of the unified-diff file-header pair", () => {
	assert.equal(containsInlinePatchShape("score went from --- to +50, nothing structured here"), false);
});
