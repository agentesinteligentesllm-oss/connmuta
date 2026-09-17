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
 * **Boundary, pinned rather than stated.** `fn` must be synchronous. `node:sqlite` is a synchronous API,
 * so a Promise-returning callback would let `COMMIT` land *before* that promise settled and then run the
 * rest of the work outside the transaction — a partial write with no error and no rollback. The type
 * cannot forbid it (`() => T` accepts `T = Promise<void>`), so the value is checked before `COMMIT` and a
 * thenable is refused with the transaction rolled back: the misuse becomes an error the caller sees
 * instead of a write it does not. `test/ledger/transaction.test.ts` pins both halves — the refusal, and
 * that the callback's synchronous part was rolled back.
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
 * The refusal {@link withTransaction} raises when `fn` returns a thenable — an `async` callback, which
 * is the one shape that would break the write-ahead ordering silently.
 *
 * Exported for the same reason as {@link NESTED_TRANSACTION_MESSAGE}: the caller and its test pin one
 * spelling of the refusal rather than matching prose.
 */
export const ASYNC_CALLBACK_MESSAGE =
	"withTransaction: the callback returned a thenable; it must run synchronously, because this transaction commits when it returns (design §5.3).";

/**
 * Whether `value` is a thenable, i.e. what `async () => …` returns.
 *
 * Structural rather than `instanceof Promise`, because a caller may return any thenable and the check
 * has to catch all of them. A `then` read that throws is deliberately **not** swallowed: it propagates as
 * the caller's own error, which the surrounding `catch` turns into a rollback — the one outcome that
 * cannot be mistaken for a committed batch.
 */
function isThenable(value: unknown): boolean {
	return value !== null && typeof value === "object" && typeof (value as { then?: unknown }).then === "function";
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
	db.exec("BEGIN IMMEDIATE");
	try {
		const value = fn();
		// Before `COMMIT`, and deliberately inside the `try`: refusing here rolls back the synchronous part
		// of the callback instead of committing it and leaving the rest to run outside the transaction.
		if (isThenable(value)) {
			throw new Error(ASYNC_CALLBACK_MESSAGE);
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
