import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  acquireSpawnLock,
  releaseSpawnLock,
  spawnLockAgeSeconds,
  readRunFile,
  ensureDaemonRunning,
  spawnIfStillNeeded,
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

test("spawnLockAgeSeconds clamps a future acquired_at (clock skew) to 0, never negative", () => {
  const runDir = mkdtempSync(join(tmpdir(), "spawn-lock-skew-"));
  const lockPath = join(runDir, "spawn.lock");

  try {
    const now = 100000;
    const fromTheFuture: SpawnLockPayload = { pid: 1234, acquired_at: now + 5000 };
    assert.equal(
      spawnLockAgeSeconds(lockPath, fromTheFuture, now),
      0,
      "a payload whose acquired_at is after now must clamp to 0, not go negative",
    );
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

test("run-state.ts never uses \"daemon.lock\" as a code value — a client must never touch the daemon's own singleton lock", () => {
  // Structural pin for the spec's "a client MUST NOT release or reclaim run/daemon.lock" clause
  // (daemon-lifecycle spec.md). Checks for the double-quoted string-literal form specifically — the
  // form real code would use as a filename constant — not a blind substring match, since the module's
  // own doc comments legitimately mention `run/daemon.lock` (backtick-quoted prose) to explain this
  // exact guarantee; a naive substring check would false-positive on that documentation.
  const compiledSource = readFileSync(
    new URL("../../src/client/run-state.js", import.meta.url),
    "utf8",
  );
  assert.ok(
    !compiledSource.includes('"daemon.lock"'),
    "run-state.ts must never use \"daemon.lock\" as a string-literal value",
  );
});

test("spawnIfStillNeeded returns the existing payload and never spawns when the run file is already valid", () => {
  const runDir = mkdtempSync(join(tmpdir(), "spawn-if-needed-hit-"));

  try {
    const live = { port: 7001, pid: process.pid, secret: "toctou-secret" };
    writeFileSync(join(runDir, "daemon.json"), JSON.stringify(live), "utf8");

    let called = false;
    const result = spawnIfStillNeeded(runDir, () => {
      called = true;
      return undefined;
    });

    assert.equal(called, false, "must not spawn when the run file is already valid");
    assert.deepEqual(result, live);
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("spawnIfStillNeeded spawns when no valid run file is present", () => {
  const runDir = mkdtempSync(join(tmpdir(), "spawn-if-needed-miss-"));

  try {
    let called = false;
    const result = spawnIfStillNeeded(runDir, () => {
      called = true;
      return undefined;
    });

    assert.equal(called, true, "must spawn when no valid run file exists");
    assert.equal(result, undefined);
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
    // Disclosed (Judgment Day finding): these two assertions prove ensureDaemonRunning resolves
    // correctly without spawning — they do NOT distinguish whether the initial fast-path check (line
    // ~328) or spawnIfStillNeeded's own recheck served this result, since both leave no spawn call and
    // no leftover lock file behind. spawnIfStillNeeded's own dedicated tests above cover its half
    // directly; this test's job is only the end-to-end outcome.
    assert.equal(spawnCallCount, 0, "spawnDaemonImpl must not be called when a live run file exists");
    assert.equal(existsSync(join(runDir, "spawn.lock")), false, "no spawn lock file must remain after resolving");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test(
  "N clients racing spawn exactly one daemon",
  { timeout: 5000 },
  async () => {
    // Disclosed (Judgment Day finding): this is sequential exclusivity, not genuine OS-level
    // simultaneous contention. ensureDaemonRunning runs fully synchronously from entry through
    // acquireSpawnLock, with no `await` until it starts waiting for the run file — so
    // Array.from(...).map(() => ensureDaemonRunning(...)) invokes each racer one after another, and
    // racer #1 deterministically wins the wx-create simply by executing first. What this test DOES
    // prove: the wx exclusivity flag genuinely excludes every later racer (losers correctly hit the
    // EEXIST -> SpawnLockHeldError path and wait on the run-file event instead of spawning), which is
    // the spec's actual "N-1 wait instead of spawning a second daemon" guarantee. A truly simultaneous
    // multi-process race is not constructible in a single-process test (JavaScript's single-threaded,
    // run-to-completion execution model makes every unit-level "race" of this shape sequential by
    // construction) — this is a general limitation of testing OS-level file-creation atomicity
    // in-process, not something specific to this module.
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
