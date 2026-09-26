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

**Plan settled — check Arena Orion FIRST, before assuming Judgment Day.** The Director disclosed
mid-session-37 that Arena Orion (the debate arena, `http://127.0.0.1:8766/mcp`) is being brought back
up and asked that this slice and every one after it route through it once reachable, instead of the
Judgment Day substitute this project has used since PR-06. **Session 37 itself still audited under
Judgment Day**: a direct `curl --max-time 5 http://127.0.0.1:8766/mcp` returned connection-refused
(exit 7) when checked, and the Director confirmed the service had not been started yet at that point.
**Do not assume that is still true — check again, live, at the start of this session**, with the same
`curl` probe and/or `gentle-ai review status` (its MCP-server connection list will show `arena` as
either connected or `ECONNREFUSED`). If Arena responds: read
[`docs/01-constitution/GOVERNANCE.md`](../01-constitution/GOVERNANCE.md)'s debate/audit process fresh
before starting — that protocol has not been exercised in this project since early F1 and is not
re-derived in this file; do not improvise it from memory of Judgment Day's shape, they are not the
same protocol. If Arena is still down, everything in this file's §2 (the ODD + Judgment Day pipeline)
applies unchanged, exactly as it has for PR-06 through PR-37.

Session 37 merged **PR-37** (`src/migration/synthesize.ts` + `src/migration/main.ts` +
`src/cli/main.ts`'s `migrate-v1` dispatch) with both blind judges, a separate independent verifier, and
**one** of the two re-judgment rounds. **Unit 11 `v1-migration` continues; its closing slice is
PR-38.**

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-38 (`test/fixtures/v1-home/` +
`test/migration/integration.test.ts` + `docs/runbooks/migrate-from-v1.md`, cierra la unidad 11
`v1-migration`): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
Antes de nada, verifica si la Arena Orion (http://127.0.0.1:8766/mcp) responde: si sí, la auditoría
corre ahí (lee GOVERNANCE.md, ese protocolo no está resumido en el handoff); si no, cae de vuelta a
ODD + Judgment Day (ambos jueces + verificador independiente) exactamente como las últimas 12 sesiones.
Tienes autorización total del Director para decidir y ejecutar todo sin pedir confirmación, en esta
sesión y en todas las siguientes de este cambio, incluyendo el cierre y el mini-prompt para la próxima.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean**. The status command must print `nextRecommended: apply`,
`completed: 178`, `pending: 32` (of `210`), `blockedReasons: []`. Anything else: stop and report.
(`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count yourself with
`grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 178).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-37** (PR-37 merged as PR #41, `0a1725c`; candidate `a238680`, correction `1047f64`, re-judgment fix `9634ca2`). **Unit 10 `thin-client-tools` is CLOSED. Unit 11 `v1-migration` is OPEN — PR-36 and PR-37 done.** **Next slice: PR-38** — `test/fixtures/v1-home/` (placeholder `config.json`/`state.json`), `test/migration/integration.test.ts`, `docs/runbooks/migrate-from-v1.md`. This is unit 11's **closing** slice. Per `tasks.md`'s own PR-38 block (lines 1200-1209, re-read it yourself): requirements are `v1-migration › v1 files are backed up and never modified or deleted` (the FULL scenario this time — PR-36 covered only the read-side, PR-37's own writes are what this test now exercises end-to-end) and `v1-migration › The >24h cursor gap is stated, never silently absorbed`; the runtime harness is `conmuta migrate-v1` invoked as a **real child process** (not calling `runMigration` in-process like PR-37's own tests do) against the fixture, per design §15's "Integration" layer. Four sub-tasks: 38.1 RED (three scenarios: byte-identical originals, fixture migrates with a synthesized registry+secret entry, a stale >24h cursor carries forward without a false recovery claim), 38.2 GREEN (build the placeholder fixture files, PT-22 deny-list clean, run PR-37's CLI against them until 38.1 passes), 38.3 (write the runbook itself — deliverable of this whole SDD change, design §13's own list of what it must cover: the >24h gap, the one-poller rule, rollback steps, the backup keeps the token, null-anchor fail-closed, hand-editing the registry until F2), 38.4 Verify. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | `tasks.md` has **45 `####`-level PR headers total** (`grep -c '^#### PR-' tasks.md`), of which **40 header lines cover `PR-01`…`PR-37`** and **5 remain, naming `PR-38`…`PR-42`** — both directly counted, unambiguous. Separately, **43 distinct GitHub PRs have actually merged** through PR-37 (three headers — `PR-06`, `PR-08`, `PR-09` — were each re-sliced at apply time into two separately-merged PRs without a second header line; this discrepancy is already flagged unreconciled in `state.yaml`'s own PR-11 entry — do not force these two counting bases into one subtraction). **Checkboxes: 178 of 210**, always the cleanest single number to cite. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **178/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | Everything PR-01…PR-36 already shipped (see prior handoffs / `apply-progress.md` for the full inventory), plus **`src/migration/{synthesize,main}.ts` with twins** and the `src/cli/main.ts` `migrate-v1` dispatch. `src/migration/main.ts` is the first module in this codebase to write `~/.conmuta/registry.json` — no writer existed before it (validated via `registry/schema.ts`'s `parseRegistryDocument` before every write; a second migration into an existing registry merges rather than overwrites). **1041 tests** (1040 pass, 1 skip), `test:static` **8/8**. | PRs `#1`–`#41` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **26 entries, unchanged this session** (`synthesize.ts`/`main.ts` are new code, no v1 migration tool exists to vendor from — confirmed by the PR-37 mapper via a grep of the sibling `telegram-agent-bus` repo). **PR-38 needs no new pin either** (fixture files, a test, and a doc — no new `src/` code). | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-37**, one record each in the tribunal index. PR-23..PR-37: Judgment Day with **both judges** + independent verifier, all **APPROVED**. PR-32 through **PR-37 each used only one of the two re-judgment rounds** — a residual narrow enough each time to correct without spending the second. **PR-37's own round 1 found 4 CRITICAL** (a real jump from PR-32..PR-36's mostly-clean run) — two independently converged (missing try/catch, the same defect class PR-35 already fixed once in a different file), plus two more Judge B found alone and the parent verified directly from the code before trusting them. See §6 for what each slice's rounds found. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**0. Arena-first routing (new as of session 37, supersedes nothing below — it is a gate IN FRONT of
everything else).** Check Arena reachability live at session start (§0). If reachable: the audit route
for this slice is Arena tribunal debate, not Judgment Day — read `GOVERNANCE.md`'s debate process
before acting on it, since this file does not carry that protocol's steps. If Arena is still down: fall
through to point 1 below, unchanged from every session since PR-06.

**1. Workflow (Judgment Day fallback): ODD, with every substantive SDD contract preserved.** `sdd-apply`
dispatch is refused before the child launches (`SDD preflight cancelled or invalid; no session consent
recorded`) — a host-owned gate an agent cannot satisfy. So: ODD is the route; the slice honours the same
design rows, the same `tasks.md` sub-tasks, Strict TDD (red before green, twins), the pinned hashes and
provenance fixture, the 400-line budget with disclosed exceptions, and a tribunal-grade audit; the
orchestrator owns the SDD bookkeeping and discloses that no `sdd-apply` envelope exists. One variant: if
a human has already run `/gentle:sdd-preflight` in the TUI, or the Director asks, the slice may run
through `sdd-apply`. Another variant, now live: if Arena is reachable, point 0 above overrides this
whole section.

**2. The per-slice pipeline sessions 27–37 ran — repeat it exactly if still on the Judgment Day
fallback. Session 37 is the twelfth consecutive session on this identical route, and it is the one that
found the most CRITICAL findings since PR-13 — the discipline paid for itself.**
1. **Map** once (delegated `Explore`, read-only): v1 range (if any — PR-38 has none, it is fixtures +
   test + doc, not `src/`), consumed APIs with verbatim signatures, spec, design, the tasks block, and
   every contradiction between them. For PR-38, pin down exactly: (a) design §15's "Integration" layer
   description in full (this file's own §1 only paraphrases it — read the actual text); (b) whether
   `test/migration/integration.test.ts` needs to spawn `node dist/src/cli/main.js migrate-v1 ...` as a
   real child process (per the runtime-harness note) or can call `runMigration`/`runCli` in-process —
   the note says "real child process," confirm this is load-bearing and not just descriptive; (c) the
   exact placeholder fixture shape PT-22's repo-scan deny-list requires (grep `repo-scan.test.ts`'s
   token-shape regex and PT-22's own conventions used by every other fixture in this repo, e.g. the
   7-digit synthetic bot-id convention already established); (d) what "stale cursor carries forward
   without a false recovery claim" needs to assert exactly — read `BOT_API_RETENTION_HOURS`'s existing
   consumers (`daemon/serve/fetch.ts`, `daemon/serve/status.ts`) for the vocabulary this test should
   reuse, since migration has never referenced this constant before; (e) the runbook's required content
   list verbatim from design §13's own "Runbook" paragraph (do not paraphrase from this file — read it).
2. **Decide** the open design points yourself (the Director delegated them) and write them into the
   writer's brief; each decision is stated in the module doc (or the runbook itself, for PR-38) and in
   `apply-progress.md`, and a `tasks.md` *apply-time note* records the decisions and any edit outside the
   block's Scope line.
3. **Write** (delegated `general-purpose`, sonnet): the fixture files, the integration test, and the
   runbook. The writer does not commit. **Insist on RED first** and ask for the verbatim RED lines. Note
   PR-38 has no `src/` change, so its "RED" is a failing integration test against not-yet-existing
   fixture files, not a compile error.
4. **Parent readback** before freezing — it has found a real, non-cosmetic defect in most slices since
   session 28 (PR-37's own readback found a genuine crash-consistency bug: the writer had put the
   registry write before the ledger write, but the idempotency check reads the registry alone and every
   ledger writer is an upsert, so a crash between them would leave a permanently half-migrated ledger no
   retry would ever complete — reordered to write the ledger first). **Generalizable rule from that
   fix, worth applying anywhere a similar shape appears**: when an idempotency/retry check reads exactly
   one artifact to decide "already done," that artifact must be the LAST thing written among a set of
   otherwise-independent side effects, and everything written before it must be independently safe to
   redo. **A second generalizable rule, confirmed again in PR-37 (a defect class PR-35 already fixed
   once, in a different file)**: any new testable entry-point function (an exported async function
   taking an options object, mirroring `client/main.ts`'s `runMcpClient` shape) needs its own top-level
   try/catch converting an unexpected exception to `err.message` only (never `.stack`) before it is
   considered done — check this explicitly for any new entry point PR-38 or later introduces, do not
   wait for a judge to find it a third time.
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only
   control that MUST survive, BUILD-FAIL and TIMEOUT reported apart. Delegate the actual sweep-running to
   a `fork` once the harness and mutant list are written — confirmed working well again in PR-37 (18
   mutants across three files, closed two real gaps, correctly disclosed two accepted survivors without
   forcing a test where fault-injection would be needed instead). A survivor is a test gap → pin it; an
   **equivalent** mutant is argued in the record, not pinned — re-derive the equivalence by tracing BOTH
   the exit code AND every side effect, not just the return value.
6. **Run the FULL test suite before freezing, not just the new/touched test files.** `git add -N` the
   specific new files (never `git add -N .`) before running the full suite or `test:static`.
7. **Judgment Day** (only if Arena is still down, per point 0): frozen worktree, `jd-judge-a` +
   `jd-judge-b` in parallel, result shape `{findings, evidence}`. In parallel, a **separate independent
   verifier** (`general-purpose`) on its own worktree with a mandate to reproduce every figure, re-run
   the sweeps, write up to six extra mutants and **probe the running code**. **The judges have no
   Bash**: they check figures by reading and arithmetic only; the verifier is the one that re-measures.
   **A judge that explicitly CONSIDERS an issue and declines to report it is giving you real signal
   too, not silence — PR-37 extended this to a genuine disagreement about WHICH PR a shared defect
   belongs to** (Judge A found the same unchecked-ledger-quarantine pattern already in already-merged
   `daemon/bootstrap.ts` and treated it as pre-existing, not PR-37-specific; Judge B rated the
   migration-specific instance CRITICAL; the parent fixed the migration instance and filed **B-54** for
   `bootstrap.ts` separately — both judges were right about their own scope).
8. Reproduce single-judge rows before correcting yourself, directly from the code, when the finding is a
   pure logic error you can verify by reading (PR-37's parent did this for two of Judge B's three
   single-judge CRITICALs before the correction round even started); correct (parent inline for small
   batches, or a scoped `jd-fix-agent` delegation for a larger confirmed batch — PR-37 used a
   `jd-fix-agent` delegation for 10 confirmed findings in one batch, then read the delegate's diff back
   itself before re-sending to the judges); commit code and record together; scoped re-judgment over the
   delta only. **A scoped re-judgment round is MANDATORY before any APPROVED verdict.** **Budget: two
   re-judgments.** PR-37 used only **one**: its single re-judgment finding (Judge B: the date-scoping fix
   had decoupled the backup-exists check from the printed date, so a later-day re-run's success message
   claimed today's date as the actual migration date) was narrow and well-understood, extending PR-32
   through PR-36's established "a single-judge WARNING-tier residual doesn't need the second round"
   judgment call to a slice with 4 round-1 CRITICALs — the pattern holds regardless of round-1 severity,
   only round-2 severity matters for this call.
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude
   Code line); `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Get the untracked inventory with `gentle-ai review status --cwd . --contract
gentle-ai.review-integration/v2 --agent claude-code --next-transition` (field `eligible_untracked_inventory`), then run
`gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha> --committed-only --untracked-scope=exclude
--expected-untracked-inventory=<that sha256:…> --json` and record tier and `review_due`. **Do not START the native review
for a Judgment Day target**: the installed `judgment-day` skill states it replaces ordinary 4R and both must never run on
one target, and START's consent envelope belongs to the Director. Record that in the slice's audit row. If Arena is the
route instead (point 0), this section may not apply the same way — check whether the Arena debate protocol itself already
subsumes native review before assuming this section's steps still apply unchanged.

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those. Do not
invent a Docs task where none is warranted — but PR-38 genuinely DOES have a Docs deliverable (`docs/runbooks/migrate-from-v1.md`,
task 38.3), unlike PR-36/PR-37 which had none; do not skip it by pattern-matching the prior two slices.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip
and labelled with it, **counted as additions+deletions per file**. PR-35 679 (429-line exception), PR-36 931 (531-line
exception), **PR-37 1,970 at its final tip (1,580-line PR-scoped exception — the largest of the last six slices, driven
by comprehensive refusal-kind coverage across four new CRITICAL-fix code paths plus two full correction rounds)**. PR-38's
own estimate is ≈290 lines with no exception stated — a fixture+test+doc slice with no new `src/` code, so it may actually
land near its estimate for once; measure anyway, do not assume. Add a *Size reconciliation* note under the block's header
in `tasks.md`, and **update it again if a later correction round changes the final tip.**

**6. Frozen worktrees — the junction rule.** `git worktree add --detach ../telegram_bus_agent-worktrees/<name> <sha>`.
Only the verifier's worktree needs `node_modules`: create the junction with PowerShell `New-Item -ItemType Junction
-Path '<win path>\node_modules' -Target '<main win path>\node_modules'`. **To remove: delete the junction first with
PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`, verify it is gone and that
`node_modules/typescript/lib/tsc.js` still exists in the main checkout, and only then `git worktree remove --force`.**
For a re-judgment round, moving the judges' worktree in place via `git checkout <sha>` (rather than recreating it) is
cheaper and equally correct when only the judges' worktree, not the verifier's, is needed again.

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

**8. Waiting on a background agent: never poll.** `ScheduleWakeup` is for `/loop` dynamic-mode sessions only. This
mistake did NOT recur in session 37 (the first clean session on this front since it started being tracked around
session 32) — worth confirming it stays clean rather than declaring the pattern over after one good session.

**9. New this session: chained `&&` Bash commands under the harness's own `run_in_background` can hang on this
machine even when the identical command succeeds instantly in the foreground.** `rm -rf dist && npm run build && npm
test && npm run test:static`, backgrounded, printed the build's success output and then produced nothing further for
several minutes; the identical command run in the foreground (or split into separate `npm run build`, then `npm test`,
then `npm run test:static` calls) completed in under 10 seconds each, both before and after the hang, with matching
results. Diagnosed as an environment quirk (likely stdio handling specific to backgrounding a `&&`-chain on this
machine), not a code defect. **If a backgrounded multi-step verification command goes silent after an early step
succeeds, suspect this hang rather than waiting it out — stop it with `TaskStop` and re-run in the foreground, or
split into separate un-chained backgrounded calls.**

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
| `src/migration/v1-config.ts` | `src/config.ts:168-233` | SEAM | `3b7ac64c25a62622589f9ad47b1cfc7a827f226d6aa5c67a3bdfd2403ee319e8` |
| `src/migration/v1-state.ts` | `src/state.ts:252-439` | SEAM | `b69550f0e09c9d201384b84b1305734117e3199c0c98a2121a2797cf4035bac1` |

**`src/migration/synthesize.ts` and `src/migration/main.ts` (PR-37) are confirmed new code, no `Provenance:` header**:
v1 (`telegram-agent-bus`) has no standalone migration tool at all — grepped and confirmed by the PR-37 mapper. Same
treatment as `client/main.ts`, `secret-store/keyring.ts`, `ledger/open.ts`. **PR-38 needs no new pin either** — it adds
a placeholder fixture, a test, and a runbook, no new `src/` code. Older pins are in `apply-progress.md` and in each
module's header. SEAM pins are **not machine-checked** by `provenance.test.ts` (B-42).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **A crash-consistency ordering rule, generalizable beyond PR-37** | When an idempotency/retry check reads exactly ONE artifact to decide "already done," that artifact must be written LAST among the side effects, and everything written before it must be independently safe to redo (an upsert, or otherwise idempotent). PR-37's own bug: the registry write came before the ledger write, but the idempotency check reads only the registry — a crash in the gap would leave a permanently half-migrated ledger no retry could ever complete. Fixed by writing the ledger first. | `src/migration/main.ts` |
| **Any new testable entry-point function needs a top-level try/catch — this is now a two-time-confirmed defect class, not a one-off** | `client/main.ts`'s `runMcpClient` (PR-35) and `migration/main.ts`'s `runMigration` (PR-37) both shipped without one and both were caught by Judgment Day. The pattern: `err(caughtError instanceof Error ? caughtError.message : String(caughtError)); return {exitCode: 1}` (or the module's own generic-failure exit code) — message only, never `.stack`. Check this proactively for any new entry point, do not wait for a third instance. | `client/main.ts`, `migration/main.ts` |
| **A judge that finds a pattern already exists in already-merged code, and declines to report it as THIS PR's defect, may still be reportable by the OTHER judge for the same PR** | PR-37: Judge A found the unchecked-ledger-quarantine pattern already in `daemon/bootstrap.ts` (pre-existing) and declined; Judge B rated the migration-specific instance CRITICAL. Both were right — the parent fixed the instance in scope and filed a backlog row (B-54) for the shared pattern elsewhere, rather than picking one judge's severity over the other's. | PR-37 tribunal record |
| **Always run the FULL test suite before freezing a candidate, not just the writer's own narrower verify command** | Confirmed across PR-32 and PR-36; PR-37 did this correctly from the start. | sessions 32-37 |
| **Delegating the parent's own mutant sweep to a `fork` continues to work well for larger sweeps** | PR-37's own 18-mutant, three-file sweep, delegated to a fork, closed two real gaps and correctly disclosed two accepted survivors without forcing an unnecessary test. | PR-36, PR-37 |
| **A parent's own record prose needs the same distrust as a subagent's — confirmed yet again in PR-37** | The parent measured PR-37's authored-line total (1,531) BEFORE the mutant-sweep fork's own later test additions landed, then never re-measured before writing it into a tribunal draft — the independent verifier caught it (actual: 1,565 at that tip). **Rule, restated once more**: re-measure any stated figure from the CURRENT tip immediately before writing it down, every time, especially after any subagent's own follow-up edit you did not personally re-diff. | PR-31 through PR-37 records |
| **Chained `&&` Bash commands under the harness's own background-task mechanism can hang on this machine** | `rm -rf dist && npm run build && npm test && npm run test:static`, backgrounded, hung after the build step with zero further output; the identical command succeeded instantly in the foreground both before and after. Not a code defect — an environment quirk. Prefer foreground for multi-step verification chains, or split into separate un-chained backgrounded calls. | session 37, this file's own §2 point 9 |
| **`os.tmpdir()`'s ancestor chain can contain OTHER stray fixture-shaped files/dirs from prior sessions' test runs** | None collide with a literal filename search — verified across multiple sessions. | this machine's `%TEMP%` |
| **`shared/ipc-contract.ts`'s `toolSuccessSchema`/`ipcErrorSchema` have no cross-validation at the point a caller classifies a response** | Deferred as **B-52**. | **B-52** |
| **`daemon/bootstrap.ts`'s `openLedger(...)` call site never checks for a quarantined result either** | The same pattern PR-37's Judgment Day found and fixed in `migration/main.ts`. Deferred as **B-54** — an already-merged file, out of scope for a drive-by fix. | **B-54** |
| **`fetch` cannot set a custom `Host` header — confirmed empirically, not just documented** | Node's `fetch` (undici) silently ignores any explicit `host` header value. Use `node:http` or a raw socket if you ever need to test a mismatched Host header. | PR-33 record |
| **Promise memoization for a shared in-flight async attempt: cache the PROMISE, not the resolved value** | General pattern from PR-34. | `src/client/ipc-stub.ts` |
| **`parseProjectFile` already exists — do not reimplement `conmuta.json` parsing** | `src/shared/project-file.ts` exports `parseProjectFile(text: string): ProjectFileResult`. | `src/shared/project-file.ts` |
| **`computeRosterHash` already exists — do not reimplement the roster fingerprint** | `src/shared/roster-hash.ts` exports `computeRosterHash(roster: readonly RosterHashInput[]): string`. | `src/shared/roster-hash.ts` |
| **`loadV1Config`/`loadV1State` already exist — do not reimplement v1 config/state parsing** | `src/migration/v1-config.ts` exports `loadV1Config(homeDir): V1ConfigResult` and `resolveV1AgentBusHome(env?): string`; `src/migration/v1-state.ts` exports `loadV1State(homeDir, roster?): V1StateResult`. | `src/migration/{v1-config,v1-state}.ts` |
| **`synthesizeMigration`/`runMigration` already exist — PR-38 calls them, it does not reimplement them** | `src/migration/synthesize.ts` exports `synthesizeMigration(input): SynthesizedMigration` (pure). `src/migration/main.ts` exports `runMigration(options): Promise<{exitCode: number}>` — the full CLI orchestrator; every collaborator is injectable for testing, but PR-38's own integration test is explicitly required to invoke it as a REAL CHILD PROCESS (`conmuta migrate-v1`), not call `runMigration` in-process the way PR-37's own unit tests do. | `src/migration/{synthesize,main}.ts` |
| **The v2 registry file (`~/.conmuta/registry.json`) is validated before every write, and a second migration into an existing one MERGES rather than overwrites** | `mergeRegistry` in `migration/main.ts` dedupes `groups[]`/`projects[]` by id (existing entry wins on collision); `bots[]`/`bindings[]` rely on the upstream `alreadyRegistered` check instead. | `src/migration/main.ts` |
| **`resolveProjectBinding` never throws — every walk-up failure is a typed refusal, including an unreadable path** | `src/client/binding.ts`, five `BindingRefusal` kinds. | `src/client/binding.ts` |
| **`IPC_REQUEST_TIMEOUT_MS` (70s) is reused for both the handshake and every tool call — disclosed, deferred as B-51** | Not a correctness bug. | **B-51** |
| **Windows `fs.watch()` crashes natively on an 8.3 short path** | `realpathSync.native(dirPath)` before `watch()`. | `src/client/run-state.ts`'s `waitForRunFile` |
| **`state.yaml` is YAML with several enormous single-line string fields** | `completed_slices` and `tribunal_state` are both continuously-growing double-quoted YAML strings — extract/append with a small **`.cjs`** Node script (this package is `"type": "module"`; a bare `.js` script using `require` fails — name it `.cjs` or use `import`/`export`) that finds the field by its known 0-based line index and splices text in before the closing quote, rather than `grep`/`sed`/the Edit tool. **Never introduce an unescaped `"` inside the appended text** (avoid apostrophes/possessives too — use "its own"/"X own Y" instead of "X's Y" defensively). Re-run `gentle-ai sdd-status` after editing to confirm the file still parses. | sessions 28–37 |
| **Sweep harness needs bounds** | `node --test --test-timeout=5000` and `spawnSync(..., {timeout: 150000, shell: false})`. Report `KILLED(TIMEOUT)` apart — PR-37's own sweep hit a genuine `KILLED(TIMEOUT)` for a mutant that made a test attempt a real unmocked stdin read, correctly classified as a kill, not a harness fault. | sessions 29–37 |
| **`git add -N` — scope it, never `.`** | Always name the specific new files. | sessions 30–37 |
| **A writer's RED is usually compile-level** (`TS2305`/`TS2307`/`TS2339`) for a `src/` change; for a fixtures/test/doc-only slice like PR-38, RED is a failing assertion against not-yet-existing fixture files instead | The behavioural RED is still the parent's own: readback fixes and sweep survivors, each pinned by a test that fails without the fix. | sessions 27–37 |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; builds via `node_modules/typescript/lib/tsc.js -b` directly. Lives in the untracked `odd/` tree (deleted at close): recreate it each session (≈75 lines). **Use a runtime-opaque disabled-branch condition (e.g. `Date.now() < 0`), never a literal `false`.** Delegate the actual sweep-running to a `fork` once the harness and mutant lists are written. | sessions 28–37 |
| **The AS-IS transports lose error detail** | `GroupTransport`/`DualWriteTransport`. | PR-27, PR-28, PR-31 |
| **`offsets.retry_after_until` is shared** | Per `bot_id`; the poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring. | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | Do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **A shared "must never both be true" property is best enforced by ONE function** | `withRetryAfterIfRetryable(payload, retryAfterS)` (PR-31) is the shape to reach for. | `src/daemon/ipc/routes.ts` |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId`. Extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status`. | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key> --scope <s>`. Write the content to a plain text file first and pass it via `"$(cat file)"` rather than inlining a long string directly in the shell command. | sessions 27–37 |
| **Subagents were available all of sessions 27–37** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits; PR bodies end with the Claude Code line. Write long messages via a heredoc passed to `git commit -F -` or directly to `-m` with a heredoc — both worked fine in session 37. | sessions 27–37 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header, opt-in per file** | A file with no `Provenance:` line is invisible to this test entirely. | `test/security/provenance.test.ts`, **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files before `test:static` AND before the full suite (`npm test`). | PR-32, PR-36 |
| **PT-22's token shape** | Synthetic bot ids use seven digits; no fixture may match `\d{8,10}:[A-Za-z0-9_-]{35}`. **Directly relevant to PR-38's own fixture** (`test/fixtures/v1-home/`). | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means no limit; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines can fail to parse or truncate silently** | Write files with the file tools, Python, or a small Node script; for appending to an existing large file, prefer Read + Edit over a heredoc `cat >>`. | sessions 13–37 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–37 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run. Did not reproduce in PR-23..PR-37 (every leg green on the first attempt across fifteen consecutive slices). | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |
| **The global `~/.claude/CLAUDE.md` is a managed, lazy-loadable file — do not assume it's monolithic** | Not relevant to this project's own code. | session 33, out-of-repo |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 178/210. **Check Arena Orion reachability live** (`curl` or `gentle-ai
   review status`'s MCP connection list) before assuming the route — this is new as of session 37 and
   is the single most load-bearing check in this file right now. Read
   [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4 (all flags — they are load-bearing,
   not optional colour), `tasks.md`'s **PR-38 block** (lines 1200-1209), and design.md's §13 "Runbook"
   paragraph and §15 "Integration" row in full (do not rely on this file's own §1/§2 paraphrases).
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram
   mirror `odd/<feature>/tasks`, before the first write.
3. **Branch** `f1/38-migration-fixture-runbook` from `main`, then run the applicable pipeline (Arena
   debate if reachable, §2's Judgment Day fallback otherwise):
   - **Decide first, before any code**: the exact placeholder identifiers for the v1-home fixture
     (PT-22-clean, matching this repo's established synthetic-id conventions); whether the integration
     test spawns a real child process via `node dist/src/cli/main.js migrate-v1 ...` or some other
     real-process invocation design §15 actually requires; how "stale cursor carries forward without a
     false recovery claim" is asserted concretely (what output or state proves "no recovery claim" was
     made).
   - **38.1 RED**, **38.2 GREEN**, **38.3 runbook**, **38.4 Verify** (read `tasks.md`'s actual sub-task
     text directly, this file does not paraphrase it exactly).
4. Audit per §2 (Arena or Judgment Day, whichever applies); merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s
   status line, `state.yaml` (BOTH `completed_slices` AND `tribunal_state` plus `next_recommended`;
   check with `gentle-ai sdd-status`), `docs/00-INDEX.md`'s backlog board row 10, and
   `docs/05-tribunal/INDEX.md`, delete `odd/`, save the session summary to Engram (CLI fallback if the
   MCP server is disconnected), commit on `main`, push, and hand the Director a ≤3-line mini-prompt.
   **Unit 11 `v1-migration` CLOSES with this slice** — say so explicitly in every one of those documents,
   not just in `tasks.md`.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text.
- **PR-01…PR-37 are complete; do not re-slice, re-audit or re-open them.** Units 4–10 are closed; unit 11
  `v1-migration` is open, PR-36 and PR-37 both done, PR-38 closes it. A defect in a merged module is its own slice
  with its own audit, not a drive-by edit (B-43, B-44, B-45, B-48, B-49, B-50, B-51, B-52, B-53, B-54 wait for such
  slices).
- **Settled in session 37 and recorded**: `src/migration/synthesize.ts` owns `synthesizeMigration(input):
  SynthesizedMigration` — pure, no I/O, project-assignment input optional (D-23). `src/migration/main.ts` owns
  `runMigration(options): Promise<RunMigrationResult>` — the full non-interactive orchestrator, wrapped in a
  top-level try/catch (Judgment Day CRITICAL fix), backup-existence checked by prefix-matching ANY dated backup
  (not just today's — a second Judgment Day CRITICAL fix), a newly-requested project on an already-migrated bot
  refused honestly rather than silently dropped (a third), a quarantined v2 ledger detected and refused rather than
  silently written into (a fourth — the migration-specific instance only; `daemon/bootstrap.ts`'s identical pattern
  is **B-54**, a separate future slice). Real writes happen backups → secret-store token → ledger → registry LAST
  (deliberately, for crash-consistency — see §4's first row). `mergeRegistry` dedupes `groups[]`/`projects[]` by id,
  existing entry wins on collision. `~/.conmuta/registry.json` is this codebase's first writer of that file; validated
  before every write. No `Provenance:` header on either new file (confirmed no v1 migration tool exists).
  `src/cli/main.ts` gained a `migrate-v1` dispatch branch mirroring the existing `mcp`/`daemon stop` dispatch exactly,
  including the Node-floor gate running before any flag parsing.
- **Settled in session 36**: `src/migration/v1-config.ts` owns `loadV1Config(homeDir): V1ConfigResult` and
  `resolveV1AgentBusHome(env?): string`. `src/migration/v1-state.ts` owns `loadV1State(homeDir, roster?):
  V1StateResult`; the quarantine-rename branch is a hard error here, never a write. `to_user_id` gains an OPTIONAL
  roster-backed backfill. Output types stay v1-native, deliberately NOT reshaped into `shared/thread-record.ts`'s
  `ThreadRecord` — PR-37's `synthesize.ts` did that conversion. `STATE_VERSION` is a LOCAL constant in `v1-state.ts`.
  New leaf compile unit `src/migration/tsconfig.json` (PR-37 later added `../registry`, `../secret-store`, `../ledger`,
  `../daemon` references to it).
- **Settled in session 35**: `src/client/main.ts` owns the thin MCP client's process entry point — `runMcpClient`.
  `src/cli/main.ts` owns the process entry and all argv parsing for `mcp`.
- **Settled in session 34**: `src/client/ipc-stub.ts` owns `IpcSession`/`createIpcSession`, session-lifetime-cached.
  `client/errors.ts` owns `clientErrorPayload`. `client/server.ts` owns `createServer(deps)`.
- **Settled in session 33**: `src/client/binding.ts` owns `resolveProjectBinding` — five refusal kinds.
  `src/client/handshake.ts` owns `performHandshake`.
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
- `test:wrong-room` executes 0 tests and exits 0 until PR-41's numeric slot wires the job (unrelated to the merged
  GitHub PR #41, which is this repo's own PR-37).
- **The general lesson from PR-31's own two re-judgment rounds**: when a fix addresses "field A and field B must
  never both be true," check every place both fields can be produced, not just the one call site a finding named.
- **The general lesson from PR-32's own re-judgment round**: a disclosure comment's comparison to another file's
  test coverage is a factual claim, not decoration.
- **The general lesson from PR-33's own audit**: a module's own doc comment is a claim about the code, worth
  cross-reading against the code and the design doc, not trusted just because it's already written down.
- **The general lesson from PR-34's own audit**: a design decision the ORCHESTRATOR itself makes needs the same
  adversarial scrutiny as any other claim.
- **The general lesson from PR-35's own audit**: the same lesson as PR-34's, on a data-model field's semantics.
  Also: an "equivalent mutant" argument must check every observable side effect, not just the return value.
- **The general lesson from PR-36's own audit**: a parent's own record-keeping prose is exactly as fallible as a
  subagent's. Also: running the FULL test suite before freezing catches integration-level gaps isolated runs cannot.
- **The general lesson from PR-37's own audit**: (1) an idempotency check's target artifact must be the LAST thing
  written among otherwise-independent side effects, or a crash mid-sequence produces a permanently half-done state
  no retry recovers; (2) a missing top-level try/catch on a new entry-point function is now a repeat defect class
  (PR-35, PR-37) — check for it proactively; (3) two judges can legitimately disagree about WHICH PR a shared,
  pre-existing-pattern defect belongs to without either being wrong — resolve by fixing the in-scope instance and
  filing a backlog row for the rest, not by picking a side; (4) the parent's own stale-figure mistake (measuring a
  size total before a subagent's later edit, then never re-measuring) recurred yet again — confirmed the "re-measure
  immediately before writing" rule needs to survive past a subagent's own follow-up work, not just the writer's
  original delivery.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-54** | `daemon/bootstrap.ts`'s own `openLedger(...)` call site has the same unchecked-quarantine-status gap Judgment Day found and fixed in `migration/main.ts` (session 37). Judge A found and disclosed the shared pattern in already-merged code; Judge B rated the migration-specific instance CRITICAL. Fixed in `migration/main.ts`; this row is for `bootstrap.ts`'s identical pattern, a dedicated slice away. | Director |
| **B-53** | `client/main.ts`'s `runMcpClient` cannot supply the real MCP host-application label because `IpcSession` must be constructed before `server.connect()`'s `initialize` exchange reveals it. A disclosed fixed placeholder ships instead. | Director |
| **B-52** | `shared/ipc-contract.ts`'s `toolSuccessSchema`/`ipcErrorSchema` are not cross-validated against each other where `client/ipc-stub.ts` classifies a response by HTTP status alone. Not currently exploitable. | Director |
| **B-51** | `client/handshake.ts` reuses the 70s long-poll `IPC_REQUEST_TIMEOUT_MS` for its own `GET /identity`/`POST /session` calls, risking a ~140s worst-case hang. Not a correctness bug. | Director |
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
| B-39 | CI (and local runs) intermittently red on two wall-clock tests; re-run once and record. Did not reproduce in PR-23..PR-37. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| PR-11/12/13 escalations | SUGGESTION-class rows that survived their second rounds. Nothing blocks. | Director |
| carried (PR-06) | Digest blind spots (`MAX_THREAD_HISTORY` saturation); the fence does not neutralise `&`. | Director |
| **`bootstrap.ts` still doesn't wire the IPC server** | `createSessionRoutes`/`createIpcServer` exist and are fully tested but nothing in the daemon's actual boot sequence calls either yet. | a later PR |
| B-16 / D-10, B-11, B-12 / B-13 | Licence files and copyright line; trademark screening; macOS scope; migration runbook (**PR-38 delivers this now** — `docs/runbooks/migrate-from-v1.md`, task 38.3; note this is `tasks.md`'s numeric PR-38 slot, unrelated to the merged GitHub PR #38 = this repo's own PR-34). | Director |
| B-05, B-08, B-09 | F0 spikes still open (B-08's client-side handshake half closed with PR-33; PR-35 closed the client-side surface entirely). | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) — see its rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI (update to 2.1.0 available for the separate
  `engram` CLI — not yet applied, no functional impact observed), TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **1041 tests** (1040 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`) — see §4's `fs.watch`
  gotcha if any future code watches a directory under it.
- Verification worktrees: `../telegram_bus_agent-worktrees/` — **empty** at the end of session 37.
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 70–90 s per leg in session 37).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it). PR-38 needs no further v1 source reads — it is fixtures + test + doc against PR-37's
  already-shipped CLI.
- **Arena bridge status is now UNCERTAIN, not simply "down" — check live at the start of every session from here
  on.** `.mcp.json` points at `http://127.0.0.1:8766/mcp`. Confirmed down (connection refused) at the start of
  session 37; the Director stated intent to bring it up but had not started it yet by session's end. Never quote or
  commit `.mcp.json`'s contents.
- The Engram MCP server (`plugin:engram:engram`) was reachable at the start of session 37; the `mem_save` tool
  itself still refused with "multiple active runtime sessions" on the first call (a known, long-standing condition,
  not a new disconnection) — the `engram` CLI fallback handled it without issue, as it has every session since 27.
