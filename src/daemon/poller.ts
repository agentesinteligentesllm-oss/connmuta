import type { DatabaseSync } from "node:sqlite";
import type { EventEmitter } from "node:events";
import {
	MAX_BATCH,
	MAX_LONGPOLL_SECONDS,
	POLL_ERROR_BACKOFF_SECONDS,
} from "../shared/constants.js";
import {
	admitTelegramUpdates,
	type AdmissionBinding,
	type AdmissionResult,
} from "./admission.js";
import { appendAuditRow } from "../ledger/audit.js";
import {
	type TelegramClient,
	TelegramConflictError,
	RateLimitedError,
	classifyTelegramError,
} from "./telegram.js";

/**
 * Dependency injection options for the poller loop (design §8.1, §15).
 */
export interface PollerOptions {
	readonly db: DatabaseSync;
	readonly binding: AdmissionBinding;
	readonly client: TelegramClient;
	readonly emitter?: EventEmitter;
	readonly now?: () => number;
	readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	readonly signal?: AbortSignal;
}

/**
 * Handle to a running poller loop.
 */
export interface PollerHandle {
	readonly done: Promise<void>;
	stop(): Promise<void>;
}

/**
 * Default sleep implementation interruptible via AbortSignal.
 */
function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			resolve();
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

/**
 * Starts the per-binding poller loop (design §8.1).
 *
 * This is the daemon bundle's only unbounded loop.
 * - 409 TelegramConflictError stops the loop and records TELEGRAM_CONFLICT in offsets.
 * - 429 RateLimitedError sleeps retry_after_s and continues (PT-33 poller half).
 * - Other transient errors back off POLL_ERROR_BACKOFF_SECONDS and continue.
 * - Admitted updates commit via admitTelegramUpdates before the next offset is queried.
 * - Emits inbox:<project_id> on the in-process EventEmitter for D-02 waiters.
 */
export function startPoller(options: PollerOptions): PollerHandle {
	const {
		db,
		binding,
		client,
		emitter,
		now = Date.now,
		sleep = defaultSleep,
	} = options;

	const abortController = new AbortController();
	if (options.signal) {
		if (options.signal.aborted) {
			abortController.abort();
		} else {
			options.signal.addEventListener("abort", () => abortController.abort(), { once: true });
		}
	}
	const signal = abortController.signal;

	const runLoop = async (): Promise<void> => {
		while (!signal.aborted) {
			const nowMs = now();
			const nowIso = new Date(nowMs).toISOString();

			// 1. Read current offset and check if rate limited
			let nextUpdateId = 0;
			const offsetRow = db
				.prepare("SELECT next_update_id, retry_after_until FROM offsets WHERE bot_id = ?")
				.get(binding.bot_id) as
				| { next_update_id: number; retry_after_until: string | null }
				| undefined;

			if (offsetRow !== undefined) {
				nextUpdateId = offsetRow.next_update_id;
				if (offsetRow.retry_after_until !== null) {
					const untilMs = Date.parse(offsetRow.retry_after_until);
					if (untilMs > nowMs) {
						await sleep(untilMs - nowMs, signal);
						if (signal.aborted) break;
					}
				}
			}

			// 2. Mark poll started
			db.prepare(
				`INSERT INTO offsets (bot_id, next_update_id, last_poll_started_at, poller_pid)
				 VALUES (?, ?, ?, ?)
				 ON CONFLICT (bot_id) DO UPDATE SET
				   last_poll_started_at = excluded.last_poll_started_at,
				   poller_pid = excluded.poller_pid`
			).run(binding.bot_id, nextUpdateId, nowIso, process.pid);

			// 3. getUpdates
			try {
				const updates = await client.getUpdates({
					offset: nextUpdateId,
					limit: MAX_BATCH,
					timeout: MAX_LONGPOLL_SECONDS,
				});

				if (signal.aborted) break;

				// 4. Admit updates (write-ahead transaction inside admitTelegramUpdates)
				const result: AdmissionResult = admitTelegramUpdates(db, binding, updates);

				// 5. Update offsets on success
				const okIso = new Date(now()).toISOString();
				db.prepare(
					`UPDATE offsets SET
					   last_poll_ok_at = ?,
					   last_error_code = NULL,
					   retry_after_until = NULL
					 WHERE bot_id = ?`
				).run(okIso, binding.bot_id);

				// 6. Emit event if updates admitted
				if (result.inserted > 0) {
					emitter?.emit(`inbox:${binding.project_id}`, result);
				}
			} catch (err) {
				if (signal.aborted) break;

				if (err instanceof TelegramConflictError) {
					// 409 TelegramConflictError: record TELEGRAM_CONFLICT, audit row, STOP loop
					db.prepare("UPDATE offsets SET last_error_code = 'TELEGRAM_CONFLICT' WHERE bot_id = ?").run(
						binding.bot_id
					);
					appendAuditRow(db, {
						ts: new Date(now()).toISOString(),
						project_id: binding.project_id,
						bot_id: binding.bot_id,
						chat_id: binding.group_id,
						client_id: null,
						direction: "system",
						eid: null,
						envelope_type: null,
						from_user_id: null,
						to_user_id: null,
						outcome: "rejected",
						reason: "TELEGRAM_CONFLICT",
					});
					break; // STOP this loop (never a blind retry)
				}

				if (err instanceof RateLimitedError) {
					// 429 RateLimitedError: record TELEGRAM_RATE_LIMITED, retry_after_until, sleep retry_after_s
					const retryAfterS = err.retry_after_s;
					const retryAfterUntil = new Date(now() + retryAfterS * 1000).toISOString();
					db.prepare(
						`UPDATE offsets SET
						   last_error_code = 'TELEGRAM_RATE_LIMITED',
						   retry_after_until = ?
						 WHERE bot_id = ?`
					).run(retryAfterUntil, binding.bot_id);
					await sleep(retryAfterS * 1000, signal);
					continue;
				}

				// Other errors: classify error, sleep POLL_ERROR_BACKOFF_SECONDS, continue
				const classification = classifyTelegramError(err);
				const errorCode = classification?.code ?? "TELEGRAM_ERROR";
				db.prepare("UPDATE offsets SET last_error_code = ? WHERE bot_id = ?").run(
					errorCode,
					binding.bot_id
				);
				await sleep(POLL_ERROR_BACKOFF_SECONDS * 1000, signal);
			}
		}
	};

	const done = runLoop();

	return {
		done,
		stop: async (): Promise<void> => {
			abortController.abort();
			await done;
		},
	};
}
