import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writePanelRunFile } from "../../src/daemon/panel/panel-run-file.js";
import { runPanelCommand } from "../../src/cli/panel.js";

interface CapturedIo {
  readonly io: { out: (line: string) => void; err: (line: string) => void };
  readonly out: string[];
  readonly err: string[];
}

function makeIo(): CapturedIo {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line) => out.push(line), err: (line) => err.push(line) }, out, err };
}

test("panel prints the one-time URL when the daemon is running", () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-panel-"));
  try {
    const runDir = join(dir, "run");
    mkdirSync(runDir, { recursive: true });
    writePanelRunFile(runDir, 41234, "test-token-abc123");

    const captured = makeIo();
    const result = runPanelCommand({ homeDir: dir, io: captured.io });

    assert.equal(result.exitCode, 0);
    assert.equal(captured.err.length, 0);
    assert.deepEqual(captured.out, ["http://127.0.0.1:41234/?token=test-token-abc123"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("panel reports a clear error when the daemon is not running", () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-panel-none-"));
  try {
    const captured = makeIo();
    const result = runPanelCommand({ homeDir: dir, io: captured.io });

    assert.equal(result.exitCode, 1);
    assert.equal(captured.out.length, 0);
    assert.match(captured.err.join("\n"), /not running/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Mirrors panel-run-file.test.ts's own dead-pid convention (a 9-digit pid guaranteed unassigned)
// to confirm runPanelCommand treats a stale run file identically to an absent one.
test("panel reports the same clear error when a stale run file (dead pid) is present", () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-panel-stale-"));
  try {
    const runDir = join(dir, "run");
    mkdirSync(runDir, { recursive: true });
    const deadPid = 999999999;
    writeFileSync(
      join(runDir, "panel.json"),
      JSON.stringify({ port: 41235, pid: deadPid, token: "stale-token" }),
      "utf8",
    );

    const captured = makeIo();
    const result = runPanelCommand({ homeDir: dir, io: captured.io });

    assert.equal(result.exitCode, 1);
    assert.match(captured.err.join("\n"), /not running/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
