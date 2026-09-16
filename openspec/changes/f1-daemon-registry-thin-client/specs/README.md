# F1 spec coverage matrix

Change: `f1-daemon-registry-thin-client`. Nine new capabilities, greenfield (`openspec/specs/` is
empty): every requirement below is `## ADDED Requirements`. Sources:
[proposal.md](../proposal.md) · [ADR-0028](../../../../docs/03-adr/0028-project-scoped-bijective-binding.md) ·
[ADR-0029](../../../../docs/03-adr/0029-per-user-daemon-and-thin-clients.md) ·
[ADR-0030](../../../../docs/03-adr/0030-sqlite-ledger-and-json-registry.md) ·
[ADR-0031](../../../../docs/03-adr/0031-npm-distribution-and-license.md) ·
[THREAT-MODEL.md §4](../../../../docs/02-architecture/THREAT-MODEL.md#4-pinning-test-register) ·
[DATA-MODEL.md](../../../../docs/02-architecture/DATA-MODEL.md).

## ADR "Tests that must pin it" coverage (22/22)

| ADR row | Capability |
|---|---|
| ADR-0028: A message never reaches another binding's group (wrong-room CI) | send-path |
| ADR-0028: One `bot_id` in at most one active binding | project-binding |
| ADR-0028: Foreign chats and unknown senders dropped | durable-inbox |
| ADR-0028: `conmuta.json` carries identifiers only | project-binding |
| ADR-0028: Launcher refuses when unbound or mismatched | thin-client-tools |
| ADR-0028: Pending unknown senders carry no body | durable-inbox |
| ADR-0029: Exactly one poller per token | daemon-lifecycle |
| ADR-0029: Stale lock reclaimed, live lock not | daemon-lifecycle |
| ADR-0029: The client never polls Telegram | thin-client-tools (runtime) + daemon-lifecycle (static, PT-07) |
| ADR-0029: No bearer before identity proof | ipc-handshake |
| ADR-0029: Secret rotates per boot | ipc-handshake (client) + daemon-lifecycle (daemon rewrite) |
| ADR-0029: Core has no exec, no timers that emit | daemon-lifecycle |
| ADR-0029: Idle shutdown respects open threads | daemon-lifecycle |
| ADR-0029: No heartbeat emission | daemon-lifecycle |
| ADR-0030: Write-ahead before offset confirm | durable-inbox |
| ADR-0030: Per-client cursors | durable-inbox |
| ADR-0030: Registry validation and quarantine | project-binding |
| ADR-0030: No token in the registry or the ledger | project-binding (registry) + ledger (ledger) |
| ADR-0030: No token in errors, logs or stacks | secret-store |
| ADR-0030: Secret store fallback is ACL'd | secret-store |
| ADR-0030: Audit log stores no rejected bodies | ledger |
| ADR-0030: Node floor | daemon-lifecycle |

## Pinning-test (PT-nn) coverage — F1-scoped ids, 28/28

| PT | Capability | PT | Capability |
|---|---|---|---|
| PT-01 | send-path | PT-15 | send-path |
| PT-02 | send-path | PT-16 | durable-inbox |
| PT-03 | durable-inbox | PT-17 | durable-inbox |
| PT-04 | durable-inbox | PT-18 | project-binding |
| PT-05 | project-binding | PT-19 | secret-store |
| PT-06 | project-binding | PT-20 | ledger |
| PT-07 | daemon-lifecycle (static) / thin-client-tools (error taxonomy) | PT-21 | daemon-lifecycle |
| PT-08 | secret-store | PT-24 | ipc-handshake |
| PT-09 | secret-store | PT-25 | project-binding |
| PT-10 | durable-inbox | PT-26 | ipc-handshake |
| PT-11 | durable-inbox | PT-27 | daemon-lifecycle |
| PT-12 | daemon-lifecycle | PT-28 | daemon-lifecycle |
| PT-13 | thin-client-tools | PT-31 | durable-inbox |
| PT-14 | thin-client-tools | PT-33 (429 half) | send-path |

## Intentionally uncovered by a capability spec

| Item | Reason | Pointer |
|---|---|---|
| PT-22 (deny-list scan) | Repository-level CI secret/identifier scan, registered phase F0/F6 in THREAT-MODEL.md; reused as an F1 success-criterion gate but owned by CI/governance, not by a product capability | THREAT-MODEL.md §4; proposal.md success criteria |
| PT-23 (Arena-light round cap) | Out of scope — F5 | proposal.md "Out of scope" table |
| PT-29 (web panel) | Out of scope — F3 | proposal.md "Out of scope" table |
| PT-30 (doorbell key set) | Out of scope — F4 | proposal.md "Out of scope" table |
| PT-32 (doctor admin flag) | Out of scope — F2 | proposal.md "Out of scope" table |
| D-08 (v1 reuse mechanism: provenance headers, AS-IS/SEAM copy) | Source-organization rule, not an observable runtime behavior; a WHAT-not-HOW item for design/tasks | v1-migration/spec.md closing note; proposal.md D-08 |
| B-07 (bot-to-bot admin visibility AND/OR) | Open spike, narrow and non-blocking per D-04/exploration Q8 item 3; no F1 requirement depends on its outcome | proposal.md "Decisions recorded" D-04; exploration.md Q8 |
| B-08 (named-pipe transport) | Deferred; F1 implements loopback HTTP + HMAC only, per D-04 | proposal.md D-04 |
| Bytes-per-hour outbound ceiling (T22 residual) | Pending Director decision (THREAT-MODEL.md §7); no backlog id yet | THREAT-MODEL.md §6, §7 |
| Windows console flash on spawn (nodejs/node#21825) | Accepted risk, verified during the daemon-lifecycle task, not a spec-level guarantee | proposal.md "Risks and mitigations" |

## Requirements and scenarios per capability

| Capability | Requirements | Scenarios |
|---|---|---|
| project-binding | 4 | 11 |
| daemon-lifecycle | 8 | 14 |
| ipc-handshake | 6 | 14 |
| durable-inbox | 7 | 13 |
| send-path | 5 | 7 |
| thin-client-tools | 6 | 8 |
| ledger | 4 | 7 |
| secret-store | 3 | 5 |
| v1-migration | 4 | 6 |
| **Total** | **47** | **85** |

## Reconciled with design (`bus-v2-f1-design-001`, CONSENSUS)

The spec yields to the design on every item below (tribunal ruling, `bus-v2-f1-design-001`).

| Item | Correction | Files touched |
|---|---|---|
| (i) | `ipc-handshake`: wrong-HMAC outcome is `DAEMON_IDENTITY_MISMATCH` (one re-read, never `DAEMON_DOWN`, never a spawn); valid-HMAC flow corrected to `POST /session` carrying `hmac = HMAC-SHA256(secret, "session:" + server_nonce)` with the bearer returned in the response; domain-separated identity HMAC label added; negative scenarios added for `DAEMON_VERSION_MISMATCH`, `IPC_ERROR`, `BINDING_CHANGED`, `BINDING_MISMATCH`, and `MAX_PENDING_HANDSHAKES` -> `HTTP_TOO_MANY_REQUESTS` | `specs/ipc-handshake/spec.md` |
| (ii) | `v1-migration`: removed the `AGENTBUS_BOT_TOKEN` environment fallback; token comes only from `config.json.bot_token` or `--token-stdin`; added the env-only-refused-nothing-written scenario | `specs/v1-migration/spec.md` |
| (iii) | `daemon-lifecycle`: singleton lock corrected to `run/daemon.lock` / `DAEMON_LOCK_STALE_SECONDS` (10 s); added the `run/spawn.lock` / `SPAWN_LOCK_STALE_SECONDS` (25 s) client-election requirement and its N-clients-race scenario | `specs/daemon-lifecycle/spec.md` |
| (iv) | `ledger`: named the full retention constant set (`INBOX_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `UNKNOWN_SENDER_RETENTION_DAYS`, `CLIENT_SESSION_STALE_HOURS`, `RETENTION_SWEEP_INTERVAL_HOURS`) and the hourly-sweep scenario; stated `PRAGMA synchronous = FULL` (D-21) in the open-sequence requirement. `durable-inbox`: added the D-19 fresh-session catch-up-cursor scenario and the D-20 `updates.body` NULL-for-`rejected`/`ignored` scenario | `specs/ledger/spec.md`, `specs/durable-inbox/spec.md` |
| D-29 | Added `conmuta daemon stop` (identity challenge before `process.kill`, two scenarios) to `daemon-lifecycle`; added `conmuta validate [<path> \| --stdin]` as the callable surface of the token-shape validator (one scenario) to `project-binding` | `specs/daemon-lifecycle/spec.md`, `specs/project-binding/spec.md` |

## Wire policy and invariants (repeated here for reviewer convenience)

- **W1**: every capability's scenarios assume `AGENTBUS/2` emitted, `/1` and `/2` accepted; no
  capability adds an envelope field, type or `basis` value.
- **Invariants touched**: all five (CONSTITUTION.md §2), as the proposal states. Each capability
  spec's `Traces:` lines name the invariant it pins.
- **Autonomy boundary**: `daemon-lifecycle` and `thin-client-tools` state the D-01 scoped spawn
  exception explicitly; no other capability introduces exec, shell or tool invocation.
