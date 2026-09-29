# Apply progress: f4-claude-channels-adapter

Tracks `tasks.md` completion per PR slice. Updated by each `sdd-apply` batch.

## PR-01 — `shared/ipc-contract.ts`, `shared/constants.ts`, `shared/envelope.ts`

Status: **merged**. Branch `f4/01-shared-schema-constants`, PR
[#95](https://github.com/agentesinteligentesllm-oss/connmuta/pull/95), merged to `main` via rebase
at `952fbcd` (Director-authorized). Diff: 207 insertions(+), 6 deletions(-) across 6 files — well
under the ~220-line estimate and the 400-line PR budget.

- [x] 1.1 RED `test/shared/envelope.test.ts`: extended with `ENVELOPE_TYPES` import; confirmed RED
      via `tsc -b` (`TS2305: Module has no exported member 'ENVELOPE_TYPES'`).
- [x] 1.2 GREEN `src/shared/envelope.ts`: exported `ENVELOPE_TYPES` (`as const`); `baseEnvelopeSchema`'s
      `type` field now builds from it (`z.enum(ENVELOPE_TYPES)`). No behavior change — build clean,
      77/77 `envelope.test.ts` tests pass.
- [x] 1.3 RED `test/shared/constants.test.ts`: extended with the six new constant assertions plus an
      `IPC_SESSION_HOST_MAX_CHARS` import from `ipc-contract.js`; confirmed RED via `tsc -b` (6x
      `TS2305`, one per missing constant).
- [x] 1.4 GREEN `src/shared/constants.ts`: added `DOORBELL_SCAN_DEPTH`, `CHANNEL_SERVER_NAME`,
      `CHANNEL_HOST_LABEL`, `CHANNEL_RETRY_BACKOFF_SECONDS`, `CHANNEL_META_LIST_LIMIT`,
      `CHANNEL_SHUTDOWN_TIMEOUT_MS` verbatim from design.md; appended an F4/D10 note to
      `MAX_ACTIVE_SESSIONS`'s doc comment (no value change). Build clean, 16/16
      `constants.test.ts` tests pass.
- [x] 1.5 RED `test/shared/ipc-contract.test.ts`: extended — route-count assertion moved 8→10; added
      round-trip + closed-set-rejection tests for `doorbellRequestSchema`, `doorbellResponseSchema`
      (including the co-emptiness `.refine()`), `channelCursorRequestSchema`,
      `channelCursorResponseSchema`, plus a reference-equality wiring test. Confirmed RED via `tsc -b`
      (8 errors: 2 missing exports + 4 `TS7053` index errors on the not-yet-widened route maps + 2
      more missing exports).
- [x] 1.6 GREEN `src/shared/ipc-contract.ts`: added `"POST /channel/doorbell"`/`"POST /channel/cursor"`
      to `IPC_ROUTES`; added the four schemas verbatim from design.md (including the co-emptiness
      `.refine()`); wired both into `IPC_REQUEST_SCHEMAS`/`IPC_RESPONSE_SCHEMAS`; updated the module's
      "eight" doc-comment references to "ten" (two occurrences: `IPC_ROUTES`'s own doc and
      `IpcRouteKey`'s doc). Build clean.
      **Deviation (scope-narrowing, not scope-expanding):** design.md's Interfaces/Contracts section
      later references `DoorbellRequest`/`DoorbellResponse` as bare TS type names (in
      `daemon/serve/doorbell.ts`'s signature, PR-03 scope). Task 1.6's own text enumerates exactly
      four things to add (schemas, route-table entries, schema-map wiring, doc-comment update) and
      does not list companion `z.infer` type exports, and this file's own convention for exporting a
      type alongside a schema is not 100% uniform (e.g. `sessionBindingSchema`, `doctorFindingSchema`,
      `sessionCloseResponseSchema`, `identityRequestQuerySchema` have no companion type). Left the
      three type aliases out of PR-01; PR-03 can add `export type DoorbellRequest = z.infer<typeof
      doorbellRequestSchema>` (and similarly for `DoorbellResponse`) itself when it actually needs them.
- [x] 1.7 Verify: `npm run build && node --test "dist/test/shared/ipc-contract.test.js"
      "dist/test/shared/constants.test.js" "dist/test/shared/envelope.test.js"` → 134/134 pass, 0 fail.
      `npm run test:static` → 59/59 pass, 0 fail (note: this glob is `dist/test/security/*.test.js`
      only — `test/twins.test.ts` lives at the top level of `test/`, not under `test/security/`, so
      it is NOT actually exercised by `test:static` despite the task brief's parenthetical; ran the
      full `npm test` as an extra check — 1538 pass, 0 fail, 6 pre-existing skips, twins test included
      and green).

### Audit & review trail (Kairo, post-implementation)

- Independently re-verified the diff against `design.md`'s Interfaces/Contracts block (byte-for-byte
  match on schema/constant bodies) and reran the full suite 3x outside the subagent's own report:
  1544 tests, 1538 pass, 0 fail, 6 skipped each time (one isolated exit-1 shell run traced to
  transient Windows noise, contradicted by 3 consistent clean reruns).
- Alpha (Arena tribunal) — two debates, both `CONSENSUS` round 1, `APPROVE`, zero objections:
  `bus-v2-f4-apply-pr01-001` (scope, pre-implementation) and `bus-v2-f4-pr01-diff-audit-001` (frozen
  diff, pre-merge).
- RDD native review — lineage `review-39a0ff92bc18e85d`, tier `medium` (risk reason:
  `executable_change` on `constants.ts`), 1 lens (`review-reliability`). State: **approved**,
  acknowledged, authority burned. 3 advisory findings, explicitly non-blocking per the receipt
  ("none opened a correction, none reopens this review"):
  1. **WARNING** `doorbellResponseSchema.types` (ipc-contract.ts:323-333) has no `.max(DOORBELL_SCAN_DEPTH)`
     bound, unlike the adjacent `senders`/`threads` fields — traces to `design.md`'s own verbatim
     schema (Alpha-approved at design phase), not a PR-01 implementation deviation. Worth a design-level
     decision on whether `types` should be bounded (its natural ceiling is `ENVELOPE_TYPES`'s own
     cardinality, 5, well under `DOORBELL_SCAN_DEPTH`, if the server de-duplicates as `design.md`
     promises) — carry to PR-03, where the server actually populates this field.
  2. **WARNING** no test in this PR exercises the `.max(DOORBELL_SCAN_DEPTH)` ceiling itself, nor the
     reverse co-emptiness direction (`count > 0` with empty lists) — only `count: 0` with non-empty
     lists is tested. Pure test-coverage gap on already-correct code; safe to close in PR-03 when the
     schema is exercised end-to-end, or as a small fast-follow.
  3. **SUGGESTION** `CHANNEL_META_LIST_LIMIT` is introduced but not referenced by any schema or test in
     this diff — may be intentional (enforced server-side later). Carry to PR-03/PR-05.
  Not fixed in PR-01: the candidate was already frozen and dual-approved (Alpha + RDD) when these
  surfaced; re-opening it for informational findings the review itself says not to re-run over would
  have discarded a clean receipt for no required gain. Flagged here instead, per this project's
  report-the-contradiction convention (`AGENTS.md` §2).

## PR-02 — `client/run-file.ts`, `client/session-exchange.ts`

Status: **done and merged** (tasks 2.1-2.7 ticked). PR #96, commit `d3cb965` on `main` (rebase merge). Post-merge `main`: build exit 0, `npm test` exit 0, 1557 tests, 1551 pass, 0 fail, 6 skip.

- `src/client/run-file.ts` (new): `resolveClientHomeDir`, `isProcessAlive`, `readRunFile`, `DaemonRunPayload` moved verbatim from `run-state.ts`, which re-exports them.
- `src/client/session-exchange.ts` (new): HMAC helpers, `HandshakeError`/`HANDSHAKE_ERROR_CODES`/`HandshakeErrorCode`, `SessionIdentity`, identity/session requests moved verbatim; new `exchangeSession(run, id, opts?)` = GET /identity (one-re-read retry) -> version check -> POST /session.
- `src/client/handshake.ts`: re-exports the moved names; `performHandshake` = `ensureDaemonRunning` then `exchangeSession` (retry semantics unchanged).
- Closure: neither new module imports `child_process`, `./spawn.js` or `./run-state.js`; pinned by a closure test in `session-exchange.test.ts` (uses `test/security/closure.ts`).
- Tests: new `run-file.test.ts`, `session-exchange.test.ts`; existing run-state/handshake/ipc-stub tests pass unchanged.
- Process note: the src move was written before the new test twins (a move-only refactor whose behavior the pre-existing tests already pinned); the new tests were then run green against it, not RED-first.
- Blocker (resolved by the orchestrator): `test/security/client-bundle.test.ts:81-85` asserted `node:fs` is confined to `["client/binding.js","client/run-state.js"]`; `readRunFile` now lives in `client/run-file.js`, so the list (and test title) gained `client/run-file.js`. Out of the PR-02 scope list, disclosed to Alpha.

### Audit & review trail (PR-02)
- `bus-v2-f4-apply-pr02-001`: `CONSENSUS`, round 1, `APPROVE`. Alpha's two pre-audit points confirmed: `exchangeSession` takes `SessionIdentity` and keeps GET /identity inside (`design.md:68,158`); closure clean.
- `bus-v2-f4-pr02-diff-audit-001`: `CONSENSUS`, round 1, `APPROVE`, zero objections. Alpha accepted the non-RED-first order, the size exception, the comment rewording (PT-27 and installer-bundle grep raw text) and the CRLF-to-LF normalization; reproduced build, 57 client/security tests and `test:static` (59) independently.
- Size: 661 added / 325 deleted (ledger counted 986 changed lines); ~260 added are verbatim moves. PR-scoped `size:exception`, Director-authorized. `sdd-attempt` reset (generation 2 to 3) was Director-authorized because the 500-line cap set at `acquire` was too low; the attempt itself settled `passed` with `changed_line_budget_exceeded`.
- RDD: START returned risk `high` (7 files, 986 lines, staged projection scoped to the 7 PR files); the Director **declined** review for this candidate (`declined_this_candidate`). Verification followed the RDD-off path: writer self-verification plus Alpha's independent reproduction.
- Mechanics: the workspace projection swept in the 4 unrelated uncommitted docs (11 files, 1554 lines); `git add` of exactly the 7 PR files plus `--projection=staged` scoped the candidate cleanly.

## PR-03 — `daemon/serve/doorbell.ts`

Status: **done and merged** (tasks 3.1-3.9 done). PR #97, commit `33cd1e6` on `main` (rebase merge). Depends: PR-01 (done). Strict TDD: every src change below was preceded by an observed RED.

**Audit & review trail (PR-03).** `bus-v2-f4-apply-pr03-001` (`CONSENSUS`, round 1, `APPROVE`): scope plus the treatment of PR-01's 3 RDD advisories (types bound E1, ceiling/co-emptiness pins E2, `CHANNEL_META_LIST_LIMIT` deferred to PR-05 via a `tasks.md` 5.1 amendment). `bus-v2-f4-pr03-diff-audit-001` (`CONSENSUS`, round 1, `APPROVE`, zero objections): accepted (A) D5's relevance rule implemented from its text because fetch has no such expression, (B) no `apply_outcome` filter, since fetch surfaces those rows in `rejected[]`/`unapplied[]`, (C) local `DoorbellRequest`/`DoorbellResponse` aliases and the PR-scoped size exception (~706 lines). RDD START returned risk `high` (10 files, 707 lines, staged projection); the Director declined review for this candidate. `sdd-attempt` settled `passed` with `--remediates-evidence-revision` for PR-02's over-budget attempt; objective complete. Post-merge `main`: build exit 0; the first `npm test` failed 1 test (`bootstrap: an overlapping heartbeat tick ...`, "generated asynchronous activity after the test ended", `database is not open`); 6/6 isolated reruns and a full rerun passed (1581 tests, 1575 pass, 0 fail, 6 skip), and `bootstrap.ts` is untouched in this range, so it is a pre-existing timing flake.

### RED-first evidence (command: `npm run build`, tsc -b, then the test file)

| Task | RED observed (before any src change) | GREEN |
|------|---------------------------------------|-------|
| 3.1 / 3.2 `waitForInboxRows` | `fetch.test.ts:21 TS2305: Module '../../../src/daemon/serve/fetch.js' has no exported member 'waitForInboxRows'` | `waitForRows` exported as generic `waitForInboxRows<Row>` over a new `InboxWaitDeps` (`emitter`, `delay`, `signal`); `serveFetch` calls it; 31/31 fetch tests pass, no behavior change |
| 3.3 / 3.4 `reverseRosterLookup` | `admission.test.ts:10 TS2305: ... has no exported member 'reverseRosterLookup'` | `export` added, nothing else; 20/20 admission tests pass |
| 3.5 / 3.6 `serveDoorbell` | `doorbell.test.ts:15 TS2307: Cannot find module '../../../src/daemon/serve/doorbell.js'` | `doorbell.ts` created; 14/14 pass. Mutation check on the built JS (no `slice` to depth, sender check forced true) failed 3 tests, so the pins can fail |
| 3.7 / 3.8 route | 4 route tests failed: `{"code":"IPC_ROUTE_NOT_FOUND","message":"no route for POST /channel/doorbell"}` | `createDoorbellHandler` behind `authenticateSessionForTool`; 34/34 routes tests pass |
| E1 `types.max` | `ipc-contract.test.js`: `doorbell response rejects a types array longer than ENVELOPE_TYPES.length` failed (1 fail of 44) | `.max(ENVELOPE_TYPES.length)` added; 44/44 pass |
| E2 ceilings + reverse co-emptiness | No RED possible: these pin behavior the schema already has (count/senders/threads `.max(DOORBELL_SCAN_DEPTH)`; the refine accepts `count>0` with empty lists). They passed on first run, as intended for a pin of current behavior | n/a, schema untouched beyond E1 |

### Verification

- `rm -rf dist && npm run build`: exit 0.
- `node --test` over doorbell, fetch, admission, routes and ipc-contract test JS: 143 tests, 143 pass, 0 fail.
- `npm test > /tmp/t3.log 2>&1`: EXIT=0; 1581 tests, 1575 pass, 0 fail, 6 skip (baseline 1557/1551/0/6; +24 tests: 14 doorbell, 1 fetch, 2 admission, 4 routes, 3 ipc-contract).

### Files

`src/daemon/serve/doorbell.ts` (new), `src/daemon/serve/fetch.ts`, `src/daemon/admission.ts`, `src/daemon/ipc/routes.ts`, `src/shared/ipc-contract.ts` (E1, one line), `test/daemon/serve/doorbell.test.ts` (new), `test/daemon/serve/fetch.test.ts`, `test/daemon/admission.test.ts`, `test/daemon/ipc/routes.test.ts`, `test/shared/ipc-contract.test.ts` (E1/E2).

### Size (measured, `git diff --numstat` plus new files)

Modified files: +216 / -10. New files: `doorbell.ts` 143 + `doorbell.test.ts` 337 = 480. Total 696 added / 10 deleted = 706 changed authored src+test lines, against a 400 budget and a ~480 estimate. Needs a disclosed PR-scoped `size:exception`, or a re-slice. Seams: 03a = the two exports + `doorbell.ts` + its tests + E1/E2 (about 574 added; `doorbell.test.ts` alone is 337) and 03b = route wiring (36 src + 87 test = 123). 03a is itself over budget; a further split would put E1/E2 plus the two export tests first.

### Disclosed deviations and notes

- E1 and E2 are outside the listed scope (Alpha CONSENSUS, debate `bus-v2-f4-apply-pr03-001`).
- The design's `DoorbellRequest`/`DoorbellResponse` types are not exported by `ipc-contract.ts` (PR-01 exports schemas only), so `doorbell.ts` exports them as `z.infer` aliases (type-only `zod` import) rather than touching `ipc-contract.ts` further.
- `fetch.ts` holds no relevance expression to import: `serveFetch` returns every non-rejected row in `log`. The relevance rule (`direct` or `BROADCAST` or stored `to === agent_id`) is design D5's own text (v1 `peek.ts:79-85`), implemented once in `doorbell.ts` as `isRelevant`. The sender half does call the exported `reverseRosterLookup`, as D5 requires. Flagged for Alpha: no shared relevance function exists to reuse.
- The scan does not filter on `apply_outcome`, following design D5's query literally: `rejected`/`ignored`/`not_mine` rows from a verified roster sender that satisfy the relevance rule count toward the summary. Not settled by the design; the adapter's later `agentbus_fetch` still reports them (as `rejected`/`unapplied`).
- `ServeDoorbellDeps` is exactly the design's (`db`, `binding`, `emitter?`, `delay?`); no `signal`, so an aborted IPC connection does not cancel the wait (bounded by `FETCH_LONGPOLL_MAX_SECONDS`).
- Stale doc fixed in my own diff: `createSessionRoutes`'s doc now says seven routes.

## PR-04 — `ledger/cursors.ts` commit path

Status: **done and merged** (tasks 4.1-4.5 done). PR #98, commit `e03498a` on `main` (rebase merge). 306 authored src+test lines, within budget. Alpha `CONSENSUS` x2 (`bus-v2-f4-apply-pr04-001`, `bus-v2-f4-pr04-diff-audit-001`, APPROVE, no objections; accepted body-validation-before-ensure, the synchronous handler without `dispatchTool`, and the session-host label). RDD START returned risk `medium` (4 files, 306 lines, staged); the Director declined review for this candidate. `sdd-attempt` settled `passed`, objective complete. Post-merge `main`: first `npm test` failed only the known `bootstrap` heartbeat flake (1596 tests, 1589 pass); the rerun was clean (1590 pass, 0 fail, 6 skip). Branch `f4/04-daemon-cursor-commit-route`. Depends: PR-01 (done), PR-03 (merged). Strict TDD: every src change was preceded by an observed RED. Design D8 approved by Alpha in debate `bus-v2-f4-apply-pr04-001`.

### RED-first evidence (command: `npm run build`, tsc -b; a missing export is a compile-error RED because `tsc -b` does not emit on a type error)

| Task | RED observed (before any src change) | GREEN |
|------|---------------------------------------|-------|
| 4.1 / 4.2 `commitClientCursor`, `readMaxInboxSeq` | `cursors.test.ts:17 TS2305: Module '../../src/ledger/cursors.js' has no exported member 'readMaxInboxSeq'` (2 errors, the other for `commitClientCursor`) | both added to `ledger/cursors.ts`; 25/25 cursors tests pass (7 new) |
| 4.3 / 4.4 `POST /channel/cursor` | `routes.test.ts:33 TS2305: ... routes.js has no exported member 'CURSOR_COMMIT_OUT_OF_RANGE'` | `CURSOR_COMMIT_OUT_OF_RANGE` + `createCursorHandler` wired in `createSessionRoutes`; routes + cursors: 67 tests, 67 pass |

### Behavior pinned

- Ledger: monotone (lower seq leaves `inbox_seq`, still stamps `last_seen_at`), idempotent, unknown `client_id` throws `CLIENT_CURSOR_UNKNOWN_MESSAGE`, other sessions and the digest untouched; `readMaxInboxSeq` with rows, without rows, other project.
- Route: no body = ensure + current `inbox_seq`, repeated call changes no column; commit at/below the tail commits and returns the stored value; commit past the tail = 400 `CURSOR_COMMIT_OUT_OF_RANGE` (`retryable: false`) with an existing row byte-identical (a); a session with no row still gets its row at the catch-up window after a refused commit (b, D8 ensure-first); empty project (0 ok, 1 refused); 401 identical to `/tools/*`, no row created; 409 `BINDING_CHANGED`; malformed body = `IPC_BAD_REQUEST` before ensure.

### Verification

- `rm -rf dist && npm run build`: exit 0.
- `node --test dist/test/ledger/cursors.test.js dist/test/daemon/ipc/routes.test.js`: 67 tests, 67 pass, 0 fail.
- `npm test > /tmp/t6.log` first run: EXIT=1, 1596 tests, 1589 pass, 1 fail, 6 skip; the one failure was the known pre-existing flake `bootstrap: an overlapping heartbeat tick ...`. `node --test dist/test/daemon/bootstrap.test.js` x3: 15/15 pass each time. Full rerun (`/tmp/t6b.log`): EXIT=0, 1596 tests, 1590 pass, 0 fail, 6 skip (baseline 1581/1575/0/6; +15 tests: 7 cursors, 8 routes).

### Files

`src/ledger/cursors.ts`, `src/daemon/ipc/routes.ts`, `test/ledger/cursors.test.ts`, `test/daemon/ipc/routes.test.ts`.

### Size (measured, `git diff --numstat`)

routes.ts +57/-1, cursors.ts +29, routes.test.ts +145, cursors.test.ts +74 = 305 added / 1 deleted = 306 changed authored src+test lines (budget 400, estimate ~200). Within budget; no exception needed.

### Disclosed deviations and notes

- `CURSOR_COMMIT_OUT_OF_RANGE` is a daemon-local exported constant in `routes.ts`, not added to `shared/` or `IPC_TRANSPORT_ERROR_CODES`.
- Body validation runs before `ensureClientCursor`, so a malformed body creates no row (same order as the doorbell route); only an authenticated, well-formed call ensures.
- The handler is synchronous and does not use `dispatchTool`; `readMaxInboxSeq` and `commitClientCursor` cannot throw for a session that just ensured its row.
- `ClientSessionInput` fields all have a source in `auth.session` (`client_id`, `project_id`, `host`, `pid`, `started_at`) plus `now`; nothing invented. The stored `host` is the session's own label (`claude-code` in the test), not a distinct adapter label; that is a PR-05 concern.
- Stale doc fixed in my own diff: `createSessionRoutes` doc now says eight routes.

## PR-05 — `channel/*.ts`, `package.json`, `tsconfig.json`

Status: **in progress, re-sliced into four slices** (`tasks.md`, PR-05 block). 05a merged (below); 05b, 05c and 05d not started. Depends: PR-01, PR-02, PR-03, PR-04 (all merged).

### PR-05a — scaffold + `notify.ts` (tasks 5.9, 5.10, 5.1, 5.2)

Status: **done and merged**. PR #99, commit `9262939` on `main` (rebase merge). 224 authored lines, within budget. Alpha `CONSENSUS` x2 (`bus-v2-f4-apply-pr05-001` approved the 4-slice re-slice, the `pack.test.ts` scope addition to 05d and the v1 port; `bus-v2-f4-pr05a-diff-audit-001` approved the diff, empty-list omission, local `DoorbellResponse` type, static purity test and `CHANNEL_INSTRUCTIONS`). RDD START returned risk `high` from a heuristic that matched the forbidden-substring text in the purity test; the Director declined review for this candidate. `sdd-attempt` settled `passed`. Post-merge `main`: build exit 0, `npm test` exit 0, 1607 tests, 1601 pass, 0 fail, 6 skip. 05b-05d not started.

- RED (5.1): `rm -rf dist && npm run build` failed exit 2 with `test/channel/notify.test.ts:7:57 - error TS2307: Cannot find module '../../channel/notify.js'` (compile-error RED; follow-on TS2345/TS18046 came from the same missing import).
- GREEN: `channel/tsconfig.json` (5.9, mirrors `src/client/tsconfig.json`, adds `../src/client` reference), root `tsconfig.json` reference (5.10), `channel/notify.ts` (5.2).
- `node --test "dist/test/channel/notify.test.js"`: 11 tests, 11 pass. Cold `rm -rf dist && npm run build`: exit 0; `dist/channel/notify.js` and `dist/test/channel/notify.test.js` emitted.
- Full `npm test`: run 1 exit 1, 1607 tests / 1600 pass / 1 fail (known flake `bootstrap: an overlapping heartbeat tick`, the only failure) / 6 skip; immediate rerun exit 0, 1607 / 1601 pass / 0 fail / 6 skip. Baseline 1596 plus 11 new.
- Measured authored size: 224 lines (channel/notify.ts 77, channel/tsconfig.json 10, test/channel/notify.test.ts 136, tsconfig.json +1); estimate was about 250, budget 400, no exception.
- Decisions: the type is `z.infer<typeof doorbellResponseSchema>` (type-only zod import), so `channel/` imports nothing from `src/daemon`. Empty senders/types/threads lists are omitted from `meta` rather than sent as empty attributes. `CHANNEL_META_LIST_LIMIT` is kept: the schema bound (`DOORBELL_SCAN_DEPTH`) is far above it, so the cap is not redundant. `sanitizeMetaValue` strips per list entry (v1 behavior), so a hostile entry containing a comma would yield extra list items, never a forged attribute; the schema patterns already exclude commas.

### Retroactive RDD review of PR-03, PR-04 and PR-05a (session 52)

The Director asked whether RDD was worth applying after declining it on earlier candidates, and to apply it if viable. It was viable and was applied as a committed base-diff over `d3cb965..HEAD` (16 files, 1235 lines): lineage `review-15bbc1e2b034a77a`, risk `high` (heuristic false positive on the purity test), 4 lenses (risk, resilience, readability, reliability), correction budget 200. The Director granted consent for this candidate. Result: **approved**, acknowledged, authority burned. Because the code was already on `main`, the review could not block anything; every finding is a follow-up.

- **review-risk: no findings.** Both routes authenticate before parsing the body and are scoped to the caller's own project and client; the doorbell SELECT names no body column; the cursor commit is monotone and bounded by the project's own max seq; notify sanitizes and caps meta values.
- **WARNING x2, one root (inferential, introduced):** `src/daemon/serve/doorbell.ts:125-133` calls `JSON.parse` on each stored `envelope_json` with no per-row guard and pushes `envelope.type` and `envelope.thread` into the response unchecked (`R4-doorbell-poison-row`, `R3-doorbell-unvalidated-envelope`). A malformed stored row would make every later read for that `after_seq` window throw. **Kairo's reachability read:** `admission.ts:508` stores an already validated envelope and `serve/fetch.ts:244-246` uses the same unguarded parse, so triggering it needs database corruption. Real hardening, low likelihood. Not fixed; see HANDOFF §4.
- **SUGGESTION x3:** `routes.ts:720` factory doc says "eight routes" and then "preferred over six separate per-route factories"; `routes.ts:661` comment says the doorbell is "not a tool" yet it uses `authenticateSessionForTool` and `dispatchTool` (errors map through the tool-error fallback); `routes.ts:650-659` passes no abort `signal` although `InboxWaitDeps` accepts one, so a disconnected doorbell long-poll holds its listener until `FETCH_LONGPOLL_MAX_SECONDS` (Alpha had approved this last one as design-exact in `bus-v2-f4-pr03-diff-audit-001`).

### PR-05b — `channel/daemon-link.ts` (tasks 5.3, 5.4)

Status: **done and merged**. PR #100, commit `2647b06` on `main` (rebase merge). 651 authored lines (236 + 415): **PR-scoped `size:exception`, Director-authorized** (budget 400, estimate about 400). Alpha `CONSENSUS` x2 (`bus-v2-f4-apply-pr05b-001` approved the shape and the amendments below; `bus-v2-f4-pr05b-diff-audit-001` approved the diff and recommended the exception). RDD: the Director granted consent; lineage `review-f22ebcffa06e871b`, risk medium, one lens (`review-reliability`), **approved with no findings**, acknowledged, authority burned. `sdd-attempt` settled `passed` (cap 1000). Post-merge `main`: build exit 0, `npm test` exit 0, 1630 tests, 1624 pass, 0 fail, 6 skip (baseline 1607/1601 plus 23 new).

- RED (5.3): first error `test/channel/daemon-link.test.ts:15:8 - error TS2307: Cannot find module '../../channel/daemon-link.js'` (compile-error RED; every case is a behavior test that can fail).
- GREEN (5.4): `channel/daemon-link.ts`, 23 cases in `dist/test/channel/daemon-link.test.js`, all pass. The writer ran three mutations (second-401 guard dropped, cache-clear condition inverted, `closing ??=` changed to `closing =`); each failed only its matching tests. Kairo fixed one missing space in a throw (`daemon-link.ts:100`) before the freeze. No live-daemon case: scripted `fetchImpl` against a real temp run file is the approved substitution.
- Surface for 05c/05d: `createDaemonLink(deps)` returns the `DaemonLink` interface (`readDoorbell(afterSeq, timeoutS, signal?)`, `commitCursor(commitSeq?)`, `close()`), plus `DaemonLinkError`, `DAEMON_LINK_ERROR_CODES` (eight codes) and a `DoorbellResponse` type alias (`notify.ts` has its own local alias of the same type; 05c should import one of them, not add a third).
- Decisions: an interface plus a factory, not a class, so 05c injects a structural fake. A missing run file is `NO_DAEMON` with zero fetches. A connection-level fetch rejection drops the cached session (a daemon that idle-shut-down restarts on a new ephemeral port), a `TimeoutError` keeps it. A 401 re-handshakes once, a second is `UNAUTHORIZED`. A 409 `BINDING_CHANGED` never re-handshakes. `close()` waits (bounded) for an in-flight handshake, then deletes that session; later calls throw `ABORTED`. `DaemonLinkError` carries no `cause`, so nothing thrown can leak the bearer. `dropSession(used)` clears only if the cache still holds that promise.
- Amendments recorded in `tasks.md`: task 5.3's backoff clause moves to 05c; task 5.5 must pin that `link_failed` sleeps `CHANNEL_RETRY_BACKOFF_SECONDS` and that `ABORTED` after `signal.aborted` neither warns nor sleeps.
- Alpha's citations re-verified by Kairo: `routes.ts:360-366` (409 from the frozen `(bot_id, group_id, agent_id)` snapshot, not `roster_hash`; Alpha corrected Kairo's wording), `client/errors.ts:38`, `IPC_EPHEMERAL_PORT = 0` (`constants.ts:348`), `routes.test.ts:306`.
- Known limitations, not fixed: L1 a handshake still running when the shutdown bound fires can still mint a slot (`exchangeSession` takes no signal); L2 a dropped session on a live daemon leaks its slot until restart; L3 `exchangeSession` may re-read the run file and mint on another port than the payload passed, which the next attempt heals. RDD non-blocking observations for 05d: a caller abort is not honoured while a handshake is in flight, and `commitCursor` takes no signal; both are bounded by `IPC_REQUEST_TIMEOUT_MS`.
- Process notes: with the two slice files staged, `sdd-attempt settle` needed no untracked flags, and the provider-issued RDD START with the default `workspace` projection saw exactly those two files. Engram holds no `sdd-init/connmuta` observation; `openspec/config.yaml` (`strict_tdd: true`) was the source.

### PR-05c — `channel/doorbell-loop.ts` (tasks 5.5, 5.6)

Status: **done and merged**. PR #101, commit `0ea55df` on `main` (rebase merge). 476 authored lines (125 + 351): **PR-scoped `size:exception`, Director-authorized** (budget 400, 1.19x). Alpha `CONSENSUS` x2 (`bus-v2-f4-apply-pr05c-001` approved the shape; `bus-v2-f4-pr05c-diff-audit-001` approved the diff and recommended the exception). RDD: the Director granted consent; lineage `review-7c68cd7c0744c817`, risk medium, one lens (`review-reliability`), **approved with one SUGGESTION**, acknowledged, authority burned. `sdd-attempt` settled `passed` (cap 1000). Post-merge `main`: build exit 0, `npm test` exit 0, 1655 tests, 1649 pass, 0 fail, 6 skip (baseline 1630/1624 plus 25 new).

- RED (5.5): first error `test/channel/doorbell-loop.test.ts:8:75 - error TS2307: Cannot find module '../../channel/doorbell-loop.js'` (compile-error RED).
- GREEN (5.6): `channel/doorbell-loop.ts`, 25 cases in `dist/test/channel/doorbell-loop.test.js`, all pass, and 10 of 10 repeated runs green (the suite uses a 20 ms real timer and `process.getActiveResourcesInfo()`). Five writer mutations, each caught: commit moved before `deliver` (3 tests fail), watermark not advanced on a failed commit (1), the `!signal.aborted` guard before the backoff dropped (7), `removeEventListener` dropped on timer fire (1), `clearTimeout` dropped on abort (2).
- Surface for 05d: `DoorbellWatcher` (`new DoorbellWatcher({ link, deliver, sleep?, warn? })`, `tick(signal?)`, `run(signal)`), `TickOutcome`, `DoorbellWatcherDeps`, and `abortableSleep`. `link` is `Pick<DaemonLink, "readDoorbell" | "commitCursor">`, so the real link is assignable.
- Decisions: the watermark bootstraps lazily in `tick` through `commitCursor()` with no argument, so a daemon that is not up yet is only `link_failed` plus backoff. `run` owns the backoff (`deliver_failed` and `link_failed` sleep `CHANNEL_RETRY_BACKOFF_SECONDS`; `rang` and `silent` never). An abort is detected with `signal.aborted` and is a silent stop; the watcher does not import `DaemonLinkError` and never branches on its code. `buildNotification(summary) === null` covers both the silent tick and the defensive null (`notify.ts:45` returns null exactly when `count === 0`). `abortableSleep` is the only timer in `channel/` (global `setTimeout`, never `node:timers`), and `hasAutonomousTimerReference` is pinned TRUE for this file. Warnings go to stderr; the source has no `process.stdout`.
- Known limitations, not fixed: the silent path has no sleep (D11), so a daemon that answered instantly and empty every time would spin the loop; `tick()` is not concurrency-safe (`run` is sequential); the timing-based tests depend on real timers with a generous bound.
- RDD suggestion (severity SUGGESTION, `R3-throw-outside-guard`, `doorbell-loop.ts:79-83`): `buildNotification` runs outside a `try/catch`, so a throw would end `run`. Kairo's reachability read: in production the summary is already parsed by `doorbellResponseSchema` inside `daemon-link.ts`, and the builder only slices, sanitizes and joins strings, so a throw needs a code defect. Not fixed; candidate item for the B-95/B-96 small PR if the Director wants it.
- For 05d, recorded as an amendment to task 5.7: `commitCursor` takes no signal and a handshake in flight ignores a caller abort (also the RDD note on 05b), so `main.ts` must race `run(signal)` against `CHANNEL_SHUTDOWN_TIMEOUT_MS` before `link.close()` rather than await it unboundedly (Alpha agreed in the diff audit).

### PR-05d — `channel/main.ts`, packaging and `pack.test.ts` (tasks 5.7, 5.8, 5.11)

Status: **done and merged; PR-05 is complete.** PR #102, commit `48c8c39` on `main` (rebase merge). 612 changed lines in 6 files (607 added, 5 deleted): `channel/main.ts` 227, `test/channel/main.test.ts` 359, `test/security/pack.test.ts` +11/-1, `test/cli/main.test.ts` +4/-2, `package.json` +2/-1, `npm-shrinkwrap.json` +2/-1. **PR-scoped `size:exception`, Director-authorized** (budget 400, 1.5x). Alpha `CONSENSUS` x2 (`bus-v2-f4-apply-pr05d-001` approved the shape; `bus-v2-f4-pr05d-diff-audit-001` approved the diff and recommended the exception). RDD: the Director granted consent; lineage `review-8d944602c30cc117`, risk **high**, four lenses, **approved**: 0 findings in risk, resilience and reliability, 2 readability SUGGESTIONs; acknowledged, authority burned. `sdd-attempt` settled `passed` (cap 1000). Post-merge `main`: build exit 0, `npm test` exit 0, 1682 tests, 1676 pass, 0 fail, 6 skip (baseline 1655/1649 plus 27 new).

- RED: first error `test/channel/main.test.ts:15:94 - error TS2307: Cannot find module '../../channel/main.js'`. Against the unedited `package.json` the writer observed 3 failures in `pack.test.js` (exact `files` equality, `dist/channel/main.js` not packed, missing bin key).
- GREEN: 26 cases in `dist/test/channel/main.test.js` (6 of 6 repeated runs green; it spawns the built entry and ends a real stdin) and 5 in `pack.test.js`. Six writer mutations, each caught: `"claude/channel/permission": false` (a compile error; with a cast 8 tests fail), a `{}` value (the capabilities test), an unbounded await of `run` (fails at its 2 s guard), `link.close()` skipped, signal listeners left registered, and no stdin-close mapping (only the real-process case).
- Surface: `runChannel(options)` (never exits the process), `parseChannelArgs(argv)`, `RunChannelOptions`. The guarded entry parses `--project <id>` and `--project=<id>` strictly (unknown arguments are `EXIT_USAGE`), then hard-exits once stderr has drained. Nothing is written to stdout.
- Decisions and findings: (1) the MCP SDK's `StdioServerTransport` listens only to stdin `data` and `error` (`stdio.js:37-38`, verified by Kairo), so `server.onclose` never fires on stdin ending; `createStdioTransport` maps stdin `close` onto the transport's `close`, pinned by a real-process test. (2) The entry guard is `import.meta.main`, not the `src/cli/main.ts:707-711` idiom, which may be false behind a POSIX symlinked bin (filed as B-97, not reproduced here). (3) The shutdown wait for the watcher is bounded by `CHANNEL_SHUTDOWN_TIMEOUT_MS` through `AbortSignal.timeout`, so `doorbell-loop.ts` stays the only timer file (tasks 5.7 amendment). (4) A crashed doorbell loop reports one stderr line, shuts down and exits 1, instead of leaving a zombie. (5) A local `refusalMessage` mirrors the thin client's (that module cannot be imported: its closure reaches ipc-stub, run-state and spawn); no Node-floor gate, since `engines` already requires >= 24.15.0. (6) `DoorbellWatcher` is built with `{ link, deliver }`, so its default warnings go to the real stderr, not to the injected `stderr` option.
- Plan defect found by Kairo, not by the writer (which ran only targeted suites): `test/cli/main.test.ts:64` asserted exactly one `bin` entry (D-09), false by design after task 5.11. It now expects `[PRODUCT_NAME, CHANNEL_SERVER_NAME]`; `npm-shrinkwrap.json`'s root `bin` gained the adapter (the file ships in the tarball). The first full run failed on exactly that one test; the rerun after the fix passed. Same class as the `pack.test.ts` sequencing defect recorded when PR-05 was re-sliced.
- RDD risk `high` came from two heuristic hits, both checked by Kairo: the only `spawn` in `channel/main.ts` is a comment saying the module imports none of the thin client's spawn code, and `pack.test.ts` already used `child_process` before this change. The lenses noted two small gaps that are not findings: the stdin `close` listener is registered before `server.connect` and its `transport.close()` is fire-and-forget, and the signal handlers are installed only after `connect`, so a signal during `connect` gets Node's default action.
- RDD SUGGESTIONs (readability, inferential, introduced), filed under B-95: `R2-shutdown-timer` (the `whenAborted(AbortSignal.timeout(...))` indirection reads like a timer) and `R2-import-allowlist` (one long allow-list regex and a magic minimum of 8 specifiers in the test).
- For PR-06: see the session-53 amendment in `tasks.md`'s PR-06 block. The closure test must allow `fs` in exactly `client/binding.js` and `client/run-file.js`, and `dist/channel/doorbell-loop.js` is the one file that may arm a timer.

### PR-05 as a whole

Four slices, 1963 authored lines against the original forecast of about 750 (2.6x): 05a 224 (#99), 05b 651 (#100), 05c 476 (#101), 05d 612 (#102). Slices 05b, 05c and 05d each carried a Director-authorized PR-scoped `size:exception`. Every slice ran the same loop: scope debate with Alpha, `sdd-attempt` acquire, one `general-purpose` writer, Kairo's independent cold rebuild and full-suite rerun, `settle`, frozen-diff debate, RDD consent, PR, rebase merge, post-merge rebuild and full suite. All 8 debates of slices 05a to 05d ended `CONSENSUS`, `APPROVE`, round 1, no objections.

## Follow-up PR 05e — B-95 (a)(b)(c)(e)(f) and B-96 (session 54)

Status: **done and merged.** PR #103, five work-unit commits on `main` (rebase merge; `ed965f1`, `26ec12e`, `0fc6f49`, `53cd188`, `b99d66b`), tree `97a3e759` identical to the reviewed candidate. 193 changed lines in 8 files (174 added, 19 deleted), within budget, no `size:exception`. Not an SDD task: it closes RDD follow-ups filed under B-95 and B-96, so `tasks.md` has no block for it. Alpha `CONSENSUS` x2 (`f4-smallfix-b95-b96-scope-001` approved the scope, `f4-smallfix-b95-b96-diff-audit-001` the frozen diff), both `APPROVE`, round 1, no objections. RDD: the Director granted consent; lineage `review-4cab6b97f2871cfb`, risk **high** (heuristic false positive: the `channel/main.ts` hunk is a comment and a named local, and that file starts no process), four lenses, **approved** with two non-blocking SUGGESTIONs; acknowledged, authority burned. `sdd-attempt` settled `passed` (cap 500). Post-merge `main`: cold build exit 0, `npm test` exit 0, 1694 tests, 1688 pass, 0 fail, 6 skip (baseline 1682/1676/0/6 plus 12 new).

- Items: (a) `parseScannedEnvelope` in `serve/doorbell.ts` (object check, `type` in `ENVELOPE_TYPES`, `thread` matching `THREAD_PATTERN`, `to` a string or null; an unreadable row is examined but neither counted nor listed, so `covered_through_seq` still advances); (b) and (c) comment-only edits in `ipc/routes.ts`; (e) a doc comment on `DoorbellWatcher.tick` plus one pin test (a malformed summary makes `tick` and `run` reject, nothing delivered, committed or slept on), with no `catch` added on purpose; (f) `watcherStopBound` in `channel/main.ts`, and `ALLOWED_SPECIFIERS` plus `MIN_SCANNED_SPECIFIERS` in its test (11 imports today, floor 8); B-96 as a test-only barrier in `test/daemon/bootstrap.test.ts`.
- RED (writer): 11 new doorbell tests failed before the fix (`SyntaxError`, `TypeError ... reading 'type'`, `ZodError` on the enum and on `THREAD_PATTERN`). The pin for (e) passed on its first run and is disclosed as a pin; a swallowing `try/catch` around `buildNotification` turns it RED (`Missing expected rejection`). Mutations on (a): dropping the `ENVELOPE_TYPES` check turns 3 tests RED; dropping the object/null guard turns only the `null` row and the all-unreadable window RED, because `123` and `[]` are also rejected by the `type` check, so those two rows pin the outcome rather than the branch (Alpha accepted them as partition tests).
- B-96 root cause, read from code and confirmed: `stop()` (`bootstrap.ts:243-260`) calls `heartbeat.stop()`, which only clears the interval (`heartbeat.ts:43-45`), and never awaits a tick in flight, so the test's fixed 120 ms sleep could end while a tick's `reconcile()` still awaited the 40 ms factory. Reproduced by the writer under CPU contention on this 24-CPU machine: before the fix 2 of 30 isolated runs failed at 24 busy loops, 3 of 30 at 48 and 16 of 30 at 96 (signatures `factoryCalls 1 !== 2`, `database is not open`, `ENOENT ... run\daemon.log`); after the fix 30 of 30 at 96 loops (writer), 12 of 12 in a timing probe, and 10 of 10 by Kairo under 96 loops of his own. The barrier waits for the `BINDING_CHANGED` row with no factory call in flight (`BARRIER_POLL_MS` 10, `BARRIER_DEADLINE_MS` 30 000, so a stuck add fails with a message instead of hanging the runner). It is sound because `bindings.ts:259-269` writes that row after BOTH factory calls with no `await` after it, `registry/loader.ts:179`'s `sync()` is synchronous, and later ticks return early without calling the factory. An in-flight counter replaced the planned settle promises, because a snapshot of settle promises cannot cover the second factory call, which starts only after the first settles. Removing the `ticking` guard from a compiled copy still fails the test with `14 !== 2`, so the negative proof survives.
- Recorded, not fixed here: the production side of the B-96 gap (a tick mid-`reconcile()` when `stop()` runs can start a poller after `stopAll()`) becomes **B-98**; `serve/fetch.ts:244-246` keeps the same unguarded parse; the two RDD SUGGESTIONs (R2-1: the "11 when written" figure in a comment will drift; R3-1: `to` accepts any string, including an empty one, and is not emitted in the response) and the resilience lens's note that the skip of an unreadable row is silent (no log, no counter) are filed under B-95.
- Process notes: the writer ran only targeted suites; Kairo's cold full run passed on the first try. `hasAutonomousTimerReference` is a regex on source text (`test/security/predicates.ts:54-56`), not the AST pin Alpha's reports called it. The Alpha pointers Kairo re-checked (`daemon-link.ts:108/112/117/225`, `routes.ts:276-298`, `bindings.ts:257-270`, `constants.ts:211`, `envelope.ts:231/308`) were all correct.

## PR-06 — `test/security/channel-bundle.test.ts`

Status: not started; scope approved in session 54 (`f4-pr06-channel-bundle-scope-001`, `CONSENSUS`), see the session-54 amendment in `tasks.md`'s PR-06 block. Depends: PR-05.

## PR-07 — Docs: manual-configuration runbook + `WORK-PLAN.md:93` amendment

Status: not started. Depends: PR-05.
