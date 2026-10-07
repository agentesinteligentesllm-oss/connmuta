# B-132 — harden the board gate's region handling

## Objective

Close backlog row **B-132**'s named weakness: the region handling of `test/security/backlog-table.test.ts`
(the static gate that every row of `docs/06-backlog/CHECKLIST.md` renders as a table row). Two independent
review lineages — `review-af395029a84852b1` (resilience lens, `R4-gate-region`) and `review-139c7dd8da1f1f53`
(resilience lens, `R4-001`) — named **the same location** (`test/security/backlog-table.test.ts:97-108`), and
no repair has touched it.

The §1 row of `docs/08-sessions/HANDOFF.md` names three weaknesses, all in that file:

1. **The region rule accepts any line starting with `#`**, so a wrapped row continuation that begins with `#`
   is silently allowed; and **the region starts at the first row**, so a malformed **header** is never checked.
2. **The fixture assertion requires only *some* cell-count violation**, instead of naming which row and how
   many separators.
3. **The last test's name promises the row-count floor while asserting only the empty scan.**

## Problem / why

The gate's own contract is "a line that renders as a row is a row". Its region rule, as shipped:

- `if (line.trim() === "" || line.startsWith("#")) continue;` — a `#` line is skipped **wherever** it appears
  in the region. A row that wrapped and whose continuation happens to begin with `#` is therefore
  indistinguishable from a section heading and passes silently.
- `const firstRow = lines.findIndex((line) => ROW_RE.test(line));` — the scan begins **at** the first row, so
  the two lines of the table opener (the `| # | Item | … |` header and the `|---|…|` delimiter) are never
  examined. A header with the wrong column count renders every row beneath it misaligned and nothing reports it.
- The fixture test asserted `violations.some(v => v.kind === "cell-count")`, which stays true even if the gate
  stops finding the *other* seeded defects; the exact seeded set is 4 violations (lines 14, 15, 16, 17).
- The last test is named "…, and the live file's floor is what rejects it" but asserts only that an empty scan
  reports nothing — the floor itself was exercised by nothing.

## Scope decision

- **In scope**: `test/security/backlog-table.test.ts` — the region rule (heading allowance + table-opener
  validation), the fixture assertion's precision, and the last test's name and body.
- **Deliberately not in scope**:
  - Accepting a *second* table (a header+delimiter pair) inside the region: the board is one table, and a
    re-opened table is a different design decision no review asked for. The opener check is applied to the
    table the first row belongs to.
  - Re-deriving the GFM parity rule (already seeded, `753060c`) or re-opening any closed review.
  - The reviewer's prose for `R4-gate-region`/`R4-001`, which is unrecoverable after acknowledgement (B-126).

**Residual, disclosed rather than left implied.** A heading inside the region still breaks the table for a GFM
renderer, so a row placed after such a heading without a fresh header+delimiter pair does not render as a row.
The gate tolerates headings (behind a blank line) because the board has kept a single table and no in-region
heading has ever appeared; recognising a *re-opened* table would be a different design decision. The live board
carries exactly one heading, above the region (`docs/06-backlog/CHECKLIST.md:1`), so this is a leniency in the
rule and not a hole in the file it guards.

## Tasks

| # | Task | Evidence |
|---|---|---|
| 1 | RED: add the two behavioural tests — a heading glued to the row above (no blank line) must be reported, a heading behind a blank line must still pass — against the unchanged `scanRowShape`. Observe the first failing. | observed RED: 4 failures / 5 passes in `dist/test/security/backlog-table.test.js` — the glued heading, the short header, the short delimiter and the missing opener — with every control green; assertion-level, not a compile error |
| 2 | GREEN: validate the table opener (delimiter directly above the first row, header row above that, both carrying the board's seven separators) under a new `table-header` kind; allow a `#` line only when the line above it is blank. | observed GREEN: 9/9 in the focused file; commit `ac1cd24` |
| 3 | Precision: assert the fixture's exact violation set (line + kind) and the separator count its detail names; extract `rowFloorFailure` so the last test can exercise the floor it names; rewrite the last test to state only what it asserts. | observed GREEN: `npm test` 1969/1963/0/6; `test:static` 129/129; `%TEMP%` 0 -> 0; commit `ac1cd24` |
| 4 | Close: mark B-132 `done` in `docs/06-backlog/CHECKLIST.md`, record the unit in `docs/08-sessions/HANDOFF.md` §1/§3 and `docs/08-sessions/LOG.md`, and file this unit's review advisories as B-133. | `docs/06-backlog/CHECKLIST.md`; `docs/08-sessions/HANDOFF.md`; `docs/08-sessions/LOG.md`; this unit's `docs(session)` commit |

## Verification record

- **Native review**: lineage `review-1872a30c548e8a95`, tier `high`, four lenses (`review-risk`,
  `review-resilience`, `review-readability`, `review-reliability`), forecast relayed (4 model runs, `pi_host_relay`),
  closed **approved**, authority burned (`gentle-ai.review-acknowledged/v1`). Five advisories, all informational and
  non-blocking, filed as **B-133**.
- **Independent verification** (`gentle-ai-verify`, read-only): reproduced `npm test` 1969/1963/0/6, `test:static`
  129/129 and the focused 9/9; non-vacuity by mutation in a scratch copy outside the repository (EXPECTED_PIPES
  widened to 8 -> 8 failures; opener check removed -> the three opener tests fail; board header loses a separator ->
  only the live-board test fails); reported what it could not verify (the historical RED claim, and that the mutations
  were applied to the compiled output rather than recompiled from TypeScript). The parent re-checked the tree at
  `ac1cd24` (`git status` empty), the cited lines, and removed the scratch directory.

## Verification

- Test-first: RED observed at the assertion level for the two region rules before any implementation change.
- Non-vacuity: the fixture's exact set is asserted, so dropping any one seeded defect fails the test; and the
  row floor is now asserted by a test of its own rather than implied by the live file's size.
- Full suite `npm test` and `npm run test:static` green; independent verification by a separate executor.

## Notes

- Memory: the Engram provider could not start this session — `engram serve` fails with *"bind: An attempt was
  made to access a socket in a way forbidden by its access permissions"* because **7437 falls inside this
  machine's reserved TCP range 7364–7463** (`netsh interface ipv4 show excludedportrange protocol=tcp`). The
  repository copy of this document is therefore the durable record; the Engram mirror is owed when the server
  can bind again.
