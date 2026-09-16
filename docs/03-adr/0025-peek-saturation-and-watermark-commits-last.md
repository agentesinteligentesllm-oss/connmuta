# ADR-0025 — A blind spot announced out loud, and a watermark that commits last

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-valid — the rules carry; the two mechanisms bound to [ADR-0024](./0024-channel-doorbell-not-a-second-reader.md)'s peek follow its revisit in F4 |
| **Date** | 2026-08-25 (unversioned; commit `82a1841`). Tribunal consensus recorded as 2026-08-26 |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:539-560` (ADR-25); audited in debate `agentbus-channel-fixes-audit-001` — the third addressing branch is the auditor's finding |
| **Supersedes / superseded by** | — / — |

## Context

The tribunal audit of ADR-0024's implementation found two defects the design was silent about, both v1's signature failure shape wearing new hats. This ADR records them, the reasoning behind their fixes, and the two claims that were **refuted** — because a rejected objection that is not written down comes back.

## Decision

| Finding | Rule |
|---|---|
| **The peek window is finite and cannot page past itself** | `getUpdates` anchored at a cursor only `agentbus_fetch` advances, with a window of 100 (Telegram's per-call ceiling). Fill it with other people's traffic and everything newer is invisible; the naive implementation reported that as silence — the doorbell going quiet exactly when the bus is busiest. Paginating is not available: reading update 101 requires a higher offset, which *confirms* the batch. **Non-destructive and paginating are mutually exclusive under the Bot API.** So a full window that yielded nothing rings a **saturation event** (`saturated="true"`, `count="0"`) that names the blindness. Fail-closed: "nothing for me" is a conclusion the watcher is not entitled to draw |
| **Rung once per cursor value, not once per tick** | While the cursor sits still the agent has been told everything; once `agentbus_fetch` moves it and the window is still full, that is a new episode. `MAX_BATCH` equals the peek limit, so each fetch advances up to a full window and progress is monotone |
| **The watermark commits after delivery, not before** | It originally advanced before anything was pushed, with no `try` around delivery: a transport error killed the watcher for the session and consumed the announcement on the way out. Delivery is now injected into the watcher rather than called by the loop, because a guarantee enforced one file away from the one that declares it is a guarantee waiting to drift. Stated without overselling: this closes the window in our own I/O only; the platform dropping an accepted event is its documented contract |
| **The doorbell and `agentbus_fetch` must resolve the addressee identically, and twice they did not** | The group plane first compared the raw `to` (the sender's namespace); the first fix lost the third branch of `translateAddressee` — `reverseRosterLookup(anchor) ?? to` has three outcomes (names us, names another member, resolves to nobody) and only the third falls back to the string. **When two readers must agree exactly, copy the expression rather than paraphrase it.** The fallback is required: every release through v0.6.0 emits no anchor |
| **Refuted (1): "an unreadable DM rings but fetch shows nothing — a ghost doorbell"** | The event carries `unreadable="N"` and `fetch` reports `skipped.unsupported_version` unconditionally — the early warning that a peer speaks a protocol this node cannot read. v1 had already paid for that blindness once, with one node degraded one-way for days under the sentinel bump |
| **Refuted (2): "the watcher causes a 409"** | A 409 is Telegram's, raised when two pollers share one token; `BRIDGE_BUSY` is the local lockfile and is the mechanism that *prevents* the 409. The real cost is recorded instead: contention ~2% of ticks per watcher, N armed sessions share one lockfile, `retryable: true` is advisory |
| **The thundering herd is documented, not fixed** | Every session on a machine shares one home and one cursor: the first to fetch consumes the batch for all, so the doorbell rings in N sessions and N−1 find an empty box after being told to look. The race predates the channel; a singleton watcher would be strictly worse. Arming exactly one session is the remedy, stated as a rule |

## Consequences

- Saturation event: v1 `channel/notify.ts:90-103`; once-per-cursor state and commit-last tick: `channel/watcher.ts:98`, `:112-130`; copied addressee expression: `channel/peek.ts:63-83` mirroring `src/tools/fetch.ts:429-433`. `MAX_BATCH = 100` (v1 `src/config.ts:74`).
- Compatibility: none required.

Pinned by (v1 tests): `channel/watcher.test.ts:334` full window with nothing relevant rings saturation; `:350` a window that is not full stays silent; `:363` a saturated window that surfaced something rings the real event; `:379` once per cursor value; `:397` still-full window after the cursor moved rings again; `:429` a failed delivery does not consume the announcement; `:461` failed delivery degrades to a warning; `:486` every reported notification went through `deliver`; `:518` contents first, blindness second; `channel/peek.test.ts:240`, `:251`, `:267`, `:322`, `:345` the three-way addressee resolution, both ways.

## Relevance to Conmuta

- **Rules that carry as written.** *Commit the watermark last* is Invariant 3 in daemon form — "every update is written to the durable inbox before the offset is confirmed" ([CONSTITUTION](../01-constitution/CONSTITUTION.md)). *Copy the expression, never paraphrase it* is carried by this ADR as the rule for any two readers that must agree (not restated in [GOVERNANCE](../01-constitution/GOVERNANCE.md)). The two refutations stay refuted and are recorded here; their originating debate `agentbus-channel-fixes-audit-001` is listed in the [tribunal index](../05-tribunal/INDEX.md), so they are not re-litigated.
- **Mechanisms bound to the peek.** Saturation exists only because the v1 watcher could not page without consuming; under D3 the daemon is the sole consumer and pages continuously into a durable inbox, so whether any finite window remains for a doorbell to be blind behind is decided by the F4 SDD change, together with the signal source of the adapter (see ADR-0024).
- **The thundering herd is what D4's per-client cursors are for.** Two clients of one binding each read the inbox through their own cursor, so one client's fetch no longer empties the box for the other. Under ADR-0012's governing rule this guarantee needs a test that can fail; the F1 SDD spec owns it and [DATA-MODEL](../02-architecture/DATA-MODEL.md) drafts `client_cursors`.
- The 409 clarification is now structural: Invariant 3 says a second daemon instance refuses to poll. Analysis verdict: YES (analysis bundle, `governance-docs` key_facts[25]).
