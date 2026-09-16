# ADR-0016 — The quiet tick: a digest over discrete state

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-valid |
| **Date** | 2026-08-15 (shipped with v1 `v0.6.0`, tag `55dfbc3`) |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:368-380` (ADR-16); implementation correction audited in debate `agentbus-v060-prd-quiet-tick-001` (design.md:374) |
| **Supersedes / superseded by** | — / completed, not corrected, by [ADR-0022](./0022-body-omission-per-entry.md) |

## Context

`agentbus_fetch`'s response was a function of the **backlog**, not the **news**. `needs_action` was recomputed from the whole thread store on every call and carried every body, so the more pending work an agent had, the more expensive it was to check whether anything new arrived. In v1's words: *a bus that is expensive to listen to gets listened to rarely, which reopens the 24-hour retention loss.* Measured on fixtures: ~2,882 tokens per tick, ~277k per working day per agent, all repetition (the production figure is larger; see ADR-0022).

## Decision

Persist a digest of the discrete work state and compare it against a freshly computed one. `unchanged ⇔ digest matches AND this batch produced zero new envelopes` — both conjuncts are needed, because a `BROADCAST` opens no thread yet is still news.

| Rule | Reason |
|---|---|
| **The compact form summarizes; it never suppresses** | A pure delta was rejected outright: it violates the `session-catchup` spec's *Unresolved REQUEST Carry-Forward* MUST, which requires every unresolved `REQUEST` addressed to the caller to appear in every response regardless of age |
| **No continuous quantities in the digest** | An early draft included the age of the oldest thread. Age is continuous, so the digest would never have matched itself and `unchanged` would have been permanently false — dead on arrival while appearing to work |
| **Quantized clock-derived quantities are required** | `reminder_count` is mandatory: a thread crossing the reminder window changes nothing else discrete about itself, so dropping it would hide the one transition the spec asks to highlight |
| **`next_update_id` is excluded** | Human chatter in the group is not agent-relevant state |
| **Entries are trimmed, not dropped** | The block design said "the summary plus every overdue entry", which contradicted its own rejection of the delta. A pre-existing test caught it. Compact entries keep `{thread, from, age_hours, reminder, acked, body_omitted}`; overdue entries stay verbatim |
| **`first_surfaced_at` is stamped only by a full tick; the digest is persisted only when `mark_seen` is true** | The compact form shows a summary, not the item; getting this backwards would make the quiet tick suppress work it never displayed. Same rule and reason as the `cursor.advanced` defect closed in v0.5.0 |

The block's "≈93% less" estimate was only reachable through the rejected shape; the measured saving is 61% at an 82-character body, 79% at 400, 90% at 1,200 — **constant at 2,948 characters whatever the bodies hold**, which is the property actually needed.

## Consequences

- The digest is a SHA-256 prefix over `id:status:ack_count:first_surfaced?:awaiting:history.length` per thread the caller is party to (v1 `src/protocol.ts:342-382`, line 378). `awaiting` and `history.length` were added by [ADR-0020](./0020-reply-and-turn-tracking.md); both are discrete, so this rule survived.
- Recorded as v1 hard rule 10, "No continuous quantities in the A4 digest" (v1 `docs/functional-audit/HANDOFF.md:319-321`).
- The compact response is decided at v1 `src/tools/fetch.ts:801-811` (`producedNews` conjunction) and reported at `:923` (`unchanged: compact`).

Pinned by (v1 tests): `test/protocol.test.ts:572` digest stable across wall-clock advance; `:584` digest changes when a thread crosses the reminder window; `:596` digest changes on ACK, resolution and first surfacing; `:609` digest ignores `next_update_id`; `:617` digest covers only the caller's threads and tracks the checkpoint; `test/tools/fetch.test.ts:1382` second quiet tick returns the compact form; `:1415` compact form carries every `reminder: true` entry verbatim; `:1434` compact form carries every raised condition; `:1457` `force_full` always returns the full picture; `:1516` `first_surfaced_at` stamped by a full tick only.

## Relevance to Conmuta

- **Carries verbatim.** Rule 10 and the governing sentence "summarize, never suppress" are carried by this ADR (not restated in the [CONSTITUTION](../01-constitution/CONSTITUTION.md), whose §6 lists v1 hard rules 1–7 only). The `fetch.ts` classification pipeline is on the D1 reuse list.
- **The economics still hold under the daemon.** D3/D6 remove the 24-hour loss while the daemon is alive, but hosts other than Claude Code still rely on a fetch cadence because no wake-up contract is verified (D6; spike B-09). A tick that is expensive when nothing happened is therefore still the thing this ADR exists to prevent.
- **Per-client state.** D4 gives the ledger per-client cursors. Where the persisted digest and `first_surfaced_at` live when two clients of one binding fetch independently (the v1 collision case at `src/tools/fetch.ts:500-930`, verified facts) is to be specified in the F1 SDD spec; the draft tables are in [DATA-MODEL](../02-architecture/DATA-MODEL.md).
- Analysis verdict: YES (analysis bundle, `governance-docs` key_facts[16]).
