import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { awaitTransportClose, runMcpClient } from "../../src/client/main.js";
import { EventEmitter } from "node:events";
import type { IpcSession } from "../../src/client/ipc-stub.js";
import { createServer, type CreateServerDeps } from "../../src/client/server.js";
import { computeRosterHash } from "../../src/shared/roster-hash.js";
import {
  EXIT_NODE_FLOOR,
  EXIT_PROJECT_MISMATCH,
  EXIT_UNBOUND_PROJECT,
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
      let releases = 0;
      const fakeIpc: IpcSession = {
        async callTool(route, input) {
          callToolInvocations.push({ route, input });
          throw new Error("callTool must never be invoked during startup");
        },
        async release() {
          releases += 1;
        },
      };

      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

      // B-106, and the correction Judgment Day round 1 forced (judge B's CRITICAL, verified against the
      // pinned SDK by the parent). `server.connect()` resolves when the transport STARTS, so this test
      // may no longer assume the run finishes before the host closes: the client must stay alive while
      // the host is connected, and only release on a real close signal. The assertions below are ordered
      // to kill the old, wrong behaviour — a release fired at startup would make `releases` 1 here,
      // before the close, and this test would fail.
      const client = new Client({ name: "test-client", version: "0.0.0" });
      const running = runMcpClient({
        project: projectId,
        cwd: dir,
        transport: serverTransport,
        closeSignals: { observeProcessSignals: false },
        createIpcSessionImpl: () => fakeIpc,
      });
      await client.connect(clientTransport);
      const { tools } = await client.listTools();
      assert.deepEqual(
        tools.map((t) => t.name).sort(),
        ["conmuta_fetch", "conmuta_send", "conmuta_status", "conmuta_thread"],
      );
      assert.equal(releases, 0, "the client must NOT release while the host is still connected");

      await client.close();
      const exitCode = await Promise.race([
        running,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("did not complete within host timeout")), 1000);
        }),
      ]);

      assert.equal(exitCode, 0);
      assert.equal(callToolInvocations.length, 0, "starting the server and listing tools must trigger zero daemon calls");
      assert.equal(releases, 1, "closing the transport is what releases the session, exactly once");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// ADR-0033 replaces the pre-amendment `EXIT_USAGE` early return this slot used to hold. The no-flag
// path is now the ordinary path: the nearest ancestor `conmuta.json` fixes the binding, the server
// starts, and startup still makes zero daemon calls. The assertion semantic (`--project` given and
// disagreeing → refusal) is covered by the two tests that follow.
test(
  "runMcpClient with no --project binds to the nearest ancestor conmuta.json and starts a live server " +
    "(ADR-0033: the flag is an assertion, not a requirement)",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "conmuta-main-noflag-"));
    try {
      const projectId = "prj-example";
      writeFileSync(join(dir, "conmuta.json"), validProjectFileJson(projectId), "utf8");

      const callToolInvocations: unknown[] = [];
      let releases = 0;
      const fakeIpc: IpcSession = {
        async callTool(route, input) {
          callToolInvocations.push({ route, input });
          throw new Error("callTool must never be invoked during startup");
        },
        async release() {
          releases += 1;
        },
      };

      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

      // Same ordering discipline as the test above (B-106, judge B's round-1 CRITICAL): the release is
      // measured on the close, not at startup.
      const client = new Client({ name: "test-client", version: "0.0.0" });
      const running = runMcpClient({
        project: undefined,
        cwd: dir,
        transport: serverTransport,
        closeSignals: { observeProcessSignals: false },
        createIpcSessionImpl: () => fakeIpc,
      });
      await client.connect(clientTransport);
      const { tools } = await client.listTools();
      assert.deepEqual(
        tools.map((t) => t.name).sort(),
        ["conmuta_fetch", "conmuta_send", "conmuta_status", "conmuta_thread"],
      );
      assert.equal(releases, 0, "the client must NOT release while the host is still connected");

      await client.close();
      const exitCode = await Promise.race([
        running,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("did not complete within host timeout")), 1000);
        }),
      ]);

      assert.equal(exitCode, 0);
      assert.equal(callToolInvocations.length, 0, "starting the server must trigger zero daemon calls");
      assert.equal(releases, 1, "the no-flag path releases its session on close too (B-106)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

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
    const fakeIpc: IpcSession = { callTool: async () => { throw new Error("callTool must not be called"); }, release: async () => {} };

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    // B-106: the run now ends on the CLOSE, so it is started first, the host closes, and only then is
    // the exit code awaited — the previous `Promise.all([run, connect])` shape would deadlock, which is
    // exactly the signal that the old behaviour (returning at startup) was the bug.
    const running = runMcpClient({
      project: projectId,
      cwd: dir,
      transport: serverTransport,
      closeSignals: { observeProcessSignals: false },
      createIpcSessionImpl: (opts) => {
        capturedIpcOptions = opts;
        return fakeIpc;
      },
      createServerImpl: (deps) => {
        capturedServerDeps = deps;
        return createServer(deps);
      },
    });
    await client.connect(clientTransport);
    await client.close();
    assert.equal(await running, 0);

    assert.deepEqual(capturedIpcOptions, {
      projectId,
      groupId: -1001234567890,
      rosterHash: computeRosterHash(roster),
      // Judgment Day correction (session 35, Judge B CRITICAL): `host` is the MCP host-application
      // label (design.md; DATA-MODEL.md §3.5's `client_cursors.host` row), never a machine name — the
      // real value isn't known until after `server.connect()`'s `initialize` exchange, so `main.ts`
      // uses this disclosed placeholder (see `MCP_HOST_LABEL_UNKNOWN` in `src/client/main.ts`) rather
      // than the machine's `os.hostname()`.
      host: "unknown",
    });
    assert.equal(capturedServerDeps?.projectId, projectId);
    assert.equal(capturedServerDeps?.ipc, fakeIpc);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runMcpClient does not resolve until the transport is actually connected, and does not resolve at all until it closes (server.connect is awaited, then the close is observed)", async () => {
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

    let resolved = false;
    const running = runMcpClient({
      project: "prj-example",
      cwd: dir,
      transport: delayedTransport,
      createIpcSessionImpl: () => ({ callTool: async () => { throw new Error("callTool must not be called"); }, release: async () => {} }),
      closeSignals: { observeProcessSignals: false },
    }).then((code) => {
      resolved = true;
      return code;
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(started, true, "the run must still have been waiting when transport.start() finished — server.connect is awaited, not fire-and-forget");
    // B-106 (Judgment Day round-1 CRITICAL, judge B): the run must NOT have finished just because the
    // transport started. `connect()` resolves at start, so a client that returned here would have
    // released its slot while the host was still connected — and would have released nothing at all,
    // because no tool call has happened yet.
    assert.equal(resolved, false, "runMcpClient must not resolve while the transport is still open");

    delayedTransport.onclose?.();
    assert.equal(await running, 0);
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

test("runMcpClient converts an unexpected startup failure into a message-only stderr line and exit code 1, never an uncaught rejection or a stack trace", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-catch-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");
    const lines: string[] = [];

    const explodingTransport: Transport = {
      start: async () => {
        throw new Error("simulated transport failure");
      },
      send: async () => {},
      close: async () => {},
    };

    const exitCode = await runMcpClient({
      project: "prj-example",
      cwd: dir,
      stderr: (line) => lines.push(line),
      transport: explodingTransport,
      createIpcSessionImpl: () => ({
        callTool: async () => {
          throw new Error("callTool must not be called");
        },
        release: async () => {
          throw new Error("release must not be called when the transport never connected");
        },
      }),
    });

    // Judgment Day correction (session 35, Judge A CRITICAL): design.md:424/PT-08 require a startup
    // error to surface as a message only, never `err.stack` — mirrors daemon/main.ts's own pattern.
    assert.equal(exitCode, 1);
    assert.equal(lines.length, 1);
    assert.equal(lines[0], "simulated transport failure");
    assert.equal(lines[0].includes("at "), false, "must not leak a stack trace frame");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runMcpClient exercises the REAL (non-injected) createIpcSession default when createIpcSessionImpl is omitted, with zero network I/O since no tool is ever called", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-real-ipc-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    try {
      // No createIpcSessionImpl override: exercises `main.ts`'s own `?? createIpcSession` fallback
      // for real. Safe — createIpcSession does zero I/O synchronously; its handshake is lazy and only
      // this test never calls a tool, so it never fires (independent verifier's N2 gap, closed).
      const [exitCode] = await Promise.all([
        runMcpClient({ project: "prj-example", cwd: dir, transport: serverTransport }),
        client.connect(clientTransport),
      ]);
      assert.equal(exitCode, 0);
    } finally {
      await client.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runMcpClient's refusalMessage reports invalid_project_file without echoing the document's forbidden-content problems themselves", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-invalid-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), "{ this is not valid JSON", "utf8");
    const lines: string[] = [];

    const exitCode = await runMcpClient({
      project: "prj-example",
      cwd: dir,
      stderr: (line) => lines.push(line),
      createIpcSessionImpl: forbiddenCreateIpcSession,
      createServerImpl: forbiddenCreateServer,
    });

    assert.equal(exitCode, EXIT_UNBOUND_PROJECT);
    assert.match(lines.join("\n"), /not a valid project file/);
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

// --- awaitTransportClose (B-106: the close signal the SDK never reports) ---
// Judgment Day round 1 (judge B's CRITICAL, verified against the pinned SDK by the parent): the first
// version of this change sequenced the release after `server.connect()`, which resolves when the
// transport STARTS. The close has to be observed from somewhere real, and no single source covers every
// host — hence three, and hence these tests.

function fakeTransport(): Transport & { onclose?: () => void } {
  return { start: async () => {}, send: async () => {}, close: async () => {} };
}

test("awaitTransportClose resolves when the transport's own onclose fires, chaining any handler already there", async () => {
  const transport = fakeTransport();
  let sdkCleanupRan = 0;
  transport.onclose = () => {
    sdkCleanupRan += 1;
  };

  const waiting = awaitTransportClose(transport, { observeProcessSignals: false });
  transport.onclose?.();

  await waiting;
  assert.equal(sdkCleanupRan, 1, "whatever the SDK installed must still run — dropping it would break its own cleanup");
});

test("awaitTransportClose treats stdin's end and close as close signals, because the SDK reports neither", async () => {
  for (const event of ["end", "close"]) {
    const transport = fakeTransport();
    const stdin = new EventEmitter();
    const waiting = awaitTransportClose(transport, {
      stdin: stdin as unknown as NodeJS.ReadStream,
      processLike: new EventEmitter() as unknown as NodeJS.Process,
    });

    stdin.emit(event);
    await waiting;
  }
});

test("awaitTransportClose resolves on beforeExit as the belt, and removes every listener it installed", async () => {
  const transport = fakeTransport();
  const stdin = new EventEmitter();
  const processLike = new EventEmitter();
  const waiting = awaitTransportClose(transport, {
    stdin: stdin as unknown as NodeJS.ReadStream,
    processLike: processLike as unknown as NodeJS.Process,
  });

  processLike.emit("beforeExit");
  await waiting;

  assert.equal(stdin.listenerCount("end"), 0, "no stdin listener may outlive the wait");
  assert.equal(stdin.listenerCount("close"), 0);
  assert.equal(processLike.listenerCount("beforeExit"), 0, "the belt must not stay armed after it fires");
});

test("awaitTransportClose leaves process surfaces alone when asked to observe only the transport", async () => {
  const transport = fakeTransport();
  const stdin = new EventEmitter();
  const processLike = new EventEmitter();
  const waiting = awaitTransportClose(transport, {
    stdin: stdin as unknown as NodeJS.ReadStream,
    processLike: processLike as unknown as NodeJS.Process,
    observeProcessSignals: false,
  });

  assert.equal(stdin.listenerCount("end"), 0);
  assert.equal(processLike.listenerCount("beforeExit"), 0);

  transport.onclose?.();
  await waiting;
});
