import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock, readLockFile } from "../../src/daemon/lifecycle/lock.js";
import { readRunFile } from "../../src/daemon/lifecycle/run-file.js";
import { EXIT_DAEMON_ALREADY_RUNNING } from "../../src/shared/constants.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MAIN_JS_PATH = join(REPO_ROOT, "dist/src/daemon/main.js");

function createTempHome(): string {
  return mkdtempSync(join(tmpdir(), "conmuta-main-test-"));
}

function cleanupTempHome(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failure in tests
  }
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

test("main: starts daemon process and exits cleanly on SIGTERM", async () => {
  const homeDir = createTempHome();
  const runDir = join(homeDir, "run");

  try {
    const child = spawn(process.execPath, [MAIN_JS_PATH, "--home", homeDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const ready = await waitForCondition(() => {
      return readRunFile(runDir) !== null;
    }, 5000);

    assert.ok(ready, `daemon process failed to write run file in time. stderr: ${stderr}`);

    const runData = readRunFile(runDir);
    assert.ok(runData !== null);
    assert.equal(runData.pid, child.pid);
    assert.ok(runData.port > 0);

    // Send SIGTERM and wait for clean exit
    const exitResultPromise = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal }));
    });

    child.kill("SIGTERM");
    const exitResult = await exitResultPromise;

    if (process.platform === "win32") {
      // On Windows, SIGTERM is an unconditional termination (design §7.3)
      assert.ok(
        exitResult.code === 0 || exitResult.signal === "SIGTERM",
        `expected code 0 or signal SIGTERM on Windows, got ${JSON.stringify(exitResult)}`,
      );
    } else {
      assert.equal(exitResult.code, 0, `daemon should exit 0 on SIGTERM, got ${exitResult.code}`);
      assert.equal(readRunFile(runDir), null);
      assert.equal(readLockFile(join(runDir, "daemon.lock")), null);
    }
  } finally {
    cleanupTempHome(homeDir);
  }
});

test("main: exits with EXIT_DAEMON_ALREADY_RUNNING (6) when lock is held", async () => {
  const homeDir = createTempHome();

  try {
    // Pre-acquire the lock in this process
    const lock = acquireLock(homeDir);

    const child = spawn(process.execPath, [MAIN_JS_PATH, "--home", homeDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const exitCodePromise = new Promise<number | null>((resolve) => {
      child.on("exit", (code) => resolve(code));
    });

    const exitCode = await exitCodePromise;

    assert.equal(
      exitCode,
      EXIT_DAEMON_ALREADY_RUNNING,
      `expected exit code ${EXIT_DAEMON_ALREADY_RUNNING}, got ${exitCode}. stderr: ${stderr}`,
    );

    lock.release();
  } finally {
    cleanupTempHome(homeDir);
  }
});
