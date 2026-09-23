/**
 * The daemon's IPC HTTP transport (`daemon/ipc/server.ts`, design §10 "IPC", design §15 "IPC" layer:
 * "real `node:http` listener on port 0"). New code: design §12 lists no v1 range for this module — v1
 * had no local daemon and no HTTP surface at all — so this file carries no vendoring header and adds
 * no row to `test/fixtures/v1-provenance.json`.
 *
 * **Pure transport, nothing else.** This module never validates a body against a route's schema
 * (`shared/ipc-contract.ts` schemas are PR-30/31's to apply inside their handlers), never reads or
 * checks `Authorization` (PR-30/31 own the bearer), starts no timer and emits nothing on its own
 * initiative (the autonomy boundary, AGENTS.md §3) — every response is a direct reply to the request
 * that triggered it. What it DOES own is the request pipeline every route shares before a handler
 * ever sees the request: the `Host` DNS-rebinding check, the fixed route lookup, the
 * `IPC_MAX_BODY_BYTES` cap, and the JSON content-type/parse check — each refusal answered with an
 * {@link ipcErrorSchema}-shaped body and one of this contract's transport codes.
 *
 * **Connection handling on a refusal.** A refusal raised BEFORE the request body has been fully read
 * (`Host` mismatch, unknown route) closes the connection afterwards: `Connection: close`, then an
 * immediate `destroy()` once the response has flushed. Node already ends a `Connection: close`
 * socket after the response on its own (a graceful `destroySoon`), so the test suite cannot tell the
 * explicit destroy apart; it is kept because it tears the socket down at once instead of waiting on
 * a client that still owes body bytes: the leftover, unread request bytes would
 * otherwise corrupt whatever the client sends next on a kept-alive socket. A refusal raised AFTER the
 * body has already been fully drained (wrong content type, malformed JSON, a body on `GET`/`DELETE`,
 * a handler that threw) answers on the same connection normally, because there is nothing left unread
 * to corrupt it. The body-cap refusal is a special case of the first kind: the moment the streamed
 * byte count exceeds the cap, this module stops reading, answers immediately, and closes. A client
 * still writing at that moment may meet a connection reset instead of reading the 413 (unread bytes
 * at close); that is accepted — the cap bounds the daemon's memory, and the thin client never sends
 * a body near it.
 *
 * **Logging.** `daemon/log.ts`'s `writeDaemonLog` takes a run directory, not a per-request sink, so it
 * cannot be this module's dependency type directly without pulling a filesystem path into a transport
 * module that has none otherwise. `deps.log` is instead the minimal shape a caller can trivially wrap
 * it into (`log: (message) => writeDaemonLog(runDir, message)`, PR-30+'s job; `writeDaemonLog`
 * redacts token shapes before writing). Only a handler's thrown-error MESSAGE is ever passed to it,
 * never a request body or header.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { IPC_EPHEMERAL_PORT, IPC_MAX_BODY_BYTES } from "../../shared/constants.js";
import {
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_PAYLOAD_TOO_LARGE,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
  IPC_BAD_REQUEST,
  IPC_HOST_REJECTED,
  IPC_INTERNAL_ERROR,
  IPC_LOOPBACK_HOST,
  IPC_PAYLOAD_TOO_LARGE,
  IPC_ROUTES,
  IPC_ROUTE_NOT_FOUND,
  IPC_UNSUPPORTED_MEDIA_TYPE,
  ipcTransportError,
  type IpcRouteKey,
} from "../../shared/ipc-contract.js";

/** One parsed, transport-validated request handed to a route handler. */
export interface IpcRequest {
  readonly route: IpcRouteKey;
  readonly query: URLSearchParams;
  readonly headers: IncomingMessage["headers"];
  /** Parsed JSON body for a `POST` route; `undefined` for `GET`/`DELETE`, which never carry one. */
  readonly body: unknown;
}

/** What a route handler returns; written to the wire as JSON with the given status. */
export interface IpcResponse {
  readonly status: number;
  readonly body: unknown;
}

export type IpcHandler = (request: IpcRequest) => Promise<IpcResponse> | IpcResponse;

/** The minimal logging hook this module accepts. See the module doc for why it is not `daemon/log.ts`'s own `writeDaemonLog` signature. */
export type IpcServerLog = (message: string) => void;

export interface IpcServerDeps {
  /** One handler per route this daemon actually serves; a route with no entry answers `HTTP_NOT_FOUND` exactly like an unknown route. */
  readonly handlers: Partial<Record<IpcRouteKey, IpcHandler>>;
  readonly log?: IpcServerLog;
}

export interface IpcServerHandle {
  /** Binds `IPC_LOOPBACK_HOST:IPC_EPHEMERAL_PORT`. Refuses a second call on the same handle. */
  listen(): Promise<{ port: number }>;
  /** Resolves once every connection has been closed. Safe to call before `listen()` or more than once. */
  close(): Promise<void>;
}

const ROUTE_KEY_SET: ReadonlySet<string> = new Set(IPC_ROUTES);

/** `"<METHOD> <pathname>"` when it names one of the fixed routes, else `undefined`. */
function routeKeyFor(method: string, pathname: string): IpcRouteKey | undefined {
  const candidate = `${method} ${pathname}`;
  return ROUTE_KEY_SET.has(candidate) ? (candidate as IpcRouteKey) : undefined;
}

const JSON_MEDIA_TYPE = "application/json";

/** Whether `Content-Type` names `application/json`, ignoring case and any `;`-separated parameter such as `charset`. */
function isJsonContentType(header: string | undefined): boolean {
  if (header === undefined) return false;
  const mediaType = header.split(";")[0]?.trim().toLowerCase();
  return mediaType === JSON_MEDIA_TYPE;
}

/** `Content-Length` as a finite byte count, or `undefined` when absent or not a number. */
function declaredContentLength(header: string | undefined): number | undefined {
  if (header === undefined) return undefined;
  const parsed = Number(header);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * `JSON.stringify(body)`, refusing a body that serializes to nothing (`undefined`, a function): a
 * response labelled `application/json` must carry a JSON text, so such a handler result is the
 * handler's fault and lands in the 500 path like a throw.
 */
function serializeBody(body: unknown): string {
  const payload: string | undefined = JSON.stringify(body);
  if (payload === undefined) {
    throw new TypeError("response body does not serialize to JSON");
  }
  return payload;
}

/** Writes a JSON response and returns; the connection stays open for the next request. */
function respondJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = serializeBody(body); // before the head, so a throw leaves no response half-written
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

/**
 * Writes a JSON response and closes the connection once it has flushed. Used exactly for the
 * refusals raised before the request body has been fully read (module doc's connection-handling
 * paragraph).
 */
function respondJsonAndClose(res: ServerResponse, req: IncomingMessage, status: number, body: unknown): void {
  const payload = serializeBody(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", Connection: "close" });
  res.end(payload, () => {
    req.socket?.destroy();
  });
}

/**
 * Reads the request body up to `IPC_MAX_BODY_BYTES`. Returns the collected bytes, or `undefined`
 * once a refusal has already been written to `res` (an over-cap declared `Content-Length`, or the
 * streamed count exceeding the cap) — the caller must not write a second response in that case.
 */
function collectBody(req: IncomingMessage, res: ServerResponse): Promise<Buffer | undefined> {
  const declared = declaredContentLength(req.headers["content-length"]);
  if (declared !== undefined && declared > IPC_MAX_BODY_BYTES) {
    respondJsonAndClose(
      res,
      req,
      HTTP_PAYLOAD_TOO_LARGE,
      ipcTransportError(IPC_PAYLOAD_TOO_LARGE, `declared Content-Length exceeds the ${IPC_MAX_BODY_BYTES}-byte limit`),
    );
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };
    const onData = (chunk: Buffer) => {
      if (settled) return; // never answer twice, even if a chunk is delivered after the refusal
      total += chunk.length;
      if (total > IPC_MAX_BODY_BYTES) {
        settled = true;
        cleanup();
        respondJsonAndClose(
          res,
          req,
          HTTP_PAYLOAD_TOO_LARGE,
          ipcTransportError(IPC_PAYLOAD_TOO_LARGE, `request body exceeds the ${IPC_MAX_BODY_BYTES}-byte limit`),
        );
        resolve(undefined);
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onError = () => {
      // The client went away mid-body; there is no request left to answer.
      if (settled) return;
      settled = true;
      cleanup();
      resolve(undefined);
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

/** The full per-request pipeline: `Host` check, route lookup, body cap, content checks, handler dispatch. */
async function handleRequest(req: IncomingMessage, res: ServerResponse, deps: IpcServerDeps, boundPort: number): Promise<void> {
  // Swallow a late socket error (e.g. after we destroy it on a refusal) instead of crashing the process.
  req.on("error", () => {});

  const expectedHost = `${IPC_LOOPBACK_HOST}:${boundPort}`;
  if (req.headers.host !== expectedHost) {
    respondJsonAndClose(
      res,
      req,
      HTTP_FORBIDDEN,
      ipcTransportError(IPC_HOST_REJECTED, "Host header must name this daemon's own loopback address"),
    );
    return;
  }

  const method = req.method ?? "";
  const url = new URL(req.url ?? "/", `http://${IPC_LOOPBACK_HOST}`);
  const routeKey = routeKeyFor(method, url.pathname);
  const handler = routeKey === undefined ? undefined : deps.handlers[routeKey];
  if (routeKey === undefined || handler === undefined) {
    respondJsonAndClose(res, req, HTTP_NOT_FOUND, ipcTransportError(IPC_ROUTE_NOT_FOUND, `no route for ${method} ${url.pathname}`));
    return;
  }

  const bodyBytes = await collectBody(req, res);
  if (bodyBytes === undefined) {
    return; // collectBody already answered (body-cap refusal) or the client disconnected.
  }

  let body: unknown;
  if (method === "GET" || method === "DELETE") {
    if (bodyBytes.length > 0) {
      respondJson(res, HTTP_BAD_REQUEST, ipcTransportError(IPC_BAD_REQUEST, `${method} requests must not carry a body`));
      return;
    }
    body = undefined;
  } else {
    if (!isJsonContentType(req.headers["content-type"])) {
      respondJson(res, HTTP_UNSUPPORTED_MEDIA_TYPE, ipcTransportError(IPC_UNSUPPORTED_MEDIA_TYPE, "Content-Type must be application/json"));
      return;
    }
    if (bodyBytes.length === 0) {
      respondJson(res, HTTP_BAD_REQUEST, ipcTransportError(IPC_BAD_REQUEST, "request body must be valid JSON"));
      return;
    }
    try {
      body = JSON.parse(bodyBytes.toString("utf8"));
    } catch {
      respondJson(res, HTTP_BAD_REQUEST, ipcTransportError(IPC_BAD_REQUEST, "request body must be valid JSON"));
      return;
    }
  }

  try {
    const result = await handler({ route: routeKey, query: url.searchParams, headers: req.headers, body });
    respondJson(res, result.status, result.body); // a non-serializable result body lands in the catch below
  } catch (err) {
    deps.log?.(`ipc handler threw for ${routeKey}: ${err instanceof Error ? err.message : String(err)}`);
    respondJson(res, HTTP_INTERNAL_SERVER_ERROR, ipcTransportError(IPC_INTERNAL_ERROR, "internal error"));
  }
}

/**
 * Builds the daemon's IPC server. Binds `IPC_LOOPBACK_HOST` on `IPC_EPHEMERAL_PORT` (a random free
 * port, ADR-0029 rule 3) once {@link IpcServerHandle.listen} is called.
 */
export function createIpcServer(deps: IpcServerDeps): IpcServerHandle {
  let server: Server | undefined;
  let boundPort: number | undefined;
  let listenCalled = false;

  return {
    async listen(): Promise<{ port: number }> {
      if (listenCalled) {
        throw new Error("createIpcServer: listen() must be called at most once per server");
      }
      listenCalled = true;

      const httpServer = createServer((req, res) => {
        handleRequest(req, res, deps, boundPort!).catch(() => {
          // Last resort: nothing above may reject, but a rejection here must never crash the daemon.
          req.socket?.destroy();
        });
      });
      server = httpServer;

      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(IPC_EPHEMERAL_PORT, IPC_LOOPBACK_HOST, () => resolve());
      });

      const address = httpServer.address();
      if (address === null || typeof address === "string") {
        throw new Error("createIpcServer: expected an AddressInfo after listen()");
      }
      boundPort = address.port;
      return { port: boundPort };
    },

    async close(): Promise<void> {
      if (server === undefined) {
        return;
      }
      const httpServer = server;
      server = undefined; // a second close() resolves at once instead of meeting ERR_SERVER_NOT_RUNNING
      httpServer.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
