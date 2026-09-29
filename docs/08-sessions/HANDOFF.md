# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what
> the next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live
> in the ADRs and the tribunal index, never here.
>
> **Last rewritten: end of session 57** (2026-09-29). Everything below describes the state after it.

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** Unchanged since session 55. No SDD change is currently open. |
| What is next? | No queued SDD work. F6 (`f6-release-and-docs`, release/publish) is still the only planned next phase, still blocked on Director decisions (B-11 name clearance, B-12 macOS scope, B-16 license/legal docs) — see §3. **B-100(b) is closed for the daemon, client and channel bundles (session 57). B-103 is scoped with concrete evidence and ready for a dedicated session** (§3, §7 — a good next start, same shape as B-100(b)). |
| What must be settled before any work? | **Who audits.** Settle it as §0.3 says: Arena/Alpha status may have changed since this file was written (it was unreachable, MCP `ECONNREFUSED`, at the start of session 57, same as sessions 55-56). |
| What is the Director's to decide? | B-103's design (Director + Kairo, scoped, not blocked — a fresh session can just start it); the B-95 remainder and B-102's residual items (Kairo schedules); B-11, B-12, B-16 gate F6. |
| Where to read next | §0 first; then §3 (what's available, what's next) and §7 (open points) as the task needs. §4 and §8 are reference material — read only the parts a specific task touches. |

---

## §0 — Quick start

### 0.1 Prompt to paste

No specific task is queued. Paste this one, or state your own:

```text
Lee docs/08-sessions/HANDOFF.md y confirma Arena. B-100(b) ya cerró para daemon/client/channel
(session 57); arranca B-103 (los mismos dos consumidores de computeClosure que quedaron sin evidencia:
installer-bundle.test.ts y session-exchange.test.ts) reutilizando bareSpecifiers de closure.ts. Primero
corre el cómputo real sobre los cinco entry points antes de asumir que no hay violación activa. TDD
estricto, tu criterio sobre el diseño.
```

B-103 is the recommended start: it reuses a primitive that already exists and is already tested
(`bareSpecifiers` in `test/security/closure.ts`), and needs no Director decision to begin — unlike F6,
which is blocked on B-11/B-12/B-16 regardless of how much autonomy is delegated.

### 0.2 First commands (stop and report if any output disagrees)

Run them in the Bash tool: they use POSIX syntax (`rm -rf` does not exist in PowerShell, the default shell, §8).

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | first line `## main...origin/main` — session 57 ended with local `ahead` of `origin` (direct-to-main work-unit commits, not yet pushed); if `behind`, run `git pull --ff-only` |
| 2 | `rm -rf dist` | prints nothing; a stale `dist/` silently fakes results |
| 3 | `ls openspec/changes/` | `archive` only — no bare change folder |
| 4 | `git status --short` | prints nothing (after removing any scratch files you created — see §4.6) |
| 5 | `gentle-ai review mode status` | `receipt-driven development: on (decided by global)`; read it, do not assume it |
| 6 | `gentle-ai --version` | `3.7.0` or later; check fresh each session, do not trust this number to stay current |
| 7 | `npm run build && npm test` | exit 0; `1732 tests, 1726 pass, 0 fail, 6 skip` (session-57 close baseline; `test:static` 89/89) |

The working tree must be clean. If `git status` shows anything, stop and report before assuming it is safe.

### 0.3 Settle before any work

1. **Autonomy.** Confirm the opening prompt re-states full autonomy with the collaborator as judge; if
   it does not, ask one question.
2. **SDD Session Preflight and memory.** Only relevant if SDD work is actually chosen (see §3) — a plain
   ODD backlog slice (B-103, like B-100(b) before it) does not need it. Start an Engram session
   (`mem_session_start` with `id` and `directory`) regardless, and pass its id to `mem_save`.
3. **Arena and collaborator.** Prove Arena reachable with a real `bridge_send`, never `curl`. Sessions
   55, 56 and 57 all found the `arena` MCP server itself refusing to connect (`ECONNREFUSED`) at session
   start — a real tool-level failure that satisfies DN-09's substitute condition directly, with no
   B-101 waiver needed. If Arena is reachable this time, run one real debate as the probe and wait for
   the `[ARENA]` ping (do not poll; `LOG.md`'s prior entries have the detail, or the installed
   `judgment-day` skill for the substitute's operating detail). If the bridge itself fails, that's
   DN-09 directly: confirm with the failed real call, tell the Director, and use Judgment Day.

Then decide what to do (§3) with the Director.

### 0.4 Standing instructions from the Director

- **RDD consent is asked per candidate through `AskUserQuestion`; never answer it for the Director.**
  Recommend `granted`, and keep the provider's labels, order and tokens. Session 57: granted three
  times (T1, T2-T4, and the selectorless chain's first occurrence — all approved, zero blocking,
  acknowledged), **declined at least twice** on the same recurring selectorless-chain pattern — see §4.6
  and §9 for why the decline was correct each time (a redundant, unrelated review chain re-surfacing
  already-tracked B-102(f)). **This pattern is open-ended, not closed**: it re-triggers on every new
  commit for as long as the underlying stale base (§4.6) is unresolved, so expect more occurrences, not
  just the ones logged in §9.
- **The "selectorless" Stop-hook review chain tracks its own base independently of the
  `review assess --base-ref <boundary> --committed-only`-driven flow this project's ODD protocol uses**
  (§4.6). It was still anchored at `2aa0da0` (pre-B-98) at session 57's close and may still be — check
  `gentle-ai review status --cwd <repo> --contract gentle-ai.review-integration/v2 --agent claude-code
  --next-transition` early if the Stop hook fires. **Recognize this pattern by its shape, not by a
  specific lineage id** — a fresh lineage id is minted every time the candidate grows, so any id logged
  in §9 will already be stale by the time you read this. The shape: `base_ref` is `2aa0da0...`, risk
  evidence cites `test/security/*.test.ts`, and if it reaches `correction_required` the finding is
  `R4-stalled-tick-closed-db` in `src/daemon/bootstrap.ts`/`bindings.ts` — that is B-102(f) again, not a
  new bug. See §7's B-102 row before treating it as urgent, unrelated work.
- **`gentle-ai review status`/`start` can fail with a persistent `operation_timeout`** (schema
  `gentle-ai.review-integration.failure/v2`, `retry_safe: false`), unrelated to network or the
  candidate's content — session 55 hit this twice; sessions 56-57 saw no recurrence. Retry at most 2-3
  times; if it keeps failing, this is the mandatory Gentle AI defect-handoff trigger (ask the Director
  report/continue/stop once per distinct occurrence). Do not silently skip RDD without disclosing it,
  and do not loop on the retry.
- **A retroactive, already-committed range can be reviewed with `review assess --base-ref <last
  reviewed boundary> --committed-only --json`**, then the returned `next_transition.command` verbatim
  (STATUS → START → capture-result per lens, concurrently, in lens order → acknowledge-approved). Used
  successfully twice in session 57 for its own two work-unit commit groups. Remove any uncommitted
  scratch file before running STATUS — an untracked file in the workspace projection forces an
  `intended_untracked_selection` detour (§4.6).
- **`size:exception` is asked per PR**, after the collaborator's view on the frozen diff, with a
  recommendation. Not needed session 55, 56 or 57 (no PR any of those sessions; direct-to-main
  work-unit commits).
- **Commit messages and PR descriptions carry no `Co-Authored-By` and no AI attribution**; conventional
  commits only. This overrides the harness's attribution reminder. Commit by work unit.
- **Docs commits.** Session-bookkeeping docs-only commits (recording a merged slice, closing a backlog
  row, the session close-out) go straight to `main`. A documentation *slice* that's a planned SDD
  deliverable goes through a branch, an audit and a PR.
- **`gentle-ai sync`** rewrites the machine's global `~/.claude/` and `~/.agents/` config when a
  `review status` call reports `managed_assets_outdated`. Expected, outside the repository, not
  something to second-guess or revert; just re-run the `review status`/`start` call after it
  completes. Did not happen session 57 (`gentle-ai` stayed at `3.7.0` throughout).
- **Never trust a delegated background agent's own `status`/`result` at face value for anything
  consequential.** Session 56 hit a real incident (§4.1): a `fork`'s task-notification claimed
  `completed` with a corrupted result and had, per `git log`/`git status`, done no actual work.
  Session 57's own mapping fork, by contrast, delivered a real, independently-useful correction to the
  task's own scope claim — verify either way, don't assume either outcome.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1, F2, F3, F4, F5 | **Archived**, unchanged this session. | `openspec/changes/archive/` |
| B-09, B-96 | Closed (sessions 50, 54). | `docs/06-backlog/CHECKLIST.md` |
| B-97, B-99, B-101 | Closed (session 55). | `docs/06-backlog/CHECKLIST.md` |
| B-98 | Closed, session 56. Daemon `stop()`/heartbeat shutdown-ordering race. Fix `54f7d56`. | `docs/06-backlog/CHECKLIST.md#B-98` |
| B-100(a) | Closed, session 56. `hasFsModuleReference` widened, verified safe. Fix `599e984`. | `docs/06-backlog/CHECKLIST.md#B-100` |
| **B-100(b)** | **Closed, session 57, for the daemon, client and channel bundles.** New `bareSpecifiers` primitive in `test/security/closure.ts`; each bundle wires its own allow-list in its own idiom. Commits `47bcd00`, `5122e20`, `737a8b8`. | `docs/06-backlog/CHECKLIST.md#B-100` |
| B-95 remainder, B-102 residual items, **B-103** | Open, carried forward. **B-103 is scoped**, same shape as B-100(b) was, ready for a dedicated session (§7). | `docs/06-backlog/CHECKLIST.md`, §7 below |
| Next SDD change | None queued. F6 (`f6-release-and-docs`) is next in `WORK-PLAN.md` but blocked on Director decisions (B-11, B-12, B-16). | `docs/07-plan/WORK-PLAN.md` (F6 section) |
| Tests on `main` | `npm test`: **1732 tests, 1726 pass, 0 fail, 6 skip** (session start: 1722/1716/0/6). Independently re-run by Kairo from a clean build at every commit. `test:static`: **89/89**. | — |
| RDD this session | Ran 6+ times, open-ended (§9): 2 lineages scoped to session 57's own commits (both approved, acknowledged); the "selectorless" chain's first occurrence also approved/acknowledged; every occurrence since has been declined (same recurring B-102(f) rediscovery, §4.6) and will keep recurring on new commits until resolved. | §9 below |

---

## §2 — What session 57 did (context, not to redo; detail in `LOG.md`)

1. **Confirmed Arena unreachable** (`ECONNREFUSED` at MCP connection, same real tool-level failure as
   sessions 55-56) — DN-09's substitute condition satisfied directly, Judgment Day is the standing
   audit method if a dedicated audit beyond RDD is ever warranted (not needed this session — see below).
2. **Mapping (a fork) corrected the task's own scope claim before any code was written**: session 56's
   "no active violation today" evidence covered only the daemon and client closures. Two more
   `computeClosure` consumers share the identical relative-only blind spot and were never evidenced —
   `test/security/installer-bundle.test.ts` and `test/client/session-exchange.test.ts` — filed as
   **B-103** rather than silently included or dropped. Confirmed `channel-bundle.test.ts`'s own module
   doc already scoped the intended fix to exactly three bundles (daemon, client, channel), matching
   HANDOFF's "three bundle tests" language — so the three-bundle scope for B-100(b) itself was correct,
   just not evidenced for channel.
3. **Design, delegated to Kairo's judgment**: `bareSpecifiers` (`test/security/closure.ts`), a sibling
   to the existing private `relativeSpecifiers`, exported since three test files need it directly. Not
   placed in `predicates.ts` (SEAM, and its own test file `predicates.test.ts` is AS-IS-pinned — see
   B-100(a)'s precedent in §4.2 for why that matters). Each bundle wires its own allow-list in its own
   already-established idiom rather than a forced-uniform mechanism — daemon/client get a local sorted
   array + `assert.deepEqual`; channel gets a new `Rule` entry in its existing table, generalizing
   `test/channel/main.test.ts`'s local allow-list precedent to whole-closure scope.
4. **Strict TDD, four work-unit commits, all green**: `47bcd00` (the primitive + its own seed tests,
   confirmed RED via a real `tsc -b` compile failure before GREEN), `5122e20` (daemon+client
   allow-lists, both matched the actual computed output on the first try), `737a8b8` (channel's new
   Rule, which required relaxing an existing per-rule seed-loop assertion from "exactly this violation"
   to "this violation is present" — several existing rules' own seeds, `node:sqlite`,
   `@napi-rs/keyring`, `node:timers/promises`, are bare specifiers that correctly also trip the new rule
   now, a necessary and disclosed side effect of adding an intentionally-overlapping check).
5. **RDD ran 6+ times (open-ended, not a fixed count), disclosing a real process discovery about this
   project's own tooling, not a code defect**: two lineages scoped to session 57's own commits both
   closed `approved`, zero blocking, acknowledged. A third, separate "selectorless" review chain
   (triggered by the Stop hook, which checks a different, independently-tracked base than the `review
   assess`-driven flow this project's ODD protocol uses) turned out to still be anchored at `2aa0da0`
   (pre-B-98) — so it kept re-surfacing an ever-growing cumulative diff including already-acknowledged
   B-98/B-100(a) work. Its first occurrence was granted and closed clean. Every occurrence since —
   including at least one after this file's own first close-out edit — came back `correction_required`
   with one real CRITICAL finding that is exactly the already-disclosed **B-102(f)**, re-discovered
   only because of the stale base, not because of anything session 57 wrote, and was declined each
   time rather than fixing B-102(f) as an unplanned detour. Each declined lineage is left in
   `correction_required`, unacknowledged, holding no authority over unrelated work. **This recurs on
   every new commit and is not resolved as of this file's own last edit** — see §4.6 for the operating
   detail and §7's B-102 row for what remains open.
6. **Documentation updated as the task affected it**: `CHECKLIST.md`'s B-100 row (closes (b) for
   daemon/client/channel), a new B-103 row, a session-57 disclosure note on B-102's row; `AGENTS.md`'s
   status pointer; this file; `LOG.md`'s new session-57 entry.

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

1. **B-103** (§7) — in progress. `installer-bundle.test.ts`'s three entry points (`cli/main.js`,
   `doctor/main.js`, `doctor/offline.js`) are now evidenced and enforced (commit `06d31eb`): real
   computed bare-specifier sets, verified independently twice, cross-checked against `package.json`'s
   dependencies — no live violation. `session-exchange.test.ts`'s two entries (`run-file.js`,
   `session-exchange.js`) remain open.
2. **F6** (`f6-release-and-docs`, release/publish) — blocked on three Director decisions: B-11
   (trademark clearance for "Conmuta"), B-12 (macOS scope), B-16 (license/legal docs remainder). Ask
   the Director for these before proposing `sdd-explore f6-release-and-docs`.
3. **Whatever the Director actually asks for.** This board is not a queue the Director must follow —
   ask what's next rather than assuming one of the above.

---

## §4 — Facts that will bite you

### 4.1 Audit and collaborators

- **A collaborator's or subagent's report can contain false or unverifiable claims; re-verify the
  concrete ones yourself.** Session 56's own incident (a `fork`'s task-notification claimed
  `completed` with a corrupted, unusable `result`, ground truth showed no real work) remains the
  cautionary example. **Session 57's own mapping fork, by contrast, delivered accurate, independently
  verified findings** (the installer/session-exchange gap, the channel bundle's exact bare-specifier
  set) — verify either way; don't assume a subagent's report is wrong just because a prior one was, or
  right just because this project favors direct implementation over delegation for non-trivial writes.
- **Judgment Day** (the standing audit when Arena is unreachable, DN-09; or on the Director's explicit
  instruction for a reachable-but-unresponsive-collaborator case, GOVERNANCE §3's third paragraph,
  recorded as a DN-05 waiver each time). Skill `~/.agents/skills/judgment-day/SKILL.md`, formats in
  its `references/prompts-and-formats.md`. Not invoked session 57 — B-100(b) was an ODD slice,
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
  exercised session 56 or 57 (no SDD phase ran) — if it recurs, don't retry the native dispatch more
  than once per phase; go straight to a `general-purpose` agent with the same brief.
- **This project's own convention is direct implementation by Kairo, not delegation, for non-trivial
  writes** (`AGENTS.md`: "One writer of the tree: Kairo"). A generic `fork`/background-agent delegation
  can fail silently or fabricate a result (session 56's own incident, §4.1) — reserve delegation for
  read-only exploration/mapping (used successfully this session) and for the audit role, not for
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
  `closure.test.ts` and all four bundle test files carry **no** v1-provenance entry — freely editable,
  confirmed by direct grep this session.

### 4.3 RDD

- **`openspec/changes/**` and `AGENTS.md` files consistently trip an `executable_change` heuristic
  that reads as a false positive on prose** — every candidate touching those files in session 55 came
  back `medium` on that basis alone. **A `process_boundary`/`executable_change`/`hot_path`/
  `process_boundary` signal in real `src/` or `test/security/` code, by contrast, is usually genuine** —
  sessions 56 and 57 both saw real, substantive signals tied to actual security-detector or
  control-flow changes, not prose false positives (session 57: `test/security/*.test.ts` touched
  directly, tier `high`, both times a real signal per B-100(a)'s own precedent). Say so plainly in the
  RDD question either way, so the Director isn't left wondering.
- **`gentle-ai review status`/`start` can fail with a persistent, non-transient-looking
  `operation_timeout`** (`gentle-ai.review-integration.failure/v2`, `retry_safe: false`) while every
  other `gentle-ai` subcommand keeps working — session 55 hit this twice; sessions 56-57 saw no
  recurrence at all — retry 2-3 times in a fresh session before treating it as the defect-handoff
  trigger (§0.4).
- **The retroactive committed-only flow, used twice more this session, end to end**: `review assess
  --cwd <repo> --agent claude-code --base-ref <last reviewed boundary> --committed-only --json` →
  `review_due`/`review_due_reason` → if due, run the returned `next_transition.command` verbatim
  (STATUS, `action: "start"`) → run the returned START command → if `consent_required`, relay via
  `AskUserQuestion` → run the exact chosen invocation → STATUS again (`action: "collect"`) →
  run every returned `review.capture-result` operation concurrently, in lens order → the final
  admitted capture's response carries `acknowledgement.command` when `state: "approved"` → run it
  verbatim, response confirms `authority: "burned"`.
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
  `computeClosure` itself.** `bareSpecifiers` (new, session 57, `test/security/closure.ts`) is the
  sibling function that makes the bare-specifier surface explicit instead: exported (unlike the
  private `relativeSpecifiers`), it extracts every bare specifier from a source string across the same
  statement shapes plus `require(...)` as defense in depth. It does **not** follow a bare specifier
  into `node_modules` — no content scan of what an allow-listed package's own code does internally;
  the allow-list only makes the dependency *surface* explicit and reviewable. Each of
  `daemon-bundle.test.ts`, `client-bundle.test.ts` and `channel-bundle.test.ts` now asserts its own
  bundle's bare-specifier set against a reviewed allow-list (B-100b, closed session 57).
  `installer-bundle.test.ts` and `test/client/session-exchange.test.ts` share the identical
  blind spot and are **not yet covered** — see B-103.
- **Timing-sensitive tests are condition-waits, not fixed sleeps (B-99, closed session 55)**.
  Unchanged this session.

### 4.6 The "selectorless" RDD review chain has its own, separately-tracked base — a process gotcha, not a product defect

Discovered session 57, likely still relevant next session. Two different mechanisms both drive RDD in
this repo:

1. **The ODD protocol's own per-commit step**: `gentle-ai review assess --cwd <repo> --agent
   claude-code --base-ref <last reviewed boundary> --committed-only --json`, tracking "last reviewed
   boundary" yourself from the prior session's own lineage history (§9). This is what sessions 55-57
   have actually used for their own work-unit commits, and it works correctly.
2. **The Stop hook's own selectorless check**: `gentle-ai review status --cwd <repo> --contract
   gentle-ai.review-integration/v2 --agent claude-code --next-transition` (no `--base-ref`, no
   `--committed-only`). This tracks a **separate, internally-remembered base** that does not advance
   just because you closed a review through path 1 above. At session 57's start this base was still
   `2aa0da0` (pre-B-98) — meaning every commit since then (B-98, B-100(a), and session 57's own four
   commits) counted as one ever-growing "unreviewed" candidate from this chain's point of view, even
   though each was already separately, correctly reviewed and acknowledged through path 1.

Consequences to expect next session: the Stop hook will very likely fire again demanding this same
selectorless STATUS, probably more than once, since **every commit this session made after the first
occurrence — including its own documentation commits — reproduced it again with a fresh lineage id**
(confirmed: it recurred at least three times session 57, §9). If it does, and the resulting candidate's
finding is B-102(f) (a `CRITICAL` resilience finding in `src/daemon/bootstrap.ts`/`bindings.ts` about a
timed-out-then-later-resolving heartbeat tick), that is **not a new bug** — it is this same stale-base
rediscovery, confirmed by its own citation of `CHECKLIST.md`'s B-102 row and this file. Session 57
declined every occurrence of that redundant review (each left `correction_required`, unacknowledged, no
authority over unrelated work — see §9 for the specific lineage ids logged, none of which will still be
the current one) rather than fixing B-102(f) as an unplanned detour from that session's actual task.
Two ways to actually close this out, neither attempted yet, in order of how well-understood the outcome
is: (1) fix B-102(f) for real (small, scoped, already described in CHECKLIST's B-102 row) — likely, but
not directly verified this session, to let the next selectorless review close clean and its
acknowledgement advance the tracked base, since `correction_required` appears to be what's blocking
acknowledgement each time, not the base itself; or (2) have a maintainer run `gentle-ai review abandon`
with proper `--maintainer-authorization` on whichever lineage is currently offered (an authorization
binding neither Kairo nor an agent should self-generate — a maintainer-owned action) — this quarantines
one lineage, but whether it also advances the underlying base for the *next* candidate was not tested
this session; if not, the pattern could still recur even after an abandon.

A smaller, unrelated gotcha from the same investigation: an **uncommitted scratch file** (e.g. a
temporary `status.json` capture) in the workspace makes `review status`'s workspace projection demand
an `intended_untracked_selection` input before it will proceed. `rm` any scratch file before running
`review status`, not after.

---

## §5 — Next session, exact sequence

- [ ] **1. Verify the tree.** Run §0.2's commands; the tree must match.
- [ ] **2. Settle §0.3.** Autonomy, Engram session, Arena status (it may have changed since this file
      was written).
- [ ] **3. Ask the Director what's next**, offering §3.3's paths (B-103 recommended, F6 pending its
      blocking decisions, or something else entirely) rather than assuming one.
- [ ] **4. If B-103 is chosen**: ODD slice, same shape as B-100(b) — reuse `bareSpecifiers`
      (`test/security/closure.ts`), compute the real bare-specifier sets for `installer-bundle.test.ts`'s
      three entries and `session-exchange.test.ts`'s two before assuming safety, strict TDD.
- [ ] **5. If F6 is chosen**: first get the Director's decisions on B-11, B-12 and B-16 (they gate the
      change's own scope), then propose `sdd-explore f6-release-and-docs` through the normal SDD entry
      routing (preflight → init guard → explore).
- [ ] **6. If the Stop hook fires demanding a selectorless RDD review**, read §4.6 before treating its
      finding as new, unplanned work — it is very likely B-102(f) again, not a fresh defect.
- [ ] **7. Before delegating any non-trivial implementation to a background agent**, budget time to
      verify its result against the real repository state rather than trusting its task-notification's
      own `status`/`result` fields (§4.1) — mapping/research delegation has worked well two sessions
      running; hands-on implementation delegation has not, per this project's own "one writer" convention.
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
  bundles' allow-lists — reuse the primitive for B-103 instead. Do not re-widen the allow-lists beyond
  what the actual computed output demands.
- The retroactive RDD reviews of sessions 55-57 and every **acknowledged** lineage listed in each
  session's own §9 are approved/acknowledged (one superseded before acknowledgement, session 56) — do
  not re-review any of those commits again. The exception, left open on purpose and recurring: every
  **declined** selectorless-chain lineage (session 57 onward, §4.6, §9 — there is more than one, and
  there will likely be more still) is left `correction_required`/unacknowledged — not "do not redo," but
  "do not treat its B-102(f) finding as new," regardless of which specific lineage id it currently
  carries.
- Do not fix `WORK-PLAN.md`'s F4 Validation row (row 93) or SDD-change row (row 94) again — both are
  current as of session 55's docs-sync commit.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-95** | Remainder: (d) the missing abort signal (design-exact, Alpha-approved not to touch), `serve/fetch.ts:244-246`'s unguarded parse, and three non-blocking notes (a drifting comment count, `to` accepting any string, the silent skip of an unreadable row). | Kairo (Director schedules) |
| **B-102** | Residual items from B-98's own RDD review. Open: (a) the `stopping` guard's update-binding branch is untested; (b) the bootstrap test's negative assertion still uses a fixed 60ms sleep (B-99-class anti-pattern); (c) the `stopping` latch is never reset (likely fine, undocumented); **(f)** a timed-out-then-later-resolving tick can still hit a closed database (the original B-98 symptom, narrowed) — **re-confirmed session 57 by a redundant selectorless RDD review, not fixed** (see §4.6; declined as an unplanned detour from that session's actual task, not because the finding is wrong); (g) a timed-out tick leaves no log/audit trace. (d) and (e) are closed. Cheap wins at the next touch of these files. | Kairo |
| **B-103** | `test/security/installer-bundle.test.ts`'s three entries (`cli/main.js`, `doctor/main.js`, `doctor/offline.js`) are now evidenced and enforced (commit `06d31eb`): real bare-specifier sets computed and verified independently twice, cross-checked against `package.json`'s 6 declared dependencies — no live violation. `test/client/session-exchange.test.ts`'s two entries (`run-file.js`, `session-exchange.js`) remain open, same fix pending commit, reusing `bareSpecifiers` (`test/security/closure.ts`); outside `test/security/`, so only full `npm test` runs it, not `test:static`. | Director + Kairo |
| **Every other open row** of `CHECKLIST.md` (read its Status column) | Carried unchanged. B-11, B-12 and B-16 block F6's readiness (§3.3). | Director |
| **Gemini CLI / Cursor doorbell capability** | Untested for B-09; not a blocker. Low priority. | Director |
| **The selectorless RDD chain's stale base** (§4.6) | Process observation, not a backlog row of its own — tracked here and in B-102's row since its symptom (re-surfacing B-102(f)) is what a future session will actually see. | Director/maintainer (needs `gentle-ai review abandon` authorization, or B-102(f) fixed for real) |

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
  again every session a *new* SDD change actually starts — a plain ODD backlog slice does not need it.
- **CodeGraph**: present and usable, `codegraph_explore` directly — do not re-init.

---

## §9 — RDD state at session close

**This section is a point-in-time log, not a closed count** — the selectorless-chain pattern (§4.6)
recurs on every new commit, including the documentation commits that closed out this file itself, so
more occurrences happened after this section was first written than are listed below. Treat the count
as "at least this many," not "exactly this many."

1. **T1 (`bareSpecifiers` primitive + seed tests)**, against base `91a9dae` (8 paths/323 lines):
   lineage `review-e1657a8ebed2f1c1`, tier high (`test/security/closure.test.ts` touched directly, a
   real signal), granted, all 4 lenses approved, zero blocking, acknowledged, authority burned.
2. **T2-T4 (daemon/client/channel allow-list wiring)**, against base `47bcd00` (3 paths/114 lines):
   lineage `review-4d682c8c0377abb9`, tier high (`test/security/channel-bundle.test.ts` touched
   directly), granted, all 4 lenses approved, zero blocking, acknowledged, authority burned.
3. **The Stop hook's own separately-tracked selectorless chain** (§4.6), base stuck at `2aa0da0`
   (pre-B-98) every time it was checked this session — **recurred at least three times**, growing with
   each new commit (documentation commits included, since the chain's diff is cumulative regardless of
   content):
   - 1st occurrence (after T1's commit only, 18 files/1173 lines): lineage `review-36dde770717e74f9`,
     granted, all 4 lenses approved, zero blocking, acknowledged, authority burned — closed cleanly.
   - 2nd occurrence (after all four B-100(b) commits, 19 files/1287 lines): lineage
     `review-3b21dbe6ea7c92b0`, granted, came back **`correction_required`** with one real CRITICAL
     finding (`R4-stalled-tick-closed-db`, `src/daemon/bootstrap.ts:257-260` + `src/daemon/bindings.ts`)
     that is exactly the already-disclosed, already-tracked **B-102(f)** — confirmed by the finding's
     own citation of `CHECKLIST.md:112` and this file. **Declined.** Left `correction_required`,
     unacknowledged, no authority over unrelated work.
   - 3rd occurrence (after this file's first close-out edit plus the docs commits, 19 files/1408 lines):
     lineage `review-5661c50afdd12e4b`, same shape, same B-102(f) finding. **Declined again**, same
     reasoning, same disposition.
   - **Each is independent** (its own lineage id, its own unacknowledged `correction_required` state,
     no authority over anything). None of this blocks or invalidates items 1-2 above, which are fully
     closed. **Do not chase or "resolve" a specific lineage id from this list — recognize the pattern
     (§4.6) instead**, since committing this very documentation fix may well have produced a 4th
     occurrence this session never got to react to.

This file's own final edit and its commit are the true session-close state for everything **except**
§9 itself, which by construction can never fully catch up to a pattern that retriggers on the commit
that records it — check `LOG.md`'s session-58 entry or `git log` for what actually happened after.
