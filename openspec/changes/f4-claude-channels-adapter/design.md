# Design: Claude Code channels adapter — a daemon-fed doorbell

## Technical Approach

Two daemon routes and one stdio process. `POST /channel/doorbell` is a read-only, bounded summary of
inbox rows past an explicit `after_seq`. `POST /channel/cursor` is the only write path: it ensures the
caller's `client_cursors` row and, when asked, advances it monotonically. The adapter is a new
top-level `channel/` project, shipped as a second `bin` (`conmuta-channel`). It resolves
`conmuta.json` with the thin client's own `client/binding.ts`, handshakes through a spawn-free
extraction of `client/handshake.ts`, and runs an inject-then-gate-on-resolve tick modeled on v1
`channel/watcher.ts:119-144`.

**Discoveries that shape the design** (verified against the tree):

- `IPC_ROUTES` holds **eight** routes today (`shared/ipc-contract.ts:92-104`), not nine. The table
  grows 8 → 10. See Open Questions, item 1.
- `client/handshake.ts:14-20` statically imports `client/run-state.ts`, which imports
  `client/spawn.ts` (`run-state.ts:20`), so importing the handshake as-is puts `child_process` in the
  adapter's closure. The spec bans that. D6 resolves it with a move-only split.
- `ipc-stub.ts` cannot be reused either. It is typed to the four `/tools/*` routes, parses against
  the opaque `toolSuccessSchema`, and imports `ensureDaemonRunning`, which would also bring spawn into
  the closure.
- The `updates` table holds every admitted roster-sender envelope, including `not_mine` rows.
  Admission has already dropped unknown senders (`admission.ts:415-438`) and self-echo (`:442-446`),
  and has stored `to` already translated by `translateAddressee` (`admission.ts:171-178, 505`, which
  is v1's `lookup(anchor) ?? to` expression). The doorbell reads those stored facts and does not
  re-derive them.
- `client_cursors` is keyed by the per-session `client_id` (`schema.ts:87-90`, `routes.ts:425`). The
  adapter's persisted row therefore lives for one session. A restart mints a new row at the D-19
  catch-up seq, which is correct: the in-memory watermark is authoritative within a process.
- The daemon-bundle test confines timers to `serve/fetch.js` among the serve modules
  (`daemon-bundle.test.ts:170-181`). The doorbell reuses fetch's wait function rather than adding a
  timer of its own (D4).

## Architecture Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|---|
| D1 | Route names | `POST /channel/doorbell` and `POST /channel/cursor`, a new `/channel/*` path family | `/tools/doorbell` | `/tools/*` is the MCP tool surface, and ADR-0024 rejects a fourth tool. A distinct prefix keeps the doorbell visibly outside the tool contract |
| D2 | Cursor commit | A **second route**, not an operation on the doorbell route | A `{op:"read"\|"commit"}` discriminated body on one route | This makes "the read writes nothing" structural. The doorbell handler module imports no ledger write function, which an import-specifier test can pin (ADR-12). One route per schema pair also keeps both response schemas strict and distinct |
| D3 | Saturation mechanism | A scan-depth clamp using a `LIMIT depth+1` probe. `DOORBELL_SCAN_DEPTH = MAX_BATCH`, and `saturated: true` means at least one row past `covered_through_seq` exists that this scan did not examine | An aggregate `COUNT(*)` beyond the returned rows; v1's "window is full" test | The probe needs no second query and is **exact**. v1 reported "full" at exactly 100 rows even when nothing lay beyond; the probe proves a row lies beyond. Paging with `after_seq` resolves blindness, so the signal means "more to page", never "invisible" |
| D4 | Long-poll substrate | Generalize and **export** `fetch.ts`'s private `waitForRows` as `waitForInboxRows<Row>`; the doorbell imports it along with `effectiveWaitSeconds` | Copy the wait; move it to a new `serve/inbox-wait.ts` | One implementation gives the same race-free subscribe-before-await shape by construction. It stays in `fetch.ts`, so the daemon-bundle timer allowlist is unchanged |
| D5 | Sender and addressee gate | Sender: `reverseRosterLookup(roster_snapshot, row.from_user_id) === row.from_agent_id && !== agent_id`, with admission's function **exported** and called, not copied. Relevance: `via === "direct" \|\| type === "BROADCAST" \|\| stored to === agent_id`, which is v1 `peek.ts:79-85` over the `to` admission already translated | Re-implementing the lookup; counting every row, as fetch's `log` does | Copying by import is the strongest form of ADR-0025's "copy the expression". The serve-time roster re-check also drops rows whose sender left the roster after admission. v1's relevance rule is carried unchanged |
| D6 | Handshake reuse without spawn | A move-only split: `client/run-file.ts` takes `resolveClientHomeDir`, `isProcessAlive`, `readRunFile` and `DaemonRunPayload` out of `run-state.ts`, which re-exports them. `client/session-exchange.ts` takes the HMAC helpers, `HandshakeError`/codes, identity and session requests, plus a new `exchangeSession(runPayload, identity, opts)` covering `performHandshake` steps 2-4. `performHandshake` becomes `ensureDaemonRunning` followed by `exchangeSession`, and `handshake.ts` re-exports the moved names | Import `handshake.ts` as-is (spec violation: spawn in the closure); reimplement the handshake in `channel/` (duplicate credential code) | There is still exactly one implementation of the `GET /identity` → `POST /session` exchange. Existing handshake, run-state and ipc-stub tests pass unchanged, and existing importers compile unchanged |
| D7 | Daemon lifecycle | The adapter **never spawns** the daemon and **never keeps it alive**. It reads the run file (no spawn) and retries on `CHANNEL_RETRY_BACKOFF_SECONDS`. The doorbell read stamps no `last_seen_at`, so a quiet armed adapter does not defer `IDLE_SHUTDOWN_HOURS` | Spawn on start like the thin client | Spawn is `child_process`, which the spec bans. A doorbell that starts or pins a Telegram poller is autonomy creep. The thin client's fetch cadence remains the backstop, as INSTRUCTIONS say |
| D8 | Commit semantics | `commitClientCursor`: `UPDATE … SET inbox_seq = MAX(inbox_seq, ?), last_seen_at = ?`. The route runs `ensureClientCursor` first and refuses `commit_seq > MAX(updates.seq)` for the project (`CURSOR_COMMIT_OUT_OF_RANGE`, 400) | Reuse `advanceClientCursor`, which is unconditional | Monotone and idempotent in one statement. The range check stops a caller from committing past the tail and silently hiding future rows. Ensure-on-commit survives a retention sweep of a quiet session's row |
| D9 | Adapter layout and build | Top-level `channel/` gets its own composite `tsconfig.json` (`rootDir ".."`, `outDir "../dist"`, references `../src/shared` and `../src/client`) and emits to `dist/channel/*.js`. It is added to the root `tsconfig.json` references. `package.json` gets `bin.conmuta-channel = "dist/channel/main.js"` and `files += "dist/channel/**"` | Emit under `dist/src/`; bundle with a bundler | This mirrors v1's `channel/` and the existing per-project `tsc -b` mechanism (`src/cli/tsconfig.json`). `rootDir ".."` keeps `../src/client/binding.js` resolvable from `dist/channel/` |
| D10 | `MAX_ACTIVE_SESSIONS` | **No value change.** Its doc comment gains the F4 cost, and the adapter issues `DELETE /session` on shutdown | Raise to 128 | See "Session budget" below |
| D11 | Tick when nothing is relevant | `count === 0` advances the **in-memory** watermark to `covered_through_seq` with no `deliver` and no commit. A saturated page is re-read immediately. The next successful ring's commit covers the skipped range (monotone) | Commit on silent ticks | Honors the spec literally: commit happens only after `deliver` resolves. It never stalls behind irrelevant rows, which was v1's `observedThrough` lesson |
| D12 | Commit fails after a delivered ring | Warn, but advance the in-memory watermark anyway | Hold the watermark, which re-rings | The announcement was delivered, so re-ringing would be a duplicate. The persisted row catches up on the next monotone commit |

**Session budget (D10).** Sessions never self-expire. A slot is freed only by `DELETE /session` or by
a daemon restart (`constants.ts:307-317`, `sessions.ts:122`), and the thin client never sends
`DELETE`. Arming the adapter makes a Claude Code session cost 2 slots instead of 1. The planning
figures below are an **assumption, not a measurement**:

- ≤10 bound projects per machine and ≤3 concurrent host sessions each gives ≤30 thin-client slots.
- Adapters apply only to Claude Code sessions, adding ≤10 slots, for ≤40 of 64.
- Graceful adapter exits release their slot. Only an ungraceful kill leaks one, the same leak a thin
  client already has on every restart.
- Idle shutdown resets the store.

64 therefore holds. The residual risk is the existing thin-client leak, not F4.

## Data Flow

    adapter start: resolveProjectBinding(--project) -> readRunFile (no spawn; backoff until present)
      -> exchangeSession (GET /identity -> POST /session, host="claude-code-channel")
      -> POST /channel/cursor {}  -> watermark = inbox_seq      (ensure; catch-up seq on a new row)
    loop while !signal.aborted:
      POST /channel/doorbell {after_seq: watermark, timeout_s: FETCH_LONGPOLL_MAX_SECONDS}
        daemon: auth + freeze check -> SELECT seq,envelope_json,via,from_agent_id,from_user_id
                FROM updates WHERE project_id=? AND seq>? ORDER BY seq ASC LIMIT depth+1   (never `body`)
                empty && wait>0 -> waitForInboxRows (subscribe before first await) -> re-read
                gate (D5) -> {count,senders,types,threads,covered_through_seq,saturated}   (writes nothing)
      count==0 -> watermark = max(watermark, covered_through_seq); continue (no sleep)
      n = buildNotification(summary); try await deliver(n) catch -> warn; sleep backoff; continue
      POST /channel/cursor {commit_seq: covered_through_seq} (failure -> warn only, D12)
      watermark = max(watermark, covered_through_seq)
      transport/401/409/mint-refused -> 401: re-handshake once; else warn + sleep backoff
    shutdown (stdio close | SIGINT | SIGTERM): abort in-flight poll -> DELETE /session (bounded) -> exit

## File Changes

| File (+ `test/` twin) | Action | Description |
|---|---|---|
| `src/shared/ipc-contract.ts` | Modify | 2 routes, 4 schemas, table entries, and doc "eight" → "ten" |
| `src/shared/constants.ts` | Modify | `DOORBELL_SCAN_DEPTH`, `CHANNEL_SERVER_NAME`, `CHANNEL_HOST_LABEL`, `CHANNEL_RETRY_BACKOFF_SECONDS`, `CHANNEL_META_LIST_LIMIT`, `CHANNEL_SHUTDOWN_TIMEOUT_MS`; `MAX_ACTIVE_SESSIONS` doc |
| `src/shared/envelope.ts` | Modify | Export `ENVELOPE_TYPES` (`as const`), which `baseEnvelopeSchema` and the doorbell schema both use |
| `src/daemon/serve/doorbell.ts` | Create | `serveDoorbell`: read-only summary |
| `src/daemon/serve/fetch.ts` | Modify | Export `waitForInboxRows<Row>` (generalized `waitForRows`); no behavior change |
| `src/daemon/admission.ts` | Modify | `export` on `reverseRosterLookup` only |
| `src/daemon/ipc/routes.ts` | Modify | Two handlers in `createSessionRoutes`, both behind `authenticateSessionForTool` |
| `src/ledger/cursors.ts` | Modify | `commitClientCursor` (monotone), `readMaxInboxSeq` |
| `src/client/run-file.ts` | Create (move) | Run-file read and home resolution out of `run-state.ts`; no spawn |
| `src/client/session-exchange.ts` | Create (move) | Spawn-free handshake core plus `exchangeSession` |
| `src/client/run-state.ts`, `handshake.ts` | Modify | Import and re-export the moved names; `performHandshake` = ensure + `exchangeSession` |
| `channel/main.ts` | Create | Bin entry: shebang, `--project`, low-level MCP `Server` with the capability and INSTRUCTIONS, stdio connect, shutdown |
| `channel/daemon-link.ts` | Create | Session cache, route calls parsed by strict schemas, 401 re-handshake once, `DELETE` on close |
| `channel/doorbell-loop.ts` | Create | `DoorbellWatcher.tick()` and the paced `run(signal)` loop; the only timer file |
| `channel/notify.ts` | Create | `buildNotification(summary)`, `CHANNEL_INSTRUCTIONS` |
| `channel/tsconfig.json`, root `tsconfig.json`, `package.json` | Create/Modify | D9 |
| `test/security/channel-bundle.test.ts` | Create | Adapter closure test |
| `test/security/pack.test.ts`, `client-bundle.test.ts`, `test/shared/ipc-contract.test.ts` | Modify | Whitelist `+ dist/channel/**`; fs allowlist `+ client/run-file.js`; route count 8 → 10 |
| `docs/runbooks/channel-doorbell.md` | Create | Manual configuration, worded as best-effort |
| `docs/07-plan/WORK-PLAN.md` :93, `DATA-MODEL.md` §3.5, ADR-0024/0025 notes | Modify (later phase) | Amendment text below; the `claude-code-channel` host label |

`channel/*.ts` twins live at `test/channel/*.test.ts`. The existing modified-module twins gain cases;
none are rewritten.

## Interfaces / Contracts

```ts
// shared/constants.ts
/** Rows one doorbell scan examines. Equal to MAX_BATCH so a doorbell read never does more work than one
 *  fetch batch; the value changes only how many pages a backlog takes, never coverage (after_seq paging). */
export const DOORBELL_SCAN_DEPTH = MAX_BATCH;
export const CHANNEL_SERVER_NAME = `${PRODUCT_NAME}-channel`;          // also the bin name
/** DATA-MODEL §3.5 host label; <= IPC_SESSION_HOST_MAX_CHARS (pinned). */
export const CHANNEL_HOST_LABEL = "claude-code-channel";
/** Adapter pause after any failed tick; equals POLL_ERROR_BACKOFF_SECONDS — the daemon's own transient-fault pacing. */
export const CHANNEL_RETRY_BACKOFF_SECONDS = POLL_ERROR_BACKOFF_SECONDS;
/** Distinct values one meta list names (v1 notify.ts:10); `count` always carries the true total. */
export const CHANNEL_META_LIST_LIMIT = 4;
/** Bound on the shutdown DELETE /session: one local round trip, = REQUEST_OVERHEAD_SECONDS. */
export const CHANNEL_SHUTDOWN_TIMEOUT_MS = REQUEST_OVERHEAD_SECONDS * 1000;

// shared/ipc-contract.ts  (IPC_ROUTES += "POST /channel/doorbell", "POST /channel/cursor")
export const doorbellRequestSchema = z.strictObject({
  after_seq: z.number().int().nonnegative(),
  timeout_s: z.number().int().nonnegative().optional(),   // clamped by effectiveWaitSeconds
});
export const doorbellResponseSchema = z.strictObject({
  count: z.number().int().nonnegative().max(DOORBELL_SCAN_DEPTH),
  senders: z.array(z.string().regex(AGENT_ID_PATTERN)).max(DOORBELL_SCAN_DEPTH),
  types: z.array(z.enum(ENVELOPE_TYPES)),
  threads: z.array(z.string().regex(THREAD_PATTERN)).max(DOORBELL_SCAN_DEPTH),
  covered_through_seq: z.number().int().nonnegative(),
  saturated: z.boolean(),
}).refine((r) => r.count > 0 || (r.senders.length + r.types.length + r.threads.length === 0));
export const channelCursorRequestSchema = z.strictObject({
  commit_seq: z.number().int().nonnegative().optional(),  // absent = ensure + read
});
export const channelCursorResponseSchema = z.strictObject({ inbox_seq: z.number().int().nonnegative() });

// daemon/serve/doorbell.ts
interface DoorbellServeBinding { project_id: string; agent_id: string; roster_snapshot: readonly ProjectRosterEntry[] }
interface ServeDoorbellDeps { db; binding: DoorbellServeBinding; emitter?; delay?; }
function serveDoorbell(input: DoorbellRequest, deps: ServeDoorbellDeps): Promise<DoorbellResponse>;
// covered_through_seq = seq of the last EXAMINED row (never the probe row), or after_seq when none.
// senders/types/threads: unique, sorted. saturated = rows.length > DOORBELL_SCAN_DEPTH.

// ledger/cursors.ts
function commitClientCursor(db, client_id: string, seq: number, last_seen_at: string): number; // returns stored inbox_seq; throws CLIENT_CURSOR_UNKNOWN_MESSAGE on 0 changes
function readMaxInboxSeq(db, project_id: string): number;   // COALESCE(MAX(seq),0)

// client/session-exchange.ts
function exchangeSession(run: DaemonRunPayload, id: SessionIdentity,
  opts?: { homeDir?: string; fetchImpl?: typeof fetch }): Promise<SessionResponse>;

// channel/notify.ts — meta keys ⊆ {count, senders, types, threads, saturated}; all match /^[a-z_]+$/.
// `saturated` present only as "true". Values pass v1's sanitizeMetaValue. Content line is a template
// over the count, PRODUCT_NAME and `${TOOL_PREFIX}fetch` only.
function buildNotification(s: DoorbellResponse): { content: string; meta: Record<string, string> } | null;

// channel/doorbell-loop.ts
interface DoorbellWatcherDeps { link: DaemonLink; deliver: (n) => Promise<void>;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>; warn?: (m: string) => void }
class DoorbellWatcher { tick(): Promise<"rang" | "silent" | "deliver_failed" | "link_failed">;
  run(signal: AbortSignal): Promise<void> }   // while (!signal.aborted) — never for(;;)
```

**Capabilities.** The MCP `Server` gets
`{ capabilities: { experimental: { "claude/channel": {} } }, instructions }`, and the `permission`
key is never written. The server name is `CHANNEL_SERVER_NAME` and its version is `SERVER_VERSION`.

**WORK-PLAN :93 amendment text** (a later phase applies it):

> *`saturated` marks a doorbell scan that stopped at `DOORBELL_SCAN_DEPTH` with rows still beyond
> it; the adapter pages past it with an advancing `after_seq`, so no row stays hidden and blindness
> is resolved rather than announced.*

## Testing Strategy

| Spec scenario / design guarantee | Test file |
|---|---|
| Table and both schema maps gain matching entries (8 → 10); the response rejects extra keys | `test/shared/ipc-contract.test.ts` |
| Same `after_seq` twice gives the same summary; closed fields only; `client_cursors` and `client_surfaced` byte-identical after a read with or without rows | `test/daemon/serve/doorbell.test.ts` |
| Subscribes before the first await (a synchronous emit right after the empty read is seen); wait clamped to `FETCH_LONGPOLL_MAX_SECONDS` | `doorbell.test.ts` (fake emitter and `delay`, the `fetch.test.ts` pattern) |
| A backlog of `2×DEPTH+1` rows is fully covered by paging; exactly `DEPTH` rows gives `saturated:false`, `DEPTH+1` gives `true` | `doorbell.test.ts` |
| A non-roster `from_user_id` row and an own-agent row never count; a group row `to` another agent is not relevant but still advances `covered_through_seq` | `doorbell.test.ts` |
| A seeded sentinel `updates.body` never appears in the response JSON; `doorbell.ts` SQL names no `body` column; it imports no `ledger/{cursors,transaction,audit}` | `doorbell.test.ts` (runtime and source-grep) |
| Commit is monotone (a lower seq is a no-op), idempotent, and refuses a seq past the tail; ensure-then-commit | `test/ledger/cursors.test.ts`, `test/daemon/ipc/routes.test.ts` |
| Resolve → commit → advance; a rejected `deliver` leaves the persisted cursor and the watermark unmoved and the next tick re-rings; a failed deliver sleeps a backoff (no tight loop); a failed commit after delivery still advances in memory (D12); `count 0` advances in memory with no commit | `test/channel/doorbell-loop.test.ts` |
| Handshake is `GET /identity` then `POST /session` with `host=CHANNEL_HOST_LABEL`; 401 re-handshakes once; `DELETE /session` on close; no run file means no spawn and backoff | `test/channel/daemon-link.test.ts` |
| `claude/channel/permission` is absent as a key; `claude/channel` present | `test/channel/main.test.ts` |
| Meta keys ⊆ the closed set and plain identifiers; no peer body in any param | `test/channel/notify.test.ts` |
| Closure: no `daemon/` path at all, no `child_process`, `node:sqlite`, Telegram URL or keyring; fs confined to `{client/binding.js, client/run-file.js}`; timers confined to `channel/doorbell-loop.js` (a passing pacing timer); non-vacuous floor and seeded negatives | `test/security/channel-bundle.test.ts` (paths relative to `dist/`, not `DIST_SRC_DIR`) |
| Two `bin` entries, adapter source outside `src/`; `SERVER_VERSION` unchanged | `channel-bundle.test.ts`; existing `test/shared/version.test.ts` |
| Move-only split preserves behavior | Existing `handshake`, `run-state` and `ipc-stub` tests, unchanged |
| Docs best-effort; WORK-PLAN :93 amended | Structural readback in verify and archive |

Nothing asserts that Claude Code received an event. `channel/*.ts` must not contain the literal
string `child_process`, even in comments, because the predicate is a substring match.

## Threat Matrix

| Boundary | Threat | Control |
|---|---|---|
| Channel → model context | Peer prose injected through `<channel>` outside the untrusted-input fence | `body` is never selected; the response schema is strict and closed; meta keys are closed and values sanitized; content is template-only |
| Adapter process | Exec or sending from the doorbell | The closure test finds no `child_process`, no `daemon/*` and no Telegram code; no spawn (D7) |
| Session store | Slot exhaustion | `DELETE` on shutdown; backoff on `SESSION_MINT_REFUSED`; D10 budget |
| Cursor route | A caller hides its own future rows | Monotone; refuses past the tail; session-scoped row only |
| Permission relay | Channel approves tool use | The `permission` key is omitted, never `false` |

## Migration / Rollout

No ledger migration: the adapter row reuses `client_cursors` with a new `host` value. The change is
additive (two routes, a second bin). Rollback reverts the PR(s). Hosts opt in manually by following
`docs/runbooks/channel-doorbell.md`. Any Claude Code flags that runbook cites must be checked against
the current channels documentation at apply time, not stated from memory.

## Open Questions

Contradictions reported, not resolved silently (for the Director and Alpha):

1. **The spec miscounts the route table.** The spec's "nine routes today, ending in `POST /doctor`"
   is contradicted by `ipc-contract.ts:92-104` (eight). The proposal's "eight" is right. The design
   uses 8 → 10; a spec-text correction is recommended.
2. **The spec's closed set omits the saturation signal.** The scenario "rejects fields outside
   {count, senders, types, thread ids, highest seq covered}" conflicts with the requirement that the
   response carry a saturation signal. The design adds `saturated` as the sixth closed field.
3. **The fs ban conflicts with the walk-up reuse.** The bundle-closure requirement's "no `fs`
   outside the daemon home" conflicts with Resolved decision 4, because `client/binding.js` must read
   `conmuta.json` in the project tree. The design confines `fs` to two named files, which is the
   `client-bundle.test.ts` precedent, and discloses `binding.js` as the one project-tree reader.

## Corrections found during apply (session 52)

Written corrections, Alpha-audited, none silent. The decisions above stand except where stated.

1. **D5's relevance source (PR-03, `bus-v2-f4-pr03-diff-audit-001`).** D5 says the relevance rule is
   "the fetch path's expression". `src/daemon/serve/fetch.ts` has no such expression: `serveFetch`
   returns every row that is neither `rejected` nor `ignored`, and puts those two in `rejected[]` and
   `unapplied[]`. The rule D5 spells out (`via === "direct" || type === "BROADCAST" || stored to ===
   agent_id`, v1 `peek.ts:79-85`) was therefore implemented once, as `isRelevant` in
   `src/daemon/serve/doorbell.ts`. The sender half of D5 is unchanged: it calls the exported
   `reverseRosterLookup`. The scan does not filter on `apply_outcome`, on purpose: a `rejected` or
   `ignored` row from a verified roster sender rings the doorbell because fetch surfaces exactly those
   rows.
2. **D6's `exchangeSession` wording (PR-02, `bus-v2-f4-apply-pr02-001`).** `tasks.md` 2.4 says
   `exchangeSession` takes "an already-fetched identity". The implemented signature is the one in
   Interfaces/Contracts: `exchangeSession(run: DaemonRunPayload, id: SessionIdentity, opts?)`. It performs
   `GET /identity` (with the one-re-read retry and the `SERVER_VERSION` check) and then `POST /session`;
   `id` is the session identity to register, not a fetched identity response.
3. **D8's ordering (PR-04, `bus-v2-f4-pr04-diff-audit-001`).** "`ensureClientCursor` first" governs the
   range check. The route validates the request body before it ensures the row, so a malformed body
   creates no row and answers `400 IPC_BAD_REQUEST`. `CURSOR_COMMIT_OUT_OF_RANGE` is an exported
   constant local to `daemon/ipc/routes.ts`, not part of `IPC_TRANSPORT_ERROR_CODES`. The adapter treats a
   commit failure as warn-only (D12) and never branches on the code.
4. **D9's build layout and the PR-05 seam (`bus-v2-f4-apply-pr05-001`).** The layout stands: `channel/`
   emits to `dist/channel/*.js` while `src/` emits to `dist/src/*`. Two corrections to the plan around
   it: (a) the file-changes table lists `test/security/pack.test.ts` as Modify, but `tasks.md`'s PR-05
   scope omitted it and PR-06's tasks 6.3/6.4 assigned it to PR-06, although that test asserts the
   exact `files` whitelist, so `npm test` would be red between `package.json`'s change and PR-06; it
   now rides with `package.json` in slice 05d, and PR-06's tasks 6.5/6.6 are already satisfied by
   PR-02; (b) the 05a/05b seam suggested in `tasks.md` could not compile, so
   PR-05 is four dependency-ordered slices (`tasks.md`, PR-05 block).
5. **The adapter's session host (PR-04/PR-05).** The cursor row stores whatever `host` the session sent.
   The adapter sends `CHANNEL_HOST_LABEL` (`claude-code-channel`), which `sessionRequestSchema` accepts
   because `host` is a free string of at most `IPC_SESSION_HOST_MAX_CHARS`. No daemon change.
6. **`sanitizeMetaValue` provenance (PR-05a).** D-level text says "v1's `sanitizeMetaValue`". It exists
   only in v1; it was ported to `channel/notify.ts` with a provenance comment
   (`telegram-agent-bus/channel/notify.ts:25`, regex unchanged). `CHANNEL_META_LIST_LIMIT` is the port of
   v1's `META_LIST_LIMIT` (`:34`) and now caps the `senders` and `threads` meta lists.
