# ADR-0011 — Envelope-level `eid` for cross-channel deduplication

| Field | Value |
|---|---|
| Status | inherited-valid |
| Date | 2026-08-14 (original, v0.1.0 design) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-11 |
| Inheritance verdict | YES in `maps[governance-docs]` |
| Related | [ADR-0004](./0004-dual-channel-delivery.md), [ADR-0005](./0005-wire-format-sentinel.md), [ADR-0012](./0012-adversarial-audit-governing-rule.md) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

Dual-write means one logical envelope can reach the same bridge twice — once as a DM and, if bots can see each other's group posts, once from the group — with different `telegram_message_id`s and different `date`s. Neither can key deduplication, and `thread` holds many envelopes (`openspec/changes/telegram-agent-bus/design.md:248-256`).

## Decision

One required field, `eid`: a 12-hex per-envelope unique id (`EID_PATTERN`, `src/envelope.ts:34`). Receivers persist `seen_eids` (`src/state.ts:120`) and drop any envelope whose `eid` is already present, counting it in `skipped.duplicate` (`src/tools/fetch.ts:590`).

**First-seen wins.** The first copy establishes `opened_at` from its `message.date`; later duplicates are dropped without touching state — deterministic and order-independent.

Rejected: a composite key `(from, thread, type, ts)` (two `ACK`s on one thread within one second collide); a delivery-channel field inside the envelope (channel is transport metadata, reported in fetch output as `via`, keeping the envelope minimal).

## Consequences

- The receiver is idempotent regardless of how the group-visibility ambiguity resolves — the property that lets the design stop caring about it.
- `seen_eids` is bounded by retention-based pruning at load (`pruneState`, `src/state.ts:217-221`), not by TTL alone, because open threads cannot be TTL-pruned ([ADR-0012](./0012-adversarial-audit-governing-rule.md), defect 5).
- Byte-identical copies on both channels ([ADR-0005](./0005-wire-format-sentinel.md)) are what make `eid` dedup verifiable.

## Relevance to Conmuta

**Verdict: inherited-valid.** `eid` is part of the frozen wire (D1) and the classification pipeline that performs the drop is reused (`src/tools/fetch.ts:525-656`). Dedup remains necessary: the group-visibility question is still open (spike B-07) and the two-plane write is unchanged. Under Invariant 3 every update is written to the durable inbox before the offset is confirmed, and under bijective binding (D2) a bot sees only its own group and DMs, so the dedup scope follows the binding. Where `seen_eids` lives in the ledger of [ADR-0030](./0030-sqlite-ledger-and-json-registry.md) is draft, to be finalized in the F1 SDD spec.
