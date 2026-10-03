import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { commitInboxBatch, type InboxBatchEntry, type InboxUpdateInput } from "../../../src/ledger/inbox.js";
import { ensureClientCursor, markThreadsSurfaced } from "../../../src/ledger/cursors.js";
import { DOORBELL_SCAN_DEPTH, FETCH_LONGPOLL_MAX_SECONDS } from "../../../src/shared/constants.js";
import { doorbellResponseSchema } from "../../../src/shared/ipc-contract.js";
import { serveDoorbell, type DoorbellServeBinding } from "../../../src/daemon/serve/doorbell.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * `daemon/serve/doorbell.ts` (F4 PR-03, design D3/D4/D5, spec `channel-doorbell`).
 *
 * A real `node:sqlite` ledger per test, seeded through `commitInboxBatch` in one batch per scenario
 * (a backlog of 2×DOORBELL_SCAN_DEPTH+1 rows is one transaction, not 201). This suite pins the SERVE
 * half — the summary, the wait, the gate — against rows a batch already produced; the fetch suite's
 * harness pattern is mirrored, including its fake emitter and injectable `delay`.
 *
 * Every id below is a placeholder (AGENTS.md §3) and wire-shaped, so the response can be parsed by
 * `doorbellResponseSchema` without a fixture the schema would refuse.
 */

const BOT_ID = 900000031;
const PROJECT_ID = "project-f4-pr03";
const GROUP_ID = -1009876543210;
const AGENT_ID = "@alice-agent";
const PEER_AGENT_ID = "@bob-agent";
const OTHER_AGENT_ID = "@carol-agent";
const AGENT_USER_ID = 700000001;
const PEER_USER_ID = 700000002;
const UNKNOWN_USER_ID = 700000099;
const NOW = "2026-02-01T12:00:00.000Z";
const SENTINEL_BODY = "SENTINEL-BODY-DO-NOT-LEAK-7f3a";

const ROSTER = [
	{ agent_id: AGENT_ID, user_id: AGENT_USER_ID, username: "alice" },
	{ agent_id: PEER_AGENT_ID, user_id: PEER_USER_ID, username: "bob" },
];

function binding(): DoorbellServeBinding {
	return { project_id: PROJECT_ID, agent_id: AGENT_ID, roster_snapshot: ROSTER };
}

function withLedger(run: (db: DatabaseSync) => Promise<void> | void): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-doorbell-"));
	const ledger = openLedger({ homeDir: home });
	return Promise.resolve(run(ledger.db)).finally(() => {
		try {
			ledger.db.close();
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
}

interface SeedOptions {
	readonly n: number;
	readonly type?: string;
	readonly to?: string | null;
	readonly thread?: string;
	readonly via?: "group" | "direct";
	readonly from_agent_id?: string;
	readonly from_user_id?: number;
	readonly body?: string;
	/** The stored `envelope_json` text verbatim, overriding `type`/`to`/`thread`; how a corrupt row is planted. */
	readonly envelope_json?: string;
}

/** A 12-lowercase-hex id, distinct per `n` (the wire's `eid`/`thread` shape). */
function hexId(n: number): string {
	return n.toString(16).padStart(12, "0");
}

function seedEntry(opts: SeedOptions): InboxBatchEntry {
	const update: InboxUpdateInput = {
		update_id: opts.n,
		project_id: PROJECT_ID,
		chat_id: GROUP_ID,
		via: opts.via ?? "direct",
		message_id: 6000 + opts.n,
		message_date: Math.floor(Date.parse(NOW) / 1000),
		from_user_id: opts.from_user_id ?? PEER_USER_ID,
		from_agent_id: opts.from_agent_id ?? PEER_AGENT_ID,
		eid: hexId(opts.n),
		envelope_json:
			opts.envelope_json ??
			JSON.stringify({
				type: opts.type ?? "REQUEST",
				to: opts.to === undefined ? AGENT_ID : opts.to,
				thread: opts.thread ?? hexId(opts.n),
			}),
		body: opts.body ?? `body of ${opts.n}`,
		apply_outcome: "opened",
		received_at: NOW,
	};
	return { kind: "admitted", update };
}

function seed(db: DatabaseSync, options: readonly SeedOptions[]): void {
	commitInboxBatch(db, { bot_id: BOT_ID, entries: options.map(seedEntry) });
}

/** `count` relevant rows (direct, from the peer), with distinct threads, numbered from `first`. */
function relevantRows(first: number, count: number): SeedOptions[] {
	return Array.from({ length: count }, (_, i) => ({ n: first + i }));
}

function maxSeq(db: DatabaseSync): number {
	return (db.prepare("SELECT COALESCE(MAX(seq), 0) AS m FROM updates").get() as { m: number }).m;
}

function neverElapsingDelay(record?: (ms: number) => void): (ms: number, signal: AbortSignal) => Promise<void> {
	return (ms, signal) =>
		new Promise((resolve) => {
			record?.(ms);
			signal.addEventListener("abort", () => resolve(), { once: true });
		});
}

function snapshotClientState(db: DatabaseSync): string {
	return JSON.stringify({
		cursors: db.prepare("SELECT * FROM client_cursors ORDER BY client_id").all(),
		surfaced: db.prepare("SELECT * FROM client_surfaced ORDER BY client_id, thread_id").all(),
	});
}

test("the same after_seq issued twice with no intervening commit returns the same summary", async () => {
	await withLedger(async (db) => {
		seed(db, [{ n: 1, type: "REQUEST" }, { n: 2, type: "BROADCAST", to: null, via: "group" }]);
		const first = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		const second = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.deepEqual(second, first);
		assert.equal(first.count, 2);
	});
});

test("the response carries only the closed field set and parses under doorbellResponseSchema", async () => {
	await withLedger(async (db) => {
		seed(db, [{ n: 1 }]);
		const summary = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.deepEqual(Object.keys(summary).sort(), ["count", "covered_through_seq", "saturated", "senders", "threads", "types"]);
		assert.equal(doorbellResponseSchema.safeParse(summary).success, true);
	});
});

test("an empty scan reports count 0, empty lists, covered_through_seq === after_seq and saturated false", async () => {
	await withLedger(async (db) => {
		const summary = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.deepEqual(summary, { count: 0, senders: [], types: [], threads: [], covered_through_seq: 0, saturated: false });
		seed(db, [{ n: 1 }]);
		const past = await serveDoorbell({ after_seq: maxSeq(db) }, { db, binding: binding() });
		assert.deepEqual(past, { count: 0, senders: [], types: [], threads: [], covered_through_seq: maxSeq(db), saturated: false });
	});
});

test("senders, types and threads are unique and sorted while count is the true relevant total", async () => {
	await withLedger(async (db) => {
		seed(db, [
			{ n: 1, type: "REPLY", thread: hexId(0xbb) },
			{ n: 2, type: "ACK", thread: hexId(0xaa) },
			{ n: 3, type: "REPLY", thread: hexId(0xbb) },
		]);
		const summary = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.equal(summary.count, 3);
		assert.deepEqual(summary.senders, [PEER_AGENT_ID]);
		assert.deepEqual(summary.types, ["ACK", "REPLY"]);
		assert.deepEqual(summary.threads, [hexId(0xaa), hexId(0xbb)]);
	});
});

test("client_cursors and client_surfaced are byte-identical after a read, whether or not it found rows", async () => {
	await withLedger(async (db) => {
		ensureClientCursor(db, { client_id: "client-a", project_id: PROJECT_ID, started_at: NOW, now: NOW });
		markThreadsSurfaced(db, "client-a", [hexId(1)], NOW);
		const before = snapshotClientState(db);

		await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.equal(snapshotClientState(db), before, "an empty read must not touch client state");

		seed(db, [{ n: 1 }]);
		const found = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.equal(found.count, 1);
		assert.equal(snapshotClientState(db), before, "a read that found rows must not touch client state");
	});
});

test("the read subscribes to inbox:<project_id> before its first await, so a synchronous emit right after the empty read is seen", async () => {
	await withLedger(async (db) => {
		const emitter = new EventEmitter();
		// The delay never elapses on its own: only the event can settle this call.
		const pending = serveDoorbell({ after_seq: 0, timeout_s: 20 }, { db, binding: binding(), emitter, delay: neverElapsingDelay() });
		assert.equal(emitter.listenerCount(`inbox:${PROJECT_ID}`), 1, "subscribed before the caller's next statement");

		seed(db, [{ n: 1 }]);
		emitter.emit(`inbox:${PROJECT_ID}`);

		const summary = await pending;
		assert.equal(summary.count, 1);
		assert.equal(emitter.listenerCount(`inbox:${PROJECT_ID}`), 0, "the listener is removed on exit");
	});
});

test("the effective wait is clamped to FETCH_LONGPOLL_MAX_SECONDS whatever timeout_s the caller sends", async () => {
	await withLedger(async (db) => {
		const recorded: number[] = [];
		const delay = async (ms: number): Promise<void> => {
			recorded.push(ms);
		};
		await serveDoorbell({ after_seq: 0, timeout_s: 100000 }, { db, binding: binding(), emitter: new EventEmitter(), delay });
		assert.deepEqual(recorded, [FETCH_LONGPOLL_MAX_SECONDS * 1000]);

		recorded.length = 0;
		await serveDoorbell({ after_seq: 0, timeout_s: 0 }, { db, binding: binding(), delay });
		await serveDoorbell({ after_seq: 0 }, { db, binding: binding(), delay });
		assert.deepEqual(recorded, [], "no wait without a positive timeout_s");
	});
});

test("a backlog is never waited on: rows past after_seq answer at once even with a positive timeout_s", async () => {
	await withLedger(async (db) => {
		seed(db, [{ n: 1 }]);
		const recorded: number[] = [];
		const delay = async (ms: number): Promise<void> => {
			recorded.push(ms);
		};
		const summary = await serveDoorbell({ after_seq: 0, timeout_s: 20 }, { db, binding: binding(), delay });
		assert.equal(summary.count, 1);
		assert.deepEqual(recorded, []);
	});
});

test("a backlog of 2×DOORBELL_SCAN_DEPTH+1 rows is fully covered across repeated calls with an advancing after_seq", async () => {
	await withLedger(async (db) => {
		const total = 2 * DOORBELL_SCAN_DEPTH + 1;
		seed(db, relevantRows(1, total));
		const tail = maxSeq(db);

		let afterSeq = 0;
		let counted = 0;
		const saturation: boolean[] = [];
		for (let page = 0; page < 5 && afterSeq < tail; page += 1) {
			const summary = await serveDoorbell({ after_seq: afterSeq }, { db, binding: binding() });
			assert.ok(summary.covered_through_seq > afterSeq, "every page advances past after_seq");
			counted += summary.count;
			saturation.push(summary.saturated);
			afterSeq = summary.covered_through_seq;
		}
		assert.equal(afterSeq, tail, "the pages together reach the tail");
		assert.equal(counted, total, "no row is skipped or counted twice");
		assert.deepEqual(saturation, [true, true, false], "only the last page is unsaturated");
	});
});

test("exactly DOORBELL_SCAN_DEPTH rows is saturated:false and DOORBELL_SCAN_DEPTH+1 is saturated:true, covering the last EXAMINED row", async () => {
	await withLedger(async (db) => {
		seed(db, relevantRows(1, DOORBELL_SCAN_DEPTH));
		const exact = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.equal(exact.saturated, false);
		assert.equal(exact.count, DOORBELL_SCAN_DEPTH);
		assert.equal(exact.covered_through_seq, maxSeq(db));

		seed(db, relevantRows(DOORBELL_SCAN_DEPTH + 1, 1));
		const over = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.equal(over.saturated, true);
		assert.equal(over.count, DOORBELL_SCAN_DEPTH);
		assert.equal(over.covered_through_seq, maxSeq(db) - 1, "the probe row is never reported as covered");
	});
});

test("a non-roster from_user_id row and an own-agent row never count toward the summary", async () => {
	await withLedger(async (db) => {
		seed(db, [
			// A user id the roster does not hold: the reverse lookup yields null, whatever agent id the row claims.
			{ n: 1, from_user_id: UNKNOWN_USER_ID, from_agent_id: PEER_AGENT_ID },
			// A roster user id whose stored agent id disagrees with the lookup (a sender that left or was remapped).
			{ n: 2, from_user_id: PEER_USER_ID, from_agent_id: OTHER_AGENT_ID },
			// The agent's own row.
			{ n: 3, from_user_id: AGENT_USER_ID, from_agent_id: AGENT_ID },
		]);
		const summary = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.equal(summary.count, 0);
		assert.deepEqual([summary.senders, summary.types, summary.threads], [[], [], []]);
		assert.equal(summary.covered_through_seq, maxSeq(db), "gated rows are still examined");
	});
});

test("relevance is direct, BROADCAST or stored-to === agent_id: a group row to another agent is not relevant but still advances covered_through_seq", async () => {
	await withLedger(async (db) => {
		seed(db, [{ n: 1, via: "group", to: OTHER_AGENT_ID, type: "REQUEST" }]);
		const skipped = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.equal(skipped.count, 0);
		assert.equal(skipped.covered_through_seq, 1);

		seed(db, [
			{ n: 2, via: "direct", to: OTHER_AGENT_ID, type: "REQUEST" },
			{ n: 3, via: "group", to: null, type: "BROADCAST" },
			{ n: 4, via: "group", to: AGENT_ID, type: "REPLY" },
		]);
		const counted = await serveDoorbell({ after_seq: 1 }, { db, binding: binding() });
		assert.equal(counted.count, 3);
		assert.deepEqual(counted.types, ["BROADCAST", "REPLY", "REQUEST"]);
	});
});

/**
 * Stored `envelope_json` texts the doorbell cannot turn into a summary entry its own response schema accepts.
 * Each is seeded from a roster-verified peer, so it passes the sender gate and really reaches the parse.
 */
const UNREADABLE_ENVELOPES: ReadonlyArray<readonly [name: string, envelopeJson: string]> = [
	["malformed JSON text", "{not json"],
	["the JSON number 123", "123"],
	["the JSON null", "null"],
	["a JSON array", "[]"],
	["an object with no fields", "{}"],
	["a type outside ENVELOPE_TYPES", JSON.stringify({ type: "SHOUT", to: AGENT_ID, thread: hexId(2) })],
	["a non-string type", JSON.stringify({ type: 7, to: AGENT_ID, thread: hexId(2) })],
	["a thread violating THREAD_PATTERN", JSON.stringify({ type: "REQUEST", to: AGENT_ID, thread: "NOT-A-THREAD" })],
	["a non-string thread", JSON.stringify({ type: "REQUEST", to: AGENT_ID, thread: 2 })],
	["a non-string to", JSON.stringify({ type: "REQUEST", to: 2, thread: hexId(2) })],
	["an empty string to", JSON.stringify({ type: "REQUEST", to: "", thread: hexId(2) })],
	["an invalid to agent id pattern", JSON.stringify({ type: "REQUEST", to: "not-an-agent-id", thread: hexId(2) })],
];

for (const [name, envelopeJson] of UNREADABLE_ENVELOPES) {
	test(`a stored envelope with ${name} is skipped, not thrown on: only the readable rows count, and it is still covered`, async () => {
		await withLedger(async (db) => {
			seed(db, [
				{ n: 1, type: "REQUEST", thread: hexId(1) },
				{ n: 2, envelope_json: envelopeJson },
				{ n: 3, type: "REPLY", thread: hexId(3) },
			]);
			const summary = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
			assert.deepEqual(doorbellResponseSchema.parse(summary), {
				count: 2,
				senders: [PEER_AGENT_ID],
				types: ["REPLY", "REQUEST"],
				threads: [hexId(1), hexId(3)],
				covered_through_seq: maxSeq(db),
				saturated: false,
			});
		});
	});
}

test("a window of nothing but unreadable rows answers count 0 with empty lists and advances covered_through_seq, so the adapter cannot stall on it", async () => {
	await withLedger(async (db) => {
		seed(db, UNREADABLE_ENVELOPES.map(([, envelope_json], index) => ({ n: index + 1, envelope_json })));
		const summary = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.equal(maxSeq(db), UNREADABLE_ENVELOPES.length, "sanity: every seeded row is in the ledger");
		assert.deepEqual(doorbellResponseSchema.parse(summary), {
			count: 0,
			senders: [],
			types: [],
			threads: [],
			covered_through_seq: maxSeq(db),
			saturated: false,
		});
	});
});

test("a seeded sentinel updates.body value never appears anywhere in the response JSON", async () => {
	await withLedger(async (db) => {
		seed(db, [{ n: 1, body: SENTINEL_BODY }, { n: 2, body: SENTINEL_BODY, type: "BROADCAST", to: null, via: "group" }]);
		const stored = db.prepare("SELECT COUNT(*) AS n FROM updates WHERE body = ?").get(SENTINEL_BODY) as { n: number };
		assert.equal(stored.n, 2, "sanity: the sentinel really is in the ledger");
		const summary = await serveDoorbell({ after_seq: 0 }, { db, binding: binding() });
		assert.equal(summary.count, 2);
		assert.doesNotMatch(JSON.stringify(summary), new RegExp(SENTINEL_BODY));
	});
});

test("the module's own SQL text names no body column and the module imports no ledger write path", () => {
	const source = readFileSync(join(REPO_ROOT, "src/daemon/serve/doorbell.ts"), "utf8");

	const sqlTexts = [...source.matchAll(/prepare\(\s*(?:`([^`]*)`|"([^"]*)")/g)].map((match) => match[1] ?? match[2]);
	assert.ok(sqlTexts.length > 0, "sanity: the module must prepare some SQL for this check to be non-vacuous");
	for (const sql of sqlTexts) {
		assert.doesNotMatch(sql, /\bbody\b/i, `SQL must not name a body column: ${sql}`);
		assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i, `SQL must be read-only: ${sql}`);
	}

	const specifiers = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
	assert.ok(specifiers.length > 0, "sanity: the module must import something for this check to be non-vacuous");
	for (const specifier of specifiers) {
		assert.doesNotMatch(specifier, /ledger\/(cursors|transaction|audit)/, `write-path import: ${specifier}`);
		assert.doesNotMatch(specifier, /telegram|transport\/|\/send\//, `must not reach telegram/transport/send: ${specifier}`);
	}
	assert.doesNotMatch(source, /child_process/, "the module must never shell out");
});
