# ADR-0021 — `AGENTBUS/2`, and a decoder that accepts both

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-valid — the wire policy of Conmuta (D1) is this ADR applied unchanged |
| **Date** | 2026-08-15 (shipped with v1 `v1.0.0`, tag `99032dc`) |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:449-467` (ADR-21); v1 hard rule 15 "the sentinel is informational, not a gate" (v1 `docs/functional-audit/HANDOFF.md:325`) and rule 8 sealing the wire delta (`:311-314`) |
| **Supersedes / superseded by** | — / — |

## Context

`REPLY` ([ADR-0020](./0020-reply-and-turn-tracking.md)) was a new envelope type. Under `/1` a peer that does not know it counts the message as `malformed` — indistinguishable from truncated JSON or garbage — and sends a developer hunting for a parser bug over a payload that parses perfectly. `unsupported_version` says *update the package*. That diagnostic precision justified the bump on its own; the deciding argument was that a genuine wire change that still did not bump would leave the sentinel vestigial forever.

## Decision

| Rule | Reason |
|---|---|
| **Emitting and accepting are separate concerns** | `PROTOCOL_SENTINEL` is what this node emits; `SUPPORTED_PROTOCOL_SENTINELS` is what it reads. Comparing against a single constant made "readable" and "current" the same question, so the first bump would have made every `/1` envelope already in the shared group unreadable — an upgrade turned into amnesia about the group's own history. A test asserts the emitted sentinel is a member of the accepted set |
| **Per-message versioning is rejected** | The protocol an agent speaks is a property of the node, not of the sentence; peer capability is `server_version`'s job. Two mechanisms for one decision is how a trap gets built. Recorded on the v1 closed-permanently list |
| **The sentinel is informational, not a gate** | A `/1`-framed `REPLY` decodes exactly like its `/2` twin because `decodeEnvelope` hands the JSON to zod and nothing branches on the version string. A `/1` frame evades no check; it simply lacks v2 features |
| **`to_user_id` is the third and last wire item, optional on purpose** | `to` travels in the sender's namespace; the anchor is a number, the one thing independently managed rosters agree on. Requiring it would reject every pre-v1.0.0 envelope as `malformed`; so it is always emitted and always tolerated absent. It is stamped from the roster and never accepted as tool input — an anchor a caller can set is not an anchor |
| **A wire anchor that resolves to nobody local is kept** | With a null anchor the addressee check failed open ([ADR-0018](./0018-receive-side-enforces-sender-invariants.md)); retaining the number makes that attempt fail the comparison and surface in `rejected`. Translation runs first, so a record can never hold a name and a number that disagree |
| **Compatibility requires a coordinated upgrade** | A peer below `v1.0.0` rejects a `/2` message as `skipped.unsupported_version` while the sender still sees `delivery.ok: true`. The whole wire delta was spent at once so the window closes on its own |

Two test fixtures had named the *next* version as the unknown one — a pattern that self-invalidates on every bump; both moved to `/9`. The surviving `AGENTBUS/1` strings are written as literals, never against the emitted constant, so a future bump cannot quietly retarget them.

## Consequences

- `PROTOCOL_SENTINEL = "AGENTBUS/2"` (v1 `src/config.ts:26`); `SUPPORTED_PROTOCOL_SENTINELS = {"AGENTBUS/2", "AGENTBUS/1"}` (`:40`); `SERVER_VERSION` (`:51`) is the wire-compatibility gate the freeze doctrine keys on, not a feature counter. Decode: v1 `src/envelope.ts:308-314`; `to_user_id` optional at `:60`.
- The freeze doctrine follows from this ADR: a wire change is a coordinated **send freeze**, never an ordering; an instruction never names a version number; only `agentbus_status` says what a machine runs (analysis bundle, `governance-docs` key_facts[28]).

Pinned by (v1 `test/envelope.test.ts`): `:122` emits the v2 sentinel literally; `:172` a v1-framed envelope still decodes; `:181` v1 and v2 frames decode to the same value; `:309` unknown sentinel version skipped without throwing; `:319` reported as `unsupported_version`, never `malformed`; `:400` a `/1`-framed `REPLY` still decodes; `:415`, `:423` `to_user_id` accepted present and absent; `:435` rejected on a `BROADCAST`; `:454` stays out of the human-plane header.

## Relevance to Conmuta

- **D1 wire policy is this ADR verbatim:** emit `AGENTBUS/2`, accept `/1` and `/2`; **no wire change in v2**. Any future wire change only by ADR with a **per-binding** coordinated send freeze — the one adjustment, because under [ADR-0028](./0028-project-scoped-bijective-binding.md) the freeze scope is a binding, not a machine roster. The doctrine is restated in the [CONSTITUTION](../01-constitution/CONSTITUTION.md).
- **Migration (B-13) is the compatibility window that matters.** The production team stays on v1 until migrated; a v2 daemon and a v1 bridge in the same group must read each other, which this ADR guarantees as long as v2 emits nothing above `/2`.
- **N-party tribunal (B-10)** would need `AGENTBUS/3` under this exact doctrine; D7 deliberately ships 2-party Arena-light as markers to avoid it.
- Per-message versioning stays closed permanently. Analysis verdict: YES (`governance-docs` key_facts[21]).
