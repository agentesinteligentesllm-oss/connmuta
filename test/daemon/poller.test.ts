import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../src/ledger/open.js";
import { startPoller, type PollerOptions, type PollerHandle } from "../../src/daemon/poller.js";
import {
	TelegramConflictError,
	RateLimitedError,
	TelegramNetworkError,
	type TelegramUpdate,
} from "../../src/daemon/telegram.js";
import { FakeTelegramClient } from "../fakes/telegram.js";
import { encodeEnvelope } from "../../src/shared/envelope.js";
import { POLL_ERROR_BACKOFF_SECONDS } from "../../src/shared/constants.js";
import type { AdmissionBinding } from "../../src/daemon/admission.js";

const TS = "2026-01-01T00:00:00.000Z";
const RECEIVED_AT_SECONDS = 1_767_225_610;

function withLedger(run: (db: DatabaseSync) => Promise<void> | void): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-poller-"));
	const ledger = openLedger({ homeDir: home });
	return Promise.resolve(run(ledger.db)).finally(() => {
		try {
			ledger.db.close();
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
}

function sampleBinding(overrides: Partial<AdmissionBinding> = {}): AdmissionBinding {
	return {
		project_id: "test-project",
		bot_id: 100,
		agent_id: "@ourbot",
		group_id: -1001234567890,
		roster_snapshot: [
			{ agent_id: "@alice", user_id: 111, username: "alice" },
			{ agent_id: "@bob", user_id: 222, username: "bob" },
			{ agent_id: "@ourbot", user_id: 333, username: "ourbot" },
		],
		...overrides,
	};
}

function sampleUpdate(
	updateId: number,
	text: string,
	overrides: Partial<NonNullable<TelegramUpdate["message"]>> = {}
): TelegramUpdate {
	return {
		update_id: updateId,
		message: {
			message_id: 5000 + updateId,
			date: RECEIVED_AT_SECONDS,
			chat: { id: -1001234567890, type: "supergroup" },
			from: { id: 111, is_bot: false, username: "alice" },
			text,
			...overrides,
		},
	};
}

describe("daemon poller loop (PR-22b)", () => {
	it("409 surfaced, never retried blindly (TELEGRAM_CONFLICT)", async () => {
		await withLedger(async (db) => {
			const binding = sampleBinding();
			const client = new FakeTelegramClient();
			client.failNextGetUpdatesWith(new TelegramConflictError("another poller active"));

			const handle = startPoller({
				db,
				binding,
				client,
				now: () => Date.parse(TS),
			});

			await handle.done;

			// 1. Loop stops without blind retry
			assert.equal(client.getUpdatesCallCount, 1, "must call getUpdates exactly once and stop");

			// 2. offsets table records TELEGRAM_CONFLICT
			const offsetRow = db
				.prepare("SELECT next_update_id, last_error_code, last_poll_started_at FROM offsets WHERE bot_id = ?")
				.get(binding.bot_id) as {
				next_update_id: number;
				last_error_code: string | null;
				last_poll_started_at: string | null;
			};

			assert.ok(offsetRow, "offsets row must exist");
			assert.equal(offsetRow.last_error_code, "TELEGRAM_CONFLICT");
			assert.equal(offsetRow.last_poll_started_at, TS);

			// 3. System audit row recorded
			const auditRow = db
				.prepare("SELECT direction, outcome, reason, project_id, bot_id FROM audit_log WHERE bot_id = ?")
				.get(binding.bot_id) as {
				direction: string;
				outcome: string;
				reason: string | null;
				project_id: string;
				bot_id: number;
			};

			assert.ok(auditRow, "audit log row must exist");
			assert.equal(auditRow.direction, "system");
			assert.equal(auditRow.outcome, "rejected");
			assert.equal(auditRow.reason, "TELEGRAM_CONFLICT");
			assert.equal(auditRow.project_id, binding.project_id);
			assert.equal(auditRow.bot_id, binding.bot_id);
		});
	});

	it("429 honoured with retry_after_s sleep, no blind retry (PT-33 poller half)", async () => {
		await withLedger(async (db) => {
			const binding = sampleBinding();
			const client = new FakeTelegramClient();
			client.failNextGetUpdatesWith(new RateLimitedError(3));

			const slept: number[] = [];
			let currentNow = Date.parse(TS);
			const ac = new AbortController();

			const handle = startPoller({
				db,
				binding,
				client,
				signal: ac.signal,
				now: () => currentNow,
				sleep: async (ms: number) => {
					slept.push(ms);
					currentNow += ms;
					// Stop the poller via abort signal after honoring 429 sleep
					ac.abort();
				},
			});

			await handle.done;

			// 1. Slept exactly retry_after_s (3s = 3000ms), no blind retry before sleep
			assert.deepEqual(slept, [3000], "must sleep exactly retry_after_s before retrying");

			// 2. offsets records TELEGRAM_RATE_LIMITED and retry_after_until
			const offsetRow = db
				.prepare("SELECT last_error_code, retry_after_until FROM offsets WHERE bot_id = ?")
				.get(binding.bot_id) as {
				last_error_code: string | null;
				retry_after_until: string | null;
			};

			assert.ok(offsetRow, "offsets row must exist");
			assert.equal(offsetRow.last_error_code, "TELEGRAM_RATE_LIMITED");
			const expectedUntil = new Date(Date.parse(TS) + 3000).toISOString();
			assert.equal(offsetRow.retry_after_until, expectedUntil);
		});
	});

	it("offset advances only after the write-ahead transaction commits", async () => {
		await withLedger(async (db) => {
			const binding = sampleBinding();
			const client = new FakeTelegramClient();

			const env = {
				eid: "0123456789ab",
				from: "@alice",
				to: "@ourbot",
				type: "REQUEST" as const,
				thread: "0123456789ab",
				ts: TS,
				body: "task request",
			};
			const update = sampleUpdate(105, encodeEnvelope(env));
			client.enqueueUpdates([update]);

			const emitter = new EventEmitter();
			let emitted = false;
			emitter.on(`inbox:${binding.project_id}`, () => {
				emitted = true;
			});

			const ac = new AbortController();
			const handle = startPoller({
				db,
				binding,
				client,
				emitter,
				signal: ac.signal,
				now: () => Date.parse(TS),
			});

			// Stop poller after it commits and emits
			await new Promise<void>((resolve) => {
				emitter.once(`inbox:${binding.project_id}`, () => {
					ac.abort();
					resolve();
				});
			});
			await handle.done;

			// 1. Transaction committed: update stored in updates table
			const updateRow = db
				.prepare("SELECT update_id, apply_outcome FROM updates WHERE bot_id = ? AND update_id = ?")
				.get(binding.bot_id, 105) as { update_id: number; apply_outcome: string } | undefined;
			assert.ok(updateRow, "admitted update must be committed in database");
			assert.equal(updateRow.update_id, 105);

			// 2. offsets.next_update_id advanced to update_id + 1 = 106
			const offsetRow = db
				.prepare("SELECT next_update_id, last_poll_ok_at, last_error_code FROM offsets WHERE bot_id = ?")
				.get(binding.bot_id) as {
				next_update_id: number;
				last_poll_ok_at: string | null;
				last_error_code: string | null;
			};
			assert.equal(offsetRow.next_update_id, 106);
			assert.equal(offsetRow.last_poll_ok_at, TS);
			assert.equal(offsetRow.last_error_code, null);

			// 3. Event emitted
			assert.ok(emitted, "inbox:<project_id> must be emitted when updates are admitted");
		});
	});

	it("transient error backs off with POLL_ERROR_BACKOFF_SECONDS", async () => {
		await withLedger(async (db) => {
			const binding = sampleBinding();
			const client = new FakeTelegramClient();
			client.failNextGetUpdatesWith(new TelegramNetworkError("getUpdates", new Error("econnreset")));

			const slept: number[] = [];
			const ac = new AbortController();

			const handle = startPoller({
				db,
				binding,
				client,
				signal: ac.signal,
				now: () => Date.parse(TS),
				sleep: async (ms: number) => {
					slept.push(ms);
					ac.abort();
				},
			});

			await handle.done;

			assert.deepEqual(slept, [POLL_ERROR_BACKOFF_SECONDS * 1000]);

			const offsetRow = db
				.prepare("SELECT last_error_code FROM offsets WHERE bot_id = ?")
				.get(binding.bot_id) as { last_error_code: string | null };
			assert.equal(offsetRow.last_error_code, "TELEGRAM_NETWORK_ERROR");
		});
	});

	it("stops cleanly via stop()", async () => {
		await withLedger(async (db) => {
			const binding = sampleBinding();
			const client = new FakeTelegramClient();

			const handle = startPoller({
				db,
				binding,
				client,
			});

			await handle.stop();
			await handle.done;
			assert.ok(true, "poller must stop cleanly");
		});
	});
});
