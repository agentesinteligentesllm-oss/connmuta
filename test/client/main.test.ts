import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { runMcpClient } from "../../src/client/main.js";
import type { IpcSession } from "../../src/client/ipc-stub.js";
import { createServer, type CreateServerDeps } from "../../src/client/server.js";
import { computeRosterHash } from "../../src/shared/roster-hash.js";
import {
  EXIT_NODE_FLOOR,
  EXIT_PROJECT_MISMATCH,
  EXIT_UNBOUND_PROJECT,
  EXIT_USAGE,
  NODE_FLOOR,
} from "../../src/shared/constants.js";

/** A minimal, schema-valid `conmuta.json` body for the given `project_id` (matches `test/client/binding.test.ts`'s fixture). */
function validProjectFileJson(projectId: string): string {
  return JSON.stringify({
    schema_version: 1,
    project_id: projectId,
    group_id: -1001234567890,
    roster: [{ agent_id: "@claude", user_id: 111, username: "opuser" }],
  });
}

/** Fails the test immediately if called: proves a later startup step never ran. */
function forbiddenCreateIpcSession(): IpcSession {
  throw new Error("createIpcSessionImpl must not be called");
}

/** Fails the test immediately if called: proves a later startup step never ran. */
function forbiddenCreateServer(_deps: CreateServerDeps): never {
  throw new Error("createServerImpl must not be called");
}

test(
  "runMcpClient starts a live MCP server reachable through the injected transport within the host " +
    "timeout, with zero daemon/IPC interaction during startup (no daemon running)",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "conmuta-main-"));
    try {
      const projectId = "prj-example";
      writeFileSync(join(dir, "conmuta.json"), validProjectFileJson(projectId), "utf8");

      const callToolInvocations: unknown[] = [];
      const fakeIpc: IpcSession = {
        async callTool(route, input) {
          callToolInvocations.push({ route, input });
          throw new Error("callTool must never be invoked during startup");
        },
      };

      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

      const work = (async () => {
        const client = new Client({ name: "test-client", version: "0.0.0" });
        const [exitCode] = await Promise.all([
          runMcpClient({
            project: projectId,
            cwd: dir,
            transport: serverTransport,
            createIpcSessionImpl: () => fakeIpc,
          }),
          client.connect(clientTransport),
        ]);
        try {
          const { tools } = await client.listTools();
          assert.deepEqual(
            tools.map((t) => t.name).sort(),
            ["conmuta_fetch", "conmuta_send", "conmuta_status", "conmuta_thread"],
          );
        } finally {
          await client.close();
        }
        return exitCode;
      })();

      const timeout = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("did not complete within host timeout")), 1000);
      });

      const exitCode = await Promise.race([work, timeout]);

      assert.equal(exitCode, 0);
      assert.equal(callToolInvocations.length, 0, "starting the server and listing tools must trigger zero daemon calls");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("runMcpClient refuses with EXIT_USAGE when project is undefined, before resolving a binding or constructing IPC/server", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-usage-"));
  try {
    const exitCode = await runMcpClient({
      project: undefined,
      cwd: dir,
      createIpcSessionImpl: forbiddenCreateIpcSession,
      createServerImpl: forbiddenCreateServer,
    });
    assert.equal(exitCode, EXIT_USAGE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runMcpClient refuses with the binding's own exit code when no conmuta.json is found, before constructing IPC/server", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-unbound-"));
  try {
    const exitCode = await runMcpClient({
      project: "prj-example",
      cwd: dir,
      createIpcSessionImpl: forbiddenCreateIpcSession,
      createServerImpl: forbiddenCreateServer,
    });
    assert.equal(exitCode, EXIT_UNBOUND_PROJECT);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runMcpClient refuses with EXIT_PROJECT_MISMATCH when the found conmuta.json's project_id disagrees with --project", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-mismatch-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-other"), "utf8");

    const exitCode = await runMcpClient({
      project: "prj-example",
      cwd: dir,
      createIpcSessionImpl: forbiddenCreateIpcSession,
      createServerImpl: forbiddenCreateServer,
    });
    assert.equal(exitCode, EXIT_PROJECT_MISMATCH);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runMcpClient constructs the IPC session and MCP server with the exact identity derived from the resolved binding", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-identity-"));
  try {
    const projectId = "prj-example";
    const roster = [{ agent_id: "@claude", user_id: 111, username: "opuser" }];
    writeFileSync(
      join(dir, "conmuta.json"),
      JSON.stringify({ schema_version: 1, project_id: projectId, group_id: -1001234567890, roster }),
      "utf8",
    );

    let capturedIpcOptions: unknown;
    let capturedServerDeps: CreateServerDeps | undefined;
    const fakeIpc: IpcSession = { callTool: async () => { throw new Error("callTool must not be called"); } };

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    try {
      const [exitCode] = await Promise.all([
        runMcpClient({
          project: projectId,
          cwd: dir,
          transport: serverTransport,
          createIpcSessionImpl: (opts) => {
            capturedIpcOptions = opts;
            return fakeIpc;
          },
          createServerImpl: (deps) => {
            capturedServerDeps = deps;
            return createServer(deps);
          },
        }),
        client.connect(clientTransport),
      ]);
      assert.equal(exitCode, 0);
    } finally {
      await client.close();
    }

    assert.deepEqual(capturedIpcOptions, {
      projectId,
      groupId: -1001234567890,
      rosterHash: computeRosterHash(roster),
      host: hostname(),
    });
    assert.equal(capturedServerDeps?.projectId, projectId);
    assert.equal(capturedServerDeps?.ipc, fakeIpc);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runMcpClient does not resolve until the transport is actually connected (server.connect is awaited, not fire-and-forget)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-await-connect-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");

    let started = false;
    const delayedTransport: Transport = {
      start: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        started = true;
      },
      send: async () => {},
      close: async () => {},
    };

    const exitCode = await runMcpClient({
      project: "prj-example",
      cwd: dir,
      transport: delayedTransport,
      createIpcSessionImpl: () => ({ callTool: async () => { throw new Error("callTool must not be called"); } }),
    });

    assert.equal(started, true, "runMcpClient resolved before transport.start() finished — server.connect must be awaited");
    assert.equal(exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runMcpClient treats a Node version exactly at NODE_FLOOR as acceptable (patch-level boundary, not refused)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-floor-boundary-"));
  try {
    // No conmuta.json: proves the node-floor gate passed and execution reached the binding walk-up.
    const exitCode = await runMcpClient({
      project: "prj-example",
      cwd: dir,
      nodeVersion: NODE_FLOOR,
      createIpcSessionImpl: forbiddenCreateIpcSession,
      createServerImpl: forbiddenCreateServer,
    });
    assert.equal(exitCode, EXIT_UNBOUND_PROJECT, "a version exactly at NODE_FLOOR must pass the gate, not be refused as EXIT_NODE_FLOOR");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runMcpClient refuses with EXIT_NODE_FLOOR when the injected Node version is below NODE_FLOOR, before any binding walk-up", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-floor-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");
    const lines: string[] = [];

    const exitCode = await runMcpClient({
      project: "prj-example",
      cwd: dir,
      nodeVersion: "0.1.0",
      stderr: (line) => lines.push(line),
      createIpcSessionImpl: forbiddenCreateIpcSession,
      createServerImpl: forbiddenCreateServer,
    });

    assert.equal(exitCode, EXIT_NODE_FLOOR);
    assert.match(lines.join("\n"), /Node\.js/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
