# AGENTS.md — session bootstrap for agents working on this repository

> **Working name.** "Conmuta" is a working name pending trademark clearance (B-11 in
> [`docs/06-backlog/CHECKLIST.md`](./docs/06-backlog/CHECKLIST.md); fallback "Emisario").

**Scope of this file.** It bootstraps an AI agent that edits, audits or plans *this repository*.
It is **not** the end-user bus protocol: the `AGENTS.md` that the installer will write into a user's
project (decision D5 of the landing debate, phase F2) is a different document, produced later as a
template. v1's equivalent of that end-user document is `docs/AGENT-GUIDE-using-the-bus.md` in the
`telegram-agent-bus` repository.

**Status.** F1, F2, F3 and F5 are archived. **F4 (`f4-claude-channels-adapter`) is the one open SDD
change, mid-`sdd-apply`:** PR-01 to PR-05 are merged (`#95`-`#102`); PR-06 and PR-07 remain, then
`sdd-verify` and `sdd-archive`. This field used to
carry an inline session-by-session narrative that grew to ~78.5k characters (out of this file's
~89.7k total) and pushed the harness's combined instruction-file budget over its 150k-char limit;
it was trimmed here on 2026-09-28 to a pointer, and the exact removed text is preserved verbatim,
unedited, in
[`docs/08-sessions/STATUS-ARCHIVE-2026-09-28.md`](./docs/08-sessions/STATUS-ARCHIVE-2026-09-28.md).
Current state, open traps and next steps live in
[`docs/08-sessions/HANDOFF.md`](./docs/08-sessions/HANDOFF.md); full per-session history (every PR,
audit and correction since session 1) lives in
[`docs/08-sessions/LOG.md`](./docs/08-sessions/LOG.md). The audit-routing rule (DN-09: Arena/Alpha
first, Judgment Day only if Arena is confirmed unreachable at session start via a real tool call,
never `curl` alone) is durable and lives in
[`docs/01-constitution/GOVERNANCE.md`](./docs/01-constitution/GOVERNANCE.md) §3 and
[`docs/05-tribunal/INDEX.md`](./docs/05-tribunal/INDEX.md).

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
| SDD artifacts | `openspec/` — **in active use** | `openspec/config.yaml` plus `openspec/changes/f4-claude-channels-adapter/` (`proposal.md`, `exploration.md`, `specs/`, `design.md`, `tasks.md`, `apply-progress.md`; committed at the end of session 52). That change is mid-`apply`; run `gentle-ai sdd-status f4-claude-channels-adapter --cwd .`. F1, F2, F3 and F5 are under `openspec/changes/archive/` |
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
- Alpha audits every unit **before** merge. Each phase F1–F8 is one SDD change; PRs are <= 400 lines of authored src+test, and an over-budget PR requires a **disclosed, PR-scoped exception** (most F1 slices since PR-06b have needed one; each is measured at every tip and recorded under its block in `tasks.md` and in `apply-progress.md`). While the Arena bridge is down, that audit is **Judgment Day**, per the DN-09 routing rule in `GOVERNANCE.md` §3.

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
- **This file's `**Status.**` field is a short pointer, never a log.** Session narrative goes to
  `docs/08-sessions/LOG.md`; current state and next steps go to `docs/08-sessions/HANDOFF.md`. This
  file grew a 78.5k-char inline narrative once (see
  [`docs/08-sessions/STATUS-ARCHIVE-2026-09-28.md`](./docs/08-sessions/STATUS-ARCHIVE-2026-09-28.md))
  and pushed the harness's combined instruction-file budget over its limit; the cap is now enforced
  by `test/security/instruction-budget.test.ts`, part of `test:static`, so a regression fails CI
  instead of silently reappearing.

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
PR-08, PR-09a and PR-09b audit follow-ups only the Director can disposition (B-22, B-26, B-27, B-29, B-30 and B-31; B-28 is a doctor item for F2, and B-32 is the advisory set of PR-09b's review). Session 27 added two design-versus-contract contradictions for the Director: B-40 (design §8.1's `poller_conflict`/`poller_rate_limited` conditions have no contract) and B-41 (design §6's `secret_store_fallback` condition has none either). Session 28 added B-42 (SEAM pins not machine-checked), B-43 (v1's tool name in merged modules), B-44 (a room-guard refusal inside a misbuilt transport), B-45 (the poller's 429 handling against DATA-MODEL and the send path) and B-46 (design §9's rate-refusal name). Session 29 added B-47 (THREAT-MODEL traces the IPC `Host` check and body cap only to the F3 panel). Session 30 added B-48 (design §15's PT-24/PT-26 file pins look stale against the `ipc/{handshake,sessions,routes}` split). Session 31 added B-49 (spec.md's "Binding never changes mid-session" scenario reads as freezing the whole binding, not just the shipped 3-field guarantee) and B-50 (`daemon/ipc/routes.ts`'s `dispatchTool` forwards a caught error's message with no defense-in-depth redaction pass, matching the existing B-37/B-38 precedent). Session 33 added B-51 (`client/handshake.ts` reuses the 70s long-poll `IPC_REQUEST_TIMEOUT_MS` for its own `GET /identity`/`POST /session` calls, a worst-case ~140s latency concern, not a correctness bug). Session 34 added B-52 (`shared/ipc-contract.ts`'s `toolSuccessSchema`/`ipcErrorSchema` are not cross-validated against each other at the point `client/ipc-stub.ts` classifies a response by HTTP status alone — not currently exploitable, a forward-compatibility defense-in-depth gap). Sessions 50-52 added B-95 (follow-ups of the retroactive RDD review of F4 PR-03/04/05a: a per-row guard in `serve/doorbell.ts` and three `ipc/routes.ts` nits) and B-96 (a `bootstrap` timing flake that fails the first full run after a cold build). Full board:
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
