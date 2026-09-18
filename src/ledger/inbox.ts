import type { DatabaseSync } from "node:sqlite";

import type { ThreadRecord } from "../shared/thread-record.js";
import { writeThreadRecord } from "./threads.js";
import { withTransaction } from "./transaction.js";

/**
 * The write-ahead inbox transaction (`ledger/inbox.ts`, design §5.3): one transaction per poll batch,
 * and the offset advance inside it.
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against — this file carries no header of the kind
 * `test/security/provenance.test.ts` looks for and `test/fixtures/v1-provenance.json` stays at its
 * eleven entries. (That gate reads a file's *leading* `/**` block; this module begins with its imports.)
 *
 * **The order inside the transaction is the whole point, and the reason is I-3.** Every admitted update
 * is written to `updates`, its thread row to `threads`/`thread_history` and its audit rows to `audit_log`;
 * every dropped update leaves its audit rows; and *then* the offset moves. Nothing outside this function
 * tells Telegram anything: the value the caller may send to `getUpdates` is the one returned
 * ({@link InboxBatchResult.nextUpdateId}), and it is read **inside** the transaction that committed the
 * rows it names. A crash after `COMMIT` but before that value is used costs a redelivery and nothing else:
 * the re-served batch meets `(bot_id, update_id)` and is counted `replayed` (PT-10). A crash before
 * `COMMIT` costs the whole batch, which Telegram then re-serves, and nothing was lost.
 *
 * The subtle half of that is that an offset is a promise about a *range*: `max(update_id) + 1` says
 * "everything at or below this is stored". It is therefore computed over **every** entry the batch
 * carried — admitted, dropped and self-filtered alike — because an update that was dropped still has to
 * be moved past or Telegram re-serves it for ever, and it is written last (design §5.3).
 *
 * **What this module is not.** `updates.envelope_json`'s "validated envelope WITHOUT the body key" is
 * *not* checked here; the admission pipeline (PR-22a) builds that string and this unit does not re-parse
 * it. Nor does this module classify anything: it writes the classifications it is handed. And the one
 * coupling it does enforce — D-20's, through {@link INBOX_BODY_OUTCOME_MISMATCH_MESSAGE} — is the only one
 * design §5.2 names as this writer's: an admitted entry whose outcome touched a thread row is **not**
 * required to carry one, because `ApplyResult.thread`'s contract ("present only when this transition
 * opened or updated one") belongs to the caller that forwards it. A `resolved` update stored without its
 * thread row therefore leaves that thread open, which is a visible wrong answer rather than a corrupt
 * log — stated here so the omission is a decision and not an oversight.
 *
 * **Three boundaries stated rather than hidden**, all of them places where a reader might assume more.
 *
 * - **A duplicate `eid` refuses the whole batch.** The dedup this writer owns is PT-10's
 *   `(bot_id, update_id)`; `seen_eids` — `UNIQUE (project_id, eid)` — is enforced by the schema, and a
 *   batch carrying an `eid` already stored is rolled back rather than having that one row quietly skipped.
 *   Classification is design §8.2 step 6's job, so a caller that skips it gets a loud refusal instead of a
 *   silent duplicate. The deliberate consequence: a poller that keeps handing over the same duplicate
 *   keeps failing rather than making progress, which is the failure this repository prefers to a
 *   half-written batch.
 * - **A repeated `(bot_id, update_id)` *inside one batch* refuses it too.**
 *   {@link INBOX_DUPLICATE_UPDATE_ID_MESSAGE} is a refusal rather than a second `replayed`, because
 *   `replayed` means "an earlier transaction already committed this" and because the alternative — skipping
 *   the entry whole, as the replay path does — would discard its `eid`, its thread row and its audit rows
 *   with nothing to show for it. Telegram does not repeat an update id within one response, so this only
 *   ever fires on a caller's own duplication.
 * - **A replayed *drop* is audited again.** A dropped update writes no `updates` row, so the key PT-10
 *   names has nothing to match it against and a second poll appends a second audit row. `inserted` stays
 *   honest at 0 and nothing is surfaced twice; the audit log is append-only, and a second honest record of
 *   having seen the same update is not the same defect as writing the update twice.
 */

/**
 * The eight `apply_outcome` values design §5.2's CHECK accepts, in the DDL's own order.
 *
 * Named as a type so a caller cannot hand over a ninth: SQLite would refuse it, but only after the
 * transaction had started, and a refusal that is a type error at the call site costs nothing at runtime.
 */
export type InboxApplyOutcome = "opened" | "acked" | "replied" | "resolved" | "noted" | "not_mine" | "ignored" | "rejected";

/**
 * One row of `updates`, as the admission pipeline hands it over — everything but the AUTOINCREMENT `seq`
 * and the two columns the batch itself supplies (`bot_id` from the batch, `update_id` from the entry).
 */
export interface InboxUpdateInput {
	/** Telegram's own update id; with the batch's `bot_id` this is PT-10's replay key. */
	readonly update_id: number;
	readonly project_id: string;
	readonly chat_id: number;
	readonly via: "group" | "direct";
	readonly message_id: number;
	/** Telegram's `message.date` in Unix seconds — `updates.message_date` is INTEGER, unlike `threads.opened_at`. */
	readonly message_date: number;
	readonly from_user_id: number;
	/** The VERIFIED sender, from the reverse-roster lookup — never the envelope's own `from` (ADR-10). */
	readonly from_agent_id: string;
	readonly eid: string;
	/** The validated envelope, without the body key. */
	readonly envelope_json: string;
	/** `NULL` exactly for {@link InboxApplyOutcome} `rejected` and `ignored`; see {@link INBOX_BODY_OUTCOME_MISMATCH_MESSAGE}. */
	readonly body: string | null;
	readonly apply_outcome: InboxApplyOutcome;
	/** When the update arrived, ISO 8601. Also the thread's `updated_at` when the entry carries one. */
	readonly received_at: string;
}

/** The thread transition an admitted update produced, if it produced one. */
export interface InboxThreadUpdate {
	readonly thread_id: string;
	readonly record: ThreadRecord;
}

/**
 * One `audit_log` row, as the admission pipeline hands it over — everything but the AUTOINCREMENT `id`.
 *
 * The table has no body column at all (PT-20), so there is nothing here to omit; every field is nullable
 * except `ts`, `direction` and `outcome`, matching the DDL.
 */
export interface InboxAuditRow {
	readonly ts: string;
	readonly project_id: string | null;
	readonly bot_id: number | null;
	readonly chat_id: number | null;
	readonly client_id: string | null;
	readonly direction: "send" | "receive" | "reject" | "system";
	readonly eid: string | null;
	readonly envelope_type: string | null;
	readonly from_user_id: number | null;
	readonly to_user_id: number | null;
	readonly outcome: "ok" | "degraded" | "rejected" | "dropped";
	readonly reason: string | null;
}

/**
 * One update the admission pipeline admitted: an `updates` row, the thread its transition touched (if any),
 * and the audit rows it earned.
 */
export interface InboxAdmittedEntry {
	readonly kind: "admitted";
	readonly update: InboxUpdateInput;
	/**
	 * Present only when the transition opened or updated a thread row. `applyEnvelope` returns a `thread`
	 * for exactly those outcomes (`noted`, `not_mine`, `ignored`, `rejected` and `duplicate` touch no row),
	 * so a caller forwards its `ApplyResult.thread` verbatim and this stays `undefined` on its own.
	 */
	readonly thread?: InboxThreadUpdate;
	readonly audits?: readonly InboxAuditRow[];
}

/**
 * One update that was dropped: no `updates` row, no thread, and the audit rows the drop earned — which
 * may be none at all. That empty case is design §8.2 step 5's self-filter, "dropped uncounted", and it is
 * still an entry here because its `update_id` has to be moved past.
 */
export interface InboxDroppedEntry {
	readonly kind: "dropped";
	readonly update_id: number;
	readonly audits?: readonly InboxAuditRow[];
}

/** One entry of a poll batch. */
export type InboxBatchEntry = InboxAdmittedEntry | InboxDroppedEntry;

/** Everything one poll batch writes. */
export interface InboxBatch {
	/** The bot that polled; `updates` and `offsets` are both keyed by it. */
	readonly bot_id: number;
	/** The batch, in the order it was classified. Order matters only to which statement fails first. */
	readonly entries: readonly InboxBatchEntry[];
}

/** What one poll batch did. */
export interface InboxBatchResult {
	/** `updates` rows this batch actually wrote. */
	readonly inserted: number;
	/**
	 * Entries whose `(bot_id, update_id)` was **already stored by an earlier transaction** — PT-10's
	 * redelivery — and which were therefore skipped whole.
	 *
	 * A repeat *within one batch* is not this: it is refused outright
	 * ({@link INBOX_DUPLICATE_UPDATE_ID_MESSAGE}), because counting it here would silently discard the
	 * second entry's `eid`, thread row and audit rows.
	 */
	readonly replayed: number;
	/**
	 * The offset to send to `getUpdates` on the next call, read from `offsets` inside the committing
	 * transaction — or `null` when the batch carried no update at all, in which case nothing moved.
	 */
	readonly nextUpdateId: number | null;
}

/**
 * The refusal {@link commitInboxBatch} raises when a row's body and its outcome disagree.
 *
 * D-20's rule is a coupling — `updates.body` is `NULL` **exactly** for `rejected` and `ignored`, so a body
 * reaches the ledger only after passing every receive-side invariant — and design §5.2's DDL deliberately
 * does not enforce it (SQLite accepts a `rejected` row carrying a body; measured in PR-10). This writer is
 * where it is enforced, in both directions: a kept-body outcome with a `null` body is refused for the same
 * reason as a bodiless outcome with one, because a writer that half-checks would let the two columns drift
 * apart from the other side.
 *
 * Refusing rather than normalizing is deliberate. Silently stripping a body would delete the evidence of a
 * classification bug, which is the failure this repository treats as the worst kind.
 *
 * Exported so the caller and its test pin one spelling of the refusal instead of matching prose.
 */
export const INBOX_BODY_OUTCOME_MISMATCH_MESSAGE =
	"commitInboxBatch: updates.body must be NULL exactly for apply_outcome 'rejected' and 'ignored', and must carry the body for every other outcome (D-20); refusing the batch rather than storing a coupling the DDL cannot enforce (design §5.2).";

/** The outcomes `updates.body` is `NULL` for, and the only ones (D-20, design §5.2) — the set, not a list. */
const BODILESS_OUTCOMES: ReadonlySet<InboxApplyOutcome> = new Set<InboxApplyOutcome>(["rejected", "ignored"]);

/**
 * The refusal {@link commitInboxBatch} raises when two entries in one batch carry the same
 * `(bot_id, update_id)`.
 *
 * Two entries with one identity is a caller's bug — Telegram does not repeat an update id within a single
 * `getUpdates` response — and neither available behaviour is acceptable: counting the second as `replayed`
 * would make that counter mean something other than "an earlier transaction already stored this", and
 * skipping the entry whole (which is what the replay path does) would discard its `eid`, its thread row and
 * every one of its audit rows with nothing left to show that it was ever seen. Refusing is the only
 * outcome that neither lies nor loses.
 *
 * Exported so the caller and its test pin one spelling of the refusal instead of matching prose.
 */
export const INBOX_DUPLICATE_UPDATE_ID_MESSAGE =
	"commitInboxBatch: two entries in one batch carry the same (bot_id, update_id), and Telegram does not repeat an update id within one response; refusing the batch rather than counting the second as a replayed update and silently discarding its eid, thread row and audit rows (PT-10).";

/**
 * Writes one poll batch and moves the offset, inside one write transaction (design §5.3).
 *
 * Returns what it did. The returned {@link InboxBatchResult.nextUpdateId} is the value the caller may
 * pass to `getUpdates` — and only now, because this call returning *is* the commit having returned.
 *
 * Throws whatever the transaction raised, after rolling the whole batch back: a constraint SQLite refuses,
 * or one of this writer's own refusals — {@link INBOX_BODY_OUTCOME_MISMATCH_MESSAGE} for a row whose body
 * and outcome disagree, {@link INBOX_DUPLICATE_UPDATE_ID_MESSAGE} for one identity carried twice. Every
 * path leaves the connection outside any transaction, because the poller reuses it.
 */
export function commitInboxBatch(db: DatabaseSync, batch: InboxBatch): InboxBatchResult {
	return withTransaction(db, () => {
		let inserted = 0;
		let replayed = 0;
		let highestUpdateId: number | null = null;
		const batchUpdateIds = new Set<number>();

		for (const entry of batch.entries) {
			const updateId = entry.kind === "admitted" ? entry.update.update_id : entry.update_id;
			// An identity repeated inside one batch, before anything is written for it: see
			// INBOX_DUPLICATE_UPDATE_ID_MESSAGE for why this is a refusal and not a second `replayed`.
			if (batchUpdateIds.has(updateId)) {
				throw new Error(INBOX_DUPLICATE_UPDATE_ID_MESSAGE);
			}
			batchUpdateIds.add(updateId);
			// Over every entry, admitted or not: an update this batch dropped still has to be moved past, or
			// the next poll is served it again for ever. Deliberately the MAXIMUM and not the last one seen.
			highestUpdateId = highestUpdateId === null ? updateId : Math.max(highestUpdateId, updateId);

			if (entry.kind === "admitted") {
				if (alreadyStored(db, batch.bot_id, entry.update.update_id)) {
					// The crash replay. This row committed in an earlier transaction, and so did everything the
					// entry's thread and audit writes produced, because all of it is in that same transaction —
					// so the entry is skipped whole rather than rewritten idempotently. Writing the audits again
					// would be the one thing here that is *not* idempotent.
					replayed += 1;
					continue;
				}
				assertBodyMatchesOutcome(entry.update);
				insertUpdate(db, batch.bot_id, entry.update);
				inserted += 1;
				if (entry.thread !== undefined) {
					writeThreadRecord(db, {
						project_id: entry.update.project_id,
						thread_id: entry.thread.thread_id,
						record: entry.thread.record,
						updated_at: entry.update.received_at,
					});
				}
			}

			for (const audit of entry.audits ?? []) {
				insertAuditRow(db, audit);
			}
		}

		if (highestUpdateId === null) {
			return { inserted, replayed, nextUpdateId: null };
		}
		return { inserted, replayed, nextUpdateId: advanceOffset(db, batch.bot_id, highestUpdateId + 1) };
	});
}

/** Whether this bot's inbox already holds this update — PT-10's replay key, `(bot_id, update_id)`. */
function alreadyStored(db: DatabaseSync, bot_id: number, update_id: number): boolean {
	const row = db.prepare("SELECT 1 AS present FROM updates WHERE bot_id = ? AND update_id = ?").get(bot_id, update_id);
	return row !== undefined;
}

/**
 * Refuses a row whose body and outcome disagree, in either direction (D-20).
 *
 * One comparison rather than two branches, because the rule is an equivalence and writing it as one
 * expression is what keeps the two directions from being *implemented* at different times.
 */
function assertBodyMatchesOutcome(update: InboxUpdateInput): void {
	if (BODILESS_OUTCOMES.has(update.apply_outcome) !== (update.body === null)) {
		throw new Error(INBOX_BODY_OUTCOME_MISMATCH_MESSAGE);
	}
}

/** Writes one `updates` row. `seq` is the table's own AUTOINCREMENT and is never supplied. */
function insertUpdate(db: DatabaseSync, bot_id: number, update: InboxUpdateInput): void {
	db.prepare(
		`INSERT INTO updates (bot_id, update_id, project_id, chat_id, via, message_id, message_date,
		                      from_user_id, from_agent_id, eid, envelope_json, body, apply_outcome, received_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		bot_id,
		update.update_id,
		update.project_id,
		update.chat_id,
		update.via,
		update.message_id,
		update.message_date,
		update.from_user_id,
		update.from_agent_id,
		update.eid,
		update.envelope_json,
		update.body,
		update.apply_outcome,
		update.received_at,
	);
}

/** Writes one `audit_log` row. `id` is the table's own AUTOINCREMENT and is never supplied. */
function insertAuditRow(db: DatabaseSync, audit: InboxAuditRow): void {
	db.prepare(
		`INSERT INTO audit_log (ts, project_id, bot_id, chat_id, client_id, direction, eid, envelope_type,
		                        from_user_id, to_user_id, outcome, reason)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		audit.ts,
		audit.project_id,
		audit.bot_id,
		audit.chat_id,
		audit.client_id,
		audit.direction,
		audit.eid,
		audit.envelope_type,
		audit.from_user_id,
		audit.to_user_id,
		audit.outcome,
		audit.reason,
	);
}

/**
 * Moves a bot's offset to `nextUpdateId` — or leaves it where it is, if it is already past — and returns the
 * value the ledger now holds.
 *
 * **An upsert where design §5.3 writes a plain `UPDATE`**, and the deviation is deliberate: nothing in F1
 * creates the `offsets` row — the design's `UPDATE` assumes a row some other step owns, and no such step
 * exists in this unit or any earlier one (measured: `offsets` appears nowhere in `src/` outside the DDL
 * and this statement). A first poll that updated nothing would leave the offset unstored, so Telegram would
 * re-serve that same first batch on every restart for ever — the difference between a redelivery and a
 * permanently stuck poller. Creating the row here is the smaller claim: the writer that advances the
 * offset owns the row that holds it.
 *
 * **The move is forward-only**, which is the second half of that deviation and is `MAX(...)` rather than a
 * plain assignment. An offset is a promise about a *range* — everything at or below it is stored — so a
 * batch whose highest `update_id` sits *below* the offset already stored (a window Telegram re-served after
 * a restart) must not pull that promise backwards: rewinding would ask for the whole older window again.
 * In a healthy run the guard never fires, because Telegram serves `update_id >= offset`; it is there so the
 * property is the writer's rather than a coincidence of the Bot API's.
 *
 * **The value is read back rather than echoed**, and that is a guarantee with a test that can fail rather
 * than a figure of speech: with the guard above, the value the ledger holds and the value this writer
 * computed genuinely differ whenever the offset was already ahead, and
 * `test/ledger/inbox.test.ts` pins exactly that case — a mutant that returns `nextUpdateId` instead of
 * reading it back dies on it.
 */
function advanceOffset(db: DatabaseSync, bot_id: number, nextUpdateId: number): number {
	db.prepare(
		`INSERT INTO offsets (bot_id, next_update_id) VALUES (?, ?)
		 ON CONFLICT (bot_id) DO UPDATE SET next_update_id = MAX(offsets.next_update_id, excluded.next_update_id)`,
	).run(bot_id, nextUpdateId);

	const row = db.prepare("SELECT next_update_id AS value FROM offsets WHERE bot_id = ?").get(bot_id) as { value: number };
	return row.value;
}
