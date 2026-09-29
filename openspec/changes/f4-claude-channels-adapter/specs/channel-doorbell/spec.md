# Channel Doorbell Specification

## Purpose

A daemon-fed, best-effort doorbell for Claude Code (WORK-PLAN F4; tribunal D6). Folds the proposal's
two named capabilities — `channel-doorbell` (the adapter process, its notification contract and its
commit-last tick) and `doorbell-ipc-route` (the new `after_seq` summary read and the decoupled cursor
commit) — into one spec, since neither reads on its own: the route exists only to feed the adapter's
tick, and the tick's ordering guarantee is enforced by the route's own "writes nothing" contract.
Re-bases ADR-0024's doorbell semantics and ADR-0025's saturation/watermark rules onto the daemon's
durable inbox instead of a direct Telegram peek, per Approach 2 of the proposal (Approach 1 —
reusing `POST /tools/fetch` in peek mode — is superseded; see the proposal's "Decision basis").

## Requirements

### Requirement: New doorbell IPC route joins the fixed route table with an explicit `after_seq` input

The daemon MUST add one new route to `shared/ipc-contract.ts`'s fixed route table (`IPC_ROUTES`),
with matching entries in `IPC_REQUEST_SCHEMAS` and `IPC_RESPONSE_SCHEMAS`, alongside the eight routes
that exist today (`GET /identity` through `POST /doctor`). The route's request schema MUST accept an
explicit `after_seq` field; the read MUST be driven by that field, never implicitly by a stored
cursor, so a caller can re-issue the read at any position without first advancing anything.

#### Scenario: Route table and schemas gain a matching triple

- GIVEN the daemon's fixed route table lists eight routes today, ending in `POST /doctor`
- WHEN the doorbell route is added
- THEN `IPC_ROUTES`, `IPC_REQUEST_SCHEMAS` and `IPC_RESPONSE_SCHEMAS` each gain one matching entry
  for it

#### Scenario: The read is driven by the caller's explicit after_seq, not a stored cursor

- GIVEN a caller issues the doorbell read twice with the same explicit `after_seq` value, with no
  intervening commit
- WHEN neither call advances any stored position
- THEN both calls return the same summary — the read never depends on or mutates a cursor the
  daemon holds on the caller's behalf

### Requirement: Doorbell response is a closed-key-set summary, not a fetch shape

The route MUST answer only "is anything new past `after_seq`" with a closed-key-set summary: count,
senders (roster keys), types (a closed enum), thread ids (12-hex), the highest `seq` the scan
covered, and a saturation flag naming whether the scan stopped short of the full range past
`after_seq`. It MUST have its own strict response schema, distinct from `toolSuccessSchema`'s opaque
object. It MUST NOT perform any of `serveFetch`'s heavier work: no `needs_action` tiering, no digest,
no thread-tree assembly, no surfaced-thread stamps.

#### Scenario: Response carries only the closed summary fields

- GIVEN a batch of new rows exists past `after_seq`
- WHEN the doorbell route serves the read
- THEN the response carries only count, sender roster keys, the closed type enum, 12-hex thread ids,
  the highest `seq` the scan covered, and the saturation flag — and carries no `needs_action` entry,
  no digest, no thread tree and no surfaced-thread stamp

#### Scenario: Response schema rejects fields outside the closed set

- GIVEN the doorbell route's own strict response schema
- WHEN a candidate response carries any field outside {count, senders, types, threads,
  covered_through_seq, saturated}
- THEN validation rejects it, distinct from `toolSuccessSchema`'s bare "some JSON object" check used
  by the four existing tool routes

### Requirement: The doorbell read persists nothing

The read MUST advance no cursor and write no stamp as a side effect of being called, regardless of
whether it found rows.

#### Scenario: client_cursors is byte-identical before and after a doorbell read

- GIVEN a `client_cursors` row's content before a doorbell read
- WHEN the read completes, whether or not it found rows past `after_seq`
- THEN the row is byte-identical after — no cursor advanced, no surfaced-thread stamp was written

### Requirement: The doorbell's bounded wait reuses the existing long-poll substrate

When the read finds nothing past `after_seq` and the caller allows a positive wait, the route MUST
subscribe to the existing `inbox:<project_id>` emitter (`daemon/poller.ts:150`) before its first
`await`, in the same race-free subscribe-before-await shape `serveFetch`'s D-02 wait already uses.
The effective wait MUST be capped by the same ceiling `FETCH_LONGPOLL_MAX_SECONDS` derives from
(`MAX_LONGPOLL_SECONDS`), never a value the caller can raise past it.

#### Scenario: Empty read subscribes to the same emitter before waiting

- GIVEN a doorbell read finds no rows past `after_seq` and the caller allows a positive wait
- WHEN the read waits
- THEN it subscribes to `inbox:<project_id>` on the poller's emitter synchronously, before its first
  `await`, so no emit between the empty read and the subscription can be missed

#### Scenario: Wait is clamped to the existing ceiling

- GIVEN a caller requests a wait above the constant `FETCH_LONGPOLL_MAX_SECONDS` derives from
- WHEN the doorbell route accepts the call
- THEN the effective wait is clamped to that same ceiling, never the caller's raw value

### Requirement: Repeated after_seq reads eventually cover a backlog larger than one scan, and a partial scan says so

A caller MUST be able to re-issue the doorbell read with an advancing `after_seq` — set to the
highest `seq` the previous read covered — so that, given enough calls, every row past the original
`after_seq` is eventually covered by some scan; no row may stay permanently hidden behind one scan's
bound. When one scan's bounded depth (or an equivalent aggregate query) stops before covering the
full range past `after_seq`, the response MUST carry a saturation-or-blindness signal naming that the
scan stopped short. The route MUST NOT report "nothing for you" when it did not scan everything past
`after_seq` (ADR-0025's fail-closed rule, re-derived for the ledger's unwindowed reads rather than
inherited from the Bot API's 100-row ceiling).

#### Scenario: Advancing after_seq eventually covers a backlog larger than one scan

- GIVEN a backlog larger than one scan's bound sits past `after_seq`
- WHEN the caller issues repeated doorbell reads, each time advancing `after_seq` to the highest
  `seq` the previous read covered
- THEN every row eventually appears in some scan's summary; none is permanently hidden

#### Scenario: A scan that stops short signals saturation, not silence

- GIVEN a scan stops before reaching the newest row past `after_seq` (its bounded depth or an
  aggregate clamp was reached)
- WHEN the doorbell read returns
- THEN the response signals saturation/blindness rather than reporting an empty summary as if
  nothing were pending

### Requirement: Cursor commit is separate and gated on delivery resolving without throwing

The adapter's own `client_cursors` row (a distinct `host` label, e.g. `claude-code-channel`) MUST
advance only through a separate, idempotent, monotone commit step — never inside the doorbell read
itself. The adapter MUST call that commit step only after its injected `deliver` callback resolves
without throwing, mirroring v1 `channel/watcher.ts:119-144`'s ordering and `daemon/serve/fetch.ts`'s
own `persist`-gate precedent for "don't move state for a response that might never arrive". A
rejected or thrown `deliver` MUST leave both the persisted cursor and the adapter's in-memory
watermark unmoved.

#### Scenario: Successful delivery commits the cursor and advances the watermark

- GIVEN the adapter's injected `deliver` callback resolves without throwing
- WHEN the tick completes
- THEN the separate cursor-commit step advances the adapter's `client_cursors` row and the
  in-memory watermark to the seq the tick covered

#### Scenario: A rejected delivery leaves the cursor and watermark unmoved, and the next tick re-rings

- GIVEN the adapter's injected `deliver` callback throws or rejects
- WHEN the tick completes
- THEN neither the persisted cursor nor the in-memory watermark moves, and the next tick re-issues
  the same announcement

### Requirement: Sender identity gates a row; room membership never does

A row MUST count toward the doorbell summary only when its sender resolves against the binding's
roster by numeric identity (mirroring the durable-inbox spec's "forged sender never overrides the
verified identity" rule). Room or group membership MUST NOT by itself qualify a row. The
sender/addressee resolution expression MUST be copied verbatim from the fetch path, never
re-derived or paraphrased (ADR-0025's "copy the expression" rule).

#### Scenario: A non-roster sender inside the bound group never contributes to a ring

- GIVEN a message sent inside the bound group by a `user_id` absent from the binding's roster
- WHEN the doorbell scan evaluates that row
- THEN it never contributes to a ring, even though it was delivered inside the bound room

### Requirement: Handshake reuse — no new credential scheme

The adapter MUST open its daemon session through the existing `GET /identity` -> `POST /session`
nonce/HMAC handshake (`daemon/ipc/handshake.ts`, `daemon/ipc/sessions.ts`). Neither the doorbell
route nor the cursor-commit step MUST mint, accept, or require any credential scheme other than
that existing handshake's bearer.

#### Scenario: Adapter authenticates through the existing handshake sequence

- GIVEN the adapter starts and resolves its `conmuta.json` binding
- WHEN it authenticates to the daemon
- THEN it completes the same `GET /identity` -> `POST /session` sequence any other thin client
  uses, minting no new bearer or proof scheme for the doorbell route or the commit step

### Requirement: Adapter ships as a second `bin` entry, outside `src/`, in the same package

`package.json`'s `bin` map MUST gain a second entry for the adapter, distinct from the existing
`conmuta` entry. The adapter's own source MUST live outside `src/`, in the same package as the
daemon (ADR-0024's rule: same package so a reader and the state it reads cannot drift by version
skew).

#### Scenario: package.json carries two bin entries, and the adapter's source sits outside src/

- GIVEN this change ships
- WHEN `package.json`'s `bin` map is inspected
- THEN it carries two entries — the existing `conmuta` entry and a new one for the adapter — and
  the adapter's own source files live outside `src/`

### Requirement: claude/channel/permission is omitted from the adapter's capability registration

The adapter's MCP stdio server MUST declare `capabilities.experimental["claude/channel"]` with the
`permission` key omitted entirely. It MUST NOT declare `claude/channel/permission: false` or any
other value — omission, not a falsy value, is the only form safe across client versions
(ADR-0024 row 5).

#### Scenario: permission key is absent, not present with any value

- GIVEN the adapter's declared capabilities object
- WHEN inspected
- THEN `claude/channel` is present and `claude/channel/permission` is absent as a key entirely —
  never present set to `false` or any other value

### Requirement: Notification meta key set is closed, plain-identifier, and carries no peer body

The notification builder MUST emit a closed `meta` key set whose every key is a plain identifier
(so a host cannot silently drop it for a non-identifier shape). Its content line MUST contain only
author-written prose, never peer-authored text. No peer message body MUST reach any notification
param under any key.

#### Scenario: meta keys match a closed, plain-identifier set

- GIVEN a notification built from a doorbell summary
- WHEN its `meta` object's keys are inspected
- THEN they match a pre-declared closed set, and every key is a plain identifier

#### Scenario: No peer body reaches notification params

- GIVEN a peer's message body is available to the adapter through any means (a coincidental fetch,
  a cache, or otherwise)
- WHEN a notification is built from a doorbell summary
- THEN no notification param, under any key, carries that body or any substring of peer-authored
  text

### Requirement: Adapter bundle-closure test bans transport/send/Telegram reachability, not the paced loop's own timer

The adapter MUST ship its own bundle-closure security test, modeled on
`test/security/daemon-bundle.test.ts` and `client-bundle.test.ts`, asserting that nothing reachable
from the adapter's entry-module import graph uses `child_process`/exec/shell, or imports a
`daemon/transport/*`, `daemon/send/*` or Telegram-client module. `fs` access is confined to a closed,
named allowlist of exactly `{client/binding.js, client/run-file.js}` — the project-tree walk-up
`conmuta.json` resolution this adapter reuses from the thin client (Resolved decision 4) is the one
disclosed exception to "no `fs` outside the daemon home", following the same closed-allowlist
precedent `client-bundle.test.ts` already establishes for the thin client itself. No other file in
the adapter's closure may reference `fs`. The test
MUST NOT assert "zero timers": the adapter's own paced long-poll loop (re-issuing its next doorbell
read) uses a timer for pacing, and Invariant 5 bans autonomous *emission*, not loops — a timer that
cannot reach the sending path is not itself a violation. `SERVER_VERSION` MUST remain unchanged by
this whole change, since nothing about the channel is visible on the wire.

#### Scenario: Adapter's entry-module closure has zero transport/send/Telegram dependencies

- GIVEN the adapter's compiled entry module
- WHEN its import graph is statically scanned
- THEN no `daemon/transport/*`, `daemon/send/*`, or Telegram-client module is reachable from it, no
  `child_process`/exec/shell is reachable, and every `fs` reference resolves to exactly
  `{client/binding.js, client/run-file.js}` — no other file in the closure references `fs`

#### Scenario: The loop's own pacing timer does not fail the closure test

- GIVEN the adapter's paced long-poll loop uses a timer to re-issue its next doorbell read
- WHEN the bundle-closure test runs
- THEN it passes — a timer that cannot reach `transport`/`send` is not a violation of this test

#### Scenario: SERVER_VERSION is unchanged by this change

- GIVEN this change ships the doorbell route and the adapter
- WHEN `SERVER_VERSION` is compared before and after
- THEN it is unchanged

### Requirement: Best-effort documentation and the WORK-PLAN :93 correction are both required deliverables

Manual-configuration documentation for the adapter MUST be worded as best-effort with no delivery
guarantee, matching the platform's own documented contract (no acknowledgement, events dropped
silently, ADR-0024 row 7). `docs/07-plan/WORK-PLAN.md:93`'s Validation row — which currently asserts
"`saturated` rings once per cursor value" as if the v1 windowed-peek mechanism carried unchanged —
MUST receive a correcting amendment reflecting this change's actual saturation/blindness mechanism
before this change reaches archive (Resolved decision 1).

#### Scenario: Manual-configuration docs claim no delivery guarantee

- GIVEN the manual-configuration documentation this change ships
- WHEN read
- THEN it states the doorbell is best-effort, with no delivery guarantee and no acknowledgement, and
  claims no reliability beyond that

#### Scenario: WORK-PLAN :93 is amended before archive

- GIVEN this change reaches archive
- WHEN `WORK-PLAN.md:93`'s Validation row is checked
- THEN it has been amended to reflect this change's actual saturation/blindness mechanism, rather
  than left asserting the inherited v1 windowed-peek assumption

## Traceability

| Source | Requirement |
|---|---|
| Proposal "In Scope" bullet 1; `shared/ipc-contract.ts` route table | New doorbell IPC route joins the fixed route table |
| Proposal "In Scope" bullet 1 ("Answers only…", "Does none of serveFetch's heavier work") | Doorbell response is a closed-key-set summary |
| Proposal "In Scope" bullet 1 ("Writes nothing"); Success Criteria row 2; ADR-0016 | The doorbell read persists nothing |
| Proposal "In Scope" bullet 1 ("Gets its bounded wait…"); `daemon/poller.ts:150`; `daemon/serve/fetch.ts` D-02 wait; `shared/constants.ts` `FETCH_LONGPOLL_MAX_SECONDS` | The doorbell's bounded wait reuses the existing long-poll substrate |
| Success Criteria row 1, row 6; ADR-0025 "peek window is finite" row; Resolved decision 1 | Repeated after_seq reads cover a backlog; a partial scan signals saturation |
| Proposal "In Scope" bullet 2 (cursor-commit step); Success Criteria row 3; ADR-0025 "watermark commits after delivery" row; v1 `channel/watcher.ts:119-144`; `daemon/serve/fetch.ts` `persist` gate | Cursor commit is separate and gated on delivery |
| Proposal "In Scope" bullet 4 (sender gating); ADR-0024 row 4; ADR-0025 "copy the expression" row; durable-inbox spec "Forged sender never overrides the verified identity" | Sender identity gates a row; room membership never does |
| Proposal "In Scope" bullet 3 (handshake reuse); `daemon/ipc/handshake.ts`, `sessions.ts` | Handshake reuse — no new credential scheme |
| Proposal "In Scope" bullet 5 ("second bin entry… outside src/"); ADR-0024 row 6 | Adapter ships as a second bin entry, outside src/ |
| Proposal "In Scope" bullet 5 (capability declaration); Success Criteria row 7; ADR-0024 row 5 | claude/channel/permission is omitted |
| Proposal "In Scope" bullet 5 (notification builder); Success Criteria row 4; ADR-0024 row 1; v1 `channel/notify.test.ts:66-73,132,174` | Notification meta key set closed, no peer body |
| Proposal "In Scope" bullet 6 (bundle-closure test); Risks table row "Adapter bundle-closure scope for its own loop"; Success Criteria row 8; ADR-0024 row "Outside src/" static assertions | Adapter bundle-closure test bans transport/send/Telegram reachability |
| Proposal "In Scope" bullet 7 (manual-configuration docs); "In Scope" bullet 8 (WORK-PLAN amendment); Success Criteria row 9; WORK-PLAN.md:86-97,93; Resolved decision 1 | Best-effort documentation and the WORK-PLAN :93 correction |
