# Wake Ledger Specification

## Purpose

The wake ledger (`runner/ledger.ts`) is the wake satellite's machine-local, append-only JSONL audit log. It records every operator ladder change, doorbell notification, accepted turn execution, and bounded refusal. Because the core daemon contains no satellite tracking tables or execution logs (ADR-0032 R6a), this ledger serves as the authoritative, self-reported audit trail for autonomous agent wake behavior.

This specification records the delivered, verified retrospective behavior of `runner/ledger.ts` and its interaction with `runner/loop.ts` and `runner/cli.ts`.

## Constants and Storage

Per `runner/constants.ts` and `runner/ledger.ts`:
- Storage path: `<home>/runner/wake-ledger.jsonl` (resolved via `wakeLedgerPathFor(homeDir)`).
- File permissions: Created with mode `0o600` inside directory mode `0o700`.
- `REFUSAL_REPEAT_MS = 60_000` (60 s): Debounce interval for logging persistent refusal states to prevent log saturation.

## Security Pinning

- **PT-36** (`test/runner/ledger.test.ts`, `test/runner/loop.test.ts`): The ledger records exactly one row per event, carries zero peer message bodies or secret tokens by construction, skips torn lines without crashing, and debounces repeated refusals.
- **PT-34** (`test/security/runner-bundle.test.ts`): The ledger lives in a separate JSONL file outside SQLite, with zero direct database connections from the runner.

---

## Requirements

### Requirement: Dedicated Append-Only JSONL Audit Storage

The satellite MUST persist audit records to an append-only JSONL file located at `<home>/runner/wake-ledger.jsonl` (`wakeLedgerPathFor`). The implementation MUST only append lines via `appendLedgerRow` and MUST NOT provide update or delete operations. The parent directory MUST be created automatically on first write with permissions `0o700`, and file writes MUST use mode `0o600`.

Pinned by: `test/runner/ledger.test.ts` ("ledger: rows append, in order, and never overwrite an earlier one", "ledger: an absent file reads as no rows, so a fresh machine is not an error").

#### Scenario: Ledger directory and file are created on first write

- GIVEN the runner home directory does not yet contain a `runner` subfolder
- WHEN `appendLedgerRow` is called with a new row
- THEN it MUST recursively create `<home>/runner/` with mode `0o700`
- AND it MUST append the JSON-serialized row with a trailing newline
- AND the file MUST be readable with `readLedgerRows`

#### Scenario: Existing entries are preserved upon new row append

- GIVEN `wake-ledger.jsonl` already contains two rows
- WHEN a third row is appended via `appendLedgerRow`
- THEN the file MUST contain exactly three lines
- AND the first two lines MUST remain byte-identical

---

### Requirement: Closed Four-Kind Row Vocabulary and Strict Schema

Every entry in `wake-ledger.jsonl` MUST conform to `LedgerRow` and have a `kind` property matching one of four closed values:
1. `ladder`: Operator mutations to the ladder level, created via `ladderRow` (`ts`, `kind`, `project_id`, `level`, `note`).
2. `wake`: An accepted turn execution, created via `wakeRow` (`ts`, `kind`, `project_id`, `level`, `trigger`, `harness`, `outcome`).
3. `refused`: A turn execution blocked by a structural bound or invalid configuration, created via `refusedRow` (`ts`, `kind`, `project_id`, `level`, `reason`).
4. `notify`: A human notification event where no turn was launched, created via `notifyRow` (`ts`, `kind`, `project_id`, `level`, `trigger`).

No row MUST contain properties outside the declared set `["ts", "kind", "project_id", "level", "trigger", "reason", "harness", "outcome", "note"]`.

Pinned by: `test/runner/ledger.test.ts` ("ledger: one accepted wake writes exactly one row naming the trigger, the level and the action", "ledger: every row kind carries only the documented keys — no field can smuggle a body", "ledger: a refusal row carries a reason and no trigger").

#### Scenario: Accepted wake row contains required metadata

- GIVEN a turn executes for project `p1` with harness `pi` and exits cleanly
- WHEN `wakeRow` constructs the record and appends it to the ledger
- THEN the row MUST have `kind: "wake"`, `project_id: "p1"`, `harness: "pi"`, `outcome: "exited"`, and a populated `trigger` summary
- AND it MUST NOT contain `reason` or `note`

#### Scenario: Refusal row captures refusal reason without trigger details

- GIVEN a turn is refused due to cooldown
- WHEN `refusedRow` constructs the record
- THEN the row MUST have `kind: "refused"`
- AND it MUST specify `reason: "cooldown"`
- AND `trigger` MUST be `undefined`

---

### Requirement: Zero-Body and Zero-Token Payloads by Construction

The ledger row constructors (`wakeRow`, `refusedRow`, `notifyRow`, `ladderRow`) MUST accept trigger summaries (`LedgerTrigger`: `count`, `senders`, `types`, `threads`) containing only verified metadata identifiers and counts. The interfaces and serializations MUST NOT contain fields for message bodies, text excerpts, bot tokens, or session tokens. A peer's prose MUST NOT be capable of reaching the ledger file through the wake pathway.

Pinned by: `test/runner/ledger.test.ts` ("ledger: every row kind carries only the documented keys — no field can smuggle a body"), PT-36.

#### Scenario: Trigger payload contains identifiers and counts but no message body

- GIVEN a doorbell summary with 3 messages from `@alpha-one` on thread `aaaaaaaaaaaa`
- WHEN `wakeRow` is created from the summary
- THEN `row.trigger` MUST contain `count: 3`, `senders: ["@alpha-one"]`, `types: ["BROADCAST"]`, and `threads: ["aaaaaaaaaaaa"]`
- AND `row.trigger` MUST NOT contain any `body` property
- AND serializing the row to JSON MUST contain zero peer message text

---

### Requirement: Debounced Refusal Logging Preventing Ledger Flooding

When a binding is blocked by a persisting refusal condition (such as `in_flight`, `cooldown`, `budget_exhausted`, `harness_unknown`, `arguments_refused`, or a malformed ladder file), `WakeLoop` MUST log the refusal reason once upon occurrence and at most once per `REFUSAL_REPEAT_MS` (60,000 ms) while the same reason persists. It MUST NOT emit a refusal row on every loop tick.

Pinned by: `test/runner/loop.test.ts` ("loop: a broken ladder file is recorded once with its reason, and never wakes anything", "loop: a second message inside the cooldown is refused with a counted reason"), `runner/loop.ts` (`shouldRecord`).

#### Scenario: Repeated ticks under persistent cooldown emit only one refusal row per interval

- GIVEN a binding under active cooldown where ticks occur every 500 ms
- WHEN 10 ticks occur within a 5-second span while cooldown remains in effect
- THEN exactly one `refused` row with `reason: "cooldown"` MUST be written to `wake-ledger.jsonl`
- AND the remaining 9 ticks MUST NOT write duplicate refusal rows

---

### Requirement: Refusal State Reset Upon Accepted Wake

When any wake is successfully accepted and initiated, `WakeLoop` MUST clear its cached refusal state (`lastRefusal = undefined`). Any subsequent refusal that occurs after an accepted wake MUST be treated as a new event and MUST be recorded immediately, without being suppressed by the previous refusal's timestamp.

Pinned by: `test/runner/loop.test.ts` ("loop: an accepted wake clears the refusal memo, so a later refusal is a new fact").

#### Scenario: Refusal following an accepted wake is recorded immediately

- GIVEN a turn was refused due to `cooldown` at $T_0$
- WHEN cooldown expires at $T_1$ and a new wake is accepted
- AND a second message immediately arrives at $T_2 = T_1 + 1,000\text{ ms}$ triggering cooldown again
- THEN the second `cooldown` refusal MUST be written to `wake-ledger.jsonl` immediately
- AND it MUST NOT be suppressed by the refusal recorded at $T_0$

---

### Requirement: Crash-Resilient Row Reading

When reading the ledger via `readLedgerRows(path)`:
1. If the file does not exist, the function MUST return an empty array `[]` without throwing.
2. If any individual line contains invalid or incomplete JSON (e.g., resulting from a process killed mid-write), the reader MUST skip that torn line and continue parsing the remaining valid lines.
3. The reader MUST NEVER throw an exception due to corrupted lines.

Pinned by: `test/runner/ledger.test.ts` ("ledger: a torn or corrupt line is skipped, never fatal — the read path must survive an incident", "ledger: an absent file reads as no rows, so a fresh machine is not an error").

#### Scenario: Torn last line does not prevent reading valid earlier entries

- GIVEN `wake-ledger.jsonl` has two valid JSON lines followed by an incomplete line `{"ts": "2026-`
- WHEN `readLedgerRows` is called on the file
- THEN it MUST successfully parse and return the first two rows
- AND it MUST skip the incomplete line without throwing an error
