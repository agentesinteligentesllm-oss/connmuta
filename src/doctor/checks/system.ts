import { accessSync, constants as fsConstants, existsSync, realpathSync, statSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { isProcessAlive, readLockFile } from "../../daemon/lifecycle/lock.js";
import { isNodeAtOrAboveFloor } from "../../daemon/node-floor.js";
import { runIcacls, type ExecFileImpl } from "../../installer/exec.js";
import { CLI_ENTRY } from "../../installer/launcher.js";
import { LEDGER_FILE_NAME } from "../../ledger/open.js";
import { NODE_FLOOR, POSIX_PRIVATE_DIR_MODE } from "../../shared/constants.js";

/**
 * The offline/system tier (`doctor/checks/system.ts`, design.md §9.1, spec.md "Offline/system tier
 * checks the machine, not the registry content"; tasks.md 14.1/14.2).
 *
 * Every check here is read-only and makes no network call: Node floor, the recorded launcher paths,
 * home writability, a read-only ledger `quick_check`, stale `daemon.lock`/`spawn.lock` detection, and
 * the home/`secrets/` ACL state. None of these checks repairs anything it finds — that is the whole
 * point of an offline diagnostic (spec.md: "makes no network call, and takes no corrective action
 * itself").
 *
 * **Scoping disclosure (recorded node/script paths).** design.md §9.1 says "the recorded node/script
 * paths exist"; the only place a node/script pair is recorded is `installer/launcher.ts`'s per-project
 * `LauncherEntry`, written into each bound project's own tool configs — re-reading every project's
 * stored entry is registry-tier territory (a later PR reads `registry.json`/`conmuta.json` content).
 * This tier instead checks the two paths any recorded entry would resolve to right now, on this
 * machine: the running node interpreter and the built CLI entry point ({@link CLI_ENTRY}) — a lighter
 * reading of the brief wording that still stays inside "checks the machine, not the registry content".
 */

/** One diagnostic result: what was checked, its verdict, and a human-readable (pre-redaction) detail. */
export interface Finding {
	readonly id: string;
	readonly status: "pass" | "warn" | "fail";
	readonly detail: string;
}

/** What {@link runSystemChecks} needs. */
export interface RunSystemChecksOptions {
	/** The daemon home; `~/.conmuta` in production, a temp directory in tests. Never created or written here. */
	readonly homeDir: string;
	/** Overridable for tests; defaults to the real `installer/exec.ts` icacls runner (Windows only). */
	readonly execImpl?: ExecFileImpl;
}

/** Name of the daemon's own singleton lock, mirroring `daemon/lifecycle/lock.ts`'s private constant. */
const DAEMON_LOCK_FILENAME = "daemon.lock";

/** Name of the client's spawn-election lock, mirroring `client/run-state.ts`'s private constant. */
const SPAWN_LOCK_FILENAME = "spawn.lock";

/** Name of the daemon home's run-file/lock subdirectory (`daemon/home.ts`'s own convention). */
const RUN_DIR_NAME = "run";

/** Name of the daemon home's fallback-token subdirectory (`secret-store/file-fallback.ts`'s own convention). */
const SECRETS_DIR_NAME = "secrets";

/** The message an unknown thrown value carries, for a finding's detail. */
function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Whether Node meets {@link NODE_FLOOR}. No injection seam: mirrors `cli/main.ts`'s own dispatcher,
 * which reads `process.version` directly because it has no seam for a Node built-in either.
 */
function checkNodeFloor(): Finding {
	const ok = isNodeAtOrAboveFloor(process.version);
	return {
		id: "node-floor",
		status: ok ? "pass" : "fail",
		detail: `node ${process.version} ${ok ? "meets" : "is below"} the required floor (${NODE_FLOOR})`,
	};
}

/** Whether the current node interpreter and the built CLI entry point still resolve (see module doc). */
function checkLauncherPaths(): Finding {
	try {
		const nodeExists = existsSync(realpathSync(process.execPath));
		const entryExists = existsSync(CLI_ENTRY);
		if (nodeExists && entryExists) {
			return {
				id: "launcher-paths",
				status: "pass",
				detail: "the node interpreter and the CLI entry point both resolve",
			};
		}
		const missing = [nodeExists ? undefined : "node interpreter", entryExists ? undefined : "CLI entry point"]
			.filter((part): part is string => part !== undefined)
			.join(", ");
		return { id: "launcher-paths", status: "fail", detail: `missing: ${missing}` };
	} catch (error) {
		return { id: "launcher-paths", status: "fail", detail: `could not resolve launcher paths: ${describeError(error)}` };
	}
}

/** Whether `homeDir` exists and is writable; never attempts a write-and-delete probe (read-only tier). */
function checkHomeWritable(homeDir: string): Finding {
	if (!existsSync(homeDir)) {
		return { id: "home-writable", status: "pass", detail: `${homeDir} not yet created (run setup)` };
	}
	try {
		accessSync(homeDir, fsConstants.W_OK);
		return { id: "home-writable", status: "pass", detail: `${homeDir} is writable` };
	} catch (error) {
		return { id: "home-writable", status: "fail", detail: `${homeDir} is not writable: ${describeError(error)}` };
	}
}

/**
 * Whether the ledger opens **read-only** with `PRAGMA quick_check` (design.md §9.1: "never
 * quarantines"). Deliberately never calls `ledger/open.ts`'s `openLedger` — that is the daemon's own
 * create-or-migrate-or-quarantine sequence, the opposite of a read-only diagnostic that must never
 * rename a file it merely inspected.
 */
function checkLedger(homeDir: string): Finding {
	const dbPath = join(homeDir, LEDGER_FILE_NAME);
	if (!existsSync(dbPath)) {
		return { id: "ledger", status: "pass", detail: `${dbPath} not yet created (run setup)` };
	}

	let db: DatabaseSync;
	try {
		db = new DatabaseSync(dbPath, { readOnly: true });
	} catch (error) {
		return { id: "ledger", status: "fail", detail: `could not open ${dbPath} read-only: ${describeError(error)}` };
	}
	try {
		const rows = db.prepare("PRAGMA quick_check").all() as { quick_check?: unknown }[];
		const ok = rows.length === 1 && rows[0]?.quick_check === "ok";
		return {
			id: "ledger",
			status: ok ? "pass" : "fail",
			detail: ok ? `${dbPath} quick_check: ok` : `${dbPath} quick_check reported damage (${rows.length} row(s))`,
		};
	} catch (error) {
		return { id: "ledger", status: "fail", detail: `${dbPath} quick_check failed: ${describeError(error)}` };
	} finally {
		db.close();
	}
}

/** Whether `run/<filename>` names a live holder, is absent, or is stale (a dead pid) — reported, never touched. */
function checkLock(homeDir: string, filename: string, id: string): Finding {
	const lockPath = join(homeDir, RUN_DIR_NAME, filename);
	const payload = readLockFile(lockPath);
	if (payload === null) {
		return { id, status: "pass", detail: `${filename}: absent` };
	}
	if (isProcessAlive(payload.pid)) {
		return { id, status: "pass", detail: `${filename}: held by a live process (pid ${payload.pid})` };
	}
	return { id, status: "fail", detail: `${filename}: stale — pid ${payload.pid} is not running` };
}

/** The trustee name `icacls` needs to resolve unambiguously, mirroring `installer/acl.ts`'s own private construction. */
function qualifiedCurrentUser(): string {
	const { username } = userInfo();
	const domain = process.env.USERDOMAIN ?? "";
	return domain === "" ? username : `${domain}\\${username}`;
}

/**
 * Extracts each ACE's trustee name from `icacls` output already stripped of its leading path.
 *
 * Disclosed duplication: mirrors `test/installer/acl.test.ts`'s own `aclEntriesOf`/`aclTrustees`
 * helpers exactly (same reasoning — a scratch/home path under the current user's profile can contain
 * the username, so matching the *raw* output would find a false hit in the path text, not a real ACE).
 * `installer/acl.ts` exports no reusable parser for this, only `hardenHomeAcl` itself, so this is a
 * small, disclosed copy rather than a new shared export for a single extra caller.
 */
function aclTrustees(path: string, raw: string): string[] {
	const entriesText = raw.startsWith(path) ? raw.slice(path.length) : raw;
	return [...entriesText.matchAll(/^[ \t]*(\S[^\r\n]*?):\(/gm)].map((match) => match[1].trim());
}

/** Whether `dirPath`'s ACL/mode grants only the current user (Windows: `icacls` read; POSIX: the mode bits). */
function checkAcl(dirPath: string, id: string, execImpl: ExecFileImpl | undefined): Finding {
	if (!existsSync(dirPath)) {
		return { id, status: "pass", detail: `${dirPath} not yet created (run setup)` };
	}

	if (process.platform !== "win32") {
		const mode = statSync(dirPath).mode & 0o777;
		const ok = mode === POSIX_PRIVATE_DIR_MODE;
		return {
			id,
			status: ok ? "pass" : "fail",
			detail: ok
				? `${dirPath} mode is ${mode.toString(8)}`
				: `${dirPath} mode ${mode.toString(8)} does not match the required ${POSIX_PRIVATE_DIR_MODE.toString(8)}`,
		};
	}

	try {
		const raw = runIcacls([dirPath], execImpl);
		const trustees = aclTrustees(dirPath, raw).map((trustee) => trustee.toUpperCase());
		const expected = qualifiedCurrentUser().toUpperCase();
		const ok = trustees.length === 1 && trustees[0] === expected;
		return {
			id,
			status: ok ? "pass" : "fail",
			detail: ok
				? `${dirPath} grants only the current user`
				: `${dirPath} ACL trustees: ${trustees.length > 0 ? trustees.join(", ") : "(none parsed)"}`,
		};
	} catch (error) {
		return { id, status: "fail", detail: `could not read the ACL of ${dirPath}: ${describeError(error)}` };
	}
}

/** Runs every offline/system check (design.md §9.1's whole row) and returns their findings, in a fixed order. */
export function runSystemChecks(options: RunSystemChecksOptions): Finding[] {
	const { homeDir, execImpl } = options;
	return [
		checkNodeFloor(),
		checkLauncherPaths(),
		checkHomeWritable(homeDir),
		checkLedger(homeDir),
		checkLock(homeDir, DAEMON_LOCK_FILENAME, "daemon-lock"),
		checkLock(homeDir, SPAWN_LOCK_FILENAME, "spawn-lock"),
		checkAcl(homeDir, "home-acl", execImpl),
		checkAcl(join(homeDir, SECRETS_DIR_NAME), "secrets-acl", execImpl),
	];
}
