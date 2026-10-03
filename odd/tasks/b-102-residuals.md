# B-102 (residuals) — Close the deferred findings of B-98's own RDD review

## Objective

Close the five still-open findings of backlog row **B-102**, all narrow residuals of the B-98
shutdown work (`src/daemon/bindings.ts`, `src/daemon/bootstrap.ts`), each recorded by an RDD pass
on the B-98 candidate:

- **(a)** the `stopping` guard's **update-existing-binding** branch (`bindings.ts:297-301`) is
  exercised by no test; only the new-binding branch is.
- **(b)** `test/daemon/bootstrap.test.ts`'s B-98 negative assertion ("the poller was actually
  stopped, not leaked") gates on a fixed 60 ms `setTimeout` — the exact fixed-sleep pattern
  B-99 documents replacing.
- **(c)** `BindingsReconciler.stopping` is a one-way latch, set by `stopAll()` and never reset;
  intentional, but its terminal/once-per-process nature is not stated as the contract.
- **(f)** a tick that times out and *later* resolves can still call `buildTransport`/`createPoller`
  against a closed database: the `stopping` check runs only *after* `createPoller` resolves, never
  before `buildTransport` starts.
- **(g)** `stop()` records nothing (no log line) when it gives up on a stalled tick, leaving an
  operator no trace to diagnose the shutdown by.

**(d)** and **(e)** are already closed (sessions 56/57) and are not touched.

## Problem / Why

B-98's fix bounded the daemon shutdown path with two mechanisms: a `stopping` latch inside
`BindingsReconciler`, and `stop()` awaiting the in-flight heartbeat tick through
`raceAgainstTimeout(currentTick, STOP_TICK_TIMEOUT_MS)`. Both are correct in the common case, but
the timeout-then-late-resolve path leaves a real hole **(f)**: `stop()` stops waiting at 5 s, runs
`stopAll()` and closes the database, and the still-running tick then reaches
`buildTransport`/`createPoller` with the ledger already closed — the original B-98 symptom class,
narrowed to this one window. It has been independently re-reported as CRITICAL by more than one
RDD pass (sessions 56 and 57), each time declined as an unplanned detour, so it keeps resurfacing.

**(g)** compounds it: when the bound is hit, nothing is written, so an operator debugging a
slow shutdown has no evidence that the timeout branch was even taken.

**(a)**, **(b)** and **(c)** are hygiene: an untested guard branch, a flaky assertion reintroduced
by the very session that fixed the flakiness elsewhere, and an undocumented (if intentional)
latch contract.

## Design

### (f) — Guard before the work starts, not only after it finishes

`reconcile()` returns the unchanged result immediately when `this.stopping` is already true, before
it loads a registry or touches any binding. This is the "check before `buildTransport` starts"
half; the existing post-`createPoller` guards stay exactly as they are, because they cover the
different window where `stopAll()` races an already-running reconcile.

This also gives the latch its explicit terminal semantics **(c)**: a reconciler that has been
stopped never starts anything again, by contract, not only by the code's accident.

### (c) — State the contract on the field

The field's doc comment already says "never cleared"; it gains the *why*: `stopAll()` is terminal
and once-per-process in this daemon's lifecycle, so a reconcile after it is a no-op rather than a
restart.

### (g) — Record the give-up

`stop()` observes `currentTick`'s own settlement (a local flag set from a `.then` on the promise
this call creates) and writes one `daemon.log` line naming `STOP_TICK_TIMEOUT_MS` when the race
ended on the timer side. `raceAgainstTimeout` keeps its documented contract — a timeout is silent,
the *caller* checks its own state — so no helper API changes.

`raceAgainstTimeout` is not the place for the log: it is a generic, single-purpose module with no
`runDir`, deliberately kept out of `bootstrap.ts` so the daemon bundle's audited timer inventory
stays confined (`test/security/daemon-bundle.test.ts`).

### (a) and (b) — Pin what is already true, and stop sleeping

- **(a)** new test in `test/daemon/bindings.test.ts`: seed one managed binding, change its
  `roster_hash` so the next reconcile takes the update branch, gate the second `createPoller`, run
  `stopAll()` inside that window, release, and assert the new poller was stopped, never registered,
  and that `result.updated` is empty. The behaviour exists; the test pins it. Non-vacuity is proven
  by mutation (removing the guard must make the test fail), not by a RED-as-bug.
- **(b)** the fixed 60 ms wait becomes a bounded condition poll: sample `getUpdatesCalls`, wait
  until it advances (proving the released poller is live) or a deadline expires, and only then
  assert the count is stable. A poller that never resumed fails on the deadline with a clear
  message instead of passing by having been stopped too early to be observed.

## Tasks

| # | Task | Check |
|---|---|---|
| T1 | `reconcile()` returns unchanged when `stopping` is already set (RED first: a test asserting no transport/poller factory call after `stopAll()`) | `test/daemon/bindings.test.ts` RED → GREEN |
| T2 | Pin the update-existing-binding branch of the late `stopping` guard; prove non-vacuity by mutation | new test, + mutation check |
| T3 | State the terminal-latch contract on `BindingsReconciler.stopping` | doc comment + `reconcile()` doc |
| T4 | `stop()` logs one `daemon.log` line when the tick wait times out (RED first) | `test/daemon/bootstrap.test.ts` RED → GREEN |
| T5 | Replace the fixed 60 ms assertion in the B-98 regression test with a bounded condition poll | `test/daemon/bootstrap.test.ts` |

## Verification

- `npm test`: **1881 tests / 1875 pass / 0 fail / 6 skip** (baseline 1878/1872/0/6, so +3 tests:
the two new `bindings.test.ts` cases, the new `bootstrap.test.ts` precision case; the rewritten
assertions replace existing ones).
- `npm run test:static`: **101 / 101**.
- Zero `%TEMP%\conmuta-*` growth across one full `npm test` run (0 before, 0 after).
- Observed RED before GREEN for **(f)** (`transportBuilt` asserted `0`, got `1`) and **(g)**
  (the give-up line was absent).
- Mutation-measured non-vacuity for the two tests whose behaviour already existed or whose claim is a
  "must not happen": removing the update branch's late guard fails **(a)**; logging unconditionally
  fails the **(g)** precision test.
- Disclosed out-of-scope-ish change: the 40 ms fixed-sleep site in `bootstrap.test.ts`'s
  "overlapping heartbeat tick" test was converted to the same helper. Same pattern, same file, and
  leaving it would have kept alive exactly what B-99 replaced.

## Commits

| Commit | Subject |
|---|---|
| `aa7fbd8` | `fix(daemon): check the stopping latch before reconcile starts any work (B-102f)` — `src/daemon/bindings.ts` + `test/daemon/bindings.test.ts` ((f), (a), (c)) |
| `6118cd8` | `fix(daemon): bound and record the shutdown wait on an in-flight tick (B-102b, B-102g)` — `src/daemon/bootstrap.ts` + `test/daemon/bootstrap.test.ts` ((g), (b)) |

Backlog row `B-102` is marked `done` in `docs/06-backlog/CHECKLIST.md`.
