# Delta for ipc-handshake

## ADDED Requirements

### Requirement: Online doctor checks run over an authenticated IPC route

The online `doctor` tier MUST reach its per-binding checks (`getMe`, `getChat`, roster/`bot_id`
checks, membership check) through a daemon IPC route (`POST /doctor`, design §9.2 D-44) authenticated
by a single-use handshake nonce and a domain-separated HMAC proof
(`HMAC-SHA256(secret, "doctor:" + server_nonce)`) — the same nonce/proof mechanic every other route
uses to authenticate, but this route mints no bearer and opens no session (D-44: a diagnostic check
must be able to run unscoped across every active binding in one call, which a per-project session
bearer cannot express). The route MUST NOT accept the raw per-boot secret directly as the proof, and
MUST perform no registry, ledger, or secret-store write as a side effect of a check (the opt-in DM
probe's own audit row is a distinct, disclosed action gated by `dm_probe: true`, not a "check").

> **Correction (disclosed divergence, closes a spec/design drift found before PR-18):** this
> requirement originally described the same per-session bearer every other tool-call route mints,
> with the route "session bound and frozen to one `project_id`". `design.md`'s own D-44 decision
> table (`design.md:245`) explicitly evaluated and rejected that exact alternative before this
> change's `sdd-apply` began, and `PR-16`/`PR-17` (`shared/ipc-contract.ts`'s `doctorRequestSchema`,
> `daemon/ipc/doctor.ts`) already shipped, were Alpha-audited, and merged against the no-bearer design
> below. Ratified via Arena debate `bus-v2-f2-pr-18-spec-design-conflict-001` (Alpha, `CONSENSUS`,
> round 1).

#### Scenario: Online doctor route refuses an unauthenticated caller

- GIVEN a caller invoking the online doctor route with an unknown, expired, or already-consumed
  nonce, or a nonce whose `hmac` does not verify against `computeDoctorProof`
- WHEN the request reaches the daemon
- THEN the daemon refuses with an unauthenticated error and performs no check

#### Scenario: Online doctor route is read-only

- GIVEN a valid `doctor` request (valid nonce and proof) naming a bound project's `project_id`
- WHEN the daemon runs the online checks for that binding
- THEN the response reports findings only, and no registry, ledger, or secret-store write occurred

#### Scenario: Online doctor route refuses an unbound `project_id`

- GIVEN a `doctor` request naming a `project_id` with no active binding
- WHEN the request reaches the daemon
- THEN the daemon refuses the request (`DOCTOR_UNBOUND_PROJECT`) rather than running checks

#### Scenario: Online doctor route checks every active binding when no `project_id` is given

- GIVEN a valid `doctor` request with no `project_id`
- WHEN the daemon runs the online checks
- THEN the response reports findings for every currently active binding, not just one

Traces: OVERVIEW §10.4; proposal.md Modified Capabilities; CONSTITUTION.md §2 inv. 1, inv. 2; design.md
D-44 (§9.2, §15 row 245)
