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
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. That route
has been proven end to end on PR-06, PR-07a, PR-07b, PR-08a, PR-08b and now **PR-09a**.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en su rebanada PR-09b (registro de máquina, mitad
loader: `src/registry/loader.ts` + `test/registry/loader.test.ts`, ≈504 líneas, PT-25): lee primero
`docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + auditoría Judgment Day); la Arena de debate
no está disponible, así que nada depende de un debate ni de una acción en la TUI.
```

**First four commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date
rm -rf dist                                          # a stale dist/ silently fakes results
git status --short                                   # must show PR-09b's THREE uncommitted files (§0.1)
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

`git pull --ff-only` must be a no-op or a fast-forward. The status command must print
`nextRecommended: apply`, `completed: 48` of `210`, `blockedReasons: []`. Anything else: stop and report.
(`verifyReport: missing` in that same output is **expected and correct** while `apply` is still running.)

### §0.1 — PR-09b's first draft already exists in the working tree

The previous session wrote the loader half and left it **uncommitted, green and untracked-but-intent-added**
(this is deliberate: the Director asked for PR-09a only, and committing unreviewed code is not the writer's
call). **Do not reset, clean or discard it.** The three paths, exactly:

| Path | Lines | State |
|---|---|---|
| `src/registry/loader.ts` | 202 | new, intent-to-add (` A` in `git status`) |
| `test/registry/loader.test.ts` | 302 | new, intent-to-add (` A`) |
| `test/registry/fixtures.ts` | 120 (88 committed) | modified: `addSecondBinding` is back, for the loader suite |

It compiles and its suite is green locally (15/15 loader tests; 36/36 across the registry suites; 304/304 +
`test:static` 8/8 for the whole tree as committed). Read it critically — it is a draft, not a reviewed
artifact — then treat it as PR-09b's first work unit: RED/GREEN evidence, its own mutants, its judgment.

**This exact draft is already a declined review candidate, and the decline is not a closure.** At the close
of session 12 the review preflight ran over precisely these three paths (target
`sha256:9110d7de94e21768db4389a0f0bb96face82b8b9b4c2f7ffb0d07a85dc9543c0`, 3 files, 536 changed lines,
risk **medium**) and the host resolved `declined_this_candidate`: `lineage_created: false`,
`mutation_performed: false`, no lineage and no authority. **Do not re-review that identity**, and do not
read the decline as a review that closed: the Receipt-driven Development fallback (*writer self-verification
plus a separate independent verifier*) is owed by **PR-09b's own boundary**, once this half is complete and
about to be reported — not by an unfinished draft the Director deferred to this session. Because the draft
will change before then, PR-09b's own preflight is a fresh, independent candidate; this declined one is
simply dead.

**Both identities of this unchanged content are now declined, and no further preflight should be attempted
until the content changes.** After the close-out docs commit moved the surrounding tree, the preflight
re-identified the same three paths as a new candidate (`sha256:0bc4e9dd958042cc72de53fc6bb4bd189e82372bb39c5f10cc44fe76e318fd11`, `lineage review-44f9022ad8d8481f`) and `review.start` resolved
`declined_this_candidate` a second time — same 3 files, same 536 lines, `lineage_created: false`, no
mutation. That is the host's own answer to the same question, not an inference: do not spend another round
on it. A genuinely new candidate appears only once this half is written and verified, and its preflight runs
then, on the changed content.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Merged to `main`: **`#1`–`#13`**. **10 of the 45 task rows are done, delivered as 13 PRs** — PR-06, PR-08 and PR-09 were each re-sliced *in place* (PR-09 into 09a/09b), and no row was ever re-numbered. Row PR-09 is **half done**: PR-09a merged, PR-09b next. **35 rows remain: PR-09b then PR-10…PR-42.** | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **48/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Artifacts | [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) — **45 rows, 210 tasks**. Apply-time edits so far: the PR-01, PR-06, PR-08 and **PR-09** re-slice blocks, the PR-07a block, the PR-07b carried-findings note (+ D4 amendment), the appended `EXIT_VALIDATION_FAILED` row in design §11, and the checkbox flips. No row was ever re-numbered. | Engram under project **`connmuta`** |
| PR-09a (merged) | `src/registry/{schema,invariants}.ts` + `src/registry/tsconfig.json` + the root `references` entry + `test/registry/{fixtures,schema,invariants}.test.ts` + the shared `rosterEntrySchema`/`applyRosterUniqueness` exports in `src/shared/project-file.ts`. PR **#13**, merge `b205dc7`, code tip `2279c15`, CI green both legs. Audited range `e177c58..2279c15`. | [`INDEX.md`](../05-tribunal/INDEX.md) `bus-v2-f1-pr-09a-audit-001` |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**`; the scanned set must **equal** `test/fixtures/v1-provenance.json` — **11 entries, unchanged since PR-07b**. PR-09a and PR-09b vendor **no** v1 range, so their new files carry **no** `Provenance:` header | `test/security/provenance.test.ts` |
| Code on `main` | `src/shared/*` (16 modules), `src/cli/{main,validate}.ts`, **`src/registry/{schema,invariants}.ts`**, all with twins — **304 tests**, `test:static` **8** | PRs `#1`–`#13` |
| Audit status | **DN-05 is unsatisfied for PR-06, PR-07a, PR-07b, PR-08a, PR-08b and PR-09a** — all six audited by the **Judgment Day substitute** (`bus-v2-f1-pr-09a-audit-001` is the newest record). **PR-09a closed `JUDGMENT: APPROVED`** after two scoped re-judgments. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused
before the child launches with

> `SDD dispatch refused before child launch: SDD preflight cancelled or invalid; no session consent recorded.`

That gate is host-owned and not satisfiable by an agent (`extensions/gentle-ai.ts` → `runSddPreflight`
needs a native `ctx.ui.select`; the durable preference path `<cwd>/.pi/gentle-ai/sdd-preflight.json` does
not exist in this workspace and the session carries no `## SDD Session Preflight` block). Consequences, all
binding: ODD is the default because it cannot block, the slice still honours the same design §4/§12 rows,
the same `tasks.md` sub-tasks, Strict TDD (red before green, twins), the same pinned hashes and provenance
fixture, the 400-line budget, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and
discloses that no `sdd-apply` phase envelope exists.

**2. Audit: Judgment Day**, exactly as PR-09a ran it. Two blind read-only judges (`jd-judge-a`,
`jd-judge-b`) in parallel over one immutable frozen tree, graph-v1 shapes only (discovery returns only
`{"rows":[…]}`; a scoped re-judgment returns only `{"resolutions":[…]}`), then a bounded correction round
and at most two scoped re-judgments. `review-risk`/`review-*` agents are **not** dispatchable outside the
native review lifecycle. Record the audit path in the tribunal index the way the seven existing records do,
and state plainly that DN-05 is unsatisfied.

- **Ask before round 1.** The skill requires it, and PR-09a's round cost one question: the judges disagreed
  on severity (CRITICAL vs WARNING) for the same defect, and the Director authorized the full batch
  (severe + informational folds).
- **The `jd-fix-agent` dispatch is strict**, and PR-09a cost two rejections learning it: the
  `## Exact authorized severe IDs` section must list **exactly the BLOCKER/CRITICAL rows** (a WARNING
  corroborating the same defect cannot be listed), and the `Frozen ledger SHA-256` is
  `canonicalHash(frozenRows)` = SHA-256 of the rows JSON with object keys sorted alphabetically — computing
  it in template field order is rejected with a generic message. Verified working value for a one-row
  ledger: `sha256(JSON.stringify([rowWithSortedKeys]))`.
- **Write the record's correction note as a log, not as a claim**, and expect the correction to be wrong
  once: PR-09a's own correction introduced two defects (a mutant re-masked, a function shipped unpinned) and
  the sweep caught them only because the re-judgment contradicted itself. **When two judges contradict,
  re-run the mutant sweep before arguing.**

**3. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only
those; an over-claimed cell is a defect (PR-06a had to revert PT-14; PR-07a skipped PT-07's half).
**PR-09b's tasks ask for PT-25** (task 9.6), and **B-26 is the row that governs it**: PT-25's assertion as
written is the daemon-side `migrate_to_chat_id`/`GroupMigratedError`, which `design.md` §15 sends to
`daemon/send/send-path`, while the project-binding spec traces the same id to a registry-side property.
PR-09a filled **only** PT-18's cell and left PT-25's untouched. PR-09b **fills the registry-side half only**
— `test/registry/loader.test.ts` pins that the loader exposes no write path and never renames or rewrites
the human's file — **states the split in its PR body**, and leaves the `migrate_to_chat_id` half to the
daemon slice. Do not silently resolve it.

**4. Budget policy.** 400 lines of *authored* src+test, measured as `git diff --numstat -- src test`, with
disclosed PR-scoped exceptions otherwise. Six precedents now: PR-06b 26, PR-07a 20, PR-07b 154, PR-08a 348,
PR-08b 272, **PR-09a 866** (1,266 measured against a ≈380 estimate — 4.1× under-estimated). Three lessons
are first-class and were all re-confirmed by PR-09a:

- **Measure after the correction, in the same pass as the edit, and again at the tip that ships.** PR-09a's
  exception moved 663 → 856 → 866 across its own corrections, and the independent verifier still caught a
  table whose two row errors cancelled while the total stayed right.
- **Never write a computed figure as if it were measured.** Two of PR-09a's figures were derived
  arithmetically before the run that would have measured them (a test count no revision ever had, and a
  budget that included an uncommitted helper). Both were found by the verifier, not the writer.
- **Estimate from the file sizes the design names, not from the slice count.** PR-09b's plan: `loader.ts`
  ≈202 and `loader.test.ts` ≈302 written already, plus the fixture helper it needs; expect ~530 and take a
  disclosed PR-09b-scoped exception rather than trimming tests.

**5. The ordinary native review is a separate, independent lifecycle (RDD switch: on).** After authorized
implementation is complete and normalized, and **before** reporting it complete, call `gentle_review` with
`{"operation":"inspect"}` and follow only the transition it returns. Precedents: **approved** (PR-07b,
PR-08a), **declined** (PR-08b, **PR-09a**: `declined_this_candidate`, `lineage_created: false`, risk
**medium**, no mutation, no lineage — a decline is *not* a closure, never re-review that candidate, and the
RDD fallback runs; and **the PR-09b draft**, same outcome at the session-12 close, §0.1). For PR-09a the fallback's `assess` returned risk **unassessable** (the native assessment
came back schema-incompatible — treated exactly like high risk) and the plan *"the writer self-verifies and
a separate independent verifier always runs"*. **That verifier was the most valuable instrument of the
session**: it reproduced every headline figure and found **eleven record defects**. Run it, and expect it to
find defects in the record rather than in the code.

**6. Run the review and the audit against frozen worktrees, not the live one.** Pass `workspaceRoot` naming
a clean `git worktree add --detach` checkout of the candidate, so the provider binds to exactly that slice.
Give the judges the *committed* tree: PR-09a's verifier's `F1` was precisely that the record's newest
sections were still uncommitted when it ran. Commit the record **before** handing it over.

**7. The `bin`-shebang class and the POSIX gap stay open** (B-24): CI runs `windows-latest` only.

---

## §3 — Pinned provenance values (re-verify with your own method; never trust a header blindly)

The rule: the pinned value is the exact byte range of the cited v1 lines **including its terminating
newline** — except when the range runs to EOF, where the file's own final newline is that byte
(`bus-v2-f1-pr-04-001`). Never `head -c -1`, except to produce the wrong-value control.

| v2 path | v1 source | verdict | v1 body sha256 |
|---|---|---|---|
| `src/shared/constants.ts` | `src/config.ts:26-166` @ `bf8f365` | SEAM | `039d53a22b54f8c1a061c602f419e6272cd1f8a3fe260301d7fe36b4e892e15e` |
| `src/shared/tool-output.ts` | `src/tools/fetch.ts:65-348` @ `bf8f365` | SEAM | `25d39d9ceb07e585c0b6d9a12510fe445c9e81e78e401f2e3feb30c230ba0607` |
| `src/shared/tool-schemas.ts` | `src/tools/send.ts:47-109` @ `bf8f365` | SEAM | `84aae049e711e5ec6725007d561e65cebcf3ca3b9035333ae9b2b734494d42e6` |
| `src/shared/error-payload.ts` | `src/index.ts:45-103` @ `bf8f365` | SEAM | `1f59f8f8fa186e22ab1281f4ca9a2dded1f559eb9f9e43b6c7494c8c01a3d948` |

Older values (envelope, secrets, protocol-apply, protocol-select, thread-record, fence) are in
`apply-progress.md`. **PR-09b vendors nothing**: the loader is new code, so the fixture stays at 11 entries
and a `Provenance:` header on any new file is a defect.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **Verification worktrees live in `../telegram_bus_agent-worktrees/` and are removed when their run ends** | An empty directory is the expected end state. PR-09a used five (`verify-09a`, `verify-09a-final`, `jd-09a`, `jd-09a-r1`, `jd-09a-r2`) and all were removed after the merge. **Removing them needs `--force` if the tree has untracked scratch files.** | `git worktree list` |
| **A directory whose path contains a space plus `..` bit me once** | The scratch harness that applied mutants ended up outside the worktree because the path was written wrongly; if a `node` script's `process.cwd()` does not match the tree you `cd`ed into, check the path before trusting a run. | session 12 |
| **Bash executes backticks inside double-quoted strings** | Writing a Markdown/doc patch through `node -e "…"` with backticked code spans corrupted a `LOG.md` entry (the spans were executed and substituted). Write such patches to a `.mjs` file with the editor and run `node file.mjs`, never through the shell. | session 12 |
| **Two rules can mask a third test** | PR-09a's drift pin was masked **twice** by other rules (first the binding's own `bot_id`, then the snapshot array's uniqueness rule), so a mutant survived while the test looked strong. Every generated-document table must be built so the rule under test is the only thing that can move the verdict, and the sweep is what proves it. | `test/registry/schema.test.ts` |
| **`collect`/`fold` rules are per-kind, and the pin must say so** | A collapsing rule that hides a *second* kind is a defect: `collapseShapeProblems` collapses only `schema_invalid`, and a test pins that an invariant row survives alongside it. | `src/registry/schema.ts` |
| **A correction is itself unaudited until something re-checks it** | PR-09a's round 1 introduced two defects (mutant `M4` re-masked, `M7` unpinned); the re-judgment contradicted and the sweep found them. Re-run the focused check and the sweep after every correction, and re-measure every figure it could have moved. | `apply-progress.md` §PR-09a |
| **`dist/` staleness fakes results, and `tsc -b` is incremental** | Always `rm -rf dist` before believing a surprising run; restore mutants byte-for-byte and verify with `sha256`. | sessions 11–12 |
| **PT-22's deny-list markers are reserved** | `test/security/repo-scan.test.ts` defines two synthetic tenant markers and excludes only itself, so reusing either as a fake operator marker in another file fails the scan — including in documentation. Invent a fresh marker. Token fixtures use a **7-digit** bot-id run, outside PT-22's `\d{8,10}` scan. | `test/security/repo-scan.test.ts` |
| **The shared token regex matches this project's own roster hash (B-27)** | `TELEGRAM_BOT_TOKEN_RE` is `\d+:[A-Za-z0-9_-]{35}` with an **unbounded** digit run, and `sha256:` ends in one, so a canonical `sha256:<64 hex>` matches the token shape. The loader therefore masks that one value before the R5 scan; the mask is `sha256:` + 64 hex, which a token cannot occupy (its own colon is outside that class). Do not "fix" this by bounding the shared regex: a test deliberately pins a **7-digit** fixture as a match. | `src/registry/loader.ts` (PR-09b draft), `token-shape.ts` |
| **zod v4 runs `superRefine` only over type-intact data** | A missing or non-array `roster_snapshot` skips the refinement (so `.find` is safe), while an **empty array** reaches it — which is why an empty snapshot reports both `schema_invalid` and R3. Pinned and reasoned in the tests. | `test/registry/schema.test.ts` |
| **`state.yaml` is YAML, and a plain scalar cannot hold `": "`** | Session 12 validated it with PyYAML after editing (`python -c "import yaml…"`), and `gentle-ai sdd-status` also reads it. **No gate does this for you.** | `bus-v2-f1-b19-repin-001` |
| **`node --test` output is ANSI-coloured** | Strip escape codes (or trust the exit code) before reading counts; `ℹ` breaks cp1252 decoding. | sessions 9–12 |
| **`gh` refuses `--force-with-lease`** | `gh pr merge N --merge --delete-branch` works, but its local branch switch **aborts if the tree is dirty** — the merge still lands on the remote; recover with `git fetch && git fetch` then `git branch -f main origin/main && git checkout main`. | PR #13 |
| **The ODD feature doc stays out of the repository** | Each slice's `odd/tasks/<feature>.md` is created (ODD requires it) and **deleted at close**; AGENTS.md §2 does not list an ODD tree. Fold the substance into `apply-progress.md` + Engram. **PR-09b's doc (`odd/tasks/pr-09b-registry-loader.md`) still has to be created.** | Engram `odd/*/tasks` |

---

## §5 — Next session, exact sequence

1. **§0**: confirm `main`, `git pull --ff-only`, `rm -rf dist`, confirm the three uncommitted files (§0.1),
   read the SDD status. Then read [`../../AGENTS.md`](../../AGENTS.md) §1–§2, this file's §2, `tasks.md`'s
   **PR-09 block** (the re-slice note names what PR-09b owes: tasks 9.1's loader scenarios, 9.3–9.6,
   PT-25's cell), design §4 (registry rows and the hot-reload mechanism), §14's `node:fs` allow-list row
   (which constrains `registry/loader.js`), and §15's PT→file mapping.
2. **Create the ODD feature doc** (`odd/tasks/pr-09b-registry-loader.md`, untracked, deleted at close) and
   the visible `todo` list, **before** the first write. State the plan in one line and proceed; do not ask
   the Director to choose a workflow and do not wait on the TUI.
3. **Branch** `f1/09b-registry-loader` from `main`. Review the draft (§0.1) as a reviewer, not as its
   author: check the R5-before-parse order, the stat-before-read fingerprint, the last-good retention, the
   never-renamed refusal and the absence of any write path. Then bring it to Strict-TDD shape and complete
   tasks 9.1 (loader scenarios), 9.3, 9.4, 9.5 and 9.6.
4. **The four spec scenarios the loader owns** must be pinned where they can fail: hot-reload without a
   restart; a malformed/torn registry kept as last-good, never renamed, never defaulted; a missing file
   refused rather than invented as an empty registry; the binding never rewritten (no write path — this is
   PT-25's registry-side half). Plus the R5 ordering (a leak inside an unparseable file is still caught,
   with **no** parse complaint) and the exemption's soundness.
5. **Verify** from a clean detached worktree, not the working tree: `git worktree add --detach … <sha>`,
   then `npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js" && npm run
   test:static`, then remove the worktree. Run the focused command too, and **at least four mutants on a
   cleaned `dist/`, including one at the loader's quarantine/never-rename boundary**, which is where this
   slice's promise lives.
6. **Measure the real diff** (`git diff --numstat -- src test`), read every new file in full, and ask the
   Director for commit authorization. Commit as work units (code + its twin + its fixture helper together),
   then the docs/bookkeeping commit. Over 400: a disclosed PR-scoped exception, never a silent overrun.
7. **Audit** (§2.2) over the frozen *committed* range: two blind judges, the canonical ledger, a bounded
   correction round, at most two scoped re-judgments, then the final verification and exactly one terminal
   judgment. Record the ledger, the corrections (as a **log**) and the verdict in `apply-progress.md` and
   `INDEX.md`.
8. **The ordinary native review runs too** (§2.5), against a frozen worktree. Approval does not authorize
   delivery; a decline is recorded as a decline and triggers the fallback, whose independent verifier's
   findings are corrected **before** the commit that claims they are corrected.
9. **Stop at a PR boundary.** Push, open the PR with
   `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh …` (never `gh auth switch`),
   wait for the CI matrix, merge only with the Director's authorization, then: rewrite this file, prepend to
   [`LOG.md`](./LOG.md), add the audit-path record to [`INDEX.md`](../05-tribunal/INDEX.md), sweep every
   status line in `AGENTS.md`, `README.md`, `docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml`
   (**parse the YAML after editing**), add any backlog row the audits recommended, run `mem_session_summary`,
   commit the docs on `main`, and push.
10. **PR-09b closes row PR-09**: with 9.1–9.6 complete the row flips, taking the change to **11 of 45 rows
    done, delivered as 14 PRs**, and the next slice becomes **PR-10** (the ledger schema + the `node:sqlite`
    transaction spike, which the risk register wants before PR-12's inbox transaction).

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits so far: the PR-01/PR-06/PR-08/PR-09 re-slice
  notes, the PR-07a block, the PR-07b carried-findings note (+ D4 amendment), the **appended**
  `EXIT_VALIDATION_FAILED` row in design §11, and the checkbox flips. Do not rewrite a gate's text; append
  a note.
- Provenance hash rule, registry and range convention are ratified — §3. `constants.ts:3` is settled
  (B-19, `done`); do not re-open or re-report it.
- **Doc-hygiene rule** (ratified `bus-v2-f1-pr-03-001`): never quote a matched-and-rejected secret-shaped
  literal in `apply-progress.md`; describe the shape. PT-22 scans every tracked file — including the
  judgment-day rows the writer freezes into the record.
- **PR-01…PR-08 and PR-09a are merged; do not re-slice, re-audit or re-open them.** In particular: PR-08b's
  and **PR-09a's** native reviews were **declined**, so those candidates are never re-reviewed; PR-08a's
  four advisory findings are **B-22**; `JD-A-003` is **B-23**.
- **PR-09a's corrections are closed**: `M4`'s two fixes (`d5d73a0`, `010ed85`), the snapshot uniqueness rule,
  `collapseShapeProblems` and the fixture's derived `roster_hash` are all pinned by mutants. Do not re-open
  them; if PR-09b touches `test/registry/fixtures.ts` (it must, for `addSecondBinding`), re-run the registry
  suites and the sweep, because that file is shared.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a
  decision: both are disclosed deviations (a missing walk-up target that PR-33 owns, and RFC 9110 §5.1
  hardening).
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake imports
  it, never redefines it.
- TypeScript 7.0.2 needs `"types": ["node"]`; an empty composite unit is `TS18003`, so a new unit's
  `tsconfig.json` and its root `references` entry land with its first `.ts` file. `src/{client,daemon}` join
  the root references in PR-32 and PR-15.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job; that is by design.
  `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by path; `git ls-files`-based scanners see
  only tracked or staged files, so `git add -N` before a local RED/GREEN.
- Type-only modules satisfy Strict TDD's triangulation gate via the explicit type-only exception in
  `strict-tdd.md`; a missing-module `TS2307` (or `TS2305` over a module that exists and exports nothing) is
  a legitimate RED for a brand-new module.
- **Stale comments, stale figures and stale records**: after a correction edits a file, every figure about
  that file is suspect — grep the whole record for the old number, and for the new one, before committing.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-22 | The four advisory findings of PR-08a's ordinary native review, recorded not actioned (the closure forbids re-running that review) | Director |
| B-23 | `JD-A-003`: the deliberate precedence of `unsupported_schema_version` over the content walk is documented but unpinned by a test (ADR-12) | Kairo → Alpha |
| B-24 | **No POSIX CI leg**, so packaging/execution contracts (shebangs, file modes, bin-links) cannot fail here | Kairo → Alpha |
| B-25 | Three cheap gates/hygiene items for one later audited PR: a YAML validity check over `git ls-files '*.y*ml'`; a `clean` step before `npm test`; bumping `actions/*` off Node 20 | Kairo → Alpha |
| B-26 | **PT-25's owner is attributed differently by two gated documents** (`tasks.md`'s PR-09 block vs `design.md:551`). PR-09a filled only PT-18; **PR-09b names only the half it pins** and says so in its PR | Director → Kairo |
| B-27 | **The shared token regex matches this project's own `sha256:` roster hash**, so R5's raw-text scan would refuse every valid registry (and the send-path backstop would refuse a body quoting one). PR-09b masks the value at the call site; the root cause (the v1-inherited unbounded `\d+`) needs a decision | Director → Kairo |
| B-28 | **No R1–R6 row demands referential integrity**, so a dangling `bot_id`/`group_id`/`project_id` loads. Pinned as a boundary; an F2 `doctor` check owns it | Kairo → Alpha |
| B-29 | **Nothing at load time ties `roster_hash` to its snapshot** (two independent judges). A load-time check would be a new invariant rule (an amendment); a session handshake that recomputes from the snapshot is the smaller fix | Director → Kairo |
| B-16 / D-10 | `LICENSE` ships with `private: true`; SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line open; a **real tenant deny-list** for PT-22 must live outside the tree (CI secret) — decide at PR-42 | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant (`src/shared/constants.ts`) | Director |
| B-12 | macOS scope; B-13 migration runbook closes when PR-38 merges | Director + Kairo |
| carried (PR-06) | Digest blind spots incl. `MAX_THREAD_HISTORY = 50` saturation — proposed minimal fix: the last history entry's `eid` in the digest row | Director → Kairo |
| carried (PR-06) | The fence's body escape does not neutralise `&`, so the fence is not injective; THREAT-MODEL §7 ratifies the fence as inherited unchanged, so it needs its own decision | Director |
| — | T22 bytes-per-hour ceiling and the origin-label organisation marker (PR-42 close-out) | Director |
| B-05, B-07, B-08, B-09 | gentle-ai installer study; Telegram bot-to-bot visibility; Windows IPC/DACL; MCP notification rendering per host — all F0 spikes, still open | Director + Kairo |

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16, npm 11.5, gentle-ai 3.0.2 CLI, gentle-pi 3.1.1, TypeScript 7.0.2
  pinned. Receipt-driven development is **on** (`gentle-ai review mode status`: global on, clone-local
  unset).
- Line endings: this repository forces `eol=lf` through `.gitattributes` (`* text=auto eol=lf`); the v1
  checkout beside it has none. Check with `git ls-files --eol`.
- `node --test` prints `ℹ tests / ℹ pass / ℹ fail` (ANSI-coloured), not `# tests`.
- GitHub Actions: the workflow lives on `main`, so `pull_request` runs fire on PR open (≈30–60 s per matrix
  entry, Node 24.15 and 26). `gh pr merge N --merge --delete-branch` also switches branches locally; if the
  tree is dirty it aborts that switch **after** the remote merge — fix with
  `git fetch && git branch -f main origin/main && git checkout main`.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; `main` is the only remote branch
  (§LOG session 12).
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365` (tag `v1.0.2` + 2 commits),
  **read-only**; cite as `path:line`. It carries one pre-existing untracked file, `alpha_response.json`,
  harmless and not this project's state.
- Arena bridge: `.mcp.json` (gitignored) points at `http://127.0.0.1:8766/mcp` — the Arena Orion Electron
  app, **down** unless the Director launched it. Never quote `.mcp.json` and never commit it.
- GitHub auth is isolated from the machine-global `gh` account: every `gh` call runs with
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh …`. **Never `gh auth switch`.**
