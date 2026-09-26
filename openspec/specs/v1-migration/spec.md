# v1-migration Specification

## Purpose

Unilateral, non-destructive migration from `~/.agentbus` (B-13): backup, synthesized registry,
token relocation, thread/state import, and the runbook that states the >24 h cursor-gap
limitation.

## ADDED Requirements

### Requirement: v1 files are backed up and never modified or deleted

The migration MUST write `~/.agentbus/{config,state}.json.bak-pre-v2-<date>` siblings before
reading, and MUST NOT modify or delete any v1 file.

#### Scenario: Originals are byte-identical after migration

- GIVEN a v1 `~/.agentbus` fixture built from placeholders only (never production identifiers)
- WHEN the migration runs
- THEN `config.json.bak-pre-v2-<date>` and `state.json.bak-pre-v2-<date>` exist, and the original
  `config.json`/`state.json` are byte-identical to their pre-migration content

Traces: ADR-0030 §"Consequences" ("Unilateral migration... backup *.bak"); DATA-MODEL.md §6;
CONSTITUTION.md §0 (data hygiene: no v1 production identifiers copied into this repository's
fixtures)

### Requirement: Migration synthesizes the registry, secret-store entry and ledger rows

The migration MUST map `config.json.agent_id`/`bot_username`/`roster[agent_id].user_id` into
`registry.bots[]`; `config.json.chat_id` into `registry.groups[]`; the bot token — read ONLY from
`config.json.bot_token` or from `--token-stdin`, never from an environment variable and never from
argv (D-24; CONSTITUTION.md §2 inv. 2) — into the secret store under `bot:<bot_id>`, dropped from
the JSON copy; `state.json.next_update_id` into `offsets.next_update_id`; `state.json.threads` (+
history) into `threads`/`thread_history`; `state.json.seen_eids` into the `UNIQUE (project_id,
eid)` constraint on `updates`. `last_surfaced_digest` and `first_surfaced_at` MUST be dropped —
they become per-client state (durable-inbox). The migration MUST refuse
(`EXIT_MIGRATION_REFUSED`) when neither source carries a token, and MUST write nothing in that
case.

#### Scenario: Fixture migrates with a synthesized registry and secret entry

- GIVEN the placeholder v1 fixture from the previous requirement
- WHEN the migration runs
- THEN a `registry.json` with one bot, one group and one binding candidate exists, a secret-store
  entry exists under `bot:<bot_id>`, and `threads`/`thread_history` rows exist in the ledger for
  every migrated thread

#### Scenario: Project assignment stays a mandatory human action

- GIVEN the same migrated fixture
- WHEN migration completes
- THEN no `project_id` is bound to the synthesized bot/group pair — `project bind` (F2) remains
  required because v1's `config.json` carries no project or path field

#### Scenario: Env-only token is refused, nothing is written

- GIVEN a v1 fixture whose `config.json` has no `bot_token` field and no `--token-stdin` flag was
  passed, but an `AGENTBUS_BOT_TOKEN` environment variable is set in the process environment
- WHEN the migration runs
- THEN it exits `EXIT_MIGRATION_REFUSED` with an explicit "no token source" error, never reads the
  environment variable, and writes no backup, registry, secret-store entry, or ledger row

Traces: ADR-0030 §"Consequences"; DATA-MODEL.md §6; B-13; D-24 (design.md:562); design.md:483-487
(§13 step 2); CONSTITUTION.md §2 inv. 1, inv. 2

### Requirement: The >24h cursor gap is stated, never silently absorbed

The migration MUST NOT claim to recover updates lost while the v1 install was offline past
`BOT_API_RETENTION_HOURS` (24 h); the runbook MUST state this limitation and the one-poller rule
(v1 and the v2 daemon MUST NOT poll the same token concurrently) plainly.

#### Scenario: Stale cursor carries forward without a false recovery claim

- GIVEN a v1 `state.json.next_update_id` from more than `BOT_API_RETENTION_HOURS` (24) hours before
  migration
- WHEN migration runs
- THEN the stale cursor is carried forward verbatim, and no migration output implies the
  intervening updates were recovered

Traces: DATA-MODEL.md §7 `BOT_API_RETENTION_HOURS`; exploration.md Q5, Q8 item 7;
CONSTITUTION.md §5

### Requirement: Minimal non-interactive migration entry point

The migration MUST run from a minimal non-interactive CLI entry (no wizard prompts), suitable for
CI and for a first unattended run before `setup`'s interactive flow (F2) exists.

#### Scenario: Migration runs unattended against a fixture

- GIVEN the placeholder fixture and no interactive terminal
- WHEN the migration CLI entry is invoked with the fixture's `~/.agentbus` path
- THEN it completes without prompting and reports what it wrote

Traces: B-13; proposal.md deliverable 13

## Traceability

| Source | Requirement / Scenario |
|---|---|
| Success criterion "v1 ~/.agentbus fixture migrates with .bak-pre-v2-* siblings, a synthesized registry, a secret-store entry and imported threads; the originals are unchanged" | v1 files are backed up; Migration synthesizes the registry |
| DATA-MODEL.md §6 mapping table | Migration synthesizes the registry, secret-store entry and ledger rows |
| D-24 (design.md:562) | Migration synthesizes the registry... -> Env-only token is refused |
| exploration.md Q5 | The >24h cursor gap is stated, never silently absorbed |

**Intentionally not spec'd here:** D-08 (v1 reuse mechanism — copy from the frozen checkout with a
provenance header, AS-IS/SEAM verdicts) governs how *source code* is organized, not an observable
runtime behavior of the migrated system; it is a code-hygiene rule for the design/tasks phases, not
a testable spec scenario. No backlog id — tracked directly by proposal.md D-08.
