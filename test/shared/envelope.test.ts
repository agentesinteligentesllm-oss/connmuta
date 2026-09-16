/**
 * Provenance: telegram-agent-bus test/envelope.test.ts @ bf8f365 — verdict: AS-IS (D-08).
 * v1 body sha256: db6cda680cbf23264656eb778bad981c5028b94b5c72f8ae4ad71f1b4e73db7f   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: none.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { MAX_BODY_CHARS, PROTOCOL_SENTINEL, TELEGRAM_MAX_TEXT_CHARS } from "../../src/shared/constants.js";
import {
  ABANDON_BASIS_VALUE,
  RESOLVED_BASIS_VALUES,
  RESOLVED_LOW_RISK_BASIS,
  decodeEnvelope,
  encodeEnvelope,
  encodedTextExceedsTelegramLimit,
  envelopeSchema,
  normalizeBody,
  renderMessageHtml,
  type Envelope,
} from "../../src/shared/envelope.js";
import { deliveredText } from "../fakes/delivered-text.js";

function validRequestEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eid: "9f3c1a7e40b2",
    type: "REQUEST",
    from: "@dev1-agent",
    to: "@dev2-agent",
    thread: "a1b2c3d4e5f6",
    ts: "2026-08-14T18:04:11Z",
    body: "Please review PR #12",
    ...overrides,
  };
}

function validBroadcastEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eid: "1a2b3c4d5e6f",
    type: "BROADCAST",
    from: "@dev1-agent",
    to: null,
    thread: "b2c3d4e5f6a1",
    ts: "2026-08-14T18:04:11Z",
    body: "Deploying to staging now",
    ...overrides,
  };
}

function validAckEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eid: "2b3c4d5e6f7a",
    type: "ACK",
    from: "@dev2-agent",
    to: "@dev1-agent",
    thread: "a1b2c3d4e5f6",
    ts: "2026-08-14T18:05:00Z",
    body: "On it",
    basis: "acknowledged-only",
    ...overrides,
  };
}

function validResolvedEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eid: "3c4d5e6f7a8b",
    type: "RESOLVED",
    from: "@dev2-agent",
    to: "@dev1-agent",
    thread: "a1b2c3d4e5f6",
    ts: "2026-08-14T19:00:00Z",
    body: "Reviewed and approved",
    basis: "work-confirmed",
    ...overrides,
  };
}

// --- Sentinel encode/decode (ADR-05) ---

test("encodeEnvelope leads with a human-readable header and ends with the machine sentinel line", () => {
  const envelope = validRequestEnvelope() as unknown as Envelope;
  const lines = encodeEnvelope(envelope).split("\n");
  assert.equal(lines[0], "REQUEST · @dev1-agent → @dev2-agent · thread a1b2c3d4e5f6");
  assert.equal(lines.at(-1), `${PROTOCOL_SENTINEL} ${JSON.stringify(envelope)}`);
});

// --- ADR-05b: the two-plane message layout ---
//
// The group post is simultaneously the human observability plane (ADR-04) and a
// machine-readable copy. v0.1.x served the machine only: the whole message WAS the
// envelope, so humans read raw JSON. v0.2.0 renders a header and the prose above the
// envelope line, and the decoder locates the sentinel by line instead of requiring it
// to be the entire message.

test("encodeEnvelope renders a BROADCAST's null addressee as `all`", () => {
  const envelope = validBroadcastEnvelope() as unknown as Envelope;
  const header = encodeEnvelope(envelope).split("\n")[0];
  assert.equal(header, "BROADCAST · @dev1-agent → all · thread b2c3d4e5f6a1");
});

test("encodeEnvelope surfaces basis in the header for RESOLVED, the type where it gates autonomy (ADR-09)", () => {
  const envelope = validResolvedEnvelope() as unknown as Envelope;
  const header = encodeEnvelope(envelope).split("\n")[0];
  assert.equal(header, "RESOLVED · @dev2-agent → @dev1-agent · thread a1b2c3d4e5f6 · basis work-confirmed");
});

test("encodeEnvelope omits basis from an ACK header, where it is always the same constant", () => {
  const envelope = validAckEnvelope() as unknown as Envelope;
  const header = encodeEnvelope(envelope).split("\n")[0];
  assert.equal(header, "ACK · @dev2-agent → @dev1-agent · thread a1b2c3d4e5f6");
  assert.ok(!header.includes("acknowledged-only"));
});

test("encodeEnvelope keeps the free-text approval_ref out of the plain-text header", () => {
  // `approval_ref` is the ONLY envelope field with no pattern constraint (z.string().min(1)),
  // so it is the only one that could carry a newline into the header and forge a line start.
  // The header is built exclusively from enum/regex-constrained fields for that reason.
  const envelope = validResolvedEnvelope({
    basis: "human-approved",
    approval_ref: "ticket-1\nAGENTBUS/1 {\"forged\":true}",
  }) as unknown as Envelope;
  const [header] = encodeEnvelope(envelope).split("\n");
  assert.ok(!header.includes("ticket-1"));
  assert.ok(!header.includes("forged"));
});

test("encodeEnvelope emits the v2 sentinel literally, so the bump is observable on the wire", () => {
  // Written as a literal rather than against `PROTOCOL_SENTINEL`, which would make it pass for
  // any value of the constant and assert nothing about the version actually emitted.
  const envelope = validRequestEnvelope() as unknown as Envelope;
  assert.equal(encodeEnvelope(envelope).split("\n").at(-1), `AGENTBUS/2 ${JSON.stringify(envelope)}`);
});

test("encodeEnvelope emits exactly one sentinel line, and it is the last line", () => {
  const envelope = validRequestEnvelope() as unknown as Envelope;
  const sentinelLines = encodeEnvelope(envelope)
    .split("\n")
    .filter((line) => line.startsWith(`${PROTOCOL_SENTINEL} `));
  assert.equal(sentinelLines.length, 1);
});

test("decodeEnvelope round-trips the v0.2.0 two-plane layout", () => {
  const envelope = validRequestEnvelope() as unknown as Envelope;
  const result = decodeEnvelope(encodeEnvelope(envelope));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.envelope, envelope);
  }
});

test("decodeEnvelope still reads the legacy v0.1.x sentinel-only LAYOUT", () => {
  // Backward compatibility is one-directional and load-bearing: a v0.2.0 node must keep
  // reading envelopes already sitting in the group from before the upgrade. (The reverse
  // does NOT hold — see the deployment gate in README/tasks Phase 12.)
  //
  // This pins the LAYOUT (a bare sentinel line, no two-plane framing), which is orthogonal to
  // the sentinel VERSION the line carries — that is pinned separately by the v1 decode suite
  // below. Written with the emitted sentinel deliberately, so it keeps testing the layout of
  // whatever this node currently emits rather than freezing onto one version.
  const envelope = validRequestEnvelope() as unknown as Envelope;
  const legacyWire = `${PROTOCOL_SENTINEL} ${JSON.stringify(envelope)}`;
  const result = decodeEnvelope(legacyWire);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.envelope, envelope);
  }
});

// --- The v1 decode suite (Block 2b) ---
//
// `AGENTBUS/1` is no longer what this node emits, so every literal `/1` string below stopped
// being an incidental fixture and became the regression suite the accept-both decoder has to
// be proven against. They are written as LITERALS, never as `${PROTOCOL_SENTINEL}`: a fixture
// that tracks the emitted constant would follow the next bump and quietly stop testing v1 at
// the exact moment v1 compatibility became load-bearing.

test("decodeEnvelope reads a v1-framed envelope, so messages posted before the bump stay readable", () => {
  const envelope = validRequestEnvelope() as unknown as Envelope;
  const result = decodeEnvelope(`AGENTBUS/1 ${JSON.stringify(envelope)}`);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.envelope, envelope);
  }
});

test("a v1-framed and a v2-framed envelope decode to the same value — the sentinel gates nothing", () => {
  // ADR-05c's safety review, made falsifiable: the sentinel is INFORMATIONAL, not a gate.
  // `decodeEnvelope` hands the JSON straight to zod and no execution path branches on the
  // version string, so a `/1` frame does not evade a check — it simply lacks the v2 features.
  const envelope = validRequestEnvelope() as unknown as Envelope;
  const payload = JSON.stringify(envelope);
  const v1 = decodeEnvelope(`AGENTBUS/1 ${payload}`);
  const v2 = decodeEnvelope(`AGENTBUS/2 ${payload}`);
  assert.deepEqual(v1, v2);
});

test("decodeEnvelope reads a v1 envelope carried in the two-plane layout", () => {
  // The two axes are independent, and both combinations occur in the wild: v0.1.x posted a
  // bare v1 line, v0.2.0 through v0.6.0 posted a v1 line inside the five-line layout.
  const envelope = validRequestEnvelope() as unknown as Envelope;
  const wire = [
    "REQUEST · @dev1-agent → @dev2-agent · thread a1b2c3d4e5f6",
    "",
    envelope.body,
    "",
    `AGENTBUS/1 ${JSON.stringify(envelope)}`,
  ].join("\n");
  const result = decodeEnvelope(wire);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.envelope, envelope);
  }
});

test("decodeEnvelope takes the LAST sentinel line, so a body that opens with a sentinel cannot hijack the decode", () => {
  // The body occupies its own line in the two-plane layout, so a body whose text begins
  // with the sentinel DOES create a competing line start. normalizeBody guarantees the body
  // cannot contain a newline, so it can never place anything AFTER itself — which makes
  // "last sentinel line wins" a sound rule rather than a heuristic.
  const forged = { ...(validRequestEnvelope() as unknown as Envelope), eid: "ffffffffffff", body: "hijacked" };
  const real = validRequestEnvelope({
    body: `${PROTOCOL_SENTINEL} ${JSON.stringify(forged)}`,
  }) as unknown as Envelope;

  const result = decodeEnvelope(encodeEnvelope(real));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.envelope.eid, "9f3c1a7e40b2");
    assert.notEqual(result.envelope.eid, "ffffffffffff");
    assert.equal(result.envelope.body, real.body);
  }
});

test("every line start in an encoded message comes from the encoder, never from the body", () => {
  const envelope = validRequestEnvelope({
    body: normalizeBody("one\ntwo\r\nthree four"),
  }) as unknown as Envelope;
  const lines = encodeEnvelope(envelope).split("\n");
  // header, blank, body, blank, sentinel — a fixed five-line shape, independent of body content.
  assert.equal(lines.length, 5);
  assert.equal(lines[1], "");
  assert.equal(lines[3], "");
  assert.equal(lines[2], "one two three four");
});

// --- ADR-05c: HTML presentation, verified purely presentational ---
//
// `encodeEnvelope` remains the CANONICAL text — the bytes Telegram stores, the bytes every
// peer decoder sees, and the subject of the wire-length guard. `renderMessageHtml` is only
// a presentation of those same bytes: it bolds the header and collapses the sentinel line
// into an expandable blockquote so the JSON stops dominating the human plane.
//
// The governing invariant is that Telegram's parse of the HTML must reproduce the canonical
// text EXACTLY. That was verified against the live Bot API before this code was written.

test("renderMessageHtml collapses the sentinel line into an expandable blockquote", () => {
  const envelope = validRequestEnvelope() as unknown as Envelope;
  const html = renderMessageHtml(envelope);
  assert.ok(html.includes("<blockquote expandable>"), "the machine plane must be collapsible");
  assert.ok(html.includes(`AGENTBUS/2 ${JSON.stringify(envelope)}</blockquote>`));
  assert.ok(html.startsWith("<b>"), "the header should read as a heading");
});

test("renderMessageHtml escapes the three characters HTML parsing would otherwise consume", () => {
  const envelope = validRequestEnvelope({ body: "a < b & c > d" }) as unknown as Envelope;
  const html = renderMessageHtml(envelope);
  assert.ok(html.includes("a &lt; b &amp; c &gt; d"), "body must be escaped in the human plane");
  // The same three characters also appear inside the JSON payload and must be escaped there.
  assert.ok(!/[^&]&(?!amp;|lt;|gt;)/.test(html), "no bare ampersand may survive escaping");
});

test("Telegram's parse of renderMessageHtml reproduces encodeEnvelope byte for byte", () => {
  const envelope = validRequestEnvelope() as unknown as Envelope;
  assert.equal(deliveredText(renderMessageHtml(envelope)), encodeEnvelope(envelope));
});

test("the canonical-text invariant survives a body built to break HTML parsing", () => {
  // The exact hostile body used against the live Bot API on 2026-08-15.
  const envelope = validRequestEnvelope({
    body: normalizeBody(
      "Format probe: a < b & c > d, quoted “work-confirmed”, tag-like <blockquote>, entity-like &amp; and &lt; literals."
    ),
  }) as unknown as Envelope;

  const delivered = deliveredText(renderMessageHtml(envelope));
  assert.equal(delivered, encodeEnvelope(envelope));

  // And what a peer decodes out of that delivered text must be the original envelope.
  const result = decodeEnvelope(delivered);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.envelope, envelope);
  }
});

test("renderMessageHtml is presentation only — it never changes the length the wire guard measures", () => {
  // The Bot API's 4096 limit applies "after entities parsing", so the guard must keep
  // measuring the canonical text, not the longer HTML payload.
  const envelope = validRequestEnvelope() as unknown as Envelope;
  assert.ok(renderMessageHtml(envelope).length > encodeEnvelope(envelope).length);
  assert.equal(deliveredText(renderMessageHtml(envelope)).length, encodeEnvelope(envelope).length);
});

test("decodeEnvelope round-trips a valid encoded envelope", () => {
  const envelope = validRequestEnvelope() as unknown as Envelope;
  const encoded = encodeEnvelope(envelope);
  const result = decodeEnvelope(encoded);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.envelope, envelope);
  }
});

test("decodeEnvelope skips an unknown sentinel version without throwing", () => {
  // `/9` rather than `/2`: this test named the next version as the unknown one, which made it
  // fail on the bump — correctly and by design. The version has to be one no release will
  // plausibly reach, or the assertion re-expires on every wire change.
  const payload = JSON.stringify(validRequestEnvelope());
  assert.doesNotThrow(() => decodeEnvelope(`AGENTBUS/9 ${payload}`));
  const result = decodeEnvelope(`AGENTBUS/9 ${payload}`);
  assert.deepEqual(result, { ok: false, reason: "unsupported_version" });
});

test("an unsupported version is reported as unsupported_version, never as malformed", () => {
  // The diagnostic distinction that justifies the bump on its own (Block 2b). `malformed` sends
  // a developer hunting for a parser bug over a payload that parses perfectly; the version
  // reason says "update the package". Pinned against a WELL-FORMED payload, so the only thing
  // separating the two outcomes is the sentinel.
  //
  // The version is checked BEFORE the payload is parsed, deliberately: an unknown version makes
  // no promise about its payload's shape, so parsing it proves nothing. That ordering is why the
  // contrasting case below has to carry a SUPPORTED sentinel — it is the only way to reach the
  // parser at all.
  const payload = JSON.stringify(validRequestEnvelope());
  assert.deepEqual(decodeEnvelope(`AGENTBUS/9 ${payload}`), { ok: false, reason: "unsupported_version" });
  assert.deepEqual(decodeEnvelope(`${PROTOCOL_SENTINEL} {not-json`), { ok: false, reason: "malformed" });
});

test("decodeEnvelope treats plain human chat text as non-envelope, not an error", () => {
  const result = decodeEnvelope("hey did anyone deploy staging yet?");
  assert.deepEqual(result, { ok: false, reason: "non_envelope" });
});

test("decodeEnvelope treats a sentinel with invalid JSON as malformed, not an error", () => {
  const result = decodeEnvelope("AGENTBUS/1 {not-json");
  assert.deepEqual(result, { ok: false, reason: "malformed" });
});

test("decodeEnvelope treats a sentinel-prefixed JSON object missing a required field as malformed", () => {
  const broken = validRequestEnvelope();
  delete broken.thread;
  const result = decodeEnvelope(`${PROTOCOL_SENTINEL} ${JSON.stringify(broken)}`);
  assert.deepEqual(result, { ok: false, reason: "malformed" });
});

// --- REPLY: the multi-turn type (T3.1, B1) ---

function validReplyEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eid: "3c4d5e6f7a8b",
    type: "REPLY",
    from: "@dev2-agent",
    to: "@dev1-agent",
    thread: "a1b2c3d4e5f6",
    ts: "2026-08-14T18:06:00Z",
    body: "which branch should I target?",
    ...overrides,
  };
}

test("envelopeSchema accepts a well-formed REPLY", () => {
  assert.equal(envelopeSchema.safeParse(validReplyEnvelope()).success, true);
});

test("envelopeSchema requires a non-null `to` on a REPLY — a reply is always addressed", () => {
  assert.equal(envelopeSchema.safeParse(validReplyEnvelope({ to: null })).success, false);
});

test("envelopeSchema forbids `basis` on a REPLY", () => {
  // `basis` is the autonomy boundary (ADR-06 L4): it says something about work being CLOSED.
  // A reply closes nothing, so carrying one would let a continuation masquerade as a resolution.
  for (const basis of RESOLVED_BASIS_VALUES) {
    assert.equal(envelopeSchema.safeParse(validReplyEnvelope({ basis })).success, false, `basis ${basis} must be rejected`);
  }
  assert.equal(envelopeSchema.safeParse(validReplyEnvelope({ basis: "acknowledged-only" })).success, false);
});

test("a REPLY header names the type, so the human plane never reads a continuation as an acknowledgement", () => {
  // The observability plane would lie if a substantive answer rendered as `ACK` — which is the
  // concrete reason Block 2 rejected overloading ACK rather than minting a type.
  const envelope = validReplyEnvelope() as unknown as Envelope;
  const [header] = encodeEnvelope(envelope).split("\n");
  assert.equal(header, "REPLY · @dev2-agent → @dev1-agent · thread a1b2c3d4e5f6");
});

test("a REPLY round-trips through encode/decode unchanged", () => {
  const envelope = validReplyEnvelope({ to_user_id: 8123456789 }) as unknown as Envelope;
  const result = decodeEnvelope(encodeEnvelope(envelope));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.envelope, envelope);
  }
});

test("a REPLY framed as AGENTBUS/1 still decodes — the sentinel is informational, not a gate", () => {
  // The claim Block 2b's safety review made, now testable because REPLY exists. Nothing branches
  // on the sentinel: `decodeEnvelope` hands the JSON straight to zod, so the schema is the only
  // authority and a `/1` frame evades no check. Rejecting by frame would be a SECOND mechanism
  // for a decision the schema already owns — exactly the trap that killed per-message versioning.
  const envelope = validReplyEnvelope() as unknown as Envelope;
  const result = decodeEnvelope(`AGENTBUS/1 ${JSON.stringify(envelope)}`);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.envelope.type, "REPLY");
  }
});

// --- to_user_id: the identity anchor on the wire (T3.2, C4's remaining half) ---

test("envelopeSchema accepts to_user_id on an addressed envelope", () => {
  const result = envelopeSchema.safeParse(validRequestEnvelope({ to_user_id: 8223456789 }));
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.to_user_id, 8223456789);
  }
});

test("envelopeSchema accepts an addressed envelope WITHOUT to_user_id — a v1 peer never sends one", () => {
  // The load-bearing compatibility rule. Making the field required for addressed types would
  // reject every envelope produced by v0.1.0 through v0.6.0 as `malformed`, which is precisely
  // the silent-discard failure the accept-both decoder exists to avoid. Optional on the wire,
  // always emitted by us.
  const result = envelopeSchema.safeParse(validRequestEnvelope());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.to_user_id, undefined);
  }
});

test("envelopeSchema rejects to_user_id on a BROADCAST, which has no addressee to anchor", () => {
  const result = envelopeSchema.safeParse(validBroadcastEnvelope({ to_user_id: 8223456789 }));
  assert.equal(result.success, false);
});

test("envelopeSchema rejects a non-integer to_user_id", () => {
  assert.equal(envelopeSchema.safeParse(validRequestEnvelope({ to_user_id: 1.5 })).success, false);
  assert.equal(envelopeSchema.safeParse(validRequestEnvelope({ to_user_id: "8223456789" })).success, false);
});

test("encodeEnvelope round-trips to_user_id through the wire", () => {
  const envelope = validRequestEnvelope({ to_user_id: 8223456789 }) as unknown as Envelope;
  const result = decodeEnvelope(encodeEnvelope(envelope));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.envelope.to_user_id, 8223456789);
  }
});

test("to_user_id stays out of the human-plane header", () => {
  // The header is for humans and a numeric Telegram id tells them nothing. It is also the third
  // field to be kept out on purpose — see `approval_ref` — so the rule is worth pinning: the
  // header carries what a reader can act on, and the JSON carries what the machine needs.
  const envelope = validRequestEnvelope({ to_user_id: 8223456789 }) as unknown as Envelope;
  const [header] = encodeEnvelope(envelope).split("\n");
  assert.ok(!header.includes("8223456789"));
});

// --- eid / thread hex-id shape ---

test("envelopeSchema rejects an eid that is not 12 lowercase hex characters", () => {
  const result = envelopeSchema.safeParse(validRequestEnvelope({ eid: "NOT-HEX-1234" }));
  assert.equal(result.success, false);
});

test("envelopeSchema accepts a well-formed eid and thread", () => {
  const result = envelopeSchema.safeParse(validRequestEnvelope());
  assert.equal(result.success, true);
});

test("envelopeSchema rejects a missing thread on any type, including BROADCAST", () => {
  const broadcast = validBroadcastEnvelope();
  delete broadcast.thread;
  const result = envelopeSchema.safeParse(broadcast);
  assert.equal(result.success, false);
});

// --- to: required unless BROADCAST, forbidden (must be null) for BROADCAST ---

test("envelopeSchema accepts BROADCAST with to === null", () => {
  const result = envelopeSchema.safeParse(validBroadcastEnvelope());
  assert.equal(result.success, true);
});

test("envelopeSchema rejects BROADCAST with a non-null to", () => {
  const result = envelopeSchema.safeParse(validBroadcastEnvelope({ to: "@dev2-agent" }));
  assert.equal(result.success, false);
});

test("envelopeSchema rejects REQUEST with to === null", () => {
  const result = envelopeSchema.safeParse(validRequestEnvelope({ to: null }));
  assert.equal(result.success, false);
});

// --- basis on ACK: only the bridge-stamped acknowledged-only value is valid ---

test("envelopeSchema accepts ACK with basis === acknowledged-only", () => {
  const result = envelopeSchema.safeParse(validAckEnvelope());
  assert.equal(result.success, true);
});

test("envelopeSchema rejects ACK carrying a RESOLVED-only basis value", () => {
  const result = envelopeSchema.safeParse(validAckEnvelope({ basis: "human-approved" }));
  assert.equal(result.success, false);
});

test("envelopeSchema rejects ACK with no basis at all", () => {
  const ack = validAckEnvelope();
  delete ack.basis;
  const result = envelopeSchema.safeParse(ack);
  assert.equal(result.success, false);
});

// --- basis on RESOLVED: required, four low-risk + human-approved+approval_ref (fail closed) ---

test("envelopeSchema accepts RESOLVED with a low-risk basis and no approval_ref", () => {
  const result = envelopeSchema.safeParse(validResolvedEnvelope());
  assert.equal(result.success, true);
});

test("envelopeSchema rejects RESOLVED with no basis", () => {
  const resolved = validResolvedEnvelope();
  delete resolved.basis;
  const result = envelopeSchema.safeParse(resolved);
  assert.equal(result.success, false);
});

test("envelopeSchema rejects RESOLVED with basis=human-approved and no approval_ref", () => {
  const result = envelopeSchema.safeParse(validResolvedEnvelope({ basis: "human-approved" }));
  assert.equal(result.success, false);
});

test("envelopeSchema accepts RESOLVED with basis=human-approved and a non-empty approval_ref", () => {
  const result = envelopeSchema.safeParse(
    validResolvedEnvelope({ basis: "human-approved", approval_ref: "dev1 approved in group chat 18:10" })
  );
  assert.equal(result.success, true);
});

test("envelopeSchema rejects RESOLVED with the ACK-only acknowledged-only basis value", () => {
  const result = envelopeSchema.safeParse(validResolvedEnvelope({ basis: "acknowledged-only" }));
  assert.equal(result.success, false);
});

test("envelopeSchema rejects approval_ref present when basis is not human-approved", () => {
  const result = envelopeSchema.safeParse(
    validResolvedEnvelope({ basis: "context-shared", approval_ref: "unexpected" })
  );
  assert.equal(result.success, false);
});

// --- basis forbidden on BROADCAST / REQUEST ---

test("envelopeSchema rejects BROADCAST carrying a basis field", () => {
  const result = envelopeSchema.safeParse(validBroadcastEnvelope({ basis: "context-shared" }));
  assert.equal(result.success, false);
});

test("envelopeSchema rejects REQUEST carrying a basis field", () => {
  const result = envelopeSchema.safeParse(validRequestEnvelope({ basis: "context-shared" }));
  assert.equal(result.success, false);
});

// --- MAX_BODY_CHARS cap ---

test("envelopeSchema accepts a body exactly at MAX_BODY_CHARS", () => {
  const result = envelopeSchema.safeParse(validRequestEnvelope({ body: "x".repeat(MAX_BODY_CHARS) }));
  assert.equal(result.success, true);
});

test("envelopeSchema rejects a body one character over MAX_BODY_CHARS", () => {
  const result = envelopeSchema.safeParse(validRequestEnvelope({ body: "x".repeat(MAX_BODY_CHARS + 1) }));
  assert.equal(result.success, false);
});

// --- T3-c: identical bytes regardless of which channel later carries them (Phase 7 concern, tested at the encode boundary here) ---

test("encodeEnvelope produces byte-identical output for two independently-built copies of the same logical envelope", () => {
  const groupCopy = validRequestEnvelope() as unknown as Envelope;
  const directCopy = validRequestEnvelope() as unknown as Envelope; // separately constructed, same field values
  assert.equal(encodeEnvelope(groupCopy), encodeEnvelope(directCopy));
});

// --- Body normalization: ADR-05's legibility premise, enforced structurally ---
//
// ADR-05 accepts a raw-JSON group post on the explicit premise that "`body` carries
// plain prose and stays legible inline". That premise only holds for single-line,
// escape-free prose: `JSON.stringify` turns an embedded newline into a literal `\n`
// and an embedded double quote into `\"`, both of which render as visible garbage in
// the shared group. `normalizeBody` makes the premise an invariant instead of a hope.

test("normalizeBody collapses newlines into single spaces", () => {
  assert.equal(normalizeBody("first line\nsecond line"), "first line second line");
});

test("normalizeBody collapses CRLF and blank-line runs into a single space", () => {
  assert.equal(normalizeBody("intro\r\n\r\nbody"), "intro body");
});

test("normalizeBody collapses tabs and repeated spaces into a single space", () => {
  assert.equal(normalizeBody("a\t\tb   c"), "a b c");
});

test("normalizeBody trims leading and trailing whitespace", () => {
  assert.equal(normalizeBody("  padded  "), "padded");
});

test("normalizeBody strips control characters", () => {
  assert.equal(normalizeBody("clean\u0000\u0007text"), "cleantext");
});

test("normalizeBody rewrites straight double quotes to typographic quotes so JSON never escapes them", () => {
  assert.equal(normalizeBody('reply with basis "work-confirmed"'), "reply with basis \u201cwork-confirmed\u201d");
});

test("normalizeBody leaves already-clean single-line prose untouched", () => {
  const clean = "Confirm your bridge is live and reply ACK.";
  assert.equal(normalizeBody(clean), clean);
});

test("normalizeBody is idempotent", () => {
  const messy = '  line one\n\nline two "quoted"  ';
  assert.equal(normalizeBody(normalizeBody(messy)), normalizeBody(messy));
});

test("normalizeBody never lengthens a body, so the MAX_BODY_CHARS pre-check stays a valid upper bound", () => {
  const messy = "a\n\n\nb\t\tc   d";
  assert.ok(normalizeBody(messy).length <= messy.length);
});

test("a normalized body produces an encoded envelope with no visible escape sequences", () => {
  const envelope = validRequestEnvelope({
    body: normalizeBody('Phase 12.2 check.\n\nReply ACK, then RESOLVED with basis "work-confirmed".'),
  }) as unknown as Envelope;
  const encoded = encodeEnvelope(envelope);
  // The subject is the two-character sequences JSON escaping makes VISIBLE to a human
  // reading the group — backslash-n and backslash-quote — not real newlines, which the
  // two-plane layout now uses deliberately to separate the header, body, and sentinel.
  assert.ok(!encoded.includes("\\n"), "encoded text must not contain a visible \\n escape");
  assert.ok(!encoded.includes('\\"'), 'encoded text must not contain a visible \\" escape');
});

// --- Wire-length guard: TELEGRAM_MAX_TEXT_CHARS was dead code until now ---

test("encodedTextExceedsTelegramLimit is false for an ordinary envelope", () => {
  const envelope = validRequestEnvelope() as unknown as Envelope;
  assert.equal(encodedTextExceedsTelegramLimit(encodeEnvelope(envelope)), false);
});

test("encodedTextExceedsTelegramLimit is true once JSON escaping pushes a within-cap body over Telegram's ceiling", () => {
  // A body of backslashes is within MAX_BODY_CHARS but each one escapes to two
  // characters, so the wire text lands far past TELEGRAM_MAX_TEXT_CHARS.
  const envelope = validRequestEnvelope({ body: "\\".repeat(MAX_BODY_CHARS) }) as unknown as Envelope;
  const encoded = encodeEnvelope(envelope);
  assert.ok(encoded.length > TELEGRAM_MAX_TEXT_CHARS);
  assert.equal(encodedTextExceedsTelegramLimit(encoded), true);
});

test("encodedTextExceedsTelegramLimit is false at exactly TELEGRAM_MAX_TEXT_CHARS", () => {
  assert.equal(encodedTextExceedsTelegramLimit("x".repeat(TELEGRAM_MAX_TEXT_CHARS)), false);
});

test("encodedTextExceedsTelegramLimit is true one character over TELEGRAM_MAX_TEXT_CHARS", () => {
  assert.equal(encodedTextExceedsTelegramLimit("x".repeat(TELEGRAM_MAX_TEXT_CHARS + 1)), true);
});

// --- ADR-13: `abandoned` sits outside the low-risk set, and that placement is asserted, not assumed ---

test("abandoned is a valid RESOLVED basis but is NOT a member of the ADR-06 L4 low-risk set", () => {
  // ADR-06 L4's fail-closed claim rests on RESOLVED_LOW_RISK_BASIS mapping 1:1 to the spec's
  // exhaustive low-risk list. Appending to it silently would erode that provenance, so the
  // separation is pinned here rather than left to a comment.
  //
  // Stated plainly, because ADR-12's own rule forbids overclaiming: the split is DOCUMENTARY.
  // RESOLVED_LOW_RISK_BASIS has no independent enforcement anywhere in production code — the
  // mechanical boundary is the enum itself (no value exists for an unlisted action) plus the
  // approval_ref requirement on human-approved. This test guards the provenance, not a runtime gate.
  assert.ok((RESOLVED_BASIS_VALUES as readonly string[]).includes(ABANDON_BASIS_VALUE));
  assert.ok(
    !(RESOLVED_LOW_RISK_BASIS as readonly string[]).includes(ABANDON_BASIS_VALUE),
    "abandoned must not be folded into the spec's exhaustive low-risk list"
  );
  assert.deepEqual([...RESOLVED_LOW_RISK_BASIS], ["context-shared", "work-confirmed", "lock-released"]);
});

test("an abandoned RESOLVED needs no approval_ref, and is rejected if one is supplied", () => {
  const base = { eid: "aaaaaaaaaaaa", type: "RESOLVED", from: "@dev1-agent", to: "@dev2-agent", thread: "bbbbbbbbbbbb", ts: "2026-08-15T00:00:00Z", body: "standing down" };

  assert.equal(envelopeSchema.safeParse({ ...base, basis: "abandoned" }).success, true);
  assert.equal(
    envelopeSchema.safeParse({ ...base, basis: "abandoned", approval_ref: "ticket-9" }).success,
    false,
    "approval_ref remains bound to human-approved alone"
  );
});
