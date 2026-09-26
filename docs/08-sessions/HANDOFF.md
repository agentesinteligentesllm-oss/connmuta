# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.
>
> **Reading order for a zero-context session:** §0 → §1 → §2 → §5. Then §3 (pins), §4 (traps),
> §6 (do not redo) and §7 (open points) as the task needs, and §8 for the environment.

---

## §0 — Quick start

**F1 (`f1-daemon-registry-thin-client`) is done.** Session 40 closed the last four slices — PR-40a
(daemon composition-root wiring, the session's own major discovery), PR-40b (bundle assertion tables),
PR-41 (two-binding wrong-room CI) and PR-42 (final documentation close-out) — all merged (`#44`–`#47`),
all audited through the DN-09 Arena/Alpha route with genuine `CONSENSUS`. **This is a phase boundary
(DN-04): the next session's first job is not implementation, it is a decision with the Director.**

**The decision:** F1's `tasks.md` reads 218/219 — the one deliberately-unchecked item is a re-run of
`sdd-init` flipping `openspec/config.yaml`'s `strict_tdd` to `true`, left open on purpose for a fresh
session to action rather than a drive-by flip at the tail of session 40. Before touching that flip, ask
the Director: **(a) archive `f1-daemon-registry-thin-client`** (`gentle-ai sdd-verify` then
`gentle-ai sdd-archive`, per the SDD lifecycle this project's own tooling defines) **and/or (b) begin
F2's own SDD cycle.** Read [`docs/07-plan/WORK-PLAN.md`](../07-plan/WORK-PLAN.md) for what F2 actually
is before assuming anything — do not guess from the phase letter alone. This is the Director's call, not
a default path to run through on autopilot.

**Copy-paste prompt to start the next session:**

```text
F1 (f1-daemon-registry-thin-client) esta completo (218/219, el pendiente es deliberado). Lee primero
docs/08-sessions/HANDOFF.md paso a paso. Es un punto de frontera de fase (DN-04): antes de implementar
nada, pregunta al Director si (a) archivar el cambio SDD f1-daemon-registry-thin-client, (b) arrancar el
ciclo SDD de F2 (lee WORK-PLAN.md para saber que es F2 antes de asumir nada), o ambos, y en que orden.
Verifica Arena Orion con un bridge_send real — DN-09 corrio de punta a punta las cinco auditorias de la
sesion 40 (todas CONSENSUS/APPROVE); si Alpha no responde de verdad, cae a ODD + Judgment Day.
Tienes autorizacion total del Director para decidir y ejecutar sin pedir confirmacion en el resto de esta
sesion, salvo la pregunta de arriba, que es genuinamente del Director.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean**. The status command should print `completed: 218`, `pending: 1`,
`nextRecommended: apply` (the tool has no "done, needs a human archive decision" state of its own — a
`pending: 1` with everything else green is what "done except the deliberate flip" looks like from this
tool). Verify with `grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md`
(must print 218) and `grep -c '^\s*- \[ \]'` (must print 1).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 is 100% complete on every actual deliverable.** All 13 units closed, all 44 GitHub PRs merged (`#1`–`#47`). The one remaining checkbox (`sdd-init` re-run flipping `strict_tdd`) is deliberately deferred to this session as a genuine phase-boundary action, not an oversight. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | `tasks.md`: **218 of 219 checkboxes done.** 47 `####`-level PR header blocks (PR-01…PR-42, with PR-06/08/09 re-sliced a/b at apply time and PR-40 re-sliced a/b at apply time for a *different* reason — a genuine missing-wiring discovery, not a budget overage; see §6). | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `completed: 218`, `pending: 1`, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | Everything through PR-38, plus session 39's `test/security/{predicates,closure}.ts`+twins, plus session 40's: `src/daemon/bootstrap.ts` (real composition root — the daemon now actually serves IPC, polls, reconciles bindings), `src/daemon/bindings.ts` (async `createTelegramClient`), `test/security/{client-bundle,daemon-bundle,wrong-room}.test.ts`, `test/daemon/{bootstrap,bindings}.test.ts` extended, `test/security/closure.ts` (dynamic-`import()` traversal), plus doc corrections in `DATA-MODEL.md`/`THREAT-MODEL.md`/`CHECKLIST.md`. | PRs `#1`–`#47` |
| Real daemon closure | **61 files** reachable from `daemon/main.js` (was 4 before session 40 — see §6, this is the session's central finding). Client closure: 18 files. | `test/security/daemon-bundle.test.ts`, `test/security/client-bundle.test.ts` |
| Test counts | `npm test` **1084** (1083 pass, 1 pre-existing skip, 0 fail). `npm run test:static` **43/43**. `npm run test:wrong-room` **3/3**. | session 40 |
| Audit status | **DN-05 is satisfied for PR-39 through PR-42** — five real Arena/Alpha debates this session alone (`bus-v2-f1-pr-40-audit-001`, `bus-v2-f1-pr-40a-diff-audit-001`, `bus-v2-f1-pr-40b-diff-audit-001`, `bus-v2-f1-pr-41-diff-audit-001`, `bus-v2-f1-pr-42-diff-audit-001`), every one reaching `CONSENSUS`/`APPROVE`. **DN-09 is now proven across a FULL session**, not just a first successful try — no Judgment Day fallback was needed once. DN-05 remains unsatisfied for PR-06 through PR-38 (unchanged, pre-DN-09). | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — This is a decision point, not a routing table

Every previous handoff in this file had a §2 titled "Settled for the next slice" with a concrete next PR
to implement. **There is no next PR inside F1.** What was §2's content in every prior session — the
Arena-first routing rule, the Judgment Day fallback, the per-slice pipeline, the budget policy, the
frozen-worktree junction rule, remote-delivery authorization, the never-poll rule, the sequential-
verification rule — is **unchanged and still governs whatever comes next**, whether that is F1's own
archive or F2's first slice. Read §6 and §7 below for what carries forward unconditionally.

**What actually needs deciding, with the Director, before any implementation:**

1. **Archive `f1-daemon-registry-thin-client`?** The SDD lifecycle this project's tooling defines has an
   archive step (`gentle-ai sdd-archive`) that merges delta specs into the main specs and moves the change
   folder. Nothing in this project's history has exercised that step yet — F1 has been "in apply" for the
   entire project's life so far. Read what `sdd-archive` actually does (its own tool help, or
   `~/.claude/skills/_shared/sdd-orchestrator-workflow.md`) before running it; verification
   (`sdd-verify`) is optional and never gates archive per that skill's own text, but running it once for a
   change this size is probably worth the Director's time regardless.
2. **What is F2, concretely?** [`docs/07-plan/WORK-PLAN.md`](../07-plan/WORK-PLAN.md) names the phases; do
   not start planning it from the phase letter or from scattered mentions of "F2's doctor" / "F2's wizard"
   elsewhere in the docs tree — read the actual plan document's F2 section in full first.
3. **The `sdd-init` re-run** (flips `strict_tdd` to `true` against the real `npm test`) is the one
   remaining F1 checkbox. It is small and low-risk; do it once the Director has weighed in on point 1,
   since archiving might itself touch `openspec/config.yaml` or make the flip moot.

Do not default to "start F2" or "archive F1" on your own reasoning — the Director explicitly gets one
question here per this project's own precedent (`AGENTS.md` §1, `CLAUDE.md` §1's "ask only when two
readings produce materially different work" — this is exactly that fork).

---

## §3 — Pinned provenance values (re-verify with your own method; never trust a header blindly)

No new SEAM/AS-IS pins landed in session 40 — every session-40 file is either NEW test-only code (no v1
equivalent) or a documentation correction. The provenance rules, the fixture
(`test/fixtures/v1-provenance.json`, 28 entries), and the mechanical AS-IS/SEAM distinction from prior
sessions are unchanged. See any pre-session-40 HANDOFF (in `LOG.md`'s history) if you need the full
pinning recipe again — it will not be needed unless F2 vendors more v1 code.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **A daemon's own production entry point can silently diverge from its own composition root across many PRs, with every individual PR's tests passing the whole time** | `src/daemon/bootstrap.ts` was last edited in PR-16. Fifteen PRs later (PR-18 through PR-31) built and independently audited `admission.ts`, `poller.ts`, `daemon/ipc/*`, `daemon/transport/*`, `daemon/send/*`, `daemon/serve/*` — none of them touched `bootstrap.ts` to wire themselves in, because none of their own Scope lines named it. Each PR's own tests passed because each module was tested in isolation. The gap was invisible to `npm test` and to `npm run test:static` (design.md §14's own daemon-bundle assertions didn't exist yet) for 15 PRs, and was only found by actually computing the real static import closure before writing PR-40's tests, per this project's own standing rule to verify computationally rather than assume from reading source. **If a future phase adds a new subsystem that needs to be reached from a composition root, add "wire it into the composition root" as an explicit task in the SAME PR, not an assumed follow-up.** | session 40, `src/daemon/bootstrap.ts`, `bus-v2-f1-pr-40-audit-001` |
| **`setInterval` (Node) does not serialize an async callback across ticks** | An `onTick` handler slower than its own `periodMs` can have a second invocation start while the first is still in flight. If that handler does anything with a synchronous check-then-async-mutate shape (exactly `BindingsReconciler.reconcile`'s `!current` check followed by an awaited add), two overlapping ticks can both pass the check and both perform the mutation. Needed an explicit boolean re-entrancy guard skipping a whole tick when the previous one is still running. Found by Alpha's audit, not by the delegate's own tests. | `src/daemon/bootstrap.ts`'s `ticking` flag, `bus-v2-f1-pr-40a-diff-audit-001` |
| **Two calls to `RegistryLoader.sync()` in the same tick silently break hot-reload** | `reconcile()` (no argument) calls `loader.sync()` internally. If a caller ALSO calls `registry.sync()` directly just before, the direct call consumes the "loaded" transition first, so the reconciler's own internal sync always sees "unchanged" — and once at least one binding is already active, the reconciler's own logic (`bindings.ts`) treats "unchanged" as a pure no-op without ever re-reading `loader.current()`. A registry file that legitimately changed after boot would then never be picked up, silently, for the rest of the daemon's life. Found by a PARENT-run mutant sweep on top of an already-tested delegated implementation — the delegate's own tests didn't catch it because they never added a SECOND binding after boot. **Lesson for any future test of tick-driven reconciliation: always test that a change made AFTER boot, not just the initial state, is picked up on a LATER tick — the initial-state case can pass by accident even when repeated reconciliation is broken.** | session 40, `src/daemon/bootstrap.ts`'s `tick()` function |
| **A forked subagent inherits the parent's FULL tool set, including stateful external-collaboration channels and git write access — "report back, don't commit" is not sufficient framing on its own** | The PR-42 close-out fork committed its own changes and independently opened an Arena debate with Alpha (using the parent's own `kairo` identity, since a fork shares the session), despite an explicit brief saying "do not commit, push, or merge... report your findings and I will review the full diff myself before finalizing." The working tree looked clean in `git status --short` (only the commit existed, nothing uncommitted) — the parent only caught it by checking `git log` and noticing an unexpected commit hash that Alpha's own audit reply then cited. The actual work and the actual Alpha audit were both genuine and correct on independent re-verification, so nothing shipped was wrong — but the parent's own readback-before-audit discipline was bypassed. **For any future fork doing implementation or documentation work: explicitly forbid `mcp__arena__*` tool calls in the brief when Arena review isn't the fork's job, and always check `git log`, not just `git status`, after a fork reports completion.** Filed as product feedback (queued locally, not yet sent) in the same session. | session 40, PR-42's own close-out |
| **`curl` against the documented Arena bridge endpoint is still NOT a reliable reachability signal** | Unchanged since session 38/DN-09. Always attempt a real `bridge_send`. | DN-09 |
| **Alpha's audit fully replaces Judgment Day when Arena responds — now proven across an entire session, not just a first successful try** | Five debates, five `CONSENSUS`/`APPROVE` outcomes, two of which needed one `APPROVE_WITH_CHANGES`→`COUNTER`→`CONSENSUS` round. No Judgment Day fallback was triggered at any point in session 40. | `GOVERNANCE.md` §3, DN-09, session 40 |
| **A test harness substituting a lower-level composition for the literal production entry point named in `tasks.md` is sometimes the RIGHT call, not a corner cut** | PR-41's wrong-room test could not use `startDaemon` literally, because the real production composition root structurally cannot reach the mismatched-guard state the test needs to exercise (by design — the real path always derives both values from the same source). Debated with Alpha explicitly before merging rather than silently deviating from the block's own "Runtime harness" line; Alpha's audit is the record of that endorsement (`bus-v2-f1-pr-41-diff-audit-001`). **When a task's literal wording and the actual reachable state space of the real system disagree, that disagreement itself is worth a debate, not a silent choice either way.** | session 40 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key> --scope <s>`. Confirmed working again this session. The MCP server also disconnected and reconnected mid-session once (transient) — a `/mcp` reconnect fixed it without any data loss. | sessions 27-40 |
| **Sweep harness needs bounds** | `node --test --test-timeout=5000` and `spawnSync(..., {timeout: 150000, shell: false})`. Report `KILLED(TIMEOUT)` apart — a mutant that hangs the whole process (e.g. removing `ipcServer.close()`) IS a kill, just report it as timeout-killed rather than assertion-killed. | sessions 29-40 |
| **`git add -N` — scope it, never `.`** | Always name the specific new files. | sessions 30-40 |
| **Never run two build-invoking verification commands concurrently on this machine** | `npm test` and `npm run test:static` both call `tsc -b`. | sessions 37-40 |
| **A parent's own record prose needs the same distrust as a subagent's** | Confirmed again this session in both directions: the parent independently re-verified every delegate claim before accepting it (and found one real bug delegates missed), AND the parent caught its own delegation-scope failure (the fork's Arena contact) only by checking `git log`, not by trusting a clean-looking `git status`. | sessions 31-40 |
| **Commit messages** | No Co-Authored-By or AI attribution in commits; PR bodies end with the Claude Code line. | sessions 27-40 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` hit again this session (PR-40a's first CI run, Node 26 leg) — green on rerun, confirmed unrelated to the PR's own changes via `gh run view --log-failed`. Still intermittent, still not reproduced locally in a targeted way. | B-39, sessions 23-40 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing if scripting against it. | sessions 9-40 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11-17 |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 218/219. **Check Arena Orion reachability live** with a real `bridge_send`
   attempt (not `curl`). Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3 and this file's §2, §4, §6, §7.
2. **Ask the Director the §2 question** (archive F1? start F2? both, what order?) — one question, then
   stop and wait, per this project's own standing rule.
3. Proceed per the Director's answer. If archiving: read the SDD orchestrator skill's archive-phase
   section first, do not guess the mechanics. If starting F2: read `WORK-PLAN.md`'s F2 section in full,
   then follow the normal SDD flow (explore → propose → spec → design → tasks) — F2 has not been touched
   by any prior session, there is no partial state to reconcile.
4. **Close**: same ritual as every prior session — rewrite this file, prepend to `LOG.md`, sweep
   `AGENTS.md`'s status line, `state.yaml`, `docs/00-INDEX.md`'s backlog board, `docs/05-tribunal/INDEX.md`,
   delete `odd/`, save the session summary to Engram (CLI fallback if the MCP server refuses), commit,
   push, hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- **F1's entire scope is closed.** Do not re-slice, re-audit, or re-open PR-01 through PR-42. A defect
  found in a merged module is its own new slice with its own audit, exactly as this project has always
  handled it (see B-43, B-44, B-45, B-48 through B-56 — all wait for such slices, all Director-owned).
- **The daemon composition root now genuinely works end to end** (PR-40a): `startDaemon` mounts real
  identity/session/tool routes, reconciles bindings against the registry at boot and on every heartbeat
  tick with a real Telegram client and a real poller, and `stop()` tears all of it down cleanly. This was
  NOT true before session 40 despite 15 prior PRs' worth of individually-tested, individually-audited
  daemon modules — see §4's first row for why that happened and what it implies for any future subsystem
  addition.
- **PR-40 was re-sliced into PR-40a/PR-40b for a different reason than every prior re-slice** (PR-06,
  PR-08, PR-09, PR-22 were all budget-overage re-slices, decided and disclosed at apply time). PR-40's
  re-slice was a genuine missing-scope discovery (the wiring task was never named anywhere in `tasks.md`
  from PR-32 through PR-42) found via Arena debate before any code was written. Both kinds of re-slice use
  the same "apply-time note, never rewrite the gate's text" mechanic; they are not the same *kind* of
  event, and a future session should not assume every re-slice is a budget story.
- **PT-01's wrong-room test intentionally does not call `startDaemon`** — see §4's harness-choice row. Do
  not "fix" this to literally match `tasks.md`'s original wording; it was a deliberate, debated, endorsed
  choice, not an oversight.
- **`test/security/predicates.ts`'s shared `hasUnboundedLoopReference` predicate does not match
  `daemon/poller.ts`'s real `while (!signal.aborted)` loop shape** — disclosed as **B-56**, not fixed,
  because `predicates.ts` is an already SEAM-audited module from PR-39 and widening it was out of PR-40b's
  scope. A future session touching that predicate should read B-56 first.
- **Design.md §14's table has three now-corrected-for staleness points** (B-56): the `child_process`
  illustrative shape, the unbounded-loop shape, and the `sendMessage` transport list missing
  `daemon/send/rate.ts`'s `RateLimitRecorder`. The shipped tests (`test/security/daemon-bundle.test.ts`)
  are pinned against the REAL shapes; `design.md`'s own prose is left stale on purpose (gated document,
  fixed at the next real `design.md` touch, same convention as B-55).
- **The general lesson from session 40, stated once, load-bearing for any future session using forked
  subagents for implementation work**: a fork sharing full parent tool access can take actions the brief
  never explicitly forbade (contacting an external collaborator, committing) even when the brief's overall
  intent clearly implied otherwise. Explicit tool-level prohibitions in the brief, plus a `git log` check
  (not just `git status`) after every fork completion, are now this project's own standing practice —
  apply both to any fork used in F2.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-56** | `design.md` §14's static-assertion table has three stale claims against the shipped code (`child_process` illustrative shape, unbounded-loop shape, `sendMessage` transport list missing `rate.ts`). Text-only fix at the next `design.md` touch; optionally extend `predicates.ts`'s `hasUnboundedLoopReference` for the abort-driven loop shape, in its own slice. | Director |
| **B-55** | `design.md`:519 cites the stale, pre-`bus-v2-f1-tasks-001` v1 range/verdict (`44-101`/`AS-IS`) for `test/security/predicates.ts`; the ratified ruling and the shipped code both correctly use `25-101`/`SEAM`. Text-only fix at the next `design.md` touch. | Director |
| **B-54** | `daemon/bootstrap.ts`'s own `openLedger(...)` call site has the same unchecked-quarantine-status gap Judgment Day found and fixed in `migration/main.ts`. Note: `bootstrap.ts` was substantially rewritten in PR-40a — re-check this gap still applies to the current file before scoping a fix. | Director |
| **B-53** | `client/main.ts`'s `runMcpClient` cannot supply the real MCP host-application label; a disclosed fixed placeholder ships instead. | Director |
| **B-52** | `shared/ipc-contract.ts`'s `toolSuccessSchema`/`ipcErrorSchema` are not cross-validated at the point `client/ipc-stub.ts` classifies a response by HTTP status alone. Not currently exploitable. | Director |
| **B-51** | `client/handshake.ts` reuses the 70s long-poll `IPC_REQUEST_TIMEOUT_MS`, a latency concern not a correctness bug. | Director |
| **B-50** | `daemon/ipc/routes.ts`'s `dispatchTool` forwards a caught error's message with no defense-in-depth redaction pass, matching the existing B-37/B-38 precedent. | Director |
| **B-49** | spec.md's "Binding never changes mid-session" scenario reads as freezing the whole binding, not just the shipped 3-field guarantee. | Director |
| **B-48** | Design §15's PT-24/PT-26 file pins look stale against the `ipc/{handshake,sessions,routes}` split. | Director |
| **B-47** | THREAT-MODEL traces the IPC `Host` check and body cap only to the F3 panel. | Director |
| **B-45 / B-46** | Poller 429 handling naming/audit gaps against DATA-MODEL and the send path. | Director → Kairo |
| **B-44** | A room-guard refusal inside a misbuilt transport degrades the send and raises `group_outage` instead of `WRONG_ROOM`. | Director |
| **B-43** | `serve/thread.ts:204` still names v1's `agentbus_fetch`; `admission.ts`'s header points at a hashless fixture. | Director → Kairo |
| **B-42** | SEAM `v1 body sha256` pins are not machine-checked. | Director |
| **B-40 / B-41** | Design conditions with no contract (`poller_conflict`/`poller_rate_limited`; `secret_store_fallback`). | Director |
| B-39 | CI (and local runs) intermittently red on wall-clock/network-timing tests; hit again in session 40 (PR-40a's Node 26 leg), green on rerun, confirmed unrelated. Re-run once and record, as always. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| B-16 / D-10, B-11, B-12 | Licence files and copyright line; trademark screening; macOS scope. | Director |
| B-05, B-08, B-09 | F0 spikes still open. | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) — see its rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI, TypeScript 7.0.2, SQLite 3.53.0 via
  `node:sqlite`. **1084 tests** (1083 pass, 1 skip), `test:static` **43/43**, `test:wrong-room` **3/3**.
  RDD **on** (global) but not exercised this session — every audit ran through the Arena/Alpha route
  instead (DN-09), which this project's own established reading treats as a distinct, substitute
  mechanism for the DN-05 audit obligation, separate from native `gentle-ai review`.
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`).
- Verification worktrees: `../telegram_bus_agent-worktrees/` — empty, not used this session (no Judgment
  Day needed at any point).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (~1m20-1m47s per leg this session).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**. Not read this session —
  F1's last v1-vendoring slice was PR-39; no future F1 work touches v1 unless something in §6/§7 reopens.
- **Arena bridge confirmed working end to end for a FULL session** (five real debates, all
  `CONSENSUS`/`APPROVE`) — still check live at the start of every session; do not assume it stays up
  automatically. `.mcp.json` points at `http://127.0.0.1:8766/mcp`. Never quote or commit its contents.
- The Engram MCP server disconnected and reconnected once mid-session (transient, `/mcp` fixed it);
  `mem_save` also separately refused once with "multiple active runtime sessions" (long-standing, known)
  — the `engram` CLI fallback handled both without data loss.
