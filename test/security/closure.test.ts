import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { computeClosure } from "./closure.js";

// dist/test/security/closure.test.js -> repo root is three levels up
// (dist/test/security/ -> dist/test/ -> dist/ -> repo root).
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURE_DIR = join(REPO_ROOT, "test/fixtures/security-closure");

function fixturePath(...segments: string[]): string {
  return join(FIXTURE_DIR, ...segments);
}

test("computeClosure resolves a two-hop chain across a directory boundary (entry -> sub/a -> sub/b), excludes an unrelated module, and resolves specifiers against the referencing file's own directory rather than the entry's", () => {
  const closure = computeClosure(fixturePath("entry.js"));

  assert.equal(closure.size, 3);
  assert.ok(closure.has(fixturePath("entry.js")));
  assert.ok(closure.has(fixturePath("sub", "a.js")));
  assert.ok(closure.has(fixturePath("sub", "b.js")));
  assert.ok(!closure.has(fixturePath("unrelated.js")));
  assert.ok(
    !closure.has(fixturePath("b.js")),
    "sub/a.js's './b.js' must resolve to sub/b.js, not to a same-named decoy next to the entry file",
  );
});
