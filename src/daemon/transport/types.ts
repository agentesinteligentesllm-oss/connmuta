/**
 * Provenance: telegram-agent-bus src/transport/types.ts @ bf8f365 — verdict: AS-IS (D-08).
 * v1 body sha256: 77c765471b9b0479a68fcab82b6fa2316182c30f06b7d35debf31dc05f143afb   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: none.
 */

/**
 * Shared types and error taxonomy for the transport layer (ADR-04). Type-only
 * structural work per tasks.md 7.1 — no RED test required, same precedent
 * already set for `src/telegram.ts`'s interface/error-class portion (Phase 6).
 *
 * `GroupTransport` (Plane A, observability) and `DirectTransport` (Plane B,
 * delivery) are the two channel-specific collaborators `DualWriteTransport`
 * composes. Only `DualWriteTransport` implements the {@link Transport} port
 * below — `GroupTransport`/`DirectTransport` intentionally do NOT share its
 * exact method signature, because "post to the fixed group" and "DM one
 * addressee" are naturally different-shaped operations; forcing them onto
 * one identical signature would mean one side ignores a parameter it has no
 * use for. `Transport` is the composed op the future send tool (Phase 8)
 * depends on, not a shape every channel must literally implement.
 */

/** A successful Telegram `sendMessage` result — the only field downstream code needs. */
export interface TransportSendResult {
  message_id: number;
}

/** One outcome per DM recipient in a dual-write fan-out (mirrors design.md's `delivery.direct` entries). */
export interface DirectSendOutcome {
  to: string;
  ok: boolean;
  message_id?: number;
  error?: string;
}

/**
 * The outcome of the group post (D1). A failure is reported here rather than thrown, EXCEPT for the
 * one class that would repeat identically on every DM — a message-level 400 — which
 * {@link GroupTransport} still throws.
 *
 * `code` is drawn from `telegram.ts`'s single classification vocabulary, so an agent branches on the
 * same spelling whether the failure arrived as a thrown tool error or as this embedded outcome.
 * `new_chat_id` is present only for a supergroup migration, and is informational: it is never
 * followed automatically (ADR-10 — `chat_id` is an access-control boundary).
 */
export type GroupSendOutcome =
  | { ok: true; message_id: number }
  | { ok: false; error: string; code: string; new_chat_id?: number };

/**
 * Aggregate result of one dual-write send.
 *
 * `group` carries its own success/failure because the observability plane failing must no longer
 * take the delivery plane down with it (D1). The whole call rejects only when NOTHING was delivered
 * anywhere — group failed and no DM landed — which is the honest definition of a failed send.
 * `direct` failures are soft and per-recipient; `degraded` is true when the group post failed OR any
 * DM did, because a send the four humans cannot see is degraded even when every DM landed.
 */
export interface DualWriteResult {
  group: GroupSendOutcome;
  direct: DirectSendOutcome[];
  degraded: boolean;
}

/**
 * The transport port: writes one already wire-encoded payload (`text`) to
 * both planes of ADR-04's dual-channel design — the shared group
 * (observability, hard failure) and a direct bot-to-bot DM to each of
 * `recipients` (delivery, soft failure per recipient). The transport layer
 * has no notion of envelope types: `recipients` is simply the exact fan-out
 * set the caller wants — one logical agent id for REQUEST/ACK/RESOLVED, or
 * every other roster entry for BROADCAST. Computing that set from an
 * envelope's `type` is the caller's job (the send tool, Phase 8), not this
 * layer's.
 */
/**
 * Presentation levers for one dual-write send (E1, E2).
 *
 * Deliberately separate from `text`: none of these enters the envelope JSON, so none of them can
 * change what a peer decodes. They exist only so the human plane stays readable enough that nobody
 * mutes the group.
 */
export interface SendOptions {
  /** The group message id of the thread's opening post, when one is known. Omitted rather than faked. */
  groupReplyTo?: number;
  /** Suppress the push notification — for message types that are not lifecycle boundaries. */
  silent?: boolean;
}

export interface Transport {
  send(text: string, recipients: string[], options?: SendOptions): Promise<DualWriteResult>;
}

/** Base class for any error raised by the transport layer. */
export class TransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransportError";
  }
}

/**
 * Raised by {@link DirectTransport} when the requested addressee is not
 * present in the locally configured roster. Rejected BEFORE any network
 * call — the roster is a hard access-control boundary for outbound
 * addressing (ADR-04's "new attack surface" callout, ADR-10, T4), not
 * merely an addressing convenience.
 */
export class UnknownRecipientError extends TransportError {
  readonly to: string;

  constructor(to: string) {
    super(`Unknown recipient: "${to}" is not present in the local roster`);
    this.name = "UnknownRecipientError";
    this.to = to;
  }
}
