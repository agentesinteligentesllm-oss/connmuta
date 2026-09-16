import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

// dist/test/twins.test.js -> repo root is two levels up (dist/test/ -> dist/ -> repo root).
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

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

test("every src/**/*.ts file has a test/**/<same>.test.ts twin", () => {
  const srcDir = join(REPO_ROOT, "src");
  const testDir = join(REPO_ROOT, "test");

  const srcFiles = findTsFiles(srcDir);

  // Non-vacuous: the walk must actually find production source files, otherwise this test would
  // pass trivially even if the twin rule were broken.
  assert.ok(srcFiles.length > 0, "expected at least one src/**/*.ts file to check for a twin");

  const missingTwins = srcFiles
    .map((relativeSrcPath) => relativeSrcPath.replace(/\.ts$/, ".test.ts"))
    .filter((relativeTestPath) => !existsSync(join(testDir, relativeTestPath)));

  assert.deepEqual(missingTwins, [], `missing test twin(s) for: ${missingTwins.join(", ")}`);
});
