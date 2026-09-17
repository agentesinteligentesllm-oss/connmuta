# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.

## Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress. PR-01a…PR-05 and both re-sliced PR-06 slices merged to `main`** (`#1`–`#6`, then `#7` `9053908` and `#8` `cf19561`); next slice **PR-07a**. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status reads `nextRecommended: apply`, **32/210 tasks complete**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Artifacts | [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) — **45 slices, 210 tasks**; PR-06's row amended in place to record the re-slice into PR-06a/PR-06b with the final measured lines. No later PR re-numbered. | Engram under project **`connmuta`** (see the Engram row below) |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**` for a leading `Provenance:` header; the scanned set must equal `test/fixtures/v1-provenance.json` — now **8 entries**: `constants` SEAM, `envelope` AS-IS, `envelope.test` AS-IS, `secrets` SEAM, `thread-record` SEAM, `protocol-apply` SEAM, `protocol-select` SEAM, `fence` SEAM. Every vendored file (AS-IS or SEAM) needs a design §12 header **and** a fixture entry, or `test:static` fails | `test/security/provenance.test.ts` |
| **The registry scanner never validates the header hash against v1** | It only asserts that a SEAM body *differs* from the pinned value. The pinned `v1 body sha256` is verified **only** by independent re-derivation from the read-only v1 checkout. Do it every time, and never with `head -c -1` | `test/security/provenance.test.ts:113-119` |
| Code on `main` | `src/shared/{constants,version,envelope,secrets,thread-record,protocol-apply,protocol-select,fence}.ts` + twins, `test/fakes/delivered-text.ts`, `test/twins.test.ts`, `test/security/{pack,repo-scan,provenance}.test.ts`, fixtures — **153 tests**, `test:static` **8**, verified from a clean detached worktree of `cf19561` | PRs `#1`–`#8` |

## Pinned provenance values already verified (re-verify with your own method, do not trust blindly)

| v2 path | v1 source | verdict | v1 body sha256 |
|---|---|---|---|
| `src/shared/protocol-select.ts` | `src/protocol.ts:335-478` @ `bf8f365` | SEAM | `29bcf0038187541d6448d5c68a554d77b0789fbdcfea77ce087de441d96621ce` |
| `src/shared/fence.ts` | `src/tools/fetch.ts:43-63` @ `bf8f365` | SEAM | `68e241b22383bf6a9ec4a9d112b1960fe4c9c6d00fe2c6f03644f47a978be878` |

Wrong-value controls (what you get if the trailing newline is wrongly stripped): `110b649676bbff0c1f39b4a4ebe9fa0b962bb6f4c6e5d359ab81296ae5c6dd53` (protocol) and
`6ef490b84bffe7af2110342a027e7f68c60ae86df2ab15b04c0aa9cdb8b3118a` (fetch). `src/protocol.ts` has
477 real lines; the `478` in the citation is the array-slice convention counting the file's own
trailing newline. `src/tools/fetch.ts` line 63 is followed by real lines 64–65.

## New this session — read these before planning anything

| Item | State | Pointer |
|---|---|---|
| **The SDD phase dispatcher is blocked by a host-owned gate** | `sdd-apply` dispatch is refused with `SDD dispatch refused before child launch: SDD preflight cancelled or invalid; no session consent recorded.` The Pi-native preflight is a **native `ctx.ui.select` dialog** an agent can neither satisfy nor fabricate (`extensions/gentle-ai.ts` ~L9255 → `lib/sdd-preflight.ts:896-926`); answering the canonical `Gentle AI SDD preflight 1/3:`–`3/3:` questionnaire through the agent's question tool does **NOT** create consent. **The unblock lever is human only:** run `/gentle:sdd-preflight` in the TUI, or launch the phase agent from a host that confirmed it. When it is unreachable, ODD is the fallback — implement the slice under the same SDD contract and let the orchestrator own the SDD checkbox/progress bookkeeping, disclosed as a deviation | this session's `apply-progress.md` PR-06 section |
| **`gentle-ai` is 3.0.2 for the CLI and the attempt ledger is retired** | Only `sdd-attempt grant` remains; `acquire`, `settle`, `status` and `reset` are gone (`Runtime attempt operations are retired`). Every older instruction about `--max-changed-lines`, `settle` or a ledger `reset` is obsolete. `gentle-pi` itself is 3.1.1 | `gentle-ai sdd-attempt --help` |
| **Engram project key changed** | The provider now derives the session project from the git remote as **`connmuta`** and **rejects** writes passed as `telegram_bus_agent` (`session project does not match requested project`). Reads across projects still work, so the older `telegram_bus_agent` observations remain readable; new writes must use `connmuta` | `mem_current_project` |
| **The tribunal audit was WAIVED by the Director for the PR-06 mission** | The Arena bridge (`127.0.0.1:8766`) is an Electron app that was down; the Director explicitly waived the Alpha audit and directed that the mission finish with internal capability. Recorded as a **waiver, not a silent skip**, in `docs/05-tribunal/INDEX.md` (`bus-v2-f1-pr-06-waiver-001`) and `apply-progress.md`. **DN-05 is not satisfied for PR-06 — it is waived by the authority that owns it.** Ask the Director how future slices are audited before assuming either path | `docs/05-tribunal/INDEX.md` |
| **Judgment Day was the substitute, and it found real defects** | Two blind read-only judges (`jd-judge-a`, `jd-judge-b`) over the frozen range `ef58020..98ca9ef`, then a scoped re-judgment over the fix delta. Round 1 verdict `APPROVED` (no CRITICAL) with 6 ledger items, 4 corroborated by both judges; the owner then corrected the 3 *introduced* ones and queued the 2 *pre-existing* ones. Round 2 found no CRITICAL and no behavioral regression, only record-consistency defects the correction round itself created — all fixed. Judges must return exactly `{"findings":[…],"evidence":[…]}`; `review-risk`/`review-*` agents are **not** dispatchable outside the native review lifecycle (`unsupported input field`) | `~/.agents/skills/judgment-day/SKILL.md` · `apply-progress.md` "Judgment Day audit" |
| **Two pre-existing defects queued for the Director (recommended backlog ids)** | (1) `computeWorkDigest` has discrete blind spots — `opened_type`, a same-length history replacement, `closure_delivered`, `to_user_id`, a `from`/`to` swap — and `history.length` **saturates** at `MAX_THREAD_HISTORY = 50`, so a further peer reply leaves a byte-identical digest and the quiet tick answers "nothing changed" while an unread reply waits. Proposed minimal fix: include the last history entry's `eid` in the row. (2) The fence body escape neutralises `<` but not `&`, so the fence is not injective (`wrapUntrusted("&lt;") === wrapUntrusted("<")`); THREAT-MODEL §7 ratifies the fence as *inherited unchanged*, so it needs its own decision | `apply-progress.md` "Queued, deliberately not fixed here" |
| **Mutation testing is what proves a test can fail** | Four `selectTiered`/digest cases had fixtures a wrong implementation could luck into — a mutant returning a global sort passed the ordering *and* reachability cases until the fixtures were made adversarial. Always `rm -rf dist` before running a mutant: a `cp`-restored source plus `tsc -b` can leave stale output and a phantom failure. A mutant whose build fails is not evidence | `apply-progress.md` mutant matrices |
| **A provenance header's claim is a claim** | `escapeAttribute` escaped `<` but not `>`, so a value with `>` closed the opening tag early while the soundness helper still said "sound" — the header asserted something false and unfalsifiable. `>` ENDS a tag, `<` only opens one. Both judges caught it independently; the fix added `>` and a case that fails without it. When you write a `Changes:` line, make it true and make a test able to falsify it | `src/shared/fence.ts:36-45` |
| **`gh` refuses `--force-with-lease`** | The tooling's safety policy blocks destructive git even when the Director authorizes it, so do **not** plan a force-push. The non-destructive equivalent used here: merge the corrected base into the pushed tip (`git merge f1/06a-fence`) and then set the tree wholesale from the verified commit (`git checkout <verified-tip> -- .` + `git add -A` + `git commit`); the push is then a fast-forward and the tree is provably identical (`git diff --stat <verified-tip> HEAD` empty) | this session's PR #8 history |

## Next session — exact start

1. Read [`../../AGENTS.md`](../../AGENTS.md) §1 (this file is step 0), then [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) header + the **PR-07a and PR-07b** sections, `apply-progress.md` (the PR-06 section, its Judgment Day ledger, the queued findings), and `design.md` §12 rows for `src/tools/send.ts:47-109` + `src/index.ts:29-42` (`shared/tool-schemas.ts`) and `src/index.ts:45-103` (`shared/error-payload.ts`).
2. `git branch --show-current` must be `main`; `git pull --ff-only`; remove a leftover `dist/` before the first build. Never `gh auth switch`; every `gh` call uses `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh …`.
3. Run the SDD preflight (`AskUserQuestion`, canonical marker text **and option order**) and `gentle-ai sdd-status f1-daemon-registry-thin-client --cwd <repo> --json`; it must say `nextRecommended: apply`, **32 completed**, `blockedReasons: []`. Otherwise stop and report.
4. **Decide with the Director how this slice is audited** given the PR-06 waiver: either unblock the SDD dispatcher (`/gentle:sdd-preflight`) and run `sdd-apply`, or repeat ODD + Judgment Day. Ask; do not assume either.
5. PR-07a is `shared/tool-schemas.ts` + `shared/error-payload.ts` (both SEAM, ≈290 lines) on `f1/07a-tool-schemas-errors` from `main`; it needs **two** fixture entries. PR-07b (`shared/tool-output.ts`, ≈385 lines) follows, and **re-verify whether its planned implementation/twin split into PR-07b/PR-07c is CI-safe** before trusting the tasks-phase plan: `test/twins.test.ts:29-44` requires every `src/**/*.ts` to have its twin in the *same* tree, so a split would fail the first PR's own merge (the finding that carried PR-05).
6. After the slice: measure the real diff, read the new files in full, ask the Director before committing, commit as work units, verify from a clean detached worktree (`git worktree add --detach ../telegram_bus_agent-worktrees/verify-07a <sha>`, then `npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js" && npm run test:static`, then remove it), and run the audit path chosen in step 4.
7. Stop at a PR boundary. Rewrite this file, append to [`LOG.md`](./LOG.md), record the debate or waiver in the tribunal index, sweep the status lines in `AGENTS.md`, `README.md`, `docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml`, `mem_session_summary`, commit docs on `main`, push.

## Do not redo

- Spec, design and tasks are gated and audited; unchanged since `bus-v2-f1-pr-01-001` except PR-06's row, amended in place to record its own re-slice.
- Provenance hash rule and registry: decided and ratified (`bus-v2-f1-pr-02-002`). The four older vendored hashes are in the previous handoff's `Do not redo` list; the two PR-06 values are in the table above.
- **Doc-hygiene rule** (ratified `bus-v2-f1-pr-03-001`): never quote a matched-and-rejected secret-shaped literal in `apply-progress.md`; describe the shape. PT-22 scans every tracked file.
- **Hash cross-check rule** (ratified `bus-v2-f1-pr-04-001`): never blind-strip a trailing byte when re-deriving a line-range SEAM hash.
- **PR-06 is merged and re-sliced; do not re-slice it again.** `tasks.md`'s PR-06 row carries the final numbers (PR-06a 192 authored lines, PR-06b 426 with a disclosed 26-line PR-scoped exception).
- **THREAT-MODEL §4 rule**: a PR updates the file-name cell of the PT rows **it actually pins** — and only those. PR-06a deliberately left PT-14 as `daemon unit` because its pinning test is daemon-side (design §15 maps PT-14 to `daemon/serve/fetch.ts`); PR-25's task 25.4 owns it. An over-claimed cell is a defect: two independent judges caught exactly that. Do not re-add a PT-14 label to `test/shared/fence.test.ts`.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake imports it, never redefines it.
- TypeScript 7.0.2 needs `"types": ["node"]`; empty composite units are `TS18003` — `src/{client,daemon,cli}/tsconfig.json` join the root `references` when their first `.ts` lands (PR-08 cli, PR-15 daemon, PR-32 client).
- `test:wrong-room` matches by glob until PR-41; `npm pack` in `pack.test.ts` spawns `npm-cli.js` on win32. `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by path; `git ls-files`-based scanners see only tracked or staged files, so `git add` (or `git add -N`) before a local RED/GREEN.
- `test/security/repo-scan.test.ts:13` intentionally keeps its own `TOKEN_SHAPE_RE` copy — orthogonal by design (`bus-v2-f1-pr-03-001`), not a defect.
- Type-only modules satisfy Strict TDD's triangulation gate via the explicit type-only exception in `strict-tdd.md`; a missing-module `TS2307` from `tsc` is a legitimate RED for a brand-new module.
- **Stale comments and stale records**: when a change alters behavior a prior file's comment describes, grep that prior file for the OLD behavior's keywords rather than assuming one fix is enough — and when you correct a figure or a claim, grep the whole record for every other place that repeated it. Two judges found the same defect class twice in one session.

## Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-16 / D-10 | `LICENSE` shipped with `private: true`; SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line open; a **real tenant deny-list** for PT-22 must live outside the tree (CI secret) — decide at PR-42 | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant (`src/shared/constants.ts`) | Director |
| new | Digest blind spots incl. the `MAX_THREAD_HISTORY = 50` saturation — proposed minimal fix: the last history entry's `eid` in the digest row | Director → Kairo |
| new | The fence's body escape does not neutralise `&`, so the fence is not injective; needs its own decision because THREAT-MODEL §7 ratifies the fence as inherited unchanged | Director |
| new | How future slices are audited, given the PR-06 tribunal waiver | Director |
| — | `npm test` runs whatever is in a stale `dist/`; consider a `clean` step in a later PR, audited | Kairo → Alpha |
| — | GitHub Actions deprecation warning: `actions/checkout@v4` and `actions/setup-node@v4` target Node 20 — bump majors in a later CI PR, audited | Kairo → Alpha |
| — | T22 bytes-per-hour ceiling and origin-label organisation marker: no backlog id (PR-42) | Director |
| B-07, B-08 | Real-Telegram and Windows-ACL spikes | Director + Kairo |

## Environment facts the next session should not re-measure

- Machine: Windows 11, Node 24.16, npm 11.5, gentle-ai 3.0.2 CLI, gentle-pi 3.1.1, TypeScript 7.0.2 pinned.
- Line endings: both repos have `core.autocrlf=true`; this repository forces `eol=lf` through `.gitattributes`, the v1 checkout has none — vendored bodies are copied from `git show bf8f365:<path>` (raw blob) and the provenance hash normalizes CRLF→LF.
- `node --test` summary lines are `ℹ tests / ℹ pass / ℹ fail` (with ANSI colour), not `# tests`.
- GitHub Actions: the workflow is on `main`, so `pull_request` runs trigger on PR open (≈40 s per matrix entry). `gh pr merge N --merge --delete-branch` also checks out `main` and pulls.
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365`, read-only. Verification worktrees live in `../telegram_bus_agent-worktrees/` and are removed as soon as their run finishes. That checkout carries one pre-existing untracked file, `alpha_response.json` (an unrelated old Arena envelope) — harmless, not this project's state.
- Arena bridge: `.mcp.json` (gitignored) points at `http://127.0.0.1:8766/mcp`, which is the **Arena Orion Electron app** (`electron .` in `../Arena_construccion/doble_ventana/Arena_Orion`) and is **down** unless the Director launched it. Never quote `.mcp.json` contents and never commit it.
