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
PR-12, PR-13, PR-14 and **PR-15** — thirteen slices, thirteen records in the tribunal index.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en su rebanada PR-16 (unidad 6 `daemon-lifecycle`: `src/daemon/lifecycle/{heartbeat,idle}.ts`, `src/daemon/{bootstrap,main}.ts` con cuatro gemelos — `lifecycle/heartbeat.test.ts`, `lifecycle/idle.test.ts`, `bootstrap.test.ts`, `no-emission.test.ts` — temporizador de heartbeat, apagado idle respetando hilos abiertos, composición raíz de bootstrap y punto de entrada main con compuerta node-floor, observación manual de parpadeo de consola en Windows 11, ≈340 líneas, sin excepción): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + auditoría Judgment Day); la Arena de debate no está disponible, así que nada depende de un debate ni de una acción en la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** at the start of this session except for an untracked `odd/` directory if
a previous session left one. The status command must print
`nextRecommended: apply`, `completed: 90` of `210`, `blockedReasons: []`. Anything else: stop and report.
(`verifyReport: missing` is **expected and correct** while `apply` runs.)

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-15** (PR-15 delivered on branch `f1/15-lifecycle-lock-runfile`, commits `8123d7f`, `affeb21`, `937b932`). **Next slice: PR-16** — closing Unit 6 `daemon-lifecycle`. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | **45 PR blocks / 42 row ids** in `tasks.md` (`PR-01…PR-42`; PR-06, PR-08 and PR-09 were each re-sliced in place into two blocks). Complete: **20 blocks / 15 row ids** (`PR-01…PR-15`). Remaining: **25 blocks / 27 row ids** (`PR-16…PR-42`). Checkboxes: **90 of 210**. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **90/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Unit 6 `daemon-lifecycle` — **first half closed** | `src/daemon/{node-floor,home,log}.ts`, `src/daemon/lifecycle/{lock,run-file}.ts` (PR-15). PR-16 (`heartbeat`, `idle`, `bootstrap`, `main`) opens next to close Unit 6. | `INDEX.md` `bus-v2-f1-pr-15-audit-001` |
| Code on `main` / current | `src/shared/*` (16 modules), `src/cli/{main,validate}.ts`, `src/registry/{schema,invariants,loader}.ts`, `src/ledger/{schema,transaction,open,migrations,inbox,threads,cursors,audit,unknown-senders,conditions-store,retention}.ts`, `src/secret-store/{types,keyring,file-fallback,redaction,index}.ts`, `src/daemon/{node-floor,home,log}.ts`, `src/daemon/lifecycle/{lock,run-file}.ts`, all with twins — **521 tests** (520 pass, 1 skip), `test:static` **8/8** | PRs `#1`–`#19` + PR-15 |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**`; the scanned set must **equal** `test/fixtures/v1-provenance.json` — **12 entries** (includes SEAM entry for `src/daemon/lifecycle/lock.ts` adapted from `telegram-agent-bus/src/state.ts:458-602` @ `bf8f365`). | `test/security/provenance.test.ts` |
| Audit status | **DN-05 is unsatisfied for PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a, PR-09b, PR-10, PR-11, PR-12, PR-13, PR-14 and PR-15** — all thirteen audited by the **Judgment Day substitute**, one record each in the tribunal index. | [`INDEX.md`](../05-tribunal/INDEX.md) |

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

**2. Audit: Judgment Day**, exactly as PR-10..PR-15 ran it. Two blind read-only judges (`jd-judge-a`, `jd-judge-b`)
in parallel over one immutable frozen tree, graph-v1 shapes only (discovery returns only `{"rows":[…]}`;
a scoped re-judgment returns only `{"resolutions":[…]}`), then a bounded correction round and **at most
two scoped re-judgments — the budget is two, and a round-two survivor escalates**. Record the audit path
in the tribunal index the way the thirteen existing records do, and state plainly that DN-05 is unsatisfied.
PR-15's lesson: 10-mutant sweep killed 10/10; POSIX private modes (`0o700` dirs / `0o600` files) on lock and
log files were addressed and verified, and relative path resolution in `resolveHomeDir` was pinned.
Carry forward previous rules:

- **Ask before round 1** (the skill requires it). If the Director's standing instruction for the session is
  "do not stop for authorizations", authorize the batch by that delegation and **disclose the batch, its size
  and its cost in the record and in the PR body instead**. Never let the disclosure go missing either way.
- **A single-judge row is *suspect*, never auto-fixable — and never dismissible from authority either.**
  Reproduce it deterministically first.
- **A disposition is not landed until it is in the commit the re-judgment reads.** Commit code and its record
  together, and verify with `git diff --name-status <reviewed>..<fixed>`.
- **Re-run the whole sweep after every correction, and fix stale anchors rather than reporting skips.**
- **The mutant harness must take explicit `[from, to]` pairs.** Validate the harness before believing it,
  and keep a `sha256` restore check.
- **Re-measure the replacement text, not only the row you were fixing**, and expect each round's re-judgment
  to attack the replacement harder than the original.
- **A count is the most dangerous kind of figure**, because it looks checkable and is rarely checked against
  its own parts. Recount from the file or command, never from memory.

**3. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only
those; an over-claimed cell is a defect. PR-15 updated PT-12 in `docs/02-architecture/THREAT-MODEL.md` §4.
PR-16 carries no new PT cell update (it includes a manual Windows 11 console-flash check).

**4. Budget policy.** 400 lines of *authored* src+test, measured as `git diff --numstat -- src test`, with
disclosed PR-scoped exceptions otherwise. Precedents: PR-06b 26, PR-07a 20, PR-07b 154, PR-08a 348, PR-08b 272,
PR-09a 866, PR-09b 375, PR-10 957, PR-11 876, PR-12 1,664, PR-13 1,868, PR-14 687, PR-15 608. PR-16 estimates
≈340 lines (no exception planned).
- Measure after every correction, in the same pass as the edit, and again at the tip that ships.
- Always label a figure with the tip it belongs to.
- Never write a computed figure as if it were measured, and never leave a superseded figure unlabelled.
- Estimate from the file sizes the design names.
- Disclose growth past an authorized batch rather than absorbing it.

**5. The ordinary native review is a separate, independent lifecycle (RDD switch: on).** After authorized
implementation is complete and normalized, and **before** reporting it complete, call `gentle_review` with
`{"operation":"inspect"}` and follow only the transition it returns:
- Commit everything before inspecting so `inspect` offers the base-diff over the committed range.
- Accepted START shape is the offered binding's fields in camelCase plus `mode`.
- If START returns `consent-declined-this-candidate` from the host or fails on model configuration, run the
  RDD fallback (`assess`).
- When review is approved, execute the exact `acknowledge-approved` continuation.

**6. Run the audit and the review against frozen worktrees, not the live one.** `git worktree add --detach
../telegram_bus_agent-worktrees/<name> <sha>`. Fast setup: junction to `node_modules` (§8). **Unlink that junction
before removing the worktree** (`cmd /c rmdir <wt>\node_modules`).

**7. The dynamic-namespace gateway is not an approved evidence route**, and the three remaining F0 spikes
(B-05, B-08, B-09) stay open (B-07 closed in session 17).

**8. Remote delivery is authorized for this project** (Director, session 14, on top of DN-07/DN-08): push the
branch, open the PR, wait for the CI matrix, merge.

**9. The independent verifier is run even when the plan does not require it.** Hand it a mandate to reproduce
figures and re-run mutant sweeps.

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
| `src/daemon/lifecycle/lock.ts` | `src/state.ts:458-602` @ `bf8f365` | SEAM | tracked in `test/fixtures/v1-provenance.json` |

Older values (envelope, secrets, protocol-apply, protocol-select, thread-record, fence) are in
`apply-progress.md`. The 12-entry fixture `test/fixtures/v1-provenance.json` holds all active SEAM entries.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **Explicit POSIX permissions on daemon files/dirs** | Always specify `POSIX_PRIVATE_DIR_MODE` (0o700) and `POSIX_PRIVATE_FILE_MODE` (0o600) on lock, log, run-file, and secret file/directory operations. | PR-15 session 18 (`affeb21`) |
| **Windows 11 console-flash check is manual** | `{detached: true, windowsHide: true}` spawn (design §7.2, nodejs/node#21825); record the observation in PR-16's description, not as a test assertion. | PR-16 task 16.5 |
| **`FORBIDDEN_GRANTEES` on Windows Server CI** | Do not match bare `BUILTIN\` or `NT AUTHORITY`: Windows Server temp directory ACLs include `BUILTIN\Administrators` and `NT AUTHORITY\SYSTEM`. Refine forbidden grantees to `BUILTIN\Users` and `NT AUTHORITY\Authenticated Users`. | PR-14 session 17 (`0372661`) |
| **`icacls` bare-name trap on Windows** | When `COMPUTERNAME == USERDOMAIN == USERNAME`, `icacls` rejects bare `%USERNAME%` as ambiguous or unmapped. Always use `%USERDOMAIN%\%USERNAME%`. | PR-14 session 17 |
| **Type-only modules need a twin test** | `test/twins.test.ts` enforces that every `.ts` file in `src/` has a test counterpart in `test/`, even if it exports only types/interfaces (satisfying Strict TDD via the type-only exception). | PR-14 `types.test.ts` |
| **A disposition is not landed until it is committed.** | Committing code without `openspec/**` causes judges to see no record correction, returning `regression`. Commit code and its record together, then verify with `git diff --name-status <reviewed>..<fixed>`. | PR-13's `JD-A-001`; §2.2 |
| **What is committed decides which review route `inspect` offers.** | Uncommitted work → `current-changes` over HEAD's tree; clean tree → base-diff over committed range with `--base-ref/--committed-only`. | §2.5 |
| **`test/security/provenance.test.ts` reads a *leading* `/**` block as a vendor header** | If a file begins with `/**` and contains `Provenance:`, the gate demands a complete header. A non-vendored module with no imports must not spell that token. | **B-33** |
| **`git ls-files`-based scanners only see tracked or staged files** | `repo-scan.test.ts` and `provenance.test.ts` scan `git ls-files`; new files are invisible to them until `git add`/`git add -N`. | PR-09b…PR-15 |
| **PT-22's token shape needs a colon plus 35 token characters after 8–10 digits** | Synthetic bot ids should use seven digits (`1234567:${"A".repeat(35)}`) so test fixtures do not trigger scanner failures. | `test/security/repo-scan.test.ts` |
| **`PRAGMA user_version` cannot be parameterized** and a write to it inside a transaction is rolled back with it. | Stamped through interpolated path with contiguity check. | `src/ledger/migrations.ts` |
| **`node:sqlite`'s `errcode` is not always the primary code** | Extended codes share the low byte (`526 & 0xFF === 14` = `SQLITE_CANTOPEN`). Compare the class. | `src/ledger/open.ts` |
| **A clean `close()` removes the `-wal`/`-shm` siblings** | The close, not the open, removes them. | `src/ledger/open.ts` |
| **`node:sqlite` rows are null-prototype objects**, and `.changes` is typed `number | bigint` | `assert.deepEqual` distinguishes prototypes; use `Number(...)` on changes. | `test/ledger/*.test.ts` |
| **Lexicographic comparison over stored instants requires canonical ISO strings.** | `…T10:00:00Z` sorts after `…T10:00:00.500Z`. Always store `new Date(ms).toISOString()`. | `src/ledger/unknown-senders.ts` |
| **`threads_needs_action` contains `status` but leads with `project_id`** | A `status`-only predicate still scans. Check index leading column. | `src/ledger/schema.ts:74` |
| **Bash executes backticks inside double-quoted strings, and heredocs truncate** | Write patches with file-write/edit tools; use `git commit -F <file>` for long commit messages. Never put an `edit` and `git commit` in the same tool call. | sessions 13–16 |
| **`git reset --hard` is blocked by workspace safety policy** | Use `git rm --cached` + `git checkout <base> -- <paths>` + explicit `rm -f`. | sessions 14–16 |
| **`dist/` staleness fakes results, and `tsc -b` is incremental** | Always `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **Mutant harness must take explicit `[from, to]` pairs** | Flat array destructures characters; require explicit pairs and verify `sha256` on restore. | §2.2; `apply-progress.md` |
| **Removing a worktree junction deletes target contents on Windows** | `cmd /c rmdir <worktree>\node_modules` before `git worktree remove --force`. | PR-13 close-out |
| **`state.yaml` is YAML, and plain scalars cannot hold `": "`** | Re-parse YAML files after editing (`python -c "import yaml..."`). Write with LF. | sessions 15–16 |
| **`node --test` output is ANSI-coloured; failures use `✖`, not `not ok`** | Strip ANSI codes when parsing test results. | sessions 9–17 |
| **`gh pr merge N --merge --delete-branch`** | Deletes local feature branch automatically when merged. Always supply explicit `GH_TOKEN`. Never `gh auth switch`. | PRs #13–#19 |
| **The ODD feature doc stays out of the repository** | `odd/tasks/<feature>.md` is created and deleted at close. | Engram `odd/*/tasks` |
| **`roster_hash` may be a legacy `sha256:` value** | Loader only shape-checks it; no referential integrity check in F1. | `src/registry/schema.ts` |
| **Ledger peer-body columns and cursor advance carry no token guard** | Stored as received; receive-side scan does not exist in F1. | **B-37**, **B-38** |

---

## §5 — Next session, exact sequence

1. **§0**: confirm `main` is clean and current, `rm -rf dist`, read SDD status. Then read
   [`../../AGENTS.md`](../../AGENTS.md) §1–§2, this file's §2, `tasks.md`'s **PR-16 block** (and the
   `Unit 6 — daemon-lifecycle` heading), design **§7.1..7.2** (daemon bootstrap, heartbeat, idle shutdown),
   §15 ("Lifecycle" layer), ADR-0029, and the `daemon-lifecycle` spec requirements.
2. **Create the ODD feature doc** (`odd/tasks/pr-16-daemon-bootstrap.md`, untracked, deleted at close), its
   Engram mirror (`odd/pr-16-daemon-bootstrap/tasks`) and the visible `todo` list, **before** the first write.
   State the plan in one line and proceed; do not ask the Director to choose a workflow and do not wait on
   the TUI.
3. **Branch** `f1/16-lifecycle-heartbeat-idle-bootstrap` from `main`. Then follow the block exactly:
   - **16.1 RED**: write `test/daemon/lifecycle/idle.test.ts` ("open thread blocks idle shutdown", "no emission on an idle window")
     and `test/daemon/no-emission.test.ts` (simulated idle window, fake clients record zero sends).
   - **16.2 GREEN**: implement `src/daemon/lifecycle/heartbeat.ts` (`HEARTBEAT_PERIOD_MS` tick, `onTick` callback
     importing no transport/send module) and `src/daemon/lifecycle/idle.ts` (`IDLE_SHUTDOWN_HOURS`, open-thread count check).
   - **16.3 RED**: write `test/daemon/bootstrap.test.ts` asserting the full boot sequence from design §7.1
     (gate → dynamic import → ensure home → acquire lock → open ledger → load registry → select secret store →
     listen IPC → write run file → start heartbeat → reconcile bindings → RUNNING).
   - **16.4 GREEN**: implement `src/daemon/bootstrap.ts` (`startDaemon(options)` composition root, injectable
     `telegramClientFactory`/`secretStore`/`now` per design §15) and `src/daemon/main.ts` (node-floor gate then
     `dynamic import("./bootstrap.js")`, D-25).
   - **16.5 Verify**: `npm run build && node --test "dist/test/daemon/lifecycle/heartbeat.test.js" "dist/test/daemon/lifecycle/idle.test.js" "dist/test/daemon/bootstrap.test.js" "dist/test/daemon/no-emission.test.js"`.
     Record the Windows 11 console-flash manual observation in the PR description.
4. **Verify** from a frozen worktree (never the working tree): full suite and `test:static`, plus a mutant
   sweep on a cleaned `dist/` with an explicit-pair harness (§2.2). Report every survivor with its reason.
5. **Measure the real diff** (`git diff --numstat -- src test`), read every new file in full, and take a
   disclosed PR-16-scoped exception if it lands over (budget ≈340 lines). Label every figure with its tip.
6. **Commit** as work units (code + its twin together), then the docs/bookkeeping commit — put any
   record/`tasks.md` correction in the *same* commit as the thing it describes.
7. **Audit** (§2.2) over the frozen committed range, then **the ordinary native review** (§2.5) and, if it
   declines, the RDD fallback — **and run an independent verifier either way** (§2.9). Correct every finding
   **before** the commit that claims it is corrected. Push, open the PR, wait for CI, and merge.
8. **Close**: rewrite this file (for **PR-17**, `conmuta daemon stop`, D-29), prepend to [`LOG.md`](./LOG.md),
   add the audit record to [`INDEX.md`](../05-tribunal/INDEX.md), sweep status lines across docs and YAML files
   (**parse both YAML files after editing**), delete the ODD tree, run `mem_session_summary`, commit on `main`,
   and push.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits so far: PR-01, PR-06, PR-08, PR-09 re-slices,
  PR-07a, PR-07b, PR-10..PR-15 notes. Do not rewrite a gate's text; append a note. **Rows PR-09 through PR-15
  are closed** (all sub-tasks `[x]`).
- Provenance hash rule, registry and range convention are ratified — §3. `constants.ts:3` is settled (B-19, `done`).
- **Doc-hygiene rule**: never quote a matched-and-rejected secret-shaped literal in `apply-progress.md`.
- **PR-01…PR-15 are complete; do not re-slice, re-audit or re-open them.** PR-08b's, PR-09a's, PR-10's, PR-11's,
  PR-13's, PR-14's and PR-15's native reviews/audits are settled; advisory findings (B-21, B-22, B-32, B-36) are
  recorded, not actioned. No third round exists for Judgment Day.
- **Unit 4 (`ledger`) and Unit 5 (`secret-store`) are closed; Unit 6 first half is closed.** A defect in any
  merged module is its own slice with its own audit, not a drive-by edit.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a decision.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`.
- TypeScript 7.0.2 needs `"types": ["node"]`.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job.
- Type-only modules satisfy Strict TDD via the explicit type-only exception with a twin test.
- Stale comments, stale figures and stale records: re-measure before committing.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-07 | **CLOSED in session 17**: Telegram official documentation confirms Bot-to-Bot Communication Mode receives all bot messages in group without admin rights. | Done |
| B-22 | The four advisory findings of PR-08a's ordinary native review, recorded not actioned | Director |
| B-23 | `JD-A-003`: the deliberate precedence of `unsupported_schema_version` over the content walk is documented but unpinned (ADR-12) | Kairo → Alpha |
| B-24 | **No POSIX CI leg**, so packaging/execution contracts cannot fail here (PR-11's `M8` survivor). | Kairo → Alpha |
| B-25 | Three cheap gates for one later audited PR: YAML check over `git ls-files '*.y*ml'`, `clean` before `npm test`, bumping `actions/*` off Node 20. | Kairo → Alpha |
| B-26 | **PT-25's owner is attributed differently by two gated documents.** PR-14 filled PT-08, PT-09 and PT-19 without inheriting confusion. | Director → Kairo |
| B-27 | **The shared token regex matches this project's own `sha256:` roster hash**, so R5 would refuse every valid registry. | Director → Kairo |
| B-28 | **No R1–R6 row demands referential integrity**, so a dangling reference loads. An F2 `doctor` check owns it. | Kairo → Alpha |
| B-29 | **Nothing at load time ties `roster_hash` to its snapshot** (two independent judges) | Director → Kairo |
| B-30 | **R5's strictness refuses free-form human text** | Director → Kairo |
| B-31 | **A JSON-escaped colon (`\u003a`) bypasses the raw-text scan** | Director → Kairo |
| B-32 | The four advisory findings of PR-09b's approved native review, recorded not actioned | Director |
| B-33 | **`test/security/provenance.test.ts` treats a file's leading `/**` block as a vendor header** | Kairo → Alpha |
| B-34 | **The `TS18003` rule is stated falsely in `src/cli/tsconfig.json:10` and `src/registry/tsconfig.json:12`.** Wording only. | Kairo → Alpha |
| B-35 | **PT-10's assertion cell and the evidence cell PR-12 wrote read as a contradiction** (wording only) | Director |
| B-36 | **The three advisory findings of PR-12's approved native review**, recorded not actioned | Director |
| **B-37** | **The `ledger` spec's "No token in any ledger table" scenario names three write paths and only two have a guard**: cursor advance stores raw. | Director → Kairo |
| **B-38** | **The ledger's peer-body columns are unguarded and the receive-side control credited for them does not exist**: `updates.body` written as received. | Director → Kairo |
| **PR-13 escalated** | Two SUGGESTION/WARNING rows survived both rounds with post-budget corrections. Nothing blocks PR-15 / PR-16. | Director |
| PR-12 escalated | `JD-B-008` survived round 2's scoped re-judgment. Nothing blocks PR-15 / PR-16. | Director |
| PR-11 escalated | Two SUGGESTION-class rows survived PR-11's second round on split verdicts. Nothing blocks PR-15 / PR-16. | Director |
| carried (PR-06) | Digest blind spots incl. `MAX_THREAD_HISTORY = 50` saturation. | Director → Kairo |
| carried (PR-06) | The fence's body escape does not neutralise `&`, so the fence is not injective. | Director |
| B-16 / D-10 | `LICENSE` ships with `private: true`; SECURITY/CONTRIBUTING/CHANGELOG and copyright line open; CI secret deny-list — decide at PR-42. | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant. | Director |
| B-12 / B-13 | macOS scope; migration runbook closes when PR-38 merges. | Director + Kairo |
| — | T22 bytes-per-hour ceiling and origin-label organisation marker (PR-42 close-out). | Director |
| B-05, B-08, B-09 | gentle-ai installer study; Windows IPC/DACL; MCP notification rendering per host — F0 spikes, still open. | Director + Kairo |

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI, gentle-pi 3.1.1, TypeScript 7.0.2
  pinned, SQLite 3.53.0 through `node:sqlite`. **521 tests** (520 pass, 1 skip), `test:static` **8/8**. Receipt-driven
  development is **on** (`gentle-ai review mode status`: global on, clone-local unset).
- Line endings: `eol=lf` forced through `.gitattributes`. Check with `git ls-files --eol`.
- `node:sqlite` measured facts: `DatabaseSync.isTransaction` flips on `BEGIN IMMEDIATE`; constraint codes
  CHECK 275, UNIQUE 2067, FK 787, NOT NULL 1299, STRICT datatype 3091, `SQLITE_BUSY` 5, `SQLITE_CORRUPT` 11,
  `SQLITE_CANTOPEN` 14 (extended `526`), `SQLITE_NOTADB` 26. Lazy open, null-prototype rows, `.changes` typed
  `number | bigint`.
- Verification worktrees live in `../telegram_bus_agent-worktrees/`. Quick setup:
  `git worktree add --detach <path> <sha>` + junction to main `node_modules`
  (`powershell -NoProfile -Command "New-Item -ItemType Junction -Path '<wt>/node_modules' -Target '<main>/node_modules'"`).
  **Unlink that junction before removing the worktree** (`cmd /c rmdir <wt>\node_modules`) to avoid deleting
  target contents on Windows.
- `node --test` prints `ℹ tests / ℹ pass / ℹ fail` (ANSI-coloured) and names failures with `✖`.
- GitHub Actions: Node 24.15 and 26 matrix runs on pull_request.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365` (tag `v1.0.2` + 2 commits), **read-only**.
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down** unless launched. Never quote or commit.
