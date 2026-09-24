import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";

import { IPC_NONCE_BYTES, IPC_REQUEST_TIMEOUT_MS } from "../shared/constants.js";
import {
  identityResponseSchema,
  IPC_LOOPBACK_HOST,
  sessionResponseSchema,
  type IdentityResponse,
  type SessionRequest,
  type SessionResponse,
} from "../shared/ipc-contract.js";
import { SERVER_VERSION } from "../shared/version.js";
import {
  ensureDaemonRunning,
  readRunFile,
  resolveClientHomeDir,
  type DaemonRunPayload,
  type EnsureDaemonRunningOptions,
} from "./run-state.js";

/**
 * The daemon-connect sequence the thin MCP client runs lazily, on the first tool call, cached for the
 * session (design §10 "Handshake timing" row; design §10 sequence diagram steps 4-8; spec
 * `ipc-handshake`). Owns exactly the client HALF of `GET /identity` -> verify -> `POST /session`:
 * daemon liveness is `client/run-state.ts`'s `ensureDaemonRunning` (PR-32, called here as this
 * module's own first step); the daemon's own route handlers are `daemon/ipc/{handshake,sessions,
 * routes}.ts` (PR-30/31, merged, never imported here — see below).
 *
 * **Why this module reimplements the HMAC helpers instead of importing the daemon's.**
 * `daemon/ipc/handshake.ts`'s `computeIdentityProof` and `daemon/ipc/sessions.ts`'s
 * `computeSessionProof` already compute the exact two HMACs this module needs to verify/produce. They
 * are not imported: `src/client/tsconfig.json`'s `references` is `[{"path":"../shared"}]` only, so
 * there is today no TypeScript project-reference path from `client/*` to `daemon/*` — the same
 * disclosed, deliberate boundary `client/run-state.ts`'s own module doc already documents for the
 * lock/run-file primitives it reimplements for the same reason (keeps the client bundle's dependency
 * closure isolated from daemon-only code). Given that choice, this module locally reimplements the
 * two pure HMAC functions and the constant-time hex-digest comparison, using the identical
 * `"identity:"`/`"session:"` domain-separation labels D-14 defines.
 *
 * **Client-side error vocabulary this slice authors.** None of {@link HANDSHAKE_ERROR_CODES} existed
 * as string constants anywhere before this slice (design §10's client error-taxonomy table names
 * them in prose only). `IPC_ERROR` is authored here as part of the closed vocabulary but is never
 * thrown by this module: per that table it names "transport failure mid-session AFTER a successful
 * handshake" — a later PR's tool-call transport layer raises it, and this module exists so that layer
 * does not have to re-author the string.
 *
 * **Disclosed simplification: no daemon-error passthrough yet.** design §10's table says
 * `UNBOUND_PROJECT`, `BINDING_CHANGED`, `WRONG_ROOM`, `BINDING_MISMATCH` are "daemon, passed through"
 * unchanged, and `daemon/ipc/handshake.ts`'s `GET /identity` can itself answer `IPC_HANDSHAKE_FLOOD`.
 * This slice does not parse a non-OK response body against `shared/ipc-contract.ts`'s `ipcErrorSchema`
 * and forward it verbatim; a non-OK or schema-invalid `POST /session` response currently folds into
 * `DAEMON_DOWN` (see {@link requestSession}) — "the daemon responded but not in a way this client can
 * complete a handshake with" reads as "not reachable for this purpose" until a later PR builds
 * `client/errors.ts`, the dedicated client-local error payload constructor design §10 names as its own
 * file (out of this PR's 4-file scope).
 *
 * **`DAEMON_DOWN` vs `DAEMON_IDENTITY_MISMATCH` on `GET /identity` failure.** design §10's taxonomy
 * table lists "connection refused" as a `DAEMON_DOWN` trigger, distinct from `DAEMON_IDENTITY_MISMATCH`
 * ("HMAC proof failed"). {@link requestAndVerifyIdentity} therefore returns a three-way result — never
 * got a usable response (`"unreachable"`: transport failure, non-OK status, unparseable or
 * schema-invalid body) is a different case from got-a-response-but-the-proof-was-wrong
 * (`"proof_mismatch"`) — and {@link performHandshake} raises `DAEMON_DOWN` for the former, only ever
 * raising `DAEMON_IDENTITY_MISMATCH` when a proof was actually received and checked.
 */

/** The closed set of error codes the client's handshake layer can raise (design §10 client error-taxonomy table). */
export const HANDSHAKE_ERROR_CODES = [
  "DAEMON_DOWN",
  "DAEMON_IDENTITY_MISMATCH",
  "DAEMON_VERSION_MISMATCH",
  "IPC_ERROR",
] as const;

export type HandshakeErrorCode = (typeof HANDSHAKE_ERROR_CODES)[number];

/** `retryable` per design §10's client error-taxonomy table, keyed by {@link HandshakeErrorCode}. */
const HANDSHAKE_ERROR_RETRYABLE: Record<HandshakeErrorCode, boolean> = {
  DAEMON_DOWN: true,
  DAEMON_IDENTITY_MISMATCH: true,
  DAEMON_VERSION_MISMATCH: false,
  IPC_ERROR: true,
};

/** Thrown by {@link performHandshake}. `retryable` is derived from `code`, never set independently. */
export class HandshakeError extends Error {
  readonly code: HandshakeErrorCode;
  readonly retryable: boolean;

  constructor(code: HandshakeErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "HandshakeError";
    this.code = code;
    this.retryable = HANDSHAKE_ERROR_RETRYABLE[code];
  }
}

/** D-14's domain-separation label for the identity proof (mirrors `daemon/ipc/handshake.ts` — see module doc). */
const IDENTITY_PROOF_LABEL = "identity:";

/** D-14's domain-separation label for the session proof (mirrors `daemon/ipc/sessions.ts` — see module doc). */
const SESSION_PROOF_LABEL = "session:";

/** `HMAC-SHA256(secret, "identity:" + nonce)`, lowercase hex. Pure: no I/O, no clock. */
function computeIdentityProof(secret: string, nonce: string): string {
  return createHmac("sha256", secret).update(`${IDENTITY_PROOF_LABEL}${nonce}`).digest("hex");
}

/** `HMAC-SHA256(secret, "session:" + serverNonce)`, lowercase hex. Pure: no I/O, no clock. */
function computeSessionProof(secret: string, serverNonce: string): string {
  return createHmac("sha256", secret).update(`${SESSION_PROOF_LABEL}${serverNonce}`).digest("hex");
}

/** Constant-time equality of two lowercase-hex digests. A length mismatch is `false` without calling `timingSafeEqual`, which throws on unequal-length buffers. */
function hexDigestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** The session-identifying fields a caller (a later PR's CLI entry point) supplies; this module assembles no roster hash and derives no host label of its own. */
export interface SessionIdentity {
  readonly projectId: string;
  readonly groupId: number;
  readonly rosterHash: string;
  readonly host: string;
}

export interface PerformHandshakeOptions extends SessionIdentity {
  /** Defaults to `~/.conmuta` via {@link resolveClientHomeDir}; forwarded to `ensureDaemonRunning`. */
  readonly homeDir?: string;
  /** Defaults to the real {@link ensureDaemonRunning}; tests inject a stub so no real process is spawned and no real filesystem wait occurs. */
  readonly ensureDaemonRunningImpl?: (options?: EnsureDaemonRunningOptions) => Promise<DaemonRunPayload>;
  /** Defaults to the real `fetch`; tests inject a fake so no real network call is ever made. */
  readonly fetchImpl?: typeof globalThis.fetch;
}

/**
 * `GET /identity?nonce=<hex>` with no `Authorization` header (design §10 sequence step 4). Returns
 * `undefined` on any network failure, non-OK status, unparseable body, or schema-invalid body — see
 * the module doc's disclosed simplification: all of these fold into the caller's `DAEMON_DOWN`.
 */
async function requestIdentity(fetchImpl: typeof globalThis.fetch, port: number, nonce: string): Promise<IdentityResponse | undefined> {
  let res: Response;
  try {
    res = await fetchImpl(`http://${IPC_LOOPBACK_HOST}:${port}/identity?nonce=${nonce}`, {
      signal: AbortSignal.timeout(IPC_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return undefined;
  }
  if (!res.ok) {
    return undefined;
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return undefined;
  }
  const parsed = identityResponseSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}

/**
 * One `GET /identity` attempt and its outcome, distinguishing "never got a usable response"
 * (`"unreachable"` — transport failure, non-OK status, unparseable or schema-invalid body; a
 * `DAEMON_DOWN`-shaped situation) from "got a response, but its proof didn't verify"
 * (`"proof_mismatch"` — a `DAEMON_IDENTITY_MISMATCH`-shaped situation). See the module doc.
 */
type IdentityAttempt =
  | { readonly kind: "unreachable" }
  | { readonly kind: "proof_mismatch" }
  | { readonly kind: "verified"; readonly identity: IdentityResponse };

/** Fetches one identity challenge and verifies its proof against `runPayload.secret`. */
async function requestAndVerifyIdentity(fetchImpl: typeof globalThis.fetch, runPayload: DaemonRunPayload): Promise<IdentityAttempt> {
  const nonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
  const identity = await requestIdentity(fetchImpl, runPayload.port, nonce);
  if (identity === undefined) {
    return { kind: "unreachable" };
  }
  const expectedProof = computeIdentityProof(runPayload.secret, nonce);
  return hexDigestsEqual(expectedProof, identity.proof) ? { kind: "verified", identity } : { kind: "proof_mismatch" };
}

/**
 * `POST /session` with the session HMAC (design §10 sequence steps 7-8). Returns `undefined` on any
 * network failure, non-OK status, unparseable body, or schema-invalid body — see the module doc's
 * disclosed simplification.
 */
async function requestSession(
  fetchImpl: typeof globalThis.fetch,
  runPayload: DaemonRunPayload,
  serverNonce: string,
  identity: SessionIdentity,
): Promise<SessionResponse | undefined> {
  const requestBody = {
    project_id: identity.projectId,
    group_id: identity.groupId,
    roster_hash: identity.rosterHash,
    host: identity.host,
    pid: process.pid,
    hmac: computeSessionProof(runPayload.secret, serverNonce),
    server_nonce: serverNonce,
  } satisfies SessionRequest;

  let res: Response;
  try {
    res = await fetchImpl(`http://${IPC_LOOPBACK_HOST}:${runPayload.port}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(IPC_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return undefined;
  }
  if (!res.ok) {
    return undefined;
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return undefined;
  }
  const parsed = sessionResponseSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
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
 * 2. `GET /identity` and verify the proof (constant-time). On any failure to complete that check —
 *    transport error, non-OK status, malformed body, or a verified-but-wrong proof — re-reads
 *    `run/daemon.json` ONCE (a raw {@link readRunFile}, not a second `ensureDaemonRunningImpl` call — a
 *    re-spawn is not what "one re-read" means) and retries exactly once against whatever it finds. No
 *    bearer is ever sent on this path, because `requestSession` is never reached. The re-read finding
 *    no live run file at all, or the retry never producing a usable response, raises `DAEMON_DOWN`
 *    (design §10's taxonomy lists "connection refused" there, not under `DAEMON_IDENTITY_MISMATCH`);
 *    only a retry that DOES receive a response whose proof still fails to verify raises
 *    `DAEMON_IDENTITY_MISMATCH`.
 * 3. On a verified proof whose `build` disagrees with {@link SERVER_VERSION}, raises
 *    `DAEMON_VERSION_MISMATCH` before ever calling `POST /session` — an unverified responder's `build`
 *    claim is not trusted enough to act on, so this check runs only after step 2 verifies the proof.
 * 4. `POST /session` with the session HMAC computed from the verified run payload's secret and the
 *    identity response's `server_nonce`. A failure here also folds into `DAEMON_DOWN` (see the module
 *    doc's disclosed simplification).
 */
export async function performHandshake(options: PerformHandshakeOptions): Promise<SessionResponse> {
  const ensureDaemonRunningImpl = options.ensureDaemonRunningImpl ?? ensureDaemonRunning;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  let runPayload: DaemonRunPayload;
  try {
    runPayload = await ensureDaemonRunningImpl({ homeDir: options.homeDir });
  } catch (err) {
    throw new HandshakeError("DAEMON_DOWN", "no daemon is reachable", { cause: err });
  }

  let attempt = await requestAndVerifyIdentity(fetchImpl, runPayload);
  if (attempt.kind !== "verified") {
    const runDir = join(resolveClientHomeDir(options.homeDir), "run");
    const reread = readRunFile(runDir);
    if (reread === null) {
      throw new HandshakeError("DAEMON_DOWN", "identity request failed and no live daemon was found on re-read");
    }
    runPayload = reread;
    attempt = await requestAndVerifyIdentity(fetchImpl, runPayload);
    if (attempt.kind === "unreachable") {
      throw new HandshakeError("DAEMON_DOWN", "identity request unreachable after one re-read retry");
    }
    if (attempt.kind === "proof_mismatch") {
      throw new HandshakeError("DAEMON_IDENTITY_MISMATCH", "identity proof did not verify after one re-read retry");
    }
  }
  const identity = attempt.identity;

  if (identity.build !== SERVER_VERSION) {
    throw new HandshakeError("DAEMON_VERSION_MISMATCH", `daemon build "${identity.build}" does not match this client's "${SERVER_VERSION}"`);
  }

  const sessionResponse = await requestSession(fetchImpl, runPayload, identity.server_nonce, options);
  if (sessionResponse === undefined) {
    throw new HandshakeError("DAEMON_DOWN", "POST /session failed or returned a malformed response");
  }
  return sessionResponse;
}
