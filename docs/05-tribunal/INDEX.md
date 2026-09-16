# Tribunal record — Conmuta

> **Conmuta** is a working name pending trademark clearance (backlog B-11).

One row per Arena debate that produced or changed a decision in this repository. A debate is closed
only as `CONSENSUS` or `ESCALATED`; the derived ADRs are linked in
[../03-adr/INDEX.md](../03-adr/INDEX.md). Roles and the mandatory-debate rule are in
[../01-constitution/GOVERNANCE.md](../01-constitution/GOVERNANCE.md).

## Debates

| Id | Date (UTC) | Participants | Rounds | Outcome | Derived ADRs | Backlog |
|---|---|---|---|---|---|---|
| `bus-v2-landing-architecture-001` | 2026-09-16 00:32Z → ~00:50Z | Kairo (proposer, writer), Alpha (auditor); Director (authorizes) | 2 | `CONSENSUS` — `APPROVE`, objections `[]` | [0028](../03-adr/0028-project-scoped-bijective-binding.md), [0029](../03-adr/0029-per-user-daemon-and-thin-clients.md), [0030](../03-adr/0030-sqlite-ledger-and-json-registry.md), [0031](../03-adr/0031-npm-distribution-and-license.md) | B-06, B-14, B-17, B-18 decided; B-05 confirmed as spike (A4); B-07–B-13, B-15, B-16 opened; B-01–B-04 Director-originated and scheduled (F7/F8) |
| `bus-v2-f0-docs-audit-001` | 2026-09-16 ~01:30Z → ~01:45Z | Kairo (proposer, writer), Alpha (auditor) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none (audit of this documentation tree) | — |
| `bus-v2-f1-proposal-001` | 2026-09-16 ~01:50Z → ~02:05Z | Kairo (proposer, writer), Alpha (auditor) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none (implements 0028–0031) | B-13, B-15, B-18 scheduled in F1 |
| `bus-v2-session-1-closure-001` | 2026-09-16 ~02:15Z → ~02:25Z | Kairo (proposer, writer), Alpha (auditor) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none | — |
| `bus-v2-f1-design-001` | 2026-09-16 ~02:55Z → ~03:05Z | Kairo (proposer, writer), Alpha (auditor) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none (design elaborates 0028–0031; decisions D-11..D-30 in `design.md` §18) | B-13, B-15, B-18 designed; B-16 (D-10 vs DN-04) and the AS-IS `size:exception` policy raised to the Director |
| `bus-v2-f1-tasks-001` | 2026-09-16 ~03:40Z → ~03:50Z | Kairo (proposer, writer), Alpha (auditor) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none (task breakdown of the F1 change) | `size:exception` narrowed to whole-file AS-IS copies (PR-02, PR-20); PR-07 and PR-22 re-sliced; THREAT-MODEL §4 updated per PR |
| `bus-v2-session-2-closure-001` | 2026-09-16 ~04:10Z → ~04:20Z | Kairo (proposer, writer), Alpha (auditor) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none | — |
| `bus-v2-f1-pr-01-001` | 2026-09-16 ~05:35Z → ~05:55Z | Kairo (proposer, writer), Alpha (auditor); Director (merge authority) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none (first code slice of F1) | PR-01 re-sliced into PR-01a/PR-01b (45 slices); THREAT-MODEL §4 scope-cell convention; real PT-22 deny-list deferred to B-16 / PR-42 |
| `bus-v2-session-3-closure-001` | 2026-09-16 ~06:55Z → ~07:05Z | Kairo (proposer, writer), Alpha (auditor) | 1 | `CONSENSUS` — `APPROVE_WITH_CHANGES`, 2 objections accepted and fixed before the commit | none | — |
| `bus-v2-referee-001` | reserved | Kairo, Alpha or Betelgeuse; Director | — | not started | — | B-01, B-02, B-03 (F7) |

## `bus-v2-landing-architecture-001` — full record

### Sequence

| Step | Actor | Time (UTC) | Verdict |
|---|---|---|---|
| PROPOSAL | Kairo | 2026-09-16 00:32Z | D1–D11 proposed (see decision record summary below) |
| AUDIT (round 1) | Alpha | — | `APPROVE_WITH_CHANGES`, 4 objections |
| COUNTER (round 2) | Kairo | — | accepted all 4 objections and added 4 amendments (A1–A4) |
| AUDIT (round 2) | Alpha | ~2026-09-16 00:50Z | `APPROVE`, objections `[]` — `CONSENSUS` |

`CHECKLIST.md` ([../06-backlog/CHECKLIST.md](../06-backlog/CHECKLIST.md)) was audited and approved
in the same debate.

### Round 1 — Alpha's objections and their resolution

| # | Objection | Evidence cited | Resolution |
|---|---|---|---|
| n1 | The headless runner (daemon invoking `claude -p` / `codex exec` / `opencode run` / `gemini -p` on new `needs_action`) violates ADR-06 layers 1–2 and creates an RCE vector via indirect prompt injection from Telegram. | v1 `design.md:185-188`; `test/security.test.ts:66,224`; `src/tools/fetch.ts:36,202` | **Accepted.** Runner out of the core → optional satellite package `@conmuta/runner` post-F6 with its own constitution, read/reply-only by default; first consumer = the group referee (F7). Backlog B-06 `decided`. |
| n2 | Loopback HTTP on a random port: Windows ephemeral-port reuse after a daemon crash could make a new client send its bearer to a foreign process. | — | **Accepted and hardened.** HMAC challenge-response over the per-boot secret before any `Authorization` header, plus PID liveness pre-check; secret file rewritten on every daemon start and invalid when the PID is dead. Named pipe / unix socket deferred to spike B-08. |
| n3 | The installer must gate Node ≥ 24 as its first check: `node:sqlite` is unflagged only from 24. | — | **Accepted.** First gate before touching disk or git, explicit error + download link, records the node executable used (nvm/fnm aware). Backlog B-17 `decided`. |
| n4 | Formalize the committed project file as `conmuta.json` at the repository root with a strict zod schema and no local paths. | — | **Accepted.** `schema_version`, `project_id`, `group_id`, `roster`, optional `referee`; identifiers only; token-shape validator in pre-commit and `doctor`. Backlog B-18 `decided`. |

### Round 2 — Kairo's amendments, all approved

| # | Amendment | Effect | Backlog |
|---|---|---|---|
| A1 | Retract the heartbeat timer. | No autonomous emission (ADR-06 layer 2); build/wire version rides the render-only human-plane header of posts the agent sends anyway. | B-14 `decided` |
| A2 | Desktop tray shell as F8, wrapping the same daemon and the same web panel. | Alpha recommends Tauri v2 (10–15 MB binary vs 100+ MB Electron; 30–40 MB idle RAM via WebView2/WKWebView vs 180+ MB Chromium; official tray and autostart plugins; identical signing budget). The tray is optional; the daemon runs headless without it. | B-04 |
| A3 | Referee role reserved for its own debate. | Group referee + skill templates + ticket ledger go to F7 under `bus-v2-referee-001`. | B-01, B-02, B-03 |
| A4 | gentle-ai installer study as an F0 spike. | Validate/complete the MCP config matrix; reuse knowledge, not code. | B-05 |

### Decisions landed (summary; the full text is the decision record of the debate)

| Id | Decision | ADR / doc |
|---|---|---|
| D1 | New repository; v1 pure modules reused as a library; v1.0.2 frozen in production; wire policy emit `AGENTBUS/2`, accept `/1` and `/2`; no wire change in v2; any future wire change only by ADR with a per-binding coordinated send freeze. | [CONSTITUTION](../01-constitution/CONSTITUTION.md), [OVERVIEW](../02-architecture/OVERVIEW.md) |
| D2 | Topology: one bot per (human, project); bijective bot ↔ group ↔ project; registry invariant "one `bot_id` in at most one active binding". Rejected: one bot per human across N groups. | [ADR-0028](../03-adr/0028-project-scoped-bijective-binding.md) |
| D3 | Daemon per OS user, sole `getUpdates` consumer per token; thin stdio clients; lazy spawn; loopback IPC with handshake; `DAEMON_DOWN`. Supersedes v1 ADR-03. | [ADR-0029](../03-adr/0029-per-user-daemon-and-thin-clients.md) |
| D4 | JSON registry + `node:sqlite` ledger; secrets in the OS keychain with ACL'd-file fallback; no Docker in the client product. Supersedes v1 ADR-02 in part. | [ADR-0030](../03-adr/0030-sqlite-ledger-and-json-registry.md) |
| D5 | Committed `conmuta.json`; installer writes id-only stdio entries per detected tool; `AGENTS.md` + `CLAUDE.md = "@AGENTS.md"`; launcher requires `--project` and cross-checks cwd; never global in OpenCode; pending-unknown-senders list. | [ADR-0028](../03-adr/0028-project-scoped-bijective-binding.md), [OVERVIEW](../02-architecture/OVERVIEW.md) |
| D6 | The core is a passive switch under ADR-06 layers 1–2; runner out of core; Claude Code channels adapter = optional doorbell; no verified wake-up for other hosts. | [ADR-0029](../03-adr/0029-per-user-daemon-and-thin-clients.md), [CONSTITUTION](../01-constitution/CONSTITUTION.md) |
| D7 | Arena-light v1: 2-party debates as body-marker subtypes over the existing thread model; daemon-enforced round cap; pointer-only payloads; side journal; `disable_notification`; coalesce AUDIT+COUNTER. N-party deferred (B-10). | [WORK-PLAN F5](../07-plan/WORK-PLAN.md) |
| D8 | Name: Conmuta (working), fallback Emisario; also free on npm: Saiph, Meissa, Alnitak. Director decides. | B-11 |
| D9 | Stack: Node ≥ 24 LTS, TypeScript ESM, `node:test` + strict TDD, MCP SDK + zod, `@clack/prompts`, daemon-served local web panel, no Electron/Tauri in v1, npm publish, never `npx`; Windows first. | [ADR-0031](../03-adr/0031-npm-distribution-and-license.md) |
| D10 | Governance: gentle-ai SDD hybrid, one change per phase; constitution; ADRs one per file; `docs/00-INDEX.md` single entry; LICENSE/SECURITY/CONTRIBUTING/CHANGELOG; `AGENTS.md` ≤ 200 lines; artifacts in English. | [GOVERNANCE](../01-constitution/GOVERNANCE.md) |
| D11 | Work plan F0–F8; each phase one SDD change; PRs ≤ 400 lines; Alpha audits every unit before merge. | [WORK-PLAN](../07-plan/WORK-PLAN.md) |

### Pending Director decisions recorded by the debate

| Decision | Backlog |
|---|---|
| Final product name (Conmuta vs Emisario) after IMPI/EUIPO screening | B-11 |
| License (tribunal recommends Apache-2.0) | B-16 |
| SDD preflight: pace, artifact store, PR strategy | — (precedes F1) |
| macOS scope confirmation | B-12 |

## Director notes

Changes or inputs ordered directly by the Director (GOVERNANCE §3). Each note is dated and points at the artifact it governs.

| Id | Date | Note | Governs |
|---|---|---|---|
| DN-01 | 2026-09-15 | The Director shared three wireframe mockups in the opening brief: Installation (requirements validator, global install with PATH, detection of CLIs such as Claude Code, OpenCode, AGY), Control panel (Add group, Add bot, Assign project, Overview), the three forms (ID, name, user instructions) and the Overview table (bot, bot id, group, group id, assigned project, collaborator agents, totals). Witnessed by Kairo in session; the images are not stored in this repository. | [OVERVIEW §10.2](../02-architecture/OVERVIEW.md), [WORK-PLAN F2](../07-plan/WORK-PLAN.md) |
| DN-02 | 2026-09-16 | The Director chose **Conmuta** as the product name (recommended by Kairo, ratified by Alpha). Trademark screening (B-11) and registry reservations remain pending. | [00-INDEX pending board](../00-INDEX.md#pending-director-decisions), [CHECKLIST B-11](../06-backlog/CHECKLIST.md) |
| DN-04 | 2026-09-16 | The Director accepted the Apache-2.0 license, confirmed the four new ADRs (0028–0031) by delegating implementation of everything the tribunal landed ("toma las riendas y aplica todo lo que consideres prudente"), authorized commits, pull requests and merges at Kairo's discretion, stated that no GitHub repository exists yet (to be shared later), and asked that sessions be switched at phase boundaries with a handoff so no session carries unnecessary context. | [LICENSE](../../LICENSE), [ADR index](../03-adr/INDEX.md), [session handoff](../08-sessions/HANDOFF.md) |
| DN-05 | 2026-09-16 | The Director shared the GitHub repository `agentesinteligentesllm-oss/connmuta` (public, empty) and the owner-account credential for it; Kairo registered `origin`, pushed `main` (F0 history) and left branch protection pending a Director choice of rules. The Director also asked that every complement, correction or implementation be audited by Alpha so that neither documentation nor code carries ambiguity. | [session handoff](../08-sessions/HANDOFF.md) |
| DN-06 | 2026-09-16 | For F1 delivery the Director chose the chain strategy `stacked-to-main` (each PR merges to `main` in sequence; no tracker branch) and accepted `size:exception` **only** for pull requests that vendor v1 modules AS-IS with a SHA-256 of the v1 body at `bf8f365` carried in the provenance header and re-verified by a test (tribunal ruling `bus-v2-f1-design-001` ask 5); SEAM and new modules stay within the 400-line budget. Kairo's assumption, open to veto: D-10 is superseded by DN-04 (`LICENSE` ships now, `private: true` until F6). | [design.md §20](../../openspec/changes/f1-daemon-registry-thin-client/design.md), [CHECKLIST B-16](../06-backlog/CHECKLIST.md) |
| DN-07 | 2026-09-16 | The Director reminded that this project lives **only** under the `agentesinteligentesllm-oss` GitHub account, that other agents on the same machine work under a different account on an unrelated project, and asked that nothing interfere with them. Kairo isolated this repository's GitHub authentication (repo-local credential helper, per-command `GH_TOKEN`; no more `gh auth switch`). The Director also authorized merging PR #1 (PR-01a) and PR #2 (PR-01b) and the native attempt-ledger reset after the PR-01 re-slice. | [session handoff](../08-sessions/HANDOFF.md), [AGENTS.md §5](../../AGENTS.md) |
| DN-03 | 2026-09-15 | Requirements added after the PROPOSAL: an optional group referee with moderation rules and ticket labels (B-01, B-02, B-03), a desktop version for Windows and if possible macOS (B-04), and a dedicated study of the gentle-ai installer (B-05). Quoted in the debate as amendments A2, A3, A4. | [CHECKLIST](../06-backlog/CHECKLIST.md), round 2 above |

## `bus-v2-f0-docs-audit-001` — record

Audit of the complete F0 documentation tree (45 Markdown files) against the decision record of
`bus-v2-landing-architecture-001` and the Director notes DN-01..DN-03.

| Item | Alpha's finding |
|---|---|
| Fidelity | Absolute fidelity to the decision record; pending Director decisions (license, SDD preflight, macOS scope) declared transparently in [00-INDEX](../00-INDEX.md#pending-director-decisions) and in the ADR headers; no invented mandates |
| Entry point and precedence | [00-INDEX](../00-INDEX.md) confirmed as the single entry point; precedence rule accepted |
| Constitution | The five invariants (I-1..I-5) and the ADR-0012 governing rule fixed verbatim; the ADR-06 boundary keeps the core a passive switch; the runner banished to `@conmuta/runner` post-F6 |
| ADRs | 27 inherited ADRs summarize v1 faithfully with traceability to `design.md`; only two items consciously reopened (0029 daemon, 0030 ledger); 0028–0031 follow the template with options, consequences and "Tests that must pin it" |
| Architecture and threat model | OVERVIEW §10.2 reproduces the three wireframes (DN-01); THREAT-MODEL incorporates the four round-1 objections (T16/PT-26 ephemeral port + HMAC, T17/PT-27 runner, T03/PT-05 `conmuta.json`, B-17 Node ≥ 24) across 22 threats and 33 pinning tests |
| Hygiene | 45 files, 452 relative links checked by Alpha, zero broken; zero tokens, chat ids or v1 production identities |

Outcome: the F0 documentation tree is formally approved by the tribunal. Next step: the SDD Session
Preflight with the Director, then the F1 SDD change.

## `bus-v2-f1-proposal-001` — record

Audit of the F1 SDD proposal (`openspec/changes/f1-daemon-registry-thin-client/proposal.md`) as required by GOVERNANCE §3 ("each phase's SDD change: proposal and design, before apply").

| Question | Alpha's ruling |
|---|---|
| (a) D-01 lazy spawn | Option A approved and sufficient: one allow-listed spawn site, compile-time argv, `shell: false`, `detached: true`, multi-clause static assertion; no separate launcher binary |
| (b) D-04 bearer | Per-session token minted at `POST /session`; the per-boot secret signs only the HMAC challenge and never travels as a bearer |
| (c) Scope | One change with auto-chained PRs ≤ 400 lines; splitting F1 would fragment the handshake and wrong-room tests that must be born integrated |
| (d) D-06 `needs_action` | VIEW (or indexed query) over `threads` with an index on `(project_id, status, awaiting)`; a separate table would duplicate derived state |
| (e) D-02, D-03, D-05, D-07..D-10 | Ratified |

Outcome: CONSENSUS; spec and design of F1 authorized to run in parallel.

## `bus-v2-session-1-closure-001` — record

Audit of everything done after the F1 proposal consensus: Director note DN-04 (Apache-2.0, ADR-0028..0031 confirmed, commit authority, session-switch rule), the `LICENSE` file, the ADR status changes, the session continuity mechanism (`docs/08-sessions/`) and the four commits on `main`.

| Question | Alpha's ruling |
|---|---|
| (a) Reading DN-04 as confirmation of ADR-0028..0031 | Defensible and correct: recorded expressly in DN-04 and in the ADR headers, the Director keeps the veto |
| (b) HANDOFF/LOG design | Complies with "no repeated information": an operational pointer that defers to the ADRs and 00-INDEX; the single entry point is preserved |
| (c) The four commits | Correct reviewable units, conventional commits, zero AI attribution, clean tree |
| (d) Handoff completeness | The six-step start for session 2 is self-sufficient; session 2 does not need this session's context |

Outcome: CONSENSUS; session 1 closed at the F0 → F1 spec/design boundary.

## `bus-v2-f1-design-001` — record

Audit of the F1 SDD design (`openspec/changes/f1-daemon-registry-thin-client/design.md`, decisions
D-11..D-30) together with the nine F1 delta specs (`specs/*/spec.md`, 44 requirements, 72 scenarios),
as required by GOVERNANCE §3. Both artifacts were produced in parallel from the proposal and the
rulings of `bus-v2-f1-proposal-001`; the orchestrator's fresh-context validator had reported
`PASS WITH WARNINGS` (0 blockers, 5 spec-side reconciliation items) before the debate.

| Question | Alpha's ruling |
|---|---|
| (1) D-11..D-30 as elaborations of rulings (a)–(e) | Ratified. Expressly: D-14 mutual HMAC proof with domain-separated labels (`identity:` / `session:`) and a per-session bearer, the per-boot secret never travelling; D-16 two lock files (`daemon.lock` singleton + heartbeat, `spawn.lock` spawner election); D-17 distinct error taxonomy; D-19 new-session cursor at `SESSION_CATCHUP_HOURS`; D-20 `updates.body` NULL only for `rejected`/`ignored`; D-21 `PRAGMA synchronous = FULL`; D-26 timer allow-list extended to `daemon/serve/fetch.js` with the reverse-import-graph assertion that it cannot reach `transport/*` or `send/*` |
| (2) D-15 fence applied by the daemon at the IPC boundary | Accepted: one fencing and origin-labelling site guarantees no client (MCP or the future panel) handles raw peer input; the amendment note on proposal deliverable 11 is recorded in `tasks.md` |
| (3) D-29 `conmuta daemon stop` and `conmuta validate` in F1 | Ratified as in scope: a supported stop is required by the rollback plan on Windows; the validator needs a callable surface for the opt-in pre-commit hook (I-2) |
| (4) Spec reconciliation plan | Approved without changes: (i) `ipc-handshake` adopts `DAEMON_IDENTITY_MISMATCH` and the `POST /session` HMAC proof (the bearer is the response), plus scenarios for the other D-17 codes; (ii) `v1-migration` drops the `AGENTBUS_BOT_TOKEN` env fallback (only `config.json` or `--token-stdin`, D-24); (iii) `daemon-lifecycle` splits `DAEMON_LOCK_STALE_SECONDS` from `SPAWN_LOCK_STALE_SECONDS` (D-16); (iv) `ledger` and `durable-inbox` cover the remaining retention/session constants, D-19 and D-20. Spec yields to design in every case |
| (5) Hash-pinned AS-IS vendored modules as a review substitute | Favourable: a SHA-256 of the v1 body at `bf8f365`, carried in the provenance header and re-verified by a test, is a falsifiable and safe substitute for line-by-line review of strictly AS-IS modules (envelope, `transport/*`, predicates, pure schemas) and justifies `size:exception` for those PRs only; SEAM modules keep full review within the 400-line budget. Acceptance of the exception itself is the Director's (pending) |
| (6) D-10 vs DN-04 | No objection: D-10 is formally superseded by DN-04 (Apache-2.0 in force; `private: true` until F6) |
| (7) Independent audit of §5.2 DDL, §8.2 admission, §14 static assertions | Conformant: STRICT tables, no body column in `audit_log` or `unknown_senders`, write-ahead transaction before the offset advance, indexed `needs_action` VIEW (ADR-0030 rules 2/4/5); seven-step admission drops `foreign_chat` at step 3, records `unknown_senders` without body at step 4, applies D-05 fail-closed at step 7 (ADR-0029 rule 1, OVERVIEW §7.2); spawn isolation (literal argv, `shell: false`, single site `client/spawn.ts`) and timer isolation by reverse-graph analysis (CONSTITUTION §3, PT-07/27/28) |

Outcome: CONSENSUS in one round; `sdd-spec` re-run once with plan (4) as corrective feedback, then
`sdd-tasks`.

## `bus-v2-f1-tasks-001` — record

Audit of the F1 task breakdown (`openspec/changes/f1-daemon-registry-thin-client/tasks.md`: PR
slices, Review Workload Forecast, Strict-TDD ordering) before the session closed at the `tasks`
boundary, at the Director's instruction that every artifact be audited before it is used.

| Question | Alpha's ruling |
|---|---|
| (1) PR-07 vendored range extracts as `size:exception` | Rejected as exception: a hash over a spliced extract is not falsifiable against a git blob at `bf8f365` — the splice itself is unreviewed code. The exception is restricted to whole-file 1:1 copies; `tool-schemas.ts` and `tool-output.ts` are SEAM and are re-sliced under the ordinary budget (PR-07a, PR-07b, optional PR-07c) |
| (2) Whole-file AS-IS set | Confirmed: `envelope.ts` (+ twin) and `daemon/transport/{types,group,direct,dual}.ts` (+ twins). `test/security/predicates.ts` is also a range extract (v1 `test/security.test.ts:25-101`), ≈77 lines: SEAM, no exception (PR-39 ≈197 lines) |
| (3) One file across two chained PRs (`telegram.ts` PR-18/19; `serve/status.ts`, `serve/thread.ts` PR-24/25) | Sound under `stacked-to-main`: each PR compiles and passes its tests alone; keeping one target file avoids artificial micro-modules |
| (4) Near-budget slices | PR-22 pre-split into PR-22a (`daemon/admission.ts`, the seven-step pipeline carrying invariants 1, 4, 5) and PR-22b (`daemon/poller.ts`); PR-05 stays as one cohesive state-machine module with a watch instruction to `sdd-apply` |
| (5) Documentation cadence | Per GOVERNANCE: every PR that lands a PT-xx pinning test updates that row's file-name cell in THREAT-MODEL §4 within the same PR; PR-42 remains the close-out for DATA-MODEL and CHECKLIST |
| (6) Independent sample (PR-10, PR-12, PR-16, PR-30, PR-32, PR-41) | RED strictly precedes GREEN; paths match design §2.1; requirements and PT ids match `specs/README.md`; verify commands are real `node --test` runs. A stale note on the provenance-header format at the end of `tasks.md` was to be removed during the re-slice |

Kairo also recorded, as writer, the amendment that the v1 body SHA-256 travels in the provenance
header (design §12; PR-02), as ruled in `bus-v2-f1-design-001` item 5 and DN-06.

Outcome: CONSENSUS in one round; re-slices (1), (2), (4), (5) and the cleanup (6) applied to
`tasks.md` before the session closed: 44 PR slices, 2 with `size:exception`, 207 tasks.

## `bus-v2-session-2-closure-001` — record

Audit of everything written in session 2 before the `apply` session uses it: the three commits
(`aa19a66` specs + design, `0bdaf3e` tasks + state, `8657450` tribunal records, DN-05, DN-06, log,
handoff), the re-sliced `tasks.md`, and the documentation refresh (00-INDEX status line, ADR-0031
row, pending board rows 3 and 5–7, AGENTS.md status and remote, README status, CHECKLIST B-13/B-15).

| Question | Alpha's ruling |
|---|---|
| (1) Handoff self-sufficient for `sdd-apply` at PR-01 | Yes: launch inputs fixed without ambiguity (stacked-to-main, DN-06 exception scope, Strict TDD forwarding, attempt ledger, Alpha audit before `gh pr create`); no row repeats a decision; the Engram project-key note prevents a split memory |
| (2) Tribunal records and DN-05/DN-06 | Faithful to the rulings of `bus-v2-f1-design-001` and `bus-v2-f1-tasks-001`, including the exclusion of range extracts from `size:exception` and the per-PR THREAT-MODEL §4 rule; the credential mention in DN-05 is conceptual — no token or secret in the tree or the diffs |
| (3) `tasks.md` after the re-slice | 44 slices, 2 exceptions; forecast arithmetic (≈13,000 / ≈1,760 excluded / ≈11,240 over 42 / ≈270 per PR) and the dependency chain (PR-07a → PR-07b → PR-08; PR-22a → PR-22b → PR-23) exact and consistent |
| (4) Documentation refresh | Complete, coherent and precise; the tree is free of stale statements for the start of `apply` |
| (5) Commit hygiene | Three reviewable units, conventional messages, no AI attribution, pushed under DN-04 authority — no objection |
| (6) Anything to fix in this session | Nothing pending; the documentation-refresh commit closes the session |

Outcome: CONSENSUS; session 2 closed at the F1 `tasks` → `apply` boundary.

## `bus-v2-f1-pr-01-001` — record

Audit of the first F1 code slice before it opened on GitHub (DN-05): branches
`f1/01a-scaffold-ci-gates` and `f1/01b-shared-constants`, the apply-time re-slice of PR-01, the
orchestrator's scope additions and the defects found in Kairo's own review.

| Question | Alpha's ruling |
|---|---|
| (1) Re-slice PR-01 → PR-01a (380 authored lines) + PR-01b (386); `tasks.md` amended in place (45 slices, budget-count rule in the header) | Ratified: both under 400; DN-06 `size:exception` does not apply to new code; the amendment is exact |
| (2) PR-01a content: `package.json` (design §2.3), `tsconfig.base.json` + project references, CI, twin rule, PT-21, PT-22 | Approved; verified in a clean worktree (8/8); no `.tsbuildinfo` in `npm pack`; the scanner's self/fixture exclusion is justified |
| (3) PR-01b content: `src/shared/constants.ts` (design §3, SEAM of `v1:src/config.ts:26-166`) + twin | Approved; provenance SHA-256 `4ce5e514…b48a` recomputed independently and identical; W1/W8, `NODE_FLOOR`, derivations verified (14/14, static 6/6) |
| (4) Scope additions: `.gitignore` negation for the PT-22 fixture; `test/shared/version.test.ts` twin; `tsconfig.base.json` | Ratified |
| (5) Defects found and fixed before the audit: `tsbuildinfo` packed by `npm pack` (absolute paths); `repo-scan.test.ts` matching itself once tracked | Ratified; RED reproduced before GREEN in both |
| (6) Deviations: inert `client`/`daemon`/`cli` tsconfigs out of the root `references` (TS18003); `test:wrong-room` glob until PR-41; TypeScript 7.0.2 needs `types: ["node"]`; `npm-cli.js` spawn on win32 | Ratified (6a–6d) |
| (7) THREAT-MODEL §4 file-name rule satisfied by the `scope` cell; real tenant deny-list outside the tree (B-16, PR-42) | Ratified; convention stands for later PRs |

Outcome: CONSENSUS in one round. PR #1 (PR-01a) and PR #2 (PR-01b) opened after the audit; CI
(`windows-latest` × Node 24.15/26) green on both merges (`1369886`, `5798bab`) under the
Director's authorization (DN-07). Lesson recorded in `tasks.md`: estimates built from v1 line counts
under-count SEAM modules whose doc comments must be re-authored; `sdd-apply` measures the real diff
before each PR opens.

## `bus-v2-session-3-closure-001` — record

Audit of everything written in session 3 before the docs commit on `main`: the merged PRs #1 and #2,
the handoff, the log, the tribunal row/record for `bus-v2-f1-pr-01-001`, DN-07, the live-status
refresh (00-INDEX, AGENTS.md, README, CHECKLIST B-16) and the `sdd-init` re-run in
`openspec/config.yaml`.

| Question | Alpha's ruling |
|---|---|
| (1) Handoff self-sufficient for PR-02 | Yes: exact pointers, canonical preflight order, ledger `--max-changed-lines` sized to what the ledger measures, clean-worktree verification step; no decision repeated |
| (2) Tribunal fidelity and hygiene | Faithful to the `bus-v2-f1-pr-01-001` envelope and DN-07; no token, secret or unrelated account in the text |
| (3) LOG accuracy | Correct, newest first, "how it knows" with run ids and Engram ids |
| (4) Live-status sweep | Two remnants found: `openspec/config.yaml` context still said "PR-01b open" (the `sdd-init` re-run happened between the two merges) and `state.yaml` still said "start at PR-01" with a pending `apply` block — both fixed in the same commit; `gentle-ai sdd-status` re-run after the fix: `apply`, 210 tasks / 11 complete, no blockers |
| (5) Anything else | Nothing; the docs commit closes the session |

Outcome: CONSENSUS after one AUDIT round (`APPROVE_WITH_CHANGES`, objections 1–2 accepted with
evidence); session 3 closed at the PR-01b → PR-02 boundary.

## Reserved: `bus-v2-referee-001`

Scope fixed by amendment A3 and backlog B-01–B-03: one optional referee per group with an explicit
rule set (registers tickets with mandatory labels, homologates state, blocks duplicates, re-work and
re-debate); precedent `FRISCO/frisco-erp/coordinador` (mechanical gate, writes nothing, authorizes
nothing, own ledger outside the tree); runs as a satellite package, never inside the bus core (Alpha
objection n1, ADR-06). Skill templates (B-02) are decided in the same debate; the ticket-ledger
location (B-03) after B-01. Not started; scheduled for F7.

## Inherited v1 debates (historical record, not re-audited)

The v1 programme was audited per block. These ids are listed so a reader can locate the origin of an
inherited ADR; the transcripts live in the v1 repository
(`telegram-agent-bus/docs/functional-audit/README.md:36-48`; `CLAUDE.md`; `design.md:535,559,588,621`).

| Id | Relates to |
|---|---|
| `agentbus-functional-audit-scope-001` | audit scope |
| `agentbus-block1-liveness-001`, `agentbus-block1b-receive-integrity-001` | ADR-0014, ADR-0018 |
| `agentbus-block2-conversation-001`, `agentbus-block2b-wire-sentinel-001` | ADR-0020, ADR-0021 |
| `agentbus-block3-availability-001`, `agentbus-block3b-local-closure-001` | ADR-0014, ADR-0019 |
| `agentbus-block4-human-plane-001`, `agentbus-block4b-body-collapse-001` | ADR-0005b/c, ADR-0022 |
| `agentbus-block5-state-scale-001` | ADR-0015, ADR-0016, ADR-0017 |
| `agentbus-block6-verdict-001` | closed-permanently list |
| `agentbus-impl-plan-001` | ADR-0015 correction (design.md:346) |
| `agentbus-v060-prd-quiet-tick-001` | ADR-0016 correction (design.md:378) |
| `agentbus-v051-audit-001`, `agentbus-v100-plan-001`, `agentbus-v100-production-readiness-001` | releases v0.5.1, v1.0.0 |
| `agentbus-partial-window-dev1-dev3-001`, `agentbus-doc-premise-dev1-version-001`, `agentbus-dev3-onboarding-wire-collision-001`, `agentbus-rollout-dev3-dev4-plan-001` | rollout and freeze doctrine |
| `agentbus-channel-audit-001` | ADR-0024 (design.md:535) |
| `agentbus-channel-fixes-audit-001` | ADR-0025 (design.md:559) |
| `agentbus-orphan-transitions-001` | ADR-0026 (design.md:588) |
| `agentbus-needs-action-muestra-apertura-001` | ADR-0027 (design.md:621) |
