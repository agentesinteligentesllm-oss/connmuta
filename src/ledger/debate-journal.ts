import type { DatabaseSync } from "node:sqlite";

import { assertNoTokenShape } from "./audit.js";
import type { DebateTurnKind, DebateVerdict } from "../shared/debate-marker.js";

/**
 * The Arena-light side journal (`ledger/debate-journal.ts`, F5, D7; DATA-MODEL.md §3.7).
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused
 * line by line, so there is nothing to pin against — this file carries no header of the kind
 * `test/security/provenance.test.ts` looks for and `test/fixtures/v1-provenance.json` stays at its
 * eleven entries. (That gate reads a file's *leading* `/**` block; this module begins with its imports.)
 *
 * **What this table is for.** Debate metadata cannot ride the wire — an envelope field the decoder
 * does not recognise is stripped (v1 `src/envelope.ts:115`) — so the daemon journals it here instead,
 * from the body markers `shared/debate-marker.ts` recognises. This module is the table's only writer
 * and reader (`design.md` "File Changes": `ledger/debate-journal.ts` — "Writer/reader, mirrors
 * `conditions-store.ts`").
 *
 * **One row per marker, never merged.** A coalesced AUDIT+COUNTER reply is one wire send but two
 * journal rows sharing one `eid` (design.md Architecture Decisions, "Journal rows/send") — `turn` is
 * a single-value CHECK (DATA-MODEL §3.7), so a row cannot represent two turns at once.
 *
 * **Round counting is `readMaxCounterRound`'s job, and it counts only journaled `COUNTER` rows**
 * (design.md Architecture Decisions, "Round counting": "Increments only on journaled COUNTER; cap =
 * `readMaxCounterRound+1`"). A PROPOSAL or an AUDIT never advances it — the cap governs how many
 * COUNTER turns a debate may reach, not how many turns of any kind.
 *
 * **Restart-durable by construction, not by any in-process cache.** `readMaxCounterRound` is a plain
 * `SELECT MAX(...)` against the file-backed table; a daemon restart opens a fresh `DatabaseSync`
 * handle against the same `ledger.db` and the query answers the same way, because nothing about the
 * count lives anywhere but the row (spec "Round count survives a restart").
 *
 * **`refs` is stored as a JSON array in one TEXT column**, the same shape `conditions-store.ts` uses
 * for `detail`: a debate turn's pointer list is read and written as a whole, never queried by member,
 * so there is no reason to normalize it into its own table.
 *
 * **Every free-text column is guarded against a token shape before the write**, the same rule
 * `ledger/audit.ts`, `ledger/conditions-store.ts` and `ledger/unknown-senders.ts` apply to theirs —
 * and not a convention borrowed by analogy here: `openspec/specs/ledger/spec.md`'s "No token in any
 * ledger table" requirement names `debate_journal` explicitly alongside `offsets`, `updates`,
 * `threads`, `client_cursors` and `audit_log`. `refs` is the column most likely to carry it, since its
 * pointer strings are the one thing in this table a caller composes from free text rather than from
 * an already-pattern-constrained field (`eid`/`from_agent_id`/`to_agent_id` are already regex-shaped
 * upstream by `shared/envelope.ts`, but this module does not assume its callers always go through
 * that schema, so it guards every text column rather than trusting the shape of the id).
 *
 * **This module opens no transaction.** The send path's is `daemon/send/send-path.ts`'s own
 * `withTransaction` block (design.md Data Flow: "`withTransaction`: thread write + audit +
 * `appendDebateTurn`×N"), and `withTransaction` refuses a nested call. Called on its own, each
 * statement autocommits.
 *
 * **`turn` is DB-CHECK-closed; `verdict` and `basis_at_close` are not.** `ledger/schema.ts`'s own doc
 * comment states the reason: their closed token sets are fixed in F5's TypeScript types rather than a
 * second DDL CHECK, "the same 'open string, not a DB-level closed enum' choice `audit_log.reason`'s
 * own doc states" — so this module's read side casts them through the `DebateVerdict | null` type
 * rather than re-validating a set the type system already owns, the same trust boundary
 * `ledger/schema.ts` describes.
 */

/** One journaled debate turn, exactly as `appendDebateTurn` writes it and `readDebateJournal` reads it back. */
export interface DebateJournalEntry {
	readonly project_id: string;
	readonly debate_id: string;
	readonly round: number;
	readonly turn: DebateTurnKind;
	readonly verdict: DebateVerdict | null;
	readonly eid: string;
	readonly from_agent_id: string;
	readonly to_agent_id: string;
	/** Pointer-only payloads (commit, PR, path, memory id) — never an inline diff (D7). */
	readonly refs: readonly string[];
	/** Set only on CONSENSUS/ESCALATE. */
	readonly basis_at_close: string | null;
	readonly at: string;
}

/** A journaled entry as the ledger holds it, with its own row id. */
export interface DebateJournalRow extends DebateJournalEntry {
	readonly id: number;
}

/** The raw shape `node:sqlite` hands back before `refs` is JSON-parsed and the enums are re-typed. */
interface RawDebateJournalRow {
	readonly id: number;
	readonly project_id: string;
	readonly debate_id: string;
	readonly round: number;
	readonly turn: string;
	readonly verdict: string | null;
	readonly eid: string;
	readonly from_agent_id: string;
	readonly to_agent_id: string;
	readonly refs: string;
	readonly basis_at_close: string | null;
	readonly at: string;
}

/**
 * Appends one journaled turn.
 *
 * Refuses a token-shaped value in any free-text column (`project_id`, `debate_id`, `eid`,
 * `from_agent_id`, `to_agent_id`, `basis_at_close`, or any element of `refs`) before the statement
 * runs, so a refusal is never a half-written row — the same shape `ledger/audit.ts`'s
 * `appendAuditRow` and `ledger/conditions-store.ts`'s `raiseCondition` already apply to theirs.
 */
export function appendDebateTurn(db: DatabaseSync, entry: DebateJournalEntry): void {
	assertNoTokenShape("debate_journal.project_id", entry.project_id);
	assertNoTokenShape("debate_journal.debate_id", entry.debate_id);
	assertNoTokenShape("debate_journal.eid", entry.eid);
	assertNoTokenShape("debate_journal.from_agent_id", entry.from_agent_id);
	assertNoTokenShape("debate_journal.to_agent_id", entry.to_agent_id);
	assertNoTokenShape("debate_journal.basis_at_close", entry.basis_at_close);
	entry.refs.forEach((ref, index) => assertNoTokenShape(`debate_journal.refs[${index}]`, ref));

	db.prepare(
		`INSERT INTO debate_journal (project_id, debate_id, round, turn, verdict, eid, from_agent_id, to_agent_id, refs, basis_at_close, at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		entry.project_id,
		entry.debate_id,
		entry.round,
		entry.turn,
		entry.verdict,
		entry.eid,
		entry.from_agent_id,
		entry.to_agent_id,
		JSON.stringify(entry.refs),
		entry.basis_at_close,
		entry.at,
	);
}

/**
 * The highest `round` journaled for a COUNTER in this debate, or 0 when none has been journaled yet.
 *
 * A plain read against the file-backed table (see the module doc on why that makes it
 * restart-durable), scoped to `(project_id, debate_id)` like every other read here. The cap a caller
 * enforces is this value plus one (design.md "Round counting"); this function only ever reports what
 * is already durable, never an in-process count a caller could reset by restarting.
 */
export function readMaxCounterRound(db: DatabaseSync, project_id: string, debate_id: string): number {
	const row = db
		.prepare(`SELECT MAX(round) AS max_round FROM debate_journal WHERE project_id = ? AND debate_id = ? AND turn = 'COUNTER'`)
		.get(project_id, debate_id) as { max_round: number | null };
	return row.max_round ?? 0;
}

/** Every journaled turn for one debate, oldest first — scoped to `(project_id, debate_id)`. */
export function readDebateJournal(db: DatabaseSync, project_id: string, debate_id: string): readonly DebateJournalRow[] {
	const rows = db
		.prepare(
			`SELECT id, project_id, debate_id, round, turn, verdict, eid, from_agent_id, to_agent_id, refs, basis_at_close, at
			 FROM debate_journal WHERE project_id = ? AND debate_id = ? ORDER BY id ASC`,
		)
		.all(project_id, debate_id) as unknown as RawDebateJournalRow[];
	return rows.map(parseRow);
}

/** One raw row, with `refs` JSON-parsed back into an array and the enum columns re-typed. */
function parseRow(row: RawDebateJournalRow): DebateJournalRow {
	return {
		id: row.id,
		project_id: row.project_id,
		debate_id: row.debate_id,
		round: row.round,
		turn: row.turn as DebateTurnKind,
		verdict: row.verdict as DebateVerdict | null,
		eid: row.eid,
		from_agent_id: row.from_agent_id,
		to_agent_id: row.to_agent_id,
		refs: JSON.parse(row.refs) as readonly string[],
		basis_at_close: row.basis_at_close,
		at: row.at,
	};
}
