# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.
>
> **Reading order for a zero-context session:** §0 → §1 → §2 → §5. Then §3 (pins), §4 (traps),
> §6 (do not redo) and §7 (open points) as the task needs, and §8 for the environment.

---

## §0 — Quick start

**Plan settled — do not re-open it.** The Arena Orion debate arena (`http://127.0.0.1:8766/mcp`) is
**not available**: assume it stays down, so **no slice is audited by the tribunal and nothing may wait
for a debate**. The Pi-native SDD preflight gate is also closed and only a human can open it (§2), so
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. Session 32
merged **PR-32** (lazy daemon spawn D-01 + client-side spawn election D-16, the first source files under
`src/client/`) with both blind judges, a separate independent verifier, and **one** of the two
re-judgment rounds — the route §2 describes is the one that produced it. Unit 10 `thin-client-tools`
continues with **PR-33**.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-33 (`src/client/binding.ts` + `src/client/handshake.ts`, launcher --project walk-up/refusal + client handshake, PT-26 a/b): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + Judgment Day con ambos jueces + verificador independiente); la Arena no está disponible, así que nada depende de un debate ni de la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** (session 32 deleted its `odd/` tree). The status command must print
`nextRecommended: apply`, `completed: 160`, `pending: 50` (of `210`), `blockedReasons: []`. Anything else:
stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count
yourself with `grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 160).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-32** (PR-32 merged as PR #36, `d4c459c`; candidate `ed882b9`, correction `c6b2046`, re-judgment fix `f433e6e`). **Unit 10 `thin-client-tools` opened with PR-32 and continues with PR-33.** **Next slice: PR-33** — `src/client/binding.ts` + `src/client/handshake.ts` (launcher `--project` walk-up and refusal before any IPC; identity verify + `POST /session`; `DAEMON_DOWN` makes zero network calls, PT-26 a/b). | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | `tasks.md` has **45 `####`-level PR headers total** (`grep -c '^#### PR-' tasks.md`), of which **35 header lines cover `PR-01`…`PR-32`** and **10 remain, naming `PR-33`…`PR-42`** — both directly counted, unambiguous. Separately, **38 distinct GitHub PRs have actually merged** through PR-32 (three headers — `PR-06`, `PR-08`, `PR-09` — were each re-sliced at apply time into two separately-merged PRs without a second header line, so the "merged" count is higher than the "header lines covered" count — this is the same discrepancy `state.yaml`'s own PR-11 entry already flagged as not fully reconciled; do not force these two counting bases into one subtraction). **Checkboxes: 160 of 210**, always the cleanest single number to cite. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **160/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | `src/shared/*` (15 modules with twins), `src/cli/*`, `src/registry/*`, `src/ledger/*` (11), `src/secret-store/*` (5), `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts`, `src/daemon/lifecycle/*` (4), `src/daemon/transport/*` (5), `src/daemon/serve/*` (3), `src/daemon/send/*` (3), `src/daemon/ipc/{server,handshake,sessions,routes}.ts`, all with twins, **and now `src/client/{spawn,run-state}.ts` with twins** — the first real source under `src/client/` (its `tsconfig.json` is no longer just a scaffold with zero inputs). **917 tests** (916 pass, 1 skip), `test:static` **8/8**. | PRs `#1`–`#36` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **23 entries** (PR-32 is new code, no v1 range — v1 has no daemon/client split at all). PR-33 (`client/binding.ts`, `client/handshake.ts`) is confirmed new code too, same reason. | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-32**, one record each in the tribunal index. PR-23..PR-32: Judgment Day with **both judges** + independent verifier, all **APPROVED** (`bus-v2-f1-pr-2{3..9}-audit-001`, `bus-v2-f1-pr-30-audit-001`, `bus-v2-f1-pr-31-audit-001`, `bus-v2-f1-pr-32-audit-001`). PR-22a/22b: inline passes (the judges were down then). PR-31 used **both** re-judgment rounds; **PR-32 used only one** — its single round-1 re-judgment finding (a prose-only comparison error) was parent-verified rather than spending the second round. See §6 for what each slice's rounds found. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused before
the child launches (`SDD preflight cancelled or invalid; no session consent recorded`) — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line budget
with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` envelope exists. One variant: if a human has already run `/gentle:sdd-preflight` in the TUI,
or the Director asks, the slice may run through `sdd-apply`.

**2. The per-slice pipeline sessions 27–32 ran — repeat it exactly.**
1. **Map** once (delegated `Explore`, read-only): v1 range (if any), consumed APIs with verbatim signatures, DDL,
   spec, design, the tasks block, and every contradiction between them. **Session 32's own PR-33 mapping already
   started** and found two load-bearing facts §4 below states in full — read them before writing anything.
2. **Decide** the open design points yourself (the Director delegated them) and write them into the writer's brief;
   each decision is stated in the module doc and in `apply-progress.md`, and a `tasks.md` *apply-time note* records the
   decisions and any edit outside the block's Scope line.
3. **Write** (delegated `general-purpose`, sonnet): src + twin (+ PT cells only if the block has a Docs task — PR-33's
   does, task 33.4). The writer does not commit. **Insist on RED first** and ask for the verbatim RED lines.
4. **Parent readback** of the source before freezing — it found a defect in every slice since session 28. Session
   32's own readback found a real cross-process spawn-lock TOCTOU gap (`ensureDaemonRunning` calling the spawn
   implementation unconditionally on the winner path, with no re-check against a run file that might have gone
   valid in the gap between the read and winning the lock). **Read every number your own record states before
   writing it down** — session 32's own candidate record initially mis-summed its own authored-line total
   (additions-only instead of this project's additions+deletions convention, caught by the independent verifier).
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only control that
   MUST survive, BUILD-FAIL and TIMEOUT reported apart. A survivor is a test gap → pin it (that is the behavioural RED);
   an **equivalent** mutant is argued in the record, not pinned; a mutant the suite **cannot observe** is recorded as
   such, not called equivalent. **Use a runtime-opaque condition for a disabled-branch mutant, never a literal
   `false`** — PR-32's own sweep hit TypeScript's unreachable-code detection (`TS7027`) on a literal-`false` mutant
   twice, a legitimate BUILD-FAIL that answers nothing about test coverage; `Date.now() < 0` (or similar) avoids it.
6. Full suite + `test:static` from a clean `dist/`; `git add -N` **new files only, never `git add -N .`**; measure
   `git diff --numstat main -- src test`, **summed as additions+deletions per file, not additions alone**
   (`AGENTS.md`'s own ODD section: "counting additions plus deletions" — session 32 mis-summed its own candidate
   figure this exact way and had to correct it); commit code **with** its records (`tasks.md` ticks + size
   reconciliation + apply-time note, `apply-progress.md` section).
7. **Judgment Day**: frozen worktree, `jd-judge-a` + `jd-judge-b` in parallel, result shape `{findings, evidence}`.
   In parallel, a **separate independent verifier** (`general-purpose`) on its own worktree with a mandate to
   reproduce every figure, re-run the sweeps, write up to six extra mutants and **probe the running code** — it
   found real gaps in every slice (PR-32: 5 of 8 new mutants survived, all real edge-case coverage gaps: an
   unclamped clock-skew case, an unpinned staleness boundary, a self-referential options assertion, a
   path-ambiguous fast-path test, an untested reclaim-then-EEXIST-again branch — plus a factual overstatement in
   the record's own "not a style choice" framing, proven wrong by direct experiment). **The judges have no Bash**:
   they check figures by reading and arithmetic only; the verifier is the one that re-measures.
8. Reproduce single-judge rows before correcting; correct (parent inline for small batches); commit code and record
   together; scoped re-judgment over the delta only. **Budget: two re-judgments.** PR-32 used only **one**: its
   single round-1 finding (Judge A alone) was a factual claim in a disclosure *comment* — "the same limitation
   applies to `lock.test.ts`" — that turned out false on inspection (`lock.test.ts` has no multi-caller racing
   test at all). **A disclosure comment's comparison to another file is a factual claim like any other and needs
   the same verification before being written down** — the general reasoning underneath it (JS's single-threaded
   execution model precludes a genuine in-process race) was accurate on its own; only the specific comparison
   wasn't. Corrected inline, verified by full suite + static gates, without spending the second round.
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude Code line);
   `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Get the untracked inventory with `gentle-ai review status --cwd . --contract
gentle-ai.review-integration/v2 --agent claude-code --next-transition` (field `eligible_untracked_inventory`), then run
`gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha> --committed-only --untracked-scope=exclude
--expected-untracked-inventory=<that sha256:…> --json` and record tier and `review_due`. **Do not START the native review
for a Judgment Day target**: the installed `judgment-day` skill states it replaces ordinary 4R and both must never run on
one target, and START's consent envelope belongs to the Director. Record that in the slice's audit row. (PR-32's own
`assess` at close read `risk: high`, `review_due: true` — `process_boundary` on the one allow-listed spawn call site,
an expected flag for a file whose whole job is calling `child_process.spawn` — recorded, not started.)

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those. This
project has already caught the opposite mistake several times (PT-14 in PR-06a, PT-25's registry/send-path split,
PT-27's own cell in PR-32) — the established fix is a **scoped, disambiguated pointer**: cite the file(s), then
parenthesize exactly which clause is covered and where the rest lands, never a silent full-coverage claim. Do not
invent a Docs task where none is warranted; if a mapper finds a PT id a slice genuinely pins, record that reading in
the apply-time note rather than silently adding or silently skipping a cell edit.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip
and labelled with it, **counted as additions+deletions per file** (§2.6 above). PR-29 1,609 (1,209), PR-30 619 (219),
PR-31 1,495 (1,095, grown across three Judgment Day correction commits, two rounds), **PR-32 873 at its final tip**
(473-line exception, grown from the candidate's corrected 721 across one correction commit and one re-judgment-fix
commit) — every estimate priced only the primary deliverable; disclosed edits outside the primary scope line and
Judgment Day's own correction rounds are most of the overrun, a pattern holding since PR-06b. Add a *Size
reconciliation* note under the block's header in `tasks.md` (gate text left as written).

**6. Frozen worktrees — the junction rule (session 28 incident, followed cleanly since).** `git worktree add
--detach ../telegram_bus_agent-worktrees/<name> <sha>`. Only the verifier's worktree needs `node_modules`: create the
junction with PowerShell `New-Item -ItemType Junction -Path '<win path>\node_modules' -Target '<main win path>\node_modules'`.
**To remove: delete the junction first with PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`,
verify it is gone (`test -e … || echo removed`) and that `node_modules/typescript/lib/tsc.js` still exists in the main
checkout, and only then `git worktree remove --force`.** `git worktree remove --force` follows a live junction and
empties the main `node_modules`; if that happens, `npm ci` restores it exactly from the shrinkwrap. Session 32 followed
this cleanly for both its judges' and verifier's worktrees, plus pruned stale remote-tracking refs for old deleted
branches with `git fetch --prune origin` (routine hygiene, not destructive — the actual work was already merged).

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

**8. Waiting on a background agent: never poll.** `ScheduleWakeup` is for `/loop` dynamic-mode sessions only — calling
it (or spawning a throwaway filler agent) just to "wait" for an `Agent`-launched subagent is a misuse the harness
already handles for you: it re-invokes you automatically when the subagent's task-notification arrives. Session 32
made this exact mistake twice in a row before correcting course; just end the turn with a short status line and wait.

---

## §3 — Pinned provenance values (re-verify with your own method; never trust a header blindly)

Rule: the pinned value is the exact byte range of the cited v1 lines **LF-normalized, including the terminating
newline** (`bus-v2-f1-pr-04-001`). Multi-range: ranges concatenated in the cited order, each with its newline
(PR-22a). Whole file: bare v1 path, all lines. Validate your method first by reproducing a known value, e.g.
`git show bf8f365:src/tools/fetch.ts | tr -d '\r' | sed -n '404,460p;525,656p' | sha256sum` → `3bd09d0d…`.

| v2 path | v1 source @ `bf8f365` | verdict | v1 body sha256 |
|---|---|---|---|
| `src/daemon/admission.ts` | `src/tools/fetch.ts:404-460,525-656` | SEAM | `3bd09d0d0291dcf7fe88a90eedcef1e5c1496cf4ea7a4c3b670aad3675c73192` |
| `src/daemon/send/validate.ts` | `src/tools/send.ts:113-192,205-378` | SEAM | `771f968e37a1897e7ecb3e277bacb294c30375b1018f30be8e9ce6cb4e1ca423` |
| `src/daemon/send/send-path.ts` | `src/tools/send.ts:380-660` | SEAM | `25926e38a82e8c12138015a9cdaac7320a9098e4b5726f5d868b8aae1fbb804b` |

**PR-32** (`client/spawn.ts`, `client/run-state.ts`) and **PR-33** (`client/binding.ts`, `client/handshake.ts`) are
both **new code, confirmed**: v1 (`telegram-agent-bus`) has no daemon/client split at all — it is a single MCP server
process that talks to Telegram directly, with no lazy-spawn, no daemon-launch, no multi-process logic, no separate
binding-walk-up/handshake step anywhere to vendor. A new module must not spell `Provenance:` in its leading block
(B-33). Older pins are in `apply-progress.md` and in each module's header. SEAM pins are **not machine-checked** by
`provenance.test.ts` (B-42).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **`parseProjectFile` already exists — do not reimplement `conmuta.json` parsing** | `src/shared/project-file.ts` exports `parseProjectFile(text: string): ProjectFileResult` (strict-parse of a committed `conmuta.json`, including roster uniqueness via `applyRosterUniqueness`) — and it is freely importable from `client/*`, since `client/tsconfig.json` already references `../shared`. Unlike PR-32's `daemon/lifecycle/*` situation, there is **no compile-unit wall here**: `binding.ts` should call this function directly, not walk the filesystem and hand-roll validation. | `src/shared/project-file.ts` |
| **The launcher's own exit-code naming is genuinely ambiguous across design.md and spec.md — decide explicitly before writing RED** | `design.md`'s "Startup" row (§11) says the walk-up requires `project_id === --project`, "else `EXIT_UNBOUND_PROJECT` / `EXIT_PROJECT_MISMATCH`, before any IPC" — naming both constants together without saying which condition maps to which. `src/shared/constants.ts` docs `EXIT_UNBOUND_PROJECT = 3` as "the CLI ran against a project with no binding recorded **in the registry**" (a registry/daemon-side concept) and `EXIT_PROJECT_MISMATCH = 4` as "the bound project id does not match the one the caller expected" (reads as the literal fit for a walk-up mismatch). Meanwhile `specs/thin-client-tools/spec.md`'s own Scenario 39 — titled "project\_id mismatch is UNBOUND\_PROJECT" — describes exactly a found-but-different-`project_id` case (`prj-other` vs `--project prj-example`) and says the client "refuses with `UNBOUND_PROJECT`". Separately, design's client error-taxonomy table (§10) lists `UNBOUND_PROJECT` again as a **daemon-returned, IPC-time** tool error code (`HTTP_NOT_FOUND`, "no active binding for project\_id") — a third, textually-identical-looking concept that scenario 39's own "before any IPC call" phrasing rules out for that scenario. Read all three sources yourself and decide, once, which of `EXIT_UNBOUND_PROJECT`/`EXIT_PROJECT_MISMATCH` the walk-up-mismatch scenario actually exits with, and whether spec.md's scenario title is using "UNBOUND\_PROJECT" loosely (most likely) or precisely; disclose the reading in the apply-time note. | `specs/thin-client-tools/spec.md:39-46`, `design.md` §11 "Startup" row, `src/shared/constants.ts:305-312` |
| **Windows `fs.watch()` crashes natively on an 8.3 short path — general gotcha, not PR-32-specific** | This machine's `os.tmpdir()` (and therefore every `mkdtempSync`-based test fixture) returns an 8.3 short path (`C:\Users\LABORA~1\...`). Calling `fs.watch()` on a directory reached via its short-path form crashes the whole Node process natively the moment a change event needs to be reported for it (`Assertion failed: !_wcsnicmp(filename, dir, dirlen)`, libuv `src/win/fs-event.c`) — hit directly by PR-32's own tests, root-caused with isolated repro scripts, and independently reproduced by that slice's own verifier by reverting the fix. Fix: resolve with `realpathSync.native(dirPath)` before calling `watch()` (the plain, non-native `realpathSync` does **not** perform the short-to-long conversion). This will bite **any future `fs.watch()` use** in this codebase on this machine — not just `client/run-state.ts`. | `src/client/run-state.ts`'s `waitForRunFile`, PR-32 record |
| **A defensive property is only as good as its own test's honesty — verify a disclosure comment's factual claims, not just its code** | PR-32's round-1 re-judgment: a correction's own new comment claimed "the same limitation applies to the daemon's own already-merged `lock.test.ts`" to justify leaving a test as-is — false on inspection (`lock.test.ts` has zero multi-caller racing tests). The general reasoning under the comment was still correct; only the specific file comparison wasn't. Treat a comment that compares itself to another file's coverage as a claim to verify, the same as a number. | PR-32 Judgment Day round-1 re-judgment |
| **Reusable pattern: name an injectable default as its own exported constant for reference-identity testing** | `spawnDaemon(spawnImpl: SpawnImpl = REAL_SPAWN)` — `REAL_SPAWN` is `spawn` from `node:child_process`, exported by name so a test can assert `REAL_SPAWN === spawn` without ever invoking the real implementation (which would launch a real process). Reach for this whenever a function's *default* argument is itself the thing needing a coverage guarantee, and invoking the real default in a test would have a real side effect. | `src/client/spawn.ts` |
| **Reusable pattern: extract a TOCTOU-adjacent branch into its own function instead of trying to construct a fake race** | A cross-process race window inside a larger orchestration function (`ensureDaemonRunning`) could not be tested by simulating concurrency (JS's synchronous-until-`await` execution model makes that impossible in-process). Extracting the winner-path body into `spawnIfStillNeeded(runDir, spawnDaemonImpl)` turned it into two ordinary, deterministic unit-test cases instead. Reach for this decomposition before accepting "not independently testable" as the final answer on a TOCTOU-shaped gap. | `src/client/run-state.ts` |
| **`test/client/` exists now** | Contains `spawn.test.ts` and `run-state.test.ts`, following `test/daemon/lifecycle/lock.test.ts`'s general pattern (real temp dirs via `mkdtempSync`, cleaned in a `finally`, real `process.pid` for "this process" and `process.pid + 9999`-style literals for "a foreign process," explicit `now: number` arguments rather than an injected Clock object). `test/fakes/clock.ts` still does not exist — still scaffolded on demand, per-PR, if a future PR genuinely needs it. | `test/client/*.test.ts` |
| **`state.yaml`'s own "row id" counter is flagged, by the project itself, as unreliable** | Its PR-11 entry already states the carried "of-the-45-rows" counter does not resolve against `tasks.md`'s actual 45-block/42-row-id shape. Cite PR blocks (verifiable: `grep -c '^#### PR-' tasks.md`) and task checkboxes (verifiable: the §0 command) instead. | `state.yaml`'s PR-11 `completed_slices` entry |
| **A parent's own record prose needs the same distrust as a subagent's** | PR-32's own candidate record mis-summed its authored-line total using additions-only instead of this project's own additions+deletions convention (caught by the independent verifier, itself re-deriving the convention from `AGENTS.md`'s ODD section and from re-checking PR-31's own arithmetic). Recompute a stated figure from the actual `git diff --numstat` output before writing it, don't propagate a number from memory or a prior draft — and know which convention this project actually uses (additions+deletions) before you compute it. | PR-31, PR-32 records |
| **Sweep harness needs bounds** | A mutant that breaks a network path leaves test clients waiting forever: run tests with `--test-timeout=5000` and `spawnSync(process.execPath, …, { timeout: 150000 })` **without a shell** (with `shell: true` the kill reaches `cmd.exe`, not `node`). Report `KILLED(TIMEOUT)` apart. Every socket-waiting test needs its own timeout too. | sessions 29–32 |
| **`git add -N` — scope it, never `.` (and the same discipline applies to `git stash -u`)** | Always name the specific new files for `add -N`; for an actual clean-`main` measurement, use a throwaway `git worktree add --detach` instead of touching the working tree at all. | sessions 30–31 |
| **Node HTTP facts** | An HTTP/1.1 request with no `Host` line is refused by Node's parser (bare 400) before any handler; duplicate/negative/garbage `Content-Length` and `Transfer-Encoding` + `Content-Length` are refused the same way; `fetch` cannot set `Host` (use `node:http` or `net`); a client still writing past a refusal may get a reset instead of the response. | PR-29 record |
| **A writer's RED is usually compile-level** (`TS2305`/`TS2307`/`TS2339`). | The behavioural RED is the parent's: readback fixes and sweep survivors, each pinned by a test that fails without the fix. | sessions 27–32 |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; it builds via `node_modules/typescript/lib/tsc.js -b` directly (not `npx`, avoids a shell), restores the file and checks its sha256. Lives in the untracked `odd/` tree (deleted at close): recreate it (≈75 lines). Use a replacer function (`s.replace(from, () => to)`): a `$` + backtick in a replacement string is a special pattern. **Use a runtime-opaque disabled-branch condition (e.g. `Date.now() < 0`), never a literal `false`** — TS's unreachable-code detection (`TS7027`) turns a literal-`false` mutant into an uninformative BUILD-FAIL. After a source edit, re-anchor mutants whose `from` moved. A mutation TypeScript itself rejects at build time is a legitimate **BUILD-FAIL**, reported apart from an ordinary kill or survivor. | sessions 28–32 |
| **The AS-IS transports lose error detail** | `GroupTransport` turns a guard refusal or a 429 into a soft `{ok: false, code}`; `DualWriteTransport` drops a DM error's cause. Send-side checks run before the call or through the ledger. | PR-27, PR-28, PR-31 |
| **`offsets.retry_after_until` is shared** | Per `bot_id`, written by the poller and by `send/rate.ts`; the poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring anything. | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | An async callback is refused before `BEGIN`; do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **A shared "must never both be true" property is best enforced by ONE function, not per-branch checks** | `withRetryAfterIfRetryable(payload, retryAfterS)` (PR-31) is the shape to reach for whenever a slice needs the same invariant enforced from more than one call site. | `src/daemon/ipc/routes.ts` |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId` in `serve/fetch.ts`, `serve/status.ts` and `serve/thread.ts`. Extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status` (§2.3). | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key>` (or the Python-subprocess wrapper if the content has backticks/quotes the shell would mangle). | sessions 27–32 |
| **Subagents were available all of sessions 27–32** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits (global rule); PR bodies end with the Claude Code line. Write long messages to a file and use `git commit -F`. | sessions 27–32 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header** | A non-vendored module must not spell `Provenance:` there; a module doc belongs in the leading block, before the imports. | **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files (named explicitly) before `test:static`, or PT-22's own repo scan silently skips them. | PR-32 record |
| **PT-22's token shape** | Synthetic bot ids use seven digits (`1234567:${"A".repeat(35)}`); no fixture may match `\d{8,10}:[A-Za-z0-9_-]{35}`. | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means **no limit**; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines truncate silently** | Write files with the file tools or Python; verify line counts. | sessions 13–21 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`state.yaml` is YAML** | Parse (or at least run `gentle-ai sdd-status` and check `taskProgress`) after editing; `tribunal_state` appears in several phases — edit the `apply:` one; keep `next_recommended` current. | sessions 28–32 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–32 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run. Did not reproduce in PR-23..PR-32 (every leg green on the first attempt across ten consecutive slices). | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 160/210. Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4 (all
   flags — they are load-bearing, not optional colour), `tasks.md`'s **PR-33 block**,
   `specs/thin-client-tools/spec.md`'s two requirements this slice implements — "Launcher requires `--project`
   and refuses when unbound or mismatched" and "`DAEMON_DOWN` makes zero network calls" (PT-26 a/b) — and design.md's
   §10 sequence diagram: the first line (`walk-up cross-check P`, `binding.ts`'s job) plus everything from
   `GET /identity` through `POST /session` and its response (`handshake.ts`'s job) is this slice's scope. The
   middle block — reading the run file, racing `run/spawn.lock`, calling `spawnDaemon()` — is PR-32's, already
   done; do not re-touch it. Also read §11's thin-client table.
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram mirror
   `odd/<feature>/tasks`, before the first write.
3. **Branch** `f1/33-client-binding-handshake` from `main`, then run §2.2's pipeline:
   - **Decide first, before any code**: the `EXIT_UNBOUND_PROJECT`/`EXIT_PROJECT_MISMATCH`/`UNBOUND_PROJECT`
     naming question (§4's second flag) — read all three cited sources and pick one reading, disclosed.
   - **33.1 RED** `test/client/binding.test.ts` ("missing `--project` exits before any IPC call", "`project_id`
     mismatch is [the decided exit behavior]") and `test/client/handshake.test.ts` ("no daemon, zero network
     calls": a network recorder shows zero outbound calls and no `Authorization` header) — the Runtime harness
     line specifies a fake `fetch` that throws on any call.
   - **33.2 GREEN** `src/client/binding.ts` (cwd walk-up to the nearest `conmuta.json` via **`parseProjectFile`
     from `shared/project-file.ts`**, §4's first flag — do not hand-roll parsing) and `src/client/handshake.ts`
     (identity verify per design's sequence diagram, `POST /session`, `DAEMON_IDENTITY_MISMATCH` re-read-once).
   - **33.3 Verify**: `npm run build && node --test "dist/test/client/binding.test.js" "dist/test/client/handshake.test.js"`.
   - **33.4 Docs**: update the file-name cell(s) of PT-26 in `THREAT-MODEL.md` §4, matching the scoped-pointer
     convention §2.4 describes (PT-27's own cell in PR-32 is the freshest example to copy).
4. Audit per §2.2 steps 7–9; merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s status line,
   `state.yaml` (counts, `completed_slices`, `tribunal_debate`, `tribunal_state`, `next_recommended`; check with
   `gentle-ai sdd-status`) and the `00-INDEX.md` board if the backlog grew, delete `odd/`, save the session summary to
   Engram, commit on `main`, push, and hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text.
- **PR-01…PR-32 are complete; do not re-slice, re-audit or re-open them.** Units 4–9 are closed; unit 10
  `thin-client-tools` opened with PR-32 and continues with PR-33. A defect in a merged module is its own slice with
  its own audit, not a drive-by edit (B-43, B-44, B-45, B-48, B-49, B-50 wait for such slices).
- Settled in session 32 and recorded: `src/client/spawn.ts` owns the one allow-listed `child_process` call site
  (`spawnDaemon`, an injectable `REAL_SPAWN`-defaulted parameter beyond design's own illustrative snippet — a
  disclosed apply-time refinement, not a deviation from D-01's actual guarantee). `src/client/run-state.ts` owns
  `run/spawn.lock` election (`acquireSpawnLock`, `releaseSpawnLock`, `spawnLockAgeSeconds`) and the client's own
  dead-pid-invalidates read of `run/daemon.json` (`readRunFile`) — both locally reimplemented, never importing
  `daemon/lifecycle/*`, a chosen isolation (verified: extending `client/tsconfig.json`'s references would let the
  cross-import compile) kept for dependency-closure reasons, not a structural wall. `ensureDaemonRunning`
  orchestrates: fast-path read, race for the lock, `spawnIfStillNeeded` (the extracted, directly-tested TOCTOU-safe
  winner-path body), `waitForRunFile` (`fs.watch` + `AbortSignal.timeout`, `realpathSync.native`-resolved to avoid
  the Windows short-path crash). A client never touches `run/daemon.lock` — pinned by a test reading the compiled
  source for the string-literal form, not a blind substring match (the module's own doc comments legitimately
  mention the filename in prose).
- Settled in session 31: `daemon/ipc/routes.ts` owns `POST`/`DELETE /session`, the four `/tools/*` routes, the
  per-session freeze (3 fields only: `bot_id`, `group_id`, `agent_id`), registry invariant R4, and
  `toTelegramErrorPayload`. `daemon/ipc/sessions.ts`'s `SessionStore` has `revoke(bearer): boolean`.
  `shared/ipc-contract.ts`'s `sessionRequestSchema` includes `server_nonce: nonceHexSchema`. `shared/error-payload.ts`'s
  `RETRYABLE_TOOL_CODES` includes `RATE_LIMITED` alongside `TRANSPORT_ERROR`. `DAEMON_VERSION_MISMATCH`/`IPC_ERROR`
  are confirmed exclusively client-side vocabulary (PR-33) with no daemon-side implementation surface anywhere.
- Settled in session 30: `daemon/ipc/handshake.ts` owns `GET /identity` and `PendingHandshakeStore` (single-use
  `server_nonce`, lazy TTL); `DAEMON_IDENTITY_MISMATCH` is exclusively client-side vocabulary (PR-33), never raised
  by the daemon. `SessionStore.validate` is an unconditional O(N) scan (no early return) by design.
- Settled in session 29: the five `HTTP_*` names plus seven transport/handler-raised statuses live in
  `ipc-contract.ts`; the server's six `IPC_*` refusal codes are daemon transport vocabulary, `IPC_HANDSHAKE_FLOOD`
  is a disclosed 7th, handler-raised and retryable; the server validates no route body and checks no bearer.
- Settled in session 28: the send tool's rate code is `RATE_LIMITED`; the send path pre-checks the room with
  `RoomGuardClient.assertTarget`; a 429 reaches the send path through `offsets.retry_after_until`; `BindingMutex`
  and `SendRateBudget` are one instance per daemon, instantiated inside `routes.ts`'s `createSessionRoutes` factory
  — `bootstrap.ts` still does not wire `createSessionRoutes`/`createIpcServer` into the daemon's actual boot
  sequence; that remains open for a later PR.
- Provenance hash rule, registry and range conventions are ratified — §3.
- Doc-hygiene rule: never quote a matched-and-rejected secret-shaped literal in `apply-progress.md`.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a decision.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`. TypeScript 7.0.2 needs `"types": ["node"]`.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job.
- **The general lesson from PR-31's own two re-judgment rounds**: when a fix addresses "field A and field B must
  never both be true," check every place both fields can be produced, not just the one call site a finding named.
- **The general lesson from PR-32's own re-judgment round**: a disclosure comment's comparison to another file's
  test coverage is a factual claim, not decoration — verify it the same way you'd verify a number.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-50** | `daemon/ipc/routes.ts`'s `dispatchTool` forwards a caught tool-level error's message to the external caller with no defense-in-depth redaction pass, unlike every other egress site design's Redaction table names. No concrete leak demonstrated; matches the existing B-37/B-38 precedent. Needs a dedicated slice. | Director |
| **B-49** | spec.md's "Binding never changes mid-session" scenario reads as freezing the whole binding; the shipped freeze is scoped to three identity fields only. Text-only fix at the next spec touch. | Director |
| **B-48** | Design §15's PT-24/PT-26 file pins (`daemon/ipc/server`, `client/handshake`) look stale against the later `ipc/{handshake,sessions,routes}` split. Text-only fix at the next design touch. | Director |
| **B-47** | THREAT-MODEL traces the IPC `Host` check (DNS rebinding) only to the F3 panel (T18, PT-29) and no PT pins the body cap; PR-29 ships both with tests. Text-only fix at the next THREAT-MODEL touch. | Director |
| **B-45** | The poller writes `TELEGRAM_RATE_LIMITED` to `offsets.last_error_code` (DATA-MODEL says `RATE_LIMITED`), audits no 429, and clears `retry_after_until` on every successful poll — which can erase a send-side backoff early. The one open point with runtime effect. | Director → Kairo |
| **B-46** | Design §9 names the rate refusal `TELEGRAM_RATE_LIMITED`; the shipped tool code is `RATE_LIMITED`. Text-only amendment. | Director |
| **B-44** | A room-guard refusal inside a misbuilt transport degrades the send and raises `group_outage` instead of `WRONG_ROOM`. | Director |
| **B-43** | `serve/thread.ts:204` still tells the agent to run `agentbus_fetch`; `admission.ts`'s header points at a fixture that carries no hash. | Director → Kairo |
| **B-42** | SEAM `v1 body sha256` pins are not machine-checked (the v1 checkout is not in CI). | Director |
| **B-40 / B-41** | Design conditions with no contract (`poller_conflict`/`poller_rate_limited`; `secret_store_fallback`). | Director |
| B-39 | CI (and local runs) intermittently red on two wall-clock tests; re-run once and record. Did not reproduce in PR-23..PR-32. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| PR-11/12/13 escalations | SUGGESTION-class rows that survived their second rounds. Nothing blocks. | Director |
| carried (PR-06) | Digest blind spots (`MAX_THREAD_HISTORY` saturation); the fence does not neutralise `&`. | Director |
| **`bootstrap.ts` still doesn't wire the IPC server** | `createSessionRoutes`/`createIpcServer` exist and are fully tested but nothing in the daemon's actual boot sequence calls either yet. Not blocking — no PR before now needed it wired — but a later PR must close this before the daemon is actually reachable over IPC in production. | a later PR (PR-34 `createServer(deps)` or the daemon-side wiring it depends on) |
| B-16 / D-10, B-11, B-12 / B-13 | Licence files and copyright line; trademark screening; macOS scope; migration runbook (PR-38). | Director |
| B-05, B-08, B-09 | F0 spikes still open (B-08 — IPC handshake and named-pipe DACL on Windows — closed its daemon-side half with PR-31; the client-side half continues through PR-33/PR-34). | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI (update to 2.1.0 available for the separate
  `engram` CLI — not yet applied, no functional impact observed), TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **917 tests** (916 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`) — see §4's `fs.watch`
  gotcha if any future code watches a directory under it.
- Verification worktrees: `../telegram_bus_agent-worktrees/` — **empty** at the end of session 32 (`pr32-judges`
  and `pr32-verify` both removed cleanly via the junction-first procedure; stale remote-tracking refs for old
  deleted branches pruned with `git fetch --prune origin`).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 70–100 s per leg).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it).
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down**. Never quote or commit.
