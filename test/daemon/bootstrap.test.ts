import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getLastSessionSeenAt, startDaemon } from "../../src/daemon/bootstrap.js";
import { LockHeldError, readLockFile } from "../../src/daemon/lifecycle/lock.js";
import { readRunFile } from "../../src/daemon/lifecycle/run-file.js";
import type { SecretStore } from "../../src/secret-store/types.js";

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
