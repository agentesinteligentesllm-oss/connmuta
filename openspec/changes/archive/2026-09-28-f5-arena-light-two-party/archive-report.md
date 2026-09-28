# Archive Report: Arena-light 2-party debates over the existing wire

**Change**: f5-arena-light-two-party
**Archived**: 2026-09-28
**Archived to**: `openspec/changes/archive/2026-09-28-f5-arena-light-two-party/`
**Executed by**: general-purpose sub-agent running `sdd-archive` inline (native `sdd-archive` Agent
dispatch is blocked by this project's documented host `PreToolUse:Agent` hook defect, consistent
with F3/F4's own precedent for this exact fallback)

## Final-State Authority Applied

This report describes the state of the change AT CLOSE, per the phase's Final-State Authority
hierarchy, not the state captured by the intermediate `verify-report.md` snapshot:

- **`verify-report.md` WARNING-1** (`docs/02-architecture/OVERVIEW.md:319`, §11 "Arena-light (D7)",
  still described the removed "coalesce AUDIT+COUNTER" design as current) — **FIXED**, commit
  `df32cfb` ("docs(f5): correct canonical-doc coalescing staleness, close sdd-verify"), already on
  `main`. Independently confirmed: `git show df32cfb -- docs/02-architecture/OVERVIEW.md` shows
  line 319's coalescing clause removed.
- **`verify-report.md` SUGGESTION-1** (`proposal.md`'s Success Criteria still listed
  `AUDIT+COUNTER coalesce into one send` as an outstanding, undisclosed item) — **FIXED**, same
  commit `df32cfb`. Confirmed: the archived `proposal.md` (read in full above) carries the struck-through
  line `~~[ ] AUDIT+COUNTER coalesce into one send.~~ (dropped, see correction note above)` with an
  explicit correction note at the top of the document — a disclosed strikethrough, not a silent
  rewrite, matching this project's own established convention (e.g. the F5 design.md's own
  coalescing-contradiction disclosure).
- **`verify-report.md` SUGGESTION-2** (working tree not clean at verify time — 6 modified,
  uncommitted canonical docs files) — **RESOLVED**. `git status --short` at the start of this phase
  showed a fully clean tree on `main`, `HEAD = df32cfb`, with the coalescing-doc fixes already
  committed and pushed.
- **No CRITICAL issues were ever found in `verify-report.md`.** 0 blockers. Verdict was
  `PASS WITH WARNINGS`, both warnings now closed per the above.

Per this hierarchy: the launch prompt's final-state facts (rank 2) outrank `verify-report.md`
(rank 3) for these three items, and were independently corroborated against `git show df32cfb`
and the archived `proposal.md`'s own text rather than taken on assertion alone.

## Task Completion Gate

Confirmed independently, not trusted from any prior record:
- `tasks.md` (pre-move): `grep -c "^- \[x\]"` = 15, `grep -c "^- \[ \]"` = 0.
- Native `gentle-ai sdd-status f5-arena-light-two-party --cwd . --json` confirmed
  `taskProgress: {total: 15, completed: 15, pending: 0, allComplete: true}` and
  `dependencies.archive: "ready"` before any archive operation began.
- Post-move, the archived `tasks.md` was re-checked in place: 15 `[x]`, 0 `[ ]`. No stale unchecked
  tasks in the audit trail.

Gate passed cleanly — no reconciliation was needed.

## Artifact Store Note (disclosed deviation from the launch instruction)

The launch prompt named the artifact store as `openspec`. Native `gentle-ai sdd-status --json`
and `openspec/config.yaml`'s own `session.artifact_store` field both report **`hybrid`** for this
project. Per `sdd-phase-common.md` §B ("Do NOT detect the artifact store, and do NOT branch on
it... the dispatcher resolved it from the store the workspace DECLARES"), the workspace's own
declared value is hybrid, not openspec. Resolution: performed the full filesystem archive exactly
as the launch prompt specified (both sources agree `openspec/` artifacts are in active use), and
additionally persisted this report to Engram (`mem_save`, see below) to satisfy the hybrid mode's
Engram-side requirement — purely additive, no filesystem behavior changed. Disclosed rather than
silently resolved in either direction.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `arena-light-debates` | Created | New capability, no prior main spec. Mechanical `cp` + `diff -r` (empty, exit 0) + `mv`. 7 requirements, 7 scenarios — full-spec copy, byte-identical to the delta (confirmed by direct `diff -r` after the copy). |
| `ledger` | Updated | `gentle-ai sdd-archive-compose` (exit 0), then orchestrator structural cleanup (see below). 1 requirement ADDED ("Forward migration adds `debate_journal` at schema version 2", 2 scenarios). Now 5 requirements total (4 pre-existing + 1 new), 1 `## Traceability` section. |
| `send-path` | Updated | `gentle-ai sdd-archive-compose` (exit 0), then orchestrator structural cleanup (see below). 2 requirements ADDED ("Marker-aware silence for debate REPLY turns", "Each debate turn is exactly one rate-budget hit, never retried") + 1 requirement MODIFIED ("Validation pipeline and secret backstop run before any network call", gained the round-cap clause and one new scenario). Now 7 requirements total (4 pre-existing + 2 new + 1 modified in place), 1 `## Traceability` section. |

Total requirement/scenario counts reconcile exactly against `verify-report.md`'s own independently-recounted
figures: 11 requirements (7 + 1 + 3 — note `send-path`'s 3 counts 2 ADDED + 1 MODIFIED), 15 scenarios (7 + 2 + 6).

### Disclosed composition artifact (not fixed — Mechanical Copy Contract forbids manual edits)

Reading the composed output (not just trusting the zero exit code) surfaced a pre-existing
structural issue inherited from how the delta spec files were authored during `sdd-spec` (before
this archive phase started, already through its own audit per this project's convention) — **not**
a defect in `sdd-archive-compose` or in this phase's mechanics:

Both `openspec/changes/f5-arena-light-two-party/specs/ledger/spec.md` and
`.../specs/send-path/spec.md` each carried their own trailing `## Traceability` table (ledger's
delta also carried a `## Note (no MODIFIED block)` section) as literal content inside their
ADDED/MODIFIED block, with no requirement heading separating it from the block above. The compose
tool matches and replaces/appends whole blocks by requirement name — it has no way to distinguish
"trailing delta-authoring commentary" from "requirement content" within a matched or appended
block, so it faithfully carried that trailing content into the canonical spec at the exact point
the delta placed it.

**Effect on the merged main specs, AT THE TIME THIS PHASE COMPLETED**: `openspec/specs/ledger/spec.md`
and `openspec/specs/send-path/spec.md` each contained **two `## Traceability` H2 sections** — one
short, delta-scoped table sitting mid-document, and the original end-of-file table, now stale (not
listing the newly added requirements). Also, both files still read `## ADDED Requirements` /
`## MODIFIED Requirements` as their requirements-section heading — the delta-authoring convention —
rather than the plain `## Requirements` every other canonical spec in `openspec/specs/` uses. No
content was lost or corrupted at any point — this was purely a heading-structure/duplication and
staleness issue, not a byte-fidelity issue (the mandatory `diff -r`/exit-0 evidence above covers
fidelity).

**Corrected after this phase, by the orchestrator directly (not re-running `sdd-archive-compose` —
that tool already did its one job correctly; this is a structural cleanup of ALREADY-merged,
byte-complete content, not a re-merge)**: both files now read `## Requirements`; each file's two
`## Traceability` tables are consolidated into one, at the end of the file, with the F5-added rows
appended to the pre-existing rows rather than sitting in a separate mid-document table; the
`ledger` delta's stray `## Note (no MODIFIED block)` section (delta-authoring commentary, not
canonical spec content) was removed, since its one substantive fact — `debate_journal` was already
named in the "No token in any ledger table" requirement's own enumeration — remains stated in that
requirement's text regardless. Verified after the fix: `openspec/specs/ledger/spec.md` has exactly
5 `### Requirement:` headings and one `## Traceability` section (was 2); `openspec/specs/send-path/spec.md`
has exactly 7 and one `## Traceability` section (was 2); full suite re-run clean, 1526/1520/0/6, 0
regressions (doc-only change, no source/test file touched by this correction).

This correction also closed two SUGGESTION-tier findings the same review round raised: the
`arena-light-debates` spec's pointer-only requirement now names `INLINE_PATCH_REJECTED` explicitly
(previously said only "rejected"), and two scenarios were added documenting behavior that was
already covered by real, passing tests but not previously named as its own spec scenario — "a body
carrying an unrecognized verdict token fails closed" (`debate-marker.test.ts:116`) and "the
originator cannot send an AUDIT" (`validate.test.ts:830`, "Spec scenario: an AUDIT from the
thread's originator... is NOT_ADDRESSEE").

## Archive Move

**Known environmental risk encountered, exactly as flagged**: `git mv` failed with
`Permission denied` (exit 128). Per the skill's own fallback logic, the source's presence and
byte-identity against the pre-move snapshot were confirmed before attempting the plain `mv`
fallback — which **also** failed with `Permission denied`, the same failure class this project's
F3 archive (session 48) hit on this same Windows checkout.

**Recovery**: per this task's own documented recovery note, used PowerShell's `Move-Item` with
explicit absolute paths for both source and destination (avoiding the exact relative-destination
pitfall that caused the F3 incident). Before the move, a fresh recursive snapshot was taken to a
tempdir (`cp -R`) independent of the first, now-discarded attempt's snapshot. `Move-Item` exited 0.

**Mandatory readback** (the ONLY passing evidence per the Mechanical Copy Contract):

```
$ diff -r "<snapshot_root>/source" "openspec/changes/archive/2026-09-28-f5-arena-light-two-party"
(no output)
$ echo $?
0
```

Empty diff, exit 0 — the archived folder is byte-identical to the pre-move snapshot. Source
directory (`openspec/changes/f5-arena-light-two-party/`) confirmed absent after the move. Snapshot
tempdir removed after the readback completed.

**Git tracking note (informational, not a defect)**: because the move used the OS-level
`Move-Item` fallback rather than `git mv`, git's index sees this as 9 deletions (the old paths)
plus 2 new untracked directories (`openspec/changes/archive/2026-09-28-f5-arena-light-two-party/`
and `openspec/specs/arena-light-debates/`) rather than tracked renames. This project's own F3
archive (session 48) hit the identical situation and resolved it at commit time with
`git add -A -- openspec/` (git auto-detects clean 100% renames from content matching, even without
`git mv`). This archive phase does not commit anything itself per its own mandate — flagging this
for the orchestrator (Kairo) so the eventual commit step accounts for it, exactly as F3's own
precedent did.

## Archive Contents

- `proposal.md` — present (with the disclosed struck-through Success Criteria correction from
  `df32cfb`)
- `exploration.md` — present (optional artifact, carried through)
- `specs/arena-light-debates/spec.md`, `specs/ledger/spec.md`, `specs/send-path/spec.md` — present
- `design.md` — present
- `tasks.md` — present, 15/15 `[x]`, 0 `[ ]`
- `apply-progress.md` — present
- `verify-report.md` — present (`PASS WITH WARNINGS` at verify time; both warnings and both
  suggestions closed per Final-State Authority section above)
- `archive-report.md` — this file (additive, excluded from the `diff -r` comparison since it did
  not exist in the pre-move source)

## Source of Truth Updated

- `openspec/specs/arena-light-debates/spec.md` (new domain)
- `openspec/specs/ledger/spec.md` (delta merged)
- `openspec/specs/send-path/spec.md` (delta merged)

## Verification Checklist (Step 4)

- [x] Main specs updated correctly (3 domains, requirement/scenario counts reconcile against
      `verify-report.md`'s independently-recounted 11/15 figures)
- [x] Change folder moved to archive
- [x] Archive contains all artifacts (proposal, exploration, specs x3, design, tasks,
      apply-progress, verify-report)
- [x] Archived `tasks.md` has no unchecked implementation tasks (15/15 `[x]`, re-checked post-move)
- [x] Active changes directory no longer has this change (`openspec/changes/f5-arena-light-two-party/`
      confirmed absent)
- [x] Verbatim `diff -r` readback output included above and empty (exit 0)

## SDD Cycle Complete

f5-arena-light-two-party has been fully planned, implemented (6 PRs, `#89`-`#94`), verified
(`PASS WITH WARNINGS`, both warnings and both suggestions closed in `df32cfb`), and archived. Ready
for the next change.

## Open Follow-Up (non-blocking)

**Resolved, not open.** The duplicate/stale `## Traceability` sections this phase originally
disclosed (see "Disclosed composition artifact" above) were corrected by the orchestrator directly
after this report was first written — see that section's own "Corrected after this phase" note for
the exact fix and its verification. No backlog row needed; nothing remains open from this finding.
This paragraph is kept, rather than deleted, so a reader following an earlier copy of this report
or the review round that found it (`bus-v2-f5-archive-audit-001`) does not chase a stale pointer.
