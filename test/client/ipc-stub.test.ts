import { test } from "node:test";
import assert from "node:assert/strict";

import { HandshakeError } from "../../src/client/handshake.js";
import { createIpcSession, IpcTransportError } from "../../src/client/ipc-stub.js";
import type { DaemonRunPayload } from "../../src/client/run-state.js";
import { IPC_LOOPBACK_HOST, type SessionResponse } from "../../src/shared/ipc-contract.js";

const IDENTITY = {
  projectId: "prj-example",
  groupId: -100,
  rosterHash: `sha256:${"d".repeat(64)}`,
  host: "claude-code",
};

const RUN_PAYLOAD: DaemonRunPayload = { port: 4123, pid: process.pid, secret: "unused-secret" };

const SESSION_RESPONSE: SessionResponse = {
  client_id: "client-1",
  bearer: "b".repeat(64),
  binding: {
    project_id: "prj-example",
    bot_id: 1,
    group_id: -100,
    agent_id: "@claude",
    roster_hash: IDENTITY.rosterHash,
  },
  conditions: [],
};

/** Builds a session with fake collaborators; every test overrides at least `fetchImpl`. */
function session(overrides: {
  ensureDaemonRunningImpl?: () => Promise<DaemonRunPayload>;
  performHandshakeImpl?: () => Promise<SessionResponse>;
  fetchImpl: typeof fetch;
}) {
  return createIpcSession({
    ...IDENTITY,
    ensureDaemonRunningImpl: overrides.ensureDaemonRunningImpl ?? (async () => RUN_PAYLOAD),
    performHandshakeImpl: overrides.performHandshakeImpl ?? (async () => SESSION_RESPONSE),
    fetchImpl: overrides.fetchImpl,
  });
}

test("callTool returns {ok:true, data} on a 200 response parsing as a tool success body", async () => {
  const s = session({ fetchImpl: (async () => new Response(JSON.stringify({ hello: "world" }), { status: 200 })) as typeof fetch });
  const result = await s.callTool("POST /tools/status", {});
  assert.deepEqual(result, { ok: true, data: { hello: "world" } });
});

test("callTool returns {ok:false, error} on a non-2xx response parsing as an ipcErrorSchema body", async () => {
  const errorBody = { code: "UNBOUND_PROJECT", message: "no active binding", retryable: false };
  const s = session({ fetchImpl: (async () => new Response(JSON.stringify(errorBody), { status: 404 })) as typeof fetch });
  const result = await s.callTool("POST /tools/send", { type: "BROADCAST", body: "hi" });
  assert.deepEqual(result, { ok: false, error: errorBody });
});

test("callTool throws IpcTransportError when fetch itself throws (network failure)", async () => {
  const s = session({
    fetchImpl: (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch,
  });
  await assert.rejects(() => s.callTool("POST /tools/status", {}), IpcTransportError);
});

test("callTool throws IpcTransportError when the response body parses as neither schema", async () => {
  const s = session({ fetchImpl: (async () => new Response(JSON.stringify({ nonsense: true }), { status: 500 })) as typeof fetch });
  await assert.rejects(() => s.callTool("POST /tools/status", {}), IpcTransportError);
});

test("callTool throws IpcTransportError when the response body is not valid JSON", async () => {
  const s = session({ fetchImpl: (async () => new Response("not json", { status: 200 })) as typeof fetch });
  await assert.rejects(() => s.callTool("POST /tools/status", {}), IpcTransportError);
});

test("callTool lets a HandshakeError from performHandshakeImpl propagate unchanged, not wrapped", async () => {
  const s = session({
    performHandshakeImpl: async () => {
      throw new HandshakeError("DAEMON_DOWN", "no daemon reachable");
    },
    fetchImpl: (async () => {
      throw new Error("must not be called");
    }) as typeof fetch,
  });
  await assert.rejects(
    () => s.callTool("POST /tools/status", {}),
    (err: unknown) => {
      assert.ok(err instanceof HandshakeError);
      assert.equal((err as HandshakeError).code, "DAEMON_DOWN");
      return true;
    },
  );
});

test("callTool wraps an ensureDaemonRunningImpl failure as IpcTransportError, making zero fetch calls", async () => {
  let fetchCalls = 0;
  const s = session({
    ensureDaemonRunningImpl: async () => {
      throw new Error("spawn timed out");
    },
    fetchImpl: (async () => {
      fetchCalls += 1;
      throw new Error("must not be called");
    }) as typeof fetch,
  });
  await assert.rejects(() => s.callTool("POST /tools/status", {}), IpcTransportError);
  assert.equal(fetchCalls, 0);
});

test("callTool POSTs to the daemon's loopback port with the stripped path, bearer header, and JSON body", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const s = session({
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch,
  });

  await s.callTool("POST /tools/send", { type: "BROADCAST", body: "hi" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `http://${IPC_LOOPBACK_HOST}:${RUN_PAYLOAD.port}/tools/send`);
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["content-type"], "application/json");
  assert.equal(headers["authorization"], `Bearer ${SESSION_RESPONSE.bearer}`);
  assert.equal(calls[0].init.body, JSON.stringify({ type: "BROADCAST", body: "hi" }));
});
