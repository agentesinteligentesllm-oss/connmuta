import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
	DEFERRED_MIGRATION_MESSAGE,
	LEDGER_MIGRATIONS,
	MIGRATION_PATH_UNAVAILABLE_MESSAGE,
	readLedgerSchemaVersion,
	runPendingMigrations,
	type LedgerMigration,
} from "../../src/ledger/migrations.js";
import { LEDGER_SCHEMA_DDL } from "../../src/ledger/schema.js";
import { DEFERRED_CALLBACK_MESSAGE } from "../../src/ledger/transaction.js";
import { LEDGER_SCHEMA_VERSION } from "../../src/shared/constants.js";

/**
 * The forward-only migration path (design §5.1) against a real `node:sqlite` connection.
 *
 * Three properties this suite owns: the shipped list is one contiguous ascending path that ends at
 * `LEDGER_SCHEMA_VERSION`; every entry is applied inside the transaction `withTransaction` opens, and
 * the version stamp happens inside that same transaction; and a failing migration leaves both the
 * schema and the version exactly as they were.
 *
 * The third parameter of `runPendingMigrations` is a seam used below to build paths the shipped list
 * cannot express — a second entry, a gap, a step that throws. The daemon never passes it.
 */

/** A probe table an injected migration can create, deliberately not part of the ledger's schema. */
const PROBE_TABLE = "probe_table";
const PROBE_DDL = `CREATE TABLE ${PROBE_TABLE} (id INTEGER PRIMARY KEY) STRICT`;

/** A second probe table, for the injected paths that need two steps. */
const PROBE_TABLE_TWO = `${PROBE_TABLE}_two`;
const PROBE_DDL_TWO = `CREATE TABLE ${PROBE_TABLE_TWO} (id INTEGER PRIMARY KEY) STRICT`;

/** Opens a fresh temp-file ledger, runs `operation`, and removes the directory even on failure. */
function withDatabase(operation: (db: DatabaseSync) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-ledger-migrations-"));
	const db = new DatabaseSync(join(dir, "ledger.db"));
	try {
		db.exec("PRAGMA journal_mode = WAL");
		db.exec("PRAGMA foreign_keys = ON");
		operation(db);
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Whether a table of that name exists. */
function hasTable(db: DatabaseSync, name: string): boolean {
	return db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

/** Every schema object a connection holds, for an equality check between two connections. */
function schemaObjects(db: DatabaseSync): { type: string; name: string }[] {
	return db
		.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
		.all() as { type: string; name: string }[];
}

test("the shipped migration path is one contiguous ascending run ending at LEDGER_SCHEMA_VERSION", () => {
	assert.ok(LEDGER_MIGRATIONS.length > 0, "expected at least one migration");

	// Contiguity is what makes both the gap refusal and the interpolated stamp below sound: entry `i`
	// carries `to === i + 1`, so every `to` is a positive integer and no version is skipped.
	LEDGER_MIGRATIONS.forEach((migration, index) => {
		assert.equal(migration.to, index + 1, `LEDGER_MIGRATIONS[${index}] must carry to === ${index + 1}`);
		assert.equal(typeof migration.up, "function", `LEDGER_MIGRATIONS[${index}].up must be a function`);
	});
	assert.equal(
		LEDGER_MIGRATIONS[LEDGER_MIGRATIONS.length - 1].to,
		LEDGER_SCHEMA_VERSION,
		"the path must end at LEDGER_SCHEMA_VERSION, so a forgotten migration cannot ship silently",
	);
});

test("readLedgerSchemaVersion reads the pragma SQLite keeps, whatever it holds", () => {
	withDatabase((db) => {
		assert.equal(readLedgerSchemaVersion(db), 0, "a fresh file is version 0");
		runPendingMigrations(db, 0);
		assert.equal(readLedgerSchemaVersion(db), LEDGER_SCHEMA_VERSION);
		db.exec("PRAGMA user_version = 99");
		assert.equal(readLedgerSchemaVersion(db), 99);
	});
});

test("the first migration applies LEDGER_SCHEMA_DDL itself — the schema objects match that text exactly", () => {
	withDatabase((db) => {
		const reference = new DatabaseSync(":memory:");
		try {
			reference.exec(LEDGER_SCHEMA_DDL);
			assert.equal(runPendingMigrations(db, 0), LEDGER_SCHEMA_VERSION);
			assert.equal(readLedgerSchemaVersion(db), LEDGER_SCHEMA_VERSION);
			// Equality against the DDL applied directly, so this pins "migration 1 is that text" rather
			// than re-listing the inventory `test/ledger/schema.test.ts` already owns.
			assert.deepEqual(schemaObjects(db), schemaObjects(reference));
		} finally {
			reference.close();
		}
	});
});

test("an already-migrated ledger runs no migration again (the DDL is not idempotent)", () => {
	withDatabase((db) => {
		assert.equal(runPendingMigrations(db, 0), LEDGER_SCHEMA_VERSION);
		// A second run at the current version must apply nothing: applying `LEDGER_SCHEMA_DDL` twice is an
		// error (`CREATE TABLE` without `IF NOT EXISTS`), so a re-run that threw would fail right here.
		assert.equal(runPendingMigrations(db, LEDGER_SCHEMA_VERSION), LEDGER_SCHEMA_VERSION);
		assert.equal(readLedgerSchemaVersion(db), LEDGER_SCHEMA_VERSION);
	});
});

test("a migration runs inside the transaction withTransaction opens, and the stamp is inside it too", () => {
	withDatabase((db) => {
		const seen: boolean[] = [];
		const migrations: LedgerMigration[] = [
			{
				to: 1,
				up: (handle) => {
					seen.push(handle.isTransaction);
					handle.exec(PROBE_DDL);
					// The stamp is the runner's, not the migration's, so the version is read after the run.
				},
			},
		];

		assert.equal(runPendingMigrations(db, 0, migrations), 1);
		assert.deepEqual(seen, [true], "the migration must observe an open transaction");
		assert.ok(hasTable(db, PROBE_TABLE));
		assert.equal(readLedgerSchemaVersion(db), 1);
	});
});

test("a migration that defers its own body is refused by withTransaction, not silently committed", () => {
	withDatabase((db) => {
		// An `async` migration resolves after this call, so its body would keep running — and writing —
		// outside the transaction. Only `withTransaction` answers this shape with its own refusal: a
		// hand-rolled BEGIN/COMMIT around the same callback would run it and commit.
		const deferred: LedgerMigration[] = [
			{
				to: 1,
				up: async (handle) => {
					await Promise.resolve();
					handle.exec(PROBE_DDL);
				},
			},
		];

		assert.throws(
			() => runPendingMigrations(db, 0, deferred),
			(error) => error instanceof Error && error.message === DEFERRED_CALLBACK_MESSAGE,
		);
		assert.equal(readLedgerSchemaVersion(db), 0, "the stamp must be rolled back with the batch");
	});
});

test("a generator migration is refused before its body could run, so no version can be stamped for nothing", () => {
	withDatabase((db) => {
		// Calling a generator function runs nothing, and the iterator it returns is not a thenable — the
		// shape `withTransaction` refuses. Without the runner's own check this migration would commit a
		// stamp (and a COMMIT) for a body that never ran, which is the silent schema failure this
		// refusal exists to make loud.
		const generatorSteps: LedgerMigration[] = [
			{
				to: 1,
				up: function* (handle: DatabaseSync) {
					handle.exec(PROBE_DDL);
				},
			},
		];

		assert.throws(
			() => runPendingMigrations(db, 0, generatorSteps),
			(error) => error instanceof Error && error.message === DEFERRED_MIGRATION_MESSAGE,
		);
		assert.equal(readLedgerSchemaVersion(db), 0);
		assert.ok(!hasTable(db, PROBE_TABLE), "nothing the generator body would have created may exist");
	});
});

test("a migration that throws leaves both the schema and the version untouched", () => {
	withDatabase((db) => {
		const failing: LedgerMigration[] = [
			{
				to: 1,
				up: (handle) => {
					handle.exec(LEDGER_SCHEMA_DDL);
					handle.exec(PROBE_DDL);
					// A version write inside the step, exactly like the runner's own stamp: measured on the
					// pinned build, SQLite rolls this pragma back with the transaction, which is what makes
					// stamping inside the step atomic with the step.
					handle.exec("PRAGMA user_version = 5");
					throw new Error("migration failed");
				},
			},
		];

		assert.throws(() => runPendingMigrations(db, 0, failing), /migration failed/);

		assert.equal(readLedgerSchemaVersion(db), 0, "the version must not move past a failed step");
		assert.ok(!hasTable(db, "updates"), "the DDL applied inside the step must be rolled back");
		assert.ok(!hasTable(db, PROBE_TABLE));
	});
});

test("each migration is its own transaction: the first survives the second's failure", () => {
	withDatabase((db) => {
		const twoSteps: LedgerMigration[] = [
			{ to: 1, up: (handle) => { handle.exec(PROBE_DDL); } },
			{ to: 2, up: () => { throw new Error("second step failed"); } },
		];

		assert.throws(() => runPendingMigrations(db, 0, twoSteps), /second step failed/);

		// Two transactions, not one for the whole run: step 1 is committed and stamped, step 2 is not.
		assert.equal(readLedgerSchemaVersion(db), 1);
		assert.ok(hasTable(db, PROBE_TABLE), "the committed step must survive the later failure");
	});
});

test("the stamp is written inside the step's own transaction, so a step that commits itself keeps both", () => {
	withDatabase((db) => {
		// The only injectable failure that tells the two placements apart. A step that *throws* leaves the
		// stamp unwritten under either placement, and a step that succeeds stamps under either; but a step
		// that commits the transaction itself and then makes the runner's COMMIT fail leaves exactly what was
		// inside the transaction. Measured on the pinned build: the callback's COMMIT persists its work and the
		// runner's own COMMIT then fails (PR-10's suite pins that same behaviour of `withTransaction`).
		const selfCommitting: LedgerMigration[] = [
			{
				to: 1,
				up: (handle) => {
					handle.exec(PROBE_DDL);
					handle.exec("COMMIT");
				},
			},
		];

		assert.throws(() => runPendingMigrations(db, 0, selfCommitting));

		// Committed together, or not at all: the schema the step applied and the version that records it.
		assert.equal(readLedgerSchemaVersion(db), 1, "the stamp must travel with the step's transaction");
		assert.ok(hasTable(db, PROBE_TABLE));
	});
});

test("a later step records its own version, not the first one's", () => {
	withDatabase((db) => {
		// Two steps that both succeed, which the shipped path (one step, and `LEDGER_SCHEMA_VERSION` = 1) cannot
		// express: the value of the stamp above version 1 is otherwise unpinned, and a stamp that always wrote
		// `1` would leave the next open believing step 2 still had to run.
		const twoSuccessfulSteps: LedgerMigration[] = [
			{ to: 1, up: (handle) => { handle.exec(PROBE_DDL); } },
			{ to: 2, up: (handle) => { handle.exec(PROBE_DDL_TWO); } },
		];

		assert.equal(runPendingMigrations(db, 0, twoSuccessfulSteps), 2);
		assert.equal(readLedgerSchemaVersion(db), 2, "the stamp must be the step's own `to`");
		assert.ok(hasTable(db, PROBE_TABLE));
		assert.ok(hasTable(db, PROBE_TABLE_TWO));

		// And because the recorded version really is 2, a second run applies nothing at all.
		assert.equal(runPendingMigrations(db, readLedgerSchemaVersion(db), twoSuccessfulSteps), 2);
	});
});

test("a version this build has no forward-only path from is refused, never skipped", () => {
	withDatabase((db) => {
		const refusals: { readonly name: string; readonly run: () => unknown }[] = [
			{ name: "a future version", run: () => runPendingMigrations(db, LEDGER_SCHEMA_VERSION + 1) },
			{ name: "a negative version", run: () => runPendingMigrations(db, -1) },
			{ name: "a non-integer version", run: () => runPendingMigrations(db, 0.5) },
			{
				name: "a gap in the path",
				run: () => runPendingMigrations(db, 0, [{ to: 1, up: () => undefined }, { to: 3, up: () => undefined }]),
			},
			{
				// The stamp is interpolated (SQLite refuses a bound parameter there), and this is what
				// makes that safe: contiguity forces `to` to be a positive integer.
				name: "a non-integer step",
				run: () => runPendingMigrations(db, 0, [{ to: 1.5, up: () => undefined }]),
			},
			{
				name: "a path that skips the first version",
				run: () => runPendingMigrations(db, 0, [{ to: 2, up: () => undefined }]),
			},
		];

		for (const refusal of refusals) {
			assert.throws(refusal.run, (error) => error instanceof Error && error.message === MIGRATION_PATH_UNAVAILABLE_MESSAGE, refusal.name);
		}

		assert.equal(readLedgerSchemaVersion(db), 0);
		assert.deepEqual(schemaObjects(db), [], "a refused path must leave no schema behind");
	});
});
