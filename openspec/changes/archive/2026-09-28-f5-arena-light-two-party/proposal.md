# Proposal: Arena-light 2-party debates over the existing wire

**Correction during implementation**: "coalesce AUDIT+COUNTER" below was found unbuildable (AUDIT
is addressee-only, COUNTER originator-only — two agents, one body) and dropped
(`bus-v2-f5-pr-04-coalescing-contradiction-001`). Each turn ships as its own silenced send;
affected lines struck through, not rewritten.

## Intent

Enable PROPOSAL -> AUDIT/COUNTER -> CONSENSUS/ESCALATE debates between two agents (WORK-PLAN F5,
`WORK-PLAN.md:99-110`; tribunal D7), no wire change (W1). Threads are already two-party and
terminal (`validate.ts:213-304`) but lack a round cap, debate-turn semantics, and a journal.
Semantics live entirely in `body` markers — no new type/basis/field. Additive to the send
pipeline.

## Scope

### In Scope
- Marker encode/decode module, reusing `RESOLVED_BASIS_VALUES`/`ABANDON_BASIS_VALUE`
  (`envelope.ts:37-38`).
- Round cap `ARENA_LIGHT_MAX_ROUNDS`; (cap+1)-th COUNTER refused `ROUNDS_EXHAUSTED`
  (`DATA-MODEL.md:273`, PT-23).
- `debate_journal` table as specified (`DATA-MODEL.md:264-279`) via forward migration +
  `LEDGER_SCHEMA_VERSION` bump.
- Marker-aware silence (`DEBATE_MARKER_PREFIX`), silent only for AUDIT/COUNTER
  (`send-path.ts:160-172`).
- ~~AUDIT+COUNTER coalesced into one REPLY, two delimited sections, one send.~~ (dropped, see
  correction note above — each turn is its own send)
- CONSENSUS -> basis `context-shared`; ESCALATE -> `RESOLVED[abandoned]` from `thread.from`
  (ADR-13).
- Pointer-only enforcement: inline diff/patch bodies rejected, no PATCH auto-apply (D7, T13).
  Roster-participant check reused as-is (`NOT_PARTICIPANT`).
- Named constant for group rate budget per round, alongside the existing
  `GROUP_MESSAGES_PER_MINUTE`.

### Out of Scope
- N-party debates (B-10).
- Group referee role (`bus-v2-referee-001`).
- New wire `type`/`basis` values.

## Capabilities

### New Capabilities
- `arena-light-debates`: two-party debate turns over existing threads.

### Modified Capabilities
- `ledger`: adds `debate_journal` via forward migration (F1's first schema change),
  `LEDGER_SCHEMA_VERSION` 1 -> 2.
- `send-path`: round-cap stage (`ROUNDS_EXHAUSTED`) + marker-aware silence.

## Approach

A pure `shared/` marker module; `ledger/debate-journal.ts`; a `validate.ts` stage reusing
`SendToolError`. Admission unaffected.

## Affected Areas

| Area | Impact |
|------|--------|
| `shared/` (new module) | New — marker encode/decode |
| `ledger/{schema,migrations}.ts`, `ledger/debate-journal.ts` (new) | New+Modified — DDL, migration, writer/reader |
| `shared/constants.ts:59` | Modified — schema version bump, round-cap constant |
| `send/validate.ts:200-304` | Modified — round-cap stage, `ROUNDS_EXHAUSTED` |
| `send/send-path.ts:172` | Modified — marker-aware silence |
| `send/rate.ts` | Read-only |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Forward-only migration mistake | Low | Match `migrations.test.ts` rigor |
| Body exceeds ceiling | Med | Cap section length at compose |
| Silence miscoupled | Low | Restrict to marker-prefixed REPLY |

## Rollback Plan

Revert the PR(s). Migrations are forward-only — fix forward, never reverse. No production ledger
exists yet.

## Dependencies

- F1 (archived): ledger.

## Success Criteria

- [ ] (cap+1)-th COUNTER refused `ROUNDS_EXHAUSTED` (PT-23 c1).
- [ ] Non-roster participant rejected (PT-23 c2, reused `NOT_PARTICIPANT`).
- [ ] Inline non-pointer patch/diff body rejected (PT-23 c3, D7).
- [ ] A debate never crosses bindings.
- [ ] CONSENSUS is message-only, no filesystem/process effect.
- ~~[ ] AUDIT+COUNTER coalesce into one send.~~ (dropped, see correction note above)
- [ ] `disable_notification` true only for AUDIT/COUNTER.
- [ ] Group rate budget per round is a named constant, asserted by behaviour.
