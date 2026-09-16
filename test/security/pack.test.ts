import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

// dist/test/security/pack.test.js -> repo root is three levels up
// (dist/test/security/ -> dist/test/ -> dist/ -> repo root).
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const PACKAGE_JSON_WHITELIST = ["dist/src/**", "npm-shrinkwrap.json", "package.json", "README.md", "LICENSE"];
const FORBIDDEN_LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prepare"];

interface NpmPackEntry {
  files: Array<{ path: string }>;
}

/**
 * Runs `npm pack --dry-run --json` against `cwd` and returns its parsed entry.
 *
 * On Windows, `npm` resolves to `npm.cmd`, a batch file; spawning a `.cmd` via `execFileSync`
 * without `shell: true` throws `EINVAL` since Node's CVE-2024-27980 hardening. Rather than
 * re-enabling a shell (which reopens the class of injection that hardening closed), this invokes
 * the `npm-cli.js` entry point directly with the current Node binary — the same executable that
 * ships alongside `npm` in every official Node distribution (local installs and
 * `actions/setup-node` alike).
 */
function runNpmPackDryRun(cwd: string): NpmPackEntry {
  const output =
    process.platform === "win32"
      ? spawnSyncNpmCli(cwd)
      : execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd, shell: false, encoding: "utf8" });

  const parsed = JSON.parse(output) as NpmPackEntry[];
  return parsed[0];
}

function spawnSyncNpmCli(cwd: string): string {
  const npmCliPath = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const result = spawnSync(process.execPath, [npmCliPath, "pack", "--dry-run", "--json"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run failed (status ${String(result.status)}): ${result.stderr}`);
  }
  return result.stdout;
}

/** Whether `path` matches one of `PACKAGE_JSON_WHITELIST`'s entries (a `dist/src/**` prefix glob or an exact file name). */
function isWhitelisted(path: string): boolean {
  return PACKAGE_JSON_WHITELIST.some((pattern) =>
    pattern.endsWith("/**") ? path.startsWith(`${pattern.slice(0, -3)}/`) : path === pattern,
  );
}

test("npm pack --dry-run lists only the declared whitelist (PT-21)", () => {
  const entry = runNpmPackDryRun(REPO_ROOT);
  const packedPaths = entry.files.map((file) => file.path);

  const unexpected = packedPaths.filter((path) => !isWhitelisted(path));
  assert.deepEqual(unexpected, [], `unexpected packed path(s): ${unexpected.join(", ")}`);
  assert.ok(packedPaths.length > 0, "expected npm pack to report at least one file");

  // `tsc`'s incremental build info carries absolute build-machine paths (T11/T12); it must never
  // reach the tarball even though it lands under the whitelisted `dist/src/**` glob.
  const tsBuildInfoLeaks = packedPaths.filter((path) => path.endsWith(".tsbuildinfo"));
  assert.deepEqual(tsBuildInfoLeaks, [], `tsbuildinfo build artifact(s) must not be packed: ${tsBuildInfoLeaks.join(", ")}`);
});

test("package.json declares the exact PT-21 files whitelist", () => {
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    files: string[];
  };
  assert.deepEqual(packageJson.files, PACKAGE_JSON_WHITELIST);
});

test("package.json has no install lifecycle script (PT-21)", () => {
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};
  const present = FORBIDDEN_LIFECYCLE_SCRIPTS.filter((name) => name in scripts);
  assert.deepEqual(present, [], `forbidden lifecycle script(s) present: ${present.join(", ")}`);
});

test("npm-shrinkwrap.json is present and committed (PT-21)", () => {
  assert.ok(existsSync(join(REPO_ROOT, "npm-shrinkwrap.json")), "npm-shrinkwrap.json must exist at the repo root");
});
