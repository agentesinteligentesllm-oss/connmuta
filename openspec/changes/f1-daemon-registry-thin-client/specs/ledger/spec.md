# ledger Specification

## Purpose

The `node:sqlite` (WAL) schema, `PRAGMA user_version` migrations, corruption quarantine, retention,
and the audit-log content rules that keep the store durable and token/body-free (Invariant 2,
Invariant 3, Invariant 5).

## ADDED Requirements

### Requirement: Schema-version migrations and quarantine on corruption or a future version

The ledger MUST open in WAL journal mode with `PRAGMA synchronous = FULL` (D-21) — the offset
confirmed to Telegram MUST NOT outlive a commit lost to a power failure — and MUST track its schema
with `PRAGMA user_version`, running forward-only migrations at open; on corruption or an
unrecognized (future) version, the daemon MUST rename the file to `ledger.corrupt-<epochMs>.db`,
start empty, and raise condition `ledger_quarantined` — never default silently and never delete the
corrupt file.

#### Scenario: Corrupt ledger is quarantined, not defaulted

- GIVEN a `ledger.db` that fails to open (corruption)
- WHEN the daemon starts
- THEN the file is renamed to `ledger.corrupt-<epochMs>.db`, a fresh empty ledger opens, and
  condition `ledger_quarantined` is raised

#### Scenario: Future schema version is quarantined too

- GIVEN a `ledger.db` whose `user_version` is higher than this build knows
- WHEN the daemon opens it
- THEN the same quarantine path runs rather than attempting a downgrade migration

Traces: ADR-0030 rule 5; DATA-MODEL.md §3.0; D-21 (design.md:559), design.md:158 (§5.1 open
sequence); CONSTITUTION.md §2 inv. 3

### Requirement: Audit log is append-only and stores no rejected body or token

Every send, receive and reject MUST append exactly one row to `audit_log` with `ts, project_id,
bot_id, chat_id, client_id, direction, eid, envelope_type, from_user_id, to_user_id, outcome,
reason`; rows for rejected or foreign messages MUST have an empty body column, and no row may ever
match the token regex `\d+:[A-Za-z0-9_-]{35}`.

#### Scenario: Rejected update leaves a bodiless audit row

- GIVEN an update rejected as `foreign_chat`
- WHEN the admission pipeline finishes
- THEN exactly one `audit_log` row exists for it, its body column is empty, and `reason =
  "foreign_chat"`

#### Scenario: No audit row ever matches the token regex

- GIVEN every send, receive and reject path is exercised with a fixture token present in the
  originating request
- WHEN the audit log is scanned afterward
- THEN no row matches the token regex

Traces: ADR-0030 rows "Audit log stores no rejected bodies", "No token in the registry or the
ledger" (ledger half); DATA-MODEL.md §3.6; PT-20; CONSTITUTION.md §2 inv. 5

### Requirement: No token in any ledger table

No write path MUST ever persist a token-shaped string into any ledger table (`offsets`, `updates`,
`threads`, `client_cursors`, `audit_log`, `debate_journal`).

#### Scenario: Token-shaped string through every write path never lands in the database file

- GIVEN a token-shaped string is fed through every ledger write path (poller admission, send-path
  audit, cursor advance)
- WHEN the resulting database file is scanned
- THEN the string never appears in any table

Traces: ADR-0030 row "No token in the registry or the ledger"; DATA-MODEL.md §0; CONSTITUTION.md §2
inv. 2

### Requirement: Retention is a named constant, pruning runs in the daemon

Dedup retention, thread-history capacity, resolved-thread retention, and the open-thread-backlog
condition MUST use the named constants `SEEN_EID_RETENTION_DAYS` (7), `MAX_THREAD_HISTORY` (50),
`RESOLVED_THREAD_RETENTION_DAYS` (30), and `OPEN_THREAD_BACKLOG_THRESHOLD` (50), inherited from v1
with no change. The daemon MUST also sweep, on the `RETENTION_SWEEP_INTERVAL_HOURS` (1 — the
smallest retention unit is a day, so an hourly sweep bounds overshoot to 1/24 of it for one indexed
`DELETE` per table) schedule: `updates` older than `INBOX_RETENTION_DAYS` (= `SEEN_EID_RETENTION_DAYS`,
7 — `updates` is the dedup set, `UNIQUE (project_id, eid)`, so the same argument bounds it);
`audit_log` older than `AUDIT_RETENTION_DAYS` (`RESOLVED_THREAD_RETENTION_DAYS` * 3 = 90 — an
incident on any still-readable thread stays reconstructable from the audit log); `unknown_senders`
unseen for `UNKNOWN_SENDER_RETENTION_DAYS` (= `RESOLVED_THREAD_RETENTION_DAYS`, 30 — a stranger
silent for a month is not a bootstrap candidate); and `client_cursors` unseen for
`CLIENT_SESSION_STALE_HOURS` (= `BOT_API_RETENTION_HOURS`, 24 — a session silent for the whole
retention window is a dead IDE, and its cursor is already behind the catch-up window). Pruning MUST
run inside the daemon on this schedule, never on a client call.

#### Scenario: thread_history is capped, not truncated on read

- GIVEN a thread with more than `MAX_THREAD_HISTORY` (50) history entries
- WHEN the daemon prunes it
- THEN the cap is enforced by the daemon's own pruning pass, not by the `thread` tool truncating
  its response

#### Scenario: Hourly sweep removes rows past each window, keeps everything younger

- GIVEN `updates`, `audit_log`, `unknown_senders`, and `client_cursors` rows older than their
  respective retention window (`INBOX_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`,
  `UNKNOWN_SENDER_RETENTION_DAYS`, `CLIENT_SESSION_STALE_HOURS`), each mixed with rows one unit
  younger than the window
- WHEN the daemon's retention sweep runs on its `RETENTION_SWEEP_INTERVAL_HOURS` schedule
- THEN every row older than its window is deleted from its table and every row younger survives

Traces: DATA-MODEL.md §7; design.md:96-114 (§3 named constants); CONSTITUTION.md §5

## Traceability

| Source | Requirement / Scenario |
|---|---|
| ADR-0030 row "Registry validation and quarantine" (ledger analogue) | Schema-version migrations and quarantine |
| ADR-0030 row "Audit log stores no rejected bodies" | Audit log is append-only (PT-20) |
| ADR-0030 row "No token in the registry or the ledger" | No token in any ledger table; Audit log token scan |
| DATA-MODEL.md §7 named constants | Retention is a named constant -> Hourly sweep removes rows |
| D-21 (design.md:559) | Schema-version migrations and quarantine -> WAL + PRAGMA synchronous = FULL |
