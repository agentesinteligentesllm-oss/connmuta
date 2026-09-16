# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer (Kairo). It says where the work
> stands, what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.

## Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress. PR-01a and PR-01b merged to `main` (#1 `1369886`, #2 `5798bab`); CI green on both merges. Next slice: PR-02.** | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status must say `nextRecommended: apply`, 11/210 tasks complete (PR-01a 1a.1–1a.8, PR-01b 1b.1–1b.3), `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Artifacts | [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) is **45 slices** (PR-01 was re-sliced at apply time into PR-01a/PR-01b — forecast note and header row `PR budget` say what counts toward 400); design and specs unchanged | Engram twins under `sdd/f1-daemon-registry-thin-client/*` (project key `telegram_bus_agent`) |
| SDD preflight | Automatic · hybrid · auto-chain; `chain_strategy: stacked-to-main` (DN-06); re-collect per session with `AskUserQuestion` **in the canonical option order** (Interactive, Automatic / OpenSpec, Engram, Both / Ask me, Single PR, Auto) — a reordered menu is refused by the runtime | [`openspec/config.yaml`](../../openspec/config.yaml) `session:` |
| Strict TDD | `openspec/config.yaml` `strict_tdd: true` (re-run of `sdd-init` on 2026-09-16 against the real `npm test`) — forward `STRICT TDD MODE IS ACTIVE. Test runner: npm test` to every `sdd-apply` | `openspec/config.yaml` `testing:` |
| Tribunal | 10 debates closed in CONSENSUS (…, `bus-v2-f1-pr-01-001`, `bus-v2-session-3-closure-001`, `bus-v2-session-3-addendum-001`); none open | [`05-tribunal/INDEX.md`](../05-tribunal/INDEX.md) |
| Native attempt ledger | Objective reset by the Director on 2026-09-16 (`next_action: begin`, `decision_required: false`); the PR-01 attempt is recorded `passed` with `changed_lines: 2676` because the ledger counts generated `npm-shrinkwrap.json` and every tracked change | `gentle-ai sdd-attempt status --cwd <repo> --change f1-daemon-registry-thin-client` |
| Repository | `origin` = `agentesinteligentesllm-oss/connmuta`, `main` at the session-3 docs commits. Branch protection on `main`: force-push and deletion blocked (DN-08); no PR or status-check requirement, so session-close docs commits stay direct | `gh api repos/agentesinteligentesllm-oss/connmuta/branches/main/protection` |
| Code on `main` | `package.json`, `tsconfig.base.json` + project references, CI, `src/shared/{constants,version}.ts`, twins, `test/twins.test.ts`, `test/security/{pack,repo-scan}.test.ts` — 14 tests, `test:static` 6 | PR #1, PR #2 |

## Next session — exact start

1. Read [`../../AGENTS.md`](../../AGENTS.md) §1 (this file is step 0), then only
   [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) header + forecast +
   PR-02..PR-04, [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md),
   and [`design.md`](../../openspec/changes/f1-daemon-registry-thin-client/design.md) §12 (provenance
   header, AS-IS/SEAM table). Specs are read per PR by the apply agent.
2. `gh auth status` **only to read**; never `gh auth switch` (see "Environment facts"). Verify
   `git branch --show-current` is `main` and `git pull --ff-only`.
3. Run the SDD preflight (`AskUserQuestion`, canonical order) and
   `gentle-ai sdd-status f1-daemon-registry-thin-client --cwd <repo> --json`; it must say
   `nextRecommended: apply`, 11 completed, `blockedReasons: []`. Otherwise stop and report.
4. `gentle-ai sdd-attempt acquire … --work-unit "PR-02 …" --max-attempts 2 --max-changed-lines <N>`
   where **N is what the ledger measures** (authored + generated + bookkeeping lines of that slice),
   not the 400-line review budget. For PR-02: ≈110 authored + ≈1,030 vendored body + fixtures + bookkeeping → set 1500.
5. Launch `sdd-apply` (sonnet) for **PR-02 only** (`f1/02-envelope-provenance` from `main`), with:
   `delivery_strategy: auto-chain`, `chain_strategy: stacked-to-main`, DN-06 exception scope
   (PR-02 is `size:exception (AS-IS hash-pinned)`: whole-file copies of `v1:src/envelope.ts` and
   `v1:test/envelope.test.ts` with the v1 body SHA-256 in the header; `provenance.test.ts` RED first),
   Strict TDD forwarding, the skill paths from `.atl/skill-registry.md` (`chained-pr`,
   `work-unit-commits`, `verification-before-completion`, `sdd-apply/strict-tdd.md`), the acquire
   `--token`, Engram project key `telegram_bus_agent`, and the instruction to **not commit** and to
   **measure the real authored diff** before reporting.
6. After the slice: Kairo reviews the diff, commits as work units (conventional commits, no
   attribution), verifies from a **clean sibling worktree** (`git worktree add
   ../telegram_bus_agent-worktrees/verify-NN <branch>` → `npm ci --ignore-scripts && npm run build &&
   node --test "dist/test/**/*.test.js"` — this caught a self-matching scanner in session 3),
   runs the fresh-context phase-contract validator (sonnet, read-only), then opens debate
   `bus-v2-f1-pr-02-001` with Alpha. `gh pr create` only after CONSENSUS; merge once CI is green
   (DN-08: Kairo's discretion — report what was merged); reopen the PR if its CI did not trigger.
7. `gentle-ai sdd-attempt settle …` (passed/failed) after the PR merges; if `blocked:
   maintainer_decision`, run the reset with the proven reason and `--actor "Kairo (DN-08)"`, and
   report it in the LOG.
8. Stop at a PR boundary. Rewrite this file, append to [`LOG.md`](./LOG.md), record the debate(s) in
   the tribunal index, `mem_session_summary`, commit docs on `main`, push.

## Do not redo

- Spec, design and tasks: gated and audited; the PR-01 re-slice is the only tasks change since
  `bus-v2-f1-tasks-001` and it is ratified (`bus-v2-f1-pr-01-001`).
- THREAT-MODEL §4 file-name rule: append the test path to the row's `scope` cell (convention ratified).
- TypeScript 7.0.2 needs `"types": ["node"]` (in `tsconfig.base.json`); empty composite units are
  `TS18003` — `src/{client,daemon,cli}/tsconfig.json` exist and join the root `references` when their
  first `.ts` lands (PR-08 cli, PR-15 daemon, PR-32 client: one line each).
- `test:wrong-room` matches by glob until PR-41; `npm pack` in `pack.test.ts` spawns `npm-cli.js` on
  win32 (`execFileSync('npm.cmd', {shell:false})` is `EINVAL` since CVE-2024-27980).
- `repo-scan.test.ts` excludes itself and the fixture; the deny-list holds synthetic markers only.

## Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-16 / D-10 | `LICENSE` shipped with `private: true` (DN-06 assumption, unvetoed so far); SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line open; a **real tenant deny-list** for PT-22 must live outside the tree (CI secret) — decide at PR-42 | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant (`src/shared/constants.ts:14`) | Director |
| — | `npm test` runs whatever is in a stale `dist/` (a deleted or renamed test keeps running until `dist/` is removed); consider a `clean` step in a later PR, audited | Kairo → Alpha |
| — | T22 bytes-per-hour ceiling and origin-label organisation marker: no backlog id (PR-42) | Director |
| B-07, B-08 | Real-Telegram and Windows-ACL spikes | Director + Kairo |

## Environment facts the next session should not re-measure

- Machine: Windows 11, Node 24.16, npm 11.5, gentle-ai 2.9.1, TypeScript 7.0.2 pinned.
- Arena bridge: `.mcp.json` (gitignored); collaborator Alpha in the right panel. Alpha closes in
  one AUDIT when the proposal carries `file:line` pointers, the measured diff and RED/GREEN evidence.
- **GitHub account isolation (Director, 2026-09-16, DN-07).** Other agents on this machine use a
  different GitHub account for an unrelated project; `gh auth switch` is machine-global and breaks
  them. This repository's `.git/config` (local, not committed) carries a `credential.helper` that
  fetches the `agentesinteligentesllm-oss` token at call time (`gh auth token -h github.com -u
  agentesinteligentesllm-oss`), so `git push` works whatever the global active account is. Every
  `gh` command for this project runs as `GH_TOKEN="$(gh auth token -h github.com -u
  agentesinteligentesllm-oss)" gh …`. After creating a PR, confirm the owner with
  `gh pr view N --json author,headRepositoryOwner`. A new clone must recreate the local helper.
- GitHub Actions: a workflow that is not yet on `main` produces **no run** for `pull_request` or
  branch `push` events (observed; the first run was the merge of PR #1). Retargeting a PR's base does
  not trigger `pull_request`; close/reopen does.
- **Engram project key**: `telegram_bus_agent` — pass `project: telegram_bus_agent` explicitly on every
  `mem_search` / `mem_save` and in every sub-agent prompt (auto-detection returns `connmuta`).
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, read-only. Verification worktrees
  live in `../telegram_bus_agent-worktrees/` and are removed at session close (`git worktree remove`).
