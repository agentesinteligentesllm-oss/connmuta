import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { commitInboxBatch, type InboxApplyOutcome, type InboxBatchEntry, type InboxUpdateInput } from "../../../src/ledger/inbox.js";
import { writeThreadRecord } from "../../../src/ledger/threads.js";
import { readClientCursor, readSurfacedThreads } from "../../../src/ledger/cursors.js";
import type { AuditRow } from "../../../src/ledger/audit.js";
import type { ThreadRecord } from "../../../src/shared/thread-record.js";
import type { RejectionReason } from "../../../src/shared/protocol-apply.js";
import { CHECKPOINT_MARKER, FETCH_LONGPOLL_MAX_SECONDS } from "../../../src/shared/constants.js";
import {
	effectiveWaitSeconds,
	serveFetch,
	FETCH_MISSING_REJECTION_AUDIT_MESSAGE,
	UNRESOLVED_ORIGIN_USER_ID,
	type FetchClientSession,
	type FetchServeBinding,
} from "../../../src/daemon/serve/fetch.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * `daemon/serve/fetch.ts` (PR-23, design §8.4, D-02, D-06, D-15).
 *
 * A real `node:sqlite` ledger per test, seeded directly through `commitInboxBatch`/`writeThreadRecord`
 * rather than through `daemon/admission.ts` — this suite pins the SERVE half (per-client reads,
 * D-02's wait, fencing, tiering) against rows and threads a batch already produced, not the admission
 * pipeline that produces them (PR-22a's own suite covers that half).
 *
 * Every id below is a placeholder (AGENTS.md §3): synthetic bot, chat, user, project and thread ids.
 */

const BOT_ID = 900000023;
const PROJECT_ID = "project-pr23";
const GROUP_ID = -1009876543210;
const AGENT_ID = "@alice-agent";
const PEER_AGENT_ID = "@bob-agent";
const PEER_USER_ID = 700000002;
const AGENT_USER_ID = 700000001;

const ROSTER = [
	{ agent_id: AGENT_ID, user_id: AGENT_USER_ID, username: "alice" },
	{ agent_id: PEER_AGENT_ID, user_id: PEER_USER_ID, username: "bob" },
];

const NOW = "2026-02-01T12:00:00.000Z";
const LATER = "2026-02-01T12:05:00.000Z";
const LATER2 = "2026-02-01T12:10:00.000Z";

function withLedger(run: (db: DatabaseSync) => Promise<void> | void): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-fetch-"));
	const ledger = openLedger({ homeDir: home });
	return Promise.resolve(run(ledger.db)).finally(() => {
		try {
			ledger.db.close();
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
}

function sampleBinding(overrides: Partial<FetchServeBinding> = {}): FetchServeBinding {
	return {
		project_id: PROJECT_ID,
		bot_id: BOT_ID,
		agent_id: AGENT_ID,
		roster_snapshot: ROSTER,
		reminder_window_hours: 24,
		...overrides,
	};
}

function sampleSession(clientId: string, overrides: Partial<FetchClientSession> = {}): FetchClientSession {
	return { client_id: clientId, started_at: NOW, ...overrides };
}

function envelopeJson(fields: { type: string; to?: string | null; thread: string; basis?: string }): string {
	const body: Record<string, unknown> = { type: fields.type, to: fields.to ?? null, thread: fields.thread };
	if (fields.basis !== undefined) {
		body.basis = fields.basis;
	}
	return JSON.stringify(body);
}

interface SeedUpdateOptions {
	readonly update_id: number;
	readonly eid: string;
	readonly thread: string;
	readonly type?: string;
	readonly to?: string | null;
	readonly basis?: string;
	readonly from_agent_id?: string;
	readonly from_user_id?: number;
	readonly via?: "group" | "direct";
	readonly body?: string | null;
	readonly apply_outcome?: InboxApplyOutcome;
	readonly received_at: string;
}

/** Writes one admitted `updates` row directly, bypassing `daemon/admission.ts` (see the module doc). */
function seedUpdateRow(db: DatabaseSync, opts: SeedUpdateOptions): number {
	const input: InboxUpdateInput = {
		update_id: opts.update_id,
		project_id: PROJECT_ID,
		chat_id: GROUP_ID,
		via: opts.via ?? "group",
		message_id: 6000 + opts.update_id,
		message_date: Math.floor(Date.parse(opts.received_at) / 1000),
		from_user_id: opts.from_user_id ?? PEER_USER_ID,
		from_agent_id: opts.from_agent_id ?? PEER_AGENT_ID,
		eid: opts.eid,
		envelope_json: envelopeJson({ type: opts.type ?? "REQUEST", to: opts.to ?? null, thread: opts.thread, basis: opts.basis }),
		body: opts.body === undefined ? `body of ${opts.eid}` : opts.body,
		apply_outcome: opts.apply_outcome ?? "opened",
		received_at: opts.received_at,
	};
	commitInboxBatch(db, { bot_id: BOT_ID, entries: [{ kind: "admitted", update: input }] });
	const row = db.prepare("SELECT seq FROM updates WHERE bot_id = ? AND update_id = ?").get(BOT_ID, opts.update_id) as {
		seq: number;
	};
	return row.seq;
}

interface SeedRejectedOptions {
	readonly update_id: number;
	readonly eid: string;
	readonly thread: string;
	readonly reason: RejectionReason;
	readonly type?: string;
	readonly from_agent_id?: string;
	readonly from_user_id?: number;
	readonly received_at: string;
}

/** Writes one `rejected` `updates` row plus its matching `reject`/`rejected` audit row, as admission does in one transaction. */
function seedRejectedUpdate(db: DatabaseSync, opts: SeedRejectedOptions): void {
	const type = opts.type ?? "REPLY";
	const input: InboxUpdateInput = {
		update_id: opts.update_id,
		project_id: PROJECT_ID,
		chat_id: GROUP_ID,
		via: "group",
		message_id: 6000 + opts.update_id,
		message_date: Math.floor(Date.parse(opts.received_at) / 1000),
		from_user_id: opts.from_user_id ?? PEER_USER_ID,
		from_agent_id: opts.from_agent_id ?? PEER_AGENT_ID,
		eid: opts.eid,
		envelope_json: envelopeJson({ type, to: AGENT_ID, thread: opts.thread }),
		body: null,
		apply_outcome: "rejected",
		received_at: opts.received_at,
	};
	const audit: AuditRow = {
		ts: opts.received_at,
		project_id: PROJECT_ID,
		bot_id: BOT_ID,
		chat_id: GROUP_ID,
		client_id: null,
		direction: "reject",
		eid: opts.eid,
		envelope_type: type,
		from_user_id: opts.from_user_id ?? PEER_USER_ID,
		to_user_id: null,
		outcome: "rejected",
		reason: opts.reason,
	};
	const entries: InboxBatchEntry[] = [{ kind: "admitted", update: input, audits: [audit] }];
	commitInboxBatch(db, { bot_id: BOT_ID, entries });
}

interface SeedIgnoredOptions {
	readonly update_id: number;
	readonly eid: string;
	readonly thread: string;
	readonly type?: string;
	readonly from_agent_id?: string;
	readonly received_at: string;
}

/** Writes one `ignored` `updates` row — a transition referencing a thread this ledger never saw opened. */
function seedIgnoredUpdate(db: DatabaseSync, opts: SeedIgnoredOptions): void {
	const type = opts.type ?? "ACK";
	const input: InboxUpdateInput = {
		update_id: opts.update_id,
		project_id: PROJECT_ID,
		chat_id: GROUP_ID,
		via: "group",
		message_id: 6000 + opts.update_id,
		message_date: Math.floor(Date.parse(opts.received_at) / 1000),
		from_user_id: PEER_USER_ID,
		from_agent_id: opts.from_agent_id ?? PEER_AGENT_ID,
		eid: opts.eid,
		envelope_json: envelopeJson({ type, to: AGENT_ID, thread: opts.thread }),
		body: null,
		apply_outcome: "ignored",
		received_at: opts.received_at,
	};
	commitInboxBatch(db, { bot_id: BOT_ID, entries: [{ kind: "admitted", update: input }] });
}

/** Writes one dropped audit row — the shape a `SkippedCounts` reason earns with no `updates` row at all. */
function seedDroppedAudit(db: DatabaseSync, opts: { update_id: number; ts: string; reason: string }): void {
	const audit: AuditRow = {
		ts: opts.ts,
		project_id: PROJECT_ID,
		bot_id: BOT_ID,
		chat_id: GROUP_ID,
		client_id: null,
		direction: "reject",
		eid: null,
		envelope_type: null,
		from_user_id: null,
		to_user_id: null,
		outcome: "dropped",
		reason: opts.reason,
	};
	commitInboxBatch(db, { bot_id: BOT_ID, entries: [{ kind: "dropped", update_id: opts.update_id, audits: [audit] }] });
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

test("effectiveWaitSeconds clamps to [0, FETCH_LONGPOLL_MAX_SECONDS]", () => {
	assert.equal(effectiveWaitSeconds(undefined), 0);
	assert.equal(effectiveWaitSeconds(-10), 0);
	assert.equal(effectiveWaitSeconds(1000), FETCH_LONGPOLL_MAX_SECONDS);
	assert.equal(effectiveWaitSeconds(10), 10);
});

test("timeout_s is clamped to FETCH_LONGPOLL_MAX_SECONDS, and zero or negative waits nothing", async () => {
	await withLedger(async (db) => {
		const binding = sampleBinding();
		const recorded: number[] = [];
		const delay = async (ms: number): Promise<void> => {
			recorded.push(ms);
		};
		const emitter = new EventEmitter();

		await serveFetch(
			{ timeout_s: 1000 },
			{ db, binding, session: sampleSession("client-a"), emitter, delay, now: () => new Date(NOW) },
		);
		assert.deepEqual(recorded, [FETCH_LONGPOLL_MAX_SECONDS * 1000]);
		assert.equal(emitter.listenerCount(`inbox:${PROJECT_ID}`), 0, "a wait that timed out removes its listener");

		recorded.length = 0;
		await serveFetch({ timeout_s: 0 }, { db, binding, session: sampleSession("client-b"), delay, now: () => new Date(NOW) });
		assert.deepEqual(recorded, [], "timeout_s: 0 must not wait at all");

		recorded.length = 0;
		await serveFetch({ timeout_s: -5 }, { db, binding, session: sampleSession("client-c"), delay, now: () => new Date(NOW) });
		assert.deepEqual(recorded, [], "a negative timeout_s must not wait at all");
	});
});

test("fetch blocks against new ledger rows, not Telegram", async () => {
	await withLedger(async (db) => {
		const emitter = new EventEmitter();
		const binding = sampleBinding();
		const session = sampleSession("client-a");

		// `deps` carries no Telegram client field at all — `ServeFetchDeps` has no such member, so this
		// call cannot reach one even if it wanted to (D-26: the module imports no transport either).
		// The injected delay never elapses on its own: if the event did not wake the wait, this call would
		// never resolve and the test would fail on its timeout — the bounded delay cannot rescue it.
		let delaySignal: AbortSignal | undefined;
		const delay = (_ms: number, signal: AbortSignal): Promise<void> =>
			new Promise((resolve) => {
				delaySignal = signal;
				signal.addEventListener("abort", () => resolve(), { once: true });
			});
		const fetchPromise = serveFetch({ timeout_s: 20 }, { db, binding, session, emitter, delay, now: () => new Date(NOW) });

		// Let the wait loop subscribe before the row lands.
		await new Promise((resolve) => setImmediate(resolve));

		seedUpdateRow(db, { update_id: 1, eid: "eid-block-1", thread: "thread-block-1", to: AGENT_ID, received_at: NOW, body: "urgent" });
		emitter.emit(`inbox:${PROJECT_ID}`);

		const result = await fetchPromise;
		assert.equal(result.log.length, 1);
		assert.equal(result.log[0].eid, "eid-block-1");
		assert.equal(delaySignal?.aborted, true, "the bounded delay is cancelled once the event settles the wait");
		assert.equal(emitter.listenerCount(`inbox:${PROJECT_ID}`), 0, "the inbox listener is removed on exit");
	});
});

test("a wait reads the clock again: last_seen_at is when the response was built, not when the call arrived", async () => {
	await withLedger(async (db) => {
		const emitter = new EventEmitter();
		const clock = [new Date(NOW), new Date(LATER)];
		const now = (): Date => clock.shift() ?? new Date(LATER);
		const delay = (_ms: number, signal: AbortSignal): Promise<void> =>
			new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
		const fetchPromise = serveFetch(
			{ timeout_s: 20 },
			{ db, binding: sampleBinding(), session: sampleSession("client-a"), emitter, delay, now },
		);
		await new Promise((resolve) => setImmediate(resolve));
		seedUpdateRow(db, { update_id: 1, eid: "eid-clock-1", thread: "thread-clock-1", to: AGENT_ID, received_at: NOW });
		emitter.emit(`inbox:${PROJECT_ID}`);
		await fetchPromise;
		assert.equal(readClientCursor(db, "client-a")?.last_seen_at, LATER);
	});
});

test("needs_action reflects a thread immediately, with no separate write-behind step (D-06)", async () => {
	await withLedger(async (db) => {
		const threadId = "thread-needs-action";
		writeThread(db, threadId, { awaiting: AGENT_ID, opened_at: NOW });

		const viewRow = db
			.prepare("SELECT thread_id FROM needs_action WHERE project_id = ? AND awaiting = ?")
			.get(PROJECT_ID, AGENT_ID);
		assert.ok(viewRow, "the needs_action VIEW must reflect the thread with no separate write");

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) });
		assert.ok(result.needs_action.some((entry) => entry.thread === threadId));
	});
});

test("two clients each see the full batch once, and advancing one leaves the other unchanged (PT-11)", async () => {
	await withLedger(async (db) => {
		seedUpdateRow(db, { update_id: 1, eid: "eid-pt11-1", thread: "thread-pt11-1", to: AGENT_ID, received_at: NOW, body: "task" });

		const binding = sampleBinding();
		const resultA = await serveFetch({}, { db, binding, session: sampleSession("client-a"), now: () => new Date(NOW) });
		const resultB = await serveFetch({}, { db, binding, session: sampleSession("client-b"), now: () => new Date(NOW) });

		assert.equal(resultA.log.length, 1);
		assert.equal(resultB.log.length, 1);
		assert.equal(resultA.log[0].eid, resultB.log[0].eid);

		const cursorA = readClientCursor(db, "client-a");
		const cursorB = readClientCursor(db, "client-b");
		assert.ok((cursorA?.inbox_seq ?? 0) > 0);
		assert.equal(cursorA?.inbox_seq, cursorB?.inbox_seq);

		const beforeB = readClientCursor(db, "client-b");
		await serveFetch({}, { db, binding, session: sampleSession("client-a"), now: () => new Date(LATER) });
		const afterB = readClientCursor(db, "client-b");
		assert.deepEqual(afterB, beforeB, "advancing client-a must leave client-b's cursor untouched");
	});
});

test("mark_seen true advances inbox_seq and stamps surfaced threads; mark_seen false leaves them unchanged", async () => {
	await withLedger(async (db) => {
		const threadId = "thread-marksee";
		writeThread(db, threadId, { awaiting: AGENT_ID, opened_at: NOW });
		const seq1 = seedUpdateRow(db, {
			update_id: 1,
			eid: "eid-marksee-1",
			thread: threadId,
			to: AGENT_ID,
			received_at: NOW,
			body: "task",
		});

		const binding = sampleBinding();
		const session = sampleSession("client-a");

		const real = await serveFetch({}, { db, binding, session, now: () => new Date(NOW) });
		assert.equal(real.cursor.advanced, true);

		const cursorAfterReal = readClientCursor(db, "client-a");
		assert.equal(cursorAfterReal?.inbox_seq, seq1);
		assert.equal(cursorAfterReal?.last_seen_at, NOW);
		assert.ok(cursorAfterReal?.last_surfaced_digest);
		assert.deepEqual([...readSurfacedThreads(db, "client-a")], [threadId]);

		const snapshot = readClientCursor(db, "client-a");
		const surfacedSnapshot = [...readSurfacedThreads(db, "client-a")].sort();

		seedUpdateRow(db, { update_id: 2, eid: "eid-marksee-2", thread: "thread-marksee-2", to: AGENT_ID, received_at: NOW, body: "next" });
		const peek = await serveFetch({ mark_seen: false }, { db, binding, session, now: () => new Date(LATER) });
		assert.deepEqual(peek.log.map((entry) => entry.eid), ["eid-marksee-2"], "a peek still reads the rows past the cursor");
		assert.equal(peek.cursor.advanced, false, "peek mode must report no advance");
		assert.equal(peek.cursor.next_update_id, seq1, "peek mode reports the durable cursor, not the one it would have taken");
		assert.deepEqual(readClientCursor(db, "client-a"), snapshot, "peek mode must not move the cursor");
		assert.deepEqual([...readSurfacedThreads(db, "client-a")].sort(), surfacedSnapshot, "peek mode must not stamp anything");
	});
});

test("max_batch bounds the rows read, and the cursor advances only past what was served", async () => {
	await withLedger(async (db) => {
		const seqs = [1, 2, 3].map((n) =>
			seedUpdateRow(db, { update_id: n, eid: `eid-batch-${n}`, thread: `thread-batch-${n}`, to: AGENT_ID, received_at: NOW }),
		);
		const result = await serveFetch(
			{ max_batch: 2 },
			{ db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) },
		);
		assert.deepEqual(result.log.map((entry) => entry.eid), ["eid-batch-1", "eid-batch-2"]);
		assert.equal(result.cursor.next_update_id, seqs[1]);
		const rest = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) });
		assert.deepEqual(rest.log.map((entry) => entry.eid), ["eid-batch-3"]);
	});
});

test("rejected rows carry the audit reason and no body; ignored rows become unapplied entries", async () => {
	await withLedger(async (db) => {
		seedRejectedUpdate(db, { update_id: 1, eid: "eid-rej-1", thread: "thread-rej-1", reason: "stale", received_at: NOW });
		seedIgnoredUpdate(db, { update_id: 2, eid: "eid-ign-1", thread: "thread-ign-1", type: "ACK", received_at: NOW });

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) });

		assert.equal(result.log.length, 0, "a rejected or ignored row must never enter log");
		assert.deepEqual(result.rejected, [
			{ eid: "eid-rej-1", type: "REPLY", from: PEER_AGENT_ID, thread: "thread-rej-1", reason: "stale" },
		]);
		assert.deepEqual(result.unapplied, [{ thread: "thread-ign-1", type: "ACK", from: PEER_AGENT_ID }]);
	});
});

test("unanchored counts only rejected rows whose reason is unanchored", async () => {
	await withLedger(async (db) => {
		seedRejectedUpdate(db, { update_id: 1, eid: "eid-unanch-1", thread: "thread-unanch-1", reason: "unanchored", received_at: NOW });
		seedRejectedUpdate(db, { update_id: 2, eid: "eid-unanch-2", thread: "thread-unanch-2", reason: "stale", received_at: NOW });

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) });
		assert.equal(result.unanchored, 1);
	});
});

test("misaddressed counts log rows addressed to an agent id outside the roster", async () => {
	await withLedger(async (db) => {
		seedUpdateRow(db, {
			update_id: 1,
			eid: "eid-misaddr-1",
			thread: "thread-misaddr-1",
			to: "@stranger-agent",
			received_at: NOW,
			body: "hi",
		});

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) });
		assert.equal(result.misaddressed, 1);
		assert.equal(result.log[0].to, "@stranger-agent");
	});
});

test("log entries fence the body with the verified sender's user_id, regardless of anything else the envelope claims", async () => {
	await withLedger(async (db) => {
		seedUpdateRow(db, {
			update_id: 1,
			eid: "eid-origin-1",
			thread: "thread-origin-1",
			to: AGENT_ID,
			from_agent_id: PEER_AGENT_ID,
			from_user_id: 999999999,
			received_at: NOW,
			body: "hello there",
		});

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) });
		const wrapped = result.log[0].body;
		assert.match(wrapped, /user_id="999999999"/);
		assert.match(wrapped, new RegExp(`agent_id="${PEER_AGENT_ID}"`));
		assert.match(wrapped, new RegExp(`project_id="${PROJECT_ID}"`));
	});
});

test("a needs_action body falls back to the unresolved sentinel when the author has drifted out of the roster", async () => {
	await withLedger(async (db) => {
		const threadId = "thread-drift-1";
		writeThread(db, threadId, { from: "@ghost-agent", awaiting: AGENT_ID, opened_at: NOW });

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) });
		const entry = result.needs_action.find((candidate) => candidate.thread === threadId);
		assert.ok(entry);
		assert.match(entry!.body ?? "", new RegExp(`user_id="${UNRESOLVED_ORIGIN_USER_ID}"`));
	});
});

test("a second identical fetch reports unchanged with summaries; a new row breaks it", async () => {
	await withLedger(async (db) => {
		const threadId = "thread-compact-1";
		writeThread(db, threadId, { awaiting: AGENT_ID, opened_at: NOW });

		const binding = sampleBinding();
		const session = sampleSession("client-a");

		const first = await serveFetch({}, { db, binding, session, now: () => new Date(NOW) });
		assert.equal(first.unchanged, false);
		assert.equal(first.needs_action_summary, undefined);

		const second = await serveFetch({}, { db, binding, session, now: () => new Date(LATER) });
		assert.equal(second.unchanged, true);
		assert.ok(second.needs_action_summary);
		assert.ok(second.waiting_on_peer_summary);

		seedUpdateRow(db, {
			update_id: 1,
			eid: "eid-compact-1",
			thread: "thread-compact-broadcast",
			type: "BROADCAST",
			to: null,
			received_at: LATER2,
			body: "fresh news",
			apply_outcome: "noted",
		});
		const third = await serveFetch({}, { db, binding, session, now: () => new Date(LATER2) });
		assert.equal(third.unchanged, false);
	});
});

test("body_omitted appears on a second fetch for an already-surfaced thread, per client", async () => {
	await withLedger(async (db) => {
		const threadId = "thread-omit-1";
		writeThread(db, threadId, { awaiting: AGENT_ID, opened_at: NOW });

		const binding = sampleBinding();
		const sessionA = sampleSession("client-a");
		const sessionB = sampleSession("client-b");

		const firstA = await serveFetch({}, { db, binding, session: sessionA, now: () => new Date(NOW) });
		const entryFirstA = firstA.needs_action.find((candidate) => candidate.thread === threadId);
		assert.ok(entryFirstA?.body);
		assert.equal(entryFirstA?.body_omitted, undefined);

		const secondA = await serveFetch({}, { db, binding, session: sessionA, now: () => new Date(LATER) });
		const entrySecondA = secondA.needs_action.find((candidate) => candidate.thread === threadId);
		assert.equal(entrySecondA?.body, undefined);
		assert.equal(entrySecondA?.body_omitted, true);

		const firstB = await serveFetch({}, { db, binding, session: sessionB, now: () => new Date(LATER) });
		const entryFirstB = firstB.needs_action.find((candidate) => candidate.thread === threadId);
		assert.ok(entryFirstB?.body, "a different client must still receive the full body");
		assert.equal(entryFirstB?.body_omitted, undefined);
	});
});

test("skipped counts reflect dropped audit rows inside this client's own (last_seen_at, now] window", async () => {
	await withLedger(async (db) => {
		const binding = sampleBinding();
		const session = sampleSession("client-a");

		await serveFetch({}, { db, binding, session, now: () => new Date(NOW) });

		seedDroppedAudit(db, { update_id: 101, ts: LATER, reason: "malformed" });
		seedDroppedAudit(db, { update_id: 102, ts: LATER, reason: "malformed" });
		seedDroppedAudit(db, { update_id: 103, ts: LATER, reason: "unknown_sender" });
		// Before this client's own last_seen_at window opened — must not be counted.
		seedDroppedAudit(db, { update_id: 104, ts: "2026-01-01T00:00:00.000Z", reason: "duplicate" });

		const result = await serveFetch({}, { db, binding, session, now: () => new Date(LATER2) });
		assert.equal(result.skipped.malformed, 2);
		assert.equal(result.skipped.unknown_sender, 1);
		assert.equal(result.skipped.duplicate, 0);
		assert.equal(result.skipped.non_envelope, 0);
		assert.equal(result.skipped.unsupported_version, 0);
	});
});

test("gap_warning is raised from offsets.last_poll_ok_at, not this client's own last fetch", async () => {
	await withLedger(async (db) => {
		const oldPollAt = "2026-01-01T00:00:00.000Z";
		db.prepare("INSERT INTO offsets (bot_id, next_update_id, last_poll_ok_at) VALUES (?, 0, ?)").run(BOT_ID, oldPollAt);

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) });
		assert.deepEqual(result.gap_warning, {
			possible: true,
			last_fetch_at: oldPollAt,
			hours_elapsed: result.gap_warning?.hours_elapsed,
		});
		assert.ok((result.gap_warning?.hours_elapsed ?? 0) > 24);
	});
});

test("no gap_warning when the daemon polled recently", async () => {
	await withLedger(async (db) => {
		db.prepare("INSERT INTO offsets (bot_id, next_update_id, last_poll_ok_at) VALUES (?, 0, ?)").run(BOT_ID, NOW);

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(LATER) });
		assert.equal(result.gap_warning, undefined);
	});
});

test("the checkpoint window is chosen by message time, not by admission order", async () => {
	await withLedger(async (db) => {
		seedUpdateRow(db, {
			update_id: 1,
			eid: "eid-late-ckpt",
			thread: "thread-late-ckpt",
			type: "BROADCAST",
			to: null,
			received_at: LATER,
			body: `${CHECKPOINT_MARKER} newer snapshot`,
			apply_outcome: "noted",
		});
		seedUpdateRow(db, {
			update_id: 2,
			eid: "eid-early-ckpt",
			thread: "thread-early-ckpt",
			type: "BROADCAST",
			to: null,
			received_at: NOW,
			body: `${CHECKPOINT_MARKER} older snapshot`,
			apply_outcome: "noted",
		});
		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(LATER2) });
		assert.equal(result.log.length, 2, "the window starts at the newer checkpoint even though it was admitted first");
		assert.equal(result.log[0].eid, "eid-late-ckpt");
	});
});

test("log is sliced to start at the last CHECKPOINT-ESTADO broadcast in the batch", async () => {
	await withLedger(async (db) => {
		db.prepare("INSERT INTO binding_state (project_id, last_checkpoint_at, last_checkpoint_by) VALUES (?, ?, ?)").run(
			PROJECT_ID,
			NOW,
			PEER_AGENT_ID,
		);

		seedUpdateRow(db, { update_id: 1, eid: "eid-ckpt-0", thread: "thread-ckpt-0", to: AGENT_ID, received_at: NOW, body: "before checkpoint" });
		seedUpdateRow(db, {
			update_id: 2,
			eid: "eid-ckpt-1",
			thread: "thread-ckpt-1",
			type: "BROADCAST",
			to: null,
			received_at: NOW,
			body: `${CHECKPOINT_MARKER} state snapshot`,
			apply_outcome: "noted",
		});
		seedUpdateRow(db, { update_id: 3, eid: "eid-ckpt-2", thread: "thread-ckpt-2", to: AGENT_ID, received_at: NOW, body: "after checkpoint" });

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) });
		assert.equal(result.log.length, 2);
		assert.ok(result.log[0].body.includes(CHECKPOINT_MARKER));
		assert.equal(result.checkpoint.present, true);
		assert.equal(result.checkpoint.at, NOW);
		assert.equal(result.checkpoint.by, PEER_AGENT_ID);
	});
});

test("serveFetch refuses with FETCH_MISSING_REJECTION_AUDIT_MESSAGE when a rejected row has no matching audit row (JD-B-001)", async () => {
	await withLedger(async (db) => {
		const input: InboxUpdateInput = {
			update_id: 1,
			project_id: PROJECT_ID,
			chat_id: GROUP_ID,
			via: "group",
			message_id: 6001,
			message_date: Math.floor(Date.parse(NOW) / 1000),
			from_user_id: PEER_USER_ID,
			from_agent_id: PEER_AGENT_ID,
			eid: "eid-missing-audit-1",
			envelope_json: envelopeJson({ type: "REPLY", to: AGENT_ID, thread: "thread-missing-audit-1" }),
			body: null,
			apply_outcome: "rejected",
			received_at: NOW,
		};
		// Admitted directly with no `audits` entry — a ledger this build never writes on its own (see
		// the exported message's own doc), which is exactly the fault this refusal exists to surface.
		commitInboxBatch(db, { bot_id: BOT_ID, entries: [{ kind: "admitted", update: input }] });

		await assert.rejects(
			() => serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(NOW) }),
			(error: unknown) => error instanceof Error && error.message === FETCH_MISSING_REJECTION_AUDIT_MESSAGE,
		);
	});
});

test("max_batch is clamped to at least MIN_FETCH_BATCH: zero or negative never disables the SQLite LIMIT (JD-B-002)", async () => {
	await withLedger(async (db) => {
		[1, 2, 3].forEach((n) =>
			seedUpdateRow(db, { update_id: n, eid: `eid-clamp-${n}`, thread: `thread-clamp-${n}`, to: AGENT_ID, received_at: NOW }),
		);
		const binding = sampleBinding();

		const negative = await serveFetch(
			{ max_batch: -5 },
			{ db, binding, session: sampleSession("client-clamp-neg"), now: () => new Date(NOW) },
		);
		assert.equal(negative.log.length, 1, "a negative max_batch must bind a bounded LIMIT, not an unbounded one");

		const zero = await serveFetch(
			{ max_batch: 0 },
			{ db, binding, session: sampleSession("client-clamp-zero"), now: () => new Date(NOW) },
		);
		assert.equal(zero.log.length, 1, "max_batch: 0 must still read at least the floor of one row, or the cursor never advances");
	});
});

test("serveFetch's own module imports nothing from telegram or transport, and never shells out (D-26, JD-A-002)", () => {
	const fetchSrc = readFileSync(join(REPO_ROOT, "src/daemon/serve/fetch.ts"), "utf8");
	const specifiers = [...fetchSrc.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
	assert.ok(specifiers.length > 0, "sanity: the module must import something for this check to be non-vacuous");
	for (const specifier of specifiers) {
		assert.doesNotMatch(
			specifier,
			/telegram|transport\/|\/send\//,
			`import specifier must not reach telegram/transport/send: ${specifier}`,
		);
	}
	assert.doesNotMatch(fetchSrc, /child_process/, "the module must never shell out");
});

test("a brand-new client's first call being a peek still creates its cursor and reads rows, but advances and stamps nothing (JD-A-003a)", async () => {
	await withLedger(async (db) => {
		seedUpdateRow(db, {
			update_id: 1,
			eid: "eid-peek-first-1",
			thread: "thread-peek-first-1",
			to: AGENT_ID,
			received_at: NOW,
			body: "hello",
		});

		const result = await serveFetch(
			{ mark_seen: false },
			{ db, binding: sampleBinding(), session: sampleSession("client-peek-first"), now: () => new Date(NOW) },
		);

		assert.deepEqual(
			result.log.map((entry) => entry.eid),
			["eid-peek-first-1"],
			"a first-call peek still reads rows past the catch-up cursor",
		);

		const cursor = readClientCursor(db, "client-peek-first");
		assert.ok(cursor, "the cursor row must be created even on a peek");
		assert.equal(cursor?.inbox_seq, 0, "a fresh ledger's catch-up start is 0, and a peek must not move it");
		assert.equal(cursor?.last_surfaced_digest, null, "a peek must not stamp a digest");
		assert.deepEqual(
			[...readSurfacedThreads(db, "client-peek-first")],
			[],
			"a peek must not stamp any surfaced thread",
		);
	});
});

test("misaddressed and unanchored count over the full batch, before the checkpoint slice (JD-A-003b)", async () => {
	await withLedger(async (db) => {
		seedUpdateRow(db, {
			update_id: 1,
			eid: "eid-preckpt-misaddr",
			thread: "thread-preckpt-misaddr",
			to: "@stranger-agent",
			received_at: NOW,
			body: "before checkpoint, misaddressed",
		});
		seedRejectedUpdate(db, {
			update_id: 2,
			eid: "eid-preckpt-unanch",
			thread: "thread-preckpt-unanch",
			reason: "unanchored",
			received_at: NOW,
		});
		seedUpdateRow(db, {
			update_id: 3,
			eid: "eid-preckpt-ckpt",
			thread: "thread-preckpt-ckpt",
			type: "BROADCAST",
			to: null,
			received_at: LATER,
			body: `${CHECKPOINT_MARKER} snapshot`,
			apply_outcome: "noted",
		});

		const result = await serveFetch(
			{},
			{ db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(LATER2) },
		);

		assert.equal(result.log.length, 1, "the log is sliced to start at the checkpoint");
		assert.equal(result.log[0].eid, "eid-preckpt-ckpt");
		assert.equal(result.misaddressed, 1, "misaddressed counts the full batch, before the checkpoint slice");
		assert.equal(result.unanchored, 1, "unanchored counts the full batch, before the checkpoint slice");
	});
});

test("an aborted caller writes nothing, even with mark_seen true and rows that arrived during the wait (JD-A-005)", async () => {
	await withLedger(async (db) => {
		const binding = sampleBinding();
		const session = sampleSession("client-abort");
		const controller = new AbortController();
		const delay = (_ms: number, signal: AbortSignal): Promise<void> =>
			new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));

		const fetchPromise = serveFetch(
			{ timeout_s: 20 },
			{ db, binding, session, delay, signal: controller.signal, now: () => new Date(NOW) },
		);

		await new Promise((resolve) => setImmediate(resolve));
		seedUpdateRow(db, {
			update_id: 1,
			eid: "eid-abort-1",
			thread: "thread-abort-1",
			to: AGENT_ID,
			received_at: NOW,
			body: "arrived during the wait",
		});
		// No emit: the caller's own abort is what settles the wait, never the ledger event.
		controller.abort();

		const result = await fetchPromise;
		assert.deepEqual(
			result.log.map((entry) => entry.eid),
			["eid-abort-1"],
			"the row is still read and returned to the aborted call",
		);
		assert.equal(result.cursor.advanced, false, "an aborted call must report no advance");
		assert.equal(result.cursor.next_update_id, result.cursor.previous_update_id);

		const cursor = readClientCursor(db, "client-abort");
		assert.ok(cursor, "Step 1's ensureClientCursor still creates the row regardless of the abort");
		assert.equal(cursor?.inbox_seq, 0, "an aborted call must not advance the cursor");
		assert.equal(cursor?.last_surfaced_digest, null, "an aborted call must not stamp a digest");
		assert.deepEqual(
			[...readSurfacedThreads(db, "client-abort")],
			[],
			"an aborted call must not stamp any surfaced thread",
		);
	});
});

test("waiting_on_peer lists the threads this agent is party to and the peer owes, with the peer's text fenced and ours raw", async () => {
	await withLedger(async (db) => {
		writeThread(db, "thread-out", { from: AGENT_ID, to: PEER_AGENT_ID, to_user_id: PEER_USER_ID, awaiting: PEER_AGENT_ID, body: "my ask", opened_at: NOW });
		writeThread(db, "thread-in", { from: PEER_AGENT_ID, to: AGENT_ID, awaiting: PEER_AGENT_ID, body: "their ask", opened_at: LATER });
		writeThread(db, "thread-other", { from: PEER_AGENT_ID, to: "@carol-agent", to_user_id: null, awaiting: "@carol-agent", body: "not ours" });

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(LATER2) });

		assert.deepEqual(
			result.waiting_on_peer.map((entry) => [entry.thread, entry.direction, entry.peer]),
			[
				["thread-out", "outbound", PEER_AGENT_ID],
				["thread-in", "inbound", PEER_AGENT_ID],
			],
			"oldest first, and a thread this agent is not party to never appears",
		);
		assert.equal(result.waiting_on_peer[0].body, "my ask", "our own text is not fenced");
		const inbound = result.waiting_on_peer[1].body ?? "";
		assert.ok(inbound.startsWith("<UNTRUSTED-PEER-INPUT "), "the peer's text is fenced");
		assert.ok(inbound.includes(`agent_id="${PEER_AGENT_ID}" user_id="${PEER_USER_ID}"`), "with the peer's verified origin");
		assert.deepEqual(result.needs_action, [], "none of these await this agent");
	});
});

test("unannounced_closures lists resolved threads whose closure was never delivered, oldest resolution first", async () => {
	await withLedger(async (db) => {
		const resolved = { status: "resolved" as const, awaiting: null, resolved_by: AGENT_ID };
		writeThread(db, "thread-closed-late", { ...resolved, closure_delivered: false, resolved_at: LATER2, basis: "done later" });
		writeThread(db, "thread-closed-early", { ...resolved, closure_delivered: false, resolved_at: LATER, basis: "done" });
		writeThread(db, "thread-closed-delivered", { ...resolved, closure_delivered: true, resolved_at: LATER });
		writeThread(db, "thread-still-open", { closure_delivered: false });

		const result = await serveFetch({}, { db, binding: sampleBinding(), session: sampleSession("client-a"), now: () => new Date(LATER2) });

		assert.deepEqual(result.unannounced_closures, [
			{ thread: "thread-closed-early", to: AGENT_ID, resolved_at: LATER, basis: "done" },
			{ thread: "thread-closed-late", to: AGENT_ID, resolved_at: LATER2, basis: "done later" },
		]);
	});
});

test("force_full re-emits bodies a client already saw and never answers with the compact tick", async () => {
	await withLedger(async (db) => {
		writeThread(db, "thread-full", { awaiting: AGENT_ID, opened_at: NOW });
		const binding = sampleBinding();
		const session = sampleSession("client-a");
		await serveFetch({}, { db, binding, session, now: () => new Date(NOW) });

		const quiet = await serveFetch({}, { db, binding, session, now: () => new Date(NOW) });
		assert.equal(quiet.unchanged, true);
		assert.equal(quiet.needs_action[0].body_omitted, true);

		const full = await serveFetch({ force_full: true }, { db, binding, session, now: () => new Date(NOW) });
		assert.equal(full.unchanged, false, "force_full never compacts");
		assert.equal(full.needs_action[0].body_omitted, undefined);
		assert.ok(full.needs_action[0].body?.includes("opening body"), "force_full re-emits the body");
	});
});

test("an active gap_warning always breaks the compact tick, even when the digest did not move", async () => {
	await withLedger(async (db) => {
		writeThread(db, "thread-gap", { awaiting: AGENT_ID, opened_at: NOW });
		const binding = sampleBinding();
		const session = sampleSession("client-a");
		await serveFetch({}, { db, binding, session, now: () => new Date(NOW) });

		db.prepare("INSERT INTO offsets (bot_id, next_update_id, last_poll_ok_at) VALUES (?, 0, ?)").run(BOT_ID, "2026-01-01T00:00:00.000Z");
		const result = await serveFetch({}, { db, binding, session, now: () => new Date(NOW) });
		assert.ok(result.gap_warning !== undefined);
		assert.equal(result.unchanged, false, "a possible gap is news, so the full form is mandatory");
	});
});
