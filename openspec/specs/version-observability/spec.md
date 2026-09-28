# Version Observability Specification

## Purpose

Makes the running build and wire-protocol version visible to a human in a rendered Telegram message,
without adding anything to the wire-canonical bytes `encodeEnvelope` produces.

## Requirements

### Requirement: A named wire-version constant

The system MUST export a `WIRE_VERSION` constant naming the wire protocol version this build emits
(the digits in `AGENTBUS/2`), independent from `SERVER_VERSION`.

#### Scenario: WIRE_VERSION agrees with the emitted sentinel

- GIVEN `shared/envelope.ts`'s `PROTOCOL_SENTINEL`
- WHEN `WIRE_VERSION` is compared against the digits `PROTOCOL_SENTINEL` emits
- THEN they match

### Requirement: Human-plane rendering only

`renderMessageHtml` MUST render both `SERVER_VERSION` and `WIRE_VERSION` to the human plane.
`renderHeader` and `encodeEnvelope`'s wire-canonical output MUST NOT change.

#### Scenario: Rendered message shows both versions in the bold header line

- GIVEN an envelope is rendered for a Telegram message via `renderMessageHtml`
- WHEN the resulting HTML is inspected
- THEN both `SERVER_VERSION` and `WIRE_VERSION` appear inside the leading `<b>...</b>` header line
- AND neither appears inside the collapsible `<blockquote expandable>` sentinel line

#### Scenario: Wire bytes are unchanged

- GIVEN the same envelope
- WHEN `encodeEnvelope`'s output is compared before and after this change
- THEN the bytes are byte-for-byte identical

## Traceability

| Source | Requirement / Scenario |
|---|---|
| Decision 5, `bus-v2-f3-explore-decisions-001` | New `WIRE_VERSION`; rendered only in `renderMessageHtml` |
| B-14, amendment A1 | Build/wire version made visible to a human |
| ADR-05b/ADR-05c | `renderHeader`/`encodeEnvelope` wire-canonical text must never change |
| `shared/version.ts` `SERVER_VERSION` | Existing single-source-of-truth pattern `WIRE_VERSION` follows |
