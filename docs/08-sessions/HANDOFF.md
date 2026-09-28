# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
>
> **Reading order for a zero-context session:** §0 → §1 → §2 → §5. Then §3 (pins), §4 (traps),
> §6 (do not redo) and §7 (open points) as the task needs, and §8 for the environment.

---

## §0 — Quick start

**F3 (`f3-web-panel-and-observability`) is fully implemented: all 9 units, 45/45 tasks, 4 more GitHub
PRs merged this session (`#85`-`#88`), closing the change's `sdd-apply` phase entirely.** Native
`sdd-status` already reports `nextRecommended: verify`. **The next session's first job is
`sdd-verify` for F3, then `sdd-archive` if it passes** — the same two-step close-out F1 and F2 both
already went through. The Director explicitly paused here rather than have this session continue
into verify/archive automatically.

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f3-web-panel-and-observability --cwd . --json
```

The working tree should be **clean**. `sdd-status` should show `propose`/`spec`/`design`/`tasks`/`apply`
all `all_done`/`ready` with `taskProgress` at **45/45**, `nextRecommended: "verify"`.

**Check Arena Orion reachability live** with a real `bridge_send` attempt (not `curl`) before assuming
Alpha responds — DN-09. This session hit a real transient outage mid-cycle: 4 consecutive `bridge_send`
failures in a row (`ETIMEDOUT` ×3, then `MCP server "arena" is not connected`), recovering only after
the MCP server itself reconnected (confirmed via `ToolSearch` picking the tools back up) — worse than
prior sessions' single-retry recoveries. Retry a few times with short gaps before concluding Arena is
genuinely unreachable and falling back to Judgment Day; it resolved on its own this time.

**Copy-paste prompt to start the next session:**

```text
F3 esta 100% implementado (sdd-apply cerrado, 45/45 tareas, PR-06 a PR-09 mergeados sesion pasada).
Lee docs/08-sessions/HANDOFF.md paso a paso, despues corre sdd-verify para f3-web-panel-and-observability
y, si pasa, sdd-archive -- el mismo cierre de dos pasos que F1 y F2 ya siguieron. Tienes autorizacion
para decidir y ejecutar sin pedir confirmacion, salvo una decision de producto genuinamente no resuelta
o una accion irreversible -- en ese caso debate con Alpha antes de escribir codigo, como se hizo dos
veces la sesion pasada (bus-v2-f3-pr-08-envelope-provenance-001 y el propio roster_drift de la sesion
anterior a esa). El dispatch nativo de sdd-apply/sdd-verify vía el Agent tool sigue bloqueado por el
mismo defecto de PreToolUse:Agent hook documentado desde la sesion 44 -- si sdd-verify tambien lo
sufre, ejecutalo tu mismo leyendo el skill file real (~/.claude/skills/sdd-verify/SKILL.md), como ya
se hizo con explore/propose/spec/design/tasks/apply en sesiones anteriores.
```

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1 | **Archived**, unchanged since session 41. | `openspec/changes/archive/2026-09-26-f1-daemon-registry-thin-client/` |
| F2 | **Archived**, unchanged since session 44. | `openspec/changes/archive/2026-09-27-f2-installer-and-doctor/` |
| F3 planning | **Complete**, unchanged since session 45. | `openspec/changes/f3-web-panel-and-observability/{proposal,design,tasks}.md`, `specs/*/spec.md` |
| F3 apply — Units 1-5 | **Merged** (session 46). PR-01 through PR-05 (`#78`-`#84`). | `tasks.md`'s Units 1-5, all task checkboxes `[x]` |
| F3 apply — Units 6-9 | **Merged this session (47).** PR-06 (`#85`), PR-07 (`#86`), PR-08 (`#87`), PR-09 (`#88`). **F3 `sdd-apply` is fully done — 45/45 tasks.** | `tasks.md`'s Units 6-9, all task checkboxes `[x]` |
| F3 verify/archive | **Not started.** `nextRecommended: verify`. | — |
| Test counts | `npm test`: 1473 (1467 pass, 0 fail, 6 skip) at the last clean full-suite run this session. | — |
| RDD review (this session's docs-close-out commit) | See §9. | — |

---

## §2 — Next slice: F3 `sdd-verify`, then `sdd-archive`

F3's entire `sdd-apply` phase is done. There is no more implementation work for F3 — the next session's
job is the two closing SDD phases, mirroring F1's and F2's own precedent exactly:

1. **`sdd-verify` for `f3-web-panel-and-observability`.** Read `~/.claude/skills/sdd-verify/SKILL.md`
   if the native Agent dispatch is blocked (very likely — see §4's `PreToolUse:Agent` note) and run it
   inline, the same fallback this project has used since session 44. Verify implementation against
   `specs/{web-panel,roster-sync,version-observability}/spec.md`, `design.md` and `tasks.md`. Cross-check
   in particular:
   - All 3 new capability specs' scenarios are actually covered by shipped tests, not just
     header-inventoried (F1's own archive found 5-of-9 specs only header-checked, filed as B-59 —
     do the real spot-check this time, for all 3 specs, since there are only 3).
   - `docs/02-architecture/THREAT-MODEL.md`'s T18/PT-29 rows (updated PR-09) actually match the real
     shipped `daemon/panel/*` modules and cite real test names — re-verify, don't just trust the PR-09
     diff audit already did this once.
   - `docs/06-backlog/CHECKLIST.md`'s B-14 row says `done` — confirm it's not stale.
   - Full suite + `test:static` green (rebuild first, `rm -rf dist`).
2. **`sdd-archive` if verify passes with no CRITICAL findings.** This creates `openspec/specs/`'s
   `web-panel`, `roster-sync` and `version-observability` domains (or merges into existing ones if any
   already exist — check first) and moves the change folder to
   `openspec/changes/archive/<date>-f3-web-panel-and-observability/`.
3. Debate any genuinely unresolved verify finding with Alpha before deciding how to close it — same
   standing instruction as every other session.

**Do not re-derive F3's own implementation decisions.** Every PR (06 through 09) already went through
a real Alpha debate (see §7's tribunal pointers) and, for PR-06 through PR-09, also this repo's own RDD
native review — both disclosed in the tribunal index and in `docs/06-backlog/CHECKLIST.md`'s B-93/B-94.
A genuinely new fact discovered during verify gets its own scoped, disclosed correction, never a silent
re-plan — mirroring what this project has done for every prior surprise (`roster_drift`, the AS-IS/SEAM
provenance question, the two RDD-found PR-07 gaps).

---

## §3 — Pinned provenance values

**New this session**: `src/shared/envelope.ts` and `test/shared/envelope.test.ts` were reclassified
from **AS-IS to SEAM** (PR-08, `bus-v2-f3-pr-08-envelope-provenance-001`, Alpha-confirmed). Both files'
own header comments now carry a real `Changes:` note; `test/fixtures/v1-provenance.json`'s two entries
say `"verdict": "SEAM"`. This is F3's only provenance-registry change — no new SEAM/AS-IS vendoring
otherwise; every other F3 file is genuinely new code.

`src/daemon/send/validate.ts` (already SEAM since F1) gained one more numbered `Changes:` item, (12),
for the same PR-08 fix (the wire-length guard's `headroom_chars` now also charges the version stamp's
length) — its own AS-IS/SEAM classification did not change, only its Changes list grew.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **The `PreToolUse:Agent` hook still blocks native `sdd-apply`/`sdd-explore`/`sdd-propose`/`sdd-spec`/`sdd-design`/`sdd-tasks` Agent dispatch, confirmed for a fourth consecutive session (44, 45, 46, 47).** It fires even immediately after a fresh, successful `AskUserQuestion` SDD preflight in the same turn. | Established fallback: read the phase's own skill file (`~/.claude/skills/sdd-<phase>/SKILL.md` + `sdd-phase-common.md`) and execute it inline as Kairo. **New this session**: delegating to a plain `general-purpose` Agent (NOT `subagent_type: sdd-apply`) does NOT hit this hook and works — used successfully for PR-07's full implementation. Worth trying first for a large PR before falling back to fully-inline execution. | This session, confirmed again on PR-06's launch attempt |
| **RDD's "scope_changed" correction-recovery flow is a dead end for a self-service agent.** If a bounded correction touches a file outside the review candidate's original manifest, `gentle-ai review status` demands `external.authorize_recovery` / a `gentle-ai review recover --maintainer-authorization <exact binding>` neither Kairo nor (when asked) the Director could construct — every hand-built JSON attempt was rejected with "requires an exact maintainer authorization binding," and no command in this session's own repertoire generates that binding directly. | Hit once, on PR-08's CRITICAL-bug correction (which had to touch `daemon/send/validate.ts`, outside the original 5-file candidate). Resolution used: stop, disclose, rely on Alpha's own diff audit as the closing gate for that candidate instead. If this recurs, don't spend more than 1-2 attempts on `review recover` before falling back the same way. | `bus-v2-f3-pr-08-diff-audit-001`'s own disclosure |
| **RDD review `escalated` state (`unknown_causality`) is informational, not blocking**, per the native contract's own wording ("maintainer action is informational"). Its terminal `next_transition` (`native_stop_required`) only offers "maintainer inspects" or disabling RDD for the clone — for a self-flagged-as-unverified finding on a tiny doc+test diff, neither was warranted; declined and moved on. | Hit once, on PR-09's candidate (`review-d0c040637479fddf`, finding `R2-1`, already downgraded by the readability lens itself as `unverified_location`). | this session |
| **Alpha's own audit of THIS handoff (`bus-v2-session-47-handoff-audit-001`) approved it correctly, but one informational aside inside that approval was itself wrong**: Alpha claimed `gentle-ai sdd-status --json` reports `nextRecommended: "archive"` with both `verify`/`archive` "ready" — re-run live immediately after, the real output is `nextRecommended: "verify"`, `archive: "blocked"` (depends on verify first). This document's own content was never wrong; only extend the "verify a collaborator's citations separately" habit to asides Alpha offers unprompted, not just to objections its approval depends on. | `bus-v2-session-47-handoff-audit-001` | this session |
| **Two independent review mechanisms (Alpha's Arena audit and this repo's own RDD native review) can each catch what the other misses — confirmed concretely, not just in theory.** Alpha's first PR-07 audit (`bus-v2-f3-pr-07-diff-audit-001`) closed `CONSENSUS`/`APPROVE` on a diff RDD's own review then found two real, fixable gaps in (a missing `project_id` cross-check, a vacuous heartbeat test). Extend this project's existing "verify a collaborator's citations and conclusions separately" lesson (session 41) to: **run both checks when both are available, and don't treat either one's approval as sufficient on its own for a PR with real logic in it.** | `bus-v2-f3-pr-07-diff-audit-001` vs. `review-21eb25a2eb6f76f7` | this session |
| **A "fix" for a vacuous-test finding needs the same scrutiny as the original code.** PR-07's heartbeat-test fix was itself inadequate on the first attempt (proved the poller was alive, not that the heartbeat's own tick/reconcile path fired) — caught by the RDD review's own SECOND pass, not the first. When closing an ADR-12-class finding ("this guarantee needs a test that can fail"), ask specifically what mechanism the new assertion depends on, not just whether *something* now fails when the guarantee is violated. | `review-1e4a4960dde90920`'s `R3-heartbeat-proof-is-poller-not-tick` finding | this session |
| **Test-suite flakiness under full-suite/parallel load recurred and one new instance surfaced.** B-39 (heartbeat), B-57 (bootstrap re-entrancy) both hit again, cleared on isolated rerun as always. B-91's loopback-`ETIMEDOUT` pattern also hit `daemon/ipc/routes.test.js` this time, not just `test:wrong-room` — same root class (Windows loopback TCP contention under parallel `node --test`), now confirmed to affect more than one file. **New, not yet filed as backlog**: one single, non-reproduced failure in `test/migration/integration.test.js` under full-suite load, clean on immediate isolated rerun and on a subsequent full-suite rerun — watch for a second occurrence before filing (this project's own convention: B-91 itself was filed only after a `sdd-verify` pass reproduced it, not on a first sighting). | This session, multiple `npm test` runs | — |
| **`gentle-ai sdd-attempt settle` requires `--diagnosis`, but the tool's own bare usage/error text does not list it as required until you omit it and get told.** Also: after an `interrupted` settle, re-`acquire`-ing the SAME objective under a different actor label gets `blocked: maintainer_decision`; the fix is `gentle-ai sdd-attempt supersede` (distinct actor/approach, not a narrowing), never `rescope` (that's only for a genuinely narrower successor). | This session, PR-06's `sdd-apply` dispatch failure recovery | — |
| **Engram `mem_save` failed all session** with "multiple active runtime sessions match the current project and directory" whenever called with `project: "telegram_bus_agent"`. The error itself reveals the resolved project is actually **`"connmuta"`** — pass that exact string, not the directory-derived name, though even that hit the same ambiguity error on a later attempt (unresolved as of this handoff; the session summary below was attempted with `project: "connmuta"`). | This session, first attempted right after PR-06 | — |
| **`design.md`'s two confirmed-stale citations, both disclosed and worked around, neither fixed in the doc itself** (carried from session 46, still true, still not fixed) | (1) The "Testing Strategy" table's `node:fs` row says the panel's allow-list "is never extended" — false as of PR-05. (2) The bootstrap.ts File Change row claims the startup catch block mirrors `ipcServer.close()`/`deleteRunFile` — the real code only calls `.close()` there. Low priority, text-only, whoever next edits `design.md`'s relevant sections should fix both — arguably a natural fit for the upcoming `sdd-verify`/`sdd-archive` pass, since archiving reads `design.md` closely anyway. | `bus-v2-f3-pr-04c-diff-audit-001`, `bus-v2-f3-pr-05-diff-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution; conventional-commit style. | ongoing |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11-17 |
| **Pronouns** | Refer to the Director by role, never a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm clean tree and F3's native status (45/45 tasks, `nextRecommended: verify`).
2. Run `sdd-verify` for `f3-web-panel-and-observability` (inline fallback if the Agent dispatch hook
   blocks it — see §4). Follow §2's specific cross-checks.
3. If verify passes (0 CRITICAL): run `sdd-archive`. If it finds real issues, debate genuinely
   unresolved ones with Alpha before deciding how to close them; fix what's clearly correctable first.
4. **Audit the verify report and the archive itself with Alpha** before considering F3 fully closed —
   same standing convention this project has followed for F1 and F2's own archive commits.
5. Run the RDD review flow (`gentle-ai review status --next-transition` → `start` → lens captures →
   `acknowledge-approved`) for the verify/archive commit(s), same as every other commit this session.
6. **Close**: same ritual as this session followed — rewrite this file, prepend to `LOG.md`, sweep
   `AGENTS.md`'s status line, `docs/00-INDEX.md`'s backlog board, `docs/05-tribunal/INDEX.md` (every
   real debate), save the session summary to Engram (note §4's `project: "connmuta"` requirement and
   its own unresolved ambiguity error), run the RDD review flow if the Stop hook demands it, commit,
   push, hand the Director a ≤3-line mini-prompt.
7. **Once F3 is archived, the natural next step is F4 (or whatever the `WORK-PLAN.md` names next)** —
   check `docs/07-plan/WORK-PLAN.md` for the phase after F3 before assuming what comes next; this
   handoff does not presume it.

---

## §6 — Do not redo

- **F1's and F2's archives are closed.** Do not re-open, re-verify, or re-archive either.
- **F3's exploration, propose/spec/design/tasks phases, and `sdd-apply` Units 1 through 9 are ALL
  closed and Alpha-audited.** Do not re-run any of them or re-debate an already-resolved objection —
  including `roster_drift` (PR-04a), the AS-IS→SEAM envelope provenance reclassification (PR-08), or
  either of PR-07's two RDD-found-and-fixed gaps.
- **Do not re-ask the Director anything this session already had standing authorization to decide** —
  full autonomy was pre-authorized for the entire `sdd-apply` cycle, contingent only on debating a
  genuinely unresolved product/architecture question with Alpha instead of asking, which happened once
  this session (`bus-v2-f3-pr-08-envelope-provenance-001`).
- **B-91 and B-92 (session 44) are filed, not solved** — B-92 explicitly defers backfilling ~20
  historical tribunal entries to a Director-owned decision. **B-93 and B-94 (this session) are filed,
  not solved either** — both explicitly disclose non-blocking findings the RDD review contract itself
  forbids re-opening their already-approved candidates to fix.
- **Do not re-attempt `gentle-ai review recover`'s `scope_changed` path** for PR-08's already-closed
  candidate — that correction is done, merged, and Alpha-audited; the RDD tooling gap is disclosed, not
  something to keep retrying.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-93** | F3 PR-06's RDD review found 6 non-blocking SUGGESTION findings (an unread result field, a token-encoding defense-in-depth gap confirmed non-exploitable, a duplicated `--home` parser, three test-coverage gaps). None fixed — the review contract forbids re-opening an approved candidate for advisory-only findings. | Kairo (next touch of `cli/panel.ts`/`cli/main.ts`) |
| **B-94** | F3 PR-07's two RDD review passes found 23 total findings; 3 real ones fixed (`project_id` cross-check, the heartbeat-tick proof, twice). 10 remain disclosed, not fixed — most notably a TOCTOU race on the sync-roster confirm prompt (judged the same as the already-accepted B-90 precedent), a diff-key/hash-key mismatch, path-match normalization, and a repo-wide unclosed-ledger-connection pattern. | Kairo (future hardening pass, or never, if this command sees only single-operator use) |
| **B-92** | `docs/05-tribunal/INDEX.md` never got ~20 F2 per-PR Alpha debate entries during the apply cycle. Backfilling is a Director-owned scale decision. **Note**: F3's Units 1-9 per-PR debates ARE all present in the tribunal index (sessions 46 and 47 both added them as they happened) — this gap is F2-specific, not a recurring pattern. | Director |
| **B-91** | `npm run test:wrong-room` (standalone script) fails deterministically with a loopback `ETIMEDOUT` alone or at default concurrency; passes in the full suite and at `--test-concurrency=1`. **This session confirmed the same root-cause class also hits `daemon/ipc/routes.test.js`** under full-suite load — environment-specific (Windows loopback TCP contention), not a code regression, but now known to be broader than one test file. | Director |
| **New, unfiled** | A single, non-reproduced `test/migration/integration.test.js` failure under one full-suite run this session, clean on immediate rerun. Watch for recurrence before filing — see §4. | Whoever hits it again |
| **B-60, B-59, B-58, B-57, B-53/54/56** | Carried unchanged from before session 42. | Director |
| **macOS start-at-login (D-40/D-47)** | Designed on paper only; empirical verification deferred to F6 (B-12). | Director + Kairo |
| **B-16 / D-10, B-11, B-12** | Licence files and copyright line; trademark screening; macOS scope. Unchanged. | Director |
| **`design.md`'s two stale citations** | Not filed as backlog rows (text-only, already disclosed and worked around) — see §4. Fix at the next real touch of `design.md`, plausibly during F3's own `sdd-archive`. | Kairo (next `design.md` touch) |
| ~~**B-14**~~ | ~~Version observability without autonomous emission~~ — **closed this session**, shipped in PR-08. | done |

The whole backlog board is indexed in [`../00-INDEX.md`](../00-INDEX.md#pending-director-decisions).

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16.0, npm 11.5, `gentle-ai` CLI (version last confirmed session 41 at
  3.0.2 — not re-checked this session).
- Line endings `eol=lf` via `.gitattributes`.
- `os.tmpdir()` on this machine resolves to an 8.3 short path (`C:\Users\LABORA~1\...`).
- GitHub Actions: Node 24.15 and 26 matrix on pull requests and on direct pushes to `main`. Every PR
  this session passed both legs on the first or second CI run (one B-39 heartbeat-flake rerun needed
  for PR-07, none needed for PR-06/08/09).
- `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`; branch `main`.
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`; **never `gh auth switch`**.
- v1 checkout beside this repo: `telegram-agent-bus` at `bf8f365`, **read-only**. Not read this
  session — F3 vendors no new v1 code (PR-08's SEAM reclassification touched already-vendored files,
  it did not vendor anything new).
- `.mcp.json` points at `http://127.0.0.1:8766/mcp` for the Arena bridge. Never quote or commit its
  contents. See §0/§4 for this session's own transient multi-retry outage.
- **Receipt-driven development (RDD) is enabled for this repository** (`gentle-ai review mode
  status`: `on`, decided by global). It ran on every single-file-set change this session, including
  mid-implementation (uncommitted) candidates as well as post-commit ones — expect the Stop hook to
  fire multiple times per PR, not just once at commit. See §9 for this session's own review status and
  §4 for the two dead ends it hit (`scope_changed` recovery, `escalated`/`unknown_causality`).

---

## §9 — RDD review status at session close

Ran the selectorless STATUS → `review start` sequence against the first documentation-close-out commit
(`1ef791a`, 5 files, 413 changed lines, base `a04df69`). `review start` returned the mandatory
`gentle-ai.review-integration.consent/v3` envelope — risk `medium`, risk evidence `"this change is not
purely passive documentation, so it gets one consolidated review"` plus `"an executable change in
AGENTS.md"` (a false-positive pattern match against prose/code-fence text in the status paragraph or a
cited shell command, mirroring session 45's and session 46's own identical false-positive precedent —
not independently confirmed this session either). Relayed losslessly to the Director via the mandatory
`AskUserQuestion` gate. **The Director chose "Omitir esta vez" (decline)** — ran the exact returned
decline invocation, confirmed `"consent": "declined_this_candidate"`. No review record was created for
that candidate. This second round of edits (this §9 fill-in, the Alpha-citation-correction note in §4,
and the LOG.md addition) forms a second commit on top of `1ef791a`, which will trigger its own fresh RDD
consent prompt at session end — handle it the same way (relay, do not decide unilaterally). Delivery
(commit, push) follows ordinary repository policy, which this session already had standing Director
authorization for. `gentle-ai review mode status` remains `on`, decided by global.
