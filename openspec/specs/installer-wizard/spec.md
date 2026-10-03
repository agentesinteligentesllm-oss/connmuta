# installer-wizard Specification

## Purpose

The Node-floor-first gate order, home/registry scaffold, and the `setup`, `bot add`, `group add`,
`project bind <path>` wizards that give a human a guided path to configure the daemon and thin
client without hand-editing `registry.json` (D-38; OVERVIEW §10.1, §10.2).

## Requirements

### Requirement: Node-floor gate precedes every disk, git or autostart write

Every installer entry point (`setup`, `bot add`, `group add`, `project bind`, `doctor`) MUST call
the existing `enforceNodeFloor` gate (`src/daemon/node-floor.ts`) as its literal first action,
before flag parsing, before any filesystem write, before any git call, and before D-40's
start-at-login write. A Node build below the floor MUST produce zero filesystem writes and zero
git calls.

#### Scenario: Fake Node below the floor exits before any write

- GIVEN a Node executable reporting a version below the project floor
- WHEN `conmuta setup` is invoked
- THEN the process exits with the explicit error and download link, and no file, directory, or git
  call occurred

#### Scenario: Gate precedes flag parsing

- GIVEN a Node build below the floor and a malformed or unknown CLI flag
- WHEN the command runs
- THEN the reported failure is the Node-floor error, never a flag-parsing error

#### Scenario: Gate precedes the start-at-login write

- GIVEN a Node build below the floor and `setup` invoked with the start-at-login option selected
- WHEN the command runs
- THEN no Run-key or LaunchAgent write occurs

Traces: OVERVIEW §10.1 step 1; B-17; ADR-0031 rule 3; CONSTITUTION.md §3 layer 3

### Requirement: Home directory and empty registry scaffold before wizards run

After the Node-floor gate, `setup` MUST ensure `~/.conmuta/` and its subdirectories exist (reusing
`src/daemon/home.ts`) and MUST create an empty, schema-valid `registry.json` when none exists,
before any wizard screen is offered. `setup` MUST NOT overwrite an existing `registry.json`.

#### Scenario: First run scaffolds the home directory and an empty registry

- GIVEN no `~/.conmuta/` directory exists
- WHEN `conmuta setup` runs past the Node-floor gate
- THEN `~/.conmuta/` and its subdirectories are created, and a schema-valid empty `registry.json`
  exists before the first wizard prompt

#### Scenario: Existing registry is never overwritten by the scaffold step

- GIVEN a `~/.conmuta/registry.json` already containing at least one binding
- WHEN `conmuta setup` runs again
- THEN the scaffold step makes no write to `registry.json` and the existing bindings are unchanged

Traces: OVERVIEW §10.1 step 2; D-35

### Requirement: bot add records a bot without ever exposing its token

`conmuta bot add` MUST prompt for the bot token exactly once, masked on input; call `getMe` through
the daemon-side redacting Telegram client (never a bespoke unredacted call); store the token via
the existing secret-store write API under `bot:<bot_id>`; and record `{bot_id, username,
token_ref}` in the registry via the registry writer. The token MUST NOT appear in argv, in any
environment variable, in a log line, or in an error message at any point in this flow (D-37).

#### Scenario: Successful bot add stores the token and records the bot

- GIVEN a valid bot token entered at the masked prompt
- WHEN `conmuta bot add` completes
- THEN the secret store holds the token under `bot:<bot_id>`, `registry.bots` records
  `{bot_id, username, token_ref}`, and the terminal transcript never displays the token

#### Scenario: getMe failure never echoes the token

- GIVEN a token that `getMe` rejects as invalid
- WHEN `conmuta bot add` reports the failure
- THEN the error message names the failure class only, contains neither the token literal nor a
  token-shape match, and no registry or secret-store write occurs

Traces: D-37; OVERVIEW §10.2 "Add bot"; CONSTITUTION.md §2 inv. 2

### Requirement: group add refuses a group_id already bound

`conmuta group add` MUST record a negative numeric `group_id` and a display title, and MUST refuse
when the given `group_id` is already bound by an active binding, before any registry write.

#### Scenario: New group is recorded

- GIVEN a `group_id` not present in any existing binding
- WHEN `conmuta group add` completes
- THEN `registry.groups` records the new group and its title

#### Scenario: Already-bound group_id is refused

- GIVEN a `group_id` already referenced by an active binding
- WHEN `conmuta group add` is run with that same `group_id`
- THEN the command refuses before any write and the registry is unchanged

Traces: OVERVIEW §10.2 "Add group"; DATA-MODEL.md §2.5 R2

### Requirement: project bind enforces the bijective invariants before any write

`conmuta project bind <path>` MUST select one bot, one group, and one `agent_id`; MUST reject a
selection that would violate R1-R4 before writing anything; and only on success MUST write or
verify `conmuta.json` (identifiers only) and the registry binding.

#### Scenario: Valid binding is written

- GIVEN a bot, a group, and an `agent_id` that satisfy R1-R4
- WHEN `conmuta project bind <path>` completes
- THEN `conmuta.json` carries only identifiers, and `registry.projects`/`registry.bindings` record
  the new binding

#### Scenario: A binding that would violate R1 is refused before any write

- GIVEN a bot already carrying one active binding
- WHEN `conmuta project bind` is run selecting that same bot for a second active binding
- THEN the command refuses citing R1 and neither `conmuta.json` nor the registry is written

#### Scenario: A conflicting or malformed tool-config entry is refused before any write

- GIVEN a selected tool whose project config already contains a conflicting entry under the server name or is malformed
- WHEN `conmuta project bind` runs with that tool selected
- THEN the command refuses citing the tool config refusal reason before writing `conmuta.json` and before committing the registry binding, and leaves the project and registry unchanged

Traces: OVERVIEW §10.2 "Assign project"; DATA-MODEL.md §2.5 R1-R4; CONSTITUTION.md §2 inv. 1; ADR-0035

### Requirement: Written tool-config files are gitignored, never committed as-is

For each tool-config path `project bind` writes or leaves in place (`created`, `written`, or `noop`
from the edit engine — all three mean the file exists at that path), the installer MUST check the
target project's `.gitignore` for coverage of that path (an exact match or a covering parent
directory entry) and, when not already covered, MUST append an anchored ignore entry and report
what it added. Absolute node/script launcher paths are machine-specific (§7.1); a committed tool
config breaks for a teammate on a different machine or Node install (D-52).

#### Scenario: A newly written tool-config path with no matching .gitignore rule is covered

- GIVEN a target project directory with no `.gitignore`, or one that does not cover the tool-config
  path about to be written
- WHEN `project bind` writes that tool's config entry
- THEN `.gitignore` is created or appended with an entry covering the exact path, and the outcome
  reports the entry that was added

#### Scenario: An already-covered path is left untouched

- GIVEN a target project's `.gitignore` already covers the tool-config path (an exact entry or a
  covering parent-directory entry)
- WHEN `project bind` writes that tool's config entry
- THEN `.gitignore` is not modified, and the outcome reports no entry was added for that tool

Traces: design.md D-52 (§16 risk table, "Absolute paths in project configs are machine-specific")

### Requirement: Instruction files are written once and trust steps are printed, never bypassed

`project bind` MUST write `AGENTS.md` (bus protocol for agents, at most 200 lines) and `CLAUDE.md`
containing only `@AGENTS.md`, and MUST print each selected tool's one-time trust step as text;
the installer MUST NOT write any file or setting that grants that trust automatically.

#### Scenario: Instruction files are written within the line limit

- GIVEN a fresh `project bind` run with no pre-existing `AGENTS.md`
- WHEN the command completes
- THEN `AGENTS.md` is at most 200 lines and `CLAUDE.md` contains only `@AGENTS.md`

#### Scenario: Trust step is printed, not automated

- GIVEN a tool selected for config merge whose surface requires a one-time trust step
- WHEN `project bind` finishes writing that tool's config entry
- THEN the trust step is printed as instructions, and no auto-trust setting was written for it

Traces: OVERVIEW §10.1 step 5; THREAT-MODEL.md §5.6; CONSTITUTION.md §3 layer 3

### Requirement: Start-at-login is opt-in, idempotent, and fully removable

`setup` MUST offer start-at-login as an unchecked-by-default checkbox. When selected, it MUST
write exactly one OS-native autostart entry: the Windows Run key
(`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) or the macOS `~/Library/LaunchAgents` plist
— and MUST NOT create a Windows service, a Task Scheduler task, or a pm2 entry. Re-running `setup`
with the checkbox selected again MUST leave exactly one entry (no duplicates). Re-running `setup`
with the checkbox unselected, when an entry already exists, MUST remove that entry.

#### Scenario: Opt-in write on Windows creates exactly one Run-key value

- GIVEN a fresh Windows machine with no existing autostart entry for the product
- WHEN `setup` runs with start-at-login selected
- THEN exactly one `HKCU\...\Run` value is created, and no service or Task Scheduler task exists

#### Scenario: Opt-in write on macOS creates exactly one LaunchAgent plist

- GIVEN a fresh macOS machine with no existing LaunchAgent for the product
- WHEN `setup` runs with start-at-login selected
- THEN exactly one plist exists under `~/Library/LaunchAgents`, and no pm2 entry exists

#### Scenario: Re-running setup with the box checked is idempotent

- GIVEN a Windows Run-key value already written by a prior `setup` run
- WHEN `setup` runs again with start-at-login still selected
- THEN exactly one Run-key value exists afterward, with no duplicate or second entry

#### Scenario: Unchecking on a re-run removes the entry

- GIVEN an existing autostart entry from a prior opt-in run
- WHEN `setup` runs again with start-at-login left unselected
- THEN the entry is removed and no autostart entry for the product remains

Traces: D-40; OVERVIEW §7.1 (D3); design.md:298

## Traceability

| Source | Requirement / Scenario |
|---|---|
| OVERVIEW §10.1 step 1; B-17 | Node-floor gate precedes every disk, git or autostart write |
| OVERVIEW §10.1 step 2 | Home directory and empty registry scaffold |
| D-37 | bot add records a bot without ever exposing its token |
| DATA-MODEL.md §2.5 R1-R4 | group add refuses an already-bound group_id; project bind enforces bijective invariants |
| design.md D-52 | Written tool-config files are gitignored, never committed as-is |
| THREAT-MODEL.md §5.6 | Instruction files written once; trust steps printed, never bypassed |
| D-40; OVERVIEW §7.1 | Start-at-login is opt-in, idempotent, and fully removable |
