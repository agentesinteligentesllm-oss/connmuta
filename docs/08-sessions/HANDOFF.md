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
has been proven end to end on PR-06, PR-07a, PR-07b, PR-08a, PR-08b, **PR-09a and PR-09b**.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en su rebanada PR-10 (unidad `ledger`: `src/ledger/{schema,transaction}.ts` con sus dos gemelos, el spike de transacción con `node:sqlite`, ≈400 líneas, PT-10): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + auditoría Judgment Day); la Arena de debate no está disponible, así que nada depende de un debate ni de una acción en la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** at the start of this session (PR-09b committed everything it touched).
The status command must print `nextRecommended: apply`, `completed: 53` of `210`, `blockedReasons: []`.
Anything else: stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.)

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Merged to `main`: **`#1`–`#14`**. **11 of the 45 task rows are done, delivered as 14 PRs** — PR-06, PR-08 and PR-09 were each re-sliced *in place* (PR-09 into 09a/09b), and no row was ever re-numbered. **34 rows remain: PR-10…PR-42.** Next slice: **PR-10**. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **53/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Unit 3 `project-binding` | **Complete in the repository**: `src/registry/{schema,invariants,loader}.ts` with twins. Row PR-09 closed as two audited halves: **PR-09a** (#13 `b205dc7`, tip `2279c15`, 1,266 lines / 866-line exception) and **PR-09b** (#14 `0858595`, tip `14f3424`, 775 lines / 375-line exception). | `INDEX.md` `bus-v2-f1-pr-09a-audit-001`, `bus-v2-f1-pr-09b-audit-001` |
| Code on `main` | `src/shared/*` (16 modules), `src/cli/{main,validate}.ts`, `src/registry/{schema,invariants,loader}.ts`, all with twins — **328 tests**, `test:static` **8** | PRs `#1`–`#14` |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**`; the scanned set must **equal** `test/fixtures/v1-provenance.json` — **11 entries, unchanged since PR-07b**. The registry unit vendored **no** v1 range, so its files carry **no** `Provenance:` header. PR-10 vendors nothing either (the ledger is new code). | `test/security/provenance.test.ts` |
| Audit status | **DN-05 is unsatisfied for PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a and PR-09b** — all seven audited by the **Judgment Day substitute**, one record each in the tribunal index. | [`INDEX.md`](../05-tribunal/INDEX.md) |

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

**2. Audit: Judgment Day**, exactly as PR-09a and PR-09b ran it. Two blind read-only judges (`jd-judge-a`,
`jd-judge-b`) in parallel over one immutable frozen tree, graph-v1 shapes only (discovery returns only
`{"rows":[…]}`; a scoped re-judgment returns only `{"resolutions":[…]}`), then a bounded correction round and
at most two scoped re-judgments. `review-risk`/`review-*` agents are **not** dispatchable outside the native
review lifecycle. Record the audit path in the tribunal index the way the seven existing records do, and
state plainly that DN-05 is unsatisfied.

Five hard-won rules, all from PR-09's two rounds:

- **Ask before round 1** (the skill requires it). The Director has authorized the full batch each time
  (severe fix + informational folds), so present the ledger and the proposed batch in one question.
- **A single-judge severe row is *suspect*, not auto-fixable — but reproduce it before believing or
  dismissing it.** PR-09b's only CRITICAL came from one judge and was real: the writer reproduced it
  against the built module, then asked for authorization with the reproduction attached. That is the
  pattern: verify deterministically, never argue from authority in either direction.
- **The `jd-fix-agent` dispatch is graded and strict.** The `## Exact authorized severe IDs` section must
  list **exactly the BLOCKER/CRITICAL rows** (a WARNING corroborating the same defect cannot be listed),
  and the `Frozen ledger SHA-256` is `canonicalHash(frozenRows)` = SHA-256 of the rows JSON with object
  keys sorted alphabetically — computed in template field order it is rejected with a generic message.
  The re-judgment dispatch has no such grading. Compute that hash from a file (write the row with the
  editor and hash it), never through `node -e "…"`, because shell quoting mangles the claim text.
- **When two judges contradict, re-run the mutant sweep before arguing.** PR-09a's correction introduced
  two defects (a mutant re-masked, a function shipped unpinned) and only the sweep found them.
- **A finding's own reproduction may not survive this repository's hygiene rules.** PR-09b lifted the
  judge's literal verbatim, and its **9-digit bot id tripped PT-22**, failing the repository's own scan
  until the fixture moved to the 7-digit shape every suite here uses. Adapt, and say so in the record.

**3. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only
those; an over-claimed cell is a defect (PR-06a reverted PT-14; PR-07a skipped PT-07's half).
**PR-10's task 10.6 names PT-10** ("Write-ahead before offset confirmation" — the ledger half, in
`test/ledger/{transaction,schema}.test.ts`). Read `tasks.md`'s PR-10 block and **B-26** (PT-25's owner
disagreement) before touching any cell, and name only what the tests really pin.

**4. Budget policy.** 400 lines of *authored* src+test, measured as `git diff --numstat -- src test`, with
disclosed PR-scoped exceptions otherwise. Seven precedents: PR-06b 26, PR-07a 20, PR-07b 154, PR-08a 348,
PR-08b 272, PR-09a 866, PR-09b 375. Three lessons, all re-confirmed by PR-09:

- **Measure after the correction, in the same pass as the edit, and again at the tip that ships.**
  PR-09b's exception moved 272 → 375 across its own correction round.
- **Never write a computed figure as if it were measured.** Two of PR-09a's figures were derived
  arithmetically; the independent verifier caught both.
- **Estimate from the file sizes the design names.** PR-10's block says ≈400 for two modules and two
  twins; the registry's two-module half measured 1,266, so expect a **disclosed PR-10-scoped exception**
  and take it rather than trimming tests.

**5. The ordinary native review is a separate, independent lifecycle (RDD switch: on).** After authorized
implementation is complete and normalized, and **before** reporting it complete, call `gentle_review` with
`{"operation":"inspect"}` and follow only the transition it returns. Four outcomes are now precedented:

- **granted and approved** (PR-09b): inspect → START → the host granted consent → `status` returned a
  `collect` slot → `gentle_review_capture` returned a **forecast** (relay it losslessly, then resubmit the
  same binding with `reviewerRunAcknowledged: true`) → the closure was `approved` with advisory findings →
  execute the **exact** `acknowledge-approved` continuation, whose envelope reports `authority: burned`.
  Advisory findings become a backlog row and are **not** actioned.
- **declined** (PR-08b, PR-09a): `declined_this_candidate`, `lineage_created: false`, no mutation, and the
  same candidate is **never re-reviewed**. Run the RDD fallback: `assess` with the decline stated returns
  the plan; when the native assessment is unavailable the risk reads **unassessable**, treated like high,
  i.e. *writer self-verification plus a separate independent verifier*, whose findings are corrected
  **before** the commit that claims they are corrected.
- **approved, no correction** (PR-07b, PR-08a): as above without the fallback.
- **a decline is not a closure** and approval authorizes **no** delivery: commit, push, PR and merge stay
  under ordinary repository policy and the Director's word.

**6. Run the audit and the review against frozen worktrees, not the live one.** `git worktree add --detach
../telegram_bus_agent-worktrees/<name> <sha>`, pass `workspaceRoot` to the review, hand the judges the
**committed** tree, and remove the worktrees when the run ends (`--force` if they hold scratch files).

**7. The dynamic-namespace gateway is not an approved evidence route**, and the four F0 spikes (B-05,
B-07, B-08, B-09) stay open.

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
`apply-progress.md`. **PR-10 vendors nothing** — `ledger/schema.ts` is new DDL from design §5.2 — so the
fixture stays at 11 entries and a `Provenance:` header on a new file is a defect.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **PT-22's digit rule applies to any literal you lift from a review or a finding** | `test/security/repo-scan.test.ts` scans every tracked file with `\b\d{8,10}:[A-Za-z0-9_-]{35}\b` and a two-marker tenant deny-list it excludes only for itself. Token fixtures use a **7-digit** bot-id run. PR-09b failed its own static gate by pasting a judge's 9-digit construction verbatim. | `test/security/repo-scan.test.ts` |
| **Bash executes backticks inside double-quoted strings** | Patching Markdown through `node -e "…"` corrupted a `LOG.md` entry (the code spans were executed and substituted). Write such patches to a `.mjs` file with the editor and run `node file.mjs`; for long commit messages use `git commit -F <file>`, and check the message's tail afterwards (a truncated heredoc silently produced a half message once). | session 12 |
| **A directory whose path contains a space plus `..` bit me once** | A scratch harness applied mutants outside the worktree because the path was written wrongly; if a script's `process.cwd()` does not match the tree you `cd`ed into, suspect the path before trusting the run. | session 12 |
| **Two rules can mask a third test** | PR-09a's drift pin was masked **twice** by other rules, so a mutant survived while the test looked strong. A generated-document table must be built so the rule under test is the only thing that can move the verdict, and the sweep is what proves it. | `test/registry/schema.test.ts` |
| **A correction is itself unaudited until something re-checks it** | PR-09a's round 1 introduced two defects; PR-09b's only CRITICAL was introduced by the slice's own masking design. Re-run the focused check **and** the sweep after every correction, and re-measure every figure it could have moved. | `apply-progress.md` §PR-09a, §PR-09b |
| **A proof in a docstring is a claim someone will test** | PR-09b's mask was documented as sound with a proof that was simply false (the token's colon was never inside the hex class). State the property, and if it cannot be pinned, say it is unproven. | `src/registry/loader.ts` |
| **`dist/` staleness fakes results, and `tsc -b` is incremental** | Always `rm -rf dist` before believing a surprising run; restore mutants byte-for-byte and verify with `sha256`. | sessions 11–12 |
| **`state.yaml` is YAML, and a plain scalar cannot hold `": "`** | Validate it with PyYAML after editing (`python -c "import yaml…"`); `gentle-ai sdd-status` also reads it. No gate does this for you. | `bus-v2-f1-b19-repin-001` |
| **`node --test` output is ANSI-coloured** | Strip escape codes (or trust the exit code) before reading counts. | sessions 9–12 |
| **`gh pr merge N --merge --delete-branch`** | Works, and this time it switched the local branch too. If it aborts locally (dirty tree) the remote merge has already landed: recover with `git fetch && git branch -f main origin/main && git checkout main`. `gh` refuses `--force-with-lease`; never plan a force-push. | PR #13, #14 |
| **The ODD feature doc stays out of the repository** | Each slice's `odd/tasks/<feature>.md` is created (ODD requires it) and **deleted at close**; AGENTS.md §2 does not list an ODD tree. Fold the substance into `apply-progress.md` + Engram. | Engram `odd/*/tasks` |
| **`roster_hash` may be a legacy `sha256:` value** | Nothing at load time ties it to its snapshot (**B-29**); the loader only shape-checks it. Do not assume the field is trustworthy in a later slice. | `src/registry/schema.ts` |

---

## §5 — Next session, exact sequence

1. **§0**: confirm `main` is clean and current, `rm -rf dist`, read the SDD status. Then read
   [`../../AGENTS.md`](../../AGENTS.md) §1–§2, this file's §2, `tasks.md`'s **PR-10 block** (and its
   `Unit 4 — ledger` heading), design **§5** (the ledger: §5.1 open sequence, §5.2 the DDL, §5.3 the
   transaction idiom the spike exists to confirm, §3.0 the general rules), design §15's **Ledger** test
   layer ("temp file per test (`mkdtemp`), real `node:sqlite`, fault injection by throwing inside
   `withTransaction`"), and `design.md:551`'s PT→file mapping for PT-10.
2. **Create the ODD feature doc** (`odd/tasks/pr-10-ledger-schema-spike.md`, untracked, deleted at close),
   its Engram mirror (`odd/pr-10-ledger-schema-spike/tasks`) and the visible `todo` list, **before** the
   first write. State the plan in one line and proceed; do not ask the Director to choose a workflow and
   do not wait on the TUI.
3. **Branch** `f1/10-ledger-schema-spike` from `main`. Then follow the block exactly:
   - **10.1 RED (the spike)**: `test/ledger/transaction.test.ts` on the pinned Node build, asserting
     `db.isTransaction` flips true on `BEGIN IMMEDIATE`, a throw inside the callback leaves no row, and a
     nested `withTransaction` throws (no savepoints in F1) — failing because `withTransaction` does not
     exist yet.
   - **10.2 GREEN**: `src/ledger/transaction.ts` (`withTransaction(db, fn)`: `BEGIN IMMEDIATE` … `COMMIT`,
     `ROLLBACK` on throw), closing the spike **with no ADR needed** if the idiom holds on the pinned build.
   - **10.3 RED**: `test/ledger/schema.test.ts` asserting every DDL table from design §5.2 (`offsets`,
     `updates`, `threads`, `thread_history`, the `needs_action` VIEW, `client_cursors`, `client_surfaced`,
     `audit_log`, `unknown_senders`, `binding_state`, `conditions`) exists with its `STRICT`/`CHECK`
     constraints.
   - **10.4 GREEN**: `src/ledger/schema.ts` with the DDL **verbatim** from design §5.2.
   - **10.5 Verify**: `npm run build && node --test "dist/test/ledger/transaction.test.js" "dist/test/ledger/schema.test.js"`.
     Expect a new compile unit: `src/ledger/tsconfig.json` mirroring `src/registry/tsconfig.json`
     (`rootDir: ../..`, `outDir: ../../dist`, its own `tsBuildInfoFile`, one reference to `../shared`) plus
     the root `references` entry — an empty composite unit is `TS18003`.
   - **10.6 Docs**: PT-10's cell in `docs/02-architecture/THREAT-MODEL.md` §4 names the test files this PR
     adds, and only those.
4. **Verify** from a clean detached worktree (never the working tree): the full suite and `test:static`,
   plus **at least four mutants on a cleaned `dist/` — including one at the transaction boundary**
   (`BEGIN IMMEDIATE` → `BEGIN`, `ROLLBACK` removed, `COMMIT` before the callback returns, a nested call
   allowed), which is where this slice's promise lives.
5. **Measure the real diff** (`git diff --numstat -- src test`), read every new file in full, and ask the
   Director for commit authorization and the PR-10-scoped exception together. Commit as work units (code +
   its twin together), then the docs/bookkeeping commit.
6. **Audit** (§2.2) over the frozen committed range, then **the ordinary native review** (§2.5), then push,
   open the PR, wait for the CI matrix, and merge only with the Director's authorization.
7. **Close**: rewrite this file (for **PR-11**, the ledger open sequence + migrations), prepend to
   [`LOG.md`](./LOG.md), add the audit-path record to [`INDEX.md`](../05-tribunal/INDEX.md), sweep every
   status line in `AGENTS.md`, `README.md`, `docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml`
   (**parse the YAML after editing**), add any backlog row the audits recommended, delete the ODD document,
   run `mem_session_summary`, commit the docs on `main`, and push.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits so far: the PR-01, PR-06, PR-08 and PR-09
  re-slice notes, the PR-07a block, the PR-07b carried-findings note (+ D4 amendment), the **appended**
  `EXIT_VALIDATION_FAILED` row in design §11, and the checkbox flips. Do not rewrite a gate's text; append
  a note. **Row PR-09 is closed** (9.1–9.6 all `[x]`).
- Provenance hash rule, registry and range convention are ratified — §3. `constants.ts:3` is settled
  (B-19, `done`); do not re-open or re-report it.
- **Doc-hygiene rule** (ratified `bus-v2-f1-pr-03-001`): never quote a matched-and-rejected secret-shaped
  literal in `apply-progress.md`; describe the shape.
- **PR-01…PR-09 are merged; do not re-slice, re-audit or re-open them.** PR-08b's and PR-09a's native
  reviews were **declined** and are never re-run; PR-07b's, PR-08a's and **PR-09b's** were **approved**
  with advisory findings (B-21, B-22, B-32) that are recorded, not actioned.
- **The registry unit is closed.** Its three modules and their twins are frozen by their audits: the schema
  and invariants (PR-09a), the loader (PR-09b). Do not "improve" them while working on the ledger; if a
  later slice must change one, that is its own slice with its own audit.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a
  decision: both are disclosed deviations.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake imports
  it, never redefines it.
- TypeScript 7.0.2 needs `"types": ["node"]`; an empty composite unit is `TS18003`, so a new unit's
  `tsconfig.json` and its root `references` entry land with its first `.ts` file. `src/{client,daemon}` join
  the root references in PR-32 and PR-15.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job; that is by design.
  `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by path; `git ls-files`-based scanners see
  only tracked or staged files, so `git add -N` before a local RED/GREEN.
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
| B-30 | **R5's strictness refuses free-form human text** — a group `title` reading `Authorization review` or `Budget API_KEY=123` refuses the whole registry. R5's wording is narrower; three dispositions in the row | Director → Kairo |
| B-31 | **A JSON-escaped colon (`\u003a`) bypasses the raw-text scan**, so a token can persist unreported | Director → Kairo |
| B-32 | The four advisory findings of PR-09b's approved native review, recorded not actioned | Director |
| B-16 / D-10 | `LICENSE` ships with `private: true`; SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line open; a **real tenant deny-list** for PT-22 must live outside the tree (CI secret) — decide at PR-42 | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant | Director |
| B-12 / B-13 | macOS scope; the migration runbook closes when PR-38 merges | Director + Kairo |
| carried (PR-06) | Digest blind spots incl. `MAX_THREAD_HISTORY = 50` saturation — proposed minimal fix: the last history entry's `eid` in the digest row | Director → Kairo |
| carried (PR-06) | The fence's body escape does not neutralise `&`, so the fence is not injective | Director |
| — | T22 bytes-per-hour ceiling and the origin-label organisation marker (PR-42 close-out) | Director |
| B-05, B-07, B-08, B-09 | gentle-ai installer study; Telegram bot-to-bot visibility; Windows IPC/DACL; MCP notification rendering per host — all F0 spikes, still open | Director + Kairo |

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16, npm 11.5, gentle-ai 3.0.2 CLI, gentle-pi 3.1.1, TypeScript 7.0.2
  pinned. Receipt-driven development is **on** (`gentle-ai review mode status`: global on, clone-local
  unset).
- Line endings: this repository forces `eol=lf` through `.gitattributes`; the v1 checkout beside it has
  none. Check with `git ls-files --eol`.
- **`node:sqlite` is a release candidate on the pinned build** (`NODE_FLOOR = "24.15.0"`): PR-10's spike
  exists precisely to confirm the transaction idiom (`BEGIN IMMEDIATE`, no savepoints) before PR-12
  depends on it. If it does not hold, that is an ADR-level finding, not a test tweak.
- `node --test` prints `ℹ tests / ℹ pass / ℹ fail` (ANSI-coloured), not `# tests`.
- GitHub Actions: the workflow lives on `main`, so `pull_request` runs fire on PR open (≈30–60 s per matrix
  entry, Node 24.15 and 26).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; `main` is the only remote branch.
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365` (tag `v1.0.2` + 2 commits),
  **read-only**; cite as `path:line`. It carries one pre-existing untracked `alpha_response.json`.
- Verification worktrees live in `../telegram_bus_agent-worktrees/` and are removed when their run ends;
  **an empty directory is the expected end state**.
- Arena bridge: `.mcp.json` (gitignored) points at `http://127.0.0.1:8766/mcp` — the Arena Orion Electron
  app, **down** unless the Director launched it. Never quote `.mcp.json` and never commit it.
- GitHub auth is isolated from the machine-global `gh` account: every `gh` call runs with
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh …`. **Never `gh auth switch`.**
