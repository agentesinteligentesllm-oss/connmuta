import { test } from "node:test";
import assert from "node:assert/strict";

import { synthesizeMigration } from "../../src/migration/synthesize.js";
import type { V1Config } from "../../src/migration/v1-config.js";
import type { V1State, V1ThreadRecord } from "../../src/migration/v1-state.js";
import { REGISTRY_VERSION } from "../../src/shared/constants.js";
import { parseRegistryDocument, type RegistryTokenRef } from "../../src/registry/schema.js";
import { computeRosterHash } from "../../src/shared/roster-hash.js";

/** A fixture bot id — the numeric `user_id` v1's own roster carries for the migrating agent. */
const BOT_ID = 555000001;

/** A fixture keychain token ref, as `migration/main.ts` would resolve it before calling `synthesizeMigration`. */
const TOKEN_REF: RegistryTokenRef = { store: "keychain", account: `bot:${BOT_ID}` };

/** A fixed instant, so every `added_at`/`bound_at` assertion is exact rather than a freshness check. */
const NOW_ISO = "2026-01-01T00:00:00.000Z";

/** A minimal, schema-valid v1 `config.json`, in its already-parsed `V1Config` shape. Placeholder identifiers only (AGENTS.md §3). */
function baseConfig(overrides: Partial<V1Config> = {}): V1Config {
  return {
    agent_id: "@agent-placeholder-a",
    bot_username: "placeholder_bot",
    chat_id: -1001111111111,
    reminder_window_hours: 24,
    secret_markers: [],
    roster: {
      "@agent-placeholder-a": { username: "placeholder_a", user_id: BOT_ID },
      "@agent-placeholder-b": { username: "placeholder_b", user_id: 222222 },
    },
    ...overrides,
  };
}

/** A fully-shaped v1 thread record (current version, no migration needed). Placeholder identifiers only. */
function fullV1Thread(overrides: Partial<V1ThreadRecord> = {}): V1ThreadRecord {
  return {
    status: "open",
    opened_type: "REQUEST",
    opened_eid: "eid-placeholder-1",
    from: "@agent-placeholder-a",
    to: "@agent-placeholder-b",
    body: "placeholder body",
    opened_at: "2026-01-01T00:00:00.000Z",
    opened_message_id: 1,
    via: "direct",
    acked_at: null,
    ack_count: 0,
    resolved_at: null,
    resolved_by: null,
    basis: null,
    first_surfaced_at: "2026-01-01T00:05:00.000Z",
    to_user_id: 222222,
    group_message_id: null,
    closure_delivered: false,
    awaiting: "@agent-placeholder-b",
    history: [
      {
        eid: "eid-placeholder-2",
        type: "ACK",
        from: "@agent-placeholder-b",
        body: "",
        at: "2026-01-01T00:06:00.000Z",
        via: "direct",
      },
    ],
    ...overrides,
  };
}

/** A minimal, schema-valid v1 `state.json`, in its already-parsed `V1State` shape. */
function baseState(threads: Record<string, V1ThreadRecord> = {}): V1State {
  return {
    state_version: 2,
    next_update_id: 42,
    last_fetch_at: null,
    last_checkpoint: { at: "2026-01-01T00:10:00.000Z", by: "@agent-placeholder-a" },
    seen_eids: {},
    threads,
    last_surfaced_digest: null,
    conditions: { group_outage: null, state_quarantined: null, open_thread_backlog: null },
  };
}

// --- Headline: project args omitted ⇒ empty projects[]/bindings[]/no binding_state row, no threads ---

test("synthesizeMigration without project args produces empty projects/bindings/binding_state and no threads", () => {
  const config = baseConfig();
  const state = baseState({ "thread-1": fullV1Thread() });

  const result = synthesizeMigration({ config, state, botId: BOT_ID, tokenRef: TOKEN_REF, nowIso: NOW_ISO });

  assert.deepEqual(result.projects, []);
  assert.deepEqual(result.bindings, []);
  assert.deepEqual(result.threads, []);
  assert.equal(result.bindingState, undefined);
});

// --- Project args supplied ⇒ exactly one project + one active binding, consistent (R1-R3 by inspection) ---

test("synthesizeMigration with project args produces exactly one project and one active binding satisfying R1-R3", () => {
  const config = baseConfig();
  const state = baseState({ "thread-1": fullV1Thread() });

  const result = synthesizeMigration({
    config,
    state,
    botId: BOT_ID,
    tokenRef: TOKEN_REF,
    nowIso: NOW_ISO,
    project: { projectId: "prj-example", projectPath: "/abs/path/to/project" },
  });

  assert.equal(result.projects.length, 1);
  assert.equal(result.bindings.length, 1);
  const [project] = result.projects;
  const [binding] = result.bindings;

  assert.equal(project.project_id, "prj-example");
  assert.equal(project.path, "/abs/path/to/project");

  assert.equal(binding.project_id, "prj-example");
  assert.equal(binding.bot_id, BOT_ID);
  assert.equal(binding.group_id, config.chat_id);
  assert.equal(binding.agent_id, config.agent_id);
  assert.equal(binding.status, "active");
  assert.equal(binding.bound_at, NOW_ISO);
  assert.ok(
    binding.roster_snapshot.some((entry) => entry.agent_id === config.agent_id && entry.user_id === BOT_ID),
    "the binding's own roster_snapshot must carry the migrating agent at the migrating bot_id (R3)",
  );
  assert.equal(
    binding.roster_hash,
    computeRosterHash(binding.roster_snapshot),
    "roster_hash must be computed over the actual roster_snapshot, not a stand-in value",
  );
  assert.notEqual(
    binding.roster_hash,
    computeRosterHash([]),
    "a two-entry v1 roster must not hash the same as an empty one",
  );

  assert.equal(result.bindingState?.project_id, "prj-example");
  assert.equal(result.bindingState?.last_checkpoint_at, "2026-01-01T00:10:00.000Z");
  assert.equal(result.bindingState?.last_checkpoint_by, "@agent-placeholder-a");

  // R1-R3 "by inspection": run the assembled registry through the real schema+invariants.
  const registry = {
    registry_version: REGISTRY_VERSION,
    bots: result.bots,
    groups: result.groups,
    projects: result.projects,
    bindings: result.bindings,
  };
  const validated = parseRegistryDocument(registry);
  assert.equal(validated.ok, true, validated.ok ? "" : JSON.stringify(validated.problems));
});

test("synthesizeMigration with no last_checkpoint still writes a binding_state row, with null checkpoint fields", () => {
  const config = baseConfig();
  const state = { ...baseState(), last_checkpoint: null };

  const result = synthesizeMigration({
    config,
    state,
    botId: BOT_ID,
    tokenRef: TOKEN_REF,
    nowIso: NOW_ISO,
    project: { projectId: "prj-example", projectPath: "/abs/path/to/project" },
  });

  assert.deepEqual(result.bindingState, {
    project_id: "prj-example",
    last_checkpoint_at: null,
    last_checkpoint_by: null,
  });
});

// --- bots[]/groups[] always populated, regardless of project args ---

test("synthesizeMigration always populates bots[] and groups[] from the v1 config", () => {
  const config = baseConfig();
  const state = baseState();

  const withoutProject = synthesizeMigration({ config, state, botId: BOT_ID, tokenRef: TOKEN_REF, nowIso: NOW_ISO });
  const withProject = synthesizeMigration({
    config,
    state,
    botId: BOT_ID,
    tokenRef: TOKEN_REF,
    nowIso: NOW_ISO,
    project: { projectId: "prj-example", projectPath: "/abs/path" },
  });

  for (const result of [withoutProject, withProject]) {
    assert.equal(result.bots.length, 1);
    assert.equal(result.bots[0].bot_id, BOT_ID);
    assert.equal(result.bots[0].username, config.bot_username);
    assert.equal(result.bots[0].added_at, NOW_ISO);

    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].group_id, config.chat_id);
    assert.equal(result.groups[0].added_at, NOW_ISO);
  }
});

// --- Token passthrough ---

test("synthesizeMigration passes the given token_ref through to the bot entry unchanged", () => {
  const config = baseConfig();
  const state = baseState();
  const fileTokenRef: RegistryTokenRef = { store: "file", path: "/home/placeholder/.conmuta/secrets/555000001.token" };

  const result = synthesizeMigration({ config, state, botId: BOT_ID, tokenRef: fileTokenRef, nowIso: NOW_ISO });

  assert.deepEqual(result.bots[0].token_ref, fileTokenRef);
});

// --- offsets row: next_update_id copied verbatim ---

test("synthesizeMigration copies next_update_id verbatim into the offset row", () => {
  const config = baseConfig();
  const state = baseState();

  const result = synthesizeMigration({ config, state, botId: BOT_ID, tokenRef: TOKEN_REF, nowIso: NOW_ISO });

  assert.deepEqual(result.offset, { bot_id: BOT_ID, next_update_id: state.next_update_id });
});

// --- Thread mapping: V1ThreadRecord -> ThreadRecord, first_surfaced_at dropped, to_user_id preserved ---

test("synthesizeMigration maps a v1 thread into a ThreadRecord, dropping first_surfaced_at and preserving to_user_id", () => {
  const config = baseConfig();
  const v1Thread = fullV1Thread({ to_user_id: 222222, first_surfaced_at: "2026-01-01T00:05:00.000Z" });
  const state = baseState({ "thread-1": v1Thread });

  const result = synthesizeMigration({
    config,
    state,
    botId: BOT_ID,
    tokenRef: TOKEN_REF,
    nowIso: NOW_ISO,
    project: { projectId: "prj-example", projectPath: "/abs/path" },
  });

  assert.equal(result.threads.length, 1);
  const [thread] = result.threads;
  assert.equal(thread.project_id, "prj-example");
  assert.equal(thread.thread_id, "thread-1");
  assert.equal(
    Object.prototype.hasOwnProperty.call(thread.record, "first_surfaced_at"),
    false,
    "ThreadRecord has no first_surfaced_at field; it must not survive the mapping",
  );
  assert.equal(thread.record.status, v1Thread.status);
  assert.equal(thread.record.opened_type, v1Thread.opened_type);
  assert.equal(thread.record.opened_eid, v1Thread.opened_eid);
  assert.equal(thread.record.from, v1Thread.from);
  assert.equal(thread.record.to, v1Thread.to);
  assert.equal(thread.record.to_user_id, 222222, "to_user_id was already backfilled by loadV1State and must be preserved as-is");
  assert.equal(thread.record.body, v1Thread.body);
  assert.equal(thread.record.opened_at, v1Thread.opened_at);
  assert.equal(thread.record.opened_message_id, v1Thread.opened_message_id);
  assert.equal(thread.record.via, v1Thread.via);
  assert.equal(thread.record.acked_at, v1Thread.acked_at);
  assert.equal(thread.record.ack_count, v1Thread.ack_count);
  assert.equal(thread.record.resolved_at, v1Thread.resolved_at);
  assert.equal(thread.record.resolved_by, v1Thread.resolved_by);
  assert.equal(thread.record.basis, v1Thread.basis);
  assert.equal(thread.record.group_message_id, v1Thread.group_message_id);
  assert.equal(thread.record.closure_delivered, v1Thread.closure_delivered);
  assert.equal(thread.record.awaiting, v1Thread.awaiting);
  assert.deepEqual(thread.record.history, v1Thread.history);
});

test("synthesizeMigration maps every thread in v1 state's threads map when a project is given", () => {
  const config = baseConfig();
  const state = baseState({
    "thread-1": fullV1Thread({ opened_eid: "eid-a" }),
    "thread-2": fullV1Thread({ opened_eid: "eid-b", status: "resolved" }),
  });

  const result = synthesizeMigration({
    config,
    state,
    botId: BOT_ID,
    tokenRef: TOKEN_REF,
    nowIso: NOW_ISO,
    project: { projectId: "prj-example", projectPath: "/abs/path" },
  });

  assert.equal(result.threads.length, 2);
  const ids = result.threads.map((t) => t.thread_id).sort();
  assert.deepEqual(ids, ["thread-1", "thread-2"]);
});
