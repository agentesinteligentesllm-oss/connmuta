# ADR-0004 — Dual-channel delivery: group for humans, direct bot-to-bot DM for agents

| Field | Value |
|---|---|
| Status | inherited-valid |
| Date | 2026-08-14 (original, v0.1.0 design); group failure semantics amended 2026-08-15 by ADR-0014 |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-04 |
| Inheritance verdict | YES in `maps[governance-docs]`; confirmed by `bus-v2-landing-architecture-001` D1, D2 |
| Related | [ADR-0010](./0010-roster-three-roles.md), [ADR-0011](./0011-eid-dedup.md), [ADR-0014](./0014-group-outage-soft.md), [ADR-0028](./0028-project-scoped-bijective-binding.md) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

A group-only design depended on an unconfirmed claim: that bots can see each other's group posts. Direct username-addressed bot-to-bot messaging, by contrast, is confirmed by the Bot API 10.0 changelog (2026-05-08): "Added the ability to send messages to other bots via username if both bots enabled bot-to-bot communication" (`openspec/changes/telegram-agent-bus/design.md:67-86`). Neither channel alone satisfied both concerns — human observability and agent delivery.

## Decision

Every outgoing envelope is written to two channels by the send tool, byte-identical:

| Order | Channel | Purpose | Failure semantics (original) |
|---|---|---|---|
| 1 | Group post — `sendMessage(chat_id: <group>)` | Human observability: everyone sees every envelope in one place; the record of intent | Hard failure — softened by ADR-0014 to soft, with a persisted outage condition |
| 2 | Direct bot-to-bot DM — one per addressee (`REQUEST`/`ACK`/`RESOLVED` → one; `BROADCAST` → fan-out) | The authoritative agent-to-agent delivery path | Soft, reported per recipient; never rolls back the group post |

Each bridge reads its own bot's `getUpdates` — a single exclusive cursor already covering both its private inbox and the group — and treats the private inbox as the authoritative "addressed to me" source. The `Transport` port (`src/transport/types.ts`) is composed as `DualWriteTransport` over `GroupTransport` and `DirectTransport` (`src/transport/{dual,group,direct}.ts`).

Rejected: group-broadcast-only (depends entirely on the unconfirmed claim); DM-only (destroys single-pane human observability).

## Consequences

- The `telegram-transport` spec was amended from "Shared Private Group as Sole Channel" to "Dual-Channel Delivery — Shared Group Plus Direct Per-Addressee DM", with the human-observability intent preserved and byte-identical payloads required (`openspec/changes/telegram-agent-bus/specs/telegram-transport/spec.md:32-42`).
- **New attack surface.** Enabling Bot-to-Bot Communication Mode makes the DM inbox reachable by any opted-in bot that knows the username, not only group members. The roster allowlist was therefore promoted from an attribution nicety to a hard security boundary: envelopes from a sender absent from the roster are dropped and counted, never surfaced ([ADR-0010](./0010-roster-three-roles.md)).
- Two copies of one envelope may reach the same bridge; deduplication by `eid` exists for that reason ([ADR-0011](./0011-eid-dedup.md)).

## Relevance to Conmuta

**Verdict: inherited-valid.** The two-plane transport is reused as a library (D1) and is the seam the new topology builds on:

- Per (bot, group) the pair maps 1:1 onto a project, and because the DM plane is per bot token, isolation follows the bot. This is the mechanical basis of D2's **bijective binding** bot <-> group <-> project ([ADR-0028](./0028-project-scoped-bijective-binding.md)). The direct plane addresses by username and carries no project context (`src/transport/direct.ts:42-66`), which is exactly why the alternative "one bot per human across N groups" was rejected: it would require `AGENTBUS/3` and break compatibility.
- Invariant 1 tightens the group leg: send carries no destination; the daemon derives (bot, group, roster) from the binding fixed at MCP-session start and asserts `chat_id === binding.group_id` before every `sendMessage`; a two-binding "wrong room" test runs in CI.
- Invariant 4 inherits the roster-as-boundary consequence: chat must be the binding's group or a private chat from a roster member; anything else is counted (`foreign_chat` / `unknown_sender`) and dropped.
- The ambiguity this ADR designed around is still open: whether a non-admin bot with privacy disabled sees other bots' group posts (AND vs OR semantics between two official pages) is spike B-07. Bot-to-bot DM requires both bots opted in via BotFather (verified fact).
- Telegram's ~20 messages/min per group limit (verified fact) is why D7 coalesces `AUDIT`+`COUNTER` and posts debate turns with `disable_notification`; the two-channel write cost per envelope is unchanged.
