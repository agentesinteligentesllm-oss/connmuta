import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { LEDGER_SCHEMA_DDL } from "../../src/ledger/schema.js";

/**
 * The ledger's schema, version 1 (design §5.2): every object the DDL must create, the constraints it
 * must carry, and the two structural decisions the design states in prose.
 *
 * The DDL is data, so this suite's job is to check what the database *does* with it rather than to
 * read the SQL back. Two exceptions are deliberate and called out where they occur: `STRICT` and the
 * absence of a window constant are properties of the text itself, and each is checked together with a
 * control that proves the check can fail.
 *
 * Every value here is a placeholder (AGENTS.md §3): synthetic bot, group, chat and user ids, none of them
 * shaped like a credential. The PT-22 scan is `\b\d{8,10}:[A-Za-z0-9_-]{35}\b`, so its 8–10 digit window
 * only matters when a colon and 35 token characters follow the digits: the ids below (9 and 10 digits) sit
 * inside that window and are safe for exactly that reason, while a fixture that puts a colon after a digit
 * run must keep the run short — which is why `test/shared/secrets.test.ts` uses a 7-digit one.
 */

/**
 * design §5.2's inventory, authored from the gate's own text — never read back out of the DDL.
 *
 * That is the point of the first test below: a table the design names and the DDL forgot is a defect
 * this list can see, and a table the DDL adds that the design does not name is one too.
 */
const LEDGER_TABLES = [
	"audit_log",
	"binding_state",
	"client_cursors",
	"client_surfaced",
	"conditions",
	"offsets",
	"thread_history",
	"threads",
	"unknown_senders",
	"updates",
] as const;

/** The one derived object in the schema: `needs_action` is a VIEW, not a materialized table (ruling (d)). */
const LEDGER_VIEWS = ["needs_action"] as const;

/** The two indexes the design writes by hand; every other index in the database is a table constraint. */
const LEDGER_INDEXES = ["audit_log_project_ts", "threads_needs_action"] as const;

/**
 * SQLite's own result codes (`sqlite3.h`) for the constraint classes this schema leans on.
 *
 * Named because each assertion below is about *which* constraint refused: a row that fails on a
 * `UNIQUE` key would otherwise satisfy a test that only checked "something was refused", and the
 * tests would stop being able to fail for the reason they were written for.
 */
const SQLITE_CONSTRAINT_CHECK = 275;
const SQLITE_CONSTRAINT_UNIQUE = 2067;
const SQLITE_CONSTRAINT_FOREIGNKEY = 787;
const SQLITE_CONSTRAINT_DATATYPE = 3091;

/** SQLite's generic error code (`SQLITE_ERROR`), which a refused schema statement answers with. */
const SQLITE_ERROR = 1;

/**
 * Every closed vocabulary a CHECK in design §5.2 declares, with the values the design names.
 *
 * Driving both vocabulary tests from one table is deliberate: completeness and strictness are two
 * halves of the same claim, and a value added to one half but not the other is exactly the drift this
 * shape makes impossible.
 */
const VOCABULARIES: ReadonlyArray<{
	readonly table: string;
	readonly column: string;
	readonly values: readonly SQLInputValue[];
}> = [
	{ table: "updates", column: "via", values: ["group", "direct"] },
	{
		table: "updates",
		column: "apply_outcome",
		values: ["opened", "acked", "replied", "resolved", "noted", "not_mine", "ignored", "rejected"],
	},
	{ table: "threads", column: "status", values: ["open", "resolved"] },
	{ table: "threads", column: "opened_type", values: ["REQUEST", "BROADCAST"] },
	{ table: "threads", column: "via", values: ["group", "direct"] },
	{ table: "threads", column: "closure_delivered", values: [0, 1] },
	{ table: "thread_history", column: "via", values: ["group", "direct"] },
	{ table: "audit_log", column: "direction", values: ["send", "receive", "reject", "system"] },
	{ table: "audit_log", column: "outcome", values: ["ok", "degraded", "rejected", "dropped"] },
];

/** A value well outside any of those vocabularies, of the same storage class as the column. */
function outsideVocabulary(sample: SQLInputValue): SQLInputValue {
	return typeof sample === "number" ? 99 : "OUT_OF_VOCABULARY";
}

/**
 * design §5.2's NOT NULL columns, per table, authored from the DDL's own declarations.
 *
 * The three `INTEGER PRIMARY KEY` rowid aliases (`offsets.bot_id`, `updates.seq`, `audit_log.id`) are
 * deliberately absent: `pragma_table_info` reports the *declaration*, and a NULL cannot reach those columns
 * anyway — the value is the rowid SQLite assigns. Everything listed here is a column whose absence the
 * writers would otherwise have to defend against statement by statement, so a dropped `NOT NULL` is a data
 * -integrity hole and not a cosmetic edit.
 */
const LEDGER_NOT_NULL_COLUMNS: Readonly<Record<string, readonly string[]>> = {
	audit_log: ["direction", "outcome", "ts"],
	binding_state: ["project_id"],
	client_cursors: ["client_id", "inbox_seq", "last_seen_at", "project_id", "started_at"],
	client_surfaced: ["client_id", "first_surfaced_at", "thread_id"],
	conditions: ["name", "scope", "since"],
	offsets: ["next_update_id"],
	thread_history: ["at", "body", "eid", "from_agent_id", "project_id", "thread_id", "type", "via"],
	threads: [
		"ack_count",
		"body",
		"closure_delivered",
		"from_agent_id",
		"opened_at",
		"opened_eid",
		"opened_message_id",
		"opened_type",
		"project_id",
		"status",
		"thread_id",
		"updated_at",
		"via",
	],
	unknown_senders: ["bot_id", "count", "first_seen_at", "last_seen_at", "user_id"],
	updates: [
		"apply_outcome",
		"bot_id",
		"chat_id",
		"eid",
		"envelope_json",
		"from_agent_id",
		"from_user_id",
		"message_date",
		"message_id",
		"project_id",
		"received_at",
		"update_id",
		"via",
	],
};

/**
 * A fresh temp-file ledger with the DDL applied, removed when `operation` returns.
 *
 * `foreign_keys = ON` mirrors the daemon's open sequence (design §5.1); `node:sqlite` already defaults
 * it on, and the cascade assertions below are about the DDL's own `ON DELETE CASCADE` clauses rather
 * than about the pragma, so it is set explicitly instead of assumed.
 */
function withDatabase(operation: (db: DatabaseSync) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-ledger-schema-"));
	const db = new DatabaseSync(join(dir, "ledger.db"));
	try {
		db.exec("PRAGMA foreign_keys = ON");
		db.exec(LEDGER_SCHEMA_DDL);
		operation(db);
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Inserts one row from a plain object, binding every value positionally. */
function insertRow(db: DatabaseSync, table: string, row: Readonly<Record<string, SQLInputValue>>): void {
	const columns = Object.keys(row);
	const placeholders = columns.map(() => "?").join(", ");
	db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`).run(...columns.map((column) => row[column]));
}

/** The refusal `operation` produced, after checking it is a SQLite refusal and not a test bug. */
function refusalOf(operation: () => unknown): { readonly errcode: number; readonly message: string } {
	try {
		operation();
	} catch (error) {
		const refusal = error as { code?: unknown; message?: unknown; errcode?: unknown };
		assert.equal(refusal.code, "ERR_SQLITE_ERROR", `expected a SQLite refusal, got: ${String(error)}`);
		return { errcode: Number(refusal.errcode), message: String(refusal.message) };
	}
	assert.fail("expected the statement to be refused");
}

/**
 * Asserts that the statement is refused by `errcode` — and that the message names `names`.
 *
 * The second half is what keeps the assertion non-vacuous: a row that fails on a unique key, a
 * foreign key or a NOT NULL before the intended constraint is reached would satisfy the first half
 * while proving nothing about the constraint under test.
 */
function assertRefused(operation: () => unknown, expected: { errcode: number; names: string }): void {
	const refusal = refusalOf(operation);
	assert.equal(refusal.errcode, expected.errcode, `expected errcode ${expected.errcode}, got: ${refusal.message}`);
	assert.ok(
		refusal.message.includes(expected.names),
		`expected the refusal to name "${expected.names}", got: ${refusal.message}`,
	);
}

/** The columns of `table` or `view`, in declaration order. */
function columnsOf(db: DatabaseSync, table: string): Array<{ name: string; type: string; notNull: boolean }> {
	return db
		.prepare("SELECT name, type, \"notnull\" AS nn FROM pragma_table_info(?)")
		.all(table)
		.map((row) => ({ name: String(row.name), type: String(row.type), notNull: Number(row.nn) === 1 }));
}

/** How many rows `table` holds. */
function rowCount(db: DatabaseSync, table: string): number {
	const row = db.prepare(`SELECT count(*) AS c FROM ${table}`).get();
	assert.ok(row !== undefined, "count(*) always returns exactly one row");
	return Number(row.c);
}

/** The distinct numeric literals in `ddl`'s executable text, with its comment lines removed. */
function literalsOf(ddl: string): string[] {
	return [...new Set(ddl.replace(/--[^\n]*/gu, "").match(/\d+/gu) ?? [])].sort();
}

/** The highest `updates.seq` in the ledger — the position `client_cursors.inbox_seq` advances over. */
function highestSeq(db: DatabaseSync): number {
	const row = db.prepare("SELECT max(seq) AS m FROM updates").get();
	assert.ok(row !== undefined, "max() always returns exactly one row");
	return Number(row.m);
}

/** One `updates` row — PT-10's inbox, where the replay dedup and the outcome vocabulary live. */
function updatesRow(overrides: Readonly<Record<string, SQLInputValue>> = {}): Record<string, SQLInputValue> {
	return {
		bot_id: 100000001,
		update_id: 5001,
		project_id: "prj-example",
		chat_id: -1001234567890,
		via: "group",
		message_id: 7,
		message_date: 1700000000,
		from_user_id: 100000001,
		from_agent_id: "@alice-agent",
		eid: "eid-example-1",
		envelope_json: '{"type":"REQUEST"}',
		apply_outcome: "opened",
		received_at: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

/** One `threads` row — the projection source of `needs_action`. */
function threadsRow(overrides: Readonly<Record<string, SQLInputValue>> = {}): Record<string, SQLInputValue> {
	return {
		project_id: "prj-example",
		thread_id: "th-example",
		status: "open",
		opened_type: "REQUEST",
		opened_eid: "eid-example-1",
		from_agent_id: "@alice-agent",
		body: "please review the ledger DDL",
		opened_at: "2026-01-01T00:00:00Z",
		opened_message_id: 7,
		via: "group",
		updated_at: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

/** One `thread_history` row, parented to {@link threadsRow}'s default thread. */
function threadHistoryRow(overrides: Readonly<Record<string, SQLInputValue>> = {}): Record<string, SQLInputValue> {
	return {
		project_id: "prj-example",
		thread_id: "th-example",
		eid: "eid-history-1",
		type: "REQUEST",
		from_agent_id: "@alice-agent",
		body: "please review the ledger DDL",
		at: "2026-01-01T00:00:00Z",
		via: "group",
		...overrides,
	};
}

/** One `audit_log` row. The table has no body column at all, by schema (PT-20). */
function auditRow(overrides: Readonly<Record<string, SQLInputValue>> = {}): Record<string, SQLInputValue> {
	return {
		ts: "2026-01-01T00:00:00Z",
		project_id: "prj-example",
		bot_id: 100000001,
		chat_id: -1001234567890,
		direction: "receive",
		eid: "eid-example-1",
		outcome: "ok",
		...overrides,
	};
}

/**
 * The parent thread both vocabulary tests need: `thread_history` is foreign-keyed to `threads` on
 * `(project_id, thread_id)`, so its rows cannot be inserted on their own.
 */
function insertVocabularyParent(db: DatabaseSync): void {
	insertRow(db, "threads", threadsRow());
}

/** A row of `table` carrying `value` in `column`, with keys unique per `index`. */
function vocabularyRow(table: string, index: number, column: string, value: SQLInputValue): Record<string, SQLInputValue> {
	const override = { [column]: value };
	switch (table) {
		case "updates":
			return updatesRow({ update_id: 9000 + index, eid: `eid-vocab-${index}`, ...override });
		case "threads":
			return threadsRow({ thread_id: `th-vocab-${index}`, opened_eid: `eid-vocab-${index}`, ...override });
		case "thread_history":
			return threadHistoryRow({ eid: `eid-vocab-${index}`, ...override });
		case "audit_log":
			return auditRow(override);
		default:
			throw new Error(`no row builder for ${table}`);
	}
}

// --- The inventory (design §5.2) ---

test("the DDL creates exactly the objects design §5.2 names, and nothing else", () => {
	withDatabase((db) => {
		const objects = db
			.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
			.all();
		assert.ok(objects.length > 0, "expected the DDL to have created objects at all");

		const actual = objects.map((row) => `${String(row.type)}:${String(row.name)}`).sort();
		const expected = [
			...LEDGER_TABLES.map((name) => `table:${name}`),
			...LEDGER_VIEWS.map((name) => `view:${name}`),
			...LEDGER_INDEXES.map((name) => `index:${name}`),
		].sort();

		// Equality, not containment: a table the design does not name is as much a defect here as a
		// missing one, and `sqlite_sequence` (AUTOINCREMENT) is excluded by the name filter above.
		assert.deepEqual(actual, expected);
	});
});

test("every ledger table declares STRICT, and STRICT is load-bearing rather than declared", () => {
	withDatabase((db) => {
		const declared = db
			.prepare("SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND type = 'table'")
			.all();
		const strictTables = declared.filter((row) => Number(row.strict) === 1).map((row) => String(row.name));
		assert.deepEqual(strictTables.sort(), [...LEDGER_TABLES].sort(), "every ledger table declares STRICT");

		// A declaration is only worth having if it bites. The value below is refused here and stored by
		// the same DDL with STRICT removed, so the refusal cannot be a NOT NULL, CHECK or UNIQUE rule
		// reaching the row first.
		assertRefused(() => insertRow(db, "updates", updatesRow({ chat_id: "not-a-number" })), {
			errcode: SQLITE_CONSTRAINT_DATATYPE,
			names: "chat_id",
		});

		const looseDdl = LEDGER_SCHEMA_DDL.replace(/\) STRICT;/gu, ");");
		assert.notEqual(looseDdl, LEDGER_SCHEMA_DDL, "the control document must actually differ");
		const loose = new DatabaseSync(":memory:");
		try {
			loose.exec(looseDdl);
			insertRow(loose, "updates", updatesRow({ chat_id: "not-a-number" }));
			const stored = loose.prepare("SELECT typeof(chat_id) AS t FROM updates").get();
			assert.equal(String(stored?.t), "text", "without STRICT the same value is stored as TEXT");
		} finally {
			loose.close();
		}
	});
});

test("every NOT NULL column design §5.2 declares is NOT NULL, table by table", () => {
	withDatabase((db) => {
		for (const table of LEDGER_TABLES) {
			const expected = LEDGER_NOT_NULL_COLUMNS[table];
			assert.ok(expected !== undefined, `${table} must appear in the expectation table`);
			const notNull = columnsOf(db, table)
				.filter((column) => column.notNull)
				.map((column) => column.name)
				.sort();
			assert.deepEqual(notNull, [...expected], `${table}: the NOT NULL columns must be exactly the design's`);
		}

		// Non-vacuity: the expectation covers every table this suite knows about, so the loop above cannot be
		// short an entry, and the assertion has something to compare against.
		assert.equal(Object.keys(LEDGER_NOT_NULL_COLUMNS).length, LEDGER_TABLES.length);
	});
});

// --- The closed vocabularies ---

test("every value design §5.2 names in a CHECK vocabulary is accepted, so each vocabulary is complete", () => {
	withDatabase((db) => {
		insertVocabularyParent(db);
		let inserted = 0;
		for (const vocabulary of VOCABULARIES) {
			for (const value of vocabulary.values) {
				insertRow(db, vocabulary.table, vocabularyRow(vocabulary.table, inserted, vocabulary.column, value));
				inserted += 1;
			}
		}

		// Non-vacuity: every insert really landed, rather than being swallowed by a refusal that the
		// loop happened to catch. `threads` carries the one parent row in addition to its own values.
		const total = rowCount(db, "updates") + rowCount(db, "threads") + rowCount(db, "thread_history") + rowCount(db, "audit_log");
		assert.equal(total, inserted + 1);
	});
});

test("every value outside a CHECK vocabulary is refused, and the refusal names that column", () => {
	for (const vocabulary of VOCABULARIES) {
		withDatabase((db) => {
			insertVocabularyParent(db);

			// Baseline: the row itself is acceptable, so what follows is the vocabulary's doing. The two
			// rows differ in their keys as well, so the refusal cannot be a unique-key or foreign-key
			// refusal reaching the row before the CHECK does; the second assertion names the column so it
			// cannot be misread either.
			insertRow(db, vocabulary.table, vocabularyRow(vocabulary.table, 0, vocabulary.column, vocabulary.values[0] as SQLInputValue));

			const outside = outsideVocabulary(vocabulary.values[0] as SQLInputValue);
			assertRefused(() => insertRow(db, vocabulary.table, vocabularyRow(vocabulary.table, 1, vocabulary.column, outside)), {
				errcode: SQLITE_CONSTRAINT_CHECK,
				names: vocabulary.column,
			});
		});
	}
});

// --- The keys PT-10's replay and the seen-eids rule depend on ---

test("`updates` refuses a redelivered update on both unique keys, naming each key", () => {
	withDatabase((db) => {
		insertRow(db, "updates", updatesRow());

		// The same (bot_id, update_id) served again after a batch that did not commit: PT-10's
		// "replayed once, never lost" is this constraint plus `withTransaction`'s rollback.
		assertRefused(() => insertRow(db, "updates", updatesRow({ eid: "eid-example-2" })), {
			errcode: SQLITE_CONSTRAINT_UNIQUE,
			names: "updates.bot_id, updates.update_id",
		});
		// The same eid seen twice under different update ids: the seen-eids rule (ruling (d)).
		assertRefused(() => insertRow(db, "updates", updatesRow({ update_id: 5002 })), {
			errcode: SQLITE_CONSTRAINT_UNIQUE,
			names: "updates.project_id, updates.eid",
		});
	});
});

test("`updates.seq` stays monotonic across the full delete retention performs (AUTOINCREMENT)", () => {
	// `client_cursors.inbox_seq` is a position over this order, so a redelivered update written *below* a
	// client's cursor would never be surfaced again — the I-3 loss PT-10 exists to prevent. Without
	// `AUTOINCREMENT`, SQLite assigns `max(rowid) + 1` and a full `DELETE` resets the high-water mark:
	// measured on the pinned build, the next insert takes `seq` 1 instead of 4. Retention empties `updates`
	// on an idle binding, which is exactly that state, and no other assertion in this suite can see it.
	withDatabase((db) => {
		insertRow(db, "updates", updatesRow({ update_id: 5001, eid: "eid-seq-1" }));
		insertRow(db, "updates", updatesRow({ update_id: 5002, eid: "eid-seq-2" }));
		insertRow(db, "updates", updatesRow({ update_id: 5003, eid: "eid-seq-3" }));
		const highWater = highestSeq(db);
		assert.equal(highWater, 3, "the first three rows are 1, 2, 3");

		db.prepare("DELETE FROM updates").run();

		insertRow(db, "updates", updatesRow({ update_id: 5004, eid: "eid-seq-4" }));
		assert.equal(highestSeq(db), highWater + 1, "the sequence continues past the rows retention removed");
	});
});

test("both foreign keys cascade, and a dangling reference is refused", () => {
	withDatabase((db) => {
		insertRow(db, "threads", threadsRow());
		insertRow(db, "thread_history", threadHistoryRow());
		assertRefused(() => insertRow(db, "thread_history", threadHistoryRow({ thread_id: "th-missing", eid: "eid-history-2" })), {
			errcode: SQLITE_CONSTRAINT_FOREIGNKEY,
			names: "FOREIGN KEY",
		});

		assert.equal(rowCount(db, "thread_history"), 1);
		db.prepare("DELETE FROM threads WHERE thread_id = ?").run("th-example");
		assert.equal(rowCount(db, "thread_history"), 0, "a thread's history is deleted with it (retention prunes the thread)");

		insertRow(db, "client_cursors", { client_id: "client-example", project_id: "prj-example", started_at: "t", last_seen_at: "t" });
		insertRow(db, "client_surfaced", { client_id: "client-example", thread_id: "th-example", first_surfaced_at: "t" });
		assert.equal(rowCount(db, "client_surfaced"), 1);
		db.prepare("DELETE FROM client_cursors WHERE client_id = ?").run("client-example");
		assert.equal(rowCount(db, "client_surfaced"), 0, "a stale client's surfaced rows go with its cursor");
	});
});

test("the two indexes the design writes by hand carry the column order its queries need", () => {
	withDatabase((db) => {
		const shapeOf = (table: string, name: string) => {
			const entry = db
				.prepare("SELECT name, \"unique\" AS is_unique, origin FROM pragma_index_list(?)")
				.all(table)
				.find((row) => String(row.name) === name);
			assert.ok(entry !== undefined, `expected ${table} to carry the index ${name}`);
			return {
				unique: Number(entry.is_unique) === 1,
				origin: String(entry.origin),
				columns: db
					.prepare("SELECT name FROM pragma_index_info(?)")
					.all(name)
					.map((row) => String(row.name)),
			};
		};

		// `origin: "c"` is SQLite's mark for an index declared with CREATE INDEX, as opposed to one a
		// table constraint produced: the two must stay dropable/diffable by the name the design gives.
		assert.deepEqual(shapeOf("threads", "threads_needs_action"), {
			unique: false,
			origin: "c",
			columns: ["project_id", "status", "awaiting"],
		});
		assert.deepEqual(shapeOf("audit_log", "audit_log_project_ts"), { unique: false, origin: "c", columns: ["project_id", "ts"] });
	});
});

// --- The two structural decisions design §5.2 states in prose ---

test("the tables that must never hold a body have none, and `updates.body` is the nullable one", () => {
	withDatabase((db) => {
		for (const table of ["audit_log", "unknown_senders"]) {
			assert.deepEqual(
				columnsOf(db, table).filter((column) => column.name.includes("body")),
				[],
				`${table} must have no body column at all, by schema (PT-20 / ADR-0028 rule 6)`,
			);
		}

		const body = columnsOf(db, "updates").find((column) => column.name === "body");
		assert.ok(body !== undefined, "`updates` carries the peer body");
		assert.equal(body.notNull, false, "`updates.body` is the nullable column; the NULL-for-rejected coupling is a writer rule (D-20, PR-12), not something this DDL enforces");
		assert.equal(body.type, "TEXT");

		// The three tables that legitimately hold a peer body, named so a fourth cannot appear unnoticed.
		assert.deepEqual(
			LEDGER_TABLES.filter((table) => columnsOf(db, table).some((column) => column.name === "body")),
			["thread_history", "threads", "updates"],
		);
	});
});

test("`needs_action` projects the waiting turn only, and projects raw columns only", () => {
	withDatabase((db) => {
		// The view exposes the thread's own columns and no derived one: the age/reminder math lives in
		// TypeScript (design §5.2's note), so no window constant can reach the DDL through the view.
		assert.deepEqual(columnsOf(db, "needs_action").map((column) => column.name), [
			"project_id",
			"thread_id",
			"from_agent_id",
			"awaiting",
			"opened_at",
			"ack_count",
			"acked_at",
		]);

		// One row per branch of the view's predicate: open + REQUEST + an awaiting anchor is the turn
		// that is waiting; the other three are not.
		insertRow(db, "threads", threadsRow({ thread_id: "th-waiting", awaiting: "@alice-agent" }));
		insertRow(db, "threads", threadsRow({ thread_id: "th-no-anchor" }));
		insertRow(db, "threads", threadsRow({ thread_id: "th-broadcast", opened_type: "BROADCAST", awaiting: "@alice-agent" }));
		insertRow(db, "threads", threadsRow({ thread_id: "th-resolved", status: "resolved", awaiting: "@alice-agent" }));

		const projected = () => db.prepare("SELECT thread_id FROM needs_action").all().map((row) => String(row.thread_id)).sort();
		assert.deepEqual(projected(), ["th-waiting"]);

		// The anchor is what makes a REQUEST waiting, so setting it brings the row in: ADR-0027's rule that
		// `needs_action` describes the turn that is waiting rather than the thread's opening, which here is the
		// VIEW's predicate (design §5.2 ruling (d), `specs/durable-inbox/spec.md`).
		db.prepare("UPDATE threads SET awaiting = ? WHERE thread_id = ?").run("@alice-agent", "th-no-anchor");
		assert.deepEqual(projected(), ["th-no-anchor", "th-waiting"]);

		// Resolving the waiting thread takes it back out, which is the direction a stale projection
		// would fail.
		db.prepare("UPDATE threads SET status = ? WHERE thread_id = ?").run("resolved", "th-waiting");
		assert.deepEqual(projected(), ["th-no-anchor"]);
	});
});

test("the DDL stamps no schema version: the open sequence owns `PRAGMA user_version`", () => {
	withDatabase((db) => {
		const version = db.prepare("PRAGMA user_version").get();
		// `ledger/open.ts` reads this value to decide whether to migrate (design §5.1) and writes
		// `LEDGER_SCHEMA_VERSION` itself (PR-11). A DDL that stamped it here would make the first
		// migration unreachable, which is why this is pinned as a boundary rather than left implied.
		assert.equal(Number(version?.user_version), 0);
	});
});

test("the DDL refuses a second application, so a migration cannot silently no-op", () => {
	withDatabase((db) => {
		// `CREATE TABLE` is not idempotent, and the first table the executor reaches is the one that refuses.
		assertRefused(() => db.exec(LEDGER_SCHEMA_DDL), { errcode: SQLITE_ERROR, names: "table offsets already exists" });

		// The text check is what makes this complete rather than partial: the assertion above can only see the
		// *first* statement, so an `IF NOT EXISTS` added to a later table would leave it failing on `offsets`
		// while the rest of the DDL silently no-opped. Measured: exactly that mutation (adding it to `offsets`)
		// kept the behavioural assertion above green, which is why this line exists.
		assert.equal(
			LEDGER_SCHEMA_DDL.includes("IF NOT EXISTS"),
			false,
			"no statement may be a no-op on a second application",
		);
	});
});

test("the DDL's executable text carries no window constant, so the retention math cannot drift into SQL", () => {
	// design §5.2: "the per-agent filter (`awaiting = ?`) and the reminder math ... stay in TypeScript
	// so no window constant appears in DDL". Comments are stripped first because they cite `PT-10`,
	// `PT-20` and `ADR-0028` by id, and those ids are not constants.
	assert.deepEqual(literalsOf(LEDGER_SCHEMA_DDL), ["0", "1"]);

	// The control this suite promises for its second text-level check: the same scan has to flag a mutated
	// DDL, so "no window constant" is a property of the text rather than of a scan that cannot see one.
	const withWindow = LEDGER_SCHEMA_DDL.replace(
		"next_update_id INTEGER NOT NULL DEFAULT 0",
		"next_update_id INTEGER NOT NULL DEFAULT 7",
	);
	assert.notEqual(withWindow, LEDGER_SCHEMA_DDL, "the control document must actually differ");
	assert.deepEqual(literalsOf(withWindow), ["0", "1", "7"]);
});
