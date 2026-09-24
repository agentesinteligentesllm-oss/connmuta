import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { RUN_SECRET_BYTES } from "../../../src/shared/constants.js";
import {
	HTTP_BAD_REQUEST,
	HTTP_CONFLICT,
	HTTP_INTERNAL_SERVER_ERROR,
	HTTP_NOT_FOUND,
	HTTP_OK,
	HTTP_TOO_MANY_REQUESTS,
	HTTP_UNAUTHORIZED,
	IPC_BAD_REQUEST,
	IPC_LOOPBACK_HOST,
	ipcErrorSchema,
	sessionCloseResponseSchema,
	sessionResponseSchema,
} from "../../../src/shared/ipc-contract.js";
import { createIpcServer } from "../../../src/daemon/ipc/server.js";
import { PendingHandshakeStore } from "../../../src/daemon/ipc/handshake.js";
import { SessionStore } from "../../../src/daemon/ipc/sessions.js";
import {
	BINDING_CHANGED,
	BINDING_MISMATCH,
	HANDSHAKE_NONCE_INVALID,
	ROSTER_DRIFT_CONDITION,
	SESSION_MINT_REFUSED,
	UNBOUND_PROJECT,
	createSessionRoutes,
	toTelegramErrorPayload,
	toolErrorHttpStatus,
	type RoutesDeps,
} from "../../../src/daemon/ipc/routes.js";
import { openLedger } from "../../../src/ledger/open.js";
import { BindingsReconciler } from "../../../src/daemon/bindings.js";
import { createRegistryLoader } from "../../../src/registry/loader.js";
import { RateLimitedError } from "../../../src/daemon/telegram.js";
import { RoomGuardClient } from "../../../src/daemon/transport/room-guard.js";
import { GroupTransport } from "../../../src/daemon/transport/group.js";
import { DirectTransport } from "../../../src/daemon/transport/direct.js";
import { DualWriteTransport } from "../../../src/daemon/transport/dual.js";
import { SendToolError } from "../../../src/daemon/send/validate.js";
import { ThreadToolError } from "../../../src/daemon/serve/thread.js";
import { FakeTelegramClient } from "../../fakes/telegram.js";
import { activeBinding, rosterSnapshotEntry, validRegistryDocument } from "../../registry/fixtures.js";
import type { ProjectRosterEntry } from "../../../src/shared/project-file.js";

/**
 * `daemon/ipc/routes.ts` (PR-31, design §10 "IPC", spec `ipc-handshake` "Session binds one project and
 * freezes for its lifetime", "Roster hash detects drift without auto-resolving it" (D-07), "Client error
 * taxonomy for handshake and session failures"). New code — no v1 range — so this twin needs no
 * `test/fixtures/v1-provenance.json` entry.
 *
 * Runtime harness: an in-process daemon (`createIpcServer` + `createSessionRoutes`) wired to a REAL
 * `node:sqlite` ledger (`openLedger`) and a REAL registry temp file read through `createRegistryLoader`
 * and `BindingsReconciler` (PR-09's own harness convention, reused via `test/registry/fixtures.ts`'s
 * builders). `BindingsReconciler`'s injected `createTransport` builds one `FakeTelegramClient` per
 * project wrapped in the real `RoomGuardClient`/`GroupTransport`/`DirectTransport`/`DualWriteTransport`
 * stack — the exact composition `daemon/bindings.ts`'s own `buildTransport` builds in production
 * (`test/daemon/send/send-path.test.ts`'s own precedent) — so a send smoke test reaches a real transport
 * stack over a fake network boundary only.
 *
 * The fixture project's roster carries TWO members (the binding's own agent `@alice-agent` plus a peer
 * `@bob-agent`), unlike `test/registry/fixtures.ts`'s own single-member default: a REQUEST/thread smoke
 * test needs a valid `to` other than the sender itself. `ROSTER_HASH` is therefore derived locally from
 * `activeBinding`'s own auto-derivation rather than reusing the fixture's `VALID_ROSTER_HASH` constant,
 * which is pinned to the single-member snapshot.
 *
 * Every session-opening request also carries `server_nonce`, now a proper field of
 * `shared/ipc-contract.ts`'s `sessionRequestSchema` (see `routes.ts`'s own module doc: the schema was
 * missing it until this PR).
 */

// ---------------------------------------------------------------------------
// Independent oracle — mirrors handshake.test.ts / sessions.test.ts's own pattern
// ---------------------------------------------------------------------------

function expectedSessionProof(secret: string, serverNonce: string): string {
	return createHmac("sha256", secret).update(`session:${serverNonce}`).digest("hex");
}

function freshSecret(): string {
	return randomBytes(RUN_SECRET_BYTES).toString("hex");
}

// ---------------------------------------------------------------------------
// Raw HTTP client (duplicated per test file, per this project's own convention)
// ---------------------------------------------------------------------------

interface RawResponse {
	status: number;
	bodyText: string;
}

function sendRequest(options: { port: number; method: string; path: string; body?: string; authorization?: string }): Promise<RawResponse> {
	return new Promise((resolve, reject) => {
		const bodyBuffer = options.body === undefined ? undefined : Buffer.from(options.body, "utf8");
		const headers: http.OutgoingHttpHeaders = { Host: `${IPC_LOOPBACK_HOST}:${options.port}` };
		if (bodyBuffer !== undefined) {
			headers["Content-Type"] = "application/json";
			headers["Content-Length"] = String(bodyBuffer.length);
		}
		if (options.authorization !== undefined) {
			headers["Authorization"] = options.authorization;
		}
		let responded = false;
		const req = http.request({ host: IPC_LOOPBACK_HOST, port: options.port, method: options.method, path: options.path, headers }, (res) => {
			responded = true;
			const chunks: Buffer[] = [];
			res.on("data", (chunk: Buffer) => chunks.push(chunk));
			res.on("end", () => resolve({ status: res.statusCode ?? 0, bodyText: Buffer.concat(chunks).toString("utf8") }));
		});
		req.on("error", (err) => {
			if (!responded) reject(err);
		});
		req.end(bodyBuffer);
	});
}

// ---------------------------------------------------------------------------
// Fixture registry: one project, two-member roster (see module doc)
// ---------------------------------------------------------------------------

const PROJECT_ID = "prj-example";
const GROUP_ID = -1001234567890;

const TWO_MEMBER_ROSTER: readonly ProjectRosterEntry[] = [
	{ agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" },
	{ agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" },
];

/** `activeBinding`'s own auto-derivation over {@link TWO_MEMBER_ROSTER} — see module doc. */
const ROSTER_HASH = activeBinding({ roster_snapshot: [...TWO_MEMBER_ROSTER] }).roster_hash as string;

function baseRegistryDocument(bindingOverrides: Record<string, unknown> = {}): ReturnType<typeof validRegistryDocument> {
	const doc = validRegistryDocument();
	doc.bindings[0] = activeBinding({
		roster_snapshot: [...TWO_MEMBER_ROSTER],
		...bindingOverrides,
	});
	return doc;
}

// ---------------------------------------------------------------------------
// Harness: real ledger + real registry temp file + BindingsReconciler + createSessionRoutes
// ---------------------------------------------------------------------------

interface Harness {
	readonly port: number;
	readonly db: DatabaseSync;
	readonly secret: string;
	readonly handshakeStore: PendingHandshakeStore;
	readonly sessionStore: SessionStore;
	readonly telegramClients: Map<string, FakeTelegramClient>;
	reload(document: unknown): Promise<void>;
}

async function withHarness(run: (h: Harness) => Promise<void>): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-routes-"));
	const registryPath = join(home, "registry.json");
	const ledger = openLedger({ homeDir: home });
	const telegramClients = new Map<string, FakeTelegramClient>();
	let fingerprintTime = new Date("2026-01-01T00:00:00Z").getTime();

	const writeRegistry = (document: unknown): void => {
		writeFileSync(registryPath, JSON.stringify(document));
		const at = new Date(fingerprintTime);
		utimesSync(registryPath, at, at);
		fingerprintTime += 1000; // strictly later mtime on the NEXT write (D-12 fingerprint)
	};

	writeRegistry(baseRegistryDocument());
	const loader = createRegistryLoader({ path: registryPath });

	const reconciler = new BindingsReconciler({
		db: ledger.db,
		loader,
		createTransport: (binding) => {
			const telegram = new FakeTelegramClient();
			telegramClients.set(binding.project_id, telegram);
			const roomGuard = new RoomGuardClient(telegram, { groupId: binding.group_id, roster: binding.roster_snapshot });
			const group = new GroupTransport(roomGuard, binding.group_id);
			const directRoster: Record<string, ProjectRosterEntry> = {};
			for (const entry of binding.roster_snapshot) directRoster[entry.agent_id] = entry;
			const direct = new DirectTransport(roomGuard, directRoster);
			const transport = new DualWriteTransport(group, direct);
			return { transport, roomGuard };
		},
	});
	await reconciler.reconcile();

	const secret = freshSecret();
	const handshakeStore = new PendingHandshakeStore();
	const sessionStore = new SessionStore(secret);

	const deps: RoutesDeps = {
		db: ledger.db,
		bindings: reconciler,
		handshakeStore,
		sessionStore,
		daemon: { pid: 424242, started_at: "2026-01-01T00:00:00.000Z", secret_store_kind: "keychain" },
	};

	const server = createIpcServer({ handlers: createSessionRoutes(deps) });
	const { port } = await server.listen();

	const harness: Harness = {
		port,
		db: ledger.db,
		secret,
		handshakeStore,
		sessionStore,
		telegramClients,
		async reload(document: unknown): Promise<void> {
			writeRegistry(document);
			await reconciler.reconcile();
		},
	};

	try {
		await run(harness);
	} finally {
		await server.close();
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

function auditRows(db: DatabaseSync, projectId: string): Record<string, unknown>[] {
	return db.prepare("SELECT * FROM audit_log WHERE project_id = ? ORDER BY id").all(projectId) as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// POST /session body construction
// ---------------------------------------------------------------------------

/**
 * A complete, valid `POST /session` body, with a FRESH nonce issued from `h.handshakeStore` unless
 * `overrides.server_nonce` names one already (letting a test control nonce state directly — an
 * already-consumed value, for instance). `hmac` defaults to the correct proof for whichever
 * `server_nonce` this call ends up using, so overriding only `group_id`/`roster_hash`/etc. in isolation
 * still produces an otherwise-valid request.
 */
function validSessionRequestBody(h: Harness, overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const serverNonce = (overrides.server_nonce as string | undefined) ?? h.handshakeStore.issue();
	assert.ok(serverNonce, "setup: PendingHandshakeStore.issue() must hand out a nonce");
	return {
		project_id: PROJECT_ID,
		group_id: GROUP_ID,
		roster_hash: ROSTER_HASH,
		host: "claude-code",
		pid: 555,
		hmac: expectedSessionProof(h.secret, serverNonce),
		server_nonce: serverNonce,
		...overrides,
	};
}

async function postSession(h: Harness, body: Record<string, unknown>): Promise<{ status: number; parsed: unknown }> {
	const res = await sendRequest({ port: h.port, method: "POST", path: "/session", body: JSON.stringify(body) });
	return { status: res.status, parsed: JSON.parse(res.bodyText) };
}

async function openValidSession(h: Harness, overrides: Record<string, unknown> = {}): Promise<{ bearer: string; response: ReturnType<typeof sessionResponseSchema.parse> }> {
	const { status, parsed } = await postSession(h, validSessionRequestBody(h, overrides));
	assert.equal(status, HTTP_OK, `setup: opening a session must succeed, got ${JSON.stringify(parsed)}`);
	const response = sessionResponseSchema.parse(parsed);
	return { bearer: response.bearer, response };
}

// ---------------------------------------------------------------------------
// 1. Unbound project refused at session start
// ---------------------------------------------------------------------------

test("unbound project refused at session start: UNBOUND_PROJECT, 404, no session minted", async () => {
	await withHarness(async (h) => {
		const { status, parsed } = await postSession(h, validSessionRequestBody(h, { project_id: "prj-never-bound" }));
		assert.equal(status, HTTP_NOT_FOUND);
		assert.equal(ipcErrorSchema.parse(parsed).code, UNBOUND_PROJECT);
		assert.equal(h.sessionStore.size, 0, "no bearer may be minted for an unbound project");
	});
});

// ---------------------------------------------------------------------------
// 2. Freeze uses a narrow 3-field comparison
// ---------------------------------------------------------------------------

test("freeze compares only (bot_id, group_id, agent_id): a roster_snapshot-only change does not trip BINDING_CHANGED", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);

		const doc = baseRegistryDocument({
			roster_snapshot: [
				...TWO_MEMBER_ROSTER,
				rosterSnapshotEntry({ agent_id: "@carol-agent", user_id: 100000003, username: "carol_example_bot" }),
			],
		});
		await h.reload(doc);

		const res = await sendRequest({ port: h.port, method: "POST", path: "/tools/status", body: "{}", authorization: `Bearer ${bearer}` });
		assert.equal(res.status, HTTP_OK, `a roster-only change must not trip the freeze: ${res.bodyText}`);
	});
});

// ---------------------------------------------------------------------------
// 3. Live binding drift is refused per call
// ---------------------------------------------------------------------------

test("live binding drift is refused per call: BINDING_CHANGED, 409, one audit row, nothing dispatched", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);

		await h.reload(baseRegistryDocument({ group_id: -1009999999 }));
		const telegram = h.telegramClients.get(PROJECT_ID);
		assert.ok(telegram, "setup: the reload must have rebuilt this project's transport");

		const before = auditRows(h.db, PROJECT_ID).length;
		const res = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/send",
			body: JSON.stringify({ type: "BROADCAST", body: "should never be sent" }),
			authorization: `Bearer ${bearer}`,
		});
		assert.equal(res.status, HTTP_CONFLICT);
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, BINDING_CHANGED);
		assert.equal(telegram.sentMessages.length, 0, "nothing may reach the underlying transport on a BINDING_CHANGED refusal");

		const rows = auditRows(h.db, PROJECT_ID);
		assert.equal(rows.length, before + 1, "exactly one audit row must be written");
		assert.equal(rows[rows.length - 1]?.reason, "BINDING_CHANGED");
		assert.equal(rows[rows.length - 1]?.outcome, "ok");
		assert.equal(rows[rows.length - 1]?.direction, "system");
	});
});

// ---------------------------------------------------------------------------
// 4. Roster hash mismatch raises a condition, not a failure
// ---------------------------------------------------------------------------

test("roster hash mismatch raises a condition, not a failure: session is minted, conditions includes roster_drift", async () => {
	await withHarness(async (h) => {
		const body = validSessionRequestBody(h, { roster_hash: `sha256:${"0".repeat(64)}` });
		const { status, parsed } = await postSession(h, body);
		assert.equal(status, HTTP_OK, `a roster_hash mismatch must still mint a session: ${JSON.stringify(parsed)}`);
		const response = sessionResponseSchema.parse(parsed);
		assert.ok(response.conditions.includes(ROSTER_DRIFT_CONDITION));
	});
});

// ---------------------------------------------------------------------------
// 5. Session refused when the project file's group disagrees with the binding (R4)
// ---------------------------------------------------------------------------

test("session refused when the project file's group disagrees with the binding (R4): BINDING_MISMATCH, 409, no session minted, no audit row", async () => {
	await withHarness(async (h) => {
		const before = auditRows(h.db, PROJECT_ID).length;
		const body = validSessionRequestBody(h, { group_id: -1009999999 });
		const { status, parsed } = await postSession(h, body);
		assert.equal(status, HTTP_CONFLICT);
		assert.equal(ipcErrorSchema.parse(parsed).code, BINDING_MISMATCH);
		assert.equal(h.sessionStore.size, 0, "no bearer may be minted on an R4 refusal");
		assert.equal(auditRows(h.db, PROJECT_ID).length, before, "R4 is a session-start refusal, not a live drift — no audit row");
	});
});

// ---------------------------------------------------------------------------
// 6. Nonce sequencing
// ---------------------------------------------------------------------------

test("nonce sequencing: an already-consumed nonce -> HANDSHAKE_NONCE_INVALID, 401, no session minted; consume runs before mint", async () => {
	await withHarness(async (h) => {
		const serverNonce = h.handshakeStore.issue();
		assert.ok(serverNonce);
		assert.equal(h.handshakeStore.consume(serverNonce), true, "setup: pre-consume this nonce so the route's own consume must fail");

		const body = validSessionRequestBody(h, { server_nonce: serverNonce, hmac: expectedSessionProof(h.secret, serverNonce) });
		const { status, parsed } = await postSession(h, body);
		assert.equal(status, HTTP_UNAUTHORIZED);
		assert.equal(ipcErrorSchema.parse(parsed).code, HANDSHAKE_NONCE_INVALID);
		assert.equal(h.sessionStore.size, 0, "mint must never be reached when consume fails");
	});
});

// ---------------------------------------------------------------------------
// 7. Mint refusal after a valid nonce
// ---------------------------------------------------------------------------

test("mint refusal after a valid nonce: wrong hmac -> SESSION_MINT_REFUSED, 401, no session minted, but the nonce WAS consumed", async () => {
	await withHarness(async (h) => {
		const body = validSessionRequestBody(h, { hmac: "f".repeat(64) });
		const { status, parsed } = await postSession(h, body);
		assert.equal(status, HTTP_UNAUTHORIZED);
		assert.equal(ipcErrorSchema.parse(parsed).code, SESSION_MINT_REFUSED);
		assert.equal(h.sessionStore.size, 0);

		// Proof the nonce was consumed despite the mint refusal (decision 6's "consume before mint"): a
		// SECOND attempt with the SAME server_nonce (this time with the correct hmac) must find it
		// already gone.
		const usedNonce = body.server_nonce as string;
		const second = await postSession(
			h,
			validSessionRequestBody(h, { server_nonce: usedNonce, hmac: expectedSessionProof(h.secret, usedNonce) }),
		);
		assert.equal(second.status, HTTP_UNAUTHORIZED);
		assert.equal(ipcErrorSchema.parse(second.parsed).code, HANDSHAKE_NONCE_INVALID, "the first call's nonce must already be consumed");
	});
});

// ---------------------------------------------------------------------------
// 8. 401 gate on /tools/* and DELETE /session
// ---------------------------------------------------------------------------

test("401 gate: missing, unknown, or garbage bearer is refused on /tools/* and DELETE /session, no audit row, nothing dispatched", async () => {
	await withHarness(async (h) => {
		const before = auditRows(h.db, PROJECT_ID).length;

		const missing = await sendRequest({ port: h.port, method: "POST", path: "/tools/status", body: "{}" });
		assert.equal(missing.status, HTTP_UNAUTHORIZED);

		const garbage = await sendRequest({ port: h.port, method: "POST", path: "/tools/status", body: "{}", authorization: "Bearer not-a-real-bearer" });
		assert.equal(garbage.status, HTTP_UNAUTHORIZED);

		const malformedHeader = await sendRequest({ port: h.port, method: "POST", path: "/tools/status", body: "{}", authorization: "not-bearer-scheme" });
		assert.equal(malformedHeader.status, HTTP_UNAUTHORIZED);

		const del = await sendRequest({ port: h.port, method: "DELETE", path: "/session", authorization: "Bearer not-a-real-bearer" });
		assert.equal(del.status, HTTP_UNAUTHORIZED);

		assert.equal(auditRows(h.db, PROJECT_ID).length, before, "an unauthenticated call must write no audit row");
	});
});

// ---------------------------------------------------------------------------
// 9. DELETE /session actually revokes
// ---------------------------------------------------------------------------

test("DELETE /session actually revokes: the same bearer is rejected (401) on a subsequent /tools/* call", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);

		const del = await sendRequest({ port: h.port, method: "DELETE", path: "/session", authorization: `Bearer ${bearer}` });
		assert.equal(del.status, HTTP_OK);
		assert.deepEqual(sessionCloseResponseSchema.parse(JSON.parse(del.bodyText)), { closed: true });
		assert.equal(h.sessionStore.validate(bearer), false, "revoke must have actually invalidated the bearer");

		const after = await sendRequest({ port: h.port, method: "POST", path: "/tools/status", body: "{}", authorization: `Bearer ${bearer}` });
		assert.equal(after.status, HTTP_UNAUTHORIZED);
	});
});

// ---------------------------------------------------------------------------
// 10. DELETE /session itself requires a currently-valid bearer
// ---------------------------------------------------------------------------

test("DELETE /session itself requires a currently-valid bearer", async () => {
	await withHarness(async (h) => {
		const missing = await sendRequest({ port: h.port, method: "DELETE", path: "/session" });
		assert.equal(missing.status, HTTP_UNAUTHORIZED);

		const garbage = await sendRequest({ port: h.port, method: "DELETE", path: "/session", authorization: "Bearer garbage" });
		assert.equal(garbage.status, HTTP_UNAUTHORIZED);
	});
});

// ---------------------------------------------------------------------------
// 11. Each /tools/* route reaches its real underlying function (smoke tests)
// ---------------------------------------------------------------------------

test("POST /tools/send reaches sendPath: a valid send is delivered through the real transport stack", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		const telegram = h.telegramClients.get(PROJECT_ID)!;

		const res = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/send",
			body: JSON.stringify({ type: "BROADCAST", body: "smoke test broadcast" }),
			authorization: `Bearer ${bearer}`,
		});
		assert.equal(res.status, HTTP_OK, res.bodyText);
		const parsed = JSON.parse(res.bodyText) as { ok: boolean };
		assert.equal(parsed.ok, true);
		// A BROADCAST fans out to the group post AND a DM to every other roster member (@bob-agent, the
		// only one besides the binding's own @alice-agent) — two real sendMessage() calls, not one.
		assert.equal(telegram.sentMessages.length, 2, "sendPath must have reached the real transport stack for both the group post and the DM");
	});
});

test("POST /tools/fetch reaches serveFetch: a fresh session's fetch returns a real cursor and an empty log", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		const res = await sendRequest({ port: h.port, method: "POST", path: "/tools/fetch", body: "{}", authorization: `Bearer ${bearer}` });
		assert.equal(res.status, HTTP_OK, res.bodyText);
		const parsed = JSON.parse(res.bodyText) as { cursor: unknown; log: unknown[] };
		assert.deepEqual(parsed.cursor, { previous_update_id: 0, next_update_id: 0, advanced: false });
		assert.deepEqual(parsed.log, []);
	});
});

test("POST /tools/status reaches serveStatus: reports this session's real binding identity", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		const res = await sendRequest({ port: h.port, method: "POST", path: "/tools/status", body: "{}", authorization: `Bearer ${bearer}` });
		assert.equal(res.status, HTTP_OK, res.bodyText);
		const parsed = JSON.parse(res.bodyText) as { agent_id: string; chat_id: number; binding: { project_id: string } };
		assert.equal(parsed.agent_id, "@alice-agent");
		assert.equal(parsed.chat_id, GROUP_ID);
		assert.equal(parsed.binding.project_id, PROJECT_ID);
	});
});

test("POST /tools/thread reaches serveThread: a thread opened via a real send is readable back", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		const sendRes = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/send",
			body: JSON.stringify({ type: "REQUEST", to: "@bob-agent", body: "please review" }),
			authorization: `Bearer ${bearer}`,
		});
		assert.equal(sendRes.status, HTTP_OK, sendRes.bodyText);
		const threadId = (JSON.parse(sendRes.bodyText) as { thread: string }).thread;

		const res = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/thread",
			body: JSON.stringify({ thread_id: threadId }),
			authorization: `Bearer ${bearer}`,
		});
		assert.equal(res.status, HTTP_OK, res.bodyText);
		const parsed = JSON.parse(res.bodyText) as { thread: string; messages: { body: string }[] };
		assert.equal(parsed.thread, threadId);
		assert.equal(parsed.messages[0]?.body, "please review");
	});
});

// ---------------------------------------------------------------------------
// 12. Route-level request schema validation
// ---------------------------------------------------------------------------

test("route-level schema validation refuses a malformed /tools/* body with IPC_BAD_REQUEST before reaching the underlying tool", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		const telegram = h.telegramClients.get(PROJECT_ID)!;

		const res = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/send",
			body: JSON.stringify({ type: "NOT_A_REAL_ENVELOPE_TYPE" }),
			authorization: `Bearer ${bearer}`,
		});
		assert.equal(res.status, HTTP_BAD_REQUEST);
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, IPC_BAD_REQUEST);
		assert.equal(telegram.sentMessages.length, 0, "a schema-invalid body must never reach sendPath");
	});
});

// ---------------------------------------------------------------------------
// 13. toTelegramErrorPayload composition
// ---------------------------------------------------------------------------

test("toTelegramErrorPayload: a Telegram-classifiable cause is composed with the top-level error's own message", () => {
	const cause = new RateLimitedError(42);
	const err = new SendToolError("TRANSPORT_ERROR", "send failed", { cause });
	const payload = toTelegramErrorPayload(err, "TRANSPORT_ERROR");
	assert.equal(payload.code, "TELEGRAM_RATE_LIMITED");
	assert.equal(payload.retryable, true);
	assert.equal(payload.retry_after_s, 42);
	assert.equal(payload.message, "send failed", "the TOP-level error's own message must be used, not the cause's");
});

test("toTelegramErrorPayload: no Telegram-classifiable cause falls back to the generic tool error code", () => {
	const err = new ThreadToolError("UNKNOWN_THREAD", "thread not known locally");
	const payload = toTelegramErrorPayload(err, err.code);
	assert.equal(payload.code, "UNKNOWN_THREAD");
	assert.equal(payload.message, "thread not known locally");
	assert.equal(payload.retryable, false);
});

test("toTelegramErrorPayload: a SendToolError's own retry_after_s survives the fallback path (no classifiable cause)", () => {
	const err = new SendToolError("RATE_LIMITED", "locally rate-limited", { retry_after_s: 7 });
	const payload = toTelegramErrorPayload(err, err.code);
	assert.equal(payload.code, "RATE_LIMITED");
	assert.equal(payload.retry_after_s, 7, "a locally re-detected 429's retry_after_s must not be dropped just because the cause chain has nothing to classify");
});

test("toolErrorHttpStatus: RATE_LIMITED and TELEGRAM_RATE_LIMITED map to 429, an unclassified error maps to 500, everything else maps to 400", () => {
	assert.equal(toolErrorHttpStatus("RATE_LIMITED"), HTTP_TOO_MANY_REQUESTS);
	assert.equal(toolErrorHttpStatus("TELEGRAM_RATE_LIMITED"), HTTP_TOO_MANY_REQUESTS);
	assert.equal(toolErrorHttpStatus("TOOL_ERROR"), HTTP_INTERNAL_SERVER_ERROR, "the unclassified fallback code, see routes.ts's UNCLASSIFIED_TOOL_ERROR_CODE");
	assert.equal(toolErrorHttpStatus("UNKNOWN_THREAD"), HTTP_BAD_REQUEST);
	assert.equal(toolErrorHttpStatus("WRONG_ROOM"), HTTP_BAD_REQUEST);
});

test("POST /tools/thread with an unknown thread id surfaces the composed fallback payload through the real route", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		const res = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/thread",
			body: JSON.stringify({ thread_id: "000000000000" }),
			authorization: `Bearer ${bearer}`,
		});
		assert.equal(res.status, HTTP_BAD_REQUEST);
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, "UNKNOWN_THREAD");
	});
});
