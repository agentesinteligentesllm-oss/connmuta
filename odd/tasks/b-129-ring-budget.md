# B-129 — an absolute per-window ring budget for the host adapter

> **Status:** open — in progress.
> **Branch:** `fix/b-129-ring-budget` (off `main` at `9124510`).
> **Authority:** the Director delegated the decision with full authority on 2026-10-07 ("el tope de anillos",
> recorded in `26d3ce2`) and this session's opening prompt re-states it ("implementar el tope absoluto de anillos
> por ventana — la decisión ya está tomada"). The disposition inside the row is fixed; the numbers are engineering.
> **Rows:** `docs/06-backlog/CHECKLIST.md` → `B-129`; ADR-0036 decision 6, its second 2026-10-06 amendment ("a
> named bound that is not implemented"), and the third row of its test table.

## Why

ADR-0036 decision 6 names five bounds for the ring. Four ship; **one does not**, and the ADR's own test table
already declares it pinned:

> `| One read in flight, cooldown and per-window budget hold under a burst and under \`saturated\` | \`test/channel-pi/host.test.ts\` |`

Measured 2026-10-06 (session 76) and re-confirmed here: `channel-pi/` implements the **cooldown**
(`PI_RING_COOLDOWN_MS = 15_000`) and nothing else, and `test/channel-pi/host.test.ts` mentions neither `budget`
nor `saturated`. The two budgets that do exist in this repository are elsewhere and are not this one:
`src/daemon/send/rate.ts` (outbound **sends**) and `WAKE_BUDGET_PER_WINDOW = 20` per hour in
`runner/constants.ts`, spent by `runner/loop.ts` for the **headless wake satellite**.

A cooldown is a rate limit, not a budget: it bounds how *often* a ring fires, not how *many*. At one ring per
15 seconds a session under steady traffic can ring **240 times an hour**, and every ring is a model turn in the
session a person is sitting in. That is the unbounded cost decision 6 exists to remove, and it is the
ADR-0012 class — a documented guarantee no test can fail on.

## Scope

`channel-pi/constants.ts`, `channel-pi/host.ts` and `test/channel-pi/host.test.ts`:

- Two named constants beside the cooldown: `PI_RING_BUDGET_PER_WINDOW` and `PI_RING_BUDGET_WINDOW_MS`, each with
  its reasoning in the file (CONSTITUTION §5, the named-constant rule).
- A **sliding** window in `createPiRinger`, mirroring `runner/loop.ts`'s established shape (ring timestamps
  pruned on use against `now - windowMs`), not a fixed bucket — a fixed window lets a burst straddle a boundary
  and spend two windows' worth in an instant.
- A ring suppressed by the budget **resolves without ringing**, exactly as a cooldown merge does: the watcher
  commits its cursor and does not treat it as a delivery failure. No row is lost, because the doorbell cursor is
  not the client cursor (ADR-0038).
- The suppression is reported **once per session** through the adapter's own surface — the `warnOnce` gate
  `channel-pi/main.ts` already owns (B-127) — so a session that has stopped ringing is not mistaken for a quiet
  bus. That is the module doc's own "no silent failure" rule, applied to this new bound.

## Numbers, and why these

`PI_RING_BUDGET_WINDOW_MS = 60 * 60 * 1000` (one hour) and `PI_RING_BUDGET_PER_WINDOW = 20`, deliberately the
same window and cap as the satellite's `WAKE_BUDGET_WINDOW_MS` / `WAKE_BUDGET_PER_WINDOW`: both bounds count the
same thing, **one model turn**, and its reasoning ("twenty turns an hour is already far more than a human can
read, and the cap is what turns a storm into a bounded cost") is not weakened by the turn happening in a live
session. 20/hour is an order of magnitude below the cooldown's implied 240/hour ceiling, which is the point.

The cap is a **ceiling, not a target**, and it is the tunable number: B-114's first real firing is where rings
per burst can be counted, and the constant's own comment says so rather than presenting 20 as measured.

## Interaction with the cooldown (ordering, and why it matters)

Cooldown is checked **first**. A merged ring starts no turn, so it must consume no budget — otherwise a burst
that is entirely merged would still burn the budget while producing no turns, which is precisely backwards. Only
a ring that actually reaches `pi.sendMessage` is recorded.

## Non-goals

- Not the cooldown (unchanged, `15_000`), not the watcher's read pacing, not ADR-0038's best-effort disposition.
- Not a per-binding or per-group budget: this adapter serves one session and one binding, and `createPiRinger` is
  instantiated once per session.
- No new timer, no new state that outlives the session: the window is computed from the injected `now()`, and the
  timestamp array dies with the ringer.
- Does **not** reopen B-124 or B-127 (closed) and does not touch `channel/doorbell-loop.ts`.

## Tasks

1. **Announce the bound in `channel-pi/constants.ts`.** RED first: `test/channel-pi/constants.test.ts` gains the
   two constants to its named-constant assertions (positive whole numbers; the window longer than the cooldown,
   or the budget could never bind). Then the constants.
2. **Enforce it in `createPiRinger`, test-first.** RED first in `test/channel-pi/host.test.ts`: the cap under a
   burst past the cooldown, the sliding refill past the window, a `saturated` announcement burst still capped,
   a merged ring consuming no budget, and the once-per-session report. Then the implementation.
3. **Update the operator half and the ADR.** `docs/runbooks/host-doorbell-pi.md` replaces the "not implemented"
   bullet with the implemented bound; ADR-0036 gains a 2026-10-07 amendment recording that the gap its second
   amendment measured is now closed, with the test names; the B-129 row is set `done`.
4. **Checks and close.** `npm test`, `npm run test:static`, `npm run test:wrong-room`; one work-unit commit;
   native review per §5.2b (`{"mode":"ordinary","baseRef":"<full sha>","committedOnly":true}`) or, if the host
   declines consent, the separate verifier — never a re-driven START.

## Evidence to record at close

- RED observed before GREEN, with the failing assertion named.
- The full gate counts of this tip.
- The commit identity on the feature branch.

## Engram mirror

**Due, and impossible right now.** `engram serve` cannot bind `127.0.0.1:7437` because 7437 falls inside the
reserved TCP range 7364-7463 (`netsh interface ipv4 show excludedportrange protocol=tcp`), so the `mem_*`
tools are unavailable. Measured and recorded in HANDOFF §8 — not re-derived here. This file and the repository
copy are the durable record until the server binds again.
