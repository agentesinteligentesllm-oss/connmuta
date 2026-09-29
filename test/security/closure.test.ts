import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { computeClosure, bareSpecifiers } from "./closure.js";

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

test("computeClosure follows a dynamic import(\"./...\") call, not just a static import/export ... from specifier", () => {
  // src/daemon/main.ts's own D-25 gate reaches src/daemon/bootstrap.ts through exactly this form
  // (`await import("./bootstrap.js")`) — a walker that only understood static specifiers would silently
  // stop at daemon/main.js and report a near-empty daemon closure.
  const closure = computeClosure(fixturePath("dynamic-entry.js"));

  assert.equal(closure.size, 2);
  assert.ok(closure.has(fixturePath("dynamic-entry.js")));
  assert.ok(closure.has(fixturePath("dynamic-target.js")));
});

// B-100(b): computeClosure only follows relative specifiers, so a bare-specifier dependency wrapping
// process spawning would evade the child_process check in the daemon/client/channel bundle tests
// without ever entering the closure's own file set (channel-bundle.test.ts's own module doc names this
// exact gap). bareSpecifiers makes that surface explicit instead of leaving it invisible.

test("bareSpecifiers extracts a bare specifier from a static import ... from statement, and ignores a relative one", () => {
  assert.deepEqual(bareSpecifiers('import { spawn } from "cross-spawn";'), ["cross-spawn"]);
  assert.deepEqual(bareSpecifiers('import { x } from "./relative.js";'), []);
});

test("bareSpecifiers extracts a bare specifier from a bare import statement and a dynamic import() call", () => {
  assert.deepEqual(bareSpecifiers('import "zod";'), ["zod"]);
  assert.deepEqual(bareSpecifiers('const cp = await import("cross-spawn");'), ["cross-spawn"]);
});

test("bareSpecifiers also catches a require(\"...\") call, as defense in depth (B-100a precedent: hasFsModuleReference treats require() as a live form even where currently unobserved)", () => {
  assert.deepEqual(bareSpecifiers('const cp = require("cross-spawn");'), ["cross-spawn"]);
});

test("bareSpecifiers rejects every relative form across all four statement shapes (seeded negative)", () => {
  const source = [
    'import { a } from "../sibling.js";',
    'import "./local.js";',
    'const y = await import("./dyn.js");',
    'const z = require("./req.js");',
  ].join("\n");
  assert.deepEqual(bareSpecifiers(source), []);
});

test("bareSpecifiers extracts a node: builtin and a scoped package specifier verbatim, without normalizing them", () => {
  const source = 'import { readFileSync } from "node:fs";\nimport kc from "@napi-rs/keyring";';
  assert.deepEqual(bareSpecifiers(source).sort(), ["@napi-rs/keyring", "node:fs"]);
});
