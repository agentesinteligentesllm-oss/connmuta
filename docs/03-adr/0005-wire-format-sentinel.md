# ADR-0005 — Wire format: sentinel-prefixed single-line JSON (with amendments 05a, 05b, 05c)

| Field | Value |
|---|---|
| Status | inherited-valid (FROZEN — any change is a coordinated send freeze by ADR) |
| Date | 2026-08-14 (original); amendments 2026-08-15 (05a v0.1.2, 05b v0.2.0, 05c v0.3.0) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-05, ADR-05a, ADR-05b, ADR-05c |
| Inheritance verdict | YES (frozen) in `maps[governance-docs]`; `bus-v2-landing-architecture-001` D1 wire policy |
| Related | [ADR-0011](./0011-eid-dedup.md), [ADR-0021](./0021-agentbus-2-accept-both-decoder.md) (`AGENTBUS/2`, accept both), [ADR-0023](./0023-wire-ceiling-reported.md) (wire ceiling) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree"). Example identities below are placeholders, not production data.

## ADR-05 — Base decision

### Context
One Telegram text message must carry one envelope, identically on both channels of [ADR-0004](./0004-dual-channel-delivery.md), and human chat in the same group must be rejectable without parsing (`openspec/changes/telegram-agent-bus/design.md:88-94`).

### Decision
`AGENTBUS/1 {"type":"REQUEST",...}` — a sentinel prefix followed by single-line JSON. Identical bytes on both channels. Version lives only in the sentinel, so an unknown version is skipped without parsing.

Rejected: multi-line pretty JSON (fragile reassembly); markdown-styled human format (ambiguous parse boundary); version inside the JSON (duplicates the sentinel); different payloads per channel (copies could diverge and ADR-0011's dedup would become unverifiable).

### Consequences
Non-envelope chat is rejected on a string prefix before any `JSON.parse`. Accepted trade-off: raw JSON is less pretty for humans, on the premise that `body` carries plain prose and stays legible inline. That premise is what the three amendments repair.

## ADR-05a — Amendment (2026-08-15): the legibility premise is enforced, not assumed

**What happened.** The first live `REQUEST` rendered as an unreadable wall: literal `\n\n` and `\"` everywhere. The premise "body stays legible inline" is only true for single-line, escape-free prose, and nothing enforced it (`design.md:96-112`).

**Decision.** Keep the wire exactly as ADR-05 specifies; make its premise an invariant. `normalizeBody` (`src/envelope.ts:260`) runs inside `validateInput`, at the single point every later stage reads from: it drops non-whitespace control characters, collapses every whitespace run (newlines included) to one space, and rewrites straight double quotes as paired typographic quotes. It never lengthens the string, so the `MAX_BODY_CHARS` pre-check on the raw body stays a valid upper bound.

Alternatives rejected again, with evidence:

| Option | Why rejected |
|---|---|
| Human-readable line alongside the envelope | The anchored decoder `/^AGENTBUS\/(\d+) (.*)$/s` swallows any extra line into the JSON capture → `malformed` on every deployed node; a coordinated upgrade |
| Same, human line first | All of the above plus an envelope-injection vector; "machine line first, first-match-wins" was believed the only injection-proof ordering (revised by 05b) |
| Duplicating the body as a human render | Blows the length budget: a 3000-char body already encodes to 3206 chars |
| `parse_mode:"HTML"` with the whole message in `<blockquote expandable>` | Mechanically viable (entities are metadata; `Message.text` stays the raw text) but collapses the JSON including the body humans want to read (revised by 05c) |
| Different payloads per channel | Unchanged from ADR-05 |

**Second defect fixed in the same pass.** `TELEGRAM_MAX_TEXT_CHARS` (4096) was declared and tested but never referenced by production code; `MAX_BODY_CHARS` (3000) caps the raw body while the wire text is the escaped body plus ~200 chars of metadata. Measured: 3000 backslashes or 3000 straight quotes encode to 6206 chars; the crossover sits near 1930. `encodedTextExceedsTelegramLimit` (`src/envelope.ts:283`) now runs after `encodeEnvelope` and before any transport, rejecting locally as `BODY_TOO_LONG` with no channel touched (`src/tools/send.ts:570`; constants at `src/config.ts:55,57`).

## ADR-05b — Amendment (2026-08-15): two-plane message layout

**What happened.** 05a made the body legible but the group post still *was* the envelope: a human met raw JSON first and prose second (`design.md:114-154`).

**Decision.** Split one message into a human plane and a machine plane, in that reading order — a fixed five-line shape independent of body content:

```
REQUEST · @alice-agent → @bob-agent · thread 0d34a07d32e8
                                          ← blank
<single-line normalized body>
                                          ← blank
AGENTBUS/1 {"eid":"f7cf2cd9919f","type":"REQUEST",…}
```

`SENTINEL_LINE_PATTERN` moves to `/^AGENTBUS\/(\d+) (.*)$/gm` and `decodeEnvelope` takes the **last** match (`src/envelope.ts:153, 298`). One encode path still feeds both channels, so copies stay byte-identical and ADR-0011 is unaffected. The sentinel stays `AGENTBUS/1`: the schema is unchanged, only the text around it moved.

**Re-evaluation of 05a's four reasons.**

| 05a claim | Status |
|---|---|
| First-match-wins is the only injection-proof ordering | Incorrect as stated. Last-match-wins is equally injection-proof and sound: `normalizeBody` forbids newlines, so a body can open a competing sentinel line but can never place anything *after* itself; the real envelope is always the final line |
| Breaks every deployed decoder; coordinated upgrade | Correct and accepted, at its historic minimum cost (one operational node at the time) |
| Duplication blows the length budget | Half correct: the practical prose ceiling drops from ~1930 to ~1900 chars; no cap change, because the two-tier model (raw cap + precise encoded gate) already absorbs it |
| HTML collapses the JSON including the body | Correct only for the variant evaluated (whole message in the blockquote); a sentinel-only variant is unaffected → deferred on testability, then resolved by 05c |

**Injection analysis (load-bearing).** Exactly three text sources exist: the header, built only from enum- or regex-constrained fields (`type`, `from`/`to` via `AGENT_ID_PATTERN`, `thread` via `THREAD_PATTERN`, `basis` enum — `approval_ref`, the only free-text field, is deliberately excluded and stays inside the JSON, `src/envelope.ts:161`); the body, single-line by invariant; and the JSON line, since `JSON.stringify` never emits a raw newline. Independently, [ADR-0010](./0010-roster-three-roles.md)'s inbound identity check overwrites `from` with the roster identity resolved from the real Telegram sender id, so a forged `from` is inert even if a forged envelope were ever decoded.

**Deployment gate (hard) — the origin of the freeze doctrine.** Compatibility is one-directional: v0.2.0 reads v0.1.x, but v0.1.x counts a v0.2.0 message as `skipped.non_envelope` and silently drops it while the sender sees `delivery.ok: true`. **No node may send the new format until every roster member runs it.**

## ADR-05c — Amendment (2026-08-15): HTML presentation, and the difference between a wire change and a render change

**Decision.** Send `parse_mode:"HTML"`, bold the header, wrap **only** the sentinel line in `<blockquote expandable>`; the prose stays outside, so 05a's objection does not apply and the JSON collapses to a one-tap disclosure (`design.md:156-179`).

**Measured, not argued.** Before code was written, the exact payload was sent to the live Bot API with a body built to break HTML parsing (`<`, `>`, `&`, literal `&amp;`/`&lt;`, a literal `<blockquote>` tag, typographic quotes):

| Check | Outcome |
|---|---|
| `Message.text` returned by Telegram vs `encodeEnvelope`'s canonical text | byte-identical |
| Entities applied | `bold`, `mention`, `expandable_blockquote` |
| v0.2.0 decoder on the stored text | finds the sentinel, JSON parses, `body` round-trips exactly |
| v0.1.x decoder on the stored text | does not match — unchanged from v0.2.0, not a new break |

Telegram carries markup as `MessageEntity` metadata and stores the un-escaped inner text, so **no coordinated upgrade is required**: this is a render change, not a wire change — the first change in the 05 series safe to deploy unilaterally.

**Consequences for the code.** `encodeEnvelope` remains the canonical form — the bytes Telegram stores, peers decode, and the length guard measures (the 4096 limit applies after entity parsing); `renderMessageHtml` is a presentation of those bytes, with `deliveredText(renderMessageHtml(e)) === encodeEnvelope(e)` asserted in tests including the hostile body. `&` is escaped first.

**Second defect closed.** The 05b gate was unenforceable: `agentbus_status` exposed only the wire sentinel, which does not change between releases. `server_version` was added, sourced from a single `SERVER_VERSION` constant asserted against `package.json` (`src/config.ts:51`). This is the origin of the doctrine "`SERVER_VERSION` is the wire-compatibility gate, not a feature counter".

## Relevance to Conmuta

**Verdict: inherited-valid and FROZEN.** This ADR series *is* the wire, and D1 fixes the v2 wire policy: **emit `AGENTBUS/2`, accept `/1` and `/2`; NO wire change in v2; any future wire change only by ADR with a per-binding coordinated send freeze.** The emit/accept split lives in `src/config.ts:26,40` (`PROTOCOL_SENTINEL`, `SUPPORTED_PROTOCOL_SENTINELS`; [ADR-0021](./0021-agentbus-2-accept-both-decoder.md)). `encodeEnvelope`, `decodeEnvelope` and `normalizeBody` are reused as a library (D1).

Three v2 decisions rest directly on the wire/render distinction established here:
- **Arena-light (D7)** is implemented as body-marker subtypes over the existing types (`PROPOSAL` = `REQUEST`[marker]; `AUDIT`/`COUNTER` = `REPLY`[marker + verdict token]; `CONSENSUS` = `RESOLVED`[existing basis]; `ESCALATE` = `RESOLVED`[`abandoned`] + marker) precisely so that no new envelope type — which would mean `AGENTBUS/3` — is needed. Payloads are pointer-only under the effective ceiling of 1,921 chars ([ADR-0023](./0023-wire-ceiling-reported.md)).
- **Version observability (amendment A1, backlog B-14):** the build/wire version rides the render-only human-plane header of posts the agent sends anyway. 05c is what makes that a render change with no wire impact and no heartbeat timer.
- **Freeze doctrine** (inherited governance, [CONSTITUTION](../01-constitution/CONSTITUTION.md)): a wire change is a coordinated send freeze, never an ordering; an instruction never names a version number; only the status tool says what a machine runs. With bijective bindings (D2) the freeze scope becomes **per binding** — the amendment the analysis bundle flagged as undocumented in v1 (`maps[governance-docs]` risks) and D1 now states.
