# B-103 — bare-specifier allow-list for the installer/doctor and session-exchange closures

## Objective

Close the same `computeClosure` blind spot B-100(b) closed for daemon/client/channel, for the two
remaining consumers found while scoping B-100(b): `test/security/installer-bundle.test.ts`
(`cli/main.js`, `doctor/main.js`, `doctor/offline.js`) and `test/client/session-exchange.test.ts`
(`run-file.js`, `session-exchange.js`).

## Problem / why

Session 57 found these two files share `computeClosure`'s identical relative-only blind spot but left
them unevidenced/unfixed, filing B-103. `HANDOFF.md` §7's B-103 row: "Not yet known whether either
closure has a live bare-specifier violation — compute it for real before assuming safety." Director's
instruction this session: start B-103, compute the real bare-specifier sets for the 5 entry points
before assuming no violation, strict TDD, my judgment on the design.

## Scope decision

5 entry points across 2 files, matching B-103's exact backlog description: `cli/main.js`,
`doctor/main.js`, `doctor/offline.js` (`installer-bundle.test.ts`); `run-file.js`,
`session-exchange.js` (`session-exchange.test.ts`).

## Investigation (read-only, before any code)

Computed real values twice, independently. First a mapping fork — its first completion notification
returned a garbled, unrelated result (2 tool calls, 20s; a session-56-style corrupted-report incident,
HANDOFF §4.1) so it was not trusted; resumed once and its second report was coherent and detailed (11
tool calls, 290s). Second, my own verification script against the current `dist/` build. Both agree
exactly:

| Entry | Files | Bare specifiers (sorted) |
|---|---|---|
| `cli/main.js` | 71 | `@clack/prompts`, `@modelcontextprotocol/sdk/server/mcp.js`, `@modelcontextprotocol/sdk/server/stdio.js`, `@napi-rs/keyring`, `jsonc-parser`, `node:child_process`, `node:crypto`, `node:fs`, `node:os`, `node:path`, `node:sqlite`, `node:url`, `node:util`, `smol-toml`, `zod` |
| `doctor/main.js` | 32 | `jsonc-parser`, `node:child_process`, `node:crypto`, `node:fs`, `node:os`, `node:path`, `node:sqlite`, `node:url`, `node:util`, `smol-toml`, `zod` |
| `doctor/offline.js` | 28 | identical set to `doctor/main.js` |
| `client/run-file.js` | 2 | `node:fs`, `node:os`, `node:path` |
| `client/session-exchange.js` | 8 | `node:crypto`, `node:fs`, `node:os`, `node:path`, `zod` |

All non-builtin specifiers cross-checked against `package.json`'s 6 declared dependencies — exact
match, nothing unreviewed. `node:child_process` appearing as a bare specifier is expected, not a new
risk: it is the same `installer/exec.js`/`client/spawn.js` import already confined and tested by this
file's own separate `child_process`-confinement tests — the bare-specifier check is a complementary,
explicit-surface check, not a replacement for that confinement check. No live violation, same outcome
as daemon/client/channel before B-100(b): a coverage gap, not an active defect.

## Design (my judgment)

- Reuse `bareSpecifiers`/`computeClosure` from `closure.ts` unchanged — no signature change needed.
- `installer-bundle.test.ts`: 3 separate constants (`ALLOWED_CLI_BARE_SPECIFIERS`,
  `ALLOWED_DOCTOR_BARE_SPECIFIERS`, `ALLOWED_OFFLINE_BARE_SPECIFIERS`) + 3 separate `test()` blocks,
  mirroring this file's own established precedent of never merging CLI/DOCTOR's separate allow-lists
  even where values could coincide (its child_process-confinement tests already keep CLI and DOCTOR
  fully separate). DOCTOR and OFFLINE keep separate constants despite identical current values, so a
  future OFFLINE-only change doesn't have to touch DOCTOR's list. A small local `bareSpecifiersOf()`
  helper avoids repeating the same union loop 3 times in one file — used nowhere outside it.
- `session-exchange.test.ts`: one new test extending the file's existing loop-shaped idiom (the
  current "no spawn capability" test already loops over both entries), with a small per-entry lookup
  object (3-item vs 5-item list) rather than a unioned list — the two modules have genuinely
  different, smaller surfaces, and no allow-list elsewhere in this codebase unions across unrelated
  entries. Does not touch the existing test's own body or hoist its local `clientDist` computation
  into a shared constant — a 1-line DRY gain is not worth touching already-working, unrelated code.
- Both files get the standard duplicated non-vacuous `bareSpecifiers` seed test, matching
  daemon/client/channel's own precedent.

## Tasks

- [x] **T1** — `installer-bundle.test.ts`: CLI allow-list + test. RED (empty-array assertion, real
      diff showed the true 15-item set), then GREEN. Combined with T2/T3 into one work-unit commit
      `06d31eb` (mechanically identical, matching B-100(b)'s own T2+T3 precedent).
- [x] **T2** — `installer-bundle.test.ts`: DOCTOR allow-list + test. RED/GREEN. Commit `06d31eb`.
- [x] **T3** — `installer-bundle.test.ts`: OFFLINE allow-list + test, + shared seed test. RED/GREEN.
      Commit `06d31eb`.
- [x] **T4** — `session-exchange.test.ts`: per-entry allow-list + test + seed test. RED (run-file.js's
      empty-array assertion failed showing the real 3-item set) then GREEN. Commit `2a579b9`.
- [x] **T5** — Full verification: `npm run build && npm test` (1738 tests, 1732 pass, 0 fail, 6 skip —
      exactly +6 from the session-57 baseline, matching the 6 new tests), `npm run test:static` (93/93).
- [x] **T6** — Closed backlog: `CHECKLIST.md`'s B-103 row, `HANDOFF.md` (§3.3, §7); Engram session
      summary. `LOG.md`/`AGENTS.md` status pointer next.

## TDD mode

Strict (Director's instruction, `AGENTS.md` §3). Runner: `npm run test:static` for
`installer-bundle.test.ts` (`test/security/*`); full `npm test` required for `session-exchange.test.ts`
(outside `test/security/`).

## Acceptance criteria

- Every new test demonstrably RED before its allow-list is filled in, GREEN after.
- `npm run build && npm test` exits 0, matches or exceeds session-57 baseline (1732/1726/0/6), no
  regressions.
- `npm run test:static` green.
- No file with a v1-provenance entry touched (`installer-bundle.test.ts` and `session-exchange.test.ts`
  both confirmed absent from `test/fixtures/v1-provenance.json`).
- Allow-list values match the actually-computed output (verified twice, independently), not
  hand-copied prose.

## Delivery

Direct-to-main work-unit commits, no feature branch — matching B-100(b)'s established ODD convention.
RDD per commit (global default on); Arena unreachable this session (`ECONNREFUSED`, same as sessions
55-57) — Judgment Day is the standing DN-09 substitute if warranted. Watch for the selectorless RDD
chain (HANDOFF §4.6): if it fires and its finding is B-102(f), decline it as a recurrence, not a new
defect.

## Progress

Done. All 6 tasks complete, strict TDD throughout, full suite green (1738 tests, 1732 pass, 0 fail,
6 skip; `test:static` 93/93). Four work-unit commits: `06d31eb` (installer/doctor allow-lists),
`d620320` (doc correction, RDD-found), `2a579b9` (session-exchange allow-list), `726acd1` (doc
correction, RDD-found). B-103 fully closed — all 5 entry points evidenced and enforced.

RDD ran twice (both `--base-ref 737a8b8 --committed-only`, since neither reached acknowledgement to
advance the boundary until the second): the first lineage (`review-688b995abb754a4c`) reached
`correction_required`, got a valid correction submitted and committed (`d620320`, fixing exactly the
finding: `CHECKLIST.md`/`HANDOFF.md` still said "not yet known" for 3 entry points this same
candidate already enforced) — but the follow-up `review status` call then returned a **terminal**
`captured_artifacts_unverifiable` stop, not a recoverable one. Left `correction_required`,
unacknowledged, no authority over anything (disclosed to the Director; not chased further, per the
prescribed terminal continuation: maintainer inspection or disable — neither applicable here). The
second lineage (`review-7f532587be32a283`, opened after the session-exchange commit) hit the
identical-shaped finding once more (my own prior correction's "session-exchange remains open" claim
was now stale too) — same correct-plan → commit → re-check sequence, and this time it progressed
cleanly through `targeted_validation_required` to `approved`, acknowledged, authority burned. Two
non-blocking advisory WARNINGs surfaced on the final pass (identical hand-typed DOCTOR/OFFLINE
allow-lists with no structural cross-check; the same doc-staleness pattern cited a third time against
this task file's own T5 line, correctly a historical record of session 57's state, not something to
retroactively rewrite) — left as disclosed, non-blocking follow-ups per the review's own policy, not
acted on.

**Process learning for a future session**: an RDD correction on a docs-only fix can legitimately
resolve on retry after a terminal stop on an earlier lineage — the terminal stop is lineage-scoped, not
a signal that the correction mechanism itself is broken. Do not assume a second attempt will fail the
same way.
