import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { jsoncAdapter } from "../../../src/installer/formats/jsonc.js";
import { editFile, FileEditRefusal } from "../../../src/installer/file-edit.js";
import { JSON_DEFAULT_INDENT } from "../../../src/installer/constants.js";

/** `installer/formats/jsonc.ts` (design.md §4.2 JSON/JSONC row, tasks.md PR-02 sub-task 2.3). */

const ENTRY_PATH = ["mcpServers", "conmuta"] as const;

function withTempDir(body: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-jsonc-"));
	try {
		body(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function commonPrefixLength(a: string, b: string): number {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) {
		i++;
	}
	return i;
}

function commonSuffixLength(a: string, b: string): number {
	let i = 0;
	while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) {
		i++;
	}
	return i;
}

test("parses JSONC with line comments, block comments, and trailing commas cleanly", () => {
	const text = ["{", "  // leading comment", '  "other": 1, /* block */', '  "mcpServers": {},', "}"].join("\n");

	const value = jsoncAdapter.parse(text) as Record<string, unknown>;

	assert.deepEqual(value, { other: 1, mcpServers: {} });
});

test("refuses a non-object document root", () => {
	assert.throws(
		() => jsoncAdapter.parse("[1, 2, 3]"),
		(error: unknown) => error instanceof FileEditRefusal && error.reason === "parse-error",
	);
});

test("a syntax error refuses citing the line and column, and no write is attempted through editFile", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		const original = '{\n  "mcpServers": { "conmuta": }\n}';
		writeFileSync(target, original, "utf8");

		assert.throws(
			() => jsoncAdapter.parse(original),
			(error: unknown) =>
				error instanceof FileEditRefusal && error.reason === "parse-error" && /line \d+, column \d+/.test(error.message),
		);

		assert.throws(
			() => editFile({ path: target, adapter: jsoncAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } }),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "parse-error",
		);
		assert.equal(readFileSync(target, "utf8"), original, "a refused parse must leave the file untouched");
	});
});

test("buildText produces exactly one localized insertion, preserving bytes outside it", () => {
	const original = ["{", "  // keep me", '  "other": 1,', '  "mcpServers": {', '    "foo": { "command": "bar" }', "  }", "}"].join(
		"\n",
	);

	const result = jsoncAdapter.buildText(original, ENTRY_PATH, { command: "node" });

	assert.ok(result.includes("// keep me"), "the pre-existing comment must survive");
	assert.ok(result.includes('"other": 1'), "the unrelated pre-existing key must survive");
	assert.ok(result.includes('"foo": {') && result.includes('"command": "bar"'), "the pre-existing entry must survive");

	const prefixLength = commonPrefixLength(original, result);
	const suffixLength = commonSuffixLength(original, result);
	assert.ok(prefixLength + suffixLength < original.length, "expected a strictly interior edit, not a full rewrite");
	assert.ok(
		prefixLength >= original.indexOf('"foo"'),
		"expected every byte up to and including the pre-existing entry to survive verbatim",
	);

	const parsed = jsoncAdapter.parse(result) as { mcpServers: { foo: unknown; conmuta: unknown } };
	assert.deepEqual(parsed.mcpServers.foo, { command: "bar" });
	assert.deepEqual(parsed.mcpServers.conmuta, { command: "node" });
});

test("learns \\r\\n end-of-line style from a file that already uses it", () => {
	const original = '{\r\n  "mcpServers": {}\r\n}';

	const result = jsoncAdapter.buildText(original, ENTRY_PATH, { command: "node" });

	assert.equal(result.replace(/\r\n/g, "").includes("\n"), false, "expected no bare LF once every CRLF is stripped");
	assert.ok(result.includes('"conmuta"'));
});

test("learns tab indentation from a file that already uses tabs", () => {
	const original = '{\n\t"mcpServers": {}\n}';

	const result = jsoncAdapter.buildText(original, ENTRY_PATH, { command: "node" });
	const insertedLine = result.split("\n").find((line) => line.includes('"conmuta"'));

	assert.ok(insertedLine !== undefined);
	assert.ok(insertedLine?.startsWith("\t\t"), `expected a two-tab-indented line, got: ${JSON.stringify(insertedLine)}`);
});

test("falls back to JSON_DEFAULT_INDENT only when the file has no indented line to learn from", () => {
	const original = '{"mcpServers":{}}';

	const result = jsoncAdapter.buildText(original, ENTRY_PATH, { command: "node" });
	const insertedLine = result.split("\n").find((line) => line.includes('"conmuta"'));

	assert.ok(insertedLine !== undefined);
	const leadingSpaces = /^ */.exec(insertedLine ?? "")?.[0].length ?? -1;
	assert.equal(leadingSpaces, JSON_DEFAULT_INDENT * 2, "expected two nesting levels of the default indent width");
});
