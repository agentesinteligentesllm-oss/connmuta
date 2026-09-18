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
has now been proven end to end on PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a, PR-09b, PR-10, PR-11,
PR-12 and **PR-13** — eleven slices, eleven records in the tribunal index.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en su rebanada PR-14 (unidad `secret-store`: `src/secret-store/{types,keyring,file-fallback,redaction,index}.ts` con sus cinco gemelos — la interfaz `SecretStore`, el keyring del SO, el archivo de respaldo con ACL, el redactor compartido y la sonda de selección, ≈380 líneas, PT-08 + PT-09 + PT-19): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + auditoría Judgment Day); la Arena de debate no está disponible, así que nada depende de un debate ni de una acción en la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** at the start of this session except for an untracked `odd/` directory if
a previous session left one (PR-13 deleted its own; see §4). The status command must print
`nextRecommended: apply`, `completed: 76` of `210`, `blockedReasons: []`. Anything else: stop and report.
(`verifyReport: missing` is **expected and correct** while `apply` runs.)

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Merged to `main`: **`#1`–`#18`**, the last being **PR-13** (`#18`, merge `6e71bca`, code/record tip `1e8c24c`). **Next slice: PR-14** — the exact board is the row below, because the "of the 45 rows" counter every earlier record carried does not resolve against `tasks.md`. No row was ever re-numbered, and PR-06, PR-08 and PR-09 were each re-sliced *in place*. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | **45 PR blocks / 42 row ids** in `tasks.md` (`PR-01…PR-42`; PR-06, PR-08 and PR-09 were each re-sliced in place into two blocks). Complete: **18 blocks / 13 row ids** (`PR-01…PR-13`). Remaining: **27 blocks / 29 row ids** (`PR-14…PR-42`). Checkboxes: **76 of 210**. *The "of the 45 rows" counters in earlier records are a carried-forward figure whose arithmetic does not resolve against `tasks.md`; the three lines above are the ones you can verify with `grep`.* | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **76/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Unit 4 `ledger` — **closed** | `src/ledger/{schema,transaction}.ts` (PR-10, `#15`), `{open,migrations}.ts` (PR-11, `#16`), `{inbox,threads,cursors}.ts` (PR-12, `#17`) and `{audit,unknown-senders,conditions-store,retention}.ts` (PR-13, `#18`). Unit 5 `secret-store` opens next. | `INDEX.md` `bus-v2-f1-pr-13-audit-001` |
| Code on `main` | `src/shared/*` (16 modules), `src/cli/{main,validate}.ts`, `src/registry/{schema,invariants,loader}.ts`, `src/ledger/{schema,transaction,open,migrations,inbox,threads,cursors,audit,unknown-senders,conditions-store,retention}.ts`, all with twins — **465 tests**, `test:static` **8** | PRs `#1`–`#18` |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**`; the scanned set must **equal** `test/fixtures/v1-provenance.json` — **11 entries, unchanged since PR-07b**. The ledger unit vendored nothing, so PR-10…**PR-13** each carry **no** header of that kind — see §4's trap before adding a non-vendored module with no imports. **PR-14 will vendor nothing either** (nothing in `src/secret-store/` has a v1 source), so the fixture stays at eleven. | `test/security/provenance.test.ts` |
| Audit status | **DN-05 is unsatisfied for PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a, PR-09b, PR-10, PR-11, PR-12 and PR-13** — all eleven audited by the **Judgment Day substitute**, one record each in the tribunal index. | [`INDEX.md`](../05-tribunal/INDEX.md) |

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

**2. Audit: Judgment Day**, exactly as PR-10, PR-11, PR-12 and PR-13 ran it. Two blind read-only judges
(`jd-judge-a`, `jd-judge-b`) in parallel over one immutable frozen tree, graph-v1 shapes only (discovery
returns only `{"rows":[…]}`; a scoped re-judgment returns only `{"resolutions":[…]}`), then a bounded
correction round and **at most two scoped re-judgments — the budget is two, and a round-two survivor
escalates**. `review-risk`/`review-*` agents are **not** dispatchable outside the native review lifecycle.
Record the audit path in the tribunal index the way the eleven existing records do, and state plainly that
DN-05 is unsatisfied. The rules learned so far — six from PR-06…PR-10, six from PR-11, PR-12's additions,
and PR-13's, which are the sharpest yet:

- **Ask before round 1** (the skill requires it). If the Director's standing instruction for the session is
  "do not stop for authorizations", authorize the batch by that delegation and **disclose the batch, its size
  and its cost in the record and in the PR body instead** — which is what PR-11, PR-12 and PR-13 did. Never
  let the disclosure go missing either way.
- **A single-judge row is *suspect*, never auto-fixable — and never dismissible from authority either.**
  Reproduce it deterministically first. PR-13's `JD-A-001` was a single-judge CRITICAL, reproduced by the
  writer, and it turned out to be two things at once: a **record defect** (a false compensation claim in a
  gated cell and a module doc) and a **pre-existing plan gap** (the receive-side scan it named does not
  exist anywhere in F1). The record half was corrected; the code half was filed as B-38 rather than fixed
  with a guard that would have wedged the poller. Read a severe row for *both* halves before deciding.
- **A disposition is not landed until it is in the commit the re-judgment reads.** PR-13's worst moment:
  round 1 corrected `apply-progress.md`, `tasks.md` and two docs, and committed only `src`, `test` and
  `docs` — so `git diff --name-status <reviewed>..<fixed>` contained **no `openspec/**`**, and both
  re-judges returned `JD-A-001` as `regression` because the fix delta could not contain the disposition.
  A record correction and its commit belong in the same pass, and the fix delta is the only thing the
  re-judgment can see.
- **Re-run the whole sweep after every correction, and fix stale anchors rather than reporting skips.** A
  sweep reported with silent skips is not evidence.
- **The mutant harness must take explicit `[from, to]` pairs.** PR-13's first sweep passed flat
  two-element arrays and destructured each *string* character by character, so every mutant replaced one
  character with another and the whole run measured nothing; it was caught only because one mutant's
  diagnostic printed a one-character anchor where forty characters belonged. Validate the harness before
  believing it, and keep a `sha256` restore check (PR-13's reported no mismatch at any tip).
- **A correction very often installs a new defect of the same class as the one it fixed — three times in
  PR-13.** Round 1's count sentence contradicted its own enumeration ("35 new tests" over numbers summing
  to 38); round 2's replacement said "four new cases" where round 1 added three and claimed a line count it
  had moved; round 4 fixed a comment in `src/ledger/retention.ts` and thereby moved the *shipped bytes* and
  the recorded budget. **Re-measure the replacement text, not only the row you were fixing**, and expect
  each round's re-judgment to attack the replacement harder than the original.
- **A count is the most dangerous kind of figure**, because it looks checkable and is rarely checked against
  its own parts. Every tally in the record: recount it from the file or the command, never from memory, and
  make an enumeration sum to its own total. PR-12's verifier and PR-13's two judges each caught exactly this
  class.
- **A scoped re-judgment's `regression` resolution carries no substance** — the graph-v1 shape has only
  `id` and `outcome`. `subagent_continue` the *re-judgment* session to obtain the proof; continuing the
  *discovery* sessions instead earns a correct refusal to invent substance. Do this for every non-`verified`
  row, from **both** judges, before deciding anything.
- **Expect split verdicts, and expect agreement to be substantive only when each judge re-derived it.**
  PR-13's two re-judgments returned *identical* resolution sets from both judges three times running; the
  agreement is worth recording because each judge supplied its own commands and its own reproduction.
- **A finding's own reproduction may not survive this repository's hygiene rules.** Adapt, and say so.
- **A row can be a *disposition*, not an edit.** Land the artefact **before** the re-judgment runs, or the
  row verifies as unresolved by construction (PR-13's `JD-A-001` again — the rule and the cost are both in
  this list twice because the same thing happened twice).
- **A message inside the audited range is frozen.** When a figure or claim in it turns out wrong, correct it
  *in place and name the superseded value* — that is what PR-11, PR-12 and PR-13 did, and the re-judgment
  reads the diff as the disclosure. Do **not** silently rewrite, and do not leave the old value standing
  without saying it is superseded.
- **The four survivors of a mutant sweep are the most attackable prose in the record.** State the measured
  set, never the generalisation.
- **Round 4 exists and is legal when a finding is real.** PR-13 landed four corrections: round 1's batch,
  round 2's bounded fix, round 3's post-budget correction of figures round 2 itself had got wrong, and round
  4's correction of two prose defects the independent verifier found (one in shipped source). Rounds 3 and 4
  are **outside** the budget and are disclosed as *measurement-checked, not judge-re-judged*; a non-severe
  row never blocks, but a real defect in shipped prose or source should not be left standing because the
  budget is spent. Say which round you are in, and never present a post-budget correction as re-judged.

**3. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only
those; an over-claimed cell is a defect. **PR-14's block names PT-08, PT-09 and PT-19 in its 14.6 docs
task**, so it updates those three cells in `docs/02-architecture/THREAT-MODEL.md` §4 and nothing else, and
names only what the tests really pin. Read `tasks.md`'s PR-14 block and **B-26** (PT-25's owner disagreement)
before touching any cell. PR-13's precedent: it filled PT-20 and *stated what it did not claim* (the batch's
audit writes are PT-10's, the peer-body gap is B-38's), which is what kept B-26 from being inherited.

**4. Budget policy.** 400 lines of *authored* src+test, measured as `git diff --numstat -- src test`, with
disclosed PR-scoped exceptions otherwise. Eleven precedents: PR-06b 26, PR-07a 20, PR-07b 154, PR-08a 348,
PR-08b 272, PR-09a 866, PR-09b 375, PR-10 957, PR-11 876, PR-12 1,664, **PR-13 1,868**. Six lessons:

- **Measure after every correction, in the same pass as the edit, and again at the tip that ships.**
  PR-13's figure moved 2,046 → 2,256 → 2,263 → 2,268 across four tips, and one intermediate note claimed the
  figure had not moved because the fix "touched a comment" — a comment line in a tracked `.ts` file is
  counted, and both judges caught it.
- **Always label a figure with the tip it belongs to.** PR-13's budget table ended with *four* columns for
  exactly this reason; PR-12's and PR-13's judges each filed the same class of defect when a figure was
  attributed to the wrong reference point.
- **Never write a computed figure as if it were measured**, and never leave a superseded figure unlabelled.
- **Estimate from the file sizes the design names.** PR-14's block says ≈380 for five modules and five twins.
  The ledger unit's four blocks each estimated ≈350–400 and measured **1,357**, **1,276**, **2,064** and
  **2,268** authored lines at their tips, so budget for a disclosed exception and measure the re-slice if you
  consider one.
- **A re-slice is a measurement, not a preference.** PR-13 measured both halves (1,620 / 648) and rejected
  the split because neither would have come in under budget.
- **Disclose growth past an authorized batch** rather than absorbing it.

**5. The ordinary native review is a separate, independent lifecycle (RDD switch: on).** After authorized
implementation is complete and normalized, and **before** reporting it complete, call `gentle_review` with
`{"operation":"inspect"}` and follow only the transition it returns. **Eleven observations are now
precedented — three of them new with PR-13:**

- **granted and approved** (PR-07b, PR-08a, PR-09b, PR-12): inspect → START → closure `approved` → execute
  the **exact** `acknowledge-approved` continuation (its envelope reports `authority: burned`) → advisory
  findings become a backlog row and are **not** actioned.
- **declined** (PR-08b, PR-09a, PR-10, PR-11, **PR-13**): `declined_this_candidate`, `lineage_created:
  false`, no mutation, and the same candidate is **never re-reviewed**. Run the RDD fallback: `assess` with
  the decline stated returns the plan.
- **declined *by the host*** (PR-11, **PR-13**): START returned `consent-declined-this-candidate` directly
  — for PR-13 on the offered **base-diff over the committed range**. That is a host resolution, not yours:
  **never invent consent, never call `answer-consent` for a decision you did not receive.**
- **NEW (PR-13): the *committed state of the workspace* decides which START route the controller offers.**
  With the work uncommitted, `inspect` offered `current-changes` over HEAD's tree — a candidate of one stray
  file. With the workspace clean, the very next `inspect` offered the **base-diff over the committed range**
  (`--base-ref=<base> --committed-only=true`). Commit (or stash) the record before inspecting, or the review
  candidate is not the slice.
- **NEW (PR-13): the accepted START shape is the offered binding's fields in camelCase plus `mode`.** The
  route that reached native START carried `{"mode":"ordinary","baseRef":…,"committedOnly":true,
  "untrackedScope":"exclude","expectedUntrackedInventory":…}` and the retained `lineageId`. Every failure is
  pre-authority, so **try shapes rather than concluding the review is unavailable**.
- **A stale consent binding is recoverable**: START returns `consent-binding-stale` with
  `lineage_created: false` and the instruction to run START again for a fresh envelope (PR-13 saw it once).
- **`inspect` is blocked on the intended-untracked selection** whenever an untracked `odd/` tree exists; one
  `inspect` call with `untrackedScope: "exclude"` resolves it. The ODD tree is never a reviewable artefact.
- **`assess` can return `risk: "unassessable"`** (PR-11, PR-12 and PR-13: the native command answered with
  empty output). By its own rule that is treated as **high risk**. When the review **closed**, the plan still
  says `independentVerifier: false` (the closed review is the independent check); **run one anyway**. When
  the review was **declined**, the plan says `independentVerifier: true` — run it.
- **A decline is not a closure** and approval authorizes **no** delivery: commit, push, PR and merge stay
  under ordinary repository policy and the Director's word.

**6. Run the audit and the review against frozen worktrees, not the live one.** `git worktree add --detach
../telegram_bus_agent-worktrees/<name> <sha>`, pass `workspaceRoot` to the review, hand the judges the
**committed** tree, and remove the worktrees when the run ends (**an empty directory is the expected end
state**). The fast way to get a working tree there is a **junction to the main checkout's `node_modules`**
(§8); `git reset --hard` is blocked by this workspace's safety policy, so restore a scratch worktree with
`git rm --cached` + `git checkout <base> -- <paths>` + explicit `rm -f`. **The mutant sweep must run on a
worktree frozen at the tip**, and the script must restore every mutated file byte-identically and verify it
with `sha256` — PR-13's did both, and its independent verifier re-ran the whole sweep to confirm.

**7. The dynamic-namespace gateway is not an approved evidence route**, and the four F0 spikes (B-05,
B-07, B-08, B-09) stay open.

**8. Remote delivery is authorized for this project** (Director, session 14, on top of DN-07/DN-08): push the
branch, open the PR, wait for the CI matrix, merge. The machine-global `~/.pi/agent/AGENTS.md` rule "NO
REMOTE, EVER" is about the unrelated `consultores-orion` account; this checkout's `origin` is
`agentesinteligentesllm-oss/connmuta` through the isolated local credential helper, and this project's
eighteen PRs exist by exactly this route. `gh pr merge N --merge --delete-branch` also **switched the local
branch to `main` and deleted the local feature branch** for PR-13, so the follow-up
`git checkout main && git branch -d` may find nothing to do — check, do not assume.

**9. The independent verifier is run even when the plan does not require it.** PR-09a's, PR-10's, PR-11's,
PR-12's and now PR-13's independent verifiers each found defects nothing else caught: PR-13's found **two
prose defects, one of them in shipped source** (`src/ledger/retention.ts` claimed no index exists on
`status`; `threads_needs_action` contains it) and named the terminal verdict's mislabelled test count the
figure **least safe as written**. Hand it a mandate to **reproduce the figures**, not to read them, and let
it re-run the mutant sweep itself — PR-13's did, at three tips.

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
`apply-progress.md`. **PR-10 through PR-13 vendored nothing** — their twelve modules are new code — so the
fixture stays at 11 entries and a header of that kind on a new file is a defect. **PR-14 vendors nothing
either** (design §12 has no v1 row pointing at `secret-store/*`; its redactor consumes `shared/secrets.ts`,
which is PR-03's SEAM module), so expect the fixture to stay at eleven and say so in the record if it does.
PR-11 added one new fixture, `test/fixtures/ledger-corrupt.db` (**text on purpose**: a ledger file whose
bytes are not a SQLite database), so the corruption is reviewable rather than an opaque binary blob. PR-12
and PR-13 added no fixture.

A second pinned value exists in the tree, and it is the *design's* text rather than v1's:
`src/ledger/schema.ts`'s `LEDGER_SCHEMA_DDL` is design §5.2's `sql` block **verbatim** —
`sha256 9e9bb65545df29ce5871bea095a6d5457a8865a1a739abda9feb62058915b506`, 74 lines / 4,123 bytes. PR-11
applies that string through migration 1 and **does not edit it** (a schema change is a migration, not an
edit to version 1). **PR-12 and PR-13 write against that schema and do not touch it** either.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **A disposition is not landed until it is committed.** PR-13 lost a whole re-judgment to this: `git add -A src test docs` excluded `openspec/**`, so the fix delta the judges read contained no record correction, and both returned `regression` for a row whose text had in fact been fixed in the working tree. Commit code and its record together, then verify with `git diff --name-status <reviewed>..<fixed>`. | PR-13's `JD-A-001`; §2.2 | `apply-progress.md` §PR-13 |
| **What is committed decides which review route `inspect` offers.** Uncommitted work → `current-changes` over HEAD's tree; clean tree → the base-diff over the committed range with `--base-ref/--committed-only`. PR-13 saw both within ten minutes. | §2.5 | `apply-progress.md` §PR-13 |
| **`test/security/provenance.test.ts` reads a *leading* `/**` block as a vendor header** | If a file begins with `/**` and that block contains the header's own first token (a capitalised `Provenance` followed by a colon), the gate demands a complete, parseable header and otherwise fails with `malformed Provenance header(s)`. A non-vendored module **with no imports** has its doc comment as that block, so it must not spell the token. `src/ledger/schema.ts` hit this in PR-10. **PR-11…PR-13's modules all begin with imports, so none of them can be read that way.** PR-14's five modules will begin with imports too if they import `@napi-rs/keyring`/`node:fs` — check each one. | **B-33** |
| **`git ls-files`-based scanners only see tracked or staged files** | `repo-scan.test.ts` and `provenance.test.ts` run over `git ls-files`, so a new file is invisible to them until `git add`/`git add -N`. Its failure mode is a *late* static failure, after the focused suite has already gone green. PR-09b…PR-13 all hit it. | PR-09b…PR-13 |
| **PT-22's token shape needs a colon plus 35 token characters after 8–10 digits** | `test/security/repo-scan.test.ts` skips files containing a NUL byte, and a long digit run is safe when no colon follows it — which is why synthetic chat/user/bot ids are safe and every fixture token in this repository uses a **seven**-digit bot id. PR-13's token fixtures are built as `1234567:${"A".repeat(35)}` — **do not** paste a literal token into a test, or `test:static` fails once the file is tracked. | `test/security/repo-scan.test.ts` |
| **`PRAGMA user_version` cannot be parameterized** and a write to it inside a transaction **is** rolled back with it (both measured). | The stamp is interpolated, and the path's contiguity check is what makes that safe | `src/ledger/migrations.ts` |
| **`node:sqlite`'s `errcode` is not always the primary code**: an extended code shares the primary code's low byte (`526 & 0xFF === 14` = `SQLITE_CANTOPEN`). Compare the class, not two integers. | `isLedgerCorruptionError`, exported so the rule is pinnable with synthetic codes | `src/ledger/open.ts` |
| **A clean `close()` removes the `-wal`/`-shm` siblings** (and the close, not the open, is what removes them). | `quarantineLedgerFile`, exported for exactly that reason | `src/ledger/open.ts` |
| **`node:sqlite` rows are null-prototype objects**, and `.changes` is typed `number | bigint` | `assert.deepEqual` (strict) distinguishes prototypes, so a row read straight out of the database never deep-equals an object literal. PR-13's `TS2322` ×3 came from `.changes`; each count is `Number(...)`-ed with the reason at the call site. | `test/ledger/*.test.ts`, `src/ledger/retention.ts` |
| **A lexicographic comparison over stored instants is only an ordering if every value is canonical.** PR-13's `JD-B-002`/`JD-A-003`: `…T10:00:00Z` sorts after `…T10:00:00.500Z`, and `…T11:00:00+05:00` is four hours earlier than both — so a `MAX()` over raw text let a later sighting fail to advance and an earlier one move backwards. **Store `new Date(ms).toISOString()`**, and never accept "parseable" as "comparable". | PR-13's fix; the rule applies to any new instant column | `src/ledger/unknown-senders.ts`, `src/ledger/conditions-store.ts` |
| **`threads_needs_action` contains `status` but leads with `project_id`**, so a `status`-only predicate still scans | PR-13's `retention.ts` said "no index exists on … or `status`" until the independent verifier showed otherwise. Check the index's leading column, not its member list. | `src/ledger/schema.ts:74` |
| **Bash executes backticks inside double-quoted strings, and `cat << 'EOF'` heredocs truncate on long Markdown** | Write such patches to a file with the editor and append them with a `node` script; for long commit messages use `git commit -F <file>` and check the message's tail afterwards. PR-13 hit both again: a `cat << 'JD'` heredoc failed outright on a JSON file (the file-write tool handles escaping; the heredoc did not), and an `edit`+`git commit` pair issued in one message raced, leaving an edit uncommitted and the review candidate wrong. **Do not put an edit and its commit in the same message.** Always the editor plus a `node` splice for Markdown. | sessions 13–16 |
| **`git reset --hard` is blocked by this workspace's safety policy** | Use `git rm --cached` + `git checkout <base> -- <paths>` + explicit `rm -f` to restore a scratch worktree. | sessions 14–16 |
| **`dist/` staleness fakes results, and `tsc -b` is incremental** | Always `rm -rf dist` before believing a surprising run; restore mutants byte-for-byte and verify with `sha256`. | sessions 11–16 |
| **A mutant harness that takes a flat `[from, to]` array is broken in a way that looks like results** | PR-13's first sweep destructured each string per character, so 12 of 13 mutants never applied their edit and the one real result was M9's. Require explicit pairs and assert the edit changed the file. | §2.2; `apply-progress.md` §PR-13 |
| **Removing a worktree whose `node_modules` is a junction **deletes the junction's target contents** on this machine.** | PR-13 removed its four frozen worktrees with `git worktree remove --force`, and the main checkout's `node_modules/` was left **empty** — the recursive delete followed the reparse point. Nothing tracked was lost (`.gitignore` excludes it and `npm-shrinkwrap.json` is committed) and `npm ci` restored it in one command, after which the suite read 465/465 again. **Remove the junction first** — `cmd /c rmdir <worktree>\node_modules` unlinks it without recursing — or accept the `npm ci` afterwards. | PR-13's close-out, session 16 |
| **An `edit` and its `git commit` in the same message race.** | PR-13 issued the two in one tool block: the commit ran before the edit landed, the record carried a stale reference, and the *review candidate* then included the stray file. Do the edit, read it back, **then** commit. | sessions 15–16 |
| **`state.yaml` is YAML, and a plain scalar cannot hold `": "`** — and an unquoted `*` inside a *quoted* scalar is only safe while the quotes are balanced | Validate it with PyYAML after editing (`python -c "import yaml…"`); `gentle-ai sdd-status` also reads it. PR-13's edit dropped a closing quote and the file failed to parse with a scanner error about an alias at the `**` of `openspec/**`. **Always re-parse both YAML files after editing them**, and write them with `newline=""`/LF so the file does not flip to CRLF. | sessions 15–16 |
| **`node --test` output is ANSI-coloured, and its failing lines use `✖ <name> (dur)`, not TAP `not ok`** | Strip escape codes and match `✖` when you need *which* test died, not just how many. | sessions 9–16 |
| **`gh pr merge N --merge --delete-branch`** | Works; PR-13's merge switched the local checkout to `main` **and deleted the local feature branch**, so a following `git branch -d` reports "branch not found". Every `gh` call needs `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**. | PRs #13–#18 |
| **The ODD feature doc stays out of the repository** | Each slice's `odd/tasks/<feature>.md` is created (ODD requires it) and **deleted at close**; AGENTS.md §2 does not list an ODD tree. Fold the substance into `apply-progress.md` + Engram. PR-13 also kept its judge prompts, its frozen ledger, its probes and its mutant script in `odd/`, all untracked and all deleted at close. | Engram `odd/*/tasks` |
| **`roster_hash` may be a legacy `sha256:` value** | Nothing at load time ties it to its snapshot (**B-29**); the loader only shape-checks it. | `src/registry/schema.ts` |
| **The ledger's peer-body columns and the cursor advance carry no token guard** | `updates.body` (`threads.body`, `thread_history.body` by the same argument) is written as received, and the receive-side scan PR-13 credited for it **does not exist**; `ledger/cursors.ts` stores `client_id`/`host`/`last_surfaced_digest` as handed over. Both are filed, not fixed — a guard in the ledger's own writer would wedge the poller. | **B-37**, **B-38** |

---

## §5 — Next session, exact sequence

1. **§0**: confirm `main` is clean and current, `rm -rf dist`, read the SDD status. Then read
   [`../../AGENTS.md`](../../AGENTS.md) §1–§2, this file's §2, `tasks.md`'s **PR-14 block** (and the
   `Unit 5 — secret-store` heading), design **§6** (the secret store table: interface, keyring, fallback
   selection, redaction, the PT-19 win-x64 note), §3 (`KEYRING_SERVICE`, `POSIX_PRIVATE_FILE_MODE`,
   `POSIX_PRIVATE_DIR_MODE`), §12 (no v1 row maps to `src/secret-store/`), §14 (the `child_process` rows the
   daemon must not have — the *test* may spawn `icacls`, the daemon never does) and §15's PT→file map, and
   the `secret-store` spec's three requirements PR-14 answers.
2. **Create the ODD feature doc** (`odd/tasks/pr-14-secret-store.md`, untracked, deleted at close), its
   Engram mirror (`odd/pr-14-secret-store/tasks`) and the visible `todo` list, **before** the first write.
   State the plan in one line and proceed; do not ask the Director to choose a workflow and do not wait on
   the TUI.
3. **Branch** `f1/14-secret-store` from `main`. Then follow the block exactly:
   - **14.1 RED**: `test/secret-store/keyring.test.ts` (a round trip on the keychain never touches
     `registry.json`) and `test/secret-store/file-fallback.test.ts` (the fallback file is created when the
     keyring is unavailable; POSIX mode `0600`; on Windows the `icacls` output lists only the current user —
     **`icacls` runs in test code only**).
   - **14.2 GREEN**: `src/secret-store/types.ts` (`SecretStore`), `src/secret-store/keyring.ts`
     (`@napi-rs/keyring`, `Entry(KEYRING_SERVICE, "bot:<bot_id>")`), `src/secret-store/file-fallback.ts`
     (tmp + rename with `POSIX_PRIVATE_FILE_MODE`).
   - **14.3 RED**: `test/secret-store/redaction.test.ts` (a fixture token never leaks through a classified
     error path) and `test/secret-store/index.test.ts` (probe-then-fallback selection raises
     `secret_store_fallback`).
   - **14.4 GREEN**: `src/secret-store/redaction.ts` (`redactTokenShapes`, consuming `shared/secrets.ts`'s
     `TELEGRAM_BOT_TOKEN_RE` — one spelling, never a second copy) and `src/secret-store/index.ts` (the
     selection probe at daemon start).
   - **14.5 Verify**: `npm run build && node --test "dist/test/secret-store/**/*.test.js"`.
   - **14.6 Docs**: PT-08, PT-09 and PT-19's file-name cells in `docs/02-architecture/THREAT-MODEL.md` §4 —
     and only what the tests really pin (PT-08's error/log sinks are partly PR-19's; say which half).
   - **Carry the unit's existing boundaries**: PR-13's audit/condition writers **refuse** token-shaped input
     because `redaction.ts` did not exist yet; once it lands, `redactTokenShapes` is the *upstream*
     sanitizer for errors, logs and stacks while the ledger's refusal stays the last line — say that in the
     record rather than silently re-labelling PR-13's decision. And the `@napi-rs/keyring` API must be
     probed on the pinned Node build before any claim about it is written.
4. **Verify** from a frozen worktree (never the working tree): the full suite and `test:static`, plus a
   mutant sweep on a cleaned `dist/` with an explicit-pair harness (§2.2). At least: make the fallback write
   with the default mode, make the selection probe always choose the keyring, make `redactTokenShapes` a
   no-op, and make the fallback file left behind on a failed `set`. **Report every survivor with its
   reason**, and state the pieces a mutant cannot reach.
5. **Measure the real diff** (`git diff --numstat -- src test`), read every new file in full, and take the
   PR-14-scoped exception if it lands over (the block says ≈380, no exception). The Director's standing
   "do not stop for authorizations" applies if it is given again; otherwise ask one question and disclose.
   **Label every figure with the tip it was measured at.**
6. **Commit** as work units (code + its twin together), then the docs/bookkeeping commit — and put any
   record/`tasks.md` correction in the *same* commit as the thing it describes (§2.2).
7. **Audit** (§2.2) over the frozen committed range, then **the ordinary native review** (§2.5, commit
   everything before inspecting) and, if it declines, the RDD fallback — **and run an independent verifier
   either way** (§2.9). Correct every finding **before** the commit that claims it is corrected. Then push,
   open the PR, wait for the CI matrix, and merge.
8. **Close**: rewrite this file (for **PR-15**, the daemon lifecycle), prepend to [`LOG.md`](./LOG.md), add
   the audit-path record to [`INDEX.md`](../05-tribunal/INDEX.md), sweep every status line in `AGENTS.md`,
   `README.md`, `docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml` (**parse both YAML files after
   editing**), add any backlog row the audits recommended, delete the ODD tree, run `mem_session_summary`,
   commit the docs on `main`, and push.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits so far: the PR-01, PR-06, PR-08 and PR-09
  re-slice notes, the PR-07a block, the PR-07b carried-findings note (+ D4 amendment), the **appended**
  `EXIT_VALIDATION_FAILED` row in design §11, and the PR-10, PR-11, PR-12 and **PR-13** apply-time notes
  (with PR-13's sub-task-order disclosure, its four-tip size figures and its PT-20 cell). Do not rewrite a
  gate's text; append a note. **Rows PR-09, PR-10, PR-11, PR-12 and PR-13 are closed** (13.1–13.6 all `[x]`;
  there is no 13.7).
- Provenance hash rule, registry and range convention are ratified — §3. `constants.ts:3` is settled
  (B-19, `done`); do not re-open or re-report it.
- **Doc-hygiene rule** (ratified `bus-v2-f1-pr-03-001`): never quote a matched-and-rejected secret-shaped
  literal in `apply-progress.md`; describe the shape.
- **PR-01…PR-13 are merged; do not re-slice, re-audit or re-open them.** PR-08b's, PR-09a's, PR-10's,
  PR-11's and **PR-13's** native reviews were **declined** and are never re-run; PR-07b's, PR-08a's, PR-09b's
  and PR-12's were **approved** with advisory findings (B-21, B-22, B-32, B-36) that are recorded, not
  actioned. PR-13's Judgment Day used **both** rounds and closed `APPROVED` after **four** corrections —
  rounds 3 and 4 outside the budget — and its surviving rows are escalated and recorded with that status
  spelled out; **no third round exists**.
- **The ledger unit is closed** (`schema`, `transaction`, `open`, `migrations`, `inbox`, `threads`, `cursors`,
  `audit`, `unknown-senders`, `conditions-store`, `retention`), and `schema.ts` is design §5.2's text: **a
  schema change is a migration, never an edit to version 1**. A defect in any merged ledger module is its
  own slice with its own audit, not a drive-by edit — which is exactly why B-37 and B-38 exist instead of a
  guard added to `cursors.ts` or `inbox.ts`. **PR-12's and PR-13's mutants are the ones to re-run, not to
  "fix"**: PR-12's `M2`, `M8`, `M16` and `M19` survive for stated reasons, and PR-13's thirteen all die.
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
  PR-13's judges and verifier found five such defects between them, three of them installed by corrections.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-22 | The four advisory findings of PR-08a's ordinary native review, recorded not actioned | Director |
| B-23 | `JD-A-003`: the deliberate precedence of `unsupported_schema_version` over the content walk is documented but unpinned (ADR-12) | Kairo → Alpha |
| B-24 | **No POSIX CI leg**, so packaging/execution contracts cannot fail here (PR-11's `M8` survivor). This also means PR-14's POSIX `0600` assertions cannot fail in CI | Kairo → Alpha |
| B-25 | Three cheap gates for one later audited PR: a YAML validity check over `git ls-files '*.y*ml'`; a `clean` step before `npm test`; bumping `actions/*` off Node 20. **PR-13's `state.yaml` scanner error is the third time this repo has wanted the YAML check** | Kairo → Alpha |
| B-26 | **PT-25's owner is attributed differently by two gated documents.** PR-11 kept its cells untouched, PR-12 kept PT-10/PT-11 to themselves, and PR-13 filled **PT-20** and stated what it did not claim — **PR-14 (14.6) fills PT-08, PT-09 and PT-19 and must not inherit the confusion** | Director → Kairo |
| B-27 | **The shared token regex matches this project's own `sha256:` roster hash**, so R5 would refuse every valid registry. **PR-14's `redactTokenShapes` consumes that same regex** — check this before writing the redactor's tests | Director → Kairo |
| B-28 | **No R1–R6 row demands referential integrity**, so a dangling reference loads. An F2 `doctor` check owns it | Kairo → Alpha |
| B-29 | **Nothing at load time ties `roster_hash` to its snapshot** (two independent judges) | Director → Kairo |
| B-30 | **R5's strictness refuses free-form human text** | Director → Kairo |
| B-31 | **A JSON-escaped colon (`\u003a`) bypasses the raw-text scan** | Director → Kairo |
| B-32 | The four advisory findings of PR-09b's approved native review, recorded not actioned | Director |
| B-33 | **`test/security/provenance.test.ts` treats a file's leading `/**` block as a vendor header** | Kairo → Alpha |
| B-34 | **The `TS18003` rule is stated falsely in `src/cli/tsconfig.json:10` and `src/registry/tsconfig.json:12`.** The measured rule is in `src/ledger/tsconfig.json`. Wording only | Kairo → Alpha |
| B-35 | **PT-10's assertion cell and the evidence cell PR-12 wrote read as a contradiction** (wording only, in a gated row) | Director |
| B-36 | **The three advisory findings of PR-12's approved native review**, recorded not actioned | Director |
| **B-37** | **The `ledger` spec's "No token in any ledger table" scenario names three write paths and only two have a guard**: the cursor advance (`src/ledger/cursors.ts`, PR-12's, frozen) stores `client_id`/`host`/`last_surfaced_digest` as handed over. Low practical exposure (the handshake mints `client_id`), but the scenario is unsatisfied for that path. Dispositions in the row | Director → Kairo |
| **B-38** | **The ledger's peer-body columns are unguarded and the receive-side control the record credited for them does not exist**: `updates.body` (and `threads.body`/`thread_history.body`) is written as received, no admission scan is planned anywhere in F1, and a guard in the ledger's own writer would leave the offset unmoved and wedge the poller. Dispositions in the row (the design's own placement is `SECRET_PATTERN_DETECTED` in admission, PR-22a) | Director → Kairo |
| **PR-13 escalated** | **Two SUGGESTION/WARNING rows survived both rounds** (the "62" figure and its sibling), with corrections applied in round 3 and round 4 and disclosed as **measurement-checked, not judge-re-judged**, because the round budget is two. Nothing blocks PR-14 | Director |
| PR-12 escalated | `JD-B-008` survived round 2's scoped re-judgment from both judges. Nothing blocks PR-14 | Director |
| PR-11 escalated | Two SUGGESTION-class rows survived PR-11's second round on split verdicts. Nothing blocks PR-14 | Director |
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
- **`node:sqlite` measured facts** (PR-10's list, extended by PR-11, PR-12 and PR-13): `DatabaseSync.isTransaction`
  flips on `BEGIN IMMEDIATE`; a failed *constraint* statement leaves the transaction open, but `SQLITE_FULL`
  and friends roll it back themselves; `ROLLBACK` outside a transaction throws `ERR_SQLITE_ERROR`; a nested
  `BEGIN` is refused by SQLite; `exec()` runs multiple statements; constraint codes are CHECK 275, UNIQUE
  2067, FK 787, NOT NULL 1299, STRICT datatype 3091, `SQLITE_BUSY` 5, `SQLITE_CORRUPT` 11, `SQLITE_CANTOPEN`
  14 (extended `526`), `SQLITE_NOTADB` 26. `DatabaseSync` opens lazily, `isOpen` exists, and
  `PRAGMA user_version` cannot be parameterized. Rows come back as **null-prototype** objects (§4) and
  `.changes` is `number | bigint`. **Query plans measured for the retention sweep**: `SCAN updates`,
  `SCAN audit_log`, `SCAN unknown_senders`, `SCAN client_cursors`, `SCAN threads`, with
  `SEARCH client_surfaced USING COVERING INDEX sqlite_autoindex_client_surfaced_1` and
  `SEARCH thread_history USING COVERING INDEX sqlite_autoindex_thread_history_1` for the cascades and a
  rowid lookup for the cap's outer delete. `EXPLAIN QUERY PLAN` also shows the planner using
  `sqlite_autoindex_updates_2` for a `project_id` filter — the `UNIQUE (project_id, eid)` index.
- Verification worktrees live in `../telegram_bus_agent-worktrees/` and are removed when their run ends;
  **an empty directory is the expected end state** (PR-13 removed all four of its own). Make one usable
  quickly with: `git worktree add --detach <path> <sha>` then a **junction** to the main checkout's
  `node_modules`
  (`powershell -NoProfile -Command "New-Item -ItemType Junction -Path '<wt>/node_modules' -Target '<main>/node_modules'"`).
  **Unlink that junction before removing the worktree** (`cmd /c rmdir <wt>\node_modules`) — removing the
  worktree first deleted the *target's* contents on this machine (§4), and `npm ci` was the restore.
- `node --test` prints `ℹ tests / ℹ pass / ℹ fail` (ANSI-coloured) and names failures with `✖`, not TAP's
  `not ok`.
- GitHub Actions: the workflow lives on `main`, so `pull_request` runs fire on PR open (≈1 min per matrix
  entry, Node 24.15 and 26). PR #18's both legs passed.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; `main` is the only remote branch
  that matters. Every `gh` call runs with
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365` (tag `v1.0.2` + 2 commits),
  **read-only**; cite as `path:line`. It carries one pre-existing untracked `alpha_response.json`. For PR-14
  the v1 evidence is `v1:src/secrets.ts:16` (`TELEGRAM_BOT_TOKEN_RE`, unexported there — PR-03 exported it),
  and there is no v1 keyring or fallback to read: v1 resolved its token from the `AGENTBUS_BOT_TOKEN`
  environment variable or `config.json`'s optional `bot_token` field (`v1:src/config.ts:183,236-248`), so
  design §6 — not v1 code — is the source for the interface, the keyring, the fallback and the redactor.
- Arena bridge: `.mcp.json` (gitignored) points at `http://127.0.0.1:8766/mcp` — the Arena Orion Electron
  app, **down** unless the Director launched it. Never quote `.mcp.json` and never commit it.
