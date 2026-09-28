import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// dist/test/security/instruction-budget.test.js -> repo root is three levels up
// (dist/test/security/ -> dist/test/ -> dist/ -> repo root).
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * `AGENTS.md` is loaded into every agent session on every turn (this repo's own `CLAUDE.md` is
 * just `@AGENTS.md`). On 2026-09-28 its `**Status.**` field had grown, one append at a time
 * across sessions, into a single 78.5k-char line of session-by-session narrative -- pushing the
 * harness's combined instruction-file budget (AGENTS.md plus both CLAUDE.md files, 150k chars
 * total) over its limit. That narrative belongs in `docs/08-sessions/LOG.md` (append-only,
 * designed for exactly this -- see `docs/08-sessions/HANDOFF.md`'s own "History lives in
 * LOG.md -- never here"), not inline in the bootstrap file. See
 * `docs/08-sessions/STATUS-ARCHIVE-2026-09-28.md` for the archived original text.
 */
const AGENTS_MD_RELATIVE_PATH = "AGENTS.md";

/**
 * Whole-file cap for `AGENTS.md`. Current size is ~12.2k chars; this leaves room for years of
 * ordinary structural growth (new sections, new table rows) while stopping any single session
 * from quietly regrowing the file toward the 78.5k-char incident.
 */
const MAX_FILE_CHARS = 30_000;

/**
 * Per-line cap for `AGENTS.md`. Its longest legitimate line (a table row) sits under 2k chars;
 * this catches an unbounded, continuously-appended paragraph -- the actual failure shape of the
 * 2026-09-28 incident -- long before it could threaten the whole-file budget above.
 */
const MAX_LINE_CHARS = 4_000;

type BudgetViolationKind = "file-too-large" | "line-too-long";

interface BudgetViolation {
  kind: BudgetViolationKind;
  detail: string;
}

function checkInstructionBudget(absolutePath: string): BudgetViolation[] {
  const content = readFileSync(absolutePath, "utf8");
  const violations: BudgetViolation[] = [];

  if (content.length > MAX_FILE_CHARS) {
    violations.push({
      kind: "file-too-large",
      detail: `${content.length} chars exceeds the ${MAX_FILE_CHARS}-char whole-file budget`,
    });
  }

  content.split("\n").forEach((line, index) => {
    if (line.length > MAX_LINE_CHARS) {
      violations.push({
        kind: "line-too-long",
        detail: `line ${index + 1} is ${line.length} chars, exceeds the ${MAX_LINE_CHARS}-char per-line budget`,
      });
    }
  });

  return violations;
}

test("AGENTS.md stays within the instruction-file char budget (docs hygiene)", () => {
  const violations = checkInstructionBudget(join(REPO_ROOT, AGENTS_MD_RELATIVE_PATH));
  assert.deepEqual(
    violations,
    [],
    `AGENTS.md violates its char budget -- move narrative to docs/08-sessions/LOG.md instead ` +
      `and leave a short pointer, per docs/08-sessions/HANDOFF.md's own rule: ` +
      `${JSON.stringify(violations)}`,
  );
});

test("the budget check can actually fail on both axes (non-vacuous)", () => {
  const fixturePath = join(REPO_ROOT, "test/fixtures/instruction-budget-negative.md");
  const violations = checkInstructionBudget(fixturePath);

  assert.equal(violations.length, 2, `expected exactly 2 violations: ${JSON.stringify(violations)}`);
  assert.ok(violations.some((v) => v.kind === "file-too-large"));
  assert.ok(violations.some((v) => v.kind === "line-too-long"));
});
