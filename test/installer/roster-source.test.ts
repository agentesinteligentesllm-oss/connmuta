import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../src/ledger/open.js";
import { composeRoster } from "../../src/installer/roster-source.js";

/**
 * `installer/roster-source.ts` (design.md §8.2, disclosed divergence at :170; tasks.md PR-11
 * sub-task 11.3): the roster candidate list `project bind` will present.
 *
 * Real `node:sqlite` over a temp ledger opened through `ledger/open.ts`, mirroring
 * `test/ledger/unknown-senders.test.ts`'s own harness; `unknown_senders` rows are seeded directly with
 * SQL, since seeding through `upsertUnknownSender` would pull in an instant-ordering concern this suite
 * is not about.
 */

const BOT_ID = 900000001;
const OTHER_BOT_ID = 900000002;
const SEEN_AT = "2026-09-26T10:00:00.000Z";

/** `dist/test/installer/` → the repository root, for the structural read-only check below. */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** A temp home with a real ledger open on it; closed/removed after. */
function withLedger(run: (db: DatabaseSync) => void): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-roster-source-"));
	const ledger = openLedger({ homeDir: home });
	try {
		run(ledger.db);
	} finally {
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

/** Seeds one `unknown_senders` row directly, bypassing `upsertUnknownSender`'s own ordering rules. */
function seedUnknownSender(db: DatabaseSync, botId: number, userId: number, username: string | null): void {
	db.prepare(
		`INSERT INTO unknown_senders (bot_id, user_id, username, first_seen_at, last_seen_at, count)
		 VALUES (?, ?, ?, ?, ?, 1)`,
	).run(botId, userId, username, SEEN_AT, SEEN_AT);
}

function byUserId<T extends { readonly user_id: number }>(rows: readonly T[]): T[] {
	return [...rows].sort((left, right) => left.user_id - right.user_id);
}

test("unknown_senders rows for the given bot become roster candidates, scoped to that bot", () => {
	withLedger((db) => {
		seedUnknownSender(db, BOT_ID, 200000001, "carol_example");
		seedUnknownSender(db, BOT_ID, 200000002, "dave_example");
		seedUnknownSender(db, OTHER_BOT_ID, 200000003, "erin_example");

		const roster = composeRoster({ db, botId: BOT_ID });

		assert.deepEqual(byUserId(roster), [
			{ user_id: 200000001, username: "carol_example", source: "unknown_sender" },
			{ user_id: 200000002, username: "dave_example", source: "unknown_sender" },
		]);
	});
});

test("a null unknown_senders username becomes an empty string, never null, on the candidate", () => {
	withLedger((db) => {
		seedUnknownSender(db, BOT_ID, 200000004, null);

		const roster = composeRoster({ db, botId: BOT_ID });

		assert.deepEqual(roster, [{ user_id: 200000004, username: "", source: "unknown_sender" }]);
	});
});

test("an existing roster entry wins over an unknown_senders candidate for the same user_id", () => {
	withLedger((db) => {
		seedUnknownSender(db, BOT_ID, 200000001, "carol_example");

		const roster = composeRoster({
			db,
			botId: BOT_ID,
			existingRoster: [{ agent_id: "@carol-agent", user_id: 200000001, username: "carol_renamed" }],
		});

		assert.deepEqual(roster, [
			{ user_id: 200000001, username: "carol_renamed", agent_id: "@carol-agent", source: "existing_roster" },
		]);
	});
});

test("a manual entry wins over an unknown_senders candidate for the same user_id", () => {
	withLedger((db) => {
		seedUnknownSender(db, BOT_ID, 200000002, "dave_example");

		const roster = composeRoster({
			db,
			botId: BOT_ID,
			manualEntries: [{ agent_id: "@dave-agent", user_id: 200000002, username: "dave_example" }],
		});

		assert.deepEqual(roster, [
			{ user_id: 200000002, username: "dave_example", agent_id: "@dave-agent", source: "manual" },
		]);
	});
});

test("existing roster, manual entries and unknown_senders compose together without duplicates", () => {
	withLedger((db) => {
		seedUnknownSender(db, BOT_ID, 200000001, "carol_example");
		seedUnknownSender(db, BOT_ID, 200000004, "frank_example");

		const roster = composeRoster({
			db,
			botId: BOT_ID,
			existingRoster: [{ agent_id: "@carol-agent", user_id: 200000001, username: "carol_example" }],
			manualEntries: [{ agent_id: "@grace-agent", user_id: 200000005, username: "grace_example" }],
		});

		assert.deepEqual(byUserId(roster), [
			{ user_id: 200000001, username: "carol_example", agent_id: "@carol-agent", source: "existing_roster" },
			{ user_id: 200000004, username: "frank_example", source: "unknown_sender" },
			{ user_id: 200000005, username: "grace_example", agent_id: "@grace-agent", source: "manual" },
		]);
	});
});

test("no source at all composes to an empty roster", () => {
	withLedger((db) => {
		assert.deepEqual(composeRoster({ db, botId: BOT_ID }), []);
	});
});

test("roster-source.ts never issues a write statement against the ledger", () => {
	const source = readFileSync(join(REPO_ROOT, "src", "installer", "roster-source.ts"), "utf8");
	assert.doesNotMatch(source, /\b(INSERT|UPDATE|DELETE)\b/i);
});
