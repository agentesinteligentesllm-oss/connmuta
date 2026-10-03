import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { parseRegistryText } from "../../registry/loader.js";
import type { RegistryInvariant } from "../../registry/invariants.js";
import type { RegistryProject } from "../../registry/schema.js";
import type { ProjectRosterEntry } from "../../shared/project-file.js";
import { writeProjectFile, type ProjectFileDisagreement } from "../../shared/project-file-writer.js";
import { computeRosterHash } from "../../shared/roster-hash.js";
import { MCP_SERVER_NAME } from "../constants.js";
import { checkFileEdit, editFile, FileEditRefusal, type EditFileOutcome, type FileEditRefusalReason, type FormatAdapter } from "../file-edit.js";
import { ensureGitignored, type GitignoreCheckResult } from "../gitignore.js";
import { jsoncAdapter } from "../formats/jsonc.js";
import { tomlAdapter } from "../formats/toml.js";
import { writeInstructionFiles, printTrustSteps, printRegistrationGuidance, type InstructionFilesOutcome, type TrustStepIo } from "../instructions.js";
import { buildLauncherEntry } from "../launcher.js";
import { commitRegistryChange, type RegistryCommitOutcome } from "../registry-commit.js";
import { resolveSelectedTargets, resolveToolConfigPath, toolConfigEntryPath, type ToolId } from "../tool-targets.js";

/**
 * The `project bind` wizard (`installer/wizards/project-bind.ts`, spec.md:104-123, design.md §8.2
 * "project bind" row; tasks.md PR-12 sub-task 12.3/12.4).
 *
 * **Order is load-bearing** (spec.md:106-108, :117-121: "MUST reject a selection that would violate
 * R1-R4 before writing anything"): R1-R3 are pre-checked against the current `registry.json` before
 * any write is attempted; only a pass writes/verifies `conmuta.json` (R4, via `writeProjectFile`); only
 * a non-`"refused"` `writeProjectFile` outcome proceeds to `commitRegistryChange`; only a `"committed"`
 * commit proceeds to tool-config writes, instruction files and trust steps.
 *
 * **Interactive selection and roster composition are deferred**, mirroring how `bot-add.ts`/
 * `group-add.ts` already drew this same line for their own inputs: this wizard accepts a pre-resolved
 * `botId`/`groupId`/`agentId` and a pre-resolved `roster: readonly ProjectRosterEntry[]` directly, and
 * never calls `roster-source.ts`'s `composeRoster` itself. Assigning `agent_id`s to raw
 * `RosterCandidate`s, and prompting for the bot/group/tool selection, is UI-layer work for a later
 * CLI-wiring slice — tasks.md 12.3's own RED is framed at the registry/invariant/write level, not the
 * prompt UI.
 */

/** A registry-commit outcome that is not `"committed"`, surfaced rather than swallowed. */
export type ProjectBindRegistryFailure = Exclude<RegistryCommitOutcome, { readonly outcome: "committed" }>;

/** What {@link runProjectBind} decided. */
export type ProjectBindOutcome =
	| {
			readonly outcome: "bound";
			readonly project_id: string;
			readonly toolConfigResults: ReadonlyMap<ToolId, EditFileOutcome>;
			readonly gitignoreResults: ReadonlyMap<ToolId, GitignoreCheckResult>;
			readonly instructionFiles: InstructionFilesOutcome;
	  }
	| { readonly outcome: "invariant-violated"; readonly invariant: RegistryInvariant }
	| { readonly outcome: "project-file-refused"; readonly disagreements: readonly ProjectFileDisagreement[] }
	| { readonly outcome: "registry-commit-failed"; readonly detail: ProjectBindRegistryFailure }
	| {
			readonly outcome: "tool-config-refused";
			readonly toolId: ToolId;
			readonly path: string;
			readonly reason: FileEditRefusalReason;
			readonly message: string;
	  };

/** What {@link runProjectBind} needs. */
export interface RunProjectBindOptions {
	/** The open ledger connection `commitRegistryChange` writes through. */
	readonly db: DatabaseSync;
	/** Absolute path of `registry.json`. */
	readonly registryPath: string;
	/** Absolute, existing project directory (`conmuta.json` is written directly under it). */
	readonly targetDir: string;
	/** The selected bot's `bot_id`. */
	readonly botId: number;
	/** The selected group's `group_id`; negative, per Telegram's own supergroup convention. */
	readonly groupId: number;
	/** The selected `agent_id`; must resolve in `roster` to `user_id === botId` (R3). */
	readonly agentId: string;
	/** The already-resolved roster this binding commits (see module doc: composition is deferred). */
	readonly roster: readonly ProjectRosterEntry[];
	/** Tool ids to write a config entry for (design §7, §8.2). */
	readonly selectedToolIds: ReadonlySet<ToolId>;
	/** Overridable for tests; defaults to `() => new Date()`. */
	readonly now?: () => Date;
	/** Overridable for tests; defaults to the real `console.log` (see `instructions.ts`). */
	readonly trustStepIo?: TrustStepIo;
}

/** Maximum total length `PROJECT_ID_PATTERN` (`shared/constants.ts`) allows: one leading char plus 2-40 more. */
const PROJECT_ID_MAX_LENGTH = 41;
/** Minimum total length `PROJECT_ID_PATTERN` allows. */
const PROJECT_ID_MIN_LENGTH = 3;
/** Fallback slug when a directory's basename yields nothing `PROJECT_ID_PATTERN` accepts. */
const PROJECT_ID_FALLBACK = "project";
/** Bounds {@link resolveProjectId}'s suffix search; a real collision run this long is not realistic. */
const PROJECT_ID_SUFFIX_ATTEMPTS = 1000;

/**
 * Slugifies `name` into a `PROJECT_ID_PATTERN`-shaped candidate: lowercased, non-`[a-z0-9-]` runs
 * collapsed to one `-`, trimmed of leading/trailing `-`, and bounded to the pattern's length. Falls
 * back to {@link PROJECT_ID_FALLBACK} when nothing usable survives (e.g. an all-symbol directory name).
 *
 * Disclosed implementation choice (no existing helper derives a `project_id` from a path): the spec
 * only constrains the stored shape, not how one is picked for a fresh directory.
 */
function slugify(name: string): string {
	const collapsed = name
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "")
		.slice(0, PROJECT_ID_MAX_LENGTH);
	return collapsed.length >= PROJECT_ID_MIN_LENGTH && /^[a-z0-9]/.test(collapsed) ? collapsed : PROJECT_ID_FALLBACK;
}

/** What {@link resolveProjectId} decided. */
interface ProjectIdResolution {
	readonly projectId: string;
	readonly isNewProject: boolean;
}

/**
 * Resolves `targetDir`'s `project_id`: reuses an existing `RegistryProject` entry for the exact same
 * `path` (idempotent re-run), or derives a fresh slug from the basename, disambiguated with a numeric
 * suffix against any `project_id` already taken by a *different* path.
 *
 * **Correction (native review `review-796e150183e289f6`, R2-001 / R3-project-id-suffix-infinite-loop,
 * both CRITICAL).** The suffix loop used to build `${base}-${suffix}` first and truncate to
 * {@link PROJECT_ID_MAX_LENGTH} afterward. When `base` was already exactly at that length, every
 * truncated candidate collapsed back to `base` itself — already `taken` by definition, since that is
 * why the loop started — so the unbounded `for (;;)` never terminated: `project bind` would hang.
 * Reserving the suffix's own width *before* truncating the base guarantees each candidate actually
 * differs from `base`, and the loop is now bounded by {@link PROJECT_ID_SUFFIX_ATTEMPTS} regardless.
 */
function resolveProjectId(targetDir: string, existingProjects: readonly RegistryProject[]): ProjectIdResolution {
	const existing = existingProjects.find((project) => project.path === targetDir);
	if (existing !== undefined) {
		return { projectId: existing.project_id, isNewProject: false };
	}

	const taken = new Set(existingProjects.map((project) => project.project_id));
	const base = slugify(basename(targetDir));
	if (!taken.has(base)) {
		return { projectId: base, isNewProject: true };
	}
	for (let suffix = 2; suffix < 2 + PROJECT_ID_SUFFIX_ATTEMPTS; suffix++) {
		const suffixText = `-${suffix}`;
		const candidate = `${base.slice(0, PROJECT_ID_MAX_LENGTH - suffixText.length)}${suffixText}`;
		if (!taken.has(candidate)) {
			return { projectId: candidate, isNewProject: true };
		}
	}
	throw new Error(`installer/wizards/project-bind.ts: could not derive a free project_id from "${base}" after ${PROJECT_ID_SUFFIX_ATTEMPTS} attempts`);
}

/** Reads the entry already installed at `mcpServers.<MCP_SERVER_NAME>` in the target's `.mcp.json`, for the D-43 Pi dedup rule. */
function readExistingMcpJsonEntry(targetDir: string): unknown {
	const mcpJsonPath = join(targetDir, ".mcp.json");
	if (!existsSync(mcpJsonPath)) {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = jsoncAdapter.parse(readFileSync(mcpJsonPath, "utf8"));
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) {
		return undefined;
	}
	const mcpServers = (parsed as Record<string, unknown>)["mcpServers"];
	if (typeof mcpServers !== "object" || mcpServers === null) {
		return undefined;
	}
	return (mcpServers as Record<string, unknown>)[MCP_SERVER_NAME];
}

/** The `FormatAdapter` for one tool-config target, chosen by extension (`tool-targets.ts` carries no adapter field itself). */
function adapterFor(relativePath: string): FormatAdapter {
	return relativePath.endsWith(".toml") ? tomlAdapter : jsoncAdapter;
}

/** Runs `project bind <path>` (spec.md:104-123): R1-R3 pre-check, `conmuta.json` (R4), registry commit, then tool configs. */
export async function runProjectBind(options: RunProjectBindOptions): Promise<ProjectBindOutcome> {
	const currentText = readFileSync(options.registryPath, "utf8");
	const parsed = parseRegistryText(currentText);
	if (!parsed.ok) {
		return { outcome: "registry-commit-failed", detail: { outcome: "current-invalid", problems: parsed.problems } };
	}
	const { registry } = parsed;
	const activeBindings = registry.bindings.filter((binding) => binding.status === "active");

	if (activeBindings.some((binding) => binding.bot_id === options.botId)) {
		return { outcome: "invariant-violated", invariant: "R1" };
	}

	const { projectId, isNewProject } = resolveProjectId(options.targetDir, registry.projects);

	// R2 (DATA-MODEL §2.5): at most one active binding per `group_id` *and* per `project_id`,
	// independently — the same reading `registry/invariants.ts` enforces post-write. A `project_id`
	// already active under a *different* binding is refused here too, per design.md:170's disclosed
	// divergence ("no `unbind` verb in F2"): re-binding an already-bound project is simply refused.
	if (activeBindings.some((binding) => binding.group_id === options.groupId || binding.project_id === projectId)) {
		return { outcome: "invariant-violated", invariant: "R2" };
	}

	const rosterEntry = options.roster.find((entry) => entry.agent_id === options.agentId);
	if (rosterEntry === undefined || rosterEntry.user_id !== options.botId) {
		return { outcome: "invariant-violated", invariant: "R3" };
	}

	const launcher = buildLauncherEntry();
	const existingSharedMcpJsonEntry = readExistingMcpJsonEntry(options.targetDir);
	const targets = resolveSelectedTargets(options.selectedToolIds, launcher, existingSharedMcpJsonEntry);

	// Pre-validate all selected tool-config merges before writing anything (B-111, ADR-0035).
	// A conflict, parse-error, or symlink refusal must be caught here so that neither conmuta.json
	// nor the registry binding is committed, preventing a dead end under bijective invariants R1/R2.
	for (const target of targets) {
		const targetPath = resolveToolConfigPath(options.targetDir, target);
		const adapter = adapterFor(target.relativePath);
		const entryPath = toolConfigEntryPath(target, MCP_SERVER_NAME);
		const entry = target.buildEntry(launcher);
		try {
			checkFileEdit({ path: targetPath, adapter, entryPath, entry });
		} catch (error) {
			if (error instanceof FileEditRefusal) {
				return {
					outcome: "tool-config-refused",
					toolId: target.id,
					path: targetPath,
					reason: error.reason,
					message: error.message,
				};
			}
			throw error;
		}
	}

	const writeResult = writeProjectFile({
		path: join(options.targetDir, "conmuta.json"),
		intended: { project_id: projectId, group_id: options.groupId, roster: options.roster },
	});
	if (writeResult.outcome === "refused") {
		return { outcome: "project-file-refused", disagreements: writeResult.disagreements };
	}

	const now = (options.now?.() ?? new Date()).toISOString();
	const rosterHash = computeRosterHash(options.roster);

	const commit = commitRegistryChange({
		db: options.db,
		registryPath: options.registryPath,
		audit: {
			ts: now,
			project_id: projectId,
			bot_id: options.botId,
			chat_id: null,
			eid: null,
			envelope_type: null,
			from_user_id: null,
			to_user_id: null,
			reason: "PROJECT_BOUND",
		},
		mutate: (current) => ({
			...current,
			projects: isNewProject ? [...current.projects, { project_id: projectId, path: options.targetDir }] : current.projects,
			bindings: [
				...current.bindings,
				{
					project_id: projectId,
					bot_id: options.botId,
					group_id: options.groupId,
					agent_id: options.agentId,
					status: "active",
					roster_snapshot: options.roster,
					roster_hash: rosterHash,
					bound_at: now,
				},
			],
		}),
	});
	if (commit.outcome !== "committed") {
		return { outcome: "registry-commit-failed", detail: commit as ProjectBindRegistryFailure };
	}

	const toolConfigResults = new Map<ToolId, EditFileOutcome>();
	const gitignoreResults = new Map<ToolId, GitignoreCheckResult>();
	for (const target of targets) {
		// `editFile` either returns (all three outcomes mean the file exists at this path now) or
		// throws a `FileEditRefusal`, which is not caught here and propagates out of this whole
		// function — the existing, pre-D-52 behavior this PR does not change. A gitignore check is
		// therefore only ever reached for a target whose write genuinely succeeded.
		//
		// `ensureGitignored` itself never throws (native review review-dab29630c76690a2,
		// R4-ensureGitignored-unguarded-throw-partial-bind): unlike `editFile`'s load-bearing write,
		// `.gitignore` coverage is best-effort hygiene, so a read/write failure there is caught inside
		// `ensureGitignored` and reported via the `failed` result variant instead of aborting the rest
		// of this loop — a target's own tool-config write already succeeded by the time it runs.
		const outcome = editFile({
			path: resolveToolConfigPath(options.targetDir, target),
			adapter: adapterFor(target.relativePath),
			entryPath: toolConfigEntryPath(target, MCP_SERVER_NAME),
			entry: target.buildEntry(launcher),
		});
		toolConfigResults.set(target.id, outcome);
		gitignoreResults.set(target.id, ensureGitignored(options.targetDir, target.relativePath));
	}

	const instructionFiles = writeInstructionFiles(options.targetDir);
	printTrustSteps([...options.selectedToolIds], options.trustStepIo);
	printRegistrationGuidance(options.trustStepIo);

	return { outcome: "bound", project_id: projectId, toolConfigResults, gitignoreResults, instructionFiles };
}
