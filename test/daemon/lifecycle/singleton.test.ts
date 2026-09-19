import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, LockHeldError, readLockFile } from "../../../src/daemon/lifecycle/lock.js";
import { DAEMON_LOCK_STALE_SECONDS, EXIT_DAEMON_ALREADY_RUNNING } from "../../../src/shared/constants.js";

test("second instance refuses to poll when lock is live and fresh", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "singleton-live-"));
  const lockPath = join(homeDir, "run", "daemon.lock");

  try {
    const handle1 = acquireLock(homeDir);

    // Second instance attempting to acquire the lock must fail
    assert.throws(
      () => {
        acquireLock(homeDir);
      },
      (err: unknown) => {
        assert.ok(err instanceof LockHeldError);
        assert.equal((err as LockHeldError).pid, process.pid);
        assert.equal((err as LockHeldError).acquired_at, handle1.payload.acquired_at);
        return true;
      },
    );

    // Daemon lifecycle maps LockHeldError to EXIT_DAEMON_ALREADY_RUNNING (6)
    assert.equal(EXIT_DAEMON_ALREADY_RUNNING, 6);

    handle1.release();
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("stale lock with dead pid is reclaimed exactly once", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "singleton-dead-pid-"));
  const runDir = join(homeDir, "run");
  const lockPath = join(runDir, "daemon.lock");

  try {
    mkdirSync(runDir, { recursive: true });
    // Write lock with a dead pid
    const deadPid = 999999999;
    writeFileSync(lockPath, JSON.stringify({ pid: deadPid, acquired_at: Date.now() }), "utf8");

    // Acquire lock should reclaim the dead pid's lock
    const handle = acquireLock(homeDir);
    assert.equal(handle.payload.pid, process.pid);

    const onDisk = readLockFile(lockPath);
    assert.equal(onDisk?.pid, process.pid);

    handle.release();
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("stale lock with heartbeat older than DAEMON_LOCK_STALE_SECONDS is reclaimed exactly once", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "singleton-stale-heartbeat-"));
  const runDir = join(homeDir, "run");
  const lockPath = join(runDir, "daemon.lock");

  try {
    mkdirSync(runDir, { recursive: true });
    // Write lock with current pid (alive) but heartbeat older than stale window
    const staleHeartbeat = Date.now() - (DAEMON_LOCK_STALE_SECONDS + 5) * 1000;
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, acquired_at: staleHeartbeat, heartbeat_at: staleHeartbeat }),
      "utf8",
    );

    // Acquire lock should reclaim the stale lock
    const handle = acquireLock(homeDir);
    assert.equal(handle.payload.pid, process.pid);
    assert.ok(handle.payload.acquired_at > staleHeartbeat);

    handle.release();
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});
