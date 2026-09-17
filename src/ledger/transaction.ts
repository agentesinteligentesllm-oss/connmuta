import type { DatabaseSync } from "node:sqlite";

/**
 * The write-ahead transaction boundary the ledger's writers share (design §5.3, `ledger/transaction.ts`).
 *
 * New code, not vendored: design §12 has no row naming `ledger/*`, so this file carries no provenance
 * header (the exact token `test/security/provenance.test.ts` keys on is deliberately not spelled here:
 * this module's leading block would be read as one) and `test/fixtures/v1-provenance.json` stays at its
 * eleven entries.
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
 * **Boundary.** `fn` must be synchronous: `node:sqlite` is a synchronous API, so a Promise-returning
 * callback would commit before that promise settled. That is stated rather than pinned — no test here
 * could pin it without asserting the footgun instead of a guarantee.
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
		db.exec("COMMIT");
		return value;
	} catch (error) {
		// Roll back only a transaction that is still open. A callback that ended the transaction itself
		// would otherwise meet a second `ROLLBACK`, whose "cannot rollback - no transaction is active"
		// would reach the caller in place of the error it actually threw.
		if (db.isTransaction) {
			db.exec("ROLLBACK");
		}
		throw error;
	}
}
