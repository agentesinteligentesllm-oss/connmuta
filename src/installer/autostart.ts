import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AUTOSTART_LAUNCHD_LABEL, AUTOSTART_RUN_KEY, AUTOSTART_VALUE_NAME, BACKUP_SUFFIX_PREFIX } from "./constants.js";
import { type ExecFileImpl, runReg } from "./exec.js";
import { formatBackupTimestamp } from "./file-edit.js";
import { CLI_ENTRY } from "./launcher.js";

/**
 * Start-at-login registration (design.md §10, D-40, D-47), applied when a wizard's opt-in checkbox is
 * ticked. Windows writes a `REG_SZ` value under {@link AUTOSTART_RUN_KEY} through `installer/exec.ts`'s
 * `runReg` (the only Node-reachable path to the registry); macOS writes a `launchd` plist from a fixed
 * template through a small dedicated write-with-backup routine, not `installer/file-edit.ts`'s generic
 * `FormatAdapter` pipeline. That pipeline's step 4 (design.md §4.1) refuses a same-named entry whose
 * content differs, which fits a *shared* user file where a divergent entry needs human review; the
 * plist here is a file this product fully owns end to end, and design's own idempotence table for it
 * ("our label with different content ⇒ rewrite with backup") is an unconditional overwrite, the
 * opposite behavior. Reusing `FormatAdapter` would either misreport a routine node-upgrade rewrite as a
 * refusal, or require weakening step 4 for every other caller — so this file writes and backs up the
 * plist directly instead.
 *
 * Both platform outcomes reuse `installer/file-edit.ts`'s own `"created" | "noop" | "written"`
 * vocabulary ({@link AutostartWriteOutcome}) so a future wizard call site (PR-12) reads one consistent
 * result shape across every installer write path.
 */

/** What an opt-in autostart write did (shared vocabulary with `installer/file-edit.ts`'s `EditFileOutcome`). */
export type AutostartWriteOutcome = "created" | "noop" | "written";

/** What an opt-out autostart removal did. */
export type AutostartRemoveOutcome = "removed" | "noop";

/**
 * Resolved path to the compiled daemon entry point, next to this compiled module (design.md §10,
 * D-47). macOS's `ProgramArguments` runs the daemon directly rather than through `cli/main.ts`'s
 * `daemon start` dispatch: launchd has no console to hide, unlike the Windows Run-key command, which
 * must go through the CLI so a visible console only flashes briefly at login (design.md §10 "Why that
 * target").
 */
export const DAEMON_ENTRY = fileURLToPath(new URL("../daemon/main.js", import.meta.url));

// ---------------------------------------------------------------------------------------------
// Windows: HKCU\...\Run (design.md §10, D-47)
// ---------------------------------------------------------------------------------------------

/** What the Windows autostart functions need; every field is injectable so tests never touch the real Run key. */
export interface WindowsAutostartOptions {
	/** Registry key to write under; defaults to {@link AUTOSTART_RUN_KEY}. Overridable for a scratch-key test. */
	readonly runKey?: string;
	/** Value name to write; defaults to {@link AUTOSTART_VALUE_NAME}. Overridable for a scratch-key test. */
	readonly valueName?: string;
	/** Overridable for tests; defaults to real `installer/exec.ts` reg runner. */
	readonly execImpl?: ExecFileImpl;
}

/** Builds the exact Run-key command data D-47 requires: quoted node path, quoted CLI entry, `daemon start`. */
export function buildWindowsAutostartCommand(): string {
	const nodePath = realpathSync(process.execPath);
	return `"${nodePath}" "${CLI_ENTRY}" daemon start`;
}

/** Escapes regex metacharacters in `value` so it can be embedded literally in a `RegExp` pattern. */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether `error` means `reg.exe` itself never ran (missing binary, spawn failure) rather than ran and exited non-zero. */
function isSpawnFailure(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string";
}

/**
 * Reads back `valueName`'s current `REG_SZ` data under `runKey` via `reg query`, or `undefined` when
 * the key or value does not exist.
 *
 * A spawn failure (`reg.exe` itself could not run at all — missing binary, `EACCES` on the binary)
 * rethrows: that is a real infrastructure failure, never "value absent". `reg.exe` running and exiting
 * non-zero is treated as "absent" — its documented behavior for `query` on a missing key/value.
 *
 * Residual limitation, disclosed rather than silently accepted: `reg.exe` gives the same generic
 * non-zero exit for a genuinely missing value and for a real query failure against an existing one
 * (e.g. an ACL that denies read access); there is no distinct, locale-independent exit code or output
 * signal to tell them apart, so a real failure of that second kind is still reported as "absent" here.
 * Not expected in practice for {@link AUTOSTART_RUN_KEY}: `HKCU\...` is always readable by the current
 * user who owns it (see B-71).
 */
function queryWindowsRunValue(runKey: string, valueName: string, execImpl: ExecFileImpl | undefined): string | undefined {
	let output: string;
	try {
		output = runReg(["query", runKey, "/v", valueName], execImpl);
	} catch (error) {
		if (isSpawnFailure(error)) {
			throw error;
		}
		return undefined;
	}
	const pattern = new RegExp(`^[ \\t]*${escapeRegExp(valueName)}[ \\t]+REG_SZ[ \\t]+(.*)$`, "m");
	return pattern.exec(output)?.[1]?.trimEnd();
}

/** Writes the Windows Run-key autostart entry (design.md §10). `reg query` first: identical data is a no-op. */
export function enableWindowsAutostart(options: WindowsAutostartOptions = {}): AutostartWriteOutcome {
	const runKey = options.runKey ?? AUTOSTART_RUN_KEY;
	const valueName = options.valueName ?? AUTOSTART_VALUE_NAME;
	const data = buildWindowsAutostartCommand();

	const existing = queryWindowsRunValue(runKey, valueName, options.execImpl);
	if (existing === data) {
		return "noop";
	}
	runReg(["add", runKey, "/v", valueName, "/t", "REG_SZ", "/d", data, "/f"], options.execImpl);
	return existing === undefined ? "created" : "written";
}

/** Removes only {@link AUTOSTART_VALUE_NAME} (or `options.valueName`) under `runKey`; leaves every other value untouched. */
export function disableWindowsAutostart(options: WindowsAutostartOptions = {}): AutostartRemoveOutcome {
	const runKey = options.runKey ?? AUTOSTART_RUN_KEY;
	const valueName = options.valueName ?? AUTOSTART_VALUE_NAME;

	if (queryWindowsRunValue(runKey, valueName, options.execImpl) === undefined) {
		return "noop";
	}
	runReg(["delete", runKey, "/v", valueName, "/f"], options.execImpl);
	return "removed";
}

// ---------------------------------------------------------------------------------------------
// macOS: ~/Library/LaunchAgents/<label>.plist (design.md §10, D-47)
// ---------------------------------------------------------------------------------------------

/** What the macOS autostart functions need; both fields are injectable so tests never touch the real LaunchAgents dir. */
export interface MacAutostartOptions {
	/** Directory the plist is written into; defaults to `~/Library/LaunchAgents`. Overridable for a scratch dir test. */
	readonly launchAgentsDir?: string;
	/** Clock used to name a pre-overwrite backup; overridable so tests can force a deterministic name. */
	readonly now?: () => Date;
}

/** Escapes the three XML-significant characters that can appear in a filesystem path's text content. */
function escapeXmlText(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Builds the fixed launchd plist template (design.md §10): `Label`, `ProgramArguments` running the
 * daemon directly, and `RunAtLoad = true`. Deliberately carries no `KeepAlive` key at all, so launchd
 * never fights the daemon's own idle shutdown policy.
 */
export function buildLaunchdPlist(nodePath: string, daemonEntry: string): string {
	const label = escapeXmlText(AUTOSTART_LAUNCHD_LABEL);
	const program = escapeXmlText(nodePath);
	const entry = escapeXmlText(daemonEntry);
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${label}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${program}</string>
		<string>${entry}</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
</dict>
</plist>
`;
}

/** Extracts the `Label` string from a plist's own text, or `undefined` when the key is absent (a foreign file). */
function extractPlistLabel(content: string): string | undefined {
	return /<key>Label<\/key>\s*<string>([^<]*)<\/string>/.exec(content)?.[1];
}

function macPlistPath(options: MacAutostartOptions): string {
	const dir = options.launchAgentsDir ?? join(homedir(), "Library", "LaunchAgents");
	return join(dir, `${AUTOSTART_LAUNCHD_LABEL}.plist`);
}

/**
 * Writes the macOS LaunchAgent plist (design.md §10). Identical content is a no-op; content that
 * differs under our own label is rewritten after one plain-copy backup — unlike
 * `installer/file-edit.ts`'s generic pipeline, this path only ever backs up its own single plist file,
 * so a same-second repeat overwrite of that one backup slot is an accepted simplification (no
 * collision-retry loop).
 */
export function enableMacAutostart(options: MacAutostartOptions = {}): AutostartWriteOutcome {
	const path = macPlistPath(options);
	const nextContent = buildLaunchdPlist(realpathSync(process.execPath), DAEMON_ENTRY);

	if (!existsSync(path)) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, nextContent, "utf8");
		return "created";
	}
	const currentContent = readFileSync(path, "utf8");
	const currentLabel = extractPlistLabel(currentContent);
	if (currentLabel !== undefined && currentLabel !== AUTOSTART_LAUNCHD_LABEL) {
		// A file already at our exact expected path with a different Label is not the routine
		// "our own plist, content differs" case design's idempotence table describes (e.g. a node
		// upgrade) — refuse rather than silently back up and overwrite something we may not own,
		// the same protective stance disableMacAutostart already takes for a foreign Label.
		throw new Error(`installer/autostart.ts: refusing to overwrite a plist at ${path} whose Label is not ours (found: ${currentLabel})`);
	}
	if (currentContent === nextContent) {
		return "noop";
	}
	const now = options.now ?? (() => new Date());
	copyFileSync(path, `${path}${BACKUP_SUFFIX_PREFIX}${formatBackupTimestamp(now())}`);
	writeFileSync(path, nextContent, "utf8");
	return "written";
}

/** Removes the plist only when its own `Label` matches ours; a foreign or absent plist is untouched. */
export function disableMacAutostart(options: MacAutostartOptions = {}): AutostartRemoveOutcome {
	const path = macPlistPath(options);
	if (!existsSync(path)) {
		return "noop";
	}
	if (extractPlistLabel(readFileSync(path, "utf8")) !== AUTOSTART_LAUNCHD_LABEL) {
		return "noop";
	}
	rmSync(path);
	return "removed";
}

// ---------------------------------------------------------------------------------------------
// Platform dispatch (the single call site a wizard, PR-12, needs)
// ---------------------------------------------------------------------------------------------

/** Combined options for whichever platform branch `enableAutostart`/`disableAutostart` takes. */
export interface AutostartOptions extends WindowsAutostartOptions, MacAutostartOptions {}

/** Applies the opt-in autostart write for the current platform (design.md §10). */
export function enableAutostart(options: AutostartOptions = {}): AutostartWriteOutcome {
	if (process.platform === "win32") {
		return enableWindowsAutostart(options);
	}
	if (process.platform === "darwin") {
		return enableMacAutostart(options);
	}
	throw new Error(`installer/autostart.ts: start-at-login is not supported on this platform (${process.platform})`);
}

/** Applies the opt-out autostart removal for the current platform (design.md §10). */
export function disableAutostart(options: AutostartOptions = {}): AutostartRemoveOutcome {
	if (process.platform === "win32") {
		return disableWindowsAutostart(options);
	}
	if (process.platform === "darwin") {
		return disableMacAutostart(options);
	}
	throw new Error(`installer/autostart.ts: start-at-login is not supported on this platform (${process.platform})`);
}
