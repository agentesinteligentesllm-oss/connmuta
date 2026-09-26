import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { tomlAdapter } from "../../../src/installer/formats/toml.js";
import { editFile, FileEditRefusal } from "../../../src/installer/file-edit.js";
import { MCP_SERVER_NAME } from "../../../src/installer/constants.js";

/** `installer/formats/toml.ts` (design.md §4.2 TOML row, tasks.md PR-03 sub-task 3.1). */

const ENTRY_PATH = ["mcp_servers", MCP_SERVER_NAME] as const;

function withTempDir(body: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-toml-"));
	try {
		body(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("parses a TOML document with tables and nested values", () => {
	const text = ['title = "example"', "", "[mcp_servers.other]", 'command = "node"'].join("\n");

	const value = tomlAdapter.parse(text) as Record<string, unknown>;

	assert.deepEqual(value, { title: "example", mcp_servers: { other: { command: "node" } } });
});

test("a syntax error refuses citing the failure, and no write is attempted through editFile", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.toml");
		const original = 'title = "example"\n[mcp_servers.broken\n';
		writeFileSync(target, original, "utf8");

		assert.throws(
			() => tomlAdapter.parse(original),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "parse-error",
		);
		assert.throws(
			() => editFile({ path: target, adapter: tomlAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } }),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "parse-error",
		);
		assert.equal(readFileSync(target, "utf8"), original, "a refused parse must leave the file untouched");
	});
});

test("an absent file is created holding exactly the stringified entry table", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.toml");
		const entry = { command: "node", args: ["x"] };

		const outcome = editFile({ path: target, adapter: tomlAdapter, entryPath: ENTRY_PATH, entry });

		assert.equal(outcome, "created");
		const written = readFileSync(target, "utf8");
		assert.ok(written.includes(`[mcp_servers.${MCP_SERVER_NAME}]`));
		const parsed = tomlAdapter.parse(written) as { mcp_servers: Record<string, unknown> };
		assert.deepEqual(parsed.mcp_servers[MCP_SERVER_NAME], entry);
	});
});

test("appending to a present file is a pure append: every original byte is an unmodified prefix of the result", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.toml");
		const original = ['title = "example"', "", "[tool.other]", "key = 1", ""].join("\n");
		writeFileSync(target, original, "utf8");

		const outcome = editFile({ path: target, adapter: tomlAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } });

		assert.equal(outcome, "written");
		const written = readFileSync(target, "utf8");
		assert.equal(written.slice(0, original.length), original, "expected every original byte to be an unmodified prefix");
		assert.ok(written.length > original.length, "expected the append to add new bytes after the original content");

		const parsed = tomlAdapter.parse(written) as {
			title: string;
			tool: { other: { key: number } };
			mcp_servers: Record<string, unknown>;
		};
		assert.equal(parsed.title, "example");
		assert.deepEqual(parsed.tool.other, { key: 1 });
		assert.deepEqual(parsed.mcp_servers[MCP_SERVER_NAME], { command: "node" });
	});
});

test("an inline pre-existing mcp_servers table makes the append a re-parse mismatch, refused and restored", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.toml");
		// `mcp_servers` is already closed as an inline table here (containing an unrelated "other"
		// entry, not our own MCP_SERVER_NAME key): TOML disallows any later `[mcp_servers.*]` header
		// against an inline-defined table, for any subkey, so the append below cannot be detected as a
		// conflict up front (readEntryAtPath finds no existing "conmuta" key) and instead fails on
		// re-parse.
		const original = 'mcp_servers = { other = { command = "node" } }\n';
		writeFileSync(target, original, "utf8");

		assert.throws(
			() => editFile({ path: target, adapter: tomlAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } }),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "verification-failed",
		);
		assert.equal(readFileSync(target, "utf8"), original, "a failed verification must restore the original content");
	});
});

test("a conflicting dotted key already at the exact entry path refuses before any write (step 4)", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.toml");
		// A dotted key at exactly `mcp_servers.<MCP_SERVER_NAME>` already parses to a value at our
		// entryPath, so `editFile`'s own same-named-entry check (step 4, generic across every format)
		// refuses this one before `buildText` ever runs — the same mechanism `file-edit.test.ts` and
		// `formats/jsonc.test.ts` already pin for JSON. Unlike the inline-table case above, this shape
		// never reaches the TOML-specific re-parse safety net because the conflicting key is caught by
		// name first.
		const original = `mcp_servers.${MCP_SERVER_NAME}.command = "old"\n`;
		writeFileSync(target, original, "utf8");

		assert.throws(
			() => editFile({ path: target, adapter: tomlAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } }),
			(error: unknown) =>
				error instanceof FileEditRefusal &&
				error.reason === "conflict" &&
				error.message.includes("old") &&
				error.message.includes("node"),
		);
		assert.equal(readFileSync(target, "utf8"), original, "a step-4 conflict must leave the file untouched");
	});
});
