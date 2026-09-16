# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer (Kairo). It says where the work
> stands, what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.

## Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 planning closed: spec, design and tasks exist, gated and audited. `apply` not started.** | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, 207 tasks pending, 0 blocked reasons | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) |
| Artifacts | [`proposal.md`](../../openspec/changes/f1-daemon-registry-thin-client/proposal.md) · [`specs/`](../../openspec/changes/f1-daemon-registry-thin-client/specs/README.md) (9 capabilities, 47 requirements, 85 scenarios) · [`design.md`](../../openspec/changes/f1-daemon-registry-thin-client/design.md) (D-11..D-30, §20 build order) · [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) (44 PR slices) | Engram twins under `sdd/f1-daemon-registry-thin-client/*` |
| SDD preflight | Automatic · hybrid · auto-chain · 400 lines/PR; re-collected in session 2 (the gate requires it per session) | [`openspec/config.yaml`](../../openspec/config.yaml) `session:` |
| Delivery | `chain_strategy: stacked-to-main`; `size:exception` only for whole-file AS-IS vendored PRs (PR-02, PR-20) with the v1 body SHA-256 in the provenance header (DN-06, `bus-v2-f1-tasks-001`) | [`05-tribunal/INDEX.md#director-notes`](../05-tribunal/INDEX.md#director-notes) |
| Tribunal | 6 debates closed in CONSENSUS (landing, F0 docs audit, F1 proposal, session-1 closure, F1 design+spec, F1 tasks); none open | [`05-tribunal/INDEX.md`](../05-tribunal/INDEX.md) |
| Repository | `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, `main` pushed. **Branch protection not configured** (Director to choose rules; a PR-only rule would block the direct docs commits Kairo makes at session close) | `git remote -v` |
| Code | **None yet.** PR-01 (scaffold) is the first code | `tasks.md` PR-01 |

## Next session — exact start

1. Read [`../../AGENTS.md`](../../AGENTS.md) §1 (this file is step 0 there), then only
   [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) header + Review
   Workload Forecast + PR-01..PR-03, and [`design.md`](../../openspec/changes/f1-daemon-registry-thin-client/design.md)
   §2 (layout), §3 (constants), §12 (provenance header format). The specs are read per PR by the
   apply agent, not up front. Do not re-read the proposal, the exploration or the ADRs unless a task cites them.
2. Run the SDD preflight (`AskUserQuestion`, three groups) and then
   `gentle-ai sdd-status f1-daemon-registry-thin-client --cwd <repo> --json`; it must say
   `nextRecommended: apply` with `blockedReasons: []`. Otherwise stop and report.
3. Launch `sdd-apply` (sonnet) **one PR slice at a time**, starting at PR-01, with: `delivery_strategy: auto-chain`,
   `chain_strategy: stacked-to-main`, the DN-06 exception scope, Strict TDD forwarding
   (`STRICT TDD MODE IS ACTIVE. Test runner: npm test`), the `chained-pr` and `work-unit-commits`
   skill paths, and the native attempt ledger (`gentle-ai sdd-attempt acquire … settle …`).
   Branch `f1/01-scaffold-constants-ci` from `main`; PR targets `main`.
4. After each slice: fresh-context phase-contract validator (design/apply rule), then **Alpha audits
   the PR** (Director instruction DN-05: every artifact is audited before use) in a debate
   `bus-v2-f1-pr-NN-001`; open the PR with `gh pr create` only after CONSENSUS; merge after the
   Director's word (DN-04 delegates it, but say what was merged).
5. After PR-01 merges, re-run `sdd-init` so `openspec/config.yaml` `strict_tdd` flips to `true`
   against the real `npm test` (success criterion in the proposal).
6. Stop at a PR boundary, never mid-slice. Rewrite this file, append to [`LOG.md`](./LOG.md),
   `mem_session_summary`, commit and push.

## Do not redo

- Spec, design and tasks: gated and audited (`bus-v2-f1-design-001`, `bus-v2-f1-tasks-001`). Any change to them needs new evidence and a new debate.
- The spec/design reconciliation (D-14, D-16, D-17, D-19, D-20, D-21, D-24, D-29): applied in the spec re-run; the tribunal records list every touched line.
- The provenance-header question: resolved — the v1 body SHA-256 is in the header (design §12).
- Spikes B-07 and B-08 are not F1 blockers (proposal D-04).

## Open points carried forward

| Id | Point | Owner |
|---|---|---|
| — | Branch protection on `main` (rules to choose; see "Repository" above) | Director |
| B-16 / D-10 | Kairo's assumption in DN-06: D-10 superseded by DN-04 (`LICENSE` ships, `private: true` until F6); open to veto. SECURITY/CONTRIBUTING/CHANGELOG and the `author` line still open | Director |
| B-11 | Trademark screening for "Conmuta"; `PRODUCT_NAME` is the single rename constant (PR-01) | Director |
| — | T22 bytes-per-hour ceiling and the origin-label organisation marker: no backlog id yet; documented as open in PR-42 | Director |
| B-07, B-08 | Real-Telegram and Windows-ACL spikes; schedule when two test bots exist | Director + Kairo |
| — | The v1 production bus (`~/.agentbus`) had 139 h without a fetch at session-1 start; out of scope | Director |

## Environment facts the next session should not re-measure

- Machine: Windows 11, Node 24.16, npm 11.5, gentle-ai 2.9.1; Cursor / OpenCode / Codex / Gemini CLI / AGY / Antigravity installed.
- Arena bridge for this repo: `.mcp.json` (gitignored); collaborator Alpha in the right panel.
- GitHub: `gh` is authenticated for two accounts; the **active** one must be `agentesinteligentesllm-oss`
  (`gh auth status`; switch with `gh auth switch -h github.com -u agentesinteligentesllm-oss`). `gh` is
  the git credential helper for `github.com`. The credential itself lives in the OS keyring and in a
  pinned Engram entry (`config/github-remote-auth-connmuta`) — never in this tree.
- **Engram project key**: `telegram_bus_agent` (all SDD twins live there). Since the remote was added,
  auto-detection returns `connmuta` — pass `project: telegram_bus_agent` explicitly on every
  `mem_search` / `mem_save` and in every sub-agent prompt. Topic keys: `sdd/f1-daemon-registry-thin-client/{explore,proposal,spec,spec/<capability>,design,tasks,state}`.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, read-only; real line counts of every reused module are in `tasks.md` (forecast section).
