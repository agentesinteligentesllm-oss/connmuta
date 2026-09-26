import { PRODUCT_NAME } from "../../shared/constants.js";
import { type FormatAdapter } from "../file-edit.js";

/**
 * The Markdown {@link FormatAdapter}s (design.md §4.2, the Markdown row).
 *
 * Cover the tool-config matrix's two Markdown surfaces, `AGENTS.md` and `CLAUDE.md`. Neither file has
 * a real grammar to strictly parse, so `parse` here never throws: it only extracts whatever this
 * product's own entry already looks like, so `installer/file-edit.ts`'s generic same-named-entry
 * check (step 4) can still decide no-op vs. refuse-and-diff exactly like the JSON/TOML adapters.
 * Both adapters manage exactly one document-level entry, so every call site uses the same
 * single-segment {@link MARKDOWN_ENTRY_PATH}.
 *
 * `AGENTS.md`: absent ⇒ the entry becomes the whole file, wrapped once in
 * `<!-- conmuta:begin -->`/`<!-- conmuta:end -->` markers; present ⇒ the marked block is appended
 * after the existing content (append-only, D-36). `CLAUDE.md`: a single-line document containing
 * only {@link CLAUDE_MD_IMPORT_LINE}; absent ⇒ that line becomes the whole file; present without the
 * line ⇒ the line is appended.
 */

/** The one entry every adapter in this file manages; there is no second named entry in either file. */
export const MARKDOWN_ENTRY_PATH = [PRODUCT_NAME] as const;

/** The only line `CLAUDE.md`'s adapter ever installs or looks for (installer-wizard spec: "contains only `@AGENTS.md`"). */
export const CLAUDE_MD_IMPORT_LINE = "@AGENTS.md";

const BLOCK_BEGIN_MARKER = `<!-- ${PRODUCT_NAME}:begin -->`;
const BLOCK_END_MARKER = `<!-- ${PRODUCT_NAME}:end -->`;
// \r?\n tolerates a CRLF file (e.g. a Windows checkout with core.autocrlf) — a bare \n here would
// never match such a file, making parse() report no block present and duplicate it on every re-run.
const BLOCK_PATTERN = new RegExp(`${BLOCK_BEGIN_MARKER}\\r?\\n([\\s\\S]*?)\\r?\\n${BLOCK_END_MARKER}`);

export const agentsMdAdapter: FormatAdapter = {
	parse(text: string): unknown {
		const match = BLOCK_PATTERN.exec(text);
		// Normalized to \n regardless of the file's own line endings, so the identity check against
		// `entry` (always \n-only) is not defeated by CRLF alone.
		return match === null ? {} : { [PRODUCT_NAME]: match[1].replace(/\r\n/g, "\n") };
	},

	buildText(text: string, _entryPath: readonly string[], entry: unknown): string {
		const block = `${BLOCK_BEGIN_MARKER}\n${String(entry)}\n${BLOCK_END_MARKER}\n`;
		return appendAfter(text, block);
	},
};

export const claudeMdAdapter: FormatAdapter = {
	parse(text: string): unknown {
		const hasImportLine = text.split(/\r?\n/).some((line) => line.trim() === CLAUDE_MD_IMPORT_LINE);
		return hasImportLine ? { [PRODUCT_NAME]: CLAUDE_MD_IMPORT_LINE } : {};
	},

	buildText(text: string, _entryPath: readonly string[], entry: unknown): string {
		return appendAfter(text, `${String(entry)}\n`);
	},
};

/** Appends `addition` after `text`, ensuring exactly one newline separates pre-existing content from it. */
function appendAfter(text: string, addition: string): string {
	if (text.length === 0) {
		return addition;
	}
	return text.endsWith("\n") ? `${text}${addition}` : `${text}\n${addition}`;
}
