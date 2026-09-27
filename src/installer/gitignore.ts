import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * D-52 close-out: keeps a written tool-config path out of the project's git index
 * (`installer/gitignore.ts`, design.md §16 risk table "Absolute paths in project configs are
 * machine-specific"; tasks.md PR-21).
 *
 * A written tool-config entry (`.mcp.json`, `.cursor/mcp.json`, ...) embeds this machine's own
 * absolute node/script launcher path (§7.1); committed as-is, it breaks for a teammate on a
 * different machine or Node install. This module is a **plain text line operation**, not a
 * structured-document edit: `.gitignore` is a list of lines, not an entry-at-path document, so it
 * deliberately does not go through `file-edit.ts`'s `editFile`/`FormatAdapter` pipeline — routing it
 * through that pipeline would be a category error.
 *
 * `relativePath` arguments are always POSIX-slash-shaped, exactly as `tool-targets.ts`'s own
 * `relativePath` field carries them (e.g. `.cursor/mcp.json`); they are never passed through
 * `node:path` utilities here, which would introduce backslashes on Windows and break the comparison
 * against `.gitignore`'s own forward-slash convention.
 */

/** Name of the file this module reads and appends to, directly under a project directory. */
export const GITIGNORE_FILE_NAME = ".gitignore";

/** What {@link ensureGitignored} decided. */
export interface GitignoreCheckResult {
	/** Whether `relativePath` was already covered by an existing `.gitignore` entry. */
	readonly alreadyCovered: boolean;
	/** The entry appended, when one was (absent when `alreadyCovered` is `true`). */
	readonly appendedLine?: string;
}

/** Strips a line's own leading `/` and trailing `/` so it compares against a segment/segment-prefix. */
function normalizeGitignoreLine(line: string): string {
	let normalized = line;
	if (normalized.startsWith("/")) {
		normalized = normalized.slice(1);
	}
	if (normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

/**
 * Whether `gitignoreText` already covers `relativePath`, per real git semantics: an exact-path entry,
 * or a bare parent-directory entry anywhere above it in the path (a directory-name line covers its
 * whole subtree). Blank, comment (`#`) and negated (`!`) lines are never coverage.
 *
 * Exported standalone (not only via {@link ensureGitignored}) so `doctor/checks/registry.ts` can reuse
 * the exact same matching logic for its own gitignore-coverage warning, without invoking this module's
 * file-appending side effect.
 */
export function isGitignoreCovered(gitignoreText: string, relativePath: string): boolean {
	const segments = relativePath.split("/");
	const coveringPrefixes = segments.map((_segment, index) => segments.slice(0, index + 1).join("/"));

	for (const rawLine of gitignoreText.split("\n")) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#") || line.startsWith("!")) {
			continue;
		}
		if (coveringPrefixes.includes(normalizeGitignoreLine(line))) {
			return true;
		}
	}
	return false;
}

/**
 * Ensures `<projectDir>/.gitignore` covers `relativePath`, appending an anchored entry when it does
 * not (creating the file when absent).
 *
 * The appended entry is always `/${relativePath}` — a leading slash anchors it to the project root,
 * the safest, most precise form (Alpha's own review note in the Arena debate this design went
 * through: an unanchored entry could also match a same-named file nested somewhere unrelated deeper
 * in the tree). When the existing file has content that does not already end in a newline, a newline
 * is inserted before the new entry so it never concatenates onto the end of the last existing line
 * (the exact edge case Alpha's design review flagged).
 */
export function ensureGitignored(projectDir: string, relativePath: string): GitignoreCheckResult {
	const gitignorePath = join(projectDir, GITIGNORE_FILE_NAME);
	const currentText = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";

	if (isGitignoreCovered(currentText, relativePath)) {
		return { alreadyCovered: true };
	}

	const appendedLine = `/${relativePath}`;
	const needsLeadingNewline = currentText.length > 0 && !currentText.endsWith("\n");
	const nextText = `${currentText}${needsLeadingNewline ? "\n" : ""}${appendedLine}\n`;
	writeFileSync(gitignorePath, nextText, "utf8");
	return { alreadyCovered: false, appendedLine };
}
