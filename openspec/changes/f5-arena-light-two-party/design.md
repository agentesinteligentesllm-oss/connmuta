# Design: Arena-light 2-party debates over the existing wire

## Technical Approach

Debate turns are body markers on existing REQUEST/REPLY/RESOLVED envelopes (`envelope.ts:44,88-101`
forbids a new `type`/`basis`). New pure `shared/debate-marker.ts` encodes/decodes markers; new
`ledger/debate-journal.ts` persists them (schema v1→v2); `validate.ts` gains one pipeline stage
(round-cap + role + pointer-only); `send-path.ts` reads decoded markers for silence and journaling.
**No coalescing**: an earlier draft composed AUDIT+COUNTER into one body, found unbuildable —
different roles (`thread.to`/`thread.from`), so no single caller ever owes both
(`bus-v2-f5-pr-04-coalescing-contradiction-001`). Every debate turn is its own send.

**Discovery**: `normalizeBody` (`validate.ts:191`) collapses every whitespace run, including
newlines, to one space; `encodeEnvelope` requires `body` on one wire line. Debate bodies must
therefore be single-line; markers cannot use line delimiters.

**Implements**: D7 and ADR-13 (escalation asymmetry, unamended); ADR-0023's ~1,921-char ceiling
bounds Decision (b)'s delimiter.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| (a) Migration + rollback | Append `{ to: 2, up }` to `LEDGER_MIGRATIONS`; new `DEBATE_JOURNAL_DDL`; bump version; forward-only | Edit `LEDGER_SCHEMA_DDL` in place; reversible down-migration | Next migration, never an edit to a shipped one |
| (b) Delimiter | One-line body: `[ARENA-LIGHT:<TURN>[:<VERDICT>]] <text> refs: <r1>; <r2>` | Blank-line blocks (broken by `normalizeBody`); JSON body | Survives whitespace collapse, stays one wire line, regex-findable |
| (c) Round-cap + role check | `checkDebateTurn` between loop-prevention/secret-backstop; no-op unless body decodes; COUNTER requires `caller===thread.from` (else `NOT_ORIGINATOR`), AUDIT requires `caller===thread.to` (else `NOT_ADDRESSEE`) | No role check (rejected — `thread.to` could hit cap with no escalation path, ADR-13) | Spec requires this order; role check closes the escalation-deadlock gap Alpha found |
| (d) Marker signatures | See Interfaces | Class-based encoder | Matches `envelope.ts`'s pure-function shape |
| Journal rows/send | One row per turn, always | Merged multi-turn row | `turn` is single-value CHECK (DATA-MODEL §3.7); no coalescing exists |
| Round counting | Increments only on journaled COUNTER; cap = `readMaxCounterRound+1` | Increment on AUDIT too | Cap governs COUNTER count, not AUDIT |

## Data Flow

    caller composes body (exactly one turn)
      -> send(input)
      -> validateSend: [1 schema+normalize] [2 loop-prevention -> existingThread]
                       [2.5 checkDebateTurn: decode, pointer-only, role check
                            (COUNTER<-from only, AUDIT<-to only); round-cap -> ROUNDS_EXHAUSTED]
                       [3 secret backstop] [4 roster check]
      -> send-path.ts: build envelope -> guardEncodedLength
      -> silent = SILENT_TYPES.has(type) || (type===REPLY && debateTurns decoded)
      -> roomGuard -> rate check/record (one send = one budget hit)
      -> transport.send (one call) -> withTransaction: thread write + audit + appendDebateTurn

## File Changes

| File (+ test twin) | Action | Description |
|---|---|---|
| `shared/debate-marker.ts` | Create | Encode/decode markers; inline-diff check |
| `ledger/debate-journal.ts` | Create | Writer/reader, mirrors `conditions-store.ts` |
| `ledger/schema.ts` | Modify | Exported `DEBATE_JOURNAL_DDL` (v2) |
| `ledger/migrations.ts` | Modify | Append `{ to: 2, up }` step |
| `shared/constants.ts` | Modify | `ARENA_LIGHT_MAX_ROUNDS`, version→2, `DEBATE_MARKER_PREFIX` |
| `daemon/send/validate.ts` | Modify | `checkDebateTurn` stage; `ROUNDS_EXHAUSTED` |
| `daemon/send/send-path.ts` | Modify | Marker-aware silence; `appendDebateTurn` |
| `daemon/send/rate.ts` | None | Reused |

(Paths are under `src/`; each `Create`/`Modify` row gets a matching `test/` twin per the mirror
convention, e.g. `src/shared/debate-marker.ts` → `test/shared/debate-marker.test.ts`.)

## Interfaces / Contracts

```ts
// shared/debate-marker.ts
type DebateTurnKind = "PROPOSAL"|"AUDIT"|"COUNTER"|"CONSENSUS"|"ESCALATE";
type DebateVerdict = "APPROVE"|"APPROVE_WITH_CHANGES"|"REJECT";
interface DebateTurnMarker { turn: DebateTurnKind; verdict?: DebateVerdict; text: string; refs: readonly string[] }
function encodeDebateTurn(marker: DebateTurnMarker): string;
function decodeDebateBody(body: string): readonly DebateTurnMarker[] | undefined;
function containsInlinePatchShape(text: string): boolean;

// ledger/debate-journal.ts
interface DebateJournalEntry { project_id: string; debate_id: string; round: number; turn: DebateTurnKind;
  verdict: DebateVerdict|null; eid: string; from_agent_id: string; to_agent_id: string;
  refs: readonly string[]; basis_at_close: string|null; at: string }
function appendDebateTurn(db: DatabaseSync, entry: DebateJournalEntry): void;
function readMaxCounterRound(db: DatabaseSync, project_id: string, debate_id: string): number;
function readDebateJournal(db, project_id, debate_id): readonly (DebateJournalEntry & {id:number})[];

// validate.ts: SendErrorCode += "ROUNDS_EXHAUSTED"; ValidatedSend += debateTurns?: readonly DebateTurnMarker[]
```

## Testing Strategy

| Scenario | Test file |
|---|---|
| Marker/wire mapping; inline patch rejected, pointer accepted | `debate-marker.test.ts` |
| Round-cap boundary + ordering before secret backstop, unjournaled refusal | `validate.test.ts` |
| Non-participant + wrong-role turns, scoped journal | `validate.test.ts` |
| Each debate REPLY is silent; CONSENSUS/ESCALATE side-effect-free (reuses `NOT_ORIGINATOR`) | `send-path.test.ts` |
| Restart-durable round count, journal insert/read | `debate-journal.test.ts` |
| v1→v2 auto-migrates; failed step leaves v1 (throw-safety already generic; add real-step case) | `migrations.test.ts` |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process boundary.

## Migration / Rollout

Forward-only: a v1 ledger auto-migrates to v2 at open, one transaction. No rollback; a mistake
ships as a corrective v3 migration. No production ledger exists yet.

## Open Questions

None. Every `[Needs tribunal decision]` item in exploration.md was resolved by
`bus-v2-f5-explore-decisions-001`; the single-line-body constraint is resolved in Decision (b).
A later contradiction — the coalesced-REPLY requirement was unbuildable against (c)'s role
check — was resolved by dropping coalescing entirely (`bus-v2-f5-pr-04-coalescing-contradiction-001`);
this doc, both delta specs, and `debate-marker.ts` reflect the correction.
