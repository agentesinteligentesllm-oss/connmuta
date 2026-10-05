import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

// dist/test/twins.test.js -> repo root is two levels up (dist/test/ -> dist/ -> repo root).
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Below this count the `channel/` walk has found (almost) nothing and the twin rule would pass
 * trivially. The real count at authoring time is 4 (main, daemon-link, doorbell-loop, notify); the
 * floor of 3 tolerates one legitimately merged module without editing this gate, yet still fails if
 * the walk collapses to a stub.
 */
const MIN_CHANNEL_SOURCE_FILES = 3;

/**
 * The same rule for the F7c host adapter (ADR-0036), whose modules live outside `src/` like the F4
 * adapter's. Its real count at authoring time is 3 (`main`, `host`, `constants`); the floor tolerates
 * one legitimately merged module. The gate covers it because the first two directories did not: a new
 * directory outside `src/` would otherwise be the one place the twin rule silently stopped applying,
 * which is exactly how the `channel/` rule came to exist.
 */
const MIN_CHANNEL_PI_SOURCE_FILES = 3;

/**
 * Every `.ts` file under `dir`, relative to `dir`, excluding declaration files.
 *
 * Declaration files (`*.d.ts`) are generated compiler output living alongside hand-written
 * sources in some setups; they never need a hand-written test twin.
 */
function findTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) {
      continue;
    }
    const absolute = join(entry.parentPath, entry.name);
    files.push(relative(dir, absolute));
  }
  return files;
}

/**
 * The test twins that `sourceDir`'s `.ts` files lack, as paths relative to `testDir`.
 *
 * The twin of `<sourceDir>/a/b.ts` is `<testDir>/a/b.test.ts`. Both directories are parameters because
 * the layouts differ: a `src/a/b.ts` twin sits directly under `test/` (`test/a/b.test.ts`), while a
 * `channel/x.ts` twin sits under `test/channel/` (`test/channel/x.test.ts`), one extra segment.
 */
function findMissingTwins(sourceDir: string, testDir: string): string[] {
  return findTsFiles(sourceDir)
    .map((relativeSourcePath) => relativeSourcePath.replace(/\.ts$/, ".test.ts"))
    .filter((relativeTestPath) => !existsSync(join(testDir, relativeTestPath)));
}

test("every src/**/*.ts file has a test/**/<same>.test.ts twin", () => {
  const srcDir = join(REPO_ROOT, "src");
  const testDir = join(REPO_ROOT, "test");

  const srcFiles = findTsFiles(srcDir);

  // Non-vacuous: the walk must actually find production source files, otherwise this test would
  // pass trivially even if the twin rule were broken.
  assert.ok(srcFiles.length > 0, "expected at least one src/**/*.ts file to check for a twin");

  const missingTwins = findMissingTwins(srcDir, testDir);

  assert.deepEqual(missingTwins, [], `missing test twin(s) for: ${missingTwins.join(", ")}`);
});

test("every channel/**/*.ts file has a test/channel/**/<same>.test.ts twin", () => {
  const channelDir = join(REPO_ROOT, "channel");

  // Non-vacuous, as above: an empty walk would pass without checking a single twin.
  const channelFiles = findTsFiles(channelDir);
  assert.ok(
    channelFiles.length >= MIN_CHANNEL_SOURCE_FILES,
    `expected at least ${MIN_CHANNEL_SOURCE_FILES} channel/**/*.ts files to check for a twin, found ${channelFiles.length}`,
  );

  const missingTwins = findMissingTwins(channelDir, join(REPO_ROOT, "test", "channel"));

  assert.deepEqual(missingTwins, [], `missing test twin(s) for: ${missingTwins.join(", ")}`);
});

test("every channel-pi/**/*.ts file has a test/channel-pi/**/<same>.test.ts twin", () => {
  const channelPiDir = join(REPO_ROOT, "channel-pi");

  // Non-vacuous, as above: an empty walk would pass without checking a single twin.
  const channelPiFiles = findTsFiles(channelPiDir);
  assert.ok(
    channelPiFiles.length >= MIN_CHANNEL_PI_SOURCE_FILES,
    `expected at least ${MIN_CHANNEL_PI_SOURCE_FILES} channel-pi/**/*.ts files to check for a twin, found ${channelPiFiles.length}`,
  );

  const missingTwins = findMissingTwins(channelPiDir, join(REPO_ROOT, "test", "channel-pi"));

  assert.deepEqual(missingTwins, [], `missing test twin(s) for: ${missingTwins.join(", ")}`);
});

test("twin finder reports a source file with no twin and ignores declaration files (seeded negative)", () => {
  const root = mkdtempSync(join(tmpdir(), "twins-"));
  try {
    const sourceDir = join(root, "source");
    const testDir = join(root, "tests");
    mkdirSync(sourceDir);
    mkdirSync(testDir);
    writeFileSync(join(sourceDir, "a.ts"), "");
    writeFileSync(join(sourceDir, "b.ts"), "");
    writeFileSync(join(sourceDir, "types.d.ts"), "");
    writeFileSync(join(testDir, "a.test.ts"), "");

    assert.deepEqual(findMissingTwins(sourceDir, testDir), ["b.test.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
