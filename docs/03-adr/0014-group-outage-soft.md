# ADR-0014 — Group availability: the observability plane may fail alone (v0.5.1)

| Field | Value |
|---|---|
| Status | inherited-valid |
| Date | 2026-08-15 (v0.5.1) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-14 |
| Inheritance verdict | YES in `maps[governance-docs]`; v1 hard rule 12 (`docs/functional-audit/HANDOFF.md:297-326`) |
| Related | [ADR-0004](./0004-dual-channel-delivery.md), [ADR-0010](./0010-roster-three-roles.md), [ADR-0015](./0015-state-integrity-validate-quarantine-migrate-once.md) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

First release of the v1 functional-improvement programme, closing findings D5 and D1 of `docs/functional-audit/`. A basic group promoted to a supergroup makes the Bot API answer 400 with `parameters.migrate_to_chat_id`, and the old `chat_id` dies permanently. Three separate facts composed into a total outage: the client never declared `migrate_to_chat_id`, so the remedy was discarded at the type boundary; a group-post failure was hard, so `DualWriteTransport` propagated before attempting a single DM; and the production group was a basic group. Routine trigger, complete outage, and an error naming none of it (`openspec/changes/telegram-agent-bus/design.md:321-346`).

## Decision

The group post reports its failure instead of throwing — with one exception.

| Option | Verdict |
|---|---|
| Auto-follow the migration | **Rejected permanently.** `chat_id` is an access-control boundary exactly as the roster is; following silently means posting to a room no operator authorized — a vector a careless or hostile group admin can arrange. Surface the new id; a human makes the one-line edit |
| Keep the group post hard, fix only the error message | Rejected: it names the outage but the DM plane still dies with it |
| Soft-fail the group; hard-fail only when nothing was delivered anywhere | **Chosen.** The honest definition of a failed send; the documented `delivery.group.{ok:false,error}` arm becomes true rather than widened (`src/transport/dual.ts:30-61`) |
| Soft-fail everything, including a malformed payload | Rejected: a 400 caused by the message itself is rejected identically by every DM, so the fan-out spends doomed calls |

**Why an unclassified 400 still attempts the DMs.** Telegram answers 400 both for a malformed payload and for a vanished chat; only a narrow description table separates them. The residue is decided by asymmetry: wrong toward attempting costs at most one doomed call per recipient; wrong toward hard failure costs the bus. If the payload was at fault, N identical errors in `delivery.direct` are the best available diagnostic.

**The third piece, without which the first two are not acceptable.** A silent degrade would let two agents hold an entire exchange invisible to the humans — the opposite of [ADR-0004](./0004-dual-channel-delivery.md)'s record of intent. Answered by persistence, not a flag: `delivery.degraded` lives one turn; `state.conditions.group_outage` persists (`src/state.ts:98-106`; `withGroupOutage`, `src/state.ts:144-157`) and is re-surfaced by every `agentbus_fetch` and `agentbus_status` until a group post succeeds. `since` is preserved across repeated failures and only `last_error` advances, so a week-long blackout never reports as one message old. `GroupMigratedError` names the successor id (`src/telegram.ts:132-154, 415-417`).

**One mechanism, three users.** `Conditions` declares `group_outage`, `state_quarantined` and `open_thread_backlog` from this release although only the first is raised here, so the consolidated schema is a single migration target.

## Consequences

- Compatibility: unilateral. The wire is byte-identical to v0.5.0; the only state change is additive, defaulted by one narrow default rather than a general merge, because quietly filling any missing field is the tolerance [ADR-0015](./0015-state-integrity-validate-quarantine-migrate-once.md) exists to end.
- The audit's own label was corrected: v0.5.1 is "additive state field, no migration, no wire", so migration 1 → 2 accepts both shapes as version 1.
- "Never auto-follow a group migration" entered the v1 closed-permanently list (`docs/functional-audit/06-verdict.md:171-172`) and hard rule 12.

## Relevance to Conmuta

**Verdict: inherited-valid.** `src/transport/dual.ts` and the typed error taxonomy in `src/telegram.ts` are reused as a library (D1). The never-auto-follow rule is now Invariant 1 in mechanical form: the daemon asserts `chat_id === binding.group_id` before every `sendMessage`, and a binding change is a human edit of the registry, never an inference from a Telegram error. D5 binds a **numeric supergroup id** in `conmuta.json`, which removes the basic-to-supergroup trigger for new bindings without removing the rule. Where the outage condition persists once state moves to the ledger of [ADR-0030](./0030-sqlite-ledger-and-json-registry.md), and how the daemon surfaces it to thin clients and the local web panel (F3), are draft items to be finalized in the F1/F3 SDD specs.
