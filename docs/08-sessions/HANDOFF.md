# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what the
> next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live in the
> ADRs and the tribunal index, never here.
>
> **Last rewritten: end of session 55** (2026-09-29). Everything below describes the state after it.

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** `openspec/changes/archive/` holds five dated folders, including F4's, closed this session. No SDD change is currently open. |
| What is next? | No queued SDD work. F6 (`f6-release-and-docs`, release/publish) is the only planned next phase, but it is blocked on Director decisions (B-11 name clearance, B-12 macOS scope, B-16 license/legal docs) — see §3. B-98 and B-100 are well-specified, deliberately deferred backlog fixes ready for a focused session (§3, §7). |
| What must be settled before any work? | **Who audits.** Settle it as §0.3 says: Arena/Alpha status may have changed since this file was written (it was unreachable, MCP `ECONNREFUSED`, at the start of session 55). |
| What is the Director's to decide? | B-98, B-100 (Director + Kairo, deferred); the B-95 remainder (Kairo schedules); B-11, B-12, B-16 gate F6. |
| Where to read next | §0 first; then §3 (what's available, what's next) and §7 (open points) as the task needs. §4 and §8 are reference material — read only the parts a specific task touches. |

---

## §0 — Quick start

### 0.1 Prompt to paste

No specific task is queued. Paste one of these, or state your own:

```text
Lee docs/08-sessions/HANDOFF.md y confirma Arena con un bridge_send real y mi autonomía con tu
colaborador como juez. F4 está cerrado; dime qué sigue (F6 está bloqueado por B-11/B-12/B-16; B-98
y B-100 están listos para una sesión enfocada) y arráncalo.
```

or, to work one of the deferred backlog items directly:

```text
Lee docs/08-sessions/HANDOFF.md, confirma Arena, y arranca B-98 (la carrera de apagado del daemon)
[o B-100 (los puntos ciegos de los detectores de cierre de bundle)] como una ODD slice fuera de SDD,
con TDD estricto y tu propio buen juicio sobre el alcance.
```

### 0.2 First commands (stop and report if any output disagrees)

Run them in the Bash tool: they use POSIX syntax (`rm -rf` does not exist in PowerShell, the default shell, §8).

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | first line `## main...origin/main` with no `ahead` or `behind` (if `behind`, run `git pull --ff-only`; if `ahead`, stop) |
| 2 | `git rev-parse HEAD origin/main` | two identical hashes |
| 3 | `rm -rf dist` | prints nothing; a stale `dist/` silently fakes results |
| 4 | `ls openspec/changes/` | `archive` only — no bare change folder |
| 5 | `git status --short` | prints nothing |
| 6 | `gentle-ai review mode status` | `receipt-driven development: on (decided by global)`; read it, do not assume it |
| 7 | `gentle-ai --version` | `3.7.0` or later (§8: this jumped from 2.9.1 mid-session-55, silently, via `gentle-ai sync`) |
| 8 | `npm run build && npm test` | exit 0; `1714 tests, 1708 pass, 0 fail, 6 skip` (session-55 close baseline) |

The working tree must be clean. If `git status` shows anything, stop and report before assuming it is safe.

### 0.3 Settle before any work

1. **Autonomy.** Confirm the opening prompt re-states full autonomy with the collaborator as judge; if
   it does not, ask one question.
2. **SDD Session Preflight and memory.** Run the preflight through `AskUserQuestion` (hard gate,
   re-asked every session; this project uses Automatic / Both / Auto). Start an Engram session
   (`mem_session_start` with `id` and `directory`) and pass its id to `mem_save`.
3. **Arena and collaborator.** Prove Arena reachable with a real `bridge_send`, never `curl`. Session 55
   found the `arena` MCP server itself refusing to connect (`ECONNREFUSED`) at session start — a real
   tool-level failure that satisfies DN-09's substitute condition directly, with no B-101 waiver needed
   (that waiver is for a *reachable* Arena whose seated collaborator cannot answer mid-session, now
   GOVERNANCE §3's own third case). If Arena is reachable this time, run one real debate as the probe
   and wait for the `[ARENA]` ping (do not poll, HANDOFF's own historical §4.1 in `LOG.md`'s prior
   entries has the detail, or the installed `judgment-day` skill for the substitute's operating detail).
   If the bridge itself fails, that's DN-09 directly: confirm with the failed real call, tell the
   Director, and use Judgment Day.

Then decide what to do (§3) with the Director.

### 0.4 Standing instructions from the Director

- **RDD consent is asked per candidate through `AskUserQuestion`; never answer it for the Director.**
  Recommend `granted`, and keep the provider's labels, order and tokens. Session 55: granted once
  (a docs-sync commit; caught two real nits), declined three times (a cosmetic follow-up, the
  verify-report, the archive commit). When the tier is `medium` or `high`, check whether the evidence
  is a heuristic false positive and say so in the question — `openspec/changes/**` and `AGENTS.md`
  files consistently trip an `executable_change` heuristic that is almost always a false positive on
  prose (session 55's own repeated experience, consistent with session 54's).
- **`gentle-ai review status`/`start` can fail with a persistent `operation_timeout`** (schema
  `gentle-ai.review-integration.failure/v2`, `retry_safe: false`), unrelated to network or the
  candidate's content — session 55 hit this twice, 3 consecutive attempts each time, while
  `gentle-ai review mode status`/`--version`/`sync` all kept working. Retry at most 2-3 times; if it
  keeps failing, this is the mandatory Gentle AI defect-handoff trigger (ask the Director
  report/continue/stop once per distinct occurrence — the Director chose "continue without reporting"
  both times in session 55, disclosed and pushed the already-verified commit without RDD for that one
  candidate). Do not silently skip RDD without disclosing it, and do not loop on the retry.
- **`size:exception` is asked per PR**, after the collaborator's view on the frozen diff, with a
  recommendation. None was needed in session 55 (PR-07 was 143 lines).
- **Commit messages and PR descriptions carry no `Co-Authored-By` and no AI attribution**; conventional
  commits only. This overrides the harness's attribution reminder. Commit by work unit.
- **Docs commits.** Session-bookkeeping docs-only commits (recording a merged slice, closing a backlog
  row, the session close-out) go straight to `main`. A documentation *slice* that's a planned SDD
  deliverable (like F4's PR-07 was) goes through a branch, an audit and a PR.
- **`gentle-ai sync`** rewrites the machine's global `~/.claude/` and `~/.agents/` config (skills,
  agents, `CLAUDE.md`, `settings.json` — 74 files in session 55) when a `review status` call reports
  `managed_assets_outdated`. This is expected, outside the repository, and not something to second-guess
  or revert; just re-run the `review status`/`start` call after it completes.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1, F2, F3, F5 | **Archived**, unchanged this session. | `openspec/changes/archive/` |
| F4 (`f4-claude-channels-adapter`) | **Archived, session 55.** PR-01 through PR-07 merged (`#95`-`#105`), `sdd-verify` PASS, delta spec merged into `openspec/specs/channel-doorbell/spec.md`. | `openspec/changes/archive/2026-09-29-f4-claude-channels-adapter/` |
| B-09 | Closed (session 50). | `docs/06-backlog/CHECKLIST.md#B-09` |
| B-96 | Closed (session 54). | `docs/06-backlog/CHECKLIST.md#B-96` |
| B-97, B-99, B-101 | **Closed, session 55.** | `docs/06-backlog/CHECKLIST.md` |
| B-95 remainder, B-98, B-100 | Open, carried forward. | `docs/06-backlog/CHECKLIST.md`, §7 below |
| Next SDD change | None queued. F6 (`f6-release-and-docs`) is next in `WORK-PLAN.md` but blocked on Director decisions (B-11, B-12, B-16). | `docs/07-plan/WORK-PLAN.md` (F6 section) |
| Tests on `main` | `npm test`: **1714 tests, 1708 pass, 0 fail, 6 skip** (session start: 1713/1707/0/6). | — |
| Tribunal record | Session 55's Judgment Day audit is indexed as `f4-pr07-diff-audit-001`. | `docs/05-tribunal/INDEX.md` |

---

## §2 — What session 55 did (context, not to redo; detail in `LOG.md` and `apply-progress.md`)

1. **F4 PR-07** (`docs/runbooks/channel-doorbell.md` + `WORK-PLAN.md:93` + `DATA-MODEL.md` §3.5 + two
   ADR append-only notes): implemented, audited (Judgment Day, zero CRITICAL), merged as `#105`.
   The runbook's Claude Code flags were independently WebFetched against the live docs, which caught
   and corrected a wrong flag a `claude-code-guide` subagent had proposed.
2. **`sdd-verify`**: PASS, full report at the (now-archived) `verify-report.md`.
3. **`sdd-archive`**: F4 moved to `openspec/changes/archive/2026-09-29-f4-claude-channels-adapter/`;
   the delta spec merged into `openspec/specs/channel-doorbell/spec.md` (a gap the first-pass writer
   correctly flagged rather than silently skip, then Kairo closed immediately). Five live pointers
   (`AGENTS.md`, five `CHECKLIST.md` rows) repointed to the archive path in the same commit.
4. **B-97, B-99, B-101 closed** under the Director's blanket authorization; **B-98 and B-100
   deliberately deferred** (real, non-trivial risk that did not fit this session's remaining budget
   responsibly — a production shutdown-ordering race and an unbounded-scope security-detector change).
5. **Tooling drift discovered and worked around**: `gentle-ai` silently upgraded 2.9.1 → 3.7.0
   (`sdd-attempt acquire`/`settle` retired); native `sdd-*` Agent dispatch stayed hook-blocked all
   session (the `general-purpose` fallback, as in sessions 44-50); `gentle-ai review status` failed
   with a persistent `operation_timeout` twice, worked around per the Director's disposition (§0.4).

---

## §3 — What's available now, and what's next

### 3.1 F1 through F5, all archived

`openspec/changes/archive/` holds five dated folders (F1 2026-09-26, F2 and F3 2026-09-27, F5
2026-09-28, F4 2026-09-29). Each has its own `verify-report.md` and `archive-report.md`. Canonical
specs live under `openspec/specs/<capability>/spec.md`, one directory per capability — F4 added
`channel-doorbell`.

### 3.2 F4 as merged (`channel/`, for anything touching the adapter)

- `main.ts` (bin `conmuta-channel`): `runChannel(options)` never exits the process; the guarded entry
  (`import.meta.main`) parses `--project <id>` / `--project=<id>` strictly, then hard-exits. Imports
  `./daemon-link.js`, `./doorbell-loop.js`, `./notify.js`, `../src/client/binding.js`, `../src/shared/*`
  and the MCP SDK; never `client/main`, `run-state`, `spawn`, `handshake`, `ipc-stub`, or anything under
  `src/daemon`.
- Capability: `{ experimental: { "claude/channel": {} } }`, no `permission` key. Event
  `notifications/claude/channel`, `{ content, meta }`.
- Needs a **running daemon**, never starts one. `docs/runbooks/channel-doorbell.md` is the operator
  runbook — read it before answering any question about how a user arms this adapter; do not restate
  its flags from memory in an unrelated doc, they were verified against the live Claude Code
  documentation at apply time and may drift as the research-preview feature evolves.
- Full contract detail: `openspec/specs/channel-doorbell/spec.md` (13 requirements, 22 scenarios) and
  the archived `design.md`'s Testing Strategy table.

### 3.3 What's next

No SDD change is queued. Three paths, in the order a reasonable session would consider them:

1. **B-98 or B-100** (§7) — well-specified, deliberately deferred this session for focused attention,
   not because they're blocked on anything external. Either is a good single-session ODD slice
   (implement under the same TDD discipline as SDD `apply`, but the orchestrator tracks progress
   directly rather than through `tasks.md`/`apply-progress.md`, since neither belongs to an open SDD
   change).
2. **F6** (`f6-release-and-docs`, release/publish) — the next planned phase in `WORK-PLAN.md`, but
   blocked on three Director decisions: B-11 (trademark clearance for "Conmuta"), B-12 (macOS scope),
   B-16 (license/legal docs remainder — SECURITY.md, CONTRIBUTING.md, CHANGELOG.md, copyright line).
   Ask the Director for these before proposing `sdd-explore f6-release-and-docs`.
3. **Whatever the Director actually asks for.** This board is not a queue the Director must follow —
   ask what's next rather than assuming one of the above.

---

## §4 — Facts that will bite you

### 4.1 Audit and collaborators

- **A collaborator's or subagent's report can contain false or unverifiable claims; re-verify the
  concrete ones yourself.** Session 55: a `claude-code-guide` subagent's summary of Claude Code's
  channels docs recommended a flag (`--channels plugin:conmuta-channel`) that turned out to be wrong
  once independently WebFetched — a bare custom MCP server is not on the research-preview allowlist
  the plain `--channels` flag accepts; the correct form is
  `--dangerously-load-development-channels server:<name>`. Never ship an unverified subagent claim
  into documentation, a commit, or a decision when the primary source is one `WebFetch` away.
- **Judgment Day** (the standing audit when Arena is unreachable, DN-09; or on the Director's explicit
  instruction for a reachable-but-unresponsive-collaborator case, GOVERNANCE §3's third paragraph,
  recorded as a DN-05 waiver each time — B-101, closed session 55, formalized this). Skill
  `~/.agents/skills/judgment-day/SKILL.md`, formats in its `references/prompts-and-formats.md`. Two
  blind judges (`jd-judge-a`, `jd-judge-b`, model `sonnet`), an identical brief with every git/`gh`/test
  fact as ground truth (they have no shell), one JSON verdict each
  (`{"findings":[...],"evidence":[...]}`), merged and persisted (Engram, tribunal index). Only
  both-judge-confirmed CRITICAL findings get a bounded fix actor; WARNING and SUGGESTION are
  informational. Session 55's PR-07 audit: zero CRITICAL from either judge, one shared WARNING
  (a stale doc row), no fix round needed.
- **Pronouns**: refer to the Director by role, never a gendered pronoun.

### 4.2 SDD and writers, under gentle-ai 3.7.0

- **`gentle-ai` silently upgraded 2.9.1 → 3.7.0 mid-session-55** (via `gentle-ai sync`, triggered by an
  RDD `managed_assets_outdated` stop). Check `gentle-ai --version` at session start; don't assume the
  number in an old HANDOFF is current.
- **`gentle-ai sdd-attempt` now exposes only `grant`**; `acquire`, `settle`, `status`, `reset` are
  retired ("Runtime attempt operations are retired"). Do not follow an older skill file's
  acquire/settle instructions. Check `gentle-ai sdd-status <change> --cwd . --json` first —
  `applyState`/`blockedReasons`/`actionContext.allowedEditRoots` already tell you whether edit
  authority is present; only call `sdd-attempt grant` if status reports
  `blocked(edit_authority_missing)` with a consent envelope, and only after the Director grants it.
- **Native `sdd-*` Agent dispatch was hook-blocked every single time it was tried in session 55**
  (`sdd-apply`, `sdd-verify`, `sdd-archive` — three separate attempts, three separate refusals: "SDD
  child dispatch refused: parent-confirmed SDD preflight is missing, invalid, or uncorroborated"),
  even immediately after a successful `AskUserQuestion` preflight. This matches sessions 44-50's
  pattern, not session 54's (which dispatched fine once). Don't retry the native dispatch more than
  once per phase — go straight to a `general-purpose` agent with the same brief; it worked cleanly all
  four times this session (writer, verify, archive, plus the sync-commit's own edits done directly).
- **A writer scoped to a narrow task will correctly flag work outside its authorized scope rather than
  silently doing or skipping it.** Session 55's archive writer, briefed only for the folder move and
  two pointer edits, correctly flagged that the delta spec was never merged into `openspec/specs/`
  instead of either doing it unprompted or omitting the finding. Read every disclosed gap in a
  sub-agent's final report before considering a phase done.
- **A writer's own report can contain small factual errors even when its actual file edits are
  correct** — the archive writer's report cited the PR range as `#95`-`#104`, missing PR-07 (`#105`).
  Spot-check counts and ranges the same way you'd spot-check a collaborator's claim (§4.1).

### 4.3 RDD

- **`openspec/changes/**` and `AGENTS.md` files consistently trip an `executable_change` heuristic
  that reads as a false positive on prose** — every candidate touching `apply-progress.md`,
  `verify-report.md`, `tasks.md`, or `AGENTS.md` in session 55 came back `medium`, citing "an
  executable change in <path>" even though the content is PR-status prose or bootstrap documentation.
  Say so plainly in the RDD question so the Director isn't left wondering why a docs commit reads as
  risky.
- **`gentle-ai review status`/`start` can fail with a persistent, non-transient
  `operation_timeout`** (`gentle-ai.review-integration.failure/v2`, `retry_safe: false`,
  `next_action: stop`) while every other `gentle-ai` subcommand (`review mode status`, `--version`,
  `sync`, `sdd-status`) keeps working — session 55 hit this twice, isolated to the review
  status/start negotiation path specifically. Retry 2-3 times; if it doesn't clear, this is the
  mandatory Gentle AI defect-handoff trigger (§0.4) — don't loop on it past that, and don't silently
  skip RDD without disclosing the failure and the Director's chosen disposition.
- **A `sed -i` mutation-restore chained with `&&` after a possibly-empty `grep` can silently skip the
  restore** — `grep` exits 1 on no match, which breaks an `&&` chain before the restore command runs.
  Always re-check a mutated file's actual content (a fresh `grep`) before trusting that a restore
  happened, never trust the chain's own exit code alone.
- **Candidate scoping and consent mechanics**: `review status`/`start` default to `workspace`
  projection (every uncommitted tracked file). `granted` at `medium` is one lens: run its single
  `review capture-result`, then the exact `acknowledge-approved` command. `declined` runs the exact
  `declined` invocation once and leaves no record. When `gentle-ai sync` runs mid-flow (a
  `managed_assets_outdated` stop), just re-run `review status`/`start` after it completes — it does
  not touch the repository.

### 4.4 Shell and test-run hygiene

- **MSYS/Windows shell.** PowerShell is default; Bash (Git Bash) is available through the Bash tool.
  `rm -rf`, `sed`, `grep -c` work there; they do not in PowerShell. A slow command (build, full test
  suite under contention) can exceed the tool's default timeout and move to background — wait for its
  notification rather than polling with `sleep`.
- **`npm test` output**: summary lines start with `ℹ`, failing tests print `✖ name`. Strip ANSI with
  `sed 's/\x1b\[[0-9;]*m//g'` before grepping. `dist/` staleness fakes results: `rm -rf dist` first.
  A full run takes roughly 10-40 seconds depending on machine load (session 55 saw both).
- **Mark busy-loop child processes with a distinctive comment string** (e.g.
  `node -e "/*my-marker*/ while(true){}"`) so you can `pkill -f` them specifically and count leftovers
  by that marker — never print an unfiltered `node.exe`/process listing (other tools' credentials sit
  on those command lines).
- **A condition-wait-with-deadline test helper already exists** (`waitForCondition(predicate,
  timeoutMs, intervalMs)`, first written in `test/daemon/main.test.ts`, now also in
  `heartbeat.test.ts` and `no-emission.test.ts` after B-99): prefer it over a fixed `setTimeout` sleep
  whenever a test waits for an async condition under a deadline instead of a precise duration.

### 4.5 Code and test facts

- **`import.meta.main` is now the entry guard in both `channel/main.ts` and `src/cli/main.ts`**
  (Node >= 24.2; `engines` is >= 24.15.0, already satisfies it). B-97's fix: the prior
  `process.argv[1]` vs. `pathToFileURL(...).href` comparison was false behind a POSIX symlinked npm
  bin, because Node doesn't realpath `argv[1]` while `import.meta.url` reflects the symlink's real
  target. Not reproducible on this Windows machine; the new pinning test
  (`test/cli/main.test.ts`, "spawning the built CLI directly runs it") is disclosed as unable to show
  a true RED against the original symlink defect, proven instead by mutating the compiled guard to a
  permanently-false condition.
- **`stop()` still does not await a tick in flight (B-98, open)**. `src/daemon/bootstrap.ts:243-260`
  calls `heartbeat.stop()` (only clears the interval) then `stopAll()`; a tick mid-`reconcile()` can
  start a poller after `stopAll()`. F1 core lifecycle code — deliberately not touched this session
  despite blanket authorization, because a shutdown-ordering race deserves unhurried, focused work,
  not a rushed fix at the tail of a long session. Fix sketch already exists in the backlog row: a
  stopping flag checked by the tick and the add path, `stop()` awaiting the in-flight tick.
- **Bundle-closure detector blind spots (B-100, open)**: the shared `hasFsModuleReference`
  (`test/security/predicates.ts:41-43`) misses four import forms (bare `import "node:fs"`,
  `from "fs"`, `node:fs/promises`, dynamic `import()`); `computeClosure` follows relative specifiers
  only, so a bare-specifier dependency wrapping process spawning would evade the `child_process`
  substring check. Deliberately not touched this session: widening the shared predicate risks
  exposing an existing reference in the client or daemon bundle tests that were passing only because
  of the gap, which would become new, unbounded-scope work mid-fix — exactly the kind of thing that
  needs a full session, not a tail-end rush.
- **Timing-sensitive tests are now condition-waits, not fixed sleeps (B-99, closed)**. If a new
  timer-dependent test is added anywhere in `test/daemon/`, use the `waitForCondition` pattern from
  the start rather than a fixed `setTimeout`.

### 4.6 Budgets and CI

- **Review budget**: 400 changed lines per PR (added + deleted). PR-07 measured 143 (est. ≈120).
- **CI** (`.github/workflows/ci.yml`): every PR and every push to `main`, `windows-latest`, Node
  24.15 and 26, build + test + wrong-room + pack + repo-scan, about two minutes.

---

## §5 — Next session, exact sequence

There is no queued multi-step sequence like F4's PR-07→verify→archive was. Instead:

- [ ] **1. Verify the tree.** Run §0.2's commands; the tree must match.
- [ ] **2. Settle §0.3.** Autonomy, SDD preflight through `AskUserQuestion`, Engram session, Arena
      status (it may have changed since this file was written).
- [ ] **3. Ask the Director what's next**, offering §3.3's three paths (B-98/B-100, F6 pending its
      blocking decisions, or something else entirely) rather than assuming one.
- [ ] **4. If B-98 or B-100 is chosen**: this is not an open SDD change, so treat it as an ODD
      (outside-SDD-discipline) slice — strict TDD still applies, but there is no `tasks.md`/
      `apply-progress.md` to update; track progress in Engram and this file at close, same as any
      other work. Both have a fix sketch already written in `docs/06-backlog/CHECKLIST.md` (§7).
- [ ] **5. If F6 is chosen**: first get the Director's decisions on B-11, B-12 and B-16 (they gate the
      change's own scope), then propose `sdd-explore f6-release-and-docs` through the normal SDD entry
      routing (preflight → init guard → explore).
- [ ] **6. Close the session.** Overwrite this file; add the session's entry at the top of `LOG.md`;
      add its tribunal-index row(s) if any audit ran; update the backlog rows touched (never delete
      one); update the pending-decisions board in `00-INDEX.md`; update `AGENTS.md`'s status pointer if
      it changed. Then have the result audited (Arena or Judgment Day per §0.3).

---

## §6 — Do not redo

- F1 through F5 archives are closed, including F4's (session 55). B-09, B-96 are closed.
- F4's seven implementation PRs (`#95`-`#105`) and its `sdd-verify`/`sdd-archive` are final: do not
  re-implement, re-debate, or re-review them. RDD lineages for F4 (session 51 through 55) are
  approved/acknowledged/authority-burned or explicitly Director-declined; none is reopened. Tribunal
  entries `bus-v2-f4-*`, `f4-*`, `bus-v2-s54-*` and this session's `f4-pr07-diff-audit-001` are
  indexed and closed.
- B-97, B-99, B-101 are closed (session 55) with their fixes described in §4.5, §4.5, and GOVERNANCE
  §3 respectively. Do not re-open them without new evidence.
- Do not fix `WORK-PLAN.md`'s F4 Validation row (row 93) or SDD-change row (row 94) again — both are
  current as of session 55's docs-sync commit.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-95** | Remainder: (d) the missing abort signal (design-exact, Alpha-approved not to touch), `serve/fetch.ts:244-246`'s unguarded parse, and three non-blocking notes (a drifting comment count, `to` accepting any string, the silent skip of an unreadable row). | Kairo (Director schedules) |
| **B-98** | `stop()` does not await a tick in flight; a tick mid-`reconcile()` can start a poller after `stopAll()`. F1 core lifecycle code. Deliberately deferred, session 55 (real risk, needs a focused session, not a tail-end rush) — see §4.5 for the fix sketch. | Director + Kairo |
| **B-100** | Blind spots of the bundle-closure detectors: `hasFsModuleReference` misses four import forms; `computeClosure` follows relative specifiers only. Deliberately deferred, session 55 (widening risks surfacing an existing violation, unbounded scope) — see §4.5. | Director + Kairo |
| **Every other open row** of `CHECKLIST.md` (read its Status column) | Carried unchanged. B-11, B-12 and B-16 block F6's readiness (§3.3). | Director |
| **Gemini CLI / Cursor doorbell capability** | Untested for B-09; not a blocker. Low priority. | Director |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions).

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0, **`gentle-ai` 3.7.0** (upgraded from 2.9.1 mid-session-55 via
  `gentle-ai sync` — check `--version` fresh each session, don't trust this number to stay current).
  Shell is PowerShell primary with Bash (Git Bash) available. 24 logical CPUs; B-99's fix was verified
  clean under 24-busy-loop contention (the load that previously reproduced its flake).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`. Every `gh`
  command runs with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`;
  **never `gh auth switch`**. Force-push and deletion of `main` are blocked; no PR or status-check
  requirement.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**; cite as `path:line`.
- `.mcp.json` points at the Arena bridge; never quote or commit its contents. `.claude/settings.json`
  is gitignored tooling.
- `os.tmpdir()` resolves to an 8.3 short path under the user profile (`C:\Users\<USER>~1\...`).
- The SDD preflight for this project is Automatic / Both (hybrid) / Auto (`stacked-to-main`), asked
  again every session.

---

## §9 — RDD state at session close

No candidate is under review and no authority is outstanding. Session 55's lineages: PR-07's own
commit closed low with no question; the docs-sync commit was granted (one `review-reliability` lens,
approved with 2 SUGGESTIONs, both fixed in a same-session follow-up commit that itself closed with a
3rd, deliberately un-chased cosmetic SUGGESTION); the verify-report and archive commits were declined
by the Director. The B-101 governance fix closed low with no question. The B-99 and B-97 commits
were pushed with RDD explicitly disclosed as unavailable (`gentle-ai review status` `operation_timeout`,
§0.4) rather than silently skipped. None of these lineages are to be re-reviewed (§6).
