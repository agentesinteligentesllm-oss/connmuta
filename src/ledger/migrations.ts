import type { DatabaseSync } from "node:sqlite";

import { LEDGER_SCHEMA_VERSION } from "../shared/constants.js";
import { LEDGER_SCHEMA_DDL } from "./schema.js";
import { withTransaction } from "./transaction.js";

/**
 * The ledger's forward-only migration path (`ledger/migrations.ts`, design §5.1).
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against — the module carries no header of the kind
 * `test/security/provenance.test.ts` looks for, and `test/fixtures/v1-provenance.json` stays at its
 * eleven entries. (`schema.ts` states the constraint on that gate's own first token; this module's first
 * line is an `import`, so the gate never reads a leading block here.)
 *
 * This module owns the **version**: reading `PRAGMA user_version`, the ordered `{ to, up }` list, and the
 * stamp. It owns no file and no PRAGMA beyond that one — the file, the WAL mode and the quarantine belong
 * to `ledger/open.ts` (design §5.1), and SQLite's own `quick_check` is what tells the two of them apart.
 *
 * Three properties a caller depends on, each pinned by `test/ledger/migrations.test.ts`:
 *
 * - **Forward-only, and complete.** The path is a contiguous ascending run from version 1 to
 *   {@link LEDGER_SCHEMA_VERSION}; there are no down migrations (design §5.1) and no gaps. A version with
 *   no step leading out of it is refused rather than skipped, because skipping one would leave a reader
 *   believing a schema that was never applied.
 * - **One transaction per step.** Every entry runs inside {@link withTransaction}, and its
 *   `PRAGMA user_version = to` is written inside that same transaction — SQLite rolls that pragma back
 *   with the transaction (measured on the pinned build), so a step is either applied *and* stamped or
 *   neither. A step that throws therefore leaves the schema and the version exactly as they were, while
 *   every earlier step stays committed.
 * - **A step must apply itself synchronously.** A deferred `up` would write outside the transaction it
 *   is supposed to be part of. An `async` one is refused by `withTransaction` before `COMMIT`; a
 *   generator is refused by this module, because calling a generator produces an iterator without running
 *   its body — the stamp would then be committed for a schema change that never happened.
 *
 * **Boundary.** Reading the version is all this module does with the connection before the path runs; it
 * does not decide *whether* a file may be migrated. A version above {@link LEDGER_SCHEMA_VERSION} is a
 * file from the future and `ledger/open.ts` quarantines it (ADR-0015) before this module is ever called;
 * reaching the same case here is a refusal, not a downgrade.
 */

/**
 * The refusal this module raises when no forward-only path reaches a version from the one on disk.
 *
 * One spelling for two cases — a version above this build's, a negative or fractional one, and a gap or a
 * wrong start in the list itself: all of them mean the same thing to the caller (this build cannot migrate
 * this file forward), and inventing a distinct message per case would invite the caller to treat one of
 * them as recoverable.
 */
export const MIGRATION_PATH_UNAVAILABLE_MESSAGE =
	"runPendingMigrations: this build has no forward-only migration path from the ledger's current schema version to the one the path reaches (design §5.1: steps are applied in order, never skipped and never reversed).";

/**
 * The refusal this module raises for a migration whose `up` returned an iterator instead of applying
 * itself — i.e. a generator function.
 *
 * The generator shape needs a refusal of its own rather than `withTransaction`'s thenable check: calling a
 * generator function runs **no** body and returns an object that is not a thenable, so without this the
 * call would commit — stamping a version for a schema change that never happened, which is the silent
 * failure this repository treats as the worst kind. The `async` and thenable shapes are refused by
 * `withTransaction` itself, before `COMMIT`, and that refusal is the one a caller sees there.
 */
export const DEFERRED_MIGRATION_MESSAGE =
	"runPendingMigrations: this migration's `up` returned an iterator (a generator function), so its body never ran and there is nothing to stamp; a migration must apply its statements synchronously inside the transaction (design §5.1).";

/** One step of the forward-only path (design §5.1's ordered `{ to, up }` list). */
export interface LedgerMigration {
	/** The `user_version` this step leaves behind when it completes, and the version it migrates *to*. */
	readonly to: number;
	/**
	 * Applies the step to an open ledger connection.
	 *
	 * Runs inside {@link withTransaction}, so it must be synchronous, and its return value is handed to
	 * `withTransaction` — which is what refuses a thenable and lets this module refuse an iterator. Real
	 * migrations return nothing; the value is inspected, not used.
	 */
	readonly up: (db: DatabaseSync) => unknown;
}

/**
 * The complete path, version 1 to {@link LEDGER_SCHEMA_VERSION}.
 *
 * Version 1 is design §5.2's DDL, applied as the text `schema.ts` exports: this module never edits that
 * string, because a schema change is the next migration, not a change to a shipped one.
 */
export const LEDGER_MIGRATIONS: readonly LedgerMigration[] = [
	{
		to: 1,
		up: (db) => {
			db.exec(LEDGER_SCHEMA_DDL);
		},
	},
];

/**
 * The version the ledger file itself records: `PRAGMA user_version`, or 0 before any migration ran.
 *
 * SQLite always answers this pragma with exactly one row (measured on the pinned build, for a file this
 * build created and for one carrying any version at all), so there is no default to fall back to and no
 * absent-row case to guard.
 */
export function readLedgerSchemaVersion(db: DatabaseSync): number {
	const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
	return row.user_version;
}

/**
 * Applies every pending step, in order, and returns the version the ledger now records.
 *
 * `migrations` is a seam, and the daemon never passes it: it exists so the suite can build paths the
 * shipped list cannot express today — a second step, a gap, a step that throws, a generator — and pin the
 * mechanism (one transaction per step, stamp inside it, refusals) rather than only the single step that
 * ships. It defaults to {@link LEDGER_MIGRATIONS}, which is what every real caller gets.
 */
export function runPendingMigrations(
	db: DatabaseSync,
	currentVersion: number,
	migrations: readonly LedgerMigration[] = LEDGER_MIGRATIONS,
): number {
	assertMigrationPath(migrations);
	// Contiguity means the last entry's `to` equals the list's length, so one upper bound covers both
	// "this file is from the future" and "this list is longer than the constant it should end at".
	if (!Number.isInteger(currentVersion) || currentVersion < 0 || currentVersion > migrations.length) {
		throw new Error(MIGRATION_PATH_UNAVAILABLE_MESSAGE);
	}

	let version = currentVersion;
	for (const migration of migrations) {
		if (migration.to <= version) {
			continue;
		}
		withTransaction(db, () => {
			const applied = migration.up(db);
			if (isIterator(applied)) {
				throw new Error(DEFERRED_MIGRATION_MESSAGE);
			}
			// Interpolated because SQLite refuses a bound parameter in a pragma. What makes that safe is
			// the contiguity check above: every `to` is a positive integer, so no caller-supplied text can
			// reach this statement.
			db.exec(`PRAGMA user_version = ${migration.to}`);
			return applied;
		});
		version = migration.to;
	}
	return version;
}

/**
 * Refuses a list this module cannot walk forward from.
 *
 * The one rule is contiguity: entry *i* carries `to === i + 1`. That single check gives three properties
 * at once — the path starts at 1, no version is skipped, and every `to` is a positive integer (which is
 * what makes the interpolated stamp safe). A list is never a configuration point here: it is the shipped
 * path, and a gap in it is a defect that must fail loudly rather than open an older schema quietly.
 */
function assertMigrationPath(migrations: readonly LedgerMigration[]): void {
	migrations.forEach((migration, index) => {
		if (migration.to !== index + 1 || typeof migration.up !== "function") {
			throw new Error(MIGRATION_PATH_UNAVAILABLE_MESSAGE);
		}
	});
}

/**
 * Whether a migration's `up` returned an iterator, i.e. whether it is a generator function.
 *
 * Structural, and deliberately not `instanceof`: a generator object from another realm carries the same
 * `next` method and no brand this module could trust. Reading the value is enough *here* because a
 * generator's body has not started — the refusal happens before anything of it exists, so it is still a
 * refusal before the work, which is the property that matters.
 */
function isIterator(value: unknown): boolean {
	if (value === null || (typeof value !== "object" && typeof value !== "function")) {
		return false;
	}
	return typeof (value as { next?: unknown }).next === "function";
}
