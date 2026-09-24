import type { ToolErrorPayload } from "../shared/error-payload.js";
import type { HandshakeErrorCode } from "./handshake.js";

/**
 * The client-local error-payload constructor design §10 names as its own file, out of
 * `client/handshake.ts`'s PR-33 scope (see that module's own "Disclosed simplification" doc). Builds a
 * {@link ToolErrorPayload} for the eight codes design §10's client error-taxonomy table splits into:
 *
 * - The four {@link HandshakeErrorCode}s (`client/handshake.ts`, PR-33, already merged): raised BY this
 *   client's own handshake layer.
 * - The four {@link ClientPassthroughErrorCode}s: raised by the DAEMON (`daemon/ipc/routes.ts`, PR-31)
 *   and forwarded unchanged by `client/ipc-stub.ts`'s `IpcSession.callTool` (its `{ok: false, error}`
 *   branch) — `client/server.ts` never reconstructs these; it forwards `result.error` as-is.
 *
 * OUT of scope on purpose: v1 tool codes (`UNKNOWN_THREAD`, …) and Telegram codes
 * (`TELEGRAM_RATE_LIMITED`, …) are also daemon-classified and passed through unchanged, but they too
 * arrive already `ipcErrorSchema`-shaped in that same `{ok: false, error}` branch — this constructor
 * never reconstructs them either; `shared/error-payload.ts`'s `errorResult` serializes them directly.
 */

/** Daemon-raised, forwarded unchanged (design §10's client error-taxonomy table); never retryable. */
export type ClientPassthroughErrorCode = "UNBOUND_PROJECT" | "BINDING_CHANGED" | "WRONG_ROOM" | "BINDING_MISMATCH";

export type ClientErrorCode = HandshakeErrorCode | ClientPassthroughErrorCode;

/**
 * `retryable` per {@link ClientErrorCode}. The four handshake values are copied from `handshake.ts`'s
 * own (unexported) `HANDSHAKE_ERROR_RETRYABLE` — that file is closed, already-merged code this PR does
 * not touch, so this table must be kept in sync with it BY HAND. The four passthrough codes are
 * daemon-raised and forwarded unchanged, never retryable.
 */
const CLIENT_ERROR_RETRYABLE: Record<ClientErrorCode, boolean> = {
  DAEMON_DOWN: true,
  DAEMON_IDENTITY_MISMATCH: true,
  DAEMON_VERSION_MISMATCH: false,
  IPC_ERROR: true,
  UNBOUND_PROJECT: false,
  BINDING_CHANGED: false,
  WRONG_ROOM: false,
  BINDING_MISMATCH: false,
};

export function clientErrorPayload(code: ClientErrorCode, message: string): ToolErrorPayload {
  return { code, message, retryable: CLIENT_ERROR_RETRYABLE[code] };
}
