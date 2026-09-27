import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getLastSessionSeenAt, startDaemon } from "../../src/daemon/bootstrap.js";
import { LockHeldError, readLockFile } from "../../src/daemon/lifecycle/lock.js";
import { readRunFile } from "../../src/daemon/lifecycle/run-file.js";
import { readPanelRunFile } from "../../src/daemon/panel/panel-run-file.js";
import { computeDoctorProof } from "../../src/daemon/ipc/doctor.js";
import type { SecretStore } from "../../src/secret-store/types.js";
import type { TelegramClient } from "../../src/daemon/telegram.js";
import type { Registry } from "../../src/registry/schema.js";
import { REGISTRY_VERSION } from "../../src/shared/constants.js";

// `fetch(...)` against a `http://127.0.0.1:<port>/...` URL sends `Host: 127.0.0.1:<port>` by
// construction — exactly what `daemon/ipc/server.ts`'s own-loopback check expects — so no explicit
// override is needed (and `Host` is a forbidden header name for `fetch` to set directly anyway).
function ipcUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}

const NONCE_HEX = "0".repeat(64);
const HMAC_HEX = "1".repeat(64);
const ROSTER_HASH = `sha256:${"2".repeat(64)}`;

function createTempHome(): string {
  return mkdtempSync(join(tmpdir(), "conmuta-bootstrap-test-"));
}

function cleanupTempHome(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failure in tests
  }
}

test("bootstrap: full boot sequence and clean shutdown", async () => {
  const homeDir = createTempHome();

  try {
    const daemon = await startDaemon({ homeDir });

    // Verify directories created
    assert.ok(existsSync(daemon.dirs.homeDir));
    assert.ok(existsSync(daemon.dirs.runDir));
    assert.ok(existsSync(daemon.dirs.secretsDir));

    // Verify lock acquired
    const lock = readLockFile(join(daemon.dirs.runDir, "daemon.lock"));
    assert.ok(lock !== null);
    assert.equal(lock.pid, process.pid);

    // Verify run file written
    const run = readRunFile(daemon.dirs.runDir);
    assert.ok(run !== null);
    assert.equal(run.pid, process.pid);
    assert.equal(run.port, daemon.port);
    assert.ok(daemon.port > 0);
    assert.ok(run.secret.length > 0);

    // Verify the panel listener is bound and its run file written (F3 PR-05)
    const panelRun = readPanelRunFile(daemon.dirs.runDir);
    assert.ok(panelRun !== null);
    assert.equal(panelRun.pid, process.pid);
    assert.equal(panelRun.port, daemon.panelPort);
    assert.ok(daemon.panelPort > 0);
    assert.notEqual(daemon.panelPort, daemon.port, "the panel and IPC listeners must bind distinct ports");
    assert.ok(panelRun.token.length > 0);
    const panelRes = await fetch(ipcUrl(daemon.panelPort, `/?token=${panelRun.token}`));
    assert.equal(panelRes.status, 200, "the panel Home screen must be reachable with its own token");

    // Verify ledger opened
    assert.equal(daemon.ledger.status, "opened");
    assert.ok(daemon.ledger.schemaVersion >= 1);

    // Verify registry loaded
    assert.ok(daemon.registry !== undefined);

    // Verify secret store initialized
    assert.ok(daemon.secretStore !== undefined);

    // Verify shutdown sequence
    await daemon.stop();

    // Run file deleted
    assert.equal(readRunFile(daemon.dirs.runDir), null);

    // Panel run file deleted too (F3 PR-05)
    assert.equal(readPanelRunFile(daemon.dirs.runDir), null);

    // Lock released
    const lockAfterStop = readLockFile(join(daemon.dirs.runDir, "daemon.lock"));
    assert.equal(lockAfterStop, null);

    // Ledger closed: attempting to prepare a statement should throw
    assert.throws(() => {
      daemon.ledger.db.prepare("SELECT 1").get();
    });
  } finally {
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: throws LockHeldError if daemon is already running (singleton)", async () => {
  const homeDir = createTempHome();

  try {
    const daemon1 = await startDaemon({ homeDir });

    await assert.rejects(
      async () => {
        await startDaemon({ homeDir });
      },
      (err: unknown) => {
        return err instanceof LockHeldError;
      },
    );

    await daemon1.stop();
  } finally {
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: stop() is idempotent", async () => {
  const homeDir = createTempHome();

  try {
    const daemon = await startDaemon({ homeDir });
    await daemon.stop();
    // Second stop should not throw
    await daemon.stop();
  } finally {
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: accepts injected secretStore", async () => {
  const homeDir = createTempHome();

  const fakeStore: SecretStore = {
    kind: "file",
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  };

  try {
    const daemon = await startDaemon({ homeDir, secretStore: fakeStore });
    assert.equal(daemon.secretStore, fakeStore);
    await daemon.stop();
  } finally {
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: concurrent stop() calls return the same in-flight promise and await completion", async () => {
  const homeDir = createTempHome();

  try {
    const daemon = await startDaemon({ homeDir });
    const p1 = daemon.stop();
    const p2 = daemon.stop();
    assert.equal(p1, p2, "concurrent stop() calls must return the identical promise instance");
    await Promise.all([p1, p2]);

    // Verify shutdown occurred
    assert.equal(readRunFile(daemon.dirs.runDir), null);
  } finally {
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: getLastSessionSeenAt reflects client_cursors.last_seen_at in the ledger", async () => {
  const homeDir = createTempHome();

  try {
    const daemon = await startDaemon({ homeDir });
    const db = daemon.ledger.db;

    // Initially with empty client_cursors, returns null
    assert.equal(getLastSessionSeenAt(db), null);

    // Insert a client cursor
    const time1 = "2026-04-12T10:00:00.000Z";
    db.prepare(
      `INSERT INTO client_cursors (client_id, project_id, host, pid, started_at, last_seen_at, inbox_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("client-1", "proj-1", "host-1", 1001, time1, time1, 0);

    assert.equal(getLastSessionSeenAt(db), Date.parse(time1));

    // Insert a second cursor with a later last_seen_at
    const time2 = "2026-04-12T12:30:00.000Z";
    db.prepare(
      `INSERT INTO client_cursors (client_id, project_id, host, pid, started_at, last_seen_at, inbox_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("client-2", "proj-1", "host-1", 1002, time1, time2, 0);

    assert.equal(getLastSessionSeenAt(db), Date.parse(time2));

    await daemon.stop();
  } finally {
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: mounts GET /identity and POST /session on the real IPC server (PR-40a)", async () => {
  const homeDir = createTempHome();
  const fakeStore: SecretStore = {
    kind: "file",
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  };

  let daemon: Awaited<ReturnType<typeof startDaemon>> | undefined;
  try {
    daemon = await startDaemon({ homeDir, secretStore: fakeStore });

    const identityResponse = await fetch(ipcUrl(daemon.port, `/identity?nonce=${NONCE_HEX}`));
    assert.equal(identityResponse.status, 200);
    const identityBody = (await identityResponse.json()) as {
      proof: string;
      server_nonce: string;
      pid: number;
      build: string;
    };
    assert.equal(typeof identityBody.proof, "string");
    assert.equal(identityBody.pid, process.pid);

    // No registry binding exists for this project, so `POST /session` must reach `createSessionRoutes`'s
    // own UNBOUND_PROJECT refusal — not a bare route-not-found 404, which is what an unmounted route (the
    // pre-PR-40a raw 404 handler) would answer instead.
    const sessionResponse = await fetch(ipcUrl(daemon.port, "/session"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: "test-project",
        group_id: -1001234567890,
        roster_hash: ROSTER_HASH,
        host: "claude-code",
        pid: process.pid,
        hmac: HMAC_HEX,
        server_nonce: NONCE_HEX,
      }),
    });
    const sessionBody = (await sessionResponse.json()) as { code?: string };
    assert.equal(sessionBody.code, "UNBOUND_PROJECT");
  } finally {
    // A dangling, un-`unref`'d listening server would otherwise hang the whole test process on an
    // assertion failure above (RED) — stop unconditionally, regardless of what threw.
    await daemon?.stop().catch(() => {});
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: mounts POST /doctor on the real IPC server, authenticated end-to-end (PR-18)", async () => {
  const homeDir = createTempHome();
  const fakeStore: SecretStore = {
    kind: "file",
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  };

  // Not typed `: TelegramClient` directly (unlike the other fakes in this file) so `getChatMember` can
  // sit alongside the interface's own methods without an excess-property error — `doctorClientFor`
  // (bootstrap.ts) needs it, `BindingsReconciler`'s `TelegramClient`-typed callers simply ignore it.
  async function fakeDoctorClientFactory() {
    return {
      async getUpdates() {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [];
      },
      async sendMessage(params: { chat_id: number | string; text: string }) {
        return { message_id: 1, chat: { id: Number(params.chat_id), type: "group" }, date: 1, text: params.text };
      },
      async getMe() {
        return { id: 444333222, is_bot: true, username: "doctor_bot" };
      },
      async getChat(chatId: number | string) {
        return { id: Number(chatId), type: "supergroup" };
      },
      async getChatMember() {
        return { status: "member" as const };
      },
    };
  }

  const registry: Registry = {
    registry_version: REGISTRY_VERSION,
    bots: [
      {
        bot_id: 444333222,
        username: "doctor_bot",
        token_ref: { store: "keychain", account: "bot:444333222" },
        added_at: "2026-09-01T00:00:00.000Z",
      },
    ],
    groups: [{ group_id: -1004443332221, added_at: "2026-09-01T00:00:00.000Z" }],
    projects: [{ project_id: "prj-doctor", path: homeDir }],
    bindings: [
      {
        project_id: "prj-doctor",
        bot_id: 444333222,
        group_id: -1004443332221,
        agent_id: "@doctor-agent",
        status: "active",
        roster_snapshot: [{ agent_id: "@doctor-agent", user_id: 444333222, username: "doctor_bot" }],
        roster_hash: ROSTER_HASH,
        bound_at: "2026-09-01T00:00:00.000Z",
      },
    ],
  };
  writeFileSync(join(homeDir, "registry.json"), JSON.stringify(registry));

  let daemon: Awaited<ReturnType<typeof startDaemon>> | undefined;
  try {
    daemon = await startDaemon({
      homeDir,
      secretStore: fakeStore,
      telegramClientFactory: fakeDoctorClientFactory,
    });

    const run = readRunFile(daemon.dirs.runDir);
    assert.ok(run !== null);
    const secret = run.secret;

    async function fetchServerNonce(): Promise<string> {
      const identityResponse = await fetch(ipcUrl(daemon!.port, `/identity?nonce=${NONCE_HEX}`));
      const identityBody = (await identityResponse.json()) as { server_nonce: string };
      return identityBody.server_nonce;
    }

    // 401: an invalid hmac is refused before any registry lookup (doctor.ts's auth-before-registry
    // order, the opposite of POST /session's own ordering).
    const badNonce = await fetchServerNonce();
    const unauthorizedResponse = await fetch(ipcUrl(daemon.port, "/doctor"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ server_nonce: badNonce, hmac: HMAC_HEX, dm_probe: false }),
    });
    assert.equal(unauthorizedResponse.status, 401);

    // 404: a validly-authenticated request naming an unbound project_id is refused, not silently
    // treated as "no results" or run unscoped.
    const unboundNonce = await fetchServerNonce();
    const unboundProof = computeDoctorProof(secret, unboundNonce);
    const unboundResponse = await fetch(ipcUrl(daemon.port, "/doctor"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        server_nonce: unboundNonce,
        hmac: unboundProof,
        project_id: "prj-unbound",
        dm_probe: false,
      }),
    });
    assert.equal(unboundResponse.status, 404);
    const unboundBody = (await unboundResponse.json()) as { code?: string };
    assert.equal(unboundBody.code, "DOCTOR_UNBOUND_PROJECT");

    // 200: a validly-authenticated request naming the real bound project_id runs the online checks
    // through the injected `doctorClientFor`.
    const boundNonce = await fetchServerNonce();
    const boundProof = computeDoctorProof(secret, boundNonce);
    const boundResponse = await fetch(ipcUrl(daemon.port, "/doctor"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        server_nonce: boundNonce,
        hmac: boundProof,
        project_id: "prj-doctor",
        dm_probe: false,
      }),
    });
    assert.equal(boundResponse.status, 200);
    const boundBody = (await boundResponse.json()) as {
      bindings: { project_id: string; checks: { id: string; status: string }[] }[];
    };
    assert.equal(boundBody.bindings.length, 1);
    assert.equal(boundBody.bindings[0].project_id, "prj-doctor");
    assert.ok(boundBody.bindings[0].checks.some((c) => c.id === "bot-identity" && c.status === "pass"));
  } finally {
    await daemon?.stop().catch(() => {});
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: reconciles an active registry binding at boot and again on the next heartbeat tick (PR-40a)", async () => {
  const homeDir = createTempHome();
  const fakeStore: SecretStore = {
    kind: "file",
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  };

  let getUpdatesCalls = 0;
  const fakeClient: TelegramClient = {
    async getUpdates() {
      getUpdatesCalls++;
      // A real getUpdates() long-polls Telegram for MAX_LONGPOLL_SECONDS, which is what naturally paces
      // poller.ts's loop in production. Resolving instantly here would busy-spin that same real loop as
      // fast as the CPU allows — a self-inflicted microtask livelock that starves the whole process's
      // event loop (including every other test's setTimeout-based waits). A short macrotask delay keeps
      // the loop realistic without slowing the test down.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [];
    },
    async sendMessage(params) {
      return { message_id: 1, chat: { id: Number(params.chat_id), type: "group" }, date: 1, text: params.text };
    },
    async getMe() {
      return { id: 555111222, is_bot: true, username: "test_bot" };
    },
    async getChat() {
      return { id: -1009876543210, type: "group" };
    },
  };

  const registry: Registry = {
    registry_version: REGISTRY_VERSION,
    bots: [
      {
        bot_id: 555111222,
        username: "test_bot",
        token_ref: { store: "keychain", account: "bot:555111222" },
        added_at: "2026-09-01T00:00:00.000Z",
      },
    ],
    groups: [{ group_id: -1009876543210, added_at: "2026-09-01T00:00:00.000Z" }],
    projects: [{ project_id: "prj-wired", path: homeDir }],
    bindings: [
      {
        project_id: "prj-wired",
        bot_id: 555111222,
        group_id: -1009876543210,
        agent_id: "@wired-agent",
        status: "active",
        roster_snapshot: [{ agent_id: "@wired-agent", user_id: 555111222, username: "test_bot" }],
        roster_hash: ROSTER_HASH,
        bound_at: "2026-09-01T00:00:00.000Z",
      },
    ],
  };
  writeFileSync(join(homeDir, "registry.json"), JSON.stringify(registry));

  let daemon: Awaited<ReturnType<typeof startDaemon>> | undefined;
  try {
    daemon = await startDaemon({
      homeDir,
      secretStore: fakeStore,
      heartbeatPeriodMs: 15,
      telegramClientFactory: async () => fakeClient,
    });

    // Reconciled at boot: BindingsReconciler.reconcile() writes one BINDING_CHANGED audit row per
    // newly-active binding, and the poller's first getUpdates() call proves the poller actually started
    // (not merely constructed).
    await new Promise((resolve) => setTimeout(resolve, 30));
    const bootCallCount = getUpdatesCalls;
    assert.ok(bootCallCount > 0, "poller must have started and called getUpdates() at least once by boot");

    const auditRows = daemon.ledger.db
      .prepare("SELECT * FROM audit_log WHERE reason = 'BINDING_CHANGED'")
      .all() as Record<string, unknown>[];
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].project_id, "prj-wired");

    // Reconciled again on the heartbeat tick: an unchanged registry reconciles to a no-op (matches
    // BindingsReconciler's own "does nothing when active bindings are unchanged" contract), so the audit
    // row count must stay at 1 rather than grow on every tick.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const auditRowsAfterTicks = daemon.ledger.db
      .prepare("SELECT * FROM audit_log WHERE reason = 'BINDING_CHANGED'")
      .all() as Record<string, unknown>[];
    assert.equal(auditRowsAfterTicks.length, 1, "an unchanged registry must not re-fire BINDING_CHANGED on every tick");

    // Real hot-reload (D-12): a mutant that disables tick-driven reconciliation entirely would still
    // pass every assertion above (an unchanged registry stays a no-op either way), so this is the one
    // case that actually distinguishes "reconciled on every tick" from "reconciled once at boot,
    // never again". Add a genuinely new binding after boot and prove the NEXT tick — not boot — is what
    // picks it up.
    const registryWithSecondBinding: Registry = {
      ...registry,
      bots: [
        ...registry.bots,
        {
          bot_id: 555111223,
          username: "test_bot_2",
          token_ref: { store: "keychain", account: "bot:555111223" },
          added_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      groups: [...registry.groups, { group_id: -1009876543211, added_at: "2026-09-01T00:00:00.000Z" }],
      projects: [...registry.projects, { project_id: "prj-wired-2", path: homeDir }],
      bindings: [
        ...registry.bindings,
        {
          project_id: "prj-wired-2",
          bot_id: 555111223,
          group_id: -1009876543211,
          agent_id: "@wired-agent-2",
          status: "active",
          roster_snapshot: [{ agent_id: "@wired-agent-2", user_id: 555111223, username: "test_bot_2" }],
          roster_hash: ROSTER_HASH,
          bound_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    };
    writeFileSync(join(homeDir, "registry.json"), JSON.stringify(registryWithSecondBinding));

    await new Promise((resolve) => setTimeout(resolve, 30));
    const auditRowsAfterAdd = daemon.ledger.db
      .prepare("SELECT * FROM audit_log WHERE reason = 'BINDING_CHANGED'")
      .all() as Record<string, unknown>[];
    assert.equal(
      auditRowsAfterAdd.length,
      2,
      "a binding added to the registry after boot must be reconciled on the next heartbeat tick, not only at boot",
    );
    assert.ok(auditRowsAfterAdd.some((row) => row.project_id === "prj-wired-2"));

    await daemon.stop();

    // stop() must call reconciler.stopAll(): the poller loop must actually terminate, not merely have its
    // handle discarded — proven by the call count going quiet after a grace period.
    const callCountAtStop = getUpdatesCalls;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(getUpdatesCalls, callCountAtStop, "poller must stop calling getUpdates() once stop() resolves");
  } finally {
    // See the previous test's comment: stop unconditionally so a RED assertion never leaves a dangling
    // listening server (or a still-running poller loop) hanging the test process.
    await daemon?.stop().catch(() => {});
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: an overlapping heartbeat tick does not start a second poller while a slow reconcile is in flight (PR-40a Alpha audit)", async () => {
  const homeDir = createTempHome();
  const fakeStore: SecretStore = {
    kind: "file",
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  };

  let factoryCalls = 0;
  const fakeClient: TelegramClient = {
    async getUpdates() {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [];
    },
    async sendMessage(params) {
      return { message_id: 1, chat: { id: Number(params.chat_id), type: "group" }, date: 1, text: params.text };
    },
    async getMe() {
      return { id: 999888777, is_bot: true, username: "test_bot" };
    },
    async getChat() {
      return { id: -1005556667778, type: "group" };
    },
  };

  // Boot with NO active binding at all: the boot-time `reconciler.reconcile()` call (bootstrap.ts, before
  // the heartbeat even starts) runs strictly serially before any tick can fire, so a slow factory there
  // would never actually race a tick — the addition below must happen AFTER boot, while the heartbeat is
  // already running, for the race the guard defends against to be reachable at all.
  const emptyRegistry: Registry = {
    registry_version: REGISTRY_VERSION,
    bots: [],
    groups: [],
    projects: [],
    bindings: [],
  };
  writeFileSync(join(homeDir, "registry.json"), JSON.stringify(emptyRegistry));

  let daemon: Awaited<ReturnType<typeof startDaemon>> | undefined;
  try {
    daemon = await startDaemon({
      homeDir,
      secretStore: fakeStore,
      // Shorter than the artificial factory delay below: several ticks are guaranteed to fire while the
      // first tick's reconcile() is still awaiting its factory — without the re-entrancy guard, each of
      // those overlapping ticks would see the binding as `!current` (bindings.ts's synchronous
      // check-then-async-add races) and call the factory again for the same binding.
      heartbeatPeriodMs: 5,
      telegramClientFactory: async () => {
        factoryCalls++;
        // Longer than several heartbeat periods, so multiple ticks are guaranteed to fire before this
        // resolves if the guard does not skip them.
        await new Promise((resolve) => setTimeout(resolve, 40));
        return fakeClient;
      },
    });

    const registryWithBinding: Registry = {
      registry_version: REGISTRY_VERSION,
      bots: [
        {
          bot_id: 999888777,
          username: "test_bot",
          token_ref: { store: "keychain", account: "bot:999888777" },
          added_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      groups: [{ group_id: -1005556667778, added_at: "2026-09-01T00:00:00.000Z" }],
      projects: [{ project_id: "prj-slow", path: homeDir }],
      bindings: [
        {
          project_id: "prj-slow",
          bot_id: 999888777,
          group_id: -1005556667778,
          agent_id: "@slow-agent",
          status: "active",
          roster_snapshot: [{ agent_id: "@slow-agent", user_id: 999888777, username: "test_bot" }],
          roster_hash: ROSTER_HASH,
          bound_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    };
    writeFileSync(join(homeDir, "registry.json"), JSON.stringify(registryWithBinding));

    // Several 5ms ticks will observe the new file before the first one's factory call (40ms) resolves.
    await new Promise((resolve) => setTimeout(resolve, 120));

    // One binding-add calls the factory exactly twice by design: once for `buildTransport`'s own
    // `createTelegramClient` (bootstrap.ts's `reconciler` construction) and once for `createPoller`'s
    // own `buildTelegramClient` call. A guard failure would double this (or worse), because a second,
    // overlapping tick's `reconcile()` would race the same add before the first one finishes it.
    assert.equal(
      factoryCalls,
      2,
      "the re-entrancy guard must skip every tick that overlaps an in-flight reconcile, not just log a warning",
    );

    const auditRows = daemon.ledger.db
      .prepare("SELECT * FROM audit_log WHERE reason = 'BINDING_CHANGED'")
      .all() as Record<string, unknown>[];
    assert.equal(auditRows.length, 1, "a raced double-add would also show up as a duplicate BINDING_CHANGED row");
  } finally {
    await daemon?.stop().catch(() => {});
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: stop() closes the real IPC server — a subsequent request is refused (PR-40a)", async () => {
  const homeDir = createTempHome();
  const fakeStore: SecretStore = {
    kind: "file",
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  };

  try {
    const daemon = await startDaemon({ homeDir, secretStore: fakeStore });
    const port = daemon.port;

    await daemon.stop();

    await assert.rejects(
      () => fetch(ipcUrl(port, `/identity?nonce=${NONCE_HEX}`)),
      "a request after stop() must be refused (connection closed), not answered",
    );
  } finally {
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: stop() closes the real panel server — a subsequent request is refused (F3 PR-05)", async () => {
  const homeDir = createTempHome();

  try {
    const daemon = await startDaemon({ homeDir });
    const panelRun = readPanelRunFile(daemon.dirs.runDir);
    assert.ok(panelRun !== null);
    const { port, token } = panelRun;

    await daemon.stop();

    await assert.rejects(
      () => fetch(ipcUrl(port, `/?token=${token}`)),
      "a panel request after stop() must be refused (connection closed), not answered",
    );
  } finally {
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: a boot failure after the panel listener starts closes the panel listener (F3 PR-05)", async () => {
  const homeDir = createTempHome();
  const runDir = join(homeDir, "run");
  // `secretStore.kind` is first read while building `routesDeps`, well after the panel listener has
  // already bound and written its run file — an injected throw there simulates a failure late in boot
  // without needing any new test-only hook.
  const throwingStore: SecretStore = {
    get kind(): SecretStore["kind"] {
      throw new Error("boom-after-panel-start");
    },
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  };

  try {
    await assert.rejects(() => startDaemon({ homeDir, secretStore: throwingStore }), /boom-after-panel-start/);

    const panelRun = readPanelRunFile(runDir);
    assert.ok(panelRun !== null, "setup: the panel run file must have been written before the injected failure");

    await assert.rejects(
      () => fetch(ipcUrl(panelRun.port, `/?token=${panelRun.token}`)),
      "the panel listener must be closed after a mid-boot failure, not left orphaned",
    );
  } finally {
    cleanupTempHome(homeDir);
  }
});

test("bootstrap: retention sweep runs when due during heartbeat tick", async () => {
  const homeDir = createTempHome();

  try {
    // Start daemon with fast heartbeat (15ms)
    const daemon = await startDaemon({
      homeDir,
      heartbeatPeriodMs: 15,
    });
    const db = daemon.ledger.db;

    // Insert a stale client_cursor (older than CLIENT_SESSION_STALE_HOURS = 24h)
    const staleTime = "2020-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO client_cursors (client_id, project_id, host, pid, started_at, last_seen_at, inbox_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("stale-client", "proj-1", "host-1", 1001, staleTime, staleTime, 0);

    // Verify row is present
    const beforeCount = db
      .prepare("SELECT count(*) as c FROM client_cursors WHERE client_id = ?")
      .get("stale-client") as { c: number };
    assert.equal(beforeCount.c, 1);

    // Wait for heartbeat tick to trigger retention sweep
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Stale row should have been deleted by retention sweep
    const afterCount = db
      .prepare("SELECT count(*) as c FROM client_cursors WHERE client_id = ?")
      .get("stale-client") as { c: number };
    assert.equal(afterCount.c, 0, "stale cursor should be swept on heartbeat tick");

    await daemon.stop();
  } finally {
    cleanupTempHome(homeDir);
  }
});

// PR-07 (roster-sync spec.md, D-07): `roster_drift` is resolved only by a human running
// `conmuta project sync-roster`, never by a timer. This proves the negative directly against the
// daemon's own heartbeat loop, mirroring the PR-40a reconciliation test's harness above: a real
// `startDaemon` with a fast `heartbeatPeriodMs`, a fake secret store and a fake `TelegramClient` so no
// real network call is made, several ticks elapse, and `registry.json`'s stored `roster_snapshot`/
// `roster_hash` must still equal what this test seeded — this module never even imports
// `cli/project-sync-roster.ts`, so no invocation of it is reachable from the heartbeat path at all.
test("bootstrap: N heartbeat ticks never invoke sync-roster, so roster_snapshot/roster_hash stay unchanged (PR-07, D-07)", async () => {
  const homeDir = createTempHome();
  const fakeStore: SecretStore = {
    kind: "file",
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  };
  let getUpdatesCalls = 0;
  const fakeClient: TelegramClient = {
    async getUpdates() {
      getUpdatesCalls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [];
    },
    async sendMessage(params) {
      return { message_id: 1, chat: { id: Number(params.chat_id), type: "group" }, date: 1, text: params.text };
    },
    async getMe() {
      return { id: 555222333, is_bot: true, username: "roster_drift_bot" };
    },
    async getChat() {
      return { id: -1009876543212, type: "group" };
    },
  };

  const registryPath = join(homeDir, "registry.json");
  const registry: Registry = {
    registry_version: REGISTRY_VERSION,
    bots: [
      {
        bot_id: 555222333,
        username: "roster_drift_bot",
        token_ref: { store: "keychain", account: "bot:555222333" },
        added_at: "2026-09-01T00:00:00.000Z",
      },
    ],
    groups: [{ group_id: -1009876543212, added_at: "2026-09-01T00:00:00.000Z" }],
    projects: [{ project_id: "prj-roster-drift", path: homeDir }],
    bindings: [
      {
        project_id: "prj-roster-drift",
        bot_id: 555222333,
        group_id: -1009876543212,
        agent_id: "@drift-agent",
        status: "active",
        roster_snapshot: [{ agent_id: "@drift-agent", user_id: 555222333, username: "roster_drift_bot" }],
        roster_hash: ROSTER_HASH,
        bound_at: "2026-09-01T00:00:00.000Z",
      },
    ],
  };
  writeFileSync(registryPath, JSON.stringify(registry));
  const beforeTicksText = readFileSync(registryPath, "utf8");

  let daemon: Awaited<ReturnType<typeof startDaemon>> | undefined;
  try {
    daemon = await startDaemon({
      homeDir,
      secretStore: fakeStore,
      heartbeatPeriodMs: 15,
      telegramClientFactory: async () => fakeClient,
    });

    // Several heartbeat periods, so the reconcile-on-tick path (bootstrap.ts's `tick()`, which calls
    // `reconciler.reconcile()` -> `registry.sync()`, a read-only hot reload) runs more than once.
    await new Promise((resolve) => setTimeout(resolve, 90));

    // ADR-12's governing rule ("a documented guarantee must be pinned by a test that can fail"): without
    // this, a daemon that failed to start its heartbeat/poller at all would still pass every assertion
    // below, since an untouched registry.json looks identical to one no tick ever reached (RDD review
    // review-21eb25a2eb6f76f7, R3-heartbeat-test-vacuous). Mirrors the sibling PR-40a test's own
    // `getUpdatesCalls > 0` proof of real daemon activity.
    assert.ok(getUpdatesCalls > 0, "poller must have started and called getUpdates() at least once during the window");

    const afterTicksText = readFileSync(registryPath, "utf8");
    assert.equal(afterTicksText, beforeTicksText, "no heartbeat tick may write registry.json at all");

    const afterTicksRegistry = JSON.parse(afterTicksText) as Registry;
    assert.equal(afterTicksRegistry.bindings[0]?.roster_hash, ROSTER_HASH);
    assert.deepEqual(
      afterTicksRegistry.bindings[0]?.roster_snapshot,
      registry.bindings[0]?.roster_snapshot,
      "roster_snapshot must survive every heartbeat tick unchanged: only a human sync-roster invocation may change it",
    );
  } finally {
    await daemon?.stop().catch(() => {});
    cleanupTempHome(homeDir);
  }
});
