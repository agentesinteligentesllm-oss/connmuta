# B-95 Remainder — Corrupt row policy in `serveFetch` and review notes

## Objective

Close the open remainder of backlog row **B-95**:
1. Define and implement a safe corrupt-row policy for `src/daemon/serve/fetch.ts:244-246`:
   - Replace bare `JSON.parse` in `parseStoredEnvelope` with a safe parser returning `StoredEnvelopeShape | null`.
   - Validate envelope structure: object, `type` in `ENVELOPE_TYPES`, `thread` matching `THREAD_PATTERN`, `to` matching `AGENT_ID_PATTERN` or null, `basis` string.
   - When a row's stored envelope is corrupt or unparseable, skip it (`continue`) so it does not fail `serveFetch` with a 500 error, while still allowing the batch's `lastRowSeq` to advance the client cursor past the damaged row.
2. Address the non-blocking review notes from PR #103:
   - R3-1: In `src/daemon/serve/doorbell.ts:120-122`, tighten `to` validation in `parseScannedEnvelope` so that a non-null `to` must match `AGENT_ID_PATTERN` rather than accepting any arbitrary string.
   - R2-1: In `test/channel/main.test.ts:74-77`, reword `MIN_SCANNED_SPECIFIERS` doc comment to eliminate the drift-prone "11 when this was written" figure.

## Context & Invariants

- In `src/daemon/serve/doorbell.ts`, B-95 (a) previously addressed an unguarded `JSON.parse` by introducing `parseScannedEnvelope`, skipping unparseable rows and advancing `covered_through_seq`.
- In `src/daemon/serve/fetch.ts:244-246`, `parseStoredEnvelope` still called bare `JSON.parse(envelopeJson) as StoredEnvelopeShape`. A corrupt row in SQLite `updates.envelope_json` would throw `SyntaxError`, causing `POST /tools/fetch` to fail with 500 and preventing the client's `next_update_id` from ever advancing past that row.
- Skipping corrupt rows mirrors the existing invariant for null bodies (`fetch.ts:509`):
  `// D-20 guarantees a non-rejected, non-ignored row always carries a body; a row that violates that invariant is skipped rather than surfaced as a broken entry.`

## Tasks

| # | Task | Status |
|---|---|---|
| T1 | Write test cases in `test/daemon/serve/fetch.test.ts` demonstrating that corrupt stored envelopes (malformed JSON, invalid types, invalid threads, invalid `to`) are skipped and that `cursor.next_update_id` advances past them | done |
| T2 | Implement safe `parseStoredEnvelope` returning `StoredEnvelopeShape | null` and skip corrupt rows (`envelope === null`) in `src/daemon/serve/fetch.ts` | done |
| T3 | Address review notes: tighten `to` in `src/daemon/serve/doorbell.ts` (R3-1) and reword comment in `test/channel/main.test.ts` (R2-1) | done |
| T4 | Run full suite `npm test`, `npm run test:static`, verify zero `%TEMP%` leaks, and update documentation (`CHECKLIST.md`, `HANDOFF.md`, `LOG.md`) | done |

## Verification Plan

- Observed RED: 13 corrupt envelope tests in `fetch.test.ts` failed with `SyntaxError`, `TypeError`, or assertion failure (3 !== 2) before the fix.
- Observed GREEN: All 45 tests in `fetch.test.ts` pass after the fix.
- Non-vacuity proven by mutation: reverting `parseStoredEnvelope` to bare `JSON.parse` failed 13 tests.
- Full suite: `npm test` runs **1901 tests (1895 pass, 0 fail, 6 skip)** (+16 tests).
- Static checks: `npm run test:static` passes **101/101**.
- Zero temp leaks: `ls -d "$TEMP"/conmuta-*` count stays at 0 across the full suite.
- Security / bundle check: `daemon-bundle.test.ts` passes with no forbidden imports or bare specifiers.
