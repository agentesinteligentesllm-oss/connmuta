# Apply Progress: Arena-light 2-party debates over the existing wire

## Phase 3 (final slice) + Phase 4: `send-path.ts` silence + journal wiring, full-suite sign-off — complete (PR-5 slice, tasks 3.3-3.4, 4.1)

- [x] 3.3 RED `test/daemon/send/send-path.test.ts`: each debate REPLY (AUDIT or COUNTER) is silent, one rate hit, no composition; ordinary REPLY still notifies; CONSENSUS/ESCALATE side-effect-free besides send+journal row.
- [x] 3.4 GREEN `src/daemon/send/send-path.ts`: extended the `silent` check for a decoded debate REPLY; wired one `appendDebateTurn` call per accepted marker inside the existing bookkeeping `withTransaction` block.
- [x] 4.1 Full suite + `test:static` green; confirmed all 15 real scenarios (7 `arena-light-debates` + 2 `ledger` delta + 6 `send-path` delta) pass with non-vacuous covering tests, re-read from the current spec files rather than trusted from any prior record.

This is F5's final code slice: units 4 (`validate.ts`) and 8 (`send-path.ts`) both close here, and every task in `tasks.md` is now `[x]`.

### Files Changed (Phase 3 final slice + Phase 4)

| File | Action | What Was Done |
|------|--------|----------------|
| `src/daemon/send/send-path.ts` | Modified | Added `isSilentSend(type, debateTurns)`: `SILENT_TYPES.has(type)` (unchanged) OR `type === "REPLY" && debateTurns !== undefined` — so an AUDIT/COUNTER-marked REPLY is silent exactly like `ACK`, while PROPOSAL (REQUEST) and CONSENSUS/ESCALATE (RESOLVED) stay notifying even though their body also decodes as a marker, matching the arena-light-debates spec's "Every debate REPLY is silent; PROPOSAL/CONSENSUS/ESCALATE notify" requirement and design.md's Data Flow line (`silent = SILENT_TYPES.has(type) \|\| (type===REPLY && debateTurns decoded)`) exactly. The one `deps.transport.send(...)` call site's `silent:` option now reads `isSilentSend(validatedInput.type, debateTurns)` instead of the bare `SILENT_TYPES.has(...)` check. Added `debateTurnRound(db, project_id, debate_id, turn)`: reads `readMaxCounterRound` (the same read `validate.ts`'s stage 2.5 already used, under the same binding mutex, to admit the COUNTER this call is now journaling — nothing could have journaled a new COUNTER in between) and returns `current + 1` for a COUNTER, `current` for every other turn (PROPOSAL opens at round 0; AUDIT answers the round already reached; CONSENSUS/ESCALATE close at the round already reached). Added `debateBasisAtClose(marker, envelope)`: returns `envelope.basis ?? null` for CONSENSUS/ESCALATE, `null` for every other turn (DATA-MODEL.md §3.7: "nullable, set only on CONSENSUS/ESCALATE"). The existing bookkeeping `withTransaction` block gained one loop, after the existing `appendAuditRow` call, iterating `debateTurns` (0 or 1 markers in practice — never more, since coalescing was removed — but the loop iterates whatever `decodeDebateBody`'s array-returning contract actually holds) and calling `appendDebateTurn` once per marker with `project_id: deps.project_id`, `debate_id: envelope.thread` (the debate's own thread id — for a REPLY/RESOLVED this is the existing thread id the send continues; for a REQUEST/PROPOSAL this is the freshly-generated thread id the send just opened, matching the spec's "`debate_id` = the PROPOSAL `thread_id`"), `round` and `basis_at_close` from the two new helpers, `turn`/`verdict`/`refs` from the marker (`verdict: marker.verdict ?? null`), `eid`/`from_agent_id`/`to_agent_id` from the already-built envelope, and `at: ts` (the same timestamp every other write in this transaction uses). Three new imports: `appendDebateTurn`/`readMaxCounterRound` from `../../ledger/debate-journal.js`, `type DebateTurnKind`/`type DebateTurnMarker` from `../../shared/debate-marker.js`. The `validated` destructure gained `debateTurns`. The module's own SEAM provenance header gained a disclosed `(9)` entry describing this addition, matching every prior F1/F3/F5 change to a SEAM file in this codebase (`validate.ts`'s own PR-4 `(13)` entry is the immediate precedent) — `test/security/provenance.test.ts` only requires a SEAM's hash differ from its pinned v1 hash and its `Changes` line not read `none.`, both already true before this edit |
| `test/daemon/send/send-path.test.ts` | Modified | Added an `Arena-light debate turns (F5, D7)` section: 5 fixture markers (`DEBATE_PROPOSAL_MARKER`, `DEBATE_AUDIT_MARKER`, `DEBATE_COUNTER_MARKER`, `DEBATE_CONSENSUS_MARKER`, `DEBATE_ESCALATE_MARKER`), a `debateJournalRows` readback helper wrapping `readDebateJournal`, and an `agentDeps(db, binding, agentId, overrides?)` helper that lets the same binding's transport/room-guard/telegram fake be called by a different roster member — the same "vary `config.agent_id` on one shared project" convention `validate.test.ts`'s own `sampleDeps(db, { config: sampleConfig({ agent_id: ... }) })` already established for the validation layer, needed here because a two-party debate exercises both `thread.from` and `thread.to` as callers against one shared ledger. 7 new tests: an AUDIT-marked REPLY is silent and journals one row at round 0 (no COUNTER yet); a COUNTER-marked REPLY is silent, and two successive COUNTERs journal at round 1 then round 2; an ordinary (marker-free) REPLY still notifies and journals nothing; a PROPOSAL-marked REQUEST notifies and journals at round 0; CONSENSUS notifies, resolves the thread, and its only extra effect beyond the ordinary RESOLVED bookkeeping (one audit row, unchanged) is one journal row with `basis_at_close: "context-shared"`; ESCALATE notifies, resolves the thread as abandoned, and journals `basis_at_close: ABANDON_BASIS_VALUE`; an AUDIT then a COUNTER on the same debate each cost exactly one physical group post apiece (never composed into one send) and together leave exactly two journal rows |

### TDD Cycle Evidence (Phase 3 final slice)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.3/3.4 | `test/daemon/send/send-path.test.ts` | Unit (real `node:sqlite`, file-backed ledger via `openLedger`; real `FakeTelegramClient` under the real `RoomGuardClient`/`GroupTransport`/`DirectTransport`/`DualWriteTransport` stack `daemon/bindings.ts` builds in production) | ✅ 25/25 (pre-change baseline for this file, run before any edit — see the RED run below) | ✅ Written — all 6 non-trivial new tests failed with concrete, specific assertion mismatches (`disable_notification` `undefined !== true`; journal row count `0 !== 1`/`0 !== 2`) confirming the pre-GREEN code path, not a compile error, since `ValidatedSend.debateTurns` and `appendDebateTurn` already existed from PR-4/PR-3 | ✅ Passed (32/32 — the 25-test safety net plus all 7 new tests — on first execution after implementing GREEN) | ✅ 7 cases: AUDIT-silent-round-0, COUNTER-silent-round-1-then-2, ordinary-REPLY-still-notifies, PROPOSAL-notifies-round-0, CONSENSUS-side-effect-free, ESCALATE-side-effect-free, AUDIT-then-COUNTER-one-hit-apiece | ✅ Extracted `isSilentSend`/`debateTurnRound`/`debateBasisAtClose` as named pure helpers instead of inlining the logic at the one call site and inside the transaction loop — matches the file's own existing `stampBasis`/`stampFrom`/`rateLimitedDuring` pattern; each helper re-ran green after extraction |

### Test Summary (Phase 3 final slice)
- **Total tests written**: 7 (all in `test/daemon/send/send-path.test.ts`)
- **Total tests passing**: 32/32 in the focused file (25 pre-existing + 7 new); 0 regressions in the full suite (see Full-Suite Verification below)
- **Layers used**: Unit (7), Integration (0), E2E (0)
- **Approval tests** (refactoring): None — no refactoring tasks in this batch; the new logic is a genuine behavior addition (new silence condition, new journal writes), not a refactor of existing behavior
- **Pure functions created**: 3 (`isSilentSend`, `debateTurnRound`, `debateBasisAtClose` — all read-only over their arguments, matching the file's existing `stampBasis`/`stampFrom` shape)

### Work Unit Evidence (Phase 3 final slice)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npx tsc -b && node --test dist/test/daemon/send/send-path.test.js` → `tests 32, pass 32, fail 0, cancelled 0, skipped 0` |
| Runtime harness command/scenario and exact result | This unit's own real integration boundary: every new test calls `sendPath` — the full mutex-guarded pipeline (`validateSend` → envelope build → `guardEncodedLength` → room-guard pre-check → rate check → `transport.send` → the bookkeeping `withTransaction`) — against a real file-backed `node:sqlite` ledger (`openLedger`) and the real `RoomGuardClient`/`GroupTransport`/`DirectTransport`/`DualWriteTransport` composition wrapping a `FakeTelegramClient`, not a mock of `sendPath` itself or of the transport stack. This is also this whole PR's own runtime harness: `npm test` (full suite) → `1526 tests, 1520 pass, 0 fail, 6 skip`, and `npm run test:static` → `57/57 pass` (see Full-Suite Verification) |
| Rollback boundary | Revert `isSilentSend`, `debateTurnRound`, `debateBasisAtClose`, the one changed `silent:` call-site line, the one `debateTurns` destructure addition, the new `appendDebateTurn` loop inside `withTransaction`, the four new imports, the disclosed `(9)` provenance-header line in `send-path.ts`, and the new "Arena-light debate turns" test section (7 tests, 5 fixtures, 2 helpers) plus its 2 new imports in `send-path.test.ts`. Nothing outside this slice depends on the new silence/journal behavior — reverting it leaves every pre-existing `send-path.ts` behavior byte-for-byte unchanged (confirmed by the 25/25 safety-net subset passing inside the 32/32 total) |

### Full-Suite Verification (Phase 3 final slice + Phase 4, task 4.1)

- `npm test` (`tsc -b && node --test "dist/test/**/*.test.js"`): **1526 tests, 1520 pass, 0 fail, 6 skip**. Reconciles exactly against two different prior baselines that looked contradictory at first: the orchestrator's own prompt cited "1519/1513/0/6" as the PR-4b (coalescing-removal cleanup) baseline, while this same file's own Phase-3-partial record below cites "1521/1515/0/6" as the post-PR-4 (pre-PR-4b) baseline. `1521 - 2 = 1519` (PR-4b's cleanup removed `encodeCoalescedReply`'s own 2 dedicated tests along with the function), and `1519 + 7 = 1526` (this batch's 7 new tests) — both baselines are correct for their own moment, and this batch's total reconciles exactly against the more recent one. 0 regressions.
- `npm run test:static`: **57/57 pass**, including `test/security/provenance.test.ts`'s two tests — confirming the disclosed `(9)` provenance-header addition to `send-path.ts` (a SEAM file) still hash-mismatches its pinned v1 body and still carries a non-`"none."` `Changes` line. The same two `ERROR: El sistema no ha podido encontrar la clave o el valor del Registro especificados.` lines observed in every prior F5 slice's run recurred here — the same pre-existing Windows-registry/OS-keyring probe noise already disclosed in Phase 1/2/3, not a new regression.
- `npm test` was invoked four times total across this batch (matching the "rerun once before concluding it's a real regression" instruction for this project's documented transient flakes): the GREEN sign-off run was clean (1526/1520/0/6, reported above); three further closing-verification runs followed — one hit `daemon/panel/server.test.js`'s own loopback `ETIMEDOUT` (a real TCP listener test, unrelated file, not touched by this change); one hit `daemon/bootstrap.test.js`'s own documented heartbeat/poller re-entrancy race (**B-57**, already filed against this exact test in session 41, unrelated file, not touched by this change); the final rerun was clean again (1526/1520/0/6). Both are this project's own already-documented, already-disclosed pre-existing flake classes — neither touches `send-path.ts`, its test twin, or any file this change modifies — not a regression from this slice.
- **Scenario audit (task 4.1's own requirement — recounted from the current spec files, not trusted from any prior number)**: `openspec/changes/f5-arena-light-two-party/specs/arena-light-debates/spec.md` currently carries exactly **7** `#### Scenario` headers; `.../specs/send-path/spec.md` (delta) carries exactly **6**; `.../specs/ledger/spec.md` (delta) carries exactly **2**. Total **15**, matching `tasks.md`'s own "(7+2+6)" — this session independently recounted rather than trusting that figure. Every one of the 15 has a real, non-vacuous covering test, confirmed by direct read of the test file (not by name-matching alone):
  - arena-light-debates: "Built envelope matches the marker table" → `test/shared/debate-marker.test.ts` ("a built PROPOSAL envelope is REQUEST with no basis...", "a built CONSENSUS envelope is RESOLVED with basis context-shared...", `DEBATE_TURN_WIRE_MAPPING` test); "Cap boundary enforced exactly" → `test/daemon/send/validate.test.ts` (Stage 2.5 section, PR-4); "Non-participant and wrong-role turns rejected; journal stays scoped" → same file; "Inline patch rejected, pointer-only accepted" → `debate-marker.test.ts` (`containsInlinePatchShape`) + `validate.test.ts` (`INLINE_PATCH_REJECTED` end-to-end); "CONSENSUS is side-effect-free and addressee-only; ESCALATE is originator-only" → this batch's CONSENSUS/ESCALATE tests (side-effect-free half) + `validate.test.ts`'s pre-existing generic `"stage 2: RESOLVED abandoned by a non-originator is NOT_ORIGINATOR"` test (originator-only half — this rule is enforced by the pre-F5 generic loop-prevention stage, not `checkDebateTurn`, so it legitimately covers ESCALATE's own originator-only requirement even without a marker in its own test body); "Debate REPLYs are silent, other turns notify" → this batch's AUDIT/COUNTER/PROPOSAL tests; "Round count survives a restart" → `test/ledger/debate-journal.test.ts` (Phase 2, PR-3).
  - ledger delta: both migration scenarios → `test/ledger/migrations.test.ts` (Phase 1, PR-1).
  - send-path delta: "Debate-marked REPLY is silent" / "An ordinary REPLY still notifies" → this batch; "Each debate turn is exactly one rate-budget hit, never retried" → this batch's AUDIT-then-COUNTER test; "Secret-shaped body rejected before any network call" / "Encoded length guard reports headroom" → `validate.test.ts`'s pre-existing (pre-F5) tests, unchanged scenarios; "(cap+1)-th COUNTER refused before the secret backstop runs" → `validate.test.ts`'s Stage 2.5 "stage-order-before-secret-backstop" test (Phase 3, PR-4).

### Deviations from Design (Phase 3 final slice)

None beyond what Phase 3 (partial) already disclosed for `INLINE_PATCH_REJECTED` and the inter-check order (both `validate.ts`-side, unaffected by this slice). One judgment call this slice itself had to make, since neither design.md nor either delta spec states it explicitly: **the `round` value journaled for a non-COUNTER turn.** design.md's "Round counting" row states only "Increments only on journaled COUNTER; cap = `readMaxCounterRound+1`" — it defines how the COUNTER count advances, not what `round` a PROPOSAL/AUDIT/CONSENSUS/ESCALATE row should carry, even though DATA-MODEL.md §3.7 marks the column `NOT NULL` for every turn. This batch's reading: `round` records "how far the debate had reached when this turn was journaled" — a PROPOSAL opens a debate at round 0 (no COUNTER exchanged yet); an AUDIT answers the round already reached (`readMaxCounterRound()`, same as if no COUNTER had been journaled at all yet); a COUNTER advances into the NEXT round (`readMaxCounterRound() + 1` — the exact expression `validate.ts`'s own round-cap check already uses to decide whether to admit it, so the two can never disagree); and CONSENSUS/ESCALATE close the debate at the round already reached, same as AUDIT. This keeps `round` monotonically non-decreasing across a debate's journal rows and lets a restart-durable reader tell "how far did this debate get" from the highest row alone, without inventing a value the spec never assigned. Reported here rather than silently picked, per the "if you discover the design is wrong or incomplete, NOTE IT" rule — the Director/tribunal may want to make this explicit in design.md at the next touch, but it does not block this slice since every spec scenario this batch had to satisfy passes under this reading and no scenario contradicts it.

### Issues Found (Phase 3 final slice + Phase 4)

None beyond the disclosed `round`-semantics judgment call above. `design.md`'s Data Flow line, the arena-light-debates spec's "Every debate REPLY is silent..." and "CONSENSUS and ESCALATE are message-only closures" requirements, and the send-path delta spec's "Marker-aware silence for debate REPLY turns" / "Each debate turn is exactly one rate-budget hit" requirements were all internally consistent with what tasks.md 3.3-3.4 asked for, and consistent with the real, already-merged `validate.ts`/`debate-marker.ts`/`debate-journal.ts` this batch read in full before writing anything. **F5 is now fully implemented: all tasks in `tasks.md` are `[x]`, unit 4 (`validate.ts`) and unit 8 (`send-path.ts`) are both closed, and all 15 real scenarios have non-vacuous covering tests.** The orchestrator (Kairo) owns `sdd-verify`/`sdd-archive` next — this executor does not launch them.

### Remaining Tasks

None. Every task in `tasks.md` (1.1 through 4.1) is `[x]`.

### Workload / PR Boundary (Phase 3 final slice + Phase 4)

- Mode: chained PR slice (`stacked-to-main`, per tasks.md's Review Workload Forecast)
- Current work unit: Unit 5 ("`send-path.ts` silence+journal wiring", PR-5) — the forecast's final suggested work unit
- Boundary: starts from PR-1/PR-2/PR-3/PR-4's merged baseline (`debate_journal` table, `shared/debate-marker.ts`, `ledger/debate-journal.ts`, and `validate.ts`'s `checkDebateTurn`/`ROUNDS_EXHAUSTED`/`debateTurns` all already live); ends with `send-path.ts` consuming `ValidatedSend.debateTurns` for both silence and journaling — the last consumer tasks.md's own Suggested Work Units table names. No further work unit follows PR-5 in the forecast.
- Authored diff (`git diff --numstat`, measured, not estimated): `src/daemon/send/send-path.ts` +74/-2 (three new pure helper functions, one changed call-site line, one destructure addition, one new loop inside `withTransaction`, four new imports, one provenance-header `(9)` addition); `test/daemon/send/send-path.test.ts` +214/-0 (7 new tests, 5 fixture markers, 2 new helpers, 2 new imports). Combined **290 authored lines** — well under the 400-line budget for this unit (no `size:exception` needed for PR-5)

---

## Phase 3 (partial): `validate.ts` round-cap + role stage — complete (PR-4 slice, tasks 3.1-3.2 ONLY)

- [x] 3.1 RED `test/daemon/send/validate.test.ts`: cap boundary (round 2/3 COUNTER ok, next `ROUNDS_EXHAUSTED`, unjournaled); non-participant/wrong-role (`NOT_ORIGINATOR`/`NOT_ADDRESSEE`); inline-patch rejected; ordering before secret backstop.
- [x] 3.2 GREEN `src/daemon/send/validate.ts`: `checkDebateTurn` stage (no-op unless decodes) between loop-prevention and secret backstop; `ROUNDS_EXHAUSTED` added to `SendErrorCode`; `debateTurns?` on `ValidatedSend`.

**Explicit STOP boundary honored**: tasks 3.3-3.4 (`send-path.ts` silence+journal wiring, PR-5) and 4.1 (full suite + `test:static` final sign-off across all 15 scenarios) are **not** part of this batch and remain `[ ]` in `tasks.md`. `send-path.ts`, `shared/debate-marker.ts`, `ledger/debate-journal.ts`, `ledger/schema.ts`, `ledger/migrations.ts` and `shared/constants.ts` were read but not modified.

### Files Changed (Phase 3, tasks 3.1-3.2)

| File | Action | What Was Done |
|------|--------|----------------|
| `src/daemon/send/validate.ts` | Modified | Added `checkDebateTurn`, a new pipeline stage inserted between `checkLoopPrevention` (stage 2) and `checkSecretBackstop` (stage 3): a no-op unless `body` decodes via `decodeDebateBody` (F5's `shared/debate-marker.ts`, already merged); for every decoded marker, in order — (1) role check reusing the existing `NOT_ORIGINATOR`/`NOT_ADDRESSEE` codes (COUNTER requires `caller === thread.from`, AUDIT requires `caller === thread.to`); (2) pointer-only check via `containsInlinePatchShape`, refusing a literal diff with the new `INLINE_PATCH_REJECTED` code; (3) round-cap check, only when a marker is COUNTER, via `readMaxCounterRound(db, project_id, debate_id) + 1 > ARENA_LIGHT_MAX_ROUNDS`, refusing with the new `ROUNDS_EXHAUSTED` code. `debate_id` is `validated.thread` (the REPLY's own thread id — the spec's "`debate_id` = the PROPOSAL `thread_id`", since every REPLY on a thread carries that same thread id). The stage journals nothing on refusal or success — `appendDebateTurn` is `send-path.ts`'s job (PR-5, explicitly out of scope). `SendErrorCode` gained `INLINE_PATCH_REJECTED` and `ROUNDS_EXHAUSTED`, each with a doc comment matching the file's existing per-member comment style (see `NOT_PARTICIPANT`'s precedent). `ValidatedSend` gained `debateTurns?: readonly DebateTurnMarker[]`, populated by `checkDebateTurn`'s return value so `send-path.ts` can read the already-decoded markers without re-parsing `body`. `validateSend` now calls the new stage between stage 2 and stage 3 and threads `debateTurns` through to its return value. The module's own SEAM provenance header (`Provenance: ... verdict: SEAM (D-08)`) gained a disclosed `(13)` entry describing this addition, matching every prior F1/F3 change to this same file (`test/security/provenance.test.ts` only requires a SEAM's hash differ from its pinned v1 hash and its `Changes` line not read `none.` — both already true before this edit; the `(13)` addition is documentation-quality parity with the file's own established convention, not something the gate itself requires) |
| `test/daemon/send/validate.test.ts` | Modified | Added a new `--- Stage 2.5: Arena-light debate-turn stage (F5, D7; design.md Decision (c)) ---` section: 10 new tests plus one new helper (`journalCounterRounds`, seeding N already-accepted COUNTER rows via the already-merged `appendDebateTurn`) and two fixture markers (`COUNTER_MARKER`, `AUDIT_MARKER`). Covers: round-2-of-3 COUNTER accepted and carried as `debateTurns`; the (cap+1)-th COUNTER refused `ROUNDS_EXHAUSTED` with zero ledger writes (`totalChanges` unchanged); round-cap scoping to `(project_id, debate_id)` (a same-id debate under another project does not count toward the caller's cap); COUNTER-by-addressee refused `NOT_ORIGINATOR`; AUDIT-by-originator refused `NOT_ADDRESSEE`; AUDIT never checks the round cap even when COUNTER is exhausted; a literal-diff COUNTER refused `INLINE_PATCH_REJECTED`; an ordinary (non-debate) REPLY is a no-op (`debateTurns` is `undefined`); two stage-order tests (loop prevention still runs first — `UNKNOWN_THREAD` on an unknown thread even with a debate-marked body; the new stage runs before the secret backstop — a cap-exhausted, secret-shaped COUNTER is refused `ROUNDS_EXHAUSTED`, not `SECRET_PATTERN_DETECTED`) |

### TDD Cycle Evidence (Phase 3, tasks 3.1-3.2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1/3.2 | `test/daemon/send/validate.test.ts` | Unit (real `node:sqlite`, file-backed ledger via `openLedger`) | ✅ 47/47 (pre-change baseline for this file, run before any edit) | ✅ Written — `TS2339: Property 'debateTurns' does not exist on type 'ValidatedSend'` at 4 call sites, confirmed by `npx tsc -b` before `checkDebateTurn`/`debateTurns` existed | ✅ Passed (57/57 — the 47-test safety net plus all 10 new tests — on first execution after implementing GREEN) | ✅ 10 cases: cap-boundary-ok, cap-boundary-exhausted-unjournaled, cross-project cap scoping, COUNTER-wrong-role, AUDIT-wrong-role, AUDIT-ignores-cap, inline-patch-rejected, non-debate-no-op, stage-order-after-loop-prevention, stage-order-before-secret-backstop | ➖ None needed — `checkDebateTurn` follows the file's own existing per-stage function shape (`checkLoopPrevention`, `checkSecretBackstop`) with no duplication introduced |

### Test Summary (Phase 3, tasks 3.1-3.2)
- **Total tests written**: 10 (all in `test/daemon/send/validate.test.ts`)
- **Total tests passing**: 57/57 in the focused file (47 pre-existing + 10 new); 0 regressions in the full suite (see Full-Suite Verification below)
- **Layers used**: Unit (10), Integration (0), E2E (0)
- **Approval tests** (refactoring): None — no refactoring tasks in this batch; `checkDebateTurn` is new code inserted into an existing pipeline function (`validateSend`), which is a genuine behavior addition (new stage), not a refactor of existing stages
- **Pure functions created**: 1 (`checkDebateTurn` — reads `thread`/`db` but performs no write; matches the file's own existing stage functions, several of which also read `db`/`config` as inputs without being "impure" in the mutating sense)

### Work Unit Evidence (Phase 3, tasks 3.1-3.2)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npx tsc -b && node --test dist/test/daemon/send/validate.test.js` → `tests 57, pass 57, fail 0, cancelled 0, skipped 0` |
| Runtime harness command/scenario and exact result | A real integration path within this unit's own boundary: every new test calls `validateSend` (the full five-stage pipeline, not `checkDebateTurn` in isolation) against a real file-backed `node:sqlite` ledger (`openLedger`) seeded through `writeThreadRecord`/`appendDebateTurn` exactly as `send-path.ts` (PR-5) will read/write it — not a mock. No daemon boot, IPC or transport boundary exists at this stage's own layer (design.md's Threat Matrix: "N/A — no routing, shell, subprocess..."); `node --test dist/test/daemon/send/validate.test.js` → 57/57, matching the focused command above |
| Rollback boundary | Revert the `checkDebateTurn` function, its two `SendErrorCode` additions (`INLINE_PATCH_REJECTED`, `ROUNDS_EXHAUSTED`), the `debateTurns?` field on `ValidatedSend`, the one added `checkDebateTurn(...)` call site inside `validateSend`, the three new imports (`readMaxCounterRound`, `ARENA_LIGHT_MAX_ROUNDS`, `containsInlinePatchShape`/`decodeDebateBody`/`DebateTurnMarker`), the disclosed `(13)` provenance-header line, and the new `--- Stage 2.5 ---` test section plus its two new imports in the test file. `ROUNDS_EXHAUSTED`/`INLINE_PATCH_REJECTED` have no other call site yet (`send-path.ts`, PR-5, is their first and only future consumer) — reverting this slice alone leaves every pre-existing `validate.ts` behavior byte-for-byte unchanged (confirmed by the 47/47 safety-net rerun inside the 57/57 total) |

### Full-Suite Verification (Phase 3, after tasks 3.1-3.2)

- `npm test` (`tsc -b && node --test "dist/test/**/*.test.js"`): **1521 tests, 1515 pass, 0 fail, 6 skip** (baseline after Phase 2 was 1511/1505/0/6 per this same file's own recorded figure — +10 matches exactly the new tests added in this batch; 0 regressions).
- `npm run test:static`: **57/57 pass**, including `test/security/provenance.test.ts`'s two tests — confirming the disclosed `(13)` provenance-header addition to `validate.ts` (a SEAM file) still hash-mismatches its pinned v1 body and still carries a non-`"none."` `Changes` line, exactly as every prior change to this file has. The same two `ERROR: El sistema no ha podido encontrar la clave o el valor del Registro especificados.` lines observed in Phase 2's run recurred here — the same pre-existing Windows-registry/OS-keyring probe noise already disclosed there, not a new regression, and the suite still reports 57/57.

### Deviations from Design (Phase 3, tasks 3.1-3.2)

One disclosed addition beyond design.md's literal Interfaces/Contracts listing: `INLINE_PATCH_REJECTED` is a new `SendErrorCode` member not named anywhere in design.md's `SendErrorCode += "ROUNDS_EXHAUSTED"` line. This is not a silent deviation — the orchestrator's own task brief explicitly anticipated this gap ("check if there's already a fitting code... if genuinely new, name it clearly, e.g. `INLINE_PATCH_REJECTED`, and add it to `SendErrorCode`"), and no existing code in the union fits "content structurally rejected for shape reasons" (`VALIDATION_ERROR` is reserved for stage-1 schema failures, `SECRET_PATTERN_DETECTED` for a different backstop entirely). The spec's own "Debate bodies are pointer-only, never inline patches" requirement demands a rejection; `INLINE_PATCH_REJECTED` is that rejection, documented with the same per-member doc-comment style as every other `SendErrorCode` entry.

A second, smaller disclosed choice: the design's Data Flow line groups "decode, pointer-only, role check ... round-cap" as one bullet without specifying inter-check order among decoded markers. This batch runs, across ALL decoded markers: (1) every marker's role check, then (2) every marker's pointer-only check, then (3) one round-cap check if any marker is COUNTER — per the orchestrator's own explicit numbered algorithm (steps 2-5 of the task brief), which this implementation follows exactly. No spec scenario distinguishes a different inter-check order, so this is the only order tested.

### Issues Found (Phase 3, tasks 3.1-3.2)

None. Design.md's Decision (c), the `arena-light-debates` spec's "Round cap refuses the (cap+1)-th COUNTER" and "Participation and scope reuse existing invariants" requirements, and the `send-path` delta spec's MODIFIED "Validation pipeline and secret backstop run before any network call" requirement were all internally consistent with what tasks.md 3.1-3.2 asked for, and consistent with the real, already-merged `validate.ts`/`debate-marker.ts`/`debate-journal.ts`/`constants.ts` this batch read in full before writing anything.

### Remaining Tasks (out of scope for this batch — Phase 3.3-3.4 and Phase 4)

- [x] ~~3.3-3.4 `daemon/send/send-path.ts` (PR-5, silence+journal wiring)~~ — **superseded**: completed in the "Phase 3 (final slice) + Phase 4" section above (a later apply batch); left struck through here rather than deleted, so this historical Phase-3-partial record does not silently change what it originally reported as remaining
- [x] ~~4.1 Full suite + `test:static` green, all 15 scenarios (7+2+6)~~ — **superseded**: completed in the "Phase 3 (final slice) + Phase 4" section above; this batch's slice of the 6 Phase-3 scenarios (round-cap boundary, participation/role) was already green here, the remaining scenarios depended on Phase 3.3-3.4 which is now done

### Workload / PR Boundary (Phase 3, tasks 3.1-3.2)

- Mode: chained PR slice (`stacked-to-main`, per tasks.md's Review Workload Forecast)
- Current work unit: Unit 4 ("`validate.ts` round-cap+role stage", PR-4)
- Boundary: starts from PR-1/PR-2/PR-3's merged baseline (`debate_journal` table, `shared/debate-marker.ts`, `ledger/debate-journal.ts` all already live and callable); ends with `validate.ts` exposing `ValidatedSend.debateTurns` and refusing round-cap/role/inline-patch violations, but **not yet wired to any silence or journal-write behavior** — Phase 3.3-3.4 (`send-path.ts`, PR-5) is the first consumer
- Authored diff: `src/daemon/send/validate.ts` +~95 lines (new function, two doc-comment updates, three import lines, two `SendErrorCode` members, one interface field, one call site); `test/daemon/send/validate.test.ts` +~180 lines (10 new tests, one helper, two fixtures, three import lines). Combined ≈275 authored lines — well under the 400-line budget for this unit as tasks.md's own Suggested Work Units table anticipated (PR-4 has no `size:exception`)

---

## Phase 2: Core — complete (PR-2 + PR-3 slices, applied in one batch)

- [x] 2.1 RED `test/shared/debate-marker.test.ts`: encode/decode round-trip each `DebateTurnKind`; wire-mapping scenario (PROPOSAL/CONSENSUS envelope+marker).
- [x] 2.2 RED same file: `containsInlinePatchShape` true for literal diff, false for pointer-only refs.
- [x] 2.3 GREEN `src/shared/debate-marker.ts`: types, `encodeDebateTurn`, `encodeCoalescedReply` (two delimited sections, one line), `decodeDebateBody`, `containsInlinePatchShape`.
- [x] 2.4 RED `test/ledger/debate-journal.test.ts`: `appendDebateTurn`/`readDebateJournal` round-trip, scoped to `(project_id, debate_id)`; `readMaxCounterRound` restart-durable.
- [x] 2.5 GREEN `src/ledger/debate-journal.ts`: writer/reader, mirrors `src/ledger/conditions-store.ts` shape (no own transaction).

Phase 3-4 (tasks 3.1-4.1) are unassigned to this batch and remain `[ ]` in `tasks.md`.

### Files Changed (Phase 2)

| File | Action | What Was Done |
|------|--------|----------------|
| `src/shared/debate-marker.ts` | Created | Pure encode/decode of Arena-light body markers: `DebateTurnKind`, `DebateVerdict`, `DebateTurnMarker`, `DEBATE_TURN_WIRE_MAPPING` (the spec's turn->type/basis table, reusing `RESOLVED_BASIS_VALUES`/`ABANDON_BASIS_VALUE` from `shared/envelope.ts` rather than redeclaring the basis literals), `encodeDebateTurn`, `encodeCoalescedReply`, `decodeDebateBody`, `containsInlinePatchShape` |
| `src/ledger/debate-journal.ts` | Created | `appendDebateTurn`/`readMaxCounterRound`/`readDebateJournal` against `debate_journal` (PR-1's already-merged table); mirrors `conditions-store.ts`'s no-own-transaction shape; guards every free-text column with `assertNoTokenShape` per `openspec/specs/ledger/spec.md`'s "No token in any ledger table" requirement, which names `debate_journal` explicitly |
| `test/shared/debate-marker.test.ts` | Created | 25 assertions across the delimiter format, round-trip for all 5 `DebateTurnKind`s, the wire-mapping scenario (built REQUEST/RESOLVED envelopes), `encodeCoalescedReply`, fail-closed decode, normalizeBody-robustness, and `containsInlinePatchShape` |
| `test/ledger/debate-journal.test.ts` | Created | Round-trip scoped to `(project_id, debate_id)`, nullable-column round-trip, `readMaxCounterRound` counting only `COUNTER` rows, token-shape refusal, and the restart-durability scenario (a second `DatabaseSync` handle against the same file) |

### TDD Cycle Evidence (Phase 2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1/2.2/2.3 | `test/shared/debate-marker.test.ts` | Unit (pure functions) | N/A (new files) | ✅ Written — `TS2307` (module does not exist) before `src/shared/debate-marker.ts` existed | ✅ Passed (18/18 on first execution after implementing GREEN) | ✅ 5 cases (round-trip per `DebateTurnKind`) + 4 more for `containsInlinePatchShape` (2 true-shapes independently, 2 false-shapes including an adversarial half-match) + fail-closed/normalize-robustness cases | ➖ None needed — helpers already factored (`encodeHeader`, `parseMarkerContent`, `isDebateTurnKind`/`isDebateVerdict`), no duplication found |
| 2.4/2.5 | `test/ledger/debate-journal.test.ts` | Unit (real `node:sqlite`, file-backed) | N/A (new files) | ✅ Written — `TS2307` before `src/ledger/debate-journal.ts` existed | ✅ Passed (7/7 on first execution) | ✅ Multiple cases: round-trip+scoping, nullable columns, `readMaxCounterRound` counting only `COUNTER` (PROPOSAL/AUDIT excluded), cross-debate scoping, token-shape refusal (4 sub-cases), restart-durability with a second `DatabaseSync` handle | ➖ None needed |

### Test Summary (Phase 2)
- **Total tests written**: 25 (18 in `test/shared/debate-marker.test.ts` + 7 in `test/ledger/debate-journal.test.ts`, confirmed by `grep -c '^test('` against each file)
- **Total tests passing**: 25/25 new tests pass; 0 regressions in the full suite (see Full-Suite Verification below)
- **Layers used**: Unit (25), Integration (0), E2E (0)
- **Approval tests** (refactoring): None — no refactoring tasks in this batch
- **Pure functions created**: 6 in `debate-marker.ts` (`encodeDebateTurn`, `encodeCoalescedReply`, `decodeDebateBody`, `containsInlinePatchShape`, plus two private helpers `encodeHeader`/`parseMarkerContent`); `debate-journal.ts`'s three exports are thin `DatabaseSync` wrappers, not pure

### Work Unit Evidence (Phase 2)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npx tsc -b && node --test dist/test/shared/debate-marker.test.js dist/test/ledger/debate-journal.test.js` → `tests 25, pass 25, fail 0, cancelled 0, skipped 0` |
| Runtime harness command/scenario and exact result | `debate-marker.ts` is N/A — pure functions, no boot boundary. `debate-journal.ts` has a real runtime-adjacent scenario worth naming on its own: "`readMaxCounterRound` is restart-durable" opens a `DatabaseSync` against a temp-file ledger, writes two `COUNTER` rows, **closes that connection**, opens a **second, independent** `DatabaseSync` handle against the identical file path (simulating a daemon restart, not `:memory:`), and confirms `readMaxCounterRound`/`readDebateJournal` on the new handle still see the persisted rows — `node --test dist/test/ledger/debate-journal.test.js` → that test passes (part of the 7/7 above) |
| Rollback boundary | Revert `src/shared/debate-marker.ts`, `src/ledger/debate-journal.ts` and their two test twins (all four are new files, independently deletable). Nothing outside this batch depends on either module yet — Phase 3 (`validate.ts`/`send-path.ts`, PR-4/PR-5, explicitly out of scope for this batch) is the first consumer |

### Full-Suite Verification (Phase 2, after tasks 2.1-2.5)

- `npm test` (`tsc -b && node --test "dist/test/**/*.test.js"`): **1511 tests, 1505 pass, 0 fail, 6 skip** (baseline after Phase 1 was 1486/1480/0/6 — +25 matches exactly the new tests added in this batch; 0 regressions).
- `npm run test:static`: **57/57 pass** (unchanged from the Phase-1 baseline; this batch touches no file `test:static` exercises beyond the two new modules, neither of which any static-assertion test enumerates by name). Two `ERROR: El sistema no ha podido encontrar la clave o el valor del Registro especificados.` lines appeared during the secret-store-adjacent tests — pre-existing Windows registry noise from an unrelated OS-keyring probe, not a test failure (the suite still reports 57/57); not touched by this batch.

### Deviations from Design (Phase 2)

One addition beyond design.md's literal Interfaces/Contracts listing for `shared/debate-marker.ts`, disclosed rather than silently added: `DEBATE_TURN_WIRE_MAPPING`, an exported constant table encoding the spec's "Debate turns map onto existing wire types" mapping (PROPOSAL->REQUEST/none, AUDIT/COUNTER->REPLY/none, CONSENSUS->RESOLVED/context-shared, ESCALATE->RESOLVED/abandoned), reusing `RESOLVED_BASIS_VALUES`/`ABANDON_BASIS_VALUE` from `shared/envelope.ts` per this batch's own orchestrator instructions. Design.md's Interfaces/Contracts code block does not list this export, but (a) the orchestrator's task brief explicitly instructed reusing those two `envelope.ts` constants in the GREEN implementation, which has no other call site in this module's four documented functions; (b) it is the mapping table the "wire-mapping scenario" test (task 2.1) exercises; (c) it gives Phase 3 (`validate.ts`/`send-path.ts`) a single derived source of truth instead of two copies of the basis literals drifting apart (this project's own established CONSTITUTION §5 convention). No behavior of the four documented functions changed to accommodate it.

A second addition beyond the design's abbreviated Interfaces/Contracts listing for `ledger/debate-journal.ts`: `appendDebateTurn` guards every free-text column with `assertNoTokenShape` before the insert. This is not present in design.md's Interfaces/Contracts code block, but it is not optional either — `openspec/specs/ledger/spec.md`'s already-archived "No token in any ledger table" requirement names `debate_journal` explicitly in its table enumeration (`No write path MUST ever persist a token-shaped string into any ledger table (offsets, updates, threads, client_cursors, audit_log, debate_journal)`), and every sibling ledger writer (`audit.ts`, `conditions-store.ts`, `unknown-senders.ts`) already applies this exact guard. Implementing the writer without it would have shipped a spec-compliance gap. Reported here per the "if you discover the design is wrong or incomplete, NOTE IT" rule rather than silently deviating.

### Issues Found (Phase 2)

None beyond the two disclosed additions above. Design.md's Interfaces/Contracts, the `arena-light-debates` spec, and DATA-MODEL.md §3.7 were otherwise internally consistent with what tasks.md 2.1-2.5 asked for.

### Remaining Tasks (out of scope for this batch — Phase 3-4)

- [x] ~~3.1-3.2 `daemon/send/validate.ts` round-cap+role stage (PR-4)~~ — **superseded**: completed in the Phase 3 (partial) section above (a later apply batch); left struck through here rather than deleted, so this historical Phase-2 record does not silently change what it originally reported as remaining
- [ ] 3.3-3.4 `daemon/send/send-path.ts` (PR-5) — **STOP boundary**: not touched by this batch per explicit instruction
- [ ] 4.1 Full suite + `test:static` green, all 15 scenarios (7+2+6) — Phase 1+2's slice of this (7+2+6=... see note) is green now: Phase 1 covered the 2 migration scenarios; Phase 2 covers the marker module's behavioral contract (wire-mapping, pointer-only/inline-patch) and the journal's durability scenario. The remaining scenarios (coalesced-REPLY-is-one-silent-send, CONSENSUS/ESCALATE side-effect-free) depend on Phase 3.3-3.4 (`send-path.ts`), still pending. Phase 3's round-cap boundary and participation/role scenarios are now green (see the Phase 3 (partial) section above).

### Workload / PR Boundary (Phase 2)

- Mode: chained PR slice (`stacked-to-main`, per tasks.md's Review Workload Forecast)
- Current work units: Unit 2 ("`shared/debate-marker.ts` encode/decode", PR-2) and Unit 3 ("`ledger/debate-journal.ts` writer/reader", PR-3) — **both implemented in this one apply batch per explicit orchestrator instruction**, but they remain two independently-revertable modules with no cross-dependency (`debate-journal.ts` does not import `debate-marker.ts`'s functions, only its exported types)
- Boundary: starts from PR-1's merged baseline (`debate_journal` table + constants already live); ends with both new modules fully tested and callable, but **not yet wired into any send/validate code path** — Phase 3 is the first consumer of either
- Authored diff: 724 lines across 4 new files (`src/shared/debate-marker.ts` 192, `src/ledger/debate-journal.ts` 177, `test/shared/debate-marker.test.ts` 173, `test/ledger/debate-journal.test.ts` 182), plus 5 checkbox-line changes in `tasks.md`. If split along tasks.md's own Suggested Work Units (PR-2: `debate-marker.ts` + its test = 365 lines; PR-3: `debate-journal.ts` + its test = 359 lines), **each slice independently stays under the 400-line budget** — no `size:exception` needed for either slice as suggested-split. The orchestrator decides the actual PR boundary/commit split; this batch only implements.

---

## Phase 1: Foundation — complete (PR-1 slice)

- [x] 1.1 RED `test/ledger/schema.test.ts`: `DEBATE_JOURNAL_DDL` creates `debate_journal` (cols per `docs/02-architecture/DATA-MODEL.md` §3.7).
- [x] 1.2 GREEN `src/ledger/schema.ts`: export `DEBATE_JOURNAL_DDL` (id, project_id, debate_id, round, turn CHECK, verdict, eid, from_agent_id, to_agent_id, refs, basis_at_close, at), STRICT.
- [x] 1.3 RED `test/ledger/migrations.test.ts`: v1->v2 auto-migrates in one transaction (scenario 1); throwing v2 step leaves `user_version`=1, no partial table (scenario 2).
- [x] 1.4 GREEN `src/ledger/migrations.ts`: appended `{ to: 2, up: (db) => db.exec(DEBATE_JOURNAL_DDL) }` to `LEDGER_MIGRATIONS`.
- [x] 1.5 RED+GREEN `test/shared/constants.test.ts` / `src/shared/constants.ts`: `LEDGER_SCHEMA_VERSION`=2, `ARENA_LIGHT_MAX_ROUNDS`=3, `DEBATE_MARKER_PREFIX`, `ARENA_LIGHT_MESSAGES_PER_ROUND` beside `GROUP_MESSAGES_PER_MINUTE`.

Phases 2-4 (tasks 2.1-4.1) are unassigned to this batch and remain `[ ]` in `tasks.md`.

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `src/ledger/schema.ts` | Modified | Added `DEBATE_JOURNAL_DDL` export (version-2 addition); `LEDGER_SCHEMA_DDL` (v1) untouched |
| `src/ledger/migrations.ts` | Modified | Appended `{ to: 2, up }` step to `LEDGER_MIGRATIONS`, importing `DEBATE_JOURNAL_DDL` |
| `src/shared/constants.ts` | Modified | `LEDGER_SCHEMA_VERSION` 1 -> 2; added `ARENA_LIGHT_MAX_ROUNDS`, `DEBATE_MARKER_PREFIX`, `ARENA_LIGHT_MESSAGES_PER_ROUND` |
| `test/ledger/schema.test.ts` | Modified | +7 tests for `DEBATE_JOURNAL_DDL` (inventory, NOT NULL, STRICT, CHECK vocabulary, nullable columns, non-idempotency) |
| `test/ledger/migrations.test.ts` | Modified | +2 tests for the two spec scenarios; fixed one pre-existing test (`"the first migration applies LEDGER_SCHEMA_DDL itself..."`) whose `runPendingMigrations(db, 0)` call now runs the full 2-step path instead of only step 1 — rescoped to `LEDGER_MIGRATIONS.filter(m => m.to <= 1)` to keep pinning exactly what its own comment says it pins; corrected a comment in `"a later step records its own version"` that became factually stale once the shipped path gained a real second step |
| `test/shared/constants.test.ts` | Modified | +4 tests for the four new/changed constants |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1/1.2 | `test/ledger/schema.test.ts` | Unit (real `node:sqlite`) | ✅ 14/14 (v1 DDL tests, pre-change) | ✅ Written — compile error (`TS2305` missing export) | ✅ Passed (21/21 after one self-caught fix: `assert.deepEqual` vs SQLite's null-prototype rows) | ✅ 7 cases (inventory, NOT NULL set, STRICT load-bearing, CHECK-complete, CHECK-refuses, nullable-columns, non-idempotent) | ➖ None needed — DDL is authored text, not refactored |
| 1.3/1.4 | `test/ledger/migrations.test.ts` | Unit (real `node:sqlite`) | ✅ 12/12 (pre-change generic suite) | ✅ Written — scenario (a) failed `1 !== 2` before the step existed | ✅ Passed (14/14, then 15/15 after fixing the one pre-existing test the new step legitimately broke) | ✅ 2 cases (auto-migrate to v2; throw-safety on the real DDL text, "real-step case" design.md's Testing Strategy calls for) | ✅ Extended `LEDGER_MIGRATIONS`'s own doc comment for the new step; no logic refactor |
| 1.5 | `test/shared/constants.test.ts` | Unit | ✅ 6/6 (pre-change suite) | ✅ Written — compile error for 3 new constants, value-mismatch for `LEDGER_SCHEMA_VERSION` | ✅ Passed (10/10) | ➖ Skipped: each constant is purely structural (config-style literal, one possible declared value, no branching) | ➖ None needed |

### Test Summary
- **Total tests written**: 13 (7 + 2 + 4)
- **Total tests passing**: 13/13 new, 1499/1499 in the three focused files combined (45 schema+migrations+constants at the file level shown by the runner; full-suite total below)
- **Layers used**: Unit (13), Integration (0), E2E (0)
- **Approval tests** (refactoring): None — no refactoring tasks in this batch
- **Pure functions created**: 0 (this batch is DDL text and constant declarations only; no functions were added)

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npx tsc -b && node --test dist/test/ledger/schema.test.js dist/test/ledger/migrations.test.js dist/test/shared/constants.test.js` → `tests 45, pass 45, fail 0, cancelled 0, skipped 0` |
| Runtime harness command/scenario and exact result | N/A — this slice is pure DDL + a migration-path step + constant declarations, with no daemon boot, no IPC, no timers, no process boundary to exercise. `test/ledger/migrations.test.ts` already exercises the real `runPendingMigrations` sequencing against real `node:sqlite` file-backed connections (not mocked), which is the closest thing to a "runtime" for this unit — documented here as the substitute rather than skipped silently |
| Rollback boundary | Revert `src/ledger/schema.ts`, `src/ledger/migrations.ts`, `src/shared/constants.ts` and their three test twins. `LEDGER_SCHEMA_DDL` (v1) and every pre-existing constant value are untouched; no production ledger exists yet (design.md Migration/Rollout), so a revert is a clean no-op against any real data |

## Full-Suite Verification (after all 5 tasks)

- `npm test` (`tsc -b && node --test "dist/test/**/*.test.js"`): **1486 tests, 1480 pass, 0 fail, 6 skip** (baseline was 1473 total / 1467 pass / 6 skip per `AGENTS.md`'s last recorded figure — +13 matches exactly the 7+2+4 new tests added in this batch; 0 regressions).
- `npm run test:static`: **57/57 pass**. First run showed 3 transient `ETIMEDOUT`/`ECONNRESET` failures in `wrong-room.test.ts` / `two-install-wrong-room.test.ts` (loopback TCP connects on Windows) — unrelated to this change (those files import only `RUN_SECRET_BYTES`/`IPC_NONCE_BYTES` from `shared/constants.ts`, both untouched here); confirmed transient by two clean reruns (57/57, then 3/3 in isolation, then 57/57 again). Matches this project's own documented precedent for this exact flake class (`AGENTS.md`'s B-91 "loopback-`ETIMEDOUT`" pattern).
- A background-backgrounded first `npm test` attempt hung (near-zero CPU, zero output, 10+ minutes) and was killed; re-run in the foreground completed in ~9s. Disclosed as a tooling/environment artifact of this session's backgrounding mechanism, not a code defect — no source file was touched to "fix" it.

## Deviations from Design

One necessary, disclosed correction to a **pre-existing** test, not a deviation from design.md/tasks.md: `test/ledger/migrations.test.ts`'s `"the first migration applies LEDGER_SCHEMA_DDL itself…"` test called `runPendingMigrations(db, 0)` with the *default* (full) `LEDGER_MIGRATIONS` list to prove "migration 1 applies exactly `LEDGER_SCHEMA_DDL`". Before this batch, the default list had only one step, so "the whole path" and "just step 1" were identical calls. Task 1.4 appends a real step 2, so the two diverged — the unmodified test failed because the resulting database now legitimately also carries `debate_journal`, which the test's `:memory:` reference database (built by applying only `LEDGER_SCHEMA_DDL`) does not. Fixed by scoping the call to `LEDGER_MIGRATIONS.filter(m => m.to <= 1)`, which preserves the test's original assertion strength unchanged (still asserts exact schema-object equality against the v1-only reference) while keeping it testing what its own comment says it tests. No assertion was weakened, deleted, or removed. A second, purely cosmetic fix: one comment in `"a later step records its own version"` claimed "the shipped path (one step, and `LEDGER_SCHEMA_VERSION` = 1)" — now false — reworded to state the test uses injected probe tables independent of `debate_journal`'s real content, with no change to the test's logic.

## Issues Found

None beyond the two items disclosed above (the incidentally-broken pre-existing test, and the transient environment flake in an unrelated file). Design.md, the `ledger` delta spec, and DATA-MODEL.md §3.7 were all internally consistent with what tasks.md 1.1-1.5 asked for; no contradiction encountered.

## Remaining Tasks (out of scope for this batch — Phases 2-4)

- [x] ~~2.1-2.5 `shared/debate-marker.ts` + `ledger/debate-journal.ts` (PR-2, PR-3)~~ — **superseded**: completed in the Phase 2 section above (a later apply batch); left struck through here rather than deleted, so this historical Phase-1 record does not silently change what it originally reported as remaining
- [ ] 3.1-3.4 `daemon/send/validate.ts` + `daemon/send/send-path.ts` (PR-4, PR-5) — **STOP boundary**: not touched by this batch per explicit instruction
- [ ] 4.1 Full suite + `test:static` green, all 15 scenarios (7+2+6) — Phase 1's slice of this (7+2=9 scenarios: 7 schema + 2 migrations) is green now; the remaining 6 (Phase 3's `validate`/`send-path` scenarios) depend on Phases 2-3

## Workload / PR Boundary

- Mode: chained PR slice (`stacked-to-main`, per tasks.md's Review Workload Forecast)
- Current work unit: Unit 1 — "Schema v2 DDL + migration + constants" (PR-1)
- Boundary: starts from a clean F1-archived baseline, ends with `debate_journal` reachable through `runPendingMigrations` and all four new constants declared — no Phase 2+ code depends on anything outside this boundary yet
- Authored diff: 348 insertions + 10 deletions = 358 changed lines across 6 files (`git diff --stat`), within the 400-line budget for this unit; no `size:exception` needed
