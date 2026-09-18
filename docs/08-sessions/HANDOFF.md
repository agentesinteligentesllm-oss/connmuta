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
has been proven end to end on PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a, PR-09b and **PR-10**.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en su rebanada PR-11 (unidad `ledger`: `src/ledger/open.ts` + `src/ledger/migrations.ts` con sus dos gemelos, la secuencia de apertura con cuarentena y las migraciones forward-only, ≈350 líneas, D-21): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + auditoría Judgment Day); la Arena de debate no está disponible, así que nada depende de un debate ni de una acción en la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** at the start of this session (PR-10's docs commit landed on `main`).
The status command must print `nextRecommended: apply`, `completed: 59` of `210`, `blockedReasons: []`.
Anything else: stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.)

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Merged to `main`: **`#1`–`#15`**. **12 of the 45 task rows are done, delivered as 15 PRs** — PR-06, PR-08 and PR-09 were each re-sliced *in place* (PR-09 into 09a/09b), and no row was ever re-numbered. **33 rows remain: PR-11…PR-42.** Next slice: **PR-11**. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **59/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Unit 4 `ledger` — **started** | `src/ledger/{schema,transaction}.ts` with twins (PR-10), merged as **#15** (`daad417`, code/record tip `fcf5086`, 1,357 authored lines / **957-line exception**). The spike is **closed: the `node:sqlite` idiom holds on the pinned build, so no ADR is needed**. Remaining in the unit: PR-11 `open.ts`/`migrations.ts`, PR-12 `inbox.ts`/`threads.ts`/`cursors.ts`, PR-13 `audit.ts`/`unknown-senders.ts`/`conditions-store.ts`/`retention.ts`. | `INDEX.md` `bus-v2-f1-pr-10-audit-001` |
| Code on `main` | `src/shared/*` (16 modules), `src/cli/{main,validate}.ts`, `src/registry/{schema,invariants,loader}.ts`, `src/ledger/{schema,transaction}.ts`, all with twins — **353 tests**, `test:static` **8** | PRs `#1`–`#15` |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**`; the scanned set must **equal** `test/fixtures/v1-provenance.json` — **11 entries, unchanged since PR-07b**. The ledger unit vendors nothing, so its files carry **no** `Provenance:` header — see §4's trap before adding a non-vendored module with no imports. | `test/security/provenance.test.ts` |
| Audit status | **DN-05 is unsatisfied for PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a, PR-09b and PR-10** — all eight audited by the **Judgment Day substitute**, one record each in the tribunal index. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused
before the child launches with

> `SDD dispatch refused before child launch: SDD preflight cancelled or invalid; no session consent recorded.`

That gate is host-owned and not satisfiable by an agent (`extensions/gentle-ai.ts` → `runSddPreflight`
needs a native `ctx.ui.select`; the durable preference path `<cwd>/.pi/gentle-ai/sdd-preflight.json` does
not exist in this workspace and the session carries no `## SDD Session Preflight` block). Consequences, all
binding: ODD is the default because it cannot block, the slice still honours the same design rows, the same
`tasks.md` sub-tasks, Strict TDD (red before green, twins), the same pinned hashes and provenance fixture,
the 400-line budget, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` phase envelope exists. **One variant is permitted**: if a human has already run
`/gentle:sdd-preflight` in the TUI, or the Director explicitly asks, the slice may run through `sdd-apply`.

**2. Audit: Judgment Day**, exactly as PR-10 ran it. Two blind read-only judges (`jd-judge-a`,
`jd-judge-b`) in parallel over one immutable frozen tree, graph-v1 shapes only (discovery returns only
`{"rows":[…]}`; a scoped re-judgment returns only `{"resolutions":[…]}`), then a bounded correction round
and at most two scoped re-judgments. `review-risk`/`review-*` agents are **not** dispatchable outside the
native review lifecycle. Record the audit path in the tribunal index the way the eight existing records do,
and state plainly that DN-05 is unsatisfied. Six rules, all learned the hard way:

- **Ask before round 1** (the skill requires it). The Director has authorized the full batch each time, so
  present the ledger and the proposed batch in one question — **including the line cost**, because this
  batch's size is the Director's decision, not the writer's.
- **A single-judge row is *suspect*, never auto-fixable — and never dismissible from authority either.**
  Reproduce it deterministically first. PR-10's `JD-A-005` (AUTOINCREMENT) and PR-09b's CRITICAL were both
  single-judge and both real.
- **Re-run the whole sweep after every correction, and fix stale anchors rather than reporting skips.** In
  PR-10 two of the writer's own new pins survived their first sweep (`M17`, a "something was refused"
  assertion; the settling test, blind to a fulfilment-only settle) and two mutant anchors went stale after
  round 2 rewrote their lines. A sweep reported with silent skips is not evidence.
- **The `jd-fix-agent` dispatch is graded and strict.** The `## Exact authorized severe IDs` section must
  list **exactly the BLOCKER/CRITICAL rows** (a WARNING corroborating the same defect cannot be listed),
  and the `Frozen ledger SHA-256` is `canonicalHash(frozenRows)` = SHA-256 of the rows JSON with object
  keys sorted alphabetically — computed in template field order it is rejected with a generic message.
  Compute that hash from a file (write the row with the editor and hash it), never through `node -e`.
- **A scoped re-judgment's `regression` resolution carries no substance** — the graph-v1 shape has only
  `id` and `outcome`. `subagent_continue` the *re-judgment* session to obtain the proof; note that
  `subagent_list_tasks` lists newest first, and continuing the *discovery* sessions instead earns a correct
  refusal to invent substance.
- **A finding's own reproduction may not survive this repository's hygiene rules.** PR-09b's lifted verbatim
  tripped PT-22 on a 9-digit bot id; PR-10's `F3` pointer landed on the wrong paragraph. Adapt, and say so.

**3. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only
those; an over-claimed cell is a defect (PR-06a reverted PT-14; PR-07a skipped PT-07's half; PR-09b named
only its own half). **PR-11's block names no PT cell** — PR-11 pins the open sequence and the migrations,
whose traceability is `ledger › Schema-version migrations and quarantine on corruption or a future version`
(D-21), and **PT-11/PT-20's cells stay with PR-12/PR-13** (tasks 12.6 and 13.6). Read `tasks.md`'s PR-11
block and **B-26** (PT-25's owner disagreement) before touching any cell, and name only what the tests
really pin.

**4. Budget policy.** 400 lines of *authored* src+test, measured as `git diff --numstat -- src test`, with
disclosed PR-scoped exceptions otherwise. Eight precedents: PR-06b 26, PR-07a 20, PR-07b 154, PR-08a 348,
PR-08b 272, PR-09a 866, PR-09b 375, **PR-10 957**. Four lessons, all re-confirmed by PR-10:

- **Measure after every correction, in the same pass as the edit, and again at the tip that ships.**
  PR-10's exception moved 485 → 740 → 885 → 957 across three rounds.
- **Never write a computed figure as if it were measured**, and never leave a superseded figure unmarked —
  the independent verifier's `F3` was exactly that.
- **Estimate from the file sizes the design names.** PR-11's block says ≈350 for two modules and two twins;
  `open.ts`/`migrations.ts` touch real files, a real PRAGMA sequence and a corrupted fixture, so expect a
  **disclosed PR-11-scoped exception** and take it rather than trimming tests.
- **Disclose growth past an authorized batch** rather than absorbing it — and bring it to the Director in the
  same question as the next authorization.

**5. The ordinary native review is a separate, independent lifecycle (RDD switch: on).** After authorized
implementation is complete and normalized, and **before** reporting it complete, call `gentle_review` with
`{"operation":"inspect"}` and follow only the transition it returns. Five outcomes are now precedented:

- **granted and approved** (PR-07b, PR-08a, PR-09b): inspect → START → host consent → `status` returns a
  `collect` slot → `gentle_review_capture` returns a **forecast** (relay it losslessly, then resubmit the
  same binding with `reviewerRunAcknowledged: true`) → closure `approved` → execute the **exact**
  `acknowledge-approved` continuation, whose envelope reports `authority: burned`. Advisory findings become
  a backlog row and are **not** actioned.
- **declined** (PR-08b, PR-09a, **PR-10**): `declined_this_candidate`, `lineage_created: false`, no
  mutation, and the same candidate is **never re-reviewed**. Run the RDD fallback: `assess` with the decline
  stated returns the plan; the plan is *writer self-verification **plus a separate independent verifier***,
  whose findings are corrected **before** the commit that claims they are corrected — and the verifier is
  worth re-consulting after the correction, as PR-10 did (`F1`/`F2` resolved, `F3` resolved once the edit
  was committed).
- **a stale consent binding** is recoverable: START returns `consent-binding-stale` with
  `lineage_created: false` and the instruction to run START again for a fresh envelope. Do that; never
  resend a stale binding.
- **START argument shapes are graded.** The facade wants `{"mode":"ordinary","baseRef":"…","committedOnly":true}`
  **and** the `lineageId` that `inspect` bound; omitting the mode gives "supports only ordinary or
  judgment-day", omitting the lineage gives "graph-v1 START requires lineageId", and both failures happen
  **before** authority access, so no lineage is created and nothing is burned.
- **a decline is not a closure** and approval authorizes **no** delivery: commit, push, PR and merge stay
  under ordinary repository policy and the Director's word.

**6. Run the audit and the review against frozen worktrees, not the live one.** `git worktree add --detach
../telegram_bus_agent-worktrees/<name> <sha>`, pass `workspaceRoot` to the review, hand the judges the
**committed** tree, and remove the worktrees when the run ends (`--force` if they hold scratch files). For
pre-commit verification, apply the candidate as a patch into a worktree at the base and prove the candidate
bytes with `sha256sum` on both sides — PR-10 used that to show the verified tree *was* the committed tree.

**7. The dynamic-namespace gateway is not an approved evidence route**, and the four F0 spikes (B-05,
B-07, B-08, B-09) stay open.

**8. Remote delivery is authorized for this project** (Director, this session, on top of DN-07/DN-08):
push the branch, open the PR, wait for the CI matrix, merge on the Director's word. The machine-global
`~/.pi/agent/AGENTS.md` rule "NO REMOTE, EVER" is about the unrelated `consultores-orion` account; this
checkout's `origin` is `agentesinteligentesllm-oss/connmuta` through the isolated local credential helper,
and this project's fourteen-plus PRs exist by exactly this route.

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
`apply-progress.md`. **PR-11 vendors nothing** — `open.ts` and `migrations.ts` are new code — so the fixture
stays at 11 entries and a `Provenance:` header on a new file is a defect.

A second pinned byte range now exists in the tree, and it is the *design's* text rather than v1's:
`src/ledger/schema.ts`'s `LEDGER_SCHEMA_DDL` is design §5.2's `sql` block **verbatim** —
`sha256 9e9bb65545df29ce5871bea095a6d5457a8865a1a739abda9feb62058915b506`, 74 lines / 4,123 bytes. PR-11
applies that string; **it must not edit it** (a schema change is a migration, not an edit to version 1).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **`provenance.test.ts` reads a *leading* `/**` block as a vendor header** | If a file begins with `/**` and that block contains the header's own first token (a capitalised `Provenance` followed by a colon), the gate demands a complete, parseable header and otherwise fails with `malformed Provenance header(s)`. A non-vendored module **with no imports** has its doc comment as that block, so it must not spell the token. `src/ledger/schema.ts` hit this in PR-10 — the static suite failed while the focused suite was green, and only after `git add`. Both PR-10 modules now state the constraint. | **B-33** |
| **`git ls-files`-based scanners only see tracked or staged files** | `repo-scan.test.ts` and `provenance.test.ts` run over `git ls-files`, so a new file is invisible to them until `git add`/`git add -N`. Its failure mode is a *late* static failure, after the focused suite has already gone green. | PR-09b, PR-10 |
| **PT-22's digit rule applies to any literal you lift from a review or a finding** | `test/security/repo-scan.test.ts` scans every tracked file with `\b\d{8,10}:[A-Za-z0-9_-]{35}\b` plus a two-marker tenant deny-list it excludes only for itself. The window matters only when a colon and 35 token characters follow the digits, so 9–10 digit ids are fine on their own — `test/shared/secrets.test.ts` keeps its token fixture at 7 digits. | `test/security/repo-scan.test.ts` |
| **Bash executes backticks inside double-quoted strings, and `cat << 'EOF'` heredocs truncate on long Markdown** | A heredoc appended to `apply-progress.md` silently stopped mid-section in PR-10 (a 10-line tail was lost and had to be repaired by script). Write such patches to a file with the editor and append them with a `node` script; for long commit messages use `git commit -F <file>` and check the message's tail afterwards. | session 13 |
| **Two rules can mask a third test** | PR-09a's drift pin was masked twice; PR-10's second-application pin could only ever see the *first* statement, so `M17` survived until the pin named the table and checked the DDL text. A generated-document table must be built so the rule under test is the only thing that can move the verdict, and the sweep is what proves it. | `test/ledger/schema.test.ts`, `test/registry/schema.test.ts` |
| **A correction is itself unaudited until something re-checks it** | PR-09a's round 1 introduced two defects; PR-09b's only CRITICAL was introduced by the slice's own masking design; PR-10's round 1 introduced a half-applied-batch hazard that a judge then classified `regression`. Re-run the focused check **and** the sweep after every correction, and re-measure every figure it could have moved. | `apply-progress.md` §PR-09a, §PR-09b, §PR-10 |
| **A proof in a docstring is a claim someone will test** | PR-09b's mask was documented as sound with a false proof; PR-10's doc claimed "refused at both points where a refusal is possible" while a generator callback slipped through both. State the property, name its boundary, and if it cannot be pinned, say so. | `src/ledger/transaction.ts` |
| **`dist/` staleness fakes results, and `tsc -b` is incremental** | Always `rm -rf dist` before believing a surprising run; restore mutants byte-for-byte and verify with `sha256`. | sessions 11–13 |
| **`state.yaml` is YAML, and a plain scalar cannot hold `": "`** | Validate it with PyYAML after editing (`python -c "import yaml…"`); `gentle-ai sdd-status` also reads it. No gate does this for you. | `bus-v2-f1-b19-repin-001` |
| **`node --test` output is ANSI-coloured** | Strip escape codes (or trust the exit code) before reading counts. | sessions 9–13 |
| **`gh pr merge N --merge --delete-branch`** | Works and switches the local branch to `main`. If it aborts locally (dirty tree) the remote merge has already landed: recover with `git fetch && git branch -f main origin/main && git checkout main`. `gh` refuses `--force-with-lease`; never plan a force-push. Every `gh` call needs `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**. | PR #13, #14, #15 |
| **The ODD feature doc stays out of the repository** | Each slice's `odd/tasks/<feature>.md` is created (ODD requires it) and **deleted at close**; AGENTS.md §2 does not list an ODD tree. Fold the substance into `apply-progress.md` + Engram. | Engram `odd/*/tasks` |
| **A `gentle_review` decline may cite a false-positive risk signal** | PR-10's decline (and the `assess` plan) rested on `process_boundary` on `src/ledger/schema.ts`, a file with **no imports at all** whose only `exec` occurrences are `node:sqlite`'s `db.exec` in prose. Do not treat the signal as a finding about the code, and say so in the record. | `apply-progress.md` §PR-10 |
| **`roster_hash` may be a legacy `sha256:` value** | Nothing at load time ties it to its snapshot (**B-29**); the loader only shape-checks it. Do not assume the field is trustworthy in a later slice. | `src/registry/schema.ts` |

---

## §5 — Next session, exact sequence

1. **§0**: confirm `main` is clean and current, `rm -rf dist`, read the SDD status. Then read
   [`../../AGENTS.md`](../../AGENTS.md) §1–§2, this file's §2, `tasks.md`'s **PR-11 block** (and the
   `Unit 4 — ledger` heading), design **§5.1** (the open sequence), **§5.2** (the DDL — as *input*, not as
   something to change), **§5.4** (retention, so you do not build its pruning here), and design §15's
   **Ledger** layer.
2. **Create the ODD feature doc** (`odd/tasks/pr-11-ledger-open-migrations.md`, untracked, deleted at
   close), its Engram mirror (`odd/pr-11-ledger-open-migrations/tasks`) and the visible `todo` list,
   **before** the first write. State the plan in one line and proceed; do not ask the Director to choose a
   workflow and do not wait on the TUI.
3. **Branch** `f1/11-ledger-open-migrations` from `main`. Then follow the block exactly:
   - **11.1 RED**: `test/ledger/open.test.ts` — the two spec scenarios (a corrupt ledger is quarantined as
     `ledger.corrupt-<epochMs>.db` and a fresh one opens; a future `PRAGMA user_version` takes the same
     path rather than a downgrade) plus `PRAGMA synchronous = FULL` / `journal_mode = WAL` /
     `foreign_keys = ON` assertions. Include a **deliberately corrupted fixture file** as the design's
     runtime harness names, and a `mkdtemp` temp home.
   - **11.2 GREEN**: `src/ledger/open.ts` — `mkdir` the home (`POSIX_PRIVATE_DIR_MODE`), open,
     `PRAGMA quick_check`, quarantine-by-rename on corruption or `SQLITE_CORRUPT`/`SQLITE_NOTADB`
     (**including the `-wal`/`-shm` siblings**), the PRAGMA sequence, then read `user_version` and run the
     pending migrations. Raising `ledger_quarantined` and the audit `system` row belong to the condition
     store and the audit module (PR-13) — this slice returns the verdict, and the boundary must be stated.
   - **11.3 RED**: `test/ledger/migrations.test.ts` — forward-only `{to, up}` migrations run inside one
     transaction each, `PRAGMA user_version` lands at `LEDGER_SCHEMA_VERSION`, and a migration that throws
     leaves both the schema and the version untouched.
   - **11.4 GREEN**: `src/ledger/migrations.ts` — the ordered list whose first entry applies
     `LEDGER_SCHEMA_DDL` from PR-10 (do not edit that string) and stamps the version **inside** the
     transaction, with `withTransaction` from PR-10 as the mechanism (prove it is the mechanism, not a
     re-implementation).
   - **11.5 Verify**: `npm run build && node --test "dist/test/ledger/open.test.js" "dist/test/ledger/migrations.test.js"`.
     Expect a **new reference** in `src/ledger/tsconfig.json` (`{ "path": "../shared" }`) the moment
     `LEDGER_SCHEMA_VERSION` is imported — an empty *referencing* unit is TS18003, so it lands with that
     first import.
   - **11.6** (if the block names one): the docs/cell task, which per §2.3 above is **none** for PR-11 —
     say so rather than inventing a cell.
4. **Verify** from a frozen worktree (never the working tree): the full suite and `test:static`, plus **at
   least four mutants on a cleaned `dist/`** — including one on the quarantine rename (does the corrupt
   file survive? are the `-wal`/`-shm` siblings moved?), one that stamps `user_version` outside the
   migration transaction, one that runs a migration without a transaction, and one that lets a *future*
   version migrate instead of quarantining.
5. **Measure the real diff** (`git diff --numstat -- src test`), read every new file in full, and ask the
   Director for commit authorization and the PR-11-scoped exception together.
6. **Commit** as work units (code + its twin together), then the docs/bookkeeping commit.
7. **Audit** (§2.2) over the frozen committed range, then **the ordinary native review** (§2.5) and, if it
   declines, the RDD fallback with its independent verifier, then push, open the PR, wait for the CI matrix,
   and merge with the Director's authorization.
8. **Close**: rewrite this file (for **PR-12**, the inbox write-ahead transaction + thread adapter +
   cursors), prepend to [`LOG.md`](./LOG.md), add the audit-path record to
   [`INDEX.md`](../05-tribunal/INDEX.md), sweep every status line in `AGENTS.md`, `README.md`,
   `docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml` (**parse the YAML after editing**), add any
   backlog row the audits recommended, delete the ODD document, run `mem_session_summary`, commit the docs
   on `main`, and push.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits so far: the PR-01, PR-06, PR-08 and PR-09
  re-slice notes, the PR-07a block, the PR-07b carried-findings note (+ D4 amendment), the **appended**
  `EXIT_VALIDATION_FAILED` row in design §11, the PR-10 apply-time note (with its round-1/round-2
  disclosures), and the checkbox flips. Do not rewrite a gate's text; append a note. **Rows PR-09 and PR-10
  are closed** (10.1–10.6 all `[x]`).
- Provenance hash rule, registry and range convention are ratified — §3. `constants.ts:3` is settled
  (B-19, `done`); do not re-open or re-report it.
- **Doc-hygiene rule** (ratified `bus-v2-f1-pr-03-001`): never quote a matched-and-rejected secret-shaped
  literal in `apply-progress.md`; describe the shape.
- **PR-01…PR-10 are merged; do not re-slice, re-audit or re-open them.** PR-08b's, PR-09a's and **PR-10's**
  native reviews were **declined** and are never re-run; PR-07b's, PR-08a's and PR-09b's were **approved**
  with advisory findings (B-21, B-22, B-32) that are recorded, not actioned.
- **The registry unit is closed** (`schema`, `invariants`, `loader`), and the ledger's `schema.ts` is
  design §5.2's text: **a schema change is PR-11's migration, never an edit to version 1**. Do not "improve"
  a closed module while working on the next one; if a later slice must change one, that is its own slice
  with its own audit.
- `test/ledger/schema.ts`'s `NOT NULL` inventory, `AUTOINCREMENT`, the VIEW's predicate, the two unique
  keys, both cascades and the DDL's refusal of a second application are **pinned**; do not re-litigate them
  without a failing test.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a
  decision: both are disclosed deviations.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake imports
  it, never redefines it.
- TypeScript 7.0.2 needs `"types": ["node"]`; an empty composite unit is `TS18003`, so a new unit's
  `tsconfig.json` and its root `references` entry land with its first `.ts` file. `src/{client,daemon}` join
  the root references in PR-32 and PR-15.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job; that is by design.
  `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by path.
- Type-only modules satisfy Strict TDD's triangulation gate via the explicit type-only exception; a missing
  module (`TS2307`, or `TS2305` over a module that exists and exports nothing) is a legitimate RED.
- **Stale comments, stale figures and stale records**: after a correction edits a file, every figure about
  that file is suspect — grep the whole record for the old number, and for the new one, before committing.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-22 | The four advisory findings of PR-08a's ordinary native review, recorded not actioned | Director |
| B-23 | `JD-A-003`: the deliberate precedence of `unsupported_schema_version` over the content walk is documented but unpinned (ADR-12) | Kairo → Alpha |
| B-24 | **No POSIX CI leg**, so packaging/execution contracts cannot fail here | Kairo → Alpha |
| B-25 | Three cheap gates for one later audited PR: a YAML validity check over `git ls-files '*.y*ml'`; a `clean` step before `npm test`; bumping `actions/*` off Node 20 | Kairo → Alpha |
| B-26 | **PT-25's owner is attributed differently by two gated documents.** PR-09b named only the half it pins and stated the split; the document-level contradiction still needs the Director | Director → Kairo |
| B-27 | **The shared token regex matches this project's own `sha256:` roster hash**, so R5 would refuse every valid registry. Masked at the call site (with its boundary now proved); the root cause (the v1-inherited unbounded `\d+`) needs a decision | Director → Kairo |
| B-28 | **No R1–R6 row demands referential integrity**, so a dangling reference loads. Pinned as a boundary; an F2 `doctor` check owns it | Kairo → Alpha |
| B-29 | **Nothing at load time ties `roster_hash` to its snapshot** (two independent judges) | Director → Kairo |
| B-30 | **R5's strictness refuses free-form human text** — a group `title` reading `Authorization review` or `Budget API_KEY=123` refuses the whole registry | Director → Kairo |
| B-31 | **A JSON-escaped colon (`\u003a`) bypasses the raw-text scan**, so a token can persist unreported | Director → Kairo |
| B-32 | The four advisory findings of PR-09b's approved native review, recorded not actioned | Director |
| **B-33** | **`test/security/provenance.test.ts` treats a file's leading `/**` block as a vendor header**, so a non-vendored module with no imports cannot spell the header's first token in its doc comment — the gate then reports it as a malformed vendored module. Worked around in both PR-10 modules (documented in their headers); the gate's heuristic could be narrowed to the exact header prefix in a later hygiene PR | Kairo → Alpha |
| — | **A `gentle_review` risk signal can be a false positive**: PR-10's decline and its `assess` plan both rested on `process_boundary` on a module with no imports. Worth reporting upstream if it recurs; no local fix exists | Director (observation) |
| B-16 / D-10 | `LICENSE` ships with `private: true`; SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line open; a **real tenant deny-list** for PT-22 must live outside the tree (CI secret) — decide at PR-42 | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant | Director |
| B-12 / B-13 | macOS scope; the migration runbook closes when PR-38 merges | Director + Kairo |
| carried (PR-06) | Digest blind spots incl. `MAX_THREAD_HISTORY = 50` saturation — proposed minimal fix: the last history entry's `eid` in the digest row | Director → Kairo |
| carried (PR-06) | The fence's body escape does not neutralise `&`, so the fence is not injective | Director |
| — | T22 bytes-per-hour ceiling and the origin-label organisation marker (PR-42 close-out) | Director |
| B-05, B-07, B-08, B-09 | gentle-ai installer study; Telegram bot-to-bot visibility; Windows IPC/DACL; MCP notification rendering per host — all F0 spikes, still open | Director + Kairo |

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI, gentle-pi 3.1.1, TypeScript 7.0.2
  pinned, SQLite 3.53.0 through `node:sqlite`. Receipt-driven development is **on**
  (`gentle-ai review mode status`: global on, clone-local unset); the writer profile this session was
  `deepseek-flash`, effort `medium`, which `assess` graded `large`.
- Line endings: this repository forces `eol=lf` through `.gitattributes`; the v1 checkout beside it has
  none. Check with `git ls-files --eol`.
- **`node:sqlite` measured facts** (Node 24.16.0): `DatabaseSync.isTransaction` exists and flips on
  `BEGIN IMMEDIATE`; a failed statement leaves the transaction open **for constraint failures only** —
  `SQLITE_FULL` (errcode 13) and friends roll it back themselves; `ROLLBACK` outside a transaction throws
  `ERR_SQLITE_ERROR`; a nested `BEGIN` is refused by SQLite; `exec()` runs multiple statements;
  `PRAGMA foreign_keys` defaults to 1; SQLite's constraint codes are CHECK 275, UNIQUE 2067, FK 787,
  NOT NULL 1299, STRICT datatype 3091, SQLITE_BUSY 5; and `STRICT` accepts an INTEGER in a TEXT column
  (lossless conversion) — the discriminator is TEXT in a non-rowid INTEGER column.
- `node --test` prints `ℹ tests / ℹ pass / ℹ fail` (ANSI-coloured), not `# tests`.
- GitHub Actions: the workflow lives on `main`, so `pull_request` runs fire on PR open (≈60–90 s per matrix
  entry, Node 24.15 and 26). PR #15's both legs passed.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; `main` is the only remote branch.
  Every `gh` call runs with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`;
  **never `gh auth switch`**.
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365` (tag `v1.0.2` + 2 commits),
  **read-only**; cite as `path:line`. It carries one pre-existing untracked `alpha_response.json`.
- Verification worktrees live in `../telegram_bus_agent-worktrees/` and are removed when their run ends;
  **an empty directory is the expected end state**. PR-10 left `verify-10` and `verify-10-fix`; remove them.
- Arena bridge: `.mcp.json` (gitignored) points at `http://127.0.0.1:8766/mcp` — the Arena Orion Electron
  app, **down** unless the Director launched it. Never quote `.mcp.json` and never commit it.
