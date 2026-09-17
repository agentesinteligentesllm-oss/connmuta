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

**Plan settled across sessions 9–11 — do not re-open it.** The Arena Orion debate arena
(`http://127.0.0.1:8766/mcp`, the Electron app) is **not available**: assume it stays down, so **no slice
is audited by the tribunal and nothing may wait for a debate**. The Pi-native SDD preflight gate is also
closed and only a human can open it (§2), so slices run **ODD with the full SDD contract preserved** and
are audited by **Judgment Day**. That route has been proven end to end on PR-06, PR-07a, PR-07b,
PR-08a and PR-08b.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en su rebanada PR-09 (registro de máquina: `src/registry/{schema,invariants,loader}.ts` con sus tres gemelos, ≈380 líneas): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + auditoría Judgment Day); la Arena de debate no está disponible, así que nada depende de un debate ni de una acción en la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

`git pull --ff-only` must be a no-op or a fast-forward. The status command must print
`nextRecommended: apply`, `completed: 47` of `210`, `blockedReasons: []`. Anything else: stop and report.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Merged to `main`: **`#1`–`#12`**, covering the `tasks.md` rows PR-01a…PR-07b and the two PR-08 halves (`#11` `1770f84`, `#12` `c345049`). **10 of the 45 rows are done, delivered as 12 PRs** — PR-06 and PR-08 were each re-sliced *in place* into two PRs, and no row was ever re-numbered — **so 35 rows remain: PR-09…PR-42.** Next slice: **PR-09**. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **47/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Artifacts | [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) — **45 rows, 210 tasks** (45 rows correspond to 47 PRs, because PR-06 and PR-08 were each re-sliced in place into two). Apply-time edits so far: the PR-01 re-slice, the PR-06 row (re-slice), the PR-07a block, the PR-07b carried-findings note (+ its D4 amendment), the **PR-08 re-slice block** (two halves, their real figures and their exceptions), and the checkbox flips. No row was ever re-numbered. | Engram under project **`connmuta`** |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**` for a leading `Provenance:` header; the scanned set must **equal** `test/fixtures/v1-provenance.json` — **11 entries, unchanged since PR-07b**. PR-08a and PR-08b vendor **no** v1 range; three new authored files (`token-shape.ts`, `project-file.ts`, `roster-hash.ts`) must therefore carry **no** `Provenance:` header | `test/security/provenance.test.ts` |
| Code on `main` | `src/shared/{constants,version,envelope,secrets,thread-record,protocol-apply,protocol-select,fence,tool-schemas,error-payload,tool-output,token-shape,project-file,roster-hash}.ts`, `src/cli/{main,validate}.ts`, all with twins — **268 tests**, `test:static` **8** | PRs `#1`–`#12` |
| **Audit status of the last five slices** | PR-06 **waived**; PR-07a, PR-07b, **PR-08a and PR-08b** ran under the same **Judgment Day substitute** by explicit Director decision. **DN-05 is unsatisfied for all five.** PR-07b's and PR-08a's candidates *additionally* closed an ordinary native review (independent lifecycles); PR-08b's was **declined** and its RDD fallback ran (§2.5). | [`INDEX.md`](../05-tribunal/INDEX.md) `bus-v2-f1-pr-06-waiver-001`, `bus-v2-f1-pr-07a-audit-001`, `bus-v2-f1-pr-07b-audit-001`, `bus-v2-f1-pr-08a-audit-001`, `bus-v2-f1-pr-08b-audit-001` |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused
before the child launches with

> `SDD dispatch refused before child launch: SDD preflight cancelled or invalid; no session consent recorded.`

That gate is host-owned and not satisfiable by an agent: `extensions/gentle-ai.ts` calls
`runSddPreflight`, which needs a native `ctx.ui.select` confirmation and refuses while `prefs.prompted` is
false. **Re-verified independently in session 11, by evidence rather than by quoting this file:** the
durable preference path is `<cwd>/.pi/gentle-ai/sdd-preflight.json` (`lib/sdd-preflight.ts:566`, the
`return join(cwd, …)` inside `sddPreflightDiskPath`) and **it
does not exist in this workspace**, and the session carried no `## SDD Session Preflight` block, which
`isParentConfirmedSddPreflightContext` requires verbatim. Answering the questionnaire through the agent's
own question tool does not create consent, and manufacturing it would be the recorded defect class.

Consequences, all binding:

- **ODD is the default because it cannot block.** The slice still honours: the same design §12 rows, the
  same `tasks.md` sub-tasks and ids, Strict TDD (red before green, twins), the same pinned hashes and
  provenance fixture, the same THREAT-MODEL §4 discipline, the same 400-line review budget, and a
  tribunal-grade audit.
- **The orchestrator owns the SDD bookkeeping** (checkbox flips, `apply-progress.md`, `state.yaml`) and
  discloses that no `sdd-apply` phase envelope exists for the slice.
- **The only permitted variant:** if a human has already run `/gentle:sdd-preflight` in the TUI, or the
  Director explicitly asks for it, the slice may instead run through `sdd-apply`. State the default once
  and continue; never wait on the TUI.

**2. Audit: Judgment Day.** Two blind read-only judges (`jd-judge-a`, `jd-judge-b`) in parallel over the
same frozen tree, then a bounded correction round and at most two scoped re-judgments. The installed
agents and the skill mandate the graph-v1 shape: discovery returns **only**
`{"rows":[{"id","lens","location","severity","status_at_freeze","evidence_class","evidence_claim"}]}`, a
scoped re-judgment returns **only** `{"resolutions":[{"id","outcome":verified|corroborated|regression}]}`,
with no prose beside either. `review-risk`/`review-*` agents are **not** dispatchable outside the native
review lifecycle. Record the audit path in the tribunal index the way the five existing records do, and
state plainly that DN-05 is unsatisfied.

- **Write the record's correction note as a log, not as a claim.** In session 11 the correction note grew
  a row per pass (five verifier-found defects, one observation, then two defects the correction itself had
  introduced), because the first pass was not complete. That is the honest shape.
- **`jd-fix-agent` accepts only the canonical bounded dispatch**, and its `Frozen ledger SHA-256` is
  `canonicalHash(frozenRows)` = SHA-256 of the rows JSON with **object keys sorted alphabetically** (the
  runtime's `canonicalize` sorts keys). Computing it in template field order is rejected with a generic
  message; this cost two attempts in session 11.

**3. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only
those. An over-claimed cell is a defect (PR-06a had to revert PT-14; PR-07a skipped PT-07's half). PT-05
and PT-06 were filled by PR-08a/PR-08b across two commits on purpose, each naming only the files it added.
**PR-09's tasks ask for PT-18 and PT-25** (task 9.6), and both rows must name `test/registry/*.test.ts`
files this slice really adds.

**4. Budget policy, and the lesson that keeps repeating.** 400 lines of *authored* src+test, measured as
`git diff --numstat -- src test`, with disclosed PR-scoped exceptions otherwise. Five PR-scoped
precedents now: PR-06b 26, PR-07a 20, PR-07b 154, **PR-08a 348 → 554**, **PR-08b 272 → 372** (plus
DN-06's separate `size:exception`, which is only for whole-file AS-IS vendoring). Two lessons are now
first-class:

- **Measure after the correction, in the same pass as the edit.** PR-08a's correction cost +206 and
  PR-08b's +101. Worse: PR-08b's budget table was corrected for the tip *before* the change that shared
  its commit, so it said 759 while the shipped tree measured 772 — the independent verifier caught it.
- **PR-08's own estimate was 3.8× under** (≈370 planned, 1,400 realised), which is why it was re-sliced.
  Estimate from the file sizes the design names, not from the slice count.

**5. The ordinary native review is a separate, independent lifecycle (RDD switch: on).** After authorized
implementation is complete and normalized, and **before** reporting it complete, call `gentle_review` with
`{"operation":"inspect"}` and follow only the transition it returns. Three outcomes are now precedented:

- **approved** (PR-07b, PR-08a): relay any forecast losslessly (it runs nothing), re-submit with
  `reviewerRunAcknowledged: true`, then execute the exact acknowledgement continuation, which **burns**
  authority. Review approval never authorizes delivery.
- **declined** (PR-08b): the host resolved `declined_this_candidate` with `lineage_created: false` and no
  mutation. **A decline is not a closure** — never re-run review on that candidate, and follow the RDD
  risk-gated fallback: `gentle_review` `{"operation":"assess"}` with the decline stated returns the plan,
  which for risk `high` is *writer self-verification plus a separate independent verifier always runs*.
  **That verifier earned its cost twice over in session 11**: it reproduced every figure, then found five
  record defects and one observation, and a focused re-check found two more the correction had introduced.
- **the start can also fail before authority access** (`mode` missing, or a wrong `lineageId`): START
  supports only `{"mode":"ordinary","baseRef":…,"committedOnly":true}` plus the `lineageId` that
  `inspect` returned, and a failed START creates no lineage.

**6. Run the review against a frozen worktree, not the live one.** Pass `workspaceRoot` naming a clean
`git worktree add --detach` checkout of the candidate, so the provider binds the review to exactly that
slice and not to whatever else the working tree holds.

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
`apply-progress.md`. `constants.ts`' pin was wrong until 2026-09-17 (`4ce5e514…` was the blind-stripped
value; `039d53a2…` is rule-conformant) and is now settled (backlog **B-19**, `done`): do not re-report it.

**PR-09 vendors nothing.** The registry is new code (`src/registry/*`), so the fixture stays at 11 entries
and a `Provenance:` header on any new file is a defect.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **A `bin` entry needs a shebang, and no gate here can catch its absence** | `src/cli/main.ts` line 1 is `#!/usr/bin/env node` (ADR-0012 remediation row 2, "pinned by an assertion over the built bundle"). CI runs `windows-latest` only, where npm's shim invokes node explicitly, so the failure mode — *exit 0 with zero bytes on both streams* — is invisible here. The test reads the **built** file, not the source. Any future `bin` addition needs the same treatment | `src/cli/main.ts:1`, `test/cli/main.test.ts` |
| **Appending a row to a gated document shifts every later `file:line` citation** | PR-08b's appended `EXIT_VALIDATION_FAILED` row moved `design.md` by one, invalidating nine citations across five files PR-08a had already merged. Re-point citations **in the same commit** that appends the row, and re-derive each one (`design.md:149` roster, `:151` validator, `:589` D-27, `:144` R5) | `src/cli/validate.ts`, `src/shared/token-shape.ts`, `src/shared/roster-hash.ts`, `test/shared/token-shape.test.ts`, `test/shared/roster-hash.test.ts` |
| **A correction is itself unaudited until something re-checks it** | Two of PR-08b's defects were introduced *by* its correction. Run the focused re-check after a correction, and re-measure every figure the correction could have moved | `apply-progress.md` §PR-08b correction note |
| **`dist/` staleness fakes results, and `tsc -b` is incremental** | A confusing result was traced to the emitted JS behaving as the pre-fix code while `grep` showed the fix present; `rm -rf dist` resolved it. Always purge before believing a surprising run, and restore mutants byte-for-byte (`read_bytes`/`write_bytes`, never text mode — CRLF) | session 11 mutant rounds |
| **PT-22's deny-list markers are reserved** | `test/security/repo-scan.test.ts` defines two *synthetic* tenant markers (its `TENANT_DENY_LIST`) and excludes only itself from the scan, so reusing either as a fake operator marker in another file fails the scan — **including in documentation: quoting them here failed `test:static` while this very file was being written**. Invent a fresh marker. Token fixtures use a **7-digit** bot-id run, outside PT-22's `\d{8,10}` scan | `test/security/repo-scan.test.ts` |
| **zod v4's `unrecognized_keys` puts the key names in `issue.keys`, not `issue.path`** | The path is empty, so naming an unknown field requires reading `keys` and appending each to the rendered parent (`roster[0].role`). One issue can carry several keys | `src/shared/project-file.ts` |
| **`ProjectFileProblem`-style result types should be value-free by construction** | PR-08a's CRITICAL was a document-derived **key** echoed into a problem's `field`. A "cannot leak" claim is only as strong as its weakest string field, **including field names**, which are document text too; a forbidden key is now redacted (`<redacted>`) and the walk checks key names as well as values | `src/shared/project-file.ts` |
| **PT-25's owner disagrees between two gated documents — reported, not resolved** | `tasks.md`'s PR-09 block lists `project-binding › Machine registry schema and invariants` **(PT-18, PT-25)** and task 9.6 tells PR-09 to fill PT-25's cell, while `design.md:551` (deliverable 15's PT→file mapping) sends **PT-25 to `daemon/send/send-path`**. **The current rows sharpen which half is which:** both cells read `daemon unit`, PT-18's assertion is "loading a registry with one `bot_id` in two active bindings fails validation" (the registry's own invariant, so PR-09's), and **PT-25's assertion as written is `migrate_to_chat_id`/`GroupMigratedError` — the daemon side** — while the project-binding spec's traceability maps the same id to "binding is never rewritten from bus or API data", which is registry-side R6. Precedent: crediting the fence twin with PT-14 was an over-claim two judges caught in PR-06a. **Do not silently resolve it**: fill only the half this slice really pins, say so in the PR, and leave the rest to the daemon slice that owns it (backlog **B-26**) | `tasks.md` PR-09 · `design.md:551` · `THREAT-MODEL.md` §4 rows PT-18 (`:141`) and PT-25 (`:148`) |
| **`state.yaml` is YAML, and a plain scalar cannot hold `": "`** | Four values were once unquoted and contained one, making the whole document unparseable while `gentle-ai sdd-status` kept working. Session 11 validated the file with PyYAML after editing; **no gate does this for you**, so parse it after any edit | `bus-v2-f1-b19-repin-001` |
| **`node --test` output is ANSI-coloured, and `ℹ` breaks cp1252 decoding** | A grep anchored at `^ℹ` can find nothing while the suite is failing; strip escape codes and decode utf-8, or trust the exit code | sessions 9–11 |
| **`gentle-ai` is 3.0.2 and the attempt ledger is retired** | Only `sdd-attempt grant` remains. `gentle-pi` is 3.1.1 | `gentle-ai sdd-attempt --help` |
| **The ODD feature doc stays out of the repository** | Each slice's `odd/tasks/<feature>.md` is created (ODD requires it) and **deleted at close**; AGENTS.md §2 does not list an ODD tree. Fold the substance into `apply-progress.md` + Engram | Engram `odd/*/tasks` |
| **Remote branches of merged PRs are still on `origin`** (`f1/06a`, `06b`, `07a`, `07b`, `08a`, `08b`) | `gh pr merge --delete-branch` did not remove all of them (two merges hit transient network failures). Deleting them is a destructive git operation: **ask the Director first** | `git branch -a` |
| **`gh` refuses `--force-with-lease`** | Do not plan a force-push. `gh pr merge N --merge --delete-branch` works and returns the local tree to a pulled `main`; a transient `getaddrinfo` failure can leave the remote merged while the local `main` lags — re-check with `git fetch && git merge --ff-only origin/main` | PR #11/#12 history |

---

## §5 — Next session, exact sequence

1. **§0**: confirm `main`, `git pull --ff-only`, `rm -rf dist`, read the SDD status. Then read
   [`../../AGENTS.md`](../../AGENTS.md) §1–§2, this file's §2, `apply-progress.md`'s PR-08b section (the
   correction note included), `tasks.md`'s **PR-09** block, and — in `design.md` — §4's registry rows
   (`grep -n 'registry/schema.ts\|registry/invariants.ts\|registry/loader.ts\|Hot-reload mechanism'`:
   currently 136, 140, 144, 147), the `node:fs` allow-list row (currently 524, which constrains
   `registry/loader.js`), and the PT→file mapping (currently 551, the source of the PT-25 conflict in §4
   of this file). **Design §12 has no row naming `registry/*`**: the registry is new code, so vendoring
   nothing is the expected verdict, exactly as for PR-08a's three modules.
2. **State the plan in one line and proceed — this is not a question and there is no waiting turn:**
   ODD + Judgment Day (§2). Do **not** ask the Director to choose a workflow and do **not** wait for the
   TUI.
3. **Branch** `f1/09-registry` from `main`, and follow `tasks.md`'s PR-09 block exactly (it names the
   modules, the requirements PT-18/PT-25, and the six sub-tasks 9.1–9.6). Strict TDD, twins in the same PR.
   **Two build facts, both verified:** `src/registry/` and `test/registry/` **do not exist yet**, and every
   existing unit directory (`src/{shared,cli,client,daemon}/`) carries its own `tsconfig.json`. So this
   slice must **create** `src/registry/tsconfig.json` — mirror `src/cli/tsconfig.json`
   (`extends: ../../tsconfig.base.json`, `rootDir: ../..`, `outDir: ../../dist`, `tsBuildInfoFile:
   ../../dist/.tsbuildinfo/registry.tsbuildinfo`, `include: ["**/*.ts"]`, one reference to `../shared`) —
   **and** add `{ "path": "src/registry" }` to the root `tsconfig.json` `references`, or the slice fails
   its own merge with `TS18003` (an empty composite unit). Do **not** repeat `src/cli`'s mistake of
   referencing a sibling unit before that unit has any `.ts` file.
4. **Docs in the same PR**: PT-18/PT-25 cells with the tests this slice adds (task 9.6) — but **read §4's
   PT-25 row first**: the row's owner disagrees between `tasks.md` and `design.md:551`, so name only the half
   this slice really pins, state that in the PR body, and leave the rest to the daemon slice that owns it
   (backlog **B-26**).
5. **Verify** from a clean detached worktree, not the working tree: `git worktree add --detach … <sha>`,
   then `npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js" && npm run test:static`,
   then remove the worktree. Run the focused command too, and at least four mutants on a cleaned `dist/`
   — including one at the loader's quarantine/never-rename boundary, which is where this slice's promise
   lives.
6. **Measure the real diff** (`git diff --numstat -- src test`), read every new file in full, and ask the
   Director for commit authorization. Commit as work units (code + its twin + its fixture entry together),
   then the docs/bookkeeping commit. If the diff exceeds 400, see §2.4 — do not open the PR silently over
   budget.
7. **Audit** (§2.2) over the frozen range, fix only what the ledger confirms, and record the ledger, the
   corrections and the verdict in `apply-progress.md` — correction note as a **log**. Re-judge once.
8. **The ordinary native review runs too** (§2.5), against a frozen worktree. Approval does not authorize
   delivery; a decline is recorded as a decline and triggers the fallback, whose independent verifier's
   findings are corrected **before** the commit that claims they are corrected.
9. **Stop at a PR boundary.** Push, open the PR with
   `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh …` (never `gh auth switch`),
   wait for the CI matrix, merge only with the Director's authorization, then: rewrite this file, prepend
   to [`LOG.md`](./LOG.md), add the audit-path record to [`INDEX.md`](../05-tribunal/INDEX.md), sweep every
   status line in `AGENTS.md`, `README.md`, `docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml`
   (**parse the YAML after editing**), add any backlog row the audits recommended, run `mem_session_summary`,
   commit the docs on `main`, and push.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits so far: the PR-01/PR-06/PR-08 re-slice
  notes, the PR-07a block, the PR-07b carried-findings note (+ D4 amendment), the **appended**
  `EXIT_VALIDATION_FAILED` row in design §11, and the checkbox flips. Do not rewrite a gate's text; append
  a note.
- Provenance hash rule, registry and range convention are ratified — §3. `constants.ts:3` is settled
  (B-19, `done`); do not re-open or re-report it.
- **Doc-hygiene rule** (ratified `bus-v2-f1-pr-03-001`): never quote a matched-and-rejected secret-shaped
  literal in `apply-progress.md`; describe the shape. PT-22 scans every tracked file — including the
  judgment-day rows the writer freezes into the record.
- **PR-06, PR-07a, PR-07b, PR-08a and PR-08b are merged; do not re-slice, re-audit or re-open them.** In
  particular: PR-08b's native review was **declined**, so that candidate is never re-reviewed; the four
  advisory findings of PR-08a's review are backlog **B-22** and are not a reason to re-run anything; and
  `JD-A-003` is backlog **B-23**.
- **Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match** in a
  later slice without a decision: both are disclosed deviations (a missing walk-up target that PR-33 owns,
  and RFC 9110 §5.1 hardening) and the usage text now pins what the build accepts.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake
  imports it, never redefines it.
- TypeScript 7.0.2 needs `"types": ["node"]`; an empty composite unit is `TS18003`. `src/cli` is now in the
  root `references`; `src/{client,daemon}` join it in PR-32 and PR-15 — and `src/cli/tsconfig.json`
  deliberately does **not** reference them yet, with the reason written in the file.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job (its glob matches nothing yet);
  that is by design, not a passing gate. `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by
  path; `git ls-files`-based scanners see only tracked or staged files, so `git add` (or `git add -N`)
  before a local RED/GREEN.
- Type-only modules satisfy Strict TDD's triangulation gate via the explicit type-only exception in
  `strict-tdd.md`; a missing-module `TS2307` from `tsc` is a legitimate RED for a brand-new module.
- **Stale comments, stale figures and stale records**: after a correction edits a file, every figure about
  that file is suspect — grep the whole record for the old number, and for the new one, before committing.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-22 | The four advisory findings of PR-08a's ordinary native review, recorded not actioned (the closure forbids re-running that review) | Director |
| B-23 | `JD-A-003`: the deliberate precedence of `unsupported_schema_version` over the content walk is documented but unpinned by a test (ADR-12) | Kairo → Alpha |
| carried (PR-06) | Digest blind spots incl. `MAX_THREAD_HISTORY = 50` saturation — proposed minimal fix: the last history entry's `eid` in the digest row | Director → Kairo |
| carried (PR-06) | The fence's body escape does not neutralise `&`, so the fence is not injective; THREAT-MODEL §7 ratifies the fence as inherited unchanged, so it needs its own decision | Director |
| B-16 / D-10 | `LICENSE` ships with `private: true`; SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line open; a **real tenant deny-list** for PT-22 must live outside the tree (CI secret) — decide at PR-42 | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant (`src/shared/constants.ts`) | Director |
| B-12 | macOS scope; B-13 migration runbook closes when PR-38 merges | Director + Kairo |
| B-24 | **No POSIX CI leg**, so packaging/execution contracts (shebangs, file modes, bin-links) cannot fail here: the ADR-0012 shebang defect was found by an audit, not by a gate | Kairo → Alpha |
| B-25 | **Three cheap gates/hygiene items for one later audited PR**: (a) a YAML validity check over `git ls-files '*.y*ml'` — session 11 parsed `state.yaml` with PyYAML by hand, because no gate checks it and a broken `state.yaml` once stayed unparseable for several sessions; (b) a `clean` step before `npm test`, so a stale `dist/` cannot fake results; (c) bump `actions/checkout` and `actions/setup-node` off Node 20 | Kairo → Alpha |
| B-26 | **PT-25's owner is attributed differently by two gated documents** — `tasks.md`'s PR-09 block claims it for the registry slice, `design.md:551` sends it to `daemon/send/send-path`. Report, do not silently resolve: whichever slice fills the cell names only what it pins | Director → Kairo |
| — | Delete the stale remote branches of the six merged PRs (`f1/{06a,06b,07a,07b,08a,08b}`) — a destructive git operation, so it needs the Director's word | Director |
| — | T22 bytes-per-hour ceiling and the origin-label organisation marker (PR-42 close-out) | Director |
| B-05, B-07, B-08, B-09 | gentle-ai installer study; Telegram bot-to-bot visibility; Windows IPC/DACL; MCP notification rendering per host — all F0 spikes, all still open | Director + Kairo |

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16, npm 11.5, gentle-ai 3.0.2 CLI, gentle-pi 3.1.1, TypeScript 7.0.2
  pinned. Receipt-driven development is **on** (`gentle-ai review mode status`: global on, clone-local
  unset) — see §2.5.
- Line endings: both repositories have `core.autocrlf=true`. This one forces `eol=lf` through
  `.gitattributes`; the v1 checkout has none. Vendored bodies come from `git show bf8f365:<path>` (the raw
  blob, always LF) and the provenance hash normalizes CRLF→LF. Check with `git ls-files --eol`.
- `node --test` prints `ℹ tests / ℹ pass / ℹ fail` (ANSI-coloured), not `# tests`.
- GitHub Actions: the workflow lives on `main`, so `pull_request` runs fire on PR open (≈30–50 s per
  matrix entry, Node 24.15 and 26). `gh pr merge N --merge --delete-branch` also checks out `main` and
  pulls; a transient DNS failure can leave the remote merged and the local `main` behind — recover with
  `git fetch && git merge --ff-only origin/main`.
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365` (tag `v1.0.2` + 2 commits),
  **read-only**; cite as `path:line`. It carries one pre-existing untracked file, `alpha_response.json`,
  harmless and not this project's state.
- Verification worktrees live in `../telegram_bus_agent-worktrees/` and are removed as soon as their run
  finishes; **an empty directory is the expected end state** (session 11 ended with it empty).
- Arena bridge: `.mcp.json` (gitignored) points at `http://127.0.0.1:8766/mcp` — the Arena Orion Electron
  app, **down** unless the Director launched it. Never quote `.mcp.json` and never commit it.
- GitHub auth is isolated from the machine-global `gh` account: this checkout's `.git/config` carries a
  local `credential.helper`; every `gh` call runs with
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh …`. **Never
  `gh auth switch`.**
