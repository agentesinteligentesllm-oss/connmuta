import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";

import type { LauncherEntry } from "./launcher.js";

/**
 * The tool-config matrix: one row per host tool the installer can write an MCP entry for
 * (design.md §7.2, §7.3; D-33, D-34, D-42, D-43).
 *
 * Every row is a project-relative path plus the container key and entry shape that surface's own
 * MCP host expects; there is no global/user-level row anywhere in this table (proposal.md's
 * matrix; OpenCode and Pi's global files are never targets). Building the actual file text — the
 * per-format adapter and `editFile`'s seven-step pipeline (`installer/file-edit.ts`) — is a later
 * slice (PR-05); this module only builds the data `editFile` will eventually be called with: a
 * path, an `entryPath` and the entry value.
 */

/** One of the 8 host tools the installer can write an MCP entry for. */
export type ToolId =
	| "claude-code"
	| "cursor"
	| "vscode"
	| "gemini-cli"
	| "opencode"
	| "codex-cli"
	| "antigravity"
	| "pi";

/** A row of the tool-config matrix. */
export interface ToolConfigTarget {
	/** Stable identifier used by the wizard's multiselect and by {@link resolveSelectedTargets}. */
	readonly id: ToolId;
	/** Human-readable name for wizard prompts. */
	readonly label: string;
	/** Path to the config file, relative to the project directory — never a global/user-level path. */
	readonly relativePath: string;
	/** Top-level key the entry is nested under (`mcpServers`/`servers`/`mcp`/`mcp_servers`). */
	readonly containerKey: string;
	/** Builds this surface's own entry shape from the shared launcher entry. */
	readonly buildEntry: (launcher: LauncherEntry) => Record<string, unknown>;
}

/** `{ command, args }` — the shape every `mcpServers`/`mcp_servers`-keyed surface writes. */
function standardEntry(launcher: LauncherEntry): Record<string, unknown> {
	return { command: launcher.command, args: [...launcher.args] };
}

/** VS Code's `servers`-keyed entry additionally carries `type: "stdio"` (design.md §7.2). */
function vsCodeEntry(launcher: LauncherEntry): Record<string, unknown> {
	return { type: "stdio", command: launcher.command, args: [...launcher.args] };
}

/** OpenCode's `mcp`-keyed entry folds `command`/`args` into one array (design.md §7.2). */
function openCodeEntry(launcher: LauncherEntry): Record<string, unknown> {
	return { type: "local", command: [launcher.command, ...launcher.args] };
}

/**
 * The 8-row tool-config matrix (design.md §7.2, proposal.md's tool table).
 *
 * `.mcp.json` is Claude Code's row and is also the shared surface Pi reads (§7.3, D-43): it is not
 * duplicated as a second row for Pi. Every `relativePath` here is project-relative; none of these
 * rows ever resolves under a home directory.
 */
export const TOOL_CONFIG_TARGETS: readonly ToolConfigTarget[] = [
	{ id: "claude-code", label: "Claude Code", relativePath: ".mcp.json", containerKey: "mcpServers", buildEntry: standardEntry },
	{ id: "cursor", label: "Cursor", relativePath: ".cursor/mcp.json", containerKey: "mcpServers", buildEntry: standardEntry },
	{ id: "vscode", label: "VS Code", relativePath: ".vscode/mcp.json", containerKey: "servers", buildEntry: vsCodeEntry },
	{ id: "gemini-cli", label: "Gemini CLI", relativePath: ".gemini/settings.json", containerKey: "mcpServers", buildEntry: standardEntry },
	{ id: "opencode", label: "OpenCode", relativePath: "opencode.json", containerKey: "mcp", buildEntry: openCodeEntry },
	{ id: "codex-cli", label: "Codex CLI", relativePath: ".codex/config.toml", containerKey: "mcp_servers", buildEntry: standardEntry },
	{ id: "antigravity", label: "Antigravity", relativePath: ".agents/mcp_config.json", containerKey: "mcpServers", buildEntry: standardEntry },
	{ id: "pi", label: "Pi", relativePath: ".pi/mcp.json", containerKey: "mcpServers", buildEntry: standardEntry },
];

/** Object-key path from a target's document root to its entry, for `editFile`'s `entryPath` (design.md §4.2). */
export function toolConfigEntryPath(target: ToolConfigTarget, serverName: string): readonly string[] {
	return [target.containerKey, serverName];
}

/** Resolves `target`'s absolute path under `projectDir` — always inside the project, never a global path. */
export function resolveToolConfigPath(projectDir: string, target: ToolConfigTarget): string {
	return join(projectDir, target.relativePath);
}

/** Inputs {@link shouldWritePiTarget} needs to apply the D-43 dedup rule. */
export interface PiDedupInput {
	/** Every tool id selected in this installer run. */
	readonly selectedToolIds: ReadonlySet<ToolId>;
	/** The entry Pi's own row would write, from {@link ToolConfigTarget.buildEntry}. */
	readonly piEntry: Record<string, unknown>;
	/** The entry already present under the server name in the project's `.mcp.json`, if any. */
	readonly existingSharedEntry?: unknown;
}

/**
 * D-43: writing `.pi/mcp.json` is redundant, and must be skipped, when Claude Code is selected in
 * the same run (its own row already writes the identical entry to the shared `.mcp.json` Pi reads)
 * or when `.mcp.json` already holds an identical entry from an earlier run. Otherwise Pi's row is
 * written.
 */
export function shouldWritePiTarget(input: PiDedupInput): boolean {
	if (input.selectedToolIds.has("claude-code")) {
		return false;
	}
	if (input.existingSharedEntry !== undefined && isDeepStrictEqual(input.existingSharedEntry, input.piEntry)) {
		return false;
	}
	return true;
}

/**
 * The matrix rows to actually write for one installer run: every selected tool, with Pi's row
 * filtered out per {@link shouldWritePiTarget} when it would be redundant (D-43).
 */
export function resolveSelectedTargets(
	selectedToolIds: ReadonlySet<ToolId>,
	launcher: LauncherEntry,
	existingSharedMcpJsonEntry?: unknown,
): readonly ToolConfigTarget[] {
	return TOOL_CONFIG_TARGETS.filter((target) => {
		if (!selectedToolIds.has(target.id)) {
			return false;
		}
		if (target.id === "pi") {
			return shouldWritePiTarget({
				selectedToolIds,
				piEntry: target.buildEntry(launcher),
				existingSharedEntry: existingSharedMcpJsonEntry,
			});
		}
		return true;
	});
}
