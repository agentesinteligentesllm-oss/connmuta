import { test, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { readThreadRecord, writeThreadRecord } from "../../../src/ledger/threads.js";
import { readCondition } from "../../../src/ledger/conditions-store.js";
import type { ThreadRecord } from "../../../src/shared/thread-record.js";
import { ABANDON_BASIS_VALUE, decodeEnvelope, type Envelope } from "../../../src/shared/envelope.js";
import { TOOL_PREFIX } from "../../../src/shared/constants.js";
import type { SendToolInput } from "../../../src/shared/tool-schemas.js";
import type { ProjectRosterEntry } from "../../../src/shared/project-file.js";
import { GroupMigratedError, TelegramApiError } from "../../../src/daemon/telegram.js";
import { RoomGuardClient } from "../../../src/daemon/transport/room-guard.js";
import { GroupTransport } from "../../../src/daemon/transport/group.js";
import { DirectTransport } from "../../../src/daemon/transport/direct.js";
import { DualWriteTransport } from "../../../src/daemon/transport/dual.js";
import { SendToolError, guardEncodedLength } from "../../../src/daemon/send/validate.js";
import { BindingMutex, sendPath, type SendPathDeps } from "../../../src/daemon/send/send-path.js";
import { FakeTelegramClient } from "../../fakes/telegram.js";
import { deliveredText } from "../../fakes/delivered-text.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * `daemon/send/send-path.ts` (PR-27, design §9, PT-01, PT-02, PT-15, PT-25, PT-28; unit 8 `send-path`,
 * which PR-28's `rate.ts` closes).
 *
 * A real `node:sqlite` ledger per test (`test/daemon/send/validate.test.ts`'s own precedent), one
 * `FakeTelegramClient` per binding wrapped in a real `RoomGuardClient`, and the exact
 * `GroupTransport`/`DirectTransport`/`DualWriteTransport` composition `daemon/bindings.ts`'s
 * `buildTransport` builds in production — nothing here is a stand-in for the transport stack itself,
 * only for the network underneath it.
 *
 * Every id below is a placeholder (AGENTS.md §3): synthetic agent, user, bot and group ids.
 * `FIXTURE_BOT_TOKEN` is built from a literal-safe 7-digit prefix, mirroring
 * `test/daemon/send/validate.test.ts`.
 */

const NOW = "2026-04-10T09:00:00.000Z";

// --- "MAIN" binding — used by every test that exercises one binding's own behaviour. ---
const PROJECT_MAIN = "project-main";
const BOT_ID_MAIN = 7000001;
const GROUP_MAIN_ID = -1001234567;

const ALICE = "@alice-agent";
const ALICE_USER_ID = 700000061;
const ALICE_USERNAME = "alice_bot";
const BOB = "@bob-agent";
const BOB_USER_ID = 700000062;
const BOB_USERNAME = "bob_bot";
const CAROL = "@carol-agent";
const CAROL_USER_ID = 700000063;
const CAROL_USERNAME = "carol_bot";

const ENTRIES_MAIN: readonly ProjectRosterEntry[] = [
	{ agent_id: ALICE, user_id: ALICE_USER_ID, username: ALICE_USERNAME },
	{ agent_id: BOB, user_id: BOB_USER_ID, username: BOB_USERNAME },
	{ agent_id: CAROL, user_id: CAROL_USER_ID, username: CAROL_USERNAME },
];

// --- "ISO A" / "ISO B" bindings — used only by the BROADCAST-isolation scenario. ---
const PROJECT_ISO_A = "project-iso-a";
const BOT_ID_ISO_A = 7000101;
const GROUP_ISO_A_ID = -1005550001;
const ISO_A_AGENT = "@iso-a-agent";
const ISO_A_AGENT_USER_ID = 700000101;
const ISO_A_ONE = "@iso-a-one";
const ISO_A_ONE_USER_ID = 700000102;
const ISO_A_ONE_USERNAME = "iso_a_one_bot";
const ISO_A_TWO = "@iso-a-two";
const ISO_A_TWO_USER_ID = 700000103;
const ISO_A_TWO_USERNAME = "iso_a_two_bot";

const PROJECT_ISO_B = "project-iso-b";
const BOT_ID_ISO_B = 7000102;
const GROUP_ISO_B_ID = -1005550002;
const ISO_B_AGENT = "@iso-b-agent";
const ISO_B_AGENT_USER_ID = 700000201;
const ISO_B_ONE = "@iso-b-one";
const ISO_B_ONE_USER_ID = 700000202;
const ISO_B_TWO = "@iso-b-two";
const ISO_B_TWO_USER_ID = 700000203;

const ENTRIES_ISO_A: readonly ProjectRosterEntry[] = [
	{ agent_id: ISO_A_AGENT, user_id: ISO_A_AGENT_USER_ID, username: "iso_a_agent_bot" },
	{ agent_id: ISO_A_ONE, user_id: ISO_A_ONE_USER_ID, username: ISO_A_ONE_USERNAME },
	{ agent_id: ISO_A_TWO, user_id: ISO_A_TWO_USER_ID, username: ISO_A_TWO_USERNAME },
];
const ENTRIES_ISO_B: readonly ProjectRosterEntry[] = [
	{ agent_id: ISO_B_AGENT, user_id: ISO_B_AGENT_USER_ID, username: "iso_b_agent_bot" },
	{ agent_id: ISO_B_ONE, user_id: ISO_B_ONE_USER_ID, username: "iso_b_one_bot" },
	{ agent_id: ISO_B_TWO, user_id: ISO_B_TWO_USER_ID, username: "iso_b_two_bot" },
];

const WRONG_GROUP_ID = -1009999999;
/** A body under the raw cap whose encoding exceeds Telegram's ceiling (see `validate.test.ts`). */
const OVER_ENCODED_BODY_CHARS = 2500;
/** How long the cross-binding concurrency test waits before declaring the two sends serialised. */
const CROSS_BINDING_DEADLINE_MS = 2000;
const DRIFTED_GROUP_ID = -1008888888;
const NEW_CHAT_ID = -1007777777;

/** A bot-token-shaped fixture, built programmatically so the repo secret scanner never sees a literal token. */
const FIXTURE_BOT_TOKEN = `1234567:${"A".repeat(35)}`;

function withLedger(run: (db: DatabaseSync) => Promise<void> | void): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-send-path-"));
	const ledger = openLedger({ homeDir: home });
	return Promise.resolve(run(ledger.db)).finally(() => {
		try {
			ledger.db.close();
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
}

/** A wire-shaped 12-hex id, distinct per `n` (`shared/envelope.ts`'s `THREAD_PATTERN`/`EID_PATTERN`). */
function hexId(n: number): string {
	return n.toString(16).padStart(12, "0");
}

/** A deterministic `generateId` so a test can reason about eid/thread values without reading them back first. */
function sequentialIdGenerator(startAt = 1): () => string {
	let n = startAt;
	return () => hexId(n++);
}

/** A deterministic, strictly-increasing clock — one millisecond per call, so `since` ordering is testable. */
function sequentialClock(startIso: string): () => Date {
	let epochMs = Date.parse(startIso);
	return () => new Date(epochMs++);
}

interface BindingFixture {
	readonly projectId: string;
	readonly botId: number;
	readonly groupId: number;
	readonly agentId: string;
	readonly config: SendPathDeps["config"];
	readonly telegram: FakeTelegramClient;
	readonly roomGuard: RoomGuardClient;
	readonly transport: DualWriteTransport;
}

function toDirectRoster(entries: readonly ProjectRosterEntry[]): Record<string, ProjectRosterEntry> {
	const roster: Record<string, ProjectRosterEntry> = {};
	for (const entry of entries) {
		roster[entry.agent_id] = entry;
	}
	return roster;
}

function toBindingRoster(entries: readonly ProjectRosterEntry[]): SendPathDeps["config"]["roster"] {
	const roster: Record<string, { username: string; user_id: number }> = {};
	for (const entry of entries) {
		roster[entry.agent_id] = { username: entry.username, user_id: entry.user_id };
	}
	return roster;
}

/**
 * Builds one binding's whole transport stack exactly as `daemon/bindings.ts`'s `buildTransport` does
 * in production: `RoomGuardClient` wrapping the fake, then `GroupTransport` + `DirectTransport` +
 * `DualWriteTransport` over the guarded client.
 *
 * `guardGroupId`/`guardEntries` default to the binding's own `groupId`/`entries`; a test overrides
 * either to model the room guard drifting from the binding's own configuration (PT-01's forced
 * mismatch).
 */
function buildBinding(opts: {
	projectId: string;
	botId: number;
	groupId: number;
	agentId: string;
	entries: readonly ProjectRosterEntry[];
	guardGroupId?: number;
	guardEntries?: readonly ProjectRosterEntry[];
}): BindingFixture {
	const telegram = new FakeTelegramClient();
	const roomGuard = new RoomGuardClient(telegram, {
		groupId: opts.guardGroupId ?? opts.groupId,
		roster: opts.guardEntries ?? opts.entries,
	});
	const group = new GroupTransport(roomGuard, opts.groupId);
	const direct = new DirectTransport(roomGuard, toDirectRoster(opts.entries));
	const transport = new DualWriteTransport(group, direct);

	return {
		projectId: opts.projectId,
		botId: opts.botId,
		groupId: opts.groupId,
		agentId: opts.agentId,
		config: {
			agent_id: opts.agentId,
			roster: toBindingRoster(opts.entries),
			secret_markers: [],
			chat_id: opts.groupId,
		},
		telegram,
		roomGuard,
		transport,
	};
}

function buildDeps(db: DatabaseSync, binding: BindingFixture, overrides: Partial<SendPathDeps> = {}): SendPathDeps {
	return {
		db,
		project_id: binding.projectId,
		bot_id: binding.botId,
		config: binding.config,
		transport: binding.transport,
		roomGuard: binding.roomGuard,
		mutex: new BindingMutex(),
		now: sequentialClock(NOW),
		generateId: sequentialIdGenerator(1),
		...overrides,
	};
}

function sampleThread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
	return {
		status: "open",
		opened_type: "REQUEST",
		opened_eid: "opening-eid",
		from: ALICE,
		to: BOB,
		to_user_id: BOB_USER_ID,
		body: "opening body",
		opened_at: NOW,
		opened_message_id: 1,
		group_message_id: null,
		via: "group",
		ack_count: 0,
		acked_at: null,
		resolved_at: null,
		resolved_by: null,
		basis: null,
		closure_delivered: true,
		awaiting: BOB,
		history: [],
		...overrides,
	};
}

function writeThread(
	db: DatabaseSync,
	projectId: string,
	threadId: string,
	overrides: Partial<ThreadRecord> = {},
	updatedAt = NOW,
): void {
	writeThreadRecord(db, { project_id: projectId, thread_id: threadId, record: sampleThread(overrides), updated_at: updatedAt });
}

function auditRows(db: DatabaseSync, projectId: string): Record<string, unknown>[] {
	return db.prepare("SELECT * FROM audit_log WHERE project_id = ? ORDER BY id").all(projectId) as Record<string, unknown>[];
}

function threadCount(db: DatabaseSync, projectId: string): number {
	const row = db.prepare("SELECT COUNT(*) AS n FROM threads WHERE project_id = ?").get(projectId) as { n: number | bigint };
	return Number(row.n);
}

function requestInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "REQUEST", body: "a request", ...overrides } as SendToolInput;
}
function replyInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "REPLY", body: "a reply", ...overrides } as SendToolInput;
}
function ackInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "ACK", body: "ack body", ...overrides } as SendToolInput;
}
function resolvedInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "RESOLVED", body: "resolved body", basis: "work-confirmed", ...overrides } as SendToolInput;
}
function broadcastInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "BROADCAST", body: "broadcast body", ...overrides } as SendToolInput;
}

function isWrongRoom(error: unknown): boolean {
	return error instanceof SendToolError && error.code === "WRONG_ROOM";
}

// --- Spec scenario: "BROADCAST never crosses bindings" ---

test("Spec scenario: BROADCAST never crosses bindings, and a later send on B does not touch A", async () => {
	await withLedger(async (db) => {
		const bindingA = buildBinding({ projectId: PROJECT_ISO_A, botId: BOT_ID_ISO_A, groupId: GROUP_ISO_A_ID, agentId: ISO_A_AGENT, entries: ENTRIES_ISO_A });
		const bindingB = buildBinding({ projectId: PROJECT_ISO_B, botId: BOT_ID_ISO_B, groupId: GROUP_ISO_B_ID, agentId: ISO_B_AGENT, entries: ENTRIES_ISO_B });
		const depsA = buildDeps(db, bindingA);
		const depsB = buildDeps(db, bindingB);

		await sendPath(broadcastInput(), depsA);

		const aTargets = bindingA.telegram.sentMessages.map((m) => m.chat_id);
		assert.equal(bindingA.telegram.sentMessages.length, 3, "group post plus two DMs");
		assert.ok(aTargets.includes(GROUP_ISO_A_ID));
		assert.ok(aTargets.includes(`@${ISO_A_ONE_USERNAME}`));
		assert.ok(aTargets.includes(`@${ISO_A_TWO_USERNAME}`));
		assert.equal(bindingB.telegram.sentMessages.length, 0, "B's fake must see nothing from A's broadcast");

		await sendPath(requestInput({ to: ISO_B_ONE }), depsB);
		assert.equal(bindingA.telegram.sentMessages.length, 3, "A must stay untouched by B's own send");
	});
});

// --- Spec scenario: "Forced mismatch yields WRONG_ROOM" ---

test("Forced mismatch (a): a room guard built with the wrong group id refuses before any call", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({
			projectId: PROJECT_MAIN,
			botId: BOT_ID_MAIN,
			groupId: GROUP_MAIN_ID,
			agentId: BOB,
			entries: ENTRIES_MAIN,
			guardGroupId: WRONG_GROUP_ID,
		});
		const deps = buildDeps(db, binding);
		const threadsBefore = threadCount(db, PROJECT_MAIN);

		await assert.rejects(() => sendPath(requestInput({ to: ALICE }), deps), isWrongRoom);

		assert.equal(binding.telegram.sentMessages.length, 0);
		assert.equal(threadCount(db, PROJECT_MAIN), threadsBefore, "no thread row must be written");
		const rows = auditRows(db, PROJECT_MAIN);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].outcome, "rejected");
		assert.equal(rows[0].reason, "WRONG_ROOM");
		assert.equal(rows[0].chat_id, GROUP_MAIN_ID);
		// Every identifying field of the refusal row (verifier E2): the eid the send minted, the stamped
		// identities, the binding's bot and the direction — and nothing that carries a body.
		assert.equal(rows[0].direction, "send");
		assert.equal(rows[0].eid, hexId(1), "the first id the sequential generator mints is the envelope's eid");
		assert.equal(rows[0].envelope_type, "REQUEST");
		assert.equal(rows[0].bot_id, BOT_ID_MAIN);
		assert.equal(rows[0].from_user_id, BOB_USER_ID);
		assert.equal(rows[0].to_user_id, ALICE_USER_ID);
	});
});

test("the encoded-length guard runs before the room pre-check: an over-long send to a wrong room is BODY_TOO_LONG and writes nothing", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({
			projectId: PROJECT_MAIN,
			botId: BOT_ID_MAIN,
			groupId: GROUP_MAIN_ID,
			agentId: BOB,
			entries: ENTRIES_MAIN,
			guardGroupId: WRONG_GROUP_ID,
		});
		const deps = buildDeps(db, binding);

		await assert.rejects(
			() => sendPath(requestInput({ to: ALICE, body: "x".repeat(OVER_ENCODED_BODY_CHARS) }), deps),
			(err: unknown) => err instanceof SendToolError && err.code === "BODY_TOO_LONG",
		);
		assert.equal(binding.telegram.sentMessages.length, 0);
		assert.equal(auditRows(db, PROJECT_MAIN).length, 0);
	});
});

test("a refusal by the decorator INSIDE a misbuilt transport never reaches the wrong room; the send degrades and raises group_outage (JD-B-001, B-44)", async () => {
	await withLedger(async (db) => {
		// The guard and config.chat_id agree, so the pre-check passes; only the GroupTransport itself
		// targets another group — a construction defect `bindings.ts`'s buildTransport cannot produce,
		// since it builds both from one `group_id`. The decorator still refuses that post before any call.
		const telegram = new FakeTelegramClient();
		const roomGuard = new RoomGuardClient(telegram, { groupId: GROUP_MAIN_ID, roster: ENTRIES_MAIN });
		const transport = new DualWriteTransport(
			new GroupTransport(roomGuard, WRONG_GROUP_ID),
			new DirectTransport(roomGuard, toDirectRoster(ENTRIES_MAIN)),
		);
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding, { transport, roomGuard });

		const result = await sendPath(requestInput({ to: ALICE }), deps);

		assert.equal(telegram.sentMessages.some((m) => m.chat_id === WRONG_GROUP_ID), false, "nothing reaches the wrong room");
		assert.equal(result.delivery.group.ok, false);
		assert.equal(result.delivery.degraded, true);
		assert.ok(readCondition(db, PROJECT_MAIN, "group_outage"), "the refusal is visible as a group outage");
		assert.deepEqual(
			auditRows(db, PROJECT_MAIN).map((row) => [row.outcome, row.reason]),
			[["degraded", null]],
			"documented limit: the decorator's refusal is not a WRONG_ROOM row (B-44)",
		);
	});
});

test("Forced mismatch (b): config.chat_id drifting from the room guard's own group id refuses before any call", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding, { config: { ...binding.config, chat_id: DRIFTED_GROUP_ID } });

		await assert.rejects(() => sendPath(requestInput({ to: ALICE }), deps), isWrongRoom);

		assert.equal(binding.telegram.sentMessages.length, 0);
		const rows = auditRows(db, PROJECT_MAIN);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].reason, "WRONG_ROOM");
	});
});

test("A recipient-side mismatch (username not in the room guard's roster) is refused before any call", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({
			projectId: PROJECT_MAIN,
			botId: BOT_ID_MAIN,
			groupId: GROUP_MAIN_ID,
			agentId: BOB,
			entries: ENTRIES_MAIN,
			// CAROL is missing from the guard's own roster, even though she is in the binding's roster.
			guardEntries: [ENTRIES_MAIN[0]!, ENTRIES_MAIN[1]!],
		});
		const deps = buildDeps(db, binding);

		await assert.rejects(() => sendPath(broadcastInput(), deps), isWrongRoom);

		assert.equal(binding.telegram.sentMessages.length, 0);
		const rows = auditRows(db, PROJECT_MAIN);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].reason, "WRONG_ROOM");
	});
});

// --- Stamping: the posted envelope, never the caller's forged fields ---

test("the envelope actually posted carries from=config.agent_id and to_user_id=roster's user id, even with forged input fields", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);

		const forged = {
			type: "REQUEST",
			body: "please review",
			to: ALICE,
			from: CAROL,
			to_user_id: 1,
			chat_id: -1,
		} as unknown as SendToolInput;

		const result = await sendPath(forged, deps);

		const groupMessage = binding.telegram.sentMessages.find((m) => m.chat_id === GROUP_MAIN_ID);
		assert.ok(groupMessage, "expected a group post");
		const decoded = decodeEnvelope(deliveredText(groupMessage!.text));
		assert.ok(decoded.ok, "the posted text must decode as an envelope");
		if (decoded.ok) {
			assert.equal(decoded.envelope.from, BOB);
			assert.equal(decoded.envelope.to_user_id, ALICE_USER_ID);
			assert.equal(decoded.envelope.eid, result.eid);
		}
	});
});

test("the posted ACK and RESOLVED carry the basis the send path stamps (acknowledged-only; the caller's basis)", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);
		const threadId = hexId(650);
		writeThread(db, PROJECT_MAIN, threadId, { from: ALICE, to: BOB, to_user_id: BOB_USER_ID, opened_eid: "open-650" });

		const postedBasis = (before: number): string | undefined => {
			const posted = binding.telegram.sentMessages.slice(before).find((m) => m.chat_id === GROUP_MAIN_ID);
			assert.ok(posted, "expected a group post");
			const decoded = decodeEnvelope(deliveredText(posted!.text));
			assert.ok(decoded.ok, "the posted text must decode as an envelope");
			return decoded.ok ? decoded.envelope.basis : undefined;
		};

		const beforeAck = binding.telegram.sentMessages.length;
		await sendPath(ackInput({ thread: threadId, to: ALICE }), deps);
		assert.equal(postedBasis(beforeAck), "acknowledged-only");

		const beforeResolved = binding.telegram.sentMessages.length;
		await sendPath(resolvedInput({ thread: threadId, to: ALICE, basis: "work-confirmed" }), deps);
		assert.equal(postedBasis(beforeResolved), "work-confirmed");
	});
});

// --- Bookkeeping and the one audit row per success ---

test("every send type writes exactly one 'ok' audit row (envelope_type, eid, user ids), and audit_log has no body column", async () => {
	await withLedger(async (db) => {
		const cols = (db.prepare("PRAGMA table_info(audit_log)").all() as { name: string }[]).map((c) => c.name);
		assert.ok(!cols.includes("body"), "audit_log must have no body column");

		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);

		// REQUEST opens a thread.
		let before = auditRows(db, PROJECT_MAIN).length;
		let result = await sendPath(requestInput({ to: ALICE }), deps);
		let rows = auditRows(db, PROJECT_MAIN);
		assert.equal(rows.length, before + 1);
		assert.equal(rows[rows.length - 1]!.outcome, "ok");
		assert.equal(rows[rows.length - 1]!.envelope_type, "REQUEST");
		assert.equal(rows[rows.length - 1]!.eid, result.eid);
		assert.equal(rows[rows.length - 1]!.from_user_id, BOB_USER_ID);
		assert.equal(rows[rows.length - 1]!.to_user_id, ALICE_USER_ID);
		const requestThreadId = result.thread;

		const openedThread = readThreadRecord(db, PROJECT_MAIN, requestThreadId);
		assert.ok(openedThread);
		assert.equal(openedThread!.status, "open");
		assert.equal(openedThread!.opened_type, "REQUEST");
		assert.equal(openedThread!.from, BOB);
		assert.equal(openedThread!.to, ALICE);
		assert.equal(openedThread!.via, "group");
		assert.ok(openedThread!.group_message_id !== null);
		assert.equal(openedThread!.opened_message_id, openedThread!.group_message_id);

		// ACK increments ack_count and stamps the new history entry via direct.
		const ackThreadId = hexId(710);
		writeThread(db, PROJECT_MAIN, ackThreadId, { from: ALICE, to: BOB, to_user_id: BOB_USER_ID, opened_eid: "open-710" });
		before = auditRows(db, PROJECT_MAIN).length;
		result = await sendPath(ackInput({ thread: ackThreadId, to: ALICE }), deps);
		rows = auditRows(db, PROJECT_MAIN);
		assert.equal(rows.length, before + 1);
		assert.equal(rows[rows.length - 1]!.envelope_type, "ACK");
		assert.equal(rows[rows.length - 1]!.eid, result.eid);
		const ackedThread = readThreadRecord(db, PROJECT_MAIN, ackThreadId);
		assert.equal(ackedThread!.ack_count, 1);
		assert.equal(ackedThread!.history.at(-1)?.type, "ACK");
		assert.equal(ackedThread!.history.at(-1)?.via, "direct");

		// REPLY appends history to the REQUEST thread opened above.
		before = auditRows(db, PROJECT_MAIN).length;
		const historyBefore = readThreadRecord(db, PROJECT_MAIN, requestThreadId)!.history.length;
		result = await sendPath(replyInput({ thread: requestThreadId, to: ALICE }), deps);
		rows = auditRows(db, PROJECT_MAIN);
		assert.equal(rows.length, before + 1);
		assert.equal(rows[rows.length - 1]!.envelope_type, "REPLY");
		const repliedThread = readThreadRecord(db, PROJECT_MAIN, requestThreadId);
		assert.equal(repliedThread!.history.length, historyBefore + 1);

		// RESOLVED resolves a fresh thread.
		const resolvedThreadId = hexId(720);
		writeThread(db, PROJECT_MAIN, resolvedThreadId, { from: ALICE, to: BOB, to_user_id: BOB_USER_ID, opened_eid: "open-720" });
		before = auditRows(db, PROJECT_MAIN).length;
		result = await sendPath(resolvedInput({ thread: resolvedThreadId, to: ALICE, basis: "work-confirmed" }), deps);
		rows = auditRows(db, PROJECT_MAIN);
		assert.equal(rows.length, before + 1);
		assert.equal(rows[rows.length - 1]!.envelope_type, "RESOLVED");
		const resolvedThread = readThreadRecord(db, PROJECT_MAIN, resolvedThreadId);
		assert.equal(resolvedThread!.status, "resolved");
		assert.equal(resolvedThread!.resolved_by, BOB);
		assert.equal(resolvedThread!.closure_delivered, true);

		// BROADCAST opens no thread.
		before = auditRows(db, PROJECT_MAIN).length;
		const threadsBefore = threadCount(db, PROJECT_MAIN);
		result = await sendPath(broadcastInput(), deps);
		rows = auditRows(db, PROJECT_MAIN);
		assert.equal(rows.length, before + 1);
		assert.equal(rows[rows.length - 1]!.envelope_type, "BROADCAST");
		assert.equal(threadCount(db, PROJECT_MAIN), threadsBefore, "BROADCAST must open no thread");
		assert.equal(readThreadRecord(db, PROJECT_MAIN, result.thread), undefined);
	});
});

test("a DM failure yields delivery.degraded and the audit row records outcome degraded", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);
		binding.telegram.failSendMessageTo(`@${ALICE_USERNAME}`, new Error("simulated dm failure"));

		const result = await sendPath(requestInput({ to: ALICE }), deps);

		assert.equal(result.delivery.degraded, true);
		const rows = auditRows(db, PROJECT_MAIN);
		assert.equal(rows.length, 1);
		assert.equal(rows[0]!.outcome, "degraded");
	});
});

// --- group_outage condition ---

test("group_outage: a soft group failure raises the condition with a code, 'since' is first-wins, and a later successful post clears it", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);

		binding.telegram.failSendMessageTo(GROUP_MAIN_ID, new Error("simulated network blip 1"));
		const result1 = await sendPath(requestInput({ to: ALICE }), deps);
		assert.equal(result1.delivery.group.ok, false);

		const raised1 = readCondition(db, PROJECT_MAIN, "group_outage");
		assert.ok(raised1);
		assert.equal(raised1!.detail?.last_error, "TRANSPORT_ERROR");
		const since1 = raised1!.since;

		binding.telegram.failSendMessageTo(GROUP_MAIN_ID, new Error("simulated network blip 2"));
		await sendPath(requestInput({ to: ALICE }), deps);

		const raised2 = readCondition(db, PROJECT_MAIN, "group_outage");
		assert.ok(raised2);
		assert.equal(raised2!.since, since1, "since must be first-wins across repeated raises");

		const cleared = await sendPath(requestInput({ to: ALICE }), deps);
		assert.equal(cleared.delivery.group.ok, true);
		assert.equal(readCondition(db, PROJECT_MAIN, "group_outage"), undefined);
	});
});

// --- PT-25 half: GroupMigratedError ---

test("PT-25 half: GroupMigratedError reports new_chat_id informationally, never mutates config, and a later send still targets the original group id", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);
		binding.telegram.failSendMessageTo(GROUP_MAIN_ID, new GroupMigratedError(400, "supergroup upgrade", NEW_CHAT_ID));

		const result = await sendPath(requestInput({ to: ALICE }), deps);

		assert.equal(result.delivery.group.ok, false);
		if (!result.delivery.group.ok) {
			assert.equal(result.delivery.group.new_chat_id, NEW_CHAT_ID);
		}
		assert.equal(binding.telegram.sentMessages.some((m) => m.chat_id === NEW_CHAT_ID), false);
		assert.equal(deps.config.chat_id, GROUP_MAIN_ID);
		assert.deepEqual(
			auditRows(db, PROJECT_MAIN).map((row) => [row.outcome, row.reason]),
			[["degraded", null]],
			"the migration is recorded as a degraded send and nothing more (module doc, design §8.2)",
		);

		const before = binding.telegram.sentMessages.length;
		await sendPath(broadcastInput(), deps);
		const afterCalls = binding.telegram.sentMessages.slice(before);
		assert.ok(afterCalls.some((m) => m.chat_id === GROUP_MAIN_ID), "the next send must still target the original group id");
	});
});

// --- Transport failure: nothing delivered ---

test("transport failure (message-level 400): nothing delivered, no thread change, no audit row, error carries cause", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);
		const threadId = hexId(500);
		writeThread(db, PROJECT_MAIN, threadId, { from: ALICE, to: BOB, to_user_id: BOB_USER_ID, opened_eid: "open-500" });
		const before = readThreadRecord(db, PROJECT_MAIN, threadId);
		const auditBefore = auditRows(db, PROJECT_MAIN).length;

		binding.telegram.failSendMessageTo(GROUP_MAIN_ID, new TelegramApiError(400, "can't parse entities: boom"));

		await assert.rejects(
			() => sendPath(replyInput({ thread: threadId, to: ALICE }), deps),
			(err: unknown) => {
				assert.ok(err instanceof SendToolError);
				assert.equal((err as SendToolError).code, "TRANSPORT_ERROR");
				assert.ok((err as SendToolError).cause !== undefined);
				return true;
			},
		);

		assert.deepEqual(readThreadRecord(db, PROJECT_MAIN, threadId), before);
		assert.equal(auditRows(db, PROJECT_MAIN).length, auditBefore);
	});
});

test("abandonment: a fully-failed transport still closes the thread locally with closure_delivered=false, and the error names fetch", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);
		const threadId = hexId(600);
		// BOB is the originator — abandonment is the originator's alone (ADR-13).
		writeThread(db, PROJECT_MAIN, threadId, { from: BOB, to: ALICE, to_user_id: ALICE_USER_ID, opened_eid: "open-600" });

		binding.telegram.failSendMessageTo(GROUP_MAIN_ID, new Error("group down"));
		binding.telegram.failSendMessageTo(`@${ALICE_USERNAME}`, new Error("dm down"));

		await assert.rejects(
			() => sendPath(resolvedInput({ thread: threadId, to: ALICE, basis: ABANDON_BASIS_VALUE }), deps),
			(err: unknown) => {
				assert.ok(err instanceof SendToolError);
				assert.equal((err as SendToolError).code, "TRANSPORT_ERROR");
				assert.ok((err as Error).message.includes(`${TOOL_PREFIX}fetch`));
				return true;
			},
		);

		const closed = readThreadRecord(db, PROJECT_MAIN, threadId);
		assert.ok(closed);
		assert.equal(closed!.status, "resolved");
		assert.equal(closed!.closure_delivered, false);
		assert.equal(closed!.resolved_by, BOB);
		assert.equal(closed!.basis, ABANDON_BASIS_VALUE);
	});
});

// --- SECRET_PATTERN_DETECTED / VALIDATION_ERROR ---

test("SECRET_PATTERN_DETECTED writes one rejected audit row and makes no network call; VALIDATION_ERROR writes none", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);

		await assert.rejects(
			() => sendPath(broadcastInput({ body: `please rotate: ${FIXTURE_BOT_TOKEN}` }), deps),
			(err: unknown) => err instanceof SendToolError && err.code === "SECRET_PATTERN_DETECTED",
		);
		assert.equal(binding.telegram.sentMessages.length, 0);
		const rows = auditRows(db, PROJECT_MAIN);
		assert.equal(rows.length, 1);
		assert.equal(rows[0]!.outcome, "rejected");
		assert.equal(rows[0]!.reason, "SECRET_PATTERN_DETECTED");
		assert.equal(rows[0]!.eid, null);
		// Verifier E1/E6: the row names the type and the binding, and no identity — nothing was stamped yet.
		assert.equal(rows[0]!.direction, "send");
		assert.equal(rows[0]!.envelope_type, "BROADCAST");
		assert.equal(rows[0]!.bot_id, BOT_ID_MAIN);
		assert.equal(rows[0]!.chat_id, GROUP_MAIN_ID);
		assert.equal(rows[0]!.from_user_id, null);
		assert.equal(rows[0]!.to_user_id, null);

		await assert.rejects(
			() => sendPath({ type: "REQUEST", body: "clean body" } as unknown as SendToolInput, deps),
			(err: unknown) => err instanceof SendToolError && err.code === "VALIDATION_ERROR",
		);
		assert.equal(auditRows(db, PROJECT_MAIN).length, 1, "a VALIDATION_ERROR must write no audit row");
	});
});

test("a Transport that reports success with nothing delivered is TRANSPORT_ERROR and records nothing (stampFrom's guard, JD-A-001)", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const hollowTransport: SendPathDeps["transport"] = {
			send: async () => ({ group: { ok: false, error: "none", code: "TRANSPORT_ERROR" }, direct: [], degraded: true }),
		};
		const deps = buildDeps(db, binding, { transport: hollowTransport });

		await assert.rejects(
			() => sendPath(requestInput({ to: ALICE }), deps),
			(err: unknown) => err instanceof SendToolError && err.code === "TRANSPORT_ERROR",
		);
		assert.equal(threadCount(db, PROJECT_MAIN), 0);
		assert.equal(auditRows(db, PROJECT_MAIN).length, 0);
		assert.equal(readCondition(db, PROJECT_MAIN, "group_outage"), undefined, "the whole bookkeeping transaction rolled back");
	});
});

// --- silent + group reply anchoring ---

test("silent: ACK sets disable_notification true and REQUEST does not; an in-thread send anchors reply_to_message_id to group_message_id", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);
		const threadId = hexId(700);
		writeThread(db, PROJECT_MAIN, threadId, { from: ALICE, to: BOB, to_user_id: BOB_USER_ID, group_message_id: 555, opened_eid: "open-700" });

		const beforeAck = binding.telegram.sentMessages.length;
		await sendPath(ackInput({ thread: threadId, to: ALICE }), deps);
		const ackGroupMessage = binding.telegram.sentMessages.slice(beforeAck).find((m) => m.chat_id === GROUP_MAIN_ID);
		assert.ok(ackGroupMessage, "expected a group post for the ACK");
		assert.equal(ackGroupMessage!.disable_notification, true);
		assert.equal(ackGroupMessage!.reply_to_message_id, 555);

		const beforeRequest = binding.telegram.sentMessages.length;
		await sendPath(requestInput({ to: ALICE }), deps);
		const requestGroupMessage = binding.telegram.sentMessages.slice(beforeRequest).find((m) => m.chat_id === GROUP_MAIN_ID);
		assert.ok(requestGroupMessage, "expected a group post for the REQUEST");
		assert.notEqual(requestGroupMessage!.disable_notification, true);
		assert.equal(requestGroupMessage!.reply_to_message_id, undefined, "a REQUEST opens a thread and has no anchor yet");
	});
});

// --- wire ---

test("wire equals guardEncodedLength's result for the built envelope", async () => {
	await withLedger(async (db) => {
		const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
		const deps = buildDeps(db, binding);

		const result = await sendPath(requestInput({ to: ALICE, body: "checking wire" }), deps);

		const envelope: Envelope = {
			eid: result.eid,
			type: "REQUEST",
			from: BOB,
			to: ALICE,
			thread: result.thread,
			ts: result.sent_at,
			body: "checking wire",
			to_user_id: ALICE_USER_ID,
		};
		const recomputed = guardEncodedLength(envelope);
		assert.deepEqual(result.wire, recomputed.wire);
	});
});

// --- Source scan ---

test("send-path.ts contains no .sendMessage( call (PT-28 call-site confinement)", () => {
	const src = readFileSync(join(REPO_ROOT, "src/daemon/send/send-path.ts"), "utf8");
	assert.doesNotMatch(src, /\.sendMessage\(/);
});

// --- BindingMutex ---

describe("BindingMutex", () => {
	it("serializes calls under the same key", async () => {
		const mutex = new BindingMutex();
		const order: string[] = [];

		const p1 = mutex.run("k", async () => {
			order.push("1-start");
			await new Promise((resolve) => setTimeout(resolve, 20));
			order.push("1-end");
			return 1;
		});
		const p2 = mutex.run("k", async () => {
			order.push("2-start");
			await new Promise((resolve) => setTimeout(resolve, 1));
			order.push("2-end");
			return 2;
		});

		const [r1, r2] = await Promise.all([p1, p2]);
		assert.equal(r1, 1);
		assert.equal(r2, 2);
		assert.deepEqual(order, ["1-start", "1-end", "2-start", "2-end"]);
	});

	it("runs calls under different keys concurrently", async () => {
		const mutex = new BindingMutex();
		const order: string[] = [];

		const p1 = mutex.run("a", async () => {
			order.push("a-start");
			await new Promise((resolve) => setTimeout(resolve, 20));
			order.push("a-end");
		});
		const p2 = mutex.run("b", async () => {
			order.push("b-start");
			await new Promise((resolve) => setTimeout(resolve, 1));
			order.push("b-end");
		});

		await Promise.all([p1, p2]);
		assert.deepEqual(order.slice(0, 2).sort(), ["a-start", "b-start"], "both must have started before either finished");
	});

	it("a rejected call does not block the next call under the same key", async () => {
		const mutex = new BindingMutex();

		await assert.rejects(
			() =>
				mutex.run("k", async () => {
					throw new Error("boom");
				}),
			/boom/,
		);

		const result = await mutex.run("k", async () => "ok");
		assert.equal(result, "ok");
	});

	it("drains: once a key's chain settles — after success or failure — its map entry is gone", async () => {
		const mutex = new BindingMutex();
		// White-box on purpose: the no-unbounded-growth guarantee is about the private map, and no
		// public behaviour differs between a drained entry and a settled one left behind.
		const chains = (mutex as unknown as { chains: Map<string, unknown> }).chains;

		const first = mutex.run("k", async () => "first");
		const second = mutex.run("k", async () => {
			throw new Error("boom");
		});
		assert.equal(chains.size, 1, "one entry while calls are queued under the key");
		assert.equal(await first, "first");
		await assert.rejects(second, /boom/);
		assert.equal(chains.size, 0, "the entry must be removed once nothing is queued behind the last call");

		assert.equal(await mutex.run("k", async () => "third"), "third");
		assert.equal(chains.size, 0);
	});

	it("sendPath on two different bindings sharing one mutex runs concurrently — the lock is per project_id", async () => {
		await withLedger(async (db) => {
			const main = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
			const iso = buildBinding({ projectId: PROJECT_ISO_A, botId: BOT_ID_ISO_A, groupId: GROUP_ISO_A_ID, agentId: ISO_A_AGENT, entries: ENTRIES_ISO_A });
			const mutex = new BindingMutex();

			// MAIN's send cannot finish until ISO's has: with one global lock ISO would queue behind MAIN
			// and neither would ever complete, so the race below would time out instead.
			let releaseMain!: () => void;
			const mainGate = new Promise<void>((resolve) => {
				releaseMain = resolve;
			});
			const gatedMainTransport: SendPathDeps["transport"] = {
				send: async (text, recipients, options) => {
					await mainGate;
					return main.transport.send(text, recipients, options);
				},
			};

			const mainSend = sendPath(requestInput({ to: ALICE }), buildDeps(db, main, { mutex, transport: gatedMainTransport }));
			const isoSend = sendPath(requestInput({ to: ISO_A_ONE }), buildDeps(db, iso, { mutex })).then((result) => {
				releaseMain();
				return result;
			});

			let timer: ReturnType<typeof setTimeout> | undefined;
			const deadlock = new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("the two bindings serialised on one lock")), CROSS_BINDING_DEADLINE_MS);
			});
			try {
				await Promise.race([Promise.all([mainSend, isoSend]), deadlock]);
			} finally {
				clearTimeout(timer);
			}
		});
	});

	it("BindingMutex: two concurrent sendPath ACK calls on the same thread both land — ack_count ends at 2", async () => {
		await withLedger(async (db) => {
			const binding = buildBinding({ projectId: PROJECT_MAIN, botId: BOT_ID_MAIN, groupId: GROUP_MAIN_ID, agentId: BOB, entries: ENTRIES_MAIN });
			const deps = buildDeps(db, binding);
			const threadId = hexId(800);
			writeThread(db, PROJECT_MAIN, threadId, { from: ALICE, to: BOB, to_user_id: BOB_USER_ID, opened_eid: "open-800" });

			await Promise.all([sendPath(ackInput({ thread: threadId, to: ALICE }), deps), sendPath(ackInput({ thread: threadId, to: ALICE }), deps)]);

			const thread = readThreadRecord(db, PROJECT_MAIN, threadId);
			assert.equal(thread!.ack_count, 2);
		});
	});
});
