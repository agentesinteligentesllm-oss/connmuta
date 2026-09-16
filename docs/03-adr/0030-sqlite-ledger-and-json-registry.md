# ADR-0030 — `node:sqlite` ledger, human-editable JSON registry, OS secret store

> **Conmuta** is a working name pending trademark clearance (backlog B-11). The home folder
> `~/.conmuta` follows the final product name.

## Status

`accepted` — accepted by the tribunal (`bus-v2-landing-architecture-001`) and confirmed by the Director on 2026-09-16 (Director note DN-04).

## Date

2026-09-16 (UTC; consensus of the debate below).

## Debate

`bus-v2-landing-architecture-001`, round 1 proposal D4, round 1 objection n3 (Node ≥ 24 gate,
accepted), round 2 consensus. Record: [../05-tribunal/INDEX.md](../05-tribunal/INDEX.md).

## Context

v1 keeps everything in one JSON state file with whole-file writes; the production file is 1.4 MB
with manual backups. Invariant (3) — every update written to a durable inbox before the offset is
confirmed, then served through per-client cursors — cannot be met atomically with a JSON file
(`research[security-isolation]` T05: "a JSON file cannot give multi-reader cursors atomically").

v1 forbids a database: [0002](0002-build-from-scratch-minimal-deps.md) (two runtime dependencies,
"no new runtime dependencies" is a HANDOFF hard invariant) and the closed-permanently item
"rewriting `saveState`'s whole-file write … an append log or a database would violate ADR-02's
zero-dependency stance and ADR-03's no-daemon simplicity"
(`telegram-agent-bus/docs/functional-audit/06-verdict.md:171-173`). This ADR reopens that item.

Secrets: v1 passes the token through the IDE environment and embeds it in every request URL
(`research[security-isolation]` T04); the documented "mode 0600" is not implemented anywhere and
cannot be expressed with `fs.chmod` on Windows (T09).

## Options considered

| Concern | Option | Trade-off | Outcome |
|---|---|---|---|
| Runtime ledger | JSON state file (v1) | No atomic multi-reader cursors; 1.4 MB whole-file rewrites in production. | Superseded |
| Runtime ledger | `better-sqlite3` | Native addon; node-gyp fallback needs VS Build Tools/Python and fails on paths with spaces (`research[packaging-runtime]`). | Rejected |
| Runtime ledger | `node:sqlite` (built in) | Zero install risk, WAL; unflagged only from Node 24 (Alpha objection n3), hence the installer's first gate. | **Chosen** |
| Runtime ledger | External database / Docker | Licensing and overhead; no local bus uses it (D4). | Rejected |
| Registry | Everything in SQLite | Not human-editable; hot-reload of a hand edit is the point of the registry. | Not chosen |
| Registry | Human-editable JSON, hot-reloaded | Editable by the Director and by the control panel; validated at the boundary. | **Chosen** |
| Secrets | Token in IDE env / project file (v1) | Inherited by every child process; committed by accident (T03, T04). | Rejected |
| Secrets | OS keychain via `@napi-rs/keyring` | Prebuilds, no node-gyp; win-x64 / darwin-arm64 prebuilds to be verified (B-15). | **Chosen** |
| Secrets | ACL'd file fallback | `icacls` on Windows, `chmod 600` on POSIX; needs tests on both platforms (B-15). | **Chosen as fallback** |

## Decision

1. **Registry** `~/.conmuta/registry.json`: bots, groups, projects, bindings. Human-editable,
   validated with a strict schema at the boundary, hot-reloaded by the daemon. It maps
   `project_id` → my bot (a token *reference*, never the token) + my `agent_id`.
2. **Ledger** in `node:sqlite` (WAL): updates inbox, per-bot offsets, threads / `needs_action`,
   per-client cursors, per-binding audit log, Arena-light debate journal. Every update is written to
   the inbox before the offset is confirmed (write-ahead).
3. **Secrets** in the OS keychain via `@napi-rs/keyring`; fallback to an ACL'd file. Tokens never
   traverse env into IDE processes and never appear in project files, URLs, logs, errors or stacks.
4. **Audit log** is append-only per binding: send / receive / reject with outcome and reason
   (`WRONG_ROOM`, `foreign_chat`, `unknown_sender`, secret-pattern hits); it stores no rejected
   bodies and no tokens (T10).
5. **Doctrine of [0015](0015-state-integrity-validate-quarantine-migrate-once.md) is kept**: validate at the boundary,
   quarantine instead of defaulting, migrate once — applied to the registry file and to the ledger
   schema version.
6. **No Docker** in the client product; Docker only if a self-hosted Bot API server is ever
   offered.

Draft schemas live in [../02-architecture/DATA-MODEL.md](../02-architecture/DATA-MODEL.md) and are
finalized in the F1 SDD spec.

## Consequences

- The installer must gate Node ≥ 24 before touching disk or git (B-17,
  [0031](0031-npm-distribution-and-license.md)).
- Unilateral migration from `~/.agentbus`: backup `*.bak`, synthesized registry (F1, B-13).
- `@napi-rs/keyring` is a runtime dependency with native prebuilds; its presence on win-x64 and
  darwin-arm64 must be verified (B-15) before F1 is declared done.
- The "no new runtime dependencies" hard invariant of v1 is replaced by "runtime dependencies are
  enumerated in this ADR and the ones that follow it"; today: `@modelcontextprotocol/sdk`, `zod`,
  `@napi-rs/keyring`, `@clack/prompts` (D9).
- Open threads are still never pruned (v1 verdict, "reporting, never pruning"); the ledger makes
  growth observable per binding.

## Supersedes

- [0002](0002-build-from-scratch-minimal-deps.md) in part (the "no database" stance).
- Re-bases the mechanics of [0015](0015-state-integrity-validate-quarantine-migrate-once.md).
- Reopens the "database" item of the v1 closed-permanently list; the rest of that list stands.

## Tests that must pin it

| Guarantee | Test |
|---|---|
| Write-ahead before offset confirm | Crash injected between inbox insert and offset confirm → on restart the update is re-fetched and deduplicated by `(bot_id, update_id)`; never lost, never surfaced twice. |
| Per-client cursors | Two clients on one binding each see the same batch; advancing one cursor does not move the other. |
| Registry validation and quarantine | Malformed `registry.json` is renamed aside and reported, never replaced by defaults; a valid hot edit is picked up without restart. |
| No token in the registry or the ledger | Test writes a token-shaped string through every write path and asserts it never lands in `registry.json`, the database file, or the audit log. |
| No token in errors, logs or stacks | Bundle-level test: every error/log path is exercised with a fake token and the output is asserted free of the token regex. |
| Secret store fallback is ACL'd | Windows: `icacls` output for the fallback file shows only the current user; POSIX: mode is `0600`. Both platforms (B-15). |
| Audit log stores no rejected bodies | Rejected and foreign updates leave a row with reason and ids only. |
| Node floor | Startup on Node < 24 exits with the explicit error before any disk write. |
