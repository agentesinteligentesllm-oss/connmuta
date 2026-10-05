# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands, what the
> next session does and what it must not redo. History lives in [`LOG.md`](./LOG.md); decisions live in the
> ADRs and the tribunal index, never here.
>
> **Last rewritten: session 73** (2026-10-05 local), **after the pre-merge audit of PR #106 found a CRITICAL and the
> branch grew two commits.** Every § carries session 73's state unless a line says otherwise; §2 keeps the earlier
> sessions as context.
>
> **This file is the entry point for the bus front, and nothing outside the repository is.** That front used to be
> started from `FRISCO/HANDOFF-2026-10-05-bus-sesion-dedicada.md`; since 2026-10-05 that file and
> `FRISCO/HANDOFF-2026-10-04-reparar-despertador-del-bus.md` carry a `⚠️ SUPERADO` banner instead, because the first
> was written the same day **its own §4 measurement was already committed** and reading it costs re-deriving a
> finished piece of work. From here on this file carries the state, [`LOG.md`](./LOG.md) the history,
> [`../05-tribunal/INDEX.md`](../05-tribunal/INDEX.md) the audits, [`../06-backlog/CHECKLIST.md`](../06-backlog/CHECKLIST.md)
> the work and [`../03-adr/INDEX.md`](../03-adr/INDEX.md) the decisions. **A session paragraph is narrative, never an
> instruction — §0 is the instruction.**
>
> **Session 73 in one paragraph — the audit the merge gate asked for, and what it caught.** The Director instructed
> this session to merge PR #106 *after reviewing it*. The native review path could not take the accumulated candidate
> (session 72 measured `lens_context_budget_exceeded`), so the branch was audited under `GOVERNANCE.md` §3's
> documented substitute: **two blind reviewers plus a separate verifying executor**. Both reviewers, independently and
> with the same mechanism, **refuted C3** — *no woken turn may send anything, directly or indirectly* — and it
> reproduced: `REFUSED_ARGUMENTS` never refused `--`, so a ladder record with `harness_args: ["--"]` produced argv
> `["-p","--","--no-extensions","--tools","read,grep,find,ls",PROMPT]`, and Pi's parser breaks at the first `--`
> (`dist/cli/args.js:23-32`), turning the entire send-proof profile into positional prompt text. The wake turn started
> with `read`, `bash`, `edit`, `write` and extensions loaded — the 2026-10-04 path, reachable through
> `ladder set --arg=--` and through a hand-edited ladder file, both of which this product documents as legitimate.
> **Fixed in `8e8d8b7`** (RED before the constant, GREEN after), together with a test on the same guarantee that
> could not have failed (`!argv.includes("bash")` passes for `read,grep,find,ls,bash`; proven blind by mutation —
> five tests fail once `bash` is added, while the old assertion alone reported `true`). **`21fcc40`** then corrected
> the three claims the audit found stronger than their controls. Round 2, on the narrow fix, found the same
> **WARNING** residual twice and independently — a record argument that consumes the next argv element and is placed
> last swallows `--no-extensions`; both bounded it identically (`--tools` still holds, so no `bash`, no `conmuta_*`,
> no send path) and both named the same limit of a deny-list as an instrument. Filed as **B-117–B-123**; the 400-line
> `size:exception` and **DN-05 formally unsatisfied** are disclosed in the PR. **The merge was taken on 2026-10-05:
> `MERGED` at 19:13:15Z as merge commit `925c10d`**, with CI green on both Node legs. The follow-up pass of the audit
> then found one of round 1's findings **wrong** — the ring *does* throw on a stale context — so `channel-pi/host.ts`,
> its test and **B-119** were corrected again, and that correction is recorded rather than hidden. The ring's
> end-to-end firing is still owed (B-114 / T6).
>
>

---

## At a glance

| Question | Answer |
|---|---|
| Where do F1–F5 stand? | **All archived.** Unchanged since session 55. |
| What is new? | **The live session can be woken: F7c shipped.** `channel-pi/` — a host-side Pi extension that holds the existing body-less doorbell and injects one **attributable, body-less ring** into the live session, which then fetches and answers. `ADR-0036` `accepted`, row **B-116**, phase **F7c**. It is **armed machine-wide** (`~/.pi/agent/settings.json` `extensions`). The `solo-sesion-viva` mode stands: `wake` on `pi` runs under a send-proof profile, `autopilot` and the other three harnesses are refused, `audit_log.client_id` names the sender. The `frisco` despertador is **off** and must stay off. |
| What is next? | **The ring's end-to-end firing with a real roster peer — owed (B-114 / F7c T6).** It needs a peer whose owner is available; AGENTBUS has no private loopback, so a test message fans out to every agent in the group. Everything else on the bus front is done: **B-112** (send-proof profiles for `claude`/`codex`/`opencode`) and **B-113** (the daemon cannot accredit a human) are filed and bounded. |
| What must be settled before any work? | §0.3: autonomy, memory, and **Arena** (unreachable at every session's start since 55; confirm with a real probe). Subagent health: session 72's **two delegates that failed with zero tool calls** (`gentle-ai-explore`, `gentle-ai-worker`) were not a harness failure — they had no `model_profiles` entry, and session 73 fixed that (see the note below the table). Re-verify with one tiny probe before relying on a delegate, but do not assume the work must be done inline. |
| What is the Director's to decide? | Whether the published branch gets merged (the repository's own rule is an audit before merge, and the Director declined all reviews in session 72); the Engram housekeeping classification; **B-11/B-12/B-16** for F6; the B-101 relocation; and **which backlog class to schedule next** (§3.3). |
| Where to read next | §0 first; then §1, §3, and §4. |

---

## §0 — Quick start

### 0.1 Prompt to paste

```text
Lee docs/08-sessions/HANDOFF.md (§0, §1, §3). El frente del bus está al día: **PR #106 y PR #107 están mergeados**
(`925c10d` y `35ac1a6`), y la auditoría previa de #106 encontró un CRITICAL que se cerró antes del merge (`8e8d8b7`).
Lo único que sigue debiendo es **T6** —el timbre con un par real del roster (B-114)—, más **dos decisiones de diseño
tuyas**: B-117 (¿lista negra, o parseo verificado del argv?) y B-119 (¿verificar la entrega del timbre, o aceptar
best-effort?). Sigue por §3 y no reabras nada de §6.
```

### 0.1b If the machine was just powered on

Nothing needs re-arming: the daemon home `~/.conmuta/`, the id-free user-level bus registration and the
**machine-wide armed F7c adapter** all live on disk (ADR-0033, and `~/.pi/agent/settings.json` for the adapter), so a
cold start needs only §0.2's `git fetch`, rebuild and full test run.

**Do not trust any SHA, count or push status written in this file.** This file is prose and the state moves; the line
that used to sit here asserted the tree was `12 commits ahead` of `origin/main` and **not pushed**, and by session 73
both halves were false. Read `git log --oneline -12` and `git status -sb` instead — which is what §0.2 row 1 already
says, and this is the paragraph that kept contradicting it.

### 0.2 First commands (stop and report if any output disagrees)

| # | Command | Expected |
|---|---|---|
| 1 | `git fetch origin && git status -sb` | `## main...origin/main` with no divergence, and a clean tree. Read `git log --oneline -12` rather than trusting a SHA written here. **Do not treat the commit base as a fixed number** — take it from `git log` |
| 2 | `rm -rf dist` | prints nothing |
| 3 | `ls openspec/changes/` | `archive` only |
| 4 | `git status --short` | **empty** |
| 5 | `gentle-ai review mode status` | `receipt-driven development: on (decided by global)`; read it, do not assume it |
| 6 | `gentle-ai --version` | `4.0.0` or later — check fresh each session |
| 7 | `npm run build && npm test` | exit 0; **1948 tests, 1942 pass, 0 fail, 6 skip**; `test:static` **120/120** (session 73's counts; the clean-build step in row 2 is what makes them mean anything — see the note below the table) |
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
> `jd-judge-a`, `jd-judge-b` and `gentle-ai-verify` all ran. The four `review-*` lens profiles were left alone on
> purpose: they belong to the native review pipeline, and changing their model is a behaviour change nobody asked
> for.

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
| **B-107** | **RESOLVED — session 62** under [ADR-0033](../03-adr/0033-project-flag-as-assertion.md) | `docs/03-adr/0033-project-flag-as-assertion.md` |
| **B-108** | **CLOSED — session 63** (`withInstallerLedger`) | `src/cli/main.ts` |
| **B-109** | **CLOSED — session 63** under [ADR-0034](../03-adr/0034-id-free-installer-entry.md) | `docs/03-adr/0034-id-free-installer-entry.md` |
| **B-110** | **CLOSED — session 64** (relative Markdown link gate in `test:static`) | `test/security/markdown-links.test.ts` |
| **B-111** | **CLOSED COMPLETELY — session 67** under [ADR-0035](../03-adr/0035-pre-validate-tool-configs-in-project-bind.md) | `docs/03-adr/0035-pre-validate-tool-configs-in-project-bind.md` |
| **B-102** | **CLOSED & AUDITED — sessions 68–69** (residuals a, b, c, f, g; d and e were closed in sessions 56/57). Three checks over three windows: a reconcile that begins after `stopAll()` returns unchanged; an in-flight reconcile re-checks the latch at the top of each remaining binding and again after `buildTransport` resolves, so the poller factory is never reached; and the factory receives an abort signal `stopAll()` aborts, so a poller created after the latch flipped touches no ledger. Plus: the update-existing-binding branch pinned, the latch's terminal contract stated, `stop()` recording the tick it gave up on, and two fixed-sleep stability proofs replaced. The first attempt at (f) was rejected by `jd-judge-b` in session 68 and corrected in `5bf647a`; `jd-judge-a` completed in session 69 with zero findings, closing Judgment Day audit `bus-v2-b102-residuals-001` with terminal verdict **`APPROVED`** | `odd/tasks/b-102-residuals.md`; `docs/06-backlog/CHECKLIST.md`; `docs/05-tribunal/INDEX.md` |
| **B-95 remainder** | **CLOSED COMPLETELY — session 70** under ODD (`odd/tasks/b-95-remainder-fetch-corrupt-row.md`). Safe corrupt-row policy in `src/daemon/serve/fetch.ts:244-246` (skips corrupt/unparseable rows without failing, cursor advances past them); review notes R3-1 (doorbell.ts to check) and R2-1 (comment drift) resolved. | `src/daemon/serve/fetch.ts`; `docs/06-backlog/CHECKLIST.md` |
| **B-97** | **CLOSED COMPLETELY — session 70.** The guard was already `import.meta.main` (session 55, `24d7dc6`); what session 70 closed is the row's own premise plus the missing ADR-12 pin. The defect class is any link the entry path crosses, not only a POSIX symlink: a Windows directory **junction** reproduces it with neither Developer Mode nor admin. Measured against the built bundle here — old guard: direct `exit 2` but junction `exit 0` with **zero bytes** on both streams (the silent no-op); `import.meta.main`: `exit 2` both ways. New test `test/cli/main.test.ts`'s "the entry guard fires when the built CLI is reached through a directory link (B-97)" creates the junction and spawns through it; non-vacuity is a restored old guard failing that test while the pre-existing direct test still passes. No `src/` change; no separate POSIX CI job (the row offered it as an alternative, and `windows-latest` now exercises the guarantee). | `test/cli/main.test.ts`; `docs/06-backlog/CHECKLIST.md` |
| **B-31** | **CLOSED — session 70.** R5's scan runs pre-parse (design §4), so a token written as a JSON escape (`1234567\u003aAAHk…`) held no literal shape in the file and was accepted, then sat in `registry.json` and the daemon's memory reported by nothing. `src/registry/loader.ts` gained a post-parse walk over values **and** key names, reusing `assertNoTokenShape` and — load-bearingly — the existing `withoutRosterHashes` mask, with `MAX_CONTENT_WALK_DEPTH = 32`. 5 tests in `test/registry/loader.test.ts` (escaped value, escaped key, nested, the hash exemption surviving and not shadowing, the depth bound); RED before GREEN, non-vacuity by mutation. | `src/registry/loader.ts`; `odd/tasks/b-31-registry-escaped-token.md` |
| **`solo-sesion-viva`** | **Session 71 — the bus answers only from a live session.** `SEND_PROOF_PROFILES` (`wake` on `pi` = `--no-extensions --tools read,grep,find,ls`, appended last, after the record's own args); `refused (profile_unavailable)` for `autopilot` and the three unverified harnesses; tool-exposure flags refused; `audit_log.client_id` carries the sender on every send row (was hardcoded `null`). Runbook, ADR-0032 amendment and README row 5 updated. Live probe: the profile declares exactly `read,grep,find,ls` — no `bash`, zero `mcp__conmuta`. **B-112**, **B-113** filed. Branch `fix/solo-sesion-viva`, **not pushed**. | `odd/tasks/solo-sesion-viva.md`; `docs/runbooks/wake-satellite.md`; `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md` |
| **B-99** | **CLOSED COMPLETELY — sessions 55 & 69** (commit `dd464a7` converted the three original tests to `waitForCondition`; session 69 closed the remaining fixed sleeps in `heartbeat.test.ts` and converted `bootstrap.test.ts:517` to positively observe live ticks with stable audit rows, plus converting boot/add waits to condition waits) | `odd/tasks/b-99-timer-tests.md`; `docs/06-backlog/CHECKLIST.md` |
| **F7c / B-116** | **DELIVERED (T1–T5) — session 72; T6 owed.** `channel-pi/` (ADR-0036): a host-side Pi extension that holds F4's body-less doorbell and injects one attributable, body-less ring (`pi.sendMessage` with `customType` `conmuta-doorbell`, `triggerTurn: true`, `deliverAs: "followUp"`), which starts a turn in the live session so it can fetch and answer. Measured reason it is an extension and not a port: Pi renders **no** MCP notification. Pinned by 6 ring tests, 6 lifecycle tests, a bundle-closure gate (the ring is the only `.sendMessage(` call site; no `src/daemon/`, no Telegram path), an extended twin gate and a packed-entry assertion. Verified live against the running daemon (`client_cursors.host = pi-host-doorbell`) and **armed machine-wide** by the Director's instruction. **The ring's end-to-end firing with a roster peer is owed (B-114 / T6)**. **Audited and merged in session 73** (`8e8d8b7` fixes the CRITICAL the audit's two blind reviewers found independently; `21fcc40` corrects three claims that were stronger than their controls; merge commit `925c10d`). The residual the audit then found in the fix is filed as **B-117** | [ADR-0036](../03-adr/0036-pi-host-doorbell-adapter.md); `odd/tasks/f7c-pi-host-doorbell.md`; `docs/runbooks/host-doorbell-pi.md` |
| **B-115** | **CLOSED — session 72.** The audit that recorded the truth (*no ladder level reaches a live host session*) and the classification that closed it (new row **B-116** under new phase **F7c**, on the Director's explicit answers). The gap it named is now addressed by shipped code; what remains is the live firing, tracked under B-114 | `odd/tasks/b-115-wake-does-not-reach-a-live-session.md`; `docs/06-backlog/CHECKLIST.md` |
| Next SDD change | None queued. F6 blocked on B-11/B-12/B-16; F7b follows F6; F7c is delivered outside SDD | `docs/07-plan/WORK-PLAN.md` |
| Tests on the merged branch | `npm test` **1948/1942/0/6**; `test:static` **120/120**; `%TEMP%` 0 → 0 from a clean build (session 73, after `8e8d8b7`) | — |

---

## §2 — What earlier sessions did (context, not to redo)
> **Sessions 72 and 71, in full.** Kept here rather than at the top of the file, because the top belongs to the
> current session and **a narrative paragraph is not an instruction** — which is how a stale number written at the
> top gets read as present state. Newest first.
>
> **Session 72 in one paragraph — the live session can finally be woken (F7c).** The Director's report was that a
> directed message or a broadcast never reached the session he was sitting in. Session 72 **measured** the two
> candidate surfaces instead of assuming them: Pi's MCP runtime renders **no** notification (`notifications/message`
> reaches `~/.pi/agent/mcp.log` and appears **zero** times in a session transcript), so F4's `claude/channel` shape
> has **no Pi equivalent** — and Pi's **extension** surface does carry a message into the live session and
> **starts a turn**, proved with two live probes against an external trigger while the session was mid-turn. On that
> measurement, and on the Director's ratification, **ADR-0036** (`accepted`) opened a new backlog row **B-116** under
> a new phase **F7c**: `channel-pi/`, a host-side extension that holds F4's **existing body-less doorbell** and injects
> one **attributable, body-less ring** (`pi.sendMessage` with `customType` `conmuta-doorbell`, `triggerTurn: true`,
> `deliverAs: "followUp"`). It is a doorbell, not a second reader: no peer prose, no acknowledgement, **no send path
> of its own** — pinned statically, the ring is the only `.sendMessage(` call site in its whole closure. Suite
> **1947/1941/0/6**, `test:static` **120/120**, `%TEMP%` 0 → 0 from a clean build; the transport half was verified
> **live** against the running daemon (a `client_cursors` row with `host: pi-host-doorbell`), and the adapter is
> **armed machine-wide** by the Director's instruction. **The ring's end-to-end firing with a real roster peer is
> still owed (B-114 / T6)** — never declared. Two native-review measurements were taken: the **accumulated branch
> candidate is un-reviewable** (`lens_context_budget_exceeded`, no authority created), and a narrow committed
> candidate closed `approved` with **zero lenses** (`non_executable_only`) — a classification, not a review. Branch
> `fix/solo-sesion-viva` **pushed** at the Director's explicit authorization, with a PR open.
>
> **Session 71 in one paragraph — the bus now answers only from a live session (`solo-sesion-viva`).** The Director's
> order: with a live session open that session answers, with none open nobody answers and the thread stays pending,
> and **no woken (headless) turn may send anything, directly or indirectly**. Step 0 stopped the bleed (ladder `off`,
> the Startup entry archived, both runner processes killed — killing only the `cmd` leaves the `node` orphaned).
> Step 1 chose **capability over permission**: `SEND_PROOF_PROFILES` (`runner/constants.ts`) runs `wake` on `pi` as
> `pi -p --no-extensions --tools read,grep,find,ls`, appended after the record's own `harness_args`; a level/harness
> pair with no verified profile is **refused** (`profile_unavailable`) instead of started with a full toolset — so
> `autopilot` and `wake` on `claude`/`codex`/`opencode` never start (**B-112**) — and the flags that could widen the
> profile are refused. The daemon's half is **attribution, not accreditation**: `audit_log.client_id` now carries the
> sender on every send row (it was hardcoded `null`, which is why the four 2026-10-04 replies could not be traced at
> all); the accreditation gap is recorded as **B-113** so nobody re-derives it. Step 2 found the real cause of the
> missing `conmuta_*` tools: an **unregistered `pi-mcp-adapter`** had written `"extensions": ["-builtin:mcp"]` into
> `~/.pi/agent/settings.json`, disabling Pi's built-in MCP for every session while `pi mcp list` still connected.
> Suite **1912/1906/0/6**, `test:static` **101/101**, `%TEMP%\conmuta-*` 0 → 0; independent verifier C1–C8
> **PASS**. Commits on branch `fix/solo-sesion-viva`, **not pushed** — the push came in session 72, on the
> Director's explicit authorization, together with `30b134d`, `4fea14d` and `57bd944`.

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
   ring that was never delivered should be retried or accepted as best-effort). The session-73 record itself rides
   in **PR #107**, which is the next merge decision.
1. **The ring owes its first real firing, and that is the only unit the bus front has left (F7c T6 / B-114).** With
   the adapter armed, a roster **agent** sending a directed message or a broadcast should make the open session ring
   and answer. It needs a peer whose owner is available: AGENTBUS has no private loopback, a human `user_id` is not
   on the roster (ingest drops it as `unknown_sender`), and a test message fans out to every agent in the group.
   Acceptance is the raw evidence: the transcript showing the `conmuta-doorbell` entry and the automatic turn, plus
   the `audit_log` `send` row carrying a **non-null `client_id`**. Until a peer is available it stays **owed**, never
   declared. Note the tree matters: this repository's own roster is `@kairo-agent` alone, so nothing can ring here —
   a tree with peers is where it must be shown.
2. **The `frisco` despertador is OFF, and it must stay off.** Session 71 disabled it, removed the Startup entry and killed both processes, on the Director's order that the bus answer only from a live session. Re-arming is a Director decision and a deliberate act: `wake` no longer replies (it has no bus and no shell) and `autopilot` is refused, so `notify` is the only level that does anything useful. See the runbook's "A woken turn cannot send".
3. **The bus is registered ONCE, id-free, at the user level** (`~/.pi/agent/mcp.json`), per ADR-0033.
4. **No open row the harness can close alone.** What remains is either the Director's or a scheduled class:

   **3.1 — Director-only decisions.** **B-11** (trademark), **B-12** (macOS smoke test), **B-16** (open-source files) gate F6; **F7b** follows F6. **B-101** (relocation of the Judgment Day operating detail out of this overwritten file) is editorial and `GOVERNANCE.md` is constitution-adjacent, so it is not a drive-by move. **B-04** (desktop shell) and **B-01/B-02/B-03** (group referee, skill templates, ticket-ledger location) are product decisions.

   **3.2 — Spike/research rows, each needing a real investigation.** **B-05** (gentle-ai installer study), **B-07** (bot-to-bot group visibility for non-admin bots), **B-08** (IPC handshake + named-pipe DACL on Windows), **B-09** (MCP notification rendering per host).

   **3.3 — The long tail: 78 open rows, almost all deliberate non-blocking deferrals from past reviews.** They are the residue of the F1/F2 SDD cycles and were each filed as "non-blocking, disclosed rather than fixed". Do **not** walk them one at a time; they fall into a handful of root classes, and the honest move is to schedule a class or leave it. The ones with real teeth, so a future session does not have to re-triage 78 rows to find them:
   - **Silent-false-health.** `B-85` — a partial or empty DM-probe result reports `status: "pass"` in `doctor`. A doctor that lies about health is worse than no doctor. **`B-82`** — two genuinely vacuous test assertions ("a test that can never fail proves less than no test at all").
   - **Data-integrity blind spots.** `B-54` — `daemon/bootstrap.ts` never checks `LedgerOpenResult.status` for `"quarantined"`, so a daemon whose ledger was quarantined silently boots against a fresh empty database (the same blind spot PR-37 fixed in `migration/main.ts`; note the product choice inside it: warn loudly, or refuse to boot and take the bus down). `B-28` — no R1–R6 row demands referential integrity, so a dangling `bot_id`/`group_id`/`project_id` in `registry.json` loads. `B-29` — nothing ties `roster_hash` to the snapshot it is derived from.
   - **The B-27 / B-30 / B-31 registry cluster.** B-31 is now closed; **B-27** (the shared token regex's unbounded `\d+` matching `sha256:<64 hex>`) and **B-30** (R5's strictness refusing human-authored text such as a group `title` of `Authorization review`) remain, each with a recorded product/stored-format decision inside it. B-27 also reaches `checkForSecrets` (an outbound body quoting a roster hash would be refused) and `redactTokenShapes` (a roster hash in a log would be redacted).
   - **Flakes.** `B-39` and `B-57` (wall-clock-sensitive daemon-lifecycle tests make a red CI leg not by itself evidence of a broken commit) and `B-91` (`test:wrong-room`). B-99 and B-96 already closed this class's worst members.
   - **Coverage that is skipped rather than failing.** `B-68`, `B-74(3)`, `B-75(3)` — fake-exec tests skipped on non-Windows hosts although they spawn nothing; `B-24` — no POSIX CI leg at all, so packaging and shebang/file-mode contracts cannot fail here (B-97's own premise lived in this gap).

5. **Then F6** once B-11/B-12/B-16 are decided; **F7b** after F6.
6. **Do not restart B-105, B-106, B-108, B-109, B-110, B-111, B-102, B-99, B-95, B-97 or B-31** — all are closed with evidence (§1).

---

## §4 — Facts that will bite you

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
| **B-112 / B-113** | Filed in session 71. **B-112**: the send-proof profile is verified for `pi` only, so `autopilot` and `claude`/`codex`/`opencode` are refused; closing it means verifying each harness's own restriction flag on the installed binary the way session 66 verified the argv forms. **B-113**: the daemon cannot accredit "a human is present" (every same-user process reads the same run file and speaks the same IPC; `host` is the same literal `unknown` for both), and the only shape that could — a TTY-gated per-session human grant — is more surface than the order asked for. Do not re-derive either. | Director (B-112 is a bounded harness-verification job) |
| **B-117 / B-119** | Two design decisions the PR #106 audit refused to take inline. **B-117**: the send-proof profile is guarded by a deny-list, and a record argument that consumes the next argv element and is placed last can swallow `--no-extensions` (bounded — `--tools` still holds, so no `bash`, no `conmuta_*` and no send path). The structural alternative, parsing the resolved argv and refusing on mismatch, costs either coupling the runner to each host's parser or forbidding bare value-consuming flags in a record. **B-119**: Pi's extension-facing `sendMessage` cannot throw, so a ring that was never delivered commits the cursor and is never retried; either make delivery verifiable and refuse to advance the cursor, or accept best-effort in ADR-0036 with the loss recorded. Both need their ADR before code | Director |
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
- **Engram's own tool surface is 19 tools** (`mem_*`), registered globally; `mem_context` on project
  `connmuta` is the entry point for a resumed session.
