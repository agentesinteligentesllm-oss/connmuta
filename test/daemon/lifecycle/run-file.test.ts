import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeRunFile, readRunFile, deleteRunFile } from "../../../src/daemon/lifecycle/run-file.js";
import { RUN_SECRET_BYTES, POSIX_PRIVATE_FILE_MODE } from "../../../src/shared/constants.js";

test("writeRunFile generates fresh secret on every start and writes run/daemon.json", () => {
  const runDir = mkdtempSync(join(tmpdir(), "run-file-write-"));
  const runFilePath = join(runDir, "daemon.json");

  try {
    const port1 = 4001;
    const payload1 = writeRunFile(runDir, port1);

    assert.ok(existsSync(runFilePath), "daemon.json must exist");
    assert.equal(payload1.port, port1);
    assert.equal(payload1.pid, process.pid);
    assert.equal(typeof payload1.secret, "string");
    assert.equal(payload1.secret.length, RUN_SECRET_BYTES * 2, "secret must be 64 hex characters (32 bytes)");
    assert.match(payload1.secret, /^[0-9a-f]{64}$/, "secret must be valid hex");

    // Second call generates a fresh secret
    const port2 = 4002;
    const payload2 = writeRunFile(runDir, port2);
    assert.notEqual(payload1.secret, payload2.secret, "fresh secret must be generated on every start");

    // Check POSIX file mode
    if (process.platform !== "win32") {
      const mode = statSync(runFilePath).mode & 0o777;
      assert.equal(mode, POSIX_PRIVATE_FILE_MODE, "daemon.json mode should be 0o600");
    }
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("readRunFile returns parsed payload or null on missing/corrupt/dead pid", () => {
  const runDir = mkdtempSync(join(tmpdir(), "run-file-read-"));
  const runFilePath = join(runDir, "daemon.json");

  try {
    // Missing file returns null
    assert.equal(readRunFile(runDir), null);

    // Live file returns parsed payload
    const written = writeRunFile(runDir, 5001);
    const read = readRunFile(runDir);
    assert.notEqual(read, null);
    assert.equal(read?.port, 5001);
    assert.equal(read?.pid, process.pid);
    assert.equal(read?.secret, written.secret);

    // Corrupt JSON returns null
    writeFileSync(runFilePath, "not-json", "utf8");
    assert.equal(readRunFile(runDir), null);

    // Missing fields returns null
    writeFileSync(runFilePath, JSON.stringify({ port: 5001 }), "utf8");
    assert.equal(readRunFile(runDir), null);

    // Dead pid returns null
    const deadPid = 999999999;
    writeFileSync(runFilePath, JSON.stringify({ port: 5001, pid: deadPid, secret: written.secret }), "utf8");
    assert.equal(readRunFile(runDir), null);
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("deleteRunFile only deletes run/daemon.json if pid matches ownPid", () => {
  const runDir = mkdtempSync(join(tmpdir(), "run-file-delete-"));
  const runFilePath = join(runDir, "daemon.json");

  try {
    writeRunFile(runDir, 6001);
    assert.ok(existsSync(runFilePath));

    // Foreign pid cannot delete
    const foreignPid = process.pid + 9999;
    const deleteForeignResult = deleteRunFile(runDir, foreignPid);
    assert.equal(deleteForeignResult, false);
    assert.ok(existsSync(runFilePath), "run file must still exist after foreign pid delete attempt");

    // Own pid deletes
    const deleteOwnResult = deleteRunFile(runDir, process.pid);
    assert.equal(deleteOwnResult, true);
    assert.equal(existsSync(runFilePath), false, "run file must be deleted when own pid matches");

    // Non-existent file returns false
    assert.equal(deleteRunFile(runDir, process.pid), false);
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});
