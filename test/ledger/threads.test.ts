import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { openLedger } from "../../src/ledger/open.js";
import { readThreadRecord, writeThreadRecord } from "../../src/ledger/threads.js";
import { MAX_THREAD_HISTORY } from "../../src/shared/constants.js";
import type { HistoryEntry, ThreadRecord } from "../../src/shared/thread-record.js";

/**
 * The `ThreadRecord` adapter (design §8.2 step 7): the `threads` + `thread_history` tables read back as
 * the record `shared/protocol-apply.ts` consumes, and written back as the rows that hold it.
 *
 * Real `node:sqlite` over a temp file per test (design §15's Ledger layer), opened through
 * `ledger/open.ts` so the connection carries the pragmas the writer depends on — `foreign_keys = ON`
 * among them, which is what makes `thread_history`'s FK real and the history reconciliation observable.
 *
 * Every value here is a placeholder (AGENTS.md §3): synthetic bot, chat, user, project and thread ids,
 * none shaped like a credential.
 */

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

/** One history entry, with the fields a case is not about taken from a placeholder. */
function historyEntry(eid: string, at: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
	return { eid, type: "REPLY", from: "@alice-agent", body: `body of ${eid}`, at, via: "group", ...overrides };
}

/** A complete `ThreadRecord`, so no case can pass by leaving a column at its SQL default. */
function threadRecord(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
	return {
		status: "open",
		opened_type: "REQUEST",
		opened_eid: "eid-open-1",
		from: "@alice-agent",
		to: "@bob-agent",
		body: "the opening body",
		opened_at: "2026-01-01T00:00:00.000Z",
		opened_message_id: 11,
		via: "group",
		acked_at: null,
		ack_count: 0,
		resolved_at: null,
		resolved_by: null,
		basis: null,
		to_user_id: 222,
		group_message_id: 11,
		closure_delivered: false,
		awaiting: "@bob-agent",
		history: [],
		...overrides,
	};
}

/** Every stored `thread_history` eid for one thread, in the order the adapter reads them back. */
function storedHistoryEids(db: DatabaseSync, projectId: string, threadId: string): string[] {
	return (
		db
			.prepare("SELECT eid FROM thread_history WHERE project_id = ? AND thread_id = ? ORDER BY at, eid")
			.all(projectId, threadId) as { eid: string }[]
	).map((row) => row.eid);
}

/** One scalar out of the `threads` row, for the columns `ThreadRecord` has no field for. */
function threadColumn(db: DatabaseSync, projectId: string, threadId: string, column: string): SQLInputValue {
	const row = db
		.prepare(`SELECT ${column} AS value FROM threads WHERE project_id = ? AND thread_id = ?`)
		.get(projectId, threadId) as { value: SQLInputValue } | undefined;
	return row?.value ?? null;
}

test("readThreadRecord answers undefined for a thread this ledger never saw", () => {
	withLedger((db) => {
		assert.equal(readThreadRecord(db, "project-a", "thread-1"), undefined);
	});
});

test("a record survives the round trip, column for column", () => {
	withLedger((db) => {
		const record = threadRecord({
			status: "resolved",
			opened_type: "REQUEST",
			from: "@carol-agent",
			to: null,
			to_user_id: null,
			group_message_id: null,
			closure_delivered: true,
			acked_at: "2026-01-01T01:00:00.000Z",
			ack_count: 2,
			resolved_at: "2026-01-02T00:00:00.000Z",
			resolved_by: "@bob-agent",
			basis: "peer-confirmed",
			awaiting: null,
			history: [historyEntry("eid-reply-1", "2026-01-01T01:00:00.000Z")],
		});

		writeThreadRecord(db, { project_id: "project-a", thread_id: "thread-1", record, updated_at: "2026-01-02T00:00:00.000Z" });

		assert.deepEqual(readThreadRecord(db, "project-a", "thread-1"), record);
	});
});

test("closure_delivered is a boolean in the record and an integer in the row", () => {
	withLedger((db) => {
		const record = threadRecord({ closure_delivered: false });
		writeThreadRecord(db, { project_id: "project-a", thread_id: "thread-1", record, updated_at: "2026-01-01T00:00:00.000Z" });

		// The record answers `false` — not `0` — so a caller writing `=== false` is not surprised, and the
		// column is STRICT INTEGER, so the round trip has to convert in both directions.
		assert.equal(readThreadRecord(db, "project-a", "thread-1")?.closure_delivered, false);
		assert.equal(threadColumn(db, "project-a", "thread-1", "closure_delivered"), 0);
	});
});

test("updated_at is stamped from the caller, because ThreadRecord has no field for it", () => {
	withLedger((db) => {
		writeThreadRecord(db, {
			project_id: "project-a",
			thread_id: "thread-1",
			record: threadRecord(),
			updated_at: "2026-03-04T05:06:07.000Z",
		});

		assert.equal(threadColumn(db, "project-a", "thread-1", "updated_at"), "2026-03-04T05:06:07.000Z");
	});
});

test("writing an existing thread updates the row instead of adding a second one", () => {
	withLedger((db) => {
		const write = (record: ThreadRecord) =>
			writeThreadRecord(db, { project_id: "project-a", thread_id: "thread-1", record, updated_at: "2026-01-01T00:00:00.000Z" });

		write(threadRecord());
		write(threadRecord({ status: "resolved", awaiting: null, resolved_at: "2026-01-03T00:00:00.000Z", resolved_by: "@bob-agent", closure_delivered: true }));

		const rows = db.prepare("SELECT COUNT(*) AS n FROM threads WHERE project_id = ? AND thread_id = ?").get("project-a", "thread-1");
		assert.equal((rows as { n: number }).n, 1);
		assert.equal(readThreadRecord(db, "project-a", "thread-1")?.status, "resolved");
	});
});

test("the same thread_id under two projects is two threads, and neither read sees the other", () => {
	withLedger((db) => {
		writeThreadRecord(db, {
			project_id: "project-a",
			thread_id: "thread-1",
			record: threadRecord({ body: "in project A" }),
			updated_at: "2026-01-01T00:00:00.000Z",
		});
		writeThreadRecord(db, {
			project_id: "project-b",
			thread_id: "thread-1",
			record: threadRecord({ body: "in project B" }),
			updated_at: "2026-01-01T00:00:00.000Z",
		});

		assert.equal(readThreadRecord(db, "project-a", "thread-1")?.body, "in project A");
		assert.equal(readThreadRecord(db, "project-b", "thread-1")?.body, "in project B");
	});
});

test("the stored history is the record's own array, in its own order", () => {
	withLedger((db) => {
		const history = [
			historyEntry("eid-reply-1", "2026-01-01T01:00:00.000Z"),
			historyEntry("eid-reply-2", "2026-01-01T02:00:00.000Z"),
			historyEntry("eid-reply-3", "2026-01-01T03:00:00.000Z", { from: "@bob-agent", via: "direct" }),
		];
		writeThreadRecord(db, {
			project_id: "project-a",
			thread_id: "thread-1",
			record: threadRecord({ history }),
			updated_at: "2026-01-01T03:00:00.000Z",
		});

		assert.deepEqual(storedHistoryEids(db, "project-a", "thread-1"), ["eid-reply-1", "eid-reply-2", "eid-reply-3"]);
		assert.deepEqual(readThreadRecord(db, "project-a", "thread-1")?.history, history);
	});
});

test("the writer trims the history to the newest MAX_THREAD_HISTORY, and the trimmed row is gone", () => {
	withLedger((db) => {
		// MAX_THREAD_HISTORY + 1 entries, one minute apart, oldest first, so the newest 50 are known exactly.
		const history = Array.from({ length: MAX_THREAD_HISTORY + 1 }, (_unused, index) =>
			historyEntry(`eid-${index}`, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString())
		);
		writeThreadRecord(db, {
			project_id: "project-a",
			thread_id: "thread-1",
			record: threadRecord({ history }),
			updated_at: "2026-01-01T00:00:00.000Z",
		});

		const stored = storedHistoryEids(db, "project-a", "thread-1");
		assert.equal(stored.length, MAX_THREAD_HISTORY);
		// The OLDEST entry is the one dropped, and it is dropped from the table rather than merely hidden
		// from the read — otherwise the table would grow without bound while the record looked capped.
		assert.equal(stored.includes("eid-0"), false);
		assert.equal(stored[stored.length - 1], `eid-${MAX_THREAD_HISTORY}`);
		assert.equal(readThreadRecord(db, "project-a", "thread-1")?.history.length, MAX_THREAD_HISTORY);
	});
});

test("a shortened history reconciles the table instead of leaving stale rows behind", () => {
	withLedger((db) => {
		const write = (history: HistoryEntry[]) =>
			writeThreadRecord(db, { project_id: "project-a", thread_id: "thread-1", record: threadRecord({ history }), updated_at: "2026-01-01T00:00:00.000Z" });

		write([
			historyEntry("eid-reply-1", "2026-01-01T01:00:00.000Z"),
			historyEntry("eid-reply-2", "2026-01-01T02:00:00.000Z"),
		]);
		write([historyEntry("eid-reply-3", "2026-01-01T03:00:00.000Z")]);

		assert.deepEqual(storedHistoryEids(db, "project-a", "thread-1"), ["eid-reply-3"]);
	});
});

test("a thread the record says has no history stores no history rows", () => {
	withLedger((db) => {
		writeThreadRecord(db, {
			project_id: "project-a",
			thread_id: "thread-1",
			record: threadRecord(),
			updated_at: "2026-01-01T00:00:00.000Z",
		});

		assert.deepEqual(storedHistoryEids(db, "project-a", "thread-1"), []);
	});
});

test("history belongs to its project: the same thread_id in two projects keeps its own entries", () => {
	withLedger((db) => {
		writeThreadRecord(db, {
			project_id: "project-a",
			thread_id: "thread-1",
			record: threadRecord({ history: [historyEntry("eid-a", "2026-01-01T01:00:00.000Z")] }),
			updated_at: "2026-01-01T00:00:00.000Z",
		});
		writeThreadRecord(db, {
			project_id: "project-b",
			thread_id: "thread-1",
			record: threadRecord({ history: [historyEntry("eid-b", "2026-01-01T01:00:00.000Z")] }),
			updated_at: "2026-01-01T00:00:00.000Z",
		});

		assert.deepEqual(storedHistoryEids(db, "project-a", "thread-1"), ["eid-a"]);
		assert.deepEqual(storedHistoryEids(db, "project-b", "thread-1"), ["eid-b"]);
	});
});
