# ADR-0029 — Per-user daemon as the sole poller, host-agnostic thin clients

> **Conmuta** is a working name pending trademark clearance (backlog B-11).

## Status

`accepted` — accepted by the tribunal (`bus-v2-landing-architecture-001`) and confirmed by the Director on 2026-09-16 (Director note DN-04).

## Date

2026-09-16 (UTC; consensus of the debate below).

## Debate

`bus-v2-landing-architecture-001`, round 1 proposal D3 and D6, round 1 objections n1 and n2
(both accepted), round 2 consensus. Record: [../05-tribunal/INDEX.md](../05-tribunal/INDEX.md).

## Context

Verified Telegram facts (decision record H1–H7): one bot token admits exactly one `getUpdates`
consumer (HTTP 409, the newest caller wins); unfetched updates are dropped after 24 h and there is no
history read; webhooks need public HTTPS, unrealistic on desktops; long-poll clamps at 50 s.

v1 accepted those costs with a per-machine session subprocess and no daemon
([0003](0003-per-machine-subprocess-no-daemon.md)). In production the pull model is the first pain:
two IDE clients on one project collide with `BRIDGE_BUSY` / `body_omitted` because cursor advance
equals presentation (`telegram-agent-bus/src/tools/fetch.ts:500-930`), and a 24 h gap loses
traffic (`research[security-isolation]` T05; `critic.top_blockers[1]`).

The v1 constitution forbids a daemon (ADR-03; "closed permanently" list,
`docs/functional-audit/06-verdict.md:160-177`). This ADR reopens that item explicitly.

## Options considered

| Option | Description | Trade-off | Outcome |
|---|---|---|---|
| v1 subprocess, no daemon | Each IDE session owns token, poller and state. | Simple, but 409 collisions across sessions, 24 h loss, no multi-reader cursor. | Superseded |
| Per-OS-user daemon + thin stdio clients | One daemon per OS user is the sole `getUpdates` consumer per token; per-project stdio MCP clients talk to it over local IPC. | Removes 409 and 24 h loss while alive; requires a lifecycle (spawn, lock, autostart) and an IPC contract. | **Chosen** |
| Docker sidecar | Daemon inside a container. | Docker Desktop licensing gate, WSL2 admin + reboot, 1–4 GB idle RAM, stdio inside containers; no local bus in the state of the art uses it (`research[packaging-runtime]`). | Rejected (D4) |
| OS service wrappers (NSSM, WinSW, pm2) | Install as a real service. | NSSM/WinSW need admin and are stagnant; pm2 is AGPL-3.0 without native Windows startup. | Rejected |
| Headless runner inside the core | Daemon invokes `claude -p` / `codex exec` / `opencode run` / `gemini -p` on new `needs_action`. | Violates [0006](0006-autonomy-boundary.md) layers 1–2 and opens an RCE path via indirect prompt injection from Telegram (Alpha objection n1). | Rejected for the core; optional satellite `@conmuta/runner` post-F6 (B-06) |
| IPC over named pipe / unix socket | Per-user pipe with DACL / socket 0600. | Node cannot set a DACL on a Windows named pipe; reachability by another local user is unverified. | Deferred — spike B-08 |
| IPC over loopback HTTP, static bearer | Random port, per-boot secret. | After a daemon crash, Windows ephemeral-port reuse could make a new client send its bearer to a foreign process (Alpha objection n2). | Hardened (see Decision) |

## Decision

1. **Daemon per OS user.** Sole `getUpdates` consumer per token, continuous long-poll ≤ 50 s,
   durable inbox (store of record in [0030](0030-sqlite-ledger-and-json-registry.md)). A second
   daemon instance refuses to poll. A client that finds no daemon returns `DAEMON_DOWN` and
   **never** polls Telegram itself.
2. **Lifecycle.** Lazy spawn by the first client (`wx` lock file + pid + heartbeat, stale after
   ~10 s). Optional start-at-login without admin: `HKCU\...\Run` on Windows, LaunchAgent on macOS.
   Idle auto-shutdown is disabled while any binding has open threads.
3. **IPC.** HTTP on `127.0.0.1`, random port, per-boot secret stored in an ACL'd file
   `{port, pid, secret}`. Handshake before any `Authorization` header: the client pre-checks PID
   liveness (`process.kill(pid, 0)`), sends a nonce to `GET /identity`, requires
   `HMAC-SHA256(secret, nonce)` in the reply, and only then uses the bearer. The file is rewritten
   with a fresh secret on every daemon start and is treated as invalid when the PID is dead.
4. **Thin clients are host-agnostic.** The IDE-facing surface stays stdio; one client per
   (host, project) session, bound as in [0028](0028-project-scoped-bijective-binding.md). No
   host-specific logic lives in the core.
5. **Passive switch.** The core (daemon + thin client) obeys [0006](0006-autonomy-boundary.md)
   layers 1–2: no exec, no shell, no tool invocation, zero autonomous emission, no timers that emit.
   Static security assertions equivalent to v1 `test/security.test.ts` (no `child_process`, `fs`
   only inside its home) hold over the built bundle. The daemon's long-poll is a receive loop, not an
   emitter.
6. **Wake-up is not promised.** There is no verified wake-up contract for Cursor, OpenCode, Codex,
   Gemini CLI or Antigravity (spike B-09); hosts rely on a fetch cadence, which the daemon makes
   near-instant. The Claude Code channels adapter is an optional doorbell only (F4,
   [0024](0024-channel-doorbell-not-a-second-reader.md)).
7. **Version observability without emission.** No heartbeat timer; build/wire version rides on the
   render-only human-plane header of posts the agent sends anyway (amendment A1, B-14).

## Consequences

- The 24 h loss disappears only while the daemon is alive; a machine that is off for more than 24 h
  still loses updates for every binding on it (`critic.top_blockers[1]`). `status` must show the
  last poll per bot; the warning threshold is a named constant to be fixed in the F1 spec.
- `BRIDGE_BUSY` disappears as a client-facing error; its replacement is `DAEMON_DOWN`.
- v1's "one home per machine" assumption behind [0024](0024-channel-doorbell-not-a-second-reader.md) no longer holds;
  the doorbell becomes a daemon-fed adapter (F4).
- **Tension to resolve in the F1 spec.** Lazy spawn by the first client requires a process-spawn
  capability somewhere, while rule 5 keeps `child_process` out of the core bundle. The spec must
  either scope the static assertion so the only permitted spawn target is the daemon's own entry
  point (no shell, no user-controlled argv) or move the spawn into a separate launcher binary. This
  ADR does not decide which; it records that both the spawn and the assertion are required.
- Two OS users on one machine run two daemons; cross-user election is not addressed
  (`critic.gaps[1]`).

## Supersedes

- [0003](0003-per-machine-subprocess-no-daemon.md) in full.
- Re-bases the deployment assumptions of [0024](0024-channel-doorbell-not-a-second-reader.md).
- Reopens the "daemon" item of the v1 closed-permanently list; the rest of that list stands
  ([../01-constitution/CONSTITUTION.md](../01-constitution/CONSTITUTION.md)).

## Tests that must pin it

| Guarantee | Test |
|---|---|
| Exactly one poller per token | Second daemon instance against the same home refuses to poll (lock held, PID alive) and exits with a distinct code. |
| Stale lock is reclaimed, live lock is not | Lock with dead PID is reclaimed; lock with live PID and fresh heartbeat is respected; the ~10 s staleness is a named constant asserted by behaviour, not by value. |
| The client never polls Telegram | Static assertion: the thin-client bundle contains no reference to `api.telegram.org` / `getUpdates`; runtime test: no daemon → `DAEMON_DOWN` with zero network calls. |
| No bearer before identity proof | Handshake test: wrong HMAC, dead PID, or missing `/identity` reply → the client sends no `Authorization` header (fake server records headers). |
| Secret rotates per boot | Daemon restart rewrites `{port, pid, secret}`; a client holding the old secret is rejected. |
| Core has no exec and no timers that emit | Static assertions over the built bundle, equivalent to v1 `test/security.test.ts:176-244`: no `child_process`, `fs` confined to the home, no `setInterval`/`setTimeout` on a send path. |
| Idle shutdown respects open threads | Daemon with one open thread in any binding does not shut down on idle. |
| No heartbeat emission | Test asserts zero outbound messages from the daemon over a simulated idle window. |
