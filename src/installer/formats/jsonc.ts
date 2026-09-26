import { applyEdits, modify, parse, printParseErrorCode, type FormattingOptions, type ParseError } from "jsonc-parser";

import { JSON_DEFAULT_INDENT } from "../constants.js";
import { describeValueType, FileEditRefusal, type FormatAdapter } from "../file-edit.js";

/**
 * The JSON/JSONC {@link FormatAdapter} (design.md §4.2, the JSON/JSONC row).
 *
 * Covers every one of the tool-config matrix's 7 JSON/JSONC surfaces (`.mcp.json`,
 * `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`, `.agents/mcp_config.json`,
 * `.pi/mcp.json`, `opencode.json`) plus the registry/project file, wired into
 * `installer/file-edit.ts`'s per-format dispatch.
 *
 * `modify` + `applyEdits` compute and apply a single localized text edit (D-36): comments, trailing
 * commas, key order, and formatting everywhere outside the touched range survive untouched. EOL and
 * indent width are learned from the file itself rather than fixed, so an edit blends in with
 * whatever style the file (or the tool that created it) already uses.
 */
export const jsoncAdapter: FormatAdapter = {
	parse(text: string): unknown {
		const errors: ParseError[] = [];
		const value = parse(text, errors, { allowTrailingComma: true });
		if (errors.length > 0) {
			const [first] = errors;
			const { line, column } = locate(text, first.offset);
			throw new FileEditRefusal(
				"parse-error",
				`invalid JSON/JSONC at line ${line}, column ${column}: ${printParseErrorCode(first.error)}`,
			);
		}
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			throw new FileEditRefusal("parse-error", `expected a JSON object at the document root, got ${describeValueType(value)}`);
		}
		return value;
	},

	buildText(text: string, entryPath: readonly string[], entry: unknown): string {
		const formattingOptions = learnFormattingOptions(text);
		const edits = modify(text, [...entryPath], entry, { formattingOptions });
		return applyEdits(text, edits);
	},
};

/** Converts a zero-based character offset into a 1-based line/column pair for a refusal message. */
function locate(text: string, offset: number): { line: number; column: number } {
	const upToOffset = text.slice(0, offset);
	const lines = upToOffset.split("\n");
	return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/**
 * Learns EOL style and indent width from `text` (design.md §4.2).
 *
 * EOL is `\r\n` when the text already contains one, `\n` otherwise. Indent width and character are
 * learned from the first already-indented line; {@link JSON_DEFAULT_INDENT} is used only when the
 * file (or an absent file's empty starting text) has no indented line to learn from.
 */
function learnFormattingOptions(text: string): FormattingOptions {
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	for (const line of text.split(/\r\n|\n/)) {
		const match = /^(\t+|[ ]+)\S/.exec(line);
		if (match === null) {
			continue;
		}
		const indent = match[1];
		if (indent.startsWith("\t")) {
			return { insertSpaces: false, tabSize: JSON_DEFAULT_INDENT, eol };
		}
		return { insertSpaces: true, tabSize: indent.length, eol };
	}
	return { insertSpaces: true, tabSize: JSON_DEFAULT_INDENT, eol };
}
