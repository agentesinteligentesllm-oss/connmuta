# ADR-0001 — Runtime: Node.js / TypeScript

| Field | Value |
|---|---|
| Status | inherited-valid |
| Date | 2026-08-14 (original, v0.1.0 design) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-01 |
| Inheritance verdict | YES in analysis bundle `maps[governance-docs]`; confirmed by Arena debate `bus-v2-landing-architecture-001` (D9, D10) |
| Amended by | [ADR-0031](./0031-npm-distribution-and-license.md) (distribution channel); D9 pin Node >= 24 |

> **Conmuta** is a working name pending the Director's decision (backlog B-11). v1 evidence below is cited as `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

Four developers on four machines had to run byte-identical bridges with no shared infrastructure. The candidate runtimes were Node.js/TypeScript and Python; both have a mature first-party MCP SDK, so language quality was not the deciding factor (`openspec/changes/telegram-agent-bus/design.md:36-45`).

| Option | Trade-off | Outcome |
|---|---|---|
| Node.js + TypeScript | First-party MCP SDK; one `npx` line installs the same bytes on every machine; global `fetch` and `node:test` in the standard library mean zero runtime and zero test dependencies | Chosen |
| Python | Equally mature SDK, likely more familiar; but every machine needs its own venv/uv/pipx bootstrap, and four independently drifting Python environments is a recurring operational cost | Rejected |

## Decision

Node.js with TypeScript compiled by `tsc` to ESM in `dist/`; tests with `node:test`; no runtime dependency beyond the MCP SDK, which reinforces the security argument of [ADR-0002](./0002-build-from-scratch-minimal-deps.md). Pins at the time: Node `>= 22.0.0`; `npm test` = `tsc && node --test "dist/**/*.test.js"` (`design.md:45`; `package.json` `engines.node`).

## Consequences

- Distribution, not language, drove the choice: one line of MCP config, no local environment management.
- Python familiarity was traded for a bridge small enough (~800 lines at the time) to be audited end to end by a Python-first developer.
- The "zero dependencies" property became hard invariant #3 of the v1 handoff (`docs/functional-audit/HANDOFF.md:297-326`, rule 3).

## Relevance to Conmuta

**Verdict: inherited-valid.** The Director keeps Node and the installer story builds on it (D9). Two pins change without reopening the runtime decision:

- **Node `>= 24` LTS** is the installer's first gate, before touching disk or git, with an explicit error and download link, `nvm`/`fnm` aware, recording the node executable path used (D9; Alpha objection n3; backlog B-17). The reason is `node:sqlite`, unflagged only from Node 24, which [ADR-0030](./0030-sqlite-ledger-and-json-registry.md) adopts.
- **`npx` is retired as the distribution channel.** This ADR's "one `npx` line" rationale was falsified in production: an `npx github:` start re-clones and recompiles on every launch, measured at 18.0 s warm against the 30 s default MCP timeout, and the node came up with no tools registered while the operator saw nothing wrong (`docs/UPGRADE-v1.0.1.md:161-178`). D9 mandates npm publish with compiled `dist`, `npm-shrinkwrap` and a `files` whitelist, and NEVER `npx`; see [ADR-0031](./0031-npm-distribution-and-license.md).
- The "no runtime dependency beyond the SDK" property is superseded in part by ADR-0030/0031: `node:sqlite` is standard library, while `@napi-rs/keyring` and `@clack/prompts` are new dependencies (D4, D9). Every new dependency inherits the audit obligation of ADR-0002.

TypeScript ESM, strict TDD with `node:test` (red before green) and the rule that every `src` file has a test counterpart are carried verbatim (D9; [GOVERNANCE](../01-constitution/GOVERNANCE.md)).
