# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what the
> next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live in the
> ADRs and the tribunal index, never here.
>
> **Last rewritten: end of session 67** (2026-10-03 local). Every § carries session 67's state unless a line says otherwise.
>
> **Session 67 in one paragraph — B-111 closed completely under ADR-0035 (tool config pre-validation in `project bind` before any write);
> suite 1878/1872/0/6, test:static 101/101, zero temp leaks.** The instruction was open-ended under standing authorization
> from the Director ("toma las riendas y no me preguntes absolutamente nada... confío plenamente en tu criterio...").
> **B-111 landed under ODD (Option a)**: `checkFileEdit` added to `src/installer/file-edit.ts` (executing steps 1–4 of the edit
> pipeline in read-only mode, with zero writes and zero backups); `runProjectBind` in `src/installer/wizards/project-bind.ts`
> pre-validates all selected tool configs with `checkFileEdit` *before* `writeProjectFile` and *before* `commitRegistryChange`.
> When any tool config refuses (conflict, parse error, symlink), `runProjectBind` returns `{ outcome: "tool-config-refused", toolId, path, reason, message }`.
> In `src/cli/main.ts`, `reportProjectBindOutcome` formats the refusal details and diff on stderr and exits 1. Neither `conmuta.json`
> nor `registry.json` is modified on refusal, eliminating the dead-end partial bind trap where bijective invariants R1/R2 block re-runs.
> ADR-0035 authored and accepted under standing authorization. Specs and backlog updated. Full suite **1878/1872/0/6**,
> `test:static` **101/101**, zero temp leaks.

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** Unchanged since session 55. |
| What is new? | **Session 67 closed B-111 completely under ADR-0035.** All selected tool configs are pre-validated before any write, preventing partial binds on conflict/parse error. Row B-111 marked `done`. |
| What is next? | Residuals: **B-95(d)** + `fetch.ts`'s unguarded parse, **B-102(a)(b)(c)(f)(g)**. **F6** still blocked on B-11/B-12/B-16. |
| What must be settled before any work? | §0.3: autonomy, memory, and **Arena** (unreachable at every session's start since 55; confirm with a real probe). |
| What is the Director's to decide? | The Engram housekeeping classification (299 legacy mutation rows, 88 `sync_state` rows, 2 ownership rows, 7 historical drift findings — `repairable: false`); B-11/B-12/B-16 for F6. |
| Where to read next | §0 first; then §3 and §7. §4 is the list of traps. |

---

## §0 — Quick start

### 0.1 Prompt to paste

```text
Lee docs/08-sessions/HANDOFF.md (§0, §1, §3, §4) y confirma Arena con una llamada real. Estado al cerrar la
sesión 67: B-111 cerrado completamente bajo ADR-0035 (pre-validación de herramientas en `project bind`).
Suite 1878/1872/0/6, `test:static` 101/101. La siguiente unidad natural son los residuales B-95(d)/B-102.
```

### 0.2 First commands (stop and report if any output disagrees)

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | `## main...origin/main` with no divergence, and a clean tree. Read `git log --oneline -12` rather than trusting a SHA written here: session 67's work sits on top of session 66's close-out. **Do not treat the commit base as a fixed number** — take it from `git log` |
| 2 | `rm -rf dist` | prints nothing |
| 3 | `ls openspec/changes/` | `archive` only |
| 4 | `git status --short` | **empty** |
| 5 | `gentle-ai review mode status` | `receipt-driven development: on (decided by global)`; read it, do not assume it |
| 6 | `gentle-ai --version` | `3.7.0` or later — check fresh each session |
| 7 | `npm run build && npm test` | exit 0; **1878 tests, 1872 pass, 0 fail, 6 skip**; `test:static` **101/101** |
| 8 | `ls -d "$TEMP"/conmuta-* \| wc -l` before and after one `npm test` | the count must NOT grow. Since session 63 it is 0 and stays 0 |

### 0.3 Settle before any work

1. **Autonomy**: confirm the opening prompt re-states it; if it does not, ask one question.
2. **Memory**: start an Engram session (`mem_session_start`) and pass its id to `mem_save`. This
   repository's Engram project is **`connmuta`** (§8).
3. **Arena**: prove reachability with a real tool call, never `curl` alone. Sessions 63, 64, 65, 66, 67 evidence:
   `pi mcp list` shows **no `arena` server registered**, and a TCP connect to the documented endpoint
   (`timeout 5 bash -c '</dev/tcp/127.0.0.1/8765'`) answers **connection refused**. That satisfies DN-09's
   substitute condition directly, and the audit runs under Judgment Day / verifier.

### 0.4 Standing instructions from the Director

- **RDD consent is asked per candidate; never answer it for the Director.** A decline is candidate-scoped and
  is not the kill switch, and it never lowers the bar: the RDD-off fallback re-enables the separate verifier,
  which is what `gentle-ai-verify` provides. **The consent binding EXPIRES AFTER 10 MINUTES**, so `inspect` →
  START → answer must fit in one uninterrupted window.
- **Commits and push are authorized per session, and the two are not the same authorization.**
- **Never accept a partial judgment, and never accept an `APPROVE` as if it were the gate.**
- **Commit messages carry no `Co-Authored-By` and no AI attribution**; conventional commits only, by work
  unit.
- **Never trust a delegated agent's own report at face value.**
- **The `frisco` binding is live and must not be re-armed** (§3).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1–F5 | **Archived**, unchanged since session 55 | `openspec/changes/archive/` |
| B-98, B-99, B-100(a)(b), B-101, B-103, B-104 | Closed (sessions 55–61) | `docs/06-backlog/CHECKLIST.md` |
| **B-105** | **CLOSED COMPLETELY — sessions 61 & 66.** All four harnesses (`pi`, `claude`, `codex`, `opencode`) verified live against real binaries with `shell: false`. `HARNESS_DEFAULT_ARGS` in `runner/constants.ts` matches real CLIs. Runbook and ADR-0032 updated | `docs/06-backlog/CHECKLIST.md`; `docs/runbooks/wake-satellite.md`; `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md` |
| **B-106** | **CLOSED COMPLETELY — sessions 62 & 65.** Source release on transport close landed session 62 (`awaitTransportClose`). Remainder closed session 65: dead-PID sweep in `src/daemon/ipc/routes.ts` (`sweepDeadSessions`); occupancy visibility in `status` and `doctor` | `docs/06-backlog/CHECKLIST.md`; `odd/tasks/b-106-occupancy-and-dead-pid-sweep.md` |
| **B-107** | **RESOLVED — session 62** under [ADR-0033](../03-adr/0033-project-flag-as-assertion.md) (`accepted`): `--project` is an assertion, the binding comes from the nearest ancestor `conmuta.json`, and one **id-free** user-level registration serves a whole tree | `docs/03-adr/0033-project-flag-as-assertion.md` |
| **B-108** | **CLOSED — session 63.** Fixed with `withInstallerLedger(homeDir, body)` in `src/cli/main.ts` | `docs/06-backlog/CHECKLIST.md`; `src/cli/main.ts` |
| **B-109** | **CLOSED — session 63** under [ADR-0034](../03-adr/0034-id-free-installer-entry.md) (`accepted`) | `docs/03-adr/0034-id-free-installer-entry.md` |
| **B-110** | **CLOSED — session 64.** Relative-link verification gate `test/security/markdown-links.test.ts` added to `test:static`, pinned by negative fixture. All 38 broken links in `openspec/changes/archive/**` repaired | `test/security/markdown-links.test.ts`; `docs/06-backlog/CHECKLIST.md` |
| **B-111** | **CLOSED COMPLETELY — session 67** under [ADR-0035](../03-adr/0035-pre-validate-tool-configs-in-project-bind.md) (`accepted`, Option a). `checkFileEdit` adds read-only pre-flight checks; `project bind` pre-validates tool configs before any write; `tool-config-refused` reported cleanly | `docs/03-adr/0035-pre-validate-tool-configs-in-project-bind.md`; `docs/06-backlog/CHECKLIST.md` |
| **B-95 remainder, B-102 residuals** | Open, low priority, "cheap win at the next touch" | `docs/06-backlog/CHECKLIST.md` |
| Next SDD change | None queued. F6 blocked on B-11/B-12/B-16 | `docs/07-plan/WORK-PLAN.md` |
| Tests on `main` | `npm test` **1878/1872/0/6**; `test:static` **101/101** | — |

---

## §2 — What earlier sessions did (context, not to redo)

1. **Session 67** closed B-111 completely: implemented `checkFileEdit` in `src/installer/file-edit.ts`, pre-validated tool configs in `runProjectBind` before any write, surfaced `tool-config-refused` in CLI reporting, authored ADR-0035, updated specs/backlog/indexes, suite 1878/1872/0/6, static 101/101.
2. **Session 66** closed B-105 completely: verified argv forms of all 4 installed harnesses live against real binaries with `shell: false`, confirmed `HARNESS_DEFAULT_ARGS`, updated runbook and ADR-0032.
3. **Session 65** closed B-106 remainder completely: dead-PID sweep in `routes.ts`, session occupancy in `status` and `doctor`, specs updated, suite 1869/1863/0/6, static 101/101.
4. **Session 64** closed B-110: relative Markdown link verification gate in `test:static`, 38 archive links repaired.
5. **Session 63** closed B-109 under ADR-0034 and B-108 at its cause.
6. **Session 62** closed B-107 under ADR-0033 and B-106 at its source.

---

## §3 — What's next

1. **The `frisco` binding is armed and running — do not re-arm it.**
2. **The bus is registered ONCE, id-free, at the user level** (`~/.pi/agent/mcp.json`), per ADR-0033.
3. **Pick from the remaining units**:
   - **B-95 remainder / B-102 residuals**.
4. **Then F6** once B-11/B-12/B-16 are decided; **F7b** after F6.
5. **Do not restart B-105, B-106, B-108, B-109, B-110, or B-111** — all are closed with evidence (§1).

---

## §4 — Facts that will bite you

- **The installer CLI's ledger handle is closed now — do not "simplify" `withInstallerLedger` away.**
- **The written tool-config entry is id-free (ADR-0034).**
- **Tool-config merges in `project bind` are pre-validated before any write (ADR-0035, B-111).**
- **Two identifiers must not be mixed**: Engram `connmuta` (repo) vs Engram `frisco-erp` and bus `frisco`.
- **The daemon's session pool is bounded at `MAX_ACTIVE_SESSIONS = 64`** (`src/shared/constants.ts`).
  Session release runs on transport close (B-106 source); dead PIDs are swept on `POST /session` and
  `POST /tools/status` (`sweepDeadSessions`); and occupancy is visible in `status` (`daemon.sessions`)
  and `doctor` (`session-pool`).
- **Relative links in tracked Markdown files are enforced by `test:static` (B-110).**
- **PT-22's repository scan reads TRACKED files only.**

---

## §5 — Next session, exact sequence

- [ ] **1. Verify the tree** (§0.2); the suite must be 1878/1872/0/6 and `test:static` 101/101.
- [ ] **2. Settle §0.3** (autonomy, Engram session, Arena).
- [ ] **3. Choose the unit** (§3.3): B-95 remainder / B-102 residuals.
- [ ] **4. If a unit changes behavior**, follow the ODD flow this project enforces.
- [ ] **5. Close the session**: overwrite this file, add the LOG entry at the top, update `AGENTS.md`'s
      Status pointer, and the backlog rows touched.

---

## §6 — Do not redo

- F1–F5 archives, B-98, B-99, B-100(a)(b), B-101, B-103, B-104, B-105, B-106, B-107, B-108, B-109, B-110, B-111: closed;
  do not re-open or re-review.
- **B-105 is closed completely**: do not re-verify the harness argv forms or re-open the satellite SDD set.
- **B-106 is closed completely**: do not re-implement the transport close release or the dead-PID sweep.
- **B-111 is closed completely**: do not re-implement tool config pre-validation.
- **ADR-0033's and ADR-0034's settled points**: do not re-add `--project` to the installer's written entry.
- **B-108's fix**: do not replace `withInstallerLedger`.
- **B-110's 38 archived relative links are repaired and the gate is active in `test:static`.**

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-95 remainder / B-102 residuals** | B-95(d) stays design-exact; `src/daemon/serve/fetch.ts:244-246`'s unguarded parse needs its own decision; three non-blocking notes. B-102 (a)(b)(c)(f)(g); (f) keeps resurfacing | Kairo, "cheap at the next touch" |
| Engram housekeeping | 299 legacy cloud-sync mutation rows and 2 ownership rows the tool marks `repairable: false` (per-row human classification; local use unaffected), 1 deliberate drift case (`manual-save-frisco`), three backups to delete once nothing needs reverting | Director |
| The selectorless RDD chain's stale base and the terminally-stopped lineage `review-688b995abb754a4c` | Not observed firing in sessions 59–67. Candidates left no lineage (the host declined them) | Director/maintainer |
| ADR-0032 | still `proposed` (pending the Director's confirmation) | Director |
| B-11, B-12, B-16 | Gate F6 | Director |

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0, `gentle-ai` **4.0.0**, PowerShell primary with Bash (Git Bash) available.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`. `gh` commands run
  with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never run `gh auth
  switch`**. Force-push and deletion of `main` are blocked.
- **Session 67's commits and push status: read `git log` and `git status -sb`** (§0.2 row 1) rather than
  trusting a SHA written here.
- **The four harnesses ARE installed**: `pi` and `pi.cmd` (`%APPDATA%\npm`), `claude`
  (`~/.local/bin/claude`), `codex`/`codex.cmd` and `opencode`/`opencode.cmd` (`%APPDATA%\npm`).
- **The bus is registered once, id-free, at the user level**: `pi mcp list` here shows
  `conmuta: connected, 4 tools` running `<repo>\dist\src\cli\main.js mcp`. `FRISCO\.pi\mcp.json` is
  retired.
- **Arena**: no `arena` MCP server is registered for Pi, and `127.0.0.1:8765` refuses connections
  (sessions 63, 64, 65, 66, 67). `.mcp.json` still holds the (gitignored) bridge credential; never commit or quote it.
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

---

## §9 — RDD / audit state at session close

Newest first. Every entry is a closed record; the reasoning lives in the tribunal index under the id it
names.

1. **Session 67 — B-111 closed completely under ADR-0035 (tool config pre-validation before project bind mutations)**:
   RDD `inspect` on candidate → START resolved to **`declined_this_candidate`** (host-resolved, `lineage_created: false`,
   `mutation_performed: false`, `risk_level: high`, 11 files / 446 changed lines, `outcome: consent-declined-this-candidate`).
   Independent verification by `gentle-ai-verify` subagent (task `musunsj7-1-3w37`): verified all 5 claims with
   line-level citations (**PASS**).
   `checkFileEdit` adds read-only pre-flight validation in `src/installer/file-edit.ts` (steps 1–4).
   `runProjectBind` in `src/installer/wizards/project-bind.ts` pre-validates tool configs before `writeProjectFile` and
   before `commitRegistryChange`.
   `tool-config-refused` reported on stderr with diff in `src/cli/main.ts` and exits 1.
   Neither `conmuta.json` nor `registry.json` is modified on refusal, preventing the dead-end partial bind trap.
   ADR-0035 authored and accepted under standing authorization.
   Full suite `npm test` **1878 / 1872 / 0 / 6** pass (+9 tests); `test:static` **101 / 101** pass; 0 temp
   growth under `%TEMP%`.
   Commits on `main`: `7a18006`, `523f7d6`, `2701945`, `57bb5e5`.
