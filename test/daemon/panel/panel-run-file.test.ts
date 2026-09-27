import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePanelRunFile, readPanelRunFile, deletePanelRunFile } from "../../../src/daemon/panel/panel-run-file.js";
import { POSIX_PRIVATE_FILE_MODE } from "../../../src/shared/constants.js";

const SAMPLE_TOKEN = "a".repeat(64);

test("writePanelRunFile writes run/panel.json with the given port and token", () => {
  const runDir = mkdtempSync(join(tmpdir(), "panel-run-file-write-"));
  const runFilePath = join(runDir, "panel.json");

  try {
    const port = 4001;
    const payload = writePanelRunFile(runDir, port, SAMPLE_TOKEN);

    assert.ok(existsSync(runFilePath), "panel.json must exist");
    assert.equal(payload.port, port);
    assert.equal(payload.pid, process.pid);
    assert.equal(payload.token, SAMPLE_TOKEN);

    if (process.platform !== "win32") {
      const mode = statSync(runFilePath).mode & 0o777;
      assert.equal(mode, POSIX_PRIVATE_FILE_MODE, "panel.json mode should be 0o600");
    }
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("readPanelRunFile returns parsed payload or null on missing/corrupt/dead pid", () => {
  const runDir = mkdtempSync(join(tmpdir(), "panel-run-file-read-"));
  const runFilePath = join(runDir, "panel.json");

  try {
    // Missing file returns null
    assert.equal(readPanelRunFile(runDir), null);

    // Live file returns parsed payload
    const written = writePanelRunFile(runDir, 5001, SAMPLE_TOKEN);
    const read = readPanelRunFile(runDir);
    assert.notEqual(read, null);
    assert.equal(read?.port, 5001);
    assert.equal(read?.pid, process.pid);
    assert.equal(read?.token, written.token);

    // Corrupt JSON returns null
    writeFileSync(runFilePath, "not-json", "utf8");
    assert.equal(readPanelRunFile(runDir), null);

    // Missing fields returns null
    writeFileSync(runFilePath, JSON.stringify({ port: 5001 }), "utf8");
    assert.equal(readPanelRunFile(runDir), null);

    // Dead pid returns null
    const deadPid = 999999999;
    writeFileSync(runFilePath, JSON.stringify({ port: 5001, pid: deadPid, token: SAMPLE_TOKEN }), "utf8");
    assert.equal(readPanelRunFile(runDir), null);
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("deletePanelRunFile only deletes run/panel.json if pid matches ownPid", () => {
  const runDir = mkdtempSync(join(tmpdir(), "panel-run-file-delete-"));
  const runFilePath = join(runDir, "panel.json");

  try {
    writePanelRunFile(runDir, 6001, SAMPLE_TOKEN);
    assert.ok(existsSync(runFilePath));

    // Foreign pid cannot delete
    const foreignPid = process.pid + 9999;
    const deleteForeignResult = deletePanelRunFile(runDir, foreignPid);
    assert.equal(deleteForeignResult, false);
    assert.ok(existsSync(runFilePath), "run file must still exist after foreign pid delete attempt");

    // Own pid deletes
    const deleteOwnResult = deletePanelRunFile(runDir, process.pid);
    assert.equal(deleteOwnResult, true);
    assert.equal(existsSync(runFilePath), false, "run file must be deleted when own pid matches");

    // Non-existent file returns false
    assert.equal(deletePanelRunFile(runDir, process.pid), false);
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});
