# Conmuta — documentation index

> **Working name.** "Conmuta" is a working name pending trademark clearance (B-11 in
> [`06-backlog/CHECKLIST.md`](./06-backlog/CHECKLIST.md); fallback "Emisario").

This file is the **single entry point** of the repository (landing decision D10: v1 had three
documents claiming to be the entry point; v2 has one). If a document is not listed here, it is not
part of the F0 landing.

**Status: F0 closed; F1 `apply` in progress — PR-01a, PR-01b, PR-02, PR-03, PR-04, PR-05, the two PR-06 slices (PR-06a `shared/fence.ts` SEAM D-15, PR-06b `shared/protocol-select.ts` SEAM), PR-07a (`shared/tool-schemas.ts` SEAM, `shared/error-payload.ts` SEAM), PR-07b (`shared/tool-output.ts` SEAM) and the two PR-08 slices (PR-08a `shared/token-shape.ts` + `shared/project-file.ts`, PR-08b `shared/roster-hash.ts` + `src/cli/{main,validate}.ts`) and PR-09a, PR-09b, PR-10 and PR-11 merged to `main` (scaffold, CI, static gates, `shared/constants.ts`, provenance mechanism, `shared/envelope.ts` AS-IS, `shared/secrets.ts` SEAM, `shared/thread-record.ts` SEAM, `shared/protocol-apply.ts` SEAM D-05, `shared/fence.ts`, `shared/protocol-select.ts`, `shared/tool-schemas.ts`, `shared/error-payload.ts`, `shared/tool-output.ts`, `shared/token-shape.ts`, `shared/project-file.ts`, `shared/roster-hash.ts`, `src/cli/main.ts`, `src/cli/validate.ts`, `src/registry/{schema,invariants,loader}.ts`, `src/ledger/{schema,transaction,open,migrations}.ts`, 11-entry provenance registry; **379 tests, 64/210 tasks, 45 slices**); next slice PR-12 (`src/ledger/{inbox,threads,cursors}.ts`: the inbox write-ahead transaction, the thread adapter and the per-client cursors; PT-10 + PT-11, D-19; rows PR-09, PR-10 and PR-11 closed).**
Live position: [`08-sessions/HANDOFF.md`](./08-sessions/HANDOFF.md). Source of the architecture below: Arena debate
`bus-v2-landing-architecture-001`, consensus after two rounds ([`05-tribunal/INDEX.md`](./05-tribunal/INDEX.md)).

## Reading order

| Audience | Order |
|----------|-------|
| Director | Pending-decisions board (below) → [`07-plan/WORK-PLAN.md`](./07-plan/WORK-PLAN.md) → [`02-architecture/OVERVIEW.md`](./02-architecture/OVERVIEW.md) → [`06-backlog/CHECKLIST.md`](./06-backlog/CHECKLIST.md) |
| Agent or contributor working on this repository | [`../AGENTS.md`](../AGENTS.md) → [`01-constitution/CONSTITUTION.md`](./01-constitution/CONSTITUTION.md) → [`01-constitution/GOVERNANCE.md`](./01-constitution/GOVERNANCE.md) → [`03-adr/INDEX.md`](./03-adr/INDEX.md) (ADR-0028 to 0031 first) → [`02-architecture/OVERVIEW.md`](./02-architecture/OVERVIEW.md) → [`07-plan/WORK-PLAN.md`](./07-plan/WORK-PLAN.md) → [`06-backlog/CHECKLIST.md`](./06-backlog/CHECKLIST.md) |
| Auditor (tribunal) | [`05-tribunal/INDEX.md`](./05-tribunal/INDEX.md) → [`01-constitution/CONSTITUTION.md`](./01-constitution/CONSTITUTION.md) → [`02-architecture/THREAT-MODEL.md`](./02-architecture/THREAT-MODEL.md) → the ADRs under review |
| Someone coming from v1 | [`../README.md`](../README.md) ("Relation to telegram-agent-bus v1") → [`03-adr/INDEX.md`](./03-adr/INDEX.md) (inherited statuses) → ADR-0029 and ADR-0030 (the two reopened items) |

## Map

### Repository root

| File | Description |
|------|-------------|
| [`../README.md`](../README.md) | What Conmuta is, status, relation to v1, working-name notice; points here |
| [`../AGENTS.md`](../AGENTS.md) | Session bootstrap for AI agents working **on this repository** (reading order, live state, binding rules). Not the end-user bus protocol |
| [`../CLAUDE.md`](../CLAUDE.md) | One-line pointer: `@AGENTS.md` |
| `../.gitignore` | Excludes `.mcp.json`, `.claude/settings.json`, `*.token`, `.conmuta/`, `.env`, `node_modules/`, `dist/`, local caches, `*.txt` session dumps |
| `../.claude/settings.json`, `../.mcp.json` | Local tribunal tooling (Arena Orion stop hook; Arena bridge). Both gitignored: they carry a machine-specific absolute path and a credential and are never committed. Not part of the product |
| `../openspec/` | gentle-ai SDD artifact store (`config.yaml`, `specs/`, `changes/`), hybrid mode -- mirrored in Engram (GOVERNANCE.md section 5); opened by `sdd-init` ahead of the F1 SDD change |

### `01-constitution/` — immutable law and governance

| File | Description |
|------|-------------|
| [`CONSTITUTION.md`](./01-constitution/CONSTITUTION.md) | The five invariants verbatim; inherited ADR-06 autonomy boundary; ADR-12 governing rule; wire/freeze doctrine; named-constant rule; the "closed permanently" list with the two reopened items; language contract; amendment procedure |
| [`GOVERNANCE.md`](./01-constitution/GOVERNANCE.md) | Roles (Director, Kairo as sole writer, Alpha/Betelgeuse as auditors); when an Arena debate is mandatory; ADR process and template; SDD hybrid per phase; strict TDD; PR <= 400 lines; how the backlog is processed; live state vs design precedence |

### `02-architecture/` — the landed architecture

| File | Description |
|------|-------------|
| [`OVERVIEW.md`](./02-architecture/OVERVIEW.md) | Decisions D1–D7 and D9: components, planes, daemon/client, IPC handshake sequence, registry vs `conmuta.json`, installer flow (installation validator, control panel, add bot, add group, assign project, overview table) |
| [`DATA-MODEL.md`](./02-architecture/DATA-MODEL.md) | **Draft** schemas, to be finalized in the F1 SDD spec: `conmuta.json`, `~/.conmuta/registry.json`, SQLite tables (`updates`, `offsets`, `threads`, `needs_action`, `client_cursors`, `audit_log`, `debate_journal`), secret-store keys |
| [`THREAT-MODEL.md`](./02-architecture/THREAT-MODEL.md) | Threats (vector / impact / mitigation) mapped to the five invariants and to the tests that must pin them: wrong-room CI test, IPC handshake, prompt-injection fence, token hygiene, Windows ACL |

### `03-adr/` — architectural decision records

File naming convention: `NNNN-<kebab-case-slug>.md`, four-digit number, one decision per file. ADRs
0001–0027 are inherited from v1 (`openspec/changes/telegram-agent-bus/design.md` in the
`telegram-agent-bus` repository; the v1 line of each heading is given for traceability). Status of
every ADR (inherited-valid / inherited-revisit / superseded / proposed) is carried by the index, not
by this file.

| File | Description |
|------|-------------|
| [`INDEX.md`](./03-adr/INDEX.md) | Table: number, title, status, supersedes / superseded-by, debate id |

Inherited from v1 (file names as on disk, matching [`INDEX.md`](./03-adr/INDEX.md); title as in v1
`design.md`, whose heading line is given as the source):

| File | v1 title | v1 source |
|------|----------|-----------|
| [`0001-runtime-node-typescript.md`](./03-adr/0001-runtime-node-typescript.md) | Runtime: Node.js / TypeScript | `design.md:36` |
| [`0002-build-from-scratch-minimal-deps.md`](./03-adr/0002-build-from-scratch-minimal-deps.md) | Build from scratch on the official SDK + raw Bot API — superseded **in part** by ADR-0030 | `design.md:47` |
| [`0003-per-machine-subprocess-no-daemon.md`](./03-adr/0003-per-machine-subprocess-no-daemon.md) | Deployment: per-machine session subprocess, no daemon — **superseded** by ADR-0029 | `design.md:59` |
| [`0004-dual-channel-delivery.md`](./03-adr/0004-dual-channel-delivery.md) | Dual-channel delivery: group for humans, direct bot-to-bot DM for agents | `design.md:67` |
| [`0005-wire-format-sentinel.md`](./03-adr/0005-wire-format-sentinel.md) | Wire format: sentinel-prefixed single-line JSON, with amendments 05a, 05b, 05c | `design.md:88,96,114,156` |
| [`0006-autonomy-boundary.md`](./03-adr/0006-autonomy-boundary.md) | Autonomy boundary: capability isolation + fail-closed basis (seven layers) | `design.md:181` |
| [`0007-loop-prevention.md`](./03-adr/0007-loop-prevention.md) | Loop prevention in the tool layer | `design.md:199` |
| [`0008-checkpoint-windows.md`](./03-adr/0008-checkpoint-windows.md) | `[CHECKPOINT-ESTADO]` windows synthesis (bridge-aware) | `design.md:209` |
| [`0009-ack-non-closing.md`](./03-adr/0009-ack-non-closing.md) | `ACK` is non-closing; only `RESOLVED` closes | `design.md:217` |
| [`0010-roster-three-roles.md`](./03-adr/0010-roster-three-roles.md) | Roster is the routing table and the access list | `design.md:229` |
| [`0011-eid-dedup.md`](./03-adr/0011-eid-dedup.md) | Envelope-level `eid` for cross-channel deduplication | `design.md:248` |
| [`0012-adversarial-audit-governing-rule.md`](./03-adr/0012-adversarial-audit-governing-rule.md) | Post-v0.3.0 adversarial audit: remediation and its boundary (the governing rule) | `design.md:258` |
| [`0013-basis-abandoned.md`](./03-adr/0013-basis-abandoned.md) | Sender-side abandonment: `basis: "abandoned"` | `design.md:293` |
| [`0014-group-outage-soft.md`](./03-adr/0014-group-outage-soft.md) | Group availability: the observability plane may fail alone | `design.md:321` |
| [`0015-state-integrity-validate-quarantine-migrate-once.md`](./03-adr/0015-state-integrity-validate-quarantine-migrate-once.md) | State integrity: validate, quarantine, migrate once | `design.md:348` |
| [`0016-quiet-tick-digest-over-discrete-state.md`](./03-adr/0016-quiet-tick-digest-over-discrete-state.md) | The quiet tick: a digest over discrete state | `design.md:368` |
| [`0017-tiered-window-floors-with-spill.md`](./03-adr/0017-tiered-window-floors-with-spill.md) | The tiered window: floors with spill | `design.md:382` |
| [`0018-receive-side-enforces-sender-invariants.md`](./03-adr/0018-receive-side-enforces-sender-invariants.md) | The receive side enforces what the sender promises | `design.md:397` |
| [`0019-local-closure-abandoned-exception.md`](./03-adr/0019-local-closure-abandoned-exception.md) | Local closure: the one exception to "never apply an undelivered change" | `design.md:411` |
| [`0020-reply-and-turn-tracking.md`](./03-adr/0020-reply-and-turn-tracking.md) | `REPLY` and turn tracking: from mailbox to conversation | `design.md:425` |
| [`0021-agentbus-2-accept-both-decoder.md`](./03-adr/0021-agentbus-2-accept-both-decoder.md) | `AGENTBUS/2`, and a decoder that accepts both | `design.md:449` |
| [`0022-body-omission-per-entry.md`](./03-adr/0022-body-omission-per-entry.md) | Body omission decided per entry, not per tick | `design.md:469` |
| [`0023-wire-ceiling-reported.md`](./03-adr/0023-wire-ceiling-reported.md) | The wire ceiling reported, not discovered by hitting it | `design.md:489` |
| [`0024-channel-doorbell-not-a-second-reader.md`](./03-adr/0024-channel-doorbell-not-a-second-reader.md) | `agentbus-channel`: a doorbell, not a second reader | `design.md:509` |
| [`0025-peek-saturation-and-watermark-commits-last.md`](./03-adr/0025-peek-saturation-and-watermark-commits-last.md) | A blind spot announced out loud, and a watermark that commits last | `design.md:539` |
| [`0026-unapplied-transition-is-a-diagnostic.md`](./03-adr/0026-unapplied-transition-is-a-diagnostic.md) | A transition that could not be applied is a diagnostic, not news | `design.md:562` |
| [`0027-needs-action-projects-the-waiting-turn.md`](./03-adr/0027-needs-action-projects-the-waiting-turn.md) | `needs_action` describes the turn that is waiting, not the thread's opening | `design.md:592` |

New in v2 (status `proposed` in the ADR index, meaning accepted by the tribunal and pending the
Director; debate `bus-v2-landing-architecture-001`):

| File | Decision | Supersedes |
|------|----------|------------|
| [`0028-project-scoped-bijective-binding.md`](./03-adr/0028-project-scoped-bijective-binding.md) | One bot per (human, project); bijective bot ↔ group ↔ project; registry invariant "one bot_id in at most one active binding" | — |
| [`0029-per-user-daemon-and-thin-clients.md`](./03-adr/0029-per-user-daemon-and-thin-clients.md) | Daemon per OS user as sole `getUpdates` consumer; host-agnostic thin stdio clients; authenticated loopback IPC | v1 ADR-03 |
| [`0030-sqlite-ledger-and-json-registry.md`](./03-adr/0030-sqlite-ledger-and-json-registry.md) | `node:sqlite` ledger (WAL) + human-editable JSON registry; OS keychain for secrets | v1 ADR-02 in part |
| [`0031-npm-distribution-and-license.md`](./03-adr/0031-npm-distribution-and-license.md) | npm publish with compiled `dist`, shrinkwrap, files whitelist, never `npx`; Node >= 24; license Apache-2.0 (DN-04) | — |

### `05-tribunal/` — debate record

| File | Description |
|------|-------------|
| [`INDEX.md`](./05-tribunal/INDEX.md) | `bus-v2-landing-architecture-001`: date, participants, rounds, verdicts, four objections with resolution, four amendments, outcome, derived ADRs; plus the reserved future debate `bus-v2-referee-001` (group referee role, B-01) |

### `06-backlog/` — live backlog

| File | Description |
|------|-------------|
| [`CHECKLIST.md`](./06-backlog/CHECKLIST.md) | One row per deferred item B-01 to B-18 with origin, phase, status and closing pointer. Rows are never deleted |

### `07-plan/` — work plan

| File | Description |
|------|-------------|
| [`WORK-PLAN.md`](./07-plan/WORK-PLAN.md) | Phases F0–F8: goal, deliverables, dependencies, validation criteria, SDD change name, spikes, risks. One table per phase |

### `08-sessions/` — session continuity

| File | Description |
|------|-------------|
| [`HANDOFF.md`](./08-sessions/HANDOFF.md) | **Overwritten every session.** Where the work stands, the exact start for the next session, what not to redo, open points carried forward. Sessions switch at phase boundaries (Director note DN-04) |
| [`LOG.md`](./08-sessions/LOG.md) | Append-only, dated, newest first: what each session closed and opened, with pointers |

There is no `04-` folder in the F0 tree; the number is unassigned.

### Planned but not yet written

| File | Origin | Gate |
|------|--------|------|
| `LICENSE` | D10, B-16 | Director confirms the license (Apache-2.0 recommended) |
| `SECURITY.md` (the five invariants), `CONTRIBUTING.md`, `CHANGELOG.md` | D10, B-16 | Repository hygiene item, F0 |
| `openspec/changes/<change>/` (one SDD change per phase; `openspec/config.yaml` already exists) | D10 | Each phase's `sdd-new` |
| Source tree, `conmuta.json` template, installer, end-user `AGENTS.md` template | F1, F2 | Work plan |

## Pending Director decisions

Nothing on this board is decided by the tribunal; each row waits for the Director.

| # | Decision | Position landed by the tribunal | Backlog | What it blocks |
|---|----------|--------------------------------|---------|----------------|
| 1 | **Final product name** | **Decided: "Conmuta"** (Director note DN-02, 2026-09-16, [tribunal index](./05-tribunal/INDEX.md#director-notes)). npm `conmuta` and `@conmuta/*` verified free on 2026-09-15. Still pending: IMPI/EUIPO screening against "Conmuta Soluciones Tecnológicas S.L." (class 42) and the reservation of npm scope, GitHub org and domain (outward-facing actions, need the Director's go); fallback "Emisario" only if screening fails | B-11 | npm scope, GitHub org, domain, ADR-0031 |
| 2 | **License** | **Decided: Apache-2.0** (Director, 2026-09-16, DN-04); `LICENSE` holds the verbatim text. Still open in B-16: SECURITY.md, CONTRIBUTING.md, CHANGELOG.md, copyright-holder line for `package.json` | B-16 | npm publish (F6) |
| 3 | **SDD preflight** — pace, artifact store, PR strategy | **Decided 2026-09-16** (Director, native preflight): pace Automatic, artifacts Both (hybrid: openspec in repo + Engram), PR strategy Auto (chained PRs when over the 400-line budget). Recorded in `openspec/config.yaml` `session:`. Delivery refined 2026-09-16 (DN-06): chain strategy `stacked-to-main`; `size:exception` only for whole-file AS-IS vendored PRs hash-pinned in the provenance header. **Operational caveat (2026-09-17):** the native dispatcher gate is closed to agents, so `sdd-apply` is refused before launch unless a human first runs `/gentle:sdd-preflight` in the TUI; F1 slices therefore run under ODD with the SDD contract preserved, audited by Judgment Day | — | Nothing; `apply` is running — the last merged PR is PR-11 (`50c506a`) |
| 8 | **Two file-integrity items surfaced by the PR-07a audit, one widened by PR-07b — both now closed** (each outside the frozen range of the slice that reported it; neither was resolved silently): (a) `src/shared/constants.ts:3` pinned a **blind-stripped** hash (`4ce5e514…`; rule-conformant `039d53a2…`), invisible to every gate because a SEAM pin is checked only for *inequality*; (b) design §12's reuse table marked three v1 ranges **AS-IS** → `shared/tool-schemas.ts` (two rows) and `shared/tool-output.ts` (one row), all SEAM by construction (`bus-v2-f1-tasks-001` items 1–2) | Reported by the PR-07a Judgment Day audit, (b) widened by PR-07b's; **closed 2026-09-17** by the post-merge integrity sweep under the Director's session-10 delegation | B-19 (a), B-20 (b) — both `done` | (a) re-pinned with the strip control recorded and PR-04's wrong-value conclusion corrected; (b) design §12 gained an *appended* amendment note that leaves the audited rows untouched. Both are revertible and both are recorded in `apply-progress.md` §B-19 and `bus-v2-f1-b19-repin-001` |
| 4 | **macOS scope** | Windows first; macOS supported only after a real smoke test (installer + daemon + LaunchAgent + one IDE) | B-12 | Claiming dual-platform support at F6 |
| 5 | **Branch protection on `main`** | **Decided 2026-09-16** (DN-08, applied by Kairo): force-push and deletion blocked; no PR-only or status-check rule, because the direct documentation commits at every session close stay on `main`. F1's 45 PRs remain the path for code | — | Nothing technical; review discipline |
| 6 | **`LICENSE` in the package before F6 (D-10 vs DN-04)** | Kairo's assumption (DN-06, open to veto): D-10 is superseded by DN-04 — `LICENSE` ships from PR-01 and `package.json` stays `private: true` until F6 | B-16 | Nothing now — shipped in PR-01a (`files` whitelist, `LICENSE` packed); a veto would be a follow-up PR |
| 7 | **Two residual threat-model items without a backlog id** | Bytes-per-hour exfiltration ceiling (T22) and an organisation marker in the origin label (THREAT-MODEL §7): left out of F1 by design; the Director assigns backlog ids or drops them | — | Nothing in F1; documented as open in PR-42 |
| 9 | **PR-08's audit follow-ups** — the two merged halves of PR-08 left four Director-visible items and one grouped hygiene row. **B-22**: the four advisory findings of PR-08a's ordinary native review, recorded and deliberately *not* actioned, because that review's closure forbids re-running it on that candidate. **B-23**: `JD-A-003` — a deliberate precedence the code documents but no test pins (ADR-12). **B-24**: no POSIX CI leg, so packaging contracts cannot fail here — the class the ADR-0012 shebang defect belonged to. **B-26**: PT-25's owner is attributed differently by `tasks.md`'s PR-09 block and `design.md:551`. **B-25** groups three cheap gates (YAML validity, a pre-test `clean`, the `actions/*` Node-20 bump) for one later PR. PR-09a's audit added **B-27** (the shared token regex matches the project's own `sha256:` roster hash, so R5's raw-text scan would refuse every valid registry — worked around at the call site in PR-09b), **B-28** (no R1–R6 row demands referential integrity) and **B-29** (nothing ties `roster_hash` to its snapshot at load time). PR-09b's audit added **B-30** (R5's strictness refuses free-form human text, e.g. a group `title` reading `Authorization review`), **B-31** (a JSON-escaped colon bypasses the raw-text scan) and **B-32** (the four advisory findings of the ordinary native review that closed PR-09b's candidate) | Reported by the PR-08a/PR-08b Judgment Day audits and by the independent verifier the declined review triggered; **all five filed 2026-09-17**, none resolved silently | B-22 (Director); B-23, B-24, B-25 (Kairo → Alpha); B-26 (Director → Kairo) | Nothing in F1. B-26 affects only which slice may claim PT-25's cell, which is why PR-09 must read it before task 9.6. **PR-10 added B-33** (see row 9's own list): `test/security/provenance.test.ts` reads a file's leading `/**` block as a vendor header, so a non-vendored module with no imports cannot spell that header's first token; worked around in both PR-10 modules and pinned by that same gate. **PR-11 added B-34** (the false `TS18003` rule still stated in `src/cli/tsconfig.json:10` and `src/registry/tsconfig.json:12`; the measured rule — the discriminator is the presence of a `references` entry, never composite-ness — lives in `src/ledger/tsconfig.json`) and left **two SUGGESTION-class rows escalated**, surviving the second Judgment Day round on split verdicts with their corrections disclosure as measurement-checked but not judge-re-judged, because the round budget is two |

The four new ADRs (0028–0031) carry the status `accepted` (tribunal consensus, confirmed by the Director on 2026-09-16, DN-04).

## Precedence on conflict

When two documents disagree, the higher one wins:

1. [`01-constitution/CONSTITUTION.md`](./01-constitution/CONSTITUTION.md)
2. ADRs ([`03-adr/`](./03-adr/INDEX.md))
3. Architecture documents ([`02-architecture/`](./02-architecture/OVERVIEW.md))
4. Plan ([`07-plan/WORK-PLAN.md`](./07-plan/WORK-PLAN.md))
5. This index

Live-state files ([`06-backlog/CHECKLIST.md`](./06-backlog/CHECKLIST.md),
[`05-tribunal/INDEX.md`](./05-tribunal/INDEX.md)) record what was decided and when; how they interact
with the design documents is defined in [`01-constitution/GOVERNANCE.md`](./01-constitution/GOVERNANCE.md).
A contradiction between levels is reported to the Director, never resolved silently.

## Sources of truth outside this tree

| Source | Use |
|--------|-----|
| `telegram-agent-bus` repository (sibling folder; checkout at commit `bf8f365` = tag `v1.0.2` + 2 commits: docs and the ADR-27 fix, whose only `src/` change is `src/tools/fetch.ts`; wire unchanged) | v1 evidence, cited as `path:line` against that checkout; line numbers in files touched after the tag hold only at `bf8f365`. Modules reused as a library (D1). Frozen in production; do not modify |
| F0 analysis bundle (session artifact, not committed) | Maps: `transport`, `config-state`, `protocol-tools`, `ops-lessons`, `governance-docs`. Research: `telegram-constraints`, `mcp-config-surfaces`, `packaging-runtime`, `prior-art-naming`, `security-isolation`. Cited by key; summarized in the tribunal record |
| Engram | Persistent cross-session memory (decisions, conventions, bugs). SDD phases write to it but do not replace it |

## Conventions for this documentation

- English, neutral professional register; the Director's Spanish quotes are kept verbatim when they
  are requirements.
- Relative Markdown links from the file's own folder.
- Every statement traces to the landing decision record, to v1 evidence (`file:line`) or to the
  analysis bundle (research key). Undecided points are marked "pending Director decision" with the
  backlog id.
- No production data from v1 (bot usernames, numeric `user_id`s, developer first names, production
  `chat_id`, tokens) appears anywhere in this tree.
