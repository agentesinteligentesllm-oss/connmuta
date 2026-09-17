import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { DEFERRED_CALLBACK_MESSAGE, NESTED_TRANSACTION_MESSAGE, withTransaction } from "../../src/ledger/transaction.js";

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

/**
 * SQLite's own result code for "database or disk is full" (`sqlite3.h`, `SQLITE_FULL`).
 *
 * Named because this suite's auto-rollback test is about one error *class* — the failures SQLite answers
 * by rolling the whole transaction back itself — and that is what makes the caller's own error the one
 * that must survive.
 */
const SQLITE_FULL = 13;

/**
 * A page ceiling low enough that a bulk insert reaches `SQLITE_FULL` on the pinned build.
 *
 * This is how the suite reaches SQLite's automatic-rollback class without a full disk: the failure is the
 * real one, raised by SQLite, rather than a simulation of it.
 */
const MAX_PROBE_PAGES = 8;

/** Rows enough to exceed {@link MAX_PROBE_PAGES} many times over before the insert loop would end. */
const BULK_INSERT_ROWS = 100_000;

/** The pragmas and the probe table every test in this suite starts from. */
function openProbe(db: DatabaseSync): void {
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA foreign_keys = ON");
	db.exec(PROBE_DDL);
}

/** Opens a fresh temp-file ledger, runs `operation`, and removes the directory even on failure. */
function withDatabase(operation: (db: DatabaseSync, path: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-ledger-"));
	const path = join(dir, "ledger.db");
	const db = new DatabaseSync(path);
	try {
		openProbe(db);
		operation(db, path);
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * The same fresh temp-file ledger, for a test that must await queued continuations before asserting.
 *
 * The async-callback tests are about work *scheduled* for later, so their assertions are only meaningful
 * once that work has had a chance to run; every other test in the suite stays with the synchronous helper.
 */
async function withDatabaseAwaiting(operation: (db: DatabaseSync) => Promise<void> | void): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-ledger-await-"));
	const db = new DatabaseSync(join(dir, "ledger.db"));
	try {
		openProbe(db);
		await operation(db);
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
}

/** One turn of the macrotask queue, so anything the code under test scheduled has certainly run. */
function afterQueuedWork(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
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

test("a committed callback's write reaches the database file, its value survives, and no transaction is left open", () => {
	withDatabase((db, path) => {
		assert.equal(db.isTransaction, false, "a fresh connection holds no transaction");

		const value = withTransaction(db, () => {
			assert.equal(db.isTransaction, true, "`BEGIN IMMEDIATE` must be observable inside the callback");
			insert(db, 1);
			return "committed";
		});

		assert.equal(value, "committed", "the callback's value reaches the caller (PR-12's writer returns counts)");
		assert.equal(rowCount(db), 1, "the row committed with the transaction");
		assert.equal(db.isTransaction, false, "the connection must be reusable for the next poll batch");

		// A second connection reads the row out of the file rather than out of this connection's memory, so
		// the commit is observable from outside the writer. Durability in the fsync sense is a different claim
		// with a different owner — `PRAGMA synchronous = FULL` in the open sequence (design §5.1, PR-11) — and
		// this suite does not assert it.
		const reader = new DatabaseSync(path);
		try {
			const row = reader.prepare("SELECT count(*) AS c FROM probe").get();
			assert.ok(row !== undefined, "count(*) always returns exactly one row");
			assert.equal(Number(row.c), 1, "the committed row is in the file, visible to a second connection");
		} finally {
			reader.close();
		}
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

test("an async callback is refused before it runs, so nothing it would have written exists", async () => {
	// `() => T` accepts `T = Promise<void>`, so the type cannot forbid this; refusing the callback's own
	// shape before `BEGIN` can, and it is the only point at which the refusal leaves nothing behind.
	await withDatabaseAwaiting(async (db) => {
		let started = false;

		assert.throws(
			() =>
				withTransaction(db, async () => {
					started = true;
					insert(db, 1);
				}),
			{ message: DEFERRED_CALLBACK_MESSAGE },
			"an async callback must be refused rather than committed early",
		);

		await afterQueuedWork();
		assert.equal(started, false, "the body must not have been started at all");
		assert.equal(rowCount(db), 0, "nothing the callback would have written may exist");
		assert.equal(db.isTransaction, false, "the connection is left clean for the next batch");
	});
});

test("an async callback with a tail after its await cannot leave that tail behind", async () => {
	// Round 2's correction, and the reason the refusal moved before `BEGIN`: refusing an async callback
	// *after* calling it left its post-`await` statements to run on this connection once the transaction had
	// been rolled back, where they autocommit — the caller got an error *and* a half-applied batch, with only
	// the later statements persisted. The queue is drained before asserting so a tail that did run has
	// certainly landed, which is what makes this test able to fail for the old shape.
	await withDatabaseAwaiting(async (db) => {
		let started = false;

		assert.throws(
			() =>
				withTransaction(db, async () => {
					started = true;
					insert(db, 1);
					await Promise.resolve();
					insert(db, 2);
				}),
			{ message: DEFERRED_CALLBACK_MESSAGE },
		);

		await afterQueuedWork();
		assert.equal(started, false, "an async body must not have been started at all");
		assert.equal(rowCount(db), 0, "neither the pre-await nor the post-await statement may exist");
		assert.equal(db.isTransaction, false);
	});
});

test("a thenable returned by a plain callback is refused, rolled back, and settled, rejection included", async () => {
	// The residual shape: a function that is none of the deferred shapes can still return a thenable. It is
	// refused before `COMMIT` and rolled back, and the abandoned promise is settled on the way out. The
	// *rejecting* thenable is the half that matters and the half a fulfillment-only settle would satisfy
	// while leaving an unhandled rejection behind — which Node's default policy turns into a process exit,
	// after the misuse had already been reported.
	await withDatabaseAwaiting(async (db) => {
		const rejections: unknown[] = [];
		const observer = (reason: unknown): void => {
			rejections.push(reason);
		};
		process.on("unhandledRejection", observer);
		try {
			let assimilated = false;
			const thenable = {
				then: (_resolve: unknown, reject: (reason: Error) => void): void => {
					assimilated = true;
					reject(new Error("synthetic rejection from an abandoned thenable"));
				},
			};

			assert.throws(
				() =>
					withTransaction(db, () => {
						insert(db, 1);
						return thenable;
					}),
				{ message: DEFERRED_CALLBACK_MESSAGE },
			);

			assert.equal(rowCount(db), 0, "the callback's writes were rolled back, not committed");
			await afterQueuedWork();
			assert.equal(assimilated, true, "the abandoned thenable must be assimilated, not dropped");
			assert.deepEqual(rejections, [], "its rejection must be handled here, not left to the process");
			assert.equal(db.isTransaction, false);
		} finally {
			process.off("unhandledRejection", observer);
		}
	});
});

test("a generator callback is refused too: its body would start on the caller's first next()", async () => {
	// The third deferred shape, and the one an `async`-only pre-flight let through: a generator body does not
	// run when the callback is called, so `withTransaction` would have committed an empty transaction and
	// handed the caller an iterator whose every statement autocommits outside it.
	await withDatabaseAwaiting(async (db) => {
		let started = false;
		const shapes: ReadonlyArray<[string, () => Generator<number> | AsyncGenerator<number>]> = [
			[
				"function*",
				function* () {
					started = true;
					insert(db, 1);
					yield 1;
				},
			],
			[
				"async function*",
				async function* () {
					started = true;
					await Promise.resolve();
					insert(db, 2);
				},
			],
		];

		for (const [name, shape] of shapes) {
			assert.throws(() => withTransaction(db, shape), { message: DEFERRED_CALLBACK_MESSAGE }, `${name} must be refused`);
		}

		await afterQueuedWork();
		assert.equal(started, false, "no generator body may have started");
		assert.equal(rowCount(db), 0, "nothing a generator would have written may exist");
		assert.equal(db.isTransaction, false);
	});
});

test("a function-shaped thenable is refused too: Promises/A+ counts objects and functions", () => {
	// Promises/A+ §1.1 defines a thenable as "an object or function that defines a then method", and both
	// `await` and `Promise.resolve` assimilate either — so a check that only looked at objects would let a
	// function-valued thenable through while the docstring claimed it caught all of them.
	withDatabase((db) => {
		const functionThenable = Object.assign(() => undefined, { then: () => undefined });

		assert.throws(
			() =>
				withTransaction(db, () => {
					insert(db, 1);
					return functionThenable;
				}),
			{ message: DEFERRED_CALLBACK_MESSAGE },
		);

		assert.equal(rowCount(db), 0, "the callback's writes were rolled back, not committed");
		assert.equal(db.isTransaction, false);
	});
});

test("the guard keeps the caller's error when SQLite rolls the transaction back by itself", () => {
	// Measured on the pinned build: a statement failing with SQLITE_FULL leaves `isTransaction` false, so an
	// unconditional `ROLLBACK` in the catch would replace this error with "cannot rollback - no transaction is
	// active". The assertion is about the error that reaches the caller, not about SQLite's internal choice,
	// so a build that kept the transaction open would satisfy it just the same.
	withDatabase((db) => {
		db.exec(`PRAGMA max_page_count = ${MAX_PROBE_PAGES}`);
		const bulk = db.prepare("INSERT INTO probe (id, value) VALUES (?, ?)");

		let caught: unknown;
		try {
			withTransaction(db, () => {
				for (let id = 0; id < BULK_INSERT_ROWS; id += 1) {
					bulk.run(id, "x".repeat(100));
				}
			});
		} catch (error) {
			caught = error;
		}

		const refusal = caught as { errcode?: unknown; message?: unknown };
		assert.equal(refusal.errcode, SQLITE_FULL, `expected the statement's own failure, got: ${String(refusal.message)}`);
		assert.equal(
			String(refusal.message).includes("no transaction is active"),
			false,
			"the caller must not be told about a rollback it did not ask for",
		);
		assert.equal(db.isTransaction, false, "whatever SQLite did, no transaction is left open");
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
