import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { commitRegistryChange } from "../installer/registry-commit.js";
import type { Prompter } from "../installer/prompter.js";
import { parseRegistryText } from "../registry/loader.js";
import type { RegistryBinding } from "../registry/schema.js";
import { EXIT_UNBOUND_PROJECT, EXIT_VALIDATION_FAILED, PRODUCT_NAME, PROJECT_FILE_NAME } from "../shared/constants.js";
import { parseProjectFile, type ProjectRosterEntry } from "../shared/project-file.js";
import { computeRosterHash } from "../shared/roster-hash.js";
import { validateText } from "./validate.js";

/**
 * `conmuta project sync-roster [path]` (roster-sync spec.md, design.md §"Roster sync commits through
 * `commitRegistryChange`"): the sole, human-triggered path that resolves the daemon's `roster_drift`
 * condition (F1 PR-31, D-07). Never called by the panel or by a heartbeat tick — see
 * `test/daemon/bootstrap.test.ts`'s own PR-07 scenario, which pins that the daemon never reaches this
 * module.
 */

export interface SyncRosterIo {
	readonly out: (line: string) => void;
	readonly err: (line: string) => void;
}

/** What {@link runSyncRosterCommand} needs. */
export interface RunSyncRosterOptions {
	/** The open ledger connection `commitRegistryChange` writes through. */
	readonly db: DatabaseSync;
	/** Absolute path of `registry.json`. */
	readonly registryPath: string;
	/** Absolute project directory whose `conmuta.json` this call reads. */
	readonly targetDir: string;
	/** The wizard's sole prompting port (D-38); never `@clack/prompts` directly. */
	readonly prompter: Prompter;
	readonly io?: SyncRosterIo;
	/** Overridable for tests; defaults to `() => new Date()`. */
	readonly now?: () => Date;
	/** Overridable for tests; defaults to real `node:fs` `readFileSync`. */
	readonly readProjectFile?: (path: string) => string;
}

export interface RunSyncRosterResult {
	readonly exitCode: number;
	readonly message?: string;
}

const DEFAULT_IO: SyncRosterIo = {
	out: (line) => process.stdout.write(`${line}\n`),
	err: (line) => process.stderr.write(`${line}\n`),
};

/** One roster entry's identity for diffing: an entry that changes any field is reported as remove+add. */
function rosterEntryKey(entry: ProjectRosterEntry): string {
	return `${entry.agent_id}:${entry.user_id}:${entry.username}`;
}

/** Renders an added/removed roster-entry diff, removals before additions. */
function renderRosterDiff(previous: readonly ProjectRosterEntry[], next: readonly ProjectRosterEntry[]): string[] {
	const previousKeys = new Set(previous.map(rosterEntryKey));
	const nextKeys = new Set(next.map(rosterEntryKey));
	const lines: string[] = [];
	for (const entry of previous) {
		if (!nextKeys.has(rosterEntryKey(entry))) {
			lines.push(`  - ${entry.agent_id} (${entry.user_id}, ${entry.username})`);
		}
	}
	for (const entry of next) {
		if (!previousKeys.has(rosterEntryKey(entry))) {
			lines.push(`  + ${entry.agent_id} (${entry.user_id}, ${entry.username})`);
		}
	}
	return lines;
}

/**
 * Runs `project sync-roster [path]` (roster-sync spec.md): reads `conmuta.json`, refuses on a missing
 * binding or an invalid file, and otherwise compares the recomputed `roster_hash` against the bound
 * registry's stored one. No drift makes no write. A real difference is displayed and, only on operator
 * confirmation, committed atomically with a `ROSTER_SYNCED` audit row through `commitRegistryChange`
 * (R6). A decline or a cancelled prompt makes neither a write nor an audit row.
 */
export async function runSyncRosterCommand(options: RunSyncRosterOptions): Promise<RunSyncRosterResult> {
	const io = options.io ?? DEFAULT_IO;
	const projectFilePath = join(options.targetDir, PROJECT_FILE_NAME);
	const readProjectFile = options.readProjectFile ?? ((path) => readFileSync(path, "utf8"));

	let text: string;
	try {
		text = readProjectFile(projectFilePath);
	} catch {
		io.err(`${PRODUCT_NAME}: cannot read ${projectFilePath}`);
		return { exitCode: EXIT_VALIDATION_FAILED, message: "cannot read project file" };
	}

	const parsedFile = parseProjectFile(text);
	if (!parsedFile.ok) {
		// Reuses `validate.ts`'s own message formatting (PT-05/PT-06), so a refusal here reads exactly
		// like `conmuta validate <path>` would report it: one place decides the wording.
		const validated = validateText(text, projectFilePath);
		for (const line of validated.err) {
			io.err(line);
		}
		return { exitCode: validated.exitCode, message: "project file failed validation" };
	}

	let registryText: string;
	try {
		registryText = readFileSync(options.registryPath, "utf8");
	} catch {
		io.err(`${PRODUCT_NAME}: ${options.targetDir} has no active binding in registry.json`);
		return { exitCode: EXIT_UNBOUND_PROJECT, message: "unbound project" };
	}

	const registryParsed = parseRegistryText(registryText);
	if (!registryParsed.ok) {
		io.err(`${PRODUCT_NAME}: registry.json is not currently valid; fix it before sync-roster`);
		return { exitCode: 1, message: "registry invalid" };
	}
	const { registry } = registryParsed;

	const project = registry.projects.find((candidate) => candidate.path === options.targetDir);
	const binding: RegistryBinding | undefined =
		project === undefined
			? undefined
			: registry.bindings.find((candidate) => candidate.project_id === project.project_id && candidate.status === "active");
	if (project === undefined || binding === undefined) {
		io.err(`${PRODUCT_NAME}: ${options.targetDir} has no active binding in registry.json`);
		return { exitCode: EXIT_UNBOUND_PROJECT, message: "unbound project" };
	}

	const nextRoster = parsedFile.file.roster;
	const nextRosterHash = computeRosterHash(nextRoster);
	if (nextRosterHash === binding.roster_hash) {
		io.out(`${PRODUCT_NAME}: roster already in sync for ${project.project_id}`);
		return { exitCode: 0, message: "no drift" };
	}

	io.out(`${PRODUCT_NAME}: roster drift detected for ${project.project_id}:`);
	for (const line of renderRosterDiff(binding.roster_snapshot, nextRoster)) {
		io.out(line);
	}

	const answer = await options.prompter.confirm({ message: "Commit this roster change?", initialValue: false });
	if (options.prompter.isCancel(answer) || answer !== true) {
		io.err(`${PRODUCT_NAME}: sync-roster cancelled, no change committed`);
		return { exitCode: 1, message: "cancelled" };
	}

	const now = (options.now?.() ?? new Date()).toISOString();
	const commit = commitRegistryChange({
		db: options.db,
		registryPath: options.registryPath,
		audit: {
			ts: now,
			project_id: project.project_id,
			bot_id: binding.bot_id,
			chat_id: null,
			eid: null,
			envelope_type: null,
			from_user_id: null,
			to_user_id: null,
			reason: "ROSTER_SYNCED",
		},
		mutate: (current) => ({
			...current,
			bindings: current.bindings.map((candidate) =>
				candidate.project_id === project.project_id && candidate.status === "active"
					? { ...candidate, roster_snapshot: nextRoster, roster_hash: nextRosterHash }
					: candidate,
			),
		}),
	});

	if (commit.outcome !== "committed") {
		io.err(`${PRODUCT_NAME}: registry commit failed (${commit.outcome})`);
		return { exitCode: 1, message: "registry commit failed" };
	}

	io.out(`${PRODUCT_NAME}: roster synced for ${project.project_id}`);
	return { exitCode: 0, message: "roster synced" };
}
