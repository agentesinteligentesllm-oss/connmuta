# Verify Report — f1-daemon-registry-thin-client

Date: 2026-09-26. First verify pass for this change (no prior `verifyReport` artifact existed;
native `gentle-ai sdd-status` confirms `verifyReport: []` before this run).

Native status snapshot at run start: `apply: all_done`, `tasks: 219/219 complete`, `verify: ready`,
`archive: blocked` (no blocking reason recorded — simply not yet attempted).

## 1. Fresh functional checks (`rm -rf dist`, then `npm test` / `npm run test:static` / `npm run test:wrong-room`)

- First run after `rm -rf dist`: **1084 tests, 1082 pass, 1 fail, 1 skip.** Failure:
  `dist/test/daemon/bootstrap.test.js` — "an overlapping heartbeat tick does not start a second
  poller while a slow reconcile is in flight (PR-40a Alpha audit)" —
  `AssertionError [ERR_ASSERTION]: 0 !== 1` (a duplicate `BINDING_CHANGED` audit-row count).
- Re-ran `bootstrap.test.js` alone: **11/11 pass**, including the failing test, in 953ms.
- Re-ran the full suite again: **1084 tests, 1083 pass, 0 fail, 1 skip** — matches AGENTS.md's
  claimed baseline exactly.
- Conclusion: the PR-40a re-entrancy-guard test is timing-sensitive and flakes under full-suite
  parallel load. This is distinct from the already-known B-39 `heartbeat: ticks at periodMs` flake
  and was not previously disclosed anywhere in the tracked backlog. Not filed as a new backlog row
  by this pass — verify has no mutation authority.
- `npm run test:static`: **43/43 pass, 0 fail.** Matches claimed.
- `npm run test:wrong-room`: **3/3 pass, 0 fail.** Matches claimed.

## 2. Spec-vs-code spot checks

Deep-checked 4 of 9 delta specs against shipped code and tests; the remaining 5 were inventoried by
`### Requirement:` header only (shallower, disclosed as such — reasonable given the change's size
per the task's own "sample, don't exhaustively re-derive" instruction).

- **v1-migration**: `src/migration/main.ts` reads the bot token ONLY from `config.bot_token` or
  `--token-stdin` (comment: "Never argv, never env (D-24)"); `process.env` is consulted only for
  `v1Home` resolution, never the token. `EXIT_MIGRATION_REFUSED` guards match the spec's refusal
  scenarios. Matches spec.
- **ipc-handshake**: confirmed `MAX_PENDING_HANDSHAKES` + `HTTP_TOO_MANY_REQUESTS` flood refusal in
  `src/daemon/ipc/handshake.ts`; confirmed `timingSafeEqual` with an explicit length check
  (constant-time comparison) in `src/daemon/ipc/sessions.ts`. Matches spec.
- **send-path**: `test/security/wrong-room.test.ts` (2/2, run fresh) directly proves the
  "`chat_id` must equal `binding.group_id`" requirement's two scenarios.
- **secret-store**: `src/secret-store/file-fallback.ts` explicitly does NOT call `icacls` (module
  doc: "the daemon bundle stays free of `child_process`"); the DACL-application step is correctly
  deferred to the F2 doctor/installer, and `test/secret-store/file-fallback.test.ts` (PT-19)
  simulates that precondition itself rather than the daemon applying it — matches the spec's own
  text, not a gap.

No new spec-vs-code contradictions found in the 4 deep-checked specs. Remaining specs
(daemon-lifecycle, durable-inbox, ledger, project-binding, thin-client-tools) were only inventoried
by requirement headers, not scenario-traced.

## 3. PR/task reconciliation against git + `gh` (real numbers, not narrated)

- `gh pr list --state all`: exactly **47 PRs, numbers 1–47, all `MERGED`**, zero gaps, zero
  non-merged. Confirmed against `git log --oneline main`.
- `tasks.md`: **219 checked, 0 unchecked** (100%) in the current working tree.
- Reconciled tasks.md's 45 `#### PR-XX` header rows against the 47 real merges: 4 headers (PR-06,
  PR-08, PR-09, PR-40) were each apply-time re-sliced into 2 merges (+4 net, already documented in
  tasks.md/state.yaml), and **3 headers (PR-15, PR-16, PR-17) were in fact shipped inside a single
  GitHub PR (#20)** — confirmed via `gh pr view 20 --json files`, whose file list spans all three
  headers' modules (`node-floor.ts`, `home.ts`, `log.ts`, `lifecycle/{lock,run-file,heartbeat,idle}.ts`,
  `bootstrap.ts`, `main.ts`, `cli/daemon-stop.ts`). This 3-into-1 consolidation is not flagged
  anywhere the four "re-sliced into two" cases are. `45 - 4 - 3 + 8 + 1 = 47`, fully reconciled.
- AGENTS.md's closing summary line ("All 44 GitHub PRs (through PR #47) merged") **undercounts the
  real total by 3** — the true, `gh`-confirmed count is 47.

## 4. `state.yaml` / `tasks.md` staleness — found independently, then found already mid-correction

- `openspec/config.yaml:25` reads `strict_tdd: true`. `git log --follow -p` on that file shows
  exactly one `false`→`true` transition, in commit `b0467c7` (session 3, 2026-09-16), immediately
  after PR-01a merged — never reverted since.
- `state.yaml`'s `phases.apply` block still reads `status: in_progress`, `completed: 218`,
  `pending: 1`, citing "an sdd-init re-run flipping strict_tdd to true" as the one outstanding item.
  AGENTS.md's session-40 close-out repeats the same claim ("218/219 tasks... the one remaining
  item... deliberately left open").
- This claim is factually incorrect: the flip happened 44 sessions/PRs ago, not something left open
  at session 40's end.
- **The working tree already contains an uncommitted correction** (`git status`:
  `M openspec/changes/f1-daemon-registry-thin-client/tasks.md`) that flips this exact checkbox to
  `[x]` and documents the identical root cause (citing commit `b0467c7`, "Corrected session 41",
  debate id `bus-v2-f1-archive-readiness-audit-001`). That debate id does not appear anywhere in
  `docs/05-tribunal/INDEX.md` yet.
- Net state: `tasks.md`'s working tree is self-consistent (219/219), matching the native
  `sdd-status` tool's own `all_done` / `219/219` read. `state.yaml` (`completed: 218`) and
  AGENTS.md's prose have NOT been updated to match, and the `tasks.md` fix itself is uncommitted.
  Disclosed for the Director/next session; not fixed by this verify pass (no mutation authority).

## Findings summary

- **CRITICAL: 0**
- **WARNING: 2** — (a) newly-observed flaky test, `bootstrap.test.js`'s PR-40a re-entrancy-guard
  case, under full-suite load; (b) `state.yaml`/AGENTS.md apply-phase bookkeeping (218/219,
  `in_progress`) contradicts both the repository's own git history and the native `sdd-status`
  tool's `all_done`/`219/219` read; an uncommitted partial fix already exists in the working tree.
- **SUGGESTION: 2** — (a) AGENTS.md's "44 GitHub PRs" closing figure undercounts the real,
  `gh`-confirmed total of 47; (b) the PR-15/16/17 three-headers-into-one-PR consolidation is
  undisclosed alongside the four documented 1-into-2 re-slices.

## Result

**status**: done. **next_recommended**: `sdd-archive` — apply is functionally complete (219/219
tasks, 47/47 PRs merged, full suite green on a clean rerun, sampled specs match shipped code).
Diagnostic findings above do not gate archive per SDD rules; flagged for the Director's awareness,
especially the uncommitted `tasks.md` edit and the stale `state.yaml` bookkeeping, which the
Director may want reconciled before or during archive.
