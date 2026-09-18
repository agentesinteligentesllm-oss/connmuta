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
has now been proven end to end on PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a, PR-09b, PR-10, PR-11 and
**PR-12** — ten slices, ten records in the tribunal index.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en su rebanada PR-13 (unidad `ledger`: `src/ledger/{audit,unknown-senders,conditions-store,retention}.ts` con sus cuatro gemelos — el log de auditoría sin cuerpo, el upsert de remitentes desconocidos, el store de condiciones y el barrido de retención, ≈350 líneas, PT-20): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + auditoría Judgment Day); la Arena de debate no está disponible, así que nada depende de un debate ni de una acción en la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** at the start of this session except for an untracked `odd/` directory if
a previous session left one (PR-12 deleted its own; see §4). The status command must print
`nextRecommended: apply`, `completed: 70` of `210`, `blockedReasons: []`. Anything else: stop and report.
(`verifyReport: missing` is **expected and correct** while `apply` runs.)

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Merged to `main`: **`#1`–`#17`**, the last being **PR-12** (`#17`, merge `6558bb6`, code/record tip `ced9c8c`). **Next slice: PR-13** — the exact board is the row below, because the "of the 45 rows" counter every earlier record carried does not resolve against `tasks.md`. No row was ever re-numbered, and PR-06, PR-08 and PR-09 were each re-sliced *in place*. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | **45 PR blocks / 42 row ids** in `tasks.md` (`PR-01…PR-42`; PR-06, PR-08 and PR-09 were each re-sliced in place into two blocks). Complete: **17 blocks / 12 row ids** (`PR-01…PR-12`). Remaining: **28 blocks / 30 row ids** (`PR-13…PR-42`). Checkboxes: **70 of 210**. *The "of the 45 rows" counters in earlier records are a carried-forward figure whose arithmetic does not resolve against `tasks.md`; the three lines above are the ones you can verify with `grep`.* | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **70/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Unit 4 `ledger` — three quarters done | `src/ledger/{schema,transaction}.ts` (PR-10, `#15`), `{open,migrations}.ts` (PR-11, `#16`) and `{inbox,threads,cursors}.ts` (PR-12, `#17`). Remaining in the unit: **PR-13** `{audit,unknown-senders,conditions-store,retention}.ts`. | `INDEX.md` `bus-v2-f1-pr-12-audit-001` |
| Code on `main` | `src/shared/*` (16 modules), `src/cli/{main,validate}.ts`, `src/registry/{schema,invariants,loader}.ts`, `src/ledger/{schema,transaction,open,migrations,inbox,threads,cursors}.ts`, all with twins — **427 tests**, `test:static` **8** | PRs `#1`–`#17` |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**`; the scanned set must **equal** `test/fixtures/v1-provenance.json` — **11 entries, unchanged since PR-07b**. The ledger unit vendors nothing, so PR-10, PR-11 and **PR-12** each carry **no** header of that kind — see §4's trap before adding a non-vendored module with no imports. | `test/security/provenance.test.ts` |
| Audit status | **DN-05 is unsatisfied for PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a, PR-09b, PR-10, PR-11 and PR-12** — all ten audited by the **Judgment Day substitute**, one record each in the tribunal index. | [`INDEX.md`](../05-tribunal/INDEX.md) |

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

**2. Audit: Judgment Day**, exactly as PR-10, PR-11 and PR-12 ran it. Two blind read-only judges
(`jd-judge-a`, `jd-judge-b`) in parallel over one immutable frozen tree, graph-v1 shapes only (discovery
returns only `{"rows":[…]}`; a scoped re-judgment returns only `{"resolutions":[…]}`), then a bounded
correction round and **at most two scoped re-judgments — the budget is two, and a round-two survivor
escalates**. `review-risk`/`review-*` agents are **not** dispatchable outside the native review lifecycle.
Record the audit path in the tribunal index the way the ten existing records do, and state plainly that
DN-05 is unsatisfied. The rules learned so far — the first six from PR-06…PR-10, the next six from PR-11,
and PR-12's additions, which are one new rule at the end plus three of the earlier ones widened:

- **Ask before round 1** (the skill requires it). If the Director's standing instruction for the session is
  "do not stop for authorizations", authorize the batch by that delegation and **disclose the batch, its size
  and its cost in the record and in the PR body instead** — which is what PR-11 and PR-12 did. Never let the
  disclosure go missing either way.
- **A single-judge row is *suspect*, never auto-fixable — and never dismissible from authority either.**
  Reproduce it deterministically first. PR-12's `JD-B-001` was a single-judge CRITICAL that reproduced
  exactly; the writer corrected the test's name and pinned the observable half, and recorded its own reading
  of the severity as WARNING rather than silently downgrading it.
- **Re-run the whole sweep after every correction, and fix stale anchors rather than reporting skips.** A
  sweep reported with silent skips is not evidence.
- **The `jd-fix-agent` dispatch is graded and strict.** The `## Exact authorized severe IDs` section must
  list **exactly the BLOCKER/CRITICAL rows**, and the `Frozen ledger SHA-256` is the SHA-256 of the rows JSON
  with object keys sorted alphabetically — computed **from a file** (write the rows, hash the file), never
  through `node -e`. A batch with zero severe rows is applied by the **writer**; PR-12's round 1 had two
  CRITICAL rows and was still applied by the writer, because the batch also corrected WARNINGs and
  SUGGESTIONs and the `jd-fix-agent` shape admits exactly the severe ids.
- **A scoped re-judgment's `regression` resolution carries no substance** — the graph-v1 shape has only
  `id` and `outcome`. `subagent_continue` the *re-judgment* session to obtain the proof; continuing the
  *discovery* sessions instead earns a correct refusal to invent substance.
- **A finding's own reproduction may not survive this repository's hygiene rules.** Adapt, and say so.
- **A correction can install a *new* defect of the same class as the one it fixed, and PR-12 proved it
  twice.** Round 1's own new text carried a count its enumeration contradicted, and round 2's replacement of
  that sentence carried a *second* one — plus an impossibility claim a hoist mutant falsified. Each round's
  re-judgment attacked the replacement harder than the original, exactly as this file warns. **Re-measure the
  replacement text, not only the row you were fixing.**
- **A row can be a *disposition*, not an edit.** Land the artefact **before** the re-judgment runs, or the
  row verifies as unresolved by construction.
- **Recount every severity tally from the frozen ledger file, never from memory.** PR-12's record graded a
  judge's WARNING row as CRITICAL in its own table and grouped two rows as one; the independent verifier
  recounted 2/6/5 from the ledger and found both. It also caught a "three shared defects" count that was
  three *pairings* across five row ids.
- **A prose claim has no executable mutant, so its evidence is a *measurement*** — a compiler matrix, a
  printed config, a probe. Say which, and reproduce it yourself before believing either judge.
- **A message inside the audited range is frozen.** When a figure or claim in it turns out wrong, say so
  explicitly in the record ("superseded here rather than rewritten, because rewriting it would rewrite the
  audited range") instead of amending it.
- **Expect split verdicts, and expect agreement to be substantive only when each judge re-derived it.**
  PR-12's round 2 returned the same verdict from both judges on identical facts, and the record says that
  Judge A re-derived the residual itself rather than adopting Judge B's characterisation — which is what made
  the agreement worth recording.
- **The four survivors of a mutant sweep are the most attackable prose in the record.** PR-12's broad claim
  that a write's *placement* inside a transaction is unobservable was falsified by the verifier's own hoist
  mutant, while the narrow claim survived. State the measured set, never the generalisation.

**3. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only
those; an over-claimed cell is a defect. **PR-13's block names PT-20 in its 13.6 docs task**, so it updates
that one cell in `docs/02-architecture/THREAT-MODEL.md` §4 and nothing else, and names only what the tests
really pin. Read `tasks.md`'s PR-13 block and **B-26** (PT-25's owner disagreement) before touching any cell.

**4. Budget policy.** 400 lines of *authored* src+test, measured as `git diff --numstat -- src test`, with
disclosed PR-scoped exceptions otherwise. Ten precedents: PR-06b 26, PR-07a 20, PR-07b 154, PR-08a 348,
PR-08b 272, PR-09a 866, PR-09b 375, PR-10 957, PR-11 876, **PR-12 1,664**. Five lessons:

- **Measure after every correction, in the same pass as the edit, and again at the tip that ships.** PR-12's
  figure moved 1,845 → 2,064 across its rounds, and its record's own "3 added / 3 removed" churn figure was
  invented and was corrected by the verifier.
- **Never write a computed figure as if it were measured**, and never leave a superseded figure unlabelled.
  PR-12's `tasks.md` apply-time note and its budget table each carried a tip label that had gone stale.
- **Estimate from the file sizes the design names.** PR-13's block says ≈350 for four modules and four twins.
- **Disclose growth past an authorized batch** rather than absorbing it.
- **A re-slice is a measurement, not a preference.** PR-12 measured both halves and rejected the split
  because neither would have come in under budget; that measurement is why it is one exception and not two.

**5. The ordinary native review is a separate, independent lifecycle (RDD switch: on).** After authorized
implementation is complete and normalized, and **before** reporting it complete, call `gentle_review` with
`{"operation":"inspect"}` and follow only the transition it returns. **Nine observations are now
precedented:**

- **granted and approved** (PR-07b, PR-08a, PR-09b, **PR-12**): inspect → START → closure `approved` →
  execute the **exact** `acknowledge-approved` continuation (its envelope reports `authority: burned`) →
  advisory findings become a backlog row and are **not** actioned.
- **declined** (PR-08b, PR-09a, PR-10, PR-11): `declined_this_candidate`, `lineage_created: false`, no
  mutation, and the same candidate is **never re-reviewed**. Run the RDD fallback: `assess` with the decline
  stated returns the plan.
- **declined *by the host*** (PR-11): START returned `consent-declined-this-candidate` directly. That is a
  host resolution, not yours: **never invent consent, never call `answer-consent` for a decision you did not
  receive.**
- **consent resolved by the host on approval** (**PR-12**): the START returned `state: reviewing` with no
  typed envelope ever reaching the session. Record it as a host resolution, and do not call
  `answer-consent` — a grant you did not receive is not yours to answer.
- **`assess` can return `risk: "unassessable"`** (PR-11 and PR-12: the native command answered with empty
  output, or a schema-incompatible response). By its own rule that is treated as **high risk**. When the
  review **closed**, the plan still says `independentVerifier: false` (the closed review is the independent
  check); **run one anyway** — see the next bullet.
- **A stale consent binding** is recoverable: START returns `consent-binding-stale` with
  `lineage_created: false` and the instruction to run START again for a fresh envelope.
- **START argument shapes are graded, and every failure happens before authority access.** PR-12 needed six
  attempts and its record lists all four failures by name. The shape that finally reached native START
  carried **every** field the offered `execute` binding named, in **camelCase**, plus the retained
  `lineageId`: `{"mode":"ordinary","baseRef":…,"committedOnly":true,"untrackedScope":"exclude","expectedUntrackedInventory":…}`.
  `{"mode":"ordinary"}` alone earns a native `identity-mismatch`; adding only `baseRef`/`committedOnly`
  earns `candidate-target-projection-drift`; the offered flags in kebab-case earn `unknown-field: cwd`; and
  the same object without `mode` earns the facade's own "graph-v1 START requires lineageId". Nothing is
  burned by any of them, so **try shapes rather than concluding the review is unavailable**.
- **`inspect` is blocked on the intended-untracked selection** whenever an untracked `odd/` tree exists; one
  `inspect` call with `untrackedScope: "exclude"` resolves it. The ODD tree is never a reviewable artefact.
- **A decline is not a closure** and approval authorizes **no** delivery: commit, push, PR and merge stay
  under ordinary repository policy and the Director's word.

**6. Run the audit and the review against frozen worktrees, not the live one.** `git worktree add --detach
../telegram_bus_agent-worktrees/<name> <sha>`, pass `workspaceRoot` to the review, hand the judges the
**committed** tree, and remove the worktrees when the run ends. The fast way to get a working tree there is a
**junction to the main checkout's `node_modules`** (see §8); `git reset --hard` is blocked by this
workspace's safety policy, so restore a scratch worktree with `git rm --cached` + `git checkout <base> --
<paths>` + explicit `rm -f`. **The mutant sweep must run on a worktree frozen at the tip**, and the script
must restore every mutated file byte-identically and verify it with `sha256` — PR-12's did both, and its
verifier re-ran the whole sweep to confirm.

**7. The dynamic-namespace gateway is not an approved evidence route**, and the four F0 spikes (B-05,
B-07, B-08, B-09) stay open.

**8. Remote delivery is authorized for this project** (Director, session 14, on top of DN-07/DN-08): push the
branch, open the PR, wait for the CI matrix, merge on the Director's word. The machine-global
`~/.pi/agent/AGENTS.md` rule "NO REMOTE, EVER" is about the unrelated `consultores-orion` account; this
checkout's `origin` is `agentesinteligentesllm-oss/connmuta` through the isolated local credential helper, and
this project's seventeen PRs exist by exactly this route.

**9. The independent verifier is run even when the plan does not require it.** PR-09a's, PR-10's, PR-11's and
now PR-12's independent verifiers each found defects that nothing else caught, and **all four sets were
exclusively record defects** — PR-12's eight were a stale churn figure, a severity label contradicting the
frozen ledger, stale "tip that ships" labels, an over-broad survivor rationale, a wrong citation, a
mis-counted shared-defect tally, and a stale figure in a gate document. Run it over the frozen range and
hand it a mandate to **reproduce** the figures, not to read them.

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
`apply-progress.md`. **PR-10, PR-11 and PR-12 vendored nothing** — their eight modules are new code — so the
fixture stays at 11 entries and a header of that kind on a new file is a defect. PR-11 added one new fixture,
`test/fixtures/ledger-corrupt.db`: **text on purpose** (a ledger file whose bytes are not a SQLite database),
so the corruption is reviewable rather than an opaque binary blob. The *second* corruption class — damage
SQLite reports as a `quick_check` row instead of throwing — is produced in the test by flipping the header's
first reserved byte, so no binary blob is needed for it either. PR-12 added no fixture.

A second pinned value exists in the tree, and it is the *design's* text rather than v1's:
`src/ledger/schema.ts`'s `LEDGER_SCHEMA_DDL` is design §5.2's `sql` block **verbatim** —
`sha256 9e9bb65545df29ce5871bea095a6d5457a8865a1a739abda9feb62058915b506`, 74 lines / 4,123 bytes. PR-11
applies that string through migration 1 and **does not edit it** (a schema change is a migration, not an edit
to version 1); `test/ledger/migrations.test.ts` pins "migration 1 is that text" by comparing the schema
objects against the DDL applied directly to a second connection. **PR-12 writes against that schema and does
not touch it** either.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **The `TS18003` rule this repository believed is false, and three places still state it.** Measured with TypeScript 7.0.2: an **unused** project reference builds clean (`exit 0`); `TS18003` is what a project whose `include` matches nothing reports when it has **no `references` entry at all**, and any entry — even `"references": []` — suppresses it, exactly as `files: []` does; composite-ness neither causes nor prevents it. `src/ledger/tsconfig.json` carries the measured version; `src/cli/tsconfig.json:10` and `src/registry/tsconfig.json:12` still state it falsely. | **B-34**; PR-11's Judgment Day hit it three times | `src/ledger/tsconfig.json` |
| **`PRAGMA quick_check` does not verify index content.** A ledger whose index no longer matches its table answers `ok` while `integrity_check` reports a missing index row (measured). The open sequence decides whether the file is *usable*, not whether it is *consistent*. | PR-11's `JD-A-004`, stated as a boundary in `open.ts` |  |
| **Two of PR-11's three PRAGMA assertions cannot discriminate their own statement.** `synchronous` already reads `2` and `foreign_keys` already `1`; `journal_mode` is the discriminating one (`delete` by default). | Stated in `src/ledger/open.ts` and in its test's comment |  |
| **`M8` (the `POSIX_PRIVATE_DIR_MODE` mutant) survives on this machine** because the mode assertion is skipped on Windows and the CI matrix is `windows-latest` only. | **B-24** | `.github/workflows/ci.yml` |
| **`provenance.test.ts` reads a *leading* `/**` block as a vendor header** | If a file begins with `/**` and that block contains the header's own first token (a capitalised `Provenance` followed by a colon), the gate demands a complete, parseable header and otherwise fails with `malformed Provenance header(s)`. A non-vendored module **with no imports** has its doc comment as that block, so it must not spell the token. `src/ledger/schema.ts` hit this in PR-10. **PR-12's three modules all begin with imports, so none of them can be read that way.** | **B-33** |
| **`git ls-files`-based scanners only see tracked or staged files** | `repo-scan.test.ts` and `provenance.test.ts` run over `git ls-files`, so a new file is invisible to them until `git add`/`git add -N`. Its failure mode is a *late* static failure, after the focused suite has already gone green. | PR-09b, PR-10, PR-11, PR-12 |
| **PT-22's token shape needs a colon plus 35 token characters after 8–10 digits** | `test/security/repo-scan.test.ts` skips files containing a NUL byte, and a long digit run is safe when no colon follows it — which is why synthetic chat/user/bot ids are safe. | `test/security/repo-scan.test.ts` |
| **`PRAGMA user_version` cannot be parameterized** and a write to it inside a transaction **is** rolled back with it (both measured). | The stamp is interpolated, and the path's contiguity check is what makes that safe | `src/ledger/migrations.ts` |
| **`node:sqlite`'s `errcode` is not always the primary code**: an extended code shares the primary code's low byte (`526 & 0xFF === 14` = `SQLITE_CANTOPEN`). Compare the class, not two integers. | `isLedgerCorruptionError`, exported so the rule is pinnable with synthetic codes | `src/ledger/open.ts` |
| **A clean `close()` removes the `-wal`/`-shm` siblings** (and the close, not the open, is what removes them). | `quarantineLedgerFile`, exported for exactly that reason | `src/ledger/open.ts` |
| **`node:sqlite` rows are null-prototype objects** | `assert.deepEqual` (strict) distinguishes prototypes, so a row read straight out of the database never deep-equals an object literal. Read the fields out, or map. PR-12's suites hit this once each. | `test/ledger/*.test.ts` |
| **Within one transaction, where a write sits is not observable through a test — but hoisting it out of the batch is.** A batch that throws rolls back wherever inside the transaction the write sat, and a write placed *after* the transaction never runs on such a batch, so both survive the suite; a write hoisted *before* the batch autocommits ahead of the callback's work and two tests die on it. State the measured set, never the generalisation. | PR-12's `M2`/`M16`/`M19` survivors, and the verifier's falsified broad claim | `apply-progress.md` §PR-12 |
| **The native review's START shape is not obvious and four of PR-12's six attempts failed before authority** | The one that worked carried every field the offered `execute` binding named, in camelCase, plus `lineageId`. See §2.5; every failure is pre-authority, so trying shapes costs nothing. | `apply-progress.md` §PR-12 |
| **Bash executes backticks inside double-quoted strings, and `cat << 'EOF'` heredocs truncate on long Markdown** | Write such patches to a file with the editor and append them with a `node` script; for long commit messages use `git commit -F <file>` and check the message's tail afterwards. **This bit again at PR-12's close**: a `node -e "…"` whose content had backticks had them executed as commands, and a `cat << 'PROGRESS_EOF'` heredoc truncated at 3,670 lines mid-word. Always the editor plus a `node` splice for Markdown. | sessions 13–15 |
| **`git reset --hard` is blocked by this workspace's safety policy** | Use `git rm --cached` + `git checkout <base> -- <paths>` + explicit `rm -f` to restore a scratch worktree. | sessions 14–15 |
| **`dist/` staleness fakes results, and `tsc -b` is incremental** | Always `rm -rf dist` before believing a surprising run; restore mutants byte-for-byte and verify with `sha256`. | sessions 11–15 |
| **`state.yaml` is YAML, and a plain scalar cannot hold `": "`** | Validate it with PyYAML after editing (`python -c "import yaml…"`); `gentle-ai sdd-status` also reads it. | `bus-v2-f1-b19-repin-001` |
| **`node --test` output is ANSI-coloured, and its failing lines use `✖ <name> (dur)`, not TAP `not ok`** | Strip escape codes and match `✖` when you need *which* test died, not just how many. | sessions 9–15 |
| **`gh pr merge N --merge --delete-branch`** | Works; the local branch is not always switched or deleted, so finish with `git checkout main && git pull --ff-only && git branch -d <branch>`. Every `gh` call needs `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**. | PRs #13–#17 |
| **The ODD feature doc stays out of the repository** | Each slice's `odd/tasks/<feature>.md` is created (ODD requires it) and **deleted at close**; AGENTS.md §2 does not list an ODD tree. Fold the substance into `apply-progress.md` + Engram. PR-12 also kept its judge prompts, its frozen ledger and its mutant script in `odd/`, all untracked and all deleted at close. | Engram `odd/*/tasks` |
| **`roster_hash` may be a legacy `sha256:` value** | Nothing at load time ties it to its snapshot (**B-29**); the loader only shape-checks it. | `src/registry/schema.ts` |

---

## §5 — Next session, exact sequence

1. **§0**: confirm `main` is clean and current, `rm -rf dist`, read the SDD status. Then read
   [`../../AGENTS.md`](../../AGENTS.md) §1–§2, this file's §2, `tasks.md`'s **PR-13 block** (and the
   `Unit 4 — ledger` heading), design **§5.4** (retention), **§5.2** (the DDL, as *input*), §5.1 (the open
   sequence's audience for the condition store), §6 (redaction, which the audit writer consumes) and §15's
   **Ledger** layer, and the `ledger` spec's three requirements PR-13 answers.
2. **Create the ODD feature doc** (`odd/tasks/pr-13-ledger-audit-retention.md`, untracked, deleted at
   close), its Engram mirror (`odd/pr-13-ledger-audit-retention/tasks`) and the visible `todo` list,
   **before** the first write. State the plan in one line and proceed; do not ask the Director to choose a
   workflow and do not wait on the TUI.
3. **Branch** `f1/13-ledger-audit-retention` from `main`. Then follow the block exactly:
   - **13.1 RED**: `test/ledger/audit.test.ts` — "rejected update leaves a bodiless row", plus "no row ever
     matches the token regex through every write path" (drive a fixture token through `audit`,
     `unknown-senders` and `conditions-store` and prove it is absent). Real `node:sqlite` over a `mkdtemp`
     temp file opened through `ledger/open.ts`.
   - **13.2 GREEN**: `src/ledger/audit.ts`, `src/ledger/unknown-senders.ts` (bodiless upsert on
     `unknown_sender`: `first_seen_at` first-wins, `last_seen_at` and `count` advance),
     `src/ledger/conditions-store.ts` (`(scope, name)` upsert; `detail` carries codes and ids only — never
     error text, DATA-MODEL §3.0).
   - **13.3 RED**: `test/ledger/retention.test.ts` — "`thread_history` is capped, not truncated on read" and
     "the hourly sweep removes rows past each window and keeps everything younger", for
     `INBOX_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `UNKNOWN_SENDER_RETENTION_DAYS` and
     `CLIENT_SESSION_STALE_HOURS`, **plus open threads never pruned** (that one is a negative: the sweep must
     leave every `status = 'open'` row alone at any age).
   - **13.4 GREEN**: `src/ledger/retention.ts` — `RETENTION_SWEEP_INTERVAL_HOURS` schedule, one indexed
     `DELETE` per table, provenance unrelated, no file deletion.
   - **13.5 Verify**: `npm run build && node --test "dist/test/ledger/audit.test.js" "dist/test/ledger/unknown-senders.test.js" "dist/test/ledger/conditions-store.test.js" "dist/test/ledger/retention.test.js"`.
   - **13.6 Docs**: update the file-name cell of **PT-20** in `docs/02-architecture/THREAT-MODEL.md` §4 with
     the test files this PR adds — and only the half it really pins (B-26).
   - **Carry the unit's existing boundaries**: `audit_log` and `unknown_senders` have **no body column at
     all**, so PT-20's "no body of a rejected or foreign message" is already a schema property — say what the
     new code adds on top of that rather than claiming the schema's work. And `inbox.ts` already writes
     `audit_log` rows for a poll batch, so PR-13's `audit.ts` must be the **shared** writer those rows and
     the send path both use, not a second one that drifts.
4. **Verify** from a frozen worktree (never the working tree): the full suite and `test:static`, plus a
   mutant sweep on a cleaned `dist/`. At least: drop the `scope` from the conditions upsert, let the
   unknown-sender upsert reset `first_seen_at`, make the retention sweep prune open threads, and make one
   window delete rows younger than itself. **Report every survivor with its reason**, and state the pieces a
   mutant cannot reach.
5. **Measure the real diff** (`git diff --numstat -- src test`), read every new file in full, and take the
   PR-13-scoped exception if it lands over (the block says ≈350, no exception). The Director's standing
   "do not stop for authorizations" applies if it is given again; otherwise ask one question and disclose.
6. **Commit** as work units (code + its twin together), then the docs/bookkeeping commit.
7. **Audit** (§2.2) over the frozen committed range, then **the ordinary native review** (§2.5) and, if it
   declines, the RDD fallback — **and run an independent verifier either way** (§2.9). Correct every finding
   **before** the commit that claims it is corrected. Then push, open the PR, wait for the CI matrix, and
   merge.
8. **Close**: rewrite this file (for **PR-14**, the secret store), prepend to [`LOG.md`](./LOG.md), add the
   audit-path record to [`INDEX.md`](../05-tribunal/INDEX.md), sweep every status line in `AGENTS.md`,
   `README.md`, `docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml` (**parse the YAML after
   editing**), add any backlog row the audits recommended, delete the ODD tree, run `mem_session_summary`,
   commit the docs on `main`, and push.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits so far: the PR-01, PR-06, PR-08 and PR-09
  re-slice notes, the PR-07a block, the PR-07b carried-findings note (+ D4 amendment), the **appended**
  `EXIT_VALIDATION_FAILED` row in design §11, the PR-10 apply-time note, the PR-11 apply-time note, and the
  **PR-12 apply-time note** (with its sub-task-order disclosure, its two-tip size figures and its PT cells).
  Do not rewrite a gate's text; append a note. **Rows PR-09, PR-10, PR-11 and PR-12 are closed** (12.1–12.6
  all `[x]`; there is no 12.7).
- Provenance hash rule, registry and range convention are ratified — §3. `constants.ts:3` is settled
  (B-19, `done`); do not re-open or re-report it.
- **Doc-hygiene rule** (ratified `bus-v2-f1-pr-03-001`): never quote a matched-and-rejected secret-shaped
  literal in `apply-progress.md`; describe the shape.
- **PR-01…PR-12 are merged; do not re-slice, re-audit or re-open them.** PR-08b's, PR-09a's, PR-10's and
  PR-11's native reviews were **declined** and are never re-run; PR-07b's, PR-08a's, PR-09b's and **PR-12's**
  were **approved** with advisory findings (B-21, B-22, B-32, **B-36**) that are recorded, not actioned.
  PR-12's Judgment Day ran **both** its rounds and closed `APPROVED`; its surviving SUGGESTION-class row
  `JD-B-008` and its two residuals are escalated and recorded, and **no third round exists**.
- **The registry unit is closed** (`schema`, `invariants`, `loader`), and the ledger's `schema.ts` is design
  §5.2's text: **a schema change is a migration, never an edit to version 1**. PR-11's `open.ts` and
  `migrations.ts`, and PR-12's `inbox.ts`, `threads.ts` and `cursors.ts`, are frozen the same way: a defect in
  them is its own slice with its own audit, not a drive-by edit. **PR-12's mutants are the ones to re-run,
  not to "fix"**: `M2`, `M8`, `M16` and `M19` survive for stated reasons, and narrowing that statement
  further is *not* a licence to change the code.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a
  decision: both are disclosed deviations.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake imports
  it, never redefines it.
- TypeScript 7.0.2 needs `"types": ["node"]`. **The TS18003 claim this file used to make was false** (§4).
  `src/{client,daemon}` join the root references in PR-32 and PR-15.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job; that is by design.
  `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by path.
- Type-only modules satisfy Strict TDD's triangulation gate via the explicit type-only exception; a missing
  module (`TS2307`, or `TS2305` over a module that exists and exports nothing) is a legitimate RED.
- **Stale comments, stale figures and stale records**: after a correction edits a file, every figure about
  that file is suspect — grep the whole record for the old number, and for the new one, before committing.
  PR-12's independent verifier found seven defects this way, every one of them in the record's own prose.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-22 | The four advisory findings of PR-08a's ordinary native review, recorded not actioned | Director |
| B-23 | `JD-A-003`: the deliberate precedence of `unsupported_schema_version` over the content walk is documented but unpinned (ADR-12) | Kairo → Alpha |
| B-24 | **No POSIX CI leg**, so packaging/execution contracts cannot fail here (PR-11's `M8` survivor) | Kairo → Alpha |
| B-25 | Three cheap gates for one later audited PR: a YAML validity check over `git ls-files '*.y*ml'`; a `clean` step before `npm test`; bumping `actions/*` off Node 20 | Kairo → Alpha |
| B-26 | **PT-25's owner is attributed differently by two gated documents.** PR-11 kept its cells untouched and PR-12 kept PT-10/PT-11 to themselves; **PR-13 (13.6) fills PT-20 and must not inherit the confusion** | Director → Kairo |
| B-27 | **The shared token regex matches this project's own `sha256:` roster hash**, so R5 would refuse every valid registry | Director → Kairo |
| B-28 | **No R1–R6 row demands referential integrity**, so a dangling reference loads. An F2 `doctor` check owns it | Kairo → Alpha |
| B-29 | **Nothing at load time ties `roster_hash` to its snapshot** (two independent judges) | Director → Kairo |
| B-30 | **R5's strictness refuses free-form human text** | Director → Kairo |
| B-31 | **A JSON-escaped colon (`\u003a`) bypasses the raw-text scan** | Director → Kairo |
| B-32 | The four advisory findings of PR-09b's approved native review, recorded not actioned | Director |
| B-33 | **`test/security/provenance.test.ts` treats a file's leading `/**` block as a vendor header** | Kairo → Alpha |
| B-34 | **The `TS18003` rule is stated falsely in `src/cli/tsconfig.json:10` and `src/registry/tsconfig.json:12`.** The measured rule is in `src/ledger/tsconfig.json`. Wording only | Kairo → Alpha |
| **B-35** | **PT-10's assertion cell and the evidence cell PR-12 wrote read as a contradiction**: the offset is `max(update_id) + 1` over every entry a batch covered, and a dropped entry persists no `updates` row, so "never exceeds the last persisted `update_id`" needs the reading the evidence cell now states. Wording only, in a gated row | Director |
| **B-36** | **The three advisory findings of PR-12's approved native review**, recorded not actioned: `R3-replay-audit-idempotency` (WARNING, `test/ledger/inbox.test.ts:144-164`), `R3-catchup-project-scope` (SUGGESTION, `test/ledger/cursors.test.ts:129-139`) and `R3-ensure-instant-order` (SUGGESTION, `src/ledger/cursors.ts:147`). The closure carries their ids, lens, locations and severities and not their statement text | Director |
| **PR-12 escalated** | **`JD-B-008` survived round 2's scoped re-judgment from both judges** — a record-accuracy defect round 1's own correction installed, then re-installed in round 2's replacement of the sentence, plus an impossibility claim a hoist mutant falsified. The corrections are applied and measurement-checked, **not judge-re-judged**, because the round budget is two. Nothing blocks PR-13 | Director |
| PR-11 escalated | Two SUGGESTION-class rows survived PR-11's second round on split verdicts; corrections applied and measurement-checked, not re-judged. Nothing blocks PR-13 | Director |
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
  `deepseek-flash` / effort `high` (`PI_MODEL`, `PI_REASONING_LEVEL`), which `assess` graded **`large`**.
- Line endings: this repository forces `eol=lf` through `.gitattributes`; the v1 checkout beside it has
  none. Check with `git ls-files --eol`. A binary fixture needs no `.gitattributes` entry: `text=auto`
  content-inspects, and a file with NUL bytes is left alone.
- **`node:sqlite` measured facts** (PR-10's list, extended by PR-11 and PR-12): `DatabaseSync.isTransaction`
  flips on `BEGIN IMMEDIATE`; a failed *constraint* statement leaves the transaction open, but `SQLITE_FULL`
  and friends roll it back themselves; `ROLLBACK` outside a transaction throws `ERR_SQLITE_ERROR`; a nested
  `BEGIN` is refused by SQLite; `exec()` runs multiple statements; constraint codes are CHECK 275, UNIQUE
  2067, FK 787, NOT NULL 1299, STRICT datatype 3091, `SQLITE_BUSY` 5, `SQLITE_CORRUPT` 11, `SQLITE_CANTOPEN`
  14 (extended `526`), `SQLITE_NOTADB` 26. `DatabaseSync` opens lazily, `isOpen` exists, `new
  DatabaseSync(<directory>)` throws `errcode 526`, and `PRAGMA user_version` cannot be parameterized.
  Rows come back as **null-prototype** objects (§4). `EXPLAIN QUERY PLAN` shows the planner using
  `sqlite_autoindex_updates_2` for a `project_id` filter — the `UNIQUE (project_id, eid)` index — so a
  `project_id` lookup is not a scan even without a hand-written index.
- Verification worktrees live in `../telegram_bus_agent-worktrees/` and are removed when their run ends;
  **an empty directory is the expected end state** (PR-12 left five: `pr-12`, `judgment-12`, `pr-12-fix`,
  `judgment-12-fix`, `pr-12-verify`). Make one usable quickly with:
  `git worktree add --detach <path> <sha>` then a **junction** to the main checkout's `node_modules`
  (`powershell -NoProfile -Command "New-Item -ItemType Junction -Path '<wt>/node_modules' -Target '<main>/node_modules'"`).
- `node --test` prints `ℹ tests / ℹ pass / ℹ fail` (ANSI-coloured) and names failures with `✖`, not TAP's
  `not ok`.
- GitHub Actions: the workflow lives on `main`, so `pull_request` runs fire on PR open (≈50 s per matrix
  entry, Node 24.15 and 26). PR #17's both legs passed.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; `main` is the only remote branch
  that matters. Every `gh` call runs with
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365` (tag `v1.0.2` + 2 commits),
  **read-only**; cite as `path:line`. It carries one pre-existing untracked `alpha_response.json`. The
  shared-cursor statement PR-12 replaces is `docs/CHANNEL-setup.md:114-120`; the two field names are in
  `src/state.ts:67` and `:116`.
- Arena bridge: `.mcp.json` (gitignored) points at `http://127.0.0.1:8766/mcp` — the Arena Orion Electron
  app, **down** unless the Director launched it. Never quote `.mcp.json` and never commit it.
