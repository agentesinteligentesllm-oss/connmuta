# Tasks: F4 — Claude Code channels adapter (a daemon-fed doorbell)

| Field | Value |
|---|---|
| Change | `f4-claude-channels-adapter` |
| Inputs | `proposal.md` (Resolved decisions 1-5, CONSENSUS debate `bus-v2-f4-explore-open-questions-001`; Risks row Alpha-confirmed `bus-v2-f4-proposal-audit-001`); `specs/channel-doorbell/spec.md` (13 requirements, 22 scenarios; harmonized twice against an Alpha design audit — route-table count corrected to eight, and `saturated` added to the closed response-field set); `design.md` (Architecture Decisions D1-D12, File Changes table, Interfaces/Contracts) |
| Delivery strategy | `auto-chain`, cached from this session's SDD preflight |
| Chain strategy | `stacked-to-main`, following F1/F2/F3/F5's own established convention. Each PR targets `main` in sequence; `Depends:` on a slice header names ordering, not a git branch parent |
| TDD rule | Strict TDD. Red before green. Every `src/**/*.ts` file has a `test/**/<same>.test.ts` twin (`test/twins.test.ts` enforces this for `src/`). RED tasks precede the GREEN task that creates the file they test |
| PR budget | 400 authored changed lines (additions + deletions) per PR |
| Shared-file rule | `src/daemon/ipc/routes.ts` is an already-merged, multi-purpose file touched by two PRs (PR-03, PR-04). This is intentional: each PR's diff is scoped to exactly its own new route entry in `createSessionRoutes`'s returned map, never touching the sibling entry — mirroring F1's own incremental route-addition precedent |
| Rollback (default, all PRs) | Revert the PR (`git revert`). No file this change touches has a migration; the adapter's ledger row reuses the existing `client_cursors` table with a new `host` value (design "Migration / Rollout") |
| Verify (base commands) | Build: `npm run build`. Full suite: `npm test`. Static suite: `npm run test:static`. Focused: `node --test "dist/test/<glob>"` after build — glob named per PR below |
| Documentation per PR | PR-07 owns the manual-configuration runbook and the `WORK-PLAN.md:93` amendment. No other PR is required to touch `docs/` |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ≈2,470 authored lines across 7 PRs (rough; expect 20-40% growth per F1/F2/F3's own repeated estimate-to-actual lesson). PR-01 ≈220, PR-02 ≈420, PR-03 ≈480, PR-04 ≈200, PR-05 ≈750, PR-06 ≈280, PR-07 ≈120 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 7 PR slices, PR-01 → PR-07 |
| Delivery strategy | `auto-chain` |
| Chain strategy | `stacked-to-main` |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

No `size:exception` is pre-declared. Three individual slices are estimated at or above the 400-line
budget even after this 7-way split — PR-02 (a full move-only extraction duplicates test coverage
into two new files before the old ones stop defining anything), PR-03 (the richest single scenario
count of any slice — 12 doorbell scenarios in one file), and PR-05 (four new adapter source files
plus four new test files plus package/tsconfig wiring, the largest single unit of new capability in
this change). If a real measured diff for any of these three exceeds 400 lines at apply time,
re-slice it along its own internal seams — e.g. PR-05 into 05a (`daemon-link.ts` + `main.ts`, the
transport/protocol layer) and 05b (`doorbell-loop.ts` + `notify.ts`, the tick/notification layer) —
mirroring F3's own PR-04a/04b/04c re-slicing precedent (`archive/2026-09-27-f3-web-panel-and-observability/tasks.md`)
rather than accepting a `size:exception` by default.

**Scope gap, resolved by Alpha's audit (`bus-v2-f4-tasks-audit-001`).** Design's own File Changes
table lists `docs/07-plan/WORK-PLAN.md :93, DATA-MODEL.md §3.5, ADR-0024/0025 notes` in one row, all
marked "Modify (later phase)". Only the `WORK-PLAN.md:93` amendment was named by a spec requirement
and scenario; `DATA-MODEL.md §3.5` and the `ADR-0024/0025` status notes were not. Flagged here rather
than silently dropped or silently expanded, per AGENTS.md §2's "report the contradiction" rule —
Alpha's audit confirmed these belong to this change (AGENTS.md §3's "documentation is updated during
the task, not afterwards"), so tasks 7.3 and 7.4 now cover them.

**Scope gap, resolved by Alpha's audit (`bus-v2-f4-tasks-audit-001`).** `test/twins.test.ts` walks
only `src/**/*.ts`; it did not check the new top-level `channel/` directory for a
`test/channel/<same>.test.ts` twin. Design's own Testing Strategy table lists twin test files for
every new `channel/*.ts` module, and PR-05 follows that RED-before-GREEN twin discipline manually,
but the automated gate would not have caught a future regression in `channel/`. Alpha confirmed this
needs a real task per ADR-12 — tasks 6.7 and 6.8 now extend `test/twins.test.ts` to also walk
`channel/`.

### Suggested Work Units

Each `#### PR-XX` block states its own Branch/Depends/Scope/Requirements/Runtime-harness line and
closes with a `Verify:` task naming the focused test command; rollback is the uniform one stated
above (revert the PR).

| Unit | Goal | Depends on |
|---|---|---|
| PR-01 | Shared schema, constants, and `ENVELOPE_TYPES` export — no behavior change | none |
| PR-02 | Move-only client refactor (`run-file.ts`, `session-exchange.ts`) — standalone | none (parallel to PR-01) |
| PR-03 | Daemon-side doorbell route | PR-01 |
| PR-04 | Daemon-side cursor-commit route | PR-01, PR-03 (sequencing only — both touch `routes.ts`) |
| PR-05 | Adapter package (`channel/*.ts`, `package.json`, `tsconfig.json`) | PR-01, PR-02, PR-03, PR-04 |
| PR-06 | Adapter bundle-closure test + bundle allowlist updates | PR-05 |
| PR-07 | Docs: manual-configuration runbook + `WORK-PLAN.md:93` amendment | PR-05 |

## PR Slices

### Unit 1 — Shared schema, constants, and envelope export

#### PR-01 — `shared/ipc-contract.ts`, `shared/constants.ts`, `shared/envelope.ts`
Branch `f4/01-shared-schema-constants` → `main`. Depends: none. Size: ≈220 lines (est.).
Scope: `src/shared/ipc-contract.ts`, `src/shared/constants.ts`, `src/shared/envelope.ts`,
`test/shared/ipc-contract.test.ts`, `test/shared/constants.test.ts`, `test/shared/envelope.test.ts`
(all three test files extended, not created).
Requirements: spec "New doorbell IPC route joins the fixed route table with an explicit `after_seq`
input" (both scenarios); spec "Doorbell response is a closed-key-set summary, not a fetch shape"
(schema-level only — no live route dispatch yet; PR-03/04 wire the handlers); design D3
(`DOORBELL_SCAN_DEPTH`), D9 (`CHANNEL_SERVER_NAME`), D10 (`MAX_ACTIVE_SESSIONS` doc comment, no value
change).
Runtime harness: N/A — pure schema/constant modules, no daemon boot required. Confirmed by reading
`src/daemon/ipc/routes.ts:636`: `createSessionRoutes` returns `Partial<Record<IpcRouteKey, IpcHandler>>`,
so a route declared in `IPC_ROUTES`/`IPC_REQUEST_SCHEMAS`/`IPC_RESPONSE_SCHEMAS` with no handler yet
404s exactly like any unbound path — this PR changes no runtime behavior.

- [ ] 1.1 RED `test/shared/envelope.test.ts`: extend — `ENVELOPE_TYPES` is exported `as const` and its
      values match exactly what `baseEnvelopeSchema`'s existing type validator accepts.
- [ ] 1.2 GREEN `src/shared/envelope.ts`: export `ENVELOPE_TYPES`; refactor `baseEnvelopeSchema`'s type
      validator to build from it. No behavior change — same accepted values before and after.
- [ ] 1.3 RED `test/shared/constants.test.ts`: extend — `DOORBELL_SCAN_DEPTH === MAX_BATCH`;
      `CHANNEL_SERVER_NAME === \`${PRODUCT_NAME}-channel\``; `CHANNEL_HOST_LABEL === "claude-code-channel"`
      and its length is `<= IPC_SESSION_HOST_MAX_CHARS`; `CHANNEL_RETRY_BACKOFF_SECONDS ===
      POLL_ERROR_BACKOFF_SECONDS`; `CHANNEL_META_LIST_LIMIT === 4`; `CHANNEL_SHUTDOWN_TIMEOUT_MS ===
      REQUEST_OVERHEAD_SECONDS * 1000`.
- [ ] 1.4 GREEN `src/shared/constants.ts`: add the six named constants above (design's
      Interfaces/Contracts `shared/constants.ts` block, verbatim); update `MAX_ACTIVE_SESSIONS`'s doc
      comment to cite the F4 session cost (D10) — no value change.
- [ ] 1.5 RED `test/shared/ipc-contract.test.ts`: extend — the route-count assertion moves from eight
      to ten; `doorbellRequestSchema`/`doorbellResponseSchema`/`channelCursorRequestSchema`/
      `channelCursorResponseSchema` each round-trip a valid payload and reject a payload carrying any
      key outside their own closed set (spec's "Response schema rejects fields outside the closed set"
      scenario, at the schema level); `IPC_REQUEST_SCHEMAS` and `IPC_RESPONSE_SCHEMAS` each gain
      matching `"POST /channel/doorbell"` and `"POST /channel/cursor"` entries.
- [ ] 1.6 GREEN `src/shared/ipc-contract.ts`: add `"POST /channel/doorbell"` and `"POST
      /channel/cursor"` to `IPC_ROUTES`; add `doorbellRequestSchema`, `doorbellResponseSchema`,
      `channelCursorRequestSchema`, `channelCursorResponseSchema` (design's Interfaces/Contracts
      `shared/ipc-contract.ts` block, verbatim, including the `.refine()` count/senders/types/threads
      co-emptiness rule); wire both routes into `IPC_REQUEST_SCHEMAS`/`IPC_RESPONSE_SCHEMAS`; update
      the module's own doc comment from "eight" to "ten".
- [ ] 1.7 Verify: `npm run build && node --test "dist/test/shared/ipc-contract.test.js"
      "dist/test/shared/constants.test.js" "dist/test/shared/envelope.test.js"`.

### Unit 2 — Move-only client refactor

#### PR-02 — `client/run-file.ts`, `client/session-exchange.ts`
Branch `f4/02-client-move-only-split` → `main`. Depends: none (parallel to PR-01). Size: ≈420 lines
(est.).
Scope: `src/client/run-file.ts` (create, move), `src/client/session-exchange.ts` (create, move),
`src/client/run-state.ts` (modify: re-export), `src/client/handshake.ts` (modify: re-export,
recompose `performHandshake`), `test/client/run-file.test.ts` (create), `test/client/session-exchange.test.ts`
(create), `test/client/run-state.test.ts`, `test/client/handshake.test.ts`, `test/client/ipc-stub.test.ts`
(all three existing, unchanged behavior confirmed, not rewritten).
Requirements: design D6 (move-only split). No spec requirement names this PR directly — it is the
prerequisite that lets PR-05's adapter satisfy spec's "Handshake reuse — no new credential scheme"
without pulling `child_process` into the adapter's closure (spec's "Adapter bundle-closure test"
requirement, enforced in PR-06).
Runtime harness: existing `run-state.test.ts`/`handshake.test.ts` patterns (mocked `fetch`, fake run
file/home dir) — same harness shape, new files.

- [x] 2.1 RED `test/client/run-file.test.ts` (create): pin `resolveClientHomeDir`, `isProcessAlive`,
      `readRunFile`, and the `DaemonRunPayload` type's behavior — copy the assertions currently proving
      these four exports inside `run-state.test.ts`, so the new module is proven correct before
      `run-state.ts` stops defining them.
- [x] 2.2 GREEN `src/client/run-file.ts` (create): move `resolveClientHomeDir`, `isProcessAlive`,
      `readRunFile`, `DaemonRunPayload` out of `run-state.ts` verbatim (logic unchanged, only the file
      location moves).
- [x] 2.3 GREEN `src/client/run-state.ts` (modify): remove the four moved definitions; re-export them
      from `./run-file.js`. Confirm the existing `test/client/run-state.test.ts` assertions for these
      four names still pass unchanged (their import path, `client/run-state.js`, is unaffected by the
      re-export).
- [x] 2.4 RED `test/client/session-exchange.test.ts` (create): pin the HMAC helpers, `HandshakeError`
      and its error codes, the identity/session request functions, and the new
      `exchangeSession(runPayload, identity, opts)` — covering exactly `performHandshake`'s existing
      steps 2-4 (GET /identity already resolved → POST /session), given a run payload and an
      already-fetched identity.
- [x] 2.5 GREEN `src/client/session-exchange.ts` (create): move the HMAC helpers, `HandshakeError`/
      codes, and the identity/session request functions out of `handshake.ts` verbatim; add
      `exchangeSession`.
- [x] 2.6 GREEN `src/client/handshake.ts` (modify): re-export the moved names from
      `./session-exchange.js`; redefine `performHandshake` as `ensureDaemonRunning` (unchanged, stays
      spawn-capable, stays in `handshake.ts`/`run-state.ts`) followed by `exchangeSession`. Confirm the
      existing `test/client/handshake.test.ts` assertions pass unchanged against the recomposed
      function.
- [x] 2.7 Verify: `npm run build && node --test "dist/test/client/run-file.test.js"
      "dist/test/client/session-exchange.test.js" "dist/test/client/run-state.test.js"
      "dist/test/client/handshake.test.js" "dist/test/client/ipc-stub.test.js"` — the last file's
      inclusion pins that `ipc-stub.ts`'s own import path through `handshake.ts` is unaffected by the
      split.

### Unit 3 — Daemon-side doorbell route

#### PR-03 — `daemon/serve/doorbell.ts`
Branch `f4/03-daemon-doorbell-route` → `main`. Depends: PR-01. Size: ≈480 lines (est.).
Scope: `src/daemon/serve/doorbell.ts` (create), `src/daemon/serve/fetch.ts` (modify: export
`waitForInboxRows`), `src/daemon/admission.ts` (modify: export `reverseRosterLookup` only), `src/daemon/ipc/routes.ts`
(modify: wire `POST /channel/doorbell`), `test/daemon/serve/doorbell.test.ts` (create),
`test/daemon/serve/fetch.test.ts` (extend), `test/daemon/admission.test.ts` (extend),
`test/daemon/ipc/routes.test.ts` (extend).
Requirements: spec "Doorbell response is a closed-key-set summary, not a fetch shape" (both
scenarios, now live behind the route); spec "The doorbell read persists nothing"; spec "The
doorbell's bounded wait reuses the existing long-poll substrate" (both scenarios); spec "Repeated
after_seq reads eventually cover a backlog larger than one scan, and a partial scan says so" (both
scenarios); spec "Sender identity gates a row; room membership never does".
Runtime harness: in-memory ledger harness mirroring `test/daemon/serve/fetch.test.ts`'s own pattern;
fake emitter + injectable `delay` for the subscribe-before-await and wait-clamp assertions (D-02
shape).

- [x] 3.1 RED `test/daemon/serve/fetch.test.ts`: extend to assert the newly exported
      `waitForInboxRows<Row>` is the same function `serveFetch` calls internally (no behavior change);
      reuses the file's own subscribe-before-await fixture.
- [x] 3.2 GREEN `src/daemon/serve/fetch.ts`: export the private `waitForRows` as `waitForInboxRows<Row>`,
      generalized over row shape; `serveFetch` calls the exported form. No behavior change.
- [x] 3.3 RED `test/daemon/admission.test.ts`: extend to import `reverseRosterLookup` from its new
      export and assert identical behavior to the function's existing internal call sites (export only,
      no logic change).
- [x] 3.4 GREEN `src/daemon/admission.ts`: add `export` to `reverseRosterLookup`. No other change.
- [x] 3.5 RED `test/daemon/serve/doorbell.test.ts` (create): the same `after_seq` issued twice with no
      intervening commit returns the same summary; the response carries only the closed field set
      (`count`, `senders`, `types`, `threads`, `covered_through_seq`, `saturated`) and nothing else;
      `client_cursors` and `client_surfaced` rows are byte-identical after a read, whether or not it
      found rows; the read subscribes to `inbox:<project_id>` before its first `await` (fake emitter, a
      synchronous emit right after the empty read is seen); the effective wait is clamped to
      `FETCH_LONGPOLL_MAX_SECONDS` regardless of the caller's `timeout_s`; a backlog of
      `2×DOORBELL_SCAN_DEPTH+1` rows is fully covered across repeated calls with an advancing
      `after_seq`; exactly `DOORBELL_SCAN_DEPTH` rows gives `saturated:false`, `DOORBELL_SCAN_DEPTH+1`
      gives `true`; a non-roster `from_user_id` row and an own-agent row never count toward the
      summary; a group row addressed to another agent is not relevant but still advances
      `covered_through_seq`; a seeded sentinel `updates.body` value never appears anywhere in the
      response JSON; the module's own SQL text names no `body` column and the module imports no
      `ledger/{cursors,transaction,audit}`.
- [x] 3.6 GREEN `src/daemon/serve/doorbell.ts` (create): implement `serveDoorbell(input, deps)` per
      design's Interfaces/Contracts section — the `LIMIT DOORBELL_SCAN_DEPTH+1` probe (D3), the D5
      sender/addressee gate copied from `admission.ts`/the fetch path's relevance expression (never
      re-derived), `waitForInboxRows` on an empty scan when `wait > 0`, no ledger write import.
- [x] 3.7 RED `test/daemon/ipc/routes.test.ts`: extend — `POST /channel/doorbell` is wired behind
      `authenticateSessionForTool`, returns a `doorbellResponseSchema`-shaped body for a session bound
      to a project with rows past `after_seq`; an unauthenticated call is refused identically to the
      existing tool routes.
- [x] 3.8 GREEN `src/daemon/ipc/routes.ts`: add the `"POST /channel/doorbell"` entry to
      `createSessionRoutes`'s returned map, calling `serveDoorbell`.
- [x] 3.9 Verify: `npm run build && node --test "dist/test/daemon/serve/doorbell.test.js"
      "dist/test/daemon/serve/fetch.test.js" "dist/test/daemon/admission.test.js"
      "dist/test/daemon/ipc/routes.test.js"`.

### Unit 4 — Daemon-side cursor-commit route

#### PR-04 — `ledger/cursors.ts` commit path
Branch `f4/04-daemon-cursor-commit-route` → `main`. Depends: PR-01, PR-03 (sequencing only — no
functional dependency; both touch `routes.ts`'s `createSessionRoutes` map, so this PR is written
against PR-03's already-landed diff to avoid a stale patch). Size: ≈200 lines (est.).
Scope: `src/ledger/cursors.ts` (modify: `commitClientCursor`, `readMaxInboxSeq`), `src/daemon/ipc/routes.ts`
(modify: wire `POST /channel/cursor`), `test/ledger/cursors.test.ts` (extend), `test/daemon/ipc/routes.test.ts`
(extend).
Requirements: spec "Cursor commit is separate and gated on delivery resolving without throwing" (both
scenarios, at the route/ledger level — the adapter-side gating on `deliver` is PR-05); design D8
(monotone `UPDATE`, `ensureClientCursor` first, refuse a commit past the tail with
`CURSOR_COMMIT_OUT_OF_RANGE`, 400).
Runtime harness: in-memory ledger harness mirroring `test/ledger/cursors.test.ts`'s own pattern;
`test/daemon/ipc/routes.test.ts`'s existing session-route harness for the wiring case.

- [x] 4.1 RED `test/ledger/cursors.test.ts`: extend — `commitClientCursor` is monotone
      (`UPDATE … SET inbox_seq = MAX(inbox_seq, ?)`; a lower `seq` is a no-op); idempotent (repeating
      the same `seq` is a no-op); `readMaxInboxSeq` returns `COALESCE(MAX(seq),0)` for a project with
      and without rows.
- [x] 4.2 GREEN `src/ledger/cursors.ts`: implement `commitClientCursor`'s monotone `UPDATE` and
      `readMaxInboxSeq`.
- [x] 4.3 RED `test/daemon/ipc/routes.test.ts`: extend — `POST /channel/cursor` with no body runs
      `ensureClientCursor` and returns the current `inbox_seq` (D8's "absent = ensure + read"); with
      `commit_seq` at or below `readMaxInboxSeq`'s result, commits and returns the new `inbox_seq`;
      with `commit_seq` above the project's max seq, refuses with `CURSOR_COMMIT_OUT_OF_RANGE` (400),
      and `client_cursors` is unchanged by the refused call.
- [x] 4.4 GREEN `src/daemon/ipc/routes.ts`: add the `"POST /channel/cursor"` entry to
      `createSessionRoutes`'s returned map — `ensureClientCursor` first, the
      `commit_seq > readMaxInboxSeq(...)` range check and refusal, then `commitClientCursor`.
- [x] 4.5 Verify: `npm run build && node --test "dist/test/ledger/cursors.test.js"
      "dist/test/daemon/ipc/routes.test.js"`.

### Unit 5 — Adapter package

#### PR-05 — `channel/*.ts`, `package.json`, `tsconfig.json`
Branch `f4/05-channel-adapter-package` → `main`. Depends: PR-01, PR-02, PR-03, PR-04 (the adapter
calls both live routes and the moved handshake core). Size: ≈750 lines (est.; see the forecast note
above about a possible 05a/05b re-slice).
Scope: `channel/main.ts` (create), `channel/daemon-link.ts` (create), `channel/doorbell-loop.ts`
(create), `channel/notify.ts` (create), `channel/tsconfig.json` (create), root `tsconfig.json`
(modify), `package.json` (modify), `test/channel/main.test.ts` (create), `test/channel/daemon-link.test.ts`
(create), `test/channel/doorbell-loop.test.ts` (create), `test/channel/notify.test.ts` (create).
**Re-slice (session 52, Alpha CONSENSUS `bus-v2-f4-apply-pr05-001`) — supersedes the 05a/05b seam in
the forecast above, which could not compile (`main.ts` imports `notify.ts` and `doorbell-loop.ts`).**
Four dependency-ordered slices, each green on its own, stacked-to-main:
- **05a** `f4/05a-channel-scaffold-notify`: tasks 5.9, 5.10, 5.1, 5.2 (`channel/tsconfig.json`, root
  `tsconfig.json` reference, `notify.ts` + test). Est. ≈250.
- **05b** `f4/05b-channel-daemon-link`: tasks 5.3, 5.4 (`daemon-link.ts` + test). Est. ≈400.
- **05c** `f4/05c-channel-doorbell-loop`: tasks 5.5, 5.6 (`doorbell-loop.ts` + test; imports the
  `DaemonLink` type from 05b and `buildNotification` from 05a). Est. ≈400.
- **05d** `f4/05d-channel-main-bin`: tasks 5.7, 5.8, 5.11 (`main.ts`, `package.json` bin/files, main test)
  **plus `test/security/pack.test.ts`**: `PACKAGE_JSON_WHITELIST` gains `dist/channel/**` and the pack
  dry-run confirms `dist/channel/main.js`. Reason: this scope line omitted the file and PR-06's tasks
  6.3/6.4 assigned it to PR-06, but `pack.test.ts:76` asserts `package.json`'s `files` by exact equality,
  so task 5.11 alone would leave `npm test` red between 05d and PR-06. PR-06's tasks 6.3/6.4 therefore
  become confirmations (see the amendment in PR-06's block).
Task 5.12's verify command runs per slice against that slice's own test files. `sanitizeMetaValue` is
ported from v1 `telegram-agent-bus/channel/notify.ts:25` with a `file:line` provenance comment
(`CHANNEL_META_LIST_LIMIT` is the port of v1's `META_LIST_LIMIT`, `:34`).

Requirements: spec "Handshake reuse — no new credential scheme"; spec "Adapter ships as a second
`bin` entry, outside `src/`, in the same package"; spec "claude/channel/permission is omitted from
the adapter's capability registration"; spec "Notification meta key set is closed, plain-identifier,
and carries no peer body" (both scenarios); design D7 (never spawns, retries on
`CHANNEL_RETRY_BACKOFF_SECONDS`, no `last_seen_at` stamp), D9 (build layout), D11 (silent-tick
watermark advance), D12 (failed-commit-after-delivery still advances).
Runtime harness: a real daemon booted in a temp home (mirrors `test/daemon/bootstrap.test.ts`'s
pattern) for `daemon-link.test.ts`'s live-handshake cases; fake `DaemonLink`/`deliver`/`sleep`
injected deps for `doorbell-loop.test.ts`, mirroring the design's `DoorbellWatcherDeps` shape;
pure-function tests for `notify.test.ts`.

- [x] 5.1 RED `test/channel/notify.test.ts` (create): `meta` keys are a subset of `{count, senders,
      types, threads, saturated}`, every key matches `/^[a-z_]+$/`; `saturated` is present only as the
      string `"true"` (never `"false"`, never absent-as-string when relevant); values pass v1's
      `sanitizeMetaValue`; the content line is a template over `count`, `PRODUCT_NAME`, and
      `${TOOL_PREFIX}fetch` only — no sender/type/thread value appears verbatim in prose, so no peer
      text can leak through; `buildNotification` returns `null` for a non-actionable summary (`count
      === 0`, D11's silent-tick case, which per PR-05's own loop never even calls it). **Amendment
      (session 52, Alpha CONSENSUS `bus-v2-f4-apply-pr03-001`):** the `senders`/`threads` meta lists
      are capped at `CHANNEL_META_LIST_LIMIT` entries (the constant PR-01 introduced and nothing else
      references); assert the cap with `CHANNEL_META_LIST_LIMIT + 1` distinct values. If the cap proves
      redundant with the schema bounds, drop the constant in this PR instead and say so here.
- [x] 5.2 GREEN `channel/notify.ts` (create): implement `buildNotification(summary)` and
      `CHANNEL_INSTRUCTIONS` per design's Interfaces/Contracts section.
- [x] 5.3 RED `test/channel/daemon-link.test.ts` (create): handshake is `GET /identity` then `POST
      /session` with `host = CHANNEL_HOST_LABEL`; a 401 on a route call re-handshakes exactly once and
      retries; a second consecutive 401 surfaces as a failure (no infinite retry loop); `DELETE
      /session` fires on close, bounded by `CHANNEL_SHUTDOWN_TIMEOUT_MS`; no run file present means no
      spawn attempt (the link throws `NO_DAEMON` with zero fetch calls). **Amendment (session 53, Alpha
      CONSENSUS `bus-v2-f4-apply-pr05b-001`):** the backoff half of this clause moved to 05c (task 5.5).
      `channel/doorbell-loop.ts` is the only timer file, so the link owns no sleep; 05b pins that the
      module source has no timer, spawn, loop or fs reference. Merged as PR #100, `2647b06`.
- [x] 5.4 GREEN `channel/daemon-link.ts` (create): implement the session cache, route calls parsed by
      `doorbellResponseSchema`/`channelCursorResponseSchema`, the 401-once re-handshake, `DELETE` on
      close — calling `exchangeSession`/`readRunFile` (PR-02), never `ensureDaemonRunning`.
- [x] 5.5 RED `test/channel/doorbell-loop.test.ts` (create): `tick()` resolve → commit → advance
      sequence returns `"rang"`; a rejected `deliver` leaves the persisted cursor and the in-memory
      watermark unmoved, and the next `tick()` re-issues the same announcement (`"deliver_failed"`); a
      failed `deliver` sleeps `CHANNEL_RETRY_BACKOFF_SECONDS` before the loop's next iteration (no
      tight loop); a failed cursor-commit after a successful `deliver` still advances the in-memory
      watermark (D12, warns only); `count === 0` advances the in-memory watermark to
      `covered_through_seq` with no `deliver` call and no commit call (D11, `"silent"`); a saturated
      page is re-read immediately with no sleep; `run(signal)` uses `while (!signal.aborted)`, never
      `for(;;)`, and returns promptly once the signal aborts mid-wait. **Amendment (session 53, Alpha
      CONSENSUS `bus-v2-f4-apply-pr05b-001`):** a `link_failed` tick (any `DaemonLinkError` other than
      `ABORTED`) also sleeps `CHANNEL_RETRY_BACKOFF_SECONDS`, not only `deliver_failed`; an `ABORTED` error
      after `signal.aborted` neither warns nor sleeps. `DaemonLink` is an interface plus the factory
      `createDaemonLink` in `channel/daemon-link.ts`, so the watcher's test injects a structural fake.
- [x] 5.6 GREEN `channel/doorbell-loop.ts` (create): implement `DoorbellWatcher.tick()` and
      `run(signal)` per design's Data Flow and Interfaces/Contracts sections.
- [x] 5.7 RED `test/channel/main.test.ts` (create): the MCP `Server`'s declared capabilities carry
      `experimental["claude/channel"]` as a present key and `claude/channel/permission` absent as a key
      entirely (never `false`, never any other value); server name is `CHANNEL_SERVER_NAME`, version is
      `SERVER_VERSION`; `--project` resolves the binding via the thin client's own
      `resolveProjectBinding`; shutdown on stdio close / SIGINT / SIGTERM aborts the in-flight poll and
      calls `DELETE /session` before exit. **Amendment (session 53, Alpha CONSENSUS
      `bus-v2-f4-pr05c-diff-audit-001`):** `DaemonLink.commitCursor` takes no signal and a handshake in
      flight does not honour a caller abort, so `main.ts` must NOT await `run(signal)` unboundedly: on
      shutdown it aborts the signal, races `run`'s completion against `CHANNEL_SHUTDOWN_TIMEOUT_MS`, then
      calls `link.close()` and exits; 5.7 pins that a hung `run` does not block the exit.
- [x] 5.8 GREEN `channel/main.ts` (create): implement the bin entry — shebang, `--project` parsing, the
      low-level MCP `Server` construction with the capability object and `CHANNEL_INSTRUCTIONS`, stdio
      connect, `DoorbellWatcher` wiring, shutdown handling.
- [x] 5.9 GREEN `channel/tsconfig.json` (create): composite config per D9 — `rootDir ".."`, `outDir
      "../dist"`, `references` to `../src/shared` and `../src/client`, emits to `dist/channel/*.js`.
- [x] 5.10 GREEN root `tsconfig.json` (modify): add `{ "path": "channel" }` to `references`.
- [x] 5.11 GREEN `package.json` (modify): add `bin.conmuta-channel = "dist/channel/main.js"`; add
      `"dist/channel/**"` to `files`. **Amendment (session 53, found in slice 05d):** the second `bin`
      makes `test/cli/main.test.ts`'s "exactly one bin entry" assertion (D-09) false by design, so it now
      expects `[PRODUCT_NAME, CHANNEL_SERVER_NAME]`, and `npm-shrinkwrap.json`'s root `bin` gains the
      adapter; both landed in 05d (PR #102, `48c8c39`), together with `pack.test.ts`.
- [x] 5.12 Verify: `npm run build && node --test "dist/test/channel/notify.test.js"
      "dist/test/channel/daemon-link.test.js" "dist/test/channel/doorbell-loop.test.js"
      "dist/test/channel/main.test.js"`.

### Unit 6 — Adapter bundle-closure test

#### PR-06 — `test/security/channel-bundle.test.ts`
Branch `f4/06-channel-bundle-closure-test` → `main`. Depends: PR-05. Size: ≈280 lines (est.).
Scope: `test/security/channel-bundle.test.ts` (create), `test/security/pack.test.ts` (modify:
whitelist `+= dist/channel/**`), `test/security/client-bundle.test.ts` (modify: `fs` allowlist `+=
client/run-file.js`), `test/twins.test.ts` (modify: also walk `channel/**/*.ts`).
Requirements: spec "Adapter bundle-closure test bans transport/send/Telegram reachability, not the
paced loop's own timer" (all three scenarios); ADR-12 (a documented guarantee must be pinned by a
test that can fail) — `channel/` is a brand-new top-level directory outside `src/`, and without this
task its own twin-test guarantee is manual discipline only, not an automated gate. Added per Alpha's
audit, `bus-v2-f4-tasks-audit-001`.
**Amendment (session 52, found while re-slicing PR-05; recorded so PR-06 is not written from stale
text):** (1) tasks 6.3/6.4 (`pack.test.ts` whitelist) move to slice 05d, where `package.json`'s `files`
change lands; in PR-06 they are a confirmation only and 6.3 cannot be RED. (2) tasks 6.5/6.6
(`client-bundle.test.ts` `node:fs` allowlist `+= client/run-file.js`) were already done by PR-02
(`d3cb965`: the allowlist and its test title now list `client/binding.js`, `client/run-file.js`,
`client/run-state.js`); 6.5 cannot be RED, so confirm and skip. (3) Real PR-06 work that remains: 6.1/6.2
(`channel-bundle.test.ts`) and 6.7/6.8 (`twins.test.ts` walking `channel/**`, with `notify.ts` and its
twin already present from 05a). Re-estimate PR-06's size after this.
**Amendment (session 53, from slices 05b-05d; PR-05 is merged):** (4) Tasks 6.3/6.4 were done by slice 05d
(`pack.test.ts` whitelist, packed `dist/channel/main.js`, bin pin; PR #102), so they are confirmations.
(5) The closure test's entry is `dist/channel/main.js`. Its real graph is `main` -> `daemon-link`,
`doorbell-loop`, `notify` (all in `dist/channel/`) plus `client/binding.js`, `client/run-file.js`,
`client/session-exchange.js`, `shared/*` and the external MCP SDK. `fs` must resolve to exactly
`{client/binding.js, client/run-file.js}`. (6) `dist/channel/doorbell-loop.js` is the ONLY file allowed a
timer: its own twin already pins `hasAutonomousTimerReference` TRUE, while `main.ts` and `daemon-link.ts`
pin it FALSE, so 6.1's "pacing timer passes" scenario is a real case and not only a seeded fixture.
`AbortSignal.timeout` is not a timer identifier for that predicate. (7) `daemon-link.ts`,
`doorbell-loop.ts` and `main.ts` each already carry a source-pin test (no child-process substring even in
comments, no `node:timers`, no unbounded loop, an import allow-list); PR-06 should generalize over the
whole closure, not duplicate them.
**Amendment (session 54, scope debate `f4-pr06-channel-bundle-scope-001`, `CONSENSUS`, Alpha `APPROVE`,
round 1):** (8) The test's paths are relative to `dist/`, so the `fs` allowlist reads
`{src/client/binding.js, src/client/run-file.js}`; the spec's `{client/binding.js, client/run-file.js}` is the
same pair relative to `dist/src`, and a comment says so. (9) Reachability is judged on closure MEMBERSHIP
(paths), never on a substring of source text: `src/shared/constants.ts:211` and `src/shared/envelope.ts:231,308`
name `daemon/send/validate.ts` in comments, so a text search would false-positive. Forbidden members are paths
under `src/daemon/transport/` or `src/daemon/send/`, and `src/daemon/telegram.js` (the Telegram client;
`daemon-bundle.test.ts:155-159` pins `api.telegram.org` to it). The walk is transitive, so this is complete
without banning the whole `src/daemon/` tree. Content detectors over every closure file (the `api.telegram.org`
URL, `.getUpdates(`, `.sendMessage(`) follow `client-bundle.test.ts:101-122`. (10) Timers: a closed allowlist
`{channel/doorbell-loop.js}` whose own closure excludes transport/send, plus a `node:timers` ban, mirroring
`daemon-bundle.test.ts:170-192`; not "zero timers" (the spec says the test MUST NOT assert that). (11) Seeded
negatives (ADR-12): the assertions are pure helpers over a `Map<relPath, source>`, exercised with synthetic
maps, plus one temp-dir fixture proving the transitive walk catches a violation two hops from the entry.
(12) `twins.test.ts`: the channel twin lives under `test/channel/` (an extra `channel/` segment; `src/` twins
sit directly under `test/`), so the finder becomes a function of `(sourceDir, testDir)` and a temp-dir fixture
proves a missing twin is reported (task 6.7), with a named non-vacuous floor (real count 4). (13) Out of scope,
for the Director as a possible backlog row: `computeClosure` does not follow bare specifiers, so a dependency
that wraps process spawning would evade the `child_process` substring exactly as it does for the client and
daemon bundle tests; Alpha agreed not to widen PR-06 for it. Recon (Kairo, source level): the entry closure is
16 files (`channel/{main,daemon-link,doorbell-loop,notify}`, `src/client/{binding,run-file,session-exchange}`
and nine `src/shared/*` modules); only `doorbell-loop` arms a timer, only the two allowlisted files reference
`fs`, and none references `child_process`.
Runtime harness: static analysis over the compiled `dist/` bundle, mirroring
`daemon-bundle.test.ts`/`client-bundle.test.ts`'s own build-then-scan pattern; reuses
`test/security/predicates.ts`/`closure.ts`'s existing helpers where their shape fits.

- [ ] 6.1 RED `test/security/channel-bundle.test.ts` (create): the adapter's compiled entry module's
      import graph reaches no `daemon/transport/*`, `daemon/send/*`, or Telegram-client module; reaches
      no `child_process`/exec/shell reference, including the literal substring `child_process` even in
      a comment (the predicate is a substring match, per spec's own note); every `fs` reference in the
      closure resolves to exactly `{client/binding.js, client/run-file.js}` and no other file in the
      closure references `fs`; the loop's own pacing timer in `doorbell-loop.js` is a passing case, not
      a violation; a non-vacuous floor (the test fails if the closure is empty) and seeded negative
      fixtures (a deliberately reachable violation is caught).
- [ ] 6.2 GREEN `test/security/channel-bundle.test.ts` (create): implement the assertions against
      `dist/channel/main.js`'s import graph, paths relative to `dist/` (not `DIST_SRC_DIR`), following
      `daemon-bundle.test.ts`/`client-bundle.test.ts`'s own construction.
- [ ] 6.3 RED `test/security/pack.test.ts`: extend the packed-files whitelist assertion to expect
      `dist/channel/**` alongside the existing `dist/src/**`.
- [ ] 6.4 GREEN: confirm PR-05's `package.json` `files` entry (task 5.11) satisfies the extended
      whitelist. No further `src`/`package.json` change expected — this task closes the loop only if
      6.3's RED test reveals a gap.
- [ ] 6.5 RED `test/security/client-bundle.test.ts`: extend the `fs` allowlist assertion to include
      `client/run-file.js` (PR-02's moved `readRunFile`/`resolveClientHomeDir`), confirming the
      existing thin-client closure is otherwise unchanged.
- [ ] 6.6 GREEN `test/security/client-bundle.test.ts`: add `client/run-file.js` to the allowlist
      constant. No `src/` change — the thin client's own closure was already correct after PR-02; this
      task only updates the pinned allowlist.
- [ ] 6.7 RED `test/twins.test.ts`: extend the walk to also cover `channel/**/*.ts` (in addition to
      the existing `src/**/*.ts` walk), asserting every file under `channel/` has a matching
      `test/channel/**/<same>.test.ts` twin. This must fail before 6.8, since PR-05 already created
      `channel/*.ts` and their twins without this gate existing yet — confirm the test is non-vacuous
      by first running it against the pre-PR-05 tree state (or a seeded missing-twin fixture) to prove
      it can fail.
- [ ] 6.8 GREEN `test/twins.test.ts`: implement the `channel/**/*.ts` walk alongside the existing
      `src/**/*.ts` one, reusing the same twin-matching logic. No change to the `src/` walk's own
      behavior.
- [ ] 6.9 Verify: `npm run build && node --test "dist/test/security/channel-bundle.test.js"
      "dist/test/security/pack.test.js" "dist/test/security/client-bundle.test.js"
      "dist/test/shared/version.test.js" "dist/test/twins.test.js"` — the last file pins the
      `channel/` twin-enforcement gate is live; `version.test.js` pins `SERVER_VERSION` unchanged
      (spec's "SERVER_VERSION is unchanged by this change" scenario).

### Unit 7 — Documentation

#### PR-07 — Manual-configuration runbook + `WORK-PLAN.md:93` amendment + doc sync
Branch `f4/07-channel-docs` → `main`. Depends: PR-05 (documents the shipped adapter's real flags and
behavior). Size: ≈120 lines (est.).
Scope: `docs/runbooks/channel-doorbell.md` (create), `docs/07-plan/WORK-PLAN.md` :93 (modify),
`docs/02-architecture/DATA-MODEL.md` §3.5 (modify), `docs/03-adr/0024-channel-doorbell-not-a-second-reader.md`
(modify: append-only status note), `docs/03-adr/0025-peek-saturation-and-watermark-commits-last.md`
(modify: append-only status note).
Requirements: spec "Best-effort documentation and the WORK-PLAN :93 correction are both required
deliverables" (both scenarios). The DATA-MODEL.md and ADR status-note tasks below have no direct spec
requirement — they were flagged by sdd-tasks as a disclosed gap and added per Alpha's audit
(`bus-v2-f4-tasks-audit-001`), per AGENTS.md §3's "documentation is updated during the task, not
afterwards" rule.
Runtime harness: N/A — structural readback, no automated test (design's own Testing Strategy table:
"Docs best-effort; WORK-PLAN :93 amended | Structural readback in verify and archive").

- [ ] 7.1 Write `docs/runbooks/channel-doorbell.md`: manual configuration steps for arming the adapter
      against a bound project, worded as best-effort with no delivery guarantee, no acknowledgement,
      and no reliability claim beyond that (matching the platform's own documented contract, ADR-0024
      row 7). Any Claude Code flags cited must be checked against the current channels documentation at
      apply time, not stated from memory (design's Migration/Rollout note).
- [ ] 7.2 Apply design.md's "WORK-PLAN :93 amendment text" (already written verbatim there) to
      `docs/07-plan/WORK-PLAN.md`'s Validation row at line 93 — copy it exactly, do not redraft it.
- [ ] 7.3 Update `docs/02-architecture/DATA-MODEL.md` §3.5's `client_cursors.host` documentation to
      add `claude-code-channel` alongside the existing `claude-code`/`cursor`/`opencode` examples,
      citing this change.
- [ ] 7.4 Append a resolution note to `docs/03-adr/0024-channel-doorbell-not-a-second-reader.md`'s
      Status field and "Relevance to Conmuta" section, and to
      `docs/03-adr/0025-peek-saturation-and-watermark-commits-last.md`'s equivalent, recording that
      F4 (`f4-claude-channels-adapter`) resolved the open items those ADRs named as pending (the
      mechanism and the saturation redesign) — append only, per this project's "ADRs are appended,
      not rewritten" convention; do not delete or rewrite the original text.
- [ ] 7.5 Verify (structural readback): confirm all docs render; the runbook contains no
      delivery-guarantee language; `WORK-PLAN.md:93` no longer asserts the inherited v1 windowed-peek
      "`saturated` rings once per cursor value" claim; `DATA-MODEL.md` §3.5 lists `claude-code-channel`;
      both ADRs carry an appended resolution note pointing at this change. sdd-verify/sdd-archive
      perform this readback; no automated test asserts prose content.
