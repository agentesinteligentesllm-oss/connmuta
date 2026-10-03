import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import {
	resolveSelectedTargets,
	resolveToolConfigPath,
	shouldWritePiTarget,
	toolConfigEntryPath,
	TOOL_CONFIG_TARGETS,
	type ToolId,
} from "../../src/installer/tool-targets.js";
import { buildLauncherEntry, type LauncherEntry } from "../../src/installer/launcher.js";
import { MCP_SERVER_NAME } from "../../src/installer/constants.js";

/** `installer/tool-targets.ts` (design.md §7.2, §7.3, D-33, D-34, D-42, D-43; tasks.md PR-04 sub-task 4.3). */

const PROJECT_DIR = join("C:", "projects", "example");
const LAUNCHER: LauncherEntry = buildLauncherEntry();

function targetById(id: ToolId) {
	const target = TOOL_CONFIG_TARGETS.find((candidate) => candidate.id === id);
	assert.ok(target, `expected a matrix row for ${id}`);
	return target!;
}

test("the matrix has exactly the 8 documented rows, one each", () => {
	const ids = TOOL_CONFIG_TARGETS.map((target) => target.id).sort();
	assert.deepEqual(ids, [
		"antigravity",
		"claude-code",
		"codex-cli",
		"cursor",
		"gemini-cli",
		"opencode",
		"pi",
		"vscode",
	]);
});

test("every row's relative path and container key match design.md §7.2", () => {
	assert.equal(targetById("claude-code").relativePath, ".mcp.json");
	assert.equal(targetById("claude-code").containerKey, "mcpServers");

	assert.equal(targetById("cursor").relativePath, ".cursor/mcp.json");
	assert.equal(targetById("cursor").containerKey, "mcpServers");

	assert.equal(targetById("vscode").relativePath, ".vscode/mcp.json");
	assert.equal(targetById("vscode").containerKey, "servers");

	assert.equal(targetById("gemini-cli").relativePath, ".gemini/settings.json");
	assert.equal(targetById("gemini-cli").containerKey, "mcpServers");

	assert.equal(targetById("opencode").relativePath, "opencode.json");
	assert.equal(targetById("opencode").containerKey, "mcp");

	assert.equal(targetById("codex-cli").relativePath, ".codex/config.toml");
	assert.equal(targetById("codex-cli").containerKey, "mcp_servers");

	assert.equal(targetById("antigravity").relativePath, ".agents/mcp_config.json");
	assert.equal(targetById("antigravity").containerKey, "mcpServers");

	assert.equal(targetById("pi").relativePath, ".pi/mcp.json");
	assert.equal(targetById("pi").containerKey, "mcpServers");
});

test("the standard mcpServers-family entry is id-free stdio with zero env", () => {
	for (const id of ["claude-code", "cursor", "gemini-cli", "codex-cli", "antigravity"] as const) {
		const entry = targetById(id).buildEntry(LAUNCHER);
		assert.deepEqual(entry, { command: LAUNCHER.command, args: [...LAUNCHER.args] });
		assert.ok(!("env" in entry));
	}
});

test("VS Code's entry lands under its own type: stdio shape", () => {
	const entry = targetById("vscode").buildEntry(LAUNCHER);
	assert.deepEqual(entry, { type: "stdio", command: LAUNCHER.command, args: [...LAUNCHER.args] });
});

test("OpenCode's entry folds command and args into one array", () => {
	const entry = targetById("opencode").buildEntry(LAUNCHER);
	assert.deepEqual(entry, { type: "local", command: [LAUNCHER.command, ...LAUNCHER.args] });
});

test("no built entry, across any surface, ever contains npx, enableAllProjectMcpServers or trust_level", () => {
	for (const target of TOOL_CONFIG_TARGETS) {
		const serialized = JSON.stringify(target.buildEntry(LAUNCHER));
		assert.ok(!serialized.includes("npx"), `${target.id} entry must never contain npx`);
		assert.ok(
			!serialized.includes("enableAllProjectMcpServers"),
			`${target.id} entry must never contain enableAllProjectMcpServers`,
		);
		assert.ok(!serialized.includes("trust_level"), `${target.id} entry must never contain trust_level`);
	}
});

test("toolConfigEntryPath addresses containerKey then the server name", () => {
	assert.deepEqual(toolConfigEntryPath(targetById("claude-code"), MCP_SERVER_NAME), ["mcpServers", MCP_SERVER_NAME]);
	assert.deepEqual(toolConfigEntryPath(targetById("vscode"), MCP_SERVER_NAME), ["servers", MCP_SERVER_NAME]);
	assert.deepEqual(toolConfigEntryPath(targetById("opencode"), MCP_SERVER_NAME), ["mcp", MCP_SERVER_NAME]);
	assert.deepEqual(toolConfigEntryPath(targetById("codex-cli"), MCP_SERVER_NAME), ["mcp_servers", MCP_SERVER_NAME]);
});

test("every row resolves strictly under the project directory, never a global/user-level path", () => {
	for (const target of TOOL_CONFIG_TARGETS) {
		const resolved = resolveToolConfigPath(PROJECT_DIR, target);
		assert.ok(
			resolved.startsWith(PROJECT_DIR),
			`${target.id} must resolve under the project directory, got ${resolved}`,
		);
		assert.ok(!target.relativePath.startsWith("~"), `${target.id}'s own path must not be home-relative`);
	}
});

test("OpenCode's row is the only OpenCode row and it is project-level", () => {
	const openCodeRows = TOOL_CONFIG_TARGETS.filter((target) => target.id === "opencode");
	assert.equal(openCodeRows.length, 1);
	assert.equal(openCodeRows[0].relativePath, "opencode.json");
});

test("Pi's row is project-level; no row anywhere targets Pi's global ~/.pi/agent/mcp.json", () => {
	const piRows = TOOL_CONFIG_TARGETS.filter((target) => target.id === "pi");
	assert.equal(piRows.length, 1);
	assert.equal(piRows[0].relativePath, ".pi/mcp.json");
	for (const target of TOOL_CONFIG_TARGETS) {
		assert.ok(!target.relativePath.includes(".pi/agent/"), `${target.id} must not touch Pi's global config path`);
	}
});

test("shouldWritePiTarget: skipped when Claude Code is selected in the same run", () => {
	const write = shouldWritePiTarget({
		selectedToolIds: new Set<ToolId>(["pi", "claude-code"]),
		piEntry: { command: "node", args: ["x"] },
	});
	assert.equal(write, false);
});

test("shouldWritePiTarget: skipped when .mcp.json already holds an identical entry", () => {
	const entry = { command: "node", args: ["x"] };
	const write = shouldWritePiTarget({
		selectedToolIds: new Set<ToolId>(["pi"]),
		piEntry: entry,
		existingSharedEntry: { command: "node", args: ["x"] },
	});
	assert.equal(write, false);
});

test("shouldWritePiTarget: written when Claude Code is not selected and no identical shared entry exists", () => {
	const write = shouldWritePiTarget({
		selectedToolIds: new Set<ToolId>(["pi"]),
		piEntry: { command: "node", args: ["x"] },
	});
	assert.equal(write, true);
});

test("shouldWritePiTarget: written when the existing shared entry differs from Pi's own entry", () => {
	const write = shouldWritePiTarget({
		selectedToolIds: new Set<ToolId>(["pi"]),
		piEntry: { command: "node", args: ["x"] },
		existingSharedEntry: { command: "node", args: ["y"] },
	});
	assert.equal(write, true);
});

test("resolveSelectedTargets: selecting both Claude Code and Pi writes one shared entry, not two", () => {
	const targets = resolveSelectedTargets(new Set<ToolId>(["claude-code", "pi"]), LAUNCHER);

	assert.deepEqual(
		targets.map((target) => target.id),
		["claude-code"],
	);
});

test("resolveSelectedTargets: Pi alone, with no pre-existing shared entry, is included", () => {
	const targets = resolveSelectedTargets(new Set<ToolId>(["pi"]), LAUNCHER);

	assert.deepEqual(
		targets.map((target) => target.id),
		["pi"],
	);
});

test("resolveSelectedTargets: Pi alone is dropped when .mcp.json already holds an identical entry", () => {
	const piEntry = targetById("pi").buildEntry(LAUNCHER);
	const targets = resolveSelectedTargets(new Set<ToolId>(["pi"]), LAUNCHER, piEntry);

	assert.deepEqual(targets, []);
});

test("resolveSelectedTargets: only selected ids are returned, in matrix order", () => {
	const targets = resolveSelectedTargets(new Set<ToolId>(["codex-cli", "cursor"]), LAUNCHER);

	assert.deepEqual(
		targets.map((target) => target.id),
		["cursor", "codex-cli"],
	);
});
