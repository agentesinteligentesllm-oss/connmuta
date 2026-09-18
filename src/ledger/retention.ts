import type { DatabaseSync } from "node:sqlite";

import {
	AUDIT_RETENTION_DAYS,
	CLIENT_SESSION_STALE_HOURS,
	INBOX_RETENTION_DAYS,
	MAX_THREAD_HISTORY,
	OPEN_THREAD_BACKLOG_THRESHOLD,
	RESOLVED_THREAD_RETENTION_DAYS,
	RETENTION_SWEEP_INTERVAL_HOURS,
	UNKNOWN_SENDER_RETENTION_DAYS,
} from "../shared/constants.js";
import { clearCondition, listConditionScopes, raiseCondition } from "./conditions-store.js";

/**
 * The retention sweep (`ledger/retention.ts`, design §5.4, the `ledger` spec's third requirement).
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against — this file carries no header of the kind
 * `test/security/provenance.test.ts` looks for and `test/fixtures/v1-provenance.json` stays at its eleven
 * entries. (That gate reads a file's *leading* `/**` block; this module begins with its imports.)
 *
 * **Retention runs in the daemon, never on a client call.** That is the requirement's second sentence and
 * the reason this module exposes a *decision* ({@link isRetentionSweepDue}) and a *sweep*
 * ({@link sweepRetention}) rather than a hook any caller can run at will: the heartbeat owns the timing,
 * and a `fetch` from a session can never shorten a window.
 *
 * **One window per table, each a named constant with its own argument** (design §3, CONSTITUTION §5):
 * `updates` is the dedup set (`UNIQUE (project_id, eid)`), so it ages on `INBOX_RETENTION_DAYS`;
 * `audit_log` outlives every thread it could explain, on `AUDIT_RETENTION_DAYS`;
 * `unknown_senders` ages on its last sighting, on `UNKNOWN_SENDER_RETENTION_DAYS`; `client_cursors` is a
 * dead IDE's session, on `CLIENT_SESSION_STALE_HOURS`; and resolved threads go on
 * `RESOLVED_THREAD_RETENTION_DAYS`, taking their history with them. The windows deliberately differ, so a
 * sweep that used one window for every table would be visible in the suites rather than plausible.
 *
 * **"Older than" is strict**, and it is measured from the caller's `now` rather than from a wall clock read
 * inside this module — one instant, one set of edges, which is also what makes the boundary testable.
 *
 * **Open threads are never pruned, at any age.** The `threads` delete filters on `status = 'resolved'`,
 * and the backlog is *reported* instead: `open_thread_backlog` is raised per project once the open count is
 * past `OPEN_THREAD_BACKLOG_THRESHOLD`, refreshed with the count each sweep (first-wins `since`, so the
 * condition answers "since when"), and cleared for a project that has fallen back to the threshold. The
 * count is the *open* threads of that project, so it is not affected by the same sweep's own resolved-thread
 * deletions — resolved rows were never open.
 *
 * **`thread_history`'s cap is enforced here as well as by the writer.** Design §5.4 puts the trim on the
 * appender (`v1:src/protocol.ts:161-172`, and `ledger/threads.ts` applies it), and the `ledger` spec's
 * scenario asks for "the daemon's own pruning pass" — so this sweep trims any thread still holding more than
 * `MAX_THREAD_HISTORY` entries, newest kept. The overlap is deliberate: the writer's cap holds for records
 * built by `applyEnvelope`, and this one holds for rows no writer route produced (a hand-edited file, an
 * older build, a future writer that forgets). Both call sites read the ONE constant, so there is no second
 * number to drift.
 *
 * **Two boundaries stated rather than hidden.**
 *
 * - **The five age deletes are table scans, measured, and the design's "one indexed `DELETE` per table" is
 *   not what the planner does here.** `EXPLAIN QUERY PLAN` on the pinned build (Node 24.16.0, SQLite
 *   3.53.0) answers `SCAN updates`, `SCAN audit_log`, `SCAN unknown_senders`, `SCAN client_cursors` and
 *   `SCAN threads` — no index exists on `received_at`, `ts`, `last_seen_at`, `COALESCE(resolved_at,
 *   updated_at)` or `status` in version 1, and `audit_log_project_ts` cannot serve a `ts`-only predicate.
 *   That is affordable because each table is bounded by the very retention that is deleting from it (seven
 *   days of inbox, ninety of audit, and the small session/stranger sets), while adding an index would be a
 *   schema change — a migration, not an edit. The two *cascades* do use an index
 *   (`SEARCH client_surfaced USING COVERING INDEX sqlite_autoindex_client_surfaced_1`, `SEARCH
 *   thread_history USING COVERING INDEX sqlite_autoindex_thread_history_1`), and the cap's outer delete
 *   uses the table's rowid. The measurements are recorded with this slice; the design's sentence is not
 *   restated as a fact about the plan.
 * - **The sweep is not wrapped in a transaction.** Every statement autocommits, and a failure halfway leaves
 *   a partial sweep: the next hourly one repeats it and the work is idempotent by construction, because each
 *   statement deletes on the same `now`-relative cutoff. Wrapping it would make it non-composable — the
 *   poll batch is `ledger/inbox.ts`'s transaction and `withTransaction` refuses a nested call — and the
 *   heartbeat that runs this is not inside one. What a partial sweep can leave behind is a
 *   `open_thread_backlog` condition whose count is one sweep stale, which is a report and not a deletion.
 */

/** The milliseconds in one hour and one day; declared here because the constants above are in days/hours. */
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * The refusal both entry points raise for an instant a `Date` cannot read.
 *
 * The cutoffs are `new Date(now - window).toISOString()`, so an unreadable `now` would make every edge
 * `NaN` and every comparison a silent `false` — a sweep that deletes nothing for ever, with no error to
 * notice. `lastSweepAt` is refused for the same reason in the other direction: `NaN >= interval` is false,
 * so a corrupt store of the last sweep would stop the schedule instead of reporting it.
 *
 * Exported so the caller and its test pin one spelling of the refusal instead of matching prose.
 */
export const RETENTION_INSTANT_INVALID_MESSAGE =
	"retention: `now` (or `lastSweepAt`) is not a timestamp this ledger can parse, so no window would have an edge to measure from (design §5.4).";

/** What one sweep is measured from. */
export interface RetentionSweepOptions {
	/** The instant the windows are measured back from, ISO 8601 — the daemon's own clock, injected. */
	readonly now: string;
}

/** What one sweep did, per table, plus the backlog conditions it raised and cleared. */
export interface RetentionSweepResult {
	readonly updatesDeleted: number;
	readonly auditRowsDeleted: number;
	readonly unknownSendersDeleted: number;
	/** Sessions whose `client_cursors` row was removed (`client_surfaced` cascades with it). */
	readonly clientCursorsDeleted: number;
	/** Resolved threads whose `threads` row was removed (`thread_history` cascades with it). */
	readonly resolvedThreadsDeleted: number;
	/** Rows this sweep's own cap removed from `thread_history`; cascaded history rows are not counted here. */
	readonly historyEntriesTrimmed: number;
	/** Projects whose `open_thread_backlog` condition this sweep raised or refreshed. */
	readonly backlogRaised: readonly string[];
	/** Projects whose `open_thread_backlog` condition this sweep cleared. */
	readonly backlogCleared: readonly string[];
}

/**
 * Whether the heartbeat should sweep at `now`, given when it last did.
 *
 * `null` means "never swept in this daemon's life", which is due — a fresh daemon must not wait an hour
 * before its first pass. The interval is inclusive: a sweep exactly `RETENTION_SWEEP_INTERVAL_HOURS` after
 * the last one is due, so a heartbeat that beats on the hour cannot drift past its own schedule.
 */
export function isRetentionSweepDue(lastSweepAt: string | null, now: string): boolean {
	const nowMs = parseInstant(now);
	if (lastSweepAt === null) {
		return true;
	}
	return nowMs - parseInstant(lastSweepAt) >= RETENTION_SWEEP_INTERVAL_HOURS * MS_PER_HOUR;
}

/**
 * Removes every row past its window, trims every over-long `thread_history`, and reconciles
 * `open_thread_backlog`, returning what it did.
 *
 * Idempotent at any `now`: running it twice with the same instant deletes nothing the second time.
 */
export function sweepRetention(db: DatabaseSync, options: RetentionSweepOptions): RetentionSweepResult {
	const nowMs = parseInstant(options.now);

	const updatesDeleted = deleteOlderThan(db, "updates", "received_at", daysBefore(nowMs, INBOX_RETENTION_DAYS));
	const auditRowsDeleted = deleteOlderThan(db, "audit_log", "ts", daysBefore(nowMs, AUDIT_RETENTION_DAYS));
	const unknownSendersDeleted = deleteOlderThan(db, "unknown_senders", "last_seen_at", daysBefore(nowMs, UNKNOWN_SENDER_RETENTION_DAYS));
	const clientCursorsDeleted = deleteOlderThan(db, "client_cursors", "last_seen_at", hoursBefore(nowMs, CLIENT_SESSION_STALE_HOURS));
	// `COALESCE(resolved_at, updated_at)` rather than `resolved_at`: a resolved row that somehow carries no
	// closure stamp would otherwise be excluded by the comparison (`NULL < x` is NULL, not true) and would
	// survive for ever. Its own `updated_at` is the only instant left to age it by.
	const resolvedThreadsDeleted = Number(
		db
			.prepare("DELETE FROM threads WHERE status = 'resolved' AND COALESCE(resolved_at, updated_at) < ?")
			.run(daysBefore(nowMs, RESOLVED_THREAD_RETENTION_DAYS)).changes,
	);
	const historyEntriesTrimmed = trimOverlongHistories(db);
	const backlog = reconcileOpenThreadBacklog(db, options.now);

	return {
		updatesDeleted,
		auditRowsDeleted,
		unknownSendersDeleted,
		clientCursorsDeleted,
		resolvedThreadsDeleted,
		historyEntriesTrimmed,
		backlogRaised: backlog.raised,
		backlogCleared: backlog.cleared,
	};
}

/** Deletes the rows of `table` whose `column` is older than `cutoff`, and returns how many went. */
function deleteOlderThan(db: DatabaseSync, table: string, column: string, cutoff: string): number {
	// `Number(...)` because `node:sqlite` types `changes` as `number | bigint`; a count of rows is a number.
	return Number(db.prepare(`DELETE FROM ${table} WHERE ${column} < ?`).run(cutoff).changes);
}

/**
 * Removes every `thread_history` row past {@link MAX_THREAD_HISTORY} in its thread, keeping the newest.
 *
 * One statement with a window function rather than a loop: SQLite ranks the rows per thread in the same
 * pass that deletes them, so there is no read-then-write gap in which a concurrent append could be ranked
 * against a list that moved. The ordering is `(at DESC, eid DESC)` — the same tie-break `ledger/threads.ts`
 * reads history back with, so "newest" means the same thing on both sides.
 */
function trimOverlongHistories(db: DatabaseSync): number {
	return Number(
		db
			.prepare(
				`DELETE FROM thread_history WHERE rowid IN (
				   SELECT rowid FROM (
				     SELECT rowid, ROW_NUMBER() OVER (PARTITION BY project_id, thread_id ORDER BY at DESC, eid DESC) AS position
				       FROM thread_history)
				    WHERE position > ?)`,
			)
			.run(MAX_THREAD_HISTORY).changes,
	);
}

/** Raises `open_thread_backlog` where the backlog is past the threshold, and clears it everywhere else. */
function reconcileOpenThreadBacklog(db: DatabaseSync, now: string): { raised: string[]; cleared: string[] } {
	const counts = db
		.prepare("SELECT project_id, COUNT(*) AS n FROM threads WHERE status = 'open' GROUP BY project_id")
		.all() as unknown as { project_id: string; n: number }[];
	const overThreshold = new Map(
		counts.filter((row) => row.n > OPEN_THREAD_BACKLOG_THRESHOLD).map((row) => [row.project_id, row.n]),
	);

	const raised: string[] = [];
	for (const [project_id, count] of overThreshold) {
		// Refreshed every sweep, so the count the status shows is the one the latest pass measured; `since`
		// stays because the store's raise is first-wins while the condition remains raised.
		raiseCondition(db, { scope: project_id, name: "open_thread_backlog", since: now, detail: { count } });
		raised.push(project_id);
	}

	const cleared: string[] = [];
	for (const scope of listConditionScopes(db, "open_thread_backlog")) {
		if (!overThreshold.has(scope)) {
			clearCondition(db, scope, "open_thread_backlog");
			cleared.push(scope);
		}
	}
	return { raised, cleared };
}

/** The instant `days` before `nowMs`, in the ISO 8601 form every stored instant uses. */
function daysBefore(nowMs: number, days: number): string {
	return new Date(nowMs - days * MS_PER_DAY).toISOString();
}

/** The instant `hours` before `nowMs`. */
function hoursBefore(nowMs: number, hours: number): string {
	return new Date(nowMs - hours * MS_PER_HOUR).toISOString();
}

/** An ISO 8601 instant as epoch milliseconds, refusing anything a `Date` cannot read. */
function parseInstant(instant: string): number {
	const ms = Date.parse(instant);
	if (Number.isNaN(ms)) {
		throw new Error(RETENTION_INSTANT_INVALID_MESSAGE);
	}
	return ms;
}
