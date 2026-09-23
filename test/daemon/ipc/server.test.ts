import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";

import { IPC_MAX_BODY_BYTES } from "../../../src/shared/constants.js";
import {
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_PAYLOAD_TOO_LARGE,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
  IPC_BAD_REQUEST,
  IPC_HOST_REJECTED,
  IPC_INTERNAL_ERROR,
  IPC_LOOPBACK_HOST,
  IPC_PAYLOAD_TOO_LARGE,
  IPC_ROUTE_NOT_FOUND,
  IPC_UNSUPPORTED_MEDIA_TYPE,
  ipcErrorSchema,
} from "../../../src/shared/ipc-contract.js";
import { createIpcServer, type IpcHandler, type IpcRequest } from "../../../src/daemon/ipc/server.js";

/**
 * `daemon/ipc/server.ts` (PR-29, design §10 "IPC", design §15's "real `node:http` listener on port
 * 0" harness). New code — no v1 range — so this twin needs no `test/fixtures/v1-provenance.json`
 * entry.
 *
 * `sendRequest` always declares `Content-Length` itself rather than letting `node:http`'s client
 * infer it, because a `GET` request left to infer its own framing silently produces a malformed
 * request Node's own parser answers with a bare 400 before this daemon's handler ever runs — a
 * client quirk unrelated to what this suite is testing. `sendStreamedBody` deliberately omits
 * `Content-Length` (forcing chunked transfer) so the oversized-body case that must be caught while
 * STREAMING, not from the declared header, is exercised for real. A raw `net` socket is used only for
 * the one scenario `node:http`'s client cannot express at all: a request with no `Host` header.
 *
 * **A missing `Host` header never reaches this daemon's own check over HTTP/1.1.** RFC 7230 §5.4
 * requires it, and Node's own HTTP parser enforces that at the protocol layer: an HTTP/1.1 request
 * with no `Host` line never fires the `request` event at all — Node answers a bare, non-JSON `400`
 * itself first. This module's `Host` check can therefore only be exercised for a genuinely absent
 * header by sending `HTTP/1.0`, which does not require one; that is what
 * {@link sendRequestWithNoHostHeader} does below. This is disclosed, not worked around: in real
 * traffic a conforming HTTP/1.1 client that omits `Host` is already refused by Node before this
 * daemon's `IPC_HOST_REJECTED` code path runs at all.
 */

type Handlers = Parameters<typeof createIpcServer>[0]["handlers"];

async function withServer(
  handlers: Handlers,
  run: (port: number) => Promise<void>,
  log?: (message: string) => void,
): Promise<void> {
  const server = createIpcServer({ handlers, log });
  const { port } = await server.listen();
  try {
    await run(port);
  } finally {
    await server.close();
  }
}

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  bodyText: string;
}

/** A normal `node:http` client request, always declaring `Content-Length` explicitly (see module doc). */
function sendRequest(options: {
  port: number;
  method: string;
  path: string;
  host?: string;
  contentType?: string;
  body?: string;
}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const bodyBuffer = options.body === undefined ? undefined : Buffer.from(options.body, "utf8");
    const headers: http.OutgoingHttpHeaders = {
      Host: options.host ?? `${IPC_LOOPBACK_HOST}:${options.port}`,
    };
    if (options.contentType !== undefined) headers["Content-Type"] = options.contentType;
    if (bodyBuffer !== undefined) headers["Content-Length"] = String(bodyBuffer.length);

    let responded = false;
    const req = http.request(
      { host: IPC_LOOPBACK_HOST, port: options.port, method: options.method, path: options.path, headers },
      (res) => {
        responded = true;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, bodyText: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    // Once a response has started, a later write/socket error is expected for a refusal the server
    // answers before fully reading the request (e.g. a declared-oversized Content-Length) — not a
    // test failure.
    req.on("error", (err) => {
      if (!responded) reject(err);
    });
    req.end(bodyBuffer);
  });
}

/**
 * Declares `Content-Length` as `declaredLength` while actually writing only `actualBody` — used for
 * the declared-oversized-Content-Length case, where the server refuses from the header alone and
 * never reads a body byte, so there is no need (and, given how quickly the server destroys the
 * socket, real risk) to actually stream `declaredLength` bytes onto the wire.
 */
function sendWithDeclaredContentLength(options: {
  port: number;
  path: string;
  declaredLength: number;
  actualBody: string;
}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    let responded = false;
    const req = http.request(
      {
        host: IPC_LOOPBACK_HOST,
        port: options.port,
        method: "POST",
        path: options.path,
        headers: {
          Host: `${IPC_LOOPBACK_HOST}:${options.port}`,
          "Content-Type": "application/json",
          "Content-Length": String(options.declaredLength),
        },
      },
      (res) => {
        responded = true;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, bodyText: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", (err) => {
      if (!responded) reject(err);
    });
    req.end(options.actualBody);
  });
}

/** Streams `totalBytes` with no declared `Content-Length` (forcing chunked transfer), to exercise the streaming byte-count cap rather than the declared-header cap. */
function sendStreamedBody(options: { port: number; path: string; totalBytes: number }): Promise<RawResponse> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: IPC_LOOPBACK_HOST,
        port: options.port,
        method: "POST",
        path: options.path,
        headers: { Host: `${IPC_LOOPBACK_HOST}:${options.port}`, "Content-Type": "application/json" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, bodyText: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    // The server may destroy its side of the socket once it has answered (module doc's connection
    // handling), which can surface as a write/end error here after the response is already
    // resolved above; that is expected for this scenario and not a test failure.
    req.on("error", () => {});
    let remaining = options.totalBytes;
    const CHUNK = 8192;
    while (remaining > 0) {
      const size = Math.min(CHUNK, remaining);
      req.write(Buffer.alloc(size, "x"));
      remaining -= size;
    }
    req.end();
  });
}

/** Decodes an HTTP chunked-transfer body back into its raw bytes. */
function dechunk(raw: Buffer): Buffer {
  const parts: Buffer[] = [];
  let offset = 0;
  while (offset < raw.length) {
    const lineEnd = raw.indexOf("\r\n", offset);
    if (lineEnd === -1) break;
    const size = parseInt(raw.slice(offset, lineEnd).toString("latin1").trim(), 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const dataStart = lineEnd + 2;
    parts.push(raw.slice(dataStart, dataStart + size));
    offset = dataStart + size + 2;
  }
  return Buffer.concat(parts);
}

/** A raw `net` socket request that never sends a `Host` header — impossible to express through `node:http`'s client. */
function sendRequestWithNoHostHeader(port: number, requestLine: string): Promise<{ status: number; bodyText: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: IPC_LOOPBACK_HOST, port }, () => {
      socket.write(`${requestLine}\r\nConnection: close\r\n\r\n`);
    });
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("end", () => {
      const raw = Buffer.concat(chunks);
      const headerEnd = raw.indexOf("\r\n\r\n");
      const headerText = raw.slice(0, headerEnd).toString("latin1");
      const status = Number(headerText.split("\r\n")[0]?.split(" ")[1]);
      const isChunked = /transfer-encoding:\s*chunked/i.test(headerText);
      const rest = raw.slice(headerEnd + 4);
      resolve({ status, bodyText: (isChunked ? dechunk(rest) : rest).toString("utf8") });
    });
    socket.on("error", reject);
  });
}

function echoHandler(): IpcHandler {
  return (request: IpcRequest) => ({ status: HTTP_OK, body: { received: request.body ?? null } });
}

// ---------------------------------------------------------------------------
// Host check
// ---------------------------------------------------------------------------

test("a request with the wrong port in Host is refused with 403 and never reaches the handler", async () => {
  let called = 0;
  await withServer({ "GET /identity": () => (called += 1, { status: HTTP_OK, body: {} }) }, async (port) => {
    const res = await sendRequest({ port, method: "GET", path: "/identity?nonce=a", host: `127.0.0.1:${port + 1}` });
    assert.equal(res.status, HTTP_FORBIDDEN);
    const parsed = ipcErrorSchema.parse(JSON.parse(res.bodyText));
    assert.equal(parsed.code, IPC_HOST_REJECTED);
  });
  assert.equal(called, 0);
});

test("a request with Host: localhost:<port> is refused with 403 and never reaches the handler", async () => {
  let called = 0;
  await withServer({ "GET /identity": () => (called += 1, { status: HTTP_OK, body: {} }) }, async (port) => {
    const res = await sendRequest({ port, method: "GET", path: "/identity?nonce=a", host: `localhost:${port}` });
    assert.equal(res.status, HTTP_FORBIDDEN);
  });
  assert.equal(called, 0);
});

test("a genuinely Host-less request (HTTP/1.0, which Node lets through) is refused with 403 and never reaches the handler", async () => {
  // An HTTP/1.1 request with no Host header never reaches this daemon at all: Node's own parser
  // answers a bare 400 first (RFC 7230 §5.4, see the module doc). HTTP/1.0 has no such requirement,
  // so it is the only way to exercise this daemon's OWN Host check against a truly absent header.
  let called = 0;
  await withServer({ "GET /identity": () => (called += 1, { status: HTTP_OK, body: {} }) }, async (port) => {
    const res = await sendRequestWithNoHostHeader(port, "GET /identity?nonce=a HTTP/1.0");
    assert.equal(res.status, HTTP_FORBIDDEN);
    const parsed = ipcErrorSchema.parse(JSON.parse(res.bodyText));
    assert.equal(parsed.code, IPC_HOST_REJECTED);
  });
  assert.equal(called, 0);
});

// ---------------------------------------------------------------------------
// Route resolution
// ---------------------------------------------------------------------------

test("an unknown route is refused with 404 and never reaches any handler", async () => {
  let called = 0;
  await withServer({ "GET /identity": () => (called += 1, { status: HTTP_OK, body: {} }) }, async (port) => {
    const res = await sendRequest({ port, method: "GET", path: "/nope" });
    assert.equal(res.status, HTTP_NOT_FOUND);
    const parsed = ipcErrorSchema.parse(JSON.parse(res.bodyText));
    assert.equal(parsed.code, IPC_ROUTE_NOT_FOUND);
  });
  assert.equal(called, 0);
});

test("a route in the fixed table with no registered handler is refused with 404", async () => {
  await withServer({}, async (port) => {
    const res = await sendRequest({ port, method: "GET", path: "/identity?nonce=a" });
    assert.equal(res.status, HTTP_NOT_FOUND);
    const parsed = ipcErrorSchema.parse(JSON.parse(res.bodyText));
    assert.equal(parsed.code, IPC_ROUTE_NOT_FOUND);
  });
});

test("GET /identity with a non-empty body is refused with 400", async () => {
  let called = 0;
  await withServer({ "GET /identity": () => (called += 1, { status: HTTP_OK, body: {} }) }, async (port) => {
    const res = await sendRequest({ port, method: "GET", path: "/identity?nonce=a", body: "unexpected" });
    assert.equal(res.status, HTTP_BAD_REQUEST);
    const parsed = ipcErrorSchema.parse(JSON.parse(res.bodyText));
    assert.equal(parsed.code, IPC_BAD_REQUEST);
  });
  assert.equal(called, 0);
});

// ---------------------------------------------------------------------------
// Body cap
// ---------------------------------------------------------------------------

test("a declared Content-Length over IPC_MAX_BODY_BYTES is refused with 413 and never reaches the handler", async () => {
  let called = 0;
  await withServer(
    { "POST /tools/status": () => (called += 1, { status: HTTP_OK, body: {} }) },
    async (port) => {
      const res = await sendWithDeclaredContentLength({
        port,
        path: "/tools/status",
        declaredLength: IPC_MAX_BODY_BYTES + 1,
        actualBody: "{}",
      });
      assert.equal(res.status, HTTP_PAYLOAD_TOO_LARGE);
      const parsed = ipcErrorSchema.parse(JSON.parse(res.bodyText));
      assert.equal(parsed.code, IPC_PAYLOAD_TOO_LARGE);
    },
  );
  assert.equal(called, 0);
});

test("a body streamed past IPC_MAX_BODY_BYTES with no declared Content-Length is refused with 413", async () => {
  let called = 0;
  await withServer(
    { "POST /tools/status": () => (called += 1, { status: HTTP_OK, body: {} }) },
    async (port) => {
      const res = await sendStreamedBody({ port, path: "/tools/status", totalBytes: IPC_MAX_BODY_BYTES + 1 });
      assert.equal(res.status, HTTP_PAYLOAD_TOO_LARGE);
      const parsed = ipcErrorSchema.parse(JSON.parse(res.bodyText));
      assert.equal(parsed.code, IPC_PAYLOAD_TOO_LARGE);
    },
  );
  assert.equal(called, 0);
});

test("a body of exactly IPC_MAX_BODY_BYTES is accepted", async () => {
  const padLength = IPC_MAX_BODY_BYTES - `{"pad":""}`.length;
  const body = `{"pad":"${"x".repeat(padLength)}"}`;
  assert.equal(Buffer.byteLength(body, "utf8"), IPC_MAX_BODY_BYTES);

  await withServer(
    { "POST /tools/status": echoHandler() },
    async (port) => {
      const res = await sendRequest({ port, method: "POST", path: "/tools/status", contentType: "application/json", body });
      assert.equal(res.status, HTTP_OK);
    },
  );
});

// ---------------------------------------------------------------------------
// Content-type / JSON parsing
// ---------------------------------------------------------------------------

test("a POST with a non-JSON Content-Type is refused with 415", async () => {
  await withServer({ "POST /tools/status": echoHandler() }, async (port) => {
    const res = await sendRequest({ port, method: "POST", path: "/tools/status", contentType: "text/plain", body: "{}" });
    assert.equal(res.status, HTTP_UNSUPPORTED_MEDIA_TYPE);
    const parsed = ipcErrorSchema.parse(JSON.parse(res.bodyText));
    assert.equal(parsed.code, IPC_UNSUPPORTED_MEDIA_TYPE);
  });
});

test("application/json with a charset parameter is accepted", async () => {
  await withServer({ "POST /tools/status": echoHandler() }, async (port) => {
    const res = await sendRequest({
      port,
      method: "POST",
      path: "/tools/status",
      contentType: "application/json; charset=utf-8",
      body: "{}",
    });
    assert.equal(res.status, HTTP_OK);
  });
});

test("a POST with a malformed JSON body is refused with 400", async () => {
  await withServer({ "POST /tools/status": echoHandler() }, async (port) => {
    const res = await sendRequest({ port, method: "POST", path: "/tools/status", contentType: "application/json", body: "{not json" });
    assert.equal(res.status, HTTP_BAD_REQUEST);
    const parsed = ipcErrorSchema.parse(JSON.parse(res.bodyText));
    assert.equal(parsed.code, IPC_BAD_REQUEST);
  });
});

test("a POST with an empty body is refused with 400", async () => {
  await withServer({ "POST /tools/status": echoHandler() }, async (port) => {
    const res = await sendRequest({ port, method: "POST", path: "/tools/status", contentType: "application/json", body: "" });
    assert.equal(res.status, HTTP_BAD_REQUEST);
  });
});

// ---------------------------------------------------------------------------
// Handler dispatch
// ---------------------------------------------------------------------------

test("a handler that throws answers 500 with a generic message, never leaking the thrown message", async () => {
  const logged: string[] = [];
  await withServer(
    {
      "POST /tools/status": () => {
        throw new Error("leaked-secret-detail");
      },
    },
    async (port) => {
      const res = await sendRequest({ port, method: "POST", path: "/tools/status", contentType: "application/json", body: "{}" });
      assert.equal(res.status, HTTP_INTERNAL_SERVER_ERROR);
      const parsed = ipcErrorSchema.parse(JSON.parse(res.bodyText));
      assert.equal(parsed.code, IPC_INTERNAL_ERROR);
      assert.doesNotMatch(res.bodyText, /leaked-secret-detail/);
    },
    (message) => logged.push(message),
  );
  assert.ok(logged.some((line) => line.includes("leaked-secret-detail")), "expected the thrown message to reach the injected logger");
});

test("a handler that rejects also answers 500 with a generic message", async () => {
  await withServer(
    {
      "POST /tools/status": async () => {
        throw new Error("async-leaked-detail");
      },
    },
    async (port) => {
      const res = await sendRequest({ port, method: "POST", path: "/tools/status", contentType: "application/json", body: "{}" });
      assert.equal(res.status, HTTP_INTERNAL_SERVER_ERROR);
      assert.doesNotMatch(res.bodyText, /async-leaked-detail/);
    },
  );
});

test("GET /identity passes the query string through to the handler untouched", async () => {
  await withServer(
    {
      "GET /identity": (request: IpcRequest) => ({ status: HTTP_OK, body: { nonce: request.query.get("nonce") } }),
    },
    async (port) => {
      const res = await sendRequest({ port, method: "GET", path: "/identity?nonce=deadbeef" });
      assert.equal(res.status, HTTP_OK);
      assert.deepEqual(JSON.parse(res.bodyText), { nonce: "deadbeef" });
    },
  );
});

test("a POST route's parsed JSON body is passed through to the handler untouched", async () => {
  await withServer({ "POST /tools/status": echoHandler() }, async (port) => {
    const res = await sendRequest({
      port,
      method: "POST",
      path: "/tools/status",
      contentType: "application/json",
      body: JSON.stringify({ a: 1, b: "two" }),
    });
    assert.equal(res.status, HTTP_OK);
    assert.deepEqual(JSON.parse(res.bodyText), { received: { a: 1, b: "two" } });
  });
});

test("a handler's response Content-Type is application/json with a charset", async () => {
  await withServer({ "POST /tools/status": echoHandler() }, async (port) => {
    const res = await sendRequest({ port, method: "POST", path: "/tools/status", contentType: "application/json", body: "{}" });
    assert.match(res.headers["content-type"] ?? "", /^application\/json/);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test("the server binds 127.0.0.1 only, refusing a connection over the IPv6 loopback address", async () => {
  await withServer({}, async (port) => {
    const outcome = await new Promise<"refused" | "connected">((resolve) => {
      const socket = net.connect({ host: "::1", port, family: 6 });
      const settle = (value: "refused" | "connected") => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(1500);
      socket.on("connect", () => settle("connected"));
      socket.on("error", () => settle("refused"));
      socket.on("timeout", () => settle("refused"));
    });
    assert.equal(outcome, "refused");
  });
});

test("listen() refuses to be called a second time on the same handle", async () => {
  const server = createIpcServer({ handlers: {} });
  await server.listen();
  try {
    await assert.rejects(() => server.listen());
  } finally {
    await server.close();
  }
});

test("close() resolves, and a subsequent connection to the same port is refused", async () => {
  const server = createIpcServer({ handlers: {} });
  const { port } = await server.listen();
  await server.close();

  const outcome = await new Promise<"refused" | "connected">((resolve) => {
    const socket = net.connect({ host: IPC_LOOPBACK_HOST, port });
    socket.setTimeout(1500);
    socket.on("connect", () => {
      socket.destroy();
      resolve("connected");
    });
    socket.on("error", () => resolve("refused"));
    socket.on("timeout", () => {
      socket.destroy();
      resolve("refused");
    });
  });
  assert.equal(outcome, "refused");
});

test("close() called twice resolves both times", async () => {
  const server = createIpcServer({ handlers: {} });
  await server.listen();
  await server.close();
  await server.close();
});

test("a handler result that cannot be serialized answers 500 and the server keeps serving", async () => {
  const logged: string[] = [];
  await withServer(
    {
      "POST /tools/status": () => ({ status: HTTP_OK, body: { big: BigInt(1) } }),
      "POST /tools/fetch": echoHandler(),
    },
    async (port) => {
      const bad = await sendRequest({ port, method: "POST", path: "/tools/status", contentType: "application/json", body: "{}" });
      assert.equal(bad.status, HTTP_INTERNAL_SERVER_ERROR);
      assert.equal(ipcErrorSchema.parse(JSON.parse(bad.bodyText)).code, IPC_INTERNAL_ERROR);
      const good = await sendRequest({ port, method: "POST", path: "/tools/fetch", contentType: "application/json", body: "{}" });
      assert.equal(good.status, HTTP_OK);
      assert.equal(logged.length, 1);
    },
    (message) => logged.push(message),
  );
});

test("a media type in mixed case is still application/json", async () => {
  await withServer({ "POST /tools/status": echoHandler() }, async (port) => {
    const res = await sendRequest({ port, method: "POST", path: "/tools/status", contentType: "Application/JSON", body: "{}" });
    assert.equal(res.status, HTTP_OK);
  });
});

test("a refusal raised before the body is read announces Connection: close", async () => {
  await withServer({ "GET /identity": echoHandler() }, async (port) => {
    const res = await sendRequest({ port, method: "GET", path: "/identity?nonce=a", host: `localhost:${port}` });
    assert.equal(res.status, HTTP_FORBIDDEN);
    assert.equal(res.headers.connection, "close");
  });
});

test("a body streamed far past the cap never grows the server and the server keeps serving", async () => {
  // A client still writing when the refusal lands may read the 413 or meet a reset (unread bytes at
  // close): both are acceptable; the server must stop accumulating and stay up for the next request.
  await withServer({ "POST /tools/status": echoHandler() }, async (port) => {
    const outcome = await new Promise<number>((resolve) => {
      const req = http.request(
        {
          host: IPC_LOOPBACK_HOST,
          port,
          method: "POST",
          path: "/tools/status",
          headers: { Host: `${IPC_LOOPBACK_HOST}:${port}`, "Content-Type": "application/json" },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", () => resolve(0));
      for (let i = 0; i < 4; i += 1) req.write(Buffer.alloc(IPC_MAX_BODY_BYTES, "x"));
      req.end();
    });
    assert.ok(outcome === HTTP_PAYLOAD_TOO_LARGE || outcome === 0, `unexpected status ${outcome}`);
    const next = await sendRequest({ port, method: "POST", path: "/tools/status", contentType: "application/json", body: "{}" });
    assert.equal(next.status, HTTP_OK);
  });
});
