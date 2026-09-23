/**
 * Rate discipline for the send path (`daemon/send/rate.ts`, design §9's rate-discipline row, spec
 * `send-path` "Rate discipline without auto-retry", PT-33 429 half; closes unit 8 `send-path`).
 *
 * **Why the design below.** Through the AS-IS, hash-pinned transports a 429 on `sendMessage` never
 * reaches the send path as `RATE_LIMITED{retry_after_s}` by itself: `GroupTransport` keeps
 * `code: "TELEGRAM_RATE_LIMITED"` on its soft `GroupSendOutcome`, but that outcome type carries no
 * `retry_after_s` field at all — the number is dropped on the floor before it leaves
 * `transport/group.ts`. `DualWriteTransport` fares worse: a DM failure keeps only
 * `(err as Error).message`, a plain string, so `RateLimitedError`'s own `retry_after_s` property is
 * gone by the time it reaches `direct.push({ to, ok: false, error })`; and when NOTHING landed —
 * group and every DM — `DualWriteTransport.send` throws a brand-new `TransportError` built from a
 * joined string of every failure's `.message`, with no `cause` at all, so `classifyErrorChain`
 * (`daemon/telegram.ts`) has nothing to walk and finds nothing.
 *
 * None of that is this unit's to fix — the transports are AS-IS and hash-pinned (D-08), and
 * `send-path.ts` (PR-27) already cannot see through them for `WRONG_ROOM` either, which is exactly
 * why PT-01's room guard runs as a pre-check instead of trusting what comes back up. Rate discipline
 * takes the same shape: **the ledger is the channel, not the return value.** `RateLimitRecorder` is a
 * `TelegramClient` decorator inserted at the BOTTOM of the transport stack, underneath
 * `RoomGuardClient` — the one place every `sendMessage` call, group or direct, still carries the
 * real `RateLimitedError` instance before any AS-IS module has a chance to flatten it. On a 429 it
 * records `offsets.retry_after_until` (design §9: "a 429 from Telegram records `retry_after_until`")
 * and rethrows the SAME error, untouched — never retries, never swallows it. `send-path.ts` then
 * reads that column, before the call as a local pre-check and after the call to reclassify a
 * `TRANSPORT_ERROR` it cannot otherwise tell apart from an ordinary one.
 *
 * **Two independent gates, not one.** `offsets.retry_after_until` is Telegram's own word that this
 * bot is throttled — a fact per `bot_id`, shared by the poller (`daemon/poller.ts` writes and reads
 * the same column on `getUpdates`) and by every binding that token serves. `SendRateBudget` is this
 * daemon's OWN proactive ceiling (H3, THREAT-MODEL T22: "≈1 msg/s per chat, 20 msg/min per group"),
 * enforced before Telegram is ever asked, so a flood never reaches the network at all. Either one
 * refusing is enough to reject a send; `send-path.ts` checks the ledger column first (`??`), and
 * only asks the in-memory budget when the ledger has nothing to say.
 *
 * **Cursor unmoved.** DATA-MODEL.md defines no send-side cursor. The one cursor in the table this
 * module writes is `offsets.next_update_id`, the poller's receive-side `getUpdates` offset, and
 * neither {@link recordRetryAfter}'s upsert nor `send-path.ts`'s refusal names it. The spec's "leaves
 * the relevant cursor unmoved" is read as: a rate-limited send advances nothing — no thread row, no
 * success audit row, no `next_update_id`, and (for a local refusal) no budget spent.
 *
 * **Attribution is by change.** `send-path.ts` treats a failed call as rate-limited when
 * `offsets.retry_after_until` changed during it. The column is per `bot_id`, so a 429 recorded by
 * another binding served by the same bot during the same call would be attributed to this one too —
 * accepted, because the bot is throttled either way. The poller clears the column after a successful
 * poll, which can erase a send-side backoff early (backlog B-45).
 *
 * **A partial delivery is not an error.** When the group post or SOME of the DMs land and only
 * others 429, `transport.send` still returns normally — `DualWriteTransport`'s own rule is "reject
 * only when nothing landed anywhere" — so the send completes exactly as `degraded` today, and
 * `RateLimitRecorder` has already recorded `retry_after_until` underneath that success as a side
 * effect of the DM(s) that did 429. Nothing here promotes a degraded-but-delivered send into a
 * thrown error; the recorded column simply gates the NEXT send instead.
 */

import type { DatabaseSync } from "node:sqlite";

import { GROUP_MESSAGES_PER_MINUTE, CHAT_MESSAGES_PER_SECOND } from "../../shared/constants.js";
import {
	RateLimitedError,
	type GetUpdatesParams,
	type SendMessageParams,
	type TelegramChat,
	type TelegramClient,
	type TelegramMessage,
	type TelegramUpdate,
	type TelegramUser,
} from "../telegram.js";

/** Width of the group per-minute budget window, in milliseconds — `GROUP_MESSAGES_PER_MINUTE` counted over one minute. */
export const RATE_WINDOW_MINUTE_MS = 60_000;

/** Width of the per-chat per-second budget window, in milliseconds — `CHAT_MESSAGES_PER_SECOND` counted over one second. */
export const RATE_WINDOW_SECOND_MS = 1_000;

/** Milliseconds in a second — converts a millisecond duration into the whole seconds `retry_after_s` reports. */
export const MS_PER_SECOND = 1_000;

/** The smallest `retry_after_s` ever reported — a caller must never be told to wait zero seconds for a window that has not actually freed yet. */
export const MIN_RETRY_AFTER_S = 1;

/** Reads `offsets.retry_after_until` for `bot_id`, or `null` when no row exists or the column is unset. */
export function readRetryAfterUntil(db: DatabaseSync, bot_id: number): string | null {
	const row = db
		.prepare("SELECT retry_after_until FROM offsets WHERE bot_id = ?")
		.get(bot_id) as { retry_after_until: string | null } | undefined;
	return row?.retry_after_until ?? null;
}

/**
 * Upserts `offsets.retry_after_until` for `bot_id` to `untilIso`, touching no other column — never
 * `next_update_id` (the poller's own cursor) and never `last_error_code` (the poller's own
 * classification). A row for `bot_id` that does not exist yet is created with every other column at
 * its schema default; a row that already exists keeps every other column exactly as it was.
 */
export function recordRetryAfter(db: DatabaseSync, bot_id: number, untilIso: string): void {
	db.prepare(
		`INSERT INTO offsets (bot_id, retry_after_until) VALUES (?, ?)
		 ON CONFLICT(bot_id) DO UPDATE SET retry_after_until = excluded.retry_after_until`,
	).run(bot_id, untilIso);
}

/**
 * Seconds until `untilIso` — `undefined` when `untilIso` is `null` or is not strictly in the future
 * of `nowMs`, floored at {@link MIN_RETRY_AFTER_S} so a window that has not yet freed is never
 * reported as "wait zero seconds".
 */
export function retryAfterSeconds(untilIso: string | null, nowMs: number): number | undefined {
	if (untilIso === null) {
		return undefined;
	}
	const untilMs = Date.parse(untilIso);
	if (untilMs <= nowMs) {
		return undefined;
	}
	return Math.max(MIN_RETRY_AFTER_S, Math.ceil((untilMs - nowMs) / MS_PER_SECOND));
}

/**
 * Decorates a raw {@link TelegramClient}: on a `RateLimitedError` from `sendMessage`, records
 * `offsets.retry_after_until` for `bot_id` and rethrows the SAME error instance — never retries,
 * never substitutes a different error, never swallows it. Every other method delegates untouched;
 * `getUpdates`/`getMe`/`getChat` are deliberately left alone because the poller (`daemon/poller.ts`)
 * already owns its own 429 handling against the same column, on its own `getUpdates` call, and this
 * decorator has no business touching that path.
 *
 * Wired in by `bindings.ts`'s `buildTransport`, underneath `RoomGuardClient`, so it sees every
 * outbound `sendMessage` call — group or direct — before the AS-IS transports have a chance to
 * flatten the error (module doc).
 */
export class RateLimitRecorder implements TelegramClient {
	private readonly client: TelegramClient;
	private readonly db: DatabaseSync;
	private readonly bot_id: number;
	private readonly now: () => number;

	constructor(client: TelegramClient, options: { db: DatabaseSync; bot_id: number; now?: () => number }) {
		this.client = client;
		this.db = options.db;
		this.bot_id = options.bot_id;
		this.now = options.now ?? Date.now;
	}

	async sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
		try {
			return await this.client.sendMessage(params);
		} catch (err) {
			if (err instanceof RateLimitedError) {
				const untilIso = new Date(this.now() + err.retry_after_s * MS_PER_SECOND).toISOString();
				recordRetryAfter(this.db, this.bot_id, untilIso);
			}
			throw err;
		}
	}

	async getUpdates(params?: GetUpdatesParams): Promise<TelegramUpdate[]> {
		return this.client.getUpdates(params);
	}

	async getMe(): Promise<TelegramUser> {
		return this.client.getMe();
	}

	async getChat(chatId: number | string): Promise<TelegramChat> {
		return this.client.getChat(chatId);
	}
}

/** One violated window's remaining wait, in whole seconds, floored at {@link MIN_RETRY_AFTER_S}. */
function secondsUntilFree(oldestMs: number, windowMs: number, nowMs: number): number {
	return Math.max(MIN_RETRY_AFTER_S, Math.ceil((oldestMs + windowMs - nowMs) / MS_PER_SECOND));
}

/** Drops every timestamp older than `windowMs` relative to `nowMs`, oldest-first (the arrays are always pushed in order). */
function pruned(timestamps: readonly number[], windowMs: number, nowMs: number): number[] {
	return timestamps.filter((ts) => nowMs - ts < windowMs);
}

/**
 * This daemon's own proactive outbound budget (H3, THREAT-MODEL T22) — one instance per daemon, like
 * {@link BindingMutex} in `send-path.ts`. Two independent timestamp windows, both keyed by `bot_id` so
 * different bots never share a budget:
 *
 * - per `(bot_id, group chat_id)`: at most `GROUP_MESSAGES_PER_MINUTE` posts per
 *   {@link RATE_WINDOW_MINUTE_MS};
 * - per `(bot_id, chat)` — the group chat AND every DM target's `@username` — at most
 *   `CHAT_MESSAGES_PER_SECOND` per {@link RATE_WINDOW_SECOND_MS}.
 *
 * Every timestamp array is pruned of anything outside its window on every {@link check} and
 * {@link record} call, so memory is bounded by what each window can hold, never by how long the
 * daemon has been running.
 */
export class SendRateBudget {
	private readonly groupWindows = new Map<string, number[]>();
	private readonly chatWindows = new Map<string, number[]>();

	private groupKey(bot_id: number, groupChatId: number): string {
		return `${bot_id}:${groupChatId}`;
	}

	private chatKey(bot_id: number, chat: number | string): string {
		return `${bot_id}:${chat}`;
	}

	/**
	 * Seconds until the tightest (longest-to-clear) violated window frees, or `undefined` when neither
	 * window is violated. Both windows must have room before a send may proceed, so when both are
	 * violated the caller cannot retry until the SLOWER of the two clears — the max, not the min, of
	 * their individual wait times.
	 *
	 * Read-only: prunes each window it inspects (bounding memory even on a caller that only ever
	 * checks, never records) but records nothing — a caller that decides not to send must not have
	 * consumed budget for a call that never happened.
	 */
	check(bot_id: number, groupChatId: number, chats: readonly (number | string)[], nowMs: number): number | undefined {
		let tightest: number | undefined;

		const groupKey = this.groupKey(bot_id, groupChatId);
		const groupTimestamps = pruned(this.groupWindows.get(groupKey) ?? [], RATE_WINDOW_MINUTE_MS, nowMs);
		this.groupWindows.set(groupKey, groupTimestamps);
		if (groupTimestamps.length >= GROUP_MESSAGES_PER_MINUTE) {
			tightest = secondsUntilFree(groupTimestamps[0]!, RATE_WINDOW_MINUTE_MS, nowMs);
		}

		for (const chat of chats) {
			const chatKey = this.chatKey(bot_id, chat);
			const chatTimestamps = pruned(this.chatWindows.get(chatKey) ?? [], RATE_WINDOW_SECOND_MS, nowMs);
			this.chatWindows.set(chatKey, chatTimestamps);
			if (chatTimestamps.length >= CHAT_MESSAGES_PER_SECOND) {
				const wait = secondsUntilFree(chatTimestamps[0]!, RATE_WINDOW_SECOND_MS, nowMs);
				tightest = tightest === undefined ? wait : Math.max(tightest, wait);
			}
		}

		return tightest;
	}

	/**
	 * Records one post at `nowMs` in the group-minute window and in each of `chats`'s second windows.
	 * The caller decides when this runs — `send-path.ts` calls it only once {@link check} has returned
	 * `undefined` for the same arguments, so a locally-refused send never consumes budget it never
	 * spent (spec "leaves the relevant cursor unmoved" read broadly: nothing is spent for an attempt
	 * that made no network call either).
	 */
	record(bot_id: number, groupChatId: number, chats: readonly (number | string)[], nowMs: number): void {
		const groupKey = this.groupKey(bot_id, groupChatId);
		const groupTimestamps = pruned(this.groupWindows.get(groupKey) ?? [], RATE_WINDOW_MINUTE_MS, nowMs);
		groupTimestamps.push(nowMs);
		this.groupWindows.set(groupKey, groupTimestamps);

		for (const chat of chats) {
			const chatKey = this.chatKey(bot_id, chat);
			const chatTimestamps = pruned(this.chatWindows.get(chatKey) ?? [], RATE_WINDOW_SECOND_MS, nowMs);
			chatTimestamps.push(nowMs);
			this.chatWindows.set(chatKey, chatTimestamps);
		}
	}
}
