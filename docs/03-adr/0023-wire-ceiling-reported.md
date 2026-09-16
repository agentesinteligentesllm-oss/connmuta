# ADR-0023 — The wire ceiling reported, not discovered by hitting it

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-valid — D7 cites its measured ceiling directly |
| **Date** | 2026-08-16 (shipped with v1 `v1.0.1`, tag `e9bc6c2`) |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:489-507` (ADR-23) |
| **Supersedes / superseded by** | — / — |

## Context

The limit that binds a caller is not `MAX_BODY_CHARS`. ADR-0005b's two-plane layout carries the body twice, so the raw cap advertises 3,000 while the true ceiling for plain ASCII is **1,921** — measured by binary search against the real encoder — and JSON escaping lowers it further for text carrying backslashes or quotes. Nothing exposed that number; the only way to learn it was a hard `BODY_TOO_LONG` after the message was composed.

Measured across 29 real threads on one production node: mean body 1,362 characters, peak 1,845; the worst real message occupied **3,943 of 4,096 wire characters — 96.3%**, with 76 characters of body left before the wall. Nine of the last fifteen messages sat above 3,600. The bus was running at saturation and neither agent could see it.

The finding had been misfiled as "deferred — design approved" on the assumption that the HTML render addressed it; the render adds tags and does not reduce a byte. Same pattern ADR-0012 governs — the fifth recorded instance in v1.

## Decision

| Rule | Reason |
|---|---|
| **The ceiling is made visible, not moved** | Reducing bytes was considered and rejected: the duplication is ADR-0005b's basis for a legible human plane, and removing it is a wire change sealed by v1 rule 8. So every successful send reports `wire.chars`, `wire.limit`, `wire.headroom_chars` |
| **Three plain numbers, not a warning flag** | A threshold would be the tool holding an opinion about what counts as "close"; the caller composing the message is better placed to hold it. A flag goes stale the moment the composition changes; a number does not |
| **Measured off the canonical encoding** | The same bytes the guard measures and the peer decodes — never the HTML render, which is longer. Telegram's limit applies after entity parsing, so reporting the render would make the gauge read low exactly where being wrong is most expensive |
| **The ceiling stays send-side only** | `baseEnvelopeSchema.body` keeps `MAX_BODY_CHARS`. Pushing ~1,921 into the decoder would make a peer's legitimate envelope — accepted by its own encoder, sent with `delivery.ok: true` — decode here as `malformed`, in silence: the exact silent-discard failure the accept-both decoder exists to prevent. It would also be incoherent, since the effective ceiling depends on escaping |

## Consequences

- `MAX_BODY_CHARS = 3000` (v1 `src/config.ts:55`), `TELEGRAM_MAX_TEXT_CHARS = 4096` (`:57`); `WireCost` and its rationale at v1 `src/tools/send.ts:114-142`; the report computed at `:645-648`.
- Compatibility: none required — additive output field, no wire change, no state change.

Pinned by (v1 `test/tools/send.test.ts`): `:1504` the reported spend is the canonical encoding; `:1522` headroom shrinks as the body grows, and it is the body that moves it; `:1544` the decoder stays tolerant at `MAX_BODY_CHARS` — the send-side ceiling must never narrow it.

## Relevance to Conmuta

- **D7 builds on this number.** Arena-light uses pointer-only payloads with an "effective ceiling 1,921 chars, v1 ADR-23" (decision record). Because D1 forbids any wire change in v2, the two-plane duplication and therefore the ceiling stand unchanged; the verified Telegram limit is 4,096 characters per message (verified facts).
- **The report crosses IPC.** Under D3 the daemon performs the send, so `wire.*` must travel back to the thin client in the IPC response; the F1 SDD spec owns the shape ([OVERVIEW](../02-architecture/OVERVIEW.md) for the IPC contract).
- **Decoder tolerance is a migration guarantee (B-13).** A v1 bridge and a v2 daemon in one group must decode each other's maximal envelopes; the test at `send.test.ts:1544` is the one to carry.
- Analysis verdict: YES (analysis bundle, `governance-docs` key_facts[23]).
