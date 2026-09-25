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
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. Session 36
merged **PR-36** (`src/migration/v1-config.ts` + `src/migration/v1-state.ts`, read-only SEAM readers of
v1's `config.json`/`state.json`) with both blind judges, a separate independent verifier, and **one** of
the two re-judgment rounds — the route §2 describes is the one that produced it. **Unit 11
`v1-migration` is now OPEN, its first slice (PR-36) done.** Next slice: **PR-37**.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-37 (`src/migration/synthesize.ts` +
`src/migration/main.ts` + `src/cli/main.ts`'s `migrate-v1` dispatch, unit 11 `v1-migration` continues):
lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + Judgment Day con ambos jueces +
verificador independiente); la Arena no está disponible, así que nada depende de un debate ni de la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** (session 36 deleted its `odd/` tree). The status command must print
`nextRecommended: apply`, `completed: 174`, `pending: 36` (of `210`), `blockedReasons: []`. Anything else:
stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count
yourself with `grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 174).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-36** (PR-36 merged as PR #40, `677e4cb`; candidate `72c9cfb`, correction `40a7ad4`, re-judgment fix `d98d461`). **Unit 10 `thin-client-tools` is CLOSED. Unit 11 `v1-migration` is OPEN — its first slice (PR-36) is done.** **Next slice: PR-37** — `src/migration/synthesize.ts` + `src/migration/main.ts` + `src/cli/main.ts`'s `migrate-v1` dispatch. Per `tasks.md`'s own PR-37 block (re-read it yourself, do not trust this paraphrase): scope names `synthesize.ts`, `main.ts`, the `cli/main.ts` dispatch addition, and their two test twins; requirements are `v1-migration › Migration synthesizes the registry, secret-store entry and ledger rows` (env-only-refused scenario, D-24) and `v1-migration › Minimal non-interactive migration entry point`; the runtime harness note says the full end-to-end fixture run is deferred to PR-38, so PR-37 unit-tests synthesis and CLI parsing in isolation. **Unresolved by this handoff, confirm at Map time**: whether `synthesize.ts` has its own v1 SEAM citation (no such citation was visible in the tasks.md excerpt this session's mapper quoted — read design.md §13's full migration-flow step list yourself, not just the steps 1/4/5 this file's own §3 paraphrases, since steps 2/3/6+ were never independently confirmed this session) and what exactly D-24's "env-only-refused scenario" requires. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | `tasks.md` has **45 `####`-level PR headers total** (`grep -c '^#### PR-' tasks.md`), of which **39 header lines cover `PR-01`…`PR-36`** and **6 remain, naming `PR-37`…`PR-42`** — both directly counted, unambiguous. Separately, **42 distinct GitHub PRs have actually merged** through PR-36 (three headers — `PR-06`, `PR-08`, `PR-09` — were each re-sliced at apply time into two separately-merged PRs without a second header line, so the "merged" count is higher than the "header lines covered" count — this is the same discrepancy `state.yaml`'s own PR-11 entry already flagged as not fully reconciled; do not force these two counting bases into one subtraction). **Checkboxes: 174 of 210**, always the cleanest single number to cite. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **174/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | `src/shared/*` (15 modules with twins), `src/cli/*`, `src/registry/*`, `src/ledger/*` (11), `src/secret-store/*` (5), `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts`, `src/daemon/lifecycle/*` (4), `src/daemon/transport/*` (5), `src/daemon/serve/*` (3), `src/daemon/send/*` (3), `src/daemon/ipc/{server,handshake,sessions,routes}.ts`, all with twins, `src/client/{spawn,run-state,binding,handshake,ipc-stub,errors,server,main}.ts` with twins, and now **`src/migration/{v1-config,v1-state}.ts` with twins plus `src/migration/tsconfig.json`** (a new leaf compile unit, `references: [{"path": "../shared"}]` only) — two strictly read-only readers of v1's `config.json`/`state.json`; the former quarantine-rename branch is now a typed hard-error refusal, never a write. **1002 tests** (1001 pass, 1 skip), `test:static` **8/8**. | PRs `#1`–`#40` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **26 entries** (grew by 2 this session: `src/migration/v1-config.ts` ← `telegram-agent-bus/src/config.ts:168-233`, `src/migration/v1-state.ts` ← `telegram-agent-bus/src/state.ts:252-439`, both `verdict: SEAM`, both hashes independently reproduced twice — parent and the mapper, matching). **PR-37 may or may not need a new pin** — confirm at Map time per §1's Phase row above. | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-36**, one record each in the tribunal index. PR-23..PR-36: Judgment Day with **both judges** + independent verifier, all **APPROVED** (`bus-v2-f1-pr-2{3..9}-audit-001`, `bus-v2-f1-pr-30-audit-001` through `bus-v2-f1-pr-36-audit-001`). PR-22a/22b: inline passes (the judges were down then). PR-29, PR-30, PR-31 used **both** re-judgment rounds; PR-32 through **PR-36 each used only one** — in each case the single re-judgment round found only a narrow residual, parent-corrected and confirmed without spending the second round. **PR-36's own re-judgment finding was notable**: both judges independently caught the SAME defect in the parent's own record-keeping prose (a "five vs six" test-count miscount) — a sixth confirmed instance of this project's "two judges converging independently is strong signal" pattern, this time on arithmetic, not source code. See §6 for what each slice's rounds found. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused before
the child launches (`SDD preflight cancelled or invalid; no session consent recorded`) — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line budget
with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` envelope exists. One variant: if a human has already run `/gentle:sdd-preflight` in the TUI,
or the Director asks, the slice may run through `sdd-apply`.

**2. The per-slice pipeline sessions 27–36 ran — repeat it exactly. Session 36 confirmed it end-to-end
again without any deviation needed; this is now nine consecutive sessions on the identical route.**
1. **Map** once (delegated `Explore`, read-only): v1 range (if any), consumed APIs with verbatim signatures, DDL,
   spec, design, the tasks block, and every contradiction between them. For PR-37, pin down exactly: (a) whether
   `synthesize.ts` has its own v1 SEAM citation (unconfirmed this session — read design.md §13's FULL migration
   flow, not just the steps this file's §3 paraphrases); (b) `specs/v1-migration/spec.md`'s exact text for
   "Migration synthesizes the registry, secret-store entry and ledger rows" and "Minimal non-interactive
   migration entry point"; (c) what D-24's "env-only-refused scenario" means precisely (grep `D-24` across
   design.md and the ADRs — do not assume from the name alone); (d) whether `synthesize.ts` reshapes PR-36's
   `V1Config`/`V1State` (v1-native shapes, deliberately NOT reshaped in PR-36 itself — see §6) into
   `shared/thread-record.ts`'s `ThreadRecord`, `shared/project-file.ts`'s `ProjectRosterEntry`, and
   `shared/roster-hash.ts`'s `computeRosterHash` input — this was PR-36's own explicit deferral, so PR-37 is very
   likely where that conversion finally happens; (e) what `main.ts`'s "minimal non-interactive migration entry
   point" needs from `src/cli/main.ts`'s existing dispatch pattern (`daemon stop`/`mcp` are the two precedents —
   read `cli/main.ts` directly for the exact dispatch shape to mirror).
2. **Decide** the open design points yourself (the Director delegated them) and write them into the writer's brief;
   each decision is stated in the module doc and in `apply-progress.md`, and a `tasks.md` *apply-time note* records the
   decisions and any edit outside the block's Scope line.
3. **Write** (delegated `general-purpose`, sonnet): src + twin. The writer does not commit. **Insist on RED first**
   and ask for the verbatim RED lines.
4. **Parent readback** of the source before freezing — it has found a defect in most slices since session 28,
   and session 36 confirmed it again (a module header's own doc-comment claim about which v1 declarations were
   "reproduced" was inaccurate — `StateError` was listed as reproduced when it was actually superseded, not
   reproduced — caught by the parent, not by Judgment Day). **A design decision framed as "just the
   natural/obvious choice" needs the same scrutiny as a correctness claim.** Before writing a design decision
   into a module doc, grep the field/concept name against `DATA-MODEL.md`, `design.md` and `shared/*`'s own doc
   comments first.
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only control that
   MUST survive, BUILD-FAIL and TIMEOUT reported apart. A survivor is a test gap → pin it (that is the behavioural RED);
   an **equivalent** mutant is argued in the record, not pinned — **but re-derive the equivalence claim by tracing
   BOTH the exit code AND every side effect (stderr writes, logged messages, etc.), not just the return value**.
   A mutant the suite **cannot observe** is recorded as such, not called equivalent. **Use a runtime-opaque
   condition for a disabled-branch mutant (e.g. `Date.now() < 0`), never a literal `false`** — a literal-`false`
   mutant trips TypeScript's unreachable-code detection (`TS7027`), a legitimate BUILD-FAIL that answers nothing
   about test coverage. **A discriminated union with literal-typed fields turns an incorrect kind↔value mapping
   into a compile-time BUILD-FAIL, not a runtime survivor** — confirmed a SIXTH time in PR-36 (an OR→AND flip in
   a null-guard whose De Morgan negation TypeScript can no longer prove narrows a nullable field before it
   indexes a `Record`, producing `TS2538` instead of a silent runtime bug); do not mistake a clean BUILD-FAIL
   result for "untested." **New this session: delegating the mutant sweep itself to a `fork` (not just running
   it inline) works well** — the fork inherits full context of the already-reviewed source, runs the build/test
   loop without polluting the parent's own context with dozens of tool calls, and reports back exactly as
   actionably as if the parent had run it directly. Reach for this whenever the sweep will need many rounds.
6. **Run the FULL test suite before freezing, not just the new/touched test files** — session 36 is the SECOND
   session (after PR-32) to hit the exact `git ls-files`-based-scanner gotcha (`provenance.test.ts` failing
   because new files were untracked) by only discovering it on the full-suite run, not the writer's own narrower
   verify command. `git add -N` the specific new files (never `git add -N .`) before running the full suite or
   `test:static`. Full suite + `test:static` from a clean `dist/`; measure `git diff --numstat main -- src test`,
   **summed as additions+deletions per file, not additions alone** (`AGENTS.md`'s own ODD section: "counting
   additions plus deletions"); commit code **with** its records (`tasks.md` ticks + size reconciliation + apply-time
   note, `apply-progress.md` section). **Re-derive a stated mutant-sweep tally from the raw sweep output before
   writing it down, never transcribe it from memory. Re-check that a size-reconciliation note's own stated
   per-file breakdown actually sums to its own stated total before writing it down** — this exact class of error
   (a parent's own prose miscounting something the raw numbers already prove) recurred YET AGAIN in PR-36's own
   re-judgment round ("five" vs the actual six new tests) — the sixth confirmed instance of this specific failure
   mode across this project's sessions. Treat any count you write in prose as provisional until you have
   literally re-added the numbers from the source you are describing, every single time, no matter how
   mechanical the claim feels.
7. **Judgment Day**: frozen worktree, `jd-judge-a` + `jd-judge-b` in parallel, result shape `{findings, evidence}`.
   In parallel, a **separate independent verifier** (`general-purpose`) on its own worktree with a mandate to
   reproduce every figure, re-run the sweeps, write up to six extra mutants and **probe the running code**.
   **The judges have no Bash**: they check figures by reading and arithmetic only; the verifier is the one that
   re-measures. **Two judges converging independently on the identical finding without seeing each other's work
   is a strong signal** — confirmed a SIXTH time in PR-36, this time on the parent's own record-keeping prose
   rather than on source code, proving the pattern generalizes beyond code review to any claim a judge can
   independently re-derive from evidence already in front of it. **A judge that explicitly CONSIDERS an issue and
   declines to report it is giving you real signal too, not silence.** **A design decision the orchestrator makes
   can itself be the audit's headline finding, not just a writer's code.**
8. Reproduce single-judge rows before correcting; correct (parent inline for small batches, or a scoped
   `jd-fix-agent` delegation for a larger confirmed batch); commit code and record together; scoped
   re-judgment over the delta only. **A scoped re-judgment round is MANDATORY before any APPROVED verdict —
   never write "APPROVED" or "zero re-judgment rounds used" without actually having sent the correction back to
   both judges first**, even when you are confident the fix is complete. **Budget: two re-judgments.** PR-36
   used only **one**: its single re-judgment finding (both judges independently: the record's own "five new test
   cases" prose actually described and shipped six) was a pure documentation fix with zero behavior change,
   extending this project's established "narrow, well-understood residual doesn't need the second round" judgment
   call to a WARNING-tier pure-prose finding — the same disposition PR-32/33/34/35 established for SUGGESTION/WARNING-tier
   residuals of other kinds. **Zero CRITICAL/WARNING from either judge on the actual source code across both
   rounds** — the first time in the PR-29..PR-36 run that a slice's ENTIRE finding set, across every round, was
   SUGGESTION-tier or lower on the code itself (the one WARNING was about the record's own prose, not the shipped
   bytes). Worth noting as a genuine quality signal, not just a lucky slice: the source-level readback + sweep
   discipline in steps 4-6 is catching real defects BEFORE Judgment Day now, often enough that Judgment Day's own
   marginal yield on the actual code is shrinking session over session.
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
lands, never a silent full-coverage claim. Do not invent a Docs task where none is warranted; PR-36's own block had
no Docs sub-task, and PR-37's block (per this session's own read) also names none — check `tasks.md`'s PR-37 block
yourself before assuming one is needed.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip
and labelled with it, **counted as additions+deletions per file** (§2.6 above). PR-34 849 (489-line exception),
**PR-35 679 at its final tip** (429-line exception), **PR-36 931 at its final tip** (531-line exception, grown from
the candidate's 829 across one Judgment Day correction round of six new tests plus one text-only re-judgment fix) —
every estimate priced only the primary deliverable; full SEAM fidelity (reproduced supporting v1 declarations, a
comprehensive typed-refusal surface, strict-TDD-mandated coverage of every refusal kind and permutation) plus
Judgment Day's own correction rounds are most of the overrun, a pattern holding since PR-06b. Add a *Size
reconciliation* note under the block's header in `tasks.md` (gate text left as written), and **update it again if a
later correction round changes the final tip** — do not leave a stale mid-process number in `tasks.md` once the
slice is actually done.

**6. Frozen worktrees — the junction rule (session 28 incident, followed cleanly since, including PR-36's own two
worktree pairs).** `git worktree add --detach ../telegram_bus_agent-worktrees/<name> <sha>`. Only the verifier's
worktree needs `node_modules`: create the junction with PowerShell `New-Item -ItemType Junction -Path '<win
path>\node_modules' -Target '<main win path>\node_modules'`. **To remove: delete the junction first with
PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`, verify it is gone (`test -e … || echo
removed`) and that `node_modules/typescript/lib/tsc.js` still exists in the main checkout, and only then `git
worktree remove --force`.** For a re-judgment round, moving the judges' worktree in place via `git checkout <sha>`
(rather than recreating it) is cheaper and equally correct when only the judges' worktree, not the verifier's, is
needed again — PR-36's own session did exactly this.

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

**8. Waiting on a background agent: never poll.** `ScheduleWakeup` is for `/loop` dynamic-mode sessions only —
calling it (or spawning a throwaway filler agent, or sending an unprompted "status?" message to a still-running
subagent) just to "wait" for an `Agent`-launched subagent is a misuse the harness already handles for you: it
re-invokes you automatically when the subagent's task-notification arrives. **This mistake recurred AGAIN in
session 36** (a sixth-plus occurrence across sessions 32-36) — `ScheduleWakeup` was called once out of habit
immediately after launching a background mapping agent; the tool's own required-parameter validation error
caught it before any wakeup was actually scheduled, and the session self-corrected and explicitly disclosed the
near-miss rather than silently moving on. **The pattern has now shifted from "completing the mistake" (sessions
32-35, where a wakeup was scheduled and then stopped) to "reaching for the tool and being caught by its own
guard rail before completion" (session 36)** — a partial improvement, but the underlying reflex (reach for
`ScheduleWakeup` right after an `Agent` call) has NOT gone away across six sessions of reminder text. If this
happens again, stop treating it as a self-correctable footnote: consider whether a hard pre-Agent-call checklist
or a different structural cue (e.g., ending the turn immediately after every `Agent` launch with no further tool
calls at all) would remove the reflex entirely rather than relying on catching it after the fact.

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

**PR-32/33 and PR-34's `client/errors.ts`/`client/ipc-stub.ts`** are all **new code, confirmed**: v1
(`telegram-agent-bus`) has no daemon/client split at all. **PR-35's `client/main.ts` is also new code, confirmed**:
v1's `main()` (`src/index.ts:250-292`) is verdict **REPLACED** in design §12, so it gets no `Provenance:` header at
all, the same treatment as new code. **PR-36's two new pins above were independently reproduced twice this
session** (once by the delegated mapper, once again directly by the parent, both matching each other and the
values `apply-progress.md` §PR-36 and the two module headers now carry) — both v1-config.ts's and v1-state.ts's
cited ranges needed a WIDER net than the pinned range alone to be self-contained: `v1-config.ts` needed
`REQUEST_REMINDER_WINDOW_HOURS` (`config.ts:53`, already ported as a SEAM to `shared/constants.ts`); `v1-state.ts`
needed the `State`/`ThreadRecord`/`Conditions` interfaces plus `defaultState()`/`noConditions()`
(`state.ts:15-190`) and `STATE_VERSION`'s value (`config.ts:129`, explicitly NOT ported to `shared/constants.ts`
for v2 per design.md's own SEAM-change note) — both disclosed as supporting, non-separately-pinned code in the
module headers, following this project's established "widen only what's needed beyond a citation" pattern.
**PR-37 needs its own pin only if `synthesize.ts` turns out to cite a v1 range directly — unconfirmed this
session, check `tasks.md`'s PR-37 block and design.md §13 yourself before assuming either way.** Older pins are
in `apply-progress.md` and in each module's header. SEAM pins are **not machine-checked** by `provenance.test.ts`
(B-42).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **Always run the FULL test suite before freezing a candidate, not just the writer's own narrower verify command** | Session 36 is the SECOND session (after PR-32) to discover the `git ls-files`-based-scanner gotcha (`provenance.test.ts` invisible to untracked new files) only on the full-suite run — the writer's own two-file verify command cannot catch this class of gap since it never exercises anything that scans the whole tree. Run `npm test` (the full suite), not just the two new test files, before considering a candidate frozen. | PR-32, PR-36 |
| **Delegating the parent's own mutant sweep to a `fork` works well and should be the default for anything beyond a handful of mutants** | The fork inherits full context of the already-reviewed source (no re-explaining needed), runs the build/test loop without polluting the parent's own context, and reports exactly as actionably as an inline run. Confirmed this session for a 15-mutant, two-file sweep. | PR-36 |
| **A parent's own record prose needs the same distrust as a subagent's — confirmed a SIXTH time** | PR-36's own re-judgment round: both judges independently caught that the correction's own "Merged findings" paragraph said "five new test cases" when it actually described and shipped six — the record's own before/after test-count line two paragraphs later already proved the miscount, and nobody had cross-checked the two numbers against each other before writing them both down. Recompute a stated figure from the actual current tip before writing it, every time — including a plain count of your own bullet list. | PR-31 through PR-36 records |
| **`STATE_VERSION`-shaped project constants that design.md explicitly drops from `shared/constants.ts` for v2 still need a LOCAL, named, commented constant when a v1-migration reader has to reproduce v1's own historical check** | Do not import a constant design.md says v2 doesn't need — reproduce it locally with a comment citing the exact v1 line, scoped explicitly to "v1's own historical value," per the named-constant rule (AGENTS.md §3). | `src/migration/v1-state.ts`'s `V1_STATE_VERSION` |
| **A v1-migration reader's SEAM citation is rarely self-contained — the supporting declarations a cited range depends on (interfaces, defaults, sibling constants) usually live OUTSIDE the pinned line range** | Read the wider v1 context directly, reproduce only what's actually needed locally, and disclose it as supporting/non-pinned in the module header, distinct from the officially pinned range. | `src/migration/v1-config.ts`, `src/migration/v1-state.ts` |
| **A v1-migration reader's output type should stay v1-native, not reshaped into v2's `shared/thread-record.ts`/`shared/project-file.ts` shapes, until the slice whose job that reshaping actually is** | PR-36 deliberately kept `V1Config`/`V1State` in v1's own field names; the conversion into v2 shapes (`ProjectRosterEntry`, `ThreadRecord`, `computeRosterHash` inputs) is PR-37's `synthesize.ts` job specifically, not something to pull forward. | `src/migration/v1-config.ts`, `src/migration/v1-state.ts` |
| **A design decision the orchestrator makes needs the same cross-check against EXISTING project documentation as any other technical claim, not just internal reasoning** | Confirmed repeatedly (PR-34 session caching, PR-35 `host` semantics). Before writing "this is the natural/obvious value" for any field with an existing name in the data model, grep that field name against `docs/02-architecture/DATA-MODEL.md` and any `shared/*.ts` doc comment that defines it, every time. | PR-34, PR-35 |
| **`ScheduleWakeup` misuse to "wait" on a background `Agent` call is now a SIX-PLUS-session-running pattern (32, 33, 34, twice in 35, once in 36) that has NOT fully self-corrected from reminder text alone, though session 36's occurrence was caught earlier (by the tool's own parameter validation) than sessions 32-35's** | The harness already re-invokes automatically on subagent completion; no wait mechanism is ever needed. If this recurs in the next session too, stop treating it as a self-correctable footnote and consider a structural fix — e.g. ending the turn immediately after every `Agent` launch with no further tool calls, removing the opportunity to reach for `ScheduleWakeup` at all. | sessions 32–36, this file's own §2 point 8 |
| **`os.tmpdir()`'s ancestor chain can contain OTHER stray fixture-shaped files/dirs from prior sessions' test runs** | None collide with a literal filename search (`conmuta.json`, `config.json`, `state.json`) — verified across multiple sessions — but a future test relying on "nothing found above a fresh temp dir" should still verify the specific filename it searches for doesn't collide. | this machine's `%TEMP%` |
| **`shared/ipc-contract.ts`'s `toolSuccessSchema`/`ipcErrorSchema` have no cross-validation at the point a caller classifies a response** | Deferred as **B-52**. | **B-52** |
| **`fetch` cannot set a custom `Host` header — confirmed empirically, not just documented** | Node's `fetch` (undici) silently ignores any explicit `host` header value. Use `node:http` or a raw socket if you ever need to test a mismatched Host header. | PR-33 record |
| **Promise memoization for a shared in-flight async attempt: cache the PROMISE, not the resolved value** | General pattern from PR-34; reach for it whenever two concurrent callers must not both trigger the same expensive/stateful async operation. | `src/client/ipc-stub.ts` |
| **`parseProjectFile` already exists — do not reimplement `conmuta.json` parsing** | `src/shared/project-file.ts` exports `parseProjectFile(text: string): ProjectFileResult` — pure, no I/O; freely importable from `client/*`/`migration/*`. | `src/shared/project-file.ts` |
| **`computeRosterHash` already exists — do not reimplement the roster fingerprint** | `src/shared/roster-hash.ts` exports `computeRosterHash(roster: readonly RosterHashInput[]): string`, accepts any object with at least `{agent_id, user_id}` structurally. | `src/shared/roster-hash.ts` |
| **`loadV1Config`/`loadV1State` already exist — do not reimplement v1 config/state parsing** | `src/migration/v1-config.ts` exports `loadV1Config(homeDir): V1ConfigResult` and `resolveV1AgentBusHome(env?): string`; `src/migration/v1-state.ts` exports `loadV1State(homeDir, roster?): V1StateResult`. Both return typed discriminated-union results, never throw. PR-37's `synthesize.ts` almost certainly composes both directly. | `src/migration/{v1-config,v1-state}.ts` |
| **`resolveProjectBinding` never throws — every walk-up failure is a typed refusal, including an unreadable path** | `src/client/binding.ts`, five `BindingRefusal` kinds. | `src/client/binding.ts` |
| **`performHandshake` composes `run-state.ts`'s already-merged `ensureDaemonRunning` as its own first step** | Zero `fetch` calls happen if that step fails. | `src/client/handshake.ts`, `src/client/ipc-stub.ts` |
| **`IPC_REQUEST_TIMEOUT_MS` (70s) is reused for both the handshake and every tool call — disclosed, deferred as B-51** | Not a correctness bug. | **B-51** |
| **Windows `fs.watch()` crashes natively on an 8.3 short path** | `realpathSync.native(dirPath)` before `watch()`. | `src/client/run-state.ts`'s `waitForRunFile` |
| **`state.yaml` is YAML with several enormous single-line string fields** | `completed_slices` and `tribunal_state` are both continuously-growing double-quoted YAML strings — extract/append with a small Node script (find the field by its known 0-based line index, splice text in before the closing quote) rather than `grep`/`sed`/the Edit tool. **Never introduce an unescaped `"` inside the appended text** (avoid apostrophes/possessives too if writing the append text as a double-quoted JS string inside a `node -e` command — use "its own"/"X own Y" instead of "X's Y" defensively). Re-run `gentle-ai sdd-status` after editing to confirm the file still parses. | sessions 28–36 |
| **Sweep harness needs bounds** | `node --test --test-timeout=5000` and `spawnSync(..., {timeout: 150000, shell: false})`. Report `KILLED(TIMEOUT)` apart. | sessions 29–36 |
| **`git add -N` — scope it, never `.`** | Always name the specific new files. | sessions 30–36 |
| **A writer's RED is usually compile-level** (`TS2305`/`TS2307`/`TS2339`) | The behavioural RED is the parent's: readback fixes and sweep survivors, each pinned by a test that fails without the fix. | sessions 27–36 |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; builds via `node_modules/typescript/lib/tsc.js -b` directly. Lives in the untracked `odd/` tree (deleted at close): recreate it each session (≈75 lines). **Use a runtime-opaque disabled-branch condition (e.g. `Date.now() < 0`), never a literal `false`.** Consider delegating the actual sweep-running to a `fork` once the harness and mutant lists are written (session 36 confirmed this works well). | sessions 28–36 |
| **The AS-IS transports lose error detail** | `GroupTransport`/`DualWriteTransport`. | PR-27, PR-28, PR-31 |
| **`offsets.retry_after_until` is shared** | Per `bot_id`; the poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring. | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | Do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **A shared "must never both be true" property is best enforced by ONE function** | `withRetryAfterIfRetryable(payload, retryAfterS)` (PR-31) is the shape to reach for. | `src/daemon/ipc/routes.ts` |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId`. Extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status`. | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key> --scope <s>`. | sessions 27–36 |
| **Subagents were available all of sessions 27–36** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits; PR bodies end with the Claude Code line. Write long messages to a file and use `git commit -F`, or pass a heredoc-free multi-line string directly to `-m` if the Bash tool's heredoc parsing is unreliable for very long embedded text. | sessions 27–36 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header, opt-in per file** | A file with no `Provenance:` line is invisible to this test entirely; the check requires `startsWith("/**")` as the file's literal first bytes — a naive `grep -n "Provenance:"` is a false positive for "this file claims vendor provenance." | `test/security/provenance.test.ts`, **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files before `test:static` AND before the full suite (`npm test`) — confirmed a second time this session that the full suite, not just `test:static`, needs this. | PR-32, PR-36 |
| **PT-22's token shape** | Synthetic bot ids use seven digits; no fixture may match `\d{8,10}:[A-Za-z0-9_-]{35}`. Relevant to any future v1-shaped fixture (e.g. PR-38's `test/fixtures/v1-home/`). | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means no limit; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines can fail to parse or truncate silently** | Write files with the file tools, Python, or a small Node script; for appending to an existing large file, prefer Read + Edit over a heredoc `cat >>`. Verify line counts / content after writing. | sessions 13–36 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–36 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run. Did not reproduce in PR-23..PR-36 (every leg green on the first attempt across fourteen consecutive slices). | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |
| **The global `~/.claude/CLAUDE.md` is a managed, lazy-loadable file — do not assume it's monolithic** | Not relevant to this project's own code. | session 33, out-of-repo |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 174/210. Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4 (all
   flags — they are load-bearing, not optional colour), `tasks.md`'s **PR-37 block**, `specs/v1-migration/spec.md`'s
   "Migration synthesizes the registry, secret-store entry and ledger rows" and "Minimal non-interactive migration
   entry point" requirements, and design.md's **full** §13 migration flow (do not rely on this file's own §1/§3
   paraphrases of steps 1/4/5 — read every step yourself, since steps 2/3/6+ were never independently confirmed by
   session 36).
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram mirror
   `odd/<feature>/tasks`, before the first write.
3. **Branch** `f1/37-migration-synthesize-cli` from `main`, then run §2.2's pipeline:
   - **Decide first, before any code**: whether `synthesize.ts` has its own v1 SEAM citation (check `tasks.md`'s
     PR-37 block and design.md §13 directly — do not assume either way); exactly what D-24's "env-only-refused
     scenario" requires; how `synthesize.ts` reshapes PR-36's v1-native `V1Config`/`V1State` into v2's
     `ProjectRosterEntry[]`/`computeRosterHash` input/registry `bindings[]` shape (design.md's own step 5 text,
     quoted by this file's predecessor as *"bindings[] {..., roster_snapshot: config.roster re-keyed, roster_hash,
     ...}"* — re-verify that quote yourself, it was never independently re-read this session); the exact
     `cli/main.ts` `migrate-v1` dispatch shape (mirror the existing `daemon stop`/`mcp` dynamic-import pattern).
   - **37.1 RED**, **37.2 GREEN**, **37.3 Verify** (or whatever `tasks.md`'s actual PR-37 sub-task numbering says —
     read it directly, this file does not paraphrase the exact sub-task text).
4. Audit per §2.2 steps 7–9; merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s status line,
   `state.yaml` (BOTH `completed_slices` AND `tribunal_state` plus `next_recommended`; check
   with `gentle-ai sdd-status`), `docs/00-INDEX.md`'s backlog board row 10 (extend its PR range even when the slice
   itself files no new row, as this session did) and `docs/05-tribunal/INDEX.md`, delete `odd/`, save the session
   summary to Engram (CLI fallback if the MCP server is disconnected), commit on `main`, push, and hand the
   Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text.
- **PR-01…PR-36 are complete; do not re-slice, re-audit or re-open them.** Units 4–10 are closed; unit 11
  `v1-migration` is open, its first slice (PR-36) done. A defect in a merged module is its own slice with its own
  audit, not a drive-by edit (B-43, B-44, B-45, B-48, B-49, B-50, B-51, B-52, B-53 wait for such slices).
- **Settled in session 36 and recorded**: `src/migration/v1-config.ts` owns `loadV1Config(homeDir):
  V1ConfigResult` and `resolveV1AgentBusHome(env?): string` — a typed discriminated-union result, never throws,
  SEAM from `telegram-agent-bus/src/config.ts:168-233`. `src/migration/v1-state.ts` owns `loadV1State(homeDir,
  roster?): V1StateResult` — SEAM from `telegram-agent-bus/src/state.ts:252-439`; the quarantine-rename branch
  (v1's `quarantineStateFile`/`renameSync`) is a hard error here, never a write — every case that would have
  triggered it (invalid JSON, non-object body, future `state_version`, post-migration schema failure) returns a
  typed refusal with the original file completely untouched, pinned by an `assertFileUntouched` test helper.
  `to_user_id` gains an OPTIONAL roster-backed backfill behind a new `roster` parameter v1 never had; an
  already-resolved value is never overwritten. Output types stay v1-native (`V1Config`, `V1State`,
  `V1ThreadRecord`, etc.), deliberately NOT reshaped into `shared/thread-record.ts`'s `ThreadRecord` — that
  conversion is explicitly PR-37's `synthesize.ts` job. `STATE_VERSION` is a LOCAL constant in `v1-state.ts`
  (`V1_STATE_VERSION = 2`), not imported from `shared/constants.ts` (design.md drops it there for v2). New leaf
  compile unit `src/migration/tsconfig.json`, `references: [{"path": "../shared"}]` only.
- **Settled in session 35**: `src/client/main.ts` owns the thin MCP client's process entry point —
  `runMcpClient(options)`, a single testable async function (NOT a top-level script like `daemon/main.ts`).
  Startup order: node-floor gate (locally duplicated pure check) → `--project` presence → `resolveProjectBinding`
  walk-up → exactly one `IpcSession` via `createIpcSession` → `createServer({ipc, projectId})` → `await
  server.connect(transport)`, the whole sequence (after the two cheap pre-checks) wrapped in try/catch,
  message-only + exit 1 on anything unexpected. `host` is the disclosed placeholder `"unknown"` (real MCP
  host-application label deferred to B-53). No `Provenance:` header (v1's `main()` is REPLACED). `src/cli/main.ts`
  owns the process entry and all argv parsing for `mcp`, mirroring its existing `daemon stop` dynamic-`import()`
  dispatch exactly, including its own node-floor gate reusing `daemon/node-floor.ts`'s `enforceNodeFloor` as the
  very first action of the branch.
- **Settled in session 34**: `src/client/ipc-stub.ts` owns the daemon-calling half of one MCP session —
  `IpcSession`/`createIpcSession`, session-lifetime-cached via a memoized in-flight promise, one-retry self-heal on
  a `401`. `client/errors.ts` owns `clientErrorPayload`. `client/server.ts` owns `createServer(deps)` — SEAM from
  `v1:src/index.ts:112-248`.
- **Settled in session 33**: `src/client/binding.ts` owns `resolveProjectBinding` — five refusal kinds now (not
  four — `invalid_project_file` and `unreadable_project_file` are distinct). `src/client/handshake.ts` owns
  `performHandshake`; explicitly documents it "assembles no roster hash and derives no host label of its own"
  (session 35's own `main.ts` closed that gap with a disclosed placeholder).
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
  DIFFERENT class of decision (a data-model field's semantics, not a performance tradeoff). Also: an "equivalent
  mutant" argument must check every observable side effect, not just the return value.
- **The general lesson from PR-36's own audit**: a parent's own record-keeping prose (counts, tallies) is exactly
  as fallible as a subagent's output and needs the same distrust — confirmed a sixth time, this time by both
  judges independently catching a plain arithmetic miscount in the parent's own "Merged findings" paragraph. Also:
  running the FULL test suite (not just the touched test files) before freezing a candidate catches
  integration-level gaps (the `git ls-files`/`git add -N` interaction) that isolated test runs structurally
  cannot — worth a standing pre-freeze checklist step, not just a footnote. Also: delegating a large mutant sweep
  to a `fork` is a good default, not just an option, once the harness and mutant lists are already written.

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
| B-39 | CI (and local runs) intermittently red on two wall-clock tests; re-run once and record. Did not reproduce in PR-23..PR-36. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| PR-11/12/13 escalations | SUGGESTION-class rows that survived their second rounds. Nothing blocks. | Director |
| carried (PR-06) | Digest blind spots (`MAX_THREAD_HISTORY` saturation); the fence does not neutralise `&`. | Director |
| **`bootstrap.ts` still doesn't wire the IPC server** | `createSessionRoutes`/`createIpcServer` exist and are fully tested but nothing in the daemon's actual boot sequence calls either yet. Not blocking so far, but a later PR must close this before the daemon is actually reachable over IPC in production. | a later PR |
| B-16 / D-10, B-11, B-12 / B-13 | Licence files and copyright line; trademark screening; macOS scope; migration runbook (PR-38 — note: this is `tasks.md`'s numeric PR-38 slot, unrelated to the merged GitHub PR #38 = this repo's own PR-34). | Director |
| B-05, B-08, B-09 | F0 spikes still open (B-08's client-side handshake half closed with PR-33; PR-35 closed the client-side surface entirely with the entry point itself). | Director + Kairo |

No new backlog was filed by PR-36's own audit — every finding across both judges, both rounds, and the
independent verifier was either fixed and re-verified, or (the one dead-tsconfig-reference SUGGESTION) honestly
disclosed with reasoning Judge A's own round-2 pass explicitly endorsed as reasonable.

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) — see its rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI (update to 2.1.0 available for the separate
  `engram` CLI — not yet applied, no functional impact observed), TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **1002 tests** (1001 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`) — see §4's `fs.watch`
  gotcha if any future code watches a directory under it. The Temp root also accumulates stray fixture directories
  from past sessions' test runs (harmless, none collide with a literal filename search — verified across
  multiple sessions).
- Verification worktrees: `../telegram_bus_agent-worktrees/` — **empty** at the end of session 36 (`pr36-judges`
  and `pr36-verify` both removed cleanly via the junction-first procedure).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 70–130 s per leg).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it). PR-37 may or may not need to read further v1 source directly — confirm at Map time.
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down**. Never quote or commit.
- The Engram MCP server (`plugin:engram:engram`) was reachable at the start of session 36; if it disconnects
  mid-session, the `engram` CLI fallback (§4) is the default assumption going forward.
