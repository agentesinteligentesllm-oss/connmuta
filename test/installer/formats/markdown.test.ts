import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentsMdAdapter, claudeMdAdapter, CLAUDE_MD_IMPORT_LINE, MARKDOWN_ENTRY_PATH } from "../../../src/installer/formats/markdown.js";
import { editFile, FileEditRefusal } from "../../../src/installer/file-edit.js";
import { AGENTS_MD_MAX_LINES } from "../../../src/installer/constants.js";
import { PRODUCT_NAME } from "../../../src/shared/constants.js";

/** `installer/formats/markdown.ts` (design.md §4.2 Markdown row, tasks.md PR-03 sub-task 3.3). */

const BLOCK_BEGIN_MARKER = `<!-- ${PRODUCT_NAME}:begin -->`;
const BLOCK_END_MARKER = `<!-- ${PRODUCT_NAME}:end -->`;

function withTempDir(body: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-markdown-"));
	try {
		body(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("AGENTS.md absent writes a marker-delimited template at or under AGENTS_MD_MAX_LINES lines", () => {
	withTempDir((dir) => {
		const target = join(dir, "AGENTS.md");
		const templateBody = Array.from({ length: 20 }, (_, i) => `Line ${i + 1} of the bus protocol instructions.`).join("\n");

		const outcome = editFile({ path: target, adapter: agentsMdAdapter, entryPath: MARKDOWN_ENTRY_PATH, entry: templateBody });

		assert.equal(outcome, "created");
		const written = readFileSync(target, "utf8");
		assert.ok(written.startsWith(`${BLOCK_BEGIN_MARKER}\n`));
		assert.ok(written.includes(BLOCK_END_MARKER));
		const lineCount = written.split("\n").length;
		assert.ok(lineCount <= AGENTS_MD_MAX_LINES, `expected at most ${AGENTS_MD_MAX_LINES} lines, got ${lineCount}`);
	});
});

test("AGENTS.md present appends the marker-delimited block after the existing content", () => {
	withTempDir((dir) => {
		const target = join(dir, "AGENTS.md");
		const original = "# Project notes\n\nSomething the user already wrote.\n";
		writeFileSync(target, original, "utf8");

		const outcome = editFile({ path: target, adapter: agentsMdAdapter, entryPath: MARKDOWN_ENTRY_PATH, entry: "bus protocol text" });

		assert.equal(outcome, "written");
		const written = readFileSync(target, "utf8");
		assert.equal(written.slice(0, original.length), original, "expected every original byte to be an unmodified prefix");
		assert.ok(written.includes(`${BLOCK_BEGIN_MARKER}\nbus protocol text\n${BLOCK_END_MARKER}`));
	});
});

test("an identical already-present AGENTS.md block is a no-op", () => {
	withTempDir((dir) => {
		const target = join(dir, "AGENTS.md");
		const original = `# Notes\n\n${BLOCK_BEGIN_MARKER}\nbus protocol text\n${BLOCK_END_MARKER}\n`;
		writeFileSync(target, original, "utf8");

		const outcome = editFile({ path: target, adapter: agentsMdAdapter, entryPath: MARKDOWN_ENTRY_PATH, entry: "bus protocol text" });

		assert.equal(outcome, "noop");
		assert.equal(readFileSync(target, "utf8"), original);
	});
});

test("a different AGENTS.md block at the marker refuses with a diff and writes nothing", () => {
	withTempDir((dir) => {
		const target = join(dir, "AGENTS.md");
		const original = `${BLOCK_BEGIN_MARKER}\nold protocol text\n${BLOCK_END_MARKER}\n`;
		writeFileSync(target, original, "utf8");

		assert.throws(
			() => editFile({ path: target, adapter: agentsMdAdapter, entryPath: MARKDOWN_ENTRY_PATH, entry: "new protocol text" }),
			(error: unknown) =>
				error instanceof FileEditRefusal &&
				error.reason === "conflict" &&
				error.message.includes("old protocol text") &&
				error.message.includes("new protocol text"),
		);
		assert.equal(readFileSync(target, "utf8"), original, "a refused conflict must leave the file untouched");
	});
});

test("CLAUDE.md absent is written with just the @AGENTS.md import line", () => {
	withTempDir((dir) => {
		const target = join(dir, "CLAUDE.md");

		const outcome = editFile({
			path: target,
			adapter: claudeMdAdapter,
			entryPath: MARKDOWN_ENTRY_PATH,
			entry: CLAUDE_MD_IMPORT_LINE,
		});

		assert.equal(outcome, "created");
		assert.equal(readFileSync(target, "utf8"), `${CLAUDE_MD_IMPORT_LINE}\n`);
	});
});

test("CLAUDE.md present but missing the import line has it appended", () => {
	withTempDir((dir) => {
		const target = join(dir, "CLAUDE.md");
		const original = "# Project instructions\n\nSome pre-existing content.\n";
		writeFileSync(target, original, "utf8");

		const outcome = editFile({
			path: target,
			adapter: claudeMdAdapter,
			entryPath: MARKDOWN_ENTRY_PATH,
			entry: CLAUDE_MD_IMPORT_LINE,
		});

		assert.equal(outcome, "written");
		const written = readFileSync(target, "utf8");
		assert.equal(written.slice(0, original.length), original, "expected every original byte to be an unmodified prefix");
		assert.ok(written.endsWith(`${CLAUDE_MD_IMPORT_LINE}\n`));
	});
});

test("CLAUDE.md already carrying the import line is a no-op", () => {
	withTempDir((dir) => {
		const target = join(dir, "CLAUDE.md");
		const original = `# Project instructions\n\n${CLAUDE_MD_IMPORT_LINE}\n`;
		writeFileSync(target, original, "utf8");

		const outcome = editFile({
			path: target,
			adapter: claudeMdAdapter,
			entryPath: MARKDOWN_ENTRY_PATH,
			entry: CLAUDE_MD_IMPORT_LINE,
		});

		assert.equal(outcome, "noop");
		assert.equal(readFileSync(target, "utf8"), original);
	});
});
