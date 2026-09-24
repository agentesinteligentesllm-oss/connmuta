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
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. Session 33
merged **PR-33** (launcher `--project` walk-up/refusal + client identity-verify handshake, PT-26 a/b)
with both blind judges, a separate independent verifier, and **one** of the two re-judgment rounds — the
route §2 describes is the one that produced it. Unit 10 `thin-client-tools` continues with **PR-34**.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-34 (`src/client/ipc-stub.ts` + `src/client/errors.ts` + `src/client/server.ts`, el stub de IPC, el constructor de error cliente-local y `createServer(deps)`, PT-07): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + Judgment Day con ambos jueces + verificador independiente); la Arena no está disponible, así que nada depende de un debate ni de la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** (session 33 deleted its `odd/` tree). The status command must print
`nextRecommended: apply`, `completed: 164`, `pending: 46` (of `210`), `blockedReasons: []`. Anything else:
stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count
yourself with `grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 164).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-33** (PR-33 merged as PR #37, `4ca1de1`; candidate `36683bc`, correction `8975d9f`, re-judgment fix `c91d16c`). **Unit 10 `thin-client-tools` continues with PR-34.** **Next slice: PR-34** — `src/client/ipc-stub.ts` + `src/client/errors.ts` + `src/client/server.ts` (the `deps = {ipc, projectId, now?}` IPC-session stub, the client-local `{code, message, retryable}` error constructor mirroring PR-07a's shape with no Telegram import, `createServer(deps)` keeping v1's tool shape unchanged, PT-07). | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | `tasks.md` has **45 `####`-level PR headers total** (`grep -c '^#### PR-' tasks.md`), of which **36 header lines cover `PR-01`…`PR-33`** and **9 remain, naming `PR-34`…`PR-42`** — both directly counted, unambiguous. Separately, **39 distinct GitHub PRs have actually merged** through PR-33 (three headers — `PR-06`, `PR-08`, `PR-09` — were each re-sliced at apply time into two separately-merged PRs without a second header line, so the "merged" count is higher than the "header lines covered" count — this is the same discrepancy `state.yaml`'s own PR-11 entry already flagged as not fully reconciled; do not force these two counting bases into one subtraction). **Checkboxes: 164 of 210**, always the cleanest single number to cite. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **164/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | `src/shared/*` (15 modules with twins), `src/cli/*`, `src/registry/*`, `src/ledger/*` (11), `src/secret-store/*` (5), `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts`, `src/daemon/lifecycle/*` (4), `src/daemon/transport/*` (5), `src/daemon/serve/*` (3), `src/daemon/send/*` (3), `src/daemon/ipc/{server,handshake,sessions,routes}.ts`, all with twins, and `src/client/{spawn,run-state,binding,handshake}.ts` with twins — the launcher's walk-up and the daemon handshake are now real. **934 tests** (933 pass, 1 skip), `test:static` **8/8**. | PRs `#1`–`#37` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **23 entries** (PR-33 is new code, no v1 range — v1 has no daemon/client split at all). PR-34 (`client/ipc-stub.ts`, `client/errors.ts`, `client/server.ts`) is new code too but `errors.ts` and `server.ts` explicitly **mirror v1 shapes** (PR-07a's error-payload shape, v1's four tool schemas) without being byte-range SEAM vendoring — read `tasks.md`'s PR-34 block and decide whether either file needs a SEAM pin before writing RED. | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-33**, one record each in the tribunal index. PR-23..PR-33: Judgment Day with **both judges** + independent verifier, all **APPROVED** (`bus-v2-f1-pr-2{3..9}-audit-001`, `bus-v2-f1-pr-30-audit-001`, `bus-v2-f1-pr-31-audit-001`, `bus-v2-f1-pr-32-audit-001`, `bus-v2-f1-pr-33-audit-001`). PR-22a/22b: inline passes (the judges were down then). PR-29, PR-30, PR-31 used **both** re-judgment rounds; PR-32 and **PR-33 each used only one** — in both cases the single re-judgment round found only a narrow, single-judge or prose-only residual, parent-corrected and confirmed by full suite + static gates rather than spending the second round. See §6 for what each slice's rounds found. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused before
the child launches (`SDD preflight cancelled or invalid; no session consent recorded`) — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line budget
with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` envelope exists. One variant: if a human has already run `/gentle:sdd-preflight` in the TUI,
or the Director asks, the slice may run through `sdd-apply`.

**2. The per-slice pipeline sessions 27–33 ran — repeat it exactly.**
1. **Map** once (delegated `Explore`, read-only): v1 range (if any), consumed APIs with verbatim signatures, DDL,
   spec, design, the tasks block, and every contradiction between them. For PR-34, also pin down exactly which
   v1 files `errors.ts`/`server.ts` are meant to mirror (PR-07a's error-payload shape; v1's four tool schemas,
   already ported once in `PR-07a`) and whether "mirrors" means a fresh reimplementation or an actual SEAM pin —
   this needs an explicit decision before writing RED, the same way PR-33's exit-code mapping did.
2. **Decide** the open design points yourself (the Director delegated them) and write them into the writer's brief;
   each decision is stated in the module doc and in `apply-progress.md`, and a `tasks.md` *apply-time note* records the
   decisions and any edit outside the block's Scope line.
3. **Write** (delegated `general-purpose`, sonnet): src + twin (+ PT cells only if the block has a Docs task — PR-34's
   does, task 34.4). The writer does not commit. **Insist on RED first** and ask for the verbatim RED lines.
4. **Parent readback** of the source before freezing — it found a defect in every slice since session 28. Session
   33's own readback found a real design/implementation divergence: `handshake.ts`'s own module doc claimed a
   uniform `DAEMON_DOWN` fold for "either route," but the code only did it for `POST /session`, not `GET
   /identity` — a `GET /identity` connection failure was misreported as `DAEMON_IDENTITY_MISMATCH` instead,
   contradicting design.md's own taxonomy table (which explicitly lists "connection refused" under
   `DAEMON_DOWN`). **Verify a documented fact empirically before building a finding on it, even a fact from this
   very file** — session 33 confirmed with a 5-line standalone Node script that `fetch` really does silently
   ignore an explicit `host` header (matching §4's own long-standing fact below) before removing two now-dead
   lines that tried to set one.
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only control that
   MUST survive, BUILD-FAIL and TIMEOUT reported apart. A survivor is a test gap → pin it (that is the behavioural RED);
   an **equivalent** mutant is argued in the record, not pinned; a mutant the suite **cannot observe** is recorded as
   such, not called equivalent. **Use a runtime-opaque condition for a disabled-branch mutant, never a literal
   `false`** — a literal-`false` mutant trips TypeScript's unreachable-code detection (`TS7027`), a legitimate
   BUILD-FAIL that answers nothing about test coverage. **A discriminated union with literal-typed fields (e.g. an
   exit code typed as `typeof EXIT_X` rather than plain `number`) turns an incorrect kind↔value mapping into a
   compile-time BUILD-FAIL, not a runtime survivor** — session 33's own sweep hit this repeatedly (7 of 17
   mutants across two files were BUILD-FAIL this way) and it is a *stronger* guarantee than a killed mutant, not
   a weaker one; do not mistake a clean BUILD-FAIL result for "untested."
6. Full suite + `test:static` from a clean `dist/`; `git add -N` **new files only, never `git add -N .`**; measure
   `git diff --numstat main -- src test`, **summed as additions+deletions per file, not additions alone**
   (`AGENTS.md`'s own ODD section: "counting additions plus deletions"); commit code **with** its records
   (`tasks.md` ticks + size reconciliation + apply-time note, `apply-progress.md` section). **Re-derive a stated
   mutant-sweep tally from the raw sweep output before writing it down, never transcribe it from memory** —
   session 33's own record initially miscounted "4 killed" against 5 actually-named items and omitted one
   BUILD-FAIL mutant from its own prose list, caught independently by Judge A and the independent verifier; this
   is the same class of error PR-31/PR-32 already flagged, now confirmed a third time.
7. **Judgment Day**: frozen worktree, `jd-judge-a` + `jd-judge-b` in parallel, result shape `{findings, evidence}`.
   In parallel, a **separate independent verifier** (`general-purpose`) on its own worktree with a mandate to
   reproduce every figure, re-run the sweeps, write up to six extra mutants and **probe the running code** — it
   found real gaps in every slice (PR-33: 6 of 6 new mutants against `POST /session`'s body construction
   survived, since the existing test only asserted `hmac`, and a standalone probe found the same `readFileSync`
   gap a third, independent way). **The judges have no Bash**: they check figures by reading and arithmetic only;
   the verifier is the one that re-measures. **Two judges converging independently on the identical finding
   without seeing each other's work is a strong signal, not a coincidence** — worth treating as effectively
   pre-confirmed rather than needing a third check.
8. Reproduce single-judge rows before correcting; correct (parent inline for small batches, or a scoped
   `jd-fix-agent` delegation for a larger confirmed batch — PR-33 used the latter for 5 confirmed fixes across 3
   files, then a parent-inline one-line fix for round 1's own single residual); commit code and record together;
   scoped re-judgment over the delta only. **Budget: two re-judgments.** PR-33 used only **one**: its single
   round-1 finding (Judge B alone) was a SUGGESTION-tier, explicitly-pre-existing-pattern gap (`server_nonce`
   only indirectly asserted) — corrected inline (one assertion line), verified by full suite + static gates,
   without spending the second round, the same judgment call PR-32 made for its own narrow single-judge residual.
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude Code line);
   `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Get the untracked inventory with `gentle-ai review status --cwd . --contract
gentle-ai.review-integration/v2 --agent claude-code --next-transition` (field `eligible_untracked_inventory`), then run
`gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha> --committed-only --untracked-scope=exclude
--expected-untracked-inventory=<that sha256:…> --json` and record tier and `review_due`. **Do not START the native review
for a Judgment Day target**: the installed `judgment-day` skill states it replaces ordinary 4R and both must never run on
one target, and START's consent envelope belongs to the Director. Record that in the slice's audit row. (PR-33's own
`assess` at close read `risk: medium`, `review_due: true` — `slice_budget_reached` against `main`, recorded not started.)

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those. This
project has already caught the opposite mistake several times (PT-14 in PR-06a, PT-25's registry/send-path split,
PT-27's own cell in PR-32, PT-26's own cell in PR-33) — the established fix is a **scoped, disambiguated pointer**:
cite the file(s), then parenthesize exactly which clause is covered and where the rest lands, never a silent
full-coverage claim. Do not invent a Docs task where none is warranted; if a mapper finds a PT id a slice genuinely
pins, record that reading in the apply-time note rather than silently adding or silently skipping a cell edit.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip
and labelled with it, **counted as additions+deletions per file** (§2.6 above). PR-30 619 (219), PR-31 1,495 (1,095,
grown across three Judgment Day correction commits, two rounds), PR-32 873 (473-line exception), **PR-33 1,107 at its
final tip** (767-line exception, grown from the candidate's 987 across a `jd-fix-agent` correction commit and a
parent-inline re-judgment-fix commit) — every estimate priced only the primary deliverable; disclosed edits outside
the primary scope line and Judgment Day's own correction rounds are most of the overrun, a pattern holding since
PR-06b. Add a *Size reconciliation* note under the block's header in `tasks.md` (gate text left as written).

**6. Frozen worktrees — the junction rule (session 28 incident, followed cleanly since).** `git worktree add
--detach ../telegram_bus_agent-worktrees/<name> <sha>`. Only the verifier's worktree needs `node_modules`: create the
junction with PowerShell `New-Item -ItemType Junction -Path '<win path>\node_modules' -Target '<main win path>\node_modules'`.
**To remove: delete the junction first with PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`,
verify it is gone (`test -e … || echo removed`) and that `node_modules/typescript/lib/tsc.js` still exists in the main
checkout, and only then `git worktree remove --force`.** `git worktree remove --force` follows a live junction and
empties the main `node_modules`; if that happens, `npm ci` restores it exactly from the shrinkwrap. Session 33 followed
this cleanly (both judges shared one read-only worktree since neither can write; the verifier had its own), plus pruned
stale remote-tracking refs with `git fetch --prune origin` after merge.

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

**8. Waiting on a background agent: never poll.** `ScheduleWakeup` is for `/loop` dynamic-mode sessions only — calling
it (or spawning a throwaway filler agent) just to "wait" for an `Agent`-launched subagent is a misuse the harness
already handles for you: it re-invokes you automatically when the subagent's task-notification arrives. Sessions 32
*and* 33 both made this exact mistake at least once before correcting course (self-caught, no commit affected either
time) — read this point before reaching for `ScheduleWakeup` at all, not after.

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

**PR-32** (`client/spawn.ts`, `client/run-state.ts`) and **PR-33** (`client/binding.ts`, `client/handshake.ts`) are
both **new code, confirmed**: v1 (`telegram-agent-bus`) has no daemon/client split at all — it is a single MCP server
process that talks to Telegram directly, with no lazy-spawn, no daemon-launch, no multi-process logic, no separate
binding-walk-up/handshake step anywhere to vendor. A new module must not spell `Provenance:` in its leading block
(B-33). **PR-34** needs its own decision: `client/ipc-stub.ts` is new (no v1 IPC concept exists), but `client/errors.ts`
and `client/server.ts` are described by `tasks.md` as *mirroring* PR-07a's error-payload shape and v1's four tool
schemas respectively — decide whether that means a fresh reimplementation (new code, no `Provenance:` line, same as
PR-32/33) or an actual SEAM pin against v1's tool-schema source, before writing RED. Older pins are in
`apply-progress.md` and in each module's header. SEAM pins are **not machine-checked** by `provenance.test.ts` (B-42).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **`fetch` cannot set a custom `Host` header — confirmed empirically, not just documented** | Node's `fetch` (undici) silently ignores any explicit `host` header value and always derives the real outgoing `Host` from the request URL's authority component, regardless of what's passed. Confirmed with a standalone script (a loopback HTTP server echoing back `req.headers.host` against both a matching and a deliberately-mismatched explicit header — both received the URL-derived value, never the header's). PR-33's `handshake.ts` originally set `headers: { host: ... } }` on both its `fetch` calls, defensively but pointlessly (removed as dead code in the parent readback). If you ever need to test a *mismatched* Host header against this project's own daemon (e.g. PT-29's DNS-rebinding check), you cannot do it with `fetch` — use `node:http` or a raw socket. | PR-33 record, `apply-progress.md` §PR-33 |
| **A module's own doc comment is a claim about the code, not a description of it — verify prose against code, not just code against prose** | PR-33's own `handshake.ts` module doc claimed "a non-OK or schema-invalid response from **either** route currently folds into `DAEMON_DOWN`," but the shipped code only did that for `POST /session` — `GET /identity`'s failures (including a genuine connection refusal) all fed into one undifferentiated path ending in `DAEMON_IDENTITY_MISMATCH`, contradicting both the doc's own claim and design.md's taxonomy table (which lists "connection refused" under `DAEMON_DOWN`). Found by cross-reading the doc against the design table during the parent's pre-freeze readback, not by reading the doc alone. | PR-33 record |
| **A discriminated union with literal-typed fields turns a whole class of mutant into a compile-time BUILD-FAIL, not a runtime survivor** | `BindingRefusal`'s `exitCode: typeof EXIT_UNBOUND_PROJECT` (a literal type, not plain `number`) means swapping which exit constant a refusal kind carries is a TypeScript compile error, not something a test needs to catch at runtime. `IdentityAttempt`'s three-way `kind` discriminant does the same for the handshake retry logic's branch conditions. Session 33's own 17-mutant sweep across two files got 7 BUILD-FAIL results this way — a *stronger* guarantee than a killed mutant, not a gap. Reach for a literal-typed field (or a closed string-literal union) whenever a value's *identity*, not just its *type*, is a correctness-relevant invariant. | `src/client/binding.ts`, `src/client/handshake.ts` |
| **Two judges independently converging on the identical finding, without seeing each other's work, is strong signal** | Both `jd-judge-a` and `jd-judge-b` independently flagged the exact same `binding.ts`/`readFileSync`/`EISDIR` gap in PR-33's original Judgment Day round, using different framing and different proof_refs. Treat this pattern (when it happens) as effectively pre-confirmed rather than something that still needs a third independent check before acting on it. | PR-33 Judgment Day round 1 |
| **A parent's own mutant-sweep tally needs re-derivation from the raw sweep JSON, not transcription from memory** | PR-33's own `apply-progress.md` initially miscounted its `handshake.ts` sweep as "4 killed" while naming 5 items, and listed only 3 of 4 BUILD-FAIL mutants by name (though the bucket count "4" was still numerically right) — caught independently by Judge A and the verifier, both of whom re-summed the named items rather than trusting the stated total. Recount from the actual per-mutant verdict list every time, the same lesson PR-31/PR-32 already recorded for authored-line totals. | PR-33 record |
| **`parseProjectFile` already exists — do not reimplement `conmuta.json` parsing** | `src/shared/project-file.ts` exports `parseProjectFile(text: string): ProjectFileResult` (strict-parse of a committed `conmuta.json`, including roster uniqueness via `applyRosterUniqueness`) — pure, no I/O of its own; the caller (`client/binding.ts`) does the cwd→root walk-up and hands it raw text. Freely importable from `client/*` (`client/tsconfig.json` already references `../shared`). | `src/shared/project-file.ts` |
| **`resolveProjectBinding` never throws — every walk-up failure is a typed refusal, including an unreadable path** | Four `BindingRefusal` kinds now: `no_project_file_found`, `unreadable_project_file` (new in PR-33's correction round — a directory named `conmuta.json`, a TOCTOU deletion, a permission error), `invalid_project_file` (found, but `parseProjectFile` rejected the content), `project_id_mismatch`. A found-but-broken-or-unreadable file always stops the walk-up at that exact point — it is never silently skipped in search of a different, valid ancestor project (a deliberate anti-misbinding choice). | `src/client/binding.ts` |
| **`performHandshake` composes `run-state.ts`'s already-merged `ensureDaemonRunning` as its own first step** | Zero `fetch` calls happen if that step fails — the guarantee is structural (the `try` around it is the only thing between entry and the first possible network call), not merely observed. The retry-once-on-identity-failure path distinguishes "never got a usable response" (`DAEMON_DOWN`) from "got a response, proof failed to verify" (`DAEMON_IDENTITY_MISMATCH`) via a three-way `IdentityAttempt` result — do not collapse these back into one `undefined`-shaped signal. | `src/client/handshake.ts` |
| **HMAC helpers are locally reimplemented in `client/*`, not imported from `daemon/ipc/*`** | Same disclosed boundary `run-state.ts` already established for PR-32: `client/tsconfig.json`'s `references` is `[{"path":"../shared"}]` only, so there is no `tsc -b` project-reference path from `client/*` to `daemon/*`. `handshake.ts` reimplements `computeIdentityProof`/`computeSessionProof`/`hexDigestsEqual` using the identical `"identity:"`/`"session:"` domain-separation labels. | `src/client/handshake.ts`, `src/daemon/ipc/{handshake,sessions}.ts` |
| **`IPC_REQUEST_TIMEOUT_MS` (70s, sized for the daemon's long-poll) is reused for the handshake — disclosed, deferred as B-51** | `GET /identity`/`POST /session` both use it, and identity can attempt twice — a worst-case ~140s wait before `DAEMON_DOWN` on a stalled-not-refused connection. Not a correctness bug (the timeout mechanism itself works, confirmed by direct probe); a future PR should introduce a dedicated, much shorter `IPC_HANDSHAKE_TIMEOUT_MS`. | **B-51** |
| **Windows `fs.watch()` crashes natively on an 8.3 short path — general gotcha, not PR-32-specific** | This machine's `os.tmpdir()` (and therefore every `mkdtempSync`-based test fixture) returns an 8.3 short path (`C:\Users\LABORA~1\...`). Calling `fs.watch()` on a directory reached via its short-path form crashes the whole Node process natively (`Assertion failed: !_wcsnicmp(filename, dir, dirlen)`, libuv `src/win/fs-event.c`). Fix: resolve with `realpathSync.native(dirPath)` before calling `watch()`. Will bite **any future `fs.watch()` use** on this machine, not just `client/run-state.ts`. | `src/client/run-state.ts`'s `waitForRunFile` |
| **`test/client/` conventions** | Contains `spawn.test.ts`, `run-state.test.ts`, `binding.test.ts`, `handshake.test.ts` — real temp dirs via `mkdtempSync`, cleaned in a `finally`, real `process.pid` for "this process," explicit `now`/injectable-implementation parameters rather than an injected Clock object, small fakes (a fake `fetch`, a fake `ensureDaemonRunning`) hand-written inline per file rather than shared via `test/fakes/` on first use. `test/fakes/clock.ts` still does not exist. | `test/client/*.test.ts` |
| **`state.yaml`'s own "row id" counter is flagged, by the project itself, as unreliable** | Its PR-11 entry already states the carried "of-the-45-rows" counter does not resolve against `tasks.md`'s actual 45-block/42-row-id shape. Cite PR blocks (verifiable: `grep -c '^#### PR-' tasks.md`) and task checkboxes (verifiable: the §0 command) instead. | `state.yaml`'s PR-11 `completed_slices` entry |
| **A parent's own record prose needs the same distrust as a subagent's** | Confirmed a third time in PR-33 (the mutant-tally miscount above), after PR-31/PR-32's authored-line arithmetic slips. Recompute a stated figure from the actual raw output before writing it, don't propagate a number from memory or a prior draft. | PR-31, PR-32, PR-33 records |
| **Sweep harness needs bounds** | A mutant that breaks a network path leaves test clients waiting forever: run tests with `--test-timeout=5000` and `spawnSync(process.execPath, …, { timeout: 150000 })` **without a shell** (with `shell: true` the kill reaches `cmd.exe`, not `node`). Report `KILLED(TIMEOUT)` apart. Every socket-waiting test needs its own timeout too. | sessions 29–33 |
| **`git add -N` — scope it, never `.` (and the same discipline applies to `git stash -u`)** | Always name the specific new files for `add -N`; for an actual clean-`main` measurement, use a throwaway `git worktree add --detach` instead of touching the working tree at all. | sessions 30–31 |
| **Node HTTP facts** | An HTTP/1.1 request with no `Host` line is refused by Node's parser (bare 400) before any handler; duplicate/negative/garbage `Content-Length` and `Transfer-Encoding` + `Content-Length` are refused the same way; `fetch` cannot set `Host` (confirmed empirically in PR-33, see above; use `node:http` or `net` to test a mismatch); a client still writing past a refusal may get a reset instead of the response. | PR-29, PR-33 records |
| **A writer's RED is usually compile-level** (`TS2305`/`TS2307`/`TS2339`). | The behavioural RED is the parent's: readback fixes and sweep survivors, each pinned by a test that fails without the fix. | sessions 27–33 |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; it builds via `node_modules/typescript/lib/tsc.js -b` directly (not `npx`, avoids a shell), restores the file and checks its sha256. Lives in the untracked `odd/` tree (deleted at close): recreate it (≈75 lines). Use a replacer function (`s.replace(from, () => to)`): a `$` + backtick in a replacement string is a special pattern. **Use a runtime-opaque disabled-branch condition (e.g. `Date.now() < 0`), never a literal `false`** — TS's unreachable-code detection (`TS7027`) turns a literal-`false` mutant into an uninformative BUILD-FAIL. After a source edit, re-anchor mutants whose `from` moved. A mutation TypeScript itself rejects at build time is a legitimate **BUILD-FAIL** — and with a discriminated union, this can mean the sweep is *stronger* than expected, not broken (see above). | sessions 28–33 |
| **The AS-IS transports lose error detail** | `GroupTransport` turns a guard refusal or a 429 into a soft `{ok: false, code}`; `DualWriteTransport` drops a DM error's cause. Send-side checks run before the call or through the ledger. | PR-27, PR-28, PR-31 |
| **`offsets.retry_after_until` is shared** | Per `bot_id`, written by the poller and by `send/rate.ts`; the poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring anything. | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | An async callback is refused before `BEGIN`; do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **A shared "must never both be true" property is best enforced by ONE function, not per-branch checks** | `withRetryAfterIfRetryable(payload, retryAfterS)` (PR-31) is the shape to reach for whenever a slice needs the same invariant enforced from more than one call site. | `src/daemon/ipc/routes.ts` |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId` in `serve/fetch.ts`, `serve/status.ts` and `serve/thread.ts`. Extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status` (§2.3). | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key> --scope <s>` (the `--scope` flag exists — use `global` for a cross-project memory, omitted defaults to `project`). | sessions 27–33 |
| **Subagents were available all of sessions 27–33** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits (global rule); PR bodies end with the Claude Code line. Write long messages to a file and use `git commit -F`. | sessions 27–33 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header** | A non-vendored module must not spell `Provenance:` there; a module doc belongs in the leading block, before or after the imports (PR-33 confirmed: `client/*`'s own convention is doc-after-imports, unlike `daemon/ipc/*`'s doc-before-imports — match the sibling files in whichever directory you're adding to). | **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files (named explicitly) before `test:static`, or PT-22's own repo scan silently skips them. | PR-32 record |
| **PT-22's token shape** | Synthetic bot ids use seven digits (`1234567:${"A".repeat(35)}`); no fixture may match `\d{8,10}:[A-Za-z0-9_-]{35}`. | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means **no limit**; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines truncate silently** | Write files with the file tools or Python; verify line counts. | sessions 13–21 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`state.yaml` is YAML with one enormous single-line string field** | `completed_slices` is one continuously-growing double-quoted YAML string — extract its tail with a small Node script (`content.lastIndexOf("PR-XX")`) rather than `grep`/`sed`, which truncate on a multi-KB single line. Never introduce an unescaped `"` inside the appended text. Parse (or at least run `gentle-ai sdd-status` and check `taskProgress`) after editing. | sessions 28–33 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–33 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run. Did not reproduce in PR-23..PR-33 (every leg green on the first attempt across eleven consecutive slices). | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |
| **The global `~/.claude/CLAUDE.md` is a managed, lazy-loadable file — do not assume it's monolithic** | Session 33 (a side task, unrelated to this repo's own SDD work) found `~/.claude/skills/_shared/` already holds reusable orchestrator-instruction sections fed by an install/sync tool; large reference-heavy content belongs there with a short pointer left inline, mirroring the file's own pre-existing "SDD Workflow (lazy-loaded)" pattern. Not relevant to this project's own code, but relevant if a future session is asked to touch that file again — check `~/.claude/skills/_shared/` before assuming new content needs a new file. | session 33, out-of-repo |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 164/210. Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4 (all
   flags — they are load-bearing, not optional colour), `tasks.md`'s **PR-34 block**,
   `specs/thin-client-tools/spec.md`'s requirements this slice implements — the client-local error payload
   constructor (PT-07) and the four tool input schemas ported unchanged — and design.md's relevant sections for
   `ipc-stub.ts`/`errors.ts`/`server.ts` (search design.md for `createServer`, `IpcSession`, and the client
   error-taxonomy table §10 already read for PR-33, which `errors.ts` will likely need again).
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram mirror
   `odd/<feature>/tasks`, before the first write.
3. **Branch** `f1/34-client-server` from `main`, then run §2.2's pipeline:
   - **Decide first, before any code**: whether `errors.ts`/`server.ts` are fresh reimplementations (new code, no
     `Provenance:` line, matching PR-32/33's own precedent) or need an actual SEAM pin against v1's tool-schema
     source and PR-07a's error-payload shape — read `tasks.md`'s PR-34 block, PR-07a's own shipped
     `shared/error-payload.ts`, and v1's four tool schemas before deciding, and disclose the reading.
   - **34.1 RED** `test/client/errors.test.ts` ("client-local codes need no Telegram import": the built client
     bundle has no reference to the Telegram-classification module) and `test/client/server.test.ts` ("tool count
     and shapes are unchanged" against v1's four schemas from PR-07a).
   - **34.2 GREEN** `src/client/ipc-stub.ts` (`deps = {ipc: IpcSession, projectId, now?}`), `src/client/errors.ts`
     (client-local `{code, message, retryable}` constructor mirroring PR-07a's shape), `src/client/server.ts`
     (`createServer(deps)` keeps v1's shape; tool names from `TOOL_PREFIX`).
   - **34.3 Verify**: `npm run build && node --test "dist/test/client/ipc-stub.test.js" "dist/test/client/errors.test.js" "dist/test/client/server.test.js"`.
   - **34.4 Docs**: update the file-name cell(s) of PT-07 in `THREAT-MODEL.md` §4, matching the scoped-pointer
     convention §2.4 describes.
4. Audit per §2.2 steps 7–9; merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s status line,
   `state.yaml` (counts, `completed_slices`, `tribunal_state`, `next_recommended`; check with
   `gentle-ai sdd-status`) and the `00-INDEX.md` board if the backlog grew, delete `odd/`, save the session summary to
   Engram, commit on `main`, push, and hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text.
- **PR-01…PR-33 are complete; do not re-slice, re-audit or re-open them.** Units 4–9 are closed; unit 10
  `thin-client-tools` opened with PR-32, continued with PR-33 and continues with PR-34. A defect in a merged module
  is its own slice with its own audit, not a drive-by edit (B-43, B-44, B-45, B-48, B-49, B-50, B-51 wait for such
  slices).
- Settled in session 33 and recorded: `src/client/binding.ts` owns the synchronous startup walk-up
  (`resolveProjectBinding`) — four refusal kinds (`missing_project_flag`→`EXIT_USAGE`, `no_project_file_found`→
  `EXIT_UNBOUND_PROJECT`, `unreadable_project_file`→`EXIT_UNBOUND_PROJECT`, `invalid_project_file`→
  `EXIT_UNBOUND_PROJECT`, `project_id_mismatch`→`EXIT_PROJECT_MISMATCH`), never touches the network, reuses
  `parseProjectFile` rather than hand-rolling parsing. `src/client/handshake.ts` owns the client HALF of the daemon
  handshake (`performHandshake`) — composes `run-state.ts`'s `ensureDaemonRunning` as its own first step, retries
  `GET /identity` at most once (re-read, never re-spawn), distinguishes "never got a response" (`DAEMON_DOWN`) from
  "got a response, proof failed" (`DAEMON_IDENTITY_MISMATCH`) via a three-way `IdentityAttempt` result, reimplements
  its own HMAC helpers locally (same disclosed `client/*`→`daemon/*` boundary PR-32 established) rather than
  importing the daemon's. `DAEMON_VERSION_MISMATCH`/`IPC_ERROR`/`DAEMON_IDENTITY_MISMATCH` are confirmed exclusively
  client-side vocabulary with no daemon-side implementation surface anywhere (grepped and confirmed in PR-33's own
  audit). `IPC_REQUEST_TIMEOUT_MS` reuse for the handshake is a disclosed, deferred limitation (B-51), not a defect
  to fix opportunistically.
- Settled in session 32: `src/client/spawn.ts` owns the one allow-listed `child_process` call site
  (`spawnDaemon`, an injectable `REAL_SPAWN`-defaulted parameter beyond design's own illustrative snippet — a
  disclosed apply-time refinement, not a deviation from D-01's actual guarantee). `src/client/run-state.ts` owns
  `run/spawn.lock` election (`acquireSpawnLock`, `releaseSpawnLock`, `spawnLockAgeSeconds`) and the client's own
  dead-pid-invalidates read of `run/daemon.json` (`readRunFile`) — both locally reimplemented, never importing
  `daemon/lifecycle/*`, a chosen isolation (verified: extending `client/tsconfig.json`'s references would let the
  cross-import compile) kept for dependency-closure reasons, not a structural wall. `ensureDaemonRunning`
  orchestrates: fast-path read, race for the lock, `spawnIfStillNeeded` (the extracted, directly-tested TOCTOU-safe
  winner-path body), `waitForRunFile` (`fs.watch` + `AbortSignal.timeout`, `realpathSync.native`-resolved to avoid
  the Windows short-path crash). A client never touches `run/daemon.lock` — pinned by a test reading the compiled
  source for the string-literal form, not a blind substring match (the module's own doc comments legitimately
  mention the filename in prose).
- Settled in session 31: `daemon/ipc/routes.ts` owns `POST`/`DELETE /session`, the four `/tools/*` routes, the
  per-session freeze (3 fields only: `bot_id`, `group_id`, `agent_id`), registry invariant R4, and
  `toTelegramErrorPayload`. `daemon/ipc/sessions.ts`'s `SessionStore` has `revoke(bearer): boolean`.
  `shared/ipc-contract.ts`'s `sessionRequestSchema` includes `server_nonce: nonceHexSchema`. `shared/error-payload.ts`'s
  `RETRYABLE_TOOL_CODES` includes `RATE_LIMITED` alongside `TRANSPORT_ERROR`.
- Settled in session 30: `daemon/ipc/handshake.ts` owns `GET /identity` and `PendingHandshakeStore` (single-use
  `server_nonce`, lazy TTL); `SessionStore.validate` is an unconditional O(N) scan (no early return) by design.
- Settled in session 29: the five `HTTP_*` names plus seven transport/handler-raised statuses live in
  `ipc-contract.ts`; the server's six `IPC_*` refusal codes are daemon transport vocabulary, `IPC_HANDSHAKE_FLOOD`
  is a disclosed 7th, handler-raised and retryable; the server validates no route body and checks no bearer.
- Settled in session 28: the send tool's rate code is `RATE_LIMITED`; the send path pre-checks the room with
  `RoomGuardClient.assertTarget`; a 429 reaches the send path through `offsets.retry_after_until`; `BindingMutex`
  and `SendRateBudget` are one instance per daemon, instantiated inside `routes.ts`'s `createSessionRoutes` factory
  — `bootstrap.ts` still does not wire `createSessionRoutes`/`createIpcServer` into the daemon's actual boot
  sequence; that remains open for a later PR.
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

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-51** | `client/handshake.ts` reuses the 70s long-poll `IPC_REQUEST_TIMEOUT_MS` for its own `GET /identity`/`POST /session` calls, risking a ~140s worst-case hang on a stalled (not refused) daemon connection before reporting `DAEMON_DOWN`. Not a correctness bug — the timeout mechanism itself works correctly. | Director |
| **B-50** | `daemon/ipc/routes.ts`'s `dispatchTool` forwards a caught tool-level error's message to the external caller with no defense-in-depth redaction pass, unlike every other egress site design's Redaction table names. No concrete leak demonstrated; matches the existing B-37/B-38 precedent. Needs a dedicated slice. | Director |
| **B-49** | spec.md's "Binding never changes mid-session" scenario reads as freezing the whole binding; the shipped freeze is scoped to three identity fields only. Text-only fix at the next spec touch. | Director |
| **B-48** | Design §15's PT-24/PT-26 file pins (`daemon/ipc/server`, `client/handshake`) look stale against the later `ipc/{handshake,sessions,routes}` split. Text-only fix at the next design touch. | Director |
| **B-47** | THREAT-MODEL traces the IPC `Host` check (DNS rebinding) only to the F3 panel (T18, PT-29) and no PT pins the body cap; PR-29 ships both with tests. Text-only fix at the next THREAT-MODEL touch. | Director |
| **B-45** | The poller writes `TELEGRAM_RATE_LIMITED` to `offsets.last_error_code` (DATA-MODEL says `RATE_LIMITED`), audits no 429, and clears `retry_after_until` on every successful poll — which can erase a send-side backoff early. The one open point with runtime effect. | Director → Kairo |
| **B-46** | Design §9 names the rate refusal `TELEGRAM_RATE_LIMITED`; the shipped tool code is `RATE_LIMITED`. Text-only amendment. | Director |
| **B-44** | A room-guard refusal inside a misbuilt transport degrades the send and raises `group_outage` instead of `WRONG_ROOM`. | Director |
| **B-43** | `serve/thread.ts:204` still tells the agent to run `agentbus_fetch`; `admission.ts`'s header points at a fixture that carries no hash. | Director → Kairo |
| **B-42** | SEAM `v1 body sha256` pins are not machine-checked (the v1 checkout is not in CI). | Director |
| **B-40 / B-41** | Design conditions with no contract (`poller_conflict`/`poller_rate_limited`; `secret_store_fallback`). | Director |
| B-39 | CI (and local runs) intermittently red on two wall-clock tests; re-run once and record. Did not reproduce in PR-23..PR-33. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| PR-11/12/13 escalations | SUGGESTION-class rows that survived their second rounds. Nothing blocks. | Director |
| carried (PR-06) | Digest blind spots (`MAX_THREAD_HISTORY` saturation); the fence does not neutralise `&`. | Director |
| **`bootstrap.ts` still doesn't wire the IPC server** | `createSessionRoutes`/`createIpcServer` exist and are fully tested but nothing in the daemon's actual boot sequence calls either yet. Not blocking — no PR before now needed it wired — but a later PR must close this before the daemon is actually reachable over IPC in production. | a later PR (PR-34's `createServer(deps)` or the daemon-side wiring it depends on) |
| B-16 / D-10, B-11, B-12 / B-13 | Licence files and copyright line; trademark screening; macOS scope; migration runbook (PR-38). | Director |
| B-05, B-08, B-09 | F0 spikes still open (B-08 — IPC handshake and named-pipe DACL on Windows — closed its daemon-side half with PR-31 and its client-side handshake half with PR-33; PR-34/35 continue the client-side surface). | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI (update to 2.1.0 available for the separate
  `engram` CLI — not yet applied, no functional impact observed), TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **934 tests** (933 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`) — see §4's `fs.watch`
  gotcha if any future code watches a directory under it.
- Verification worktrees: `../telegram_bus_agent-worktrees/` — **empty** at the end of session 33 (`pr33-judges`
  and `pr33-verify` both removed cleanly via the junction-first procedure; stale remote-tracking refs for old
  deleted branches pruned with `git fetch --prune origin`).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 70–100 s per leg).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it).
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down**. Never quote or commit.
- The global `~/.claude/CLAUDE.md` was reduced from 78.7k to 38k chars in session 33 (unrelated side task, out of
  this repo) — see §4's note if a future session is asked to touch it again.
