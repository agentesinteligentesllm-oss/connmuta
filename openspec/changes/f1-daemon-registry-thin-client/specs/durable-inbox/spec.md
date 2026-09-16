# durable-inbox Specification

## Purpose

The per-token poller loop, the write-ahead admission transaction with the new chat-scope check, the
pending-unknown-sender list, per-client cursors and surfaced state, and the ledger-side `timeout_s`
long-poll (Invariant 3, Invariant 4).

## ADDED Requirements

### Requirement: Write-ahead before offset confirmation

Every poll MUST write admitted updates to the `updates` inbox, `threads` and `audit_log` inside one
transaction before `offsets.next_update_id` advances; the next `getUpdates` call MUST carry the new
offset only after commit.

#### Scenario: Crash between insert and offset advance replays once

- GIVEN a simulated crash after the inbox insert but before the offset-advance commit
- WHEN the daemon restarts and polls again
- THEN Telegram redelivers the update, it is deduplicated by `UNIQUE (bot_id, update_id)`, and it
  is neither lost nor surfaced twice

Traces: ADR-0030 row "Write-ahead before offset confirm"; DATA-MODEL.md §3.0, §3.2; PT-10;
CONSTITUTION.md §2 inv. 3

### Requirement: Seven-step admission pipeline with the chat-scope check

Each update MUST pass, in order: (1) `message.text` present, else `non_envelope`; (2) sentinel
decodes as `AGENTBUS/1` or `/2`, else `malformed`/`unsupported_version`; (3) `chat.id ===
binding.group_id` or `chat.type === "private"`, else `foreign_chat`, counted, audited, dropped; (4)
`message.from.id` is in `binding.roster`, else `unknown_sender`, recorded in the pending list
without a body, dropped; (5) sender is not `binding.agent_id` (self-filter, dropped uncounted); (6)
`eid` dedup, anchor translation, `applyEnvelope`; (7) append to `updates`, `threads`, `audit_log`.
Rejected updates leave a bodiless audit row; `updates.body` MUST be `NULL` for `apply_outcome`
values `rejected` and `ignored`, and MUST be kept for `not_mine` and `noted` (D-20).

#### Scenario: Foreign chat dropped and audited without a body

- GIVEN an update whose `chat.id` is neither `binding.group_id` nor a roster member's private chat
- WHEN the admission pipeline runs
- THEN the update is counted `foreign_chat`, produces no `needs_action`, no reply, and an audit
  row with no body

#### Scenario: Unknown sender recorded, never surfaced

- GIVEN a `message.from.id` absent from `binding.roster`
- WHEN the admission pipeline runs
- THEN the sender is counted `unknown_sender`, recorded in the pending list with `user_id` and
  `username` only, and the update is dropped before any body is persisted

#### Scenario: Mixed batch isolates human chat text

- GIVEN one poll batch containing a human chat message, a valid envelope, a malformed envelope, a
  self-echo, and a duplicate `eid`
- WHEN the admission pipeline classifies the batch
- THEN the human chat text is counted `non_envelope` and is absent from every output list and every
  audit body

#### Scenario: updates.body is NULL for rejected and ignored, kept for not_mine and noted

- GIVEN four updates admitted with `apply_outcome` values `rejected`, `ignored`, `not_mine`, and
  `noted` respectively
- WHEN each row is inserted into `updates`
- THEN the `rejected` and `ignored` rows have a `NULL` `body` column, and the `not_mine` and `noted`
  rows keep their body

Traces: ADR-0028 rows "Foreign chats and unknown senders are dropped", "Pending unknown senders
carry no body"; OVERVIEW.md §7.2; PT-03, PT-04, PT-31; D-20 (design.md:558), design.md:168-180
(§5.2 DDL), design.md:239-240 (§5.2 notes); CONSTITUTION.md §2 inv. 4

### Requirement: Forged sender never overrides the verified identity

`from_agent_id` on every stored row MUST be derived from the reverse-roster lookup of the verified
Telegram `message.from.id`, never from the envelope's self-declared `from` field.

#### Scenario: Envelope's own from claim is discarded

- GIVEN an envelope whose `from` field names `@bob-agent` but whose Telegram sender resolves to
  `@alice-agent` in the roster
- WHEN the update is admitted
- THEN the stored `from_agent_id` is `@alice-agent`, and the envelope's own claim is never surfaced
  as the sender

Traces: ADR-0028 §"Scope check on ingest"; PT-16; CONSTITUTION.md §2 inv. 4

### Requirement: A null addressee anchor fails closed (D-05)

A thread transition whose addressee anchor cannot be resolved from either the wire `to_user_id` or
the local roster lookup MUST be counted `unanchored` and rejected; it MUST NOT be authorized. This
replaces v1's fail-open branch (v1 `protocol.ts:98-99`) without any wire change.

#### Scenario: Unanchored transition is rejected, not authorized

- GIVEN a thread whose `to_user_id` is `null` because a legacy `/1` peer omitted the anchor and no
  local roster match resolves it
- WHEN a reply attempts to close or continue that thread
- THEN the daemon counts it `unanchored` and rejects the transition

Traces: D-05; THREAT-MODEL.md §5.7; PT-17; CONSTITUTION.md §2 inv. 4

### Requirement: Per-client cursors and surfaced state decouple presentation

`fetch` MUST read from the calling client's `client_cursors.inbox_seq`, and `client_surfaced`
(`first_surfaced_at` per `client_id`/`thread_id`) MUST replace v1's global surfaced flags so that
`body_omitted` applies only to what that client already saw. Advancing one client's cursor MUST NOT
move another client's cursor. A NEW client session's `inbox_seq` MUST initialize at the newest
`updates.seq` older than `SESSION_CATCHUP_HOURS` (D-19, = `BOT_API_RETENTION_HOURS`, 24 h), so a
fresh client sees the same window a v1 session would have gotten directly from Telegram.

#### Scenario: Two clients each see the full batch once

- GIVEN two client sessions on the same binding, neither having fetched yet
- WHEN both call `fetch`
- THEN each receives the same batch of new rows with no `body_omitted` collision, and advancing
  client A's `inbox_seq` leaves client B's `inbox_seq` unchanged

#### Scenario: A fresh session's cursor starts at the catch-up window, not at zero

- GIVEN a binding with `updates` rows spanning several days and no prior session for a new
  `client_id`
- WHEN that client's first `fetch` call creates its `client_cursors` row
- THEN `inbox_seq` initializes at the newest `updates.seq` whose `received_at` is older than
  `SESSION_CATCHUP_HOURS` (24 h), not at 0 and not at the current newest `seq`

Traces: ADR-0030 row "Per-client cursors"; DATA-MODEL.md §3.5; PT-11; D-19 (design.md:557),
design.md:101 (§3), design.md:342 (§8.4); CONSTITUTION.md §2 inv. 3

### Requirement: timeout_s is a long-poll against the ledger (D-02)

`fetch`'s `timeout_s` MUST block the IPC call up to `timeout_s` seconds waiting for rows past the
caller's `inbox_seq`, clamped by a value derived from `MAX_LONGPOLL_SECONDS` (never forwarded to
Telegram); the input schema is unchanged from v1's `fetchInputSchema`.

#### Scenario: fetch blocks against new ledger rows, not Telegram

- GIVEN a client calls `fetch` with `timeout_s: 20` and no new rows exist yet past its `inbox_seq`
- WHEN a new row is admitted 5 seconds later
- THEN the pending `fetch` call resolves within that window against the ledger, without issuing
  any `getUpdates` call itself

#### Scenario: timeout_s is clamped

- GIVEN a client calls `fetch` with `timeout_s` above the constant derived from
  `MAX_LONGPOLL_SECONDS`
- WHEN the call is accepted
- THEN the effective wait is clamped to the derived constant, never the caller's raw value

Traces: D-02; DATA-MODEL.md §7 `MAX_LONGPOLL_SECONDS`; exploration.md Q3

### Requirement: needs_action and seen_eids resolve DATA-MODEL's open points (D-06)

`needs_action` MUST be implemented as a VIEW (or an equivalently live derived query) over `threads`
indexed on `(project_id, status, awaiting)`, never a separately maintained table; `seen_eids`
dedup MUST be enforced by `UNIQUE (project_id, eid)` on `updates`, never a separate table.

#### Scenario: needs_action reflects threads without a write-behind step

- GIVEN a `threads` row transitions to `status: open, awaiting: @alice-agent`
- WHEN `needs_action` is queried for `@alice-agent`
- THEN the row appears immediately, with no separate write having populated a `needs_action` table

#### Scenario: Duplicate eid within a project is rejected at the constraint

- GIVEN an update whose envelope `eid` was already admitted for the same `project_id`
- WHEN the insert into `updates` is attempted
- THEN the `UNIQUE (project_id, eid)` constraint rejects the duplicate row

Traces: D-06; DATA-MODEL.md §8 open points "needs_action as VIEW vs table", "seen_eids as table vs
UNIQUE index"

## Traceability

| Source | Requirement / Scenario |
|---|---|
| ADR-0030 row "Write-ahead before offset confirm" | Write-ahead before offset confirmation (PT-10) |
| ADR-0030 row "Per-client cursors" | Per-client cursors and surfaced state (PT-11) |
| ADR-0028 rows "Foreign chats/unknown senders dropped", "Pending unknown senders carry no body" | Seven-step admission pipeline (PT-03, PT-04, PT-31) |
| PT-16 | Forged sender never overrides the verified identity |
| PT-17 | A null addressee anchor fails closed (D-05) |
| D-02 | timeout_s is a long-poll against the ledger |
| D-06 | needs_action and seen_eids resolve DATA-MODEL's open points |
| D-19 (design.md:557) | Per-client cursors -> A fresh session's cursor starts at the catch-up window |
| D-20 (design.md:558) | Seven-step admission pipeline -> updates.body is NULL for rejected/ignored |
