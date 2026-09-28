# Delta for ledger

## ADDED Requirements

### Requirement: Forward migration adds `debate_journal` at schema version 2

The ledger's migration path MUST include a version-2 step (`LEDGER_SCHEMA_VERSION` 1 -> 2) that
creates `debate_journal` per DATA-MODEL.md §3.7, applied inside the same forward-only,
one-transaction-per-step discipline as the version-1 step; a version-1 ledger MUST migrate to
version 2 automatically at open, and `debate_journal` rows MUST be durable across a daemon
restart.

#### Scenario: A version-1 ledger migrates to version 2 at open

- GIVEN a ledger file stamped at schema version 1
- WHEN the daemon opens it
- THEN the version-2 step runs inside one transaction, `debate_journal` exists, and
  `PRAGMA user_version` reads 2

#### Scenario: A failed version-2 step leaves the ledger at version 1

- GIVEN the version-2 migration step throws partway through
- WHEN the daemon opens the ledger
- THEN no partial `debate_journal` schema is committed and `PRAGMA user_version` still reads 1

Traces: DATA-MODEL.md §3.7; migrations.ts forward-only / one-transaction-per-step contract;
proposal.md "F1's first schema change since the initial DDL"

## Traceability

| Source | Requirement |
|---|---|
| DATA-MODEL.md §3.7 (D7, F5) | Forward migration adds debate_journal at schema version 2 |
| migrations.ts (forward-only, one-transaction-per-step) | A failed version-2 step leaves the ledger at version 1 |

## Note (no MODIFIED block)

`openspec/specs/ledger/spec.md`'s "No token in any ledger table" requirement already lists
`debate_journal` in its table enumeration — a forward reference the F1 archive carried ahead of
this change, matching DATA-MODEL.md §3.7's own "(D7, F5)" tag. No other existing requirement's
assertions change: the schema-version-migration-and-quarantine requirement is already generic
over any future version. This delta is ADDED-only by design (per sdd-spec's
ADDED-vs-MODIFIED rule), not an omission.
