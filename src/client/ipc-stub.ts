import { IPC_REQUEST_TIMEOUT_MS } from "../shared/constants.js";
import { HTTP_UNAUTHORIZED, IPC_LOOPBACK_HOST, ipcErrorSchema, toolSuccessSchema, type IpcErrorPayload } from "../shared/ipc-contract.js";
import { performHandshake, type SessionIdentity } from "./handshake.js";
import { ensureDaemonRunning, type DaemonRunPayload } from "./run-state.js";

/**
 * The tool-call transport layer the thin MCP client's four tools (`client/server.ts`) call into: one
 * `IpcSession` per `createIpcSession` call, whose `callTool` POSTs a validated request to one of the
 * four `POST /tools/*` routes and classifies the response (design §10 "IPC"; spec `thin-client-tools`).
 *
 * **Session caching (design §11 "Handshake timing": "Lazy, on the first tool call, cached for the
 * session") — Judgment Day CRITICAL, fixed.** An earlier version of this module re-ran the full
 * handshake, including `POST /session`, on every single `callTool` invocation. `POST /session` mints a
 * brand-new bearer every time (`daemon/ipc/sessions.ts`'s `SessionStore.mint`), and that store enforces
 * a hard, NEVER-SELF-EXPIRING `MAX_ACTIVE_SESSIONS` ceiling shared across every project the daemon
 * serves; nothing in this client ever calls `DELETE /session` to release one. Re-handshaking per call
 * meant the ceiling — not a real daemon outage — would eventually make `SessionStore.mint` refuse, which
 * `client/handshake.ts`'s `performHandshake` reports as `HandshakeError("DAEMON_DOWN", retryable: true)`:
 * a false, permanent "daemon is down" for every project on that daemon, recoverable only by a full
 * daemon restart. Fixed: the handshake now runs at most once per `IpcSession`, its result (`port` +
 * `bearer`) cached for every subsequent `callTool` call on that same session — matching the ratified
 * "cached for the session" requirement exactly.
 *
 * **Self-healing on a stale cached bearer.** A daemon restart mints a brand-new `SessionStore` (and a
 * brand-new per-boot secret, `lifecycle/run-file.ts`'s `writeRunFile`), invalidating every bearer minted
 * before it — including one this module has already cached. `callTool` detects this via the daemon's own
 * `401` (`HTTP_UNAUTHORIZED`) response, clears the stale cache entry, re-runs the handshake exactly once,
 * and retries the same tool call exactly once against the fresh session — mirroring
 * `client/handshake.ts`'s own established "re-read then retry once" pattern for a failed `GET /identity`.
 * A second `401` (or any other outcome) after that one retry is not retried again; it falls through to
 * this function's normal response classification below, never loops.
 *
 * **Disclosed redundancy, still present on the FIRST call only: `ensureDaemonRunningImpl` and
 * `performHandshakeImpl` both re-derive daemon liveness.** `performHandshake` (`client/handshake.ts`,
 * PR-33, already merged) calls `ensureDaemonRunning` internally as its own first step, but its return
 * value is a `SessionResponse` — it never exposes the `port` this module also needs to address the
 * `POST /tools/*` call itself. Rather than re-slicing the already-merged, already-audited `handshake.ts`
 * to widen its return shape just to also carry the port, `connect` below calls `ensureDaemonRunningImpl`
 * a second time. Both calls read the same `run/daemon.json` and are idempotent once a daemon is up, so
 * the cost is one extra file read, paid at most once per session now that the result is cached — never a
 * second spawn attempt or a second network round trip, and never repeated per tool call.
 */

/** One of the four tool routes `shared/ipc-contract.ts`'s `IpcRouteKey` also names — narrowed here since `IpcSession` never dials `GET /identity`, `POST /session` or `DELETE /session` (those are `client/handshake.ts`'s job). */
export type IpcToolRoute = "POST /tools/send" | "POST /tools/fetch" | "POST /tools/status" | "POST /tools/thread";

/** A classified tool-call outcome: the daemon's own success body, or its own `ipcErrorSchema`-shaped rejection — forwarded verbatim either way, never reinterpreted here. */
export type IpcToolResult =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly error: IpcErrorPayload };

export interface IpcSession {
  callTool(route: IpcToolRoute, input: unknown): Promise<IpcToolResult>;
}

/** Any failure below the tool-classification layer: an unreachable daemon, a dead connection mid-call, or a response neither `toolSuccessSchema` nor `ipcErrorSchema` can parse. */
export class IpcTransportError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "IpcTransportError";
  }
}

export interface CreateIpcSessionOptions extends SessionIdentity {
  /** Defaults to `~/.conmuta` via `resolveClientHomeDir`; forwarded to both daemon-liveness calls below. */
  readonly homeDir?: string;
  /** Defaults to the real {@link ensureDaemonRunning}; tests inject a stub so no real process is spawned. */
  readonly ensureDaemonRunningImpl?: typeof ensureDaemonRunning;
  /** Defaults to the real {@link performHandshake}; tests inject a stub so no real network call is made. */
  readonly performHandshakeImpl?: typeof performHandshake;
  /** Defaults to the real `fetch`; tests inject a fake so the `POST /tools/*` call never hits the network. */
  readonly fetchImpl?: typeof globalThis.fetch;
}

/** `route` with its leading `"POST "` verb stripped, e.g. `"POST /tools/send"` -> `"/tools/send"`. */
function pathFor(route: IpcToolRoute): string {
  return route.slice("POST ".length);
}

/** The two fields every `callTool` invocation needs to address and authenticate a `POST /tools/*` call. */
interface CachedSession {
  readonly port: number;
  readonly bearer: string;
}

export function createIpcSession(options: CreateIpcSessionOptions): IpcSession {
  const ensureDaemonRunningImpl = options.ensureDaemonRunningImpl ?? ensureDaemonRunning;
  const performHandshakeImpl = options.performHandshakeImpl ?? performHandshake;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  let cached: CachedSession | undefined;

  /** Runs the handshake, caching (and overwriting) its result. A thrown `HandshakeError` propagates unchanged. */
  async function connect(): Promise<CachedSession> {
    let runPayload: DaemonRunPayload;
    try {
      runPayload = await ensureDaemonRunningImpl({ homeDir: options.homeDir });
    } catch (err) {
      throw new IpcTransportError("daemon not reachable", { cause: err });
    }

    const session = await performHandshakeImpl({
      projectId: options.projectId,
      groupId: options.groupId,
      rosterHash: options.rosterHash,
      host: options.host,
      homeDir: options.homeDir,
      fetchImpl,
    });

    const result: CachedSession = { port: runPayload.port, bearer: session.bearer };
    cached = result;
    return result;
  }

  /** One `POST` attempt against `session`. Never inspects the response beyond obtaining it. */
  async function postOnce(session: CachedSession, route: IpcToolRoute, input: unknown): Promise<Response> {
    try {
      return await fetchImpl(`http://${IPC_LOOPBACK_HOST}:${session.port}${pathFor(route)}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.bearer}` },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(IPC_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new IpcTransportError("tool call unreachable", { cause: err });
    }
  }

  return {
    async callTool(route, input) {
      const session = cached ?? (await connect());

      let res = await postOnce(session, route, input);
      if (res.status === HTTP_UNAUTHORIZED) {
        // The cached bearer is no longer recognized -- most likely the daemon restarted since it was
        // minted (a fresh SessionStore invalidates every prior bearer). Re-handshake once and retry
        // once; a second failure of any kind falls through to the classification below, never loops.
        cached = undefined;
        const fresh = await connect();
        res = await postOnce(fresh, route, input);
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch (err) {
        throw new IpcTransportError("tool call returned an unparseable body", { cause: err });
      }

      if (res.ok) {
        const parsed = toolSuccessSchema.safeParse(body);
        if (parsed.success) {
          return { ok: true, data: parsed.data };
        }
      } else {
        const parsed = ipcErrorSchema.safeParse(body);
        if (parsed.success) {
          return { ok: false, error: parsed.data };
        }
      }
      throw new IpcTransportError("tool call returned a malformed response");
    },
  };
}
