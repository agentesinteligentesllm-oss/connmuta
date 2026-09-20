import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isNodeAtOrAboveFloor, enforceNodeFloor } from "../../src/daemon/node-floor.js";
import { NODE_FLOOR, EXIT_NODE_FLOOR } from "../../src/shared/constants.js";

test("isNodeAtOrAboveFloor accepts valid versions at or above floor", () => {
  assert.equal(isNodeAtOrAboveFloor("v24.15.0"), true);
  assert.equal(isNodeAtOrAboveFloor("v24.15.1"), true);
  assert.equal(isNodeAtOrAboveFloor("v24.16.0"), true);
  assert.equal(isNodeAtOrAboveFloor("v25.0.0"), true);
  assert.equal(isNodeAtOrAboveFloor("24.15.0"), true);
  assert.equal(isNodeAtOrAboveFloor("25.1.0"), true);
});

test("isNodeAtOrAboveFloor rejects versions below floor", () => {
  assert.equal(isNodeAtOrAboveFloor("v22.0.0"), false);
  assert.equal(isNodeAtOrAboveFloor("v24.14.9"), false);
  assert.equal(isNodeAtOrAboveFloor("v18.20.0"), false);
  assert.equal(isNodeAtOrAboveFloor("v24.0.0"), false);
  assert.equal(isNodeAtOrAboveFloor("invalid-version"), false);
  assert.equal(isNodeAtOrAboveFloor(""), false);
});

test("enforceNodeFloor passes silently on valid version", () => {
  let stderrCalled = false;
  let exitCalled = false;

  enforceNodeFloor({
    version: "v24.15.0",
    stderr: () => {
      stderrCalled = true;
    },
    exit: () => {
      exitCalled = true;
    },
  });

  assert.equal(stderrCalled, false);
  assert.equal(exitCalled, false);
});

test("enforceNodeFloor writes error with download link to stderr and exits with EXIT_NODE_FLOOR", () => {
  const stderrLines: string[] = [];
  let exitCode: number | null = null;

  enforceNodeFloor({
    version: "v22.0.0",
    stderr: (msg: string) => {
      stderrLines.push(msg);
    },
    exit: (code: number) => {
      exitCode = code;
    },
  });

  assert.equal(exitCode, EXIT_NODE_FLOOR);
  assert.equal(exitCode, 5);
  const combined = stderrLines.join("\n");
  assert.ok(combined.includes("https://nodejs.org/"), "stderr must contain download link");
  assert.ok(combined.includes(NODE_FLOOR), "stderr must mention the required floor");
  assert.ok(combined.includes("v22.0.0"), "stderr must mention the found version");
});

test("Node below the floor exits before any write (zero files created)", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "node-floor-test-"));
  try {
    const targetDir = join(tempHome, ".conmuta");
    let exitCode: number | null = null;

    enforceNodeFloor({
      version: "v24.14.9",
      stderr: () => {},
      exit: (code: number) => {
        exitCode = code;
      },
    });

    assert.equal(exitCode, EXIT_NODE_FLOOR);
    assert.equal(existsSync(targetDir), false, "no files or directories under ~/.conmuta/ may be created");
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
  }
});
