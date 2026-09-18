import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { commitInboxBatch, type InboxUpdateInput } from "../../src/ledger/inbox.js";
import {
	advanceClientCursor,
	CLIENT_CURSOR_INSTANT_INVALID_MESSAGE,
	CLIENT_CURSOR_UNKNOWN_MESSAGE,
	ensureClientCursor,
	markThreadsSurfaced,
	readClientCursor,
	readSurfacedThreads,
	type ClientSessionInput,
} from "../../src/ledger/cursors.js";
import { openLedger } from "../../src/ledger/open.js";
import { SESSION_CATCHUP_HOURS } from "../../src/shared/constants.js";

/**
 * Per-client cursors and surfaced state (`ledger/cursors.ts`, D-19, design §8.4).
 *
 * PT-11's ledger half: two clients on one binding see the same batch, and moving one cursor moves nothing
 * else. The other half — that each of them is *served* that batch by `fetch` — is `daemon/serve/fetch`
 * (PR-23), exactly as design §15's PT→file map has it, so this suite pins the rows and the independence of
 * the two writes rather than the tool output.
 *
 * The catch-up window is the part with a boundary worth pinning twice: D-19 says a fresh session starts at
 * the newest `updates.seq` **older than** {@link SESSION_CATCHUP_HOURS}, so a row stamped exactly at the
 * window's edge is inside the window and not before it.
 *
 * Real `node:sqlite` over a temp file per test, opened through `ledger/open.ts` so `foreign_keys = ON` —
 * which is what makes `client_surfaced`'s reference to `client_cursors` real.
 *
 * Every value here is a placeholder (AGENTS.md §3): synthetic bot, chat, user, project and client ids.
 */

/** The one bot and project this suite's ledger holds. */
const BOT_ID = 900000001;
const PROJECT_ID = "project-a";

/** The instant the catch-up window is measured back from; the window itself is 24 h. */
const NOW = "2026-01-10T12:00:00.000Z";

/** SQLite's extended code for a violated foreign key (`787 & 0xFF` is `SQLITE_CONSTRAINT`). */
const SQLITE_CONSTRAINT_FOREIGN_KEY = 787;

const HOUR_MS = 60 * 60 * 1000;

/** An instant `hours` before {@link NOW}, as ISO 8601. */
function beforeNow(hours: number): string {
	return new Date(Date.parse(NOW) - hours * HOUR_MS).toISOString();
}

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

/** One admitted `updates` row that touched no thread — enough to give the table a `seq` and a `received_at`. */
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
		// `not_mine` stores a body and no thread row (design §8.2 step 7) — the cheapest shape for a fixture
		// whose subject is the cursor rather than the transition.
		apply_outcome: "not_mine",
		received_at: receivedAt,
	};
}

/** Writes one `updates` row, oldest first at every call site, so `seq` ascends with `received_at`. */
function seedUpdate(db: DatabaseSync, updateId: number, eid: string, receivedAt: string): void {
	commitInboxBatch(db, { bot_id: BOT_ID, entries: [{ kind: "admitted", update: updateInput(updateId, eid, receivedAt) }] });
}

/**
 * Five `updates` rows spanning three days, so the catch-up window has something on each side of it.
 *
 * Inserted oldest first: `updates.seq` is an AUTOINCREMENT, so `seq` ascends with `received_at` and the
 * newest `seq` older than the window is unambiguous.
 */
function seedSpanningUpdates(db: DatabaseSync): void {
	seedUpdate(db, 1, "eid-1", beforeNow(72));
	seedUpdate(db, 2, "eid-2", beforeNow(48));
	// Just inside the old side: older than the window by one second.
	seedUpdate(db, 3, "eid-3", beforeNow(SESSION_CATCHUP_HOURS + 1 / 3600));
	// Exactly ON the edge. "Older than the window" is strict, so this one is NOT before the window.
	seedUpdate(db, 4, "eid-4", beforeNow(SESSION_CATCHUP_HOURS));
	seedUpdate(db, 5, "eid-5", beforeNow(6));
}

/** The `seq` values past one cursor, which is what `fetch`'s `log` is built from (design §8.4). */
function seqsPast(db: DatabaseSync, inboxSeq: number): number[] {
	return (db.prepare("SELECT seq FROM updates WHERE seq > ? ORDER BY seq").all(inboxSeq) as { seq: number }[]).map(
		(row) => row.seq,
	);
}

/** A session description with the fields a case is not about taken from a placeholder. */
function session(clientId: string, overrides: Partial<ClientSessionInput> = {}): ClientSessionInput {
	return { client_id: clientId, project_id: PROJECT_ID, started_at: NOW, now: NOW, ...overrides };
}

test("readClientCursor answers undefined for a client that has no row yet", () => {
	withLedger((db) => {
		assert.equal(readClientCursor(db, "client-a"), undefined);
	});
});

test("a fresh session's cursor starts at the newest seq older than the catch-up window", () => {
	withLedger((db) => {
		seedSpanningUpdates(db);

		const cursor = ensureClientCursor(db, session("client-a"));

		// seq 3 is the newest row stamped before the window; seq 4 sits exactly on the edge and is therefore
		// INSIDE it. So the fresh session sees seq 4 and 5 — the same 24 h a v1 session got from Telegram —
		// rather than 0 (which would replay three days) or 5 (which would show nothing).
		assert.equal(cursor.inbox_seq, 3);
		assert.deepEqual(seqsPast(db, cursor.inbox_seq), [4, 5]);
	});
});

test("a ledger whose every row is inside the window starts a fresh cursor at zero", () => {
	withLedger((db) => {
		seedUpdate(db, 1, "eid-1", beforeNow(6));
		seedUpdate(db, 2, "eid-2", beforeNow(1));

		const cursor = ensureClientCursor(db, session("client-a"));

		// Nothing is older than the window, so nothing is before the cursor: the fresh session sees the whole
		// table. That is `0`, and it is not a fallback — it is the answer the rule gives.
		assert.equal(cursor.inbox_seq, 0);
		assert.deepEqual(seqsPast(db, cursor.inbox_seq), [1, 2]);
	});
});

test("an empty ledger starts a fresh cursor at zero too", () => {
	withLedger((db) => {
		assert.equal(ensureClientCursor(db, session("client-a")).inbox_seq, 0);
	});
});

test("ensuring an existing session keeps its cursor instead of re-initializing it", () => {
	withLedger((db) => {
		seedSpanningUpdates(db);
		ensureClientCursor(db, session("client-a"));
		advanceClientCursor(db, "client-a", { inbox_seq: 5, last_seen_at: NOW });

		// A second `fetch` from the same session must not rewind the cursor to the catch-up window: the row is
		// the session's, and only the session's own advance moves it.
		const again = ensureClientCursor(db, session("client-a"));

		assert.equal(again.inbox_seq, 5);
		assert.equal(again.started_at, NOW);
	});
});

test("the cursor row carries the session's host, pid and both timestamps", () => {
	withLedger((db) => {
		const cursor = ensureClientCursor(db, session("client-a", { host: "workstation-1", pid: 4242 }));

		assert.deepEqual(cursor, {
			client_id: "client-a",
			project_id: PROJECT_ID,
			host: "workstation-1",
			pid: 4242,
			started_at: NOW,
			last_seen_at: NOW,
			inbox_seq: 0,
			last_surfaced_digest: null,
		});
	});
});

test("host and pid are optional and default to null rather than to a placeholder", () => {
	withLedger((db) => {
		const cursor = ensureClientCursor(db, session("client-a"));

		assert.equal(cursor.host, null);
		assert.equal(cursor.pid, null);
	});
});

test("an instant the ledger cannot parse is refused by name, not by a RangeError", () => {
	withLedger((db) => {
		// `new Date(NaN).toISOString()` throws a RangeError, which would name this module for a fault in the
		// caller's value; the refusal says which value and why instead.
		assert.throws(
			() => ensureClientCursor(db, session("client-a", { now: "not an instant" })),
			(error: unknown) => (error as Error).message === CLIENT_CURSOR_INSTANT_INVALID_MESSAGE,
		);
		assert.equal(readClientCursor(db, "client-a"), undefined);
	});
});

test("two clients each see the full batch once, and neither write touches the other", () => {
	withLedger((db) => {
		seedSpanningUpdates(db);

		ensureClientCursor(db, session("client-a"));
		ensureClientCursor(db, session("client-b"));

		const a = readClientCursor(db, "client-a");
		const b = readClientCursor(db, "client-b");
		assert.equal(a?.inbox_seq, b?.inbox_seq);
		// "Each receives the same batch": the rows past the two cursors are the same set, because neither
		// cursor has consumed anything for the other.
		assert.deepEqual(seqsPast(db, a?.inbox_seq ?? 0), seqsPast(db, b?.inbox_seq ?? 0));

		// The `body_omitted` collision v1 had comes from ONE global surfaced set. Marking a thread as shown
		// to A must leave B's set empty, which is what lets B still receive that thread's body.
		markThreadsSurfaced(db, "client-a", ["thread-1", "thread-2"], NOW);
		assert.deepEqual([...readSurfacedThreads(db, "client-a")].sort(), ["thread-1", "thread-2"]);
		assert.deepEqual([...readSurfacedThreads(db, "client-b")], []);

		advanceClientCursor(db, "client-a", { inbox_seq: 5, last_seen_at: NOW });

		assert.equal(readClientCursor(db, "client-a")?.inbox_seq, 5);
		assert.equal(readClientCursor(db, "client-b")?.inbox_seq, b?.inbox_seq);
	});
});

test("advancing one client stamps its own last_seen_at and leaves the other's alone", () => {
	withLedger((db) => {
		ensureClientCursor(db, session("client-a"));
		ensureClientCursor(db, session("client-b"));

		advanceClientCursor(db, "client-a", { inbox_seq: 9, last_seen_at: beforeNow(1) });

		assert.equal(readClientCursor(db, "client-a")?.last_seen_at, beforeNow(1));
		// B was created at NOW and nothing has stamped it since — its silence is what the retention sweep
		// (PR-13) will measure, so an advance by A must not look like activity from B.
		assert.equal(readClientCursor(db, "client-b")?.last_seen_at, NOW);
	});
});

test("the surfaced digest is written when it is given, and left alone when it is not", () => {
	withLedger((db) => {
		ensureClientCursor(db, session("client-a"));

		advanceClientCursor(db, "client-a", { inbox_seq: 1, last_seen_at: NOW, last_surfaced_digest: "digest-1" });
		assert.equal(readClientCursor(db, "client-a")?.last_surfaced_digest, "digest-1");

		// A4's quiet tick advances and surfaces nothing, so a call that has no digest to report must not
		// erase the one the last surfacing stored.
		advanceClientCursor(db, "client-a", { inbox_seq: 2, last_seen_at: NOW });
		assert.equal(readClientCursor(db, "client-a")?.last_surfaced_digest, "digest-1");
	});
});

test("an explicit undefined leaves the stored digest alone, exactly as omitting it does", () => {
	withLedger((db) => {
		ensureClientCursor(db, session("client-a"));
		advanceClientCursor(db, "client-a", { inbox_seq: 1, last_seen_at: NOW, last_surfaced_digest: "digest-1" });

		// This is the NATURAL call shape: a handler forwarding an optional value puts the key PRESENT with the
		// value `undefined`, and this repository's `strict` config permits it because it does not set
		// `exactOptionalPropertyTypes`. A writer that branched on the key's presence would erase the digest
		// here — and a wiped digest is a client treated as never surfaced, which is the `body_omitted` defect
		// v1 had and PT-11 exists to remove.
		const maybeDigest: string | null | undefined = undefined;
		advanceClientCursor(db, "client-a", { inbox_seq: 2, last_seen_at: NOW, last_surfaced_digest: maybeDigest });

		assert.equal(readClientCursor(db, "client-a")?.last_surfaced_digest, "digest-1");
		// The position still advanced, so the digest was skipped and not the whole call.
		assert.equal(readClientCursor(db, "client-a")?.inbox_seq, 2);
	});
});

test("an explicit null clears the stored digest, which is how a caller says so", () => {
	withLedger((db) => {
		ensureClientCursor(db, session("client-a"));
		advanceClientCursor(db, "client-a", { inbox_seq: 1, last_seen_at: NOW, last_surfaced_digest: "digest-1" });

		advanceClientCursor(db, "client-a", { inbox_seq: 2, last_seen_at: NOW, last_surfaced_digest: null });

		// `null` and `undefined` are the two different things the contract says they are; this is the case that
		// keeps them from collapsing into one.
		assert.equal(readClientCursor(db, "client-a")?.last_surfaced_digest, null);
	});
});

test("advancing a client the ledger does not know is refused instead of silently doing nothing", () => {
	withLedger((db) => {
		// An UPDATE that matches no row is not an error to SQLite, which is exactly the silent failure this
		// refusal replaces: a session id that is wrong by one character would otherwise discard the advance
		// and the caller would see a successful call.
		assert.throws(
			() => advanceClientCursor(db, "client-typo", { inbox_seq: 1, last_seen_at: NOW }),
			(error: unknown) => (error as Error).message === CLIENT_CURSOR_UNKNOWN_MESSAGE,
		);
	});
});

test("first_surfaced_at is first-wins: marking the same thread twice does not move it", () => {
	withLedger((db) => {
		ensureClientCursor(db, session("client-a"));

		markThreadsSurfaced(db, "client-a", ["thread-1"], beforeNow(2));
		markThreadsSurfaced(db, "client-a", ["thread-1"], NOW);

		const row = db.prepare("SELECT first_surfaced_at AS at FROM client_surfaced WHERE client_id = ? AND thread_id = ?").get(
			"client-a",
			"thread-1",
		) as { at: string };
		// The column is named `first_surfaced_at`, and the digest and the "new to this client" floor both read
		// it as the FIRST time. A last-wins write would make every re-marked thread look new again.
		assert.equal(row.at, beforeNow(2));
	});
});

test("nothing is surfaced twice by a second mark, and the empty mark writes nothing", () => {
	withLedger((db) => {
		ensureClientCursor(db, session("client-a"));

		markThreadsSurfaced(db, "client-a", ["thread-1"], NOW);
		markThreadsSurfaced(db, "client-a", [], NOW);
		markThreadsSurfaced(db, "client-a", ["thread-1"], NOW);

		const count = db.prepare("SELECT COUNT(*) AS n FROM client_surfaced").get() as { n: number };
		assert.equal(count.n, 1);
	});
});

test("surfaced state cannot exist without the session it belongs to", () => {
	withLedger((db) => {
		// `foreign_keys = ON` is what `open.ts` sets; with it, a surfaced row for an unknown client is refused
		// by the database rather than stored as an orphan. The API's own order is therefore not optional:
		// ensure the cursor first.
		assert.throws(
			() => markThreadsSurfaced(db, "client-unknown", ["thread-1"], NOW),
			(error: unknown) => (error as { errcode?: number }).errcode === SQLITE_CONSTRAINT_FOREIGN_KEY,
		);
	});
});

test("surfaced state dies with its session, because the row cascades", () => {
	withLedger((db) => {
		ensureClientCursor(db, session("client-a"));
		markThreadsSurfaced(db, "client-a", ["thread-1"], NOW);

		db.prepare("DELETE FROM client_cursors WHERE client_id = ?").run("client-a");

		const count = db.prepare("SELECT COUNT(*) AS n FROM client_surfaced").get() as { n: number };
		// The retention sweep (PR-13) deletes stale cursors and relies on this: a deleted session must not
		// leave its surfaced set behind to be read by a future session that reuses the id.
		assert.equal(count.n, 0);
	});
});
