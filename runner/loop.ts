import { abortableSleep } from "../channel/doorbell-loop.js";
import type { DaemonLink, DoorbellResponse } from "../channel/daemon-link.js";
import { FETCH_LONGPOLL_MAX_SECONDS } from "../src/shared/constants.js";
import { LADDER_POLL_MS, REFUSAL_REPEAT_MS, WAKE_BUDGET_PER_WINDOW, WAKE_BUDGET_WINDOW_MS, WAKE_COOLDOWN_MS } from "./constants.js";
import { resolveHarnessSpec, type HarnessSpec, type TurnOutcome } from "./harness.js";
import { readLadderFile, resolveLadder, type LadderEntry, type LadderLevel, type LadderOffReason } from "./ladder.js";
import { appendLedgerRow, notifyRow, refusedRow, wakeRow, type LedgerTrigger, type RowContext } from "./ledger.js";
import { buildWakePrompt } from "./prompt.js";
import { readWatermarkFor, writeWatermark } from "./watermark.js";

/**
 * The wake loop (`runner/loop.ts`; ADR-0032 R3/R4/R5/R6, PT-36). One tick decides whether this binding may
 * be woken right now, and — if it may — starts exactly one turn and records exactly one row.
 *
 * **The order of decisions, and why it is this order.** The ladder is read first, on every tick: while the
 * binding is `off` the loop does not even hold a session against the daemon, so a disabled binding costs
 * nothing. Only an enabled binding reads the doorbell, which is already body-less and roster-gated by the
 * daemon (R3). A `notify` binding tells the human and starts no turn. An enabled `wake`/`autopilot` binding
 * then passes three bounds in a fixed order — in-flight, then cooldown, then budget — and any of them that
 * refuses writes one counted refusal and **leaves the watermark where it was**, so the pending message wakes
 * the agent as soon as the bound clears instead of being lost.
 *
 * **The ladder is resolved twice, and the second time is what makes the kill switch real.** A doorbell read
 * can hold up to the daemon's long-poll clamp; an operator who disables a binding during that wait must not
 * see a turn start on the strength of a record read before it. So every tick that finds traffic re-reads the
 * ladder and acts on the *fresh* answer. The judgment-day audit of this phase found the missing re-read.
 *
 * **The watermark commits last (ADR-0025's doctrine, inherited).** Two separate things advance it, and they
 * are different on purpose:
 *
 *  - a **silent** read (rows exist but none is relevant to this binding) advances the runner's own watermark
 *    without committing anything to the daemon — the rows were examined and covered, and not advancing left
 *    the loop re-reading the same window at full speed until a message arrived;
 *  - a **wake** commits the daemon-side cursor only when the turn actually ran to completion (`exited`). A
 *    turn that timed out or was aborted at shutdown did not do the work, so the message stays pending and is
 *    woken again; an unavailable harness does the same. The per-window budget, not a silent commit, is what
 *    bounds the cost of a message that keeps failing.
 *
 * **The runner keeps its own watermark file** (`runner/watermark.ts`) because a new IPC session mints a new
 * `client_cursors` row seeded at the daemon's catch-up window: without a local copy, every restart would
 * re-wake that whole window. The audit found that too.
 *
 * **Every refusal is counted, never silent (R6), and never a flood.** A refusal is written once when its
 * reason appears, at most once per {@link REFUSAL_REPEAT_MS} while it persists, and the record of "which
 * reason was last written" is cleared by any accepted wake — so a refusal that follows a successful wake is a
 * new fact, not a repeat.
 */

export type TickOutcome = "idle" | "silent" | "notified" | "woke" | "refused" | "link_failed";

export type RefusalReason =
	| "in_flight"
	| "cooldown"
	| "budget_exhausted"
	| "harness_unknown"
	| "arguments_refused"
	/** No verified send-proof profile covers this level/harness pair, so no turn was started (2026-10-05). */
	| "profile_unavailable";

export interface WakeLoopDeps {
	readonly projectId: string;
	readonly cwd: string;
	readonly ladderPath: string;
	readonly ledgerPath: string;
	/** The runner's own resume point (`runner/watermark.ts`), not the daemon's session cursor. */
	readonly watermarkPath: string;
	/** Only the two calls the loop makes, so a fake needs no `close`; the real `DaemonLink` is assignable. */
	readonly link: Pick<DaemonLink, "readDoorbell" | "commitCursor">;
	readonly runTurn: (input: { readonly spec: HarnessSpec; readonly cwd: string; readonly signal: AbortSignal }) => Promise<TurnOutcome>;
	readonly now?: () => number;
	readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
	readonly warn?: (message: string) => void;
	/** Bounds, injectable so a test never waits: the production values are the named constants. */
	readonly cooldownMs?: number;
	readonly budgetWindowMs?: number;
	readonly budgetPerWindow?: number;
	readonly refusalRepeatMs?: number;
	/** The long-poll the doorbell read uses; defaults to the daemon's own clamp. */
	readonly longPollSeconds?: number;
}

export class WakeLoop {
	private readonly now: () => number;
	private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
	private readonly warn: (message: string) => void;
	private readonly cooldownMs: number;
	private readonly budgetWindowMs: number;
	private readonly budgetPerWindow: number;
	private readonly refusalRepeatMs: number;
	private readonly longPollSeconds: number;
	/** Highest seq this runner has covered, loaded from its own file on first use. */
	private watermark: number | undefined;
	/** Wake timestamps inside the current window, pruned on use. */
	private wakes: number[] = [];
	private inFlight = false;
	/** The last refusal or ladder-problem recorded, cleared by any accepted wake. */
	private lastRefusal: { readonly reason: string; readonly at: number } | undefined;

	constructor(private readonly deps: WakeLoopDeps) {
		this.now = deps.now ?? (() => Date.now());
		this.sleep = deps.sleep ?? abortableSleep;
		this.warn =
			deps.warn ??
			((message) => {
				process.stderr.write(`${message}\n`);
			});
		this.cooldownMs = deps.cooldownMs ?? WAKE_COOLDOWN_MS;
		this.budgetWindowMs = deps.budgetWindowMs ?? WAKE_BUDGET_WINDOW_MS;
		this.budgetPerWindow = deps.budgetPerWindow ?? WAKE_BUDGET_PER_WINDOW;
		this.refusalRepeatMs = deps.refusalRepeatMs ?? REFUSAL_REPEAT_MS;
		this.longPollSeconds = deps.longPollSeconds ?? FETCH_LONGPOLL_MAX_SECONDS;
	}

	/** Repeats ticks until the caller aborts. Pacing is the doorbell's long poll; only `idle`, `refused` and
	 * `link_failed` sleep, so a bound that is still in force cannot spin the loop. */
	async run(signal: AbortSignal): Promise<void> {
		while (!signal.aborted) {
			const outcome = await this.tick(signal);
			if (signal.aborted) return;
			if (outcome === "idle" || outcome === "refused" || outcome === "link_failed") {
				await this.sleep(LADDER_POLL_MS, signal);
			}
		}
	}

	async tick(signal: AbortSignal): Promise<TickOutcome> {
		const armed = resolveLadder(readLadderFile(this.deps.ladderPath), this.deps.projectId);
		if (armed.kind === "off") {
			this.recordLadderProblem(armed.reason);
			return "idle";
		}

		const summary = await this.readSummary(signal);
		if (summary === undefined) return "link_failed";
		if (summary.count === 0) {
			// Rows were examined and none concerns this binding: cover them locally and let the next read start
			// after them. Committing nothing is deliberate — the daemon's cursor is for the turn that acts.
			this.advanceTo(summary.covered_through_seq);
			return "silent";
		}

		// The wait above may have lasted the whole long-poll clamp; the record that decided it may be gone.
		const resolved = resolveLadder(readLadderFile(this.deps.ladderPath), this.deps.projectId);
		if (resolved.kind === "off") {
			this.recordLadderProblem(resolved.reason);
			return "idle";
		}
		const entry = resolved.entry;

		const trigger: LedgerTrigger = {
			count: summary.count,
			senders: summary.senders,
			types: summary.types,
			threads: summary.threads,
		};

		if (entry.level === "notify") {
			this.warn(
				`[conmuta-runner] ${trigger.count} new message(s) for ${this.deps.projectId} from ${trigger.senders.join(", ")} ` +
					`(threads ${trigger.threads.join(", ")}) — level is \`notify\`, no turn started`,
			);
			appendLedgerRow(this.deps.ledgerPath, notifyRow(this.context(entry.level), trigger));
			await this.commit(summary.covered_through_seq);
			return "notified";
		}

		const refusal = this.boundFailure();
		if (refusal !== null) {
			this.recordRefusal(entry.level, refusal);
			return "refused";
		}

		const prompt = buildWakePrompt({
			project_id: this.deps.projectId,
			level: entry.level === "autopilot" ? "autopilot" : "wake",
			summary: trigger,
		});
		const harness = resolveHarnessSpec(entry, prompt);
		if (harness.kind === "refused") {
			this.recordRefusal(entry.level, harness.reason);
			return "refused";
		}

		this.inFlight = true;
		let outcome: TurnOutcome;
		try {
			outcome = await this.deps.runTurn({ spec: harness.spec, cwd: this.deps.cwd, signal });
		} finally {
			this.inFlight = false;
		}

		this.wakes.push(this.now());
		appendLedgerRow(this.deps.ledgerPath, wakeRow(this.context(entry.level), trigger, entry.harness, outcome.kind));
		// An accepted wake clears the refusal memo: the next refusal is a new fact about a new message.
		this.lastRefusal = undefined;
		this.warn(
			`[conmuta-runner] woke \`${entry.harness}\` for ${this.deps.projectId} (${trigger.count} message(s), ` +
				`threads ${trigger.threads.join(", ")}) — turn ${outcome.kind}`,
		);
		if (outcome.kind === "exited") {
			await this.commit(summary.covered_through_seq);
		} else {
			this.warn(
				`[conmuta-runner] turn ${outcome.kind}: the message stays pending, so it is woken again (bounded by the ` +
					`per-window budget of ${this.budgetPerWindow})`,
			);
		}
		return "woke";
	}

	/** One long-poll read after loading the runner's own resume point, or the daemon's seed on a first run. */
	private async readSummary(signal: AbortSignal): Promise<DoorbellResponse | undefined> {
		try {
			if (this.watermark === undefined) {
				const persisted = readWatermarkFor(this.deps.watermarkPath, this.deps.projectId);
				if (persisted !== undefined) {
					this.watermark = persisted;
				} else {
					// A first run: the daemon's own catch-up seed, persisted at once so a crash before the first
					// wake does not re-seed the window on the next start.
					this.watermark = await this.deps.link.commitCursor();
					this.persist(this.watermark);
				}
			}
			return await this.deps.link.readDoorbell(this.watermark, this.longPollSeconds, signal);
		} catch (err) {
			if (!signal.aborted) {
				this.warn(`[conmuta-runner] daemon link failed: ${err instanceof Error ? err.message : "unknown error"}`);
			}
			return undefined;
		}
	}

	/** Commits the daemon-side cursor and covers the seq locally. */
	private async commit(seq: number): Promise<void> {
		try {
			await this.deps.link.commitCursor(seq);
			this.advanceTo(seq);
		} catch (err) {
			// A commit that fails leaves the watermark where it was, so the message is re-woken rather than
			// silently covered; the failure itself is worth a line.
			this.warn(`[conmuta-runner] cursor commit failed: ${err instanceof Error ? err.message : "unknown error"}`);
		}
	}

	/** Moves the in-memory watermark forward and persists it, so a restart resumes where this run stopped. */
	private advanceTo(seq: number): void {
		const next = Math.max(this.watermark ?? seq, seq);
		if (next === this.watermark) return;
		this.watermark = next;
		this.persist(next);
	}

	/** A failed persist costs a re-read of the daemon's window, never a lost message, so it warns and goes on. */
	private persist(seq: number): void {
		try {
			writeWatermark(this.deps.watermarkPath, this.deps.projectId, seq);
		} catch (err) {
			this.warn(`[conmuta-runner] watermark write failed: ${err instanceof Error ? err.message : "unknown error"}`);
		}
	}

	private context(level: LadderLevel): RowContext {
		return { ts: new Date(this.now()).toISOString(), project_id: this.deps.projectId, level };
	}

	/** In-flight first (the most specific bound), then cooldown, then the window budget. `null` means "wake". */
	private boundFailure(): RefusalReason | null {
		if (this.inFlight) return "in_flight";
		const now = this.now();
		if (this.wakes.length > 0 && now - Math.max(...this.wakes) < this.cooldownMs) return "cooldown";
		const windowStart = now - this.budgetWindowMs;
		this.wakes = this.wakes.filter((at) => at > windowStart);
		if (this.wakes.length >= this.budgetPerWindow) return "budget_exhausted";
		return null;
	}

	private recordRefusal(level: LadderLevel, reason: RefusalReason): void {
		if (!this.shouldRecord(reason)) return;
		appendLedgerRow(this.deps.ledgerPath, refusedRow(this.context(level), reason));
	}

	/** A ladder problem is worth recording once; the ordinary `no_record`/`level_off` answers are not. */
	private recordLadderProblem(reason: LadderOffReason): void {
		if (reason === "no_record" || reason === "level_off") return;
		if (!this.shouldRecord(reason)) return;
		appendLedgerRow(this.deps.ledgerPath, refusedRow(this.context("off"), reason));
	}

	private shouldRecord(reason: string): boolean {
		const now = this.now();
		const last = this.lastRefusal;
		if (last !== undefined && last.reason === reason && now - last.at < this.refusalRepeatMs) return false;
		this.lastRefusal = { reason, at: now };
		return true;
	}
}
