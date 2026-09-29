# Proposal: Claude Code channels adapter — a daemon-fed doorbell

**Decision basis.** The exploration's own "Recommendation" (Approach 1, reuse `POST /tools/fetch` in
peek mode) is **superseded**. A post-exploration Alpha audit showed it architecturally broken, and
Kairo re-verified both facts against the live code:

- `fetchInputSchema` (`shared/tool-schemas.ts:101-106`) has no `after_seq`; `serveFetch` always reads
  from `cursor.inbox_seq` (`daemon/serve/fetch.ts:457`), and peek mode (`mark_seen:false`) never
  advances it (`fetch.ts:697-710`). Repeated peeks return the same first `MAX_BATCH` (100) rows
  forever, so anything past row 100 in a backlog stays hidden.
- `mark_seen:true` would commit the cursor on the server before the adapter has delivered to Claude
  Code. That breaks ADR-0025's commit-after-delivery rule.

This proposal follows Approach 2. Open questions 1–5 were settled by the CONSENSUS debate
`bus-v2-f4-explore-open-questions-001` and are recorded under "Resolved decisions". They are not
re-litigated here.

## Intent

Give Claude Code an optional, best-effort **doorbell** (WORK-PLAN F4, `WORK-PLAN.md:86-97`; tribunal
D6). When the daemon's durable inbox receives traffic for a bound project, a local
`notifications/claude/channel` event fires in that project's Claude Code session. The event says
how much is waiting and from whom, and it sends the agent to `agentbus_fetch` for the content.
ADR-0024's semantics carry unchanged. Its mechanism, a Telegram peek, cannot carry under Invariant 3
and D3, so the signal source becomes the daemon's ledger.

## Resolved decisions (debate `bus-v2-f4-explore-open-questions-001`, CONSENSUS)

1. **Saturation is redesigned, not dropped.** ADR-0025's "blind spot announced out loud" rule is
   re-derived around the new route's bounded scan depth or an aggregate query, whichever design
   picks. The route must never report "nothing for you" when it did not scan everything past
   `after_seq`. `WORK-PLAN.md:93`'s clause "`saturated` rings once per cursor value" assumes v1's
   mechanism. It gets a correcting amendment once the route's shape is concrete. That amendment is
   a **design- or apply-phase task**; this proposal does not write it.
2. **A new, purpose-built doorbell IPC route** is F4's main server-side surface (see Approach).
3. **The adapter mints its own `client_cursors` row.** It uses a distinct `host` label (e.g.
   `claude-code-channel`, alongside the documented `claude-code`/`cursor`/`opencode`, `DATA-MODEL.md
   §3.5`). The row advances only after delivery, decoupled from the read.
4. **One adapter process per bound project.** This mirrors v1's "one watcher per session". The
   adapter reuses the thin client's walk-up `conmuta.json` resolution (`OVERVIEW.md:237`).
5. **Installer wiring is out of scope.** F2 is archived. F4 ships the adapter binary and documents
   manual host configuration only.

## Scope

### In Scope
- **New doorbell IPC route** in `shared/ipc-contract.ts`. It is added to `IPC_ROUTES`,
  `IPC_REQUEST_SCHEMAS` and `IPC_RESPONSE_SCHEMAS` next to the eight existing fixed routes.
  - Takes an explicit `after_seq`, so the read is not bound to the cursor and can be re-issued
    without missing rows.
  - Answers only "is anything new past seq N" with a closed-key-set summary: count, senders
    (roster keys), types (closed enum), thread ids (12-hex), and the highest seq it covered. The
    response has its own strict schema.
  - Does none of `serveFetch`'s heavier work: no needs_action tiering, digest, thread trees or
    surfaced-thread stamps.
  - Gets its bounded wait from the existing `inbox:<project_id>` emitter (`daemon/poller.ts:150`),
    capped by the existing long-poll ceiling.
  - **Writes nothing.** No cursor advance and no stamps happen inside the read.
- **An explicit, separate cursor-commit step** that advances the adapter's own `client_cursors` row.
  The adapter calls it only after its delivery to Claude Code resolves without throwing. Design
  decides whether this is a second route or a distinct operation.
- **Handshake reuse.** The adapter opens its session with the existing `GET /identity` → `POST
  /session` nonce/HMAC handshake (`daemon/ipc/handshake.ts`, `daemon/ipc/sessions.ts`). No new
  credential scheme.
- **Sender gating.** A row counts only if its sender resolves against the binding's roster by
  numeric identity. Room membership never qualifies a row. The addressee expression is copied from
  the fetch path, never paraphrased (ADR-0025, "copy the expression").
- **The adapter itself**: a second `bin` entry in `package.json`, placed outside `src/` in the same
  package.
  - An MCP stdio server declaring `capabilities.experimental["claude/channel"]`, with
    `claude/channel/permission` **omitted** (never `false`).
  - An inject-then-gate-on-resolve tick modeled on v1 `channel/watcher.ts:119-144`. `deliver` is an
    injected callback. The watermark advances only after it resolves.
  - A notification builder with a closed `meta` key set, plain-identifier keys and sanitized values.
    Its content line contains only author-written prose.
- **Its own bundle-closure security test**, modeled on `test/security/daemon-bundle.test.ts` and
  `client-bundle.test.ts`. It checks that nothing reachable from the adapter's import graph uses
  `child_process`/exec/shell, timer-based emission or `fs` outside the daemon home.
- **Manual-configuration documentation**, worded as best-effort with no delivery guarantee.
- **The WORK-PLAN `:93` correcting amendment**, recorded as a task for a later phase (see Resolved
  decision 1).

### Out of Scope
- Installer or `tool-config-merge` wiring of the second `bin` (F2 archived; Resolved decision 5).
- Any host other than Claude Code (B-09 closed).
- A fourth MCP tool. ADR-0024 rejects it explicitly.
- Any wire change. `SERVER_VERSION` stays as it is and no `AGENTBUS/*` byte changes.
- Reading or sharing the MCP thin client's own cursor.
- Any delivery guarantee, acknowledgement or retry semantics toward Claude Code.

## Capabilities

### New Capabilities
- `channel-doorbell`: the adapter process, the notification contract and the commit-last tick.
- `doorbell-ipc-route`: the new `after_seq` summary read and the decoupled cursor commit. These may
  be folded into the spec as one capability if the spec phase prefers.

### Modified Capabilities
- `ipc-handshake`: the fixed route table grows from eight routes to nine or ten. The handshake
  itself is reused unchanged.

## Approach

**Daemon side.** Add a narrow `daemon/serve/` handler behind the new route. It runs a bounded SQL
read past `after_seq` for the session's binding and applies the fetch path's sender and addressee
filters, copied rather than re-derived. It returns only the closed summary. When the read is empty,
it long-polls using the same race-free subscribe-before-await pattern `serveFetch` uses. Saturation
is expressed through that bounded depth or through an aggregate count, so a scan that stops early
says so. The cursor-commit step is a separate, idempotent, monotone write to the caller's own
`client_cursors` row, which the session identifies.

**Adapter side.** On start, the adapter resolves `conmuta.json`, completes the handshake with `host`
set to the channel label, and reads its starting watermark from its own cursor row. It then loops:
long-poll the doorbell route with `after_seq = watermark`, build the notification, and `await
deliver(...)`. Only after that resolves does it commit the cursor and advance the in-memory
watermark. If `deliver` throws, the watermark does not move and the announcement is not consumed.
The loop is paced only by the daemon's long-poll, so it has no emitting timer. Nothing in it can
reach `sendMessage`.

**Strict TDD.** Red-before-green applies to both the new route and the adapter, and every new `src`
file gets a test counterpart. Tests pin the closed key sets, the plain-identifier meta keys, the
absence of peer bodies from notification params, sender-not-room gating, `after_seq` paging past a
backlog larger than one scan, the saturation behavior, and the ordering rule: a rejected `deliver`
leaves the cursor unmoved. No test asserts that Claude Code received an event. Test file names are
left to spec and tasks.

## Affected Areas

| Area | Impact |
|------|--------|
| `src/shared/ipc-contract.ts` | Modified — new route key(s), strict request/response schemas |
| `src/daemon/ipc/routes.ts` (+ server dispatch) | Modified — route wiring behind existing bearer check |
| `src/daemon/serve/` (new doorbell handler) | New — bounded summary read, long-poll, saturation signal |
| `src/ledger/cursors.ts` | Read/reused — `ensureClientCursor`; commit path decoupled from read |
| `src/daemon/poller.ts:150` | Read-only — existing `inbox:<project_id>` emit |
| `src/daemon/ipc/handshake.ts`, `sessions.ts` | Reused unchanged |
| New top-level adapter dir (outside `src/`) + `package.json` `bin` | New — second bin |
| `test/security/` | New — adapter bundle-closure test |
| `docs/07-plan/WORK-PLAN.md:93` | Amendment task (later phase) |
| ADR-0024 / ADR-0025 status | Follow-up — record F4's re-based mechanism |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Session budget: each armed project holds one more long-lived session against `MAX_ACTIVE_SESSIONS` (64, aliasing `MAX_PENDING_HANDSHAKES`, `shared/constants.ts:305,317`) | Med | Design checks the headroom explicitly under the named-constant rule |
| Overclaiming delivery in tests or docs (`WORK-PLAN.md:97`) | Med | Pin only closed sets and ordering; word docs as best-effort |
| Doorbell and fetch disagree on addressee or sender | Low | Copy the fetch expression and pin both paths against the same fixtures |
| Adapter bundle-closure scope for its own loop | Low | Not a contradiction: `test/security/daemon-bundle.test.ts:170-193` confines timers/loops to named files, each excluding `daemon/transport/*` and `daemon/send/*` from its own closure — a paced I/O loop is fine as long as it cannot reach the sending path (Invariant 5 bans autonomous *emission*, not loops). The adapter's bundle-closure test asserts its entry module's closure has zero `transport`/`send`/Telegram dependencies, mirroring the same pattern. Alpha-confirmed, `bus-v2-f4-proposal-audit-001` |
| Commit-step race (two ticks, stale `after_seq`) | Low | Monotone, idempotent commit; the cursor never moves backward |
| Route table growth touches an audited transport module | Low | Additive only; existing routes and schemas unchanged |

## Rollback Plan

Revert the PR(s). The new route and the second `bin` are additive. No ledger schema migration is
expected, because the adapter's row reuses the existing `client_cursors` table with a new `host`
value. If design finds a migration is needed, it is forward-only and fixed forward.

## Dependencies

- F1 (archived): ledger, IPC handshake, `serveFetch` long-poll substrate.
- B-09 (closed): Claude Code is the only target host.

## Success Criteria

- [ ] With a backlog larger than one scan, repeated doorbell reads using an advancing `after_seq`
      eventually cover every row. No row is permanently hidden.
- [ ] The doorbell read persists nothing. The cursor row is byte-identical before and after.
- [ ] A rejected `deliver` leaves the adapter's cursor and watermark unmoved. The next tick re-rings.
- [ ] Emitted `meta` key sets are closed and plain-identifier. No peer body reaches notification
      params.
- [ ] A non-roster sender never contributes to a ring, even when the message was in the bound group.
- [ ] The saturation or blindness signal fires whenever a scan stopped short of the full range past
      `after_seq`.
- [ ] `claude/channel/permission` is absent from the capabilities object.
- [ ] The adapter bundle-closure test passes. `SERVER_VERSION` is unchanged.
- [ ] The WORK-PLAN `:93` amendment exists before archive.
