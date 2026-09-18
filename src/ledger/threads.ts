import type { DatabaseSync } from "node:sqlite";

import { MAX_THREAD_HISTORY } from "../shared/constants.js";
import type { HistoryEntry, ThreadRecord } from "../shared/thread-record.js";

/**
 * The `ThreadRecord` adapter (`ledger/threads.ts`, design §8.2 step 7): the `threads` and
 * `thread_history` tables read back as the record `shared/protocol-apply.ts` applies a transition to,
 * and written back as the rows that hold it.
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against — this file carries no header of the kind
 * `test/security/provenance.test.ts` looks for and `test/fixtures/v1-provenance.json` stays at its
 * eleven entries. (That gate reads a file's *leading* `/**` block; this module begins with its imports.)
 *
 * The split of responsibility with `ledger/inbox.ts` is deliberate and load-bearing: **this module maps,
 * the batch delimits.** Neither function here opens a transaction, because the one transaction per poll
 * batch (design §5.3) is `inbox.ts`'s and `withTransaction` refuses a nested call. Called on its own,
 * each statement autocommits and a failure halfway leaves a thread row without the history that explains
 * it — which is exactly why `inbox.ts` is the only production caller.
 *
 * Four choices a reader of the SQL would otherwise have to guess at:
 *
 * - **An upsert, never `INSERT OR REPLACE`.** `thread_history` carries
 *   `FOREIGN KEY … ON DELETE CASCADE`, and `open.ts` turns `foreign_keys` on, so a replacing write would
 *   delete the thread row first and take every history row down with it. `ON CONFLICT … DO UPDATE` leaves
 *   the row in place.
 * - **The writer trims the history, not only the appender** (design §5.4, `v1:src/protocol.ts:161-172`).
 *   `applyEnvelope` already caps the array it returns, but the cap is enforced here too so a caller that
 *   builds a record by another route cannot store an unbounded one.
 * - **The history is reconciled, not appended to.** The stored rows are made to equal the record's own
 *   array — including deleting rows the array no longer carries — so the table cannot grow past the cap
 *   while the record looks capped, and so `MAX_THREAD_HISTORY` is one number rather than two that drift.
 * - **`updated_at` is the caller's, because `ThreadRecord` has no field for it.** The batch passes the
 *   update's own `received_at`; the send path (PR-27) will pass its own instant.
 *
 * **Two boundaries stated rather than hidden.** The stored history is read back ordered by `(at, eid)`:
 * `thread_history` has no ordinal column — its primary key is `(project_id, thread_id, eid)` and version 1
 * is frozen, so a schema change here would be a migration, not an edit. The *set* is exactly the record's
 * array; two entries stamped in the same second therefore come back in `eid` order, which may differ from
 * the arrival order the writer was handed. The digest `shared/protocol-select.ts` computes reads
 * `history.length` and not its order, and the turn is derived from `awaiting` rather than from the tip, so
 * nothing in F1 depends on the difference — but it is a difference. And `updates.envelope_json`'s
 * "validated envelope WITHOUT the body key" is **not** enforced here or by the DDL: the admission pipeline
 * (PR-22a) is what builds that string, and nothing in this unit re-parses it.
 */

/** One thread row to store, as `ledger/inbox.ts` hands it over. */
export interface ThreadWrite {
	/** The project the thread belongs to; `threads` is keyed `(project_id, thread_id)`. */
	readonly project_id: string;
	/** The thread the envelope named; this module never mints one. */
	readonly thread_id: string;
	/** The full record: every column this adapter owns is taken from it, `history` included. */
	readonly record: ThreadRecord;
	/** The write instant for `threads.updated_at`. */
	readonly updated_at: string;
}

/** The `threads` row as SQLite hands it back, in the exact types the STRICT columns promise. */
interface ThreadRow {
	status: string;
	opened_type: string;
	opened_eid: string;
	from_agent_id: string;
	to_agent_id: string | null;
	to_user_id: number | null;
	body: string;
	opened_at: string;
	opened_message_id: number;
	group_message_id: number | null;
	via: string;
	ack_count: number;
	acked_at: string | null;
	awaiting: string | null;
	resolved_at: string | null;
	resolved_by: string | null;
	basis: string | null;
	closure_delivered: number;
}

/** The `thread_history` row as SQLite hands it back. */
interface HistoryRow {
	eid: string;
	type: string;
	from_agent_id: string;
	body: string;
	at: string;
	via: string;
}

/**
 * Reads one thread back as the record `applyEnvelope` takes as its `existing`, or `undefined` when this
 * project has no such thread.
 *
 * `undefined` is the module's answer for "there is nothing to apply to" — not an empty record — because
 * that is the single value `applyEnvelope` branches on, and an empty record would make a first-seen
 * REQUEST look like a transition of something.
 */
export function readThreadRecord(db: DatabaseSync, project_id: string, thread_id: string): ThreadRecord | undefined {
	const row = db
		.prepare(
			`SELECT status, opened_type, opened_eid, from_agent_id, to_agent_id, to_user_id, body, opened_at,
			        opened_message_id, group_message_id, via, ack_count, acked_at, awaiting, resolved_at,
			        resolved_by, basis, closure_delivered
			   FROM threads WHERE project_id = ? AND thread_id = ?`,
		)
		.get(project_id, thread_id) as ThreadRow | undefined;
	if (row === undefined) {
		return undefined;
	}

	return {
		status: row.status as ThreadRecord["status"],
		opened_type: row.opened_type as ThreadRecord["opened_type"],
		opened_eid: row.opened_eid,
		from: row.from_agent_id,
		to: row.to_agent_id,
		to_user_id: row.to_user_id,
		body: row.body,
		opened_at: row.opened_at,
		opened_message_id: row.opened_message_id,
		group_message_id: row.group_message_id,
		via: row.via as ThreadRecord["via"],
		ack_count: row.ack_count,
		acked_at: row.acked_at,
		awaiting: row.awaiting,
		resolved_at: row.resolved_at,
		resolved_by: row.resolved_by,
		basis: row.basis,
		closure_delivered: row.closure_delivered === 1,
		history: readHistory(db, project_id, thread_id),
	};
}

/**
 * Stores one thread: the row, and its history brought to exactly the record's own array.
 *
 * Idempotent on the thread row, so writing the same record twice is one row and not an error — which is
 * what lets the batch re-run a partly-committed poll without special-casing it.
 */
export function writeThreadRecord(db: DatabaseSync, write: ThreadWrite): void {
	const { project_id, thread_id, record, updated_at } = write;

	db.prepare(
		`INSERT INTO threads (
		   project_id, thread_id, status, opened_type, opened_eid, from_agent_id, to_agent_id, to_user_id,
		   body, opened_at, opened_message_id, group_message_id, via, ack_count, acked_at, awaiting,
		   resolved_at, resolved_by, basis, closure_delivered, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT (project_id, thread_id) DO UPDATE SET
		   status = excluded.status, opened_type = excluded.opened_type, opened_eid = excluded.opened_eid,
		   from_agent_id = excluded.from_agent_id, to_agent_id = excluded.to_agent_id,
		   to_user_id = excluded.to_user_id, body = excluded.body, opened_at = excluded.opened_at,
		   opened_message_id = excluded.opened_message_id, group_message_id = excluded.group_message_id,
		   via = excluded.via, ack_count = excluded.ack_count, acked_at = excluded.acked_at,
		   awaiting = excluded.awaiting, resolved_at = excluded.resolved_at, resolved_by = excluded.resolved_by,
		   basis = excluded.basis, closure_delivered = excluded.closure_delivered, updated_at = excluded.updated_at`,
	).run(
		project_id,
		thread_id,
		record.status,
		record.opened_type,
		record.opened_eid,
		record.from,
		record.to,
		record.to_user_id,
		record.body,
		record.opened_at,
		record.opened_message_id,
		record.group_message_id,
		record.via,
		record.ack_count,
		record.acked_at,
		record.awaiting,
		record.resolved_at,
		record.resolved_by,
		record.basis,
		record.closure_delivered ? 1 : 0,
		updated_at,
	);

	// The cap is applied here as well as in `applyEnvelope`, so the writer — which design §5.4 names as
	// the place it is trimmed — cannot be the second of two numbers that drift apart.
	const history = record.history.length > MAX_THREAD_HISTORY ? record.history.slice(-MAX_THREAD_HISTORY) : record.history;
	reconcileHistory(db, project_id, thread_id, history);
}

/** The thread's stored entries, oldest first — see the module doc for what "oldest" can mean under a tie. */
function readHistory(db: DatabaseSync, project_id: string, thread_id: string): HistoryEntry[] {
	const rows = db
		.prepare(
			`SELECT eid, type, from_agent_id, body, at, via
			   FROM thread_history WHERE project_id = ? AND thread_id = ?
			  ORDER BY at, eid`,
		)
		.all(project_id, thread_id) as unknown as HistoryRow[];

	return rows.map((row) => ({
		eid: row.eid,
		type: row.type,
		from: row.from_agent_id,
		body: row.body,
		at: row.at,
		via: row.via as HistoryEntry["via"],
	}));
}

/**
 * Makes the stored history equal `history`: upsert every entry the record carries, then delete the rows
 * it no longer does.
 *
 * Two steps rather than a delete-everything-then-insert, because the delete first would fire no cascade
 * but would still churn rowids for no gain, and because a failure between the two would be a thread whose
 * history is empty rather than one that is merely stale. The delete is skipped entirely when there is
 * nothing to keep, since `NOT IN ()` is not valid SQL.
 */
function reconcileHistory(db: DatabaseSync, project_id: string, thread_id: string, history: readonly HistoryEntry[]): void {
	const upsert = db.prepare(
		`INSERT INTO thread_history (project_id, thread_id, eid, type, from_agent_id, body, at, via)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT (project_id, thread_id, eid) DO UPDATE SET
		   type = excluded.type, from_agent_id = excluded.from_agent_id, body = excluded.body,
		   at = excluded.at, via = excluded.via`,
	);
	for (const entry of history) {
		upsert.run(project_id, thread_id, entry.eid, entry.type, entry.from, entry.body, entry.at, entry.via);
	}

	if (history.length === 0) {
		db.prepare("DELETE FROM thread_history WHERE project_id = ? AND thread_id = ?").run(project_id, thread_id);
		return;
	}

	// Placeholders are built from the list's length, never from its contents: the only thing that reaches
	// the SQL text is a count of `?`, and every value is bound.
	const placeholders = history.map(() => "?").join(", ");
	db.prepare(
		`DELETE FROM thread_history WHERE project_id = ? AND thread_id = ? AND eid NOT IN (${placeholders})`,
	).run(project_id, thread_id, ...history.map((entry) => entry.eid));
}
