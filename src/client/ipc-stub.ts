import { IPC_REQUEST_TIMEOUT_MS, SESSION_RELEASE_TIMEOUT_MS } from "../shared/constants.js";
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
 * "cached for the session" requirement exactly. The cache is the PROMISE (`ensureSession`), not just the
 * resolved value (Judgment Day round-1 WARNING, Judge A): two `callTool` calls racing before the first
 * handshake resolves both see the same in-flight promise and await it together, rather than each starting
 * their own — closing a narrower echo of the same exhaustion mechanism that would otherwise still let
 * concurrent callers each mint an extra, uncoordinated bearer.
 *
 * **The session is released on the way out (B-106).** {@link IpcSession.release} exists because the
 * ceiling described above is only survivable if a session's slot comes back when the session ends.
 * `SessionStore.revoke` and the `DELETE /session` route have existed since PR-31; this client — the one
 * component instanced once per HOST session — never called them, so every host session that ended left
 * a slot occupied until the daemon restarted, at a measured ~2.5 session-shapes per hour on the machine
 * where it was filed. `client/main.ts` calls `release()` after the stdio transport closes. The release
 * is deliberately WEAKER than a tool call in three named ways: it never handshakes and never spawns a
 * daemon (an exit path that can start a process is worse than the leak it prevents), it is bounded by
 * {@link SESSION_RELEASE_TIMEOUT_MS} rather than the 70 s tool timeout so a hung daemon cannot hold the
 * process open, and every failure is swallowed — the process is leaving either way, and the failure
 * mode of a failed release is exactly the state the process was in before the call existed.
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

/** One of the four tool routes `shared/ipc-contract.ts`'s `IpcRouteKey` also names — narrowed here because this object never dials `GET /identity` or `POST /session` (those are `client/handshake.ts`'s job). `DELETE /session` IS dialed from here, by `IpcSession.release` (B-106); it is deliberately not a member of this union because it carries no tool input and is never routed through {@link IpcToolResult}'s classification. */
export type IpcToolRoute = "POST /tools/send" | "POST /tools/fetch" | "POST /tools/status" | "POST /tools/thread";

/** A classified tool-call outcome: the daemon's own success body, or its own `ipcErrorSchema`-shaped rejection — forwarded verbatim either way, never reinterpreted here. */
export type IpcToolResult =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly error: IpcErrorPayload };

export interface IpcSession {
  callTool(route: IpcToolRoute, input: unknown): Promise<IpcToolResult>;
  /**
   * Releases this session's daemon slot (`DELETE /session`) and clears the cache. Never throws, never
   * handshakes, never spawns a daemon, and resolves immediately when no session was ever minted — see
   * this module's doc. Required rather than optional so an implementation cannot silently omit it: the
   * daemon's slot ceiling is a shared resource, not a per-client detail.
   */
  release(): Promise<void>;
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

/**
 * `promise`'s value, or `undefined` if it has not settled within `ms` (B-106). The timer is `unref`ed
 * on purpose: it only ever BOUNDS a wait on an exit path, and it must never be the reason a process
 * stays alive. A rejection propagates — the caller decides what an unfulfillable attempt means.
 */
async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const expiry = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms);
      if (typeof timer.unref === "function") {
        timer.unref();
      }
    });
    return await Promise.race([promise, expiry]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
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

  // A cached PROMISE, not a cached VALUE (Judgment Day round-1 WARNING, Judge A). `cached ?? (await
  // connect())` alone lets two callTool() invocations that both start before either's connect() resolves
  // each observe no cached value and each independently mint their own session -- a narrower echo of the
  // original CRITICAL's exhaustion mechanism, since every concurrent racer mints one extra bearer instead
  // of sharing one. Memoizing the PROMISE itself closes this: the assignment on the line below happens
  // synchronously, before connect()'s first `await` ever yields, so a second caller arriving in the same
  // tick already sees the first caller's in-flight promise and awaits it instead of starting its own.
  let connecting: Promise<CachedSession> | undefined;

  /**
   * The settled session, if one exists — what {@link release} revokes. Kept separate from the cached
   * promise on purpose: `release` must be able to ask "is there a session to release?" WITHOUT calling
   * `ensureSession()`, because that would handshake on the exit path (and could spawn a daemon).
   */
  let current: CachedSession | undefined;

  /** The one shared handshake attempt, in flight or already settled. A rejection clears itself so the next call gets a fresh attempt rather than a permanently-cached failure. */
  function ensureSession(): Promise<CachedSession> {
    if (connecting === undefined) {
      connecting = connect()
        .then((settled) => {
          current = settled;
          return settled;
        })
        .catch((err: unknown) => {
          connecting = undefined;
          throw err;
        });
    }
    return connecting;
  }

  /** Runs the handshake. A thrown `HandshakeError` propagates unchanged. Never call directly -- go through {@link ensureSession}. */
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

    return { port: runPayload.port, bearer: session.bearer };
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
      const session = await ensureSession();

      let res = await postOnce(session, route, input);
      if (res.status === HTTP_UNAUTHORIZED) {
        // The cached bearer is no longer recognized -- most likely the daemon restarted since it was
        // minted (a fresh SessionStore invalidates every prior bearer). Re-handshake once and retry
        // once; a second failure of any kind falls through to the classification below, never loops.
        // Discarding `connecting` unconditionally (not just when it still resolves to `session`) is
        // deliberate: any concurrent caller sharing this same stale attempt needs a fresh one too.
        // `current` is cleared with it so a `release()` racing this refresh can never revoke a bearer
        // this client no longer uses.
        connecting = undefined;
        current = undefined;
        const fresh = await ensureSession();
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

    async release() {
      // Judgment Day round-1 CRITICAL and WARNING (judge B), both verified against the source before
      // being accepted: a handshake can be IN FLIGHT when this runs. Awaiting the attempt that already
      // exists is not "starting" one — no spawn, no new handshake — and without it the slot that
      // handshake is about to mint would never be revoked, which is the very leak this exists to close.
      // Bounded by the same constant as the request itself, because an unbounded await here would let a
      // hung handshake hold the exit path open, and one lost slot is strictly better than a client that
      // will not quit.
      if (current === undefined && connecting !== undefined) {
        try {
          current = await settleWithin(connecting, SESSION_RELEASE_TIMEOUT_MS);
        } catch {
          // The in-flight attempt failed, so it minted nothing: there is nothing to revoke.
          current = undefined;
        }
      }

      const session = current;
      if (session === undefined) {
        // No session was ever minted (and none is being minted): there is no slot to give back, and
        // asking for one in order to release it would be absurd on an exit path. Return without a
        // single network call or spawn.
        return;
      }
      // Clear before the request, not after: the slot is no longer ours the moment we stop using it,
      // and a later tool call on this session must mint a new bearer rather than reuse a revoked one.
      current = undefined;
      connecting = undefined;
      try {
        await fetchImpl(`http://${IPC_LOOPBACK_HOST}:${session.port}/session`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${session.bearer}` },
          signal: AbortSignal.timeout(SESSION_RELEASE_TIMEOUT_MS),
        });
      } catch {
        // Swallowed by design: the caller is exiting, nothing here is actionable, and failing to
        // release leaves exactly the state the daemon was already in without this call.
      }
    },
  };
}
