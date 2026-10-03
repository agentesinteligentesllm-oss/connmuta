# B-99 — Replace flaky timer-based test sleeps with condition waits and bounded observation

## Objective

Close backlog row **B-99**: eliminate fixed-sleep assertions that fail or become vacuous under CPU contention in:
1. `test/daemon/lifecycle/heartbeat.test.ts`:
   - `heartbeat: stops cleanly on .stop()` (fixed 35 ms wait before stop, fixed 40 ms wait after stop)
   - `heartbeat: updates heartbeat on lock if lock update function provided` (fixed 40 ms wait for ticks)
   - `heartbeat: handles error in onTick via onError callback` (fixed 35 ms wait for error)
2. `test/daemon/bootstrap.test.ts`:
   - Line 504: fixed 30 ms sleep waiting for poller boot start (`getUpdatesCalls > 0`)
   - Line 517: bare 60 ms sleep waiting for ticks while asserting no re-fire of `BINDING_CHANGED` (JD-B-002: negative proven vacuously without checking that ticks actually occurred)
   - Line 557: fixed 30 ms sleep waiting for the next tick to pick up a newly added binding (`auditRowsAfterAdd.length === 2`)

## Problem / Why

- Fixed `setTimeout` waits assume deterministic scheduling time. Under CPU contention or on loaded runners, ticks take longer to schedule than the arbitrary sleep, causing spurious failures (e.g. `lockUpdateCount >= 1` failing if 0 ticks occurred within 40 ms).
- Conversely, a negative claim ("an unchanged registry must not re-fire `BINDING_CHANGED` on every tick") tested with a blind `setTimeout(60)` passes vacuously if the runner is stalled and executes 0 ticks during that window. An honest test must positively observe live ticks executing while asserting that the audit log stays unchanged.

## Tasks

| # | Task | Status |
|---|---|---|
| T1 | Convert fixed-sleep tests in `test/daemon/lifecycle/heartbeat.test.ts` to `waitForCondition` / `assertStableFor` | done |
| T2 | Convert `test/daemon/bootstrap.test.ts:517` (JD-B-002) to positively observe live ticks (`readLockFile(lockPath)?.heartbeat_at` advancing and `getUpdatesCalls` advancing) while asserting stable audit rows | done |
| T3 | Convert boot start (:504) and hot-reload (:557) fixed sleeps in `test/daemon/bootstrap.test.ts` to condition waits with deadline | done |
| T4 | Run full suite `npm test` (1885 tests), `npm run test:static` (101/101), check `%TEMP%` growth = 0, update `docs/06-backlog/CHECKLIST.md` row B-99 | done |

## Verification Plan

- `npm test`: 1885 tests pass clean.
- `npm run test:static`: 101 checks pass clean.
- Zero `%TEMP%\conmuta-*` directory growth.
- Non-vacuous: injecting a mutation into the unchanged-registry check (re-firing `BINDING_CHANGED`) fails the test; removing tick scheduling fails the tick deadline wait.
