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
slices run **ODD with the full SDD contract preserved** and are audited by **Judgment Day**. Session 27
closed **unit 7 `durable-inbox`** (PR-23, PR-24, PR-25) with **both blind judges running again** and a
separate independent verifier per slice — the route §2 describes is the one that produced them.

**Copy-paste prompt to start the next session:**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en PR-26 (`src/daemon/send/validate.ts`, abre la unidad 8 `send-path`): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + Judgment Day con ambos jueces + verificador independiente); la Arena no está disponible, así que nada depende de un debate ni de la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

The working tree must be **clean** (session 27 deleted its `odd/` tree). The status command must print
`nextRecommended: apply`, `completed: 132`, `pending: 78` (of `210`), `blockedReasons: []`. Anything else:
stop and report. (`verifyReport: missing` is **expected and correct** while `apply` runs.) **Verify the count
yourself** — session 27 found the previous handoff wrong on exactly this number.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress.** Completed: **PR-01…PR-25** (PR-25 merged as PR #29). **Unit 7 `durable-inbox` is closed.** **Next slice: PR-26** — `src/daemon/send/validate.ts` (send validation pipeline and secret backstop; PT-02 half, PT-15), opening **unit 8 `send-path`**. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| Board, exactly | **45 PR blocks / 42 row ids** in `tasks.md`. Complete: **31 blocks / 26 row ids** (`PR-01…PR-25`). Remaining: **14 blocks / 16 row ids** (`PR-26…PR-42`). Checkboxes: **132 of 210**. | `tasks.md` |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **132/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Code on `main` | `src/shared/*` (14 modules), `src/cli/*`, `src/registry/*`, `src/ledger/*` (11), `src/secret-store/*` (5), `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts`, `src/daemon/lifecycle/*` (4), `src/daemon/transport/*` (5), **`src/daemon/serve/{fetch,status,thread}.ts`**, all with twins — **701 tests** (700 pass, 1 skip), `test:static` **8/8** | PRs `#1`–`#29` |
| Provenance registry | `test/fixtures/v1-provenance.json` — **21 entries** (13 SEAM splits + 4 AS-IS transport + `admission.ts` + `serve/{fetch,status,thread}.ts`). | §3 |
| Audit status | **DN-05 is unsatisfied for PR-06..PR-25**, one record each in the tribunal index. PR-23/24/25: Judgment Day with **both judges** + independent verifier, all **APPROVED** (`bus-v2-f1-pr-2{3,4,5}-audit-001`). PR-22a/22b: inline passes (the judges were down then). | [`INDEX.md`](../05-tribunal/INDEX.md) |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused before
the child launches (`SDD preflight cancelled or invalid; no session consent recorded`) — a host-owned gate an
agent cannot satisfy. So: ODD is the route; the slice honours the same design rows, the same `tasks.md`
sub-tasks, Strict TDD (red before green, twins), the pinned hashes and provenance fixture, the 400-line budget
with disclosed exceptions, and a tribunal-grade audit; the orchestrator owns the SDD bookkeeping and discloses
that no `sdd-apply` envelope exists. One variant: if a human has already run `/gentle:sdd-preflight` in the TUI,
or the Director asks, the slice may run through `sdd-apply`.

**2. The per-slice pipeline session 27 ran — repeat it exactly.**
1. **Map** once (delegated `Explore`, read-only): v1 range, consumed APIs with verbatim signatures, DDL, specs.
2. **Decide** the open design points yourself (the Director delegated them) and write them into the writer's brief;
   each decision is stated in the module doc and in `apply-progress.md`.
3. **Write** (delegated `general-purpose`, sonnet): src + twin + fixture entry (+ PT cells when the block has a Docs
   task). The writer does not commit.
4. **Parent readback** of the source before freezing — this found three real defects in PR-23.
5. **Parent mutant sweep** with the generic harness (§4): explicit `[from, to]` pairs, `M0` comment-only control that
   MUST survive, BUILD-FAIL reported apart from KILLED. A survivor is a test gap → pin it (that is the behavioural RED).
6. Full suite + `test:static` from a clean `dist/`; measure `git diff --numstat main -- src test`; commit code **with**
   its records (`tasks.md` ticks, `apply-progress.md` section).
7. **Judgment Day**: frozen worktree, `jd-judge-a` + `jd-judge-b` in parallel, result shape `{findings, evidence}`
   (the installed skill's current shape — not the older graph-v1 rows). In parallel, a **separate independent
   verifier** (`general-purpose`) on its own worktree with a mandate to reproduce every figure, re-run the sweep and
   write up to six extra mutants of its own — **it found real gaps in every slice**.
8. Reproduce single-judge rows before correcting; correct (fix actor, or parent inline for small batches); commit code
   and record together; scoped re-judgment over the delta only. **Budget: two re-judgments**; a non-severe row found
   after the budget is corrected and disclosed as "measurement-checked, not re-judged".
9. Tribunal record in `docs/05-tribunal/INDEX.md` on the branch; push; PR (body ends with the Claude Code line);
   `gh pr checks --watch`; merge with `--merge --delete-branch`.

**3. Native review (RDD switch: on).** Run `gentle-ai review assess --cwd . --agent claude-code --base-ref <main sha>
--committed-only --untracked-scope=exclude --expected-untracked-inventory=<sha from the first error> --json` and record
tier and `review_due`. **Do not START the native review for a Judgment Day target**: the installed `judgment-day`
skill states it replaces ordinary 4R and both must never run on one target, and START's consent envelope belongs
to the Director. Record that in the slice's audit row, as PR-23..PR-25 did.

**4. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only those.
**PR-26 pins PT-15 and its half of PT-02** (task 26.4): PT-02's schema-shape half was pinned by PR-07a (`test/shared/tool-schemas.test.ts`), and the PT map in `tasks.md` also names PR-27 for it — add PR-26's file to the cell without removing PR-07a's.

**5. Budget policy.** 400 lines of authored src+test (`git diff --numstat -- src test`), disclosed PR-scoped exceptions
otherwise, measured at every tip and labelled with it. Session 27: PR-23 1,682 (1,282), PR-24 857 (457), PR-25 622
(222). Estimates price the v1 lines and miss the module doc, the ledger adaptation and the tests; expect PR-26
(≈330 estimated, ≈254 v1 lines over two ranges) to land well above its estimate. Add a *Size reconciliation* note
under the block's header in `tasks.md` (gate text left as written), as PR-23..PR-25 did.

**6. Frozen worktrees.** `git worktree add --detach ../telegram_bus_agent-worktrees/<name> <sha>`; junction
`node_modules` only for a worktree that must build; **unlink the junction before removing it**
(`cmd //c rmdir "<windows path>\node_modules"`).

**7. Remote delivery is authorized** (Director, session 14; DN-07/DN-08): push, PR, CI, merge.

---

## §3 — Pinned provenance values (re-verify with your own method; never trust a header blindly)

Rule: the pinned value is the exact byte range of the cited v1 lines **LF-normalized, including the terminating
newline** (`bus-v2-f1-pr-04-001`). Multi-range: ranges concatenated in the cited order, each with its newline
(PR-22a). Whole file: bare v1 path, all lines. Validate your method first by reproducing a known value.

| v2 path | v1 source @ `bf8f365` | verdict | v1 body sha256 |
|---|---|---|---|
| `src/shared/constants.ts` | `src/config.ts:26-166` | SEAM | `039d53a22b54f8c1a061c602f419e6272cd1f8a3fe260301d7fe36b4e892e15e` |
| `src/daemon/admission.ts` | `src/tools/fetch.ts:404-460,525-656` | SEAM | `3bd09d0d0291dcf7fe88a90eedcef1e5c1496cf4ea7a4c3b670aad3675c73192` |
| `src/daemon/serve/fetch.ts` | `src/tools/fetch.ts:664-927` | SEAM | `077561aec31396adc157692655a87318e2b8a67fd74e4907cb2e239d322b3787` |
| `src/daemon/serve/status.ts` | `src/tools/status.ts` (1-162) | SEAM | `7745b6eb6d0d8002193b2a4202e8dd8764f2d9179aa117c11b0a63a22e39a841` |
| `src/daemon/serve/thread.ts` | `src/tools/thread.ts` (1-164) | SEAM | `900f8be90853321ee609c0d6c3fa65a9f392a28329aacec732b61c882d0bfc89` |

**PR-26** cites `src/tools/send.ts:113-192,205-378` — a **two-range** SEAM: hash lines 113-192 then 205-378,
each LF-normalized with its terminating newline, concatenated in that order. Older values are in
`apply-progress.md` and in each module's header.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **A writer's RED is usually compile-level** (`TS2307` on the missing module). It is not behavioural evidence. | The behavioural RED is the parent's sweep: a mutant that survives, then dies on the test that pins it. Record it that way. | PR-23..PR-25 records |
| **Generic mutant harness** | `node odd/sweep.mjs <src> <dist test> <mutants.json>`; mutants are `[id, desc, from, to]`, each `from` must occur exactly once. **JSON strings cannot hold literal tabs** — write `\t`. A mutant that fails to build is not evidence; rewrite it (TS narrowing breaks `true \|\| x` forms). The harness lives in the untracked `odd/` tree (deleted at close): recreate it from `apply-progress.md` §PR-23's description. | session 27 |
| **Read the clock after any wait** | A handler that awaits (D-02) must re-read `now()` before stamping anything. | PR-23 parent readback |
| **`isOurBusiness` stores more than "from or to me"** | A REQUEST addressed to a name the roster cannot resolve is stored too (`protocol-apply.ts:82`, the `misaddressed` case). Do not claim otherwise in prose. | PR-24 round 1 |
| **Design names conditions no contract defines** | `poller_conflict`/`poller_rate_limited` (B-40), `secret_store_fallback` (B-41). `conditions-store` accepts four names; `Conditions` is hash-pinned. File, do not invent. | §7 |
| **Serve helpers are duplicated** | `listThreadIds`, `readBindingCheckpoint`, `resolveOriginUserId` exist in `serve/fetch.ts` and `serve/status.ts` (the last also in `serve/thread.ts`). Known debt, recorded; extract only in a slice that owns those files. | §PR-24 record |
| **`assess` refuses with an untracked `odd/`** | Pass `--untracked-scope=exclude --expected-untracked-inventory=<sha>` from the first error. | §2.3 |
| **Engram MCP `mem_save` may refuse** ("multiple active runtime sessions") | Use the CLI: `engram save "<title>" "<content>" --project connmuta --type <t> --topic <key>`. | session 27 |
| **Subagents were available all of session 27** | If `jd-judge-*` return `assistant reported an error`, fall back to PR-22a's two inline passes and disclose it. | `bus-v2-f1-pr-22a-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution in commits (global rule); PR bodies end with the Claude Code line. Write long messages to a file and use `git commit -F`. | session 27 |
| **`test/security/provenance.test.ts` reads a leading `/**` block as a vendor header** | A non-vendored module with no imports must not spell `Provenance:` there. | **B-33** |
| **`git ls-files` scanners only see tracked or intent-to-add files** | `git add -N` new files before `test:static`. | PR-09b… |
| **PT-22's token shape** | Synthetic bot ids use seven digits (`1234567:${"A".repeat(35)}`). | `repo-scan.test.ts` |
| **`node:sqlite`** | Rows are null-prototype; `.changes` is `number \| bigint`; a negative `LIMIT` means **no limit** (PR-23 `JD-B-002`). | PR-23 |
| **Lexicographic instants need canonical ISO strings** | Always `new Date(ms).toISOString()`. | `src/ledger/unknown-senders.ts` |
| **Bash executes backticks inside double quotes; heredocs over ~200 lines truncate silently** | Write files with the file tools or append in chunks; verify line counts. | sessions 13–21 |
| **`git reset --hard` is blocked by policy** | Use `git checkout <base> -- <paths>` and explicit removals. | sessions 14–16 |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11–17 |
| **`state.yaml` is YAML** | Parse every tracked YAML after editing (`python -c "import yaml,sys; yaml.safe_load(open(sys.argv[1],encoding='utf8'))" <f>`). | sessions 15–16 |
| **`node --test` output is ANSI-coloured; failures use `✖`** | Strip ANSI before parsing. | sessions 9–17 |
| **CI flake B-39** | `heartbeat: ticks at periodMs` / the SIGTERM test can fail a leg; re-run the failed job once and record it. PR-23..PR-25 were green at the first run. | **B-39** |
| **Ledger peer-body columns and cursor advance carry no token guard** | Stored as received; no receive-side scan exists in F1. | **B-37**, **B-38** |
| **Pronouns** | Refer to the Director by role, never with a gendered pronoun (a record draft did once in session 27; corrected before commit). | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm 132/210. Read [`../../AGENTS.md`](../../AGENTS.md) §1–§3, this file's §2, `tasks.md`'s
   **PR-26 block**, `specs/send-path/spec.md` (requirements "Validation pipeline and secret backstop run before any
   network call" and "Send input carries no destination"), design §9 and §12's `send.ts` rows.
2. **Create the ODD feature doc** `odd/tasks/<feature>.md` (untracked, deleted at close) and its Engram mirror
   `odd/<feature>/tasks`, before the first write. Decide the session's scope and say it in one line (session 27 took a
   whole unit; unit 8 is PR-26…PR-28 — take what fits, closing each slice fully).
3. **Branch** `f1/26-send-validate` from `main`, then run §2.2's pipeline:
   - **26.1 RED** `test/daemon/send/validate.test.ts`: "secret-shaped body rejected before any network call" (the error
     names the rule, never the matched text) and "encoded length guard reports headroom" (`wire.headroom_chars` vs a late
     `BODY_TOO_LONG`).
   - **26.2 GREEN** `src/daemon/send/validate.ts`: SEAM from `v1:src/tools/send.ts:113-192,205-378` (two ranges, §3);
     `BRIDGE_BUSY` removed; thread lookups against the ledger (`readThreadRecord`). Provenance entry → **22**.
   - **26.3 Verify** `npm run build && node --test "dist/test/daemon/send/validate.test.js"`.
   - **26.4 Docs** PT-02 (its half) and PT-15 cells in `docs/02-architecture/THREAT-MODEL.md` §4.
4. Audit per §2.2 steps 7–9; merge.
5. **Close**: rewrite this file for the next slice, prepend to [`LOG.md`](./LOG.md), sweep `AGENTS.md`'s status line
   and `state.yaml` (parse both), delete `odd/`, save the session summary to Engram, commit on `main`, push, and hand the
   Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. Apply-time edits are **notes appended** to a block, never rewrites of
  a gate's text (session 27 added size reconciliations for PR-23..PR-25 and two design-citation notes).
- **PR-01…PR-25 are complete; do not re-slice, re-audit or re-open them.** Units 4, 5, 6 and **7** are closed. A defect
  in a merged module is its own slice with its own audit, not a drive-by edit.
- PR-22b's close-out was repaired in session 27 (`fc1c09f`); its records are complete now.
- Provenance hash rule, registry and range conventions are ratified — §3.
- Doc-hygiene rule: never quote a matched-and-rejected secret-shaped literal in `apply-progress.md`.
- Do not "fix" the bare `conmuta validate` refusal or the case-insensitive `Authorization` match without a decision.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`. TypeScript 7.0.2 needs `"types": ["node"]`.
- `test:wrong-room` executes 0 tests and exits 0 until PR-41 wires the job.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-40** | Design §8.1's `poller_conflict`/`poller_rate_limited` conditions have no contract; the poller raises neither. The 409 requirement is met through `offsets.last_error_code`, now surfaced by PR-24's `status`. Two dispositions in the checklist. | Director |
| **B-41** | Design §6's `secret_store_fallback` condition has no contract and `bootstrap.ts` drops it; `status.secret_store.kind` carries the fact, not the reason. | Director |
| B-39 | CI is intermittently red on two wall-clock tests; re-run once and record. | Director → Kairo |
| B-37 / B-38 | Cursor advance and peer-body columns carry no token guard; no receive-side scan in F1 (PR-22a closed without one). | Director → Kairo |
| B-22, B-32, B-36 | Advisory findings of earlier native reviews, recorded not actioned. | Director |
| B-23…B-31, B-33…B-35 | Earlier audit follow-ups (see `CHECKLIST.md`). | as listed there |
| PR-11/12/13 escalations | SUGGESTION-class rows that survived their second rounds. Nothing blocks. | Director |
| carried (PR-06) | Digest blind spots (`MAX_THREAD_HISTORY` saturation); the fence does not neutralise `&`. | Director |
| B-16 / D-10, B-11, B-12 / B-13 | Licence files and copyright line; trademark screening; macOS scope; migration runbook (PR-38). | Director |
| B-05, B-08, B-09 | F0 spikes still open. | Director + Kairo |

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI, TypeScript 7.0.2, SQLite 3.53.0 via `node:sqlite`.
  **701 tests** (700 pass, 1 skip), `test:static` **8/8**. RDD **on** (global).
- Line endings `eol=lf` via `.gitattributes`.
- Verification worktrees: `../telegram_bus_agent-worktrees/`. An **empty, locked directory `pr23-verify`** may remain
  there from session 27 (a process held it); it is not a registered worktree — delete it when the lock is gone.
- GitHub Actions: Node 24.15 and 26 matrix on pull requests.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**.
- Arena bridge: `.mcp.json` points at `http://127.0.0.1:8766/mcp`, **down**. Never quote or commit.
