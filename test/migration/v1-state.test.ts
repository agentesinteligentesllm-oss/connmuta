import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadV1State } from "../../src/migration/v1-state.js";

/** A fresh temp v1 home; removed when `operation` returns. */
function withV1Home(operation: (homeDir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-v1-migration-state-"));
  try {
    operation(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A fully-shaped, current-version (`state_version: 2`) v1 thread record — schema-parses without
 * triggering `migrateToCurrent`. Placeholder identifiers only (AGENTS.md §3).
 */
function fullThreadRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "open",
    opened_type: "REQUEST",
    opened_eid: "eid-placeholder-1",
    from: "agent-placeholder-a",
    to: "agent-placeholder-b",
    body: "placeholder body",
    opened_at: "2026-01-01T00:00:00.000Z",
    opened_message_id: 1,
    via: "direct",
    acked_at: null,
    ack_count: 0,
    resolved_at: null,
    resolved_by: null,
    basis: null,
    first_surfaced_at: null,
    to_user_id: null,
    group_message_id: null,
    closure_delivered: false,
    awaiting: "agent-placeholder-b",
    history: [],
    ...overrides,
  };
}

function currentVersionState(threads: Record<string, unknown>): Record<string, unknown> {
  return {
    state_version: 2,
    next_update_id: 5,
    last_fetch_at: null,
    last_checkpoint: null,
    seen_eids: {},
    threads,
    last_surfaced_digest: null,
    conditions: { group_outage: null, state_quarantined: null, open_thread_backlog: null },
  };
}

/** Asserts `state.json` is byte-identical before/after `load`, and no sibling file was created. */
function assertFileUntouched(homeDir: string, load: () => void): void {
  const path = join(homeDir, "state.json");
  const before = readFileSync(path);
  load();
  assert.deepEqual(readFileSync(path), before, "state.json must be byte-identical after a refused load");
  assert.deepEqual(readdirSync(homeDir), ["state.json"], "no quarantine sibling file may be created");
}

// --- Missing state.json: default state, never a refusal, never a write ---

test("loadV1State returns ok:true with a default state when state.json is missing, and writes nothing", () => {
  withV1Home((homeDir) => {
    const result = loadV1State(homeDir);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.state.state_version, 2);
      assert.equal(result.state.next_update_id, 0);
      assert.equal(result.state.last_fetch_at, null);
      assert.deepEqual(result.state.seen_eids, {});
      assert.deepEqual(result.state.threads, {});
      assert.equal(result.state.last_surfaced_digest, null);
      assert.deepEqual(result.state.conditions, { group_outage: null, state_quarantined: null, open_thread_backlog: null });
    }
    assert.deepEqual(readdirSync(homeDir), [], "loadV1State must never create state.json on a first run");
  });
});

// --- I/O fault reading an EXISTING file: unreadable, never a quarantine ---

test("loadV1State returns an 'unreadable' refusal when state.json exists but cannot be read as a file", () => {
  withV1Home((homeDir) => {
    // A directory in state.json's place: existsSync is true, readFileSync throws EISDIR — the same
    // portable technique test/registry/loader.test.ts already uses to force an I/O fault on an
    // existing path without relying on OS permission bits.
    mkdirSync(join(homeDir, "state.json"));

    const result = loadV1State(homeDir);

    assert.deepEqual(result, { ok: false, refusal: { kind: "unreadable" } });
  });
});

// --- Valid state: version-1 migration derivations, BROADCAST dropped ---

test("loadV1State migrates a version-1 state: drops BROADCAST threads and derives awaiting/closure_delivered/group_message_id", () => {
  withV1Home((homeDir) => {
    const v1Threads = {
      "thread-open-direct": {
        status: "open",
        opened_type: "REQUEST",
        opened_eid: "eid-1",
        from: "agent-placeholder-a",
        to: "agent-placeholder-b",
        body: "open request",
        opened_at: "2026-01-01T00:00:00.000Z",
        opened_message_id: 10,
        via: "direct",
        acked_at: null,
        ack_count: 0,
        resolved_at: null,
        resolved_by: null,
        basis: null,
        history: [],
      },
      "thread-resolved-group": {
        status: "resolved",
        opened_type: "REQUEST",
        opened_eid: "eid-2",
        from: "agent-placeholder-b",
        to: "agent-placeholder-a",
        body: "resolved request",
        opened_at: "2026-01-01T00:00:00.000Z",
        opened_message_id: 20,
        via: "group",
        acked_at: "2026-01-01T00:05:00.000Z",
        ack_count: 1,
        resolved_at: "2026-01-01T00:10:00.000Z",
        resolved_by: "agent-placeholder-a",
        basis: "done",
        history: [],
      },
      "thread-broadcast": {
        status: "open",
        opened_type: "BROADCAST",
        opened_eid: "eid-3",
        from: "agent-placeholder-a",
        to: null,
        body: "broadcast",
        opened_at: "2026-01-01T00:00:00.000Z",
        opened_message_id: 30,
        via: "group",
        acked_at: null,
        ack_count: 0,
        resolved_at: null,
        resolved_by: null,
        basis: null,
        history: [],
      },
    };
    const raw = {
      next_update_id: 3,
      last_fetch_at: "2026-01-01T00:00:00.000Z",
      last_checkpoint: null,
      seen_eids: { "eid-1": "2026-01-01T00:00:00.000Z" },
      threads: v1Threads,
      last_surfaced_digest: null,
      conditions: {},
    };
    writeFileSync(join(homeDir, "state.json"), JSON.stringify(raw), "utf8");

    const result = loadV1State(homeDir);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.state_version, 2);
    assert.deepEqual(Object.keys(result.state.threads).sort(), ["thread-open-direct", "thread-resolved-group"]);

    const open = result.state.threads["thread-open-direct"];
    assert.ok(open);
    assert.equal(open.first_surfaced_at, null);
    assert.equal(open.to_user_id, null);
    assert.equal(open.group_message_id, null, "via 'direct' is not derived into a group_message_id");
    assert.equal(open.closure_delivered, false, "isOpen -> !isOpen");
    assert.equal(open.awaiting, "agent-placeholder-b", "isOpen -> thread.to");

    const resolved = result.state.threads["thread-resolved-group"];
    assert.ok(resolved);
    assert.equal(resolved.group_message_id, 20, "via 'group' -> opened_message_id");
    assert.equal(resolved.closure_delivered, true, "!isOpen");
    assert.equal(resolved.awaiting, null, "not open");
  });
});

// --- Hard errors: the quarantine-rename branch becomes a hard error (v1 files are never modified) ---

test("loadV1State returns an 'invalid_json' refusal and never touches the file", () => {
  withV1Home((homeDir) => {
    writeFileSync(join(homeDir, "state.json"), "{not valid json", "utf8");

    let result: Awaited<ReturnType<typeof loadV1State>> | undefined;
    assertFileUntouched(homeDir, () => {
      result = loadV1State(homeDir);
    });
    assert.deepEqual(result, { ok: false, refusal: { kind: "invalid_json" } });
  });
});

test("loadV1State returns a 'not_object' refusal for a JSON array and never touches the file", () => {
  withV1Home((homeDir) => {
    writeFileSync(join(homeDir, "state.json"), "[]", "utf8");

    let result: Awaited<ReturnType<typeof loadV1State>> | undefined;
    assertFileUntouched(homeDir, () => {
      result = loadV1State(homeDir);
    });
    assert.deepEqual(result, { ok: false, refusal: { kind: "not_object" } });
  });
});

test("loadV1State returns a 'future_version' refusal naming the found version, and never touches the file", () => {
  withV1Home((homeDir) => {
    const body = JSON.stringify(currentVersionState({})).replace('"state_version":2', '"state_version":999');
    writeFileSync(join(homeDir, "state.json"), body, "utf8");

    let result: Awaited<ReturnType<typeof loadV1State>> | undefined;
    assertFileUntouched(homeDir, () => {
      result = loadV1State(homeDir);
    });
    assert.deepEqual(result, { ok: false, refusal: { kind: "future_version", found: 999 } });
  });
});

test("loadV1State returns a 'schema_invalid' refusal after migration and never touches the file", () => {
  withV1Home((homeDir) => {
    const raw = { ...currentVersionState({}), next_update_id: "not-a-number" };
    writeFileSync(join(homeDir, "state.json"), JSON.stringify(raw), "utf8");

    let result: Awaited<ReturnType<typeof loadV1State>> | undefined;
    assertFileUntouched(homeDir, () => {
      result = loadV1State(homeDir);
    });
    assert.deepEqual(result, { ok: false, refusal: { kind: "schema_invalid" } });
  });
});

// --- to_user_id roster backfill (new in v2; v1 always left it null) ---

test("loadV1State backfills to_user_id from the roster when the thread's 'to' agent is present", () => {
  withV1Home((homeDir) => {
    const threads = { "thread-a": fullThreadRecord({ to: "agent-placeholder-b", to_user_id: null }) };
    writeFileSync(join(homeDir, "state.json"), JSON.stringify(currentVersionState(threads)), "utf8");

    const result = loadV1State(homeDir, { "agent-placeholder-b": { user_id: 222222 } });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.state.threads["thread-a"]?.to_user_id, 222222);
    }
  });
});

test("loadV1State leaves to_user_id null when the thread's 'to' agent is absent from the roster", () => {
  withV1Home((homeDir) => {
    const threads = { "thread-a": fullThreadRecord({ to: "agent-placeholder-unknown", to_user_id: null }) };
    writeFileSync(join(homeDir, "state.json"), JSON.stringify(currentVersionState(threads)), "utf8");

    const result = loadV1State(homeDir, { "agent-placeholder-b": { user_id: 222222 } });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.state.threads["thread-a"]?.to_user_id, null);
    }
  });
});

test("loadV1State leaves to_user_id null when the thread's 'to' is itself null, even with a roster passed", () => {
  withV1Home((homeDir) => {
    const threads = { "thread-a": fullThreadRecord({ to: null, to_user_id: null, awaiting: null }) };
    writeFileSync(join(homeDir, "state.json"), JSON.stringify(currentVersionState(threads)), "utf8");

    const result = loadV1State(homeDir, { "agent-placeholder-b": { user_id: 222222 } });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.state.threads["thread-a"]?.to_user_id, null);
    }
  });
});

test("loadV1State leaves an already-resolved to_user_id untouched when a roster is passed", () => {
  withV1Home((homeDir) => {
    const threads = { "thread-a": fullThreadRecord({ to: "agent-placeholder-b", to_user_id: 999999 }) };
    writeFileSync(join(homeDir, "state.json"), JSON.stringify(currentVersionState(threads)), "utf8");

    const result = loadV1State(homeDir, { "agent-placeholder-b": { user_id: 222222 } });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.state.threads["thread-a"]?.to_user_id, 999999, "backfill must not overwrite an existing value");
    }
  });
});

test("loadV1State leaves to_user_id null when no roster argument is passed at all", () => {
  withV1Home((homeDir) => {
    const threads = { "thread-a": fullThreadRecord({ to: "agent-placeholder-b", to_user_id: null }) };
    writeFileSync(join(homeDir, "state.json"), JSON.stringify(currentVersionState(threads)), "utf8");

    const result = loadV1State(homeDir);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.state.threads["thread-a"]?.to_user_id, null);
    }
  });
});
