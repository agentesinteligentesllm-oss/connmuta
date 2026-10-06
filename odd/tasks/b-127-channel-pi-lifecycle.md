# B-127 — the F7c adapter holds its own lifecycle promises

> **Status:** open — in progress.
> **Branch:** `fix/b-127-channel-pi-lifecycle`.
> **Authority:** the Director's standing order of 2026-10-06 ("aplica todo lo que consideres adecuado… hazlo con
> maestría"), scoped by this document to the two findings **B-127** records.
> **Row:** `docs/06-backlog/CHECKLIST.md` → `B-127`.

## Why

Both findings were found by a fresh independent reliability review of `channel-pi/` and then re-verified in the code
by mechanism. Both are the adapter breaking a promise it makes about itself.

**(1) A reload leaks a daemon session slot.** `channel-pi/main.ts`'s `session_start` aborts the old loop and then runs
`link = created`, overwriting the previous link **without** `close()`. The superseded link had already minted a
daemon session — `channel/daemon-link.ts` keeps the settled handshake in `connecting`, and `close()` is the only
release path (a best-effort `DELETE /session`) — and `session_shutdown` closes only the newest link.
`sweepDeadSessions` (`src/daemon/ipc/routes.ts:231`) is PID-based, so it cannot reclaim a session whose `pid` is the
still-living `pi`: every reload permanently consumes one of `MAX_ACTIVE_SESSIONS = 64`
(`src/shared/constants.ts:332`). Once the pool is full, `POST /session` answers `SESSION_MINT_REFUSED`
(`src/daemon/ipc/routes.ts:449`) for the ring **and for every other new client on the machine** until the daemon
restarts. This is the B-106 lesson — release the slot on a real transport close — which the thin client implements
and this adapter does not.

**(2) A persistent failure is said once per retry, not once.** The module doc promises: *"An unbound project, no live
daemon, a refused binding and a dead loop each say so once, through the one surface the human is looking at."* The
watcher warns on **every** failed tick by design (`channel/doorbell-loop.ts:122`; the loop deliberately never branches
on the link's error code) and backs off only `CHANNEL_RETRY_BACKOFF_SECONDS = 5` s, so a persistent `NO_DAEMON` or
`REFUSED` adds a `Warning:` line roughly every 5 s for the life of the session (~720 lines/hour). The host does not
coalesce them. The adapter, which owns the human-facing surface, is where "once" belongs.

## Scope

`channel-pi/main.ts` and its test `test/channel-pi/main.test.ts`:

- release the superseded link before replacing it, so a reload returns its daemon session slot;
- keep the module doc's "once" promise with a **per-session** gate over the warnings the adapter forwards — keyed by
  message, so a genuinely *different* failure is never swallowed, and reset per `session_start`, so a reload may
  report again;
- accept an optional `sleep` collaborator, forwarded to `DoorbellWatcher`, so the retry cadence is injectable and the
  "once" promise is observable in a test instead of costing 5 s of wall clock per tick.

## Non-goals

- `channel/doorbell-loop.ts` is **not** touched: its per-tick warning is deliberate (the loop must not branch on
  error codes), it is shared with the `claude-code` channel, and the fix belongs on the surface that makes the
  promise.
- Changing the promise instead of the behaviour is rejected: ADR-12's rule is that a documented guarantee is pinned
  by a test that can fail, and "say so once" is the better behaviour for the human.

## Tasks

| # | Task | Acceptance |
| --- | --- | --- |
| 1 | RED: the supersession test asserts the **superseded** link is closed (`closes() === 1`) while the current one is not, and that shutdown closes exactly the current one; a second test drives repeated link failures with an injected instant sleep and asserts exactly one UI note | both fail against `main`'s adapter |
| 2 | GREEN: close-then-replace, the per-session `warnOnce` gate, and the `sleep` seam | both pass; every existing `channel-pi` test is unchanged and still passes |
| 3 | The promises are pinned | `npm test` and `npm run test:static` green; `%TEMP%` does not grow across one `npm test` |

## Evidence

- RED and GREEN runs are recorded in the session log and in the work-unit commit messages.
- B-127 is closed with a pointer once this lands and is acknowledged.
