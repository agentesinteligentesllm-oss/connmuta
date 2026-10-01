# Wake Satellite Specification

## Purpose

The wake satellite (`conmuta-runner`) is an autonomous, machine-local process that monitors the core daemon's body-less doorbell signal (`/channel/doorbell`) on behalf of a bound project and triggers a single, bounded headless agent turn when bus messages arrive for that project. It operates entirely as an external client via loopback IPC, leaving the core daemon passive and execution-free.

This specification records the delivered, verified retrospective behavior of the satellite's process lifecycle, project binding resolution, loop pacing, independent watermark tracking, bounds enforcement, commit-last cursor semantics, and graceful termination.

## Constants and Reasoning

Per ADR-0032 R5 and CONSTITUTION §5 (the named-constant rule), all numeric thresholds and operational bounds are declared as named constants in `runner/constants.ts` with explicit architectural reasoning:

| Constant | Value | Reasoning |
|---|---|---|
| `WAKE_COOLDOWN_MS` | `10_000` (10 s) | A peer's two consecutive messages must not start two turns. Ten seconds is the floor a human needs to read one message, and it is the value the Director's RFC proposed (`cooldown_seconds: 10`). |
| `WAKE_BUDGET_WINDOW_MS` | `3_600_000` (1 h) | The budget window: one hour, the same period the group rate ceiling already reasons about. |
| `WAKE_BUDGET_PER_WINDOW` | `20` | At most twenty wakes per binding per window. Twenty turns an hour is already far more than a human can read, and the cap turns a peer's storm into a bounded cost instead of an unbounded one. |
| `LADDER_POLL_MS` | `5_000` (5 s) | How often the ladder file is re-read while the runner is idle (`off`) or in `notify`. Enabling or killing the satellite takes effect within five seconds without holding a daemon session while nobody wants one. |
| `WAKE_TURN_TIMEOUT_MS` | `600_000` (10 min) | A headless turn that has not finished in ten minutes is stopped. Without this bound one hung harness would hold the binding's single in-flight slot forever. |
| `WAKE_KILL_GRACE_MS` | `5_000` (5 s) | After the timeout, how long a harness gets to exit on `SIGTERM` before it is killed outright with `SIGKILL`. |
| `MILLISECONDS_PER_SECOND` | `1_000` | Milliseconds in a second, named so conversions cannot be read as magic numbers. |
| `REFUSAL_REPEAT_MS` | `60_000` (60 s) | At most one refusal row per binding per this interval. A bound still in force must be recorded (never a silent drop) but must not flood the ledger while the loop re-reads the same pending message. |
| `LADDER_SCHEMA_VERSION` | `1` | The ladder file's schema version. A record written by a future version is refused, not guessed at. |
| `MAX_WAKE_PROMPT_CHARS` | `2_000` | Hard ceiling on the wake prompt's length as a code-defect backstop against exceeding OS argv limits. |
| `MAX_TURN_OUTPUT_CHARS` | `8_000` | How much of a turn's stdout/stderr the runner forwards to stderr, preventing unbounded memory or log growth. |
| `RUNNER_NAME` | `"conmuta-runner"` | The bin's own name, used for usage lines, diagnostics, and as the `client_cursors.host` label in the daemon session. |
| `RUNNER_SHUTDOWN_TIMEOUT_MS` | `5_000` (5 s) | Bound on shutdown wait once abort is requested: session deletion and loop unwind are allowed up to 5 seconds. |

## Security Pinning

- **PT-34** (`test/security/runner-bundle.test.ts`): The satellite links the daemon strictly through loopback IPC (`createDaemonLink`), never importing `node:sqlite`, `src/ledger/*`, or `src/daemon/*`. Core closures contain zero references to `dist/runner/`.
- **PT-36** (`test/runner/loop.test.ts`, `test/runner/ledger.test.ts`): Bound refusals, turn executions, and watermark tracking are verified without network or process side-effects.

---

## Requirements

### Requirement: Standalone Binary Entry Point and Binding Resolution

The satellite MUST be executable via the standalone binary entry point `conmuta-runner` (`runner/main.ts`) using the `run` command. It MUST require `--project <id>` and resolve the project root directory by walking up from `--cwd` (or `process.cwd()`) to find `conmuta.json` via `resolveProjectBinding`. If the flag is omitted, or if the project file is missing, unreadable, invalid, or bound to a different `project_id`, the process MUST terminate immediately with the corresponding binding refusal exit code (`EXIT_USAGE` or `EXIT_UNBOUND_PROJECT`) without creating a daemon IPC session.

Pinned by: `test/runner/main.test.ts` ("main: without --project the startup refuses before touching anything", "main: an unbound directory refuses and never creates a daemon session", "main: a project file bound to another project refuses with its own exit code"), PT-34 in `test/security/runner-bundle.test.ts`.

#### Scenario: Startup fails when --project flag is missing

- GIVEN the runner CLI is invoked with `run` and no `--project` argument
- WHEN `runLoop` evaluates the request
- THEN it MUST output `--project is required` to stderr
- AND it MUST return exit code `EXIT_USAGE` (2) without initiating any IPC connection

#### Scenario: Startup fails when no project file exists above working directory

- GIVEN a working directory with no `conmuta.json` file in its ancestry
- WHEN `runLoop` attempts to resolve the project binding
- THEN it MUST return exit code `EXIT_UNBOUND_PROJECT` (3)
- AND it MUST NOT establish a daemon IPC session or mint a bearer token

#### Scenario: Startup succeeds with valid matching project file

- GIVEN a valid `conmuta.json` containing `project_id: "telegram-bus-agent"`
- WHEN `runLoop` is called with `--project "telegram-bus-agent"`
- THEN it MUST resolve the binding successfully
- AND it MUST establish a daemon link via `createDaemonLink` with `host: RUNNER_NAME` ("conmuta-runner")

---

### Requirement: Loopback IPC Authentication Without Secrets

The satellite MUST authenticate against the local daemon exclusively via the standard loopback IPC handshake (`GET /identity` challenge followed by `POST /session` signed challenge response). It MUST NOT read the Telegram bot token, MUST NOT access the system keychain, MUST NOT read `~/.conmuta/secret-fallback.token`, and MUST NOT link `src/secret-store/*`. The daemon session MUST register with `host: RUNNER_NAME` (`"conmuta-runner"`).

Pinned by: PT-34 in `test/security/runner-bundle.test.ts` ("PT-34: the satellite links the daemon's IPC, never its ledger or its internals").

#### Scenario: Satellite establishes session without secret material

- GIVEN the runner starts up for an authorized project
- WHEN `createDaemonLink` connects to the daemon loopback port
- THEN it MUST authenticate using only the project file's identity and roster hash
- AND it MUST hold only an ephemeral IPC session bearer token
- AND its static closure MUST NOT contain `src/secret-store/` or `node:sqlite`

---

### Requirement: Idle Pacing When Ladder is Off or Problematic

On every loop tick, `WakeLoop` (`runner/loop.ts`) MUST read the ladder state from `ladderPathFor(homeDir)`. If the ladder resolves to `kind: "off"` (whether due to `no_record`, `level_off`, `unreadable`, `malformed`, `unknown_level`, or `unknown_harness`), the loop MUST return tick outcome `"idle"`. While idle, the runner MUST NOT issue any doorbell read to the daemon and MUST sleep for `LADDER_POLL_MS` (5,000 ms) before the next tick. If the off reason is due to an error (`unreadable`, `malformed`, `unknown_level`, or `unknown_harness`), it MUST record a refusal row in the ledger with that reason, debounced by `REFUSAL_REPEAT_MS`.

Pinned by: `test/runner/loop.test.ts` ("loop: an `off` binding reads nothing at all", "loop: a broken ladder file is recorded once with its reason, and never wakes anything", "loop: run() paces an idle binding with the ladder poll and stops promptly on abort").

#### Scenario: Runner remains idle when no ladder record exists

- GIVEN `ladder.json` contains no entry for the bound project
- WHEN `WakeLoop.tick` executes
- THEN it MUST return `"idle"`
- AND it MUST NOT make any call to `DaemonLink.readDoorbell`
- AND `WakeLoop.run` MUST sleep for `LADDER_POLL_MS` before retrying

#### Scenario: Malformed ladder is logged once to ledger and paces execution

- GIVEN `ladder.json` is corrupt or invalid JSON
- WHEN `WakeLoop.tick` executes repeatedly
- THEN it MUST record exactly one `refused` ledger row with `reason: "malformed"` during the debounce window
- AND it MUST NOT issue doorbell requests to the daemon

---

### Requirement: Independent Watermark Tracking and Resume Point

The satellite MUST maintain its own persistent watermark file per project at `<home>/runner/watermark.json` via `runner/watermark.ts`. On the first tick of an enabled binding, if no persisted watermark exists for the project, the runner MUST initialize its watermark from the daemon's seed by calling `commitCursor()` with no arguments and persisting that value. On subsequent runs or restarts, the runner MUST resume from its persisted watermark and MUST NOT re-seed from the daemon's catch-up window (`SESSION_CATCHUP_HOURS`). The watermark MUST be written atomically and MUST never decrease.

Pinned by: `test/runner/watermark.test.ts`, `test/runner/loop.test.ts` ("loop: the first enabled tick bootstraps the watermark from the daemon's own cursor row", "loop: a restart resumes from its own persisted watermark, not from the daemon's catch-up window").

#### Scenario: First run bootstraps watermark from daemon cursor seed

- GIVEN no watermark entry exists for project `telegram-bus-agent` in `watermark.json`
- WHEN `WakeLoop.tick` executes for the first time
- THEN it MUST invoke `DaemonLink.commitCursor()` without arguments to fetch the daemon's session seed
- AND it MUST write that sequence number into `<home>/runner/watermark.json`
- AND the subsequent doorbell read MUST pass `afterSeq` equal to that seed

#### Scenario: Restart resumes from persisted watermark without re-reading catch-up window

- GIVEN `watermark.json` already contains sequence number `50` for project `telegram-bus-agent`
- WHEN a new runner process starts and executes `WakeLoop.tick`
- THEN it MUST read `50` from `watermark.json`
- AND its initial doorbell poll MUST request `after_seq: 50`
- AND it MUST NOT invoke `commitCursor()` to bootstrap from the daemon's catch-up window

---

### Requirement: Doorbell Long-Poll and Non-Spinning Silent Responses

When armed (`notify`, `wake`, or `autopilot`), the satellite MUST call `DaemonLink.readDoorbell(afterSeq, longPollSeconds, signal)`, defaulting `longPollSeconds` to `FETCH_LONGPOLL_MAX_SECONDS` (50 s). If the daemon answers with `count === 0`, indicating that inspected messages were not relevant to this project, the loop MUST:
1. Advance its local in-memory and persisted watermark in `watermark.json` to `summary.covered_through_seq`.
2. MUST NOT call `DaemonLink.commitCursor` (the daemon cursor is reserved for turns that act).
3. MUST return outcome `"silent"`.
4. MUST NOT spin: the subsequent tick MUST use the updated `afterSeq`, preventing repeated scans of the same quiet window.

Pinned by: `test/runner/loop.test.ts` ("loop: a quiet inbox is `silent` — no wake, no row, and the long poll carries the wait", "loop: a silent read advances the runner's own watermark, so the loop cannot re-read the same window", "loop: the doorbell read uses the daemon's own long-poll clamp by default").

#### Scenario: Quiet doorbell response advances local watermark without daemon cursor commit

- GIVEN the doorbell returns a summary with `count: 0` and `covered_through_seq: 42`
- WHEN `WakeLoop.tick` handles the response
- THEN it MUST advance the local watermark in `watermark.json` to `42`
- AND it MUST NOT call `DaemonLink.commitCursor`
- AND it MUST return tick outcome `"silent"`
- AND the subsequent tick MUST poll with `afterSeq: 42`

---

### Requirement: Dual Ladder Resolution Before and After Long-Poll

To ensure that the kill switch and ladder demotions take immediate effect, `WakeLoop` MUST resolve the ladder twice per tick that receives bus traffic:
1. Once before issuing the long-poll to verify authorization.
2. A second time immediately after `readDoorbell` returns with `count > 0`, re-reading `ladder.json` from disk.

If the re-read reveals that the binding was removed or set to `off` while the long-poll was awaiting traffic, the loop MUST abort execution of the wake, MUST NOT spawn any harness, MUST NOT advance the watermark, and MUST return outcome `"idle"`.

Pinned by: `test/runner/loop.test.ts` ("loop: the ladder is re-read after the poll — disabling during the wait stops the wake").

#### Scenario: Disabling ladder during doorbell wait prevents turn launch

- GIVEN the runner is waiting in `readDoorbell` for project `telegram-bus-agent`
- WHEN an operator removes the ladder entry using `ladder disable` before traffic arrives
- AND the doorbell poll subsequently returns `count: 2`
- THEN `WakeLoop.tick` MUST re-read `ladder.json`
- AND detecting `kind: "off"`, it MUST NOT launch any child process
- AND it MUST NOT advance the cursor or watermark
- AND it MUST return tick outcome `"idle"`

---

### Requirement: Human Notification at `notify` Level Without Turn Execution

When the resolved ladder entry has `level: "notify"`:
1. The runner MUST NOT construct a harness spec or spawn any child process.
2. It MUST write a diagnostic notification line to stderr indicating the message count, senders, and thread IDs.
3. It MUST append a `notify` row to `<home>/runner/wake-ledger.jsonl`.
4. It MUST commit the cursor to the daemon via `DaemonLink.commitCursor(covered_through_seq)` and advance the local watermark.
5. It MUST return tick outcome `"notified"`.

Pinned by: `test/runner/loop.test.ts` ("loop: `notify` tells the human and starts no turn — its own row kind, and the cursor commits").

#### Scenario: Traffic received at notify level advances cursor without launching turn

- GIVEN the ladder entry for a project is configured with `level: "notify"`
- WHEN the doorbell returns `count: 2`, `senders: ["@alpha-one"]`, and `covered_through_seq: 42`
- THEN `WakeLoop.tick` MUST print a warning to stderr stating `level is notify, no turn started`
- AND it MUST append a `notify` row to `wake-ledger.jsonl`
- AND it MUST call `commitCursor(42)` on the daemon
- AND zero harness turns MUST be executed

---

### Requirement: Structural Bounds Enforcement and In-Flight Concurrency Control

Before launching a turn for an enabled `wake` or `autopilot` binding, the runner MUST evaluate three structural bounds in strict order:
1. **Single in-flight turn:** If a previous turn for this binding is currently running (`inFlight === true`), the wake MUST be refused with reason `"in_flight"`.
2. **Cooldown window:** If the time elapsed since the last accepted wake is less than `WAKE_COOLDOWN_MS` (10,000 ms), the wake MUST be refused with reason `"cooldown"`.
3. **Rolling budget window:** If the number of accepted wakes within the rolling window `WAKE_BUDGET_WINDOW_MS` (3,600,000 ms) is greater than or equal to `WAKE_BUDGET_PER_WINDOW` (20), the wake MUST be refused with reason `"budget_exhausted"`.

Upon any bound failure, the runner MUST:
- Refuse the turn and return tick outcome `"refused"`.
- Append a `refused` row to `wake-ledger.jsonl`, debounced by `REFUSAL_REPEAT_MS` (60,000 ms).
- Leave the watermark and daemon cursor unchanged, ensuring the pending message will be retried once the bound clears.

Pinned by: `test/runner/loop.test.ts` ("loop: a second message inside the cooldown is refused with a counted reason and does NOT advance the cursor", "loop: past the cooldown the held message wakes — the pending work is not lost", "loop: the per-window budget refuses after its count, with its own reason", "loop: the budget window slides — an old wake no longer counts against it", "loop: a turn already in flight refuses a second wake with in_flight"), PT-36.

#### Scenario: In-flight turn prevents concurrent execution for same binding

- GIVEN a turn is currently executing for project `telegram-bus-agent`
- WHEN a subsequent doorbell summary arrives before the first turn terminates
- THEN `WakeLoop.tick` MUST refuse execution with reason `"in_flight"`
- AND it MUST NOT spawn a second process
- AND the pending message sequence MUST NOT be committed

#### Scenario: Cooldown window holds message without dropping

- GIVEN a turn completed at timestamp $T$
- WHEN new traffic arrives at timestamp $T + 1,000\text{ ms}$ ($< \text{WAKE\_COOLDOWN\_MS}$)
- THEN `WakeLoop.tick` MUST return `"refused"` with reason `"cooldown"`
- AND the cursor MUST NOT advance
- WHEN the clock advances past $T + 10,000\text{ ms}$
- THEN the subsequent tick MUST accept the wake and launch the turn

#### Scenario: Hourly budget exhaustion caps autonomous turns

- GIVEN 20 turns have completed for a binding within the preceding 60 minutes
- WHEN another doorbell message arrives
- THEN `WakeLoop.tick` MUST return `"refused"` with reason `"budget_exhausted"`
- AND no process MUST be spawned
- AND the message MUST remain pending in the inbox

---

### Requirement: Commit-Last Cursor Advancement Strictly on Successful Exit

When a turn is launched via `runTurn`:
1. If the turn outcome is `kind: "exited"` (clean process termination, regardless of exit code):
   - The runner MUST call `DaemonLink.commitCursor(covered_through_seq)`.
   - The runner MUST advance the local watermark in `watermark.json`.
2. If the turn outcome is `kind: "timed_out"`, `kind: "aborted"`, or `kind: "unavailable"`:
   - The runner MUST NOT commit the cursor to the daemon.
   - The runner MUST NOT advance the local watermark in `watermark.json`.
   - The un-covered message MUST remain pending to be retried on a subsequent tick (bounded by the hourly budget).
3. In all cases, a `wake` row MUST be appended to `wake-ledger.jsonl` recording `harness` and `outcome.kind`.

Pinned by: `test/runner/loop.test.ts` ("loop: `wake` starts exactly one turn, records exactly one accepted wake, then commits last", "loop: an unavailable harness is recorded as a wake whose turn failed, and the message stays pending", "loop: a turn that timed out or was aborted does not cover the message").

#### Scenario: Cursor commits only after harness process exits

- GIVEN doorbell summary with sequence `42` triggers a turn for harness `pi`
- WHEN the harness process exits with code `0`
- THEN `WakeLoop.tick` MUST call `DaemonLink.commitCursor(42)`
- AND it MUST persist watermark `42` in `watermark.json`
- AND it MUST record a `wake` row with `outcome: "exited"`

#### Scenario: Timed-out turn leaves message pending for retry

- GIVEN a turn exceeds `WAKE_TURN_TIMEOUT_MS` and terminates with outcome `timed_out`
- WHEN `WakeLoop.tick` processes the outcome
- THEN it MUST record a `wake` row with `outcome: "timed_out"`
- AND it MUST NOT call `DaemonLink.commitCursor`
- AND the message sequence MUST remain pending for subsequent wakes

---

### Requirement: Bounded Graceful Shutdown

The satellite process MUST support clean shutdown triggered by `SIGINT`, `SIGTERM`, or completion of `--once`. Upon receiving a termination signal, the runner MUST:
1. Signal the abort controller to interrupt the in-flight turn and doorbell poll.
2. Send `SIGTERM` to any running harness child process, escalating to `SIGKILL` after `WAKE_KILL_GRACE_MS` (5,000 ms) if it does not exit.
3. Delete the daemon IPC session via `DaemonLink.close()`.
4. Bound the overall shutdown wait by `RUNNER_SHUTDOWN_TIMEOUT_MS` (5,000 ms).
5. Flush diagnostic buffers and exit the process.

Pinned by: `runner/main.ts`, `runner/harness.ts`, `test/runner/harness.test.ts` ("harness: an abort kills the turn and reports aborted", "harness: an abort whose child ignores SIGTERM is SIGKILLed after the grace period").

#### Scenario: SIGINT terminates runner and in-flight harness gracefully

- GIVEN `conmuta-runner run` is executing with an active turn child process
- WHEN `SIGINT` is received by the runner process
- THEN it MUST signal `SIGTERM` to the child harness
- AND it MUST close the daemon IPC link
- AND if the harness fails to exit within 5,000 ms, it MUST send `SIGKILL`
- AND the runner process MUST exit cleanly
