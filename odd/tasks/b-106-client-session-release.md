# B-106 — the thin client releases its daemon session slot on exit

## Objective

Close the daemon's session-pool leak at its source: the thin MCP client mints a per-session bearer on
its first tool call and **never releases it**, so every host session that ends leaves one of the
daemon's 64 slots occupied until the daemon restarts. Make the client release its slot when its stdio
transport closes, and prove it with tests that fail if the release is removed.

## Problem / why

Measured in session 60 and re-measured against the daemon's own ledger: `client_cursors` held 15 rows
over the ledger's ~22 h of life, 13 of them in the current daemon boot — roughly **2.5 session-shapes
per hour** on this machine, so the ceiling is a one-to-two-day horizon, not a minute one. Past it,
`SessionStore.mint` returns `undefined` and `client/handshake.ts` reports it as
`HandshakeError("DAEMON_DOWN", retryable: true)` — **a false, permanent "the daemon is down" for every
project on that daemon, recoverable only by a restart**, with nothing in `status` or `doctor` naming
the real cause.

The primitives already exist and are unused by this client: `SessionStore.revoke` (`daemon/ipc/sessions.ts`,
PR-31), the `DELETE /session` route (`daemon/ipc/routes.ts`), and RFC 4122 — nothing is missing on the
daemon side. `src/client/ipc-stub.ts`'s own module doc states the gap in the client's own words:
*"nothing in this client ever calls `DELETE /session` to release one"*. The channel adapter and the
wake satellite already publish `DELETE /session` on shutdown; the thin client — the **one per host
session** component — is the leak.

## Scope decision

This unit closes **the leak at its source**. Two halves of B-106's own row are deliberately left open,
each for a named reason:

- **Occupancy visibility in `status`/`doctor`** — a wire-contract change (the status payload's closed
  key set, `shared/ipc-contract.ts`, its PTs and two canonical specs). Filed as the remainder of this
  row rather than folded into a bounded fix.
- **A dead-pid sweep of the bearer pool** — `SessionStore` holds only bearer strings; the `pid` the
  backlog note refers to lives on `client_cursors` rows, so a sweep is a different mechanism with its
  own design. Not attempted here.

A hard-killed client (no graceful exit) therefore still leaks its slot. That is disclosed, not hidden:
the release closes the *normal* end of a host session, which is what the measurement shows dominates.

## Design (decided; corrected below to as-built after Judgment Day round 1)

1. `src/client/ipc-stub.ts` — `IpcSession` gains `release(): Promise<void>`. **REQUIRED, not optional** as
   this plan first said (the reversal is explained where it matters, with the interface itself: the
   daemon's slot ceiling is a shared resource, so an implementation must not be able to omit the
   release; the four test doubles were updated accordingly).
   - It must **never** handshake, **never** spawn a daemon, and **never** wait on `ensureSession()`:
     if no bearer was ever minted for this session, `release()` resolves immediately doing nothing.
     (Releasing is an exit-path courtesy; making the exit path capable of *starting* a daemon would be
     worse than the leak.)
   - When a bearer exists it sends `DELETE /session` with that bearer to the same
     `http://127.0.0.1:<port>` the tool calls use, and **swallows every failure** — a release that
     cannot be delivered is not an error the operator can act on, and the process is leaving anyway.
   - **As built, it also waits for an in-flight handshake** (bounded by the same constant): a release
     that arrived while the first handshake was still resolving used to see an empty cache and return,
     and the handshake then minted a slot nobody revoked. Awaiting the attempt that already exists is
     not starting one — no spawn, no new handshake — so the "never handshakes" guarantee holds.
   - After a successful release the cache is cleared, so a later tool call on the same session would
     re-handshake rather than reuse a revoked bearer (the same self-healing path the `401` case uses).
2. `src/client/main.ts` — `runMcpClient` calls `release()` **after the transport actually closes**, which
   is NOT the same thing as "after `server.connect(transport)` resolves". **This was the unit's first
   blocking defect and the reason the first submission was rejected:** the pinned SDK's `Protocol.connect`
   ends at `await this._transport.start()` (`@modelcontextprotocol/sdk` 1.30.0,
   `dist/esm/shared/protocol.js`), and `StdioServerTransport.start()` only registers stdin listeners — so
   a release sequenced after `connect` runs at STARTUP against an empty cache and closes nothing. The
   close signal is observed by the new exported `awaitTransportClose`, which races three sources because
   no single one covers every host: the transport's own `onclose` (chained, since the SDK's wrapper does
   the protocol's cleanup), `stdin`'s `end`/`close` (the REAL host signal, which the SDK never reports —
   its transport registers only `'data'` and `'error'`), and `process.beforeExit` as the belt.

## Tasks

- [ ] **T1** — this document (before the first source write).
- [ ] **T2** — RED: `test/client/ipc-stub.test.ts` — release sends `DELETE /session` with the cached
      bearer, to the cached port; release with no session makes **zero** calls and zero spawns; release
      after a `401`-driven re-handshake uses the *fresh* bearer; release tolerates a transport failure;
      release clears the cache so the next call re-handshakes.
- [ ] **T3** — GREEN: `release()` in `src/client/ipc-stub.ts`.
- [ ] **T4** — RED/GREEN: `test/client/main.test.ts` + `src/client/main.ts` — the release runs after the
      transport closes, and does not run on a refusal path.
- [ ] **T5** — `openspec/specs/thin-client-tools/spec.md`: the launcher requirement gains the release
      obligation ("the client MUST release its session before exiting when it minted one").
- [ ] **T6** — Verification: `npm run build && npm test`, `npm run test:static`.
- [ ] **T7** — Judgment Day round 1 (two blind judges, frozen manifest), corrections, round 2.
- [ ] **T8** — Commits per work unit; close `CHECKLIST.md`'s B-106 row to the extent this unit closes
      it (leak closed; visibility + dead-pid sweep disclosed as the remainder), LOG/HANDOFF.

## TDD mode

Strict (`CONSTITUTION.md` §6): red before green, `src/client/ipc-stub.ts` and `src/client/main.ts`
keep their `test/`-twins. Runner: `npm run build && npm test`.

## Acceptance criteria

- Removing `release()`'s `DELETE /session` call fails at least one test (non-vacuous).
- `release()` on a session that never made a tool call performs **zero** network calls and zero spawns
  — pinned by a test, not by prose.
- A release failure never changes the process's exit code and never throws.
- The channel adapter and the runner are untouched: their own release behaviour already exists and is
  out of scope.

## Residual window, stated exactly (round 2, judge B)

The release is a best-effort on the exit path, not a barrier. It revokes the slot for the session the
client is actually using, and it now also waits for a handshake that is already in flight — but a
tool call that BEGINS a handshake *after* `release()` has returned (e.g. a `callTool` racing a stale
bearer, or a host that fires one last tool call while the transport is closing) can still mint a slot
that nobody revokes. Closing that window needs the release to be a barrier coordinated with every
`callTool`, which is a different design with its own cost, and it is not claimed here. Together with
the hard-kill case, that is the honest limit of this unit: it closes the normal end of a host session,
which the 2026-10-01 measurement shows dominates.

## Progress

Implemented, corrected after Judgment Day round 1, and verified: `npm test` **1856 / 1850 / 0 / 6**,
`test:static` **99/99**. Non-vacuity measured with two mutants: removing the `DELETE` fails 2 tests, and
restoring the REJECTED design (release at startup, no close wait) fails 3 — including the two tests that
passed with the bug in the first submission.

## Review-round corrections (round 1)

`jd-judge-b` returned **`REJECT`** with a CRITICAL; `jd-judge-a` returned `APPROVE_WITH_CHANGES` and
**did not see the CRITICAL at all** — it recorded the false premise (`connect` resolving on stdio closure)
as CONFIRMED OK. The parent re-read the pinned SDK before accepting either: judge B's citation was exact,
which is why the CRITICAL was corrected even though only one judge raised it.

| Id | Finding | Disposition |
|---|---|---|
| JD-B-001 (CRITICAL) | The release ran after `server.connect()`, which resolves at STARTUP in the pinned SDK, so it released against an empty cache and the leak stayed fully open | `awaitTransportClose` added; the entry point waits for a real close signal; three tests now fail if the release is sequenced at startup |
| JD-B-002 (WARNING) | The two release tests could not distinguish startup-release from exit-release | Both restructured to assert `releases === 0` while the host is connected and `1` after the close |
| JD-B-003 / JD-A-001 (WARNING) | The "swallows a transport failure" test never minted a session, so the `try/catch` it claimed to pin was dead code | The session is minted first and the attempt is counted |
| JD-B-004 / JD-A-002 (WARNING) | `release()` ignored an in-flight handshake, so a slot minted on or after the release path was never revoked | `release()` awaits the existing attempt, bounded by `SESSION_RELEASE_TIMEOUT_MS`; new test |
| JD-B-005 / JD-A-003 (SUGGESTION) | The `IpcToolRoute` comment said `IpcSession` never dials `DELETE /session` | Comment corrected |
| JD-B-006 (SUGGESTION) | This document said "optional" where the code says required | Corrected above |
| JD-B-007 (SUGGESTION) | The B-106 backlog row still reads `open` | Closed to the extent this unit closes it, in the same work unit |

Also disclosed, because the same round exposed it: `test/client/main.test.ts`'s pre-existing
"does not resolve until the transport is actually connected" test had to be rewritten — it asserted the
run finished while the transport was still open, which is precisely the behaviour the CRITICAL was about.
