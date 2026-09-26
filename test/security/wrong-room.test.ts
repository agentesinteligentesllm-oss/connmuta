import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { RUN_SECRET_BYTES, IPC_NONCE_BYTES } from "../../src/shared/constants.js";
import { HTTP_BAD_REQUEST, HTTP_OK, IPC_LOOPBACK_HOST, ipcErrorSchema, sessionResponseSchema } from "../../src/shared/ipc-contract.js";
import { createIpcServer } from "../../src/daemon/ipc/server.js";
import { createIdentityHandler, PendingHandshakeStore } from "../../src/daemon/ipc/handshake.js";
import { SessionStore } from "../../src/daemon/ipc/sessions.js";
import { createSessionRoutes, type RoutesDeps } from "../../src/daemon/ipc/routes.js";
import { openLedger } from "../../src/ledger/open.js";
import { BindingsReconciler } from "../../src/daemon/bindings.js";
import { createRegistryLoader } from "../../src/registry/loader.js";
import { RoomGuardClient } from "../../src/daemon/transport/room-guard.js";
import { GroupTransport } from "../../src/daemon/transport/group.js";
import { DirectTransport } from "../../src/daemon/transport/direct.js";
import { DualWriteTransport } from "../../src/daemon/transport/dual.js";
import { FakeTelegramClient } from "../fakes/telegram.js";
import { activeBinding, addSecondBinding, validRegistryDocument } from "../registry/fixtures.js";
import type { ProjectRosterEntry } from "../../src/shared/project-file.js";

/**
 * PT-01, `send-path › chat_id must equal the binding's group_id or the send is refused` (full
 * two-binding integration scenario; the unit halves live in `test/daemon/transport/room-guard.test.ts`
 * and `test/daemon/send/send-path.test.ts`). New test-only code, no v1 equivalent (v1 had no daemon and
 * no multi-binding topology).
 *
 * **Harness choice: the same `createIpcServer`+`createSessionRoutes`+`BindingsReconciler` composition
 * `test/daemon/ipc/routes.test.ts` already uses (PR-31), not `startDaemon` (PR-40a).** `startDaemon`'s
 * `DaemonOptions` exposes `telegramClientFactory` but no `createTransport` override, and the wrong-room
 * scenario (design.md §14/PT-01: "wires a guard with the wrong group") needs a `RoomGuardClient` built
 * with a DIFFERENT `groupId` than its own binding's — the real registry/reconciliation wiring can never
 * produce that on its own by construction (`bindings.ts`'s `buildTransport` always derives the guard's
 * `groupId` from the same `binding.group_id` that `send-path`'s `config.chat_id` also derives from), so
 * constructing it at all requires a test-injectable `createTransport`. This composition already provides
 * exactly that hook, already exercises the identical `IpcServerDeps.handlers`/`RoutesDeps`/`send-path`
 * pipeline `startDaemon` wires (PR-40a's own module doc), and needs no change to any already-merged,
 * already-audited `src/**` file.
 */

// ---------------------------------------------------------------------------
// Independent HMAC oracle (mirrors routes.test.ts / handshake.test.ts's own pattern)
// ---------------------------------------------------------------------------

function expectedIdentityProof(secret: string, nonce: string): string {
	return createHmac("sha256", secret).update(`identity:${nonce}`).digest("hex");
}

function expectedSessionProof(secret: string, serverNonce: string): string {
	return createHmac("sha256", secret).update(`session:${serverNonce}`).digest("hex");
}

function freshSecret(): string {
	return randomBytes(RUN_SECRET_BYTES).toString("hex");
}

// ---------------------------------------------------------------------------
// Raw HTTP client (duplicated per this project's own established convention)
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
// Two-binding registry fixture (test/registry/fixtures.ts's own builder for exactly this shape)
// ---------------------------------------------------------------------------

const PROJECT_A = "prj-example";
const PROJECT_B = "prj-second";
const GROUP_A = -1001234567890; // activeBinding()'s own default
const GROUP_B = -1001234567891; // addSecondBinding()'s own default

function twoBindingRegistry(): ReturnType<typeof validRegistryDocument> {
	return addSecondBinding(validRegistryDocument());
}

// ---------------------------------------------------------------------------
// Harness: real ledger + real registry temp file + BindingsReconciler + createSessionRoutes,
// mirroring test/daemon/ipc/routes.test.ts's own withHarness, generalized to two bindings and an
// optional per-project createTransport override (needed only for the wrong-room test below).
// ---------------------------------------------------------------------------

interface Harness {
	readonly port: number;
	readonly db: DatabaseSync;
	readonly secret: string;
	readonly handshakeStore: PendingHandshakeStore;
	readonly telegramClients: Map<string, FakeTelegramClient>;
}

type TransportOverride = (
	projectId: string,
	binding: { group_id: number; roster_snapshot: readonly ProjectRosterEntry[] },
	telegram: FakeTelegramClient,
) => { transport: DualWriteTransport; roomGuard: RoomGuardClient };

async function withHarness(
	transportOverride: TransportOverride | undefined,
	run: (h: Harness) => Promise<void>,
): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-wrong-room-"));
	const registryPath = join(home, "registry.json");
	const ledger = openLedger({ homeDir: home });
	const telegramClients = new Map<string, FakeTelegramClient>();

	writeFileSync(registryPath, JSON.stringify(twoBindingRegistry()));
	const loader = createRegistryLoader({ path: registryPath });

	const reconciler = new BindingsReconciler({
		db: ledger.db,
		loader,
		createTransport: (binding) => {
			const telegram = new FakeTelegramClient();
			telegramClients.set(binding.project_id, telegram);
			if (transportOverride) {
				return transportOverride(binding.project_id, binding, telegram);
			}
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

	// Advances more than a second per call so consecutive sends in the same test never trip
	// CHAT_MESSAGES_PER_SECOND (send/rate.ts) — this test's own N-sends are about cross-binding
	// isolation, not rate discipline, which `test/daemon/send/rate.test.ts` already covers.
	let clockMs = Date.parse("2026-01-01T00:00:00.000Z");
	const now = (): Date => {
		clockMs += 1100;
		return new Date(clockMs);
	};

	const handlers = {
		"GET /identity": createIdentityHandler({ secret, store: handshakeStore }),
	};
	const deps: RoutesDeps = {
		db: ledger.db,
		bindings: reconciler,
		handshakeStore,
		sessionStore,
		daemon: { pid: 424242, started_at: "2026-01-01T00:00:00.000Z", secret_store_kind: "keychain" },
		now,
	};
	Object.assign(handlers, createSessionRoutes(deps));

	const server = createIpcServer({ handlers });
	const { port } = await server.listen();

	const harness: Harness = { port, db: ledger.db, secret, handshakeStore, telegramClients };

	try {
		await run(harness);
	} finally {
		await server.close();
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// Real handshake: GET /identity then POST /session, exactly the two steps a real client runs
// (client/handshake.ts's performHandshake), computed here with the independent HMAC oracle above.
// ---------------------------------------------------------------------------

async function openSession(
	h: Harness,
	identity: { projectId: string; groupId: number; rosterHash: string },
): Promise<string> {
	const nonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
	const identityRes = await sendRequest({ port: h.port, method: "GET", path: `/identity?nonce=${nonce}` });
	assert.equal(identityRes.status, HTTP_OK, `setup: GET /identity must succeed: ${identityRes.bodyText}`);
	const identityBody = JSON.parse(identityRes.bodyText) as { proof: string; server_nonce: string };
	assert.equal(identityBody.proof, expectedIdentityProof(h.secret, nonce), "setup: identity proof must verify against this daemon's real secret");

	const sessionBody = {
		project_id: identity.projectId,
		group_id: identity.groupId,
		roster_hash: identity.rosterHash,
		host: "claude-code",
		pid: process.pid,
		hmac: expectedSessionProof(h.secret, identityBody.server_nonce),
		server_nonce: identityBody.server_nonce,
	};
	const sessionRes = await sendRequest({ port: h.port, method: "POST", path: "/session", body: JSON.stringify(sessionBody) });
	assert.equal(sessionRes.status, HTTP_OK, `setup: POST /session must mint a bearer: ${sessionRes.bodyText}`);
	const { bearer } = sessionResponseSchema.parse(JSON.parse(sessionRes.bodyText));
	return bearer;
}

function auditRows(db: DatabaseSync, projectId: string): Record<string, unknown>[] {
	return db.prepare("SELECT * FROM audit_log WHERE project_id = ? ORDER BY id").all(projectId) as Record<string, unknown>[];
}

const N_SENDS = 3;

// ---------------------------------------------------------------------------
// 1. Two-binding partition: N sends per session, chat_id never crosses (PT-01)
// ---------------------------------------------------------------------------

test("wrong-room: N sends from two independent sessions never cross — each fake's sentMessages carries only its own group_id", async () => {
	await withHarness(undefined, async (h) => {
		const registry = twoBindingRegistry();
		const bindingA = activeBinding() as { roster_snapshot: ProjectRosterEntry[]; roster_hash: string };
		const bindingB = registry.bindings[1] as unknown as { roster_snapshot: ProjectRosterEntry[]; roster_hash: string };
		const bearerA = await openSession(h, { projectId: PROJECT_A, groupId: GROUP_A, rosterHash: bindingA.roster_hash });
		const bearerB = await openSession(h, { projectId: PROJECT_B, groupId: GROUP_B, rosterHash: bindingB.roster_hash });

		for (let i = 0; i < N_SENDS; i++) {
			const resA = await sendRequest({
				port: h.port,
				method: "POST",
				path: "/tools/send",
				body: JSON.stringify({ type: "BROADCAST", body: `A message ${i}` }),
				authorization: `Bearer ${bearerA}`,
			});
			assert.equal(resA.status, HTTP_OK, `session A send ${i} must succeed: ${resA.bodyText}`);

			const resB = await sendRequest({
				port: h.port,
				method: "POST",
				path: "/tools/send",
				body: JSON.stringify({ type: "BROADCAST", body: `B message ${i}` }),
				authorization: `Bearer ${bearerB}`,
			});
			assert.equal(resB.status, HTTP_OK, `session B send ${i} must succeed: ${resB.bodyText}`);
		}

		const telegramA = h.telegramClients.get(PROJECT_A)!;
		const telegramB = h.telegramClients.get(PROJECT_B)!;

		// Each binding's default single-member roster (this fixture's own agent only) makes a BROADCAST
		// fan out to the group post alone (`resolveRecipients` excludes the caller's own agent_id, and no
		// other roster member exists) — exactly N sends, one sentMessages entry each, all numeric chat_id.
		assert.equal(telegramA.sentMessages.length, N_SENDS);
		assert.equal(telegramB.sentMessages.length, N_SENDS);

		for (const msg of telegramA.sentMessages) {
			assert.equal(msg.chat_id, GROUP_A, "session A's fake client must never see B's group_id");
		}
		for (const msg of telegramB.sentMessages) {
			assert.equal(msg.chat_id, GROUP_B, "session B's fake client must never see A's group_id");
		}

		// The partition, stated the other way round: neither fake's own sent set contains the other's id.
		assert.ok(!telegramA.sentMessages.some((m) => m.chat_id === GROUP_B));
		assert.ok(!telegramB.sentMessages.some((m) => m.chat_id === GROUP_A));
	});
});

// ---------------------------------------------------------------------------
// 2. Forced wrong-room: a guard wired to the wrong group refuses before any network call (PT-01)
// ---------------------------------------------------------------------------

test("wrong-room: a room guard wired to a different binding's group refuses WRONG_ROOM, writes one audit row, sends nothing", async () => {
	const registry = twoBindingRegistry();
	const bindingB = registry.bindings[1] as unknown as { roster_snapshot: ProjectRosterEntry[]; roster_hash: string };

	// The one deliberate misconfiguration this test exists to catch (design.md §14: "wires a guard with
	// the wrong group"): binding A's own transport is built with a RoomGuardClient whose expectedGroupId
	// is B's group, not A's own — something the real registry/reconciliation path can never produce on
	// its own (buildTransport always derives both `RoomGuardClient.groupId` and send-path's own
	// `config.chat_id` from the SAME `binding.group_id`), so it must be constructed directly here.
	const transportOverride: TransportOverride = (projectId, binding, telegram) => {
		const wrongGroupId = projectId === PROJECT_A ? GROUP_B : binding.group_id;
		const roomGuard = new RoomGuardClient(telegram, { groupId: wrongGroupId, roster: binding.roster_snapshot });
		const group = new GroupTransport(roomGuard, binding.group_id);
		const directRoster: Record<string, ProjectRosterEntry> = {};
		for (const entry of binding.roster_snapshot) directRoster[entry.agent_id] = entry;
		const direct = new DirectTransport(roomGuard, directRoster);
		return { transport: new DualWriteTransport(group, direct), roomGuard };
	};

	await withHarness(transportOverride, async (h) => {
		const bindingA = activeBinding() as { roster_hash: string };
		const bearerA = await openSession(h, { projectId: PROJECT_A, groupId: GROUP_A, rosterHash: bindingA.roster_hash });

		const before = auditRows(h.db, PROJECT_A).length;
		const res = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/send",
			body: JSON.stringify({ type: "BROADCAST", body: "must never leave this process" }),
			authorization: `Bearer ${bearerA}`,
		});

		assert.equal(res.status, HTTP_BAD_REQUEST, res.bodyText);
		assert.equal(ipcErrorSchema.parse(JSON.parse(res.bodyText)).code, "WRONG_ROOM");

		const telegramA = h.telegramClients.get(PROJECT_A)!;
		assert.equal(telegramA.sentMessages.length, 0, "no sendMessage call may reach the transport on a WRONG_ROOM refusal");

		const rows = auditRows(h.db, PROJECT_A);
		assert.equal(rows.length, before + 1, "exactly one audit row must be written");
		const row = rows[rows.length - 1];
		assert.equal(row?.reason, "WRONG_ROOM");
		assert.equal(row?.outcome, "rejected");
		assert.equal(row?.direction, "send");
		assert.equal(row?.chat_id, GROUP_A, "the audit row records the binding's OWN chat_id, not the mismatched guard's");

		// Binding B, wired correctly, is completely unaffected by A's misconfiguration.
		const bearerB = await openSession(h, { projectId: PROJECT_B, groupId: GROUP_B, rosterHash: bindingB.roster_hash });
		const resB = await sendRequest({
			port: h.port,
			method: "POST",
			path: "/tools/send",
			body: JSON.stringify({ type: "BROADCAST", body: "B is fine" }),
			authorization: `Bearer ${bearerB}`,
		});
		assert.equal(resB.status, HTTP_OK, resB.bodyText);
	});
});
