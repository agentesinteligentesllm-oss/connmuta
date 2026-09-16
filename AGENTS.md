# AGENTS.md — session bootstrap for agents working on this repository

> **Working name.** "Conmuta" is a working name pending trademark clearance (B-11 in
> [`docs/06-backlog/CHECKLIST.md`](./docs/06-backlog/CHECKLIST.md); fallback "Emisario").

**Scope of this file.** It bootstraps an AI agent that edits, audits or plans *this repository*.
It is **not** the end-user bus protocol: the `AGENTS.md` that the installer will write into a user's
project (decision D5 of the landing debate, phase F2) is a different document, produced later as a
template. v1's equivalent of that end-user document is `docs/AGENT-GUIDE-using-the-bus.md` in the
`telegram-agent-bus` repository.

**Status.** F1 `apply` in progress: PR-01a and PR-01b merged (`main` = scaffold, CI, static gates, `src/shared/{constants,version}.ts` with twins). Next slice PR-02 of 45 in `openspec/changes/f1-daemon-registry-thin-client/tasks.md`. Every PR is audited by Alpha before it opens (DN-05).

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
| SDD artifacts | `openspec/` (not created yet) | Opens with the F1 SDD change after the Director's SDD preflight |
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
- Alpha audits every unit **before** merge. Each phase F1–F8 is one SDD change; PRs are <= 400 lines.

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
(SECURITY.md, CONTRIBUTING.md, CHANGELOG.md, copyright-holder line), macOS scope (B-12). Full board:
[`docs/00-INDEX.md`](./docs/00-INDEX.md#pending-director-decisions).

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
