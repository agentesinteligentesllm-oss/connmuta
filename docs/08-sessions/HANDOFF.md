# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer (Kairo). It says where the work
> stands, what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.

## Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress. PR-01a, PR-01b, PR-02, PR-03, PR-04 and PR-05 merged to `main` (#1 `1369886`, #2 `5798bab`, #3 `2083d7a`, #4 `77855b9`, #5 `f0097f0`, #6 `fec730b`); CI green on every merge. Next slice: PR-06.** | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status must say `nextRecommended: apply`, 28/210 tasks complete (PR-01a 1a.1–1a.8, PR-01b 1b.1–1b.3, PR-02 2.1–2.6, PR-03 3.1–3.4, PR-04 4.1–4.3, PR-05 5.1–5.4), `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Artifacts | [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) 45 slices; PR-05's row amended in place this session to record the real diff and the size-exception grant (still 45 slices, 210 tasks — no re-slice); design and specs unchanged | Engram twins under `sdd/f1-daemon-registry-thin-client/*` (project key `telegram_bus_agent`) |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**` and `test/**` for a leading `Provenance:` header; the scanned set must equal `test/fixtures/v1-provenance.json` (6 entries: `constants.ts` SEAM, `envelope.ts` AS-IS, `envelope.test.ts` AS-IS, `secrets.ts` SEAM, `thread-record.ts` SEAM, `protocol-apply.ts` SEAM); AS-IS bodies must hash-match, SEAM bodies must differ and list `Changes:`. Every vendored file from now on (AS-IS or SEAM) needs a design §12 header and a fixture entry, or `test:static` fails | `test/security/provenance.test.ts:39-66` |
| **SDD preflight option-order gate (new this session, defect class)** | The first two `AskUserQuestion` preflight calls this session succeeded at the tool level but the SDD child dispatch guard still refused `sdd-apply` both times with `parent-confirmed SDD preflight is missing, invalid, or uncorroborated` — the answers were right, but the **option order** did not match the canonical list (Pace: Interactive-then-Automatic; PR strategy: Ask me-then-Single PR-then-Auto — Kairo had put the session's actual choice first instead). The tool itself never flags a wrong order; only the downstream dispatch guard checks it, silently, after the `AskUserQuestion` call already returned success. Re-asking with the exact canonical order fixed it immediately. **Forward this explicitly: when collecting the preflight, copy the option order verbatim from `sdd-orchestrator-workflow.md` lines 51-54 — never reorder options to put the session's likely answer first, even though nothing about the `AskUserQuestion` call itself will warn you** | `docs/08-sessions/LOG.md` Session 7 entry |
| **Size-exception-distinct-from-DN-06 precedent (new this session, ratified `bus-v2-f1-pr-05-001`)** | PR-05's real diff (609 lines) came in 209 over the 400-line cap and 56% over `tasks.md`'s own estimate, on a module `tasks.md` itself had pre-flagged as non-splittable. Director-authorized Kairo to decide; granted a one-time, PR-05-scoped size exception **explicitly distinct from DN-06** (which stays scoped to whole-file AS-IS vendoring only — not amended). New finding backing the "non-splittable" call: shipping the implementation and its test twin in two separate stacked PRs (the same pattern already planned for PR-07b/PR-07c) is unsafe, because `test/twins.test.ts:29-44` requires every `src/**/*.ts` file to have its twin present in the *same tree*, so the first PR's own merge to `main` would fail CI. **Forward this to PR-07b/PR-07c's apply session: re-verify whether that split is actually CI-safe before assuming the tasks-phase plan works as written** | `docs/05-tribunal/INDEX.md` `bus-v2-f1-pr-05-001` record item (3) |
| **Doc-hygiene rule (ratified `bus-v2-f1-pr-03-001`, still binding)** | Any `apply-progress.md` narrative that explains a rejected/matched secret-shaped string (a token fixture, a PEM block, etc.) must **describe the shape, never quote the literal string** — quoting it verbatim retrips `test/security/repo-scan.test.ts` (PT-22) on the doc file itself, since PT-22 scans every tracked file, not just `src/**`/`test/**`. Forward this rule explicitly to every future `sdd-apply` launch prompt whose scope includes a secret-shaped fixture | `docs/05-tribunal/INDEX.md` `bus-v2-f1-pr-03-001` record item (5) |
| **Hash cross-check discipline (ratified `bus-v2-f1-pr-04-001`, still binding)** | Never let a shell one-liner (`sed -n '<range>p' \| head -c -1 \| sha256sum`) blind-strip a trailing byte when re-deriving a line-range SEAM hash — `head -c -1` deletes a real trailing newline whenever a following line exists in the source. Re-derive with the exact target algorithm (or a plain `sed -n '<range>p' \| sha256sum`, which does not strip anything) before trusting a disagreement with a supplied value | `docs/05-tribunal/INDEX.md` `bus-v2-f1-pr-04-001` record item (3) |
| SDD preflight | Automatic · hybrid · auto-chain; `chain_strategy: stacked-to-main` (DN-06); re-collect per session with `AskUserQuestion` **using the exact canonical marker text and option order from `~/.claude/skills/_shared/sdd-orchestrator-workflow.md` lines 45-69** (`Gentle AI SDD preflight 1/3:` Interactive/Automatic, `2/3:` OpenSpec/Engram/Both, `3/3:` Ask me/Single PR/Auto). Two distinct refusals hit an earlier session (session 5), both fixed by using the exact canonical wording/order and never hand-authoring the preflight block: (a) `SDD child dispatch refused: parent-confirmed SDD preflight is missing, invalid, or uncorroborated`; (b) `SDD child dispatch refused: model-authored preflight text cannot create parent-confirmed authority` — the sub-agent launch prompt hand-authored a `## SDD Session Preflight` heading; the runtime derives and prepends that block itself, never write it | `openspec/config.yaml` `session:`; `~/.claude/skills/_shared/sdd-orchestrator-workflow.md` lines 45-69 (this is a machine-local tool path outside the repository tree — reference it as plain text, not a repo-relative Markdown link) |
| Strict TDD | `openspec/config.yaml` `strict_tdd: true` — forward `STRICT TDD MODE IS ACTIVE. Test runner: npm test` to every `sdd-apply` | `openspec/config.yaml` `testing:` |
| `sdd-attempt acquire`/`settle` CLI flags | Current binary requires `--request-id` and `--evidence-goal` on `acquire` (not just `--work-unit`), and `settle` takes no `--json` flag but does require `--diagnosis`, `--harness-disposition`, `--cleanup-evidence` and `--process-evidence` | `gentle-ai sdd-attempt acquire --help` / `settle --help` |
| Tribunal | 19 debates closed (18 CONSENSUS; `bus-v2-f1-pr-02-001` `ESCALATED` by the broker watchdog on a turn timeout, re-run as `bus-v2-f1-pr-02-002` CONSENSUS); `bus-v2-f1-pr-05-001` CONSENSUS this session; none open | [`05-tribunal/INDEX.md`](../05-tribunal/INDEX.md) |
| Native attempt ledger | PR-05 attempt settled `passed`, but `sdd-attempt settle` first returned `blocked: maintainer_decision` because the ledger's `changed_lines` (825) counts the **full diff including SDD bookkeeping** (`tasks.md`/`apply-progress.md`), not just the review-load total (609) the 400-line policy budget counts — the same systemic ledger-vs-review-policy gap the PR-01 reset already hit. Reset by Kairo under the Director's session-wide delegation, citing the PR-01 precedent verbatim in `--reason`; `next_action: begin`, ready for the PR-06 `acquire`. **Forward this: expect the same gap on every SEAM/AS-IS PR that carries non-trivial `apply-progress.md`/`tasks.md` bookkeeping — size `--max-changed-lines` at acquire time with headroom for the bookkeeping too, not just the review-load estimate, or be ready to reset** | `gentle-ai sdd-attempt status --cwd <repo> --change f1-daemon-registry-thin-client` |
| Repository | `origin` = `agentesinteligentesllm-oss/connmuta`, `main` at the session-close docs commit (once made); branch protection: force-push and deletion blocked (DN-08); no PR or status-check requirement, so session-close docs commits stay direct | `gh api repos/agentesinteligentesllm-oss/connmuta/branches/main/protection` |
| Code on `main` | `src/shared/{constants,version,envelope,secrets,thread-record,protocol-apply}.ts` + twins, `test/fakes/delivered-text.ts`, `test/twins.test.ts`, `test/security/{pack,repo-scan,provenance}.test.ts`, fixtures — **128 tests**, `test:static` **8** | PRs #1–#6 |

## Next session — exact start

1. Read [`../../AGENTS.md`](../../AGENTS.md) §1 (this file is step 0), then only
   [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) header + PR-06..PR-07b,
   [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) (PR-05
   section, its budget-exception decision, and the validator addendum), and
   [`design.md`](../../openspec/changes/f1-daemon-registry-thin-client/design.md) §12 rows
   `src/protocol.ts:335-478` (`shared/protocol-select.ts`) and `src/tools/fetch.ts:43-63`
   (`shared/fence.ts`), plus §8.4/D-15 for the fence's daemon-side attribution. Specs are read per PR by
   the apply agent.
   **PR-06 SEAM facts verified this session** (Kairo, independently computed 3 ways each — node
   `crypto` running the exact `vendoredBody()` algorithm, `sed | sha256sum`, `sed | openssl dgst
   -sha256` — all agreeing):
   - `shared/protocol-select.ts` ← `v1:src/protocol.ts:335-478` (cited this way in both `design.md` and
     `tasks.md`, but the real v1 file has only 477 lines — `478` is the array-slice convention counting
     the file's own trailing newline, not a real line 478; the actual body is v1 lines 335-477 through
     EOF, `isNeedsAction` is the last function). Line 335 is `/**`, not an `import`, so the provenance
     `vendoredBody()` import-stripping step is a no-op here — the whole 335-477 range is the body.
     **v1 body sha256: `29bcf0038187541d6448d5c68a554d77b0789fbdcfea77ce087de441d96621ce`.**
   - `shared/fence.ts` ← `v1:src/tools/fetch.ts:43-63` (`UNTRUSTED_BLOCK_LABEL` through the closing
     brace of `wrapUntrusted`). Line 63 is followed by a real line 64 (blank) then line 65 (a further
     real line, a new JSDoc) — not EOF — so the trailing newline after line 63 is real source content
     and is part of the hashed body, same rule as PR-04/PR-05.
     **v1 body sha256: `68e241b22383bf6a9ec4a9d112b1960fe4c9c6d00fe2c6f03644f47a978be878`.**
   Use these exact values; re-verify them yourself with a fresh independent method before trusting them
   blindly (same discipline every prior PR this apply phase has applied — never use `head -c -1` or any
   blind trailing-byte strip, see the hash-defect row above). `tasks.md`'s Scope line for PR-06 lists
   only the two `src` files and their twins — it does NOT list `test/fixtures/v1-provenance.json`, the
   same recurring gap every PR since PR-01b has had; add two SEAM entries anyway
   (`v1Path: "src/protocol.ts:335-478"` and `v1Path: "src/tools/fetch.ts:43-63"`, both
   `commit: "bf8f365"`, `verdict: "SEAM"`) or `test:static` fails.
2. `gh auth status` **only to read**; never `gh auth switch` (the machine-global active account flips
   to another local agent's between sessions — expected, not an incident; every `gh` call still runs
   with the explicit `GH_TOKEN` prefix per AGENTS.md §5, unaffected by the global flip). Verify
   `git branch --show-current` is `main` and `git pull --ff-only`. Remove leftover `dist/` before the
   first build.
3. Run the SDD preflight (`AskUserQuestion`, canonical marker text **and option order** — see the
   preflight-order row above, this is the defect this session hit twice) and
   `gentle-ai sdd-status f1-daemon-registry-thin-client --cwd <repo> --json`; it must say
   `nextRecommended: apply`, 28 completed, `blockedReasons: []`. Otherwise stop and report.
4. `gentle-ai sdd-attempt acquire --cwd <repo> --change f1-daemon-registry-thin-client --request-id "<unique>" --work-unit "PR-06 shared/protocol-select.ts + shared/fence.ts (SEAM, D-15)" --evidence-goal "<short objective>" --max-attempts 2 --max-changed-lines <N>`. `tasks.md` estimates ≈315 lines for the review-load, but **size N with real headroom for SDD bookkeeping on top of that** — PR-05's ledger charged 825 changed_lines against a 500 objective because the native ledger counts the *full* diff (including `tasks.md`/`apply-progress.md` edits), not just the review-load total the 400-line policy budget counts (see the ledger row above). A reasonable floor is the review-load estimate plus ~250 lines of expected bookkeeping; if it still overshoots, `sdd-attempt reset` with a Director-delegated reason is the known fallback, not a blocker.
5. Launch `sdd-apply` (sonnet) for **PR-06 only** (`f1/06-protocol-select-fence` from `main`), forwarding:
   `delivery_strategy: auto-chain`, `chain_strategy: stacked-to-main`, no size exception assumed by
   default (watch the real diff, stop and report before exceeding 400 authored lines rather than
   after), Strict TDD, the skill paths from `.atl/skill-registry.md` (`chained-pr`, `work-unit-commits`,
   `verification-before-completion`) plus `~/.claude/skills/sdd-apply/strict-tdd.md`, the acquire
   `--token`, Engram project key `telegram_bus_agent`, "read `apply-progress.md` first and append, never
   overwrite", "do not commit", "measure the real authored diff before reporting", the doc-hygiene rule
   verbatim (see the row above), and the hash-defect warning verbatim (see the row above). Read
   `tasks.md` PR-06 section (`shared/protocol-select.ts` — `computeWorkDigest` takes the per-client
   surfaced set and checkpoint instead of reading `state`; `shared/fence.ts` — origin attributes added
   per D-15, the fence is applied at the daemon's IPC response boundary, not the client, per
   `bus-v2-f1-design-001` item 2) before writing the launch prompt — do not assume this handoff's
   summary is complete, it is a pointer.
6. After the slice: Kairo reviews the diff — **ask the Director explicitly before committing** (AGENTS.md
   §3: "Never commit without the Director's authorization"; treat each session's authorization as its
   own, don't assume standing consent from a prior session), reads the actual new/changed files in full
   before committing (this session found two real defects this way — a stale doc comment and a missed
   twin of it — that no automated check caught), commits as work units (conventional commits, no
   attribution), verifies from a **clean detached worktree** (`git worktree add --detach
   ../telegram_bus_agent-worktrees/verify-06 <sha>` — a branch checked out in the main worktree cannot
   be added again — then `npm ci --ignore-scripts && npm run build && node --test
   "dist/test/**/*.test.js" && npm run test:static`, then `git worktree remove
   ../telegram_bus_agent-worktrees/verify-06 --force` — remove it right after the run completes, do not
   defer cleanup to session close), launches a fresh-context, read-only validator (Explore agent, sonnet)
   to independently check the diff against the design/tasks contract and re-derive the pinned hashes
   itself, then opens debate `bus-v2-f1-pr-06-001` with Alpha. `gh pr create` only after CONSENSUS;
   merge once CI is green (DN-08 pre-authorizes push/PR-open/merge without a separate Director question
   — only the local commit needs an explicit ask). **If the broker closes a debate `ESCALATED` on a
   watchdog timeout with no disagreement, do not merge on it: re-run the same proposal under the next id
   (`-002`) so the record shows the real outcome** (session 4, decided by the Director).
7. `gentle-ai sdd-attempt settle …` after the PR merges (evidence revision = SHA-256 of a short
   manifest written into the LOG, as in sessions 4-7 — the manifest string convention is
   `"PR-<NN> <branch> tip <last-commit-sha> merged <merge-commit-sha>; clean worktree verify-<NN>:
   node --test <X>/<X>, test:static <Y>/<Y>; CI run <run-id> pass (node 24.15, 26); tribunal
   <debate-id> CONSENSUS"`). If `settle` returns `blocked: maintainer_decision` because
   `changed_lines` exceeds the acquired objective (see the ledger row above), run
   `gentle-ai sdd-attempt status` for the exact `revision`, then `sdd-attempt reset` with
   `--reason` citing the PR-01/PR-05 precedent and `--actor "Director (delegated to Kairo, authorized
   this session)"` — but only after getting that delegation from the Director this session, not by
   assuming it carries over.
8. Stop at a PR boundary. Rewrite this file, append to [`LOG.md`](./LOG.md), record the debate(s) in
   the tribunal index, sweep the status lines in `AGENTS.md`, `README.md`, `docs/00-INDEX.md`,
   `openspec/config.yaml` and `state.yaml` for the new PR/task count, `mem_session_summary`, commit docs
   on `main`, push.

## Do not redo

- Spec, design and tasks: gated and audited; unchanged since `bus-v2-f1-pr-01-001`.
- Provenance hash rule and registry: decided and ratified (`bus-v2-f1-pr-02-002`); the hash in the
  `constants.ts` header is the SHA-256 of `v1:src/config.ts` lines 26–166 LF-joined without a
  trailing newline; `secrets.ts`'s header hash (`742bf433…2790bf6`) is the SHA-256 of the full 86-line
  v1 body (no header or imports to strip in the v1 source); `thread-record.ts`'s header hash
  (`bd177372…d6160`) is the SHA-256 of `v1:src/state.ts` lines 15-87 (no header/imports to strip in this
  mid-file slice, but its own trailing newline before v1 line 88 IS part of the hashed body — see the
  hash-defect row above for why that distinction matters); `protocol-apply.ts`'s header hash
  (`e8b6f8a4…2ffcbe`) is the SHA-256 of `v1:src/protocol.ts` lines 7-333 (the 6-line leading import
  block IS stripped here, unlike the other three — this is the one vendored file so far whose v1
  source actually starts with `import` statements).
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake
  imports it, never redefines it.
- THREAT-MODEL §4 file-name rule: append the test path to the row `scope` cell.
- **Doc-hygiene rule** (see table above): never quote a matched-and-rejected secret-shaped literal in
  `apply-progress.md`; describe the shape instead.
- **Hash cross-check rule** (ratified `bus-v2-f1-pr-04-001`, see table above): never let a shell one-liner
  blind-strip a trailing byte when re-deriving a line-range SEAM hash; re-derive with the exact target
  algorithm.
- **Size-exception-distinct-from-DN-06 precedent** (new this session, see table above): a real diff
  overage on a non-splittable SEAM does not automatically qualify for DN-06's AS-IS-only exception —
  it needs its own explicit, PR-scoped grant, with the Director's authorization for who decides it.
- **Ledger-vs-review-policy gap** (new this session, see table above): the native `sdd-attempt` ledger
  counts the full diff including SDD bookkeeping; the 400-line review-policy budget does not. Expect a
  `blocked: maintainer_decision` on `settle` for any PR with non-trivial bookkeeping, size the
  `acquire` `--max-changed-lines` with headroom for it, and treat a `reset` as the known fallback.
- `test/security/repo-scan.test.ts:13` intentionally keeps its own `TOKEN_SHAPE_RE` copy rather than
  importing `shared/secrets.ts`'s `TELEGRAM_BOT_TOKEN_RE` — ratified as orthogonal-by-design
  (`bus-v2-f1-pr-03-001`), not a defect to fix later.
- TypeScript 7.0.2 needs `"types": ["node"]`; empty composite units are `TS18003` — `src/{client,daemon,cli}/tsconfig.json`
  join the root `references` when their first `.ts` lands (PR-08 cli, PR-15 daemon, PR-32 client).
- `test:wrong-room` matches by glob until PR-41; `npm pack` in `pack.test.ts` spawns `npm-cli.js` on win32.
- `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by path; `git ls-files`-based
  scanners see only tracked or staged files — `git add` (or `git add -N`) before a local RED/GREEN.
- SDD preflight canonical wording: the exact marker text and option order in
  `~/.claude/skills/_shared/sdd-orchestrator-workflow.md` lines 51-54 is mandatory; a
  semantically-equivalent rephrasing OR a reordering of the options is refused by the native
  dispatcher — copy the option order verbatim (Pace: Interactive, Automatic; Artifacts: OpenSpec,
  Engram, Both; PR strategy: Ask me, Single PR, Auto), never reorder to put the session's actual
  answer first. This session hit the refusal twice from exactly that reordering before catching it —
  see the preflight-order row above.
- Type-only modules (like PR-04's `thread-record.ts`) satisfy Strict TDD's triangulation gate via the
  explicit type-only exception in `strict-tdd.md`; a missing-module `TS2307` from `tsc` is a legitimate
  RED for them — do not manufacture a fake runtime red for a module with no branching logic.
- **Stale cross-file doc comments after a behavior change**: PR-05 changed D-05's fail-closed rule, but
  a prior PR's file (`thread-record.ts`, from PR-04) had TWO separate doc comments describing the OLD
  behavior — Kairo's own review caught the first, an independent validator caught the second, adjacent
  one that the first pass missed. When a PR changes behavior a prior PR's comments describe, grep that
  prior file for the OLD behavior's keywords (not just the one spot you already know about) rather than
  assuming one fix is enough.

## Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-16 / D-10 | `LICENSE` shipped with `private: true`; SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line open; a **real tenant deny-list** for PT-22 must live outside the tree (CI secret) — decide at PR-42 | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant (`src/shared/constants.ts`) | Director |
| — | `npm test` runs whatever is in a stale `dist/`; consider a `clean` step in a later PR, audited | Kairo → Alpha |
| — | GitHub Actions deprecation warning: `actions/checkout@v4` and `actions/setup-node@v4` target Node 20 (runner forces Node 24) — bump majors in a later CI PR, audited | Kairo → Alpha |
| — | T22 bytes-per-hour ceiling and origin-label organisation marker: no backlog id (PR-42) | Director |
| B-07, B-08 | Real-Telegram and Windows-ACL spikes | Director + Kairo |

## Environment facts the next session should not re-measure

- Machine: Windows 11, Node 24.16, npm 11.5, gentle-ai 2.9.1, TypeScript 7.0.2 pinned.
- Arena bridge: `.mcp.json` (gitignored); collaborator Alpha in the right panel. Alpha closes in one
  AUDIT when the proposal carries `file:line` pointers, the measured diff and RED/GREEN evidence.
  The broker watchdog can close a debate `ESCALATED` if the Alpha turn takes too long — that is a
  timeout, not a verdict (see step 6).
- **GitHub account isolation (Director, DN-07).** The local `.git/config` of this repository carries a
  `credential.helper` for `agentesinteligentesllm-oss`; every `gh` command runs as
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh …`. Never `gh auth switch`.
  After creating a PR, confirm the owner with `gh pr view N --json author,headRepositoryOwner`.
- GitHub Actions: the workflow is on `main`, so `pull_request` runs trigger on PR open (≈40 s per
  matrix entry). `gh pr merge N --merge --delete-branch` also checks out `main` and pulls.
- Line endings: both repos have `core.autocrlf=true`; this repository forces `eol=lf` through
  `.gitattributes`, the v1 checkout has none — vendored bodies are copied from `git show bf8f365:<path>`
  (raw blob) and the provenance hash normalizes CRLF→LF.
- `node --test` summary lines are `ℹ tests / ℹ pass / ℹ fail` (with ANSI colour), not `# tests`.
- **Engram project key**: `telegram_bus_agent` — pass `project: telegram_bus_agent` explicitly on every
  `mem_search` / `mem_save` and in every sub-agent prompt (auto-detection returns `connmuta`).
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365`, read-only. Verification
  worktrees live in `../telegram_bus_agent-worktrees/` and are removed at session close
  (`git worktree remove`). That checkout also has one pre-existing untracked file,
  `alpha_response.json` (an unrelated Arena envelope dated 2026-09-06, from a different conversation
  entirely) — not caused by any F1 session, harmless, left as-is; do not mistake it for this project's
  state if `git status` there shows it.
