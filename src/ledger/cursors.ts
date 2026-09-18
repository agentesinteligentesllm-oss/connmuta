import type { DatabaseSync } from "node:sqlite";

import { SESSION_CATCHUP_HOURS } from "../shared/constants.js";

/**
 * Per-client cursors and surfaced state (`ledger/cursors.ts`, D-19, design §8.4).
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against — this file carries no header of the kind
 * `test/security/provenance.test.ts` looks for and `test/fixtures/v1-provenance.json` stays at its
 * eleven entries. (That gate reads a file's *leading* `/**` block; this module begins with its imports.)
 *
 * **What changed and why it is the point of the unit.** v1 kept ONE `next_update_id` and one
 * `first_surfaced_at` flag per thread in `state.json`, so two IDEs on one binding shared a single cursor:
 * whichever fetched first consumed the batch for both, and the second was told the body was omitted for a
 * thread it had never seen (`BRIDGE_BUSY` / `body_omitted`, the T05 row of the threat model). Two tables
 * replace that here, both keyed by `client_id`: `client_cursors.inbox_seq` is *this* session's position,
 * and `client_surfaced` is *this* session's set of already-shown threads. Advancing one moves neither.
 *
 * **Catch-up (D-19), and the boundary in it.** A session created for the first time does not start at 0 —
 * that would replay the whole inbox — and not at the newest `seq` either, which would show nothing. It
 * starts at the newest `updates.seq` stamped **older than** {@link SESSION_CATCHUP_HOURS}, so it sees
 * exactly the window a v1 session received from Telegram directly. "Older than" is strict: a row stamped
 * exactly on the edge is *inside* the window. When no row is that old — a young ledger, or an empty one —
 * the answer is `0`, which is the same rule rather than a fallback: nothing is before the cursor, so the
 * session sees the whole table.
 *
 * **Two properties a caller depends on**, each pinned by `test/ledger/cursors.test.ts`:
 *
 * - **`ensureClientCursor` never rewinds.** A second `fetch` from a live session returns the row as it
 *   stands; only the session's own {@link advanceClientCursor} moves it.
 * - **The surfaced mark is first-wins.** `client_surfaced.first_surfaced_at` is the FIRST time this client
 *   was shown the thread, because that is what everything downstream reads it as, so re-marking a thread
 *   does not move it.
 *
 * **Boundaries stated rather than hidden.** Neither `client_surfaced` nor `advanceClientCursor` can
 * reference a session that does not exist: `open.ts` turns `foreign_keys` on, so a surfaced row for an
 * unknown client is refused by the database, and an advance that matched no row is refused by name rather
 * than left as a silent no-op. The catch-up query reads `updates` by `(project_id, received_at)` and
 * version 1 carries no index on either, so it is a scan — bounded by the inbox retention window
 * (`INBOX_RETENTION_DAYS` days) and by one run per new session, which is why no index was added: an index
 * here would be a schema change, and a schema change is a migration.
 *
 * This module writes no transactions of its own. `design §8.4`'s handler is where these calls are
 * ordered; each statement here autocommits, and the one relationship that must hold across two of them —
 * a surfaced row and its session — is held by the foreign key rather than by a transaction.
 */

/** The milliseconds in one hour; re-declared locally because the constant above is in hours (`v1:src/protocol.ts` keeps its own). */
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The refusal {@link advanceClientCursor} raises when it matched no session row.
 *
 * An `UPDATE` matching no row is not an error to SQLite, and that is exactly the failure this replaces: a
 * `client_id` wrong by one character would discard the advance, the caller would see a successful call,
 * and the session would be served the same batch for ever. The row is created by
 * {@link ensureClientCursor}, so reaching this means the caller skipped it.
 *
 * Exported so the caller and its test pin one spelling of the refusal instead of matching prose.
 */
export const CLIENT_CURSOR_UNKNOWN_MESSAGE =
	"advanceClientCursor: there is no client_cursors row for this client_id, so the advance would have been silently discarded; ensureClientCursor creates that row (design §8.4).";

/**
 * The refusal {@link ensureClientCursor} raises when the caller's instant is not one a `Date` can read.
 *
 * The value is used arithmetically — the catch-up window's edge is that instant minus
 * {@link SESSION_CATCHUP_HOURS} — and `new Date(NaN).toISOString()` throws a `RangeError` that would name
 * this module for a fault in the caller's own string. The refusal says which value and why instead; the
 * same reasoning as `v1:src/tools/fetch.ts`'s `toIsoFromUnixSeconds`, which exists so a poisoned
 * timestamp costs one message rather than a wedged poller.
 *
 * Exported for the same reason as {@link CLIENT_CURSOR_UNKNOWN_MESSAGE}.
 */
export const CLIENT_CURSOR_INSTANT_INVALID_MESSAGE =
	"ensureClientCursor: `now` is not a timestamp this ledger can parse, so the catch-up window's edge cannot be computed (design §8.4, D-19).";

/** One client session's cursor row, as the ledger holds it. */
export interface ClientCursor {
	/** The session identifier the IPC handshake mints (PR-30); the primary key. */
	readonly client_id: string;
	readonly project_id: string;
	/** The machine the client runs on, for `status`; `null` when the client did not say. */
	readonly host: string | null;
	/** The client's process id, for `status`; `null` when the client did not say. */
	readonly pid: number | null;
	/** When the session started, ISO 8601. */
	readonly started_at: string;
	/** The last instant this session was heard from, ISO 8601 — what the retention sweep measures silence by. */
	readonly last_seen_at: string;
	/** This session's position in `updates.seq`; `0` means "before the first row". */
	readonly inbox_seq: number;
	/** The last digest this session was actually shown, or `null`. */
	readonly last_surfaced_digest: string | null;
}

/** What {@link ensureClientCursor} needs to create a session's row. */
export interface ClientSessionInput {
	readonly client_id: string;
	readonly project_id: string;
	/** The client's machine, if it said; stored as `NULL` when it did not. */
	readonly host?: string | null;
	/** The client's process id, if it said; stored as `NULL` when it did not. */
	readonly pid?: number | null;
	/** When the session started, ISO 8601. Written only on creation. */
	readonly started_at: string;
	/** The instant the catch-up window is measured back from, ISO 8601. Written only on creation. */
	readonly now: string;
}

/** What {@link advanceClientCursor} writes. */
export interface ClientCursorAdvance {
	/** The session's new position in `updates.seq`. */
	readonly inbox_seq: number;
	/** The instant to stamp as `last_seen_at`. */
	readonly last_seen_at: string;
	/**
	 * The digest this session was shown, when it was shown one.
	 *
	 * Omitted — not `null` — when there is none to report, because the two differ: A4's quiet tick advances
	 * the position and surfaces nothing, and it must not erase the digest the previous surfacing stored.
	 * Pass `null` explicitly to clear it.
	 */
	readonly last_surfaced_digest?: string | null;
}

/**
 * Creates a session's cursor row if it has none, at the catch-up window, and returns the row as it stands.
 *
 * Idempotent by returning the existing row: a session that calls `fetch` twice is one row whose `inbox_seq`
 * the session itself has moved in between.
 */
export function ensureClientCursor(db: DatabaseSync, session: ClientSessionInput): ClientCursor {
	const nowMs = parseInstant(session.now);
	const existing = readClientCursor(db, session.client_id);
	if (existing !== undefined) {
		return existing;
	}

	const host = session.host ?? null;
	const pid = session.pid ?? null;
	const inboxSeq = catchUpSeq(db, session.project_id, nowMs);

	// A plain INSERT, not `ON CONFLICT DO NOTHING`: the row was just read and the daemon is the ledger's
	// only writer, so a conflict here is genuinely impossible — and if it were not, SQLite's UNIQUE refusal
	// is the right answer. `DO NOTHING` would swallow it and return values this call computed rather than
	// the ones stored, which is the silent divergence the rest of this unit refuses.
	db.prepare(
		`INSERT INTO client_cursors (client_id, project_id, host, pid, started_at, last_seen_at, inbox_seq, last_surfaced_digest)
		 VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
	).run(session.client_id, session.project_id, host, pid, session.started_at, session.now, inboxSeq);

	return {
		client_id: session.client_id,
		project_id: session.project_id,
		host,
		pid,
		started_at: session.started_at,
		last_seen_at: session.now,
		inbox_seq: inboxSeq,
		last_surfaced_digest: null,
	};
}

/** One session's cursor row, or `undefined` when this ledger has no such session. */
export function readClientCursor(db: DatabaseSync, client_id: string): ClientCursor | undefined {
	const row = db
		.prepare(
			`SELECT client_id, project_id, host, pid, started_at, last_seen_at, inbox_seq, last_surfaced_digest
			   FROM client_cursors WHERE client_id = ?`,
		)
		.get(client_id) as ClientCursor | undefined;
	return row === undefined ? undefined : { ...row };
}

/**
 * Moves a session's cursor forward and stamps its `last_seen_at` — one statement, so the position and the
 * stamp cannot disagree.
 *
 * Refuses a `client_id` the ledger does not hold; see {@link CLIENT_CURSOR_UNKNOWN_MESSAGE}.
 */
export function advanceClientCursor(db: DatabaseSync, client_id: string, advance: ClientCursorAdvance): void {
	// Two statement shapes rather than one with a CASE: "leave the digest alone" and "write the digest" are
	// different statements, and expressing them as one would mean a sentinel value that a real digest could
	// collide with.
	const result =
		"last_surfaced_digest" in advance
			? db
					.prepare(
						"UPDATE client_cursors SET inbox_seq = ?, last_seen_at = ?, last_surfaced_digest = ? WHERE client_id = ?",
					)
					.run(advance.inbox_seq, advance.last_seen_at, advance.last_surfaced_digest ?? null, client_id)
			: db
					.prepare("UPDATE client_cursors SET inbox_seq = ?, last_seen_at = ? WHERE client_id = ?")
					.run(advance.inbox_seq, advance.last_seen_at, client_id);

	// SQLite counts the rows the statement MATCHED, so zero means "no such session" and never "the values
	// were already those values" — which is what makes this a usable guard rather than a false alarm.
	if (result.changes === 0) {
		throw new Error(CLIENT_CURSOR_UNKNOWN_MESSAGE);
	}
}

/**
 * The threads this session has already been shown — the set `shared/protocol-select.ts` takes to decide
 * what `body_omitted` applies to.
 *
 * A `Set` rather than a list because that is the shape the digest consumes, and because membership is the
 * only question anything asks of it.
 */
export function readSurfacedThreads(db: DatabaseSync, client_id: string): ReadonlySet<string> {
	const rows = db.prepare("SELECT thread_id FROM client_surfaced WHERE client_id = ?").all(client_id) as unknown as {
		thread_id: string;
	}[];
	return new Set(rows.map((row) => row.thread_id));
}

/**
 * Records that this session has now seen each of `thread_ids`, stamping `first_surfaced_at` only for the
 * ones it had not seen.
 *
 * The session's row must exist: `client_surfaced` references `client_cursors` and `foreign_keys` is on, so
 * an unknown `client_id` is refused by the database. That is deliberate — a surfaced row with no session
 * is an orphan the retention sweep can never reach.
 */
export function markThreadsSurfaced(
	db: DatabaseSync,
	client_id: string,
	thread_ids: readonly string[],
	first_surfaced_at: string,
): void {
	const mark = db.prepare(
		`INSERT INTO client_surfaced (client_id, thread_id, first_surfaced_at) VALUES (?, ?, ?)
		 ON CONFLICT (client_id, thread_id) DO NOTHING`,
	);
	for (const thread_id of thread_ids) {
		mark.run(client_id, thread_id, first_surfaced_at);
	}
}

/**
 * The `updates.seq` a session created now should start from: the newest row stamped before the catch-up
 * window, or `0` when no row is that old.
 *
 * `COALESCE(MAX(seq), 0)` carries both of those cases in one expression, and `0` is the right answer for
 * "nothing is before the cursor" rather than a substitute for one — see the module doc.
 */
function catchUpSeq(db: DatabaseSync, project_id: string, nowMs: number): number {
	const edge = new Date(nowMs - SESSION_CATCHUP_HOURS * MS_PER_HOUR).toISOString();
	const row = db
		.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM updates WHERE project_id = ? AND received_at < ?")
		.get(project_id, edge) as { seq: number };
	return row.seq;
}

/** An ISO 8601 instant as epoch milliseconds, refusing anything a `Date` cannot read. */
function parseInstant(instant: string): number {
	const ms = Date.parse(instant);
	if (Number.isNaN(ms)) {
		throw new Error(CLIENT_CURSOR_INSTANT_INVALID_MESSAGE);
	}
	return ms;
}
