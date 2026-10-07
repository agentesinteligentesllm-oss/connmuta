# Seeded negative fixture — this file exists to FAIL `test/security/backlog-table.test.ts`

It is excluded from the live-board scan and is asserted separately, the way
`test/fixtures/markdown-links-negative.md` is for the relative-link gate.

Rows B-01 to B-03 are the three real defects found in `docs/06-backlog/CHECKLIST.md` on 2026-10-07.
Row B-04 is the control: the escape the gate requires must pass, and the gate's first cut got this
wrong in both directions, so both directions are seeded here.

Status legend: `open` · `done`

| # | Item | Origin | Phase | Status | Pointer |
|---|------|--------|-------|--------|---------|
| B-01 | **A cell quoting a command whose usage line carries a raw pipe** (`conmuta validate <path> | --stdin`) renders as extra cells | fixture | F1 | open | `fixture` |
| B-02 | **A row that wraps onto a second physical line
and whose trailing cells then render as a paragraph** | fixture | F1 | open | `fixture` |
| B-03 | **A cell that escapes the backslash instead of the pipe** (`a \\| b`) — the pair escapes the backslash, so the pipe splits the cell anyway | fixture | F1 | open | `fixture` |
| B-04 | **A cell whose pipe is escaped the way the gate requires** (`a \| b`) — must NOT be reported | fixture | F1 | open | `fixture` |
