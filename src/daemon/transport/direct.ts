/**
 * Provenance: telegram-agent-bus src/transport/direct.ts @ bf8f365 — verdict: AS-IS (D-08).
 * v1 body sha256: 90a713df8b8baf855cc1c23d55e33845d4a7e6f169dad314f44c8b9905999b63   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: none.
 */

import type { ProjectRosterEntry as RosterEntry } from "../../shared/project-file.js";
import type { TelegramClient } from "../telegram.js";
import { TransportError, UnknownRecipientError, type SendOptions, type TransportSendResult } from "./types.js";

/**
 * Known Telegram error codes worth translating into actionable guidance,
 * keyed by the exact substring Telegram embeds in its `description`. Not a
 * general classifier — a small, deliberately narrow table of the failure
 * every new bot pairing is most likely to hit first (a live rollout hit
 * this exact one before this table existed).
 */
const KNOWN_ERROR_HINTS: Record<string, string> = {
  USER_BOT_TO_BOT_DISABLED:
    'Enable "Bot to Bot Communication Mode" in BotFather for BOTH bots in this pair (README.md step 2) — the USER_ prefix means it is the recipient bot that needs it.',
};

function hintFor(message: string): string | null {
  for (const [code, hint] of Object.entries(KNOWN_ERROR_HINTS)) {
    if (message.includes(code)) {
      return hint;
    }
  }
  return null;
}

/**
 * Plane B of ADR-04's dual-channel design: sends a direct bot-to-bot DM to
 * one addressee, resolved through the locally configured roster (ADR-10).
 *
 * `to` MUST already be a key of `roster` or the call is rejected with
 * {@link UnknownRecipientError} BEFORE any network call — the roster is the
 * outbound half of the hard access-control boundary ADR-04's "new attack
 * surface" callout and `telegram-transport`'s T4 requirement describe, not
 * merely an addressing convenience.
 */
export class DirectTransport {
  constructor(
    private readonly client: TelegramClient,
    private readonly roster: Record<string, RosterEntry>
  ) {}

  async send(to: string, text: string, options: SendOptions = {}): Promise<TransportSendResult> {
    const entry = this.roster[to];
    if (!entry) {
      throw new UnknownRecipientError(to);
    }

    try {
      const message = await this.client.sendMessage({
        chat_id: `@${entry.username}`,
        text,
        parse_mode: "HTML",
        // The DM plane is bot-to-bot, so silence changes nothing there today — it is threaded anyway
        // so the policy has ONE definition rather than two that can drift apart.
        ...(options.silent === true ? { disable_notification: true } : {}),
      });
      return { message_id: message.message_id };
    } catch (err) {
      const rawMessage = (err as Error).message;
      const hint = hintFor(rawMessage);
      throw new TransportError(
        `Direct DM to "${to}" failed: ${rawMessage}${hint ? ` — ${hint}` : ""}`,
        { cause: err }
      );
    }
  }
}
