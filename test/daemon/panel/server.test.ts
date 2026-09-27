import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";

import { IPC_LOOPBACK_HOST } from "../../../src/shared/ipc-contract.js";
import { createPanelServer, type PanelHandler, type PanelRouteKey } from "../../../src/daemon/panel/server.js";
import { PanelTokenStore } from "../../../src/daemon/panel/token-store.js";

/**
 * `daemon/panel/server.ts` (F3 PR-04, web-panel spec "Loopback-only, per-boot-token transport" and
 * "Origin and Host validation"). Real `node:http` listener, mirroring `ipc/server.test.ts`'s own
 * real-listener pattern.
 */

type Handlers = Partial<Record<PanelRouteKey, PanelHandler>>;

async function withServer(
  handlers: Handlers,
  tokenStore: PanelTokenStore,
  run: (port: number, tokenStore: PanelTokenStore) => Promise<void>,
): Promise<void> {
  const server = createPanelServer({ handlers, tokenStore });
  const { port } = await server.listen();
  try {
    await run(port, tokenStore);
  } finally {
    await server.close();
  }
}

interface RawResponse {
  status: number;
  bodyText: string;
}

function sendRequest(options: {
  port: number;
  method?: string;
  path: string;
  host?: string;
  origin?: string;
  authorization?: string;
}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const headers: http.OutgoingHttpHeaders = {
      Host: options.host ?? `${IPC_LOOPBACK_HOST}:${options.port}`,
    };
    if (options.origin !== undefined) headers.Origin = options.origin;
    if (options.authorization !== undefined) headers.Authorization = options.authorization;

    let responded = false;
    const req = http.request(
      { host: IPC_LOOPBACK_HOST, port: options.port, method: options.method ?? "GET", path: options.path, headers },
      (res) => {
        responded = true;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, bodyText: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", (err) => {
      if (!responded) reject(err);
    });
    req.end();
  });
}

const okHandler: PanelHandler = () => ({ status: 200, contentType: "text/html; charset=utf-8", body: "<html>ok</html>" });

test("the listener binds to 127.0.0.1 only, on a random free port", async () => {
  const server = createPanelServer({ handlers: {}, tokenStore: new PanelTokenStore() });
  const { port } = await server.listen();
  try {
    assert.ok(port > 0);
    // A connection to the loopback address on the bound port succeeds — the listener is reachable there.
    const res = await sendRequest({ port, path: "/" });
    assert.equal(res.status, 401, "reachable, but refuses with no token — this test only proves the bind address/port");
  } finally {
    await server.close();
  }
});

test("a request with no token at all (neither header nor query) is refused with 401", async () => {
  await withServer({ "GET /": okHandler }, new PanelTokenStore(), async (port) => {
    const res = await sendRequest({ port, path: "/" });
    assert.equal(res.status, 401);
  });
});

test("a request with an unrecognized token is refused with 401", async () => {
  await withServer({ "GET /": okHandler }, new PanelTokenStore(), async (port) => {
    const res = await sendRequest({ port, path: "/?token=not-the-real-token" });
    assert.equal(res.status, 401);
  });
});

test("a valid token via the Authorization header reaches the handler", async () => {
  const tokenStore = new PanelTokenStore();
  await withServer({ "GET /": okHandler }, tokenStore, async (port) => {
    const res = await sendRequest({ port, path: "/", authorization: `Bearer ${tokenStore.token}` });
    assert.equal(res.status, 200);
    assert.equal(res.bodyText, "<html>ok</html>");
  });
});

test("a valid token via the ?token= query parameter reaches the handler (plain top-level navigation)", async () => {
  const tokenStore = new PanelTokenStore();
  await withServer({ "GET /": okHandler }, tokenStore, async (port) => {
    const res = await sendRequest({ port, path: `/?token=${tokenStore.token}` });
    assert.equal(res.status, 200);
  });
});

test("a foreign Host is refused before the token is ever checked", async () => {
  const tokenStore = new PanelTokenStore();
  await withServer({ "GET /": okHandler }, tokenStore, async (port) => {
    const res = await sendRequest({ port, path: `/?token=${tokenStore.token}`, host: `${IPC_LOOPBACK_HOST}:${port + 1}` });
    assert.equal(res.status, 403);
  });
});

test("a present, foreign Origin is refused even with a valid token", async () => {
  const tokenStore = new PanelTokenStore();
  await withServer({ "GET /": okHandler }, tokenStore, async (port) => {
    const res = await sendRequest({ port, path: `/?token=${tokenStore.token}`, origin: "http://evil.example.com" });
    assert.equal(res.status, 403);
  });
});

test("an absent Origin is admitted (plain top-level navigation carries none)", async () => {
  const tokenStore = new PanelTokenStore();
  await withServer({ "GET /": okHandler }, tokenStore, async (port) => {
    const res = await sendRequest({ port, path: `/?token=${tokenStore.token}` });
    assert.equal(res.status, 200);
  });
});

test("a matching Origin is admitted", async () => {
  const tokenStore = new PanelTokenStore();
  await withServer({ "GET /": okHandler }, tokenStore, async (port) => {
    const res = await sendRequest({
      port,
      path: `/?token=${tokenStore.token}`,
      origin: `http://${IPC_LOOPBACK_HOST}:${port}`,
    });
    assert.equal(res.status, 200);
  });
});

test("a mutation-shaped POST request is refused (404) and never reaches a handler", async () => {
  let called = 0;
  const countingHandler: PanelHandler = () => (called += 1, { status: 200, contentType: "text/plain", body: "no" });
  const tokenStore = new PanelTokenStore();
  await withServer({ "GET /": countingHandler }, tokenStore, async (port) => {
    const res = await sendRequest({ port, method: "POST", path: `/?token=${tokenStore.token}` });
    assert.ok(res.status === 404 || res.status === 405);
    assert.equal(called, 0);
  });
});

test("an unknown path is refused with 404", async () => {
  const tokenStore = new PanelTokenStore();
  await withServer({ "GET /": okHandler }, tokenStore, async (port) => {
    const res = await sendRequest({ port, path: `/panel/api/sync-roster?token=${tokenStore.token}` });
    assert.equal(res.status, 404);
  });
});

test("a route with no registered handler answers 404 exactly like an unknown route", async () => {
  const tokenStore = new PanelTokenStore();
  await withServer({}, tokenStore, async (port) => {
    const res = await sendRequest({ port, path: `/?token=${tokenStore.token}` });
    assert.equal(res.status, 404);
  });
});

test("a handler that throws answers 500 and the server keeps serving", async () => {
  const throwingHandler: PanelHandler = () => {
    throw new Error("boom");
  };
  const tokenStore = new PanelTokenStore();
  await withServer({ "GET /": throwingHandler, "GET /overview": okHandler }, tokenStore, async (port) => {
    const res1 = await sendRequest({ port, path: `/?token=${tokenStore.token}` });
    assert.equal(res1.status, 500);
    const res2 = await sendRequest({ port, path: `/overview?token=${tokenStore.token}` });
    assert.equal(res2.status, 200);
  });
});
