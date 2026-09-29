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

## PR-06 — `test/security/channel-bundle.test.ts`

Status: not started. Depends: PR-05.

## PR-07 — Docs: manual-configuration runbook + `WORK-PLAN.md:93` amendment

Status: not started. Depends: PR-05.
