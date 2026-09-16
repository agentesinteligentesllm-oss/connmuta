# ADR-0022 — Body omission decided per entry, not per tick

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-valid |
| **Date** | 2026-08-16 (shipped with v1 `v1.0.1`, tag `e9bc6c2`) |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:469-487` (ADR-22) |
| **Supersedes / superseded by** | completes [ADR-0016](./0016-quiet-tick-digest-over-discrete-state.md) without amending it / — |

## Context

ADR-0016 named the problem exactly — *a bus that is expensive to listen to gets listened to rarely* — and its digest solved it completely **while the bus is idle** and not at all while it is busy. `compact` was a conjunction over the whole state, so any change anywhere returned every entry in full, including the ones whose text the caller had already been shown. On an active bus that was every tick.

This is a new ADR rather than an amendment: amending would rewrite v0.6.0's history over a decision that was right about the case it addressed. The gap survived a functional audit because the ADR's problem statement was read as its coverage — *a status label answering "what does this advance" was taken to answer "what does this resolve"*.

## Decision

| Rule | Reason |
|---|---|
| **Omission is per entry** | `first_surfaced_at` had been stamped per thread since PR-D, and `NeedsActionEntry.body`'s own doc comment already promised the rule ("one that has never been surfaced keeps it"). The global gate made that clause unreachable. No new mechanism, no schema change, no migration: the change is the predicate |
| **`unchanged` keeps ADR-0016's meaning exactly** | It still reports whether the discrete work state moved. This ADR moves one thing only — who carries a body — so the two compose on separate axes |
| **Stamping follows the body** | `!compact` was a sound proxy only while a tick was all-or-nothing. The rule is *stamp exactly the entry whose text this response carried*. Stamp too eagerly and a thread is suppressed before it was shown; too late and its body repeats forever. Coverage also extends to `waiting_on_peer`, never stamped before — 13 of 19 entries on the production state |
| **Two carve-outs survive** | An overdue entry keeps its body however many times it has been shown (the `session-catchup` spec asks that transition to be highlighted); `force_full: true` omits nothing |
| **Truncation is not the mechanism; if it ever becomes one, truncate before `wrapUntrusted`, never after** | The fence escapes `<` inside the body and then concatenates its delimiters; cutting an already-wrapped string can sever the closing tag and leave the block open — the fence forgery ADR-0012 closed. Omission has no such hazard, which is part of why it was chosen over a preview |

**Measured on real production state** (29 threads, bodies averaging 1,362 characters), not fixtures: one new `REQUEST` arriving — 30,094 characters before, 3,663 after, **8.2×**, with the new body carried in full and all 19 entries still listed. A quiet tick is 3,219 either way. The real full tick measured 8,167 tokens against ADR-0016's fixture figure of ~2,882; both numbers are kept with their provenance.

## Consequences

- Predicate and stamping: v1 `src/tools/fetch.ts:823-850`; the fence `wrapUntrusted` at `:61`; `body_omitted` marker at `:101`, `:144`.
- Compatibility: none required — no wire change, no state schema change, no migration.

Pinned by (v1 `test/tools/fetch.test.ts`): `:1563` a tick carrying news omits the bodies already shown while carrying the new one in full; `:1595` an omitted entry keeps the carry-forward fields; `:1622` an overdue entry keeps its body; `:1647` stamping follows the body exactly; `:1457` `force_full` omits nothing; `:1699` the measured saving is the body text and grows with the backlog's prose.

## Relevance to Conmuta

- **Carries verbatim** in the reused fetch pipeline (D1). The truncation-order rule is a [THREAT-MODEL](../02-architecture/THREAT-MODEL.md) item under Invariant 5 (everything received is fenced and origin-labelled).
- **Per-client stamping.** `first_surfaced_at` is the state that makes omission safe; under D4 (per-client cursors) it must be per client, otherwise the first client of a binding to fetch would suppress a body the second client never saw — the v1 two-IDE collision (verified facts, `src/tools/fetch.ts:500-930`) reappearing as silent omission. Owned by the F1 SDD spec; draft in [DATA-MODEL](../02-architecture/DATA-MODEL.md).
- **Arena-light** (D7) relies on this: debate turns are `REPLY` bodies, and a running debate is precisely the busy-bus case this ADR bounds.
- Analysis verdict: YES (analysis bundle, `governance-docs` key_facts[22]).
