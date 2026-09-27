import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGENTS_MD_MAX_LINES } from "../../src/installer/constants.js";
import { CLAUDE_MD_IMPORT_LINE } from "../../src/installer/formats/markdown.js";
import { printTrustSteps, trustStepFor, writeInstructionFiles } from "../../src/installer/instructions.js";
import type { ToolId } from "../../src/installer/tool-targets.js";

/**
 * `installer/instructions.ts` (design.md §8.2; installer-wizard spec.md:125-143; OVERVIEW.md:274;
 * tasks.md 10.3/10.4): the `AGENTS.md`/`CLAUDE.md` template and the printed-not-automated trust steps.
 *
 * Mirrors `acl.test.ts`'s scratch-dir-with-finally-cleanup pattern; every write here goes through the
 * real `editFile` pipeline against a real scratch temp directory, never a mock file system.
 */

function withScratchProjectDir(body: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-instructions-"));
	try {
		body(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("writeInstructionFiles writes AGENTS.md within the line cap and CLAUDE.md as exactly the import line", () => {
	withScratchProjectDir((dir) => {
		const outcome = writeInstructionFiles(dir);

		assert.equal(outcome.agentsMd, "created");
		assert.equal(outcome.claudeMd, "created");

		const agentsMdPath = join(dir, "AGENTS.md");
		assert.ok(existsSync(agentsMdPath));
		const agentsMdLines = readFileSync(agentsMdPath, "utf8").split("\n");
		assert.ok(
			agentsMdLines.length <= AGENTS_MD_MAX_LINES,
			`expected at most ${AGENTS_MD_MAX_LINES} lines, got ${agentsMdLines.length}`,
		);

		const claudeMdContent = readFileSync(join(dir, "CLAUDE.md"), "utf8");
		assert.equal(claudeMdContent, `${CLAUDE_MD_IMPORT_LINE}\n`);
	});
});

test("writeInstructionFiles is a no-op on a second run against its own output", () => {
	withScratchProjectDir((dir) => {
		writeInstructionFiles(dir);
		const second = writeInstructionFiles(dir);

		assert.equal(second.agentsMd, "noop");
		assert.equal(second.claudeMd, "noop");
	});
});

const DOCUMENTED_TRUST_STEP_TOOLS: readonly ToolId[] = ["claude-code", "codex-cli", "gemini-cli", "vscode"];
const UNDOCUMENTED_TRUST_STEP_TOOLS: readonly ToolId[] = ["cursor", "opencode", "antigravity", "pi"];

test("trustStepFor returns a defined, non-empty step for the 4 documented tools", () => {
	for (const toolId of DOCUMENTED_TRUST_STEP_TOOLS) {
		const step = trustStepFor(toolId);
		assert.equal(typeof step, "string", `expected a step for ${toolId}`);
		assert.ok((step ?? "").length > 0, `expected a non-empty step for ${toolId}`);
	}
});

test("trustStepFor returns undefined for the 4 tools with no documented trust step", () => {
	for (const toolId of UNDOCUMENTED_TRUST_STEP_TOOLS) {
		assert.equal(trustStepFor(toolId), undefined, `expected no step for ${toolId}`);
	}
});

test("printTrustSteps emits one line per selected tool that has a defined trust step, skipping the rest", () => {
	const written: string[] = [];
	const selected: ToolId[] = ["claude-code", "cursor", "vscode", "opencode"];

	printTrustSteps(selected, { write: (line) => written.push(line) });

	assert.equal(written.length, 2);
	assert.equal(written[0], trustStepFor("claude-code"));
	assert.equal(written[1], trustStepFor("vscode"));
});
