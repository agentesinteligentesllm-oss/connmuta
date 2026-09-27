# Tasks: F2 — Installer, requirements validator, tool config, binding, doctor

| Field | Value |
|---|---|
| Change | `f2-installer-and-doctor` |
| Inputs | `proposal.md` (D-31..D-52, locked); `design.md` (§1 approach, §2 layout, §3 constants, §4 edit engine, §5 registry authoring, §6 token intake, §7 tool configs, §8 CLI/wizards, §9 doctor, §10 autostart, §11 ACL, §12 static assertions, §13 testing, §15 decisions D-41..D-52, §16 risks, §17 build order); `specs/README.md` (25 requirements / 52 scenarios across 6 capability specs) |
| Delivery strategy | `auto-chain`. `Decision needed before apply: No` — design left no ambiguity that blocks the first slice; every D-31..D-52 decision is locked |
| Chain strategy | `stacked-to-main`, following F1's own established convention (`f1-daemon-registry-thin-client/tasks.md`). Each PR targets `main` in sequence; PR N+1 branches from PR N's branch and is retargeted to `main` after PR N merges |
| TDD rule | Strict TDD (CONSTITUTION §5–6, GOVERNANCE §6). Red before green. Every `src/**/*.ts` has a `test/**/<same>.test.ts` twin (`test/twins.test.ts` already enforces this from F1). RED tasks precede the GREEN task that creates the `src` file they test |
| PR budget | 400 authored changed lines (additions + deletions) per PR, per SDD preflight (`review_budget_lines: 400`). Design §17's own rows 8 and 16 (~450 each) are pre-split at the tasks phase into two PRs each (PR-08/PR-09 and PR-17/PR-18) rather than carried as a disclosed overage — the same discipline F1 used before apply-time re-slicing became necessary. Every PR below plans at or under 400 lines |
| Own-slice rule (D-39, amended D-48) | Merged-file edits are isolated, never bundled with unrelated new capability code: `src/cli/main.ts` dispatch is its own PR (PR-13); `src/shared/ipc-contract.ts` + `src/daemon/telegram.ts` are one dedicated PR (PR-16); `src/daemon/bootstrap.ts` wiring is a separate dedicated PR (PR-18) — see the disclosed split note before PR-16 |
| Rollback (default, all PRs) | Revert the PR (`git revert`). Every file this change writes has a pre-edit backup sibling (D-36); restoring it reverts the edit. F1's daemon keeps working throughout because `registry.json` stays hand-editable and the wire is unchanged |
| Verify (base commands) | Build: `npm run build` (`tsc -b`). Full suite: `npm test`. Static suite: `npm run test:static`. Wrong-room CI step: `npm run test:wrong-room`. Focused: `node --test "dist/test/<glob>"` after `npm run build` — glob named per PR below |
| Documentation per PR | Every PR whose Requirements line names a PT id or D-decision updates the relevant cell in `docs/02-architecture/THREAT-MODEL.md` §4/§5.5/§5.6 in the same PR, following F1's own precedent (`bus-v2-f1-tasks-001` item 5). PR-20 remains the close-out for OVERVIEW/DATA-MODEL/CHECKLIST |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ≈5,900 authored lines (design §17 total ≈5,850; +50 from splitting rows 8 and 16 into two PRs each rather than one over-budget PR) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 20 PR slices, PR-01 → PR-20, following design §17's unit order with rows 8 and 16 pre-split |
| Delivery strategy | `auto-chain` |
| Chain strategy | `stacked-to-main` |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

- Total PR slices: 20 (design §17 planned 18; PR-08/PR-09 replace design row 8's single ~450-line slice, and PR-17/PR-18 replace design row 16's single ~450-line slice — both splits disclosed below, at the existing file/module boundary in each case, not an artificial cut).
- No `size:exception` slice is planned upfront — unlike F1, F2 vendors no whole v1 file AS-IS; every line here is new or edited code.
- Largest planned slices: PR-11 (`roster-source.ts` + `bot-add.ts` + `group-add.ts` wizards, ≈400) and PR-14 (`doctor/{main,offline,report}.ts` + system-tier checks, ≈400) — both at the budget line exactly; `sdd-apply` should re-measure the real diff before opening either and re-slice at a file boundary if it exceeds 400, per F1's own repeated apply-time lesson (PR-01, PR-06, PR-08, PR-09, PR-22, PR-40 all grew past their estimate).
- Given every individual PR here is a first-time estimate (no real F1-style v1 line count to anchor it against, since F2 is new code, not vendored), expect the same estimate-to-actual growth F1 saw (named-constant doc comments plus Strict TDD twins routinely added 30–60%). `auto-chain` already covers the response: re-slice at a file boundary rather than request an exception, unless the module is genuinely cohesive (F1's PR-05 precedent).

### Suggested Work Units

Each `#### PR-XX` block below states its own Branch/Depends/Size/Scope/Requirements/Runtime-harness line and closes with a `Verify:` task naming the focused test command; the Rollback boundary is the uniform one stated above (revert the PR). This mirrors F1's own tasks.md convention rather than a separate summary table.

## PR Slices

Each PR below follows design §17's build order — dependencies → edit engine → tool-config matrix → registry/project-file authoring → exec/ACL/autostart → wizards → CLI dispatch (own slice) → doctor offline → IPC contract/telegram (own slice) → doctor online (own slice, split further at the bootstrap.ts boundary) → static assertions/integration → documentation — with design's rows 8 and 16 pre-split to stay under the 400-line budget.

### Unit 1 — Dependencies and constants

#### PR-01 — Dependencies + `installer/constants.ts`
Branch `f2/01-deps-constants` → `main`. Depends: none (first PR). Size: ≈150 lines, no exception.
Scope: `package.json`, `npm-shrinkwrap.json`, `src/installer/constants.ts`, `test/installer/constants.test.ts`.
Requirements: underlies every capability; design §3's ten named constants (`MCP_SERVER_NAME`, `EXIT_INSTALLER_REFUSED`, `EXIT_DOCTOR_FAILED`, `INSTALLER_LEDGER_BUSY_TIMEOUT_MS`, `BACKUP_SUFFIX_PREFIX`, `JSON_DEFAULT_INDENT`, `AGENTS_MD_MAX_LINES`, `AUTOSTART_RUN_KEY`, `AUTOSTART_VALUE_NAME`, `AUTOSTART_LAUNCHD_LABEL`, `DOCTOR_PROOF_LABEL`, `REGISTRY_REPLACE_ATTEMPTS`) each with the reasoning design already gives.
Runtime harness: N/A — dependency pins and unit test over exported constants.

- [x] 1.1 Add exact-pinned `@clack/prompts`, `jsonc-parser`, `smol-toml` to `package.json`/`npm-shrinkwrap.json` (design §2.3; never ranges).
- [x] 1.2 RED: write a throwaway import-smoke test exercising `jsonc-parser`'s `modify`/`applyEdits` as named ESM imports from the built `dist` (design §16 risk: UMD/ESM `exports` map may fail named imports); if it fails, fall back to a default import and record the fallback here before continuing. No fallback needed — named ESM imports resolved on the first try (`test/installer/jsonc-smoke.test.ts`).
- [x] 1.3 RED: write `test/installer/constants.test.ts` asserting every constant in design §3 plus a collision check against no `shared/constants.ts` `EXIT_*` value.
- [x] 1.4 GREEN: implement `src/installer/constants.ts` with each constant carrying its design §3 reasoning as a doc comment (named-constant rule).
- [x] 1.5 Verify: `npm run build && node --test "dist/test/installer/constants.test.js"`.

### Unit 2 — Edit engine (D-32, D-36, D-45)

**Design estimated ≈380 authored lines for the core pipeline + JSONC adapter in one slice; the real
measured diff at apply time was 753 lines (343+211 for the pipeline+twin, 72+127 for the JSONC
adapter+twin) — apply-time re-sliced here at the file-edit.ts vs. formats/jsonc.ts boundary, the
same existing module split PR-03 already uses for toml/markdown. The seven-step pipeline itself
(file-edit.ts, 343 lines + its 211-line test twin = 554) has no further clean split without breaking
either Strict TDD's twin-file coherence or the pipeline's own single-module contract (design §4.1
describes it as one interdependent seven-step sequence) — carried as a disclosed, PR-scoped
exception, following F1's own PR-05 precedent for a genuinely cohesive module.**

#### PR-02a — `file-edit.ts` core pipeline
Branch `f2/02a-file-edit-core` → `main`. Depends: PR-01. Size: 554 lines, **disclosed PR-scoped
exception** (154 lines over the 400 budget; see re-slice note above).
Scope: `src/installer/file-edit.ts`, `test/installer/file-edit.test.ts`, `docs/02-architecture/THREAT-MODEL.md` (§4.1 row).
Requirements: `tool-config-merge › Merge is refuse-and-diff on ambiguity`; `tool-config-merge › Every merge takes a pre-edit backup and preserves surrounding bytes`. Threat matrix: Filesystem writes outside the home (Applicable).
Runtime harness: unit tests over temp-dir fixtures; no daemon/client process.

- [x] 2a.1 RED: `test/installer/file-edit.test.ts` — symlink target refused (step 1), symlinked parent refused, absent file creates parents with no backup, present-with-parse-error refuses with position, same-named identical entry is a no-op, same-named different entry refuses with a diff, pre-existing backup name collision is handled (`COPYFILE_EXCL` + `BACKUP_SUFFIX_PREFIX` second-resolution timestamp).
- [x] 2a.2 GREEN: implement `installer/file-edit.ts`'s seven-step pipeline (design §4.1): lstat/symlink refusal, create-if-absent, strict parse dispatch, same-named-entry check, backup, temp+rename write, readback+re-parse semantic-delta assertion; restore-from-backup on step-7 failure. Exposes a `FormatAdapter` interface for the per-format dispatch PR-02b/PR-03 plug into.
- [x] 2a.3 Docs: THREAT-MODEL §4 — add the "Filesystem writes outside the home" row (did not exist before this slice), pinned to `file-edit.test.ts`.
- [x] 2a.4 Verify: `npm run build && node --test "dist/test/installer/file-edit.test.js"`.
- [x] 2a.5 Alpha audit fix (`bus-v2-f2-pr-02a-diff-audit-001`): step 1's symlink check was gated on `existsSync`, which follows links and reports a dangling symlink's target as absent, letting a broken link bypass the refusal and fall through to step 2 — replaced with an `lstatSync`-based `isSymlink` helper (ENOENT only means "not a symlink"), pinned by a new dangling-symlink test. Step 7's restore-from-backup and remove-on-created-failure branches had zero test coverage — added two tests using a corrupting adapter that fails to re-parse its own written output.

#### PR-02b — `formats/jsonc.ts`
Branch `f2/02b-jsonc-format` → `main`. Depends: PR-02a. Size: 199 lines, no exception.
Scope: `src/installer/formats/jsonc.ts`, `test/installer/formats/jsonc.test.ts`.
Requirements: `tool-config-merge › Strict per-format parse` (JSONC scenarios).
Runtime harness: unit tests over temp-dir fixtures; no daemon/client process.

- [x] 2b.1 RED: `test/installer/formats/jsonc.test.ts` — comments/trailing commas parse cleanly; `modify`+`applyEdits` produces exactly one localized insertion; EOL/indent learned from the first indented line, `JSON_DEFAULT_INDENT` only when none exists; a parse error refuses without writing.
- [x] 2b.2 GREEN: implement `installer/formats/jsonc.ts` (design §4.2 JSON/JSONC row) wired into `file-edit.ts`'s `FormatAdapter` dispatch (PR-02a).
- [x] 2b.3 Verify: `npm run build && node --test "dist/test/installer/formats/jsonc.test.js"`.

#### PR-03 — `formats/toml.ts` + `formats/markdown.ts`
Branch `f2/03-toml-markdown` → `main`. Depends: PR-02b. Size: ≈350 lines, no exception.
Scope: `src/installer/formats/toml.ts`, `src/installer/formats/markdown.ts`, `test/installer/formats/toml.test.ts`, `test/installer/formats/markdown.test.ts`.
Requirements: `tool-config-merge › Strict per-format parse` (TOML scenarios); `tool-config-merge › Merge is refuse-and-diff on ambiguity`; `installer-wizard › Instruction files are written once and trust steps are printed, never bypassed`.
Runtime harness: unit tests over temp-dir fixtures.

- [x] 3.1 RED: `test/installer/formats/toml.test.ts` — append-only append of `stringify({ mcp_servers: { [MCP_SERVER_NAME]: entry } })`; every original byte is a prefix of the result; an existing sibling `[mcp_servers.<other-tool>]` table survives untouched; an inline `mcp_servers = {…}` produces a re-parse delta mismatch refused by `file-edit.ts` step 7, while a conflicting dotted key at the exact entry path is instead caught earlier by step 4's generic same-named-entry check (native review finding, `bus-v2-f2-pr-03-diff-audit-001`: the original wording implied both shapes reached step 7).
- [x] 3.2 GREEN: implement `installer/formats/toml.ts` (design §4.2 TOML row) wired into the dispatch.
- [x] 3.3 RED: `test/installer/formats/markdown.test.ts` — `AGENTS.md` absent ⇒ template written, ≤ `AGENTS_MD_MAX_LINES` lines; present ⇒ delimited block append, identical block is a no-op, different block refuses with a diff; `CLAUDE.md` absent ⇒ `@AGENTS.md`, present without that line ⇒ line appended.
- [x] 3.4 GREEN: implement `installer/formats/markdown.ts` (design §4.2 Markdown row).
- [x] 3.5 Verify: `npm run build && node --test "dist/test/installer/formats/toml.test.js" "dist/test/installer/formats/markdown.test.js"`.

### Unit 3 — Tool-config matrix (D-33, D-34, D-42, D-43)

#### PR-04 — `tool-targets.ts` + `launcher.ts`
Branch `f2/04-tool-targets-launcher` → `main`. Depends: PR-03. Size: ≈300 lines, no exception.
Scope: `src/installer/tool-targets.ts`, `src/installer/launcher.ts`, `test/installer/tool-targets.test.ts`, `test/installer/launcher.test.ts`.
Requirements: `tool-config-merge › Written entries are id-only stdio, zero env, never npx`; `› VS Code's differently-named key is used`; `› .mcp.json is treated as a shared surface across readers` (D-43 Pi rule); `› OpenCode config is written only at the project level`.
Runtime harness: unit tests; no process spawn (only argv/entry construction is under test here).

- [x] 4.1 RED: `test/installer/launcher.test.ts` — `command = realpathSync(process.execPath)`, `args = [<abs dist/src/cli/main.js>, "mcp", "--project", <id>]`, zero `env` (D-42).
- [x] 4.2 GREEN: implement `installer/launcher.ts`.
- [x] 4.3 RED: `test/installer/tool-targets.test.ts` — entry shape per the 8-row matrix (§7.2): `mcpServers`/`servers`/`mcp` container per surface, `opencode.json`'s array-form `command`; never `npx`, `enableAllProjectMcpServers`, Codex `trust_level`, or any global-file target; Pi dedup rule (D-43): writing `.pi/mcp.json` skipped when Claude Code is selected in the same run or `.mcp.json` already holds an identical entry, and `.pi/mcp.json` selected otherwise; Pi's global `~/.pi/agent/mcp.json` never a target; OpenCode never targets a global path.
- [x] 4.4 GREEN: implement `installer/tool-targets.ts` (the 8-row matrix + entry builder + D-43 Pi rule).
- [x] 4.5 Verify: `npm run build && node --test "dist/test/installer/tool-targets.test.js" "dist/test/installer/launcher.test.js"`.

#### PR-05 — 8×3 merge fixtures + B-05 closure integration test
Branch `f2/05-tool-config-fixtures` → `main`. Depends: PR-04. Size: ≈350 lines, no exception.
Scope: `test/fixtures/tool-configs/<tool>/{populated,conflict,malformed}.*` (8 tools × 3 fixtures), `test/installer/tool-config-merge.test.ts`.
Requirements: `tool-config-merge › Strict per-format parse` (fail-closed scenario); `› Merge is refuse-and-diff on ambiguity` (all 8 surfaces); `› Every merge takes a pre-edit backup and preserves surrounding bytes` (all 8 surfaces); D-31 (B-05 closes here).
Runtime harness: integration test over the built `file-edit.js`/`formats/*.js`/`tool-targets.js` against real fixture files in a temp dir per surface.

- [x] 5.1 Author `populated` fixtures for the 8 surfaces: an unrelated MCP entry, non-MCP keys, `//`/`/* */` comments where the format allows, CRLF for at least one JSON fixture (D-31 Alpha condition: never an empty object).
- [x] 5.2 Author `conflict` fixtures: a same-named entry under `MCP_SERVER_NAME` with a different `command`/table than the one the merge would write.
- [x] 5.3 Author `malformed` fixtures: a syntax error under each format's parser.
- [x] 5.4 RED then GREEN (per surface, 8 cases each): `test/installer/tool-config-merge.test.ts` — `populated` merges with byte-for-byte preservation outside the inserted range and a `*.bak-pre-v2-<date>` backup present; `conflict` refuses with a diff and no write; `malformed` refuses as a parse error and no write.
- [x] 5.5 RED then GREEN: identical same-named entry on a second run is a no-op (idempotent re-run), not a refusal.
- [x] 5.6 Verify: `npm run build && node --test "dist/test/installer/tool-config-merge.test.js"`.
- [x] 5.7 Backlog: close B-05 pointer to this test file (final CHECKLIST.md edit deferred to PR-20's close-out, per F1's own single-close-out convention — not made in this PR).

### Unit 4 — Registry and project-file authoring (D-35, D-41)

**Design estimated ≈350 authored lines for both writers in one slice; the real measured diff at apply
time was 593 lines (136+168 for the registry writer+twin, 143+146 for the project-file writer+twin)
— re-sliced here at the existing `registry/writer.ts` vs. `shared/project-file-writer.ts` module
boundary (the two modules share no code and address two entirely different files, `registry.json`
vs. `conmuta.json`), the same pattern PR-02's re-slice already used.**

#### PR-06a — `registry/writer.ts`
Branch `f2/06a-registry-writer` → `main`. Depends: PR-05. Size: 304 lines, no exception.
Scope: `src/registry/writer.ts`, `test/registry/writer.test.ts`.
Requirements: `registry-authoring › Registry writes are validate-before-replace`.
Runtime harness: unit tests over temp-dir registry files; reuses the existing `parseRegistryText` from F1.

- [x] 6a.1 RED: `test/registry/writer.test.ts` — a valid change replaces the file atomically after passing schema + R1-R3 (via `parseRegistryText`); a change that would fail R1 leaves the on-disk file byte-identical and makes no partial write; `REGISTRY_REPLACE_ATTEMPTS` bounded retry on a rename failure then refuses, original intact (no backup concept here, unlike `installer/file-edit.ts` — refusing simply means never renaming over the original); a `writeTemp` failure returns a typed `replace-failed` outcome instead of throwing raw (native review fix, `review-b3c7a8a705121e52`).
- [x] 6a.2 GREEN: implement `registry/writer.ts` (`serializeRegistry`, `validateRegistryBytes`, `replaceRegistryFile`), pure of the ledger. `REGISTRY_REPLACE_ATTEMPTS` is a disclosed, exported duplicate of `installer/constants.ts`'s value (design §2.2's compile-unit table forbids the reverse import), pinned equal by its own test.
- [x] 6a.3 Verify: `npm run build && node --test "dist/test/registry/writer.test.js"`.

#### PR-06b — `shared/project-file-writer.ts`
Branch `f2/06b-project-file-writer` → `main`. Depends: PR-06a. Size: 289 lines, no exception.
Scope: `src/shared/project-file-writer.ts`, `test/shared/project-file-writer.test.ts`.
Requirements: `registry-authoring › conmuta.json writer writes identifiers only, write-if-absent or verify`.
Runtime harness: unit tests over temp-dir project files; reuses the existing `parseProjectFile` from F1.

- [x] 6b.1 RED: `test/shared/project-file-writer.test.ts` — absent file writes identifiers-only (`schema_version`, `project_id`, `group_id`, `roster`); an existing file matching the intended binding (including a differently-ordered roster) is left untouched and reported as already correct; an existing file disagreeing with the intended binding is refused, naming the disagreement, with no overwrite; an unparseable existing file is refused as `"unparseable"`, never overwritten.
- [x] 6b.2 GREEN: implement `shared/project-file-writer.ts` (`serializeProjectFile`, `verifyProjectFileMatches`, `writeProjectFile`), reusing `parseProjectFile`. Write-if-absent uses an exclusive (`wx`) write rather than an `exists()`-then-`write()` pair, closing a TOCTOU gap a native review found (`review-b3c7a8a705121e52`): a file created by another process between the check and the write would otherwise be silently overwritten.
- [x] 6b.3 Verify: `npm run build && node --test "dist/test/shared/project-file-writer.test.js"`.

**Design estimated ≈350 authored lines for all three modules in one slice; the real measured diff at
apply time was 694 lines (81+109 ledger-access+twin, 158+235 registry-commit+twin, 38+62 token-ref
+twin, +11 a `tsconfig.json` project-reference edit) — re-sliced here at the three modules' own
natural boundaries (tasks.md's own 7.1-7.2/7.3-7.4/7.5 grouping), confirmed independent of each other
(no import between `registry-commit.ts`, `ledger-access.ts` or `token-ref.ts` — each is wired
together only by a later caller, D-41).**

#### PR-07a — `ledger-access.ts`
Branch `f2/07a-ledger-access` → `main`. Depends: PR-06b. Size: 190 lines, no exception.
Scope: `src/installer/ledger-access.ts`, `test/installer/ledger-access.test.ts`.
Requirements: underlies `installer-wizard › group add`/`project bind` writes (D-41).
Runtime harness: unit tests against a real `node:sqlite` file per D-41's evidence.

- [x] 7a.1 RED: `test/installer/ledger-access.test.ts` — ledger absent ⇒ delegates to the daemon's `openLedger` (design §5.1, "only `setup` reaches this"), creating and migrating a fresh file to `LEDGER_SCHEMA_VERSION`; present ⇒ opens directly with `PRAGMA busy_timeout = INSTALLER_LEDGER_BUSY_TIMEOUT_MS`; a `user_version` mismatch (older or newer) refuses with `reason: "version_mismatch"`; the installer never migrates or quarantines an existing file.
- [x] 7a.2 GREEN: implement `installer/ledger-access.ts` (`openInstallerLedger` — named to avoid colliding with the daemon's own exported `openLedger`).
- [x] 7a.3 Verify: `npm run build && node --test "dist/test/installer/ledger-access.test.js"`.

#### PR-07b — `registry-commit.ts`
Branch `f2/07b-registry-commit` → `main`. Depends: PR-07a. Size: 393 lines, no exception.
Scope: `src/installer/registry-commit.ts`, `test/installer/registry-commit.test.ts`.
Requirements: `registry-authoring › Every registry write is accompanied by an audit row`.
Runtime harness: unit tests with a real `node:sqlite` ledger file per D-41's evidence.

- [x] 7b.1 RED: `test/installer/registry-commit.test.ts` — a successful write (`REGISTRY_CREATED`/`BOT_ADDED`/`GROUP_ADDED`/`PROJECT_BOUND`) commits exactly one audit row (`direction: "system"`, `outcome: "ok"`, `client_id: null`) inside the same `BEGIN IMMEDIATE` transaction as the registry rename; a refused change (fails validate-before-replace, decided before any transaction opens) produces no audit row and no registry write; a throw after a landed rename but before `COMMIT` rolls the row back and restores the pre-call bytes; two concurrent commits serialize on the immediate lock.
- [x] 7b.2 GREEN: implement `installer/registry-commit.ts` (`commitRegistryChange`; D-41: direct `appendAuditRow` + a self-contained single-attempt temp-write-then-rename inside one `withTransaction`, reusing only `registry/writer.ts`'s pure `serializeRegistry`/`validateRegistryBytes` pair — `replaceRegistryFile` itself is not reusable here since it never throws on a rename failure, and a transaction rollback needs a throw).
- [x] 7b.3 Verify: `npm run build && node --test "dist/test/installer/registry-commit.test.js"`.

#### PR-07c — `token-ref.ts`
Branch `f2/07c-token-ref` → `main`. Depends: PR-07b. Size: 100 lines, no exception.
Scope: `src/installer/token-ref.ts`, `test/installer/token-ref.test.ts`.
Requirements: `secret-store › Installer writes a token through the existing secret-store API only` (token-ref half).
Runtime harness: unit tests, no real secret store needed (pure function over a `SecretStoreSelection` value).

- [x] 7c.1 RED then GREEN: `test/installer/token-ref.test.ts` — `token-ref.ts` produces the same `token_ref` shape `migration/main.ts:82-89` uses privately (disclosed duplication; convergence is a backlog row, not a drive-by edit of a merged file), for both the keychain and file-fallback arms.
- [x] 7c.2 Verify: `npm run build && node --test "dist/test/installer/token-ref.test.js"`.

### Unit 5 — Exec, ACL, autostart (D-40, D-49, D-50)

**Design §17 row 8 estimated ≈450 authored lines for exec + ACL + autostart in one slice; split here at the exec/ACL vs. autostart module boundary to stay under the 400-line budget (PR-08 ≈220, PR-09 ≈250), rather than carry a disclosed overage into apply.**

#### PR-08 — `exec.ts` + `acl.ts`
Branch `f2/08-exec-acl` → `main`. Depends: PR-07c. Size: ≈220 lines, no exception.
Scope: `src/installer/exec.ts`, `src/installer/acl.ts`, `test/installer/exec.test.ts`, `test/installer/acl.test.ts`.
Requirements: `secret-store › Fallback file and daemon home are ACL'd` (idempotent re-run scenario). Threat matrix: Subprocess spawn (Applicable; the `icacls`/`reg` half).
Runtime harness: `installer/exec.test.ts` asserts argv shape only (no real subprocess); `acl.test.ts`'s Windows path runs a real scratch-directory `icacls` round trip in CI.

- [x] 8.1 RED: `test/installer/exec.test.ts` — the only `child_process` call site in the tree; `execFile` targets are `icacls.exe`/`reg.exe` under `SystemRoot\System32` by absolute path, `shell: false`, literal argv (no string-built command).
- [x] 8.2 GREEN: implement `installer/exec.ts` (the sole exec allow-list module, D-50).
- [x] 8.3 RED: `test/installer/acl.test.ts` — `icacls <home> /inheritance:r /grant:r "<user>:(OI)(CI)F"` (D-49, `(OI)(CI)` required); grantee list contains only the current user; POSIX mode `0700` (a **directory** mode — `0600` would remove the execute bit a directory needs to be traversable at all, a functional bug rather than a cosmetic deviation from this line's original literal text); re-running on an already-ACL'd path succeeds without duplicating or widening the grant (idempotent, proved by parsing `icacls`'s own ACE lines rather than substring-matching its raw output).
- [x] 8.4 GREEN: implement `installer/acl.ts` (Windows `icacls`, POSIX `chmod`).
- [x] 8.5 Verify: `npm run build && node --test "dist/test/installer/exec.test.js" "dist/test/installer/acl.test.js"`.
- [x] 8.6 Docs: THREAT-MODEL §5.5/§5.6 — pin the ACL and exec-allow-list rows to these test files.

#### PR-09 — `autostart.ts`
Branch `f2/09-autostart` → `main`. Depends: PR-08. Size: 625 lines as of the final commit (543 at the
original commit, +82 across two native-review fix rounds; `wc -l` on the two scoped files), **disclosed
PR-scoped exception** (225 lines over the 400 budget; design §10 estimated ≈250). Windows (Run-key via
`exec.ts`'s `runReg`)
and macOS (launchd plist via a dedicated write-with-backup routine) share one outcome vocabulary and
one platform-dispatching pair (`enableAutostart`/`disableAutostart`, the wizard's own single call
site, PR-12) — a real further split would cut the file mid-dispatch, same class of exception as F1's
PR-05 and this change's own PR-02a.
Scope: `src/installer/autostart.ts`, `test/installer/autostart.test.ts`.
Requirements: `installer-wizard › Start-at-login is opt-in, idempotent, and fully removable` (all 4 scenarios). Threat matrix: Subprocess spawn (the `reg.exe` half); Login persistence (Applicable).
Runtime harness: a `reg.exe` round trip against a **scratch** key `HKCU\Software\<PRODUCT_NAME>-test-<random>` (never the real Run key), deleted in `finally`, on `windows-latest` CI; the macOS plist path is a byte/template test only (design §16: macOS untestable here, deferred to F6/B-12).

- [x] 9.1 RED: `test/installer/autostart.test.ts` — Windows: opt-in write creates exactly one `AUTOSTART_VALUE_NAME` Run-key value and no service/Task Scheduler entry; re-running with the box checked leaves exactly one value (idempotent, `reg query` first); unchecking on a re-run removes only that value name, leaving a foreign value untouched.
- [x] 9.2 RED: same file — macOS: opt-in write creates exactly one plist at `~/Library/LaunchAgents/<AUTOSTART_LAUNCHD_LABEL>.plist` with `RunAtLoad: true` and no `KeepAlive`; idempotent re-run with identical content is a no-op; unchecking removes only a plist whose `Label` matches ours.
- [x] 9.3 GREEN: implement `installer/autostart.ts` (Windows via `installer/exec.ts`'s `reg.exe` site; macOS via a dedicated write-with-backup routine, XML-escaped paths — not `installer/file-edit.ts`'s generic `FormatAdapter` pipeline, whose same-named-entry conflict refusal is the opposite of the unconditional rewrite-with-backup design §10 requires for a plist this product fully owns).
- [x] 9.4 Verify: `npm run build && node --test "dist/test/installer/autostart.test.js"` (Windows leg on CI; macOS assertions run everywhere since they are pure byte/template checks).
- [ ] 9.5 Docs: THREAT-MODEL §4 — add the "Login persistence" boundary row pointing at this test file (design §"Threat matrix").

### Unit 6 — Wizards (D-37, D-38)

#### PR-10 — `prompter.ts` + `instructions.ts`
Branch `f2/10-prompter-instructions` → `main`. Depends: PR-09. Size: ≈350 lines, no exception.
Scope: `src/installer/prompter.ts`, `src/installer/instructions.ts`, `test/installer/prompter.test.ts`, `test/installer/instructions.test.ts`.
Requirements: `installer-wizard › Instruction files are written once and trust steps are printed, never bypassed`; underlies `bot add`'s masked-prompt requirement (D-37).
Runtime harness: unit tests with a scripted fake `Prompter` (no real `@clack/prompts` TTY interaction under test).

- [x] 10.1 RED: `test/installer/prompter.test.ts` — the `Prompter` port's `password()` masks input and refuses a non-TTY stdin; `text`/`select`/`multiselect`/`confirm`/`isCancel` are exposed through the port, not called directly from wizard code.
- [x] 10.2 GREEN: implement `installer/prompter.ts` (the `@clack/prompts` adapter behind the `Prompter` port).
- [x] 10.3 RED: `test/installer/instructions.test.ts` — the `AGENTS.md` template is at most `AGENTS_MD_MAX_LINES` lines; trust-step text is printed per selected tool and no auto-trust setting is ever written.
- [x] 10.4 GREEN: implement `installer/instructions.ts` (the `AGENTS.md` template + trust-step text; delegates the actual file write to PR-03's `formats/markdown.ts`).
- [x] 10.5 Verify: `npm run build && node --test "dist/test/installer/prompter.test.js" "dist/test/installer/instructions.test.js"`. **309 authored lines (95+86 src, 85+43 test), no exception.** Trust-step text covers only the 4 tools OVERVIEW.md:274 documents (`claude-code`/`codex-cli`/`gemini-cli`/`vscode`); `cursor`/`opencode`/`antigravity`/`pi` have no documented one-time trust step and are disclosed as omitted, not invented.

#### PR-11 — `roster-source.ts` + `bot-add.ts` + `group-add.ts` wizards
Branch `f2/11-bot-group-wizards` → `main`. Depends: PR-10. Size: ≈400 lines, no exception (at the budget line; re-measure at apply time).
Scope: `src/installer/roster-source.ts`, `src/installer/wizards/bot-add.ts`, `src/installer/wizards/group-add.ts`, three test twins.
Requirements: `installer-wizard › bot add records a bot without ever exposing its token` (both scenarios); `› group add refuses a group_id already bound` (both scenarios); `secret-store › Installer writes a token through the existing secret-store API only` (both scenarios).
Runtime harness: unit tests with an injected `fetchImpl` for `getMe` and a scripted `Prompter`; no real network call.

- [x] 11.1 RED: `test/installer/wizards/bot-add.test.ts` — masked prompt read once, never argv/env; `getMe` goes through the daemon's own `TelegramApiClient` class (`daemon/telegram.ts:249-312`, read-only reuse, no edit); success writes `bot:<bot_id>` to the secret store then `registry.bots`; the terminal transcript never displays the token; a `getMe` rejection reports the failure class only (no token literal, no token-shape match, no write).
- [x] 11.2 RED (redaction pin, D-37 §6 row 4): an injected `fetchImpl` that rejects with an `Error` whose message and stack embed the full `…/bot<token>/getMe` URL; captured stdout+stderr must not match the token-shape regex.
- [x] 11.3 GREEN: implement `installer/wizards/bot-add.ts` and the `secret-store.set(String(bot_id), token)`-before-registry-commit ordering (design §6: an orphan secret on a failed commit is idempotently overwritten by the next `bot add`).
- [x] 11.4 RED: `test/installer/wizards/group-add.test.ts` — a new `group_id` is recorded with its title; a `group_id` already referenced by an active binding is refused before any write.
- [x] 11.5 GREEN: implement `installer/wizards/group-add.ts`.
- [x] 11.6 RED then GREEN: `test/installer/roster-source.test.ts` — roster composed from an existing `conmuta.json` (verify path) or from the bot's own `unknown_senders` (read-only `SELECT`) plus manual entries, per design §8.2's disclosed divergence from OVERVIEW §10.2 (no group-level roster in the shipped schema).
- [x] 11.7 Verify: `npm run build && node --test "dist/test/installer/wizards/bot-add.test.js" "dist/test/installer/wizards/group-add.test.js" "dist/test/installer/roster-source.test.js"`. **811 authored lines (95+125+83 src, 139+248+121 test), a disclosed 411-line PR-scoped exception** — matches this change's established pattern of most PRs landing well over their estimate rather than cutting coverage. `roster-source.ts`'s `RosterCandidate` type deliberately diverges from `ProjectRosterEntry` (no `agent_id` for an `unknown_senders`-sourced candidate, since assigning one is `project bind`'s own later decision). `src/installer/tsconfig.json` gained a `../daemon` project reference so `bot-add.ts` can reuse `daemon/telegram.ts`'s `TelegramApiClient` directly (acyclic: `daemon` has no edge back to `installer`).

#### PR-12 — `setup.ts` + `project-bind.ts` wizards + `installer/cli.ts`
Branch `f2/12-setup-project-bind-cli` → `main`. Depends: PR-11. Size: ≈350 lines, no exception.
Scope: `src/installer/wizards/setup.ts`, `src/installer/wizards/project-bind.ts`, `src/installer/cli.ts`, three test twins.
Requirements: `installer-wizard › Home directory and empty registry scaffold before wizards run` (both scenarios); `› project bind enforces the bijective invariants before any write` (both scenarios); `› Instruction files are written once...` (writer call site); `› Start-at-login is opt-in...` (the `setup` checkbox call site; PR-09 owns the write itself).
Runtime harness: unit tests with a scripted `Prompter`, temp home dir, and the real registry/project-file writers from PR-06/PR-07 (no daemon process; `setup`/`project bind` never start one).

- [x] 12.1 RED: `test/installer/wizards/setup.test.ts` — first run scaffolds `~/.conmuta/` and an empty schema-valid `registry.json` before the first wizard prompt; a re-run against an existing registry with a binding makes no write to it; the start-at-login checkbox (unchecked by default) is offered and its answer is forwarded to `installer/autostart.ts` unmodified.
- [x] 12.2 GREEN: implement `installer/wizards/setup.ts` (gate → `ensureHomeDirs` → registry scaffold → ledger → `icacls` → autostart checkbox → optional chain into `bot add`/`group add`/`project bind` → offline doctor). **Sequencing correction, ratified by Alpha (`bus-v2-f2-pr-12-offline-doctor-sequencing-001`, `CONSENSUS`):** `doctor/offline.ts` does not exist until Unit 8, and design.md:47's compile-unit table makes `doctor` depend on `installer`, never the reverse, so `setup.ts` cannot import it without a circular project reference. Takes an injectable `runDoctor?: () => Promise<void> | void` hook instead, called last; a later `cli/main.ts` slice (which depends on both units) injects the real doctor runner. Interactive chaining into `bot add`/`group add`/`project bind` is deferred to that same later CLI-wiring slice — this task's own RED covers scaffold/re-run/checkbox-forwarding only.
- [x] 12.3 RED: `test/installer/wizards/project-bind.test.ts` — a bot/group/`agent_id` selection satisfying R1–R4 writes `conmuta.json` (identifiers only) and `registry.projects`/`registry.bindings`; a selection violating R1 (bot already actively bound) refuses citing R1 before any write; re-binding an already-bound project with a different binding is refused (no `unbind` verb in F2, per design §8.2's disclosed divergence).
- [x] 12.4 GREEN: implement `installer/wizards/project-bind.ts` (roster/tool-selection/agent_id assignment accepted pre-resolved, mirroring how PR-11's `bot-add.ts`/`group-add.ts` already deferred their own prompt UI; tool-config writes reuse PR-04's `tool-targets.ts` + PR-05's `file-edit.ts`; instruction files from PR-10's `instructions.ts`).
- [x] 12.5 RED then GREEN: `test/installer/cli.test.ts` — verb parsing (`setup | bot add | group add | project bind <path>`) dispatches to the right wizard; an unknown verb or malformed flag is reported without a partial write.
- [x] 12.6 Verify: `npm run build && node --test "dist/test/installer/wizards/setup.test.js" "dist/test/installer/wizards/project-bind.test.js" "dist/test/installer/cli.test.js"`. **1015 authored lines (145+266+65 src, 198+239+102 test), a disclosed 665-line PR-scoped exception** — the most complex slice in Unit 6, matching this change's established over-estimate pattern. `project_id` derivation (slugified directory basename, disambiguated on collision, reused on an idempotent re-run against the same `path`) is a disclosed implementation choice with no prior helper; R2's pre-check refuses on either `group_id` or `project_id` already active under a different binding, matching `registry/invariants.ts`'s own post-write reading. **Native review (`review-796e150183e289f6`) and Alpha (`bus-v2-f2-pr-12-audit-001`) independently found the identical CRITICAL bug** in `resolveProjectId`'s suffix-disambiguation loop (an infinite loop when a 41-char basename slug was already taken); corrected in commit `0a92e63` with a regression test, native review re-validated `approved`, Alpha's debate closed `CONSENSUS`. Thirteen further non-blocking findings disclosed as B-79.

### Unit 7 — CLI dispatch (own slice, D-39)

#### PR-13 — `src/cli/main.ts` dispatch edit
Branch `f2/13-cli-main-dispatch` → `main`. Depends: PR-12. Size: ≈150 lines; **412 actual, disclosed exception.** **Own slice per D-39/D-48 — no unrelated capability code in this PR.**
Scope: `src/cli/main.ts` (edit only), `test/cli/main.test.ts` (edit only), `src/cli/tsconfig.json` (edit only, disclosed 3rd file — a project-reference addition `tsc -b` requires for the new dynamic imports).
Requirements: `installer-wizard › Node-floor gate precedes every disk, git or autostart write` (all 3 scenarios — enforced centrally here, before every dynamic import, so `installer/cli.ts` and `doctor/main.ts` do not re-implement the gate).
Runtime harness: `enforceNodeFloor` spy plus `fs`-write and exec-port spies asserting zero calls when the fake Node reports below the floor (ADR-0031 integration scenario).

- [x] 13.1 RED: `test/cli/main.test.ts` — a new branch for `setup | bot | group | project | doctor` calls `enforceNodeFloor` as its literal first action, before flag parsing, before any dynamic import; a fake Node below the floor produces zero filesystem writes and zero git calls, and the reported failure is the Node-floor error even given a malformed flag; a fake Node below the floor with start-at-login selected makes no Run-key/LaunchAgent write. **`doctor` is not wired** — `src/doctor/main.ts` does not exist until Unit 8; deferred and disclosed (module comment + a pinning test asserting `"doctor"` never appears in `USAGE_LINES`), mirroring `installer/wizards/setup.ts`'s own `runDoctor` seam precedent (Alpha-ratified, `bus-v2-f2-pr-12-offline-doctor-sequencing-001`).
- [x] 13.2 RED: same file — the existing `daemon` branch accepts `start` beside `stop` (dynamic import of `client/run-state.js`'s `ensureDaemonRunning()`, already-audited D-01 spawn site, unchanged); `USAGE_LINES` gains **10** new lines (5 invocation-form + 5 description, not the estimated six — reconciled transparently, not padded).
- [x] 13.3 GREEN: edit `src/cli/main.ts` — new branches for `setup`/`bot`/`group`/`project`, gate-first, wiring real production dependencies (a real `Prompter`, an opened installer ledger) into `installer/cli.ts`'s `runInstallerCli`; `daemon start` wired to `ensureDaemonRunning()` (gated; `daemon stop` is not retrofitted with the gate, disclosed as out of this PR's own D-39/D-48 scope). `group add`'s id/title prompts and `project bind`'s bot/group/agent_id/tool-multiselect prompts — deferred by PR-11/PR-12's own wizards to "a later CLI-wiring slice" — are built here. **Disclosed simplification:** `project bind`'s roster is a single entry (the typed `agent_id` pointed at the selected bot's own identity), not a full multi-human roster composed via `roster-source.ts`; correct for a single-operator project, tracked as B-80 for a future multi-human roster UI. `src/cli/tsconfig.json` gained `../installer`/`../registry` project references (same precedented reason as its existing `../client`/`../migration` entries).
- [x] 13.4 Verify: `npm run build && node --test "dist/test/cli/main.test.js"`, then the full `npm test` (no regression in the existing `mcp`/`migrate-v1`/`validate`/`daemon stop` branches). **412 authored lines (304 src cli/main.ts + 7 src tsconfig.json + 101 test) against the ≈150 estimate, disclosed as a 262-line PR-scoped exception.** Full suite 1283/1283 (0 fail, 3 pre-existing skip). Confirmed no `~/.conmuta` was created by the test run.

### Unit 8 — Doctor offline (D-37, D-46)

#### PR-14 — `doctor/{main,offline,report}.ts` + system-tier checks
Branch `f2/14-doctor-offline-system` → `main`. Depends: PR-13. Size: ≈400 lines; **899 actual (343 src + 556 test), disclosed exception.**
Scope: `src/doctor/main.ts`, `src/doctor/offline.ts`, `src/doctor/report.ts`, `src/doctor/checks/system.ts`, four test twins, plus `src/doctor/tsconfig.json` (new compile unit) and the root `tsconfig.json`'s `references` array (disclosed, necessary 2 additional files — opens `src/doctor/` as this repo's newest compile unit).
Requirements: `doctor › Offline tiers make zero network calls` (both scenarios); `› Offline/system tier checks the machine, not the registry content` (the stale-lock scenario).
Runtime harness: the static half runs `test/security/installer-bundle.js` predicates (finalized in PR-19) against the built `doctor/offline.js` closure; the runtime half replaces `globalThis.fetch`/`http.request` with throwing spies whose call count must stay 0.

- [x] 14.1 RED: `test/doctor/checks/system.test.ts` — Node ≥ floor and the recorded node/script paths exist; home writable; stale `daemon.lock`/`spawn.lock` (dead pid) reported as a finding with no corrective action taken; ledger opens **read-only** with `quick_check`, never quarantines; ACL state read (`icacls`/mode, PT-19). **Scoping disclosure**: "recorded node/script paths" is read as "the current node interpreter and the built CLI entry point still resolve", not a re-read of every project's own stored `LauncherEntry` (registry-tier territory, a later PR).
- [x] 14.2 GREEN: implement `doctor/checks/system.ts`. Read-only ledger `quick_check` implemented directly against `node:sqlite`'s `DatabaseSync(path, {readOnly:true})` — deliberately never calls `ledger/open.ts`'s `openLedger` (the daemon's own create/migrate/quarantine sequence). ACL-read parsing (`aclTrustees`) is a disclosed small duplication of `test/installer/acl.test.ts`'s own private helper — `installer/acl.ts` exports no reusable read-side parser, only the write-side `hardenHomeAcl`.
- [x] 14.3 RED: `test/doctor/offline.test.ts` — the offline run executes with `fetch`/`http.request` spies whose call count must be 0 even when a binding exists and a token is stored; the offline tiers never call the secret store's read API for that token (proved via a call-counting wrapper AND a control assertion that the token is genuinely readable through the real store, so the zero count isn't just a broken fixture).
- [x] 14.4 GREEN: implement `doctor/offline.ts` (wires `checks/system.ts`; a marked seam awaits PR-15's `checks/registry.ts`; no import of `daemon/telegram.js`/`node:http`/`node:https`/`fetch(`, independently grepped clean). **The static bundle-scan half of the zero-network pin (`test/security/installer-bundle.test.ts`) is Unit 11's own task, not built here.**
- [x] 14.5 GREEN: implement `doctor/main.ts` (offline-tier dispatch only in this PR; `--online`/`--dm-probe` are Unit 10) and `doctor/report.ts` (finding formatting mirroring `cli/validate.ts`'s `{exitCode,out,err}` shape — `pass`/`warn` to `out`, `fail` to `err`; `redactTokenShapes` on every printed detail). `runDoctorMain`'s signature is shaped for two still-deferred wiring points: `installer/wizards/setup.ts`'s `runDoctor?` hook and `cli/main.ts`'s still-unwired `doctor` verb (PR-13's own disclosed deferral) — neither is wired in this PR.
- [x] 14.6 Verify: `npm run build && node --test "dist/test/doctor/checks/system.test.js" "dist/test/doctor/offline.test.js"`, plus `report.test.ts`/`main.test.ts` (the hard twin-file invariant requires a test for every new `src/` file). Full suite 1314/1314 (0 fail, 6 skip).
- [x] 14.7 Docs: THREAT-MODEL §4 — pin PT-19 (macOS/POSIX half already pinned in F1; this PR adds the Windows-`icacls`-via-`doctor` read path, citing `test/doctor/checks/system.test.ts`).

#### PR-15 — registry-tier checks
Branch `f2/15-doctor-registry-tier` → `main`. Depends: PR-14. Size: ≈350 lines; **628 actual (src+test across `registry.ts`+`registry.test.ts`+the `offline.ts`/`offline.test.ts`/`main.test.ts` wiring below), disclosed exception.**
Scope: `src/doctor/checks/registry.ts`, `test/doctor/checks/registry.test.ts`, plus wiring PR-14's own marked seam in `src/doctor/offline.ts` (closing Unit 8: `runOfflineDoctor` now calls both tiers), with the small resulting fixes to `test/doctor/offline.test.ts`/`test/doctor/main.test.ts` and `src/doctor/tsconfig.json` (a `../registry` reference).
Requirements: `doctor › Registry tier checks bijective invariants and the token-shape scan` (both scenarios); underlies `tool-config-merge` surfaces via the ".mcp.json readers/Pi duplicates" finding.
Runtime harness: unit test over `parseRegistryText` fixtures; zero network (folds into PR-14's offline closure/spy checks).

- [x] 15.1 RED: `test/doctor/checks/registry.test.ts` — R1–R4 re-run over `registry.json`; `forbidden_content` explained with the B-30 note (ordinary text such as `API_KEY=123` is refused by design, not a false positive); referential integrity (binding ids exist in `bots`/`groups`/`projects`, B-28); R4 checked per bound path; a token-shaped string in a reachable `conmuta.json` field is reported with the field named and the matched text never echoed. **Implementation choice**: the field-level token-shape scan reuses `shared/project-file.ts`'s own `parseProjectFile` result (its `forbidden_content` problems already walk every string field, value-free by construction) rather than a second `findTokenShapes` pass, which would be unreachable dead code once a document has already passed that same walk.
- [x] 15.2 RED: same file — installer-written config entries checked against the §7.2 shape table (by top-level key set, since the real `command`/`args` values depend on this machine's own paths, which doctor has no independent source of truth for); `.mcp.json` readers and Pi-duplicate detection (D-34/D-43) reported as findings, not silently ignored.
- [x] 15.3 GREEN: implement `doctor/checks/registry.ts`. Also wired PR-14's own marked `offline.ts` seam (`runOfflineDoctor` now runs both tiers) — closing Unit 8. **Consistency fix found while wiring**: an absent `registry.json` (setup never run) is now a `"pass"` ("not yet created (run setup)") finding, matching `checks/system.ts`'s own established convention for the ledger/home directory in the identical situation, not an unconditional `"fail"` — the pre-existing `offline.test.ts`/`main.test.ts` assertions (written against the system tier alone, PR-14) were updated to reflect both tiers now running together.
- [x] 15.4 Verify: `npm run build && node --test "dist/test/doctor/checks/registry.test.js"`, plus the now-passing `offline.test.js`/`main.test.js`. Full suite 1325/1325 (0 fail, 6 skip).
- [x] 15.5 Docs: THREAT-MODEL §4 — pinned PT-05's doctor half to `test/doctor/checks/registry.test.ts`.

### Unit 9 — IPC contract + telegram (own slice, D-39/D-48)

**D-39 (amended D-48) requires `shared/ipc-contract.ts` and `daemon/telegram.ts` to be edited outside any bundled new-capability PR. Design §17 already isolates them as row 15; kept as one dedicated PR here since both are additive-only (new route types/schemas; a new method on an existing class) with no dependency on the not-yet-existing `daemon/ipc/doctor.ts`.**

#### PR-16 — `shared/ipc-contract.ts` + `daemon/telegram.ts`
Branch `f2/16-ipc-contract-telegram` → `main`. Depends: PR-15. Size: ≈200 lines, no exception. **Own slice per D-39/D-48 — no new-capability code in this PR.**
Scope: `src/shared/ipc-contract.ts` (edit only), `src/daemon/telegram.ts` (edit only), their existing test twins (edit only).
Requirements: `ipc-handshake › Online doctor checks run over an authenticated IPC route` (schema half); `doctor › Online tier runs inside the daemon and checks live Telegram state` (the `getChatMember` call site).
Runtime harness: N/A — type/schema and class-method unit tests; the route handler itself is PR-17.

- [x] 16.1 RED: extend `test/shared/ipc-contract.test.ts` — the `POST /doctor` request schema (`{ server_nonce, hmac, project_id?, dm_probe: boolean }`, `dm_probe: true` requires `project_id`) and response schema (`{ bindings: [{ project_id, checks: [{ id, status, detail }] }] }`) round-trip through `zod`. **Disclosed reading**: `project_id` is permitted present when `dm_probe` is `false` too (a scoped online check on one project), not just absent — design §9.2 does not forbid this, and the response's own `bindings` array already reports per-project results either way.
- [x] 16.2 GREEN: edit `shared/ipc-contract.ts` — add the `/doctor` route entry to `IPC_ROUTES` (now 8 routes) and the two new schemas (`doctorRequestSchema`/`doctorResponseSchema`, plus `doctorFindingSchema`); no change to any existing route's schema. The cross-field `dm_probe`⇒`project_id` rule reuses this codebase's own established `.refine()` idiom from `shared/tool-schemas.ts`.
- [x] 16.3 RED: extend `test/daemon/telegram.test.ts` — `getChatMember(chat_id, user_id)` added to the `TelegramApiClient` **class** (not the interface the room guard/rate recorder consume, per design D-48), redacts through the class's existing error-classification/redaction constructors (`telegram.ts:45-67`) exactly like every other method.
- [x] 16.4 GREEN: edit `daemon/telegram.ts` — add the `getChatMember` method and a minimal `TelegramChatMember` interface (`{status, user}` only — the real Bot API's role-specific extra fields are deliberately not modeled, disclosed in the interface's own doc comment); no change to any existing method's behavior.
- [x] 16.5 Verify: `npm run build && node --test "dist/test/shared/ipc-contract.test.js" "dist/test/daemon/telegram.test.js"`, then the full `npm test` (confirm zero regression in room-guard/rate-recorder consumers, which see no interface change). **230 authored lines (95 src, 135 test) against the ≈200 estimate, no exception.** Full suite 1336/1336 (0 fail, 6 skip).

### Unit 10 — Doctor online (own slice for the merged-file edit; new route/client code kept in its own PR ahead of it)

**Design §17 row 16 (`daemon/ipc/doctor.ts` + `bootstrap.ts` wiring + `online-client.ts`, ≈450) is split at the real compile dependency: `bootstrap.ts`'s wiring calls the route `daemon/ipc/doctor.ts` exports, so the new route/client code must exist first. PR-17 ships the new route and client (no merged-file edit); PR-18 is the isolated `bootstrap.ts` wiring edit — satisfying D-39/D-48's "own slice" rule for the merged file without bundling it with unrelated capability code AND without an artificial split of a real dependency.**

#### PR-17 — `daemon/ipc/doctor.ts` + `doctor/online-client.ts`
Branch `f2/17-doctor-online-route` → `main`. Depends: PR-16. Size: ≈280 lines; **1397 actual (577 src + 820 test), disclosed exception** — the most security-sensitive PR in this change (IPC auth, live DM sending), full branch coverage judged worth the size.
Scope: `src/daemon/ipc/doctor.ts` (new), `src/doctor/online-client.ts` (new), two test twins.
Requirements: `ipc-handshake › Online doctor checks run over an authenticated IPC route` (all 3 scenarios); `doctor › Online tier runs inside the daemon and checks live Telegram state` (both scenarios); `› DM probe is opt-in and confined to the binding being validated` (both scenarios). Threat matrix: Local process integration (`POST /doctor`, Applicable).
Runtime harness: `daemon/ipc/doctor.test.ts` runs the route handler directly against an injected `doctorClientFor` fake and a real `PendingHandshakeStore`; no `startDaemon` boot needed here (PR-18 covers the boot-wired integration).

- [x] 17.1 RED: `test/daemon/ipc/doctor.test.ts` — an unauthenticated caller (no completed identity handshake) gets the same refusal every other route returns and no check runs; a replayed nonce is refused (single-use consume via `PendingHandshakeStore.consume`); an HMAC computed with the wrong label (`session:` instead of `DOCTOR_PROOF_LABEL`/`"doctor:"`) is refused; `dm_probe: true` with no `project_id` is refused; **no bearer is minted** (no `MAX_ACTIVE_SESSIONS` slot consumed) on a successful call.
- [x] 17.2 RED: same file — `getMe().id === bot_id` mismatch reported per binding, printing no token; `getChat(group_id)` unreachable or `type !== "supergroup"` warns; `getChatMember` per roster bot fails on `administrator`/`creator` (PT-32) or `left`/`kicked` (B-28) — **all four statuses fail**, per design §9.2's own literal wording, disclosed as a single severity classification rather than split into warn/fail; the response contains no registry/ledger/secret-store write as a side effect of any check.
- [x] 17.3 RED: same file — the DM probe fires only through that binding's own room guard (room guard, rate recorder) plus one `DOCTOR_PROBE` audit row, and never reaches a different project's roster peers even when two bindings exist. **Correction found and fixed during Kairo's own post-delegation review, ratified by Alpha (Arena debate `bus-v2-f2-pr-17-dm-probe-design-001`, `CONSENSUS`)**: the delegated draft called `managed.transport.send(...)` for the probe, which (a) is a confirmed bug — `DirectTransport`'s roster map is keyed by `agent_id`, not `@username`, so the draft's pre-transformed recipients would have made every DM attempt fail with `UnknownRecipientError` — and (b) `DualWriteTransport.send` always posts to the group first, unconditionally, so a literal reading would make every `--dm-probe` run visibly post into the real group too, contradicting the term "probe". Fixed by calling `managed.roomGuard.sendMessage({chat_id:'@'+username, text})` directly, once per roster peer, bypassing `Transport` entirely — `RoomGuardClient.sendMessage` still asserts the target before delegating (room-guard intact) and `roomGuard`'s own wrapped client is already the `RateLimitRecorder`-decorated one (rate discipline intact), with no group post and the correct recipient format.
- [x] 17.4 GREEN: implement `daemon/ipc/doctor.ts` (new module — `routes.ts` is not edited, per D-44) and its `computeDoctorProof` helper. `DOCTOR_PROOF_LABEL` is a private local constant (not imported from `installer/constants.ts` as originally briefed — `daemon/*` has no project-reference path to `installer/*`), mirroring `handshake.ts`/`sessions.ts`'s own identical-reason precedent.
- [x] 17.5 RED then GREEN: `test/doctor/online-client.test.ts` — the client calls `GET /identity` then `POST /doctor`, verifies `computeIdentityProof`, and reports `skipped` (never spawns a daemon) when none is running.
- [x] 17.6 Verify: `npm run build && node --test "dist/test/daemon/ipc/doctor.test.js" "dist/test/doctor/online-client.test.js"`. Full suite 1361/1361 (0 fail, 6 skip).
- [x] 17.7 Docs: THREAT-MODEL §4 — added PT-32's real test-file citation and the "Local process integration" boundary row (mirroring design.md's own already-written Threat-matrix entry) pointing at `daemon/ipc/doctor.test.ts`.

#### PR-18 — `daemon/bootstrap.ts` wiring
Branch `f2/18-bootstrap-doctor-wiring` → `main`. Depends: PR-17. Size: ≈170 lines, no exception. **Own slice per D-39/D-48 — no new-capability code in this PR beyond the wiring itself.**
Scope: `src/daemon/bootstrap.ts` (edit only), its existing test twin (edit only).
Requirements: `doctor › Online tier runs inside the daemon...` (the boot-wired integration half); `ipc-handshake › Online doctor route refuses an unbound project_id` + `› Online doctor route checks every active binding when no project_id is given` (D-44's no-bearer model — the original citation named a session-scoped scenario that never existed in the shipped design; corrected via Arena debate `bus-v2-f2-pr-18-spec-design-conflict-001`, Alpha `CONSENSUS`, round 1).
Runtime harness: `test/daemon/bootstrap.test.ts` boots a real `startDaemon` with a fake Telegram client factory and exercises `POST /doctor` end-to-end through the real IPC server.

- [x] 18.1 RED: `test/daemon/bootstrap.test.ts` — `startDaemon` mounts `daemon/ipc/doctor.ts`'s route with an injected `doctorClientFor(bot_id)` (secret store + `TelegramApiClient`) alongside the existing identity/session routes; a real end-to-end `POST /doctor` returns 200 for a validly-authenticated request (valid nonce + `doctor:` HMAC proof) naming a bound `project_id`, 401 for an invalid/missing nonce or HMAC, and 404 (`DOCTOR_UNBOUND_PROJECT`) for a `project_id` naming no active binding.
- [x] 18.2 GREEN: edit `daemon/bootstrap.ts` — wire `doctorClientFor` (reuses `buildTelegramClient`'s own token-resolution shape, typed to `DoctorTelegramClient` since `getChatMember` sits one level below the `TelegramClient` interface, D-48) and mount `POST /doctor` alongside the existing identity/session routes; no change to `poller`/`BindingsReconciler` behavior.
- [x] 18.3 Verify: `npm run build && node --test "dist/test/daemon/bootstrap.test.js"` — 12/12 pass. Full `npm test`: 1362/1362 (1356 pass, 6 skip, 0 real fail; the one apparent failure, `heartbeat: ticks at periodMs`, is B-39's pre-existing timing flake, confirmed green in isolation immediately after). One disclosed correction beyond `bootstrap.ts`/its own test twin: `test/security/daemon-bundle.test.ts`'s `.sendMessage(` call-site allow-list needed `daemon/ipc/doctor.js` added as a fifth legitimate site (the DM probe calls `managed.roomGuard.sendMessage(...)` directly, already Alpha-audited in PR-17 — `bus-v2-f2-pr-17-dm-probe-design-001` — but PR-17 itself never touched this F1-owned static-assertion test, so the assertion still only knew about the pre-existing four).

### Unit 11 — Static assertions + integration (D-31 closure, ADR-0031)

#### PR-19 — `installer-bundle.test.ts` + two-install wrong-room + ADR-0031 gate integration
Branch `f2/19-installer-bundle-integration` → `main`. Depends: PR-18. Size: ≈350 lines; **776 actual (234 + 432 + 110), disclosed exception** — three real, non-trivial test files, each doing genuinely new integration work (a 65-file closure scan, a full two-project wizard-driven install, a real child-process Node-floor spawn).
Scope: `test/security/installer-bundle.test.ts`, `test/security/two-install-wrong-room.test.ts` (flat, not nested under a new `integration/` directory — disclosed correction, see 19.3), `test/cli/main-gate.integration.test.ts`.
Requirements: proposal.md success criteria — installer bundle static assertions; "Wrong-room test green after installing into two projects"; ADR-0031 installer tests (ambient integration proof beyond PR-13's unit spies).
Runtime harness: static scan over the built `cli.js` (corrected root, see 19.1) and `doctor/main.js` closures; a real two-project install via the wizards followed by `npm run test:wrong-room`.

**Disclosed corrections, ratified by Alpha before implementation (Arena debate `bus-v2-f2-pr-19-plan-001`, `CONSENSUS`, round 1) and confirmed correct by Kairo's own independent re-verification against source after the fact:**
1. design.md §12 names `installer/cli.js` as the installer-side closure root, but `src/installer/cli.ts`'s only imports are `import type` — erased by `tsc` — so its compiled closure is vacuous (1 file, itself). The real root is `cli/main.js` (the same entry `daemon-bundle.test.ts` already uses for its own CLI-closure check), reaching 65 files.
2. design.md §12.3's "no `npx`/`enableAllProjectMcpServers`/`trust_level` literal" read as a bare substring ban would fail against `installer/instructions.ts`'s own already-merged, legitimate disclosure prose ("Codex CLI: set trust_level for this project yourself; the installer never writes it."). Implemented as a write-shaped match (a JSON/object key immediately followed by `:`, or a real `npx` invocation token) instead, mirroring `predicates.ts`'s own established real-call-vs-prose distinction.
3. `child_process` is not confined to one file in either closure once the root is corrected: the CLI closure also reaches `client/spawn.js` (via `cli/main.js`'s `mcp` branch) and one already-known disclosure-comment false positive in `secret-store/file-fallback.js` ("daemon bundle stays free of `child_process`" — prose, not an import, the same false-positive class `daemon-bundle.test.ts`'s own module doc already names); the doctor closure reaches `installer/exec.js` too (`doctor/checks/system.ts`'s ACL tier legitimately calls `runIcacls` — a real, read-only subprocess call, independent of the "zero network calls" guarantee). Asserted the real, exact site sets instead of "exactly one"/"none".
4. `test/security/two-install-wrong-room.test.ts` is flat under `test/security/`, not nested in a new `integration/` subdirectory: `package.json`'s `test:wrong-room` script globs `dist/test/security/*wrong-room*`, which does not cross a subdirectory boundary — a nested path would have silently excluded the file from the very script this task requires it to stay green under.

- [x] 19.1 RED then GREEN: `test/security/installer-bundle.test.ts` — 12 tests, all passing against the real built closures (`cli/main.js` and `doctor/main.js`, `doctor/offline.js`'s own narrower closure for the zero-network check); every predicate has its own seeded-negative/seeded-positive non-vacuity test.
- [x] 19.2 GREEN: no source defect found — every corrected assertion matches already-merged, already-audited code exactly (confirmed independently: `doctor/checks/system.ts:8` really does import `runIcacls` as a value import, `secret-store/file-fallback.ts:25` really does carry the exact disclosed prose line).
- [x] 19.3 RED then GREEN: `test/security/two-install-wrong-room.test.ts` — one real end-to-end test: `runSetup` → `runBotAdd` ×2 → `runGroupAdd` ×2 → `runProjectBind` ×2 (real fake `Prompter`s, a real file-fallback secret store, real `fetchImpl` stubs) produces two real, distinct active bindings in one real `registry.json`; a `BindingsReconciler` with NO `createTransport` override (the real, default production path) plus a real `createIpcServer`/`createSessionRoutes` composition proves N sends from two independently-opened sessions never cross group boundaries — the same guarantee `wrong-room.test.ts` already proves against a synthetic fixture, now proven against real wizard-produced state for the first time. `npm run test:wrong-room` confirmed to pick up both files.
- [x] 19.4 RED then GREEN: `test/cli/main-gate.integration.test.ts` — a real child-process spawn of `dist/src/cli/main.js` with a `--require` CJS preload overriding `process.version` via `Object.defineProperty` (a bare assignment silently no-ops, verified empirically before implementing), across `setup`/`mcp --project x`/`migrate-v1`/`daemon start`: `EXIT_NODE_FLOOR`, the exact pinned stderr message, and an empty scratch cwd afterward (zero filesystem writes; zero git calls holds trivially, since nothing in this codebase calls git and nothing runs past the gate by construction). Includes one isolated sanity test proving the preload technique itself works before trusting the full CLI runs.
- [x] 19.5 Verify: `npm run build && npm test && npm run test:static && npm run test:wrong-room`. Full suite 1380/1380 (1373 pass, 1 pre-existing flake — B-39's `heartbeat: ticks at periodMs`, confirmed green in isolation — 6 skip, 0 real fail). `test:static` 56/56. `test:wrong-room` 5/5, correctly running both wrong-room files.

### Unit 12 — Documentation

#### PR-20 — Docs close-out
Branch `f2/20-docs-close-out` → `main`. Depends: PR-19. Size: ≈200 lines, no exception (documentation only — no test-first rule applies).
Scope: `docs/02-architecture/OVERVIEW.md` (§10.1/§10.3 — Pi row, detection wording per D-33), `docs/02-architecture/THREAT-MODEL.md` §4/§5.5/§5.6 (D-49/D-50 exec allow-list correction), `docs/02-architecture/DATA-MODEL.md` (audit reasons `REGISTRY_CREATED`/`BOT_ADDED`/`GROUP_ADDED`/`PROJECT_BOUND`/`DOCTOR_PROBE`), `docs/06-backlog/CHECKLIST.md` (close B-05 with a pointer to PR-05's test, B-17 pointer).
Requirements: proposal.md deliverable 11.
Runtime harness: N/A — documentation.

- [ ] 20.1 Update OVERVIEW §10.1/§10.3: Pi as the 8th tool-config row (D-34); "detected tool" reworded to "tool the user selected" (D-33, no CONSTITUTION amendment needed per the locked reading).
- [ ] 20.2 Update THREAT-MODEL §5.6: the exec allow-list is `{icacls.exe, reg.exe}`, both Windows-only, fixed argv (D-50 correction of the proposal's original "exec allowed only for icacls" wording); confirm §5.5's `icacls … (OI)(CI)F` command text matches D-49.
- [ ] 20.3 Update DATA-MODEL.md: document the five new `audit_log.reason` values this change introduces, matching what PR-07/PR-17 actually emit.
- [ ] 20.4 Close CHECKLIST.md B-05 (pointer: PR-05's `tool-config-merge.test.ts`) and B-17 (pointer: PR-01 through PR-19 collectively satisfy the installer/doctor scope); leave any other backlog row exactly as `pending Director decision`.
- [ ] 20.5 Verify: `npm run build && npm test && npm run test:static && npm run test:wrong-room` (full suite green, confirming no PR above left a regression).

## Spec Coverage Check

Every requirement in the 6 capability specs traces to at least one task above. No gap found.

| Capability | Requirements | Scenarios | Covering PR(s) |
|---|---|---|---|
| installer-wizard | 7 | 17 | PR-09, PR-11, PR-12, PR-13 |
| registry-authoring | 3 | 7 | PR-06, PR-07 |
| tool-config-merge | 7 | 12 | PR-02, PR-03, PR-04, PR-05 |
| doctor | 5 | 8 | PR-14, PR-15, PR-17, PR-18 |
| ipc-handshake (delta) | 1 | 4 | PR-16, PR-17, PR-18 |
| secret-store (delta) | 2 | 5 | PR-07, PR-08, PR-11 |
| **Total** | **25** | **53** | |

Threat-matrix rows marked Applicable in design.md (Subprocess spawn; Local process integration; Filesystem writes outside the home; Login persistence) each have an explicit RED task above (PR-02/PR-08/PR-09/PR-17) before their production task, per skill rule. Rows marked N/A in design (documentation-like paths, git repository selection, commit/push/PR commands) are correctly omitted — F2 has no git automation and classifies no file for execution.

## Success Criteria Checklist

Mirrors `proposal.md` "Success criteria" verbatim, with the closing PR(s) for each item.

- [ ] ADR-0031 installer tests green: no `npx` in any written entry (PR-04, PR-05); fake Node < 24 exits with the download link and zero filesystem writes and zero git calls (PR-13, PR-19).
- [ ] One merge test per format (8 surfaces) with realistic fixtures; pre-existing entries, non-MCP keys and comments survive byte-for-byte; a conflicting same-named entry is refused with a diff; a backup exists (PR-05).
- [ ] `doctor` offline tiers make zero network calls, test fails if any occurs (PR-14).
- [ ] PT-05 doctor half and PT-32 green (PR-15, PR-17).
- [ ] Wrong-room test green after installing into two projects (PR-19).
- [ ] Installer bundle static assertions green and non-vacuous (PR-19).
- [ ] B-05 closed in CHECKLIST with a pointer to the merge tests; every `src` file has a test twin; `npm test` and `npm run build` pass (PR-05, PR-20; `test/twins.test.ts` enforces the twin rule cumulatively across every PR above).
- [ ] Start-at-login (D-40) writes the Windows Run key / macOS LaunchAgent plist only when opted in, is idempotent on re-run, and is fully removed when unchecked; no service, Task Scheduler, or pm2 entry is ever created (PR-09, PR-12).

## Design-Disclosed Risks Carried Into Apply

Not Director decisions (D-31..D-52 are all locked) — carried forward from design §16 for `sdd-apply` to watch, per this project's disclosure convention.

- `jsonc-parser`'s ESM `exports` map may reject a named import (design §16) — PR-01's task 1.2 verifies this against the real built `dist` before anything depends on it; the fallback is a default import, disclosed inline if taken.
- PR-11 and PR-14 are planned exactly at the 400-line budget; re-measure the real diff before opening either and re-slice at a file boundary if it grows, following F1's own repeated lesson (`bus-v2-f1-pr-01-001` and later re-slices) rather than requesting an exception for new (non-vendored) code.
- The Windows rename-over-while-daemon-reads race (`REGISTRY_REPLACE_ATTEMPTS`) and the brief console flash at login (Windows Run-key launcher) are accepted/disclosed by design, not blocking.
- macOS autostart evidence stays template-and-byte-tested only in F2; empirical verification is deferred to F6 (B-12), per design §16.
- The bootstrap.ts/doctor-route split (PR-17/PR-18, this phase's own slicing choice rather than a literal reading of "ipc-contract.ts + telegram.ts + bootstrap.ts" as one PR) is disclosed above Unit 10; flag to the Director before apply if a single combined PR was actually intended.
