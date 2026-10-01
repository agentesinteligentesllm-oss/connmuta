# B-104 — wake satellite: constitutional amendment and ADR-0032

## Objective

Turn the Director's 2026-09-30 instruction (B-104, `docs/02-architecture/RFC-DESPERTADOR-TRIGGER-AUTOMATICO.md`)
into a ratified, ordered, reviewable governance change: an ADR that sanctions a wake satellite outside the
core, a per-binding opt-in ladder (`off` → `notify` → `wake` → `autopilot`), the threat-model rows and pinning
requirements that bound it, and the plan/backlog/index retargeting. **No product code is written in this task.**

## Problem / why

The Director asked for the "despertador": an agent's turn must start when a roster peer sends a BROADCAST or
addresses it, instead of waiting for a human. Session 59's first pass (read-only) found the request docs
untracked in the tree, and found that the RFC's shape cannot be implemented as written:

- The core may not host process execution (CONSTITUTION §3 layers 1–2; ADR-0006:43 objection n1; ADR-0029:41;
  THREAT-MODEL T17). B-104's target was `post-F6`, and F6 is blocked on B-11/B-12/B-16.
- RFC §3.1's detection half already ships: F4's `/channel/doorbell` implements exactly
  `via === "direct" || type === "BROADCAST" || to === agentId`, roster-gated by `reverseRosterLookup`
  (`src/daemon/serve/doorbell.ts`). The gap is the wake/execution half.
- RFC §4.1 puts the opt-in in `conmuta.json`, which D5 fixes as a committed, id-only file
  (`CONSTITUTION`, ADR-0028/D5; the live file holds only `schema_version`, `project_id`, `group_id`, `roster`).
- RFC §2 leans on the private group + roster + model discernment as safety. Roster and group privacy are an
  access filter; model discernment is a behaviour, not a control. A woken headless turn has no human at the
  permission prompt, so the **capability profile** is the control.

## Scope decision

Governance/architecture preparation only: ADR-0032, the CONSTITUTION §3 amendment, THREAT-MODEL rows
T23–T25 + PT-34–PT-36, ADR/tribunal/plan/backlog/index pointers, the RFC's own corrections, and OVERVIEW's
satellite and wake-up rows. The satellite implementation is the F7a SDD change, a later authorized slice.

## Investigation (read-only, before any write)

- Read: CONSTITUTION.md (all), GOVERNANCE.md (all), THREAT-MODEL.md (all), 00-INDEX.md (all),
  ADR INDEX, tribunal INDEX (head/tail), WORK-PLAN F6/F7, CHECKLIST B-104/B-06, the RFC, and the F4
  doorbell / IPC route set / fetch long-poll constants in `src/`.
- Verified the detection half exists (`doorbell.ts` relevance rule + roster gate; IPC route set
  `/tools/*` + `/channel/{doorbell,cursor}` only, `src/shared/ipc-contract.ts:101-106`).
- Verified no in-core wake endpoint exists and none is needed.
- Arena probe: `mcp connect arena` → `fetch failed — Nothing is listening at http://127.0.0.1:8765/mcp`
  (a real tool-level failure, the same condition sessions 55–58 recorded). DN-09's substitute condition is
  therefore satisfied directly; the audit runs under Judgment Day (`jd-judge-a`/`jd-judge-b`), recorded as a
  DN-05 waiver. The Arena debate id `bus-v2-b104-wake-satellite-001` is reserved for the record row.

## Design decisions taken here (delegated to Kairo by the Director)

1. **Locate the capability, do not weaken the core.** The satellite consumes the existing body-less
   doorbell; the core gains no route, no wire change, no exec, no timer.
2. **Default stays `off` and the enabled default stays read/reply-only**, so ADR-0006's and ADR-0029's
   "read/reply-only by default" sentences remain true; only their **phase target** sentence is superseded
   (post-F6 → F7a).
3. **The ladder is data, not code paths**: one per-binding record in the daemon home, written only by an
   explicit audit-logged human action; never in the committed `conmuta.json`.
4. **No numbers in the ADR.** Cooldown, budget, in-flight bound and profile allow-lists are named constants
   whose values are fixed in the F7a spec (CONSTITUTION §5).
5. **Every pinning test is a requirement on F7a**, never claimed as existing.

## Tasks

1. Write ADR-0032 (options, decision, rules R1–R10, consequences, supersession, tests that must pin it).
2. Amend CONSTITUTION §3 (component classes + ladder + layer-2 clarification) with the inline ADR citation;
   add the §9 changelog row.
3. Append the reciprocal supersession notes to ADR-0006 and ADR-0029 (phase sentence only).
4. Add THREAT-MODEL rows T23–T25, pinning-test rows PT-34–PT-36, and the T17/§1/§5.3/§7 updates.
5. Update ADR INDEX (0032 row + "New in this repository" table) and the tribunal INDEX (debate row +
   Director note).
6. Split F7 into F7a/F7b in WORK-PLAN (dependency graph, tables, backlog rows) and retarget B-104/B-06.
7. Update 00-INDEX (RFC map entry, ADR table row, pending-decisions row) and the RFC's own correction block.
8. Update OVERVIEW §13 satellite row and §8 wake-up row.
9. Freeze the candidate and run Judgment Day (two blind judges + independent verification), fix confirmed
   severe findings, re-judge at most twice, record the outcome.

## Verification

- `git diff --stat` reviewed against this task file's scope; no `src/` or `test/` file touched
  (`git status --short -- src test` prints nothing, verified independently).
- **Judgment Day, round 1** (both blind judges, one frozen target: HEAD `179c6c6`, snapshot `2a2edd2`):
  Judge A 2 WARNING + 4 SUGGESTION; Judge B 2 CRITICAL + 2 WARNING + 2 SUGGESTION (Judge B's first
  launch failed technically and was re-launched against the same target — no partial judgment accepted).
  Both confirmed the same two severe findings: the missing tribunal row for the debate it cited, and the
  impossible daemon-audit-row guarantee (no route, no columns). Both also mis-cited
  `src/shared/constants.ts:86,94`; Kairo verified the real lines before answering and rejected that
  finding with evidence.
- **Corrections, round 1** (all accepted): Status names the substitute; new **R6a** (self-reported wake
  ledger, no daemon attestation); R3 writes no daemon state; R4/PT-35 fail closed on a corrupt ladder
  record; PT-36 rescoped; route/constants citations made explicit and precise; RFC links fixed;
  ADR-0029 Status reciprocal note; `00-INDEX` header; WORK-PLAN B-104 row; tribunal F7→F7b.
- **Judgment Day, round 2** (scoped re-judgment over the frozen ledger + fix delta, snapshot `bcae02a`):
  both judges returned the same single fix-caused finding — a duplicated ADR-0032 row in `00-INDEX` —
  and nothing else. Removed.
- **Independent final verification** (`gentle-ai-verify`, read-only): PASS on all six mechanical claims
  (one 0032 row; all candidate relative links resolve; no active `post-F6` for the satellite; the four
  `src/` claims true including the `audit_log` column list; `src/`/`test/` untouched; no invented bound).
  It also found one pre-existing broken pointer (`docs/05-tribunal/INDEX.md:146`), fixed here.
- **Terminal verdict: `JUDGMENT: APPROVED`** — zero remaining CRITICAL; the two round-1 severe findings
  closed; one round-2 fix-caused finding closed and verified.

## Outcome

Governance half complete: ADR-0032 `proposed`, CONSTITUTION §3.1 + changelog + traceability, THREAT-MODEL
T23–T25 and PT-34–PT-38, ADR/ tribunal / plan / backlog / index / RFC / OVERVIEW retargeting, and this
task file. **Nothing committed** — the Director authorizes commits.

## Implementation (F7a slice 1) — added after the Director authorized implementing it in-session

Shipped, in one session, on top of the governance half:

| Area | What landed |
|---|---|
| The satellite | `runner/{constants,ladder,ledger,prompt,harness,loop,cli,main,watermark}.ts` — a third `bin` (`conmuta-runner`), built to `dist/runner/main.js` |
| Its tests | `test/runner/{ladder,ledger,prompt,harness,loop,cli,main,watermark}.test.ts` plus `test/security/runner-bundle.test.ts` (PT-34 in the security suite) |
| Wiring | `package.json` (third `bin`, `dist/runner/**` in `files`), `tsconfig.json` + `runner/tsconfig.json`, and the two packaging tests that pin the whitelist and the bins |
| Operator doc | `docs/runbooks/wake-satellite.md` |
| Docs corrected | ADR-0032 (`R7`, `PT-37`, an Implementation note listing six disclosed refinements), CONSTITUTION §3.1 (enforced versus instructed), THREAT-MODEL, OVERVIEW, CHECKLIST (B-104 `done`, B-105 filed), WORK-PLAN F7a |

**Suite**: `npm test` 1841 tests / 1835 pass / 0 fail / 6 skip (session-58 baseline 1738/1732/0/6 → **+103 tests**);
`npm run test:static` 99/99 (baseline 93/93). **`git status --short -- src` is empty**: the core was not
touched, which is the point of the whole design.

**Audit**: Judgment Day `bus-v2-f7a-audit-001` (Arena unreachable, DN-09 substitute). Round 1 found eleven
real defects across both judges — four CRITICAL — and every one was verified against the code and fixed with a
test that fails if it regresses; round 2 returned **zero findings** from both judges. Full record in
`docs/05-tribunal/INDEX.md`.

**Disclosed as owed (B-105)**: the SDD artifact set for `f7a-wake-satellite` (this was implemented under ODD,
so the constants' reasoning lives in `runner/constants.ts` rather than in a spec's constants table), and a real
end-to-end run (the tests drive a scripted daemon link and a scripted turn; no live daemon, harness or
Telegram message has been exercised, and the four harness argv forms are the RFC's, unverified against
installed harness versions).

## Out of scope (next slice, needs the Director's authorization)

The F7a SDD change (`sdd-explore` → `propose` → `spec` → `design` → `tasks`), the satellite package itself,
its own constitution, its own threat model, and its strict-TDD implementation.
