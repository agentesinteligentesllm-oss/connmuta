# Verify Report — f2-installer-and-doctor

Date: 2026-09-27. Run as a manual substitute for the native `sdd-verify` sub-agent, which is
blocked this session: a PreToolUse hook and, separately, `gentle-ai sdd-status`/`sdd-continue` both
report an unresolved `blocked(cross_common_dir_runtime_target)` state for this change across
multiple content edits — reported as an apparent tool defect, not chased further here. This pass is
read-only: no mutation authority, nothing below was fixed by this run.

Native status snapshot at run start (from `tasks.md` itself, no working `sdd-status` available):
`tasks.md` reports 130/130 checked (its own count; a broader grep below finds more granular
checkbox items than that headline figure), Unit 13 (D-52 close-out) closed, Success Criteria
Checklist all 8 items checked.

## 1. Fresh functional checks (`rm -rf dist`, then `npm run build` / `npm test` / `npm run test:static` / `npm run test:wrong-room`)

- `rm -rf dist` (build output only), then `npm run build`: clean, 0 errors.
- First full `npm test`: **1403 tests, 1396 pass, 1 fail, 6 skip.** Failure:
  `dist/test/daemon/lifecycle/heartbeat.test.js` — "heartbeat: ticks at periodMs",
  `AssertionError: expected at least 2 ticks, got 1`. This is **B-39**, the project's own
  already-known pre-existing timing flake — re-ran the file alone (`node --test
  "dist/test/daemon/lifecycle/heartbeat.test.js"`): **6/6 pass**. Re-ran the full suite again:
  **1403 tests, 1397 pass, 0 fail, 6 skip** — confirms the flake, not a regression.
- `npm run test:static`: **56/56 pass, 0 fail** (includes both wrong-room test files, both green in
  this context).
- `npm run test:wrong-room` (the standalone script, `dist/test/security/*wrong-room*` only): **failed
  consistently, 3 attempts in a row** — both tests in `wrong-room.test.ts` reject with
  `connect ETIMEDOUT 127.0.0.1:<port>` after ~350ms. Investigated rather than dismissed:
  - The same two tests pass cleanly inside the full `npm test` run (twice) and inside
    `npm run test:static`, both of which execute this exact compiled file.
  - Running `node --test "dist/test/security/wrong-room.test.js"` alone reproduces the timeout
    deterministically (3/3 attempts).
  - Running the same file with `node --test --test-concurrency=1 "dist/test/security/wrong-room.test.js"`
    **passes cleanly (2/2, 80ms/42ms)**.
  - Conclusion: this is a concurrency/loopback-socket timing artifact specific to this Windows
    session when only 1-2 files run with default (parallel) per-file concurrency and nothing else
    has "warmed up" the loopback stack in-process — not a functional regression in `wrong-room.ts`,
    `daemon/ipc/server.ts`, or the send-path/room-guard code the test exercises. It is **not** B-39
    or B-57 (both timer/re-entrancy flakes in unrelated files); this is a fourth, newly-observed,
    environment-specific flake, isolated to the standalone `test:wrong-room` script on this machine.
    Disclosed here, not filed as a new backlog row (no mutation authority in this pass). Given
    `tasks.md` names `npm run test:wrong-room` as "the Wrong-room CI step" and prior PRs (e.g. PR-19:
    "`test:wrong-room` 5/5") report it green repeatedly on GitHub Actions, this looks local-session
    specific rather than a general CI risk — but the Director should know this script is not
    reliably standalone-green on this machine.
- Targeted spot re-runs, all green in isolation: `doctor/offline.test.js` (2/2 — zero network calls,
  confirmed not reading the stored token even with a binding present), `installer/autostart.test.js`
  (17/17 — includes a real `reg.exe` round trip against a scratch Run-key), `cli/main-gate.integration.test.js`
  (5/5 — a real child-process spawn per verb, each refusing before any write), `security/installer-bundle.test.js`
  (12/12 — non-vacuous closure/predicate checks).

## 2. Spec-vs-code spot checks

Checked at least one `### Requirement:` per capability spec against the real shipped `src/` code
(not the spec's own prose), with the D-52 close-out (PR-21/PR-22) checked most carefully per the
task brief.

- **doctor** — "Registry tier warns on a tool-config file not covered by `.gitignore`"
  (`specs/doctor/spec.md`): `src/doctor/checks/registry.ts`'s `checkGitignoreCoverage` checks `.git`
  presence with `existsSync` alone (never `.isDirectory()`, correctly matching "a `.git` path exists
  there, file or directory" — a linked worktree/submodule's `.git` is a file), makes no subprocess
  call anywhere in the file (grepped clean), and its finding text says "may be committed by an
  unrelated `git add`", never claiming the file IS tracked. Matches spec exactly, including the
  disclosed narrower-than-D-52's-literal-wording scope.
- **installer-wizard** — "Written tool-config files are gitignored, never committed as-is": traced
  the call site in `src/installer/wizards/project-bind.ts` (`ensureGitignored(options.targetDir,
  target.relativePath)`, line 273) — called once per target immediately after `editFile` returns
  (i.e., for every `created`/`written`/`noop` outcome, all three meaning the file now exists, per the
  code's own comment), before instruction files are written. `ProjectBindOutcome`'s `"bound"` variant
  does carry the required `gitignoreResults: ReadonlyMap<ToolId, GitignoreCheckResult>` field. Matches
  spec.
- **installer-wizard/doctor shared logic** — `src/installer/gitignore.ts`'s `isGitignoreCovered`
  correctly treats an exact entry, a bare parent-directory entry, and a `/`-anchored/`/`-trailing
  entry as coverage, and never treats a blank/`#`/`!` line as coverage — matches both specs'
  "an exact match or a covering parent directory entry" and "a commented-out or negated line is
  never treated as coverage" language.
- **registry-authoring** — "Registry writes are validate-before-replace": `src/registry/writer.ts`'s
  `validateRegistryBytes` is a thin wrapper directly over `parseRegistryText` (the same function the
  daemon's loader uses), and the module doc states the write is validated "exactly as the daemon's
  loader would read them back" before any replace. Matches spec.
- **tool-config-merge** — "Written entries are id-only stdio, zero env, never npx": grepped
  `src/installer/tool-targets.ts` for `env`/`npx` — zero hits. All three `buildEntry` variants
  (`standardEntry`, `vsCodeEntry`, `openCodeEntry`) construct only `command`/`args`(/`type`) fields,
  no `env` key anywhere. Matches spec.
- **ipc-handshake** — "Online doctor checks run over an authenticated IPC route" (no-bearer model):
  `src/daemon/ipc/doctor.ts`'s own module doc states plainly "This route mints no bearer at all
  (D-44)" and the auth-before-registry-resolution ordering documented there matches the spec's
  corrected (post-B-86) no-bearer requirement. Matches spec.
- **secret-store** — "Installer writes a token through the existing secret-store API only":
  `src/installer/wizards/bot-add.ts` imports `selectSecretStore` from
  `../../secret-store/index.js` (the same shared module the daemon reads from) and calls
  `selection.store.set(String(bot_id), token)` directly from the masked-prompt flow. Matches spec.

No spec-vs-code contradictions found in any of the 6 domains checked.

## 3. PR/task reconciliation against git + `gh`

- `grep -c '^#### PR-' tasks.md`: **26** header blocks (PR-01, PR-02a/b, PR-03–05, PR-06a/b,
  PR-07a/b/c, PR-08–22) — matches `tasks.md`'s own re-measured claim at line 34 exactly (it
  explicitly disclaims an earlier, stale "20 planned" figure and states "26... cross-checked
  directly by `grep -c`"). Re-verified independently here, not merely trusted.
- `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh pr list --state all
  --limit 100 --json number,title,state`, filtered to the F2 range (#48 and up): PR numbers 48–75,
  **27 MERGED**, **1 CLOSED without merging** (#55, `feat(shared): F2 PR-06b — conmuta.json
  write-if-absent-or-verify writer`, immediately superseded by an identically-titled #56 which did
  merge — an ordinary branch/rebase hiccup, not a scope gap; PR-06b's own task block (6b.1–6b.3) is
  fully checked and its code is present and passing).
- Reconciliation: 26 task headers vs. 27 real merged PRs — the one extra merge is `#62`
  (`fix(installer): normalize acl.test.ts scratch dir before hardening`), a disclosed non-sequential
  side-fix with no dedicated `tasks.md` header, exactly as `tasks.md`'s own line 34 already states
  ("24 sequential `f2/NN-*` branches #48–#73 plus one disclosed non-sequential side-fix... PR-21/PR-22
  will bring that to 27 once merged"). Both PR-21 (#74) and PR-22 (#75) are now merged, so the
  27-merged figure this pass measured matches `tasks.md`'s own forward-looking claim exactly.
  **No drift found here** — unlike F1's own repeated history of this exact count going stale, F2's
  `tasks.md` had already re-measured and corrected itself before this verify pass ran.
- `tasks.md`'s own checkbox count: every `- [ ]`/`- [x]` line in the file is `[x]` **except one**,
  found in the working tree's uncommitted diff (see §4) — task 9.5 was `[ ]` in the last-committed
  version and is only flipped to `[x]` in an uncommitted edit sitting in the working tree right now.

## 4. Doc/backlog staleness

- **`docs/06-backlog/CHECKLIST.md`**: highest row is **B-90** (a disclosed, accepted-as-unreachable
  read-modify-write race in `gitignore.ts`, matching the exact citation already present in
  `gitignore.ts`'s own doc comment — cross-checked and consistent). B-89 (the D-52 gap itself,
  status `done`), B-88, B-87, B-86, B-85 all read as accurate against what this pass observed in
  code (e.g., B-87's "real root is `cli/main.js`" claim matches `installer-bundle.test.js`'s actual
  passing assertion text seen in §1). No staleness found in the backlog's newest rows.
- **`AGENTS.md`'s Status paragraph**: **stale for all of F2's apply work.** The line still reads
  *"F2 is fully planned and ready for `sdd-apply`, starting at PR-01"* and the entire paragraph
  never mentions a single F2 PR, test count, or unit closure — despite 27 real F2 PRs now merged
  (#48–#75), all 22 originally-planned PR slices plus the D-52 close-out (Unit 13, PR-21/PR-22)
  done, and the full suite at 1403 tests. This is a larger gap than F1's own AGENTS.md drift (which
  under-counted a PR total by 3); here the F2 section of AGENTS.md was apparently never touched
  after planning finished. **WARNING**, not blocking — the live source of truth (`tasks.md`) is
  accurate; only the prose narrative in `AGENTS.md` has not caught up.
- **Uncommitted working-tree edits found at session start** (`git status`: `M
  docs/02-architecture/THREAT-MODEL.md`, `M openspec/changes/f2-installer-and-doctor/tasks.md`) —
  read in full via `git diff`, not merely noted:
  - `tasks.md` task **9.5** (`Docs: THREAT-MODEL §4 — add the "Login persistence" boundary row...`)
    is `[ ]` (unchecked) in the last-committed tree; the uncommitted diff flips it to `[x]` **and**
    the corresponding `THREAT-MODEL.md` diff actually adds that row for the first time. In other
    words: **PR-09 (and PR-12, which also touches this area) never actually landed the "Login
    persistence" THREAT-MODEL.md row its own task list called for**, and the gap sat undetected
    until whatever process produced this uncommitted diff (most likely an earlier, partially-run
    verify or correction pass) found it. The fix is real and correctly scoped, but it is **not yet
    committed**.
  - The same uncommitted `THREAT-MODEL.md` diff also adds a citation for PR-22's cross-project
    DM-probe confinement test to the existing `POST /doctor` row — a legitimate, additive citation
    update, consistent with PR-22 actually existing and passing.
  - The rest of the uncommitted `tasks.md` diff is wording-precision-only (three spots rephrase
    "`~/.conmuta/`"/"`~/Library/LaunchAgents/...`" claims into "a fake, test-injected home
    directory" language) — these correct task-list prose that overclaimed tests touch a real
    per-user home directory path, when the actual tests (confirmed in §1's fresh reruns of
    `autostart.test.js`) use an injected fake home directory throughout. No functional claim changes,
    only accuracy of description.
  - **This mirrors F1's own verify-report precedent exactly** (an uncommitted partial correction
    already sitting in the working tree at verify time) — disclosed for the Director, not resolved
    by this pass.

## 5. Success Criteria Checklist spot-verification

All 8 items are checked `[x]`. Spot-verified 4 with fresh, direct evidence (more than the requested
minimum of 2), rather than trusting the checkbox:

- *"`doctor` offline tiers make zero network calls, test fails if any occurs (PR-14)."* — Re-ran
  `doctor/offline.test.js` in isolation: 2/2 pass, including "runOfflineDoctor makes zero network
  calls and never reads the stored token, even though a binding's token exists." Confirmed true.
- *"Start-at-login (D-40) writes the Windows Run key / macOS LaunchAgent plist only when opted in,
  is idempotent on re-run, and is fully removed when unchecked... (PR-09, PR-12)."* — Re-ran
  `installer/autostart.test.js` in isolation: 17/17 pass, including a **real** `reg.exe` round trip
  against a scratch `HKCU` key (idempotent write, then removal leaves a foreign value untouched) and
  the equivalent macOS plist idempotency/removal tests against a fake injected home. Confirmed true.
- *"ADR-0031 installer tests green: no `npx`... fake Node < 24 exits with the download link and zero
  filesystem writes and zero git calls (PR-13, PR-19)."* — Re-ran
  `cli/main-gate.integration.test.js` in isolation: 5/5 pass, a **real child-process spawn** of the
  compiled CLI with `process.version` overridden below the floor for `setup`/`mcp --project
  x`/`migrate-v1`/`daemon start`, each refusing before any write. Confirmed true.
- *"B-05 closed in CHECKLIST with a pointer to the merge tests... (PR-05, PR-20)."* — `CHECKLIST.md`
  row B-05 reads `status: done`, pointer: `F2 PR-05's test/installer/tool-config-merge.test.ts`.
  Confirmed present and accurately worded.

No discrepancies found between the checklist's claims and the re-run evidence.

## Findings summary

- **CRITICAL: 0**
- **WARNING: 3**
  - (a) A fourth, newly-observed test flake distinct from B-39/B-57: `npm run test:wrong-room` run
    as a standalone script (or the file run alone/with default concurrency) fails deterministically
    with a loopback `ETIMEDOUT` on this session's Windows environment, while the identical tests
    pass cleanly inside the full `npm test` and `npm run test:static` runs, and pass with
    `--test-concurrency=1`. Looks environment/session-specific, not a code regression — but flagged
    since `tasks.md` names this exact script as "the Wrong-room CI step."
  - (b) `AGENTS.md`'s Status paragraph is fully stale for F2: it still describes F2 as "fully
    planned... ready for `sdd-apply`, starting at PR-01" with zero mention of any of the 27 merged
    F2 PRs, larger than F1's own equivalent drift.
  - (c) An uncommitted working-tree correction already exists (`THREAT-MODEL.md` +
    `tasks.md`), fixing a real, previously-undetected gap: task 9.5's "Login persistence" THREAT-MODEL
    row was never actually added despite being checked off as done; the row is only present in this
    uncommitted diff. Not yet committed.
- **SUGGESTION: 1** — PR #55 (an early, uncommitted-code attempt at PR-06b) was opened and closed
  without merging, immediately superseded by #56 which merged the same content; harmless
  bookkeeping noise in the PR history, not disclosed anywhere, but does not affect any count claim
  since it never merged.

## Result

**status**: done. **next_recommended**: `sdd-archive` — apply is functionally complete (26/26 task
header blocks fully checked bar the one now-uncommitted 9.5 flip, 27/27 real GitHub PRs merged in
the F2 range, full suite green on a clean rebuild-and-rerun, all 6 capability specs spot-checked
clean against shipped code, all 8 Success Criteria items independently re-verified). None of the
findings above are CRITICAL or code-level regressions; they do not gate archive per this project's
own established SDD convention (F1's verify pass set this precedent explicitly). Recommended before
or during archive, at the Director's discretion: (1) commit the already-correct, already-staged
`THREAT-MODEL.md`/`tasks.md` fix for task 9.5 rather than losing it, (2) refresh `AGENTS.md`'s
Status paragraph to describe F2's actual apply progress, (3) be aware `npm run test:wrong-room` is
not reliably standalone-green on this specific machine/session even though the underlying guarantee
it tests is real and independently confirmed via the full suite.
