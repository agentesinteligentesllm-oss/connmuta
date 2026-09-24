import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireSpawnLock,
  releaseSpawnLock,
  spawnLockAgeSeconds,
  readRunFile,
  ensureDaemonRunning,
  SpawnLockHeldError,
  DaemonSpawnTimeoutError,
  type SpawnLockPayload,
} from "../../src/client/run-state.js";
import { SPAWN_LOCK_STALE_SECONDS } from "../../src/shared/constants.js";

test("readRunFile returns parsed payload or null on missing/corrupt/missing-fields/dead pid", () => {
  const runDir = mkdtempSync(join(tmpdir(), "run-state-runfile-"));
  const runFilePath = join(runDir, "daemon.json");

  try {
    assert.equal(readRunFile(runDir), null, "missing file must read as null");

    const live = { port: 5001, pid: process.pid, secret: "abc123" };
    writeFileSync(runFilePath, JSON.stringify(live), "utf8");
    const read = readRunFile(runDir);
    assert.notEqual(read, null);
    assert.equal(read?.port, 5001);
    assert.equal(read?.pid, process.pid);
    assert.equal(read?.secret, "abc123");

    writeFileSync(runFilePath, "not-json", "utf8");
    assert.equal(readRunFile(runDir), null, "corrupt JSON must read as null");

    writeFileSync(runFilePath, JSON.stringify({ port: 5001 }), "utf8");
    assert.equal(readRunFile(runDir), null, "missing fields must read as null");

    const deadPid = 999999999;
    writeFileSync(runFilePath, JSON.stringify({ port: 5001, pid: deadPid, secret: "abc123" }), "utf8");
    assert.equal(readRunFile(runDir), null, "a dead pid must read as null");
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("spawnLockAgeSeconds computes age from acquired_at, falls back to mtime, else Infinity", () => {
  const runDir = mkdtempSync(join(tmpdir(), "spawn-lock-age-"));
  const lockPath = join(runDir, "spawn.lock");

  try {
    const now = 100000;
    const withAcquiredAt: SpawnLockPayload = { pid: 1234, acquired_at: 80000 };
    assert.equal(spawnLockAgeSeconds(lockPath, withAcquiredAt, now), 20);

    writeFileSync(lockPath, "not json", "utf8");
    const ageFromMtime = spawnLockAgeSeconds(lockPath, null);
    assert.ok(ageFromMtime >= 0 && ageFromMtime < 5, "corrupt payload falls back to file mtime");

    rmSync(lockPath);
    assert.equal(spawnLockAgeSeconds(lockPath, null), Infinity, "a vanished file with no payload is treated as free");
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("acquireSpawnLock throws SpawnLockHeldError when a live, fresh lock already exists", () => {
  const runDir = mkdtempSync(join(tmpdir(), "spawn-lock-live-"));

  try {
    const handle = acquireSpawnLock(runDir);

    assert.throws(
      () => acquireSpawnLock(runDir),
      (err: unknown) => {
        assert.ok(err instanceof SpawnLockHeldError);
        assert.equal((err as SpawnLockHeldError).pid, process.pid);
        assert.equal((err as SpawnLockHeldError).acquired_at, handle.payload.acquired_at);
        return true;
      },
    );

    handle.release();
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("acquireSpawnLock reclaims a lock older than SPAWN_LOCK_STALE_SECONDS", () => {
  const runDir = mkdtempSync(join(tmpdir(), "spawn-lock-stale-"));
  const lockPath = join(runDir, "spawn.lock");

  try {
    const staleAcquiredAt = Date.now() - (SPAWN_LOCK_STALE_SECONDS + 5) * 1000;
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, acquired_at: staleAcquiredAt }), "utf8");

    const handle = acquireSpawnLock(runDir);
    assert.equal(handle.payload.pid, process.pid);
    assert.ok(handle.payload.acquired_at > staleAcquiredAt);

    handle.release();
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("releaseSpawnLock only deletes the lock when the owner matches", () => {
  const runDir = mkdtempSync(join(tmpdir(), "spawn-lock-release-"));
  const lockPath = join(runDir, "spawn.lock");

  try {
    const handle = acquireSpawnLock(runDir);
    assert.ok(existsSync(lockPath));

    const foreignPayload: SpawnLockPayload = { pid: process.pid + 9999, acquired_at: handle.payload.acquired_at };
    releaseSpawnLock(lockPath, foreignPayload);
    assert.ok(existsSync(lockPath), "lock must still exist after a foreign-owner release");

    releaseSpawnLock(lockPath, handle.payload);
    assert.equal(existsSync(lockPath), false, "the matching owner must delete the lock");
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("ensureDaemonRunning returns the existing payload immediately when a live run file already exists", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "run-state-fastpath-"));

  try {
    const runDir = join(homeDir, "run");
    mkdirSync(runDir, { recursive: true });
    const live = { port: 6001, pid: process.pid, secret: "fastpath-secret" };
    writeFileSync(join(runDir, "daemon.json"), JSON.stringify(live), "utf8");

    let spawnCallCount = 0;
    const fakeSpawnDaemon = (): number | undefined => {
      spawnCallCount += 1;
      return undefined;
    };

    const result = await ensureDaemonRunning({ homeDir, spawnDaemonImpl: fakeSpawnDaemon, waitMs: 500 });

    assert.equal(result.port, 6001);
    assert.equal(result.secret, "fastpath-secret");
    assert.equal(spawnCallCount, 0, "spawnDaemonImpl must not be called when a live run file exists");
    assert.equal(existsSync(join(runDir, "spawn.lock")), false, "no spawn lock should be created on the fast path");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test(
  "N clients racing spawn exactly one daemon",
  { timeout: 5000 },
  async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "run-state-race-"));

    try {
      const CLIENT_COUNT = 5;
      let spawnCallCount = 0;
      const fakeSpawnDaemon = (): number | undefined => {
        spawnCallCount += 1;
        // Simulate the daemon coming up shortly after being spawned: write a live-pid run file
        // asynchronously, exactly as a real spawned process eventually would. This is what unblocks
        // the fs.watch-based wait for every racer, winner and losers alike.
        setTimeout(() => {
          writeFileSync(
            join(homeDir, "run", "daemon.json"),
            JSON.stringify({ port: 5678, pid: process.pid, secret: "race-secret" }),
            "utf8",
          );
        }, 30);
        return 99999;
      };

      const results = await Promise.all(
        Array.from({ length: CLIENT_COUNT }, () =>
          ensureDaemonRunning({ homeDir, spawnDaemonImpl: fakeSpawnDaemon, waitMs: 2000 }),
        ),
      );

      assert.equal(spawnCallCount, 1, "spawnDaemonImpl must be called exactly once across all racers");
      for (const result of results) {
        assert.equal(result.port, 5678);
        assert.equal(result.secret, "race-secret");
      }
      assert.equal(
        existsSync(join(homeDir, "run", "spawn.lock")),
        false,
        "the winner must release run/spawn.lock once every racer has resolved",
      );
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  },
);

test(
  "ensureDaemonRunning rejects with DaemonSpawnTimeoutError when no daemon ever appears, and still releases the spawn lock",
  { timeout: 5000 },
  async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "run-state-timeout-"));

    try {
      let spawnCallCount = 0;
      const fakeSpawnDaemon = (): number | undefined => {
        spawnCallCount += 1;
        return undefined; // never writes the run file — simulates a daemon that never comes up
      };

      await assert.rejects(
        () => ensureDaemonRunning({ homeDir, spawnDaemonImpl: fakeSpawnDaemon, waitMs: 150 }),
        (err: unknown) => err instanceof DaemonSpawnTimeoutError,
      );

      assert.equal(spawnCallCount, 1);
      assert.equal(
        existsSync(join(homeDir, "run", "spawn.lock")),
        false,
        "the lock must be released even after a timeout",
      );
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  },
);
