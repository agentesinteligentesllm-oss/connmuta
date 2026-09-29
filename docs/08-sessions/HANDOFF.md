# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
>
> **Reading order for a zero-context session:** §0 → §1 → §5. Then §3 (contracts the next slices
> need), §4 (traps), §6 (do not redo), §7 (open points) as the task needs, and §8 for the environment.
>
> **Last rewritten: end of session 52** (2026-09-28). Everything below describes the state after it.

---

## §0 — Quick start

**F1, F2, F3 and F5 are archived and untouched. F4 (`f4-claude-channels-adapter`) is the one open SDD
change, in `sdd-apply`.** Merged to `main` so far: PR-01 (`#95`), PR-02 (`#96`), PR-03 (`#97`), PR-04
(`#98`) and slice **05a** of PR-05 (`#99`). The last code commit is `9262939` (05a); one docs-only commit sits on top of it (see `git log`), and `main` equals `origin/main`. **Not
started: slices 05b, 05c, 05d, then PR-06, PR-07, `sdd-verify`, `sdd-archive`.** PR-05 was re-sliced
this session into four slices; use `tasks.md`'s PR-05 block, not the original forecast.

**Copy-paste prompt to start the next session** (kept to 3 lines per the Director's instruction):

```text
F4 PR-05a mergeado (PR #99; PR-01..04 también) — lee docs/08-sessions/HANDOFF.md, confirma Arena (DN-09) y mi autonomía total con Alpha como juez.
Arranca sdd-apply PR-05b (channel/daemon-link.ts, plan de 4 slices en tasks.md); pide RDD por candidato y recomiéndame granted.
Árbol limpio esperado (docs y openspec/ F4 ya commiteados); B-95/B-96 (fix pequeño) se agenda después de PR-05.
```

**First commands, in order** (stop and report if any disagrees):

```bash
git branch --show-current && git pull --ff-only     # must be main, up to date
git log --oneline -3 origin/main                     # 9262939 (05a) is the last code commit; a docs-only commit is on top; must equal local HEAD
rm -rf dist                                          # a stale dist/ silently fakes results
ls openspec/changes/                                 # archive/ and f4-claude-channels-adapter/
git status --short                                   # see the expected tree below
```

**Expected working tree: clean** (`git status --short` prints nothing). At the end of session 52 the
docs of sessions 50-52 (`AGENTS.md`, `docs/00-INDEX.md`, `docs/05-tribunal/INDEX.md`,
`docs/06-backlog/CHECKLIST.md`, `docs/07-plan/WORK-PLAN.md`, `docs/08-sessions/HANDOFF.md`,
`docs/08-sessions/LOG.md`) and the F4 artifacts under `openspec/changes/f4-claude-channels-adapter/`
(`proposal.md`, `exploration.md`, `specs/`, `design.md`, `tasks.md`, `apply-progress.md`) were committed
as one docs-only commit, on the Director's authorization. If `git status` shows anything, stop and
report before assuming it is safe.

**Arena reachability (DN-09).** Check it live with a real `bridge_send`, never `curl`. A successful send
is enough; do not wait for Alpha's reply just to clear this gate. Session 52 had Arena reachable
throughout (11 `CONSENSUS` debates over sessions 51-52, the last one the documentation close-out).

**Standing instructions from the Director, and how to treat them.**
- Session 52 asked once whether full autonomy with Alpha as judge (including commit, push, PR and merge
  once Alpha and RDD have signed off) still stood. The answer: "Sí, mantén la autonomía total con Alpha
  como juez". Re-confirm at the start of the next session; do not assume it carries forward forever.
- RDD (receipt-driven development): the Director asked "vale la pena el que apliques RDD el cual yo con
  anterioridad te lo había declinado? En caso de que lo veas viable y lo veas necesario, entonces
  aplícalo." Kairo judged it worth applying and ran a retroactive review (§9). **Consent is still asked
  per candidate through `AskUserQuestion`; never answer it for the Director.** Recommend `granted`.
- Commit messages and PR descriptions carry no `Co-Authored-By` and no AI attribution; conventional
  commits only. This project rule overrides the harness's attribution reminder.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1, F2, F3, F5 | **Archived**, unchanged. | `openspec/changes/archive/` (four dated folders) |
| B-09 | **Closed** (session 50). | `docs/06-backlog/CHECKLIST.md#B-09` |
| F4 planning | Explore, proposal, spec, design, tasks all written and Alpha-audited to `CONSENSUS` (session 50). | `openspec/changes/f4-claude-channels-adapter/` |
| F4 PR-01 | **Merged.** `shared/{ipc-contract,constants,envelope}.ts` + twins. PR #95, `952fbcd`. | `apply-progress.md` (PR-01) |
| F4 PR-02 | **Merged.** Move-only `client/run-file.ts` + `client/session-exchange.ts`. PR #96, `d3cb965`. 661 added / 325 deleted lines: PR-scoped `size:exception`, Director-authorized. | `apply-progress.md` (PR-02) |
| F4 PR-03 | **Merged.** `daemon/serve/doorbell.ts`, `POST /channel/doorbell`. PR #97, `33cd1e6`. About 706 lines: PR-scoped `size:exception`. | `apply-progress.md` (PR-03) |
| F4 PR-04 | **Merged.** `commitClientCursor`, `readMaxInboxSeq`, `POST /channel/cursor`. PR #98, `e03498a`. 306 lines, within budget. | `apply-progress.md` (PR-04) |
| F4 PR-05a | **Merged.** `channel/tsconfig.json`, root `tsconfig.json` reference, `channel/notify.ts`. PR #99, `9262939`. 224 lines. | `apply-progress.md` (PR-05a) |
| F4 PR-05b | **Next.** `channel/daemon-link.ts` + test (tasks 5.3, 5.4), est. ≈400. | `tasks.md` (PR-05 block) |
| F4 PR-05c | Not started. `channel/doorbell-loop.ts` + test (5.5, 5.6), est. ≈400. | `tasks.md` |
| F4 PR-05d | Not started. `channel/main.ts`, `package.json` bin/files, **`test/security/pack.test.ts`**, main test (5.7, 5.8, 5.11), est. ≈300. | `tasks.md` |
| F4 PR-06 | Not started. **Scope shrinks**: see the amendment in its `tasks.md` block. | `tasks.md` (PR-06 block) |
| F4 PR-07 | Not started. Runbook, `WORK-PLAN.md` amendment (task 7.2), DATA-MODEL and ADR notes. | `tasks.md` (PR-07 block) |
| After PR-07 | `sdd-verify`, then `sdd-archive`, each Alpha-audited like F1/F2/F3/F5. | — |
| Backlog filed | **B-95** (RDD retroactive follow-ups) and **B-96** (`bootstrap` timing flake), both `open`. | `docs/06-backlog/CHECKLIST.md` |
| Tests on `main` | `npm test`: **1607 tests, 1601 pass, 0 fail, 6 skip** (baseline at session start: 1544/1538/0/6). | — |
| Tribunal record | 11 `CONSENSUS` debates of sessions 51-52 are indexed. | `docs/05-tribunal/INDEX.md` |

---

## §2 — What session 52 did (for context, not to redo; full detail in `LOG.md`)

1. **Preflight**: tree matched the old handoff; Arena reachable by a real `bridge_send`; SDD Session
   Preflight re-asked via `AskUserQuestion` (Automatic / Both / Auto); Director reconfirmed autonomy.
2. **PR-02, PR-03, PR-04, PR-05a**: each ran the same loop — scope debate with Alpha, `sdd-attempt`
   acquire, one `general-purpose` writer, Kairo's independent re-verification, `sdd-attempt` settle,
   frozen-diff debate with Alpha, RDD consent question, commit, push, PR, rebase merge, post-merge
   rebuild and full suite. Every debate ended `CONSENSUS`, `APPROVE`, round 1, no objections.
3. **Plan defects caught and written down**: design D5's "fetch path's relevance expression" does not
   exist in `fetch.ts`; the original PR-05 seam could not compile; `pack.test.ts` was assigned to PR-06
   although PR-05's `package.json` change breaks it; PR-06's tasks 6.5/6.6 were already satisfied by
   PR-02. Corrections are in `design.md` ("Corrections found during apply") and `tasks.md`.
4. **Retroactive RDD review** of PR-03, PR-04 and PR-05a: approved, 2 WARNINGs + 3 SUGGESTIONs, all
   filed as **B-95**.
5. **Documentation close-out**: this HANDOFF rewritten from scratch; LOG, tribunal index, `00-INDEX`,
   `WORK-PLAN`, backlog, `design.md`, `tasks.md`, `apply-progress.md` and `AGENTS.md` updated.

---

## §3 — Contracts the next slices need (read the files, do not re-derive)

`design.md` (Interfaces/Contracts, D1-D12) plus its final section "Corrections found during apply" is
authoritative. Concrete pointers verified at the end of session 52:

**Slice 05b — `channel/daemon-link.ts`** (tasks 5.3, 5.4)
- Handshake: `exchangeSession(run: DaemonRunPayload, id: SessionIdentity, opts?: { homeDir?; fetchImpl? })`
  in `src/client/session-exchange.ts`. It does `GET /identity` (one re-read retry, `SERVER_VERSION`
  check) then `POST /session`. The run payload comes from `readRunFile(join(resolveClientHomeDir(home),
  "run"))` in `src/client/run-file.ts`; `null` means no daemon: **do not spawn**, back off
  `CHANNEL_RETRY_BACKOFF_SECONDS`. `SessionIdentity.host` is `CHANNEL_HOST_LABEL` (`claude-code-channel`).
- Routes, both behind the session bearer: `POST /channel/doorbell` takes `{after_seq, timeout_s?}` and
  answers the closed set `{count, senders, types, threads, covered_through_seq, saturated}`
  (`doorbellResponseSchema`); `POST /channel/cursor` takes `{commit_seq?}` and answers `{inbox_seq}`
  (`channelCursorResponseSchema`). A 401 re-handshakes exactly once, a second consecutive 401 is a
  failure. `409 BINDING_CHANGED` is possible. A cursor refusal `400 CURSOR_COMMIT_OUT_OF_RANGE` is
  warn-only (D12). `DELETE /session` on close, bounded by `CHANNEL_SHUTDOWN_TIMEOUT_MS`.
- Import rule, true from 05b onward: `channel/` imports only `src/shared/*` and
  `src/client/{run-file,session-exchange,binding}.js`. Never `run-state.js`, `spawn.js`,
  `ensureDaemonRunning`, or anything under `src/daemon` (derive types from schemas with a type-only
  `zod` import, as `channel/notify.ts` does).

**Slice 05c — `channel/doorbell-loop.ts`** (tasks 5.5, 5.6): `DoorbellWatcher` with deps
`{link, deliver, sleep?, warn?}`; `tick()` returns `"rang" | "silent" | "deliver_failed" | "link_failed"`;
`run(signal)` is `while (!signal.aborted)`, never `for(;;)`. Order per tick: doorbell read, `buildNotification`
(from `channel/notify.ts`), `deliver`, and only after `deliver` resolves, the cursor commit (D12: a failed
commit after a delivered ring still advances the in-memory watermark and only warns). `count === 0`
advances the in-memory watermark to `covered_through_seq` with no `deliver` and no commit (D11). A
saturated page is re-read immediately. This is the only file allowed to own a timer.

**Slice 05d — `channel/main.ts` and packaging** (tasks 5.7, 5.8, 5.11 + `pack.test.ts`): low-level MCP
`Server` named `CHANNEL_SERVER_NAME`, version `SERVER_VERSION`, capabilities
`{ experimental: { "claude/channel": {} } }` and **no `permission` key at all** (never `false`);
`--project` resolved by `resolveProjectBinding` (`src/client/binding.ts:123`); shutdown on stdio close,
SIGINT and SIGTERM aborts the in-flight poll and sends `DELETE /session`. `package.json` gets
`bin.conmuta-channel = "dist/channel/main.js"` and `files += "dist/channel/**"`; `pack.test.ts:12,76`
asserts the whitelist by exact equality, so update `PACKAGE_JSON_WHITELIST` in the same PR and check
`dist/channel/main.js` is in the pack dry-run.

**Already in `main` and relevant**
- Constants (`src/shared/constants.ts`): `DOORBELL_SCAN_DEPTH` (:328), `CHANNEL_SERVER_NAME` (:329),
  `CHANNEL_HOST_LABEL` (:331), `CHANNEL_RETRY_BACKOFF_SECONDS` (:333), `CHANNEL_META_LIST_LIMIT` (:335),
  `CHANNEL_SHUTDOWN_TIMEOUT_MS` (:337).
- `channel/notify.ts` exports `buildNotification(summary)` (returns `null` for `count === 0`, omits empty
  lists from `meta`, caps `senders`/`threads` at `CHANNEL_META_LIST_LIMIT`) and `CHANNEL_INSTRUCTIONS`.
- The live IPC route table has **ten** entries. `channel/tsconfig.json` is a composite project
  (`rootDir ".."`, `outDir "../dist"`) emitting `dist/channel/*.js`; `src/` emits `dist/src/*`.
- Closure rule for `channel/*.ts`: timers are allowed (only in `doorbell-loop.ts`); banned is
  reachability to `daemon/transport/*`, `daemon/send/*` or a Telegram-client module, and any reference
  to `child_process` **including the literal substring inside a comment** (PR-06 pins it; PR-05a's
  purity test already greps `notify.ts` for it).

---

## §4 — Facts that will bite you (read before applying)

**Process and tooling**

| Item | State |
|---|---|
| **Native `sdd-*` Agent dispatch is assumed blocked by the `PreToolUse:Agent` hook.** Confirmed on the first attempt of every phase in sessions 44-50; sessions 51 and 52 did not re-test it and went straight to a `general-purpose` writer. One cheap attempt at the start of a session confirms either way. Pointer: `~/.claude/skills/_shared/sdd-phase-common.md`. |
| **An Alpha report can contain claims that are false; re-verify the concrete ones yourself.** In `bus-v2-s52-docs-close-audit-001` Alpha "verified verbatim" four Director quotes that exist nowhere, and called `src/client/binding.ts:123` an `isRecord` check (it is `resolveProjectBinding`). Kairo checked the cited pointers and quotes independently and the documents were right. The test counts Alpha reported for the code PRs matched Kairo's own reruns every time, and its code audits caught real design points; but never accept a "confirmed" for a quote, a line number or a count without one `grep` or `sed -n` of your own. |
| **Writer prompt shape that worked four times**: self-contained; names the slice's tasks; requires RED-first with the observed RED recorded per task; forbids all git operations; lists files the writer may touch; lists constraints as HARD CONSTRAINTS; asks for `<command>: <observed result>` per verification and the measured line count; asks to close with a `## Key Learnings` section. Kairo always re-reads the diff and re-runs build and tests itself. |
| **`tsc -b` does not emit on a type error**, so a missing export or module is a compile-error RED (`TS2305`/`TS2307`); that is acceptable evidence, say so. A pin test for behavior that already exists passes on its first run and cannot show a RED; disclose it as a pin. |
| **`sdd-attempt acquire --max-changed-lines` is a hard cap counted as added + deleted.** PR-02 measured 986 against a cap of 500, `settle` returned `blocked: maintainer_decision` (the attempt still recorded `passed`), and only a Director-authorized `sdd-attempt reset` cleared it. Use about 2× the estimate (1000 for a 400-line slice; 800 and 1000 worked for 05a and PR-04). After an over-budget attempt the next `acquire` returns a `settle_obligation`; the next passing `settle` must carry `--remediates-evidence-revision <that attempt's evidence>` (done for PR-03; cleared). |
| **Untracked files.** `sdd-attempt acquire`/`settle` and `review status`/`start` refuse on eligible untracked files unless told what to do. At `acquire`: `--untracked-scope=exclude --expected-untracked-inventory=sha256:<hash>` (the hash is `eligible_untracked_inventory` from `gentle-ai review status --cwd . --contract gentle-ai.review-integration/v2 --agent claude-code --next-transition`). At `settle`, when the writer created new source files, use `--untracked-scope=select` and one `--intended-untracked <path>` per new source or test file (05a did this); get a fresh hash and the `current_snapshot_identity` (= `--evidence-revision`) from the same status call. The hash changes whenever an untracked file appears. Never hand-build the raw JSON collect value. |
| **RDD candidate scoping.** `review status`/`start` default to the `workspace` projection, which sweeps in every uncommitted tracked file (here the unrelated docs: 11 files instead of 7). Fix: `git add` exactly the PR's files, then pass `--projection=staged`. Build `review start` from the `next_transition.execute.arguments[].token` list returned by `status` (plus `--consent=relay`); a bare `--contract` errors. Committed-range review: `--base-ref=<sha> --committed-only`. |
| **RDD consent envelope must be relayed to the Director, then the exact captured invocation run once.** `granted` → for a multi-lens (high risk) review, give one forecast, then run every `review capture-result` concurrently with the returned tokens, then run the exact `acknowledge-approved` command from the last capture. `declined` → run the exact `declined` invocation once and check `action: declined`, `consent: declined_this_candidate` and the target. A `risk high` tier can come from a heuristic false positive (a test containing the literal string `child_process`); say so in the question. |
| **MSYS/Windows shell.** `/tmp` is not visible to `node`; feed JSON through stdin (`node -e ... < file`). Apostrophes break `node -e` and heredocs with unquoted delimiters; use quoted heredocs (`<<'EOF'`) or the Edit tool. `cygpath -w` translates paths for the native Read/Grep tools. |
| **`npm test` output is misleading in two ways here**: a background run can hang near zero CPU (kill and rerun in the foreground), and piping through `tail` masks the real exit code. Redirect to a file and `echo $?`. `dist/` staleness fakes results: `rm -rf dist` first. |
| **Local `main` can silently sit ahead of `origin/main`** (session 51 found two unpushed commits). Always `git diff --stat <local> <remote>` before any reset; stash with `-u` first. |
| **Line endings**: `.gitattributes` is `eol=lf`; some working copies are CRLF; git shows only a warning, no real diff. |
| **Memory (Engram)**: `mem_save` failed in session 52 with `multiple active runtime sessions match the current project and directory`, including with `project: "connmuta"`. Not retried in a loop. Next session try `mem_session_start` with `directory` set to the repo root first (never invent a `session_id`); if it still fails, this file and `LOG.md` are the record. |

**Code and test facts**

| Item | State |
|---|---|
| **`test/daemon/bootstrap.test.ts:543` is a pre-existing timing flake (B-96).** It failed on the FIRST full `npm test` after a cold `rm -rf dist && npm run build` four times running and passed on every immediate rerun and 12 of 12 isolated runs. Symptom: `database is not open` and `daemon.log` ENOENT, "generated asynchronous activity after the test ended". Probable cause, read from the test only: a 5 ms heartbeat against a 40 ms factory delay, so a cold run lets a tick outlive teardown. `bootstrap.ts` is untouched by F4. **If it is the only failure, rerun the full suite once and report both runs.** |
| **The doorbell relevance rule is implemented in `doorbell.ts` (`isRelevant`), not reused from fetch**, because fetch has none (design D5 said otherwise; corrected in `design.md`). The doorbell counts `rejected` and `ignored` rows on purpose: fetch surfaces them in `rejected[]` and `unapplied[]`. |
| **`docs/07-plan/WORK-PLAN.md`'s F4 Validation row still says "`saturated` rings once per cursor value"**: deliberately stale until `tasks.md` task 7.2 (PR-07) applies the amendment text stored in `design.md`. The F4 "SDD change" row above it now says so. Do not fix the Validation row earlier. |
| **The `client-bundle`, PT-27 and installer-bundle security tests grep raw source text.** Even a comment naming `child_process` in a client module fails them, and `channel/notify.ts` has a purity test with the same property. |
| **The route count**: `createSessionRoutes` builds eight session/tool/channel routes and the whole table has ten; a doc comment in `ipc/routes.ts:720` still contradicts itself (B-95). |
| **Review budget**: the fixed policy is 400 changed lines per PR. Over budget means re-slice or a disclosed, PR-scoped `size:exception` with the Director's authorization (PR-02 and PR-03 used it). Measured against estimates: PR-01 213 vs about 220, PR-02 661 added vs 420, PR-03 706 vs 480, PR-04 306 vs 200 (each of PR-02 to PR-04 about 1.5×), 05a 224 vs 250 (under). Expect 05b and 05c to land near or over 400 and decide at the measured diff. |
| **Arena's wake-up is PTY keystroke injection, not an MCP notification** (`Arena_Orion/src/main/ArenaBroker.js:3-9`). Never cite the `[ARENA]` ping as MCP-notification evidence. |
| **Pronouns**: refer to the Director by role, never a gendered pronoun. |

---

## §5 — Next session, exact sequence

1. Run §0's commands; the tree must match §0 exactly.
2. Prove Arena reachable with a real `bridge_send` (the opening debate of step 6 does it).
3. Ask the Director, one question: does full autonomy with Alpha as judge still stand?
4. Read `tasks.md`'s PR-05 block (re-slice and amendments) and `apply-progress.md`; do not re-derive scope.
5. Run the SDD Session Preflight through `AskUserQuestion` (hard gate, re-asked every session).
6. Debate 05b's scope with Alpha (`kind: PROPOSAL`, pointers not pasted code). Points worth asking
   Alpha: where the bearer token is held and refreshed in the link; that a failed re-handshake and a
   missing run file both back off and never spawn; how a `409 BINDING_CHANGED` surfaces.
7. Create `f4/05b-channel-daemon-link`; `sdd-attempt acquire` with a cap near 1000 (§4).
8. Launch one `general-purpose` writer with the §4 prompt shape and §3's 05b contract.
9. Verify independently: read the diff, `rm -rf dist`, build, full suite to a file with the exit code
   echoed; if only the B-96 flake fails, rerun once.
10. `sdd-attempt settle` (§4 untracked rules); `git add` exactly the slice's files; send the frozen diff
    to Alpha (`bus-v2-f4-pr05b-diff-audit-001`).
11. RDD: relay the consent envelope through `AskUserQuestion` (recommend `granted`), then follow §4.
12. Commit (conventional, no `Co-Authored-By`), push, PR, rebase merge, delete the branch, rebuild and
    rerun the suite on the merged `main`.
13. Repeat for 05c, 05d (with `pack.test.ts`), PR-06 (amended scope) and PR-07, updating
    `apply-progress.md`, the tribunal index and this file as each lands. Then `sdd-verify` and
    `sdd-archive`.
14. Schedule the B-95 and B-96 fixes as one small PR after PR-05 (Director's call, §7).

---

## §6 — Do not redo

- F1, F2, F3 and F5 archives are closed. B-09 is closed.
- F4's five planning phases (session 50) are final. PR-01 to PR-04 and slice 05a are merged: do not
  re-implement or re-debate them. The eleven `CONSENSUS` debates of sessions 51-52 are indexed in the
  tribunal record; none is reopened.
- RDD lineages `review-39a0ff92bc18e85d` (PR-01) and `review-15bbc1e2b034a77a` (retroactive PR-03/04/05a)
  are approved, acknowledged, authority burned. Do not re-review that code; their findings are in
  `apply-progress.md` and B-95.
- F4's design decisions D1-D12 stand except where `design.md`'s "Corrections found during apply" says
  otherwise. Reopening one needs new evidence, a written correction and Alpha.
- Do not fix `WORK-PLAN.md`'s F4 Validation row before PR-07 (§4).

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-95** | Follow-ups of the retroactive RDD review: `serve/doorbell.ts:125-133` per-row guard (low likelihood), three `ipc/routes.ts` nits including the missing abort signal. | Kairo (Director schedules) |
| **B-96** | `bootstrap.test.ts:543` timing flake: await the in-flight reconcile before teardown. | Kairo (Director schedules) |
| **B-93, B-94, B-91, B-92; B-53/54/56/57/58/59/60** | Carried unchanged from earlier sessions. | Director |
| **macOS start-at-login (D-40/D-47)** | Designed on paper only; empirical verification deferred to F6 (B-12). | Director + Kairo |
| **B-16 / D-10, B-11, B-12** | Licence files and copyright line; trademark screening; macOS scope: all three still block F6's readiness. | Director |
| **Gemini CLI / Cursor doorbell capability** | Untested for B-09; not a blocker for F4. Low priority. | Director |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions).

---

## §8 — Environment facts not to re-measure

- Windows 11, Node v24.16.0 and `gentle-ai` 2.9.1 (both re-measured at the end of session 52); shell is
  PowerShell primary with Bash (Git Bash) available.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main`. Every `gh`
  command runs with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`;
  **never `gh auth switch`**. Force-push and deletion of `main` are blocked; there is no PR or
  status-check requirement.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**; cite as `path:line`.
  v1's `channel/notify.ts` is the reference for `sanitizeMetaValue` (`:25`) and `META_LIST_LIMIT` (`:34`).
- `.mcp.json` points at the Arena bridge; never quote or commit its contents. `.claude/settings.json` is
  gitignored tooling.
- `os.tmpdir()` resolves to an 8.3 short path (`C:\Users\LABORA~1\...`).
- **RDD is enabled for this repository** (`gentle-ai review mode status`: `on`, decided by global).
- Stale local branches from F1 (`f1/19-telegram-client-p2`, `f1/21-room-guard-bindings`,
  `f1/22a-admission`, `f1/22b-poller`, `main-local`, `main-local-backlog`) are already merged or
  superseded; not this work's business to clean up.
- The SDD preflight for this project is Automatic / Both (hybrid) / Auto (`stacked-to-main`), asked
  again every session.

---

## §9 — RDD status at session close

| Candidate | Risk | Outcome |
|---|---|---|
| F4 PR-01 (session 51) | medium, 1 lens | **Approved**, acknowledged, burned; 3 advisories, all closed in PR-03 and PR-05a. |
| F4 PR-02 | high | Director **declined**. |
| F4 PR-03 | high | Director **declined**. |
| F4 PR-04 | medium | Director **declined**. |
| F4 PR-05a | high (heuristic false positive) | Director **declined**. |
| Retroactive PR-03 + PR-04 + PR-05a (committed range `d3cb965..HEAD`, 16 files, 1235 lines) | high, 4 lenses | Director **granted**; **approved**, acknowledged, burned; review-risk clean; 2 WARNING + 3 SUGGESTION filed as B-95. |

No candidate is currently under review and no authority is outstanding. The next candidate, 05b, will
be the next RDD question.
