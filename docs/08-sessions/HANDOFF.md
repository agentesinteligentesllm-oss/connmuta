# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer (Kairo). It says where the work
> stands, what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.

## Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress. PR-01a, PR-01b, PR-02, PR-03 and PR-04 merged to `main` (#1 `1369886`, #2 `5798bab`, #3 `2083d7a`, #4 `77855b9`, #5 `f0097f0`); CI green on every merge. Next slice: PR-05.** | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status must say `nextRecommended: apply`, 24/210 tasks complete (PR-01a 1a.1–1a.8, PR-01b 1b.1–1b.3, PR-02 2.1–2.6, PR-03 3.1–3.4, PR-04 4.1–4.3), `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Artifacts | [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) 45 slices, unchanged this session; design and specs unchanged | Engram twins under `sdd/f1-daemon-registry-thin-client/*` (project key `telegram_bus_agent`) |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**` and `test/**` for a leading `Provenance:` header; the scanned set must equal `test/fixtures/v1-provenance.json` (5 entries: `constants.ts` SEAM, `envelope.ts` AS-IS, `envelope.test.ts` AS-IS, `secrets.ts` SEAM, `thread-record.ts` SEAM); AS-IS bodies must hash-match, SEAM bodies must differ and list `Changes:`. Every vendored file from now on (AS-IS or SEAM) needs a design §12 header and a fixture entry, or `test:static` fails | `test/security/provenance.test.ts:39-66` |
| **`sdd-apply` hash cross-check defect (new this session, ratified `bus-v2-f1-pr-04-001`)** | When re-deriving a `v1 body sha256` for a header, `sdd-apply` used a shell one-liner (`sed -n '<range>p' \| head -c -1 \| sha256sum`) that unconditionally strips the last byte before hashing. For a line-range slice of a larger file (not the whole file), the last extracted line's own trailing newline is real source content whenever a following line exists in the original file — `head -c -1` silently deleted it, produced a wrong hash, and the subagent wrongly overwrote the orchestrator's correct supplied value on that mistaken basis. Kairo caught it via 3 independent recomputations (node `crypto`, `sha256sum`, `openssl`) plus a separate fresh-context validator agent, all 4 agreeing the original value was right. **Forward this explicitly to every future `sdd-apply` launch prompt that supplies a pinned hash for a line-range SEAM: never let the subagent's shell cross-check use `head -c -1` or any blind trailing-byte strip; if it disagrees with a supplied value, re-derive with the exact target algorithm (read full file, split by `\n`, array-slice by index, join with `\n`) before trusting the disagreement** | `docs/05-tribunal/INDEX.md` `bus-v2-f1-pr-04-001` record item (3) |
| **Doc-hygiene rule (ratified `bus-v2-f1-pr-03-001`, still binding)** | Any `apply-progress.md` narrative that explains a rejected/matched secret-shaped string (a token fixture, a PEM block, etc.) must **describe the shape, never quote the literal string** — quoting it verbatim retrips `test/security/repo-scan.test.ts` (PT-22) on the doc file itself, since PT-22 scans every tracked file, not just `src/**`/`test/**`. Forward this rule explicitly to every future `sdd-apply` launch prompt whose scope includes a secret-shaped fixture | `docs/05-tribunal/INDEX.md` `bus-v2-f1-pr-03-001` record item (5) |
| SDD preflight | Automatic · hybrid · auto-chain; `chain_strategy: stacked-to-main` (DN-06); re-collect per session with `AskUserQuestion` **using the exact canonical marker text and option order from `~/.claude/skills/_shared/sdd-orchestrator-workflow.md` lines 45-69** (`Gentle AI SDD preflight 1/3:` Interactive/Automatic, `2/3:` OpenSpec/Engram/Both, `3/3:` Ask me/Single PR/Auto). Two distinct refusals hit an earlier session (session 5), both fixed by using the exact canonical wording/order and never hand-authoring the preflight block: (a) `SDD child dispatch refused: parent-confirmed SDD preflight is missing, invalid, or uncorroborated`; (b) `SDD child dispatch refused: model-authored preflight text cannot create parent-confirmed authority` — the sub-agent launch prompt hand-authored a `## SDD Session Preflight` heading; the runtime derives and prepends that block itself, never write it | `openspec/config.yaml` `session:`; `~/.claude/skills/_shared/sdd-orchestrator-workflow.md` lines 45-69 (this is a machine-local tool path outside the repository tree — reference it as plain text, not a repo-relative Markdown link) |
| Strict TDD | `openspec/config.yaml` `strict_tdd: true` — forward `STRICT TDD MODE IS ACTIVE. Test runner: npm test` to every `sdd-apply` | `openspec/config.yaml` `testing:` |
| `sdd-attempt acquire`/`settle` CLI flags | Current binary requires `--request-id` and `--evidence-goal` on `acquire` (not just `--work-unit`), and `settle` takes no `--json` flag but does require `--diagnosis`, `--harness-disposition`, `--cleanup-evidence` and `--process-evidence` | `gentle-ai sdd-attempt acquire --help` / `settle --help` |
| Tribunal | 18 debates closed (17 CONSENSUS; `bus-v2-f1-pr-02-001` `ESCALATED` by the broker watchdog on a turn timeout, re-run as `bus-v2-f1-pr-02-002` CONSENSUS); `bus-v2-f1-pr-04-001` CONSENSUS this session; none open | [`05-tribunal/INDEX.md`](../05-tribunal/INDEX.md) |
| Native attempt ledger | PR-04 attempt settled `passed` → `state: complete`; the next `acquire` with a new `--work-unit` label starts the PR-05 objective | `gentle-ai sdd-attempt status --cwd <repo> --change f1-daemon-registry-thin-client` |
| Repository | `origin` = `agentesinteligentesllm-oss/connmuta`, `main` at the session-close docs commit (once made); branch protection: force-push and deletion blocked (DN-08); no PR or status-check requirement, so session-close docs commits stay direct | `gh api repos/agentesinteligentesllm-oss/connmuta/branches/main/protection` |
| Code on `main` | `src/shared/{constants,version,envelope,secrets,thread-record}.ts` + twins, `test/fakes/delivered-text.ts`, `test/twins.test.ts`, `test/security/{pack,repo-scan,provenance}.test.ts`, fixtures — **108 tests**, `test:static` **8** | PRs #1–#5 |

## Next session — exact start

1. Read [`../../AGENTS.md`](../../AGENTS.md) §1 (this file is step 0), then only
   [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) header + PR-05..PR-07,
   [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) (PR-04
   section and its corrections), and [`design.md`](../../openspec/changes/f1-daemon-registry-thin-client/design.md)
   §12 row `src/protocol.ts:1-333` (`shared/protocol-apply.ts`). Specs are read per PR by the apply agent.
   **PR-05 SEAM facts verified this session** (Kairo, independently computed 3 ways — node `crypto`,
   `sha256sum`, `openssl` — all agreeing): `v1:src/protocol.ts:1-333` has a 6-line leading import block
   (5 `import` statements + blank lines, lines 1-6) that the provenance `vendoredBody()` algorithm
   strips; the remaining body is **327 lines** starting at `const MS_PER_HOUR = 60 * 60 * 1000;` (v1 line
   7) through v1 line 333 (a real trailing newline precedes v1 line 334, which is blank, then a new
   function begins at line 335 — this is a genuine function-boundary split, not an arbitrary cut). **v1
   body sha256: `e8b6f8a427d57f3133e088d7fe8659f66e41ba2c259e57050d30e1514a2ffcbe`.** Use this exact value;
   given this session's hash defect (see the row above), re-verify it yourself with a fresh independent
   method before trusting it blindly, same discipline this session applied to PR-04's value.
   `tasks.md`'s Scope line for PR-05 lists only `src/shared/protocol-apply.ts` and its test twin — it does
   NOT list `test/fixtures/v1-provenance.json`, the same recurring gap every PR since PR-01b has had. The
   provenance mechanism scans every headered file regardless of what a PR's Scope line says (design §12),
   so the apply agent must still add a SEAM entry (`v1Path: "src/protocol.ts:1-333"`, `commit: "bf8f365"`,
   `verdict: "SEAM"`) and the design §12 header with this hash, or `test:static` fails.
2. `gh auth status` **only to read**; never `gh auth switch` (the machine-global active account flips
   to another local agent's between sessions — expected, not an incident; every `gh` call still runs
   with the explicit `GH_TOKEN` prefix per AGENTS.md §5, unaffected by the global flip). Verify
   `git branch --show-current` is `main` and `git pull --ff-only`. Remove leftover `dist/` before the
   first build.
3. Run the SDD preflight (`AskUserQuestion`, canonical marker text and order — see the row above) and
   `gentle-ai sdd-status f1-daemon-registry-thin-client --cwd <repo> --json`; it must say
   `nextRecommended: apply`, 24 completed, `blockedReasons: []`. Otherwise stop and report.
4. `gentle-ai sdd-attempt acquire --cwd <repo> --change f1-daemon-registry-thin-client --request-id "<unique>" --work-unit "PR-05 shared/protocol-apply.ts (SEAM, D-05)" --evidence-goal "<short objective>" --max-attempts 2 --max-changed-lines <N>` where N is what the ledger measures (authored + bookkeeping). For PR-05: tasks.md estimates ≈390 lines (near-budget, one cohesive state-machine module, not splittable per design) — this is the largest non-exception slice in the whole plan (tasks.md line 37). Real v1 diffs have run 10-30% over the tasks.md estimate on prior PRs, so this one has real risk of exceeding the 400-line hard cap; size the ledger with headroom (e.g. ≈500) but watch the real diff closely and be ready to stop-and-report if it would exceed 400 authored lines, per tasks.md's own re-slice rule (line 39 lesson from PR-01).
5. Launch `sdd-apply` (sonnet) for **PR-05 only** (`f1/05-protocol-apply` from `main`), forwarding:
   `delivery_strategy: auto-chain`, `chain_strategy: stacked-to-main`, no size exception (SEAM,
   near-budget — watch the real diff, stop and report before exceeding 400 authored lines rather than
   after), Strict TDD, the skill paths from `.atl/skill-registry.md` (`chained-pr`, `work-unit-commits`,
   `verification-before-completion`) plus `~/.claude/skills/sdd-apply/strict-tdd.md`, the acquire
   `--token`, Engram project key `telegram_bus_agent`, "read `apply-progress.md` first and append, never
   overwrite", "do not commit", "measure the real authored diff before reporting", the doc-hygiene rule
   verbatim (see the row above), **and the hash-defect warning verbatim (see the row above) — do not let
   the subagent's own cross-check use `head -c -1` or any blind trailing-byte strip when re-deriving a
   line-range hash**. Read tasks.md PR-05 section (`shared/protocol-apply.ts`, design §12 row
   `src/protocol.ts:1-333`, changes: `ThreadRecord` from PR-04, REPLY branch no longer touches
   `first_surfaced_at`, `isAddressee`/`classifyRejection` fail closed with reason `unanchored`,
   `isDuplicateEid` unused) before writing the launch prompt — do not assume this handoff's summary is
   complete, it is a pointer.
6. After the slice: Kairo reviews the diff — **ask the Director explicitly before committing** (AGENTS.md
   §3: "Never commit without the Director's authorization"; this session asked and was authorized to
   proceed through the full pipeline in one go, but treat each session's authorization as its own, don't
   assume standing consent), commits as work units (conventional commits, no attribution), verifies from
   a **clean detached worktree** (`git worktree add --detach ../telegram_bus_agent-worktrees/verify-05
   <sha>` — a branch checked out in the main worktree cannot be added again — then `npm ci
   --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js" && npm run test:static`,
   then `git worktree remove ../telegram_bus_agent-worktrees/verify-05 --force` — remove it right after
   the run completes, do not defer cleanup to session close), launches a fresh-context, read-only
   validator (Explore agent, sonnet) to independently check the diff against the design/tasks contract
   and re-derive the pinned hash itself, then opens debate `bus-v2-f1-pr-05-001` with Alpha. `gh pr
   create` only after CONSENSUS; merge once CI is green (DN-08 pre-authorizes push/PR-open/merge without
   a separate Director question — only the local commit needs an explicit ask). **If the broker closes a
   debate `ESCALATED` on a watchdog timeout with no disagreement, do not merge on it: re-run the same
   proposal under the next id (`-002`) so the record shows the real outcome** (session 4, decided by the
   Director).
7. `gentle-ai sdd-attempt settle …` after the PR merges (evidence revision = SHA-256 of a short
   manifest written into the LOG, as in sessions 4, 5 and 6 — the manifest string convention is
   `"PR-<NN> <branch> tip <last-commit-sha> merged <merge-commit-sha>; clean worktree verify-<NN>:
   node --test <X>/<X>, test:static <Y>/<Y>; CI run <run-id> pass (node 24.15, 26); tribunal
   <debate-id> CONSENSUS"`).
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
  hash-defect row above for why that distinction matters).
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake
  imports it, never redefines it.
- THREAT-MODEL §4 file-name rule: append the test path to the row `scope` cell.
- **Doc-hygiene rule** (see table above): never quote a matched-and-rejected secret-shaped literal in
  `apply-progress.md`; describe the shape instead.
- **Hash cross-check rule** (new this session, see table above): never let a shell one-liner blind-strip
  a trailing byte when re-deriving a line-range SEAM hash; re-derive with the exact target algorithm.
- `test/security/repo-scan.test.ts:13` intentionally keeps its own `TOKEN_SHAPE_RE` copy rather than
  importing `shared/secrets.ts`'s `TELEGRAM_BOT_TOKEN_RE` — ratified as orthogonal-by-design
  (`bus-v2-f1-pr-03-001`), not a defect to fix later.
- TypeScript 7.0.2 needs `"types": ["node"]`; empty composite units are `TS18003` — `src/{client,daemon,cli}/tsconfig.json`
  join the root `references` when their first `.ts` lands (PR-08 cli, PR-15 daemon, PR-32 client).
- `test:wrong-room` matches by glob until PR-41; `npm pack` in `pack.test.ts` spawns `npm-cli.js` on win32.
- `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by path; `git ls-files`-based
  scanners see only tracked or staged files — `git add` (or `git add -N`) before a local RED/GREEN.
- SDD preflight canonical wording: the exact marker text and option order in
  `~/.claude/skills/_shared/sdd-orchestrator-workflow.md` lines 45-69 is mandatory; a
  semantically-equivalent rephrasing is refused by the native dispatcher — do not improvise it.
- Type-only modules (like PR-04's `thread-record.ts`) satisfy Strict TDD's triangulation gate via the
  explicit type-only exception in `strict-tdd.md`; a missing-module `TS2307` from `tsc` is a legitimate
  RED for them — do not manufacture a fake runtime red for a module with no branching logic.

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
  (`git worktree remove`).
