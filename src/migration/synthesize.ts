import type { ProjectRosterEntry } from "../shared/project-file.js";
import { computeRosterHash } from "../shared/roster-hash.js";
import type { HistoryEntry, ThreadRecord } from "../shared/thread-record.js";
import type { RegistryBinding, RegistryBindingSettings, RegistryBot, RegistryGroup, RegistryProject, RegistryTokenRef } from "../registry/schema.js";
import type { V1Config, V1RosterEntry } from "./v1-config.js";
import type { V1State, V1ThreadRecord } from "./v1-state.js";

/**
 * Synthesizes the registry fragments, secret-store token target and ledger rows one v1-to-v2
 * migration produces (`migration/synthesize.ts`, design §13 step 5).
 *
 * **Pure by construction.** No `node:fs`, no `node:sqlite`, no network — every input is v1's
 * already-loaded `config`/`state` plus the handful of decisions only an impure caller can make (the
 * migrating `botId`, the `tokenRef` the secret-store probe resolved, the wall-clock `nowIso`, and the
 * optional project assignment). `migration/main.ts` is the impure caller: it loads v1's files, probes
 * the secret store, and turns this function's output into actual writes.
 *
 * **Project assignment is optional input, not an automatic side effect (D-23).** Called without
 * `project` — or with only one of `projectId`/`projectPath` — this function treats the migration as
 * bot/group-only: `projects`, `bindings` and `bindingState` all come back empty, and `threads` comes
 * back empty too, because `threads`/`thread_history` are keyed `(project_id, thread_id)` (design
 * §5.2) and there is no `project_id` to key them under. `offsets` is the one row that is *not*
 * project-scoped (`ledger/schema.ts`'s `offsets` is keyed by `bot_id` alone), so it is always
 * produced. `migration/main.ts`'s own CLI flags are what turn this into the human's explicit choice at
 * invocation time (D-23) — this function only reacts to what it was given.
 *
 * No `Provenance:` header: v1 (`telegram-agent-bus`) has no standalone migration tool at all, so
 * there is nothing to pin against — the same treatment `client/main.ts` and `ledger/open.ts` already
 * document for genuinely new code.
 */

/** The project assignment a migration may opt into (D-23); both fields or neither. */
export interface SynthesizeMigrationProjectInput {
	readonly projectId: string;
	readonly projectPath: string;
}

/** Everything {@link synthesizeMigration} needs, all of it already resolved by the impure caller. */
export interface SynthesizeMigrationInput {
	/** v1's already-loaded, already-validated `config.json`. */
	readonly config: V1Config;
	/** v1's already-loaded, already-validated `state.json` (its `to_user_id` backfill already applied). */
	readonly state: V1State;
	/** `config.roster[config.agent_id].user_id` — the caller already refused a migration where this is absent. */
	readonly botId: number;
	/** Where the migrated token will live, as the secret-store probe (an impure step) already decided. */
	readonly tokenRef: RegistryTokenRef;
	/** The instant every `added_at`/`bound_at`/`updated_at`-shaped field is stamped with. */
	readonly nowIso: string;
	/** The project to bind, when the human opted into one at invocation time (D-23). */
	readonly project?: SynthesizeMigrationProjectInput;
}

/** The `offsets` row this migration produces — always present, since `offsets` is bot-scoped, not project-scoped. */
export interface SynthesizedOffset {
	readonly bot_id: number;
	readonly next_update_id: number;
}

/** One `threads`/`thread_history` row this migration produces, ready for `ledger/threads.ts`'s `writeThreadRecord`. */
export interface SynthesizedThread {
	readonly project_id: string;
	readonly thread_id: string;
	readonly record: ThreadRecord;
}

/** The `binding_state` row this migration produces, present only when a project was assigned. */
export interface SynthesizedBindingState {
	readonly project_id: string;
	readonly last_checkpoint_at: string | null;
	readonly last_checkpoint_by: string | null;
}

/** Everything one migration synthesizes: registry fragments plus the ledger rows they imply. */
export interface SynthesizedMigration {
	/** Always exactly one entry — v1 models exactly one bot per `config.json`. */
	readonly bots: readonly RegistryBot[];
	/** Always exactly one entry — v1 models exactly one group per `config.json`'s `chat_id`. */
	readonly groups: readonly RegistryGroup[];
	/** Exactly one entry when `project` was given, otherwise empty (D-23). */
	readonly projects: readonly RegistryProject[];
	/** Exactly one active entry when `project` was given, otherwise empty (D-23). */
	readonly bindings: readonly RegistryBinding[];
	readonly offset: SynthesizedOffset;
	/** Empty when no project was given — see the module doc for why. */
	readonly threads: readonly SynthesizedThread[];
	/** Present only when `project` was given. */
	readonly bindingState?: SynthesizedBindingState;
}

/** Converts v1's roster (keyed by `agent_id`) into the array shape `conmuta.json`/the registry carry. */
function buildRosterSnapshot(roster: Readonly<Record<string, V1RosterEntry>>): ProjectRosterEntry[] {
	return Object.entries(roster).map(([agentId, entry]) => ({
		agent_id: agentId,
		user_id: entry.user_id,
		username: entry.username,
	}));
}

/**
 * Maps one v1 thread into the `ThreadRecord` shape the ledger stores.
 *
 * Every field is copied explicitly rather than spread, so the one deliberate omission —
 * `first_surfaced_at`, which moved to `client_surfaced` in PR-12 and has no counterpart on
 * `ThreadRecord` — is visible at the call site instead of hiding behind a rest-spread. `to_user_id` is
 * copied as-is and never re-derived here: `loadV1State` (PR-36) already ran the roster backfill.
 */
function toThreadRecord(thread: V1ThreadRecord): ThreadRecord {
	return {
		status: thread.status,
		opened_type: thread.opened_type,
		opened_eid: thread.opened_eid,
		from: thread.from,
		to: thread.to,
		body: thread.body,
		opened_at: thread.opened_at,
		opened_message_id: thread.opened_message_id,
		via: thread.via,
		acked_at: thread.acked_at,
		ack_count: thread.ack_count,
		resolved_at: thread.resolved_at,
		resolved_by: thread.resolved_by,
		basis: thread.basis,
		to_user_id: thread.to_user_id,
		group_message_id: thread.group_message_id,
		closure_delivered: thread.closure_delivered,
		awaiting: thread.awaiting,
		history: thread.history.map((entry): HistoryEntry => ({ ...entry })),
	};
}

export function synthesizeMigration(input: SynthesizeMigrationInput): SynthesizedMigration {
	const { config, state, botId, tokenRef, nowIso, project } = input;

	const bot: RegistryBot = {
		bot_id: botId,
		username: config.bot_username,
		token_ref: tokenRef,
		added_at: nowIso,
	};
	const group: RegistryGroup = {
		group_id: config.chat_id,
		added_at: nowIso,
	};
	const offset: SynthesizedOffset = { bot_id: botId, next_update_id: state.next_update_id };

	if (project === undefined) {
		return { bots: [bot], groups: [group], projects: [], bindings: [], offset, threads: [] };
	}

	const rosterSnapshot = buildRosterSnapshot(config.roster);
	const settings: RegistryBindingSettings = {
		reminder_window_hours: config.reminder_window_hours,
		secret_markers: config.secret_markers,
	};
	const registryProject: RegistryProject = { project_id: project.projectId, path: project.projectPath };
	const binding: RegistryBinding = {
		project_id: project.projectId,
		bot_id: botId,
		group_id: config.chat_id,
		agent_id: config.agent_id,
		status: "active",
		roster_snapshot: rosterSnapshot,
		roster_hash: computeRosterHash(rosterSnapshot),
		settings,
		bound_at: nowIso,
	};
	const threads: SynthesizedThread[] = Object.entries(state.threads).map(([threadId, thread]) => ({
		project_id: project.projectId,
		thread_id: threadId,
		record: toThreadRecord(thread),
	}));
	const bindingState: SynthesizedBindingState = {
		project_id: project.projectId,
		last_checkpoint_at: state.last_checkpoint?.at ?? null,
		last_checkpoint_by: state.last_checkpoint?.by ?? null,
	};

	return {
		bots: [bot],
		groups: [group],
		projects: [registryProject],
		bindings: [binding],
		offset,
		threads,
		bindingState,
	};
}
