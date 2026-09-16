# ADR-0009 — `ACK` is non-closing; only `RESOLVED` closes

| Field | Value |
|---|---|
| Status | inherited-valid |
| Date | 2026-08-14 (original, v0.1.0 design) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-09 |
| Inheritance verdict | YES in `maps[governance-docs]` |
| Related | [ADR-0007](./0007-loop-prevention.md), [ADR-0013](./0013-basis-abandoned.md), [ADR-0020](./0020-reply-and-turn-tracking.md), [ADR-0027](./0027-needs-action-projects-the-waiting-turn.md) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

Adopted from the v1 `agent-message-protocol` spec: an obligation must not silently expire, and "seen" must be distinguishable from "done" (`openspec/changes/telegram-agent-bus/design.md:217-227`).

## Decision

Both `ACK` and `RESOLVED` are *terminal* for loop prevention (neither may be replied to), but only `RESOLVED` is *closing*.

| Question | Ruling |
|---|---|
| Does `ACK` remove the thread from `needs_action`? | No. It stays until `RESOLVED`, annotated `acked: true` |
| Does `ACK` reset or suppress the reminder clock? | No. The window measures from the `REQUEST`'s first-seen date; otherwise `ACK` would mute an obligation forever, contradicting "MUST NOT silently expire" |
| What does `ACK` buy the reader? | `acked`, `acked_at`, `ack_count` distinguish "ignored entirely" from "seen, in progress" — materially different escalation decisions |
| Which type triggers the mandatory memory save? | `RESOLVED` only; `agentbus_send` returns `obligations: ["mem_save"]` (`src/tools/send.ts:157, 655`) |
| May either type appear in `needs_action`? | No, never |

## Consequences

- The reminder window (`REQUEST_REMINDER_WINDOW_HOURS`, `src/config.ts:53`) is anchored on the request, not on acknowledgements.
- v1.0.0 redefined `needs_action` from "addressed to me" to "my turn" with `REPLY` ([ADR-0020](./0020-reply-and-turn-tracking.md)) and later projected the waiting turn rather than the thread opening ([ADR-0027](./0027-needs-action-projects-the-waiting-turn.md)); both build on, and do not alter, this closure rule.

## Relevance to Conmuta

**Verdict: inherited-valid.** Closure semantics are unchanged and are what D7 maps Arena-light onto: `CONSENSUS` = `RESOLVED`[existing basis] and `ESCALATE` = `RESOLVED`[`abandoned`] + marker, so a debate closes exactly as any other thread does and "CONSENSUS is a message" (Invariant 5), never an action. The `threads` / `needs_action` tables of [ADR-0030](./0030-sqlite-ledger-and-json-registry.md) carry the same `acked` / `ack_count` annotations (draft, F1 SDD spec). The `obligations: ["mem_save"]` output is a host-side convention carried unchanged; no v2 decision alters it.
