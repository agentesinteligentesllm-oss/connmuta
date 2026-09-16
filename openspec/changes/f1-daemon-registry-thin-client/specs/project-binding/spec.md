# project-binding Specification

## Purpose

Schema, validation and hot-reload for the committed `conmuta.json` project file and the machine
`~/.conmuta/registry.json`; the source of the bot <-> group <-> project bijection (Invariant 1).

## ADDED Requirements

### Requirement: Committed project file schema

The system MUST validate `conmuta.json` with a strict zod schema per
[DATA-MODEL.md §1](../../../../../docs/02-architecture/DATA-MODEL.md#1-conmutajson-committed-project-file):
reject unknown keys instead of stripping them; require `schema_version` literal `1`; require
`project_id` matching the slug pattern `^[a-z0-9][a-z0-9-]{2,40}$` (D-06 closes DATA-MODEL §8's
open point in favor of a slug, not a UUID v4); require `group_id` a negative integer; require
`roster` with at least one entry whose `agent_id` matches `^@[a-z0-9][a-z0-9-]{1,30}$` and whose
`user_id` is a positive integer.

#### Scenario: Valid file loads

- GIVEN a `conmuta.json` with `schema_version: 1`, `project_id: "prj-example"`, `group_id:
  -1001234567890`, and one roster entry `{agent_id: "@alice-agent", user_id: 100000001, username:
  "alice_example_bot"}`
- WHEN the thin client or the token-shape validator parses it
- THEN the file loads successfully with every field typed per DATA-MODEL.md §1

#### Scenario: Unknown key rejected

- GIVEN a `conmuta.json` containing one key outside the schema
- WHEN it is loaded
- THEN the loader rejects the file instead of stripping the unknown key

#### Scenario: Future schema_version refused

- GIVEN a `conmuta.json` with `schema_version: 2`
- WHEN it is loaded
- THEN the loader refuses with an explicit upgrade message and never renames or rewrites the
  committed file

Traces: ADR-0028 rule 3; DATA-MODEL.md §1; PT-06; CONSTITUTION.md §2 inv. 1

### Requirement: Token-shape validator

A validator MUST scan `conmuta.json` and every installer-written tool config for the bot-token
shape `\d+:[A-Za-z0-9_-]{35}` (v1 `src/secrets.ts:16`) and for an `Authorization` literal, and MUST
reject a match without echoing it. The validator MUST be callable as `conmuta validate [<path> |
--stdin]` (D-29, F1 CLI deliverable), and that same command MUST be reusable from pre-commit
(opt-in `core.hooksPath`, no `prepare` script) and from `doctor` (F2).

#### Scenario: Seeded token-shaped string is caught

- GIVEN a `conmuta.json` field seeded with a string matching the token regex
- WHEN the validator runs
- THEN it rejects the file and names the offending field, never the matched text

#### Scenario: Clean file passes

- GIVEN a `conmuta.json` carrying identifiers only
- WHEN the validator runs
- THEN it reports no findings

#### Scenario: conmuta validate exits non-zero on a token-shaped match

- GIVEN a file piped to `conmuta validate --stdin` that contains a token-shaped string
- WHEN the command runs
- THEN it exits non-zero, names the offending field, and never echoes the matched text

Traces: ADR-0028 §"Committed project file"; DATA-MODEL.md §1 "Must never contain"; PT-05; D-29
(design.md:150, design.md:567); CONSTITUTION.md §2 inv. 2

### Requirement: Machine registry schema and invariants

The daemon MUST validate `~/.conmuta/registry.json` with a strict schema per
[DATA-MODEL.md §2](../../../../../docs/02-architecture/DATA-MODEL.md#2-conmutaregistryjson-machine-registry)
and MUST enforce invariants R1-R6 at every load: R1 at most one active binding per `bot_id`; R2 at
most one active binding per `group_id` and per `project_id`; R3 `binding.agent_id` is a roster
member whose `user_id` equals `binding.bot_id`; R4 `binding.group_id` equals the bound project's
`conmuta.json.group_id`; R5 no token-shaped string anywhere in the file; R6 every registry change
is a human action recorded in the audit log, never derived from bus data or a Bot API response.

#### Scenario: Duplicate bot_id across active bindings rejected (R1)

- GIVEN a registry with two `active` bindings both referencing `bot_id: 100000001`
- WHEN the daemon loads the registry
- THEN validation fails, R1 is named as the violated invariant, and neither binding activates

#### Scenario: Registry hot-reload without restart

- GIVEN a running daemon and a valid human edit to `registry.json` adding one binding
- WHEN the daemon detects the change
- THEN the new binding is validated and its poller starts without a daemon restart

#### Scenario: Malformed registry is quarantined, not defaulted

- GIVEN a `registry.json` that fails schema validation
- WHEN the daemon attempts to load it
- THEN the daemon keeps the last good registry in memory, raises condition `registry_invalid`, and
  never renames or overwrites the human-edited file

#### Scenario: Binding is never rewritten from bus or API data

- GIVEN a Telegram response reporting `migrate_to_chat_id` for a bound group
- WHEN the daemon receives it
- THEN the binding is left unchanged, the new id is surfaced only as a condition, and no
  `sendMessage` targets the new id until a human edits the registry

Traces: ADR-0028 rule 1, 6; ADR-0030 rule 1, 5; DATA-MODEL.md §2.5; PT-18, PT-25;
CONSTITUTION.md §2 inv. 1

### Requirement: Name-bearing identifiers derive from one constant

Every identifier that embeds the product name (`conmuta.json`, `~/.conmuta/`, `conmuta mcp`,
tool-name prefixes) MUST derive from one shared named constant, so a future rename (pending B-11)
touches one definition.

#### Scenario: Single source of truth for the product name

- GIVEN the shared constants module defines the product name once
- WHEN the project-file name, the home-directory name, and the CLI entry name are compared across
  the codebase
- THEN every occurrence traces to that one constant and no second hard-coded spelling exists

Traces: D-09; CONSTITUTION.md §5

## Traceability

| Source | Requirement / Scenario |
|---|---|
| ADR-0028 row "One `bot_id` in at most one active binding" | Machine registry schema and invariants -> Duplicate bot_id rejected (PT-18) |
| ADR-0028 row "`conmuta.json` carries identifiers only" | Committed project file schema; Token-shape validator (PT-05, PT-06) |
| ADR-0030 row "Registry validation and quarantine" | Machine registry schema and invariants -> Malformed registry is quarantined |
| DATA-MODEL.md §2.5 R1-R6 | Machine registry schema and invariants |
| DATA-MODEL.md §8 open point "project_id format" | Committed project file schema (resolved: slug, D-06) |
| D-09 | Name-bearing identifiers derive from one constant |
| D-29 (design.md:150, design.md:567) | Token-shape validator -> conmuta validate exits non-zero |
| PT-25 | Binding is never rewritten from bus or API data |
