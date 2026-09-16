# ADR-0017 — The tiered window: floors with spill

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-valid |
| **Date** | 2026-08-15 (shipped with v1 `v0.6.0`, tag `55dfbc3`) |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:382-395` (ADR-17); floor values recorded in v1 `docs/functional-audit/HANDOFF.md:358` |
| **Supersedes / superseded by** | — / — |

## Context

`needs_action` and `open_threads` were capped oldest-first, so twenty stale threads made a brand-new `REQUEST` structurally unreachable. [ADR-0016](./0016-quiet-tick-digest-over-discrete-state.md) explains why nobody polled often; this is how the channel went deaf when they finally did.

## Decision

| Option | Verdict |
|---|---|
| Raise the cap | Rejected. Moves the wall; does not remove it |
| Sort newest-first | Rejected. Inverts the problem and contradicts ADR-0012's "oldest is most overdue" |
| Fixed per-tier allocations | Rejected. Wastes slots whenever a tier is empty |
| **Partition, then fill with floors and spill** | **Chosen.** Floors stop a burst in one tier starving the one below it; spill stops a floor being wasted on an empty tier |

**The floors are a tuning parameter; the invariant is the guarantee.** `FLOOR_NEW = 8` and `FLOOR_REMINDER = 6` of `MAX_SURFACED_THREADS = 20` leave six slots any tier can claim. The tests pin the falsifiable property and deliberately not the numbers: *while anything was withheld from the new or overdue tiers, zero already-seen not-overdue entries hold a slot.* A test asserting 8 and 6 would break on a defensible retune while protecting nothing that matters.

Three decisions the block did not specify:

1. Tiers are **exclusive, with never-surfaced beating overdue** on a tie — a thread can be both, and counting it as new surfaces it first and counts it once.
2. Output is in **tier order**, not a global sort; oldest-first survives within each tier, which is where it was load-bearing.
3. **The sender-side pending list stays flat** (`outbound_pending` then, `waiting_on_peer` since [ADR-0020](./0020-reply-and-turn-tracking.md)): its starvation is exactly what ADR-0013's `abandoned` already solved, so tiering it would be a second remedy for a closed finding.

## Consequences

- Named constants with reasoning: `MAX_SURFACED_THREADS` (v1 `src/config.ts:88`), `FLOOR_NEW` (`:108`), `FLOOR_REMINDER` (`:110`). This is the v1 named-constant rule in practice (v1 `docs/functional-audit/HANDOFF.md:362`): a blind reader of the handoff once reported concrete floor values that had never been written.
- Partition and selection live at v1 `src/tools/fetch.ts:675-693`; the flat `waiting_on_peer` cap at `:772`. Withheld counts are reported per tier so a starved tier is a visible number even at zero slots (`:311-313`).

Pinned by (v1 tests): `test/tools/fetch.test.ts:1284` the invariant end to end — while a tier was starved, no already-seen not-overdue entry holds a slot; `:1323` withheld reported per tier; `:1033` `needs_action` capped and counted; `:1050` the withheld entries are the newest within a tier; `:1078` `waiting_on_peer` capped on the same terms; `test/protocol.test.ts:505` twenty stale threads do not make a new `REQUEST` unreachable.

## Relevance to Conmuta

- **Carries verbatim** inside the reused fetch pipeline (D1). Nothing in D1-D11 changes how a surfaced window is filled.
- **The named-constant rule is constitutional** in Conmuta ([CONSTITUTION](../01-constitution/CONSTITUTION.md)): every numeric constant is named and carries its reasoning; tests pin invariants, never tuning values (ADR-0012's governing rule, see [INDEX](./INDEX.md)).
- Under D4 the window is computed per client cursor rather than per machine; the property tested at v1 `fetch.test.ts:1284` must hold per client. That test is the template for the F1 SDD spec.
- Analysis verdict: YES (analysis bundle, `governance-docs` key_facts[17]).
