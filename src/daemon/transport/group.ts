/**
 * Provenance: telegram-agent-bus src/transport/group.ts @ bf8f365 — verdict: AS-IS (D-08).
 * v1 body sha256: 2cd9974fed27ba175c7f8c65a5309a1f837677774c8e751125e3931c00557333   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: none.
 */

import { classifyTelegramError, GroupMigratedError, TelegramApiError, type TelegramClient } from "../telegram.js";
import { TransportError, type GroupSendOutcome, type SendOptions } from "./types.js";

/**
 * Descriptions that identify a 400 caused by the MESSAGE ITSELF rather than by the chat (D1).
 *
 * Matched as case-insensitive substrings against Telegram's own description, the same deliberately
 * narrow shape as `DirectTransport`'s `KNOWN_ERROR_HINTS` — and narrow for the same reason. Telegram
 * answers 400 both for "your payload is malformed" and for "that chat is gone", so the status code
 * alone cannot separate a failure the DMs would share from one they would not.
 *
 * `can't parse entities` is the one that matters most in practice: since ADR-05c every post carries
 * `parse_mode: "HTML"`, so a malformed render fails identically on all four channels.
 */
const MESSAGE_LEVEL_400_MARKERS = [
  "can't parse entities",
  "message text is empty",
  "message is too long",
  "text must be non-empty",
] as const;

/**
 * Whether this failure would repeat identically on every DM, making the fan-out pointless.
 *
 * Everything else — network faults, rate limits, and every group-specific failure such as a 403 or a
 * migration — is SOFT and falls through to the DMs. An UNCLASSIFIED 400 is soft too, deliberately:
 * the asymmetry decides it rather than confidence. Being wrong toward attempting costs at most one
 * doomed HTTP call per recipient, and the resulting wall of N identical DM errors is itself the best
 * available diagnostic that the failure was intrinsic to the message. Being wrong toward hard failure
 * costs the bus.
 */
function isMessageLevelFailure(err: unknown): boolean {
  // A migration is a 400 about the CHAT, and it must never be mistaken for one about the message —
  // it is the exact composition that turned a routine group promotion into a total outage (D5).
  if (err instanceof GroupMigratedError) {
    return false;
  }
  if (!(err instanceof TelegramApiError) || err.statusCode !== 400) {
    return false;
  }
  const description = err.message.toLowerCase();
  return MESSAGE_LEVEL_400_MARKERS.some((marker) => description.includes(marker));
}

/**
 * Plane A of ADR-04's dual-channel design: posts an already wire-encoded envelope to the single
 * shared group for human observability.
 *
 * A failure here is reported, not thrown. The original contract threw unconditionally and
 * `DualWriteTransport` relied on that to guarantee no DM followed — which is precisely the defect
 * D1 names: the *observability* plane failing took the *delivery* plane down with it, so a bot
 * kicked from the group, or a group promoted to a supergroup, silenced agent-to-agent messaging
 * entirely.
 *
 * The one surviving hard failure is {@link isMessageLevelFailure}: a 400 about the payload, which
 * every DM would reject the same way.
 *
 * The honest read of this trade is that a soft failure lets two agents converse invisibly to the
 * four humans, which is exactly what ADR-04 exists to prevent. That is answered by the persistent
 * group-outage condition (T1.3), not by this class — a `degraded` flag lives for one turn and the
 * context carries it away, while a condition persists until a group post succeeds again. This
 * transport must not ship without it.
 */
export class GroupTransport {
  constructor(
    private readonly client: TelegramClient,
    private readonly groupChatId: number
  ) {}

  async send(text: string, options: SendOptions = {}): Promise<GroupSendOutcome> {
    try {
      const message = await this.client.sendMessage({
        chat_id: this.groupChatId,
        text,
        parse_mode: "HTML",
        // Both omitted rather than sent as undefined-ish defaults: a thread whose group id is
        // unknown posts WITHOUT an anchor rather than failing, because losing the visual thread is
        // a smaller cost than losing the message.
        ...(options.groupReplyTo !== undefined ? { reply_to_message_id: options.groupReplyTo } : {}),
        ...(options.silent === true ? { disable_notification: true } : {}),
      });
      return { ok: true, message_id: message.message_id };
    } catch (err) {
      const raw = `Group post failed: ${(err as Error).message}`;
      if (isMessageLevelFailure(err)) {
        throw new TransportError(raw, { cause: err });
      }
      const classified = classifyTelegramError(err);
      return {
        ok: false,
        error: raw,
        code: classified?.code ?? "TRANSPORT_ERROR",
        new_chat_id: classified?.new_chat_id,
      };
    }
  }
}
