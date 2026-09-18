import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { appendAuditRow, type AuditRow } from "../../src/ledger/audit.js";
import { raiseCondition } from "../../src/ledger/conditions-store.js";
import { commitInboxBatch, type InboxBatchEntry } from "../../src/ledger/inbox.js";
import { openLedger } from "../../src/ledger/open.js";
import { TELEGRAM_BOT_TOKEN_RE } from "../../src/shared/secrets.js";
import { upsertUnknownSender } from "../../src/ledger/unknown-senders.js";

/**
 * The audit log and the ledger's token-shape backstop (`ledger/audit.ts`, PT-20, design §5.2 §6).
 *
 * PT-20 has two halves and this suite pins both from the ledger's own side:
 *
 * - **"Every send, receive and reject appends exactly one row, and a rejected or foreign message's row
 *   carries no body."** The body half is a property of the schema — `audit_log` has no body column at all
 *   — so what is pinned here is that the *paths* write exactly one row through the one shared writer, and
 *   that a reject leaves nothing else behind either.
 * - **"No row may ever match the token regex."** The writers covered here are the audit log, the pending
 *   unknown-sender list and the condition store; the fixture token is driven through every text field of
 *   each, and the assertion is over the ledger *file's bytes* rather than over the rows, because a row
 *   that was never written is not what the requirement is about — a value that never landed is.
 *
 * **The scan needs a control, or it proves nothing.** A scan that returns `false` because it is looking for
 * the wrong thing, or because it is reading an empty file, passes exactly as loudly as a clean ledger does.
 * The last half of the last test writes the fixture token with raw SQL — bypassing every writer — and
 * asserts the same scan then reports it. That is what makes the earlier `false` evidence.
 *
 * **What this file does not cover, stated so the omission is a decision.**
 *
 * - `updates.body` carries a peer's message text, and the ledger's writers do not refuse a token shape
 *   there: a body reaches `updates` only after the admission pipeline's own receive-side secret scan
 *   (`SECRET_PATTERN_DETECTED`, `daemon/admission.ts` in PR-22a) — the ledger is not the scan's home.
 * - `cursor advance` is the third write path the `ledger` spec's "No token in any ledger table" scenario
 *   names, and it lives in `ledger/cursors.ts`, merged in PR-12 and frozen; a guard there is its own slice
 *   with its own audit, not a drive-by edit to this one. Filed rather than silently absorbed.
 *
 * Real `node:sqlite` over a temp file opened through `ledger/open.ts`, one ledger per test, and every value
 * a placeholder (AGENTS.md §3).
 */

/** The one bot and project this suite's ledger holds. */
const BOT_ID = 900000001;
const PROJECT_ID = "project-a";
const NOW = "2026-03-01T10:00:00.000Z";

/**
 * The fixture token, assembled so that this *file* carries no token-shaped text of its own.
 *
 * Two independent reasons, both measured elsewhere in this repository:
 *
 * - `\d+:[A-Za-z0-9_-]{35}` is what the writers refuse, and a seven-digit bot id still matches it
 *   (`test/registry/loader.test.ts:346` pins that relation against this same shape);
 * - the repository's own committed-text scan (PT-22) looks for `\b\d{8,10}:` and would fail this file if
 *   the literal carried eight digits — which is why the fixtures in this repository use seven.
 */
const FIXTURE_TOKEN = `1234567:${"A".repeat(35)}`;

/** The token shape, a private non-global copy: a `g`-flagged regex carries `lastIndex` between calls. */
const TOKEN_SHAPE_RE = new RegExp(TELEGRAM_BOT_TOKEN_RE.source);

/** `dist/test/ledger/` → the repository root, for the two structural reads below. */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * The string columns of `audit_log`, as an array of `AuditRow` keys.
 *
 * Typed against the interface so a renamed field is a compile error here rather than a loop that silently
 * stops covering a column.
 */
const AUDIT_TEXT_FIELDS: readonly (keyof AuditRow)[] = ["ts", "project_id", "client_id", "eid", "envelope_type", "reason"];

/** A temp home, an open ledger plus its path, and the cleanup — the harness every test shares. */
function withLedger(run: (db: DatabaseSync, path: string) => void): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-ledger-"));
	const ledger = openLedger({ homeDir: home });
	try {
		run(ledger.db, ledger.path);
	} finally {
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

/** One `audit_log` row, with the fields a case is not about taken from a placeholder. */
function auditRow(overrides: Partial<AuditRow> = {}): AuditRow {
	return {
		ts: NOW,
		project_id: PROJECT_ID,
		bot_id: BOT_ID,
		chat_id: null,
		client_id: null,
		direction: "receive",
		eid: "eid-1",
		envelope_type: "REQUEST",
		from_user_id: 333,
		to_user_id: null,
		outcome: "ok",
		reason: null,
		...overrides,
	};
}

/** One dropped entry whose rejection carries {@link auditRow}'s audit. */
function rejectedEntry(overrides: Partial<AuditRow> = {}): InboxBatchEntry {
	return {
		kind: "dropped",
		update_id: 801,
		audits: [auditRow({ direction: "reject", outcome: "rejected", reason: "foreign_chat", ...overrides })],
	};
}

/** How many rows each table holds, for the "nothing else was written" half. */
function tableCounts(db: DatabaseSync): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const table of ["updates", "threads", "thread_history", "audit_log"]) {
		const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
		counts[table] = row.n;
	}
	return counts;
}

/**
 * The ledger file's committed text: the database file plus its `-wal` sibling when one exists.
 *
 * Tests call this only after `PRAGMA wal_checkpoint(TRUNCATE)`, so the main file holds every page; the
 * sibling is read anyway because a scan that quietly stopped reading half the ledger would be the vacuous
 * kind of evidence this suite is built to avoid.
 */
function ledgerFileText(path: string): string {
	const parts = [readFileSync(path, "utf8")];
	const wal = `${path}-wal`;
	if (existsSync(wal)) {
		parts.push(readFileSync(wal, "utf8"));
	}
	return parts.join("\n");
}

/** Asserts that `run` refused, that the refusal names `where`, and that it never carries the value. */
function assertRefused(run: () => void, where: string): void {
	assert.throws(run, (error: unknown) => {
		assert.ok(error instanceof Error, `expected an Error, got: ${String(error)}`);
		assert.ok(error.message.includes(where), `expected the refusal to name ${where}, got: ${error.message}`);
		assert.equal(error.message.includes(FIXTURE_TOKEN), false, "the refusal must never carry the value");
		return true;
	});
}

test("a rejected update leaves exactly one bodiless audit row and nothing else behind", () => {
	withLedger((db) => {
		const result = commitInboxBatch(db, { bot_id: BOT_ID, entries: [rejectedEntry()] });

		// The offset still moves past the update: a drop is moved past, never re-served (design §5.3).
		assert.deepEqual(result, { inserted: 0, replayed: 0, nextUpdateId: 802 });

		const rows = db.prepare("SELECT * FROM audit_log").all() as Record<string, unknown>[];
		assert.equal(rows.length, 1, "exactly one row per rejected update");
		const row = rows[0];
		assert.equal(row.direction, "reject");
		assert.equal(row.outcome, "rejected");
		assert.equal(row.reason, "foreign_chat");
		assert.equal(row.eid, "eid-1");
		assert.equal(row.project_id, PROJECT_ID);

		// The bodiless half is the schema's, and the assertion is here so a column added later cannot pass in
		// silence: `audit_log` has no body column at all (design §5.2, PT-20).
		const columns = (db.prepare("PRAGMA table_info(audit_log)").all() as unknown as { name: string }[]).map(
			(column) => column.name,
		);
		assert.equal(columns.includes("body"), false, "audit_log has no body column, by schema");
		assert.equal("body" in row, false);

		// A rejected update is not stored as an update, and it opened no thread.
		assert.deepEqual(tableCounts(db), { updates: 0, threads: 0, thread_history: 0, audit_log: 1 });
	});
});

test("the writer appends: two identical events are two rows and never one rewritten row", () => {
	withLedger((db) => {
		appendAuditRow(db, auditRow({ direction: "send", outcome: "ok" }));
		appendAuditRow(db, auditRow({ direction: "send", outcome: "ok" }));

		const rows = db.prepare("SELECT id FROM audit_log ORDER BY id").all() as unknown as { id: number }[];
		// An upsert or an "insert or replace" would leave one row here; the audit log is append-only, so the
		// second identical event is a second honest record and the first one is untouched.
		assert.deepEqual(
			rows.map((row) => row.id),
			[1, 2],
		);
	});
});

test("the unit holds one audit_log insert, and the batch writer is not it", () => {
	const ledgerDir = join(REPO_ROOT, "src/ledger");
	const files = readdirSync(ledgerDir).filter((name) => name.endsWith(".ts"));

	// Non-vacuous: the walk must see the unit, not an empty directory or one file.
	assert.ok(files.length >= 10, `expected the whole ledger unit, found ${files.length} files`);

	// The requirement this pins is "one shared writer, not two that drift" (design §5.1 §5.3, PT-20): the
	// batch's audit rows and the send path's are the same statement, so a second `INSERT INTO audit_log`
	// anywhere in this unit is a defect rather than a style choice. The first version of this test read two
	// files by name, which is narrower than the claim it was cited for — round 1 reproduced that a second
	// INSERT in `retention.ts` or a future `src/ledger/*.ts` passed it (`JD-A-006`).
	const inserting = files
		.filter((name) => readFileSync(join(ledgerDir, name), "utf8").includes("INSERT INTO audit_log"))
		.sort();
	assert.deepEqual(inserting, ["audit.ts"], "one writer, and it is ledger/audit.ts");

	const inboxSource = readFileSync(join(ledgerDir, "inbox.ts"), "utf8");
	assert.ok(inboxSource.includes("commitInboxBatch"), "expected to have read the batch writer");
	assert.match(inboxSource, /from "\.\/audit\.js"/);
	// The boundary: this assertion covers `src/ledger/*.ts`. A writer in another unit — the send path (PR-27),
	// which is where the design puts the next caller — is outside it, and the claim it pins is the unit's.
});

test("no write path ever persists a token shape, and the scan that says so can fail", () => {
	withLedger((db, path) => {
		// (1) Every text column of an audit row, through the shared writer.
		for (const field of AUDIT_TEXT_FIELDS) {
			const row: Record<string, unknown> = { ...auditRow() };
			row[field] = FIXTURE_TOKEN;
			assertRefused(() => appendAuditRow(db, row as unknown as AuditRow), `audit_log.${field}`);
		}

		// (2) The poller's own path: a rejected update whose reason carries the token.
		assertRefused(() => commitInboxBatch(db, { bot_id: BOT_ID, entries: [rejectedEntry({ reason: FIXTURE_TOKEN })] }), "audit_log.reason");

		// (3) The pending unknown-sender list.
		assertRefused(
			() => upsertUnknownSender(db, { bot_id: BOT_ID, user_id: 444, username: FIXTURE_TOKEN, seen_at: NOW }),
			"unknown_senders.username",
		);

		// (4) The condition store.
		assertRefused(
			() =>
				raiseCondition(db, {
					scope: PROJECT_ID,
					name: "group_outage",
					since: NOW,
					detail: { last_error: FIXTURE_TOKEN },
				}),
			"conditions.detail",
		);

		// (5) The condition store's own scope column: caller-supplied text written into a ledger table, and the
		// one column of that table this suite's first version did not drive a token through. Round 1 found the
		// token reaching the file there (`JD-B-001`, reached independently as `JD-A-002`).
		assertRefused(
			() =>
				raiseCondition(db, {
					scope: FIXTURE_TOKEN,
					name: "group_outage",
					since: NOW,
					detail: { last_error: "TELEGRAM_CONFLICT" },
				}),
			"conditions.scope",
		);

		// Every refusal above is a refusal *instead of* a write, not after one.
		assert.deepEqual(tableCounts(db).audit_log, 0);
		assert.equal((db.prepare("SELECT COUNT(*) AS n FROM unknown_senders").get() as { n: number }).n, 0);
		assert.equal((db.prepare("SELECT COUNT(*) AS n FROM conditions").get() as { n: number }).n, 0);

		db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		assert.equal(TOKEN_SHAPE_RE.test(ledgerFileText(path)), false, "no token-shaped text may reach the ledger file");

		// The control. Raw SQL bypasses every writer, so this is what proves the scan reads the bytes the
		// writers would have written — without it, the `false` above would be worth nothing.
		db.prepare("INSERT INTO audit_log (ts, direction, outcome, reason) VALUES (?, 'system', 'ok', ?)").run(NOW, FIXTURE_TOKEN);
		db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		assert.equal(TOKEN_SHAPE_RE.test(ledgerFileText(path)), true, "the control must be found, or the scan is blind");
	});
});
