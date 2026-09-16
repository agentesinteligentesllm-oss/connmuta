/**
 * Provenance: telegram-agent-bus src/state.ts:15-87 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: bd17737239958c20b317c0ea11860716d7db1da23f17eac9677e53d0c49d6160   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: (1) `first_surfaced_at` removed — per-client surfaced state moves to `client_surfaced`
 * (PR-12, design §12).
 */

/** One in-thread message after the opening one. `from` is always the VERIFIED sender (B2). */
export interface HistoryEntry {
  eid: string;
  type: string;
  from: string;
  /**
   * Stored canonical. Peer-authored text is wrapped by `wrapUntrusted` at the point it is
   * SURFACED, never at the point it is stored, so the stored form stays exactly what arrived.
   */
  body: string;
  at: string;
  via: "direct" | "group";
}

export interface ThreadRecord {
  status: "open" | "resolved";
  /**
   * `"BROADCAST"` no longer occurs on threads created from this version onward, and the migration
   * drops every existing one. The value stays in the union until `agentbus`'s receive path stops
   * minting them (T2.5): the migration runs once, so a BROADCAST thread created AFTER it would fail
   * a narrowed schema on the next load and quarantine a healthy file.
   */
  opened_type: "REQUEST" | "BROADCAST";
  opened_eid: string;
  from: string;
  /**
   * The addressee in THIS machine's namespace whenever {@link ThreadRecord.to_user_id} could
   * resolve it, and in the sender's namespace otherwise (T3.2).
   *
   * It was unconditionally the sender's namespace before the wire release, which is what made
   * roster drift a silent black hole. `fetchTool` now translates through the anchor at the trust
   * boundary — the same treatment `from` already received — so downstream code reads one
   * namespace. Records written before the wire release, and those from a peer that sends no
   * anchor, keep the old meaning; their `to_user_id` is `null`, and the addressee check now fails
   * CLOSED on that case (D-05; see {@link ThreadRecord.to_user_id}).
   */
  to: string | null;
  /** The OPENING body only; everything after it lives in {@link ThreadRecord.history}. */
  body: string;
  opened_at: string;
  /** Whichever copy arrived first (ADR-11 dedup is first-seen-wins). */
  opened_message_id: number;
  via: "direct" | "group";
  acked_at: string | null;
  ack_count: number;
  resolved_at: string | null;
  resolved_by: string | null;
  basis: string | null;
  /**
   * The identity anchor (C4). Taken from the envelope's own `to_user_id` when the sender supplied
   * one, else from a local roster lookup of `to`. `null` only when neither source can answer — a
   * pre-`v1.0.0` peer addressing a name we do not hold — and there the addressee check FAILS CLOSED
   * (D-05, `shared/protocol-apply.ts`'s `isAddressee`): v1 failed open on this same null case, and
   * PR-05 replaced it, since an unresolved anchor is exactly the state a forged or drifted `to`
   * produces.
   */
  to_user_id: number | null;
  /** The reply anchor (E1): the message id of the GROUP copy, whenever one has been seen. */
  group_message_id: number | null;
  /**
   * `false` only for a local `abandoned` applied while the transport failed (D6). Every other path
   * sets it `true`, because every other path required delivery.
   */
  closure_delivered: boolean;
  /** Whose turn it is. Derived locally from the message sequence and deliberately NOT on the wire — carrying it would make it sender-declared and therefore forgeable. Used from `v1.0.0`. */
  awaiting: string | null;
  /** Capped; the opening is always kept. Used from `v1.0.0`. */
  history: HistoryEntry[];
}
