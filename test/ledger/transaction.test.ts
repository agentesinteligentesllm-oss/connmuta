import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { NESTED_TRANSACTION_MESSAGE, withTransaction } from "../../src/ledger/transaction.js";

/**
 * The `node:sqlite` transaction spike (design §5.3): the idiom `withTransaction` relies on, confirmed
 * on the pinned Node build **before** PR-12's inbox writer depends on it.
 *
 * `node:sqlite` documents no `db.transaction(fn)` wrapper (exploration Q7), so the daemon owns the
 * idiom. This suite is the evidence that it holds — and the reason the idiom is not an ADR: it is an
 * implementation detail behind `withTransaction`.
 *
 * The suite runs against a real file database in WAL with foreign keys on, the footing `ledger/open.ts`
 * will open it on (design §5.1). Both pragmas are set, never asserted: the open sequence is PR-11's
 * subject, not this suite's.
 */

/**
 * A minimal table, deliberately not the ledger's own DDL.
 *
 * The transaction boundary is what this suite pins; the full schema is `test/ledger/schema.test.ts`'s
 * subject. Keeping the two apart means a mistake in the DDL cannot make a rollback test fail for the
 * wrong reason.
 */
const PROBE_DDL = "CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT";

/**
 * SQLite's own result code for a locked database (`sqlite3.h`, `SQLITE_BUSY`).
 *
 * Named because the assertion below is about the *class* of refusal — the writer's lock, taken at
 * `BEGIN IMMEDIATE` and not later — and a bare `5` in an assertion is a number nobody can check.
 */
const SQLITE_BUSY = 5;

/** Opens a fresh temp-file ledger, runs `operation`, and removes the directory even on failure. */
function withDatabase(operation: (db: DatabaseSync, path: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-ledger-"));
	const path = join(dir, "ledger.db");
	const db = new DatabaseSync(path);
	try {
		db.exec("PRAGMA journal_mode = WAL");
		db.exec("PRAGMA foreign_keys = ON");
		db.exec(PROBE_DDL);
		operation(db, path);
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
}

/** One row in `probe`, written by the connection the test is driving. */
function insert(db: DatabaseSync, id: number): void {
	db.prepare("INSERT INTO probe (id, value) VALUES (?, ?)").run(id, `row-${id}`);
}

/** How many rows `probe` holds right now, read through a fresh statement. */
function rowCount(db: DatabaseSync): number {
	const row = db.prepare("SELECT count(*) AS c FROM probe").get();
	assert.ok(row !== undefined, "count(*) always returns exactly one row");
	return Number(row.c);
}

/** The refusal `operation` produced, after checking it is a SQLite refusal and not a test bug. */
function refusalOf(operation: () => void): { readonly errcode: number; readonly message: string } {
	try {
		operation();
	} catch (error) {
		const refusal = error as { code?: unknown; message?: unknown; errcode?: unknown };
		assert.equal(refusal.code, "ERR_SQLITE_ERROR", "expected a SQLite refusal, not another failure");
		return { errcode: Number(refusal.errcode), message: String(refusal.message) };
	}
	assert.fail("expected the operation to be refused");
}

test("a committed callback's writes are durable, its value survives, and no transaction is left open", () => {
	withDatabase((db) => {
		assert.equal(db.isTransaction, false, "a fresh connection holds no transaction");

		const value = withTransaction(db, () => {
			assert.equal(db.isTransaction, true, "`BEGIN IMMEDIATE` must be observable inside the callback");
			insert(db, 1);
			return "committed";
		});

		assert.equal(value, "committed", "the callback's value reaches the caller (PR-12's writer returns counts)");
		assert.equal(rowCount(db), 1, "the row committed with the transaction");
		assert.equal(db.isTransaction, false, "the connection must be reusable for the next poll batch");
	});
});

test("a throw inside the callback leaves no row, rethrows the caller's own error, and leaves the connection usable", () => {
	withDatabase((db) => {
		const failure = new Error("synthetic failure between the inbox insert and the offset advance");
		let caught: unknown;
		try {
			withTransaction(db, () => {
				insert(db, 1);
				insert(db, 2);
				assert.equal(rowCount(db), 2, "the rows are visible inside the transaction, so the rollback is not a no-op");
				throw failure;
			});
		} catch (error) {
			caught = error;
		}

		assert.equal(caught, failure, "the caller's own error surfaces unchanged, never a rollback complaint");
		assert.equal(rowCount(db), 0, "everything written before the throw is rolled back");
		assert.equal(db.isTransaction, false, "no transaction is left open");

		withTransaction(db, () => insert(db, 3));
		assert.equal(rowCount(db), 1, "the connection is usable and the next batch commits — PT-10's replay path");
	});
});

test("a nested call is refused with this module's own error and does not damage the transaction already open", () => {
	withDatabase((db) => {
		const value = withTransaction(db, () => {
			assert.throws(
				() => withTransaction(db, () => {}),
				{ message: NESTED_TRANSACTION_MESSAGE },
				"a nested call is refused by this module before any SQL runs (no savepoints in F1)",
			);
			assert.equal(
				db.isTransaction,
				true,
				"the refusal must not run ROLLBACK: the open transaction belongs to the outer call, not the refused one",
			);
			insert(db, 9);
			return "outer still commits";
		});

		assert.equal(value, "outer still commits");
		assert.equal(rowCount(db), 1, "the outer transaction committed its own write");
	});
});

test("a callback that ends the transaction itself never replaces the caller's error with a rollback complaint", () => {
	// This helper does not own a callback that closes its own transaction; what it does own is that the
	// error reaching the caller is the caller's. An unconditional `ROLLBACK` in the catch would replace
	// it with SQLite's "cannot rollback - no transaction is active" and hide the real failure.
	withDatabase((db) => {
		const failure = new Error("synthetic failure after a self-committed batch");
		let caught: unknown;
		try {
			withTransaction(db, () => {
				insert(db, 1);
				db.exec("COMMIT");
				throw failure;
			});
		} catch (error) {
			caught = error;
		}

		assert.equal(caught, failure, "the caller's error must survive: a second ROLLBACK would mask it");
		assert.equal(db.isTransaction, false, "the callback closed the transaction, so nothing is left open");
	});
});

test("`BEGIN IMMEDIATE` takes the write lock before the callback has written anything", () => {
	withDatabase((db, path) => {
		const other = new DatabaseSync(path);
		try {
			// Non-vacuity: with no transaction open the second connection writes freely, so the refusal
			// below is caused by the transaction and not by two connections on one file.
			other.prepare("INSERT INTO probe (id, value) VALUES (?, ?)").run(1, "before");
			other.prepare("DELETE FROM probe").run();

			withTransaction(db, () => {
				// This transaction has written nothing yet. Under a deferred `BEGIN` no lock would exist
				// here and the second connection's write would succeed — which is the whole reason design
				// §5.3 specifies `BEGIN IMMEDIATE`: the daemon is a single writer and must learn it is
				// second at the start of the batch, not halfway through one.
				const refusal = refusalOf(() =>
					other.prepare("INSERT INTO probe (id, value) VALUES (?, ?)").run(2, "blocked"),
				);
				assert.equal(refusal.errcode, SQLITE_BUSY, `expected a locked-database refusal, got: ${refusal.message}`);
				// A write lock, not exclusive access: readers are never blocked by it.
				assert.equal(rowCount(other), 0, "a second connection can still read while the writer holds the lock");
			});

			other.prepare("INSERT INTO probe (id, value) VALUES (?, ?)").run(3, "after");
			assert.equal(rowCount(other), 1, "the lock is released when the transaction ends");
		} finally {
			other.close();
		}
	});
});
