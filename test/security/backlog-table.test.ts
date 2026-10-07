import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// dist/test/security/backlog-table.test.js -> repo root is three levels up
// (dist/test/security/ -> dist/test/ -> dist/ -> repo root).
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The live board: one row per backlog item, and the file the Director reads to decide. */
const BACKLOG_RELATIVE_PATH = "docs/06-backlog/CHECKLIST.md";

/** The seeded negative fixture, which exists to fail the check (asserted separately below). */
const FIXTURE_RELATIVE_PATH = "test/fixtures/backlog-table-negative.md";

/**
 * A row of the board is `| # | Item | Origin | Phase | Status | Pointer |`: six cells, seven pipes.
 *
 * Both numbers are the file's own documented shape (`AGENTS.md` §2: one row per item, rows are
 * appended and never deleted), so they are constants with a reason rather than literals in a loop.
 */
const EXPECTED_PIPES = 7;

/**
 * Floor for the live file, so this gate cannot pass by finding nothing.
 *
 * The board carried 131 rows when the gate landed (2026-10-07). The floor is deliberately well
 * below that: it is here to catch a scanner that sees an empty or replaced file, not to freeze the
 * board's size — an item is added far more often than one is removed, and removing a row is
 * forbidden outright.
 */
const MINIMUM_EXPECTED_ROWS = 100;

/** A row line: the board's own ids, and nothing else, may open a row. */
const ROW_RE = /^\| B-\d+ \|/;

/**
 * Counts the cell separators in a row, by the escape rule a Markdown table actually follows: a pipe
 * preceded by an **odd** number of backslashes is escaped content (`\|`), and one preceded by an even
 * number is a boundary — including `\\|`, where the pair escapes the backslash and leaves the pipe
 * splitting the cell anyway.
 *
 * This parity rule is GFM's, and this gate shipped its first cut without it: counting every pipe made
 * two rows that were already correct (they used `\|` and `\|\|`) look broken, and escaping those
 * again turned them into `\\|` — a real split. Both directions are now seeded in the fixture.
 */
function separatorCount(line: string): number {
  let separators = 0;
  let backslashes = 0;
  for (const character of line) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === "|") {
      if (backslashes % 2 === 0) {
        separators += 1;
      }
      backslashes = 0;
      continue;
    }
    backslashes = 0;
  }
  return separators;
}

export interface RowViolation {
  /** 1-based line number in the scanned content. */
  readonly line: number;
  /**
   * `cell-count` — a row with the wrong number of pipes, which a raw `|` inside a cell causes,
   * because a table cell cannot contain an unescaped pipe (`\|` is the escape).
   * `row-not-own-line` — a line that continues the row above it, which renders as a paragraph and
   * silently drops that row's trailing cells.
   */
  readonly kind: "cell-count" | "row-not-own-line";
  readonly detail: string;
}

/**
 * Scans one board document for rows that cannot render as rows.
 *
 * The scan starts at the first row and runs to the end of the file, because that is where the board
 * keeps its table: the legend and the column header sit above the first row, and everything after it
 * is rows. Blank lines and Markdown headings are allowed inside that region so the file can gain a
 * section later; anything else there is prose, and inside a table prose means a row was wrapped.
 */
export function scanRowShape(content: string): RowViolation[] {
  const lines = content.split(/\r?\n/);
  const firstRow = lines.findIndex((line) => ROW_RE.test(line));
  if (firstRow === -1) {
    return [];
  }

  const violations: RowViolation[] = [];
  for (let index = firstRow; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "" || line.startsWith("#")) {
      continue;
    }
    if (!ROW_RE.test(line)) {
      violations.push({
        line: index + 1,
        kind: "row-not-own-line",
        detail: `a row continues on this line: ${line.slice(0, 60)}…`,
      });
      continue;
    }
    const pipes = separatorCount(line);
    if (pipes !== EXPECTED_PIPES) {
      violations.push({
        line: index + 1,
        kind: "cell-count",
        detail: `${line.slice(0, 7).trim()} carries ${pipes} cell separator(s), expected ${EXPECTED_PIPES} — a raw "|" inside a cell splits it, and "\\\\|" escapes the backslash rather than the pipe`,
      });
    }
  }
  return violations;
}

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function describe(violations: readonly RowViolation[]): string {
  return violations.map((violation) => `  line ${violation.line}: [${violation.kind}] ${violation.detail}`).join("\n");
}

test("every row of the live board renders as a row (statically checked)", () => {
  const content = read(BACKLOG_RELATIVE_PATH);

  const rowCount = content.split(/\r?\n/).filter((line) => ROW_RE.test(line)).length;
  assert.ok(
    rowCount >= MINIMUM_EXPECTED_ROWS,
    `expected the board to carry at least ${MINIMUM_EXPECTED_ROWS} rows, found ${rowCount} — the scan cannot be proven on a file it did not read`,
  );

  const violations = scanRowShape(content);
  assert.deepEqual(
    violations,
    [],
    `${BACKLOG_RELATIVE_PATH} carries row(s) that cannot render (raw pipe, or a wrapped line):\n${describe(violations)}`,
  );
});

test("the seeded negative fixture fails the check (non-vacuous), and its escaped-pipe control passes", () => {
  const violations = scanRowShape(read(FIXTURE_RELATIVE_PATH));

  assert.ok(
    violations.some((violation) => violation.kind === "cell-count"),
    `expected a raw pipe to be reported, got: ${JSON.stringify(violations)}`,
  );
  assert.ok(
    violations.some((violation) => violation.kind === "row-not-own-line"),
    `expected a wrapped row to be reported, got: ${JSON.stringify(violations)}`,
  );
  assert.ok(
    violations.some((violation) => violation.detail.startsWith("| B-03")),
    `expected the backslash-pair (\\\\|) row to be reported, got: ${JSON.stringify(violations)}`,
  );
  assert.ok(
    !violations.some((violation) => violation.detail.startsWith("| B-04")),
    `expected the correctly escaped row (\\|) to pass, got: ${JSON.stringify(violations)}`,
  );
});

test("a well-formed board passes, including a legend and a heading above and inside the table", () => {
  const content = [
    "Status legend: `open` · `done`",
    "",
    "| # | Item | Origin | Phase | Status | Pointer |",
    "|---|------|--------|-------|--------|---------|",
    "| B-01 | **An item whose cell escapes its pipe** (`a \\| b`) | fixture | F1 | open | `x` |",
    "| B-02 | **An item** | fixture | F1 | open | `x` |",
    "",
    "## A section heading inside the region",
    "| B-03 | **Another item** | fixture | F1 | done | `x` |",
    "",
  ].join("\n");

  assert.deepEqual(scanRowShape(content), []);
});

test("a file with no rows at all reports nothing, and the live file's floor is what rejects it", () => {
  assert.deepEqual(scanRowShape("no table here\n"), []);
});
