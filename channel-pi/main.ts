import { DoorbellWatcher } from "../channel/doorbell-loop.js";
import { createDaemonLink, type DaemonLink } from "../channel/daemon-link.js";
import { resolveProjectBinding, type BindingRefusal, type BindingResult } from "../src/client/binding.js";
import type { SessionIdentity } from "../src/client/session-exchange.js";
import { computeRosterHash } from "../src/shared/roster-hash.js";
import { PI_DOORBELL_HOST_LABEL, PI_INTERACTIVE_HOST_ENV, PI_INTERACTIVE_MODE } from "./constants.js";
import { createPiRinger, type PiMessenger } from "./host.js";

/**
 * The `channel-pi` host adapter (`channel-pi/main.ts`, ADR-0036): the Pi extension that holds F4's
 * body-less doorbell inside the interactive session and rings that session when a roster peer addresses
 * it or broadcasts. It is deliberately a thin binding — the doorbell transport, its pacing, its
 * saturation handling and the notification's text all already exist and are reused unchanged
 * (`channel/daemon-link.ts`, `channel/doorbell-loop.ts`, `channel/notify.ts`), so the only new
 * behaviour here is *where it runs*: inside the host process, started at `session_start` and stopped at
 * `session_shutdown`.
 *
 * **No runtime dependency on the host's package.** The types below are declared structurally and
 * locally on purpose. This repository must not depend on `@earendil-works/pi-coding-agent` to compile,
 * and the extension's real contract is whatever the installed host does — the host is the judge, not
 * this file. Only the members actually used are declared.
 *
 * **The lifecycle is the host's, and it is not optional.** Nothing is started in the factory: the host
 * loads extensions in modes that never begin a session, so a watcher, socket or timer armed here would
 * leak in those modes, and Pi's own extension documentation forbids it. Resources start at
 * `session_start` and end at `session_shutdown`. A session that starts **again** (reload, resume,
 * replacement) is the same rule applied twice: the superseded loop is aborted *and* its link released, so a
 * reload returns the daemon session slot it held instead of leaking it (B-127).
 *
 * **No silent failure.** An unbound project, no live daemon, a refused binding and a dead loop each say
 * so once, through the one surface the human is looking at. The "once" is enforced **here**, per session and
 * keyed by message: the watcher warns on every failed tick by design, so the surface that makes the promise is
 * the one that keeps it (B-127). A component that reports health it does not
 * have is a filed defect class in this repository (B-85); this adapter must not add to it. Warnings
 * never reach stdout, which is not a channel this adapter owns. **The one deliberate silence is the
 * session that was never this adapter's to serve:** a programmatic host is declined before anything is
 * armed, and that is a correct no-op, not a failure to report (B-124).
 */

/** The host's session context, narrowed to the one surface this adapter uses. */
export interface PiHostContext {
	/**
	 * Absent or inert in the host's non-interactive modes. Optional in the type, not merely in practice:
	 * an adapter that assumed a UI would throw in exactly the modes where nobody would see the failure.
	 */
	readonly ui?: { notify(message: string, type?: "info" | "warning" | "error"): void } | undefined;
	/**
	 * The host's current run mode. The adapter arms its watcher only when {@link isInteractiveHost} says the
	 * session is one a person is sitting in: `"tui"`, or the interactive RPC host identified by
	 * {@link PI_INTERACTIVE_HOST_ENV} (B-124). Optional in the type because this repository declares the host
	 * structurally, and a host that omits it fails closed to "do not ring".
	 */
	readonly mode?: "tui" | "rpc" | "json" | "print" | undefined;
}

/**
 * The host's extension API, narrowed to what this adapter calls. `on` is declared with the union of the
 * two lifecycle events it registers; the host dispatches each with its own event payload and context.
 */
export interface PiExtensionHost extends PiMessenger {
	on(event: "session_start" | "session_shutdown", handler: (event: unknown, ctx: PiHostContext) => unknown): void;
}

/**
 * The two collaborators the registration needs, injectable for the same reason `channel/main.ts` injects
 * its own: the lifecycle is worth pinning by test, and a real binding walk plus a real daemon are not
 * what a lifecycle test is about.
 */
export interface ConmutaDoorbellDeps {
	/** Defaults to the id-free shape of ADR-0033: the nearest ancestor `conmuta.json`, no assertion. */
	readonly resolveBinding?: (cwd: string) => BindingResult;
	/** Defaults to `createDaemonLink`. The link is lazy, so injecting it starts nothing. */
	readonly createLink?: (identity: SessionIdentity) => DaemonLink;
	/** Defaults to `process.env`. Injected so the interactive-host gate is asserted without touching the real environment. */
	readonly env?: NodeJS.ProcessEnv;
	/**
	 * Defaults to the watcher's own `abortableSleep`. Injected for the same reason `channel/main.ts` injects it:
	 * the retry cadence is a collaborator, so a test that drives repeated failures does not spend the backoff
	 * in wall clock (B-127).
	 */
	readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const describeFailure = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Whether this host session is one a person is sitting in — the only sessions the ring serves.
 *
 * It mirrors the host ecosystem's own `isInteractiveMode`: the terminal TUI, or an interactive RPC host
 * (the desktop app sets {@link PI_INTERACTIVE_HOST_ENV} on the `pi --mode rpc` process it spawns). A harness
 * subagent is `rpc` **without** that marker, because the runner strips it from every child, so it declines.
 * A host that omits `mode` also declines: guessing wrong the other way injects an automatic turn into a
 * programmatic session, which is the defect (B-124) this gate exists to prevent.
 */
export function isInteractiveHost(mode: PiHostContext["mode"], env: NodeJS.ProcessEnv): boolean {
	return mode === PI_INTERACTIVE_MODE || (mode === "rpc" && env[PI_INTERACTIVE_HOST_ENV] === "1");
}

/** One line a human can act on, per refusal kind. */
function describeRefusal(refusal: BindingRefusal): string {
	switch (refusal.kind) {
		case "missing_project_flag":
			return "no project binding could be resolved";
		case "no_project_file_found":
			return `no conmuta.json found above ${refusal.searchedFrom}`;
		case "invalid_project_file":
			return `${refusal.path} is not a usable conmuta.json (${refusal.problems.length} problem(s))`;
		case "unreadable_project_file":
			return `${refusal.path} could not be read`;
		case "project_id_mismatch":
			return `${refusal.path} is bound to '${refusal.foundProjectId}', expected '${refusal.expectedProjectId}'`;
	}
}

/**
 * Registers the adapter on the host. Registration is the factory's whole effect: a session that never
 * starts arms no watcher, and a session that starts one gets exactly one.
 */
export function createConmutaDoorbellRegistration(pi: PiExtensionHost, deps: ConmutaDoorbellDeps = {}): void {
	const resolveBinding =
		deps.resolveBinding ?? ((cwd: string) => resolveProjectBinding({ project: undefined, cwd }));
	const createLink = deps.createLink ?? ((identity: SessionIdentity) => createDaemonLink({ identity }));
	const env = deps.env ?? process.env;

	let controller: AbortController | undefined;
	let link: DaemonLink | undefined;

	const warn = (ctx: PiHostContext, message: string): void => {
		ctx.ui?.notify(`${PI_DOORBELL_HOST_LABEL}: ${message}`, "warning");
	};

	pi.on("session_start", async (_event, ctx) => {
		// Only a session a person is sitting in is rung (B-124, ADR-0036 amendment 2026-10-06): the terminal TUI,
		// or an interactive RPC host. A harness subagent is `rpc` without the interactive marker, so ringing it
		// would start an automatic turn before the caller's own task, whose prompt is then rejected with "Agent is
		// already processing". Declining is a correct no-op, not a failure to report: the adapter was never meant
		// to serve this session.
		if (!isInteractiveHost(ctx.mode, env)) {
			return;
		}

		// A reload or a resumed session can start again while an older loop is still winding down. The
		// abort is what stops it; the new controller owns the loop that follows.
		controller?.abort();
		controller = new AbortController();
		const signal = controller.signal;

		// The module doc promises each condition is said once through the one surface the human is looking at, and
		// the watcher warns on every failed tick by design (it never branches on the link's error code). "Once" is
		// kept here, on the surface that makes the promise, and per session: a reload is a new session and may
		// report again, and the gate is keyed by message so a genuinely *different* failure is never swallowed
		// (B-127).
		const said = new Set<string>();
		const warnOnce = (message: string): void => {
			if (said.has(message)) {
				return;
			}
			said.add(message);
			warn(ctx, message);
		};

		// The aborted loop's link still holds a daemon session slot, and `session_shutdown` will never see it: a
		// leaked slot is permanent while this process lives, because `sweepDeadSessions` is PID-based. Release it
		// here, before the new link replaces it (B-127) — the B-106 rule, release on a real transport close.
		const superseded = link;
		link = undefined;
		await superseded?.close();

		const binding = resolveBinding(process.cwd());
		if (!binding.ok) {
			warnOnce(describeRefusal(binding.refusal));
			return;
		}

		const { file } = binding;
		// Lazy, like the thin client's: nothing touches the network until the watcher's first read, so a
		// session in an unbound tree or with no daemon pays nothing.
		const created = createLink({
			projectId: file.project_id,
			groupId: file.group_id,
			rosterHash: computeRosterHash(file.roster),
			host: PI_DOORBELL_HOST_LABEL,
		});
		link = created;

		const watcher = new DoorbellWatcher({
			link: { readDoorbell: created.readDoorbell, commitCursor: created.commitCursor },
			// `warnOnce` is the same per-session, message-keyed gate the loop's own failures use: a budget-suppressed
			// ring is not a failure, but it must not be a silence either — and the ringer's message is byte-stable so
			// that gate can actually dedupe it (B-129, B-127).
			deliver: createPiRinger({ pi, warn: warnOnce }),
			warn: warnOnce,
			sleep: deps.sleep,
		});

		// Deliberately not awaited: the loop runs for the life of the session, and blocking the host's
		// `session_start` on a long poll would stall startup. A loop that ends on its own is worth one
		// line, not a crash.
		void watcher.run(signal).catch((err) => warnOnce(`the doorbell loop stopped: ${describeFailure(err)}`));
	});

	pi.on("session_shutdown", async () => {
		const stopping = controller;
		controller = undefined;
		stopping?.abort();

		const closing = link;
		link = undefined;
		// Idempotent by construction: with nothing started this resolves without touching the network.
		// `close()` bounds itself — `channel/daemon-link.ts` races its own session deletion against a
		// timeout — so shutdown adds no timer of its own and no new entry to the timer allow-list.
		await closing?.close();
	});
}

/** The host's entry point: the plain registration, with production's own collaborators. */
export default function registerConmutaDoorbell(pi: PiExtensionHost): void {
	createConmutaDoorbellRegistration(pi);
}
