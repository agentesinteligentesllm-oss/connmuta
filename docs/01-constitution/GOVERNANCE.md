# Conmuta — Governance

> **Working name.** "Conmuta" is a working name pending trademark clearance (backlog item B-11 in
> [CHECKLIST.md](../06-backlog/CHECKLIST.md)); the fallback is "Emisario". The Director decides.

| Field | Value |
|---|---|
| Status | F0 landing — ratified in debate `bus-v2-landing-architecture-001`; Director confirmation pending where marked |
| Date | 2026-09-15 |
| Law it implements | [CONSTITUTION.md](./CONSTITUTION.md) |
| Records it feeds | [../03-adr/INDEX.md](../03-adr/INDEX.md) · [../05-tribunal/INDEX.md](../05-tribunal/INDEX.md) · [../06-backlog/CHECKLIST.md](../06-backlog/CHECKLIST.md) · [../07-plan/WORK-PLAN.md](../07-plan/WORK-PLAN.md) |

The constitution says **what** may never be violated. This document says **how** decisions are
made, by whom, and where they are recorded. Session bootstrap for agents working on this repository
is in [../../AGENTS.md](../../AGENTS.md); this document is the reference it points to.

---

## 1. Roles

| Role | Held by | May | May not |
|---|---|---|---|
| **Director** | the human owner of the project | decide, authorize, veto; approve the roadmap, the start of each phase, every merge, and every destructive or production action; escalations end with the Director | — |
| **Writer of the tree** | Kairo (the Claude session) | write code and documents, run tests, open pull requests, propose ADRs, transcribe debate outcomes, maintain the backlog | commit or merge without Director authorization; skip an audit; approve its own change |
| **Auditors (tribunal)** | Alpha, Betelgeuse | read the code independently; object with evidence; propose `PATCH` diffs; issue verdicts | write to the tree or commit |
| **Group referee** | reserved — a future satellite role over the bus, not a repository role | — | see B-01, dedicated debate `bus-v2-referee-001` |

**Why auditors never commit.** The rule was broken once in v1 (2026-08-15, commit `f7e23cf`): the
auditor applied and committed its own documentation fixes instead of returning them as a `PATCH`.
The fixes were correct and found a real defect, so they were kept — but the commit carried the same
git identity as the writer's, so the log could not tell who wrote what, and a row whose content was
already false was preserved verbatim because nobody reviewed the change. "Self-approval is not an
audit" (v1 `CLAUDE.md:26`).

---

## 2. Decision process — the Arena debate

Every substantive decision is argued in the Arena between the writer and an auditor, and its outcome
is transcribed into this repository. The message sequence, as used in `bus-v2-landing-architecture-001`:

| Step | Sender | Content | Closes the debate? |
|---|---|---|---|
| **PROPOSAL** | writer | scope, options considered, decisions, evidence per decision | no |
| **AUDIT** | auditor | a verdict token plus numbered objections, each with evidence | no |
| **COUNTER** | writer | for every objection: accepted (with the concrete change) or refuted (with evidence); may add amendments | no |
| **CONSENSUS** | both | the final AUDIT returns `objections=[]` with an approving verdict; the record is frozen | yes |
| **ESCALATE** | either | disagreement persists at the round cap, or a party invokes the Director; the Director decides | yes |

Verdict tokens observed in this project's history: `APPROVE`, `APPROVE_WITH_CHANGES` (v1
`design.md:621`; landing debate round 1). Any other token is defined by the Arena Orion protocol,
not by this document.

Rules of the debate:

1. **Round cap: three rounds.** One round is one AUDIT (round 1 answers the PROPOSAL; each later
   round answers the writer's COUNTER). Reaching the cap without consensus is an ESCALATE. (The
   landing debate closed in two rounds: AUDIT 1 → COUNTER → AUDIT 2; the runtime round cap of
   Arena-light over the bus, D7, is a separate named constant fixed in the F5 spec.)
2. **Objections need evidence.** "A finding with no pointer is not a finding" (v1
   `docs/functional-audit/README.md:15-16`). Evidence is a `file:line` pointer, a measured output,
   or a cited document. An objection without evidence is answered as a question and not counted.
3. **Every accepted objection produces a concrete change** in the proposal text, and the change is
   recorded next to the objection in the tribunal record.
4. **One block, one debate** (v1 `docs/functional-audit/README.md:17-19`). Each unit of work has its own debate id of the
   form `<product>-<topic>-NNN` (example: `bus-v2-landing-architecture-001`); the id is recorded in
   the PR description and in every ADR the debate produces.
5. **Consensus or explicit Director escalation — never a silent merge** (v1 `docs/functional-audit/README.md:20-21`).
6. **The auditor reads the code independently.** The debate carries claims, never the code.
7. **The Director has the last word.** Consensus is necessary; the Director's authorization is what
   starts implementation. Under the Director's standing instruction, consensus reached in a debate
   run in autonomous mode is the authorization for that unit of work, and a second approval is not
   requested for the same work. Commits, merges and production actions still wait for the Director.
8. **The outcome is a decision record**, transcribed by the writer into ADRs, documents and the
   backlog, and indexed in [../05-tribunal/INDEX.md](../05-tribunal/INDEX.md).

---

## 3. When a debate is mandatory

| Situation | Required |
|---|---|
| A new ADR, or superseding or amending an existing one | full debate (PROPOSAL round) |
| A constitution amendment (CONSTITUTION.md §9) | full debate, then Director |
| A wire change, with its freeze runbook (CONSTITUTION.md §4) | full debate, then Director |
| Reopening a "closed permanently" entry (CONSTITUTION.md §6) | full debate citing the entry, then Director |
| Each phase's SDD change: proposal and design, before `apply` | full debate |
| Any change to a test that pins an invariant | full debate |
| Actions on production state (for example the v1 migration, B-13) | full debate, then explicit Director authorization |
| **Every pull request unit, before merge** | at minimum one AUDIT on the diff by Alpha or Betelgeuse (work plan D11: "Alpha audits every unit BEFORE merge") |
| A change ordered directly by the Director | recorded as a Director note; the audit of the diff still runs |

**When Arena is unreachable at a session's own start.** F1's `apply` phase has run under a documented
substitute, "Judgment Day," for every PR since PR-06 whenever the Arena bridge did not respond: two
blind Claude subagents (`jd-judge-a`, `jd-judge-b`) audit the same frozen candidate independently, plus
a separate agent that reproduces figures and re-runs verification. This satisfies row 3 above in spirit,
never in the letter of D11 — DN-05 (Alpha audits everything) stays formally unsatisfied for every PR
audited this way, disclosed in each PR's own tribunal record. The substitute's own operating detail
(round budgets, correction actors, severity ledger) lives in the installed `judgment-day` skill and in
`docs/08-sessions/HANDOFF.md`, not here.

**When Arena responds (DN-09, 2026-09-25).** A single Alpha `AUDIT` on the diff — the fast path already
native to the state machine in §2 (`APPROVE` with `objections: []` closes straight to `CONSENSUS` in one
round) — satisfies this row on its own; do not additionally spawn `jd-judge-a`/`jd-judge-b` "for extra
corroboration" when a real Arena audit is available. Confirm reachability with a real `bridge_send`
call, never `curl` alone against the documented endpoint — the two have been observed to disagree
(`curl` reporting connection-refused while a real send still succeeded), so the tool call is the
authoritative signal. See the debate record `judgment-day-alpha-judge-role-001` for the full ruling and
the trade-off it accepted (a single external auditor, not two independent ones, corroborated instead by
this section's own evidence-only-objection discipline plus the writer's `COUNTER` power).

Severity scale for findings, inherited from v1 (`docs/functional-audit/README.md:26-33`): **S1**
defeats the stated objective or loses data; **S2** a realistic scenario produces wrong behaviour or
an unusable experience; **S3** friction, inconsistency or latent risk; **P** a proposed new
capability, not a defect. S1 blocks; the rest are tracked.

---

## 4. ADR process

- **Location and naming.** One file per ADR under `docs/03-adr/`, named `NNNN-<slug>.md`, indexed in
  [INDEX.md](../03-adr/INDEX.md) with number, title, status, supersedes / superseded-by, debate id.
- **Numbering.** 0001–0027 are inherited from v1 `design.md` (the amendments 05a/05b/05c stay inside
  0005). New ADRs start at 0028. A number is never reused. Check the index before assigning one — v1
  caught a collision only by reading the file instead of trusting the count (`design.md:621`).
- **Statuses.** `inherited-valid`, `inherited-revisit`, `superseded` (in full or in part, naming the
  superseding ADR), `proposed` (accepted by the tribunal in a recorded debate, pending Director
  confirmation: the meaning given in the ADR index), `accepted`, `rejected`.
- **Supersession is explicit and bidirectional.** The new ADR lists what it supersedes; the old one
  gets `superseded-by`. Superseding *in part* is allowed and must say which part (example: ADR-0030
  supersedes ADR-0002 in part).
- **Wire ADRs** include the freeze runbook and the `SERVER_VERSION` decision (CONSTITUTION.md §4).
- **Reopening ADRs** cite the closed entry by name (CONSTITUTION.md §6).
- **Every new ADR (0028 onward) ends with "Tests that must pin it"** (CONSTITUTION.md §1). A new ADR
  without that section is not complete; inherited ADRs carry the v1 pinning tests inside their
  Consequences instead.
- **Inherited ADRs** keep their v1 text and gain only a status header and, where relevant, a note
  on what v2 changes.

### ADR template

Layout as used by ADR-0028 to 0031 and listed in the ADR index ("How to add an ADR"). Inherited ADRs
(0001–0027) keep their v1 header table instead.

```markdown
# ADR-NNNN — <title>

## Status

`proposed` · `accepted` · `superseded` (by ADR-NNNN, in full / in part: <which part>) · `rejected`

## Date

YYYY-MM-DD

## Debate

<debate id> (round N, verdict). Record: ../05-tribunal/INDEX.md

## Context
What forced the decision. Verified facts only, each with its evidence (file:line, measurement, cited doc).

## Options considered
| Option | Trade-off | Why rejected / chosen |
|---|---|---|

## Decision
The decision in one paragraph, then the rules it fixes, as a list.

## Consequences
What becomes easier, what becomes harder, what it costs, what it closes or reopens.

## Supersedes
ADR-NNNN (in full / in part: <which part>) — or none. The superseded ADR gets the reciprocal status.

## Tests that must pin it
One line per guarantee: the invariant (not an example), and the test that fails when it breaks.
```

---

## 5. SDD, hybrid, one change per phase

- **Pipeline.** gentle-ai spec-driven development: explore → research (when selected) → propose →
  spec → design → tasks → apply → verify → archive. The proposal and design of every change are
  audited by the tribunal before `apply` (§3).
- **One SDD change per phase** F1–F8 (F0 is produced before the SDD preflight and has none), named
  in [WORK-PLAN.md](../07-plan/WORK-PLAN.md) (D10, D11).
- **Artifact store: hybrid** — the openspec change lives in the repository, decisions and context are
  also persisted to Engram (D10). Engram is memory; the SDD artifacts document the scope of one
  change. Neither replaces the other.
- **Archive on completion.** Each shipped change is archived so its specs become the baseline the
  next phase modifies. v1 never archived its change: `openspec/specs/` stayed empty and a follow-up
  change would have had nothing to `MODIFY` (analysis bundle, map `governance-docs`).
- **Preflight — pending Director decision.** Pace (interactive or autonomous), confirmation of the
  artifact store, and the PR strategy are decided by the Director at the F1 preflight (decision
  record, "pending Director decisions"). Until then, this section describes the tribunal's
  recommendation.

---

## 6. Engineering rules

| Rule | Statement | Source |
|---|---|---|
| Strict TDD | Red before green, no exceptions. Every file under `src/` has a test counterpart under `test/` with the same base name. `npm test` runs the type-checker and `node --test`. | D9; v1 `openspec/config.yaml:16, 31-35`; `CLAUDE.md:23` |
| No network in tests | Tests never touch the real Telegram API; the client is an interface backed by an in-memory fake. | v1 `openspec/config.yaml:31-33` |
| Static security assertions | The suite scans the built bundle for `child_process`, `node:fs` outside the home-scoped modules, timers, settings paths, `deleteMessage`, and confines `sendMessage` to the transport layer — from F1 onward. | v1 `test/security.test.ts:176-270`; CONSTITUTION.md §3 |
| Named constants | CONSTITUTION.md §5. | v1 `HANDOFF.md:363-369` |
| PR budget | **≤ 400 lines per pull request** (`review_budget_lines: 400`). A larger unit is split into chained PRs, each reviewable alone. One PR = one unit, its tests and its documentation, with the debate id in the description. | D11; v1 `openspec/config.yaml:41`; `CLAUDE.md:24` |
| Audit before merge | Every PR unit is audited by Alpha or Betelgeuse before merge (§3). | D11 |
| Runtime gate | Node ≥ 24 LTS; the installer checks it first, before touching disk or git. | D9; B-17 |
| Never `npx` at runtime | v1's clone-plus-compile start exceeded the 30 s MCP timeout in production. Distribution is a compiled `dist` with `npm-shrinkwrap` and a `files` whitelist. | D9; v1 `docs/UPGRADE-v1.0.1.md:161-178` |
| Documentation is a deliverable | A substantive unit updates the documents it affects in the same PR. [../00-INDEX.md](../00-INDEX.md) is the single entry point; v1 had three documents claiming that role. | D10 |
| Pointer integrity | Moving or renaming a file that another file points to updates the pointer in the same commit. | v1 `HANDOFF.md:441-448` |
| No production data in the repository | Bot usernames, numeric user ids, developer names, production chat ids and tokens never appear in any committed file. A secret scan is part of the release checklist. | writing rules of this repository; B-16; research `security-isolation` T12 |
| Commits | Only the Director authorizes a commit; the writer prepares the change and the PR. | decision record; [../../AGENTS.md](../../AGENTS.md) |

---

## 7. Backlog and checklist processing

The backlog is [CHECKLIST.md](../06-backlog/CHECKLIST.md). Its own header carries the rules; they
are restated here so the two never drift:

- One item per row. A row is never deleted: it is marked `done` or `dropped` with a pointer.
- Status legend: `open` · `in-debate` · `decided` · `done` · `dropped`.
- A row closes **only with a pointer** — a debate id, an ADR, a commit, or a Director note.
- Each item is processed in its own session or debate, **in the order the Director decides**.
- The phase column follows the work plan agreed in `bus-v2-landing-architecture-001`.
- The writer edits the checklist; the Director may add rows directly; an auditor proposes rows as a
  `PATCH`. A checklist edit rides in the PR of the unit that changes the row's status.
- An item that is a decision goes through a debate and becomes an ADR or a Director note. A spike
  produces a written result whose location is the row's pointer.

---

## 8. Live state versus design

| Question | Answered by | Never by |
|---|---|---|
| What was decided, and why | ADRs, then this constitution | a rollout log, a chat transcript |
| What the design is | the architecture documents, as constrained by the ADRs | — |
| Which machine runs what; which bot is bound where | the running system — the status tool and `doctor`; each machine's `~/.conmuta/` registry and ledger (D4), which are never committed (`.gitignore` excludes `.conmuta/`) | any document in this repository |

Inherited rules for any dated live-state log this project keeps (v1 `docs/ROLLOUT-LOG.md:20-34`):
date and timestamp every claim about a machine; say how you know (status output, a file read, a
wire inference, hearsay are four different levels of evidence); never infer a running version from
the repository; record what did not work; when the log and another document disagree, the log wins
for live state and the other document is corrected in the same session — the reverse holds for
design questions. The production log of v1 stays in the v1 repository; nothing from it is copied
here.

---

## 9. Pending Director decisions

Mirror of the status board in [../00-INDEX.md](../00-INDEX.md); the index is authoritative.

| Decision | Tribunal recommendation | Backlog |
|---|---|---|
| Final product name | "Conmuta" if the IMPI/EUIPO screening clears (class 42 collision to check); fallback "Emisario"; reserve npm scope, GitHub org and domain the same day | B-11 |
| License | Apache-2.0 (patent grant) | B-16 |
| SDD preflight: pace, artifact store, PR strategy | hybrid artifact store (§5); PRs ≤ 400 lines, chained | — |
| macOS scope | supported only after a real smoke test | B-12 |

---

## 10. Traceability

| Section | Primary source |
|---|---|
| 1 Roles | decision record ("one writer of the tree (Kairo) + tribunal (Alpha or Betelgeuse audits, may propose PATCH diffs, never commits); the Director authorizes and has the last word"); v1 `CLAUDE.md:26`; B-01 |
| 2 Debate protocol | tribunal record of `bus-v2-landing-architecture-001`; v1 `docs/functional-audit/README.md:13-23`; `design.md:621`; the Director's standing instruction on autonomous-mode consensus |
| 3 Mandatory debates | D11; v1 `docs/functional-audit/README.md:20-21` |
| 4 ADR process | D10; v1 `design.md:621`; analysis bundle map `governance-docs` (one file per ADR, index table) |
| 5 SDD | D10, D11; v1 `openspec/config.yaml:37-42`; analysis bundle map `governance-docs` (never-archived change) |
| 6 Engineering rules | D9, D10, D11; v1 `openspec/config.yaml:16-41`; `CLAUDE.md:23-24`; `HANDOFF.md:363-369, 441-448`; `test/security.test.ts:176-270` |
| 7 Backlog | `docs/06-backlog/CHECKLIST.md` header |
| 8 Live state | v1 `docs/ROLLOUT-LOG.md:20-34`; `CLAUDE.md:235`; D4; `.gitignore` |
| 9 Pending decisions | decision record, "pending Director decisions" |
