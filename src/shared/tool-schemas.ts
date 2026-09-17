/**
 * Provenance: telegram-agent-bus src/tools/send.ts:47-109 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 84aae049e711e5ec6725007d561e65cebcf3ca3b9035333ae9b2b734494d42e6   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: (1) the `send` input schema (`v1:src/tools/send.ts:47-109`) and the three read-only tool
 * schemas (`v1:src/index.ts:29-42`) are extracted into one module, so the thin client and the daemon's
 * IPC re-validation (design §10 "it never trusts the client") read one definition of the four shapes; (2) imports relocated to `shared/envelope.js`; (3) the leading JSDoc restored from
 * `v1:src/tools/send.ts:36-46`, the comment block immediately above the vendored range, with the tool
 * name written as `send` because v2 derives it from `TOOL_PREFIX` (D-09), plus one added paragraph
 * stating the destination half of the same structural guarantee (`chat_id`/`bot`/`group`/`to_chat` exist
 * in no schema here — PT-02) and the `to_user_id` half, which v1 pinned only in its own twin
 * (`v1:test/tools/send.test.ts:295-303`); (4) `export type SendToolInput` carried from
 * `v1:src/tools/send.ts:111`, one line past the cited range; (5) the three read-only schemas' JSDoc
 * rewritten from `agentbus_fetch`/`agentbus_status`/`agentbus_thread` to `fetch`/`status`/`thread`.
 */

import { z } from "zod";

import { AGENT_ID_PATTERN, RESOLVED_BASIS_VALUES, THREAD_PATTERN } from "./envelope.js";

/**
 * The `send` tool input. `from` is deliberately NOT a field here — the sender identity is always
 * stamped server-side from the binding's agent (ADR-07), never accepted from a caller. This is a
 * structural guarantee, not just a runtime check: `sendInputBaseSchema` below has no `from` key at
 * all (see the schema-shape assertion in `test/shared/tool-schemas.test.ts`), and `SendToolInput` is
 * inferred directly from that schema, so TypeScript's excess-property check on a
 * `SendToolInput`-typed object literal independently rejects a stray `from` at compile time.
 *
 * The same structural argument covers the DESTINATION: no schema in this module declares `chat_id`,
 * `bot`, `group` or `to_chat`, so a caller cannot even express another room. Where the message goes
 * is fixed by the binding and asserted by the room guard (PT-02, PT-01; design §9).
 */
export const sendInputBaseSchema = z.object({
  type: z.enum(["BROADCAST", "REQUEST", "REPLY", "ACK", "RESOLVED"]),
  body: z.string().min(1),
  to: z.string().regex(AGENT_ID_PATTERN, "to must be a valid logical agent id").optional(),
  thread: z.string().regex(THREAD_PATTERN, "thread must be 12 lowercase hex characters").optional(),
  basis: z.enum(RESOLVED_BASIS_VALUES).optional(),
  approval_ref: z.string().min(1).optional(),
});

type BaseSendInput = z.infer<typeof sendInputBaseSchema>;

/** `to` is required unless type is BROADCAST, and forbidden for BROADCAST — mirrors the wire envelope's own rule. */
function isToValidForInputType(input: BaseSendInput): boolean {
  return input.type === "BROADCAST" ? input.to === undefined : input.to !== undefined;
}

/** Types that continue an existing thread rather than opening one. */
const IN_THREAD_TYPES: ReadonlySet<string> = new Set(["REPLY", "ACK", "RESOLVED"]);

/** `thread` is required for REPLY/ACK/RESOLVED (they reference an existing thread) and forbidden for BROADCAST/REQUEST (they open one). */
function isThreadValidForInputType(input: BaseSendInput): boolean {
  return IN_THREAD_TYPES.has(input.type) ? input.thread !== undefined : input.thread === undefined;
}

/**
 * `basis` is required for RESOLVED and forbidden for EVERY other type — including ACK: the
 * bridge always stamps `acknowledged-only` itself (ADR-06 L4, ADR-09). A caller can never
 * set `basis` on an ACK, not even to a value that would otherwise be valid on RESOLVED.
 */
function isBasisValidForInputType(input: BaseSendInput): boolean {
  return input.type === "RESOLVED" ? input.basis !== undefined : input.basis === undefined;
}

/** `approval_ref` is required if and only if `basis === "human-approved"`. */
function isApprovalRefValidForInputType(input: BaseSendInput): boolean {
  if (input.basis === "human-approved") {
    return typeof input.approval_ref === "string" && input.approval_ref.trim().length > 0;
  }
  return input.approval_ref === undefined;
}

/**
 * Full `send` tool-input schema. Cross-field rules are layered on top of
 * {@link sendInputBaseSchema} via `.refine()`, mirroring `envelope.ts`'s own `envelopeSchema`
 * construction so the two shapes stay recognizably in sync.
 */
export const sendInputSchema = sendInputBaseSchema
  .refine(isToValidForInputType, {
    message: "`to` is required unless type is BROADCAST, and forbidden for BROADCAST",
    path: ["to"],
  })
  .refine(isThreadValidForInputType, {
    message: "`thread` is required for REPLY/ACK/RESOLVED and forbidden for BROADCAST/REQUEST",
    path: ["thread"],
  })
  .refine(isBasisValidForInputType, {
    message: "`basis` is required for RESOLVED and forbidden for every other type (ACK's basis is always bridge-stamped)",
    path: ["basis"],
  })
  .refine(isApprovalRefValidForInputType, {
    message: "`approval_ref` is required iff basis is human-approved, and forbidden otherwise",
    path: ["approval_ref"],
  });

export type SendToolInput = BaseSendInput;

/** `fetch` tool input schema for MCP registration (`v1:src/index.ts:29-34`). */
export const fetchInputSchema = z.object({
  max_batch: z.number().int().positive().optional(),
  timeout_s: z.number().nonnegative().optional(),
  mark_seen: z.boolean().optional(),
  force_full: z.boolean().optional(),
});

/** `status` takes no input at all (`input: {}` — read-only). */
export const statusInputSchema = z.object({});

/** `thread` takes one thread id, validated against the same hex shape the wire uses. */
export const threadInputSchema = z.object({
  thread_id: z.string().regex(THREAD_PATTERN, "thread_id must be 12 lowercase hex characters"),
});
