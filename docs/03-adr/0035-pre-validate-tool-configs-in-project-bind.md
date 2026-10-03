# ADR-0035 — Pre-validate tool-config merges in `project bind` before any write: zero partial bind

## Status

`accepted` — applied in the session of 2026-10-03 under the Director's standing authorization for that
session ("toma las riendas y no me preguntes absolutamente nada. Confío plenamente en tu criterio y te
autorizo todo lo que consideres adecuado y necesario"). **Disclosed exactly**: there was no separate,
per-decision confirmation of this ADR, because the session's instruction was that none be asked for;
the standing authorization quoted above is the whole of what this status rests on, and it is recorded
here so a later reader does not have to infer it. A Director who wants this revisited can supersede
this ADR the ordinary way.

It closes backlog **B-111** (the partial bind failure mode discovered by Judgment Day round 1, JD-B-004,
during session 63's ADR-0034 audit). It refines the "order is load-bearing / reject before writing anything"
guarantee of `openspec/specs/installer-wizard/spec.md` to cover tool-config merge pre-flight validation.
It does **not** amend the CONSTITUTION: no invariant and no layer rule changes; Invariants 1 and 2 are
protected from dead-end entrapment by preventing partial active bindings in the registry.

## Date

2026-10-03

## Context

`conmuta project bind` is load-bearing:
1. R1–R3 are pre-checked against the current `registry.json` before any write is attempted.
2. `conmuta.json` is written or verified (R4, via `writeProjectFile`).
3. `commitRegistryChange` appends a `PROJECT_BOUND` row to the SQLite audit log and writes the updated `registry.json` with the active binding.
4. Only then did the tool-config loop run via `editFile`.

`editFile` is refuse-and-diff by design (`tool-config-merge` spec): an existing same-named entry that differs
from the intended one throws `FileEditRefusal("conflict")` with a diff. Similarly, malformed files throw
`FileEditRefusal("parse-error")` and symlinked targets throw `FileEditRefusal("symlink")`.

Under the pre-B-111 implementation:
- `editFile` threw `FileEditRefusal`.
- `runProjectBind` deliberately did not catch `FileEditRefusal`, letting it propagate out of the wizard.
- `src/cli/main.ts` caught only `InstallerDependencyFailure`, rethrowing anything else, so the process exited
  non-zero with an uncaught exception.
- **Critically, this exit occurred AFTER the registry commit and the `conmuta.json` write.**
- As a consequence, the project had an active binding committed in `registry.json` and in the audit log, but
  the tool configs were left unmerged and the instruction files were never written.
- Because F2 ships no `unbind` verb and R1/R2 enforce bijective invariants (at most one active binding per bot,
  group, and project), any re-run of `conmuta project bind` immediately failed with `invariant-violated (R1/R2)`
  before reaching the tool-config loop.
- The operator was trapped in a dead end: unable to complete the bind via the wizard, and unable to re-bind
  without manually modifying `registry.json`.

## Options considered

1. **Option (a): Run the tool-config loop's dry validation before the registry commit and before `conmuta.json`.**
   Execute steps 1–4 of the edit pipeline (symlink check, existence check, parse check, and entry conflict check)
   for all selected tool configs *before writing anything*. If any target refuses, abort immediately before
   writing `conmuta.json` or committing the registry.
2. **Option (b): Roll back the registry commit and `conmuta.json` when the tool-config loop aborts.**
   Attempting to rollback a committed registry change contradicts CONSTITUTION Invariant 2 (the SQLite ledger
   is append-only; events are never deleted) and would require inventing an unbind transaction mechanism that
   does not exist in F2.
3. **Option (c): Surface a resumable, explicitly partial outcome the operator can finish.**
   Requires introducing a new command or verb (e.g. `conmuta project configure-tools` or `--resume`), expanding
   the CLI surface and complexity.

## Decision

**Option (a) is selected.**

1. **Add `checkFileEdit` to `src/installer/file-edit.ts`.**
   `checkFileEdit(options: Omit<EditFileOptions, "now">): CheckFileEditOutcome` executes steps 1–4 of the
   edit pipeline in read-only mode:
   - Step 1: refuses if target or parent directory is a symlink (`FileEditRefusal("symlink")`).
   - Step 2: returns `"created"` if target is absent, without creating files or directories.
   - Step 3: strictly parses the file; throws `FileEditRefusal("parse-error")` on invalid syntax.
   - Step 4: checks for an existing entry under `entryPath`: returns `"noop"` if deep-equal, throws
     `FileEditRefusal("conflict")` with diff if different, returns `"will-write"` if absent.
   `checkFileEdit` performs zero writes, creates zero temp files, and takes zero backups.

2. **Pre-validate all selected tool configs in `runProjectBind` before any mutation.**
   `runProjectBind` resolves tool targets immediately after R1–R3 checks. It iterates over all selected
   targets and calls `checkFileEdit`. If any target throws `FileEditRefusal`, `runProjectBind` catches it and
   returns:
   `{ outcome: "tool-config-refused", toolId: target.id, path: targetPath, reason: error.reason, message: error.message }`.
   At this point, **zero writes have occurred**: `conmuta.json` is not written, `registry.json` is untouched,
   and the ledger has no event.

3. **Report `tool-config-refused` cleanly in the CLI.**
   `reportProjectBindOutcome` in `src/cli/main.ts` handles `"tool-config-refused"`: prints the refusal reason,
   target tool id, and diff to stderr, and exits with code 1.

4. **Retry succeeds cleanly.**
   Because neither `conmuta.json` nor `registry.json` was committed, the operator can resolve the conflict
   in their tool config (or deselect the tool) and re-run `conmuta project bind`. R1 and R2 do not collide,
   and the bind completes cleanly.

## Consequences

- **Positive**:
  - Eliminates the partial bind failure mode completely.
  - A tool-config conflict, malformed syntax, or symlink refuses before touching any disk state.
  - Resolving the refusal and re-running `conmuta project bind` is safe, deterministic, and does not trip R1/R2.
  - Refusal reporting is structured and clean rather than an uncaught exception crashing the process.
- **Negative / disclosed**:
  - Re-reads and re-parses tool configs during the write step (a negligible microsecond overhead on local disks).
  - An unexpected I/O error during the write step itself (e.g. out-of-disk-space during backup rename) remains
    possible as with any filesystem write, but all deterministic configuration conflicts are eliminated.

## Tests that must pin it

| Guarantee | Test |
|---|---|
| `checkFileEdit` detects symlinks, parse errors, conflicts, no-ops, and created targets without writing anything | `test/installer/file-edit.test.ts` (6 dedicated tests) |
| `runProjectBind` refuses tool config conflicts before writing `conmuta.json` or `registry.json`, and retry succeeds | `test/installer/wizards/project-bind.test.ts` ("a tool-config conflict is refused before writing conmuta.json or registry, and retry succeeds (B-111)") |
| `runProjectBind` refuses malformed tool configs before any write | `test/installer/wizards/project-bind.test.ts` ("a malformed tool-config file is refused with parse-error before any write (B-111)") |
| `reportProjectBindOutcome` reports `tool-config-refused` on stderr with diff and exits 1 | `test/cli/main.test.ts` ("reportProjectBindOutcome reports tool-config-refused on stderr and exits 1 (B-111)") |
