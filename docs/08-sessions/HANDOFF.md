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
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. Session 28
closed **unit 8 `send-path`** (PR-26, PR-27, PR-28) with both blind judges and a separate independent
verifier per slice — the route §2 describes is the one that produced them.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-29 (`src/shared/ipc-contract.ts` + `src/daemon/ipc/server.ts`, abre la unidad 9 `ipc-handshake`): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + Judgment Day con ambos jueces + verificador independiente); la Arena no está disponible, así que nada depende de un debate ni de la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** (session 28 deleted its `odd/` tree). The status command must print
`nextRecommended: apply`, `completed: 144`, `pending: 66` (of `210`), `blockedReasons: []`. Anything else:
stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.) Verify the count
yourself with `grep -c '^\s*- \[x\]' openspec/changes/f1-daemon-registry-thin-client/tasks.md` (must print 144).

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-28** (PR-28 merged as PR #32, `4d7c06d`). **Unit 8 `send-path` is closed.** **Next slice: PR-29** — `src/shared/ipc-contract.ts` + `src/daemon/ipc/server.ts` (IPC contract and `node:http` server scaffolding: `Host` check, body cap), opening **unit 9 `ipc-handshake`** (PR-29…PR-33). | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | **45 PR blocks / 42 row ids** in `tasks.md`. Complete: **34 blocks / 29 row ids** (`PR-01…PR-28`). Remaining: **11 blocks / 13 row ids** (`PR-29…PR-42`). Checkboxes: **144 of 210**. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **144/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | `src/shared/*` (14 modules), `src/cli/*`, `src/registry/*`, `src/ledger/*` (11), `src/secret-store/*` (5), `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts`, `src/daemon/lifecycle/*` (4), `src/daemon/transport/*` (5), `src/daemon/serve/{fetch,status,thread}.ts`, **`src/daemon/send/{validate,send-path,rate}.ts`**, all with twins — **801 tests** (800 pass, 1 skip), `test:static` **8/8** | PRs `#1`–`#32` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **23 entries** (PR-26 `send/validate.ts`, PR-27 `send/send-path.ts` added; `send/rate.ts` is new code with no v1 range). | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-28**, one record each in the tribunal index. PR-23..PR-28: Judgment Day with **both judges** + independent verifier, all **APPROVED** (`bus-v2-f1-pr-2{3..8}-audit-001`). PR-22a/22b: inline passes (the judges were down then). | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused before
the child launches (`SDD preflight cancelled or invalid; no session consent recorded`) — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line budget
with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` envelope exists. One variant: if a human has already run `/gentle:sdd-preflight` in the TUI,
or the Director asks, the slice may run through `sdd-apply`.

**2. The per-slice pipeline sessions 27–28 ran — repeat it exactly.**
1. **Map** once (delegated `Explore`, read-only): v1 range (if any), consumed APIs with verbatim signatures, DDL,
   spec, design, the tasks block, and every contradiction between them.
2. **Decide** the open design points yourself (the Director delegated them) and write them into the writer's brief;
   each decision is stated in the module doc and in `apply-progress.md`, and a `tasks.md` *apply-time note* records any
   edit outside the block's Scope line.
3. **Write** (delegated `general-purpose`, sonnet): src + twin + fixture entry (+ PT cells when the block has a Docs
   task). The writer does not commit. **Insist on RED first** — PR-28's writer wrote tests and code together and the
   slice has no writer RED (disclosed).
4. **Parent readback** of the source before freezing — it found prose defects in every session-28 slice (wrong file
   names, invented citations, self-contradicting paragraphs).
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only control that
   MUST survive, BUILD-FAIL reported apart from KILLED. A survivor is a test gap → pin it (that is the behavioural RED);
   an **equivalent** mutant is argued in the record, not pinned (`E2`, `R4`, `W8` in session 28).
6. Full suite + `test:static` from a clean `dist/`; `git add -N` new files; measure `git diff --numstat main -- src test`;
   commit code **with** its records (`tasks.md` ticks + size reconciliation, `apply-progress.md` section).
7. **Judgment Day**: frozen worktree, `jd-judge-a` + `jd-judge-b` in parallel, result shape `{findings, evidence}`.
   In parallel, a **separate independent verifier** (`general-purpose`) on its own worktree with a mandate to
   reproduce every figure, re-run the sweeps and write up to six extra mutants — **it found real gaps in every slice**.
8. Reproduce single-judge rows before correcting (session 28 found one stated mechanism that could not happen —
   PR-27 `JD-B-001`); correct (parent inline for small batches); commit code and record together; scoped re-judgment
   over the delta only. **Budget: two re-judgments**; session 28 needed one per slice.
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude Code line);
   `gh pr checks <n> --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Get the untracked inventory with `gentle-ai review status --cwd . --contract
gentle-ai.review-integration/v2 --agent claude-code --next-transition` (field `eligible_untracked_inventory`), then run
`gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha> --committed-only --untracked-scope=exclude
--expected-untracked-inventory=<that sha256:…> --json` and record tier and `review_due`. **Do not START the native review
for a Judgment Day target**: the installed `judgment-day` skill states it replaces ordinary 4R and both must never run on
one target, and START's consent envelope belongs to the Director. Record that in the slice's audit row.

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those. PR-29's
block has **no Docs task** and pins no PT row; unit 9's first PT cells are PR-30's (task 30.6: PT-24, PT-26).

**5. Budget policy.** 400 lines of authored src+test, disclosed PR-scoped exceptions otherwise, measured at every tip and
labelled with it. Session 28: PR-26 1,104 (704), PR-27 1,493 (1,093), PR-28 1,285 (885) — every estimate priced only the
v1 lines. Expect PR-29 (≈310 estimated, new code) to land well above it. Add a *Size reconciliation* note under the
block's header in `tasks.md` (gate text left as written).

**6. Frozen worktrees — the junction rule (session 28 incident).** `git worktree add --detach
../telegram_bus_agent-worktrees/<name> <sha>`. Only the verifier's worktree needs `node_modules`: create the junction with
PowerShell `New-Item -ItemType Junction -Path '<win path>\node_modules' -Target '<main win path>\node_modules'`. **To
remove: delete the junction first with PowerShell `(Get-Item -LiteralPath '<win path>\node_modules').Delete()`, verify it
is gone (`test -e … || echo removed`) and that `node_modules/typescript/lib/tsc.js` still exists in the main checkout,
and only then `git worktree remove --force`.** `git worktree remove --force` follows a live junction and empties the main
`node_modules`; if that happens, `npm ci` restores it exactly from the shrinkwrap.

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

**PR-29** (`shared/ipc-contract.ts`, `daemon/ipc/server.ts`) is **new code**: design §12 has no v1 row for it, so it
carries no provenance header and the registry stays at 23 — confirm against design §12 while mapping. A new module with
no imports must not spell `Provenance:` in its leading block (B-33). Older pins are in `apply-progress.md` and in each
module's header. SEAM pins are **not machine-checked** by `provenance.test.ts` (B-42): reproduce them at audit time.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **A writer's RED is usually compile-level** (`TS2307`), or absent (PR-28). | The behavioural RED is the parent's sweep: a mutant that survives, then dies on the test that pins it. Record it that way. | session 27–28 records |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist tests, comma-separated> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once; it builds with `npx tsc -b`, restores the file and checks its sha256. It lives in the untracked `odd/` tree (deleted at close): recreate it from this description (≈60 lines). **`&& false` mutants fail to build under TS narrowing** — use a runtime-opaque condition (`&& deps.bot_id < 0`, `&& callerAgentId === ""`). JSON cannot hold a literal tab — write `\t`. After a source edit, re-anchor mutants whose `from` moved. | session 28 |
| **The AS-IS transports lose error detail** | `GroupTransport` turns every non-message-level failure (a guard refusal, a 429) into a soft `{ok: false, code}`; `DualWriteTransport` keeps only a DM error's message and throws a cause-less error when nothing landed. Send-side checks therefore run **before** the call (room pre-check) or through the ledger (429). Do not expect `classifyErrorChain` to find a cause. | PR-27, PR-28 records |
| **`offsets.retry_after_until` is shared** | Per `bot_id`, written by the poller (429 on `getUpdates`, cleared on success) and by `send/rate.ts` (429 on `sendMessage`, later instant wins). The poller's clear can erase a send backoff early. | **B-45** |
| **Read the clock after any wait** | A handler that awaits must re-read `now()` before stamping or measuring anything (PR-23; pinned again in PR-28). | PR-23, PR-28 |
| **`withTransaction` callbacks are synchronous** | An async callback is refused before `BEGIN`; do the network call first, then one synchronous transaction. | `src/ledger/transaction.ts` |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). `conditions-store` accepts four names. File, do not invent. | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId` in `serve/fetch.ts` and `serve/status.ts` (the last also in `serve/thread.ts`). Known debt; extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha256:…>` from `review status` (§2.3). | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key>`. | sessions 27–28 |
| **Subagents were available all of sessions 27–28** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits (global rule); PR bodies end with the Claude Code line. Write long messages to a file and use `git commit -F`. | sessions 27–28 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header** | A non-vendored module must not spell `Provenance:` there; a module doc belongs in the leading block, before the imports (PR-28 readback). | **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files before `test:static`. | PR-09b… |
| **PT-22's token shape** | Synthetic bot ids use seven digits (`1234567:${"A".repeat(35)}`). | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means **no limit**; scalar `MAX(NULL, x)` is NULL — wrap with `COALESCE`. | PR-23, PR-28 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `src/ledger/unknown-senders.ts`, `send/rate.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines truncate silently** | Write files with the file tools or Python; verify line counts. | sessions 13–21 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`state.yaml` is YAML** | Parse every tracked YAML after editing (`python -c "import yaml,sys; yaml.safe_load(open(sys.argv[1],encoding='utf8'))" <f>`); `tribunal_state` appears in several phases — edit the `apply:` one. | session 28 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. Python on this machine needs `PYTHONIOENCODING=utf8` to print non-ASCII. | sessions 9–28 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` / the SIGTERM test can fail a leg; re-run the failed job once and record it. PR-23..PR-28 were green at the first run. | **B-39** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 144/210. Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2, `tasks.md`'s
   **PR-29 block** (and skim PR-30…PR-33 for what the scaffolding must serve), `specs/ipc-handshake/spec.md`, design **§10
   "IPC"** (transport, `Host` check, body cap, routes, contract row) and the §3 constants rows for `IPC_MAX_BODY_BYTES`,
   `IPC_EPHEMERAL_PORT` and the `HTTP_*` codes (design says the `HTTP_*` numbers are "named once in `ipc-contract.ts`";
   `IPC_MAX_BODY_BYTES`/`IPC_EPHEMERAL_PORT` already exist in `src/shared/constants.ts`).
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram mirror
   `odd/<feature>/tasks`, before the first write. Decide the session's scope in one line (unit 9 is PR-29…PR-33, about
   950 estimated lines — take what fits, closing each slice fully).
3. **Branch** `f1/29-ipc-contract-server` from `main`, then run §2.2's pipeline:
   - **29.1 RED** `test/daemon/ipc/server.test.ts`: a request with a wrong `Host` header is refused; a body over
     `IPC_MAX_BODY_BYTES` returns `HTTP_PAYLOAD_TOO_LARGE`. The block's Scope also names `test/shared/ipc-contract.test.ts`
     (the twin of `ipc-contract.ts`).
   - **29.2 GREEN** `src/shared/ipc-contract.ts` (zod schemas for every request/response; the daemon re-validates tool
     inputs with `shared/tool-schemas.ts`) and `src/daemon/ipc/server.ts` (`node:http` on `127.0.0.1:IPC_EPHEMERAL_PORT`,
     JSON only, `Host` must be `127.0.0.1:<port>`). Runtime harness: a real listener on port 0.
   - **29.3 Verify** `npm run build && node --test "dist/test/shared/ipc-contract.test.js" "dist/test/daemon/ipc/server.test.js"`.
   - Remember the autonomy boundary: the server answers requests; nothing in it emits on a timer.
4. Audit per §2.2 steps 7–9; merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s status line,
   `state.yaml` (parse it) and the `00-INDEX.md` board if the backlog grew, delete `odd/`, save the session summary to
   Engram, commit on `main`, push, and hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text (session 28 added size reconciliations and apply-time notes for PR-26..PR-28).
- **PR-01…PR-28 are complete; do not re-slice, re-audit or re-open them.** Units 4, 5, 6, 7 and **8** are closed. A defect
  in a merged module is its own slice with its own audit, not a drive-by edit (B-43, B-44, B-45 wait for such slices).
- Settled in session 28 and recorded: the send tool's rate code is `RATE_LIMITED` (B-46 only asks to amend design §9's
  text); the send path pre-checks the room with `RoomGuardClient.assertTarget`; a 429 reaches the send path through
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
| **B-45** | The poller writes `TELEGRAM_RATE_LIMITED` to `offsets.last_error_code` (DATA-MODEL says `RATE_LIMITED`), audits no 429, and clears `retry_after_until` on every successful poll — which can erase a send-side backoff early (reproduced live by PR-28's verifier). The one open point with runtime effect. | Director → Kairo |
| **B-46** | Design §9 names the rate refusal `TELEGRAM_RATE_LIMITED`; the shipped tool code is `RATE_LIMITED`. Text-only amendment. | Director |
| **B-44** | A room-guard refusal inside a misbuilt transport degrades the send and raises `group_outage` instead of `WRONG_ROOM` (nothing reaches the wrong room; `bindings.ts` cannot build that state). | Director |
| **B-43** | `serve/thread.ts:204` still tells the agent to run `agentbus_fetch`; `admission.ts`'s header points at a fixture that carries no hash. | Director → Kairo |
| **B-42** | SEAM `v1 body sha256` pins are not machine-checked (the v1 checkout is not in CI). | Director |
| **B-40 / B-41** | Design conditions with no contract (`poller_conflict`/`poller_rate_limited`; `secret_store_fallback`). | Director |
| B-39 | CI is intermittently red on two wall-clock tests; re-run once and record. | Director → Kairo |
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
  **801 tests** (800 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- Verification worktrees: `../telegram_bus_agent-worktrees/`. An **empty, locked directory `pr23-verify`** remains there
  from session 27 (still locked in session 28); it is not a registered worktree — delete it when the lock is gone.
- GitHub Actions: Node 24.15 and 26 matrix on pull requests.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only** (an untracked `alpha_response.json`
  there is not ours; leave it).
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down**. Never quote or commit.
