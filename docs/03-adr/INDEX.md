# ADR index — Conmuta

> **Conmuta** is a working name pending trademark clearance (backlog B-11). Every path and
> identifier that carries the name follows the final product name.

This index is the only list of architecture decision records. One ADR per file; a decision is
changed only by a newer ADR that names what it supersedes. Statuses:

| Status | Meaning |
|---|---|
| `inherited-valid` | Carried over from v1 (`telegram-agent-bus`) unchanged. Binding on this repository. |
| `inherited-revisit` | Carried over; the decision holds, but its scope or mechanics must be re-confirmed in the F1 SDD spec. |
| `superseded` | Replaced (fully or in part) by a newer ADR named in the same row. |
| `proposed` | Accepted by the tribunal in a recorded debate, pending Director confirmation. |

Inherited ADRs were re-derived from the v1 design document
(`telegram-agent-bus/openspec/changes/telegram-agent-bus/design.md`, one section per ADR, headings at
lines 36–592); the verdict per ADR comes from the analysis bundle, `maps[governance-docs].key_facts`.
v1 debates were held per audit block, not per ADR, so the debate column for 0001–0027 is filled only
where `design.md` names one; the full v1 debate list is in
[../05-tribunal/INDEX.md](../05-tribunal/INDEX.md).

## Inherited from v1 (0001–0027)

| # | Title | Landed in (v1) | Status | Supersedes / superseded by | Debate | Note |
|---|---|---|---|---|---|---|
| [0001](0001-runtime-node-typescript.md) | Runtime: Node.js / TypeScript | untagged | `inherited-valid` | amended in part by [0031](0031-npm-distribution-and-license.md) | — | Runtime floor rises to Node ≥ 24 (D9, B-17); the "one `npx` line" distribution premise is replaced by 0031. |
| [0002](0002-build-from-scratch-minimal-deps.md) | Build from scratch, minimal dependencies | untagged | `superseded` (in part) | by [0030](0030-sqlite-ledger-and-json-registry.md) | — | The "no database" closed item is consciously reopened; the minimal-dependency stance otherwise stands. |
| [0003](0003-per-machine-subprocess-no-daemon.md) | Per-machine session subprocess, no daemon | untagged | `superseded` | by [0029](0029-per-user-daemon-and-thin-clients.md) | — | The subprocess survives as the thin client; the daemon owns token, poller and inbox. |
| [0004](0004-dual-channel-delivery.md) | Dual-channel delivery: group for humans, direct DM for agents | untagged | `inherited-valid` | — | — | Per (bot, group) pair it maps 1:1 onto a project (0028). |
| [0005](0005-wire-format-sentinel.md) | Wire format: sentinel-prefixed single-line JSON (+05a/05b/05c) | untagged; amendments dated 2026-08-15 | `inherited-valid` (frozen) | — | — | This is the wire. No wire change in v2 (D1). |
| [0006](0006-autonomy-boundary.md) | Autonomy boundary: capability isolation + fail-closed basis | untagged | `inherited-valid` | — | — | Constitution-level; layers 1–2 keep the headless runner out of the core (D6). |
| [0007](0007-loop-prevention.md) | Loop prevention in the tool layer | untagged | `inherited-valid` | — | — | |
| [0008](0008-checkpoint-windows.md) | `[CHECKPOINT-ESTADO]` windows synthesis | untagged | `inherited-valid` | — | — | Marker is wire-visible; kept as is because v2 makes no wire change. |
| [0009](0009-ack-non-closing.md) | `ACK` is non-closing; only `RESOLVED` closes | untagged | `inherited-valid` | — | — | |
| [0010](0010-roster-three-roles.md) | Roster: routing table, attribution check, access list | untagged | `inherited-revisit` | scope re-based by [0028](0028-project-scoped-bijective-binding.md) | — | Semantics unchanged; the roster becomes per binding instead of one global file. |
| [0011](0011-eid-dedup.md) | Envelope-level `eid` for cross-channel deduplication | untagged | `inherited-valid` | — | — | |
| [0012](0012-adversarial-audit-governing-rule.md) | Adversarial audit remediation + governing rule | post-v0.3.0 | `inherited-valid` | — | — | "A documented guarantee must be pinned by a test that can fail." |
| [0013](0013-basis-abandoned.md) | Sender-side abandonment: `basis: "abandoned"` | untagged | `inherited-valid` | — | — | |
| [0014](0014-group-outage-soft.md) | Group availability: the observability plane may fail alone | v0.5.1 | `inherited-valid` | — | — | A migration is never auto-followed: `chat_id` is an access-control boundary. |
| [0015](0015-state-integrity-validate-quarantine-migrate-once.md) | State integrity: validate, quarantine, migrate once | v0.6.0 | `inherited-revisit` | mechanics move to [0030](0030-sqlite-ledger-and-json-registry.md) | `agentbus-impl-plan-001` (correction, design.md:346) | Doctrine stays; the store changes to SQLite. |
| [0016](0016-quiet-tick-digest-over-discrete-state.md) | The quiet tick: a digest over discrete state | v0.6.0 | `inherited-valid` | — | `agentbus-v060-prd-quiet-tick-001` (correction, design.md:378) | |
| [0017](0017-tiered-window-floors-with-spill.md) | The tiered window: floors with spill | v0.6.0 | `inherited-valid` | — | — | Tests pin the invariant, not the numbers. |
| [0018](0018-receive-side-enforces-sender-invariants.md) | The receive side enforces what the sender promises | v0.6.0 | `inherited-revisit` | tension with constitution invariant (4) | — | v1 derives "a null anchor fails OPEN"; invariant (4) says "no fail-open anchors". Reconcile in the F1 spec without a wire change. |
| [0019](0019-local-closure-abandoned-exception.md) | Local closure: the one exception to "never apply an undelivered change" | v0.6.0 | `inherited-valid` | — | — | |
| [0020](0020-reply-and-turn-tracking.md) | `REPLY` and turn tracking | v1.0.0 | `inherited-valid` | — | — | Arena-light rides on these types as body markers, never as new types (D7). |
| [0021](0021-agentbus-2-accept-both-decoder.md) | `AGENTBUS/2`, and a decoder that accepts both | v1.0.0 | `inherited-valid` (frozen) | — | — | v2 emits `/2` and accepts `/1` and `/2` (D1). |
| [0022](0022-body-omission-per-entry.md) | Body omission decided per entry, not per tick | v1.0.1 | `inherited-valid` | — | — | |
| [0023](0023-wire-ceiling-reported.md) | The wire ceiling reported, not discovered by hitting it | v1.0.1 | `inherited-valid` | — | — | Effective ceiling 1,921 chars; governs Arena-light payloads (D7). |
| [0024](0024-channel-doorbell-not-a-second-reader.md) | `agentbus-channel`: a doorbell, not a second reader | unversioned | `inherited-revisit` | deployment re-based by [0029](0029-per-user-daemon-and-thin-clients.md) | `agentbus-channel-audit-001` | Semantics stay; the one-home-per-machine assumption is replaced by the daemon (F4 adapter). |
| [0025](0025-peek-saturation-and-watermark-commits-last.md) | A blind spot announced out loud, a watermark that commits last | unversioned | `inherited-valid` | — | `agentbus-channel-fixes-audit-001` | |
| [0026](0026-unapplied-transition-is-a-diagnostic.md) | A transition that could not be applied is a diagnostic, not news | unversioned | `inherited-valid` | — | `agentbus-orphan-transitions-001` | |
| [0027](0027-needs-action-projects-the-waiting-turn.md) | `needs_action` describes the turn that is waiting | unversioned (v1 HEAD) | `inherited-valid` | — | `agentbus-needs-action-muestra-apertura-001` | |

## New in this repository (0028–0031)

All four were accepted by the tribunal in `bus-v2-landing-architecture-001` (consensus after two
rounds) and stay `proposed` until the Director confirms.

| # | Title | Status | Supersedes / amends | Debate | Decision record |
|---|---|---|---|---|---|
| [0028](0028-project-scoped-bijective-binding.md) | Project-scoped bijective binding (bot ↔ group ↔ project) | `accepted` | re-bases the scope of 0010 | `bus-v2-landing-architecture-001` | D2, D5; invariants (1) and (4) |
| [0029](0029-per-user-daemon-and-thin-clients.md) | Per-user daemon + host-agnostic thin clients | `accepted` | 0003 (fully); re-bases the deployment of 0024 | `bus-v2-landing-architecture-001` | D3, D6; invariant (3) |
| [0030](0030-sqlite-ledger-and-json-registry.md) | `node:sqlite` ledger + JSON registry + OS secret store | `accepted` | 0002 (in part); re-bases the mechanics of 0015 | `bus-v2-landing-architecture-001` | D4; invariants (2) and (3) |
| [0031](0031-npm-distribution-and-license.md) | npm distribution and license | `accepted` | amends 0001 in part | `bus-v2-landing-architecture-001` | D9, D10 |

## Closed-permanently items and the two reopened ones

The v1 "closed permanently — do not reopen" list is inherited in
[../01-constitution/CONSTITUTION.md](../01-constitution/CONSTITUTION.md). Exactly two items are
reopened, each by a named ADR and no other: the daemon (0029) and the database (0030). Source of the
v1 list: `telegram-agent-bus/docs/functional-audit/06-verdict.md:160-177`.

## How to add an ADR

Follow the process and template in [../01-constitution/GOVERNANCE.md](../01-constitution/GOVERNANCE.md):
next free number, one file, the sections `Status · Date · Debate · Context · Options considered ·
Decision · Consequences · Supersedes · Tests that must pin it`, one row here, and one row in the
tribunal index when a debate produced it.
