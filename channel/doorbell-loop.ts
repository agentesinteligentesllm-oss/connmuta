import type { DaemonLink, DoorbellResponse } from "./daemon-link.js";
import { buildNotification, type ChannelNotification } from "./notify.js";
import { CHANNEL_RETRY_BACKOFF_SECONDS, FETCH_LONGPOLL_MAX_SECONDS } from "../src/shared/constants.js";

/**
 * The doorbell watcher (`channel/doorbell-loop.ts`, F4 design D7/D11/D12, spec `channel-doorbell`): a tick
 * reads one doorbell summary, rings at most once, and commits the cursor only after the ring was delivered;
 * `run` repeats ticks until the caller aborts.
 *
 * **The one timer file (D7).** {@link abortableSleep} is the adapter's only timer, armed only to pace the
 * retry after a failed tick. It reaches no transport, send or spawn path, so it is pacing, not autonomous
 * emission (spec: the closure test bans reachability, not this timer). It uses the global `setTimeout`,
 * never a timers module, which the closure predicates ban outright.
 *
 * **Pacing.** Successful ticks never sleep: a saturated page is re-read at once, and a silent tick (D11)
 * continues at once too, so the daemon's long poll is what paces a quiet loop. Known limitation: a daemon
 * that answered instantly and empty every time would spin the loop.
 *
 * **Failures.** Every link failure is alike to the watcher: it warns, reports `link_failed`, and lets `run`
 * back off. It never branches on the link's error code. Warnings go to stderr, because stdout is the MCP
 * stdio channel and must carry protocol frames only.
 */

/** Converts {@link CHANNEL_RETRY_BACKOFF_SECONDS} to a timer duration. */
const MILLISECONDS_PER_SECOND = 1000;
const RETRY_BACKOFF_MS = CHANNEL_RETRY_BACKOFF_SECONDS * MILLISECONDS_PER_SECOND;

export type TickOutcome = "rang" | "silent" | "deliver_failed" | "link_failed";

export interface DoorbellWatcherDeps {
	/** Only the two calls the loop makes, so a fake needs no `close`; the real {@link DaemonLink} is assignable. */
	readonly link: Pick<DaemonLink, "readDoorbell" | "commitCursor">;
	/** Hands one notification to the host. A rejection means it was not delivered, so the cursor stays where it was. */
	readonly deliver: (notification: ChannelNotification) => Promise<void>;
	readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
	readonly warn?: (message: string) => void;
}

/** Resolves, never rejects, after `ms` or as soon as `signal` aborts. Arms no timer for an aborted signal and leaves no listener on it. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
	if (signal.aborted) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const onAbort = (): void => {
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

const describeFailure = (err: unknown): string => (err instanceof Error ? err.message : "unknown error");

export class DoorbellWatcher {
	private readonly sleep: NonNullable<DoorbellWatcherDeps["sleep"]>;
	private readonly warn: NonNullable<DoorbellWatcherDeps["warn"]>;
	/** Highest seq already covered, in memory only: `undefined` until the first tick reads the cursor row. */
	private watermark: number | undefined;

	constructor(private readonly deps: DoorbellWatcherDeps) {
		this.sleep = deps.sleep ?? abortableSleep;
		this.warn =
			deps.warn ??
			((message) => {
				process.stderr.write(`${message}\n`);
			});
	}

	async tick(signal?: AbortSignal): Promise<TickOutcome> {
		const summary = await this.readSummary(signal);
		if (summary === undefined) {
			return "link_failed";
		}
		const notification = buildNotification(summary);
		if (notification === null) {
			this.advanceTo(summary.covered_through_seq);
			return "silent";
		}
		try {
			await this.deps.deliver(notification);
		} catch (err) {
			this.warn(`doorbell deliver failed: ${describeFailure(err)}`);
			return "deliver_failed";
		}
		try {
			await this.deps.link.commitCursor(summary.covered_through_seq);
		} catch (err) {
			this.warn(`doorbell cursor commit failed: ${describeFailure(err)}`);
		}
		this.advanceTo(summary.covered_through_seq);
		return "rang";
	}

	async run(signal: AbortSignal): Promise<void> {
		while (!signal.aborted) {
			const outcome = await this.tick(signal);
			if ((outcome === "deliver_failed" || outcome === "link_failed") && !signal.aborted) {
				await this.sleep(RETRY_BACKOFF_MS, signal);
			}
		}
	}

	/** Bootstraps the watermark from the cursor row on first use, then long-polls after it. `undefined` means the link failed. */
	private async readSummary(signal?: AbortSignal): Promise<DoorbellResponse | undefined> {
		try {
			this.watermark ??= await this.deps.link.commitCursor();
			return await this.deps.link.readDoorbell(this.watermark, FETCH_LONGPOLL_MAX_SECONDS, signal);
		} catch (err) {
			// An abort surfaces as a link error; the shutdown that caused it is not worth a warning.
			if (!signal?.aborted) {
				this.warn(`doorbell link failed: ${describeFailure(err)}`);
			}
			return undefined;
		}
	}

	private advanceTo(seq: number): void {
		this.watermark = Math.max(this.watermark ?? seq, seq);
	}
}
