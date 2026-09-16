# ADR-0007 — Loop prevention in the tool layer

| Field | Value |
|---|---|
| Status | inherited-valid |
| Date | 2026-08-14 (original, v0.1.0 design); `NOT_ORIGINATOR` exception added 2026-08-15 by ADR-0013 |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-07 |
| Inheritance verdict | YES in `maps[governance-docs]` |
| Related | [ADR-0009](./0009-ack-non-closing.md), [ADR-0013](./0013-basis-abandoned.md), [ADR-0020](./0020-reply-and-turn-tracking.md) (`REPLY`) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

Two agents replying to each other's replies would loop. Prevention belongs in the tool layer, before any network call, so that it does not depend on agent judgment (`openspec/changes/telegram-agent-bus/design.md:199-207`).

## Decision

`agentbus_send` hard-rejects, before any network call (`src/tools/send.ts:162-170, 262-327`):

| Condition | Code | Note |
|---|---|---|
| `ACK`/`RESOLVED` whose `thread` is unknown to local state | `UNKNOWN_THREAD` | Recovery: run `agentbus_fetch` |
| `ACK`/`RESOLVED` on a thread whose opening envelope was not a `REQUEST` | `NOT_REQUESTABLE` | Acknowledging a `BROADCAST`, `ACK` or `RESOLVED` is structurally impossible |
| `ACK`/`RESOLVED` on a thread whose `to` is not this agent | `NOT_ADDRESSEE` | One exception: `RESOLVED` with `basis: "abandoned"` is the originator's to send; a non-originator gets `NOT_ORIGINATOR` ([ADR-0013](./0013-basis-abandoned.md)) |
| `RESOLVED` on an already-resolved thread | `ALREADY_RESOLVED` | Re-`ACK` is allowed and increments `ack_count` |

`from` is never a tool input; the bridge stamps it from local config.

## Consequences

- `ACK` and `RESOLVED` are terminal: nothing may reply to them ([ADR-0009](./0009-ack-non-closing.md)).
- The rules are structural, so a misbehaving or injected agent cannot reopen a closed thread or answer on someone else's behalf through the bus.
- v1.0.0 added `REPLY` and turn tracking on top of these rules ([ADR-0020](./0020-reply-and-turn-tracking.md)); the reply itself is not gated on turn.

## Relevance to Conmuta

**Verdict: inherited-valid.** `src/protocol.ts` and the send-side rules are reused as a library (D1). Two v2 decisions rely on them:

- **Arena-light (D7)** is expressed as markers over `REQUEST`/`REPLY`/`RESOLVED`, so every debate turn is already subject to `UNKNOWN_THREAD`, `NOT_REQUESTABLE`, `NOT_ADDRESSEE` and `ALREADY_RESOLVED`; the daemon adds an enforced **round cap** on top, and Invariant 5 states that rounds and participants are capped.
- **Identity stamping** moves from "local config" to the binding: the daemon derives the sender from the binding fixed at MCP-session start (Invariant 1); `from` remains never a tool input.
