import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { writeThreadRecord } from "../../../src/ledger/threads.js";
import { ensureClientCursor, advanceClientCursor, markThreadsSurfaced, readClientCursor } from "../../../src/ledger/cursors.js";
import { raiseCondition, DAEMON_CONDITION_SCOPE } from "../../../src/ledger/conditions-store.js";
import type { ThreadRecord } from "../../../src/shared/thread-record.js";
import { computeRosterHash } from "../../../src/shared/roster-hash.js";
import { BOT_API_RETENTION_HOURS, FLOOR_NEW, MAX_SURFACED_THREADS, PROTOCOL_SENTINEL, RETENTION_WARNING_HOURS } from "../../../src/shared/constants.js";
import { SERVER_VERSION } from "../../../src/shared/version.js";
import { FakeTelegramClient } from "../../fakes/telegram.js";
import { serveStatus, type StatusDaemonFacts, type StatusServeBinding } from "../../../src/daemon/serve/status.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * `daemon/serve/status.ts` (PR-24, design §8.4/§12, `thin-client-tools › status and thread are local,
 * no-network reads`).
 *
 * A real `node:sqlite` ledger per test, seeded directly through `writeThreadRecord`/raw SQL/the cursor
 * and condition-store modules — this suite pins the SERVE half (per-client cursor read, per-project
 * ledger reads, daemon/binding/secret-store facts) against rows a poll batch or a prior `fetch` already
 * produced, not the admission or poller pipelines that produce them (their own suites cover those halves).
 *
 * Every id below is a placeholder (AGENTS.md §3): synthetic bot, chat, user, project and thread ids.
 */

const BOT_ID = 900000024;
const OTHER_BOT_ID = 900000025;
const PROJECT_ID = "project-pr24";
const GROUP_ID = -1009876543211;
const AGENT_ID = "@alice-agent";
const AGENT_USER_ID = 700000021;
const PEER_AGENT_ID = "@bob-agent";
const PEER_USER_ID = 700000022;
const BOT_USERNAME = "dev24_orion_bot";

const ROSTER = [
	{ agent_id: AGENT_ID, user_id: AGENT_USER_ID, username: "alice" },
	{ agent_id: PEER_AGENT_ID, user_id: PEER_USER_ID, username: "bob" },
];
const ROSTER_HASH = computeRosterHash(ROSTER);

const NOW = "2026-03-01T12:00:00.000Z";
const LATER = "2026-03-01T12:05:00.000Z";
const LATER2 = "2026-03-01T12:10:00.000Z";
const EARLIER_10H = "2026-03-01T02:00:00.000Z";
const EARLIER_18H = "2026-02-28T18:00:00.000Z";
const EARLIER_40H = "2026-02-27T20:00:00.000Z";

function withLedger(run: (db: DatabaseSync) => Promise<void> | void): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-status-"));
	const ledger = openLedger({ homeDir: home });
	return Promise.resolve(run(ledger.db)).finally(() => {
		try {
			ledger.db.close();
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
}

function sampleBinding(overrides: Partial<StatusServeBinding> = {}): StatusServeBinding {
	return {
		project_id: PROJECT_ID,
		bot_id: BOT_ID,
		group_id: GROUP_ID,
		agent_id: AGENT_ID,
		bot_username: BOT_USERNAME,
		roster_snapshot: ROSTER,
		roster_hash: ROSTER_HASH,
		reminder_window_hours: 24,
		...overrides,
	};
}

function sampleDaemon(overrides: Partial<StatusDaemonFacts> = {}): StatusDaemonFacts {
	return {
		pid: 4242,
		started_at: NOW,
		secret_store_kind: "keychain",
		...overrides,
	};
}

function sampleThread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
	return {
		status: "open",
		opened_type: "REQUEST",
		opened_eid: "opening-eid",
		from: PEER_AGENT_ID,
		to: AGENT_ID,
		to_user_id: AGENT_USER_ID,
		body: "opening body",
		opened_at: NOW,
		opened_message_id: 1,
		group_message_id: null,
		via: "group",
		ack_count: 0,
		acked_at: null,
		resolved_at: null,
		resolved_by: null,
		basis: null,
		closure_delivered: true,
		awaiting: AGENT_ID,
		history: [],
		...overrides,
	};
}

function writeThread(db: DatabaseSync, threadId: string, overrides: Partial<ThreadRecord> = {}, updatedAt = NOW): void {
	writeThreadRecord(db, { project_id: PROJECT_ID, thread_id: threadId, record: sampleThread(overrides), updated_at: updatedAt });
}

interface TableSnapshot {
	readonly client_cursors: unknown[];
	readonly client_surfaced: unknown[];
	readonly offsets: unknown[];
}

function snapshotTables(db: DatabaseSync): TableSnapshot {
	return {
		client_cursors: db.prepare("SELECT * FROM client_cursors ORDER BY client_id").all(),
		client_surfaced: db.prepare("SELECT * FROM client_surfaced ORDER BY client_id, thread_id").all(),
		offsets: db.prepare("SELECT * FROM offsets ORDER BY bot_id").all(),
	};
}

test("status makes no Telegram call: a fake client never wired into deps still shows zero calls", async () => {
	await withLedger(async (db) => {
		const fakeTelegram = new FakeTelegramClient();
		// ServeStatusDeps carries no telegram field at all — there is no way for this call to reach the
		// fake even if it wanted to. Asserting it afterward proves the fake was never touched by anything
		// reachable from serveStatus, mirroring v1's own "deliberately does NOT include a TelegramClient".
		await serveStatus({}, { db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(NOW) });
		assert.equal(fakeTelegram.getUpdatesCallCount, 0);
		assert.equal(fakeTelegram.sentMessages.length, 0);
	});
});

test("serveStatus's own module imports nothing from telegram, transport or send, and never shells out or touches node:fs", () => {
	const statusSrc = readFileSync(join(REPO_ROOT, "src/daemon/serve/status.ts"), "utf8");
	const specifiers = [...statusSrc.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
	assert.ok(specifiers.length > 0, "sanity: the module must import something for this check to be non-vacuous");
	for (const specifier of specifiers) {
		assert.doesNotMatch(
			specifier,
			/telegram|transport\/|\/send\/|node:fs/,
			`import specifier must not reach telegram/transport/send/node:fs: ${specifier}`,
		);
	}
	assert.doesNotMatch(statusSrc, /child_process/, "the module must never shell out");
});

test("status writes nothing: no client_cursors row is created for a session with none, and no table changes", async () => {
	await withLedger(async (db) => {
		db.prepare("INSERT INTO offsets (bot_id, next_update_id, last_poll_ok_at) VALUES (?, 0, ?)").run(BOT_ID, NOW);
		const before = snapshotTables(db);

		const result = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-fresh" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);

		const after = snapshotTables(db);
		assert.deepEqual(after, before, "serveStatus must not mutate client_cursors, client_surfaced, or offsets");
		assert.equal(result.cursor.next_update_id, 0);
		assert.equal(readClientCursor(db, "client-fresh"), undefined, "no client_cursors row is created by a status call");
	});
});

test("cursor reflects the session's own client_cursors row when one exists, and 0/null when it does not", async () => {
	await withLedger(async (db) => {
		ensureClientCursor(db, { client_id: "client-a", project_id: PROJECT_ID, started_at: NOW, now: NOW });
		advanceClientCursor(db, "client-a", { inbox_seq: 42, last_seen_at: LATER });

		const withCursor = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(LATER2) },
		);
		assert.equal(withCursor.cursor.next_update_id, 42);
		assert.equal(withCursor.last_fetch_at, LATER);
		assert.ok(withCursor.hours_since_last_fetch !== null && withCursor.hours_since_last_fetch > 0);

		const withoutCursor = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-new" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);
		assert.equal(withoutCursor.cursor.next_update_id, 0);
		assert.equal(withoutCursor.last_fetch_at, null);
		assert.equal(withoutCursor.hours_since_last_fetch, null);
	});
});

test("daemon uptime is whole seconds since started_at, and never negative when started_at is in the future", async () => {
	await withLedger(async (db) => {
		const daemon = sampleDaemon({ pid: 1234, started_at: NOW });
		const result = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon, now: () => new Date("2026-03-01T12:01:30.500Z") },
		);
		assert.equal(result.daemon.pid, 1234);
		assert.equal(result.daemon.started_at, NOW);
		assert.equal(result.daemon.uptime_seconds, 90, "90.5s elapsed floors to 90 whole seconds");

		const future = sampleDaemon({ started_at: LATER });
		const clamped = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-b" }, daemon: future, now: () => new Date(NOW) },
		);
		assert.equal(clamped.daemon.uptime_seconds, 0, "a started_at in the future must never report negative uptime");
	});
});

test("poller surfaces the binding bot's own offsets row, including TELEGRAM_CONFLICT, and never another bot's", async () => {
	await withLedger(async (db) => {
		db.prepare(
			`INSERT INTO offsets (bot_id, next_update_id, last_poll_started_at, last_poll_ok_at, last_error_code, retry_after_until)
			 VALUES (?, ?, ?, ?, ?, ?)`,
		).run(BOT_ID, 17, NOW, EARLIER_10H, "TELEGRAM_CONFLICT", null);
		db.prepare("INSERT INTO offsets (bot_id, next_update_id, last_poll_ok_at) VALUES (?, ?, ?)").run(OTHER_BOT_ID, 999, NOW);

		const result = await serveStatus(
			{},
			{ db, binding: sampleBinding({ bot_id: BOT_ID }), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);

		assert.deepEqual(result.poller, {
			bot_id: BOT_ID,
			next_update_id: 17,
			last_poll_started_at: NOW,
			last_poll_ok_at: EARLIER_10H,
			last_error_code: "TELEGRAM_CONFLICT",
			retry_after_until: null,
		});
	});
});

test("poller is null when the binding bot has no offsets row", async () => {
	await withLedger(async (db) => {
		const result = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);
		assert.equal(result.poller, null);
	});
});

test("binding identity and secret_store kind surface from deps, not from a ledger read", async () => {
	await withLedger(async (db) => {
		const keychainResult = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon({ secret_store_kind: "keychain" }), now: () => new Date(NOW) },
		);
		assert.deepEqual(keychainResult.binding, {
			project_id: PROJECT_ID,
			bot_id: BOT_ID,
			group_id: GROUP_ID,
			agent_id: AGENT_ID,
			roster_hash: ROSTER_HASH,
		});
		assert.deepEqual(keychainResult.secret_store, { kind: "keychain" });

		const fileResult = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-b" }, daemon: sampleDaemon({ secret_store_kind: "file" }), now: () => new Date(NOW) },
		);
		assert.deepEqual(fileResult.secret_store, { kind: "file" });
	});
});

test("conditions from the table: a raised project condition and a daemon-scope condition both surface; unraised is null", async () => {
	await withLedger(async (db) => {
		const clean = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);
		assert.equal(clean.conditions.open_thread_backlog, null);
		assert.equal(clean.daemon_conditions.ledger_quarantined, null);

		raiseCondition(db, { scope: PROJECT_ID, name: "open_thread_backlog", since: NOW, detail: { count: 5 } });
		raiseCondition(db, { scope: DAEMON_CONDITION_SCOPE, name: "ledger_quarantined", since: NOW, detail: { reason: "corrupt_header" } });

		const raised = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-b" }, daemon: sampleDaemon(), now: () => new Date(LATER) },
		);
		assert.deepEqual(raised.conditions.open_thread_backlog, { count: 5, since: NOW });
		assert.equal(raised.conditions.group_outage, null);
		assert.deepEqual(raised.daemon_conditions.ledger_quarantined, { since: NOW, reason: "corrupt_header" });
	});
});

test("retention_warning is raised from offsets.last_poll_ok_at, never merely because the client never fetched", async () => {
	await withLedger(async (db) => {
		// No offsets row at all, and this session has no client_cursors row either: absent is the answer,
		// not a warning manufactured from the client's own silence.
		const noPoll = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-never-fetched" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);
		assert.equal(noPoll.retention_warning, undefined);

		db.prepare("INSERT INTO offsets (bot_id, next_update_id, last_poll_ok_at) VALUES (?, 0, ?)").run(BOT_ID, EARLIER_10H);
		const belowThreshold = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);
		assert.equal(belowThreshold.retention_warning, undefined, `${RETENTION_WARNING_HOURS}h threshold not yet reached at 10h elapsed`);

		db.prepare("UPDATE offsets SET last_poll_ok_at = ? WHERE bot_id = ?").run(EARLIER_18H, BOT_ID);
		// This client never called fetch either — proving the warning comes from offsets, not from this
		// session's own (absent) cursor.
		const atThreshold = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-still-never-fetched" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);
		assert.ok(atThreshold.retention_warning, "exactly at RETENTION_WARNING_HOURS must already warn");
		assert.equal(atThreshold.retention_warning?.hours_remaining, BOT_API_RETENTION_HOURS - 18);
		assert.equal(atThreshold.retention_warning?.retention_hours, BOT_API_RETENTION_HOURS);

		db.prepare("UPDATE offsets SET last_poll_ok_at = ? WHERE bot_id = ?").run(EARLIER_40H, BOT_ID);
		const pastRetention = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-c" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);
		assert.ok(pastRetention.retention_warning);
		assert.equal(pastRetention.retention_warning?.hours_remaining, 0, "hours_remaining is clamped at 0 past the full retention window");
	});
});

test("open_threads: REQUEST+open only, with direction and peer from the caller's own agent id", async () => {
	await withLedger(async (db) => {
		writeThread(db, "thread-out", { from: AGENT_ID, to: PEER_AGENT_ID, to_user_id: PEER_USER_ID, opened_at: NOW });
		writeThread(db, "thread-in", { from: PEER_AGENT_ID, to: AGENT_ID, opened_at: LATER });
		writeThread(db, "thread-resolved", { status: "resolved", resolved_at: LATER, opened_at: EARLIER_10H });
		writeThread(db, "thread-broadcast", { opened_type: "BROADCAST", to: null, to_user_id: null, opened_at: EARLIER_10H });

		const result = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(LATER2) },
		);

		assert.deepEqual(
			result.open_threads.map((entry) => [entry.thread, entry.direction, entry.peer]),
			[
				["thread-out", "outbound", PEER_AGENT_ID],
				["thread-in", "inbound", PEER_AGENT_ID],
			],
			"only REQUEST+open threads appear, oldest first, and a resolved or BROADCAST thread never does",
		);
	});
});

test("open_threads: a thread never surfaced by THIS client stays in the fresh tier even when another client already surfaced it", async () => {
	await withLedger(async (db) => {
		writeThread(db, "thread-shared", { opened_at: NOW });

		ensureClientCursor(db, { client_id: "client-other", project_id: PROJECT_ID, started_at: NOW, now: NOW });
		markThreadsSurfaced(db, "client-other", ["thread-shared"], NOW);

		const result = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(LATER) },
		);

		assert.deepEqual(
			result.open_threads.map((entry) => entry.thread),
			["thread-shared"],
			"another client's surfaced stamp must not exclude the thread from this client's own view",
		);
	});
});

test("open_threads: omitted counts appear once the open backlog exceeds MAX_SURFACED_THREADS", async () => {
	await withLedger(async (db) => {
		const total = MAX_SURFACED_THREADS + 5;
		for (let i = 0; i < total; i++) {
			const openedAt = new Date(Date.parse(NOW) + i * 60_000).toISOString();
			writeThread(db, `thread-omit-${i}`, { opened_at: openedAt }, openedAt);
		}

		const result = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-omit" }, daemon: sampleDaemon(), now: () => new Date(LATER2) },
		);

		assert.equal(result.open_threads.length, MAX_SURFACED_THREADS);
		assert.equal(result.omitted_open_threads, 5);
		assert.equal(result.omitted_open_threads_by_tier.new, 5, "every one of these threads is in the never-surfaced tier");
		assert.equal(result.omitted_open_threads_by_tier.reminder, 0);
		assert.ok(FLOOR_NEW < MAX_SURFACED_THREADS, "sanity: the floor must not itself already equal the window");
	});
});

test("last_checkpoint reads binding_state; roster is the binding's snapshot; chat_id is the binding's group_id", async () => {
	await withLedger(async (db) => {
		const noCheckpoint = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);
		assert.equal(noCheckpoint.last_checkpoint, null);
		assert.deepEqual(noCheckpoint.roster, [
			{ agent_id: AGENT_ID, username: "alice" },
			{ agent_id: PEER_AGENT_ID, username: "bob" },
		]);
		assert.equal(noCheckpoint.chat_id, GROUP_ID);

		db.prepare("INSERT INTO binding_state (project_id, last_checkpoint_at, last_checkpoint_by) VALUES (?, ?, ?)").run(
			PROJECT_ID,
			NOW,
			PEER_AGENT_ID,
		);
		const withCheckpoint = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-b" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);
		assert.deepEqual(withCheckpoint.last_checkpoint, { at: NOW, by: PEER_AGENT_ID });
	});
});

test("protocol_version and server_version are the emitted sentinel and this build's package version", async () => {
	await withLedger(async (db) => {
		const result = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(NOW) },
		);
		assert.equal(result.protocol_version, PROTOCOL_SENTINEL);
		assert.equal(result.server_version, SERVER_VERSION);
	});
});

test("open_threads: this client's own surfaced stamps move threads out of the fresh tier, so a new thread is never starved by a backlog it already saw", async () => {
	await withLedger(async (db) => {
		const seen: string[] = [];
		for (let i = 0; i < MAX_SURFACED_THREADS; i++) {
			const openedAt = new Date(Date.parse(NOW) + i * 60_000).toISOString();
			writeThread(db, `thread-seen-${i}`, { opened_at: openedAt }, openedAt);
			seen.push(`thread-seen-${i}`);
		}
		const newest = new Date(Date.parse(NOW) + MAX_SURFACED_THREADS * 60_000).toISOString();
		writeThread(db, "thread-unseen", { opened_at: newest }, newest);

		ensureClientCursor(db, { client_id: "client-a", project_id: PROJECT_ID, started_at: NOW, now: NOW });
		markThreadsSurfaced(db, "client-a", seen, NOW);

		const result = await serveStatus(
			{},
			{ db, binding: sampleBinding(), session: { client_id: "client-a" }, daemon: sampleDaemon(), now: () => new Date(LATER2) },
		);

		assert.ok(
			result.open_threads.some((entry) => entry.thread === "thread-unseen"),
			"the one thread this client never saw is listed although it is the newest of twenty-one",
		);
		assert.equal(result.omitted_open_threads, 1);
		assert.equal(result.omitted_open_threads_by_tier.new, 0, "nothing in the never-surfaced tier was withheld");
	});
});
