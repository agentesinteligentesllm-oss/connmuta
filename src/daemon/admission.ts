/**
 * Provenance: telegram-agent-bus src/tools/fetch.ts:404-460,525-656 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 3bd09d0d0291dcf7fe88a90eedcef1e5c1496cf4ea7a4c3b670aad3675c73192
 *   (the two cited ranges, LF-normalized, each including its terminating newline, concatenated in the
 *    cited order: lines 404-460 first, then 525-656. Reproduce with
 *    `node -e "…"` over the frozen checkout, or see `test/fixtures/v1-provenance.json`.)
 * Changes: (1) SEAM split: the chat-scope check is NEW (PT-03, design §8.2 step 3); (2) the reverse roster
 * lookup reads `binding.roster_snapshot` (D-07) instead of a machine-global `config.roster` (PT-04, PT-16);
 * (3) ledger writes go through the write-ahead poll batch (`ledger/inbox.ts`, PR-12) and the pending
 * unknown-sender upsert (`ledger/unknown-senders.ts`, PR-13) instead of persisted v1 state files;
 * (4) `updates.body` is NULL exactly for `rejected` and `ignored` (D-20); (5) an unresolvable addressee
 * anchor is counted `unanchored` and rejected (D-05, PT-17) instead of failing open.
 *
 * ---
 *
 * The seven-step admission pipeline (`daemon/admission.ts`, design §8.2), the highest-risk module of unit 7:
 * it is the single place where a message from a Telegram chat becomes a row the agents can read, so
 * invariant 4 (a source this bridge does not own it must not be able to forge), invariant 5 (human group
 * text never enters agent context) and invariant 1 (a bot never inherits another project's traffic) are all
 * decided here.
 *
 * **The step order is the specification's, not a preference.** `durable-inbox` spells it out as a sequence —
 * "(1) `message.text` present … (2) sentinel decodes … (3) `chat.id === binding.group_id` or
 * `chat.type === "private"` …" — and this module runs exactly that order, because the first failing step
 * names the counter: a foreign chat whose text is human prose is `non_envelope` (step 1 fires first), while a
 * well-formed agent envelope arriving in a foreign chat is `foreign_chat`. Running the scope check first
 * would report every foreign message as `foreign_chat` and hide the envelope-shaped ones, which are the
 * actual T02 threat (a bot added to a second group: v1:src/tools/fetch.ts:436-437).
 *
 * **What is deliberately NOT invented here.** Step 2 calls `decodeEnvelope` (`shared/envelope.ts`) and
 * nothing else. A second decoder — one that tolerated another sentinel spelling or re-checked a subset of
 * the schema by hand — would be a weaker trust boundary than the module that owns the wire, so an envelope
 * this build's schema refuses stays refused rather than being re-admitted by a private parser.
 *
 * **A REQUEST naming a thread this ledger already holds is a `duplicate`, disclosed as a widening of
 * design §8.2 step 6.** The design names only "a REQUEST whose `thread_id` exists with the same
 * `opened_eid`"; it does not say what a REQUEST with the SAME thread id and a DIFFERENT eid does. Applying it
 * is not available: `applyEnvelope` opens a thread unconditionally for every REQUEST that is our business
 * (`shared/protocol-apply.ts`, the branch that builds `ThreadRecord`), so the write would replace the held
 * thread row — its `opened_eid`, its `body` and its `history` — with the newcomer. That is an
 * evidence-destroying write no v2 requirement asks for, and a thread id is the conversation's identity while
 * an eid is one message's. Treating the second REQUEST as a duplicate of the thread the ledger already holds
 * keeps the first message and counts the second, which is the direction this repository prefers (a loud
 * count over a silent loss). No new reason vocabulary is introduced.
 *
 * **Two additive writes run OUTSIDE the batch transaction, and both directions were considered.** Step 4's
 * `unknown_senders` upsert and step 6's `group_message_id` capture happen while the batch is still being
 * classified — design §8.2 places both there — while `commitInboxBatch` opens the transaction that stores
 * `updates`, `threads` and `audit_log`. `ledger/inbox.ts` exposes no hook for extra statements inside that
 * transaction, so the honest statement is that a batch which fails after them leaves a recorded sighting
 * (and a captured message id) whose audit row and `updates` row were rolled back. Both are additive,
 * idempotent and fail-VISIBLE: the pending-sender list and the thread's group anchor are surfaced state, the
 * update is re-served because the offset never moved, and nothing is lost. Deferring them past the commit
 * would trade that for the opposite failure — a crash between commit and capture loses the capture for ever,
 * because the offset has already moved past the update. The window is stated rather than hidden; closing it
 * properly means a batch-level hook, which is PR-12's file and not this slice's to widen.
 *
 * **`dropped` counts every entry that wrote no `updates` row, the self-filter included.** Design §8.2 calls
 * step 5 "dropped uncounted" — that is about the AUDIT LOG (a self-echo earns no audit row, and
 * `SkippedCounts` in the fetch response has no `self_echo` member), not about this module's own tally:
 * `counts.self_echo` reports those entries and `dropped` is the batch total, so
 * `inserted + dropped + replayed` accounts for every update the batch carried. A caller that wants the
 * surfaced vocabulary maps `counts` onto `SkippedCounts`; the extra members stay daemon-side.
 *
 * **I-3 is kept by the writer, not by this module.** The value a poller may hand to `getUpdates` is
 * `result.nextUpdateId`, and `commitInboxBatch` reads it back inside the committing transaction — this
 * module never computes or returns an offset of its own.
 */

import type { DatabaseSync } from "node:sqlite";
import { CHECKPOINT_MARKER } from "../shared/constants.js";
import { decodeEnvelope, normalizeBody, type Envelope } from "../shared/envelope.js";
import type { ProjectRosterEntry } from "../shared/project-file.js";
import type { ThreadRecord } from "../shared/thread-record.js";
import {
	applyEnvelope,
	type ApplyContext,
	type IncomingEnvelope,
} from "../shared/protocol-apply.js";
import type { AuditRow } from "../ledger/audit.js";
import {
	commitInboxBatch,
	type InboxApplyOutcome,
	type InboxBatchEntry,
} from "../ledger/inbox.js";
import { readThreadRecord } from "../ledger/threads.js";
import { upsertUnknownSender } from "../ledger/unknown-senders.js";
import type { TelegramUpdate } from "./telegram.js";

/**
 * The binding fields admission reads, and no others.
 *
 * `roster_snapshot` is the alias-free source of identity (D-07): the reverse lookup of
 * `message.from.id` and the addressee translation both read it, and neither reads a machine-global roster.
 * The type is `shared/project-file.ts`'s entry rather than a second declaration of the same three fields —
 * the registry's `bindings[].roster_snapshot` is validated as exactly this shape (`registry/schema.ts`).
 */
export interface AdmissionBinding {
	readonly project_id: string;
	/** The bot that polled; `updates` and `offsets` are both keyed by it. */
	readonly bot_id: number;
	/** This binding's agent id — the self-filter's comparison value (design §8.2 step 5). */
	readonly agent_id: string;
	/** The one group chat this bot may ingest from (I1, PT-03). */
	readonly group_id: number;
	readonly roster_snapshot: readonly ProjectRosterEntry[];
}

/**
 * What one poll batch classified, by reason.
 *
 * `non_envelope`, `malformed`, `unsupported_version`, `unknown_sender` and `duplicate` are the five members
 * of the fetch response's `SkippedCounts` (v1's vocabulary, kept); the other four are daemon-side counters
 * that exist because a refusal nobody can count is indistinguishable from a check that is not running
 * (PT-03's `foreign_chat`, PT-04's `unknown_sender` sibling `self_echo`, D-05's `unanchored`, and PT-10's
 * `replayed`).
 */
export interface AdmissionCounts {
	non_envelope: number;
	unsupported_version: number;
	malformed: number;
	/** An update from a non-private chat whose id is not this binding's `group_id` (PT-03). */
	foreign_chat: number;
	/** `message.from.id` absent from `roster_snapshot` (PT-04). */
	unknown_sender: number;
	/** This binding's own agent — dropped, and deliberately silent in the audit log (design §8.2 step 5). */
	self_echo: number;
	duplicate: number;
	/** A transition refused because the thread carries no resolvable addressee anchor (D-05, PT-17). */
	unanchored: number;
	/** Entries whose `(bot_id, update_id)` an earlier transaction had already stored (PT-10). */
	replayed: number;
}

/** What one poll batch did, plus the offset the caller may now send to `getUpdates`. */
export interface AdmissionResult {
	/** `updates` rows this batch wrote. */
	readonly inserted: number;
	/** Entries that wrote no `updates` row — drops, the self-filter included (see the module header). */
	readonly dropped: number;
	readonly replayed: number;
	/** Read back inside the committing transaction; `null` when the batch carried no update at all. */
	readonly nextUpdateId: number | null;
	readonly counts: AdmissionCounts;
}

/** The outcomes `updates.body` is NULL for, and the only ones (D-20). Mirrors `ledger/inbox.ts`'s set. */
const BODILESS_OUTCOMES: ReadonlySet<InboxApplyOutcome> = new Set<InboxApplyOutcome>(["rejected", "ignored"]);

/** Reverse roster lookup: the verified Telegram sender id is the ONLY trusted identity source (ADR-10). */
function reverseRosterLookup(
	rosterSnapshot: readonly ProjectRosterEntry[],
	userId: number | undefined
): string | null {
	if (userId === undefined) {
		return null;
	}
	for (const entry of rosterSnapshot) {
		if (entry.user_id === userId) {
			return entry.agent_id;
		}
	}
	return null;
}

/**
 * The addressee in THIS bridge's namespace, translated through the wire anchor (T3.2) — v1
 * `fetch.ts:420-434`'s function, kept with its contract: never invent a name, and fall back to the value as
 * written whenever the anchor is absent (a pre-`v1.0.0` peer) or names an account no local entry claims.
 */
function translateAddressee(
	envelope: Envelope,
	rosterSnapshot: readonly ProjectRosterEntry[]
): string | null {
	if (envelope.to_user_id === undefined) {
		return envelope.to;
	}
	return reverseRosterLookup(rosterSnapshot, envelope.to_user_id) ?? envelope.to;
}

/**
 * Telegram's `message.date` as an ISO string, or `null` when it is unusable (ADR-12).
 *
 * The Bot API response is cast with `as` and never validated, so `date` is typed `number` but is whatever
 * arrived over the wire. `new Date(NaN).toISOString()` throws `RangeError`, and an exception here would
 * abort the whole batch — leaving the offset unmoved, so Telegram re-serves the same poisoned update for
 * ever. Returning `null` lets the caller count it as `malformed` and move on.
 */
function toIsoFromUnixSeconds(seconds: unknown): string | null {
	if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
		return null;
	}
	const ms = seconds * 1000;
	const date = new Date(ms);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The `ApplyContext` this module's roster projects onto: the one field `protocol-apply` reads (C4). */
function buildRosterRecord(
	rosterSnapshot: readonly ProjectRosterEntry[]
): Record<string, { user_id: number }> {
	const record: Record<string, { user_id: number }> = {};
	for (const entry of rosterSnapshot) {
		record[entry.agent_id] = { user_id: entry.user_id };
	}
	return record;
}

/**
 * PT-10's REPLAY key as the batch writer enforces it: `(bot_id, update_id)` on an `updates` row.
 *
 * This query duplicates `ledger/inbox.ts`'s private `alreadyStored` deliberately. The pipeline must
 * CLASSIFY and the writer must ENFORCE, and they are asked at different moments: the writer's answer
 * decides whether the whole entry is skipped, while this one decides whether the eid keys may be asked at
 * all (see the step-6 comment in `admitTelegramUpdates`). Sharing the read would make the writer's own
 * guard depend on its caller having run first, which is the coupling the split exists to avoid.
 */
function isUpdateIdStored(db: DatabaseSync, botId: number, updateId: number): boolean {
	const row = db.prepare("SELECT 1 AS present FROM updates WHERE bot_id = ? AND update_id = ?").get(botId, updateId);
	return row !== undefined;
}

/** The other half of step 6's dedup: `UNIQUE (project_id, eid)` as the ledger holds it. */
function isEidInUpdates(db: DatabaseSync, projectId: string, eid: string): boolean {
	const row = db
		.prepare("SELECT 1 AS present FROM updates WHERE project_id = ? AND eid = ?")
		.get(projectId, eid);
	return row !== undefined;
}

/**
 * Whether this ledger already holds a thread row under this id — design §8.2 step 6's
 * "a REQUEST whose `thread_id` exists", widened to any `opened_eid` for the reason the module header states.
 */
function isThreadHeld(db: DatabaseSync, projectId: string, threadId: string): boolean {
	const row = db
		.prepare("SELECT 1 AS present FROM threads WHERE project_id = ? AND thread_id = ?")
		.get(projectId, threadId);
	return row !== undefined;
}

/**
 * An IN-THREAD eid already recorded — the migration edge of design §13, which arrives with `thread_history`
 * rows and no `updates` row (a migrated v1 thread's history is not replayed through this pipeline).
 *
 * Scoped to the thread, which is what "in-thread" means: `thread_history`'s key is
 * `(project_id, thread_id, eid)`, and an eid from another thread is another conversation's message.
 */
function isEidInThreadHistory(
	db: DatabaseSync,
	projectId: string,
	threadId: string,
	eid: string
): boolean {
	const row = db
		.prepare("SELECT 1 AS present FROM thread_history WHERE project_id = ? AND thread_id = ? AND eid = ?")
		.get(projectId, threadId, eid);
	return row !== undefined;
}

/**
 * The additive `group_message_id` capture (E1): the group copy is the one a human reply can be anchored to,
 * so the first group-plane copy fills the anchor a direct-plane open left null. `IS NULL` in the predicate
 * makes it first-wins and therefore idempotent, which is what lets it run outside the batch transaction.
 */
function captureGroupMessageId(
	db: DatabaseSync,
	projectId: string,
	threadId: string,
	messageId: number
): void {
	db.prepare(
		"UPDATE threads SET group_message_id = ? WHERE project_id = ? AND thread_id = ? AND group_message_id IS NULL"
	).run(messageId, projectId, threadId);
}

/**
 * Stamps the newest `[CHECKPOINT-ESTADO]` BROADCAST this batch admitted (design §8.2 step 7).
 *
 * Runs AFTER the batch committed, and the direction is deliberate: a checkpoint that lags behind the stored
 * rows is recoverable, while a checkpoint ahead of them is a claim about rows that do not exist. The
 * comparison is by `at`, so two checkpoints in one batch leave the newest one — matching the fetch
 * response's single `checkpoint` field.
 */
function recordCheckpoint(db: DatabaseSync, projectId: string, checkpoint: { at: string; by: string }): void {
	db.prepare(
		`INSERT INTO binding_state (project_id, last_checkpoint_at, last_checkpoint_by)
		 VALUES (?, ?, ?)
		 ON CONFLICT (project_id) DO UPDATE SET
		   last_checkpoint_at = excluded.last_checkpoint_at,
		   last_checkpoint_by = excluded.last_checkpoint_by`
	).run(projectId, checkpoint.at, checkpoint.by);
}

/**
 * Runs the seven-step admission pipeline over one poll batch and commits it as one write-ahead transaction.
 *
 * Throws whatever the batch writer raised, after rolling the batch back (a constraint SQLite refuses, a
 * body/outcome mismatch, or one `(bot_id, update_id)` carried twice). The additive writes noted in the
 * module header survive that rollback by design.
 */
export function admitTelegramUpdates(
	db: DatabaseSync,
	binding: AdmissionBinding,
	updates: readonly TelegramUpdate[]
): AdmissionResult {
	const counts: AdmissionCounts = {
		non_envelope: 0,
		unsupported_version: 0,
		malformed: 0,
		foreign_chat: 0,
		unknown_sender: 0,
		self_echo: 0,
		duplicate: 0,
		unanchored: 0,
		replayed: 0,
	};

	const batchEntries: InboxBatchEntry[] = [];
	const batchSeenEids = new Set<string>();
	const applyContext: ApplyContext = {
		agentId: binding.agent_id,
		roster: buildRosterRecord(binding.roster_snapshot),
	};
	let droppedCount = 0;
	let checkpoint: { at: string; by: string } | null = null;

	/** Records one drop: no `updates` row, the audit row(s) it earned, and its `update_id` moved past. */
	const pushDropped = (updateId: number, audits: readonly AuditRow[]): void => {
		droppedCount += 1;
		batchEntries.push({ kind: "dropped", update_id: updateId, audits: [...audits] });
	};

	/** One `reject`/`dropped` audit row, built from what the step that refused the update knew. */
	const rejectionAudit = (
		ts: string,
		chatId: number | null,
		reason: string,
		eid: string | null,
		envelopeType: string | null,
		fromUserId: number | null
	): AuditRow => ({
		ts,
		project_id: binding.project_id,
		bot_id: binding.bot_id,
		chat_id: chatId,
		client_id: null,
		direction: "reject",
		eid,
		envelope_type: envelopeType,
		from_user_id: fromUserId,
		to_user_id: null,
		outcome: "dropped",
		reason,
	});

	for (const update of updates) {
		const message = update.message;

		// Step 1 — `message.text` present, else `non_envelope`.
		if (!message || typeof message.text !== "string") {
			counts.non_envelope += 1;
			pushDropped(update.update_id, [
				rejectionAudit(
					toIsoFromUnixSeconds(message?.date) ?? new Date().toISOString(),
					message?.chat.id ?? null,
					"non_envelope",
					null,
					null,
					message?.from?.id ?? null
				),
			]);
			continue;
		}

		// Step 2 — the wire decode (`shared/envelope.ts` is the only decoder; see the module header).
		const decoded = decodeEnvelope(message.text);
		if (!decoded.ok) {
			counts[decoded.reason] += 1;
			pushDropped(update.update_id, [
				rejectionAudit(
					toIsoFromUnixSeconds(message.date) ?? new Date().toISOString(),
					message.chat.id,
					decoded.reason,
					null,
					null,
					message.from?.id ?? null
				),
			]);
			continue;
		}
		const envelope = decoded.envelope;

		// Step 3 — the chat scope (PT-03): this binding's group, or a private chat. Never a third room.
		const isGroup = message.chat.id === binding.group_id;
		const isPrivate = message.chat.type === "private";
		if (!isGroup && !isPrivate) {
			counts.foreign_chat += 1;
			pushDropped(update.update_id, [
				rejectionAudit(
					toIsoFromUnixSeconds(message.date) ?? new Date().toISOString(),
					message.chat.id,
					"foreign_chat",
					envelope.eid,
					envelope.type,
					message.from?.id ?? null
				),
			]);
			continue;
		}
		const via: "group" | "direct" = isGroup ? "group" : "direct";

		// Step 4 — the verified sender (PT-04, PT-16): a reverse lookup of `message.from.id`, never the
		// envelope's own `from` claim.
		const verifiedFrom = reverseRosterLookup(binding.roster_snapshot, message.from?.id);
		if (verifiedFrom === null) {
			counts.unknown_sender += 1;
			const seenAt = toIsoFromUnixSeconds(message.date) ?? new Date().toISOString();
			if (message.from !== undefined) {
				upsertUnknownSender(db, {
					bot_id: binding.bot_id,
					user_id: message.from.id,
					username: message.from.username ?? null,
					seen_at: seenAt,
				});
			}
			pushDropped(update.update_id, [
				rejectionAudit(
					seenAt,
					message.chat.id,
					"unknown_sender",
					envelope.eid,
					envelope.type,
					message.from?.id ?? null
				),
			]);
			continue;
		}

		// Step 5 — the self-filter: our own outbound envelope coming back on either plane is not news, and
		// earns no audit row (the send path already recorded it).
		if (verifiedFrom === binding.agent_id) {
			counts.self_echo += 1;
			pushDropped(update.update_id, []);
			continue;
		}

		// Step 6 — dedup, and the ORDER of the keys is load-bearing (design §8.2 step 6). PT-10's
		// `(bot_id, update_id)` is asked FIRST, because the two keys mean different things here: an update
		// this bot already stored is the batch writer's `replayed` — skipped whole, audits included, which is
		// what makes a crash replay idempotent — while the eid and thread keys below mean "a DIFFERENT update
		// carries a message we already hold", which is a `duplicate` refusal with its own audit row. Asking
		// the eid key first would relabel every crash replay as a duplicate and hide the counter PT-10 exists for.
		const replayedByUpdateId = isUpdateIdStored(db, binding.bot_id, update.update_id);
		const duplicate =
			!replayedByUpdateId &&
			(batchSeenEids.has(envelope.eid) ||
				isEidInUpdates(db, binding.project_id, envelope.eid) ||
				isEidInThreadHistory(db, binding.project_id, envelope.thread, envelope.eid) ||
				(envelope.type === "REQUEST" && isThreadHeld(db, binding.project_id, envelope.thread)));
		if (duplicate) {
			counts.duplicate += 1;
			// The additive capture belongs to the group-plane copy of a message already stored.
			if (via === "group") {
				captureGroupMessageId(db, binding.project_id, envelope.thread, message.message_id);
			}
			const discardedAt = toIsoFromUnixSeconds(message.date) ?? new Date().toISOString();
			pushDropped(update.update_id, [
				rejectionAudit(
					discardedAt,
					message.chat.id,
					"duplicate",
					envelope.eid,
					envelope.type,
					message.from?.id ?? null
				),
			]);
			continue;
		}
		batchSeenEids.add(envelope.eid);

		// Step 6′ — `message.date` as the authoritative first-seen time, or the update is `malformed`.
		// There is no honest substitute for it: `received_at` is the thread state machine's clock.
		const messageDate = toIsoFromUnixSeconds(message.date);
		if (messageDate === null) {
			counts.malformed += 1;
			pushDropped(update.update_id, [
				rejectionAudit(
					new Date().toISOString(),
					message.chat.id,
					"malformed",
					envelope.eid,
					envelope.type,
					message.from?.id ?? null
				),
			]);
			continue;
		}

		// The trusted envelope: the verified sender wins, the addressee is translated into our namespace,
		// and the body is normalized (ADR-12) — the receive side never assumes the send-side invariant.
		const trustedEnvelope: Envelope = {
			...envelope,
			from: verifiedFrom,
			to: translateAddressee(envelope, binding.roster_snapshot),
			body: normalizeBody(envelope.body),
		};
		// `updates.envelope_json` holds the validated envelope WITHOUT the body key (design §5.2's column
		// rule): the body lives in `updates.body`, where D-20 can hold it to NULL.
		const { body: _body, ...envelopeWithoutBody } = trustedEnvelope;
		const envelopeJson = JSON.stringify(envelopeWithoutBody);

		// Step 7 — the state machine over this thread's single row, then the row set the batch writes.
		const incoming: IncomingEnvelope = {
			envelope: trustedEnvelope,
			telegram_message_id: message.message_id,
			message_date: messageDate,
			via,
		};
		const applied = applyEnvelope(
			readThreadRecord(db, binding.project_id, trustedEnvelope.thread),
			incoming,
			applyContext
		);

		// `applyEnvelope` no longer returns `duplicate` (the ledger's unique index refuses a replay before
		// this module is reached), and the branch stays because the outcome union keeps the member: a caller
		// that ever sees it gets the same refusal the step-6 key gives, not a silently applied transition.
		if (applied.outcome.kind === "duplicate") {
			counts.duplicate += 1;
			if (via === "group") {
				captureGroupMessageId(db, binding.project_id, trustedEnvelope.thread, message.message_id);
			}
			pushDropped(update.update_id, [
				rejectionAudit(
					messageDate,
					message.chat.id,
					"duplicate",
					trustedEnvelope.eid,
					trustedEnvelope.type,
					message.from?.id ?? null
				),
			]);
			continue;
		}

		// Narrowed to the union member itself, not to a boolean: the reason lives on that member only.
		const rejectedOutcome = applied.outcome.kind === "rejected" ? applied.outcome : null;

		// The null-anchor count (PT-17) has two shapes, and a counter that saw only one of them would read
		// zero exactly while the check is doing its job: `unanchored` marks a transition the ADR-13
		// originator arm authorized DESPITE a null anchor (`protocol-apply`'s own contract for the flag),
		// and the reason `unanchored` marks one the null anchor REFUSED.
		if (applied.unanchored === true || rejectedOutcome?.reason === "unanchored") {
			counts.unanchored += 1;
		}

		const applyOutcome: InboxApplyOutcome = applied.outcome.kind;
		// D-20, in the direction this side owns: a rejected or ignored update stores NO body, while
		// `not_mine` and `noted` keep theirs. `commitInboxBatch` refuses the batch if this ever disagrees.
		const storedBody = BODILESS_OUTCOMES.has(applyOutcome) ? null : trustedEnvelope.body;

		pushAdmitted({
			updateId: update.update_id,
			chatId: message.chat.id,
			via,
			messageId: message.message_id,
			messageDateSeconds: message.date,
			receivedAt: messageDate,
			// Step 4 verified this id against `roster_snapshot`, so an admitted entry cannot lack it.
			fromUserId: message.from?.id ?? 0,
			fromAgentId: verifiedFrom,
			eid: trustedEnvelope.eid,
			threadId: trustedEnvelope.thread,
			envelopeJson,
			body: storedBody,
			applyOutcome,
			audit: {
				ts: messageDate,
				project_id: binding.project_id,
				bot_id: binding.bot_id,
				chat_id: message.chat.id,
				client_id: null,
				direction: rejectedOutcome !== null ? "reject" : "receive",
				eid: trustedEnvelope.eid,
				envelope_type: trustedEnvelope.type,
				from_user_id: message.from?.id ?? null,
				to_user_id:
					trustedEnvelope.to_user_id ??
					(trustedEnvelope.to !== null
						? (binding.roster_snapshot.find((entry) => entry.agent_id === trustedEnvelope.to)?.user_id ?? null)
						: null),
				outcome: rejectedOutcome !== null ? "rejected" : "ok",
				reason: rejectedOutcome !== null ? rejectedOutcome.reason : applied.outcome.kind,
			},
			thread: applied.thread,
		});

		// `[CHECKPOINT-ESTADO]` BROADCAST (design §8.2 step 7). A BROADCAST always lands as `noted` and
		// opens no thread, so the marker is the only thing it can carry.
		if (trustedEnvelope.type === "BROADCAST" && trustedEnvelope.body.startsWith(CHECKPOINT_MARKER)) {
			if (checkpoint === null || checkpoint.at < messageDate) {
				checkpoint = { at: messageDate, by: verifiedFrom };
			}
		}
	}

	/**
	 * Pushes one admitted entry — the `updates` row, the thread its transition touched (if any) and its audit
	 * row — in the exact shape `commitInboxBatch` takes (PR-12).
	 *
	 * `message_date` is Telegram's own Unix seconds, never a re-parse of the ISO string: the column is an
	 * INTEGER in the DDL, and round-tripping through `Date.parse` would silently floor a value it could not
	 * read. `thread_id` is the ENVELOPE's thread, which is the row the transition touched — not its `eid`.
	 */
	function pushAdmitted(entry: {
		updateId: number;
		chatId: number;
		via: "group" | "direct";
		messageId: number;
		messageDateSeconds: number;
		receivedAt: string;
		fromUserId: number;
		fromAgentId: string;
		eid: string;
		threadId: string;
		envelopeJson: string;
		body: string | null;
		applyOutcome: InboxApplyOutcome;
		audit: AuditRow;
		thread: ThreadRecord | undefined;
	}): void {
		batchEntries.push({
			kind: "admitted",
			update: {
				update_id: entry.updateId,
				project_id: binding.project_id,
				chat_id: entry.chatId,
				via: entry.via,
				message_id: entry.messageId,
				message_date: entry.messageDateSeconds,
				from_user_id: entry.fromUserId,
				from_agent_id: entry.fromAgentId,
				eid: entry.eid,
				envelope_json: entry.envelopeJson,
				body: entry.body,
				apply_outcome: entry.applyOutcome,
				received_at: entry.receivedAt,
			},
			thread: entry.thread !== undefined ? { thread_id: entry.threadId, record: entry.thread } : undefined,
			audits: [entry.audit],
		});
	}

	const batchResult = commitInboxBatch(db, { bot_id: binding.bot_id, entries: batchEntries });
	counts.replayed = batchResult.replayed;
	if (checkpoint !== null) {
		recordCheckpoint(db, binding.project_id, checkpoint);
	}

	return {
		inserted: batchResult.inserted,
		dropped: droppedCount,
		replayed: batchResult.replayed,
		nextUpdateId: batchResult.nextUpdateId,
		counts,
	};
}
