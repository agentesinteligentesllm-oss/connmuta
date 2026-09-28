# Tasks: F3 — Local Web Panel, Roster Sync, and Version Observability

| Field | Value |
|---|---|
| Change | `f3-web-panel-and-observability` |
| Inputs | `proposal.md` (Alpha-audited, `bus-v2-f3-propose-audit-001` CONSENSUS); `specs/{web-panel,roster-sync,version-observability}/spec.md` (9 requirements, 19 scenarios, `bus-v2-f3-spec-audit-001` CONSENSUS); `design.md` (`bus-v2-f3-design-audit-001` CONSENSUS) |
| Delivery strategy | `auto-chain`, following the standing project preflight (AGENTS.md §4, reused since F1/F2). `Decision needed before apply: No` — design left no ambiguity blocking the first slice |
| Chain strategy | `stacked-to-main`, following F1/F2's own established convention. Each PR targets `main` in sequence |
| TDD rule | Strict TDD. Red before green. Every `src/**/*.ts` has a `test/**/<same>.test.ts` twin (`test/twins.test.ts` enforces this). RED tasks precede the GREEN task that creates the `src` file they test |
| PR budget | 400 authored changed lines (additions + deletions) per PR |
| Own-slice rule | `daemon/ipc/server.ts` and `daemon/bootstrap.ts` are already-merged, multi-purpose files — each gets its own dedicated PR (PR-02, PR-05), never bundled with new-capability code, following F1/F2's precedent. A single small, single-purpose addition wholly in service of one new capability (`installer/registry-commit.ts`'s one new `RegistryCommitReason` member, `cli/main.ts`'s one new dispatch entry per verb) is bundled with that capability's own PR instead — matching PR-17's `daemon-stop.ts` + `main.ts` precedent more closely than PR-13's bulk-dispatch isolation, since neither touches unrelated existing dispatch entries |
| Rollback (default, all PRs) | Revert the PR (`git revert`). No file this change touches has a migration; every PR is additive or a small, isolated edit to an existing function |
| Verify (base commands) | Build: `npm run build`. Full suite: `npm test`. Static suite: `npm run test:static`. Focused: `node --test "dist/test/<glob>"` after build — glob named per PR below |
| Documentation per PR | Any PR touching a THREAT-MODEL T18/PT-29 clause updates the relevant row in `docs/02-architecture/THREAT-MODEL.md` in the same PR; DATA-MODEL.md's panel-token-domain note (`:291`) is resolved in PR-03 |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ≈2,850 authored lines across 9 PRs (rough; expect 20-40% growth per F1/F2's own repeated estimate-to-actual lesson) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | 9 PR slices, PR-01 → PR-09 |
| Delivery strategy | `auto-chain` |
| Chain strategy | `stacked-to-main` |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium
```

No `size:exception` is planned upfront — every PR below is estimated near or under 400 lines by
splitting at existing module/file boundaries (transport guards vs. server.ts vs. panel/* vs.
bootstrap.ts vs. CLI verbs vs. version-observability), following the "own-slice" rule above.

### Suggested Work Units

Each `#### PR-XX` block states its own Branch/Depends/Size/Scope/Requirements/Runtime-harness line
and closes with a `Verify:` task naming the focused test command; rollback is the uniform one stated
above (revert the PR).

## PR Slices

### Unit 1 — Shared transport guards

#### PR-01 — `daemon/transport/http-guards.ts`
Branch `f3/01-http-guards` → `main`. Depends: none. Size: ≈220 lines (est.).
Scope: `src/daemon/transport/http-guards.ts`, `test/daemon/transport/http-guards.test.ts`.
Requirements: web-panel "Origin and Host validation" (foreign Host, foreign Origin, absent-Origin
admitted); design's `checkTransportGuards(req, {expectedHost, requireOrigin})` contract with its own
local `GuardRejection` shape (no import from `daemon/ipc/server.ts`, avoids the cycle Alpha's design
audit caught).
Runtime harness: N/A — pure function, no live socket needed.

- [x] 1.1 RED: `test/daemon/transport/http-guards.test.ts` — foreign Host refused, foreign Origin
      refused (Origin present + mismatched), absent Origin admitted when `requireOrigin: true`,
      Origin ignored entirely when `requireOrigin: false`.
- [x] 1.2 GREEN: implement `checkTransportGuards` extracting the Host-check logic currently inline in
      `daemon/ipc/server.ts:219-228`, parameterized by `requireOrigin`.
- [x] 1.3 Verify: `npm run build && node --test "dist/test/daemon/transport/http-guards.test.js"`.

### Unit 2 — `daemon/ipc/server.ts` (own-slice)

#### PR-02 — Wire `ipc/server.ts` to `http-guards`
Branch `f3/02-ipc-server-guards` → `main`. Depends: PR-01. Size: ≈90 lines (est.).
Scope: `src/daemon/ipc/server.ts`, `test/daemon/ipc/server.test.ts`.
Requirements: no behavior change for existing MCP clients — this PR only replaces inline logic with
`checkTransportGuards(req, {expectedHost, requireOrigin: false})`.
Runtime harness: existing `ipc/server.test.ts` real-listener pattern.

- [x] 2.1 RED: extend `ipc/server.test.ts` with a regression case pinning that the existing Host-check
      behavior is byte-identical after the refactor (same status/body on a foreign Host).
- [x] 2.2 GREEN: replace `handleRequest`'s inline Host check with a `checkTransportGuards` call.
- [x] 2.3 Verify: `npm run build && node --test "dist/test/daemon/ipc/server.test.js"`.

**Disclosed correction, outside this PR's stated scope line:** `test/security/daemon-bundle.test.ts`'s
reverse-import-graph assertion (design §14) allow-listed `transport/*` importers as only
`daemon/bindings.js`/`daemon/send/*`/`daemon/transport/*` — written before `http-guards.ts` existed,
when everything under `transport/` was outbound-Telegram-specific. `daemon/ipc/server.ts` importing
the new shared guard broke that assertion; fixed by exempting `http-guards.js` by name (not widening
the allow-list itself), disclosed in the file's own test comment.

### Unit 3 — Panel token and discovery primitives

#### PR-03 — `daemon/panel/token-store.ts` + `daemon/panel/panel-run-file.ts`
Branch `f3/03-panel-token-runfile` → `main`. Depends: none (parallel to PR-01/02). Size: ≈300 lines (est.).
Scope: `src/daemon/panel/token-store.ts`, `src/daemon/panel/panel-run-file.ts`,
`test/daemon/panel/token-store.test.ts`, `test/daemon/panel/panel-run-file.test.ts`,
`docs/02-architecture/DATA-MODEL.md` (resolve the `:291` open note).
Requirements: web-panel "Loopback-only, per-boot-token transport" (single token, constant-time
compare, query-param acceptance).
Runtime harness: N/A — in-memory store and file I/O, no live socket.

- [x] 3.1 RED: `token-store.test.ts` — valid token accepted, invalid/missing rejected, constant-time
      comparison (mirrors `sessions.ts`'s own test pattern).
- [x] 3.2 GREEN: implement `PanelTokenStore` (single `randomBytes` token per boot).
- [x] 3.3 RED: `panel-run-file.test.ts` — write/read/delete `run/panel.json`, `0o600` mode, mirrors
      `lifecycle/run-file.ts`'s own test shape.
- [x] 3.4 GREEN: implement `writePanelRunFile`/`readPanelRunFile`/`deletePanelRunFile`.
- [x] 3.5 Update DATA-MODEL.md `:291` — panel token is a separate `run/panel.json`, not the daemon's
      `run/daemon.json` secret.
- [x] 3.6 Verify: `npm run build && node --test "dist/test/daemon/panel/token-store.test.js" "dist/test/daemon/panel/panel-run-file.test.js"`.

**Disclosed addition, outside this PR's stated scope line:** `src/shared/constants.ts` gains one new
named constant, `PANEL_TOKEN_BYTES = 32`, mirroring `RUN_SECRET_BYTES`/`SESSION_TOKEN_BYTES` — required
by AGENTS.md's named-constant rule and not listed in the PR's own Scope line, which predates deciding
where the token's byte length would live.

### Unit 4 — Panel HTTP surface

#### PR-04a — Persist `roster_drift` as a standing condition (inserted, disclosed)
Branch `f3/04a-roster-drift-condition` → `main`. Depends: none. Size: 71 authored lines (actual).
Scope: `src/ledger/conditions-store.ts`, `src/daemon/ipc/routes.ts`, `test/ledger/conditions-store.test.ts`,
`test/daemon/ipc/routes.test.ts` (extended). **Not in the original tasks.md plan** — discovered while
starting PR-04: `shared/ipc-contract.ts`'s `ROSTER_DRIFT_CONDITION` was raised only transiently inside
`POST /session`'s one response body (`routes.ts:414-416`) and never persisted anywhere; `roster_drift`
was not a member of `conditions-store.ts`'s closed `ConditionName` union; nothing in the plan wrote it
anywhere a passive `GET`-only panel could read it from. Debated with Alpha before any code was written
(`bus-v2-f3-pr-04-plan-gap-001`, `CONSENSUS` round 1): add `roster_drift` as a 5th `ConditionName`
(scope `project`, zero detail fields — the daemon only ever has a hash comparison, never the client's
live roster array, so no structural diff is possible from the daemon's side), and extend the *same*
already-computed comparison in `routes.ts` to call `raiseCondition`/`clearCondition`. The panel (PR-04c)
reads this condition directly; "the diff" the web-panel spec's scenario names is the condition plus the
registry's own stored `roster_snapshot` — a human wanting the actual live diff runs `conmuta project
sync-roster` (PR-07), which reads the live file.
- [x] 4a.1 RED/GREEN: add `"roster_drift"` to `ConditionName` and `CONDITION_CONTRACTS` (zero fields);
      round-trip, daemon-scope-refusal, and zero-detail-contract tests in `conditions-store.test.ts`.
- [x] 4a.2 RED/GREEN: `routes.ts`'s `POST /session` handler calls `raiseCondition` on mismatch,
      `clearCondition` on match; regression tests in `routes.test.ts` for both paths.
- [x] 4a.3 Verify: `npm run build && node --test "dist/test/ledger/conditions-store.test.js" "dist/test/daemon/ipc/routes.test.js"`.

**Re-sliced at apply time** (real `server.ts` alone measured 356 lines, confirming the tasks.md-flagged
risk that the combined ≈420 estimate would not fit one 400-line PR): PR-04b (`server.ts`) and PR-04c
(`routes.ts`), mirroring F1's own PR-06/PR-08/PR-09 re-slicing precedent.

#### PR-04b — `daemon/panel/server.ts`
Branch `f3/04b-panel-server` → `main`. Depends: PR-01, PR-03. Size: 356 authored lines (actual: 168 src +
188 test).
Scope: `src/daemon/panel/server.ts`, `test/daemon/panel/server.test.ts`.
Requirements: web-panel "Loopback-only, per-boot-token transport" and "Origin and Host validation" (all
scenarios); the mutation-refusal half of "Read-only surface, two screens only".
Runtime harness: real `node:http` listener over loopback, mirrors `daemon/ipc/server.test.ts`.

- [x] 4b.1 RED: `server.test.ts` — binds `127.0.0.1` only; token via header AND query param; missing/
      invalid token refused; foreign Host/Origin refused; absent/matching Origin admitted;
      mutation-shaped request (`POST`, any non-GET, or an unknown path) answers 404/405 with zero
      side effects; a throwing handler answers 500 without crashing the listener.
- [x] 4b.2 GREEN: implement `createPanelServer`, reusing `checkTransportGuards` with
      `requireOrigin: true` and `PanelTokenStore`. Route dispatch is GET-only, mirroring
      `ipc/server.ts`'s own `"<METHOD> <pathname>"` key; every response (success or refusal) closes the
      connection (`Connection: close`) since panel traffic is low-volume, human-driven browsing with no
      keep-alive use case — simpler than draining a GET body no browser sends.
- [x] 4b.3 Verify: `npm run build && node --test "dist/test/daemon/panel/server.test.js"`.

#### PR-04c — `daemon/panel/routes.ts`
Branch `f3/04c-panel-routes` → `main`. Depends: PR-04b. Size: TBD (implemented next).
Scope: `src/daemon/panel/routes.ts`, `test/daemon/panel/routes.test.ts`.
Requirements: web-panel "Read-only surface, two screens only" (Home/Overview scenarios, roster-drift
display) and "No runtime filesystem reads for panel assets" (all scenarios).
Runtime harness: real `node:http` listener via `createPanelServer`, mirrors PR-04b's own pattern.

- [x] 4c.1 RED: `routes.test.ts` — Home screen renders daemon facts; Overview table renders bindings
      including a `roster_drift` condition (PR-04a) and the registry's own stored `roster_snapshot`
      (not a live structural diff — the daemon has no live roster to diff against; see PR-04a's
      disclosure), with no mutation control rendered anywhere; a hostile registry string cannot inject
      markup (HTML-escaping — not spec-enumerated, but required by AGENTS.md's global security rule).
- [x] 4c.2 GREEN: implement the two route handlers as read-only registry/ledger queries; panel assets
      (HTML/CSS/JS) as in-memory string constants, never `node:fs` reads. Fields per OVERVIEW.md §10.2's
      "Control panel"/"Overview table" rows (pid, uptime, last poll per bot, conditions per binding for
      Home; bot/bot id/group/group id/project/roster/open-threads/needs-action/last-poll/conditions per
      binding for Overview).
- [x] 4c.3 Verify: `npm run build && node --test "dist/test/daemon/panel/routes.test.js"`.

**Disclosed additions, outside this PR's stated scope line:** `src/daemon/serve/status.ts` gains
`export` on three already-tested private helpers (`listThreadIds`, `readPollerEntry`,
`computeUptimeSeconds`) — zero logic change — so this PR reuses them instead of writing a second copy of
the same reads. 406 authored lines (387 new + 19 in `status.ts`) against a `size:exception` of the
400-line budget: 6 lines over, from the disclosed `status.ts` export change the original estimate did
not anticipate.

### Unit 5 — `daemon/bootstrap.ts` (own-slice)

#### PR-05 — Mount the panel listener
Branch `f3/05-bootstrap-panel` → `main`. Depends: PR-03, PR-04a, PR-04b, PR-04c. Size: 103 authored lines
(actual).
Scope: `src/daemon/bootstrap.ts`, `test/daemon/bootstrap.test.ts`.
Requirements: design's bootstrap File Change row — `startDaemon` creates the panel listener and
`PanelTokenStore` alongside the existing IPC server; `stop()` calls `panelServer.close()` and deletes
`run/panel.json`. **Correction to design's own citation**: design.md claims the startup `catch` block
ALSO calls `deleteRunFile` for the existing `ipcServer` ("mirroring the existing
`ipcServer.close()`/`deleteRunFile` handling at bootstrap.ts:300-325") — the real code at that range only
calls `ipcServer.close()` in the catch block; `deleteRunFile` runs only in `stop()`. This PR mirrors the
REAL precedent (parity with `ipcServer`, not the stale citation): the catch block closes `panelServer`
only, accepting the same pre-existing, harmless asymmetry (an orphaned run file with a dead `pid`
self-invalidates via `readPanelRunFile`'s own `isProcessAlive` check).
Runtime harness: existing `bootstrap.test.ts` real-daemon-boot pattern.

- [x] 5.1 RED: extend `bootstrap.test.ts` — panel listener is bound after boot, reachable with its own
      token, on a distinct port from the IPC listener; `stop()` closes it and deletes `run/panel.json`;
      a boot failure after the panel listener starts (injected via a `secretStore.kind` getter that
      throws — first read while building `routesDeps`, well after the panel listener is up) closes the
      panel listener too.
- [x] 5.2 GREEN: wire `createPanelServer`/`PanelTokenStore`/`writePanelRunFile` into `startDaemon`,
      mirroring the existing `ipcServer`/`writeRunFile` composition (simpler here: the panel's routes
      need no per-boot secret, so the full handler map is built up front, no mutable-object indirection);
      add the symmetric cleanup calls to `stop()` and the catch block. `DaemonInstance` gains `panelPort`
      and `panelRunFile`, mirroring `port`/`runFile`.
- [x] 5.3 Verify: `npm run build && node --test "dist/test/daemon/bootstrap.test.js"`.

**Disclosed correction, outside this PR's stated scope line:** `test/security/daemon-bundle.test.ts`'s
`node:fs` allow-list (PT-28) needed `daemon/panel/panel-run-file.js` added — predicted by Alpha's own
PR-03 audit note ("once bootstrap.ts wires it in"). The `transport/*` reverse-import-graph check needed
no change: PR-02's `http-guards` exemption (by imported-module name, not by importer) already covers
`panel/server.ts`'s own `checkTransportGuards` import.

### Unit 6 — `conmuta panel` CLI verb

#### PR-06 — `cli/panel.ts` + `cli/main.ts` dispatch
Branch `f3/06-cli-panel` → `main`. Depends: PR-05. Size: ≈160 lines (est.).
Scope: `src/cli/panel.ts`, `src/cli/main.ts` (dispatch + `USAGE_LINES`), `test/cli/panel.test.ts`,
`test/cli/main.test.ts` (extended).
Requirements: design's "print the one-time URL" flow, reading `run/panel.json`.
Runtime harness: spawns the real CLI, mirrors `test/cli/daemon-stop.test.ts`.

- [x] 6.1 RED: `panel.test.ts` — prints `http://127.0.0.1:<port>/?token=<token>` when the daemon is
      running; a clear error when it is not.
- [x] 6.2 GREEN: implement `runPanelCommand`, reading `run/panel.json`.
- [x] 6.3 RED/GREEN: extend `main.test.ts`/`main.ts` with the `panel` dispatch entry and its
      `USAGE_LINES` row.
- [x] 6.4 Verify: `npm run build && node --test "dist/test/cli/panel.test.js" "dist/test/cli/main.test.js"`.

### Unit 7 — Roster sync

#### PR-07 — `cli/project-sync-roster.ts` + `registry-commit.ts` + dispatch
Branch `f3/07-sync-roster` → `main`. Depends: none (parallel to Units 1-6). Size: ≈380 lines (est.).
Scope: `src/cli/project-sync-roster.ts`, `src/installer/registry-commit.ts` (add `"ROSTER_SYNCED"`),
`src/cli/main.ts` (dispatch + `USAGE_LINES`), `test/cli/project-sync-roster.test.ts`,
`test/installer/registry-commit.test.ts` (extended).
Requirements: roster-sync (all 8 scenarios — no-drift, drift+confirm, decline, unbound, invalid file,
atomic commit, failed-commit leaves no partial state, heartbeat-ticks-never-trigger).
Runtime harness: spawns the real CLI, mirrors `test/cli/daemon-stop.test.ts`; the heartbeat-tick
scenario reuses `bootstrap.test.ts`'s injected-clock harness.

- [x] 7.1 RED: extend `registry-commit.test.ts` for the new `"ROSTER_SYNCED"` reason (committed case,
      commit-failed leaves no partial state — reuses the module's existing `afterRename` test seam).
- [x] 7.2 GREEN: add `"ROSTER_SYNCED"` to `RegistryCommitReason`.
- [x] 7.3 RED: `project-sync-roster.test.ts` — no-drift no-write; drift shown before commit; unbound
      project refused; missing/invalid `conmuta.json` refused (PT-05/PT-06 reuse); operator decline
      produces no write/no audit row.
- [x] 7.4 GREEN: implement `runSyncRosterCommand` (read `conmuta.json` + registry, diff, confirm,
      `commitRegistryChange`).
- [x] 7.5 RED/GREEN: extend `main.test.ts`/`main.ts` with the `project sync-roster` dispatch entry.
- [x] 7.6 RED: add the heartbeat-tick scenario to `bootstrap.test.ts` (N ticks, no `sync-roster`
      invocation, `roster_snapshot`/`roster_hash` unchanged) — pins D-07's "never auto-resolved".
- [x] 7.7 Verify: `npm run build && node --test "dist/test/cli/project-sync-roster.test.js" "dist/test/installer/registry-commit.test.js" "dist/test/cli/main.test.js" "dist/test/daemon/bootstrap.test.js"`.

### Unit 8 — Version observability

#### PR-08 — `WIRE_VERSION` + `renderMessageHtml`
Branch `f3/08-wire-version` → `main`. Depends: none (parallel to Units 1-7). Size: ≈110 lines (est.).
Scope: `src/shared/version.ts`, `src/shared/envelope.ts`, `test/shared/version.test.ts` (extended),
`test/shared/envelope.test.ts` (extended).
Requirements: version-observability (both requirements, both scenarios).
Runtime harness: N/A — pure function tests.

- [ ] 8.1 RED: extend `version.test.ts` — `WIRE_VERSION` matches `PROTOCOL_SENTINEL`'s digits.
- [ ] 8.2 GREEN: export `WIRE_VERSION` from `shared/version.ts`.
- [ ] 8.3 RED: extend `envelope.test.ts` — `renderMessageHtml`'s output contains both versions inside
      the `<b>...</b>` line and neither inside the `<blockquote expandable>` line; `encodeEnvelope`'s
      byte output is unchanged before/after.
- [ ] 8.4 GREEN: update `renderMessageHtml`'s `<b>` line composition to include both versions; leave
      `renderHeader`/`encodeEnvelope` untouched.
- [ ] 8.5 Verify: `npm run build && node --test "dist/test/shared/version.test.js" "dist/test/shared/envelope.test.js"`.

### Unit 9 — Static assertions and documentation close-out

#### PR-09 — Bundle assertion + THREAT-MODEL close-out
Branch `f3/09-static-close` → `main`. Depends: PR-04, PR-06, PR-07. Size: ≈120 lines (est.).
Scope: `test/security/daemon-bundle.test.ts` (assertion only, no allow-list change),
`docs/02-architecture/THREAT-MODEL.md` (T18/PT-29 rows), `docs/06-backlog/CHECKLIST.md` (B-14 closure).
Requirements: web-panel "no `node:fs` reference" scenario (as a bundle-wide assertion, not just a
unit test); THREAT-MODEL documentation for the panel's own local-process-integration boundary.
Runtime harness: N/A — static analysis over the compiled bundle.

- [ ] 9.1 RED: extend `daemon-bundle.test.ts` asserting no `daemon/panel/*.js` file appears in the
      `node:fs` reference list (the existing 7-file list itself stays byte-identical).
- [ ] 9.2 GREEN: fix any accidental `node:fs` import the panel modules picked up, if the RED test
      catches one; otherwise this task is a no-op confirmation.
- [ ] 9.3 Update THREAT-MODEL.md T18/PT-29 rows to cite the panel's real shipped mitigations
      (`http-guards.ts`, `PanelTokenStore`, `panel-run-file.ts`).
- [ ] 9.4 Close B-14 in CHECKLIST.md, citing the merged PRs.
- [ ] 9.5 Verify: `npm run build && npm test && npm run test:static`.
