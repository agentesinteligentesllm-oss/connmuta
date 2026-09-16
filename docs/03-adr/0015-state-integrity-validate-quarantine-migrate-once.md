# ADR-0015 — State integrity: validate, quarantine, migrate once

> **Conmuta** is a working name pending Director decision **B-11** ([backlog](../06-backlog/CHECKLIST.md)). This ADR is inherited from telegram-agent-bus v1; the full register is in [INDEX](./INDEX.md).

| Field | Value |
|---|---|
| **Status** | inherited-revisit — the doctrine stands; the storage it governed is replaced by [ADR-0030](./0030-sqlite-ledger-and-json-registry.md) |
| **Date** | 2026-08-15 (shipped with v1 `v0.6.0`, tag `55dfbc3`) |
| **Origin** | v1 `openspec/changes/telegram-agent-bus/design.md:348-366` (ADR-15); ADR granularity ratified in debate `agentbus-impl-plan-001` (v1 `docs/functional-audit/HANDOFF.md:360`) |
| **Supersedes / superseded by** | — / superseded in part by ADR-0030 (storage engine); doctrine retained |

## Context

`loadState` was `JSON.parse(raw) as State` — a claim TypeScript cannot check. Its failure mode was a `TypeError` raised inside whichever tool first touched the bad field, producing a stack trace naming `fetch.ts` for a fault living entirely in a file on disk. Separately, every block of the v0.6.0 audit added fields; doing that incrementally would have meant one migration per release.

## Decision

A zod schema at the boundary, matching how `config.json` was already treated. On failure: **quarantine**, not a throw and not a silent default.

| Option | Verdict |
|---|---|
| Throw on invalid state | Rejected. `state.json` is not hand-authored; a corruption would take the bus down with nobody having done anything |
| Start clean silently | Rejected. Loses every thread and the cursor without saying so — the agent cannot ask for context it does not know it lost |
| **Quarantine** | **Chosen.** Rename to `state.corrupt-<ts>.json`, start from `defaultState()`, raise `conditions.state_quarantined`. Keeps the forensics, keeps the bus alive, makes the amnesia visible |

Four rules complete it:

1. **The boundary of quarantine is content, not I/O.** An unreadable path still throws and is left exactly where it is; renaming a file that could not be read might destroy recoverable state.
2. **A file from the future is quarantined too.** zod strips unknown keys by default, so a `state.json` written by a newer build would load cleanly, silently discard what that version added, and be written back in the reduced shape — data loss on a downgrade with no error anywhere.
3. **One migration for the whole programme.** Version 2 carries every field the audit produced. Two derivations are inferences and both were checked: `awaiting = thread.to` on open threads (provable because `REPLY` did not exist yet, so the turn could never have returned to the originator); `closure_delivered = true` on resolved threads (provable because version 1 never wrote local state when the transport failed — the defect is what makes the derivation sound). A third, `group_message_id = opened_message_id` when `via === "group"`, is a definition rather than a guess.
4. **`opened_type` keeps `BROADCAST` in the schema.** The migration drops those threads and runs once, but the receive path stopped minting them only in the next PR; a narrowed enum would have quarantined a healthy file in between. Pruning drops any stray instead, so the system converges without punishing a file whose only fault is being out of date.

## Consequences

- `STATE_VERSION = 2` is a named constant (v1 `src/config.ts:129`). A file with no `state_version` is version 1; a file declaring a higher version is quarantined rather than read (v1 `src/state.ts:427`).
- Quarantine is a rename on disk (v1 `src/state.ts:375-378`) performed inside `loadState` (v1 `src/state.ts:388-436`). That side effect is why a background reader must never call `loadState` — the constraint [ADR-0024](./0024-channel-doorbell-not-a-second-reader.md) builds on.
- The v1 `state.ts` module (validation, quarantine, migration) is on the library-reuse list of decision D1.

Pinned by (v1 `test/state.test.ts`): `:321` invalid file quarantined and announced; `:340` unparseable JSON quarantined; `:366` newer-version file quarantined, not stripped; `:384` unreadable path throws and is not quarantined; `:551` v0.5.0 migration derivations; `:597` migration drops `BROADCAST`-opened threads; `:618` v0.5.1 file is still version 1; `:513` stray `BROADCAST` thread pruned.

## Relevance to Conmuta

- **The storage changes; the doctrine does not.** Decision D4 replaces `state.json` with a `node:sqlite` ledger (WAL) plus a human-editable `~/.conmuta/registry.json` hot-reloaded by the daemon ([ADR-0030](./0030-sqlite-ledger-and-json-registry.md), [DATA-MODEL](../02-architecture/DATA-MODEL.md)). The four rules above — validate at the boundary, quarantine rather than default, refuse a file from the future, migrate once — apply to both stores. Because the registry is hand-editable, a validation failure there must be reported to the human, never defaulted away.
- **Migration from v1 is the first consumer.** F1 performs a unilateral migration from `~/.agentbus` (D11; backlog B-13): backup as `*.bak`, synthesized registry. The production `state.json` is 1.4 MB with manual backups (verified facts), so the migration keeps the original and runs exactly once, as this ADR did for version 1 to 2.
- **What "quarantine" means for a SQLite file is undecided** — pending the F1 SDD spec. The analysis verdict for this ADR is REVISIT if storage changes, doctrine retained (analysis bundle, `governance-docs` key_facts[15]).
- The v1 closed item "rewriting `saveState`'s whole-file write — append log or database rejected" (v1 `docs/functional-audit/06-verdict.md:173`) is consciously reopened by ADR-0030; the reopening is recorded in [CONSTITUTION](../01-constitution/CONSTITUTION.md), not here.
