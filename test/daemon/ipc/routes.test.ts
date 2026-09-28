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
	channelCursorResponseSchema,
	doorbellResponseSchema,
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
	CURSOR_COMMIT_OUT_OF_RANGE,
	HANDSHAKE_NONCE_INVALID,
	ROSTER_DRIFT_CONDITION,
	SESSION_MINT_REFUSED,
	UNBOUND_PROJECT,
	createSessionRoutes,
	toTelegramErrorPayload,
	toolErrorHttpStatus,
	withRetryAfterIfRetryable,
	type RoutesDeps,
} from "../../../src/daemon/ipc/routes.js";
import { openLedger } from "../../../src/ledger/open.js";
import { commitInboxBatch } from "../../../src/ledger/inbox.js";
import { raiseCondition, readCondition } from "../../../src/ledger/conditions-store.js";
import { BindingsReconciler } from "../../../src/daemon/bindings.js";
import { createRegistryLoader } from "../../../src/registry/loader.js";
import { GroupMigratedError, RateLimitedError } from "../../../src/daemon/telegram.js";
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
const BOT_ID = 100000001; // activeBinding()'s own default (test/registry/fixtures.ts)
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

test("unbound project refused at session start: UNBOUND_PROJECT, 404, no session minted, nonce NOT consumed", async () => {
	await withHarness(async (h) => {
		const serverNonce = h.handshakeStore.issue();
		assert.ok(serverNonce);
		const { status, parsed } = await postSession(h, validSessionRequestBody(h, { project_id: "prj-never-bound", server_nonce: serverNonce }));
		assert.equal(status, HTTP_NOT_FOUND);
		assert.equal(ipcErrorSchema.parse(parsed).code, UNBOUND_PROJECT);
		assert.equal(h.sessionStore.size, 0, "no bearer may be minted for an unbound project");
		// Proof the registry check runs BEFORE nonce consumption (module doc's "resource hygiene" claim):
		// the nonce this refused call carried must still be consumable afterward.
		assert.equal(h.handshakeStore.consume(serverNonce), true, "a registry refusal must not have consumed the nonce");
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
		const { bearer, response } = await openValidSession(h);

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
		const row = rows[rows.length - 1];
		assert.equal(row?.reason, "BINDING_CHANGED");
		assert.equal(row?.outcome, "ok");
		assert.equal(row?.direction, "system");
		// The row records the session's FROZEN identity (what the call thought it was talking to), not
		// the live/new one — a field swap or a dropped client_id would ship silently without these.
		assert.equal(row?.bot_id, BOT_ID, "must be the frozen bot_id, not swapped with chat_id");
		assert.equal(row?.chat_id, GROUP_ID, "must be the frozen (pre-drift) group_id, not the new live one");
		assert.equal(row?.client_id, response.client_id, "must not be silently dropped (client_id is nullable at the DB level)");
	});
});

test("live binding drift on bot_id alone (group_id and agent_id unchanged) still trips BINDING_CHANGED", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);

		const NEW_BOT_ID = 100000099;
		await h.reload(
			baseRegistryDocument({
				bot_id: NEW_BOT_ID,
				roster_snapshot: [{ ...TWO_MEMBER_ROSTER[0], user_id: NEW_BOT_ID }, TWO_MEMBER_ROSTER[1]],
			}),
		);

		const res = await sendRequest({ port: h.port, method: "POST", path: "/tools/status", body: "{}", authorization: `Bearer ${bearer}` });
		assert.equal(res.status, HTTP_CONFLICT, "a bot_id-only drift must trip the freeze on its own, independent of group_id/agent_id");
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, BINDING_CHANGED);
	});
});

test("live binding drift on agent_id alone (bot_id and group_id unchanged) still trips BINDING_CHANGED", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);

		await h.reload(
			baseRegistryDocument({
				agent_id: "@alice-renamed-agent",
				roster_snapshot: [{ ...TWO_MEMBER_ROSTER[0], agent_id: "@alice-renamed-agent" }, TWO_MEMBER_ROSTER[1]],
			}),
		);

		const res = await sendRequest({ port: h.port, method: "POST", path: "/tools/status", body: "{}", authorization: `Bearer ${bearer}` });
		assert.equal(res.status, HTTP_CONFLICT, "an agent_id-only drift must trip the freeze on its own, independent of bot_id/group_id");
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, BINDING_CHANGED);
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

// F3 PR-04a: the same comparison now also persists roster_drift as a standing condition (the passive
// web panel's own read source), instead of only reporting it in this one response body.
test("roster hash mismatch also persists roster_drift as a standing project condition", async () => {
	await withHarness(async (h) => {
		const body = validSessionRequestBody(h, { roster_hash: `sha256:${"0".repeat(64)}` });
		await postSession(h, body);

		const row = readCondition(h.db, PROJECT_ID, "roster_drift");
		assert.notEqual(row, undefined, "roster_drift must be a standing row after a mismatched session mint");
	});
});

test("a matching roster_hash clears a previously persisted roster_drift condition", async () => {
	await withHarness(async (h) => {
		raiseCondition(h.db, { scope: PROJECT_ID, name: "roster_drift", since: new Date().toISOString() });

		const body = validSessionRequestBody(h, { roster_hash: ROSTER_HASH });
		const { status } = await postSession(h, body);
		assert.equal(status, HTTP_OK);

		assert.equal(readCondition(h.db, PROJECT_ID, "roster_drift"), undefined);
	});
});

// ---------------------------------------------------------------------------
// 5. Session refused when the project file's group disagrees with the binding (R4)
// ---------------------------------------------------------------------------

test("session refused when the project file's group disagrees with the binding (R4): BINDING_MISMATCH, 409, no session minted, no audit row, nonce NOT consumed", async () => {
	await withHarness(async (h) => {
		const before = auditRows(h.db, PROJECT_ID).length;
		const serverNonce = h.handshakeStore.issue();
		assert.ok(serverNonce);
		const body = validSessionRequestBody(h, { group_id: -1009999999, server_nonce: serverNonce });
		const { status, parsed } = await postSession(h, body);
		assert.equal(status, HTTP_CONFLICT);
		assert.equal(ipcErrorSchema.parse(parsed).code, BINDING_MISMATCH);
		assert.equal(h.sessionStore.size, 0, "no bearer may be minted on an R4 refusal");
		assert.equal(auditRows(h.db, PROJECT_ID).length, before, "R4 is a session-start refusal, not a live drift — no audit row");
		assert.equal(h.handshakeStore.consume(serverNonce), true, "an R4 refusal must not have consumed the nonce either");
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

test("route-level schema validation refuses a malformed /tools/fetch body with IPC_BAD_REQUEST", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		const res = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/fetch",
			body: JSON.stringify({ max_batch: -1 }),
			authorization: `Bearer ${bearer}`,
		});
		assert.equal(res.status, HTTP_BAD_REQUEST);
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, IPC_BAD_REQUEST);
	});
});

test("route-level schema validation refuses a malformed /tools/status body with IPC_BAD_REQUEST", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		// statusInputSchema is `z.object({})`: any object (even with extra keys) parses successfully
		// with them stripped, so only a non-object JSON value can fail this gate.
		const res = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/status",
			body: JSON.stringify("not-an-object"),
			authorization: `Bearer ${bearer}`,
		});
		assert.equal(res.status, HTTP_BAD_REQUEST);
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, IPC_BAD_REQUEST);
	});
});

test("route-level schema validation refuses a malformed /tools/thread body with IPC_BAD_REQUEST", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		const res = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/thread",
			body: JSON.stringify({ thread_id: "not-twelve-hex-chars" }),
			authorization: `Bearer ${bearer}`,
		});
		assert.equal(res.status, HTTP_BAD_REQUEST);
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, IPC_BAD_REQUEST);
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

test("toTelegramErrorPayload: a GroupMigratedError cause propagates new_chat_id, not just retry_after_s", () => {
	const cause = new GroupMigratedError(400, "group migrated", -1009999999999);
	const err = new SendToolError("TRANSPORT_ERROR", "send failed", { cause });
	const payload = toTelegramErrorPayload(err, "TRANSPORT_ERROR");
	assert.equal(payload.code, "GROUP_MIGRATED");
	assert.equal(payload.retryable, false);
	assert.equal(payload.new_chat_id, -1009999999999, "the classified new_chat_id must reach the caller, not just retry_after_s");
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
	assert.equal(payload.retryable, true, "a payload carrying retry_after_s must never also claim retryable: false — that combination told a caller to both wait and never retry");
});

test("toTelegramErrorPayload: retry_after_s is never carried onto a payload whose code is not retryable (structural, not just the RATE_LIMITED case)", () => {
	// A defensive property test, not a production-reachable scenario: SendToolError's own doc comment
	// says retry_after_s is "set only for RATE_LIMITED", but nothing in its constructor's TYPE enforces
	// that. If it ever were violated, the carry-over must still refuse to produce a self-contradictory
	// payload — proven here directly, independent of whether any real call site currently does this.
	const err = new SendToolError("BODY_TOO_LONG", "not actually rate-limited", { retry_after_s: 99 });
	const payload = toTelegramErrorPayload(err, err.code);
	assert.equal(payload.retryable, false);
	assert.equal(payload.retry_after_s, undefined, "retry_after_s must never survive onto a non-retryable payload, regardless of which code carried it");
});

test("withRetryAfterIfRetryable: the shared gate both toTelegramErrorPayload branches use", () => {
	// Direct unit coverage of the helper itself (PR-31 Judgment Day round 2, judge A): the
	// `classified !== null` branch in toTelegramErrorPayload was, before this helper existed, safe only
	// because classifyTelegramError's seven hand-written branches happened to never pair retry_after_s
	// with retryable:false -- an accident of that file's current content, not something this function
	// enforced. This test proves the property directly, with no dependency on which real error classes
	// exist today in either classifyTelegramError or SendErrorCode.
	const retryablePayload = { code: "X", message: "m", retryable: true };
	assert.deepEqual(withRetryAfterIfRetryable(retryablePayload, 5), { code: "X", message: "m", retryable: true, retry_after_s: 5 });
	assert.deepEqual(withRetryAfterIfRetryable(retryablePayload, undefined), retryablePayload, "undefined retryAfterS must not add the key at all");

	const nonRetryablePayload = { code: "Y", message: "m", retryable: false };
	assert.deepEqual(withRetryAfterIfRetryable(nonRetryablePayload, 5), nonRetryablePayload, "retryable: false must refuse retry_after_s even when a caller supplies one");
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

// ---------------------------------------------------------------------------
// POST /channel/doorbell (F4 PR-03)
// ---------------------------------------------------------------------------

/** Writes `count` admitted rows from the fixture peer (`@bob-agent`), direct to the session's own agent. */
function seedPeerRows(db: DatabaseSync, count: number): void {
	const entries = Array.from({ length: count }, (_, i) => {
		const n = i + 1;
		return {
			kind: "admitted" as const,
			update: {
				update_id: n,
				project_id: PROJECT_ID,
				chat_id: GROUP_ID,
				via: "direct" as const,
				message_id: 7000 + n,
				message_date: 1_767_225_600,
				from_user_id: 100000002,
				from_agent_id: "@bob-agent",
				eid: n.toString(16).padStart(12, "0"),
				envelope_json: JSON.stringify({ type: "REQUEST", to: "@alice-agent", thread: n.toString(16).padStart(12, "0") }),
				body: "peer prose the doorbell must never carry",
				apply_outcome: "opened" as const,
				received_at: "2026-01-01T00:00:00.000Z",
			},
		};
	});
	commitInboxBatch(db, { bot_id: BOT_ID, entries });
}

test("POST /channel/doorbell reaches serveDoorbell behind the session gate: a bound session gets a doorbellResponseSchema-shaped summary of rows past after_seq", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		seedPeerRows(h.db, 3);

		const res = await sendRequest({ port: h.port, method: "POST", path: "/channel/doorbell", body: JSON.stringify({ after_seq: 1 }), authorization: `Bearer ${bearer}` });
		assert.equal(res.status, HTTP_OK, res.bodyText);
		const summary = doorbellResponseSchema.parse(JSON.parse(res.bodyText));
		assert.equal(summary.count, 2, "only rows past after_seq are summarized");
		assert.deepEqual(summary.senders, ["@bob-agent"]);
		assert.equal(summary.covered_through_seq, 3);
		assert.equal(summary.saturated, false);
		assert.doesNotMatch(res.bodyText, /peer prose/, "the response never carries message text");
	});
});

test("POST /channel/doorbell refuses a missing or unknown bearer exactly as the /tools/* routes do (401, no audit row)", async () => {
	await withHarness(async (h) => {
		const before = auditRows(h.db, PROJECT_ID).length;
		const body = JSON.stringify({ after_seq: 0 });

		const missing = await sendRequest({ port: h.port, method: "POST", path: "/channel/doorbell", body });
		const garbage = await sendRequest({ port: h.port, method: "POST", path: "/channel/doorbell", body, authorization: "Bearer not-a-real-bearer" });
		const toolRefusal = await sendRequest({ port: h.port, method: "POST", path: "/tools/status", body: "{}" });

		for (const refused of [missing, garbage]) {
			assert.equal(refused.status, HTTP_UNAUTHORIZED);
			assert.equal(refused.bodyText, toolRefusal.bodyText, "the refusal body is identical to a tool route's");
		}
		assert.equal(auditRows(h.db, PROJECT_ID).length, before, "an unauthenticated call must write no audit row");
	});
});

test("POST /channel/doorbell refuses a drifted live binding with BINDING_CHANGED (409), like the /tools/* routes", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		await h.reload(baseRegistryDocument({ group_id: -1009999999 }));

		const res = await sendRequest({ port: h.port, method: "POST", path: "/channel/doorbell", body: JSON.stringify({ after_seq: 0 }), authorization: `Bearer ${bearer}` });
		assert.equal(res.status, HTTP_CONFLICT);
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, BINDING_CHANGED);
	});
});

test("route-level schema validation refuses a malformed /channel/doorbell body with IPC_BAD_REQUEST", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		for (const body of [{}, { after_seq: -1 }, { after_seq: 0, extra: true }]) {
			const res = await sendRequest({ port: h.port, method: "POST", path: "/channel/doorbell", body: JSON.stringify(body), authorization: `Bearer ${bearer}` });
			assert.equal(res.status, HTTP_BAD_REQUEST, res.bodyText);
			assert.equal(JSON.parse(res.bodyText).code, IPC_BAD_REQUEST);
		}
	});
});

// ---------------------------------------------------------------------------
// POST /channel/cursor (F4 PR-04)
// ---------------------------------------------------------------------------

function cursorRows(db: DatabaseSync): Record<string, unknown>[] {
	return db.prepare("SELECT * FROM client_cursors ORDER BY client_id").all() as Record<string, unknown>[];
}

function postCursor(h: Harness, bearer: string | undefined, body: unknown): Promise<RawResponse> {
	return sendRequest({
		port: h.port,
		method: "POST",
		path: "/channel/cursor",
		body: JSON.stringify(body),
		authorization: bearer === undefined ? undefined : `Bearer ${bearer}`,
	});
}

test("POST /channel/cursor with no commit_seq ensures the row, returns its current inbox_seq, and writes nothing else", async () => {
	await withHarness(async (h) => {
		const { bearer, response } = await openValidSession(h);
		seedPeerRows(h.db, 3);
		assert.deepEqual(cursorRows(h.db), [], "setup: no cursor row before the first call");

		const first = await postCursor(h, bearer, {});
		assert.equal(first.status, HTTP_OK, first.bodyText);
		// Every seeded row is older than the catch-up window, so the fresh row starts at the newest of them.
		assert.equal(channelCursorResponseSchema.parse(JSON.parse(first.bodyText)).inbox_seq, 3);
		const rows = cursorRows(h.db);
		assert.equal(rows.length, 1);
		assert.equal(rows[0]?.client_id, response.client_id);
		assert.equal(rows[0]?.host, "claude-code");

		const second = await postCursor(h, bearer, {});
		assert.equal(second.status, HTTP_OK);
		assert.deepEqual(cursorRows(h.db), rows, "a repeated read changes no column, last_seen_at included");
	});
});

test("POST /channel/cursor commits at or below the project's newest seq and returns the stored inbox_seq", async () => {
	await withHarness(async (h) => {
		const { bearer, response } = await openValidSession(h);
		seedPeerRows(h.db, 3);
		await postCursor(h, bearer, {});
		h.db.prepare("UPDATE client_cursors SET inbox_seq = 0 WHERE client_id = ?").run(response.client_id);

		const advanced = await postCursor(h, bearer, { commit_seq: 2 });
		assert.equal(advanced.status, HTTP_OK, advanced.bodyText);
		assert.equal(channelCursorResponseSchema.parse(JSON.parse(advanced.bodyText)).inbox_seq, 2);

		const atTail = await postCursor(h, bearer, { commit_seq: 3 });
		assert.equal(channelCursorResponseSchema.parse(JSON.parse(atTail.bodyText)).inbox_seq, 3);

		const lower = await postCursor(h, bearer, { commit_seq: 1 });
		assert.equal(lower.status, HTTP_OK);
		assert.equal(channelCursorResponseSchema.parse(JSON.parse(lower.bodyText)).inbox_seq, 3, "a lower commit never moves the cursor back");
		assert.equal(cursorRows(h.db)[0]?.inbox_seq, 3);
	});
});

test("POST /channel/cursor refuses a commit past the project's newest seq with CURSOR_COMMIT_OUT_OF_RANGE (400) and leaves an existing row byte-identical", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		seedPeerRows(h.db, 3);
		await postCursor(h, bearer, {});
		const before = cursorRows(h.db);

		const res = await postCursor(h, bearer, { commit_seq: 4 });
		assert.equal(res.status, HTTP_BAD_REQUEST, res.bodyText);
		const error = ipcErrorSchema.parse(JSON.parse(res.bodyText));
		assert.equal(error.code, CURSOR_COMMIT_OUT_OF_RANGE);
		assert.equal(error.retryable, false);
		assert.deepEqual(cursorRows(h.db), before, "a refused commit writes nothing");
	});
});

test("POST /channel/cursor runs ensure before the range check: a refused commit from a session with no row still creates the row at the catch-up window", async () => {
	await withHarness(async (h) => {
		const { bearer, response } = await openValidSession(h);
		seedPeerRows(h.db, 3);
		assert.deepEqual(cursorRows(h.db), []);

		const res = await postCursor(h, bearer, { commit_seq: 99 });
		assert.equal(res.status, HTTP_BAD_REQUEST, res.bodyText);
		assert.equal(JSON.parse(res.bodyText).code, CURSOR_COMMIT_OUT_OF_RANGE);
		const rows = cursorRows(h.db);
		assert.equal(rows.length, 1, "D8's ensure-first order: the row exists even though the commit was refused");
		assert.equal(rows[0]?.client_id, response.client_id);
		assert.equal(rows[0]?.inbox_seq, 3, "at the catch-up window, not at the refused value");
	});
});

test("POST /channel/cursor on a project with no rows treats any positive commit_seq as out of range and commit 0 as in range", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);

		const past = await postCursor(h, bearer, { commit_seq: 1 });
		assert.equal(past.status, HTTP_BAD_REQUEST);
		const zero = await postCursor(h, bearer, { commit_seq: 0 });
		assert.equal(zero.status, HTTP_OK, zero.bodyText);
		assert.equal(channelCursorResponseSchema.parse(JSON.parse(zero.bodyText)).inbox_seq, 0);
	});
});

test("POST /channel/cursor refuses a missing or unknown bearer exactly as the /tools/* routes do (401, no cursor row)", async () => {
	await withHarness(async (h) => {
		const toolRefusal = await sendRequest({ port: h.port, method: "POST", path: "/tools/status", body: "{}" });

		const missing = await postCursor(h, undefined, {});
		const garbage = await postCursor(h, "not-a-real-bearer", { commit_seq: 0 });

		for (const refused of [missing, garbage]) {
			assert.equal(refused.status, HTTP_UNAUTHORIZED);
			assert.equal(refused.bodyText, toolRefusal.bodyText, "the refusal body is identical to a tool route's");
		}
		assert.deepEqual(cursorRows(h.db), [], "an unauthenticated call creates no cursor row");
	});
});

test("POST /channel/cursor refuses a drifted live binding with BINDING_CHANGED (409), like the /tools/* routes", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		await h.reload(baseRegistryDocument({ group_id: -1009999999 }));

		const res = await postCursor(h, bearer, {});
		assert.equal(res.status, HTTP_CONFLICT);
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, BINDING_CHANGED);
		assert.deepEqual(cursorRows(h.db), []);
	});
});

test("route-level schema validation refuses a malformed /channel/cursor body with IPC_BAD_REQUEST", async () => {
	await withHarness(async (h) => {
		const { bearer } = await openValidSession(h);
		for (const body of [{ commit_seq: -1 }, { commit_seq: 1.5 }, { commit_seq: "3" }, { commit_seq: 0, extra: true }]) {
			const res = await postCursor(h, bearer, body);
			assert.equal(res.status, HTTP_BAD_REQUEST, res.bodyText);
			assert.equal(JSON.parse(res.bodyText).code, IPC_BAD_REQUEST);
		}
		assert.deepEqual(cursorRows(h.db), [], "a malformed body is refused before ensure");
	});
});
