import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
	isLedgerCorruptionError,
	LEDGER_CORRUPT_FILE_PREFIX,
	LEDGER_FILE_NAME,
	LEDGER_QUARANTINE_SIBLING_SUFFIXES,
	openLedger,
	quarantineLedgerFile,
	type LedgerOpenResult,
} from "../../src/ledger/open.js";
import { LEDGER_SCHEMA_VERSION, POSIX_PRIVATE_DIR_MODE } from "../../src/shared/constants.js";

/**
 * The open sequence (design §5.1) against real files, on the pinned build.
 *
 * Two spec scenarios of `ledger › Schema-version migrations and quarantine on corruption or a future
 * version` are here — a corrupt ledger is quarantined and not defaulted, and a future `user_version`
 * takes the same path instead of a downgrade — plus the PRAGMA sequence and the boundary this module
 * does *not* cross: raising condition `ledger_quarantined` and writing the audit `system` row belong to
 * the condition store and the audit module (PR-13), so this suite pins the **verdict** and nothing more.
 *
 * The corrupt fixture is a file whose bytes are not a SQLite database. Both corruption detections are
 * real SQLite answers rather than a simulated error: measured on the pinned build, `new DatabaseSync`
 * is lazy, so a prose file opens and `PRAGMA quick_check` is what throws (`errcode 26`), while a
 * damaged page throws `errcode 11`.
 */

// dist/test/ledger/open.test.js -> repo root is three levels up; the fixture is a repository file, not
// a build artifact, so it is read from the source tree.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CORRUPT_FIXTURE_PATH = join(REPO_ROOT, "test", "fixtures", "ledger-corrupt.db");

/** SQLite's own result codes this suite names (`sqlite3.h`). */
const SQLITE_BUSY = 5;
const SQLITE_CORRUPT = 11;
const SQLITE_NOTADB = 26;

/**
 * Two of SQLite's **extended** result codes for corruption.
 *
 * `errcode` is not always the primary code: an extended code shares the primary code's low byte, which
 * is why the class rule under test masks with `& 0xFF` instead of comparing two exact numbers. These
 * two (index and virtual-table corruption) are not reproducible from a plain file here, so the rule is
 * pinned with synthetic codes — see the last test.
 */
const SQLITE_CORRUPT_VTAB = 267;
const SQLITE_CORRUPT_INDEX = 779;

/** SQLite's primary "could not open the file" code; opening a *directory* lands here (measured 526). */
const SQLITE_CANTOPEN = 14;
const SQLITE_CANTOPEN_DIRECTORY = 526;

/** SQLite's own value for `PRAGMA synchronous = FULL` (`sqlite3.h`). */
const SQLITE_SYNCHRONOUS_FULL = 2;

/** SQLite's extended code for a violated foreign key (`787 & 0xFF === SQLITE_CONSTRAINT`). */
const SQLITE_CONSTRAINT_FOREIGN_KEY = 787;

/** A fixed epoch for the quarantine name, so the assertion checks the design's own format. */
const QUARANTINE_EPOCH_MS = 1_700_000_000_000;

/** The version a file from the future carries; tied to the constant so a bump keeps the test true. */
const FUTURE_VERSION = LEDGER_SCHEMA_VERSION + 1;

/** Every handle `openLedger` hands out, so the temp-home cleanup below can close them all. */
const OPEN_HANDLES: DatabaseSync[] = [];

/** `openLedger`, with its handle registered for that cleanup. */
function open(options: { homeDir: string; now?: () => number }): LedgerOpenResult {
	const result = openLedger(options);
	OPEN_HANDLES.push(result.db);
	return result;
}

/**
 * A fresh temp home for one test, removed even when the test fails.
 *
 * Handles are closed on the way out — Windows keeps a deleted-but-open file alive — and `isOpen` is
 * checked because a test may have closed its own handle already (`close()` twice is an error).
 */
function withHome(operation: (homeDir: string) => void): void {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-ledger-open-"));
	try {
		operation(homeDir);
	} finally {
		for (let handle = OPEN_HANDLES.pop(); handle !== undefined; handle = OPEN_HANDLES.pop()) {
			if (handle.isOpen) handle.close();
		}
		rmSync(homeDir, { recursive: true, force: true });
	}
}

/** The value of a single-valued PRAGMA, read the way SQLite answers it. */
function readPragma(db: DatabaseSync, name: string): unknown {
	const row = db.prepare(`PRAGMA ${name}`).get() as Record<string, unknown>;
	return row[name];
}

/** How many rows a table holds. */
function countRows(db: DatabaseSync, table: string): number {
	const row = db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
	return row.n;
}

/** Whether an object of that name exists in the schema (table, view or index). */
function schemaHas(db: DatabaseSync, name: string): boolean {
	return db.prepare("SELECT 1 AS found FROM sqlite_master WHERE name = ?").get(name) !== undefined;
}

/** The quarantined files a home currently holds. */
function quarantinedNames(homeDir: string): string[] {
	return readdirSync(homeDir)
		.filter((name) => name.startsWith(LEDGER_CORRUPT_FILE_PREFIX))
		.sort();
}

test("the ledger's file name and quarantine name are the design's own (design §5.1)", () => {
	assert.equal(LEDGER_FILE_NAME, "ledger.db");
	assert.equal(LEDGER_CORRUPT_FILE_PREFIX, "ledger.corrupt-");
	assert.deepEqual([...LEDGER_QUARANTINE_SIBLING_SUFFIXES], ["-wal", "-shm"]);
});

test("the corrupt fixture is not a SQLite database (control for the quarantine tests)", () => {
	withHome((homeDir) => {
		// Checked on a copy: the repository's fixture directory is not a scratch space.
		const copyPath = join(homeDir, "fixture-copy.db");
		writeFileSync(copyPath, readFileSync(CORRUPT_FIXTURE_PATH));

		const db = new DatabaseSync(copyPath);
		try {
			assert.throws(
				() => db.prepare("PRAGMA quick_check").all(),
				(error) => isLedgerCorruptionError(error),
				"the fixture must be refused by SQLite as a corruption-class file",
			);
		} finally {
			db.close();
		}
	});
});

test("a corrupt ledger is quarantined under the design's name and a fresh empty ledger opens (spec)", () => {
	withHome((homeDir) => {
		const dbPath = join(homeDir, LEDGER_FILE_NAME);
		const corrupted = readFileSync(CORRUPT_FIXTURE_PATH);
		writeFileSync(dbPath, corrupted);

		const result = open({ homeDir, now: () => QUARANTINE_EPOCH_MS });

		assert.equal(result.status, "quarantined");
		assert.equal(result.reason, "corruption");
		assert.equal(result.quarantinedPath, join(homeDir, `${LEDGER_CORRUPT_FILE_PREFIX}${QUARANTINE_EPOCH_MS}.db`));

		// Never deleted, never overwritten: the corrupt file survives byte for byte.
		assert.deepEqual(readFileSync(result.quarantinedPath), corrupted);
		assert.deepEqual(quarantinedNames(homeDir), [`${LEDGER_CORRUPT_FILE_PREFIX}${QUARANTINE_EPOCH_MS}.db`]);

		// The fresh ledger really is fresh and really is usable.
		assert.ok(existsSync(dbPath), "a fresh ledger must open at the original path");
		assert.ok(result.db.isOpen, "the returned handle must be open");
		assert.equal(readPragma(result.db, "user_version"), LEDGER_SCHEMA_VERSION);
		assert.ok(schemaHas(result.db, "offsets"));
		assert.equal(countRows(result.db, "updates"), 0);
		assert.equal(countRows(result.db, "audit_log"), 0);
	});
});

test("a future PRAGMA user_version is quarantined too, never downgraded (spec)", () => {
	withHome((homeDir) => {
		const first = open({ homeDir });
		assert.equal(first.status, "opened");
		first.db.exec(`PRAGMA user_version = ${FUTURE_VERSION}`);
		first.db.exec("INSERT INTO offsets (bot_id) VALUES (4242)");
		first.db.close();

		const result = open({ homeDir, now: () => QUARANTINE_EPOCH_MS });

		assert.equal(result.status, "quarantined");
		assert.equal(result.reason, "future_version");
		// The file from the future keeps its own version and its rows: no downgrade was attempted.
		const preserved = new DatabaseSync(result.quarantinedPath);
		try {
			assert.equal(readPragma(preserved, "user_version"), FUTURE_VERSION);
			assert.equal(countRows(preserved, "offsets"), 1);
		} finally {
			preserved.close();
		}
		// And what opened instead is this build's version, empty.
		assert.equal(readPragma(result.db, "user_version"), LEDGER_SCHEMA_VERSION);
		assert.equal(countRows(result.db, "offsets"), 0);
	});
});

test("the open sequence leaves the connection in WAL, synchronous FULL, foreign keys enforced (design §5.1)", () => {
	withHome((homeDir) => {
		const result = open({ homeDir });
		assert.equal(result.status, "opened");

		assert.equal(readPragma(result.db, "journal_mode"), "wal");
		assert.equal(readPragma(result.db, "synchronous"), SQLITE_SYNCHRONOUS_FULL);
		assert.equal(readPragma(result.db, "foreign_keys"), 1);

		// Non-vacuous control for WAL: a raw connection on a fresh file is not in WAL mode, so the first
		// assertion above is a statement about this sequence and not about SQLite's defaults. The other
		// two values coincide with this build's defaults, so they pin the *effective* setting — a mutant
		// that changes them is killed, a mutant that deletes the statement is not (stated, not hidden).
		const raw = new DatabaseSync(join(homeDir, "control.db"));
		try {
			assert.equal(readPragma(raw, "journal_mode"), "delete");
		} finally {
			raw.close();
		}

		// The effect, not only the reported setting: a dangling thread_history row is refused.
		assert.throws(
			() =>
				result.db
					.prepare(
						"INSERT INTO thread_history (project_id, thread_id, eid, type, from_agent_id, body, at, via) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
					)
					.run("p", "t", "e", "NOTE", "a", "b", "now", "group"),
			(error) => (error as { errcode?: number }).errcode === SQLITE_CONSTRAINT_FOREIGN_KEY,
		);
	});
});

test("an already-current ledger reopens as opened, with no new quarantine file", () => {
	withHome((homeDir) => {
		open({ homeDir }).db.close();

		const again = open({ homeDir, now: () => QUARANTINE_EPOCH_MS });

		assert.equal(again.status, "opened");
		assert.equal(again.schemaVersion, LEDGER_SCHEMA_VERSION);
		assert.deepEqual(quarantinedNames(homeDir), []);
	});
});

test("the home directory is created recursively with POSIX_PRIVATE_DIR_MODE (design §5.1)", () => {
	withHome((homeDir) => {
		// A home that does not exist yet, with a missing parent: `~/.conmuta` is created here.
		const nested = join(homeDir, "conmuta", "nested");
		const result = open({ homeDir: nested });

		assert.equal(result.status, "opened");
		assert.ok(statSync(nested).isDirectory());
		if (process.platform !== "win32") {
			// Windows has no POSIX mode bits; the private home there is the DACL the installer sets (§6).
			assert.equal(statSync(nested).mode & 0o777, POSIX_PRIVATE_DIR_MODE);
		}
	});
});

test("a failure outside the corruption class does not quarantine (a directory in the ledger's place)", () => {
	withHome((homeDir) => {
		const dbPath = join(homeDir, LEDGER_FILE_NAME);
		mkdirSync(dbPath);

		assert.throws(
			() => open({ homeDir, now: () => QUARANTINE_EPOCH_MS }),
			(error) => (((error as { errcode?: number }).errcode ?? 0) & 0xff) === SQLITE_CANTOPEN,
		);

		// Nothing was moved aside: a locked or unopenable ledger is not a corrupt one.
		assert.deepEqual(quarantinedNames(homeDir), []);
		assert.ok(statSync(dbPath).isDirectory());
	});
});

test("quarantineLedgerFile moves the -wal/-shm siblings with the ledger and tolerates their absence", () => {
	withHome((homeDir) => {
		// Siblings are created by hand, and that is the honest way to pin this step: a clean `close()`
		// removes -wal/-shm, and SQLite also removes them when it opens a file that is not a database, so
		// the rename would otherwise never see them. What is pinned is the helper's contract — every
		// sibling that exists at rename time moves with the ledger — which is the call the open path makes.
		const dbPath = join(homeDir, LEDGER_FILE_NAME);
		writeFileSync(dbPath, readFileSync(CORRUPT_FIXTURE_PATH));
		writeFileSync(`${dbPath}-wal`, "wal bytes");
		writeFileSync(`${dbPath}-shm`, "shm bytes");

		const quarantinedPath = quarantineLedgerFile(dbPath, QUARANTINE_EPOCH_MS);

		assert.equal(quarantinedPath, join(homeDir, `${LEDGER_CORRUPT_FILE_PREFIX}${QUARANTINE_EPOCH_MS}.db`));
		assert.deepEqual(quarantinedNames(homeDir), [
			`${LEDGER_CORRUPT_FILE_PREFIX}${QUARANTINE_EPOCH_MS}.db`,
			`${LEDGER_CORRUPT_FILE_PREFIX}${QUARANTINE_EPOCH_MS}.db-shm`,
			`${LEDGER_CORRUPT_FILE_PREFIX}${QUARANTINE_EPOCH_MS}.db-wal`,
		]);
		assert.deepEqual(readFileSync(quarantinedPath), readFileSync(CORRUPT_FIXTURE_PATH));
		assert.equal(readFileSync(`${quarantinedPath}-wal`, "utf8"), "wal bytes");
		assert.equal(readFileSync(`${quarantinedPath}-shm`, "utf8"), "shm bytes");

		// Without siblings it is not an error: the usual case, because a clean close removes them.
		const bareDir = join(homeDir, "bare");
		mkdirSync(bareDir);
		const barePath = join(bareDir, LEDGER_FILE_NAME);
		writeFileSync(barePath, "not a database either");
		assert.equal(quarantineLedgerFile(barePath, 1), join(bareDir, `${LEDGER_CORRUPT_FILE_PREFIX}1.db`));
		assert.equal(readFileSync(join(bareDir, `${LEDGER_CORRUPT_FILE_PREFIX}1.db`), "utf8"), "not a database either");
	});
});

test("the corruption class is the primary code, so extended codes are covered (design §5.1)", () => {
	for (const errcode of [SQLITE_CORRUPT, SQLITE_NOTADB, SQLITE_CORRUPT_VTAB, SQLITE_CORRUPT_INDEX]) {
		assert.equal(
			isLedgerCorruptionError(Object.assign(new Error("x"), { errcode })),
			true,
			`errcode ${errcode} must be corruption`,
		);
	}

	// A locked database is not a corrupt one, and neither is an unopenable path: quarantining either
	// would rename a healthy ledger out from under a second daemon or a permissions problem.
	for (const error of [
		Object.assign(new Error("x"), { errcode: SQLITE_BUSY }),
		Object.assign(new Error("x"), { errcode: SQLITE_CANTOPEN }),
		Object.assign(new Error("x"), { errcode: SQLITE_CANTOPEN_DIRECTORY }),
		new Error("plain"),
		undefined,
		null,
		"text",
		SQLITE_CORRUPT,
	]) {
		assert.equal(isLedgerCorruptionError(error), false, `expected not corruption: ${String(error)}`);
	}
});
