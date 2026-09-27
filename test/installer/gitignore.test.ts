import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureGitignored, isGitignoreCovered } from "../../src/installer/gitignore.js";

/**
 * `installer/gitignore.ts` (design.md D-52; tasks.md PR-21). A real `mkdtempSync` scratch directory
 * per scenario, mirroring this project's own no-fixture-faking convention for installer
 * file-mutation tests (`test/installer/file-edit.test.ts`'s own harness).
 */

function withTempProjectDir(run: (projectDir: string) => void): void {
	const projectDir = mkdtempSync(join(tmpdir(), "conmuta-gitignore-"));
	try {
		run(projectDir);
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
}

test("a fresh directory with no .gitignore gets a new one anchoring a nested path", () => {
	withTempProjectDir((projectDir) => {
		const result = ensureGitignored(projectDir, ".cursor/mcp.json");

		assert.deepEqual(result, { alreadyCovered: false, appendedLine: "/.cursor/mcp.json" });
		assert.equal(readFileSync(join(projectDir, ".gitignore"), "utf8"), "/.cursor/mcp.json\n");
	});
});

test("an existing .gitignore not ending in a newline gets one inserted before the new entry", () => {
	withTempProjectDir((projectDir) => {
		writeFileSync(join(projectDir, ".gitignore"), "node_modules/", "utf8");

		const result = ensureGitignored(projectDir, ".cursor/mcp.json");

		assert.deepEqual(result, { alreadyCovered: false, appendedLine: "/.cursor/mcp.json" });
		assert.equal(readFileSync(join(projectDir, ".gitignore"), "utf8"), "node_modules/\n/.cursor/mcp.json\n");
	});
});

test("a path already covered by an exact line is left untouched", () => {
	withTempProjectDir((projectDir) => {
		const before = "dist/\n.cursor/mcp.json\n";
		writeFileSync(join(projectDir, ".gitignore"), before, "utf8");

		const result = ensureGitignored(projectDir, ".cursor/mcp.json");

		assert.deepEqual(result, { alreadyCovered: true });
		assert.equal(readFileSync(join(projectDir, ".gitignore"), "utf8"), before);
	});
});

test("a path already covered by an exact leading-slash-anchored line is left untouched", () => {
	withTempProjectDir((projectDir) => {
		const before = "/.cursor/mcp.json\n";
		writeFileSync(join(projectDir, ".gitignore"), before, "utf8");

		const result = ensureGitignored(projectDir, ".cursor/mcp.json");

		assert.deepEqual(result, { alreadyCovered: true });
		assert.equal(readFileSync(join(projectDir, ".gitignore"), "utf8"), before);
	});
});

test("a path covered by a bare parent-directory entry (no slashes) is left untouched", () => {
	withTempProjectDir((projectDir) => {
		const before = ".cursor\n";
		writeFileSync(join(projectDir, ".gitignore"), before, "utf8");

		const result = ensureGitignored(projectDir, ".cursor/mcp.json");

		assert.deepEqual(result, { alreadyCovered: true });
		assert.equal(readFileSync(join(projectDir, ".gitignore"), "utf8"), before);
	});
});

test("a path covered by a trailing-slash parent-directory entry is left untouched", () => {
	withTempProjectDir((projectDir) => {
		const before = ".cursor/\n";
		writeFileSync(join(projectDir, ".gitignore"), before, "utf8");

		const result = ensureGitignored(projectDir, ".cursor/mcp.json");

		assert.deepEqual(result, { alreadyCovered: true });
		assert.equal(readFileSync(join(projectDir, ".gitignore"), "utf8"), before);
	});
});

test("a path covered by a leading-and-trailing-slash parent-directory entry is left untouched", () => {
	withTempProjectDir((projectDir) => {
		const before = "/.cursor/\n";
		writeFileSync(join(projectDir, ".gitignore"), before, "utf8");

		const result = ensureGitignored(projectDir, ".cursor/mcp.json");

		assert.deepEqual(result, { alreadyCovered: true });
		assert.equal(readFileSync(join(projectDir, ".gitignore"), "utf8"), before);
	});
});

test("a flat, non-nested path with no existing entry gets a new anchored entry appended", () => {
	withTempProjectDir((projectDir) => {
		const before = "dist/\n";
		writeFileSync(join(projectDir, ".gitignore"), before, "utf8");

		const result = ensureGitignored(projectDir, "opencode.json");

		assert.deepEqual(result, { alreadyCovered: false, appendedLine: "/opencode.json" });
		assert.equal(readFileSync(join(projectDir, ".gitignore"), "utf8"), "dist/\n/opencode.json\n");
	});
});

test("a commented-out or negated line never counts as coverage", () => {
	withTempProjectDir((projectDir) => {
		const before = "# .cursor/mcp.json\n!.cursor/mcp.json\n";
		writeFileSync(join(projectDir, ".gitignore"), before, "utf8");

		const result = ensureGitignored(projectDir, ".cursor/mcp.json");

		assert.deepEqual(result, { alreadyCovered: false, appendedLine: "/.cursor/mcp.json" });
		assert.equal(readFileSync(join(projectDir, ".gitignore"), "utf8"), `${before}/.cursor/mcp.json\n`);
	});
});

test("the write goes through a temp file plus rename, leaving no stray .tmp- sibling behind (R4-gitignore-nonatomic-write)", () => {
	withTempProjectDir((projectDir) => {
		writeFileSync(join(projectDir, ".gitignore"), "node_modules/\n", "utf8");

		ensureGitignored(projectDir, ".cursor/mcp.json");

		const entries = readdirSync(projectDir);
		assert.deepEqual(entries, [".gitignore"]);
		assert.equal(readFileSync(join(projectDir, ".gitignore"), "utf8"), "node_modules/\n/.cursor/mcp.json\n");
	});
});

test("a .gitignore that cannot be read (e.g. a directory in its place) reports a caught failure instead of throwing", () => {
	withTempProjectDir((projectDir) => {
		mkdirSync(join(projectDir, ".gitignore"));

		const result = ensureGitignored(projectDir, ".cursor/mcp.json");

		assert.deepEqual(result.alreadyCovered, false);
		assert.ok("failed" in result && result.failed);
	});
});

test("isGitignoreCovered reports true for an exact match and false for an unrelated line", () => {
	assert.equal(isGitignoreCovered(".cursor/mcp.json\n", ".cursor/mcp.json"), true);
	assert.equal(isGitignoreCovered("node_modules/\n", ".cursor/mcp.json"), false);
});
