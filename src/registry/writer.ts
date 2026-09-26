import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";

import { parseRegistryText } from "./loader.js";
import type { Registry, RegistryParseResult, RegistryProblem } from "./schema.js";

/**
 * Bounded retries for a Windows rename-over of `registry.json` (design.md:77, `installer/
 * constants.ts`'s `REGISTRY_REPLACE_ATTEMPTS`, same value and reasoning).
 *
 * Deliberately **not** imported from `installer/constants.ts`: design §2.2's compile-unit table has
 * `installer` depend on `registry`, never the reverse, and `src/registry/tsconfig.json` only
 * references `shared` — `installer/registry-commit.ts` (PR-07) will need to import from `registry`,
 * which would make an `installer` import here a real circular project reference. Kept as a disclosed
 * duplication, the same way `installer/token-ref.ts` (PR-07) discloses duplicating `migration/
 * main.ts`'s private mirror rather than editing a merged file across a compile-unit boundary;
 * convergence is a backlog row, not a drive-by edit.
 */
export const REGISTRY_REPLACE_ATTEMPTS = 3;

/**
 * The registry write path (design.md §5, §15 D-41; registry-authoring spec "Registry writes are
 * validate-before-replace").
 *
 * Pure of the ledger: this module never opens `node:sqlite` and never appends an audit row —
 * `installer/registry-commit.ts` (PR-07) owns the R6 audit row and the `BEGIN IMMEDIATE` transaction
 * that wraps the rename this module performs. Every write is validated against the exact bytes about
 * to land on disk, through the same {@link parseRegistryText} the daemon's loader uses to read the
 * file back (R5, schema, R1-R3), so a change that fails validation never reaches the file system: the
 * on-disk file is left byte-identical to whatever it held before the call.
 */

/** Indent width `serializeRegistry` uses to reserialize a registry (design §5: "2-space JSON"). */
const REGISTRY_SERIALIZE_INDENT = 2;

/** Serializes a validated {@link Registry} document to its on-disk text (design §5). */
export function serializeRegistry(registry: Registry): string {
	return JSON.stringify(registry, null, REGISTRY_SERIALIZE_INDENT);
}

/**
 * Validates registry bytes exactly as the daemon's loader would read them back: R5's raw-text scan,
 * the JSON parse, the strict schema, and R1-R3 ({@link parseRegistryText}).
 *
 * A thin wrapper by design (tasks.md PR-06 6.2): the writer must refuse anything the loader would
 * refuse on the next load, and a second validation path here would risk drifting from the one the
 * daemon actually runs.
 */
export function validateRegistryBytes(text: string): RegistryParseResult {
	return parseRegistryText(text);
}

/**
 * The file operations {@link replaceRegistryFile} needs, as an injectable seam — the same pattern
 * `registry/loader.ts`'s `RegistryFileIo` already uses in this module family. The default
 * implementation writes a temp sibling and renames it over the target; a test injects a `rename`
 * that fails a bounded number of times to pin the `REGISTRY_REPLACE_ATTEMPTS` retry-then-refuse
 * behavior without needing a genuine concurrent-reader race on the real file system.
 */
export interface RegistryReplaceIo {
	writeTemp(tempPath: string, text: string): void;
	rename(tempPath: string, path: string): void;
	removeTemp(tempPath: string): void;
}

const NODE_REPLACE_IO: RegistryReplaceIo = {
	writeTemp(tempPath, text) {
		writeFileSync(tempPath, text, "utf8");
	},
	rename(tempPath, path) {
		renameSync(tempPath, path);
	},
	removeTemp(tempPath) {
		rmSync(tempPath, { force: true });
	},
};

/** What {@link replaceRegistryFile} decided. */
export type ReplaceRegistryFileOutcome =
	| { readonly outcome: "replaced" }
	| { readonly outcome: "invalid"; readonly problems: readonly RegistryProblem[] }
	| { readonly outcome: "replace-failed"; readonly error: unknown };

export interface ReplaceRegistryFileOptions {
	/** Absolute path of `registry.json` (or a test fixture standing in for it). */
	readonly path: string;
	/** The full resulting document (design §5: computed in memory by the caller). */
	readonly registry: Registry;
	/** Overridable for tests; defaults to real `node:fs` temp-write-then-rename. */
	readonly io?: RegistryReplaceIo;
}

/**
 * Validates the exact bytes `registry` would serialize to, and only on success atomically replaces
 * `path` with them (temp file + rename, design §4.1 step 6).
 *
 * A validation failure makes no file-system call at all: `path` is left exactly as it was before
 * this call. A rename failure (Windows can transiently refuse a rename-over while the daemon holds
 * the target open for reading) is retried up to {@link REGISTRY_REPLACE_ATTEMPTS} times before this
 * function gives up; every attempt targets the same original path and never succeeds partially, so a
 * target this function never renamed onto is, by construction, still the file it was before the
 * call — there is no separate backup file to restore here, unlike `installer/file-edit.ts`'s pipeline
 * (registry writes have no such concept; refusing simply means never renaming over the original).
 */
export function replaceRegistryFile(options: ReplaceRegistryFileOptions): ReplaceRegistryFileOutcome {
	const { path, registry } = options;
	const io = options.io ?? NODE_REPLACE_IO;

	const text = serializeRegistry(registry);
	const validated = validateRegistryBytes(text);
	if (!validated.ok) {
		return { outcome: "invalid", problems: validated.problems };
	}

	const tempPath = `${path}.tmp-${randomUUID()}`;
	try {
		io.writeTemp(tempPath, text);
	} catch (error) {
		// Never let a foreseeable I/O failure (disk full, permission denied) escape as a raw throw:
		// every other failure path here returns a typed outcome, and callers rely on that uniformly.
		io.removeTemp(tempPath);
		return { outcome: "replace-failed", error };
	}

	let lastError: unknown;
	for (let attempt = 0; attempt < REGISTRY_REPLACE_ATTEMPTS; attempt++) {
		try {
			io.rename(tempPath, path);
			return { outcome: "replaced" };
		} catch (error) {
			lastError = error;
		}
	}
	io.removeTemp(tempPath);
	return { outcome: "replace-failed", error: lastError };
}
