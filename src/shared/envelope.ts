/**
 * Provenance: telegram-agent-bus src/envelope.ts @ bf8f365 — verdict: AS-IS (D-08).
 * v1 body sha256: e4aba6ec2128ed5dae858ae5633a94df371696e0aace95886595f61432f62663   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: none.
 */

import { z } from "zod";

import {
  MAX_BODY_CHARS,
  PROTOCOL_SENTINEL,
  SUPPORTED_PROTOCOL_SENTINELS,
  TELEGRAM_MAX_TEXT_CHARS,
} from "./constants.js";

// Exported so `src/tools/send.ts` (Phase 8) can validate its own tool-input
// shape against the exact same patterns/enums instead of redeclaring them —
// avoids two copies of the wire format's shape rules drifting apart.
export const AGENT_ID_PATTERN = /^@[a-z0-9][a-z0-9-]{1,30}$/;
export const EID_PATTERN = /^[0-9a-f]{12}$/;
export const THREAD_PATTERN = /^[0-9a-f]{12}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export const RESOLVED_LOW_RISK_BASIS = ["context-shared", "work-confirmed", "lock-released"] as const;
/**
 * Sender-side closure (ADR-13). Deliberately NOT a member of {@link RESOLVED_LOW_RISK_BASIS}.
 *
 * That list maps 1:1 to the spec's exhaustive low-risk set and its provenance is the reason ADR-06
 * layer 4 can call itself fail-closed; quietly appending to it would misrepresent where those three
 * values came from. `abandoned` is a different kind of claim entirely — the other four say something
 * about work that was DONE, this one says only that the originator stopped waiting. It asserts
 * nothing about the peer, touches no repository, and is the only basis its own sender may use.
 */
export const ABANDON_BASIS_VALUE = "abandoned" as const;
export const RESOLVED_BASIS_VALUES = [...RESOLVED_LOW_RISK_BASIS, "human-approved", ABANDON_BASIS_VALUE] as const;
const ACK_BASIS_VALUE = "acknowledged-only" as const;
const ALL_BASIS_VALUES = [...RESOLVED_BASIS_VALUES, ACK_BASIS_VALUE] as const;

const baseEnvelopeSchema = z.object({
  eid: z.string().regex(EID_PATTERN, "eid must be 12 lowercase hex characters"),
  type: z.enum(["BROADCAST", "REQUEST", "REPLY", "ACK", "RESOLVED"]),
  from: z.string().regex(AGENT_ID_PATTERN, "from must be a valid logical agent id"),
  to: z.string().regex(AGENT_ID_PATTERN, "to must be a valid logical agent id").nullable(),
  thread: z.string().regex(THREAD_PATTERN, "thread must be 12 lowercase hex characters"),
  ts: z.string().regex(TIMESTAMP_PATTERN, "ts must be an ISO 8601 UTC timestamp"),
  body: z.string().min(1).max(MAX_BODY_CHARS),
  basis: z.enum(ALL_BASIS_VALUES).optional(),
  approval_ref: z.string().min(1).optional(),
  /**
   * The addressee's numeric Telegram id — the identity anchor, on the wire (C4's remaining half).
   *
   * `to` travels in the SENDER's namespace and can never be translated back from a string, so two
   * machines whose `config.json`s disagree about one of their names produce a silent black hole:
   * the request is delivered, decoded, stored, and never surfaced to the agent it was for. This
   * number is one the sender's own roster produced, and the receiver holds the same numbers, so
   * the receiver can TRANSLATE instead of giving up.
   *
   * **Optional, and that is load-bearing rather than lax.** Every release from `v0.1.0` through
   * `v0.6.0` emits envelopes without it; requiring it for addressed types would reject all of them
   * as `malformed` — the exact silent-discard failure the accept-both decoder exists to avoid.
   * We always emit it (`checkRecipientsKnown` guarantees the addressee is in our roster before any
   * send), and we tolerate its absence, where the addressee check falls back to failing open.
   *
   * No new exposure: every roster member already holds every `user_id` in their own `config.json`.
   */
  to_user_id: z.number().int().optional(),
});

type BaseEnvelope = z.infer<typeof baseEnvelopeSchema>;

/** `to` is null ONLY for BROADCAST; required (and already agent-id-shaped) for the other three types. */
function isToValidForType(env: BaseEnvelope): boolean {
  return env.type === "BROADCAST" ? env.to === null : env.to !== null;
}

/**
 * `basis` is forbidden on BROADCAST/REQUEST/REPLY, must be exactly the bridge-stamped
 * `acknowledged-only` on ACK, and is required on RESOLVED (one of the four
 * low-risk/human-approved values — ADR-06 L4, ADR-09).
 *
 * REPLY joins the forbidden set rather than the ACK one: `basis` is the autonomy boundary and
 * every value it can take describes work being CLOSED. A continuation closes nothing, so allowing
 * one would let a mid-conversation message masquerade as a resolution.
 */
function isBasisValidForType(env: BaseEnvelope): boolean {
  switch (env.type) {
    case "BROADCAST":
    case "REQUEST":
    case "REPLY":
      return env.basis === undefined;
    case "ACK":
      return env.basis === ACK_BASIS_VALUE;
    case "RESOLVED":
      return env.basis !== undefined && (RESOLVED_BASIS_VALUES as readonly string[]).includes(env.basis);
    default:
      return false;
  }
}

/**
 * `to_user_id` is forbidden exactly where `to` is null — a BROADCAST has no addressee, so an
 * anchor for one is meaningless and would only invite a reader to believe it was addressed.
 */
function isToUserIdValidForType(env: BaseEnvelope): boolean {
  return env.to === null ? env.to_user_id === undefined : true;
}

/** `approval_ref` is required if and only if `basis === "human-approved"`. */
function isApprovalRefValidForType(env: BaseEnvelope): boolean {
  if (env.basis === "human-approved") {
    return typeof env.approval_ref === "string" && env.approval_ref.trim().length > 0;
  }
  return env.approval_ref === undefined;
}

/**
 * Zod schema for the full wire envelope (design.md "Message envelope").
 * Validates the closed type set, the `eid`/`thread` hex-id shape, the
 * agent-id pattern on `from`/`to`, the `to` null/non-null rule (BROADCAST
 * only), the `basis`/`approval_ref` conditionals (ADR-06 L4, ADR-09), and
 * the `MAX_BODY_CHARS` cap. Unknown fields are dropped (forward compatibility).
 */
export const envelopeSchema = baseEnvelopeSchema
  .refine(isToValidForType, {
    message: "`to` must be null for BROADCAST and a valid agent id for every other type",
    path: ["to"],
  })
  .refine(isBasisValidForType, {
    message:
      "`basis` is invalid for this envelope type (forbidden on BROADCAST/REQUEST, must be acknowledged-only on ACK, required on RESOLVED)",
    path: ["basis"],
  })
  .refine(isApprovalRefValidForType, {
    message: "`approval_ref` is required iff basis is human-approved, and forbidden otherwise",
    path: ["approval_ref"],
  })
  .refine(isToUserIdValidForType, {
    message: "`to_user_id` is forbidden on BROADCAST, which has no addressee to anchor",
    path: ["to_user_id"],
  });

export type Envelope = BaseEnvelope;

export type DecodeFailureReason = "non_envelope" | "unsupported_version" | "malformed";

export type DecodeResult = { ok: true; envelope: Envelope } | { ok: false; reason: DecodeFailureReason };

/**
 * Locates the machine plane inside a message (ADR-05b).
 *
 * `m` (not `s`) is the whole point: `^`/`$` bind to LINE boundaries, so the sentinel is
 * found wherever it sits rather than having to be the entire message. `.` therefore stops
 * at a newline, which is correct — `JSON.stringify` never emits a raw newline, so an
 * envelope payload is always exactly one line.
 *
 * `g` is required by `matchAll`, which constructs its own regex internally and so does NOT
 * mutate this shared instance's `lastIndex`.
 */
const SENTINEL_LINE_PATTERN = /^AGENTBUS\/(\d+) (.*)$/gm;

/**
 * The human plane's one-line header (ADR-05b).
 *
 * Built EXCLUSIVELY from fields the schema constrains to a closed enum or a regex —
 * `type`, `from`/`to` (`AGENT_ID_PATTERN`), `thread` (`THREAD_PATTERN`), `basis` (enum).
 * None of those can contain a newline, so the header is structurally incapable of forging
 * a line start. `approval_ref` is deliberately excluded: it is the only envelope field
 * declared as unconstrained free text (`z.string().min(1)`), which makes it the only one
 * that could smuggle a newline into the plain-text plane. It stays in the JSON, where
 * escaping neutralizes it.
 *
 * `basis` is surfaced only for RESOLVED — the type where it gates the autonomy boundary
 * (ADR-06 L4, ADR-09). On ACK it is always the same constant, so printing it is noise.
 */
function renderHeader(envelope: Envelope): string {
  const parts = [envelope.type, `${envelope.from} → ${envelope.to ?? "all"}`, `thread ${envelope.thread}`];

  if (envelope.type === "RESOLVED" && envelope.basis !== undefined) {
    parts.push(`basis ${envelope.basis}`);
  }

  return parts.join(" · ");
}

/**
 * Serializes `envelope` into the two-plane wire message (ADR-05b):
 *
 *     <header>
 *     <blank>
 *     <body>
 *     <blank>
 *     AGENTBUS/2 {…}
 *
 * The group post is both the human observability plane (ADR-04) and a machine-readable
 * copy. v0.1.x served only the machine — the message WAS the envelope, so humans read raw
 * JSON. Here the prose leads and the envelope trails.
 *
 * The shape is a fixed five lines regardless of body content, because `normalizeBody` has
 * already collapsed the body to a single line. That invariant is what lets the decoder
 * resolve ambiguity by taking the LAST sentinel line: a body can open with a sentinel and
 * create a competing line start, but it can never place anything AFTER itself.
 *
 * Both channels carry these exact bytes — one encode path, so the group copy and the
 * direct DM stay byte-identical and `eid` dedup (ADR-11) is unaffected.
 */
export function encodeEnvelope(envelope: Envelope): string {
  return [renderHeader(envelope), "", envelope.body, "", `${PROTOCOL_SENTINEL} ${JSON.stringify(envelope)}`].join("\n");
}

/**
 * Escapes the only three characters Telegram's HTML parser consumes. `&` MUST be replaced
 * first, otherwise the ampersands introduced by the other two get escaped a second time.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Presentation-only rendering of {@link encodeEnvelope}'s canonical text (ADR-05c).
 *
 * Bolds the header and collapses the sentinel line into an expandable blockquote, so the
 * JSON stops dominating the human plane while remaining one tap away. Nothing about the
 * protocol moves: Telegram carries markup as `MessageEntity` metadata and stores
 * `Message.text` as the un-escaped inner text, so a receiving decoder sees exactly the
 * bytes `encodeEnvelope` produced. Verified against the live Bot API on 2026-08-15 with a
 * body containing `<`, `>`, `&`, literal `&amp;`/`&lt;` sequences and a literal
 * `<blockquote>` tag — the returned `Message.text` was byte-identical.
 *
 * Because the transformation is invisible to decoders, this is NOT a wire change and needs
 * no coordinated upgrade: a v0.2.0 peer reads a v0.2.1 message unchanged.
 *
 * The wire-length guard deliberately keeps measuring the canonical text, not this string —
 * the Bot API's 4096-character limit applies "after entities parsing".
 */
export function renderMessageHtml(envelope: Envelope): string {
  const sentinelLine = `${PROTOCOL_SENTINEL} ${JSON.stringify(envelope)}`;

  return [
    `<b>${escapeHtml(renderHeader(envelope))}</b>`,
    "",
    escapeHtml(envelope.body),
    "",
    `<blockquote expandable>${escapeHtml(sentinelLine)}</blockquote>`,
  ].join("\n");
}

/** C0/C1 control characters EXCEPT the whitespace ones (`\t`, `\n`, `\v`, `\f`, `\r`), which collapse instead of vanishing. */
const NON_WHITESPACE_CONTROL_PATTERN = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g;

/**
 * Makes ADR-05's legibility premise structurally true instead of merely hoped for.
 *
 * ADR-05 accepts a raw-JSON group post because "`body` carries plain prose and stays
 * legible inline" — but that only holds for single-line, escape-free prose. A body
 * with embedded newlines or straight double quotes is serialized by `JSON.stringify`
 * into visible `\n` and `\"` sequences, which is exactly what turned the first live
 * REQUEST into an unreadable wall of text in the shared group.
 *
 * The transformation is deliberately lossless in meaning and never lengthens the
 * string, so `MAX_BODY_CHARS`, checked earlier against the raw body, remains a valid
 * upper bound:
 * - non-whitespace control characters are dropped outright;
 * - every run of whitespace (newlines included) collapses to one space;
 * - straight double quotes become paired typographic quotes, which JSON leaves alone.
 */
export function normalizeBody(body: string): string {
  let quoteIsOpening = true;
  const quoted = body.replace(/"/g, () => {
    const replacement = quoteIsOpening ? "“" : "”";
    quoteIsOpening = !quoteIsOpening;
    return replacement;
  });

  return quoted.replace(NON_WHITESPACE_CONTROL_PATTERN, "").replace(/\s+/g, " ").trim();
}

/**
 * True when `text` would be rejected by Telegram's own message-length ceiling.
 *
 * `MAX_BODY_CHARS` alone never guaranteed this: it caps the RAW body, while the wire
 * text is the JSON-escaped body plus ~200 characters of envelope metadata. A body of
 * backslashes sitting exactly at the 3000-character cap encodes to 6206 characters —
 * over `TELEGRAM_MAX_TEXT_CHARS` — so the send used to fail as an opaque Telegram 400
 * on the group post (a hard `TransportError`) instead of a clear local rejection.
 *
 * `String.length` counts UTF-16 code units, which over-counts astral characters
 * relative to Telegram's own count. The error is in the safe direction.
 */
export function encodedTextExceedsTelegramLimit(text: string): boolean {
  return text.length > TELEGRAM_MAX_TEXT_CHARS;
}

/**
 * Parses one Telegram message text into an envelope. Never throws: anything
 * that is not a valid, current-version envelope is reported via `reason`
 * (non-envelope human chat, an unsupported sentinel version, or a malformed/
 * schema-invalid payload) so callers can skip it silently, per
 * `agent-bridge-tools`' silent-handling requirement.
 */
export function decodeEnvelope(text: string): DecodeResult {
  // LAST match, not first (ADR-05b). The encoder always trails with the real envelope, and
  // `normalizeBody` forbids newlines in a body, so nothing a sender controls can appear
  // after it. Taking the last line therefore makes a body-borne sentinel unable to win.
  const match = [...text.matchAll(SENTINEL_LINE_PATTERN)].at(-1);
  if (!match) {
    return { ok: false, reason: "non_envelope" };
  }

  const [, versionDigits, rawJsonPart] = match;
  // `$` in multiline mode matches before the `\n` of a CRLF pair, leaving the `\r` in the
  // capture. JSON.parse would tolerate it as trailing whitespace; trimming is explicit.
  const jsonPart = rawJsonPart.trim();
  // Membership in the accepted SET, not equality with what we emit (ADR-21). Comparing against
  // `PROTOCOL_SENTINEL` made "readable" and "current" the same question, so the first wire bump
  // would have made every envelope already in the group unreadable.
  //
  // Checked BEFORE the payload is parsed, deliberately: an unknown version makes no promise
  // about its payload's shape, so parsing it proves nothing and a parse failure would report
  // the wrong cause.
  if (!SUPPORTED_PROTOCOL_SENTINELS.has(`AGENTBUS/${versionDigits}`)) {
    return { ok: false, reason: "unsupported_version" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonPart);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const result = envelopeSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, envelope: result.data };
}
