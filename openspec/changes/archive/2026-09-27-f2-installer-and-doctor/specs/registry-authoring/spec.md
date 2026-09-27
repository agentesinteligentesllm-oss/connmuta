# registry-authoring Specification

## Purpose

New writer modules for `~/.conmuta/registry.json` and `conmuta.json`, kept separate from the
daemon's read-only loader (D-35): every write is validated before it replaces anything, enforces
the same R1-R6 the daemon enforces at load, and leaves an audit trail (R6).

## Requirements

### Requirement: Registry writes are validate-before-replace

The registry writer MUST compute the full resulting document in memory, validate it against the
same strict schema and R1-R6 the daemon's loader enforces, and only on success atomically replace
`registry.json`. On validation failure the writer MUST make no change to the on-disk file.

#### Scenario: Valid change replaces the file atomically

- GIVEN a valid new binding to add to an existing, valid registry
- WHEN the registry writer applies the change
- THEN the resulting document passes schema and R1-R6 validation and `registry.json` is replaced
  with it

#### Scenario: A resulting document that fails R1 is never written

- GIVEN a change that would create a second active binding for a `bot_id` already actively bound
- WHEN the registry writer computes the resulting document
- THEN validation reports R1, the on-disk `registry.json` is left byte-identical to before the
  attempted change, and no partial write occurs

Traces: D-35; DATA-MODEL.md §2.5 R1-R6; CONSTITUTION.md §2 inv. 1

### Requirement: Every registry write is accompanied by an audit row

Every write the registry writer commits MUST be accompanied by one audit row recording that a
human-initiated change occurred (R6). No registry write MUST succeed without a corresponding audit
row being produced for that same change.

#### Scenario: A committed write has a matching audit row

- GIVEN a successful registry write from any wizard (`bot add`, `group add`, `project bind`)
- WHEN the write commits
- THEN exactly one audit row exists recording that change, distinguishable from bus-derived rows

#### Scenario: A refused write produces no audit row

- GIVEN a change that fails validate-before-replace
- WHEN the writer refuses it
- THEN no registry write occurs and no audit row is produced for the refused attempt

Traces: D-35; DATA-MODEL.md §2.5 R6; DATA-MODEL.md §3.6 `audit_log`; CONSTITUTION.md §2 inv. 1

### Requirement: conmuta.json writer writes identifiers only, write-if-absent or verify

The `conmuta.json` writer MUST reuse the existing strict project-file schema. When no file exists
at the target path, it MUST write one containing identifiers only (`schema_version`, `project_id`,
`group_id`, `roster`) and no other field. When a file already exists, the writer MUST verify it
against the intended binding instead of overwriting it, and MUST refuse when the existing file
disagrees with the intended binding.

#### Scenario: Absent file is created with identifiers only

- GIVEN a project folder with no `conmuta.json`
- WHEN `project bind` writes the file
- THEN the resulting file contains only `schema_version`, `project_id`, `group_id`, and `roster`,
  and passes the same strict schema the thin client uses to parse it

#### Scenario: Existing agreeing file is left untouched

- GIVEN a `conmuta.json` already present and matching the intended binding exactly
- WHEN `project bind` runs again for the same binding
- THEN the writer makes no write and reports the file as already correct

#### Scenario: Existing disagreeing file is refused, not overwritten

- GIVEN a `conmuta.json` present with a `group_id` different from the intended binding
- WHEN `project bind` runs for that project folder
- THEN the writer refuses, names the disagreement, and does not overwrite the file

Traces: OVERVIEW §10.2 "Assign project"; ADR-0028 rule 3; DATA-MODEL.md §1; CONSTITUTION.md §2 inv. 1

## Traceability

| Source | Requirement / Scenario |
|---|---|
| D-35 | Registry writes are validate-before-replace |
| DATA-MODEL.md §2.5 R6 | Every registry write is accompanied by an audit row |
| ADR-0028 rule 3; DATA-MODEL.md §1 | conmuta.json writer writes identifiers only |
