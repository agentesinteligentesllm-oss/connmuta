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
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. Session 34
merged **PR-34** (the IPC-calling stub, client-local error taxonomy, `createServer(deps)`) with both
blind judges, a separate independent verifier, and **one** of the two re-judgment rounds — the route §2
describes is the one that produced it. Unit 10 `thin-client-tools` continues with **PR-35**.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-35 (`src/client/main.ts` + `src/cli/main.ts` con el subcomando `mcp`, el punto de entrada del cliente delgado, ADR-0029): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + Judgment Day con ambos jueces + verificador independiente); la Arena no está disponible, así que nada depende de un debate ni de la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** (session 34 deleted its `odd/` tree). The status command must print
`nextRecommended: apply`, `completed: 168`, `pending: 42` (of `210`), `blockedReasons: []`. Anything else:
stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count
yourself with `grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 168).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-34** (PR-34 merged as PR #38, `04928a2`; candidate `32a0c16`, correction `ee32036`, re-judgment fix `cb67331`). **Unit 10 `thin-client-tools` continues with PR-35.** **Next slice: PR-35** — `src/client/main.ts` + `src/cli/main.ts` (add the `mcp` subcommand). Node-floor gate → parse `--project` → `client/binding.ts` walk-up → `server.connect(new StdioServerTransport())` immediately (the handshake stays lazy, on the first real tool call — `main.ts` itself must never construct or await an `IpcSession`'s connection at startup). Completes ADR-0029's "starts within the MCP timeout" requirement. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | `tasks.md` has **45 `####`-level PR headers total** (`grep -c '^#### PR-' tasks.md`), of which **37 header lines cover `PR-01`…`PR-34`** and **8 remain, naming `PR-35`…`PR-42`** — both directly counted, unambiguous. Separately, **40 distinct GitHub PRs have actually merged** through PR-34 (three headers — `PR-06`, `PR-08`, `PR-09` — were each re-sliced at apply time into two separately-merged PRs without a second header line, so the "merged" count is higher than the "header lines covered" count — this is the same discrepancy `state.yaml`'s own PR-11 entry already flagged as not fully reconciled; do not force these two counting bases into one subtraction). **Checkboxes: 168 of 210**, always the cleanest single number to cite. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **168/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | `src/shared/*` (15 modules with twins), `src/cli/*`, `src/registry/*`, `src/ledger/*` (11), `src/secret-store/*` (5), `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts`, `src/daemon/lifecycle/*` (4), `src/daemon/transport/*` (5), `src/daemon/serve/*` (3), `src/daemon/send/*` (3), `src/daemon/ipc/{server,handshake,sessions,routes}.ts`, all with twins, and `src/client/{spawn,run-state,binding,handshake,ipc-stub,errors,server}.ts` with twins — the thin client can now build a real MCP server backed by the daemon, still missing only its own process entry point. **959 tests** (958 pass, 1 skip), `test:static` **8/8**. | PRs `#1`–`#38` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **24 entries**. PR-34 added `src/client/server.ts` (SEAM from `v1:src/index.ts:112-248`). PR-35's own `main.ts` needs its own decision before writing RED: v1 (`telegram-agent-bus`) has no separate client-entry-point concept at all (v1's `main()` builds real deps and connects directly, no daemon/client split) — read `tasks.md`'s PR-35 block and v1's `src/index.ts:250-292` (`main`, marked **REPLACED** in design §12, not SEAM) before deciding, but the strong prior (matching PR-32/33's own precedent for every other `client/*` file with no true v1 analogue) is **new code, no Provenance header**. | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-34**, one record each in the tribunal index. PR-23..PR-34: Judgment Day with **both judges** + independent verifier, all **APPROVED** (`bus-v2-f1-pr-2{3..9}-audit-001`, `bus-v2-f1-pr-30-audit-001`, `bus-v2-f1-pr-31-audit-001`, `bus-v2-f1-pr-32-audit-001`, `bus-v2-f1-pr-33-audit-001`, `bus-v2-f1-pr-34-audit-001`). PR-22a/22b: inline passes (the judges were down then). PR-29, PR-30, PR-31 used **both** re-judgment rounds; PR-32, PR-33 and **PR-34 each used only one** — in each case the single re-judgment round found only a narrow residual (PR-34's: a session-cache concurrency race one judge flagged and the other had independently already considered and cleared as below the reporting bar), parent-corrected and confirmed by full suite + static gates + a targeted mutant rather than spending the second round. See §6 for what each slice's rounds found. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused before
the child launches (`SDD preflight cancelled or invalid; no session consent recorded`) — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line budget
with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` envelope exists. One variant: if a human has already run `/gentle:sdd-preflight` in the TUI,
or the Director asks, the slice may run through `sdd-apply`.

**2. The per-slice pipeline sessions 27–34 ran — repeat it exactly.**
1. **Map** once (delegated `Explore`, read-only): v1 range (if any), consumed APIs with verbatim signatures, DDL,
   spec, design, the tasks block, and every contradiction between them. For PR-35, pin down exactly: (a) whether
   `main.ts` has any v1 analogue worth citing (the strong prior is no — see §1/§3), (b) `client/server.ts`'s
   exact `createServer(deps)` signature (`{ipc: IpcSession, projectId, now?}`) so `main.ts` constructs it
   correctly, (c) **`client/ipc-stub.ts`'s `createIpcSession` must be called EXACTLY ONCE per process, its
   result passed as `deps.ipc` — never re-created per tool call** (its whole point is a session-lifetime cache;
   re-creating it defeats that entirely and reopens PR-34's own CRITICAL finding at the call-site level instead
   of inside `IpcSession` itself), (d) the node-floor gate's existing shape (`daemon/node-floor.ts`, already
   merged) and whether `client/*` needs its own copy or can share it (check the tsconfig `client` vs `daemon`
   boundary first — `shared/*` is importable, `daemon/*` is not), (e) `cli/main.ts`'s existing subcommand
   pattern (it already has a `daemon-stop` dynamic-`import()` subcommand from PR-17 — mirror that shape for `mcp`
   rather than inventing a new dispatch style).
2. **Decide** the open design points yourself (the Director delegated them) and write them into the writer's brief;
   each decision is stated in the module doc and in `apply-progress.md`, and a `tasks.md` *apply-time note* records the
   decisions and any edit outside the block's Scope line.
3. **Write** (delegated `general-purpose`, sonnet): src + twin. The writer does not commit. **Insist on RED first**
   and ask for the verbatim RED lines.
4. **Parent readback** of the source before freezing — it found a defect in every slice since session 28,
   including PR-34's own "Makes no network call" v1-inherited inaccuracy and, in Judgment Day, PR-34's headline
   CRITICAL (no session caching — a design decision the orchestrator itself made, not a writer defect). **A
   design decision framed as "just a performance tradeoff" needs the same scrutiny as a correctness claim** —
   before accepting your own "this is cheap/harmless" reasoning about a design choice, ask explicitly whether
   the thing being skipped (caching, a check, a validation) is provably idempotent/free, or merely assumed to be.
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only control that
   MUST survive, BUILD-FAIL and TIMEOUT reported apart. A survivor is a test gap → pin it (that is the behavioural RED);
   an **equivalent** mutant is argued in the record, not pinned; a mutant the suite **cannot observe** is recorded as
   such, not called equivalent. **Use a runtime-opaque condition for a disabled-branch mutant (e.g. `Date.now() < 0`),
   never a literal `false`** — a literal-`false` mutant trips TypeScript's unreachable-code detection (`TS7027`), a
   legitimate BUILD-FAIL that answers nothing about test coverage. **A discriminated union with literal-typed fields
   turns an incorrect kind↔value mapping into a compile-time BUILD-FAIL, not a runtime survivor** — confirmed a
   fourth time in PR-34 (`IpcToolResult`'s `{ok:true,data}|{ok:false,error}` shape turned a success/error branch
   inversion in `server.ts` into `TS2339`, not a runtime survivor); do not mistake a clean BUILD-FAIL result for
   "untested."
6. Full suite + `test:static` from a clean `dist/`; `git add -N` **new files only, never `git add -N .`**; measure
   `git diff --numstat main -- src test`, **summed as additions+deletions per file, not additions alone**
   (`AGENTS.md`'s own ODD section: "counting additions plus deletions"); commit code **with** its records
   (`tasks.md` ticks + size reconciliation + apply-time note, `apply-progress.md` section). **Re-derive a stated
   mutant-sweep tally from the raw sweep output before writing it down, never transcribe it from memory.**
7. **Judgment Day**: frozen worktree, `jd-judge-a` + `jd-judge-b` in parallel, result shape `{findings, evidence}`.
   In parallel, a **separate independent verifier** (`general-purpose`) on its own worktree with a mandate to
   reproduce every figure, re-run the sweeps, write up to six extra mutants and **probe the running code**.
   **The judges have no Bash**: they check figures by reading and arithmetic only; the verifier is the one that
   re-measures. **Two judges converging independently on the identical finding without seeing each other's work
   is a strong signal** — confirmed a FOURTH time in PR-34 (both judges independently flagged the exact same
   `server.test.ts`-only-tests-`conmuta_status` route-wiring gap, and the independent verifier separately
   reproduced it a third way as a genuinely surviving mutant). **A judge that explicitly CONSIDERS an issue and
   declines to report it is giving you real signal too, not silence** — PR-34's round-1 re-judgment saw Judge B
   independently reason through the exact same session-cache concurrency race Judge A flagged, and explicitly
   rate it below the reporting bar; record both judges' reasoning, not just the one that produced a finding, when
   this happens — it is a legitimate split verdict on severity, not one judge missing something the other caught.
8. Reproduce single-judge rows before correcting; correct (parent inline for small batches, or a scoped
   `jd-fix-agent` delegation for a larger confirmed batch); commit code and record together; scoped
   re-judgment over the delta only. **A scoped re-judgment round is MANDATORY before any APPROVED verdict —
   never write "APPROVED" or "zero re-judgment rounds used" without actually having sent the correction back to
   both judges first**, even when you are confident the fix is complete (session 34 self-caught exactly this
   mistake mid-session: a first draft of its own record declared APPROVED with "zero re-judgment rounds" right
   after the FIRST correction, before ever re-sending it to the judges — caught and fixed before commit, and the
   real re-judgment round it then ran found a genuine new WARNING that would otherwise have shipped unreviewed).
   **Budget: two re-judgments.** PR-34 used only **one**: its single round-1 finding worth acting on (Judge A's
   session-cache race) was narrow, well-understood, independently corroborated by Judge B's own explicit
   consideration of the same fact, and fixed with a well-known pattern (promise memoization) verified by a
   targeted mutant — the same judgment call PR-32/33 made for their own narrower single-judge residuals.
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude Code line);
   `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Get the untracked inventory with `gentle-ai review status --cwd . --contract
gentle-ai.review-integration/v2 --agent claude-code --next-transition` (field `eligible_untracked_inventory`), then run
`gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha> --committed-only --untracked-scope=exclude
--expected-untracked-inventory=<that sha256:…> --json` and record tier and `review_due`. **Do not START the native review
for a Judgment Day target**: the installed `judgment-day` skill states it replaces ordinary 4R and both must never run on
one target, and START's consent envelope belongs to the Director. Record that in the slice's audit row. (PR-34's own
`assess` at close read `risk: medium`, `review_due: true` — `slice_budget_reached` against `main`, recorded not started.)

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those. This
project has already caught the opposite mistake several times (PT-14 in PR-06a, PT-25's registry/send-path split,
PT-27's own cell in PR-32, PT-26's own cell in PR-33, PT-07's own cell in PR-34) — the established fix is a **scoped,
disambiguated pointer**: cite the file(s), then parenthesize exactly which clause is covered and where the rest
lands, never a silent full-coverage claim. Do not invent a Docs task where none is warranted; PR-35's own block has
no Docs sub-task — check `tasks.md`'s PR-35 block before assuming one is needed.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip
and labelled with it, **counted as additions+deletions per file** (§2.6 above). PR-31 1,495 (1,095), PR-32 873 (473),
PR-33 1,107 (767), **PR-34 849 at its final tip** (489-line exception, grown from the candidate's 587 across two
Judgment Day correction commits) — every estimate priced only the primary deliverable; disclosed edits outside the
primary scope line and Judgment Day's own correction rounds are most of the overrun, a pattern holding since PR-06b.
Add a *Size reconciliation* note under the block's header in `tasks.md` (gate text left as written), and **update it
again if a later correction round changes the final tip** — PR-34's own apply-time note initially recorded the
pre-Judgment-Day 587/227 figures and had to be corrected to the final 849/489 figures after both correction rounds;
do not leave a stale mid-process number in `tasks.md` once the slice is actually done.

**6. Frozen worktrees — the junction rule (session 28 incident, followed cleanly since).** `git worktree add
--detach ../telegram_bus_agent-worktrees/<name> <sha>`. Only the verifier's worktree needs `node_modules`: create the
junction with PowerShell `New-Item -ItemType Junction -Path '<win path>\node_modules' -Target '<main win path>\node_modules'`.
**To remove: delete the junction first with PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`,
verify it is gone (`test -e … || echo removed`) and that `node_modules/typescript/lib/tsc.js` still exists in the main
checkout, and only then `git worktree remove --force`.** Session 34 followed this cleanly across two separate
worktree pairs (one for the original Judgment Day round, moved via `git checkout <sha>` in place for the re-judgment
round rather than recreated — cheaper and equally correct when only the judges' worktree, not the verifier's, is
needed again), plus pruned stale remote-tracking refs with `git fetch --prune origin` after merge.

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

**8. Waiting on a background agent: never poll.** `ScheduleWakeup` is for `/loop` dynamic-mode sessions only — calling
it (or spawning a throwaway filler agent, or sending an unprompted "status?" message to a still-running subagent) just
to "wait" for an `Agent`-launched subagent is a misuse the harness already handles for you: it re-invokes you
automatically when the subagent's task-notification arrives. **Sessions 32, 33 AND 34 have now each made some variant
of this exact mistake** before self-correcting (32 and 33: `ScheduleWakeup` misuse; 34: both a `ScheduleWakeup` call
AND an unnecessary "status?" ping to a running agent) — read this point before reaching for either at all, not after.
If this happens a fifth time, treat it as a pattern needing a different fix (e.g. a pre-Agent-call checklist item),
not another reminder-text tweak.

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

**PR-32** (`client/spawn.ts`, `client/run-state.ts`), **PR-33** (`client/binding.ts`, `client/handshake.ts`) and
**PR-34's `client/errors.ts`/`client/ipc-stub.ts`** are all **new code, confirmed**: v1 (`telegram-agent-bus`) has
no daemon/client split at all — it is a single MCP server process that talks to Telegram directly, with no
lazy-spawn, no daemon-launch, no multi-process logic, no separate binding-walk-up/handshake/IPC step anywhere to
vendor. A new module must not spell `Provenance:` in its leading block (B-33). **PR-34's `client/server.ts`**, by
contrast, IS a SEAM (row above): design.md §12's own ratified table explicitly names `v1:src/index.ts:112-248
createServer` → SEAM → `client/server.ts`, and the tribunal already settled "a line-range extract is SEAM by
construction" (`bus-v2-f1-tasks-001`) — when design.md's own table names a row, follow it, even when several
recent sibling `client/*` files had no such row to follow. **PR-35** needs its own decision for `client/main.ts`:
v1's `main()` (`src/index.ts:250-292`) is marked **REPLACED** in design §12, not SEAM or AS-IS — "replaced" is a
different verdict than either vendoring category, and the strongest prior reading (matching every `client/*` file
with no true structural analogue) is that a REPLACED v1 range does not get a `Provenance:` header either, since
the whole point of that verdict is "this v1 code is not being extended into v2 at all, a new thing is built
instead" — but read design.md §12's own definition of "REPLACED" before assuming this, since it has not been
tested by an actual PR decision yet. Older pins are in `apply-progress.md` and in each module's header. SEAM pins
are **not machine-checked** by `provenance.test.ts` (B-42).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **`IpcSession` must be constructed exactly ONCE per client process, not once per tool call** | `client/ipc-stub.ts`'s `createIpcSession` returns an object that internally memoizes its handshake (`connecting`, an in-flight-then-resolved promise) — that caching only works if the SAME `IpcSession` instance is reused across every `callTool` invocation for the process's lifetime. `client/server.ts`'s `createServer(deps)` takes `deps.ipc: IpcSession` as a constructor parameter for exactly this reason: **PR-35's `main.ts` must call `createIpcSession(...)` exactly once at startup (or lazily on first use, but still only once, memoized itself) and pass that one instance into `createServer`** — constructing a fresh `IpcSession` per tool call would silently reopen PR-34's own CRITICAL finding (unbounded `SessionStore.mint` calls exhausting `MAX_ACTIVE_SESSIONS`) at the call-site level, completely bypassing the fix `ipc-stub.ts` itself already contains. | `src/client/ipc-stub.ts`, `src/client/server.ts`, PR-35's own design |
| **A design decision the orchestrator itself makes needs the same adversarial scrutiny as a subagent's output — confirmed with a real, severe example** | Session 34's own decision to skip session caching in `ipc-stub.ts` ("one extra file read, cheap") was reasoned as a performance-only tradeoff; Judgment Day's Judge A found it was actually a correctness bug (`POST /session` is a stateful, capacity-bounded daemon mutation, not an idempotent read — unbounded calls exhaust `SessionStore.mint`'s `MAX_ACTIVE_SESSIONS` and surface as a permanent false `DAEMON_DOWN`). Before writing "disclosed simplification: X is cheap/harmless" into a module doc, verify X is PROVABLY idempotent or free — do not just assert it because the individual operation LOOKS cheap in isolation. | PR-34 record, session-34's own decision 5 |
| **A scoped re-judgment round is mandatory before ANY "APPROVED" verdict, even when the fix feels obviously complete** | Session 34 caught itself writing "JUDGMENT: APPROVED... Zero re-judgment rounds used" immediately after the FIRST correction commit, before ever re-sending it to the judges — a direct violation of §2 point 8's own established sequence. Self-corrected before the record was committed; the re-judgment round that then actually ran found a real new WARNING (the session-cache concurrency race) that would otherwise have shipped without adversarial review. Treat any urge to skip straight to "APPROVED" right after your own correction as a signal to re-check this exact point. | PR-34 record |
| **Two judges converging independently, later reproduced a third way by the verifier's own fresh mutant, is now a FOUR-session-running reliable pattern** | PR-33: both judges independently found the same `readFileSync`/EISDIR gap. PR-34: both judges independently found the same `server.test.ts`-only-tests-status route-wiring gap, and the independent verifier separately reproduced it as a genuinely surviving mutant on its own initiative. Treat this convergence as effectively pre-confirmed, not something needing a third check before acting on it. | PR-33, PR-34 records |
| **A judge that considers an issue and explicitly declines to report it is real signal, not an oversight to be corrected later** | PR-34's round-1 re-judgment: Judge B independently reasoned through the exact same session-cache concurrency race Judge A flagged, and explicitly rated it below the reporting bar ("a narrow, bounded residual of a pre-existing condition"). This is a legitimate split verdict on severity — both judges agreed on the underlying mechanics — not a gap in Judge B's own review. Record both positions when this happens. | PR-34 round-1 re-judgment |
| **`shared/ipc-contract.ts`'s `toolSuccessSchema`/`ipcErrorSchema` have no cross-validation at the point a caller classifies a response** | `client/ipc-stub.ts`'s `callTool` branches on HTTP status alone (`res.ok`), then parses against exactly one schema. `toolSuccessSchema` (`z.record(z.string(), z.unknown())`) would also accept an error-shaped body. Not exploitable today (no reachable daemon code path produces that combination), but no independent defense exists either. Deferred as **B-52** rather than fixed inside PR-34 (touches an already-merged PR-29 file, out of scope). | **B-52** |
| **`state.yaml`'s `completed_slices` and `tribunal_state` fields can silently drift out of sync with each other** | Session 33 updated `tribunal_state` with PR-33's summary but never appended one to `completed_slices` — undetected until session 34 checked both fields directly while writing PR-34's own entries. Neither field is read by `gentle-ai sdd-status` (it derives `taskProgress` from `tasks.md`'s checkboxes directly), so this drift has no functional effect, but it is a documentation-accuracy gap. **When appending to either field at session close, verify the OTHER field also got the previous session's entry** before assuming it did. | `state.yaml` |
| **`fetch` cannot set a custom `Host` header — confirmed empirically, not just documented** | Node's `fetch` (undici) silently ignores any explicit `host` header value and always derives the real outgoing `Host` from the request URL's authority component, regardless of what's passed. If you ever need to test a *mismatched* Host header against this project's own daemon (e.g. PT-29's DNS-rebinding check), you cannot do it with `fetch` — use `node:http` or a raw socket. | PR-33 record |
| **A discriminated union with literal-typed fields turns a whole class of mutant into a compile-time BUILD-FAIL, not a runtime survivor — confirmed a fourth time** | PR-34's `IpcToolResult` (`{ok:true,data}|{ok:false,error}`) made a success/error branch inversion in `server.ts`'s `runToolCall` a `TS2339` compile error, not a runtime survivor — the same win already seen in PR-32/33's own discriminated unions. Reach for a literal-typed field (or a closed string-literal union) whenever a value's *identity*, not just its *type*, is a correctness-relevant invariant. | `src/client/ipc-stub.ts`, `src/client/server.ts` |
| **Promise memoization for a shared in-flight async attempt: cache the PROMISE, not the resolved value** | `client/ipc-stub.ts`'s `ensureSession`/`connecting` pattern: assign the in-flight promise to a closure variable SYNCHRONOUSLY (before its first internal `await` ever yields), so a second concurrent caller in the same tick observes the assignment and awaits the same promise instead of starting a duplicate attempt. Clear the cached promise on rejection so the next call gets a fresh attempt rather than a permanently-cached failure. General pattern, reach for it whenever two concurrent callers must not both trigger the same expensive/stateful async operation. | `src/client/ipc-stub.ts` |
| **`parseProjectFile` already exists — do not reimplement `conmuta.json` parsing** | `src/shared/project-file.ts` exports `parseProjectFile(text: string): ProjectFileResult` — pure, no I/O; freely importable from `client/*`. | `src/shared/project-file.ts` |
| **`resolveProjectBinding` never throws — every walk-up failure is a typed refusal, including an unreadable path** | `src/client/binding.ts`, four `BindingRefusal` kinds. | `src/client/binding.ts` |
| **`performHandshake` composes `run-state.ts`'s already-merged `ensureDaemonRunning` as its own first step** | Zero `fetch` calls happen if that step fails. Returns `SessionResponse` (`client_id`, `bearer`, `binding`, `conditions`) — never the daemon's port; `ipc-stub.ts`'s `connect()` calls `ensureDaemonRunning` a second time itself to get the port, a disclosed redundancy paid at most once per session now. | `src/client/handshake.ts`, `src/client/ipc-stub.ts` |
| **HMAC helpers are locally reimplemented in `client/*`, not imported from `daemon/ipc/*`** | `client/tsconfig.json`'s `references` is `[{"path":"../shared"}]` only — no compile path from `client/*` to `daemon/*`. | `src/client/handshake.ts`, `src/daemon/ipc/{handshake,sessions}.ts` |
| **`IPC_REQUEST_TIMEOUT_MS` (70s) is reused for both the handshake and every tool call — disclosed, deferred as B-51** | Not a correctness bug; a future PR should introduce a dedicated, shorter `IPC_HANDSHAKE_TIMEOUT_MS`/`IPC_TOOL_CALL_TIMEOUT_MS`. | **B-51** |
| **Windows `fs.watch()` crashes natively on an 8.3 short path** | This machine's `os.tmpdir()` returns an 8.3 short path. Fix: `realpathSync.native(dirPath)` before `watch()`. | `src/client/run-state.ts`'s `waitForRunFile` |
| **`test/client/` conventions** | Real temp dirs via `mkdtempSync` cleaned in `finally`; real `process.pid`; small hand-written fakes inline per file (no `test/fakes/` for client tests); a scoped, `finally`-restored monkey-patch is acceptable for testing something like `AbortSignal.timeout`'s argument (PR-34's own `ipc-stub.test.ts` precedent) when there is no other way to observe an argument passed to a built-in. `test/fakes/clock.ts` still does not exist. | `test/client/*.test.ts` |
| **`state.yaml` is YAML with several enormous single-line string fields** | `completed_slices` and `tribunal_state` are both continuously-growing double-quoted YAML strings — extract/append with a small Node script (find a unique marker substring, insert before the closing quote) rather than `grep`/`sed`/the Edit tool, which struggle with a multi-KB single line. **Never introduce an unescaped `"` inside the appended text** — check with `.includes('"')` (or `String.fromCharCode(34)`) before writing. Verify both fields separately (§4's own drift note above) and re-run `gentle-ai sdd-status` after editing to confirm the file still parses. | sessions 28–34 |
| **A parent's own record prose needs the same distrust as a subagent's** | Confirmed a fourth time in PR-34: an apply-time note in `tasks.md` was left with the pre-Judgment-Day 587/227 line figures after two correction rounds moved the real final tip to 849/489 — caught and fixed only because the close-out session re-checked it deliberately, not because anything else would have caught it. Recompute a stated figure from the actual current tip before writing it, every time, and re-check it AGAIN if anything changes after you first wrote it down. | PR-31, PR-32, PR-33, PR-34 records |
| **Sweep harness needs bounds** | `node --test --test-timeout=5000` and `spawnSync(..., {timeout: 150000, shell: false})`. Report `KILLED(TIMEOUT)` apart. | sessions 29–34 |
| **`git add -N` — scope it, never `.`** | Always name the specific new files. | sessions 30–31 |
| **A writer's RED is usually compile-level** (`TS2305`/`TS2307`/`TS2339`) | The behavioural RED is the parent's: readback fixes and sweep survivors, each pinned by a test that fails without the fix. | sessions 27–34 |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; builds via `node_modules/typescript/lib/tsc.js -b` directly. Lives in the untracked `odd/` tree (deleted at close): recreate it (≈75 lines, see any recent session's own copy in its own commit history for the exact script if needed — it is not committed). Use a replacer function (`s.replace(from, () => to)`). **Use a runtime-opaque disabled-branch condition (e.g. `Date.now() < 0`), never a literal `false`.** After a source edit, re-anchor mutants whose `from` moved. | sessions 28–34 |
| **The AS-IS transports lose error detail** | `GroupTransport`/`DualWriteTransport`. | PR-27, PR-28, PR-31 |
| **`offsets.retry_after_until` is shared** | Per `bot_id`; the poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring. | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | Do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **A shared "must never both be true" property is best enforced by ONE function** | `withRetryAfterIfRetryable(payload, retryAfterS)` (PR-31) is the shape to reach for. | `src/daemon/ipc/routes.ts` |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId`. Extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status`. | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key> --scope <s>`. | sessions 27–34 |
| **Subagents were available all of sessions 27–34** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits; PR bodies end with the Claude Code line. Write long messages to a file and use `git commit -F`. | sessions 27–34 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header, opt-in per file** | A file with no `Provenance:` line is invisible to this test entirely; a file that DOES claim one must be exactly and bidirectionally registered in `v1-provenance.json`. Confirmed directly in PR-34: adding `server.ts`'s header without also adding its fixture row broke `test:static` immediately, exactly as designed. | `test/security/provenance.test.ts`, **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files before `test:static`. | PR-32 record |
| **PT-22's token shape** | Synthetic bot ids use seven digits; no fixture may match `\d{8,10}:[A-Za-z0-9_-]{35}`. | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means no limit; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines truncate silently** | Write files with the file tools, Python, or a small Node script. Verify line counts. | sessions 13–21 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–34 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run. Did not reproduce in PR-23..PR-34 (every leg green on the first attempt across twelve consecutive slices). | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |
| **The global `~/.claude/CLAUDE.md` is a managed, lazy-loadable file — do not assume it's monolithic** | `~/.claude/skills/_shared/` already holds reusable orchestrator-instruction sections. Not relevant to this project's own code. | session 33, out-of-repo |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 168/210. Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4 (all
   flags — they are load-bearing, not optional colour), `tasks.md`'s **PR-35 block**,
   `specs/thin-client-tools/spec.md`'s "Handshake timing" scenario, design.md's §10/§11 (search for `main.ts`,
   `Startup`, `server.connect`, the sequence diagram), ADR-0029 (the "starts within the MCP timeout" guarantee
   this slice completes), and `src/cli/main.ts`'s existing `daemon-stop` dynamic-`import()` subcommand (PR-17) as
   the pattern to mirror for a new `mcp` subcommand.
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram mirror
   `odd/<feature>/tasks`, before the first write.
3. **Branch** `f1/35-client-main-cli-mcp` from `main`, then run §2.2's pipeline:
   - **Decide first, before any code**: `main.ts`'s Provenance status (§3 — likely new code, no header, but read
     design §12's own "REPLACED" definition against v1's `main()` before assuming); the exact node-floor-gate call
     `main.ts` makes (share `daemon/node-floor.ts` if the `client` tsconfig boundary allows it, or confirm it
     needs its own copy); how `main.ts` constructs the single `IpcSession` instance it passes to `createServer`
     (§4's own flagged constraint — construct once, never per tool call).
   - **35.1 RED** `test/client/main.test.ts` ("handshake is lazy, on the first tool call, cached for the
     session": MCP initialization completes within the host timeout even with no daemon running — this test
     should NOT need a real daemon or a real spawn; inject fakes the same way `ipc-stub.test.ts`/`server.test.ts`
     already do).
   - **35.2 GREEN** `src/client/main.ts` (node-floor gate → parse `--project` → `client/binding.ts` walk-up →
     `server.connect(new StdioServerTransport())` immediately) and wire `conmuta mcp --project <id>` as a dynamic-
     `import()` subcommand in `src/cli/main.ts`.
   - **35.3 Verify**: `npm run build && node --test "dist/test/client/main.test.js"`.
4. Audit per §2.2 steps 7–9; merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s status line,
   `state.yaml` (BOTH `completed_slices` AND `tribunal_state` — §4's own drift note — plus `next_recommended`; check
   with `gentle-ai sdd-status`) and the `00-INDEX.md` board if the backlog grew, delete `odd/`, save the session
   summary to Engram, commit on `main`, push, and hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text.
- **PR-01…PR-34 are complete; do not re-slice, re-audit or re-open them.** Units 4–9 are closed; unit 10
  `thin-client-tools` opened with PR-32, continued with PR-33 and PR-34, and continues with PR-35. A defect in a
  merged module is its own slice with its own audit, not a drive-by edit (B-43, B-44, B-45, B-48, B-49, B-50, B-51,
  B-52 wait for such slices).
- **Settled in session 34 and recorded**: `src/client/ipc-stub.ts` owns the daemon-calling half of one MCP session
  — `IpcSession`/`createIpcSession`, session-lifetime-cached via a memoized in-flight promise (`connecting`), with
  a one-retry self-heal on a `401` (stale bearer, most likely a daemon restart) and a bounded, never-looping
  fallback to normal response classification on any other outcome. `client/errors.ts` owns the client-local
  `{code, message, retryable}` constructor (`clientErrorPayload`) for the 4 handshake-raised codes (reusing
  `handshake.ts`'s own `HandshakeErrorCode` type, NOT re-declaring it) plus 4 daemon-passthrough codes (spec-mandated
  vocabulary, not called by production code today — `server.ts`'s `HandshakeError` branch reads `err.retryable`
  directly instead, and daemon-raised errors are forwarded via `shared/error-payload.ts`'s `errorResult` verbatim,
  never reconstructed). `client/server.ts` owns `createServer(deps: {ipc: IpcSession, projectId, now?})` — SEAM from
  `v1:src/index.ts:112-248`, registers the four `conmuta_*` tools (names from `TOOL_PREFIX`), each handler a thin
  `runToolCall` wrapper around `deps.ipc.callTool`. `deps.projectId`/`deps.now` are accepted for shape parity with
  v1's own `AgentBusDeps` but read by nothing in this file yet. `IpcToolResult` is a discriminated union
  (`{ok:true,data}|{ok:false,error}`) — inverting its branches is a compile-time `TS2339`, not a runtime bug, thanks
  to the discriminant.
- **Settled in session 33**: `src/client/binding.ts` owns the synchronous startup walk-up
  (`resolveProjectBinding`) — four refusal kinds. `src/client/handshake.ts` owns the client HALF of the daemon
  handshake (`performHandshake`) — composes `run-state.ts`'s `ensureDaemonRunning` as its own first step, retries
  `GET /identity` at most once, distinguishes `DAEMON_DOWN` from `DAEMON_IDENTITY_MISMATCH` via a three-way
  `IdentityAttempt` result, reimplements its own HMAC helpers locally.
- **Settled in session 32**: `src/client/spawn.ts` owns the one allow-listed `child_process` call site
  (`spawnDaemon`). `src/client/run-state.ts` owns `run/spawn.lock` election and the client's own dead-pid-invalidates
  read of `run/daemon.json`. `ensureDaemonRunning` orchestrates fast-path read, lock race, `spawnIfStillNeeded`,
  `waitForRunFile` (`fs.watch` + `AbortSignal.timeout`, `realpathSync.native`-resolved).
- **Settled in session 31**: `daemon/ipc/routes.ts` owns `POST`/`DELETE /session`, the four `/tools/*` routes, the
  per-session freeze, registry invariant R4, and `toTelegramErrorPayload`.
- **Settled in session 30**: `daemon/ipc/handshake.ts` owns `GET /identity` and `PendingHandshakeStore`;
  `SessionStore.validate` is an unconditional O(N) scan by design.
- **Settled in session 29**: the five `HTTP_*` names plus seven transport/handler-raised statuses live in
  `ipc-contract.ts`; the server validates no route body and checks no bearer.
- **Settled in session 28**: the send tool's rate code is `RATE_LIMITED`; `BindingMutex`/`SendRateBudget` are one
  instance per daemon, instantiated inside `routes.ts`'s `createSessionRoutes` factory — `bootstrap.ts` still does
  not wire `createSessionRoutes`/`createIpcServer` into the daemon's actual boot sequence.
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
  can hide a real correctness bug, and the fastest way to catch it is still Judgment Day, not self-review.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
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
| B-39 | CI (and local runs) intermittently red on two wall-clock tests; re-run once and record. Did not reproduce in PR-23..PR-34. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| PR-11/12/13 escalations | SUGGESTION-class rows that survived their second rounds. Nothing blocks. | Director |
| carried (PR-06) | Digest blind spots (`MAX_THREAD_HISTORY` saturation); the fence does not neutralise `&`. | Director |
| **`bootstrap.ts` still doesn't wire the IPC server** | `createSessionRoutes`/`createIpcServer` exist and are fully tested but nothing in the daemon's actual boot sequence calls either yet. Not blocking so far, but a later PR must close this before the daemon is actually reachable over IPC in production. | a later PR |
| B-16 / D-10, B-11, B-12 / B-13 | Licence files and copyright line; trademark screening; macOS scope; migration runbook (PR-38 — note: this is `tasks.md`'s numeric PR-38 slot, unrelated to the now-merged GitHub PR #38). | Director |
| B-05, B-08, B-09 | F0 spikes still open (B-08's client-side handshake half closed with PR-33; PR-35 continues the client-side surface with the entry point itself). | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI (update to 2.1.0 available for the separate
  `engram` CLI — not yet applied, no functional impact observed), TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **959 tests** (958 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`) — see §4's `fs.watch`
  gotcha if any future code watches a directory under it.
- Verification worktrees: `../telegram_bus_agent-worktrees/` — **empty** at the end of session 34 (`pr34-judges`
  and `pr34-verify` both removed cleanly via the junction-first procedure; stale remote-tracking refs for the
  deleted `f1/34-client-server` branch pruned with `git fetch --prune origin`).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 70–130 s per leg).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it).
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down**. Never quote or commit.
- The global `~/.claude/CLAUDE.md` was reduced from 78.7k to 38k chars in session 33 (unrelated side task, out of
  this repo) — see §4's note if a future session is asked to touch it again.
