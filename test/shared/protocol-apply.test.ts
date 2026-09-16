import { test } from "node:test";
import assert from "node:assert/strict";

import type { Envelope } from "../../src/shared/envelope.js";
import type { ThreadRecord } from "../../src/shared/thread-record.js";
import {
  applyEnvelope,
  type ApplyContext,
  type IncomingEnvelope,
  type RosterEntry,
} from "../../src/shared/protocol-apply.js";

// Apply-side slice adapted from telegram-agent-bus/test/protocol.test.ts (read-only reference), plus
// the D-05 scenario (design §8.3, THREAT-MODEL §5.7): an unanchored transition is now REJECTED, not
// authorized. `applyEnvelope` here takes the single thread row (or `undefined`) rather than a whole
// `State` — dedup (`isDuplicateEid`, `seen_eids`) moved to the ledger's unique index (design §12).

const SELF = "@dev2-agent";
const PEER = "@dev1-agent";
const OTHER = "@dev3-agent";
const THREAD = "a1b2c3d4e5f6";

function requestEnvelope(overrides: Record<string, unknown> = {}): Envelope {
  return {
    eid: "9f3c1a7e40b2",
    type: "REQUEST",
    from: PEER,
    to: SELF,
    thread: THREAD,
    ts: "2026-08-14T18:04:11Z",
    body: "Please review PR #12",
    ...overrides,
  } as unknown as Envelope;
}

function ackEnvelope(overrides: Record<string, unknown> = {}): Envelope {
  return {
    eid: "2b3c4d5e6f7a",
    type: "ACK",
    from: SELF,
    to: PEER,
    thread: THREAD,
    ts: "2026-08-14T18:05:00Z",
    body: "On it",
    basis: "acknowledged-only",
    ...overrides,
  } as unknown as Envelope;
}

function replyEnvelope(overrides: Record<string, unknown> = {}): Envelope {
  return {
    eid: "5e6f7a8b9c0d",
    type: "REPLY",
    from: SELF,
    to: PEER,
    thread: THREAD,
    ts: "2026-08-14T18:10:00Z",
    body: "which branch should I target?",
    ...overrides,
  } as unknown as Envelope;
}

function resolvedEnvelope(overrides: Record<string, unknown> = {}): Envelope {
  return {
    eid: "3c4d5e6f7a8b",
    type: "RESOLVED",
    from: SELF,
    to: PEER,
    thread: THREAD,
    ts: "2026-08-14T19:00:00Z",
    body: "Reviewed and approved",
    basis: "work-confirmed",
    ...overrides,
  } as unknown as Envelope;
}

function broadcastEnvelope(overrides: Record<string, unknown> = {}): Envelope {
  return {
    eid: "4d5e6f7a8b9c",
    type: "BROADCAST",
    from: PEER,
    to: null,
    thread: "c3d4e5f6a1b2",
    ts: "2026-08-14T18:04:11Z",
    body: "Deploying to staging now",
    ...overrides,
  } as unknown as Envelope;
}

function incoming(envelope: Envelope, overrides: Partial<IncomingEnvelope> = {}): IncomingEnvelope {
  return { envelope, telegram_message_id: 501, message_date: envelope.ts, via: "direct", ...overrides };
}

const OTHER_B = "@dev4-agent";

const ROSTER: Record<string, RosterEntry> = {
  [SELF]: { user_id: 8223456789 },
  [PEER]: { user_id: 8123456789 },
  [OTHER]: { user_id: 8323456789 },
  [OTHER_B]: { user_id: 8423456789 },
};

const CTX: ApplyContext = { agentId: SELF, roster: ROSTER };

/** An open REQUEST from PEER to SELF, anchored on SELF's real user_id (v1's `openThreadFor`). */
function openThreadFor(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    status: "open",
    opened_type: "REQUEST",
    opened_eid: "9f3c1a7e40b2",
    from: PEER,
    to: SELF,
    body: "Please review PR #12",
    opened_at: "2026-08-14T18:04:11Z",
    opened_message_id: 501,
    via: "direct",
    acked_at: null,
    ack_count: 0,
    resolved_at: null,
    resolved_by: null,
    basis: null,
    to_user_id: ROSTER[SELF].user_id,
    group_message_id: null,
    closure_delivered: false,
    awaiting: SELF,
    history: [],
    ...overrides,
  };
}

/**
 * A thread WE opened, addressed to PEER and anchored on PEER's user_id. Most receive-side cases
 * need this direction: the only ACK/RESOLVED that can legitimately ARRIVE is one on a thread we
 * opened (our own replies never come back in through the receive path, ADR-10).
 */
function outboundThread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return openThreadFor({ from: SELF, to: PEER, to_user_id: ROSTER[PEER].user_id, awaiting: PEER, ...overrides });
}

// --- REQUEST opens a thread, anchored on the local roster ---

test("a REQUEST opens a thread with the turn on its addressee, anchored from the local roster", () => {
  const result = applyEnvelope(undefined, incoming(requestEnvelope()), CTX);
  assert.deepEqual(result.outcome, { kind: "opened", thread: THREAD });
  assert.equal(result.thread?.status, "open");
  assert.equal(result.thread?.awaiting, SELF);
  assert.equal(result.thread?.to_user_id, ROSTER[SELF].user_id);
});

test("a REQUEST whose `to` does not resolve in the local roster still opens, with a null anchor", () => {
  const drifted = requestEnvelope({ to: "@dev2-unknown" });
  const result = applyEnvelope(undefined, incoming(drifted), CTX);
  assert.equal(result.thread?.to_user_id, null);
});

test("a REQUEST between two other peers is not this bridge's business and opens no thread", () => {
  const thirdParty = requestEnvelope({ from: OTHER, to: OTHER_B, thread: "bbbbbbbbbbbb" });
  const result = applyEnvelope(undefined, incoming(thirdParty), CTX);
  assert.deepEqual(result.outcome, { kind: "not_mine", thread: "bbbbbbbbbbbb" });
  assert.equal(result.thread, undefined);
});

// --- ACK is non-closing (ADR-09) ---

test("ACK from the addressee keeps the thread open and increments ack_count", () => {
  const first = applyEnvelope(outboundThread(), incoming(ackEnvelope({ from: PEER })), CTX);
  assert.deepEqual(first.outcome, { kind: "acked", thread: THREAD });
  assert.equal(first.thread?.ack_count, 1);
  assert.equal(first.thread?.status, "open");

  const second = applyEnvelope(first.thread, incoming(ackEnvelope({ from: PEER, eid: "aaaaaaaaaaaa" })), CTX);
  assert.equal(second.thread?.ack_count, 2, "a second ACK increments again without closing it");
  assert.equal(second.thread?.status, "open");
});

test("ACK from a non-addressee is rejected and never touches ack_count", () => {
  const result = applyEnvelope(outboundThread(), incoming(ackEnvelope({ from: OTHER })), CTX);
  assert.deepEqual(result.outcome, { kind: "rejected", thread: THREAD, reason: "unauthorized" });
  assert.equal(result.thread, undefined);
});

// --- REPLY moves the turn and touches no first-surfaced flag (design §12 change 2: that state is
//     now the ledger's `client_surfaced`, not this module's business) ---

test("a REPLY from the addressee passes the turn back to the originator and closes nothing", () => {
  const result = applyEnvelope(openThreadFor(), incoming(replyEnvelope({ from: SELF, to: PEER })), CTX);
  assert.deepEqual(result.outcome, { kind: "replied", thread: THREAD });
  assert.equal(result.thread?.status, "open", "a REPLY closes nothing — only RESOLVED does (ADR-07)");
  assert.equal(result.thread?.awaiting, PEER);
  assert.equal(Object.prototype.hasOwnProperty.call(result.thread, "first_surfaced_at"), false);
});

test("a REPLY from the originator hands the turn back to the addressee", () => {
  const existing = openThreadFor({ awaiting: PEER });
  const result = applyEnvelope(existing, incoming(replyEnvelope({ from: PEER, to: SELF })), CTX);
  assert.equal(result.thread?.awaiting, SELF);
});

test("a REPLY from an agent party to neither end of the thread is rejected as unauthorized", () => {
  const result = applyEnvelope(openThreadFor(), incoming(replyEnvelope({ from: OTHER, to: SELF })), CTX);
  assert.deepEqual(result.outcome, { kind: "rejected", thread: THREAD, reason: "unauthorized" });
});

// --- RESOLVED is the only closing transition (ADR-09) ---

test("RESOLVED from the addressee closes the thread and stamps the resolution fields", () => {
  const result = applyEnvelope(outboundThread(), incoming(resolvedEnvelope({ from: PEER, to: SELF })), CTX);
  assert.deepEqual(result.outcome, { kind: "resolved", thread: THREAD });
  assert.equal(result.thread?.status, "resolved");
  assert.equal(result.thread?.resolved_by, PEER);
  assert.equal(result.thread?.basis, "work-confirmed");
  assert.equal(result.thread?.closure_delivered, true);
});

test("a RESOLVED on a thread opened by a BROADCAST is rejected as not_requestable", () => {
  const existing = outboundThread({ opened_type: "BROADCAST", to: null, to_user_id: null });
  const result = applyEnvelope(existing, incoming(resolvedEnvelope({ from: PEER })), CTX);
  assert.deepEqual(result.outcome, { kind: "rejected", thread: THREAD, reason: "not_requestable" });
});

test("a RESOLVED from an agent who was never party to the thread is rejected as unauthorized", () => {
  const result = applyEnvelope(openThreadFor(), incoming(resolvedEnvelope({ from: OTHER })), CTX);
  assert.deepEqual(result.outcome, { kind: "rejected", thread: THREAD, reason: "unauthorized" });
});

test("an unauthorized sender on an ALREADY CLOSED thread is still unauthorized, never stale", () => {
  const closed = openThreadFor({ status: "resolved", resolved_at: "2026-08-14T19:00:00Z", resolved_by: SELF });
  const result = applyEnvelope(closed, incoming(resolvedEnvelope({ from: OTHER })), CTX);
  assert.equal(result.outcome.kind === "rejected" && result.outcome.reason, "unauthorized");
});

test("the legitimate addressee resolving an already-closed thread is stale — a lost race, not an attack", () => {
  const closed = outboundThread({ status: "resolved", resolved_at: "2026-08-14T19:00:00Z", resolved_by: PEER });
  const result = applyEnvelope(closed, incoming(resolvedEnvelope({ from: PEER })), CTX);
  assert.equal(result.outcome.kind === "rejected" && result.outcome.reason, "stale");
});

test("the ORIGINATOR abandoning their own thread is accepted (ADR-13 arm)", () => {
  const abandon = resolvedEnvelope({ from: PEER, to: SELF, basis: "abandoned" });
  const result = applyEnvelope(openThreadFor(), incoming(abandon), CTX);
  assert.equal(result.outcome.kind, "resolved");
  assert.equal(result.thread?.resolved_by, PEER);
});

test("the originator may NOT resolve their own thread with a work basis — only with abandoned", () => {
  const result = applyEnvelope(openThreadFor(), incoming(resolvedEnvelope({ from: PEER, basis: "work-confirmed" })), CTX);
  assert.equal(result.outcome.kind === "rejected" && result.outcome.reason, "unauthorized");
});

// --- D-05: a null identity anchor now fails CLOSED, not open (THREAT-MODEL §5.7, PT-17) ---

test("D-05: a thread transition whose addressee anchor cannot be resolved is rejected as unanchored, not authorized", () => {
  const drifted = outboundThread({ to_user_id: null });
  const result = applyEnvelope(drifted, incoming(resolvedEnvelope({ from: PEER })), CTX);
  assert.deepEqual(result.outcome, { kind: "rejected", thread: THREAD, reason: "unanchored" });
  assert.equal(result.thread, undefined, "the transition must be refused, not merely reported");
});

test("D-05 triangulation: an anchored thread is never rejected as unanchored", () => {
  const result = applyEnvelope(outboundThread(), incoming(resolvedEnvelope({ from: PEER })), CTX);
  assert.equal(result.outcome.kind, "resolved");
});

test("D-05 arm: the originator continuing their own thread still succeeds on a null anchor, and it stays countable", () => {
  // PEER, not SELF, must be the originator here: a REPLY from SELF (`context.agentId`) would hit
  // the separate `isOurOwnSend` bypass (our own sends are never re-judged) instead of the ADR-13
  // `continuingOwnThread` arm this test targets.
  const drifted = openThreadFor({ to_user_id: null });
  const result = applyEnvelope(drifted, incoming(replyEnvelope({ from: PEER, to: SELF })), CTX);
  assert.equal(result.outcome.kind, "replied");
  assert.equal(result.unanchored, true, "the bypass must stay observable, not invisible (C4)");
});

// --- NOTED: a BROADCAST is news, not a thread (T2.5, B3) ---

test("an inbound BROADCAST is recorded as noted and opens no thread", () => {
  const result = applyEnvelope(undefined, incoming(broadcastEnvelope()), CTX);
  assert.deepEqual(result.outcome, { kind: "noted" });
  assert.equal(result.thread, undefined);
});

// --- IGNORED: ACK/RESOLVED referencing a thread this bridge never stored ---

test("an ACK referencing a thread never opened locally is ignored, not stored", () => {
  const result = applyEnvelope(undefined, incoming(ackEnvelope()), CTX);
  assert.deepEqual(result.outcome, { kind: "ignored", thread: THREAD });
  assert.equal(result.thread, undefined);
});
