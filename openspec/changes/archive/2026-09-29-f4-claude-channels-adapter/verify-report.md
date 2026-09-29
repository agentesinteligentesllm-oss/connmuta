# Verify report: f4-claude-channels-adapter

Run under a fallback path: the native `sdd-verify` agent dispatch was refused by a host hook
(SDD preflight corroboration issue), so a general-purpose agent performed this verification with
the same brief. Read-only throughout — no source, test, spec, design, or tasks file was modified;
no git write command was run.

## Summary

**PASS.** The shipped implementation matches the spec's 13 requirements/22 scenarios, the design's
stricter Testing Strategy table (including its "no `daemon/` path at all" closure guarantee), and
tasks.md's 54 checked tasks. Build is clean, the full suite is green, tasks.md has zero unchecked
boxes, and every sampled task claim was substantiated directly against the current source tree. Git
state is clean, on `main`, in sync with `origin/main`. The runbook reads as valid Markdown and
carries the required best-effort/no-guarantee language.

No corrections were needed. This change is ready for `sdd-archive`.

## Build & Test Results

- `npm run build` (repo root, `tsc -b`): **exit 0**, no errors, no warnings.
- `npm test` (repo root): exact summary line from the executed run:

  ```
  ℹ tests 1713
  ℹ suites 10
  ℹ pass 1707
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 6
  ℹ todo 0
  ℹ duration_ms 10781.1372
  ```

  This matches apply-progress.md's PR-07 post-merge claim (1713 tests, 1707 pass, 0 fail, 6 skip)
  exactly — no drift between the documented state and the state actually observed at verify time.

## Testing Strategy Coverage (design.md lines ~185-201)

Design's Testing Strategy table is stricter than the spec text in places (per the task brief's
warning) — most notably the closure row, which (per design.md:198 and PR-06's amendment 14) bans
**any** `src/daemon/` path, not just the spec's three named families. All 15 rows checked:

| # | Guarantee | Test file | Exists | In green full-suite run |
|---|---|---|---|---|
| 1 | Route table + both schema maps 8→10; strict rejection of extra keys | `test/shared/ipc-contract.test.ts` | Yes (459 lines) | Yes |
| 2 | Same `after_seq` twice → same summary; closed fields only; `client_cursors`/`client_surfaced` byte-identical | `test/daemon/serve/doorbell.test.ts` | Yes (395 lines) | Yes |
| 3 | Subscribe-before-await; wait clamped to `FETCH_LONGPOLL_MAX_SECONDS` | `doorbell.test.ts` | Yes | Yes |
| 4 | Backlog `2×DEPTH+1` fully paged; `DEPTH`→`saturated:false`, `DEPTH+1`→`true` | `doorbell.test.ts` | Yes | Yes |
| 5 | Non-roster / own-agent rows never count; irrelevant group row still advances `covered_through_seq` | `doorbell.test.ts` | Yes | Yes |
| 6 | Sentinel `updates.body` never leaks; SQL names no `body` column; no `ledger/{cursors,transaction,audit}` import | `doorbell.test.ts` (runtime + source-grep) | Yes | Yes |
| 7 | Commit monotone/idempotent/refuses past tail; ensure-then-commit | `test/ledger/cursors.test.ts`, `test/daemon/ipc/routes.test.ts` | Yes (443, 1010 lines) | Yes |
| 8 | tick() resolve→commit→advance; rejected deliver leaves state unmoved and re-rings; backoff sleep; D12 warn-and-advance; D11 silent advance | `test/channel/doorbell-loop.test.ts` | Yes (365 lines) | Yes |
| 9 | Handshake `GET /identity`→`POST /session` with `host=CHANNEL_HOST_LABEL`; 401-once re-handshake; `DELETE` on close; no run file → no spawn | `test/channel/daemon-link.test.ts` | Yes (415 lines) | Yes |
| 10 | `claude/channel/permission` absent as a key; `claude/channel` present | `test/channel/main.test.ts` | Yes (374 lines) | Yes |
| 11 | Meta keys ⊆ closed set, plain identifiers; no peer body in any param | `test/channel/notify.test.ts` | Yes (136 lines) | Yes |
| 12 | Closure: no `daemon/` path at all, no `child_process`/`node:sqlite`/Telegram/keyring; `fs` confined to 2 files; timers confined to `doorbell-loop.js` | `test/security/channel-bundle.test.ts` | Yes (299 lines, 17 tests) | Yes |
| 13 | Two `bin` entries, adapter source outside `src/`; `SERVER_VERSION` unchanged | `channel-bundle.test.ts`; `test/shared/version.test.ts` | Yes (23 lines) | Yes |
| 14 | Move-only split preserves behavior | Existing `handshake.test.ts`, `run-state.test.ts`, `ipc-stub.test.ts` | Yes | Yes |
| 15 | Docs best-effort; `WORK-PLAN.md:93` amended | Structural readback (no automated test, by design) | N/A | N/A — confirmed manually, see Runbook Readback below |

No guarantee in the table lacks a corresponding test. Row 15 is explicitly documented in design.md
as "structural readback in verify and archive" with no automated test asserting prose content —
this is not a gap, it is the design's own stated verification method, performed below.

## Task Cross-Check (5+ samples across different PR units)

1. **Task 1.4 (PR-01)** — "add the six named constants... verbatim from design.md". Verified in
   `src/shared/constants.ts`: `DOORBELL_SCAN_DEPTH = MAX_BATCH` (line 328), `CHANNEL_SERVER_NAME`
   (329), `CHANNEL_HOST_LABEL = "claude-code-channel"` (331), `CHANNEL_RETRY_BACKOFF_SECONDS =
   POLL_ERROR_BACKOFF_SECONDS` (333), `CHANNEL_META_LIST_LIMIT = 4` (335),
   `CHANNEL_SHUTDOWN_TIMEOUT_MS = REQUEST_OVERHEAD_SECONDS * 1000` (337). All six values match the
   design's Interfaces/Contracts block exactly. **Substantiated.**

2. **Task 3.4 (PR-03)** — "add `export` to `reverseRosterLookup`. No other change." Verified in
   `src/daemon/admission.ts:151`: `export function reverseRosterLookup(...)`. **Substantiated.**

3. **Task 4.2 (PR-04)** — "implement `commitClientCursor`'s monotone `UPDATE` and
   `readMaxInboxSeq`." Verified in `src/ledger/cursors.ts`: `commitClientCursor` (line 227) and
   `readMaxInboxSeq` (line 239) both present with the designed signatures. **Substantiated.**

4. **Task 5.11 (PR-05d)** — "add `bin.conmuta-channel = "dist/channel/main.js"`; add
   `"dist/channel/**"` to `files`." Verified in `package.json`: `"bin"` object has both
   `"conmuta": "dist/src/cli/main.js"` and `"conmuta-channel": "dist/channel/main.js"` (lines 7-10);
   `"files"` array includes `"dist/channel/**"` (line 16). **Substantiated.**

5. **Task 5.7/5.8 (PR-05d)** — "`claude/channel/permission` absent as a key... never `false`."
   Verified in `channel/main.ts:169-175`: `capabilities: { experimental: { "claude/channel": {} } }`
   with an explanatory comment that `permission` is omitted, never `false`. Grepping the whole file
   for `permission` returns only that one comment — no code path sets the key. **Substantiated.**

6. **Task 6.8 (PR-06)** — "implement the `channel/**/*.ts` walk alongside the existing `src/**/*.ts`
   one." Verified in `test/twins.test.ts:66-76`: a test titled "every channel/**/*.ts file has a
   test/channel/**/<same>.test.ts twin" walks `channel/` via `findTsFiles`/`findMissingTwins` with a
   non-vacuous floor (`MIN_CHANNEL_SOURCE_FILES`). **Substantiated.**

7. **Task 7.2 (PR-07)** — "apply design.md's WORK-PLAN :93 amendment text... copy it exactly."
   Verified `docs/07-plan/WORK-PLAN.md`'s Validation row now reads: "`saturated` marks a doorbell
   scan that stopped at `DOORBELL_SCAN_DEPTH` with rows still beyond it; the adapter pages past it
   with an advancing `after_seq`, so no row stays hidden and blindness is resolved rather than
   announced" — matching design.md's amendment text verbatim, and no longer asserting the retired
   "rings once per cursor value" claim. **Substantiated.**

8. **Task 7.3/7.4 (PR-07)** — DATA-MODEL.md §3.5 and both ADR status notes. Verified
   `docs/02-architecture/DATA-MODEL.md:238` lists `claude-code-channel` in the `host` column's
   examples, citing F4. Verified `docs/03-adr/0024-...md` and `0025-...md` each carry an appended
   "Resolved by F4" note citing PR-01 through PR-07, alongside their original (unedited) text —
   consistent with the project's append-only ADR convention. **Substantiated.**

No sampled task claimed something the current source tree does not show. No completed task was
found unsubstantiated.

## Task Completeness

- `grep -c '^- \[ \]' openspec/changes/f4-claude-channels-adapter/tasks.md` → **0**
- `grep -c '^- \[x\]' openspec/changes/f4-claude-channels-adapter/tasks.md` → **54**

All 54 tasks are checked complete; zero remain unchecked. This matches the task brief's premise.

## Git State

```
726815e docs(f4): fix PR-07 record's line count and a dangling reference
64521a4 docs(f4): record PR-07 merge and sync stale F4 artifacts
4bd0510 docs(f4): add channel-doorbell runbook and sync ADR/WORK-PLAN (PR-07)
13934f5 docs: restructure the HANDOFF and record its Judgment Day review
c67f093 docs: stop counting the docs-only commits in the HANDOFF
e9c5d3e docs: correct the HANDOFF's count of docs-only commits on top of PR-06
ac084e5 docs: record that Alpha is unavailable and how the next session proceeds
7ce0ae2 docs: close session 54 (F4 follow-up PR and PR-06 complete) and record the findings
cdd63ca test: extend the twin gate to channel/
fdd4fc2 test(security): add the adapter bundle-closure test
```

- `git status --short`: clean (no output).
- Branch: `main`.
- Tracking: `## main...origin/main` — in sync, no ahead/behind divergence shown.

Matches the task brief's expectation exactly: PR-07 (`4bd0510`) plus the two follow-up docs commits
(`64521a4`, `726815e`) are present on `main`, tree is clean.

## Runbook Readback

`docs/runbooks/channel-doorbell.md` (structural readback only, per the task brief — no re-fetch of
external docs):

- Renders as valid Markdown: headings, ordered/unordered lists, fenced code blocks (`sh`/`json`) all
  well-formed; no broken syntax observed.
- Contains a dedicated "Best-effort delivery — not a guarantee" section stating: "Claude Code
  channels are a research preview; delivery is best-effort and silently dropped when disabled.
  Nothing here may be documented as a delivery guarantee," plus a follow-on paragraph naming that
  Claude Code does not acknowledge channel notifications, that drops are silent on both sides, and
  that the recurring `agentbus_fetch` cadence remains required. This satisfies task 7.1's
  best-effort/no-delivery-guarantee/no-acknowledgement requirement and the spec's "Best-effort
  documentation" requirement's scenario.
- Links to ADR-0024 and ADR-0025 for the semantics behind it, consistent with the "Sources" section
  citing the two Claude Code docs URLs accessed 2026-09-29 (already verified at apply time per
  apply-progress.md's PR-07 record; not re-fetched here per the task brief).

## STRICT TDD internal-consistency note

Per the task brief, RED evidence itself was not re-derived (that is apply's job, not verify's).
apply-progress.md's own RED-then-GREEN claims are internally consistent with what is observable now:
every PR/slice section states a RED-first compile or runtime failure observed before the
corresponding GREEN, and the final state (all tests green, `tsc -b` clean) is exactly what a
correctly-closed RED→GREEN sequence should leave behind. No contradiction was found between the
documented development process and the shipped result.

## Findings / Concerns

None blocking. Two pre-existing, already-disclosed items are worth carrying forward (not raised
here for the first time — both are already tracked in AGENTS.md's backlog and apply-progress.md):

- **B-99 / B-100** (already filed): a handful of timer-based tests can flake under heavy CPU
  contention, and the shared `hasFsModuleReference` predicate has known blind spots (bare
  `import "node:fs"`, `from "fs"`, dynamic `import()`) that `channel-bundle.test.ts` worked around
  with local quote-anchored regexes rather than widening the shared predicate. Neither affected this
  verify run — the full suite was green on a single, unloaded execution — and both are already
  tracked for the Director, not new findings.
- No new deviation, gap, or unsubstantiated task was found during this verification pass.
