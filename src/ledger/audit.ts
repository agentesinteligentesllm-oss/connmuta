import type { DatabaseSync } from "node:sqlite";

import { TELEGRAM_BOT_TOKEN_RE } from "../shared/secrets.js";

/**
 * The audit log's one writer (`ledger/audit.ts`, PT-20, design §5.1 §5.2 §5.3 §6).
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against — this file carries no header of the kind
 * `test/security/provenance.test.ts` looks for and `test/fixtures/v1-provenance.json` stays at its eleven
 * entries. (That gate reads a file's *leading* `/**` block; this module begins with its imports.)
 *
 * **This module is the shared writer, and that is the point of it.** `ledger/inbox.ts` used to carry a
 * private `insertAuditRow`, and the send path (PR-27) needs the same statement; two inserts with one
 * meaning drift the moment a column is added to one of them. So the batch writer now calls
 * {@link appendAuditRow} and `test/ledger/audit.test.ts` asserts structurally that no second
 * `INSERT INTO audit_log` exists in the unit.
 *
 * **The table has no body column at all** (design §5.2), so PT-20's "rows for rejected or foreign messages
 * must have an empty body column" is a property of the schema and not of this writer. What this writer adds
 * on top is the half a schema cannot hold: a refusal for a token-shaped string, and the append-only shape.
 *
 * **Why the token guard refuses rather than redacts, and why it lives here.** Design §6 puts
 * `redactTokenShapes` in `secret-store/redaction.ts` and has it applied by the error constructors, the log
 * writer and every audit/condition writer — but `secret-store` is **PR-14 and PR-14 depends on PR-13**, so
 * no module in this slice can import it. The two available options are (a) a second, local redactor, or
 * (b) a refusal, which cannot leak by construction. (b) is the one this unit takes: the ledger's own
 * writers refuse the shape with a message that names the column and never the value, and when PR-14 lands,
 * `redactTokenShapes` becomes the upstream sanitizer while this refusal stays the last line. That is a
 * dependency-order consequence and it is disclosed rather than hidden: the *guarantee* PT-20 states
 * ("no row may ever match the token regex") holds either way, and the mechanism is measurably different
 * from the design's sentence about redaction.
 *
 * **The guard is exported and the other two writers import it**, rather than each spelling its own copy.
 * This module is not the sink every path converges on — `unknown_senders` and `conditions` do not go
 * through the audit log — so the reason is the plain one: one spelling of a rule that three writers must
 * apply identically, which is the same reason `shared/token-shape.ts` shares its regex instead of copying
 * it.
 *
 * **Two boundaries stated rather than hidden, and one of them was wrong until Judgment Day round 1.**
 *
 * - **`updates.body` is unguarded, and the control this file originally cited for it does not exist.** The
 *   first version of this paragraph — and PT-20's cell beside it — said a peer body reaches the inbox only
 *   after "the admission pipeline's own receive-side secret scan (`SECRET_PATTERN_DETECTED`,
 *   `daemon/admission.ts`, PR-22a)". Round 1 measured that no such step exists anywhere in F1: v1's
 *   `SECRET_PATTERN_DETECTED` occurs only on the **send** path (`v1:src/tools/send.ts:163,349`),
 *   `checkForSecrets` is documented as the OUTBOUND backstop (`v1:src/secrets.ts:29-34`),
 *   `grep -i secret` over `v1:src/tools/fetch.ts` is empty, design §8.2's seven-step admission table and the
 *   `durable-inbox` spec's admission requirement list no scan step, and `tasks.md`'s PR-22a block names none.
 *   Reproduced here as well: `commitInboxBatch` with a token-shaped `body` stores it, and the ledger file's
 *   bytes match the shape. So design §6's "the ledger (no column receives it)" is **unsatisfied for the
 *   peer-body columns** — `updates.body`, and `threads.body`/`thread_history.body` by the same argument — and
 *   it is filed as **B-38** with its dispositions instead of papered over here. A guard *in this unit* would
 *   be the wrong fix: `updates.body` is written by the poll batch, and refusing the batch would leave the
 *   offset unmoved and the poller wedged on the same update for ever. The place the design already reserved
 *   for it is admission, whose audit vocabulary already carries `SECRET_PATTERN_DETECTED` (DATA-MODEL
 *   §3.6).
 * - **The third write path that scenario names — the cursor advance — is `ledger/cursors.ts`**, merged in
 *   PR-12 and frozen; a guard there is its own slice with its own audit, filed as **B-37**.
 */

/** The `direction` values design §5.2's CHECK accepts, as a type so a caller cannot hand over a fifth. */
export type AuditDirection = "send" | "receive" | "reject" | "system";

/** The `outcome` values design §5.2's CHECK accepts. */
export type AuditOutcome = "ok" | "degraded" | "rejected" | "dropped";

/**
 * One `audit_log` row — everything but the AUTOINCREMENT `id`.
 *
 * Every field is nullable except `ts`, `direction` and `outcome`, which is what the DDL says. There is no
 * body field and there cannot be one: the table has no column for it.
 */
export interface AuditRow {
	readonly ts: string;
	readonly project_id: string | null;
	readonly bot_id: number | null;
	readonly chat_id: number | null;
	readonly client_id: string | null;
	readonly direction: AuditDirection;
	readonly eid: string | null;
	readonly envelope_type: string | null;
	readonly from_user_id: number | null;
	readonly to_user_id: number | null;
	readonly outcome: AuditOutcome;
	readonly reason: string | null;
}

/**
 * The refusal {@link assertNoTokenShape} raises, as a function of the column it was looking at.
 *
 * A function rather than a constant because the column is the whole of what the message can usefully say —
 * the value is exactly what must not be repeated — and exported so a caller and its test pin one spelling
 * instead of matching prose.
 */
export function tokenShapeRefusalMessage(where: string): string {
	return `${where} carries a string shaped like a Telegram bot token, and no ledger table may ever hold one (PT-20, DATA-MODEL §3.0); refusing the write rather than storing it.`;
}

/**
 * Refuses `value` when it carries a Telegram bot-token shape; `null` and `undefined` pass through.
 *
 * The pattern is the shared export (`shared/secrets.ts`), never a second copy. It carries no `g` flag, so
 * `.test()` is stateless and this guard is safe to call in a loop — a `g`-flagged regex would carry
 * `lastIndex` between calls and start finding nothing.
 *
 * Exported for the two sibling writers in this unit (see the module doc).
 */
export function assertNoTokenShape(where: string, value: string | null | undefined): void {
	if (value === null || value === undefined) {
		return;
	}
	if (TELEGRAM_BOT_TOKEN_RE.test(value)) {
		throw new Error(tokenShapeRefusalMessage(where));
	}
}

/**
 * Appends exactly one `audit_log` row and returns nothing.
 *
 * Append-only, and there is no update or delete path in this module at all: `id` is the table's own
 * AUTOINCREMENT, so two identical events are two rows and the earlier record is never rewritten. A caller
 * that wants one row per event owns that rule — "every send, receive and reject appends exactly one row" is
 * a property of the paths (admission, PR-22a; the send path, PR-27), and this writer's contribution is that
 * it cannot collapse them.
 *
 * Refuses a token-shaped string in any of the six text columns through {@link assertNoTokenShape}, before
 * the statement runs, so a refusal is never a half-written row.
 *
 * Opens no transaction: the poll batch runs this inside its own (`withTransaction` refuses a nested call),
 * and a caller outside one gets a single autocommitted statement.
 */
export function appendAuditRow(db: DatabaseSync, row: AuditRow): void {
	assertNoTokenShape("audit_log.ts", row.ts);
	assertNoTokenShape("audit_log.project_id", row.project_id);
	assertNoTokenShape("audit_log.client_id", row.client_id);
	assertNoTokenShape("audit_log.eid", row.eid);
	assertNoTokenShape("audit_log.envelope_type", row.envelope_type);
	assertNoTokenShape("audit_log.reason", row.reason);

	db.prepare(
		`INSERT INTO audit_log (ts, project_id, bot_id, chat_id, client_id, direction, eid, envelope_type,
		                        from_user_id, to_user_id, outcome, reason)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		row.ts,
		row.project_id,
		row.bot_id,
		row.chat_id,
		row.client_id,
		row.direction,
		row.eid,
		row.envelope_type,
		row.from_user_id,
		row.to_user_id,
		row.outcome,
		row.reason,
	);
}
