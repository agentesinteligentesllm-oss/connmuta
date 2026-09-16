# ipc-handshake Specification

## Purpose

Identity challenge before any bearer, bearer issuance and per-boot rotation, session freeze, `401`
semantics and roster-drift detection between the thin client and the daemon over loopback HTTP
(Invariant 2, Invariant 3; ADR-0029 objection n2).

## ADDED Requirements

### Requirement: No bearer before identity proof

The client MUST pre-check pid liveness (`process.kill(pid, 0)`), then send a cryptographically
random nonce to `GET /identity` with no `Authorization` header, and MUST require
`HMAC-SHA256(secret, "identity:" + nonce)` (domain-separated label, D-14) in the reply, verified by
constant-time comparison, before it sends any bearer.

#### Scenario: Dead pid never gets a request

- GIVEN `~/.conmuta/run/daemon.json` names a pid that is no longer alive
- WHEN the client reads the file
- THEN the client treats it as invalid and sends zero requests to the recorded port

#### Scenario: Wrong HMAC yields no bearer

- GIVEN a live pid on the recorded port that answers `GET /identity` without a valid
  `HMAC-SHA256(secret, "identity:" + nonce)` (a port reused by a foreign process, T16)
- WHEN the client verifies the reply
- THEN it re-reads the run file exactly once; if the mismatch persists it sends no `Authorization`
  header, returns `DAEMON_IDENTITY_MISMATCH`, never `DAEMON_DOWN`, never spawns a fresh daemon, and
  never proceeds to `POST /session`

#### Scenario: Valid HMAC allows the bearer

- GIVEN a live daemon that answers `GET /identity?nonce=<n>` with the correct
  `HMAC-SHA256(secret, "identity:" + nonce)` and a `server_nonce`
- WHEN the client verifies it
- THEN it calls `POST /session` carrying `{project_id, group_id, roster_hash, host, pid, hmac:
  HMAC-SHA256(secret, "session:" + server_nonce)}`; the per-session bearer is returned in the
  daemon's `POST /session` response, never sent by the client

#### Scenario: Excess pending handshakes are refused, not queued

- GIVEN `MAX_PENDING_HANDSHAKES` (64) nonces are already pending on the daemon
- WHEN one more client calls `GET /identity`
- THEN the daemon returns `HTTP_TOO_MANY_REQUESTS` and issues no new nonce

Traces: ADR-0029 rule 3, row "No bearer before identity proof"; THREAT-MODEL.md §5.2, PT-26;
design.md:361-395 (handshake sequence), design.md:392 (flood), D-17 (design.md:555);
CONSTITUTION.md §2 inv. 2

### Requirement: Bearer is a per-session token, not the raw per-boot secret

The daemon MUST mint a per-session token at `POST /session` and return it as the bearer for every
later tool call; the raw per-boot secret from `daemon.json` MUST sign only the `GET /identity`
challenge and MUST NOT itself be usable as a bearer on any other endpoint (D-04).

#### Scenario: Session token issued at POST /session

- GIVEN a client that completed the identity handshake
- WHEN it calls `POST /session {project_id, roster_hash}`
- THEN the response carries `client_id` and a session bearer distinct from the raw per-boot secret

#### Scenario: Raw per-boot secret is rejected as a bearer

- GIVEN a caller that sends the raw per-boot secret as an `Authorization` bearer on a tool-call
  endpoint (not `/identity`)
- WHEN the daemon receives it
- THEN the daemon returns `401` and performs no side effect

Traces: D-04; ADR-0029 Decision item 3; CONSTITUTION.md §2 inv. 2

### Requirement: Secret and session rotate per daemon boot

Every daemon start MUST rewrite the per-boot secret; a client holding a bearer derived from a
previous boot MUST be rejected with `401` and produce no side effect.

#### Scenario: Stale-boot bearer rejected

- GIVEN a client holds a session bearer minted before the daemon's most recent restart
- WHEN it calls a tool endpoint after the restart
- THEN the daemon returns `401`, the call has no side effect, and no `WRONG_ROOM` or other business
  error is raised in its place

Traces: ADR-0029 row "Secret rotates per boot"; PT-24; CONSTITUTION.md §2 inv. 2

### Requirement: Session binds one project and freezes for its lifetime

`POST /session` MUST resolve `project_id` to `(bot_id, group_id, agent_id, roster)` via the
registry and MUST refuse when the project has no active binding; once resolved, the binding MUST
be frozen for the life of the MCP session and every later tool call MUST carry `client_id` and the
bearer.

#### Scenario: Unbound project refused at session start

- GIVEN a `project_id` with no active registry binding
- WHEN the client calls `POST /session`
- THEN the daemon refuses with a distinct error code and mints no session

#### Scenario: Binding never changes mid-session

- GIVEN an active session bound to `prj-example`
- WHEN the registry is later hot-reloaded with a different binding for the same `project_id`
- THEN the already-open session keeps its original frozen binding until the client reconnects

Traces: ADR-0028 rule 4; ADR-0029 rule 3; CONSTITUTION.md §2 inv. 1

### Requirement: Roster hash detects drift without auto-resolving it

The client MUST forward `roster_hash` (derived from its local `conmuta.json` roster) at
`POST /session`; when it disagrees with the registry binding's `roster_snapshot`-derived hash, the
daemon MUST raise condition `roster_drift` and MUST NOT auto-resolve it.

#### Scenario: Roster hash mismatch raises a condition, not a failure

- GIVEN a binding whose `roster_snapshot` was captured before a roster edit in `conmuta.json`
- WHEN the client forwards the new `roster_hash` at session start
- THEN the daemon admits the session, surfaces condition `roster_drift`, and takes no automatic
  corrective action

Traces: D-07; DATA-MODEL.md §2.4 `roster_hash`; CONSTITUTION.md §2 inv. 1

### Requirement: Client error taxonomy for handshake and session failures

The client and daemon MUST classify handshake and session failures by the codes and retry
semantics design.md §10 fixes: `DAEMON_VERSION_MISMATCH` (`build` != `SERVER_VERSION`, not
retryable — the daemon must be restarted, not retried), `IPC_ERROR` (a transport failure occurring
after a successful handshake, retryable), `BINDING_CHANGED` (the live binding's `(bot_id,
group_id, agent_id)` differs from the session's frozen snapshot on a later tool call:
`HTTP_CONFLICT`, one audit row, nothing sent, a new session required — not retryable with the same
session), and `BINDING_MISMATCH` (`POST /session` refused because `conmuta.json.group_id` does not
equal the resolved binding's `group_id`, per registry invariant R4 — not retryable without a human
fixing the mismatch).

#### Scenario: Version skew surfaces a distinct non-retryable error

- GIVEN a daemon whose `GET /identity` reply carries a `build` different from the client's
  `SERVER_VERSION`
- WHEN the client compares the two
- THEN it returns `DAEMON_VERSION_MISMATCH`, marks it non-retryable, and never proceeds to
  `POST /session`

#### Scenario: Transport failure mid-session is retryable

- GIVEN an established session with a valid bearer
- WHEN a `/tools/*` call fails at the transport layer (connection reset) after the handshake
  already succeeded
- THEN the client surfaces `IPC_ERROR` marked retryable, distinct from `DAEMON_DOWN`

#### Scenario: Live binding drift is refused per call, not silently followed

- GIVEN a session frozen against `(bot_id: 1, group_id: -1, agent_id: "@alice-agent")`
- WHEN a later tool call finds the live registry binding for the same session now resolves to a
  different `(bot_id, group_id, agent_id)`
- THEN the daemon returns `BINDING_CHANGED` (`HTTP_CONFLICT`), writes one audit row, sends nothing,
  and the client must start a new session

#### Scenario: Session refused when the project file's group disagrees with the binding

- GIVEN a `conmuta.json.group_id` that does not equal the resolved binding's `group_id` (R4)
- WHEN the client calls `POST /session`
- THEN the daemon refuses with `BINDING_MISMATCH`, condition `binding_mismatch`, and mints no
  session

Traces: design.md:397-406 (§10 error table); design.md:390 (freeze rule); design.md:142 (R4);
D-17 (design.md:555); CONSTITUTION.md §2 inv. 1, inv. 2

## Traceability

| Source | Requirement / Scenario |
|---|---|
| ADR-0029 row "No bearer before identity proof" | No bearer before identity proof (PT-26) |
| ADR-0029 row "Secret rotates per boot" | Secret and session rotate per daemon boot (PT-24) |
| D-04 | Bearer is a per-session token |
| D-07 | Roster hash detects drift |
| D-17 (design.md:555) | Client error taxonomy for handshake and session failures |
| PT-24, PT-26 | Covered above |
| Success criterion "DAEMON_DOWN makes zero network calls, no Authorization header (PT-26 a/b)" | No bearer before identity proof -> Dead pid / wrong HMAC scenarios |
