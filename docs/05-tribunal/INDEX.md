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
| `bus-v2-session-3-addendum-001` | 2026-09-16 ~07:20Z | Kairo (proposer, writer), Alpha (auditor) | 1 | `CONSENSUS` | none (records DN-08 and the branch-protection change) | branch protection on `main` closed |
| `bus-v2-f1-pr-02-001` | 2026-09-16 ~17:05Z → watchdog close | Kairo (proposer, writer), Alpha (auditor) | 1 (PROPOSAL only) | `ESCALATED` — closed by the broker watchdog on a turn timeout before Alpha's `AUDIT` reached the channel; Alpha's out-of-band verdict (relayed by the Director) was `APPROVE`; no disagreement | none | re-run as `bus-v2-f1-pr-02-002` by the Director's decision |
| `bus-v2-f1-pr-02-002` | 2026-09-16 ~19:25Z → ~19:30Z | Kairo (proposer, writer), Alpha (auditor); Kairo (merge authority, DN-08) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none (second code slice of F1) | `deliveredText` helper split (`test/fakes/delivered-text.ts`, PR-18 must import it); `constants.ts` joins the provenance registry; RED-fidelity deviation on task 2.1 recorded |
| `bus-v2-session-4-closure-001` | 2026-09-16 ~19:55Z → ~20:05Z | Kairo (proposer, writer), Alpha (auditor) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none | — |
| `bus-v2-f1-pr-03-001` | 2026-09-16 | Kairo (proposer, writer), Alpha (auditor); Kairo (merge authority, DN-08) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none (third code slice of F1) | doc-hygiene defect class flagged: a fixture-token narrative must describe the shape, never quote it verbatim, or it retrips PT-22 on the doc file itself; PT-22/`shared/secrets.ts` regex duplication left orthogonal, ratified |
| `bus-v2-session-5-closure-001` | 2026-09-16 | Kairo (proposer, writer), Alpha (auditor) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none | — |
| `bus-v2-session-5-handoff-audit-001` | 2026-09-16 | Kairo (proposer, writer), Alpha (auditor) | 2 | `CONSENSUS` — round 1 `APPROVE_WITH_CHANGES` (4 objections), round 2 `APPROVE`, objections `[]` | none | Director-requested dedicated clarity/ambiguity/completeness audit of `HANDOFF.md`; 3 objections accepted and fixed as cited; 1 accepted in substance with its cited SHA-256 rejected as unverifiable (a model cannot compute a hash by reasoning) and replaced with Kairo's independently-computed value |
| `bus-v2-f1-pr-04-001` | 2026-09-16 | Kairo (proposer, writer), Alpha (auditor); Kairo (merge authority, DN-08) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none (fourth code slice of F1) | `sdd-apply` self-check defect class flagged: a shell `head -c -1` cross-check silently strips a real trailing newline when hashing a line-range slice of a larger source file, producing a false "orchestrator value is wrong" claim; caught by Kairo before commit, independently re-verified 4 ways |
| `bus-v2-f1-pr-05-001` | 2026-09-16 | Kairo (proposer, writer), Alpha (auditor); Director (delegated the budget decision to Kairo this session); Kairo (merge authority, DN-08) | 1 | `CONSENSUS` — `APPROVE`, objections `[]` | none (fifth code slice of F1) | One-time, PR-05-scoped size exception (609 authored lines vs. the 400-line cap) granted under explicit Director authorization, distinct from DN-06 (which stays AS-IS-only); grounds: the state machine is not safely splittable and a test/implementation split across stacked PRs would fail `test/twins.test.ts` on the first PR's own merge, a risk that also applies to the planned PR-07b/PR-07c split; two stale fail-open doc comments in `thread-record.ts` (PR-04) corrected |
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
| DN-08 | 2026-09-16 | At the close of session 3 the Director renewed and widened the delegation of DN-04 ("toma las riendas y aplica todo lo que consideres apropiado y necesario, tienes toda mi autorización"), keeping the rule that Alpha audits everything (DN-05). Consequences fixed by Kairo and audited in `bus-v2-session-3-addendum-001`: a PR merges after its tribunal CONSENSUS and green CI without a separate Director question (Kairo reports what was merged); native attempt-ledger resets are performed by Kairo with the proven reason and `--actor "Kairo (DN-08)"`; branch protection on `main` applied as Kairo had proposed (force-push and deletion blocked; no PR or status-check requirement, so session-close documentation commits stay direct). The Director asked that documentation and handoff leave no ambiguity before a new session starts. | [session handoff](../08-sessions/HANDOFF.md), [00-INDEX pending board](../00-INDEX.md#pending-director-decisions) |
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

> Later superseded in part at apply time: PR-01 was re-sliced into PR-01a/PR-01b on real diff evidence
> (≈790 authorized lines against a ≈350 estimate, and DN-06's `size:exception` does not cover new code),
> which makes the plan **45 slices / 210 tasks**. That amendment is ratified in `bus-v2-f1-pr-01-001` and
> recorded in `state.yaml`; no other slice was re-numbered. The `size:exception` count stays 2.

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

## `bus-v2-f1-pr-02-001` and `bus-v2-f1-pr-02-002` — record

Audit of the second F1 code slice before it opened on GitHub (DN-05): branch
`f1/02-envelope-provenance` (commits `36bc4d1`, `b1a13dd`, `119868e`), the provenance mechanism
(`test/security/provenance.test.ts` + `test/fixtures/v1-provenance.json`) and the whole-file AS-IS
copies of `v1:src/envelope.ts` and `v1:test/envelope.test.ts` under DN-06 `size:exception`.

`bus-v2-f1-pr-02-001` received the PROPOSAL but the broker watchdog closed it as `ESCALATED` on a
turn timeout before Alpha's `AUDIT` entered the channel; Alpha's verdict reached Kairo only out of
band (relayed by the Director): `APPROVE`, no objections. Rather than merge on an escalated record,
the Director chose to re-run the debate in-band as `bus-v2-f1-pr-02-002` with the same proposal and
an explicit reference to the first id; nothing changed on the branch between the two.

| Question | Alpha's ruling (`-002`) |
|---|---|
| (1) Headers and hashes: `src/shared/envelope.ts:1-5` (`e4aba6ec…2663`), `test/shared/envelope.test.ts:1-5` (`db6cda68…db7f`); hash rule = CRLF→LF, strip leading provenance header, strip leading import block | Ratified: all recomputed independently against `telegram-agent-bus@bf8f365`, byte-for-byte |
| (2) Registry with three entries, including PR-01b's pre-existing `src/shared/constants.ts` SEAM header (`4ce5e514…` = v1 `config.ts:26-166`, LF-joined) | Ratified: the registry equals every headered file (design §12); `constants.ts` untouched |
| (3) `test/fakes/delivered-text.ts` split from `v1:test/fakes/telegram.ts:43-49` so the twin stays a whole-file AS-IS copy before PR-18's SEAM fake exists; no provenance header; PR-18 must import it | Ratified: byte-identical extract; `test/twins.test.ts` walks `src/**` only |
| (4) Kairo's hardening: a header carrying `Provenance:` that fails to parse fails the scan (was silently skipped); dead blank-skip loop removed; parser unit test retitled | Ratified |
| (5) RED-fidelity deviation on task 2.1 (vendored files already staged; only the non-vacuity guard fired) plus a second genuine RED for the malformed-header assertion | Ratified as an honestly documented process deviation, not a correctness gap |
| (6) Budget and gates: 215 authored lines; 1,003 vendored body lines excluded; clean detached worktree 89/89 and static 8/8; data hygiene clean | Ratified |

Outcome: CONSENSUS in one round (`-002`). PR #3 opened after the audit under
`agentesinteligentesllm-oss`; CI (`windows-latest` × Node 24.15/26) green on the PR (run
`35141361427`) and on `main` after the merge (`2083d7a`, run `35141490997`); merged by Kairo under
DN-08. Lesson recorded in the handoff: a watchdog escalation is not a verdict — re-run the debate
in-band so the record shows the real outcome.

## `bus-v2-session-4-closure-001` — record

Audit of everything written in session 4 before the docs commit on `main`: the merged PR #3, the
handoff for PR-03, the log, the tribunal rows/record for `bus-v2-f1-pr-02-001`/`-002` and the
live-status refresh (00-INDEX, AGENTS.md, README, `openspec/config.yaml`, `state.yaml`).

| Question | Alpha's ruling |
|---|---|
| (1) Handoff self-sufficient for PR-03 | Yes: verified v1 sizes, SEAM change, fixture-entry requirement, THREAT-MODEL cells, ledger sizing; the watchdog-timeout rule (re-run under `-002`, never merge on a timeout escalation) ratified as critical |
| (2) Tribunal fidelity | Rows and record faithful to the `-001` timeout, the out-of-band verdict and the in-band `-002` consensus, with the six rulings and both CI runs |
| (3) LOG accuracy | Accurate, newest first, traceable "how it knows" |
| (4) Live-status sweep | Clean and synchronized across the five files; `gentle-ai sdd-status` 17/210, no blockers |

Outcome: CONSENSUS in one round; session 4 closed at the PR-02 → PR-03 boundary.

## `bus-v2-f1-pr-03-001` — record

Audit of the third F1 code slice before it opened on GitHub (DN-05): branch `f1/03-secrets`
(commits `2626a49` feat, `c3d5704` docs(threat-model), `837d94d` docs(sdd), `bd1cebf` fix), the
whole-file SEAM vendor of `v1:src/secrets.ts` (`export` added to `TELEGRAM_BOT_TOKEN_RE`) and a
doc-hygiene defect Kairo found and fixed in its own clean-worktree verification pass.

| Question | Alpha's ruling |
|---|---|
| (1) Provenance: `src/shared/secrets.ts:1-3` sha256 `742bf433…f2790bf6`, recomputed independently against `telegram-agent-bus@bf8f365` (no header/imports to strip, hash covers the full 86-line body) | Ratified: exact match; the only functional delta from v1 is `export` on `TELEGRAM_BOT_TOKEN_RE` (`src/shared/secrets.ts:24`) |
| (2) Budget: 250 authored lines against the 400-line cap; SEAM body not `size:exception` under DN-06 | Ratified: no exception requested or needed |
| (3) Fixture deviation: v1's own 10-digit fixture token collides with `test/security/repo-scan.test.ts:13`'s own stricter `TOKEN_SHAPE_RE` (PT-22, an 8–10-digit scan v1 never had to survive); narrowed to 7 digits in `test/shared/secrets.test.ts:13`, still exercises `shared/secrets.ts`'s unbounded regex | Ratified: sound, no coverage lost |
| (4) `repo-scan.test.ts` keeps its own `TOKEN_SHAPE_RE` copy instead of importing the now-exported `TELEGRAM_BOT_TOKEN_RE` | Ratified as an intentional orthogonality: PT-22's repo-wide scan should not depend on product code; DRY duplication noted, not fixed, no follow-up required |
| (5) Kairo's finding (`bd1cebf`): the `sdd-apply` agent's own "Corrections" note in `apply-progress.md` quoted v1's 10-digit fixture token verbatim, which retripped PT-22 on the doc file itself; redacted to a description, re-verified green from a second clean detached worktree | Ratified: correct fix; flagged as a defect class for future `sdd-apply` prompts — describe a matched-and-rejected secret shape, never quote it |
| (6) Verification: clean detached worktree (`npm ci --ignore-scripts`) run twice — once pre-fix (PT-22 caught the doc issue), once post-fix — full suite 103/103, static 8/8 both times after the fix; independent fresh-context phase-contract validator PASS | Ratified |

Outcome: CONSENSUS in one round. PR #4 (`f1/03-secrets` → `main`) opened after the audit under
`agentesinteligentesllm-oss`; CI (`windows-latest` × Node 24.15/26) green (run `35145603619`);
merged by Kairo under DN-08 (`77855b9`, branch deleted). Native attempt ledger settled `passed`,
`state: complete`.

## `bus-v2-session-5-closure-001` — record

Audit of everything written in session 5 before the docs commit on `main`: the merged PR #4, the
handoff for PR-04, the log, the tribunal row/record for `bus-v2-f1-pr-03-001`, and the live-status
refresh (AGENTS.md, README.md, 00-INDEX, `openspec/config.yaml`, `state.yaml`).

| Question | Alpha's ruling |
|---|---|
| (a) Doc-hygiene rule framing | Precisely scoped (root cause: PT-22 scans every tracked file, not only `src/**`/`test/**`; prescriptive rule: describe the shape, never quote the literal) — sufficient without over-constraining |
| (b) SDD-preflight guidance accuracy | Accurately details both dispatch-refusal causes (non-canonical wording/order; hand-authored preflight block in a sub-agent prompt) and gives an unambiguous clean-start path |
| (c) Status-line sweep | Complete and coherent across all 8 changed files; zero stale PR-03-as-next references; 21/210 confirmed |
| (d) Fidelity to `bus-v2-f1-pr-03-001` | Faithful; no unratified addition or extrapolation |

Outcome: CONSENSUS in one round; session 5 closed at the PR-03 → PR-04 boundary.

## `bus-v2-f1-pr-04-001` — record

Audit of the fourth F1 code slice before it opened on GitHub (DN-05): branch `f1/04-thread-record`
(commits `3c1753c` feat, `1b80e51` docs(sdd)), the SEAM vendor of `ThreadRecord`/`HistoryEntry` from
`v1:src/state.ts:15-87` (`first_surfaced_at` removed per design §12/PR-12), and a hash-verification
defect in the `sdd-apply` subagent's own self-check that Kairo caught and corrected before commit.

| Question | Alpha's ruling |
|---|---|
| (1) Provenance: `src/shared/thread-record.ts:1-6` sha256 `bd177372…d6160`, recomputed independently against `telegram-agent-bus@bf8f365` (no header/imports to strip in this line-range slice; hash covers the full 73-line body incl. the real trailing newline before v1 line 88) | Ratified: exact match; the only functional delta from v1 is `first_surfaced_at` removed (`src/shared/thread-record.ts:22-74` vs. v1 `state.ts:29-87`) |
| (2) Budget: 169 authored lines against the 400-line cap; SEAM body not `size:exception` under DN-06 | Ratified: no exception requested or needed |
| (3) `sdd-apply` self-check defect: its own cross-check (`sed -n '15,87p' \| head -c -1 \| sha256sum`) unconditionally strips the last byte before hashing; since v1 line 87 is followed by line 88 (not EOF), that byte is a real, load-bearing newline, not an extraction artifact — the subagent's recomputation (`629db3c9…8838`) was wrong, and it had wrongly overwritten the orchestrator-supplied correct value on that mistaken basis. Kairo caught this, re-verified the original value 4 independent ways (node crypto, sha256sum, openssl, a separate fresh-context read-only validator agent), and corrected the file and the `apply-progress.md` narrative before commit | Ratified: correct fix; flagged as a defect class for future hash cross-checks over line-range slices — never blind-strip a trailing byte, re-derive with the exact target algorithm (split by line, array-slice by index, join with the same separator) instead |
| (4) Strict TDD: RED is a genuine `tsc` `TS2307` "Cannot find module" (apply-progress.md RED evidence section); type-only module, no triangulation possible per `strict-tdd.md`'s structural exception, 5 shape/round-trip tests substituted | Ratified: sound application of the type-only exception |
| (5) Verification: clean detached worktree (`npm ci --ignore-scripts`) after the hash fix — full suite 108/108, static 8/8; independent fresh-context phase-contract validator (separate agent, no implementation context): 7/7 checks PASS, including its own independent recomputation of the hash | Ratified |

Outcome: CONSENSUS in one round. PR #5 (`f1/04-thread-record` → `main`) opened after the audit under
`agentesinteligentesllm-oss`; CI (`windows-latest` × Node 24.15/26) green (run `35156561623`); merged
by Kairo under DN-08 (`f0097f0`, branch deleted). Native attempt ledger settled `passed`,
`state: complete`.

## `bus-v2-f1-pr-05-001` — record

Audit of the fifth F1 code slice before it opened on GitHub (DN-05): branch `f1/05-protocol-apply`
(commits `493546e` feat, `0b86808`/`b25b073` fix, `966e914` docs(threat-model), `6f2ab61`/`47ee59b`
docs(sdd)), the SEAM vendor of `applyEnvelope`/`isAddressee`/`classifyRejection` from
`v1:src/protocol.ts:1-333` implementing D-05's fail-closed null-anchor rule, and a Director-authorized
one-time size exception for a real diff that came in well over both the 400-line cap and the tasks.md
estimate.

| Question | Alpha's ruling |
|---|---|
| (1) Provenance: `src/shared/protocol-apply.ts:1-6` sha256 `e8b6f8a4…2ffcbe`, recomputed independently against `telegram-agent-bus@bf8f365` (6-line import block stripped; body is v1 lines 7-333 including the real trailing newline before v1 line 334) | Ratified: exact match, verified independently by Alpha in addition to Kairo's 3 methods and a separate fresh-context validator's 2 more methods |
| (2) Contract: all 4 named design.md:448 changes (`ThreadRecord` import, REPLY drops `first_surfaced_at`, D-05 fail-closed with the ADR-13 originator arms intact, `isDuplicateEid` unused) verified present in the code and exercised by 20 tests | Ratified |
| (3) Budget: real diff 609 authored lines (311 impl + 288 test + 6 fixture + 4 docs), 209 over the 400-line cap and 56% over tasks.md's own ~390 estimate; tasks.md itself pre-flagged this module as "one cohesive state-machine module, not splittable per design" before apply started. Director explicitly authorized Kairo this session to decide. Kairo granted a one-time, PR-05-scoped size exception, distinct from DN-06 (which stays AS-IS-only, `bus-v2-f1-tasks-001` items 1-2, not amended), on the grounds that the apparent alternative — implementation and test twin in separate stacked PRs, the pattern already planned for PR-07b/PR-07c — is unsafe: `test/twins.test.ts:29-44` requires every `src/**/*.ts` file to have its twin present in the same tree, so the first PR's own merge to `main` would fail CI. Confirmed as fact by an independent fresh-context validator reading `twins.test.ts` and `ci.yml` directly; no safer split found after searching by function and by test-case group | Ratified: the exception and its grounds are sound; the `twins.test.ts` risk noted for reconsideration before PR-07b/PR-07c |
| (4) Doc fix: two stale comments in `src/shared/thread-record.ts` (PR-04's file) describing v1's pre-D-05 fail-OPEN behavior on a null anchor (`to` field docstring and `to_user_id` field docstring) — the first caught by Kairo, the second (a residual the first pass missed) caught by the independent validator, both corrected before commit | Ratified |
| (5) Verification: clean detached worktree (`npm ci --ignore-scripts`) before and after merge — full suite 128/128 (up from 108), static 8/8; independent fresh-context validator re-derived the hash, re-checked the contract against v1 and design, and reran the suite itself | Ratified |

Outcome: CONSENSUS in one round. PR #6 (`f1/05-protocol-apply` → `main`) opened after the audit under
`agentesinteligentesllm-oss`; CI (`windows-latest` × Node 24.15/26) green (run `35161651361`); merged
by Kairo under DN-08 (`fec730b`, branch deleted). Native attempt ledger settled `passed`; its
`changed_lines` (825) counted the full diff including SDD bookkeeping the review-policy budget
excludes, so the objective needed a Director-delegated reset (same systemic gap as the PR-01 reset).

## `bus-v2-session-5-handoff-audit-001` — record

Director-requested dedicated audit of `docs/08-sessions/HANDOFF.md` for clarity, ambiguity and
completeness (distinct from `bus-v2-session-5-closure-001`, which checked status-line consistency):
could a fresh session with zero conversation memory start PR-04 correctly from the handoff alone?

| # | Objection (round 1) | Kairo's response |
|---|---|---|
| 1 | PR-04 SEAM facts (v1 line range, body hash) and `test/fixtures/v1-provenance.json` omitted from `tasks.md:101`'s Scope cell were missing from the handoff, risking a repeat of the PR-02 `constants.ts` discovery | Accepted in substance (line range 73, confirmed by direct inspection; `tasks.md` Scope gap, confirmed) — **but the cited SHA-256 was rejected**: Kairo independently extracted the frozen `bf8f365` blob and computed `bd17737239958c20b317c0ea11860716d7db1da23f17eac9677e53d0c49d6160` via the exact `vendoredBody` algorithm, which did not match Alpha's cited digest. A language model cannot compute SHA-256 by reasoning; Kairo's mechanically-computed value replaced it in the handoff |
| 2 | The relative Markdown link to `sdd-orchestrator-workflow.md` in `HANDOFF.md:18` was broken (5 `../` hops instead of the 6 needed to reach the user's home directory) | Accepted: confirmed by path arithmetic; fixed by citing the path as plain text (`~/.claude/...`), since a path outside the repository tree should never be a repo-relative link |
| 3 | Step 6 created the `verify-04` worktree but never explicitly removed it in the numbered sequence | Accepted: added `git worktree remove … --force` directly after the verification run in step 6, with a "do not defer to session close" note |
| 4 | The handoff's SDD-preflight row quoted only the first of two exact dispatch-refusal error strings hit this session | Accepted: both exact strings now quoted verbatim, each tied to its cause |

Outcome: round 1 `APPROVE_WITH_CHANGES`; round 2 (after Kairo's `COUNTER` fixing 2–4 and correcting
1's evidence) `CONSENSUS`, `APPROVE`, objections `[]`. `HANDOFF.md` ratified as unambiguous and
self-sufficient for a zero-context PR-04 start.

## `bus-v2-f1-pr-06-waiver-001` — record (a WAIVER, not a debate)

**This is deliberately not a row in the Debates table above**, because no debate happened: the table
requires a `CONSENSUS` or `ESCALATED` outcome from an Arena exchange, and none occurred. Recording it
here keeps the governance debt visible instead of leaving it as a silent omission.

| Field | Value |
|---|---|
| Date | 2026-09-17 |
| Subject | PR-06 (`shared/protocol-select.ts` + `shared/fence.ts`, both SEAM, D-15), delivered as PR-06a (#7 `9053908`) and PR-06b (#8 `cf19561`) |
| Authority | **The Director**, who owns DN-05 |
| What was waived | DN-05's "Alpha audits every unit before it opens". The Arena bridge that hosts the Alpha collaborator was unreachable for the whole session (`http://127.0.0.1:8766/mcp` → `ECONNREFUSED`; the bridge is the Arena Orion Electron app and was not running). The Director stated the audit would not be applied for this mission, that the mission was to be completed with internal capability, and that the bridge must not become a blocker. |
| What was used instead | **Judgment Day** (`~/.agents/skills/judgment-day/SKILL.md`): two blind read-only judges (`jd-judge-a`, `jd-judge-b`) over the frozen range `ef58020..98ca9ef` with identical scope and criteria, a merged frozen ledger, one bounded correction round, and one scoped re-judgment over the immutable fix delta. Round 1 verdict `APPROVED` (no CRITICAL) with 6 ledger items, 4 corroborated by both judges; round 2 found no CRITICAL and no behavioral regression. |
| Defects it caught | A provenance header asserting something **false and unfalsifiable** (`escapeAttribute` escaped `<` but not `>`, so an attribute value containing `>` closed the opening tag early while the soundness helper still reported the fence sound — `>` ends a tag, `<` only opens one); a THREAT-MODEL §4 cell that credited `test/shared/fence.test.ts` with pinning PT-14, whose clause is daemon-scoped (`design.md:528`); stale first-pass figures inside the record that was written to reconcile them; and an under-powered `Changes:` list. All four were corrected; the fix for the first is pinned by a case that fails without it (mutant evidence recorded). |
| Left open, queued to the Director | Two **pre-existing** defects with recommended backlog ids: the digest's discrete blind spots, including `history.length` saturating at `MAX_THREAD_HISTORY = 50` so a further peer reply can leave a byte-identical digest; and the fence body escape leaving `&` unescaped, so the fence is not injective. Both would change documented, ratified behaviour outside PR-06's change list, so neither was fixed inside a vendoring slice. |
| Consequence | **DN-05 is not satisfied for PR-06.** It is waived for this mission by the authority that owns it. The audit path was subsequently decided per slice by the same authority: PR-07a ran under the same substitute, recorded in `bus-v2-f1-pr-07a-audit-001`, and the path for PR-07b onward is planned in `HANDOFF.md` under the Director's session-9 delegation. |

## `bus-v2-f1-pr-07a-audit-001` — record (an audit-path decision, not a debate)

Not a row in the Debates table above, for the same reason as the PR-06 waiver: no Arena exchange
occurred, so there is no `CONSENSUS`/`ESCALATED` outcome to record. It is recorded so the governance
debt stays visible.

| Field | Value |
|---|---|
| Date | 2026-09-17 |
| Subject | PR-07a (`shared/tool-schemas.ts` + `shared/error-payload.ts`, both SEAM), merged as PR #9 (`535ce67`; code tip audited at `53d5aad`) |
| Authority | **The Director**, who owns DN-05 |
| Decision | Two questions were put to the Director **before any write**, as the handoff required. (1) **Audit path:** ODD + Judgment Day again — the `bus-v2-f1-pr-06-waiver-001` substitute — rather than `sdd-apply` (still refused by the host-owned native preflight, `extensions/gentle-ai.ts` ~L9255 → `lib/sdd-preflight.ts:896-926`, which an agent can neither satisfy nor fabricate) or the Arena tribunal (bridge down). (2) **PT-07's cell stays unannotated**, despite `tasks.md` 7a.6 asking for it: PT-07's assertion is bundle-level (`security/client-bundle`, design §14/§528 → PR-34/PR-40) and this slice pins only the constructor's *shape* half, so annotating it would repeat the PT-14 over-claim two PR-06 judges caught. |
| What was used instead | **Judgment Day** — two blind read-only judges over the frozen range `c971e25..dbb7494` with identical scope and criteria, a merged frozen ledger, a bounded correction round, a scoped re-judgment, a second bounded round for the defects the first round itself created, and a terminal re-judgment over `05ba773..53d5aad`. |
| Outcome | Round 1: `APPROVED`, 0 CRITICAL, 2 corroborated WARNINGs (both introduced, both fixed) plus 4 single-judge suggestions. Re-judgment 1: 0 CRITICAL, 4 fix-caused defects, all fixed. Re-judgment 2 (terminal): 0 CRITICAL, no behavioural regression, 3 record-arithmetic defects fixed and **1 contested-causality item escalated to the Director** because the round budget was exhausted and the judges disagreed on whether the earlier correction introduced it; the Director queued it as PR-07b's first correction. Terminal verdict **`JUDGMENT: APPROVED`** for `c971e25..53d5aad`. |
| Defects it caught | A PT-02 pin narrower than the threat-model cell credited it (it read the *base* schema, not the tool-visible refined one, and omitted `to_user_id` — proved with a deterministic zod probe that added `bot` to the refined schema and passed every assertion); a constructor JSDoc that contradicted design §10's client taxonomy and would have made PR-34 mark a transiently-down daemon permanent; a header claim its own paragraph did not support; and a record whose budget arithmetic was internally inconsistent twice over. |
| Left open, carried to the Director | `src/shared/constants.ts:3` pins a blind-stripped hash (`4ce5e514…`; the rule-conformant value is `039d53a2…`) — pre-existing from the PR-01b lineage, one judge, outside this slice's range. And design §12's reuse table still marks both v1 ranges **AS-IS** → a module that is SEAM by construction (`bus-v2-f1-tasks-001` items 1–2); reported rather than silently resolved because `design.md` is gated and audited. **Both closed 2026-09-17** by the post-merge integrity sweep under the Director's session-10 delegation: the pin is now `039d53a2…` with `4ce5e514…` the recorded strip control, and design §12 carries an appended amendment ([`bus-v2-f1-b19-repin-001`](#bus-v2-f1-b19-repin-001-record-an-integrity-change-not-a-debate), B-19 and B-20 `done`) |
| Consequence | **DN-05 is not satisfied for PR-07a either.** The Director owns the audit path for PR-07b and later slices. |

## `bus-v2-f1-pr-07b-audit-001` — record (an audit-path decision, not a debate)

Not a row in the Debates table above, for the same reason as the PR-06 waiver and PR-07a's record: no
Arena exchange occurred, so there is no `CONSENSUS`/`ESCALATED` outcome to record. It is recorded so the
governance debt stays visible.

| Field | Value |
|---|---|
| Date | 2026-09-17 |
| Subject | PR-07b (`shared/tool-output.ts`, SEAM, with its twin, one provenance entry and a carried D4 correction), merged as PR #10 (`bd3c6ed`; code tip `cec18ef`); audited range `a3b56c3..cec18ef` |
| Authority | **The Director**, who owns DN-05 |
| Decision | The path `HANDOFF.md` §2 had settled under the session-9 delegation, which the Director's session prompt adopted step by step: **ODD + Judgment Day** — the `bus-v2-f1-pr-06-waiver-001` substitute — not `sdd-apply` (still refused before child launch by the host-owned native preflight, `extensions/gentle-ai.ts` ~L9255 → `lib/sdd-preflight.ts:896-926`) and not the Arena tribunal (bridge down). Two questions were nonetheless put to the Director this session, and both were the Director's to answer: the **PR-scoped budget exception** (offered as disclose 495 · chain PR-07c for the shape half ≈449 · fit at ≈405 by under-disclosing the header — the Director chose the disclosed exception, which the audit then carried to 554), and the **delivery scope** (push + PR with the merge reserved). |
| What was used instead | **Judgment Day** — two blind read-only judges over the frozen range `a3b56c3..1b73722` with identical scope and criteria, a hash-bound merged ledger (`3ec3996a…`), one bounded correction round, and two scoped re-judgments (the second terminal) over the fix deltas. |
| Outcome | Round 1: **0 CRITICAL**; 2 WARNING + 2 SUGGESTION from each judge, disjoint except one finding both reached independently; all seven confirmed rows corrected in one bounded round (run on WARNING rows, following PR-07a's practice under the Director's settled route). Re-judgment 1: judge B verified all four of its rows; judge A returned `regression` on JD-A-002 — the row the fix belongs to — carrying no reason, as the native shape does not. Re-judgment 2 (terminal): **all eight rows `verified` from both judges**. Terminal verdict **`JUDGMENT: APPROVED`** for `a3b56c3..cec18ef`. |
| Defects it caught | A header clause attributing two exported functions to design §8.4, which mandates nothing of the kind; a twin that constrained no member of five declared output types, so deleting `LogEntry.basis` or narrowing `UnannouncedClosure.resolved_at` left the suite green; a digest assertion over a test-local literal that could not fail, against a gate that names digest rendering; a gated carried-findings note still describing D4 as live after it was closed; a fence case that restated PT-13's assertions and over-claimed its own title; a decorative round-trip assertion; and — in the fix round itself — a pin that used mutual assignability alone and silently tolerated a dropped optional member, caught by the fix's own mutant run and corrected. |
| Left open, carried to the Director | Two contradictions, reported rather than silently resolved because `design.md` is gated: its §12 row still marks `src/tools/fetch.ts:65-348` **AS-IS** over a module that is SEAM by construction (the same A4 class PR-07a reported), and `Conditions` has no shared home in design §2's file list, so the fetch output's carrier type is declared in `shared/tool-output.ts`. |
| Consequence | **DN-05 is not satisfied for PR-07b either.** The Director owns the audit path for PR-08 and later slices. |
| Independence from ordinary review | A separate, independent lifecycle also closed on this candidate: the ordinary native review (lineage `review-7a57283629321227`, one lens `review-reliability`, tier medium) returned **approved** and its authority was burned (`gentle-ai.review-acknowledged/v1`). It enables nothing here and Judgment Day consumed nothing from it; it left one advisory, non-blocking finding (`R3-tool-output-shape`), recorded as backlog **B-21** on the closure's own terms — never a reason to re-run review on that candidate. |

## `bus-v2-f1-b19-repin-001` — record (an integrity change, not a debate)

Not a row in the Debates table above: no Arena exchange occurred, so there is no `CONSENSUS`/
`ESCALATED` outcome to record. It is recorded so the change to a **hash-pinned artifact outside any
slice's frozen range** is traceable and so the governance debt stays visible.

| Field | Value |
|---|---|
| Date | 2026-09-17 |
| Subject | The post-merge integrity sweep after PR-07b: the `constants.ts` provenance re-pin (backlog B-19), the design §12 amendment (B-20) and the disposition of the review's advisory finding (B-21) |
| Authority | **The Director**, whose session-10 delegation ("toma las riendas … tienes toda mi autorización") authorized applying what the session judged appropriate and necessary, after PR-07a's audit reported B-19 as S1 and PR-07b's re-confirmed it |
| What changed | (1) `src/shared/constants.ts:3` re-pinned from the blind-stripped `4ce5e514…` to the rule-conformant `039d53a2…`, with `4ce5e514…` recorded as the strip control (`bus-v2-f1-pr-04-001`); PR-04's own conclusion that the wrong value was "honest" corrected in place, its frozen S1 row left as recorded with a closure note appended. (2) design §12 gained an **appended** amendment note: the three line-range-extract rows marked `AS-IS` ship as `SEAM` (`bus-v2-f1-tasks-001` items 1–2); the audited rows are untouched, so both the design and the shipped verdict survive on the record. (3) The review's advisory finding needed no code change: the declared-key pin at `test/shared/tool-output.test.ts:119-121` is complemented by a runtime witness for the mandatory key set at `:190-191` |
| Evidence | The pin was re-derived with two independent methods, both validated against the ratified fence value `68e241b2…`; the control reproduces the superseded value exactly. Build clean; `constants` + `provenance` focused run 8/8; full suite 175/175 and `test:static` 8/8 in the same session |
| Also repaired | `openspec/changes/f1-daemon-registry-thin-client/state.yaml` was **not valid YAML**: four of its values already carried `": "` inside a plain scalar — `tasks.gate` since the tasks phase (`0bdaf3e`), `delivery_strategy` and `attempt_ledger` afterwards, and `next_recommended` more recently — and a fifth, `apply.tribunal_state`, acquired one from this session's own appended sentence ("Slice budget: …"), which is why the repair and the addition landed together. No gate parses YAML strictly, so `gentle-ai sdd-status`, the only consumer, kept working while a standard parser rejected the whole document. All five values are now quoted; each was checked against its own raw text and each unquoted form was confirmed **rejected** by a strict parser (`tribunal_state`'s original 569 characters survive as an exact prefix of its new 911). The consumer still reports `apply`, 41/210, no blockers. No default changed |
| Audit instrument | **The ordinary native review was declined for this candidate** — the host resolved consent as `declined_this_candidate` (`lineage_created: false`, `mutation_performed: false`), so nothing was approved and no lineage exists for it. Receipt-driven Development's risk-gated path therefore applied with the candidate treated as high risk: the writer self-verified (the re-derivation above, the single-line diff readback, the full suite) **and an independent verifier ran** (`gentle-ai-verify`, read-only). It re-derived the pin with three methods of its own, diffed the 63 exported constants of `constants.ts` between HEAD and the candidate at runtime (identical), confirmed no other file moved and no hash-pinned body changed, and found the seven record defects this row and the change's own records now correct. **Judgment Day was deliberately not run**: no behavioural surface for a two-lens adversarial pass |
| Supersedes, without rewriting | Three rows in this file quote the superseded value (`4ce5e514…`) as verified, ratified or still-pinned: the PR-01b and PR-02 records, and the PR-07a record's carried-forward cell. Each was true when written and each is left exactly as recorded, with a closure note appended where it spoke in the present tense; this record supersedes the value alone |
| Consequence | B-19 and B-20 are `done` and B-21 is `decided` in [`../06-backlog/CHECKLIST.md`](../06-backlog/CHECKLIST.md). Nothing here authorizes delivery, and no SDD slice budget was consumed |

## Reserved: `bus-v2-referee-001`

Scope fixed by amendment A3 and backlog B-01–B-03: one optional referee per group with an explicit
rule set (registers tickets with mandatory labels, homologates state, blocks duplicates, re-work and
re-debate); precedent `FRISCO/frisco-erp/coordinador` (mechanical gate, writes nothing, authorizes
nothing, own ledger outside the tree); runs as a satellite package, never inside the bus core (Alpha
objection n1, ADR-06). Skill templates (B-02) are decided in the same debate; the ticket-ledger
location (B-03) after B-01. Not started; scheduled for F7.

## `bus-v2-f1-pr-08a-audit-001` — record (an audit-path decision, not a debate)

Not a row in the Debates table above, for the same reason as the PR-06 waiver, PR-07a's record and
PR-07b's: no Arena exchange occurred, so there is no `CONSENSUS`/`ESCALATED` outcome to record. It is
recorded so the governance debt stays visible.

| Field | Value |
|---|---|
| Date | 2026-09-17 |
| Subject | PR-08a (`shared/token-shape.ts` + `shared/project-file.ts`, each with its twin), merged as PR #11 (`1770f84`; code tip `ddfa1c3`); audited range `014f661..ddfa1c3` |
| Authority | **The Director**, who owns DN-05 |
| Decision | **ODD + Judgment Day**, the same substitute as PR-06, PR-07a and PR-07b, on the path `HANDOFF.md` §2 settled under the session-9 delegation — not `sdd-apply` (still refused before child launch by the host-owned native preflight: no `## SDD Session Preflight` block and no `.pi/gentle-ai/sdd-preflight.json` in this workspace, re-verified this session) and not the Arena tribunal (bridge down). Three questions were nonetheless the Director's to answer, and all three were genuinely open: the **re-slice of PR-08** (one PR with a 1,400-line exception · **two stacked PRs** · four file-boundary PRs · trimming tests), the **commit authorization** (commits were withheld until asked; push and PR were authorized with the merge reserved), and whether to **fold the four informational Judgment Day rows** into the correction round so that the re-judged tree would be the shipped tree (the Director folded all four). |
| What was used instead | **Judgment Day** — two blind read-only judges over the initial review tree `44ea9a1` with identical scope and criteria, a canonical frozen ledger (`28dd8e53bbb3c8a4213619e07e4e5db6531052b4e09b8b9fdd77b708cbae08ac`, hash-bound through the runtime's sorted-key `canonicalHash`), one bounded correction round dispatched to `jd-fix-agent`, and one scoped re-judgment over the fix diff. |
| Outcome | Round 1: **2 CRITICAL** — `JD-A-001` and `JD-B-001`, the same defect reached independently by both judges — plus 1 WARNING and 4 SUGGESTIONs. Correction `ddfa1c3` (five RED-first tests, four mutants killed) fixed the CRITICAL and folded four informational rows under the Director's decision (`JD-A-002`, `JD-B-002`, `JD-B-003`, `JD-B-004`). Re-judgment: **`JD-A-001 → verified`, `JD-B-001 → verified`**, no regression returned, so the second scoped round is unspent. Final verification **229/229** + `test:static` **8/8** at `ddfa1c3` → **`JUDGMENT: APPROVED`** for `014f661..ddfa1c3`. |
| Defects it caught | A document-derived **key** name was rendered verbatim into `ProjectFileProblem.field`, so a token pasted into key position instead of value position was **echoed** into the problem list — falsifying the module's own "value-free by construction" guarantee in exactly the channel PT-05 exists to keep clean, in a value the module documents as reaching operator terminals, pre-commit output and `doctor` (both judges, independently). Also: the loader accepted a PEM block or a `.env`-style assignment in a schema-valid field; a ~5k-deep document crashed the documented pre-commit path with a `RangeError` instead of returning a verdict; the `Authorization` literal was matched case-sensitively although RFC 9110 §5.1 makes field names case-insensitive; and this slice introduced a second exported `RosterEntry` in a layer that already had one. |
| Left open, carried to the Director | `JD-A-003`: the deliberate precedence of `unsupported_schema_version` over the content walk is documented in the module but unpinned by a test, filed as backlog **B-23**. And four advisory findings from the ordinary native review, filed as backlog **B-22** unactioned, on the closure's own terms. |
| Consequence | **DN-05 is not satisfied for PR-08a either.** The Director owns the audit path for PR-08b and later slices. The re-slice also means PR-08's remaining half — PR-08b: `roster-hash.ts`, the CLI, `EXIT_VALIDATION_FAILED` and the tsconfig wiring — is a **separate candidate** with its own verification, its own Judgment Day audit and its own review lifecycle. |
| Independence from ordinary review | A separate, independent lifecycle closed on this candidate: the ordinary native review (lineage `review-f644a39f445a2a0c`, one lens `review-reliability`, tier medium, 7 changed files, 1121 changed lines, correction budget 200) returned **approved** and its authority was burned (`gentle-ai.review-acknowledged/v1`). Its forecast — transport `pi_host_relay`, one model run — was relayed before the run was acknowledged. It enables nothing here and Judgment Day consumed nothing from it; its four advisory findings are non-blocking on the closure's own terms (none opened a correction, none reopens that review, and no correction transition was offered for that candidate). |

## `bus-v2-f1-pr-08b-audit-001` — record (an audit-path decision, not a debate)

Not a row in the Debates table above, for the same reason as the four records before it: no Arena exchange
occurred, so there is no `CONSENSUS`/`ESCALATED` outcome to record. It is recorded so the governance debt
stays visible.

| Field | Value |
|---|---|
| Date | 2026-09-17 |
| Subject | PR-08b (`shared/roster-hash.ts` + the CLI, `cli/validate.ts` and `cli/main.ts`, each with its twin), merged as PR #12 (`c345049`; code tip `a464a66`, record tip `71ff187`); audited range `72e09c0..a464a66` |
| Authority | **The Director**, who owns DN-05 |
| Decision | **ODD + Judgment Day**, the same substitute as PR-06, PR-07a, PR-07b and PR-08a. One question was the Director's this round: the **commit authorization** (commits withheld until asked, with the merge reserved). The fold of the informational rows into the correction applied the policy the Director had already chosen for PR-08a, and is disclosed as such rather than presented as a new decision. |
| What was used instead | **Judgment Day** — two blind read-only judges over the initial review tree `bc5beec` with identical scope and criteria, a canonical frozen ledger (`2ef778b4266cf0ff8af5d2c296497b3ed7f70c058a989715cf55329774910867`), one bounded correction round dispatched to `jd-fix-agent` (round 1 of 2), and one scoped re-judgment over the fix diff. |
| Outcome | Round 1: **1 CRITICAL**, 3 WARNINGs and 4 SUGGESTIONs — eight rows, two pairs of which are the same defect reached independently. Correction `a464a66` fixed the CRITICAL and folded four informational rows. Re-judgment: **`JD-B-001 → verified`**, no regression, so the second scoped round is unspent. Final verification **268/268** + `test:static` **8/8** at `a464a66`, with the emitted entry starting with `#!/usr/bin/env node` → **`JUDGMENT: APPROVED`** for `72e09c0..a464a66`. |
| Defects it caught | **`JD-B-001` (CRITICAL):** the package's sole `bin` target carried no shebang. ADR-0012 — status `inherited-valid (constitution-level: the governing rule)` — has a remediation table whose row 2 prescribes exactly `#!/usr/bin/env node` on line 1, "pinned by an assertion over the built bundle", and records the failure mode as *"exit 0 with zero bytes on both streams — the least diagnosable outcome"*; a POSIX pre-commit hook reads that silence as *clean*, so the PT-05 control could be bypassed with no signal. **No gate in this repository could see it** — CI runs `windows-latest` only, where npm's shim invokes node explicitly — and neither could the slice's own mutants, because a shebang is a packaging contract rather than behaviour. Also: the non-JSON path named a bot token for an `Authorization`-only document (both judges, independently); a test covering the raw-text scan **could not fail**; the roster-hash sort key was unpinned because the only multi-entry vector's two orderings agreed; and nine `design.md` citations were invalidated by this slice's own appended design row. |
| Left open, carried to the Director | `JD-A-002`: the bare `conmuta validate` narrowing, now disclosed as a deviation from the requirement's spelled surface (and made honest in the usage text, which a test pins). Backlog **B-22** (PR-08a's four advisory review findings) and **B-23** (`JD-A-003`). |
| Consequence | **DN-05 is not satisfied for PR-08b either**, and PR-08 is now complete in two audited halves. The Director owns the audit path for PR-09 and later slices. |
| Independence from ordinary review | The ordinary native review was **declined for this candidate** — `declined_this_candidate`, `lineage_created: false`, `mutation_performed: false`, no mutation, risk tier **high** on `process_boundary` (its own child-process integration test). It is recorded as a **decline, never as a closure**, and that candidate was not re-reviewed. The prescribed Receipt-driven Development fallback ran instead: writer self-verification plus a separate independent `gentle-ai-verify` pass over the frozen candidate, which reproduced every figure and found **five record defects and one observation**, and whose focused re-check of that correction found **two more defects the correction itself had introduced** — all eight corrected and logged in the record's correction note. |

## `bus-v2-f1-pr-09a-audit-001` — record (an audit-path decision, not a debate)

Not a row in the Debates table above, for the same reason as the five records before it: no Arena exchange
occurred, so there is no `CONSENSUS`/`ESCALATED` outcome to record. It is recorded so the governance debt
stays visible.

| Field | Value |
|---|---|
| Date | 2026-09-17 |
| Subject | PR-09a (`registry/schema.ts` + `registry/invariants.ts` + the new `registry` compile unit + the shared roster-entry schema export, each with its twin), on branch `f1/09-registry`; audited range `e177c58..2279c15`. PR-09 was re-sliced at apply time into PR-09a and PR-09b because the whole measured 1,570 authored lines against a ≈380 estimate. |
| Authority | **The Director**, who owns DN-05 |
| Decision | **ODD + Judgment Day**, the same substitute as PR-06, PR-07a, PR-07b, PR-08a and PR-08b. Two questions were the Director's this round: the **over-budget packaging** (a re-slice into two audited halves rather than one 1,570-line PR, or one exception of 1,170) and the **round-1 correction** the skill mandates asking about — the judges disagreed on severity for the same defect, one CRITICAL and one WARNING, and it was authorized in full (severe batch plus the informational folds). |
| What was used instead | **Judgment Day** — two blind read-only judges over the initial review tree `b096b65` with identical scope and criteria and the slice's own record in scope, a canonical frozen ledger (`664687b3432787af6e2521b1aa001e36b99e2e2a72dce4815762b8be3363d4c2` for the one authorized severe row), one bounded correction round dispatched to `jd-fix-agent` (round 1 of 2), and **two** scoped re-judgments because the first returned a contradiction. |
| Outcome | Round 1: **13 rows — 1 CRITICAL, 4 WARNING, 8 SUGGESTION**, of which four pairs are the same defect reached independently. `3508243` fixed the CRITICAL and folded the eight informational rows. The first scoped re-judgment **contradicted itself** (`verified` vs `regression`); the cause was measured rather than argued — the mutant sweep found **two mutants surviving, both introduced by the correction** — and `010ed85` corrected them. The terminal re-judgment resolved **`JD-B-001 → verified`** on both judges. Final verification **304/304** + `test:static` **8/8** at `010ed85` → **`JUDGMENT: APPROVED`** for `e177c58..2279c15`. |
| Defects it caught | **`JD-B-001` (CRITICAL), corroborated:** `bindings[].roster_snapshot` inherited only the *entry* shape of `conmuta.json`'s roster, not the roster-level rules DATA-MODEL §1 attaches to the array (`agent_id` unique, `user_id` unique) — so a hand-edited registry could repeat an `agent_id` or map two agents to one `user_id`, and R3's first-match lookup made the verdict depend on entry order, in a file that is the daemon's admission source while no client is connected (D-07). Also: the fixture pinned the *two-entry* roster-hash vector into a *one-entry* snapshot, so every "valid registry" in the suite was internally inconsistent and nothing tied `roster_hash` to its snapshot (both judges; **B-29**); `projects[].path`'s "absolute" rule was documented, unenforced, unpinned and unreported (both judges); a malformed document reported up to nine byte-identical shape problems; the record credited the twin walk to a test glob that cannot run it; "3.9×" conflated the ratio to the estimate with the ratio to the budget; the strictness guarantee had no unknown-key case at three of the four levels it names; and an exported fixture helper had no caller in this half. |
| Defects the fix itself introduced | The first scoped re-judgment's `regression` was real: the uniqueness rule re-masked the drift pin (a looser entry declaration changed no verdict again, because every rejected entry repeated the leading entry's `agent_id`) and the new problem-collapsing function shipped with **no test that could fail** when removed. Both were corrected in `010ed85` and both are pinned by mutants now. |
| Left open, carried to the Director | **B-26** (PT-25's owner is attributed differently by two gated documents; PR-09b fills only the registry-side half and states the split), **B-27** (the shared token regex matches this project's own `sha256:` roster hash, so R5 would refuse every valid registry — PR-09b works around it at the call site and the root cause needs a decision), **B-28** (no R1–R6 row demands referential integrity) and **B-29** (`roster_hash` is not tied to its snapshot at load time). |
| Consequence | **DN-05 is not satisfied for PR-09a either.** The Director owns the audit path for PR-09b and later slices. |
| Independence from ordinary review | The ordinary native review was **declined for this candidate** — `declined_this_candidate`, `lineage_created: false`, `mutation_performed: false`, no mutation, risk tier **medium** on 12 changed files and 1,587 changed lines, correction budget 0. It is recorded as a **decline, never as a closure**, and that candidate was not re-reviewed. The prescribed Receipt-driven Development fallback ran instead: `assess` reported risk **unassessable** (the native assessment was schema-incompatible) and the plan *"the writer self-verifies and a separate independent verifier always runs"*. The independent `gentle-ai-verify` pass reproduced every headline figure — 304/304, 8/8, 75/75, the 1,256/20 budget, the twin walk, the provenance registry at 11 entries, and the `M4`/`M6`/`M7` kills — and found **eleven record defects** (`F1`–`F11`), including two of the writer's own figures (a cancelling pair of per-file line counts, and a test count that was computed rather than measured). All eleven are corrected and logged in the record. |

## `bus-v2-f1-pr-09b-audit-001` — record (an audit-path decision, not a debate)

Not a row in the Debates table above, for the same reason as the six records before it: no Arena exchange
occurred, so there is no `CONSENSUS`/`ESCALATED` outcome to record. It is recorded so the governance debt
stays visible.

| Field | Value |
|---|---|
| Date | 2026-09-17 |
| Subject | PR-09b (`registry/loader.ts` + its twin, and `addSecondBinding` restored in `test/registry/fixtures.ts`), branch `f1/09b-registry-loader` from `main` @ `11c6af4`; audited range `11c6af4..18ec622`. It closes task row PR-09, the second half of the PR-09 re-slice. |
| Authority | **The Director**, who owns DN-05 |
| Decision | **ODD + Judgment Day**, the same substitute as the previous six slices. One question was the Director's this round beyond the standing delegation: the **round-1 correction**, because the only CRITICAL was a *single-judge* row (the skill says record such a row as suspect rather than auto-fix it). The Director authorized the full batch after the writer reproduced the defect deterministically. |
| What was used instead | **Judgment Day** — two blind read-only judges over the frozen tree `88a0c52`, identical scope and criteria, one bounded correction round dispatched to the writer (the fix actor's dispatch is graded by the CLI and was rejected twice in the previous slice for its ID and hash rules, so the writer applied this batch and it is disclosed as such), and one scoped re-judgment over the fix delta. |
| Outcome | Round 1: **12 rows — 1 CRITICAL, 6 WARNING, 5 SUGGESTION**, with two pairs reached independently. The CRITICAL was fixed in `e11bfaa` along with eight informational folds; `JD-A-003` and `JD-B-006` were reported as backlog **B-30** and **B-31** instead of coded. The terminal scoped re-judgment resolved **`JD-A-001 → verified`** on both judges. Final verification **328/328** + `test:static` **8/8** + focused **60/60** at the frozen tip → **`JUDGMENT: APPROVED`** for `11c6af4..e11bfaa`. |
| Defects it caught | **`JD-A-001` (CRITICAL, single judge, reproduced by the writer):** the R5 raw-text exemption's mask took `sha256:` plus 64 hexadecimal characters, and a token's own digit run could *complete* those 64 — `sha256:` + hex + `<bot id>:<secret>` — so the mask swallowed the digits and left `:<secret>`, which no longer matches `\d+:`; the document loaded with a real token inside it, and the module's own soundness proof was false. The fix bounds the mask so a token's colon can never be swallowed. Also: `registry_invalid` latched forever after a timestamp-preserving restore (both judges); a UTF-8 BOM from PowerShell made a valid registry `invalid_json`; the "fingerprint only for a file that parsed" guarantee had no test that could fail and two mutants survived it; the restored fixture wrote `C:\work\second` with single backslashes; and this slice's record regressed the `test:static` attribution PR-09a's round 1 had already corrected. |
| Left open, carried to the Director | **B-26** (PT-25's owner; PR-09b names only the half it pins and states the split), **B-27** (the shared token regex matches the project's own `sha256:` roster hash), **B-28** (no invariant demands referential integrity), **B-29** (`roster_hash` not tied to its snapshot at load time), and now **B-30** (R5's strictness refuses free-form human text such as a group `title` reading `Authorization review`), **B-31** (a JSON-escaped colon bypasses the raw-text scan) and **B-32** (the review's four advisory findings). |
| Consequence | **DN-05 is not satisfied for PR-09b either**, and row PR-09 is complete in two audited halves (11 of the 45 rows done, delivered as 14 PRs). |
| Independence from ordinary review | This candidate's ordinary native review **closed approved** — lineage `review-c5a6b9c191154861`, one lens (`review-reliability`), risk tier medium, 7 changed files, correction budget 200; the exact acknowledgement was executed and the envelope reports `authority: burned`. Its four findings are all SUGGESTION and explicitly non-blocking, recorded as **B-32** and not actioned. Approval is informational and authorizes no delivery. |

## `bus-v2-f1-pr-10-audit-001` — record (an audit-path decision, not a debate)

Not a row in the Debates table above, for the same reason as the seven records before it: no Arena exchange
occurred, so there is no `CONSENSUS`/`ESCALATED` outcome to record. It is recorded so the governance debt
stays visible.

| Field | Value |
|---|---|
| Date | 2026-09-17 |
| Subject | PR-10 (`src/ledger/schema.ts` + `src/ledger/transaction.ts` with twins, the `ledger` compile unit's wiring, and PT-10's cell), branch `f1/10-ledger-schema-spike` from `main` @ `3534739`; audited range `3534739..4951fc6`, shipped tip `fcf5086`, merged as PR **#15** (`daad417`). It opens task row PR-10, the first of the four `ledger` rows. |
| Authority | **The Director**, who owns DN-05 |
| Decision | **ODD + Judgment Day**, the same substitute as the previous seven slices. Two questions were the Director's beyond the standing delegation: the **round-1 batch** (six corrected self-claims plus five new pins, presented with its line cost) and the **round-2 bounded fix** after a scoped re-judgment returned a regression. |
| What was used instead | **Judgment Day** — two blind read-only judges over the frozen tree `0c9d239`, identical scope, criteria and skill paths, a Director-authorized correction batch applied by the writer, one final bounded fix round, and two scoped re-judgments over the fix deltas (`0c9d239..aa65b25` and `aa65b25..4951fc6`). |
| Outcome | Round 1: **13 rows — 0 BLOCKER, 0 CRITICAL, 7 WARNING, 6 SUGGESTION**, two of them reached independently by both judges. The batch corrected six false statements the slice made about itself and added five pins. The scoped re-judgment then returned ten `verified` on judge A and six on judge B, with **`JD-B-007` a `regression` from both, independently** — the only row neither judge would accept, and the row whose fix this slice had written itself. Round 2 moved the refusal **before `BEGIN`**; the terminal scoped re-judgment resolved `JD-B-007 → verified` on both judges → **`JUDGMENT: APPROVED` for `3534739..4951fc6`**. |
| Defects it caught | **Six statements the slice made about itself were false.** (1) Both modules claimed "design §12 has no row naming `ledger/*`"; `design.md:452` names it with verdict **REPLACED** (the conclusion — no provenance header — stood, the premise did not). (2) `transaction.ts` justified not spelling the provenance token with a hazard that cannot apply to a module beginning with an import. (3) `schema.test.ts` claimed its digit runs sat outside PT-22's 8–10 digit window; `100000001` and `1700000000` are inside it, and the file is safe because the pattern needs a colon plus 35 token characters (both judges). (4) A `PT-27` citation where the rule is **ADR-0027** (both judges). (5) The recorded spike verdict stated "a failed statement inside a transaction leaves it open" as a general fact; it holds for constraint failures only — SQLite's auto-rollback classes close the transaction themselves (measured: errcode 13 leaves `isTransaction` false). (6) The suite promised a control for both text-level checks and had one. **Five pins were missing:** the per-table `NOT NULL` inventory; `updates.seq`'s monotonicity across the retention delete (measured `3 → 1` without `AUTOINCREMENT` — a redelivered update could be written below a client's cursor and never surfaced, the I-3 loss PT-10 exists to prevent); the DDL's refusal of a second application; SQLite's auto-rollback class, where the catch guard is the only thing keeping the caller's own error; and the thenable refusal. **The regression both judges found:** round 1's refusal of an async callback happened *after* calling it, so a tail after an `await` still ran on the live connection with `isTransaction === false` and autocommitted — the caller got an error *and* a silently half-applied batch. Reproduced by the writer before it was believed, then corrected by moving the refusal before `BEGIN`. |
| Left open, carried to the Director | Nothing new from the round itself. **B-33** was filed from the slice's own discovery (a non-vendored module that begins with its doc comment must not spell `provenance.test.ts`'s header token), and one observation is carried in the handoff: a `gentle_review` risk signal (`process_boundary`) can be a false positive. B-26 to B-32 stand as PR-09 left them. |
| Consequence | **DN-05 is not satisfied for PR-10 either**, and row PR-10 is complete: **12 of the 45 rows are done, delivered as 15 PRs**. |
| Independence from ordinary review | This candidate's ordinary native review **declined** it (`consent-declined-this-candidate`, `lineage_created: false`, no mutation, `correction_budget: 0`, risk read as high on a `process_boundary` signal that is measurably a false positive — the module has no imports and its only `exec` occurrences are `node:sqlite`'s `db.exec` named in prose). A declined candidate is never re-reviewed, so the RDD risk-gated path ran instead: writer self-verification plus a **separate independent verifier**, which reproduced every claim of the record and found three defects (`F1` a generator callback bypassing both refusals, `F2` the unpinned rejection half of the settling guarantee, `F3` a stale unmarked figure), all corrected and re-checked by that verifier at the corrected tip. Approval would authorize no delivery either; delivery stayed under the Director's word and ordinary repository policy. |

## `bus-v2-f1-pr-11-audit-001` — record (an audit-path decision, not a debate)

Not a row in the Debates table above, for the same reason as the eight records before it: no Arena exchange
occurred, so there is no `CONSENSUS`/`ESCALATED` outcome to record. It is recorded so the governance debt stays
visible.

| Field | Value |
|---|---|
| Date | 2026-09-17 |
| Subject | PR-11 (`src/ledger/open.ts` + `src/ledger/migrations.ts` with twins, the unit's `tsconfig.json` reference, and a corrupt fixture), branch `f1/11-ledger-open-migrations` from `main` @ `ab6dbf1`; audited range `ab6dbf1..8392b1c`, corrected tips `5ead74e`, `b69a921` and `19ff8a5`, record tip `4d207df`, merged as PR **#16** (`50c506a`). It opens task row PR-11, the second of the four `ledger` rows. |
| Authority | **The Director**, who owns DN-05 |
| Decision | **ODD + Judgment Day**, the same substitute as the previous eight slices. The Director's session-wide delegation covered the round-1 batch and the round-2 correction and asked that the session not stop for authorizations, so the batch, its size and its line cost are disclosed in `apply-progress.md` §PR-11 and in the PR body instead of in a per-batch question. |
| What was used instead | **Judgment Day** — two blind read-only judges over the frozen tree `judgment-11` (`8392b1c`), identical scope, criteria and skill paths and a frozen 11-row ledger (canonical SHA-256 `d0b078f4639f967811a6ba8c97fbfd04c99ff9d4dc90d5c602a919ea5c140c50`), one writer-applied correction batch, one scoped re-judgment, one bounded round-2 correction and one terminal scoped re-judgment (the round budget of two, fully used). |
| Outcome | Round 1: **11 rows — 0 BLOCKER, 1 CRITICAL, 5 WARNING, 5 SUGGESTION**, and **three defects were reached independently by both judges** (`JD-A-002`/`JD-B-001`, the unpinned non-throwing half of the corruption decision; `JD-A-003`/`JD-B-002`, a same-millisecond quarantine collision that destroyed the earlier copy; `JD-A-006`/`JD-B-003`, the compiler-claim note). The batch corrected four defects and three false self-statements, and each correction's mutant now dies on the test the correction added (`M12`–`M15`). The scoped re-judgment returned **nine `verified` and two `regression`** — both found by judge A and both accepted. Round 2 corrected the clause and landed the record and the size exception, and its terminal scoped re-judgment **split**: on `JD-A-006`/`JD-B-003` one judge resolved `regression` and the other `verified` while both measured the same facts, and on `JD-A-007` judge A resolved `verified` while judge B found two further defects *inside* the record. With no severe row surviving and the final verification green, the controller recorded **`JUDGMENT: APPROVED` for `ab6dbf1..b69a921`**, with the surviving SUGGESTION-class rows escalated and their corrections disclosed as measurement-checked but not judge-re-judged. |
| Defects it caught | **One CRITICAL, four warnings and three false self-statements, every one of them reproduced by the writer before it was believed.** (1) The `CRITICAL`: the module promised that a non-corruption `quick_check` failure propagates instead of quarantining, and **no test could fail if that promise were broken** — the test named for the rule never reached the decision, because `new DatabaseSync` throws for a directory first; under the mutant a healthy ledger holding the user's row is renamed to `ledger.corrupt-<ms>.db`. Two reachable cases now pin it (`SQLITE_BUSY` from a second writer, `SQLITE_CANTOPEN` from a directory where the `-wal` belongs). (2) The non-throwing half of the corruption decision — SQLite answering `quick_check` with a row instead of throwing — was unpinned too; it is now pinned with a single-byte flip of the header's first reserved byte plus a control proving the damage is the reported kind. (3) Two quarantines with the same `now()` destroyed the first set-aside file, against the module's own "never overwritten" and the spec's "never delete the corrupt file"; a taken name is now refused with a named constant. (4) The stamp's *value* above version 1 was unpinned (a literal `1` kept the suite green). **Three false statements the slice made about itself:** the primary-code mask does not make the probe catch index damage (`quick_check` does not verify index content at all — measured over an index tree), an unused project reference is legal and TS18003 is not what a referencing unit reports, and SQLite removes the `-wal`/`-shm` siblings on the **close**, not on the open. **And one regression the correction itself introduced, caught by the re-judgment:** round 1's replacement clause asserted a *new* false compiler constraint, which round 2 replaced with a third version that still misnamed the discriminator (the `references` entry, not composite-ness) — three iterations of one sentence, which is the clearest lesson this audit left. |
| Left open, carried to the Director | **B-34** (new): the false `TS18003` wording still stands in `src/cli/tsconfig.json:10` and `src/registry/tsconfig.json:12`; this slice would not edit files of audited slices, and corrected the handoff's own copy at close. **Two SUGGESTION-class rows survive the second round on split verdicts** (`JD-A-006`/`JD-B-003` and, from the re-judge's own objection, the record's severity tally and its missing native-review pointer); their corrections are applied and measurement-checked but **not judge-re-judged**, because the round budget is two and no third round exists — they are recorded for the Director to disposition and block nothing in PR-12. Three boundaries are stated rather than filled: `quick_check` is not an integrity check, two of the three PRAGMA assertions cannot discriminate their own statement, and the quarantine collision refusal is a deliberate behaviour deviation. B-22 to B-33 stand as PR-10 left them. |
| Consequence | **DN-05 is not satisfied for PR-11 either**, and row PR-11 is complete: **13 of the 45 rows are done, delivered as 16 PRs**. |
| Independence from ordinary review | This candidate's ordinary native review **declined** it — and this time the decline was **host-resolved**: the START returned `consent-declined-this-candidate` with no consent envelope ever reaching the session (`lineage_created: false`, `mutation_performed: false`, `correction_budget: 0`, 8 changed files / 1,586 changed lines, risk tier medium). No consent was invented and none was answered. One of the two `risk_evidence` lines is a false positive from a Markdown file ("an executable change in `openspec/changes/f1-daemon-registry-thin-client/apply-progress.md`" — the record, which contains code fences), recorded as an observation about the signal, not as a finding about the code. A declined candidate is never re-reviewed, so the RDD risk-gated path ran: `assess` returned risk **`unassessable`** (the native assessment failed `schema incompatible`, which its own rule treats as high risk) and a plan of writer self-verification plus a **separate independent verifier**. That verifier re-derived the record's claims rather than reading them — the frozen ledger hash and its 1/5/5 tally, the suite counts by running them at three tips, the diff mechanics of every round, six quarantine probes, ten migration probes, the stated limits and its own `tsc` matrix — and found **eight defects, all of them in the record's own numbers and pointers**, all corrected in the commit that claims they are corrected. Approval would have authorized no delivery either; delivery stayed under the Director's word and ordinary repository policy. |

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
