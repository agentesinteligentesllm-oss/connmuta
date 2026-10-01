# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what the
> next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live in the
> ADRs and the tribunal index, never here.
>
> **Last rewritten: end of session 59** (2026-10-01 local). Everything below describes the state after it.

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** Unchanged since session 55. |
| What is new? | **F7a is implemented**: the wake satellite `conmuta-runner` (`runner/`), ADR-0032 + CONSTITUTION §3.1, audited `APPROVED` (`bus-v2-f7a-audit-001`), committed and pushed. |
| What is next? | **The Director's real end-to-end run** (armed for the `frisco` binding), then the two owed items in **B-105**. F6 is still the only planned phase and still blocked on B-11/B-12/B-16. |
| What must be settled before any work? | §0.3: autonomy, memory, and **Arena** (unreachable at every session's start since 55; confirm with a real tool call). |
| What is the Director's to decide? | The real run and its level; B-105's order; B-11/B-12/B-16 for F6. |
| Where to read next | §0 first; then §3 and §7. §4 is the list of traps. |

---

## §0 — Quick start

### 0.1 Prompt to paste

```text
Lee docs/08-sessions/HANDOFF.md y confirma Arena. F7a (el despertador) ya está implementado, auditado y
en main. No hay trabajo en cola: pregúntame si vamos por la prueba real, por B-105 (artefactos SDD y
corrida end-to-end) o por las decisiones que bloquean F6 (B-11/B-12/B-16).
```

### 0.2 First commands (stop and report if any output disagrees)

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | `## main...origin/main` with no divergence; `main` is pushed as of `f00e8fb` |
| 2 | `rm -rf dist` | prints nothing |
| 3 | `ls openspec/changes/` | `archive` only |
| 4 | `git status --short` | only the two `*.bak-pre-conmuta-*` files (installer scratch, deliberately untracked) |
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
| **B-105** | **Open** — the owed items: (a) the `f7a-wake-satellite` SDD artifact set; (b) a real end-to-end run; (c) the Windows `.cmd` refusal; (d) `autopilot`'s profile is prompt + harness policy, not a mechanism; (e) the wake ledger is self-reported | `docs/06-backlog/CHECKLIST.md` |
| B-95 remainder, B-102 residuals | Open, low priority, "cheap win at the next touch" | §7 |
| Next SDD change | None queued; F6 blocked on B-11/B-12/B-16 | `docs/07-plan/WORK-PLAN.md` |
| Tests on `main` | `npm test` **1841/1835/0/6**; `test:static` **99/99** | — |

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

1. **The real end-to-end test**, which only the Director can start because arming is a human action:
   ```sh
   conmuta-runner ladder set --project frisco --level wake --harness pi --by "<quién lo pide>"
   conmuta-runner run --project frisco --once      # one tick, then look at the ledger
   conmuta-runner run --project frisco             # leave it running
   ```
   A `wake` arm is a turn that reads and replies; `autopilot` is the confined act profile. Check the ledger at
   `~/.conmuta/runner/wake-ledger.jsonl` and the runner's stderr.
2. **B-105(a)**: write the `openspec/changes/f7a-wake-satellite/` artifact set (proposal, spec, design, tasks)
   against the shipped code, so the phase has the SDD record every other phase has.
3. **B-105(b)**: a real daemon + real harness + real message run, and the four harness argv forms verified
   against the installed versions.
4. **Then F6** once B-11/B-12/B-16 are decided; **F7b** after F6.

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
- **Two untracked files are deliberate**: `.mcp.json.bak-pre-conmuta-20260930T040537Z` and
  `AGENTS.md.bak-pre-conmuta-20260930T040537Z` are the installer's own backups. Do not commit them; do not
  delete them without asking.
- **`conmuta.json` is now committed** (it is the D5 project file the installer wrote).
- **MSYS/Windows shell**, PowerShell default, Bash available; `rm -rf`/`grep` work there only. `npm test`
  output lines start with `ℹ`; `dist/` staleness fakes results — remove it first. `npm run test:static` prints
  benign Windows `reg.exe` stderr noise; read the summary.

---

## §5 — Next session, exact sequence

- [ ] **1. Verify the tree** (§0.2); the suite must be 1841/1835/0/6 and `test:static` 99/99.
- [ ] **2. Settle §0.3** (autonomy, Engram session, Arena).
- [ ] **3. Ask the Director what is next** (§3's two paths are the real end-to-end run and B-105; F6 stays
      blocked).
- [ ] **4. If the real run happens**, watch the ledger and the runner's stderr together, and treat the first
      `wake` row with outcome `unavailable` as the harness-argv question (§4) rather than as a code defect.
- [ ] **5. If B-105(a) happens**, write the SDD artifacts against the shipped code, not against the ADR's
      intentions — the ADR's "Implementation note" lists the six refinements that a spec must now own.
- [ ] **6. Close the session**: overwrite this file, add the LOG entry at the top, update `AGENTS.md`'s Status
      pointer, the tribunal index if an audit ran, and the backlog rows touched.

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
| **B-105** | (a) the F7a SDD artifact set; (b) a real end-to-end run plus harness-argv verification; (c) the Windows `.cmd` refusal (by design, documented); (d) `autopilot` is prompt + harness policy; (e) the self-reported ledger | Kairo (Director schedules) |
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
- **CodeGraph**: present and usable, `codegraph_explore` directly — do not re-init.

---

## §9 — RDD / audit state at session close

1. **`bus-v2-b104-wake-satellite-001`** (governance half): Judgment Day, 2 rounds, `APPROVED`; two CRITICAL
   findings fixed (the missing tribunal row; a wake-audit row that could not exist outside the core — now R6a's
   self-reported ledger).
2. **`bus-v2-f7a-audit-001`** (implementation): Judgment Day, 2 rounds, `APPROVED`; round 1 eleven defects, all
   fixed with tests, round 2 zero findings.
3. **RDD native review**: `inspect` ran, the intended-untracked selection was submitted, and START resolved to
   `declined_this_candidate` (`risk_level: high`, 43 files / 4553 lines, `lineage_created: false`,
   `mutation_performed: false`). No lineage exists and no authority was burned; nothing to acknowledge or
   chase. If the Director later wants the four lenses on this candidate, that is a fresh START.
