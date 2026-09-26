import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { PROJECT_FILE_SCHEMA_VERSION } from "./constants.js";
import { parseProjectFile, type ProjectFile, type ProjectRosterEntry } from "./project-file.js";

/**
 * The `conmuta.json` write path (design.md §2.1, §8.2; registry-authoring spec "conmuta.json writer
 * writes identifiers only, write-if-absent or verify").
 *
 * Reuses {@link parseProjectFile} for every read: this module never invents a second notion of what a
 * valid project file is. It has no atomic-rename retry concept the way `registry/writer.ts` does —
 * unlike `registry.json`, nothing in this codebase hot-reloads `conmuta.json` under a concurrent
 * writer, so a direct write is enough (design §16 names the registry rename race specifically; this
 * file carries no equivalent risk).
 */

/** The four identifier fields `project bind` intends to commit — no `referee`, per the spec's "identifiers only" rule. */
export interface IntendedProjectBinding {
	readonly project_id: string;
	readonly group_id: number;
	readonly roster: readonly ProjectRosterEntry[];
}

/** Serializes the intended binding as an identifiers-only `conmuta.json` (schema §"conmuta.json writer"). */
export function serializeProjectFile(intended: IntendedProjectBinding): string {
	const file: ProjectFile = {
		schema_version: PROJECT_FILE_SCHEMA_VERSION,
		project_id: intended.project_id,
		group_id: intended.group_id,
		roster: intended.roster,
	};
	return JSON.stringify(file, null, PROJECT_FILE_SERIALIZE_INDENT);
}

/** Indent width `serializeProjectFile` writes with (matches the loader's own 2-space convention). */
const PROJECT_FILE_SERIALIZE_INDENT = 2;

/** One field name `verifyProjectFileMatches` may report as disagreeing, or the parse-failure sentinel. */
export type ProjectFileDisagreement = "project_id" | "group_id" | "roster" | "unparseable";

/** Whether an existing `conmuta.json` text agrees with an intended binding. */
export type ProjectFileMatchResult =
	| { readonly matches: true }
	| { readonly matches: false; readonly disagreements: readonly ProjectFileDisagreement[] };

/** A roster copy sorted by `agent_id`, so two rosters naming the same members in a different order still match. */
function sortRoster(roster: readonly ProjectRosterEntry[]): readonly ProjectRosterEntry[] {
	return [...roster].sort((left, right) => (left.agent_id < right.agent_id ? -1 : left.agent_id > right.agent_id ? 1 : 0));
}

/**
 * Compares an existing `conmuta.json`'s text against an intended binding.
 *
 * An existing file that fails to parse at all is reported as the single `"unparseable"` disagreement
 * rather than crashing the wizard: `project bind` must refuse and name the problem, never guess at
 * overwriting a file it cannot read back.
 */
export function verifyProjectFileMatches(existingText: string, intended: IntendedProjectBinding): ProjectFileMatchResult {
	const parsed = parseProjectFile(existingText);
	if (!parsed.ok) {
		return { matches: false, disagreements: ["unparseable"] };
	}

	const disagreements: ProjectFileDisagreement[] = [];
	if (parsed.file.project_id !== intended.project_id) {
		disagreements.push("project_id");
	}
	if (parsed.file.group_id !== intended.group_id) {
		disagreements.push("group_id");
	}
	if (!isDeepStrictEqual(sortRoster(parsed.file.roster), sortRoster(intended.roster))) {
		disagreements.push("roster");
	}
	return disagreements.length === 0 ? { matches: true } : { matches: false, disagreements };
}

/** What {@link writeProjectFile} decided. */
export type WriteProjectFileOutcome =
	| { readonly outcome: "written" }
	| { readonly outcome: "already-correct" }
	| { readonly outcome: "refused"; readonly disagreements: readonly ProjectFileDisagreement[] };

export interface WriteProjectFileOptions {
	/** Absolute path of the target project's `conmuta.json`. */
	readonly path: string;
	/** The binding `project bind` intends to commit. */
	readonly intended: IntendedProjectBinding;
	/** Overridable for tests; defaults to real `node:fs`. */
	readonly io?: ProjectFileWriteIo;
}

/** The file operations {@link writeProjectFile} needs, as an injectable seam. */
export interface ProjectFileWriteIo {
	/** Creates `path` exclusively with `text`; returns `false` without writing if it already exists. */
	writeIfAbsent(path: string, text: string): boolean;
	read(path: string): string;
}

function isEexist(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "EEXIST";
}

const NODE_PROJECT_FILE_IO: ProjectFileWriteIo = {
	writeIfAbsent(path, text) {
		// The exclusive "wx" flag makes the existence check and the write one atomic filesystem
		// operation: a file created by another process between a separate exists()-then-write() pair
		// would otherwise be silently overwritten, breaking the "never overwrite a disagreement"
		// guarantee this module exists to provide.
		try {
			writeFileSync(path, text, { encoding: "utf8", flag: "wx" });
			return true;
		} catch (error) {
			if (isEexist(error)) {
				return false;
			}
			throw error;
		}
	},
	read(path) {
		return readFileSync(path, "utf8");
	},
};

/**
 * Writes an absent `conmuta.json` as identifiers-only, or verifies an existing one against the
 * intended binding without ever overwriting a disagreement (registry-authoring spec, all three
 * scenarios).
 */
export function writeProjectFile(options: WriteProjectFileOptions): WriteProjectFileOutcome {
	const { path, intended } = options;
	const io = options.io ?? NODE_PROJECT_FILE_IO;

	if (io.writeIfAbsent(path, serializeProjectFile(intended))) {
		return { outcome: "written" };
	}

	const match = verifyProjectFileMatches(io.read(path), intended);
	if (match.matches) {
		return { outcome: "already-correct" };
	}
	return { outcome: "refused", disagreements: match.disagreements };
}
