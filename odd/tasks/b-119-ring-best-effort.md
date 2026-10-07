# B-119 — the ring is best-effort, and the bound is pinned by a test

## Objective

Implement ADR-0038's confirmed decision (option (b)): the host-push plane's guarantee is stated exactly —
**the message is guaranteed, the nudge is best-effort** — and the bound that makes that acceptable is pinned
**directly by a test** instead of narrated.

## Why

The extension-facing `sendMessage` is declared `void` (`@earendil-works/pi-coding-agent`'s extension loader),
so no value at the call site distinguishes "delivered" from "the runtime's `.catch` ran". Refusing an
undecidable outcome would turn every cooldown-*merged* ring into a back-off loop. What makes best-effort
acceptable is a **cursor split**: the cursor the adapter's watcher advances belongs to its own daemon session
(`pi-host-doorbell`), not to the session's own client cursor, so a swallowed ring consumes nothing and the row
is still there on the session's next `conmuta_fetch`.

## Scope decision

- **In scope**: `channel-pi/host.ts`'s module doc (the accepted disposition), the ADR's four pins, the runbook's
  operator-facing statement, the one further amendment to ADR-0036, and the governance rows.
- **Deliberately not in scope**: option (a) (making delivery verifiable), which needs a host runtime the adapter
  deliberately does not depend on, and any change to `channel/doorbell-loop.ts` (it must not branch on the
  link's error code).

## Tasks

| # | Task | Evidence |
|---|---|---|
| 1 | Pin 3 — the decision-carrying bound — asserted **directly** over the two `client_cursors` rows. | `test/daemon/serve/fetch.test.ts`; RED observed by the parent with a production-side mutation (the cursor commit advancing every row fails the pin), GREEN restored |
| 2 | Pins 1 and 2 verified where they live rather than duplicated; pin 4 as a documented-consistency static check. | `test/channel-pi/host.test.ts` (adapter halves, extended), `test/channel/doorbell-loop.test.ts` (watcher halves, unchanged), `test/channel-pi/host.test.ts`'s pin 4 |
| 3 | `channel-pi/host.ts`'s module doc and `docs/runbooks/host-doorbell-pi.md` state the same bound as the tests. | observed GREEN; `npm test` 1976/1970/0/6; `test:static` 129/129 |
| 4 | Governance: ADR-0038 `proposed` -> `accepted`, the fourth amendment appended to ADR-0036, the ADR index, and `CHECKLIST.md` B-119 -> `done`. | `docs/03-adr/0038-a-ring-is-best-effort.md`; `docs/03-adr/0036-pi-host-doorbell-adapter.md`; `docs/03-adr/INDEX.md`; `docs/06-backlog/CHECKLIST.md` |

## Verification

- **Delegation**: `gentle-ai-worker` on five surfaces. It chose `test/daemon/serve/fetch.test.ts` for pin 3 and
  explained why the doorbell test could not carry it (that file snapshots `client_cursors` but never exercises
  the session-side read). It reported its own mutation evidence for all four pins.
- **Parent re-verification**: the writer's report was not quoted. The parent read every diff, ran the focused
  suites (106/106) and the full suites, and falsified pin 3 from the **production** side rather than the test
  side: patching the compiled cursor commit to advance every row fails exactly pin 3, and restoring it passes.
- **Residual**: pin 4 is a static text guard — it detects the three artifacts drifting apart, not whether the
  prose is semantically strong. Pin 1/2's watcher halves live in `test/channel/doorbell-loop.test.ts`, outside
  the writer's surfaces; the parent confirmed they pass but did not mutate them.

## Independent verification (2026-10-07, after `399d788`)

The native review of that candidate was **declined by the host** (`consent-declined-this-candidate`,
`lineage_created: false`, nothing mutated and no lineage to repair), so `399d788` has no native review and the
RDD-off path's separate verifier is what covers it. `gentle-ai-verify` reproduced `npm test` 1976/1970/0/6,
`test:static` 129/129, `test:wrong-room` 5/5, the focused 79/79 and `%TEMP%` 0 -> 0; confirmed pin 3's
assertions line by line; reproduced pin 3's failure by rewriting the compiled `commitClientCursor` to advance
every row (45/46 -> 46/46); confirmed `channel/doorbell-loop.test.ts` is untouched and no assertion weakened;
and re-measured the host source the decision rests on (`types.d.ts`'s `sendMessage(...): void`, the loader's
`assertActive` call and throw, and the swallowing `.catch` in `agent-session.js`). It also found two things,
both acted on in the follow-up commit rather than filed:

1. **Pin 4 could be fooled.** It rewrote the runbook body to "The message is NOT guaranteed at all." and the
   phrase-only guard still matched all five regexes. Closed by adding a `forbidden` set of contradiction shapes
   to the pin; the parent reproduced the verifier's own negation as the RED (pin 4 fails, 6/7) and GREEN after
   (7/7). The guard's limit is now stated in the test itself, not implied.
2. **The pin-3 comment conflated two identities.** `RING_CLIENT_ID = "pi-host-doorbell"` is the adapter's host
   *label*, not the UUID the daemon mints as the session's `client_id`; the property is id-agnostic so the pin
   stands, but the comment and ADR-0036's parenthetical said otherwise. Both now name the label as a label.

Left unverified by the verifier and disclosed here: the pushed/remote state (it ran no `git fetch`), the live
end-to-end ring firing (B-114, owed), and the dependency's line numbers in ADR-0038's now symbol-anchored
citation (line numbers move with a dependency's version; the claim was re-measured and holds).
