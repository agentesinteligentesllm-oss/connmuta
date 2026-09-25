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

**Plan settled — do not re-open it.** The Arena Orion debate arena (`http://127.0.0.1:8766/mcp`) is
**not available**: assume it stays down, so **no slice is audited by the tribunal and nothing may wait
for a debate**. The Pi-native SDD preflight gate is also closed and only a human can open it (§2), so
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. Session 35
merged **PR-35** (the thin MCP client's process entry point, `src/client/main.ts` + `src/cli/main.ts`'s
`mcp` subcommand) with both blind judges, a separate independent verifier, and **one** of the two
re-judgment rounds — the route §2 describes is the one that produced it. **Unit 10 `thin-client-tools`
is now CLOSED.** Unit 11 `v1-migration` opens with **PR-36**.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-36 (`src/migration/v1-config.ts` +
`src/migration/v1-state.ts`, lectores SEAM de solo lectura del config/state de v1, abre unit 11
`v1-migration`): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + Judgment Day con ambos jueces +
verificador independiente); la Arena no está disponible, así que nada depende de un debate ni de la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** (session 35 deleted its `odd/` tree). The status command must print
`nextRecommended: apply`, `completed: 171`, `pending: 39` (of `210`), `blockedReasons: []`. Anything else:
stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count
yourself with `grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 171).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-35** (PR-35 merged as PR #39, `456460c`; candidate `ee4f91e`, correction `593a72f`, re-judgment disclosure `64c1a0d`). **Unit 10 `thin-client-tools` is CLOSED — its entry-point slice (PR-35) is done.** **Unit 11 `v1-migration` opens with PR-36.** **Next slice: PR-36** — `src/migration/v1-config.ts` + `src/migration/v1-state.ts` (SEAM, read-only). Requirements: read-side of `v1-migration › v1 files are backed up and never modified or deleted`. Runtime harness: temp `~/.agentbus`-shaped placeholder fixture directories. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | `tasks.md` has **45 `####`-level PR headers total** (`grep -c '^#### PR-' tasks.md`), of which **38 header lines cover `PR-01`…`PR-35`** and **7 remain, naming `PR-36`…`PR-42`** — both directly counted, unambiguous. Separately, **41 distinct GitHub PRs have actually merged** through PR-35 (three headers — `PR-06`, `PR-08`, `PR-09` — were each re-sliced at apply time into two separately-merged PRs without a second header line, so the "merged" count is higher than the "header lines covered" count — this is the same discrepancy `state.yaml`'s own PR-11 entry already flagged as not fully reconciled; do not force these two counting bases into one subtraction). **Checkboxes: 171 of 210**, always the cleanest single number to cite. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **171/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | `src/shared/*` (15 modules with twins), `src/cli/*`, `src/registry/*`, `src/ledger/*` (11), `src/secret-store/*` (5), `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts`, `src/daemon/lifecycle/*` (4), `src/daemon/transport/*` (5), `src/daemon/serve/*` (3), `src/daemon/send/*` (3), `src/daemon/ipc/{server,handshake,sessions,routes}.ts`, all with twins, and `src/client/{spawn,run-state,binding,handshake,ipc-stub,errors,server,main}.ts` with twins — **the thin client is now a complete, working MCP process**: `conmuta mcp --project <id>` gates on Node floor, walks up to `conmuta.json`, constructs one `IpcSession`, and connects a real `StdioServerTransport`, with the daemon handshake staying lazy until the first real tool call. **977 tests** (976 pass, 1 skip), `test:static` **8/8**. | PRs `#1`–`#39` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **24 entries, unchanged by PR-35** (`client/main.ts` is new code, verdict REPLACED per design.md:471 — no v1 byte range, no Provenance header, correctly invisible to `provenance.test.ts`). **PR-36 will grow it**: `tasks.md`'s own PR-36 block already names its two SEAM sources — `telegram-agent-bus/src/config.ts:168-233` for `v1-config.ts` and `telegram-agent-bus/src/state.ts:252-439` for `v1-state.ts` — pin both the same way §3's rule describes, and add two new fixture rows. | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-35**, one record each in the tribunal index. PR-23..PR-35: Judgment Day with **both judges** + independent verifier, all **APPROVED** (`bus-v2-f1-pr-2{3..9}-audit-001`, `bus-v2-f1-pr-30-audit-001` through `bus-v2-f1-pr-35-audit-001`). PR-22a/22b: inline passes (the judges were down then). PR-29, PR-30, PR-31 used **both** re-judgment rounds; PR-32, PR-33, PR-34 and **PR-35 each used only one** — in each case the single re-judgment round found only a narrow residual, parent-corrected and confirmed without spending the second round. See §6 for what each slice's rounds found. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused before
the child launches (`SDD preflight cancelled or invalid; no session consent recorded`) — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line budget
with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` envelope exists. One variant: if a human has already run `/gentle:sdd-preflight` in the TUI,
or the Director asks, the slice may run through `sdd-apply`.

**2. The per-slice pipeline sessions 27–35 ran — repeat it exactly.**
1. **Map** once (delegated `Explore`, read-only): v1 range (if any), consumed APIs with verbatim signatures, DDL,
   spec, design, the tasks block, and every contradiction between them. For PR-36, pin down exactly: (a) the exact
   v1 byte ranges `tasks.md`'s own block already names (`config.ts:168-233`, `state.ts:252-439`) and reproduce
   their sha256 yourself (§3's method) before trusting the citation; (b) `specs/v1-migration/spec.md`'s exact
   "v1 files are backed up and never modified or deleted" scenario text — PR-36 is explicitly only the **read**
   side of it (the write/backup half is a later PR, per its own Requirements line); (c) what "the quarantine-rename
   branch becomes a hard error" means precisely — re-read the spec's own wording, do not assume; (d) whether
   `src/migration/*` needs its own `tsconfig.json` (no such file exists yet — check `src/client/tsconfig.json`'s
   shape as the template, and decide what `migration/*` may import: almost certainly `shared/*` only, matching
   every other leaf compile unit); (e) the placeholder-fixture convention this project already uses for v1-shaped
   test data (`test/fixtures/repo-scan-negative.txt` is one precedent; PT-22's token-shape rule — seven-digit
   synthetic bot ids — applies to any new v1-shaped fixture too, see §4).
2. **Decide** the open design points yourself (the Director delegated them) and write them into the writer's brief;
   each decision is stated in the module doc and in `apply-progress.md`, and a `tasks.md` *apply-time note* records the
   decisions and any edit outside the block's Scope line.
3. **Write** (delegated `general-purpose`, sonnet): src + twin. The writer does not commit. **Insist on RED first**
   and ask for the verbatim RED lines.
4. **Parent readback** of the source before freezing — it has found a defect in most slices since session 28
   (a notable recent exception: PR-35's own readback found none — the candidate was clean going into Judgment Day,
   which still found 3 real CRITICAL/WARNING findings the readback missed, confirming readback and adversarial
   review catch different classes of defect and neither substitutes for the other). **A design decision framed as
   "just the natural/obvious choice" needs the same scrutiny as a correctness claim** — PR-35's own `host:
   os.hostname()` decision was reasoned as "the natural value" with zero cross-check against
   `docs/02-architecture/DATA-MODEL.md` §3.5's own pre-existing, already-ratified field semantics (the MCP
   host-application label, not a machine name) — a second confirmed instance of PR-34's identical lesson about a
   *different* design decision. Before writing a design decision into a module doc, grep the field/concept name
   against `DATA-MODEL.md`, `design.md` and `shared/*`'s own doc comments first.
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only control that
   MUST survive, BUILD-FAIL and TIMEOUT reported apart. A survivor is a test gap → pin it (that is the behavioural RED);
   an **equivalent** mutant is argued in the record, not pinned — **but re-derive the equivalence claim by tracing
   BOTH the exit code AND every side effect (stderr writes, logged messages, etc.), not just the return value**: PR-35's
   own first-draft "M3 is equivalent" claim was wrong on exactly this point (identical exit code, but a real,
   previously-unasserted stderr message appears on one branch and not the other) — caught independently by both
   Judgment Day judges, not by the parent's own sweep. A mutant the suite **cannot observe** is recorded as
   such, not called equivalent. **Use a runtime-opaque condition for a disabled-branch mutant (e.g. `Date.now() < 0`),
   never a literal `false`** — a literal-`false` mutant trips TypeScript's unreachable-code detection (`TS7027`), a
   legitimate BUILD-FAIL that answers nothing about test coverage. **A discriminated union with literal-typed fields
   turns an incorrect kind↔value mapping into a compile-time BUILD-FAIL, not a runtime survivor** — confirmed a
   FIFTH time in PR-35 (`BindingResult`'s `{ok:true,file,path}|{ok:false,refusal}` shape turned an inverted
   `!binding.ok` check into `TS2339`, and a literal same-type-shape field swap — `projectId`↔`groupId`, string vs
   number — into a compile error too, `TS2322`, confirmed independently by the verifier's own mutant re-sweep);
   do not mistake a clean BUILD-FAIL result for "untested."
6. Full suite + `test:static` from a clean `dist/`; `git add -N` **new files only, never `git add -N .`**; measure
   `git diff --numstat main -- src test`, **summed as additions+deletions per file, not additions alone**
   (`AGENTS.md`'s own ODD section: "counting additions plus deletions"); commit code **with** its records
   (`tasks.md` ticks + size reconciliation + apply-time note, `apply-progress.md` section). **Re-derive a stated
   mutant-sweep tally from the raw sweep output before writing it down, never transcribe it from memory. Re-check
   that a size-reconciliation note's own stated per-file breakdown actually sums to its own stated total before
   writing it down** — PR-35's own first-draft note claimed "187 src + 332 test" against per-file figures that
   actually summed to 189/330; caught independently by Judge B, not by the parent's own arithmetic.
7. **Judgment Day**: frozen worktree, `jd-judge-a` + `jd-judge-b` in parallel, result shape `{findings, evidence}`.
   In parallel, a **separate independent verifier** (`general-purpose`) on its own worktree with a mandate to
   reproduce every figure, re-run the sweeps, write up to six extra mutants and **probe the running code**.
   **The judges have no Bash**: they check figures by reading and arithmetic only; the verifier is the one that
   re-measures. **Two judges converging independently on the identical finding without seeing each other's work
   is a strong signal** — confirmed a FIFTH time in PR-35, and this time on TWO separate findings in the same
   round (the node-floor gate's ordering relative to `--project` validation, AND the M3-equivalence-claim
   inaccuracy) — both judges reached each one from different angles (Judge A traced a concrete failure mode for
   the ordering gap; Judge B reasoned from the `daemon/main.ts` structural precedent) yet landed on the same root
   cause both times. **A judge that explicitly CONSIDERS an issue and declines to report it is giving you real
   signal too, not silence** — established in PR-34, holding since. **A design decision the orchestrator makes
   can itself be the audit's headline finding, not just a writer's code** — PR-34 established this with the
   session-caching CRITICAL; PR-35 confirmed it a second time with the `host` field CRITICAL, this time found
   by Judge B alone but independently corroborated by the parent's own direct read of the pre-existing
   documentation once flagged.
8. Reproduce single-judge rows before correcting; correct (parent inline for small batches, or a scoped
   `jd-fix-agent` delegation for a larger confirmed batch); commit code and record together; scoped
   re-judgment over the delta only. **A scoped re-judgment round is MANDATORY before any APPROVED verdict —
   never write "APPROVED" or "zero re-judgment rounds used" without actually having sent the correction back to
   both judges first**, even when you are confident the fix is complete. **Budget: two re-judgments.** PR-35
   used only **one**: its single re-judgment finding worth acting on (Judge B's SUGGESTION that the CRITICAL
   fix's own fixed host placeholder reduces per-machine session distinguishability) was low-severity, confirmed
   non-exploitable, and closeable with a two-line textual disclosure addition rather than a behavior change —
   extending PR-32/33/34's own established "narrow, well-understood residual doesn't need the second round"
   judgment call to a SUGGESTION-tier finding for the first time (the prior four slices each extended it to
   WARNING-tier residuals at most).
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude Code line);
   `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Get the untracked inventory with `gentle-ai review status --cwd . --contract
gentle-ai.review-integration/v2 --agent claude-code --next-transition` (field `eligible_untracked_inventory`), then run
`gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha> --committed-only --untracked-scope=exclude
--expected-untracked-inventory=<that sha256:…> --json` and record tier and `review_due`. **Do not START the native review
for a Judgment Day target**: the installed `judgment-day` skill states it replaces ordinary 4R and both must never run on
one target, and START's consent envelope belongs to the Director. Record that in the slice's audit row.

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those. This
project has already caught the opposite mistake several times — the established fix is a **scoped,
disambiguated pointer**: cite the file(s), then parenthesize exactly which clause is covered and where the rest
lands, never a silent full-coverage claim. Do not invent a Docs task where none is warranted; PR-36's own block has
no Docs sub-task (its runbook lands in PR-38) — check `tasks.md`'s PR-36 block before assuming one is needed.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip
and labelled with it, **counted as additions+deletions per file** (§2.6 above). PR-33 1,107 (767), **PR-34 849 at its
final tip** (489-line exception), **PR-35 679 at its final tip** (429-line exception, grown from the candidate's 519
across one Judgment Day correction round plus a one-round re-judgment disclosure) — every estimate priced only the
primary deliverable; disclosed edits outside the primary scope line and Judgment Day's own correction rounds are most
of the overrun, a pattern holding since PR-06b. Add a *Size reconciliation* note under the block's header in
`tasks.md` (gate text left as written), and **update it again if a later correction round changes the final tip** —
do not leave a stale mid-process number in `tasks.md` once the slice is actually done.

**6. Frozen worktrees — the junction rule (session 28 incident, followed cleanly since, including PR-35's own two
worktree pairs).** `git worktree add --detach ../telegram_bus_agent-worktrees/<name> <sha>`. Only the verifier's
worktree needs `node_modules`: create the junction with PowerShell `New-Item -ItemType Junction -Path '<win
path>\node_modules' -Target '<main win path>\node_modules'`. **To remove: delete the junction first with
PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`, verify it is gone (`test -e … || echo
removed`) and that `node_modules/typescript/lib/tsc.js` still exists in the main checkout, and only then `git
worktree remove --force`.** For a re-judgment round, moving the judges' worktree in place via `git checkout <sha>`
(rather than recreating it) is cheaper and equally correct when only the judges' worktree, not the verifier's, is
needed again — PR-35's own session did exactly this.

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

**8. Waiting on a background agent: never poll.** `ScheduleWakeup` is for `/loop` dynamic-mode sessions only —
calling it (or spawning a throwaway filler agent, or sending an unprompted "status?" message to a still-running
subagent) just to "wait" for an `Agent`-launched subagent is a misuse the harness already handles for you: it
re-invokes you automatically when the subagent's task-notification arrives. **This mistake has now recurred in
sessions 32, 33, 34 AND 35** — session 35 made it TWICE in the same session, despite reading this exact warning
at its own start. Read this point before reaching for either at all, not after. **This has stopped being a
"read the reminder more carefully" problem and is now a five-plus-occurrence pattern the reminder text alone has
failed to prevent.** If it recurs in this session too, do not just self-correct and move on silently — say so
explicitly in the close-out and consider proposing a structural fix (e.g., a hard pre-Agent-call checklist gate,
or a tool-level guard) rather than relying on yet another paragraph of reminder text.

---

## §3 — Pinned provenance values (re-verify with your own method; never trust a header blindly)

Rule: the pinned value is the exact byte range of the cited v1 lines **LF-normalized, including the terminating
newline** (`bus-v2-f1-pr-04-001`). Multi-range: ranges concatenated in the cited order, each with its newline
(PR-22a). Whole file: bare v1 path, all lines. Validate your method first by reproducing a known value, e.g.
`git show bf8f365:src/tools/fetch.ts | tr -d '\r' | sed -n '404,460p;525,656p' | sha256sum` → `3bd09d0d…`.

| v2 path | v1 source @ `bf8f365` | verdict | v1 body sha256 |
|---|---|---|---|
| `src/daemon/admission.ts` | `src/tools/fetch.ts:404-460,525-656` | SEAM | `3bd09d0d0291dcf7fe88a90eedcef1e5c1496cf4ea7a4c3b670aad3675c73192` |
| `src/daemon/send/validate.ts` | `src/tools/send.ts:113-192,205-378` | SEAM | `771f968e37a1897e7ecb3e277bacb294c30375b1018f30be8e9ce6cb4e1ca423` |
| `src/daemon/send/send-path.ts` | `src/tools/send.ts:380-660` | SEAM | `25926e38a82e8c12138015a9cdaac7320a9098e4b5726f5d868b8aae1fbb804b` |
| `src/client/server.ts` | `src/index.ts:112-248` | SEAM | `1d07e12d170ddd4466e738f92ec31a27abef6fc91fd6e89a80c962e646e12651` |

**PR-32/33 and PR-34's `client/errors.ts`/`client/ipc-stub.ts`** are all **new code, confirmed**: v1
(`telegram-agent-bus`) has no daemon/client split at all. **PR-35's `client/main.ts` is also new code, confirmed**
this session: v1's `main()` (`src/index.ts:250-292`) is verdict **REPLACED** in design §12 (not SEAM/AS-IS) — the
established reading, now tested by an actual PR decision, is that REPLACED code gets no `Provenance:` header at
all, the same treatment as new code, since the whole point of REPLACED is "this v1 code is not extended into v2,
a new thing is built instead." **PR-36 needs its own two new pins**: `tasks.md`'s own PR-36 block already names
them — `telegram-agent-bus/src/config.ts:168-233` for `v1-config.ts` and `telegram-agent-bus/src/state.ts:252-439`
for `v1-state.ts`, both SEAM, both read-only sources (no token resolution from env; `to_user_id` backfilled from
the v1 roster). Reproduce both sha256 values yourself with this section's own method before trusting the citation
— do not skip this step just because `tasks.md` already names a range. Older pins are in `apply-progress.md` and
in each module's header. SEAM pins are **not machine-checked** by `provenance.test.ts` (B-42).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **A design decision the orchestrator makes needs the same cross-check against EXISTING project documentation as any other technical claim, not just internal reasoning** | Confirmed a SECOND time in PR-35: `host: os.hostname()` was reasoned as "the natural value" with no grep against `DATA-MODEL.md`/`ipc-contract.ts`'s own already-ratified field semantics (the MCP host-application label, e.g. `claude-code`) — found by Judge B, not the parent's own readback. **Before writing "this is the natural/obvious value" for any field with an existing name in the data model, grep that field name against `docs/02-architecture/DATA-MODEL.md` and any `shared/*.ts` doc comment that defines it, every time.** | PR-34 (session caching), PR-35 (`host`) |
| **The thin client's full startup contract is now closed and stable** — `client/main.ts`'s `runMcpClient(options)`: node-floor gate (locally duplicated, never importing `daemon/node-floor.ts`) → `--project` presence → `resolveProjectBinding` walk-up → exactly one `IpcSession` via `createIpcSession({projectId, groupId, rosterHash, host})` → `createServer({ipc, projectId})` → `await server.connect(transport)`, the whole sequence wrapped in try/catch (message-only, exit 1 on anything unexpected). `host` is currently the disclosed placeholder `MCP_HOST_LABEL_UNKNOWN = "unknown"` (real MCP host-application label deferred to **B-53** — would require restructuring already-merged `ipc-stub.ts`/`server.ts` to defer identity binding until after the MCP `initialize` exchange). | `src/client/main.ts` |
| **`cli/main.ts`'s `mcp` branch gates on Node floor BEFORE parsing `--project`, reusing `daemon/node-floor.ts`'s `enforceNodeFloor` directly** (`cli/main.ts`'s tsconfig references `daemon`, unlike `client/main.ts`'s own boundary) — this was a real ordering bug both Judgment Day judges found independently in the original PR-35 candidate; the fix is now the established shape for any future CLI subcommand needing this same gate. | `src/cli/main.ts` |
| **The client/daemon tsconfig boundary precedent now holds THREE times** — `client/run-state.ts`, `client/handshake.ts`, and now `client/main.ts` all independently chose to locally duplicate a small piece of `daemon/*` logic rather than widen `client/tsconfig.json`'s `references` to include `../daemon`. Reach for this same duplicate-rather-than-widen pattern for any future `client/*` file needing a `daemon/*`-only pure helper — it is the established convention, not a one-off. | `src/client/{run-state,handshake,main}.ts` |
| **A missing try/catch around a startup sequence is a CRITICAL-tier finding in this project, not a style nit** — `design.md:424`/PT-08 explicitly require "message only, never `err.stack`" for any startup error (a T04 threat-model vector); `daemon/main.ts`'s own established shape (wrap everything, `console.error(err.message)`, controlled exit) is the pattern to match for any new process-entry-shaped module. `client/main.ts` did not follow it originally and Judge A caught it. | `src/client/main.ts`, `src/daemon/main.ts` |
| **`IpcSession` must be constructed exactly ONCE per client process, not once per tool call** — unchanged from PR-34's own lesson, now further exercised: `client/main.ts` constructs it once at startup, before `createServer`, and PR-35's own tests directly assert the injected `createIpcSessionImpl`/`createServerImpl` receive the exact expected identity. | `src/client/ipc-stub.ts`, `src/client/main.ts` |
| **A `git diff --numstat`-derived size-reconciliation note's own stated per-file breakdown must actually sum to its own stated total, checked with real arithmetic, not eyeballed** | PR-35's own first-draft note claimed "187 src + 332 test" against per-file figures that actually summed to 189/330 — caught by Judge B, not the parent. Recompute the sum from the cited per-file numbers before writing the aggregate down, every time. | PR-35 record |
| **An "equivalent mutant" claim must trace every OBSERVABLE side effect, not just the return value/exit code** | PR-35's own "M3 is equivalent" claim checked only the exit code (correctly identical) and missed a real stderr-message difference between the two code paths — caught independently by both judges. Before calling a mutant "equivalent," check every `stderr`/`console`/logged output path too, not just the function's return value. | PR-35 record |
| **`ScheduleWakeup` misuse to "wait" on a background `Agent` call is now a five-plus-session-running pattern (32, 33, 34, twice in 35) that has NOT self-corrected from reminder text alone** | The harness already re-invokes automatically on subagent completion; no wait mechanism is ever needed. If this recurs in the next session too, treat it explicitly as a pattern needing a structural fix, not another paragraph. | sessions 32–35, this file's own §2 point 8 |
| **`os.tmpdir()`'s ancestor chain can contain OTHER stray fixture-shaped files/dirs from prior sessions' test runs** (e.g. leftover `conmuta-bootstrap-test-*`, `conmuta-fetch-*` directories from earlier sessions, `npm_conmuta.json`/`py_conmuta.json` at the Temp root) | None of these collide with `resolveProjectBinding`'s literal `conmuta.json` filename search, confirmed by direct inspection this session, but a future test relying on "nothing found above a fresh temp dir" should not assume a pristine ancestor chain — verify the specific filename it searches for doesn't collide, the way this session did before trusting a walk-up-finds-nothing test. | this machine's `%TEMP%` |
| **`shared/ipc-contract.ts`'s `toolSuccessSchema`/`ipcErrorSchema` have no cross-validation at the point a caller classifies a response** | Deferred as **B-52**. | **B-52** |
| **`fetch` cannot set a custom `Host` header — confirmed empirically, not just documented** | Node's `fetch` (undici) silently ignores any explicit `host` header value. Use `node:http` or a raw socket if you ever need to test a mismatched Host header. | PR-33 record |
| **Promise memoization for a shared in-flight async attempt: cache the PROMISE, not the resolved value** | General pattern from PR-34; reach for it whenever two concurrent callers must not both trigger the same expensive/stateful async operation. | `src/client/ipc-stub.ts` |
| **`parseProjectFile` already exists — do not reimplement `conmuta.json` parsing** | `src/shared/project-file.ts` exports `parseProjectFile(text: string): ProjectFileResult` — pure, no I/O; freely importable from `client/*` and now used the same way any future `migration/*` reader touching `conmuta.json`-adjacent shapes should check first. | `src/shared/project-file.ts` |
| **`computeRosterHash` already exists — do not reimplement the roster fingerprint** | `src/shared/roster-hash.ts` exports `computeRosterHash(roster: readonly RosterHashInput[]): string`, accepts any object with at least `{agent_id, user_id}` structurally (extra fields like `username` are fine). | `src/shared/roster-hash.ts` |
| **`resolveProjectBinding` never throws — every walk-up failure is a typed refusal, including an unreadable path** | `src/client/binding.ts`, five `BindingRefusal` kinds (`missing_project_flag`, `no_project_file_found`, `invalid_project_file`, `unreadable_project_file`, `project_id_mismatch`), three distinct exit codes across them. | `src/client/binding.ts` |
| **`performHandshake` composes `run-state.ts`'s already-merged `ensureDaemonRunning` as its own first step** | Zero `fetch` calls happen if that step fails. | `src/client/handshake.ts`, `src/client/ipc-stub.ts` |
| **`IPC_REQUEST_TIMEOUT_MS` (70s) is reused for both the handshake and every tool call — disclosed, deferred as B-51** | Not a correctness bug. | **B-51** |
| **Windows `fs.watch()` crashes natively on an 8.3 short path** | `realpathSync.native(dirPath)` before `watch()`. | `src/client/run-state.ts`'s `waitForRunFile` |
| **`test/client/` conventions** | Real temp dirs via `mkdtempSync` cleaned in `finally`; real `process.pid`; small hand-written fakes inline per file; a scoped, `finally`-restored monkey-patch is acceptable when there is no other way to observe an argument passed to (or, as PR-35's own `process.version` override showed, read from) a built-in — now established for `AbortSignal.timeout` (PR-34) AND `process.version` (PR-35). `process.chdir()` similarly used once in `test/cli/main.test.ts`, restored in `finally`, safe because `node --test` runs one file's top-level tests sequentially. | `test/client/*.test.ts`, `test/cli/main.test.ts` |
| **`state.yaml` is YAML with several enormous single-line string fields** | `completed_slices` and `tribunal_state` are both continuously-growing double-quoted YAML strings — extract/append with a small Node script (find a unique marker substring, insert before the closing quote) rather than `grep`/`sed`/the Edit tool. **Never introduce an unescaped `"` inside the appended text**. **Get the line INDEX right — `Array.prototype.forEach`'s callback index is 0-based; if you first located a line via a 0-based index print, re-use that SAME 0-based index for the edit, don't shift by one** (this session's own first attempt at this made exactly that off-by-one mistake, caught by inspecting the wrong line's content before writing). Re-run `gentle-ai sdd-status` after editing to confirm the file still parses. | sessions 28–35 |
| **A parent's own record prose needs the same distrust as a subagent's** | Confirmed a fifth time in PR-35 (the "187+332" arithmetic error). Recompute a stated figure from the actual current tip before writing it, every time. | PR-31 through PR-35 records |
| **Sweep harness needs bounds** | `node --test --test-timeout=5000` and `spawnSync(..., {timeout: 150000, shell: false})`. Report `KILLED(TIMEOUT)` apart. | sessions 29–35 |
| **`git add -N` — scope it, never `.`** | Always name the specific new files. | sessions 30–31 |
| **A writer's RED is usually compile-level** (`TS2305`/`TS2307`/`TS2339`) | The behavioural RED is the parent's: readback fixes and sweep survivors, each pinned by a test that fails without the fix. | sessions 27–35 |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; builds via `node_modules/typescript/lib/tsc.js -b` directly. Lives in the untracked `odd/` tree (deleted at close): recreate it each session (≈75 lines; this session's own copy used a replacer function `s.replace(from, () => to)` and restored the original file after every mutant, rebuilding once more at the end to leave `dist/` consistent). **Use a runtime-opaque disabled-branch condition (e.g. `Date.now() < 0`), never a literal `false`.** | sessions 28–35 |
| **The AS-IS transports lose error detail** | `GroupTransport`/`DualWriteTransport`. | PR-27, PR-28, PR-31 |
| **`offsets.retry_after_until` is shared** | Per `bot_id`; the poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring. | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | Do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **A shared "must never both be true" property is best enforced by ONE function** | `withRetryAfterIfRetryable(payload, retryAfterS)` (PR-31) is the shape to reach for. | `src/daemon/ipc/routes.ts` |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId`. Extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status`. | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key> --scope <s>`. Session 35 additionally saw the Engram MCP server disconnect mid-session (`plugin:engram:engram` dropped from the tool list entirely) — the CLI fallback worked throughout regardless; do not treat an MCP disconnect notice as a reason to skip memory writes. | sessions 27–35 |
| **Subagents were available all of sessions 27–35** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits; PR bodies end with the Claude Code line. Write long messages to a file and use `git commit -F`, or pass a heredoc-free multi-line string directly to `-m` if the Bash tool's heredoc parsing is unreliable for very long embedded text (session 35 hit one heredoc parse failure mid-session — switched to Read+Edit for the affected doc append instead of debugging the heredoc further). | sessions 27–35 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header, opt-in per file** | A file with no `Provenance:` line is invisible to this test entirely. Confirmed directly in PR-35 too: `client/main.ts`'s own module doc literally contains the substring "Provenance:" in explanatory prose ("**No `Provenance:` header.**"), and the test STILL correctly ignores the file — because the check requires the block to `startsWith("/**")` as the file's very first bytes, and `main.ts` has `import` statements before its doc comment. A naive `grep -n "Provenance:"` is therefore a false positive for "this file claims vendor provenance"; the real test is structural (leading-block position), not textual (substring presence) — verified by the independent verifier this session. | `test/security/provenance.test.ts`, **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files before `test:static`. | PR-32 record |
| **PT-22's token shape** | Synthetic bot ids use seven digits; no fixture may match `\d{8,10}:[A-Za-z0-9_-]{35}`. Relevant to PR-36's own placeholder v1-home fixtures. | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means no limit; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines (or with many embedded backticks/quotes) can fail to parse or truncate silently** | Write files with the file tools, Python, or a small Node script; for appending to an existing large file, prefer Read + Edit over a heredoc `cat >>`. Verify line counts / content after writing. | sessions 13–35 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–35 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run. Did not reproduce in PR-23..PR-35 (every leg green on the first attempt across thirteen consecutive slices). | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |
| **The global `~/.claude/CLAUDE.md` is a managed, lazy-loadable file — do not assume it's monolithic** | Not relevant to this project's own code. | session 33, out-of-repo |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 171/210. Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4 (all
   flags — they are load-bearing, not optional colour), `tasks.md`'s **PR-36 block**,
   `specs/v1-migration/spec.md`'s "v1 files are backed up and never modified or deleted" requirement (read-only
   half only — PR-36's own Requirements line says so explicitly), design.md's migration section (search
   `migration`, `v1-config`, `v1-state`), and v1's own `telegram-agent-bus/src/config.ts:168-233` and
   `telegram-agent-bus/src/state.ts:252-439` (the two cited SEAM ranges) directly in the sibling checkout.
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram mirror
   `odd/<feature>/tasks`, before the first write.
3. **Branch** `f1/36-migration-v1-readers` from `main`, then run §2.2's pipeline:
   - **Decide first, before any code**: reproduce both SEAM sha256 pins yourself (§3); whether `src/migration/`
     needs its own `tsconfig.json` (almost certainly yes, referencing `shared` only, matching every other leaf
     compile unit — confirm against `client/tsconfig.json`'s exact shape first); the placeholder-fixture shape
     for a `~/.agentbus`-like temp directory (PT-22 token-shape discipline applies — seven-digit synthetic bot
     ids, no real production data ever, per `AGENTS.md` §3's data-hygiene rule).
   - **36.1 RED** `test/migration/v1-config.test.ts` and `test/migration/v1-state.test.ts` against a placeholder
     fixture, asserting read-only parsing and that the quarantine-rename branch becomes a hard error (v1 files
     are never modified — re-read the spec's own exact wording for what "quarantine-rename" means here before
     assuming).
   - **36.2 GREEN** `src/migration/v1-config.ts` (SEAM from `telegram-agent-bus/src/config.ts:168-233`,
     read-only source, no token resolution from env) and `src/migration/v1-state.ts` (SEAM from
     `telegram-agent-bus/src/state.ts:252-439`, read-only source, `to_user_id` backfilled from the v1 roster).
   - **36.3 Verify**: `npm run build && node --test "dist/test/migration/v1-config.test.js"
     "dist/test/migration/v1-state.test.js"`.
4. Audit per §2.2 steps 7–9; merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s status line,
   `state.yaml` (BOTH `completed_slices` AND `tribunal_state` plus `next_recommended`; check
   with `gentle-ai sdd-status`) and the `00-INDEX.md` board if the backlog grew, delete `odd/`, save the session
   summary to Engram (CLI fallback if the MCP server is disconnected), commit on `main`, push, and hand the
   Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text.
- **PR-01…PR-35 are complete; do not re-slice, re-audit or re-open them.** Units 4–10 are closed; unit 11
  `v1-migration` opens with PR-36. A defect in a merged module is its own slice with its own audit, not a drive-by
  edit (B-43, B-44, B-45, B-48, B-49, B-50, B-51, B-52, B-53 wait for such slices).
- **Settled in session 35 and recorded**: `src/client/main.ts` owns the thin MCP client's process entry point —
  `runMcpClient(options)`, a single testable async function (NOT a top-level script like `daemon/main.ts`).
  Startup order: node-floor gate (locally duplicated pure check) → `--project` presence → `resolveProjectBinding`
  walk-up → exactly one `IpcSession` via `createIpcSession` → `createServer({ipc, projectId})` → `await
  server.connect(transport)`, the whole sequence (after the two cheap pre-checks) wrapped in try/catch,
  message-only + exit 1 on anything unexpected. `host` is the disclosed placeholder `"unknown"` (real MCP
  host-application label deferred to B-53). No `Provenance:` header (v1's `main()` is REPLACED). `src/cli/main.ts`
  owns the process entry and all argv parsing for `mcp` (mirroring `daemon stop`'s dispatch exactly, including its
  own node-floor gate reusing `daemon/node-floor.ts`'s `enforceNodeFloor` as the very first action of the branch).
- **Settled in session 34**: `src/client/ipc-stub.ts` owns the daemon-calling half of one MCP session —
  `IpcSession`/`createIpcSession`, session-lifetime-cached via a memoized in-flight promise, one-retry self-heal on
  a `401`. `client/errors.ts` owns `clientErrorPayload`. `client/server.ts` owns `createServer(deps)` — SEAM from
  `v1:src/index.ts:112-248`.
- **Settled in session 33**: `src/client/binding.ts` owns `resolveProjectBinding` — five refusal kinds now (not
  four — `invalid_project_file` and `unreadable_project_file` are distinct). `src/client/handshake.ts` owns
  `performHandshake`; **explicitly documents it "assembles no roster hash and derives no host label of its
  own"** — session 35's own `main.ts` is the module that finally closes that gap (with the disclosed placeholder).
- **Settled in session 32**: `src/client/spawn.ts` owns `spawnDaemon`. `src/client/run-state.ts` owns
  `ensureDaemonRunning`.
- **Settled in session 31**: `daemon/ipc/routes.ts` owns session/tool routing and `toTelegramErrorPayload`.
- **Settled in session 30**: `daemon/ipc/handshake.ts` owns `GET /identity` and `PendingHandshakeStore`.
- **Settled in session 29**: `ipc-contract.ts` owns the wire vocabulary; the server validates no route body.
- **Settled in session 28**: the send tool's rate code is `RATE_LIMITED`; `BindingMutex`/`SendRateBudget` are one
  instance per daemon.
- Provenance hash rule, registry and range conventions are ratified — §3.
- Doc-hygiene rule: never quote a matched-and-rejected secret-shaped literal in `apply-progress.md`.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a decision.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`. TypeScript 7.0.2 needs `"types": ["node"]`.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job.
- **The general lesson from PR-31's own two re-judgment rounds**: when a fix addresses "field A and field B must
  never both be true," check every place both fields can be produced, not just the one call site a finding named.
- **The general lesson from PR-32's own re-judgment round**: a disclosure comment's comparison to another file's
  test coverage is a factual claim, not decoration — verify it the same way you'd verify a number.
- **The general lesson from PR-33's own audit**: a module's own doc comment is a claim about the code, worth
  cross-reading against the code and against the design doc, not trusted just because it's already written down.
- **The general lesson from PR-34's own audit**: a design decision the ORCHESTRATOR itself makes (not just a
  writer's code) needs the same adversarial scrutiny as any other claim — "this is just a performance tradeoff"
  can hide a real correctness bug.
- **The general lesson from PR-35's own audit**: the same lesson as PR-34's, confirmed a second time on a
  DIFFERENT class of decision (a data-model field's semantics, not a performance tradeoff) — "this is the
  natural/obvious value" needs a grep against existing project documentation before being written down, not just
  internal reasoning. Also: an "equivalent mutant" argument must check every observable side effect, not just the
  return value; two judges can converge independently on TWO separate findings in one round, not just one; a
  SUGGESTION-tier, non-exploitable, already-disclosed re-judgment residual can close with a pure text edit and no
  second round, extending the established "narrow residual" judgment call one severity tier further than before.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-53** | `client/main.ts`'s `runMcpClient` cannot supply the real MCP host-application label (`client_cursors.host`) because `IpcSession` must be constructed before `server.connect()`'s `initialize` exchange reveals it. A disclosed fixed placeholder (`"unknown"`) ships instead, also reducing per-machine session distinguishability. Real wiring needs a dedicated slice restructuring `ipc-stub.ts`/`server.ts` to defer identity binding — both already-merged, already-audited modules. | Director |
| **B-52** | `shared/ipc-contract.ts`'s `toolSuccessSchema`/`ipcErrorSchema` are not cross-validated against each other where `client/ipc-stub.ts` classifies a response by HTTP status alone. Not currently exploitable; a forward-compatibility defense-in-depth gap. | Director |
| **B-51** | `client/handshake.ts` reuses the 70s long-poll `IPC_REQUEST_TIMEOUT_MS` for its own `GET /identity`/`POST /session` calls, risking a ~140s worst-case hang on a stalled (not refused) daemon connection before reporting `DAEMON_DOWN`. Not a correctness bug. | Director |
| **B-50** | `daemon/ipc/routes.ts`'s `dispatchTool` forwards a caught tool-level error's message to the external caller with no defense-in-depth redaction pass. No concrete leak demonstrated. | Director |
| **B-49** | spec.md's "Binding never changes mid-session" scenario reads as freezing the whole binding; the shipped freeze is scoped to three identity fields only. Text-only fix at the next spec touch. | Director |
| **B-48** | Design §15's PT-24/PT-26 file pins look stale against the later `ipc/{handshake,sessions,routes}` split. Text-only fix at the next design touch. | Director |
| **B-47** | THREAT-MODEL traces the IPC `Host` check (DNS rebinding) only to the F3 panel and no PT pins the body cap; PR-29 ships both with tests. Text-only fix at the next THREAT-MODEL touch. | Director |
| **B-45** | The poller writes `TELEGRAM_RATE_LIMITED` to `offsets.last_error_code` (DATA-MODEL says `RATE_LIMITED`), audits no 429, and clears `retry_after_until` on every successful poll. The one open point with runtime effect. | Director → Kairo |
| **B-46** | Design §9 names the rate refusal `TELEGRAM_RATE_LIMITED`; the shipped tool code is `RATE_LIMITED`. Text-only amendment. | Director |
| **B-44** | A room-guard refusal inside a misbuilt transport degrades the send and raises `group_outage` instead of `WRONG_ROOM`. | Director |
| **B-43** | `serve/thread.ts:204` still tells the agent to run `agentbus_fetch`; `admission.ts`'s header points at a fixture that carries no hash. | Director → Kairo |
| **B-42** | SEAM `v1 body sha256` pins are not machine-checked (the v1 checkout is not in CI). | Director |
| **B-40 / B-41** | Design conditions with no contract (`poller_conflict`/`poller_rate_limited`; `secret_store_fallback`). | Director |
| B-39 | CI (and local runs) intermittently red on two wall-clock tests; re-run once and record. Did not reproduce in PR-23..PR-35. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| PR-11/12/13 escalations | SUGGESTION-class rows that survived their second rounds. Nothing blocks. | Director |
| carried (PR-06) | Digest blind spots (`MAX_THREAD_HISTORY` saturation); the fence does not neutralise `&`. | Director |
| **`bootstrap.ts` still doesn't wire the IPC server** | `createSessionRoutes`/`createIpcServer` exist and are fully tested but nothing in the daemon's actual boot sequence calls either yet. Not blocking so far, but a later PR must close this before the daemon is actually reachable over IPC in production. | a later PR |
| B-16 / D-10, B-11, B-12 / B-13 | Licence files and copyright line; trademark screening; macOS scope; migration runbook (PR-38 — note: this is `tasks.md`'s numeric PR-38 slot, unrelated to the merged GitHub PR #38 = this repo's own PR-34). | Director |
| B-05, B-08, B-09 | F0 spikes still open (B-08's client-side handshake half closed with PR-33; PR-35 closed the client-side surface entirely with the entry point itself). | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) — see its rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI (update to 2.1.0 available for the separate
  `engram` CLI — not yet applied, no functional impact observed), TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **977 tests** (976 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`) — see §4's `fs.watch`
  gotcha if any future code watches a directory under it. The Temp root also accumulates stray fixture directories
  from past sessions' test runs (harmless, none collide with a literal `conmuta.json` filename search — verified
  this session).
- Verification worktrees: `../telegram_bus_agent-worktrees/` — **empty** at the end of session 35 (`pr35-judges`
  and `pr35-verify` both removed cleanly via the junction-first procedure).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 70–130 s per leg).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it). PR-36 will read `src/config.ts:168-233` and `src/state.ts:252-439` from it directly.
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down**. Never quote or commit.
- The Engram MCP server (`plugin:engram:engram`) disconnected mid-session-35 (unrelated to this repo); the
  `engram` CLI fallback (§4) worked throughout and should be the default assumption going forward unless the MCP
  tools are confirmed reachable at session start.
