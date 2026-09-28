# Tasks: Arena-light 2-party debates over the existing wire

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900-1600 (2 new modules, 5 modified files, 15 scenarios) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR-1 -> PR-2 -> PR-3 -> PR-4 -> PR-5 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Schema v2 DDL + migration + constants | PR-1 | `node --test dist/test/ledger/{schema,migrations}.test.js dist/test/shared/constants.test.js` | N/A — pure DDL, no boot | Revert PR-1; v1 DDL untouched |
| 2 | `shared/debate-marker.ts` encode/decode | PR-2 | `node --test dist/test/shared/debate-marker.test.js` | N/A — pure module | Delete file + test |
| 3 | `ledger/debate-journal.ts` writer/reader | PR-3 | `node --test dist/test/ledger/debate-journal.test.js` | N/A — in-memory ledger | Delete file + test |
| 4 | `validate.ts` round-cap+role stage | PR-4 | `node --test dist/test/daemon/send/validate.test.js` | N/A — unit test | Revert stage; `ROUNDS_EXHAUSTED` unused |
| 5 | `send-path.ts` silence+journal wiring | PR-5 | `npm test` | `npm test` (full suite + `test:static`) | Revert wiring; PR-1..4 stand alone |

## Phase 1: Foundation

- [x] 1.1 RED `test/ledger/schema.test.ts`: `DEBATE_JOURNAL_DDL` creates `debate_journal` (cols per `docs/02-architecture/DATA-MODEL.md` (read-only) §3.7).
- [x] 1.2 GREEN `src/ledger/schema.ts`: export `DEBATE_JOURNAL_DDL` (id, project_id, debate_id, round, turn CHECK, verdict, eid, from_agent_id, to_agent_id, refs, basis_at_close, at), STRICT.
- [x] 1.3 RED `test/ledger/migrations.test.ts`: v1->v2 auto-migrates in one transaction (scenario 1); throwing v2 step leaves `user_version`=1, no partial table (scenario 2).
- [x] 1.4 GREEN `src/ledger/migrations.ts`: append `{ to: 2, up: (db) => db.exec(DEBATE_JOURNAL_DDL) }` to `LEDGER_MIGRATIONS`.
- [x] 1.5 RED+GREEN `test/shared/constants.test.ts` / `src/shared/constants.ts`: `LEDGER_SCHEMA_VERSION`=2, `ARENA_LIGHT_MAX_ROUNDS`=3, `DEBATE_MARKER_PREFIX`, named group-rate-per-round constant beside `GROUP_MESSAGES_PER_MINUTE`.

## Phase 2: Core

- [x] 2.1 RED `test/shared/debate-marker.test.ts`: encode/decode round-trip each `DebateTurnKind`; wire-mapping scenario (PROPOSAL/CONSENSUS envelope+marker).
- [x] 2.2 RED same file: `containsInlinePatchShape` true for literal diff, false for pointer-only refs.
- [x] 2.3 GREEN `src/shared/debate-marker.ts`: types, `encodeDebateTurn`, `encodeCoalescedReply` (two delimited sections, one line), `decodeDebateBody`, `containsInlinePatchShape`.
- [ ] 2.4 RED `test/ledger/debate-journal.test.ts`: `appendDebateTurn`/`readDebateJournal` round-trip, scoped to `(project_id, debate_id)`; `readMaxCounterRound` restart-durable.
- [ ] 2.5 GREEN `src/ledger/debate-journal.ts`: writer/reader, mirrors `src/ledger/conditions-store.ts` (read-only) shape (no own transaction).

## Phase 3: Integration

- [ ] 3.1 RED `test/daemon/send/validate.test.ts`: cap boundary (round 2/3 COUNTER ok, next `ROUNDS_EXHAUSTED`, unjournaled); non-participant/wrong-role (`NOT_ORIGINATOR`/`NOT_ADDRESSEE`); inline-patch rejected; ordering before secret backstop.
- [ ] 3.2 GREEN `src/daemon/send/validate.ts`: `checkDebateTurn` stage (no-op unless decodes) between loop-prevention and secret backstop; `ROUNDS_EXHAUSTED` added to `SendErrorCode`; `debateTurns?` on `ValidatedSend`.
- [ ] 3.3 RED `test/daemon/send/send-path.test.ts`: coalesced AUDIT+COUNTER = one silent send, one rate hit; ordinary REPLY still notifies; CONSENSUS/ESCALATE side-effect-free besides send+journal row.
- [ ] 3.4 GREEN `src/daemon/send/send-path.ts`: extend `SILENT_TYPES` check for decoded debate REPLY; call `appendDebateTurn` (1-2 rows, shared `eid`) inside the existing `withTransaction` block.

## Phase 4: Testing

- [ ] 4.1 Full suite + `test:static` green; confirm all 15 scenarios (7+2+6) pass.
