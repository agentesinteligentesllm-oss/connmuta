# AGENTS.md — session bootstrap for agents working on this repository

> **Working name.** "Conmuta" is a working name pending trademark clearance (B-11 in
> [`docs/06-backlog/CHECKLIST.md`](./docs/06-backlog/CHECKLIST.md); fallback "Emisario").

**Scope of this file.** It bootstraps an AI agent that edits, audits or plans *this repository*.
It is **not** the end-user bus protocol: the `AGENTS.md` that the installer will write into a user's
project (decision D5 of the landing debate, phase F2) is a different document, produced later as a
template. v1's equivalent of that end-user document is `docs/AGENT-GUIDE-using-the-bus.md` in the
`telegram-agent-bus` repository.

**Status.** F1 `apply` in progress: PR-01a, PR-01b, PR-02, PR-03, PR-04, PR-05, both re-sliced PR-06 slices (PR-06a `shared/fence.ts` SEAM D-15, PR-06b `shared/protocol-select.ts` SEAM), PR-07a (`shared/tool-schemas.ts` SEAM + `shared/error-payload.ts` SEAM), PR-07b (`shared/tool-output.ts` SEAM + twin, plus the carried D4 correction) and both apply-time PR-08 slices (PR-08a `shared/token-shape.ts` + `shared/project-file.ts`, PR-08b `shared/roster-hash.ts` + the CLI `cli/{main,validate}.ts`) and PR-09a (`src/registry/{schema,invariants}.ts` + the shared roster-entry and roster-uniqueness exports), PR-09b (`src/registry/loader.ts` + its twin) and PR-10 (`src/ledger/{schema,transaction}.ts` + the unit's build wiring) and PR-11 (`src/ledger/{open,migrations}.ts`: the open sequence with quarantine and the forward-only `{ to, up }` migrations, D-21) and PR-12 (`src/ledger/{inbox,threads,cursors}.ts`: the write-ahead poll-batch transaction, the `ThreadRecord` adapter and the per-client cursors, PT-10 + PT-11, D-19) and PR-13 (`src/ledger/{audit,unknown-senders,conditions-store,retention}.ts`: the unit's single bodiless `audit_log` writer with the token guard, the pending unknown-sender upsert, the `(scope, name)` condition store and the retention sweep with its schedule and the open-thread backlog, PT-20) and PR-14 (`src/secret-store/{types,keyring,file-fallback,redaction,index}.ts` with five twins) and PR-15 (`src/daemon/{node-floor,home,log}.ts`, `src/daemon/lifecycle/{lock,run-file}.ts` with 6 twins) and PR-16 (`src/daemon/lifecycle/{heartbeat,idle}.ts`, `src/daemon/{bootstrap,main}.ts` with 5 twins) and PR-17 (`src/cli/daemon-stop.ts`, `src/cli/main.ts`, `src/cli/tsconfig.json` with twins `test/cli/daemon-stop.test.ts`, `test/cli/main.test.ts`), PR-18 (`src/daemon/telegram.ts` part 1 with twin), PR-19 (`src/daemon/telegram.ts` part 2 with twin), PR-20 (`src/daemon/transport/{types,group,direct,dual}.ts` AS-IS with twins) and PR-21 (`src/daemon/transport/room-guard.ts`, `src/daemon/binding-config.ts`, `src/daemon/bindings.ts` with twins) and PR-22a (`src/daemon/admission.ts`, the seven-step admission pipeline, PT-03, PT-04, PT-16, PT-17, PT-31, with twin) and PR-22b (`src/daemon/poller.ts`, the poller loop that consumes `admission.ts`, PT-33 poller half; invariant 3, with twin) and PR-23 (`src/daemon/serve/fetch.ts`, D-02 long-poll against the ledger, D-15 fence site) and PR-24 (`src/daemon/serve/status.ts`) and PR-25 (`src/daemon/serve/thread.ts`, PT-13, PT-14; closes unit 7 `durable-inbox`) and PR-26 (`src/daemon/send/validate.ts`, PT-02 half, PT-15) and PR-27 (`src/daemon/send/send-path.ts`, the room pre-check and `BindingMutex`, PT-01 unit half, PT-25 send half) and PR-28 (`src/daemon/send/rate.ts`, PT-33 send half; closes unit 8 `send-path`) merged (`main` = scaffold, CI, static gates, `src/shared/{constants,version,envelope,secrets,thread-record,protocol-apply,protocol-select,fence,tool-schemas,error-payload,tool-output,token-shape,project-file,roster-hash}.ts` with twins, `src/cli/{main,validate,daemon-stop}.ts` with twins, `src/registry/{schema,invariants,loader}.ts` with twins, `src/ledger/{schema,transaction,open,migrations,inbox,threads,cursors,audit,unknown-senders,conditions-store,retention}.ts` with twins, `src/secret-store/{types,keyring,file-fallback,redaction,index}.ts` with twins, `src/daemon/{node-floor,home,log,bootstrap,main,telegram,binding-config,bindings,admission,poller}.ts` and `src/daemon/lifecycle/{lock,run-file,heartbeat,idle}.ts` with twins, `src/daemon/transport/{types,group,direct,dual,room-guard}.ts` with twins, `src/daemon/serve/{fetch,status,thread}.ts` with twins, `src/daemon/send/{validate,send-path,rate}.ts` with twins, `test/security/provenance.test.ts` + its 23-entry registry; **801 tests** (800 pass, 1 skip), **144/210 tasks**, **29 of the 42 row ids merged** (34 of the 45 PR blocks)). Next slice **PR-29** (the IPC contract and HTTP server scaffolding; opens unit 9 `ipc-handshake`) in `openspec/changes/f1-daemon-registry-thin-client/tasks.md`. Every PR is audited by Alpha before it opens (DN-05) — **waived by the Director for PR-06** (`bus-v2-f1-pr-06-waiver-001`) and **substituted by Judgment Day for PR-06, PR-07a, PR-07b, PR-08a, PR-08b, PR-09a, PR-09b, PR-10, PR-11, PR-12, PR-13, PR-14, PR-15, PR-16, PR-17, PR-18, PR-19, PR-20 and PR-21** — and, for **PR-22a and PR-22b**, substituted by **inline adversarial audits**: the two blind judges were unavailable (`jd-judge-a`, `jd-judge-b`, `gentle-ai-explore` and `gentle-ai-worker` each returned `assistant reported an error`) and `bus-v2-f1-pr-22a-audit-001` and `bus-v2-f1-pr-22b-audit-001` disclose that the two adversarial passes ran in the writing session instead ** (`bus-v2-f1-pr-07a-audit-001`, `bus-v2-f1-pr-07b-audit-001`, `bus-v2-f1-pr-08a-audit-001`, `bus-v2-f1-pr-08b-audit-001`, `bus-v2-f1-pr-09a-audit-001`, `bus-v2-f1-pr-09b-audit-001`, `bus-v2-f1-pr-10-audit-001`, `bus-v2-f1-pr-11-audit-001`, `bus-v2-f1-pr-12-audit-001`, `bus-v2-f1-pr-13-audit-001`, `bus-v2-f1-pr-14-audit-001`, `bus-v2-f1-pr-15-audit-001`, `bus-v2-f1-pr-16-audit-001`, `bus-v2-f1-pr-17-audit-001`, `bus-v2-f1-pr-18-audit-001`, `bus-v2-f1-pr-19-audit-001`, `bus-v2-f1-pr-20-audit-001`, `bus-v2-f1-pr-21-audit-001`) because the Arena bridge is down. **DN-05 is unsatisfied for all twenty.** PR-23, PR-24 and PR-25 (session 27) returned to Judgment Day **with both blind judges running** (`bus-v2-f1-pr-23-audit-001`, `bus-v2-f1-pr-24-audit-001`, `bus-v2-f1-pr-25-audit-001`), each **APPROVED**, each with a separate independent verifier; DN-05 is unsatisfied for them too. Session 27 also repaired PR-22b's unwritten close-out (`bus-v2-f1-pr-22b-audit-001`) and filed B-40 and B-41. PR-26, PR-27 and PR-28 (session 28) ran the same route (`bus-v2-f1-pr-26-audit-001`, `bus-v2-f1-pr-27-audit-001`, `bus-v2-f1-pr-28-audit-001`), each **APPROVED** after one scoped re-judgment; PR-28 produced the change's first rows reported by **both** judges, corrected in the slice; DN-05 is unsatisfied for them too. Session 28 filed B-42 to B-46. PR-08 was re-sliced at apply time into PR-08a/PR-08b (real diff 1,400 authored lines against the 400-line budget; 748 to 954 with its own correction, and 671 to 772 with its). PR-09 was re-sliced at apply time into PR-09a/PR-09b: the whole measured 1,570 authored lines against a ≈380 estimate, and PR-09a landed at 1,266 with a disclosed 866-line PR-scoped exception. PR-10 — the ledger's version-1 DDL and the `node:sqlite` transaction spike — landed at 1,357 authored lines with a disclosed 957-line PR-scoped exception, moved four times by its own Judgment Day rounds and by the independent verifier that followed its declined native review; it is the first PR whose reviewed claims the review's own replacement had to correct twice. PR-11 — the ledger's open sequence with quarantine and its forward-only migrations, plus a corrupt fixture — landed at 1,276 authored lines with a disclosed 876-line PR-scoped exception, and its Judgment Day used **both** rounds: one CRITICAL that no test could fail (a boundary the module promised while the test named for it never reached the decision), three defects both judges reached independently, and two SUGGESTION-class rows surviving the second round on **split verdicts**, their corrections disclosed as measurement-checked but not judge-re-judged. Its ordinary native review was declined **by the host** (no consent envelope reached the session) and the RDD fallback's separate independent verifier found eight defects, every one of them in the record's own numbers and pointers, all corrected before the commit that claims them. PR-12 — the ledger's write-ahead poll-batch transaction, its `ThreadRecord` adapter and its per-client cursors — landed at 2,064 authored lines with a disclosed 1,664-line PR-scoped exception, and its Judgment Day used **both** rounds: two CRITICALs (a digest erased by a caller forwarding an optional value, and a test named for the transaction that could not fail for its name), three defects both judges reached independently across five row ids, and a SUGGESTION-class row, `JD-B-008`, surviving both rounds because each correction re-installed a defect of the class it was fixing — its corrections disclosed as measurement-checked but not judge-re-judged. Its ordinary native review **closed APPROVED** (host-resolved consent, one `review-reliability` lens, authority burned) with three advisory findings filed as B-36, and the independent verifier it ran anyway found eight defects, all of them in the record's prose and none in the shipped bytes. PR-13 — the ledger's single bodiless `audit_log` writer, the pending unknown-sender upsert, the `(scope, name)` condition store and the retention sweep — landed at 2,268 authored lines with a disclosed 1,868-line PR-scoped exception, and its Judgment Day used **both** rounds plus two further corrections disclosed as outside the budget: three CRITICALs (a token-shaped `conditions.scope` accepted, stored and present in the ledger file through a public API with no cast; a text `MAX` over `last_seen_at` that let a 500 ms-later sighting fail to advance it and an offset-form instant move it backwards; and a compensation claim of a receive-side secret scan for `updates.body` that does not exist anywhere in F1), four warnings and four suggestions, every one reproduced by the writer. Its first scoped re-judgment returned **8 verified / 3 regression from both judges independently**, and the proof was that **the dispositions had never been committed** — the fix delta contained no `openspec/**`, so the re-judgment could not see them; the second returned **9 verified / 2 regression**, `JD-A-001` verified, with the two survivors again figures the previous correction had installed. That is this slice's lesson: **a correction is a claim about a file, and every figure about that file is suspect until it is re-measured.** Its ordinary native review was **declined by the host** (`consent-declined-this-candidate`, `lineage_created: false`, `correction_budget: 0`) and the RDD fallback's `assess` returned `unassessable` with the decline stated, so the high-risk path ran: the independent verifier reproduced every figure, re-ran the 13-mutant sweep itself at three tips (13 killed / 0 survived), wrote 51 probes for the code claims and found **no finding in the shipped source logic** — and two prose defects, one of them in `src/ledger/retention.ts`, which is why the fourth correction moved the shipped bytes and the verification was re-run after it. PR-14 — the OS keyring, the ACL'd fallback file and the shared redactor (PT-09, PT-19) — landed at 1,087 authored lines (386 src + 701 test) with a disclosed 687-line PR-scoped exception, 6 findings all 100% verified in Round 1, 0 survivors; merged as PR #19 (`9cc35ff`). PR-15 landed at 1,008 authored lines with a disclosed 608-line PR-scoped exception, 10-mutant sweep killed 10/10; merged. PR-16 landed at 1,056 authored lines with a disclosed 656-line PR-scoped exception, 8-mutant sweep killed 8/8; merged. PR-17 — `conmuta daemon stop` (D-29) — landed at 378 authored lines within budget without exception, 7-mutant sweep killed 7/7; merged as PR #20 (`c7ab4f4`). PR-18 — `src/daemon/telegram.ts` part 1 — landed at 386 authored lines within budget, 8-mutant sweep killed 8/8; merged as PR #21 (`4e71cab`). PR-19 — `src/daemon/telegram.ts` part 2 (PT-08) — landed at 108 authored lines within budget, 8-mutant sweep killed 8/8; merged as PR #22 (`eb76f12`). PR-20 — `src/daemon/transport/{types,group,direct,dual}.ts` AS-IS vendored (hash-pinned, 732 lines excluded under size:exception) — 8-mutant sweep killed 8/8; merged as PR #23 (`dfd3b13`). PR-21 — room guard (D-22), binding config, bindings reconciliation (PT-01) — landed at 1,240 authored lines (493 src + 747 test) with a disclosed 840-line PR-scoped exception, 11 findings in Round 1 all 100% verified in Round 2, 0 survivors, 8-mutant sweep killed 8/8; merged as PR #24 (`0572b4e`). PR-22a — the seven-step admission pipeline (PT-03, PT-04, PT-16, PT-17, PT-31; invariants 1, 4, 5) — landed at 1,243 authored lines (668 src + 569 test + 6 fixture) with a disclosed 843-line PR-scoped exception, and its audit found two CRITICALs: the step order was inverted against the requirement's own "MUST pass, in order" clause, and a private bracket-tolerant decoder had been introduced to make the suite pass, accepting envelopes the wire schema refuses (the malformed fixture was rebuilt from a real sentinel line and the second decoder deleted). Its 14-mutant sweep (explicit `[from, to]` pairs) killed 13 and the one survivor is the harness control, a comment-only change that must survive; the mutant that pins step 1's counter initially survived and is killed at the tip. Its ordinary native review was declined by the host and `assess` returned `unassessable`, so the high-risk RDD path ran. The path for PR-29 onward is planned in `docs/08-sessions/HANDOFF.md` under the Director's delegations: ODD with the full SDD contract preserved, or `sdd-apply` if a human first runs `/gentle:sdd-preflight` in the TUI.

## 1. Reading order

Read in this order before proposing or changing anything. Stop at the depth the task needs.

| Step | Read | Why |
|------|------|-----|
| 0 | [`docs/08-sessions/HANDOFF.md`](./docs/08-sessions/HANDOFF.md) | Where the previous session stopped, what this one does, what not to redo. Continuing sessions start here and read the rest only as deep as the handoff says |
| 1 | [`docs/00-INDEX.md`](./docs/00-INDEX.md) | Single entry point: map, pending decisions, precedence rule |
| 2 | [`docs/01-constitution/CONSTITUTION.md`](./docs/01-constitution/CONSTITUTION.md) | Immutable law: the five invariants, autonomy boundary, freeze doctrine |
| 3 | [`docs/01-constitution/GOVERNANCE.md`](./docs/01-constitution/GOVERNANCE.md) | Roles, debate and ADR process, SDD per phase, TDD, PR budget |
| 4 | [`docs/03-adr/INDEX.md`](./docs/03-adr/INDEX.md), then ADR-0028 to ADR-0031 | The four decisions that define v2 |
| 5 | [`docs/02-architecture/OVERVIEW.md`](./docs/02-architecture/OVERVIEW.md) | Components, planes, daemon/client, IPC handshake, installer flow |
| 6 | [`docs/07-plan/WORK-PLAN.md`](./docs/07-plan/WORK-PLAN.md) | Phases F0–F8 and their validation criteria |
| 7 | [`docs/06-backlog/CHECKLIST.md`](./docs/06-backlog/CHECKLIST.md) | Live backlog — what is deferred, decided or open |
| 8 | [`docs/05-tribunal/INDEX.md`](./docs/05-tribunal/INDEX.md) | Debate record with objections, amendments and outcomes |

Data model and threat model ([`docs/02-architecture/`](./docs/02-architecture/)) are read when the
task touches schemas or security.

## 2. Where live state lives

| State | Location | Notes |
|-------|----------|-------|
| Deferred items, decisions, spikes | `docs/06-backlog/CHECKLIST.md` | One row per item; rows are never deleted, only marked `done` or `dropped` with a pointer |
| Debate outcomes | `docs/05-tribunal/INDEX.md` | Landing debate `bus-v2-landing-architecture-001`; reserved `bus-v2-referee-001` |
| Architectural decisions | `docs/03-adr/` | One ADR per file; the index carries status and supersession |
| Cross-session memory | Engram (persistent memory, outside the tree) | Decisions, conventions, bugs; SDD phases write to it but do not replace it |
| SDD artifacts | `openspec/` — **in active use** | `openspec/config.yaml` plus `openspec/changes/f1-daemon-registry-thin-client/` (`proposal.md`, `exploration.md`, `specs/`, `design.md`, `tasks.md`, `state.yaml`, `apply-progress.md`). That change is mid-`apply`; read its `state.yaml`, or run `gentle-ai sdd-status f1-daemon-registry-thin-client --cwd .` |
| Local tooling (not product) | `.claude/settings.json`, `.mcp.json` | See section 5 |

When a live-state file and a design document disagree, apply the precedence rule in
[`docs/00-INDEX.md`](./docs/00-INDEX.md#precedence-on-conflict) and the live-state handling in
`GOVERNANCE.md`. Report the contradiction; do not resolve it silently.

## 3. Rules that bind every session

**Authority.**
- The **Director** (the user) decides, authorizes and has the last word.
- **One writer of the tree: Kairo.** The tribunal (**Alpha**, **Betelgeuse**) audits, may propose
  `PATCH` diffs, and never commits.
- **Never commit without the Director's authorization.** Writers produce files; the Director
  decides what is committed and when.
- Alpha audits every unit **before** merge. Each phase F1–F8 is one SDD change; PRs are <= 400 lines of authored src+test, and an over-budget PR requires a **disclosed, PR-scoped exception** (most F1 slices since PR-06b have needed one; each is measured at every tip and recorded under its block in `tasks.md` and in `apply-progress.md`). While the Arena bridge is down, that audit is **Judgment Day**, as the Status line records.

**Engineering.**
- **Strict TDD**: red before green; every `src` file has a test counterpart. No exceptions.
- **ADR-12 governing rule**: a documented guarantee must be pinned by a test that can fail.
- **Named-constant rule**: every numeric constant is a named constant with its reasoning.
- **Wire policy**: emit `AGENTBUS/2`, accept `/1` and `/2`; no wire change in v2. A future wire
  change happens only through an ADR and a per-binding coordinated send freeze — never an ordering,
  and an instruction never names a version number.
- **Autonomy boundary** (inherited ADR-06 layers 1–2): the core has no exec, no shell, no tool
  invocation, zero autonomous emission, no timers that emit. Anything that runs a headless agent
  belongs to the optional satellite package, never to the core.
- The five invariants in the constitution are non-negotiable; a change that weakens one is not a
  change request, it is a constitutional amendment (see the amendment procedure there).

**Documentation.**
- Artifacts (docs, code, comments, tests, commits, specs) are in **English**, neutral professional
  register. Conversation with the Director is in Spanish. The Director's Spanish quotes are kept
  verbatim when they are requirements. Runtime messages between agents on the bus may be Spanish.
- Every statement traces to a source: the landing decision record, v1 evidence cited as
  `file:line` in the `telegram-agent-bus` repository, or the F0 analysis bundle cited by research key.
  Anything undecided is marked "pending Director decision" with its backlog id.
- Use relative Markdown links between documents. One ADR per file; ADRs are appended, not rewritten.
- Documentation is updated during the task, not afterwards, and only what the task affected.

**Data hygiene.**
- **Never copy production data from v1** into this repository: bot usernames, numeric `user_id`s,
  developer first names, the production `chat_id`, tokens. Use placeholders.
- Tokens never appear in project files, environment handed to IDEs, URLs, logs, errors or stacks.
- Do not invent decisions. If two readings of a requirement produce materially different work, ask
  the Director one question and wait.

## 4. What is decided and what is pending

Decided (tribunal consensus; ADR-0028..0031 `accepted` by the Director, DN-04): topology, daemon,
persistence, committed project file, listening model, Arena-light, stack, governance, work plan — D1
to D11 in the tribunal record; SDD preflight (Automatic · hybrid · auto-chain) and F1 delivery
(`stacked-to-main`, DN-06); license Apache-2.0 (DN-04).

Pending the Director: trademark screening of the product name (B-11), the B-16 remainder
(SECURITY.md, CONTRIBUTING.md, CHANGELOG.md, copyright-holder line), macOS scope (B-12), and the
PR-08, PR-09a and PR-09b audit follow-ups only the Director can disposition (B-22, B-26, B-27, B-29, B-30 and B-31; B-28 is a doctor item for F2, and B-32 is the advisory set of PR-09b's review). Session 27 added two design-versus-contract contradictions for the Director: B-40 (design §8.1's `poller_conflict`/`poller_rate_limited` conditions have no contract) and B-41 (design §6's `secret_store_fallback` condition has none either). Session 28 added B-42 (SEAM pins not machine-checked), B-43 (v1's tool name in merged modules), B-44 (a room-guard refusal inside a misbuilt transport), B-45 (the poller's 429 handling against DATA-MODEL and the send path) and B-46 (design §9's rate-refusal name). Full board:
[`docs/00-INDEX.md`](./docs/00-INDEX.md#pending-director-decisions) — see its rows 9 and 10.

Open spikes for F0: B-05 (gentle-ai installer study), B-07 (bot-to-bot group visibility for
non-admin bots), B-08 (IPC handshake and named-pipe DACL on Windows), B-09 (MCP notification
rendering per host).

## 5. Local tooling in this checkout

- `.mcp.json` is **gitignored** and holds the local Arena bridge credential. Never commit it, never
  quote its contents.
- `.claude/settings.json` is **gitignored** and registers a `Stop` hook that points to an Arena Orion
  script by absolute local path; it is machine-specific tooling for the tribunal sessions, not part
  of the product. Never commit it (ADR-0031: the repository ships no hooks or settings that execute
  code on open).
- `.gitignore` also excludes `*.token`, `.conmuta/`, `.env`, `node_modules/`, `dist/`, session dumps
  (`*.txt`, except the seeded PT-22 fixture `test/fixtures/repo-scan-negative.txt`) and local caches.
- **GitHub authentication is isolated from the machine-global `gh` account** (Director, DN-07): other
  agents on this machine use a different account for unrelated projects, and `gh auth switch` would
  break them. This checkout's `.git/config` carries a local `credential.helper` that fetches the
  `agentesinteligentesllm-oss` token at call time; `gh` commands run with
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)"`. Never run `gh auth switch`.
- Remote `origin` = `https://github.com/agentesinteligentesllm-oss/connmuta.git`, branch `main` (pushed). Branch protection: force-push and deletion blocked (DN-08); no PR or status-check requirement.

## 6. Working with the v1 repository

The predecessor lives beside this one as `telegram-agent-bus`, checked out at commit `bf8f365` (tag
`v1.0.2` + 2 commits: docs and the ADR-27 fix; the only `src/` change after the tag is
`src/tools/fetch.ts`, wire unchanged). Read it for evidence and for the modules to be reused as a
library (D1); cite as `path:line` against that checkout, since line numbers in files touched after
the tag hold only at `bf8f365`. Do not modify it: v1.0.2 is frozen in production until the F1
migration (B-13).
