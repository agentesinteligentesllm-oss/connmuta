# B-111: Pre-validate tool configs in `project bind` before any write (zero partial bind)

> Feature task document for Organic Driven Development (ODD).
> Backlog item: **B-111** (found by Judgment Day round 1, JD-B-004).

## Context & Problem

`conmuta project bind` is load-bearing:
1. R1–R3 are pre-checked against `registry.json`.
2. `conmuta.json` is written via `writeProjectFile` (R4).
3. `commitRegistryChange` commits the active binding to `registry.json` and appends `PROJECT_BOUND` to the SQLite ledger.
4. Only then does the tool-config loop run via `editFile`.

If any tool-config merge refuses (conflict with differing same-named entry, malformed JSONC/TOML, or symlink):
- `editFile` throws `FileEditRefusal`.
- `runProjectBind` did not catch `FileEditRefusal`, so the error escaped out of the wizard.
- `src/cli/main.ts` catches only `InstallerDependencyFailure`, so the process crashed with an uncaught exception.
- Crucially, `conmuta.json` was already written and `registry.json` had already committed the active binding.
- Because F2 has no `unbind` verb and R1/R2 enforce bijective invariants (at most one active binding per bot, group, and project), any re-run of `conmuta project bind` immediately failed with `invariant-violated (R1/R2)`. The operator was stuck in a dead end.

## Architecture Decision (ADR-0035, Option a)

Execute read-only dry validation of all selected tool configs **before writing anything**:
1. Add `checkFileEdit(options: Omit<EditFileOptions, "now">): "created" | "noop" | "will-write"` to `src/installer/file-edit.ts`. It executes steps 1–4 of the edit pipeline without writing files, creating temp files, or taking backups.
2. In `src/installer/wizards/project-bind.ts`, resolve tool targets early and run `checkFileEdit` on every target **before** `writeProjectFile` and **before** `commitRegistryChange`.
3. If any target fails, return `{ outcome: "tool-config-refused", toolId, path, reason, message }`.
4. In `src/cli/main.ts`, handle `"tool-config-refused"` cleanly: print the refusal reason and diff to stderr, and exit with code 1.
5. In this refusal state, ZERO bytes have been written: `conmuta.json` is not written, `registry.json` is untouched, and the ledger has no event.
6. When the operator resolves the conflict and re-runs `conmuta project bind`, the bijective invariants R1 and R2 do not collide.

## Tasks

- [x] **Task 1: Add `checkFileEdit` to `src/installer/file-edit.ts` with tests** (`7a18006`)
  - Implement read-only checks (symlink, exists, parse, entry conflict).
  - Add tests in `test/installer/file-edit.test.ts`.
- [x] **Task 2: Wire pre-validation into `runProjectBind` in `src/installer/wizards/project-bind.ts`** (`523f7d6`)
  - Extend `ProjectBindOutcome` with `"tool-config-refused"`.
  - Validate all targets before `writeProjectFile` and before `commitRegistryChange`.
  - Add tests in `test/installer/wizards/project-bind.test.ts`.
- [x] **Task 3: Wire CLI reporting for `"tool-config-refused"`** (`2701945`)
  - Update `reportProjectBindOutcome` in `src/cli/main.ts`.
  - Add test in `test/cli/` verifying the exit code and error output.
- [x] **Task 4: Author ADR-0035 and update specs/backlog** (`57bb5e5`)
  - Create `docs/03-adr/0035-pre-validate-tool-configs-in-project-bind.md`.
  - Update `docs/03-adr/INDEX.md`, `openspec/specs/installer-wizard/spec.md`, `docs/06-backlog/CHECKLIST.md`.
- [x] **Task 5: Verification & Session Closeout**
  - Run `npm run build && npm test` (all tests passing: 1878 tests, 1872 pass, 0 fail, 6 skip).
  - Run `npm run test:static` (101/101 pass).
  - Independent technical verification by `gentle-ai-verify` subagent (task `musunsj7-1-3w37`): PASS on all 5 claims with exact line citations.
  - Zero temp leaks under `%TEMP%`.
  - Update `docs/08-sessions/HANDOFF.md`, `docs/08-sessions/LOG.md`, `AGENTS.md`.
