import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { openLedger } from "../../src/ledger/open.js";
import { readThreadRecord } from "../../src/ledger/threads.js";
import { readUnknownSender } from "../../src/ledger/unknown-senders.js";
import { admitTelegramUpdates, type AdmissionBinding } from "../../src/daemon/admission.js";
import type { TelegramUpdate } from "../../src/daemon/telegram.js";
import { encodeEnvelope, type Envelope } from "../../src/shared/envelope.js";
import { PROTOCOL_SENTINEL } from "../../src/shared/constants.js";

/**
 * The seven-step admission pipeline (design §8.2, `durable-inbox`), pinned at the four spec scenarios,
 * the two threat-model rows it owns (PT-16, PT-17) and the order of the steps themselves.
 *
 * Every eid, thread and agent id below is WIRE-SHAPED, not decorative: `eid`/`thread` are 12 lowercase
 * hex characters and `from`/`to` are `@`-prefixed logical agent ids (`shared/envelope.ts`'s patterns).
 * A fixture the wire schema refuses would be classified `malformed` and would pin nothing — that is
 * the shape this suite must not drift away from, and the reason the malformed case below is built
 * from a REAL sentinel line with a broken payload rather than a lookalike.
 */

const TS = "2026-01-01T00:00:00.000Z";
const RECEIVED_AT = "2026-01-01T00:00:10.000Z";
/** Telegram's Unix seconds for {@link RECEIVED_AT}; `message.date` is what `updates.received_at` comes from. */
const RECEIVED_AT_SECONDS = 1_767_225_610;

/** A wire-shaped 12-hex id, distinct per `n`. */
function hexId(n: number): string {
	return n.toString(16).padStart(12, "0");
}

/** A temp home, an open ledger, and the cleanup — the harness every test in this file shares. */
function withLedger(run: (db: DatabaseSync) => void): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-admission-"));
	const ledger = openLedger({ homeDir: home });
	try {
		run(ledger.db);
	} finally {
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

/** The binding under test: one group, one bot, a three-entry R1-valid roster. */
function binding(overrides: Partial<AdmissionBinding> = {}): AdmissionBinding {
	return {
		project_id: "test-project",
		bot_id: 100,
		agent_id: "@ourbot",
		group_id: -1001234567890,
		roster_snapshot: [
			{ agent_id: "@alice", user_id: 111, username: "alice" },
			{ agent_id: "@bob", user_id: 222, username: "bob" },
			{ agent_id: "@ourbot", user_id: 333, username: "ourbot" },
		],
		...overrides,
	};
}

/** One `getUpdates` entry for the binding's group, from @alice unless a case says otherwise. */
function groupUpdate(
	updateId: number,
	text: string,
	overrides: Partial<NonNullable<TelegramUpdate["message"]>> = {}
): TelegramUpdate {
	return {
		update_id: updateId,
		message: {
			message_id: 5000 + updateId,
			date: RECEIVED_AT_SECONDS,
			chat: { id: -1001234567890, type: "supergroup" },
			from: { id: 111, is_bot: false, username: "alice" },
			text,
			...overrides,
		},
	};
}

/** An encoded wire envelope whose absent fields are an ordinary addressed REQUEST from @alice. */
function wire(overrides: Partial<Envelope> & { eid: string }): string {
	return encodeEnvelope({
		type: "REQUEST",
		from: "@alice",
		to: "@ourbot",
		thread: overrides.eid,
		ts: TS,
		body: "body",
		...overrides,
	} as Envelope);
}

/** Every `audit_log` row for this project, oldest first. */
function audits(db: DatabaseSync, projectId = "test-project") {
	return db
		.prepare("SELECT * FROM audit_log WHERE project_id = ? ORDER BY id")
		.all(projectId) as Array<Record<string, unknown> & { reason: string | null; direction: string; outcome: string }>;
}

/** Every `updates` row for this project, oldest first. */
function updates(db: DatabaseSync, projectId = "test-project") {
	return db
		.prepare("SELECT * FROM updates WHERE project_id = ? ORDER BY seq")
		.all(projectId) as Array<Record<string, unknown> & { eid: string; apply_outcome: string; body: string | null }>;
}

describe("daemon/admission.ts — seven-step admission pipeline", () => {
	it("runs the steps in the specification's order: text, decode, scope, roster, self, dedup, apply (§8.2)", () => {
		withLedger((db) => {
			const b = binding();
			const result = admitTelegramUpdates(db, b, [
				// Foreign chat, but human prose: step 1 fires, so this is `non_envelope`, not `foreign_chat`.
				groupUpdate(1, "lunch at 12?", { chat: { id: -1009999999999, type: "supergroup" } }),
				// Foreign chat, sentinel-shaped but broken payload: step 2 fires, so this is `malformed`.
				groupUpdate(2, `${PROTOCOL_SENTINEL} {"type": "REQUEST", bro`, {
					chat: { id: -1009999999999, type: "supergroup" },
				}),
				// Foreign chat, a well-formed envelope from a rostered sender: only now does the scope fire.
				groupUpdate(3, wire({ eid: hexId(3) }), { chat: { id: -1009999999999, type: "supergroup" } }),
			]);

			assert.equal(result.counts.non_envelope, 1);
			assert.equal(result.counts.malformed, 1);
			assert.equal(result.counts.foreign_chat, 1);
			assert.equal(result.inserted, 0);
			assert.equal(result.dropped, 3);

			assert.deepEqual(
				audits(db).map((row) => row.reason),
				["non_envelope", "malformed", "foreign_chat"]
			);
			// A refusal is audited without a body, and the table has no column that could hold one (PT-20).
			const columns = (db.prepare("PRAGMA table_info(audit_log)").all() as Array<{ name: string }>).map((c) => c.name);
			assert.ok(!columns.includes("body"), "audit_log must have no body column");
			assert.equal(updates(db).length, 0);
		});
	});

	it("Scenario: Foreign chat dropped and audited without a body (PT-03)", () => {
		withLedger((db) => {
			const b = binding();
			const result = admitTelegramUpdates(db, b, [
				groupUpdate(1, wire({ eid: hexId(1) }), { chat: { id: -1009999999999, type: "supergroup" } }),
			]);

			assert.equal(result.counts.foreign_chat, 1);
			assert.equal(result.inserted, 0);

			const [row] = audits(db);
			assert.equal(row.reason, "foreign_chat");
			assert.equal(row.direction, "reject");
			assert.equal(row.outcome, "dropped");
			// The foreign chat is NAMED in the audit row — the operator's only trace that it happened.
			assert.equal(row.chat_id, -1009999999999);

			// Dropped, never surfaced, never stored: no row for an agent to read, no `needs_action`.
			assert.equal(updates(db).length, 0);
			const needsAction = db.prepare("SELECT count(*) AS c FROM needs_action").get() as { c: number };
			assert.equal(needsAction.c, 0);
		});
	});

	it("Scenario: Unknown sender recorded, never surfaced (PT-04)", () => {
		withLedger((db) => {
			const b = binding();
			const result = admitTelegramUpdates(db, b, [
				groupUpdate(1, wire({ eid: hexId(1) }), { from: { id: 999, is_bot: false, username: "stranger" } }),
			]);

			assert.equal(result.counts.unknown_sender, 1);
			assert.equal(result.inserted, 0);

			const observation = readUnknownSender(db, b.bot_id, 999);
			assert.ok(observation, "the sender must be recorded in the pending list");
			assert.equal(observation.user_id, 999);
			assert.equal(observation.username, "stranger");
			assert.equal(observation.count, 1);

			const [row] = audits(db);
			assert.equal(row.reason, "unknown_sender");
			assert.equal(row.direction, "reject");

			// The body was never persisted anywhere: no `updates` row and no `needs_action`.
			assert.equal(updates(db).length, 0);
			const needsAction = db.prepare("SELECT count(*) AS c FROM needs_action").get() as { c: number };
			assert.equal(needsAction.c, 0);
		});
	});

	it("Scenario: Mixed batch isolates human chat text (PT-31)", () => {
		withLedger((db) => {
			const b = binding();
			const humanText = "Hey everyone, lunch at 12?";
			const validText = wire({ eid: hexId(0x10), body: "the only admitted body" });

			const result = admitTelegramUpdates(db, b, [
				groupUpdate(1, humanText),
				groupUpdate(2, validText),
				groupUpdate(3, `${PROTOCOL_SENTINEL} {"type": "REQUEST", malformed`),
				// Self-echo: this binding's own agent id, verified by its Telegram user id (333).
				groupUpdate(4, wire({ eid: hexId(0x20), from: "@ourbot", to: "@alice", body: "our own send" }), {
					from: { id: 333, is_bot: true, username: "ourbot" },
				}),
				// The identical envelope again — duplicate eid.
				groupUpdate(5, validText),
			]);

			assert.equal(result.inserted, 1);
			assert.equal(result.dropped, 4);
			assert.equal(result.counts.non_envelope, 1);
			assert.equal(result.counts.malformed, 1);
			assert.equal(result.counts.self_echo, 1);
			assert.equal(result.counts.duplicate, 1);

			// The audit log is append-only and follows the BATCH order, so the admitted entry's own
			// `opened` row sits where that entry does — the verdict is the set of reasons, not a sort.
			assert.deepEqual(
				audits(db).map((row) => row.reason),
				["non_envelope", "opened", "malformed", "duplicate"]
			);

			// The human text reached no stored body and no envelope copy — and the audit log cannot hold
			// one at all, which is the stronger half of the claim.
			const stored = updates(db);
			assert.equal(stored.length, 1);
			assert.equal(stored[0].body, "the only admitted body");
			assert.ok(!JSON.stringify(stored.map((row) => row.envelope_json)).includes("lunch"));
			assert.ok(!JSON.stringify(audits(db)).includes("lunch"));
		});
	});

	it("Scenario: updates.body is NULL for rejected and ignored, kept for not_mine and noted (D-20)", () => {
		withLedger((db) => {
			const b = binding();
			const openEid = hexId(0x100);

			// The thread the later `rejected` transition acts on: @alice's REQUEST to @ourbot.
			const opened = admitTelegramUpdates(db, b, [groupUpdate(1, wire({ eid: openEid, body: "original request" }))]);
			assert.equal(opened.inserted, 1);
			assert.equal(opened.counts.unanchored, 0);

			const cases: Record<string, string> = {
				noted: hexId(0x101),
				not_mine: hexId(0x102),
				ignored: hexId(0x103),
				rejected: hexId(0x104),
			};

			admitTelegramUpdates(db, b, [
				// noted — a BROADCAST is recorded and opens no thread.
				groupUpdate(2, wire({ eid: cases.noted, type: "BROADCAST", to: null, body: "broadcast status" })),
				// not_mine — a REQUEST between two other peers is not this bridge's business.
				groupUpdate(3, wire({ eid: cases.not_mine, to: "@bob", body: "request for bob" })),
				// ignored — an ACK naming a thread this ledger never saw.
				groupUpdate(
					4,
					wire({ eid: cases.ignored, type: "ACK", thread: hexId(0x999), basis: "acknowledged-only", body: "phantom ack" }),
					{ from: { id: 222, is_bot: false, username: "bob" } }
				),
				// rejected — @bob is neither the thread's addressee (@ourbot) nor its originator (@alice).
				groupUpdate(
					5,
					wire({ eid: cases.rejected, type: "ACK", thread: openEid, basis: "acknowledged-only", body: "unauthorized ack" }),
					{ from: { id: 222, is_bot: false, username: "bob" } }
				),
			]);

			const rows = new Map(updates(db).map((row) => [row.eid, row]));
			assert.equal(rows.get(cases.noted)?.apply_outcome, "noted");
			assert.equal(rows.get(cases.noted)?.body, "broadcast status");
			assert.equal(rows.get(cases.not_mine)?.apply_outcome, "not_mine");
			assert.equal(rows.get(cases.not_mine)?.body, "request for bob");
			assert.equal(rows.get(cases.ignored)?.apply_outcome, "ignored");
			assert.equal(rows.get(cases.ignored)?.body, null, "D-20: `ignored` stores no body");
			assert.equal(rows.get(cases.rejected)?.apply_outcome, "rejected");
			assert.equal(rows.get(cases.rejected)?.body, null, "D-20: `rejected` stores no body");

			// The rejected transition's audit row names the reason, and the thread it was refused on is
			// untouched: an unauthorized ACK is not an acknowledgement.
			const rejection = audits(db).find((row) => row.reason === "unauthorized");
			assert.ok(rejection, "the refusal must be audited with its reason");
			assert.equal(rejection.outcome, "rejected");
			assert.equal(rejection.direction, "reject");

			const thread = readThreadRecord(db, b.project_id, openEid);
			assert.equal(thread?.ack_count, 0);
			assert.equal(thread?.acked_at, null);
		});
	});

	it("Scenario: the envelope's own from claim is discarded for the verified sender (PT-16)", () => {
		withLedger((db) => {
			const b = binding();
			const eid = hexId(0x200);
			const result = admitTelegramUpdates(db, b, [groupUpdate(1, wire({ eid, from: "@bob", body: "forged sender" }))]);

			assert.equal(result.inserted, 1);
			const [row] = updates(db);
			assert.equal(row.from_agent_id, "@alice", "the verified Telegram sender wins");
			assert.equal(row.from_user_id, 111);

			const stored = JSON.parse(row.envelope_json as string) as Record<string, unknown>;
			assert.equal(stored.from, "@alice");
			assert.ok(!("body" in stored), "envelope_json holds the validated envelope WITHOUT the body key");
			assert.equal(readThreadRecord(db, b.project_id, eid)?.from, "@alice");
		});
	});

	it("Scenario: a null addressee anchor is rejected as unanchored, not authorized (PT-17, D-05)", () => {
		withLedger((db) => {
			const b = binding();
			const threadEid = hexId(0x300);

			// An addressee no local roster entry claims, with no wire anchor: the thread opens with
			// `to_user_id === null` — the state v1 waved through.
			const opened = admitTelegramUpdates(db, b, [groupUpdate(1, wire({ eid: threadEid, to: "@charlie" }))]);
			assert.equal(opened.inserted, 1);
			assert.equal(readThreadRecord(db, b.project_id, threadEid)?.to_user_id, null);

			const ackEid = hexId(0x301);
			const result = admitTelegramUpdates(db, b, [
				groupUpdate(
					2,
					wire({ eid: ackEid, type: "ACK", thread: threadEid, basis: "acknowledged-only", body: "unanchored ack" }),
					{ from: { id: 222, is_bot: false, username: "bob" } }
				),
			]);

			assert.equal(result.inserted, 1);
			assert.equal(result.counts.unanchored, 1);

			const row = updates(db).find((candidate) => candidate.eid === ackEid);
			assert.equal(row?.apply_outcome, "rejected");
			assert.equal(row?.body, null);
			assert.equal(audits(db).at(-1)?.reason, "unanchored");

			const thread = readThreadRecord(db, b.project_id, threadEid);
			assert.equal(thread?.ack_count, 0, "a refused transition leaves no acknowledgement behind");
		});
	});

	it("admits a roster member's private chat, and records it as the direct plane (PT-03 scope)", () => {
		withLedger((db) => {
			const b = binding();
			const eid = hexId(0x400);
			const result = admitTelegramUpdates(db, b, [
				{
					update_id: 1,
					message: {
						message_id: 5001,
						date: RECEIVED_AT_SECONDS,
						chat: { id: 111, type: "private" },
						from: { id: 111, is_bot: false, username: "alice" },
						text: wire({ eid }),
					},
				},
			]);

			assert.equal(result.inserted, 1);
			const [row] = updates(db);
			assert.equal(row.via, "direct");
			assert.equal(row.chat_id, 111);
		});
	});

	it("counts an unsupported sentinel version as unsupported_version, never as malformed", () => {
		withLedger((db) => {
			const b = binding();
			const result = admitTelegramUpdates(db, b, [
				groupUpdate(1, `AGENTBUS/9 ${JSON.stringify({ eid: hexId(1) })}`),
			]);

			assert.equal(result.counts.unsupported_version, 1);
			assert.equal(result.counts.malformed, 0);
			assert.equal(audits(db)[0].reason, "unsupported_version");
			assert.equal(updates(db).length, 0);
		});
	});

	it("treats an unusable message.date as malformed rather than wedging the batch (ADR-12)", () => {
		withLedger((db) => {
			const b = binding();
			const good = hexId(0x500);
			const result = admitTelegramUpdates(db, b, [
				groupUpdate(1, wire({ eid: good }), { date: Number.NaN }),
				// The poisoned update must not take the rest of the batch with it.
				groupUpdate(2, wire({ eid: hexId(0x501) })),
			]);

			assert.equal(result.counts.malformed, 1);
			assert.equal(result.inserted, 1);
			assert.ok(!updates(db).some((row) => row.eid === good));
			assert.equal(result.nextUpdateId, 3, "the offset still moves past the dropped update");
		});
	});

	it("stamps binding_state from a [CHECKPOINT-ESTADO] BROADCAST, newest checkpoint in the batch winning", () => {
		withLedger((db) => {
			const b = binding();
			const result = admitTelegramUpdates(db, b, [
				groupUpdate(1, wire({ eid: hexId(0x600), type: "BROADCAST", to: null, body: "[CHECKPOINT-ESTADO] first" })),
				groupUpdate(
					2,
					wire({ eid: hexId(0x601), type: "BROADCAST", to: null, body: "[CHECKPOINT-ESTADO] second" }),
					{ date: RECEIVED_AT_SECONDS + 5 }
				),
			]);

			assert.equal(result.inserted, 2);
			const state = db
				.prepare("SELECT last_checkpoint_at, last_checkpoint_by FROM binding_state WHERE project_id = ?")
				.get(b.project_id) as { last_checkpoint_at: string; last_checkpoint_by: string };
			assert.equal(state.last_checkpoint_at, new Date((RECEIVED_AT_SECONDS + 5) * 1000).toISOString());
			assert.equal(state.last_checkpoint_by, "@alice");
		});
	});

	it("captures the group copy's message id additively, on a duplicate of a directly-opened thread (E1)", () => {
		withLedger((db) => {
			const b = binding();
			const eid = hexId(0x700);
			const text = wire({ eid });

			// Opened on the direct plane: the group anchor is null.
			admitTelegramUpdates(db, b, [
				{
					update_id: 1,
					message: {
						message_id: 5001,
						date: RECEIVED_AT_SECONDS,
						chat: { id: 111, type: "private" },
						from: { id: 111, is_bot: false, username: "alice" },
						text,
					},
				},
			]);
			assert.equal(readThreadRecord(db, b.project_id, eid)?.group_message_id, null);

			// The same envelope's group copy: a duplicate, and the one that can anchor a human reply.
			const result = admitTelegramUpdates(db, b, [groupUpdate(2, text)]);

			assert.equal(result.counts.duplicate, 1);
			assert.equal(result.inserted, 0);
			assert.equal(readThreadRecord(db, b.project_id, eid)?.group_message_id, 5002);
		});
	});

	it("a second REQUEST naming a thread the ledger already holds is a duplicate, never an overwrite", () => {
		withLedger((db) => {
			const b = binding();
			const threadEid = hexId(0x800);
			admitTelegramUpdates(db, b, [groupUpdate(1, wire({ eid: threadEid, body: "first request" }))]);

			const result = admitTelegramUpdates(db, b, [
				groupUpdate(2, wire({ eid: hexId(0x801), thread: threadEid, body: "second request" })),
			]);

			assert.equal(result.counts.duplicate, 1);
			assert.equal(result.inserted, 0);
			const held = readThreadRecord(db, b.project_id, threadEid);
			assert.equal(held?.opened_eid, threadEid, "the held thread's identity is untouched");
			assert.equal(held?.body, "first request", "the held thread's body is untouched");
			assert.equal(audits(db).at(-1)?.reason, "duplicate");
		});
	});

	it("counts a re-served (bot_id, update_id) as replayed and stores nothing twice (PT-10)", () => {
		withLedger((db) => {
			const b = binding();
			const text = wire({ eid: hexId(0x900) });
			const first = admitTelegramUpdates(db, b, [groupUpdate(1, text)]);
			const second = admitTelegramUpdates(db, b, [groupUpdate(1, text)]);

			assert.equal(first.inserted, 1);
			assert.equal(second.inserted, 0);
			assert.equal(second.replayed, 1);
			assert.equal(second.counts.replayed, 1);
			assert.equal(updates(db).length, 1);
		});
	});

	it("drops the self-echo silently and still accounts for it in the batch total", () => {
		withLedger((db) => {
			const b = binding();
			const result = admitTelegramUpdates(db, b, [
				groupUpdate(1, wire({ eid: hexId(0xa00), from: "@ourbot", to: "@alice" }), {
					from: { id: 333, is_bot: true, username: "ourbot" },
				}),
			]);

			assert.equal(result.counts.self_echo, 1);
			assert.equal(result.dropped, 1);
			assert.equal(result.inserted, 0);
			assert.equal(audits(db).length, 0, "the self-filter earns no audit row");
			assert.equal(updates(db).length, 0);
			assert.equal(result.nextUpdateId, 2);
		});
	});

	it("translates the addressee through the wire anchor into this bridge's namespace (T3.2)", () => {
		withLedger((db) => {
			const b = binding();
			const eid = hexId(0xb00);
			// `to` names @bobby — the SENDER's spelling; the anchor is the number both sides agree on.
			const result = admitTelegramUpdates(db, b, [
				groupUpdate(1, wire({ eid, to: "@bobby", body: "anchored request", to_user_id: 222 } as never)),
			]);

			assert.equal(result.inserted, 1);
			const stored = JSON.parse(updates(db)[0].envelope_json as string) as Record<string, unknown>;
			assert.equal(stored.to, "@bob", "the addressee is stored in OUR namespace");
			assert.equal(stored.to_user_id, 222, "the wire anchor travels through untouched");
			assert.equal(updates(db)[0].apply_outcome, "not_mine");
			assert.equal(updates(db)[0].body, "anchored request", "`not_mine` keeps its body (D-20)");
		});
	});

	it("keeps received_at on Telegram's own clock, from message.date rather than the envelope's ts", () => {
		withLedger((db) => {
			const b = binding();
			admitTelegramUpdates(db, b, [
				groupUpdate(1, wire({ eid: hexId(0xc00), ts: "2020-01-01T00:00:00.000Z" }), {
					date: RECEIVED_AT_SECONDS,
				}),
			]);

			const [row] = updates(db);
			assert.equal(row.received_at, RECEIVED_AT);
			assert.equal(row.message_date, RECEIVED_AT_SECONDS);
		});
	});
});

describe("daemon/admission.ts — step 1 owns the textless update (design §8.2 step 1)", () => {
	it("counts an update with no message, and one with no text, as non_envelope — never as malformed", () => {
		withLedger((db) => {
			const b = binding();
			const result = admitTelegramUpdates(db, b, [
				// A `getUpdates` entry that carries no message at all.
				{ update_id: 1 },
				// A message Telegram carries with no text plane: a photo with no caption.
				{
					update_id: 2,
					message: {
						message_id: 5002,
						date: RECEIVED_AT_SECONDS,
						chat: { id: -1001234567890, type: "supergroup" },
						from: { id: 111, is_bot: false, username: "alice" },
					},
				},
			]);

			// Step 1 is a distinct classification from step 2's decode failure, and this is the only case
			// that can tell them apart: both are `non_envelope`, but only step 2 can ever count `malformed`.
			assert.equal(result.counts.non_envelope, 2);
			assert.equal(result.counts.malformed, 0);
			assert.equal(result.inserted, 0);
			assert.deepEqual(
				audits(db).map((row) => row.reason),
				["non_envelope", "non_envelope"]
			);
			assert.equal(updates(db).length, 0);
			assert.equal(result.nextUpdateId, 3);
		});
	});
});
