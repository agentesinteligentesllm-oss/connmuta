import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { LEDGER_SCHEMA_VERSION, POSIX_PRIVATE_DIR_MODE } from "../shared/constants.js";
import { readLedgerSchemaVersion, runPendingMigrations } from "./migrations.js";

/**
 * The ledger's open sequence (`ledger/open.ts`, design §5.1): make the home, open the file, decide whether
 * it may be used, and hand back a connection that is in WAL, at `synchronous = FULL` and at the current
 * schema version.
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against — this module carries no header of the kind
 * `test/security/provenance.test.ts` looks for, and `test/fixtures/v1-provenance.json` stays at its eleven
 * entries. (That gate keys on a *leading* `/**` block; this module's first line is an `import`, so nothing
 * here is read as a vendored copy.)
 *
 * The sequence, and why each step is where it is:
 *
 * 1. **`mkdir` the home** ({@link POSIX_PRIVATE_DIR_MODE}) — the ledger is private state, and on POSIX the
 *    mode is the only thing that says so. Windows has no mode bits; the home's DACL is the installer's
 *    job (design §6).
 * 2. **Open the file.** SQLite's open is lazy (measured on the pinned build: a file of prose opens
 *    happily), so nothing is decided here.
 * 3. **`PRAGMA quick_check`** is the decision: a corruption-class error **or** a returned row other than
 *    `ok` — SQLite answers some damage with an explanation row instead of a throw. A failure that is *not*
 *    corruption class (a directory in the ledger's place, a lock, permissions) propagates instead: renaming
 *    a healthy ledger out from under a second daemon would be worse than refusing to start.
 * 4. **On corruption or a future version: close, rename to `ledger.corrupt-<epochMs>.db`** with the
 *    `-wal`/`-shm` siblings, and open a fresh ledger. The corrupt file is never deleted and never
 *    overwritten, and nothing is downgraded: a file with a `user_version` this build does not know is a
 *    file from the future (ADR-0015), and it is set aside rather than migrated backwards.
 * 5. **The PRAGMA sequence** — `journal_mode = WAL`, `synchronous = FULL`, `foreign_keys = ON`. WAL is what
 *    lets a reader work while the poller writes; `synchronous = FULL` is deliberate and load-bearing: the
 *    offset confirmed to Telegram must never outlive a commit lost to a power failure (I-3).
 * 6. **Read `user_version` and run the pending migrations** (`ledger/migrations.ts`), forward only.
 *
 * **Boundary — what this module deliberately does not do.** The design's step 4 also raises condition
 * `ledger_quarantined` and appends an audit `system` row. Both belong to the condition store and the audit
 * module, which PR-13 lands; so this module returns the **verdict** as data
 * ({@link LedgerOpenResult}) and raises nothing. A caller that ignores `status: "quarantined"` is
 * ignoring a field, not a side effect it cannot see.
 *
 * **A limit stated rather than hidden.** Two of the three pragmas above already hold on the pinned build:
 * `synchronous` reads 2 and `foreign_keys` reads 1 on a fresh connection, so those assertions in the suite
 * pin the *effective* setting and kill a mutant that changes it, but they cannot kill one that deletes the
 * statement (`journal_mode`, whose default is `delete`, can). The statements stay because the design
 * mandates them and because depending on a default that SQLite documents differently for WAL is exactly
 * what `synchronous = FULL` exists to avoid.
 */

/** The ledger file's extension. */
const LEDGER_FILE_EXTENSION = ".db";

/** The ledger file's name inside the daemon home (`~/.conmuta/ledger.db`, design §5). */
export const LEDGER_FILE_NAME = `ledger${LEDGER_FILE_EXTENSION}`;

/** Prefix of the name a set-aside ledger gets, before its epoch milliseconds and its extension. */
export const LEDGER_CORRUPT_FILE_PREFIX = "ledger.corrupt-";

/**
 * The suffixes that belong to the ledger file rather than to a file of their own.
 *
 * SQLite creates both in WAL mode, and both describe the same database — moving `ledger.db` without them
 * would leave a quarantined file beside a stray write-ahead log, which is the opposite of setting the
 * file aside.
 */
export const LEDGER_QUARANTINE_SIBLING_SUFFIXES: readonly string[] = ["-wal", "-shm"];

/** SQLite's primary result code for a malformed database image (`sqlite3.h`, `SQLITE_CORRUPT`). */
const SQLITE_CORRUPT = 11;

/** SQLite's primary result code for "file is not a database" (`sqlite3.h`, `SQLITE_NOTADB`). */
const SQLITE_NOTADB = 26;

/**
 * The low byte of a result code, where SQLite keeps its primary class.
 *
 * A `node:sqlite` error's `errcode` is not always a primary code: extended codes share the primary code's
 * low byte (measured: opening a directory answers `526`, whose low byte `14` is `SQLITE_CANTOPEN`; the
 * corruption extensions are `267` and `779`, both in class `11`). Comparing the mask is therefore the
 * class rule the design asks for — "`SQLITE_CORRUPT`/`SQLITE_NOTADB`" names a class, not two integers —
 * and it is what keeps a corrupt index from being read as a healthy database.
 */
const PRIMARY_CODE_MASK = 0xff;

/** Why a ledger file was set aside instead of used. */
export type LedgerQuarantineReason = "corruption" | "future_version";

/** An open ledger: the connection, the file it holds, and the version that file records. */
export interface LedgerHandle {
	/** The open connection. The caller owns it and closes it. */
	readonly db: DatabaseSync;
	/** The ledger file, as opened. */
	readonly path: string;
	/** The schema version the file records after this call (design §5.1). */
	readonly schemaVersion: number;
}

/**
 * What {@link openLedger} found.
 *
 * The two cases are distinguished in the type rather than by an optional field, because
 * `status: "quarantined"` is the verdict PR-13's condition store and audit row are built from: a caller
 * cannot read it by accident, and it cannot be dropped without writing code that drops it.
 */
export type LedgerOpenResult =
	| ({ readonly status: "opened" } & LedgerHandle)
	| ({
			readonly status: "quarantined";
			readonly reason: LedgerQuarantineReason;
			/** Where the unusable file (and its siblings) went, for the condition and the audit row. */
			readonly quarantinedPath: string;
	  } & LedgerHandle);

/** What {@link openLedger} needs. */
export interface LedgerOpenOptions {
	/** The daemon home; `~/.conmuta` in production, a temp directory in tests. Created if missing. */
	readonly homeDir: string;
	/**
	 * The clock for the quarantined file's own name, in epoch milliseconds.
	 *
	 * Injected because the name is part of the design's contract and a test must be able to assert it
	 * exactly; production uses `Date.now`.
	 */
	readonly now?: () => number;
}

/**
 * Whether an error is SQLite telling us the file is not a usable database.
 *
 * The class, not two exact numbers, and it is exported so that rule is pinnable on its own: an extended
 * corruption code (`267`, `779`) cannot be produced from a plain file here, so the suite pins the mask
 * with synthetic codes and pins the real ones with the corrupt fixture. Everything outside the class —
 * `SQLITE_BUSY`, `SQLITE_CANTOPEN`, a plain `Error` — is deliberately *not* corruption.
 */
export function isLedgerCorruptionError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}
	const errcode = (error as { errcode?: unknown }).errcode;
	if (typeof errcode !== "number") {
		return false;
	}
	const primary = errcode & PRIMARY_CODE_MASK;
	return primary === SQLITE_CORRUPT || primary === SQLITE_NOTADB;
}

/**
 * Moves a ledger file, and the `-wal`/`-shm` siblings that exist beside it, to `ledger.corrupt-<epochMs>.db`.
 *
 * Exported because the sibling half of this step cannot be reached from the open path: a clean `close()`
 * removes both siblings, and SQLite removes them too when it opens a file that is not a database, so by
 * the time the open path renames, the only sibling it can meet is one a crash left behind. The helper's
 * contract — every sibling that exists at rename time moves with the ledger, and a missing one is not an
 * error — is pinned directly in `test/ledger/open.test.ts`, which is also where F2's `doctor` and PR-13's
 * condition store will find it if they need the same move.
 *
 * The name is the design's, verbatim: `<epochMs>` is milliseconds since the epoch, so two quarantines an
 * instant apart do not collide and the newest is the largest name.
 */
export function quarantineLedgerFile(dbPath: string, epochMs: number): string {
	const quarantinedPath = join(dirname(dbPath), `${LEDGER_CORRUPT_FILE_PREFIX}${epochMs}${LEDGER_FILE_EXTENSION}`);
	renameSync(dbPath, quarantinedPath);
	for (const suffix of LEDGER_QUARANTINE_SIBLING_SUFFIXES) {
		const sibling = `${dbPath}${suffix}`;
		if (existsSync(sibling)) {
			renameSync(sibling, `${quarantinedPath}${suffix}`);
		}
	}
	return quarantinedPath;
}

/**
 * Opens the daemon's ledger, or opens a fresh one after setting an unusable file aside (design §5.1).
 *
 * The connection returned is migrated to {@link LEDGER_SCHEMA_VERSION} and left outside any transaction.
 * It throws only when the ledger cannot be used at all *and* the file is not the reason — a path that
 * cannot be created, a failure outside the corruption class — because those are conditions the daemon
 * must not paper over by quarantining a healthy file.
 */
export function openLedger(options: LedgerOpenOptions): LedgerOpenResult {
	const homeDir = options.homeDir;
	const dbPath = join(homeDir, LEDGER_FILE_NAME);
	const now = options.now ?? Date.now;
	mkdirSync(homeDir, { recursive: true, mode: POSIX_PRIVATE_DIR_MODE });

	const first = probeLedger(dbPath);
	if (first.kind === "open") {
		return { status: "opened", db: first.db, path: dbPath, schemaVersion: first.schemaVersion };
	}

	// Closed before the rename, because SQLite holds the file open and Windows refuses to rename an open
	// file — and because closing is the one checkpoint on this path, which is why the siblings are usually
	// gone by the time the helper looks for them.
	first.db.close();
	const quarantinedPath = quarantineLedgerFile(dbPath, now());
	const fresh = openFreshLedger(dbPath);

	return {
		status: "quarantined",
		reason: first.reason,
		quarantinedPath,
		db: fresh.db,
		path: dbPath,
		schemaVersion: fresh.schemaVersion,
	};
}

/** What a first look at the file decided: usable, or the reason it must be set aside. */
type LedgerProbe =
	| { readonly kind: "open"; readonly db: DatabaseSync; readonly schemaVersion: number }
	| { readonly kind: "quarantine"; readonly reason: LedgerQuarantineReason; readonly db: DatabaseSync };

/**
 * Opens the file, decides whether it may be used, and migrates it — the whole sequence but the rename.
 *
 * A file that must be quarantined comes back **open**, so its caller closes it before the rename; both
 * refusal paths return without closing, which is why one `catch` can own every other failure.
 */
function probeLedger(dbPath: string): LedgerProbe {
	const db = new DatabaseSync(dbPath);
	try {
		if (isCorruptDatabase(db)) {
			return { kind: "quarantine", reason: "corruption", db };
		}
		applyLedgerPragmas(db);
		const currentVersion = readLedgerSchemaVersion(db);
		if (currentVersion > LEDGER_SCHEMA_VERSION) {
			return { kind: "quarantine", reason: "future_version", db };
		}
		return { kind: "open", db, schemaVersion: runPendingMigrations(db, currentVersion) };
	} catch (error) {
		db.close();
		throw error;
	}
}

/**
 * Opens the ledger file the quarantine just created: no `quick_check`, no verdict, no second chance.
 *
 * The file was created by the rename, so there is nothing to classify — and a failure here is not a
 * reason to quarantine again, because the quarantine already happened and the file it moved aside is
 * safe. Whatever SQLite raises propagates with the connection closed.
 */
function openFreshLedger(dbPath: string): LedgerHandle {
	const db = new DatabaseSync(dbPath);
	try {
		applyLedgerPragmas(db);
		return { db, path: dbPath, schemaVersion: runPendingMigrations(db, readLedgerSchemaVersion(db)) };
	} catch (error) {
		db.close();
		throw error;
	}
}

/** Whether SQLite says this file is unusable, by throwing or by answering `quick_check` with anything else. */
function isCorruptDatabase(db: DatabaseSync): boolean {
	let rows: unknown[];
	try {
		rows = db.prepare("PRAGMA quick_check").all();
	} catch (error) {
		if (isLedgerCorruptionError(error)) {
			return true;
		}
		throw error;
	}
	// SQLite does not only throw: for some damage it answers with a row that explains the problem (a row
	// other than `ok`), so a truthiness check on the result would call a damaged ledger healthy.
	return rows.some((row) => (row as { quick_check?: unknown }).quick_check !== "ok");
}

/** The three pragmas the open sequence owns, in the design's order (design §5.1). */
function applyLedgerPragmas(db: DatabaseSync): void {
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA synchronous = FULL");
	db.exec("PRAGMA foreign_keys = ON");
}
