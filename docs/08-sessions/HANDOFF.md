# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what the
> next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live in the
> ADRs and the tribunal index, never here.
>
> **Last rewritten: end of session 62** (2026-10-01 local). Session 60's text is preserved below; §1, §3,
> §5, §7 and §9 carry session 62's state, and the two sections marked `DONE, session 60` still hold.
>
> **Session 62 in one paragraph.** Session 61 had already delivered **B-105(a)** (the F7a SDD artifact set,
> written and archived; commits `0ea16ef`, `3c57b0d`, `03b85e6`) but left no LOG entry and did not touch this
> file — session 62 wrote session 61's LOG entry and reconciled what it left stale. Then session 62 closed
> **B-107** under the new **ADR-0033** (`accepted`): `conmuta mcp --project <id>` is now an **assertion**, not
> a requirement, and the binding resolves from the nearest ancestor `conmuta.json`, so ONE id-free
> user-level registration is correct for every session under a tree. It was audited by Judgment Day (two
> blind judges, two rounds, seven real findings all corrected, terminal `APPROVED`) plus independent
> verification (PASS on ten claims), committed in seven work-unit commits on `main` and **pushed**
> (`03b85e6..0312ca3`) — and the
> machine registration was restored to a single id-free global entry. The native RDD review of the committed
> range was **declined for this candidate by the host** (no lineage, no mutation); §9 has the detail.
> Follow-up filed as **B-109**. Suite **1846/1840/0/6**, `test:static` 99/99.

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** Unchanged since session 55. |
| What is new? | **Session 62 closed B-107** under **ADR-0033**: `--project` is an assertion, the binding resolves from the nearest ancestor `conmuta.json`, one id-free registration serves a tree, and the machine now carries exactly that (`~/.pi/agent/mcp.json`; `FRISCO\.pi\mcp.json` retired). Session 61's **B-105(a)** (the F7a SDD artifact set) is also closed and was undocumented until session 62 wrote its LOG entry. |
| What is next? | **B-106** (the daemon session pool, measured — §7), then **B-109** (the installer entry), **B-108** and the cheap backlog residuals. The Director's calls: the **Engram cloud-sync bookkeeping** rows and **F6** once B-11/B-12/B-16 are decided. **B-105(b)** remains open only for the other three harnesses' argv forms. |
| What must be settled before any work? | §0.3: autonomy, memory, and **Arena** (unreachable at every session's start since 55; confirm with a real tool call). |
| What is the Director's to decide? | The order of B-106/B-109/B-108 (the Director delegated the choice to Kairo for this session); the Engram cloud-sync bookkeeping classification (299 legacy mutation rows, 88 `sync_state` rows, 2 ownership rows, 7 historical drift findings — `repairable: false`); B-11/B-12/B-16 for F6. Session 62's commits are pushed. |
| Where to read next | §0 first; then §3 and §7. §4 is the list of traps. |

---

## §0 — Quick start

### 0.1 Prompt to paste

```text
Lee docs/08-sessions/HANDOFF.md (§0, §3, §4) y confirma Arena con una llamada real. La sesión 60 cerró lo
operativo (bus por proyecto, un solo runner, `$HOME` sin repo fantasma, FRISCO fijado a Engram `frisco`): no lo
rehagas. Sigue B-105(a) —artefactos SDD de `f7a-wake-satellite` contra el código entregado—; después B-106, B-107 y los residuales de cloud sync de Engram.
```

### 0.2 First commands (stop and report if any output disagrees)

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | `## main...origin/main` with no divergence; the LOG's newest entry names the head at session close |
| 2 | `rm -rf dist` | prints nothing |
| 3 | `ls openspec/changes/` | `archive` only |
| 4 | `git status --short` | **empty** (the installer's two `*.bak-pre-conmuta-*` files were removed in session 60 — see §4) |
| 5 | `gentle-ai review mode status` | `receipt-driven development: on (decided by global)`; read it, do not assume it |
| 6 | `gentle-ai --version` | `3.7.0` or later — check fresh each session |
| 7 | `npm run build && npm test` | exit 0; **1841 tests, 1835 pass, 0 fail, 6 skip**; `test:static` **99/99** |

### 0.3 Settle before any work

1. **Autonomy**: confirm the opening prompt re-states it; if it does not, ask one question.
2. **Memory**: start an Engram session (`mem_session_start`) and pass its id to `mem_save`.
3. **Arena**: prove reachability with a real `mcp connect arena` / `bridge_send`, never `curl` alone.
   Sessions 55–59 all found the server itself refusing to connect; if it fails again, that is DN-09's
   substitute condition satisfied directly, and the audit runs under Judgment Day.

### 0.4 Standing instructions from the Director

- **RDD consent is asked per candidate; never answer it for the Director.** Session 59: the START of the F7a
  candidate resolved to `declined_this_candidate` (`risk_level: high`, 43 files / 4553 lines, no lineage
  created, no mutation) — the Director had said RDD was not needed. A decline is candidate-scoped and is not
  the kill switch.
- **Commits are authorized when the Director says so, per session.** Session 59 was authorized explicitly and
  the nine work-unit commits were pushed to `main` (`2aa0da0..f00e8fb`).
- **Commit messages carry no `Co-Authored-By` and no AI attribution**; conventional commits only, by work unit.
- **Never trust a delegated agent's own report at face value.** Session 59's two audit rounds are the
  counter-example that justifies the discipline: the judges found eleven real defects, but one of them
  mis-cited `src/shared/constants.ts:86,94` (verified by hand: line 86 is `MAX_LONGPOLL_SECONDS`, line 94 is
  `FETCH_LONGPOLL_MAX_SECONDS`), so every judge citation is re-read against the file before being accepted.
- **The `frisco` binding is the next real test** (see §8): project id `frisco`, root `...\ORION OCG\FRISCO`.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1–F5 | **Archived**, unchanged since session 55 | `openspec/changes/archive/` |
| B-98, B-99, B-100(a)(b), B-101, B-103 | Closed (sessions 55–58) | `docs/06-backlog/CHECKLIST.md` |
| **B-104** | **Done, session 59**: the wake satellite is implemented, tested, audited and pushed | `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md`; `docs/runbooks/wake-satellite.md` |
| **F7a** | **Implemented** (not blocked on F6); F7b (referee) still follows F6 and `bus-v2-referee-001` | `docs/07-plan/WORK-PLAN.md` |
| **B-105** | **Open for (b) only.** **(a) IS DONE — session 61** (2026-10-01): the retrospective SDD artifact set was written against the shipped code and archived to `openspec/changes/archive/2026-10-01-f7a-wake-satellite/`, with the four capabilities landed as canonical specs; commits `0ea16ef`, `3c57b0d`, `03b85e6`. **The native reviewer's size ceiling is now measured**: a 214 KB documentation candidate is refused with `lens_context_budget_exceeded` (no lineage), while a 58 KB normative half passes — so a larger documentation candidate must be reviewed in its normative half. What remains of (b) is the `claude`/`codex`/`opencode` argv forms. (c) the Windows `.cmd` gate is documented, with the working remedy (a real shell-free launcher on the runner process's PATH only — commit `86a26dd`); (d) `autopilot`'s profile is prompt + harness policy, not a mechanism; (e) the wake ledger is self-reported | `openspec/changes/archive/2026-10-01-f7a-wake-satellite/`; `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md` Implementation note; `docs/runbooks/wake-satellite.md` |
| B-95 remainder, B-102 residuals | Open, low priority, "cheap win at the next touch" | §7 |
| **B-106** | Open, **measured in session 60**: the daemon's 64-slot pool leaks ≈2.5 session-shapes per hour and stays invisible to `status`/`doctor` | `docs/06-backlog/CHECKLIST.md` |
| **B-107** | **RESOLVED — session 62**, under [ADR-0033](../03-adr/0033-project-flag-as-assertion.md) (`accepted`): `conmuta mcp --project <id>` is an assertion, the binding resolves from the nearest ancestor `conmuta.json`, and one **id-free** user-level registration serves every session under a tree — including a subfolder session and a headless `pi -p` turn, both of which a project-level entry loses (cwd-relative, and trust-gated so a non-UI run resolves *not trusted*). Audited (Judgment Day, two rounds, terminal `APPROVED`) and independently verified. Commits `75f0b1a`, `224d763`, `40f7fd9`, `d67b692`, `f8395d4`, `8a64413`, `0312ca3` — **on `main` and pushed** | `docs/03-adr/0033-project-flag-as-assertion.md`; `docs/05-tribunal/INDEX.md` (`bus-v2-b107-optional-project-001`); `odd/tasks/b-107-optional-project-walkup.md` |
| **B-109** | Open, filed in session 62: the installer still writes `--project <id>` into every tool-config entry it generates, and where a host reads both a user-level and a project-level config the project entry **replaces** the global one by server name — so one installer run can silently reintroduce the trust gate ADR-0033 removed. Changing a D-42 wizard artifact needs its own ADR-level decision | `docs/06-backlog/CHECKLIST.md` |
| **B-108** | Open, filed in session 60: every `npm test` leaves one `%TEMP%\conmuta-*` scratch directory behind (242 had accumulated, 29 MB; the pile was removed) | `docs/06-backlog/CHECKLIST.md` |
| Next SDD change | None queued; **B-109** is the natural next unit (installer entry shape) or **B-106** (the daemon session pool); F6 blocked on B-11/B-12/B-16 | `docs/07-plan/WORK-PLAN.md` |
| Tests on `main` | `npm test` **1846/1840/0/6**; `test:static` **99/99** | — |

---

## §2 — What session 59 did (context, not to redo)

1. **Governance half**: ADR-0032 + CONSTITUTION §3.1 (three component classes; a local body-less wake is not an
   emission; the ladder `off`·`notify`·`wake`·`autopilot`, per binding, machine-local, human-signed; bounds; one
   ledger row per accepted wake), THREAT-MODEL T23–T25 + PT-34–PT-38, F7 split into F7a/F7b, reciprocal in-part
   supersession notes on ADR-0006/0029, the RFC's three corrections, B-104 decided. Audited
   (`bus-v2-b104-wake-satellite-001`, `APPROVED`).
2. **Implementation half**: `runner/{constants,ladder,ledger,prompt,harness,loop,cli,main,watermark}.ts`, eight
   test files, PT-34 in the security suite, a third `bin`, the operator runbook. **No `src/` file changed.**
3. **Audit**: `bus-v2-f7a-audit-001`, Judgment Day, two rounds — round 1 eleven real defects (four CRITICAL),
   all fixed with a regression test each; round 2 **zero findings** from both judges.
4. **Delivery**: nine work-unit commits + the close-out, pushed to `main`.

---

## §3 — What's next

1. **The `frisco` binding is already armed and running — do not re-arm it.** Level `wake`, harness `pi`, since
   2026-10-01T01:49:43Z; it auto-starts at logon from the per-user Startup folder and a restart-loop wrapper
   keeps it alive (`C:\Users\LABORATORIO\conmuta-runner\README.md` documents what is installed and the order in
   which to stop it). The wake path is **proven live**: a new BROADCAST from `@rodrigo-agent` produced one
   `wake` row with `outcome: exited` and moved the watermark 24→25. To inspect it, read
   `~/.conmuta/runner/wake-ledger.jsonl` and that wrapper's `runner.log`; the real switch is
   `ladder disable`, not killing the process.
2. **Make the bus registration project-scoped, not global.** Pi reads project servers from
   `.pi/mcp.json` and user servers from `~/.pi/agent/mcp.json`, and the installer already writes the
   project file for its `pi` tool target (`src/installer/tool-targets.ts:73`, id-only, merging never
   overwriting). A **user-level** entry that hardcodes `--project <id>` is global: it makes every Pi session
   on the machine load a client that refuses in any other project's folder. Fix: register the bus in each
   project's `.pi/mcp.json`, and leave the user-level file without a project-bound bus entry.
   **DONE, session 60:** `FRISCO/.pi/mcp.json` carries `conmuta --project frisco`; the global entry is gone
   (backup `~/.pi/agent/mcp.json.bak-pre-project-scope-20260930-215503`). Verified: `pi mcp list` in FRISCO →
   `conmuta: connected, 4 tools (codemode, project)`; in an unrelated folder → no `conmuta`. **Caveat, measured
   with Pi's own code:** a project `.pi/mcp.json` is read only with a saved trust decision
   (`~/.pi/agent/trust.json`), and a non-UI run (`pi -p`, i.e. the woken turn) resolves *not trusted* without
   one — the turn would keep its quota cost and lose the bus tools. FRISCO's decision was recorded on the
   Director's explicit instruction. Sessions whose cwd is a FRISCO subfolder (`frisco-erp`, `frisco-caseta`, …)
   do **not** inherit the entry: project config is cwd-relative, with no ancestor walk-up. The project file
   carries the bus only; the Engram project for that root is pinned by `FRISCO\.engram\config.json` instead
   (see §4), so no global server definition is duplicated per project.
   **SUPERSEDED, session 62:** the Director authorized the durable fix of **B-107**, and it is the opposite
   shape — one **id-free** entry at the user level (`conmuta mcp`, no `--project`), because the client now
   resolves the binding from the nearest ancestor `conmuta.json` (ADR-0033). That closes both halves of the
   caveat above at once: a subfolder session resolves the enclosing tree, and a headless `pi -p` turn no
   longer depends on a project-trust decision because the entry it loads is not project-scoped.
   `FRISCO\.pi\mcp.json` was retired (backup `mcp.json.bak-pre-b107-…`).
3. **Verify the "N sessions, one runner" property on the machine.** Open a second session in `FRISCO` and
   confirm the four `conmuta_*` tools appear there; confirm with
   `Get-CimInstance Win32_Process` that exactly **one** `dist\runner\main.js` serves that binding, and that
   the ladder is still `wake`. This is the check that turns the Director's requirement ("any number of
   sessions in one folder, permanently") into evidence rather than an intention.
   **DONE, session 60:** the four `conmuta_*` tools were confirmed in a FRISCO session and by a real headless
   turn that read the bus and posted a reply; exactly one `cmd /c run-frisco.cmd` and one
   `node dist\runner\main.js` serve the binding; the ladder is still `frisco: wake (pi)`. A **duplicate restart
   loop** was found and removed: the autostart wrapper had been left reading a hot-edited `run-frisco.cmd`, so
   it only pinged and started no runner, while the live runner hung off a manually started loop that dies at
   logoff. One loop now, relaunched through `start-frisco.vbs`; the hazard and its symptom are documented in
   the satellite's README (`C:\Users\LABORATORIO\conmuta-runner\README.md`).
4. **Arm any other binding the Director names**, one signed `ladder set` per project, never a second runner
   per binding (§4's session-pool and one-runner rules).
5. **B-105(a)**: write the `openspec/changes/f7a-wake-satellite/` artifact set (proposal, spec, design,
   tasks) against the shipped code, so the phase has the SDD record every other phase has. **B-106**: the
   daemon's session pool (the thin client never releases its slot) — the one ceiling "permanently, for days"
   runs into.
6. **Then F6** once B-11/B-12/B-16 are decided; **F7b** after F6.

---

## §4 — Facts that will bite you

- **The daemon keys `client_cursors` by the IPC session id** and seeds a new session at its catch-up window
  (`SESSION_CATCHUP_HOURS`, `src/ledger/cursors.ts`). Any satellite that only read the daemon's cursor would
  re-wake that whole window on every restart; `runner/watermark.ts` exists for exactly that reason and must not
  be "simplified" away.
- **The doorbell answers immediately (count 0) when the inbox holds rows that are not relevant to this
  binding.** A loop that neither sleeps nor advances its own watermark on that answer spins at full speed.
- **Argument refusal must match three shapes**: exact, `--flag=value`, and the attached short form. Equality
  alone let `--command=sh` and `--dangerously-skip-permissions=true` through.
- **On Windows a harness `.cmd` shim is refused (`unavailable`)**, never shell-wrapped: the shell fallback is
  the RCE path the design exists to prevent.
- **`autopilot` is bounded where a bound can be enforced** (one spawn site, closed executable set, literal argv,
  allow-listed environment, project cwd, bounded turn) **and instructed where it cannot** (no push/merge/tag,
  no settings writes, no secret reads). The harness's own configuration is the real boundary; the runbook says
  so in the operator's words.
- **The wake ledger is self-reported** (ADR-0032 R6a): the daemon cannot corroborate it.
- **Judge and auditor citations get checked against the file** (§0.4).
- **The daemon's session pool is bounded and is never reclaimed by the thin client.** `MAX_ACTIVE_SESSIONS = 64`
  (`src/shared/constants.ts`), in memory, per boot, freed only by a graceful `DELETE /session` — and
  `src/client/ipc-stub.ts:16` says in the client's own words that *nothing in this client ever calls it*. The
  runner and the channel adapter do release theirs. Every host session that ends therefore leaves a bearer
  behind: five or six concurrent sessions are far below the cap, but a day of opening and closing them is not,
  and the ceiling stays invisible in `status`/`doctor` until new sessions start being refused. Filed as
  **B-106**; restarting the daemon frees the pool meanwhile.
- **Two ways to give a folder the bus tools, and only one of them is per project.** The designed mechanism is
  the **project-level** MCP entry — for Pi, `.pi/mcp.json`, which `src/installer/tool-targets.ts:73` already
  writes per project (id-only, opt-in per tool, merging never overwriting, and Pi reads it after the project
  is trusted). A **user-level** entry (`~/.pi/agent/mcp.json`) is global: an entry bound to `--project frisco`
  makes every Pi session on the machine load a client that refuses in any other project's folder. Use the
  project file for a project's binding.
- **PT-22's repository scan reads TRACKED files only** (`test/security/repo-scan.test.ts` over `git ls-files`),
  so a token-shaped literal inside a brand-new file is invisible to it until that file is committed — session
  59's suite was green at nine commits and turned red on the tenth, when the file carrying the fixture became
  tracked. Run the full suite **after** `git add`, or keep fixtures' values non-token-shaped from the start.
- **The RDD reviewer lens routing did not exist until session 60**, and it now lives at
  `~/.pi/gentle-ai/models.json` (`review-risk`, `review-resilience`, `review-readability`, `review-reliability`
  → `{"model": "omniroute/agy/gemini-3.8-flash-high", "thinking": "high"}`). Without that file the host relay
  refuses every lens-requiring candidate (*no model is configured for …*), which is why earlier sessions only
  ever saw low-tier closures or declines. Do not point a lens at `anthropic/…` on this machine: `pi auth check
  --provider anthropic` answers `ready` and completions still fail with
  `403 oauth_not_allowed_for_organization`.
- **The installer's two `*.bak-pre-conmuta-*` files were removed (session 60)** after checking what each
  held: `AGENTS.md`'s conmuta block is committed (`git show HEAD:AGENTS.md`), and the `.mcp.json` backup
  carried nothing the live file lacks (same arena bearer, no extra server). The tree is now clean, so §0.2's
  row 4 expects **no** `git status --short` output.
- **`$HOME`'s ghost git repository was removed (session 60).** `C:\Users\LABORATORIO\.git` existed (created
  2026-09-23), held **0 commits, 0 objects, no refs/index/stash**, and made every folder under `$HOME` that
  has no repo of its own — including `…\ORION OCG\FRISCO`, the binding root — report `C:/Users/LABORATORIO` as
  its toplevel, so `git status`/`git add` there operated against a zero-commit home repo. A copy of the only
  file with information (`engram-project-identity.json`) sits in `.git-ghost-backup-20260930T2245\`. The
  machine `AGENTS.md` guardrail that caught it is unchanged and still applies.
- **Engram project attribution changed with it.** Delete-the-ghost-repo made Engram's cwd detection explicit:
  a folder is `ambiguous` when several repos live inside it, and `FRISCO` (whose real work is in
  `frisco-erp`) was previously attributed to `laboratorio` through that ghost root. `FRISCO\.engram\config.json`
  now pins it (`{"project_name":"frisco"}`, detection `source=config`), while descendants keep their own
  projects (`frisco-erp` via remote, `frisco-caseta` via its own root). `$HOME` and `Downloads` stay explicitly
  ambiguous; a memory write from there needs `--project`/`ENGRAM_PROJECT`. Same session, `engram projects prune`
  removed 21 zero-observation projects and `projects consolidate --all` merged the two case duplicates
  (`Vannar`→`vannar`, `alexa-claudeCode`→`alexa-claudecode`); 108 → 85 projects, no observation lost.
- **`conmuta.json` is now committed** (it is the D5 project file the installer wrote).
- **MSYS/Windows shell**, PowerShell default, Bash available; `rm -rf`/`grep` work there only. `npm test`
  output lines start with `ℹ`; `dist/` staleness fakes results — remove it first. `npm run test:static` prints
  benign Windows `reg.exe` stderr noise; read the summary.

---

## §5 — Next session, exact sequence

- [ ] **1. Verify the tree** (§0.2); the suite must be 1846/1840/0/6 and `test:static` 99/99. Session 62's
      seven commits are already on `main` and pushed (`03b85e6..0312ca3`); read `git log` rather than §0.2's
      baseline before assuming the numbers.
- [ ] **2. Settle §0.3** (autonomy, Engram session, Arena).
- [ ] **3. The default unit is B-109** (the installer's entry still carries `--project <id>`, which can
      silently reintroduce the trust gate ADR-0033 removed wherever a host reads both a user-level and a
      project-level config). It changes a D-42 wizard artifact, so it needs its own ADR-level decision and the
      four SDD preflight questions (Automatic / Both / Auto is the recorded default) before any code.
- [ ] **4. Alternatives the Director may prefer**: B-106 (release the thin client's slot; the measurement is in
      the backlog row), B-108 (test hygiene), or B-105(b) (the `claude`/`codex`/`opencode` argv forms for the
      wake satellite).
- [ ] **5. If the live `frisco` binding needs attention**, read its ledger and
      `C:\Users\LABORATORIO\conmuta-runner\runner.log` together. Treat an `unavailable` outcome as the Windows
      `.cmd` question (§4) rather than as a code defect, and remember one legitimate result: a `wake` turn that
      reads, finds nothing addressed to its agent and stays silent is **correct**.
- [ ] **6. Close the session**: overwrite this file, add the LOG entry at the top, update `AGENTS.md`'s Status
      pointer, the tribunal index if an audit ran, and the backlog rows touched. The RDD preflight runs per
      candidate, and the reviewer lens routing now exists at `~/.pi/gentle-ai/models.json` (§4).

---

## §6 — Do not redo

- F1–F5 archives, B-98, B-99, B-100(a)(b), B-101, B-103: closed; do not re-open or re-review.
- **F7a's eleven audit corrections**: each one exists because a judge found the defect real. In particular do
  not re-tighten `isRefusedArgument` to equality, do not drop the post-poll ladder re-read, do not commit the
  cursor for a turn that did not exit, and do not remove `runner/watermark.ts`.
- **PT-34's allow-lists and the third `bin` wiring** in `package.json`/`tsconfig.json`/
  `test/security/pack.test.ts`/`test/cli/main.test.ts`.
- The acknowledged RDD lineages listed in earlier sessions' §9 records, and session 59's
  `declined_this_candidate` START (no lineage was created; nothing to chase).

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-105(a)** | the F7a SDD artifact set — the only owed item of the phase's record. (b) is satisfied for `pi`: the wake path ran live four times and the 04:22:00Z turn read a peer message and replied on the bus; (c)(d)(e) are documented design consequences, not defects | Director schedules; Kairo writes |
| **B-106** | the daemon's session pool (measured: ≈2.5 session-shapes/hour, 13 of 64 in the current boot, and every runner restart burns one). Cheap remedy now: restart the daemon; the real fix is releasing the slot on the client's exit | Kairo (F1 follow-up) |
| **B-107** | **RESOLVED in session 62** under ADR-0033; see §1. The machine now carries one id-free user-level entry and `FRISCO\.pi\mcp.json` is retired (both backed up) | done |
| **B-109** | the installer's launcher entry still encodes `--project <id>`: where a host reads both configs, the project entry replaces the global one by server name and the trust gate comes back. Needs its own ADR-level decision (D-42) | Kairo (F2 follow-up) |
| **B-108** | one `%TEMP%\conmuta-*` scratch directory per full test run (test hygiene, not correctness) | Kairo |
| **B-108** | one scratch directory per full test run under `%TEMP%` (test hygiene, not correctness); the accumulated 29 MB were removed, the row stays open until the suite stops adding new ones | Kairo |
| Engram housekeeping | 299 legacy cloud-sync mutation rows and 2 ownership rows the tool marks `repairable: false` (per-row human classification; local use unaffected), 1 deliberate drift case (`manual-save-frisco`), and three backups to delete once nothing needs reverting | Director |
| B-95 remainder, B-102 residuals | Carried; cheap wins at the next touch | Kairo |
| The selectorless RDD chain's stale base and the terminally-stopped lineage `review-688b995abb754a4c` | Not observed firing in session 59 | Director/maintainer |
| B-11, B-12, B-16 | Gate F6 | Director |

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0, `gentle-ai` **3.7.0**, PowerShell primary with Bash (Git Bash) available.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`, **pushed** through
  `f00e8fb`. `gh` commands run with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`;
  never `gh auth switch`. Force-push and deletion of `main` are blocked.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, read-only.
- **The local bus (conmuta) is live on this machine**: daemon home `~/.conmuta/`, two bots
  (`agente_kairo_bot`, `agent_luisgtz_bot`) and two bindings — `telegram-bus-agent` (this repository, group
  `-5419222443`, roster only `@kairo-agent`) and **`frisco`** (root `...\ORION OCG\FRISCO`, group `-5457758012`,
  roster `@luisgtz-agent`, `@rodrigo-agent`, `@jomata-agent`, `@luisrey-agent`, `@coordinador-frisco`).
  A session bound to one project **cannot** address another binding's agents: the bus is per-binding and the
  roster gates addressing.
- The SDD preflight for this project is Automatic / Both (hybrid) / Auto (`stacked-to-main`), asked again
  whenever a *new* SDD change starts.
- **Two identifiers must not be mixed.** This repository's Engram project is **`connmuta`** (from its own
  remote), while the FRISCO work has **Engram `frisco-erp`** (remote `consultores-orion/frisco-erp`) and
  **bus `frisco`** (the `FRISCO` parent folder). A session can only write memory into its **own** project —
  the provider refuses otherwise — so cross-project knowledge goes in a session of that project, in a
  `global`-scope note, or by message.
- **A Pi session-to-session message needs an explicit recipient id** when many sessions are advertised
  (45 on 2026-10-01), and acceptance is an enqueue, never a read receipt; identity is confirmed only by the
  peer's own reply.
- **CodeGraph**: present and usable, `codegraph_explore` directly — do not re-init.

---

## §9 — RDD / audit state at session close

0. **Session 62, `bus-v2-b107-optional-project-001`** (ADR-0033 + the B-107 change): Judgment Day (Arena
   unreachable — `mcp connect arena` → *nothing is listening*, DN-09's substitute satisfied directly), two
   blind judges over the frozen manifest `sha256:18fa6423…` (24 files, uncommitted), both
   `APPROVE_WITH_CHANGES`, **seven findings all real and all corrected** (one CRITICAL, documentation
   integrity: the ADR asserted an audit that had not happened; one behavioural WARNING: `--project ""` bound
   silently by walk-up). Round 2 over the fix delta (`sha256:607de61f…`): A 4/4 and B 7/7 `verified`, one
   fix-caused cosmetic defect corrected. Independent verification (`gentle-ai-verify`) PASS on ten claims,
   zero contradictions. **Terminal verdict `APPROVED`.** The judge-B role needed four attempts (two provider
   `503 chat_admission_busy`, one 30-minute `bash` stall; the fourth ran on `deepseek/deepseek-flash` via a new
   `model_profiles` entry in `~/.pi/agent/subagents.json`, backed up). **No partial judgment was accepted.**
   **RDD**: `inspect` ran twice (workspace candidate; then the committed `base-diff` range `03b85e6..8a64413`,
   23 files / 809 changed lines, `risk_level: high`, `risk_evidence: ["code that starts other processes in
   channel/main.ts"]`); START resolved to **`declined_this_candidate`** — resolved by the host, not answered
   here, `lineage_created: false`, `mutation_performed: false`. A decline is candidate-scoped; the separate
   verifier the RDD-off fallback re-enables is the independent verification above. A fresh START is the way to
   ask for the four lenses.
1. **`bus-v2-b104-wake-satellite-001`** (governance half): Judgment Day, 2 rounds, `APPROVED`; two CRITICAL
   findings fixed (the missing tribunal row; a wake-audit row that could not exist outside the core — now R6a's
   self-reported ledger).
2. **`bus-v2-f7a-audit-001`** (implementation): Judgment Day, 2 rounds, `APPROVED`; round 1 eleven defects, all
   fixed with tests, round 2 zero findings.
3. **RDD native review**: `inspect` ran, the intended-untracked selection was submitted, and START resolved to
   `declined_this_candidate` (`risk_level: high`, 43 files / 4553 lines, `lineage_created: false`,
   `mutation_performed: false`). No lineage exists and no authority was burned; nothing to acknowledge or
   chase. If the Director later wants the four lenses on this candidate, that is a fresh START.
4. **This session's first candidate (session 60, the 40-line HANDOFF close-out)**: `inspect` → `start` closed it
   at the start (`risk_tier: low`, `lenses_required: false`, `selected_lenses: []`,
   `risk_reasons: [non_executable_only]`, 1 file / 40 changed lines, correction budget 20) → `status` offered
   `approved_acknowledgement_required` → `acknowledge-approved` burned authority
   (`gentle-ai.review-acknowledged/v1`, lineage `review-73e0e357217ed1c5`). No lens ran and no consent envelope
   was raised; the durable trail is the receipt under `.git/gentle-ai/`, not a source commit. **The candidate
   grew again after that burn** (this session added the LOG entry, these §4 bullets and B-106/B-107 to the
   checklist), so what was delivered is a fresh candidate: its own closure is recorded in the close-out
   commit's message, and delivery stayed ordinary repository policy.
