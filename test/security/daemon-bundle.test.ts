/**
 * Static bundle-conformance assertions for the daemon (design.md §14 "Daemon closure
 * (`daemon/main.js`)" column plus its CLI-closure paragraph; PT-28). New test-only code, no v1
 * equivalent — carries no vendoring header of its own.
 *
 * The daemon's real entry point (`daemon/main.js`) reaches everything through `bootstrap.js` via a
 * dynamic `import()` (D-25) — `computeClosure` follows that (PR-40a), and PR-40a's own composition-root
 * wiring is what makes this closure non-vacuous at all: before it, `daemon/main.js`'s closure was 4
 * files (`daemon/main.js`, `daemon/node-floor.js`, `daemon/lifecycle/lock.js`, `shared/constants.js`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeClosure, bareSpecifiers } from "./closure.js";
import {
  DIST_SRC_DIR,
  relPosix,
  hasFsModuleReference,
  hasSettingsPathReference,
  hasDeleteMessageCallOrDefinition,
  hasAutonomousTimerReference,
  hasUnboundedLoopReference,
  hasTimersModuleReference,
  sendMessageCallLines,
  isIndentedCallSite,
} from "./predicates.js";

const DAEMON_ENTRY = join(DIST_SRC_DIR, "daemon/main.js");
const CLI_ENTRY = join(DIST_SRC_DIR, "cli/main.js");

/** Real count at authoring time is 61 (PR-40a); this floor catches a silent closure collapse. */
const MIN_DAEMON_BUNDLE_FILES = 40;

function bundleContents(entry: string): Map<string, string> {
  const contents = new Map<string, string>();
  for (const file of computeClosure(entry)) {
    contents.set(relPosix(file), readFileSync(file, "utf8"));
  }
  return contents;
}

function daemonBundleContents(): Map<string, string> {
  return bundleContents(DAEMON_ENTRY);
}

test("daemon bundle: closure is non-vacuous and reaches the expected sentinel modules", () => {
  const contents = daemonBundleContents();
  assert.ok(
    contents.size >= MIN_DAEMON_BUNDLE_FILES,
    `daemon closure has only ${contents.size} files, expected at least ${MIN_DAEMON_BUNDLE_FILES} — PR-40a's own lesson: a dynamic import silently truncates a static-only walker`,
  );
  for (const sentinel of [
    "daemon/main.js",
    "daemon/bootstrap.js",
    "daemon/admission.js",
    "daemon/poller.js",
    "daemon/telegram.js",
    "daemon/ipc/routes.js",
    "daemon/ipc/server.js",
    "daemon/transport/dual.js",
    "daemon/send/send-path.js",
    "daemon/serve/fetch.js",
    "ledger/open.js",
    "registry/loader.js",
    "secret-store/index.js",
  ]) {
    assert.ok(contents.has(sentinel), `expected ${sentinel} in the daemon closure`);
  }
});

/**
 * Real-import-anchored check, mirroring `predicates.ts`'s own `hasFsModuleReference` style. The shared
 * `hasChildProcessReference` predicate (predicates.ts, naive `source.includes("child_process")`) has a
 * known blind spot found while writing this test: `secret-store/file-fallback.ts`'s own doc comment
 * reads "daemon bundle stays free of `child_process`" — a disclosure sentence, not an import, but the
 * naive substring check cannot tell the two apart. Not fixed here (predicates.ts is out of this PR's
 * scope, and PR-39's own SEAM/AS-IS-audited detector stays unmodified); this test uses a real-import
 * anchor instead of `hasChildProcessReference` for the daemon-wide "forbidden anywhere" assertion.
 */
const CHILD_PROCESS_IMPORT_RE = /(?:require\(\s*["']node:child_process["']\s*\)|from\s+["']node:child_process["'])/;
const NODE_SQLITE_RE = /(?:require\(\s*["']node:sqlite["']\s*\)|from\s+["']node:sqlite["'])/;
const TELEGRAM_API_URL_RE = /["']https?:\/\/api\.telegram\.org/;

test("daemon bundle: child_process is forbidden anywhere in the closure (PT-28)", () => {
  const contents = daemonBundleContents();
  for (const [path, source] of contents) {
    assert.equal(CHILD_PROCESS_IMPORT_RE.test(source), false, `${path} must not import node:child_process`);
  }
});

test("daemon bundle: child_process detection is non-vacuous, and does not fire on a disclosure comment mentioning it (seeded)", () => {
  assert.equal(CHILD_PROCESS_IMPORT_RE.test('import { spawn } from "node:child_process";'), true);
  assert.equal(CHILD_PROCESS_IMPORT_RE.test("// this bundle stays free of `child_process`"), false);
});

/**
 * B-100(b): computeClosure only follows relative specifiers, so a bare specifier wrapping process
 * spawning (a cross-spawn/execa-style dependency) would evade the child_process check above without
 * ever entering this closure's own file set (channel-bundle.test.ts's own module doc names this exact
 * gap). This test makes the daemon bundle's external dependency surface explicit: a new bare specifier
 * fails here until deliberately reviewed and added below — it does not inspect what an allow-listed
 * package's own code does internally.
 */
const ALLOWED_DAEMON_BARE_SPECIFIERS: readonly string[] = [
  "@napi-rs/keyring",
  "node:crypto",
  "node:events",
  "node:fs",
  "node:http",
  "node:os",
  "node:path",
  "node:sqlite",
  "zod",
];

test("daemon bundle: bare (non-relative) specifiers are confined to the reviewed allow-list (B-100b)", () => {
  const contents = daemonBundleContents();
  const bare = new Set<string>();
  for (const source of contents.values()) {
    for (const specifier of bareSpecifiers(source)) bare.add(specifier);
  }
  assert.deepEqual([...bare].sort(), ALLOWED_DAEMON_BARE_SPECIFIERS);
});

test("daemon bundle: bare-specifier detection is non-vacuous (seeded)", () => {
  assert.deepEqual(bareSpecifiers('import cp from "cross-spawn";'), ["cross-spawn"]);
  assert.deepEqual(bareSpecifiers('import { x } from "./relative.js";'), []);
});

test("daemon bundle: node:fs is confined to the allow-listed home-scoped modules, and registry/*.js never writes (R6)", () => {
  const contents = daemonBundleContents();
  const matches = [...contents.entries()].filter(([, source]) => hasFsModuleReference(source)).map(([p]) => p).sort();
  assert.deepEqual(matches, [
    "daemon/home.js",
    "daemon/lifecycle/lock.js",
    "daemon/lifecycle/run-file.js",
    "daemon/log.js",
    // F3 PR-05: bootstrap.ts wires the panel listener's own run-file sibling (F3 PR-03), the same kind
    // of home-scoped read/write daemon.json's own writer performs — not a panel ASSET read (PT-28's
    // own scope, HTML/CSS/JS never touching node:fs, is unaffected).
    "daemon/panel/panel-run-file.js",
    "ledger/open.js",
    "registry/loader.js",
    "secret-store/file-fallback.js",
  ]);

  const writeRe = /\b(?:writeFileSync|renameSync|unlinkSync|openSync)\(/;
  for (const [path, source] of contents) {
    if (path.startsWith("registry/")) {
      assert.equal(writeRe.test(source), false, `${path} must not write (registry is read-only in the daemon bundle, R6)`);
    }
  }
});

/**
 * F3 PR-09 (spec web-panel "Panel module carries no node:fs reference", PT-28). A dedicated,
 * discoverable test rather than relying on the closed 7-file allow-list above as an incidental
 * proof: that list already implies this (`server.js`/`routes.js` are absent from it), but this
 * names the exact requirement and would fail on its own if either panel-asset module ever grew a
 * node:fs reference, even if the allow-list test above were changed for an unrelated reason.
 *
 * `daemon/panel/panel-run-file.js` is deliberately excluded — it is the panel's run-discovery
 * sibling (F3 PR-03, already allow-listed above), not an HTML/CSS/JS-serving module; the
 * allow-list's own comment already disclosed this distinction.
 */
test("daemon bundle: the panel's HTML/CSS/JS-serving modules carry no node:fs reference (F3 PR-09, PT-28)", () => {
  const contents = daemonBundleContents();
  for (const path of ["daemon/panel/server.js", "daemon/panel/routes.js"]) {
    const source = contents.get(path);
    assert.ok(source !== undefined, `expected ${path} in the daemon bundle closure`);
    assert.equal(hasFsModuleReference(source), false, `${path} serves panel HTML/CSS/JS and must not reference node:fs`);
  }
});

test("daemon bundle: node:sqlite is confined to ledger/*.js", () => {
  const contents = daemonBundleContents();
  const matches = [...contents.entries()].filter(([, source]) => NODE_SQLITE_RE.test(source)).map(([p]) => p).sort();
  assert.ok(matches.length > 0, "expected at least one ledger/*.js file to import node:sqlite");
  for (const path of matches) {
    assert.ok(path.startsWith("ledger/"), `${path} imports node:sqlite but is outside ledger/`);
  }
});

test("daemon bundle: node:sqlite detection does not fire on daemon/main.js's own D-25 comment naming it (seeded)", () => {
  assert.equal(NODE_SQLITE_RE.test("// Dynamic import so node:sqlite and other ESM imports do not load before the gate (D-25)"), false);
});

test("daemon bundle: api.telegram.org appears exactly once, in daemon/telegram.js", () => {
  const contents = daemonBundleContents();
  const matches = [...contents.entries()].filter(([, source]) => TELEGRAM_API_URL_RE.test(source));
  assert.equal(matches.length, 1, `expected exactly one file referencing the Telegram API URL, found: ${matches.map(([p]) => p).join(", ")}`);
  assert.equal(matches[0][0], "daemon/telegram.js");
});

test("daemon bundle: settings paths and deleteMessage( are forbidden anywhere in the daemon closure", () => {
  const contents = daemonBundleContents();
  for (const [path, source] of contents) {
    assert.equal(hasSettingsPathReference(source), false, `${path} must not reference a settings path`);
    assert.equal(hasDeleteMessageCallOrDefinition(source), false, `${path} must not call or define deleteMessage`);
  }
});

test("daemon bundle: timers are confined to poller.js, lifecycle/{heartbeat,idle,timeout}.js and serve/fetch.js, each excluding transport/send from its own closure", () => {
  const contents = daemonBundleContents();
  const matches = [...contents.entries()]
    .filter(([, source]) => hasAutonomousTimerReference(source) || hasTimersModuleReference(source))
    .map(([p]) => p)
    .sort();
  assert.deepEqual(matches, [
    "daemon/lifecycle/heartbeat.js",
    "daemon/lifecycle/idle.js",
    "daemon/lifecycle/timeout.js",
    "daemon/poller.js",
    "daemon/serve/fetch.js",
  ]);

  for (const relPath of matches) {
    const entryClosure = bundleContents(join(DIST_SRC_DIR, relPath));
    for (const path of entryClosure.keys()) {
      assert.equal(
        path.startsWith("daemon/transport/") || path.startsWith("daemon/send/"),
        false,
        `${relPath}'s own closure must exclude daemon/transport/* and daemon/send/*, found ${path}`,
      );
    }
  }
});

/**
 * `predicates.ts`'s `hasUnboundedLoopReference` only matches v1's original `for(;;)`/`while(true|1|!0)`
 * shapes (its own doc comment names exactly that history). `poller.ts`'s real loop is
 * `while (!signal.aborted)` — an `AbortController`-driven shape that is unbounded in practice (it
 * terminates only via an external `signal.abort()` call, never on its own) but does not match that
 * regex at all. Design.md §14's "unbounded loop confined to poller.js" is therefore checked here against
 * the actual shape directly, without editing the shared predicate (out of this PR's scope) — disclosed,
 * not silently patched around.
 */
const ABORT_DRIVEN_LOOP_RE = /\bwhile\s*\(\s*!\w+\.aborted\s*\)/;

test("daemon bundle: the bundle's only background loop is poller.js's while(!signal.aborted) shape", () => {
  const contents = daemonBundleContents();
  const matches = [...contents.entries()].filter(([, source]) => ABORT_DRIVEN_LOOP_RE.test(source)).map(([p]) => p);
  assert.deepEqual(matches, ["daemon/poller.js"]);
});

test("daemon bundle: hasUnboundedLoopReference (the shared predicate) matches nothing in the real closure — a disclosed gap, not a false claim", () => {
  const contents = daemonBundleContents();
  const matches = [...contents.entries()].filter(([, source]) => hasUnboundedLoopReference(source));
  assert.equal(
    matches.length,
    0,
    "hasUnboundedLoopReference is proven capable of firing (predicates.test.ts) but does not match poller.js's while(!signal.aborted) shape",
  );
});

test("daemon bundle: .sendMessage( call lines are confined to the three AS-IS transports plus rate.js's decorator, all indented, with the reverse import graph pinned", () => {
  const contents = daemonBundleContents();
  const withCalls = [...contents.entries()]
    .filter(([, source]) => sendMessageCallLines(source).length > 0)
    .map(([p]) => p)
    .sort();
  // design.md §14 names only the three AS-IS transports. `daemon/send/rate.js`'s `RateLimitRecorder` is a
  // fourth, legitimate call site design.md's table predates (PR-28): it decorates a `TelegramClient` and
  // is wired BELOW `RoomGuardClient` in `bindings.ts`'s `buildTransport` (module doc: "inserted at the
  // BOTTOM of the transport stack, underneath RoomGuardClient"), so its own `this.client.sendMessage(...)`
  // forwarding call never bypasses the room guard — the guard still runs first on every real send.
  // `daemon/ipc/doctor.js`'s DM probe (F2 PR-17, `bus-v2-f2-pr-17-dm-probe-design-001`) is a fifth: it
  // calls `managed.roomGuard.sendMessage(...)` directly, once per roster peer, bypassing `Transport`
  // entirely so a probe never fans out through the group-first `DualWriteTransport.send` path — but the
  // call target is the SAME `RoomGuardClient` instance `bindings.ts` already builds, so `assertTarget`
  // still runs first on every probe send exactly as it does for the three AS-IS transports.
  // Disclosed here rather than silently narrowing the assertion to match design.md's stale list.
  assert.deepEqual(withCalls, [
    "daemon/ipc/doctor.js",
    "daemon/send/rate.js",
    "daemon/transport/direct.js",
    "daemon/transport/group.js",
    "daemon/transport/room-guard.js",
  ]);

  for (const [path, source] of contents) {
    for (const line of sendMessageCallLines(source)) {
      assert.equal(isIndentedCallSite(line), true, `${path}'s .sendMessage( call site must be indented (nested inside a method), got: ${line}`);
    }
  }

  // Reverse import graph: transport/* imported only by daemon/send/*, daemon/bindings.js, transport/*;
  // daemon/send/send-path.js imported only by daemon/ipc/routes.js. Checked against every file in the
  // closure's own source text (a relative specifier naming transport/ or send/send-path), not assumed.
  //
  // Disclosed F3 PR-02 exception: `transport/http-guards.js` (F3 PR-01, design's "Shared
  // transport-guard module, parameterized Origin check" decision) is a generic HTTP guard, not part
  // of the outbound Telegram-transport path this allow-list otherwise pins — `daemon/ipc/server.js`
  // is its first caller here, and the panel listener (PR-04) will be its second. It is exempted from
  // this specific allow-list by name rather than widening the list itself, which would also admit an
  // unrelated future transport/* file the outbound-path restriction is meant to catch.
  for (const [path, source] of contents) {
    const transportImports = [...source.matchAll(/from\s+["'][^"']*\/transport\/([^"']+)\.js["']/g)].map((m) => m[1]);
    for (const importedModule of transportImports) {
      if (importedModule === "http-guards") continue;
      const allowed = path === "daemon/bindings.js" || path.startsWith("daemon/send/") || path.startsWith("daemon/transport/");
      assert.ok(allowed, `${path} imports transport/${importedModule}.js but is not daemon/bindings.js, daemon/send/* or daemon/transport/*`);
    }
    const importsSendPath = /from\s+["'][^"']*\/send\/send-path\.js["']/.test(source);
    if (importsSendPath) {
      assert.equal(path, "daemon/ipc/routes.js", `${path} imports send/send-path.js, but design.md §14 says only daemon/ipc/routes.js may`);
    }
  }
});

test("daemon bundle: the shared predicates are non-vacuous against seeded negatives", () => {
  assert.equal(hasSettingsPathReference('".claude/settings.json"'), true);
  assert.equal(hasDeleteMessageCallOrDefinition("client.deleteMessage({ chat_id, message_id });"), true);
  assert.equal(hasAutonomousTimerReference("setInterval(tick, 1000);"), true);
  assert.equal(hasUnboundedLoopReference("while (true) { await poll(); }"), true);
  assert.equal(hasTimersModuleReference('import { setTimeout } from "node:timers/promises";'), true);
  const seededLine = "    return this.client.sendMessage(params);";
  assert.equal(sendMessageCallLines(seededLine).length, 1);
  assert.equal(isIndentedCallSite(seededLine), true);
});

test("cli bundle: settings paths and deleteMessage( are forbidden", () => {
  const contents = bundleContents(CLI_ENTRY);
  assert.ok(contents.size > 0, "expected the CLI closure to be non-empty");
  for (const [path, source] of contents) {
    assert.equal(hasSettingsPathReference(source), false, `${path} must not reference a settings path`);
    assert.equal(hasDeleteMessageCallOrDefinition(source), false, `${path} must not call or define deleteMessage`);
  }
});
