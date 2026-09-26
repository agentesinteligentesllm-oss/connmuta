import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The launcher entry every tool-config surface installs (design.md §7.1, D-42).
 *
 * `command` is the realpath of the currently-running Node binary, not a bare `conmuta`: a bare
 * command resolves to `conmuta.cmd` on Windows, which fails under `spawn` with no shell exactly as
 * `npx` does (ADR-0031 context). `realpathSync` also makes the entry nvm/fnm-aware, since fnm's
 * per-shell `fnm_multishells` path is ephemeral. `args` is the absolute compiled CLI entry point
 * plus the literal `mcp --project <id>` invocation (`cli/main.ts`'s existing `mcp` branch). There is
 * no `env` field at all — not an empty one — per D-42's zero-environment requirement.
 */

/** Resolved path to the compiled CLI entry point, next to this compiled module. */
export const CLI_ENTRY = fileURLToPath(new URL("../cli/main.js", import.meta.url));

/** The shape every written tool-config entry shares before a surface's own container/wrapper is applied. */
export interface LauncherEntry {
	readonly command: string;
	readonly args: readonly string[];
}

/** Builds the launcher entry for `projectId`; carries no `env` key. */
export function buildLauncherEntry(projectId: string): LauncherEntry {
	return {
		command: realpathSync(process.execPath),
		args: [CLI_ENTRY, "mcp", "--project", projectId],
	};
}
