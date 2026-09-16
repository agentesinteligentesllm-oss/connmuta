# ADR-0010 — Roster is the routing table, the attribution check *and* the access list

| Field | Value |
|---|---|
| Status | inherited-revisit (semantics valid verbatim; scope moves from one global roster to one roster per binding — recorded in ADR-0028) |
| Date | 2026-08-14 (original, v0.1.0 design) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-10 |
| Inheritance verdict | "YES for semantics, REVISIT scope" in `maps[governance-docs]`; scope resolved by `bus-v2-landing-architecture-001` D2, D5, Invariants 1 and 4 |
| Related | [ADR-0004](./0004-dual-channel-delivery.md), [ADR-0018](./0018-receive-side-enforces-sender-invariants.md), [ADR-0028](./0028-project-scoped-bijective-binding.md) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree"). Identities below are placeholders, not production data.

## Context

[ADR-0004](./0004-dual-channel-delivery.md) opened the DM inbox to any opted-in bot; something had to be the access list, and the design already had a roster (`openspec/changes/telegram-agent-bus/design.md:229-246`).

## Decision

The roster becomes a per-agent record rather than a bare id and serves three jobs at once:

```jsonc
"roster": {
  "@alice-agent": { "username": "alice_example_bot", "user_id": 1000000001 },
  "@bob-agent":   { "username": "bob_example_bot",   "user_id": 1000000002 }
}
```

| Job | Field | Why |
|---|---|---|
| Outbound DM addressing | `username` | The changelog specifies addressing "via username" |
| Inbound attribution / spoof check | `user_id` | A DM's `message.from.id` is the sending bot's user id — reliable, unlike a self-declared `from` |
| Access control | membership | An envelope from a sender absent from the roster is dropped and counted (`skipped.unknown_sender`, `src/tools/fetch.ts:540`) |

## Consequences

- Carrying both `username` and `user_id` costs nothing and gives a fallback if username addressing ever needs a numeric `chat_id`.
- Operational cost stated plainly: adding a developer means a roster edit on every machine — acceptable at v1's team size, the price of having no shared infrastructure.
- In v1 the roster is one global record in `config.json`, bound once per process (`src/config.ts:173-184, 201-207`) — a single-tenant assumption (analysis bundle `maps[governance-docs]` single_tenant_assumptions).

## Relevance to Conmuta

**Verdict: semantics inherited verbatim; scope revisited and resolved.**

- **Semantics.** Invariant 4 restates the three jobs as law: sender = `message.from.id` verified against the binding's roster; chat must be the binding's group or a private chat from a roster member; anything else is counted (`foreign_chat` / `unknown_sender`) and dropped, never surfaced, never replied to; **no fail-open anchors** — which tightens the "null anchor fails open by derivation" wording recorded in [ADR-0018](./0018-receive-side-enforces-sender-invariants.md).
- **Scope.** The roster is no longer a machine-global file. D5 commits it to the repository in `conmuta.json` — `roster: [{agent_id, user_id, username}]`, identifiers only, strict `zod`, no local paths, no tokens — and the machine registry maps `project_id -> my bot (token reference) + my agent_id`. The daemon derives `(bot, group, roster)` from the binding fixed at MCP-session start (Invariant 1). This removes the "edit every machine" cost: the roster travels with the project. [ADR-0028](./0028-project-scoped-bijective-binding.md) records the binding; F3 adds roster sync.
- **Bootstrap circularity.** A new member's `user_id` cannot be known before their bot has spoken; D5 has the daemon keep a "pending unknown senders" list (`user_id`, `username`, no body) so the operator can admit them without ever surfacing an unlisted body.
