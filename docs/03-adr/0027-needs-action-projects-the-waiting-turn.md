# ADR-0027 — `needs_action` describes the turn that is waiting, not the thread's opening

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-valid |
| **Date** | 2026-09-09 (unversioned; v1 HEAD `bf8f365`, author date 2026-09-08). Tribunal `APPROVE_WITH_CHANGES` then consensus, 2026-09-09 |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:592-626` (ADR-27); audited in debate `agentbus-needs-action-muestra-apertura-001` |
| **Supersedes / superseded by** | refines the payload of [ADR-0020](./0020-reply-and-turn-tracking.md) / — |

## Context

`isNeedsAction` has meant *"is it my turn"* since ADR-0020 — `opened_type === "REQUEST" && status === "open" && awaiting === me` (v1 `src/protocol.ts:476`). But every field of the entry it produced still described the thread's **opening**: `from`, `eid`, `body`, `sent_at`, `via` and `telegram_message_id` all read from the opening record. The predicate was redefined by turns; the payload was not. For a thread we opened ourselves, `needs_action` reported `from: <ourselves>` and showed our own message from days ago, while the reply actually awaiting an answer lived only in `agentbus_thread`.

**Provenance, recorded because it is the point.** This was not found by an audit. The human operating the interactive half of the production team's referee ran `agentbus_fetch` in its first hour of real use and reported, with the right hedge, that the body shown was the opening and the `REPLY` was in the transcript. It reproduced on the other node immediately. Two ADR-level defects had passed over this code without seeing it; using it found it the same day.

## Decision

The entry describes the **message awaiting an answer**. `from`, `eid`, `body`, `sent_at` and `via` project it; `thread`, `age_hours`, `reminder`, `acked` and `ack_count` stay as they are, because those are properties of the thread and not of a message.

| Option | Verdict |
|---|---|
| **Project the waiting turn, fall back to the opening** | **Chosen.** No new field, no schema change, single-turn output unchanged |
| Project the tip of the history | Rejected — an `ACK` does not move the turn (ADR-0009), so after we acknowledge a peer's `REQUEST` the tip is **ours** while the answer is still owed; projecting it would hand us back our own acknowledgement as the thing to answer, strictly worse than the opening |
| Add `latest_body` beside the opening | Rejected — two bodies per entry doubles the cost [ADR-0022](./0022-body-omission-per-entry.md) exists to bound |
| Add `message_id` to `HistoryEntry` | Rejected — a state schema change with the migration that implies, refused for a convenience field |

Three consequences of the choice:

- **The last message that is not ours — not the last message.** The refinement came from reading the code rather than from the proposal.
- **No field was added, and `age_hours` was the temptation.** An entry can read "48 hours old" beside a message from three minutes ago; that is not a contradiction — `age_hours` measures the thread and `sent_at` measures the message. The auditor's call, and correct.
- **`telegram_message_id` is omitted for a projected turn.** `HistoryEntry` carries no message id; keeping the opening's id beside a later body would be a pointer that resolves to the wrong message, which is worse than no pointer. The field is optional precisely so its absence can be stated.

A single-turn thread is byte-identical to before: with nothing to project, the opening *is* the waiting turn. That is what bounds the risk.

**One correction to the audit, recorded rather than silently skipped.** The auditor's single objection was that `first_surfaced_at` must reset when a turn arrives or ADR-0022's per-entry stamping would hide the new body. The reasoning is right and the code already did it (v1 `src/protocol.ts:310` clears it in the `REPLY` branch). Accepting an objection and not implementing it would be exactly the drift v1 kept catching, so it is written here instead. The auditor also proposed numbering this ADR-23; that number belongs to the wire ceiling, and the collision was caught by checking the file rather than trusting the count.

## Consequences

- Projection at v1 `src/tools/fetch.ts:684-709` (`body: wrapUntrusted(turn ? turn.body : record.body)`). Compatibility: none required — no wire, envelope or state change; `SERVER_VERSION` unmoved. What *is* visible is the shape of one tool's output, which every agent's prompt reads; that is why it is an ADR rather than a bugfix line.
- Verified by mutation: projecting the tip, keeping `telegram_message_id` unconditionally, and restoring the opening body each turned the suite red (512 tests, baseline 507).

Pinned by (v1 `test/tools/fetch.test.ts`): `:2012` `telegram_message_id` omitted for a projected turn; `:2040` a single-turn thread is unchanged; `:2056` our own `ACK` is never the projected turn.

## Relevance to Conmuta

- **Carries verbatim** in the reused fetch pipeline (D1). For Arena-light (D7) it is load-bearing: `AUDIT` and `COUNTER` are `REPLY` turns, so a debate participant's `needs_action` entry must show the peer's latest turn, which is exactly "the last message that is not ours".
- **A governance lesson, not only a fix.** Real use found in one hour what two ADR-level audits had missed. The [GOVERNANCE](../01-constitution/GOVERNANCE.md) rule that every guarantee is pinned by a test that can fail (ADR-0012) is necessary and not sufficient; the F7 referee role (backlog B-01) is the first v2 consumer of `needs_action` and should be exercised on a real binding before F5 declares Arena-light done ([WORK-PLAN](../07-plan/WORK-PLAN.md)).
- **Number collisions are a process risk.** This register keeps one file per ADR and a single [INDEX](./INDEX.md) precisely so that the next number is read from the tree, never recalled.
- Analysis verdict: YES (analysis bundle, `governance-docs` key_facts[27]).
