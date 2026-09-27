import type { DatabaseSync } from "node:sqlite";

import type { ProjectRosterEntry } from "../shared/project-file.js";

/**
 * Roster candidate composition for `project bind` (`installer/roster-source.ts`, design.md §8.2,
 * disclosed divergence at design.md:170; tasks.md PR-11).
 *
 * `project bind` (a later PR) needs a list of humans it can offer a project's roster from. This
 * module builds that list from three sources and does nothing else: an existing project's committed
 * roster (already-assigned `agent_id`s), a human's manual entries for this session, and the bot's own
 * `unknown_senders` rows — strangers the bot has actually seen, with no `agent_id` yet, because
 * assigning one is a human decision `project bind`'s own wizard makes, not this module's.
 *
 * **Read-only, structurally.** This module is handed a `DatabaseSync` and never runs anything but a
 * single `SELECT` against it — there is no write statement anywhere in this file, so nothing here can
 * mutate `unknown_senders` even by accident.
 *
 * **Merge priority, most authoritative first.** `existingRoster` (a committed `conmuta.json`'s roster,
 * already carrying assigned `agent_id`s) wins over `manualEntries` (a human's deliberate choice this
 * session), which wins over an `unknown_senders`-derived candidate (the least certain of the three,
 * with no `agent_id` at all). The dedup key is `user_id` (I-4, the identity anchor) — never
 * `username`, which is display-only and can change.
 */

/** One roster candidate `project bind` can offer a human, before an `agent_id` is assigned to it. */
export interface RosterCandidate {
	readonly user_id: number;
	readonly username: string;
	readonly agent_id?: string;
	readonly source: "existing_roster" | "manual" | "unknown_sender";
}

/** What {@link composeRoster} needs. */
export interface ComposeRosterOptions {
	/** The open ledger connection; this module only ever reads from it. */
	readonly db: DatabaseSync;
	/** The bot whose `unknown_senders` rows are read. */
	readonly botId: number;
	/** An existing project's roster, when `conmuta.json` already exists for the project being bound. */
	readonly existingRoster?: readonly ProjectRosterEntry[];
	/** Entries a human added by hand this session; `project bind`'s own wizard supplies these. */
	readonly manualEntries?: readonly ProjectRosterEntry[];
}

/** One `unknown_senders` row, as this module's own read-only `SELECT` returns it. */
interface UnknownSenderRow {
	readonly user_id: number;
	readonly username: string | null;
}

/**
 * Composes the roster candidate list, deduplicated by `user_id` in priority order: `existingRoster`,
 * then `manualEntries`, then the bot's own `unknown_senders` rows (`ledger/schema.ts`).
 */
export function composeRoster(options: ComposeRosterOptions): readonly RosterCandidate[] {
	const seen = new Set<number>();
	const candidates: RosterCandidate[] = [];

	for (const entry of options.existingRoster ?? []) {
		addCandidate(candidates, seen, {
			user_id: entry.user_id,
			username: entry.username,
			agent_id: entry.agent_id,
			source: "existing_roster",
		});
	}
	for (const entry of options.manualEntries ?? []) {
		addCandidate(candidates, seen, {
			user_id: entry.user_id,
			username: entry.username,
			agent_id: entry.agent_id,
			source: "manual",
		});
	}
	for (const row of readUnknownSenders(options.db, options.botId)) {
		addCandidate(candidates, seen, { user_id: row.user_id, username: row.username ?? "", source: "unknown_sender" });
	}

	return candidates;
}

/** Appends `candidate` unless its `user_id` was already claimed by a higher-priority source. */
function addCandidate(candidates: RosterCandidate[], seen: Set<number>, candidate: RosterCandidate): void {
	if (seen.has(candidate.user_id)) {
		return;
	}
	seen.add(candidate.user_id);
	candidates.push(candidate);
}

/** The bot's pending unknown senders (`ledger/unknown-senders.ts`'s table), read-only. */
function readUnknownSenders(db: DatabaseSync, botId: number): readonly UnknownSenderRow[] {
	return db.prepare("SELECT user_id, username FROM unknown_senders WHERE bot_id = ?").all(botId) as unknown as UnknownSenderRow[];
}
