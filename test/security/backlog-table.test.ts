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
   * `table-header` — the table opener (the header row or the delimiter row above the first body
   * row) is absent or carries a different column count than the rows, which shifts every cell
   * beneath it.
   */
  readonly kind: "cell-count" | "row-not-own-line" | "table-header";
  readonly detail: string;
}

/** A GFM table delimiter row: pipes, dashes and optional colons, and nothing else. */
const DELIMITER_RE = /^\|[\s:|-]+\|$/;

/**
 * Validates the two lines that open the table the first row belongs to: the `| # | Item | … |`
 * header row and the `|---|…|` delimiter directly above the first body row.
 *
 * An opener whose column count differs from its rows shifts every cell beneath it, which is the same
 * class of damage as a raw pipe inside a cell — and it was invisible to this gate while the scan
 * began *at* the first row and therefore never looked above it.
 */
function headerViolations(lines: readonly string[], firstRow: number): RowViolation[] {
  const delimiterIndex = firstRow - 1;
  const headerIndex = firstRow - 2;
  const delimiter = lines[delimiterIndex];
  const header = lines[headerIndex];

  if (delimiter === undefined || !DELIMITER_RE.test(delimiter)) {
    return [
      {
        line: firstRow + 1,
        kind: "table-header",
        detail:
          'the first row is not preceded by a table delimiter row ("|---|…|"), so nothing above it is a table header and the rows below it render as paragraphs',
      },
    ];
  }
  if (header === undefined || !header.startsWith("|")) {
    return [
      {
        line: firstRow + 1,
        kind: "table-header",
        detail: `the table delimiter on line ${delimiterIndex + 1} has no header row above it, so its columns are unnamed`,
      },
    ];
  }

  const violations: RowViolation[] = [];
  for (const [index, role] of [
    [headerIndex, "header row"],
    [delimiterIndex, "delimiter row"],
  ] as const) {
    const line = lines[index] ?? "";
    const pipes = separatorCount(line);
    if (pipes !== EXPECTED_PIPES) {
      violations.push({
        line: index + 1,
        kind: "table-header",
        detail: `the table's ${role} carries ${pipes} cell separator(s), expected ${EXPECTED_PIPES} — an opener whose column count differs from its rows renders them misaligned`,
      });
    }
  }
  return violations;
}

/**
 * Scans one board document for rows that cannot render as rows.
 *
 * The scan begins at the table the first row belongs to — its opener is validated by
 * `headerViolations` first — and runs to the end of the file, because that is where the board keeps
 * its table: the legend and the column header sit above the first row, and everything after it is
 * rows. Blank lines are allowed inside that region, and a Markdown heading is allowed **only** when
 * the line above it is blank: a heading glued to a row cannot be told apart from a wrapped
 * continuation, and this gate exists to report that continuation rather than to explain it away.
 */
export function scanRowShape(content: string): RowViolation[] {
  const lines = content.split(/\r?\n/);
  const firstRow = lines.findIndex((line) => ROW_RE.test(line));
  if (firstRow === -1) {
    return [];
  }

  const violations: RowViolation[] = headerViolations(lines, firstRow);
  for (let index = firstRow; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      continue;
    }
    if (line.startsWith("#")) {
      if ((lines[index - 1] ?? "").trim() === "") {
        continue;
      }
      violations.push({
        line: index + 1,
        kind: "row-not-own-line",
        detail: `a heading glued to the row above it is reported rather than allowed, because a wrapped continuation and a heading are indistinguishable here: ${line.slice(0, 60)}…`,
      });
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

/**
 * The live board's row floor, as a function rather than an inline assertion, so a test can show the
 * floor is load-bearing instead of trusting the live file to happen to be large.
 *
 * Returns the failure message, or `undefined` when the floor holds.
 */
export function rowFloorFailure(content: string): string | undefined {
  const rows = content.split(/\r?\n/).filter((line) => ROW_RE.test(line)).length;
  if (rows >= MINIMUM_EXPECTED_ROWS) {
    return undefined;
  }
  return `expected the board to carry at least ${MINIMUM_EXPECTED_ROWS} rows, found ${rows} — the scan cannot be proven on a file it did not read`;
}

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function describe(violations: readonly RowViolation[]): string {
  return violations.map((violation) => `  line ${violation.line}: [${violation.kind}] ${violation.detail}`).join("\n");
}

test("every row of the live board renders as a row (statically checked)", () => {
  const content = read(BACKLOG_RELATIVE_PATH);

  const floorFailure = rowFloorFailure(content);
  assert.ok(floorFailure === undefined, floorFailure);

  const violations = scanRowShape(content);
  assert.deepEqual(
    violations,
    [],
    `${BACKLOG_RELATIVE_PATH} carries row(s) that cannot render (raw pipe, or a wrapped line):\n${describe(violations)}`,
  );
});

test("the seeded negative fixture fails the check (non-vacuous), and its escaped-pipe control passes", () => {
  const violations = scanRowShape(read(FIXTURE_RELATIVE_PATH));

  // Naming the exact set, not "some cell-count violation": dropping any one seeded defect must fail
  // this test, and each line number is the row's identity in the fixture.
  assert.deepEqual(
    violations.map((violation) => ({ line: violation.line, kind: violation.kind })),
    [
      { line: 14, kind: "cell-count" }, // B-01: a raw pipe inside a cell → 8 separators
      { line: 15, kind: "cell-count" }, // B-02's own first line, before its wrap → 2 separators
      { line: 16, kind: "row-not-own-line" }, // B-02's wrap
      { line: 17, kind: "cell-count" }, // B-03: `\\|` escapes the backslash → 8 separators
    ],
    `expected exactly the seeded defects of ${FIXTURE_RELATIVE_PATH}, got: ${JSON.stringify(violations)}`,
  );
  assert.match(violations[0]?.detail ?? "", /B-01 carries 8 cell separator/);
  assert.match(violations[1]?.detail ?? "", /B-02 carries 2 cell separator/);
  assert.match(violations[3]?.detail ?? "", /B-03 carries 8 cell separator/);
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

test("a heading glued to the row above is reported, because a wrapped continuation and a heading are indistinguishable there", () => {
  const content = [
    "| # | Item | Origin | Phase | Status | Pointer |",
    "|---|------|--------|-------|--------|---------|",
    "| B-01 | **An item** | fixture | F1 | open | `x` |",
    "# a continuation with no blank line above it",
    "",
  ].join("\n");

  assert.deepEqual(
    scanRowShape(content).map((violation) => ({ line: violation.line, kind: violation.kind })),
    [{ line: 4, kind: "row-not-own-line" }],
  );
});

test("a heading separated from the table by a blank line is still allowed inside the region", () => {
  const content = [
    "| # | Item | Origin | Phase | Status | Pointer |",
    "|---|------|--------|-------|--------|---------|",
    "| B-01 | **An item** | fixture | F1 | open | `x` |",
    "",
    "## A section heading",
    "",
  ].join("\n");

  assert.deepEqual(scanRowShape(content), []);
});

test("a table header that does not carry the board's seven separators is reported, not skipped as being above the first row", () => {
  const content = [
    "| # | Item | Origin | Phase | Status |",
    "|---|------|--------|-------|--------|---------|",
    "| B-01 | **An item** | fixture | F1 | open | `x` |",
  ].join("\n");

  assert.deepEqual(
    scanRowShape(content).map((violation) => ({ line: violation.line, kind: violation.kind })),
    [{ line: 1, kind: "table-header" }],
  );
});

test("a delimiter row whose column count differs from the board's is reported", () => {
  const content = [
    "| # | Item | Origin | Phase | Status | Pointer |",
    "|---|------|--------|-------|--------|",
    "| B-01 | **An item** | fixture | F1 | open | `x` |",
  ].join("\n");

  assert.deepEqual(
    scanRowShape(content).map((violation) => ({ line: violation.line, kind: violation.kind })),
    [{ line: 2, kind: "table-header" }],
  );
});

test("a first row with no table opener above it is reported", () => {
  const content = ["| B-01 | **An item** | fixture | F1 | open | `x` |", ""].join("\n");

  assert.deepEqual(
    scanRowShape(content).map((violation) => ({ line: violation.line, kind: violation.kind })),
    [{ line: 1, kind: "table-header" }],
  );
});

test("a file with no rows at all reports nothing, and the row floor is what rejects it", () => {
  assert.deepEqual(scanRowShape("no table here\n"), []);

  const floorFailure = rowFloorFailure("no table here\n");
  assert.ok(
    floorFailure !== undefined && floorFailure.includes(`at least ${MINIMUM_EXPECTED_ROWS} rows`),
    `expected the row floor to reject a document with no rows, got: ${String(floorFailure)}`,
  );
});
