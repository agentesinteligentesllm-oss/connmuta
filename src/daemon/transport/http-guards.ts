/**
 * Shared transport guards (design §"Shared transport-guard module, parameterized Origin check";
 * `f3-web-panel-and-observability` PR-01). Extracted from the `Host` check previously inline in
 * `daemon/ipc/server.ts` (F1 PR-23) so both that module (`requireOrigin: false`, unchanged behavior —
 * MCP clients send no Origin) and the new panel listener (PR-04, `requireOrigin: true`) share one
 * tested check instead of two copies that could drift apart.
 *
 * This module never imports `daemon/ipc/server.ts` — that module will import this one, and importing
 * back would cycle. `GuardRejection` is therefore this module's own local shape, not `IpcResponse`;
 * each caller forwards `{status, body}` as-is (a coincidence that it looks like `IpcResponse` today,
 * per design, not a shared type).
 */

import type { IncomingMessage } from "node:http";

import { HTTP_FORBIDDEN, IPC_HOST_REJECTED, ipcTransportError } from "../../shared/ipc-contract.js";

export interface GuardOptions {
  readonly expectedHost: string;
  readonly requireOrigin: boolean;
}

export interface GuardRejection {
  readonly status: number;
  readonly body: unknown;
}

export type GuardResult = { readonly ok: true } | { readonly ok: false; readonly rejection: GuardRejection };

/**
 * Local to this module (not part of `shared/ipc-contract.ts`'s `IPC_TRANSPORT_ERROR_CODES`, which
 * that module's own doc scopes to codes "raised by `daemon/ipc/server.ts` itself" — the Origin check
 * is never reached there, since it always passes `requireOrigin: false`).
 */
export const TRANSPORT_ORIGIN_REJECTED = "TRANSPORT_ORIGIN_REJECTED";

function originRejection(): GuardRejection {
  return {
    status: HTTP_FORBIDDEN,
    body: { code: TRANSPORT_ORIGIN_REJECTED, message: "Origin header must name this daemon's own loopback address", retryable: false },
  };
}

function hostRejection(): GuardRejection {
  return {
    status: HTTP_FORBIDDEN,
    body: ipcTransportError(IPC_HOST_REJECTED, "Host header must name this daemon's own loopback address"),
  };
}

/**
 * The `Host` check runs unconditionally (DNS-rebinding defense, byte-identical to the pre-PR-01
 * `ipc/server.ts` behavior). The Origin check runs only when `requireOrigin` is true, and only refuses
 * a *present, mismatched* Origin — an absent Origin (plain top-level navigation) is admitted.
 */
export function checkTransportGuards(req: IncomingMessage, opts: GuardOptions): GuardResult {
  if (req.headers.host !== opts.expectedHost) {
    return { ok: false, rejection: hostRejection() };
  }

  if (opts.requireOrigin) {
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== `http://${opts.expectedHost}`) {
      return { ok: false, rejection: originRejection() };
    }
  }

  return { ok: true };
}
