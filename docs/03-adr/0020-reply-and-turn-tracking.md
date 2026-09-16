# ADR-0020 — `REPLY` and turn tracking: from mailbox to conversation

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-valid |
| **Date** | 2026-08-15 (shipped with v1 `v1.0.0`, tag `99032dc`) |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:425-447` (ADR-20); written with `v1.0.0` per v1 `docs/functional-audit/HANDOFF.md:360` |
| **Supersedes / superseded by** | — / payload projection refined by [ADR-0027](./0027-needs-action-projects-the-waiting-turn.md) |

## Context

The v1 audit's verdict was that the bus was an excellent message *delivery pipe* while the objective needed a *collaboration medium*, and the widest gap was that there was no way to continue a thread. A peer could acknowledge or resolve, never ask back. The originator went blind: the peer asks "which branch?" with no type to ask it, while the thread sits in the originator's pending list with no signal the ball came back.

## Decision

**Two free options were rejected before the one that costs wire.** Overloading `ACK` makes turn-tracking uncomputable (`ACK` means "received, not yet answered"; if a substantive answer shares that type the machine cannot tell whose turn it is) and makes the human plane lie. Reusing `REQUEST` with an existing `thread` is worse than a mislabel: an old peer's `applyEnvelope` builds a **new** `ThreadRecord` and overwrites the existing one, taking `from`, `opened_at`, `ack_count` and the whole history with it — silent data corruption.

| Rule | Reason |
|---|---|
| **`REPLY` requires a thread and an addressee, forbids a `basis`, either participant may send it** | Every value `basis` can take describes work being closed; permitting one would let a mid-conversation message masquerade as a resolution and cross ADR-0006 layer 4 sideways. `RESOLVED` stays terminal (ADR-0007): a reply cannot reopen a closed thread |
| **A reply is not gated on whose turn it is** | Multipart was closed permanently on the argument that an agent with more to say sends two replies; refusing an out-of-turn reply would break the remedy that replaced multipart. A reply only ever *sets* the turn |
| **`needs_action` stops meaning "addressed to me" and means "whose turn it is"** | With multi-turn the two diverge in both directions. `awaiting` holds the turn: the addressee after `REQUEST`, the other participant after a `REPLY`, nobody after `RESOLVED`. `ACK` never moves it — ADR-0009 seen from the turn's side |
| **`awaiting` stays off the wire** | Derived deterministically from the message sequence; carrying it would make it sender-declared and therefore forgeable. It is sound only because [ADR-0021](./0021-agentbus-2-accept-both-decoder.md)'s `to_user_id` is translated at the trust boundary first — which is why the wire field shipped before turn tracking |
| **`outbound_pending` became `waiting_on_peer`** | Membership by participation with `awaiting !== me` makes the union with `needs_action` total and the two disjoint. Security consequence: that list now carries inbound bodies, so fencing is decided by authorship, never by list membership |
| **`agentbus_thread` is the fourth MCP tool** | A pure read of local state whose deps type has no `TelegramClient` field; unlike the rejected peer-probe tool it needs no network. Its output is bounded by `MAX_THREAD_HISTORY`, not capped a second time |

**Two things the implementation learned.** The quiet-tick digest needed `history.length` as well as `awaiting` (a consecutive follow-up leaves the turn where it was; a dedicated `reply_count` field was rejected because it would have cost the second state migration [ADR-0015](./0015-state-integrity-validate-quarantine-migrate-once.md) exists to avoid). And a test fixture could build a state the machine cannot reach — an outbound thread awaiting its own author — the third time in v1 a defect lived behind a passing assertion.

## Consequences

- `REPLY` in the type enum and the `basis` prohibition: v1 `src/envelope.ts:35`, `:71-83`. Turn assignment: v1 `src/protocol.ts:305`; `isNeedsAction` as a turn predicate: `:475-476`. `MAX_THREAD_HISTORY = 50` (v1 `src/config.ts:155`); the thread tool's deps carry no client (v1 `src/tools/thread.ts:72`).
- `REPLY` is one of the three items of the v1 wire delta sealed by rule 8 (v1 `docs/functional-audit/HANDOFF.md:311-314`).

Pinned by (v1 tests): `test/protocol.test.ts:168-217` turn assignment for `REQUEST`, `REPLY` both directions, consecutive replies, `ACK` never moves the turn, `RESOLVED` clears it; `:226` never-party `REPLY` rejected; `:237` `REPLY` cannot reopen a resolved thread; `:247` `isNeedsAction` is turn-based; `:262`, `:278` digest moves on turn change and on a second reply; `test/envelope.test.ts:366-391` `REPLY` schema, addressee required, `basis` forbidden, header names the type; `test/tools/thread.test.ts:101` thread tool deps have no client field.

## Relevance to Conmuta

- **The turn model is the vehicle for Arena-light.** D7 encodes 2-party debates as body-marker subtypes over this thread model with no new envelope type: `PROPOSAL = REQUEST[marker]`, `AUDIT`/`COUNTER = REPLY[marker + verdict token]`, `CONSENSUS = RESOLVED[existing basis]`, `ESCALATE = RESOLVED[basis abandoned] + marker`. The analysis bundle had warned that new types would be a wire change (`governance-docs` key_facts[20]); the tribunal resolved it by choosing markers, so this ADR carries with no wire consequence.
- **Round caps are daemon-enforced (D7).** A reply is still not gated on turn at the protocol level; the cap is a separate rule on debate turns, to be specified in the F5 SDD spec ([WORK-PLAN](../07-plan/WORK-PLAN.md)).
- "Multipart messages" stays on the closed-permanently list ([CONSTITUTION](../01-constitution/CONSTITUTION.md)); D7's pointer-only payloads are the intended remedy for long debate turns.
- Analysis verdict: YES.
