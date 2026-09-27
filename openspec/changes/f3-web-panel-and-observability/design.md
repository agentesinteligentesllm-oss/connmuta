# Design: F3 — Local Web Panel, Roster Sync, and Version Observability

## Technical Approach

Extract the daemon's existing Host/body-cap checks into one parameterized shared module both the
IPC listener and a new second panel listener import. The panel is mounted from `daemon/bootstrap.ts`
alongside the existing `createIpcServer` call, with its own single-token `PanelTokenStore` and its
own run-file sibling for port/token discovery. Roster sync is a new CLI verb committing through the
existing one-transaction `commitRegistryChange` path. Version observability adds one constant and one
rendering change confined to `renderMessageHtml`.

## Architecture Decisions

### Decision: Shared transport-guard module, parameterized Origin check

**Choice**: `daemon/transport/http-guards.ts` exports `checkTransportGuards(req, { expectedHost, requireOrigin })`. The existing `daemon/ipc/server.ts` calls it with `requireOrigin: false` (unchanged behavior — MCP clients send no Origin). The new panel listener calls it with `requireOrigin: true`, refusing a *present, mismatched* Origin while admitting an *absent* one (plain top-level navigation).
**Alternatives considered**: Duplicate the Host/body-cap logic inside `daemon/panel/*` so `ipc/server.ts` stays byte-identical. Rejected — duplicates already-correct, already-tested logic for no behavioral gain, and risks the two copies drifting apart on a future fix.
**Rationale**: One tested module, one place to fix a transport-level bug; matches this project's stated aversion to duplicated transport code (`registry/writer.ts`'s own doc).

### Decision: Panel discovery via a sibling run file

**Choice**: `daemon/panel/panel-run-file.ts` writes `run/panel.json` (`{ port, pid, token }`, POSIX `0o600`), mirroring `lifecycle/run-file.ts`'s `DaemonRunPayload` exactly. A new `conmuta panel` CLI verb reads it and prints `http://127.0.0.1:<port>/?token=<token>` once.
**Alternatives considered**: Fold `{ panelPort, panelToken }` into the existing `run/daemon.json`. Rejected — conflates two independent trust domains/lifetimes in one file; any reader of `daemon.json` for the MCP handshake would incidentally see the panel token.
**Rationale**: Mirrors an existing, already-audited precedent (one run file per listener) instead of inventing a new shape.

### Decision: `PanelTokenStore` is a single per-boot token, not a bearer set

**Choice**: One random token generated at boot (`randomBytes`, same primitive as `run-file.ts`'s `secret`), checked by constant-time comparison. No mint/revoke lifecycle.
**Alternatives considered**: Mirror `SessionStore`'s full mint/validate/revoke API. Rejected as over-engineered — the panel has exactly one human operator per machine; no multi-bearer accounting or per-tab revoke scenario is in scope.
**Rationale**: YAGNI, matches decision 1's single-operator, read-only scope exactly.

### Decision: Roster sync commits through `commitRegistryChange`

**Choice**: `cli/project-sync-roster.ts` calls `installer/registry-commit.ts`'s `commitRegistryChange` with a `mutate` closure replacing one binding's `roster_snapshot`/`roster_hash`, and a new `RegistryCommitReason` member `"ROSTER_SYNCED"`.
**Alternatives considered**: `registry/writer.ts`'s bare `replaceRegistryFile` plus a separate `appendAuditRow` call. Rejected in the Alpha-audited proposal round — opens a crash window between the two calls, violating R6.
**Rationale**: Reuses the one already-tested one-transaction (`BEGIN IMMEDIATE`) commit path; zero new atomicity code to write or test.

## Data Flow

    Panel read:
    Browser --GET /?token=..--> panel listener --> http-guards --> route handler --> registry/ledger (read-only) --> HTML/JSON

    Roster sync write:
    Human --CLI--> project-sync-roster.ts --> read conmuta.json + registry --> diff --> confirm
      --> commitRegistryChange [BEGIN IMMEDIATE: audit row + rename] --> registry.json

## File Changes

| File | Action | Description |
|---|---|---|
| `src/daemon/transport/http-guards.ts` | Create | Extracted, parameterized Host/Origin/body-cap checks |
| `src/daemon/ipc/server.ts` | Modify | Calls `http-guards` instead of its inline checks (`requireOrigin: false`) |
| `src/daemon/panel/server.ts` | Create | Second `node:http` listener, calls `http-guards` (`requireOrigin: true`) |
| `src/daemon/panel/token-store.ts` | Create | `PanelTokenStore` (single per-boot token) |
| `src/daemon/panel/panel-run-file.ts` | Create | `run/panel.json` writer/reader, mirrors `lifecycle/run-file.ts` |
| `src/daemon/panel/routes.ts` | Create | Home/Overview screens, read-only registry/ledger queries |
| `src/daemon/bootstrap.ts` | Modify | Mounts the panel listener alongside the existing IPC server; `stop()` and the startup `catch` block additionally call `panelServer.close()` and delete `run/panel.json` (mirroring the existing `ipcServer.close()`/`deleteRunFile` handling at `bootstrap.ts:300-325`), so a `daemon stop` or a failed boot leaves no orphaned socket or run file |
| `src/cli/project-sync-roster.ts` | Create | `conmuta project sync-roster [path]` |
| `src/cli/panel.ts` | Create | `conmuta panel` — prints the one-time URL |
| `src/cli/main.ts` | Modify | Dispatch + `USAGE_LINES` for both new verbs |
| `src/installer/registry-commit.ts` | Modify | Add `"ROSTER_SYNCED"` to `RegistryCommitReason` |
| `src/shared/version.ts` | Modify | Add `WIRE_VERSION` |
| `src/shared/envelope.ts` | Modify | `renderMessageHtml` renders both versions in the `<b>` line |

## Interfaces / Contracts

```ts
// daemon/transport/http-guards.ts — no import from daemon/ipc/server.ts (would cycle: server.ts
// calls this module, so this module cannot import server.ts's IpcResponse type back).
interface GuardOptions { expectedHost: string; requireOrigin: boolean }
interface GuardRejection { readonly status: number; readonly body: unknown }
type GuardResult = { ok: true } | { ok: false; rejection: GuardRejection };
function checkTransportGuards(req: IncomingMessage, opts: GuardOptions): GuardResult;
// Each caller (ipc/server.ts, panel/server.ts) maps GuardRejection to its own response shape —
// structurally identical to IpcResponse today, but that is a coincidence each caller owns, not a
// shared type.

// daemon/panel/panel-run-file.ts
interface PanelRunPayload { port: number; pid: number; token: string }

// installer/registry-commit.ts
type RegistryCommitReason = "REGISTRY_CREATED" | "BOT_ADDED" | "GROUP_ADDED" | "PROJECT_BOUND" | "ROSTER_SYNCED";

// shared/version.ts
export const WIRE_VERSION: string; // digits of AGENTBUS/<n>, single source of truth
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `http-guards` Host/Origin/body-cap matrix (present/absent/foreign) | Direct function calls, no live socket |
| Unit | `PanelTokenStore` constant-time validate | Mirrors `sessions.ts`'s own test pattern |
| Unit | `commitRegistryChange` with `ROSTER_SYNCED` | Mirrors existing `registry-commit.test.ts` cases |
| Unit | `WIRE_VERSION` agrees with `PROTOCOL_SENTINEL`'s digits | Direct assertion, mirrors `version.test.ts`'s `SERVER_VERSION`/`package.json` check |
| Unit | `renderMessageHtml` places both versions inside the `<b>` line, never inside the blockquote | Assert on the rendered string's structure |
| Integration | Panel listener end-to-end (loopback bind, token via header/query, foreign Host/Origin refused, mutation-shaped request refused) | Real `node:http` server per existing `ipc/server.test.ts` pattern |
| Integration | `sync-roster` CLI: no-drift, drift+confirm, decline, unbound, invalid file | Spawns the real CLI, same pattern as `test/cli/daemon-stop.test.ts` |
| Integration | `roster_drift` survives N heartbeat ticks with no `sync-roster` invocation (never auto-resolved) | Injected clock/tick harness, mirrors `bootstrap.test.ts`'s heartbeat tests |
| Integration | `conmuta panel` prints the correct one-time URL from `run/panel.json` | Spawns the real CLI, same pattern as `test/cli/daemon-stop.test.ts` |
| Static | Panel module carries no `node:fs` reference (PT-28) | Run `test/security/daemon-bundle.test.ts`'s existing closed 7-file allow-list check unmodified; a passing run requires no panel file to appear in it — the list itself is never extended |
| Regression | `encodeEnvelope` wire bytes unchanged | Existing envelope fixture, byte comparison before/after |

## Threat Matrix

The reference template's 5 rows (documentation-like paths, git selection, commit/push state, PR
commands) are N/A — no shell, subprocess, or VCS/PR automation exists in F3. Following F2's own
precedent of adding a locally-relevant row beyond the template
(`archive/2026-09-27-f2-installer-and-doctor/design.md:275`, "Local process integration (`POST
/doctor`)"), F3 adds one:

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Local process integration (panel listener) | Applicable | Loopback-only bind; per-boot token (header or query); Host/Origin validation (present-and-foreign refused, absent admitted); no mutation route; no `node:fs` asset reads | Foreign Host refused; foreign Origin refused; absent Origin admitted; missing/invalid token refused; mutation-shaped request refused; no `node:fs` reference in bundle |

## Migration / Rollout

No migration required. Additive only: a new listener, two new CLI verbs, one new constant, one new
`RegistryCommitReason` member. No existing route, file format, or wire byte changes.

## Open Questions

None beyond what the proposal/spec phases already resolved with Alpha.
