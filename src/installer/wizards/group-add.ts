import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import { parseRegistryText } from "../../registry/loader.js";
import { commitRegistryChange, type RegistryCommitOutcome } from "../registry-commit.js";

/**
 * The `group add` wizard (`installer/wizards/group-add.ts`, spec.md:85-102, DATA-MODEL §2.5 R2;
 * tasks.md PR-11 sub-task 11.4/11.5).
 *
 * No network call and no secret, so this wizard is synchronous, unlike `bot-add.ts`.
 *
 * **The refusal check reads `registry.json` itself, before ever calling `commitRegistryChange`.**
 * `commitRegistryChange`'s own `mutate` callback receives the already-validated current registry but
 * has no way to signal a refusal — its type is `(current: Registry) => Registry`, not a verdict — so
 * a `group_id` already bound by an active binding is checked here first, against the same
 * `parseRegistryText` the daemon's loader and `commitRegistryChange` itself use, and refused before any
 * transaction is even attempted (spec.md:96-100: "refuses ... before any registry write", read
 * literally). A file that does not itself parse is not refused here: this check only ever *adds* a
 * refusal on top of what `commitRegistryChange` already reports, so an unparseable `registry.json`
 * falls through to that call and comes back as its own `"current-invalid"` outcome instead of a second,
 * competing report of the same problem.
 */

/** A registry-commit outcome that is not `"committed"`, surfaced rather than swallowed. */
export type GroupAddRegistryFailure = Exclude<RegistryCommitOutcome, { readonly outcome: "committed" }>;

/** What {@link runGroupAdd} decided. */
export type GroupAddOutcome =
	| { readonly outcome: "added"; readonly group_id: number }
	| { readonly outcome: "group-already-bound" }
	| { readonly outcome: "registry-commit-failed"; readonly detail: GroupAddRegistryFailure };

/** What {@link runGroupAdd} needs. */
export interface RunGroupAddOptions {
	/** The open ledger connection `commitRegistryChange` writes through. */
	readonly db: DatabaseSync;
	/** Absolute path of `registry.json`. */
	readonly registryPath: string;
	/** The group's numeric id; negative, per Telegram's own supergroup convention. */
	readonly groupId: number;
	/** The display title `registry.groups` records alongside the id. */
	readonly title?: string;
	/** Overridable for tests; defaults to `() => new Date()`. */
	readonly now?: () => Date;
}

/** Runs `group add` (spec.md:85-102): refuses an already-bound `group_id`, else records the group. */
export function runGroupAdd(options: RunGroupAddOptions): GroupAddOutcome {
	const currentText = readFileSync(options.registryPath, "utf8");
	const parsed = parseRegistryText(currentText);
	if (parsed.ok && parsed.registry.bindings.some((binding) => binding.group_id === options.groupId && binding.status === "active")) {
		return { outcome: "group-already-bound" };
	}

	const now = (options.now?.() ?? new Date()).toISOString();
	const commit = commitRegistryChange({
		db: options.db,
		registryPath: options.registryPath,
		audit: {
			ts: now,
			project_id: null,
			bot_id: null,
			chat_id: null,
			// See `wizards/bot-add.ts`'s identical note: an installer action, not a bus envelope, so
			// neither field has a value of its own to carry.
			eid: null,
			envelope_type: null,
			from_user_id: null,
			to_user_id: null,
			reason: "GROUP_ADDED",
		},
		mutate: (current) => ({
			...current,
			groups: [...current.groups, { group_id: options.groupId, title: options.title, added_at: now }],
		}),
	});

	if (commit.outcome !== "committed") {
		return { outcome: "registry-commit-failed", detail: commit as GroupAddRegistryFailure };
	}
	return { outcome: "added", group_id: options.groupId };
}
