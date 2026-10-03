# tool-config-merge Specification

## Purpose

Per-format, non-destructive merge of one id-free stdio MCP entry into a tool's project-level
config file, opt-in per tool, across the 8 surfaces in the proposal's tool-config matrix
(OVERVIEW §10.3 plus Pi), including `.mcp.json`'s multi-reader status (D-34).

## Requirements

### Requirement: Strict per-format parse, tolerant of the JSON family's comment convention

The JSON-family surfaces (Claude Code, Cursor, VS Code, Gemini CLI, OpenCode, Antigravity, Pi
project and shared files) MUST be parsed with a JSONC-tolerant parser, not raw `JSON.parse`.
Codex CLI's `.codex/config.toml` MUST be parsed with a TOML parser. Parsing MUST fail closed:
a file that does not parse cleanly under its format's parser MUST NOT be merged.

#### Scenario: A JSONC file with comments parses successfully

- GIVEN a `.cursor/mcp.json` containing `//` comments alongside existing `mcpServers` entries
- WHEN the merge runs
- THEN the file parses successfully and the comments are recognized as part of the document

#### Scenario: A Codex TOML file parses successfully

- GIVEN a `.codex/config.toml` with an existing `[mcp_servers.other]` table
- WHEN the merge runs
- THEN the file parses successfully as TOML

#### Scenario: A file that fails to parse is not merged

- GIVEN a project config file with a syntax error under its format's parser
- WHEN the merge is attempted
- THEN no write occurs and the failure is reported as a parse error, not silently ignored

Traces: D-32; exploration.md Addendum item 2

### Requirement: Merge is refuse-and-diff on ambiguity, never a silent overwrite

The merge MUST refuse and show a diff, rather than write, when the target file fails to parse
cleanly, or when an entry under the same server name already exists with content different from
the entry being inserted.

#### Scenario: A conflicting same-named entry is refused with a diff

- GIVEN an existing `mcpServers` entry under the product's server name with a different `command`
  than the one the merge would write
- WHEN the merge runs
- THEN it refuses, shows a diff between the existing and intended entry, and makes no write

#### Scenario: An identical same-named entry is a no-op, not a refusal

- GIVEN an existing entry under the product's server name that already matches the intended entry
  exactly
- WHEN the merge runs again
- THEN it makes no write and reports the entry as already present

Traces: D-32; D-31 (Alpha condition); proposal.md "Risks"

### Requirement: Every merge takes a pre-edit backup and preserves surrounding bytes

Before writing, the merge MUST copy the target file to a backup sibling following this project's
`*.bak-pre-v2-<date>` convention. The write MUST preserve every byte outside the inserted entry:
pre-existing entries, non-MCP keys, comments, key order, and formatting MUST be unchanged.

#### Scenario: Backup exists after a merge

- GIVEN a target file that exists before the merge
- WHEN the merge writes the new entry
- THEN a `*.bak-pre-v2-<date>` sibling exists containing the pre-merge bytes

#### Scenario: Pre-existing unrelated content survives byte-for-byte

- GIVEN a `.gemini/settings.json` with one unrelated pre-existing `mcpServers` entry, a non-MCP
  key, and a comment
- WHEN the merge inserts the product's entry
- THEN the unrelated entry, the non-MCP key, and the comment are present afterward exactly as
  before, and the new entry is the only addition

Traces: D-36; D-31 (Alpha condition: fixtures start from a non-empty, realistic file)

### Requirement: Written entries are id-free stdio, zero env, never npx

Every written entry MUST launch `conmuta mcp` — carrying **no** `--project <id>` — as an installed-binary
stdio command, MUST carry zero `env` block, and MUST NOT resolve through `npx` in any form. The binding
comes from the nearest ancestor `conmuta.json` (ADR-0033); repeating the id inside the entry duplicates
the project file and outlives it, so a copied or re-bound directory would carry an entry asserting a
stale id and refuse to start (ADR-0034). An explicit `--project <id>` remains available to a human who
wants the assertion, but the installer never writes one.

#### Scenario: Written entry is id-free, with no env and no npx

- GIVEN a completed merge into any of the 8 surfaces
- WHEN the written entry is inspected
- THEN it carries no `--project` argument, no `env` key, and its `command`/equivalent is never `npx` or
  an `npx`-resolving form

Traces: ADR-0031 rule 2; ADR-0034; OVERVIEW §10.3

### Requirement: VS Code's differently-named key is used, not the shared convention

The merge into `.vscode/mcp.json` MUST insert the entry under the top-level key `servers`, not
`mcpServers`.

#### Scenario: VS Code entry lands under servers

- GIVEN a `.vscode/mcp.json` merge for the current project
- WHEN the write completes
- THEN the new entry is present under the top-level `servers` key

Traces: OVERVIEW §10.3

### Requirement: .mcp.json is treated as a shared surface across readers

A write to `.mcp.json` MUST be understood as affecting every tool that reads it (at minimum Claude
Code and Pi, per the confirmed shared read path); the merge MUST NOT write a second,
independently-tracked entry for Pi into `.mcp.json` when Pi is selected alongside Claude Code for
the same project, and MUST NOT write anything to Pi's global `~/.pi/agent/mcp.json`.

#### Scenario: Selecting both Claude Code and Pi writes one shared entry, not two

- GIVEN a project with no existing `.mcp.json`, and both Claude Code and Pi selected in the wizard
- WHEN the merge runs
- THEN `.mcp.json` contains exactly one entry for the product, and no second entry is written for
  Pi's own accounting

#### Scenario: Pi's global config is never written

- GIVEN Pi selected in the wizard
- WHEN the merge completes
- THEN `~/.pi/agent/mcp.json` is untouched

Traces: D-34; exploration.md Addendum item 4

### Requirement: OpenCode config is written only at the project level

The merge into `opencode.json` MUST write only the project-level file and MUST NOT write or modify
any global OpenCode config.

#### Scenario: OpenCode merge never touches a global file

- GIVEN OpenCode selected in the wizard
- WHEN the merge completes
- THEN only the project's `opencode.json` was written, and no global OpenCode config path was
  touched

Traces: OVERVIEW §10.3

## Traceability

| Source | Requirement / Scenario |
|---|---|
| D-32; exploration.md Addendum item 2 | Strict per-format parse, JSONC-tolerant / TOML |
| D-32; D-31 | Merge is refuse-and-diff on ambiguity |
| D-36; D-31 | Every merge takes a pre-edit backup and preserves surrounding bytes |
| ADR-0031 rule 2; ADR-0034 | Written entries are id-free stdio, zero env, never npx |
| OVERVIEW §10.3 | VS Code key; OpenCode project-only |
| D-34 | .mcp.json shared-surface handling |
