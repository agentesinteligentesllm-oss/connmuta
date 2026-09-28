# Proposal: F3 — Local Web Panel, Roster Sync, and Version Observability

## Intent

F3 gives the Director an observability surface over what the daemon already tracks (bots, groups,
projects, bindings, roster drift) without adding any write path beyond F2's existing CLI wizards. It
also closes two gaps F1/F2 left open: `roster_drift` is detected (F1 PR-31) but never resolvable, and
the running build/wire version is never shown to a human. Scope and mechanism for all three pieces
were locked with Alpha in `bus-v2-f3-explore-decisions-001` (CONSENSUS) — this proposal formalizes
those decisions, it does not re-derive them.

## Scope

### In Scope

- Read-only local web panel: Home/Control-panel screen, Overview table screen.
- Panel's own transport: a second `node:http` listener on its own ephemeral port.
- Panel's own `PanelTokenStore`, independent of the MCP `SessionStore`.
- New CLI verb `conmuta project sync-roster [path]` resolving `roster_drift` (re-reads
  `conmuta.json`, recomputes `roster_hash`, writes via `registry/writer.ts`, appends an audit row).
- New `WIRE_VERSION` constant, rendered with `SERVER_VERSION` only inside `renderMessageHtml`.

### Out of Scope

- Browser-side write screens (Add bot/Add group/Assign project) — stay CLI-only (F2).
- Any change to `daemon/ipc/server.ts`'s `IPC_ROUTES`, `SessionStore`, or the MCP bearer domain.
- Any change to `renderHeader`/`encodeEnvelope` or the wire format itself.
- Automatic/background roster resolution — sync stays a human-triggered CLI action, never a panel
  button or a heartbeat-tick side effect.

## Capabilities

### New Capabilities

- `web-panel`: read-only HTTP panel — own listener, own token store, Home + Overview screens over
  registry/ledger state.
- `roster-sync`: the CLI verb resolving `roster_drift` by recomputing and writing
  `roster_hash`/`roster_snapshot`.
- `version-observability`: `WIRE_VERSION` plus its `renderMessageHtml`-only rendering.

### Modified Capabilities

None. `registry-authoring` and `ipc-handshake` are reused as-is (new callers of
`replaceRegistryFile`; a new shared Host/Origin/body-cap module alongside, not inside,
`daemon/ipc/server.ts`) with no requirement-level change to either.

## Approach

- **Panel transport**: a second listener mounted from `daemon/bootstrap.ts`'s composition root
  alongside the existing IPC server. The Host/Origin/body-cap checks are extracted from
  `daemon/ipc/server.ts`'s current inline logic into a neutral shared module
  (`daemon/transport/http-guards.ts`, alongside the existing `daemon/transport/*` family, NOT under
  `daemon/panel/*` — a shared module cannot live inside the thing that imports it without inverting
  the dependency). `daemon/ipc/server.ts` becomes a consumer of that module rather than owning the
  checks inline. The Origin check itself must be parameterized: mandatory for the panel (a browser
  always sends `Origin`), but the existing IPC listener's MCP stdio/fetch clients do not send one —
  the design phase resolves the exact parameterization, not this proposal.
- **Panel token**: `PanelTokenStore`, HMAC-labelled `"panel:"` (mirrors the existing
  `"identity:"`/`"session:"` domain separation), independent of `SessionStore`. Discovery of the
  panel's assigned port and one-time token (for a human opening the panel URL) is a design-phase
  detail — likely a sibling to `daemon/lifecycle/run-file.ts`'s `DaemonRunPayload` pattern, or a new
  `conmuta panel` CLI verb that prints both once.
- **Roster sync**: CLI reads `conmuta.json`, diffs against the stored `roster_snapshot`, recomputes
  via `shared/roster-hash.ts`, and commits through `installer/registry-commit.ts`'s
  `commitRegistryChange` (the existing one-transaction `BEGIN IMMEDIATE` path that appends the R6
  audit row and renames the file atomically) — NOT `registry/writer.ts`'s bare `replaceRegistryFile`,
  which by its own doc never writes an audit row, so calling it separately from `appendAuditRow`
  would open a crash window violating R6. Requires adding a new `"ROSTER_SYNCED"` member to
  `RegistryCommitReason`.
- **Version observability**: export `WIRE_VERSION` beside `SERVER_VERSION`
  (`shared/version.ts`); render both inside `renderMessageHtml` only.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/daemon/bootstrap.ts` | Modified | Mount second panel listener + `PanelTokenStore` |
| `src/daemon/transport/http-guards.ts` (new) | New | Host/Origin/body-cap checks, extracted and parameterized, shared by both listeners |
| `src/daemon/ipc/server.ts` | Modified | Consumes the extracted guards module instead of its current inline checks |
| `src/daemon/panel/*` (new) | New | Panel HTTP server, routes, `PanelTokenStore` (no transport-guard logic of its own) |
| `src/cli/main.ts` | Modified | New `project sync-roster` and `panel` dispatch entries, updated `USAGE_LINES` |
| `src/installer/registry-commit.ts` | Modified | New `"ROSTER_SYNCED"` `RegistryCommitReason` member, reused by roster-sync |
| `src/shared/version.ts` | Modified | Add `WIRE_VERSION` |
| `src/shared/envelope.ts` | Modified | `renderMessageHtml` renders both version constants |
| `src/registry/writer.ts` | Reused, unmodified | `serializeRegistry`/`validateRegistryBytes` reused by `registry-commit.ts` |
| `src/daemon/ipc/routes.ts` | Unmodified | `ROSTER_DRIFT_CONDITION` stays detection-only |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Second listener duplicates ADR-0029's threat surface | Med | Shared, parameterized Host/Origin/body-cap module; THREAT-MODEL T18/PT-29 pinned by test at design/tasks |
| Panel scope creep into write screens | Low | Explicit out-of-scope; Alpha-ratified decision 1 |
| Roster-sync duplicates `installer/roster-source.ts`'s read logic | Med | Reuse its read pattern, not a new query shape |
| Panel serving static assets via `node:fs` fails `test/security/daemon-bundle.test.ts`'s closed 7-file `node:fs` allow-list (PT-28) | High if unaddressed | Panel assets must be bundled as in-memory/inline string constants, never read from disk at request time, unless the allow-list itself is deliberately extended and disclosed at design/tasks |

## Rollback Plan

Each capability ships as an independent PR slice behind no feature flag; a bad slice is reverted at
the commit/PR level. None touches already-shipped F1/F2 route tables or the wire format, so a revert
carries no migration.

## Dependencies

None beyond already-merged F1/F2 infrastructure (registry, ledger, daemon bootstrap, IPC handshake).

## Success Criteria

- [ ] Panel serves Home + Overview read-only, bound to `127.0.0.1` only, refusing foreign
      Origin/Host and a missing/invalid token.
- [ ] `conmuta project sync-roster` resolves `roster_drift` end-to-end with an audit row, never
      auto-triggered.
- [ ] `WIRE_VERSION`/`SERVER_VERSION` visible in a rendered Telegram message; `encodeEnvelope`'s
      wire bytes unchanged, pinned by test.
