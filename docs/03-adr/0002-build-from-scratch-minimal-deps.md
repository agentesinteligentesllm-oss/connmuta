# ADR-0002 — Build from scratch on the official SDK + raw Bot API (minimal dependencies)

| Field | Value |
|---|---|
| Status | superseded (in part) — by ADR-0030: the zero-dependency / no-database stance. The from-scratch, audited-code, raw-Bot-API stance remains in force. |
| Date | 2026-08-14 (original, v0.1.0 design) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-02 |
| Inheritance verdict | REVISIT in `maps[governance-docs]`; resolved by `bus-v2-landing-architecture-001` D1, D4, D9 |
| Superseded by | [ADR-0030](./0030-sqlite-ledger-and-json-registry.md) (in part: the zero-dependency / no-database stance) |
| Related | [ADR-0031](./0031-npm-distribution-and-license.md) — packaging; it amends ADR-0001, not this ADR |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

The bridge process holds a live bot token with read/write access to the team's real coordination channel. Three ways to obtain the code were weighed (`openspec/changes/telegram-agent-bus/design.md:47-57`):

| Option | Trade-off | Outcome |
|---|---|---|
| From scratch: MCP SDK + `fetch` to `api.telegram.org` | ~800 lines, fully auditable, zero third-party Telegram code | Chosen |
| Adapt a third-party bot-token bridge | Source not audited; reusable part limited to HTTP glue | Rejected |
| Adapt a Telethon/MTProto user-account bridge | Userbot ToS grey zone | Rejected by the proposal |

## Decision

Build from scratch on `@modelcontextprotocol/sdk` with raw `fetch` calls to the Bot API. Runtime dependencies are exactly `@modelcontextprotocol/sdk` and `zod` (`package.json`), later sealed as v1 hard invariant #3, "No new runtime dependencies" (`docs/functional-audit/HANDOFF.md:297-326`, rule 3).

Rationale, condensed: an unaudited dependency inside a token-holding process is a strictly worse posture than a small implementation the team can read end to end. The value of the change — envelope schema, dual-write fan-out, deduplication, needs-action filter, cursor bookkeeping, secret backstop, checkpoint windowing, thread state machine — had to be written regardless; the reusable remainder was ~80 lines of `getUpdates`/`sendMessage` glue. No third-party bridge predating 2026-05-08 could implement the Bot-to-Bot Communication Mode path the design depends on.

Honest limit recorded in the original: the third-party bridges were never reviewed; the rejection rests on audit cost, not on any claimed defect.

## Consequences

- The team owns the full audit obligation for every line, which is what later made the adversarial audits of [ADR-0012](./0012-adversarial-audit-governing-rule.md) possible.
- The zero-dependency stance became a reason to close the "append log or database" option permanently: "an append log or a database would violate ADR-02's zero-dependency stance and ADR-03's no-daemon simplicity" (`docs/functional-audit/06-verdict.md:173-174`).

## Relevance to Conmuta

**Verdict: superseded in part by ADR-0030; the rest remains valid.** Packaging is amended in ADR-0001 by ADR-0031, not here.

What stays in force:
- No third-party Telegram client code; raw Bot API over `fetch`; no userbot path.
- The audit obligation: every dependency added to the core must be read and justified, never assumed.
- The from-scratch lineage continues as a **library**: D1 reuses v1's pure modules unchanged — `src/telegram.ts` (client and typed error taxonomy), `src/transport/{group,direct,dual,types}.ts`, `src/envelope.ts`, `src/protocol.ts`, the classification pipeline in `src/tools/fetch.ts:525-656`, and `src/state.ts` (validation, quarantine, migration).

What is consciously reopened:
- **Persistence.** D4 adopts a `node:sqlite` (WAL) ledger next to a human-editable JSON registry, and the tribunal recorded that this "consciously reopens the 'database' closed item". ADR-0030 supersedes this ADR's zero-dependency / whole-file-JSON stance in exactly that scope.
- **Dependencies.** `node:sqlite` is standard library; `@napi-rs/keyring` (prebuilds, no `node-gyp`) and `@clack/prompts` are new runtime dependencies (D4, D9). Hard invariant #3 of the v1 handoff is therefore amended by ADR-0030/0031, not silently ignored.
- **Docker is NOT adopted** for the client product — Docker Desktop licensing and overhead, stdio inside containers, and no local bus in the state of the art uses it; it is reserved for a hypothetical self-hosted Bot API server (D4).
