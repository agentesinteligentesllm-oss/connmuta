import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { HARNESS_NAMES, LADDER_LEVELS, LADDER_SCHEMA_VERSION } from "./constants.js";

/**
 * The wake ladder (`runner/ladder.ts`; ADR-0032 R4/R5, PT-35; CONSTITUTION §3.1). One machine-local record
 * per binding decides whether the satellite may wake that binding and in which profile:
 *
 *  - `off` (the default) — no wake signal is read at all;
 *  - `notify` — a human is told; **no turn is started**;
 *  - `wake` — one turn, read/reply-only;
 *  - `autopilot` — one turn in the confined act profile (`runner/harness.ts` fixes the argv side; R7 fixes
 *    what the turn may do).
 *
 * **Fail closed, always (R4).** Every failure mode of this file — missing, unreadable, unparsable, wrong
 * schema version, unknown level, unknown harness, a record with no human note — resolves that binding to
 * `off`, with a reason the loop records once. There is no path in this module that turns "I could not
 * understand the record" into "wake the agent".
 *
 * **Why a file, and why here.** `conmuta.json` is committed, id-only and read by strangers (D5), so an
 * execution policy must not live in it (PT-35 asserts the schema-shape half of that rule; this module is the
 * machine-local half). The record sits under the daemon home, next to the ledger, and is written only by an
 * explicit, human-supplied action through `runner/cli.ts` — a record always carries `by` (who asked) and
 * `at` (when), and a record without them is refused at the write AND treated as malformed at the read.
 *
 * **Editing by hand is allowed and still fails closed.** The file is plain JSON with a declared schema
 * version; a human may edit it with any editor, and a typo resolves to `off` rather than to the nearest
 * guess.
 */

export type LadderLevel = (typeof LADDER_LEVELS)[number];

export interface LadderEntry {
	readonly level: LadderLevel;
	/** One of {@link HARNESS_NAMES}. The executable set is closed: no field of this record can name another. */
	readonly harness: string;
	/** Extra literal arguments placed before the prompt. Validated for shape here; for refusals in `harness.ts`. */
	readonly harness_args?: readonly string[];
	/** Who raised this binding. Required and non-empty: a record nobody signed is not a human action. */
	readonly by: string;
	/** When it was raised, ISO-8601, written by the CLI. */
	readonly at: string;
}

/** Why a binding resolves to `off`. Each reason is recorded once by the loop, so a refusal is visible. */
export type LadderOffReason =
	| "no_record"
	| "level_off"
	| "unreadable"
	| "malformed"
	| "unknown_level"
	| "unknown_harness";

export type LadderResolution =
	| { readonly kind: "entry"; readonly entry: LadderEntry }
	| { readonly kind: "off"; readonly reason: LadderOffReason };

export interface LadderRead {
	/** Raw, unvalidated entries by project id. Validation happens per binding in {@link resolveLadder}, so one
	 * corrupt binding cannot silently disable another. */
	readonly bindings: ReadonlyMap<string, unknown>;
	readonly problem: "missing" | "unreadable" | "malformed" | null;
}

/** `<home>/runner/ladder.json`. Named once so the CLI, the loop and the tests cannot disagree. */
export function ladderPathFor(homeDir: string): string {
	return join(homeDir, "runner", "ladder.json");
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const isLevel = (value: unknown): value is LadderLevel =>
	typeof value === "string" && (LADDER_LEVELS as readonly string[]).includes(value);

const isHarnessName = (value: unknown): boolean =>
	typeof value === "string" && (HARNESS_NAMES as readonly string[]).includes(value);

/** Reads the file. Never throws and never guesses: an unreadable or unparsable file is a `problem`. */
export function readLadderFile(path: string): LadderRead {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		return { bindings: new Map(), problem: code === "ENOENT" ? "missing" : "unreadable" };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { bindings: new Map(), problem: "malformed" };
	}
	if (!isRecord(parsed) || parsed.schema_version !== LADDER_SCHEMA_VERSION || !isRecord(parsed.bindings)) {
		return { bindings: new Map(), problem: "malformed" };
	}
	return { bindings: new Map(Object.entries(parsed.bindings)), problem: null };
}

/**
 * Resolves one binding. A missing file or a missing entry is `off`/`no_record`; a file-level problem
 * propagates as that problem; an entry that fails validation is `off` with the precise reason. Only a fully
 * valid, human-signed record returns `kind: "entry"`.
 */
export function resolveLadder(read: LadderRead, projectId: string): LadderResolution {
	if (read.problem === "missing") return { kind: "off", reason: "no_record" };
	if (read.problem === "unreadable") return { kind: "off", reason: "unreadable" };
	if (read.problem === "malformed") return { kind: "off", reason: "malformed" };

	const raw = read.bindings.get(projectId);
	if (raw === undefined) return { kind: "off", reason: "no_record" };
	if (!isRecord(raw)) return { kind: "off", reason: "malformed" };

	if (!isLevel(raw.level)) return { kind: "off", reason: "unknown_level" };
	if (!isNonEmptyString(raw.harness)) return { kind: "off", reason: "malformed" };
	if (!isHarnessName(raw.harness)) return { kind: "off", reason: "unknown_harness" };
	if (!isNonEmptyString(raw.by) || !isNonEmptyString(raw.at)) return { kind: "off", reason: "malformed" };
	if (raw.harness_args !== undefined) {
		if (!Array.isArray(raw.harness_args) || !raw.harness_args.every(isNonEmptyString)) {
			return { kind: "off", reason: "malformed" };
		}
	}
	if (raw.level === "off") return { kind: "off", reason: "level_off" };

	return {
		kind: "entry",
		entry: {
			level: raw.level,
			harness: raw.harness,
			...(Array.isArray(raw.harness_args) ? { harness_args: raw.harness_args as readonly string[] } : {}),
			by: raw.by,
			at: raw.at,
		},
	};
}

/** Throws (never returns a reason) when an entry could not be resolved as an entry: the write side refuses
 * bad input instead of persisting it, so the file on disk only ever holds records a human meant to write. */
function assertWritable(entry: LadderEntry): void {
	if (!isLevel(entry.level)) throw new Error(`unknown ladder level: ${String(entry.level)}`);
	if (!isHarnessName(entry.harness)) throw new Error(`unknown harness: ${String(entry.harness)}`);
	if (!isNonEmptyString(entry.by)) throw new Error("a ladder record requires a non-empty `by` note");
	if (!isNonEmptyString(entry.at)) throw new Error("a ladder record requires a non-empty `at` timestamp");
	if (entry.harness_args !== undefined) {
		if (!Array.isArray(entry.harness_args) || !entry.harness_args.every(isNonEmptyString)) {
			throw new Error("harness_args must be a list of non-empty strings");
		}
	}
}

/**
 * Writes the file atomically (temp file in the target directory, then rename), preserving the other
 * bindings. Refuses to touch a file it could not read: overwriting an unreadable ladder would silently drop
 * another binding's record, which is a capability loss nobody asked for.
 */
function writeLadder(path: string, bindings: ReadonlyMap<string, unknown>): void {
	const sorted = [...bindings.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	const body = `${JSON.stringify(
		{ schema_version: LADDER_SCHEMA_VERSION, bindings: Object.fromEntries(sorted) },
		null,
		2,
	)}\n`;

	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temp = `${path}.${process.pid}.tmp`;
	try {
		writeFileSync(temp, body, { encoding: "utf8", mode: 0o600 });
		renameSync(temp, path);
	} catch (err) {
		rmSync(temp, { force: true });
		throw err;
	}
}

/** Raises or changes one binding. The caller (the CLI) supplies `by`/`at`; this function never invents them. */
export function writeLadderEntry(path: string, projectId: string, entry: LadderEntry): void {
	assertWritable(entry);
	const read = readLadderFile(path);
	if (read.problem === "unreadable" || read.problem === "malformed") {
		throw new Error(`refusing to write: the existing ladder file is ${read.problem}`);
	}
	const next = new Map(read.bindings);
	next.set(projectId, entry as unknown);
	writeLadder(path, next);
}

/**
 * The kill switch (R6): removes the binding's record so it resolves to `off`/`no_record`. Refuses an
 * unreadable file for the same reason the write does.
 */
export function removeLadderEntry(path: string, projectId: string): void {
	const read = readLadderFile(path);
	if (read.problem === "unreadable" || read.problem === "malformed") {
		throw new Error(`refusing to rewrite: the existing ladder file is ${read.problem}`);
	}
	if (read.problem === "missing") return;
	const next = new Map(read.bindings);
	next.delete(projectId);
	writeLadder(path, next);
}
