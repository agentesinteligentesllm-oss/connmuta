/**
 * Static bundle-conformance assertions for the installer and doctor (design.md §12 "installer/cli.js"
 * column and its doctor counterpart; sibling of `client-bundle.test.ts`/`daemon-bundle.test.ts`, closing
 * Unit 11's static half). New test-only code, no v1 equivalent (v1 had neither an installer nor a
 * doctor) — carries no vendoring header of its own.
 *
 * **Correction A (disclosed, ratified by Alpha before this PR): the closure root is `cli/main.js`, not
 * `installer/cli.js`.** design.md §12 names `installer/cli.js` as the installer-side closure root, but
 * every import in `src/installer/cli.ts` is `import type` — erased by `tsc` — so its compiled form
 * (`dist/src/installer/cli.js`) has zero import statements and `computeClosure` over it is vacuous.
 * `cli/main.js` is the real entry point that reaches it (and everything else this design column cares
 * about), and is the same entry `daemon-bundle.test.ts`'s own "cli bundle: settings paths and
 * deleteMessage(" test already uses.
 *
 * **Correction B (disclosed): the trust_level/enableAllProjectMcpServers/npx check is write-shaped, not
 * a substring search.** `src/installer/instructions.ts` legitimately contains the literal substring
 * `trust_level` in disclosure prose ("Codex CLI: set trust_level for this project yourself; the
 * installer never writes it."), and `installer/launcher.ts`'s own module doc mentions `npx` by name
 * while explaining why it is not used. A naive `.includes()` check would false-positive on both. The
 * three local regexes below match only a write-shaped literal (a JSON/object key immediately followed
 * by `:`, or a real `npx` invocation token) — mirroring `predicates.ts`'s own module-doc precedent of
 * distinguishing a real call/write site from a doc comment merely naming the pattern — never a bare
 * mention in prose.
 *
 * **A further correction found while writing this test, disclosed rather than silently matching the
 * brief's original assumption:** the CLI closure's `child_process` reference is not confined to a
 * single file. `cli/main.js`'s `mcp` branch dynamically imports `client/main.js`, which pulls in
 * `client/spawn.js` — already the client bundle's own sole `child_process` site (`client-bundle.
 * test.ts`, D-01 frozen argv, `spawnImpl`) — into THIS closure too. `installer/exec.js` is the
 * install-side call site. And `secret-store/file-fallback.ts`'s own doc comment reads "daemon bundle
 * stays free of `child_process`" — a disclosure sentence, not an import — which is the exact known
 * false positive `daemon-bundle.test.ts`'s own module doc already names for the naive
 * `hasChildProcessReference` substring predicate; this closure reaches that same file (the installer
 * writes secrets through it too, `installer/token-ref.js`/`wizards/bot-add.js`'s own secret-store
 * write), so the identical false positive fires here. All three are already independently audited
 * elsewhere or disclosed as prose-only; asserting "exactly one" against the real closure would be a
 * false claim, so this test asserts "exactly these three, and no fourth site" instead. Likewise, the
 * DOCTOR closure is not `child_process`-free: `doctor/checks/system.ts`'s ACL tier legitimately calls
 * `runIcacls` (`installer/exec.js`) to read a directory's ACL on Windows — a real, read-only subprocess
 * call the offline tier's own "no network call" guarantee never disclaimed (a network call and a
 * subprocess call are different things), so this test asserts that one site instead of "none".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeClosure } from "./closure.js";
import {
  DIST_SRC_DIR,
  relPosix,
  hasSettingsPathReference,
  hasDeleteMessageCallOrDefinition,
  hasChildProcessReference,
} from "./predicates.js";

const CLI_ENTRY = join(DIST_SRC_DIR, "cli/main.js");
const DOCTOR_ENTRY = join(DIST_SRC_DIR, "doctor/main.js");
const OFFLINE_ENTRY = join(DIST_SRC_DIR, "doctor/offline.js");

/** Real count at authoring time is 65; this floor catches a silent closure collapse (PR-40a's own lesson). */
const MIN_CLI_BUNDLE_FILES = 40;

function bundleContents(entry: string): Map<string, string> {
  const contents = new Map<string, string>();
  for (const file of computeClosure(entry)) {
    contents.set(relPosix(file), readFileSync(file, "utf8"));
  }
  return contents;
}

function cliBundleContents(): Map<string, string> {
  return bundleContents(CLI_ENTRY);
}

function doctorBundleContents(): Map<string, string> {
  return bundleContents(DOCTOR_ENTRY);
}

/** Occurrences of `needle(` as a real call, never a substring of a longer identifier — mirrors `client-bundle.test.ts`'s own helper. */
function callCount(source: string, needle: string): number {
  const re = new RegExp(`(?<![\\w$])${needle}\\(`, "g");
  return (source.match(re) ?? []).length;
}

// ---------------------------------------------------------------------------
// 1. Non-vacuous closures (Correction A)
// ---------------------------------------------------------------------------

test("installer/doctor bundle: the CLI closure is non-vacuous and reaches the expected sentinel modules (Correction A: cli/main.js, not installer/cli.js)", () => {
  const contents = cliBundleContents();
  assert.ok(
    contents.size >= MIN_CLI_BUNDLE_FILES,
    `CLI closure has only ${contents.size} files, expected at least ${MIN_CLI_BUNDLE_FILES} — the closure walker may have silently truncated`,
  );
  assert.ok(contents.has("cli/main.js"));
  assert.ok(contents.has("installer/cli.js"));
  assert.ok(contents.has("installer/wizards/setup.js"));
  assert.ok(contents.has("installer/wizards/bot-add.js"));
  assert.ok(contents.has("installer/wizards/group-add.js"));
  assert.ok(contents.has("installer/wizards/project-bind.js"));
  assert.equal(contents.has("doctor/main.js"), false, "cli/main.ts wires no doctor verb yet — a pre-existing, disclosed gap (PR-13/PR-14), not something this PR fixes");
});

test("installer/doctor bundle: the DOCTOR closure is non-vacuous and reaches every offline module", () => {
  const contents = doctorBundleContents();
  assert.ok(contents.size > 0, "expected the doctor closure to be non-empty");
  for (const sentinel of ["doctor/main.js", "doctor/offline.js", "doctor/checks/system.js", "doctor/checks/registry.js", "doctor/report.js"]) {
    assert.ok(contents.has(sentinel), `expected ${sentinel} in the doctor closure`);
  }
});

// ---------------------------------------------------------------------------
// 2. settings paths / deleteMessage( forbidden in both closures (design.md §12)
// ---------------------------------------------------------------------------

test("installer/doctor bundle: settings paths and deleteMessage( are forbidden anywhere in either closure", () => {
  for (const contents of [cliBundleContents(), doctorBundleContents()]) {
    for (const [path, source] of contents) {
      assert.equal(hasSettingsPathReference(source), false, `${path} must not reference a settings path`);
      assert.equal(hasDeleteMessageCallOrDefinition(source), false, `${path} must not call or define deleteMessage`);
    }
  }
});

test("installer/doctor bundle: the shared settings-path/deleteMessage predicates are non-vacuous (seeded negative)", () => {
  assert.equal(hasSettingsPathReference('".claude/settings.json"'), true);
  assert.equal(hasDeleteMessageCallOrDefinition("client.deleteMessage({ chat_id, message_id });"), true);
});

// ---------------------------------------------------------------------------
// 3. child_process confinement (disclosed correction over the brief's original "exactly one" claim)
// ---------------------------------------------------------------------------

test("installer/doctor bundle: child_process in the CLI closure is confined to installer/exec.js, client/spawn.js and one disclosed prose-only false positive", () => {
  const contents = cliBundleContents();
  const matches = [...contents.entries()].filter(([, source]) => hasChildProcessReference(source)).map(([p]) => p).sort();
  assert.deepEqual(matches, ["client/spawn.js", "installer/exec.js", "secret-store/file-fallback.js"]);
  assert.match(
    contents.get("secret-store/file-fallback.js")!,
    /daemon bundle stays free of `child_process`/,
    "secret-store/file-fallback.js's match must be exactly the known disclosure-comment false positive, not a real import",
  );

  const execSource = contents.get("installer/exec.js")!;
  assert.equal(callCount(execSource, "execFileSync"), 0, "execFileSync is never called directly — only execImpl, its injectable indirection");
  assert.equal(callCount(execSource, "exec"), 0);
  assert.equal(callCount(execSource, "execSync"), 0);
  assert.equal(callCount(execSource, "spawn"), 0);
  assert.equal(callCount(execSource, "spawnSync"), 0);
  assert.equal(callCount(execSource, "fork"), 0);
  assert.equal(callCount(execSource, "execImpl"), 2, "runIcacls and runReg each call execImpl exactly once");
  assert.match(execSource, /SYSTEM32_DIR_NAME\s*=\s*["']System32["']/);
  assert.match(execSource, /SystemRoot/);
  assert.match(execSource, /\bshell:\s*false\b/);
});

test("installer/doctor bundle: child_process in the DOCTOR closure is confined to installer/exec.js (the ACL tier's real, read-only icacls.exe call)", () => {
  const contents = doctorBundleContents();
  const matches = [...contents.entries()].filter(([, source]) => hasChildProcessReference(source)).map(([p]) => p);
  assert.deepEqual(matches, ["installer/exec.js"]);
});

test("installer/doctor bundle: child_process detection is non-vacuous (seeded negative)", () => {
  assert.equal(hasChildProcessReference('import { execFileSync } from "node:child_process";'), true);
});

// ---------------------------------------------------------------------------
// 4. trust_level / enableAllProjectMcpServers / npx — write-shaped, not substring (Correction B)
// ---------------------------------------------------------------------------

// Correction (native review `review-1be8b7288fa0197f`, R3-write-shaped-regex-blind-spot, CRITICAL):
// the original colon-only forms missed two real write shapes — an ES2015 object-shorthand property
// (`{ trust_level }`, `{ ...cfg, trust_level }`) has no colon at all. The `[{,]\s*<key>\s*[,}]`
// branch below matches a bare key delimited by a brace/comma on both sides — the shape a shorthand
// property or a destructuring binding actually takes in source — without matching the key merely
// named inside a longer prose sentence (`instructions.ts`'s own disclosure line has no adjacent
// brace/comma around the word at all).
const TRUST_LEVEL_WRITE_RE = /(?:["']trust_level["']\s*:|\btrust_level\b\s*:|[{,]\s*trust_level\s*[,}])/;
const ENABLE_ALL_PROJECT_MCP_SERVERS_WRITE_RE =
	/(?:["']enableAllProjectMcpServers["']\s*:|\benableAllProjectMcpServers\b\s*:|[{,]\s*enableAllProjectMcpServers\s*[,}])/;
// Correction (same review, R2-npx-invoke-regex-gap, CRITICAL): the original only matched a literal
// trailing space inside the quotes (`"npx "`) or a bare `npx(` call — missing the realistic
// `spawn("npx", [...])` argv[0] shape (no trailing space) and a template-literal invocation
// (`` `npx ${pkg}` ``). Matches `npx` opened by a quote/backtick and closed by a quote, whitespace, or
// end of string — `` `npx` `` immediately re-closed by another backtick (launcher.ts's own disclosure
// prose) still does not match, since a backtick is not one of the accepted closing characters.
const NPX_INVOKE_RE = /["'`]npx(?=["'\s]|$)|\bnpx\(/;

test("installer/doctor bundle: trust_level/enableAllProjectMcpServers/npx never appear as a write-shaped literal in the CLI closure", () => {
  const contents = cliBundleContents();
  for (const [path, source] of contents) {
    assert.equal(TRUST_LEVEL_WRITE_RE.test(source), false, `${path} must not write a trust_level key`);
    assert.equal(ENABLE_ALL_PROJECT_MCP_SERVERS_WRITE_RE.test(source), false, `${path} must not write an enableAllProjectMcpServers key`);
    assert.equal(NPX_INVOKE_RE.test(source), false, `${path} must not invoke npx`);
  }
});

test("installer/doctor bundle: the write-shaped checks are non-vacuous (seeded positive) and do not fire on legitimate prose (seeded negative)", () => {
  assert.equal(TRUST_LEVEL_WRITE_RE.test('"trust_level": true'), true);
  assert.equal(TRUST_LEVEL_WRITE_RE.test('trust_level: "full"'), true);
  assert.equal(ENABLE_ALL_PROJECT_MCP_SERVERS_WRITE_RE.test('"enableAllProjectMcpServers": true'), true);
  // The realistic argv[0] shape (no artificial trailing space) — the exact gap R2/R3 found.
  assert.equal(NPX_INVOKE_RE.test('spawn("npx", ["create-thing"])'), true);
  assert.equal(NPX_INVOKE_RE.test("npx(args)"), true);
  // A template-literal invocation — the other gap R2/R3 found.
  assert.equal(NPX_INVOKE_RE.test("spawn(`npx ${pkg}`)"), true);
  // ES2015 object-shorthand / destructuring writes — no colon at all, the other half of R3's gap.
  assert.equal(TRUST_LEVEL_WRITE_RE.test("{ trust_level }"), true);
  assert.equal(TRUST_LEVEL_WRITE_RE.test("{ ...cfg, trust_level }"), true);
  assert.equal(ENABLE_ALL_PROJECT_MCP_SERVERS_WRITE_RE.test("{ enableAllProjectMcpServers }"), true);

  // The exact legitimate prose line this correction exists for (installer/instructions.ts) — must stay false.
  assert.equal(
    TRUST_LEVEL_WRITE_RE.test("Codex CLI: set trust_level for this project yourself; the installer never writes it."),
    false,
  );
  // installer/launcher.ts's own module doc names `npx` while explaining why it is not used.
  assert.equal(NPX_INVOKE_RE.test("`npx` does (ADR-0031 context)"), false);
});

test("installer/doctor bundle: the real compiled instructions.js still carries the exact legitimate trust_level prose this correction is pinned against", () => {
  const source = readFileSync(join(DIST_SRC_DIR, "installer/instructions.js"), "utf8");
  assert.ok(
    source.includes("Codex CLI: set trust_level for this project yourself; the installer never writes it."),
    "if this wording changes, re-check TRUST_LEVEL_WRITE_RE against the new line before trusting a green run",
  );
});

// ---------------------------------------------------------------------------
// 5. doctor/offline.js's own (narrower) closure carries no network module
// ---------------------------------------------------------------------------

const NODE_HTTP_RE = /(?:require\(\s*["']node:http["']\s*\)|from\s+["']node:http["'])/;
const NODE_HTTPS_RE = /(?:require\(\s*["']node:https["']\s*\)|from\s+["']node:https["'])/;
const FETCH_CALL_RE = /(?<![\w$])fetch\s*\(/;
// Correction (native review `review-588821941bef5e65`, R2-daemon-telegram-regex-asymmetry, CRITICAL):
// this sibling check only matched the ESM `from` form, unlike NODE_HTTP_RE/NODE_HTTPS_RE immediately
// above, which both cover the CommonJS `require(...)` shape too — a real asymmetry in the same
// zero-network guarantee, not just a style inconsistency.
const DAEMON_TELEGRAM_IMPORT_RE =
  /(?:require\(\s*["'][^"']*daemon\/telegram\.js["']\s*\)|from\s+["'][^"']*daemon\/telegram\.js["'])/;

test("installer/doctor bundle: doctor/offline.js's own closure carries no network module (design.md §9.1's zero-network pin, code-level half)", () => {
  const contents = bundleContents(OFFLINE_ENTRY);
  assert.ok(contents.size > 0, "expected doctor/offline.js's own closure to be non-empty");
  for (const [path, source] of contents) {
    assert.equal(NODE_HTTP_RE.test(source), false, `${path} must not import node:http`);
    assert.equal(NODE_HTTPS_RE.test(source), false, `${path} must not import node:https`);
    assert.equal(FETCH_CALL_RE.test(source), false, `${path} must not call fetch(`);
    assert.equal(DAEMON_TELEGRAM_IMPORT_RE.test(source), false, `${path} must not import daemon/telegram.js`);
  }
});

test("installer/doctor bundle: the offline-closure network predicates are non-vacuous (seeded positive) and do not false-positive on an unrelated identifier (seeded negative)", () => {
  assert.equal(NODE_HTTP_RE.test('import http from "node:http";'), true);
  assert.equal(NODE_HTTPS_RE.test('import https from "node:https";'), true);
  assert.equal(FETCH_CALL_RE.test("await fetch(url);"), true);
  assert.equal(DAEMON_TELEGRAM_IMPORT_RE.test('import { TelegramApiClient } from "../daemon/telegram.js";'), true);
  assert.equal(DAEMON_TELEGRAM_IMPORT_RE.test('const { TelegramApiClient } = require("../daemon/telegram.js");'), true);
  assert.equal(FETCH_CALL_RE.test("await prefetch(url);"), false, "prefetch( must never be mistaken for a real fetch( call");
});
