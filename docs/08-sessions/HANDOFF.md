# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
>
> **Reading order for a zero-context session:** §0 → §1 → §2 → §5. Then §3 (pins), §4 (traps),
> §6 (do not redo) and §7 (open points) as the task needs, and §8 for the environment.

---

## §0 — Quick start

**F1 and F2 are archived. F3's (`f3-web-panel-and-observability`) SDD planning cycle is done and
Units 1 through 5 of `sdd-apply` are merged** (7 GitHub PRs, `#78`-`#84`) — **the web panel is now
reachable end-to-end within the running daemon.** The next session's first job is **PR-06**
(`cli/panel.ts` + `cli/main.ts` dispatch, the `conmuta panel` verb) in `tasks.md`.

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f3-web-panel-and-observability --cwd . --json
```

The working tree should be **clean**. `sdd-status` should show `propose`/`spec`/`design`/`tasks` all
`done`, `applyState: ready`, `taskProgress` at 24/45 completed (Units 1-5 done, Units 6-9 pending).

**Check Arena Orion reachability live** with a real `bridge_send` attempt (not `curl`) before assuming
Alpha responds — DN-09. Confirmed working 8 times last session (7 diff audits + 1 plan-gap debate), with
one transient `ECONNRESET`/`ETIMEDOUT` mid-cycle (during PR-05's audit) that recovered on a single retry —
Alpha's own follow-up audit confirmed this was loopback TCP port exhaustion under Windows load (B-91's
known pattern), not a real defect. Treat a repeat of that pattern as noise, not a reason to stop
retrying once or twice before falling back to Judgment Day.

**Copy-paste prompt to start the next session:**

```text
F3 sigue en sdd-apply: Units 1-5 mergeadas (7 PRs, #78-#84), el panel web ya funciona de punta a
punta dentro del daemon. Lee docs/08-sessions/HANDOFF.md paso a paso, despues continua con PR-06
(cli/panel.ts + dispatch en cli/main.ts) en tasks.md, siguiendo el orden Units 6-9. Tienes
autorizacion para decidir y ejecutar sin pedir confirmacion, salvo una decision de producto
genuinamente no resuelta o una accion irreversible -- en ese caso debate con Alpha antes de escribir
codigo, como se hizo con el gap de roster_drift la sesion pasada (bus-v2-f3-pr-04-plan-gap-001).
Audita cada PR con Alpha antes de fusionar, verificando sus citas contra el codigo real. Un fork de
investigacion (no de implementacion) devolvio una respuesta vacia/no relacionada la sesion pasada --
si vuelve a pasar, no reintentes con fork, lee el codigo directamente tu mismo.
```

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| F1 | **Archived**, unchanged since session 41. | `openspec/changes/archive/2026-09-26-f1-daemon-registry-thin-client/` |
| F2 | **Archived**, unchanged since session 44. | `openspec/changes/archive/2026-09-27-f2-installer-and-doctor/` |
| F3 planning | **Complete**, unchanged since session 45. | `openspec/changes/f3-web-panel-and-observability/{proposal,design,tasks}.md`, `specs/*/spec.md` |
| F3 apply — Units 1-5 | **Merged.** PR-01 (`http-guards.ts`, `#78`), PR-02 (`ipc/server.ts` wiring, `#79`), PR-03 (panel token/run-file, `#80`), PR-04a (`roster_drift` persistence, inserted/disclosed, `#81`), PR-04b (`panel/server.ts`, `#82`), PR-04c (`panel/routes.ts`, `#83`), PR-05 (bootstrap wiring, `#84`). | `tasks.md`'s Units 1-5, all task checkboxes `[x]` |
| F3 apply — Units 6-9 | **Not started.** PR-06 (`conmuta panel` CLI verb) is next. | `tasks.md`'s Units 6-9 |
| Test counts | `npm test`: 1443 (1437 pass, 0 fail, 6 skip). `test:static`: 56/56. | — |
| RDD review (this session's docs-close-out commit) | See §9. | — |

---

## §2 — Next slice: F3 `sdd-apply`, PR-06 onward

Read `openspec/changes/f3-web-panel-and-observability/tasks.md` in full — Units 6 through 9 are still
exactly as ratified (no re-slicing needed there; only Unit 4 needed it, already done). Do not re-derive
the plan for Units 1-5 — they are merged and closed.

**Do not re-derive Units 1-5's decisions.** Every one of them (the shared transport guard, the panel
token/run-file split, the `roster_drift` persistence resolution, the PR-04 re-slice, the bootstrap
wiring's catch-block parity with `ipcServer`) already went through a real Alpha debate. A genuinely new
fact discovered during Units 6-9's implementation gets its own scoped, disclosed correction — never a
silent re-plan — mirroring what PR-04's own `roster_drift` gap and its re-slice already did.

**PR-06** (`cli/panel.ts` + `cli/main.ts` dispatch, Depends: PR-05, done): reads `run/panel.json`
(`daemon/panel/panel-run-file.ts`'s `readPanelRunFile`, already merged) and prints
`http://127.0.0.1:<port>/?token=<token>` once; a clear error when the daemon is not running. Mirrors
`test/cli/daemon-stop.test.ts`'s real-CLI-spawn pattern (`~160 lines est.`).

**PR-07** (`cli/project-sync-roster.ts` + `registry-commit.ts` + dispatch, parallel to Units 1-6,
`~380 lines est.`) is the CLI verb that actually resolves `roster_drift` — read `conmuta.json` + registry,
diff, confirm, commit through `commitRegistryChange` with the new `"ROSTER_SYNCED"` reason. **This is
the piece PR-04a's own disclosure named as "where a human gets the real diff."** Re-check its own
heartbeat-tick scenario (task 7.6) proves ticks never call `sync-roster` and never touch
`roster_snapshot`/`roster_hash` — it does NOT need to prove anything about the new `roster_drift`
condition PR-04a added, since that condition is raised/cleared only by `POST /session`, not by
`sync-roster` or the heartbeat.

**PR-08** (`WIRE_VERSION` + `renderMessageHtml`, parallel, `~110 lines est.`) and **PR-09** (bundle
assertion + `THREAT-MODEL.md` close-out, depends on PR-04/06/07, `~120 lines est.`) close the change.
PR-09's task 9.1 asserts no `daemon/panel/*.js` file appears in the `node:fs` reference list — **this
will need updating**, since PR-05 already added `daemon/panel/panel-run-file.js` to that list (correctly
— it is a run-discovery file, not a panel asset). Read PR-09's own task text again before writing its
RED test: the assertion needs to be "no panel HTML/CSS/JS-serving file" (`server.ts`/`routes.ts`), not
"no `daemon/panel/*` file at all," since one already legitimately belongs there.

---

## §3 — Pinned provenance values

No SEAM/AS-IS v1-vendoring in F3 — 100% new code on top of F1/F2's already-shipped infrastructure. No
new entries into `test/fixtures/v1-provenance.json` expected for Units 6-9 either.

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **`design.md` has two confirmed-stale citations, both disclosed and worked around, neither fixed in the doc itself** | (1) The "Testing Strategy" table's `node:fs` row says the panel's allow-list "is never extended" — false as of PR-05: `panel-run-file.js` legitimately joined it (it is a run-discovery file, not a panel HTML/CSS/JS asset; PT-28's real scope is about the latter). (2) The bootstrap.ts File Change row claims the startup catch block mirrors `ipcServer.close()`/`deleteRunFile` — the real code only calls `.close()` there; `deleteRunFile` runs only in `stop()`. PR-05 mirrored the REAL precedent for the panel, not the doc's claim. Neither correction has been written back into `design.md` itself — low priority, text-only, whoever next edits that file's relevant sections should fix both. | `bus-v2-f3-pr-04c-diff-audit-001`, `bus-v2-f3-pr-05-diff-audit-001`, `tasks.md`'s PR-04c/PR-05 blocks |
| **A research fork can return a plausible-looking non-answer instead of failing loudly** | A fork launched to research registry/ledger read APIs for PR-04 (explicitly told NOT to write code) ran for real (48s, 6 tool uses — not the previously-documented zero-tool-call empty-return pattern) but its final message was an unrelated stray sentence, not findings. `panel/routes.ts` was still written correctly via direct reads instead. Treat any fork's own final "result" text as unverified until it visibly contains what was asked for — a plausible-sounding non-sequitur is now a confirmed failure mode alongside the empty-return one. | this session |
| **`ledger/conditions-store.ts`'s zero-field contract path was live code with zero test coverage before PR-04a** | `parseDetail`'s `contract.fields.size > 0` branch (the "no fields required" case) existed since the module's original PR-13 but nothing exercised it until `roster_drift` became this store's first zero-field `ConditionName`. Worth remembering if a future name needs the same shape. | `bus-v2-f3-pr-04a-diff-audit-001` |
| **Own-slice rule extended in practice, not just in tasks.md's own wording**: `daemon/serve/status.ts` got an export-only, zero-logic-change touch from PR-04c (three private helpers made public) without needing its own dedicated PR | The "own-slice" rule (tasks.md's own field) is about NOT bundling new-capability code into an already-merged multi-purpose file's PR; a pure visibility change with zero behavior change and its own full re-run test confirmation is a smaller class of touch this project already accepts inline (mirrors PR-02's `daemon-bundle.test.ts` fix, PR-03's `constants.ts` addition). | `bus-v2-f3-pr-04c-diff-audit-001` |
| **Commit messages** | No Co-Authored-By or AI attribution; conventional-commit style. | ongoing |
| **`dist/` staleness fakes results** | `rm -rf dist` before believing a surprising run. | sessions 11-17 |
| **Pronouns** | Refer to the Director by role, never a gendered pronoun. | — |

---

## §5 — Next session, exact sequence

1. **§0** commands; confirm clean tree and F3's native status (24/45 tasks done).
2. Read `openspec/changes/f3-web-panel-and-observability/tasks.md`'s Units 6-9 in full.
3. Implement PR-06 through PR-09 in dependency order, Strict TDD (RED before GREEN), each `src` file
   with its `test` twin. PR-09's own bundle-assertion task needs the correction noted in §2 (the
   `node:fs` allow-list already legitimately contains one panel file after PR-05).
4. **Audit every PR with Alpha before merging it**, verifying Alpha's own citations against the real
   files first — this project's standing lesson since session 41, and last session's own
   `bus-v2-f3-pr-04-plan-gap-001` is the fresh proof of what a real pre-code debate catches (a genuine
   architectural gap, not a cosmetic nit).
5. If a genuinely new fact surfaces mid-implementation (the way `roster_drift`'s missing persistence
   did for PR-04), debate it with Alpha as a `PROPOSAL`-kind envelope BEFORE writing production code,
   exactly as last session did — do not silently invent a resolution or silently re-plan.
6. Run the RDD review flow (`gentle-ai review status --next-transition` → `start` → 4× parallel
   `capture-result` → `acknowledge-approved`) at whatever granularity the Director's Stop hook or this
   project's own convention calls for — last session ran it once for the whole documentation-close-out
   commit (each PR's own commit already went through GitHub + a full Arena/Alpha audit); see §9.
7. **Close**: same ritual as this session followed — rewrite this file, prepend to `LOG.md`, sweep
   `AGENTS.md`'s status line, `docs/00-INDEX.md`'s backlog board, `docs/05-tribunal/INDEX.md` (every
   real debate), save the session summary to Engram (CLI fallback if the MCP server refuses), run the
   RDD review flow if the Stop hook demands it, commit, push, hand the Director a ≤3-line mini-prompt.

---

## §6 — Do not redo

- **F1's and F2's archives are closed.** Do not re-open, re-verify, or re-archive either.
- **F3's exploration, propose/spec/design/tasks phases, and `sdd-apply` Units 1 through 5 are closed
  and Alpha-audited.** Do not re-run any of them or re-debate an already-resolved objection —
  including the `roster_drift` persistence question, already resolved and shipped in PR-04a.
- **Do not re-ask the Director anything this session already had standing authorization to decide** —
  full autonomy was pre-authorized for the entire `sdd-apply` cycle, contingent only on debating a
  genuinely unresolved product question with Alpha instead of asking, which is exactly what happened
  once (`bus-v2-f3-pr-04-plan-gap-001`).
- **B-91 and B-92 (session 44) are filed, not solved** — B-92 explicitly defers backfilling ~20
  historical tribunal entries to a Director-owned decision. No new backlog rows were filed this
  session; the two `design.md` citation staleness findings were disclosed and worked around in
  `tasks.md`/the tribunal record instead of filed as new backlog rows (a text-only doc fix, not an
  open product question).

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **B-14** | Version observability (build/wire version rendering) — **planned, not yet shipped.** F3's `tasks.md` PR-08/PR-09 close this at apply time; do not mark it `done` until those PRs merge. | Kairo (apply-time) |
| **B-92** | `docs/05-tribunal/INDEX.md` never got ~20 F2 per-PR Alpha debate entries during the apply cycle. Backfilling is a Director-owned scale decision. | Director |
| **B-91** | `npm run test:wrong-room` (standalone script) fails deterministically with a loopback `ETIMEDOUT` alone or at default concurrency; passes in the full suite and at `--test-concurrency=1`. Environment-specific, not a code regression. Also the likely cause of this session's one transient `bridge_send` `ECONNRESET` (confirmed by Alpha's own re-check). | Director |
| **B-60, B-59, B-58, B-57, B-53/54/56** | Carried unchanged from before session 42. | Director |
| **macOS start-at-login (D-40/D-47)** | Designed on paper only; empirical verification deferred to F6 (B-12). | Director + Kairo |
| **B-16 / D-10, B-11, B-12** | Licence files and copyright line; trademark screening; macOS scope. Unchanged. | Director |
| **`design.md`'s two stale citations** | Not filed as backlog rows (text-only, already disclosed and worked around) — see §4. Fix at the next real touch of `design.md`'s Testing Strategy table or bootstrap.ts File Change row. | Kairo (next `design.md` touch) |

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
  session — F3 vendors no v1 code.
- `.mcp.json` points at `http://127.0.0.1:8766/mcp` for the Arena bridge. Never quote or commit its
  contents. See §4/§0 for this session's transient-outage note.
- **Receipt-driven development (RDD) is enabled for this repository** (`gentle-ai review mode
  status`: `on`, decided by global). See §9 for this session's own review status.

---

## §9 — RDD review status at session close

Ran the selectorless STATUS → `review start` sequence against the documentation-close-out commit
(`145388f`, 5 files, 396 changed lines, base `062e3a9`). The `review start` call returned the mandatory
`gentle-ai.review-integration.consent/v3` envelope — risk `medium`, risk evidence `"this change is not
purely passive documentation, so it gets one consolidated review"` plus `"an executable change in
AGENTS.md"` (very likely a false-positive pattern match against prose/code-fence text in the huge status
paragraph or a cited shell command, mirroring session 45's own `state.yaml` false-positive precedent —
not independently confirmed this session). Relayed losslessly to the Director via the mandatory
`AskUserQuestion` gate (never inferred). **The Director chose "Omitir esta vez" (decline)** — ran the
exact returned decline invocation, confirmed `"consent": "declined_this_candidate"`. No review record
was created for this candidate; delivery (commit, push) follows ordinary repository policy, which this
session already had standing Director authorization for. Future medium/high-risk changes will ask again
— this decline is candidate-scoped, not a change to the RDD switch itself (`gentle-ai review mode
status` remains `on`, decided by global).
