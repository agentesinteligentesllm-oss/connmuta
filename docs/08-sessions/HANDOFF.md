# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer (Kairo). It says where the work
> stands, what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.

## Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress. PR-01a, PR-01b, PR-02 and PR-03 merged to `main` (#1 `1369886`, #2 `5798bab`, #3 `2083d7a`, #4 `77855b9`); CI green on every merge. Next slice: PR-04.** | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status must say `nextRecommended: apply`, 21/210 tasks complete (PR-01a 1a.1–1a.8, PR-01b 1b.1–1b.3, PR-02 2.1–2.6, PR-03 3.1–3.4), `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Artifacts | [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) 45 slices, unchanged this session; design and specs unchanged | Engram twins under `sdd/f1-daemon-registry-thin-client/*` (project key `telegram_bus_agent`) |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**` and `test/**` for a leading `Provenance:` header; the scanned set must equal `test/fixtures/v1-provenance.json` (4 entries: `constants.ts` SEAM, `envelope.ts` AS-IS, `envelope.test.ts` AS-IS, `secrets.ts` SEAM); AS-IS bodies must hash-match, SEAM bodies must differ and list `Changes:`. **Every vendored file from now on (AS-IS or SEAM) needs a design §12 header and a fixture entry, or `test:static` fails** | `test/security/provenance.test.ts:39-66` |
| **Doc-hygiene rule (new this session, ratified `bus-v2-f1-pr-03-001`)** | Any `apply-progress.md` narrative that explains a rejected/matched secret-shaped string (a token fixture, a PEM block, etc.) must **describe the shape, never quote the literal string** — quoting it verbatim retrips `test/security/repo-scan.test.ts` (PT-22) on the doc file itself, since PT-22 scans every tracked file, not just `src/**`/`test/**`. Kairo caught this in PR-03's own doc note (`8574479135:AAHk...` quoted verbatim) via the clean-detached-worktree verification pass; fixed in `bd1cebf`. Forward this rule explicitly to every future `sdd-apply` launch prompt whose scope includes a secret-shaped fixture | `docs/05-tribunal/INDEX.md` `bus-v2-f1-pr-03-001` record item (5) |
| SDD preflight | Automatic · hybrid · auto-chain; `chain_strategy: stacked-to-main` (DN-06); re-collect per session with `AskUserQuestion` **using the exact canonical marker text and option order from `~/.claude/skills/_shared/sdd-orchestrator-workflow.md`** (`Gentle AI SDD preflight 1/3:` Interactive/Automatic, `2/3:` OpenSpec/Engram/Both, `3/3:` Ask me/Single PR/Auto) — a semantically-equivalent but differently-worded/ordered preflight is refused by the native dispatcher (`SDD child dispatch refused`); never hand-author the `## SDD Session Preflight` block in a sub-agent prompt, the runtime prepends it itself | [`openspec/config.yaml`](../../openspec/config.yaml) `session:`; [`sdd-orchestrator-workflow.md`](../../../../../.claude/skills/_shared/sdd-orchestrator-workflow.md) lines 45-69 |
| Strict TDD | `openspec/config.yaml` `strict_tdd: true` — forward `STRICT TDD MODE IS ACTIVE. Test runner: npm test` to every `sdd-apply` | `openspec/config.yaml` `testing:` |
| `sdd-attempt acquire`/`settle` CLI flags | Current binary requires `--request-id` and `--evidence-goal` on `acquire` (not just `--work-unit`), and `settle` takes no `--json` flag. `acquire` reply may omit `settle_obligation` — nothing to honour beyond the standard settle when it does | `gentle-ai sdd-attempt acquire --help` |
| Tribunal | 16 debates closed (15 CONSENSUS; `bus-v2-f1-pr-02-001` `ESCALATED` by the broker watchdog on a turn timeout, re-run as `bus-v2-f1-pr-02-002` CONSENSUS); `bus-v2-f1-pr-03-001` CONSENSUS this session; none open | [`05-tribunal/INDEX.md`](../05-tribunal/INDEX.md) |
| Native attempt ledger | PR-03 attempt settled `passed` → `state: complete`; the next `acquire` with a new `--work-unit` label starts the PR-04 objective | `gentle-ai sdd-attempt status --cwd <repo> --change f1-daemon-registry-thin-client` |
| Repository | `origin` = `agentesinteligentesllm-oss/connmuta`, `main` at the session-5 docs commit (once made); branch protection: force-push and deletion blocked (DN-08); no PR or status-check requirement, so session-close docs commits stay direct | `gh api repos/agentesinteligentesllm-oss/connmuta/branches/main/protection` |
| Code on `main` | `src/shared/{constants,version,envelope,secrets}.ts` + twins, `test/fakes/delivered-text.ts`, `test/twins.test.ts`, `test/security/{pack,repo-scan,provenance}.test.ts`, fixtures — **103 tests**, `test:static` **8** | PRs #1–#4 |

## Next session — exact start

1. Read [`../../AGENTS.md`](../../AGENTS.md) §1 (this file is step 0), then only
   [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) header + PR-04..PR-06,
   [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) (PR-03
   section and its corrections), and [`design.md`](../../openspec/changes/f1-daemon-registry-thin-client/design.md)
   §12 row `src/state.ts:15-87` types (`thread-record.ts`). Specs are read per PR by the apply agent.
2. `gh auth status` **only to read**; never `gh auth switch` (the machine-global active account flips
   to another local agent's between sessions — expected, not an incident; every `gh` call still runs
   with the explicit `GH_TOKEN` prefix per AGENTS.md §5, unaffected by the global flip). Verify
   `git branch --show-current` is `main` and `git pull --ff-only`. Remove leftover `dist/` before the
   first build.
3. Run the SDD preflight (`AskUserQuestion`, canonical marker text and order — see the row above) and
   `gentle-ai sdd-status f1-daemon-registry-thin-client --cwd <repo> --json`; it must say
   `nextRecommended: apply`, 21 completed, `blockedReasons: []`. Otherwise stop and report.
4. `gentle-ai sdd-attempt acquire --cwd <repo> --change f1-daemon-registry-thin-client --request-id "<unique>" --work-unit "PR-04 shared/thread-record.ts (SEAM)" --evidence-goal "<short objective>" --max-attempts 2 --max-changed-lines <N>` where N is what the ledger measures (authored + bookkeeping). For PR-04: tasks.md estimates ≈190 lines; size similarly to PR-03 (real v1 diff tends to run ~10-30% over the tasks.md estimate) → set ≈400 as a safety margin, or measure v1's real `state.ts:15-87` line count first and size accordingly.
5. Launch `sdd-apply` (sonnet) for **PR-04 only** (`f1/04-thread-record` from `main`), forwarding:
   `delivery_strategy: auto-chain`, `chain_strategy: stacked-to-main`, no size exception (SEAM,
   ≤ 400 authored lines), Strict TDD, the skill paths from `.atl/skill-registry.md` (`chained-pr`,
   `work-unit-commits`, `verification-before-completion`) plus `~/.claude/skills/sdd-apply/strict-tdd.md`,
   the acquire `--token`, Engram project key `telegram_bus_agent`, "read `apply-progress.md` first and
   append, never overwrite", "do not commit", "measure the real authored diff before reporting", and
   **the doc-hygiene rule above verbatim** (describe any secret/token-shaped fixture, never quote it
   literally, or PT-22 retrips on the doc). Read tasks.md PR-04 section (`shared/thread-record.ts`,
   design §12 row `src/state.ts:15-87` types, change: `first_surfaced_at` removed per client) before
   writing the launch prompt — do not assume this handoff's summary is complete, it is a pointer.
6. After the slice: Kairo reviews the diff, commits as work units (conventional commits, no
   attribution), verifies from a **clean detached worktree** (`git worktree add --detach
   ../telegram_bus_agent-worktrees/verify-04 <sha>` — a branch checked out in the main worktree cannot
   be added again — then `npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js"
   && npm run test:static`), runs the fresh-context phase-contract validator (sonnet, read-only), then
   opens debate `bus-v2-f1-pr-04-001` with Alpha. `gh pr create` only after CONSENSUS; merge once CI
   is green (DN-08). **If the broker closes a debate `ESCALATED` on a watchdog timeout with no
   disagreement, do not merge on it: re-run the same proposal under the next id (`-002`) so the record
   shows the real outcome** (session 4, decided by the Director).
7. `gentle-ai sdd-attempt settle …` after the PR merges (evidence revision = SHA-256 of a short
   manifest written into the LOG, as in sessions 4 and 5).
8. Stop at a PR boundary. Rewrite this file, append to [`LOG.md`](./LOG.md), record the debate(s) in
   the tribunal index, `mem_session_summary`, commit docs on `main`, push.

## Do not redo

- Spec, design and tasks: gated and audited; unchanged since `bus-v2-f1-pr-01-001`.
- Provenance hash rule and registry: decided and ratified (`bus-v2-f1-pr-02-002`); the hash in the
  `constants.ts` header is the SHA-256 of `v1:src/config.ts` lines 26–166 LF-joined without a
  trailing newline; `secrets.ts`'s header hash (`742bf433…2790bf6`) is the SHA-256 of the full 86-line
  v1 body (no header or imports to strip in the v1 source).
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake
  imports it, never redefines it.
- THREAT-MODEL §4 file-name rule: append the test path to the row `scope` cell.
- **Doc-hygiene rule** (see table above): never quote a matched-and-rejected secret-shaped literal in
  `apply-progress.md`; describe the shape instead.
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
