# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what the
> next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live in the
> ADRs and the tribunal index, never here.
>
> **Last rewritten: end of session 56** (2026-09-29). Everything below describes the state after it.

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** Unchanged since session 55. No SDD change is currently open. |
| What is next? | No queued SDD work. F6 (`f6-release-and-docs`, release/publish) is still the only planned next phase, still blocked on Director decisions (B-11 name clearance, B-12 macOS scope, B-16 license/legal docs) — see §3. **B-98 is closed (session 56). B-100(a) is closed (session 56); B-100(b) is scoped with concrete evidence and ready for a dedicated design-focused session** (§3, §7 — this is the recommended next start). |
| What must be settled before any work? | **Who audits.** Settle it as §0.3 says: Arena/Alpha status may have changed since this file was written (it was unreachable, MCP `ECONNREFUSED`, at the start of session 56, same as session 55). |
| What is the Director's to decide? | B-100(b)'s design (Director + Kairo, scoped, not blocked — a fresh session can just start it); the B-95 remainder (Kairo schedules); B-11, B-12, B-16 gate F6. |
| Where to read next | §0 first; then §3 (what's available, what's next) and §7 (open points) as the task needs. §4 and §8 are reference material — read only the parts a specific task touches. |

---

## §0 — Quick start

### 0.1 Prompt to paste

No specific task is queued. Paste this one, or state your own:

```text
Lee docs/08-sessions/HANDOFF.md y confirma Arena. B-100(a) ya cerró (session 56); arranca B-100(b)
(lista blanca de especificadores bare por bundle en computeClosure) con la evidencia ya reunida en
CHECKLIST.md — hoy no hay violación activa, es una decisión de diseño real, no una corrida a ciegas.
TDD estricto, tu criterio sobre el diseño del allow-list.
```

B-100(b) is deliberately the recommended start: it is the one item that is both scoped (§7, with
concrete evidence, not an open-ended "go investigate") and needs no Director decision to begin —
unlike F6, which is blocked on B-11/B-12/B-16 regardless of how much autonomy is delegated.

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
| 7 | `gentle-ai --version` | `3.7.0` or later; check fresh each session, do not trust this number to stay current |
| 8 | `npm run build && npm test` | exit 0; `1722 tests, 1716 pass, 0 fail, 6 skip` (session-56 close baseline; `test:static` 79/79) |

The working tree must be clean. If `git status` shows anything, stop and report before assuming it is safe.

### 0.3 Settle before any work

1. **Autonomy.** Confirm the opening prompt re-states full autonomy with the collaborator as judge; if
   it does not, ask one question.
2. **SDD Session Preflight and memory.** Run the preflight through `AskUserQuestion` (hard gate,
   re-asked every session; this project uses Automatic / Both / Auto). Start an Engram session
   (`mem_session_start` with `id` and `directory`) and pass its id to `mem_save`.
3. **Arena and collaborator.** Prove Arena reachable with a real `bridge_send`, never `curl`. Sessions
   55 and 56 both found the `arena` MCP server itself refusing to connect (`ECONNREFUSED`) at session
   start — a real tool-level failure that satisfies DN-09's substitute condition directly, with no
   B-101 waiver needed. If Arena is reachable this time, run one real debate as the probe and wait for
   the `[ARENA]` ping (do not poll; `LOG.md`'s prior entries have the detail, or the installed
   `judgment-day` skill for the substitute's operating detail). If the bridge itself fails, that's
   DN-09 directly: confirm with the failed real call, tell the Director, and use Judgment Day.

Then decide what to do (§3) with the Director.

### 0.4 Standing instructions from the Director

- **RDD consent is asked per candidate through `AskUserQuestion`; never answer it for the Director.**
  Recommend `granted`, and keep the provider's labels, order and tokens. Session 55: granted once,
  declined three times. **Session 56: granted once** (the retroactive review of session 55's tail —
  high tier, a real signal, not a heuristic false positive — see §9). When the tier is `medium` or
  `high`, check whether the evidence is a heuristic false positive and say so in the question —
  `openspec/changes/**` and `AGENTS.md` files consistently trip an `executable_change` heuristic that
  is almost always a false positive on prose; a `process_boundary`/`executable_change` signal in real
  `src/` code is usually genuine, as session 56's own two assessments both were.
- **`gentle-ai review status`/`start` can fail with a persistent `operation_timeout`** (schema
  `gentle-ai.review-integration.failure/v2`, `retry_safe: false`), unrelated to network or the
  candidate's content — session 55 hit this twice; **session 56 retried the same flow cleanly, no
  timeout at all**, confirming the defect is transient/intermittent, not permanent. Retry at most 2-3
  times; if it keeps failing, this is the mandatory Gentle AI defect-handoff trigger (ask the Director
  report/continue/stop once per distinct occurrence). Do not silently skip RDD without disclosing it,
  and do not loop on the retry.
- **A retroactive, already-committed range can be reviewed with `review assess --base-ref <last
  reviewed boundary> --committed-only --json`**, then the returned `next_transition.command` verbatim
  (STATUS → START → capture-result per lens, concurrently, in lens order → acknowledge-approved).
  Session 56 used this successfully to review session 55's uncommitted-RDD tail after the tool
  recovered — see §9 for the exact lineage and outcome, and the ODD protocol's own per-commit RDD
  step in the global config for the general mechanism (`review_due_reason`: `passive`, `under_budget`,
  `already_reviewed`, `high_risk`/`slice_budget_reached`).
- **`size:exception` is asked per PR**, after the collaborator's view on the frozen diff, with a
  recommendation. Not needed session 55 or 56 (no PR this session; direct-to-main work-unit commits).
- **Commit messages and PR descriptions carry no `Co-Authored-By` and no AI attribution**; conventional
  commits only. This overrides the harness's attribution reminder. Commit by work unit.
- **Docs commits.** Session-bookkeeping docs-only commits (recording a merged slice, closing a backlog
  row, the session close-out) go straight to `main`. A documentation *slice* that's a planned SDD
  deliverable goes through a branch, an audit and a PR.
- **`gentle-ai sync`** rewrites the machine's global `~/.claude/` and `~/.agents/` config when a
  `review status` call reports `managed_assets_outdated`. Expected, outside the repository, not
  something to second-guess or revert; just re-run the `review status`/`start` call after it
  completes. Did not happen this session (`gentle-ai` stayed at `3.7.0` throughout).
- **Never trust a delegated background agent's own `status`/`result` at face value for anything
  consequential.** Session 56 hit a real incident (§4.1): a `fork`'s task-notification claimed
  `completed` with a corrupted result and had, per `git log`/`git status`, done no actual work.
  Verify against the real repository state before reporting delegated work as done.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1, F2, F3, F4, F5 | **Archived**, unchanged this session. | `openspec/changes/archive/` |
| B-09, B-96 | Closed (sessions 50, 54). | `docs/06-backlog/CHECKLIST.md` |
| B-97, B-99, B-101 | Closed (session 55). | `docs/06-backlog/CHECKLIST.md` |
| **B-98** | **Closed, session 56.** Daemon `stop()`/heartbeat shutdown-ordering race. Fix `54f7d56`, backlog close `f0de180`. | `docs/06-backlog/CHECKLIST.md#B-98` |
| **B-100(a)** | **Closed, session 56.** `hasFsModuleReference` widened, verified safe (zero new bundle matches). Fix `599e984`. | `docs/06-backlog/CHECKLIST.md#B-100` |
| B-95 remainder, **B-100(b)** | Open, carried forward. **B-100(b) is scoped with concrete evidence**, ready for a dedicated session (§7). | `docs/06-backlog/CHECKLIST.md`, §7 below |
| Next SDD change | None queued. F6 (`f6-release-and-docs`) is next in `WORK-PLAN.md` but blocked on Director decisions (B-11, B-12, B-16). | `docs/07-plan/WORK-PLAN.md` (F6 section) |
| Tests on `main` | `npm test`: **1722 tests, 1716 pass, 0 fail, 6 skip** (session start: 1714/1708/0/6). Independently re-run by Kairo from a clean build at every commit, not just taken from a subagent's report. `test:static`: **79/79**. | — |
| RDD this session | Ran 7 times total (§9): retroactive session-55-tail review, B-98's full close-out cycle (found and fixed one real CRITICAL, one real timer leak), and B-100(a)'s own review. All approved/acknowledged. | §9 below |

---

## §2 — What session 56 did (context, not to redo; detail in `LOG.md`)

1. **Retroactive RDD on session 55's tail** (`dd464a7`, `24d7dc6`, `2aa0da0`): `gentle-ai review
   status`/`start` had recovered from the `operation_timeout` that blocked it twice in session 55.
   `review assess --base-ref 4ba4928 --committed-only` came back tier **high**
   (`process_boundary` in `src/cli/main.ts` — B-97's entry-guard change, a real signal, not the
   `AGENTS.md`/`openspec` prose false positive). Consent relayed via `AskUserQuestion`, Director
   granted. All 4 lenses (risk/resilience/readability/reliability) approved, zero blocking findings, 7
   informational advisories (mostly already self-disclosed in the code/docs). Lineage
   `review-72c122cea9dcb218` acknowledged, authority burned.
2. **B-98 closed**: `src/daemon/bootstrap.ts`'s `stop()` now awaits an in-flight heartbeat tick
   before `reconciler!.stopAll()`, and `BindingsReconciler` (`src/daemon/bindings.ts`) carries its own
   internal `stopping` guard as defense in depth — two mechanisms, one commit `54f7d56`, strict TDD
   (two new tests, genuine RED reproducing the exact `database is not open`/`ENOENT ... daemon.log`
   symptom before GREEN). Full suite and `test:static` both green, independently re-verified by Kairo
   from a clean rebuild — not just taken on the implementing subagent's report. Backlog row closed in
   `f0de180`. Work-unit RDD assessment: `under_budget` (193 lines), correctly deferred, not skipped.
3. **A subagent-reliability incident, disclosed rather than hidden**: the `fork` first delegated to
   implement B-98 reported `completed` with a corrupted `result` field (verbatim, unrelated text from
   Kairo's own prior conversation turn) and had, per direct `git log`/`git status` verification, done
   no real work — only a planning stub (`odd/tasks/b-98-daemon-shutdown-race.md`, deleted). A
   follow-up hook separately mis-fed the raw task-notification XML into a CodeGraph query, producing
   an irrelevant symbol dump (harmless, ignored). Resumed the same fork with corrected instructions;
   the second run delivered the real, verified fix. Feedback drafted and queued locally, not sent
   without Director approval.
4. **F6 deliberately left untouched**: needs Director-only decisions (B-11/B-12/B-16) no amount of
   delegated autonomy resolves.
5. **B-100(a) closed, B-100(b) scoped with evidence, both at the Director's explicit invitation to use
   judgment on whether to tackle it now or defer to a fresh session.** Investigated first (read-only):
   computed the real closures of `daemon/main.js` (71 files) and `client/main.js` (20 files) and
   confirmed widening `hasFsModuleReference` produces zero new bundle matches, and that neither closure
   currently contains a process-spawning bare-specifier dependency — this concretely de-risked (a) as
   safe and mechanical, and confirmed (b) is a forward-looking gap, not an active violation. Implemented
   (a) (commit `599e984`, strict TDD, seed tests placed in `client-bundle.test.ts` rather than
   `predicates.test.ts` since that file is AS-IS pinned to v1 and would have broken the provenance
   hash check). Left (b) for a dedicated session: it needs a real design decision (where a per-bundle
   allow-list lives), not a mechanical change, and the evidence gathered now means that session starts
   informed rather than blind. Full detail and evidence in `CHECKLIST.md`'s B-100 row.

---

## §3 — What's available now, and what's next

### 3.1 F1 through F5, all archived

Unchanged since session 55. `openspec/changes/archive/` holds five dated folders (F1 2026-09-26, F2
and F3 2026-09-27, F5 2026-09-28, F4 2026-09-29), each with its own `verify-report.md` and
`archive-report.md`. Canonical specs live under `openspec/specs/<capability>/spec.md`.

### 3.2 F4 as merged (`channel/`, for anything touching the adapter)

Unchanged since session 55 — full contract in `openspec/specs/channel-doorbell/spec.md`, operator
detail in `docs/runbooks/channel-doorbell.md`.

### 3.3 What's next

No SDD change is queued. Three paths, in the order a reasonable session would consider them:

1. **B-100(b)** (§7) — the recommended start. A good single-session ODD slice (same TDD discipline as
   SDD `apply`, tracked directly since it is not an open SDD change). No open-ended risk left to
   discover: session 56 already confirmed neither bundle closure currently contains a process-spawning
   bare-specifier dependency, so this is a real, bounded design task (where the allow-list lives, how
   the three bundle tests consume it), not a "might surface an unbounded mess" gamble anymore.
2. **F6** (`f6-release-and-docs`, release/publish) — blocked on three Director decisions: B-11
   (trademark clearance for "Conmuta"), B-12 (macOS scope), B-16 (license/legal docs remainder). Ask
   the Director for these before proposing `sdd-explore f6-release-and-docs`.
3. **Whatever the Director actually asks for.** This board is not a queue the Director must follow —
   ask what's next rather than assuming one of the above.

---

## §4 — Facts that will bite you

### 4.1 Audit and collaborators

- **A collaborator's or subagent's report can contain false or unverifiable claims; re-verify the
  concrete ones yourself.** Session 55: a `claude-code-guide` subagent's summary recommended a Claude
  Code flag that turned out wrong once independently `WebFetch`ed. **Session 56, a more severe case of
  the same lesson**: a background `fork`'s task-notification arrived `status: completed` with a
  `result` field that was not a report at all — it verbatim-echoed unrelated text from Kairo's own
  prior turn in the same conversation. Ground truth (`git log`/`git status`) showed the fork had done
  no real work, only written a planning stub. **Never trust a task-notification's `status`/`result` at
  face value for anything consequential** — check the actual repository state (`git log`, `git
  status`, the real diff, a real rebuild/test run) before reporting a delegated task as done. A
  related, separate hook defect surfaced in the same incident: a "UserPromptSubmit" hook fed the raw
  task-notification XML itself into a CodeGraph query as though it were a user prompt, producing
  irrelevant results — harmless (ignored), but worth recognizing this class of noise if it recurs.
- **Judgment Day** (the standing audit when Arena is unreachable, DN-09; or on the Director's explicit
  instruction for a reachable-but-unresponsive-collaborator case, GOVERNANCE §3's third paragraph,
  recorded as a DN-05 waiver each time). Skill `~/.agents/skills/judgment-day/SKILL.md`, formats in
  its `references/prompts-and-formats.md`. Two blind judges (`jd-judge-a`, `jd-judge-b`, model
  `sonnet`), an identical brief with every git/`gh`/test fact as ground truth (they have no shell), one
  JSON verdict each, merged and persisted (Engram, tribunal index). Only both-judge-confirmed CRITICAL
  findings get a bounded fix actor. Not invoked this session — B-98 was an ODD slice, matching the
  B-97/B-99/B-101 session-55 precedent of RDD-only review for non-SDD backlog fixes, and Kairo's own
  independent re-verification (real rebuild, real diff read, real test counts) covered the same
  ground a Judgment Day pass would add for a change already this mechanically well-scoped.
- **Pronouns**: refer to the Director by role, never a gendered pronoun.

### 4.2 SDD and writers, under gentle-ai 3.7.0

- **`gentle-ai` stayed at `3.7.0` this session** (upgraded from 2.9.1 mid-session-55). Check
  `--version` fresh each session; don't assume the number in an old HANDOFF is current.
- **`gentle-ai sdd-attempt` exposes only `grant`**; `acquire`, `settle`, `status`, `reset` are retired.
  Check `gentle-ai sdd-status <change> --cwd . --json` first — only call `sdd-attempt grant` if status
  reports `blocked(edit_authority_missing)` with a consent envelope, and only after the Director
  grants it.
- **Native `sdd-*` Agent dispatch was hook-blocked every time it was tried in sessions 44-50 and 55**
  (three separate refusals in session 55: "SDD child dispatch refused: parent-confirmed SDD preflight
  is missing, invalid, or uncorroborated"), matching sessions 44-50's pattern, not session 54's (which
  dispatched fine once). Not exercised this session (no SDD phase ran) — if it recurs, don't retry the
  native dispatch more than once per phase; go straight to a `general-purpose` agent with the same
  brief.
- **A generic `fork` delegation (not `sdd-*`) can also fail silently, a distinct defect from the
  hook-blocking above** — session 56's own incident (§4.1, §2). A `fork` is not exempt from the
  "verify before trusting" rule just because it inherits full context.
- **A writer scoped to a narrow task will correctly flag work outside its authorized scope** rather
  than silently doing or skipping it (session 55's archive writer). Read every disclosed gap in a
  sub-agent's final report before considering a phase done.
- **A writer's own report can contain small factual errors even when its actual file edits are
  correct** (session 55's archive writer mis-cited a PR range). Spot-check counts and ranges the same
  way you'd spot-check a collaborator's claim (§4.1).

### 4.3 RDD

- **`openspec/changes/**` and `AGENTS.md` files consistently trip an `executable_change` heuristic
  that reads as a false positive on prose** — every candidate touching those files in session 55 came
  back `medium` on that basis alone. **A `process_boundary`/`executable_change` signal in real `src/`
  code, by contrast, is usually genuine** — both of session 56's own assessments (the retroactive
  session-55-tail review: `process_boundary` in `src/cli/main.ts`; B-98's own work-unit:
  `executable_change` in `src/daemon/bindings.ts`) were real, substantive signals tied to actual
  control-flow changes, not prose false positives. Say so plainly in the RDD question either way, so
  the Director isn't left wondering.
- **`gentle-ai review status`/`start` can fail with a persistent, non-transient-looking
  `operation_timeout`** (`gentle-ai.review-integration.failure/v2`, `retry_safe: false`) while every
  other `gentle-ai` subcommand keeps working — session 55 hit this twice. **Session 56 retried the
  identical flow cleanly with no timeout at all**, so despite `retry_safe: false` in the failure
  envelope, the underlying condition is not permanent — retry 2-3 times in a fresh session before
  treating it as the defect-handoff trigger (§0.4).
- **The retroactive committed-only flow, worked end to end this session**: `review assess --cwd <repo>
  --agent claude-code --base-ref <last reviewed boundary> --committed-only --json` →
  `review_due`/`review_due_reason` → if due, run the returned `next_transition.command` verbatim
  (STATUS, `action: "start"`) → run the returned START command → if `consent_required`, relay via
  `AskUserQuestion` → run the exact chosen invocation → STATUS again (`action: "collect"`) →
  run every returned `review.capture-result` operation concurrently, in lens order → the final
  admitted capture's response carries `acknowledgement.command` when `state: "approved"` → run it
  verbatim, response confirms `authority: "burned"`. `under_budget`/`already_reviewed`/`passive`
  `review_due_reason`s mean no transaction starts at all — that is correct behavior, not a bug.
- **Candidate scoping and consent mechanics**: `review status`/`start` default to `workspace`
  projection (every uncommitted tracked file) when no `--base-ref`/`--committed-only` is given.
  `granted` at `medium`/`high` runs every selected lens; `declined` runs the exact `declined`
  invocation once and leaves no record.

### 4.4 Shell and test-run hygiene

- **MSYS/Windows shell.** PowerShell is default; Bash (Git Bash) is available through the Bash tool.
  `rm -rf`, `sed`, `grep -c` work there; they do not in PowerShell. A slow command can exceed the
  tool's default timeout and move to background — wait for its notification rather than polling.
- **`npm test` output**: summary lines start with `ℹ`, failing tests print `✖ name`. `dist/` staleness
  fakes results: `rm -rf dist` first. A full run takes roughly 10-40 seconds depending on machine
  load; session 56 saw ~9.5s cold.
- **`npm run test:static` prints benign Windows `reg.exe` stderr noise** ("El sistema no ha podido
  encontrar la clave o el valor del Registro especificados") around the wrong-room tests — not a
  failure, a known Windows-only quirk (same family as other timing/locale artifacts this project has
  already seen). Read the actual `ℹ tests`/`ℹ pass`/`ℹ fail` summary, not the interleaved stderr.
- **A condition-wait-with-deadline test helper already exists** (`waitForCondition(predicate,
  timeoutMs, intervalMs)`, in `test/daemon/main.test.ts`, `heartbeat.test.ts`, `no-emission.test.ts`):
  prefer it over a fixed `setTimeout` sleep whenever a test waits for an async condition under a
  deadline. B-98's own new bootstrap test used an equivalent inline barrier
  (`factoriesInFlight`-counter poll) for the same reason — deterministically forcing the race window
  instead of relying on timing luck.

### 4.5 Code and test facts

- **`import.meta.main` is the entry guard in both `channel/main.ts` and `src/cli/main.ts`** (B-97,
  closed session 55). Unchanged this session.
- **`stop()` now awaits an in-flight tick before stopping bindings (B-98, closed session 56)**.
  `src/daemon/bootstrap.ts`'s `stop()` tracks the currently-running tick's promise (`currentTick`,
  set alongside the pre-existing `ticking` overlap guard, cleared in the same `finally`) and awaits it
  between `heartbeat.stop()` and `reconciler!.stopAll()` — this is what actually prevents a
  tick-started poller from writing to (or erroring against) a database that `stop()` has since closed.
  `BindingsReconciler` (`src/daemon/bindings.ts`) separately carries its own internal `stopping` flag,
  set by `stopAll()` and checked in `reconcile()`'s add/update paths right after `createPoller`
  resolves — a poller that finishes creating after shutdown began is stopped inline, never registered;
  this makes the reconciler safe in isolation, independent of any caller's own discipline. Both
  mechanisms are needed; neither alone is enough (see the commit message on `54f7d56` for why). Two
  new tests, one per file, both reproduced the pre-fix symptom as genuine RED before going GREEN.
- **`hasFsModuleReference` now catches five import forms, not the original two (B-100a, closed session
  56)**: bare `import "node:fs"`, the unprefixed `"fs"` specifier, `node:fs/promises`, dynamic
  `import("node:fs")`, and unprefixed `require("fs")`. Verified before shipping that neither the
  daemon's 71-file nor the client's 20-file closure gains a new match. `client-bundle.test.ts`'s own
  `NODE_SQLITE_RE` has the same narrow shape, deliberately not widened (low priority — `node:sqlite`
  is already forbidden outright, so widening only tightens an already-zero-tolerance check).
- **`computeClosure` still follows relative specifiers only (B-100b, open, scoped)**: a bare-specifier
  dependency wrapping process spawning would evade the `child_process` substring check in all three
  bundle tests. Confirmed session 56: neither the daemon nor client closure currently contains such a
  dependency — see §7 for the full evidence and what remains a real design decision.
- **Timing-sensitive tests are condition-waits, not fixed sleeps (B-99, closed session 55)**.
  Unchanged this session.

### 4.6 Budgets and CI

- **Review budget**: 400 changed lines per PR/slice (added + deleted). B-98's own work-unit measured
  193, under budget (§9).
- **CI** (`.github/workflows/ci.yml`): every PR and every push to `main`, `windows-latest`, Node
  24.15 and 26, build + test + wrong-room + pack + repo-scan, about two minutes.

---

## §5 — Next session, exact sequence

- [ ] **1. Verify the tree.** Run §0.2's commands; the tree must match.
- [ ] **2. Settle §0.3.** Autonomy, SDD preflight through `AskUserQuestion`, Engram session, Arena
      status (it may have changed since this file was written).
- [ ] **3. Ask the Director what's next**, offering §3.3's paths (B-100(b) recommended, F6 pending its
      blocking decisions, or something else entirely) rather than assuming one.
- [ ] **4. If B-100(b) is chosen**: ODD (outside-SDD-discipline) slice — strict TDD still applies, no
      `tasks.md`/`apply-progress.md` to update; track progress in Engram and this file at close. Read
      `CHECKLIST.md`'s B-100 row first — the scope is already bounded by session 56's own evidence
      (neither bundle closure currently has a process-spawning bare-specifier dependency), so this is a
      real design task (where the allow-list lives, how the three bundle tests consume it), not a
      blind-risk investigation.
- [ ] **5. If F6 is chosen**: first get the Director's decisions on B-11, B-12 and B-16 (they gate the
      change's own scope), then propose `sdd-explore f6-release-and-docs` through the normal SDD entry
      routing (preflight → init guard → explore).
- [ ] **6. Before delegating any non-trivial implementation to a background agent**, budget time to
      verify its result against the real repository state (`git log`/`git status`/the actual diff, a
      real rebuild) rather than trusting its task-notification's own `status`/`result` fields —
      session 56's own incident (§4.1) is the concrete reason this is not paranoia.
- [ ] **7. Close the session.** Overwrite this file; add the session's entry at the top of `LOG.md`;
      add its tribunal-index row(s) if any audit ran; update the backlog rows touched (never delete
      one); update the pending-decisions board in `00-INDEX.md`; update `AGENTS.md`'s status pointer if
      it changed. Then have the result audited (Arena or Judgment Day per §0.3).

---

## §6 — Do not redo

- F1 through F5 archives are closed, including F4's (session 55). B-09, B-96 are closed.
- F4's seven implementation PRs (`#95`-`#105`) and its `sdd-verify`/`sdd-archive` are final: do not
  re-implement, re-debate, or re-review them. See `LOG.md`'s session-55 entry for the full RDD/tribunal
  lineage list — none of it is reopened.
- B-97, B-99, B-101 are closed (session 55). **B-98 is closed (session 56), commits `54f7d56` (the
  fix) and `d8bd7a7` (the RDD correction — see §9)** — do not re-implement either. B-102(a)(b)(c)(f)(g)
  remain open, disclosed follow-ups (§7); (d) and (e) are closed, folded into the same two commits.
- **B-100(a) is closed (session 56), commit `599e984`** — do not re-widen `hasFsModuleReference` again;
  it already catches all five known-missing forms, with seed tests (positive and negative) in
  `client-bundle.test.ts`. Do not add those seed tests to `predicates.test.ts` — it is AS-IS pinned to
  v1 (see the file's own header and `test/security/provenance.test.ts`).
- The retroactive RDD review of session 55's tail (`dd464a7`, `24d7dc6`, `2aa0da0`; lineage
  `review-72c122cea9dcb218`) and all four RDD lineages on B-98 itself (§9) are approved/acknowledged
  (one superseded before acknowledgement, §9) — do not re-review any of those commits again.
- Do not fix `WORK-PLAN.md`'s F4 Validation row (row 93) or SDD-change row (row 94) again — both are
  current as of session 55's docs-sync commit.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-95** | Remainder: (d) the missing abort signal (design-exact, Alpha-approved not to touch), `serve/fetch.ts:244-246`'s unguarded parse, and three non-blocking notes (a drifting comment count, `to` accepting any string, the silent skip of an unreadable row). | Kairo (Director schedules) |
| **B-100(b)** | `computeClosure` follows relative specifiers only, so a bare-specifier dependency wrapping process spawning (`cross-spawn`/`execa`-style) would evade the `child_process` check. **Scoped with evidence, session 56**: neither the daemon (71-file) nor client (20-file) closure today contains such a dependency — daemon's bare specifiers are `@napi-rs/keyring`, `node:{crypto,events,fs,http,os,path,sqlite}`, `zod`; client's are `@modelcontextprotocol/sdk/server/{mcp,stdio}.js`, `node:child_process` (the already-known, already-caught direct use in `client/spawn.js`), `node:{crypto,fs,os,path,url}`, `zod`. This is a forward-looking gap, not an active violation — the remaining work is a real design decision (where a per-bundle allow-list lives; how the three bundle tests consume it; whether `test/channel/main.test.ts`'s existing local-allow-list precedent generalizes), ready for a dedicated session, not a tail-end mechanical fix. Full detail: `CHECKLIST.md`'s B-100 row. | Director + Kairo |
| **B-102** | B-98's own RDD review, run 4 times as the candidate grew with each session-close edit: (d) the unbounded `currentTick` await escalated to CRITICAL on the 3rd pass and was fixed same-session (`STOP_TICK_TIMEOUT_MS` + `raceAgainstTimeout`, commit `d8bd7a7`); (e) that fix's own timer leak, found by the 4th pass, also fixed same-session (`clearTimeout` in a `finally`). Still open: (a) the `stopping` guard's update-binding branch is untested; (b) the bootstrap test's negative assertion still uses a fixed 60ms sleep (B-99-class anti-pattern); (c) the `stopping` latch is never reset (likely fine, undocumented); (f) a timed-out-then-later-resolving tick can still hit a closed database (the original B-98 symptom, narrowed); (g) a timed-out tick leaves no log/audit trace. Cheap wins at the next touch of these files — see `CHECKLIST.md`'s B-102 row for full detail. | Kairo |
| **Every other open row** of `CHECKLIST.md` (read its Status column) | Carried unchanged. B-11, B-12 and B-16 block F6's readiness (§3.3). | Director |
| **Gemini CLI / Cursor doorbell capability** | Untested for B-09; not a blocker. Low priority. | Director |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions).

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0, **`gentle-ai` 3.7.0** (unchanged this session — check `--version` fresh
  each session regardless, do not trust this number to stay current). Shell is PowerShell primary with
  Bash (Git Bash) available. 24 logical CPUs.
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
- **CodeGraph**: no `.codegraph/` index existed for this repo before session 56; initialized this
  session (`gentle-ai codegraph init --cwd <repo>`). Present and usable going forward — do not
  re-init; use `codegraph_explore` directly.

---

## §9 — RDD state at session close

Six lineages this session. Five acknowledged (authority burned); one (`review-52b3d48d4017231b`)
opened `correction_required` and was superseded by a fresh lineage once the fix was committed — it was
never acknowledged and holds no outstanding authority. None of the six is to be re-reviewed (§6):

1. **Retroactive review of session 55's tail** (`dd464a7`, `24d7dc6`, `2aa0da0` against base
   `4ba4928`): lineage `review-72c122cea9dcb218`, tier high, granted, all 4 lenses approved (zero
   blocking, 7 informational advisories), acknowledged.
2. **B-98's accumulated work-unit + session-close docs** (`54f7d56`+`f0de180`+`c07a7ea` against base
   `2aa0da0`, 704 lines, `slice_budget_reached`): lineage `review-5870e8e856f250ce`, tier medium,
   granted, approved with 3 advisories (folded into B-102 (a)(b)(c)), acknowledged.
3. **The same accumulation plus B-102's own filing commit** (`+2012df6`, 706 lines): a Stop hook caught
   this as a distinct target_identity — granted again, lineage `review-cd67b83acb023e0e`, tier medium,
   approved with 3 advisories (2 repeats, 1 new — B-102(d), the unbounded `currentTick` await),
   acknowledged.
4. **The same accumulation plus one more small B-102(d) doc edit** (`+eba0b5a`, 710 lines): granted a
   third near-identical time (disclosed to the Director as such), lineage `review-52b3d48d4017231b`,
   tier medium — this pass **escalated B-102(d) from WARNING to CRITICAL** and opened
   `correction_required`. Fixed same-session (`STOP_TICK_TIMEOUT_MS`, `raceAgainstTimeout`, committed
   as `d8bd7a7`), which changed the candidate's target_identity before this lineage's correction was
   ever validated — it was superseded, not acknowledged, by lineage 5.
5. **The corrected candidate** (`+d8bd7a7`, 865 lines, 13 files): granted, lineage
   `review-645745a82fbabaf1`, tier high (a security-relevant test file, `daemon-bundle.test.ts`, was
   touched), all 4 lenses approved (zero blocking, 11 informational advisories — the real one,
   `raceAgainstTimeout`'s own uncleared timer, fixed immediately same-session, not deferred; folded
   into B-102(e); the rest are B-102(f)(g) and reconfirmations of (a)(b)(c)), acknowledged.
6. **B-100(a)'s own fix** (`599e984` against base `d843e3e`, 2 files, 28 lines): granted, lineage
   `review-b56a350a1cf9cedb`, tier high (touches `test/security/client-bundle.test.ts` directly, a real
   signal). All 4 lenses approved, zero blocking, 4 informational advisories — two real and cheap
   (a "four forms" vs. the actual five count-mismatch in the doc comment/test title; the widened regex
   repeating its specifier sub-pattern four times), both fixed same-session in a follow-up commit
   alongside four new negative seeds the reliability lens also asked for. Acknowledged.

This file's own final edit (this paragraph, plus the B-100 documentation and the count-mismatch/seed
follow-up) and its commit are the true final session-close state — not retro-fitted further once
assessed; check `LOG.md`'s session-57 entry or the commit's own git log if a later RDD pass on this
exact commit matters.
