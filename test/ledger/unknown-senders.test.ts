import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../src/ledger/open.js";
import { withTransaction } from "../../src/ledger/transaction.js";
import { readUnknownSender, upsertUnknownSender } from "../../src/ledger/unknown-senders.js";
import { TELEGRAM_BOT_TOKEN_RE } from "../../src/shared/secrets.js";

/**
 * The pending unknown-sender list (`ledger/unknown-senders.ts`, ADR-0028 rule 6, design §8.2 step 4).
 *
 * This table is what feeds the "add this sender to the roster" screen — a stranger's `user_id`, the name
 * Telegram showed at the time, and how often it has been seen. Its **whole** value is that it carries the
 * identity and nothing else: `unknown_senders` has no body column at all, so the message text of a
 * stranger who was never authorised cannot be sitting in the ledger.
 *
 * Three properties the caller depends on, each pinned here:
 *
 * - **`first_seen_at` is first-wins.** It answers "how long has this stranger been around", and a row whose
 *   first sighting moved on every message would silently answer "just now" for ever.
 * - **`last_seen_at` never rewinds**, which is the same `MAX` guard `ledger/inbox.ts` applies to the offset
 *   and for the same reason: an observation that arrives out of order must not resurrect a row the
 *   retention sweep has aged out. ISO 8601 UTC strings order lexicographically, which is what the
 *   comparison — and the retention cutoff — rely on.
 * - **`count` is an observation counter**, not a deduplicated event count: a message that gets re-delivered
 *   and counted twice is a poller-level dedup question (`(bot_id, update_id)`, PT-10) and not this table's.
 *
 * This module opens no transaction of its own, so its statements compose inside the poll batch's — pinned
 * below, because a nested `withTransaction` is refused and a writer that opened one would break the batch.
 *
 * Real `node:sqlite` over a temp file opened through `ledger/open.ts`; every value a placeholder.
 */

/** The one bot and project this suite's ledger holds. */
const BOT_ID = 900000001;
const OTHER_BOT_ID = 900000002;
const NOW = "2026-03-01T10:00:00.000Z";

/** The fixture token, assembled so this file carries no token-shaped text of its own (seven-digit id). */
const FIXTURE_TOKEN = `1234567:${"A".repeat(35)}`;

const TOKEN_SHAPE_RE = new RegExp(TELEGRAM_BOT_TOKEN_RE.source);

/** A temp home, an open ledger, and the cleanup — the harness every test shares. */
function withLedger(run: (db: DatabaseSync) => void): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-ledger-"));
	const ledger = openLedger({ homeDir: home });
	try {
		run(ledger.db);
	} finally {
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

/** An instant `days` after {@link NOW}, as ISO 8601 — for the ordering cases. */
function afterNow(days: number): string {
	return new Date(Date.parse(NOW) + days * 24 * 60 * 60 * 1000).toISOString();
}

/** The row count of `unknown_senders`, for the "nothing was written" halves. */
function rowCount(db: DatabaseSync): number {
	return (db.prepare("SELECT COUNT(*) AS n FROM unknown_senders").get() as { n: number }).n;
}

test("a first sighting creates the row with both instants at the observation that created it", () => {
	withLedger((db) => {
		const stored = upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: "stranger_example", seen_at: NOW });

		assert.deepEqual(stored, {
			bot_id: BOT_ID,
			user_id: 444,
			username: "stranger_example",
			first_seen_at: NOW,
			last_seen_at: NOW,
			count: 1,
		});
		// The returned row is the stored one, read back — not the writer's own arithmetic.
		assert.deepEqual(readUnknownSender(db, BOT_ID, 444), stored);
	});
});

test("a second sighting advances last_seen_at and count and leaves first_seen_at where it was", () => {
	withLedger((db) => {
		upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: "stranger_example", seen_at: NOW });
		const stored = upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: "stranger_example", seen_at: afterNow(1) });

		assert.deepEqual(stored, {
			bot_id: BOT_ID,
			user_id: 444,
			username: "stranger_example",
			// First-wins: the row answers "since when", so the second sighting must not move it.
			first_seen_at: NOW,
			last_seen_at: afterNow(1),
			count: 2,
		});
	});
});

test("an observation older than the stored one counts, and moves neither instant backwards", () => {
	withLedger((db) => {
		upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: null, seen_at: afterNow(1) });
		const stored = upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: null, seen_at: NOW });

		assert.equal(stored.first_seen_at, afterNow(1), "first_seen_at is the first sighting, not the oldest one");
		assert.equal(stored.last_seen_at, afterNow(1), "last_seen_at is a MAX, so an out-of-order sighting cannot rewind it");
		assert.equal(stored.count, 2);
	});
});

test("a nameless sighting never erases the stored username, and a later name replaces it", () => {
	withLedger((db) => {
		upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: "stranger_example", seen_at: NOW });

		// Telegram omits `username` for an account that has none, and the roster screen would rather show the
		// name this sender was seen under than a blank the last message overwrote.
		const withoutName = upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, seen_at: afterNow(1) });
		assert.equal(withoutName.username, "stranger_example");

		// A name the sender now carries is the one to show: the newest non-null observation wins.
		const renamed = upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: "renamed_example", seen_at: afterNow(2) });
		assert.equal(renamed.username, "renamed_example");
	});
});

test("the key is (bot_id, user_id): one user seen from two bots is two rows", () => {
	withLedger((db) => {
		upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: "stranger_example", seen_at: NOW });
		upsertUnknownSender(db, { bot_id: OTHER_BOT_ID, user_id: 444, username: "stranger_example", seen_at: afterNow(1) });

		assert.equal(rowCount(db), 2, "a numeric user id is only meaningful under the bot that saw it");
		assert.equal(readUnknownSender(db, BOT_ID, 444)?.last_seen_at, NOW);
		assert.equal(readUnknownSender(db, OTHER_BOT_ID, 444)?.last_seen_at, afterNow(1));

		// A third sighting under one bot touches that bot's row only.
		upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: null, seen_at: afterNow(2) });
		assert.equal(readUnknownSender(db, BOT_ID, 444)?.count, 2);
		assert.equal(readUnknownSender(db, OTHER_BOT_ID, 444)?.count, 1);
	});
});

test("the table has no body column, and this module has no field that could fill one", () => {
	withLedger((db) => {
		const columns = (db.prepare("PRAGMA table_info(unknown_senders)").all() as unknown as { name: string }[]).map(
			(column) => column.name,
		);
		assert.deepEqual(columns, ["bot_id", "user_id", "username", "first_seen_at", "last_seen_at", "count"]);
	});
});

test("a token-shaped username is refused, nothing is written, and the refusal carries no value", () => {
	withLedger((db) => {
		assert.equal(TOKEN_SHAPE_RE.test(FIXTURE_TOKEN), true, "non-vacuous: the fixture must be token-shaped");
		assert.throws(
			() => upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: FIXTURE_TOKEN, seen_at: NOW }),
			(error: unknown) => {
				assert.ok(error instanceof Error);
				assert.ok(error.message.includes("unknown_senders.username"), `expected the column, got: ${error.message}`);
				assert.equal(error.message.includes(FIXTURE_TOKEN), false);
				return true;
			},
		);
		assert.equal(rowCount(db), 0);
	});
});

test("an unparseable sighting instant is refused rather than stored and compared as text", () => {
	withLedger((db) => {
		assert.throws(
			() => upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: null, seen_at: "yesterday" }),
			(error: unknown) => {
				assert.ok(error instanceof Error);
				assert.ok(error.message.includes("seen_at"), `expected the field name, got: ${error.message}`);
				return true;
			},
		);
		assert.equal(rowCount(db), 0);
	});
});

test("the upsert opens no transaction of its own, so it composes inside the batch's", () => {
	withLedger((db) => {
		upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: null, seen_at: NOW });

		// A writer that opened its own transaction would be refused here (no savepoints in F1) rather than
		// rolling back with its caller.
		assert.throws(() =>
			withTransaction(db, () => {
				upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 555, username: null, seen_at: NOW });
				throw new Error("the batch failed after the sighting");
			}),
		);

		assert.equal(rowCount(db), 1, "the sighting inside the failed batch rolled back with it");
		assert.equal(readUnknownSender(db, BOT_ID, 555), undefined);
	});
});
