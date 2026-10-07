# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what the
> next session does and what it must not redo. **§2 is the one exception to "overwritten":** it now carries the two
> most recent session narratives verbatim as context, moved down from the top so that the top belongs to the current
> session. The full history is in [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
>
> **Last rewritten: session 76** (2026-10-06 local), **after the two PRs the previous handoff had left to the Director
> both landed (#111 → `f71d0e9`, and #112 → `bd0688d`, whose one-line documentation conflict had been hiding the fact
> that it had never had a single CI run), `dist` was rebuilt from the new `main` so the armed F7c adapter carries the
> B-127 fix, B-112's three `null` profiles were measured instead of assumed, and ADR-0037/ADR-0038 were written for
> B-117 and B-119.** Every § carries session 76's state unless a line says otherwise; §2 keeps the two earlier
> sessions as context.
>
> **The 2026-10-07 units, since session 76:** the board gate landed and B-130/B-131/B-132 were filed (`8b920c4`), and
> then **B-132 was closed in `ac1cd24`** — the gate's region handling, hardened test-first and natively reviewed.
> §1, §3 and §5.2b carry that state; §7 has that review's advisories as **B-133**.
>
> **This file is the entry point for the bus front, and nothing outside the repository is.** That front used to be
> started from two files that live **outside this repository** — `HANDOFF-2026-10-05-bus-sesion-dedicada.md` and
> `HANDOFF-2026-10-04-reparar-despertador-del-bus.md`, in the coordinator's working folder at `../../../FRISCO/`
> (untracked by git, which is why they are named and not linked). Since 2026-10-05 both carry a `⚠️ SUPERADO`
> banner: the first was written the same day **its own §4 measurement was already committed**, and reading it costs
> re-deriving a finished piece of work. From here on this file carries the state, [`LOG.md`](./LOG.md) the history,
> [`../05-tribunal/INDEX.md`](../05-tribunal/INDEX.md) the audits,
> [`../06-backlog/CHECKLIST.md`](../06-backlog/CHECKLIST.md) the work and [`../03-adr/INDEX.md`](../03-adr/INDEX.md)
> the decisions. **A session paragraph is narrative, never an instruction — §0 is the instruction.**
>
> **Session 76 in one paragraph — the two open PRs landed, and the second one was invisible.** The preflight
> disagreed with §0.2 in exactly one place, row 7's expected counts, which are session 75's *branch* counts: `main`
> measures **1957/1951/0/6** and `test:static` 120/120. Arena was unreachable by two real probes, the subagents were
> healthy (and the delegate's claim was re-verified rather than quoted), and the `frisco` alarm was confirmed still
> off. #111 was merge-ready and became **`f71d0e9`**. #112 was not: it was **conflicting**, and — the part that
> mattered — it had **never had a single CI run**, because GitHub cannot build the merge commit of a conflicting PR,
> so `refs/pull/112/merge` did not exist and the `pull_request` workflow was never created. `gh pr checks` answered
> *"no checks reported"*, which reads like a clean bill rather than a warning. The conflict was one documentation
> line — the B-127 row, because `main` edited it at 03:39:18Z and the PR opened at 03:39:23Z — and it was resolved by
> keeping both sides, proving the result with two diffs. The moment it was pushed the merge ref appeared and CI
> started on its own; both legs pass. #112 became **`bd0688d`**, and `dist` was rebuilt from the new `main` so the
> armed F7c adapter finally carries the fix that stops it leaking a daemon session slot per reload. Then **B-112**
> stopped being an unexamined `null`: `codex` was probed live and **fails** the bar (`exec_command`, `web__run` and
> `collaboration.send_message` all survive), `opencode` has no flag-level restriction to declare at all, and
> `claude` has the right flags but cannot authenticate here — so all three stay `null`, on a measured reason each.
> **ADR-0037** and **ADR-0038** close the two design rows that required an ADR before any code, both `proposed`
> pending the Director. Landed as **PR #113** (`57a0919`). **T6 / B-114 is still owed**: this roster is
> `@kairo-agent` alone.

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** Unchanged since session 55. |
| What is new? | **The merge gate is empty and the handoff's own last two items are done (session 76).** `#111` and `#112` are merged (`f71d0e9`, `bd0688d`), and `dist` was rebuilt from the new `main` so the armed F7c adapter finally carries the B-127 fix. **B-112 is no longer an unexamined `null`**: `codex` was probed live and fails the bar, `opencode` has no flag-level restriction to declare, and `claude` has the right flags but cannot authenticate here — all three stay `null`, on a measured reason each (`odd/tasks/evidence/b-112-harness-send-proof-verification.md`). **ADR-0037** is `accepted` and implemented, closing **B-117** (2026-10-07), and **ADR-0038** is written for B-119, still `proposed`. The `frisco` despertador is **off** and must stay off. |
| What is next? | **Confirmations, not engineering.** ADR-0037 and ADR-0038 are `proposed` and each needs one word from the Director before any code moves; **B-112**'s only remainder is `claude`'s live probe, blocked on its expired OAuth session and nothing else. **T6 / B-114** still needs a roster peer (this tree's roster is `@kairo-agent` **alone**, measured with `conmuta_status`), and **B-125** needs a `gentle-pi` decision. The B-85 remainder (2)–(4), **B-113**, **B-126** and **B-128** are the Director's too. |
| What must be settled before any work? | §0.3: autonomy, memory, and **Arena** (unreachable at every session's start since 55; confirm with a real probe). Subagent health: session 72's **two delegates that failed with zero tool calls** (`gentle-ai-explore`, `gentle-ai-worker`) were not a harness failure — they had no `model_profiles` entry, and session 73 fixed that (see the note below the table). Re-verify with one tiny probe before relying on a delegate, but do not assume the work must be done inline. Session 76 confirmed both delegates healthy on the first try. |
| What is the Director's to decide? | **ADR-0038 — one confirmation, and it is now the only thing standing between B-119 and code** (B-117 was confirmed by the Director on 2026-10-07 and is `done`: ADR-0037's shape rule is implemented). **B-112**'s remainder (`claude`'s live probe) and **B-113** (the daemon cannot accredit a human); **B-125** (the `gentle-pi` `--no-extensions` proposal for children) and the informational **B-126**/**B-128**; the Engram housekeeping classification; **B-11/B-12/B-16** for F6; the B-101 relocation; and **which backlog class to schedule next** (§3.3). Nothing is on the merge gate: #106–#113 are all merged. |
| Where to read next | §0 first; then §1, §3, and §4. |

---

## §0 — Quick start

### 0.1 Prompt to paste

```text
Lee desde la raíz de este repositorio `docs/08-sessions/HANDOFF.md` (§0, §1, §3) y sigue §3 sin reabrir §6.
Los dos PR que quedaban ya están en `main` (`#111` → `f71d0e9`, `#112` → `bd0688d`), `dist` fue reconstruido desde el nuevo `main`, y la sesión 76 midió B-112: `codex` no puede llevar perfil, `opencode` no tiene bandera que lo declare, y a `claude` solo le falta una credencial válida. ADR-0037 ya está confirmado e implementado (B-117 cerrado); ADR-0038 sigue `proposed` y espera tu confirmación (B-119).
Lo que sigue debiendo es **T6/B-114**: el timbre con un par real del roster, que necesita a un compañero y no se puede solo.
Sigue §3 y no reabras §6. Si un run de CI sale rojo, mirá `gh run view <run-id> --json jobs` y buscá `cancelled` antes de concluir (§4). Y si un PR **en conflicto** no reporta checks, no está limpio: **nunca corrió** — GitHub no puede construir su merge ref, así que el workflow no se crea (§4).
```

### 0.1b If the machine was just powered on

Nothing needs re-arming: the daemon home `~/.conmuta/`, the id-free user-level bus registration and the
**machine-wide armed F7c adapter** all live on disk (ADR-0033, and `~/.pi/agent/settings.json` for the adapter), so a
cold start needs only §0.2's `git fetch`, rebuild and full test run.

**Do not trust a SHA, a count or a push status written in *prose* in this file.** The line that used to sit here
asserted the tree was `12 commits ahead` of `origin/main` and **not pushed**; by session 73 both halves were false.
Read `git log --oneline -12` and `git status -sb` instead — which is what §0.2 row 1 already says, and this is the
paragraph that kept contradicting it. **§0.2's rows are a different thing:** they publish the output a command is
expected to print, precisely so the reader can compare, and their values are checked by whoever runs the command.

### 0.2 First commands (stop and report if any output disagrees)

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | `## main...origin/main` with no divergence, and a clean tree. Read `git log --oneline -12` rather than trusting a SHA written here. **Do not treat the commit base as a fixed number** — take it from `git log` |
| 2 | `rm -rf dist` | prints nothing |
| 3 | `ls openspec/changes/` | `archive` only |
| 4 | `git status --short` | **empty** |
| 5 | `gentle-ai review mode status` | `receipt-driven development: on (decided by global)`; read it, do not assume it |
| 6 | `gentle-ai --version` | `4.0.0` or later — check fresh each session |
| 7 | `npm run build && npm test` | exit 0; **1960 tests, 1954 pass, 0 fail, 6 skip**; `test:static` **120/120** (session 76's counts, on `main` after #113; `04e2f03` measured **1957/1951/0/6** before #111/#112 landed, and this row used to quote session 75's *branch* counts of 1959/1953 — take the number from `git log`'s tip, and note the clean-build step in row 2 is what makes any of them mean anything) |
| 8 | `ls -d "$TEMP"/conmuta-* \| wc -l` before and after one `npm test` | the count must NOT grow. Since session 63 it is 0 and stays 0 |
| 9 | **Subagent health** | run one tiny tool-using subagent task (e.g. "read this file and report its line count"). Verified working in sessions 69 and 70, and working again in session 73 after the model-profile fix below. See §5 |

> **Row 2's trap, corrected in session 73.** `rm -rf dist` deletes the artifact the F7c adapter is armed by:
> `~/.pi/agent/settings.json` points `extensions` at this checkout's absolute `dist/channel-pi/main.js`. A session
> already running keeps the module in memory and row 7 rebuilds it, so the window is only as wide as the build — but
> a session that starts inside it, or a build that fails, arms nothing and rings nothing. Rebuild immediately after
> deleting; never leave this checkout with `dist/` gone.
>
> **And the subagent row needed more than a probe.** The three sessions that reported "unreliable subagents" were not
> seeing a harness failure: a delegate with no entry in `~/.pi/agent/subagents.json`'s `model_profiles` fails with
> `assistant reported an error` and **zero tool calls**, while `deepseek/deepseek-flash` is the string measured to
> work. Profiles were added in session 73 (backup `subagents.json.bak-pre-profile-fix-20261005123100`), after which
> `jd-judge-a`, `jd-judge-b` and `gentle-ai-verify` all ran. The four `review-*` lens profiles that session 73 left
> alone were moved to DeepSeek in session 74, on the Director's instruction (§8).

### 0.3 Settle before any work

1. **Autonomy**: confirm the opening prompt re-states it; if it does not, ask one question.
2. **Memory**: start an Engram session (`mem_session_start`) and pass its id to `mem_save`. This
   repository's Engram project is **`connmuta`** (§8). A **resumed** session gets more than this tree holds from
   `mem_context` on that project — including facts deliberately kept out of the repository (§5.2 explains why a
   meta-record does not get its own commit).
3. **Arena**: prove reachability with a real tool call, never `curl` alone. Sessions 63–68 evidence:
   `pi mcp list` shows **no `arena` server registered**, and a TCP connect to the documented endpoint
   (`timeout 5 bash -c '</dev/tcp/127.0.0.1/8765'`) answers **connection refused**. That satisfies DN-09's
   substitute condition directly.

### 0.4 Standing instructions from the Director

- **RDD consent is asked per candidate; never answer it for the Director.** A decline is candidate-scoped and
  is not the kill switch, and it never lowers the bar: the RDD-off fallback re-enables the separate verifier.
  **The consent binding EXPIRES AFTER 10 MINUTES**, so `inspect` → START → answer must fit in one
  uninterrupted window. **Do not re-drive START against a candidate the host already disposed of.**
- **Commits and push are authorized per session, and the two are not the same authorization.**
- **Never accept a partial judgment, and never accept an `APPROVE` as if it were the gate.**
- **Commit messages carry no `Co-Authored-By` and no AI attribution**; conventional commits only, by work
  unit.
- **Never trust a delegated agent's own report at face value** — and equally, **never report a verification
  that did not happen** (§5). Re-verify the delegate's own artifact where one exists: re-run its probe, read the
  committed file it claims to have checked, confirm `git diff` is empty, and clean up any scratch it left in
  `%TEMP%`.
- **The `frisco` binding is live and must not be re-armed** (§3).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1–F5 | **Archived**, unchanged since session 55 | `openspec/changes/archive/` |
| B-98, B-99, B-100(a)(b), B-101, B-103, B-104 | Closed (sessions 55–61); **B-99 still open** (see its row) | `docs/06-backlog/CHECKLIST.md` |
| **B-105** | **CLOSED COMPLETELY — sessions 61 & 66** | `docs/runbooks/wake-satellite.md`; ADR-0032 |
| **B-106** | **CLOSED COMPLETELY — sessions 62 & 65** | `odd/tasks/b-106-occupancy-and-dead-pid-sweep.md` |
| **B-107** | **RESOLVED — session 62** under [ADR-0033](../03-adr/0033-project-flag-as-assertion.md); **its machine-state half landed 2026-10-07** — the last project-level Pi registration (`FRISCO\.pi\mcp.json`) was retired, so one id-free user-level entry now serves every tree. Verified with `pi mcp list` in the FRISCO root **and** in `frisco-erp`: both now `conmuta: connected, 4 tools (direct, global)`, where before the root resolved `project` (a trust-gated file) and the subfolder `global` | `docs/03-adr/0033-project-flag-as-assertion.md`; `~/.pi/agent/retired/frisco-project-mcp-json-20261007/README.md` |
| **B-130** | **CLOSED — 2026-10-07 as (b): the boundary is declared, not gated.** A ring can name `conmuta_fetch` in a session that has no such tool, and the adapter cannot detect it — a delivery-time gate would either suppress the legitimate startup ring inside the ~4 s window B-124 measured, or add retry state to the component whose failure mode is silence, and either way it would trade a visible configuration error for an invisible suppression. ADR-0036's third amendment records it; the operator's half (`pi mcp list`) is in the runbook | `docs/03-adr/0036-pi-host-doorbell-adapter.md`; `docs/runbooks/host-doorbell-pi.md` |
| **B-131** | **OPEN — deliberately deferred, 2026-10-07.** Nothing detects a project-level Pi registration that masks the user-level one, and `conmuta project bind` can re-create it (id-free now, so the two would agree in content, but the trust gate returns for that tree's root while subfolders keep the user-level path). Low likelihood, bounded harm (the `frisco` ladder is off — §3 item 2), moderate cost | `docs/06-backlog/CHECKLIST.md` row B-131 |
| **B-132** | **CLOSED — 2026-10-07 (`ac1cd24`).** Both independent review lineages named the gate's **region handling** (`test/security/backlog-table.test.ts:97-108`) and it is now hardened, test-first: the table opener is validated (the header row **and** the delimiter above the first body row, each carrying the board's seven separators, reported as `table-header`); a `#` line is accepted only behind a blank line, so a continuation glued to a row is reported instead of read as a section heading; the fixture assertion names the exact seeded set (lines 14-17) instead of accepting *some* cell-count violation; and `rowFloorFailure` makes the row floor a test of its own. RED observed at the assertion level (four failures) before the implementation, GREEN after; reviewed natively (`review-1872a30c548e8a95`, tier high, four lenses, approved, authority burned) and independently verified | `odd/tasks/b-132-board-gate-region.md`; `docs/06-backlog/CHECKLIST.md` row B-132 |
| **B-133** | **OPEN, informational — the five advisories of B-132's own review, recorded at capture time.** Lineage `review-1872a30c548e8a95` (approved, acknowledgement burned) listed `R2-001` (WARNING, readability, `:84-85`), `R2-002` (WARNING, readability, `:243-245`), `R3-001` (WARNING, reliability, `:86`), `R3-002` (SUGGESTION, reliability, `:112`) and `R4-001` (WARNING, resilience, `:162`) — all on `test/security/backlog-table.test.ts`, all declared informational, none opening a correction. The ids, locations, severities and dispositions are written down because the reviewer's prose is unrecoverable after acknowledgement (B-126); acting on them means a fresh look | `docs/06-backlog/CHECKLIST.md` row B-133; B-126; B-128 |
| **Board row shape** | **GATED — 2026-10-07; extended by `ac1cd24`.** `test/security/backlog-table.test.ts` plus `test/fixtures/backlog-table-negative.md`: after the first row, every non-blank line must be a row carrying exactly seven separators, counted by GFM's parity rule. Since `ac1cd24` the table's opener is validated too (the header row and the delimiter above the first body row must each carry those seven separators), and a `#` line is accepted only behind a blank line. It caught four real rows (B-31, B-56, B-106 with a raw pipe inside a cell; B-108 wrapped over 26 physical lines) | `test/security/backlog-table.test.ts` |
| **B-108** | **CLOSED — session 63** (`withInstallerLedger`) | `src/cli/main.ts` |
| **B-109** | **CLOSED — session 63** under [ADR-0034](../03-adr/0034-id-free-installer-entry.md) | `docs/03-adr/0034-id-free-installer-entry.md` |
| **B-110** | **CLOSED — session 64** (relative Markdown link gate in `test:static`) | `test/security/markdown-links.test.ts` |
| **B-111** | **CLOSED COMPLETELY — session 67** under [ADR-0035](../03-adr/0035-pre-validate-tool-configs-in-project-bind.md) | `docs/03-adr/0035-pre-validate-tool-configs-in-project-bind.md` |
| **B-102** | **CLOSED & AUDITED — sessions 68–69** (residuals a, b, c, f, g; d and e were closed in sessions 56/57). Three checks over three windows: a reconcile that begins after `stopAll()` returns unchanged; an in-flight reconcile re-checks the latch at the top of each remaining binding and again after `buildTransport` resolves, so the poller factory is never reached; and the factory receives an abort signal `stopAll()` aborts, so a poller created after the latch flipped touches no ledger. Plus: the update-existing-binding branch pinned, the latch's terminal contract stated, `stop()` recording the tick it gave up on, and two fixed-sleep stability proofs replaced. The first attempt at (f) was rejected by `jd-judge-b` in session 68 and corrected in `5bf647a`; `jd-judge-a` completed in session 69 with zero findings, closing Judgment Day audit `bus-v2-b102-residuals-001` with terminal verdict **`APPROVED`** | `odd/tasks/b-102-residuals.md`; `docs/06-backlog/CHECKLIST.md`; `docs/05-tribunal/INDEX.md` |
| **B-95 remainder** | **CLOSED COMPLETELY — session 70** under ODD (`odd/tasks/b-95-remainder-fetch-corrupt-row.md`). Safe corrupt-row policy in `src/daemon/serve/fetch.ts:244-246` (skips corrupt/unparseable rows without failing, cursor advances past them); review notes R3-1 (doorbell.ts to check) and R2-1 (comment drift) resolved. | `src/daemon/serve/fetch.ts`; `docs/06-backlog/CHECKLIST.md` |
| **B-97** | **CLOSED COMPLETELY — session 70.** The guard was already `import.meta.main` (session 55, `24d7dc6`); what session 70 closed is the row's own premise plus the missing ADR-12 pin. The defect class is any link the entry path crosses, not only a POSIX symlink: a Windows directory **junction** reproduces it with neither Developer Mode nor admin. Measured against the built bundle here — old guard: direct `exit 2` but junction `exit 0` with **zero bytes** on both streams (the silent no-op); `import.meta.main`: `exit 2` both ways. New test `test/cli/main.test.ts`'s "the entry guard fires when the built CLI is reached through a directory link (B-97)" creates the junction and spawns through it; non-vacuity is a restored old guard failing that test while the pre-existing direct test still passes. No `src/` change; no separate POSIX CI job (the row offered it as an alternative, and `windows-latest` now exercises the guarantee). | `test/cli/main.test.ts`; `docs/06-backlog/CHECKLIST.md` |
| **B-31** | **CLOSED — session 70.** R5's scan runs pre-parse (design §4), so a token written as a JSON escape (`1234567\u003aAAHk…`) held no literal shape in the file and was accepted, then sat in `registry.json` and the daemon's memory reported by nothing. `src/registry/loader.ts` gained a post-parse walk over values **and** key names, reusing `assertNoTokenShape` and — load-bearingly — the existing `withoutRosterHashes` mask, with `MAX_CONTENT_WALK_DEPTH = 32`. 5 tests in `test/registry/loader.test.ts` (escaped value, escaped key, nested, the hash exemption surviving and not shadowing, the depth bound); RED before GREEN, non-vacuity by mutation. | `src/registry/loader.ts`; `odd/tasks/b-31-registry-escaped-token.md` |
| **`solo-sesion-viva`** | **Session 71 — the bus answers only from a live session.** `SEND_PROOF_PROFILES` (`wake` on `pi` = `--no-extensions --tools read,grep,find,ls`, appended last, after the record's own args); `refused (profile_unavailable)` for `autopilot` and the three unverified harnesses; tool-exposure flags refused; `audit_log.client_id` carries the sender on every send row (was hardcoded `null`). Runbook, ADR-0032 amendment and README row 5 updated. Live probe: the profile declares exactly `read,grep,find,ls` — no `bash`, zero `mcp__conmuta`. **B-112**, **B-113** filed. Branch `fix/solo-sesion-viva`, **pushed** in session 72, **merged** in session 73 (`925c10d`). | `odd/tasks/solo-sesion-viva.md`; `docs/runbooks/wake-satellite.md`; `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md` |
| **B-99** | **CLOSED COMPLETELY — sessions 55 & 69** (commit `dd464a7` converted the three original tests to `waitForCondition`; session 69 closed the remaining fixed sleeps in `heartbeat.test.ts` and converted `bootstrap.test.ts:517` to positively observe live ticks with stable audit rows, plus converting boot/add waits to condition waits) | `odd/tasks/b-99-timer-tests.md`; `docs/06-backlog/CHECKLIST.md` |
| **F7c / B-116** | **DELIVERED (T1–T5) — session 72; T6 owed.** `channel-pi/` (ADR-0036): a host-side Pi extension that holds F4's body-less doorbell and injects one attributable, body-less ring (`pi.sendMessage` with `customType` `conmuta-doorbell`, `triggerTurn: true`, `deliverAs: "followUp"`), which starts a turn in the live session so it can fetch and answer. Measured reason it is an extension and not a port: Pi renders **no** MCP notification. Pinned by 6 ring tests, 6 lifecycle tests, a bundle-closure gate (the ring is the only `.sendMessage(` call site; no `src/daemon/`, no Telegram path), an extended twin gate and a packed-entry assertion. Verified live against the running daemon (`client_cursors.host = pi-host-doorbell`) and **armed machine-wide** by the Director's instruction. **The ring's end-to-end firing with a roster peer is owed (B-114 / T6)**. **Audited and merged in session 73** (`8e8d8b7` fixes the CRITICAL the audit's two blind reviewers found independently; `21fcc40` corrects three claims that were stronger than their controls; merge commit `925c10d`). The residual the audit then found in the fix is filed as **B-117**. **Session 74 amended ADR-0036 and closed B-124**: the machine-wide adapter rang harness children, so the watcher now arms only in an interactive session (`mode === "tui"`, or `rpc` with `GENTLE_SHELL_INTERACTIVE_HOST=1`); two blind judges corrected the first `tui`-only cut, and the fix merged as **PR #110** (`0f7707c`) | [ADR-0036](../03-adr/0036-pi-host-doorbell-adapter.md); `odd/tasks/f7c-pi-host-doorbell.md`; `docs/runbooks/host-doorbell-pi.md` |
| **B-115** | **CLOSED — session 72.** The audit that recorded the truth (*no ladder level reaches a live host session*) and the classification that closed it (new row **B-116** under new phase **F7c**, on the Director's explicit answers). The gap it named is now addressed by shipped code; what remains is the live firing, tracked under B-114 | `odd/tasks/b-115-wake-does-not-reach-a-live-session.md`; `docs/06-backlog/CHECKLIST.md` |
| **B-124** | **CLOSED — session 74** (`013ca80`, corrected in `d92f2ae`; merged as PR #110, `0f7707c`). The machine-wide `channel-pi` adapter rang gentle-pi's harness children — a child `pi --mode rpc` was rung at `session_start`, its ring started a turn before the parent's task and the parent's prompt was rejected — so the watcher arms only for a session a person is sitting in (`mode === "tui"`, or `rpc` with `GENTLE_SHELL_INTERACTIVE_HOST=1`). Two blind judges found the first `tui`-only cut switched the ring off for the attended desktop host and failed acceptance criterion 2; the correction mirrors gentle-pi's `isInteractiveMode` and was re-verified | [ADR-0036](../03-adr/0036-pi-host-doorbell-adapter.md) "Amendment (2026-10-06)"; `odd/tasks/f7c-doorbell-child-session-collision.md`; `channel-pi/main.ts` |
| **B-85 (1)** | **CLOSED — session 75** (`9577f23` on `fix/b-85-dm-probe-honest-status`). The DM probe reported `status: "pass"` for a probe that reached only some roster peers, and for a roster with no peer besides the bot — where it also wrote an `ok` `DOCTOR_PROBE` row although nothing was sent. It now follows the audit outcome: `degraded` → `warn`, and a zero-peer roster → `warn` with an explicit detail and no row. RED observed first, natively reviewed and approved (`review-1ee5438a4b675bd7`). **Merged into `main` in session 76 as `f71d0e9` (PR #111)**, both CI legs green (2m13s / 2m6s). **(2)–(4) remain open** | `odd/tasks/b-85-dm-probe-honest-status.md`; `src/daemon/ipc/doctor.ts`; `docs/06-backlog/CHECKLIST.md` |
| **B-127** | **CLOSED — session 75** (`04706bd`, `86d1a5b` on `fix/b-127-channel-pi-lifecycle`; the row reads `done` on that branch and **landed with the merge in session 76 as `bd0688d`** — after its one-line `CHECKLIST.md` conflict was resolved, which was what had been hiding the fact that the PR had never had a CI run at all, see §4). Both verified defects fixed under ODD, RED before GREEN: a second `session_start` now closes the superseded link before replacing it, so a reload returns the daemon session slot it held; and the adapter keeps the module doc's "each condition is said once" promise with a per-session, message-keyed gate, so a persistent failure no longer warns every 5 s. `channel/doorbell-loop.ts` is deliberately untouched. Reviewed and acknowledged (`review-93f6998584b08998`, approved; its refuter batch refuted the one CRITICAL) | `odd/tasks/b-127-channel-pi-lifecycle.md`; `channel-pi/main.ts`; `test/channel-pi/main.test.ts`; `docs/06-backlog/CHECKLIST.md` |
| **B-125** | **OPEN — session 75: the exact patch and its two supporting host facts are written.** `odd/tasks/evidence/b-125-child-no-extensions.md` carries the precise diff against gentle-pi's `childArguments`, the measurement that `--no-extensions` suppresses settings-driven discovery only (`lib/gentle-shell-launcher.ts:928`, comment at `:904-908`) while per-child `--extension` paths keep loading (`lib/agents-runner.ts:260`), the discriminating tests, and why no local `node_modules` patch is a substitute. **Nothing in another package was edited** | Director (cross-package, now one hop) |
| **B-126** | **OPEN, and now measured unrecoverable — session 75.** `R3-001` (WARNING, `channel-pi/main.ts:113`) and `R3-002` (SUGGESTION, `channel-pi/main.ts:86`) cannot be read back: acknowledging a review deletes its transaction directory, leaving only a 259-byte `terminal-consumption/v1` pointer. Reproduced with session 75's own lineage `review-1ee5438a4b675bd7`. The re-derivation was run instead and filed as **B-127**. Same class as **B-21**, **B-22**, **B-32**, **B-36** | Director (informational) |
| **B-112** | **MEASURED — session 76; only `claude`'s live probe remains, and it is blocked on a credential.** The row asked to verify each harness's own tool-restriction flag on the installed binary, the way session 66 verified the argv forms; session 71 had set the bar with `pi`. **`codex` fails it**: probed live under `-s read-only --ignore-user-config`, a turn starts and completes yet still declares `functions.exec_command` (a shell), `functions.web__run` (network), `collaboration.send_message` and the MCP resource tools, and `read-only` restricts the filesystem, not the local IPC. **`opencode` has no flag-level restriction to declare at all** (`--pure` drops external plugins only; permissions live in its config/agent layer). **`claude`** documents a true analogue (`--restricted` plus `--strict-mcp-config`) and both flags were shown to parse on the installed binary with a bogus-flag control, but the binary cannot authenticate here (`OAuth session expired and could not be refreshed`), so the tool-declaration probe has not been run for it. All three stay `null`: `null` refuses the turn, while a wrong profile starts a turn that can send | `odd/tasks/evidence/b-112-harness-send-proof-verification.md`; `runner/constants.ts` |
| **B-117** | **CLOSED — 2026-10-07.** The Director confirmed the ADR's recommendation (option (c)) with full authority, and it is implemented: a record argument is classified by **shape** before the send-proof profile is appended — `--name=value` for a flag that takes a value, a bare flag only when it is on the named value-less allow-list, and any positional (`@file` included) refused by the same rule that refuses `--`. The swallow is now **unrepresentable** instead of merely unenumerated; the new refusal reason `argument_shape_invalid` is deliberately distinct from `arguments_refused`; `REFUSED_ARGUMENTS` and the appended-last position both stay. RED observed first (the two shape pins failing while pins 3-5 stayed green, then reproduced independently by mutating the compiled check), GREEN after. ADR-0037 is `accepted` and its operator-facing argument form changed with the code | [ADR-0037](../03-adr/0037-self-contained-record-arguments.md); `runner/harness.ts`; `runner/constants.ts`; `odd/tasks/b-117-record-argument-shape.md` |
| **B-119** | **DECIDED — ADR-0038 `accepted` (2026-10-07), option (b) taken under the Director's delegation; the code lands next.** The ADR accepts the ring as **best-effort** and pins its bound instead of narrating it: the extension-facing `sendMessage` is declared `void`, so there is no delivery result to inspect, and refusing an undecidable outcome would turn every cooldown-*merged* ring into a back-off loop — so a test must show a swallowed ring still leaves the *message* visible to the session's own client cursor, while the detectable half (the stale-context throw) keeps being retried. Carries the appended amendment for ADR-0036. No code changes until confirmation | `docs/03-adr/0038-a-ring-is-best-effort.md`; `channel-pi/host.ts` |
| Next SDD change | None queued. F6 blocked on B-11/B-12/B-16; F7b follows F6; F7c is delivered outside SDD | `docs/07-plan/WORK-PLAN.md` |
| Tests on the merged branch | `npm test` **1974/1968/0/6**; `test:static` **129/129**; `test:wrong-room` 5/5; `%TEMP%` 0 → 0 from a clean build (2026-10-07; at `ac1cd24` it was 1969/1963, and the five tests above that are ADR-0037's pins) | — |

---

## §2 — What earlier sessions did (context, not to redo)
> **Sessions 75 and 74, in full.** Kept here rather than at the top of the file, because the top belongs to the
> current session and **a narrative paragraph is not an instruction** — which is how a stale number written at the
> top gets read as present state. Newest first.
>
> **Session 75 in one paragraph — the doctor told the truth, and B-126's pointer was measured dead.** The preflight
> stopped on a **dirty tree**: session 74's *documentation* close (this handoff rewritten to session 74, its `LOG.md`
> narrative and the B-126 row) had been produced by a bounded documentation writer and never committed, so `HEAD`
> still carried the session-73 handoff; it was committed as **`8012434`** after `test:static` **120/120** and pushed.
> Then unit (1) of **B-85** was fixed under ODD: `runDmProbe` (`src/daemon/ipc/doctor.ts`) returned `status: "pass"`
> for a probe that reached only *some* roster peers, and for a roster with no peer besides the bot at all — where it
> also wrote an `ok` `DOCTOR_PROBE` row although nothing was sent. The status now follows the audit outcome
> (`degraded` → `warn`; a zero-peer roster → `warn` with an explicit detail and **no** row, the
> unwired-room-guard branch's own rule), RED before GREEN, work unit **`9577f23`** on
> **`fix/b-85-dm-probe-honest-status`**, natively reviewed and **approved** (lineage `review-1ee5438a4b675bd7`,
> tier medium, one lens, authority burned); B-85 (2)–(4) stay open. **B-126's premise was wrong and is now
> measured**: acknowledging a review *deletes its transaction directory*, so the prose that row said "lives in that
> lineage" is gone the moment the lineage is acknowledged; a fresh **independent** review of `channel-pi/` was run
> instead, and it found two *different* defects — re-verified in the code by mechanism, not taken on the delegate's
> word — filed as **B-127** (a reload leaks a daemon session slot until the pool is full and the daemon must
> restart; every failed tick warns through the UI), and **fixed in the same session** (`04706bd`, `86d1a5b` on
> `fix/b-127-channel-pi-lifecycle`, RED before GREEN for both). Its own review closed **approved** (lineage
> `review-93f6998584b08998`): the provider's refuter batch ran and **refuted** the single CRITICAL, and the three
> remaining findings are informational and filed as **B-128** — recorded at capture time, because that is the one
> thing B-126 proved cannot be recovered afterwards. **B-125** was given its exact cross-package patch and the two
> host facts that make it safe. **T6 / B-114 is still owed**: this tree's roster is `@kairo-agent` alone, so nothing
> here can ring.
>
>
> **Session 74 in one paragraph — the doorbell must ring only a session that can answer.** The machine-wide
> `channel-pi` doorbell rang **gentle-pi harness children**. A child is a `pi --mode rpc` process started by
> `lib/agents-runner.ts` with `--tools read,grep,find,bash` and no `--no-extensions`; in a bound tree it was rung at
> `session_start`, the ring started an automatic turn before the parent's task, and the parent's `{type:"prompt"}`
> was rejected with *"Agent is already processing…"* — the child failed with **zero tool calls**, and transcript
> `2026-10-06T00-09-38-630Z_01a10e8b…jsonl` shows the `conmuta-doorbell` `custom_message` as entry 5, before any
> parent prompt. A project-level `"extensions": ["-<path>"]` does not override the machine-wide inclusion.
> **`013ca80`** armed the watcher only for a session a person is sitting in (`mode === "tui"`), and the audit
> corrected that first cut: two blind judges independently found the `tui`-only gate switches the ring off for the
> **attended** desktop host (Gentle Shell `rpc` plus `GENTLE_SHELL_INTERACTIVE_HOST=1`), failing acceptance
> criterion 2, and the controller canonicalized it to CRITICAL; **`d92f2ae`** mirrored gentle-pi's
> `isInteractiveMode`, and the scoped re-judgment returned **verified / verified**. The tool-presence signal was
> rejected on measurement — `getActiveTools()` at `session_start` lists no `mcp__conmuta__*` even in a full
> interactive session (MCP connects about 4 s later) and `hasUI` is `true` in an rpc child. **PR #110 merged as
> merge commit `0f7707c`** at 2026-10-06T02:02:15Z; **ADR-0036 was amended 2026-10-06 before the code, B-124 is
> closed, and B-125 is open.** The native review moved all four lenses and the default model to DeepSeek and then
> closed **approved** (lineage `review-31c2f822ffaf0aee`), with two informational findings filed as **B-126** — whose
> pointer is dead, see B-127. The ring's first real firing with a roster peer was **still owed (B-114 / T6)** at that
> session's close, and remains owed.
>
1. **Session 70** closed **B-95 remainder** under ODD (`odd/tasks/b-95-remainder-fetch-corrupt-row.md`): safe `parseStoredEnvelope` in `src/daemon/serve/fetch.ts` skips corrupt/malformed `envelope_json` rows without throwing, allowing `lastRowSeq` to advance `cursor.next_update_id` past damaged rows so the client never stalls; review note R3-1 addressed in `doorbell.ts` (tightened `to` check) and R2-1 in `test/channel/main.test.ts` (drift comment removed); 14 test cases added in `fetch.test.ts` (RED before GREEN observed, non-vacuity proven by mutation); landed session 69's B-102 and B-99 commits. Then closed **B-97** by correcting its premise: the guard defect triggers through *any* link, and a Windows directory junction reproduces it without privileges (direct `exit 2` vs junction `exit 0`, zero bytes), so a genuinely RED-reproducing test now pins it. Then closed **B-31** with the registry's post-parse leak gate (`odd/tasks/b-31-registry-escaped-token.md`).
2. **Session 69** completed the missing second blind review for B-102 (`jd-judge-a` returned 0 findings, closing `bus-v2-b102-residuals-001` APPROVED); and closed **B-99 completely** under ODD (fixed sleeps in `heartbeat.test.ts` converted to `waitForCondition`/`assertStableFor`; `bootstrap.test.ts:517` converted to positively observe live ticks via `daemon.lock`'s `heartbeat_at` and `getUpdatesCalls` while asserting stable audit rows; boot and hot-reload waits converted to condition polls).
3. **Session 68** closed B-102: three shutdown-latch checks over three windows, the update-existing-binding guard branch pinned by test and mutation, the latch's terminal contract stated, `stop()` recording the tick it gave up on, and two fixed-sleep stability assertions replaced by `assertStableFor`. Its first attempt at (f) was rejected by an independent judge and corrected in `5bf647a`.
4. **Session 67** closed B-111 completely: `checkFileEdit` pre-flight validation in `project bind` before any write, `tool-config-refused` reported cleanly, ADR-0035 authored.
5. **Session 66** closed B-105 completely: argv forms of all four harnesses verified live with `shell: false`.
6. **Session 65** closed B-106 remainder: dead-PID sweep in `routes.ts`, session occupancy in `status` and `doctor`.
7. **Session 64** closed B-110: relative Markdown link gate in `test:static`, 38 archive links repaired.
8. **Sessions 62–63** closed B-107 (ADR-0033), B-106's source, B-109 (ADR-0034) and B-108.

---

## §3 — What's next

0. **The merge decision for PR #106 is the Director's, and it was taken on 2026-10-05: `MERGED` at 19:13:15Z as merge
   commit `925c10d`.** The audit is done and recorded (`bus-v2-pr106-audit-001`), and the merged branch carries
   `8e8d8b7` (the CRITICAL fix) and `21fcc40` (the corrected claims). Seven rows — **B-117–B-123** — carry the
   audit's non-blocking findings, including the design decision it deliberately did not take (**B-119**, whether a
   ring that was never delivered should be retried or accepted as best-effort). The session-73 record followed in
   **PR #107** (`35ac1a6`) and the documentation hygiene in **PR #108** (`38c1346`). Session 74 then merged the
   doorbell fix as **PR #110** (`0f7707c`, the `channel-pi` interactive-only arming) after its own blind dual audit,
   closing **B-124** — **nothing is open on the merge gate.** Session 76 emptied it completely: **#111 → `f71d0e9`,
   #112 → `bd0688d`** (see §4 for the conflicting-PR trap that hid its missing checks) and **PR #113 → `57a0919`**
   for the B-112 measurement and the two ADRs.
1. **The ring owes its first real firing, and that is the only unit the bus front has left (F7c T6 / B-114).** With
   the adapter armed, a roster **agent** sending a directed message or a broadcast should make the open session ring
   and answer. It needs a peer whose owner is available: AGENTBUS has no private loopback, a human `user_id` is not
   on the roster (ingest drops it as `unknown_sender`), and a test message fans out to every agent in the group.
   Acceptance is the raw evidence: the transcript showing the `conmuta-doorbell` entry and the automatic turn, plus
   the `audit_log` `send` row carrying a **non-null `client_id`**. Until a peer is available it stays **owed**, never
   declared. Note the tree matters: this repository's own roster is `@kairo-agent` alone, so nothing can ring here —
   a tree with peers is where it must be shown. What sits beside it rather than blocking it: **B-125** (the
   `gentle-pi` `--no-extensions` proposal for harness children, now with its exact patch in
   `odd/tasks/evidence/b-125-child-no-extensions.md`), **B-126** (measured unrecoverable, §7) and **B-128** (the
   informational findings of B-127's own review, §7). **B-127 is no longer among them: merged into `main` as
   `bd0688d` (§1).** Session 76 shortened the rest of the list too: **B-112 is measured** — `codex` fails the bar,
   `opencode` has no flag-level profile to declare, and `claude` awaits only a valid credential — and **B-117** was
   confirmed and implemented on 2026-10-07 (§1), while **B-119** still has its ADR written (`proposed`) and needs
   one confirmation rather than a design.
2. **The `frisco` despertador is OFF, and it must stay off.** Session 71 disabled it, removed the Startup entry and killed both processes, on the Director's order that the bus answer only from a live session. Re-arming is a Director decision and a deliberate act: `wake` no longer replies (it has no bus and no shell) and `autopilot` is refused, so `notify` is the only level that does anything useful. See the runbook's "A woken turn cannot send".
3. **The bus is registered ONCE, id-free, at the user level** (`~/.pi/agent/mcp.json`), per ADR-0033.
4. **No open row the harness can close alone.** B-132's fresh look at the board gate's region handling was the last one, and it is **closed** (§1, `ac1cd24`): nothing else in the backlog can be finished without a product decision, the Director, or a peer. B-127 was the one before it and it is done too (§1); what remains is either the Director's, needs a peer (T6), or is a scheduled class:

   **3.1 — Director-only decisions.** **Seven** filed rows are the Director's, each with its evidence in §7: **B-112** (the send-proof profile is verified for `pi` only; **measured in session 76** — `codex` provably retains a shell, network egress and a messaging tool, `opencode` has no flag-level restriction to declare, and `claude` needs only one valid credential for its live probe, so the remaining decision is whether to re-authenticate and finish it or leave the three `null`), **B-113** (the daemon cannot accredit "a human is present"), **B-119** (ADR-0038 is `accepted` — 2026-10-07, option (b) under the Director's delegation — so its code, its four pins and the one further amendment to ADR-0036 are the next unit; the **B-117** that used to sit here is `done`, §1), and **B-129** (ADR-0036 names a per-window ring budget that is not implemented; **the choice is to implement it**, so this one is now engineering rather than a decision), **B-125** (pass `--no-extensions` to harness children — a `gentle-pi` change this repository only proposes and deliberately does not make) and **B-126** (the two informational findings of PR #110's native review, measured unrecoverable), and **B-128** (the informational findings of B-127's own review, recorded at capture time). **B-11** (trademark), **B-12** (macOS smoke test), **B-16** (open-source files) gate F6; **F7b** follows F6. **B-101** (relocation of the Judgment Day operating detail out of this overwritten file) is editorial and `GOVERNANCE.md` is constitution-adjacent, so it is not a drive-by move. **B-04** (desktop shell) and **B-01/B-02/B-03** (group referee, skill templates, ticket-ledger location) are product decisions.

   **3.2 — Spike/research rows, each needing a real investigation.** **B-05** (gentle-ai installer study), **B-07** (bot-to-bot group visibility for non-admin bots), **B-08** (IPC handshake + named-pipe DACL on Windows), **B-09** (MCP notification rendering per host).

   **3.3 — The long tail: 91 open rows, almost all deliberate non-blocking deferrals from past reviews** (the handoff said 78; the board is what counts, re-measured on 2026-10-07). **The class scheduled next, under the Director's delegation, is silent-false-health** — B-82's assertions that cannot fail, plus the remainder of B-85. They are the residue of the F1/F2 SDD cycles and were each filed as "non-blocking, disclosed rather than fixed". Do **not** walk them one at a time; they fall into a handful of root classes, and the honest move is to schedule a class or leave it. The ones with real teeth, so a future session does not have to re-triage 78 rows to find them:
   - **Silent-false-health.** `B-85` — a partial or empty DM-probe result reports `status: "pass"` in `doctor`. A doctor that lies about health is worse than no doctor. **`B-82`** — two genuinely vacuous test assertions ("a test that can never fail proves less than no test at all").
   - **Data-integrity blind spots.** `B-54` — `daemon/bootstrap.ts` never checks `LedgerOpenResult.status` for `"quarantined"`, so a daemon whose ledger was quarantined silently boots against a fresh empty database (the same blind spot PR-37 fixed in `migration/main.ts`; note the product choice inside it: warn loudly, or refuse to boot and take the bus down). `B-28` — no R1–R6 row demands referential integrity, so a dangling `bot_id`/`group_id`/`project_id` in `registry.json` loads. `B-29` — nothing ties `roster_hash` to the snapshot it is derived from.
   - **The B-27 / B-30 / B-31 registry cluster.** B-31 is now closed; **B-27** (the shared token regex's unbounded `\d+` matching `sha256:<64 hex>`) and **B-30** (R5's strictness refusing human-authored text such as a group `title` of `Authorization review`) remain, each with a recorded product/stored-format decision inside it. B-27 also reaches `checkForSecrets` (an outbound body quoting a roster hash would be refused) and `redactTokenShapes` (a roster hash in a log would be redacted).
   - **Flakes.** `B-39` and `B-57` (wall-clock-sensitive daemon-lifecycle tests make a red CI leg not by itself evidence of a broken commit) and `B-91` (`test:wrong-room`). B-99 and B-96 already closed this class's worst members.
   - **Coverage that is skipped rather than failing.** `B-68`, `B-74(3)`, `B-75(3)` — fake-exec tests skipped on non-Windows hosts although they spawn nothing; `B-24` — no POSIX CI leg at all, so packaging and shebang/file-mode contracts cannot fail here (B-97's own premise lived in this gap).

5. **Then F6** once B-11/B-12/B-16 are decided; **F7b** after F6.
6. **Do not restart B-105, B-106, B-108, B-109, B-110, B-111, B-102, B-99, B-95, B-97 or B-31** — all are closed with evidence (§1).

---

## §4 — Facts that will bite you

- **A conflicting PR gets NO CI run at all, and `gh pr checks` says so quietly — that is the trap (measured
  2026-10-06).** PR #112 answered `mergeable: CONFLICTING`, `mergeStateStatus: DIRTY`, `check-runs.total_count =
  0`, `gh pr checks 112` → `no checks reported on the branch`, and `gh run list --branch …` → empty. Cause:
  `.github/workflows/ci.yml` triggers on `pull_request`, and GitHub cannot build the synthetic merge commit for a
  conflicting pull request, so **`refs/pull/112/merge` does not exist** — only `refs/pull/112/head`
  (`git ls-remote origin 'refs/pull/112/*'`). No merge ref, no run. The PR was opened at 03:39:23Z, five seconds
  after `main` took `61c946c`, so its single conflicting docs row existed from the moment it opened. This is a
  **different trap** from the cancelled-job one above: there the check ran and died with no log; here it was never
  created, so "no checks reported" reads like a clean bill rather than a warning. After the conflict was resolved
  and pushed the merge ref appeared (`d1e2cdd`) and the run started on its own (run `37411590337`, both legs pass).
  **Before calling any PR merge-ready, check `mergeable` *and* that `refs/pull/<n>/merge` exists** — and read
  `mergeable`/`mergeStateStatus` from `gh pr view --json`, because `gh pr list --json` returns `UNKNOWN` for both.
- **A red CI run in this repository can be a cancellation, not a failure — measured 2026-10-05.** Six `build-and-test`
  jobs across four runs, **including one on `main`'s own merge commit**, completed **`cancelled`**, every one of them
  with **no log at all** (`gh run view --job <id> --log` answers `log not found`), and in each run the sibling leg
  completed `success`. `.github/workflows/ci.yml` has **no `concurrency` block**, the repository is **public**, and
  there is no `timeout-minutes`: the `windows-latest` runner simply never arrives (one run sat with **both** legs
  queued for ~25 minutes). **So read the jobs before believing a red** — `gh run view <run-id> --json jobs` names
  `cancelled` apart from a failure, and `gh run list --limit 5` shows the queue. It is a *check to verify*, never a
  check to dismiss. When the gate cannot be satisfied, reproduce **every step of the workflow locally**
  (`npm run build`, `npm test`, `npm run test:wrong-room`, `npm run test:static`) and record in the merge message
  which check never ran: **a check that never ran is not a check that passed.**
- **Falsify a delegated finding; never quote it.** The PR #106 audit's round 1 asserted that Pi's extension
  `sendMessage` cannot throw. The writer believed it, rewrote `channel-pi/host.ts`, renamed a test that was *not*
  vacuous, and that landed in `main` — before the next pass read the API layer that **does** throw
  (`dist/core/extensions/loader.js:302-305`, `:113-115`) and found the round-1 claim wrong. Verifying the evidence a
  reviewer cites proves the reviewer read *that*; it does not prove the claim. Try to **negate** it instead, and
  check this repository's own record first: session 72 had already written the opposite down. The retraction is in
  **B-119**, in the session-73 entry of `LOG.md`, and in a comment on the merged PR #106.
- **`BindingsReconciler`'s shutdown latch has three checks for three windows, and none substitutes for another (B-102f).** `stopAll()` is terminal and once-per-process. (1) A `reconcile()` that *begins* after it returns unchanged. (2) A reconcile already *in flight* re-checks the latch at the top of each binding still to process (`break`) and again after `buildTransport` resolves (`continue`, discarding the transport, which owns no socket). (3) The poller factory receives an `abortController` signal that `stopAll()` aborts, so `startPoller` — whose whole loop body is skipped for an already-aborted signal — never prepares a statement against the closed ledger. The post-`createPoller` guard remains as the last line for a poller that was already running. Removing any one of the three re-opens a real window; the second and third were each proven necessary by mutation.
- **`DaemonInstance` exposes `stop` but not `reconcile`** — the only reconcile callers are the boot sequence (`bootstrap.ts:242`) and the heartbeat tick (`:334`).
- **`raceAgainstTimeout` is deliberately silent about which side won.** `stop()` observes the tick's settlement itself; do not "simplify" that away, and do not move the log into `raceAgainstTimeout` — it is a generic single-purpose module with no `runDir`, kept out of `bootstrap.ts` so the daemon bundle's audited timer inventory stays confined.
- **The installer CLI's ledger handle is closed now — do not "simplify" `withInstallerLedger` away.**
- **The written tool-config entry is id-free (ADR-0034).**
- **Tool-config merges in `project bind` are pre-validated before any write (ADR-0035, B-111).**
- **Two identifiers must not be mixed**: Engram `connmuta` (repo) vs. Engram `frisco-erp` and bus `frisco`.
- **The daemon's session pool is bounded at `MAX_ACTIVE_SESSIONS = 64`** (`src/shared/constants.ts`).
  Session release runs on transport close (B-106 source); dead PIDs are swept on `POST /session` and
  `POST /tools/status` (`sweepDeadSessions`); occupancy is visible in `status` (`daemon.sessions`) and
  `doctor` (`session-pool`).
- **Relative links in tracked Markdown files are enforced by `test:static` (B-110).**
- **The bus registration lives in exactly ONE place: the id-free user-level entry in `~/.pi/agent/mcp.json`** (ADR-0033, ADR-0034). A project-level `.pi/mcp.json` **replaces** it by name, so the two can disagree silently — that is how the 2026-10-07 incident gave one cwd the bus and another none, and why a re-run of `conmuta project bind` over that tree must be followed by re-retiring the project entry. Retiring it is B-107's machine-state half (§1); nothing detects a re-created one (B-131).
- **A native review's scope is the committed diff against `origin/main`, so an unpushed branch makes every commit expensive.** Measured 2026-10-07: with four units unpushed, the base diff still contained the gate's test file, so two reviews were graded `high` and each ran four lenses at ~110 kB of prompt per lens — for changes that were documentation and one test. After the push, the next documentation commit inspected as a single path and closed with **zero** lenses (§5.2b). **Push each unit as it closes**, or the next documentation commit buys a four-lens review.
- **The backlog board's rows are gate-checked, and the check counts separators by GFM's parity rule.** `test/security/backlog-table.test.ts` (2026-10-07, part of `test:static`): after the first row every non-blank line must be a row with exactly seven separators — a pipe after an **odd** run of backslashes is content (`\|`), after an even run it splits the cell (`\\|` splits). Counting every pipe instead of applying the parity rule produced two false positives (B-05 and B-104, which were already correct) and the repair that followed double-escaped them into real splits; both directions are seeded in the fixture. **A row that renders as a row is not the same as a row whose columns mean what they say** — verify a table repair by reading the rendered cells, never by counting pipes (that gap was B-31's, caught by review; §5.2b).
- **PT-22's repository scan reads TRACKED files only.**

---

## §5 — Audit state (B-102 CLOSED in session 69; every session-70/71 candidate DECLINED; B-31 independently verified)

### 5.1 — Independent verification that DID run

- **B-31 — `gentle-ai-verify`, task `mut1av5k-3-bfej`, clean.** Reproduced `npm test` **1907/1901/0/6**,
  `test:static` **101/101**, `dist/test/registry/loader.test.js` 29/29, all 5 B-31 tests present
  (`loader.test.ts:460,481,493,503,526`), and `%TEMP%/conmuta-*` 0 → 0. It then went past the brief with 25/25
  assertions of its own and **turned two claims that had only been reasoned into empirical ones**: the depth
  bound cannot hide a secret in an accepted document (a 35-level document is refused as `schema_invalid`, not
  `RangeError`, and `registryFileSchema` plus every sub-schema are strict `z.strictObject` with no recursion, so
  maximum accepted nesting is 4), and the gate adds **no** new false refusals (legitimate documents with colons,
  numbers in titles, Windows/UNC/Unix paths, prose and `settings.secret_markers` all load). It also extended
  coverage to **every mutable string position** and **every secret class** through the gate.
- **Never trust the delegated report at face value — this one was re-verified by the parent before being
  accepted**: the verifier's own probe artifact was re-run (`25/25 PASSED`), `git show HEAD:src/registry/loader.ts`
  was read to confirm the gate is really in the committed tree (`containsForbiddenContent(raw)` at :126,
  `MAX_CONTENT_WALK_DEPTH = 32` at :168, `withoutRosterHashes(text)` at :181), `git diff HEAD -- src test` was
  confirmed empty (it edited nothing), and the scratch file it left in `%TEMP%` was removed.
- **B-95 — `gentle-ai-verify`, task `mut0gvfn-2-9l0t`, clean** (1901/1895/0/6 and 101/101 at `a4885f3`, all three
  corrupt-envelope test groups confirmed).

### 5.2 — Native review: one candidate was approved and burned, and it required no reviewer

**Session 72 took the two measurements this file has been carrying as advice.** First, the **accumulated branch
candidate is not merely declined — it is un-reviewable**: `review.start` on the workspace projection returned
`lens_context_budget_exceeded` in `preflight` (`mutation_outcome: not_started`), *no* authority created, nothing to
repair or abandon, and its own continuation says to reduce the candidate. The trap §5.2 described (every commit
mints a new `target_identity` and re-prompts) now has a hard floor under it. Second, a **narrow committed candidate**
(`baseRef=54d5511`, `committedOnly: true`, 7 files / 434 lines) closed **`approved`** with `risk_tier: low`,
**`selected_lenses: []`** and `lenses_required: false` because the reason was **`non_executable_only`** — a
classification, not a review, and it must never be reported as one. Its authority was burned
(`gentle-ai.review-acknowledged/v1`, lineage `review-37e325421d7cc221`); delivery stayed ordinary repository policy.
**The Director then declined review for the F7c code unit explicitly** ("no voy a revisar nada"), so that unit has no
lineage and is recorded as deliberately unreviewed.

**What follows for any future session:** a code unit that wants a native review must be **its own narrow committed
candidate**, and it will require lenses (it is executable). The six declines of sessions 68–71 still stand, as does
their disposition — see the paragraph below, kept because it is the record of those candidates.

**Every candidate of sessions 68–71 was host-resolved as `consent-declined-this-candidate`, so no native review exists
for them and the separate independent verifier above was the only independent pass. Six declines across four
sessions:** session 68's two (`sha256:6f94b8d9…`, 6 files / 415 lines; `sha256:5977c01d…`, 10 files / 1008 lines)
and the accumulated target re-offered after each growth (`sha256:2cd5fa16…`, 19 files / 1314 lines; `sha256:8937c6f2…`,
23 files / 1653 lines; `sha256:f0f16d67…`, 23 files / **1684** lines; `sha256:c90c38ab…`, the session-71 target at
**37 files / 2254 lines**, `risk_level: medium`). Session 71's decline followed two **pre-authority** START
validation errors (`requires lineageId`; missing `mode`) that created no lineage either. All returned
`lineage_created: false` and `mutation_performed: false`, so **no lineage exists and no review state was mutated**
— there is nothing to acknowledge, correct, recover or reset. **Do not re-inspect or re-drive START on any of these
targets.**

**A decline is candidate-scoped, is not the kill switch, and is not the Director declining the work** — the bar
does not move and the independent verifier runs instead.

**The pattern, and the one actionable conclusion.** The projection is a committed-only base diff from the fixed
base `8ee3ddf`, so **every new commit mints a new `target_identity` and re-prompts**. The candidate grew
1314 → 1653 → 1684 lines and each growth produced another decline. Two consequences the next session should
respect: **(a)** do not create a commit whose only purpose is to record a decline or a verification result — the
fix for this trap cannot itself be a commit, so fold such meta-records into the next real work commit; **(b)** a
session that actually wants a native review must **narrow the candidate to a single work-unit commit** with an
explicit `baseRef` plus `committedOnly: true`, which is also what ODD's own close-out rule requires (a work-unit
commit or a PR slice, never the accumulated feature branch).

### 5.2b — The 2026-10-07 unit: three candidates, three approvals, and one that bought four lenses

Four lineages, each closed by its exact acknowledgement (authority burned, `gentle-ai.review-acknowledged/v1`):

| # | Lineage | Candidate | Tier / lenses | Outcome |
|---|---|---|---|---|
| 1 | `review-b1764a0746612ea1` | `0da1283` (the B-130/B-131 filing, B-107's closure) | `low`, **zero lenses** (`non_executable_only`) | approved; correction budget 11 unused |
| 2 | `review-af395029a84852b1` | `753060c` (the board gate) | `high`, four lenses | approved; four advisories, **one of them a real defect of that commit** (`R3-1` → B-31, §1) |
| 3 | `review-139c7dd8da1f1f53` | `99adfea` (the B-31 repair plus the advisories) | `high`, four lenses | approved; four more advisories, all on the gate's test file — `R4-001` names the **same location** as review 2's `R4-gate-region` |
| 4 | `review-b3911018f3e135a4` | `8b920c4` (the second review's advisories) | `low`, **zero lenses** | approved |

**What differed between the free review and the expensive ones was not the change, it was where `origin/main`
stood.** With four units unpushed the base diff still carried `test/security/backlog-table.test.ts`, so a
documentation commit was graded `high`; after the push the same kind of edit inspected as `paths:
[docs/06-backlog/CHECKLIST.md]` and ran no reviewer at all. **This is the mechanism behind the conclusion above**:
narrowing the candidate is not only about passing `baseRef` with `committedOnly: true` — the base must also have
moved, which means **pushing the previous unit before starting the next one**.

Two operational notes for the next session, both measured here. The review channel returned a **truncated
reviewer payload twice** (`review-reliability`, both reviews): the payload was refused at admission, preserved
under `.git/gentle-ai/rejected-results/`, and the refused bytes were never resubmitted — a fresh STATUS re-offered
that single slot, which is exactly the documented recovery. And the advisory findings of a closed review are
**unrecoverable after acknowledgement** (B-126): ids, locations, severities and dispositions are what survives,
which is why they are written into B-132 rather than left in the commit that produced them.

**A second unit followed the same day, and it is the shape the rules want.** `ac1cd24` (B-132, the board gate's
region handling) was pushed **before** anything else was touched, so `inspect` found a clean workspace and the
controller demanded an explicit base. The ordinary START for a committed candidate is
`{"mode":"ordinary","baseRef":"<full 40-character sha>","committedOnly":true}` — **the mode is not optional**:
omitting it routes to the graph-v1 path, which refuses with *"Judgment Day graph-v1 START requires lineageId"*.
Lineage `review-1872a30c548e8a95` graded **high** (one executable test file, reason `hot_path`/security) and ran four
lenses at ~28 kB of prompt each; it closed **approved**, its authority was burned with
`gentle-ai.review-acknowledged/v1`, and its five advisories are **B-133**. A separate `gentle-ai-verify` executor
reproduced 1969/1963/0/6 and `test:static` 129/129, showed the new rules non-vacuous by three mutations in a scratch
copy **outside** the repository, and honestly left the historical RED claim unverified — the parent re-checked the
tree, the cited lines and the scratch cleanup itself.

---

## §5b — Judgment Day audit for B-102 (COMPLETED in session 69; APPROVED)

**Judgment Day dual review (`bus-v2-b102-residuals-001`) is now COMPLETE.** In session 68, the audit was partial because runtime subagent tool execution failed for `jd-judge-a`. In session 69, subagent tool execution was verified healthy and `jd-judge-a` completed a full read-only sweep over the candidate `aa7fbd8^..5bf647a`.

- **Judge B (`jd-judge-b`, session 68)**:
  - **JD-B-001 — CRITICAL, accepted and corrected (`5bf647a`)**: Caught that the fresh-call latch check alone failed to cover an in-flight reconcile when `STOP_TICK_TIMEOUT_MS` expires, which still reproduced `heartbeat tick failed: database is not open`. Corrected in `5bf647a` with the 3-window design (top-of-loop break, post-`buildTransport` discard, and `AbortSignal` handed to the poller factory).
  - **JD-B-002 — SUGGESTION, accepted and filed to B-99**: `test/daemon/bootstrap.test.ts:517` bare 60ms sleep.
- **Judge A (`jd-judge-a`, session 69)**:
  - Swept `aa7fbd8^..5bf647a` (all 7 files: `src/daemon/{bindings,bootstrap}.ts`, `test/daemon/{bindings,bootstrap,poller}.test.ts`, `odd/tasks/b-102-residuals.md`, `docs/06-backlog/CHECKLIST.md`).
  - Executed tests independently: `npm test` 1885 tests (1879 pass, 0 fail, 6 skip), `npm run test:static` 101/101.
  - Returned **zero findings** (`findings: []`).
- **Terminal verdict**: **`APPROVED`** (recorded in `docs/05-tribunal/INDEX.md`).

**Both of session 68's candidates were declined by the consent prompt, and that is the whole record of its RDD
involvement.** The first (`sha256:6f94b8d9…`, 6 files / 415 lines) and the second (`sha256:5977c01d…`, 10 files /
1008 lines, which added the corrective commit) each resolved to `consent-declined-this-candidate` with no lineage
created. A decline is candidate-scoped and is not the kill switch, so neither one blocks delivery or lowers the bar:
it means no native review exists for this work and the separate verifier above was the only independent pass. **Do
not re-inspect or re-drive START on either target.** The second decline was deliberately *not* given its own commit:
the projection is a committed-only base diff from `8ee3ddf`, so any new commit mints a new `target_identity` — and
with it another prompt for a Director who had already declined twice. This note is folded into a real work commit
instead, which is where such a record belongs.

## §6 — Do not redo

- F1–F5 archives, B-98, B-100(a)(b), B-101, B-103, B-104, B-105, B-106, B-107, B-108, B-109, B-110, B-111,
  **B-102, B-99, B-95, B-97, B-31**: closed; do not re-open or re-review.
- **B-31 is closed completely**: the registry keeps BOTH gates — the pre-parse raw scan (design §4) and the
  post-parse value/key walk. Do not remove either, and do not "simplify" the walk by dropping its
  `withoutRosterHashes` call: that mask is the only reason a valid registry still loads (B-27).
- **B-95 is closed completely**: safe `parseStoredEnvelope` handles corrupt rows in `fetch.ts`, cursor advances.
- **B-97 is closed completely**: the entry guard is `import.meta.main` and a Windows directory junction now pins it
  with a genuinely RED-reproducing test — do not re-derive the row's "needs Linux/macOS" premise, and do not add a
  separate POSIX CI job for a guarantee `windows-latest` already exercises.
- **B-99 is closed completely**: timer tests converted to condition waits and positive live tick checks.
- **B-105 is closed completely**: do not re-verify the harness argv forms or re-open the satellite SDD set.
- **B-106 is closed completely**: do not re-implement the transport close release or the dead-PID sweep.
- **B-111 is closed completely**: do not re-implement tool config pre-validation.
- **B-102 is closed**: do not re-add a third `stopping` check, and do not remove any of the four that exist
  (per-binding top-of-loop, post-`buildTransport`, post-`createPoller`, and the fresh-call check at the top of
  `reconcile()`) — nor the abort signal the factory receives.
- **ADR-0033's and ADR-0034's settled points**: do not re-add `--project` to the installer's written entry.
- **B-108's fix**: do not replace `withInstallerLedger`.
- **B-110's 38 archived relative links are repaired and the gate is active in `test:static`.**

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-27 / B-30** | The two remaining members of the registry-scan cluster, each with a product decision inside it. **B-27**: the shared token regex's unbounded `\d+` makes `sha256:<64 hex>` match a bot-token shape, so a body quoting a roster hash would be refused by `checkForSecrets` and a roster hash in a log would be redacted by `redactTokenShapes`; the fix is either a stored-format change (a hash prefix that cannot read as a token) or widening PT-22's strict shape everywhere, since `test/shared/token-shape.test.ts` deliberately pins a 7-digit fixture as a match. **B-30**: R5's strictness refuses human-authored `registry.json` text (a group `title` of `Authorization review`), fail-closed but an availability/diagnosis question, with three recorded dispositions. B-31 closed the third member of the cluster and neither of these two | Director |
| **B-101 (relocation)** | Whether the Judgment Day operating detail should move out of the overwritten `HANDOFF.md` into `GOVERNANCE` or a durable runbook. Engineering-adjacent but editorial, and `GOVERNANCE.md` is constitution-adjacent, so this is not a drive-by move | Director |
| Engram housekeeping | 299 legacy cloud-sync mutation rows and 2 ownership rows the tool marks `repairable: false` (per-row human classification; local use unaffected), 1 deliberate drift case (`manual-save-frisco`), three backups to delete once nothing needs reverting | Director |
| The selectorless RDD chain's stale base and the terminally-stopped lineage `review-688b995abb754a4c` | Not observed firing in sessions 59–68. Candidates left no lineage (the host declined them). The `2aa0da0`-era base that kept re-surfacing B-102(f) now points at fixed code, so this is expected to stay quiet | Director/maintainer |
| **B-114** | **The end-to-end live-session test is owed, and it needs a collaborator.** Criterion 1 of the 2026-10-05 order — a live session answering an incoming bus message — cannot be proven alone: AGENTBUS has no private loopback (every `send` reaches the group *and* a DM, so a test message fans out to the other four agents), and a human typing in Telegram is dropped as `unknown_sender`, so the sender must be a roster *agent* whose owner is available. Criteria 2 and 3 are satisfied and pinned. **Steps and acceptance criteria:** `odd/tasks/solo-sesion-viva.md` §OWED; runbook "Verifying the live-session path (owed)". Do not call this done until step A's `audit_log` `send` row is shown carrying a non-null `client_id` | Director (needs a peer) |
| ADR-0032 | still `proposed` (pending the Director's confirmation) | Director |
| **B-112 / B-113** | Filed in session 71. **B-112**: the send-proof profile is verified for `pi` only, so `autopilot` and `claude`/`codex`/`opencode` are refused. **Measured in session 76** and narrowed to one credential: `codex` was probed live and **fails** the bar (under `-s read-only --ignore-user-config` it still declares `functions.exec_command`, `functions.web__run`, `collaboration.send_message` and the MCP resource tools), `opencode` has **no flag-level restriction to declare at all**, and `claude` has the right flags (`--restricted` plus `--strict-mcp-config`, both shown to parse) but cannot authenticate here (`OAuth session expired and could not be refreshed`). All three stay `null` on a measured reason each. **B-113**: the daemon cannot accredit "a human is present" (every same-user process reads the same run file and speaks the same IPC; `host` is the same literal `unknown` for both), and the only shape that could — a TTY-gated per-session human grant — is more surface than the order asked for. Do not re-derive either. | Director (B-112's remainder is one credential) |
| **B-117 / B-119** | Two design decisions the PR #106 audit refused to take inline, and **both are now decided — the Director's queue for them is empty.** **B-117 is CLOSED** (ADR-0037 `accepted` and implemented, 2026-10-07, §1); **B-119's ADR-0038 is `accepted`** (2026-10-07, option (b)), with its code and pins as the next unit. **B-117** → **ADR-0037**: the send-proof profile stops being guarded by a deny-list alone, because a record argument that consumes the next argv element and is placed last can swallow `--no-extensions` (bounded — `--tools` still holds, so no `bash`, no `conmuta_*` and no send path). The ADR recommends refusing the **shape** instead of enumerating the tokens: `--name=value` for a flag that takes a value, bare flags refused unless allow-listed, which needs no host parser and closes the `@file` positional by the same rule. **B-119** → **ADR-0038**: **the premise below was corrected twice and the corrected version is the one that counts** — the extension-facing `sendMessage` **does throw** on a stale context (that half propagates and *is* retried); what is swallowed is the runtime's rejected delivery on a **live** session, where the declaration is `void`. So the ring commits the cursor unretried, and the *message* is not lost because the doorbell cursor is not the session's own client cursor. The ADR recommends accepting best-effort and pinning that bound with a test, rather than inventing a verification the API cannot support. | Director |
| **B-127** | **CLOSED — session 75.** Both verified defects fixed on `fix/b-127-channel-pi-lifecycle` (`04706bd`, `86d1a5b`): a second `session_start` closes the superseded link before replacing it, so a reload returns its daemon session slot (the B-106 lesson the thin client implements); and the adapter enforces the module doc's "each condition is said once" with a per-session, message-keyed gate, so a persistent failure no longer reaches `ctx.ui.notify` every 5 s. Reviewed and acknowledged (`review-93f6998584b08998`; approved, refuter batch refuted the single CRITICAL) | harness (done) |
| **B-128** | **Open — the informational findings of B-127's own review, written down at capture time.** The review of `fix/b-127-channel-pi-lifecycle` (lineage `review-93f6998584b08998`, target tree `49ae6df1`, **approved**, acknowledgement burned) listed `R3-001` (CRITICAL, `channel-pi/main.ts:165-167`) **refuted by the provider's refuter batch** — which is why a refuter ran and why the review still approved — plus three findings that are declared **informational and non-blocking**: `R3-002` (WARNING, `channel-pi/main.ts:167`), `R3-003` (WARNING, `test/channel-pi/main.test.ts:232-234`) and `R3-004` (SUGGESTION, `test/channel-pi/main.test.ts:271-274`). The ids, locations, severities and dispositions are recorded here on purpose: the reviewer's prose is not carried in the closure and is **not recoverable** after acknowledgement (B-126), so this row is the durable record. Same class and disposition as **B-21**, **B-22**, **B-32**, **B-36** and **B-126** | Ordinary native review of B-127, 2026-10-06 | F7c follow-up | open | `channel-pi/main.ts`; `test/channel-pi/main.test.ts`; B-126 |
| **B-129** | **A ring bound ADR-0036 names is not implemented, and its own test table claims a test pins it.** Decision 6 lists "a per-window ring budget" and the third test-table row declares it pinned by `test/channel-pi/host.test.ts`; measured 2026-10-06, `channel-pi/` has only the cooldown (`PI_RING_COOLDOWN_MS = 15_000`) and that file mentions neither `budget` nor `saturated`. The `WAKE_BUDGET_PER_WINDOW = 20` per hour belongs to the headless satellite in `runner/`, and `send/rate.ts` budgets outbound sends — neither is this. So the adapter rate-limits but has **no absolute cap**, while every ring is a model turn. Two dispositions for the Director: implement the budget, or correct decision 6 to say the cooldown is the only bound. ADR-0036 carries a second 2026-10-06 amendment recording the gap; the runbook states the operator-facing half | Measured in session 76 (2026-10-06) while answering a token-cost question about the doorbell | F7c follow-up | open | `docs/06-backlog/CHECKLIST.md` (B-129); [ADR-0036](../03-adr/0036-pi-host-doorbell-adapter.md); `channel-pi/constants.ts`; `test/channel-pi/host.test.ts`; `docs/runbooks/host-doorbell-pi.md` |
| **B-125** | **Open — and it lives in another package.** The `channel-pi` gate (B-124) stops this extension from ringing a headless child, but the child still loads every extension; the structural remedy — `--no-extensions` for harness children — is in `gentle-pi` (`lib/agents-runner.ts`, which already strips `GENTLE_SHELL_INTERACTIVE_HOST`). Session 75 wrote the exact diff plus the two host facts that make it safe, and deliberately edited nothing: another package, and the fix must stay scoped to the doorbell so a child that legitimately needs an extension keeps it | Director (cross-package proposal, one hop away) |
| **B-126** | Two advisory findings of PR #110's native review (lineage `review-31c2f822ffaf0aee`, approved, authority burned): `R3-001` (WARNING, `channel-pi/main.ts:113`) and `R3-002` (SUGGESTION, `channel-pi/main.ts:86`). Session 75 measured that they **cannot be read back** — acknowledging a review deletes its transaction directory, leaving a 259-byte `terminal-consumption/v1` pointer — and ran a fresh independent review of `channel-pi/` instead, which found different defects (**B-127**). Both informational and non-blocking | Director (informational, unrecoverable as written) |
| **B-130** | **CLOSED — 2026-10-07 as (b)** (§1): the boundary is declared and the operator's check is written down. It reopens neither B-124 nor the adapter's code | — |
| **B-131** | **OPEN, deliberately deferred.** The detector for a project-level Pi registration that masks the user-level one; `project bind` can re-create it. Low likelihood (a re-bind), bounded harm (the `frisco` ladder is off), and one half waits behind `doctor`'s deferred verb | F2, when it is next touched |
| **B-132** | **OPEN — and the fresh look it calls for is the only work left that needs nothing but this repository**: three nameable weaknesses, all in `test/security/backlog-table.test.ts` (see §1's B-132 row). Test-first, no product decision | Harness |
| B-11, B-12, B-16 | Gate F6 | Director |

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0, `gentle-ai` **4.0.0**, PowerShell primary with Bash (Git Bash) available.
- **The native review needs a model for every role it may run, not only for the lenses.** `~/.pi/gentle-ai/models.json` carried the four `review-*` lenses but neither `review-refuter` nor `review-validator`; session 75 hit it live — a refuter slot failed with *"no model is configured for review-refuter; assign it a model in the agent model routing config"* — and added both as `deepseek/deepseek-flash` with `thinking: high`, matching the lenses. Backup: `models.json.bak-pre-review-roles-20261006`. The six roles are now `review-readability`, `review-reliability`, `review-resilience`, `review-risk`, `review-refuter`, `review-validator`.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`. `gh` commands run
  with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never run `gh auth
  switch`**. Force-push and deletion of `main` are blocked.
- **Session 68's commits and push status: read `git log` and `git status -sb`** (§0.2 row 1) rather than
  trusting a SHA written here.
- **The four harnesses ARE installed**: `pi` and `pi.cmd` (`%APPDATA%\npm`), `claude`
  (`~/.local/bin/claude`), `codex`/`codex.cmd` and `opencode`/`opencode.cmd` (`%APPDATA%\npm`).
- **The bus is registered once, id-free, at the user level**: `pi mcp list` here shows
- **MCP is ON for sessions again, and that is load-bearing.** `~/.pi/agent/settings.json` no longer carries
  `"-builtin:mcp"` (an unregistered `pi-mcp-adapter` had written it, which disabled MCP for every session).
  The conmuta entries are `exposure: "direct"` — Pi's default is `codemode`, which does **not** declare tools —
  at the user level (`~/.pi/agent/mcp.json`, id-free per ADR-0033) and in `FRISCO\.pi\mcp.json` (also id-free now).
  `pi mcp list` in FRISCO → `conmuta: connected, 4 tools (direct, project)`. Two measured consequences: outside a
  bound tree the user-level entry reports `failed (no conmuta.json found above …)` once per session, and
  **`frisco-erp/.mcp.json` is not read by Pi at all** (Claude-style file) — the entry serving that tree is the
  user-level one.
  `conmuta: connected, 4 tools` running `<repo>\dist\src\cli\main.js mcp`. `FRISCO\.pi\mcp.json` is
  retired.
- **Arena**: no `arena` MCP server is registered for Pi, and `127.0.0.1:8765` refuses connections
  (sessions 63–68). `.mcp.json` still holds the (gitignored) bridge credential; never commit or quote it.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, read-only.
- **The local bus (conmuta) is live on this machine**: daemon home `~/.conmuta/`, two bots
  (`agente_kairo_bot`, `agent_luisgtz_bot`) and two bindings — `telegram-bus-agent` (this repository, group
  `-5419222443`, roster only `@kairo-agent`) and **`frisco`** (root `...\ORION OCG\FRISCO`, group
  `-5457758012`, roster `@luisgtz-agent`, `@rodrigo-agent`, `@jomata-agent`, `@luisrey-agent`,
  `@coordinador-frisco`).
- The SDD preflight for this project is Automatic / Both (hybrid) / Auto (`stacked-to-main`).
- **CodeGraph**: present and usable, `codegraph explore` directly — do not re-init.
- **The F7c host adapter is armed machine-wide, and that is a deliberate environment fact**: `~/.pi/agent/settings.json`
  carries `extensions: ["…/telegram_bus_agent/dist/channel-pi/main.js"]` (backup `settings.json.bak-pre-f7c-arming-20261005`).
  Every Pi session on this machine therefore loads it at `session_start` and binds to the nearest ancestor
  `conmuta.json`; a session outside any bound tree reports one line (`pi-host-doorbell: no conmuta.json found above …`)
  and arms nothing. It ships nothing into the repository, needs no installer step, and is removed by taking that entry
  out. **The path is this checkout's `dist/`, so the arming depends on `dist/` existing here** — a moved or unbuilt tree
  means the extension fails to load, which is the price of arming by path before F6 publishes the package.
- **Model routing moved to DeepSeek in session 74, and the routing file is the one that counts.** The four
  `review-*` lenses and the global default model now resolve to DeepSeek, on the Director's instruction
  *"deepseek es el que está activo"*. The routing to edit is `~/.pi/gentle-ai/models.json` (provider-review roles
  read this; the `subagents.json` `review-*` entries are ignored for those roles), the lens profiles are in
  `~/.pi/agent/subagents.json`, and the default model is in `~/.pi/agent/settings.json`. Backups taken before the
  change: `models.json.bak-pre-deepseek-review-20261006`,
  `subagents.json.bak-pre-deepseek-lenses-20261006` (an identical copy is stored beside it as
  `subagents.json.bak-pre-deepseek-review-20261006`) and `settings.json.bak-pre-deepseek-default-20261006`.
  `pi --list-models deepseek` resolves `deepseek-flash`.
- **Engram's own tool surface is 19 tools** (`mem_*`), registered globally; `mem_context` on project
  `connmuta` is the entry point for a resumed session.
- **The three non-`pi` harnesses' credential state on this machine, measured 2026-10-06 for B-112:** `claude` is
  installed and its restriction flags parse, but it **cannot authenticate** — `Failed to authenticate: OAuth
  session expired and could not be refreshed`, so no live tool-declaration probe is possible until it is
  re-authenticated. `codex` **is** logged in (`codex login status` → `Logged in using ChatGPT`); its *default*
  (config-loaded) sandbox fails to prepare on this host (`failed to prepare windows sandbox wrapper: … .pnpm-store
  … os error 1920`) while `-s read-only --ignore-user-config` starts a turn fine — which is why the control probe
  could not list tools. `opencode` holds two stored credentials (DeepSeek api, omnirouter api) but fails with
  `Authentication Fails, Your api key: ****0059 is invalid`, and it selects agent `gentle-orchestrator` with model
  `deepseek-flash`. Evidence: `odd/tasks/evidence/b-112-harness-send-proof-verification.md`.
