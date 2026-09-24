import { test } from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { HandshakeError } from "../../src/client/handshake.js";
import { IpcTransportError, type IpcSession, type IpcToolResult, type IpcToolRoute } from "../../src/client/ipc-stub.js";
import { createServer } from "../../src/client/server.js";
import { fetchInputSchema, sendInputBaseSchema, statusInputSchema, threadInputSchema } from "../../src/shared/tool-schemas.js";

const PROJECT_ID = "prj-example";

function fakeSession(callTool: (route: IpcToolRoute, input: unknown) => Promise<IpcToolResult>): IpcSession {
  return { callTool };
}

/** Connects `createServer({ipc, projectId: PROJECT_ID})` to a real MCP `Client` over an in-memory transport, runs `run`, then tears both down — mirrors v1's own `test/index.test.ts` pattern. */
async function withConnectedClient(ipc: IpcSession, run: (client: Client) => Promise<void>): Promise<void> {
  const server = createServer({ ipc, projectId: PROJECT_ID });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test-client", version: "0.0.0" });

  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  try {
    await run(mcpClient);
  } finally {
    await mcpClient.close();
    await server.close();
  }
}

test("createServer registers exactly the four conmuta tools, with input schemas matching shared/tool-schemas.ts", async () => {
  const ipc = fakeSession(async () => ({ ok: true, data: {} }));
  await withConnectedClient(ipc, async (client) => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ["conmuta_fetch", "conmuta_send", "conmuta_status", "conmuta_thread"],
    );

    const propsOf = (name: string): string[] => {
      const tool = tools.find((t) => t.name === name);
      assert.ok(tool, `${name} must be registered`);
      const schema = tool.inputSchema as { properties?: Record<string, unknown> };
      return Object.keys(schema.properties ?? {}).sort();
    };

    assert.deepEqual(propsOf("conmuta_send"), Object.keys(sendInputBaseSchema.shape).sort());
    assert.deepEqual(propsOf("conmuta_fetch"), Object.keys(fetchInputSchema.shape).sort());
    assert.deepEqual(propsOf("conmuta_status"), Object.keys(statusInputSchema.shape).sort());
    assert.deepEqual(propsOf("conmuta_thread"), Object.keys(threadInputSchema.shape).sort());
  });
});

test("a successful IpcSession.callTool result is returned as JSON-stringified content", async () => {
  const ipc = fakeSession(async () => ({ ok: true, data: { echoed: true } }));
  await withConnectedClient(ipc, async (client) => {
    const result = await client.callTool({ name: "conmuta_status", arguments: {} });
    assert.equal(result.isError, undefined);
    const text = (result.content as Array<{ text: string }>)[0].text;
    assert.deepEqual(JSON.parse(text), { echoed: true });
  });
});

test("a rejected IpcSession.callTool result surfaces as isError with the daemon's own error payload, unchanged", async () => {
  const errorPayload = { code: "UNBOUND_PROJECT", message: "no active binding", retryable: false };
  const ipc = fakeSession(async () => ({ ok: false, error: errorPayload }));
  await withConnectedClient(ipc, async (client) => {
    const result = await client.callTool({ name: "conmuta_status", arguments: {} });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    assert.deepEqual(JSON.parse(text), errorPayload);
  });
});

test("an IpcTransportError thrown by IpcSession.callTool surfaces as isError with client-local code IPC_ERROR", async () => {
  const ipc = fakeSession(async () => {
    throw new IpcTransportError("daemon not reachable");
  });
  await withConnectedClient(ipc, async (client) => {
    const result = await client.callTool({ name: "conmuta_status", arguments: {} });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    const payload = JSON.parse(text) as { code: string; retryable: boolean };
    assert.equal(payload.code, "IPC_ERROR");
    assert.equal(payload.retryable, true);
  });
});

test("a HandshakeError thrown by IpcSession.callTool surfaces as isError with that error's own code", async () => {
  const ipc = fakeSession(async () => {
    throw new HandshakeError("DAEMON_VERSION_MISMATCH", "build mismatch");
  });
  await withConnectedClient(ipc, async (client) => {
    const result = await client.callTool({ name: "conmuta_status", arguments: {} });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    const payload = JSON.parse(text) as { code: string; retryable: boolean };
    assert.equal(payload.code, "DAEMON_VERSION_MISMATCH");
    assert.equal(payload.retryable, false);
  });
});

// --- Judgment Day CRITICAL fix: every tool must call its OWN route, not another tool's ---
// (an independent verifier confirmed a mutant swapping which route any handler calls survived every
// test in this file before this addition, since every prior behavioral test targeted conmuta_status only)

test("each of the four tools calls its own distinct daemon route", async () => {
  const seenRoutes: IpcToolRoute[] = [];
  const ipc = fakeSession(async (route) => {
    seenRoutes.push(route);
    return { ok: true, data: {} };
  });
  await withConnectedClient(ipc, async (client) => {
    await client.callTool({ name: "conmuta_send", arguments: { type: "BROADCAST", body: "hi" } });
    await client.callTool({ name: "conmuta_fetch", arguments: {} });
    await client.callTool({ name: "conmuta_status", arguments: {} });
    await client.callTool({ name: "conmuta_thread", arguments: { thread_id: "a1b2c3d4e5f6" } });
  });
  assert.deepEqual(seenRoutes, ["POST /tools/send", "POST /tools/fetch", "POST /tools/status", "POST /tools/thread"]);
});

// --- Corroborated WARNING fix (independent verifier + Judge B): the generic-error fallback path ---

test("an unrecognized thrown error type surfaces safely as isError, not a crash", async () => {
  const ipc = fakeSession(async () => {
    throw new Error("something neither IpcTransportError nor HandshakeError");
  });
  await withConnectedClient(ipc, async (client) => {
    const result = await client.callTool({ name: "conmuta_status", arguments: {} });
    assert.equal(result.isError, true);
  });
});
