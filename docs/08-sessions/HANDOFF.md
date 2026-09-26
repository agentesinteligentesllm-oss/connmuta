# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
>
> **Reading order for a zero-context session:** §0 → §1 → §2 → §5. Then §3 (pins), §4 (traps),
> §6 (do not redo) and §7 (open points) as the task needs, and §8 for the environment.

---

## §0 — Quick start

**F1 (`f1-daemon-registry-thin-client`) is archived. F2 (`f2-installer-and-doctor`)'s full SDD
planning cycle — explore → propose → spec → design → tasks — is done, audited by Alpha, and ready
for `sdd-apply`.** This is NOT a phase boundary requiring a Director decision: the Director already
decided to archive F1 and start F2 (session 41), and already authorized proceeding through planning.
The next session's first job is implementation: **`sdd-apply`, starting at `tasks.md`'s PR-01.**

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date and CLEAN
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f2-installer-and-doctor --cwd . --json
```

The working tree must be **clean**. The status command should print `tasks: all_done` (well,
`tasks` phase is done — apply hasn't started, so it should read `apply: ready`, `nextRecommended:
"apply"`). If it disagrees, stop and reconcile against `openspec/changes/f2-installer-and-doctor/`
before touching anything.

**Check Arena Orion reachability live** with a real `bridge_send` attempt (not `curl`) before
assuming Alpha responds — this project's own standing rule (DN-09), reconfirmed working twice this
session.

**Copy-paste prompt to start the next session:**

```text
F1 esta archivado. F2 (f2-installer-and-doctor) tiene su ciclo SDD completo (explore/propose/spec/
design/tasks) auditado por Alpha. Lee docs/08-sessions/HANDOFF.md paso a paso, despues arranca
sdd-apply para F2 empezando en tasks.md PR-01. Verifica Arena con un bridge_send real antes de
asumir que Alpha responde. Tienes autorizacion para decidir y ejecutar sin pedir confirmacion,
salvo una decision de producto genuinamente no resuelta (como la de F1/F2 y la de start-at-login
en esta misma sesion) o una accion irreversible.
```

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1 | **Archived.** `openspec/specs/` created (9 domains, 47 requirements, 85 scenarios) — the canonical spec location for this project, used from here on. Change folder moved to `openspec/changes/archive/2026-09-26-f1-daemon-registry-thin-client/`. First-ever `sdd-verify` (0 CRITICAL) and `sdd-archive` run for this project. | `openspec/changes/archive/2026-09-26-f1-daemon-registry-thin-client/archive-report.md` |
| F1 close-out corrections | A 37-session bookkeeping drift fixed: `tasks.md`'s "one remaining item" (the `strict_tdd` flip) had actually been done since session 3 — corrected to 219/219. The real merged-PR count is **47**, not the "44" every session's status line repeated (`#1`-`#47` is 47, not 44 — the old line was self-contradictory on its own text). PR-15/PR-16/PR-17 turned out to be one real GitHub PR (`#20`), an undisclosed 3-into-1 consolidation alongside the four documented 1-into-2 re-slices. | `bus-v2-f1-archive-readiness-audit-001`, `verify-report.md`, CHECKLIST B-57/B-58 |
| RDD native review | First full end-to-end native-review cycle observed in this project: the archive commit (46 files, 24,153 lines) triggered a `high`-risk, 4-lens review; caught one real CRITICAL (an arithmetic error, `archive-report.md`'s own PR-count formula evaluated to 49 not 47); fixed, validated, `APPROVED`, acknowledged. Advisory findings (wrong per-domain spec counts, an undefined figure, a self-referential stale backlog row) fixed in a follow-up commit. | `docs/06-backlog/CHECKLIST.md` B-58/B-59, Engram `sdd/f1-daemon-registry-thin-client/archive-report` |
| F2 | **Fully planned, not yet implemented.** `openspec/changes/f2-installer-and-doctor/{exploration,proposal,design,tasks}.md` + `specs/{installer-wizard,registry-authoring,tool-config-merge,doctor,ipc-handshake,secret-store}/spec.md` all written, committed, pushed. Decisions D-31 through D-52 all locked. 20 PR slices, ≈5,900 authored lines forecast, `auto-chain`/`stacked-to-main`. | `openspec/changes/f2-installer-and-doctor/tasks.md` |
| F2 audit | Alpha audited the full planning set (`bus-v2-session-41-full-audit-001`): `APPROVE`, `CONSENSUS`, no blockers. **Caveat**: Alpha's own citations (file paths, line numbers) were repeatedly wrong even though every substantive claim checked out true on independent verification — see §4. | `docs/05-tribunal/INDEX.md`, Engram obs #3662 |
| Test counts (unchanged from F1, F2 has no code yet) | `npm test` 1084 (1083 pass, 1 skip). `test:static` 43/43. `test:wrong-room` 3/3. | — |

---

## §2 — Next slice: F2 PR-01

**No decision point here — this is a routing table again**, like every pre-F1-close-out handoff.
Start `sdd-apply` for `f2-installer-and-doctor` at `tasks.md`'s **PR-01** (`package.json` +
`npm-shrinkwrap.json` dependency additions — `@clack/prompts`, `jsonc-parser`, `smol-toml` — plus
`src/installer/constants.ts`). Read `tasks.md`'s header table first (delivery strategy, chain
strategy, own-slice rule, verify commands) — it is dense and answers most "how do I run this"
questions before you ask them.

**Two disclosed judgment calls already made and NOT to re-litigate**, unless real new evidence
appears:
- PR-17/PR-18 split (the `daemon/ipc/doctor.ts` route ships before the `daemon/bootstrap.ts` wiring
  edit that depends on it) — a real compile-dependency ordering, not an arbitrary cut. Reviewed and
  accepted this session.
- D-52 (tool-config files are gitignored, not committed) — a genuine Director decision, already
  made this session; do not re-ask it.

---

## §3 — Pinned provenance values

No SEAM/AS-IS v1-vendoring in F2 at all — it is 100% new code (per `design.md`'s own dependency
table, "no v1 production identifiers" applies as before, but there is nothing to pin against v1
line ranges). The provenance mechanism from F1 (fixture, `provenance.test.ts`) is unaffected; F2
introduces no new entries into `test/fixtures/v1-provenance.json`.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **A collaborator's audit verdict can be substantively correct while its citations are fabricated — verify both separately** | Alpha's full-session audit (`bus-v2-session-41-full-audit-001`) returned `APPROVE`/`CONSENSUS` with every underlying claim true on independent re-check, but cited a directory (`.../2026-09-26-f1-bus-core-infrastructure/`) that does not exist anywhere in this repo (the real name is `f1-daemon-registry-thin-client`) and gave wrong line numbers for two files whose *content* it correctly described. One citation set (`pi-mcp-adapter/config.ts`) was exactly right. **Never accept a debate `CONSENSUS` on citation trust alone — re-open and read the actual file at the actual path before accepting, every time**, the same discipline this project already applies to subagent reports. | `bus-v2-session-41-full-audit-001`, Engram obs #3662 |
| **`ScheduleWakeup`'s dynamic-loop sentinel is scoped to the `/loop` skill, not a general "wait for background work" mechanism** | Used it once this session to wait on a `run_in_background` Bash command instead of just ending the turn (the harness notifies automatically on completion — no wakeup needed). It worked without visible harm because the harness treated the call as a legitimate ad-hoc loop and an autonomous-loop tick fired correctly, but it was the wrong tool for that moment. **For a Bash `run_in_background` or Agent-tool wait, just end the turn; do not call `ScheduleWakeup`.** | this session |
| **The RDD review CLI flow has real footguns**: don't re-run `review start` on an already-`reviewing` lineage | It is NOT a safe no-op replay — it can corrupt the repository-context binding (`negotiated START repository context does not match the active reviewing authority`) and force a second, redundant consent prompt. Once a lineage is `reviewing`, drive it forward only via `review status` (with the exact `--base-ref`/`--committed-only`/`--lineage`/`--repository-context` selectors the bound STATUS call returns) → `capture-result` → `capture-correction-plan` → `capture-validation` → `acknowledge-approved`. Bare selectorless `review status` compares workspace-vs-HEAD (empty right after a commit), not the real review diff — always pass the bound selectors once you have them. | this session, review lineage `review-7fc266580fe7f59f` |
| **`managed_assets_outdated` is fixed by running the exact `gentle-ai sync --agent <agent>` the failure's own `continuation` field returns**, then retrying STATUS. Do not guess a sync command. | this session |
| **Engram MCP `mem_save` keeps failing with "multiple active runtime sessions" for every SDD phase sub-agent this session** (explore, propose, spec, design all hit it; tasks did not). Every one needed the orchestrator to persist via the `engram` CLI fallback: `engram save "<title>" "$(cat <file>)" --project connmuta --topic <key> --scope project`. This is long past "transient" — treat it as the expected path, not a fallback, for every SDD phase artifact until the underlying defect is fixed upstream. | HANDOFF history since ~session 27, reconfirmed sessions 40-41 |
| **A forked/delegated subagent's own claim that it "already did X" needs the same readback as any other claim** | The `sdd-archive` subagent claimed it set `state.yaml`'s `archive.status` to `done`; it had not — caught by the parent reading the file back before committing. Same lesson as session 40's fork-committed-without-authorization incident, different shape. | this session |
| **Pi (`@earendil-works/pi-coding-agent`) is now a supported installer target** | Investigated directly on this machine, not from documentation: global config `~/.pi/agent/mcp.json`; project-specific `.pi/mcp.json`; and it *also* reads the shared `.mcp.json` project file Claude Code uses (confirmed in `pi-mcp-adapter/config.ts`, a separate installed plugin package, not the core `@earendil-works/pi-coding-agent` bundle). `.mcp.json` is therefore a multi-tool shared surface — F2's merge logic (D-34, D-43) treats it as such. | `openspec/changes/f2-installer-and-doctor/exploration.md` Addendum, `design.md` §7.3 |
| **`icacls`'s documented command in `THREAT-MODEL.md` is missing `(OI)(CI)` inheritance flags in all 3 places it appears** — a real, independently-verified pre-existing doc gap (not yet fixed in `THREAT-MODEL.md` itself; the correct command is specified in F2's own `design.md` §11 and will land in `THREAT-MODEL.md` when F2's docs slice, PR-20, runs). | `design.md` D-49, this session |
| **Commit messages** | No Co-Authored-By or AI attribution; conventional-commit style. | ongoing |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11-17 |
| **Pronouns** | Refer to the Director by role, never a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm clean tree and F2's native status. Check Arena Orion reachability live
   with a real `bridge_send`.
2. Read `openspec/changes/f2-installer-and-doctor/tasks.md`'s header table and PR-01's block.
3. Run the SDD Session Preflight if the harness's own hook demands it again (it did mid-session-41
   even with cached `config.yaml` settings from a prior session — cached settings on disk are not
   "runtime-confirmed parent authority" for this hard gate). Reuse Automatic / Both (hybrid) / Auto
   (auto-chain) unless the Director changes it.
4. Delegate `sdd-apply` for PR-01 (Model Assignments: `sdd-apply` → sonnet). Follow Strict TDD: RED
   before GREEN, every `src` file has a `test` twin (already enforced project-wide by
   `test/twins.test.ts`).
5. After each PR: run the applicable functional checks, and — if RDD is enabled and the commit
   reaches its review-due threshold — run the native review STATUS→START→capture→acknowledge flow
   per §4's warnings. Leverage Alpha for anything worth a second opinion; verify Alpha's citations
   against the real files before accepting, every time (§4).
6. **Close**: same ritual as this session followed — rewrite this file, prepend to `LOG.md`, sweep
   `AGENTS.md`'s status line, `state.yaml`, `docs/00-INDEX.md`'s backlog board if touched,
   `docs/05-tribunal/INDEX.md`, save the session summary to Engram (CLI fallback if the MCP server
   refuses), commit, push, hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- **F1's archive is closed.** Do not re-open, re-verify, or re-archive it. A defect found in F1's
  shipped code is its own new slice with its own audit, exactly as this project has always handled
  it (see B-53, B-54, B-56 and others — all wait for such slices, all Director-owned).
- **F2's planning cycle (explore → propose → spec → design → tasks) is closed and audited.** Do not
  re-run any of these phases or re-litigate decisions D-31 through D-52. A genuinely new fact
  (not covered by the debates already on record) gets a new, scoped decision at `sdd-apply` time,
  disclosed the way this project always discloses apply-time amendments — never a silent redo of an
  already-decided point.
- **Do not re-ask the Director the F1-archive/F2-start question, the start-at-login (D-40) question,
  or the gitignore-tool-configs (D-52) question** — all three were asked and answered this session.
- **The PR-17/PR-18 split and the two-file-vs-four-file `cli/main.ts`+`ipc-contract.ts`+`telegram.ts`+
  `bootstrap.ts` correction (D-48) are settled** — see §2.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-60** | `installer/token-ref.ts` (F2, not yet built) will duplicate `migration/main.ts`'s private token-reference mirrors; converging them is its own slice after F2 ships, since `migration/main.ts` is an already-merged, already-audited F1 file. | Director |
| **B-59** | `archive-report.md`'s "Source of Truth Updated" section promotes all 9 new specs to canonical status without distinguishing the 4 that were spot-checked against shipped code from the 5 that were only header-inventoried. | Director |
| **B-58** | Half-done: AGENTS.md's PR-count is already corrected to 47; still open — add the PR-15/16/17-into-`#20` consolidation to AGENTS.md's own re-slice disclosure list. | Director |
| **B-57** | `test/daemon/bootstrap.test.js`'s PR-40a re-entrancy-guard case flakes under full-suite parallel load (distinct from the pre-existing B-39 flake); passes in isolation and on rerun. | Director |
| **B-53 / B-54 / B-56** | Carried unchanged from before session 41 (MCP host label; `bootstrap.ts` quarantine check; `design.md` §14 stale static-assertion table). | Director |
| **macOS start-at-login (D-40/D-47)** | Designed on paper only (Windows Run key is the only path exercisable on this machine); empirical verification deferred to F6 (B-12), per design's own explicit note. | Director + Kairo |
| **B-16 / D-10, B-11, B-12** | Licence files and copyright line; trademark screening; macOS scope. Unchanged. | Director |
| **B-05** | No longer a separate spike — closes via F2's own PR-05 write-then-readback merge tests (D-31). Not yet actually closed since F2 hasn't been implemented; close the CHECKLIST row when PR-05 merges. | Director |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions).

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, gentle-ai 3.0.2 CLI (synced mid-session-41 via
  `gentle-ai sync --agent claude-code` — 81 files updated across `.claude/`, `.agents/`, and global
  config; re-run if a future `review start` reports `managed_assets_outdated` again).
- **Pi** (`@earendil-works/pi-coding-agent` v0.86.1) is installed globally on this machine
  (`npm ls -g`), alongside `gentle-pi` (Gentle AI's own integration layer for it) and
  `pi-claude-code-provider`. Useful for any future F2 apply-time verification against a real
  installation, not just the design-time source read this session did.
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests **and on direct pushes to `main`**
  (confirmed this session — doc-only direct-to-main commits still trigger and pass CI).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**. Not read this
  session — F2 vendors no v1 code.
- **Arena bridge confirmed working this session** across two full debate cycles (F2 exploration
  decisions, full-session audit) — one `bridge_read` call hit a transient `ETIMEDOUT` that resolved
  on a single retry; still check live at the start of every session; do not assume it stays up
  automatically. `.mcp.json` points at `http://127.0.0.1:8766/mcp`. Never quote or commit its
  contents.
- This session's own direct-to-`main` commits (no feature branch, no PR) match this project's
  established convention for docs/SDD-planning-only sessions (see session 40's own closing commits,
  `29dcee9`/`5e28d18`, also direct to `main`) — actual `src/`/`test/` implementation work still uses
  feature branches + PRs per the normal F1 precedent; F2's `sdd-apply` should follow that, not this
  session's own docs-only pattern.
