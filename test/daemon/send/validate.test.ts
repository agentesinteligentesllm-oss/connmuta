import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { writeThreadRecord } from "../../../src/ledger/threads.js";
import type { ThreadRecord } from "../../../src/shared/thread-record.js";
import { ABANDON_BASIS_VALUE, normalizeBody, type Envelope } from "../../../src/shared/envelope.js";
import { MAX_BODY_CHARS, TELEGRAM_MAX_TEXT_CHARS } from "../../../src/shared/constants.js";
import type { SecretRule } from "../../../src/shared/secrets.js";
import type { SendToolInput } from "../../../src/shared/tool-schemas.js";
import type { BindingConfig } from "../../../src/daemon/binding-config.js";
import {
	validateSend,
	guardEncodedLength,
	defaultGenerateId,
	SendToolError,
	type SendValidationDeps,
} from "../../../src/daemon/send/validate.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * `daemon/send/validate.ts` (PR-26, design §12's `send` row, D-08 SEAM, PT-02, PT-15; opens unit 8
 * `send-path`).
 *
 * A real `node:sqlite` ledger per test, seeded through `writeThreadRecord` exactly as
 * `test/daemon/serve/thread.test.ts` seeds the SERVE half — `validateSend`'s stage 2 reads through
 * `readThreadRecord`, so a directly-seeded row exercises the same lookup PR-27's real sends will.
 *
 * Every id below is a placeholder (AGENTS.md §3): synthetic agent, user and project ids. `FIXTURE_BOT_TOKEN`
 * is built from a literal-safe 7-digit prefix (outside `test/security/repo-scan.test.ts`'s 8-10 digit
 * trigger range, PT-22) concatenated with a generated run, mirroring `test/shared/secrets.test.ts`.
 */

const PROJECT_ID = "project-pr26";
const OTHER_PROJECT_ID = "project-pr26-other";

const ALICE_AGENT_ID = "@alice-agent";
const ALICE_USER_ID = 700000061;
const BOB_AGENT_ID = "@bob-agent";
const BOB_USER_ID = 700000062;
const CAROL_AGENT_ID = "@carol-agent";
const CAROL_USER_ID = 700000063;
/** Deliberately absent from {@link ROSTER} — used only for UNKNOWN_RECIPIENT cases. */
const STRANGER_AGENT_ID = "@dave-agent";

const ROSTER: BindingConfig["roster"] = {
	[ALICE_AGENT_ID]: { username: "alice", user_id: ALICE_USER_ID },
	[BOB_AGENT_ID]: { username: "bob", user_id: BOB_USER_ID },
	[CAROL_AGENT_ID]: { username: "carol", user_id: CAROL_USER_ID },
};

const NOW = "2026-04-01T12:00:00.000Z";

/** A bot-token-shaped fixture, built programmatically so the repo secret scanner never sees a literal token. */
const FIXTURE_BOT_TOKEN = `1234567:${"A".repeat(35)}`;

/** A body near the effective encoded ceiling — under `TELEGRAM_MAX_TEXT_CHARS` once encoded. */
const NEAR_CEILING_BODY_CHARS = 1900;
/** A body under the raw `MAX_BODY_CHARS` cap that nonetheless encodes past `TELEGRAM_MAX_TEXT_CHARS`. */
const OVER_ENCODED_BODY_CHARS = 2500;

function withLedger(run: (db: DatabaseSync) => Promise<void> | void): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-send-validate-"));
	const ledger = openLedger({ homeDir: home });
	return Promise.resolve(run(ledger.db)).finally(() => {
		try {
			ledger.db.close();
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
}

function sampleConfig(overrides: Partial<SendValidationDeps["config"]> = {}): SendValidationDeps["config"] {
	return {
		agent_id: BOB_AGENT_ID,
		roster: ROSTER,
		secret_markers: [],
		...overrides,
	};
}

function sampleDeps(db: DatabaseSync, overrides: Partial<SendValidationDeps> = {}): SendValidationDeps {
	return {
		db,
		project_id: PROJECT_ID,
		config: sampleConfig(),
		...overrides,
	};
}

function sampleThread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
	return {
		status: "open",
		opened_type: "REQUEST",
		opened_eid: "opening-eid",
		from: ALICE_AGENT_ID,
		to: BOB_AGENT_ID,
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
		awaiting: BOB_AGENT_ID,
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

/** A wire-shaped 12-hex id, distinct per `n` (`shared/envelope.ts`'s `THREAD_PATTERN`/`EID_PATTERN`). */
function hexId(n: number): string {
	return n.toString(16).padStart(12, "0");
}

function replyInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "REPLY", body: "a reply", to: ALICE_AGENT_ID, thread: hexId(1), ...overrides } as SendToolInput;
}
function ackInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "ACK", body: "ack body", to: ALICE_AGENT_ID, thread: hexId(1), ...overrides } as SendToolInput;
}
function resolvedInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return {
		type: "RESOLVED",
		body: "resolved body",
		to: ALICE_AGENT_ID,
		thread: hexId(1),
		basis: "work-confirmed",
		...overrides,
	} as SendToolInput;
}
function requestInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "REQUEST", body: "a request", to: ALICE_AGENT_ID, ...overrides } as SendToolInput;
}
function broadcastInput(overrides: Partial<SendToolInput> = {}): SendToolInput {
	return { type: "BROADCAST", body: "broadcast body", ...overrides } as SendToolInput;
}

function sampleEnvelope(body: string, overrides: Partial<Envelope> = {}): Envelope {
	return {
		eid: hexId(900),
		type: "REQUEST",
		from: BOB_AGENT_ID,
		to: ALICE_AGENT_ID,
		thread: hexId(901),
		ts: NOW,
		body,
		...overrides,
	};
}

function isSendToolError(code: string): (error: unknown) => boolean {
	return (error: unknown): boolean => error instanceof SendToolError && error.code === code;
}

// --- SendToolError shape (checked once) ---

test("SendToolError carries the expected name, is an instanceof Error and preserves its code", () => {
	const error = new SendToolError("VALIDATION_ERROR", "test message");
	assert.ok(error instanceof SendToolError);
	assert.ok(error instanceof Error);
	assert.equal(error.name, "SendToolError");
	assert.equal(error.code, "VALIDATION_ERROR");
});

// --- defaultGenerateId ---

test("defaultGenerateId returns a 12-character lowercase-hex id matching the wire id patterns", () => {
	const id = defaultGenerateId();
	assert.match(id, /^[0-9a-f]{12}$/);
});

// --- Spec scenario: "Secret-shaped body rejected before any network call" ---

test("Spec scenario: a bot-token-shaped body is rejected, names its rule, never echoes the token", async () => {
	await withLedger(async (db) => {
		const body = `please rotate: ${FIXTURE_BOT_TOKEN}`;
		assert.throws(
			() => validateSend(broadcastInput({ body }), sampleDeps(db)),
			(error: unknown) => {
				if (!(error instanceof SendToolError)) return false;
				assert.equal(error.name, "SendToolError");
				assert.equal(error.code, "SECRET_PATTERN_DETECTED");
				assert.ok(error.message.includes("telegram_bot_token_shape"));
				assert.ok(!error.message.includes(FIXTURE_BOT_TOKEN));
				return true;
			},
		);
	});
});

test("Spec scenario: a bot-token-shaped approval_ref on a human-approved RESOLVED is rejected the same way", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(60);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID, status: "open" });

		const input = resolvedInput({
			thread: threadId,
			to: ALICE_AGENT_ID,
			basis: "human-approved",
			approval_ref: `approved via ${FIXTURE_BOT_TOKEN}`,
		});

		assert.throws(
			() => validateSend(input, sampleDeps(db, { config: sampleConfig({ agent_id: BOB_AGENT_ID }) })),
			(error: unknown) => {
				if (!(error instanceof SendToolError)) return false;
				assert.equal(error.code, "SECRET_PATTERN_DETECTED");
				assert.ok(error.message.includes("telegram_bot_token_shape"));
				assert.ok(!error.message.includes(FIXTURE_BOT_TOKEN));
				return true;
			},
		);
	});
});

interface SecretRejectCase {
	readonly name: string;
	readonly body: string;
	readonly secret: string;
	readonly rule: SecretRule;
	readonly markers?: readonly string[];
}

const SECRET_REJECT_CASES: readonly SecretRejectCase[] = [
	{
		name: "PEM RSA private key block",
		body:
			"Here's the key you asked for:\n" +
			"-----BEGIN RSA PRIVATE KEY-----\n" +
			"MIIEowIBAAKCAQEA1c7NeverRealSecretBase64BlobHere0987654321==\n" +
			"-----END RSA PRIVATE KEY-----",
		secret: "MIIEowIBAAKCAQEA1c7NeverRealSecretBase64BlobHere0987654321==",
		rule: "pem_private_key_block",
	},
	{
		name: ".env-style assignment with SECRET in the key",
		body: "just pasting my local env:\nAPP_SECRET=s3cr3t-value-123",
		secret: "s3cr3t-value-123",
		rule: "env_style_secret_assignment",
	},
	{
		name: "operator-configured secret marker",
		body: "shared the INTERNAL-MARKER value with the team",
		secret: "INTERNAL-MARKER",
		rule: "configured_secret_marker",
		markers: ["INTERNAL-MARKER"],
	},
];

for (const testCase of SECRET_REJECT_CASES) {
	test(`stage 3 (table-driven): secret backstop rejects — ${testCase.name}`, async () => {
		await withLedger(async (db) => {
			const deps = sampleDeps(db, { config: sampleConfig({ secret_markers: [...(testCase.markers ?? [])] }) });
			assert.throws(
				() => validateSend(broadcastInput({ body: testCase.body }), deps),
				(error: unknown) => {
					if (!(error instanceof SendToolError)) return false;
					assert.equal(error.code, "SECRET_PATTERN_DETECTED");
					assert.ok(error.message.includes(testCase.rule));
					assert.ok(!error.message.includes(testCase.secret));
					return true;
				},
			);
		});
	});
}

// --- Spec scenario: "No network call" — validate.ts touches no transport/telegram value, no node:fs ---

test("validate.ts's own module: no non-type import reaches telegram/transport/send/node:fs, and it never shells out", () => {
	const src = readFileSync(join(REPO_ROOT, "src/daemon/send/validate.ts"), "utf8");
	const lines = src.split("\n");
	const importLines = lines.filter((line) => /^import\b/.test(line.trim()));
	assert.ok(importLines.length > 0, "sanity: the module must import something for this check to be non-vacuous");

	let checkedNonTypeImports = 0;
	for (const line of importLines) {
		const specifierMatch = line.match(/from\s+["']([^"']+)["']/);
		if (!specifierMatch) continue;
		const specifier = specifierMatch[1];
		const isTypeOnly = /^import\s+type\s+/.test(line.trim());
		if (isTypeOnly) continue;
		checkedNonTypeImports += 1;
		assert.doesNotMatch(
			specifier,
			/telegram|transport\/|\/send\/|node:fs/,
			`non-type import must not reach telegram/transport/send/node:fs: ${specifier}`,
		);
	}
	assert.ok(checkedNonTypeImports > 0, "sanity: at least one non-type import must exist for this check to be non-vacuous");
	assert.doesNotMatch(src, /child_process/, "the module must never shell out");
});

// --- SendErrorCode has no BRIDGE_BUSY (the ledger replaces v1's bridge lock) ---

test("SendErrorCode carries no BRIDGE_BUSY member", () => {
	const src = readFileSync(join(REPO_ROOT, "src/daemon/send/validate.ts"), "utf8");
	assert.doesNotMatch(src, /"BRIDGE_BUSY"/, "BRIDGE_BUSY must not appear as a string literal anywhere in the module");
});

// --- Spec scenario: "Encoded length guard reports headroom" ---

test("Spec scenario: a body near the effective ceiling reports small, positive headroom", () => {
	const body = "x".repeat(NEAR_CEILING_BODY_CHARS);
	const envelope = sampleEnvelope(body);
	const result = guardEncodedLength(envelope);

	assert.equal(result.wire.limit, TELEGRAM_MAX_TEXT_CHARS);
	assert.equal(result.wire.chars, result.text.length);
	assert.equal(result.wire.headroom_chars, TELEGRAM_MAX_TEXT_CHARS - result.text.length);
	assert.ok(result.wire.headroom_chars >= 0, "headroom must never be negative on a successful guard");
	assert.ok(result.wire.headroom_chars < 300, "headroom should be small for a body deliberately near the ceiling");
});

test("Spec scenario: a body under MAX_BODY_CHARS that encodes past TELEGRAM_MAX_TEXT_CHARS is BODY_TOO_LONG (the 'late wall' turned local)", () => {
	const body = "x".repeat(OVER_ENCODED_BODY_CHARS);
	assert.ok(body.length < MAX_BODY_CHARS, "sanity: the fixture body must stay under the raw cap");
	const envelope = sampleEnvelope(body);

	assert.throws(() => guardEncodedLength(envelope), isSendToolError("BODY_TOO_LONG"));
});

test("validateSend accepts the same over-encoded body the guard rejects — the raw cap and the encoded guard are different stages", async () => {
	await withLedger(async (db) => {
		const body = "x".repeat(OVER_ENCODED_BODY_CHARS);
		const result = validateSend(requestInput({ to: ALICE_AGENT_ID, body }), sampleDeps(db));
		assert.equal(result.input.body, body);
	});
});

// --- Stage 1: schema validation and normalization ---

test("stage 1: a raw body over MAX_BODY_CHARS is BODY_TOO_LONG, not the generic VALIDATION_ERROR", async () => {
	await withLedger(async (db) => {
		const body = "x".repeat(MAX_BODY_CHARS + 1);
		assert.throws(() => validateSend(broadcastInput({ body }), sampleDeps(db)), isSendToolError("BODY_TOO_LONG"));
	});
});

test("stage 1: a raw body of exactly MAX_BODY_CHARS is accepted — the cap is inclusive", async () => {
	await withLedger(async (db) => {
		const body = "x".repeat(MAX_BODY_CHARS);
		const result = validateSend(broadcastInput({ body }), sampleDeps(db));
		assert.equal(result.input.body.length, MAX_BODY_CHARS);
	});
});

test("stage 1: schema failure (REQUEST without `to`) is VALIDATION_ERROR", async () => {
	await withLedger(async (db) => {
		const input = { type: "REQUEST", body: "clean body" } as SendToolInput;
		assert.throws(() => validateSend(input, sampleDeps(db)), isSendToolError("VALIDATION_ERROR"));
	});
});

test("stage 1: a body of only control/whitespace characters passes schema min(1) but fails after normalization", async () => {
	await withLedger(async (db) => {
		const raw = "\u0000\t\n ";
		assert.ok(raw.length >= 1, "sanity: the raw body must satisfy the schema's own min(1)");
		assert.throws(() => validateSend(broadcastInput({ body: raw }), sampleDeps(db)), isSendToolError("VALIDATION_ERROR"));
	});
});

test("stage 1: validateSend returns the normalized body (collapsed whitespace, typographic quotes)", async () => {
	await withLedger(async (db) => {
		const raw = '  hello   "world"  ';
		const result = validateSend(broadcastInput({ body: raw }), sampleDeps(db));
		assert.equal(result.input.body, normalizeBody(raw));
		assert.ok(result.input.body.includes("“world”"));
	});
});

// --- PT-02: validateSend never reads or accepts a destination ---

test("PT-02: validateSend strips caller-supplied destination/identity keys the schema does not declare", async () => {
	await withLedger(async (db) => {
		const tampered = {
			type: "REQUEST",
			body: "clean body",
			to: ALICE_AGENT_ID,
			from: CAROL_AGENT_ID,
			chat_id: -1009999999999,
			to_user_id: 123456,
			bot: "evil-bot",
			group: "evil-group",
			to_chat: "evil-chat",
		} as unknown as SendToolInput;

		const result = validateSend(tampered, sampleDeps(db));
		const keys = Object.keys(result.input);
		for (const forbidden of ["from", "chat_id", "to_user_id", "bot", "group", "to_chat"]) {
			assert.ok(!keys.includes(forbidden), `${forbidden} must not survive schema validation`);
		}
	});
});

// --- Stage order ---

test("stage order: schema validation runs before loop prevention", async () => {
	await withLedger(async (db) => {
		const input = { type: "REPLY", body: "hi", thread: hexId(50) } as SendToolInput; // missing `to`
		assert.throws(() => validateSend(input, sampleDeps(db)), isSendToolError("VALIDATION_ERROR"));
	});
});

test("stage order: loop prevention runs before the secret backstop", async () => {
	await withLedger(async (db) => {
		const input = ackInput({ thread: hexId(51), to: ALICE_AGENT_ID, body: `token ${FIXTURE_BOT_TOKEN}` });
		assert.throws(() => validateSend(input, sampleDeps(db)), isSendToolError("UNKNOWN_THREAD"));
	});
});

test("stage order: the secret backstop runs before the roster check", async () => {
	await withLedger(async (db) => {
		const input = requestInput({ to: STRANGER_AGENT_ID, body: `leak ${FIXTURE_BOT_TOKEN}` });
		assert.throws(() => validateSend(input, sampleDeps(db)), isSendToolError("SECRET_PATTERN_DETECTED"));
	});
});

// --- Stage 2: loop prevention, one test per v1 branch ---

test("stage 2: UNKNOWN_THREAD for a thread id this ledger has never seen", async () => {
	await withLedger(async (db) => {
		const input = replyInput({ thread: hexId(100), to: ALICE_AGENT_ID });
		assert.throws(() => validateSend(input, sampleDeps(db)), isSendToolError("UNKNOWN_THREAD"));
	});
});

test("stage 2: UNKNOWN_THREAD for a thread that exists only under another project (invariant 1)", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(101);
		writeThread(db, OTHER_PROJECT_ID, threadId);
		const input = replyInput({ thread: threadId, to: ALICE_AGENT_ID });
		assert.throws(() => validateSend(input, sampleDeps(db)), isSendToolError("UNKNOWN_THREAD"));
	});
});

test("stage 2: NOT_REQUESTABLE for a thread opened by BROADCAST", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(102);
		writeThread(db, PROJECT_ID, threadId, { opened_type: "BROADCAST", to: null, to_user_id: null });
		const input = ackInput({ thread: threadId, to: ALICE_AGENT_ID });
		assert.throws(() => validateSend(input, sampleDeps(db)), isSendToolError("NOT_REQUESTABLE"));
	});
});

test("stage 2: REPLY by a non-participant is NOT_PARTICIPANT", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(103);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID });
		const input = replyInput({ thread: threadId, to: ALICE_AGENT_ID });
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: CAROL_AGENT_ID }) });
		assert.throws(() => validateSend(input, deps), isSendToolError("NOT_PARTICIPANT"));
	});
});

test("stage 2: REPLY to the wrong party is NOT_ADDRESSEE", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(104);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID });
		const input = replyInput({ thread: threadId, to: CAROL_AGENT_ID }); // should be ALICE (the other party)
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: BOB_AGENT_ID }) });
		assert.throws(() => validateSend(input, deps), isSendToolError("NOT_ADDRESSEE"));
	});
});

test("stage 2: a REPLY from the originator to the addressee succeeds and returns the thread as existingThread", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(105);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID, opened_eid: "open-105" });
		const input = replyInput({ thread: threadId, to: BOB_AGENT_ID });
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: ALICE_AGENT_ID }) });

		const result = validateSend(input, deps);
		assert.ok(result.existingThread !== undefined);
		assert.equal(result.existingThread?.opened_eid, "open-105");
		assert.equal(result.existingThread?.from, ALICE_AGENT_ID);
	});
});

test("stage 2: a REPLY from the addressee back to the originator succeeds — either participant may continue", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(112);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID, opened_eid: "open-112" });
		const input = replyInput({ thread: threadId, to: ALICE_AGENT_ID });
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: BOB_AGENT_ID }) });

		const result = validateSend(input, deps);
		assert.equal(result.existingThread?.opened_eid, "open-112");
		assert.deepEqual(result.recipients, [ALICE_AGENT_ID]);
	});
});

test("stage 2: a REPLY on an already-resolved thread is ALREADY_RESOLVED", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(106);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID, status: "resolved" });
		const input = replyInput({ thread: threadId, to: BOB_AGENT_ID });
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: ALICE_AGENT_ID }) });
		assert.throws(() => validateSend(input, deps), isSendToolError("ALREADY_RESOLVED"));
	});
});

test("stage 2: an ACK by a non-addressee is NOT_ADDRESSEE", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(107);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID });
		const input = ackInput({ thread: threadId, to: BOB_AGENT_ID });
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: ALICE_AGENT_ID }) }); // originator, not addressee
		assert.throws(() => validateSend(input, deps), isSendToolError("NOT_ADDRESSEE"));
	});
});

test("stage 2: RESOLVED abandoned by a non-originator is NOT_ORIGINATOR", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(108);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID });
		const input = resolvedInput({ thread: threadId, to: ALICE_AGENT_ID, basis: ABANDON_BASIS_VALUE });
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: BOB_AGENT_ID }) }); // addressee, not originator
		assert.throws(() => validateSend(input, deps), isSendToolError("NOT_ORIGINATOR"));
	});
});

test("stage 2: RESOLVED abandoned by the originator to a different `to` is NOT_ADDRESSEE", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(109);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID });
		const input = resolvedInput({ thread: threadId, to: CAROL_AGENT_ID, basis: ABANDON_BASIS_VALUE }); // should be BOB
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: ALICE_AGENT_ID }) });
		assert.throws(() => validateSend(input, deps), isSendToolError("NOT_ADDRESSEE"));
	});
});

test("stage 2: RESOLVED abandoned by the originator, correctly addressed, succeeds", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(110);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID });
		const input = resolvedInput({ thread: threadId, to: BOB_AGENT_ID, basis: ABANDON_BASIS_VALUE });
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: ALICE_AGENT_ID }) });

		const result = validateSend(input, deps);
		assert.ok(result.existingThread !== undefined);
	});
});

test("stage 2: RESOLVED on an already-resolved thread is ALREADY_RESOLVED", async () => {
	await withLedger(async (db) => {
		const threadId = hexId(111);
		writeThread(db, PROJECT_ID, threadId, { from: ALICE_AGENT_ID, to: BOB_AGENT_ID, to_user_id: BOB_USER_ID, status: "resolved" });
		const input = resolvedInput({ thread: threadId, to: ALICE_AGENT_ID, basis: "work-confirmed" });
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: BOB_AGENT_ID }) }); // addressee
		assert.throws(() => validateSend(input, deps), isSendToolError("ALREADY_RESOLVED"));
	});
});

test("stage 2: BROADCAST and REQUEST never reference an existing thread — existingThread is undefined and no lookup is needed", async () => {
	await withLedger(async (db) => {
		const broadcastResult = validateSend(broadcastInput(), sampleDeps(db));
		assert.equal(broadcastResult.existingThread, undefined);

		const requestResult = validateSend(requestInput({ to: ALICE_AGENT_ID }), sampleDeps(db));
		assert.equal(requestResult.existingThread, undefined);
	});
});

// --- Stage 4: recipient/roster resolution ---

test("stage 4: REQUEST to an agent not in the roster is UNKNOWN_RECIPIENT", async () => {
	await withLedger(async (db) => {
		const input = requestInput({ to: STRANGER_AGENT_ID, body: "clean body" });
		assert.throws(() => validateSend(input, sampleDeps(db)), isSendToolError("UNKNOWN_RECIPIENT"));
	});
});

test("stage 4: BROADCAST resolves to every roster entry except the caller's own agent", async () => {
	await withLedger(async (db) => {
		const deps = sampleDeps(db, { config: sampleConfig({ agent_id: BOB_AGENT_ID }) });
		const result = validateSend(broadcastInput(), deps);
		assert.deepEqual([...result.recipients].sort(), [ALICE_AGENT_ID, CAROL_AGENT_ID].sort());
	});
});

test("stage 4: REQUEST resolves to exactly the single `to`", async () => {
	await withLedger(async (db) => {
		const result = validateSend(requestInput({ to: ALICE_AGENT_ID }), sampleDeps(db));
		assert.deepEqual(result.recipients, [ALICE_AGENT_ID]);
	});
});
