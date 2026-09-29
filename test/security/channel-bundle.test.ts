/**
 * Static bundle-conformance assertions for the Claude Code channel adapter (F4 PR-06; spec
 * `channel-doorbell`, requirement "Adapter bundle-closure test bans transport/send/Telegram
 * reachability, not the paced loop's own timer"). New test-only code, no v1 equivalent — carries no
 * vendoring header of its own.
 *
 * Modeled on `client-bundle.test.ts` and `daemon-bundle.test.ts`, with these differences that shape it:
 * - The adapter's own modules live in `dist/channel/`, outside `dist/src/`, so every path here is
 *   relative to `dist/` (`channel/main.js`, `src/client/binding.js`), never to `DIST_SRC_DIR`.
 * - Reachability is judged on closure MEMBERSHIP (paths), never on a substring of source text:
 *   `src/shared/constants.js` and `src/shared/envelope.js` name `daemon/send/validate.ts` in comments,
 *   so a text search would false-positive. design.md:198 asks for no `daemon/` path at all in the
 *   closure, which subsumes the spec's three families (`daemon/transport/*`, `daemon/send/*` and the
 *   Telegram client `daemon/telegram.js`); the seeds keep those three pinned.
 * - The `fs`, `node:sqlite` and `@napi-rs/keyring` bans are anchored on the quoted module specifier,
 *   so every import form is covered (static `from`, bare `import`, dynamic `import()`, `require()`).
 *   The shared `hasFsModuleReference` is not used: it misses `import "node:fs"`, `from "fs"`,
 *   `node:fs/promises` and `import("node:fs")`, and widening it would change the client and daemon
 *   bundle tests.
 * - The adapter's paced loop legitimately arms a timer, so the test pins a closed timer allow-list
 *   instead of asserting "zero timers", which the spec forbids: Invariant 5 bans autonomous emission,
 *   not loops.
 *
 * B-100(b), closed: `computeClosure` follows only relative specifiers, so a bare-specifier dependency
 * (the MCP SDK, zod) wrapping process spawning would evade the `child_process` substring without ever
 * entering the closure's own file set (tasks.md, PR-06 amendment 13, named this as a known limit shared
 * with the client and daemon bundle tests). The "references a bare specifier outside the reviewed
 * allow-list" rule below closes it: any bare specifier not already reviewed and allow-listed fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { computeClosure, bareSpecifiers } from "./closure.js";
import {
  hasAutonomousTimerReference,
  hasChildProcessReference,
  hasTimersModuleReference,
  sendMessageCallLines,
} from "./predicates.js";

/** `dist/`, two levels above this compiled file. Not `DIST_SRC_DIR` (`dist/src/`): the adapter lives in `dist/channel/`. */
const DIST_DIR = fileURLToPath(new URL("../../", import.meta.url));
const CHANNEL_ENTRY = "channel/main.js";

/**
 * Below this count the closure walker has silently regressed (the failure mode `client-bundle.test.ts`
 * guards against too). The real count at authoring time is 16: four `channel/` modules, three
 * `src/client/` modules and nine `src/shared/` modules. The floor leaves room for a legitimate merge
 * or split of modules while still catching a walk that collapsed to a handful of files.
 */
const MIN_CHANNEL_BUNDLE_FILES = 12;

/** Modules the entry's own imports must reach: if one is missing, the walk broke, not the adapter. */
const SENTINEL_MODULES = [
  "channel/main.js",
  "channel/daemon-link.js",
  "channel/doorbell-loop.js",
  "channel/notify.js",
  "src/client/binding.js",
  "src/client/run-file.js",
];

/**
 * The spec's closed `fs` allow-list `{client/binding.js, client/run-file.js}`, expressed relative to
 * `dist/` instead of `dist/src/` (the paths here keep their `src/` segment). `binding.js` is the one
 * project-tree reader (the `conmuta.json` walk-up); `run-file.js` reads the daemon's run file.
 */
const FS_ALLOWLIST: readonly string[] = ["src/client/binding.js", "src/client/run-file.js"];

/** The only closure file allowed to arm a timer: the paced loop's own pacing sleep. */
const TIMER_ALLOWLIST: readonly string[] = ["channel/doorbell-loop.js"];

/**
 * B-100(b): computeClosure only follows relative specifiers, so a bare specifier wrapping process
 * spawning would evade the "references child_process" rule below without ever entering this closure's
 * own file set — the exact gap this file's own module doc (above) already discloses. Makes the
 * closure's external dependency surface explicit: a new bare specifier fails until deliberately
 * reviewed and added here. Does not inspect what an allow-listed package's own code does internally.
 */
const ALLOWED_CHANNEL_BARE_SPECIFIERS: readonly string[] = [
  "@modelcontextprotocol/sdk/server/index.js",
  "@modelcontextprotocol/sdk/server/stdio.js",
  "node:crypto",
  "node:fs",
  "node:os",
  "node:path",
  "zod",
];

/**
 * The one directory the adapter's closure must never enter. Transport, send and Telegram-client code all
 * live under it, and design.md:198 asks for no `daemon/` path at all, which subsumes the spec's three
 * families; the seeds below keep those three pinned.
 */
const FORBIDDEN_PREFIX = "src/daemon/";
const FORBIDDEN_MODULE_RULE = "reaches src/daemon/ (transport, send and Telegram-client code live there; design.md:198 asks for no daemon/ path at all)";

/**
 * Call-anchored, like `client-bundle.test.ts`: a naive substring check false-positives on this
 * project's own doc comments (`src/shared/constants.js` names `getUpdates` in prose). `.sendMessage(`
 * uses the shared `sendMessageCallLines`, which matches nothing in the real closure.
 */
const TELEGRAM_API_URL_RE = /["']https?:\/\/api\.telegram\.org/;
const GET_UPDATES_CALL_RE = /\.getUpdates\s*\(/;

/**
 * Anchored on the quoted module specifier, so every import form matches: static `from`, bare `import`,
 * dynamic `import()` and `require()`. The price is that a comment quoting the literal would match too;
 * the real closure has none. The `fs` pattern covers `node:fs`, `fs`, `node:fs/promises` and `fs/promises`.
 */
const FS_SPECIFIER_RE = /["'](?:node:)?fs(?:\/promises)?["']/;
const SQLITE_SPECIFIER_RE = /["']node:sqlite["']/;
const KEYRING_SPECIFIER_RE = /["']@napi-rs\/keyring["']/;

function isForbiddenModule(path: string): boolean {
  return path.startsWith(FORBIDDEN_PREFIX);
}

interface Rule {
  readonly name: string;
  readonly violates: (path: string, source: string) => boolean;
  /** Synthetic `[path, source]` modules that MUST each trip this rule alone: no rule is an unfalsifiable claim (ADR-12). */
  readonly seeds: ReadonlyArray<readonly [path: string, source: string]>;
}

const RULES: readonly Rule[] = [
  {
    name: FORBIDDEN_MODULE_RULE,
    violates: (path) => isForbiddenModule(path),
    seeds: [
      ["src/daemon/transport/direct.js", "export {};"],
      ["src/daemon/send/send-path.js", "export {};"],
      ["src/daemon/telegram.js", "export {};"],
      // Not one of the spec's three families: pins the whole-tree ban design.md:198 asks for.
      ["src/daemon/home.js", "export {};"],
    ],
  },
  {
    name: "references child_process",
    violates: (_path, source) => hasChildProcessReference(source),
    seeds: [
      ["channel/notify.js", 'import { spawn } from "node:child_process";'],
      // A bare mention in a comment counts too: the predicate is a substring match, per the spec's own note.
      ["channel/notify.js", "// child_process"],
    ],
  },
  {
    name: "references fs or fs/promises outside the allow-list",
    violates: (path, source) => FS_SPECIFIER_RE.test(source) && !FS_ALLOWLIST.includes(path),
    seeds: [
      ["channel/notify.js", 'import { readFileSync } from "node:fs";'],
      // Forms the shared `hasFsModuleReference` misses: bare, un-prefixed, `/promises`, dynamic, `require("fs")`.
      ["channel/notify.js", 'import "node:fs";'],
      ["channel/notify.js", 'import fs from "fs";'],
      ["channel/notify.js", 'import { readFile } from "node:fs/promises";'],
      ["channel/notify.js", 'const fs = await import("node:fs");'],
      ["channel/notify.js", 'const fs = require("fs");'],
    ],
  },
  {
    name: "references node:sqlite",
    violates: (_path, source) => SQLITE_SPECIFIER_RE.test(source),
    seeds: [
      ["channel/notify.js", 'import { DatabaseSync } from "node:sqlite";'],
      ["channel/notify.js", 'import "node:sqlite";'],
      ["channel/notify.js", 'const db = await import("node:sqlite");'],
      ["channel/notify.js", 'const db = require("node:sqlite");'],
    ],
  },
  {
    name: "references @napi-rs/keyring",
    violates: (_path, source) => KEYRING_SPECIFIER_RE.test(source),
    seeds: [
      ["channel/notify.js", 'import keyring from "@napi-rs/keyring";'],
      ["channel/notify.js", 'import "@napi-rs/keyring";'],
      ["channel/notify.js", 'const keyring = await import("@napi-rs/keyring");'],
      ["channel/notify.js", 'const keyring = require("@napi-rs/keyring");'],
    ],
  },
  {
    name: "references a bare specifier outside the reviewed allow-list",
    violates: (_path, source) => bareSpecifiers(source).some((s) => !ALLOWED_CHANNEL_BARE_SPECIFIERS.includes(s)),
    seeds: [["channel/notify.js", 'import cp from "cross-spawn";']],
  },
  {
    name: "arms a timer outside the allow-list",
    violates: (path, source) => hasAutonomousTimerReference(source) && !TIMER_ALLOWLIST.includes(path),
    seeds: [["channel/daemon-link.js", "setTimeout(tick, 1000);"]],
  },
  {
    name: "references node:timers",
    violates: (_path, source) => hasTimersModuleReference(source),
    seeds: [["channel/notify.js", 'import { scheduler } from "node:timers/promises";']],
  },
  {
    name: "references the Telegram API URL",
    violates: (_path, source) => TELEGRAM_API_URL_RE.test(source),
    seeds: [["channel/notify.js", 'const url = "https://api.telegram.org/bot";']],
  },
  {
    name: "calls .getUpdates(",
    violates: (_path, source) => GET_UPDATES_CALL_RE.test(source),
    seeds: [["channel/notify.js", "await client.getUpdates(params);"]],
  },
  {
    name: "calls .sendMessage(",
    violates: (_path, source) => sendMessageCallLines(source).length > 0,
    seeds: [["channel/notify.js", "return this.client.sendMessage(params);"]],
  },
];

/**
 * Every rule the closure breaks, as `<path>: <rule>` labels; `[]` means clean. Pure over
 * `relPath -> source`, so the real bundle and the seeded fixtures are judged by the same code.
 */
function findViolations(contents: ReadonlyMap<string, string>): string[] {
  return [...contents].flatMap(([path, source]) =>
    RULES.filter((rule) => rule.violates(path, source)).map((rule) => `${path}: ${rule.name}`),
  );
}

function relToDist(file: string, distDir: string = DIST_DIR): string {
  return relative(distDir, file).split("\\").join("/");
}

/** `relToDist` path -> compiled source, for every file in the closure of `entry` (a path relative to `distDir`). */
function bundleContents(entry: string, distDir: string = DIST_DIR): Map<string, string> {
  const contents = new Map<string, string>();
  for (const file of computeClosure(join(distDir, entry))) {
    contents.set(relToDist(file, distDir), readFileSync(file, "utf8"));
  }
  return contents;
}

/** Sorted paths of the modules whose source satisfies `predicate`. */
function pathsMatching(contents: ReadonlyMap<string, string>, predicate: (source: string) => boolean): string[] {
  return [...contents]
    .filter(([, source]) => predicate(source))
    .map(([path]) => path)
    .sort();
}

test("channel bundle: closure is non-vacuous and reaches the expected sentinel modules", () => {
  const contents = bundleContents(CHANNEL_ENTRY);
  assert.ok(
    contents.size >= MIN_CHANNEL_BUNDLE_FILES,
    `channel closure has only ${contents.size} files, expected at least ${MIN_CHANNEL_BUNDLE_FILES} — the closure walker may have silently truncated`,
  );
  for (const sentinel of SENTINEL_MODULES) {
    assert.ok(contents.has(sentinel), `expected ${sentinel} in the channel closure`);
  }
});

test("channel bundle: no module reaches src/daemon/, child_process, node:sqlite, keyring, foreign fs or timers, or a Telegram call", () => {
  assert.deepEqual(findViolations(bundleContents(CHANNEL_ENTRY)), []);
});

test("channel bundle: fs is confined to exactly the spec's client/binding.js and client/run-file.js, in every import form", () => {
  assert.deepEqual(pathsMatching(bundleContents(CHANNEL_ENTRY), (source) => FS_SPECIFIER_RE.test(source)), FS_ALLOWLIST);
});

test("channel bundle: the pacing timer passes — only doorbell-loop.js arms one, nothing imports node:timers, and its own closure excludes src/daemon/", () => {
  const contents = bundleContents(CHANNEL_ENTRY);
  assert.deepEqual(pathsMatching(contents, hasAutonomousTimerReference), TIMER_ALLOWLIST);
  assert.deepEqual(pathsMatching(contents, hasTimersModuleReference), []);

  for (const timerModule of TIMER_ALLOWLIST) {
    const ownClosure = [...bundleContents(timerModule).keys()];
    // A walk that followed no import would satisfy the exclusion below vacuously.
    assert.notDeepEqual(ownClosure, [timerModule], `${timerModule}'s own closure holds nothing but itself`);
    assert.deepEqual(ownClosure.filter(isForbiddenModule), [], `${timerModule}'s own closure must exclude src/daemon/ modules`);
  }
});

test("channel bundle: src/daemon/ exists in dist/, so the whole-tree ban protects something real", () => {
  assert.ok(existsSync(join(DIST_DIR, FORBIDDEN_PREFIX)), `${FORBIDDEN_PREFIX} does not exist under dist/, so banning it would protect nothing`);
});

for (const rule of RULES) {
  test(`channel bundle: the "${rule.name}" rule is non-vacuous (seeded negatives)`, () => {
    assert.ok(rule.seeds.length > 0, "a rule without a seed cannot be shown to fail");
    for (const [path, source] of rule.seeds) {
      // A seed may legitimately trip more than one rule when it uses a bare specifier that is
      // independently forbidden by name too (e.g. node:sqlite, @napi-rs/keyring, node:timers/promises
      // all also violate "references a bare specifier outside the reviewed allow-list", B-100b) — assert
      // this rule's own violation fires, not that it fires alone.
      const violations = findViolations(new Map([[path, source]]));
      assert.ok(
        violations.includes(`${path}: ${rule.name}`),
        `expected "${path}: ${rule.name}" among violations, got: ${violations.join(", ") || "none"}`,
      );
    }
  });
}

test("channel bundle: the allow-listed modules are not violations (seeded positives)", () => {
  const contents = new Map([
    // The spec's "pacing timer passes" scenario: the paced loop arms a timer and is still clean.
    ["channel/doorbell-loop.js", "const timer = setTimeout(resolve, delayMs);"],
    ["src/client/binding.js", 'import { readFileSync } from "node:fs";'],
    ["src/client/run-file.js", 'import { readFileSync } from "node:fs";'],
  ]);
  assert.deepEqual(findViolations(contents), []);
});

test("channel bundle: the walk catches a forbidden module two hops from the entry (temp-dir fixture)", () => {
  const distDir = mkdtempSync(join(tmpdir(), "channel-bundle-"));
  try {
    // Laid out like `dist/`: entry -> mid -> a transport module the entry never names itself.
    const files = {
      "channel/main.js": 'import "./mid.js";',
      "channel/mid.js": 'import "../src/daemon/transport/x.js";',
      "src/daemon/transport/x.js": "export {};",
    };
    for (const [relPath, source] of Object.entries(files)) {
      const file = join(distDir, relPath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, source);
    }

    const contents = bundleContents(CHANNEL_ENTRY, distDir);

    assert.deepEqual([...contents.keys()].sort(), Object.keys(files).sort());
    assert.deepEqual(findViolations(contents), [`src/daemon/transport/x.js: ${FORBIDDEN_MODULE_RULE}`]);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});
