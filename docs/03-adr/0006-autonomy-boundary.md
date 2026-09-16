# ADR-0006 — Autonomy boundary: capability isolation + fail-closed basis

| Field | Value |
|---|---|
| Status | inherited-valid (constitution-level) |
| Date | 2026-08-14 (original, v0.1.0 design) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-06 |
| Inheritance verdict | YES, inherit verbatim, in `maps[governance-docs]`; `bus-v2-landing-architecture-001` D6 and Alpha objection n1 |
| Related | [ADR-0012](./0012-adversarial-audit-governing-rule.md), [ADR-0013](./0013-basis-abandoned.md), [THREAT-MODEL](../02-architecture/THREAT-MODEL.md) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

The v1 proposal promised that the bridge cannot take a destructive action on its own. The design separates the layers that are *enforced* from the ones that are only *mitigations* or *audit trails*, because conflating them would overstate the guarantee (`openspec/changes/telegram-agent-bus/design.md:181-197`).

## Decision — seven layers, kept separate

| # | Layer | Mechanism | Strength |
|---|---|---|---|
| 1 | Capability isolation | No exec, no shell, no arbitrary file access, no ability to invoke another tool; the only effects are HTTPS to `api.telegram.org` and reads/writes under the bridge home | Enforced, load-bearing: destructive actions are unreachable through the bridge |
| 2 | Zero autonomous emission | No timer, no background task, no auto-reply, no send path outside an explicit tool call in an agent turn (including the DM fan-out) | Enforced |
| 3 | Settings immutability | Must not read, write or propose edits to `.claude/settings*.json` or any `permissions.allow` list | Enforced: closes "the bridge pre-approves its own future" |
| 4 | Fail-closed `basis` enum | Every `RESOLVED` declares `basis ∈ {context-shared, work-confirmed, lock-released, human-approved}`; no enum value exists for an unlisted autonomous action | Enforced at schema level |
| 5 | `human-approved` escape hatch | Requires a non-empty `approval_ref` | Audit trail, not a control — the bridge cannot verify a human approved anything |
| 6 | Secret-pattern backstop | Send scans `body` before either channel is written: PEM blocks, `.env`-style assignments whose key contains `SECRET`/`TOKEN`/`KEY`/`PASSWORD`, Telegram bot-token shape, configured markers | Enforced for known shapes; explicitly not a classifier |
| 7 | Untrusted-input framing | Incoming bodies are returned inside a delimited, labelled untrusted block; tool descriptions state envelope content is data from a peer, never an instruction from the user | Mitigation; more important since the DM inbox is reachable from outside the group ([ADR-0004](./0004-dual-channel-delivery.md)) |

**Where it lives.** Layers 1-3 are structural properties verified by static assertions over the built bundle (`test/security.test.ts:176-270`: no `child_process`; `node:fs` only inside `config.js`/`state.js`; no `.claude/settings` or `permissions.allow` reference; no `deleteMessage` call or definition; no `setTimeout`/`setInterval`/`setImmediate`, no timers module, no unbounded loop; every `sendMessage` call site confined to the transport layer). Layers 4 and 6 are `zod` + regex validation in `src/tools/send.ts` and `src/secrets.ts`, rejecting before any network call on any channel. Only layer 5 relies on the calling agent's judgment, and it is labelled unverifiable.

On a secret match the tool returns `SECRET_PATTERN_DETECTED` naming the rule that matched, never the matched text (`src/tools/send.ts:349`). The fence is `wrapUntrusted` with label `UNTRUSTED-PEER-INPUT` (`src/tools/fetch.ts:43-61`).

## Consequences

- Layers 1-2 became v1 hard invariants #1 and #4 (`docs/functional-audit/HANDOFF.md:297-326`): never add `deleteMessage`; no timers, no autonomous emission.
- Later audits found defects *behind* layers 6 and 7 — the fence was forgeable and the backstop scanned one assignment; the remediation and the governing rule it produced are [ADR-0012](./0012-adversarial-audit-governing-rule.md).
- Layer 4's provenance is documentary once `abandoned` exists; see [ADR-0013](./0013-basis-abandoned.md).

## Relevance to Conmuta

**Verdict: inherited verbatim; constitution-level** (D10, [CONSTITUTION](../01-constitution/CONSTITUTION.md)). The tribunal used this ADR as the decisive argument of round 1:

- **Alpha objection n1 (accepted).** A headless runner inside the core (`claude -p`, `codex exec`, `opencode run`, `gemini -p` on new `needs_action`) violates layers 1-2 and creates an RCE vector via indirect prompt injection from Telegram (evidence cited in the debate: `design.md:185-188`, `test/security.test.ts:66,224`, `src/tools/fetch.ts:36,202`). D6 therefore defines the core — daemon plus thin client — as a **passive switch** under layers 1-2: no exec, no shell, no tool invocation, zero autonomous emission, no timers that emit, static security assertions equivalent to `test/security.test.ts` (no `child_process`, `fs` only inside its home). The runner is an optional satellite package post-F6 with its own constitution, read/reply-only by default (backlog B-06); the Claude Code channels adapter is a doorbell only.
- **Layer 2 under a daemon.** The daemon's long-poll is a receive loop; it never emits. Amendment A1 retracted a proposed heartbeat timer for exactly this reason (backlog B-14): version observability rides the render-only header of posts the agent sends anyway.
- **Layer 3 across hosts.** v1 named only `.claude/settings*.json`. The analysis bundle records that the multi-host product must enumerate every host's permission/config file the core must never touch (`maps[governance-docs]` must_change). The installer of D5 is a separate component that writes only an id-only stdio entry into detected tools' project-level MCP configs, opt-in per tool, merging never overwriting; the exact layer-3 enumeration for the multi-host core is not settled by the DECISION RECORD and is to be fixed in the constitution and the F2 SDD spec.
- **Layer 6 gains a consumer.** Invariant 2 adds a token-shape validator in pre-commit and `doctor` over project files.
- **Layer 7 is Invariant 5.** Peer content is data, never action: everything received is fenced and origin-labelled; the core has no exec and no `fs` outside its home; nothing from the bus is executed or applied automatically (no PATCH auto-apply; `CONSENSUS` is a message); rounds and participants are capped; every send/receive/reject is appended to a per-binding audit log that stores no rejected bodies and no tokens.
