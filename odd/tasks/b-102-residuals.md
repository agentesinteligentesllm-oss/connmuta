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

### (f) — The window that actually matters, closed by three checks and not one

**Corrected in `5bf647a`, after the independent review rejected the first attempt as an incomplete fix.**
The first attempt put the `stopping` check at the top of `reconcile()` only. That covers a reconcile that
*begins* after `stopAll()` — which no production caller can produce, because `stop()` clears the heartbeat
interval before the latch is set and `onTick` already refuses to overlap ticks. The window (f) names is a
reconcile **already in flight** when `STOP_TICK_TIMEOUT_MS` expires, and that one is past the top check: it
still reached `buildTransport` and then `createPoller`, whose first statement prepares a statement against
the ledger `stop()` had closed. The defect was reproduced end to end and pinned:
`heartbeat tick failed: database is not open` in `daemon.log`.

Three checks now cover three windows, and none substitutes for another:

1. **Fresh call** — `reconcile()` returns unchanged at once. Narrow (no production caller needs it) but
   correct, and it keeps the class terminal on its own terms, which is also (c).
2. **In flight** — the latch is re-checked at the top of each binding the loop has still to process
   (`break`, not `continue`: nothing was ever created for those bindings, so there is no cleanup to run) and
   again immediately after `buildTransport` resolves, so the poller factory is never reached once shutdown
   has begun. The transport built in that second case is discarded; it owns no socket of its own, and the
   pre-existing post-`createPoller` guard already discarded one the same way.
3. **Inside the factory** — the factory is handed an `AbortController` signal that `stopAll()` aborts, so a
   factory already entered and still awaiting a secret-store read hands `startPoller` an already-aborted
   signal, whose loop body then never runs and never prepares a statement. `startPoller` already supported
   `signal`; the reconciler simply never used it. The post-`createPoller` guard stays as the last line for a
   poller that was already running.

### (c) — State the contract on the field

The field's doc comment states that the latch is never cleared, that `stopAll()` is terminal and
once-per-process, and names all three windows above.

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
| T6 | **Corrective, added after the independent review rejected T1 as incomplete** — close the in-flight window with a post-`buildTransport` latch check, a per-iteration check, and an abort signal handed to the poller factory; pin it at the bindings level and end to end | `5bf647a`; `test/daemon/bindings.test.ts`, `test/daemon/bootstrap.test.ts`, `test/daemon/poller.test.ts` |

## Verification

- `npm test`: **1885 tests / 1879 pass / 0 fail / 6 skip** (baseline 1878/1872/0/6, so +7: the new
  `bindings.test.ts` cases, the new `poller.test.ts` primitive, the two new `bootstrap.test.ts` cases, and
  the rewritten assertions that replaced existing ones).
- `npm run test:static`: **101 / 101**.
- Zero `%TEMP%\conmuta-*` growth across one full `npm test` run (0 before, 0 after).
- Observed RED before GREEN for **(f)** (`transportBuilt` asserted `0`, got `1`), for the in-flight window
  (`pollerCreated` asserted `0`, got `1`), and for **(g)** (the give-up line was absent).
- Mutation-measured non-vacuity: removing the update branch's late guard fails **(a)**; logging
  unconditionally fails the **(g)** precision test; removing the post-`buildTransport` check fails the
  in-flight test; removing that check **and** the abort fails the end-to-end test with the real
  `heartbeat tick failed: database is not open` symptom.
- Disclosed extra change: the 40 ms fixed-sleep site in `bootstrap.test.ts`'s "overlapping heartbeat tick"
  test was converted to the same helper — same pattern, same file, and leaving it would have kept alive
  exactly what B-99 replaced. **Not converted, and filed instead:** `bootstrap.test.ts:517`'s "an unchanged
  registry must not re-fire BINDING_CHANGED on every tick" (the independent review's JD-B-002), because it
  needs a *positive* observation of live ticks inside the window to be non-vacuous, which belongs with B-99.

## Commits

| Commit | Subject |
|---|---|
| `aa7fbd8` | `fix(daemon): check the stopping latch before reconcile starts any work (B-102f)` — `src/daemon/bindings.ts` + `test/daemon/bindings.test.ts`; **its (f) claim was wrong, corrected by `5bf647a`** |
| `6118cd8` | `fix(daemon): bound and record the shutdown wait on an in-flight tick (B-102b, B-102g)` — `src/daemon/bootstrap.ts` + `test/daemon/bootstrap.test.ts` ((g), (b)) |
| `5bf647a` | `fix(daemon): close B-102f in the window it actually names` — the corrective work unit (T6) |

Backlog row `B-102` is marked `done` in `docs/06-backlog/CHECKLIST.md`.
