# B-100(b) — bare-specifier allow-list per bundle in `computeClosure`

## Objective

Close the documented blind spot: `computeClosure` (`test/security/closure.ts`) only follows relative
(`./`, `../`) specifiers, so a bare-specifier dependency wrapping process spawning would evade the
`child_process` check in the daemon, client and channel bundle tests without ever entering the
closure's own file set. Make each bundle's bare (non-relative) dependency surface explicit and
reviewable: a new bare specifier must fail its bundle's test until deliberately added to that bundle's
allow-list.

## Problem / why

Session 56 scoped and evidenced this (`docs/06-backlog/CHECKLIST.md`'s B-100 row): confirmed neither
the daemon (71-file) nor client (20-file) closure currently contains a process-spawning bare-specifier
dependency, but left the actual design (where the allow-list lives, how the bundle tests consume it) for
a dedicated session. Director's instruction this session: implement it, strict TDD, my judgment on the
allow-list's design.

## Scope decision (disclosed, not silently narrowed or widened)

Mapping done this session found **two more files that share the identical blind spot** but were not
part of session 56's evidence gathering: `test/security/installer-bundle.test.ts` (cli/doctor entries)
and `test/client/session-exchange.test.ts` (run-file/session-exchange entries). `channel-bundle.test.ts`'s
own module doc (lines 24-26) independently confirms the intended scope was always daemon + client +
channel ("known limit shared with the client and daemon bundle tests") — matching HANDOFF.md's "three
bundle tests" language.

**Decision**: implement the allow-list for the three originally-scoped bundles (daemon, client, channel)
this session. Document installer and session-exchange as new, precisely-described backlog follow-up
items rather than silently including or silently dropping them — same shape, same fix, just not
evidenced or scoped yet. No live-violation risk anywhere in the project either way: `package.json` has
exactly 6 real dependencies (`@clack/prompts`, `@modelcontextprotocol/sdk`, `@napi-rs/keyring`,
`jsonc-parser`, `smol-toml`, `zod`), none a process-spawning wrapper — verified against source this
session, not just CHECKLIST prose. This is a completeness gap, not an active exposure, in all five
closures alike.

## Design (my judgment, per the Director's explicit delegation)

- New function `bareSpecifiers(source: string): string[]` in `test/security/closure.ts`, sibling to the
  existing private `relativeSpecifiers` — same statement shapes (`from "..."`, bare `import "..."`,
  dynamic `import("...")`) plus `require(...)` as defense in depth (B-100a precedent: `hasFsModuleReference`
  treats `require()` as a live form even where currently unobserved). Exported (unlike
  `relativeSpecifiers`, which stays an internal `computeClosure` implementation detail) because three
  independent test files need it directly.
- Lives in `closure.ts`, not `predicates.ts`: it is the complement of `relativeSpecifiers` (same
  regex family, same file), and `closure.ts` carries no v1-provenance pin at all — zero SEAM/AS-IS
  friction, unlike `predicates.ts` (SEAM; its own test file `predicates.test.ts` is AS-IS-pinned, per
  B-100a's precedent of placing new predicate seed tests in a bundle test file instead).
- No new closure-wide aggregator function: daemon/client bundle tests already have their own
  `daemonBundleContents()`/`clientBundleContents()` helpers producing a `path -> source` map: they call
  `bareSpecifiers` per file and aggregate inline, matching how every existing predicate
  (`hasFsModuleReference`, etc.) is already consumed. Adding a redundant `computeBareSpecifiers(entryPath)`
  would duplicate that existing aggregation idiom.
- Per-bundle allow-list placement and shape follow each file's own already-established convention, not
  a single uniform mechanism:
  - `daemon-bundle.test.ts`, `client-bundle.test.ts`: local sorted `readonly string[]` constant +
    `assert.deepEqual` test, matching the existing `node:fs`-confinement-list tests already there.
  - `channel-bundle.test.ts`: a new entry in the existing `RULES: Rule[]` table (`violates`/`seeds`),
    matching its own established idiom — this generalizes `test/channel/main.test.ts`'s local
    allow-list precedent HANDOFF.md named, adapted to whole-closure scope and this file's own pattern
    rather than copying that file's single-file-scan shape verbatim.
- Allow-list values are taken from the actual computed output during RED→GREEN, not hand-copied from
  CHECKLIST.md's prose (that evidence came from an uncommitted one-off script; this session's regex
  may reasonably differ at the margins, e.g. `require()` coverage) — reconcile and note any discrepancy.
- Scope note in each new test/rule: this makes the bare-specifier surface explicit and reviewable: it
  does not inspect what an allow-listed package's own code does internally (no node_modules content
  scan) — same disclosed-limitation style as `channel-bundle.test.ts`'s existing comments.

## Tasks

- [x] **T1** — `bareSpecifiers` in `closure.ts` + its own seed tests (positive: catches `from`, bare
      `import`, dynamic `import()`, `require()`; negative: rejects relative specifiers). RED (real
      `tsc -b` compile failure), then GREEN. Commit `47bcd00`.
- [x] **T2+T3** — Daemon and client bundle allow-lists, combined into one work unit (mechanically
      identical, both matched actual computed output on first try). RED/GREEN cycle per file. Commit
      `5122e20`.
- [x] **T4** — Channel bundle allow-list rule (`channel-bundle.test.ts`). Real computed set required a
      scratch script (session 56 never evidenced channel); required relaxing the existing per-rule
      seed-loop assertion from "exactly this violation" to "this violation is present" since several
      existing rules' own seeds are bare specifiers that legitimately also trip the new rule. RED,
      then GREEN. Commit `737a8b8`.
- [x] **T5** — Documented `installer-bundle.test.ts` and `test/client/session-exchange.test.ts` as new
      backlog row B-103 (same gap, not evidenced/implemented this session).
- [x] **T6** — Updated `CHECKLIST.md`'s B-100(b) row, `HANDOFF.md`, `LOG.md`, `AGENTS.md` status
      pointer; Engram session summary. Commit `8349edc`.

## TDD mode

Strict (per Director's instruction and AGENTS.md §3). Runner: `npm run test:static` for fast
`test/security/*` iteration (does not cover `session-exchange.test.ts`, outside `test/security/`);
full `npm test` before each commit.

## Acceptance criteria

- Every new test demonstrably RED before the implementing change, GREEN after.
- `npm run build && npm test` exits 0, no regressions in existing bundle-test counts.
- `npm run test:static` green.
- No file with a v1-provenance entry touched (verified: `closure.ts`, `closure.test.ts`,
  `daemon-bundle.test.ts`, `client-bundle.test.ts`, `channel-bundle.test.ts` all absent from
  `test/fixtures/v1-provenance.json`).
- Each bundle's allow-list values match the actually-computed output, not hand-copied prose.

## Delivery

Direct-to-main work-unit commits, no feature branch — matching sessions 55/56's established ODD
convention for backlog fixes (`AGENTS.md`, HANDOFF §0.4: "no PR this session; direct-to-main work-unit
commits"). RDD per commit (global default on); Arena unreachable this session (`ECONNREFUSED`, same as
sessions 55/56) — Judgment Day is the standing DN-09 substitute if a dedicated audit beyond RDD is
warranted, matching the B-98/B-100(a) precedent of RDD-only review for a mechanically well-scoped ODD
slice.

## Progress

Done. All 6 tasks complete, strict TDD throughout, full suite green (1732 tests, 1726 pass, 0 fail,
6 skip; `test:static` 89/89). Four work-unit commits: `47bcd00`, `5122e20`, `737a8b8`, `8349edc`.
RDD ran 5 times (2 own-scoped, approved/acknowledged; 1 redundant selectorless-chain, approved/
acknowledged; 1 more redundant selectorless-chain, `correction_required` on already-tracked B-102(f),
declined — see `HANDOFF.md` §4.6/§9 for the full account). B-103 filed for the two consumers found
out of this scope. Not pushed to `origin` (local commits only, per this project's established
direct-to-main ODD convention).
