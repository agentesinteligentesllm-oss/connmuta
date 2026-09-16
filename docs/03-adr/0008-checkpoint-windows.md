# ADR-0008 — `[CHECKPOINT-ESTADO]` windows synthesis (bridge-aware)

| Field | Value |
|---|---|
| Status | inherited-valid |
| Date | 2026-08-14 (original, v0.1.0 design) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-08 |
| Inheritance verdict | YES in `maps[governance-docs]` (marker token kept for compatibility) |
| Related | [ADR-0009](./0009-ack-non-closing.md), [ADR-0030](./0030-sqlite-ledger-and-json-registry.md) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

The v1 `session-catchup` spec required catch-up synthesis to be windowed by the most recent checkpoint, as a MUST on the tool's output contract rather than on agent behaviour (`openspec/changes/telegram-agent-bus/design.md:209-215`).

## Decision

A checkpoint is a `BROADCAST` whose `body` begins with `[CHECKPOINT-ESTADO]` (`CHECKPOINT_MARKER`, `src/config.ts:116`). The type set stays closed at its existing members, but the bridge recognises the marker: `state.last_checkpoint` records the most recent one (`src/state.ts:118`; `src/tools/fetch.ts:459, 661`) and `agentbus_fetch` trims the incremental `log` to entries at or after it, reporting `checkpoint.{present,at,by}` (`src/tools/fetch.ts:905-907`).

Rejected: treating the marker as inert.

## Consequences

- Windowing applies **only to `log`**; `needs_action` stays cumulative and unwindowed, so a pre-checkpoint unresolved `REQUEST` still appears. Folding context and dropping obligations are different operations.
- The marker token is Spanish and wire-visible; every v1 peer recognises exactly this string.

## Relevance to Conmuta

**Verdict: inherited-valid.** The classification pipeline that detects the marker (`src/tools/fetch.ts:525-656`) is reused as a library (D1). The marker string is kept verbatim: it is a body convention that v1 peers on the migration path (backlog B-13) recognise, and D1 rules out any wire-visible change in v2. Renaming it would be a compatibility change governed by the freeze doctrine; the language contract does not rename an inherited wire constant.

Two placements are **draft, to be finalized in the F1 SDD spec**: where `last_checkpoint` persists once state moves to the per-binding ledger of [ADR-0030](./0030-sqlite-ledger-and-json-registry.md), and how the `log` window interacts with the **per-client cursors** of D4, since the checkpoint is a property of the binding while the cursor is a property of the client.
