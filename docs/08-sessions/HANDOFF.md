# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
>
> **Reading order for a zero-context session:** §0 → §1 → §5. Then §3 (contracts the next slices
> need), §4 (traps), §6 (do not redo), §7 (open points) as the task needs, and §8 for the environment.
>
> **Last rewritten: end of session 53** (2026-09-28). Everything below describes the state after it.

---

## §0 — Quick start

**F1, F2, F3 and F5 are archived and untouched. F4 (`f4-claude-channels-adapter`) is the one open SDD
change, in `sdd-apply`, and PR-05 (the adapter package) is complete.** Merged to `main` so far: PR-01
(`#95`), PR-02 (`#96`), PR-03 (`#97`), PR-04 (`#98`) and PR-05's four slices 05a (`#99`), 05b (`#100`),
05c (`#101`) and 05d (`#102`). The last code commit is `48c8c39` (05d); one docs-only commit sits on top
of it (see `git log`), and `main` equals `origin/main`. **Not started: the small B-95/B-96 fix PR, PR-06,
PR-07, then `sdd-verify` and `sdd-archive`.**

**Copy-paste prompt to start the next session** (kept to 3 lines per the Director's instruction):

```text
F4 PR-05 completo (PRs #95-#102 mergeados) — lee docs/08-sessions/HANDOFF.md, confirma Arena (DN-09) y mi autonomía total con Alpha como juez.
Arranca el PR pequeño B-95/B-96 (§5) y después sdd-apply PR-06 (alcance enmendado en tasks.md); pide RDD por candidato y recomiéndame granted.
Árbol limpio esperado (docs de la sesión 53 ya commiteadas); B-97 (guardia de entrada de src/cli/main.ts) lo decido yo.
```

**First commands, in order** (stop and report if any disagrees):

```bash
git branch --show-current && git pull --ff-only     # must be main, up to date
git log --oneline -3 origin/main                     # 48c8c39 (05d) is the last code commit; a docs-only commit is on top; must equal local HEAD
rm -rf dist                                          # a stale dist/ silently fakes results
ls openspec/changes/                                 # archive/ and f4-claude-channels-adapter/
git status --short                                   # must print nothing
```

**Expected working tree: clean.** The docs of session 53 (`AGENTS.md`, `docs/00-INDEX.md`,
`docs/05-tribunal/INDEX.md`, `docs/06-backlog/CHECKLIST.md`, `docs/08-sessions/HANDOFF.md`,
`docs/08-sessions/LOG.md`) and the F4 artifacts under `openspec/changes/f4-claude-channels-adapter/`
(`tasks.md`, `design.md`, `apply-progress.md`) were committed as docs-only commits on the Director's
standing authorization: `3c19954` (05b) and `8319cb9` (05c) as those slices landed, and one close-out
commit on top of `48c8c39`. If `git status` shows anything, stop and report before assuming it is safe.

**Arena reachability (DN-09).** Check it live with a real `bridge_send`, never `curl`. A successful send
is enough; do not wait for Alpha's reply just to clear this gate. Session 53 had Arena reachable
throughout (6 slice debates, all `CONSENSUS`, plus the documentation close-out audit).

**Standing instructions from the Director, and how to treat them.**
- Full autonomy with Alpha as judge (including commit, push, PR and merge once Alpha and RDD have signed
  off) was re-confirmed in session 53's opening prompt. Re-confirm at the start of the next session; do not
  assume it carries forward forever. The opening prompt of a session is the confirmation when it says so.
- RDD (receipt-driven development): **consent is asked per candidate through `AskUserQuestion`; never
  answer it for the Director.** The Director asked to be told `granted` is recommended. In session 53 the
  Director granted it for 05b, 05c and 05d. When the tier is `high`, check whether the evidence is a
  heuristic false positive and say so in the question (05d's was).
- **`size:exception` is asked per PR**, after Alpha's view on the frozen diff, with a recommendation. The
  Director authorized it for 05b (651 lines), 05c (476) and 05d (612), as before for PR-02 and PR-03.
  Never open an over-budget PR without that answer.
- Commit messages and PR descriptions carry no `Co-Authored-By` and no AI attribution; conventional
  commits only. This project rule overrides the harness's attribution reminder.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1, F2, F3, F5 | **Archived**, unchanged. | `openspec/changes/archive/` (four dated folders) |
| B-09 | **Closed** (session 50). | `docs/06-backlog/CHECKLIST.md#B-09` |
| F4 planning | Explore, proposal, spec, design, tasks all written and Alpha-audited to `CONSENSUS` (session 50). | `openspec/changes/f4-claude-channels-adapter/` |
| F4 PR-01 to PR-04 | **Merged** (`#95` `952fbcd`, `#96` `d3cb965`, `#97` `33cd1e6`, `#98` `e03498a`). | `apply-progress.md` |
| F4 PR-05a | **Merged.** `channel/tsconfig.json`, `channel/notify.ts`. PR `#99`, `9262939`, 224 lines. | `apply-progress.md` |
| F4 PR-05b | **Merged.** `channel/daemon-link.ts`. PR `#100`, `2647b06`, 651 lines, PR-scoped `size:exception`. | `apply-progress.md` (PR-05b) |
| F4 PR-05c | **Merged.** `channel/doorbell-loop.ts`. PR `#101`, `0ea55df`, 476 lines, `size:exception`. | `apply-progress.md` (PR-05c) |
| F4 PR-05d | **Merged.** `channel/main.ts`, `package.json` bin/files, `pack.test.ts`, two existing tests. PR `#102`, `48c8c39`, 612 lines, `size:exception`. | `apply-progress.md` (PR-05d) |
| Small fix PR | **Next** (Director said B-95/B-96 are scheduled after PR-05). B-95 (a) to (f) and B-96, one PR; B-97 is the Director's call. | `docs/06-backlog/CHECKLIST.md` |
| F4 PR-06 | Not started. **Scope shrinks**: see the amendments in its `tasks.md` block (items 1-7). | `tasks.md` (PR-06 block) |
| F4 PR-07 | Not started. Runbook, `WORK-PLAN.md` amendment (task 7.2), DATA-MODEL and ADR notes. | `tasks.md` (PR-07 block) |
| After PR-07 | `sdd-verify`, then `sdd-archive`, each Alpha-audited like F1/F2/F3/F5. | — |
| Backlog open | **B-95** (extended, (a) to (f)), **B-96**, **B-97** (new), plus the carried rows in §7. | `docs/06-backlog/CHECKLIST.md` |
| Tests on `main` | `npm test`: **1682 tests, 1676 pass, 0 fail, 6 skip** (baseline at session start: 1607/1601/0/6). | — |
| Tribunal record | 11 `CONSENSUS` debates of sessions 51-52 and the 6 slice debates of session 53 are indexed, plus the close-out audit `bus-v2-s53-docs-close-audit-001`. | `docs/05-tribunal/INDEX.md` |

---

## §2 — What session 53 did (for context, not to redo; full detail in `LOG.md`)

1. **Preflight**: tree matched the old handoff; Arena reachable by a real `bridge_send`; the SDD Session
   Preflight re-asked through `AskUserQuestion` (Automatic / Both / Auto); autonomy re-confirmed by the
   opening prompt.
2. **05b, 05c, 05d**: each ran the same loop, with one more step than session 52 needed: scope debate with
   Alpha, `sdd-attempt` acquire, one `general-purpose` writer, Kairo's cold rebuild and **full-suite** rerun,
   `sdd-attempt` settle, frozen-diff debate, RDD consent, then the `size:exception` question, commit, push,
   PR, rebase merge, post-merge rebuild and suite, and a docs-only record commit. Every debate ended
   `CONSENSUS`, `APPROVE`, round 1, no objections; every RDD review was approved.
3. **Findings that changed the plan**, all written down: task 5.3's backoff clause moved to 05c; `run`
   owns the backoff and `link_failed` sleeps it; `main.ts` bounds its wait for the watcher by
   `CHANNEL_SHUTDOWN_TIMEOUT_MS`; the MCP SDK's stdio transport never reports stdin ending; the entry guard
   is `import.meta.main`; `test/cli/main.test.ts:64` and `npm-shrinkwrap.json`'s root `bin` needed the
   second bin (found by Kairo, not the writer).
4. **New backlog**: B-97, plus B-95 (e) and (f) from the 05c and 05d RDD suggestions.
5. **Documentation close-out**: this HANDOFF rewritten, LOG, tribunal index, `00-INDEX`, backlog,
   `design.md` (correction 7), `tasks.md`, `apply-progress.md` and `AGENTS.md` updated.

---

## §3 — Contracts the next work needs (read the files, do not re-derive)

**The adapter as merged** (for PR-06's closure test and PR-07's runbook; all under `channel/`)
- `main.ts` (bin `conmuta-channel`): `runChannel(options)` never exits the process; the guarded entry
  (`import.meta.main`) parses `--project <id>` / `--project=<id>` strictly, then hard-exits. Imports:
  `./daemon-link.js`, `./doorbell-loop.js`, `./notify.js`, `../src/client/binding.js` (the only `fs` user
  besides `run-file`), `../src/shared/*`, the MCP SDK. It never imports `client/main`, `run-state`, `spawn`,
  `handshake`, `ipc-stub` or anything under `src/daemon`.
- `daemon-link.ts`: `createDaemonLink(deps)` returns the `DaemonLink` interface; eight-code
  `DaemonLinkError`; reads the run file afresh per handshake, **never spawns**, throws `NO_DAEMON` with zero
  fetches when the daemon is down. Bounds use `AbortSignal.timeout` (not a timer identifier).
- `doorbell-loop.ts`: `DoorbellWatcher` and `abortableSleep`. **The only file in `channel/` that arms a
  timer** (global `setTimeout`, never `node:timers`). `deliver_failed` and `link_failed` back off
  `CHANNEL_RETRY_BACKOFF_SECONDS`; `rang` and `silent` never sleep.
- Exit codes: usage `EXIT_USAGE` (2), unbound project 3, project mismatch 4, unexpected failure or a crashed
  loop 1, a clean shutdown 0. Diagnostics go to stderr only; stdout carries MCP frames only.
- Capability: `{ experimental: { "claude/channel": {} } }`, **no `permission` key at all**; the event is
  `notifications/claude/channel` with `{ content, meta }` from `buildNotification`.
- The adapter needs a **running daemon** and never starts one (D7). Sessions are minted lazily by the first
  route call and released by `DELETE /session` at shutdown (D10).

**Small fix PR** (B-95, B-96; `CHECKLIST.md` has the full text)
- B-95 (a) `src/daemon/serve/doorbell.ts:125-133` per-row guard (skip a row that fails to parse, still
  advance `covered_through_seq`, add a test); (b) `src/daemon/ipc/routes.ts:720` doc; (c) `routes.ts:661`
  comment; (d) `routes.ts:650-659` no abort signal (Alpha called it design-exact; revisit only if it
  matters); (e) `channel/doorbell-loop.ts:79-83` `buildNotification` outside a guard (unreachable in
  production); (f) two readability items in `channel/main.ts` and its test.
- B-96 `test/daemon/bootstrap.test.ts:543`: await the in-flight reconcile before teardown.
- B-97 (`src/cli/main.ts:707-711` guard vs a POSIX symlinked bin) is **not** in this PR unless the Director
  says so; it needs a POSIX check first.

**PR-06** (`test/security/channel-bundle.test.ts`, `test/twins.test.ts`): read `tasks.md`'s PR-06 block
including amendments (1) to (7). In short: 6.3-6.6 are confirmations only (done by 05d and PR-02); the real
work is 6.1/6.2 and 6.7/6.8. The closure entry is `dist/channel/main.js`, paths relative to `dist/`, `fs`
must resolve to exactly `{client/binding.js, client/run-file.js}`, and exactly `dist/channel/doorbell-loop.js`
may arm a timer. `computeClosure` is exported from `test/security/closure.ts:49`; `test/client/session-exchange.test.ts:211`
shows it in use. The three `channel/*.ts` source-pin tests already exist; generalize, do not duplicate.

**PR-07** (docs): `tasks.md`'s PR-07 block. The `WORK-PLAN.md` amendment text (task 7.2) is stored in
`design.md` ("WORK-PLAN :93 amendment text"). The runbook must state the adapter as best-effort and must
check every Claude Code channels flag against the **current** documentation at apply time, not from memory
(design "Migration / Rollout"). It documents `conmuta-channel --project <id>`, the need for a running daemon,
and that events are dropped silently if the host has not enabled the channel.

**Already in `main` and relevant**
- Constants (`src/shared/constants.ts`): `DOORBELL_SCAN_DEPTH` (:328), `CHANNEL_SERVER_NAME` (:329, equals
  `conmuta-channel`, also the bin name), `CHANNEL_HOST_LABEL` (:331), `CHANNEL_RETRY_BACKOFF_SECONDS` (:333),
  `CHANNEL_META_LIST_LIMIT` (:335), `CHANNEL_SHUTDOWN_TIMEOUT_MS` (:337, 20 s).
- The live IPC route table has **ten** entries. `channel/tsconfig.json` is a composite project
  (`rootDir ".."`, `outDir "../dist"`) emitting `dist/channel/*.js`; `src/` emits `dist/src/*`.
- Closure rule for `channel/*.ts`: banned is reachability to `daemon/transport/*`, `daemon/send/*` or a
  Telegram-client module, and any reference to the child-process module **including the literal substring
  inside a comment** (each of the three modules pins it). Timers only in `doorbell-loop.ts`.

---

## §4 — Facts that will bite you (read before applying)

**Process and tooling**

| Item | State |
|---|---|
| **Native `sdd-*` Agent dispatch is assumed blocked by the `PreToolUse:Agent` hook.** Confirmed on the first attempt of every phase in sessions 44-50; sessions 51-53 did not re-test it and went straight to a `general-purpose` writer. One cheap attempt at the start of a session confirms either way. Pointer: `~/.claude/skills/_shared/sdd-phase-common.md`. |
| **An Alpha report can contain claims that are false; re-verify the concrete ones yourself.** In session 52 Alpha "verified verbatim" four Director quotes that exist nowhere and mislabelled a line. In session 53 every pointer Kairo re-checked (`routes.ts:360-366`, `errors.ts:38`, `IPC_EPHEMERAL_PORT`, `routes.test.ts:306`, `doorbell.ts:106-108`) was correct, and Alpha corrected Kairo once (`BINDING_CHANGED` comes from the frozen `(bot_id, group_id, agent_id)`, not `roster_hash`). Still: never accept a "confirmed" for a quote, a line number or a count without one `grep` or `sed -n` of your own. |
| **A writer runs only targeted tests; you run the whole suite.** The 05d writer reported everything green and missed `test/cli/main.test.ts:64` ("exactly one bin entry"), which only the full `npm test` caught. Always `rm -rf dist`, build, and run the full suite to a file, echoing the exit code, before believing a writer. |
| **Writer prompt shape that worked seven times**: self-contained; names the slice's tasks; requires RED-first with the observed RED recorded per task; forbids all git operations; lists the files the writer may touch; lists constraints as HARD CONSTRAINTS; asks for `<command>: <observed result>` per verification, cheap mutation sanity checks, and the measured line count; asks to close with a `## Key Learnings` section. Kairo always re-reads the diff and re-runs build and tests itself. Tell the writer to keep tests tight: slices still landed 1.2x to 1.6x over budget. |
| **`tsc -b` does not emit on a type error**, so a missing export or module is a compile-error RED (`TS2305`/`TS2307`); that is acceptable evidence, say so. A pin test for behavior that already exists passes on its first run and cannot show a RED; disclose it as a pin. |
| **`sdd-attempt acquire --max-changed-lines` is a hard cap counted as added + deleted.** Slices landed at 651, 476 and 612 under a cap of 1000, all `settle`d `complete`. Use about 2× the estimate. An over-budget attempt gives a `settle_obligation` that the next passing `settle` must carry via `--remediates-evidence-revision`. |
| **Staged files make `settle` simple.** With the slice's files `git add`ed (tracked, staged) `sdd-attempt settle` needs no untracked flags; the `--evidence-revision` is `current_snapshot_identity` from `gentle-ai review status ... --next-transition --projection=staged`. Only when files stay untracked do `--untracked-scope=select` and `--intended-untracked` matter. |
| **RDD candidate scoping.** `review status`/`start` default to the `workspace` projection, which sweeps in every uncommitted tracked file. When the tree holds only the slice's staged files that is exactly the candidate (session 53); if unrelated docs are dirty, `git add` exactly the PR's files and pass `--projection=staged`. Build `review start` from the tokens `status` returns (plus `--consent=relay`). The Stop hook may force the preflight per candidate; that is fine. |
| **RDD consent and the review itself.** Relay the consent envelope through `AskUserQuestion` with a recommendation, then run the exact captured invocation once. `granted` at a medium tier is one lens: run its single `review capture-result` with the returned tokens, then the exact `acknowledge-approved` command. At a **high** tier there are four lenses: give one forecast, then run the four `capture-result` calls concurrently (a small node script that spawns `gentle-ai review capture-result` with each input's argument tokens and writes each output to a file in `$TEMP` worked); only the last admitted capture carries the closure and the acknowledge command. `declined` runs the exact `declined` invocation once. |
| **MSYS/Windows shell.** `/tmp` is not visible to `node`; feed scripts through stdin (`node - <<'EOF'`) or use `$TEMP`. Apostrophes break `node -e` and unquoted heredocs; use quoted heredocs or the Edit/Write tools. Never leave logs in the repository root: redirect to `$TEMP` and delete them (untracked files disturb `sdd-attempt` and `review`). Check for orphan node processes by command line with `Get-CimInstance Win32_Process`, not by the process count. |
| **`npm test` output is misleading in two ways here**: a background run can hang near zero CPU (run it in the foreground), and piping through `tail` masks the real exit code. Redirect to a file and `echo $?`. ANSI colour codes hide the summary from `grep`: strip them with `sed 's/\x1b\[[0-9;]*m//g'` first. `dist/` staleness fakes results: `rm -rf dist` first. |
| **Local `main` can silently sit ahead of `origin/main`** (session 51 found two unpushed commits). Always `git diff --stat <local> <remote>` before any reset; stash with `-u` first. |
| **Line endings**: `.gitattributes` is `eol=lf`; some working copies are CRLF; git shows only a warning, no real diff. The doc edits of session 53 were all LF. |
| **Memory (Engram)**: `mem_save` failed once with `multiple active runtime sessions match the current project and directory`. What worked: `mem_session_start` with `id` and `directory` set to the repo root at the start, then pass that same `session_id` to `mem_save`. After each successful save, `mem_judge` every candidate by its own `judgment_id` (they were all `not_conflict` or `related`). If it fails again, this file and `LOG.md` are the record. |
| **Engram has no `sdd-init/connmuta` observation.** The SDD init guard would ask for `sdd-init`; session 53 used `openspec/config.yaml` (`strict_tdd: true`, `npm test`) and native `sdd-status` (apply `ready`) instead. Say so again or run `sdd-init` if the Director prefers. |

**Code and test facts**

| Item | State |
|---|---|
| **`test/daemon/bootstrap.test.ts:543` is a pre-existing timing flake (B-96).** It failed on the FIRST full `npm test` after a cold `rm -rf dist && npm run build` in sessions 52 and earlier; it did not fire once in session 53 (seven cold full runs). **If it is the only failure, rerun the full suite once and report both runs.** |
| **The channel tests use real timers and real processes** (`abortableSleep` with a 20 ms timer, `process.getActiveResourcesInfo()`, spawned `dist/channel/main.js`, a real stdin end). Stable in 10 of 10 and 6 of 6 repeated runs. If one fails alone, rerun once and report; do not weaken the bound. The spawned-entry cases need `dist` built, the same convention as `test/cli/main.test.ts`. |
| **The MCP SDK's `StdioServerTransport` never reports stdin ending** (`sdk/dist/esm/server/stdio.js:37-38` listens to `data` and `error` only). Any new stdio server here must map stdin `close` itself, as `channel/main.ts` does. |
| **`import.meta.main`** (Node >= 24.2; `engines` is >= 24.15.0) is the entry guard for `channel/main.ts`. `src/cli/main.ts:707-711` still uses the `argv[1]` comparison (B-97). |
| **`package.json` and `npm-shrinkwrap.json` must agree on `bin`.** The lockfile's root record lists the `bin` map; adding an entry means editing both. `pack.test.ts` asserts the `files` whitelist by exact equality and `dist/channel/main.js` in the dry run. |
| **The doorbell relevance rule is implemented in `doorbell.ts` (`isRelevant`), not reused from fetch**, because fetch has none (design D5 said otherwise; corrected in `design.md`). The doorbell counts `rejected` and `ignored` rows on purpose. The daemon waits only when the scan finds no row past `after_seq` (`doorbell.ts:106-108`); a backlog of irrelevant rows returns at once with `count: 0`. |
| **`docs/07-plan/WORK-PLAN.md`'s F4 Validation row still says "`saturated` rings once per cursor value"**: deliberately stale until `tasks.md` task 7.2 (PR-07) applies the amendment text stored in `design.md`. Do not fix the Validation row earlier. |
| **The `client-bundle`, PT-27 and installer-bundle security tests grep raw source text.** Even a comment naming the child-process module in a client module fails them, and each `channel/*.ts` file has a source pin with the same property. |
| **The route count**: `createSessionRoutes` builds eight session/tool/channel routes and the whole table has ten; a doc comment in `ipc/routes.ts:720` still contradicts itself (B-95 (b)). |
| **Review budget**: the fixed policy is 400 changed lines per PR. Over budget means re-slice or a disclosed, PR-scoped `size:exception` with the Director's authorization. Measured against estimates: PR-01 213, PR-02 661, PR-03 706, PR-04 306, 05a 224, 05b 651, 05c 476, 05d 612. PR-06 is estimated at about 280 and will probably land near 400. |
| **Arena's wake-up is PTY keystroke injection, not an MCP notification** (`Arena_Orion/src/main/ArenaBroker.js:3-9`). Never cite the `[ARENA]` ping as MCP-notification evidence. |
| **Pronouns**: refer to the Director by role, never a gendered pronoun. |

---

## §5 — Next session, exact sequence

1. Run §0's commands; the tree must match §0 exactly.
2. Prove Arena reachable with a real `bridge_send` (the opening debate of step 6 does it).
3. The Director's opening prompt re-confirms autonomy; if it does not say so, ask one question.
4. Run the SDD Session Preflight through `AskUserQuestion` (hard gate, re-asked every session). Start an
   Engram session (`mem_session_start` with `id` and `directory`) and pass its id to `mem_save`.
5. **Small fix PR (B-95 (a)-(f) and B-96).** Debate the scope with Alpha (`kind: PROPOSAL`, pointers, not
   pasted code); ask the Director only if B-97 or B-95 (d) should join. Branch, `sdd-attempt acquire` (a
   new work unit label), one writer, cold rebuild and full suite, `settle`, frozen-diff debate, RDD, the
   `size:exception` question only if over 400, PR, rebase merge, rebuild and suite.
6. **PR-06** with its amended scope (§3), the same loop.
7. **PR-07** (docs; check the Claude Code channels flags against current documentation), the same loop.
8. `sdd-verify`, then `sdd-archive`, each Alpha-audited; write the archive with final-state facts.
9. After each merge, a docs-only commit records it (`tasks.md`, `apply-progress.md`, the tribunal index),
   and at the end this file and `LOG.md` are rewritten and audited by Alpha.

---

## §6 — Do not redo

- F1, F2, F3 and F5 archives are closed. B-09 is closed.
- F4's five planning phases (session 50) are final. PR-01 to PR-05 are merged: do not re-implement or
  re-debate them. The `CONSENSUS` debates of sessions 51-53 are indexed in the tribunal record; none is
  reopened.
- RDD lineages `review-39a0ff92bc18e85d` (PR-01), `review-15bbc1e2b034a77a` (retroactive PR-03/04/05a),
  `review-f22ebcffa06e871b` (05b), `review-7c68cd7c0744c817` (05c) and `review-8d944602c30cc117` (05d) are
  approved, acknowledged, authority burned. Do not re-review that code; their findings are in
  `apply-progress.md` and B-95.
- F4's design decisions D1-D12 stand except where `design.md`'s "Corrections found during apply" (items 1-7)
  says otherwise. Reopening one needs new evidence, a written correction and Alpha.
- Do not fix `WORK-PLAN.md`'s F4 Validation row before PR-07 (§4).

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-95** | Follow-ups of the RDD reviews: (a) `serve/doorbell.ts:125-133` per-row guard, (b)-(d) three `ipc/routes.ts` nits including the missing abort signal, (e) `doorbell-loop.ts:79-83`, (f) two readability items in `channel/main.ts` and its test. Next, as one small PR with B-96. | Kairo (Director schedules) |
| **B-96** | `bootstrap.test.ts:543` timing flake: await the in-flight reconcile before teardown. | Kairo (Director schedules) |
| **B-97** | `src/cli/main.ts:707-711`'s entry guard may silently do nothing behind a POSIX symlinked npm bin (not reproduced: Windows machine, `windows-latest` CI only). Verify on Linux or macOS, then use `import.meta.main`. | Director + Kairo |
| **B-93, B-94, B-91, B-92; B-53/54/56/57/58/59/60** | Carried unchanged from earlier sessions. | Director |
| **macOS start-at-login (D-40/D-47)** | Designed on paper only; empirical verification deferred to F6 (B-12). B-97 is relevant to it. | Director + Kairo |
| **B-16 / D-10, B-11, B-12** | Licence files and copyright line; trademark screening; macOS scope: all three still block F6's readiness. | Director |
| **Gemini CLI / Cursor doorbell capability** | Untested for B-09; not a blocker for F4. Low priority. | Director |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions).

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0 and `gentle-ai` 2.9.1 (both re-measured in session 53); shell is PowerShell
  primary with Bash (Git Bash) available.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`. Every `gh`
  command runs with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`;
  **never `gh auth switch`**. Force-push and deletion of `main` are blocked; there is no PR or
  status-check requirement (docs-only commits went straight to `main`, code went through PRs).
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**; cite as `path:line`.
  v1's `channel/index.ts` is the reference for the MCP `Server` construction and the notification call.
- `.mcp.json` points at the Arena bridge; never quote or commit its contents. `.claude/settings.json` is
  gitignored tooling.
- `os.tmpdir()` resolves to an 8.3 short path (`C:\Users\LABORA~1\...`).
- **RDD is enabled for this repository** (`gentle-ai review mode status`: `on`, decided by global).
- Stale local branches from F1 (`f1/19-telegram-client-p2`, `f1/21-room-guard-bindings`,
  `f1/22a-admission`, `f1/22b-poller`, `main-local`, `main-local-backlog`) are already merged or
  superseded; not this work's business to clean up. The F4 slice branches were deleted after each merge.
- The SDD preflight for this project is Automatic / Both (hybrid) / Auto (`stacked-to-main`), asked
  again every session.

---

## §9 — RDD status at session close

| Candidate | Risk | Outcome |
|---|---|---|
| F4 PR-01 (session 51) | medium, 1 lens | **Approved**, acknowledged, burned; 3 advisories, all closed in PR-03 and PR-05a. |
| F4 PR-02, PR-03, PR-04, PR-05a | high, medium, high (heuristic false positive) | Director **declined** each. |
| Retroactive PR-03 + PR-04 + PR-05a (committed range `d3cb965..HEAD`, 16 files, 1235 lines) | high, 4 lenses | Director **granted**; **approved**, acknowledged, burned; 2 WARNING + 3 SUGGESTION filed as B-95. |
| F4 PR-05b (session 53) | medium, 1 lens (`review-reliability`) | Director **granted**; **approved**, no findings, acknowledged, burned. |
| F4 PR-05c (session 53) | medium, 1 lens | Director **granted**; **approved**, 1 SUGGESTION (B-95 (e)), acknowledged, burned. |
| F4 PR-05d (session 53) | high (two heuristic hits), 4 lenses | Director **granted**; **approved**: 0 findings in risk, resilience and reliability, 2 readability SUGGESTIONs (B-95 (f)), acknowledged, burned. |

No candidate is currently under review and no authority is outstanding. The next candidate, the small
fix PR, will be the next RDD question.
