# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what the
> next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live in the
> ADRs and the tribunal index, never here.
>
> **Last rewritten: end of session 54** (started 2026-09-28, closed 2026-09-29). Everything below describes
> the state after it.

---

## At a glance

| Question | Answer |
|---|---|
| Where does F4 stand? | PR-01 to PR-06 and the B-95/B-96 follow-up (`#103`) are merged; `main` equals `origin/main`; `npm test` is 1713 tests, 1707 pass, 0 fail, 6 skip. F1, F2, F3 and F5 are archived. |
| What is next? | PR-07 (docs), then `sdd-verify`, then `sdd-archive` (§5). |
| What must be settled before any work? | **Who audits.** Alpha is out of token quota: settle it as §0.3 says (Alpha back, Betelgeuse seated, or the Director's explicit Judgment Day instruction). |
| What is the Director's to decide? | B-97, B-98 and B-100 (Director + Kairo); B-101 (Director); B-99 is Kairo's small test-only PR, scheduled by the Director (§7). |
| Where to read next | §0 and §5 first; then §3 (contracts), §4 (traps), §6 (do not redo), §7 (open points) and §8 (environment) as the task needs. |

---

## §0 — Quick start

### 0.1 Prompt to paste (three lines, per the Director's instruction)

```text
F4 PR-06 y #103 mergeados — lee docs/08-sessions/HANDOFF.md y confirma Arena con un bridge_send real y mi autonomía total con tu colaborador como juez (Alpha quedó sin cuota: si no responde, avísame antes de usar Judgment Day, DN-09).
Arranca sdd-apply PR-07 (docs; verifica los flags de Claude Code channels contra la documentación vigente), luego sdd-verify y sdd-archive; pide RDD por candidato y recomiéndame granted.
Árbol limpio esperado (docs de la sesión 54 ya commiteadas); B-97, B-98, B-99, B-100 y B-101 los decido yo.
```

### 0.2 First commands (stop and report if any output disagrees)

Run them in the Bash tool: they use POSIX syntax (`rm -rf` does not exist in PowerShell, the default shell, §8).

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | first line `## main...origin/main` with no `ahead` or `behind` (if `behind`, run `git pull --ff-only`; if `ahead`, stop: §4.4) |
| 2 | `git rev-parse HEAD origin/main` | two identical hashes |
| 3 | `git log --oneline cdd63ca..origin/main` | only docs-only commits (subjects start with `docs`); `cdd63ca` (PR-06) is the last code commit |
| 4 | `rm -rf dist` | prints nothing; a stale `dist/` silently fakes results |
| 5 | `ls openspec/changes/` | `archive/` and `f4-claude-channels-adapter/` |
| 6 | `git status --short` | prints nothing |
| 7 | `gentle-ai review mode status` | `receipt-driven development: on (decided by global)`; the switch is user-owned, so read it, do not assume it |

The working tree must be clean: the docs of session 54 were committed as docs-only commits on the Director's
standing authorization (`8c20646` between #103 and #104, and the close-out from `7ce0ae2` on). If `git status`
shows anything, stop and report before assuming it is safe.

### 0.3 Settle before any work

1. **Autonomy.** The opening prompt (§0.1) re-confirms full autonomy with the collaborator as judge; if it does
   not say so, ask one question. DN-08's rule (a PR merges after its tribunal `CONSENSUS` and green CI, without a
   separate Director question) applies unchanged when Betelgeuse is the collaborator. Judgment Day gives no
   `CONSENSUS`: F1 merged its PRs from PR-06 on after a Judgment Day approval (GOVERNANCE §3); if the prompt does
   not extend the autonomy to a Judgment-Day-audited merge, ask one question.
2. **SDD Session Preflight and memory.** Run the preflight through `AskUserQuestion` (hard gate, re-asked every
   session; this project uses Automatic / Both / Auto). Start an Engram session (`mem_session_start` with `id`
   and `directory`) and pass its id to `mem_save`.
3. **Arena and collaborator.** Prove Arena reachable with a real `bridge_send`, never `curl`; a successful send
   clears that gate. **The first debate of the session is also the probe of the collaborator**: send it, end the
   turn and wait for the `[ARENA]` ping (do not poll, §4.1). Alpha ran out of token quota at the close of
   session 54 (the Director said so after the close-out audit had been answered; no debate was pending), so the
   ping may never come:

   | Situation | Action |
   |---|---|
   | The Director says Alpha is back | Proceed as in session 54. |
   | The Director seats **Betelgeuse** in the right panel (preferred; GOVERNANCE §3 accepts Alpha or Betelgeuse) | Send envelopes to `betelgeuse` only, the name the system prompt gives. No recorded debate has had Betelgeuse yet, so the first envelope is also the first contact: the ping must name Betelgeuse. |
   | The `bridge_send` itself fails | The bridge is unreachable: DN-09 applies and the Judgment Day substitute is the standing audit (GOVERNANCE §3, `AGENTS.md` §3). Confirm with the failed real call (never `curl` alone), tell the Director, and run the substitute as §4.1 describes. |
   | The send succeeds but no ping comes | Arena's own watchdog re-pings once after 5 minutes (`ARENA_DEBATE_TIMEOUT_MS`) and escalates to the Director after a second expiry (`Arena_Orion/src/main/ArenaBroker.js:116-118`); it does not wake an idle session. End the turn with "sent, waiting for the collaborator" as the report; the Director's next message decides. Judgment Day only on the Director's explicit instruction (§4.1); never start it on your own. |

   GOVERNANCE §3 defines the Judgment Day substitute only for an Arena unreachable at a session's own start (the
   third row). A reachable Arena with a collaborator who cannot answer (the fourth row) is a gap in it (B-101):
   session 54 used the substitute there on the Director's explicit request, recorded as a waiver of DN-05 in the
   tribunal index.

Then follow §5.

### 0.4 Standing instructions from the Director

- **RDD consent is asked per candidate through `AskUserQuestion`; never answer it for the Director.** Recommend
  `granted`, and keep the provider's labels, order and tokens. Session 54: granted for the follow-up PR and for
  the docs close-out, **declined** for PR-06; do not presume an answer. When the tier is `high`, check whether
  the evidence is a heuristic false positive and say so in the question. Ask after the collaborator's verdict,
  so a change does not waste the answer.
- **`size:exception` is asked per PR**, after the collaborator's view on the frozen diff, with a recommendation.
  None was needed in session 54 (193 and 360 lines). Never open an over-budget PR without that answer.
- **Commit messages and PR descriptions carry no `Co-Authored-By` and no AI attribution**; conventional commits
  only. This overrides the harness's attribution reminder. Commit by work unit (tests with the code they verify,
  one purpose each): #103 landed as five commits and #104 as two.
- **Docs commits.** Session-bookkeeping docs-only commits (recording a merged slice, the session close-out) go
  straight to `main`: DN-08 ("session-close documentation commits stay direct") on top of DN-04's delegation of
  commits, PRs and merges. A documentation *slice* such as PR-07 is not bookkeeping: it goes through a branch, an
  audit and a PR.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1, F2, F3, F5 | **Archived**, unchanged. | `openspec/changes/archive/` (four dated folders) |
| B-09 | **Closed** (session 50). | `docs/06-backlog/CHECKLIST.md#B-09` |
| F4 planning | Explore, proposal, spec, design, tasks all written and Alpha-audited to `CONSENSUS` (session 50). | `openspec/changes/f4-claude-channels-adapter/` |
| F4 PR-01 to PR-04 | **Merged** (`#95` `952fbcd`, `#96` `d3cb965`, `#97` `33cd1e6`, `#98` `e03498a`). | `apply-progress.md` |
| F4 PR-05a to 05d | **Merged** (`#99` `9262939`, `#100` `2647b06`, `#101` `0ea55df`, `#102` `48c8c39`). PR-05 is complete. | `apply-progress.md` |
| Follow-up PR 05e | **Merged.** B-95 (a)(b)(c)(e)(f) and B-96. `#103`, tip `b99d66b` of five work-unit commits, 193 lines. | `apply-progress.md` ("Follow-up PR 05e") |
| F4 PR-06 | **Merged.** `test/security/channel-bundle.test.ts` and the `channel/` twin gate. `#104`, tip `cdd63ca` of two work-unit commits, 360 lines, applied by the native `sdd-apply` agent. | `apply-progress.md` ("PR-06") |
| F4 PR-07 | **Next.** Runbook, `WORK-PLAN.md` amendment (task 7.2), DATA-MODEL and ADR notes. | `tasks.md` (PR-07 block) |
| After PR-07 | `sdd-verify`, then `sdd-archive`, each audited like F1/F2/F3/F5. | — |
| Backlog open | **B-95** remainder ((d), the `fetch.ts` parse, three notes), **B-97**, **B-98**, **B-99**, **B-100**, **B-101**, plus the carried rows in §7. B-96 is closed. | `docs/06-backlog/CHECKLIST.md` |
| Tests on `main` | `npm test`: **1713 tests, 1707 pass, 0 fail, 6 skip** (session start: 1682/1676/0/6). | — |
| Tribunal record | Debates and audits are indexed, including session 54's four debates, the close-out audit `bus-v2-s54-docs-close-audit-001` and the Judgment Day review of this file, `bus-v2-s54-handoff-judgment-day-001`. | `docs/05-tribunal/INDEX.md` |

---

## §2 — What session 54 did (context, not to redo; detail in `LOG.md` and `apply-progress.md`)

1. **Two code PRs, each through the full loop** (scope debate, `sdd-attempt`, writer or native `sdd-apply`, cold
   suite, `settle`, frozen-diff debate, RDD, PR, CI, rebase merge, post-merge suite): the follow-up `#103`
   (doorbell scan skips an unreadable row; the B-96 flake fixed test-only) and PR-06 `#104` (closure test and
   twin gate).
2. **Findings that changed the plan**, all written down: B-96's root cause is a production gap (`stop()` never
   awaits a tick in flight: B-98); PR-06's debate missed `design.md:198` (no `daemon/` path at all, plus
   `node:sqlite` and keyring), so the test follows the design; `hasFsModuleReference` misses four import forms
   and `computeClosure` skips bare specifiers (B-100); three timer-based tests fail under CPU contention (B-99);
   GOVERNANCE §3 does not cover a collaborator that cannot answer (B-101).
3. **Close-out.** Alpha audited the documentation (`APPROVE`) before its quota ran out and the RDD review was
   granted and approved. Afterwards the Director asked for this file to be restructured and reviewed twice by
   judges: Judgment Day, `bus-v2-s54-handoff-judgment-day-001`.

---

## §3 — Contracts the next work needs (read the files, do not re-derive)

### 3.1 The adapter as merged (`channel/`, for PR-07's runbook)

- `main.ts` (bin `conmuta-channel`): `runChannel(options)` never exits the process; the guarded entry
  (`import.meta.main`) parses `--project <id>` and `--project=<id>` strictly, then hard-exits. It imports
  `./daemon-link.js`, `./doorbell-loop.js`, `./notify.js`, `../src/client/binding.js` (the only `fs` user besides
  `run-file`), `../src/shared/*` and the MCP SDK. It never imports `client/main`, `run-state`, `spawn`,
  `handshake`, `ipc-stub` or anything under `src/daemon`. The shutdown bound is the named local
  `watcherStopBound` (an `AbortSignal.timeout`, evaluated right before the race).
- `daemon-link.ts`: `createDaemonLink(deps)` returns the `DaemonLink` interface; eight-code `DaemonLinkError`;
  reads the run file afresh per handshake, **never spawns**, throws `NO_DAEMON` with zero fetches when the daemon
  is down. Bounds use `AbortSignal.timeout` (not a timer identifier).
- `doorbell-loop.ts`: `DoorbellWatcher` and `abortableSleep`. **The only file in `channel/` that arms a timer**
  (global `setTimeout`, never `node:timers`). `deliver_failed` and `link_failed` back off
  `CHANNEL_RETRY_BACKOFF_SECONDS`; `rang` and `silent` never sleep. A throw from `buildNotification` is
  deliberately not caught (fail-fast: `run` ends and `main.ts` exits 1), documented on `tick` and pinned by a test.
- Exit codes: usage `EXIT_USAGE` (2), unbound project 3, project mismatch 4, unexpected failure or a crashed loop
  1, a clean shutdown 0. Diagnostics go to stderr only; stdout carries MCP frames only.
- Capability: `{ experimental: { "claude/channel": {} } }`, **no `permission` key at all**; the event is
  `notifications/claude/channel` with `{ content, meta }` from `buildNotification`.
- The adapter needs a **running daemon** and never starts one (D7). Sessions are minted lazily by the first route
  call and released by `DELETE /session` at shutdown (D10).

### 3.2 PR-07 (docs)

- Read `tasks.md`'s PR-07 block (tasks 7.1 to 7.5). The `WORK-PLAN.md` amendment text (task 7.2) is stored in
  `design.md` ("WORK-PLAN :93 amendment text"). Row 94 of `WORK-PLAN.md` (the change's status) was refreshed in
  session 54; row 93 (Validation) stays stale until task 7.2 (§4.5).
- The runbook states the adapter as best-effort and documents `conmuta-channel --project <id>`, the need for a
  running daemon, and that events are dropped silently if the host has not enabled the channel.
- **Where the flags come from**: the current Claude Code documentation, never memory (`design.md`, "Migration /
  Rollout"). Ask the `claude-code-guide` agent or use `WebFetch` and `WebSearch` on the Claude Code documentation
  site, and record the exact URL and the access date in the runbook.
- **Stale F4 artifacts to sync** (found by the session-54 judges): tick tasks 1.1 to 1.7 in `tasks.md` (PR-01
  merged as `#95`, and `apply-progress.md` already shows them done; until then `sdd-status` reports 42 of 54 tasks
  complete) and refresh `apply-progress.md`'s PR-05 header status (it still says 05b to 05d are not started). Do it
  in the docs-only commit that records PR-07 after its merge, together with the 7.x marks, and before
  `sdd-verify`, whose task-completeness check needs it; not inside the PR branch, where an openspec edit would
  raise the RDD tier (§4.3).

### 3.3 `sdd-verify`

- The spec is `openspec/changes/f4-claude-channels-adapter/specs/channel-doorbell/spec.md`; `design.md`'s Testing
  Strategy table (rows around 190-201) maps each guarantee to its test. Read those rows before judging coverage.
- `apply-progress.md` is current through `#104`; no `verify-report` exists yet (`sdd-status`:
  `verifyReport: missing`).

### 3.4 The bundle-closure test as merged (`test/security/channel-bundle.test.ts`, the model for future closure tests)

- Entry `dist/channel/main.js`, paths relative to `dist/` (so the `fs` allow-list reads `src/client/binding.js`
  and `src/client/run-file.js`). The closure is 16 files: nothing under `src/daemon/`, `fs` only in those two
  client modules, a timer only in `channel/doorbell-loop.js`.
- A `RULES` table of 10 rules, each with seeds that must trip exactly that rule (a loop generates one test per
  rule); one `findViolations(Map<path, source>)` helper judged on the real bundle and on synthetic maps; seeded
  positives for the allow-listed modules; a two-hop temp-dir fixture. To add a guarantee, add a rule with seeds.
- `fs`, `node:sqlite` and keyring use quote-anchored local regexes; the shared `hasFsModuleReference` is not used
  (B-100). `test/twins.test.ts` also walks `channel/**` against `test/channel/`.

### 3.5 Already in `main` and relevant

- Constants (`src/shared/constants.ts`): `DOORBELL_SCAN_DEPTH` (:328), `CHANNEL_SERVER_NAME` (:329, equals
  `conmuta-channel`, also the bin name), `CHANNEL_HOST_LABEL` (:331), `CHANNEL_RETRY_BACKOFF_SECONDS` (:333),
  `CHANNEL_META_LIST_LIMIT` (:335), `CHANNEL_SHUTDOWN_TIMEOUT_MS` (:337, 20 s).
- The live IPC route table has **ten** entries (`createSessionRoutes` builds eight of them). `channel/tsconfig.json`
  is a composite project (`rootDir ".."`, `outDir "../dist"`) emitting `dist/channel/*.js`; `src/` emits `dist/src/*`.
- Closure rule for `channel/*.ts`: banned is reachability to anything under `src/daemon/` and any reference to the
  child-process module **including the literal substring inside a comment** (each of the four `channel/*.ts`
  modules pins it; `notify.ts` through its purity test). Timers only in `doorbell-loop.ts`.

---

## §4 — Facts that will bite you

**Which parts matter next.** For PR-07 (docs), `sdd-verify` and `sdd-archive` read 4.1 to 4.4 and 4.6, plus two
bullets of 4.5: the B-99 rerun rule (it governs every cold full-suite run) and the `WORK-PLAN.md` row 93 rule. The
rest of 4.5 applies only when code changes.

### 4.1 Audit and collaborators

- **A collaborator's report can contain false claims; re-verify the concrete ones yourself.** Session 52: Alpha
  "verified verbatim" four Director quotes that exist nowhere. Session 54: in the scope audit Alpha called
  `hasAutonomousTimerReference` an AST pin (it is a regex); in the close-out audit it cited two lines
  approximately; in the PR-06 diff audit it asserted a directory-walk timing ("<3ms") that nobody measured
  (caveats are in the tribunal rows). Every other pointer Kairo re-checked was correct, and the last audit listed
  what it re-read. Never accept a "confirmed" for a quote, a line number or a count without one `grep` or
  `sed -n` of your own.
- **Read `design.md`'s Testing Strategy table before scoping a test PR.** Its rows can be stricter than the spec:
  PR-06's scope debate followed the spec and missed `design.md:198`.
- **A long `bridge_read` wait can time out at the tool level** (`wait_seconds` of 90 and 120 both did in
  session 54; 45 and 60 worked). Do not loop on it: end the turn and wait for the `[ARENA]` ping.
- **Arena's wake-up is PTY keystroke injection, not an MCP notification** (`Arena_Orion/src/main/ArenaBroker.js:3-9`,
  in the sibling `Arena_Orion` checkout). Never cite the ping as MCP-notification evidence.
- **Pronouns**: refer to the Director by role, never a gendered pronoun.
- **Judgment Day** (the standing audit when the Arena is unreachable at a session's start, DN-09; otherwise only on
  the Director's explicit instruction). Skill `~/.agents/skills/judgment-day/SKILL.md`, formats in its
  `references/prompts-and-formats.md`. GOVERNANCE §3 points to this block for the operating detail: carry it
  forward when this file is overwritten (B-101 proposes a durable home).
  - One immutable target (paths plus a sha256, or a frozen commit range); two blind read-only judges,
    `jd-judge-a` and `jd-judge-b` (model `sonnet`), launched in parallel with an identical brief; each returns
    one JSON object `{"findings":[...],"evidence":[...]}`. The judges have no shell: put the git, `gh` and test
    facts in the brief as ground truth. A sweep of a 400-line document took about 22 minutes and 140 tool calls per
    judge.
  - The parent merges the findings into a frozen ledger and persists it (Engram). Only severe findings
    (`CRITICAL` in the judge JSON) confirmed by both judges are fixed by the bounded actor `jd-fix-agent`, after
    asking; a finding from one judge is only a suspect, judges that contradict each other go to the Director, and
    WARNING and SUGGESTION stay informational. At most two fix rounds and two scoped re-judgments, then an
    independent final verification (GOVERNANCE §3 names a separate agent that reproduces the figures and re-runs
    the verification); the terminal verdicts are `APPROVED` and `ESCALATED`.
  - It issues no receipt and no `CONSENSUS`, and it satisfies the pre-merge audit only in spirit (GOVERNANCE §3):
    DN-05 stays formally unsatisfied. Record it in the tribunal index with Authority, What was waived, What was
    used instead and Consequence (the shape of `bus-v2-f1-pr-06-waiver-001`).
  - It has no scope debate: replace that step by a scope note (ask the Director when the scope is a real
    decision), and run the frozen-diff, `sdd-verify` and `sdd-archive` audits as Judgment Day runs.

### 4.2 SDD, attempts and writers

- **Native `sdd-*` Agent dispatch worked in session 54** (`sdd-apply`, model `sonnet`, no block). Sessions 44-50
  saw the `PreToolUse:Agent` hook block it; 51-53 did not test it. The parent runs `sdd-attempt acquire` and
  passes the token; the agent must not `settle`. It normally edits `tasks.md` and `apply-progress.md`: the brief
  forbade that so the RDD candidate stayed code-only, and it reported its progress instead. If a dispatch is
  blocked, fall back to a `general-purpose` writer with the same brief. Pointer:
  `~/.claude/skills/_shared/sdd-phase-common.md`.
- **The archive move fails on this Windows checkout**: `git mv` failed with `Permission denied` (or fell back) in
  the F1, F2, F3 and F5 archives. F1 and F2 used `cp -R` + `git rm` (`--cached` in F2) + `git add`, which keeps the
  index coherent. F3 and F5 used PowerShell `Move-Item` with **absolute** paths (a relative destination once
  relocated the whole change folder to a stray `<repo-root>/x`); a non-git move leaves the old paths as unstaged
  deletions, and `test/security/repo-scan.test.ts` (PT-22; it runs as `dist/test/security/repo-scan.test.js`) then
  fails with `ENOENT` on a ghost path until `git add -A -- openspec/` (git detects the renames). Take a snapshot
  first and read the result back with `diff -r`. Moving `openspec/changes/f4-claude-channels-adapter/` also breaks
  the live pointers to it (`AGENTS.md` §2, the pointer column of five `CHECKLIST.md` rows, this file, and whatever
  PR-07 adds): find them with a search for `changes/f4-claude-channels-adapter` and update them in the same commit
  (GOVERNANCE §6, "Pointer integrity"). Details: the archive reports of F1, F2 and F5, and `LOG.md`'s F3 and F5
  archive entries.
- **A writer runs only targeted tests; you run the whole suite.** Session 53's writer missed
  `test/cli/main.test.ts:64`; session 54's writers passed, but the rule stands. Always `rm -rf dist`, build, and
  run the full suite to a file, echoing the exit code, before believing a writer.
- **Writer prompt shape that worked nine times**: self-contained; names the slice's tasks; requires RED-first with
  the observed RED recorded per task; forbids all git operations; lists the files the writer may touch; lists
  constraints as HARD CONSTRAINTS; asks for `<command>: <observed result>` per verification, cheap mutation checks
  on the compiled `dist/`, and the measured line count; asks to close with `## Key Learnings`. Session 54 added:
  forbid edits to docs and Engram (the orchestrator records), tell the writer to filter process listings, and
  resume a finished agent with one message of numbered fixes. Kairo always re-reads the diff and re-runs build and
  tests itself.
- **`tsc -b` does not emit on a type error**, so a missing export or module is a compile-error RED
  (`TS2305`, `TS2307`, `TS2552`); acceptable evidence, say so. A pin for behavior that already exists passes on
  its first run and cannot show a RED: disclose it as a pin and prove it with a mutation.
- **`sdd-attempt acquire --max-changed-lines` is a hard cap counted as added + deleted.** Slices landed at 651,
  476 and 612 under caps of 1000, then 193 under 500 and 360 under 600, all `settle`d `complete`. Use about 2×
  the estimate. An over-budget attempt gives a `settle_obligation` that the next passing `settle` must carry via
  `--remediates-evidence-revision`.
- **Staged files make `settle` simple.** With the slice's files `git add`ed (a new file needs `git add` too, or it
  is untracked) `sdd-attempt settle` needs no untracked flags; the `--evidence-revision` is
  `current_snapshot_identity` from `gentle-ai review status ... --next-transition --projection=staged`. Only when
  files stay untracked do `--untracked-scope=select` and `--intended-untracked` matter.
- **Engram**: `mem_save` failed with `multiple active runtime sessions match the current project and directory`
  in session 53 and again in session 54 after `mem_session_end`. What worked: `mem_session_start` with `id` and
  `directory` set to the repo root, then the same `session_id` on every `mem_save`. After each successful save,
  `mem_judge` every candidate by its own `judgment_id` (all were `not_conflict`, `related` or `scoped`). A
  subagent's `mem_save` can fail for the same reason: the orchestrator persists. Engram has no `sdd-init/connmuta`
  observation and none for `sdd/f4-claude-channels-adapter/apply-progress` (the openspec files are the artifact
  store in practice); sessions 53 and 54 used `openspec/config.yaml` (`strict_tdd: true`, `npm test`) and native
  `sdd-status` (apply `ready`). Say so again or run `sdd-init` if the Director prefers.

### 4.3 RDD

- **Candidate scoping.** `review status` and `start` default to the `workspace` projection, which sweeps in every
  uncommitted tracked file. When the tree holds only the slice's staged files that is exactly the candidate; if
  unrelated docs are dirty, `git add` exactly the PR's files and pass `--projection=staged`. Build `review start`
  from the tokens `status` returns (plus `--consent=relay`).
- **The Stop hook forces the preflight per candidate.** Running STATUS and START early, while the collaborator
  audits, is fine; ask the Director only after the verdict.
- **Consent and the review.** Relay the envelope through `AskUserQuestion` with a recommendation, then run the
  exact captured invocation once. `granted` at a medium tier is one lens: run its single
  `review capture-result` with the returned tokens, then the exact `acknowledge-approved` command. At a **high**
  tier there are four lenses: give one forecast, then run the four `capture-result` calls concurrently (a small
  node script that spawns `gentle-ai review capture-result` with each input's argument tokens and writes each
  output to a file in `$TEMP` worked again); only the last admitted capture carries the closure and the
  acknowledge command. `declined` runs the exact `declined` invocation once and leaves no record.
- **The tier follows the files as well as the size** (observed in session 54): a delta of `HANDOFF.md`, `LOG.md`
  and other plain docs closed as `low` with no question (`action: closed`); adding an `openspec/` artifact or
  `AGENTS.md` made it `medium` (they read as executable); a security-test file or a file that merely mentions
  `spawn` made it `high`. When a small docs delta would trigger a question, consider splitting it.

### 4.4 Shell and test-run hygiene

- **MSYS/Windows shell.** The default shell is PowerShell; Bash (Git Bash) is available through the Bash tool.
  `/tmp` is not visible to `node`; feed scripts through stdin (`node - <<'EOF'`) or use `$TEMP`. Apostrophes break
  `node -e` and unquoted heredocs; use quoted heredocs or the Edit/Write tools. Never leave logs in the
  repository root: redirect to `$TEMP` and delete them (untracked files disturb `sdd-attempt` and `review`).
- **Keep a test log until you have read it.** Session 54 deleted the log of the one failing post-merge run and
  never learned which test failed.
- **Never print an unfiltered `node.exe` command-line listing**: other tools' credentials sit on those command
  lines. Mark your own busy-loop children with a comment marker and count leftovers by that marker.
- **`npm test` output**: the summary lines start with `ℹ` (for example `ℹ fail 0`), not `#`, and failing tests
  print as `✖ name`. A background run can hang near zero CPU (run it in the foreground), and piping through
  `tail` masks the real exit code: redirect to a file and `echo $?`. ANSI colour hides the summary from `grep`:
  strip it with `sed 's/\x1b\[[0-9;]*m//g'`. `dist/` staleness fakes results: `rm -rf dist` first. A full run
  takes about 17 seconds on this machine.
- **Local `main` can silently sit ahead of `origin/main`** (session 51 found two unpushed commits), and
  `git pull --ff-only` says nothing then: read `git status -sb` (§0.2). Always `git diff --stat <local> <remote>`
  before any reset; stash with `-u` first.
- **Line endings**: `.gitattributes` is `eol=lf`; some working copies are CRLF; git shows only a warning, no real diff.

### 4.5 Code and test facts

- **Timing-sensitive tests still exist (B-99).** Under CPU contention `heartbeat: ticks at periodMs` and
  `heartbeat: calls onTick on every tick` (`test/daemon/lifecycle/heartbeat.test.ts`) and
  `no-emission: simulated idle window ...` (`test/daemon/no-emission.test.ts`) fail reproducibly, and the first
  cold run after the #104 merge failed one unidentified test. **If the full suite fails exactly one test, read the
  log first; if it is one of these three, rerun the full suite once and report both runs.** The B-96 test
  (`bootstrap.test.ts:543`) is fixed by a state barrier, so a failure there is new information.
- **`stop()` does not await a tick in flight (B-98).** `src/daemon/bootstrap.ts:243-260` calls `heartbeat.stop()`
  (which only clears the interval) and then `stopAll()`; a tick mid-`reconcile()` can start a poller after
  `stopAll()`. Not fixed on purpose (F1 core lifecycle code, the Director's call). A new test that tears down a
  daemon while a slow add is in flight needs a state barrier, as the B-96 fix has.
- **The channel tests use real timers and real processes** (`abortableSleep` with a 20 ms timer,
  `process.getActiveResourcesInfo()`, spawned `dist/channel/main.js`, a real stdin end). Stable in repeated runs.
  If one fails alone, rerun once and report; do not weaken the bound. The spawned-entry cases need `dist` built,
  the same convention as `test/cli/main.test.ts`.
- **The MCP SDK's `StdioServerTransport` never reports stdin ending**
  (`node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js:37-38` listens to `data` and `error` only).
  Any new stdio server here must map stdin `close` itself, as `channel/main.ts` does.
- **`import.meta.main`** (Node >= 24.2; `engines` is >= 24.15.0) is the entry guard for `channel/main.ts`.
  `src/cli/main.ts:709-714` (`isDirectlyExecuted()`) still uses the `argv[1]` comparison (B-97).
- **`package.json` and `npm-shrinkwrap.json` must agree on `bin`.** The lockfile's root record lists the `bin`
  map; adding an entry means editing both. `pack.test.ts` asserts the `files` whitelist by exact equality and
  `dist/channel/main.js` in the dry run.
- **The doorbell relevance rule is implemented in `doorbell.ts` (`isRelevant`), not reused from fetch**, because
  fetch has none (design D5 said otherwise; corrected in `design.md`). The doorbell counts `rejected` and
  `ignored` rows on purpose. The daemon waits only when the scan finds no row past `after_seq`; a backlog of
  irrelevant rows returns at once with `count: 0`. **An unreadable stored row** (not JSON, not an object, or a
  `type`, `thread` or `to` the response cannot carry) is skipped by `parseScannedEnvelope` but still examined, so
  `covered_through_seq` advances; `serve/fetch.ts:244-246` keeps the same unguarded parse (B-95).
- **`docs/07-plan/WORK-PLAN.md`'s F4 Validation row (row 93) still says "`saturated` rings once per cursor
  value"**: deliberately stale until `tasks.md` task 7.2 (PR-07) applies the amendment text stored in
  `design.md`. Do not fix that row earlier.
- **The `client-bundle`, PT-27 and installer-bundle security tests grep raw source.** Even a comment naming the
  child-process module in a client module fails them, and each `channel/*.ts` file has a source pin with the same
  property. The shared `hasFsModuleReference` (`test/security/predicates.ts:41-43`) only matches
  `from "node:fs"` and `require("node:fs")` (B-100).

### 4.6 Budgets and CI

- **Review budget**: the fixed policy is 400 changed lines per PR (added + deleted). Over budget means re-slice or
  a disclosed, PR-scoped `size:exception` with the Director's authorization. Estimate against measured:

  | Slice | Estimate | Measured |
  |---|---|---|
  | PR-01 | ≈220 | 213 |
  | PR-02 | ≈420 | 986 (661 added, 325 deleted; `size:exception`) |
  | PR-03 | ≈480 | 706 |
  | PR-04 | ≈200 | 306 |
  | PR-05, four slices | ≈750 | 1963 (05a 224, 05b 651, 05c 476, 05d 612) |
  | Follow-up 05e | — | 193 |
  | PR-06 | ≈280 | 360 |
  | PR-07 | ≈120 | — |

- **CI** (`.github/workflows/ci.yml`) runs on every pull request and on every push to `main`, on `windows-latest`
  with Node 24.15 and 26 (build, test, wrong-room, pack, repo-scan), and takes about two minutes. Pushing a PR
  branch before the PR exists triggers nothing. Session 54 waited for it before merging #104 (a
  platform-sensitive test) and merged #103 while it ran; both were green.

---

## §5 — Next session, exact sequence

- [ ] **1. Verify the tree.** Run §0.2's commands; the tree must match.
- [ ] **2. Settle §0.3.** Autonomy, SDD preflight through `AskUserQuestion`, Engram session. The Arena proof and
      the collaborator are settled by the first debate, which is step 3's scope debate.
- [ ] **3. PR-07 (docs).**
  - Debate the scope with the collaborator (`kind: PROPOSAL`, pointers, not pasted code); under Judgment Day
    replace the debate by a scope note (§4.1).
  - Fetch the current Claude Code channels documentation for the runbook's flags (§3.2).
  - Branch `f4/07-channel-docs`; `sdd-attempt acquire`; the native `sdd-apply` agent (fall back to a
    `general-purpose` writer if the hook blocks it).
  - Cold rebuild and full suite; `settle`; frozen-diff audit; RDD consent (the tier depends on the files, §4.3).
  - PR, wait for CI, rebase merge, post-merge rebuild and suite, then the docs-only commit that records it: the
    7.x marks plus the sync of the stale F4 artifacts (§3.2).
- [ ] **4. `sdd-verify`**, audited. Read `design.md`'s Testing Strategy rows first (§3.3).
- [ ] **5. `sdd-archive`**, audited. Mind the Windows move hazard and pointer integrity (§4.2). Forward the
      final-state facts for anything completed after the verify report.
- [ ] **6. Close the session.** Overwrite this file and carry §4.1's Judgment Day block forward (GOVERNANCE §3
      points to it). Add the session's entry at the top of `LOG.md` (newest first) and append its tribunal-index
      rows. Update the backlog rows (never delete one: mark it done or dropped with a pointer), the latest session
      row of the pending-decisions board in `00-INDEX.md`, the `AGENTS.md` status pointer and `WORK-PLAN.md`
      row 94. The F4 artifacts (`tasks.md`, `apply-progress.md`) are updated per merged slice and are frozen once
      `sdd-archive` has moved them. Then have the result audited.

---

## §6 — Do not redo

- F1, F2, F3 and F5 archives are closed. B-09 is closed. B-96 is closed.
- F4's five planning phases (session 50) are final. PR-01 to PR-06 and the follow-up PR 05e are merged: do not
  re-implement or re-debate them. The `CONSENSUS` debates of sessions 51-54 are indexed in the tribunal record;
  none is reopened.
- RDD lineages `review-39a0ff92bc18e85d` (PR-01), `review-15bbc1e2b034a77a` (retroactive PR-03/04/05a),
  `review-f22ebcffa06e871b` (05b), `review-7c68cd7c0744c817` (05c), `review-8d944602c30cc117` (05d),
  `review-4cab6b97f2871cfb` (05e) and `review-e4a866d023a3fc0f` (the session-54 docs close-out) are approved,
  acknowledged, authority burned. Do not re-review that code; their findings are in `apply-progress.md` and
  B-95. PR-06's review was declined by the Director and left no record.
- F4's design decisions D1-D12 stand except where `design.md`'s "Corrections found during apply" (items 1-7)
  says otherwise, and `tasks.md`'s PR-06 amendments (1)-(14) supersede the earlier PR-06 text. Reopening one
  needs new evidence, a written correction and the collaborator.
- Do not fix `WORK-PLAN.md`'s F4 Validation row (row 93) before PR-07 (§4.5).

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **Collaborator** | Alpha is out of token quota: settle it as §0.3 says (Alpha back, Betelgeuse, or an explicit Judgment Day instruction). | Director |
| **B-95** | Remainder of the RDD follow-ups: (d) the missing abort signal (design-exact, Alpha), `serve/fetch.ts:244-246`'s unguarded parse, and three non-blocking notes (a drifting count in a comment, `to` accepting any string, the silent skip of an unreadable row). (a), (b), (c), (e), (f) are done in `#103`. | Kairo (Director schedules) |
| **B-97** | `src/cli/main.ts:709-714`'s entry guard may silently do nothing behind a POSIX symlinked npm bin (not reproduced: Windows machine, `windows-latest` CI only). Verify on Linux or macOS, then use `import.meta.main`. | Director + Kairo |
| **B-98** | `stop()` does not await a tick in flight; a tick mid-`reconcile()` can start a poller after `stopAll()`. F1 core lifecycle code. | Director + Kairo |
| **B-99** | Three timer-based tests (`heartbeat` x2, `no-emission`) fail under CPU contention; replace the fixed waits by condition waits with a deadline. | Kairo (Director schedules) |
| **B-100** | Blind spots of the bundle-closure detectors: the shared `hasFsModuleReference` misses four import forms, and `computeClosure` follows relative specifiers only (a bare-specifier dependency that wrapped process spawning would evade the `child_process` substring). | Director + Kairo |
| **B-101** | GOVERNANCE §3 defines the Judgment Day substitute only for an Arena unreachable at a session's own start; a reachable Arena whose collaborator cannot answer (Alpha's quota, session 54) is not covered. | Director |
| **Every other open row** of `CHECKLIST.md` (read its Status column) | Carried unchanged. B-11, B-12 and B-16 still block F6's readiness, and B-97 is relevant to the macOS scope (D-40/D-47, designed on paper only, B-12). | Director |
| **Gemini CLI / Cursor doorbell capability** | Untested for B-09; not a blocker for F4. Low priority. | Director |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions).

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0 and `gentle-ai` 2.9.1 (both re-measured in session 54); shell is PowerShell primary
  with Bash (Git Bash) available. The machine has 24 logical CPUs; the B-96 and B-99 flakes need about 1x to 4x CPU
  oversubscription with busy loops to show.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`. Every `gh` command runs
  with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
  Force-push and deletion of `main` are blocked; there is no PR or status-check requirement (docs-only
  bookkeeping commits went straight to `main`, code went through PRs).
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**; cite as `path:line`. v1's
  `channel/index.ts` is the reference for the MCP `Server` construction and the notification call.
- `.mcp.json` points at the Arena bridge; never quote or commit its contents. `.claude/settings.json` is
  gitignored tooling. `prompt.txt` is gitignored (`*.txt`); `.arena/` is ignored only by this clone's
  `.git/info/exclude`, so a fresh clone would show it as untracked.
- `os.tmpdir()` resolves to an 8.3 short path under the user profile (`C:\Users\<USER>~1\...`).
- Stale local branches from F1 (`f1/19-telegram-client-p2`, `f1/21-room-guard-bindings`, `f1/22a-admission`,
  `f1/22b-poller`, `main-local`, `main-local-backlog`) are already merged or superseded; not this work's business
  to clean up. The F4 slice branches were deleted after each merge.
- The SDD preflight for this project is Automatic / Both (hybrid) / Auto (`stacked-to-main`), asked again every
  session.

---

## §9 — RDD state at session close

No candidate is under review and no authority is outstanding. Session 54: the follow-up PR `#103` was granted and
approved (lineage `review-4cab6b97f2871cfb`, two SUGGESTIONs filed under B-95); PR-06 `#104` was declined by the
Director; the documentation close-out was granted and approved (lineage `review-e4a866d023a3fc0f`, one SUGGESTION
left as is), and the later `HANDOFF.md` and `LOG.md` deltas closed as `low` with no question. Earlier candidates
and their tiers are in `LOG.md` and `apply-progress.md`; the lineages not to re-review are in §6. The next
candidate, PR-07, will be the next RDD question when its tier asks for one (§4.3).
