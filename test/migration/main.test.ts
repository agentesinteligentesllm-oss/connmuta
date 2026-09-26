import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { runMigration } from "../../src/migration/main.js";
import { EXIT_MIGRATION_REFUSED, REGISTRY_VERSION } from "../../src/shared/constants.js";
import type { SecretStore } from "../../src/secret-store/types.js";
import type { SecretStoreSelection } from "../../src/secret-store/index.js";

/** A fresh temp v1 home and v2 home pair; both removed when `operation` returns. */
async function withTempDirs(operation: (v1Home: string, v2Home: string) => void | Promise<void>): Promise<void> {
  const v1Home = mkdtempSync(join(tmpdir(), "conmuta-migrate-v1-"));
  const v2Home = mkdtempSync(join(tmpdir(), "conmuta-migrate-v2-"));
  try {
    await operation(v1Home, v2Home);
  } finally {
    rmSync(v1Home, { recursive: true, force: true });
    rmSync(v2Home, { recursive: true, force: true });
  }
}

/** Writes a minimal, schema-valid v1 `config.json` (and, unless suppressed, `state.json`) into `v1Home`. */
function writeV1Fixture(
  v1Home: string,
  overrides: { config?: Record<string, unknown>; state?: Record<string, unknown> | null } = {},
): void {
  const config = {
    agent_id: "@agent-placeholder-a",
    bot_username: "placeholder_bot",
    chat_id: -1001111111111,
    roster: {
      "@agent-placeholder-a": { username: "placeholder_a", user_id: 555000001 },
      "@agent-placeholder-b": { username: "placeholder_b", user_id: 222222 },
    },
    ...overrides.config,
  };
  writeFileSync(join(v1Home, "config.json"), JSON.stringify(config), "utf8");

  if (overrides.state !== null) {
    const state = {
      state_version: 2,
      next_update_id: 7,
      last_fetch_at: null,
      last_checkpoint: null,
      seen_eids: {},
      threads: {},
      last_surfaced_digest: null,
      conditions: { group_outage: null, state_quarantined: null, open_thread_backlog: null },
      ...overrides.state,
    };
    writeFileSync(join(v1Home, "state.json"), JSON.stringify(state), "utf8");
  }
}

/** An in-memory `SecretStore` stand-in, so no test ever touches the real OS keychain. */
function fakeSecretStore(): {
  impl: () => Promise<SecretStoreSelection>;
  calls: Array<{ botId: string; token: string }>;
} {
  const tokens = new Map<string, string>();
  const calls: Array<{ botId: string; token: string }> = [];
  const store: SecretStore = {
    kind: "file",
    async get(botId) {
      return tokens.get(botId) ?? null;
    },
    async set(botId, token) {
      tokens.set(botId, token);
      calls.push({ botId, token });
    },
    async delete(botId) {
      tokens.delete(botId);
    },
  };
  return { impl: async () => ({ store }), calls };
}

const FIXED_NOW = () => new Date("2026-03-15T12:00:00.000Z");

// --- Headline: no token available anywhere, and the env is never consulted (D-24) ---

test("runMigration refuses with EXIT_MIGRATION_REFUSED when no token is available, and never reads a bot-token env var", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home);
    const secretStore = fakeSecretStore();
    const errs: string[] = [];
    const previousEnvVar = process.env.AGENTBUS_BOT_TOKEN;
    process.env.AGENTBUS_BOT_TOKEN = "placeholder-env-token-must-never-be-read";

    try {
      const result = await runMigration({
        v1Home,
        v2Home,
        now: FIXED_NOW,
        selectSecretStoreImpl: secretStore.impl,
        stderr: (line) => errs.push(line),
      });

      assert.equal(result.exitCode, EXIT_MIGRATION_REFUSED);
      assert.equal(secretStore.calls.length, 0, "no token means no secret-store write");
      assert.deepEqual(readdirSync(v2Home), [], "a refused migration must write nothing under v2Home");
      assert.ok(errs.length > 0);
    } finally {
      if (previousEnvVar === undefined) {
        delete process.env.AGENTBUS_BOT_TOKEN;
      } else {
        process.env.AGENTBUS_BOT_TOKEN = previousEnvVar;
      }
    }
  });
});

// --- Unreadable/invalid v1 config or state: thin pass-through refusals ---

test("runMigration refuses when v1 config.json is missing", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    const secretStore = fakeSecretStore();
    const result = await runMigration({ v1Home, v2Home, now: FIXED_NOW, selectSecretStoreImpl: secretStore.impl });
    assert.equal(result.exitCode, EXIT_MIGRATION_REFUSED);
    assert.equal(secretStore.calls.length, 0);
  });
});

test("runMigration refuses when v1 state.json is invalid JSON", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { bot_token: "placeholder-v1-bot-token" }, state: null });
    writeFileSync(join(v1Home, "state.json"), "{not valid json", "utf8");
    const secretStore = fakeSecretStore();

    const result = await runMigration({ v1Home, v2Home, now: FIXED_NOW, selectSecretStoreImpl: secretStore.impl });

    assert.equal(result.exitCode, EXIT_MIGRATION_REFUSED);
    assert.equal(secretStore.calls.length, 0);
  });
});

// --- agent_id absent from its own roster (v1 doctor rule) ---

test("runMigration refuses when agent_id is not present in its own roster", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { agent_id: "agent-not-in-roster", bot_token: "placeholder-v1-bot-token" } });
    const secretStore = fakeSecretStore();

    const result = await runMigration({ v1Home, v2Home, now: FIXED_NOW, selectSecretStoreImpl: secretStore.impl });

    assert.equal(result.exitCode, EXIT_MIGRATION_REFUSED);
    assert.equal(secretStore.calls.length, 0);
  });
});

// --- Token resolution ---

test("runMigration succeeds using config.bot_token, and writes only bots/groups when no project args are given", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { bot_token: "placeholder-v1-bot-token" } });
    const secretStore = fakeSecretStore();
    const outs: string[] = [];

    const result = await runMigration({
      v1Home,
      v2Home,
      now: FIXED_NOW,
      selectSecretStoreImpl: secretStore.impl,
      stdout: (line) => outs.push(line),
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(secretStore.calls, [{ botId: "555000001", token: "placeholder-v1-bot-token" }]);

    const registry = JSON.parse(readFileSync(join(v2Home, "registry.json"), "utf8")) as {
      registry_version: number;
      bots: readonly { bot_id: number }[];
      groups: readonly unknown[];
      projects: readonly unknown[];
      bindings: readonly unknown[];
    };
    assert.equal(registry.registry_version, REGISTRY_VERSION);
    assert.equal(registry.bots.length, 1);
    assert.equal(registry.bots[0].bot_id, 555000001);
    assert.equal(registry.groups.length, 1);
    assert.deepEqual(registry.projects, []);
    assert.deepEqual(registry.bindings, []);
    assert.equal(
      outs.some((line) => line.includes('"schema_version"')),
      false,
      "no project was assigned, so no proposed conmuta.json should be printed",
    );

    const db = new DatabaseSync(join(v2Home, "ledger.db"));
    try {
      const row = db.prepare("SELECT next_update_id FROM offsets WHERE bot_id = ?").get(555000001) as
        | { next_update_id: number }
        | undefined;
      assert.equal(row?.next_update_id, 7);
    } finally {
      db.close();
    }
  });
});

test("runMigration reads the token from stdin when --token-stdin is given and config has no bot_token", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home);
    const secretStore = fakeSecretStore();

    const result = await runMigration({
      v1Home,
      v2Home,
      now: FIXED_NOW,
      tokenStdin: true,
      readStdinToken: () => "placeholder-stdin-token\n",
      selectSecretStoreImpl: secretStore.impl,
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(secretStore.calls, [{ botId: "555000001", token: "placeholder-stdin-token" }]);
  });
});

test("runMigration refuses when --token-stdin is given but stdin is empty", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home);
    const secretStore = fakeSecretStore();

    const result = await runMigration({
      v1Home,
      v2Home,
      now: FIXED_NOW,
      tokenStdin: true,
      readStdinToken: () => "   \n",
      selectSecretStoreImpl: secretStore.impl,
    });

    assert.equal(result.exitCode, EXIT_MIGRATION_REFUSED);
    assert.equal(secretStore.calls.length, 0);
  });
});

// --- Backups: byte-identical copies, originals untouched ---

test("runMigration copies config.json and state.json to dated backups, byte-identical, and leaves the originals untouched", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { bot_token: "placeholder-v1-bot-token" } });
    const originalConfig = readFileSync(join(v1Home, "config.json"));
    const originalState = readFileSync(join(v1Home, "state.json"));
    const secretStore = fakeSecretStore();

    const result = await runMigration({ v1Home, v2Home, now: FIXED_NOW, selectSecretStoreImpl: secretStore.impl });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(readFileSync(join(v1Home, "config.json")), originalConfig, "the original config.json must be untouched");
    assert.deepEqual(readFileSync(join(v1Home, "state.json")), originalState, "the original state.json must be untouched");
    assert.deepEqual(readFileSync(join(v1Home, "config.json.bak-pre-v2-20260315")), originalConfig);
    assert.deepEqual(readFileSync(join(v1Home, "state.json.bak-pre-v2-20260315")), originalState);
  });
});

test("runMigration does not attempt to back up a state.json that does not exist in v1", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { bot_token: "placeholder-v1-bot-token" }, state: null });
    const secretStore = fakeSecretStore();

    const result = await runMigration({ v1Home, v2Home, now: FIXED_NOW, selectSecretStoreImpl: secretStore.impl });

    assert.equal(result.exitCode, 0);
    assert.equal(
      readdirSync(v1Home).some((name) => name.startsWith("state.json.bak-pre-v2-")),
      false,
    );
  });
});

// --- Already-migrated idempotency ---

test("running migrate-v1 twice against the same pair is idempotent: the second run exits 0 and writes nothing new", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { bot_token: "placeholder-v1-bot-token" } });

    const first = await runMigration({ v1Home, v2Home, now: FIXED_NOW, selectSecretStoreImpl: fakeSecretStore().impl });
    assert.equal(first.exitCode, 0);
    const registryAfterFirst = readFileSync(join(v2Home, "registry.json"), "utf8");

    const secondStore = fakeSecretStore();
    const outs: string[] = [];
    const second = await runMigration({
      v1Home,
      v2Home,
      now: FIXED_NOW,
      selectSecretStoreImpl: secondStore.impl,
      stdout: (line) => outs.push(line),
    });

    assert.equal(second.exitCode, 0);
    assert.equal(secondStore.calls.length, 0, "the second run must not call secretStore.set again");
    assert.equal(
      readFileSync(join(v2Home, "registry.json"), "utf8"),
      registryAfterFirst,
      "registry.json must not change on the second run",
    );
    assert.ok(outs.some((line) => /already migrated/i.test(line)));
  });
});

test("running migrate-v1 twice is still idempotent when v1's state.json never existed (no state backup is ever created)", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { bot_token: "placeholder-v1-bot-token" }, state: null });

    const first = await runMigration({ v1Home, v2Home, now: FIXED_NOW, selectSecretStoreImpl: fakeSecretStore().impl });
    assert.equal(first.exitCode, 0);

    const secondStore = fakeSecretStore();
    const outs: string[] = [];
    const second = await runMigration({
      v1Home,
      v2Home,
      now: FIXED_NOW,
      selectSecretStoreImpl: secondStore.impl,
      stdout: (line) => outs.push(line),
    });

    assert.equal(second.exitCode, 0);
    assert.equal(secondStore.calls.length, 0, "the second run must recognize the already-migrated state, not treat it as a fresh conflict");
    assert.ok(outs.some((line) => /already migrated/i.test(line)));
  });
});

// --- --dry-run: no writes, informational report ---

test("runMigration --dry-run writes nothing and reports what would happen", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { bot_token: "placeholder-v1-bot-token" } });
    const secretStore = fakeSecretStore();
    const outs: string[] = [];

    const result = await runMigration({
      v1Home,
      v2Home,
      now: FIXED_NOW,
      dryRun: true,
      selectSecretStoreImpl: secretStore.impl,
      stdout: (line) => outs.push(line),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(secretStore.calls.length, 0);
    assert.deepEqual(
      readdirSync(v1Home).filter((name) => name.includes(".bak-pre-v2-")),
      [],
      "dry-run must not create backups",
    );
    assert.deepEqual(readdirSync(v2Home), [], "dry-run must not write under v2Home");
    assert.ok(outs.some((line) => /dry run/i.test(line)));
  });
});

// --- Full success path with project args ---

test("runMigration with project args writes registry.json, the token, and ledger rows, and prints a proposed conmuta.json", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, {
      config: { bot_token: "placeholder-v1-bot-token" },
      state: {
        threads: {
          "thread-1": {
            status: "open",
            opened_type: "REQUEST",
            opened_eid: "eid-1",
            from: "@agent-placeholder-a",
            to: "@agent-placeholder-b",
            body: "hi",
            opened_at: "2026-01-01T00:00:00.000Z",
            opened_message_id: 1,
            via: "direct",
            acked_at: null,
            ack_count: 0,
            resolved_at: null,
            resolved_by: null,
            basis: null,
            first_surfaced_at: null,
            to_user_id: 222222,
            group_message_id: null,
            closure_delivered: false,
            awaiting: "@agent-placeholder-b",
            history: [],
          },
        },
      },
    });
    const secretStore = fakeSecretStore();
    const outs: string[] = [];

    const result = await runMigration({
      v1Home,
      v2Home,
      now: FIXED_NOW,
      projectId: "prj-example",
      projectPath: "/abs/path/to/project",
      selectSecretStoreImpl: secretStore.impl,
      stdout: (line) => outs.push(line),
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(secretStore.calls, [{ botId: "555000001", token: "placeholder-v1-bot-token" }]);

    const registry = JSON.parse(readFileSync(join(v2Home, "registry.json"), "utf8")) as {
      projects: readonly { project_id: string }[];
      bindings: readonly { project_id: string }[];
    };
    assert.equal(registry.projects.length, 1);
    assert.equal(registry.bindings.length, 1);
    assert.equal(registry.bindings[0].project_id, "prj-example");

    const db = new DatabaseSync(join(v2Home, "ledger.db"));
    try {
      const thread = db.prepare("SELECT * FROM threads WHERE project_id = ? AND thread_id = ?").get("prj-example", "thread-1");
      assert.ok(thread, "expected the migrated thread row to be readable back");
      const bindingState = db.prepare("SELECT * FROM binding_state WHERE project_id = ?").get("prj-example");
      assert.ok(bindingState, "expected a binding_state row for the assigned project");
      const offset = db.prepare("SELECT next_update_id FROM offsets WHERE bot_id = ?").get(555000001) as
        | { next_update_id: number }
        | undefined;
      assert.equal(offset?.next_update_id, 7);
    } finally {
      db.close();
    }

    assert.ok(outs.some((line) => line.includes("prj-example")));
    assert.ok(outs.some((line) => line.includes('"schema_version"')), "expected the proposed conmuta.json to be printed");
  });
});

// --- Existing v2 registry: conflict refusal vs. validation refusal ---

test("runMigration refuses when the bot is already in the v2 registry but no matching backup exists, rather than risk a duplicate", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { bot_token: "placeholder-v1-bot-token" } });
    const existingRegistry = {
      registry_version: REGISTRY_VERSION,
      bots: [{ bot_id: 555000001, username: "placeholder_bot", token_ref: { store: "file", path: "/placeholder/token" }, added_at: "2026-01-01T00:00:00.000Z" }],
      groups: [],
      projects: [],
      bindings: [],
    };
    writeFileSync(join(v2Home, "registry.json"), JSON.stringify(existingRegistry), "utf8");
    const secretStore = fakeSecretStore();

    const result = await runMigration({ v1Home, v2Home, now: FIXED_NOW, selectSecretStoreImpl: secretStore.impl });

    assert.equal(result.exitCode, EXIT_MIGRATION_REFUSED);
    assert.equal(secretStore.calls.length, 0, "a refused conflict must not touch the secret store");
    assert.equal(
      readFileSync(join(v2Home, "registry.json"), "utf8"),
      JSON.stringify(existingRegistry),
      "the existing registry.json must be left byte-identical on a conflict refusal",
    );
    assert.equal(
      readdirSync(v1Home).some((name) => name.includes(".bak-pre-v2-")),
      false,
      "a conflict refusal must not create backups either",
    );
  });
});

test("runMigration refuses rather than merge into an existing v2 registry.json that fails validation", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { bot_token: "placeholder-v1-bot-token" } });
    const corruptRegistry = '{"registry_version": 1, "bots": "not-an-array"}';
    writeFileSync(join(v2Home, "registry.json"), corruptRegistry, "utf8");
    const secretStore = fakeSecretStore();

    const result = await runMigration({ v1Home, v2Home, now: FIXED_NOW, selectSecretStoreImpl: secretStore.impl });

    assert.equal(result.exitCode, EXIT_MIGRATION_REFUSED);
    assert.equal(secretStore.calls.length, 0);
    assert.equal(
      readFileSync(join(v2Home, "registry.json"), "utf8"),
      corruptRegistry,
      "a refused merge must never overwrite the unreadable existing registry",
    );
  });
});

test("runMigration refuses when --project-id is given without --project-path", async () => {
  await withTempDirs(async (v1Home, v2Home) => {
    writeV1Fixture(v1Home, { config: { bot_token: "placeholder-v1-bot-token" } });
    const secretStore = fakeSecretStore();

    const result = await runMigration({
      v1Home,
      v2Home,
      now: FIXED_NOW,
      projectId: "prj-example",
      selectSecretStoreImpl: secretStore.impl,
    });

    assert.equal(result.exitCode, EXIT_MIGRATION_REFUSED);
    assert.equal(secretStore.calls.length, 0);
  });
});
