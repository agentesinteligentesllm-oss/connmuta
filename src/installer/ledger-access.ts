import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { LEDGER_FILE_NAME, openLedger } from "../ledger/open.js";
import { readLedgerSchemaVersion } from "../ledger/migrations.js";
import { LEDGER_SCHEMA_VERSION } from "../shared/constants.js";
import { INSTALLER_LEDGER_BUSY_TIMEOUT_MS } from "./constants.js";

/**
 * The installer's own, deliberately narrower ledger-open sequence (D-41, design.md §5; tasks.md 7.1).
 *
 * The daemon's `ledger/open.ts` decides whether an *existing* file may be used at all: it runs
 * `PRAGMA quick_check`, quarantines corruption or a future version, and migrates forward. None of
 * that belongs here for a file the installer finds already present — the daemon may hold it open,
 * quarantining it out from under a running daemon would be destructive, and migrating it is the
 * daemon's job alone (it owns the schema's evolution, not a one-shot CLI). So for an existing file
 * this module only opens it, sets `busy_timeout` (a poll-batch commit only ever holds the write lock
 * for milliseconds; this absorbs a burst of daemon activity while a human sits at a wizard prompt),
 * and refuses on any `user_version` other than exactly {@link LEDGER_SCHEMA_VERSION} — older *or*
 * newer, one refusal for both, because both mean the same thing to this caller: this build must not
 * touch this file's schema.
 *
 * An **absent** file is the one case with nothing to protect: there is no existing content to
 * quarantine and no schema to migrate away from, so the daemon's own {@link openLedger} (design
 * §5.1) is reused as-is to create the home, open a fresh file and migrate it to
 * {@link LEDGER_SCHEMA_VERSION} — design §5 names this explicitly ("only `setup` reaches this").
 * Reusing it here, rather than re-deriving the DDL by hand, is what keeps the version-1 schema
 * (`ledger/schema.ts`) and its forward-only migration path (`ledger/migrations.ts`) authored in
 * exactly one place.
 */

/** What {@link openInstallerLedger} needs. */
export interface InstallerLedgerOpenOptions {
	/** The daemon home; `~/.conmuta` in production, a temp directory in tests. */
	readonly homeDir: string;
}

/** Why {@link openInstallerLedger} refused an existing file. */
export type InstallerLedgerRefusalReason = "version_mismatch";

/** What {@link openInstallerLedger} found. */
export type InstallerLedgerOpenResult =
	| { readonly status: "opened"; readonly db: DatabaseSync; readonly path: string; readonly schemaVersion: number }
	| {
			readonly status: "refused";
			readonly reason: InstallerLedgerRefusalReason;
			readonly path: string;
			readonly foundVersion: number;
	  };

/**
 * Opens the installer's view of the daemon's ledger (design §5, D-41).
 *
 * Absent ⇒ delegates to the daemon's {@link openLedger}, which creates the home, a fresh file, and
 * migrates it to {@link LEDGER_SCHEMA_VERSION}. Present ⇒ opens it directly with `busy_timeout` set
 * and refuses on any version other than the current one; this function never runs a migration and
 * never quarantines a file it finds already there.
 */
export function openInstallerLedger(options: InstallerLedgerOpenOptions): InstallerLedgerOpenResult {
	const dbPath = join(options.homeDir, LEDGER_FILE_NAME);

	if (!existsSync(dbPath)) {
		const created = openLedger({ homeDir: options.homeDir });
		// `created.db`/`.path`/`.schemaVersion` are common to both of `openLedger`'s result variants
		// (`LedgerHandle`), so no narrowing on `status` is needed here. A truly absent file has nothing
		// SQLite could call corrupt or from-the-future, so the "quarantined" variant is not a case this
		// call can reach in practice; if it somehow did, reporting the resulting fresh handle as
		// "opened" is still correct, since a fresh empty file was exactly what this branch asked for.
		return { status: "opened", db: created.db, path: created.path, schemaVersion: created.schemaVersion };
	}

	const db = new DatabaseSync(dbPath);
	db.exec(`PRAGMA busy_timeout = ${INSTALLER_LEDGER_BUSY_TIMEOUT_MS}`);
	const foundVersion = readLedgerSchemaVersion(db);
	if (foundVersion !== LEDGER_SCHEMA_VERSION) {
		db.close();
		return { status: "refused", reason: "version_mismatch", path: dbPath, foundVersion };
	}
	return { status: "opened", db, path: dbPath, schemaVersion: foundVersion };
}
