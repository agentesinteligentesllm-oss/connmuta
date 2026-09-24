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
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. Session 31
merged **PR-31** (session/tool routing, the per-session freeze, roster-hash drift, error-taxonomy
composition, closing unit 9 `ipc-handshake`) with both blind judges, a separate independent verifier,
and **both** re-judgments of the budget — the route §2 describes is the one that produced it. Unit 10
`thin-client-tools` now opens with **PR-32**, the first PR to write any code under `src/client/`.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-32 (`src/client/spawn.ts` + `src/client/run-state.ts`, lazy spawn D-01 + client-side spawn election, abre la unidad 10 `thin-client-tools`): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + Judgment Day con ambos jueces + verificador independiente); la Arena no está disponible, así que nada depende de un debate ni de la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** (session 31 deleted its `odd/` tree). The status command must print
`nextRecommended: apply`, `completed: 156`, `pending: 54` (of `210`), `blockedReasons: []`. Anything else:
stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count
yourself with `grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 156).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-31** (PR-31 merged as PR #35, `906e852`; candidate `c349d96`, corrections `33701b4`/`107b652`/`5eae0c1`, record tip `fcd1fdd`). **Unit 9 `ipc-handshake` closes with PR-31; unit 10 `thin-client-tools` opens with PR-32.** **Next slice: PR-32** — `src/client/spawn.ts` + `src/client/run-state.ts` (lazy spawn D-01 Option A: the one allow-listed `child_process` call site; client-side spawn election over `run/spawn.lock`, `SPAWN_LOCK_STALE_SECONDS`). First PR to write any source under `src/client/` (currently only a scaffolded `tsconfig.json`). | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | `tasks.md` has **45 `####`-level PR headers total** (`grep -c '^#### PR-' tasks.md`), of which **34 header lines cover `PR-01`…`PR-31`** and **11 remain, naming `PR-32`…`PR-42`** — both directly counted, unambiguous. Separately, **37 distinct GitHub PRs have actually merged** through PR-31: three headers (`PR-06`, `PR-08`, `PR-09`) were each re-sliced *at apply time* into two separately-merged PRs (`…a`/`…b`) without gaining a second header line, so the "merged" count (37) is higher than the "header lines covered" count (34) — this is the same discrepancy `state.yaml`'s own PR-11 entry already flagged as not fully reconciled ("tasks.md holds 45 blocks over 42 row ids"); do not force these two counting bases into one subtraction. **Checkboxes: 156 of 210**, always the cleanest single number to cite. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **156/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | `src/shared/*` (15 modules, `ipc-contract.ts` now carries `server_nonce` on `sessionRequestSchema` and `error-payload.ts` now carries `RATE_LIMITED` in `RETRYABLE_TOOL_CODES`, both with twins), `src/cli/*`, `src/registry/*`, `src/ledger/*` (11), `src/secret-store/*` (5), `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts`, `src/daemon/lifecycle/*` (4), `src/daemon/transport/*` (5), `src/daemon/serve/*` (3), `src/daemon/send/*` (3), `src/daemon/ipc/{server,handshake,sessions,routes}.ts`, all with twins — **900 tests** (899 pass, 1 skip), `test:static` **8/8**. `src/client/` exists only as a scaffolded `tsconfig.json` referencing `shared` — **no source file yet**. | PRs `#1`–`#35` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **23 entries** (PR-31 is new code, no v1 range, same as PR-29/30). PR-32 is confirmed new code too (v1 has no daemon/client split at all — see §3). | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-31**, one record each in the tribunal index. PR-23..PR-31: Judgment Day with **both judges** + independent verifier, all **APPROVED** (`bus-v2-f1-pr-2{3..9}-audit-001`, `bus-v2-f1-pr-30-audit-001`, `bus-v2-f1-pr-31-audit-001`). PR-22a/22b: inline passes (the judges were down then). PR-31 used **both** re-judgment rounds — see §6 for what each round found and the general lesson it left. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused before
the child launches (`SDD preflight cancelled or invalid; no session consent recorded`) — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line budget
with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` envelope exists. One variant: if a human has already run `/gentle:sdd-preflight` in the TUI,
or the Director asks, the slice may run through `sdd-apply`.

**2. The per-slice pipeline sessions 27–31 ran — repeat it exactly.**
1. **Map** once (delegated `Explore`, read-only): v1 range (if any), consumed APIs with verbatim signatures, DDL,
   spec, design, the tasks block, and every contradiction between them. **Session 31's own PR-32 mapping already
   ran** and found three load-bearing facts §4 below states in full — read them before writing anything, they are
   not optional context.
2. **Decide** the open design points yourself (the Director delegated them) and write them into the writer's brief;
   each decision is stated in the module doc and in `apply-progress.md`, and a `tasks.md` *apply-time note* records the
   decisions and any edit outside the block's Scope line.
3. **Write** (delegated `general-purpose`, sonnet): src + twin (+ PT cells only if the block has a Docs task — PR-32's
   does, task 32.4, but read §4's Flag 3 before touching PT-27's cell: the file names that task names are almost
   certainly the wrong PT-27 cell to fill). The writer does not commit. **Insist on RED first** and ask for the
   verbatim RED lines.
4. **Parent readback** of the source before freezing — it found a defect in every slice since session 28, including
   a real gap in already-merged code during PR-31 (`shared/ipc-contract.ts`'s `sessionRequestSchema` was missing a
   field design's own sequence diagram always required; fixed at its source rather than routed around, since the
   existing merged test was asserting the incomplete shape was complete — ADR-12). **Read every number your own
   record states before writing it down** — PR-31's own two "net" line-count figures and one total were wrong on
   the first attempt (one caught by the independent verifier, one self-caught before commit); a parent's own
   arithmetic gets the same distrust as a subagent's.
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only control that
   MUST survive, BUILD-FAIL and TIMEOUT reported apart. A survivor is a test gap → pin it (that is the behavioural RED);
   an **equivalent** mutant is argued in the record, not pinned; a mutant the suite **cannot observe** is recorded as
   such, not called equivalent. **PR-31's sweep found one real survivor** (a rate-limit HTTP-status mapping no test
   imported the constant needed to check) — pinned by exporting the private function and testing it directly, the
   same move `toTelegramErrorPayload`'s own precedent already used.
6. Full suite + `test:static` from a clean `dist/`; `git add -N` **new files only, never `git add -N .`** (a stray
   `git stash -u` in session 31 briefly swept the session's own untracked `odd/` scratch files instead of isolating
   `main` for a baseline measurement — caught immediately from the command's own output, popped back before any other
   action; the lesson is the same as PR-30's own `git add -N .` incident: scope destructive/broad commands explicitly
   while an untracked scratch tree exists alongside tracked work); measure `git diff --numstat main -- src test`;
   commit code **with** its records (`tasks.md` ticks + size reconciliation + apply-time note, `apply-progress.md`
   section).
7. **Judgment Day**: frozen worktree, `jd-judge-a` + `jd-judge-b` in parallel, result shape `{findings, evidence}`.
   In parallel, a **separate independent verifier** (`general-purpose`) on its own worktree with a mandate to
   reproduce every figure, re-run the sweeps, write up to six extra mutants and **probe the running code** — it found real
   gaps in every slice (PR-31: 4 of 6 new mutants survived, all real coverage gaps: an audit row's own field values,
   an error-composition field, three of four routes' schema gates, one schema field). **The judges have no Bash**: they
   check figures by reading and arithmetic only; the verifier is the one that re-measures.
8. Reproduce single-judge rows before correcting; correct (parent inline for small batches); commit code and record
   together; scoped re-judgment over the delta only. **Budget: two re-judgments**; PR-31 used both. **The sharpest
   lesson of PR-31's own two re-judgment rounds**: a structural fix for ONE reported instance of a bug class is not
   the same as fixing the class. Round 1 found the CRITICAL's first fix only worked for the one reported code
   (`RATE_LIMITED`) rather than the general property (any code); round 2 found THAT fix had in turn only gated one of
   two composing code branches, not both. Ask explicitly, for any "fix a contradiction between fields A and B": *does
   this fix the one reported combination, or the general rule that produces it, in every branch that could produce
   it?* — and if a shared helper can enforce the rule once instead of duplicating a check per branch, prefer the
   helper.
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude Code line);
   `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Get the untracked inventory with `gentle-ai review status --cwd . --contract
gentle-ai.review-integration/v2 --agent claude-code --next-transition` (field `eligible_untracked_inventory`), then run
`gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha> --committed-only --untracked-scope=exclude
--expected-untracked-inventory=<that sha256:…> --json` and record tier and `review_due`. **Do not START the native review
for a Judgment Day target**: the installed `judgment-day` skill states it replaces ordinary 4R and both must never run on
one target, and START's consent envelope belongs to the Director. Record that in the slice's audit row. (PR-31's own
`assess` at close read `risk: medium`, `review_due: true`, `slice_budget_reached` — recorded, not started, same as
every slice since PR-23.)

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those. This
project has already caught the opposite mistake twice (PT-14 in PR-06a, PT-25's registry/send-path split) — **PR-32's
own task 32.4 is at real risk of repeating it**: read §4's Flag 3 before editing PT-27's cell. Do not invent a Docs
task where none is warranted; if a mapper finds a PT id a slice genuinely pins, record that reading in the apply-time
note rather than silently adding or silently skipping a cell edit.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip and
labelled with it. PR-28 1,285 (885), PR-29 1,609 (1,209), PR-30 619 (219, grown across two Judgment Day correction
rounds), **PR-31 1,495 at its final tip** (1,095-line exception, grown from the candidate's 1,303 across three
Judgment Day correction commits, two of them scoped-re-judgment-driven and one parent-verified without a further
round since the two-round budget was already spent) — every estimate priced only the primary deliverable; disclosed
edits outside the primary scope line (PR-31 touched two, `sessions.ts` and `ipc-contract.ts`, for real gaps found
during readback) and Judgment Day's own correction rounds are most of the overrun. PR-32 is estimated **≈300 lines**;
given every slice since PR-06b has needed a disclosed exception and PR-32 has its own out-of-scope tsconfig.json edits
already flagged (§4, Flag 2), expect the same pattern. Add a *Size reconciliation* note under the block's header in
`tasks.md` (gate text left as written).

**6. Frozen worktrees — the junction rule (session 28 incident, followed cleanly in 29, 30 and 31).** `git worktree add
--detach ../telegram_bus_agent-worktrees/<name> <sha>`. Only the verifier's worktree needs `node_modules`: create the
junction with PowerShell `New-Item -ItemType Junction -Path '<win path>\node_modules' -Target '<main win path>\node_modules'`.
**To remove: delete the junction first with PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`,
verify it is gone (`test -e … || echo removed`) and that `node_modules/typescript/lib/tsc.js` still exists in the main
checkout, and only then `git worktree remove --force`.** `git worktree remove --force` follows a live junction and
empties the main `node_modules`; if that happens, `npm ci` restores it exactly from the shrinkwrap. Session 31 also used
a throwaway worktree (`main-baseline-check`, no junction needed) to measure `main`'s true baseline test count when a
citation inside `tasks.md` turned out to describe an intermediate count rather than a final one — this is a legitimate,
cheap way to settle a genuine "what does `main` actually measure" question without disturbing the working branch;
remove it the same junction-first way if it ever needs one.

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

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

**PR-32** (`client/spawn.ts`, `client/run-state.ts`) is **new code, confirmed**: v1 (`telegram-agent-bus`) has no
daemon/client split at all — it is a single MCP server process that talks to Telegram directly, with no lazy-spawn,
no daemon-launch, no multi-process logic anywhere to vendor. The only `child_process` string in the entire v1
checkout is inside `v1:test/security.test.ts:44-46`'s own static-assertion predicate (`hasChildProcessReference`),
used there only to assert v1's single bundle contains **zero** such references — not spawn logic to source-range.
A new module must not spell `Provenance:` in its leading block (B-33). Older pins are in `apply-progress.md` and in
each module's header. SEAM pins are **not machine-checked** by `provenance.test.ts` (B-42).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **`client/*` cannot import `daemon/lifecycle/{lock,run-file}.ts` — this is a compile-unit wall, not a style choice** | `src/client/tsconfig.json`'s `references` array is `[{ "path": "../shared" }]` only — no `../daemon`. Design's own compile-unit table (§2 of the table in design.md's §2.2-equivalent section) makes `client` → `shared` + node builtins only; importing `daemon`/`ledger`/`registry`/`secret-store` from `client` is a `tsc -b` project-reference error. Yet `daemon-lifecycle › Client-side spawn election` (spec.md) explicitly describes `run/spawn.lock` as using "the same `wx` + stale-window pattern" `daemon/lifecycle/lock.ts` (PR-15) already implements, and `run-state.ts` needs a `DaemonRunPayload`-shaped `{port, pid, secret}` read exactly like `daemon/lifecycle/run-file.ts`'s `readRunFile`. **Pattern reuse, not code reuse**: `run-state.ts` must locally reimplement its own `wx`-flag exclusive-create / stale-age check / reclaim-once election, and its own run-file read with the dead-pid-invalidates-the-file check, mirroring the algorithms in `lock.ts`/`run-file.ts` without importing either. No `src/shared/lock*.ts` or `run-file*.ts` exists to import instead, and neither design.md nor tasks.md proposes extracting one — `tasks.md`'s own Scope line for PR-32 names only the two new `client/` files. Decide explicitly whether to duplicate the logic (the reading this project's structure implies) or escalate a shared-module extraction as a design deviation, and disclose whichever you pick. | `src/client/tsconfig.json`, `src/daemon/lifecycle/{lock,run-file}.ts`, session-31 PR-32 mapping |
| **PR-32 must also touch two `tsconfig.json` files, outside its own declared Scope line** | `src/client/` is about to get its first `.ts` source file. This project's own established convention (already used for PR-15/`daemon` and stated as a code comment) requires: (a) the root `tsconfig.json`'s `references` array gains `{ "path": "src/client" }` (currently lists `shared`, `cli`, `registry`, `ledger`, `secret-store`, `daemon` — `client` is absent); (b) `src/cli/tsconfig.json`'s `references` array gains back `{ "path": "../client" }` (a referenced composite project with zero input files is `TS18003`, so the reference was pulled until the slice that writes the first file — PR-32, this one). **`src/cli/tsconfig.json`'s own comment is now stale**: it still says both `../client` and `../daemon` are "deliberately absent" but `../daemon` was already re-added when PR-15 landed — update the comment text, not just the path, when re-adding `../client`. | `tsconfig.json`, `src/cli/tsconfig.json`, `apply-progress.md:2144-2148` (the PR-15/PR-32 precedent this rule is stated under) |
| **PT-27's file-name cell is very likely the wrong target for task 32.4 as literally worded** | Design's own canonical PT→file map assigns PT-27 to `test/security/client-bundle.test.ts` (a file that does not exist yet — `test/security/` currently has only `pack.test.ts`, `provenance.test.ts`, `repo-scan.test.ts`), explicitly deferred to **PR-40** by `tasks.md`'s own parenthetical on PR-32's Requirements line: "(PT-27 — full multi-clause bundle scan in PR-40)". The `Lazy spawn` requirement has TWO spec scenarios: "Bundle scan finds exactly one spawn site" (the static/PR-40 half PT-27 actually names) and "Argv never carries caller input" (the unit-test half task 32.1 targets). Filling PT-27's cell with `test/client/spawn.test.ts`/`run-state.test.ts` would repeat the exact over-claim class two independent judges already caught twice in this change (PT-14 in PR-06a, PT-25's registry/send-path split, `tasks.md:122`/`:265-268`). Map this explicitly before touching THREAT-MODEL.md — the honest move is very likely to disclose that PT-27's real file pin stays open until PR-40, and that PR-32's tests cover only the argv/election behavior, not the bundle-scan clause. | `THREAT-MODEL.md:150,202`, `specs/daemon-lifecycle/spec.md`'s two "Lazy spawn" scenarios, `tasks.md:122,265-268` (the PT-14/PT-25 precedents) |
| **`DAEMON_ENTRY` and `SPAWN_OPTIONS` are new file-local constants, not existing shared exports** | Neither exists anywhere in `src/` today. Design's own snippet declares both as `const`s local to `client/spawn.ts` itself: `const DAEMON_ENTRY = fileURLToPath(new URL("../daemon/main.js", import.meta.url));` and `const SPAWN_OPTIONS = { detached: true, stdio: "ignore", shell: false, windowsHide: true } as const;`. `SPAWN_LOCK_STALE_SECONDS` and `SPAWN_WAIT_SECONDS` DO already exist in `shared/constants.ts` (already used by design's own sequence diagram) — reuse those, don't redefine. | `design.md`'s §11 thin-client table, `src/shared/constants.ts:204-217` |
| **The daemon's real entry point takes an optional `--home <dir>` flag — production spawn must NOT pass it** | `src/daemon/main.ts` accepts `--home` for test/diagnostic use, but design is explicit the D-01 spawn call passes no argv beyond the literal two-element array (`[DAEMON_ENTRY]`) — no `--home`, no other flag. `spawnDaemon()`'s whole point is a compile-time-literal argv with zero caller-controlled content reaching it. | `src/daemon/main.ts` (full file, 35 lines) |
| **`test/client/` does not exist yet** | PR-32 creates the directory alongside its first two test files. No existing client-adjacent test harness to mirror beyond `test/daemon/lifecycle/lock.test.ts`'s general pattern (real temp dirs via `mkdtempSync`, cleaned in a `finally`, real `process.pid` for "this process" and `process.pid + 9999`-style literals for "a foreign process," no fake-clock *object* — a pure function that takes an explicit `now: number` argument is the pattern, not an injected `Clock`). `test/fakes/clock.ts` is named in design.md but does not exist yet either — scaffolded on demand, per-PR. | `test/daemon/lifecycle/lock.test.ts` |
| **PR-32's own Runtime-harness line scopes the N-clients-race test to IN-PROCESS concurrency** | Not real child processes: "injected `spawnImpl` in unit tests; the N-clients-race scenario runs concurrent in-process client instances against a shared temp `run/` directory." Matches design's own Client test-layer row. Don't reach for `node dist/src/daemon/main.js --home <tmp>`-style real-process harnesses here — that pattern is the DAEMON layer's own test convention (design.md), not this PR's. | `tasks.md`'s PR-32 Runtime-harness line, design.md's test-layer table |
| **`state.yaml`'s own "row id" counter is flagged, by the project itself, as unreliable** | Its PR-11 entry already states the carried "of-the-45-rows" counter does not resolve against `tasks.md`'s actual 45-block/42-row-id shape. Session 31 stopped restating it rather than propagate a figure nobody has re-derived; cite PR blocks (verifiable: `grep -c '^#### PR-' tasks.md`) and task checkboxes (verifiable: the §0 command) instead, unless a session actually resolves the row-id definition properly. | `state.yaml`'s PR-11 `completed_slices` entry |
| **A parent's own record prose needs the same distrust as a subagent's** | PR-31's own `apply-progress.md` record had two small "net" line-count errors (caught by the independent verifier) and one total-line arithmetic slip (self-caught before commit, `1,458` vs. the correct `1,457`) — none of them in the audited *code*, all in the orchestrator's own bookkeeping prose. Recompute a stated figure from the actual `git diff --numstat` output before writing it, don't propagate a number from memory or a prior draft. | PR-31's own record, this session |
| **Sweep harness needs bounds** | A mutant that breaks a network path leaves test clients waiting forever: run tests with `--test-timeout=5000` and `spawnSync(process.execPath, …, { timeout: 150000 })` **without a shell** (with `shell: true` the kill reaches `cmd.exe`, not `node`). Report `KILLED(TIMEOUT)` apart. Every socket-waiting test needs its own timeout too. | sessions 29–31 |
| **`git add -N` — scope it, never `.` (and the same discipline applies to `git stash -u`)** | Session 30 ran `git add -N .` once and briefly intent-to-added the untracked `odd/` tree; session 31 ran `git stash -u` intending to isolate `main` for a measurement and instead stashed the session's own untracked `odd/` scratch files (no `main` checkout ever happened) — caught immediately from the command's own output, popped back before anything else. Always name the specific new files for `add -N`; for an actual clean-`main` measurement, use a throwaway `git worktree add --detach` instead of touching the working tree at all. | sessions 30–31 |
| **Node HTTP facts** | An HTTP/1.1 request with no `Host` line is refused by Node's parser (bare 400) before any handler; duplicate/negative/garbage `Content-Length` and `Transfer-Encoding` + `Content-Length` are refused the same way; `fetch` cannot set `Host` (use `node:http` or `net`); a client still writing past a refusal may get a reset instead of the response. | PR-29 record |
| **A writer's RED is usually compile-level** (`TS2305`/`TS2307`/`TS2339`). | The behavioural RED is the parent's: readback fixes and sweep survivors, each pinned by a test that fails without the fix. | sessions 27–31 |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; it builds via `node_modules/typescript/lib/tsc.js -b` directly (not `npx`, avoids a shell), restores the file and checks its sha256. Lives in the untracked `odd/` tree (deleted at close): recreate it (≈75 lines) **with the bounds above**. Use a replacer function (`s.replace(from, () => to)`): a `$` + backtick in a replacement string is a special pattern. `&& false` mutants fail to build under TS narrowing — use a runtime-opaque condition. After a source edit, re-anchor mutants whose `from` moved. A mutation that TypeScript itself rejects at build time (e.g. removing a narrowing guard so a later `.field` access becomes `possibly undefined`) is a legitimate **BUILD-FAIL**, reported apart from an ordinary kill or survivor — it means the type system, not a test, is what would catch that regression. | sessions 28–31 |
| **The AS-IS transports lose error detail** | `GroupTransport` turns a guard refusal or a 429 into a soft `{ok: false, code}`; `DualWriteTransport` drops a DM error's cause — confirmed again in PR-31's own Judgment Day (the verifier traced the real runtime cause chain and confirmed `classifyErrorChain` finds nothing to walk for a locally re-detected 429, exactly as `send/rate.ts`'s own module doc states). Send-side checks run before the call or through the ledger. | PR-27, PR-28, PR-31 |
| **`offsets.retry_after_until` is shared** | Per `bot_id`, written by the poller and by `send/rate.ts`; the poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring anything. | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | An async callback is refused before `BEGIN`; do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **A shared "must never both be true" property is best enforced by ONE function, not per-branch checks** | `daemon/ipc/routes.ts`'s `toTelegramErrorPayload` needed the same "never `retryable:false` with a populated `retry_after_s`" rule in two separate composing branches; two separate inline checks meant fixing one branch silently left the other only *accidentally* correct. `withRetryAfterIfRetryable(payload, retryAfterS)` is now the one place both branches go through — a useful shape to reach for whenever a slice needs the same invariant enforced from more than one call site. | `src/daemon/ipc/routes.ts`, PR-31 Judgment Day round 2 |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). `roster_drift` (D-07) and `binding_mismatch` (R4) are surfaced as bare strings by `routes.ts` directly, deliberately not routed through `conditions-store.ts`'s closed `ConditionName` union (which doesn't include either) — the same pattern `registry/loader.ts`'s `REGISTRY_INVALID_CONDITION` already uses. | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId` in `serve/fetch.ts`, `serve/status.ts` (and `serve/thread.ts`). Extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status` (§2.3). | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key>` (sessions 29–31 used it throughout). | sessions 27–31 |
| **Subagents were available all of sessions 27–31** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits (global rule); PR bodies end with the Claude Code line. Write long messages to a file and use `git commit -F`. | sessions 27–31 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header** | A non-vendored module must not spell `Provenance:` there; a module doc belongs in the leading block, before the imports. | **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files (named explicitly — see the row above) before `test:static`. | PR-09b… |
| **PT-22's token shape** | Synthetic bot ids use seven digits (`1234567:${"A".repeat(35)}`); no fixture may match `\d{8,10}:[A-Za-z0-9_-]{35}`. | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means **no limit**; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines truncate silently** | Write files with the file tools or Python; verify line counts. | sessions 13–21 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`state.yaml` is YAML** | Parse (or at least run `gentle-ai sdd-status` and check `taskProgress`) after editing; `tribunal_state` appears in several phases — edit the `apply:` one; keep `next_recommended` current. | sessions 28–31 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–31 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run. It did not reproduce at all during PR-31's runs (all green on the first attempt, both CI legs). Re-run once and record if it does. | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 156/210. Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4 (all
   three flags — they are load-bearing, not optional colour), `tasks.md`'s **PR-32 block**,
   `specs/daemon-lifecycle/spec.md`'s two requirements this slice implements — "Lazy spawn is one allow-listed call
   site (D-01 Option A)" and "Client-side spawn election uses a separate stale window" — and design.md's §10
   sequence diagram (the `alt` block is this slice's whole scope: everything from `GET /identity` onward belongs to
   PR-33), §11's thin-client table rows "Lazy spawn (D-01)" and "Spawn wait", and D-01/D-16 (`proposal.md`,
   `design.md` §18).
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram mirror
   `odd/<feature>/tasks`, before the first write. PR-32 **opens unit 10** `thin-client-tools`.
3. **Branch** `f1/32-client-spawn-runstate` from `main`, then run §2.2's pipeline:
   - **Decide first, before any code**: (a) locally reimplement the `wx`/stale-window/run-file-read logic in
     `run-state.ts`, or escalate a shared-module extraction (§4's first flag) — reimplementing locally matches
     every signal in the current task/design text; (b) how to honor task 32.4 given PT-27's cell almost certainly
     belongs to PR-40, not this slice (§4's third flag) — disclosing the split rather than mis-filling the cell is
     the move every precedent in this project points to.
   - **32.1 RED** `test/client/spawn.test.ts` ("argv never carries caller input": spawned argv is unchanged from
     the compile-time literal regardless of `--project`) and `test/client/run-state.test.ts` ("N clients racing
     spawn exactly one daemon": exactly one client wins `run/spawn.lock`, calls `spawnDaemon()` once, the other
     N-1 wait on the run-file event instead of spawning a second daemon — in-process concurrency with an injected
     `spawnImpl`, not real child processes).
   - **32.2 GREEN** `src/client/spawn.ts` (`DAEMON_ENTRY`/`SPAWN_OPTIONS` as file-local consts per design's exact
     snippet, `spawnDaemon()` calling `spawn(process.execPath, [DAEMON_ENTRY], SPAWN_OPTIONS)` with `child.unref()`,
     zero other `child_process` references anywhere in the client closure) and `src/client/run-state.ts` (`fs.watch`
     + `AbortSignal.timeout(SPAWN_WAIT_SECONDS * 1000)`, the locally-reimplemented `run/spawn.lock` `wx` election
     with `SPAWN_LOCK_STALE_SECONDS`, the locally-reimplemented run-file read).
   - **Also this PR, per §4's second flag**: add `{ "path": "src/client" }` to the root `tsconfig.json`'s
     `references`; re-add `{ "path": "../client" }` to `src/cli/tsconfig.json`'s `references` and update its now-stale
     comment (only `../client` was ever actually absent — `../daemon` came back with PR-15).
   - **32.3 Verify**: `npm run build && node --test "dist/test/client/spawn.test.js" "dist/test/client/run-state.test.js"`.
   - **32.4 Docs**: resolve per §4's third flag before editing anything in `THREAT-MODEL.md`.
4. Audit per §2.2 steps 7–9; merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s status line,
   `state.yaml` (counts, `completed_slices`, `tribunal_debate`, `tribunal_state`, `next_recommended`; check with
   `gentle-ai sdd-status`) and the `00-INDEX.md` board if the backlog grew, delete `odd/`, save the session summary to
   Engram, commit on `main`, push, and hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text.
- **PR-01…PR-31 are complete; do not re-slice, re-audit or re-open them.** Units 4–9 are closed; unit 10 opens with
  PR-32. A defect in a merged module is its own slice with its own audit, not a drive-by edit (B-43, B-44, B-45, B-48,
  B-49, B-50 wait for such slices).
- Settled in session 31 and recorded: `daemon/ipc/routes.ts` owns `POST`/`DELETE /session`, the four `/tools/*`
  routes, the per-session freeze (3 fields only: `bot_id`, `group_id`, `agent_id` — deliberately narrower than
  `bindings.ts`'s own `areBindingsEquivalent`), registry invariant R4, and `toTelegramErrorPayload`.
  `daemon/ipc/sessions.ts`'s `SessionStore` now has `revoke(bearer): boolean` (`Set.prototype.delete`'s own
  semantics, no constant-time comparison needed since the caller already proved possession via a prior `validate`
  call). `shared/ipc-contract.ts`'s `sessionRequestSchema` now includes `server_nonce: nonceHexSchema` (a real gap
  in the PR-29/30 contract, closed at its source). `shared/error-payload.ts`'s `RETRYABLE_TOOL_CODES` now includes
  `RATE_LIMITED` alongside `TRANSPORT_ERROR`. `DAEMON_VERSION_MISMATCH`/`IPC_ERROR` are confirmed exclusively
  client-side vocabulary (PR-33) with no daemon-side implementation surface anywhere.
- Settled in session 30: `daemon/ipc/handshake.ts` owns `GET /identity` and `PendingHandshakeStore` (single-use
  `server_nonce`, lazy TTL); `DAEMON_IDENTITY_MISMATCH` is exclusively client-side vocabulary (PR-33), never raised
  by the daemon. `SessionStore.validate` is an unconditional O(N) scan (no early return) by design — a property
  enforced by code review, not a regression test, because an early-return version is functionally identical on
  every input.
- Settled in session 29: the five `HTTP_*` names plus seven transport/handler-raised statuses live in
  `ipc-contract.ts`; the server's six `IPC_*` refusal codes are daemon transport vocabulary, `IPC_HANDSHAKE_FLOOD`
  is a disclosed 7th, handler-raised and retryable; the server validates no route body and checks no bearer — every
  route handler (now including `routes.ts`) does its own.
- Settled in session 28: the send tool's rate code is `RATE_LIMITED` (B-46 only asks to amend design §9's text); the
  send path pre-checks the room with `RoomGuardClient.assertTarget`; a 429 reaches the send path through
  `offsets.retry_after_until`; `BindingMutex` and `SendRateBudget` are one instance per daemon, instantiated for the
  first time inside `routes.ts`'s `createSessionRoutes` factory (PR-31) — `bootstrap.ts` still does not wire
  `createSessionRoutes`/`createIpcServer` into the daemon's actual boot sequence; that remains open for a later PR.
- Provenance hash rule, registry and range conventions are ratified — §3.
- Doc-hygiene rule: never quote a matched-and-rejected secret-shaped literal in `apply-progress.md`.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a decision.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`. TypeScript 7.0.2 needs `"types": ["node"]`.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job.
- **The general lesson from PR-31's own two re-judgment rounds, worth internalising rather than just filing**: when
  a fix addresses "field A and field B must never both be true," check every place both fields can be produced, not
  just the one call site a finding named. A fix scoped to the report is not the same as a fix scoped to the
  invariant.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-50** | `daemon/ipc/routes.ts`'s `dispatchTool` forwards a caught tool-level error's message to the external caller with no defense-in-depth redaction pass, unlike every other egress site design's Redaction table names. No concrete leak demonstrated; matches the existing B-37/B-38 precedent (no ready-made redaction primitive exists yet — `shared/secrets.ts` only detects). Needs a dedicated slice. | Director |
| **B-49** | spec.md's "Binding never changes mid-session" scenario reads as freezing the whole binding; the shipped freeze (and design's own Freeze row) is scoped to three identity fields only. Text-only fix at the next spec touch. | Director |
| **B-48** | Design §15's PT-24/PT-26 file pins (`daemon/ipc/server`, `client/handshake`) look stale against the later `ipc/{handshake,sessions,routes}` split. Text-only fix at the next design touch. | Director |
| **B-47** | THREAT-MODEL traces the IPC `Host` check (DNS rebinding) only to the F3 panel (T18, PT-29) and no PT pins the body cap; PR-29 ships both with tests. Text-only fix at the next THREAT-MODEL touch. | Director |
| **B-45** | The poller writes `TELEGRAM_RATE_LIMITED` to `offsets.last_error_code` (DATA-MODEL says `RATE_LIMITED`), audits no 429, and clears `retry_after_until` on every successful poll — which can erase a send-side backoff early. The one open point with runtime effect. | Director → Kairo |
| **B-46** | Design §9 names the rate refusal `TELEGRAM_RATE_LIMITED`; the shipped tool code is `RATE_LIMITED`. Text-only amendment. | Director |
| **B-44** | A room-guard refusal inside a misbuilt transport degrades the send and raises `group_outage` instead of `WRONG_ROOM`. | Director |
| **B-43** | `serve/thread.ts:204` still tells the agent to run `agentbus_fetch`; `admission.ts`'s header points at a fixture that carries no hash. | Director → Kairo |
| **B-42** | SEAM `v1 body sha256` pins are not machine-checked (the v1 checkout is not in CI). | Director |
| **B-40 / B-41** | Design conditions with no contract (`poller_conflict`/`poller_rate_limited`; `secret_store_fallback`). | Director |
| B-39 | CI (and local runs) intermittently red on two wall-clock tests; re-run once and record. Did not reproduce at all in PR-23..PR-31. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| PR-11/12/13 escalations | SUGGESTION-class rows that survived their second rounds. Nothing blocks. | Director |
| carried (PR-06) | Digest blind spots (`MAX_THREAD_HISTORY` saturation); the fence does not neutralise `&`. | Director |
| **`bootstrap.ts` still doesn't wire the IPC server** | `createSessionRoutes`/`createIpcServer` exist and are fully tested (PR-29..31) but nothing in the daemon's actual boot sequence calls either yet. Not blocking — no PR before now needed it wired — but a later PR must close this before the daemon is actually reachable over IPC in production. | a later PR (PR-34 `createServer(deps)` or the daemon-side wiring it depends on) |
| B-16 / D-10, B-11, B-12 / B-13 | Licence files and copyright line; trademark screening; macOS scope; migration runbook (PR-38). | Director |
| B-05, B-08, B-09 | F0 spikes still open (B-08 — IPC handshake and named-pipe DACL on Windows — closed its daemon-side half with PR-31; the client-side half continues through PR-32/33). | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI (update to 2.1.0 available for the separate
  `engram` CLI — not yet applied, no functional impact observed), TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **900 tests** (899 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- Verification worktrees: `../telegram_bus_agent-worktrees/` — **empty** at the end of session 31 (`pr31-judges`,
  `pr31-verify`, and the throwaway `main-baseline-check` all removed cleanly via the junction-first procedure where
  applicable, §2.6).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 70–100 s per leg).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it).
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down**. Never quote or commit.
