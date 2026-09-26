/**
 * Static bundle-conformance assertions for the thin client (design.md §14 "Client closure
 * (`client/main.js`)" column; PT-27, PT-07). New test-only code, no v1 equivalent (v1 had no
 * daemon/client split at all) — carries no vendoring header of its own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeClosure } from "./closure.js";
import { DIST_SRC_DIR, relPosix, hasChildProcessReference, hasFsModuleReference } from "./predicates.js";

const CLIENT_ENTRY = join(DIST_SRC_DIR, "client/main.js");

/**
 * Below this count, the closure walker itself has silently regressed (the exact failure mode PR-40a
 * fixed for the daemon side: a dynamic import silently truncating the closure to a handful of files).
 * The real count at authoring time is 18; this floor leaves room for legitimate future files.
 */
const MIN_CLIENT_BUNDLE_FILES = 12;

/** `relPosix` path -> compiled source, for every file in the client closure. */
function clientBundleContents(): Map<string, string> {
  const contents = new Map<string, string>();
  for (const file of computeClosure(CLIENT_ENTRY)) {
    contents.set(relPosix(file), readFileSync(file, "utf8"));
  }
  return contents;
}

/** Occurrences of `needle(` as a real call, never a substring of a longer identifier (e.g. `spawnImpl(` must not count as `spawn(`). */
function callCount(source: string, needle: string): number {
  const re = new RegExp(`(?<![\\w$])${needle}\\(`, "g");
  return (source.match(re) ?? []).length;
}

test("client bundle: closure is non-vacuous and reaches the expected sentinel modules", () => {
  const contents = clientBundleContents();
  assert.ok(
    contents.size >= MIN_CLIENT_BUNDLE_FILES,
    `client closure has only ${contents.size} files, expected at least ${MIN_CLIENT_BUNDLE_FILES} — the closure walker may have silently truncated (PR-40a's own lesson)`,
  );
  assert.ok(contents.has("client/main.js"));
  assert.ok(contents.has("client/spawn.js"));
  assert.ok(contents.has("client/binding.js"));
  assert.ok(contents.has("client/handshake.js"));
});

test("client bundle: child_process is confined to exactly one file, client/spawn.js, with the D-01 frozen-argv shape (PT-27)", () => {
  const contents = clientBundleContents();
  const matches = [...contents.entries()].filter(([, source]) => hasChildProcessReference(source));
  assert.equal(matches.length, 1, `expected exactly one file referencing child_process, found: ${matches.map(([p]) => p).join(", ")}`);
  assert.equal(matches[0][0], "client/spawn.js");

  const spawnSource = matches[0][1];

  // The real call site is `spawnImpl(...)` (an injected indirection over `child_process.spawn`,
  // disclosed in spawn.ts's own module doc as an apply-time refinement over design.md's illustrative
  // no-injection snippet) — never a bare `spawn(...)` call. Assert the real invariant design.md §14
  // cares about (exactly one process-launch call site, frozen argv, no shell) against the actual shape
  // rather than the literal `spawn(` substring design.md's prose names.
  assert.equal(callCount(spawnSource, "spawn"), 0, "spawn is never called directly — only spawnImpl, its injectable indirection");
  assert.equal(callCount(spawnSource, "spawnImpl"), 1);
  assert.equal(callCount(spawnSource, "exec"), 0);
  assert.equal(callCount(spawnSource, "execSync"), 0);
  assert.equal(callCount(spawnSource, "spawnSync"), 0);
  assert.equal(callCount(spawnSource, "fork"), 0);

  assert.match(spawnSource, /spawnImpl\(process\.execPath,\s*\[DAEMON_ENTRY\],\s*SPAWN_OPTIONS\)/);
  assert.match(spawnSource, /\bshell:\s*false\b/);
  assert.match(spawnSource, /\bdetached:\s*true\b/);
  assert.match(spawnSource, /\bwindowsHide:\s*true\b/);
  assert.match(spawnSource, /\bstdio:\s*"ignore"/);
  assert.match(spawnSource, /const DAEMON_ENTRY\s*=\s*fileURLToPath\(new URL\(\s*["'][^"']+["']/);
});

test("client bundle: child_process detection is non-vacuous (seeded negative)", () => {
  assert.equal(hasChildProcessReference('import { spawn } from "node:child_process";'), true);
});

test("client bundle: node:fs is confined to client/binding.js and client/run-state.js", () => {
  const contents = clientBundleContents();
  const matches = [...contents.entries()].filter(([, source]) => hasFsModuleReference(source)).map(([p]) => p).sort();
  assert.deepEqual(matches, ["client/binding.js", "client/run-state.js"]);
});

test("client bundle: node:fs detection is non-vacuous (seeded negative)", () => {
  assert.equal(hasFsModuleReference('import { readFileSync } from "node:fs";'), true);
});

/**
 * Real-import/real-call-anchored checks, mirroring `predicates.ts`'s own `hasFsModuleReference` style
 * (`require(...)`/`from "..."` for a module specifier; an actual `.method(` call for an API method) —
 * NOT a naive substring search. A naive `.includes()` check on these exact strings produces false
 * positives against this project's own doc comments: `src/shared/constants.ts` mentions `getUpdates`
 * and `node:sqlite` in prose describing unrelated constants, and `src/daemon/main.ts:7`'s D-25 comment
 * explains *why* `node:sqlite` must not load early by naming it. predicates.ts has no exported
 * predicate for these four (client-only) checks, so they are defined locally here rather than editing
 * that shared, already-audited module (out of this PR's scope).
 */
const NODE_SQLITE_RE = /(?:require\(\s*["']node:sqlite["']\s*\)|from\s+["']node:sqlite["'])/;
const GET_UPDATES_CALL_RE = /\.getUpdates\s*\(/;
const TELEGRAM_API_URL_RE = /["']https?:\/\/api\.telegram\.org/;
const KEYRING_IMPORT_RE = /["']@napi-rs\/keyring["']/;
const SECRETS_PATH_RE = /["']secrets\//;

test("client bundle: node:sqlite is forbidden anywhere in the closure", () => {
  const contents = clientBundleContents();
  for (const [path, source] of contents) {
    assert.equal(NODE_SQLITE_RE.test(source), false, `${path} must not import node:sqlite`);
  }
});

test("client bundle: api.telegram.org, getUpdates, @napi-rs/keyring and secrets/ are forbidden anywhere in the closure (PT-07)", () => {
  const contents = clientBundleContents();
  for (const [path, source] of contents) {
    assert.equal(TELEGRAM_API_URL_RE.test(source), false, `${path} must not reference the Telegram API URL`);
    assert.equal(GET_UPDATES_CALL_RE.test(source), false, `${path} must not call .getUpdates(`);
    assert.equal(KEYRING_IMPORT_RE.test(source), false, `${path} must not import @napi-rs/keyring`);
    assert.equal(SECRETS_PATH_RE.test(source), false, `${path} must not reference a secrets/ path`);
  }
});

test("client bundle: the forbidden-pattern checks are non-vacuous (seeded negatives)", () => {
  assert.equal(NODE_SQLITE_RE.test('import { DatabaseSync } from "node:sqlite";'), true);
  assert.equal(TELEGRAM_API_URL_RE.test('const url = "https://api.telegram.org/bot";'), true);
  assert.equal(GET_UPDATES_CALL_RE.test("await client.getUpdates(params);"), true);
  assert.equal(KEYRING_IMPORT_RE.test('import kc from "@napi-rs/keyring";'), true);
  assert.equal(SECRETS_PATH_RE.test('readFileSync("secrets/token");'), true);
  // And each must NOT fire on the exact doc-comment prose that tripped a naive substring search:
  assert.equal(NODE_SQLITE_RE.test("// node:sqlite must not load before the gate"), false);
  assert.equal(GET_UPDATES_CALL_RE.test("/** Maximum updates requested per `getUpdates` call */"), false);
});
