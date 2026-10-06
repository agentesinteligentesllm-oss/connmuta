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
 * The one host run mode the adapter serves.
 *
 * Pi reports the current mode on the session context. `"tui"` is the interactive session a person is
 * sitting in — the session the ring exists to wake. Every other mode is programmatic: `"rpc"` is what a
 * harness child runs as, and `"json"`/`"print"` are non-interactive runs. Ringing a programmatic session
 * injects an automatic turn before the caller's own task, and the caller's prompt is then rejected with
 * *"Agent is already processing"* (B-124, ADR-0036 amendment 2026-10-06), so the watcher is armed only for
 * this mode. The value is the host's own vocabulary, mirrored here so the gate has one named source.
 */
export const PI_INTERACTIVE_MODE = "tui";
