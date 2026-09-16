# ADR-0024 — `agentbus-channel`: a doorbell, not a second reader

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-revisit — semantics carry; the peek mechanism and the one-home-per-machine deployment do not survive [ADR-0029](./0029-per-user-daemon-and-thin-clients.md) |
| **Date** | 2026-08-25 (unversioned; ships on top of v1 `v1.0.1`; commits `2ad454d`, `9a86560`, `7653f1d`, `82a1841`). Tribunal consensus recorded as 2026-08-26 |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:509-537` (ADR-24); audited in debate `agentbus-channel-audit-001` |
| **Supersedes / superseded by** | — / mechanism superseded by ADR-0029 and Invariant 3; semantics retained for the F4 adapter |

## Context

An agent learned about inbound work only when a human ran a recurring `agentbus_fetch`. On a bus carrying 20–58 threads a day that is a few hundred polls to catch a few dozen events, and every quiet poll spends context on nothing. Claude Code's channel capability can push an event into an open session; the question was what such a server is allowed to be.

## Decision

**It is a doorbell.** It says how much is waiting and from whom, and sends the agent to `agentbus_fetch` for the rest. Every constraint follows from that sentence.

| Rule | Reason |
|---|---|
| **No body crosses — a security boundary, not a size preference** | Peer-authored text reaches the model through exactly one door, `agentbus_fetch`, inside the `UNTRUSTED-PEER-INPUT` fence (ADR-0012). A `<channel>` tag is not fenced; peer prose through this path would bypass ADR-0006 layer 7 by construction. The only peer-derived values allowed are roster keys, the closed `type` enum and 12-hex thread ids, pattern-constrained and stripped of anything that could forge a tag attribute. The test pins the emitted **key set** closed — never the absence of a body string, which would pass vacuously |
| **The peek does not consume, and cannot be allowed to** | `getUpdates` is called with the bridge's own persisted cursor as `offset`, which the Bot API treats as non-confirming. `agentbus_fetch` remains the only consumer. A watcher that consumed would blind the bridge while the sender still saw `delivery.ok: true` — v1's signature failure, manufactured by the thing meant to reduce latency |
| **It never writes, and does not use `loadState`** | `loadState` quarantines a corrupt file by renaming it on disk ([ADR-0015](./0015-state-integrity-validate-quarantine-migrate-once.md)) and reports it only through the returned `State`, which a watcher discards. A private read-only reader returns `null` for anything it cannot read with certainty; a `null` cursor makes the tick do nothing. The watcher must never be the first process to touch a home |
| **Gate on the sender, never on the room** | Identity is numeric `message.from.id` resolved against the roster (ADR-0010). An allowlisted group would let anyone inside it inject notifications into the session |
| **`claude/channel/permission` is omitted, not set to `false`** | Declaring it would let anyone who reaches the channel approve tool use in the session; omission is the only form safe across client versions |
| **Outside `src/`, second `bin` of the same package** | `test/security.test.ts` asserts over the compiled `src/` bundle and a background loop belongs on the other side of that line; the suite now also asserts no timer-free loop and no timers import exist in `src/` at all. Same package, because version skew between a reader and the bridge whose state it reads is a defect generator |
| **Rejected: a fourth MCP tool; treating the channel as delivery** | Folding it in would put a `for(;;)` loop inside the process holding the bot token and the state lock. And the platform's own contract — events dropped silently, no acknowledgement — is v1's signature failure shape living inside the platform; the recurring fetch cadence is not reduced by one tick |
| **`SERVER_VERSION` does not change** | Nothing about the channel is visible to a peer: no byte on the wire, no schema, no state. It is the wire-compatibility gate, not a feature counter |

## Consequences

- Watcher reader and non-`loadState` rationale: v1 `channel/watcher.ts:14-53`; non-confirming offset: `channel/peek.ts:94-95`; permission omission: `channel/index.ts:62`; second bin: v1 `package.json:7-9`. Static assertions: v1 `test/security.test.ts:216` no timer-based emission, `:232` no timer-free background loop, `:239` no timers import.
- The first surface since v0.3.0 deployable unilaterally — `git diff --stat src/` was empty.

Pinned by (v1 tests): `channel/notify.test.ts:132`, `:174` emitted meta key sets are closed; `:98` a roster key with quotes, angle brackets or newlines cannot reach a tag attribute; `:116` the content line names no peer text; `channel/peek.test.ts:100` non-roster sender dropped — gate on identity, not room; `:107` own echo never rings; `:208` no scan output carries a body; `channel/watcher.test.ts:72` peek asks for exactly the bridge's cursor; `:99` state file byte-identical after a tick; `:188` corrupt state left untouched; `:208` a home with no state file peeks nothing.

## Relevance to Conmuta

- **Semantics carry into F4.** D6 fixes the Claude Code channels adapter as an *optional doorbell only*: no body crosses, gate on sender, no permission declared, never treated as delivery, outside the passive-switch core. Channels remain a research preview (verified facts), and D6 states honestly that no wake-up contract is verified for Cursor, OpenCode, Codex, Gemini CLI or Antigravity (spike B-09) — those hosts rely on a fetch cadence.
- **The mechanism cannot carry.** Invariant 3 makes the daemon the *sole* `getUpdates` consumer per token and D3 forbids any client from polling Telegram; one token admits exactly one `getUpdates` consumer (H1, HTTP 409). A v2 doorbell therefore cannot peek Telegram at all; where it takes its signal is specified by the F4 SDD change ([WORK-PLAN](../07-plan/WORK-PLAN.md)). The daemon's durable inbox and per-client cursors (D4) exist for exactly this question.
- **Deployment scope is per binding, not per machine.** The v1 rule "arm exactly one session per machine" rested on one `AGENTBUS_HOME` per machine; under [ADR-0028](./0028-project-scoped-bijective-binding.md) the unit is the binding. The analysis verdict is YES for semantics, REVISIT for deployment (analysis bundle, `governance-docs` key_facts[24]).
- The static-assertion discipline (no `child_process`, no timers, `fs` only inside the home) is Invariant 5 in the [CONSTITUTION](../01-constitution/CONSTITUTION.md) and a [THREAT-MODEL](../02-architecture/THREAT-MODEL.md) test requirement for the daemon and the thin client alike.
