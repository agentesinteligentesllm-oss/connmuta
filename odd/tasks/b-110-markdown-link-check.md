# B-110 — relative Markdown link static gate and archive link repairs

## Objective

Add an automated relative-link verification gate to `npm run test:static` (`test/security/markdown-links.test.ts`),
pinned by a non-vacuous negative fixture (`test/fixtures/markdown-links-negative.md`), and repair the 38 broken
relative links inside `openspec/changes/archive/**` caused by the archive directory depth change.

## Problem / why

Measured in session 63: a relative link sweep found 41 broken links in the repository. Three were live and
were fixed in session 63. The remaining 38 sit inside `openspec/changes/archive/**` (F1: 19, F2: 11, F7a: 8).
The root cause is structural: when `openspec archive` moves an SDD change from `openspec/changes/<name>/` to
`openspec/changes/archive/<date>-<name>/`, the directory depth increases by one level (or for F7a, two levels),
causing relative links targeting `docs/` (e.g. `../../../docs/...`) to resolve to a non-existent path
(`openspec/docs/...`). Because `npm run test:static` lacked a markdown link gate, these broken links persisted
silently across multiple sessions.

## Scope decision

- **In scope**:
  - `test/fixtures/markdown-links-negative.md`: Seeded negative fixture with an intentional broken relative link to prove non-vacuity.
  - `test/security/markdown-links.test.ts`: Test scanning all tracked Markdown files via `git ls-files "*.md"`, validating every relative link target on disk.
  - Re-rooting and repairing all 38 broken links in `openspec/changes/archive/**` so every link resolves to its valid target.
  - Reconciling `docs/01-constitution/GOVERNANCE.md` (recording the markdown link gate under §6 Engineering Rules) and updating `docs/06-backlog/CHECKLIST.md` (B-110 closed).
- **Deliberately not in scope**:
  - Modifying historical change text, decisions, or commitments beyond adjusting the broken relative link paths.
  - Validating external URLs (`http:`, `https:`), which would require network calls and violate the "No network in tests" rule.

## Tasks

| # | Task | Evidence |
|---|---|---|
| 1 | Create non-vacuous fixture `test/fixtures/markdown-links-negative.md` and static gate `test/security/markdown-links.test.ts`. Observe RED on clean-tree scan (fails reporting the 38 broken links) and GREEN on the non-vacuous negative assertion. | `test/fixtures/markdown-links-negative.md`; `test/security/markdown-links.test.ts`; observed RED (38 failures); commit `88bec3c` |
| 2 | Repair the 38 broken relative links across 8 files in `openspec/changes/archive/**` (F1: 19 links, F2: 11 links, F7a: 8 links). Observe GREEN on `test/security/markdown-links.test.ts` (0 broken links across all tracked markdown files). | Diff across `openspec/changes/archive/**`; `test:static` passes; observed GREEN (101/101 static tests pass); commit `11b2b57` |
| 3 | Reconcile `docs/01-constitution/GOVERNANCE.md` §6 engineering rules and `docs/06-backlog/CHECKLIST.md` (close B-110). | `docs/01-constitution/GOVERNANCE.md`; `docs/06-backlog/CHECKLIST.md`; B-110 marked `done` |

## Verification

- Strict TDD: RED observed on clean-tree check before repairing archive links; GREEN observed after.
- Non-vacuous test: seeded negative fixture verified to trigger a link violation.
- Full suite `npm test` and `npm run test:static` 100% green.
