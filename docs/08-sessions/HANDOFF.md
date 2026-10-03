# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what the
> next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live in the
> ADRs and the tribunal index, never here.
>
> **Last rewritten: end of session 63** (2026-10-02 local). Session 62's and the 2026-10-02 handoff
> coherence pass's text is preserved in §2 and §4 where it still holds; every § carries session 63's state
> unless a line says otherwise.
>
> **Session 63 in one paragraph — two backlog rows closed, three live links repaired, and a validated open
> list.** The instruction was open-ended ("continúa con lo que sigue, valida que lo que falta por hacer
> para no generar segundas o terceras capas de código basura") under a standing authorization for the
> session, with no question to be put back to the Director. **The validation came first and it changed the
> plan**: the two units landed are the two whose evidence still stood when re-measured against the tree,
> and three items the backlog described as real work were re-scoped rather than swept. **B-109** closed
> under **[ADR-0034](../03-adr/0034-id-free-installer-entry.md)** — the installer no longer writes a
> project id into the entries it generates (`buildLauncherEntry()` → `args: [CLI_ENTRY, "mcp"]`), because
> an id in a config that travels with the directory goes stale on a copy or a re-bind and the client then
> refuses to start with `EXIT_PROJECT_MISMATCH`; `project bind` prints one line recommending the single
> id-free user-level registration. **B-108** closed at its cause, not by sweeping 260 `mkdtempSync` sites:
> the measured leak was exactly one `%TEMP%\conmuta-cli-sync-roster-*` per suite run, caused by the
> installer CLI opening the ledger and never closing it (on Windows the open `ledger.db` locks the whole
> `--home` directory, and the test's `catch {}` hid the `EPERM`); `src/cli/main.ts` gained
> `withInstallerLedger`, used at all four installer call sites, and the test cleanup is now strict — RED
> reproduced first (`EPERM, Permission denied: …conmuta-cli-sync-roster-V5meG3`), GREEN after. A full-tree
> link sweep found **three live broken links nobody had recorded** (the canonical
> `openspec/specs/project-binding/spec.md`, twice, and the `README.md` status paragraph, which was also
> six phases stale); all three are fixed, and the 38-link artifact inside `openspec/changes/archive/**` is
> filed as **B-110** with its root cause rather than churned. **Suite 1862/1856/0/6**, `test:static`
> **99/99**. Native RDD resolved to `declined_this_candidate` (host-resolved, no lineage, no mutation),
> the third session in a row; the audit is the Judgment Day record in §9. Commits and push status: see §1
> and §8 — read `git log` rather than this line.

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** Unchanged since session 55. |
| What is new? | **Session 63 closed B-109 and B-108.** B-109: the installer's written entry is **id-free** now (ADR-0034), closing the arc ADR-0033 opened. B-108: the suite's one systematic `%TEMP%` leak is fixed at its cause (the installer CLI's unclosed ledger), with a RED-first pin. Three previously unrecorded live broken links fixed. **B-110** filed for the archive-move link artifact. |
| What is next? | **B-106's remainder** (occupancy visibility in `status`/`doctor` — a wire-contract change; and a dead-pid sweep) is the substantive next unit. **B-105(b)** is now cheap: all four harnesses (`pi`, `claude`, `codex`, `opencode`) ARE installed on this machine, so the other three argv forms can be verified live. **B-110** is the cheap systemic win (a link check in `test:static`). Residuals: B-95(d) + `fetch.ts`'s unguarded parse, B-102(a)(b)(c)(f)(g). **F6** still blocked on B-11/B-12/B-16. |
| What must be settled before any work? | §0.3: autonomy, memory, and **Arena** (unreachable at every session's start since 55; confirm with a real probe). |
| What is the Director's to decide? | The order of B-106's remainder / B-105(b) / B-110; the Engram housekeeping classification (299 legacy mutation rows, 88 `sync_state` rows, 2 ownership rows, 7 historical drift findings — `repairable: false`); B-11/B-12/B-16 for F6. |
| Where to read next | §0 first; then §3 and §7. §4 is the list of traps. |

---

## §0 — Quick start

### 0.1 Prompt to paste

```text
Lee docs/08-sessions/HANDOFF.md (§0, §1, §3, §4) y confirma Arena con una llamada real. Estado al cerrar la
sesión 63: B-109 cerrado bajo ADR-0034 (el instalador ya no escribe el id del proyecto en las entradas que
genera: `buildLauncherEntry()` devuelve `[CLI_ENTRY, "mcp"]`) y B-108 cerrado en su causa (el CLI instalador
abría el ledger y nunca lo cerraba, y en Windows eso bloqueaba el directorio `--home`: un `%TEMP%\conmuta-*`
por corrida). Suite 1862/1856/0/6, `test:static` 99/99. La siguiente unidad natural es B-106 resto
(visibilidad de ocupación en `status`/`doctor` — cambio de contrato de cable — y barrido por pid muerto);
alternativas: B-105(b) (los argv de `claude`/`codex`/`opencode`, que SÍ están instalados en esta máquina, así
que ya es verificable), B-110 (un chequeo de links en `test:static` y el re-anclaje de los 38 links dentro de
`openspec/changes/archive/**`) o los residuales B-95(d)/B-102. Respeta §0.4: los commits se autorizan por
sesión, y el consentimiento de la revisión nativa es del Director, no tuyo.
```

### 0.2 First commands (stop and report if any output disagrees)

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | `## main...origin/main` with no divergence, and a clean tree. Read `git log --oneline -12` rather than trusting a SHA written here: session 63's work-unit commits sit on top of session 62's close-out, which itself sits on top of `b81bf21` (the last B-106 work-unit commit) and, three further back, `239eb18` (the handoff-coherence pass). **Do not treat the commit base as a fixed number** — take it from `git log` |
| 2 | `rm -rf dist` | prints nothing |
| 3 | `ls openspec/changes/` | `archive` only |
| 4 | `git status --short` | **empty** |
| 5 | `gentle-ai review mode status` | `receipt-driven development: on (decided by global)`; read it, do not assume it |
| 6 | `gentle-ai --version` | `3.7.0` or later — check fresh each session |
| 7 | `npm run build && npm test` | exit 0; **1857 tests, 1851 pass, 0 fail, 6 skip**; `test:static` **99/99** |
| 8 | `ls -d "$TEMP"/conmuta-* \| wc -l` before and after one `npm test` | the count must NOT grow. Before session 63 it grew by exactly one every run |

### 0.3 Settle before any work

1. **Autonomy**: confirm the opening prompt re-states it; if it does not, ask one question.
2. **Memory**: start an Engram session (`mem_session_start`) and pass its id to `mem_save`. This
   repository's Engram project is **`connmuta`** (§8).
3. **Arena**: prove reachability with a real tool call, never `curl` alone. Session 63's evidence:
   `pi mcp list` shows **no `arena` server registered**, and a TCP connect to the documented endpoint
   (`timeout 5 bash -c '</dev/tcp/127.0.0.1/8765'`) answers **connection refused**. That satisfies DN-09's
   substitute condition directly, and the audit runs under Judgment Day.

### 0.4 Standing instructions from the Director

- **RDD consent is asked per candidate; never answer it for the Director.** Session 63's START resolved to
  **`declined_this_candidate`** — resolved by the host, `lineage_created: false`, `mutation_performed:
  false`, `risk_level: high`, 21 files / 379 changed lines, `risk_evidence: ["code that starts other
  processes in src/cli/main.ts"]` — the **third** session in a row (59, 62, 63). A decline is
  candidate-scoped and is not the kill switch, and it never lowers the bar: the RDD-off fallback re-enables
  the separate verifier, which is what `gentle-ai-verify` provides. **The consent binding EXPIRES AFTER 10
  MINUTES**, so `inspect` → START → answer must fit in one uninterrupted window.
- **Commits and push are authorized per session, and the two are not the same authorization.** Session 62
  required two separate words ("commits, but after the audit", then "push"). **Session 63's authorization
  was a single blanket one** — *"tienes toda mi autorización para que apliques todo lo que consideres
  necesario y prudente"*, with an explicit instruction that no question be put back — and it was read as
  covering the work-unit commits and the push (the machine-level `AGENTS.md` makes publishing the default).
  **Disclose this reading in the LOG entry; if a future Director wants the stricter two-step, say so.**
- **Never accept a partial judgment, and never accept an `APPROVE` as if it were the gate.** Session 62's
  counter-example stands: `jd-judge-b` `REJECT`ed a submission on a CRITICAL that was right while
  `jd-judge-a` recorded the false premise as CONFIRMED OK. A judge that fails or times out leaves its
  corner unaudited (retry it); an `APPROVE` from one judge is one input, not the verdict.
- **A judge's citations get checked against the file** (session 59 mis-cited `constants.ts:86,94`).
- **Commit messages carry no `Co-Authored-By` and no AI attribution**; conventional commits only, by work
  unit.
- **Never trust a delegated agent's own report at face value.**
- **The `frisco` binding is live and must not be re-armed** (§3).
- **Do not enter RDD `inspect` while a candidate is still moving** if you intend the audit to cover it;
  session 63's audit covered a frozen 21-file set and three documentation files were fixed afterwards,
  which is disclosed in §9 rather than hidden.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1–F5 | **Archived**, unchanged since session 55 | `openspec/changes/archive/` |
| B-98, B-99, B-100(a)(b), B-101, B-103, B-104, B-105(a) | Closed (sessions 55–61) | `docs/06-backlog/CHECKLIST.md` |
| **B-106** | **RESOLVED AT ITS SOURCE — session 62** (the thin client releases its daemon slot on a real transport close). **Remainder open and disclosed**: (a) occupancy visibility in `status`/`doctor` — a wire-contract change over `shared/ipc-contract.ts`'s closed key set, its PTs and two canonical specs; (b) a dead-pid sweep (the `pid` lives on `client_cursors`, a different mechanism); plus two leak windows (a client killed without a graceful exit; a tool call that BEGINS a handshake after the release returned) | `docs/06-backlog/CHECKLIST.md`; `odd/tasks/b-106-client-session-release.md` |
| **B-107** | **RESOLVED — session 62** under [ADR-0033](../03-adr/0033-project-flag-as-assertion.md) (`accepted`): `--project` is an assertion, the binding comes from the nearest ancestor `conmuta.json`, and one **id-free** user-level registration serves a whole tree. Audited (Judgment Day, 2 rounds, terminal `APPROVED`), independently verified, pushed | `docs/03-adr/0033-project-flag-as-assertion.md` |
| **B-108** | **CLOSED — session 63.** Not by sweeping the suite's 260 `mkdtempSync` sites: re-measured, the only systematic leak was **one `%TEMP%\conmuta-cli-sync-roster-*` per full run**, from `test/cli/main.test.ts`'s `project sync-roster` case, whose cause is a real defect — `runCli` opened the installer ledger through `openInstallerLedgerOrFail` and never closed it, so on Windows the open `ledger.db` locked the whole `--home` directory and the test's `try { rmSync } catch {}` swallowed the `EPERM`. Fixed with `withInstallerLedger(homeDir, body)` in `src/cli/main.ts` (**closes in a `finally`**, used at all four installer call sites), and the test cleanup is strict now. **RED observed before GREEN** | `docs/06-backlog/CHECKLIST.md`; `src/cli/main.ts`; `test/cli/main.test.ts` |
| **B-109** | **CLOSED — session 63** under [ADR-0034](../03-adr/0034-id-free-installer-entry.md) (`accepted`): `buildLauncherEntry()` takes no project and emits `args: [CLI_ENTRY, "mcp"]`; `project bind` prints one line recommending the id-free user-level registration; the canonical `tool-config-merge` requirement is restated as *"Written entries are id-free stdio, zero env, never npx"*; ADR-0031, ADR-0033 and ADR-0006 each gained an append-only note; `CONSTITUTION.md` §3 layer 3, `OVERVIEW.md` (D5, Assign-project, §10.3), `WORK-PLAN.md` F2 and the tribunal's D5 row are reconciled. **Deliberately still out of scope**: the installer keeps writing project-level entries and never writes a user-level config (D-42's matrix) | `docs/03-adr/0034-id-free-installer-entry.md`; `src/installer/launcher.ts`; `openspec/specs/tool-config-merge/spec.md` |
| **B-110** | **NEW — session 63.** A full-tree relative-link sweep found **38** broken links inside `openspec/changes/archive/**` (F1: 19, F2: 11, F7a: 8) and **3 live ones** nobody had recorded: `openspec/specs/project-binding/spec.md:13` and `:75` (the canonical spec inherited the F1 delta's `../../../../../docs/...` links verbatim during composition, one directory too deep) and `README.md`'s status paragraph pointing at the pre-archive path. **Root class**: `openspec archive` moves a change one level deeper and every link keeps its old `../` count; composition then copies those links into the canonical spec. The three live ones are **fixed**; the 38 archive ones are **left on purpose** (frozen records, mechanical but churny, session 62's own call) with the cheap systemic fix proposed: a link check in `test:static` plus a re-rooting step in the archive procedure | `docs/06-backlog/CHECKLIST.md` (B-110) |
| **B-111** | **NEW — session 63, from the audit.** `conmuta project bind` can leave a *partially applied* bind: the tool-config loop runs after `conmuta.json` is written and the registry is committed, and `editFile` is refuse-and-diff, so a differing same-named entry throws `FileEditRefusal("conflict")`, uncaught in the wizard and uncaught by the CLI, and the run stops with the project already bound. Pre-existing, not introduced by ADR-0034 — but ADR-0034's change is what makes a stale entry likely enough to hit it. Fix shapes named in the row: dry-validate before the commit, roll back, or surface a resumable partial outcome | `docs/06-backlog/CHECKLIST.md` (B-111) |
| **B-105** | **(a) done (session 61).** **(b) now cheaply doable**: all four harnesses are installed on this machine — `pi` (`%APPDATA%\npm\pi`), `claude` (`~/.local/bin/claude`, a real binary), `codex` and `opencode` (`%APPDATA%\npm\codex` / `opencode`, both with `.cmd` shims, so B-105(c)'s shell-free-launcher question applies). What remains of (b) is verifying their argv forms live. (c)(d)(e) are documented design consequences, not defects | `docs/06-backlog/CHECKLIST.md`; `docs/runbooks/wake-satellite.md` |
| **B-95 remainder, B-102 residuals** | Open, low priority, "cheap win at the next touch". B-95: (d) stays design-exact; `src/daemon/serve/fetch.ts:244-246`'s unguarded `JSON.parse` needs its own decision; plus three non-blocking notes (R2-1, R3-1, the silent skip). B-102: (a)(b)(c)(f)(g) — (f) is the one that keeps resurfacing | `docs/06-backlog/CHECKLIST.md` |
| Next SDD change | None queued. **B-106's remainder**, **B-105(b)** and **B-110** are the three candidates; F6 blocked on B-11/B-12/B-16 | `docs/07-plan/WORK-PLAN.md` |
| Tests on `main` | `npm test` **1862/1856/0/6**; `test:static` **99/99** | — |

---

## §2 — What earlier sessions did (context, not to redo)

1. **Session 62** closed B-107 under ADR-0033 and B-106 at its source, twelve work-unit commits, both units
   `APPROVED` under Judgment Day (B-106's first submission was correctly `REJECT`ed: the release ran at
   startup because `server.connect()` resolves when the transport STARTS).
2. **Session 61** closed B-105(a) (the F7a SDD artifact set, archived) and measured the native reviewer's
   candidate-size ceiling (a 214 KB documentation candidate is refused `lens_context_budget_exceeded`; a
   58 KB normative half passes).
3. **Sessions 59–60** landed the wake satellite (ADR-0032, `runner/`, PT-34–PT-38, the runbook) and the
   operational finish (project-scoped registration at the time, the `$HOME` ghost git repository removed,
   Engram pruned 108 → 85 projects, FRISCO pinned to Engram `frisco`, one runner verified).
4. **A handoff coherence pass** ran after session 62 (three `docs:` commits, `ce976ad`/`1484b25`/`239eb18`)
   and fixed 12 stale or ambiguous items, including an **inverted** registration instruction and a source
   docstring that contradicted the code.

---

## §3 — What's next

1. **The `frisco` binding is armed and running — do not re-arm it.** Level `wake`, harness `pi`, since
   2026-10-01T01:49:43Z; it auto-starts at logon from the per-user Startup folder with a restart-loop
   wrapper (`C:\Users\LABORATORIO\conmuta-runner\README.md` documents what is installed and how to stop
   it). The wake path is **proven live** (one `wake` row, `outcome: exited`, watermark 24→25, and a later
   turn that posted a reply). To inspect: `~/.conmuta/runner/wake-ledger.jsonl` and that wrapper's
   `runner.log`. The real switch is `ladder disable`, not killing the process.
2. **The bus is registered ONCE, id-free, at the user level** (`~/.pi/agent/mcp.json`), per ADR-0033;
   `FRISCO\.pi\mcp.json` is retired. Verified: `pi mcp list` here shows
   `conmuta: connected, 4 tools` running `<repo>\dist\src\cli\main.js mcp` — **with no `--project`**, which
   is itself session 63's ADR-0034 shape visible in the live machine state. A session in a subfolder or a
   headless `pi -p` turn resolves the enclosing tree.
3. **Pick from three units** (the Director may name the order; the previous sessions' pattern is that the
   parent chooses when the Director delegates):
   - **B-106's remainder** — the substantive one. (a) is a wire-contract change: the status payload's
     closed key set in `src/shared/ipc-contract.ts`, its PTs and two canonical specs. (b) the dead-pid
     sweep is a different mechanism (`pid` on `client_cursors`).
   - **B-105(b)** — verify `claude`/`codex`/`opencode` argv forms live. **All four are installed**, so this
     is now a measurement, not a spike; expect the Windows `.cmd` question for `codex`/`opencode` and not
     for `claude` (`~/.local/bin/claude` is a real binary).
   - **B-110** — the cheap systemic win: a relative-link check in `test:static` over tracked Markdown (it
     would have caught all three live links session 63 found by hand) and a re-rooting step in the archive
     procedure, which then lets the 38 archived links be fixed by machine instead of by hand.
4. **Then F6** once B-11/B-12/B-16 are decided; **F7b** after F6.
5. **Do not restart B-108 or B-109** — both are closed with evidence (§1).

---

## §4 — Facts that will bite you

- **The installer CLI's ledger handle is closed now — do not "simplify" `withInstallerLedger` away.**
  `openInstallerLedgerOrFail` is called exactly once, inside `withInstallerLedger`, whose `finally` closes
  the connection. Reverting to bare `openInstallerLedgerOrFail` calls at the four sites brings back
  `%TEMP%` growth on Windows **and** the red test, because `test/cli/main.test.ts`'s `project sync-roster`
  cleanup no longer swallows `EPERM`.
- **`openInstallerLedgerOrFail` throws before the `try`.** `withInstallerLedger` calls it *outside* its own
  `try`/`finally`, which is correct: nothing was opened, so nothing must be closed. Do not move the open
  inside the `try` and then `db.close()` in the `finally` — that would need a null guard, and the guard is
  what the helper exists to avoid.
- **The written tool-config entry is id-free (ADR-0034).** `buildLauncherEntry()` takes no argument and
  returns `[CLI_ENTRY, "mcp"]`. `conmuta-channel` and `conmuta-runner` still REQUIRE `--project`
  (`requireProjectFlag: true`); the thin client does not; a human may still pass `--project` by hand as an
  assertion against the nearest ancestor `conmuta.json` (ADR-0033).
- **Two identifiers must not be mixed.** This repository's Engram project is **`connmuta`** (from its own
  remote); the FRISCO work has Engram **`frisco-erp`** (remote `consultores-orion/frisco-erp`) and bus
  **`frisco`** (the `FRISCO` parent folder). A session can only write memory into its **own** project.
- **The daemon keys `client_cursors` by the IPC session id** and seeds a new session at its catch-up window
  (`SESSION_CATCHUP_HOURS`, `src/ledger/cursors.ts`). Any satellite that only read the daemon's cursor
  would re-wake that whole window on every restart; `runner/watermark.ts` exists for exactly that reason and
  must not be "simplified" away.
- **The doorbell answers immediately (count 0) when the inbox holds rows that are not relevant to this
  binding.** A loop that neither sleeps nor advances its own watermark on that answer spins at full speed.
- **Argument refusal must match three shapes**: exact, `--flag=value`, and the attached short form.
- **On Windows a harness `.cmd` shim is refused (`unavailable`)**, never shell-wrapped: the shell fallback
  is the RCE path the design exists to prevent. A real shell-free launcher delivered **only to the runner
  process's PATH** is the working remedy (B-105(c), `docs/runbooks/wake-satellite.md`).
- **`autopilot` is bounded where a bound can be enforced and instructed where it cannot**; the harness's own
  configuration is the real boundary. **The wake ledger is self-reported** (ADR-0032 R6a).
- **The daemon's session pool is bounded at `MAX_ACTIVE_SESSIONS = 64`** (`src/shared/constants.ts`), in
  memory, per boot. The thin client gives its slot back on a real transport close (B-106, session 62);
  occupancy is still not visible in `status`/`doctor`, and restarting the daemon frees the pool.
- **The MCP SDK's `connect()` does NOT wait for close, and its stdio transport never reports stdin
  ending.** Verified in the installed package: `@modelcontextprotocol/sdk` 1.30.0's `Protocol.connect` ends
  at `await this._transport.start()`, and `onclose` fires only from `transport.close()`. So anything
  sequenced after `connect()` runs at STARTUP, a host closing the pipe produces no notification (map
  `stdin`'s `'end'`/`'close'` yourself), and `connect` CHAINS a pre-existing `transport.onclose` (chain the
  one already there — the SDK's wrapper does the protocol's own cleanup). `src/client/main.ts`'s
  `awaitTransportClose` is the worked example. **Read `node_modules`, never the comment that asserts a
  library's semantics.**
- **One registration, placed at the USER level, is the designed shape (ADR-0033).** A user-level entry
  (`~/.pi/agent/mcp.json`) is read from every cwd and, since ADR-0034, carries no project id. A
  **project-level** entry (`.pi/mcp.json`) is cwd-relative with no ancestor walk-up AND trust-gated
  (`~/.pi/agent/trust.json`), so a non-UI run resolves *not trusted* and silently loses the bus tools — and
  it REPLACES a same-named user-level entry wherever it applies.
- **Relative links inside `openspec/changes/archive/**` are broken by construction (B-110).** `openspec
  archive` moves the change one level deeper and every link keeps its old `../` count; composition copies
  those links into the canonical spec too. Verified count at session 63: 38 inside the archive, 3 live. A
  link check is not part of `test:static` yet, so nothing will tell you.
- **`README.md` was six phases stale until session 63** ("F0 closed; F1 `apply` in progress … 499 tests").
  It now states F1–F5 archived and points at this file. Do not let it drift again — it is the front door.
- **The review machinery's four traps** (all hit in session 62): (1) `inspect`'s intended-untracked round
  trip is resolved in ONE call by `inspect` with `untrackedScope: "select"` + `intendedUntracked`
  (`select-intended-untracked` returned `schema-incompatible`); (2) a committed-range review needs a FULL
  40/64-character commit id; (3) the provider's `managed_assets_outdated` stop requires running its `sync`
  continuation before STATUS advances; (4) **judges must be told NOT to run `npm test`/`build`/`node`** —
  this suite can start a real stdio MCP server inside the test process and hang forever, and concurrent
  `tsc -b` races on `dist/`. Give each judge a per-file sha256 manifest (a "target moved" report is then
  possible) and give round 2 the fix-delta hashes.
- **PT-22's repository scan reads TRACKED files only** (`test/security/repo-scan.test.ts` over
  `git ls-files`), so a token-shaped literal inside a brand-new file is invisible until that file is
  committed. Run the full suite **after** `git add`.
- **The RDD reviewer lens routing lives at `~/.pi/gentle-ai/models.json`**; without it the host relay
  refuses every lens-requiring candidate. Do not point a lens at `anthropic/…` on this machine.
- **`jd-judge-b` runs on `deepseek/deepseek-flash`** via a `model_profiles` entry in
  `~/.pi/agent/subagents.json`. If a judge role starts failing, check that file before suspecting the
  candidate.
- **MSYS/Windows shell**, PowerShell default, Bash available; `rm -rf`/`grep` work there. `npm test` output
  lines start with `ℹ`; `dist/` staleness fakes results — remove it first. `npm run test:static` prints
  benign Windows `reg.exe` stderr noise; read the summary.

---

## §5 — Next session, exact sequence

- [ ] **1. Verify the tree** (§0.2); the suite must be 1862/1856/0/6 and `test:static` 99/99.
- [ ] **2. Settle §0.3** (autonomy, Engram session, Arena).
- [ ] **3. Choose the unit** (§3.3): B-106's remainder, B-105(b) or B-110. If the Director delegated the
      choice, prefer **B-110 first** — it is small, systemic and unblocks a machine fix for 38 links — then
      **B-106's remainder**, the substantive one.
- [ ] **4. If a unit changes behavior**, follow the ODD flow this project enforces: explore, resolve
      uncertainty, classify, track in `odd/tasks/<feature>.md` **before the first write**, test-first with
      observed RED, work-unit commits with Conventional messages and **no AI attribution**, then the audit
      (§0.4) and §6's close-out.
- [ ] **5. If the live `frisco` binding needs attention**, read its ledger and
      `C:\Users\LABORATORIO\conmuta-runner\runner.log` together. Treat an `unavailable` outcome as the
      Windows `.cmd` question (§4), and remember one legitimate result: a `wake` turn that reads, finds
      nothing addressed to its agent and stays silent is **correct**.
- [ ] **6. Close the session**: overwrite this file, add the LOG entry at the top, update `AGENTS.md`'s
      Status pointer, the tribunal index if an audit ran, and the backlog rows touched.

---

## §6 — Do not redo

- F1–F5 archives, B-98, B-99, B-100(a)(b), B-101, B-103, B-104, B-105(a), B-107, B-108, B-109: closed; do
  not re-open or re-review.
- **ADR-0033's and ADR-0034's settled points**: do not re-add `--project` to the installer's written entry;
  do not re-sequence the B-106 session release after `server.connect()`; do not relax `--project`'s three
  malformed spellings; do not undo `requireProjectFlag` on `conmuta-channel`/`conmuta-runner`.
- **B-108's fix**: do not replace `withInstallerLedger` with bare `openInstallerLedgerOrFail` calls, and do
  not put the `catch {}` back around `test/cli/main.test.ts`'s temp-dir cleanup.
- **F7a's and B-107's audit corrections**: each exists because a judge found the defect real. Do not
  re-tighten `isRefusedArgument` to equality, do not drop the post-poll ladder re-read, do not commit the
  cursor for a turn that did not exit, do not remove `runner/watermark.ts`.
- **PT-34's allow-lists and the third `bin` wiring** in `package.json`/`tsconfig.json`/
  `test/security/pack.test.ts`/`test/cli/main.test.ts`.
- The acknowledged RDD lineages in §9 and the `declined_this_candidate` STARTs (no lineage was created in
  any of them; nothing to chase).
- **The 38 archived relative links (B-110) are deliberately unfixed.** Do not "fix them inline" inside an
  unrelated candidate; do it with a machine (the link check + the archive re-rooting step).

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-106 remainder** | (a) occupancy visibility in `status`/`doctor` — a wire-contract change over `src/shared/ipc-contract.ts`'s closed key set, its PTs and two canonical specs; (b) a dead-pid sweep of the bearer pool (`pid` lives on `client_cursors`, a different mechanism). Two leak windows stay disclosed: a hard-killed client, and a tool call that begins a handshake after the release returned | Kairo (F1 follow-up) |
| **B-105(b)** | the other three harnesses' argv forms unverified. **All four are installed** (§1), so this is a measurement now; expect the `.cmd`/shell-free-launcher question for `codex`/`opencode` | Kairo (F7a follow-up) |
| **B-110** | 38 broken relative links inside `openspec/changes/archive/**`, plus the missing link check. The three live ones are fixed | Kairo (docs hygiene) |
| **B-111** | `project bind` aborts *after* the registry commit and the `conmuta.json` write when a tool-config merge refuses, leaving a partially applied bind whose re-run can trip the bijective invariants. Found by Judgment Day round 1 of session 63; needs a decision (it touches the bind wizard's ordering guarantee and the `installer-wizard` spec) | Kairo (F2 follow-up) |
| **B-95 remainder / B-102 residuals** | B-95(d) stays design-exact; `src/daemon/serve/fetch.ts:244-246`'s unguarded parse needs its own decision; three non-blocking notes. B-102 (a)(b)(c)(f)(g); (f) keeps resurfacing | Kairo, "cheap at the next touch" |
| Engram housekeeping | 299 legacy cloud-sync mutation rows and 2 ownership rows the tool marks `repairable: false` (per-row human classification; local use unaffected), 1 deliberate drift case (`manual-save-frisco`), three backups to delete once nothing needs reverting | Director |
| The selectorless RDD chain's stale base and the terminally-stopped lineage `review-688b995abb754a4c` | Not observed firing in sessions 59–63. **Also undispositioned**: session 63's candidate left no lineage (the host declined it), so there is nothing to abandon | Director/maintainer |
| ADR-0032 | still `proposed` (pending the Director's confirmation and its three sub-questions, board row 21) — the wake satellite has been shipped, running and audited since session 59, so this is a bookkeeping gap, not a functional one | Director |
| B-11, B-12, B-16 | Gate F6 | Director |

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0, `gentle-ai` **3.7.0**, PowerShell primary with Bash (Git Bash) available.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`. `gh` commands run
  with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never run `gh auth
  switch`**. Force-push and deletion of `main` are blocked.
- **Session 63's commits and push status: read `git log` and `git status -sb`** (§0.2 row 1) rather than
  trusting a SHA written here; the handoff's own earlier version hardcoded one and went stale twice.
- **The four harnesses ARE installed**: `pi` and `pi.cmd` (`%APPDATA%\npm`), `claude`
  (`~/.local/bin/claude`), `codex`/`codex.cmd` and `opencode`/`opencode.cmd` (`%APPDATA%\npm`).
- **The bus is registered once, id-free, at the user level**: `pi mcp list` here shows
  `conmuta: connected, 4 tools` running `<repo>\dist\src\cli\main.js mcp`. `FRISCO\.pi\mcp.json` is
  retired. Both files were backed up before being changed
  (`mcp.json.bak-pre-project-scope-20260930-215503`, `mcp.json.bak-pre-b107-…`).
- **Arena**: no `arena` MCP server is registered for Pi, and `127.0.0.1:8765` refuses connections
  (session 63). `.mcp.json` still holds the (gitignored) bridge credential; never commit or quote it.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, read-only.
- **The local bus (conmuta) is live on this machine**: daemon home `~/.conmuta/`, two bots
  (`agente_kairo_bot`, `agent_luisgtz_bot`) and two bindings — `telegram-bus-agent` (this repository, group
  `-5419222443`, roster only `@kairo-agent`) and **`frisco`** (root `...\ORION OCG\FRISCO`, group
  `-5457758012`, roster `@luisgtz-agent`, `@rodrigo-agent`, `@jomata-agent`, `@luisrey-agent`,
  `@coordinador-frisco`). A session bound to one project **cannot** address another binding's agents.
- The SDD preflight for this project is Automatic / Both (hybrid) / Auto (`stacked-to-main`), asked again
  whenever a *new* SDD change starts.
- **CodeGraph**: present and usable, `codegraph explore` directly — do not re-init.
- **Engram's own tool surface is 19 tools** (`mem_*`), registered globally; `mem_context` on project
  `connmuta` is the entry point for a resumed session.

---

## §9 — RDD / audit state at session close

Newest first. Every entry is a closed record; the reasoning lives in the tribunal index under the id it
names.

1. **Session 63 — `bus-v2-b109-id-free-installer-entry-001`** (ADR-0034 + the B-108 fix + three live link
   repairs): RDD `inspect` on the uncommitted workspace candidate → START resolved to
   **`declined_this_candidate`** (host-resolved, `lineage_created: false`, `mutation_performed: false`,
   `risk_level: high`, 21 files / 379 changed lines, `risk_evidence: ["code that starts other processes in
   src/cli/main.ts"]`) — the third session in a row. **Judgment Day, two blind judges, round 1** over the
   frozen manifest `sha256:a348ba75…` (21 files, uncommitted): `jd-judge-a` returned **`APPROVE`** with ONE
   SUGGESTION; `jd-judge-b` returned **`REJECT`** with **2 CRITICAL, 5 WARNING, 3 SUGGESTION**, and nine of
   its ten findings were confirmed against the tree before acceptance. The two CRITICALs are the ones to
   remember: **documentation integrity** — ADR-0034 pointed at a Judgment Day record that did not exist yet,
   the identical class session 62's own CRITICAL belonged to — and **process integrity** — the manifest the
   judge was handed listed 21 files while the workspace held 26, because four documentation files were
   written *while it swept*, so the candidate it judged was neither complete nor stable (all 21 listed
   hashes still matched; the finding is accepted as an accurate description of a real defect in how the
   freeze was declared). Also real and corrected: the wizard-level guidance was un-pinned (deleting
   `printRegistrationGuidance(...)` left the suite green); ADR-0034's disclosed remedy for a stale entry was
   contradicted by the refuse-and-diff merge, which aborts a re-bind *after* the registry commit and leaves a
   partially applied bind (**filed as B-111**); `setup` was a fifth, unconverted ledger-open path that still
   pinned its home directory; the close was pinned at one of four call sites; the guidance reached
   `console.log` instead of the injected `CliIo`; and "an open `ledger.db` keeps its whole directory locked"
   was imprecise — the ledger is WAL and it is the connection's `-shm` mapping Windows cannot delete.
   **Non-vacuity measured by mutation, not asserted**: removing the close fails 4 tests, removing the setup
   close fails its test, removing the guidance call fails the new wizard test. **Round 2** (scoped
   re-judgment for `jd-judge-b` over its own frozen rows plus the fix delta; a fresh full blind review for
   `jd-judge-a`, because its round-1 `APPROVE` could not cover code written after it): `jd-judge-a` returned **`APPROVE`** with **zero findings** on a fresh full review of the re-frozen 28-path manifest — and it re-ran the three mutations itself (removing `opened.db.close()`, removing `outcome.db.close()`, removing the wizard's `printRegistrationGuidance(...)` call), confirming each fails the expected test. `jd-judge-b` returned **`APPROVE_WITH_CHANGES`**: **seven of its ten frozen rows `RESOLVED`**, no CRITICAL and no code defect remaining, but `JD-B-004` only **`PARTIAL`** — the corrected remedy still told the operator to re-run the bind, which the wizard refuses with `invariant-violated` R2 before the merge ever runs, so the ADR contradicted its own new B-111 row — plus one **fix-caused** WARNING (the handoff named a stale commit base for the next session) and one **NEW** WARNING (the ADR and the B-109 row claimed "a re-bind of an already-configured directory is a `noop`", which the same R2 refusal forbids). Three new SUGGESTIONs were accepted too: the CLI's `trustStepIo` wiring is unpinned (now stated in the ADR's pinning table as a **known gap** rather than implied); `runSetup` could reject *after* its own open and leave the handle to nobody (fixed, with a new pin in `test/installer/wizards/setup.test.ts`); and a pre-existing comment in `src/cli/main.ts` claimed `src/doctor/main.ts` did not exist when it has since PR-14 (corrected).
   **Independent verification**: the first `gentle-ai-verify` attempt failed with an agent error (no report produced), a second ran long and was cancelled, and a **targeted third completed over the committed state** (HEAD `79bb87a`): **PASS on all five claims** — a clean-`dist` build and `npm test` **1862 / 1856 / 0 / 6**; `test:static` **99 / 99**; **the `%TEMP%\conmuta-*` count unchanged across a full run (0 → 0)**, which is B-108 confirmed end to end rather than by inspection; a clean tree with ten session commits and no `--project` anywhere in `src/installer/`; and an independent relative-link sweep reporting **zero broken links across 75 live Markdown files** (the 38 inside `openspec/changes/archive/**` are B-110's known artifact, and the sweep found them on its own) **Terminal verdict:** **`APPROVED`** — terminal, with an explicit disclosure: the round-2 correction batch was applied after round 2 and was therefore **not** re-judged (the process allows two rounds), and it includes one 12-line `src/` change (`runSetup` now closes the ledger it opened when its own run fails after the open) pinned by a new test. Everything else in the batch is documentation. No third round was run, and that is stated rather than hidden.
   The full round-by-round record, including the re-freeze and the round-2 sentence appended after round 2
   completed, is the tribunal row for this debate.

2. **Session 62 — `bus-v2-b106-session-release-001`** (the B-106 session-slot release): Judgment Day over the
   frozen manifest (8 files, uncommitted), **2 rounds, terminal `APPROVED`**. `jd-judge-b` **`REJECT`ed** the
   first submission on a CRITICAL that was right, while `jd-judge-a` returned `APPROVE_WITH_CHANGES` without
   seeing it (it recorded the false premise that `connect` resolves on close as CONFIRMED OK). The parent
   re-read the pinned SDK before accepting either. Round 2 over the fix delta: A 3/3 and B 7/7 `verified`.
   Independent verification PASS on ten claims. Non-vacuity: removing the `DELETE` fails 2 tests;
   **restoring the rejected design fails 3**. Commits `241b455`, `869732a`, `8933984`, `b81bf21`.
3. **Session 62 — `bus-v2-b107-optional-project-001`** (ADR-0033 + the B-107 change): Judgment Day (Arena
   unreachable — DN-09's substitute satisfied directly), two blind judges over a frozen manifest (24 files),
   both `APPROVE_WITH_CHANGES`, **seven findings all real and all corrected** (one CRITICAL, documentation
   integrity: the ADR asserted an audit that had not happened; one behavioural WARNING: `--project ""` bound
   silently by walk-up). Round 2: A 4/4 and B 7/7 `verified`. Independent verification PASS on ten claims.
   **Terminal verdict `APPROVED`.** Commits `75f0b1a`, `224d763`, `40f7fd9`, `d67b692`, `f8395d4`, `8a64413`,
   `0312ca3`, `e764743`.
4. **RDD native review, session 62 — two candidates, two declines** (host-resolved, no lineage, no
   mutation). Same shape as sessions 59 and 63.
5. **Session 59 — `bus-v2-b104-wake-satellite-001`** (governance half): Judgment Day, 2 rounds, `APPROVED`;
   two CRITICAL findings fixed.
6. **Session 59 — `bus-v2-f7a-audit-001`** (implementation): Judgment Day, 2 rounds, `APPROVED`; round 1
   eleven defects, all fixed with tests, round 2 zero findings.
7. **Session 60 — RDD native review of that session's 40-line HANDOFF close-out**: `inspect` → START closed it
   at the start (`risk_tier: low`, `lenses_required: false`, 1 file / 40 changed lines) → `status` offered
   `approved_acknowledgement_required` → `acknowledge-approved` burned authority (lineage
   `review-73e0e357217ed1c5`). The candidate grew again after that burn, so what was delivered there is a
   fresh candidate whose closure is recorded in its own commit message.
