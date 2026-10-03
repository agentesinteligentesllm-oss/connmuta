# B-107 — optional `--project`, nearest-ancestor binding resolution, and registration that no longer encodes a project

## Objective

Close B-107's root cause rather than its symptom. Make the thin client's `--project <id>` flag
**optional**: with the flag present it remains an assertion (a mismatch is still refused); with the
flag absent the client binds to the **nearest ancestor `conmuta.json`** of its cwd. That is what makes
a single registration correct for every session in a tree — including a session whose cwd is a
subfolder (`…\FRISCO\frisco-erp`) and a headless `pi -p` turn, which is exactly the shape the wake
satellite starts and which loses every project-scoped entry to Pi's project-trust gate.

## Problem / why

Filed in session 60 while making the bus registration project-scoped (HANDOFF §3.2). Session 61
reproduced it and the Director authorized the durable fix on 2026-10-01 (Engram observation
`b107-global-bus-registration`):

- Pi reads `<cwd>/.pi/mcp.json` **only when the project is trusted**, and a non-UI run resolves *not
  trusted* when no decision is saved — so the woken turn keeps its quota cost and loses the bus tools.
- Project config is cwd-relative with **no ancestor walk-up**, so `FRISCO\.pi\mcp.json` is invisible to
  a session in `FRISCO\frisco-erp`.
- A **user-level** entry that hardcodes `--project <id>` is wrong for the same reason in reverse: it
  makes every session on the machine load a client that refuses everywhere the id does not match.

All three are the same defect: **the registration artifact encodes the project**, when the binding is
already recorded on disk as the nearest ancestor `conmuta.json` (ADR-0028 rule 3).

## Authority and the ADR question

ADR-0028 rule 4 currently reads "the thin client **requires** `--project <id>` and cross-checks a cwd
walk-up … it refuses to start when unbound or mismatched", and the canonical spec
`openspec/specs/thin-client-tools/spec.md` lands that requirement. Making the flag optional therefore
**amends** rule 4 — the repository rule is "Cite the ADR the design implements, or amend it via a new
ADR" (`GOVERNANCE.md` §4). This unit writes **ADR-0033** for that amendment and records the reciprocal
in-part note on ADR-0028, mirroring how ADR-0032 handled ADR-0006.

It is **not** a constitutional amendment: Invariant 1 (bijective binding, no cross-project leakage)
survives intact, because the two mechanisms that enforce it are untouched — the nearest-ancestor
walk-up still fixes the binding at MCP-session start, and the daemon still asserts
`chat_id === binding.group_id` before every `sendMessage` (`WRONG_ROOM`). Only the *test row* that
pins the invariant changes shape, and it changes from "refuses when `--project` is missing" to
"refuses when the nearest ancestor binding is absent, invalid, or disagrees with an explicit
`--project`".

## Design (decided at planning time; corrected below to as-built)

> **As-built note added after Judgment Day round 1** (session 62, `jd-judge-a` A-3 and `jd-judge-b`
> JD-B-004). Items 1–3 below are the PLANNED design and are wrong on one point: the plan said the
> `missing_project_flag` refusal kind would be removed. It was not, and could not be: two other bins
> reach it. What shipped is the corrected version recorded in "As built" right after the list.

1. `src/client/binding.ts` — `ResolveProjectBindingOptions.project` becomes optional. `undefined` and
   `""` both mean "no assertion": bind to the nearest ancestor `conmuta.json`. A non-empty `--project`
   keeps today's `project_id_mismatch` refusal verbatim. ~~The `missing_project_flag` refusal kind is
   removed (no longer reachable).~~
2. `src/client/main.ts` — drop the `project === undefined → EXIT_USAGE` early return; ~~and the
   `missing_project_flag` arm of `refusalMessage`~~; keep the Node-floor gate first and every other
   refusal unchanged. (The arm stays: the kind is still reachable through the option below, so the
   switch must remain exhaustive over `BindingRefusal`.)
3. `src/cli/main.ts` — `mcp [--project <id>]`; keep `--project` and `--project=` as usage errors (an
   explicitly empty assertion is still malformed), drop the "mcp requires --project <id>" gate, and
   update `USAGE_LINES`. A third spelling, `--project` followed by an empty token, was missed by this
   plan and found in round 1 (JD-B-003); it is now a usage error too.
4. **Installer untouched.** `buildLauncherEntry(projectId)` keeps emitting `mcp --project <id>`
   (D-42). Changing what the installer writes is a separate decision with its own blast radius
   (`launcher.ts`, the wizard, `tool-config-merge`, PT entries); this unit records it as a disclosed
   consequence and backlogs it as **B-109** rather than folding it in silently.
5. **Registration guidance** in the runbook: one id-free user-level entry is now correct, because the
   entry no longer carries a project id.

### As built (what actually shipped)

- `resolveProjectBinding` gains an explicit **`requireProjectFlag?: boolean`** option, default false.
  The thin client does not set it, so no flag (or `""`) means "no assertion". `conmuta-channel` and
  `conmuta-runner` **do** set it, which is how they keep the pre-amendment `missing_project_flag` /
  `EXIT_USAGE` refusal byte-for-byte: their argv is written per binding by the daemon or by an
  operator wrapper, never once per tree by a host config. The asymmetry is the point of the amendment
  and is stated in ADR-0033 decision 3.
- The `missing_project_flag` kind therefore **stays** in `BindingRefusal`, and `src/client/main.ts`
  keeps its (documented-unreachable-from-this-caller) arm.

## Tasks

- [x] **T1** — `odd/` doc + this task list (before the first source write).
- [x] **T2** — RED: rewrite `test/client/binding.test.ts`'s two `missing_project_flag` tests into
      "absent `--project` binds to the nearest ancestor" tests, and add the subfolder, no-file and
      empty-string cases. Observed RED against the unmodified `binding.ts`.
- [x] **T3** — GREEN: `src/client/binding.ts` (optional assertion **plus the `requireProjectFlag`
      opt-in that keeps the two bins strict** — see "As built"; the planned removal of
      `missing_project_flag` was corrected during implementation).
- [x] **T4** — RED/GREEN: `test/client/main.test.ts` + `src/client/main.ts` (no `EXIT_USAGE` early
      return; the absent-flag case now reaches the walk-up and starts a live server).
- [x] **T5** — RED/GREEN: `test/cli/main.test.ts` + `src/cli/main.ts` (`mcp [--project <id>]`, usage
      text, async dispatch for the bare `mcp` form; the stale "reserved for a later slice" loop dropped
      `mcp`).
- [x] **T6** — `openspec/specs/thin-client-tools/spec.md`: rewrite the launcher requirement + its
      scenarios + traces against the shipped behavior.
- [x] **T7** — `docs/03-adr/0033-…md` + ADR INDEX row + reciprocal in-part note on ADR-0028.
- [x] **T8** — Reconcile every live document that stated "requires `--project`": `CONSTITUTION.md`
      (Invariant 1 test row), `OVERVIEW.md` (D5 row, architecture diagram, component table, §6, §8,
      the §9 handshake sequence diagram, §10.3), `DATA-MODEL.md` §1, `THREAT-MODEL.md` T01 and T03,
      `WORK-PLAN.md` F1 deliverables, `00-INDEX.md`'s ADR table, tribunal `INDEX.md` D5 row.
- [x] **T9** — `docs/runbooks/wake-satellite.md`: the one-time project-trust grant and the id-free
      registration, in the operator's words.
- [x] **T10** — Verification: `npm run build && npm test` (1845 / 1839 / 0 / 6) and `npm run test:static`
      99 / 99.
- [x] **T11** — Machine state (Director's go-ahead given): one id-free global Pi MCP entry and
      `FRISCO\.pi\mcp.json` retired with a backup. Verified by resolving the binding from four cwds.
- [x] **T12** — Judgment Day round 1 (two blind judges over the frozen manifest `18fa6423…`), findings
      merged and corrected; re-judgment and independent verification follow, then the commits.
- [ ] **T13** — Close-out: `CHECKLIST.md` B-107 row, **B-109** for the installer entry, HANDOFF, LOG
      (session 61's missing entry + this session's), `AGENTS.md` status pointer, Engram.

## Review-round corrections (round 1)

Both judges returned `APPROVE_WITH_CHANGES`. Every finding was re-read against the file before being
accepted; all seven were real. Corrected here:

| Id | Finding | Disposition |
|---|---|---|
| JD-B-001 (CRITICAL) | The ADR and the ADR index asserted a completed audit that had not happened, and `accepted` contradicted `proposed` in the backlog row and the handoff | ADR-0033's Status now points at the tribunal row instead of restating an outcome; ADR-INDEX phrased as authorization + Director confirmation only; CHECKLIST and HANDOFF corrected to `accepted` |
| JD-B-002 / A-1 (WARNING) | `OVERVIEW.md` §9's sequence diagram still taught the repealed rule | Diagram fixed |
| JD-B-003 (WARNING) | `conmuta mcp --project ""` (empty value token) silently bound by walk-up instead of refusing | RED test added, parser fixed, ADR-0033 decision 4 and the canonical spec now name all three spellings |
| JD-B-004 / A-3 (WARNING/SUGGESTION) | This file described a design that was not shipped and kept every task unticked | This section |
| JD-B-005 (WARNING) | ADR-0028's note claimed the pin row "now reads" text the row never received | Note reworded: the row is byte-unchanged and its reading is superseded in part |
| JD-B-006 / A-2 (SUGGESTION) | `00-INDEX.md`'s ADR table ended at 0032; ADR-0033's Documentation bullet cited `§11` and "the handshake note" | Table row added, summary line updated, bullet corrected |
| JD-B-007 (SUGGESTION) | The canonical requirement omitted the invalid/unreadable refusal | Requirement now names it |

## TDD mode

Strict (`CONSTITUTION.md` §6, `GOVERNANCE.md` §6): red before green, every `src` file keeps its
`test/`-twin. Runner: `npm run build && npm test`; `npm run test:static` for the security suite.

## Acceptance criteria

- A session in a subfolder of a bound tree resolves that tree's binding with no `--project` flag.
- An explicit `--project` that disagrees with the nearest ancestor still exits `EXIT_PROJECT_MISMATCH`
  before any IPC call.
- A missing/invalid/unreadable nearest ancestor still exits `EXIT_UNBOUND_PROJECT`.
- No invariant in `CONSTITUTION.md` §2 is weakened; the reviewer can read why in ADR-0033.
- `npm test` and `npm run test:static` green; no test deleted for convenience (the two rewritten
  `missing_project_flag` tests are *replaced by stronger ones*, and the reason is recorded here).

## Progress

Implemented, documented and verified; Judgment Day round 1 done (both judges `APPROVE_WITH_CHANGES`,
seven real findings, all corrected above); committed in work units after round 2 and independent
verification. See the "Review-round corrections" table for what round 1 changed.

## Follow-up (2026-10-02, session 63) — item 4 is no longer true

Item 4 above ("**Installer untouched.** `buildLauncherEntry(projectId)` keeps emitting
`mcp --project <id>`") described the deliberately deferred half of this unit. It was closed the next
session: **B-109** landed under **ADR-0034**, `buildLauncherEntry()` now takes no project and emits
`args: [CLI_ENTRY, "mcp"]`, and the canonical `tool-config-merge` requirement reads *"Written entries are
id-free stdio, zero env, never npx"*. This file is left as the plan of record for B-107 and is not
rewritten; the amendment is this note plus ADR-0034.
