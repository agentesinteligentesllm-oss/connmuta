/**
 * Provenance: telegram-agent-bus src/tools/fetch.ts:664-927 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 077561aec31396adc157692655a87318e2b8a67fd74e4907cb2e239d322b3787
 *   (SHA-256 of the frozen v1 file's lines 664-927, LF-normalized, including line 927's terminating
 *    newline. Reproduce with `node -e "…"` over the frozen checkout, following the same method
 *    `daemon/admission.ts`'s header documents and validates against its own pinned value.)
 * Changes: (1) SEAM split: this range built `needs_action`, `waiting_on_peer`, `unannounced_closures`,
 * the digest/compact tick, `cursor` and the final response object by reading a single global `State`
 * from disk; here the same shapes are built over the LEDGER, per calling CLIENT (design §8.4) —
 * `client_cursors.inbox_seq` replaces `next_update_id`, `client_surfaced` replaces `first_surfaced_at`,
 * and `client_cursors.last_surfaced_digest` replaces the one global digest; (2) the
 * `log`/`rejected`/`unapplied`/`misaddressed`/`unanchored` half this range assumed already classified
 * in the SAME pass (v1's `fetch.ts:525-656`, now `daemon/admission.ts`) is rebuilt here from `updates`
 * rows admission already wrote — there is no `getUpdates` call, and no Telegram decode loop, anywhere
 * in this module; (3) D-02: a call with no rows past the cursor and `timeout_s > 0` awaits
 * `inbox:<project_id>` on the poller's `EventEmitter`, bounded by {@link effectiveWaitSeconds}, instead
 * of blocking inside one `getUpdates` call — `timeout_s` is never forwarded to Telegram, and this
 * module imports neither `daemon/telegram.ts` nor `daemon/transport/*` (D-26); (4) `skipped` is read
 * from `audit_log` (`direction='reject', outcome='dropped'`) bounded by the client's own
 * `(last_seen_at, now]` window, rather than accumulated in the same loop that classifies each update;
 * (5) D-15: `wrapUntrusted` now takes an explicit `FenceOrigin` (`project_id`, `agent_id`, `user_id`)
 * at every call site, carried from the binding and the verified sender — `shared/fence.ts`'s PR-06
 * split, consumed here for the first time in the daemon.
 *
 * ---
 *
 * Serves `fetch` for one calling client (`daemon/serve/fetch.ts`, design §8.4; D-02; D-06; D-15;
 * `durable-inbox` spec "Per-client cursors and surfaced state", "timeout_s is a long-poll against the
 * ledger", "needs_action and seen_eids resolve DATA-MODEL's open points").
 *
 * **Per-client state, not owned here.** `client_cursors.inbox_seq` and `client_surfaced` are
 * `ledger/cursors.ts`'s (PR-12, D-19): this module calls {@link ensureClientCursor},
 * {@link readSurfacedThreads}, {@link markThreadsSurfaced} and {@link advanceClientCursor} rather than
 * keeping a second copy of that logic. The session's row is ensured on every call, including a peek
 * (`mark_seen: false`) — a brand-new client still needs a catch-up cursor to read rows against, and
 * that bootstrap is not the "nothing is persisted" ADR-0025 promises about a peek; only the ADVANCE and
 * the surfaced STAMPS are conditioned on `mark_seen`.
 *
 * **D-02's wait is against the LEDGER, never Telegram.** With no row past the cursor and a positive
 * effective wait, this handler subscribes to `inbox:<project_id>` on the caller's `EventEmitter` and
 * awaits the event, the bounded delay or the caller's abort, then reads once more. The wait is race-free
 * because nothing between the empty read and the subscription yields: both run in the same synchronous
 * stretch (an `async` function runs synchronously up to its first `await`), and the poller's commit and
 * its `emit` run on this same thread, so no emit can fall between them. A re-read between subscribing
 * and awaiting would therefore be dead code, and there is none. D-26 is a
 * property of this module's import graph, not a runtime check: it imports no Telegram client and no
 * transport, so nothing reachable from here can send.
 *
 * **`unanchored` is reconstructed only from what admission persisted.** `admission.ts`'s own
 * `AdmissionCounts.unanchored` counts TWO shapes — a transition the null-anchor check REFUSED (reason
 * `unanchored`) and one the ADR-13 originator arm authorized DESPITE a null anchor
 * (`ApplyResult.unanchored`) — but only the first shape reaches the ledger as a queryable fact: a
 * `rejected` row's audit reason. The second is a boolean admission held only for the duration of one
 * call and never wrote anywhere `fetch` can read it back from. This module's `unanchored` count is
 * therefore the REJECTED half only, and is disclosed as such rather than silently under-counting
 * against admission's own daemon-side vocabulary.
 *
 * **`skipped` is a per-client window, not a per-batch tally.** v1 accumulated `SkippedCounts` in the
 * same loop that classified each update, so the numbers were exactly this call's batch. Here admission
 * already ran (by the poller, not by this call), so `skipped` is read from `audit_log` bounded by
 * `(client_cursors.last_seen_at, now]` — the same "since your last look" window the rest of this
 * module uses. `audit_log.ts` is the message's `received_at` (Telegram's own `message.date`), not the
 * instant admission ran, so a drop delivered late — after the retention window let it arrive — can fall
 * outside a client's window even though this is the first time that client has been told about it; the
 * same caveat v1's own `gap_warning` already lives with.
 *
 * **Threads are listed here, not exported from `ledger/threads.ts`.** That module's own doc states its
 * scope is the `ThreadRecord` adapter (read one, write one); adding a listing query there for this
 * module's sole benefit would widen an audited SEAM for one caller. `SELECT thread_id FROM threads
 * WHERE project_id = ?` plus {@link readThreadRecord} per row is the whole of it, and it costs one
 * indexed lookup per project per call.
 *
 * **D-06 is not re-implemented here.** `needs_action` as a live VIEW and `seen_eids` as a UNIQUE index
 * are `ledger/schema.ts`'s DDL and `daemon/admission.ts`'s dedup respectively; this module's own
 * `needs_action` RESPONSE FIELD is a projection over `threads` filtered by {@link isNeedsAction} and
 * tiered by {@link selectTiered} — the same predicate and selection rule v1 used, now reading the
 * per-CLIENT surfaced set instead of a `first_surfaced_at` stamped once on the record itself.
 *
 * **Checkpoint windowing is unchanged from v1's rule**, applied over the rows THIS call read: if any
 * entry that reaches `log` is a BROADCAST whose stored body starts with `CHECKPOINT_MARKER`, `log` is
 * sliced to start at the NEWEST such entry by message time (`received_at`, v1's `>=` comparison) —
 * `seq` is admission order, which nothing guarantees equals message-date order, so position alone is
 * not used. `misaddressed` and `unanchored` are still counted over the FULL batch, before
 * that slice, matching v1: they are diagnostics about what this call actually processed, not about what
 * survived the window.
 *
 * **The frozen wire field names now carry ledger values.** `cursor.previous_update_id` and
 * `cursor.next_update_id` are this session's `client_cursors.inbox_seq`, before and after; a peek
 * (`mark_seen: false`) reports `next_update_id === previous_update_id` and `advanced: false` because
 * nothing moved. `gap_warning`'s re-scoping (design §8.4) is already documented at
 * {@link FetchToolOutput.gap_warning}; this module raises it from `offsets.last_poll_ok_at` for
 * `binding.bot_id`, never from this client's own `last_seen_at`.
 */

import type { DatabaseSync } from "node:sqlite";
import type { EventEmitter } from "node:events";

import {
	BOT_API_RETENTION_HOURS,
	CHECKPOINT_MARKER,
	FETCH_LONGPOLL_MAX_SECONDS,
	FLOOR_NEW,
	FLOOR_REMINDER,
	MAX_BATCH,
	MAX_SURFACED_THREADS,
} from "../../shared/constants.js";
import { wrapUntrusted, type FenceOrigin } from "../../shared/fence.js";
import type { ProjectRosterEntry } from "../../shared/project-file.js";
import type { RejectionReason } from "../../shared/protocol-apply.js";
import {
	computeAgeHours,
	computeWorkDigest,
	isNeedsAction,
	isReminderDue,
	selectTiered,
	type Tiers,
} from "../../shared/protocol-select.js";
import type { HistoryEntry, ThreadRecord } from "../../shared/thread-record.js";
import {
	trimSurfaced,
	trimWaiting,
	type FetchToolInput,
	type FetchToolOutput,
	type LogEntry,
	type NeedsActionEntry,
	type RejectedEntry,
	type SkippedCounts,
	type UnannouncedClosure,
	type UnappliedEntry,
	type WaitingOnPeerEntry,
} from "../../shared/tool-output.js";
import {
	advanceClientCursor,
	ensureClientCursor,
	markThreadsSurfaced,
	readSurfacedThreads,
} from "../../ledger/cursors.js";
import { readProjectConditions } from "../../ledger/conditions-store.js";
import { readThreadRecord } from "../../ledger/threads.js";
import { withTransaction } from "../../ledger/transaction.js";

/** The binding fields `serveFetch` reads, and no others (design §8.4). */
export interface FetchServeBinding {
	readonly project_id: string;
	/** The bot whose `offsets.last_poll_ok_at` backs {@link FetchToolOutput.gap_warning}. */
	readonly bot_id: number;
	readonly agent_id: string;
	readonly roster_snapshot: readonly ProjectRosterEntry[];
	readonly reminder_window_hours: number;
}

/** The calling client session, as the IPC handshake (PR-30) hands it over. */
export interface FetchClientSession {
	readonly client_id: string;
	readonly host?: string | null;
	readonly pid?: number | null;
	readonly started_at: string;
}

/** What {@link serveFetch} needs. */
export interface ServeFetchDeps {
	readonly db: DatabaseSync;
	readonly binding: FetchServeBinding;
	readonly session: FetchClientSession;
	/** The poller's event emitter; D-02 subscribes to `inbox:<project_id>` on it when it waits. */
	readonly emitter?: EventEmitter;
	readonly now?: () => Date;
	/** Injected for the D-02 wait; production uses an `AbortSignal`-driven `setTimeout`. */
	readonly delay?: (ms: number, signal: AbortSignal) => Promise<void>;
	readonly signal?: AbortSignal;
}

/**
 * The `user_id` a fenced body's origin carries when its author's agent id is absent from
 * `binding.roster_snapshot` at serve time.
 *
 * `0`, never a made-up positive number: {@link ProjectRosterEntry.user_id} is validated
 * `z.number().int().positive()` (`shared/project-file.ts`), so no real roster entry can ever hold `0` —
 * this value cannot collide with a genuine Telegram user id, which is what makes it safe to read back
 * as "unresolved" rather than as a forged identity. It exists because a `ThreadRecord`/`HistoryEntry`
 * carries only the AGENT id of a peer, never their numeric Telegram id, so a roster that drifted since a
 * thread was opened — or since this session's binding snapshot was taken — can leave that agent id
 * absent from `roster_snapshot` here: an edge case this module must still answer for rather than throw
 * on, since `log` entries (which carry the verified numeric sender id directly from `updates.from_user_id`)
 * never need this fallback at all.
 */
export const UNRESOLVED_ORIGIN_USER_ID = 0;

/**
 * The refusal {@link serveFetch} raises when a `rejected` `updates` row has no matching audit row.
 *
 * `admitTelegramUpdates` writes a row's `updates` entry and its `reject`/`rejected` audit row inside the
 * SAME committed transaction (`daemon/admission.ts`), so the two can never disagree in a healthy ledger.
 * A caller reaching this refusal is reading a ledger this build did not write — raw SQL, a downgrade, a
 * hand-edited file — and guessing a reason would misreport the classification rather than surface the
 * fault.
 */
export const FETCH_MISSING_REJECTION_AUDIT_MESSAGE =
	"serveFetch: a rejected updates row has no matching audit_log row (project_id, eid, direction='reject', outcome='rejected'); admission writes both inside one committed transaction, so a missing audit row is a data integrity fault rather than a value this handler guesses at.";

/** The effective D-02 wait, in seconds: never negative, never past {@link FETCH_LONGPOLL_MAX_SECONDS}. */
export function effectiveWaitSeconds(timeoutS: number | undefined): number {
	return Math.min(Math.max(timeoutS ?? 0, 0), FETCH_LONGPOLL_MAX_SECONDS);
}

/** One `updates` row as this module reads it back — everything `log`/`rejected`/`unapplied` need. */
interface UpdateRow {
	readonly seq: number;
	readonly eid: string;
	readonly envelope_json: string;
	readonly body: string | null;
	readonly apply_outcome: string;
	readonly received_at: string;
	readonly via: "direct" | "group";
	readonly from_agent_id: string;
	readonly from_user_id: number;
}

/** The envelope fields this module reads out of `updates.envelope_json` (the body key is absent, D-20). */
interface StoredEnvelopeShape {
	readonly type: string;
	readonly to: string | null;
	readonly thread: string;
	readonly basis?: string;
}

function parseStoredEnvelope(envelopeJson: string): StoredEnvelopeShape {
	return JSON.parse(envelopeJson) as StoredEnvelopeShape;
}

function readUpdateRows(db: DatabaseSync, projectId: string, afterSeq: number, limit: number): UpdateRow[] {
	return db
		.prepare(
			`SELECT seq, eid, envelope_json, body, apply_outcome, received_at, via, from_agent_id, from_user_id
			   FROM updates WHERE project_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?`,
		)
		.all(projectId, afterSeq, limit) as unknown as UpdateRow[];
}

function readRejectionReason(db: DatabaseSync, projectId: string, eid: string): RejectionReason {
	const row = db
		.prepare(
			`SELECT reason FROM audit_log
			   WHERE project_id = ? AND eid = ? AND direction = 'reject' AND outcome = 'rejected'
			  ORDER BY id ASC LIMIT 1`,
		)
		.get(projectId, eid) as { reason: string | null } | undefined;
	if (row === undefined || row.reason === null) {
		throw new Error(FETCH_MISSING_REJECTION_AUDIT_MESSAGE);
	}
	return row.reason as RejectionReason;
}

/** The five `SkippedCounts` reasons, as the keys the audit query groups on. */
const SKIPPED_REASONS: readonly (keyof SkippedCounts)[] = [
	"non_envelope",
	"malformed",
	"unsupported_version",
	"unknown_sender",
	"duplicate",
];

function isSkippedReason(value: string): value is keyof SkippedCounts {
	return (SKIPPED_REASONS as readonly string[]).includes(value);
}

/** `skipped`, bounded to `(sinceExclusive, throughInclusive]` — this client's own window since it last looked. */
function readSkippedCounts(
	db: DatabaseSync,
	projectId: string,
	sinceExclusive: string,
	throughInclusive: string,
): SkippedCounts {
	const counts: SkippedCounts = {
		non_envelope: 0,
		malformed: 0,
		unsupported_version: 0,
		unknown_sender: 0,
		duplicate: 0,
	};
	const placeholders = SKIPPED_REASONS.map(() => "?").join(", ");
	const rows = db
		.prepare(
			`SELECT reason, COUNT(*) AS n FROM audit_log
			   WHERE project_id = ? AND direction = 'reject' AND outcome = 'dropped'
			     AND reason IN (${placeholders}) AND ts > ? AND ts <= ?
			  GROUP BY reason`,
		)
		.all(projectId, ...SKIPPED_REASONS, sinceExclusive, throughInclusive) as unknown as {
		reason: string;
		n: number;
	}[];
	for (const row of rows) {
		if (isSkippedReason(row.reason)) {
			counts[row.reason] = row.n;
		}
	}
	return counts;
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

/** `gap_warning`, re-scoped to "the daemon was not polling" (design §8.4): from `offsets.last_poll_ok_at`. */
function computeGapWarning(db: DatabaseSync, botId: number, nowDate: Date): FetchToolOutput["gap_warning"] {
	const row = db.prepare("SELECT last_poll_ok_at FROM offsets WHERE bot_id = ?").get(botId) as
		| { last_poll_ok_at: string | null }
		| undefined;
	const lastPollOkAt = row?.last_poll_ok_at ?? null;
	if (lastPollOkAt === null) {
		return undefined;
	}
	const hoursElapsed = computeAgeHours(lastPollOkAt, nowDate);
	if (hoursElapsed > BOT_API_RETENTION_HOURS) {
		return { possible: true, last_fetch_at: lastPollOkAt, hours_elapsed: hoursElapsed };
	}
	return undefined;
}

function listThreadIds(db: DatabaseSync, projectId: string): string[] {
	const rows = db.prepare("SELECT thread_id FROM threads WHERE project_id = ?").all(projectId) as unknown as {
		thread_id: string;
	}[];
	return rows.map((row) => row.thread_id);
}

/**
 * The message this thread is waiting on US to answer, or `null` when the opening still is it.
 *
 * Ported from v1's `fetch.ts:490-498` (ADR-27), unchanged: the last history entry not authored by
 * `agentId`, or `null` when the opening itself is still unanswered (the single-turn case, where the
 * caller falls back to the record's own fields).
 */
function turnAwaitingAnswer(record: ThreadRecord, agentId: string): HistoryEntry | null {
	for (let i = record.history.length - 1; i >= 0; i--) {
		const entry = record.history[i];
		if (entry.from !== agentId) {
			return entry;
		}
	}
	return null;
}

/** A peer agent id's numeric Telegram identity, from the binding's roster snapshot, or the unresolved sentinel. */
function resolveOriginUserId(roster: readonly ProjectRosterEntry[], agentId: string): number {
	const entry = roster.find((candidate) => candidate.agent_id === agentId);
	return entry !== undefined ? entry.user_id : UNRESOLVED_ORIGIN_USER_ID;
}

function defaultDelay(ms: number, signal: AbortSignal): Promise<void> {
	if (signal.aborted) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = (): void => {
			clearTimeout(timer);
			resolve();
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

/**
 * D-02's wait: subscribes to `inbox:<project_id>`, awaits whichever comes first — the event, the bounded
 * delay, or the caller's own abort — then reads once more. Called synchronously right after the empty
 * read, so no emit can land in between (see the module doc). The listener and the delay's timer are
 * always cleaned up, on every exit path.
 */
async function waitForRows(
	deps: ServeFetchDeps,
	projectId: string,
	waitSeconds: number,
	readRows: () => UpdateRow[],
): Promise<UpdateRow[]> {
	const eventName = `inbox:${projectId}`;
	const delay = deps.delay ?? defaultDelay;
	const controller = new AbortController();
	const outerSignal = deps.signal;
	const onOuterAbort = (): void => controller.abort();
	if (outerSignal !== undefined) {
		if (outerSignal.aborted) {
			controller.abort();
		} else {
			outerSignal.addEventListener("abort", onOuterAbort, { once: true });
		}
	}

	let notify: (() => void) | undefined;
	const eventPromise = new Promise<void>((resolve) => {
		notify = resolve;
	});
	const onEvent = (): void => notify?.();
	deps.emitter?.once(eventName, onEvent);

	try {
		await Promise.race([eventPromise, delay(waitSeconds * 1000, controller.signal)]);
		return readRows();
	} finally {
		deps.emitter?.off(eventName, onEvent);
		controller.abort();
		if (outerSignal !== undefined) {
			outerSignal.removeEventListener("abort", onOuterAbort);
		}
	}
}

/** Serves one `fetch` call for one client session over the ledger (design §8.4). See the module doc. */
export async function serveFetch(input: FetchToolInput, deps: ServeFetchDeps): Promise<FetchToolOutput> {
	const { db, binding, session } = deps;
	const now = deps.now ?? ((): Date => new Date());
	const startIso = now().toISOString();

	// Step 1 — ensure the session's cursor (D-19 catch-up init lives in `ledger/cursors.ts`). This runs
	// even in peek mode: a brand-new client still needs a starting position to read rows against, and
	// that bootstrap is not what ADR-0025's "peek writes nothing" is about.
	const cursor = ensureClientCursor(db, {
		client_id: session.client_id,
		project_id: binding.project_id,
		host: session.host ?? null,
		pid: session.pid ?? null,
		started_at: session.started_at,
		now: startIso,
	});
	const previous = cursor.inbox_seq;
	const previousLastSeenAt = cursor.last_seen_at;
	const markSeen = input.mark_seen ?? true;
	const forceFull = input.force_full ?? false;
	const limit = Math.min(input.max_batch ?? MAX_BATCH, MAX_BATCH);

	// Step 2/3 — read rows past the cursor; D-02's bounded wait when the batch is empty.
	const readRows = (): UpdateRow[] => readUpdateRows(db, binding.project_id, previous, limit);
	let rows = readRows();
	const waitSeconds = effectiveWaitSeconds(input.timeout_s);
	if (rows.length === 0 && waitSeconds > 0) {
		rows = await waitForRows(deps, binding.project_id, waitSeconds, readRows);
	}
	// The clock is read AGAIN after the wait, which can last up to FETCH_LONGPOLL_MAX_SECONDS: every
	// instant below — ages, the gap check, the `skipped` window's upper bound, `last_seen_at` and the
	// surfaced stamps — describes when this response is built, not when the call arrived.
	const nowDate = now();
	const nowIso = nowDate.toISOString();

	// Step 4 — log / rejected / unapplied / misaddressed / unanchored / checkpoint windowing.
	const rosterAgentIds = new Set(binding.roster_snapshot.map((entry) => entry.agent_id));
	const log: LogEntry[] = [];
	const rejected: RejectedEntry[] = [];
	const unapplied: UnappliedEntry[] = [];
	let misaddressed = 0;
	let unanchored = 0;
	let newestCheckpointLogIndex = -1;
	let newestCheckpointAt: string | null = null;

	for (const row of rows) {
		const envelope = parseStoredEnvelope(row.envelope_json);

		if (row.apply_outcome === "rejected") {
			const reason = readRejectionReason(db, binding.project_id, row.eid);
			rejected.push({ eid: row.eid, type: envelope.type, from: row.from_agent_id, thread: envelope.thread, reason });
			if (reason === "unanchored") {
				unanchored += 1;
			}
			continue;
		}
		if (row.apply_outcome === "ignored") {
			unapplied.push({ thread: envelope.thread, type: envelope.type, from: row.from_agent_id });
			continue;
		}

		const body = row.body;
		if (body === null) {
			// D-20 guarantees a non-rejected, non-ignored row always carries a body; a row that violates
			// that invariant is skipped rather than surfaced as a broken entry.
			continue;
		}

		const origin: FenceOrigin = { project_id: binding.project_id, agent_id: row.from_agent_id, user_id: row.from_user_id };
		const entry: LogEntry = {
			eid: row.eid,
			type: envelope.type,
			from: row.from_agent_id,
			to: envelope.to,
			thread: envelope.thread,
			body: wrapUntrusted(body, origin),
			sent_at: row.received_at,
			via: row.via,
		};
		if (envelope.basis !== undefined) {
			entry.basis = envelope.basis;
		}
		log.push(entry);

		if (envelope.to !== null && !rosterAgentIds.has(envelope.to)) {
			misaddressed += 1;
		}
		// v1's rule (`fetch.ts:651`), by message time and not by position: `seq` is admission order, and
		// nothing guarantees that equals message-date order, so the newest checkpoint is chosen by
		// `received_at` (the message date), with a tie going to the later row as v1's `>=` did.
		if (
			envelope.type === "BROADCAST" &&
			body.startsWith(CHECKPOINT_MARKER) &&
			(newestCheckpointAt === null || row.received_at >= newestCheckpointAt)
		) {
			newestCheckpointAt = row.received_at;
			newestCheckpointLogIndex = log.length - 1;
		}
	}
	const windowedLog = newestCheckpointLogIndex >= 0 ? log.slice(newestCheckpointLogIndex) : log;

	// Threads this project holds (see the module doc for why this is a local listing).
	const threadIds = listThreadIds(db, binding.project_id);
	const threadsMap: Record<string, ThreadRecord> = {};
	for (const threadId of threadIds) {
		const record = readThreadRecord(db, binding.project_id, threadId);
		if (record !== undefined) {
			threadsMap[threadId] = record;
		}
	}

	const surfacedBefore = readSurfacedThreads(db, session.client_id);

	// needs_action: tiered selection (F3), mirroring v1's floors/spill rule, reading the per-client
	// surfaced set instead of a record-global `first_surfaced_at`.
	const needsActionRecords = Object.entries(threadsMap)
		.filter(([, record]) => isNeedsAction(record, binding.agent_id))
		.sort(([idA, a], [idB, b]) => a.opened_at.localeCompare(b.opened_at) || idA.localeCompare(idB));

	const tiers: Tiers<[string, ThreadRecord]> = { fresh: [], reminder: [], rest: [] };
	let overdueCount = 0;
	for (const pair of needsActionRecords) {
		const [threadId, record] = pair;
		const overdue = isReminderDue(computeAgeHours(record.opened_at, nowDate), binding.reminder_window_hours);
		if (overdue) {
			overdueCount += 1;
		}
		if (!surfacedBefore.has(threadId)) {
			tiers.fresh.push(pair);
		} else if (overdue) {
			tiers.reminder.push(pair);
		} else {
			tiers.rest.push(pair);
		}
	}

	const selection = selectTiered(tiers, MAX_SURFACED_THREADS, { fresh: FLOOR_NEW, reminder: FLOOR_REMINDER });

	const needsAction: NeedsActionEntry[] = selection.selected.map(([threadId, record]) => {
		const ageHours = computeAgeHours(record.opened_at, nowDate);
		const turn = turnAwaitingAnswer(record, binding.agent_id);
		const authorAgentId = turn ? turn.from : record.from;
		const origin: FenceOrigin = {
			project_id: binding.project_id,
			agent_id: authorAgentId,
			user_id: resolveOriginUserId(binding.roster_snapshot, authorAgentId),
		};
		const entry: NeedsActionEntry = {
			thread: threadId,
			from: authorAgentId,
			age_hours: ageHours,
			reminder: isReminderDue(ageHours, binding.reminder_window_hours),
			acked: record.ack_count > 0,
			eid: turn ? turn.eid : record.opened_eid,
			body: wrapUntrusted(turn ? turn.body : record.body, origin),
			sent_at: turn ? turn.at : record.opened_at,
			acked_at: record.acked_at,
			ack_count: record.ack_count,
			via: turn ? turn.via : record.via,
		};
		if (!turn) {
			entry.telegram_message_id = record.opened_message_id;
		}
		return entry;
	});

	const unannouncedClosures: UnannouncedClosure[] = Object.entries(threadsMap)
		.filter(([, record]) => record.status === "resolved" && !record.closure_delivered)
		.sort(([, a], [, b]) => (a.resolved_at ?? "").localeCompare(b.resolved_at ?? ""))
		.slice(0, MAX_SURFACED_THREADS)
		.map(([threadId, record]) => ({ thread: threadId, to: record.to, resolved_at: record.resolved_at, basis: record.basis }));

	const allWaitingOnPeer: WaitingOnPeerEntry[] = Object.entries(threadsMap)
		.filter(
			([, record]) =>
				record.opened_type === "REQUEST" &&
				record.status === "open" &&
				(record.from === binding.agent_id || record.to === binding.agent_id) &&
				record.awaiting !== binding.agent_id,
		)
		.map(([threadId, record]) => {
			const direction: "inbound" | "outbound" = record.from === binding.agent_id ? "outbound" : "inbound";
			const peer = direction === "outbound" ? (record.to as string) : record.from;
			const body =
				direction === "outbound"
					? record.body
					: wrapUntrusted(record.body, {
							project_id: binding.project_id,
							agent_id: record.from,
							user_id: resolveOriginUserId(binding.roster_snapshot, record.from),
						});
			return {
				thread: threadId,
				direction,
				peer,
				body,
				sent_at: record.opened_at,
				age_hours: computeAgeHours(record.opened_at, nowDate),
				acked: record.ack_count > 0,
			};
		})
		.sort((a, b) => a.sent_at.localeCompare(b.sent_at) || a.thread.localeCompare(b.thread));

	const waitingOnPeer = allWaitingOnPeer.slice(0, MAX_SURFACED_THREADS);
	const omitted = {
		needs_action: selection.omitted.total,
		waiting_on_peer: allWaitingOnPeer.length - waitingOnPeer.length,
		new: selection.omitted.fresh,
		reminder: selection.omitted.reminder,
	};

	const checkpoint = readBindingCheckpoint(db, binding.project_id);
	const gapWarning = computeGapWarning(db, binding.bot_id, nowDate);

	// A4: the digest before anything this call surfaces is stamped.
	const digestBefore = computeWorkDigest(
		threadsMap,
		binding.agent_id,
		binding.reminder_window_hours,
		nowDate,
		surfacedBefore,
		checkpoint?.at ?? null,
	);
	const producedNews = windowedLog.length > 0 || rejected.length > 0 || unapplied.length > 0;
	const compact =
		!forceFull &&
		cursor.last_surfaced_digest !== null &&
		digestBefore === cursor.last_surfaced_digest &&
		!producedNews &&
		gapWarning === undefined;

	// ADR-22: trimming is per-entry, whichever kind of tick this is — not gated by `compact`.
	const alreadyEmitted = (threadId: string): boolean => !forceFull && surfacedBefore.has(threadId);
	const surfacedNeedsAction = needsAction.map((entry) => (alreadyEmitted(entry.thread) ? trimSurfaced(entry) : entry));
	const surfacedWaitingOnPeer = waitingOnPeer.map((entry) => (alreadyEmitted(entry.thread) ? trimWaiting(entry) : entry));

	const emittedBodies = new Set<string>([
		...surfacedNeedsAction.filter((entry) => entry.body !== undefined).map((entry) => entry.thread),
		...surfacedWaitingOnPeer.filter((entry) => entry.body !== undefined).map((entry) => entry.thread),
	]);

	const digest = compact
		? digestBefore
		: computeWorkDigest(
				threadsMap,
				binding.agent_id,
				binding.reminder_window_hours,
				nowDate,
				new Set([...surfacedBefore, ...emittedBodies]),
				checkpoint?.at ?? null,
			);

	const lastRowSeq = rows.length > 0 ? rows[rows.length - 1].seq : undefined;
	const nextUpdateId = markSeen ? (lastRowSeq ?? previous) : previous;

	// Step 8 — ADR-0025: peek mode (`mark_seen: false`) advances and stamps nothing.
	if (markSeen) {
		withTransaction(db, () => {
			markThreadsSurfaced(db, session.client_id, [...emittedBodies], nowIso);
			advanceClientCursor(db, session.client_id, {
				inbox_seq: nextUpdateId,
				last_seen_at: nowIso,
				last_surfaced_digest: digest,
			});
		});
	}

	const skipped = readSkippedCounts(db, binding.project_id, previousLastSeenAt, nowIso);
	const conditions = readProjectConditions(db, binding.project_id);

	const output: FetchToolOutput = {
		needs_action: surfacedNeedsAction,
		waiting_on_peer: surfacedWaitingOnPeer,
		log: windowedLog,
		checkpoint: { present: checkpoint !== null, at: checkpoint?.at ?? null, by: checkpoint?.by ?? null },
		cursor: { previous_update_id: previous, next_update_id: nextUpdateId, advanced: nextUpdateId !== previous },
		skipped,
		misaddressed,
		rejected,
		unapplied,
		unannounced_closures: unannouncedClosures,
		unanchored,
		omitted,
		conditions,
		digest,
		unchanged: compact,
	};
	if (compact) {
		const oldestNeedsAction = needsActionRecords[0];
		output.needs_action_summary = {
			count: needsActionRecords.length,
			oldest_thread: oldestNeedsAction?.[0] ?? null,
			oldest_age_hours: oldestNeedsAction ? computeAgeHours(oldestNeedsAction[1].opened_at, nowDate) : null,
			reminder_count: overdueCount,
		};
		output.waiting_on_peer_summary = {
			count: allWaitingOnPeer.length,
			oldest_thread: allWaitingOnPeer[0]?.thread ?? null,
			oldest_age_hours: allWaitingOnPeer[0]?.age_hours ?? null,
			reminder_count: allWaitingOnPeer.filter((entry) => isReminderDue(entry.age_hours, binding.reminder_window_hours))
				.length,
		};
	}
	if (gapWarning !== undefined) {
		output.gap_warning = gapWarning;
	}
	return output;
}
