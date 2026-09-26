/**
 * Provenance: telegram-agent-bus test/security.test.ts:25-101 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: b3f99f3a068e74ee037d6ef7abb6b3b11ae14e65091be7096337c70203d4d594
 *   (lines 25-101, LF-normalized, including the terminating newline. Reproduce with a sha256 over
 *    the frozen checkout, or see `test/fixtures/v1-provenance.json`.)
 * Changes: (1) extracted lines 25-101 into a reusable module; (2) imports relocated; (3)
 * DIST_SRC_DIR's relative URL changed from `../src/` to `../../src/` — v1's security.test.ts sits
 * directly under `test/`, this module sits one level deeper under `test/security/`, so reaching
 * `dist/src/` from the compiled file's own directory needs one extra `../`; (4) every function and
 * the DIST_SRC_DIR constant gained a trailing named export so predicates.test.ts, closure.ts (both
 * PR-39) and PR-40's bundle-assertion tables can reuse them — v1 exported nothing because everything
 * lived in one file.
 */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DIST_SRC_DIR = fileURLToPath(new URL("../../src/", import.meta.url));

function listJsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(join(entry.parentPath, entry.name));
    }
  }
  return files;
}

function relPosix(file: string): string {
  return relative(DIST_SRC_DIR, file).split("\\").join("/");
}

// --- Detector predicates (production logic for THIS test file only — no runtime app needs them) ---

function hasChildProcessReference(source: string): boolean {
  return source.includes("child_process");
}

function hasFsModuleReference(source: string): boolean {
  return /(?:require\(\s*["']node:fs["']\s*\)|from\s+["']node:fs["'])/.test(source);
}

function hasSettingsPathReference(source: string): boolean {
  return source.includes(".claude/settings") || source.includes("permissions.allow");
}

/** Matches an actual `deleteMessage` definition or call site (immediately followed by `(`) — never a bare mention in prose/comments documenting its absence. */
function hasDeleteMessageCallOrDefinition(source: string): boolean {
  return /deleteMessage\s*\(/.test(source);
}

function hasAutonomousTimerReference(source: string): boolean {
  return /\bset(?:Interval|Timeout|Immediate)\s*\(/.test(source);
}

/**
 * ADR-06 layer 2 promises TWO things — "No timer, **no background task**" — and until this was
 * added only the first half had a test that could fail.
 *
 * The gap was reachable, not theoretical: a long-poll loop written as `for (;;) { await
 * client.getUpdates({ timeout: 50 }) }` contains no timer at all. It would have passed
 * `hasAutonomousTimerReference` cleanly while being exactly the background task the ADR forbids,
 * and the project's own governing rule (ADR-12) is that a documented guarantee must be backed by a
 * test that can fail. This is that test.
 *
 * The bridge has no legitimate unbounded loop — every one of its operations is driven by a single
 * tool call and terminates — so this is a closed prohibition, not a heuristic with exceptions.
 */
function hasUnboundedLoopReference(source: string): boolean {
  return /\bfor\s*\(\s*;\s*;\s*\)|\bwhile\s*\(\s*(?:true|1|!0)\s*\)/.test(source);
}

/**
 * The other way to build a background task without naming a timer: `node:timers/promises` exports
 * `setTimeout`, `setInterval` and `scheduler.wait`, and `await scheduler.wait(15000)` is a sleep
 * that `hasAutonomousTimerReference`'s pattern does not match.
 *
 * Banning the module outright closes that by construction rather than by enumerating its exports —
 * the same reasoning ADR-12 used when it escaped `<` instead of stripping known tag names.
 */
function hasTimersModuleReference(source: string): boolean {
  return /["']node:timers(?:\/promises)?["']/.test(source);
}

function sendMessageCallLines(source: string): string[] {
  return source.split(/\r?\n/).filter((line) => line.includes(".sendMessage("));
}

/** True when `line` has leading whitespace — i.e. it is nested inside a block (a class method body), never a bare module-level statement starting at column 0. */
function isIndentedCallSite(line: string): boolean {
  return line.length > 0 && (line[0] === " " || line[0] === "\t");
}

export {
  DIST_SRC_DIR,
  listJsFiles,
  relPosix,
  hasChildProcessReference,
  hasFsModuleReference,
  hasSettingsPathReference,
  hasDeleteMessageCallOrDefinition,
  hasAutonomousTimerReference,
  hasUnboundedLoopReference,
  hasTimersModuleReference,
  sendMessageCallLines,
  isIndentedCallSite,
};
