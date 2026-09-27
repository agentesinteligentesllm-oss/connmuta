# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
>
> **Reading order for a zero-context session:** §0 → §1 → §2 → §5. Then §3 (pins), §4 (traps),
> §6 (do not redo) and §7 (open points) as the task needs, and §8 for the environment.

---

## §0 — Quick start

**F1 and F2 are archived. F3's (`f3-web-panel-and-observability`) full SDD planning cycle — propose,
spec, design, tasks — is done, and every phase closed `CONSENSUS` with Alpha.** This is NOT a phase
boundary requiring a Director decision: the Director already authorized proceeding through F3's
planning with full autonomy last session. **The next session's first job is `sdd-apply` starting at
PR-01** (`daemon/transport/http-guards.ts`) in `tasks.md`.

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f3-web-panel-and-observability --cwd . --json
```

The working tree should be **clean**. `sdd-status` should show `propose`/`spec`/`design`/`tasks` all
`done` and `nextRecommended: apply`. Native status worked correctly this session (unlike F2's cycle);
if it regresses, fall back to `state.yaml`'s own per-phase notes.

**Check Arena Orion reachability live** with a real `bridge_send` attempt (not `curl`) before assuming
Alpha responds — DN-09. Confirmed working 4 times last session (propose/spec/design/tasks audits),
with one transient mid-cycle outage (several `ETIMEDOUT`s during the tasks audit) that recovered on
retry without any code-level cause — treat a repeat of that pattern as noise, not a reason to stop
retrying once or twice before falling back to Judgment Day.

**Copy-paste prompt to start the next session:**

```text
F1, F2 y la fase de planeacion SDD de F3 (propose/spec/design/tasks) estan cerrados, todos con
CONSENSUS de Alpha. Lee docs/08-sessions/HANDOFF.md paso a paso, despues arranca sdd-apply para F3
en tasks.md desde PR-01 (daemon/transport/http-guards.ts), siguiendo el orden de las 9 PR slices ahi
definidas. Tienes autorizacion para decidir y ejecutar sin pedir confirmacion, salvo una decision de
producto genuinamente no resuelta o una accion irreversible. La dispatch nativa de sdd-apply puede
seguir bloqueada por el mismo defecto del hook PreToolUse:Agent documentado en la seccion 4 de este
handoff — si ocurre, ejecuta la fase en linea leyendo sdd-apply/SKILL.md directamente, no reintentes
con fork (el fork fallo dos veces esta sesion con cero tool calls). Audita cada PR con Alpha antes de
avanzar a la siguiente, verificando sus citas contra el codigo real antes de aceptarlas.
```

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1 | **Archived**, unchanged since session 41. | `openspec/changes/archive/2026-09-26-f1-daemon-registry-thin-client/` |
| F2 | **Archived**, unchanged since session 44. | `openspec/changes/archive/2026-09-27-f2-installer-and-doctor/` |
| F3 planning | **Complete.** `proposal.md` (3 new capabilities), `specs/{web-panel,roster-sync,version-observability}/spec.md` (9 requirements, 19 scenarios), `design.md` (4 architecture decisions, a Threat Matrix row, a Testing Strategy table), `tasks.md` (9 PR slices, stacked-to-main, auto-chain, ~2,850 authored lines forecast). Every phase's first Alpha `AUDIT` found real objections (4/4/4/0) — all verified against the real source files before being fixed. | `openspec/changes/f3-web-panel-and-observability/{proposal,design,tasks}.md`, `specs/*/spec.md` |
| F3 apply | **Not started.** PR-01 (`daemon/transport/http-guards.ts`) is next. | `tasks.md`'s "PR Slices" section |
| RDD review (this session's docs+planning commit) | **Ran to completion, `APPROVED`, acknowledged.** Lineage `review-9e0199dbbddbbe8c`, risk `high` (11 files, 880 lines — the "high" tier and its `process_boundary`/`shell_process` risk reason were a false-positive match against prose in `state.yaml`, not real executable code), 4 lenses (risk/resilience/readability/reliability), **zero findings, zero corrections**. | this file's §9 |
| Test counts (unchanged — F3 has no code yet) | `npm test` 1403 (1397 pass, 6 skip). `test:static` 56/56. | — |

---

## §2 — Next slice: F3 `sdd-apply`, starting PR-01

Read `openspec/changes/f3-web-panel-and-observability/tasks.md` in full — it has the exact scope,
branch name, size estimate, and RED/GREEN task list for all 9 PR slices, plus the Review Workload
Forecast and the disclosed "own-slice" precedent for `daemon/ipc/server.ts` (PR-02) and
`daemon/bootstrap.ts` (PR-05).

**Do not re-derive the plan.** Every decision in `proposal.md`/`design.md`/`tasks.md` already went
through a real Alpha `AUDIT`/`CONSENSUS` cycle. A genuinely new fact discovered only during
implementation (e.g. PR-04's real diff exceeding its ~420-line estimate) gets its own scoped,
disclosed correction — never a silent re-plan.

Start with **PR-01** (`daemon/transport/http-guards.ts`, no dependencies) — it is the foundation both
`daemon/ipc/server.ts` (PR-02) and the panel listener (PR-04) build on.

---

## §3 — Pinned provenance values

No SEAM/AS-IS v1-vendoring in F3 (same as F2) — it is 100% new code on top of F1/F2's already-shipped
infrastructure. No new entries into `test/fixtures/v1-provenance.json` expected.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **Native `sdd-propose`/`sdd-spec`/`sdd-design`/`sdd-tasks` sub-agent dispatch is blocked by the same `PreToolUse:Agent` hook defect already documented for `sdd-explore`** | Error every time: `"SDD child dispatch refused: parent-confirmed SDD preflight is missing, invalid, or uncorroborated."` This almost certainly also blocks `sdd-apply`/`sdd-verify`/`sdd-archive`. The working fallback, used 4 times last session: read the phase's own `~/.claude/agents/sdd-{phase}.md` (for the exact skill paths) and `~/.claude/skills/sdd-{phase}/SKILL.md` + `_shared/sdd-phase-common.md`, then execute the phase directly inline (as the orchestrator, not via a spawned agent) — do NOT re-ask the `AskUserQuestion` preflight (it did not fix this last time it was tried, per session 44, and the Director has standing "no me preguntes nada" authorization). | this session, session 44 |
| **`fork` delegation for SDD phase work is currently unreliable — do not trust it as the first fallback** | Two consecutive `fork` launches for `sdd-propose` this session returned in 3-6 seconds with **zero tool calls** and a plausible-sounding but entirely fabricated completion message; `proposal.md` was confirmed absent from disk both times via direct `ls`. This is a **new, distinct defect** from the SDD hook above — a fork given a well-formed, self-contained prompt with full context should not silently no-op. **Go straight to inline execution (Kairo doing the phase work directly) rather than trying `fork` first** for SDD phase work until this is confirmed fixed; always verify a fork's claimed file writes with `ls`/`git status` before trusting them, exactly as session 44 already learned for a different reason (scope overreach, not silent no-ops). | this session |
| **Arena had a transient mid-session outage, unrelated to reachability-at-session-start** | After 3 clean debate cycles (propose/spec/design audits), several `bridge_send` calls for the tasks-phase audit returned `ETIMEDOUT` in a row; a retry succeeded, and the debate closed cleanly with a genuine, detailed Alpha audit (proving the message did eventually land despite the client-side timeouts). Lesson: a `bridge_send` timeout mid-session is not the same signal as "Arena unreachable at session start" (DN-09's fallback trigger) — retry once or twice before concluding the bridge is down and falling back to Judgment Day. | this session |
| **Engram's `mem_save` "multiple active runtime sessions" failure recurred again** | Every `mem_save` call for F3's proposal/spec/design/tasks artifacts this session hit it; the `engram save` CLI fallback (`engram save "<title>" "<content>" --type architecture --project connmuta`) worked every time and is the reliable path. | HANDOFF history since ~session 27 |
| **The RDD review's `--intended-untracked-selection` JSON schema is undocumented; use the `--intended-untracked`/`--untracked-scope`/`--expected-untracked-inventory` CLI flags instead** | A raw `review status --next-transition` call returns a `collect` step naming `intended_untracked_selection` with no visible schema; guessing its JSON shape fails with `invalid_request`. The reliable path: re-run `review status` with `--untracked-scope select --expected-untracked-inventory <digest-from-the-first-status-call> --intended-untracked <path>` (repeated per new file) — this returns the exact, ready-to-run `review start` command in its `next_transition.execute.command` field. Never hand-craft `--target`/`--target-evidence` from prose; always take them from a returned transition. | this session |
| **Commit messages** | No Co-Authored-By or AI attribution; conventional-commit style. | ongoing |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11-17 |
| **Pronouns** | Refer to the Director by role, never a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm clean tree and F3's native status.
2. Read `openspec/changes/f3-web-panel-and-observability/tasks.md` in full, especially PR-01's
   scope/RED/GREEN tasks and the "own-slice" precedent note for PR-02/PR-05.
3. Run the SDD Session Preflight only if the harness's own hook demands it again — reuse
   Automatic / Both (hybrid) / Auto (auto-chain), the standing convention since F1. If native
   `sdd-apply` dispatch is blocked by the `PreToolUse:Agent` hook (§4), execute inline per that
   section's fallback rather than stalling or re-asking a preflight that already failed to help.
4. Implement PR-01 through PR-09 in `tasks.md`'s dependency order, Strict TDD (RED before GREEN),
   each `src` file with its `test` twin. Re-measure each PR's real diff before opening it — PR-04 is
   flagged at ~420 estimated lines and may need re-slicing into PR-04a/PR-04b at the
   `server.ts`/`routes.ts` boundary if it exceeds 400, per Alpha's own tasks-audit note.
5. **Audit every PR with Alpha before merging it**, verifying Alpha's own citations against the real
   files before accepting them (this project's standing lesson since session 41) — this session's
   own propose/spec/design audits are the fresh proof of how much a real audit catches when done
   this way (12 real, evidence-backed objections across 3 phases, all confirmed true).
6. Run the RDD review flow (`gentle-ai review status --next-transition` → `start` → 4× parallel
   `capture-result` → `acknowledge-approved`) at whatever granularity the Director's Stop hook or
   this project's own convention calls for — this session ran it once for the whole planning-docs
   commit; a code-heavy `apply` session will likely want it per PR or per work unit instead.
7. **Close**: same ritual as this session followed — rewrite this file, prepend to `LOG.md`, sweep
   `AGENTS.md`'s status line, `state.yaml`, `docs/00-INDEX.md`'s backlog board if touched,
   `docs/05-tribunal/INDEX.md` (every real debate, not just the significant-feeling ones), save the
   session summary to Engram (CLI fallback if the MCP server refuses), run the RDD review flow if
   the Stop hook demands it, commit, push, hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- **F1's and F2's archives are closed.** Do not re-open, re-verify, or re-archive either.
- **F3's exploration, and its propose/spec/design/tasks phases, are closed and Alpha-audited.** Do
  not re-run any of them or re-debate an already-resolved objection. A genuinely new fact discovered
  during `apply` gets its own new, scoped, disclosed correction — never a silent redo of a whole phase.
- **Do not re-ask the Director anything this session already had standing authorization to decide** —
  full autonomy was pre-authorized for F3's entire planning cycle this session.
- **B-91 and B-92 (session 44) are filed, not solved** — B-92 explicitly defers backfilling ~20
  historical tribunal entries to a Director-owned decision.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-14** | Version observability (build/wire version rendering) — **planned, not yet shipped.** F3's `tasks.md` PR-08/PR-09 close this at apply time; do not mark it `done` until those PRs merge. | Kairo (apply-time) |
| **B-92** | `docs/05-tribunal/INDEX.md` never got ~20 F2 per-PR Alpha debate entries during the apply cycle. Backfilling is a Director-owned scale decision. | Director |
| **B-91** | `npm run test:wrong-room` (standalone script) fails deterministically with a loopback `ETIMEDOUT` alone or at default concurrency; passes in the full suite and at `--test-concurrency=1`. Environment-specific, not a code regression. | Director |
| **B-60, B-59, B-58, B-57, B-53/54/56** | Carried unchanged from before session 42. | Director |
| **macOS start-at-login (D-40/D-47)** | Designed on paper only; empirical verification deferred to F6 (B-12). | Director + Kairo |
| **B-16 / D-10, B-11, B-12** | Licence files and copyright line; trademark screening; macOS scope. Unchanged. | Director |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions).

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, `gentle-ai` CLI (version last confirmed session 41 at
  3.0.2 — not re-checked this session).
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests and on direct pushes to `main`.
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**. Not read this
  session — F3 planning vendors no v1 code.
- `.mcp.json` points at `http://127.0.0.1:8766/mcp` for the Arena bridge. Never quote or commit its
  contents. See §4 for this session's transient-outage note.
- **Receipt-driven development (RDD) is enabled for this repository** (`gentle-ai review mode
  status`: `on`, decided by global). It ran to completion this session — see §9.

---

## §9 — RDD review status at session close

Ran to completion. Lineage `review-9e0199dbbddbbe8c`, risk `high` (11 files, 880 changed lines —
triggered by a `process_boundary`/`shell_process` risk-reason match against prose text in
`openspec/changes/f3-web-panel-and-observability/state.yaml`, a false positive: that file is a YAML
status record, not executable code), 4 lenses (`review-risk`, `review-resilience`,
`review-readability`, `review-reliability`), run in parallel per the Concurrent Reviewer Group
protocol. The Director was asked for consent via the mandatory `AskUserQuestion` relay (a distinct
gate from the session's own F3 planning work — never inferred) and granted it. Closed **APPROVED**
with **zero findings and zero corrections** across all 4 lenses, acknowledged, authority burned
(`consumed_revision: sha256:33f41cdbd2f2a62986caa0fa3238e3fc227a93bb27f00fbea8e7b90977c63958`).

One operational note for next session, not a review finding: the `intended_untracked_selection`
JSON schema the raw `collect` step names is undocumented and a guessed shape fails closed
(`invalid_request`); the working path is the `--intended-untracked`/`--untracked-scope`/
`--expected-untracked-inventory` CLI flags on a repeated `review status` call, which then hands back
the exact `review start` command to run verbatim — recorded in §4 above so it is not re-discovered
by trial and error.
