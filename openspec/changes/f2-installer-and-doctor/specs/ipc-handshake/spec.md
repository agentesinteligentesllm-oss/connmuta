# Delta for ipc-handshake

## ADDED Requirements

### Requirement: Online doctor checks run over an authenticated IPC route

The online `doctor` tier MUST reach its per-binding checks (`getMe`, `getChat`, roster/`bot_id`
checks, membership check) through a daemon IPC route that requires the same identity handshake and
per-session bearer every other tool-call route requires (no bearer before identity proof, session
bound and frozen to one `project_id`). The route MUST NOT accept the raw per-boot secret as a
bearer, and MUST perform no registry, ledger, or secret-store write as a side effect of a check.

#### Scenario: Online doctor route refuses an unauthenticated caller

- GIVEN a caller invoking the online doctor route with no completed identity handshake
- WHEN the request reaches the daemon
- THEN the daemon returns the same unauthenticated refusal any other tool-call route returns, and
  performs no check

#### Scenario: Online doctor route is read-only

- GIVEN an authenticated session and a valid `doctor` request for its bound project
- WHEN the daemon runs the online checks for that binding
- THEN the response reports findings only, and no registry, ledger, or secret-store write occurred

#### Scenario: Online doctor route is scoped to the session's own bound project

- GIVEN a session frozen to `project_id: "prj-a"`
- WHEN a `doctor` request on that session names a different project's binding
- THEN the daemon refuses the request rather than running checks against another project's
  binding

Traces: OVERVIEW §10.4; proposal.md Modified Capabilities; CONSTITUTION.md §2 inv. 1, inv. 2
