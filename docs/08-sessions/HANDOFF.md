# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what the
> next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live in the
> ADRs and the tribunal index, never here.
>
> **Last rewritten: end of session 70** (2026-10-03 local). Every § carries session 70's state unless a line says otherwise.
>
> **Session 70 in one paragraph — B-95 remainder closed completely under ODD; B-102 and B-99 commits landed. Suite 1901/1895/0/6, test:static 101/101, zero temp leaks.** B-95 remainder was closed at its source under ODD (`odd/tasks/b-95-remainder-fetch-corrupt-row.md`): safe corrupt-row handling in `src/daemon/serve/fetch.ts:244-246` (`parseStoredEnvelope` defensively validates object structure, envelope types, non-empty threads, and `to`/`basis`, returning `null` on corruption and skipping the row without throwing, while `lastRowSeq` still advances the client cursor past damaged rows), pinned by 14 test cases in `test/daemon/serve/fetch.test.ts` (observed RED before GREEN, non-vacuity proven by mutation); review note R3-1 addressed in `src/daemon/serve/doorbell.ts` (non-null `to` tightened with `AGENT_ID_PATTERN`); review note R2-1 addressed in `test/channel/main.test.ts` (drift-prone count comment removed). Backlog row B-95 marked `done`.

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** Unchanged since session 55. |
| What is new? | **B-95 remainder CLOSED COMPLETELY** (safe corrupt-row policy in `fetch.ts`, cursor advances, R3-1/R2-1 review notes resolved); **B-102 and B-99 commits landed** on `main`. Rows B-95, B-99, B-102 marked `done`. |
| What is next? | Residuals: **B-97** (POSIX symlinked-bin entry guard, needs Linux/macOS / B-12), **B-101**'s relocation question. **F6** still blocked on B-11/B-12/B-16. |
| What must be settled before any work? | §0.3: autonomy, memory, and **Arena** (unreachable at every session's start since 55; confirm with a real probe). Subagent health was verified working in sessions 69 and 70. |
| What is the Director's to decide? | The Engram housekeeping classification; **B-11/B-12/B-16** for F6. |
| Where to read next | §0 first; then §1, §3, and §4. |

---

## §0 — Quick start

### 0.1 Prompt to paste

```text
Lee docs/08-sessions/HANDOFF.md (§0, §1, §3) y confirma Arena con una llamada real. B-95, B-99 y B-102 están cerrados y
auditados (1901 pruebas, test:static 101/101). Evalúa B-97 (guard symlink POSIX en cli/main.ts, adyacente a B-12)
o la reubicación de B-101.
```

### 0.2 First commands (stop and report if any output disagrees)

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | `## main...origin/main` with no divergence, and a clean tree. Read `git log --oneline -12` rather than trusting a SHA written here. **Do not treat the commit base as a fixed number** — take it from `git log` |
| 2 | `rm -rf dist` | prints nothing |
| 3 | `ls openspec/changes/` | `archive` only |
| 4 | `git status --short` | **empty** |
| 5 | `gentle-ai review mode status` | `receipt-driven development: on (decided by global)`; read it, do not assume it |
| 6 | `gentle-ai --version` | `4.0.0` or later — check fresh each session |
| 7 | `npm run build && npm test` | exit 0; **1901 tests, 1895 pass, 0 fail, 6 skip**; `test:static` **101/101** |
| 8 | `ls -d "$TEMP"/conmuta-* \| wc -l` before and after one `npm test` | the count must NOT grow. Since session 63 it is 0 and stays 0 |
| 9 | **Subagent health** | run one tiny tool-using subagent task (e.g. "read this file and report its line count"). Verified working in sessions 69 and 70. See §5 |

### 0.3 Settle before any work

1. **Autonomy**: confirm the opening prompt re-states it; if it does not, ask one question.
2. **Memory**: start an Engram session (`mem_session_start`) and pass its id to `mem_save`. This
   repository's Engram project is **`connmuta`** (§8).
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
  that did not happen** (§5).
- **The `frisco` binding is live and must not be re-armed** (§3).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1–F5 | **Archived**, unchanged since session 55 | `openspec/changes/archive/` |
| B-98, B-99, B-100(a)(b), B-101, B-103, B-104 | Closed (sessions 55–61); **B-99 still open** (see its row) | `docs/06-backlog/CHECKLIST.md` |
| **B-105** | **CLOSED COMPLETELY — sessions 61 & 66** | `docs/runbooks/wake-satellite.md`; ADR-0032 |
| **B-106** | **CLOSED COMPLETELY — sessions 62 & 65** | `odd/tasks/b-106-occupancy-and-dead-pid-sweep.md` |
| **B-107** | **RESOLVED — session 62** under [ADR-0033](../03-adr/0033-project-flag-as-assertion.md) | `docs/03-adr/0033-project-flag-as-assertion.md` |
| **B-108** | **CLOSED — session 63** (`withInstallerLedger`) | `src/cli/main.ts` |
| **B-109** | **CLOSED — session 63** under [ADR-0034](../03-adr/0034-id-free-installer-entry.md) | `docs/03-adr/0034-id-free-installer-entry.md` |
| **B-110** | **CLOSED — session 64** (relative Markdown link gate in `test:static`) | `test/security/markdown-links.test.ts` |
| **B-111** | **CLOSED COMPLETELY — session 67** under [ADR-0035](../03-adr/0035-pre-validate-tool-configs-in-project-bind.md) | `docs/03-adr/0035-pre-validate-tool-configs-in-project-bind.md` |
| **B-102** | **CLOSED & AUDITED — sessions 68–69** (residuals a, b, c, f, g; d and e were closed in sessions 56/57). Three checks over three windows: a reconcile that begins after `stopAll()` returns unchanged; an in-flight reconcile re-checks the latch at the top of each remaining binding and again after `buildTransport` resolves, so the poller factory is never reached; and the factory receives an abort signal `stopAll()` aborts, so a poller created after the latch flipped touches no ledger. Plus: the update-existing-binding branch pinned, the latch's terminal contract stated, `stop()` recording the tick it gave up on, and two fixed-sleep stability proofs replaced. The first attempt at (f) was rejected by `jd-judge-b` in session 68 and corrected in `5bf647a`; `jd-judge-a` completed in session 69 with zero findings, closing Judgment Day audit `bus-v2-b102-residuals-001` with terminal verdict **`APPROVED`** | `odd/tasks/b-102-residuals.md`; `docs/06-backlog/CHECKLIST.md`; `docs/05-tribunal/INDEX.md` |
| **B-95 remainder** | **CLOSED COMPLETELY — session 70** under ODD (`odd/tasks/b-95-remainder-fetch-corrupt-row.md`). Safe corrupt-row policy in `src/daemon/serve/fetch.ts:244-246` (skips corrupt/unparseable rows without failing, cursor advances past them); review notes R3-1 (doorbell.ts to check) and R2-1 (comment drift) resolved. | `src/daemon/serve/fetch.ts`; `docs/06-backlog/CHECKLIST.md` |
| **B-99** | **CLOSED COMPLETELY — sessions 55 & 69** (commit `dd464a7` converted the three original tests to `waitForCondition`; session 69 closed the remaining fixed sleeps in `heartbeat.test.ts` and converted `bootstrap.test.ts:517` to positively observe live ticks with stable audit rows, plus converting boot/add waits to condition waits) | `odd/tasks/b-99-timer-tests.md`; `docs/06-backlog/CHECKLIST.md` |
| Next SDD change | None queued. F6 blocked on B-11/B-12/B-16 | `docs/07-plan/WORK-PLAN.md` |
| Tests on `main` | `npm test` **1901/1895/0/6**; `test:static` **101/101** | — |

---

## §2 — What earlier sessions did (context, not to redo)

1. **Session 70** closed **B-95 remainder completely** under ODD (`odd/tasks/b-95-remainder-fetch-corrupt-row.md`): safe `parseStoredEnvelope` in `src/daemon/serve/fetch.ts` skips corrupt/malformed `envelope_json` rows without throwing, allowing `lastRowSeq` to advance `cursor.next_update_id` past damaged rows so the client never stalls; review note R3-1 addressed in `doorbell.ts` (tightened `to` check) and R2-1 in `test/channel/main.test.ts` (drift comment removed); 14 test cases added in `fetch.test.ts` (RED before GREEN observed, non-vacuity proven by mutation); landed session 69's B-102 and B-99 commits.
2. **Session 69** completed the missing second blind review for B-102 (`jd-judge-a` returned 0 findings, closing `bus-v2-b102-residuals-001` APPROVED); and closed **B-99 completely** under ODD (fixed sleeps in `heartbeat.test.ts` converted to `waitForCondition`/`assertStableFor`; `bootstrap.test.ts:517` converted to positively observe live ticks via `daemon.lock`'s `heartbeat_at` and `getUpdatesCalls` while asserting stable audit rows; boot and hot-reload waits converted to condition polls).
3. **Session 68** closed B-102: three shutdown-latch checks over three windows, the update-existing-binding guard branch pinned by test and mutation, the latch's terminal contract stated, `stop()` recording the tick it gave up on, and two fixed-sleep stability assertions replaced by `assertStableFor`. Its first attempt at (f) was rejected by an independent judge and corrected in `5bf647a`.
4. **Session 67** closed B-111 completely: `checkFileEdit` pre-flight validation in `project bind` before any write, `tool-config-refused` reported cleanly, ADR-0035 authored.
5. **Session 66** closed B-105 completely: argv forms of all four harnesses verified live with `shell: false`.
6. **Session 65** closed B-106 remainder: dead-PID sweep in `routes.ts`, session occupancy in `status` and `doctor`.
7. **Session 64** closed B-110: relative Markdown link gate in `test:static`, 38 archive links repaired.
8. **Sessions 62–63** closed B-107 (ADR-0033), B-106's source, B-109 (ADR-0034) and B-108.

---

## §3 — What's next

1. **The `frisco` binding is armed and running — do not re-arm it.**
2. **The bus is registered ONCE, id-free, at the user level** (`~/.pi/agent/mcp.json`), per ADR-0033.
3. **Pick from the remaining units**:
   - **B-97** (POSIX symlinked-bin entry guard; needs Linux/macOS, so it also touches B-12's scope),
   - **B-101**'s remaining question (where the Judgment Day operating detail should live).
4. **Then F6** once B-11/B-12/B-16 are decided; **F7b** after F6.
5. **Do not restart B-105, B-106, B-108, B-109, B-110, B-111, B-102, B-99 or B-95** — all are closed with evidence (§1).

---

## §4 — Facts that will bite you

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
- **PT-22's repository scan reads TRACKED files only.**

---

## §5 — Audit state for session 68's candidate (COMPLETED in session 69; APPROVED)

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
  **B-102, B-99, B-95**: closed; do not re-open or re-review.
- **B-95 is closed completely**: safe `parseStoredEnvelope` handles corrupt rows in `fetch.ts`, cursor advances.
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
| **B-97** | `src/cli/main.ts`'s `isDirectlyExecuted()` guard may silently do nothing behind a POSIX symlinked npm bin; needs Linux/macOS to confirm, so it is adjacent to B-12 | Director + Kairo |
| **B-101 (relocation)** | Whether the Judgment Day operating detail should move out of the overwritten `HANDOFF.md` into `GOVERNANCE` or a durable runbook | Director |
| Engram housekeeping | 299 legacy cloud-sync mutation rows and 2 ownership rows the tool marks `repairable: false` (per-row human classification; local use unaffected), 1 deliberate drift case (`manual-save-frisco`), three backups to delete once nothing needs reverting | Director |
| The selectorless RDD chain's stale base and the terminally-stopped lineage `review-688b995abb754a4c` | Not observed firing in sessions 59–68. Candidates left no lineage (the host declined them). The `2aa0da0`-era base that kept re-surfacing B-102(f) now points at fixed code, so this is expected to stay quiet | Director/maintainer |
| ADR-0032 | still `proposed` (pending the Director's confirmation) | Director |
| B-11, B-12, B-16 | Gate F6 | Director |

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0, `gentle-ai` **4.0.0**, PowerShell primary with Bash (Git Bash) available.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`. `gh` commands run
  with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never run `gh auth
  switch`**. Force-push and deletion of `main` are blocked.
- **Session 68's commits and push status: read `git log` and `git status -sb`** (§0.2 row 1) rather than
  trusting a SHA written here.
- **The four harnesses ARE installed**: `pi` and `pi.cmd` (`%APPDATA%\npm`), `claude`
  (`~/.local/bin/claude`), `codex`/`codex.cmd` and `opencode`/`opencode.cmd` (`%APPDATA%\npm`).
- **The bus is registered once, id-free, at the user level**: `pi mcp list` here shows
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
- **Engram's own tool surface is 19 tools** (`mem_*`), registered globally; `mem_context` on project
  `connmuta` is the entry point for a resumed session.
