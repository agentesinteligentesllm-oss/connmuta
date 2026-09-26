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

**DN-09 is live and confirmed working end to end (session 39): PR-39 ran the full Arena/Alpha route,**
not the Judgment Day fallback. A real `bridge_send` to `alpha` succeeded on the first try. Three
debates closed `CONSENSUS` (`bus-v2-f1-pr-39-audit-001`, `-002`, `bus-v2-f1-pr-39-diff-audit-001`) —
**DN-05 is genuinely satisfied for PR-39**, the first PR since PR-05 audited by a real Alpha `AUDIT`
rather than the substitute. Check Arena reachability the same way again: attempt a real
`mcp__arena__bridge_send`, never `curl` alone (still unproven reliable for this bridge). If Alpha
responds, this is now the *expected* route, not a hopeful fallback — read
[`docs/01-constitution/GOVERNANCE.md`](../01-constitution/GOVERNANCE.md) §2 and §3 for the exact state
machine (PROPOSAL → AUDIT → COUNTER/CONSENSUS/ESCALATE; a clean `AUDIT` with `APPROVE`+`objections: []`
closes straight to `CONSENSUS`; **once a debate closes CONSENSUS it is terminal — a new decision point
needs a NEW `conversation_id`, not a `PATCH` on the closed one**, confirmed this session when a
mechanical discovery after audit-001's close required opening audit-002 instead). If Alpha genuinely
does not respond (a real `bridge_send` attempt errors or times out): fall through to §2 point 1, the
ODD + Judgment Day pipeline, exactly as PR-06 through PR-38 ran it.

Session 39 merged **PR-39** (`test/security/predicates.ts` SEAM, `test/security/predicates.test.ts`
AS-IS, `test/security/closure.ts` + twin, a 5-file cross-directory fixture) as PR #43 (`d85ca2c`).
**Unit 12 `static-assertions-plus-wrong-room-ci` is open, with its first slice (PR-39) closed.
Next slice: PR-40** — `test/security/client-bundle.test.ts` + `test/security/daemon-bundle.test.ts`
(PT-27 with the D-01 multi-clause spawn assertion, PT-28, PT-07's bundle-scan half). No new `src/`
file expected; this PR only writes tests against the already-built client/daemon closures.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-40 (`test/security/client-bundle.test.ts` +
`test/security/daemon-bundle.test.ts`, PT-27/PT-28/PT-07, unidad 12 continúa): lee primero
`docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
Verifica Arena Orion con un `bridge_send` real, no con `curl` — DN-09 quedó confirmada funcionando de
punta a punta en la sesión 39 (tres debates reales con Alpha, los tres CONSENSUS, DN-05 satisfecha por
primera vez desde PR-05); si Alpha no responde de verdad, cae a ODD + Judgment Day.
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
`completed: 187`, `pending: 23` (of `210`), `blockedReasons: []`. Verify the count yourself with
`grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 187).
**If `git pull --ff-only` fails with a raw `git` network error (`getaddrinfo() thread failed to
start` or similar) while `gh` commands still work: this happened once already (session 39, resolved
itself) — see §4's dedicated row before assuming a real outage.**

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-39** (PR-39 merged as PR #43, `d85ca2c`; candidate `a47e484`). **Unit 11 `v1-migration` is CLOSED. Unit 12 `static-assertions-plus-wrong-room-ci` is OPEN, first slice closed.** **Next slice: PR-40** — `test/security/client-bundle.test.ts`, `test/security/daemon-bundle.test.ts` (PT-27 with the D-01 multi-clause spawn assertion, PT-28, PT-07's bundle-scan half). Per `tasks.md`'s own PR-40 block (search for `#### PR-40` yourself — PR-39's apply-time note may have shifted line numbers by a handful): six sub-tasks, 40.1 RED (client bundle scan test) → 40.2 GREEN (should already pass against the built client closure; only adjust closure boundaries on an unintended cross-import) → 40.3 RED (daemon bundle scan test) → 40.4 GREEN (should already pass; this PR adds no new source) → 40.5 Verify → 40.6 Docs (THREAT-MODEL §4 file-name cells for PT-07/PT-27/PT-28). **This is a verification-of-already-shipped-behavior slice, not a new-logic slice** — `client/main.js`'s and `daemon/main.js`'s real import closures already exist (built by `tsc -b` from PR-01…PR-38's already-merged source); PR-40's job is writing the static assertions that prove those closures have the shape design.md §14 requires, using `test/security/predicates.ts`'s exported detectors and `test/security/closure.ts`'s `computeClosure` — both new this session (PR-39) specifically so PR-40 could consume them. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | `tasks.md` has **46 `####`-level PR headers total** (`grep -c '^#### PR-' tasks.md`), of which **42 header lines cover `PR-01`…`PR-39`** and **3 remain, naming `PR-40`…`PR-42`**. Separately, **45 distinct GitHub PRs have actually merged** through PR-39 (the same three headers — `PR-06`, `PR-08`, `PR-09` — were each re-sliced at apply time into two separately-merged PRs; this discrepancy is already flagged unreconciled in `state.yaml`'s own PR-11 entry). **Checkboxes: 187 of 210**, the cleanest single number to cite. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **187/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | Everything PR-01…PR-38 already shipped, plus **`test/security/predicates.ts`, `test/security/predicates.test.ts`, `test/security/closure.ts`, `test/security/closure.test.ts`, `test/fixtures/security-closure/{entry.js,b.js,unrelated.js,sub/a.js,sub/b.js}`**. No new `src/` file this slice. **1054 tests** (1053 pass, 1 skip), `test:static` **18/18**. | PRs `#1`–`#43` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **28 entries** (was 26; PR-39 added 2: `test/security/predicates.ts` verdict `SEAM`, `test/security/predicates.test.ts` verdict `AS-IS`). **PR-40 needs no new entry** — it adds no vendored file, only new test-only code with no v1 equivalent. | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-38** (Judgment Day substitute, one record each). **DN-05 IS satisfied for PR-39** — the first real Arena/Alpha audit trail since PR-05, three debates (`bus-v2-f1-pr-39-audit-001`, `-002`, `bus-v2-f1-pr-39-diff-audit-001`), all `CONSENSUS`. Check Arena again at the next session's own start; do not assume it stays up automatically. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**0. Arena-first routing (DN-09), now proven working end to end, not just ratified in theory.**
Check Arena reachability live at session start (§0) with a REAL `bridge_send` attempt, not `curl` alone.
If Alpha responds: the audit route is a single Alpha `AUDIT` per `GOVERNANCE.md` §2/§3's fast path — do
NOT also spawn `jd-judge-a`/`jd-judge-b`. **New this session: a debate that closes `CONSENSUS` is
terminal.** If you discover something AFTER a debate closes (as happened this session — a mechanical
detail about `provenance.test.ts` only became clear while starting to write code, after audit-001 had
already closed), open a **new** `conversation_id` for it (e.g. `..audit-002`) rather than trying to
`PATCH` the closed one (the broker rejects non-terminal kinds from a terminal state). If Alpha genuinely
does not respond: fall through to point 1 below, unchanged from every session since PR-06.

**1. Workflow (Judgment Day fallback only, if Arena is confirmed down): ODD, with every substantive SDD
contract preserved.** `sdd-apply` dispatch is refused before the child launches — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line
budget with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping.

**2. The per-slice pipeline, Arena-routed version (session 39's own shape — likely repeatable for
PR-40, adjust if PR-40's actual complexity differs):**
1. **Map** once, inline or with a narrow delegated read, depending on how many open questions exist. For
   PR-40 specifically: read `design.md` §14 (lines ~517-533 at last count, re-read yourself) verbatim —
   it is a table, not prose, and every cell matters (exact module paths, exact predicate names, the
   reverse-import-graph clauses for `transport/*`/`send/*`). Then actually **run** `closure.ts`'s
   `computeClosure` against the real built `dist/src/client/main.js` and `dist/src/daemon/main.js` (a
   throwaway script is fine, delete it before freezing) to see the ACTUAL closures before writing
   assertions that claim things about them — do not assume the closure shape from reading source, verify
   it computationally, exactly as this session verified the SEAM/AS-IS mechanics empirically rather than
   trusting a paraphrase.
2. **Decide** any open points inline, write them into the tribunal debate's `PROPOSAL` body with
   file:line evidence — Alpha reads code independently and expects pointers, never pasted files or
   whole-file dumps.
3. **Debate before writing code** for anything with a real decision in it (not mandatory for a pure
   mechanical slice, but session 39 found real value in it twice — once catching a scope gap, once
   catching a mechanical-verdict error neither party would have caught by design-doc prose alone).
   `bridge_send` a `PROPOSAL`, wait for the `[ARENA]` ping (never poll `bridge_read` in a loop), read
   with `bridge_read`, respond with `COUNTER` if you accept an objection (never `CONSENSUS` unless you
   are accepting ALL open objections with the strict `{n, claim, evidence}` shape), and end your turn
   after every send — do not keep working while a debate is in flight expecting a same-turn reply.
4. **Write.** For a file whose exact content you already know byte-for-byte (a SEAM/AS-IS vendored file,
   as `predicates.ts`/`predicates.test.ts` were this session), write it yourself directly — mechanical,
   already-understood, no delegation needed. For a file needing real new design (as `closure.ts` was),
   delegate to a `general-purpose` writer (sonnet) with every fact pre-resolved in the brief (exact
   hashes, exact ranges, exact fixture conventions already used elsewhere in this repo — grep for a
   sibling pattern before asking the writer to derive one from scratch, e.g. the `REPO_ROOT` three-levels-up
   convention already used identically by `provenance.test.ts`/`repo-scan.test.ts`). **Insist on RED
   first and ask for the verbatim RED lines.**
5. **Parent readback before freezing** — verify the delegate's own report against the ACTUAL files (Read
   them yourself; do not trust pasted "verbatim" content in a subagent's summary without checking). This
   session's readback found the report was accurate, but the check is what makes that trustworthy, not
   the report's own confidence.
6. **Parent mutant sweep** with the generic harness (§4 below has the exact recipe). **When a mutant
   survives, do not assume it is a real gap — trace the algorithm's invariants by hand first** (this
   session found 2 of 5 mutants were TRUE equivalent mutants, not gaps, after exhaustive tracing — a
   cheaper and more honest outcome than either ignoring the survival or forcing an artificial test to
   kill an equivalent mutant). For a genuinely real gap (this session's M3), fix the TEST/FIXTURE, not
   the source, when the source is already correct and the test just does not exercise the claimed
   property — re-run the full sweep after the fix to confirm the specific mutant that was gapped is now
   killed, not just that the suite still passes.
7. **Run the FULL test suite AND `test:static` before freezing, sequentially, never concurrently**
   (both invoke `tsc -b` against the same shared `dist/`; running them in parallel has caused a spurious
   failure in a prior session). `git add -N` every specific new file (never `git add -N .`) before either
   run, and again if you add or rename a fixture file mid-session (a `rm` + new file needs BOTH the
   deletion and the new path explicitly re-registered with git — a bare filesystem `rm` alone leaves the
   old path as a phantom intent-to-add entry that `git ls-files`-based scans will try to read and crash
   on with `ENOENT`; confirmed this session).
8. **Freeze, commit, send the frozen diff for the pre-merge audit** (a fresh `conversation_id`, e.g.
   `..diff-audit-001`, distinct from any pre-code plan debate). Cite the exact commit hash, the exact
   file list, the exact verification numbers, and every mutant-sweep finding including confirmed
   equivalents (do not omit them — Alpha independently re-verified both equivalence proofs this session,
   which is real corroboration, not redundant work).
9. **Judgment Day** (only if Arena is confirmed down): frozen worktrees, `jd-judge-a` + `jd-judge-b` in
   parallel, a separate independent verifier on its own worktree with a `node_modules` junction, up to
   two scoped re-judgment rounds, exactly as PR-06 through PR-38 ran it (see prior handoffs' now-archived
   detail in `LOG.md` if you need the granular recipe again).
10. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch (or on `main` post-merge if the audit
    finished after merging, as this session did); push; PR (body ends with the Claude Code line, per
    this project's established convention — commits themselves carry NO AI attribution, a distinct rule);
    `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** This session's Arena-audited PR did not run the separate native
`gentle-ai review` RDD pipeline — per HANDOFF's own established reading, the Arena debate and Judgment Day
are both *substitutes for* the DN-05 audit obligation, and native RDD review is a distinct, third
mechanism; confirm this reading holds before assuming it applies unchanged to an Arena-routed PR, since
this project has not yet exercised native review on top of a real Arena audit in the same slice.

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only
those. PR-40 pins PT-27, PT-28 and PT-07's bundle-scan half — update `docs/02-architecture/THREAT-MODEL.md`
§4's cells for those three rows in the SAME PR (task 40.6), per tribunal `bus-v2-f1-tasks-001` item 5.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured
at every tip, counted as additions+deletions per file. PR-39 landed at **290 lines** against a ≈197
estimate (revised to ≈260 mid-debate after Alpha's scope correction added a sixth file) — no exception
needed. PR-40's own tasks.md estimate is ≈380 lines, no exception — measure anyway, do not assume.

**6. Frozen worktrees — the junction rule (only relevant if Judgment Day runs).**
`git worktree add --detach ../telegram_bus_agent-worktrees/<name> <sha>`. Only the verifier's worktree
needs `node_modules`: create the junction with PowerShell `New-Item -ItemType Junction -Path '<win
path>\node_modules' -Target '<main win path>\node_modules'`. To remove: delete the junction first, verify
`node_modules/typescript/lib/tsc.js` still exists in the main checkout, then `git worktree remove --force`.

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

**8. Waiting on a background agent or an Arena reply: never poll.** After `bridge_send`, end your turn;
the `[ARENA]` ping is a new inbound turn, not something to wait for synchronously. `ScheduleWakeup` is for
`/loop` dynamic-mode sessions only, not for this project's ordinary session flow.

**9. Never run build-invoking verification commands concurrently on this machine.** `npm test` and
`npm run test:static` both run `tsc -b` first; run them one at a time, sequentially, in the foreground.

**10. A raw `git` network command can fail transiently on this machine even when `gh` and general
connectivity are fine (session 39, new).** See §4's dedicated row before concluding a real outage.

---

## §3 — Pinned provenance values (re-verify with your own method; never trust a header blindly)

Rule: the pinned value is the exact byte range of the cited v1 lines **LF-normalized, including the
terminating newline** (`bus-v2-f1-pr-04-001`). Validate your method first by reproducing a known value,
e.g. `git -C ../telegram-agent-bus show bf8f365:src/tools/fetch.ts | tr -d '\r' | sed -n
'404,460p;525,656p' | sha256sum` → `3bd09d0d…` (confirmed again this session).

**New pins this session (PR-39):**

| v2 path | v1 source @ `bf8f365` | verdict | v1 body sha256 |
|---|---|---|---|
| `test/security/predicates.ts` | `test/security.test.ts:25-101` | SEAM | `b3f99f3a068e74ee037d6ef7abb6b3b11ae14e65091be7096337c70203d4d594` |
| `test/security/predicates.test.ts` | `test/security.test.ts:107-169` | AS-IS | `a8d108d8c39cf614e7adec6195ba1a52f9b61d5b5805459930326219f5bf7a1f` |

**`test/security/closure.ts` and `test/security/closure.test.ts` are confirmed new code, no `Provenance:`
header** — no v1 equivalent exists for a standalone closure-walker module. **PR-40 needs no new pin** —
`client-bundle.test.ts`/`daemon-bundle.test.ts` are new test-only code with no v1 source to vendor.

Older pins (26 entries through PR-38) are in `apply-progress.md` and in each module's header; the fixture
file itself, `test/fixtures/v1-provenance.json`, is the single source of truth for the full list (28
entries as of this session). SEAM pins are **not machine-checked** against a live git blob by
`provenance.test.ts` — it only checks internal self-consistency (declared hash vs. live body hash,
matching the declared verdict); the human/audit process is what verifies the declared hash is the TRUE
v1 hash (B-42).

**Mechanical rule confirmed this session, worth re-reading before pinning any future range-extract
test file:** `provenance.test.ts`'s `vendoredBody()` strips the leading `Provenance:` header AND the
leading contiguous import block, then hashes the remainder. AS-IS requires that remainder to hash
EXACTLY to the declared v1 hash (`assert.equal`); SEAM requires it to hash DIFFERENTLY (`assert.notEqual`)
plus a non-`"none."` `Changes:` line. **A range-extract is not automatically SEAM just because it is a
partial range** — `design.md`'s own §12 table already had two precedents (`tool-output.ts`,
`tool-schemas.ts`) of a range-extract correctly labeled AS-IS, because their bodies needed zero
modification beyond header/import relocation. Before writing the header, work out whether your ported
body will *actually* differ from the source range once headers/imports are stripped — if it will not,
label it AS-IS and write `Changes: none.`; if you need it to be SEAM for policy reasons, make sure some
REAL, disclosed change exists in the body (never fabricate one purely to satisfy the mechanical check).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **A raw `git` network operation can fail with `getaddrinfo() thread failed to start` even when `gh` and general internet access are fine — session 39, new** | Right after `gh pr merge --merge --delete-branch` reported the merge done (confirmed via `gh pr view --json state,mergedAt,mergeCommit`: `MERGED`), a local `git fetch`/`git pull` failed repeatedly with this exact error. `gh`'s own network stack (Go's `net/http`) kept working the whole time; only git-for-Windows' own libcurl-based HTTP client was affected. Local `main` was simply stale by one merge commit — never diverged, no data at risk. Retrying the SAME `git fetch` after doing unrelated, network-free work in the meantime (not a sleep loop — real elapsed time from real work) succeeded cleanly, and `git merge --ff-only origin/main` then fast-forwarded with zero conflicts. **If this happens again: verify via `gh pr view <n> --json state,mergedAt,mergeCommit` that the merge actually landed before assuming anything is wrong; do not force-push, do not reset, do not touch the remote branch by hand — just retry the plain fetch later.** | session 39 |
| **A closed (`CONSENSUS`) Arena debate is terminal — a later discovery needs a NEW `conversation_id`** | Confirmed this session: `bus-v2-f1-pr-39-audit-001` closed CONSENSUS; a mechanical detail about `provenance.test.ts` only became clear afterward, while starting to implement. Opened `bus-v2-f1-pr-39-audit-002` as a fresh `PROPOSAL` rather than trying to `PATCH` the closed conversation (which the broker would reject — `PATCH` is legal from any non-terminal state, and `CONSENSUS` is terminal). | session 39, `docs/05-tribunal/INDEX.md` |
| **Reading a verification test's ACTUAL code (not its prose description) can reveal a mechanical requirement neither the design doc nor the task list states explicitly** | `provenance.test.ts`'s own `vendoredBody()`/`parseHeader()` functions were the deciding evidence for an AS-IS-vs-SEAM question that `design.md`'s prose and `tasks.md`'s citation both left ambiguous. When a mechanical test enforces a hard constraint (equal vs. not-equal), read the test's actual assertions before choosing a label, not just the design doc's narrative gloss on what the test does. | `test/security/provenance.test.ts`, session 39 |
| **A survived mutant is not automatically a real coverage gap — trace the algorithm's invariants by hand before deciding** | This session found 2 of 5 mutants against `closure.ts` were TRUE equivalent mutants (no possible test could ever kill them, given the surrounding code's own other guards), confirmed by exhaustive reasoning about every reachable code path (a 2-node cycle, a diamond-shaped import graph), not just by the mutant surviving on one fixture. A DIFFERENT survived mutant (M3) WAS a real gap against the code's own documented claim, and was closed by fixing the fixture, not the source. Distinguish these two outcomes explicitly in the record; do not report every SURVIVED result as an equal-weight finding. | `odd/mutants-closure.json`, session 39 |
| **Deleting a `git add -N`'d file with a bare filesystem `rm` leaves a phantom intent-to-add entry** | `git ls-files` (which `provenance.test.ts`'s and `repo-scan.test.ts`'s scanners both use) still lists the old path after a bare `rm`, and `readFileSync` on it throws `ENOENT`. Fix: `git add <path>` on the now-deleted path (naming it explicitly, not `-A`/`.`) to register the deletion in the index. Confirmed this session when restructuring a fixture mid-slice (moving `a.js` to `sub/a.js`). | session 39 |
| **A relative `import.meta.url`-based path constant copied verbatim from a vendored file can silently break if the new file sits at a different directory depth than its v1 source** | `predicates.ts`'s `DIST_SRC_DIR` used v1's `../src/` unchanged at first; v1's file was flat under `test/`, this module sits one level deeper under `test/security/`, so the correct value is `../../src/`. Caught by tracing the exact compiled-output directory depth by hand, not by the test suite (the bug would only manifest once `listJsFiles`/`relPosix` were actually exercised against `dist/src/**`, which PR-39's own narrow tests never did — PR-40 will be the first real exercise of this path). **Re-verify `DIST_SRC_DIR`'s value is still correct once PR-40 actually calls `listJsFiles`/`relPosix` against the real tree.** | `test/security/predicates.ts`, session 39 |
| **`curl` against the documented Arena bridge endpoint is NOT a reliable reachability signal — DN-09, session 38, unchanged** | Always attempt a real `bridge_send` before concluding Arena is down. | DN-09, session 38 |
| **Alpha's audit now replaces Judgment Day whenever Arena responds — confirmed working this session, not just ratified** | A single Alpha `AUDIT` (fast path, `APPROVE`+`objections: []` → `CONSENSUS` in one round) satisfies the mandatory pre-merge audit on its own; a real objection produces `APPROVE_WITH_CHANGES`, handled with `COUNTER`. Do not spawn `jd-judge-a`/`jd-judge-b` in addition when Arena responded. | `GOVERNANCE.md` §3, DN-09, session 39 |
| **Generic mutant harness — recreate each session, `odd/` is deleted at close** | `node odd/sweep.mjs <src.ts> <dist-test.js,dist-test2.js,...> <mutants.json>`; mutants are `[id, desc, from, to]` tuples, each `from` must occur exactly once in the current source (the harness reports `SKIPPED` with the actual occurrence count if not — happened once this session from a bad `from` string, harmless, just rewrite it); builds via `node_modules/typescript/lib/tsc.js -b` directly, restores the original source after each mutant AND after the whole sweep. Use a runtime-opaque disabled-branch condition, never a literal `false`, if a mutant needs to disable a guard at runtime. This session ran the sweep directly via Bash rather than delegating to a `fork` (small sweep, 5 mutants, direct execution was cheaper and avoided the known "fork's first reply describes instead of executing" risk entirely) — reconsider `fork` delegation only for a much larger sweep. | session 39 (harness text preserved from sessions 28-38 below in case a future session needs the fuller recipe) |
| **`state.yaml` is YAML with several enormous single-line string fields — edit with a small `.cjs` script, never by hand** | `completed_slices` and `tribunal_state` (under `apply:` specifically) are both continuously-growing double-quoted YAML strings; `next_recommended` is also double-quoted but gets REPLACED each session, not appended to. `tribunal_state` is NOT a unique line prefix — `explore:`/`design:`/`tasks:` each have their own short `tribunal_state: consensus` line; search for the literal string `'filed no new backlog"'` (or whatever the previous session's own closing phrase was) to find the actual end of the huge one under `apply:`, or just map every top-level key's line number first (`node -e "..."` walking the file line by line) before touching anything blind. **Never introduce an unescaped `"` inside appended text; avoid apostrophes too** (this project's convention writes plain prose without possessives in these fields specifically, confirmed again this session). Re-run `gentle-ai sdd-status` after editing to confirm the file still parses AND the numbers match what you intended — confirmed working this session with a `.cjs` script that maps every key's byte length first, previews start/end of each target field before touching it, and asserts an exact expected suffix before replacing (fails loudly instead of silently corrupting on a stale assumption). | sessions 28-39 |
| **Sweep harness needs bounds** | `node --test --test-timeout=5000` and `spawnSync(..., {timeout: 150000, shell: false})`. Report `KILLED(TIMEOUT)` apart. | sessions 29-39 |
| **`git add -N` — scope it, never `.`** | Always name the specific new files; re-register a deletion explicitly too (see the new row above). | sessions 30-39 |
| **Never run two build-invoking verification commands concurrently on this machine** | `npm test` and `npm run test:static` both call `tsc -b`. | sessions 37-39 |
| **A parent's own record prose needs the same distrust as a subagent's** | Confirmed again this session — verify a delegate's "verbatim" report against the actual files with your own Read calls before trusting it, even when the report turns out accurate (as it did this session). | sessions 31-39 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key> --scope <s>`. Confirmed working again this session. | sessions 27-39 |
| **Commit messages** | No Co-Authored-By or AI attribution in commits; PR bodies end with the Claude Code line. | sessions 27-39 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header, opt-in per file** | A file with no `Provenance:` line is invisible to this test entirely. | `test/security/provenance.test.ts`, B-33 |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files before `test:static` AND before the full suite. | sessions 32-39 |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means no limit; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines can fail to parse or truncate silently** | Write files with the file tools for anything long; a short (<20 line) heredoc via `git commit -F -`-style piping is fine, confirmed again this session for commit messages and PR bodies. | sessions 13-39 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14-16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11-17 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing if scripting against it. | sessions 9-39 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run; a different flaky IPC test hit once in session 38. Neither reproduced in CI across PR-23..PR-39 (every leg green on the first attempt again this session). | B-39 |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 187/210. **Check Arena Orion reachability live** with a real `bridge_send`
   attempt (not `curl`). Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4, `tasks.md`'s
   **PR-40 block**, and `design.md`'s §14 "Static security assertions" section in full (the table, not
   this file's paraphrase of it).
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram
   mirror, before the first write.
3. **Branch** `f1/40-security-bundle-tables` from `main`. **Actually run `computeClosure` against the
   real built `dist/src/client/main.js` and `dist/src/daemon/main.js`** (build first) before writing any
   assertion that claims something about their shape — verify computationally, do not assume from
   reading source. Then the pipeline (Arena debate if reachable, §2's Judgment Day fallback otherwise):
   - **40.1 RED**, **40.2 GREEN**, **40.3 RED**, **40.4 GREEN**, **40.5 Verify**, **40.6 Docs** (read
     `tasks.md`'s actual sub-task text directly).
4. Audit per §2 (Arena or Judgment Day, whichever applies); merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s
   status line, `state.yaml` (use a `.cjs` script per §4's row; map every key's line/length first),
   `docs/00-INDEX.md`'s backlog board row 10, and `docs/05-tribunal/INDEX.md`, delete `odd/`, save the
   session summary to Engram (CLI fallback if the MCP server refuses), commit on `main`, push (retry a
   plain `git fetch`/`push` once if it hits the same transient network fault as this session — verify via
   `gh` that nothing actually failed before assuming a real problem), and hand the Director a ≤3-line
   mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never
  rewrites of a gate's text — confirmed again this session (PR-39's own block gained an apply-time note
  for the sixth file and the corrected RED/GREEN order, rather than rewriting the original Scope line).
- **PR-01…PR-39 are complete; do not re-slice, re-audit or re-open them.** Units 4–11 are closed; unit 12
  `static-assertions-plus-wrong-room-ci` is open with its first slice (PR-39) closed. A defect in a merged
  module is its own slice with its own audit, not a drive-by edit (B-43, B-44, B-45, B-48, B-49, B-50,
  B-51, B-52, B-53, B-54, B-55 wait for such slices).
- **Settled in session 39**: `test/security/predicates.ts` owns the 7 detector predicates plus
  `listJsFiles`/`relPosix`/`DIST_SRC_DIR`, all exported (v1 exported nothing since everything lived in
  one file). `test/security/predicates.test.ts` is a byte-faithful AS-IS port of v1's 9 unit tests, no
  logic changes. `test/security/closure.ts` owns `computeClosure(entryPath: string): Set<string>` — a
  pure, self-contained (`node:fs`/`node:path` only) transitive relative-import walker; it does NOT import
  from `predicates.ts` (a deliberate scope split — PR-40 is the one that wires `closure.ts`'s output
  together with `predicates.ts`'s detectors against the real trees). `design.md:519`'s v1-range/verdict
  citation for `predicates.ts` (`44-101`/`AS-IS`) is confirmed stale; the ratified, shipped, correct value
  is `25-101`/`SEAM` (**B-55**, text-only fix deferred to the next `design.md` touch).
- Provenance hash rule, registry and range conventions are ratified — §3. AS-IS is not exclusively for
  whole-file copies — a range-extract can legitimately be AS-IS if its body needs zero modification
  (confirmed this session with `predicates.test.ts`, matching the existing `tool-output.ts`/`tool-schemas.ts`
  precedent already in `design.md` §12).
- Doc-hygiene rule: never quote a matched-and-rejected secret-shaped literal in `apply-progress.md`.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`. TypeScript 7.0.2 needs `"types": ["node"]`.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job.
- **The general lesson from PR-31 through PR-38's own audits** (unchanged, still load-bearing): re-measure
  any stated figure from the CURRENT tip immediately before writing it down; a missing top-level try/catch
  on a new entry-point function is a repeat defect class; a real-child-process test exercises every
  collaborator the real build depends on; the "narrow single-judge round-2 residual skips the second
  round" precedent is gated on the round-2 finding's own severity, not the size of its fix.
- **The general lesson from PR-39's own audit trail**: (1) a closed Arena debate is terminal — a new
  decision point after CONSENSUS needs a new `conversation_id`; (2) reading a verification test's actual
  code, not its prose gloss, can reveal a hard mechanical constraint neither the design doc nor the task
  list states; (3) a survived mutant needs hand-traced invariant reasoning before being called a gap or
  dismissed as equivalent — both conclusions need justification, not just the sweep's raw verdict; (4) a
  bare filesystem `rm` on a `git add -N`'d path leaves a phantom entry that crashes a `git ls-files`-based
  scanner — always re-register the deletion explicitly; (5) a relative `import.meta.url`-based path
  constant copied from a vendored file must be re-derived for the new file's actual directory depth, not
  assumed identical to the source's.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-55** | `design.md`:519 cites the stale, pre-`bus-v2-f1-tasks-001` v1 range/verdict (`44-101`/`AS-IS`) for `test/security/predicates.ts`; the ratified ruling and the shipped code both correctly use `25-101`/`SEAM`. Text-only fix at the next `design.md` touch. | Director |
| **B-54** | `daemon/bootstrap.ts`'s own `openLedger(...)` call site has the same unchecked-quarantine-status gap Judgment Day found and fixed in `migration/main.ts`. | Director |
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
| B-39 | CI (and local runs) intermittently red on wall-clock/network-timing tests; re-run once and record. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| B-16 / D-10, B-11, B-12 | Licence files and copyright line; trademark screening; macOS scope. | Director |
| B-05, B-08, B-09 | F0 spikes still open. | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) — see its rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI (update to 2.2.1 available for the
  separate `engram` CLI — not yet applied, no functional impact observed), TypeScript 7.0.2, SQLite
  3.53.0 via `node:sqlite`. **1054 tests** (1053 pass, 1 skip), `test:static` **18/18**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`).
- Verification worktrees: `../telegram_bus_agent-worktrees/` — empty (not used this session; no
  Judgment Day needed).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 1m22s per leg this session).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
  **New this session**: raw `git` network commands (`fetch`/`pull`/`push`) can transiently fail with a
  libcurl-level DNS error even while `gh` keeps working — see §4's dedicated row; do not assume a real
  outage without checking `gh`'s own view of the remote state first.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**. No further v1 reads
  needed for PR-40 (it adds no vendored file).
- **Arena bridge is confirmed working end to end this session** (three real debates, all `CONSENSUS`) —
  still check live at the start of every session; do not assume it stays up automatically.
  `.mcp.json` points at `http://127.0.0.1:8766/mcp`. Never quote or commit its contents.
- The Engram MCP server was reachable; `mem_save` refused with "multiple active runtime sessions" on the
  first call (a known, long-standing condition) — the `engram` CLI fallback handled it without issue.
