import { parse, stringify } from "smol-toml";

import { FileEditRefusal, type FormatAdapter } from "../file-edit.js";

/**
 * The TOML {@link FormatAdapter} (design.md §4.2, the TOML row; D-45).
 *
 * Covers the tool-config matrix's one TOML surface, `.codex/config.toml`. Unlike the JSON/JSONC
 * adapter's localized `modify`+`applyEdits` edit, no TOML library is trusted to edit a document in
 * place (design.md §2.3), so this adapter is **append-only**: it never re-serializes the file's
 * existing bytes, only appends a freshly `stringify`d table built from `entryPath`/`entry` after a
 * trailing newline. Every original byte is therefore a strict prefix of the result.
 *
 * A pre-existing inline table at `entryPath`'s container (e.g. `mcp_servers = { other = {...} }`)
 * parses without error on its own, so this adapter cannot detect the conflict before writing;
 * appending a `[mcp_servers.<name>]` header for an already inline-defined `mcp_servers` makes the
 * combined text a genuine TOML syntax error ("trying to redefine an already defined table"), which
 * `installer/file-edit.ts`'s step 7 readback catches as a `"verification-failed"` refusal and
 * restores the pre-edit backup — the same safety net `formats/jsonc.ts` relies on for its own
 * refusal paths.
 */
export const tomlAdapter: FormatAdapter = {
	parse(text: string): unknown {
		try {
			// `smol-toml`'s objects are `Object.create(null)`-based; `file-edit.ts`'s `isDeepStrictEqual`
			// and `isPlainObject` checks compare against ordinary (`Object.prototype`-based) objects, the
			// shape every other adapter (and `setAtPath`'s own object-literal construction) produces. A
			// JSON round-trip is the simplest way to normalize to that shape; every value this adapter
			// ever sees (strings, arrays, nested tables) survives it losslessly.
			return JSON.parse(JSON.stringify(parse(text))) as unknown;
		} catch (error) {
			throw new FileEditRefusal("parse-error", `invalid TOML: ${describeError(error)}`);
		}
	},

	buildText(text: string, entryPath: readonly string[], entry: unknown): string {
		const suffix = stringify(nestAtPath(entryPath, entry));
		if (text.length === 0) {
			return suffix;
		}
		return text.endsWith("\n") ? `${text}${suffix}` : `${text}\n${suffix}`;
	},
};

/** Builds `{ [entryPath[0]]: { [entryPath[1]]: ... entry } }`, the shape `smol-toml`'s `stringify` turns into one appended table. */
function nestAtPath(entryPath: readonly string[], entry: unknown): Record<string, unknown> {
	const root: Record<string, unknown> = {};
	let node = root;
	for (let i = 0; i < entryPath.length - 1; i++) {
		const child: Record<string, unknown> = {};
		node[entryPath[i]] = child;
		node = child;
	}
	node[entryPath[entryPath.length - 1]] = entry;
	return root;
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
