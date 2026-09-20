import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { LEDGER_SCHEMA_DDL } from "../../src/ledger/schema.js";
import { REGISTRY_VERSION } from "../../src/shared/constants.js";
import type { Registry, RegistryBinding, RegistryBot } from "../../src/registry/schema.js";
import type { RegistryLoader, RegistrySyncResult } from "../../src/registry/loader.js";
import type { TelegramClient } from "../../src/daemon/telegram.js";
import { RoomGuardClient } from "../../src/daemon/transport/room-guard.js";
import { DualWriteTransport } from "../../src/daemon/transport/dual.js";
import {
  BindingsReconciler,
  type ManagedBinding,
  type PollerHandle,
} from "../../src/daemon/bindings.js";

function createTestDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(LEDGER_SCHEMA_DDL);
  return db;
}

describe("BindingsReconciler (registry hot-reload, poller lifecycle, BINDING_CHANGED audit)", () => {
  const sampleBot: RegistryBot = {
    bot_id: 1234567,
    username: "test_bot",
    token_ref: { store: "keychain", account: "bot:1234567" },
    added_at: "2026-09-01T00:00:00.000Z",
  };

  const sampleBinding: RegistryBinding = {
    project_id: "prj-alpha",
    bot_id: 1234567,
    group_id: -1001234567890,
    agent_id: "@alpha-agent",
    status: "active",
    roster_snapshot: [
      { agent_id: "@alpha-agent", user_id: 1234567, username: "test_bot" },
      { agent_id: "@beta-agent", user_id: 7654321, username: "beta_bot" },
    ],
    roster_hash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    bound_at: "2026-09-01T00:00:00.000Z",
  };

  const baseRegistry: Registry = {
    registry_version: REGISTRY_VERSION,
    bots: [sampleBot],
    groups: [{ group_id: -1001234567890, title: "Alpha Group", added_at: "2026-09-01T00:00:00.000Z" }],
    projects: [{ project_id: "prj-alpha", path: "/tmp/prj-alpha" }],
    bindings: [sampleBinding],
  };

  it("starts poller for new active binding and records BINDING_CHANGED audit row", async () => {
    const db = createTestDatabase();
    let pollerStarted = false;

    const reconciler = new BindingsReconciler({
      db,
      createPoller: async () => {
        pollerStarted = true;
        return {
          stop: async () => {
            pollerStarted = false;
          },
        };
      },
    });

    const result = await reconciler.reconcile(baseRegistry);

    assert.equal(result.changed, true);
    assert.equal(result.added.length, 1);
    assert.equal(result.added[0].project_id, "prj-alpha");
    assert.equal(pollerStarted, true);

    const managed = reconciler.getBinding("prj-alpha");
    assert(managed !== undefined);
    assert.equal(managed.binding.project_id, "prj-alpha");
    assert.equal(managed.config.agent_id, "@alpha-agent");

    // Check audit row
    const auditRows = db.prepare("SELECT * FROM audit_log WHERE reason = 'BINDING_CHANGED'").all() as Record<string, unknown>[];
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].project_id, "prj-alpha");
    assert.equal(auditRows[0].bot_id, 1234567);
    assert.equal(auditRows[0].chat_id, -1001234567890);
    assert.equal(auditRows[0].direction, "system");
    assert.equal(auditRows[0].outcome, "ok");
  });

  it("stops poller when binding is removed or marked suspended and records BINDING_CHANGED audit row", async () => {
    const db = createTestDatabase();
    let pollerStopped = false;

    const reconciler = new BindingsReconciler({
      db,
      createPoller: async () => ({
        stop: async () => {
          pollerStopped = true;
        },
      }),
    });

    // 1. Initial active binding
    await reconciler.reconcile(baseRegistry);
    assert.equal(reconciler.getActiveBindings().length, 1);

    // 2. Binding becomes suspended
    const suspendedRegistry: Registry = {
      ...baseRegistry,
      bindings: [{ ...sampleBinding, status: "suspended" }],
    };

    const result = await reconciler.reconcile(suspendedRegistry);

    assert.equal(result.changed, true);
    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].project_id, "prj-alpha");
    assert.equal(pollerStopped, true);
    assert.equal(reconciler.getActiveBindings().length, 0);

    // Audit log should now have 2 BINDING_CHANGED rows (one for start, one for stop)
    const auditRows = db.prepare("SELECT * FROM audit_log WHERE reason = 'BINDING_CHANGED'").all();
    assert.equal(auditRows.length, 2);
  });

  it("restarts poller and audits when an existing active binding configuration changes", async () => {
    const db = createTestDatabase();
    let stopCount = 0;
    let startCount = 0;

    const reconciler = new BindingsReconciler({
      db,
      createPoller: async () => {
        startCount += 1;
        return {
          stop: async () => {
            stopCount += 1;
          },
        };
      },
    });

    await reconciler.reconcile(baseRegistry);
    assert.equal(startCount, 1);
    assert.equal(stopCount, 0);

    // Change roster_hash on the binding
    const updatedRegistry: Registry = {
      ...baseRegistry,
      bindings: [
        {
          ...sampleBinding,
          roster_hash: "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        },
      ],
    };

    const result = await reconciler.reconcile(updatedRegistry);

    assert.equal(result.changed, true);
    assert.equal(result.updated.length, 1);
    assert.equal(stopCount, 1, "old poller must be stopped");
    assert.equal(startCount, 2, "new poller must be started");

    const auditRows = db.prepare("SELECT * FROM audit_log WHERE reason = 'BINDING_CHANGED'").all();
    assert.equal(auditRows.length, 2);
  });

  it("does nothing when active bindings are unchanged", async () => {
    const db = createTestDatabase();
    let startCount = 0;

    const reconciler = new BindingsReconciler({
      db,
      createPoller: async () => {
        startCount += 1;
        return { stop: async () => {} };
      },
    });

    await reconciler.reconcile(baseRegistry);
    assert.equal(startCount, 1);

    // Reconcile with identical registry
    const result = await reconciler.reconcile(baseRegistry);
    assert.equal(result.changed, false);
    assert.equal(result.added.length, 0);
    assert.equal(result.removed.length, 0);
    assert.equal(result.updated.length, 0);
    assert.equal(startCount, 1);

    const auditRows = db.prepare("SELECT * FROM audit_log WHERE reason = 'BINDING_CHANGED'").all();
    assert.equal(auditRows.length, 1);
  });

  it("consumes RegistryLoader and preserves existing bindings when registry is invalid (ADR-0030)", async () => {
    const db = createTestDatabase();
    let syncState: RegistrySyncResult = { status: "loaded", registry: baseRegistry };

    const mockLoader: RegistryLoader = {
      path: "/mock/registry.json",
      current: () => (syncState.status === "loaded" ? syncState.registry : baseRegistry),
      sync: () => syncState,
      condition: () => (syncState.status === "invalid" ? syncState.condition : undefined),
    };

    const reconciler = new BindingsReconciler({
      db,
      loader: mockLoader,
      createPoller: async () => ({ stop: async () => {} }),
    });

    await reconciler.reconcile();
    assert.equal(reconciler.getActiveBindings().length, 1);

    // Loader reports invalid registry (e.g. syntax error or schema issue)
    syncState = {
      status: "invalid",
      condition: "registry_invalid",
      problems: [{ kind: "invalid_json" }],
    };

    const result = await reconciler.reconcile();
    assert.equal(result.changed, false);
    assert.equal(reconciler.getActiveBindings().length, 1, "active bindings must be preserved");
  });

  it("stopAll() stops all running pollers and clears active bindings", async () => {
    let pollerStopped = false;

    const reconciler = new BindingsReconciler({
      createPoller: async () => ({
        stop: async () => {
          pollerStopped = true;
        },
      }),
    });

    await reconciler.reconcile(baseRegistry);
    assert.equal(reconciler.getActiveBindings().length, 1);

    await reconciler.stopAll();
    assert.equal(pollerStopped, true);
    assert.equal(reconciler.getActiveBindings().length, 0);
  });

  it("reconciles from loader.current() when loader was already synced before reconciler creation (JD-A-001)", async () => {
    const db = createTestDatabase();
    const mockLoader: RegistryLoader = {
      path: "/mock/registry.json",
      current: () => baseRegistry,
      sync: () => ({ status: "unchanged" }),
      condition: () => undefined,
    };

    const reconciler = new BindingsReconciler({
      db,
      loader: mockLoader,
      createPoller: async () => ({ stop: async () => {} }),
    });

    const result = await reconciler.reconcile();
    assert.equal(result.changed, true);
    assert.equal(result.added.length, 1);
    assert.equal(reconciler.getActiveBindings().length, 1);
  });

  it("returns unchanged when loader returns unchanged and active bindings already exist (JD-B-006)", async () => {
    const db = createTestDatabase();
    let currentCallCount = 0;
    let syncCallCount = 0;
    const mockLoader: RegistryLoader = {
      path: "/mock/registry.json",
      current: () => {
        currentCallCount++;
        return baseRegistry;
      },
      sync: () => {
        syncCallCount++;
        return syncCallCount === 1
          ? { status: "loaded", registry: baseRegistry }
          : { status: "unchanged" };
      },
      condition: () => undefined,
    };

    const reconciler = new BindingsReconciler({
      db,
      loader: mockLoader,
      createPoller: async () => ({ stop: async () => {} }),
    });

    // 1. Initial load
    const res1 = await reconciler.reconcile();
    assert.equal(res1.changed, true);
    assert.equal(reconciler.getActiveBindings().length, 1);
    const callsAfterFirst = currentCallCount;

    // 2. Second sync returns unchanged
    const res2 = await reconciler.reconcile();
    assert.equal(res2.changed, false);
    assert.equal(res2.added.length, 0);
    assert.equal(res2.updated.length, 0);
    assert.equal(res2.removed.length, 0);
    assert.equal(currentCallCount, callsAfterFirst, "current() should not be called when unchanged and bindings exist");
  });

  it("triggers update when roster username changes even if roster_hash is identical (JD-A-002)", async () => {
    const db = createTestDatabase();
    let stopCount = 0;
    let startCount = 0;

    const reconciler = new BindingsReconciler({
      db,
      createPoller: async () => {
        startCount++;
        return {
          stop: async () => {
            stopCount++;
          },
        };
      },
    });

    await reconciler.reconcile(baseRegistry);
    assert.equal(startCount, 1);
    assert.equal(stopCount, 0);

    // Keep the same roster_hash, but change a username in roster_snapshot
    const updatedRegistry: Registry = {
      ...baseRegistry,
      bindings: [
        {
          ...sampleBinding,
          roster_snapshot: [
            { agent_id: "@alpha-agent", user_id: 1234567, username: "new_test_bot" },
            { agent_id: "@beta-agent", user_id: 7654321, username: "beta_bot" },
          ],
        },
      ],
    };

    const result = await reconciler.reconcile(updatedRegistry);
    assert.equal(result.changed, true);
    assert.equal(result.updated.length, 1);
    assert.equal(stopCount, 1);
    assert.equal(startCount, 2);
    assert.equal(
      reconciler.getBinding("prj-alpha")?.config.roster["@alpha-agent"].username,
      "new_test_bot"
    );
  });

  it("triggers update when bot username changes (JD-B-001)", async () => {
    const db = createTestDatabase();
    let stopCount = 0;
    let startCount = 0;

    const reconciler = new BindingsReconciler({
      db,
      createPoller: async () => {
        startCount++;
        return {
          stop: async () => {
            stopCount++;
          },
        };
      },
    });

    await reconciler.reconcile(baseRegistry);
    assert.equal(startCount, 1);
    assert.equal(stopCount, 0);

    // Bot username changes in registry.bots
    const updatedRegistry: Registry = {
      ...baseRegistry,
      bots: [
        {
          ...sampleBot,
          username: "renamed_bot",
        },
      ],
    };

    const result = await reconciler.reconcile(updatedRegistry);
    assert.equal(result.changed, true);
    assert.equal(result.updated.length, 1);
    assert.equal(stopCount, 1);
    assert.equal(startCount, 2);
    assert.equal(
      reconciler.getBinding("prj-alpha")?.config.bot_username,
      "renamed_bot"
    );
  });

  it("buildTransport creates DualWriteTransport and RoomGuardClient when createTelegramClient is provided (JD-A-003, JD-B-002)", async () => {
    const fakeClient: TelegramClient = {
      async getUpdates() {
        return [];
      },
      async sendMessage() {
        return { message_id: 1, chat: { id: -1001234567890, type: "group" }, date: 1, text: "hi" };
      },
      async getMe() {
        return { id: 1234567, is_bot: true, username: "test_bot" };
      },
      async getChat() {
        return { id: -1001234567890, type: "group" };
      },
    };

    const reconciler = new BindingsReconciler({
      createTelegramClient: () => fakeClient,
    });

    await reconciler.reconcile(baseRegistry);
    const managed = reconciler.getBinding("prj-alpha");
    assert(managed !== undefined);
    assert(managed.transport instanceof DualWriteTransport);
    assert(managed.roomGuard instanceof RoomGuardClient);
  });

  it("buildTransport uses custom createTransport when provided (JD-A-003, JD-B-002)", async () => {
    const customTransport = {
      send: async () => ({
        group: { ok: true as const, message_id: 99 },
        direct: [],
        degraded: false,
      }),
    };

    const reconciler = new BindingsReconciler({
      createTransport: async () => ({
        transport: customTransport,
      }),
    });

    await reconciler.reconcile(baseRegistry);
    const managed = reconciler.getBinding("prj-alpha");
    assert(managed !== undefined);
    assert.equal(managed.transport, customTransport);
  });
});
