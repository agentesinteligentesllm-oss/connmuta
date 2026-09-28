import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  isProcessAlive,
  readRunFile,
  resolveClientHomeDir,
  type DaemonRunPayload,
} from "../../src/client/run-file.js";
import * as runState from "../../src/client/run-state.js";
import { HOME_DIR_NAME } from "../../src/shared/constants.js";

/** A pid far above any real OS pid ceiling, so `process.kill(pid, 0)` reports ESRCH. */
const DEAD_PID = 999999999;

test("readRunFile returns parsed payload or null on missing/corrupt/missing-fields/dead pid", () => {
  const runDir = mkdtempSync(join(tmpdir(), "run-file-runfile-"));
  const runFilePath = join(runDir, "daemon.json");

  try {
    assert.equal(readRunFile(runDir), null, "missing file must read as null");

    const live: DaemonRunPayload = { port: 5001, pid: process.pid, secret: "abc123" };
    writeFileSync(runFilePath, JSON.stringify(live), "utf8");
    assert.deepEqual(readRunFile(runDir), live);

    writeFileSync(runFilePath, "not-json", "utf8");
    assert.equal(readRunFile(runDir), null, "corrupt JSON must read as null");

    writeFileSync(runFilePath, JSON.stringify({ port: 5001 }), "utf8");
    assert.equal(readRunFile(runDir), null, "missing fields must read as null");

    writeFileSync(runFilePath, JSON.stringify({ port: 5001, pid: DEAD_PID, secret: "abc123" }), "utf8");
    assert.equal(readRunFile(runDir), null, "a dead pid must read as null");
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("isProcessAlive is true for this process and false for a non-positive, non-integer, or dead pid", () => {
  assert.equal(isProcessAlive(process.pid), true);
  assert.equal(isProcessAlive(0), false);
  assert.equal(isProcessAlive(-1), false);
  assert.equal(isProcessAlive(1.5), false);
  assert.equal(isProcessAlive(DEAD_PID), false);
});

test("resolveClientHomeDir resolves an explicit home, and falls back to ~/.conmuta for undefined or blank input", () => {
  assert.equal(resolveClientHomeDir("some/relative/home"), resolve("some/relative/home"));
  assert.equal(resolveClientHomeDir(undefined), join(homedir(), HOME_DIR_NAME));
  assert.equal(resolveClientHomeDir("   "), join(homedir(), HOME_DIR_NAME));
});

test("run-state.ts re-exports the same run-file functions, so existing import paths keep working", () => {
  assert.equal(runState.readRunFile, readRunFile);
  assert.equal(runState.isProcessAlive, isProcessAlive);
  assert.equal(runState.resolveClientHomeDir, resolveClientHomeDir);
});
