# ADR-0026 — A transition that could not be applied is a diagnostic, not news

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-valid |
| **Date** | 2026-08-25 (unversioned; commits `e9406c1` fix, `4dec72f` docs). Tribunal consensus recorded as 2026-08-26 |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:562-590` (ADR-26); audited in debate `agentbus-orphan-transitions-001` — dropping the body instead of flagging it is the auditor's finding; the field name went to a counter-round |
| **Supersedes / superseded by** | — / — |

## Context

The Director asked a plain operational question: *if I disconnect my agent for two days, will it redo work that was already resolved?* The answer is **no**, and that part is sound: `isNeedsAction` requires `status === "open"` and `needs_action` is computed from the final persisted state, so a thread opened and closed inside the gap collapses to `resolved` and never surfaces. Probing the edge of that answer is what found this.

The Bot API evicts updates at 24 hours, individually. A gap longer than that can leave a `REQUEST` evaporated while its `ACK`, `REPLY` or `RESOLVED` is still alive. `applyEnvelope` then reaches its `!existing` return with outcome `ignored`, and **not applying it is correct** — there is nothing to update. Materialising the thread was rejected: it would fabricate `opened_at`, `body` and `to_user_id` out of nothing, and the fabricated open thread would enter `needs_action` or `waiting_on_peer`, trading a false report for false work.

**The defect was never in the state machine; it was in the report.** `fetchTool` branched on `duplicate` and `rejected` only, so `ignored` fell through to `log` carrying the full peer body, indistinguishable from a closure that actually closed a thread. Measured on one production node (170 threads): 106 of 163 resolved threads lived past 24h; the largest inter-event gap was 45.31h; 90 of 170 threads were opened by a peer. `gap_warning` already compared against `BOT_API_RETENTION_HOURS` — the product could warn about the possibility and had no way to report the fact.

## Decision

| Rule | Reason |
|---|---|
| **Three types, not one** | `BROADCAST` returns `noted`, a foreign `REQUEST` returns `not_mine`; everything else falls to the `existing` lookup. Orphaned `ACK`, `REPLY` and `RESOLVED` are equally affected, and an orphaned `REPLY` is the worst: peer prose reading as continuation of a conversation this node has no record of |
| **The body is dropped entirely, not flagged in place** | `classifyRejection` takes a non-nullable `ThreadRecord`, so it is inexecutable with no local thread and the `!existing` return happens before it. That body is the only peer prose that could reach an agent without having passed a single receive-side invariant — `not_requestable`, `unauthorized`, `stale`, or the identity anchor. Stated without overselling: the layer-7 fence still holds and `from` is still verified against the real sender, so this is not an injection hole; what is unverifiable is whether that roster member had any standing in that thread. `rejected` set the precedent verbatim — *a refused transition is a diagnostic, not news* — and `ignored` is its sibling |
| **An aggregate field, not only a flag** | `windowedLog` drops everything before a `[CHECKPOINT-ESTADO]` broadcast in the same batch, and a checkpoint is used in exactly the long-disconnect scenario that produces an unapplied transition. The aggregate is built outside that window |
| **Named `unapplied`, contested on the record** | `unknown_threads` and `missing_local_threads` were refused: the field lists **envelopes**, not threads (an `ACK` and a `RESOLVED` for one absent thread are two entries), and `unknown` asserts a property of the thread never observed — eviction is the hypothesis, but a peer can equally reference an id that never existed. `unapplied` predicates on this bridge's own processing, the only thing witnessed |
| **Two placements made deliberately** | The branch `continue`s alongside `rejected`, before the `misaddressed` check (that counter exists for roster-name disagreement, and an unapplied transition is already reported). And `unapplied.length` joins `producedNews`: an `ignored` outcome writes no thread, so without that disjunct a lost transition on a quiet tick would compact the tick and omit the only report of itself |
| **Bounded: one turn, not persisted** | There is no `ThreadRecord` to hang it on, and inventing one is a state field plus a migration — outside the constraint. `producedNews` makes one turn sufficient, and it is actionable in that turn: asking that peer about that thread is the only available action anyway |

A pre-existing test was asserting the defect — its fixture labelled two entries *"orphan thread — never opened locally"* and then pinned them as correct `log` entries. The eleventh recorded appearance of ADR-0012's pattern in v1.

## Consequences

- `unapplied: UnappliedEntry[]` on the fetch output (v1 `src/tools/fetch.ts:285-289`); the `ignored` branch at `:610-637`, placed before `misaddressed`; `producedNews` disjunct at `:801-811`. `BOT_API_RETENTION_HOURS = 24` (v1 `src/config.ts:59`).
- Compatibility: none required — `src/tools/fetch.ts` and its test only; `SERVER_VERSION` unmoved.

Pinned by (v1 `test/tools/fetch.test.ts`): `:1781` a `RESOLVED` for a thread never seen is reported in `unapplied` and never reaches `log`; `:1810` an `unapplied` entry carries metadata only — the body never crosses; `:1844` `ACK` and `REPLY` for absent threads are unapplied too; `:1863` two envelopes for the same absent thread produce two entries; `:1883` `unapplied` survives the checkpoint window; `:1922` an unapplied transition alone forces the full form.

## Relevance to Conmuta

- **Carries verbatim.** The `ignored` branch sits inside the classification pipeline D1 reuses as a library (`src/tools/fetch.ts:525-656`). Invariant 5 states the same rule generically: the per-binding audit log records every receive and reject and *stores no rejected bodies* ([CONSTITUTION](../01-constitution/CONSTITUTION.md)); `unapplied` is the reader-facing projection of that principle.
- **Rarer under the daemon, not impossible.** D3's continuous long-poll removes the 24-hour eviction while the daemon is alive (D6), but a daemon that was down longer than `BOT_API_RETENTION_HOURS`, or a peer that references a thread id that never existed, still produces an unapplied transition; the two remain indistinguishable, as this ADR states.
- **Persistence may change shape.** "One turn, not persisted" was bounded by the cost of a `state.json` migration; with the D4 ledger the F1 SDD spec may decide to record unapplied transitions in the audit log (metadata only). That is a change of store, not of rule, and is pending; the [THREAT-MODEL](../02-architecture/THREAT-MODEL.md) carries the "no unverified body reaches the model" requirement either way.
- Analysis verdict: YES (analysis bundle, `governance-docs` key_facts[26]).
