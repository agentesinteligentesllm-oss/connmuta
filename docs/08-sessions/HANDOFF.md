# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.
>
> **Reading order for a zero-context session:** §0 → §1 → §2 → §5. Then §3 (pins), §4 (traps),
> §6 (do not redo) and §7 (open points) as the task needs, and §8 for the environment.

---

## §0 — Quick start

**Plan settled — do not re-open it.** The Arena Orion debate arena (`http://127.0.0.1:8766/mcp`) is
**not available**: assume it stays down, so **no slice is audited by the tribunal and nothing may wait
for a debate**. The Pi-native SDD preflight gate is also closed and only a human can open it (§2), so
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. Session 30
merged **PR-30** (the identity handshake and per-session bearer, continuing unit 9 `ipc-handshake`) with
both blind judges, a separate independent verifier, and **both** re-judgments of the budget — the route
§2 describes is the one that produced it.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-31 (`src/daemon/ipc/routes.ts`, cierra la unidad 9 `ipc-handshake`): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + Judgment Day con ambos jueces + verificador independiente); la Arena no está disponible, así que nada depende de un debate ni de la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** (session 30 deleted its `odd/` tree). The status command must print
`nextRecommended: apply`, `completed: 153`, `pending: 57` (of `210`), `blockedReasons: []`. Anything else:
stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count
yourself with `grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 153).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-30** (PR-30 merged as PR #34, `849b72e`; candidate `3f289c2`, corrections `4662654`/`33fd30c`, record tip `a467c7e`). **Unit 9 `ipc-handshake` closes with PR-31.** **Next slice: PR-31** — `src/daemon/ipc/routes.ts` (`POST`/`DELETE /session` routing, binding snapshot freeze-and-compare, roster-hash drift, `toTelegramErrorPayload`; design §10, D-07). | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | **45 PR blocks / 42 row ids** in `tasks.md`. Complete: **36 blocks / 31 row ids** (`PR-01…PR-30`). Remaining: **9 blocks / 11 row ids** (`PR-31…PR-42`). Checkboxes: **153 of 210**. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **153/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | `src/shared/*` (15 modules, `ipc-contract.ts` now carries the disclosed `IPC_HANDSHAKE_FLOOD` extension), `src/cli/*`, `src/registry/*`, `src/ledger/*` (11), `src/secret-store/*` (5), `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts`, `src/daemon/lifecycle/*` (4), `src/daemon/transport/*` (5), `src/daemon/serve/*` (3), `src/daemon/send/*` (3), `src/daemon/ipc/{server,handshake,sessions}.ts`, all with twins — **869 tests** (868 pass, 1 skip), `test:static` **8/8** | PRs `#1`–`#34` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **23 entries** (PR-30 is new code, no v1 range, same as PR-29). | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-30**, one record each in the tribunal index. PR-23..PR-30: Judgment Day with **both judges** + independent verifier, all **APPROVED** (`bus-v2-f1-pr-2{3..9}-audit-001`, `bus-v2-f1-pr-30-audit-001`). PR-22a/22b: inline passes (the judges were down then). PR-30 used **both** re-judgments of its budget — see §6 for what each round found. | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused before
the child launches (`SDD preflight cancelled or invalid; no session consent recorded`) — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line budget
with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` envelope exists. One variant: if a human has already run `/gentle:sdd-preflight` in the TUI,
or the Director asks, the slice may run through `sdd-apply`.

**2. The per-slice pipeline sessions 27–30 ran — repeat it exactly.**
1. **Map** once (delegated `Explore`, read-only): v1 range (if any), consumed APIs with verbatim signatures, DDL,
   spec, design, the tasks block, and every contradiction between them.
2. **Decide** the open design points yourself (the Director delegated them) and write them into the writer's brief;
   each decision is stated in the module doc and in `apply-progress.md`, and a `tasks.md` *apply-time note* records the
   decisions and any edit outside the block's Scope line.
3. **Write** (delegated `general-purpose`, sonnet): src + twin (+ PT cells only if the block has a Docs task — PR-31's
   does not). The writer does not commit. **Insist on RED first** and ask for the verbatim RED lines.
4. **Parent readback** of the source before freezing — it found a defect in every slice since session 28 (PR-30: a
   missing/malformed `nonce` fell through the server's generic 500 instead of a proper 400).
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only control that
   MUST survive, BUILD-FAIL and TIMEOUT reported apart. A survivor is a test gap → pin it (that is the behavioural RED);
   an **equivalent** mutant is argued in the record, not pinned; a mutant the suite **cannot observe** is recorded as
   such, not called equivalent. **PR-30's sweep found four real survivors this way** (single-use nonce consumption
   untested, a TTL boundary untested, a tautological test oracle, an unguarded constant-time length check) — read
   `apply-progress.md` §PR-30 for the exact pattern before assuming your own sweep is clean.
6. Full suite + `test:static` from a clean `dist/`; `git add -N` **new files only, never `git add -N .`** (PR-30
   session briefly intent-to-added the untracked `odd/` tree this way — caught before commit, see §6); measure
   `git diff --numstat main -- src test`; commit code **with** its records (`tasks.md` ticks + size reconciliation +
   apply-time note, `apply-progress.md` section).
7. **Judgment Day**: frozen worktree, `jd-judge-a` + `jd-judge-b` in parallel, result shape `{findings, evidence}`.
   In parallel, a **separate independent verifier** (`general-purpose`) on its own worktree with a mandate to
   reproduce every figure, re-run the sweeps, write up to six extra mutants and **probe the running code** — it found real
   gaps in every slice (PR-30: three of six new mutants survived). **The judges have no Bash**: they check figures by
   reading and arithmetic only; the verifier is the one that re-measures.
8. Reproduce single-judge rows before correcting; correct (parent inline for small batches); commit code and record
   together; scoped re-judgment over the delta only. **Budget: two re-judgments**; PR-30 used both — its first
   re-judgment found **both judges independently** reached a *new* finding about the round-1 fix itself (a rewritten
   JSDoc claimed a property the rewritten code didn't fully have), which the second re-judgment closed. **Re-read a
   round's own correction as closely as the original candidate — a fix can introduce exactly the class of defect it
   was meant to close.**
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude Code line);
   `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Get the untracked inventory with `gentle-ai review status --cwd . --contract
gentle-ai.review-integration/v2 --agent claude-code --next-transition` (field `eligible_untracked_inventory`), then run
`gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha> --committed-only --untracked-scope=exclude
--expected-untracked-inventory=<that sha256:…> --json` and record tier and `review_due`. **Do not START the native review
for a Judgment Day target**: the installed `judgment-day` skill states it replaces ordinary 4R and both must never run on
one target, and START's consent envelope belongs to the Director. Record that in the slice's audit row.

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those.
**PR-31's own block has no Docs task** (unlike PR-30's 30.6) — its scope line names only `routes.ts` + its twin, and
its Requirements line traces to three spec requirements with no PT id attached to any of them. Do not invent a Docs
task; if the mapper finds a PT id this slice genuinely pins, record that reading in the apply-time note rather than
silently adding or silently skipping a cell edit.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip and
labelled with it. PR-27 1,493 (1,093), PR-28 1,285 (885), PR-29 1,609 (1,209), **PR-30 619 at its final tip** (219-line
exception, grown from the candidate's 540 across two Judgment Day correction rounds) — every estimate priced only the
sources; a real-listener harness or, for PR-30, JSDoc density plus sweep-driven pinning tests, is most of the overrun.
PR-31 is estimated **≈390 lines**; expect it to land higher once the six scenarios in task 31.1 are actually written
out. Add a *Size reconciliation* note under the block's header in `tasks.md` (gate text left as written).

**6. Frozen worktrees — the junction rule (session 28 incident, followed cleanly in 29 and 30).** `git worktree add
--detach ../telegram_bus_agent-worktrees/<name> <sha>`. Only the verifier's worktree needs `node_modules`: create the
junction with PowerShell `New-Item -ItemType Junction -Path '<win path>\node_modules' -Target '<main win path>\node_modules'`.
**To remove: delete the junction first with PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`,
verify it is gone (`test -e … || echo removed`) and that `node_modules/typescript/lib/tsc.js` still exists in the main
checkout, and only then `git worktree remove --force`.** `git worktree remove --force` follows a live junction and
empties the main `node_modules`; if that happens, `npm ci` restores it exactly from the shrinkwrap. Session 30 followed
the rule for both its worktrees (`pr30-judges`, `pr30-verify`) without incident.

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

---

## §3 — Pinned provenance values (re-verify with your own method; never trust a header blindly)

Rule: the pinned value is the exact byte range of the cited v1 lines **LF-normalized, including the terminating
newline** (`bus-v2-f1-pr-04-001`). Multi-range: ranges concatenated in the cited order, each with its newline
(PR-22a). Whole file: bare v1 path, all lines. Validate your method first by reproducing a known value, e.g.
`git show bf8f365:src/tools/fetch.ts | tr -d '\r' | sed -n '404,460p;525,656p' | sha256sum` → `3bd09d0d…`.

| v2 path | v1 source @ `bf8f365` | verdict | v1 body sha256 |
|---|---|---|---|
| `src/daemon/admission.ts` | `src/tools/fetch.ts:404-460,525-656` | SEAM | `3bd09d0d0291dcf7fe88a90eedcef1e5c1496cf4ea7a4c3b670aad3675c73192` |
| `src/daemon/send/validate.ts` | `src/tools/send.ts:113-192,205-378` | SEAM | `771f968e37a1897e7ecb3e277bacb294c30375b1018f30be8e9ce6cb4e1ca423` |
| `src/daemon/send/send-path.ts` | `src/tools/send.ts:380-660` | SEAM | `25926e38a82e8c12138015a9cdaac7320a9098e4b5726f5d868b8aae1fbb804b` |

**PR-31** (`daemon/ipc/routes.ts`) is **new code**, same reasoning as PR-29/PR-30: design §12 has no v1 row for any
`ipc/*` module (v1 had no local daemon and no HTTP surface at all) — confirm while mapping, but do not expect a
different answer. A new module must not spell `Provenance:` in its leading block (B-33). Older pins are in
`apply-progress.md` and in each module's header. SEAM pins are **not machine-checked** by `provenance.test.ts` (B-42).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **What PR-30 gives PR-31** | `src/daemon/ipc/handshake.ts`: `computeIdentityProof(secret, nonce)`; `PendingHandshakeStore` (`issue(): string \| undefined`, `consume(nonce): boolean`, `.size` getter, lazy-TTL, `MAX_PENDING_HANDSHAKES`-bounded); `createIdentityHandler(deps)` — already registered for `GET /identity`, PR-31 does not touch it. `src/daemon/ipc/sessions.ts`: `computeSessionProof(secret, serverNonce)`; `SessionStore` (`mint(serverNonce, claimedHmac): string \| undefined` — verifies the HMAC constant-time, refuses at `MAX_ACTIVE_SESSIONS` capacity without distinguishing why, **does not itself consume the nonce** — PR-31's `routes.ts` must call `PendingHandshakeStore.consume` first and only call `mint` if that returned `true`; `validate(bearer): boolean` — O(N) constant-time scan, **has no revoke/delete method at all** (Judgment Day found this twice; deliberately deferred to PR-31 — see next row). Neither module registers `POST`/`DELETE /session` or any `/tools/*` route; that's entirely PR-31's job via `createIpcServer`'s `handlers` map. | `src/daemon/ipc/{handshake,sessions}.ts` |
| **`SessionStore` has no revocation — PR-31 must decide whether to add one** | `DELETE /session` is a fixed route (design §10) but its response contract (`{closed: true}`, `sessionCloseResponseSchema`) has been **provisional** since PR-29 and no spec scenario names its daemon-side behaviour. `SessionStore.mint`/`.validate` give PR-31 nothing to revoke a single bearer early with — only the whole store going away on daemon restart invalidates anything. Judgment Day flagged this as a real, disclosed gap in PR-30 (both judges, `JD-A-001`/`JD-B-002`) and it was deliberately left open rather than speculatively designed. Decide and implement (or explicitly defer again with a fresh reason) — do not silently ignore it. | `apply-progress.md` §PR-30, `bus-v2-f1-pr-30-audit-001` |
| **Possible scope ambiguity in task 31.1, unresolved — read spec.md yourself before writing the RED test** | Task 31.1 asks for "version-skew/transport-failure scenarios (`DAEMON_VERSION_MISMATCH`, `IPC_ERROR`)" as part of `routes.test.ts` (daemon-side). But spec.md's own scenarios for both codes are phrased client-side: `DAEMON_VERSION_MISMATCH` — "a daemon whose `GET /identity` reply carries a `build` different from the client's `SERVER_VERSION`... **the client** compares the two... **it** returns `DAEMON_VERSION_MISMATCH`... never proceeds to `POST /session`" (i.e. the client never even reaches `routes.ts`); `IPC_ERROR` — "**the client** surfaces `IPC_ERROR` marked retryable" after a transport failure at the HTTP layer, not a daemon-raised code at all. This may be the same class of daemon/client scope split PR-30's mapping found for `DAEMON_IDENTITY_MISMATCH` (resolved in `tasks.md`'s PR-30 apply-time note, decision 1) — map it explicitly before writing 31.1's RED test rather than assuming the task list's phrasing is daemon-side. | `specs/ipc-handshake/spec.md` (the two scenarios after "Roster hash mismatch raises a condition"), `tasks.md` PR-30 apply-time note decision 1 (the precedent) |
| **Nonce TTL without timers** | `HANDSHAKE_NONCE_TTL_SECONDS` and `MAX_PENDING_HANDSHAKES` hold **without a timer** (autonomy boundary: no timers that emit); `PendingHandshakeStore` expires pending nonces lazily on `issue`/`consume`/`.size` access with an injected `now()` — already built, PR-31 just calls `consume`, it does not need to re-implement this. | `src/daemon/ipc/handshake.ts` |
| **`MAX_ACTIVE_SESSIONS`'s ceiling does not self-heal** | Unlike `MAX_PENDING_HANDSHAKES` (TTL-swept), a session bearer lives until the daemon restarts or is explicitly revoked. Once `MAX_ACTIVE_SESSIONS` (=64, reusing the same conservative number) live bearers accumulate in one boot, `mint()` refuses every subsequent session for the rest of that boot. Judgment Day sharpened this into the constants.ts doc comment (`JD-A-001`'s round-1 re-judgment) rather than fixing it — worth weighing when you decide the revocation question above. | `src/shared/constants.ts` (`MAX_ACTIVE_SESSIONS`) |
| **Sweep harness needs bounds** | A mutant that breaks a network path leaves test clients waiting forever: run tests with `--test-timeout=5000` and `spawnSync(process.execPath, …, { timeout: 150000 })` **without a shell** (with `shell: true` the kill reaches `cmd.exe`, not `node`). Report `KILLED(TIMEOUT)` apart. Every socket-waiting test needs its own timeout too. | sessions 29–30 |
| **`git add -N` — scope it, never `.`** | Session 30 ran `git add -N .` once to measure a diff and it briefly intent-to-added the untracked `odd/` scratch tree alongside the real new files — caught immediately by `git status` before any commit, unstaged with `git reset odd/`. Always name the specific new files. | session 30 |
| **Node HTTP facts** | An HTTP/1.1 request with no `Host` line is refused by Node's parser (bare 400) before any handler; duplicate/negative/garbage `Content-Length` and `Transfer-Encoding` + `Content-Length` are refused the same way; `fetch` cannot set `Host` (use `node:http` or `net`); a client still writing past a refusal may get a reset instead of the response. | PR-29 record |
| **A writer's RED is usually compile-level** (`TS2305`/`TS2307`). | The behavioural RED is the parent's: readback fixes and sweep survivors, each pinned by a test that fails without the fix. | sessions 27–30 |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; it builds via `node_modules/typescript/lib/tsc.js -b` directly (not `npx`, avoids a shell), restores the file and checks its sha256. Lives in the untracked `odd/` tree (deleted at close): recreate it (≈55 lines) **with the bounds above**. Use a replacer function (`s.replace(from, () => to)`): a `$` + backtick in a replacement string is a special pattern. `&& false` mutants fail to build under TS narrowing — use a runtime-opaque condition. After a source edit, re-anchor mutants whose `from` moved — PR-30 needed this twice in one session (`M5` in `sessions.ts` after its own `validate()` rewrite, twice). | sessions 28–30 |
| **The AS-IS transports lose error detail** | `GroupTransport` turns a guard refusal or a 429 into a soft `{ok: false, code}`; `DualWriteTransport` drops a DM error's cause. Send-side checks run before the call or through the ledger. | PR-27, PR-28 |
| **`offsets.retry_after_until` is shared** | Per `bot_id`, written by the poller and by `send/rate.ts`; the poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring anything. | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | An async callback is refused before `BEGIN`; do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). `roster_drift` (D-07, this slice's own requirement) **does** already exist in `conditions-store.ts`'s four accepted names — confirm before assuming you need to extend it. | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId` in `serve/fetch.ts`, `serve/status.ts` (and `serve/thread.ts`). Extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status` (§2.3). | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key>` (sessions 29–30 used it throughout). | sessions 27–30 |
| **Subagents were available all of sessions 27–30** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits (global rule); PR bodies end with the Claude Code line. Write long messages to a file and use `git commit -F`. | sessions 27–30 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header** | A non-vendored module must not spell `Provenance:` there; a module doc belongs in the leading block, before the imports. | **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files (named explicitly — see the row above) before `test:static`. | PR-09b… |
| **PT-22's token shape** | Synthetic bot ids use seven digits (`1234567:${"A".repeat(35)}`); no fixture may match `\d{8,10}:[A-Za-z0-9_-]{35}`. | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means **no limit**; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines truncate silently** | Write files with the file tools or Python; verify line counts. | sessions 13–21 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`state.yaml` is YAML** | Parse (or at least run `gentle-ai sdd-status` and check `taskProgress`) after editing; `tribunal_state` appears in several phases — edit the `apply:` one; keep `next_recommended` current. | sessions 28–30 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–30 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run (it did once during PR-30's round-1 correction, clean on re-run; it did **not** reproduce at all during PR-30's candidate or round-2 verification runs). Re-run once and record. PR-23..PR-30 were green on CI at the first run. | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 153/210. Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4, `tasks.md`'s
   **PR-31 block**, `specs/ipc-handshake/spec.md`'s three requirements this slice implements — "Session binds one
   project and freezes for its lifetime", "Roster hash detects drift without auto-resolving it" (D-07), "Client error
   taxonomy for handshake and session failures" (read the **scope note** in §4 before trusting task 31.1's daemon-side
   framing of the last one) — design **§10 "IPC"** (sequence diagram, rule table rows: Freeze, Unbound, plus the client
   error taxonomy table) and D-07 in design §18.
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram mirror
   `odd/<feature>/tasks`, before the first write. PR-31 **closes unit 9** — this is the last slice of that unit; after
   it merges, unit 10 `thin-client-tools` opens with PR-32.
3. **Branch** `f1/31-ipc-routes` from `main`, then run §2.2's pipeline:
   - **31.1 RED** `test/daemon/ipc/routes.test.ts`: "unbound project refused at session start"
     (no active registry binding → distinct error, no session minted), "binding never changes mid-session" (a
     hot-reloaded registry binding does not affect an already-open session), "roster hash mismatch raises a
     condition, not a failure" (`roster_drift`, admits the session), "live binding drift is refused per call"
     (`BINDING_CHANGED`, `HTTP_CONFLICT`, one audit row, nothing sent), "session refused when the project file's
     group disagrees with the binding" (`BINDING_MISMATCH`, registry invariant R4), and the version-skew/transport-
     failure pair — **map these last two against the scope note in §4 before writing them as daemon-side tests.**
   - **31.2 GREEN** `src/daemon/ipc/routes.ts`: `POST /session` (resolve `project_id` via the registry, call
     `PendingHandshakeStore.consume` then `SessionStore.mint` in that order, freeze the binding snapshot,
     roster-hash compare → `roster_drift` condition), `DELETE /session` (decide the revocation question in §4's
     second row first), `/tools/*` routing (dispatch to the four tool handlers, comparing the live binding against
     the frozen snapshot on every call → `BINDING_CHANGED` on drift), `toTelegramErrorPayload` consuming
     `daemon/telegram.ts` (PR-19) for the pass-through v1 tool/Telegram codes.
   - **31.3 Verify**: `npm run build && node --test "dist/test/daemon/ipc/routes.test.js"`.
   - Runtime harness: in-process daemon over a real registry temp file (PR-09's loader).
4. Audit per §2.2 steps 7–9; merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s status line,
   `state.yaml` (counts, `completed_slices`, `tribunal_debate`, `tribunal_state`, `next_recommended`; check with
   `gentle-ai sdd-status`) and the `00-INDEX.md` board if the backlog grew, delete `odd/`, save the session summary to
   Engram, commit on `main`, push, and hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text.
- **PR-01…PR-30 are complete; do not re-slice, re-audit or re-open them.** Units 4–8 are closed; unit 9 closes with
  PR-31. A defect in a merged module is its own slice with its own audit, not a drive-by edit (B-43, B-44, B-45, B-48
  wait for such slices).
- Settled in session 30 and recorded: `daemon/ipc/handshake.ts` owns `GET /identity` and `PendingHandshakeStore`
  (single-use `server_nonce`, lazy TTL); `daemon/ipc/sessions.ts` owns the `"session:"` HMAC verification and the
  memory-only bearer store, imports nothing from `handshake.ts`, registers no HTTP route, and does not itself consume
  a nonce — the caller (PR-31) sequences `consume` then `mint`. `DAEMON_IDENTITY_MISMATCH` is exclusively client-side
  vocabulary (PR-33), never raised by the daemon. `SessionStore.validate` is an unconditional O(N) scan (no early
  return) by design — a property enforced by code review, not a regression test, because an early-return version is
  functionally identical on every input.
- Settled in session 29: the five `HTTP_*` names plus (as of session 30) seven transport/handler-raised statuses live
  in `ipc-contract.ts`; the server's six `IPC_*` refusal codes are daemon transport vocabulary, `IPC_HANDSHAKE_FLOOD`
  (session 30) is a disclosed 7th, handler-raised and retryable; the server validates no route body and checks no
  bearer.
- Settled in session 28: the send tool's rate code is `RATE_LIMITED` (B-46 only asks to amend design §9's text); the
  send path pre-checks the room with `RoomGuardClient.assertTarget`; a 429 reaches the send path through
  `offsets.retry_after_until`; `BindingMutex` and `SendRateBudget` are one instance per daemon (PR-31 wires them).
- Provenance hash rule, registry and range conventions are ratified — §3.
- Doc-hygiene rule: never quote a matched-and-rejected secret-shaped literal in `apply-progress.md`.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a decision.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`. TypeScript 7.0.2 needs `"types": ["node"]`.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-48** | Design §15's PT-24/PT-26 file pins (`daemon/ipc/server`, `client/handshake`) look stale against the later `ipc/{handshake,sessions,routes}` split PR-30 introduced. Text-only fix at the next design touch. | Director |
| **B-47** | THREAT-MODEL traces the IPC `Host` check (DNS rebinding) only to the F3 panel (T18, PT-29) and no PT pins the body cap; PR-29 ships both with tests. Text-only fix at the next THREAT-MODEL touch. | Director |
| **B-45** | The poller writes `TELEGRAM_RATE_LIMITED` to `offsets.last_error_code` (DATA-MODEL says `RATE_LIMITED`), audits no 429, and clears `retry_after_until` on every successful poll — which can erase a send-side backoff early. The one open point with runtime effect. | Director → Kairo |
| **B-46** | Design §9 names the rate refusal `TELEGRAM_RATE_LIMITED`; the shipped tool code is `RATE_LIMITED`. Text-only amendment. | Director |
| **B-44** | A room-guard refusal inside a misbuilt transport degrades the send and raises `group_outage` instead of `WRONG_ROOM`. | Director |
| **B-43** | `serve/thread.ts:204` still tells the agent to run `agentbus_fetch`; `admission.ts`'s header points at a fixture that carries no hash. | Director → Kairo |
| **B-42** | SEAM `v1 body sha256` pins are not machine-checked (the v1 checkout is not in CI). | Director |
| **B-40 / B-41** | Design conditions with no contract (`poller_conflict`/`poller_rate_limited`; `secret_store_fallback`). | Director |
| B-39 | CI (and local runs) intermittently red on two wall-clock tests; re-run once and record. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1. | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| PR-11/12/13 escalations | SUGGESTION-class rows that survived their second rounds. Nothing blocks. | Director |
| carried (PR-06) | Digest blind spots (`MAX_THREAD_HISTORY` saturation); the fence does not neutralise `&`. | Director |
| **`SessionStore` revocation** | No `DELETE /session` primitive exists yet (PR-30, disclosed, see §4). PR-31 must decide and implement, or explicitly re-defer with a fresh reason. | PR-31 (this slice) |
| B-16 / D-10, B-11, B-12 / B-13 | Licence files and copyright line; trademark screening; macOS scope; migration runbook (PR-38). | Director |
| B-05, B-08, B-09 | F0 spikes still open (B-08 — IPC handshake and named-pipe DACL on Windows — is unit 9's background, closing with PR-31). | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI, TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **869 tests** (868 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- Verification worktrees: `../telegram_bus_agent-worktrees/` — **empty** at the end of session 30 (`pr30-judges`,
  `pr30-verify` both removed cleanly via the junction-first procedure, §2.6).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 70–100 s per leg).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it).
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down**. Never quote or commit.
