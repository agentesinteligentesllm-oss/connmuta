# Arena-light Debates Specification

## Purpose

Two-party debate turns (PROPOSAL/AUDIT/COUNTER/CONSENSUS/ESCALATE) as body markers on existing
wire types (F5, D7); no new `type`/`basis`; reuses F1's thread rules.

## Requirements

### Requirement: Debate turns map onto existing wire types

The system MUST express each debate turn as an existing `type`/`basis` pair plus a body marker
and MUST NOT add a new one.

| Turn | type | basis |
|---|---|---|
| PROPOSAL | REQUEST | none |
| AUDIT / COUNTER | REPLY | none (forbidden by schema) |
| CONSENSUS | RESOLVED | `context-shared` |
| ESCALATE | RESOLVED | `abandoned` |

An AUDIT/COUNTER verdict MUST be `APPROVE`/`APPROVE_WITH_CHANGES`/`REJECT` (Arena Orion's
vocabulary, `GOVERNANCE.md:50`).

#### Scenario: Built envelope matches the marker table

- GIVEN a PROPOSAL and a CONSENSUS are each built
- WHEN inspected
- THEN PROPOSAL is `REQUEST`/no `basis`; CONSENSUS is `RESOLVED`/`context-shared`; both carry a
  marker

### Requirement: Round cap refuses the (cap+1)-th COUNTER

The daemon MUST enforce round cap `ARENA_LIGHT_MAX_ROUNDS` = 3 (T13; mirrors the tribunal's
3-round shape, `GOVERNANCE.md:56-59`), refusing a COUNTER beyond it `ROUNDS_EXHAUSTED`,
journaling no refusal row.

#### Scenario: Cap boundary enforced exactly

- GIVEN a debate at round 2 of 3
- WHEN a COUNTER is sent, then another
- THEN the first is journaled; the second is refused `ROUNDS_EXHAUSTED`, unjournaled

### Requirement: Participation and scope reuse existing invariants

A turn from anyone but thread `from`/`to` MUST be rejected `NOT_PARTICIPANT`; COUNTER MUST come
only from `thread.from` (else `NOT_ORIGINATOR`), AUDIT only from `thread.to` (else
`NOT_ADDRESSEE`) — whoever hits the round cap always holds `RESOLVED[abandoned]` authority.
`debate_id` = the PROPOSAL `thread_id`; every row stays scoped to `(project_id, thread_id)`.

#### Scenario: Non-participant and wrong-role turns rejected; journal stays scoped

- GIVEN a debate between two agents under project A
- WHEN a third agent attempts AUDIT/COUNTER, and the addressee separately sends a COUNTER
- THEN both are refused (`NOT_PARTICIPANT`, `NOT_ORIGINATOR`); every row's `project_id` is A

### Requirement: Debate bodies are pointer-only, never inline patches

`refs` MUST be pointer-only (commit, PR, path, memory id); an inline diff/patch body MUST be
rejected — no PATCH auto-applies.

#### Scenario: Inline patch rejected, pointer-only accepted

- GIVEN one COUNTER embeds a literal diff, another cites a commit sha and PR number
- WHEN each is validated
- THEN the first is refused; the second is accepted

### Requirement: CONSENSUS and ESCALATE are message-only closures

Closing MUST produce no filesystem/process effect beyond the RESOLVED send and journal write;
CONSENSUS (`RESOLVED[context-shared]`) MUST be sent only by the addressee (`thread.to`,
`validate.ts:284-298`), ESCALATE (`RESOLVED[abandoned]`) only by `thread.from` (ADR-13).

#### Scenario: CONSENSUS is side-effect-free and addressee-only; ESCALATE is originator-only

- GIVEN one debate reaches CONSENSUS, another is at its round cap
- WHEN the addressee sends CONSENSUS, and separately attempts ESCALATE
- THEN CONSENSUS's only effects are the send and one journal row; the ESCALATE attempt is
  refused `NOT_ORIGINATOR`

### Requirement: The coalesced debate REPLY is exactly one silent send

When AUDIT and COUNTER are both due in one round, they MUST compose into one REPLY, two
delimited sections, counted once against rate budget; `disable_notification` MUST be true for
any debate REPLY — PROPOSAL/CONSENSUS/ESCALATE stay notifying.

#### Scenario: One silent send, other turns notify

- GIVEN both AUDIT and COUNTER are owed in one round, and a separate PROPOSAL
- WHEN sent
- THEN one REPLY carries both sections, sent silently, counted once; the PROPOSAL notifies

### Requirement: Every debate turn is durably journaled

Each accepted turn appends one row to `debate_journal` (§3.7); round count MUST survive a daemon
restart.

#### Scenario: Round count survives a restart

- GIVEN a debate mid-round when the daemon restarts
- WHEN the next COUNTER is sent
- THEN the cap enforces the persisted count, not a reset

## Traceability

| Source | Requirement |
|---|---|
| WORK-PLAN:99-110; D7; PT-23 | Wire/verdict; round cap; scope; pointer-only |
| ADR-13; T22/PT-33 | Closures; coalesced REPLY |
| DATA-MODEL §3.7 | Journal |
