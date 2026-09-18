import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { appendAuditRow } from "../../src/ledger/audit.js";
import { readCondition } from "../../src/ledger/conditions-store.js";
import { ensureClientCursor, markThreadsSurfaced } from "../../src/ledger/cursors.js";
import { commitInboxBatch, type InboxUpdateInput } from "../../src/ledger/inbox.js";
import { openLedger } from "../../src/ledger/open.js";
import {
	isRetentionSweepDue,
	RETENTION_INSTANT_INVALID_MESSAGE,
	sweepRetention,
} from "../../src/ledger/retention.js";
import { writeThreadRecord } from "../../src/ledger/threads.js";
import { upsertUnknownSender } from "../../src/ledger/unknown-senders.js";
import {
	AUDIT_RETENTION_DAYS,
	CLIENT_SESSION_STALE_HOURS,
	INBOX_RETENTION_DAYS,
	MAX_THREAD_HISTORY,
	OPEN_THREAD_BACKLOG_THRESHOLD,
	RESOLVED_THREAD_RETENTION_DAYS,
	RETENTION_SWEEP_INTERVAL_HOURS,
	UNKNOWN_SENDER_RETENTION_DAYS,
} from "../../src/shared/constants.js";
import type { ThreadRecord } from "../../src/shared/thread-record.js";

/**
 * The retention sweep (`ledger/retention.ts`, design §5.4, the `ledger` spec's third requirement).
 *
 * The requirement has four parts and this suite pins all four: **every window is a named constant** (its
 * value is pinned in `test/shared/constants.test.ts`; here each window is exercised at its own edge), **the
 * sweep runs on `RETENTION_SWEEP_INTERVAL_HOURS`**, **rows older than a window go and rows younger survive**
 * — per table, with the tables' windows differing so a single shared window cannot pass — and **open threads
 * are never pruned, only reported** (`open_thread_backlog` past `OPEN_THREAD_BACKLOG_THRESHOLD`).
 *
 * Three things this suite pins that the requirement states indirectly, and says why:
 *
 * - **The windows are strict.** "Older than" excludes the edge, so a row stamped exactly on its window
 *   survives and one millisecond older dies. Both sides are asserted, because a sweep written with `<=`
 *   or with the window measured from the wrong instant passes a one-sided test.
 * - **The cascades are the ones the DDL declares.** A swept cursor takes its `client_surfaced` rows and a
 *   swept thread takes its `thread_history`, both through `ON DELETE CASCADE` with `foreign_keys` on — and
 *   the result reports those rows as deletions, not as history trims.
 * - **`thread_history`'s cap is enforced by the sweep as well as by the writer.** The `ledger` spec's
 *   scenario says "the daemon prunes it, not the `thread` tool truncating its response", and design §5.4
 *   puts the cap on the appender; the sweep's own pass is what holds for rows no writer route produced
 *   (this suite seeds them with raw SQL, which is exactly that case).
 *
 * Real `node:sqlite` over a temp file opened through `ledger/open.ts`, rows aged with real instants, and
 * every value a placeholder (AGENTS.md §3).
 */

const BOT_ID = 900000001;
const PROJECT_ID = "project-a";
const OTHER_PROJECT_ID = "project-b";
const NOW = "2026-06-01T12:00:00.000Z";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** An instant `days` before {@link NOW}, as ISO 8601 — the format every stored instant uses. */
function daysBefore(days: number): string {
	return new Date(Date.parse(NOW) - days * MS_PER_DAY).toISOString();
}

/** An instant `hours` before {@link NOW}. */
function hoursBefore(hours: number): string {
	return new Date(Date.parse(NOW) - hours * MS_PER_HOUR).toISOString();
}

/** One millisecond before `instant` — the smallest step past a window's edge. */
function justBefore(instant: string): string {
	return new Date(Date.parse(instant) - 1).toISOString();
}

/** A temp home, an open ledger plus its path, and the cleanup — the harness every test shares. */
function withLedger(run: (db: DatabaseSync, path: string) => void): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-ledger-"));
	const ledger = openLedger({ homeDir: home });
	try {
		run(ledger.db, ledger.path);
	} finally {
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

/** One admitted `updates` row that touched no thread, at a chosen instant. */
function updateInput(updateId: number, eid: string, receivedAt: string): InboxUpdateInput {
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
		// `not_mine` stores a body and no thread row, so these fixtures are inbox rows and nothing else.
		apply_outcome: "not_mine",
		received_at: receivedAt,
	};
}

/** Writes one `updates` row through the real batch path. */
function seedUpdate(db: DatabaseSync, updateId: number, eid: string, receivedAt: string): void {
	commitInboxBatch(db, { bot_id: BOT_ID, entries: [{ kind: "admitted", update: updateInput(updateId, eid, receivedAt) }] });
}

/** Writes one `audit_log` row through the shared writer; `reason` doubles as the fixture's label. */
function seedAuditRow(db: DatabaseSync, ts: string, reason: string): void {
	appendAuditRow(db, {
		ts,
		project_id: PROJECT_ID,
		bot_id: BOT_ID,
		chat_id: null,
		client_id: null,
		direction: "system",
		eid: null,
		envelope_type: null,
		from_user_id: null,
		to_user_id: null,
		outcome: "ok",
		reason,
	});
}

/** A `ThreadRecord` with the fields a case is not about taken from a placeholder. */
function threadRecord(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
	return {
		status: "open",
		opened_type: "REQUEST",
		opened_eid: "eid-opened",
		from: "@alice-agent",
		to: "@bob-agent",
		body: "opening",
		opened_at: NOW,
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
		...overrides,
	};
}

/** Writes one thread row through the real adapter, so the fixture is a row the daemon could have made. */
function seedThread(db: DatabaseSync, threadId: string, record: ThreadRecord, updatedAt: string, projectId = PROJECT_ID): void {
	writeThreadRecord(db, { project_id: projectId, thread_id: threadId, record, updated_at: updatedAt });
}

/** Seeds one resolved thread whose closure is stamped `at`. */
function seedResolvedThread(db: DatabaseSync, threadId: string, at: string, history: readonly string[] = []): void {
	const entries = history.map((eid) => ({ eid, type: "REQUEST", from: "@bob-agent", body: eid, at, via: "group" as const }));
	seedThread(db, threadId, threadRecord({ status: "resolved", resolved_at: at, resolved_by: "@bob-agent", basis: "accepted", history: entries }), at);
}

/** Seeds one open thread, as old as the case wants, with a recent-looking `awaiting` unless said otherwise. */
function seedOpenThread(db: DatabaseSync, threadId: string, ageDays: number, projectId = PROJECT_ID): void {
	const at = daysBefore(ageDays);
	seedThread(db, threadId, threadRecord({ opened_at: at, awaiting: "@bob-agent" }), at, projectId);
}

/** The `eid` values of the stored inbox rows, oldest first — so a survivor list is readable in an assertion. */
function updateEids(db: DatabaseSync): string[] {
	return (db.prepare("SELECT eid FROM updates ORDER BY seq").all() as unknown as { eid: string }[]).map((row) => row.eid);
}

/** One column's values, for the tables whose surviving rows the assertions name. */
function column(db: DatabaseSync, table: string, where: string, key: string): (string | number)[] {
	return (db.prepare(`SELECT ${key} AS value FROM ${table} ${where} ORDER BY value`).all() as unknown as { value: string | number }[]).map(
		(row) => row.value,
	);
}

test("the sweep removes rows past each window and keeps everything younger, window by window", () => {
	withLedger((db) => {
		// Five tables with five different windows, each holding one row past its window, one row inside it,
		// and — for the audit log — one row that is past the INBOX window and well inside the AUDIT window,
		// which is the row a single shared window would delete by mistake.
		seedUpdate(db, 1, "eid-old", daysBefore(INBOX_RETENTION_DAYS + 1));
		seedUpdate(db, 2, "eid-young", daysBefore(INBOX_RETENTION_DAYS - 1));
		seedAuditRow(db, daysBefore(AUDIT_RETENTION_DAYS + 1), "audit-old");
		seedAuditRow(db, daysBefore(AUDIT_RETENTION_DAYS - 1), "audit-young");
		seedAuditRow(db, daysBefore(INBOX_RETENTION_DAYS + 1), "audit-past-inbox-window");
		upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 101, username: null, seen_at: daysBefore(UNKNOWN_SENDER_RETENTION_DAYS + 1) });
		upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 102, username: null, seen_at: daysBefore(UNKNOWN_SENDER_RETENTION_DAYS - 1) });
		ensureClientCursor(db, { client_id: "client-old", project_id: PROJECT_ID, started_at: hoursBefore(CLIENT_SESSION_STALE_HOURS + 1), now: hoursBefore(CLIENT_SESSION_STALE_HOURS + 1) });
		ensureClientCursor(db, { client_id: "client-young", project_id: PROJECT_ID, started_at: hoursBefore(CLIENT_SESSION_STALE_HOURS - 1), now: hoursBefore(CLIENT_SESSION_STALE_HOURS - 1) });
		seedResolvedThread(db, "thread-old", daysBefore(RESOLVED_THREAD_RETENTION_DAYS + 1));
		seedResolvedThread(db, "thread-young", daysBefore(RESOLVED_THREAD_RETENTION_DAYS - 1));

		const result = sweepRetention(db, { now: NOW });

		assert.deepEqual(result, {
			updatesDeleted: 1,
			auditRowsDeleted: 1,
			unknownSendersDeleted: 1,
			clientCursorsDeleted: 1,
			resolvedThreadsDeleted: 1,
			historyEntriesTrimmed: 0,
			backlogRaised: [],
			backlogCleared: [],
		});

		assert.deepEqual(updateEids(db), ["eid-young"]);
		assert.deepEqual(column(db, "audit_log", "", "reason"), ["audit-past-inbox-window", "audit-young"]);
		assert.deepEqual(column(db, "unknown_senders", "", "user_id"), [102]);
		assert.deepEqual(column(db, "client_cursors", "", "client_id"), ["client-young"]);
		assert.deepEqual(column(db, "threads", "", "thread_id"), ["thread-young"]);
	});
});

test("each window's edge is strict: a row exactly on it survives, one millisecond older does not", () => {
	withLedger((db) => {
		seedUpdate(db, 1, "eid-edge", daysBefore(INBOX_RETENTION_DAYS));
		seedUpdate(db, 2, "eid-past-edge", justBefore(daysBefore(INBOX_RETENTION_DAYS)));
		seedAuditRow(db, daysBefore(AUDIT_RETENTION_DAYS), "audit-edge");
		seedAuditRow(db, justBefore(daysBefore(AUDIT_RETENTION_DAYS)), "audit-past-edge");
		upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 101, username: null, seen_at: daysBefore(UNKNOWN_SENDER_RETENTION_DAYS) });
		upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 102, username: null, seen_at: justBefore(daysBefore(UNKNOWN_SENDER_RETENTION_DAYS)) });
		ensureClientCursor(db, { client_id: "client-edge", project_id: PROJECT_ID, started_at: hoursBefore(CLIENT_SESSION_STALE_HOURS), now: hoursBefore(CLIENT_SESSION_STALE_HOURS) });
		ensureClientCursor(db, { client_id: "client-past-edge", project_id: PROJECT_ID, started_at: justBefore(hoursBefore(CLIENT_SESSION_STALE_HOURS)), now: justBefore(hoursBefore(CLIENT_SESSION_STALE_HOURS)) });
		seedResolvedThread(db, "thread-edge", daysBefore(RESOLVED_THREAD_RETENTION_DAYS));
		seedResolvedThread(db, "thread-past-edge", justBefore(daysBefore(RESOLVED_THREAD_RETENTION_DAYS)));

		const result = sweepRetention(db, { now: NOW });

		assert.equal(result.updatesDeleted, 1);
		assert.equal(result.auditRowsDeleted, 1);
		assert.equal(result.unknownSendersDeleted, 1);
		assert.equal(result.clientCursorsDeleted, 1);
		assert.equal(result.resolvedThreadsDeleted, 1);
		assert.deepEqual(updateEids(db), ["eid-edge"]);
		assert.deepEqual(column(db, "audit_log", "", "reason"), ["audit-edge"]);
		assert.deepEqual(column(db, "unknown_senders", "", "user_id"), [101]);
		assert.deepEqual(column(db, "client_cursors", "", "client_id"), ["client-edge"]);
		assert.deepEqual(column(db, "threads", "", "thread_id"), ["thread-edge"]);
	});
});

test("the DDL's cascades hold: a swept cursor takes its surfaced rows and a swept thread its history", () => {
	withLedger((db) => {
		ensureClientCursor(db, { client_id: "client-old", project_id: PROJECT_ID, started_at: hoursBefore(CLIENT_SESSION_STALE_HOURS + 1), now: hoursBefore(CLIENT_SESSION_STALE_HOURS + 1) });
		ensureClientCursor(db, { client_id: "client-young", project_id: PROJECT_ID, started_at: NOW, now: NOW });
		markThreadsSurfaced(db, "client-old", ["thread-1", "thread-2"], hoursBefore(30));
		markThreadsSurfaced(db, "client-young", ["thread-1"], NOW);
		seedResolvedThread(db, "thread-old", daysBefore(RESOLVED_THREAD_RETENTION_DAYS + 1), ["history-1", "history-2"]);
		seedResolvedThread(db, "thread-young", daysBefore(RESOLVED_THREAD_RETENTION_DAYS - 1), ["history-3", "history-4"]);

		const result = sweepRetention(db, { now: NOW });

		assert.equal(result.clientCursorsDeleted, 1);
		assert.equal(result.resolvedThreadsDeleted, 1);
		// The cascade removed those history rows; they are not this module's trims, and a result that counted
		// them as trims would report work the cap did not do.
		assert.equal(result.historyEntriesTrimmed, 0);

		assert.deepEqual(column(db, "client_surfaced", "", "client_id"), ["client-young"]);
		assert.deepEqual(column(db, "thread_history", "", "thread_id"), ["thread-young", "thread-young"]);
	});
});

test("open threads are never pruned, at any age, and their history survives with them", () => {
	withLedger((db) => {
		seedOpenThread(db, "thread-ancient", 400);
		seedThread(
			db,
			"thread-contradictory",
			// Status governs, not `resolved_at`: a row that says open is open, and its closure stamp (however
			// stale) is not this sweep's business.
			threadRecord({ status: "open", resolved_at: daysBefore(400), acked_at: daysBefore(400) }),
			daysBefore(400),
		);
		seedResolvedThread(db, "thread-resolved-old", daysBefore(RESOLVED_THREAD_RETENTION_DAYS + 1), ["history-1"]);

		const result = sweepRetention(db, { now: NOW });

		assert.equal(result.resolvedThreadsDeleted, 1);
		assert.deepEqual(column(db, "threads", "", "thread_id"), ["thread-ancient", "thread-contradictory"]);
		// The surviving rows' history went with them, and the one deleted thread took its history: the table
		// is empty here because nothing else had any.
		assert.deepEqual(column(db, "thread_history", "", "eid"), []);
	});
});

test("thread_history is capped by the sweep itself, keeping the newest entries of each thread", () => {
	withLedger((db) => {
		seedOpenThread(db, "thread-over", 1);
		seedOpenThread(db, "thread-exact", 1);
		// Raw SQL on purpose: these are rows no writer route produced, which is exactly the case the sweep's
		// own pass exists for (`threads.ts` trims on append, design §5.4).
		const insert = db.prepare(
			"INSERT INTO thread_history (project_id, thread_id, eid, type, from_agent_id, body, at, via) VALUES (?, ?, ?, 'REQUEST', '@bob-agent', ?, ?, 'group')",
		);
		for (let i = 1; i <= MAX_THREAD_HISTORY + 10; i += 1) {
			const pad = String(i).padStart(2, "0");
			insert.run(PROJECT_ID, "thread-over", `h-${pad}`, `body ${pad}`, daysBefore(MAX_THREAD_HISTORY + 10 - i));
		}
		for (let i = 1; i <= MAX_THREAD_HISTORY; i += 1) {
			const pad = String(i).padStart(2, "0");
			insert.run(PROJECT_ID, "thread-exact", `h-${pad}`, `body ${pad}`, daysBefore(MAX_THREAD_HISTORY - i));
		}

		const result = sweepRetention(db, { now: NOW });

		assert.equal(result.historyEntriesTrimmed, 10, "the ten oldest entries of the over-long thread");
		const over = (db.prepare("SELECT eid FROM thread_history WHERE thread_id = 'thread-over' ORDER BY eid").all() as unknown as { eid: string }[]).map((row) => row.eid);
		assert.equal(over.length, MAX_THREAD_HISTORY);
		assert.equal(over[0], "h-11", "the newest MAX_THREAD_HISTORY entries are the ones that stay");
		assert.equal(over[over.length - 1], `h-${MAX_THREAD_HISTORY + 10}`);
		// The boundary on the other side: exactly at the cap, nothing is trimmed.
		assert.equal((db.prepare("SELECT COUNT(*) AS n FROM thread_history WHERE thread_id = 'thread-exact'").get() as { n: number }).n, MAX_THREAD_HISTORY);
	});
});

test("the backlog condition is raised past the threshold and cleared when the backlog drops", () => {
	withLedger((db) => {
		for (let i = 0; i <= OPEN_THREAD_BACKLOG_THRESHOLD; i += 1) {
			seedOpenThread(db, `thread-a-${i}`, 1);
		}
		for (let i = 0; i < OPEN_THREAD_BACKLOG_THRESHOLD; i += 1) {
			seedOpenThread(db, `thread-b-${i}`, 1, OTHER_PROJECT_ID);
		}

		const raised = sweepRetention(db, { now: NOW });

		// One over the threshold raises, exactly at it does not: the wire shape carries the count, so the
		// boundary is the whole difference between "report" and "report too early".
		assert.deepEqual(raised.backlogRaised, [PROJECT_ID]);
		assert.deepEqual(raised.backlogCleared, []);
		assert.deepEqual(readCondition(db, PROJECT_ID, "open_thread_backlog")?.detail, { count: OPEN_THREAD_BACKLOG_THRESHOLD + 1 });
		assert.equal(readCondition(db, PROJECT_ID, "open_thread_backlog")?.since, NOW);
		assert.equal(readCondition(db, OTHER_PROJECT_ID, "open_thread_backlog"), undefined);

		// Reporting is not pruning: every open thread is still there.
		assert.equal((db.prepare("SELECT COUNT(*) AS n FROM threads WHERE status = 'open'").get() as { n: number }).n, OPEN_THREAD_BACKLOG_THRESHOLD * 2 + 1);

		// Resolve one of them, and the project falls back to the threshold.
		seedThread(db, "thread-a-0", threadRecord({ status: "resolved", resolved_at: NOW, resolved_by: "@bob-agent", basis: "accepted" }), NOW);
		const cleared = sweepRetention(db, { now: new Date(Date.parse(NOW) + MS_PER_HOUR).toISOString() });

		assert.deepEqual(cleared.backlogCleared, [PROJECT_ID]);
		assert.deepEqual(cleared.backlogRaised, []);
		assert.equal(readCondition(db, PROJECT_ID, "open_thread_backlog"), undefined);
	});
});

test("the sweep's schedule: never swept is due, before the interval is not, at the interval it is", () => {
	assert.equal(isRetentionSweepDue(null, NOW), true, "a daemon that has never swept sweeps at its first beat");
	assert.equal(isRetentionSweepDue(hoursBefore(RETENTION_SWEEP_INTERVAL_HOURS / 2), NOW), false);
	assert.equal(isRetentionSweepDue(hoursBefore(RETENTION_SWEEP_INTERVAL_HOURS), NOW), true, "the interval is inclusive");
	assert.equal(isRetentionSweepDue(hoursBefore(RETENTION_SWEEP_INTERVAL_HOURS * 3), NOW), true);
	assert.equal(isRetentionSweepDue(new Date(Date.parse(NOW) + MS_PER_HOUR).toISOString(), NOW), false, "a stamp from the future is not due");

	assert.throws(
		() => isRetentionSweepDue("the last sweep", NOW),
		(error: unknown) => error instanceof Error && error.message === RETENTION_INSTANT_INVALID_MESSAGE,
	);
	assert.throws(
		() => isRetentionSweepDue(null, "now"),
		(error: unknown) => error instanceof Error && error.message === RETENTION_INSTANT_INVALID_MESSAGE,
	);
});

test("the sweep deletes rows and never a file: the ledger is still there and nothing was quarantined", () => {
	withLedger((db, path) => {
		seedUpdate(db, 1, "eid-old", daysBefore(INBOX_RETENTION_DAYS + 1));
		const home = dirname(path);

		sweepRetention(db, { now: NOW });

		const listing = readdirSync(home);
		assert.ok(listing.includes("ledger.db"), "the sweep reads and writes rows, never the file");
		assert.equal(listing.some((name) => name.startsWith("ledger.corrupt-")), false, "a sweep is not a quarantine");
		assert.equal(
			listing.some((name) => !name.startsWith("ledger.db")),
			false,
			"the home holds the ledger and its WAL siblings and nothing else",
		);
	});
});
