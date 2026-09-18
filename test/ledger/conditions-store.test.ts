import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import {
	clearCondition,
	DAEMON_CONDITION_SCOPE,
	listConditionScopes,
	raiseCondition,
	readCondition,
	readProjectConditions,
	type ConditionDetail,
	type ConditionName,
} from "../../src/ledger/conditions-store.js";
import { openLedger } from "../../src/ledger/open.js";
import { withTransaction } from "../../src/ledger/transaction.js";
import { TELEGRAM_BOT_TOKEN_RE } from "../../src/shared/secrets.js";

/**
 * The condition store (`ledger/conditions-store.ts`, design §5.1 §5.4, `shared/tool-output.ts`'s
 * `Conditions`).
 *
 * A condition is the persistent-warning channel: it stays raised until it is resolved, which is what keeps
 * a group soft-fail from hiding an exchange. Three properties carry that meaning, and each is pinned here:
 *
 * - **`since` is first-wins while the condition stays raised.** It answers "since when", so a sweep that
 *   re-raises `open_thread_backlog` every hour must not be able to say "since the last sweep" for ever.
 *   The row is *deleted* when the condition clears, so a later raise is a new `since` — that is the whole
 *   difference between "still raised" and "raised again", and it is why `clearCondition` deletes rather
 *   than flagging.
 * - **`(scope, name)` is the key**, and the scope is a `project_id` or the literal `daemon`. Two projects
 *   raising the same condition are two rows; a store that ignored the scope would show one project's outage
 *   on every other project's status.
 * - **`detail` carries codes and ids, never prose** (DATA-MODEL §3.0). `raiseCondition` takes a structured
 *   record rather than a string, validates it against the *name's own* contract, and refuses a multi-line
 *   value and a token shape. What it cannot decide is whether a legitimate-looking single-line string is a
 *   code or an error message, so "codes and ids only" stays the caller's contract — stated here rather than
 *   claimed as enforced.
 *
 * The read side is validated against the same contract, because the shape this table feeds
 * (`Conditions`) has required members: a row whose detail cannot fill them refuses rather than rendering a
 * half-empty status.
 *
 * Real `node:sqlite` over a temp file opened through `ledger/open.ts`; every value a placeholder.
 */

const PROJECT_ID = "project-a";
const OTHER_PROJECT_ID = "project-b";
const NOW = "2026-03-01T10:00:00.000Z";

/** The fixture token, assembled so this file carries no token-shaped text of its own (seven-digit id). */
const FIXTURE_TOKEN = `1234567:${"A".repeat(35)}`;

const TOKEN_SHAPE_RE = new RegExp(TELEGRAM_BOT_TOKEN_RE.source);

/** A temp home, an open ledger, and the cleanup — the harness every test shares. */
function withLedger(run: (db: DatabaseSync) => void): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-ledger-"));
	const ledger = openLedger({ homeDir: home });
	try {
		run(ledger.db);
	} finally {
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

/** An instant `hours` after {@link NOW}, as ISO 8601. */
function afterNow(hours: number): string {
	return new Date(Date.parse(NOW) + hours * 60 * 60 * 1000).toISOString();
}

/** The row count of `conditions`, for the "nothing was written" halves. */
function rowCount(db: DatabaseSync): number {
	return (db.prepare("SELECT COUNT(*) AS n FROM conditions").get() as { n: number }).n;
}

/** The four names the daemon can raise today, with a valid detail for each — the contract's own fixtures. */
const VALID_RAISES = [
	{ scope: DAEMON_CONDITION_SCOPE, name: "ledger_quarantined", detail: { reason: "corruption" } },
	{ scope: PROJECT_ID, name: "group_outage", detail: { last_error: "TELEGRAM_CONFLICT" } },
	{ scope: PROJECT_ID, name: "state_quarantined", detail: { quarantined_path: "state.json.corrupt-1" } },
	{ scope: PROJECT_ID, name: "open_thread_backlog", detail: { count: 51 } },
] as const;

test("raising a condition creates one row, and the detail comes back as the record that went in", () => {
	withLedger((db) => {
		raiseCondition(db, { scope: PROJECT_ID, name: "group_outage", since: NOW, detail: { last_error: "TELEGRAM_CONFLICT" } });

		assert.deepEqual(readCondition(db, PROJECT_ID, "group_outage"), {
			scope: PROJECT_ID,
			name: "group_outage",
			since: NOW,
			detail: { last_error: "TELEGRAM_CONFLICT" },
		});
		assert.deepEqual(listConditionScopes(db, "group_outage"), [PROJECT_ID]);
	});
});

test("re-raising keeps since where it was and refreshes the detail", () => {
	withLedger((db) => {
		raiseCondition(db, { scope: PROJECT_ID, name: "open_thread_backlog", since: NOW, detail: { count: 51 } });
		raiseCondition(db, { scope: PROJECT_ID, name: "open_thread_backlog", since: afterNow(1), detail: { count: 63 } });

		const row = readCondition(db, PROJECT_ID, "open_thread_backlog");
		assert.equal(row?.since, NOW, "the row answers 'since when', so a re-raise may not move it");
		assert.deepEqual(row?.detail, { count: 63 }, "the count the sweep measured is the one the status shows");
		assert.equal(rowCount(db), 1, "a re-raise is one row, not a second one");
	});
});

test("the key is (scope, name): one condition raised by two projects is two rows", () => {
	withLedger((db) => {
		raiseCondition(db, { scope: PROJECT_ID, name: "group_outage", since: NOW, detail: { last_error: "TELEGRAM_CONFLICT" } });
		raiseCondition(db, { scope: OTHER_PROJECT_ID, name: "group_outage", since: afterNow(1), detail: { last_error: "RATE_LIMITED" } });

		assert.equal(rowCount(db), 2);
		assert.equal(readCondition(db, PROJECT_ID, "group_outage")?.detail?.last_error, "TELEGRAM_CONFLICT");
		assert.equal(readCondition(db, OTHER_PROJECT_ID, "group_outage")?.detail?.last_error, "RATE_LIMITED");
		assert.deepEqual(listConditionScopes(db, "group_outage"), [PROJECT_ID, OTHER_PROJECT_ID]);
	});
});

test("clearing removes the row and says whether there was one to remove", () => {
	withLedger((db) => {
		raiseCondition(db, { scope: PROJECT_ID, name: "group_outage", since: NOW, detail: { last_error: "TELEGRAM_CONFLICT" } });

		assert.equal(clearCondition(db, PROJECT_ID, "group_outage"), true);
		assert.equal(readCondition(db, PROJECT_ID, "group_outage"), undefined);
		// Clearing something that is not raised is the ordinary case — the daemon clears on every successful
		// post, not only after a failure — so it reports `false` and is not an error.
		assert.equal(clearCondition(db, PROJECT_ID, "group_outage"), false);
		assert.equal(rowCount(db), 0);
	});
});

test("a condition raised again after being cleared is a new 'since', not the old one", () => {
	withLedger((db) => {
		raiseCondition(db, { scope: PROJECT_ID, name: "group_outage", since: NOW, detail: { last_error: "TELEGRAM_CONFLICT" } });
		clearCondition(db, PROJECT_ID, "group_outage");
		raiseCondition(db, { scope: PROJECT_ID, name: "group_outage", since: afterNow(3), detail: { last_error: "RATE_LIMITED" } });

		// This is the difference between "still raised" and "raised again", and it is why clearing deletes.
		assert.equal(readCondition(db, PROJECT_ID, "group_outage")?.since, afterNow(3));
	});
});

test("the project's conditions render as the wire shape, with the absent ones null and no daemon row", () => {
	withLedger((db) => {
		raiseCondition(db, { scope: PROJECT_ID, name: "group_outage", since: NOW, detail: { last_error: "TELEGRAM_CONFLICT" } });
		raiseCondition(db, { scope: PROJECT_ID, name: "open_thread_backlog", since: afterNow(1), detail: { count: 51 } });
		raiseCondition(db, { scope: DAEMON_CONDITION_SCOPE, name: "ledger_quarantined", since: NOW, detail: { reason: "corruption" } });

		assert.deepEqual(readProjectConditions(db, PROJECT_ID), {
			group_outage: { since: NOW, last_error: "TELEGRAM_CONFLICT" },
			state_quarantined: null,
			open_thread_backlog: { count: 51, since: afterNow(1) },
		});

		// A project with nothing raised is three nulls, not an empty object: all three members exist up
		// front (design §12's note on `Conditions`), and a missing key would be a different absence.
		assert.deepEqual(readProjectConditions(db, OTHER_PROJECT_ID), {
			group_outage: null,
			state_quarantined: null,
			open_thread_backlog: null,
		});
	});
});

test("every name's detail contract is enforced on the way in", () => {
	withLedger((db) => {
		const refusals: readonly { readonly what: string; readonly name: ConditionName; readonly detail: ConditionDetail }[] = [
			{ what: "a missing required member", name: "group_outage", detail: {} },
			{ what: "a member the wire shape does not carry", name: "group_outage", detail: { last_error: "X", extra: 1 } },
			{ what: "a number where the wire shape promises a string", name: "group_outage", detail: { last_error: 7 } },
			{ what: "a count that is not a number", name: "open_thread_backlog", detail: { count: "51" } },
			{
				what: "a multi-line value, which is the shape of an error message",
				name: "group_outage",
				detail: { last_error: "boom\nstack" },
			},
			{ what: "a token-shaped value", name: "group_outage", detail: { last_error: FIXTURE_TOKEN } },
		];

		assert.equal(TOKEN_SHAPE_RE.test(FIXTURE_TOKEN), true, "non-vacuous: the fixture must be token-shaped");
		for (const refusal of refusals) {
			assert.throws(
				() => raiseCondition(db, { scope: PROJECT_ID, name: refusal.name, since: NOW, detail: refusal.detail }),
				(error: unknown) => {
					assert.ok(error instanceof Error, `expected a refusal for ${refusal.what}`);
					assert.equal(error.message.includes(FIXTURE_TOKEN), false, "a refusal must never carry the value");
					return true;
				},
			);
		}
		assert.equal(rowCount(db), 0, "a refused raise writes nothing at all");
	});
});

test("the scope a name may be raised under is part of its contract", () => {
	withLedger((db) => {
		// `ledger_quarantined` is a daemon condition (design §5.1): raised per project it would claim a
		// project's ledger was set aside when the whole file was.
		assert.throws(
			() => raiseCondition(db, { scope: PROJECT_ID, name: "ledger_quarantined", since: NOW, detail: { reason: "corruption" } }),
			(error: unknown) => error instanceof Error && error.message.includes("ledger_quarantined") === true && error.message.includes(DAEMON_CONDITION_SCOPE),
		);
		// And the converse: a project condition under the daemon scope would be rendered nowhere.
		assert.throws(
			() => raiseCondition(db, { scope: DAEMON_CONDITION_SCOPE, name: "group_outage", since: NOW, detail: { last_error: "TELEGRAM_CONFLICT" } }),
			(error: unknown) => error instanceof Error && error.message.includes("group_outage") === true,
		);
		assert.equal(rowCount(db), 0);
	});
});

test("a condition name this build does not know is refused rather than stored where nothing reads it", () => {
	withLedger((db) => {
		assert.throws(
			() =>
				raiseCondition(db, {
					scope: PROJECT_ID,
					name: "not_a_condition" as never,
					since: NOW,
					detail: { anything: 1 },
				}),
			(error: unknown) => {
				assert.ok(error instanceof Error);
				// The refusal names the field, not the value it was handed: a name is caller-supplied text and this
				// message reaches the log (`JD-B-004`).
				assert.equal(error.message.includes("condition name"), true, error.message);
				assert.equal(error.message.includes("not_a_condition"), false, "the refusal must not echo the name");
				return true;
			},
		);
		assert.equal(rowCount(db), 0);
	});
});

test("a member of Object.prototype is refused like any other unknown name, not answered by the prototype", () => {
	withLedger((db) => {
		// Plain-object lookups once answered for every member of `Object.prototype`, so `constructor` found a
		// function where a contract belongs and the caller got a bare `TypeError` instead of this store's
		// refusal (`JD-A-004`). `conditionContractRefusalMessage` is the marker: a `TypeError` is not.
		for (const name of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"] as const) {
			assert.throws(
				() => raiseCondition(db, { scope: PROJECT_ID, name: name as never, since: NOW, detail: { last_error: "X" } }),
				(error: unknown) =>
					error instanceof Error &&
					 error.constructor === Error &&
					error.message.startsWith("conditions-store:") === true,
				`expected the store's refusal for ${name}`,
			);
		}

		// A detail member named after a prototype member is a member the readers do not render — not "expects a
		// function", which is what the prototype lookup used to report.
		assert.throws(
			() => raiseCondition(db, { scope: PROJECT_ID, name: "group_outage", since: NOW, detail: { last_error: "X", toString: 1 } }),
			(error: unknown) =>
				error instanceof Error && error.message.includes("a member its readers do not render") === true && error.message.includes("toString") === false,
		);

		// And the read side: a row only raw SQL can produce, named after a prototype member, refuses with the same
		// message rather than a `TypeError`.
		db.prepare("INSERT INTO conditions (scope, name, since, detail) VALUES (?, 'constructor', ?, '{}')").run(PROJECT_ID, NOW);
		assert.throws(
			() => readCondition(db, PROJECT_ID, "constructor" as never),
			(error: unknown) => error instanceof Error && error.constructor === Error && error.message.startsWith("conditions-store:") === true,
		);
		assert.equal(rowCount(db), 1, "only the row the raw insert wrote");
	});
});

test("a `since` in a non-canonical but legal form is stored in the one form that orders", () => {
	withLedger((db) => {
		// `+05:00` is the same instant as `Z` and its text does not order against it, which is what made the
		// sibling module's `MAX` read wrongly (`JD-A-003`, independently `JD-B-002`). The stored form is the one
		// every comparison in this unit assumes.
		raiseCondition(db, { scope: PROJECT_ID, name: "open_thread_backlog", since: "2026-03-01T11:00:00+05:00", detail: { count: 51 } });

		assert.equal(readCondition(db, PROJECT_ID, "open_thread_backlog")?.since, "2026-03-01T06:00:00.000Z");
		// And the wire shape renders that same instant, not the caller's spelling.
		assert.equal(readProjectConditions(db, PROJECT_ID).open_thread_backlog?.since, "2026-03-01T06:00:00.000Z");
	});
});

test("an unparseable 'since' is refused, and so is a stored detail the wire shape cannot fill", () => {
	withLedger((db) => {
		assert.throws(
			() => raiseCondition(db, { scope: PROJECT_ID, name: "group_outage", since: "whenever", detail: { last_error: "X" } }),
			(error: unknown) => error instanceof Error && error.message.includes("since") === true,
		);

		// A row only raw SQL can produce today: the read side validates the same contract, so a status render
		// refuses instead of reporting a condition with a hole in it.
		db.prepare("INSERT INTO conditions (scope, name, since, detail) VALUES (?, 'group_outage', ?, NULL)").run(PROJECT_ID, NOW);
		assert.throws(
			() => readProjectConditions(db, PROJECT_ID),
			(error: unknown) => error instanceof Error && error.message.includes("group_outage") === true,
		);
	});
});

test("clearing one scope's condition leaves the other scope's row alone", () => {
	withLedger((db) => {
		raiseCondition(db, { scope: PROJECT_ID, name: "group_outage", since: NOW, detail: { last_error: "TELEGRAM_CONFLICT" } });
		raiseCondition(db, { scope: OTHER_PROJECT_ID, name: "group_outage", since: NOW, detail: { last_error: "RATE_LIMITED" } });

		assert.equal(clearCondition(db, PROJECT_ID, "group_outage"), true);

		// The scope is half the key on the way in *and* on the way out: a clear that filtered on the name alone
		// would take the other project's outage off its status with it. The mutant sweep found this unpinned.
		assert.equal(readCondition(db, PROJECT_ID, "group_outage"), undefined);
		assert.equal(readCondition(db, OTHER_PROJECT_ID, "group_outage")?.detail?.last_error, "RATE_LIMITED");
		assert.equal(rowCount(db), 1);
	});
});

test("a stored detail that violates its contract is refused on the way out", () => {
	withLedger((db) => {
		// A row only raw SQL can produce: the member is the right name and the wrong type, which is the case a
		// validator on the write side alone would render as `count: "51"` (the mutant sweep found this unpinned
		// too: the null-detail row below covers a different branch of the same read).
		db.prepare("INSERT INTO conditions (scope, name, since, detail) VALUES (?, 'open_thread_backlog', ?, ?)").run(
			PROJECT_ID,
			NOW,
			JSON.stringify({ count: "51" }),
		);

		assert.throws(
			() => readCondition(db, PROJECT_ID, "open_thread_backlog"),
			(error: unknown) => error instanceof Error && error.message.includes("open_thread_backlog") === true && error.message.includes("count") === true,
		);
		assert.throws(
			() => readProjectConditions(db, PROJECT_ID),
			(error: unknown) => error instanceof Error && error.message.includes("open_thread_backlog") === true,
		);
	});
});

test("the store opens no transaction of its own, so it composes inside a caller's", () => {
	withLedger((db) => {
		raiseCondition(db, { scope: PROJECT_ID, name: "group_outage", since: NOW, detail: { last_error: "TELEGRAM_CONFLICT" } });

		assert.throws(() =>
			withTransaction(db, () => {
				clearCondition(db, PROJECT_ID, "group_outage");
				raiseCondition(db, { scope: OTHER_PROJECT_ID, name: "group_outage", since: NOW, detail: { last_error: "RATE_LIMITED" } });
				throw new Error("the caller failed after the condition writes");
			}),
		);

		assert.deepEqual(listConditionScopes(db, "group_outage"), [PROJECT_ID], "both writes rolled back with the caller");
	});
});

test("all four names the daemon raises today round-trip, each under its own contract", () => {
	withLedger((db) => {
		for (const raise of VALID_RAISES) {
			raiseCondition(db, { scope: raise.scope, name: raise.name, since: NOW, detail: raise.detail });
		}
		assert.equal(rowCount(db), VALID_RAISES.length);
		assert.equal(readCondition(db, DAEMON_CONDITION_SCOPE, "ledger_quarantined")?.detail?.reason, "corruption");
		assert.equal(readCondition(db, PROJECT_ID, "state_quarantined")?.detail?.quarantined_path, "state.json.corrupt-1");
	});
});
