/**
 * The web panel's own `node:http` listener (design's "Local process integration (panel listener)"
 * Threat Matrix row, F3 PR-04). A second, independent listener from `daemon/ipc/server.ts` — its own
 * loopback bind, its own ephemeral port, its own token domain (`PanelTokenStore`, PR-03) — reusing only
 * the transport-level guard both listeners share (`checkTransportGuards`, PR-01, called here with
 * `requireOrigin: true`).
 *
 * **GET-only, and every response closes the connection.** The panel exposes exactly two read-only
 * screens (`daemon/panel/routes.ts`, PR-04c) and no mutation route at all — a `POST` or any other
 * method never matches a route key (`"<METHOD> <pathname>"`, mirroring `ipc/server.ts`'s own
 * `routeKeyFor`) and falls through to the same 404 an unknown path gets, satisfying the spec's "404 or
 * 405" scenario without a second code path. Every response (success or refusal) sets `Connection:
 * close`: this is human, browser-driven traffic with no latency-sensitive keep-alive use case, so there
 * is no reason to read and discard a request body that a GET is not supposed to carry in the first
 * place — the connection is simply torn down once the response has flushed.
 *
 * **Token check runs after the transport guards, before route dispatch.** A request that fails
 * `checkTransportGuards` is refused before anything about the token is inspected, mirroring
 * `ipc/server.ts`'s own ordering (transport-level refusals first). The token itself is read from
 * `Authorization: Bearer <token>` (for a programmatic caller) or the `?token=` query parameter (for a
 * plain top-level browser navigation, which cannot set a custom header — spec's own stated reason).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { IPC_EPHEMERAL_PORT } from "../../shared/constants.js";
import { IPC_LOOPBACK_HOST } from "../../shared/ipc-contract.js";
import { checkTransportGuards } from "../transport/http-guards.js";
import type { PanelTokenStore } from "./token-store.js";

const PANEL_ROUTE_KEYS = ["GET /", "GET /overview"] as const;
export type PanelRouteKey = (typeof PANEL_ROUTE_KEYS)[number];
const PANEL_ROUTE_KEY_SET: ReadonlySet<string> = new Set(PANEL_ROUTE_KEYS);

export interface PanelRequest {
  readonly route: PanelRouteKey;
  readonly query: URLSearchParams;
}

/** What a route handler returns; written to the wire as-is with the given status and content type. */
export interface PanelResponse {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
}

export type PanelHandler = (request: PanelRequest) => PanelResponse | Promise<PanelResponse>;

export interface PanelServerDeps {
  /** One handler per screen this panel actually serves; a route with no entry answers 404 exactly like an unknown route. */
  readonly handlers: Partial<Record<PanelRouteKey, PanelHandler>>;
  readonly tokenStore: PanelTokenStore;
}

export interface PanelServerHandle {
  /** Binds `IPC_LOOPBACK_HOST` on an OS-assigned ephemeral port. Refuses a second call on the same handle. */
  listen(): Promise<{ port: number }>;
  /** Resolves once every connection has been closed. Safe to call before `listen()` or more than once. */
  close(): Promise<void>;
}

const AUTHORIZATION_BEARER_PREFIX = "Bearer ";

/** `Authorization: Bearer <token>`, else the `?token=` query parameter, else `undefined`. */
function extractToken(req: IncomingMessage, query: URLSearchParams): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith(AUTHORIZATION_BEARER_PREFIX)) {
    return authHeader.slice(AUTHORIZATION_BEARER_PREFIX.length);
  }
  return query.get("token") ?? undefined;
}

function writeAndClose(res: ServerResponse, req: IncomingMessage, status: number, contentType: string, body: string): void {
  res.writeHead(status, { "Content-Type": contentType, Connection: "close" });
  res.end(body, () => {
    req.socket?.destroy();
  });
}

function routeKeyFor(method: string, pathname: string): PanelRouteKey | undefined {
  const candidate = `${method} ${pathname}`;
  return PANEL_ROUTE_KEY_SET.has(candidate) ? (candidate as PanelRouteKey) : undefined;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, deps: PanelServerDeps, boundPort: number): Promise<void> {
  req.on("error", () => {});

  const expectedHost = `${IPC_LOOPBACK_HOST}:${boundPort}`;
  const guardResult = checkTransportGuards(req, { expectedHost, requireOrigin: true });
  if (!guardResult.ok) {
    writeAndClose(res, req, guardResult.rejection.status, "application/json; charset=utf-8", JSON.stringify(guardResult.rejection.body));
    return;
  }

  const url = new URL(req.url ?? "/", `http://${IPC_LOOPBACK_HOST}`);

  const token = extractToken(req, url.searchParams);
  if (token === undefined || !deps.tokenStore.validate(token)) {
    writeAndClose(res, req, 401, "application/json; charset=utf-8", JSON.stringify({ error: "missing or invalid panel token" }));
    return;
  }

  const method = req.method ?? "";
  const routeKey = routeKeyFor(method, url.pathname);
  const handler = routeKey === undefined ? undefined : deps.handlers[routeKey];
  if (routeKey === undefined || handler === undefined) {
    writeAndClose(res, req, 404, "application/json; charset=utf-8", JSON.stringify({ error: `no route for ${method} ${url.pathname}` }));
    return;
  }

  try {
    const result = await handler({ route: routeKey, query: url.searchParams });
    writeAndClose(res, req, result.status, result.contentType, result.body);
  } catch {
    writeAndClose(res, req, 500, "application/json; charset=utf-8", JSON.stringify({ error: "internal error" }));
  }
}

/**
 * Builds the panel's listener. Binds `IPC_LOOPBACK_HOST` on an OS-assigned ephemeral port once
 * {@link PanelServerHandle.listen} is called — the same primitive `ipc/server.ts` uses, so both
 * listeners are always loopback-only regardless of which one a future change touches.
 */
export function createPanelServer(deps: PanelServerDeps): PanelServerHandle {
  let server: Server | undefined;
  let boundPort: number | undefined;
  let listenCalled = false;

  return {
    async listen(): Promise<{ port: number }> {
      if (listenCalled) {
        throw new Error("createPanelServer: listen() must be called at most once per server");
      }
      listenCalled = true;

      const httpServer = createServer((req, res) => {
        handleRequest(req, res, deps, boundPort!).catch(() => {
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
        throw new Error("createPanelServer: expected an AddressInfo after listen()");
      }
      boundPort = address.port;
      return { port: boundPort };
    },

    async close(): Promise<void> {
      if (server === undefined) {
        return;
      }
      const httpServer = server;
      server = undefined;
      httpServer.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
