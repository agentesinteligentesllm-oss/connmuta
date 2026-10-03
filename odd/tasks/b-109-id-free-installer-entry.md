# B-109 — the installer writes id-free launcher entries (ADR-0034)

> **Written retrospectively, and that ordering failure is disclosed.** The code landed first and this
> document was written from the shipped diff afterwards, which inverts the ODD protocol's "track
> substantial work before the first write" rule. Session 61 set the same precedent for **B-105(a)** (an
> SDD artifact set written against already-shipped code) and recorded it the same way. The session-63
> LOG entry states it too; nothing about the change is hidden by it.

## Objective

Stop the installer from writing a project id into the MCP entries it generates, so that an entry which
travels with a project directory can never assert a stale identity, and so that one installer run cannot
silently undo the id-free registration ADR-0033 made the correct shape.

## Problem / why

ADR-0033 removed the project id from the *binding*: the thin client resolves its project by walking up
from its cwd to the nearest `conmuta.json`, and `--project <id>` is an assertion checked against that
file, never its source. The installer was not changed with it — the gap was filed as B-109 rather than
folded into that session — and kept writing
`args: [CLI_ENTRY, "mcp", "--project", projectId]` (`src/installer/launcher.ts` before this change).

Two consequences, both concrete:

- **A copied or re-bound directory carries a stale assertion.** The entry is written into the project's
  own config, which travels with the directory. `conmuta project bind` on a copy, or a re-bind that mints
  a new `project_id`, leaves the old id in place; because the flag is now an *assertion against the found
  file*, the client refuses to start with `EXIT_PROJECT_MISMATCH` and the bus disappears from the host
  with no explanation.
- **A project entry reads as *the* registration.** Where a host reads both a user-level and a
  project-level config and resolves a name collision in favour of the project file, that entry replaces
  the id-free user-level one for that cwd. An operator who then deletes the user-level entry — reasonably
  believing the installer already registered the bus — trades a working headless turn for a
  project-trust-gated one (Pi: `resolveProjectTrusted` with `hasUI: false`).

## Scope decision

**In scope:** the entry shape, the canonical requirement that pins it, the operator-facing guidance, and
the documents that described the old shape.

**Deliberately out of scope, disclosed:** the installer keeps writing **project-level** entries and never
writes or modifies a user-level config. D-42's matrix is per-project by design, the installer never writes
outside the project directory, and changing that is a different decision with its own blast radius. The
printed recommendation is the disclosure, not a substitute for that decision.

**Also disclosed, and filed as B-111 rather than fixed here:** the ADR's first draft told the operator
that re-running `conmuta project bind` is the remedy for an already-stale entry. It is not. `editFile` is
refuse-and-diff, so a differing same-named entry throws `FileEditRefusal("conflict")`, the wizard does not
catch it, and the run stops *after* the registry commit and the `conmuta.json` write — a partially applied
bind whose re-run can trip the bijective invariants. Round 1 of the audit found this; the ADR now states
the two-step remedy and B-111 carries the fix shape.

## Tasks

| # | Task | Evidence |
|---|---|---|
| 1 | `buildLauncherEntry()` takes no project and emits `[CLI_ENTRY, "mcp"]` | `src/installer/launcher.ts`; `test/installer/launcher.test.ts` (exact args + explicit absence of `--project` + purity across calls) |
| 2 | The wizard prints one line recommending the single id-free user-level registration, through the injected sink | `src/installer/instructions.ts` (`USER_LEVEL_REGISTRATION_GUIDANCE`, `printRegistrationGuidance`); `test/installer/instructions.test.ts`; `test/installer/wizards/project-bind.test.ts` (wizard-level pin added in round 1) |
| 3 | The CLI's `projectBind` dependency passes `trustStepIo: { write: io.out }`, so the line uses the documented sink | `src/cli/main.ts` |
| 4 | The canonical requirement is restated as *"Written entries are id-free stdio, zero env, never npx"* with its scenario extended | `openspec/specs/tool-config-merge/spec.md` |
| 5 | ADR-0034 records the decision; ADR-0006, ADR-0031 and ADR-0033 gain **append-only** notes | `docs/03-adr/0034-id-free-installer-entry.md`; `docs/03-adr/INDEX.md` |
| 6 | Every live document that described the old entry shape is reconciled | `CONSTITUTION.md` §3 layer 3; `OVERVIEW.md` (D5, Assign-project, §10.3); `WORK-PLAN.md` F2; the tribunal's D5 row; `README.md`'s status; `odd/tasks/b-107-optional-project-walkup.md` |
| 7 | Backlog row closed, with the audit's follow-up filed | `docs/06-backlog/CHECKLIST.md` (B-109 `done`; B-111 opened) |

## Verification

- `npm test` **1862 / 1856 / 0 / 6** and `npm run test:static` **99 / 99** after the round-1 fixes.
- **Non-vacuity measured by mutation, not asserted**: removing `printRegistrationGuidance(...)` from the
  wizard fails the new wizard-level test.
- Judgment Day round 1: `jd-judge-a` `APPROVE` with one SUGGESTION; `jd-judge-b` `REJECT` with 2 CRITICAL,
  5 WARNING, 3 SUGGESTION. The two CRITICALs were a documentation-integrity one (the ADR citing an audit
  record that did not exist yet) and a process one (the frozen manifest did not match the workspace while
  the judges read it). Round 2 and the independent verification are recorded in the tribunal row
  `bus-v2-b109-id-free-installer-entry-001`.
