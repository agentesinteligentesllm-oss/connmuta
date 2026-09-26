import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

import { selectSecretStore } from "../../src/secret-store/index.js";
import { HOME_DIR_NAME } from "../../src/shared/constants.js";

// dist/test/migration/integration.test.js -> repo root is three levels up
// (dist/test/migration/ -> dist/test/ -> dist/ -> repo root).
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CLI_ENTRY = join(REPO_ROOT, "dist/src/cli/main.js");
const FIXTURE_DIR = join(REPO_ROOT, "test/fixtures/v1-home");

// Matches the established convention in test/cli/main.test.ts and test/cli/validate.test.ts: fail
// fast with an actionable message rather than a generic spawn error if dist/ is missing or stale.
assert.ok(existsSync(CLI_ENTRY), `expected the built CLI at ${CLI_ENTRY}: run 'npm run build' first`);

/** The fixture's `config.roster[config.agent_id].user_id` — becomes the migrated `bot_id`. */
const FIXTURE_BOT_ID = 555000001;
/** The fixture's `config.chat_id` — becomes the migrated group's `group_id`. */
const FIXTURE_CHAT_ID = -1001111111111;
/** The fixture's `state.next_update_id` — deliberately not `0`, so a verbatim carry-forward is provable. */
const FIXTURE_NEXT_UPDATE_ID = 99;
/** The fixture's plaintext `config.bot_token` (not token-shaped; see the fixture file's own comment). */
const FIXTURE_TOKEN = "placeholder-v1-bot-token";
/** The `--project-id` every scenario below binds the fixture to. */
const FIXTURE_PROJECT_ID = "prj-example";
/** The fixture's one thread key under `state.threads`. */
const FIXTURE_THREAD_ID = "thread-1";

interface TempHomes {
  readonly v1Home: string;
  readonly v2Home: string;
}

/**
 * Fresh temp v1/v2 homes for one scenario. The checked-in fixture is copied into `v1Home`, never
 * spawned against directly — a real migration run writes dated backups alongside whatever it reads,
 * and the checked-in fixture files must stay pristine across every test run.
 */
function setupTempHomes(): TempHomes {
  const v1Home = mkdtempSync(join(tmpdir(), "conmuta-migration-integration-v1-"));
  const v2Home = mkdtempSync(join(tmpdir(), "conmuta-migration-integration-v2-"));
  cpSync(join(FIXTURE_DIR, "config.json"), join(v1Home, "config.json"));
  cpSync(join(FIXTURE_DIR, "state.json"), join(v1Home, "state.json"));
  return { v1Home, v2Home };
}

/**
 * The v2 home the migration actually reads/writes under `homes.v2Home`.
 *
 * `runMigration`'s `v2Home` option has no CLI flag, so `daemon/home.ts`'s `resolveHomeDir` always
 * falls back to `join(os.homedir(), HOME_DIR_NAME)` — the env override redirects `os.homedir()` to
 * `homes.v2Home`, but the real registry/ledger files land one level deeper, under its `HOME_DIR_NAME`
 * (`.conmuta`) subdirectory, exactly like a real `~/.conmuta`. Verified by direct reproduction: a real
 * spawn reports `migrated bot <id> into <homes.v2Home>\.conmuta`.
 */
function resolveV2Home(homes: TempHomes): string {
  return join(homes.v2Home, HOME_DIR_NAME);
}

/**
 * Removes both temp homes AND the real secret-store entry a spawn left behind.
 *
 * Every scenario below spawns the real, non-`--dry-run` `migrate-v1` CLI as a child process, which
 * always calls the real, non-injected `selectSecretStore` (a spawn boundary has no injection seam) —
 * so every scenario, not only the one that reads the token back, must clean up the real OS
 * keychain/file-fallback entry it left behind, or a placeholder credential survives in the
 * developer's real OS keychain across test runs. The delete is best-effort, matching
 * `secret-store/index.ts`'s own `discardProbeEntry` precedent: a cleanup failure must never mask the
 * scenario's real assertion outcome above it.
 */
async function teardownHomes(homes: TempHomes): Promise<void> {
  try {
    const selection = await selectSecretStore(resolveV2Home(homes));
    await selection.store.delete(String(FIXTURE_BOT_ID));
  } catch {
    // Best-effort cleanup only; see the function doc.
  } finally {
    rmSync(homes.v1Home, { recursive: true, force: true });
    rmSync(homes.v2Home, { recursive: true, force: true });
  }
}

/**
 * Spawns the real built CLI's `migrate-v1` subcommand against `homes`, always with `--project-id`/
 * `--project-path` (D-23's opt-in pair). `runMigration`'s `v2Home` option has no CLI flag — the only
 * way to redirect v2's home away from the real user profile for a real child process is overriding
 * `HOME`/`USERPROFILE` on the spawned environment (`daemon/home.ts`'s `resolveHomeDir` falls back to
 * `os.homedir()`).
 */
function spawnMigrateV1(homes: TempHomes) {
  return spawnSync(
    process.execPath,
    [
      CLI_ENTRY,
      "migrate-v1",
      "--v1-home",
      homes.v1Home,
      "--project-id",
      FIXTURE_PROJECT_ID,
      "--project-path",
      join(homes.v2Home, "project"),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, HOME: homes.v2Home, USERPROFILE: homes.v2Home },
      shell: false,
    },
  );
}

test("originals are byte-identical after migration", async () => {
  const homes = setupTempHomes();
  try {
    const originalConfig = readFileSync(join(homes.v1Home, "config.json"));
    const originalState = readFileSync(join(homes.v1Home, "state.json"));

    const result = spawnMigrateV1(homes);
    assert.equal(result.status, 0, `expected exit 0, got ${String(result.status)}: ${result.stderr}`);

    assert.deepEqual(readFileSync(join(homes.v1Home, "config.json")), originalConfig, "config.json must be untouched");
    assert.deepEqual(readFileSync(join(homes.v1Home, "state.json")), originalState, "state.json must be untouched");

    // Prefix-match only, not the exact date string: src/migration/main.ts's own backupExists check
    // (lines ~332-333) does the same prefix-match for exactly this date-tolerance reason.
    const entries = readdirSync(homes.v1Home);
    const configBackupName = entries.find((name) => name.startsWith("config.json.bak-pre-v2-"));
    const stateBackupName = entries.find((name) => name.startsWith("state.json.bak-pre-v2-"));
    assert.ok(configBackupName !== undefined, "expected a config.json.bak-pre-v2-* backup");
    assert.ok(stateBackupName !== undefined, "expected a state.json.bak-pre-v2-* backup");
    assert.deepEqual(readFileSync(join(homes.v1Home, configBackupName as string)), originalConfig);
    assert.deepEqual(readFileSync(join(homes.v1Home, stateBackupName as string)), originalState);
  } finally {
    await teardownHomes(homes);
  }
});

test("fixture migrates with a synthesized registry and secret entry", async () => {
  const homes = setupTempHomes();
  try {
    const result = spawnMigrateV1(homes);
    assert.equal(result.status, 0, `expected exit 0, got ${String(result.status)}: ${result.stderr}`);
    const v2Home = resolveV2Home(homes);

    const registry = JSON.parse(readFileSync(join(v2Home, "registry.json"), "utf8")) as {
      bots: readonly { bot_id: number }[];
      groups: readonly { group_id: number }[];
      projects: readonly { project_id: string }[];
      bindings: readonly { project_id: string; status: string }[];
    };
    assert.equal(registry.bots.length, 1);
    assert.equal(registry.bots[0].bot_id, FIXTURE_BOT_ID);
    assert.equal(registry.groups.length, 1);
    assert.equal(registry.groups[0].group_id, FIXTURE_CHAT_ID);
    assert.equal(registry.projects.length, 1);
    assert.equal(registry.projects[0].project_id, FIXTURE_PROJECT_ID);
    assert.equal(registry.bindings.length, 1);
    assert.equal(registry.bindings[0].status, "active");

    const db = new DatabaseSync(join(v2Home, "ledger.db"));
    try {
      const offset = db.prepare("SELECT * FROM offsets WHERE bot_id = ?").get(FIXTURE_BOT_ID);
      assert.ok(offset !== undefined, "expected an offsets row for the migrated bot");
      const thread = db.prepare("SELECT * FROM threads WHERE project_id = ? AND thread_id = ?").get(FIXTURE_PROJECT_ID, FIXTURE_THREAD_ID);
      assert.ok(thread !== undefined, "expected a threads row for the fixture's thread");
      const bindingState = db.prepare("SELECT * FROM binding_state WHERE project_id = ?").get(FIXTURE_PROJECT_ID);
      assert.ok(bindingState !== undefined, "expected a binding_state row for the assigned project");
    } finally {
      db.close();
    }

    // The first test in this repo to exercise the REAL (non-injected) secret store: main.ts calls
    // selection.store.set(String(botId), token), so the read-back below mirrors that exact call shape,
    // including the same resolved v2Home the real process used (see resolveV2Home). Cleanup of this
    // real entry is centralized in teardownHomes below, since every scenario in this file needs it.
    const selection = await selectSecretStore(v2Home);
    const storedToken = await selection.store.get(String(FIXTURE_BOT_ID));
    assert.equal(storedToken, FIXTURE_TOKEN);

    assert.match(result.stdout, /"schema_version"/);
    assert.ok(result.stdout.includes(FIXTURE_PROJECT_ID));
  } finally {
    await teardownHomes(homes);
  }
});

test("stale cursor carries forward without a false recovery claim", async () => {
  const homes = setupTempHomes();
  try {
    // Note: the fixture's state.last_fetch_at happens to be >24h old, but that field is parsed and
    // then never consumed anywhere in the migration path (loadV1State/synthesizeMigration/
    // runMigration) — it plays no role in the assertions below. What actually proves "stale cursor,
    // no false claim" is next_update_id's verbatim carry-forward and the absence of recovery
    // language in the process's own output, both checked next.
    const result = spawnMigrateV1(homes);
    assert.equal(result.status, 0, `expected exit 0, got ${String(result.status)}: ${result.stderr}`);

    const db = new DatabaseSync(join(resolveV2Home(homes), "ledger.db"));
    try {
      const offset = db.prepare("SELECT next_update_id FROM offsets WHERE bot_id = ?").get(FIXTURE_BOT_ID) as
        | { next_update_id: number }
        | undefined;
      assert.equal(offset?.next_update_id, FIXTURE_NEXT_UPDATE_ID, "the cursor must carry forward verbatim, no silent reset");
    } finally {
      db.close();
    }

    const combinedOutput = `${result.stdout}${result.stderr}`;
    assert.doesNotMatch(combinedOutput, /recover/i);
    assert.doesNotMatch(combinedOutput, /caught up/i);
    assert.doesNotMatch(combinedOutput, /no (updates|messages) (lost|missed)/i);

    // gap_warning (daemon/serve/fetch.ts) and retention_warning (daemon/serve/status.ts) are
    // deliberately NOT asserted here, even as "absent". Both are raised only from a non-null
    // offsets.last_poll_ok_at (design §8.4), and migration's own writeOffsetRow (migration/main.ts)
    // never sets that column — it stays NULL immediately after migration. Those two fields describe
    // the DAEMON's later polling behavior, not migration's; this scenario is scoped to migration's own
    // guarantee (verbatim cursor carry-forward, no false claim in its own output), and the runbook
    // (docs/runbooks/migrate-from-v1.md) is what documents the >24h gap to the operator.
  } finally {
    await teardownHomes(homes);
  }
});
