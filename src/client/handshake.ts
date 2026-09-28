import type { SessionResponse } from "../shared/ipc-contract.js";
import { ensureDaemonRunning, type DaemonRunPayload, type EnsureDaemonRunningOptions } from "./run-state.js";
import { exchangeSession, HandshakeError, type SessionIdentity } from "./session-exchange.js";

// Move-only split (F4 design D6): the HMAC helpers, the identity/session requests, `HandshakeError` and
// its codes now live in `./session-exchange.js`, which has no spawn capability. Re-exported so every
// existing import path through this module keeps working.
export { exchangeSession, HANDSHAKE_ERROR_CODES, HandshakeError } from "./session-exchange.js";
export type { ExchangeSessionOptions, HandshakeErrorCode, SessionIdentity } from "./session-exchange.js";

/**
 * The daemon-connect sequence the thin MCP client runs lazily, on the first tool call, cached for the
 * session (design §10 "Handshake timing" row; spec `ipc-handshake`): `ensureDaemonRunning` (spawn-capable,
 * from `client/run-state.ts`) followed by `exchangeSession` (the spawn-free verify-and-session half in
 * `client/session-exchange.ts`, whose module doc carries the full rationale and error vocabulary).
 */

export interface PerformHandshakeOptions extends SessionIdentity {
  /** Defaults to `~/.conmuta` via {@link resolveClientHomeDir}; forwarded to `ensureDaemonRunning`. */
  readonly homeDir?: string;
  /** Defaults to the real {@link ensureDaemonRunning}; tests inject a stub so no real process is spawned and no real filesystem wait occurs. */
  readonly ensureDaemonRunningImpl?: (options?: EnsureDaemonRunningOptions) => Promise<DaemonRunPayload>;
  /** Defaults to the real `fetch`; tests inject a fake so no real network call is ever made. */
  readonly fetchImpl?: typeof globalThis.fetch;
}

/**
 * Runs the full daemon-connect sequence and resolves with the daemon's session response.
 *
 * 1. `ensureDaemonRunningImpl` first (defaults to the real `ensureDaemonRunning`,
 *    {@link EnsureDaemonRunningOptions}). Any failure — including `run-state.ts`'s own
 *    `DaemonSpawnTimeoutError` from a spawn wait that never saw a live run file — is raised as
 *    `DAEMON_DOWN` immediately, with **zero fetch calls**: the `try` around this step is the only
 *    thing between entry and the first possible network call, so this is a structural guarantee, not
 *    merely an observed one.
 * 2. {@link exchangeSession} with the resulting run payload: `GET /identity` with its one-re-read
 *    retry, the `SERVER_VERSION` check, then `POST /session` (semantics documented there).
 */
export async function performHandshake(options: PerformHandshakeOptions): Promise<SessionResponse> {
  const ensureDaemonRunningImpl = options.ensureDaemonRunningImpl ?? ensureDaemonRunning;

  let runPayload: DaemonRunPayload;
  try {
    runPayload = await ensureDaemonRunningImpl({ homeDir: options.homeDir });
  } catch (err) {
    throw new HandshakeError("DAEMON_DOWN", "no daemon is reachable", { cause: err });
  }

  return exchangeSession(runPayload, options, { homeDir: options.homeDir, fetchImpl: options.fetchImpl });
}
