# Wake Ladder Specification

## Purpose

The wake ladder is a machine-local, per-binding authorization policy that governs whether and how the wake satellite (`conmuta-runner`) may wake an agent for a project. It defines four strictly ordered capability levels (`off`, `notify`, `wake`, `autopilot`), enforces a fail-closed evaluation doctrine, mandates human audit attribution (`--by`) on every mutation, provides an immediate kill switch (`ladder disable`), and keeps all execution policies outside of the committed, repository-tracked `conmuta.json`.

This specification records the delivered, verified retrospective behavior of `runner/ladder.ts` and `runner/cli.ts`.

## Constants and Schema

Per `runner/constants.ts` and `runner/ladder.ts`:
- `LADDER_SCHEMA_VERSION = 1`: The schema version for `<home>/runner/ladder.json`. A file with a missing or differing schema version MUST be treated as malformed.
- `LADDER_LEVELS = ["off", "notify", "wake", "autopilot"] as const`: The closed vocabulary of capability levels in ascending order of capability.
- `LADDER_POLL_MS = 5_000` (5 s): How often the ladder file is re-read while the runner is idle (`off`) or in `notify`.

## Security Pinning

- **PT-35** (`test/runner/ladder.test.ts`): The ladder fails closed to `off` on every corruption or missing field, requires non-empty human signature (`by`), is managed exclusively via `conmuta-runner ladder` CLI, and is structurally forbidden from appearing in the committed `conmuta.json` (via `parseProjectFile`).
- **PT-34** (`test/security/runner-bundle.test.ts`): The core daemon contains zero references to the ladder or satellite modules.

---

## Requirements

### Requirement: Machine-Local Store Isolated from Committed Repository State

The wake ladder MUST be stored machine-locally at `<home>/runner/ladder.json` (resolved via `ladderPathFor(homeDir)`), completely decoupled from the repository's committed `conmuta.json`. The committed project file schema (`src/shared/project-file.ts`) MUST reject any top-level `runner` or `ladder` key as unknown, preventing execution authorization policies from being committed or checked into source control.

Pinned by: `test/runner/ladder.test.ts` ("ladder: the committed project file cannot carry a ladder key at all (PT-35's schema-shape half)"), PT-35.

#### Scenario: Committed conmuta.json rejects ladder configuration keys

- GIVEN a `conmuta.json` file containing a `runner: { enabled: true, level: "autopilot" }` property
- WHEN `parseProjectFile` parses the content
- THEN it MUST return `ok: false`
- AND it MUST reject the file due to unrecognized keys

#### Scenario: Ladder records persist under local daemon home

- GIVEN a daemon home directory path `~/.conmuta`
- WHEN `ladderPathFor` is invoked
- THEN it MUST resolve strictly to `~/.conmuta/runner/ladder.json`
- AND mutations MUST NOT touch any workspace git repositories

---

### Requirement: Four-Level Ascending Capability Ladder

The system MUST enforce a closed set of four capability levels (`LADDER_LEVELS`), ordered from least to greatest capability:
1. `off` (default): The satellite ignores all doorbell traffic for this binding; no session is held and no turn is started.
2. `notify`: The satellite reports new bus traffic to human operators via stderr diagnostic lines and commits the cursor, but MUST NOT launch any agent turn.
3. `wake`: The satellite spawns a single turn in the read/reply-only execution profile.
4. `autopilot`: The satellite spawns a single turn in the confined act profile, permitting test/linter execution and scoped workspace edits.

Pinned by: `test/runner/ladder.test.ts` ("ladder: every declared harness name is accepted, and the level is carried through verbatim", "ladder: an explicit `off` record resolves to off with `level_off`, distinct from `no_record`").

#### Scenario: Off level prevents all turn executions and polling

- GIVEN a binding record in `ladder.json` has `level: "off"`
- WHEN `resolveLadder` evaluates the binding
- THEN it MUST resolve to `{ kind: "off", reason: "level_off" }`
- AND the runner MUST NOT start any process

#### Scenario: Autopilot level allows confined execution profile

- GIVEN a valid binding record in `ladder.json` with `level: "autopilot"` and `harness: "pi"`
- WHEN `resolveLadder` evaluates the binding
- THEN it MUST resolve to `{ kind: "entry", entry: { level: "autopilot", harness: "pi", ... } }`

---

### Requirement: Fail-Closed Resolution on Missing, Corrupt, or Unsigned Records

Every failure mode of the ladder file or record MUST resolve that binding to `kind: "off"` with an explicit reason (`LadderOffReason`):
- Missing file or unrecorded project ID: `{ kind: "off", reason: "no_record" }`.
- Unreadable file (e.g. EACCES): `{ kind: "off", reason: "unreadable" }`.
- Invalid JSON, missing `schema_version`, or `schema_version !== 1`: `{ kind: "off", reason: "malformed" }`.
- Unknown or invalid level value: `{ kind: "off", reason: "unknown_level" }`.
- Unknown harness binary name: `{ kind: "off", reason: "unknown_harness" }`.
- Missing or empty `by` or `at` properties: `{ kind: "off", reason: "malformed" }`.

The system MUST NEVER guess, infer defaults, or fall back to an active level.

Pinned by: `test/runner/ladder.test.ts` ("ladder: a missing file resolves every binding to off with `no_record`", "ladder: a binding with no record is off even when other bindings are enabled", "ladder: an unparseable file resolves every binding to off with `malformed`, never to a default", "ladder: a wrong or missing schema_version is malformed", "ladder: an unknown level is off with `unknown_level`", "ladder: an unknown harness is off with `unknown_harness`", "ladder: a record with no human note is malformed"), PT-35.

#### Scenario: Corrupted JSON file fails closed without raising capability

- GIVEN `ladder.json` contains malformed syntax such as `{ invalid json`
- WHEN `readLadderFile` and `resolveLadder` are called for any project ID
- THEN `readLadderFile` MUST report `problem: "malformed"`
- AND `resolveLadder` MUST return `{ kind: "off", reason: "malformed" }`

#### Scenario: Unknown harness name fails closed

- GIVEN `ladder.json` contains a binding record specifying `harness: "sh"`
- WHEN `resolveLadder` evaluates the binding
- THEN it MUST return `{ kind: "off", reason: "unknown_harness" }`
- AND it MUST NOT execute `sh` or any default harness

#### Scenario: Unsigned ladder entry fails closed on read

- GIVEN a manually edited `ladder.json` entry with `by: ""` (empty human signature)
- WHEN `resolveLadder` evaluates that project
- THEN it MUST return `{ kind: "off", reason: "malformed" }`

---

### Requirement: Mandatory Operator Attribution (`--by`) on All Mutations

Every ladder mutation executed via `conmuta-runner ladder set` or `conmuta-runner ladder disable` MUST require a non-empty human signature string via `--by "<operator note>"`. `writeLadderEntry` and `removeLadderEntry` (`runner/ladder.ts`) MUST reject any entry where `by` is not a non-empty string. When writing via the CLI, the current timestamp MUST be automatically recorded in ISO-8601 format under `at`. Unsigned write attempts MUST throw an error and refuse to write to disk.

Pinned by: `test/runner/ladder.test.ts` ("ladder: a record with no human note is malformed", "ladder: an invalid entry is refused at the write"), `test/runner/cli.test.ts` ("cli: parsing refuses anything it does not fully understand"), PT-35.

#### Scenario: CLI refuses ladder set when --by is missing

- GIVEN an operator executes `conmuta-runner ladder set --project p1 --level wake --harness pi` without `--by`
- WHEN `parseRunnerArgs` evaluates the argv
- THEN it MUST return `null`
- AND the CLI MUST exit with `EXIT_USAGE` (2) without modifying `ladder.json`

#### Scenario: Write operation enforces non-empty attribution and ISO timestamp

- GIVEN a valid request to set level `wake` with `--by "Operator on call"`
- WHEN `writeLadderEntry` writes the record
- THEN the resulting JSON record in `ladder.json` MUST contain `by: "Operator on call"`
- AND it MUST contain a valid ISO-8601 string in `at`

---

### Requirement: Mandatory Harness Declaration for Turn-Executing Levels

When setting a ladder level via `conmuta-runner ladder set`, the `--harness <name>` option MUST be strictly mandatory for any level that starts a turn (`wake` and `autopilot`). The value MUST be one of `HARNESS_NAMES` (`["pi", "claude", "codex", "opencode"]`). For levels that do not execute turns (`off` and `notify`), `--harness` MAY be omitted.

Pinned by: `test/runner/cli.test.ts` ("cli: `ladder set` requires a harness exactly for the levels that start a turn", "cli: parsing refuses anything it does not fully understand").

#### Scenario: Setting wake level without harness is rejected

- GIVEN an invocation `conmuta-runner ladder set --project p1 --level wake --by "note"` without `--harness`
- WHEN `parseRunnerArgs` parses the options
- THEN it MUST reject the command as invalid usage
- AND it MUST return `null`

#### Scenario: Setting notify level without harness is accepted

- GIVEN an invocation `conmuta-runner ladder set --project p1 --level notify --by "note"`
- WHEN `parseRunnerArgs` parses the options
- THEN it MUST parse successfully as `{ kind: "ladder-set", project: "p1", level: "notify", ... }`

---

### Requirement: Atomic Mutation Preserving Other Bindings

When writing or removing a ladder entry:
1. `writeLadderEntry` and `removeLadderEntry` MUST read existing valid bindings from `ladder.json` and preserve all other projects.
2. The write MUST be performed atomically by creating a temporary file in the same directory (`<path>.<pid>.tmp`) with file mode `0o600` and renaming it over `<path>`.
3. If the existing file is unreadable or malformed, mutations MUST be refused with an error rather than overwriting and dropping another binding's record.

Pinned by: `test/runner/ladder.test.ts` ("ladder: writing an entry preserves the other bindings and round-trips through the reader", "ladder: removal refuses to rewrite a file it could not read, instead of destroying it").

#### Scenario: Updating one binding preserves existing records of other projects

- GIVEN `ladder.json` contains active entries for `project-alpha` and `project-beta`
- WHEN `writeLadderEntry` is called to update `project-alpha`
- THEN `project-beta`'s record MUST remain identical and uncorrupted
- AND the updated file MUST have permissions `0o600` in directory `0o700`

#### Scenario: Mutation refuses to overwrite an unreadable or corrupt ladder file

- GIVEN `ladder.json` contains malformed content
- WHEN `writeLadderEntry` or `removeLadderEntry` is called
- THEN it MUST throw `refusing to write: the existing ladder file is malformed`
- AND the existing file MUST NOT be truncated or replaced

---

### Requirement: Immediate Kill Switch via Record Removal (`ladder disable`)

The satellite's operational kill switch MUST be `conmuta-runner ladder disable --project <id> --by "<note>"`. It MUST remove the binding entry from `<home>/runner/ladder.json` via `removeLadderEntry`. Once removed, the binding immediately resolves to `{ kind: "off", reason: "no_record" }`. Removing the final binding from the file MUST leave a valid, empty `bindings: {}` structure with `schema_version: 1` rather than deleting the file or leaving an invalid format. Additionally, every ladder disable or set action MUST append an audit row of kind `ladder` to `wake-ledger.jsonl`.

Pinned by: `test/runner/ladder.test.ts` ("ladder: removeLadderEntry is the kill switch — the binding is gone, the others survive", "ladder: removing the last entry leaves an empty, still-readable file"), `test/runner/cli.test.ts` ("cli: `ladder set` and `ladder disable` append an audit row to the wake ledger").

#### Scenario: Ladder disable removes binding and logs audit row

- GIVEN an active binding for project `telegram-bus-agent` at level `wake`
- WHEN the operator runs `conmuta-runner ladder disable --project telegram-bus-agent --by "Emergency halt"`
- THEN `removeLadderEntry` MUST delete the entry for `telegram-bus-agent`
- AND subsequent calls to `resolveLadder` for that project MUST return `{ kind: "off", reason: "no_record" }`
- AND a row of kind `ladder` with note `Emergency halt` MUST be appended to `wake-ledger.jsonl`
