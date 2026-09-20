import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon } from "../../src/daemon/bootstrap.js";
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
