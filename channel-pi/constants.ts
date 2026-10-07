/**
 * Bounds and identity for the Pi host adapter (`channel-pi/`, ADR-0036). Its own file, outside `src/`,
 * for the same reason `runner/constants.ts` is: nothing here may enter a core bundle's closure, so the
 * adapter's numbers are not reachable from the daemon, the thin client or the panel.
 */

/**
 * The daemon session's `host` label (`GET /identity`, `POST /session`), and the only place this adapter
 * names itself. It must differ from `RUNNER_NAME` (`conmuta-runner`) and `CHANNEL_HOST_LABEL`
 * (`claude-code-channel`) because the doorbell cursor row is keyed per client session: an operator
 * reading `doctor` or `status` has to be able to tell which consumer a cursor belongs to.
 */
export const PI_DOORBELL_HOST_LABEL = "pi-host-doorbell";

/**
 * The custom message type every ring carries. Load-bearing, not cosmetic: the host stores a custom
 * message as its own `custom_message` entry, so a ring is attributable in the transcript and is never
 * mistaken for something the human typed — which matters because this daemon deliberately cannot
 * accredit "a human is present" (B-113), and the transcript's shape is the only signal a reader has.
 */
export const PI_DOORBELL_CUSTOM_TYPE = "conmuta-doorbell";

/**
 * How long one ring suppresses the next, in milliseconds.
 *
 * A ring that arrives while the session is **already awake** from a previous ring is merged into the
 * next one instead of queueing another automatic turn: the session is attending to the bus at that
 * moment, and turning every announcement of a burst into its own model turn is cost without signal. No
 * row is lost by merging, because the doorbell cursor this suppresses is not the client cursor the
 * session fetches with — the session's own `fetch` still sees every row.
 *
 * Fifteen seconds is chosen to span the gap between a burst of peer messages and the first tool call of
 * the turn that first ring started; it is deliberately shorter than a human's attention span on the
 * reply, so the next message is never silently folded into an exchange the human has moved past.
 */
export const PI_RING_COOLDOWN_MS = 15_000;

/**
 * The ring budget's window, in milliseconds: one hour.
 *
 * Deliberately the same period as the wake satellite's `WAKE_BUDGET_WINDOW_MS` (`runner/constants.ts`). The
 * two bounds count the same thing — one model turn — and a window long enough to be an hour is what makes the
 * cap a cost bound rather than a burst dampener: a peer storm that lasts minutes is a different problem from a
 * group that is busy all afternoon (`PI_RING_BUDGET_PER_WINDOW` is the cap; this is the period it is measured
 * over).
 */
export const PI_RING_BUDGET_WINDOW_MS = 60 * 60 * 1000;

/**
 * How many rings one window may carry, absolute — the cap the cooldown cannot be.
 *
 * {@link PI_RING_COOLDOWN_MS} bounds how *often* a ring may fire, not how many: at one ring per fifteen seconds
 * a session under steady traffic can ring **240 times an hour**, and every ring is a model turn taken in the
 * session a person is sitting in. Twenty is the same cap, for the same reason, as the satellite's
 * `WAKE_BUDGET_PER_WINDOW`: twenty turns an hour is already more than a person will read, and the cap is what
 * turns a peer's storm — or a loop — into a bounded cost instead of an unbounded one.
 *
 * A ring suppressed by the budget resolves without ringing, like one merged by the cooldown, so the watcher
 * commits its cursor and no *row* is lost: the doorbell cursor this adapter advances is not the cursor the
 * session's own `fetch` reads (ADR-0038). This is a **ceiling, not a target**, and it is the number to revisit
 * with measurements rather than keep as a belief — B-114's first real firing is where rings per burst can be
 * counted.
 */
export const PI_RING_BUDGET_PER_WINDOW = 20;

/**
 * The interactive terminal mode.
 *
 * Pi reports the current run mode on the session context. `"tui"` is the terminal session a person is
 * sitting in, and one of the two host shapes the ring serves — the other is the interactive RPC host,
 * identified by {@link PI_INTERACTIVE_HOST_ENV}. The value is the host's own vocabulary, mirrored here so
 * the gate has one named source.
 */
export const PI_INTERACTIVE_MODE = "tui";

/**
 * The environment marker a Pi desktop host sets on the interactive `pi --mode rpc` process it spawns.
 *
 * `"rpc"` alone is ambiguous: it is both the harness's headless subagent child and the desktop host a
 * person is sitting in. The host distinguishes them with this marker, and the harness runner strips it
 * from every subagent child's environment (`agents-runner.ts` → `withoutInteractiveHost`), so the marker
 * is present only on the attended process. Reading it is a string contract with the host ecosystem, not a
 * dependency on the host's package: it mirrors the host's own `isInteractiveMode`. If a host renames it,
 * the adapter declines to arm (fail-safe) rather than ring a session it cannot classify.
 */
export const PI_INTERACTIVE_HOST_ENV = "GENTLE_SHELL_INTERACTIVE_HOST";
