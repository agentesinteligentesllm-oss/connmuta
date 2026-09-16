# ADR-0018 — The receive side enforces what the sender promises

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-revisit — the fail-open null-anchor branch conflicts with Invariant 4 (no fail-open anchors); reconciliation without a wire change is owed by the F1 SDD spec (see [INDEX](./INDEX.md), [ADR-0028](./0028-project-scoped-bijective-binding.md) Consequences, [THREAT-MODEL §5.7](../02-architecture/THREAT-MODEL.md)); see Relevance |
| **Date** | 2026-08-15 (shipped with v1 `v0.6.0`, tag `55dfbc3`) |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:397-409` (ADR-18); the `abandoned` arm is v1 hard rule 9 (v1 `docs/functional-audit/HANDOFF.md:315-317`) |
| **Supersedes / superseded by** | — / hardened by [ADR-0021](./0021-agentbus-2-accept-both-decoder.md) (wire anchor retained when it resolves to nobody) |

## Context

`checkLoopPrevention` verified five invariants on the send side. The receive side verified **one**: that the thread exists. Any roster peer could therefore close a thread it was never party to, rewriting `resolved_by` and `basis` on the way out.

## Decision

| Rule | Reason |
|---|---|
| **Authorization is evaluated before state, and the order is load-bearing** | If `status` were checked first, a third party attacking an already-closed thread would land in the benign `stale` bucket and the counter that should scream would go mute. Rejection reasons mirror the send-side codes 1:1; `not_requestable` is a strictly finer partition of `unauthorized`, and nothing moves into `stale` |
| **Identity is anchored on `user_id`, not on a name** | `to` is stored in the sender's namespace and never translated, so comparing it against the receiver's namespace is a live black hole under roster drift |
| **A null anchor fails open, by derivation** | `reverseRosterLookup` returns only roster keys, so a verified `from` is always a roster key — while a null anchor means `to` is not one. The two can never be equal, so a string fallback would reject 100% of resolutions on drifted threads. Failing open adds no attack surface because in that state the comparison cannot succeed for anyone; the acceptance is counted in `unanchored`, because a fail-open nobody can count is indistinguishable from a check that is not running |
| **Rejected envelopes carry no body and never enter `log`** | Discarding them silently would repeat the black hole `misaddressed` exists to prevent; including the prose would import text written by an unauthorized peer straight into the reading agent's context, which is what ADR-0006 layer 7 exists to stop. The `eid` is still recorded so the copy on the other plane is not reported twice |
| **Our own outbound sends skip the predicate** | `checkLoopPrevention` is the gate there; re-judging would double-judge. Not a hole: an inbound envelope can never arrive with `from` equal to our own id, because `fetchTool` overwrites `from` with the reverse-roster lookup of the real Telegram sender and self-filters first |

**Found while implementing, and worth more than the code:** a pre-existing test was defending the defect — a third roster agent ACKed a thread it was not party to, under a comment reading "`protocol.ts` itself does not require the ACK's sender to be the addressee". That was the finding written down as intended behaviour with a green test guarding it, the second such instance in the v1 programme. It also surfaced a structural fact: through the fetch path a `needs_action` thread can never legitimately receive an `ACK` or `RESOLVED`, because a request addressed to us is answered by us and our answers leave through `agentbus_send`. Every receive-side lifecycle test therefore belongs on an outbound thread.

## Consequences

- Addressee authorization with the `unanchored` outcome: v1 `src/protocol.ts:97-102`; `classifyRejection`: `:118-145`; own-send bypass: `:273-282`. The `abandoned` arm — `from === existing.to || (from === existing.from && basis === "abandoned")` — must never be dropped (v1 rule 9).
- The sender identity is the numeric `message.from.id` resolved against the roster (v1 `src/tools/fetch.ts:538`), and the rejected list is built without bodies (`:201`).

Pinned by (v1 tests): `test/protocol.test.ts:679` `RESOLVED` on a `BROADCAST`-opened thread is `not_requestable`; `:691` never-party sender is `unauthorized`; `:699` unauthorized sender on an already-closed thread is still `unauthorized`, never `stale`; `:710` legitimate addressee on a closed thread is `stale`; `:718` originator abandoning own thread accepted (rule 9 arm); `:731` originator may not resolve own thread with a work basis; `:759` renamed peer still authorized through the anchor; `:786` anchored thread not reported as `unanchored`; `test/tools/fetch.test.ts:515` third-party closure rejected, reported, no trace in state; `:554` rejected `eid` still recorded.

## Relevance to Conmuta

- **Invariant 4 (numeric-id identity + scope check on ingest) carries this ADR verbatim in every rule but one.** The [CONSTITUTION](../01-constitution/CONSTITUTION.md) states: sender = `message.from.id` verified against the binding's roster; anything else is counted (`foreign_chat` / `unknown_sender`) and dropped, never surfaced, never replied to; **no fail-open anchors**. The last clause overrides the "null anchor fails open" branch above. The override is expected to be safe because decision D5 commits one roster in `conmuta.json` (agent_id, user_id, username) shared by every participant of the binding, so the roster drift that justified failing open in v1 — four independently managed rosters — cannot arise by construction; the F1 SDD spec must confirm it without a wire change ([THREAT-MODEL §5.7](../02-architecture/THREAT-MODEL.md)). The daemon must still count what it drops; the audit log of Invariant 5 stores no rejected bodies.
- **Invariant 5 (peer content is data, never action)** inherits "rejected envelopes carry no body and never enter `log`"; the [THREAT-MODEL](../02-architecture/THREAT-MODEL.md) maps the prompt-injection fence to this rule.
- Analysis verdict: YES (analysis bundle, `governance-docs` key_facts[18]). Whether Conmuta keeps the `unanchored` counter as a diagnostic for envelopes from v1 peers (which may lack `to_user_id`, [ADR-0021](./0021-agentbus-2-accept-both-decoder.md)) during the B-13 migration is pending the F1 SDD spec.
