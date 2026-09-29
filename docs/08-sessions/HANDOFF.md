# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
>
> **Reading order for a zero-context session:** §0 → §1 → §5. Then §3 (contracts the next slices
> need), §4 (traps), §6 (do not redo), §7 (open points) as the task needs, and §8 for the environment.
>
> **Last rewritten: end of session 54** (2026-09-28). Everything below describes the state after it.

---

## §0 — Quick start

**F1, F2, F3 and F5 are archived and untouched. F4 (`f4-claude-channels-adapter`) is the one open SDD
change, in `sdd-apply`; PR-01 to PR-06 and the B-95/B-96 follow-up PR are merged.** Merged to `main` so far:
PR-01 (`#95`), PR-02 (`#96`), PR-03 (`#97`), PR-04 (`#98`), PR-05's four slices (`#99`-`#102`), the follow-up
PR 05e (`#103`, tip `b99d66b`) and PR-06 (`#104`, tip `cdd63ca`, the last code commit). Docs-only commits
(the close-out `7ce0ae2` and the ones after it) sit on top of it (see `git log`), and `main` equals
`origin/main`. **Not started: PR-07 (docs), then
`sdd-verify` and `sdd-archive`.**

**Copy-paste prompt to start the next session** (kept to 3 lines per the Director's instruction):

```text
F4 PR-06 completo (PRs #95-#104 mergeados) — lee docs/08-sessions/HANDOFF.md, confirma Arena (DN-09) y mi autonomía total con Alpha como juez.
Arranca sdd-apply PR-07 (docs; verifica los flags de Claude Code channels contra la documentación vigente) y después sdd-verify y sdd-archive; pide RDD por candidato y recomiéndame granted.
Árbol limpio esperado (docs de la sesión 54 ya commiteadas); B-97, B-98, B-99 y B-100 los decido yo.
```

**First commands, in order** (stop and report if any disagrees):

```bash
git branch --show-current && git pull --ff-only     # must be main, up to date
git log --oneline -3 origin/main                     # cdd63ca (PR-06) is the last code commit; docs-only commits are on top; must equal local HEAD
rm -rf dist                                          # a stale dist/ silently fakes results
ls openspec/changes/                                 # archive/ and f4-claude-channels-adapter/
git status --short                                   # must print nothing
```

**Expected working tree: clean.** The docs of session 54 (`AGENTS.md`, `docs/00-INDEX.md`,
`docs/05-tribunal/INDEX.md`, `docs/06-backlog/CHECKLIST.md`, `docs/08-sessions/HANDOFF.md`,
`docs/08-sessions/LOG.md`) and the F4 artifacts under `openspec/changes/f4-claude-channels-adapter/`
(`tasks.md`, `apply-progress.md`) were committed as docs-only commits on the Director's standing
authorization: `8c20646` right after #103 landed, and the commits on top of `cdd63ca` from `7ce0ae2` on. If `git status`
shows anything, stop and report before assuming it is safe.

**Arena reachability (DN-09).** Check it live with a real `bridge_send`, never `curl`. A successful send
is enough; do not wait for Alpha's reply just to clear this gate. Session 54 had Arena reachable throughout
(4 slice debates, all `CONSENSUS`, plus the documentation close-out audit).

**Alpha ran out of token quota at the close of session 54** (the Director said so after the close-out audit had
been answered; no debate was pending). The next session must not assume Alpha will answer: a successful
`bridge_send` does not prove it. GOVERNANCE §3 accepts an audit by Alpha **or Betelgeuse**, so the cleanest path
is for the Director to seat Betelgeuse in the right panel when opening the Arena (the system prompt then names
the collaborator; send envelopes to that name only). Only if the Arena does not respond at all does the
Judgment Day substitute apply (two blind `jd-judge-a` / `jd-judge-b` subagents plus a verifier; DN-05 stays
formally unsatisfied and is disclosed in each PR's tribunal record). Ask the Director which applies before
starting; do not choose silently.

**Standing instructions from the Director, and how to treat them.**
- Full autonomy with Alpha as judge (including commit, push, PR and merge once Alpha and RDD have signed
  off) was re-confirmed in session 54's opening prompt. Re-confirm at the start of the next session; do not
  assume it carries forward forever. The opening prompt of a session is the confirmation when it says so.
- RDD (receipt-driven development): **consent is asked per candidate through `AskUserQuestion`; never
  answer it for the Director.** The Director asked to be told `granted` is recommended. In session 54 the
  Director granted it for the follow-up PR and **declined** it for PR-06 (both were `high` from heuristic hits,
  and the question said so): do not presume either answer. When the tier is `high`, check whether the evidence
  is a heuristic false positive and say so in the question. A decline runs the exact `declined` invocation once
  and creates no record; a later STATUS still says `start` for that target, which is expected.
- **`size:exception` is asked per PR**, after Alpha's view on the frozen diff, with a recommendation. None
  was needed in session 54 (193 and 360 lines). Never open an over-budget PR without that answer.
- Commit messages and PR descriptions carry no `Co-Authored-By` and no AI attribution; conventional
  commits only. This project rule overrides the harness's attribution reminder. Commit by work unit (tests
  with the code they verify, one purpose each): #103 landed as five commits and #104 as two.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1, F2, F3, F5 | **Archived**, unchanged. | `openspec/changes/archive/` (four dated folders) |
| B-09 | **Closed** (session 50). | `docs/06-backlog/CHECKLIST.md#B-09` |
| F4 planning | Explore, proposal, spec, design, tasks all written and Alpha-audited to `CONSENSUS` (session 50). | `openspec/changes/f4-claude-channels-adapter/` |
| F4 PR-01 to PR-04 | **Merged** (`#95` `952fbcd`, `#96` `d3cb965`, `#97` `33cd1e6`, `#98` `e03498a`). | `apply-progress.md` |
| F4 PR-05a to 05d | **Merged** (`#99` `9262939`, `#100` `2647b06`, `#101` `0ea55df`, `#102` `48c8c39`). PR-05 is complete. | `apply-progress.md` |
| Follow-up PR 05e | **Merged.** B-95 (a)(b)(c)(e)(f) and B-96. PR `#103`, tip `b99d66b` of five work-unit commits, 193 lines, no `size:exception`. | `apply-progress.md` ("Follow-up PR 05e") |
| F4 PR-06 | **Merged.** `test/security/channel-bundle.test.ts` and the `channel/` twin gate. PR `#104`, tip `cdd63ca` of two work-unit commits, 360 lines, applied by the native `sdd-apply` agent. | `apply-progress.md` ("PR-06") |
| F4 PR-07 | **Next.** Runbook, `WORK-PLAN.md` amendment (task 7.2), DATA-MODEL and ADR notes. | `tasks.md` (PR-07 block) |
| After PR-07 | `sdd-verify`, then `sdd-archive`, each Alpha-audited like F1/F2/F3/F5. | — |
| Backlog open | **B-95** remainder ((d), the `fetch.ts` parse, three notes), **B-97**, **B-98**, **B-99**, **B-100**, plus the carried rows in §7. B-96 is closed. | `docs/06-backlog/CHECKLIST.md` |
| Tests on `main` | `npm test`: **1713 tests, 1707 pass, 0 fail, 6 skip** (baseline at session start: 1682/1676/0/6). | — |
| Tribunal record | The 4 debates of session 54 and everything before are indexed, plus the close-out audit `bus-v2-s54-docs-close-audit-001`. | `docs/05-tribunal/INDEX.md` |

---

## §2 — What session 54 did (for context, not to redo; full detail in `LOG.md`)

1. **Preflight**: tree matched the old handoff; Arena reachable by a real `bridge_send`; the SDD Session
   Preflight re-asked through `AskUserQuestion` (Automatic / Both / Auto); autonomy re-confirmed by the
   opening prompt; cold baseline 1682/1676/0/6.
2. **Follow-up PR 05e (#103)**: scope debate with Alpha, `sdd-attempt` acquire, one `general-purpose`
   writer, Kairo's cold rebuild and full-suite run, `settle`, frozen-diff debate, RDD (granted, four lenses,
   approved), five work-unit commits, PR, rebase merge, post-merge rebuild and suite. The doorbell scan now
   skips an unreadable stored row; the B-96 flake is fixed test-only.
3. **PR-06 (#104)**: the scope debate ran in parallel with the 05e writer; then the **native `sdd-apply`
   agent** (not blocked), resumed once to follow `design.md:198`; cold suite, `settle`, frozen-diff debate,
   RDD declined by the Director, two commits, PR, waited for CI, rebase merge, post-merge suite.
4. **Findings that changed the plan**, all written down: B-96's root cause is a production gap (`stop()`
   never awaits a tick in flight, B-98); PR-06's debate missed `design.md:198` (no `daemon/` path at all, plus
   `node:sqlite` and keyring), so the test follows the design; `hasFsModuleReference` misses four import forms
   and `computeClosure` skips bare specifiers (B-100); three timer-based tests fail under CPU contention (B-99).
5. **Documentation close-out**: this HANDOFF rewritten, LOG, tribunal index, `00-INDEX`, backlog, `tasks.md`
   (amendment (14) and the task marks), `apply-progress.md` and `AGENTS.md` updated.

---

## §3 — Contracts the next work needs (read the files, do not re-derive)

**The adapter as merged** (for PR-07's runbook; all under `channel/`)
- `main.ts` (bin `conmuta-channel`): `runChannel(options)` never exits the process; the guarded entry
  (`import.meta.main`) parses `--project <id>` / `--project=<id>` strictly, then hard-exits. Imports:
  `./daemon-link.js`, `./doorbell-loop.js`, `./notify.js`, `../src/client/binding.js` (the only `fs` user
  besides `run-file`), `../src/shared/*`, the MCP SDK. It never imports `client/main`, `run-state`, `spawn`,
  `handshake`, `ipc-stub` or anything under `src/daemon`. The shutdown bound is the named local
  `watcherStopBound` (an `AbortSignal.timeout`, evaluated right before the race).
- `daemon-link.ts`: `createDaemonLink(deps)` returns the `DaemonLink` interface; eight-code
  `DaemonLinkError`; reads the run file afresh per handshake, **never spawns**, throws `NO_DAEMON` with zero
  fetches when the daemon is down. Bounds use `AbortSignal.timeout` (not a timer identifier).
- `doorbell-loop.ts`: `DoorbellWatcher` and `abortableSleep`. **The only file in `channel/` that arms a
  timer** (global `setTimeout`, never `node:timers`). `deliver_failed` and `link_failed` back off
  `CHANNEL_RETRY_BACKOFF_SECONDS`; `rang` and `silent` never sleep. A throw from `buildNotification` is
  deliberately not caught (fail-fast: `run` ends and `main.ts` exits 1), documented on `tick` and pinned by a test.
- Exit codes: usage `EXIT_USAGE` (2), unbound project 3, project mismatch 4, unexpected failure or a crashed
  loop 1, a clean shutdown 0. Diagnostics go to stderr only; stdout carries MCP frames only.
- Capability: `{ experimental: { "claude/channel": {} } }`, **no `permission` key at all**; the event is
  `notifications/claude/channel` with `{ content, meta }` from `buildNotification`.
- The adapter needs a **running daemon** and never starts one (D7). Sessions are minted lazily by the first
  route call and released by `DELETE /session` at shutdown (D10).

**PR-07** (docs): `tasks.md`'s PR-07 block. The `WORK-PLAN.md` amendment text (task 7.2) is stored in
`design.md` ("WORK-PLAN :93 amendment text"). The runbook must state the adapter as best-effort and must
check every Claude Code channels flag against the **current** documentation at apply time (fetch it; do not
work from memory: design "Migration / Rollout"). It documents `conmuta-channel --project <id>`, the need for a
running daemon, and that events are dropped silently if the host has not enabled the channel.

**For `sdd-verify`**: the spec is `openspec/changes/f4-claude-channels-adapter/specs/channel-doorbell/spec.md`;
`design.md`'s Testing Strategy table (rows around 190-201) maps each guarantee to its test. Read those rows
before judging coverage: they can be stricter than the spec (session 54's PR-06 scope debate missed
`design.md:198`). Two things landed after `apply-progress.md`'s earlier snapshots and belong in the archive's
final-state facts: the follow-up PR `#103` and PR-06 `#104`.

**The bundle-closure test as merged** (`test/security/channel-bundle.test.ts`, the model for future closure tests)
- Entry `dist/channel/main.js`, paths relative to `dist/` (so the `fs` allow-list reads `src/client/binding.js`
  and `src/client/run-file.js`). The closure is 16 files; nothing under `src/daemon/`, `fs` only in those two
  client modules, a timer only in `channel/doorbell-loop.js`.
- A `RULES` table of 10 rules, each with seeds that must trip exactly that rule (a loop generates one test per
  rule), one `findViolations(Map<path, source>)` helper judged on the real bundle and on synthetic maps,
  seeded positives for the allow-listed modules, and a two-hop temp-dir fixture. To add a guarantee, add a
  rule with seeds. `fs`, `node:sqlite` and keyring use quote-anchored local regexes; the shared
  `hasFsModuleReference` is not used (B-100). `test/twins.test.ts` also walks `channel/**` against `test/channel/`.

**Already in `main` and relevant**
- Constants (`src/shared/constants.ts`): `DOORBELL_SCAN_DEPTH` (:328), `CHANNEL_SERVER_NAME` (:329, equals
  `conmuta-channel`, also the bin name), `CHANNEL_HOST_LABEL` (:331), `CHANNEL_RETRY_BACKOFF_SECONDS` (:333),
  `CHANNEL_META_LIST_LIMIT` (:335), `CHANNEL_SHUTDOWN_TIMEOUT_MS` (:337, 20 s).
- The live IPC route table has **ten** entries (`createSessionRoutes` builds eight of them). `channel/tsconfig.json`
  is a composite project (`rootDir ".."`, `outDir "../dist"`) emitting `dist/channel/*.js`; `src/` emits `dist/src/*`.
- Closure rule for `channel/*.ts`: banned is reachability to anything under `src/daemon/` and any reference to the
  child-process module **including the literal substring inside a comment** (each of the three modules pins it).
  Timers only in `doorbell-loop.ts`.

---

## §4 — Facts that will bite you (read before applying)

**Process and tooling**

| Item | State |
|---|---|
| **Native `sdd-*` Agent dispatch worked in session 54** (`sdd-apply`, model `sonnet`, no block). Sessions 44-50 saw the `PreToolUse:Agent` hook block it; sessions 51-53 did not test it. The parent runs `sdd-attempt acquire` and passes the token; the agent must not `settle`. It normally edits `tasks.md` and `apply-progress.md`: the brief forbade that so the RDD candidate stayed code-only, and it reported its progress instead. If a dispatch is blocked, fall back to a `general-purpose` writer with the same brief. Pointer: `~/.claude/skills/_shared/sdd-phase-common.md`. |
| **An Alpha report can contain false claims; re-verify the concrete ones yourself.** Session 52: Alpha "verified verbatim" four Director quotes that exist nowhere. Session 54: Alpha called `hasAutonomousTimerReference` an AST pin (it is a regex) and asserted a "<3ms" timing nobody measured; every pointer Kairo re-checked was correct. Never accept a "confirmed" for a quote, a line number or a count without one `grep` or `sed -n` of your own. |
| **A writer runs only targeted tests; you run the whole suite.** Session 53's writer missed `test/cli/main.test.ts:64`; session 54's writers passed, but the rule stands. Always `rm -rf dist`, build, and run the full suite to a file, echoing the exit code, before believing a writer. |
| **Writer prompt shape that worked nine times**: self-contained; names the slice's tasks; requires RED-first with the observed RED recorded per task; forbids all git operations; lists the files the writer may touch; lists constraints as HARD CONSTRAINTS; asks for `<command>: <observed result>` per verification, cheap mutation checks on the compiled `dist/`, and the measured line count; asks to close with `## Key Learnings`. Session 54 added: forbid edits to docs and Engram (the orchestrator records), tell the writer to filter process listings, and resume a finished agent with one message of numbered fixes. Kairo always re-reads the diff and re-runs build and tests itself. Slices still land over their estimate. |
| **`tsc -b` does not emit on a type error**, so a missing export or module is a compile-error RED (`TS2305`/`TS2307`/`TS2552`); acceptable evidence, say so. A pin for behavior that already exists passes on its first run and cannot show a RED; disclose it as a pin and prove it with a mutation. |
| **`sdd-attempt acquire --max-changed-lines` is a hard cap counted as added + deleted.** Slices landed at 651, 476 and 612 under caps of 1000, then 193 under 500 and 360 under 600, all `settle`d `complete`. Use about 2× the estimate. An over-budget attempt gives a `settle_obligation` that the next passing `settle` must carry via `--remediates-evidence-revision`. |
| **Staged files make `settle` simple.** With the slice's files `git add`ed (a new file needs `git add` too, or it is untracked) `sdd-attempt settle` needs no untracked flags; the `--evidence-revision` is `current_snapshot_identity` from `gentle-ai review status ... --next-transition --projection=staged`. Only when files stay untracked do `--untracked-scope=select` and `--intended-untracked` matter. |
| **RDD candidate scoping.** `review status`/`start` default to the `workspace` projection, which sweeps in every uncommitted tracked file. When the tree holds only the slice's staged files that is exactly the candidate; if unrelated docs are dirty, `git add` exactly the PR's files and pass `--projection=staged`. Build `review start` from the tokens `status` returns (plus `--consent=relay`). The Stop hook may force the preflight per candidate; running the STATUS and START early, while Alpha audits, is fine, but ask the Director only after Alpha's verdict so a change does not waste the answer. |
| **RDD consent and the review itself.** Relay the consent envelope through `AskUserQuestion` with a recommendation (keep the provider's labels, order and tokens), then run the exact captured invocation once. `granted` at a medium tier is one lens: run its single `review capture-result` with the returned tokens, then the exact `acknowledge-approved` command. At a **high** tier there are four lenses: give one forecast, then run the four `capture-result` calls concurrently (a small node script that spawns `gentle-ai review capture-result` with each input's argument tokens and writes each output to a file in `$TEMP` worked again); only the last admitted capture carries the closure and the acknowledge command. `declined` runs the exact `declined` invocation once. |
| **MSYS/Windows shell.** `/tmp` is not visible to `node`; feed scripts through stdin (`node - <<'EOF'`) or use `$TEMP`. Apostrophes break `node -e` and unquoted heredocs; use quoted heredocs or the Edit/Write tools. Never leave logs in the repository root: redirect to `$TEMP` and delete them (untracked files disturb `sdd-attempt` and `review`). **Keep a test log until you have read it**: session 54 deleted the log of the one failing post-merge run and never learned which test failed. **Never print an unfiltered `node.exe` command-line listing**: other tools' credentials sit on those command lines; mark your own busy-loop children with a comment marker and count leftovers by that marker. |
| **`npm test` output**: the summary lines start with `ℹ` (for example `ℹ fail 0`), not `#`, and failing tests print as `✖ name`. A background run can hang near zero CPU (run it in the foreground), and piping through `tail` masks the real exit code. Redirect to a file and `echo $?`. ANSI colour codes hide the summary from `grep`: strip them with `sed 's/\x1b\[[0-9;]*m//g'` first. `dist/` staleness fakes results: `rm -rf dist` first. A full run takes about 17 seconds on this machine. |
| **Local `main` can silently sit ahead of `origin/main`** (session 51 found two unpushed commits). Always `git diff --stat <local> <remote>` before any reset; stash with `-u` first. |
| **Line endings**: `.gitattributes` is `eol=lf`; some working copies are CRLF; git shows only a warning, no real diff. |
| **Memory (Engram)**: `mem_save` failed once in session 53 with `multiple active runtime sessions match the current project and directory`. What worked: `mem_session_start` with `id` and `directory` set to the repo root at the start, then pass that same `session_id` to `mem_save`. After each successful save, `mem_judge` every candidate by its own `judgment_id` (they were all `not_conflict`, `related` or `scoped`). A subagent's `mem_save` can fail for the same reason: the orchestrator persists. If it fails again, this file and `LOG.md` are the record. |
| **Engram has no `sdd-init/connmuta` observation.** The SDD init guard would ask for `sdd-init`; sessions 53 and 54 used `openspec/config.yaml` (`strict_tdd: true`, `npm test`) and native `sdd-status` (apply `ready`) instead. Say so again or run `sdd-init` if the Director prefers. |
| **Docs-only commits go straight to `main`; code goes through PRs.** CI (`.github/workflows/ci.yml`) runs on every push and pull request on `windows-latest` with Node 24.15 and 26 (build, test, wrong-room, pack, repo-scan) and takes about two minutes. Session 54 waited for it before merging #104 (a platform-sensitive test) and merged #103 while it ran; both were green. |

**Code and test facts**

| Item | State |
|---|---|
| **Timing-sensitive tests still exist (B-99).** Under CPU contention `heartbeat: ticks at periodMs`, `heartbeat: calls onTick on every tick` (`test/daemon/lifecycle/heartbeat.test.ts`) and `no-emission: simulated idle window ...` (`test/daemon/no-emission.test.ts`) fail reproducibly, and the first cold run after the #104 merge failed one unidentified test. **If the full suite fails exactly one test, read the log first; if it is one of these three, rerun the full suite once and report both runs.** The B-96 test (`bootstrap.test.ts:543`) is fixed (a state barrier), so a failure there is new information. |
| **The channel tests use real timers and real processes** (`abortableSleep` with a 20 ms timer, `process.getActiveResourcesInfo()`, spawned `dist/channel/main.js`, a real stdin end). Stable in repeated runs. If one fails alone, rerun once and report; do not weaken the bound. The spawned-entry cases need `dist` built, the same convention as `test/cli/main.test.ts`. |
| **`stop()` does not await a tick in flight (B-98).** `src/daemon/bootstrap.ts:243-260` calls `heartbeat.stop()` (which only clears the interval) and then `stopAll()`; a tick mid-`reconcile()` can start a poller after `stopAll()`. Not fixed on purpose (F1 core lifecycle code, the Director's call). Any new test that tears down a daemon while a slow add is in flight needs a state barrier, as the B-96 fix has. |
| **The MCP SDK's `StdioServerTransport` never reports stdin ending** (`sdk/dist/esm/server/stdio.js:37-38` listens to `data` and `error` only). Any new stdio server here must map stdin `close` itself, as `channel/main.ts` does. |
| **`import.meta.main`** (Node >= 24.2; `engines` is >= 24.15.0) is the entry guard for `channel/main.ts`. `src/cli/main.ts:707-711` still uses the `argv[1]` comparison (B-97). |
| **`package.json` and `npm-shrinkwrap.json` must agree on `bin`.** The lockfile's root record lists the `bin` map; adding an entry means editing both. `pack.test.ts` asserts the `files` whitelist by exact equality and `dist/channel/main.js` in the dry run. |
| **The doorbell relevance rule is implemented in `doorbell.ts` (`isRelevant`), not reused from fetch**, because fetch has none (design D5 said otherwise; corrected in `design.md`). The doorbell counts `rejected` and `ignored` rows on purpose. The daemon waits only when the scan finds no row past `after_seq` (`doorbell.ts`); a backlog of irrelevant rows returns at once with `count: 0`. **An unreadable stored row** (not JSON, not an object, or a `type`, `thread` or `to` the response cannot carry) is skipped by `parseScannedEnvelope` but still examined, so `covered_through_seq` advances; `serve/fetch.ts:244-246` keeps the same unguarded parse (B-95). |
| **`docs/07-plan/WORK-PLAN.md`'s F4 Validation row still says "`saturated` rings once per cursor value"**: deliberately stale until `tasks.md` task 7.2 (PR-07) applies the amendment text stored in `design.md`. Do not fix the Validation row earlier. |
| **The `client-bundle`, PT-27 and installer-bundle security tests grep raw source.** Even a comment naming the child-process module in a client module fails them, and each `channel/*.ts` file has a source pin with the same property. The shared `hasFsModuleReference` (`test/security/predicates.ts:41-43`) only matches `from "node:fs"` and `require("node:fs")` (B-100). |
| **`design.md`'s Testing Strategy table can be stricter than the spec.** PR-06's scope debate followed the spec and missed `design.md:198` (no `daemon/` path at all). Read the design's row for the test before scoping it. |
| **Review budget**: the fixed policy is 400 changed lines per PR. Over budget means re-slice or a disclosed, PR-scoped `size:exception` with the Director's authorization. Measured against estimates: PR-01 213, PR-02 661, PR-03 706, PR-04 306, 05a 224, 05b 651, 05c 476, 05d 612, 05e 193, PR-06 360. PR-07 is estimated at about 120 (docs). |
| **Arena's wake-up is PTY keystroke injection, not an MCP notification** (`Arena_Orion/src/main/ArenaBroker.js:3-9`). Never cite the `[ARENA]` ping as MCP-notification evidence. |
| **Pronouns**: refer to the Director by role, never a gendered pronoun. |

---

## §5 — Next session, exact sequence

1. Run §0's commands; the tree must match §0 exactly.
2. Prove Arena reachable with a real `bridge_send` (the opening debate of step 5 does it), and confirm the
   collaborator can actually answer: Alpha ran out of quota at the end of session 54 (§0). If the collaborator
   does not answer, ask the Director whether to seat Betelgeuse or to use the Judgment Day substitute.
3. The Director's opening prompt re-confirms autonomy; if it does not say so, ask one question.
4. Run the SDD Session Preflight through `AskUserQuestion` (hard gate, re-asked every session). Start an
   Engram session (`mem_session_start` with `id` and `directory`) and pass its id to `mem_save`.
5. **PR-07** (docs): debate the scope with Alpha (`kind: PROPOSAL`, pointers, not pasted code); fetch the current
   Claude Code channels documentation for the runbook's flags; branch `f4/07-channel-docs`, `sdd-attempt
   acquire`, the native `sdd-apply` agent (fall back to a `general-purpose` writer if the hook blocks it), cold
   rebuild and full suite, `settle`, frozen-diff debate, RDD consent (a docs-only diff is probably `passive`),
   PR, wait for CI, rebase merge, rebuild and suite.
6. `sdd-verify`, Alpha-audited. Read `design.md`'s Testing Strategy rows first.
7. `sdd-archive`, Alpha-audited; write the archive with final-state facts (PR-05e and PR-06 landed after
   `apply-progress.md`'s earlier snapshots).
8. After each merge, a docs-only commit records it (`tasks.md`, `apply-progress.md`), and at the end this file,
   `LOG.md`, the tribunal index and the backlog are rewritten and audited by Alpha.

---

## §6 — Do not redo

- F1, F2, F3 and F5 archives are closed. B-09 is closed. B-96 is closed.
- F4's five planning phases (session 50) are final. PR-01 to PR-06 and the follow-up PR 05e are merged: do not
  re-implement or re-debate them. The `CONSENSUS` debates of sessions 51-54 are indexed in the tribunal record;
  none is reopened.
- RDD lineages `review-39a0ff92bc18e85d` (PR-01), `review-15bbc1e2b034a77a` (retroactive PR-03/04/05a),
  `review-f22ebcffa06e871b` (05b), `review-7c68cd7c0744c817` (05c), `review-8d944602c30cc117` (05d) and
  `review-4cab6b97f2871cfb` (05e) are approved, acknowledged, authority burned. Do not re-review that code;
  their findings are in `apply-progress.md` and B-95. PR-06's review was declined by the Director and left no
  record.
- F4's design decisions D1-D12 stand except where `design.md`'s "Corrections found during apply" (items 1-7)
  says otherwise, and `tasks.md`'s PR-06 amendments (1)-(14) supersede the earlier PR-06 text. Reopening one
  needs new evidence, a written correction and Alpha.
- Do not fix `WORK-PLAN.md`'s F4 Validation row before PR-07 (§4).

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-95** | Remainder of the RDD follow-ups: (d) the missing abort signal (design-exact, Alpha), `serve/fetch.ts:244-246`'s unguarded parse, and three non-blocking notes (a drifting count in a comment, `to` accepting any string, the silent skip of an unreadable row). (a), (b), (c), (e), (f) are done in `#103`. | Kairo (Director schedules) |
| **B-97** | `src/cli/main.ts:707-711`'s entry guard may silently do nothing behind a POSIX symlinked npm bin (not reproduced: Windows machine, `windows-latest` CI only). Verify on Linux or macOS, then use `import.meta.main`. | Director + Kairo |
| **B-98** | `stop()` does not await a tick in flight; a tick mid-`reconcile()` can start a poller after `stopAll()`. F1 core lifecycle code. | Director + Kairo |
| **B-99** | Three timer-based tests (`heartbeat` x2, `no-emission`) fail under CPU contention; replace the fixed waits by condition waits with a deadline. | Kairo (Director schedules) |
| **B-100** | Blind spots of the bundle-closure detectors: the shared `hasFsModuleReference` misses four import forms, and `computeClosure` follows relative specifiers only (a bare-specifier dependency that wrapped process spawning would evade the `child_process` substring). | Director + Kairo |
| **B-93, B-94, B-91, B-92; B-53/54/56/57/58/59/60** | Carried unchanged from earlier sessions. | Director |
| **macOS start-at-login (D-40/D-47)** | Designed on paper only; empirical verification deferred to F6 (B-12). B-97 is relevant to it. | Director + Kairo |
| **B-16 / D-10, B-11, B-12** | Licence files and copyright line; trademark screening; macOS scope: all three still block F6's readiness. | Director |
| **Gemini CLI / Cursor doorbell capability** | Untested for B-09; not a blocker for F4. Low priority. | Director |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions).

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0 and `gentle-ai` 2.9.1 (both re-measured in session 54); shell is PowerShell
  primary with Bash (Git Bash) available. The machine has 24 logical CPUs; the B-96 and B-99 flakes need about
  1x to 4x CPU oversubscription with busy loops to show.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`. Every `gh`
  command runs with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`;
  **never `gh auth switch`**. Force-push and deletion of `main` are blocked; there is no PR or
  status-check requirement (docs-only commits went straight to `main`, code went through PRs).
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**; cite as `path:line`.
  v1's `channel/index.ts` is the reference for the MCP `Server` construction and the notification call.
- `.mcp.json` points at the Arena bridge; never quote or commit its contents. `.claude/settings.json` is
  gitignored tooling. `prompt.txt` and `.arena/` in the repository root are gitignored Arena leftovers.
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
| F4 PR-05b, PR-05c, PR-05d (session 53) | medium (1 lens), medium (1 lens), high (4 lenses, heuristic hits) | Director **granted** each; all **approved**, acknowledged, burned; SUGGESTIONs filed under B-95 (e), (f). |
| F4 follow-up PR 05e (session 54) | high (a heuristic hit in `channel/main.ts`), 4 lenses | Director **granted**; **approved**: 0 findings in risk and resilience, 1 readability and 1 reliability SUGGESTION (filed under B-95); acknowledged, burned. |
| F4 PR-06 (session 54) | high (two heuristic hits in the test file), 4 lenses offered | Director **declined** for this candidate; no record. |

No candidate is currently under review and no authority is outstanding. The next candidate, PR-07, will be the
next RDD question.
