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
has now been proven end to end on PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a, PR-09b, PR-10 and **PR-11**.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en su rebanada PR-12 (unidad `ledger`: `src/ledger/inbox.ts` + `src/ledger/threads.ts` + `src/ledger/cursors.ts` con sus tres gemelos — la transacción write-ahead de la bandeja, el adaptador de hilos y los cursores por cliente, ≈400 líneas, PT-10 + PT-11, D-19): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + auditoría Judgment Day); la Arena de debate no está disponible, así que nada depende de un debate ni de una acción en la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** at the start of this session except for the untracked `odd/`
directory if a previous session left one (PR-11 deleted its own; see §4). The status command must print
`nextRecommended: apply`, `completed: 64` of `210`, `blockedReasons: []`. Anything else: stop and report.
(`verifyReport: missing` is **expected and correct** while `apply` runs.)

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Merged to `main`: **`#1`–`#16`**. **13 of the 45 task rows are done, delivered as 16 PRs** — PR-06, PR-08 and PR-09 were each re-sliced *in place* (PR-09 into 09a/09b), and no row was ever re-numbered. **32 rows remain: PR-12…PR-42.** Next slice: **PR-12**. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | **45 PR blocks / 42 row ids** in `tasks.md` (`PR-01…PR-42`; PR-06, PR-08 and PR-09 were each re-sliced in place into two blocks). Complete: **16 blocks / 11 row ids** (`PR-01…PR-11`). Remaining: **32 blocks / 31 row ids** (`PR-12…PR-42`). Checkboxes: **64 of 210**. *The "of the 45 rows" counters in earlier records are a carried-forward figure whose arithmetic does not resolve against `tasks.md`; the three lines above are the ones you can verify with `grep`.* | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **64/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Unit 4 `ledger` — **half done** | `src/ledger/{schema,transaction}.ts` (PR-10, merged as **#15**) and `src/ledger/{open,migrations}.ts` (PR-11, merged as **#16**, `50c506a`, code/record tip `4d207df`, 1,276 authored lines / **876-line exception**). Remaining in the unit: PR-12 `inbox.ts`/`threads.ts`/`cursors.ts`, PR-13 `audit.ts`/`unknown-senders.ts`/`conditions-store.ts`/`retention.ts`. | `INDEX.md` `bus-v2-f1-pr-11-audit-001` |
| Code on `main` | `src/shared/*` (16 modules), `src/cli/{main,validate}.ts`, `src/registry/{schema,invariants,loader}.ts`, `src/ledger/{schema,transaction,open,migrations}.ts`, all with twins — **379 tests**, `test:static` **8** | PRs `#1`–`#16` |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**`; the scanned set must **equal** `test/fixtures/v1-provenance.json` — **11 entries, unchanged since PR-07b**. The ledger unit vendors nothing, so its files carry **no** header of that kind — see §4's trap before adding a non-vendored module with no imports. | `test/security/provenance.test.ts` |
| Audit status | **DN-05 is unsatisfied for PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a, PR-09b, PR-10 and PR-11** — all nine audited by the **Judgment Day substitute**, one record each in the tribunal index. | [`INDEX.md`](../05-tribunal/INDEX.md) |

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

**2. Audit: Judgment Day**, exactly as PR-10 and PR-11 ran it. Two blind read-only judges (`jd-judge-a`,
`jd-judge-b`) in parallel over one immutable frozen tree, graph-v1 shapes only (discovery returns only
`{"rows":[…]}`; a scoped re-judgment returns only `{"resolutions":[…]}`), then a bounded correction round and
**at most two scoped re-judgments — the budget is two, and a round-two survivor escalates**. `review-risk`/
`review-*` agents are **not** dispatchable outside the native review lifecycle. Record the audit path in the
tribunal index the way the nine existing records do, and state plainly that DN-05 is unsatisfied. Twelve
rules, all learned the hard way (the first six from PR-06…PR-10, the last six from PR-11):

- **Ask before round 1** (the skill requires it). The Director has authorized the full batch each time, so
  present the ledger and the proposed batch in one question — **including the line cost**. If the Director's
  standing instruction for the session is "do not stop for authorizations", authorize the batch by that
  delegation and **disclose the batch, its size and its cost in the record and in the PR body instead** —
  which is what PR-11 did. Never let the disclosure go missing either way.
- **A single-judge row is *suspect*, never auto-fixable — and never dismissible from authority either.**
  Reproduce it deterministically first.
- **Re-run the whole sweep after every correction, and fix stale anchors rather than reporting skips.** A
  sweep reported with silent skips is not evidence. When the correction round's delta is *comment-only*,
  a re-run is not needed **if you prove it**: `sha256` the mutated files at both tips and say so.
- **The `jd-fix-agent` dispatch is graded and strict.** The `## Exact authorized severe IDs` section must
  list **exactly the BLOCKER/CRITICAL rows**, and the `Frozen ledger SHA-256` is the SHA-256 of the rows JSON
  with object keys sorted alphabetically — computed **from a file** (write the rows, hash the file), never
  through `node -e`. A batch with zero severe rows is applied by the **writer**, as PR-10's and PR-11's were;
  state that in the record.
- **A scoped re-judgment's `regression` resolution carries no substance** — the graph-v1 shape has only `id`
  and `outcome`. `subagent_continue` the *re-judgment* session to obtain the proof; continuing the *discovery*
  sessions instead earns a correct refusal to invent substance. (`subagent_list_tasks` lists newest first.)
- **A finding's own reproduction may not survive this repository's hygiene rules.** Adapt, and say so.
- **A correction can install a *new* defect of the same class as the one it fixed.** PR-11's round-1 note
  replaced a false TS18003 claim with another false claim, on the same line, and round 2 replaced *that* with
  a third that is still imprecise (the discriminator is the `references` entry, not composite-ness — see §4).
  Re-measure the **replacement text**, not only the row you were fixing, and expect the re-judge to attack the
  replacement harder than the original.
- **A row can be a *disposition*, not an edit** (PR-11's `JD-A-007`: "the record the commit messages point at
  does not exist yet"). Land the artefact **before** the re-judgment runs, or the row verifies as
  unresolved by construction.
- **Recount every severity tally from the frozen ledger file, never from memory.** PR-11's record said
  "1 CRITICAL, 4 WARNING, 6 SUGGESTION, two defects reached by both judges" while the ledger said **1/5/5**
  and **three** shared defects — its own row table already said three. Both re-judges caught it.
- **A prose claim has no executable mutant, so its evidence is a *measurement*** — a compiler matrix, a
  printed config, a probe. Say which, and reproduce it yourself before believing either judge.
- **A message inside the audited range is frozen.** When a figure or claim in it turns out wrong, say so
  explicitly in the record ("superseded here rather than rewritten, because rewriting it would rewrite the
  audited range") instead of amending it. PR-11 has three such disclosures.
- **Expect split verdicts.** PR-11's round 2 returned `regression` from one judge and `verified` from the
  other **on the same rows, measuring identical facts**. When that happens, read what each judge actually
  measured, accept the substance, and record the split — do not average it away.

**3. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only
those; an over-claimed cell is a defect. **PR-12's block names PT-10 and PT-11 in its 12.6 docs task**, so it
updates those two cells in `docs/02-architecture/THREAT-MODEL.md` §4 and nothing else. Read `tasks.md`'s
PR-12 block and **B-26** (PT-25's owner disagreement) before touching any cell, and name only what the tests
really pin.

**4. Budget policy.** 400 lines of *authored* src+test, measured as `git diff --numstat -- src test`, with
disclosed PR-scoped exceptions otherwise. Nine precedents: PR-06b 26, PR-07a 20, PR-07b 154, PR-08a 348,
PR-08b 272, PR-09a 866, PR-09b 375, PR-10 957, **PR-11 876**. Four lessons, all re-confirmed by PR-11:

- **Measure after every correction, in the same pass as the edit, and again at the tip that ships.** PR-11's
  figure moved 1,085 → 1,275 → 1,276 across its rounds, and the independent verifier still caught the table
  measured one commit behind the reviewed tip.
- **Never write a computed figure as if it were measured**, and never leave a superseded figure unmarked.
- **Estimate from the file sizes the design names.** PR-12's block says ≈400 for three modules and three
  twins; if it lands over, take a **disclosed PR-12-scoped exception** rather than trimming tests.
- **Disclose growth past an authorized batch** rather than absorbing it.

**5. The ordinary native review is a separate, independent lifecycle (RDD switch: on).** After authorized
implementation is complete and normalized, and **before** reporting it complete, call `gentle_review` with
`{"operation":"inspect"}` and follow only the transition it returns. Six outcomes are now precedented:

- **granted and approved** (PR-07b, PR-08a, PR-09b): inspect → START → host consent → `status` returns a
  `collect` slot → `gentle_review_capture` returns a **forecast** (relay it losslessly, then resubmit the same
  binding with `reviewerRunAcknowledged: true`) → closure `approved` → execute the **exact**
  `acknowledge-approved` continuation, whose envelope reports `authority: burned`. Advisory findings become a
  backlog row and are **not** actioned.
- **declined** (PR-08b, PR-09a, PR-10, **PR-11**): `declined_this_candidate`, `lineage_created: false`, no
  mutation, and the same candidate is **never re-reviewed**. Run the RDD fallback: `assess` with the decline
  stated returns the plan.
- **declined *by the host*, with no envelope ever relayed** (PR-11): the START returned
  `consent-declined-this-candidate` directly. That is a host resolution, not yours: **never invent consent,
  never call `answer-consent` for a decision you did not receive.** Record it and run the fallback.
- **`assess` can return `risk: "unassessable"`** (PR-11: "native response is schema incompatible"). By its own
  rule that is treated as **high risk**, and the plan then includes the **separate independent verifier**.
- **a stale consent binding** is recoverable: START returns `consent-binding-stale` with
  `lineage_created: false` and the instruction to run START again for a fresh envelope.
- **START argument shapes are graded.** The facade wants `{"mode":"ordinary","baseRef":"…","committedOnly":true}`
  **and** the `lineageId` that `inspect` bound; a failure happens **before** authority access, so no lineage is
  created and nothing is burned.
- **A decline is not a closure** and approval authorizes **no** delivery: commit, push, PR and merge stay under
  ordinary repository policy and the Director's word.

**6. Run the audit and the review against frozen worktrees, not the live one.** `git worktree add --detach
../telegram_bus_agent-worktrees/<name> <sha>`, pass `workspaceRoot` to the review, hand the judges the
**committed** tree, and remove the worktrees when the run ends. The fast way to get a working tree there is a
**junction to the main checkout's `node_modules`** (see §8); `git reset --hard` is blocked by this workspace's
safety policy, so restore a scratch worktree with `git rm --cached` + `git checkout <base> -- <paths>` +
explicit `rm -f`. For pre-commit verification, apply the candidate as a patch into a worktree at the base and
prove the candidate bytes with `sha256sum` on both sides.

**7. The dynamic-namespace gateway is not an approved evidence route**, and the four F0 spikes (B-05,
B-07, B-08, B-09) stay open.

**8. Remote delivery is authorized for this project** (Director, session 14, on top of DN-07/DN-08): push the
branch, open the PR, wait for the CI matrix, merge on the Director's word. The machine-global
`~/.pi/agent/AGENTS.md` rule "NO REMOTE, EVER" is about the unrelated `consultores-orion` account; this
checkout's `origin` is `agentesinteligentesllm-oss/connmuta` through the isolated local credential helper, and
this project's sixteen PRs exist by exactly this route.

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
`apply-progress.md`. **PR-11 vendored nothing** — `open.ts` and `migrations.ts` are new code — so the fixture
stays at 11 entries and a header of that kind on a new file is a defect. PR-11 added one new fixture,
`test/fixtures/ledger-corrupt.db`: **text on purpose** (a ledger file whose bytes are not a SQLite database),
so the corruption is reviewable rather than an opaque binary blob. The *second* corruption class — damage
SQLite reports as a `quick_check` row instead of throwing — is produced in the test by flipping the header's
first reserved byte, so no binary blob is needed for it either.

A second pinned value now exists in the tree, and it is the *design's* text rather than v1's:
`src/ledger/schema.ts`'s `LEDGER_SCHEMA_DDL` is design §5.2's `sql` block **verbatim** —
`sha256 9e9bb65545df29ce5871bea095a6d5457a8865a1a739abda9feb62058915b506`, 74 lines / 4,123 bytes. PR-11
applies that string through migration 1 and **does not edit it** (a schema change is a migration, not an edit
to version 1); `test/ledger/migrations.test.ts` pins "migration 1 is that text" by comparing the schema
objects against the DDL applied directly to a second connection.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **The `TS18003` rule this repository believed is false, and three places still state it.** Measured with TypeScript 7.0.2: an **unused** project reference builds clean (`exit 0`); `TS18003` is what a project whose `include` matches nothing reports when it has **no `references` entry at all**, and any entry — even `"references": []` — suppresses it, exactly as `files: []` does; composite-ness neither causes nor prevents it. `src/ledger/tsconfig.json` carries the measured version; `src/cli/tsconfig.json:10` and `src/registry/tsconfig.json:12` still state it falsely, and this handoff's own §5/§6 used to. | **B-34**; PR-11's Judgment Day hit it three times | `src/ledger/tsconfig.json` |
| **`PRAGMA quick_check` does not verify index content.** A ledger whose index no longer matches its table answers `ok` while `integrity_check` reports a missing index row (measured; 59,544 single-byte flips in one index tree, 716 still `ok`). The open sequence decides whether the file is *usable*, not whether it is *consistent*. | PR-11's `JD-A-004`, stated as a boundary in `open.ts` |  |
| **Two of PR-11's three PRAGMA assertions cannot discriminate their own statement.** On the pinned build `synchronous` already reads `2` and `foreign_keys` already `1`; `journal_mode` is the discriminating one (`delete` by default). The assertions pin the effective value — a mutant that *changes* either is killed, one that *deletes* the statement is not. | Stated in `src/ledger/open.ts` and in the test's comment |  |
| **`M8` (the `POSIX_PRIVATE_DIR_MODE` mutant) survives on this machine** because the mode assertion is skipped on Windows and the CI matrix is `windows-latest` only. | **B-24** | `.github/workflows/ci.yml` |
| **`provenance.test.ts` reads a *leading* `/**` block as a vendor header** | If a file begins with `/**` and that block contains the header's own first token (a capitalised `Provenance` followed by a colon), the gate demands a complete, parseable header and otherwise fails with `malformed Provenance header(s)`. A non-vendored module **with no imports** has its doc comment as that block, so it must not spell the token. `src/ledger/schema.ts` hit this in PR-10. | **B-33** |
| **`git ls-files`-based scanners only see tracked or staged files** | `repo-scan.test.ts` and `provenance.test.ts` run over `git ls-files`, so a new file is invisible to them until `git add`/`git add -N`. Its failure mode is a *late* static failure, after the focused suite has already gone green. | PR-09b, PR-10, PR-11 |
| **PT-22's token shape needs a colon plus 35 token characters after 8–10 digits** | `test/security/repo-scan.test.ts` skips files containing a NUL byte, so a binary fixture is safe, and a 13-digit epoch inside `ledger.corrupt-<epochMs>.db` is safe because no colon follows it. | `test/security/repo-scan.test.ts` |
| **`PRAGMA user_version` cannot be parameterized** (`near "?": syntax error`) and a write to it inside a transaction **is** rolled back with it (both measured in PR-11). | The stamp is interpolated, and the path's contiguity check is what makes that safe | `src/ledger/migrations.ts` |
| **`node:sqlite`'s `errcode` is not always the primary code**: an extended code shares the primary code's low byte (`526 & 0xFF === 14` = `SQLITE_CANTOPEN`). Compare the class, not two integers — and remember that a corruption *class* being covered says nothing about what the probe looks at. | `isLedgerCorruptionError`, exported so the rule is pinnable with synthetic codes | `src/ledger/open.ts` |
| **A clean `close()` removes the `-wal`/`-shm` siblings** (and the close, not the open, is what removes them). The open path closes before it renames, so the sibling half of the quarantine rename is only observable at the helper. | `quarantineLedgerFile`, exported for exactly that reason | `src/ledger/open.ts` |
| **A `gentle_review` decline can be *host-resolved*** (PR-11 never saw an envelope) and **its risk evidence can be a false positive** (PR-11's cited "an executable change in `apply-progress.md`" — a Markdown record with code fences). Never invent consent, and never treat the signal as a finding about the code. | `apply-progress.md` §PR-11 |  |
| **The Judgment Day round budget is two.** A round-two survivor escalates, and PR-11 ended with two SUGGESTION-class rows surviving on split verdicts, their corrections disclosed as measurement-checked but not judge-re-judged. | `INDEX.md` `bus-v2-f1-pr-11-audit-001`; §2.2 above |  |
| **Bash executes backticks inside double-quoted strings, and `cat << 'EOF'` heredocs truncate on long Markdown** | Write such patches to a file with the editor and append them with a `node` script (PR-10 and PR-11 both lost a tail to this); for long commit messages use `git commit -F <file>` and check the message's tail afterwards. | sessions 13–14 |
| **`git reset --hard` is blocked by this workspace's safety policy** | Use `git rm --cached` + `git checkout <base> -- <paths>` + explicit `rm -f` to restore a scratch worktree. | session 14 |
| **`dist/` staleness fakes results, and `tsc -b` is incremental** | Always `rm -rf dist` before believing a surprising run; restore mutants byte-for-byte and verify with `sha256`. | sessions 11–14 |
| **`state.yaml` is YAML, and a plain scalar cannot hold `": "`** | Validate it with PyYAML after editing (`python -c "import yaml…"`); `gentle-ai sdd-status` also reads it. | `bus-v2-f1-b19-repin-001` |
| **`node --test` output is ANSI-coloured** | Strip escape codes (or trust the exit code) before reading counts. | sessions 9–14 |
| **`gh pr merge N --merge --delete-branch`** | Works; the local branch is *not* always switched or deleted, so finish with `git checkout main && git pull --ff-only && git branch -d <branch>`. Every `gh` call needs `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**. | PRs #13–#16 |
| **The ODD feature doc stays out of the repository** | Each slice's `odd/tasks/<feature>.md` is created (ODD requires it) and **deleted at close**; AGENTS.md §2 does not list an ODD tree. Fold the substance into `apply-progress.md` + Engram. | Engram `odd/*/tasks` |
| **`roster_hash` may be a legacy `sha256:` value** | Nothing at load time ties it to its snapshot (**B-29**); the loader only shape-checks it. | `src/registry/schema.ts` |

---

## §5 — Next session, exact sequence

1. **§0**: confirm `main` is clean and current, `rm -rf dist`, read the SDD status. Then read
   [`../../AGENTS.md`](../../AGENTS.md) §1–§2, this file's §2, `tasks.md`'s **PR-12 block** (and the
   `Unit 4 — ledger` heading), design **§5.3** (the write-ahead transaction and PT-10's replay), **§5.2**
   (the DDL, as *input*), and design §15's **Ledger** layer.
2. **Create the ODD feature doc** (`odd/tasks/pr-12-ledger-inbox-cursors.md`, untracked, deleted at close),
   its Engram mirror (`odd/pr-12-ledger-inbox-cursors/tasks`) and the visible `todo` list, **before** the
   first write. State the plan in one line and proceed; do not ask the Director to choose a workflow and do
   not wait on the TUI.
3. **Branch** `f1/12-ledger-inbox-cursors` from `main`. Then follow the block exactly:
   - **12.1 RED**: `test/ledger/inbox.test.ts` — "crash between insert and offset advance replays once":
     inject the fault *before* the offset-advance commit, then re-serve the batch and prove the redelivery is
     deduplicated by `UNIQUE (bot_id, update_id)` and counted `replayed`. Real `node:sqlite` over a `mkdtemp`
     temp file; the fault is a throw inside `withTransaction` (PR-10's mechanism, PR-11's consumer of it).
   - **12.2 GREEN**: `src/ledger/inbox.ts` (one transaction per poll batch: insert `updates`, upsert
     `threads`/`thread_history`, insert `audit_log` rows, advance `offsets.next_update_id` **last**, inside
     the same transaction) and `src/ledger/threads.ts` (the `ThreadRecord` adapter consumed by
     `shared/protocol-apply.ts` from PR-05). `updates.body` must be `NULL` exactly for `rejected`/`ignored`
     — the DDL does **not** enforce that coupling (PR-10's stated boundary); this writer does.
   - **12.3 RED**: `test/ledger/cursors.test.ts` — "two clients each see the full batch once" and "a fresh
     session's cursor starts at the catch-up window, not at zero" (D-19, `SESSION_CATCHUP_HOURS`).
   - **12.4 GREEN**: `src/ledger/cursors.ts` (`client_cursors`/`client_surfaced` reads and writes).
   - **12.5 Verify**: `npm run build && node --test "dist/test/ledger/inbox.test.js" "dist/test/ledger/threads.test.js" "dist/test/ledger/cursors.test.js"`.
   - **12.6 Docs**: update the file-name cells of **PT-10 and PT-11** in `docs/02-architecture/THREAT-MODEL.md`
     §4 with the test files this PR adds — and only the half each one really pins (B-26).
4. **Verify** from a frozen worktree (never the working tree): the full suite and `test:static`, plus a
   mutant sweep on a cleaned `dist/` — at least: remove the offset advance from the transaction, move it
   outside it, drop the dedup key, advance the offset *before* the batch commits, start a fresh cursor at
   zero instead of the catch-up window, and share one cursor between two clients.
5. **Measure the real diff** (`git diff --numstat -- src test`), read every new file in full, and obtain the
   commit authorization and any PR-12-scoped exception (one question if the Director is available; otherwise
   the delegation + disclosure of §2.2).
6. **Commit** as work units (code + its twin together), then the docs/bookkeeping commit.
7. **Audit** (§2.2) over the frozen committed range, then **the ordinary native review** (§2.5) and, if it
   declines, the RDD fallback with its independent verifier — correcting every finding **before** the commit
   that claims it is corrected — then push, open the PR, wait for the CI matrix, and merge.
8. **Close**: rewrite this file (for **PR-13**, the audit/unknown-senders/conditions/retention slice),
   prepend to [`LOG.md`](./LOG.md), add the audit-path record to [`INDEX.md`](../05-tribunal/INDEX.md), sweep
   every status line in `AGENTS.md`, `README.md`, `docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml`
   (**parse the YAML after editing**), add any backlog row the audits recommended, delete the ODD document,
   run `mem_session_summary`, commit the docs on `main`, and push.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits so far: the PR-01, PR-06, PR-08 and PR-09
  re-slice notes, the PR-07a block, the PR-07b carried-findings note (+ D4 amendment), the **appended**
  `EXIT_VALIDATION_FAILED` row in design §11, the PR-10 apply-time note, and the **PR-11 apply-time note**
  (with its sub-task-order disclosure and its size figures). Do not rewrite a gate's text; append a note.
  **Rows PR-09, PR-10 and PR-11 are closed** (11.1–11.5 all `[x]`; there is no 11.6).
- Provenance hash rule, registry and range convention are ratified — §3. `constants.ts:3` is settled
  (B-19, `done`); do not re-open or re-report it.
- **Doc-hygiene rule** (ratified `bus-v2-f1-pr-03-001`): never quote a matched-and-rejected secret-shaped
  literal in `apply-progress.md`; describe the shape.
- **PR-01…PR-11 are merged; do not re-slice, re-audit or re-open them.** PR-08b's, PR-09a's, PR-10's and
  **PR-11's** native reviews were **declined** and are never re-run; PR-07b's, PR-08a's and PR-09b's were
  **approved** with advisory findings (B-21, B-22, B-32) that are recorded, not actioned. PR-11's Judgment Day
  ran its **two** rounds and closed `APPROVED`; its two surviving SUGGESTION rows are escalated and recorded,
  and **no third round exists**.
- **The registry unit is closed** (`schema`, `invariants`, `loader`), and the ledger's `schema.ts` is
  design §5.2's text: **a schema change is a migration, never an edit to version 1**. PR-11's `open.ts` and
  `migrations.ts` are frozen the same way: a defect in them is its own slice with its own audit, not a
  drive-by edit.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a
  decision: both are disclosed deviations.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake imports
  it, never redefines it.
- TypeScript 7.0.2 needs `"types": ["node"]`. **The TS18003 claim this file used to make was false** (§4):
  a unit's `tsconfig.json` does not have to wait for its first `.ts` file, and a project reference may be
  present while unused. `src/{client,daemon}` join the root references in PR-32 and PR-15.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job; that is by design.
  `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by path.
- Type-only modules satisfy Strict TDD's triangulation gate via the explicit type-only exception; a missing
  module (`TS2307`, or `TS2305` over a module that exists and exports nothing) is a legitimate RED.
- **Stale comments, stale figures and stale records**: after a correction edits a file, every figure about
  that file is suspect — grep the whole record for the old number, and for the new one, before committing.
  PR-11's independent verifier found eight defects this way, all of them in the record's own numbers.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-22 | The four advisory findings of PR-08a's ordinary native review, recorded not actioned | Director |
| B-23 | `JD-A-003`: the deliberate precedence of `unsupported_schema_version` over the content walk is documented but unpinned (ADR-12) | Kairo → Alpha |
| B-24 | **No POSIX CI leg**, so packaging/execution contracts cannot fail here (PR-11's `M8` survivor) | Kairo → Alpha |
| B-25 | Three cheap gates for one later audited PR: a YAML validity check over `git ls-files '*.y*ml'`; a `clean` step before `npm test`; bumping `actions/*` off Node 20 | Kairo → Alpha |
| B-26 | **PT-25's owner is attributed differently by two gated documents.** PR-11 kept its cells untouched; PR-12 (12.6) updates PT-10/PT-11 and must not inherit the confusion | Director → Kairo |
| B-27 | **The shared token regex matches this project's own `sha256:` roster hash**, so R5 would refuse every valid registry | Director → Kairo |
| B-28 | **No R1–R6 row demands referential integrity**, so a dangling reference loads. An F2 `doctor` check owns it | Kairo → Alpha |
| B-29 | **Nothing at load time ties `roster_hash` to its snapshot** (two independent judges) | Director → Kairo |
| B-30 | **R5's strictness refuses free-form human text** | Director → Kairo |
| B-31 | **A JSON-escaped colon (`\u003a`) bypasses the raw-text scan** | Director → Kairo |
| B-32 | The four advisory findings of PR-09b's approved native review, recorded not actioned | Director |
| B-33 | **`test/security/provenance.test.ts` treats a file's leading `/**` block as a vendor header** | Kairo → Alpha |
| **B-34** | **The `TS18003` rule is stated falsely in `src/cli/tsconfig.json:10` and `src/registry/tsconfig.json:12`** (both audited slices PR-11 was not allowed to edit). The measured rule is in `src/ledger/tsconfig.json`. Wording only | Kairo → Alpha |
| PR-11 escalated | **Two SUGGESTION-class rows survived PR-11's second Judgment Day round on split verdicts** — the compiler-claim note and, in the same round, the record's own severity/pointer defects. The corrections were applied and are measurement-checked, **not judge-re-judged**, because the round budget is two. Nothing blocks PR-12; they are recorded for the Director to disposition | Director |
| carried (PR-06) | Digest blind spots incl. `MAX_THREAD_HISTORY = 50` saturation — proposed minimal fix: the last history entry's `eid` in the digest row | Director → Kairo |
| carried (PR-06) | The fence's body escape does not neutralise `&`, so the fence is not injective | Director |
| B-16 / D-10 | `LICENSE` ships with `private: true`; SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line open; a **real tenant deny-list** for PT-22 must live outside the tree (CI secret) — decide at PR-42 | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant | Director |
| B-12 / B-13 | macOS scope; the migration runbook closes when PR-38 merges | Director + Kairo |
| — | T22 bytes-per-hour ceiling and the origin-label organisation marker (PR-42 close-out) | Director |
| B-05, B-07, B-08, B-09 | gentle-ai installer study; Telegram bot-to-bot visibility; Windows IPC/DACL; MCP notification rendering per host — all F0 spikes, still open | Director + Kairo |

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI, gentle-pi 3.1.1, TypeScript 7.0.2
  pinned, SQLite 3.53.0 through `node:sqlite`. Receipt-driven development is **on**
  (`gentle-ai review mode status`: global on, clone-local unset). The writer profile this session was
  `deepseek-flash` / effort `medium` (`PI_MODEL`, `PI_REASONING_LEVEL`), which `assess` graded **`large`**.
- Line endings: this repository forces `eol=lf` through `.gitattributes`; the v1 checkout beside it has
  none. Check with `git ls-files --eol`. A binary fixture needs no `.gitattributes` entry: `text=auto`
  content-inspects, and a file with NUL bytes is left alone.
- **`node:sqlite` measured facts** (PR-10's list, extended by PR-11): `DatabaseSync.isTransaction` flips on
  `BEGIN IMMEDIATE`; a failed *constraint* statement leaves the transaction open, but `SQLITE_FULL` and
  friends roll it back themselves; `ROLLBACK` outside a transaction throws `ERR_SQLITE_ERROR`; a nested
  `BEGIN` is refused by SQLite; `exec()` runs multiple statements; constraint codes are CHECK 275, UNIQUE
  2067, FK 787, NOT NULL 1299, STRICT datatype 3091, `SQLITE_BUSY` 5, `SQLITE_CORRUPT` 11, `SQLITE_CANTOPEN`
  14 (extended `526`), `SQLITE_NOTADB` 26. `DatabaseSync` opens lazily (a prose file opens; the first
  statement throws), `isOpen` exists, `new DatabaseSync(<directory>)` throws `errcode 526`, and
  `PRAGMA user_version` cannot be parameterized.
- Verification worktrees live in `../telegram_bus_agent-worktrees/` and are removed when their run ends;
  **an empty directory is the expected end state**. Make one usable quickly with:
  `git worktree add --detach <path> <sha>` then a **junction** to the main checkout's `node_modules`
  (`powershell -NoProfile -Command "New-Item -ItemType Junction -Path '<wt>/node_modules' -Target '<main>/node_modules'"`).
- `node --test` prints `ℹ tests / ℹ pass / ℹ fail` (ANSI-coloured), not `# tests`.
- GitHub Actions: the workflow lives on `main`, so `pull_request` runs fire on PR open (≈45–50 s per matrix
  entry, Node 24.15 and 26). PR #16's both legs passed.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; `main` is the only remote branch
  that matters. Every `gh` call runs with
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365` (tag `v1.0.2` + 2 commits),
  **read-only**; cite as `path:line`. It carries one pre-existing untracked `alpha_response.json`.
- Arena bridge: `.mcp.json` (gitignored) points at `http://127.0.0.1:8766/mcp` — the Arena Orion Electron
  app, **down** unless the Director launched it. Never quote `.mcp.json` and never commit it.
