# ADR-0013 — Sender-side abandonment: `basis: "abandoned"`

| Field | Value |
|---|---|
| Status | inherited-valid |
| Date | 2026-08-15 (v0.5.0) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-13 |
| Inheritance verdict | YES in `maps[governance-docs]`; load-bearing for `bus-v2-landing-architecture-001` D7 (`ESCALATE`) |
| Related | [ADR-0007](./0007-loop-prevention.md), [ADR-0009](./0009-ack-non-closing.md), [ADR-0012](./0012-adversarial-audit-governing-rule.md), [ADR-0019](./0019-local-closure-abandoned-exception.md) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

[ADR-0012](./0012-adversarial-audit-governing-rule.md) deferred a closure path for the originator and recorded that the coordinated-upgrade window would expire. What forced the decision was not what ADR-12 anticipated: its output cap keeps the oldest `MAX_SURFACED_THREADS` entries because oldest means most overdue, and applied to `outbound_pending` that ordering lets orphaned threads — the oldest, which the originator cannot close — occupy the visible window permanently and hide newer, answerable work. The cap converted unbounded growth into starvation of the very list it protected; the live rollout already showed it, since repeatedly probing an unreachable peer mints a fresh thread each time (`openspec/changes/telegram-agent-bus/design.md:293-319`).

## Decision

One new `basis` value on `RESOLVED`, usable only by the agent that opened the thread (`ABANDON_BASIS_VALUE`, `src/envelope.ts:28`).

| Option | Verdict |
|---|---|
| New envelope `type: "CANCELLED"` | Rejected: a fifth type touches the closed type set, the state machine, the needs-action filter and every decoder — a large wire delta for a transition `RESOLVED` already performs correctly |
| New `basis` value, sender-scoped | **Chosen:** one enum member; the receive side's `RESOLVED` branch already sets `status: "resolved"` and `resolved_by` |
| Local-only cancellation, no wire change | Rejected: leaves two bridges disagreeing about whether a thread is open — the ambiguity ADR-0009 and ADR-0011 exist to eliminate; a peer that did receive the `REQUEST` would keep working on something already abandoned |

**Where the rule inverts.** `abandoned` is the one basis the originator may use and the addressee may not; a wrong-originator attempt is rejected as `NOT_ORIGINATOR` (`src/tools/send.ts:310`), a distinct code from `NOT_ADDRESSEE` because "you did not open this" and "this is not addressed to you" are different mistakes with different fixes. The abandonment must be addressed to the thread's original `to`. No loop opens: `RESOLVED` stays terminal. The receive side mirrors it — `from === existing.to || (from === existing.from && basis === "abandoned")` (`src/protocol.ts:114`; v1 hard rule 9, `docs/functional-audit/HANDOFF.md:297-326`).

**Deliberately outside the low-risk set.** `abandoned` is not added to `RESOLVED_LOW_RISK_BASIS` (`src/envelope.ts:18-29`): that list maps 1:1 to the spec's exhaustive low-risk set, and its provenance is what lets [ADR-0006](./0006-autonomy-boundary.md) layer 4 call itself fail-closed. Stated plainly under ADR-0012's rule: the separation is **documentary** — the list has no independent runtime enforcement; the mechanical boundary is the enum itself plus the `approval_ref` requirement on `human-approved`. A test pins the provenance so the claim cannot drift.

## Consequences

- **Coordinated upgrade required.** `envelopeSchema` rejects an unknown `basis` as `malformed`, so a peer below v0.5.0 silently discards an abandonment while the sender sees `delivery.ok: true`. Shipped while one node was live, so the upgrade was one reinstall; nobody sends an abandonment until every node reports `server_version >= 0.5.0`.
- **Accepted, not fixed: secret-backstop false positives.** `SENSITIVE_ENV_KEY_RE` matches `KEY` as a substring (`src/secrets.ts:14`), so ordinary technical prose (`primary_key = id`) is rejected, and the global scan of ADR-0012 increases this. Left broad on purpose: narrowing detection in the same change that fixes a bypass would trade a known false positive for an unknown false negative; tightening is a separate decision requiring its own evidence.
- `abandoned` later became the single exception to "never apply an undelivered state change locally" ([ADR-0019](./0019-local-closure-abandoned-exception.md); v1 hard rule 11).

## Relevance to Conmuta

**Verdict: inherited-valid, and load-bearing for Arena-light.** D7 maps `ESCALATE` = `RESOLVED`[basis `abandoned`] + marker: a debate that fails to reach consensus is closed by its proposer with the one basis that already belongs to the originator, so escalation needs no new type and no wire change. The v1 migration cohort (backlog B-13) runs v1.0.1/v1.0.2, above the v0.5.0 gate, so no compatibility window reopens. The secret-backstop breadth question remains a separate decision; Invariant 2 adds a second consumer of the token-shape rule (the pre-commit / `doctor` validator over project files), which is evidence to weigh when that decision is taken — it is not decided by the DECISION RECORD.
