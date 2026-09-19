import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireLock,
  releaseLock,
  updateHeartbeat,
  readLockFile,
  lockAgeSeconds,
  isProcessAlive,
  LockHeldError,
  type LockPayload,
} from "../../../src/daemon/lifecycle/lock.js";
import { DAEMON_LOCK_STALE_SECONDS } from "../../../src/shared/constants.js";

test("acquireLock creates run/daemon.lock with pid and acquired_at", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "lock-test-"));
  const lockPath = join(homeDir, "run", "daemon.lock");

  try {
    const handle = acquireLock(homeDir);
    assert.ok(existsSync(lockPath), "lock file must exist");
    assert.equal(handle.payload.pid, process.pid);
    assert.ok(typeof handle.payload.acquired_at === "number");

    const onDisk = readLockFile(lockPath);
    assert.notEqual(onDisk, null);
    assert.equal(onDisk?.pid, process.pid);
    assert.equal(onDisk?.acquired_at, handle.payload.acquired_at);

    handle.release();
    assert.equal(existsSync(lockPath), false, "release() must remove lock file");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("releaseLock only deletes lock when owner matches", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "lock-release-"));
  const lockPath = join(homeDir, "run", "daemon.lock");

  try {
    const handle = acquireLock(homeDir);
    assert.ok(existsSync(lockPath));

    // Attempt release with different pid: should NOT delete
    const foreignPidPayload: LockPayload = { pid: process.pid + 9999, acquired_at: handle.payload.acquired_at };
    releaseLock(lockPath, foreignPidPayload);
    assert.ok(existsSync(lockPath), "lock file must still exist after foreign pid release");

    // Attempt release with different acquired_at: should NOT delete
    const foreignTimePayload: LockPayload = { pid: process.pid, acquired_at: handle.payload.acquired_at - 1000 };
    releaseLock(lockPath, foreignTimePayload);
    assert.ok(existsSync(lockPath), "lock file must still exist after foreign acquired_at release");

    // Release with matching owner: deletes
    releaseLock(lockPath, handle.payload);
    assert.equal(existsSync(lockPath), false, "matching owner must delete lock");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("updateHeartbeat updates heartbeat_at only when owner matches", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "lock-heartbeat-"));
  const lockPath = join(homeDir, "run", "daemon.lock");

  try {
    const handle = acquireLock(homeDir);

    // Initial lock has no heartbeat_at
    const initial = readLockFile(lockPath);
    assert.equal(initial?.heartbeat_at, undefined);

    // Foreign payload cannot update heartbeat
    const foreignPayload: LockPayload = { pid: process.pid + 9999, acquired_at: handle.payload.acquired_at };
    updateHeartbeat(lockPath, foreignPayload);
    assert.equal(readLockFile(lockPath)?.heartbeat_at, undefined);

    // Own updateHeartbeat updates heartbeat_at
    handle.updateHeartbeat();
    const updated = readLockFile(lockPath);
    assert.ok(typeof updated?.heartbeat_at === "number");
    assert.ok(typeof handle.payload.heartbeat_at === "number");
    assert.equal(updated?.heartbeat_at, handle.payload.heartbeat_at);

    handle.release();
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("lockAgeSeconds prioritizes heartbeat_at over acquired_at and mtime", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "lock-age-"));
  const lockPath = join(homeDir, "daemon.lock");

  try {
    const now = 100000;
    // With heartbeat_at
    const withHeartbeat: LockPayload = { pid: 1234, acquired_at: 50000, heartbeat_at: 95000 };
    assert.equal(lockAgeSeconds(lockPath, withHeartbeat, now), 5);

    // Without heartbeat_at (falls back to acquired_at)
    const withoutHeartbeat: LockPayload = { pid: 1234, acquired_at: 80000 };
    assert.equal(lockAgeSeconds(lockPath, withoutHeartbeat, now), 20);

    // Corrupt / null payload (falls back to file mtime)
    writeFileSync(lockPath, "not json", "utf8");
    const ageFromMtime = lockAgeSeconds(lockPath, null);
    assert.ok(ageFromMtime >= 0 && ageFromMtime < 5);

    // Non-existent file with null payload returns Infinity
    rmSync(lockPath);
    assert.equal(lockAgeSeconds(lockPath, null), Infinity);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("isProcessAlive checks pid liveness", () => {
  assert.equal(isProcessAlive(process.pid), true);
  assert.equal(isProcessAlive(-1), false);
  assert.equal(isProcessAlive(0), false);
  assert.equal(isProcessAlive(NaN), false);
  assert.equal(isProcessAlive(999999999), false);
});
