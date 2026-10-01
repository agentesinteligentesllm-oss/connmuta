# Design: Wake satellite — bounded, per-binding autonomous harness execution (F7a)

**Retrospective artifact notice.** This design documents functionality that was designed, implemented,
tested, audited under Judgment Day debate `bus-v2-b104-wake-satellite-001`, and merged in session 59
(2026-09-30) as phase F7a slice 1. It satisfies the SDD artifact requirement for F7a (backlog **B-105**) so
that F7a shares the exact archival record every prior phase (F1–F5) possesses. It proposes no new code,
invents no new scope, and describes no refactors; it documents the architecture and delivered code as
shipped in `runner/` (10 files), `test/runner/` (8 files), and `test/security/runner-bundle.test.ts`.

**Authority and decision basis.** Authorized by the Director under backlog item **B-104**
(`docs/02-architecture/RFC-DESPERTADOR-TRIGGER-AUTOMATICO.md`), formulated in
[`docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md`](../../docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md),
audited under Judgment Day (`jd-judge-a`, `jd-judge-b`, plus independent verification), enacted via amendment to
[`docs/01-constitution/CONSTITUTION.md` §3.1](../../docs/01-constitution/CONSTITUTION.md), and superseding in part
(the phase-target sentence only) [ADR-0006](../../docs/03-adr/0006-autonomy-boundary.md) and
[ADR-0029](../../docs/03-adr/0029-per-user-daemon-and-thin-clients.md).

---

## 1. Technical Approach

The wake satellite (`conmuta-runner`, built from `runner/` into `dist/runner/main.js`) is an autonomous,
machine-local process that bridges bus traffic to headless agent harnesses. It consumes the core daemon's
existing, body-less `/channel/*` doorbell family (`POST /channel/doorbell`, `POST /channel/cursor`) over
authenticated loopback IPC, evaluates a machine-local, fail-closed ladder policy
(`~/.conmuta/runner/ladder.json`), enforces three structural bounds (single in-flight turn, cooldown, and
rolling hourly budget), and launches a single headless turn via a strictly confined spawn boundary
(`runner/harness.ts`'s `runTurn`).

The core daemon remains completely passive: it contains zero execution paths, zero timers that emit, no
knowledge that the satellite exists, and no new routes or wire modifications.

### Discoveries that shape the design

1. **The detection half was already shipped in F4:** The daemon's `/channel/doorbell` endpoint already
   aggregates roster-verified, relevant inbox rows (`via === "direct" || type === "BROADCAST" || to === agentId`)
   into a body-less, closed-key-set summary. The satellite reuses this route directly; no `/events/*` family or
   IPC schema changes are required.
2. **Session catch-up seeds require independent watermark persistence:** The daemon's `client_cursors` row is
   keyed by session ID and seeded at `SESSION_CATCHUP_HOURS` (`src/ledger/cursors.ts`'s `ensureClientCursor`).
   Because every runner startup mints a new IPC session, trusting the daemon's cursor alone would re-wake the
   entire catch-up window on every process restart. The satellite must hold its own persistent, machine-local
   watermark (`runner/watermark.ts`) to resume monotonically across restarts.
3. **Double ladder resolution prevents race-to-wake on kill switch:** A long-poll wait on `/channel/doorbell`
   can block up to `FETCH_LONGPOLL_MAX_SECONDS` (50 s). If an operator disables the ladder while the long-poll
   is awaiting traffic, resolving the ladder only once at tick entry would wake the harness on traffic arrival.
   `runner/loop.ts` must resolve the ladder a second time immediately after the doorbell returns traffic,
   honoring immediate deactivation.
4. **Shell metacharacters are neutralized by `shell: false` and literal argv:** Passing the prompt as the
   LAST element of `argv` under `shell: false` guarantees that peer-controlled thread IDs and agent names
   remain inert string data. The prompt text never undergoes shell expansion or splitting.
5. **Windows `.cmd` shims fail closed without shell wrapping:** On Windows, npm installs harness CLIs (`pi`,
   `claude`, etc.) as batch shims (`.cmd`). Spawning them directly with `shell: false` fails with `EINVAL`. The
   runner refuses shell fallback, catches the spawn error, logs `unavailable` in the ledger, and leaves the
   message pending. The operator must provide a compiled binary launcher (e.g. Go wrapper) on the runner's
   private `PATH`.

---

## 2. Architecture Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|---|
| **D1** | **Satellite packaging and delivery** | Third `bin` in same package (`conmuta-runner`), built from `runner/` to `dist/runner/main.js`, packed by existing `files` whitelist | Separate npm package (`@conmuta/runner`); separate repository | ADR-0032 initially considered a separate package outside the whitelist. Delivering as a third `bin` simplifies distribution and tooling while `test/security/runner-bundle.test.ts` (PT-34) statically proves that no core closure reaches `dist/runner/`. Isolation is enforced by closure assertion rather than repository fragmentation. |
| **D2** | **Constant placement and bundle isolation** | Dedicated `runner/constants.ts`, completely separate from `src/shared/constants.ts` | Adding wake thresholds to `src/shared/constants.ts` | `src/shared/constants.ts` belongs to the core bundle. The core must contain no wake concept or execution threshold (ADR-0032 R2, PT-34). Placing constants in `runner/constants.ts` preserves strict closure isolation and prevents wake concepts from leaking into core bundles. |
| **D3** | **Ladder storage and machine-locality** | Machine-local JSON file at `~/.conmuta/runner/ladder.json`, failing closed to `off` | Committing ladder configuration inside `conmuta.json` (RFC §4.1) | `conmuta.json` is a committed, repository-tracked file read by strangers and shared across clones (landing decision D5, PT-35). Execution policy is machine-local and operator-authorized. Placing it under `~/.conmuta/runner/` prevents silent cross-machine privilege drift (T25). It fails closed to `off` on missing, corrupt, or unsigned records. |
| **D4** | **Ladder management CLI boundary** | Dedicated CLI verb `conmuta-runner ladder set\|get\|disable`, never inside `conmuta` CLI | Adding `conmuta ladder` subcommands to the core CLI | A wake verb inside the core `conmuta` CLI would introduce ladder schemas, file paths, and wake concepts into the core's built closure (`dist/src/cli/main.js`), violating PT-34. Ladder management is strictly contained within the runner binary. |
| **D5** | **Independent persistent watermark** | Dedicated persistent watermark at `~/.conmuta/runner/watermark.json` (`runner/watermark.ts`), separate from daemon cursor | Relying solely on daemon's `client_cursors` table; in-memory watermark only | The daemon seeds new sessions at `SESSION_CATCHUP_HOURS` (`src/ledger/cursors.ts`). Relying on the daemon cursor would cause every runner restart to re-wake all messages from the catch-up window. `runner/watermark.ts` MUST NOT be simplified away: it guarantees monotonic resume across restarts. |
| **D6** | **Body-less trigger path** | Trigger signal carries zero prose; consumes existing `/channel/doorbell` endpoint; prompt constructed from identifiers only | Passing message bodies or text snippets in the wake trigger payload | Passing peer text in the trigger introduces prompt injection into process execution parameters (T24). Consuming body-less summaries ensures bodies enter the agent turn only through the thin client's `fetch`, inside the turn, fenced and origin-labelled as `<UNTRUSTED-PEER-INPUT>`. |
| **D7** | **Confined spawn boundary and shell refusal** | Single spawn site (`runner/harness.ts`'s `runTurn`), closed executable set (`pi`, `claude`, `codex`, `opencode`), literal argv with prompt last, `shell: false`, allow-listed env, project `cwd`, 3-shape argument refusal | Shell execution (`shell: true`); arbitrary binaries; falling back to `cmd.exe /c` for Windows `.cmd` shims | Shell invocation is the primary vector for command injection and privilege escalation (T24). Enforcing `shell: false` makes peer-supplied IDs inert argv strings. Windows batch shims are refused as `unavailable` rather than wrapped in a shell. |
| **D8** | **Append-only self-reported wake ledger** | Machine-local JSONL file at `~/.conmuta/runner/wake-ledger.jsonl` with 4 closed row kinds (`wake`, `refused`, `notify`, `ladder`) | Writing wake events to daemon's SQLite `audit_log`; daemon-attested wake table | The daemon contains no wake tracking tables and no out-of-core write routes (ADR-0032 R6a). The wake ledger is self-reported by the satellite. The inability of the daemon to corroborate wakes is documented as an accepted residual risk. |
| **D9** | **Realized boundary for `autopilot`** | Enforced bounds: spawner constraints, closed binary set, allow-listed env, project `cwd`, bounded turn (10 min). Instructed bounds: prompt profile and harness configuration | Static bundle assertion forbidding git commands or settings writes in harness child | The runner invokes a harness binary, not git or IDE settings directly (PT-37 correction). Enforceable limits live at the process spawn boundary. Behavioral limits (no git push, no settings modifications, no secret reads) are carried by prompt instructions and enforced by the operator's harness permission configuration. |

---

## 3. Data Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              STARTUP & BINDING RESOLUTION                              │
│ conmuta-runner run --project <id> [--cwd <dir>] [--home <dir>]                         │
│   ├── runner/cli.ts (parseRunnerArgs) -> RunLoopRequest                                │
│   └── runner/main.ts (runLoop):                                                        │
│         ├── resolveProjectBinding: walk-up to nearest conmuta.json                     │
│         │     └── Verify project_id matches requested --project (PT-34, exit on error) │
│         └── createDaemonLink: loopback IPC handshake (GET /identity -> POST /session)  │
│               └── Session registered with host = "conmuta-runner" (ephemeral bearer)   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    WAKE LOOP CYCLE                                     │
│ runner/loop.ts (WakeLoop.tick)                                                         │
│                                                                                        │
│ 1. Resolve Ladder (Pre-poll):                                                          │
│    readLadderFile(ladderPath) -> resolveLadder(projectId)                              │
│      ├── Missing / Malformed / by="" / Level "off"                                     │
│      │     └── Debounced refusal log (REFUSAL_REPEAT_MS) -> Sleep LADDER_POLL_MS (5s)   │
│      └── Armed ("notify" | "wake" | "autopilot")                                       │
│                                                                                        │
│ 2. Watermark Load & Doorbell Poll:                                                     │
│    readWatermarkFor(projectId) ?? await link.commitCursor() (Seed on first run)        │
│    link.readDoorbell(watermark, longPollSeconds, signal) [Clamped up to 50s]          │
│      ├── Error / Link Down -> warn, return "link_failed", sleep LADDER_POLL_MS         │
│      └── DoorbellResponse { count, senders, types, threads, covered_through_seq }      │
│            ├── count === 0 (Silent tick):                                              │
│            │     ├── advanceTo(covered_through_seq) -> writeWatermark(local only)      │
│            │     └── return "silent" (NO daemon cursor commit; poll again immediately) │
│            └── count > 0 (Bus traffic arrived)                                         │
│                                                                                        │
│ 3. Re-read Ladder (Post-poll kill switch check):                                       │
│    resolveLadder(projectId) -> if now "off", abort wake, return "idle"                │
│                                                                                        │
│ 4. Route by Capability Level:                                                          │
│    ├── Level === "notify":                                                             │
│    │     ├── Output stderr notice to human operator                                    │
│    │     ├── appendLedgerRow("notify", trigger)                                        │
│    │     ├── await link.commitCursor(covered_through_seq) & writeWatermark(local)      │
│    │     └── return "notified" (NO process spawned)                                    │
│    └── Level === "wake" | "autopilot":                                                 │
│          ├── Evaluate Structural Bounds:                                               │
│          │     ├── inFlight === true            -> refuse("in_flight")                 │
│          │     ├── elapsed < WAKE_COOLDOWN_MS   -> refuse("cooldown")                  │
│          │     └── window_wakes >= BUDGET (20)  -> refuse("budget_exhausted")          │
│          │     └── On refusal: appendLedgerRow("refused"), watermark UNCHANGED, return │
│          │                                                                             │
│          ├── Build Body-less Prompt & Spec:                                            │
│          │     ├── buildWakePrompt: identifiers, instructions, profile, fetch fence    │
│          │     └── resolveHarnessSpec: binary in HARNESS_NAMES, check REFUSED_ARGS     │
│          │           └── Refusal ("harness_unknown" | "arguments_refused") -> return   │
│          │                                                                             │
│          └── Execute Turn (runner/harness.ts: runTurn):                                │
│                ├── inFlight = true, spawn child (shell: false, confinedEnv, project cwd)│
│                ├── Stream & cap diagnostics (MAX_TURN_OUTPUT_CHARS = 8,000)            │
│                ├── Wait up to WAKE_TURN_TIMEOUT_MS (10 min)                            │
│                │     └── On timeout: SIGTERM -> grace (5s) -> SIGKILL                  │
│                ├── inFlight = false, wakes.push(now), clear lastRefusal                │
│                ├── appendLedgerRow("wake", trigger, harness, outcome)                  │
│                └── Cursor Advancement:                                                 │
│                      ├── outcome === "exited":                                         │
│                      │     ├── await link.commitCursor(covered_through_seq)            │
│                      │     └── writeWatermark(covered_through_seq)                     │
│                      └── outcome !== "exited" ("timed_out"|"aborted"|"unavailable"):   │
│                            └── Cursor & watermark UNMOVED (message stays pending)     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Component and Process Plane View

The system architecture cleanly separates responsibilities across three distinct process boundaries. The core
daemon is entirely unaware of the satellite, maintaining zero execution or tracking hooks for it.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ OS PROCESS 1: CORE DAEMON (conmuta daemon)                                     │
│                                                                                │
│ - SQLite Ledger (~/.conmuta/ledger.db): inbox, client_cursors, audit_log       │
│ - Telegram Poller: sole consumer of getUpdates per bot token                   │
│ - IPC Server (127.0.0.1, random port): authenticates sessions via bearer token │
│ - Doorbell Endpoint (/channel/doorbell): evaluates roster & addressee, emits   │
│   body-less summaries (count, senders, types, threads, covered_through_seq)    │
│ - Cursor Endpoint (/channel/cursor): updates client_cursors monotonically      │
│                                                                                │
│ * Invariants: Zero child_process imports, zero timers that emit, zero exec.    │
│ * Awareness: Oblivious to satellite; treats conmuta-runner as any other client.│
└───────────────────────────────────────▲────────────────────────────────────────┘
                                        │
                                        │ Loopback IPC (Bearer Authenticated)
                                        │
┌───────────────────────────────────────┴────────────────────────────────────────┐
│ OS PROCESS 2: WAKE SATELLITE (conmuta-runner)                                  │
│                                                                                │
│ - Process Lifecycle: runner/main.ts, runner/cli.ts                             │
│ - Policy Store: ~/.conmuta/runner/ladder.json (Fails closed to off)            │
│ - Audit Ledger: ~/.conmuta/runner/wake-ledger.jsonl (Append-only, self-reported)│
│ - State Watermark: ~/.conmuta/runner/watermark.json (Monotonic resume point)   │
│ - Loop Orchestrator: runner/loop.ts (Pacing, bounds enforcement, kill switch)  │
│ - Prompt Builder: runner/prompt.ts (Body-less identifiers, profile framing)    │
│ - Spawner: runner/harness.ts (Single spawn site, shell: false, confined env)   │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │
                                        │ Spawns child process (shell: false)
                                        │
┌───────────────────────────────────────▼────────────────────────────────────────┐
│ OS PROCESS 3: HEADLESS AGENT TURN (pi / claude / codex / opencode)             │
│                                                                                │
│ - Invocation: <bin> [default-args] [ladder-args] "<body-less prompt>"          │
│ - Working Directory: Project root worktree                                     │
│ - Environment: Confined to HARNESS_ENV_ALLOW_LIST                              │
│ - Tool Execution: Connects to local conmuta MCP thin client via stdio          │
│ - Inbox Fetch: Calls conmuta_fetch to receive fenced peer message bodies       │
│ - Response: Evaluates peer data and replies via conmuta_send or emits ACK      │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. File Changes

| File | Action | Description |
|---|---|---|
| `runner/constants.ts` | Create | Named constants and explicit architectural reasoning (`WAKE_COOLDOWN_MS`, `WAKE_BUDGET_WINDOW_MS`, `WAKE_BUDGET_PER_WINDOW`, `LADDER_POLL_MS`, `WAKE_TURN_TIMEOUT_MS`, `WAKE_KILL_GRACE_MS`, `REFUSAL_REPEAT_MS`, `LADDER_SCHEMA_VERSION`, `LADDER_LEVELS`, `HARNESS_NAMES`, `HARNESS_DEFAULT_ARGS`, `REFUSED_ARGUMENTS`, `HARNESS_ENV_ALLOW_LIST`, `MAX_WAKE_PROMPT_CHARS`, `MAX_TURN_OUTPUT_CHARS`, `RUNNER_NAME`, `RUNNER_SHUTDOWN_TIMEOUT_MS`). |
| `runner/ladder.ts` | Create | Machine-local ladder policy store (`~/.conmuta/runner/ladder.json`). Implements schema validation, fail-closed resolution (`resolveLadder`), mandatory `--by` operator signature validation, atomic updates (`writeLadderEntry`), and removal (`removeLadderEntry`). |
| `runner/ledger.ts` | Create | Append-only JSONL wake ledger (`~/.conmuta/runner/wake-ledger.jsonl`). Implements row constructors (`wakeRow`, `refusedRow`, `notifyRow`, `ladderRow`), directory creation (`0o700`), file write modes (`0o600`), and resilient read parser (`readLedgerRows`) that skips torn crash lines. |
| `runner/watermark.ts` | Create | Per-binding persistent watermark store (`~/.conmuta/runner/watermark.json`). Manages monotonic resume sequence numbers (`readWatermarkFor`, `writeWatermark`), preventing repeat processing of catch-up windows across process restarts. |
| `runner/prompt.ts` | Create | Body-less wake prompt generator (`buildWakePrompt`). Assembles structured prompt from doorbell summary metadata (count, senders, types, threads), frames peer content as untrusted data, and embeds profile boundaries (`wake` vs `autopilot`). Enforces `MAX_WAKE_PROMPT_CHARS`. |
| `runner/harness.ts` | Create | Confined process spawner. Sole spawn site in the product (`runTurn`). Enforces closed executable set (`HARNESS_NAMES`), 3-shape argument blocklist (`isRefusedArgument`, `resolveHarnessSpec`), `shell: false`, environment filtering (`confinedEnv`), output streaming cap (`MAX_TURN_OUTPUT_CHARS`), execution timeout, and Windows `.cmd` refusal without shell fallback. |
| `runner/loop.ts` | Create | Core wake orchestrator (`WakeLoop`). Manages pacing (`run`, `tick`), pre-poll ladder check, doorbell long-polling, post-poll kill switch re-read, structural bounds evaluation (in-flight, cooldown, budget), debounced refusal tracking (`shouldRecord`), and commit-last cursor semantics. |
| `runner/cli.ts` | Create | Command-line interface parser and dispatcher (`parseRunnerArgs`, `runCli`). Supports `run`, `ladder get`, `ladder set`, and `ladder disable`. Enforces strict option validation, usage errors (`EXIT_USAGE`), and audit ledger logging for ladder changes. |
| `runner/main.ts` | Create | Executable bin entry point for `conmuta-runner`. Performs project file walk-up (`resolveProjectBinding`), daemon link establishment (`createDaemonLink`), process lifecycle management, signal handling (`SIGINT`, `SIGTERM`), and shutdown timeout racing. |
| `runner/tsconfig.json` | Create | Composite TypeScript configuration referencing `../src/shared`, `../src/client`, and `../channel`. Emits to `dist/runner/`. |
| `package.json` | Modify | Registered third binary entry `"conmuta-runner": "dist/runner/main.js"` in `bin`. |
| `test/security/runner-bundle.test.ts` | Create | Pinning test suite PT-34: verifies core closures contain zero references to `runner/`, runner does not link `src/ledger/*` or `node:sqlite`, sole spawner site is `runner/harness.js`, and bare-specifier surface conforms to reviewed allow-list. |
| `test/runner/ladder.test.ts` | Create | Unit test suite for ladder resolution, fail-closed handling, schema validation, and committed project file exclusion (PT-35). |
| `test/runner/ledger.test.ts` | Create | Unit test suite for JSONL ledger formatting, append-only order, schema conformance, zero-body assertions, and torn-line tolerance (PT-36). |
| `test/runner/watermark.test.ts` | Create | Unit test suite for persistent watermark loading, monotonic advances, atomic file writes, and corrupt file handling. |
| `test/runner/prompt.test.ts` | Create | Unit test suite for body-less prompt construction, profile inclusion, identifier formatting, and length ceiling bounds (PT-38). |
| `test/runner/harness.test.ts` | Create | Unit test suite for spawner confinement, closed binaries, 3-shape argument refusal, allow-listed env, literal argv, and Windows `.cmd` refusal (PT-37). |
| `test/runner/loop.test.ts` | Create | Integration test suite for the wake loop: idle pacing, quiet doorbell handling, cooldown enforcement, budget exhaustion, in-flight blocking, post-poll kill switch, and commit-last cursor behavior. |
| `test/runner/cli.test.ts` | Create | Unit test suite for CLI option parsing, usage formatting, mandatory `--by` enforcement, and ladder command execution. |
| `test/runner/main.test.ts` | Create | Integration test suite for binary startup, binding walk-up validation, exit codes, and one-tick execution. |
| `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md` | Create | Architectural decision record defining satellite architecture, bounds, ladder levels, and apply-time refinements. |
| `docs/01-constitution/CONSTITUTION.md` | Modify | Amends §3.1 adding Component Class (c) and the wake ladder doctrine. |
| `docs/02-architecture/THREAT-MODEL.md` | Modify | Incorporates threat rows T23, T24, T25 and security pinning tests PT-34 through PT-38. |
| `docs/runbooks/wake-satellite.md` | Create | Comprehensive operator manual for ladder configuration, service setup, troubleshooting, and run-once verification. |

---

## 6. Interfaces, Contracts & Schemas

### Constants & Configuration (`runner/constants.ts`)

```ts
export const WAKE_COOLDOWN_MS = 10_000;
export const WAKE_BUDGET_WINDOW_MS = 60 * 60 * 1000;
export const WAKE_BUDGET_PER_WINDOW = 20;
export const LADDER_POLL_MS = 5_000;
export const WAKE_TURN_TIMEOUT_MS = 10 * 60 * 1000;
export const WAKE_KILL_GRACE_MS = 5_000;
export const MILLISECONDS_PER_SECOND = 1000;
export const REFUSAL_REPEAT_MS = 60_000;
export const LADDER_SCHEMA_VERSION = 1;
export const LADDER_LEVELS = ["off", "notify", "wake", "autopilot"] as const;
export const HARNESS_NAMES = ["pi", "claude", "codex", "opencode"] as const;

export type HarnessName = (typeof HARNESS_NAMES)[number];

export const HARNESS_DEFAULT_ARGS: Readonly<Record<HarnessName, readonly string[]>> = {
  pi: ["-p"],
  claude: ["-p"],
  codex: ["exec"],
  opencode: ["run"],
};

export const REFUSED_ARGUMENTS = [
  "-c",
  "--command",
  "-eval",
  "eval",
  "-exec",
  "--dangerously-skip-permissions",
  "--dangerously-bypass-approvals-and-sandbox",
] as const;

export const HARNESS_ENV_ALLOW_LIST = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "ComSpec",
  "HOME",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
] as const;

export const MAX_WAKE_PROMPT_CHARS = 2_000;
export const MAX_TURN_OUTPUT_CHARS = 8_000;
export const RUNNER_NAME = "conmuta-runner";
export const RUNNER_SHUTDOWN_TIMEOUT_MS = 5_000;
```

### Ladder Storage & Resolution (`runner/ladder.ts`)

```ts
export type LadderLevel = (typeof LADDER_LEVELS)[number];

export interface LadderEntry {
  readonly level: LadderLevel;
  readonly harness: string;
  readonly harness_args?: readonly string[];
  readonly by: string;
  readonly at: string;
}

export type LadderOffReason =
  | "no_record"
  | "level_off"
  | "unreadable"
  | "malformed"
  | "unknown_level"
  | "unknown_harness";

export type LadderResolution =
  | { readonly kind: "entry"; readonly entry: LadderEntry }
  | { readonly kind: "off"; readonly reason: LadderOffReason };

export interface LadderRead {
  readonly bindings: ReadonlyMap<string, unknown>;
  readonly problem: "missing" | "unreadable" | "malformed" | null;
}

export function ladderPathFor(homeDir: string): string;
export function readLadderFile(path: string): LadderRead;
export function resolveLadder(read: LadderRead, projectId: string): LadderResolution;
export function writeLadderEntry(path: string, projectId: string, entry: LadderEntry): void;
export function removeLadderEntry(path: string, projectId: string, by: string): boolean;
```

### Append-Only Wake Ledger (`runner/ledger.ts`)

```ts
export type LedgerKind = "wake" | "refused" | "notify" | "ladder";

export interface LedgerTrigger {
  readonly count: number;
  readonly senders: readonly string[];
  readonly types: readonly string[];
  readonly threads: readonly string[];
}

export interface LedgerRow {
  readonly ts: string;
  readonly kind: LedgerKind;
  readonly project_id: string;
  readonly level: LadderLevel;
  readonly trigger?: LedgerTrigger;
  readonly reason?: string;
  readonly harness?: string;
  readonly outcome?: string;
  readonly note?: string;
}

export interface RowContext {
  readonly ts: string;
  readonly project_id: string;
  readonly level: LadderLevel;
}

export function wakeLedgerPathFor(homeDir: string): string;
export function wakeRow(ctx: RowContext, trigger: LedgerTrigger, harness: string, outcome: string): LedgerRow;
export function refusedRow(ctx: RowContext, reason: string): LedgerRow;
export function notifyRow(ctx: RowContext, trigger: LedgerTrigger): LedgerRow;
export function ladderRow(ctx: RowContext, note: string): LedgerRow;
export function appendLedgerRow(path: string, row: LedgerRow): void;
export function readLedgerRows(path: string): LedgerRow[];
```

### Watermark Persistence (`runner/watermark.ts`)

```ts
export interface WatermarkRead {
  readonly seqs: ReadonlyMap<string, number>;
  readonly problem: "missing" | "unreadable" | "malformed" | null;
}

export function watermarkPathFor(homeDir: string): string;
export function readWatermark(path: string): WatermarkRead;
export function readWatermarkFor(path: string, projectId: string): number | undefined;
export function writeWatermark(path: string, projectId: string, seq: number): void;
```

### Spawner Boundary & Confinement (`runner/harness.ts`)

```ts
export interface HarnessSpec {
  readonly bin: HarnessName;
  readonly args: readonly string[];
  readonly argv: readonly string[];
}

export type HarnessRefusalReason = "harness_unknown" | "arguments_refused";

export type HarnessResolution =
  | { readonly kind: "spec"; readonly spec: HarnessSpec }
  | { readonly kind: "refused"; readonly reason: HarnessRefusalReason };

export function isRefusedArgument(arg: string): boolean;
export function resolveHarnessSpec(entry: LadderEntry, prompt: string): HarnessResolution;

export type TurnOutcome =
  | { readonly kind: "exited"; readonly code: number | null }
  | { readonly kind: "timed_out" }
  | { readonly kind: "aborted" }
  | { readonly kind: "unavailable"; readonly detail: string };

export interface RunTurnInput {
  readonly spec: HarnessSpec;
  readonly cwd: string;
  readonly signal?: AbortSignal;
}

export interface RunTurnDeps {
  readonly spawnImpl?: SpawnImpl;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly killGraceMs?: number;
  readonly onOutput?: (chunk: string) => void;
}

export function confinedEnv(source: NodeJS.ProcessEnv): Record<string, string>;
export function runTurn(deps: RunTurnDeps, input: RunTurnInput): Promise<TurnOutcome>;
```

### Orchestration Loop (`runner/loop.ts`)

```ts
export type TickOutcome = "idle" | "silent" | "notified" | "woke" | "refused" | "link_failed";
export type RefusalReason = "in_flight" | "cooldown" | "budget_exhausted" | "harness_unknown" | "arguments_refused";

export interface WakeLoopDeps {
  readonly projectId: string;
  readonly cwd: string;
  readonly ladderPath: string;
  readonly ledgerPath: string;
  readonly watermarkPath: string;
  readonly link: Pick<DaemonLink, "readDoorbell" | "commitCursor">;
  readonly runTurn: (input: { readonly spec: HarnessSpec; readonly cwd: string; readonly signal: AbortSignal }) => Promise<TurnOutcome>;
  readonly now?: () => number;
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly warn?: (message: string) => void;
  readonly cooldownMs?: number;
  readonly budgetWindowMs?: number;
  readonly budgetPerWindow?: number;
  readonly refusalRepeatMs?: number;
  readonly longPollSeconds?: number;
}

export class WakeLoop {
  constructor(deps: WakeLoopDeps);
  run(signal: AbortSignal): Promise<void>;
  tick(signal: AbortSignal): Promise<TickOutcome>;
}
```

---

## 7. Threat-Model Realization & Security Pinning

The implementation directly mitigates threats T23, T24, and T25 added to `docs/02-architecture/THREAT-MODEL.md`
under ADR-0032. Every guarantee is structurally pinned by test assertions:

### T23: Wake storm & cost amplification
- **Threat Vector:** A malicious or ping-ponging peer floods the supergroup with messages, attempting to
  exhaust developer machine resources (CPU, processes) and amplify LLM API token spend.
- **Realized Mitigation:**
  1. Default `off` policy requiring explicit opt-in (PT-35).
  2. Strict per-binding cooldown of `WAKE_COOLDOWN_MS` (10 s) preventing consecutive turns from back-to-back messages (PT-36).
  3. Rolling window budget of `WAKE_BUDGET_PER_WINDOW` (20 turns per hour) enforcing an absolute upper bound on autonomous spend (PT-36).
  4. Single in-flight turn constraint (`inFlight` flag in `WakeLoop`) preventing process proliferation (PT-36).
  5. Debounced refusal logging (`REFUSAL_REPEAT_MS` = 60 s) preventing ledger disk exhaustion (PT-36).
  6. Immediate kill switch via `conmuta-runner ladder disable` taking effect within 5 seconds.
- **Pinning Tests:** PT-35 (`test/runner/ladder.test.ts`), PT-36 (`test/runner/loop.test.ts`, `test/runner/ledger.test.ts`).

### T24: Headless turn under injection — the realized trifecta
- **Threat Vector:** A peer sends prompt-injected text on the bus. When a turn is woken autonomously, there is
  no human operator present at the interactive prompt to inspect or reject tool execution.
- **Realized Mitigation:**
  1. Trigger path carries zero message text (`buildWakePrompt` receives only count, senders, types, and threads).
  2. Peer content enters the agent turn only through the existing thin client (`conmuta_fetch`), enclosed in
     an unforgeable `<UNTRUSTED-PEER-INPUT>` fence with origin labelling (PT-38).
  3. Single spawn site (`runner/harness.ts`) running strictly with `shell: false`, rendering shell metacharacters
     in thread IDs or agent names completely inert (PT-37).
  4. Closed binary allow-list (`pi`, `claude`, `codex`, `opencode`); shells, interpreters, and arbitrary paths
     are refused with `harness_unknown` (PT-37).
  5. 3-shape argument blocklist preventing `-c`, `--command`, `eval`, or bypass flags (PT-37).
  6. Confined environment (`HARNESS_ENV_ALLOW_LIST`) preventing leak of bot tokens, secret keys, or IDE env vars (PT-37).
  7. Turn execution timeout (`WAKE_TURN_TIMEOUT_MS` = 10 min) and output ceiling (`MAX_TURN_OUTPUT_CHARS` = 8,000) (PT-37).
  8. Windows `.cmd` batch shims fail closed as `unavailable` rather than being wrapped in `cmd.exe /c` (PT-37).
- **Pinning Tests:** PT-37 (`test/security/runner-bundle.test.ts`, `test/runner/harness.test.ts`), PT-38 (`test/runner/prompt.test.ts`, `test/runner/loop.test.ts`).

### T25: Silent opt-in drift
- **Threat Vector:** The runner activates autonomously without human authorization due to configuration defaults,
  repository checkouts, or settings sync across developer machines.
- **Realized Mitigation:**
  1. Ladder policy is stored exclusively in machine-local `~/.conmuta/runner/ladder.json` (PT-35).
  2. The committed project file `conmuta.json` rejects all `runner` or `ladder` keys (PT-35).
  3. Mandatory human attribution (`--by "<note>"`) is enforced on all writes (`writeLadderEntry`) and required
     on reads; unsigned entries fail closed to `off` (PT-35).
  4. Missing, corrupt, unreadable, or invalid files fail closed to `off` with explicit reasons (PT-35).
- **Pinning Tests:** PT-35 (`test/runner/ladder.test.ts`).

### Core Closure Freedom: PT-34
- **Guarantee:** Core built closures (`src/daemon/main.js`, `src/client/main.js`, `src/cli/main.js`,
  `channel/main.js`) contain zero references to `dist/runner/`. The runner communicates with the daemon
  strictly via loopback IPC, never linking `src/ledger/*`, `src/daemon/*`, or `node:sqlite`. Exactly one
  file in the runner references `child_process` (`runner/harness.js`).
- **Pinning Test:** `test/security/runner-bundle.test.ts`.

---

## 8. Constitutional Invariants & Wire Policy Statement

### Wire Policy
- **Emit `AGENTBUS/2`, accept `/1` and `/2`, no wire change.**
- The satellite introduces **zero modifications** to the wire protocol or Telegram Bot API payloads.
- The satellite introduces **zero new routes or parameter changes** to the IPC contract. It consumes the
  existing, body-less `/channel/doorbell` and `/channel/cursor` endpoints delivered in F4.

### Constitutional Invariants
- **Invariant 1 (Bijective Binding):** **Untouched.** The runner resolves the binding via `resolveProjectBinding`
  walking up to `conmuta.json` and verifies that the directory matches `--project`. Outbound sends remain
  governed by the thin client and daemon room guard.
- **Invariant 2 (Secrets Never Leave the Daemon):** **Untouched.** The runner holds no bot token, has no
  keychain access, reads no secret files, and receives only an ephemeral IPC session bearer token.
- **Invariant 3 (One Poller, Durable Inbox):** **Untouched.** The daemon remains the sole poller of Telegram.
  The runner does not poll Telegram and does not query SQLite directly. It advances its own session cursor
  (`host = "conmuta-runner"`) through standard IPC.
- **Invariant 4 (Numeric-ID Identity + Scope Check on Ingest):** **Untouched.** Ingest filtering remains
  strictly within the daemon poller. The runner receives summaries only for already-admitted, roster-verified messages.
- **Invariant 5 (Peer Content is Data, Never Action):** **Preserved.** The core daemon retains zero execution
  capability. The execution capability is isolated in `dist/runner/main.js`. CONSTITUTION §3.1 was amended
  under ADR-0032 to define Component Class (c) — the wake satellite — with its own constitution not weaker
  than Invariants 2, 4, and 5. ADR-0006 and ADR-0029 are superseded **only** in their phase-target sentence
  (`post-F6` → `F7a`); their core isolation rulings stand verbatim.

---

## 9. Rollback & Operational Recovery

1. **Immediate Operational Kill Switch:** Run `conmuta-runner ladder disable --project "<id>" --by "Emergency stop"`.
   The runner evaluates `ladder.json` on its next poll tick (within `LADDER_POLL_MS` = 5 s) and post-poll
   verification, immediately reverting to `off` and terminating turn initiation.
2. **Process Termination:** Terminate the `conmuta-runner` background service or process. In-flight turns are
   sent `SIGTERM`, escalating to `SIGKILL` after 5 seconds (`WAKE_KILL_GRACE_MS`).
3. **Binary Rollback:** Remove `"conmuta-runner"` from `package.json` `bin` field and delete `runner/` and
   `dist/runner/`. The core daemon continues operating unaffected.
4. **No Schema Rollback Required:** The satellite creates no SQLite tables, alters no database schemas, and
   writes no state into `~/.conmuta/ledger.db`. Its state is confined to machine-local JSON/JSONL files
   (`ladder.json`, `watermark.json`, `wake-ledger.jsonl`). Deleting those files leaves zero residual state.

---

## 10. Testing Strategy

The retrospective test suite covers 86 tests across 9 test files, with zero modifications to core tests:

| Test File | Target Module | Spec Guarantees & Scenarios Covered |
|---|---|---|
| `test/security/runner-bundle.test.ts` | Static closures | **PT-34:** Core closures do not import `runner/`; runner does not import `src/ledger/*`, `src/daemon/*`, or `node:sqlite`; sole `child_process` site is `runner/harness.js`; reviewed bare specifier surface; F4 channel adapter remains spawn-free. |
| `test/runner/ladder.test.ts` | `runner/ladder.ts` | **PT-35:** Missing file resolves to `no_record`; invalid JSON resolves to `malformed`; wrong schema version resolves to `malformed`; unknown level/harness fails closed; unsigned records (`by: ""`) fail closed; explicit `off` resolves to `level_off`; atomic writes and removals; `conmuta.json` rejects ladder keys. |
| `test/runner/ledger.test.ts` | `runner/ledger.ts` | **PT-36:** Ordered JSONL append; parent directory created with `0o700` and file with `0o600`; schema conformance of `wake`, `refused`, `notify`, `ladder` rows; strict exclusion of message bodies and secret tokens; non-fatal tolerance of torn/corrupt lines on read. |
| `test/runner/watermark.test.ts` | `runner/watermark.ts` | Monotonic persistence; unreadable/malformed file handling; atomic temp file rename writes; non-decreasing watermark invariant. |
| `test/runner/prompt.test.ts` | `runner/prompt.ts` | **PT-38:** Structured prompt assembly from identifiers; zero message body inclusion; framing peer content as untrusted input; profile instructions for `wake` and `autopilot`; ceiling enforcement (`MAX_WAKE_PROMPT_CHARS`). |
| `test/runner/harness.test.ts` | `runner/harness.ts` | **PT-37:** Closed executable set (`pi`, `claude`, `codex`, `opencode`); 3-shape argument refusal (exact, `--flag=val`, attached short form); `shell: false` execution; literal argv with prompt last; environment allow-listing (`confinedEnv`); turn timeout and `SIGKILL` escalation; output cap (`MAX_TURN_OUTPUT_CHARS`); Windows `.cmd` failure returning `unavailable` without shell fallback. |
| `test/runner/loop.test.ts` | `runner/loop.ts` | Full orchestration integration: idle pacing for `off` bindings; debounced refusal logging (`REFUSAL_REPEAT_MS`); silent ticks advancing local watermark without daemon commit; `notify` level handling; structural bounds (`in_flight`, `cooldown`, `budget_exhausted`); post-poll ladder re-read kill switch; commit-last cursor semantics (commit on `exited`, hold on failure). |
| `test/runner/cli.test.ts` | `runner/cli.ts` | CLI argument tokenization and parsing (`parseRunnerArgs`); strict refusal of unknown flags; mandatory `--by` enforcement on `set` and `disable`; usage output formatting; dispatcher execution (`runCli`). |
| `test/runner/main.test.ts` | `runner/main.ts` | Startup walk-up binding resolution (`resolveProjectBinding`); binding refusal exit codes (`EXIT_USAGE`, `EXIT_UNBOUND_PROJECT`); one-tick mode (`--once`); signal handling and graceful shutdown timeout. |
