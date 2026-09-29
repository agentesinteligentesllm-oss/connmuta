# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what
> the next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live
> in the ADRs and the tribunal index, never here.
>
> **Last rewritten: end of session 58** (2026-09-29). Everything below describes the state after it.

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** Unchanged since session 55. No SDD change is currently open. |
| What is next? | No queued work at all. **B-103 is fully closed** (session 58, both remaining entry points). F6 (`f6-release-and-docs`, release/publish) is still the only planned next phase, still blocked on Director decisions (B-11 name clearance, B-12 macOS scope, B-16 license/legal docs) — see §3. |
| What must be settled before any work? | **Who audits.** Settle it as §0.3 says: Arena/Alpha status may have changed since this file was written (it was unreachable, MCP `ECONNREFUSED`, at the start of session 58, same as sessions 55-57). |
| What is the Director's to decide? | The B-95 remainder and B-102's residual items (Kairo schedules); B-11, B-12, B-16 gate F6; nothing from B-103 needs a decision, it is closed. |
| Where to read next | §0 first; then §3 (what's next) and §7 (open points) as the task needs. §4 and §8 are reference material — read only the parts a specific task touches. |

---

## §0 — Quick start

### 0.1 Prompt to paste

No specific task is queued. Paste this one, or state your own:

```text
Lee docs/08-sessions/HANDOFF.md y confirma Arena. B-103 ya cerró (session 58, ambos consumidores).
No hay trabajo en cola — pregúntame qué sigue: B-95/B-102 residuales, las decisiones que bloquean F6
(B-11/B-12/B-16), o algo distinto.
```

There is no "recommended start" this time — the backlog's cheap, unblocked wins (B-100(b), B-103) are
both done. What remains either needs a Director decision (F6's three blockers) or is a low-priority
cheap-win-at-next-touch item (B-95 remainder, B-102 residuals) with no urgency of its own. Ask.

### 0.2 First commands (stop and report if any output disagrees)

Run them in the Bash tool: they use POSIX syntax (`rm -rf` does not exist in PowerShell, the default shell, §8).

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | first line `## main...origin/main` — session 58 ended with local `ahead 20` of `origin` (direct-to-main work-unit commits, not yet pushed); if `behind`, run `git pull --ff-only` |
| 2 | `rm -rf dist` | prints nothing; a stale `dist/` silently fakes results |
| 3 | `ls openspec/changes/` | `archive` only — no bare change folder |
| 4 | `git status --short` | prints nothing (after removing any scratch files you created — see §4.6) |
| 5 | `gentle-ai review mode status` | `receipt-driven development: on (decided by global)`; read it, do not assume it |
| 6 | `gentle-ai --version` | `3.7.0` or later; check fresh each session, do not trust this number to stay current |
| 7 | `npm run build && npm test` | exit 0; `1738 tests, 1732 pass, 0 fail, 6 skip` (session-58 close baseline; `test:static` 93/93) |

The working tree must be clean. If `git status` shows anything, stop and report before assuming it is safe.

### 0.3 Settle before any work

1. **Autonomy.** Confirm the opening prompt re-states full autonomy with the collaborator as judge; if
   it does not, ask one question.
2. **SDD Session Preflight and memory.** Only relevant if SDD work is actually chosen (see §3) — a plain
   ODD backlog slice does not need it. Start an Engram session
   (`mem_session_start` with `id` and `directory`) regardless, and pass its id to `mem_save`.
3. **Arena and collaborator.** Prove Arena reachable with a real `bridge_send`, never `curl`. Sessions
   55 through 58 all found the `arena` MCP server itself refusing to connect (`ECONNREFUSED`) at session
   start — a real tool-level failure that satisfies DN-09's substitute condition directly, with no
   B-101 waiver needed. If Arena is reachable this time, run one real debate as the probe and wait for
   the `[ARENA]` ping (do not poll; `LOG.md`'s prior entries have the detail, or the installed
   `judgment-day` skill for the substitute's operating detail). If the bridge itself fails, that's
   DN-09 directly: confirm with the failed real call, tell the Director, and use Judgment Day.

Then decide what to do (§3) with the Director.

### 0.4 Standing instructions from the Director

- **RDD consent is asked per candidate through `AskUserQuestion`; never answer it for the Director.**
  Recommend `granted`, and keep the provider's labels, order and tokens. Session 58: granted twice
  (both approved eventually; see §4.7 for a new terminal-stop wrinkle on the first lineage, not a
  decline).
- **The "selectorless" Stop-hook review chain tracks its own base independently of the
  `review assess --base-ref <boundary> --committed-only`-driven flow this project's ODD protocol uses**
  (§4.6). Not observed firing session 58 (no Stop-hook trigger this session), but it was still
  unresolved as of session 57's close (anchored at `2aa0da0`, pre-B-98) and may still be — check
  `gentle-ai review status --cwd <repo> --contract gentle-ai.review-integration/v2 --agent claude-code
  --next-transition` early if the Stop hook fires. **Recognize this pattern by its shape, not by a
  specific lineage id** — a fresh lineage id is minted every time the candidate grows. The shape:
  `base_ref` is `2aa0da0...`, risk evidence cites `test/security/*.test.ts`, and if it reaches
  `correction_required` the finding is `R4-stalled-tick-closed-db` in
  `src/daemon/bootstrap.ts`/`bindings.ts` — that is B-102(f) again, not a new bug. See §7's B-102 row
  before treating it as urgent, unrelated work.
- **A retroactive, already-committed range can be reviewed with `review assess --base-ref <last
  reviewed boundary> --committed-only --json`**, then the returned `next_transition.command` verbatim
  (STATUS → START → capture-result per lens, concurrently, in lens order → acknowledge-approved). Used
  successfully session 58 for its own two lineages (§4.7, §9). Remove any uncommitted scratch file
  before running STATUS — an untracked file in the workspace projection forces an
  `intended_untracked_selection` detour (§4.6) — this session's own `odd/tasks/b-103-*.md` (untracked
  until this close-out) required `--untracked-scope=exclude --expected-untracked-inventory=<sha>` on
  every `assess`/`status`/`start` call while it stayed untracked.
- **A `correction_required` outcome can legitimately hit a terminal `captured_artifacts_unverifiable`
  stop on one lineage, then succeed cleanly on a near-identical later lineage — see §4.7, new this
  session.** Do not assume a docs-only correction is fundamentally broken just because one attempt
  terminated; retry the same edit→commit→capture-correction-plan→status sequence on the next lineage
  before concluding it is a systemic defect.
- **`size:exception` is asked per PR**, after the collaborator's view on the frozen diff, with a
  recommendation. Not needed session 55 through 58 (no PR any of those sessions; direct-to-main
  work-unit commits).
- **Commit messages and PR descriptions carry no `Co-Authored-By` and no AI attribution**; conventional
  commits only. This overrides the harness's attribution reminder. Commit by work unit.
- **Docs commits.** Session-bookkeeping docs-only commits (recording a merged slice, closing a backlog
  row, the session close-out) go straight to `main`. A documentation *slice* that's a planned SDD
  deliverable goes through a branch, an audit and a PR.
- **`gentle-ai sync`** rewrites the machine's global `~/.claude/` and `~/.agents/` config when a
  `review status` call reports `managed_assets_outdated`. Expected, outside the repository, not
  something to second-guess or revert; just re-run the `review status`/`start` call after it
  completes. Did not happen session 58 (`gentle-ai` stayed at `3.7.0` throughout).
- **Never trust a delegated background agent's own `status`/`result` at face value for anything
  consequential.** Session 56 hit a real incident (§4.1): a `fork`'s task-notification claimed
  `completed` with a corrupted result and had, per `git log`/`git status`, done no actual work.
  Session 58 hit the same pattern once more on its own mapping fork's *first* notification (garbled,
  2 tool calls, 20s) — resumed rather than discarded, and the resumed report was accurate and
  independently re-verified (11 tool calls, 290s). Verify either way, don't assume either outcome, and
  don't assume a bad first result means the underlying work is unrecoverable — resuming is cheap.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1, F2, F3, F4, F5 | **Archived**, unchanged this session. | `openspec/changes/archive/` |
| B-09, B-96 | Closed (sessions 50, 54). | `docs/06-backlog/CHECKLIST.md` |
| B-97, B-99, B-101 | Closed (session 55). | `docs/06-backlog/CHECKLIST.md` |
| B-98 | Closed, session 56. Daemon `stop()`/heartbeat shutdown-ordering race. Fix `54f7d56`. | `docs/06-backlog/CHECKLIST.md#B-98` |
| B-100(a) | Closed, session 56. `hasFsModuleReference` widened, verified safe. Fix `599e984`. | `docs/06-backlog/CHECKLIST.md#B-100` |
| B-100(b) | Closed, session 57, for the daemon, client and channel bundles. Commits `47bcd00`, `5122e20`, `737a8b8`. | `docs/06-backlog/CHECKLIST.md#B-100` |
| **B-103** | **Closed, session 58, for both remaining consumers.** `installer-bundle.test.ts`'s CLI/DOCTOR/OFFLINE entries (commit `06d31eb`) and `session-exchange.test.ts`'s two entries (commit `2a579b9`); two RDD-found doc-staleness corrections (`d620320`, `726acd1`). All 5 entry points now evidenced and enforced, no live violation anywhere. | `docs/06-backlog/CHECKLIST.md#B-103` |
| B-95 remainder, B-102 residual items | Open, carried forward, no urgency of their own — cheap wins at the next touch of these files (§7). | `docs/06-backlog/CHECKLIST.md`, §7 below |
| Next SDD change | None queued. F6 (`f6-release-and-docs`) is next in `WORK-PLAN.md` but blocked on Director decisions (B-11, B-12, B-16). | `docs/07-plan/WORK-PLAN.md` (F6 section) |
| Tests on `main` | `npm test`: **1738 tests, 1732 pass, 0 fail, 6 skip** (session start: 1732/1726/0/6). Independently re-run by Kairo from a clean build at every commit. `test:static`: **93/93**. | — |
| RDD this session | Ran twice, both eventually `approved`/acknowledged (§4.7, §9): the first lineage hit a terminal `captured_artifacts_unverifiable` stop after its own correction was committed (a new, not-previously-seen failure shape, left unacknowledged, no authority over anything) and was not chased further; the second lineage (opened after the next commit) hit the same-shaped finding and this time resolved cleanly end to end. | §9 below |

---

## §2 — What session 58 did (context, not to redo; detail in `LOG.md`)

1. **Confirmed Arena unreachable** (`ECONNREFUSED` at MCP connection, same real tool-level failure as
   sessions 55-57) — DN-09's substitute condition satisfied directly.
2. **Confirmed B-100(b) closed** for daemon/client/channel per session 57's own record; nothing to redo.
3. **Mapping (a fork, resumed once) computed the real bare-specifier sets for all 5 of B-103's entry
   points before any code was written**, per the Director's explicit instruction. The fork's first
   completion notification was garbled and unrelated to the task (2 tool calls, 20s — a session-56-style
   corrupted-report incident); resumed via `SendMessage` instead of discarded or redone from scratch,
   and its second report was detailed and accurate (11 tool calls, 290s). Independently re-verified
   every number with a direct script against the built `dist/` — both sources agreed exactly on file
   counts and bare-specifier sets for `cli/main.js` (71 files, 15 specifiers), `doctor/main.js` (32,
   11), `doctor/offline.js` (28, 11, identical values to `doctor/main.js` — a coincidence, not a
   guarantee), `client/run-file.js` (2, 3) and `client/session-exchange.js` (8, 5). Every non-builtin
   specifier cross-checked against `package.json`'s 6 declared dependencies — exact match, nothing
   unreviewed. No live violation anywhere, same outcome as B-100(b).
4. **Design (my judgment, per the Director's explicit delegation)**: reused `bareSpecifiers`/
   `computeClosure` from `closure.ts` unchanged — no signature change needed. `installer-bundle.test.ts`
   got 3 separate constants (`ALLOWED_CLI_BARE_SPECIFIERS`, `ALLOWED_DOCTOR_BARE_SPECIFIERS`,
   `ALLOWED_OFFLINE_BARE_SPECIFIERS`) + 3 separate tests + a small local `bareSpecifiersOf()` helper,
   mirroring the file's own precedent of never merging CLI/DOCTOR's separate allow-lists even where
   values could coincide. `session-exchange.test.ts` got one new test extending its existing
   loop-shaped idiom, with a small per-entry lookup object rather than a unioned list.
5. **Strict TDD, two work-unit commits for the code, both green**: `06d31eb` (installer/doctor's three
   allow-lists — RED against a deliberately empty array showed the real diff matching the
   already-computed values exactly, then GREEN); `2a579b9` (session-exchange's two entries, same
   discipline). Full suite green throughout (1738 tests, 1732 pass, 0 fail, 6 skip; `test:static`
   93/93, up from session-57's 89/89 by exactly the 4 new installer/doctor tests).
6. **RDD ran twice, disclosing a new process finding (§4.7)**: the first lineage
   (`review-688b995abb754a4c`, granted, base `737a8b8`) correctly found `CHECKLIST.md`/`HANDOFF.md`
   describing all 5 B-103 entry points as unevidenced when the just-committed code already enforced 3
   of them (installer/doctor). The correction was captured, committed (`d620320`), and re-checked — but
   instead of progressing to `targeted_validation_required`, the lineage terminated with
   `captured_artifacts_unverifiable`, a documented terminal stop with no further recovery path available
   to a non-maintainer. Left `correction_required`, unacknowledged, no authority over anything;
   disclosed to the Director rather than chased. The second lineage (`review-7f532587be32a283`,
   granted, opened fresh after the session-exchange commit, same base `737a8b8`) hit the identical-shaped
   finding once more (this time about the *second* correction's own now-stale "session-exchange remains
   open" claim) and, using the exact same edit→commit→capture-correction-plan→status sequence, progressed
   cleanly through `targeted_validation_required` to `approved`, acknowledged, authority burned. Two
   non-blocking advisory WARNINGs surfaced on the final pass and were disclosed, not acted on (see §4.7).
7. **Documentation updated as the task affected it**: `CHECKLIST.md`'s B-103 row (closed, twice revised
   as RDD found it stale against the shipping code each time); `AGENTS.md`'s status pointer; this file;
   `LOG.md`'s new session-58 entry; ODD task file `odd/tasks/b-103-bare-specifier-closure-gaps.md`
   completed.

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

No SDD change is queued, and the two backlog items that had a ready-to-start, no-decision-needed shape
(B-100(b), B-103) are both closed. Two paths remain:

1. **F6** (`f6-release-and-docs`, release/publish) — blocked on three Director decisions: B-11
   (trademark clearance for "Conmuta"), B-12 (macOS scope), B-16 (license/legal docs remainder). Ask
   the Director for these before proposing `sdd-explore f6-release-and-docs`.
2. **Whatever the Director actually asks for.** The remaining backlog rows (B-95 remainder, B-102
   residuals) are explicitly low-priority "cheap win at the next touch of these files" items, not a
   queue to work through on their own — ask what's next rather than assuming one of the above.

---

## §4 — Facts that will bite you

### 4.1 Audit and collaborators

- **A collaborator's or subagent's report can contain false or unverifiable claims; re-verify the
  concrete ones yourself.** Session 56's own incident (a `fork`'s task-notification claimed
  `completed` with a corrupted, unusable `result`, ground truth showed no real work) remains the
  cautionary example. **Session 57's own mapping fork delivered accurate, independently verified
  findings; session 58's mapping fork's *first* notification was garbled (2 tool calls, 20s) but its
  *resumed* second attempt was accurate and independently re-verified (11 tool calls, 290s)** — verify
  either way, and don't assume a bad first result means the work can't be recovered; resuming via
  `SendMessage` is cheap and worked cleanly.
- **Judgment Day** (the standing audit when Arena is unreachable, DN-09; or on the Director's explicit
  instruction for a reachable-but-unresponsive-collaborator case, GOVERNANCE §3's third paragraph,
  recorded as a DN-05 waiver each time). Skill `~/.agents/skills/judgment-day/SKILL.md`, formats in
  its `references/prompts-and-formats.md`. Not invoked session 57 or 58 — both were ODD slices,
  mechanically well-scoped, matching the B-98/B-100(a) precedent of RDD-only review for non-SDD backlog
  fixes.
- **Pronouns**: refer to the Director by role, never a gendered pronoun.

### 4.2 SDD and writers, under gentle-ai 3.7.0

- **`gentle-ai` stayed at `3.7.0` this session.** Check `--version` fresh each session; don't assume
  the number in an old HANDOFF is current.
- **`gentle-ai sdd-attempt` exposes only `grant`**; `acquire`, `settle`, `status`, `reset` are retired.
  Check `gentle-ai sdd-status <change> --cwd . --json` first — only call `sdd-attempt grant` if status
  reports `blocked(edit_authority_missing)` with a consent envelope, and only after the Director
  grants it.
- **Native `sdd-*` Agent dispatch has a history of hook-blocking** in sessions 44-50 and 55. Not
  exercised sessions 56-58 (no SDD phase ran) — if it recurs, don't retry the native dispatch more
  than once per phase; go straight to a `general-purpose` agent with the same brief.
- **This project's own convention is direct implementation by Kairo, not delegation, for non-trivial
  writes** (`AGENTS.md`: "One writer of the tree: Kairo"). A generic `fork`/background-agent delegation
  can fail silently or fabricate a result (session 56's own incident, §4.1) — reserve delegation for
  read-only exploration/mapping (used successfully sessions 57 and 58) and for the audit role, not for
  hands-on TDD implementation of security-sensitive test code.
- **A writer's own report can contain small factual errors even when its actual file edits are
  correct** (session 55's archive writer mis-cited a PR range). Spot-check counts and ranges the same
  way you'd spot-check a collaborator's claim (§4.1).
- **AS-IS vs. SEAM provenance pinning is not obvious from a file's own content alone.** `predicates.ts`
  is SEAM (implementation may diverge from v1, with a "Changes" note); its own dedicated test file
  `predicates.test.ts` is AS-IS (frozen, exact v1 body-hash match, checked by
  `test/security/provenance.test.ts`) — new tests for a changed/added `predicates.ts` function go in a
  bundle test file instead (B-100(a)'s precedent). Always check `test/fixtures/v1-provenance.json` and
  a file's own header comment before editing any `test/security/*.ts` file. `closure.ts`,
  `closure.test.ts`, all four bundle test files and `installer-bundle.test.ts` carry **no** v1-provenance
  entry — freely editable, confirmed by direct grep sessions 57 and 58.

### 4.3 RDD

- **`openspec/changes/**` and `AGENTS.md` files consistently trip an `executable_change` heuristic
  that reads as a false positive on prose** — every candidate touching those files in session 55 came
  back `medium` on that basis alone. **A `process_boundary`/`executable_change`/`hot_path`/
  `process_boundary` signal in real `src/` or `test/security/` code, by contrast, is usually genuine** —
  sessions 56 through 58 all saw real, substantive signals tied to actual security-detector or
  control-flow changes, not prose false positives (session 58: `test/security/*.test.ts` and
  `test/client/session-exchange.test.ts` touched directly, tier `high`, both times a real signal per
  B-100(a)'s own precedent). Say so plainly in the RDD question either way, so the Director isn't left
  wondering.
- **`gentle-ai review status`/`start` can fail with a persistent, non-transient-looking
  `operation_timeout`** (`gentle-ai.review-integration.failure/v2`, `retry_safe: false`) while every
  other `gentle-ai` subcommand keeps working — session 55 hit this twice; sessions 56-58 saw no
  recurrence at all — retry 2-3 times in a fresh session before treating it as the defect-handoff
  trigger (§0.4).
- **The retroactive committed-only flow, used twice more this session, end to end**: `review assess
  --cwd <repo> --agent claude-code --base-ref <last reviewed boundary> --committed-only --json` →
  `review_due`/`review_due_reason` → if due, run the returned `next_transition.command` verbatim
  (STATUS, `action: "start"`) → run the returned START command → if `consent_required`, relay via
  `AskUserQuestion` → run the exact chosen invocation → STATUS again (`action: "collect"`) →
  run every returned `review.capture-result` operation concurrently, in lens order → the final
  admitted capture's response carries `acknowledgement.command` when `state: "approved"` → run it
  verbatim, response confirms `authority: "burned"`. **New this session: a `correction_required`
  outcome adds `capture-correction-plan` (declare a line count) → re-check STATUS → either
  `targeted_validation_required` (run `capture-validation --execute=true`, which itself resolves to
  `approved`/acknowledge, or to a fresh `correction_required` round) or a terminal stop — see §4.7.**
- **Candidate scoping and consent mechanics**: `review status`/`start` default to `workspace`
  projection (every uncommitted tracked file) when no `--base-ref`/`--committed-only` is given.
  `granted` at `medium`/`high` runs every selected lens; `declined` runs the exact `declined`
  invocation once and leaves no record.

### 4.4 Shell and test-run hygiene

- **MSYS/Windows shell.** PowerShell is default; Bash (Git Bash) is available through the Bash tool.
  `rm -rf`, `sed`, `grep -c` work there; they do not in PowerShell. A slow command can exceed the
  tool's default timeout and move to background — wait for its notification rather than polling.
- **`npm test` output**: summary lines start with `ℹ`, failing tests print `✖ name`. `dist/` staleness
  fakes results: `rm -rf dist` first. A full run takes roughly 10-40 seconds depending on machine load.
- **`npm run test:static` prints benign Windows `reg.exe` stderr noise** ("El sistema no ha podido
  encontrar la clave o el valor del Registro especificados") around the wrong-room tests — not a
  failure, a known Windows-only quirk. Read the actual `ℹ tests`/`ℹ pass`/`ℹ fail` summary, not the
  interleaved stderr.
- **A condition-wait-with-deadline test helper already exists** (`waitForCondition(predicate,
  timeoutMs, intervalMs)`, in `test/daemon/main.test.ts`, `heartbeat.test.ts`, `no-emission.test.ts`):
  prefer it over a fixed `setTimeout` sleep whenever a test waits for an async condition under a
  deadline.

### 4.5 Code and test facts

- **`import.meta.main` is the entry guard in both `channel/main.ts` and `src/cli/main.ts`** (B-97,
  closed session 55). Unchanged this session.
- **`stop()` awaits an in-flight tick before stopping bindings (B-98, closed session 56)** — see
  B-102(f)'s still-open, narrower residual gap (§7, §4.6) before assuming this is fully closed for
  every path.
- **`hasFsModuleReference` catches five import forms (B-100a, closed session 56)**. Unchanged.
- **`computeClosure` still follows relative specifiers only, by design — this is not a bug to fix in
  `computeClosure` itself.** `bareSpecifiers` (session 57, `test/security/closure.ts`) makes the bare
  specifier surface explicit instead. **B-103 (closed session 58) wired this into the two remaining
  consumers**: `installer-bundle.test.ts`'s CLI/DOCTOR/OFFLINE closures and
  `test/client/session-exchange.test.ts`'s run-file/session-exchange closures each now assert their own
  reviewed allow-list. **All five known `computeClosure` consumers in this codebase now enforce a
  bare-specifier allow-list** (daemon, client, channel — B-100b; installer/doctor, session-exchange —
  B-103). It does **not** follow a bare specifier into `node_modules` — no content scan of what an
  allow-listed package's own code does internally; the allow-list only makes the dependency *surface*
  explicit and reviewable.
- **Timing-sensitive tests are condition-waits, not fixed sleeps (B-99, closed session 55)**.
  Unchanged this session.

### 4.6 The "selectorless" RDD review chain has its own, separately-tracked base — a process gotcha, not a product defect

Discovered session 57, not observed firing session 58 (no Stop-hook trigger occurred this session),
still unresolved as far as anyone knows. Two different mechanisms both drive RDD in this repo:

1. **The ODD protocol's own per-commit step**: `gentle-ai review assess --cwd <repo> --agent
   claude-code --base-ref <last reviewed boundary> --committed-only --json`, tracking "last reviewed
   boundary" yourself from the prior session's own lineage history (§9). This is what sessions 55-58
   have actually used for their own work-unit commits, and it works correctly (session 58's own two
   lineages both used it, §4.7/§9).
2. **The Stop hook's own selectorless check**: `gentle-ai review status --cwd <repo> --contract
   gentle-ai.review-integration/v2 --agent claude-code --next-transition` (no `--base-ref`, no
   `--committed-only`). This tracks a **separate, internally-remembered base** that does not advance
   just because you closed a review through path 1 above. At session 57's close this base was still
   `2aa0da0` (pre-B-98) and was not touched or re-checked session 58.

If the Stop hook fires demanding this same selectorless STATUS, and the resulting candidate's finding
is B-102(f) (a `CRITICAL` resilience finding in `src/daemon/bootstrap.ts`/`bindings.ts` about a
timed-out-then-later-resolving heartbeat tick), that is **not a new bug** — it is this same stale-base
rediscovery, confirmed by its own citation of `CHECKLIST.md`'s B-102 row and this file. Two ways to
actually close this out, neither attempted yet: (1) fix B-102(f) for real (small, scoped, already
described in CHECKLIST's B-102 row) — likely lets the next selectorless review close clean; or (2) have
a maintainer run `gentle-ai review abandon` with proper `--maintainer-authorization` on whichever
lineage is currently offered (a maintainer-owned action, not something Kairo or an agent should
self-generate).

A smaller, unrelated gotcha from the same investigation: an **uncommitted scratch file** (e.g. a
temporary `status.json` capture, or — as this session found — a legitimate but not-yet-committed ODD
task file) in the workspace makes `review status`'s workspace projection demand an
`intended_untracked_selection` input before it will proceed. Resolve it with
`--untracked-scope=exclude --expected-untracked-inventory=<sha from the error/response>` on every
`assess`/`status`/`start` call while the file stays untracked, rather than removing legitimate
in-progress work just to satisfy the check.

### 4.7 A `correction_required` lineage can terminally stop on `captured_artifacts_unverifiable` — then a near-identical later lineage can resolve cleanly (new, session 58)

Distinct from §4.6's selectorless chain: this happened on the project's own normal `review assess
--base-ref --committed-only` flow, not the Stop hook's separate mechanism.

Sequence that produced it: `review status` returned `correction_required` with one CRITICAL readability
finding (docs describing already-shipped code as unshipped); the fix was made (an `Edit` to the flagged
doc lines), the line count measured (`git diff --stat`), committed, then `review capture-correction-plan
--correction-lines=<N>` was called with the exact returned tokens (declaring the plan), which succeeded
(`state: "correction_required"`, a new `store_revision`). The *next* `review status` call, using the
exact same lineage and the repository-context handle from the correction-required response, returned a
**terminal** `next_transition: {"kind": "stop", "reason_code": "captured_artifacts_unverifiable"}`
instead of progressing to a validation step. Per the reason-code table (this file's own operator's
manual, or the parent orchestrator's own reference), this is documented as terminal: "maintainer
inspects authority, or disable RDD" — neither applicable to an agent mid-task. The lineage was left
`correction_required`, unacknowledged, holding no authority over anything, and was not chased further;
the Director was told plainly.

**The very next lineage, opened fresh after the next commit, hit an almost identical finding** (the
same docs, now stale again for a different reason) **and, using the exact same sequence
(edit → measure lines → commit → `capture-correction-plan` → `review status`), progressed cleanly**:
this time the STATUS response's `next_transition` was `targeted_validation_required`, naming a
`review capture-validation ... --execute=true` operation. Running that operation directly resolved the
whole lineage to `approved` in one call (all four lenses' verdicts included in its response, two
non-blocking WARNINGs disclosed, zero blockers), and the returned `acknowledgement.command` closed it
cleanly.

**Takeaway for a future session**: a terminal `captured_artifacts_unverifiable` stop on one lineage is
not evidence that the correction mechanism itself is broken, and is not something to work around by
skipping the correction, disabling RDD, or assuming every subsequent correction will fail the same way.
It was **not reproduced** on a second, near-identical attempt in the same session. If it recurs
repeatedly (not just once), that pattern — not a single occurrence — would be worth a Gentle AI defect
report (with the Director's consent, per the standing protocol); one occurrence with a clean retry
right after is not enough evidence to file one.

---

## §5 — Next session, exact sequence

- [ ] **1. Verify the tree.** Run §0.2's commands; the tree must match.
- [ ] **2. Settle §0.3.** Autonomy, Engram session, Arena status (it may have changed since this file
      was written).
- [ ] **3. Ask the Director what's next** — §3.3's only structured path is F6, and it is blocked on
      three Director decisions (B-11, B-12, B-16); everything else is "ask, don't assume."
- [ ] **4. If F6 is chosen**: first get the Director's decisions on B-11, B-12 and B-16 (they gate the
      change's own scope), then propose `sdd-explore f6-release-and-docs` through the normal SDD entry
      routing (preflight → init guard → explore).
- [ ] **5. If the Stop hook fires demanding a selectorless RDD review**, read §4.6 before treating its
      finding as new, unplanned work — it is very likely B-102(f) again, not a fresh defect.
- [ ] **6. If a `review status` call returns a terminal `captured_artifacts_unverifiable` stop after a
      correction**, read §4.7 before assuming the mechanism is broken — retry the same sequence on the
      next lineage rather than working around it, and only escalate if it recurs more than once.
- [ ] **7. Before delegating any non-trivial implementation to a background agent**, budget time to
      verify its result against the real repository state rather than trusting its task-notification's
      own `status`/`result` fields (§4.1) — and if a fork's *first* notification looks too thin for its
      assigned scope (very few tool calls, very short duration), resume it via `SendMessage` before
      assuming the work needs to be redone from scratch (§4.1, session 58's own mapping fork).
- [ ] **8. Close the session.** Overwrite this file; add the session's entry at the top of `LOG.md`;
      add its tribunal-index row(s) if any audit ran; update the backlog rows touched (never delete
      one); update `AGENTS.md`'s status pointer if it changed. Then have the result audited (Arena or
      Judgment Day per §0.3).

---

## §6 — Do not redo

- F1 through F5 archives are closed, including F4's (session 55). B-09, B-96 are closed.
- F4's seven implementation PRs (`#95`-`#105`) and its `sdd-verify`/`sdd-archive` are final: do not
  re-implement, re-debate, or re-review them.
- B-97, B-99, B-101 are closed (session 55). B-98 is closed (session 56), commits `54f7d56` and
  `d8bd7a7` — do not re-implement (B-102(f) and (g) are real, narrower, still-open residuals of the
  same area — see §7 — not a reason to redo B-98 itself).
- **B-100(a) is closed (session 56), commit `599e984`** — do not re-widen `hasFsModuleReference` again.
- **B-100(b) is closed for the daemon, client and channel bundles (session 57), commits `47bcd00`,
  `5122e20`, `737a8b8`.** Do not re-implement the `bareSpecifiers` primitive or re-wire these three
  bundles' allow-lists.
- **B-103 is closed for both remaining consumers (session 58), commits `06d31eb` (installer/doctor),
  `2a579b9` (session-exchange), `d620320`/`726acd1` (RDD-found doc corrections).** Do not recompute or
  re-wire these allow-lists — all five known `computeClosure` consumers in this codebase now enforce
  one. Do not re-widen any of the five allow-lists beyond what the actual computed output demands.
- The retroactive RDD reviews of sessions 55-58 and every **acknowledged** lineage listed in each
  session's own §9 are approved/acknowledged — do not re-review any of those commits again. The
  exceptions, left open on purpose: every **declined** selectorless-chain lineage (session 57 onward,
  §4.6) is left `correction_required`/unacknowledged — treat its B-102(f) finding as not-new, regardless
  of lineage id; and session 58's own terminally-stopped lineage (`review-688b995abb754a4c`, §4.7, §9)
  is also left `correction_required`/unacknowledged, holding no authority over anything — do not chase
  it, and do not treat its being unacknowledged as blocking the (separately acknowledged) work it
  covered.
- Do not fix `WORK-PLAN.md`'s F4 Validation row (row 93) or SDD-change row (row 94) again — both are
  current as of session 55's docs-sync commit.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-95** | Remainder: (d) the missing abort signal (design-exact, Alpha-approved not to touch), `serve/fetch.ts:244-246`'s unguarded parse, and three non-blocking notes (a drifting comment count, `to` accepting any string, the silent skip of an unreadable row). | Kairo (Director schedules) |
| **B-102** | Residual items from B-98's own RDD review. Open: (a) the `stopping` guard's update-binding branch is untested; (b) the bootstrap test's negative assertion still uses a fixed 60ms sleep (B-99-class anti-pattern); (c) the `stopping` latch is never reset (likely fine, undocumented); (f) a timed-out-then-later-resolving tick can still hit a closed database (the original B-98 symptom, narrowed) — re-confirmed session 57 by a redundant selectorless RDD review, not fixed (see §4.6); (g) a timed-out tick leaves no log/audit trace. (d) and (e) are closed. Cheap wins at the next touch of these files. | Kairo |
| **Every other open row** of `CHECKLIST.md` (read its Status column) | Carried unchanged. B-11, B-12 and B-16 block F6's readiness (§3.3). | Director |
| **Gemini CLI / Cursor doorbell capability** | Untested for B-09; not a blocker. Low priority. | Director |
| **The selectorless RDD chain's stale base** (§4.6) | Process observation, not a backlog row of its own — tracked here and in B-102's row since its symptom (re-surfacing B-102(f)) is what a future session will actually see. Not observed firing session 58. | Director/maintainer (needs `gentle-ai review abandon` authorization, or B-102(f) fixed for real) |
| **The `captured_artifacts_unverifiable` terminal-stop lineage** (§4.7, `review-688b995abb754a4c`) | Left `correction_required`, unacknowledged, no authority over anything. Not reproduced on a near-identical retry the same session — not escalated to a defect report on one occurrence. Watch for recurrence. | Director/maintainer if it recurs |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions).

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0, **`gentle-ai` 3.7.0** (unchanged this session — check `--version` fresh
  each session regardless, do not trust this number to stay current). Shell is PowerShell primary with
  Bash (Git Bash) available. 24 logical CPUs.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`, local `ahead
  20` at this session's close (not pushed). Every `gh` command runs with
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
  Force-push and deletion of `main` are blocked; no PR or status-check requirement.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**; cite as `path:line`.
- `.mcp.json` points at the Arena bridge; never quote or commit its contents. `.claude/settings.json`
  is gitignored tooling.
- `os.tmpdir()` resolves to an 8.3 short path under the user profile (`C:\Users\<USER>~1\...`).
- The SDD preflight for this project is Automatic / Both (hybrid) / Auto (`stacked-to-main`), asked
  again every session a *new* SDD change actually starts — a plain ODD backlog slice does not need it.
- **CodeGraph**: present and usable, `codegraph_explore` directly — do not re-init.

---

## §9 — RDD state at session close

1. **Lineage `review-688b995abb754a4c`** (installer/doctor commit `06d31eb` + session-57's uncommitted
   docs-close-out range), against base `737a8b8` (6 paths/709 lines): tier high (`test/security/*`
   touched directly, a real signal), granted. Reached `correction_required` with one CRITICAL
   readability finding (`CHECKLIST.md`/`HANDOFF.md` describing all 5 B-103 entry points as unevidenced
   when 3 were already enforced by this same candidate). Correction captured and committed (`d620320`,
   14 lines). The follow-up `review status` call returned a **terminal**
   `captured_artifacts_unverifiable` stop instead of progressing — see §4.7. **Left
   `correction_required`, unacknowledged, no authority over anything.** Not chased further; disclosed
   to the Director.
2. **Lineage `review-7f532587be32a283`** (adds session-exchange commit `2a579b9`), against the same
   base `737a8b8` (7 paths/740 lines): tier high, granted. Reached `correction_required` with one
   CRITICAL readability finding (the same docs, now stale again about session-exchange specifically).
   Correction captured and committed (`726acd1`, 14 lines). This time the follow-up `review status`
   call returned `targeted_validation_required`; running the named `review capture-validation
   --execute=true` operation resolved the lineage directly to `approved` — all four lenses' verdicts
   included (risk: no findings; resilience: no findings; readability: the one CRITICAL just fixed, plus
   one non-blocking WARNING about two hand-typed identical allow-list constants with no structural
   cross-check; reliability: the same doc-staleness finding from a different angle, WARNING-severity
   this time since the correction was already in flight) — **acknowledged, authority burned.**

Both lineages used the retroactive committed-only flow (§4.3) against the same `base-ref 737a8b8`,
since the first lineage's terminal stop meant the "last reviewed boundary" never actually advanced past
it until the second lineage's own acknowledgement. The reviewed boundary is now this session's own tip,
`726acd1`.
