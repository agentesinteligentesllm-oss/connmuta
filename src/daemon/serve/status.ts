/**
 * Provenance: telegram-agent-bus src/tools/status.ts @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 7745b6eb6d0d8002193b2a4202e8dd8764f2d9179aa117c11b0a63a22e39a841
 *   (SHA-256 of the frozen v1 file's whole body — its lines 1-162, LF-normalized, including line
 *    162's terminating newline. Reproduce with `node -e "…"` over the frozen checkout, following the
 *    same method `daemon/serve/fetch.ts`'s header documents and validates against its own pinned
 *    value.)
 * Changes: (1) `state.json`'s single global cursor becomes per-client and per-project ledger reads:
 * `cursor.next_update_id` is this session's `client_cursors.inbox_seq` (`ledger/cursors.ts`, PR-12) —
 * `0` for a session with no row, which this module never creates (a status call is a pure read, so it
 * calls {@link readClientCursor} and never {@link ensureClientCursor}) — and `last_fetch_at` is that
 * same row's `last_seen_at`; (2) adds daemon uptime, last poll per bot (from `offsets`, scoped to the
 * binding's own bot — deliberately, so a session never learns another project's bot, invariant 1),
 * binding identity (`project_id`, `bot_id`, `group_id`, `agent_id`, `roster_hash`), the active
 * secret-store kind, and `daemon_conditions.ledger_quarantined` read from the conditions table
 * (design §5.1: the ledger file itself failed to open, so it is not any one project's condition) —
 * none of which existed in a single-process v1 bridge; (3) `retention_warning` is re-scoped exactly
 * like `daemon/serve/fetch.ts`'s `gap_warning` (design §8.4): raised from `offsets.last_poll_ok_at`
 * for the binding's bot rather than this client's own `last_fetch_at`/`hours_since_last_fetch`,
 * because the Bot API retention window is lost when the DAEMON stops polling, not when one client
 * stops fetching — the field keeps its v1 name and shape (`hours_since_last_fetch`, `hours_remaining`,
 * `retention_hours`) even though what feeds it changed; (4) `open_threads`' tiering reads the
 * per-client `client_surfaced` set (`ledger/cursors.ts`, PR-12) in place of a record-global
 * `first_surfaced_at`; (5) this module makes no Telegram call and imports neither `daemon/telegram.ts`
 * nor `daemon/transport/*` — v1's own doc already stated its dependencies "deliberately do NOT
 * include a TelegramClient at all"; here that is also a property of the daemon's import graph
 * (`thin-client-tools › status and thread are local, no-network reads`), pinned by grepping this
 * file's own import specifiers, the same way `daemon/serve/fetch.ts` pins D-26.
 */

import type { DatabaseSync } from "node:sqlite";

import {
	BOT_API_RETENTION_HOURS,
	FLOOR_NEW,
	FLOOR_REMINDER,
	MAX_SURFACED_THREADS,
	PROTOCOL_SENTINEL,
	RETENTION_WARNING_HOURS,
} from "../../shared/constants.js";
import type { ProjectRosterEntry } from "../../shared/project-file.js";
import { computeAgeHours, isReminderDue, selectTiered, type Tiers } from "../../shared/protocol-select.js";
import type { ThreadRecord } from "../../shared/thread-record.js";
import type { Conditions } from "../../shared/tool-output.js";
import { SERVER_VERSION } from "../../shared/version.js";
import { readClientCursor, readSurfacedThreads } from "../../ledger/cursors.js";
import { DAEMON_CONDITION_SCOPE, readCondition, readProjectConditions } from "../../ledger/conditions-store.js";
import { readThreadRecord } from "../../ledger/threads.js";
import type { SecretStore } from "../../secret-store/types.js";

/**
 * The milliseconds in one second.
 *
 * {@link StatusDaemonFacts.started_at} is ISO 8601 and {@link StatusToolOutput.daemon}'s
 * `uptime_seconds` is reported in whole seconds, so this is the one conversion this module performs.
 */
const MS_PER_SECOND = 1000;

/** The binding fields {@link serveStatus} reads, and no others (design §12 row "daemon/serve/status.ts"). */
export interface StatusServeBinding {
	readonly project_id: string;
	readonly bot_id: number;
	readonly group_id: number;
	readonly agent_id: string;
	readonly bot_username: string;
	readonly roster_snapshot: readonly ProjectRosterEntry[];
	readonly roster_hash: string;
	readonly reminder_window_hours: number;
}

/** Daemon-level facts {@link serveStatus} surfaces that no ledger row carries; supplied by the caller. */
export interface StatusDaemonFacts {
	readonly pid: number;
	readonly started_at: string;
	readonly secret_store_kind: SecretStore["kind"];
}

/** What {@link serveStatus} needs. */
export interface ServeStatusDeps {
	readonly db: DatabaseSync;
	readonly binding: StatusServeBinding;
	/** The calling client session, as the IPC handshake (PR-30) hands it over. */
	readonly session: { readonly client_id: string };
	readonly daemon: StatusDaemonFacts;
	readonly now?: () => Date;
}

export interface StatusRosterEntry {
	readonly agent_id: string;
	readonly username: string;
}

/** One open thread as `status` reports it — a summary line, never the body (that is `fetch`'s job). */
export interface OpenThreadEntry {
	readonly thread: string;
	readonly direction: "inbound" | "outbound";
	readonly peer: string;
	readonly age_hours: number;
	readonly acked: boolean;
}

/** The binding bot's own `offsets` row, or `null` when it has never polled. */
export interface StatusPollerEntry {
	readonly bot_id: number;
	readonly next_update_id: number;
	readonly last_poll_started_at: string | null;
	readonly last_poll_ok_at: string | null;
	readonly last_error_code: string | null;
	readonly retry_after_until: string | null;
}

/** Daemon-scope conditions, read alongside the project-scope {@link Conditions}. */
export interface StatusDaemonConditions {
	/** Raised when the ledger file itself failed to open and was quarantined (design §5.1). */
	readonly ledger_quarantined: { readonly since: string; readonly reason: string } | null;
}

/** `agentbus_status` tool output (design §12's `status` row; v1: `StatusToolOutput`, `v1:src/tools/status.ts`). */
export interface StatusToolOutput {
	agent_id: string;
	bot_username: string;
	chat_id: number;
	protocol_version: string;
	/** This daemon's package version — the only field that can reveal a stale peer (ADR-05b gate). */
	server_version: string;
	cursor: { next_update_id: number };
	last_fetch_at: string | null;
	/** Derived from {@link StatusToolOutput.last_fetch_at}; `null` for a session that has never fetched. */
	hours_since_last_fetch: number | null;
	/**
	 * Present once the DAEMON's own polling gap approaches {@link BOT_API_RETENTION_HOURS} (A1/A2),
	 * raised from `offsets.last_poll_ok_at` for the binding's bot — never from this session's own
	 * `last_fetch_at`. See the module doc's Change (3): the field is v1's, its source is not.
	 */
	retention_warning?: { hours_since_last_fetch: number; hours_remaining: number; retention_hours: number };
	reminder_window_hours: number;
	roster: StatusRosterEntry[];
	last_checkpoint: { at: string; by: string } | null;
	/**
	 * Capped at {@link MAX_SURFACED_THREADS} and partitioned by priority before it is sliced (F3), so a
	 * backlog of already-seen threads cannot make a brand-new one unreachable here either. Within each
	 * tier the order stays oldest-first (ADR-12).
	 */
	open_threads: OpenThreadEntry[];
	/** How many open threads exist beyond the ones listed (ADR-12). Non-zero means a real backlog. */
	omitted_open_threads: number;
	/** The same per-tier breakdown `fetch` reports, so a STARVED tier is visible from either tool. */
	omitted_open_threads_by_tier: { new: number; reminder: number };
	/**
	 * Persistent warnings, carried on EVERY call until whatever raised them is resolved (T1.3). Always
	 * fully present with `null` for anything unraised, so a caller reads one stable shape rather than
	 * having to distinguish "clean" from "field absent".
	 */
	conditions: Conditions;
	/** Facts about the daemon process itself — new in v2, since v1 had no separate daemon process. */
	daemon: { pid: number; started_at: string; uptime_seconds: number };
	/** The binding this session is served under — new in v2 (design §12 Change (2)). */
	binding: { project_id: string; bot_id: number; group_id: number; agent_id: string; roster_hash: string };
	/** Which secret-store backend is active (design §6) — new in v2. */
	secret_store: { kind: SecretStore["kind"] };
	/** The binding bot's own `offsets` row, or `null` when it has never polled — new in v2. */
	poller: StatusPollerEntry | null;
	/** Daemon-scope conditions — new in v2, since v1 had no daemon-scope condition to report. */
	daemon_conditions: StatusDaemonConditions;
}

function listThreadIds(db: DatabaseSync, projectId: string): string[] {
	const rows = db.prepare("SELECT thread_id FROM threads WHERE project_id = ?").all(projectId) as unknown as {
		thread_id: string;
	}[];
	return rows.map((row) => row.thread_id);
}

interface BindingCheckpoint {
	readonly at: string;
	readonly by: string;
}

function readBindingCheckpoint(db: DatabaseSync, projectId: string): BindingCheckpoint | null {
	const row = db
		.prepare("SELECT last_checkpoint_at, last_checkpoint_by FROM binding_state WHERE project_id = ?")
		.get(projectId) as { last_checkpoint_at: string | null; last_checkpoint_by: string | null } | undefined;
	if (row === undefined || row.last_checkpoint_at === null || row.last_checkpoint_by === null) {
		return null;
	}
	return { at: row.last_checkpoint_at, by: row.last_checkpoint_by };
}

/** The binding bot's own `offsets` row, scoped by `bot_id` so a session never learns another bot's poll state. */
function readPollerEntry(db: DatabaseSync, botId: number): StatusPollerEntry | null {
	const row = db
		.prepare(
			`SELECT bot_id, next_update_id, last_poll_started_at, last_poll_ok_at, last_error_code, retry_after_until
			   FROM offsets WHERE bot_id = ?`,
		)
		.get(botId) as StatusPollerEntry | undefined;
	return row === undefined ? null : { ...row };
}

/**
 * `retention_warning`, re-scoped to the DAEMON's own polling gap the way design §8.4 re-scopes `fetch`'s
 * `gap_warning` (module doc Change (3)). Reads the {@link StatusPollerEntry} the caller already loaded, so
 * one `offsets` read serves both fields.
 */
function computeRetentionWarning(poller: StatusPollerEntry | null, nowDate: Date): StatusToolOutput["retention_warning"] {
	const lastPollOkAt = poller?.last_poll_ok_at ?? null;
	if (lastPollOkAt === null) {
		return undefined;
	}
	const hoursElapsed = computeAgeHours(lastPollOkAt, nowDate);
	if (hoursElapsed >= RETENTION_WARNING_HOURS) {
		return {
			hours_since_last_fetch: hoursElapsed,
			hours_remaining: Math.max(BOT_API_RETENTION_HOURS - hoursElapsed, 0),
			retention_hours: BOT_API_RETENTION_HOURS,
		};
	}
	return undefined;
}

/** Whole seconds elapsed since `startedAt`, never negative — a clock skew or a future stamp reports `0`. */
function computeUptimeSeconds(startedAt: string, nowDate: Date): number {
	const elapsedMs = nowDate.getTime() - new Date(startedAt).getTime();
	return Math.max(Math.floor(elapsedMs / MS_PER_SECOND), 0);
}

/**
 * Serves one `status` call for one client session over the ledger (design §12's `status` row). See the module
 * doc. Pure read: this module calls {@link readClientCursor} and never {@link ensureClientCursor} — a
 * brand-new session is answered `cursor.next_update_id: 0` without minting a `client_cursors` row, the
 * same way v1's `statusTool` never wrote `state.json`.
 */
export async function serveStatus(_input: Record<string, never>, deps: ServeStatusDeps): Promise<StatusToolOutput> {
	const { db, binding, session, daemon } = deps;
	const now = deps.now ?? ((): Date => new Date());
	const nowDate = now();

	const cursor = readClientCursor(db, session.client_id);
	const nextUpdateId = cursor?.inbox_seq ?? 0;
	const lastFetchAt = cursor?.last_seen_at ?? null;
	const hoursSinceLastFetch = lastFetchAt === null ? null : computeAgeHours(lastFetchAt, nowDate);

	const roster: StatusRosterEntry[] = binding.roster_snapshot.map((entry) => ({
		agent_id: entry.agent_id,
		username: entry.username,
	}));

	// Threads this project holds (see `daemon/serve/fetch.ts`'s module doc for why this is a local
	// listing rather than an export of `ledger/threads.ts`).
	const threadIds = listThreadIds(db, binding.project_id);
	const openRecords: [string, ThreadRecord][] = [];
	for (const threadId of threadIds) {
		const record = readThreadRecord(db, binding.project_id, threadId);
		if (record !== undefined && record.opened_type === "REQUEST" && record.status === "open") {
			openRecords.push([threadId, record]);
		}
	}
	openRecords.sort(([idA, a], [idB, b]) => a.opened_at.localeCompare(b.opened_at) || idA.localeCompare(idB));

	const surfacedBefore = readSurfacedThreads(db, session.client_id);
	const tiers: Tiers<[string, ThreadRecord]> = { fresh: [], reminder: [], rest: [] };
	for (const pair of openRecords) {
		const [threadId, record] = pair;
		const overdue = isReminderDue(computeAgeHours(record.opened_at, nowDate), binding.reminder_window_hours);
		if (!surfacedBefore.has(threadId)) {
			tiers.fresh.push(pair);
		} else if (overdue) {
			tiers.reminder.push(pair);
		} else {
			tiers.rest.push(pair);
		}
	}

	const selection = selectTiered(tiers, MAX_SURFACED_THREADS, { fresh: FLOOR_NEW, reminder: FLOOR_REMINDER });
	const openThreads: OpenThreadEntry[] = selection.selected.map(([threadId, record]) => {
		const direction: "inbound" | "outbound" = record.from === binding.agent_id ? "outbound" : "inbound";
		return {
			thread: threadId,
			direction,
			peer: direction === "outbound" ? (record.to as string) : record.from,
			age_hours: computeAgeHours(record.opened_at, nowDate),
			acked: record.ack_count > 0,
		};
	});

	const checkpoint = readBindingCheckpoint(db, binding.project_id);
	const poller = readPollerEntry(db, binding.bot_id);
	const retentionWarning = computeRetentionWarning(poller, nowDate);
	const ledgerQuarantined = readCondition(db, DAEMON_CONDITION_SCOPE, "ledger_quarantined");

	const output: StatusToolOutput = {
		agent_id: binding.agent_id,
		bot_username: binding.bot_username,
		chat_id: binding.group_id,
		protocol_version: PROTOCOL_SENTINEL,
		server_version: SERVER_VERSION,
		cursor: { next_update_id: nextUpdateId },
		last_fetch_at: lastFetchAt,
		hours_since_last_fetch: hoursSinceLastFetch,
		reminder_window_hours: binding.reminder_window_hours,
		roster,
		last_checkpoint: checkpoint,
		open_threads: openThreads,
		omitted_open_threads: selection.omitted.total,
		omitted_open_threads_by_tier: { new: selection.omitted.fresh, reminder: selection.omitted.reminder },
		conditions: readProjectConditions(db, binding.project_id),
		daemon: {
			pid: daemon.pid,
			started_at: daemon.started_at,
			uptime_seconds: computeUptimeSeconds(daemon.started_at, nowDate),
		},
		binding: {
			project_id: binding.project_id,
			bot_id: binding.bot_id,
			group_id: binding.group_id,
			agent_id: binding.agent_id,
			roster_hash: binding.roster_hash,
		},
		secret_store: { kind: daemon.secret_store_kind },
		poller,
		daemon_conditions: {
			ledger_quarantined:
				ledgerQuarantined === undefined
					? null
					: { since: ledgerQuarantined.since, reason: String(ledgerQuarantined.detail?.["reason"]) },
		},
	};
	if (retentionWarning !== undefined) {
		output.retention_warning = retentionWarning;
	}
	return output;
}
