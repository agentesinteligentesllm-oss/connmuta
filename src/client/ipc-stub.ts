import { IPC_REQUEST_TIMEOUT_MS } from "../shared/constants.js";
import { IPC_LOOPBACK_HOST, ipcErrorSchema, toolSuccessSchema, type IpcErrorPayload } from "../shared/ipc-contract.js";
import { performHandshake, type SessionIdentity } from "./handshake.js";
import { ensureDaemonRunning, type DaemonRunPayload } from "./run-state.js";

/**
 * The tool-call transport layer the thin MCP client's four tools (`client/server.ts`) call into: one
 * `IpcSession` per `createIpcSession` call, whose `callTool` POSTs a validated request to one of the
 * four `POST /tools/*` routes and classifies the response (design §10 "IPC"; spec `thin-client-tools`).
 *
 * **Disclosed redundancy: `ensureDaemonRunningImpl` and `performHandshakeImpl` both re-derive daemon
 * liveness.** `performHandshake` (`client/handshake.ts`, PR-33, already merged) calls
 * `ensureDaemonRunning` internally as its own first step, but its return value is a `SessionResponse` —
 * it never exposes the `port` this module also needs to address the `POST /tools/*` call itself.
 * Rather than re-slicing the already-merged, already-audited `handshake.ts` to widen its return shape
 * just to also carry the port, `callTool` calls `ensureDaemonRunningImpl` a second time on every call.
 * Both calls read the same `run/daemon.json` and are idempotent once a daemon is up, so the cost is one
 * extra file read per tool call, never a second spawn attempt or a second network round trip.
 *
 * No caching across calls: every `callTool` invocation re-derives the port and re-runs the handshake.
 * A later PR may cache the session for its lifetime; this one keeps the simplest correct behavior.
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

export function createIpcSession(options: CreateIpcSessionOptions): IpcSession {
  const ensureDaemonRunningImpl = options.ensureDaemonRunningImpl ?? ensureDaemonRunning;
  const performHandshakeImpl = options.performHandshakeImpl ?? performHandshake;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    async callTool(route, input) {
      let runPayload: DaemonRunPayload;
      try {
        runPayload = await ensureDaemonRunningImpl({ homeDir: options.homeDir });
      } catch (err) {
        throw new IpcTransportError("daemon not reachable", { cause: err });
      }

      // A thrown HandshakeError propagates unchanged, uncaught here — client/server.ts translates it
      // via client/errors.ts's clientErrorPayload, since HandshakeError already carries the exact
      // code/retryable this layer would otherwise have to reconstruct.
      const session = await performHandshakeImpl({
        projectId: options.projectId,
        groupId: options.groupId,
        rosterHash: options.rosterHash,
        host: options.host,
        homeDir: options.homeDir,
        fetchImpl,
      });

      let res: Response;
      try {
        res = await fetchImpl(`http://${IPC_LOOPBACK_HOST}:${runPayload.port}${pathFor(route)}`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${session.bearer}` },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(IPC_REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new IpcTransportError("tool call unreachable", { cause: err });
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
