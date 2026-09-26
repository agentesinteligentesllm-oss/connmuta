import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { openInstallerLedger } from "../../src/installer/ledger-access.js";
import { LEDGER_FILE_NAME } from "../../src/ledger/open.js";
import { LEDGER_SCHEMA_VERSION } from "../../src/shared/constants.js";
import { INSTALLER_LEDGER_BUSY_TIMEOUT_MS } from "../../src/installer/constants.js";

/**
 * `installer/ledger-access.ts` (design.md §5, D-41; tasks.md PR-07 sub-task 7.1): the installer's own,
 * narrower open sequence — create-at-current-version for an absent file, refuse (never migrate, never
 * quarantine) an existing file at any other version.
 */

/** Runs `body` against a fresh temp home and removes it afterwards, even on failure. */
function withTempHome(body: (home: string) => void): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-installer-ledger-"));
	try {
		body(home);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}

/** Creates a ledger file stamped with `version`, closes it, and returns its path. */
function createLedgerFileWithVersion(home: string, version: number): string {
	const path = join(home, LEDGER_FILE_NAME);
	const db = new DatabaseSync(path);
	db.exec(`PRAGMA user_version = ${version}`);
	db.close();
	return path;
}

test("an absent ledger is created fresh, opened at the current schema version", () => {
	withTempHome((home) => {
		const result = openInstallerLedger({ homeDir: home });

		assert.equal(result.status, "opened");
		if (result.status !== "opened") {
			return;
		}
		assert.equal(result.schemaVersion, LEDGER_SCHEMA_VERSION);
		assert.ok(existsSync(result.path), "the ledger file must now exist on disk");
		assert.equal(result.db.prepare("PRAGMA user_version").get()?.["user_version"], LEDGER_SCHEMA_VERSION);
		result.db.close();
	});
});

test("an existing ledger at the current version opens with the installer's own busy_timeout", () => {
	withTempHome((home) => {
		createLedgerFileWithVersion(home, LEDGER_SCHEMA_VERSION);

		const result = openInstallerLedger({ homeDir: home });

		assert.equal(result.status, "opened");
		if (result.status !== "opened") {
			return;
		}
		assert.equal(result.schemaVersion, LEDGER_SCHEMA_VERSION);
		const timeout = result.db.prepare("PRAGMA busy_timeout").get() as { timeout: number };
		assert.equal(timeout.timeout, INSTALLER_LEDGER_BUSY_TIMEOUT_MS);
		result.db.close();
	});
});

test("an older user_version is refused, not migrated", () => {
	withTempHome((home) => {
		const olderVersion = LEDGER_SCHEMA_VERSION - 1;
		createLedgerFileWithVersion(home, olderVersion);

		const result = openInstallerLedger({ homeDir: home });

		assert.deepEqual(result, {
			status: "refused",
			reason: "version_mismatch",
			path: join(home, LEDGER_FILE_NAME),
			foundVersion: olderVersion,
		});

		// Never migrated: reopening independently must still report the exact same, untouched version.
		const reopened = new DatabaseSync(join(home, LEDGER_FILE_NAME));
		assert.equal(reopened.prepare("PRAGMA user_version").get()?.["user_version"], olderVersion);
		reopened.close();
	});
});

test("a newer user_version is refused, not quarantined", () => {
	withTempHome((home) => {
		const newerVersion = LEDGER_SCHEMA_VERSION + 1;
		createLedgerFileWithVersion(home, newerVersion);

		const result = openInstallerLedger({ homeDir: home });

		assert.deepEqual(result, {
			status: "refused",
			reason: "version_mismatch",
			path: join(home, LEDGER_FILE_NAME),
			foundVersion: newerVersion,
		});

		// Never quarantined: no `ledger.corrupt-*` sibling appears, and the original file is still the
		// only one present under its own name.
		assert.deepEqual(readdirSync(home), [LEDGER_FILE_NAME]);
	});
});
