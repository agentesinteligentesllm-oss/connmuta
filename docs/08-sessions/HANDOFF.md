# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer (Kairo). It says where the work
> stands, what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.

## Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F0 closed. F1 planning open: exploration and proposal done, tribunal consensus on the proposal.** | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`, next phases `spec` + `design` (parallel), then `tasks` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) |
| SDD preflight | Automatic · hybrid (openspec + Engram) · auto-chain · 400 lines/PR (decided, DN-04 era) | [`openspec/config.yaml`](../../openspec/config.yaml) `session:` |
| Tribunal | 4 debates closed in CONSENSUS (landing, F0 docs audit, F1 proposal, session-1 closure); none open | [`05-tribunal/INDEX.md`](../05-tribunal/INDEX.md) |
| Director decisions | Name Conmuta (DN-02) · Apache-2.0 (DN-04) · ADR-0028..0031 accepted (DN-04) · commits/PR/merge authorized (DN-04) | [`05-tribunal/INDEX.md#director-notes`](../05-tribunal/INDEX.md#director-notes) |
| Repository | Local git, branch `main`, F0 committed. **No GitHub remote yet** (the Director will share one) | `git log` |
| Code | **None.** By mandate, no code before spec, design and tasks exist and are audited | [`CONSTITUTION.md`](../01-constitution/CONSTITUTION.md) |

## Next session — exact start

1. Read [`../../AGENTS.md`](../../AGENTS.md) §1 reading order (this file is step 1 there), then only:
   [`proposal.md`](../../openspec/changes/f1-daemon-registry-thin-client/proposal.md),
   [`exploration.md`](../../openspec/changes/f1-daemon-registry-thin-client/exploration.md) §Q1–Q4,
   ADR-0028/0029/0030, [`DATA-MODEL.md`](../02-architecture/DATA-MODEL.md), [`THREAT-MODEL.md`](../02-architecture/THREAT-MODEL.md) §4.
   Do not re-read the F0 analysis bundle or v1's `design.md`; the ADRs already carry what matters.
2. Run `gentle-ai sdd-status f1-daemon-registry-thin-client --cwd <repo> --json`; it must say `nextRecommended: spec` (or design). If it says otherwise, stop and report.
3. Launch `sdd-spec` (sonnet) and `sdd-design` (opus) **in parallel** with the tribunal rulings of
   `bus-v2-f1-proposal-001` as fixed inputs: Option A spawn site; per-session token at `POST /session`;
   one change with auto-chained PRs; `needs_action` as a VIEW. Design gets the fresh-context
   phase-contract validator (GOVERNANCE §5 / orchestrator gate).
4. Debate the **design** with Alpha (GOVERNANCE §3) before `tasks`. Spec is audited inline by the gate; send it to Alpha in the same debate as the design to save a round.
5. `sdd-tasks` (sonnet) with the 400-line Review Workload Forecast; ask the chain strategy once (`stacked-to-main` recommended: no tracker branch until a remote exists).
6. Stop at the end of `tasks`. Rewrite this file, append to [`LOG.md`](./LOG.md), `mem_session_summary`, commit, and tell the Director to open the next session for `apply`.

## Do not redo

- The 11-agent analysis and the F0 documentation audit: closed (`bus-v2-f0-docs-audit-001`).
- The bot-topology, daemon, SQLite, Docker, name and license debates: closed; reopening needs new evidence and a new debate.
- Spikes B-07 and B-08 are **not** F1 blockers (proposal D-04); do not wait on them.

## Open points carried forward

| Id | Point | Owner |
|---|---|---|
| B-11 | Trademark screening for "Conmuta"; reserve npm scope, GitHub org and domain when the Director gives the go | Director |
| B-16 | `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`; copyright-holder line for `package.json` (`author`) needs the legal name from the Director | Kairo (F1/F6) |
| — | GitHub remote: when shared, `git remote add origin`, push `main`, protect it, and switch PR chaining to `feature-branch-chain` if the Director wants a tracker branch | Kairo, after the Director shares the URL |
| — | The v1 production bus (`~/.agentbus`) had 139 h without a fetch at session start; out of scope here, mentioned once to the Director | Director |
| B-07, B-08 | Real-Telegram and Windows-ACL spikes; schedule when the Director authorizes creating two test bots | Director + Kairo |

## Environment facts the next session should not re-measure

- Machine: Windows 11, Node 24.16, npm 11.5, gentle-ai 2.9.1, Cursor / OpenCode / Codex / Gemini CLI / AGY / Antigravity installed (the IDE-detection test bench for F2).
- Arena bridge for this repo: `.mcp.json` (gitignored); collaborator Alpha in the right panel.
- Engram project key: `telegram_bus_agent` (folder name); topic keys under `sdd/f1-daemon-registry-thin-client/*`.
