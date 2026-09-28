# Roster Sync Specification

## Purpose

The human-triggered CLI path that resolves the already-detected `roster_drift` condition (F1 PR-31)
by re-reading a project's `conmuta.json` and, on confirmation, writing the recomputed roster into the
registry atomically with an audit row. The panel never triggers this; `roster_drift` stays
never-auto-resolved (D-07).

## Requirements

### Requirement: Explicit, human-triggered sync command

The system MUST provide a `conmuta project sync-roster [path]` command that a human runs
explicitly. The system MUST NOT resolve `roster_drift` from a timer, a heartbeat tick, or any panel
action.

#### Scenario: Heartbeat ticks never trigger a sync

- GIVEN a binding carries `roster_drift`
- WHEN the daemon runs any number of heartbeat ticks with no human invocation of `sync-roster`
- THEN the stored `roster_snapshot`/`roster_hash` are unchanged after every tick

### Requirement: Diff before write

The command MUST read the project's `conmuta.json`, recompute its roster hash, and compare it
against the bound registry's stored `roster_snapshot`/`roster_hash` before writing anything. The
command MUST refuse to proceed if the project has no active registry binding, or if `conmuta.json`
is missing or fails the existing identifiers-only validation (PT-05/PT-06).

#### Scenario: No drift produces no write

- GIVEN the project file's roster matches the stored `roster_snapshot`
- WHEN `sync-roster` runs
- THEN it reports no drift and makes no registry write

#### Scenario: Drift is shown before commit

- GIVEN the project file's roster differs from the stored `roster_snapshot`
- WHEN `sync-roster` runs
- THEN it displays the difference before committing the change

#### Scenario: Unbound project is refused

- GIVEN the given path has no active binding in `registry.json`
- WHEN `sync-roster` runs
- THEN it refuses with an unbound-project error and makes no write

#### Scenario: Missing or invalid project file is refused

- GIVEN `conmuta.json` is missing, unreadable, or fails identifiers-only validation
- WHEN `sync-roster` runs
- THEN it refuses with the same validation error `conmuta validate` would report, and makes no write

#### Scenario: Operator declines the confirmation

- GIVEN a real roster difference has been displayed
- WHEN the operator declines to confirm
- THEN no registry write and no audit row are produced

### Requirement: Atomic, audited commit

A confirmed sync MUST commit the new `roster_snapshot`/`roster_hash` and its `audit_log` row
(reason `ROSTER_SYNCED`) as one atomic operation; a failure at any point MUST leave the registry file
and the audit log mutually consistent (R6).

#### Scenario: Successful sync is both written and audited

- GIVEN a confirmed roster difference
- WHEN the commit succeeds
- THEN the registry's `roster_snapshot`/`roster_hash` are updated
- AND exactly one `audit_log` row with reason `ROSTER_SYNCED` exists for it

#### Scenario: A failed commit leaves no partial state

- GIVEN a confirmed roster difference
- WHEN the commit fails partway (e.g. the rename step)
- THEN neither the registry file nor the audit log reflects the attempted change

## Traceability

| Source | Requirement / Scenario |
|---|---|
| D-07, `daemon/ipc/routes.ts:139` `ROSTER_DRIFT_CONDITION` | `roster_drift` is never auto-resolved |
| Decision 4, `bus-v2-f3-explore-decisions-001` | Roster sync is CLI-only, never a panel action |
| DATA-MODEL.md §2.5 R6 | Every registry write is accompanied by an audit row |
| `installer/registry-commit.ts` | Atomic `BEGIN IMMEDIATE` commit (audit row + rename together) |
| PT-05, PT-06 (`cli/main.ts` `validate`) | Project-file identifiers-only validation reused for refusal |
| CONSTITUTION.md autonomy boundary (invariant 2) | No timer or background process ever writes the registry |
