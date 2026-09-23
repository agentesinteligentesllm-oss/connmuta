import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { readThreadRecord, writeThreadRecord } from "../../../src/ledger/threads.js";
import type { ThreadRecord } from "../../../src/shared/thread-record.js";
import { ABANDON_BASIS_VALUE } from "../../../src/shared/envelope.js";
import { TOOL_PREFIX, GROUP_MESSAGES_PER_MINUTE } from "../../../src/shared/constants.js";
import type { SendToolInput } from "../../../src/shared/tool-schemas.js";
import type { ProjectRosterEntry } from "../../../src/shared/project-file.js";
import {
	RateLimitedError,
	type GetUpdatesParams,
	type SendMessageParams,
	type TelegramChat,
	type TelegramClient,
	type TelegramMessage,
	type TelegramUpdate,
	type TelegramUser,
} from "../../../src/daemon/telegram.js";
import { RoomGuardClient } from "../../../src/daemon/transport/room-guard.js";
import { GroupTransport } from "../../../src/daemon/transport/group.js";
import { DirectTransport } from "../../../src/daemon/transport/direct.js";
import { DualWriteTransport } from "../../../src/daemon/transport/dual.js";
import { SendToolError } from "../../../src/daemon/send/validate.js";
import { BindingMutex, sendPath, type SendPathDeps } from "../../../src/daemon/send/send-path.js";
import {
	RATE_WINDOW_MINUTE_MS,
	RATE_WINDOW_SECOND_MS,
	MS_PER_SECOND,
	MIN_RETRY_AFTER_S,
	readRetryAfterUntil,
	recordRetryAfter,
	retryAfterSeconds,
	RateLimitRecorder,
	SendRateBudget,
} from "../../../src/daemon/send/rate.js";
import { FakeTelegramClient } from "../../fakes/telegram.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * `daemon/send/rate.ts` (PR-28, design §9, spec `send-path` "Rate discipline without auto-retry",
 * PT-33 429 half; closes unit 8 `send-path`).
 *
 * A real `node:sqlite` ledger per test (`test/daemon/send/send-path.test.ts`'s own precedent), and
 * every transport stack built exactly like `bindings.ts`'s `buildTransport` does when a ledger is
 * present: raw `FakeTelegramClient` -> `RateLimitRecorder` -> `RoomGuardClient` ->
 * `GroupTransport`/`DirectTransport` -> `DualWriteTransport`. `AttemptCountingClient` sits below the
 * recorder purely to count attempts, because `FakeTelegramClient.sentMessages` records only
 * successful calls and several scenarios below need to assert "no retry" on a call that FAILS.
 *
 * Every id below is a placeholder (AGENTS.md §3): synthetic agent, user, bot and group ids.
 */

const PROJECT_A = "project-rate-a";
const BOT_ID_A = 7000301;
const GROUP_A_ID = -1006660001;
const AGENT_A = "@rate-a-agent";
const AGENT_A_USER_ID = 700000301;
const ALICE_A = "@rate-a-alice";
const ALICE_A_USER_ID = 700000302;
const ALICE_A_USERNAME = "rate_a_alice_bot";
const CAROL_A = "@rate-a-carol";
const CAROL_A_USER_ID = 700000303;
const CAROL_A_USERNAME = "rate_a_carol_bot";

const ENTRIES_A: readonly ProjectRosterEntry[] = [
	{ agent_id: AGENT_A, user_id: AGENT_A_USER_ID, username: "rate_a_agent_bot" },
	{ agent_id: ALICE_A, user_id: ALICE_A_USER_ID, username: ALICE_A_USERNAME },
	{ agent_id: CAROL_A, user_id: CAROL_A_USER_ID, username: CAROL_A_USERNAME },
];

const PROJECT_B = "project-rate-b";
const BOT_ID_B = 7000302;
const GROUP_B_ID = -1006660002;
const AGENT_B = "@rate-b-agent";
const AGENT_B_USER_ID = 700000401;
const ALICE_B = "@rate-b-alice";
const ALICE_B_USER_ID = 700000402;
const ALICE_B_USERNAME = "rate_b_alice_bot";

const ENTRIES_B: readonly ProjectRosterEntry[] = [
	{ agent_id: AGENT_B, user_id: AGENT_B_USER_ID, username: "rate_b_agent_bot" },
	{ agent_id: ALICE_B, user_id: ALICE_B_USER_ID, username: ALICE_B_USERNAME },
];

const NOW = "2026-05-01T10:00:00.000Z";
/** Comfortably over `RATE_WINDOW_SECOND_MS` — advancing the clock by this much between sends never trips the per-chat window by accident. */
const OVER_SECOND_WINDOW_MS = 1_100;
/** Two different Telegram waits met in one call, so the test can tell which one survives. */
const LONG_WAIT_S = 30;
const SHORT_WAIT_S = 5;
/** Time that passes inside the awaited call before Telegram answers. */
const CALL_DURATION_MS = 10_000;

function withLedger(run: (db: DatabaseSync) => Promise<void> | void): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-send-rate-"));
	const ledger = openLedger({ homeDir: home });
	return Promise.resolve(run(ledger.db)).finally(() => {
		try {
			ledger.db.close();
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
}

/** A clock this suite fully controls: `now()`/`nowMs()` never move on their own, only via `advance`. */
interface ControllableClock {
	readonly now: () => Date;
	readonly nowMs: () => number;
	advance(deltaMs: number): void;
}

function controllableClock(startIso: string): ControllableClock {
	let ms = Date.parse(startIso);
	return {
		now: () => new Date(ms),
		nowMs: () => ms,
		advance: (deltaMs: number) => {
			ms += deltaMs;
		},
	};
}

/**
 * Counts every `sendMessage` attempt regardless of outcome, because {@link FakeTelegramClient}'s own
 * `sentMessages` records only calls that SUCCEEDED — several scenarios below need to assert "the fake
 * saw exactly one attempt per target, never retried" for a call that failed.
 */
class AttemptCountingClient implements TelegramClient {
	attempts = 0;

	constructor(private readonly inner: TelegramClient) {}

	async sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
		this.attempts++;
		return this.inner.sendMessage(params);
	}

	async getUpdates(params?: GetUpdatesParams): Promise<TelegramUpdate[]> {
		return this.inner.getUpdates(params);
	}

	async getMe(): Promise<TelegramUser> {
		return this.inner.getMe();
	}

	async getChat(chatId: number | string): Promise<TelegramChat> {
		return this.inner.getChat(chatId);
	}
}

interface BindingFixture {
	readonly projectId: string;
	readonly botId: number;
	readonly groupId: number;
	readonly agentId: string;
	readonly config: SendPathDeps["config"];
	readonly fake: FakeTelegramClient;
	readonly counter: AttemptCountingClient;
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

/** Builds one binding's whole stack exactly as `bindings.ts`'s `buildTransport` does when `this.db` is set. */
function buildBinding(
	db: DatabaseSync,
	opts: {
		projectId: string;
		botId: number;
		groupId: number;
		agentId: string;
		entries: readonly ProjectRosterEntry[];
		recorderNow?: () => number;
	},
): BindingFixture {
	const fake = new FakeTelegramClient();
	const counter = new AttemptCountingClient(fake);
	const recorder = new RateLimitRecorder(counter, { db, bot_id: opts.botId, now: opts.recorderNow });
	const roomGuard = new RoomGuardClient(recorder, { groupId: opts.groupId, roster: opts.entries });
	const group = new GroupTransport(roomGuard, opts.groupId);
	const direct = new DirectTransport(roomGuard, toDirectRoster(opts.entries));
	const transport = new DualWriteTransport(group, direct);

	return {
		projectId: opts.projectId,
		botId: opts.botId,
		groupId: opts.groupId,
		agentId: opts.agentId,
		config: { agent_id: opts.agentId, roster: toBindingRoster(opts.entries), secret_markers: [], chat_id: opts.groupId },
		fake,
		counter,
		roomGuard,
		transport,
	};
}

function buildDeps(
	db: DatabaseSync,
	binding: BindingFixture,
	clock: ControllableClock,
	budget: SendRateBudget,
	overrides: Partial<SendPathDeps> = {},
): SendPathDeps {
	return {
		db,
		project_id: binding.projectId,
		bot_id: binding.botId,
		config: binding.config,
		transport: binding.transport,
		roomGuard: binding.roomGuard,
		mutex: new BindingMutex(),
		rateBudget: budget,
		now: clock.now,
		...overrides,
	};
}

function sampleThread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
	return {
		status: "open",
		opened_type: "REQUEST",
		opened_eid: "opening-eid",
		from: AGENT_A,
		to: ALICE_A,
		to_user_id: ALICE_A_USER_ID,
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
		awaiting: ALICE_A,
		history: [],
		...overrides,
	};
}

/** A wire-shaped 12-hex id, distinct per `n` (`shared/envelope.ts`'s `THREAD_PATTERN`/`EID_PATTERN`). */
function hexId(n: number): string {
	return n.toString(16).padStart(12, "0");
}

function writeThread(db: DatabaseSync, projectId: string, threadId: string, overrides: Partial<ThreadRecord> = {}): void {
	writeThreadRecord(db, { project_id: projectId, thread_id: threadId, record: sampleThread(overrides), updated_at: NOW });
}

function requestInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "REQUEST", body: "a request", ...overrides } as SendToolInput;
}
function broadcastInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "BROADCAST", body: "broadcast body", ...overrides } as SendToolInput;
}
function resolvedInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "RESOLVED", body: "resolved body", basis: "work-confirmed", ...overrides } as SendToolInput;
}

function auditRows(db: DatabaseSync, projectId: string): Record<string, unknown>[] {
	return db.prepare("SELECT * FROM audit_log WHERE project_id = ? ORDER BY id").all(projectId) as Record<string, unknown>[];
}

function threadCount(db: DatabaseSync, projectId: string): number {
	const row = db.prepare("SELECT COUNT(*) AS n FROM threads WHERE project_id = ?").get(projectId) as { n: number | bigint };
	return Number(row.n);
}

function isRateLimited(error: unknown): error is SendToolError {
	return error instanceof SendToolError && error.code === "RATE_LIMITED";
}

// --- Spec scenario: "429 surfaced, cursor unmoved, no retry", and the local pre-check that follows it ---

test("Spec scenario: a 429 on every target reclassifies TRANSPORT_ERROR to RATE_LIMITED, no retry, cursor unmoved, one audit row, offsets.retry_after_until set", async () => {
	await withLedger(async (db) => {
		const clock = controllableClock(NOW);
		const binding = buildBinding(db, { projectId: PROJECT_A, botId: BOT_ID_A, groupId: GROUP_A_ID, agentId: AGENT_A, entries: ENTRIES_A, recorderNow: clock.nowMs });
		const deps = buildDeps(db, binding, clock, new SendRateBudget());

		// Seed a known cursor BEFORE the send — the "cursor unmoved" assertion needs a value to compare against.
		db.prepare("INSERT INTO offsets (bot_id, next_update_id) VALUES (?, ?)").run(BOT_ID_A, 42);

		binding.fake.failSendMessageTo(GROUP_A_ID, new RateLimitedError(30));
		binding.fake.failSendMessageTo(`@${ALICE_A_USERNAME}`, new RateLimitedError(30));

		await assert.rejects(
			() => sendPath(requestInput({ to: ALICE_A }), deps),
			(err: unknown) => {
				assert.ok(isRateLimited(err));
				assert.equal((err as SendToolError).retry_after_s, 30);
				assert.ok((err as SendToolError).cause !== undefined, "the underlying TransportError must survive as cause");
				return true;
			},
		);

		assert.equal(binding.counter.attempts, 2, "exactly one attempt per target (group + alice), never retried");

		const offsetRow = db.prepare("SELECT next_update_id, retry_after_until FROM offsets WHERE bot_id = ?").get(BOT_ID_A) as {
			next_update_id: number;
			retry_after_until: string | null;
		};
		assert.equal(offsetRow.next_update_id, 42, "the receive-side cursor is untouched by a send-side 429");
		assert.equal(offsetRow.retry_after_until, new Date(clock.nowMs() + 30_000).toISOString());

		assert.equal(threadCount(db, PROJECT_A), 0, "no thread row for a fully rate-limited REQUEST");
		const rows = auditRows(db, PROJECT_A);
		assert.equal(rows.length, 1);
		assert.equal(rows[0]!.outcome, "rejected");
		assert.equal(rows[0]!.reason, "RATE_LIMITED");

		// --- "a second send inside the window is refused locally... retry_after_s counts down... after the window it goes through" ---

		await assert.rejects(
			() => sendPath(requestInput({ to: ALICE_A }), deps),
			(err: unknown) => {
				assert.ok(isRateLimited(err));
				assert.equal((err as SendToolError).retry_after_s, 30, "the clock has not moved — the full window remains");
				return true;
			},
		);
		assert.equal(binding.counter.attempts, 2, "the local pre-check refusal makes no network call");

		clock.advance(15_000);
		await assert.rejects(
			() => sendPath(requestInput({ to: ALICE_A }), deps),
			(err: unknown) => {
				assert.ok(isRateLimited(err));
				assert.equal((err as SendToolError).retry_after_s, 15, "half the window has elapsed");
				return true;
			},
		);
		assert.equal(binding.counter.attempts, 2);

		clock.advance(20_000); // total 35s since the 429 — past the recorded 30s window
		const result = await sendPath(requestInput({ to: ALICE_A }), deps);
		assert.equal(result.ok, true);
		assert.equal(binding.counter.attempts, 4, "the window cleared — this send actually attempted both targets");
	});
});

// --- Partial 429: success stays success, and the ledger still gates the next send ---

test("Partial 429 (group ok, one DM 429): the send still succeeds degraded, retry_after_until is recorded underneath it, and the next send is refused locally", async () => {
	await withLedger(async (db) => {
		const clock = controllableClock(NOW);
		const binding = buildBinding(db, { projectId: PROJECT_A, botId: BOT_ID_A, groupId: GROUP_A_ID, agentId: AGENT_A, entries: ENTRIES_A, recorderNow: clock.nowMs });
		const deps = buildDeps(db, binding, clock, new SendRateBudget());

		binding.fake.failSendMessageTo(`@${CAROL_A_USERNAME}`, new RateLimitedError(30));

		const result = await sendPath(broadcastInput(), deps);
		assert.equal(result.ok, true);
		assert.equal(result.delivery.degraded, true, "one DM failed — the send is degraded, not an error");
		assert.equal(readRetryAfterUntil(db, BOT_ID_A), new Date(clock.nowMs() + 30_000).toISOString());

		const attemptsAfterFirst = binding.counter.attempts;
		await assert.rejects(() => sendPath(requestInput({ to: ALICE_A }), deps), isRateLimited);
		assert.equal(binding.counter.attempts, attemptsAfterFirst, "the next send is refused locally — no new attempt");
	});
});

// --- Abandonment under a full 429 ---

test("Abandonment under a full 429: the thread still closes locally (closure_delivered=false) and the surfaced error is RATE_LIMITED with retry_after_s", async () => {
	await withLedger(async (db) => {
		const clock = controllableClock(NOW);
		const binding = buildBinding(db, { projectId: PROJECT_A, botId: BOT_ID_A, groupId: GROUP_A_ID, agentId: AGENT_A, entries: ENTRIES_A, recorderNow: clock.nowMs });
		const deps = buildDeps(db, binding, clock, new SendRateBudget());
		const threadId = hexId(900);
		// AGENT_A is the originator — abandonment is the originator's alone (ADR-13).
		writeThread(db, PROJECT_A, threadId, { from: AGENT_A, to: ALICE_A, to_user_id: ALICE_A_USER_ID, opened_eid: "open-abandon" });

		binding.fake.failSendMessageTo(GROUP_A_ID, new RateLimitedError(45));
		binding.fake.failSendMessageTo(`@${ALICE_A_USERNAME}`, new RateLimitedError(45));

		await assert.rejects(
			() => sendPath(resolvedInput({ thread: threadId, to: ALICE_A, basis: ABANDON_BASIS_VALUE }), deps),
			(err: unknown) => {
				assert.ok(isRateLimited(err));
				assert.equal((err as SendToolError).retry_after_s, 45);
				assert.ok((err as Error).message.includes(`${TOOL_PREFIX}fetch`), "the closure sentence must survive");
				assert.ok((err as Error).message.includes("closed locally anyway"), "the closure sentence must survive");
				return true;
			},
		);

		const closed = readThreadRecord(db, PROJECT_A, threadId);
		assert.ok(closed);
		assert.equal(closed!.status, "resolved");
		assert.equal(closed!.closure_delivered, false);
		assert.equal(closed!.resolved_by, AGENT_A);
		assert.equal(closed!.basis, ABANDON_BASIS_VALUE);
		assert.deepEqual(
			auditRows(db, PROJECT_A).map((row) => [row.outcome, row.reason, row.envelope_type]),
			[["rejected", "RATE_LIMITED", "RESOLVED"]],
			"a rate-limited abandonment is audited like every other rate-limited send (JD-AB-001)",
		);
	});
});

test("one call meeting two 429s keeps the LONGER wait: a short DM wait never erases the group's (JD-AB-002)", async () => {
	await withLedger(async (db) => {
		const clock = controllableClock(NOW);
		const binding = buildBinding(db, { projectId: PROJECT_A, botId: BOT_ID_A, groupId: GROUP_A_ID, agentId: AGENT_A, entries: ENTRIES_A, recorderNow: clock.nowMs });
		const deps = buildDeps(db, binding, clock, new SendRateBudget());
		binding.fake.failSendMessageTo(GROUP_A_ID, new RateLimitedError(LONG_WAIT_S));
		binding.fake.failSendMessageTo(`@${ALICE_A_USERNAME}`, new RateLimitedError(SHORT_WAIT_S));

		await assert.rejects(
			() => sendPath(requestInput({ to: ALICE_A }), deps),
			(err: unknown) => isRateLimited(err) && (err as SendToolError).retry_after_s === LONG_WAIT_S,
		);
		assert.equal(readRetryAfterUntil(db, BOT_ID_A), new Date(clock.nowMs() + LONG_WAIT_S * MS_PER_SECOND).toISOString());
	});
});

test("the reactive retry_after_s is measured from a clock read AFTER the awaited call, not before it", async () => {
	await withLedger(async (db) => {
		const clock = controllableClock(NOW);
		const binding = buildBinding(db, { projectId: PROJECT_A, botId: BOT_ID_A, groupId: GROUP_A_ID, agentId: AGENT_A, entries: ENTRIES_A, recorderNow: clock.nowMs });
		// Time passes inside the call before Telegram answers 429: the wait must count from the answer.
		const slowTransport: SendPathDeps["transport"] = {
			send: async (text, recipients, options) => {
				clock.advance(CALL_DURATION_MS);
				return binding.transport.send(text, recipients, options);
			},
		};
		const deps = buildDeps(db, binding, clock, new SendRateBudget(), { transport: slowTransport });
		binding.fake.failSendMessageTo(GROUP_A_ID, new RateLimitedError(LONG_WAIT_S));
		binding.fake.failSendMessageTo(`@${ALICE_A_USERNAME}`, new RateLimitedError(LONG_WAIT_S));

		await assert.rejects(
			() => sendPath(requestInput({ to: ALICE_A }), deps),
			(err: unknown) => isRateLimited(err) && (err as SendToolError).retry_after_s === LONG_WAIT_S,
		);
	});
});

test("the group chat's own per-second window is checked, not only recorded: a second send to another peer within 1 s is refused", async () => {
	await withLedger(async (db) => {
		const clock = controllableClock(NOW);
		const binding = buildBinding(db, { projectId: PROJECT_A, botId: BOT_ID_A, groupId: GROUP_A_ID, agentId: AGENT_A, entries: ENTRIES_A, recorderNow: clock.nowMs });
		const deps = buildDeps(db, binding, clock, new SendRateBudget());
		await sendPath(requestInput({ to: ALICE_A }), deps);

		// CAROL's DM window is empty and the group minute has room: only the group chat's second window can refuse.
		await assert.rejects(() => sendPath(requestInput({ to: CAROL_A }), deps), isRateLimited);
	});
});

// --- SendRateBudget: the group-minute window ---

test("SendRateBudget: GROUP_MESSAGES_PER_MINUTE sends a second apart all pass; the next is refused with the seconds until the oldest frees", async () => {
	await withLedger(async (db) => {
		const clock = controllableClock(NOW);
		const binding = buildBinding(db, { projectId: PROJECT_A, botId: BOT_ID_A, groupId: GROUP_A_ID, agentId: AGENT_A, entries: ENTRIES_A, recorderNow: clock.nowMs });
		const deps = buildDeps(db, binding, clock, new SendRateBudget());

		for (let i = 0; i < GROUP_MESSAGES_PER_MINUTE; i++) {
			const result = await sendPath(requestInput({ to: ALICE_A }), deps);
			assert.equal(result.ok, true, `send ${i} must land — budget is not yet exhausted`);
			clock.advance(OVER_SECOND_WINDOW_MS);
		}

		const elapsedMs = GROUP_MESSAGES_PER_MINUTE * OVER_SECOND_WINDOW_MS;
		const expectedWait = Math.max(MIN_RETRY_AFTER_S, Math.ceil((RATE_WINDOW_MINUTE_MS - elapsedMs) / MS_PER_SECOND));
		await assert.rejects(
			() => sendPath(requestInput({ to: ALICE_A }), deps),
			(err: unknown) => {
				assert.ok(isRateLimited(err));
				assert.equal((err as SendToolError).retry_after_s, expectedWait);
				return true;
			},
		);

		// Pruning across windows: once the oldest entry is more than a minute old, the group window has
		// room again — this is the same "next" send from a state a naive unbounded budget could not reach.
		clock.advance(RATE_WINDOW_MINUTE_MS);
		const afterPruning = await sendPath(requestInput({ to: ALICE_A }), deps);
		assert.equal(afterPruning.ok, true);
	});
});

// --- SendRateBudget: the per-chat second window, and isolation between bots ---

test("SendRateBudget: a second send to the same chat within 1s is refused locally; after >=1s it passes; a different bot's budget is untouched", async () => {
	await withLedger(async (db) => {
		const clock = controllableClock(NOW);
		const bindingA = buildBinding(db, { projectId: PROJECT_A, botId: BOT_ID_A, groupId: GROUP_A_ID, agentId: AGENT_A, entries: ENTRIES_A, recorderNow: clock.nowMs });
		const bindingB = buildBinding(db, { projectId: PROJECT_B, botId: BOT_ID_B, groupId: GROUP_B_ID, agentId: AGENT_B, entries: ENTRIES_B, recorderNow: clock.nowMs });
		// One shared budget, like the single per-daemon instance production wires — isolation must come
		// from the bot_id key, not from using two separate instances.
		const budget = new SendRateBudget();
		const depsA = buildDeps(db, bindingA, clock, budget);
		const depsB = buildDeps(db, bindingB, clock, budget);

		const first = await sendPath(requestInput({ to: ALICE_A }), depsA);
		assert.equal(first.ok, true);

		await assert.rejects(
			() => sendPath(requestInput({ to: ALICE_A }), depsA),
			(err: unknown) => {
				assert.ok(isRateLimited(err));
				assert.equal((err as SendToolError).retry_after_s, 1);
				return true;
			},
		);

		// A different bot at the exact same instant must not be affected.
		const otherBot = await sendPath(requestInput({ to: ALICE_B }), depsB);
		assert.equal(otherBot.ok, true, "different bots do not share a budget");

		clock.advance(OVER_SECOND_WINDOW_MS);
		const afterWindow = await sendPath(requestInput({ to: ALICE_A }), depsA);
		assert.equal(afterWindow.ok, true, "the per-chat second window cleared");
	});
});

test("SendRateBudget: when both windows are violated the wait is the SLOWER one, not the faster", () => {
	const budget = new SendRateBudget();
	const t0 = Date.parse(NOW);
	for (let i = 0; i < GROUP_MESSAGES_PER_MINUTE; i++) {
		budget.record(BOT_ID_A, GROUP_A_ID, [], t0);
	}
	const halfMinuteLater = t0 + RATE_WINDOW_MINUTE_MS / 2;
	// A post in another group puts one entry in the chat window of "@shared" without touching GROUP_A's minute.
	budget.record(BOT_ID_A, GROUP_B_ID, ["@shared"], halfMinuteLater);

	const checkAt = halfMinuteLater + RATE_WINDOW_SECOND_MS / 2;
	const groupWait = Math.ceil((t0 + RATE_WINDOW_MINUTE_MS - checkAt) / MS_PER_SECOND);
	assert.equal(budget.check(BOT_ID_A, GROUP_A_ID, ["@shared"], checkAt), groupWait, "the minute window clears last, so it decides");
	assert.ok(groupWait > MIN_RETRY_AFTER_S, "sanity: the two waits must differ for the test to discriminate");
});

test("SendRateBudget: the group-minute window is keyed by bot as well as group", () => {
	const budget = new SendRateBudget();
	const t0 = Date.parse(NOW);
	for (let i = 0; i < GROUP_MESSAGES_PER_MINUTE; i++) {
		budget.record(BOT_ID_A, GROUP_A_ID, [], t0);
	}
	assert.notEqual(budget.check(BOT_ID_A, GROUP_A_ID, [], t0 + 1), undefined, "bot A has spent its minute");
	assert.equal(budget.check(BOT_ID_B, GROUP_A_ID, [], t0 + 1), undefined, "bot B's minute in the same group is untouched");
});

test("SendRateBudget: a window frees at exactly its width — the edge instant is outside it", () => {
	const budget = new SendRateBudget();
	const t0 = Date.parse(NOW);
	budget.record(BOT_ID_A, GROUP_A_ID, ["@edge"], t0);
	assert.notEqual(budget.check(BOT_ID_A, GROUP_B_ID, ["@edge"], t0 + RATE_WINDOW_SECOND_MS - 1), undefined);
	assert.equal(budget.check(BOT_ID_A, GROUP_B_ID, ["@edge"], t0 + RATE_WINDOW_SECOND_MS), undefined);
});

test("sendPath spends the per-chat budget of every DM target, not only the group's", async () => {
	await withLedger(async (db) => {
		const clock = controllableClock(NOW);
		const binding = buildBinding(db, { projectId: PROJECT_A, botId: BOT_ID_A, groupId: GROUP_A_ID, agentId: AGENT_A, entries: ENTRIES_A, recorderNow: clock.nowMs });
		const budget = new SendRateBudget();
		await sendPath(requestInput({ to: ALICE_A }), buildDeps(db, binding, clock, budget));

		// Asked about another group, only the DM target's own second window can refuse.
		assert.notEqual(budget.check(BOT_ID_A, GROUP_B_ID, [`@${ALICE_A_USERNAME}`], clock.nowMs()), undefined);
		assert.equal(budget.check(BOT_ID_A, GROUP_B_ID, [`@${CAROL_A_USERNAME}`], clock.nowMs()), undefined, "a chat the send never touched");
	});
});

test("a local rate refusal writes one bodyless rejected/RATE_LIMITED audit row with the send's identifiers", async () => {
	await withLedger(async (db) => {
		const clock = controllableClock(NOW);
		const binding = buildBinding(db, { projectId: PROJECT_A, botId: BOT_ID_A, groupId: GROUP_A_ID, agentId: AGENT_A, entries: ENTRIES_A, recorderNow: clock.nowMs });
		const deps = buildDeps(db, binding, clock, new SendRateBudget());
		await sendPath(requestInput({ to: ALICE_A }), deps);

		await assert.rejects(() => sendPath(requestInput({ to: ALICE_A }), deps), isRateLimited);

		const refused = auditRows(db, PROJECT_A).filter((row) => row.outcome === "rejected");
		assert.equal(refused.length, 1);
		assert.equal(refused[0]!.reason, "RATE_LIMITED");
		assert.equal(refused[0]!.direction, "send");
		assert.equal(refused[0]!.envelope_type, "REQUEST");
		assert.notEqual(refused[0]!.eid, null);
		assert.equal(refused[0]!.bot_id, BOT_ID_A);
		assert.equal(refused[0]!.to_user_id, ALICE_A_USER_ID);
	});
});

// --- RateLimitRecorder, in isolation ---

test("RateLimitRecorder: records offsets.retry_after_until, rethrows the SAME error instance, never retries, delegates every other method, and touches no other offsets column", async () => {
	await withLedger(async (db) => {
		db.prepare("INSERT INTO offsets (bot_id, next_update_id, last_error_code) VALUES (?, ?, ?)").run(BOT_ID_A, 7, "TELEGRAM_CONFLICT");

		let getUpdatesCalls = 0;
		const scriptedUpdates: TelegramUpdate[] = [];
		const scriptedUser: TelegramUser = { id: 1, is_bot: true, username: "raw_bot" };
		const scriptedChat: TelegramChat = { id: -1, type: "group" };
		const originalError = new RateLimitedError(12);

		const raw: TelegramClient = {
			async getUpdates(params?: GetUpdatesParams) {
				getUpdatesCalls++;
				assert.deepEqual(params, { offset: 5 });
				return scriptedUpdates;
			},
			async sendMessage() {
				throw originalError;
			},
			async getMe() {
				return scriptedUser;
			},
			async getChat(chatId: number | string) {
				assert.equal(chatId, -1);
				return scriptedChat;
			},
		};

		const FIXED_NOW_MS = Date.parse("2026-05-01T11:00:00.000Z");
		const recorder = new RateLimitRecorder(raw, { db, bot_id: BOT_ID_A, now: () => FIXED_NOW_MS });

		await assert.rejects(
			() => recorder.sendMessage({ chat_id: -1, text: "hi" }),
			(err: unknown) => {
				assert.strictEqual(err, originalError, "the exact same error instance must be rethrown, never a substitute");
				return true;
			},
		);

		assert.equal(readRetryAfterUntil(db, BOT_ID_A), new Date(FIXED_NOW_MS + 12_000).toISOString());
		const row = db.prepare("SELECT next_update_id, last_error_code FROM offsets WHERE bot_id = ?").get(BOT_ID_A) as {
			next_update_id: number;
			last_error_code: string;
		};
		assert.equal(row.next_update_id, 7, "recordRetryAfter must not touch the poller's cursor column");
		assert.equal(row.last_error_code, "TELEGRAM_CONFLICT", "recordRetryAfter must not touch the poller's own classification column");

		assert.deepEqual(await recorder.getUpdates({ offset: 5 }), scriptedUpdates);
		assert.equal(getUpdatesCalls, 1);
		assert.deepEqual(await recorder.getMe(), scriptedUser);
		assert.deepEqual(await recorder.getChat(-1), scriptedChat);
	});
});

test("recordRetryAfter upserts without disturbing a pre-existing row's other columns", async () => {
	await withLedger(async (db) => {
		db.prepare("INSERT INTO offsets (bot_id, next_update_id, last_error_code) VALUES (?, ?, ?)").run(BOT_ID_A, 99, "TELEGRAM_NETWORK_ERROR");

		const untilIso = "2026-05-01T12:00:00.000Z";
		recordRetryAfter(db, BOT_ID_A, untilIso);

		const row = db.prepare("SELECT next_update_id, last_error_code, retry_after_until FROM offsets WHERE bot_id = ?").get(BOT_ID_A) as {
			next_update_id: number;
			last_error_code: string;
			retry_after_until: string;
		};
		assert.equal(row.next_update_id, 99);
		assert.equal(row.last_error_code, "TELEGRAM_NETWORK_ERROR");
		assert.equal(row.retry_after_until, untilIso);

		// A second upsert on the same bot_id must only ever move retry_after_until.
		recordRetryAfter(db, BOT_ID_A, "2026-05-01T13:00:00.000Z");
		const row2 = db.prepare("SELECT next_update_id, last_error_code, retry_after_until FROM offsets WHERE bot_id = ?").get(BOT_ID_A) as {
			next_update_id: number;
			last_error_code: string;
			retry_after_until: string;
		};
		assert.equal(row2.next_update_id, 99);
		assert.equal(row2.last_error_code, "TELEGRAM_NETWORK_ERROR");
		assert.equal(row2.retry_after_until, "2026-05-01T13:00:00.000Z");

		// An EARLIER instant never overwrites a later one (JD-AB-002).
		recordRetryAfter(db, BOT_ID_A, "2026-05-01T12:30:00.000Z");
		assert.equal(readRetryAfterUntil(db, BOT_ID_A), "2026-05-01T13:00:00.000Z");
	});
});

test("recordRetryAfter on a bot with no offsets row creates one with every other column at its schema default", async () => {
	await withLedger(async (db) => {
		recordRetryAfter(db, BOT_ID_B, "2026-05-01T12:00:00.000Z");
		const row = db.prepare("SELECT next_update_id, last_error_code, last_poll_ok_at, retry_after_until FROM offsets WHERE bot_id = ?").get(BOT_ID_B) as Record<string, unknown>;
		assert.equal(row.next_update_id, 0);
		assert.equal(row.last_error_code, null);
		assert.equal(row.last_poll_ok_at, null);
		assert.equal(row.retry_after_until, "2026-05-01T12:00:00.000Z");
	});
});

// --- retryAfterSeconds: pure-function table ---

test("retryAfterSeconds: null, past, exact-now, fractional (ceil), and the MIN_RETRY_AFTER_S floor", () => {
	const base = Date.parse("2026-05-01T10:00:00.000Z");

	assert.equal(retryAfterSeconds(null, base), undefined);
	assert.equal(retryAfterSeconds(new Date(base - 1_000).toISOString(), base), undefined, "past");
	assert.equal(retryAfterSeconds(new Date(base).toISOString(), base), undefined, "exact now is not strictly future");
	assert.equal(retryAfterSeconds(new Date(base + 500).toISOString(), base), 1, "500ms away ceils to 1s");
	assert.equal(retryAfterSeconds(new Date(base + 1_500).toISOString(), base), 2, "1500ms away ceils to 2s");
	assert.equal(retryAfterSeconds(new Date(base + 1).toISOString(), base), MIN_RETRY_AFTER_S, "1ms away still floors to MIN_RETRY_AFTER_S, never 0");
	assert.equal(retryAfterSeconds(new Date(base + 30_000).toISOString(), base), 30, "an exact whole-second distance needs no rounding");
});

// --- Source scans ---

test("rate.ts contains no setTimeout/setInterval/sleep (no timers that retry — autonomy boundary)", () => {
	const src = readFileSync(join(REPO_ROOT, "src/daemon/send/rate.ts"), "utf8");
	assert.doesNotMatch(src, /setTimeout|setInterval|\bsleep\(/);
});

test("send-path.ts still contains no .sendMessage( call (PT-28 call-site confinement, unaffected by PR-28's wiring)", () => {
	const src = readFileSync(join(REPO_ROOT, "src/daemon/send/send-path.ts"), "utf8");
	assert.doesNotMatch(src, /\.sendMessage\(/);
});

// Keep RATE_WINDOW_SECOND_MS referenced so a future refactor that drops the export is caught here too,
// independent of the arithmetic assertions above that already depend on its value.
test("RATE_WINDOW_SECOND_MS matches the per-chat window this suite exercises", () => {
	assert.equal(RATE_WINDOW_SECOND_MS, 1_000);
});
