import { randomUUID } from "node:crypto";
import {
	constants as fsConstants,
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { BACKUP_SUFFIX_PREFIX, REGISTRY_REPLACE_ATTEMPTS } from "./constants.js";

/**
 * The installer's one edit engine (design.md §4.1, D-32, D-36).
 *
 * Every file mutation the installer makes — tool configs, `conmuta.json`, instruction files, the
 * LaunchAgent plist — goes through {@link editFile}'s seven-step pipeline: refuse a symlinked target
 * or parent; create parent directories with no backup when the file is absent; strictly parse a
 * present file through a per-format {@link FormatAdapter}; treat an already-installed same-named
 * entry as a no-op when identical or a refusal when different; take an exclusive pre-edit backup;
 * write via a temp file plus atomic rename; and read the result back, re-parsing it to assert the
 * change is exactly the intended one before trusting it. Per-format parsing and text construction
 * (JSON/JSONC in this PR, TOML and Markdown in later ones) live behind {@link FormatAdapter} so this
 * module stays format-agnostic.
 */

/** Why {@link editFile} refused to write. */
export type FileEditRefusalReason = "symlink" | "parse-error" | "conflict" | "verification-failed";

/** Thrown by {@link editFile} (or a {@link FormatAdapter}) when a step in the pipeline refuses. */
export class FileEditRefusal extends Error {
	constructor(
		readonly reason: FileEditRefusalReason,
		message: string,
	) {
		super(message);
		this.name = "FileEditRefusal";
	}
}

/**
 * What {@link editFile} needs from a per-format parser/writer to run its pipeline (design.md §4.2).
 *
 * `entryPath` addresses a value the same way `jsonc-parser`'s `JSONPath` does: a sequence of object
 * keys from the document root down to the entry itself (e.g. `["mcpServers", "conmuta"]`).
 */
export interface FormatAdapter {
	/**
	 * Strictly parses `text` into a plain object tree. Throws a {@link FileEditRefusal} with reason
	 * `"parse-error"`, citing the failure's position, on a syntax error, a non-object root, or a
	 * container segment of `entryPath` that already holds a non-object value.
	 */
	parse(text: string): unknown;

	/**
	 * Computes the full next file text that installs `entry` at `entryPath` in `text` (`""` when the
	 * file is absent). Preserving every byte outside the affected range (D-36) is this function's job.
	 */
	buildText(text: string, entryPath: readonly string[], entry: unknown): string;
}

export interface EditFileOptions {
	/** Absolute path of the file to edit. */
	readonly path: string;
	/** The format-specific parser/writer for this file. */
	readonly adapter: FormatAdapter;
	/** Object-key path from the document root to the entry, e.g. `["mcpServers", "conmuta"]`. */
	readonly entryPath: readonly string[];
	/** The entry to install at `entryPath`. */
	readonly entry: unknown;
	/** Clock used to name the backup file; overridable so tests can force a same-second collision. */
	readonly now?: () => Date;
}

export type EditFileOutcome = "created" | "noop" | "written";

/** What {@link checkFileEdit} evaluated would happen on write. */
export type CheckFileEditOutcome = "created" | "noop" | "will-write";

/**
 * Pre-validates that {@link editFile} will not refuse on symlink, parse error or entry conflict.
 *
 * Runs steps 1-4 of the edit pipeline (read-only): refuses if target or parent is a symlink,
 * if an existing file cannot be parsed, or if a different entry is already installed at `entryPath`.
 * Returns what the write would do ("created" if absent, "noop" if identical entry already present,
 * or "will-write" if absent entry in existing file).
 *
 * Throws {@link FileEditRefusal} if any step refuses. Makes ZERO writes, creates no files/directories,
 * and takes no backup.
 */
export function checkFileEdit(options: Omit<EditFileOptions, "now">): CheckFileEditOutcome {
	const { path, adapter, entryPath, entry } = options;

	const parent = dirname(path);
	if (isSymlink(parent)) {
		throw new FileEditRefusal("symlink", `refusing to edit: parent directory is a symlink: ${parent}`);
	}
	if (isSymlink(path)) {
		throw new FileEditRefusal("symlink", `refusing to edit: target is a symlink: ${path}`);
	}

	if (!existsSync(path)) {
		return "created";
	}

	const currentText = readFileSync(path, "utf8");
	const before = adapter.parse(currentText);

	const existing = readEntryAtPath(before, entryPath);
	if (existing !== undefined) {
		if (isDeepStrictEqual(existing, entry)) {
			return "noop";
		}
		throw new FileEditRefusal(
			"conflict",
			`refusing to overwrite a different entry already present at "${entryPath.join(".")}":\n${diffEntries(existing, entry)}`,
		);
	}

	return "will-write";
}

/** Runs the seven-step edit pipeline (design.md §4.1) and returns what happened. */
export function editFile(options: EditFileOptions): EditFileOutcome {
	const { path, adapter, entryPath, entry } = options;
	const now = options.now ?? (() => new Date());

	// Step 1: refuse a symlinked target or parent. A rename-over would replace the link with a
	// regular file, silently breaking whatever the link was pointing the user's setup at. Checked via
	// lstatSync directly (never existsSync, which follows links and reports a dangling symlink's
	// target as absent, letting a broken link bypass this refusal entirely).
	const parent = dirname(path);
	if (isSymlink(parent)) {
		throw new FileEditRefusal("symlink", `refusing to edit: parent directory is a symlink: ${parent}`);
	}
	if (isSymlink(path)) {
		throw new FileEditRefusal("symlink", `refusing to edit: target is a symlink: ${path}`);
	}

	// Step 2: absent file creates its parent directories and is written directly; no backup exists
	// to take.
	if (!existsSync(path)) {
		mkdirSync(parent, { recursive: true });
		const nextText = adapter.buildText("", entryPath, entry);
		writeViaTempAndRename(path, nextText);
		verifyWrite(path, adapter, undefined, entryPath, entry, undefined);
		return "created";
	}

	// Step 3: strict parse of the present file.
	const currentText = readFileSync(path, "utf8");
	const before = adapter.parse(currentText);

	// Step 4: an already-installed same-named entry is a no-op when identical, a refusal otherwise.
	const existing = readEntryAtPath(before, entryPath);
	if (existing !== undefined) {
		if (isDeepStrictEqual(existing, entry)) {
			return "noop";
		}
		throw new FileEditRefusal(
			"conflict",
			`refusing to overwrite a different entry already present at "${entryPath.join(".")}":\n${diffEntries(existing, entry)}`,
		);
	}

	// Step 5: exclusive pre-edit backup.
	const backupPath = takeBackup(path, now);

	// Step 6: write via a temp file plus atomic rename.
	const nextText = adapter.buildText(currentText, entryPath, entry);
	writeViaTempAndRename(path, nextText);

	// Step 7: read back, re-parse, and assert the change is exactly the intended one; restore on failure.
	verifyWrite(path, adapter, before, entryPath, entry, backupPath);
	return "written";
}

/** Reads the entry currently installed at `entryPath` in already-parsed `parsed`, or `undefined`. */
function readEntryAtPath(parsed: unknown, entryPath: readonly string[]): unknown {
	let node: unknown = parsed;
	for (let i = 0; i < entryPath.length; i++) {
		if (node === undefined) {
			return undefined;
		}
		if (!isPlainObject(node)) {
			const at = entryPath.slice(0, i).join(".") || "<root>";
			throw new FileEditRefusal("parse-error", `expected an object at "${at}", found ${describeValueType(node)}`);
		}
		node = node[entryPath[i]];
	}
	return node;
}

/** Returns a copy of `base` (or a fresh object when `base` is absent) with `entry` set at `entryPath`. */
function setAtPath(base: unknown, entryPath: readonly string[], entry: unknown): unknown {
	const root: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
	let node = root;
	for (let i = 0; i < entryPath.length - 1; i++) {
		const key = entryPath[i];
		const child = node[key];
		node[key] = isPlainObject(child) ? { ...child } : {};
		node = node[key] as Record<string, unknown>;
	}
	node[entryPath[entryPath.length - 1]] = entry;
	return root;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Describes `value`'s type for a refusal message (`"null"`, `"an array"`, or `typeof value`). */
export function describeValueType(value: unknown): string {
	if (value === null) {
		return "null";
	}
	if (Array.isArray(value)) {
		return "an array";
	}
	return typeof value;
}

/**
 * Reports whether `path` is a symlink, including a dangling one whose target no longer exists.
 *
 * `lstatSync` (unlike `existsSync`/`statSync`) never follows the link, so it still succeeds — and
 * still reports `isSymbolicLink() === true` — when the link's target is gone. Only a genuinely
 * absent path (nothing at all, not even a link) throws `ENOENT`, which this treats as "not a symlink".
 */
function isSymlink(path: string): boolean {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch (error) {
		if (isErrno(error, "ENOENT")) {
			return false;
		}
		throw error;
	}
}

/** Reads the written file back, re-parses it, and confirms the delta is exactly the intended entry. */
function verifyWrite(
	path: string,
	adapter: FormatAdapter,
	before: unknown,
	entryPath: readonly string[],
	entry: unknown,
	backupPath: string | undefined,
): void {
	let after: unknown;
	try {
		after = adapter.parse(readFileSync(path, "utf8"));
	} catch (error) {
		restoreOrRemove(path, backupPath);
		throw new FileEditRefusal(
			"verification-failed",
			`${path} failed to re-parse after the edit; restored the previous content (${describeError(error)})`,
		);
	}
	const expected = setAtPath(before, entryPath, entry);
	if (!isDeepStrictEqual(after, expected)) {
		restoreOrRemove(path, backupPath);
		throw new FileEditRefusal(
			"verification-failed",
			`${path} did not contain exactly the intended entry after re-parsing; restored the previous content`,
		);
	}
}

function restoreOrRemove(path: string, backupPath: string | undefined): void {
	if (backupPath !== undefined) {
		copyFileSync(backupPath, path);
	} else {
		rmSync(path, { force: true });
	}
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Bounded retries for a same-second backup filename collision.
 *
 * The first attempt uses {@link formatBackupTimestamp}'s second resolution; a collision (another
 * backup already taken in the same second) retries with a millisecond-resolution suffix plus an
 * attempt counter, which cannot collide with the first attempt's name or with each other.
 */
const MAX_BACKUP_COLLISION_RETRIES = 5;

/** Takes an exclusive pre-edit backup of `path`, retrying on a same-second filename collision. */
function takeBackup(path: string, now: () => Date): string {
	let lastError: unknown;
	for (let attempt = 0; attempt < MAX_BACKUP_COLLISION_RETRIES; attempt++) {
		const date = now();
		const suffix = attempt === 0 ? formatBackupTimestamp(date) : `${formatBackupTimestampMillis(date)}-${attempt}`;
		const backupPath = `${path}${BACKUP_SUFFIX_PREFIX}${suffix}`;
		try {
			copyFileSync(path, backupPath, fsConstants.COPYFILE_EXCL);
			return backupPath;
		} catch (error) {
			if (!isErrno(error, "EEXIST")) {
				throw error;
			}
			lastError = error;
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error(`could not create a unique backup for ${path} after ${MAX_BACKUP_COLLISION_RETRIES} attempts`);
}

/** Width, in digits, of each zero-padded date/time component in a backup timestamp suffix. */
const TIMESTAMP_COMPONENT_WIDTH = 2;

/** Formats `date` as `YYYYMMDDTHHMMSSZ` (second resolution, DATA-MODEL's `*.bak-<reason>-<date>` convention). */
export function formatBackupTimestamp(date: Date): string {
	const pad = (value: number): string => String(value).padStart(TIMESTAMP_COMPONENT_WIDTH, "0");
	const year = String(date.getUTCFullYear());
	const month = pad(date.getUTCMonth() + 1);
	const day = pad(date.getUTCDate());
	const hours = pad(date.getUTCHours());
	const minutes = pad(date.getUTCMinutes());
	const seconds = pad(date.getUTCSeconds());
	return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/** Millisecond-resolution width used only to break a same-second backup filename collision. */
const MILLISECONDS_WIDTH = 3;

function formatBackupTimestampMillis(date: Date): string {
	return `${formatBackupTimestamp(date)}${String(date.getUTCMilliseconds()).padStart(MILLISECONDS_WIDTH, "0")}`;
}

/**
 * Writes `text` to a temp sibling of `path` and renames it into place.
 *
 * Retries the rename up to {@link REGISTRY_REPLACE_ATTEMPTS} times: the same Windows rename-over
 * race `registry.json` faces (a concurrent reader holding the target open can transiently fail the
 * rename with `EPERM`/`EBUSY`) applies to any file this engine writes, not only the registry.
 *
 * Exported for `installer/gitignore.ts`'s own reuse (native review `review-01a2374400a854fc`,
 * R4-gitignore-nonatomic-write): a plain `writeFileSync` over an existing `.gitignore` truncates it
 * in place, so a crash or `ENOSPC` mid-write could corrupt whatever unrelated ignore rules were
 * already there — the exact hazard this helper already exists to avoid for every other file this
 * engine writes.
 */
export function writeViaTempAndRename(path: string, text: string): void {
	const tempPath = `${path}.tmp-${randomUUID()}`;
	writeFileSync(tempPath, text, "utf8");
	let lastError: unknown;
	for (let attempt = 0; attempt < REGISTRY_REPLACE_ATTEMPTS; attempt++) {
		try {
			renameSync(tempPath, path);
			return;
		} catch (error) {
			lastError = error;
		}
	}
	rmSync(tempPath, { force: true });
	throw lastError;
}

function isErrno(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

/** Builds a compact unified-style diff (`JSON.stringify`, 2-space indent) between two entry values. */
function diffEntries(existing: unknown, intended: unknown): string {
	const before = JSON.stringify(existing, null, 2).split("\n");
	const after = JSON.stringify(intended, null, 2).split("\n");
	return unifiedLines(before, after).join("\n");
}

/** Line-based diff via a straightforward LCS table; inputs here are always short (one config entry). */
function unifiedLines(before: string[], after: string[]): string[] {
	const n = before.length;
	const m = after.length;
	const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}
	const lines: string[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (before[i] === after[j]) {
			lines.push(`  ${before[i]}`);
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			lines.push(`- ${before[i]}`);
			i++;
		} else {
			lines.push(`+ ${after[j]}`);
			j++;
		}
	}
	while (i < n) {
		lines.push(`- ${before[i]}`);
		i++;
	}
	while (j < m) {
		lines.push(`+ ${after[j]}`);
		j++;
	}
	return lines;
}
