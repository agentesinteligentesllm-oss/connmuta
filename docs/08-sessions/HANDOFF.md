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

**Check Arena Orion FIRST, before assuming Judgment Day — this has now held for thirteen
consecutive sessions (PR-06 through PR-38), but never assume it stays that way.** Session 38 checked
`curl --max-time 5 http://127.0.0.1:8766/mcp` live at its own start and got connection-refused (exit
7, HTTP 000), identical to session 37. **Do not assume that is still true — check again, live, at
the start of this session**, with the same `curl` probe and/or `gentle-ai review status` (its
MCP-server connection list will show `arena` as either connected or `ECONNREFUSED`). If Arena
responds: read [`docs/01-constitution/GOVERNANCE.md`](../01-constitution/GOVERNANCE.md)'s
debate/audit process fresh before starting — that protocol has not been exercised in this project
since early F1 and is not re-derived in this file; do not improvise it from memory of Judgment Day's
shape, they are not the same protocol. If Arena is still down, everything in this file's §2 (the ODD
+ Judgment Day pipeline) applies unchanged, exactly as it has for PR-06 through PR-38.

Session 38 merged **PR-38** (`test/fixtures/v1-home/{config,state}.json` + `test/migration/integration.test.ts`
+ `docs/runbooks/migrate-from-v1.md`) with both blind judges, a separate independent verifier, and
**both** of the two re-judgment rounds — the first PR since PR-31 to need both. **Unit 11
`v1-migration` CLOSES. Unit 12 `static-assertions-plus-wrong-row-ci` opens with PR-39.**

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-39 (`test/security/predicates.ts` SEAM +
`test/security/closure.ts` + twin, abre la unidad 12 `static-assertions-plus-wrong-room-ci`): lee
primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
Antes de nada, verifica si la Arena Orion (http://127.0.0.1:8766/mcp) responde: si sí, la auditoría
corre ahí (lee GOVERNANCE.md, ese protocolo no está resumido en el handoff); si no, cae de vuelta a
ODD + Judgment Day (ambos jueces + verificador independiente) exactamente como las últimas 13 sesiones.
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
`completed: 182`, `pending: 28` (of `210`), `blockedReasons: []`. Anything else: stop and report.
(`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count yourself with
`grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 182).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-38** (PR-38 merged as PR #42, `5c0f20b`; candidate `e0c9763`, correction 1 `eec6e57`, correction 2 `6c35405`). **Unit 10 `thin-client-tools` is CLOSED. Unit 11 `v1-migration` is CLOSED (PR-36, PR-37, PR-38).** **Next slice: PR-39** — `test/security/predicates.ts` (a SEAM extracted verbatim from `telegram-agent-bus/test/security.test.ts:25-101`), `test/security/closure.ts` (a transitive relative-import closure walker over `dist/src/**`), `test/security/closure.test.ts`, plus one appended SEAM entry in `test/fixtures/v1-provenance.json`. This **opens** unit 12 `static-assertions-plus-wrong-room-ci`. Per `tasks.md`'s own PR-39 block (lines 1211-1224 at last count, re-read it yourself — PR-38's own apply-time notes pushed everything after it down by roughly 46 lines): four sub-tasks: 39.1 RED (add the SEAM fixture entry, confirm `provenance.test.ts` fails before the file exists), 39.2 GREEN (implement `predicates.ts` with a `verdict: SEAM` provenance header and its `v1 body sha256`), 39.3 RED (a `closure.test.ts` unit test for a two-hop fixture closure, correctly excluding an unrelated module), 39.4 GREEN (implement `closure.ts`), 39.5 Verify. **This is a SEAM/vendored-range slice, not a design-decision slice** — the map step is about getting the verbatim extraction and its hash exactly right, not resolving open questions; contrast with PR-38's three-mapper design-resolution shape. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | `tasks.md` has **45 `####`-level PR headers total** (`grep -c '^#### PR-' tasks.md`), of which **41 header lines cover `PR-01`…`PR-38`** and **4 remain, naming `PR-39`…`PR-42`** — both directly counted, unambiguous. Separately, **44 distinct GitHub PRs have actually merged** through PR-38 (three headers — `PR-06`, `PR-08`, `PR-09` — were each re-sliced at apply time into two separately-merged PRs without gaining a second header line; this discrepancy is already flagged unreconciled in `state.yaml`'s own PR-11 entry — do not force these two counting bases into one subtraction). **Checkboxes: 182 of 210**, always the cleanest single number to cite. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **182/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | Everything PR-01…PR-37 already shipped (see prior handoffs / `apply-progress.md` for the full inventory), plus **`test/fixtures/v1-home/{config,state}.json`, `test/migration/integration.test.ts`, `docs/runbooks/migrate-from-v1.md`** — no new `src/` file at all, the first slice in this project with none. `docs/runbooks/migrate-from-v1.md` is the design §13-mandated deliverable of this whole SDD change. **1044 tests** (1043 pass, 1 skip), `test:static` **8/8**. | PRs `#1`–`#42` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **26 entries, unchanged this session** (PR-38 added no new `src/` file, nothing to vendor from). **PR-39 WILL need a new entry** — its own `predicates.ts` is a SEAM extraction from `telegram-agent-bus/test/security.test.ts:25-101` and must be pinned the same way every other SEAM module is. | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-38**, one record each in the tribunal index. PR-23..PR-38: Judgment Day with **both judges** + independent verifier, all **APPROVED**. PR-32 through PR-37 each used only **one** of the two re-judgment rounds; **PR-38 used both** — the first PR since PR-31 to need both, because its round-2 residual was CRITICAL-tier (a fix-caused heading/body contradiction), not WARNING/SUGGESTION-tier like every skip-the-second-round case since PR-30. See §6 for what each slice's rounds found. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**0. Arena-first routing (supersedes nothing below — it is a gate IN FRONT of everything else).**
Check Arena reachability live at session start (§0). If reachable: the audit route for this slice is
Arena tribunal debate, not Judgment Day — read `GOVERNANCE.md`'s debate process before acting on it,
since this file does not carry that protocol's steps. If Arena is still down: fall through to point 1
below, unchanged from every session since PR-06 (now thirteen in a row).

**1. Workflow (Judgment Day fallback): ODD, with every substantive SDD contract preserved.** `sdd-apply`
dispatch is refused before the child launches (`SDD preflight cancelled or invalid; no session consent
recorded`) — a host-owned gate an agent cannot satisfy. So: ODD is the route; the slice honours the same
design rows, the same `tasks.md` sub-tasks, Strict TDD (red before green, twins), the pinned hashes and
provenance fixture, the 400-line budget with disclosed exceptions, and a tribunal-grade audit; the
orchestrator owns the SDD bookkeeping and discloses that no `sdd-apply` envelope exists. One variant: if
a human has already run `/gentle:sdd-preflight` in the TUI, or the Director asks, the slice may run
through `sdd-apply`. Another variant, still live: if Arena is reachable, point 0 above overrides this
whole section.

**2. The per-slice pipeline sessions 27–38 ran — repeat it exactly if still on the Judgment Day
fallback. Session 38 is the thirteenth consecutive session on this identical route, and it is the
first one where the parent readback found NO defect, because the writer's own empirical
self-correction already covered what it would have caught.**
1. **Map** once (delegated `Explore` or `general-purpose`, read-only): for a SEAM/vendored-range slice
   like PR-39, this means confirming the EXACT cited v1 line range (`telegram-agent-bus/test/security.test.ts:25-101`)
   still holds at commit `bf8f365`, computing its LF-normalized body sha256 yourself (validate your
   method first — see §3), and checking the closure-walker's own requirements (design §14's table: a
   transitive closure of relative `import`/`export … from` specifiers) against `design.md` verbatim,
   not this file's paraphrase. For a design-decision-heavy slice (as PR-38 was), map every consumed
   API's verbatim signature, spec, design, the tasks block, and every contradiction between them —
   three parallel mappers is the right size when there are genuinely 3+ independent open questions;
   one mapper (or zero, doing it inline) is right for a narrow SEAM extraction like PR-39.
2. **Decide** the open design points yourself (the Director delegated them) and write them into the
   writer's brief; each decision is stated in the module doc and in `apply-progress.md`, and a
   `tasks.md` *apply-time note* records the decisions and any edit outside the block's Scope line.
   PR-39 likely has few or none — a SEAM extraction's "decisions" are mostly "confirm the pin, don't
   improvise a different range."
3. **Write** (delegated `general-purpose`, sonnet): give the writer the exact decisions AND the exact
   already-known facts (signatures, exit codes, file paths) rather than asking it to re-derive them —
   PR-38's own brief did this and the writer still found two things the brief got wrong, by testing
   empirically rather than trusting the brief blindly; encourage that in the brief itself. The writer
   does not commit. **Insist on RED first** and ask for the verbatim RED lines.
4. **Parent readback** before freezing — it has found a real, non-cosmetic defect in most slices since
   session 28, but PR-38 broke that streak (the writer's own self-correction already covered it). Do
   the readback anyway, every time — it is the backstop for when the writer does NOT self-correct.
   **Generalizable rule confirmed again this session, worth re-checking on anything touching a real
   child-process boundary**: when a test spawns the REAL, un-injected build (no fakes across the
   process boundary), any collaborator that build depends on (a secret store, a database, a network
   call) is exercised for REAL too — check explicitly whether that collaborator's side effects (a
   credential, a file, a socket) get cleaned up, in EVERY code path that reaches it, not just the one
   path an assertion happens to check.
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only
   control that MUST survive, BUILD-FAIL and TIMEOUT reported apart. Delegate the actual sweep-running to
   a `fork` once the harness and mutant list are written — **this session the fork's FIRST reply made
   zero tool calls and only described the plan in prose; it had to be resumed with an explicit
   "actually execute, do not describe" instruction before the sweep ran for real.** Treat a fork's
   first response with `tool_uses: 0` as suspect, not as evidence the task is done, before trusting a
   background-agent report of this kind again. For a SEAM/no-`src/`-change slice like PR-39, the sweep
   still has a target: mutate the code the NEW test exercises (here, the closure walker itself, since
   `predicates.ts` is a vendored extraction with no new logic of its own to mutate meaningfully beyond
   the provenance-hash check that already guards it).
6. **Run the FULL test suite before freezing, not just the new/touched test files.** `git add -N` the
   specific new files (never `git add -N .`) before running the full suite or `test:static`. **New
   this session: never run `npm test` and `npm run test:static` concurrently — both invoke `tsc -b`
   against the same shared `dist/`, and running them in parallel produced one spurious assertion
   failure from a build mid-rewrite.** Run verification commands sequentially, one at a time, in the
   foreground.
7. **Judgment Day** (only if Arena is still down, per point 0): frozen worktrees, `jd-judge-a` +
   `jd-judge-b` in parallel over a SHARED worktree (they have no Bash, so it needs no `node_modules`
   junction). In parallel, a **separate independent verifier** (`general-purpose`) on its OWN worktree
   WITH a `node_modules` junction, with a mandate to reproduce every figure, re-run the sweeps, write up
   to six extra mutants and **probe the running code**. **The judges have no Bash**: they check figures
   by reading and arithmetic only; the verifier is the one that re-measures. **A judge that explicitly
   CONSIDERS an issue and declines to report it is giving you real signal too, not silence.** **Both
   judges independently converging on the identical finding, unprompted, remains this project's
   strongest corroboration signal — confirmed yet again this session (the same 2 CRITICAL, found by
   both judges independently, with no shared context).**
8. Reproduce single-judge rows before correcting yourself, directly from the code (or, for a
   documentation-only candidate like PR-38, directly from the file's own text), when the finding is
   something you can verify by reading; correct (parent inline for small batches, or a scoped
   `jd-fix-agent` delegation for a larger confirmed batch); commit code and record together; scoped
   re-judgment over the delta only. **A scoped re-judgment round is MANDATORY before any APPROVED
   verdict.** **Budget: two re-judgments.** PR-38 used **both** — its round-1 finding was already
   both-judges CRITICAL (no skip-eligible either way), and its round-2 finding, though single-judge,
   was ALSO CRITICAL-tier (a fix-caused heading/body contradiction) — **this project's established
   "a narrow, well-understood single-judge round-2 residual doesn't need the second round" precedent
   (PR-30 through PR-37) has so far been applied only to WARNING/SUGGESTION-tier round-2 residuals; PR-38
   did not extend it to a CRITICAL one, even though the fix itself was a single heading phrase.** Keep
   applying that same severity-gated distinction, not a blanket "narrow fix = skip" rule.
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude
   Code line); `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Get the untracked inventory with `gentle-ai review status --cwd . --contract
gentle-ai.review-integration/v2 --agent claude-code --next-transition` (field `eligible_untracked_inventory`), then run
`gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha> --committed-only --untracked-scope=exclude
--expected-untracked-inventory=<that sha256:…> --json` and record tier and `review_due`. **Do not START the native review
for a Judgment Day target**: the installed `judgment-day` skill states it replaces ordinary 4R and both must never run on
one target. Record that in the slice's audit row. If Arena is the route instead (point 0), this section may not apply the
same way — check whether the Arena debate protocol itself already subsumes native review before assuming this section's
steps still apply unchanged. **A slice with no `src/` change (like PR-38) has no meaningful risk tier to assess in the
usual sense — record that explicitly rather than forcing a number.**

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those. PR-39 is
a static-analysis slice with no PT row of its own named in its block (its requirement is "risk mitigation groundwork,"
not a numbered PT) — do not invent one; do not skip disclosing that absence either.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip
and labelled with it, **counted as additions+deletions per file**. PR-37 1,970 (1,580-line exception), **PR-38 465 at
its final tip (175-line PR-scoped exception, against a ≈290 estimate — grew from 451/161 pre-correction after two small
Judgment Day fix commits)**. PR-39's own estimate is ≈197 lines with no exception stated (`predicates.ts` is a SEAM range
extract, therefore no exception needed per the tribunal ruling `bus-v2-f1-tasks-001` item 2) — measure anyway, do not
assume. Add a *Size reconciliation* note under the block's header in `tasks.md`, and **update it again if a later
correction round changes the final tip.**

**6. Frozen worktrees — the junction rule.** `git worktree add --detach ../telegram_bus_agent-worktrees/<name> <sha>`.
Only the verifier's worktree needs `node_modules`: create the junction with PowerShell `New-Item -ItemType Junction
-Path '<win path>\node_modules' -Target '<main win path>\node_modules'`. **To remove: delete the junction first with
PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`, verify it is gone and that
`node_modules/typescript/lib/tsc.js` still exists in the main checkout, and only then `git worktree remove --force`.**
For a re-judgment round, moving the judges' worktree in place via `git checkout <sha>` (rather than recreating it) is
cheaper and equally correct when only the judges' worktree, not the verifier's, is needed again — confirmed working
cleanly again this session across two re-judgment rounds.

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

**8. Waiting on a background agent: never poll.** `ScheduleWakeup` is for `/loop` dynamic-mode sessions only. This
mistake did NOT recur in session 38 (the second clean session in a row, after session 37). A DIFFERENT subagent-report
failure mode showed up instead this session (see point 5 above and §4's incident row) — the discipline of not blindly
trusting a background report applies beyond just "don't poll."

**9. Never run build-invoking verification commands concurrently on this machine.** New this session: `npm test` and
`npm run test:static` both run `tsc -b` first; launched in parallel, they raced against the same `dist/` and produced
one spurious test failure (an assertion that read a mid-rewrite build). This is DIFFERENT from session 37's
`&&`-chained-backgrounded-command hang (§4 below still documents that separately) — this one is about running two
SEPARATE build-invoking commands at the same time, chained or not, backgrounded or not. Always run verification
commands one at a time, sequentially.

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
v1 (`telegram-agent-bus`) has no standalone migration tool at all. **PR-38 added no new `src/` file, so it needs no
pin either** — its fixture, test and runbook are new but not vendored from anywhere. **PR-39 WILL need a new pin**:
`test/security/predicates.ts` extracted verbatim from `telegram-agent-bus/test/security.test.ts:25-101` — compute its
LF-normalized body sha256 yourself before writing the provenance header, do not guess it or copy a value from this
file. Older pins are in `apply-progress.md` and in each module's header. SEAM pins are **not machine-checked** by
`provenance.test.ts` (B-42).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **A real-child-process test exercises every collaborator the real build depends on, not just the one under test — confirmed again this session** | `test/migration/integration.test.ts` spawns the real, non-`--dry-run` `migrate-v1` CLI in all three of its scenarios; since a spawn boundary has no injection seam, all three (not just the one that reads a token back) call the real, non-injected secret store, and all three needed cleanup of the real OS keychain/file-fallback entry they create — found by direct empirical proof (a real leftover credential in Windows Credential Manager after the first green run), not by re-reading the brief more carefully. Check this explicitly for any future test that spawns a real, un-faked build. | `test/migration/integration.test.ts`, session 38 |
| **`runMigration`'s `v2Home` has no CLI flag; the only lever for a real-child-process test to redirect it is overriding the spawned process's `HOME`/`USERPROFILE` env** | `daemon/home.ts`'s `resolveHomeDir` falls back to `os.homedir()` (which reads `USERPROFILE`/`HOME` on this Windows/Node combo) when no explicit value is given, and no CLI flag or env var passes one through. This is a deliberate, already-documented decision (`main.ts`'s own doc comment), not a newly found gap. | `src/daemon/home.ts`, `src/migration/main.ts` |
| **A delegated `fork`'s first reply can make zero tool calls and just describe the plan in prose — confirmed this session** | The parent mutant-sweep fork's first response had `tool_uses: 0`; nothing had actually run. Resumed with an explicit "actually execute, do not describe" instruction and it then ran for real (6 real tool calls, genuine output). Treat a suspiciously fast, narrative-only background-agent reply as unverified, not as done — a different failure mode from the `ScheduleWakeup`-while-waiting anti-pattern sessions 32-36 recorded, which has NOT recurred for two sessions running now. | session 38 |
| **Never run two build-invoking verification commands (anything that calls `tsc -b`) concurrently on this machine** | `npm test` and `npm run test:static` launched in parallel produced one spurious assertion failure (read a `dist/` mid-rewrite by the other process); the next SEQUENTIAL run hit an unrelated, pre-existing flaky test instead (see the B-39 row below); a third sequential run was clean. Always run verification commands one at a time. | session 38 |
| **A suspected cross-file inconsistency is worth checking directly before it becomes a backlog row — confirmed again this session** | `tokenRef.account`'s `"bot:"` prefix (registry-level) appeared to mismatch the bare id passed to `selection.store.set` (secret-store-level) — read `secret-store/keyring.ts` directly and found the adapter itself prepends the identical prefix internally. No defect; no backlog row filed. Verify a suspicion against source before reporting it, the same discipline this project applies to a collaborator's claims. | `src/secret-store/keyring.ts`, session 38 |
| **`gap_warning`/`retention_warning` cannot fire immediately after a migration** | Both (`daemon/serve/fetch.ts`, `daemon/serve/status.ts`) gate on a non-null `offsets.last_poll_ok_at`; migration's own `writeOffsetRow` never sets that column (NULL until the real daemon polls at least once). A test asserting "stale cursor" behavior right after migration must be scoped to migration's own carry-forward/no-false-claim guarantee, not to those two runtime fields. | `src/daemon/serve/{fetch,status}.ts`, `src/migration/main.ts` |
| **This project's "narrow single-judge round-2 residual doesn't need the second round" precedent is severity-gated, not blanket** | PR-30 through PR-37 all skipped the second round only when the round-2 residual itself was WARNING/SUGGESTION-tier. PR-38's round-2 finding was CRITICAL-tier (a fix-caused contradiction) even though the fix itself was trivial (one heading phrase) — the second round was spent anyway. Judge the SEVERITY of the round-2 finding, not the size of its fix, when deciding whether to skip. | session 38, HANDOFF §2 point 8 |
| **A crash-consistency ordering rule, generalizable beyond PR-37** | When an idempotency/retry check reads exactly ONE artifact to decide "already done," that artifact must be written LAST among the side effects, and everything written before it must be independently safe to redo (an upsert, or otherwise idempotent). | `src/migration/main.ts` |
| **Any new testable entry-point function needs a top-level try/catch — a two-time-confirmed defect class** | `client/main.ts`'s `runMcpClient` (PR-35) and `migration/main.ts`'s `runMigration` (PR-37) both shipped without one and both were caught by Judgment Day. The pattern: `err(caughtError instanceof Error ? caughtError.message : String(caughtError)); return {exitCode: 1}` — message only, never `.stack`. | `client/main.ts`, `migration/main.ts` |
| **A judge that finds a pattern already exists in already-merged code, and declines to report it as THIS PR's defect, may still be reportable by the OTHER judge for the same PR** | PR-37: Judge A found the unchecked-ledger-quarantine pattern already in `daemon/bootstrap.ts` (pre-existing) and declined; Judge B rated the migration-specific instance CRITICAL. Both were right. | PR-37 tribunal record |
| **Always run the FULL test suite before freezing a candidate, not just the writer's own narrower verify command** | Confirmed across PR-32, PR-36, PR-38. | sessions 32-38 |
| **Delegating the parent's own mutant sweep to a `fork` continues to work well, once it actually executes** | See this session's own incident row above — the delegation pattern is sound, but verify the first reply actually ran commands. | PR-36 through PR-38 |
| **A parent's own record prose needs the same distrust as a subagent's** | Confirmed sessions 31 through 37. Session 38 broke the streak of the readback itself finding a defect, but only because the writer's own empirical self-correction got there first — the underlying distrust-your-own-prose discipline still applies. | PR-31 through PR-38 records |
| **Chained `&&` Bash commands under the harness's own background-task mechanism can hang on this machine** | Not a code defect — an environment quirk. Prefer foreground for multi-step verification chains, or split into separate un-chained backgrounded calls. Distinct from THIS session's concurrent-command issue (two separate commands run in parallel, not one chained command backgrounded). | session 37, this file's own §2 point 9 |
| **`os.tmpdir()`'s ancestor chain can contain OTHER stray fixture-shaped files/dirs from prior sessions' test runs** | None collide with a literal filename search — verified across multiple sessions. | this machine's `%TEMP%` |
| **`shared/ipc-contract.ts`'s `toolSuccessSchema`/`ipcErrorSchema` have no cross-validation at the point a caller classifies a response** | Deferred as **B-52**. | **B-52** |
| **`daemon/bootstrap.ts`'s `openLedger(...)` call site never checks for a quarantined result either** | Deferred as **B-54** — an already-merged file, out of scope for a drive-by fix. | **B-54** |
| **`fetch` cannot set a custom `Host` header — confirmed empirically, not just documented** | Node's `fetch` (undici) silently ignores any explicit `host` header value. Use `node:http` or a raw socket if you ever need to test a mismatched Host header. | PR-33 record |
| **Promise memoization for a shared in-flight async attempt: cache the PROMISE, not the resolved value** | General pattern from PR-34. | `src/client/ipc-stub.ts` |
| **`parseProjectFile` already exists — do not reimplement `conmuta.json` parsing** | `src/shared/project-file.ts` exports `parseProjectFile(text: string): ProjectFileResult`. | `src/shared/project-file.ts` |
| **`computeRosterHash` already exists — do not reimplement the roster fingerprint** | `src/shared/roster-hash.ts` exports `computeRosterHash(roster: readonly RosterHashInput[]): string`. | `src/shared/roster-hash.ts` |
| **`loadV1Config`/`loadV1State` already exist — do not reimplement v1 config/state parsing** | `src/migration/v1-config.ts` exports `loadV1Config(homeDir): V1ConfigResult` and `resolveV1AgentBusHome(env?): string`; `src/migration/v1-state.ts` exports `loadV1State(homeDir, roster?): V1StateResult`. | `src/migration/{v1-config,v1-state}.ts` |
| **`synthesizeMigration`/`runMigration` already exist and are now fully exercised end-to-end, including via a real child process (PR-38)** | `src/migration/synthesize.ts` exports `synthesizeMigration(input): SynthesizedMigration` (pure). `src/migration/main.ts` exports `runMigration(options): Promise<{exitCode: number}>`. | `src/migration/{synthesize,main}.ts` |
| **The migration runbook now exists — point operators at it, do not re-derive migration guidance ad hoc** | `docs/runbooks/migrate-from-v1.md`, closes design §13's own deliverable. | `docs/runbooks/migrate-from-v1.md` |
| **The v2 registry file (`~/.conmuta/registry.json`) is validated before every write, and a second migration into an existing one MERGES rather than overwrites** | `mergeRegistry` in `migration/main.ts` dedupes `groups[]`/`projects[]` by id (existing entry wins on collision). | `src/migration/main.ts` |
| **`resolveProjectBinding` never throws — every walk-up failure is a typed refusal, including an unreadable path** | `src/client/binding.ts`, five `BindingRefusal` kinds. | `src/client/binding.ts` |
| **`IPC_REQUEST_TIMEOUT_MS` (70s) is reused for both the handshake and every tool call — disclosed, deferred as B-51** | Not a correctness bug. | **B-51** |
| **Windows `fs.watch()` crashes natively on an 8.3 short path** | `realpathSync.native(dirPath)` before `watch()`. | `src/client/run-state.ts`'s `waitForRunFile` |
| **`state.yaml` is YAML with several enormous single-line string fields, and MULTIPLE fields share the same short prefix** | `completed_slices` and `tribunal_state` are both continuously-growing double-quoted YAML strings — extract/append with a small **`.cjs`** Node script (`"type": "module"` means a bare `.js` with `require` fails). **New this session: `tribunal_state` is NOT a unique line prefix** — the `propose:`/`design:`/`tasks:` phases each have their own short `tribunal_state: consensus` line; a plain `startsWith("    tribunal_state: ")` search matches the FIRST (wrong) one. Search for `'    tribunal_state: "'` (include the opening quote character) to land on the one huge field under `apply:` specifically. **Never introduce an unescaped `"` inside the appended text** (avoid apostrophes/possessives too). Re-run `gentle-ai sdd-status` after editing to confirm the file still parses. | sessions 28–38 |
| **Sweep harness needs bounds** | `node --test --test-timeout=5000` and `spawnSync(..., {timeout: 150000, shell: false})`. Report `KILLED(TIMEOUT)` apart. | sessions 29–38 |
| **`git add -N` — scope it, never `.`** | Always name the specific new files. | sessions 30–38 |
| **A writer's RED is usually compile-level** (`TS2305`/`TS2307`/`TS2339`) for a `src/` change; for a fixtures/test/doc-only slice like PR-38, RED was a failing assertion against not-yet-existing fixture files (`ENOENT`) instead | The behavioural RED is still the parent's own: readback fixes and sweep survivors, each pinned by a test that fails without the fix. | sessions 27–38 |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; builds via `node_modules/typescript/lib/tsc.js -b` directly. Lives in the untracked `odd/` tree (deleted at close): recreate it each session (≈75 lines). **Use a runtime-opaque disabled-branch condition (e.g. `Date.now() < 0`), never a literal `false`.** Delegate the actual sweep-running to a `fork` once the harness and mutant lists are written — **but verify the fork's first reply actually made tool calls before trusting it** (see this session's incident above). | sessions 28–38 |
| **The AS-IS transports lose error detail** | `GroupTransport`/`DualWriteTransport`. | PR-27, PR-28, PR-31 |
| **`offsets.retry_after_until` is shared** | Per `bot_id`; the poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring. | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | Do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **A shared "must never both be true" property is best enforced by ONE function** | `withRetryAfterIfRetryable(payload, retryAfterS)` (PR-31) is the shape to reach for. | `src/daemon/ipc/routes.ts` |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId`. Extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status`. | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key> --scope <s>`. Write the content to a plain text file first and pass it via `"$(cat file)"` rather than inlining a long string directly in the shell command. | sessions 27–38 |
| **Subagents were available all of sessions 27–38** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits; PR bodies end with the Claude Code line. Write long messages via a heredoc passed to `git commit -F -` or directly to `-m` with a heredoc — both worked fine again in session 38. | sessions 27–38 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header, opt-in per file** | A file with no `Provenance:` line is invisible to this test entirely. | `test/security/provenance.test.ts`, **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files before `test:static` AND before the full suite (`npm test`). | PR-32, PR-36, PR-38 |
| **PT-22's token shape** | Synthetic bot ids use seven digits; no fixture may match `\d{8,10}:[A-Za-z0-9_-]{35}`. Every id/token used in PR-38's own fixture follows this. | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means no limit; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines can fail to parse or truncate silently** | Write files with the file tools, Python, or a small Node script; for appending to an existing large file, prefer Read + Edit over a heredoc `cat >>`. | sessions 13–38 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–38 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run; session 38 also hit a DIFFERENT flaky test (`daemon/ipc/routes.test.js`'s live-binding-drift test, `ECONNRESET`) on a sequential local re-run, not in CI itself — both are wall-clock/network-timing flakes, neither reproduced on a third run. Did not reproduce in CI across PR-23..PR-38 (every leg green on the first attempt). | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |
| **The global `~/.claude/CLAUDE.md` is a managed, lazy-loadable file — do not assume it's monolithic** | Not relevant to this project's own code. | session 33, out-of-repo |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 182/210. **Check Arena Orion reachability live** (`curl` or `gentle-ai
   review status`'s MCP connection list) before assuming the route. Read
   [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4 (all flags — they are load-bearing,
   not optional colour), `tasks.md`'s **PR-39 block**, and design.md's §14 "Static security assertions"
   section in full (do not rely on this file's own §1/§2 paraphrases).
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram
   mirror `odd/<feature>/tasks`, before the first write.
3. **Branch** `f1/39-security-predicates-closure` from `main`, then run the applicable pipeline (Arena
   debate if reachable, §2's Judgment Day fallback otherwise):
   - **Decide first, before any code**: confirm the exact v1 line range and compute its sha256
     yourself (§3); confirm the closure walker's exact required behavior from design §14's table,
     verbatim.
   - **39.1 RED**, **39.2 GREEN**, **39.3 RED**, **39.4 GREEN**, **39.5 Verify** (read `tasks.md`'s
     actual sub-task text directly, this file does not paraphrase it exactly).
4. Audit per §2 (Arena or Judgment Day, whichever applies); merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s
   status line, `state.yaml` (BOTH `completed_slices` AND `tribunal_state` plus `next_recommended`;
   check with `gentle-ai sdd-status`; remember the prefix-uniqueness gotcha in §4), `docs/00-INDEX.md`'s
   backlog board row 10, and `docs/05-tribunal/INDEX.md`, delete `odd/`, save the session summary to
   Engram (CLI fallback if the MCP server is disconnected), commit on `main`, push, and hand the
   Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text.
- **PR-01…PR-38 are complete; do not re-slice, re-audit or re-open them.** Units 4–11 are closed; unit 12
  `static-assertions-plus-wrong-room-ci` is open, PR-39 begins it. A defect in a merged module is its own slice
  with its own audit, not a drive-by edit (B-43, B-44, B-45, B-48, B-49, B-50, B-51, B-52, B-53, B-54 wait for such
  slices).
- **Settled in session 38 and recorded**: `test/fixtures/v1-home/{config,state}.json` follow
  `test/migration/main.test.ts`'s `@`-prefixed convention exactly (proven end-to-end). `test/migration/integration.test.ts`
  spawns the real built CLI via `spawnSync` (a one-shot command — NOT the daemon's async/polling pattern), overriding
  `HOME`/`USERPROFILE` to isolate `v2Home`, and centralizes real secret-store cleanup across all three of its
  scenarios in one shared `teardownHomes` helper. `docs/runbooks/migrate-from-v1.md` is the shipped, Judgment-Day-corrected
  operator runbook — its Step 2 does NOT import thread history (project-less migrations never do), and NO project can
  be added to an already-migrated bot after the fact via this CLI, first or second, ever (hand-edit the registry
  instead). Both facts were WRONG in the runbook's first draft and are now fixed; do not reintroduce either framing.
- **Settled in session 37**: `src/migration/synthesize.ts` owns `synthesizeMigration(input):
  SynthesizedMigration` — pure, no I/O, project-assignment input optional (D-23). `src/migration/main.ts` owns
  `runMigration(options): Promise<RunMigrationResult>` — the full non-interactive orchestrator, wrapped in a
  top-level try/catch, backup-existence checked by prefix-matching ANY dated backup (not just today's), a newly-requested
  project on an already-migrated bot refused honestly rather than silently dropped, a quarantined v2 ledger detected
  and refused rather than silently written into (`daemon/bootstrap.ts`'s identical pattern is **B-54**, a separate
  future slice). Real writes happen backups → secret-store token → ledger → registry LAST (deliberately, for
  crash-consistency). `mergeRegistry` dedupes `groups[]`/`projects[]` by id, existing entry wins on collision.
  `~/.conmuta/registry.json` is this codebase's first writer of that file; validated before every write. No
  `Provenance:` header on either file (confirmed no v1 migration tool exists). `src/cli/main.ts` gained a
  `migrate-v1` dispatch branch mirroring the existing `mcp`/`daemon stop` dispatch exactly, including the Node-floor
  gate running before any flag parsing. `runMigration`'s `v2Home` option has NO CLI flag — deliberate, documented.
- **Settled in session 36**: `src/migration/v1-config.ts` owns `loadV1Config(homeDir): V1ConfigResult` and
  `resolveV1AgentBusHome(env?): string`. `src/migration/v1-state.ts` owns `loadV1State(homeDir, roster?):
  V1StateResult`; the quarantine-rename branch is a hard error here, never a write. `to_user_id` gains an OPTIONAL
  roster-backed backfill. Output types stay v1-native, deliberately NOT reshaped into `shared/thread-record.ts`'s
  `ThreadRecord` — PR-37's `synthesize.ts` did that conversion. `STATE_VERSION` is a LOCAL constant in `v1-state.ts`.
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
  written among otherwise-independent side effects; (2) a missing top-level try/catch on a new entry-point function
  is a repeat defect class (PR-35, PR-37) — check for it proactively; (3) two judges can legitimately disagree about
  WHICH PR a shared, pre-existing-pattern defect belongs to without either being wrong; (4) re-measure any stated
  figure from the CURRENT tip immediately before writing it down, every time.
- **The general lesson from PR-38's own audit**: (1) a real-child-process test exercises every collaborator the real
  build depends on, not just the one under test — check cleanup in EVERY code path that reaches a stateful
  collaborator (a secret store, a database, a socket), not just the one an assertion happens to check; (2) a
  delegated fork's first reply can make zero tool calls and just narrate the plan — verify it actually ran commands
  before trusting a background-agent report; (3) never run two build-invoking verification commands concurrently on
  this machine; (4) the "narrow single-judge round-2 residual skips the second round" precedent is gated on the
  round-2 finding's OWN severity, not the size of its fix — a CRITICAL-tier round-2 finding still spends the second
  round even when the fix itself is trivial; (5) this project's Judgment Day format handles a candidate with zero
  `src/` change without any adaptation needed.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-54** | `daemon/bootstrap.ts`'s own `openLedger(...)` call site has the same unchecked-quarantine-status gap Judgment Day found and fixed in `migration/main.ts` (session 37). Fixed in `migration/main.ts`; this row is for `bootstrap.ts`'s identical pattern, a dedicated slice away. | Director |
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
| B-39 | CI (and local runs) intermittently red on wall-clock/network-timing tests; re-run once and record. Did not reproduce in CI across PR-23..PR-38; a different flaky test (`daemon/ipc/routes.test.js`) hit once locally in session 38, also unreproduced on retry. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| PR-11/12/13 escalations | SUGGESTION-class rows that survived their second rounds. Nothing blocks. | Director |
| carried (PR-06) | Digest blind spots (`MAX_THREAD_HISTORY` saturation); the fence does not neutralise `&`. | Director |
| **`bootstrap.ts` still doesn't wire the IPC server** | `createSessionRoutes`/`createIpcServer` exist and are fully tested but nothing in the daemon's actual boot sequence calls either yet. | a later PR |
| B-16 / D-10, B-11, B-12 | Licence files and copyright line; trademark screening; macOS scope. | Director |
| B-05, B-08, B-09 | F0 spikes still open (B-08's client-side handshake half closed with PR-33; PR-35 closed the client-side surface entirely). | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) — see its rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI (update to 2.2.1 available for the separate
  `engram` CLI — not yet applied, no functional impact observed), TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **1044 tests** (1043 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`) — see §4's `fs.watch`
  gotcha if any future code watches a directory under it.
- Verification worktrees: `../telegram_bus_agent-worktrees/` — **empty** at the end of session 38.
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 1m30s per leg in session 38).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it). PR-39 needs one v1 read: `telegram-agent-bus/test/security.test.ts:25-101` for the
  SEAM extraction.
- **Arena bridge status remains UNCERTAIN, not simply "down" — check live at the start of every session from here
  on.** `.mcp.json` points at `http://127.0.0.1:8766/mcp`. Confirmed down (connection refused, exit 7) again at the
  start of session 38, identical to session 37. Never quote or commit `.mcp.json`'s contents.
- The Engram MCP server (`plugin:engram:engram`) was reachable at the start of session 38; the `mem_save` tool
  itself still refused with "multiple active runtime sessions" on the first call (a known, long-standing condition,
  not a new disconnection) — the `engram` CLI fallback handled it without issue, as it has every session since 27.
