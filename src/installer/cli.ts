import type { BotAddOutcome } from "./wizards/bot-add.js";
import type { GroupAddOutcome } from "./wizards/group-add.js";
import type { ProjectBindOutcome } from "./wizards/project-bind.js";
import type { SetupOutcome } from "./wizards/setup.js";

/**
 * The installer's verb dispatcher (`installer/cli.ts`, design.md §8, §8.1; tasks.md PR-12 sub-task
 * 12.5): parses `setup | bot add | group add | project bind <path>` and dispatches to the matching
 * wizard, reporting an unknown verb or a malformed invocation without calling any wizard.
 *
 * **Not** the real top-level `src/cli/main.ts` entry point (that is PR-13's own separate slice, D-39/
 * D-48) — this module owns no Node-floor gate and no flag parsing beyond verb recognition. It is
 * handed already-built wizard runners rather than building `Prompter`/ledger/registry-path context
 * itself: production wiring (`cli/main.ts`) closes each runner over the real context before calling
 * {@link runInstallerCli}; a test injects fakes directly, matching the wizards' own already-tested
 * behavior being out of scope for this dispatcher's own suite.
 */

/** The already-built wizard runners this dispatcher calls into; never invoked for an unmatched verb. */
export interface InstallerCliDeps {
	readonly setup: () => Promise<SetupOutcome>;
	readonly botAdd: () => Promise<BotAddOutcome>;
	readonly groupAdd: () => Promise<GroupAddOutcome>;
	readonly projectBind: (targetDir: string) => Promise<ProjectBindOutcome>;
}

/** Why {@link runInstallerCli} refused, without calling any wizard. */
export type InstallerCliRefusalReason = "unknown-verb" | "missing-path";

/** What {@link runInstallerCli} decided. */
export type InstallerCliOutcome =
	| { readonly outcome: "setup"; readonly result: SetupOutcome }
	| { readonly outcome: "bot-add"; readonly result: BotAddOutcome }
	| { readonly outcome: "group-add"; readonly result: GroupAddOutcome }
	| { readonly outcome: "project-bind"; readonly result: ProjectBindOutcome }
	| { readonly outcome: "refused"; readonly reason: InstallerCliRefusalReason; readonly argv: readonly string[] };

/**
 * Dispatches `argv` to the matching wizard runner in `deps`, or refuses.
 *
 * A strict, no-fallthrough conditional chain: every branch either returns a wizard's own outcome or
 * returns `"refused"` directly, so an unmatched verb or a `project bind` with no path is provably never
 * followed by a wizard call.
 */
export async function runInstallerCli(argv: readonly string[], deps: InstallerCliDeps): Promise<InstallerCliOutcome> {
	const [verb, sub, ...rest] = argv;

	if (verb === "setup" && sub === undefined) {
		return { outcome: "setup", result: await deps.setup() };
	}
	if (verb === "bot" && sub === "add") {
		return { outcome: "bot-add", result: await deps.botAdd() };
	}
	if (verb === "group" && sub === "add") {
		return { outcome: "group-add", result: await deps.groupAdd() };
	}
	if (verb === "project" && sub === "bind") {
		const [targetDir] = rest;
		if (targetDir === undefined || targetDir.length === 0) {
			return { outcome: "refused", reason: "missing-path", argv };
		}
		return { outcome: "project-bind", result: await deps.projectBind(targetDir) };
	}
	return { outcome: "refused", reason: "unknown-verb", argv };
}
