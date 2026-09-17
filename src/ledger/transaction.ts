import type { DatabaseSync } from "node:sqlite";

/**
 * The write-ahead transaction boundary the ledger's writers share (design §5.3, `ledger/transaction.ts`).
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against: this file carries no provenance header and
 * `test/fixtures/v1-provenance.json` stays at its eleven entries. The token
 * `test/security/provenance.test.ts` keys on is not spelled here either — see `schema.ts`, whose doc
 * comment *is* the leading block that gate reads.
 *
 * `node:sqlite` documents no `db.transaction(fn)` wrapper (exploration Q7), so the daemon owns the
 * idiom: `BEGIN IMMEDIATE` … `COMMIT`, `ROLLBACK` on throw. It is deliberately **not** an ADR — design
 * §5.3 settles it as an implementation detail behind this function, and `test/ledger/transaction.test.ts`
 * is the spike that confirms the idiom on the pinned build.
 *
 * Three properties a caller depends on, each pinned by that suite:
 *
 * - **IMMEDIATE, not deferred.** The write lock is taken when the transaction opens, not at its first
 *   write, so a batch that loses the race to another writer loses it at the start of the batch instead
 *   of halfway through one with work already done.
 * - **All or nothing.** A throw inside `fn` rolls the whole batch back and surfaces the caller's own
 *   error, never a complaint of this module's own. PT-10's replay needs both halves: a batch that did
 *   not commit leaves nothing behind, and the redelivered update is then caught by
 *   `UNIQUE (bot_id, update_id)` in `schema.ts`.
 * - **The connection is left outside any transaction** on every path, because the poller reuses it.
 *
 * **Boundary, refused up front.** `fn` must be synchronous. `node:sqlite` is a synchronous API, so a
 * callback whose body keeps going after this function has returned would write *outside* the transaction:
 * the transaction commits first and every later statement autocommits on the same connection. `() => T`
 * cannot forbid that (`T = Promise<void>` is assignable), so every shape that defers its own body is
 * refused before it starts.
 *
 * - An `async` function (its body continues after the first `await`) and a generator function (its body
 *   starts on the first `next()`) are refused **before `BEGIN`**, which is the only point at which refusing
 *   them prevents the work: nothing they would have written exists, and a generator's caller never
 *   receives the iterator it would have driven later. The check reads the intrinsic constructor name, so a
 *   bound or proxied function whose identity does not survive falls through to the value check below.
 * - A thenable *returned* by a callback that is none of those is refused before `COMMIT`, and the
 *   transaction is rolled back so everything the callback did is undone; the abandoned promise is settled
 *   on the way out, because a rejection nobody handles would reach the process after the misuse had
 *   already been reported. What that promise's own continuation does afterwards is the caller's code on
 *   the caller's connection and outside this module's reach — the refusal turns it into a visible bug, and
 *   does not pretend to stop it.
 *
 * This module only delimits. It owns no table and no column, and it does not advance
 * `offsets.next_update_id`: the one transaction per poll batch that does is PR-12's
 * (`ledger/inbox.ts`, design §5.3).
 */

/**
 * The refusal {@link withTransaction} raises for a nested call — design §5.3's "a nested call throws
 * (no savepoints in F1)".
 *
 * Exported so the caller and its test pin one spelling of the refusal instead of matching prose.
 */
export const NESTED_TRANSACTION_MESSAGE =
	"withTransaction: this connection is already inside a transaction, and F1 has no savepoints (design §5.3).";

/**
 * The refusal {@link withTransaction} raises for a callback that would defer its own body — an `async` or
 * generator function, or a thenable such a callback returned — because every one of those shapes would run
 * statements outside the transaction, after it had committed.
 *
 * One constant covers all three shapes because the caller's mistake is one mistake in three shapes, and the
 * message names them together; {@link DEFERRED_CALLBACK_SHAPES} is the set the pre-flight checks.
 *
 * Exported for the same reason as {@link NESTED_TRANSACTION_MESSAGE}: the caller and its test pin one
 * spelling of the refusal rather than matching prose.
 */
export const DEFERRED_CALLBACK_MESSAGE =
	"withTransaction: the callback is deferred (an async or generator function, or it returned a thenable); it must run synchronously, because this transaction commits when it returns (design §5.3).";

/**
 * The callable shapes whose body runs *later*: an `async` function (after its first `await`) and a generator
 * (on its first `next()`).
 *
 * Named as the intrinsics name them, because `AsyncFunction` and `GeneratorFunction` are not distinct
 * `typeof` values — the constructor's name is the only structural handle on them.
 */
const DEFERRED_CALLBACK_SHAPES: ReadonlySet<string> = new Set([
	"AsyncFunction",
	"GeneratorFunction",
	"AsyncGeneratorFunction",
]);

/**
 * Whether `fn` is one of the shapes in {@link DEFERRED_CALLBACK_SHAPES}.
 *
 * Read structurally and checked *before* the callback is called: an async body that has already started
 * cannot be stopped, and a generator's body has not even started when this function returns — its
 * statements would run on this same connection outside the transaction, where they autocommit. A bound or
 * proxied function whose constructor identity does not survive slips past this check and is then caught by
 * {@link isThenable} on its returned value, with the continuation hazard the module doc describes.
 *
 * The optional chain is deliberate: a callable whose prototype was replaced has no `constructor`, and
 * reading through it must answer "not deferred" rather than throwing a `TypeError` before the transaction.
 */
function isDeferredCallback(fn: () => unknown): boolean {
	return DEFERRED_CALLBACK_SHAPES.has(fn.constructor?.name ?? "");
}

/**
 * Whether `value` is a thenable, i.e. what `async () => …` returns.
 *
 * Structural rather than `instanceof Promise`, and it covers functions as well as objects because
 * Promises/A+ §1.1 defines a thenable as "an object or function that defines a then method" — a function
 * carrying `then` is assimilated by `await` and by `Promise.resolve`, so it has to be refused here or the
 * promise of a synchronous callback is not kept. A `then` read that throws is deliberately **not**
 * swallowed: it propagates as the caller's own error, which the surrounding `catch` turns into a rollback —
 * the one outcome that cannot be mistaken for a committed batch.
 */
function isThenable(value: unknown): boolean {
	if (value === null) {
		return false;
	}
	const type = typeof value;
	if (type !== "object" && type !== "function") {
		return false;
	}
	return typeof (value as { then?: unknown }).then === "function";
}

/**
 * Runs `fn` inside one write transaction: `COMMIT` when it returns, `ROLLBACK` when it throws.
 *
 * The nested-call refusal is checked **before** any SQL runs, and that order is load-bearing rather
 * than tidy. SQLite refuses a nested `BEGIN` by itself, but an implementation that opens the
 * transaction inside its own `try` and rolls back in the matching `catch` would then run `ROLLBACK`
 * while `db.isTransaction` is true — for the *outer* call's transaction — and quietly roll back a
 * batch it never opened. Refusing up front is what keeps a nested call from damaging its caller.
 *
 * The callback's value is passed through so a writer can report what it did (PR-12 counts replayed
 * against inserted updates) without staging a result in a variable outside the transaction.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
	if (db.isTransaction) {
		throw new Error(NESTED_TRANSACTION_MESSAGE);
	}
	if (isDeferredCallback(fn)) {
		// Refused before `BEGIN`, so nothing the callback would have written exists at all — including a tail
		// it would have run after its first `await`, and a generator body that would have started on the
		// caller's first `next()`, which no later rollback could reach.
		throw new Error(DEFERRED_CALLBACK_MESSAGE);
	}
	db.exec("BEGIN IMMEDIATE");
	try {
		const value = fn();
		if (isThenable(value)) {
			// Settle the abandoned promise: an unhandled rejection would reach the process after the misuse was
			// already reported, and Node's default policy for one is to take the process down.
			void Promise.resolve(value).catch(() => undefined);
			throw new Error(DEFERRED_CALLBACK_MESSAGE);
		}
		db.exec("COMMIT");
		return value;
	} catch (error) {
		// Roll back only a transaction that is still open. Two cases reach this branch with `isTransaction`
		// already false, and both would otherwise mask the caller's error with "cannot rollback - no
		// transaction is active": a callback that committed or rolled back itself, and SQLite's own
		// automatic rollback of classes such as SQLITE_FULL and SQLITE_IOERR (measured on the pinned
		// build: a statement failing with errcode 13 leaves `isTransaction` false).
		if (db.isTransaction) {
			db.exec("ROLLBACK");
		}
		throw error;
	}
}
