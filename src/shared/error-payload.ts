/**
 * Provenance: telegram-agent-bus src/index.ts:45-103 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 1f59f8f8fa186e22ab1281f4ca9a2dded1f559eb9f9e43b6c7494c8c01a3d948   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: (1) `toTelegramErrorPayload` and its only caller `toToolErrorPayload` are NOT vendored:
 * both need `telegram.ts`'s `classifyErrorChain`, and the thin client's closure must contain no
 * Telegram-classification module (design §10; spec "Client-local error payload constructor"). The
 * classification refinement stays daemon-side in `daemon/ipc/routes.ts` (PR-31), which composes it
 * with {@link toolErrorPayload}; (2) `RETRYABLE_TOOL_CODES` drops `BRIDGE_BUSY` — v2 deletes that
 * code along with the v1 bridge lock the ledger replaces (design §10 table, §12 `send.ts` row);
 * (3) the retained declarations keep v1's JSDoc sentences with the parts about the moved helpers
 * rewritten, plus four additions v1 did not have: the closed-shape paragraph on `ToolErrorPayload`, the
 * paragraph recording that `RETRYABLE_TOOL_CODES` lost `BRIDGE_BUSY` and why, the new
 * `toolErrorPayload` (v1 kept that branch inline inside `toToolErrorPayload`; lifted out, the allowlist
 * stays the only place `retryable` is decided for a TOOL-LEVEL code — the client-local family keeps the
 * separate classification design §10 gives it), and a first JSDoc for `errorResult`.
 */

/**
 * One tool rejection, serialized into the `isError` result body. `retryable` is never optional (D3).
 *
 * The shape is closed on purpose: a rejection carries a `code` an agent can branch on, the prose
 * `message`, that classification, and at most the two refinements a Telegram failure can add — a
 * rate limit's `retry_after_s` and a migrated chat's `new_chat_id`. v1 flattened both of those into
 * the English sentence, which forced the reading agent to parse prose back out of it (ADR-12).
 */
export type ToolErrorPayload = {
  code: string;
  message: string;
  retryable: boolean;
  retry_after_s?: number;
  new_chat_id?: number;
};

/**
 * Whether a tool-level rejection is worth calling again (D3).
 *
 * Deliberately a closed allowlist rather than a denylist: an unrecognised code is NOT retryable, so
 * a future error type cannot become a hot loop just because nobody remembered to classify it.
 *
 * `TRANSPORT_ERROR` is the only genuinely transient one here — a socket or protocol failure on an
 * otherwise well-formed request. Every other tool-level code is the caller's own input being wrong,
 * and repeating an identical wrong request produces an identical rejection.
 *
 * v1 also listed `BRIDGE_BUSY`: another call held the v1 bridge lock and would release it. That code
 * is deleted in v2 (design §10), because the daemon owns the ledger inside one process and there is no
 * cross-process lock left to be busy.
 */
export const RETRYABLE_TOOL_CODES: ReadonlySet<string> = new Set(["TRANSPORT_ERROR"]);

/**
 * The payload for a TOOL-LEVEL rejection — v1's `toToolErrorPayload` fallback branch, lifted into its
 * own export so the allowlist above stays the single place that decides `retryable` for the v1 tool
 * codes. `daemon/ipc/routes.ts` (PR-31) falls back to it after the Telegram classification is tried.
 *
 * Client-local codes (`DAEMON_DOWN`, `IPC_ERROR`, `WRONG_ROOM`, …) are a DIFFERENT family, NOT built
 * here: design §10's client taxonomy gives them their own `retryable` values — three of them `true` —
 * so `client/errors.ts` (PR-34) implements that table rather than routing them through this allowlist.
 */
export function toolErrorPayload(code: string, message: string): ToolErrorPayload {
  return { code, message, retryable: RETRYABLE_TOOL_CODES.has(code) };
}

/** The MCP tool result for a rejection: `isError` plus the payload as its single text block. */
export function errorResult(payload: ToolErrorPayload) {
  return { isError: true as const, content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}
