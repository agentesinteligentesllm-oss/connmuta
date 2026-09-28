# Web Panel Specification

## Purpose

A read-only local HTTP surface that lets a human observe daemon state (bots, groups, projects,
bindings, roster-drift conditions) without granting any write capability. Distinct transport and
token domain from the MCP client's IPC surface (`ipc-handshake`).

## Requirements

### Requirement: Loopback-only, per-boot-token transport

The panel listener MUST bind only to `127.0.0.1` on an OS-assigned ephemeral port, and MUST require
a valid panel token (independent of the MCP `SessionStore`) on every request. Because a plain
top-level browser navigation cannot carry a custom `Authorization` header, the token MUST also be
acceptable as a URL query parameter, so a human can open the panel from a one-time printed URL.

#### Scenario: Listener binds to loopback only

- GIVEN the daemon has started
- WHEN the panel listener is created
- THEN it binds exclusively to `127.0.0.1` on a random free port

#### Scenario: Missing or invalid token is refused

- GIVEN the panel is listening
- WHEN a request arrives with no token (neither header nor query parameter) or an unrecognized token
- THEN the panel refuses the request with `401`

#### Scenario: Query-parameter token admits the initial navigation

- GIVEN a human opens the one-time panel URL printed at startup, containing `?token=<value>`
- WHEN the browser's plain `GET` navigation carries no `Authorization` header at all
- THEN the panel accepts the request on the strength of the valid query-parameter token

### Requirement: Origin and Host validation

The panel MUST refuse any request whose `Host` header does not name its own bound loopback address.
The panel MUST refuse a request that carries an `Origin` header naming anything other than its own
bound address, defending against cross-origin access from another local tab (THREAT-MODEL T18/PT-29).
A plain top-level `GET` navigation carries no `Origin` header at all (ordinary browser behavior) and
MUST be admitted on `Host` alone — treating an absent `Origin` as equivalent to a foreign one would
make the panel unreachable by its own intended entry point.

#### Scenario: Foreign Host is refused

- GIVEN the panel is listening on `127.0.0.1:<port>`
- WHEN a request arrives with a `Host` header naming a different address
- THEN the panel refuses the request before any route runs

#### Scenario: Foreign Origin is refused

- GIVEN a browser sends a request with an `Origin` header present
- WHEN that Origin does not match the panel's own bound address
- THEN the panel refuses the request

#### Scenario: Initial navigation with no Origin header is admitted

- GIVEN a browser's plain top-level `GET` navigation to the panel URL, which carries a matching
  `Host` header but no `Origin` header at all
- WHEN the request reaches the panel
- THEN the panel admits it (Origin absence is not treated as a foreign Origin)

### Requirement: Read-only surface, two screens only

The panel MUST expose exactly two screens — Home/Control-panel and the Overview table — and MUST
expose no route capable of mutating registry, ledger, or project-file state.

#### Scenario: A mutation-shaped request is refused, not silently ignored

- GIVEN the panel is listening
- WHEN a request is sent for a plausible mutation path (e.g. `POST /panel/api/sync-roster`, or any
  non-`GET` method on any panel route)
- THEN the panel answers `404` or `405` and makes no change to the registry, the ledger, or any
  project file

#### Scenario: Roster drift is shown, never resolved by the panel

- GIVEN a binding carries the `roster_drift` condition
- WHEN the Overview screen renders that binding
- THEN it shows the condition and the diff against the stored `roster_snapshot`
- AND it offers no button or route that applies a resolution

### Requirement: No runtime filesystem reads for panel assets

The panel MUST NOT read its static assets (HTML/CSS/JS) from disk via `node:fs` at request time; the
daemon bundle's `node:fs` reference allow-list (PT-28) is closed and does not include a panel module.

#### Scenario: Panel module carries no `node:fs` reference

- GIVEN the daemon's compiled bundle
- WHEN the panel's module files are scanned for `node:fs` usage
- THEN none is found

## Traceability

| Source | Requirement / Scenario |
|---|---|
| Decision 1, `bus-v2-f3-explore-decisions-001` | Panel scope is read-only; two screens only |
| Decision 2, `bus-v2-f3-explore-decisions-001` | Separate second listener, own ephemeral port |
| Decision 3, `bus-v2-f3-explore-decisions-001` | Separate `PanelTokenStore`, independent of `SessionStore` |
| Decision 4, `bus-v2-f3-explore-decisions-001` | Panel is observe/alert only for `roster_drift`; no apply action |
| THREAT-MODEL.md T18/PT-29 | Loopback bind, random port, per-boot token, Origin/Host validation |
| CONSTITUTION.md autonomy boundary (invariants 1-2) | No mutation route; no exec/shell/autonomous emission |
| `test/security/daemon-bundle.test.ts` PT-28 | No runtime `node:fs` reads for panel assets |
