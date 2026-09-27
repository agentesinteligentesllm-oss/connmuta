import { existsSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";

import type { FormatAdapter } from "../../installer/file-edit.js";
import { GITIGNORE_FILE_NAME, isGitignoreCovered } from "../../installer/gitignore.js";
import { jsoncAdapter } from "../../installer/formats/jsonc.js";
import { tomlAdapter } from "../../installer/formats/toml.js";
import type { LauncherEntry } from "../../installer/launcher.js";
import {
	resolveToolConfigPath,
	toolConfigEntryPath,
	TOOL_CONFIG_TARGETS,
	type ToolConfigTarget,
	type ToolId,
} from "../../installer/tool-targets.js";
import { parseRegistryText } from "../../registry/loader.js";
import type { Registry, RegistryBinding, RegistryProblem, RegistryProject } from "../../registry/schema.js";
import { MCP_SERVER_NAME, PROJECT_FILE_NAME } from "../../shared/constants.js";
import { parseProjectFile, type ProjectFileProblem } from "../../shared/project-file.js";
import { verifyProjectFileMatches, type IntendedProjectBinding } from "../../shared/project-file-writer.js";
import type { Finding } from "./system.js";

/**
 * The registry tier (`doctor/checks/registry.ts`, design.md §9.1's "Registry" row, spec.md "Registry
 * tier checks bijective invariants and the token-shape scan"; tasks.md PR-15, closing unit 8).
 *
 * Every check here is read-only and makes no network call, mirroring `checks/system.ts`. It re-runs
 * `parseRegistryText` (R1–R3 and R5 come free, since that function is the loader's own single source
 * of truth for them — this module never re-implements that logic), adds the referential-integrity
 * check B-28 asked for, R4 (a cross-file check `parseRegistryText` cannot do, since it never opens a
 * project's own `conmuta.json`), a token-shape report over each bound project's `conmuta.json`, the
 * installer's own written tool configs (§7.2 shape, `.mcp.json` readers, Pi duplicates, D-43), and a
 * D-52 `.gitignore`-coverage warning for a bound project that is a git worktree (tasks.md PR-21).
 *
 * **A registry that fails to parse skips every other check.** There is no `Registry` object to walk
 * bindings/projects/bots/groups from once `parseRegistryText` refuses the document, so this tier
 * returns only the parse-level findings in that case (design.md §9.1's own ordering).
 */

/** What {@link runRegistryChecks} needs. No `execImpl`-style seam: this tier runs no external process. */
export interface RunRegistryChecksOptions {
	/** The daemon home; `~/.conmuta` in production, a temp directory in tests. Never created or written here. */
	readonly homeDir: string;
}

/**
 * Hosts `.mcp.json` also configures, beside Claude Code itself (design.md:151, `tool-targets.ts`'s own
 * D-43 module doc: "that file also configures Claude Code, Copilot CLI and the VS Code Agent Host").
 */
const MCP_JSON_READERS = ["Claude Code", "Copilot CLI", "VS Code Agent Host"] as const;

/**
 * A placeholder launcher entry used only to read off a target's expected top-level key *set* from
 * {@link ToolConfigTarget.buildEntry} — never to compare against a real written entry. `buildEntry` is
 * a pure reshuffle of its argument's two fields into a surface-specific object literal, so the key set
 * it returns does not depend on the values passed in; this avoids hard-coding "command+args for most,
 * type+command+args for VS Code, type+command for OpenCode" a second time next to `tool-targets.ts`.
 */
const SHAPE_REFERENCE_LAUNCHER: LauncherEntry = { command: "node", args: ["--shape-reference"] };

/** Selects a target's `FormatAdapter` by extension, mirroring `installer/wizards/project-bind.ts`'s own private `adapterFor`. */
function adapterFor(relativePath: string): FormatAdapter {
	return relativePath.endsWith(".toml") ? tomlAdapter : jsoncAdapter;
}

/** Reads a value at a dotted key path out of a parsed document; `undefined` on any missing/non-object segment. */
function readAtPath(doc: unknown, path: readonly string[]): unknown {
	let node: unknown = doc;
	for (const segment of path) {
		if (typeof node !== "object" || node === null) {
			return undefined;
		}
		node = (node as Record<string, unknown>)[segment];
	}
	return node;
}

/** Whether `entry`'s own top-level key set matches `target`'s expected shape (see {@link SHAPE_REFERENCE_LAUNCHER}). */
function entryShapeMatches(target: ToolConfigTarget, entry: unknown): boolean {
	if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
		return false;
	}
	const expectedKeys = Object.keys(target.buildEntry(SHAPE_REFERENCE_LAUNCHER)).sort();
	const actualKeys = Object.keys(entry as Record<string, unknown>).sort();
	return isDeepStrictEqual(expectedKeys, actualKeys);
}

/** Map one `RegistryProblem` (R1–R3, R5, or a read/shape failure) to a finding; value-free, per that module's own doctrine. */
function registryProblemFinding(problem: RegistryProblem): Finding {
	switch (problem.kind) {
		case "unreadable":
			return { id: "registry-parse-unreadable", status: "fail", detail: "registry.json could not be read" };
		case "invalid_json":
			return { id: "registry-parse-invalid-json", status: "fail", detail: "registry.json is not valid JSON" };
		case "unsupported_registry_version":
			return {
				id: "registry-parse-unsupported-version",
				status: "fail",
				detail: `registry.json declares registry_version ${problem.found}, which this build does not support`,
			};
		case "schema_invalid":
			return { id: "registry-parse-schema-invalid", status: "fail", detail: "registry.json does not match the registry schema" };
		case "invariant_violated":
			return {
				id: `registry-invariant-${problem.invariant.toLowerCase()}`,
				status: "fail",
				detail: `registry.json violates invariant ${problem.invariant} (DATA-MODEL §2.5)`,
			};
		case "forbidden_content":
			return {
				id: "registry-forbidden-content",
				status: "warn",
				detail:
					"registry.json was refused by the R5 raw-text scan; this can be ordinary human-authored text — " +
					"an assignment-shaped or `Authorization`-shaped string in a field such as a group title — refused " +
					"by design, not necessarily damage (B-30). Fix it by editing the offending field's text, not by " +
					"a doctor repair; this problem carries no document text, so it cannot name which field it was.",
			};
	}
}

/** B-28: every binding's `bot_id`/`group_id`/`project_id` must each resolve to a real `bots[]`/`groups[]`/`projects[]` entry. */
function checkReferentialIntegrity(registry: Registry, binding: RegistryBinding): Finding {
	const dangling: string[] = [];
	if (!registry.bots.some((bot) => bot.bot_id === binding.bot_id)) {
		dangling.push(`bot_id ${binding.bot_id}`);
	}
	if (!registry.groups.some((group) => group.group_id === binding.group_id)) {
		dangling.push(`group_id ${binding.group_id}`);
	}
	if (!registry.projects.some((project) => project.project_id === binding.project_id)) {
		dangling.push(`project_id ${binding.project_id}`);
	}
	const id = `referential-integrity-${binding.project_id}`;
	return dangling.length === 0
		? { id, status: "pass", detail: `binding ${binding.project_id}: bot_id, group_id and project_id all resolve` }
		: { id, status: "fail", detail: `binding ${binding.project_id}: dangling reference(s): ${dangling.join(", ")}` };
}

/**
 * R4 (DATA-MODEL §2.5: `binding.group_id === conmuta.json.group_id` for that project) via
 * `verifyProjectFileMatches`, the exact function `project bind` itself uses to decide write-vs-verify.
 *
 * Reported through `matches`/`disagreements` as a whole rather than isolating `group_id` alone: the
 * same call already tells us about `project_id` and `roster` too, and any disagreement means the
 * committed file and the registry no longer describe the same binding — worth surfacing regardless of
 * which field moved. The detail names every disagreeing field from `ProjectFileMatchResult`.
 */
function checkR4(binding: RegistryBinding, existingText: string): Finding {
	const intended: IntendedProjectBinding = {
		project_id: binding.project_id,
		group_id: binding.group_id,
		roster: binding.roster_snapshot,
	};
	const match = verifyProjectFileMatches(existingText, intended);
	const id = `r4-project-${binding.project_id}`;
	return match.matches
		? { id, status: "pass", detail: `project ${binding.project_id}: conmuta.json agrees with the binding` }
		: { id, status: "fail", detail: `project ${binding.project_id}: conmuta.json disagrees on: ${match.disagreements.join(", ")}` };
}

/**
 * The token-shape scan over a bound project's `conmuta.json` (PT-05 doctor half).
 *
 * **Not implemented as a fresh per-field `findTokenShapes` walk.** `shared/project-file.ts`'s own
 * `parseProjectFile` already walks every string field of the raw document — including every roster
 * entry's `agent_id`/`username`, `project_id` and `referee` — through `forbiddenContentRule`, which
 * checks the identical predicates `findTokenShapes` would (`matchesAuthorizationLiteral`, and
 * `checkForSecrets`'s own `TELEGRAM_BOT_TOKEN_RE` test): any field failing on the token shape is
 * therefore already what makes `parsed.ok` false, naming that exact field in the problem it returns.
 * A second, field-by-field `findTokenShapes` re-scan run only when `parsed.ok` is `true` could never
 * find a hit — by the time this function would see `ok: true`, every string in the document has
 * already passed the identical check. This reuses that existing, already-redaction-safe result instead
 * of writing unreachable code next to it.
 */
function checkTokenShape(binding: RegistryBinding, text: string): Finding | undefined {
	const parsed = parseProjectFile(text);
	const id = `token-shape-${binding.project_id}`;
	if (parsed.ok) {
		return { id, status: "pass", detail: `project ${binding.project_id}: conmuta.json carries no forbidden token shape` };
	}
	const shapeProblems = parsed.problems.filter(
		(problem): problem is Extract<ProjectFileProblem, { kind: "forbidden_content" }> => problem.kind === "forbidden_content",
	);
	if (shapeProblems.length === 0) {
		// Unparseable for an unrelated reason (bad JSON, an unsupported schema version, a plain shape
		// error): `checkR4`'s "unparseable" disagreement already covers it, so this stays silent rather
		// than reporting a misleading "carries no forbidden shape" pass on a file that never parsed.
		return undefined;
	}
	const fields = shapeProblems.map((problem) => problem.field).join(", ");
	return { id, status: "fail", detail: `project ${binding.project_id}: conmuta.json field(s) match a forbidden shape: ${fields}` };
}

/** One tool-config target's file, read and shape-checked, or `undefined` when nothing is on disk. */
interface ToolConfigRead {
	readonly parseFailed: boolean;
	readonly entry: unknown;
}

function readToolConfigEntry(projectPath: string, target: ToolConfigTarget): ToolConfigRead | undefined {
	const path = resolveToolConfigPath(projectPath, target);
	if (!existsSync(path)) {
		return undefined;
	}
	let parsedDoc: unknown;
	try {
		parsedDoc = adapterFor(target.relativePath).parse(readFileSync(path, "utf8"));
	} catch {
		return { parseFailed: true, entry: undefined };
	}
	return { parseFailed: false, entry: readAtPath(parsedDoc, toolConfigEntryPath(target, MCP_SERVER_NAME)) };
}

/**
 * §7.2 shape + `.mcp.json` readers + Pi duplicates (D-34/D-43), for one bound project.
 *
 * Only reports a per-target finding when something is actually wrong (a file that exists but fails to
 * parse, or whose entry's key set does not match the surface's expected shape) — a "pass" for every
 * one of the 8 targets on every project would be 8×N rows of pure noise. The two informational
 * findings (`.mcp.json` readers, Pi duplicate) are the exception and are always reported when
 * applicable, per the brief.
 *
 * The real launcher `command`/`args` this machine would write are not compared: they depend on this
 * machine's own node/entry paths, which doctor has no independent source of truth for. The shape check
 * is therefore the entry's top-level key set against {@link entryShapeMatches} — a deliberately
 * shallower, disclosed depth than a byte-for-byte comparison.
 */
function checkToolConfigs(binding: RegistryBinding, projectPath: string): Finding[] {
	const findings: Finding[] = [];
	const entries = new Map<ToolId, unknown>();
	let mcpJsonExists = false;

	for (const target of TOOL_CONFIG_TARGETS) {
		const read = readToolConfigEntry(projectPath, target);
		if (read === undefined) {
			continue;
		}
		if (target.id === "claude-code") {
			mcpJsonExists = true;
		}
		const id = `tool-config-${binding.project_id}-${target.id}`;
		if (read.parseFailed) {
			findings.push({ id, status: "fail", detail: `project ${binding.project_id}: ${target.label} config at ${target.relativePath} failed to parse` });
			continue;
		}
		entries.set(target.id, read.entry);
		if (read.entry === undefined) {
			// The file exists but carries no entry for our server name: not this project's problem to
			// report — a project may have an unrelated pre-existing config file for that tool.
			continue;
		}
		if (!entryShapeMatches(target, read.entry)) {
			findings.push({ id, status: "fail", detail: `project ${binding.project_id}: ${target.label} entry at ${target.relativePath} does not match the expected shape` });
		}
	}

	const piEntry = entries.get("pi");
	const mcpJsonEntry = entries.get("claude-code");
	if (piEntry !== undefined && mcpJsonEntry !== undefined && isDeepStrictEqual(piEntry, mcpJsonEntry)) {
		findings.push({
			id: `pi-duplicate-${binding.project_id}`,
			status: "warn",
			detail: `project ${binding.project_id}: .pi/mcp.json duplicates an entry already identical in .mcp.json (D-43) — this write was redundant`,
		});
	}

	if (mcpJsonExists) {
		findings.push({
			id: `mcp-json-readers-${binding.project_id}`,
			status: "pass",
			detail: `project ${binding.project_id}: .mcp.json is also read by ${MCP_JSON_READERS.join(", ")}`,
		});
	}

	return findings;
}

/**
 * D-52 doctor half (design.md §16 risk table): for a bound project that is a git worktree, warns on
 * any existing tool-config file `.gitignore` does not cover.
 *
 * `.git` presence is checked with `existsSync` alone, never followed by `.isDirectory()`: a linked
 * worktree or submodule's `.git` is a FILE (containing `gitdir: ...`), not a directory, and
 * `.isDirectory()` would wrongly report `false` for that real case (Alpha's own review note in the
 * Arena debate this design went through). This makes zero subprocess calls (`git` is never invoked,
 * D-50's exec allow-list stays `{icacls.exe, reg.exe}` only) and never claims a file IS tracked by
 * git — only that it is not covered by `.gitignore`, since actual git-index membership is never
 * checked (disclosed divergence from D-52's own literal doctor-side wording, tasks.md PR-21).
 */
function checkGitignoreCoverage(binding: RegistryBinding, projectPath: string): Finding[] {
	if (!existsSync(join(projectPath, ".git"))) {
		return [];
	}

	const gitignorePath = join(projectPath, GITIGNORE_FILE_NAME);
	const gitignoreText = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";

	const findings: Finding[] = [];
	for (const target of TOOL_CONFIG_TARGETS) {
		if (!existsSync(resolveToolConfigPath(projectPath, target))) {
			continue;
		}
		if (!isGitignoreCovered(gitignoreText, target.relativePath)) {
			findings.push({
				id: `gitignore-coverage-${binding.project_id}-${target.id}`,
				status: "warn",
				detail:
					`project ${binding.project_id}: ${target.relativePath} is not covered by .gitignore in a git ` +
					"repository; may be committed by an unrelated `git add`",
			});
		}
	}
	return findings;
}

/** Every finding for one binding: referential integrity, then (only if its project resolves) R4, the token-shape scan and tool configs. */
function boundProjectFindings(registry: Registry, binding: RegistryBinding): Finding[] {
	const findings: Finding[] = [checkReferentialIntegrity(registry, binding)];

	const project: RegistryProject | undefined = registry.projects.find((candidate) => candidate.project_id === binding.project_id);
	if (project === undefined) {
		// Already reported above as a dangling `project_id`; there is no path on disk to read.
		return findings;
	}

	const projectFilePath = join(project.path, PROJECT_FILE_NAME);
	if (!existsSync(projectFilePath)) {
		findings.push({
			id: `r4-project-${binding.project_id}`,
			status: "fail",
			detail: `project ${binding.project_id}: conmuta.json is missing at ${projectFilePath}`,
		});
	} else {
		const text = readFileSync(projectFilePath, "utf8");
		findings.push(checkR4(binding, text));
		const tokenShape = checkTokenShape(binding, text);
		if (tokenShape !== undefined) {
			findings.push(tokenShape);
		}
	}

	findings.push(...checkToolConfigs(binding, project.path));
	findings.push(...checkGitignoreCoverage(binding, project.path));
	return findings;
}

/**
 * Runs the registry tier (design.md §9.1's "Registry" row) and returns every finding, in a fixed order.
 *
 * `registry.json`'s own path is a bare literal, not a shared exported constant: no other module in
 * this codebase exports one either (`registry/loader.ts`'s own doc notes this same established,
 * disclosed pattern), and `options` carries only `homeDir` to match `runOfflineDoctor`'s seam
 * (`doctor/offline.ts`'s own marked "Seam for PR-15" comment names this exact signature).
 */
export function runRegistryChecks(options: RunRegistryChecksOptions): Finding[] {
	const registryPath = join(options.homeDir, "registry.json");

	// An absent file means `setup` has never run at all — the same "not yet created (run setup)"
	// informational pass `checks/system.ts` already reports for the ledger and home directory in that
	// same situation, not a failure. A genuine read error on a file that DOES exist (permissions,
	// I/O) still reports `registry-parse-unreadable` as a fail.
	if (!existsSync(registryPath)) {
		return [{ id: "registry-parse-unreadable", status: "pass", detail: `${registryPath} not yet created (run setup)` }];
	}

	let text: string;
	try {
		text = readFileSync(registryPath, "utf8");
	} catch {
		return [registryProblemFinding({ kind: "unreadable" })];
	}

	const parsed = parseRegistryText(text);
	if (!parsed.ok) {
		// No valid `Registry` to walk bindings/projects from: every later check needs one, so this tier
		// stops here rather than reporting a misleading "no findings" for a document it never validated.
		return parsed.problems.map(registryProblemFinding);
	}

	const registry = parsed.registry;
	return registry.bindings.flatMap((binding) => boundProjectFindings(registry, binding));
}

export type { Finding };
