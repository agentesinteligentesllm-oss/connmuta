# Exploration: F4 — Claude Code channels adapter

## Current State

F4 is greenfield in `src/`: no `channel/` module, no second `bin` entry, and no `claude/channel`
capability registration exist anywhere in this repository (`package.json`'s `bin` map has exactly
one entry, `"conmuta": "dist/src/cli/main.js"`). F1–F3 are archived and shipped every piece of
daemon-side infrastructure F4 sits on top of.

**1. Spike B-09 just closed the precondition question.** MCP's base spec (2024-11-05) defines no
server-initiated turn-trigger notification; any such capability is a proprietary host extension.
Claude Code is confirmed (real protocol handshake, `capabilities.experimental["claude/channel"]`) as
the sole viable host; Codex/OpenCode/Antigravity are checked-and-absent; Gemini CLI/Cursor remain
untested (`docs/06-backlog/CHECKLIST.md#B-09`, closed 2026-09-28). `docs/07-plan/WORK-PLAN.md:92`
records the same verdict as F4's dependency, resolved.

**2. ADR-0024 is the doorbell contract F4 must re-base, not re-derive.**
(`docs/03-adr/0024-channel-doorbell-not-a-second-reader.md`) Every rule in its table is inherited
from v1 and its "Relevance to Conmuta" section is explicit about what does and does not carry: the
*semantics* carry (no body crosses, peek does not consume, gate on sender not room,
`claude/channel/permission` omitted not `false`, second `bin` outside `src/`, `SERVER_VERSION`
unchanged); the *mechanism* does not — "a v2 doorbell therefore cannot peek Telegram at all… The
daemon's durable inbox and per-client cursors (D4) exist for exactly this question"
(ADR-0024:41).

**3. The daemon already builds the exact substrate the adapter needs, for a different consumer.**
`src/daemon/serve/fetch.ts` (`serveFetch`) already implements a read that (a) is per-client, keyed
by `client_id` via `ledger/cursors.ts`'s `ensureClientCursor`/`advanceClientCursor`
(`daemon/serve/fetch.ts:449-457, 701-710`); (b) supports a true peek that persists nothing —
`mark_seen: false` skips both the cursor advance and the surfaced-thread stamps
(`daemon/serve/fetch.ts:697-710`, ADR-0016); and (c) already long-polls against the ledger instead
of Telegram: with an empty read and `timeout_s > 0`, it subscribes to `inbox:<project_id>` on the
poller's `EventEmitter` (`waitForRows`, `daemon/serve/fetch.ts:402-438`), bounded by
`effectiveWaitSeconds` / `FETCH_LONGPOLL_MAX_SECONDS` (`shared/constants.ts:94`, aliasing
`MAX_LONGPOLL_SECONDS`). The emit side is `src/daemon/poller.ts:150`:
`emitter?.emit(\`inbox:${binding.project_id}\`, result)`, fired inside the same write-ahead
transaction admission commits (Invariant 3). This is architecturally the closest analog to v1's
`ChannelWatcher.tick()` — a bounded wait for "something new," race-free by construction because the
empty read and the subscription run in the same synchronous stretch before the first `await`
(`daemon/serve/fetch.ts`'s own module doc, lines 39-49).

**4. `POST /tools/fetch` is already an ordinary IPC route, not an MCP-only internal call.**
`shared/ipc-contract.ts:95-104` lists the daemon's eight fixed routes (`GET /identity`,
`POST /session`, `DELETE /session`, `POST /tools/send`, `POST /tools/fetch`, `POST /tools/status`,
`POST /tools/thread`, `POST /doctor`); `/panel/*` is explicitly scoped OUT of this table as F3's own
concern (`:93`'s comment), and F3's exploration/decisions confirmed the panel got its own second
`node:http` listener rather than extending this table (`openspec/changes/archive/
2026-09-27-f3-web-panel-and-observability/exploration.md`, resolved decision 2). Any process that
completes the same nonce/HMAC handshake (`GET /identity` → `POST /session`,
`daemon/ipc/handshake.ts`, `daemon/ipc/sessions.ts`'s `SessionStore`) can call `POST /tools/fetch`
exactly as the MCP thin client does — nothing in the route table is MCP-transport-specific.

**5. Tribunal record already names the daemon-fed push as the intended shape.**
`docs/05-tribunal/INDEX.md:41`: "Doorbell = one polling process per Claude Code session… The daemon
already sees every update; the channels adapter becomes a daemon-fed push (F4, optional)."

**6. ADR-0025 leaves the saturation mechanism itself an open question for F4, not a carried rule.**
(`docs/03-adr/0025-peek-saturation-and-watermark-commits-last.md`) Its "Relevance to Conmuta" section:
"whether any finite window remains for a doorbell to be blind behind is decided by the F4 SDD
change, together with the signal source of the adapter." This matters because v1's saturation
mechanism exists ONLY because the Bot API's `getUpdates` window (100 rows, Telegram's own ceiling)
cannot be paged without confirming it — "non-destructive and paginating are mutually exclusive under
the Bot API" (ADR-0025:20). The ledger has no such constraint: `readUpdateRows`
(`daemon/serve/fetch.ts:248-255`) is `SELECT … WHERE seq > ? ORDER BY seq ASC LIMIT ?`, an ordinary
SQL read that can be re-issued with a larger `max_batch` or a lower cursor without confirming
anything — there is no Telegram-style "the read itself is the confirmation" property in this layer.
Whether a doorbell built on `mark_seen:false` peeks can therefore ever BE structurally blind the way
v1's watcher was is a real open question, not a re-statement of the old rule.

**7. `WORK-PLAN.md:93`'s Validation row asserts an answer to that same open question as already
settled**, which is a live contradiction worth flagging to Alpha rather than silently resolving:
"ADR-0024/0025 invariants re-pinned against the daemon inbox: `saturated` rings once per cursor
value; watermark commits after delivery; a `<channel>` event never carries peer text." The first
clause presumes the saturation mechanism carries at all — exactly what ADR-0025:38 leaves to this
SDD change to decide. This reads the same shape as the already-logged B-40/B-41 design-vs-contract
contradictions (`AGENTS.md` §4): a gated document (WORK-PLAN) states a specific invariant a sibling
gated document (ADR-0025) explicitly declines to pre-decide.

**8. The v1 reference implementation is small and fully read here** (frozen, read-only, `bf8f365`):
`channel/index.ts` (MCP server bootstrap: `capabilities: { experimental: { "claude/channel": {} } }`,
permission key omitted per ADR-0024, `mcp.notification({ method: "notifications/claude/channel",
params: {...} })` fired fire-and-forget, `for (;;) { await watcher.tick(); await
sleep(POLL_INTERVAL_MS); }`); `channel/watcher.ts` (`ChannelWatcher`: `peek()` under the bridge's
own lock with `timeout: 0` — non-confirming; `tick()` computes the notification, calls the injected
`deliver`, and advances `announcedThrough` only AFTER `deliver` resolves without throwing —
`daemon/serve/fetch.ts`'s own peek/advance split is the direct structural analog, just gated by
`mark_seen` instead of a lock); `channel/notify.ts` (`buildNotification`/
`buildSaturationNotification`: closed `meta` key set, `sanitizeMetaValue` strips anything that could
forge a tag attribute, `META_LIST_LIMIT = 4`, content line is always author-written prose, never
peer text). `channel/notify.test.ts:132,174` pin the emitted meta key sets closed via
`assert.deepEqual(Object.keys(...).sort(), [...])`; `:66-73` pins every meta key as a plain
identifier ("Claude Code drops meta keys that are not plain identifiers, silently" —
`notify.test.ts:62-64`'s own comment).

## Affected Areas

- **New second `bin` package, outside `src/`** — per ADR-0024's "Outside `src/`, second `bin` of the
  same package" rule. `package.json`'s `bin` map currently has one entry (`conmuta`); F4 adds a
  second. Naming, entry-point path (a sibling top-level directory, e.g. `channel/`, mirroring v1's
  layout) and its build/bundle step are undecided.
- **`test/security/`** — this repo already carries the bundle-closure discipline v1's
  `test/security.test.ts:216,232,239` established (`daemon-bundle.test.ts`, `client-bundle.test.ts`,
  `closure.ts`/`closure.test.ts`, `installer-bundle.test.ts`). A new adapter bundle needs its own
  sibling closure test asserting no timer-based emission, no timer-free background loop and no
  `child_process`/exec reachable from its import graph — the same static discipline
  `daemon/serve/fetch.ts`'s own module doc cites as "D-26… pinned here by grepping this file's own
  import specifiers" for the fetch handler.
- **`src/daemon/ipc/handshake.ts`, `src/daemon/ipc/sessions.ts`** — precedent the adapter's own IPC
  client half would reuse verbatim (same nonce/HMAC identity check, same bearer minting) rather than
  invent a second credential scheme, mirroring how F3's panel exploration treated (and then
  deliberately declined) reusing the MCP session domain for a different actor.
- **`src/daemon/serve/fetch.ts`, `src/shared/ipc-contract.ts` (`POST /tools/fetch`)** — the read path
  the adapter calls in peek mode (`mark_seen: false`); no server-side route change is evidently
  required for the read half, only a client that calls it in a loop instead of once per MCP `fetch`
  tool invocation.
- **`src/daemon/poller.ts:150`** — the `inbox:<project_id>` emit the wait already keys on; no change
  needed unless the adapter needs a *different* granularity of wake-up than the fetch tool's own
  batch-oriented one.
- **`src/ledger/cursors.ts` / `client_cursors` (DATA-MODEL.md §3.5)** — whether the adapter's own peek
  loop mints and keeps a `client_cursors` row (one more `client_id`, `host` informational field
  currently documented only with `claude-code`, `cursor`, `opencode` as examples,
  `DATA-MODEL.md:238`) is an open question below; if it does, `MAX_ACTIVE_SESSIONS`
  (`daemon/ipc/sessions.ts:35`, aliasing `MAX_PENDING_HANDSHAKES`) now has to budget for one extra
  long-lived session per project binding on top of the MCP thin client's own.
- **`docs/03-adr/0024-channel-doorbell-not-a-second-reader.md`, `0025-…watermark-commits-last.md`** —
  both carry a `Status` of `inherited-revisit`/`inherited-valid` pending this exploration; their own
  text names the open items this exploration surfaces (mechanism, saturation).
- **`docs/07-plan/WORK-PLAN.md:93`** — its Validation row's saturation clause is contradicted by
  ADR-0025's own "decided by the F4 SDD change" language (Current State item 7); needs either
  confirmation or a correcting amendment once Alpha rules on Open Question 1 below.

## Settled by existing decisions — do not re-litigate

- **Claude Code is the only target host.** B-09 is closed; no other tested host has an equivalent
  capability (`CHECKLIST.md#B-09`, `WORK-PLAN.md:92`).
- **No body crosses; peer prose never reaches the `<channel>` tag.** Only roster keys, the closed
  `type` enum and 12-hex thread ids may cross, pattern-constrained (ADR-0024's table, row 1).
- **Peek never consumes.** Whatever the adapter's read mechanism turns out to be, it must never
  advance a cursor Telegram or the ledger treats as confirming (ADR-0024 row 2; ADR-0016's
  `mark_seen:false` contract already ships this property for `daemon/serve/fetch.ts`).
- **Gate on sender identity, never on room membership** (ADR-0024 row 4) — unchanged from the fetch
  tool's own admission discipline (`shared roster resolution`).
- **`claude/channel/permission` is omitted, never declared `false`** (ADR-0024 row 5) — a direct
  port of v1 `channel/index.ts:62-66`'s capability object.
- **Second `bin`, outside `src/`, same package** (ADR-0024 row 6) — settled shape; only the concrete
  path/name is open (Affected Areas).
- **Not a fourth MCP tool; never treated as delivery** (ADR-0024 row 7) — the adapter cannot become a
  synchronous request/response tool a peer's message routes through; it stays fire-and-forget with no
  acknowledgement, matching the platform's own documented contract.
- **`SERVER_VERSION` does not change for this feature** (ADR-0024 row 8) — nothing about the channel
  is visible on the wire.
- **The watermark commits after delivery succeeds, never before** (ADR-0025, "commit-last" rule) —
  carried unchanged; whatever persistence mechanism the adapter uses, the advance is gated on
  `deliver` resolving without throwing, mirroring v1 `channel/watcher.ts:119-144`'s ordering and
  `daemon/serve/fetch.ts:697-710`'s own `persist` gate (which already encodes an equivalent
  "don't move state for a response that might never arrive" rule for its own caller, JD-A-005).
- **No child_process/exec/shell; no `fs` outside the daemon's home; zero autonomous *sending*
  timer** — the adapter only ever reads and rings a local notification; nothing about it may cause a
  `sendMessage` (CONSTITUTION invariants; OVERVIEW.md §7.6 passive-switch boundary applies to "the
  daemon and the thin client" and this adapter is architecturally a thin client for this purpose).
- **The Director must not see production data or working-name artifacts leak into fixtures** — same
  data-hygiene rule as every other phase (`AGENTS.md` §3).

## Open Questions (genuinely undecided — for Alpha debate before proposal)

1. **Does the saturation mechanism (ADR-0025) carry into F4 at all, and if so, in what form?**
   ADR-0025 itself defers this to the F4 SDD change (Current State item 6); `WORK-PLAN.md:93`'s
   Validation row asserts it carries ("`saturated` rings once per cursor value") as if already
   decided (Current State item 7). The ledger's `SELECT … LIMIT ?` read has no Bot-API-style
   "reading confirms" property, so a peek that returns fewer than `max_batch` rows is not
   structurally blind the way v1's `getUpdates` window was — there may be nothing left for a
   `saturated="true"` event to mean, OR the daemon-side `MAX_BATCH` clamp (`shared/
   constants.ts:97`, currently 100) could still create an equivalent per-call ceiling worth naming.
   This needs a direct decision, not an inherited assumption, and WORK-PLAN.md may need a correcting
   amendment either way (same pattern as B-20's design-amendment precedent).

2. **What client-side notification mechanism does the adapter actually run, concretely?** Two
   candidates, not yet chosen: (a) the adapter is its own long-lived process that repeatedly calls
   the EXISTING `POST /tools/fetch` route in peek mode (`mark_seen: false`) with `timeout_s` near
   `FETCH_LONGPOLL_MAX_SECONDS`, re-issuing immediately on each return — reuses the exact D-02
   long-poll wait with zero server-side changes, but pays `serveFetch`'s full computation (needs_action
   tiering, digest, thread listing, `daemon/serve/fetch.ts:441-751`) on every tick just to learn
   "something arrived," which is materially more work than a doorbell needs; (b) a new, lighter
   purpose-built route (not currently in `IPC_ROUTES`) that answers only "is there anything new past
   cursor X" without assembling the full `FetchToolOutput` shape — smaller per-tick cost, but a new
   route needs its own handshake reuse, its own `client_cursors` question (below), and is a
   server-side surface addition ADR-0024's "not a fourth MCP tool" rule does not obviously forbid
   (it is not a *tool*, it is transport for the doorbell itself) but has not been proposed anywhere
   in the gated documents.

3. **Does the adapter mint its own `client_cursors` row, and if so what identifies it?** V1's watcher
   read the bridge's own persisted cursor directly and never wrote (ADR-0024 row 3, "never writes,
   does not use `loadState`") — there was exactly one cursor per `AGENTBUS_HOME`, shared with the
   bridge. Under D4's per-client cursor model (DATA-MODEL.md §3.5), there is no single shared
   cursor to read: `ensureClientCursor` (`daemon/serve/fetch.ts:449-457`) is the only way to get a
   starting position, and it always creates a row if absent — meaning even a pure peek loop
   necessarily becomes a fourth persisted session (alongside the MCP thin client's own) the first
   time it calls `POST /tools/fetch`. Whether that is acceptable under "the watcher must never be
   the first process to touch a home" (ADR-0024's original rationale, now attached to a daemon
   the adapter did not spawn) — or whether it instead needs to reuse/observe the MCP thin client's
   OWN cursor (via some new read-only accessor) rather than mint a fifth-wheel one that could itself
   drift from what the human session has actually seen — is undecided. `client_cursors.host` is
   documented only with example values (`claude-code`, `cursor`, `opencode`,
   `DATA-MODEL.md:238`); whether the adapter identifies with a new value (`claude-code-channel`?) is
   a small but real naming decision.

4. **How does "one channel per project session" map onto ADR-0029's per-user-daemon topology?**
   ADR-0024's "Relevance to Conmuta" section: "the v1 rule 'arm exactly one session per machine' rested
   on one `AGENTBUS_HOME` per machine; under ADR-0028 the unit is the binding… analysis verdict is
   YES for semantics, REVISIT for deployment." One daemon per OS user (D3/ADR-0029) can serve several
   project bindings simultaneously (D2's bijective bot↔group↔project, each with its own MCP thin
   client and now potentially its own channel adapter instance). Concretely: does each project folder
   get its own adapter process, spawned by the installer as a second `mcpServers`/channel-capable
   entry per project (mirroring F2's existing "opt-in per tool" per-project config-merge pattern,
   `OVERVIEW.md §10.3`) — or is there one adapter process per daemon (per OS user) multiplexing
   several project bindings' doorbells into however many Claude Code sessions are open? The former
   matches v1's "one watcher per session" shape most directly; the latter would need the adapter to
   itself resolve which binding(s) a given Claude Code session's project maps to, which is exactly the
   walk-up-to-`conmuta.json` resolution the MCP thin client already performs
   (`OVERVIEW.md:237`) and the adapter could reuse.

5. **Installer/F2 touchpoint: is wiring the second `bin` into a host's config in scope for F4, or
   deferred?** F2 (archived) already owns "merge, never overwrite; opt-in per tool" per-project MCP
   config entries (`OVERVIEW.md §10.3`) but only ever wrote ONE stdio entry (`conmuta mcp --project
   <id>`). Registering a second channel-capable server entry for Claude Code specifically is new
   installer surface F2 never built and F2 is closed/archived — this exploration flags it but does
   not resolve whether F4 reopens installer scope or ships the adapter binary undocumented-by-the-
   installer for a human to wire manually (WORK-PLAN.md calls the whole feature "optional").

## Approaches

1. **Minimal reuse: adapter as a peek-mode long-poll client of the existing `POST /tools/fetch`
   route.** The adapter completes the same IPC handshake as any thin client, then loops
   `serveFetch`-backed peek calls (`mark_seen:false`, `timeout_s` near the long-poll ceiling),
   deriving a notification from whatever rows come back, gated by the same commit-after-delivery
   watermark discipline as v1.
   - Pros: zero new server-side routes; reuses D-02's race-free wait exactly as built and tested for
     the MCP client; smallest new surface area.
   - Cons: pays the full `FetchToolOutput` computation cost per tick for information a doorbell does
     not need (needs_action tiering, digest, thread listing); mints a `client_cursors` row whose
     semantics (Open Question 3) are not obviously right for a process that isn't the human's actual
     reading session.
   - Effort: Low–Medium.

2. **Purpose-built lightweight notification route.** Add a new, narrower IPC route (or extend the
   poller's wait primitive) that answers only "is anything new past seq N," without assembling
   needs_action/digest/thread state.
   - Pros: matches ADR-0024's "doorbell, not delivery" framing most literally — the adapter's read
     really would carry nothing but a count/sender/type/thread summary, closest to v1's own shape;
     cheaper per tick.
   - Cons: new server-side surface in an already-audited transport module family
     (`daemon/ipc/server.ts`, `shared/ipc-contract.ts`); needs its own handshake reuse decision and
     its own cursor-identity answer; larger design/spec surface than Approach 1.
   - Effort: Medium–High.

## Recommendation

Approach 1 (minimal reuse of `POST /tools/fetch` in peek mode) as the starting design hypothesis,
with Open Questions 1 and 3 resolved BEFORE proposal, because they change the shape of what gets
built rather than its size: whether saturation semantics apply at all changes what the notification
schema needs to express, and whether the adapter mints its own cursor or observes an existing one
changes whether a new ledger read path is needed. Approach 2 should stay on the table only if Alpha's
answer to Open Question 2 concludes the full-`serveFetch` cost per tick is unacceptable — that is an
engineering-cost question best settled with a rough measurement (how expensive is one `serveFetch`
call over a realistic thread count) rather than argued from first principles. This mirrors how F3's
own exploration deferred its transport-shape question (same-port vs. second listener) to a direct
Alpha question rather than a unilateral pick.

## Risks

- **Saturation-semantics contradiction risk (Current State item 7).** If Alpha proceeds to proposal
  without resolving Open Question 1, the design risks silently inheriting a v1 constraint
  (Telegram's 100-row Bot API window) that may not exist in the ledger model, producing either dead
  code (a saturation path that can never fire) or a spec that undersells what the ledger can already
  do.
- **Session-budget risk (Open Question 3).** If the adapter always mints its own `client_cursors`
  row, every project binding with an armed adapter now holds two live sessions
  (`daemon/ipc/sessions.ts`'s `MAX_ACTIVE_SESSIONS`) instead of one; on a machine running several
  bound projects this could approach the ceiling faster than F1's original sizing assumed. Worth
  a named-constant check (constitution's named-constant rule) rather than a silent doubling.
  `MAX_ACTIVE_SESSIONS` aliases `MAX_PENDING_HANDSHAKES` (`daemon/ipc/sessions.ts:35`), so the two
  concerns (pending-handshake ceiling and active-session ceiling) currently share one constant; F4
  should not assume headroom without checking the value.
- **Best-effort honesty risk.** ADR-0024 rejects "treating the channel as delivery" explicitly, and
  the platform's own documented contract is "no acknowledgement, events dropped silently, no error."
  `WORK-PLAN.md:97`: "Nothing here may be documented as a delivery guarantee." Any test or doc that
  implies the doorbell reliably rings would misstate the platform's own contract, the same class of
  overclaim this project's ADR-12 rule exists to prevent.
- **Bundle-closure gap risk.** A new second `bin` without its own `test/security/*-bundle.test.ts`
  sibling (mirroring `daemon-bundle.test.ts`/`client-bundle.test.ts`) would leave the "no timer-based
  emission, no background loop without a timer, no exec" static discipline unenforced for exactly
  the one new process type introduced by this phase — the same gap class B-24 already recorded for a
  different surface (no POSIX CI leg).

## Answers to the assignment's three explicit questions

1. **What the v2 daemon exposes instead of a direct Telegram peek, and where it already exists.**
   The durable inbox (`updates` table, `DATA-MODEL.md §3.2`) plus per-client cursors
   (`client_cursors`, `DATA-MODEL.md §3.5`) are the daemon-fed substrate ADR-0024's own "Relevance to
   Conmuta" section names. The mechanism already ships in F1/F3-archived code:
   `src/daemon/serve/fetch.ts`'s `serveFetch` (peek via `mark_seen:false`, cursor management via
   `ledger/cursors.ts`'s `ensureClientCursor`/`advanceClientCursor`) and its D-02 long-poll wait
   against `src/daemon/poller.ts:150`'s `inbox:<project_id>` `EventEmitter` event, reachable
   out-of-process today only through the already-shipped `POST /tools/fetch` IPC route
   (`shared/ipc-contract.ts:100`).
2. **Open design questions remaining** — enumerated above: (1) whether ADR-0025's saturation
   semantics apply at all under the ledger's unwindowed reads, contradicted today by
   `WORK-PLAN.md:93`'s Validation row asserting they carry; (2) the concrete client-side notification
   mechanism (reuse `POST /tools/fetch` peek vs. a new lightweight route); (3) whether the adapter
   mints its own `client_cursors` row or observes an existing one, and what session-budget cost that
   has against `MAX_ACTIVE_SESSIONS`; (4) how "one channel per project session" maps onto ADR-0029's
   one-daemon-per-OS-user topology now that the unit is the binding, not the machine (per-project
   adapter process vs. one multiplexing adapter per daemon); (5) whether registering the second `bin`
   with a host's MCP config is F4 or reopened-F2 installer scope.
3. **Strict TDD implications for a fire-and-forget, best-effort, no-acknowledgement mechanism.**
   Nothing changes about the mode's substance: delivery itself is by contract unfalsifiable (the
   platform silently drops events with no error, ADR-0024 row 7; `WORK-PLAN.md:97`), so — exactly as
   v1's `channel/notify.test.ts:132,174` do — tests must pin the CLOSED SET of what would be
   attempted (the `meta` key set, that every key is a plain identifier so Claude Code cannot silently
   drop it — `notify.test.ts:66-73` — and that no peer body reaches the notification params) rather
   than assert a real Claude Code process received anything. The one delivery-adjacent property that
   IS testable and must be pinned by a test that can fail (ADR-12's governing rule) is ordering, not
   delivery: the watermark/cursor must advance only AFTER an injected `deliver` callback resolves
   without throwing, exactly as v1 `channel/watcher.ts:119-144` structures it (`deliver` injected
   rather than called inline, so a test can force it to reject and assert the watermark did not move)
   and as `daemon/serve/fetch.ts:697-710`'s own `persist` gate already does for its unrelated caller.

## Ready for Proposal

**No.** Open Questions 1 and 3 in particular change the shape of the design, not just its size, and
should go to Alpha before `sdd-propose` runs — following this project's Research and Pre-Proposal
Gate. Recorded here per `sdd-explore`'s scope: investigation only, no proposal, no code, no tests.
