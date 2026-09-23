/**
 * The daemon's identity handshake (`daemon/ipc/handshake.ts`, design §10 "IPC", spec `ipc-handshake`
 * "No bearer before identity proof", PT-26). New code: design §12 lists no v1 range for this module —
 * v1 had no local daemon and no HTTP surface at all — so this file carries no vendoring header and
 * adds no row to `test/fixtures/v1-provenance.json`.
 *
 * Owns exactly two things: the `GET /identity` route handler, and the `PendingHandshakeStore` that
 * backs it. Nothing else — `POST /session`'s own handler, binding resolution and the freeze are
 * `daemon/ipc/routes.ts` (PR-31); the session bearer itself is `daemon/ipc/sessions.ts` (this PR, a
 * deliberately separate and narrower module — see its own doc for why).
 *
 * **`DAEMON_IDENTITY_MISMATCH` is exclusively client-side vocabulary.** `ipc-handshake`'s own scenario
 * is framed as "WHEN the client verifies…", design's sequence diagram draws the mismatch as a `C->>C`
 * self-message, and design's client-error-taxonomy table scopes it to `shared/error-payload.ts` /
 * `client/errors.ts` (PR-33). This module never raises or mentions that code. What it guarantees
 * instead is the cryptographic property the client's own check depends on: {@link computeIdentityProof}
 * is deterministic and bound to the daemon's REAL per-boot secret, so a client that independently
 * computes the same HMAC with a different secret gets a different, non-matching value and refuses to
 * send a bearer.
 */

import { createHmac, randomBytes } from "node:crypto";

import { HANDSHAKE_NONCE_TTL_SECONDS, IPC_NONCE_BYTES, MAX_PENDING_HANDSHAKES } from "../../shared/constants.js";
import {
  HTTP_BAD_REQUEST,
  HTTP_OK,
  HTTP_TOO_MANY_REQUESTS,
  identityRequestQuerySchema,
  IPC_BAD_REQUEST,
  ipcHandshakeFloodError,
  ipcTransportError,
  type IdentityResponse,
} from "../../shared/ipc-contract.js";
import { SERVER_VERSION } from "../../shared/version.js";
import type { IpcHandler, IpcRequest, IpcResponse } from "./server.js";

/**
 * D-14's domain-separation label for the identity proof — distinct from `sessions.ts`'s `"session:"`
 * label so the two HMACs can never be swapped for one another.
 */
const IDENTITY_PROOF_LABEL = "identity:";

/**
 * `HMAC-SHA256(secret, "identity:" + nonce)`, lowercase hex — the daemon's answer to
 * `GET /identity?nonce=<n>` (D-14). Pure: no I/O, no clock.
 */
export function computeIdentityProof(secret: string, nonce: string): string {
  return createHmac("sha256", secret).update(`${IDENTITY_PROOF_LABEL}${nonce}`).digest("hex");
}

/**
 * Holds the daemon's own pending handshake nonces (design §10 "Flood" row): every `server_nonce`
 * {@link PendingHandshakeStore.issue} has handed out and not yet {@link PendingHandshakeStore.consume}d
 * or expired. Bounded by {@link MAX_PENDING_HANDSHAKES}; entries expire lazily — there is no timer
 * (the autonomy boundary, AGENTS.md §3) — swept only on an `issue` or `consume` call, against an
 * injected clock so a caller (this module's own tests, and PR-31's `routes.ts`) can control time
 * deterministically.
 */
export class PendingHandshakeStore {
  private readonly pending = new Map<string, number>(); // server_nonce -> expiresAtMs
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Drops every entry whose TTL has elapsed as of `this.now()`. */
  private sweepExpired(): void {
    const nowMs = this.now();
    for (const [nonce, expiresAtMs] of this.pending) {
      if (expiresAtMs <= nowMs) {
        this.pending.delete(nonce);
      }
    }
  }

  /**
   * Issues a fresh, single-use `server_nonce` good for {@link HANDSHAKE_NONCE_TTL_SECONDS} seconds, or
   * `undefined` when the store already holds {@link MAX_PENDING_HANDSHAKES} entries — a flood, refused
   * rather than queued.
   */
  issue(): string | undefined {
    this.sweepExpired();
    if (this.pending.size >= MAX_PENDING_HANDSHAKES) {
      return undefined;
    }
    const nonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
    this.pending.set(nonce, this.now() + HANDSHAKE_NONCE_TTL_SECONDS * 1000);
    return nonce;
  }

  /**
   * Consumes one pending `server_nonce`: `true` and removes it when it was still pending and
   * unexpired, `false` (no state change) otherwise. Single-use — a second `consume` of the same nonce
   * always answers `false`.
   */
  consume(nonce: string): boolean {
    this.sweepExpired();
    if (!this.pending.has(nonce)) {
      return false;
    }
    this.pending.delete(nonce);
    return true;
  }
}

export interface IdentityHandlerDeps {
  /** This boot's run secret (`writeRunFile`'s `secret`) — signs the identity proof and nothing else. */
  readonly secret: string;
  readonly store: PendingHandshakeStore;
}

/**
 * Builds the `GET /identity` {@link IpcHandler} (design §10 sequence steps 4-5). Reads only `nonce`
 * from the query string; always answers `HTTP_OK` with a fresh, signed challenge unless the pending
 * store is at capacity, in which case it answers `HTTP_TOO_MANY_REQUESTS` / `IPC_HANDSHAKE_FLOOD` and
 * issues no nonce. `pid` is `process.pid` directly — the same running process reporting itself,
 * simpler and more obviously correct than plumbing it through from the run file it already wrote.
 */
export function createIdentityHandler(deps: IdentityHandlerDeps): IpcHandler {
  return (request: IpcRequest): IpcResponse => {
    const parsed = identityRequestQuerySchema.safeParse(Object.fromEntries(request.query));
    if (!parsed.success) {
      // A missing or malformed `nonce` is the caller's mistake, not the daemon's — the same
      // IPC_BAD_REQUEST family server.ts itself answers with for its own malformed-input cases, so it
      // never falls through to server.ts's generic (and misleading) 500 catch-all.
      return { status: HTTP_BAD_REQUEST, body: ipcTransportError(IPC_BAD_REQUEST, "invalid or missing nonce") };
    }

    const serverNonce = deps.store.issue();
    if (serverNonce === undefined) {
      return {
        status: HTTP_TOO_MANY_REQUESTS,
        body: ipcHandshakeFloodError(`more than ${MAX_PENDING_HANDSHAKES} handshakes are already pending`),
      };
    }

    const response: IdentityResponse = {
      proof: computeIdentityProof(deps.secret, parsed.data.nonce),
      server_nonce: serverNonce,
      pid: process.pid,
      build: SERVER_VERSION,
    };
    return { status: HTTP_OK, body: response };
  };
}
