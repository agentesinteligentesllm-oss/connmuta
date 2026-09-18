import type { DatabaseSync } from "node:sqlite";

import { assertNoTokenShape } from "./audit.js";

/**
 * The pending unknown-sender list (`ledger/unknown-senders.ts`, ADR-0028 rule 6, design §8.2 step 4).
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against — this file carries no header of the kind
 * `test/security/provenance.test.ts` looks for and `test/fixtures/v1-provenance.json` stays at its eleven
 * entries. (That gate reads a file's *leading* `/**` block; this module begins with its imports.)
 *
 * **What this table is for.** Admission step 4 reverse-looks-up the sender in the binding's roster; a miss is
 * `unknown_sender` (PT-04), and the machine records *who* was seen so the human can decide whether to add
 * them. The table has **no body column at all** (ADR-0028 rule 6), which is the whole privacy claim: a
 * stranger's message text was never authorised for this ledger and there is nowhere to put it.
 *
 * **Three properties the callers depend on**, each pinned by `test/ledger/unknown-senders.test.ts`:
 *
 * - **`first_seen_at` is first-wins.** The row answers "since when has this stranger been around"; a
 *   first-observation stamp that moved on every message would answer "just now" for ever.
 * - **`last_seen_at` never rewinds**, which is `MAX` and not a plain assignment — the same guard
 *   `ledger/inbox.ts` applies to the offset. ISO 8601 UTC strings order lexicographically, which is what
 *   makes the comparison meaningful and what the retention sweep's cutoff relies on too; an observation that
 *   arrives out of order must not lengthen a row's life or, worse, resurrect one the sweep has aged out.
 *   **The comparison is exact only because the stored value is canonical**, and that is a correction
 *   Judgment Day round 1 forced (`JD-B-002`, independently `JD-A-003`): `parseInstant` admits any
 *   `Date.parse`-able string, and `2026-03-01T10:00:00Z` sorts *after* `2026-03-01T10:00:00.500Z` while
 *   `2026-03-01T11:00:00+05:00` is four hours earlier than both — measured, the first pair left
 *   `last_seen_at` un-advanced and the second moved it backwards, and the retention cutoff read the same
 *   text. Every instant this module stores is therefore `new Date(ms).toISOString()`, so the value written,
 *   the `MAX` that reads it and the sweep's cutoff all speak the one form the ordering needs.
 * - **`count` is an observation counter, not a deduplicated event count.** Nothing in this table can tell a
 *   re-delivered message from a new one — the poll batch's `(bot_id, update_id)` key (PT-10) is what
 *   deduplicates, and this module deliberately does not invent a second answer.
 *
 * **The username is written only when the observation carries one, and the newest non-null wins.** Telegram
 * omits `username` for an account that has none, so a plain assignment would blank the name the roster
 * screen shows; `COALESCE(excluded.username, unknown_senders.username)` keeps the last name the sender was
 * seen under, and a sender who renames is shown under the new name.
 *
 * **Two boundaries stated rather than hidden.** The numeric key is `(bot_id, user_id)` and not `user_id`
 * alone: a numeric user id is only meaningful under the bot that saw it, so the same person seen from two
 * bots is two rows rather than one that one binding's screen would show on another's. And this module opens
 * no transaction, on purpose — the poll batch is `ledger/inbox.ts`'s transaction (`withTransaction` refuses
 * a nested call), and a writer that opened its own would break the batch rather than compose inside it.
 * Called on its own, its single statement autocommits.
 */

/** One observation of a sender that is not in the binding's roster. */
export interface UnknownSenderObservation {
	/** The bot that saw them; `unknown_senders` is keyed by this and `user_id` together. */
	readonly bot_id: number;
	/** The numeric Telegram user id — the identity anchor (I-4), never the username. */
	readonly user_id: number;
	/** The name Telegram showed, when it showed one; `null` or absent means "this observation had none". */
	readonly username?: string | null;
	/** When the sighting happened, ISO 8601. */
	readonly seen_at: string;
}

/** The `unknown_senders` row as the ledger holds it. */
export interface UnknownSender {
	readonly bot_id: number;
	readonly user_id: number;
	readonly username: string | null;
	/** The FIRST sighting. Written once, never moved. */
	readonly first_seen_at: string;
	/** The LATEST sighting; monotonic, because it is a `MAX`. */
	readonly last_seen_at: string;
	/** How many sightings this row has, not how many distinct messages. */
	readonly count: number;
}

/**
 * The refusal {@link upsertUnknownSender} raises for a `seen_at` a `Date` cannot read.
 *
 * The value is compared as text (a `MAX` over ISO strings) and is the retention sweep's cutoff operand, so
 * an unreadable instant is not a cosmetic problem: `"yesterday"` would silently sort below every real
 * timestamp and the row would never age out. The refusal names the field instead, which is the same shape
 * as `ledger/cursors.ts`'s refusal for its own instant seam.
 *
 * Exported so the caller and its test pin one spelling of the refusal instead of matching prose.
 */
export const UNKNOWN_SENDER_INSTANT_INVALID_MESSAGE =
	"upsertUnknownSender: `seen_at` is not a timestamp this ledger can parse, so `first_seen_at`/`last_seen_at` would be stored as text that no cutoff can order (design §5.4).";

/**
 * Records one sighting and returns the row as the ledger now holds it.
 *
 * An upsert on `(bot_id, user_id)`: the first sighting creates the row with `count = 1` and both instants
 * equal to `seen_at`, and every later one advances `last_seen_at`, increments `count` and leaves
 * `first_seen_at` alone. The returned value is read back from the statement's own result rather than
 * computed here, so a caller is never handed arithmetic that disagrees with the row.
 *
 * Refuses a token-shaped username before the write (see `ledger/audit.ts` for why the unit refuses rather
 * than redacts), and an unreadable `seen_at`.
 */
export function upsertUnknownSender(db: DatabaseSync, observation: UnknownSenderObservation): UnknownSender {
	// Canonical, not merely parseable: the stored value is the `MAX` comparison's operand and the retention
	// sweep's cutoff operand, so an instant in any other legal form (`+05:00`, or `Z` with no milliseconds)
	// orders wrongly against it. See the module doc.
	const seenAt = new Date(parseInstant(observation.seen_at)).toISOString();
	const username = observation.username ?? null;
	assertNoTokenShape("unknown_senders.username", username);

	db.prepare(
		`INSERT INTO unknown_senders (bot_id, user_id, username, first_seen_at, last_seen_at, count)
		 VALUES (?, ?, ?, ?, ?, 1)
		 ON CONFLICT (bot_id, user_id) DO UPDATE SET
		   username = COALESCE(excluded.username, unknown_senders.username),
		   last_seen_at = MAX(unknown_senders.last_seen_at, excluded.last_seen_at),
		   count = unknown_senders.count + 1`,
	).run(observation.bot_id, observation.user_id, username, seenAt, seenAt);

	// Read back rather than constructed: `first_seen_at` is the stored one, and a reader that trusted its own
	// inputs would report the observation it just made instead of the row it produced.
	const stored = readUnknownSender(db, observation.bot_id, observation.user_id);
	if (stored === undefined) {
		throw new Error("upsertUnknownSender: the row it just wrote is not readable.");
	}
	return stored;
}

/** One sender's row, or `undefined` when this bot has never seen them. */
export function readUnknownSender(db: DatabaseSync, bot_id: number, user_id: number): UnknownSender | undefined {
	const row = db
		.prepare("SELECT bot_id, user_id, username, first_seen_at, last_seen_at, count FROM unknown_senders WHERE bot_id = ? AND user_id = ?")
		.get(bot_id, user_id) as UnknownSender | undefined;
	return row === undefined ? undefined : { ...row };
}

/** An ISO 8601 instant as epoch milliseconds, refusing anything a `Date` cannot read. */
function parseInstant(instant: string): number {
	const ms = Date.parse(instant);
	if (Number.isNaN(ms)) {
		throw new Error(UNKNOWN_SENDER_INSTANT_INVALID_MESSAGE);
	}
	return ms;
}
