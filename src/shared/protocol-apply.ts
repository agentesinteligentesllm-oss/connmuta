/**
 * Provenance: telegram-agent-bus src/protocol.ts:1-333 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: e8b6f8a427d57f3133e088d7fe8659f66e41ba2c259e57050d30e1514a2ffcbe   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: (1) `ThreadRecord` from `shared/thread-record.ts`; (2) REPLY branch no longer touches
 * `first_surfaced_at`; (3) D-05 `isAddressee`/`classifyRejection` fail closed with reason
 * `unanchored`; (4) `isDuplicateEid` unused (dedup is the index).
 */

import { MAX_THREAD_HISTORY } from "./constants.js";
import { ABANDON_BASIS_VALUE, type Envelope } from "./envelope.js";
import type { HistoryEntry, ThreadRecord } from "./thread-record.js";

/** One decoded envelope as observed by `getUpdates`, carrying the Telegram-side metadata this module needs. */
export interface IncomingEnvelope {
  envelope: Envelope;
  telegram_message_id: number;
  /** Telegram's own `message.date` (ISO 8601) — the authoritative "first-seen" time. Never the envelope's own `ts`. */
  message_date: string;
  via: "direct" | "group";
}

export type ApplyOutcome =
  | { kind: "duplicate" }
  | { kind: "opened"; thread: string }
  | { kind: "acked"; thread: string }
  /** An in-thread continuation from either participant; moves the turn, closes nothing (B1). */
  | { kind: "replied"; thread: string }
  | { kind: "resolved"; thread: string }
  | { kind: "ignored"; thread: string }
  /** Recorded and surfaced, but deliberately threadless — a BROADCAST is news, not work (B3). */
  | { kind: "noted" }
  /** A thread between two OTHER peers: not this bridge's business, and no row is stored for it (C2). */
  | { kind: "not_mine"; thread: string }
  /** The transition was refused by the receive-side predicate (C1, C3, D-05). */
  | { kind: "rejected"; thread: string; reason: RejectionReason };

/**
 * Why a state transition was refused. Mirrors the send-side codes 1:1, deliberately —
 * `not_requestable` is a strictly finer partition of `unauthorized`, and nothing moves into `stale`.
 * `unanchored` is new for D-05: a thread whose identity anchor cannot be resolved is refused,
 * never waved through (THREAT-MODEL §5.7, PT-17).
 */
export type RejectionReason = "not_requestable" | "unauthorized" | "stale" | "unanchored";

/**
 * The one field this module reads off a roster entry: the numeric identity anchor (C4).
 * `daemon/binding-config.ts` (not built yet) owns the full roster entry shape; this shared module
 * stays free of that daemon-side dependency and asks for no more than it uses.
 */
export interface RosterEntry {
  user_id: number;
}

/**
 * What the bridge needs to know to decide whether an envelope is ITS business.
 *
 * Passed explicitly rather than defaulted, so every call site is forced to answer the question. The
 * alternative — an optional context that stores everything when omitted — would make a wiring
 * mistake invisible, and this predicate is what keeps a peer from writing into local state.
 */
export interface ApplyContext {
  agentId: string;
  roster: Record<string, RosterEntry>;
}

/**
 * Whether this bridge is a party to `envelope`, and therefore whether the thread belongs in local
 * state (C2, F1).
 *
 * The last clause is the one that matters, and it fails **toward storing**: an addressee this
 * machine cannot resolve may be *us* under a name our own `conmuta.json` does not know we answer to,
 * and discarding it would be a silent black hole for a request genuinely addressed here. Storing a
 * stranger's thread merely costs a row.
 */
function isOurBusiness(envelope: Envelope, context: ApplyContext): boolean {
  if (envelope.from === context.agentId || envelope.to === context.agentId) {
    return true;
  }
  if (envelope.to === null) {
    return true;
  }
  return !(envelope.to in context.roster);
}

export interface ApplyResult {
  /**
   * The thread row to persist (`ledger/threads.ts` adapter, design §8.2 step 7), present only when
   * this transition opened or updated one. Absent for `noted`, `not_mine`, `ignored`, `rejected`,
   * and `duplicate` — none of those touch a thread row.
   */
  thread?: ThreadRecord;
  outcome: ApplyOutcome;
  /**
   * Set when the addressee check was bypassed only because the thread carries no identity anchor
   * (C4) AND the originator's own arm authorized the transition anyway (ADR-13, D-05). The bypass
   * is correct, but it must stay countable rather than invisible.
   */
  unanchored?: true;
}

/**
 * Whether the verified sender is the thread's addressee, anchored on `user_id` (C4).
 *
 * `to` is stored in the SENDER's namespace and never translated, so comparing it against the
 * receiver's namespace is a live black hole under roster drift. The anchor is a number our own
 * roster produced, which no rename on either side can break.
 *
 * A null anchor FAILS CLOSED (D-05, THREAT-MODEL §5.7): v1 failed open here, and the residual
 * showed why that was wrong — an unresolved anchor is exactly the state a forged or drifted `to`
 * produces, so accepting it unconditionally handed a stranger the same standing as the real
 * addressee. Refusing it costs nothing a real peer needs: the ADR-13 originator arms
 * (`abandoningOwnThread`, `continuingOwnThread`) authorize the one legitimate case this predicate
 * cannot — the thread's own originator acting on it — without touching the anchor at all.
 */
function isAddressee(
  envelope: Envelope,
  existing: ThreadRecord,
  context: ApplyContext
): { authorized: boolean; unanchored: boolean } {
  if (existing.to_user_id === null) {
    return { authorized: false, unanchored: true };
  }
  const senderUserId = context.roster[envelope.from]?.user_id;
  return { authorized: senderUserId !== undefined && senderUserId === existing.to_user_id, unanchored: false };
}

/**
 * The receive-side predicate (C1, C3, D-05). Returns the rejection reason, or `null` when the
 * transition is allowed.
 *
 * **Authorization is evaluated BEFORE state, and that order is load-bearing.** If `status` were
 * checked first, a third party resolving an already-closed thread would land in the benign `stale`
 * bucket and the counter that should scream would go mute. It is not a style preference — it is what
 * keeps the metric honest.
 *
 * The second arm of the authorization `OR` is ADR-13: `abandoned` is the one closure that belongs to
 * the ORIGINATOR rather than the addressee. The obvious rule — `from === existing.to` — silently
 * breaks it, which is why a test exists that fails if the arm is removed.
 */
function classifyRejection(
  envelope: Envelope,
  existing: ThreadRecord,
  context: ApplyContext
): { reason: RejectionReason } | { reason: null; unanchored: boolean } {
  if (existing.opened_type !== "REQUEST") {
    return { reason: "not_requestable" };
  }

  const addressee = isAddressee(envelope, existing, context);
  const abandoningOwnThread =
    envelope.type === "RESOLVED" && envelope.basis === ABANDON_BASIS_VALUE && envelope.from === existing.from;
  // A REPLY is the one type EITHER participant may send, so the originator authorizes through this
  // arm rather than the addressee check. It is a widening of who may act, never of what they may
  // do: a reply cannot close a thread, cannot carry a basis, and cannot reopen a resolved one.
  const continuingOwnThread = envelope.type === "REPLY" && envelope.from === existing.from;
  if (!addressee.authorized && !abandoningOwnThread && !continuingOwnThread) {
    return { reason: addressee.unanchored ? "unanchored" : "unauthorized" };
  }

  // RESOLVED is terminal (ADR-07), so a REPLY arriving after it is refused for the same reason a
  // second RESOLVED is — the thread is closed, and reopening it through a type that cannot close
  // it again would leave a thread nobody is able to shut.
  if (existing.status === "resolved" && (envelope.type === "RESOLVED" || envelope.type === "REPLY")) {
    return { reason: "stale" };
  }

  return { reason: null, unanchored: addressee.unanchored && !abandoningOwnThread };
}

/**
 * Appends one in-thread message to a thread's log, capped at {@link MAX_THREAD_HISTORY} (B2).
 *
 * The opening message is deliberately NOT in here — it lives in `ThreadRecord.body`, which makes
 * it structurally unlosable no matter how long the exchange runs.
 *
 * Stored canonical, never wrapped: `wrapUntrusted` belongs at the point text is SURFACED to an
 * agent, not at the point it is written to disk, so the stored form stays exactly what arrived and
 * the fence cannot be double-applied by a later reader.
 */
function appendHistory(existing: ThreadRecord, incoming: IncomingEnvelope): HistoryEntry[] {
  const entry: HistoryEntry = {
    eid: incoming.envelope.eid,
    type: incoming.envelope.type,
    from: incoming.envelope.from,
    body: incoming.envelope.body,
    at: incoming.message_date,
    via: incoming.via,
  };
  const next = [...existing.history, entry];
  return next.length > MAX_THREAD_HISTORY ? next.slice(-MAX_THREAD_HISTORY) : next;
}

/**
 * Applies one incoming envelope to `existing` — the single thread row this envelope's `thread` id
 * already resolved to, loaded by the `ledger/threads.ts` adapter, or `undefined` when no such row
 * exists yet (design §8.2 step 7). Dedup no longer lives here: the ledger's unique index rejects a
 * replay before this function is ever called, so `isDuplicateEid` and `seen_eids` have no successor.
 *
 * REQUEST opens a thread, ACK increments `ack_count` and leaves `status` untouched (never closing),
 * and only RESOLVED sets `status: "resolved"`.
 */
export function applyEnvelope(existing: ThreadRecord | undefined, incoming: IncomingEnvelope, context: ApplyContext): ApplyResult {
  const { envelope, message_date, via, telegram_message_id } = incoming;

  // A BROADCAST opens no thread (B3, F1). Nothing has ever been able to read or close one:
  // `isNeedsAction` requires `opened_type === "REQUEST"`, and both ACK and RESOLVED reject it as
  // NOT_REQUESTABLE. It was pure unbounded storage.
  if (envelope.type === "BROADCAST") {
    return { outcome: { kind: "noted" } };
  }

  if (envelope.type === "REQUEST" && !isOurBusiness(envelope, context)) {
    return { outcome: { kind: "not_mine", thread: envelope.thread } };
  }

  if (envelope.type === "REQUEST") {
    const opened: ThreadRecord = {
      status: "open",
      opened_type: envelope.type,
      opened_eid: envelope.eid,
      from: envelope.from,
      to: envelope.to,
      body: envelope.body,
      opened_at: message_date,
      opened_message_id: telegram_message_id,
      via,
      acked_at: null,
      ack_count: 0,
      resolved_at: null,
      resolved_by: null,
      basis: null,
      // The identity anchor (C4). The WIRE value wins over the local lookup, and that ordering is
      // the point of T3.2 rather than a preference: the sender's roster is authoritative about who
      // it addressed, while our lookup can only answer for a name we already recognise. Keeping
      // the wire number even when no local entry claims it turns a fail-open into a real anchor —
      // a later ACK from that very account then authorizes correctly instead of being waved
      // through unchecked. `null` only when neither source can answer, where `isAddressee` now
      // fails CLOSED for the reason documented there (D-05).
      to_user_id: envelope.to_user_id ?? (envelope.to !== null ? (context.roster[envelope.to]?.user_id ?? null) : null),
      // The group copy is the one a human reply can be anchored to (E1). Captured here only when
      // this first copy came from the group; a later duplicate's additive capture is the ledger
      // admission pipeline's concern now (design §8.2 step 6), not this module's.
      group_message_id: via === "group" ? telegram_message_id : null,
      closure_delivered: false,
      awaiting: envelope.to,
      history: [],
    };
    return { thread: opened, outcome: { kind: "opened", thread: envelope.thread } };
  }

  if (!existing) {
    // ACK/RESOLVED/REPLY referencing a thread this bridge never saw opened — nothing to update.
    return { outcome: { kind: "ignored", thread: envelope.thread } };
  }

  // Our own outbound envelopes skip this: `checkLoopPrevention` is the gate on the send path, and
  // re-running the receive-side predicate here would double-judge a decision already made. This is
  // not a hole — an INBOUND envelope can never arrive with `from` equal to our own id, because the
  // admission pipeline overwrites `from` with the reverse-roster lookup of the real Telegram sender
  // and then self-filters that case out entirely (ADR-10).
  const isOurOwnSend = envelope.from === context.agentId;
  const verdict: ReturnType<typeof classifyRejection> = isOurOwnSend
    ? { reason: null, unanchored: false }
    : classifyRejection(envelope, existing, context);
  if (verdict.reason !== null) {
    return { outcome: { kind: "rejected", thread: envelope.thread, reason: verdict.reason } };
  }
  const unanchored = verdict.unanchored ? ({ unanchored: true } as const) : {};

  if (envelope.type === "ACK") {
    const acked: ThreadRecord = {
      ...existing,
      ack_count: existing.ack_count + 1,
      acked_at: existing.acked_at ?? message_date,
      history: appendHistory(existing, incoming),
      // status is deliberately left untouched: ACK never closes a thread (ADR-09). Neither is
      // `awaiting`, and that is the same distinction seen from the turn's side: an ACK says
      // "received, not yet answered", so the obligation it acknowledges is still owed. If it
      // moved the turn, every request would read as answered the moment it was read.
    };
    return { thread: acked, outcome: { kind: "acked", thread: envelope.thread }, ...unanchored };
  }

  if (envelope.type === "REPLY") {
    const replied: ThreadRecord = {
      ...existing,
      // The turn always passes to the OTHER participant, derived from the message sequence rather
      // than carried on the wire — a sender-declared turn would be forgeable, and divergence can
      // only come from message loss, which already desynchronizes `status`.
      awaiting: envelope.from === existing.from ? existing.to : existing.from,
      history: appendHistory(existing, incoming),
      // status untouched: a REPLY closes nothing (ADR-07).
    };
    return { thread: replied, outcome: { kind: "replied", thread: envelope.thread }, ...unanchored };
  }

  // RESOLVED — the only type that closes a thread (ADR-09).
  const resolved: ThreadRecord = {
    ...existing,
    status: "resolved",
    resolved_at: message_date,
    resolved_by: envelope.from,
    basis: envelope.basis ?? null,
    // Reaching here means the envelope was delivered or received; the one path that closes a thread
    // WITHOUT delivery is D6's local `abandoned`, which sets this to false at its own call site.
    closure_delivered: true,
    awaiting: null,
    history: appendHistory(existing, incoming),
  };
  return { thread: resolved, outcome: { kind: "resolved", thread: envelope.thread }, ...unanchored };
}
