# B-85 (1) — the DM probe reports health only for what it actually probed

> **Status:** open — in progress (unit 1 of the B-85 row).
> **Branch:** `fix/b-85-dm-probe-honest-status`.
> **Authority:** the Director's session-opening authorization of 2026-10-06 ("toma las riendas… aplica todo lo
> que consideres necesario"), scoped by this document to the first recommendation of B-85's own pointer text.
> **Row:** `docs/06-backlog/CHECKLIST.md` → `B-85`, finding (1).

## Why

`runDmProbe` in `src/daemon/ipc/doctor.ts` returns `status: "pass"` on two outcomes that are not healthy:

- a **degraded** probe, where some roster peers received the probe and others failed — the audit row says
  `outcome: "degraded"`, but the finding an operator reads in `doctor --dm-probe` is indistinguishable from a
  fully clean run; and
- a **roster with no peer besides the bot itself** (`peers.length === 0`), which reports
  `status: "pass"`, `detail: "probe delivered to 0/0 roster peer(s)"` and an `outcome: "ok"` audit row,
  although no message was sent at all.

The doctor exists so that "everything is fine" means something. A probe that tested nothing — or tested
nothing successfully for part of the roster — must not claim the same status as one that tested everything.
This is finding (1) of B-85, the one its own source review called *"one with real weight"*.

## Scope (this unit only)

`src/daemon/ipc/doctor.ts` → `runDmProbe`, and its tests in `test/daemon/ipc/doctor.test.ts`:

- `peers.length === 0` → `status: "warn"`, a detail that says plainly that nothing was probed, and **no**
  `DOCTOR_PROBE` audit row — the same rule the unwired-`roomGuard` branch already follows
  (*"no audit row when the probe never attempted a send"*), because an `ok` row about a send that never
  happened is a false record, not a summary.
- `delivered > 0 && failures.length > 0` (the audit outcome `"degraded"`) → `status: "warn"`.
- unchanged: all delivered → `status: "pass"` and `outcome: "ok"`; none delivered → `status: "fail"` and
  `outcome: "rejected"`; no `roomGuard` wired → `status: "fail"`, no row.

No new audit `outcome` value is introduced: `AuditOutcome` is `"ok" | "degraded" | "rejected" | "dropped"`
(`src/ledger/audit.ts`) and none of the four is a lie here — the zero-peer case writes no row at all.

## Non-goals (left open on B-85, with the row's own pointer intact)

- (2) the unguarded post-send `appendAuditRow`;
- (3) one client-side abort covering sequentially awaited daemon checks;
- (4) the property claims in `tasks.md` the twin does not assert, including a fake room guard that enforces
  nothing.

Those are each their own unit and none is touched here.

## Tasks

| # | Task | Acceptance |
| --- | --- | --- |
| 1 | RED: two tests in `test/daemon/ipc/doctor.test.ts` — a two-peer roster with one failing peer, and a roster whose only entry is the bot itself | both fail against `main`'s `runDmProbe` for the reason the row names (`"pass"` where `"warn"` is owed; and an `ok` audit row where none is owed) |
| 2 | GREEN: split the finding's `status` on the audit outcome, with the zero-peer early return placed before the send loop and before any `appendAuditRow` | the two tests pass; the three existing DM-probe tests are unchanged and still pass |
| 3 | The guarantee is pinned | `npm test` and `npm run test:static` green; `%TEMP%` does not grow across one `npm test` |

## Evidence

- RED and GREEN runs are recorded in the session log and in the work-unit commit message.
- The row is updated to record unit 1 as closed with a pointer to the commit; B-85 itself stays open for
  (2)–(4).
