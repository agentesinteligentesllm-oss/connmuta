import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// dist/test/security/repo-scan.test.js -> repo root is three levels up
// (dist/test/security/ -> dist/test/ -> dist/ -> repo root).
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Telegram bot-token shape: `\d{8,10}:[A-Za-z0-9_-]{35}` (`v1:src/secrets.ts:16`). */
const TOKEN_SHAPE_RE = /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/;

/**
 * Synthetic tenant markers used only to prove the deny-list scan can fail (PT-22).
 *
 * These are placeholders invented for this test, never real production identifiers — the
 * Director's data-hygiene rule (AGENTS.md §3) forbids copying real bot usernames, user ids, or
 * chat ids into this repository.
 */
const TENANT_DENY_LIST = ["ORION-OCG-INTERNAL", "@orion_prod_bot"];

const FIXTURE_RELATIVE_PATH = "test/fixtures/repo-scan-negative.txt";
const SELF_RELATIVE_PATH = "test/security/repo-scan.test.ts";

/**
 * Files the clean-tree scan skips, each for a stated reason:
 * - the seeded negative fixture, which exists to fail the scan (checked separately below);
 * - this file, which defines the deny-list literally and would otherwise match itself once tracked;
 * - `npm-shrinkwrap.json`, generated content carrying npm integrity hashes, not human-authored text.
 */
const EXCLUDED_FILES = new Set([FIXTURE_RELATIVE_PATH, SELF_RELATIVE_PATH, "npm-shrinkwrap.json"]);

function listTrackedFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, shell: false, encoding: "utf8" });
  return output.split("\0").filter((path) => path.length > 0);
}

function isBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

interface ScanHit {
  path: string;
  tokenShape: boolean;
  denyList: boolean;
}

function scanFile(relativePath: string): ScanHit | undefined {
  const buffer = readFileSync(join(REPO_ROOT, relativePath));
  if (isBinary(buffer)) {
    return undefined;
  }
  const content = buffer.toString("utf8");
  const tokenShape = TOKEN_SHAPE_RE.test(content);
  const denyList = TENANT_DENY_LIST.some((marker) => content.includes(marker));
  if (!tokenShape && !denyList) {
    return undefined;
  }
  return { path: relativePath, tokenShape, denyList };
}

test("repository scan over tracked files is clean (PT-22)", () => {
  const trackedFiles = listTrackedFiles().filter(
    (path) => !EXCLUDED_FILES.has(path),
  );
  assert.ok(trackedFiles.length > 0, "expected git ls-files to report at least one tracked file");

  const hits = trackedFiles
    .map((path) => scanFile(path))
    .filter((hit): hit is ScanHit => hit !== undefined);

  assert.deepEqual(hits, [], `unexpected token-shape or deny-list hit(s): ${JSON.stringify(hits)}`);
});

test("the seeded negative fixture fails the scan for both patterns (non-vacuous)", () => {
  const hit = scanFile(FIXTURE_RELATIVE_PATH);
  assert.ok(hit !== undefined, "expected the seeded fixture to trigger the scan");
  assert.equal(hit?.tokenShape, true);
  assert.equal(hit?.denyList, true);
});
