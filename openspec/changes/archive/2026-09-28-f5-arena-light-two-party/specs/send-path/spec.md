# Delta for send-path

## ADDED Requirements

### Requirement: Marker-aware silence for debate REPLY turns

`disable_notification` MUST be true only for a debate-marked REPLY (AUDIT/COUNTER); an ordinary
REPLY and every PROPOSAL/CONSENSUS/ESCALATE-marked envelope MUST remain notifying, extending the
existing lifecycle-boundary rule (`send-path.ts:160-172`) rather than replacing it.

#### Scenario: Debate-marked REPLY is silent

- GIVEN a REPLY carrying a debate AUDIT or COUNTER marker
- WHEN it is sent
- THEN `disable_notification` is true

#### Scenario: An ordinary REPLY still notifies

- GIVEN a REPLY with no debate marker
- WHEN it is sent
- THEN `disable_notification` is false, unchanged from today

### Requirement: Each debate turn is exactly one rate-budget hit, never retried

A debate turn (`ARENA_LIGHT_MESSAGES_PER_ROUND` = 1 send) MUST reach `GROUP_MESSAGES_PER_MINUTE`
exactly once per send, with no queue or retry — AUDIT and COUNTER are never composed into one
outbound REPLY (different roles, `thread.to`/`thread.from`; see the arena-light-debates spec).

#### Scenario: Each turn hits the rate check exactly once

- GIVEN an AUDIT and a COUNTER, each due in its own round
- WHEN each is sent
- THEN each is evaluated against `GROUP_MESSAGES_PER_MINUTE` exactly once, with no retry issued

## MODIFIED Requirements

### Requirement: Validation pipeline and secret backstop run before any network call

Every send MUST pass, in this order: schema validation; loop prevention (thread known, participant
authorized, addressee correct, not already resolved, `abandoned` only by the originator); for a
debate turn whose body contains a COUNTER section, round-cap validation, refusing the (cap+1)-th
COUNTER on a debate thread with `ROUNDS_EXHAUSTED`; the secret backstop over `body` and
`approval_ref` (PEM block, `.env`-style assignment, bot-token shape, configured marker); the
per-binding roster check; the encoded-length guard against `MAX_BODY_CHARS` /
`TELEGRAM_MAX_TEXT_CHARS`.
(Previously: the pipeline had no round-cap stage; a debate thread's COUNTER count was not checked.)

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

#### Scenario: (cap+1)-th COUNTER refused before the secret backstop runs

- GIVEN a debate thread already at its round cap
- WHEN another COUNTER is sent
- THEN the pipeline refuses it with `ROUNDS_EXHAUSTED` before the secret backstop or any network
  call runs

Traces: ADR-0028 §"Send carries no destination"; DATA-MODEL.md §7 `MAX_BODY_CHARS`,
`TELEGRAM_MAX_TEXT_CHARS`; PT-15; THREAT-MODEL.md PT-23 clause 1; CONSTITUTION.md §2 inv. 5

## Traceability

| Source | Requirement |
|---|---|
| send-path.ts:160-172 (lifecycle-boundary silence rule) | Marker-aware silence for debate REPLY turns |
| THREAT-MODEL.md T22/PT-33 | Each debate turn is one rate-budget hit, never retried |
| THREAT-MODEL.md PT-23 clause 1 | Validation pipeline round-cap stage (MODIFIED) |
