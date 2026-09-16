# send-path Specification

## Purpose

Destination-free send, the v1 validation pipeline plus the secret backstop, the binding assertion
that produces `WRONG_ROOM`, one `DualWriteTransport` per binding, and rate discipline without
auto-retry (Invariant 1, Invariant 5).

## ADDED Requirements

### Requirement: Send input carries no destination

The `send` input schema MUST have no `chat_id`, `bot`, `group`, `to_chat` or any other destination
key; `from` MUST NOT be an input field. The daemon MUST stamp `from` from `binding.agent_id` and
`to_user_id` from the binding's roster.

#### Scenario: Schema-shape assertion has no destination key

- GIVEN the built `send` input schema
- WHEN its shape is inspected
- THEN it contains no `chat_id`, `bot`, `group`, `to_chat`, or `from` key

Traces: ADR-0028 rule 2; PT-02; CONSTITUTION.md §2 inv. 1

### Requirement: chat_id must equal the binding's group_id or the send is refused

Before every `sendMessage` the daemon MUST assert `chat_id === binding.group_id`; on a mismatch it
MUST refuse with `WRONG_ROOM`, write an audit row, and make no network call for that send.

#### Scenario: Two-binding wrong-room CI test

- GIVEN two bindings (A, B) live on one daemon with a fake Telegram client recording `chat_id` per
  call
- WHEN N sends are issued from A's session and N from B's session
- THEN zero calls carrying A's `chat_id` contain B's content and vice versa

#### Scenario: Forced mismatch yields WRONG_ROOM

- GIVEN a session bound to project A whose binding is artificially made to resolve group B's id
- WHEN a send is attempted
- THEN the daemon refuses with `WRONG_ROOM`, writes an audit row, and calls `sendMessage` zero
  times

Traces: ADR-0028 rule 2, row "A message never reaches another binding's group"; THREAT-MODEL.md
T01, PT-01; CONSTITUTION.md §2 inv. 1

### Requirement: Validation pipeline and secret backstop run before any network call

Every send MUST pass, in this order: schema validation; loop prevention (thread known, participant
authorized, addressee correct, not already resolved, `abandoned` only by the originator); the
secret backstop over `body` and `approval_ref` (PEM block, `.env`-style assignment, bot-token
shape, configured marker); the per-binding roster check; the encoded-length guard against
`MAX_BODY_CHARS` / `TELEGRAM_MAX_TEXT_CHARS`.

#### Scenario: Secret-shaped body rejected before any network call

- GIVEN a send whose `body` contains a string matching the bot-token shape
- WHEN the secret backstop runs
- THEN the send is rejected, the error names the rule (never the matched text), and no network call
  is made

#### Scenario: Encoded length guard reports headroom

- GIVEN a send whose body approaches the effective ceiling derived from `MAX_BODY_CHARS` (3000) and
  `TELEGRAM_MAX_TEXT_CHARS` (4096)
- WHEN the guard evaluates it
- THEN a successful send reports `wire.headroom_chars` rather than surfacing a late
  `BODY_TOO_LONG`

Traces: ADR-0028 §"Send carries no destination"; DATA-MODEL.md §7 `MAX_BODY_CHARS`,
`TELEGRAM_MAX_TEXT_CHARS`; PT-15; CONSTITUTION.md §2 inv. 5

### Requirement: One DualWriteTransport per binding

Each active binding MUST be served by its own `DualWriteTransport`, constructed with that binding's
`group_id` and roster; group delivery is attempted first (soft failure except message-level `400`s,
which are hard), then sequential per-recipient DM; the call is rejected only when nothing landed,
and `degraded` is reported when either plane failed. `BROADCAST` fans out only to that binding's
other roster entries.

#### Scenario: BROADCAST never crosses bindings

- GIVEN binding A's roster has two members and binding B's roster has two different members
- WHEN a `BROADCAST` is sent inside binding A's session
- THEN only binding A's roster members receive it; binding B's roster receives nothing

Traces: ADR-0028 §"Isolation does not depend on cwd inference..."; OVERVIEW.md §7.3;
CONSTITUTION.md §2 inv. 1

### Requirement: Rate discipline without auto-retry

An HTTP `429` MUST be surfaced as `RATE_LIMITED{retry_after_s}` with no automatic retry, and the
cursor MUST remain unmoved by the rejected attempt.

#### Scenario: 429 surfaced, cursor unmoved, no retry

- GIVEN Telegram answers `sendMessage` with `429 {retry_after_s: 30}`
- WHEN the daemon receives it
- THEN the tool call returns `RATE_LIMITED{retry_after_s: 30}`, issues no automatic retry, and
  leaves the relevant cursor unmoved

Traces: THREAT-MODEL.md T22, PT-33 (429 half); CONSTITUTION.md §2 inv. 5

## Traceability

| Source | Requirement / Scenario |
|---|---|
| ADR-0028 row "A message never reaches another binding's group" (wrong-room CI test) | chat_id must equal the binding's group_id (PT-01) |
| PT-02 | Send input carries no destination |
| PT-15 | Validation pipeline and secret backstop |
| PT-33 (429 half) | Rate discipline without auto-retry |
