# ADR-0019 — Local closure: the one exception to "never apply an undelivered change"

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-valid |
| **Date** | 2026-08-15 (shipped with v1 `v0.6.0`, tag `55dfbc3`) |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:411-423` (ADR-19); v1 hard rule 11 (v1 `docs/functional-audit/HANDOFF.md:321-323`). The ADR exists because the tribunal objected that a rule-11 exception was too structurally significant to live only in a task file (v1 `HANDOFF.md:360`) |
| **Supersedes / superseded by** | — / — |

## Context

`sendTool` reached `applyEnvelope`/`saveState` only after a successful transport. So when the group was down and the peer was gone, an agent trying to `abandoned` its way out of an orphan thread could not: the network failure blocked the local cleanup and the thread was stuck forever — in the precise scenario ADR-0013 created `abandoned` for, on a bus where every probe to an unreachable peer mints another one.

This ADR exists because the rule it breaks is a hard invariant. An exception whose only written home is a task file is how the exception gets deleted by the next refactor.

## Decision

**The carve-out is exactly one basis, and the sweep that justifies it is the argument.** `envelope.ts` defines `abandoned` as the one basis that "asserts nothing about the peer, touches no repository"; the other four say something about work that was done. Every other transition is an assertion to a peer: an undelivered `ACK` applied locally is a lie — my thread reads acknowledged while theirs does not — and an undelivered work-basis `RESOLVED` is worse, because I would believe I had closed something the originator is still waiting on. A failed outbound `REQUEST` correctly opens no local thread, and `BROADCAST` carries no sender-side state at all. `abandoned` is genuinely unique.

| Piece | Rule |
|---|---|
| **The call still rejects** | Returning `ok: true` with a flag was considered and rejected: reporting success when nothing was delivered is the `delivery.ok: true` lie the v1 audit existed to remove. The thread closes, `closure_delivered` goes `false`, and the error states plainly that the state changed and the peer was never told |
| **Apply, mark, surface** | Apply the closure; mark it never-announced; surface it in `unannounced_closures` on every response, compact ticks included, until the announcement is re-sent. Without the second and third the fix would trade a stuck thread for a silent divergence — the same trade refused in [ADR-0016](./0016-quiet-tick-digest-over-discrete-state.md) ("summarize, never suppress"). The confirming case: an addressee who was offline comes back to an open thread and may start work nobody wants |
| **Two tests forbid generalizing it** | An undelivered `ACK` leaves state untouched; an undelivered work-basis `RESOLVED` leaves state untouched. If either is deleted, the carve-out becomes silent divergence |

## Consequences

- Implemented in the send path (v1 `src/tools/send.ts:413-450`), where `closure_delivered: false` is written at the one call site that applies without delivery; `applyEnvelope` sets it `true` on every delivered resolution (v1 `src/protocol.ts:326-327`).
- `unannounced_closures` rides every fetch response (v1 `src/tools/fetch.ts:295`, `:918`).
- The v0.6.0 migration derived `closure_delivered = true` for pre-existing resolved threads precisely because version 1 never applied without delivery ([ADR-0015](./0015-state-integrity-validate-quarantine-migrate-once.md)).

Pinned by (v1 tests): `test/tools/send.test.ts:904` an `abandoned` whose transport fails still closes locally, marked never announced; `:928` an `ACK` whose transport fails leaves state unchanged; `:959` an `abandoned` that does deliver is marked announced; `test/tools/fetch.test.ts:1193` a locally closed thread is reported until the announcement is re-sent; `:1223` a normally closed thread is not reported as unannounced.

## Relevance to Conmuta

- **Carries verbatim.** Rule 11 — never apply an undelivered state change locally, except `abandoned` — is carried by this ADR (not restated in the [CONSTITUTION](../01-constitution/CONSTITUTION.md), whose §6 lists v1 hard rules 1–7 only).
- **Where it runs moves.** Under D3 thread state lives in the daemon's ledger and the daemon performs every `sendMessage`, so the carve-out is applied by the daemon on behalf of the client. A thin client that cannot reach the daemon receives `DAEMON_DOWN` and applies nothing, because it holds no state (D3). The transport failure this ADR handles is therefore Telegram being unreachable from the daemon, not the daemon being unreachable from the client — two different errors that must not be conflated in the F1 SDD spec.
- **Arena-light reuses the basis.** D7 encodes `ESCALATE` as `RESOLVED[basis abandoned] + marker`; when the group is down, an escalation that cannot be delivered follows this ADR — closed locally, surfaced in `unannounced_closures` until re-announced.
- Analysis verdict: YES (analysis bundle, `governance-docs` key_facts[19]).
