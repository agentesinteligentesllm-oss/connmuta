/**
 * Provenance: telegram-agent-bus src/tools/fetch.ts:65-348 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 25d39d9ceb07e585c0b6d9a12510fe445c9e81e78e401f2e3feb30c230ba0607   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: (1) lines 65-348 extracted: the fetch tool's input type and every output-shape type the
 * tool returns; (2) imports relocated — `RejectionReason` now comes from `shared/protocol-apply.js`
 * (v1's `protocol.js` split) and `Conditions` is declared here (see 4); every other import the file
 * carried belongs to code outside 65-348; (3) `trimSurfaced` and `trimWaiting` are EXPORTED, where v1
 * kept them module-private. Design §12's row for this range is AS-IS and mandates no such change, so it
 * is a v2 choice with two reasons: they are the only behaviour the range carries and Strict TDD needs a
 * falsifiable twin, and the per-client serve handler (design §8.4, `daemon/serve/fetch.ts`) then
 * consumes one copy of the trim rule instead of keeping its own. Moving `wrapUntrusted` to
 * `shared/fence.ts` (PR-06a, design §12's row for `fetch.ts:43-63`) is the same split; (4) `Conditions` is declared here with its JSDoc re-authored from
 * `v1:src/state.ts:89-111`, because the fetch output reports it and no `shared/` module owns it —
 * design §12 marks v1's state container REPLACED by `ledger/*`, so the type is a wire shape here while
 * the raised set stays ledger-side; (5) `gap_warning` gains the doc v1 kept only at its raise site
 * (`v1:src/tools/fetch.ts:788-794`), re-scoped by design §8.4 to the DAEMON not polling; (6) JSDoc
 * rewritten and no other body text changed: the two tool-name citations become `fetch` (v1 spelled it
 * `agentbus_fetch`, D-09) and their design citation becomes this design's §11 (v1 cited its own
 * `design.md` "MCP tool surface"); {@link trimWaiting} gains its first JSDoc; {@link trimSurfaced} gains
 * its export rationale; `{@link applyEnvelope}` in {@link UnappliedEntry} becomes a named reference to
 * `shared/protocol-apply.ts`, since this module no longer imports it.
 */

import type { RejectionReason } from "./protocol-apply.js";

/** `fetch` tool input (design §11 "Thin client"; v1 spelled the tool `agentbus_fetch`). */
export interface FetchToolInput {
  max_batch?: number;
  timeout_s?: number;
  /** Defaults to `true`. When `false`, the batch is classified and returned but NOTHING is persisted (peek mode). */
  mark_seen?: boolean;
  /** Defaults to `false`. Demands the full picture even when nothing discrete has changed (A4). */
  force_full?: boolean;
}

/**
 * One unresolved REQUEST addressed to the caller.
 *
 * Five fields are ALWAYS present — `thread`, `from`, `age_hours`, `reminder`, `acked` — because
 * `session-catchup`'s Unresolved REQUEST Carry-Forward is a MUST: the work item may never vanish
 * from a response, or the agent can forget the obligation exists. `thread` is the handle needed to
 * resolve it; the rest is what prioritizing it requires.
 *
 * Everything else is present on a FULL tick and withheld on a compact one. The MUST is about the
 * item's continued presence, not about re-transmitting its payload and its Telegram scaffolding on
 * every heartbeat.
 */
export interface NeedsActionEntry {
  thread: string;
  from: string;
  age_hours: number;
  reminder: boolean;
  acked: boolean;
  /**
   * Absent on a compact tick for an entry whose text was already emitted verbatim on an earlier
   * one — paired with {@link NeedsActionEntry.body_omitted} so the absence is explicit rather than
   * something the reader has to infer. An overdue entry keeps it regardless; so does one that has
   * never been surfaced, since it cannot have been "already emitted".
   */
  body?: string;
  /** Set when this entry was trimmed because it has already been surfaced in full. */
  body_omitted?: true;
  eid?: string;
  sent_at?: string;
  acked_at?: string | null;
  ack_count?: number;
  via?: "direct" | "group";
  telegram_message_id?: number;
}

/**
 * One open thread this agent is party to whose turn currently rests with the OTHER participant.
 *
 * Replaces `outbound_pending`, and the rename is not cosmetic. That list filtered on
 * `from === me`, which multi-turn breaks: once I reply to a request addressed to me, the thread
 * leaves `needs_action` (not my turn) and was never eligible for `outbound_pending` (I am not its
 * author), so it disappeared from the response entirely — a direct violation of
 * `session-catchup`'s carry-forward MUST. Defining membership by PARTICIPATION instead of
 * authorship makes the union with `needs_action` total: every open thread I am party to lands in
 * exactly one of them.
 *
 * Carrying both directions is why the shape adopts `direction` + `peer` rather than `to`: with an
 * inbound thread in the list, a field named `to` would name this very agent on half the entries.
 * The idiom is borrowed from `agentbus_status`'s `open_threads` rather than invented here, so the
 * two tools describe the same thing the same way.
 */
export interface WaitingOnPeerEntry {
  thread: string;
  /** `outbound` when this agent opened the thread, `inbound` when the peer did. */
  direction: "inbound" | "outbound";
  /** The other participant, whichever end this agent occupies. */
  peer: string;
  age_hours: number;
  acked: boolean;
  /**
   * The OPENING body. Absent on a compact tick.
   *
   * Wrapped in the layer-7 fence when the opening was peer-authored, raw when this bridge wrote
   * it. `outbound_pending` skipped the fence unconditionally because its entries were always
   * self-authored; that justification does not survive a list that also carries inbound threads.
   * Authorship decides, never list membership.
   */
  body?: string;
  /** Set when this entry was trimmed on a compact tick. */
  body_omitted?: true;
  sent_at?: string;
}

/**
 * Trims an entry the caller has already been shown in full down to the five fields that keep the
 * carry-forward MUST satisfied, and nothing more.
 *
 * An OVERDUE entry is returned untouched: those are exactly what `session-catchup` asks to
 * highlight, so folding one into a metadata row would suppress the single transition the quiet tick
 * exists to make visible.
 *
 * ADR-22 changed WHO this is applied to, never what it does. It used to run on every entry of a
 * compact tick and on none of a full one; it now runs on every entry whose text was already
 * emitted, whichever kind of tick this is.
 *
 * Exported in v2 (SEAM change 3): the daemon serves the compact tick from here (design §8.4) rather
 * than keeping a second copy of the rule.
 */
export function trimSurfaced(entry: NeedsActionEntry): NeedsActionEntry {
  if (entry.reminder) {
    return entry;
  }
  return {
    thread: entry.thread,
    from: entry.from,
    age_hours: entry.age_hours,
    reminder: entry.reminder,
    acked: entry.acked,
    body_omitted: true,
  };
}

/**
 * {@link trimSurfaced}'s counterpart for a thread whose turn rests with the peer: no overdue exemption
 * — `reminder` is a field of `NeedsActionEntry` only, since F3's tiers cover unresolved REQUESTs — and
 * no `body` copied forward, so the compact path is never a second, unfenced route for peer text.
 */
export function trimWaiting(entry: WaitingOnPeerEntry): WaitingOnPeerEntry {
  return {
    thread: entry.thread,
    direction: entry.direction,
    peer: entry.peer,
    age_hours: entry.age_hours,
    acked: entry.acked,
    body_omitted: true,
  };
}

export interface LogEntry {
  eid: string;
  type: string;
  from: string;
  to: string | null;
  thread: string;
  body: string;
  sent_at: string;
  via: "direct" | "group";
  basis?: string;
}

/**
 * One envelope whose state transition the receive-side predicate refused (T2.10).
 *
 * There is deliberately **no `body`**. Discarding the rejection silently would repeat the black
 * hole `misaddressed` exists to prevent, but including the prose would import text written by an
 * unauthorized peer straight into the reading agent's context — precisely what ADR-06 layer 7
 * exists to stop. Metadata is enough to diagnose a misconfiguration; the prose is not needed and
 * carries the risk.
 */
export interface RejectedEntry {
  eid: string;
  type: string;
  from: string;
  thread: string;
  reason: RejectionReason;
}

/**
 * A thread this agent closed locally while the transport was down, which the peer was never told
 * about (D6).
 *
 * The third piece of the local-abandonment fix, and the one without which it would be a regression
 * rather than a fix: applying the closure locally and NOT reporting it would trade a stuck thread
 * for a silent divergence. An addressee who was offline when it happened comes back to an open
 * thread and may start work nobody wants.
 */
export interface UnannouncedClosure {
  thread: string;
  to: string | null;
  resolved_at: string | null;
  basis: string | null;
}

/**
 * One envelope whose transition could not be applied because this bridge holds no record of its
 * thread (debate `agentbus-orphan-transitions-001`).
 *
 * Reachable through the Bot API's 24h retention, which evicts updates individually: a gap longer
 * than that can leave a REQUEST evaporated and its ACK/REPLY/RESOLVED still alive. Not marginal —
 * measured on dev1's production state, 106 of 163 resolved threads lived past 24h and the largest
 * observed gap was 45.31h, against a `gap_warning` that fires on the very same constant.
 *
 * Named for what this bridge WITNESSED, not for what it infers. Eviction is the hypothesis; the
 * observation is only that the transition was not applied — a peer can equally reference a thread
 * id that never existed, and `applyEnvelope` in `shared/protocol-apply.ts` cannot tell the two apart.
 * It is also a list of ENVELOPES, not of threads: an ACK and a RESOLVED for one absent thread are two entries.
 *
 * There is deliberately **no `body`**, for the reason spelled out at the branch that fills this.
 */
export interface UnappliedEntry {
  thread: string;
  type: string;
  from: string;
}

export interface SkippedCounts {
  non_envelope: number;
  malformed: number;
  unsupported_version: number;
  unknown_sender: number;
  duplicate: number;
}

/**
 * The persistent-warning channel the fetch response carries (SEAM change 4: declared HERE because the
 * response reports it, while the raised set stays ledger-side — design §12 marks v1's state container
 * REPLACED by `ledger/*`). A per-call flag such as `delivery.degraded` lives one turn; a condition
 * persists until it is resolved, which is what keeps the group soft-fail from hiding an exchange from
 * the four humans (D1). All three members exist up front — v1's reason, kept: v1 declared them even
 * though only `group_outage` was raised, because the shape is a single migration target.
 */
export interface Conditions {
  /** Raised by a failed group post; cleared by the next successful one. */
  group_outage: { since: string; last_error: string } | null;
  /** Raised when the imported v1 state failed validation and was quarantined (F2). */
  state_quarantined: { at: string; quarantined_path: string } | null;
  /** Raised when open threads cross the backlog threshold (Block 5). */
  open_thread_backlog: { count: number; since: string } | null;
}

/** `fetch` tool output (design §11 "Thin client"; v1 spelled the tool `agentbus_fetch`). */
export interface FetchToolOutput {
  needs_action: NeedsActionEntry[];
  waiting_on_peer: WaitingOnPeerEntry[];
  log: LogEntry[];
  checkpoint: { present: boolean; at: string | null; by: string | null };
  cursor: { previous_update_id: number; next_update_id: number; advanced: boolean };
  skipped: SkippedCounts;
  /**
   * Count of processed envelopes whose `to` is agent-id-shaped but matches no
   * `agent_id` in this machine's own roster — the signature of two peers'
   * `config.json`s disagreeing about one of their names. Unlike `skipped.*`,
   * these envelopes ARE still applied/persisted and appear once in `log` —
   * they just never reach `needs_action`, which would otherwise be a silent,
   * uncounted black hole for whoever they were actually meant for.
   */
  misaddressed: number;
  /** Envelopes whose state transition was refused by the receive-side predicate (C1, C3). Never carries a body. */
  rejected: RejectedEntry[];
  /**
   * Envelopes whose transition was skipped because their thread is absent from local state. Never
   * carries a body — the sibling of {@link rejected}, and the stricter of the two.
   *
   * Per-batch and not persisted, exactly like `log` and `rejected`: this reports one turn only.
   * That is bounded on purpose — there is no ThreadRecord to hang it on, and inventing one would
   * mean a new state field and a migration. `producedNews` is what makes one turn enough: an
   * unapplied transition forbids the compact form, so it is never omitted from the response that
   * carries it, and it is actionable in that turn (ask that peer about that thread).
   */
  unapplied: UnappliedEntry[];
  /**
   * Threads closed locally that the peer was never told about (D6). Carried on EVERY response,
   * compact ones included, until the announcement is re-sent — the closure is this agent's own
   * unfinished business, and a summary that hid it would recreate the divergence the fix removes.
   */
  unannounced_closures: UnannouncedClosure[];
  /**
   * How many state transitions were accepted only because the thread carries no identity anchor
   * (C4). Failing open there is the only correct behaviour on a drifted thread, but a fail-open
   * that nobody can count is indistinguishable from a check that is not running.
   */
  unanchored: number;
  /**
   * How many entries each capped list withheld (ADR-12). Non-zero means a real backlog exists that
   * this result does not show — the lists are truncated to `MAX_SURFACED_THREADS`, oldest kept
   * first. Reported rather than silently dropped: an unbounded list exhausts the caller's context
   * window with no error, and a silent cap would replace that with an equally invisible data loss.
   */
  omitted: {
    needs_action: number;
    waiting_on_peer: number;
    /** Withheld from the never-surfaced tier (F3). Non-zero means brand-new work did not fit. */
    new: number;
    /** Withheld from the overdue tier (F3). Reported per tier so a STARVED tier is a visible number even at zero slots. */
    reminder: number;
  };
  /**
   * Persistent warnings, carried on EVERY call until whatever raised them is resolved (T1.3).
   *
   * This is what makes D1's group soft-fail acceptable rather than a licence for two agents to hold
   * an entire exchange invisible to the four humans: `delivery.degraded` on the sending call scrolls
   * out of context one turn later, while this reappears on every fetch until a group post succeeds.
   */
  conditions: Conditions;
  /**
   * The fingerprint of this agent's discrete work state (A4). Stable while nothing changes, which is
   * what lets a quiet tick answer "nothing new" without re-emitting the whole backlog.
   */
  digest: string;
  /** True when this response is the COMPACT form: a summary of already-surfaced work, never a suppression of it. */
  unchanged: boolean;
  /**
   * Present only on a compact tick. Carries how much work is pending and how overdue the worst of it
   * is — so the response never omits information about WHETHER pending work exists, only the
   * already-surfaced text of it.
   */
  needs_action_summary?: PendingSummary;
  /** The same summary for threads whose turn rests with the peer, on a compact tick. */
  waiting_on_peer_summary?: PendingSummary;
  /**
   * Present when the DAEMON stopped polling past the Bot API's retention window (design §8.4): raised
   * from `offsets.last_poll_ok_at`, so `last_fetch_at` is the daemon's last successful poll, not this
   * caller's previous fetch. v1 raised the same field from its own `last_fetch_at`
   * (`v1:src/tools/fetch.ts:788-794`); the shape is unchanged, the meaning is re-scoped.
   */
  gap_warning?: { possible: true; last_fetch_at: string; hours_elapsed: number };
}

/** How much work a compact tick is standing in for. */
export interface PendingSummary {
  count: number;
  oldest_thread: string | null;
  oldest_age_hours: number | null;
  reminder_count: number;
}
