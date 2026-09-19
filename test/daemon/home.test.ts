import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveHomeDir, ensureHomeDirs } from "../../src/daemon/home.js";
import { HOME_DIR_NAME, POSIX_PRIVATE_DIR_MODE } from "../../src/shared/constants.js";

test("resolveHomeDir resolves default home ~/.conmuta when no explicit path is given", () => {
  const expected = join(homedir(), HOME_DIR_NAME);
  assert.equal(resolveHomeDir(), expected);
  assert.equal(resolveHomeDir(undefined), expected);
  assert.equal(resolveHomeDir(""), expected);
});

test("resolveHomeDir resolves explicit path when provided", () => {
  const custom = join(tmpdir(), "custom-conmuta-home");
  assert.equal(resolveHomeDir(custom), resolve(custom));
});

test("ensureHomeDirs creates home, run, and secrets directories with POSIX mode 0o700", () => {
  const tempBase = mkdtempSync(join(tmpdir(), "home-dirs-test-"));
  const homeDir = join(tempBase, "conmuta-home");

  try {
    const dirs = ensureHomeDirs(homeDir);

    assert.equal(dirs.homeDir, homeDir);
    assert.equal(dirs.runDir, join(homeDir, "run"));
    assert.equal(dirs.secretsDir, join(homeDir, "secrets"));

    assert.ok(existsSync(dirs.homeDir), "homeDir must exist");
    assert.ok(existsSync(dirs.runDir), "runDir must exist");
    assert.ok(existsSync(dirs.secretsDir), "secretsDir must exist");

    if (process.platform !== "win32") {
      const homeMode = statSync(dirs.homeDir).mode & 0o777;
      const runMode = statSync(dirs.runDir).mode & 0o777;
      const secretsMode = statSync(dirs.secretsDir).mode & 0o777;

      assert.equal(homeMode, POSIX_PRIVATE_DIR_MODE, "homeDir mode should be 0o700");
      assert.equal(runMode, POSIX_PRIVATE_DIR_MODE, "runDir mode should be 0o700");
      assert.equal(secretsMode, POSIX_PRIVATE_DIR_MODE, "secretsDir mode should be 0o700");
    }
  } finally {
    rmSync(tempBase, { recursive: true, force: true });
  }
});
