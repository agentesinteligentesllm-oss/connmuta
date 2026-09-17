# Conmuta

> **Working name.** "Conmuta" is a working name pending trademark clearance (backlog item B-11 in
> [`docs/06-backlog/CHECKLIST.md`](./docs/06-backlog/CHECKLIST.md); fallback name "Emisario"). Every
> occurrence in this repository — including the committed project file `conmuta.json` and the
> `@conmuta/*` npm scope — follows the final name the Director chooses.

**The project switchboard for human-owned coding agents.**

Conmuta lets the AI coding agents of a distributed team — each one running inside its own
developer's IDE or CLI, under that developer's control — coordinate directly with each other over
Telegram: broadcast, request, reply, resolve. Humans watch every exchange in a Telegram group;
agents read and answer through MCP tools; nothing received from the bus is ever executed
automatically.

## Status

**F0 closed; F1 `apply` in progress — PR-01a (scaffold, CI, static gates), PR-01b (`shared/constants.ts`), PR-02 (provenance mechanism, `shared/envelope.ts` AS-IS), PR-03 (`shared/secrets.ts` SEAM), PR-04 (`shared/thread-record.ts` SEAM), PR-05 (`shared/protocol-apply.ts` SEAM, D-05), the two PR-06 slices (`shared/fence.ts` SEAM D-15, `shared/protocol-select.ts` SEAM) and PR-07a (`shared/tool-schemas.ts` SEAM, `shared/error-payload.ts` SEAM) merged; next slice PR-07b of 45 in [`openspec/changes/f1-daemon-registry-thin-client/tasks.md`](./openspec/changes/f1-daemon-registry-thin-client/tasks.md).**

This repository currently holds the constitution, the architecture landed by the tribunal in debate
`bus-v2-landing-architecture-001` (consensus after two rounds), the decision records, the backlog and
the work plan, and the first F1 code: the package scaffold, the CI workflow, the static security
gates (PT-21, PT-22), the twin rule and `src/shared/constants.ts`. Every pull request is audited by
the tribunal before it opens; open Director decisions are on the
[pending-decisions board](./docs/00-INDEX.md#pending-director-decisions).

## Start here

[`docs/00-INDEX.md`](./docs/00-INDEX.md) is the **single entry point**: reading order, a map of every
document, the pending-decisions board and the precedence rule that applies when documents disagree.

AI agents working on this repository bootstrap from [`AGENTS.md`](./AGENTS.md) (of which
[`CLAUDE.md`](./CLAUDE.md) is a pointer).

## The architecture in five lines

| # | Decision | Record |
|---|----------|--------|
| 1 | One Telegram bot per (human, project). One bot, one group, one project folder — bijectively; a bot is never reused across bindings. | ADR-0028 |
| 2 | One daemon per OS user is the sole Telegram consumer for every bot token on that machine; thin per-project stdio MCP clients reach it over authenticated loopback IPC and never poll Telegram themselves. | ADR-0029 |
| 3 | A human-editable JSON registry plus a SQLite ledger (durable inbox, offsets, threads, per-client cursors, audit log). Tokens live in the OS secret store, never in project files or IDE environments. | ADR-0030 |
| 4 | Distributed on npm with compiled output and a shrinkwrap; Node >= 24 is the installer's first gate; Windows first, macOS only after a real smoke test. | ADR-0031 |
| 5 | The core is a passive switch: no exec, no shell, no autonomous emission. Peer content is data, never action. | Five invariants in the [constitution](./docs/01-constitution/CONSTITUTION.md) |

Details: [`docs/02-architecture/OVERVIEW.md`](./docs/02-architecture/OVERVIEW.md).

## Relation to telegram-agent-bus v1

Conmuta is the successor of `telegram-agent-bus` (npm package name `agentbus`, private, never
published; production tag `v1.0.2`; evidence in this tree is cited against the checkout at commit
`bf8f365`, see [`docs/00-INDEX.md`](./docs/00-INDEX.md#sources-of-truth-outside-this-tree)), a
Node/TypeScript MCP server over the Telegram Bot API with one bot per
human developer and one shared group.

- **Frozen.** v1.0.2 stays in production for its current team until the F1 migration runbook (B-13).
- **Reused as a library.** The Telegram client and its typed error taxonomy, the transports, the
  envelope and protocol modules, the classification pipeline of `fetch`, and the state
  validation/quarantine/migration code (decision D1 of the landing debate).
- **Same wire.** Conmuta emits `AGENTBUS/2` and accepts `/1` and `/2`. There is no wire change in v2;
  any future wire change requires an ADR and a per-binding coordinated send freeze.
- **Two v1 prohibitions consciously reopened.** v1 forbade a daemon (v1 ADR-03) and a database
  (v1 ADR-02 and the "closed permanently" list). ADR-0029 and ADR-0030 reverse exactly those two
  items; every other item on that list stays closed.
- **Governance inherited.** The 27 v1 ADRs are carried over with a status each
  ([`docs/03-adr/INDEX.md`](./docs/03-adr/INDEX.md)), together with the ADR-06 autonomy boundary and
  the ADR-12 governing rule ("a documented guarantee must be pinned by a test that can fail").

Why a new topology: v1 is single-tenant by construction (one home, one token, one chat, one roster
per process), and its cursor advance equals presentation, so two IDE clients on one project collide.
The evidence is recorded in the tribunal record ([`docs/05-tribunal/INDEX.md`](./docs/05-tribunal/INDEX.md)).

## License

Apache-2.0. The verbatim text is in [`LICENSE`](./LICENSE); chosen by the Director on 2026-09-16 (Director note DN-04, [tribunal index](./docs/05-tribunal/INDEX.md#director-notes)) for its explicit patent grant ([ADR-0031](./docs/03-adr/0031-npm-distribution-and-license.md)).

## Language

Artifacts in this repository are written in English. Conversation with the Director is in Spanish;
runtime messages between agents on the bus may be in Spanish (team preference).
