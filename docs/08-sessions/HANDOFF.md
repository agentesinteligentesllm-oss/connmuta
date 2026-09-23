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
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. Session 29
merged **PR-29** (the IPC contract and the loopback HTTP transport, opening unit 9 `ipc-handshake`) with
both blind judges and a separate independent verifier — the route §2 describes is the one that produced it.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-30 (`src/daemon/ipc/handshake.ts` + `src/daemon/ipc/sessions.ts`, unidad 9 `ipc-handshake`): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + Judgment Day con ambos jueces + verificador independiente); la Arena no está disponible, así que nada depende de un debate ni de la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** (session 29 deleted its `odd/` tree). The status command must print
`nextRecommended: apply`, `completed: 147`, `pending: 63` (of `210`), `blockedReasons: []`. Anything else:
stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count
yourself with `grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 147).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-29** (PR-29 merged as PR #33, `f765b43`; code tip `2a08e84`). **Unit 9 `ipc-handshake` is open** (PR-29 done; PR-30, PR-31 remain). **Next slice: PR-30** — `src/daemon/ipc/handshake.ts` + `src/daemon/ipc/sessions.ts` (`GET /identity` with the HMAC proof, the per-session bearer minted at `POST /session`, per-boot invalidation; D-14, D-04; PT-24, PT-26). | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | **45 PR blocks / 42 row ids** in `tasks.md`. Complete: **35 blocks / 30 row ids** (`PR-01…PR-29`). Remaining: **10 blocks / 12 row ids** (`PR-30…PR-42`). Checkboxes: **147 of 210**. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **147/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | `src/shared/*` (15 modules, **`ipc-contract.ts`** new), `src/cli/*`, `src/registry/*`, `src/ledger/*` (11), `src/secret-store/*` (5), `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts`, `src/daemon/lifecycle/*` (4), `src/daemon/transport/*` (5), `src/daemon/serve/*` (3), `src/daemon/send/*` (3), **`src/daemon/ipc/server.ts`**, all with twins — **858 tests** (857 pass, 1 skip), `test:static` **8/8** | PRs `#1`–`#33` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **23 entries** (PR-29 is new code, no v1 range). | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-29**, one record each in the tribunal index. PR-23..PR-29: Judgment Day with **both judges** + independent verifier, all **APPROVED** (`bus-v2-f1-pr-2{3..9}-audit-001`). PR-22a/22b: inline passes (the judges were down then). | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused before
the child launches (`SDD preflight cancelled or invalid; no session consent recorded`) — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line budget
with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` envelope exists. One variant: if a human has already run `/gentle:sdd-preflight` in the TUI,
or the Director asks, the slice may run through `sdd-apply`.

**2. The per-slice pipeline sessions 27–29 ran — repeat it exactly.**
1. **Map** once (delegated `Explore`, read-only): v1 range (if any), consumed APIs with verbatim signatures, DDL,
   spec, design, the tasks block, and every contradiction between them.
2. **Decide** the open design points yourself (the Director delegated them) and write them into the writer's brief;
   each decision is stated in the module doc and in `apply-progress.md`, and a `tasks.md` *apply-time note* records the
   decisions and any edit outside the block's Scope line.
3. **Write** (delegated `general-purpose`, sonnet): src + twin + fixture entry (+ PT cells when the block has a Docs
   task). The writer does not commit. **Insist on RED first** and ask for the verbatim RED lines (PR-29's writer gave them).
4. **Parent readback** of the source before freezing — it found defects in every slice since session 28 (PR-29: a
   `close()` that rejected on a second call against its own doc, an unserialisable handler body that crashed the process
   through an unhandled rejection, a field described against the wrong DATA-MODEL table).
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only control that
   MUST survive, BUILD-FAIL and TIMEOUT reported apart. A survivor is a test gap → pin it (that is the behavioural RED); an
   **equivalent** mutant is argued in the record, not pinned; a mutant the suite **cannot observe** is recorded as such,
   not called equivalent (PR-29 `R1`, corrected after both judges objected).
6. Full suite + `test:static` from a clean `dist/`; `git add -N` new files; measure `git diff --numstat main -- src test`;
   commit code **with** its records (`tasks.md` ticks + size reconciliation + apply-time note, `apply-progress.md` section).
7. **Judgment Day**: frozen worktree, `jd-judge-a` + `jd-judge-b` in parallel, result shape `{findings, evidence}`.
   In parallel, a **separate independent verifier** (`general-purpose`) on its own worktree with a mandate to
   reproduce every figure, re-run the sweeps, write up to six extra mutants and **probe the running code** — it found real
   gaps in every slice (PR-29: five surviving mutants and one WARNING). **The judges have no Bash**: they check figures by
   reading and arithmetic only; the verifier is the one that re-measures.
8. Reproduce single-judge rows before correcting; correct (parent inline for small batches); commit code and record
   together; scoped re-judgment over the delta only. **Budget: two re-judgments**; PR-29 used both (the first re-judgment's
   corrections introduced two new rows of their own).
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude Code line);
   `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Get the untracked inventory with `gentle-ai review status --cwd . --contract
gentle-ai.review-integration/v2 --agent claude-code --next-transition` (field `eligible_untracked_inventory`), then run
`gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha> --committed-only --untracked-scope=exclude
--expected-untracked-inventory=<that sha256:…> --json` and record tier and `review_due`. **Do not START the native review
for a Judgment Day target**: the installed `judgment-day` skill states it replaces ordinary 4R and both must never run on
one target, and START's consent envelope belongs to the Director. Record that in the slice's audit row.

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those. PR-30's
block has **Docs task 30.6: PT-24, PT-26**. Watch the contradiction: design §15's PT map puts PT-24 on
`daemon/ipc/server` and PT-26 on `client/handshake`, while task 30.6 has PR-30 fill both cells with its own tests. Apply
the rule: add PR-30's test file to a cell only for the clause that test really pins (PT-24's "stale-boot bearer → 401, no
side effect" is `sessions.test.ts`; PT-26(c) "wrong HMAC → no bearer" is `handshake.test.ts`; PT-26(a/b) are PR-33's
client-side scenarios). Record the reading in the apply-time note.

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip and
labelled with it. PR-26 1,104 (704), PR-27 1,493 (1,093), PR-28 1,285 (885), **PR-29 1,609 (1,209)** — every estimate
priced only the sources; a real-listener harness (raw sockets, HTTP framing) is most of a test file's weight. Expect PR-30
(≈370 estimated) to land well above it. Add a *Size reconciliation* note under the block's header in `tasks.md` (gate text
left as written).

**6. Frozen worktrees — the junction rule (session 28 incident).** `git worktree add --detach
../telegram_bus_agent-worktrees/<name> <sha>`. Only the verifier's worktree needs `node_modules`: create the junction with
PowerShell `New-Item -ItemType Junction -Path '<win path>\node_modules' -Target '<main win path>\node_modules'`. **To
remove: delete the junction first with PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`, verify it
is gone (`test -e … || echo removed`) and that `node_modules/typescript/lib/tsc.js` still exists in the main checkout,
and only then `git worktree remove --force`.** `git worktree remove --force` follows a live junction and empties the main
`node_modules`; if that happens, `npm ci` restores it exactly from the shrinkwrap. Session 29 followed the rule without
incident.

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

**PR-30** (`daemon/ipc/handshake.ts`, `daemon/ipc/sessions.ts`) is **new code**: design §12 has no v1 row for any
`ipc/*` module (confirmed by PR-29's mapping), so it carries no provenance header and the registry stays at 23 — confirm
while mapping. A new module must not spell `Provenance:` in its leading block (B-33). Older pins are in
`apply-progress.md` and in each module's header. SEAM pins are **not machine-checked** by `provenance.test.ts` (B-42).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **What PR-29 gives PR-30** | `createIpcServer({ handlers, log? })` → `{ listen(): Promise<{port}>, close() }`; `IpcHandler = (req: {route, query: URLSearchParams, headers, body: unknown}) => {status, body}`. The server checks `Host`, route, body cap and JSON only — **handlers must parse with the contract** (`identityRequestQuerySchema`, `sessionRequestSchema`, …, or `requestSchemaFor(route)`) and **check `Authorization` themselves**. Error bodies: `ipcErrorSchema` (`{code, message, retryable, …}`); statuses `HTTP_UNAUTHORIZED`, `HTTP_TOO_MANY_REQUESTS`, … from `shared/ipc-contract.ts`. A handler returning `body: undefined` or throwing becomes a 500. | `src/daemon/ipc/server.ts`, `src/shared/ipc-contract.ts` |
| **The per-boot secret** | `writeRunFile(runDir, port)` in `src/daemon/lifecycle/run-file.ts` mints `secret` (`RUN_SECRET_BYTES`, hex) and returns `{port, pid, secret}` — the handshake keys its HMACs with it (`identity:`/`session:` labels, D-14). The secret never travels and is never a bearer. | design §10 |
| **Nonce TTL without timers** | `HANDSHAKE_NONCE_TTL_SECONDS` and `MAX_PENDING_HANDSHAKES` must hold **without a timer** (autonomy boundary: no timers that emit; a sweep timer would also keep tests alive): expire pending nonces lazily on access with an injected `now()`. | AGENTS.md §3 |
| **`DELETE /session` is provisional** | `{ closed: true }`, no body — no spec scenario names it; PR-31 owns it. | PR-29 apply-time note |
| **Sweep harness needs bounds** | A mutant that breaks a network path leaves test clients waiting forever: run tests with `--test-timeout=5000` and `spawnSync(process.execPath, …, { timeout: 150000 })` **without a shell** (with `shell: true` the kill reaches `cmd.exe`, not `node`). Report `KILLED(TIMEOUT)` apart. Session 29 lost ~20 minutes to one hung mutant before adding both. Every socket-waiting test needs its own timeout too (`JD-A-R2-002`). | session 29 |
| **Node HTTP facts** | An HTTP/1.1 request with no `Host` line is refused by Node's parser (bare 400) before any handler; duplicate/negative/garbage `Content-Length` and `Transfer-Encoding` + `Content-Length` are refused the same way; `fetch` cannot set `Host` (use `node:http` or `net`); a client still writing past a refusal may get a reset instead of the response. | PR-29 record |
| **A writer's RED is usually compile-level** (`TS2307`). | The behavioural RED is the parent's: readback fixes and sweep survivors, each pinned by a test that fails without the fix. | sessions 27–29 |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; it builds with `npx tsc -b`, restores the file and checks its sha256. Lives in the untracked `odd/` tree (deleted at close): recreate it (≈50 lines) **with the bounds above**. Use a replacer function (`s.replace(from, () => to)`): a `$` + backtick in a replacement string is a special pattern (the verifier hit it). `&& false` mutants fail to build under TS narrowing — use a runtime-opaque condition. After a source edit, re-anchor mutants whose `from` moved. | sessions 28–29 |
| **The AS-IS transports lose error detail** | `GroupTransport` turns a guard refusal or a 429 into a soft `{ok: false, code}`; `DualWriteTransport` drops a DM error's cause. Send-side checks run before the call or through the ledger. | PR-27, PR-28 |
| **`offsets.retry_after_until` is shared** | Per `bot_id`, written by the poller and by `send/rate.ts`; the poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring anything. | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | An async callback is refused before `BEGIN`; do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). `conditions-store` accepts four names. File, do not invent. | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId` in `serve/fetch.ts`, `serve/status.ts` (and `serve/thread.ts`). Extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status` (§2.3). | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key>` (session 29 used it throughout). | sessions 27–29 |
| **Subagents were available all of sessions 27–29** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits (global rule); PR bodies end with the Claude Code line. Write long messages to a file and use `git commit -F`. | sessions 27–29 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header** | A non-vendored module must not spell `Provenance:` there; a module doc belongs in the leading block, before the imports. | **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files before `test:static`. | PR-09b… |
| **PT-22's token shape** | Synthetic bot ids use seven digits (`1234567:${"A".repeat(35)}`); no fixture may match `\d{8,10}:[A-Za-z0-9_-]{35}`. | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means **no limit**; scalar `MAX(NULL, x)` is NULL. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines truncate silently** | Write files with the file tools or Python; verify line counts. | sessions 13–21 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`state.yaml` is YAML** | Parse every tracked YAML after editing; `tribunal_state` appears in several phases — edit the `apply:` one; keep `next_recommended` current (session 29 found it still naming PR-26). | sessions 28–29 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–29 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` can fail a run (locally too: session 29's round-2 run); re-run once and record. PR-23..PR-29 were green on CI at the first run. | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 147/210. Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2 and §4, `tasks.md`'s
   **PR-30 block** (and skim PR-31 and PR-33 for what the handshake must serve), `specs/ipc-handshake/spec.md` (the
   requirements "No bearer before identity proof", "Bearer is a per-session token, not the raw per-boot secret", "Secret
   and session rotate per daemon boot"), design **§10 "IPC"** (sequence diagram, rule table: Bearer, 401, Per-boot
   rotation, Flood) and the §3 rows for `RUN_SECRET_BYTES`, `IPC_NONCE_BYTES`, `SESSION_TOKEN_BYTES`,
   `HANDSHAKE_NONCE_TTL_SECONDS`, `MAX_PENDING_HANDSHAKES` (all already in `src/shared/constants.ts`).
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram mirror
   `odd/<feature>/tasks`, before the first write. Unit 9 has PR-30 and PR-31 left (≈760 estimated lines); take what fits,
   closing each slice fully.
3. **Branch** `f1/30-ipc-handshake-sessions` from `main`, then run §2.2's pipeline:
   - **30.1 RED** `test/daemon/ipc/handshake.test.ts`: wrong HMAC yields no bearer; valid HMAC allows the bearer; excess
     pending handshakes refused with `HTTP_TOO_MANY_REQUESTS`, not queued (`MAX_PENDING_HANDSHAKES`). **Open point for the
     mapper:** task 30.1 names `DAEMON_IDENTITY_MISMATCH` ("one re-read, never `DAEMON_DOWN`"), which design §10's taxonomy
     raises on the **client** (PR-33), after it re-reads the run file; on the daemon side a wrong `session:` HMAC simply
     mints nothing. Decide how the daemon-side test states it (e.g. a test client that verifies the proof and refuses) and
     record the reading in the apply-time note.
   - **30.2 GREEN** `src/daemon/ipc/handshake.ts`: `GET /identity` → `{proof: HMAC-SHA256(secret, "identity:"+nonce),
     server_nonce, pid, build: SERVER_VERSION}`; single-use `server_nonce` with lazy TTL expiry.
   - **30.3 RED** `test/daemon/ipc/sessions.test.ts`: session token issued at `POST /session`; the raw per-boot secret is
     rejected as a bearer; a stale-boot bearer is rejected (401, no side effect).
   - **30.4 GREEN** `src/daemon/ipc/sessions.ts`: memory-only `SESSION_TOKEN_BYTES` bearers minted after verifying
     `HMAC-SHA256(secret, "session:"+server_nonce)` with `timingSafeEqual`; invalidated per boot. Binding resolution, R4
     and the freeze are **PR-31's** (`routes.ts`) — keep the session store narrow and say where PR-31 plugs in.
   - **30.5 Verify** `npm run build && node --test "dist/test/daemon/ipc/handshake.test.js" "dist/test/daemon/ipc/sessions.test.js"`.
   - **30.6 Docs**: PT-24 / PT-26 cells per §2.4.
   - Runtime harness: in-process daemon on port 0 via `createIpcServer`; a fake `http` client for the excess-handshakes case.
4. Audit per §2.2 steps 7–9; merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s status line,
   `state.yaml` (counts, `completed_slices`, `tribunal_debate`, `tribunal_state`, `next_recommended`; parse it) and the
   `00-INDEX.md` board if the backlog grew, delete `odd/`, save the session summary to Engram, commit on `main`, push,
   and hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text.
- **PR-01…PR-29 are complete; do not re-slice, re-audit or re-open them.** Units 4–8 are closed; unit 9 is open with
  PR-29 merged. A defect in a merged module is its own slice with its own audit, not a drive-by edit (B-43, B-44, B-45
  wait for such slices). PR-30/31 may **extend** `ipc-contract.ts` if a handler needs a new schema, disclosed.
- Settled in session 29 and recorded: the five `HTTP_*` names plus five transport statuses live in `ipc-contract.ts`;
  the server's six `IPC_*` refusal codes are daemon vocabulary, not client codes (the client surfaces them as
  `IPC_ERROR`); the server validates no route body and checks no bearer.
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
| B-16 / D-10, B-11, B-12 / B-13 | Licence files and copyright line; trademark screening; macOS scope; migration runbook (PR-38). | Director |
| B-05, B-08, B-09 | F0 spikes still open (B-08 — IPC handshake and named-pipe DACL on Windows — is unit 9's background). | Director + Kairo |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions) rows 9 and 10.

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI, TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **858 tests** (857 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- Verification worktrees: `../telegram_bus_agent-worktrees/` — **empty** at the end of session 29 (session 27's locked
  `pr23-verify` leftover was finally removed).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests (about 70 s per leg).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it).
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down**. Never quote or commit.
