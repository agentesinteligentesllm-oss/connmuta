import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { appendDebateTurn, readDebateJournal, readMaxCounterRound, type DebateJournalEntry } from "../../src/ledger/debate-journal.js";
import { openLedger, type LedgerOpenResult } from "../../src/ledger/open.js";
import { TELEGRAM_BOT_TOKEN_RE } from "../../src/shared/secrets.js";

/**
 * The Arena-light side journal (`ledger/debate-journal.ts`, F5, D7, DATA-MODEL.md §3.7).
 *
 * Mirrors `test/ledger/conditions-store.test.ts`'s harness: real `node:sqlite` over a temp file
 * opened through `ledger/open.ts`. Three properties this suite owns, each traced to a spec scenario:
 *
 * - **Scoped to `(project_id, debate_id)`** (spec "Participation and scope reuse existing invariants").
 * - **`readMaxCounterRound` counts only journaled `COUNTER` rows** (design.md "Round counting").
 * - **The round count is restart-durable** (spec "Round count survives a restart") — proven with a
 *   second `DatabaseSync` handle against the same file, not the same in-process connection.
 */

const PROJECT_ID = "project-a";
const OTHER_PROJECT_ID = "project-b";
const DEBATE_ID = "1a2b3c4d5e6f";
const OTHER_DEBATE_ID = "6f5e4d3c2b1a";
const NOW = "2026-03-01T10:00:00.000Z";

/** The fixture token, assembled so this file carries no token-shaped text of its own (seven-digit id). */
const FIXTURE_TOKEN = `1234567:${"A".repeat(35)}`;
const TOKEN_SHAPE_RE = new RegExp(TELEGRAM_BOT_TOKEN_RE.source);

/** A temp home, an open ledger, and the cleanup — the harness this suite shares with `conditions-store.test.ts`. */
function withLedger(run: (db: DatabaseSync) => void): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-debate-journal-"));
	const opened = openLedger({ homeDir: home }) as Extract<LedgerOpenResult, { status: "opened" }>;
	try {
		run(opened.db);
	} finally {
		opened.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

/** A valid `DebateJournalEntry`, so each test only states the fields it cares about. */
function entry(overrides: Partial<DebateJournalEntry> = {}): DebateJournalEntry {
	return {
		project_id: PROJECT_ID,
		debate_id: DEBATE_ID,
		round: 1,
		turn: "COUNTER",
		verdict: "APPROVE",
		eid: "a1b2c3d4e5f6",
		from_agent_id: "@alpha",
		to_agent_id: "@beta",
		refs: ["commit:abc123"],
		basis_at_close: null,
		at: NOW,
		...overrides,
	};
}

function rowCount(db: DatabaseSync): number {
	return (db.prepare("SELECT COUNT(*) AS n FROM debate_journal").get() as { n: number }).n;
}

test("appendDebateTurn/readDebateJournal round-trip, scoped to (project_id, debate_id)", () => {
	withLedger((db) => {
		appendDebateTurn(db, entry({ round: 0, turn: "PROPOSAL", verdict: null, refs: [] }));
		appendDebateTurn(db, entry({ round: 1, turn: "COUNTER", verdict: "APPROVE", refs: ["commit:abc123", "PR:#9"] }));
		// Same debate_id, different project; same project, different debate_id — neither may leak in.
		appendDebateTurn(db, entry({ project_id: OTHER_PROJECT_ID, round: 0, turn: "PROPOSAL", verdict: null, refs: [] }));
		appendDebateTurn(db, entry({ debate_id: OTHER_DEBATE_ID, round: 0, turn: "PROPOSAL", verdict: null, refs: [] }));

		const rows = readDebateJournal(db, PROJECT_ID, DEBATE_ID);

		assert.equal(rows.length, 2, "only the two rows under this exact (project_id, debate_id) come back");
		assert.equal(rows[0].turn, "PROPOSAL");
		assert.equal(rows[1].turn, "COUNTER");
		assert.deepEqual(rows[1].refs, ["commit:abc123", "PR:#9"], "refs round-trip as the array that went in, in order");
		assert.equal(typeof rows[0].id, "number");
		assert.notEqual(rows[0].id, rows[1].id, "each row gets its own id");
	});
});

test("verdict and basis_at_close round-trip as null, not as the string 'null' or undefined", () => {
	withLedger((db) => {
		appendDebateTurn(db, entry({ round: 0, turn: "PROPOSAL", verdict: null, basis_at_close: null, refs: [] }));

		const [row] = readDebateJournal(db, PROJECT_ID, DEBATE_ID);

		assert.equal(row.verdict, null);
		assert.equal(row.basis_at_close, null);
	});
});

test("basis_at_close round-trips a real value, set only on CONSENSUS/ESCALATE", () => {
	withLedger((db) => {
		appendDebateTurn(db, entry({ round: 2, turn: "CONSENSUS", verdict: null, basis_at_close: "context-shared", refs: [] }));

		const [row] = readDebateJournal(db, PROJECT_ID, DEBATE_ID);

		assert.equal(row.basis_at_close, "context-shared");
	});
});

test("readMaxCounterRound is 0 when nothing is journaled, and counts only journaled COUNTER rows", () => {
	withLedger((db) => {
		assert.equal(readMaxCounterRound(db, PROJECT_ID, DEBATE_ID), 0, "nothing journaled yet");

		appendDebateTurn(db, entry({ round: 0, turn: "PROPOSAL", verdict: null, refs: [] }));
		assert.equal(readMaxCounterRound(db, PROJECT_ID, DEBATE_ID), 0, "a PROPOSAL is not a COUNTER (design.md 'Round counting')");

		appendDebateTurn(db, entry({ round: 1, turn: "AUDIT", verdict: "APPROVE", refs: [] }));
		assert.equal(readMaxCounterRound(db, PROJECT_ID, DEBATE_ID), 0, "an AUDIT is not a COUNTER either");

		appendDebateTurn(db, entry({ round: 1, turn: "COUNTER", verdict: "APPROVE_WITH_CHANGES", refs: [] }));
		assert.equal(readMaxCounterRound(db, PROJECT_ID, DEBATE_ID), 1);

		appendDebateTurn(db, entry({ round: 2, turn: "COUNTER", verdict: "REJECT", refs: [] }));
		assert.equal(readMaxCounterRound(db, PROJECT_ID, DEBATE_ID), 2, "the max advances with a later COUNTER");
	});
});

test("readMaxCounterRound is scoped to (project_id, debate_id): another debate's COUNTER rounds never leak in", () => {
	withLedger((db) => {
		appendDebateTurn(db, entry({ round: 3, turn: "COUNTER", verdict: "APPROVE" }));
		appendDebateTurn(db, entry({ debate_id: OTHER_DEBATE_ID, round: 1, turn: "COUNTER", verdict: "APPROVE" }));

		assert.equal(readMaxCounterRound(db, PROJECT_ID, DEBATE_ID), 3);
		assert.equal(readMaxCounterRound(db, PROJECT_ID, OTHER_DEBATE_ID), 1);
	});
});

test("appendDebateTurn refuses a token-shaped value in refs, from_agent_id, to_agent_id or basis_at_close, and writes nothing", () => {
	withLedger((db) => {
		assert.equal(TOKEN_SHAPE_RE.test(FIXTURE_TOKEN), true, "non-vacuous: the fixture must be token-shaped");

		const refusals: readonly DebateJournalEntry[] = [
			entry({ refs: [FIXTURE_TOKEN] }),
			entry({ from_agent_id: FIXTURE_TOKEN }),
			entry({ to_agent_id: FIXTURE_TOKEN }),
			entry({ turn: "CONSENSUS", verdict: null, basis_at_close: FIXTURE_TOKEN }),
		];

		for (const refusal of refusals) {
			assert.throws(
				() => appendDebateTurn(db, refusal),
				(error: unknown) => {
					assert.ok(error instanceof Error);
					assert.equal(error.message.includes(FIXTURE_TOKEN), false, "a refusal must never carry the value");
					return true;
				},
			);
		}
		assert.equal(rowCount(db), 0, "a refused append writes nothing at all");
	});
});

test("readMaxCounterRound is restart-durable: a fresh connection to the same ledger file still sees the persisted max after a simulated daemon restart", () => {
	const home = mkdtempSync(join(tmpdir(), "conmuta-debate-journal-restart-"));
	try {
		const first = openLedger({ homeDir: home }) as Extract<LedgerOpenResult, { status: "opened" }>;
		appendDebateTurn(first.db, entry({ round: 1, turn: "COUNTER", verdict: "APPROVE" }));
		appendDebateTurn(first.db, entry({ round: 2, turn: "COUNTER", verdict: "REJECT" }));
		first.db.close();

		// A fresh DatabaseSync handle against the identical file path — not the same in-process
		// connection, and not `:memory:` — is what actually distinguishes "restart-durable" from
		// "this object still has the rows in a variable" (spec "Round count survives a restart").
		const second = openLedger({ homeDir: home }) as Extract<LedgerOpenResult, { status: "opened" }>;
		try {
			assert.equal(readMaxCounterRound(second.db, PROJECT_ID, DEBATE_ID), 2);
			assert.equal(readDebateJournal(second.db, PROJECT_ID, DEBATE_ID).length, 2);
		} finally {
			second.db.close();
		}
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
