/**
 * The wake satellite's own named constants (ADR-0032 R5–R7; CONSTITUTION §5: every numeric constant is a
 * named constant with its reasoning next to it).
 *
 * **Why these live here and not in `src/shared/constants.ts`.** That module is the CORE's constant table,
 * and the core must contain no wake concept at all (ADR-0032 R2, PT-34): its bundles are the subject of the
 * static assertions, so a wake constant in them would be the coupling those assertions exist to prevent.
 * ADR-0032 R5 defers the ladder's values to "the F7a spec"; this phase is being implemented under ODD with
 * no separate SDD spec, so the reasoning that would have lived in that spec's constants table lives beside
 * each value here instead — the same content, one file earlier. Disclosed in the phase's own runbook.
 */

/** A peer's two consecutive messages must not start two turns. Ten seconds is the floor a human needs to
 * read one message, and it is the value the Director's own RFC proposed (`cooldown_seconds: 10`). */
export const WAKE_COOLDOWN_MS = 10_000;

/** The budget window: one hour, the same period the group rate ceiling already reasons about. */
export const WAKE_BUDGET_WINDOW_MS = 60 * 60 * 1000;

/** At most twenty wakes per binding per window. Twenty turns an hour is already far more than a human can
 * read, and the cap is what turns a peer's storm into a bounded cost instead of an unbounded one. */
export const WAKE_BUDGET_PER_WINDOW = 20;

/** How often the ladder file is re-read while the runner is idle (`off`) or in `notify`. Enabling or
 * killing the satellite therefore takes effect within five seconds without the runner holding a session
 * against the daemon while nobody wants one. */
export const LADDER_POLL_MS = 5_000;

/** A headless turn that has not finished in ten minutes is stopped. Without this bound one hung harness
 * would hold the binding's single in-flight slot forever. */
export const WAKE_TURN_TIMEOUT_MS = 10 * 60 * 1000;

/** After the timeout, how long a harness gets to exit on `SIGTERM` before it is killed outright. */
export const WAKE_KILL_GRACE_MS = 5_000;

/** Milliseconds in a second, named so the conversions below cannot be read as magic numbers. */
export const MILLISECONDS_PER_SECOND = 1000;

/** At most one refusal row per binding per this interval. A bound that is still in force must be recorded
 * (R6: a refusal is a counted refusal, never a silent drop) but must not flood the ledger while the loop
 * keeps re-reading the same pending message. */
export const REFUSAL_REPEAT_MS = 60_000;

/** The ladder file's schema version. A record written by a future version is refused, not guessed at. */
export const LADDER_SCHEMA_VERSION = 1;

/** The ladder's four levels, in ascending capability order (R5): `off` (default), `notify` (tell the human,
 * start no turn), `wake` (one read/reply-only turn), `autopilot` (one turn in the confined act profile). */
export const LADDER_LEVELS = ["off", "notify", "wake", "autopilot"] as const;

/** The harnesses the satellite will ever execute (R2/R7: a closed set of executables; the ladder record
 * may choose among these names and may add arguments, never a different executable). */
export const HARNESS_NAMES = ["pi", "claude", "codex", "opencode"] as const;

export type HarnessName = (typeof HARNESS_NAMES)[number];

/**
 * The literal arguments each harness gets in front of the prompt, mirroring the Director's RFC
 * (`claude -p`, `codex exec`, `opencode run`, `pi -p`). The prompt is appended as the LAST argv element, so
 * no variable text is ever parsed by a shell: the process is started with `shell: false` (see
 * `runner/harness.ts`), which is what makes a peer-controlled thread id or agent name inert data.
 */
export const HARNESS_DEFAULT_ARGS: Readonly<Record<HarnessName, readonly string[]>> = {
  pi: ["-p"],
  claude: ["-p"],
  codex: ["exec"],
  opencode: ["run"],
};

/** Arguments refused outright in a ladder record's `harness_args`, whatever executable they would reach:
 * these are the shell and interpreter escape hatch that would defeat R2's closed-executable rule, and — added
 * 2026-10-05 — the tool-exposure flags that would widen or remove the send-proof profile `runner/harness.ts`
 * appends after them. `-e`/`--extension` loads arbitrary extension code into the turn, an interpreter-class
 * escape. */
export const REFUSED_ARGUMENTS = [
  "-c",
  "--command",
  "-eval",
  "eval",
  "-exec",
  "--dangerously-skip-permissions",
  "--dangerously-bypass-approvals-and-sandbox",
  "--tools",
  "-t",
  "--exclude-tools",
  "-xt",
  "--no-tools",
  "-nt",
  "--no-builtin-tools",
  "-nbt",
  "--no-extensions",
  "-ne",
  "--extension",
  "-e",
] as const;

/**
 * The **send-proof capability profile** a woken turn is started under, per harness (ADR-0032 R5/R7; the
 * Director's order of 2026-10-05: *no woken turn may send anything, directly or indirectly*). The runner
 * appends these arguments **after** the record's own `harness_args`, so nothing an operator records can
 * widen them, and {@link REFUSED_ARGUMENTS} refuses the flags that would try.
 *
 * `pi`, the harness every measured wake turn used, takes `--no-extensions --tools read,grep,find,ls`:
 *  - `--no-extensions` drops every extension, the built-in MCP extension included, so the turn has **no
 *    `conmuta_*` tool** even when the host enables the bus — which is exactly what supplied the four tools
 *    on 2026-10-04;
 *  - `--tools read,grep,find,ls` drops **`bash`**, so the turn can neither read the daemon's run-file
 *    secret nor speak the IPC, the two steps of the improvised send of 2026-10-04.
 *
 * `null` is deliberate and fail-closed everywhere else: the other three harnesses' own tool-restriction
 * flags have not been verified live (session 66 verified their argv *forms*, never a restriction flag), and
 * no `autopilot` turn has a profile at all because `autopilot` exists to run a shell and a shell can always
 * send. An undeclared profile means the runner **refuses to start the turn** (`profile_unavailable`) instead
 * of starting one with the harness's full toolset — the same direction R2 already takes for a shell-free
 * launch failure. Adding a verified profile is the one thing that re-enables a harness or the act level.
 */
export const SEND_PROOF_PROFILES: Readonly<Record<HarnessName, readonly string[] | null>> = {
  pi: ["--no-extensions", "--tools", "read,grep,find,ls"],
  claude: null,
  codex: null,
  opencode: null,
};

/** The environment a woken harness inherits. An allow-list, never a copy of the runner's own environment:
 * the satellite must not hand a woken turn the operator's tokens, keys or IDE variables (R7). */
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

/** Hard ceiling on the wake prompt's length. The prompt is built from placeholders and validated id
 * shapes, so this bound is a backstop against a future edit growing it into something the OS argv limit
 * could reject, not a limit any real summary reaches. */
export const MAX_WAKE_PROMPT_CHARS = 2_000;

/** How much of a turn's own stdout/stderr the runner forwards to its own stderr. A turn can print a lot;
 * the operator needs enough to see what happened, and neither the runner's memory nor its log file should
 * grow with a harness's verbosity. */
export const MAX_TURN_OUTPUT_CHARS = 8_000;

/** The bin's own name, used for the usage line, for diagnostics and as the `client_cursors.host` label this
 * runner's daemon session is recorded under. Named once so those three can never drift apart. */
export const RUNNER_NAME = "conmuta-runner";

/** Bound on the shutdown wait once an abort has been requested: the session is deleted and the loop is given
 * this long to come back before the process is told to stop. */
export const RUNNER_SHUTDOWN_TIMEOUT_MS = 5_000;
