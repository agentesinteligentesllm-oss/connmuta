import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import {
	commitInboxBatch,
	INBOX_BODY_OUTCOME_MISMATCH_MESSAGE,
	INBOX_DUPLICATE_UPDATE_ID_MESSAGE,
} from "../../src/ledger/inbox.js";
import { openLedger } from "../../src/ledger/open.js";
import type { InboxAuditRow, InboxBatchEntry, InboxUpdateInput } from "../../src/ledger/inbox.js";
import { readThreadRecord, writeThreadRecord } from "../../src/ledger/threads.js";
import { withTransaction } from "../../src/ledger/transaction.js";
import type { ThreadRecord } from "../../src/shared/thread-record.js";

/**
 * The write-ahead inbox transaction (design §5.3), over real `node:sqlite` and a temp file per test.
 *
 * What this suite is for: PT-10's crash replay. A batch that has committed and is then re-served —
 * which is exactly what happens when the process dies after the commit but before it hands the new
 * offset to `getUpdates` — must be deduplicated rather than written twice, and the offset must never
 * move ahead of the rows that back it.
 *
 * The fault injection is real rather than simulated: a batch the schema refuses throws *inside*
 * `withTransaction`, between the entries already written and the offset advance, which is the throw
 * PR-10's spike put a boundary on.
 *
 * Every value here is a placeholder (AGENTS.md §3): synthetic bot, chat, user, project and thread ids,
 * none shaped like a credential.
 */

/** SQLite's extended code for a violated `UNIQUE` key (`2067 & 0xFF` is `SQLITE_CONSTRAINT`). */
const SQLITE_CONSTRAINT_UNIQUE = 2067;

/** The one bot this suite's ledger holds; `updates` is deduplicated on `(bot_id, update_id)`. */
const BOT_ID = 900000001;

/** The one project the binding serves. */
const PROJECT_ID = "project-a";

/** A fixed instant, so `received_at` is comparable across cases. */
const RECEIVED_AT = "2026-01-01T00:00:00.000Z";

/** A temp home, an open ledger, and the cleanup — the harness every test in this file shares. */
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

/** One admitted update, with the fields a case is not about taken from a placeholder. */
function updateInput(updateId: number, eid: string, overrides: Partial<InboxUpdateInput> = {}): InboxUpdateInput {
	return {
		update_id: updateId,
		project_id: PROJECT_ID,
		chat_id: -1001234567890,
		via: "group",
		message_id: 5000 + updateId,
		message_date: 1_767_225_600 + updateId,
		from_user_id: 222,
		from_agent_id: "@alice-agent",
		eid,
		envelope_json: JSON.stringify({ eid, type: "REQUEST" }),
		body: `body of ${eid}`,
		apply_outcome: "opened",
		received_at: RECEIVED_AT,
		...overrides,
	};
}

/** A `ThreadRecord` good enough to be written by an admitted entry. */
function threadRecord(body: string): ThreadRecord {
	return {
		status: "open",
		opened_type: "REQUEST",
		opened_eid: "eid-opened",
		from: "@alice-agent",
		to: "@bob-agent",
		body,
		opened_at: RECEIVED_AT,
		opened_message_id: 5001,
		via: "group",
		acked_at: null,
		ack_count: 0,
		resolved_at: null,
		resolved_by: null,
		basis: null,
		to_user_id: 222,
		group_message_id: 5001,
		closure_delivered: false,
		awaiting: "@bob-agent",
		history: [],
	};
}

/** An admitted entry with a thread of its own. */
function admitted(update: InboxUpdateInput, threadId: string): InboxBatchEntry {
	return { kind: "admitted", update, thread: { thread_id: threadId, record: threadRecord(`opening of ${threadId}`) } };
}

/** One `audit_log` row, with the fields a case is not about taken from a placeholder. */
function auditRow(overrides: Partial<InboxAuditRow> = {}): InboxAuditRow {
	return {
		ts: RECEIVED_AT,
		project_id: PROJECT_ID,
		bot_id: BOT_ID,
		chat_id: null,
		client_id: null,
		direction: "receive",
		eid: "eid-dropped",
		envelope_type: "REQUEST",
		from_user_id: 333,
		to_user_id: null,
		outcome: "dropped",
		reason: "foreign_chat",
		...overrides,
	};
}

/** How many rows each table holds, for the "written twice" half of the replay assertion. */
function tableCounts(db: DatabaseSync): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const table of ["updates", "threads", "thread_history", "audit_log"]) {
		const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
		counts[table] = row.n;
	}
	return counts;
}

/** The persisted offset for {@link BOT_ID}, or `null` when the batch never advanced it at all. */
function persistedOffset(db: DatabaseSync): number | null {
	const row = db.prepare("SELECT next_update_id AS n FROM offsets WHERE bot_id = ?").get(BOT_ID) as { n: number } | undefined;
	return row?.n ?? null;
}

test("a batch re-served after the crash replays once, and nothing is written twice", () => {
	withLedger((db) => {
		const entries: InboxBatchEntry[] = [
			admitted(updateInput(101, "eid-101"), "thread-1"),
			admitted(updateInput(102, "eid-102"), "thread-2"),
		];

		const first = commitInboxBatch(db, { bot_id: BOT_ID, entries });
		assert.deepEqual(first, { inserted: 2, replayed: 0, nextUpdateId: 103 });
		assert.equal(persistedOffset(db), 103);
		const afterFirst = tableCounts(db);

		// The crash: the process died after the commit and before it used `nextUpdateId`, so on restart it
		// polls with the old offset and Telegram serves the very same updates again.
		const second = commitInboxBatch(db, { bot_id: BOT_ID, entries });

		// Counted as replays rather than inserted, and the offset lands on the same value it already held.
		assert.deepEqual(second, { inserted: 0, replayed: 2, nextUpdateId: 103 });
		assert.equal(persistedOffset(db), 103);
		// And nothing at all was written a second time — not the update rows, not the threads, not the
		// thread history the thread adapter reconciles.
		assert.deepEqual(tableCounts(db), afterFirst);
	});
});

test("a partly-served batch replays only the part that was already committed", () => {
	withLedger((db) => {
		commitInboxBatch(db, { bot_id: BOT_ID, entries: [admitted(updateInput(101, "eid-101"), "thread-1")] });

		// The second poll covers the update that committed plus the one that arrived after it.
		const result = commitInboxBatch(db, {
			bot_id: BOT_ID,
			entries: [admitted(updateInput(101, "eid-101"), "thread-1"), admitted(updateInput(102, "eid-102"), "thread-2")],
		});

		assert.deepEqual(result, { inserted: 1, replayed: 1, nextUpdateId: 103 });
		assert.deepEqual(tableCounts(db), { updates: 2, threads: 2, thread_history: 0, audit_log: 0 });
	});
});

test("the replay key is (bot_id, update_id): the same update id under another bot is a new row", () => {
	withLedger((db) => {
		commitInboxBatch(db, { bot_id: BOT_ID, entries: [admitted(updateInput(101, "eid-101"), "thread-1")] });
		const otherBot = commitInboxBatch(db, {
			bot_id: BOT_ID + 1,
			entries: [admitted(updateInput(101, "eid-101-other"), "thread-1")],
		});

		assert.deepEqual(otherBot, { inserted: 1, replayed: 0, nextUpdateId: 102 });
	});
});

test("the offset advances one past the highest update_id in the batch, not to the last one seen", () => {
	withLedger((db) => {
		// Authored out of ascending order on purpose: the writer's contract is `max(update_id) + 1`
		// (design §5.3), and a writer that took the last entry it happened to see would still pass a
		// sorted batch. Telegram's own ordering is not what is being pinned here.
		const result = commitInboxBatch(db, {
			bot_id: BOT_ID,
			entries: [
				admitted(updateInput(107, "eid-107"), "thread-1"),
				admitted(updateInput(101, "eid-101"), "thread-2"),
				admitted(updateInput(104, "eid-104"), "thread-3"),
			],
		});

		assert.deepEqual(result, { inserted: 3, replayed: 0, nextUpdateId: 108 });
		assert.equal(persistedOffset(db), 108);
	});
});

test("a batch of drops still advances the offset over every update it covered", () => {
	withLedger((db) => {
		const result = commitInboxBatch(db, {
			bot_id: BOT_ID,
			entries: [
				{ kind: "dropped", update_id: 201, audits: [auditRow({ eid: "eid-foreign", reason: "foreign_chat" })] },
				// The self-echo case: counted and dropped, and deliberately NOT audited (design §8.2 step 5).
				{ kind: "dropped", update_id: 202, audits: [] },
			],
		});

		assert.deepEqual(result, { inserted: 0, replayed: 0, nextUpdateId: 203 });
		assert.equal(persistedOffset(db), 203);
		assert.deepEqual(tableCounts(db), { updates: 0, threads: 0, thread_history: 0, audit_log: 1 });
	});
});

test("an empty batch writes nothing, reports nothing to advance, and leaves the offset alone", () => {
	withLedger((db) => {
		assert.deepEqual(commitInboxBatch(db, { bot_id: BOT_ID, entries: [] }), {
			inserted: 0,
			replayed: 0,
			nextUpdateId: null,
		});
		assert.equal(persistedOffset(db), null);
	});
});

test("a batch the schema refuses leaves nothing behind, not even the entries already written", () => {
	withLedger((db) => {
		commitInboxBatch(db, { bot_id: BOT_ID, entries: [admitted(updateInput(101, "eid-101"), "thread-1")] });
		const committed = tableCounts(db);

		// A real SQLite fault inside the transaction: the second entry reuses the first's `eid`, and
		// `UNIQUE (project_id, eid)` — the `seen_eids` index — is what refuses it. At that point the first
		// entry's update row, thread and audit rows are already written, and the offset advance has not run.
		assert.throws(
			() =>
				commitInboxBatch(db, {
					bot_id: BOT_ID,
					entries: [admitted(updateInput(301, "eid-shared"), "thread-9"), admitted(updateInput(302, "eid-shared"), "thread-10")],
				}),
			(error: unknown) => (error as { errcode?: number }).errcode === SQLITE_CONSTRAINT_UNIQUE,
		);

		// All or nothing: the batch rolled back, so the ledger is exactly as the previous commit left it.
		assert.deepEqual(tableCounts(db), committed);
		assert.equal(persistedOffset(db), 102);
	});
});

test("a refused batch takes the thread rows it had already written with it", () => {
	withLedger((db) => {
		// The observable half of the spec's "writes `threads` inside one transaction": the entry whose thread
		// was written is the FIRST one, and the throw comes from the one after it, so a writer that put the
		// thread rows outside the batch would leave `thread-1` standing while the batch rolled back.
		assert.throws(
			() =>
				commitInboxBatch(db, {
					bot_id: BOT_ID,
					entries: [admitted(updateInput(311, "eid-311"), "thread-1"), admitted(updateInput(312, "eid-311"), "thread-2")],
				}),
			(error: unknown) => (error as { errcode?: number }).errcode === SQLITE_CONSTRAINT_UNIQUE,
		);

		assert.deepEqual(readThreadRecord(db, PROJECT_ID, "thread-1"), undefined);
		assert.deepEqual(tableCounts(db), { updates: 0, threads: 0, thread_history: 0, audit_log: 0 });
	});
});

test("one identity carried twice in one batch is refused, not counted as a replay", () => {
	withLedger((db) => {
		// A cross-batch replay is the PT-10 case and is counted; this is the OTHER case, and the distinction is
		// the counter's meaning. Skipping the second entry whole — which is what the replay path does — would
		// discard `eid-B`, its thread row and its audit rows with nothing left saying it was ever seen.
		assert.throws(
			() =>
				commitInboxBatch(db, {
					bot_id: BOT_ID,
					entries: [admitted(updateInput(101, "eid-a"), "thread-1"), admitted(updateInput(101, "eid-b"), "thread-2")],
				}),
			(error: unknown) => (error as Error).message === INBOX_DUPLICATE_UPDATE_ID_MESSAGE,
		);

		assert.deepEqual(tableCounts(db), { updates: 0, threads: 0, thread_history: 0, audit_log: 0 });
		assert.equal(persistedOffset(db), null);
	});
});

test("a dropped entry and an admitted entry may not share one update_id either", () => {
	withLedger((db) => {
		// The identity is the entry's, not the admitted row's: a batch that admitted an update and also
		// reported it dropped would otherwise advance the offset over a conflict with nothing to show.
		assert.throws(
			() =>
				commitInboxBatch(db, {
					bot_id: BOT_ID,
					entries: [admitted(updateInput(401, "eid-a"), "thread-1"), { kind: "dropped", update_id: 401, audits: [] }],
				}),
			(error: unknown) => (error as Error).message === INBOX_DUPLICATE_UPDATE_ID_MESSAGE,
		);

		assert.deepEqual(tableCounts(db), { updates: 0, threads: 0, thread_history: 0, audit_log: 0 });
	});
});

test("an older batch cannot rewind the offset, and the value reported is the ledger's, not the writer's arithmetic", () => {
	withLedger((db) => {
		// The ledger is already at 501 — a window Telegram re-served after a restart arrives below it. The
		// writer computed 102 for this batch, so the two candidates differ and the test can tell them apart:
		// a writer that echoed its own arithmetic would answer 102 and leave the promise about the range broken.
		commitInboxBatch(db, { bot_id: BOT_ID, entries: [admitted(updateInput(500, "eid-500"), "thread-seed")] });
		assert.equal(persistedOffset(db), 501);

		const result = commitInboxBatch(db, { bot_id: BOT_ID, entries: [admitted(updateInput(101, "eid-101"), "thread-1")] });

		assert.deepEqual(result, { inserted: 1, replayed: 0, nextUpdateId: 501 });
		assert.equal(persistedOffset(db), 501);
		// The row itself still landed: what did not move is the offset, which is the point.
		assert.equal(tableCounts(db).updates, 2);
	});
});

test("updates.body is NULL for rejected and ignored, and kept for not_mine and noted", () => {
	withLedger((db) => {
		const outcomes = [
			{ update_id: 401, eid: "eid-rejected", apply_outcome: "rejected", body: null },
			{ update_id: 402, eid: "eid-ignored", apply_outcome: "ignored", body: null },
			{ update_id: 403, eid: "eid-not-mine", apply_outcome: "not_mine", body: "kept for not_mine" },
			{ update_id: 404, eid: "eid-noted", apply_outcome: "noted", body: "kept for noted" },
		] as const;

		commitInboxBatch(db, {
			bot_id: BOT_ID,
			entries: outcomes.map((row) => ({ kind: "admitted", update: updateInput(row.update_id, row.eid, { apply_outcome: row.apply_outcome, body: row.body }) })),
		});

		// `node:sqlite` hands rows back as null-prototype objects, so each field is read out rather than the
		// row being compared to a literal.
		const stored = (db.prepare("SELECT eid, body FROM updates ORDER BY update_id").all() as { eid: string; body: string | null }[]).map(
			(row) => ({ eid: row.eid, body: row.body }),
		);
		assert.deepEqual(stored, [
			{ eid: "eid-rejected", body: null },
			{ eid: "eid-ignored", body: null },
			{ eid: "eid-not-mine", body: "kept for not_mine" },
			{ eid: "eid-noted", body: "kept for noted" },
		]);
	});
});

test("the writer refuses a bodied row for `rejected` and for `ignored` alike, and writes nothing", () => {
	withLedger((db) => {
		// Both bodiless outcomes, not just the one the first draft happened to pick: D-20's rule is an
		// equivalence, so a writer that refused one outcome and stored the other would still be wrong, and this
		// loop is what makes that visible. (The first draft's name said `rejected` while its only fixture was
		// `ignored`, so the `rejected` half was unpinned until Judgment Day round 1 pointed at it.)
		for (const apply_outcome of ["rejected", "ignored"] as const) {
			assert.throws(
				() =>
					commitInboxBatch(db, {
						bot_id: BOT_ID,
						entries: [
							admitted(updateInput(501, "eid-501"), "thread-1"),
							{
								kind: "admitted",
								update: updateInput(502, `eid-502-${apply_outcome}`, { apply_outcome, body: "a body that must not survive" }),
							},
						],
					}),
				(error: unknown) => (error as Error).message === INBOX_BODY_OUTCOME_MISMATCH_MESSAGE,
			);

			assert.deepEqual(tableCounts(db), { updates: 0, threads: 0, thread_history: 0, audit_log: 0 });
		}
	});
});

test("the writer refuses a kept-body outcome with a null body", () => {
	withLedger((db) => {
		assert.throws(
			() =>
				commitInboxBatch(db, {
					bot_id: BOT_ID,
					entries: [{ kind: "admitted", update: updateInput(601, "eid-601", { apply_outcome: "noted", body: null }) }],
				}),
			(error: unknown) => (error as Error).message === INBOX_BODY_OUTCOME_MISMATCH_MESSAGE,
		);

		assert.equal(tableCounts(db).updates, 0);
	});
});

test("an audit row keeps every column it was handed", () => {
	withLedger((db) => {
		commitInboxBatch(db, {
			bot_id: BOT_ID,
			entries: [
				{
					kind: "dropped",
					update_id: 701,
					audits: [
						auditRow({
							ts: "2026-02-03T04:05:06.000Z",
							chat_id: -1001234567890,
							client_id: "client-7",
							direction: "reject",
							eid: "eid-foreign",
							envelope_type: "REQUEST",
							from_user_id: 444,
							to_user_id: 555,
							outcome: "rejected",
							reason: "foreign_chat",
						}),
					],
				},
			],
		});

		const row = db.prepare("SELECT * FROM audit_log").get() as Record<string, unknown>;
		assert.equal(row.ts, "2026-02-03T04:05:06.000Z");
		assert.equal(row.project_id, PROJECT_ID);
		assert.equal(row.bot_id, BOT_ID);
		assert.equal(row.chat_id, -1001234567890);
		assert.equal(row.client_id, "client-7");
		assert.equal(row.direction, "reject");
		assert.equal(row.eid, "eid-foreign");
		assert.equal(row.from_user_id, 444);
		assert.equal(row.to_user_id, 555);
		assert.equal(row.outcome, "rejected");
		assert.equal(row.reason, "foreign_chat");
		// The table has no body column at all, so "no body in the audit log" (PT-20) is a property of the
		// schema rather than of this writer; the assertion is here so a future column cannot be added
		// silently.
		assert.equal("body" in row, false);
	});
});

test("a replayed drop is audited again, because (bot_id, update_id) leaves no row to dedup it against", () => {
	withLedger((db) => {
		const entries: InboxBatchEntry[] = [{ kind: "dropped", update_id: 801, audits: [auditRow({ eid: "eid-foreign" })] }];

		commitInboxBatch(db, { bot_id: BOT_ID, entries });
		const result = commitInboxBatch(db, { bot_id: BOT_ID, entries });

		// Disclosed rather than hidden: PT-10's dedup key is `(bot_id, update_id)`, and a DROPPED update
		// writes no `updates` row, so the key has nothing to match and the second poll appends a second
		// honest record of having seen it. Nothing is surfaced twice — `inserted` is 0 — and the audit log
		// is append-only by design.
		assert.deepEqual(result, { inserted: 0, replayed: 0, nextUpdateId: 802 });
		assert.equal(tableCounts(db).audit_log, 2);
	});
});

test("the thread a batch admits is written, on the batch's own connection", () => {
	withLedger((db) => {
		// Re-titled after Judgment Day round 1: the name this test carried ("…inside the same transaction")
		// claimed more than the test can see. The thread write happens inside the batch's transaction, but a
		// writer that deferred it until after `withTransaction` returned leaves every assertion here passing
		// too, so the *position* is a claim of the design and the module rather than one this test can fail on.
		// What IS observable is the atomicity, and `a refused batch takes the thread rows it had already
		// written with it` in this file pins exactly that.
		commitInboxBatch(db, { bot_id: BOT_ID, entries: [admitted(updateInput(901, "eid-901"), "thread-1")] });

		const thread = db.prepare("SELECT body, project_id FROM threads WHERE thread_id = ?").get("thread-1") as {
			body: string;
			project_id: string;
		};
		assert.equal(thread.body, "opening of thread-1");
		assert.equal(thread.project_id, PROJECT_ID);
	});
});

test("the thread adapter opens no transaction of its own, so it composes inside one", () => {
	withLedger((db) => {
		// Called from INSIDE a transaction this suite opened. `withTransaction` refuses a nested call, so an
		// adapter that opened one of its own would throw here rather than store the row — which is what makes
		// this test able to fail for the reason its name gives, instead of merely observing that a direct call
		// lands. (Judgment Day round 1 measured that the earlier version could not: wrapping the adapter in
		// `withTransaction` left it passing, with the seven inbox tests absorbing the failure instead.)
		withTransaction(db, () => {
			writeThreadRecord(db, {
				project_id: PROJECT_ID,
				thread_id: "thread-direct",
				record: threadRecord("written inside the caller's transaction"),
				updated_at: RECEIVED_AT,
			});
		});

		assert.equal(
			(db.prepare("SELECT body FROM threads WHERE thread_id = ?").get("thread-direct") as { body: string }).body,
			"written inside the caller's transaction",
		);
	});
});
