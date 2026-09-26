# daemon-lifecycle Specification

## Purpose

Singleton election, heartbeat and staleness, lazy spawn (D-01 Option A), the idle rule, the
Node-floor gate, the run-file lifecycle, and the static bundle assertions that keep the core a
passive switch (Invariant 3, Invariant 5, CONSTITUTION.md §3 layers 1-2).

## ADDED Requirements

### Requirement: Singleton election and lock staleness

The daemon MUST be the sole active instance per OS user, arbitrated by `run/daemon.lock`: a second
instance that finds a live lock (pid alive, heartbeat fresh) MUST refuse to poll and exit with a
distinct code, while an instance that finds a stale lock (dead pid, or `heartbeat_at` older than
the named constant `DAEMON_LOCK_STALE_SECONDS` = 10 s, the replacement for v1's
`LOCK_STALE_SECONDS` = 120 s because the spawn-lock model supersedes the whole-process bridge lock)
MUST reclaim it exactly once.

#### Scenario: Second instance refuses to poll

- GIVEN a daemon already holds `run/daemon.lock` with a live pid and a heartbeat younger than
  `DAEMON_LOCK_STALE_SECONDS`
- WHEN a second daemon instance starts for the same OS user
- THEN it detects the live lock, calls `getUpdates` zero times, and exits with a distinct non-zero
  code

#### Scenario: Stale lock reclaimed exactly once

- GIVEN `run/daemon.lock` whose pid is dead or whose heartbeat is older than
  `DAEMON_LOCK_STALE_SECONDS`
- WHEN a daemon instance starts
- THEN it reclaims the lock exactly once and begins polling

#### Scenario: Telegram 409 surfaced, never retried blindly

- GIVEN the daemon's own token somehow collides with another `getUpdates` consumer
- WHEN Telegram answers `409`
- THEN the daemon records `last_error_code = TELEGRAM_CONFLICT` on `offsets` and surfaces it in
  `status`, without an automatic retry loop

Traces: ADR-0029 rows "Exactly one poller per token", "Stale lock is reclaimed, live lock is not";
DATA-MODEL.md §7 `DAEMON_LOCK_STALE_SECONDS`; design.md:108 (§3), design.md:277 (§7.1); PT-12;
CONSTITUTION.md §2 inv. 3

### Requirement: Client-side spawn election uses a separate stale window

Exactly one client among several racing to start the daemon MUST win the spawn: clients arbitrate
through `run/spawn.lock` (`wx`, D-16), whose staleness is the named constant
`SPAWN_LOCK_STALE_SECONDS` = `SPAWN_WAIT_SECONDS` + `DAEMON_LOCK_STALE_SECONDS` (15 + 10 = 25 s) —
a spawner that vanished mid-wait plus one election window. `run/spawn.lock` and `run/daemon.lock`
are two distinct files with two distinct stale windows; a client MUST NOT release or reclaim
`run/daemon.lock`.

#### Scenario: N clients racing spawn exactly one daemon

- GIVEN N thin clients start concurrently against a fresh `~/.conmuta` with no daemon running
- WHEN each races to acquire `run/spawn.lock`
- THEN exactly one client wins, calls `spawnDaemon()` exactly once, and the other N-1 wait on the
  run-file event instead of spawning a second daemon process

Traces: D-16 (design.md:554); DATA-MODEL.md §4; OVERVIEW.md §7.1 (agentinbox #235 incident);
CONSTITUTION.md §2 inv. 3

### Requirement: Lazy spawn is one allow-listed call site (D-01 Option A)

The client bundle MUST contain exactly one call site that references `child_process`: it MUST call
`spawn()` exactly once, with a compile-time-literal argv (the current `node` executable plus the
daemon entry path — no user-controlled input reaches argv), `shell: false`, `detached: true`, and
`windowsHide: true`. No second launcher binary exists (D-01 rejects Option B).

#### Scenario: Bundle scan finds exactly one spawn site

- GIVEN the built client bundle
- WHEN the multi-clause static assertion runs (PT-27)
- THEN the `hasChildProcessReference` predicate matches exactly once, the matched site calls
  `spawn(` exactly once, argv is a literal two-element array, `shell` is `false`, and the scan is
  non-vacuous (it does find the allow-listed site, proving the assertion can fail)

#### Scenario: Argv never carries caller input

- GIVEN a thin client invoked with an arbitrary `--project` value
- WHEN it lazily spawns the daemon
- THEN the spawned argv is unchanged from the compile-time literal; `--project` never reaches
  `spawn`'s argument list

Traces: D-01; ADR-0029 Consequences ("Tension to resolve in the F1 spec"); THREAT-MODEL.md §5.6,
PT-27; CONSTITUTION.md §3 layer 1

### Requirement: Idle shutdown respects open threads

The daemon MUST NOT auto-shut down while any binding has an open thread; idle shutdown MUST emit
nothing (no farewell message, no heartbeat).

#### Scenario: Open thread blocks idle shutdown

- GIVEN one binding has an open `REQUEST` thread
- WHEN the daemon's idle window elapses
- THEN the daemon does not shut down

#### Scenario: No emission on an idle window

- GIVEN no binding has open threads and the daemon becomes idle
- WHEN the idle window elapses
- THEN zero outbound messages are sent before or during shutdown

Traces: ADR-0029 rows "Idle shutdown respects open threads", "No heartbeat emission";
CONSTITUTION.md §3 layer 2

### Requirement: Run-file lifecycle

On every start the daemon MUST rewrite `~/.conmuta/run/daemon.json` (`{port, pid, secret}`) with a
fresh per-boot secret and its own pid, ACL'd to the current user; the file MUST be treated as
invalid by any reader once its pid is dead.

#### Scenario: Fresh secret on every start

- GIVEN a daemon restart
- WHEN the new instance starts
- THEN `daemon.json` is rewritten with a secret different from the previous boot's

Traces: ADR-0029 rule 3; DATA-MODEL.md §4; PT-24 (consumed by ipc-handshake); CONSTITUTION.md §2
inv. 2

### Requirement: Node floor gate before any disk write

The daemon and installer MUST verify `process.version` satisfies `>= 24.15` (D-03: `node:sqlite`
reaches release-candidate stability only at 24.15.0) before touching disk or invoking git, and MUST
exit with an explicit error and a download link on failure.

#### Scenario: Node below the floor exits before any write

- GIVEN the daemon starts under Node 22
- WHEN the gate runs
- THEN it exits with an explicit error, and zero files under `~/.conmuta/` are created or modified

Traces: ADR-0030 row "Node floor"; ADR-0031 rule 3; D-03; CONSTITUTION.md §5

### Requirement: Static bundle assertions and packaging conformance

The built daemon bundle MUST contain no `child_process` reference, MUST confine `node:fs` to the
allow-listed home-scoped modules, MUST contain no `.claude/settings` or `permissions.allow`
reference, MUST contain no `deleteMessage` call or definition, MUST confine `sendMessage` to
transport modules reachable only from an IPC request handler, and MUST confine any unbounded loop
to the poller module, which MUST import no transport module. The published tarball MUST match
`npm pack --dry-run`'s whitelist and MUST carry no `preinstall`/`install`/`postinstall`/`prepare`
script; `package.json` MUST set `private: true` until B-16 lifts it at publish (D-10).

#### Scenario: Daemon bundle scan is clean and non-vacuous

- GIVEN the built daemon bundle
- WHEN PT-28's predicates run
- THEN every forbidden predicate is absent, the poller-module allow-list holds, and the scan
  demonstrably can fail (a seeded violation is caught in a fixture test)

#### Scenario: Tarball has no lifecycle script

- GIVEN the packed tarball
- WHEN `npm pack --dry-run` runs
- THEN the file list matches the whitelist exactly and `package.json` has no lifecycle script

Traces: THREAT-MODEL.md §5.6, PT-28; ADR-0031 §"Tests that must pin it", PT-21; D-10;
CONSTITUTION.md §3 layers 1-3

### Requirement: `conmuta daemon stop` challenges identity before terminating

`conmuta daemon stop` MUST read the run file, perform the identity challenge (ipc-handshake
"No bearer before identity proof") before calling `process.kill(pid, "SIGTERM")`, so it never
signals a foreign process reusing the recorded pid; a successful stop MUST release
`run/daemon.lock` and MUST delete only the run files the daemon itself owns.

#### Scenario: Stop terminates a live, identity-confirmed daemon

- GIVEN a live daemon whose `run/daemon.json` identity challenge succeeds
- WHEN `conmuta daemon stop` runs
- THEN the daemon receives `SIGTERM`, the lock becomes stale on exit, and the daemon's own run
  files are removed

#### Scenario: Stop refuses when the identity challenge fails

- GIVEN a pid recorded in `run/daemon.json` that is alive but fails the identity challenge (a
  foreign process reusing the pid)
- WHEN `conmuta daemon stop` runs
- THEN it sends no signal to that pid and reports the identity mismatch instead of terminating an
  unverified process

Traces: D-29 (design.md:567); design.md §7.3 (design.md:299-301); CONSTITUTION.md §2 inv. 2

## Traceability

| Source | Requirement / Scenario |
|---|---|
| ADR-0029 rows 1, 2 | Singleton election and lock staleness (PT-12) |
| ADR-0029 rows 6, 7, 8 | Idle shutdown; static bundle assertions (PT-28) |
| ADR-0029 row 5 (daemon-side half) | Run-file lifecycle |
| ADR-0030 row "Node floor" | Node floor gate |
| ADR-0031 PT-21 | Static bundle assertions and packaging conformance |
| D-01 | Lazy spawn is one allow-listed call site (PT-27) |
| D-03 | Node floor gate |
| D-10 | Static bundle assertions and packaging conformance |
| D-16 (design.md:554) | Client-side spawn election uses a separate stale window |
| D-29 (design.md:567) | `conmuta daemon stop` challenges identity before terminating |
| PT-12, PT-27, PT-28, PT-21 | Covered above |
