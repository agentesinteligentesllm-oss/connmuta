# B-106 (remainder) — Occupancy visibility in status/doctor and dead-PID session sweep

## Objective

Complete the remaining two open items of backlog row **B-106**:
1. **Dead-PID sweep of the bearer pool**: Reclaim active session slots in `SessionStore` and the in-memory `sessions` map when client processes have terminated abruptly without a graceful `DELETE /session` release.
2. **Occupancy visibility in `status` and `doctor`**: Surface live session pool occupancy (`active` and `max` against `MAX_ACTIVE_SESSIONS = 64`) in the MCP `status` tool (`daemon.sessions: { active, max }`) and as an online diagnostic check in `doctor` (`session-pool: pass|warn|fail`).

## Problem / Why

In session 62, B-106 was closed at its primary source: the thin MCP client now invokes `DELETE /session` upon real transport closure (`awaitTransportClose`).
However, two residual windows remained open:
- A client process hard-killed (`SIGKILL`, crashed IDE, abrupt terminal close) never reaches transport close and cannot invoke `DELETE /session`. Its bearer slot remained permanently allocated until daemon restart.
- Neither `conmuta status` nor `conmuta doctor` provided visibility into session pool occupancy, making the 64-session ceiling invisible until `SessionStore.mint` refused new sessions with `DAEMON_DOWN`.

## Design

### 1. Dead-PID Sweep (`src/daemon/ipc/routes.ts`)
- In `routes.ts`, `sessions: Map<string, FrozenSessionRecord>` records `pid` per session upon `POST /session`.
- Export `sweepDeadSessions(deps, sessions)`:
  - Iterates through `sessions.entries()`.
  - For each `[bearer, record]`, checks process liveness via `deps.isProcessAlive ?? isProcessAlive`.
  - If the process is dead (`!isProcessAlive(record.pid)`), revokes the bearer from `deps.sessionStore` and removes it from `sessions`.
- Wire `sweepDeadSessions` into:
  - `POST /session` (`createOpenSessionHandler`): runs before minting, ensuring dead slots are reclaimed when capacity is reached.
  - `POST /tools/status` (`createStatusHandler`): runs before computing facts so occupancy is fresh.
- Injectable `isProcessAlive` in `RoutesDeps` enables deterministic testing without process spawning.

### 2. Occupancy in Status (`src/daemon/serve/status.ts`)
- In `StatusDaemonFacts`, add `active_sessions?: number`.
- In `StatusToolOutput`, extend `daemon` with `sessions: { active: number; max: number }`.
- `serveStatus` populates `daemon.sessions` using `daemon.active_sessions ?? 0` and `MAX_ACTIVE_SESSIONS` (64).
- In `routes.ts`, `createStatusHandler` supplies `deps.sessionStore.size` as `active_sessions`.

### 3. Occupancy in Doctor (`src/daemon/ipc/doctor.ts`)
- Add `sessionStore?: SessionStore` and optional `sweepSessions?: () => number` to `DoctorHandlerDeps`.
- In `bootstrap.ts`, pass `sessionStore` to `createDoctorHandler`.
- Add `checkSessionPool(deps)` to online doctor checks:
  - `id: "session-pool"`
  - `status: "pass"` when `active < Math.floor(MAX_ACTIVE_SESSIONS * 0.8)` (`${active}/${max} active sessions`).
  - `status: "warn"` when `active >= Math.floor(MAX_ACTIVE_SESSIONS * 0.8)` and `< MAX_ACTIVE_SESSIONS` (`${active}/${max} active sessions (pool near capacity)`).
  - `status: "fail"` when `active >= MAX_ACTIVE_SESSIONS` (`${active}/${max} active sessions (pool exhausted)`).

### 4. Canonical Specifications
- Update `openspec/specs/thin-client-tools/spec.md` with session pool occupancy in `status`.
- Update `openspec/specs/doctor/spec.md` with online session pool diagnostic check.

## Tasks

- [x] **T1** — Feature document (`odd/tasks/b-106-occupancy-and-dead-pid-sweep.md`) and Engram mirror.
- [x] **T2** — RED/GREEN: Dead-PID sweep in `src/daemon/ipc/routes.ts` with twin tests in `test/daemon/ipc/routes.test.ts`.
- [x] **T3** — RED/GREEN: Surface session occupancy in `src/daemon/serve/status.ts` and `routes.ts` with tests in `test/daemon/serve/status.test.ts` and `test/daemon/ipc/routes.test.ts`.
- [x] **T4** — RED/GREEN: Online doctor check in `src/daemon/ipc/doctor.ts` and `bootstrap.ts` with tests in `test/daemon/ipc/doctor.test.ts`.
- [x] **T5** — Specifications & backlog: update `thin-client-tools/spec.md`, `doctor/spec.md`, and `docs/06-backlog/CHECKLIST.md`.
- [ ] **T6** — Full verification: `npm run build && npm test`, `npm run test:static`, `%TEMP%` scan, and git commits per work unit.

## Acceptance Criteria
- Hard-killed client slots are swept and reclaimed on subsequent `POST /session` or `status` calls, permitting new sessions even after 64 dead clients.
- `conmuta status` reports `daemon.sessions: { active, max }`.
- `conmuta doctor` reports `[pass|warn|fail] session-pool: X/64 active sessions`.
- Strict TDD: RED observed before GREEN for each unit.
- Full test suite passes without regressions or temp leaks.
