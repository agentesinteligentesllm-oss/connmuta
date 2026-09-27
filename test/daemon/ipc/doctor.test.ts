import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { IPC_NONCE_BYTES, RUN_SECRET_BYTES } from "../../../src/shared/constants.js";
import {
	doctorResponseSchema,
	ipcErrorSchema,
	HTTP_BAD_REQUEST,
	HTTP_NOT_FOUND,
	HTTP_OK,
	HTTP_UNAUTHORIZED,
	IPC_BAD_REQUEST,
} from "../../../src/shared/ipc-contract.js";
import {
	computeDoctorProof,
	createDoctorHandler,
	DOCTOR_NONCE_INVALID,
	DOCTOR_PROOF_INVALID,
	DOCTOR_UNBOUND_PROJECT,
	type DoctorBindingsAccessor,
	type DoctorHandlerDeps,
	type DoctorTelegramClient,
} from "../../../src/daemon/ipc/doctor.js";
import { PendingHandshakeStore } from "../../../src/daemon/ipc/handshake.js";
import type { IpcRequest } from "../../../src/daemon/ipc/server.js";
import type { ManagedBinding } from "../../../src/daemon/bindings.js";
import { materializeBindingConfig } from "../../../src/daemon/binding-config.js";
import { TransportError } from "../../../src/daemon/transport/types.js";
import type { RegistryBinding } from "../../../src/registry/schema.js";
import type { ProjectRosterEntry } from "../../../src/shared/project-file.js";
import { openLedger } from "../../../src/ledger/open.js";

/**
 * `daemon/ipc/doctor.ts` (PR-17, design §9.2 D-44, spec `doctor`, PT-32, B-28). New code — no v1 range
 * — so this twin needs no `test/fixtures/v1-provenance.json` entry.
 *
 * Runtime harness (per this PR's own brief): the route handler is called DIRECTLY against a fabricated
 * `IpcRequest`, an injected `doctorClientFor` fake and a real `PendingHandshakeStore` — no
 * `createIpcServer`/HTTP boilerplate and no `startDaemon` boot, unlike `handshake.test.ts`/
 * `routes.test.ts`'s own server-based convention. The ledger is a REAL `node:sqlite` database
 * (`openLedger` over a temp home dir) so the `DOCTOR_PROBE` audit row is verified by querying the
 * actual table, not a fake writer.
 */

// ---------------------------------------------------------------------------
// Independent oracle — mirrors handshake.test.ts / routes.test.ts's own pattern
// ---------------------------------------------------------------------------

function expectedDoctorProof(secret: string, serverNonce: string): string {
	return createHmac("sha256", secret).update(`doctor:${serverNonce}`).digest("hex");
}

function expectedSessionProof(secret: string, serverNonce: string): string {
	return createHmac("sha256", secret).update(`session:${serverNonce}`).digest("hex");
}

function freshSecret(): string {
	return randomBytes(RUN_SECRET_BYTES).toString("hex");
}

// ---------------------------------------------------------------------------
// Fixture binding
// ---------------------------------------------------------------------------

const PROJECT_ID = "prj-example";
const BOT_ID = 100000001;
const GROUP_ID = -1001234567890;
const SELF_ENTRY: ProjectRosterEntry = { agent_id: "@alice-agent", user_id: BOT_ID, username: "alice_example_bot" };
const PEER_ENTRY: ProjectRosterEntry = { agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" };

function bindingFixture(overrides: Partial<RegistryBinding> = {}): RegistryBinding {
	return {
		project_id: PROJECT_ID,
		bot_id: BOT_ID,
		group_id: GROUP_ID,
		agent_id: "@alice-agent",
		status: "active",
		roster_snapshot: [SELF_ENTRY, PEER_ENTRY],
		roster_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
		bound_at: "2026-09-16T00:00:00Z",
		...overrides,
	};
}

function managedBindingFixture(overrides: Partial<RegistryBinding> = {}, roomGuard?: FakeRoomGuard): ManagedBinding {
	const binding = bindingFixture(overrides);
	const config = materializeBindingConfig(binding, "alice_example_bot");
	return { binding, config, roomGuard: roomGuard as unknown as ManagedBinding["roomGuard"] };
}

class FakeBindingsAccessor implements DoctorBindingsAccessor {
	private readonly map = new Map<string, ManagedBinding>();

	set(managed: ManagedBinding): void {
		this.map.set(managed.binding.project_id, managed);
	}

	getBinding(projectId: string): ManagedBinding | undefined {
		return this.map.get(projectId);
	}

	getActiveBindings(): readonly ManagedBinding[] {
		return [...this.map.values()];
	}
}

// ---------------------------------------------------------------------------
// Fake Telegram client (getChatMember is not on the shared TelegramClient interface, so
// test/fakes/telegram.ts's FakeTelegramClient cannot be reused as-is — see doctor.ts's own
// DoctorTelegramClient doc).
// ---------------------------------------------------------------------------

type ChatMemberStatus = "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";

class FakeDoctorTelegramClient implements DoctorTelegramClient {
	meId: number;
	chatType = "supergroup";
	getMeError: Error | undefined;
	getChatError: Error | undefined;
	readonly memberStatuses = new Map<number, ChatMemberStatus>();
	readonly memberErrors = new Map<number, Error>();
	readonly getChatMemberCalls: Array<{ chatId: number | string; userId: number }> = [];

	constructor(meId: number) {
		this.meId = meId;
	}

	async getMe() {
		if (this.getMeError) throw this.getMeError;
		return { id: this.meId, is_bot: true };
	}

	async getChat(chatId: number | string) {
		if (this.getChatError) throw this.getChatError;
		return { id: Number(chatId), type: this.chatType };
	}

	async getChatMember(chatId: number | string, userId: number) {
		this.getChatMemberCalls.push({ chatId, userId });
		const err = this.memberErrors.get(userId);
		if (err) throw err;
		const status = this.memberStatuses.get(userId) ?? "member";
		return { status, user: { id: userId, is_bot: false } };
	}
}

/**
 * A fake `RoomGuardClient` — `sendMessage` only, since that is the whole surface the DM probe calls
 * (`doctor.ts`'s own correction: the probe goes through `roomGuard.sendMessage` directly, one call per
 * peer, never `Transport.send`). `chat_id`-keyed errors let a test fail one specific peer without
 * failing every other one, mirroring `FakeDoctorTelegramClient`'s own per-user error map.
 */
class FakeRoomGuard {
	readonly calls: Array<{ chat_id: number | string; text: string }> = [];
	readonly errorsByChatId = new Map<string, Error>();

	async sendMessage(params: { chat_id: number | string; text: string }): Promise<{ message_id: number }> {
		this.calls.push({ chat_id: params.chat_id, text: params.text });
		const err = this.errorsByChatId.get(String(params.chat_id));
		if (err) throw err;
		return { message_id: this.calls.length };
	}
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface Harness {
	readonly db: DatabaseSync;
	readonly secret: string;
	readonly store: PendingHandshakeStore;
	readonly bindings: FakeBindingsAccessor;
	buildDeps(client: DoctorTelegramClient): DoctorHandlerDeps;
	doctorProbeRows(): Array<{ outcome: string; project_id: string | null; bot_id: number | null; chat_id: number | null; direction: string; eid: string | null; client_id: string | null }>;
}

async function withHarness(run: (h: Harness) => Promise<void>): Promise<void> {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-doctor-"));
	const opened = openLedger({ homeDir });
	assert.equal(opened.status, "opened");
	const db = opened.db;
	const secret = freshSecret();
	const store = new PendingHandshakeStore();
	const bindings = new FakeBindingsAccessor();

	const harness: Harness = {
		db,
		secret,
		store,
		bindings,
		buildDeps(client: DoctorTelegramClient): DoctorHandlerDeps {
			return {
				secret,
				store,
				bindings,
				doctorClientFor: () => client,
				db,
			};
		},
		doctorProbeRows() {
			return db
				.prepare(
					"SELECT outcome, project_id, bot_id, chat_id, direction, eid, client_id FROM audit_log WHERE reason = 'DOCTOR_PROBE'",
				)
				.all() as Array<{ outcome: string; project_id: string | null; bot_id: number | null; chat_id: number | null; direction: string; eid: string | null; client_id: string | null }>;
		},
	};

	try {
		await run(harness);
	} finally {
		db.close();
		rmSync(homeDir, { recursive: true, force: true });
	}
}

function doctorRequest(body: unknown): IpcRequest {
	return { route: "POST /doctor", query: new URLSearchParams(), headers: {}, body };
}

// ---------------------------------------------------------------------------
// computeDoctorProof
// ---------------------------------------------------------------------------

test("computeDoctorProof matches an independent HMAC-SHA256(secret, 'doctor:'+nonce) oracle", () => {
	const secret = freshSecret();
	const nonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
	assert.equal(computeDoctorProof(secret, nonce), expectedDoctorProof(secret, nonce));
});

// ---------------------------------------------------------------------------
// Auth refusals (design §9.2's own planned RED tests: replayed nonce, wrong label, missing project_id)
// ---------------------------------------------------------------------------

test("an already-consumed server_nonce is refused with DOCTOR_NONCE_INVALID", async () => {
	await withHarness(async (h) => {
		const nonce = h.store.issue()!;
		assert.equal(h.store.consume(nonce), true, "pre-consume the nonce to simulate a replay");

		const handler = createDoctorHandler(h.buildDeps(new FakeDoctorTelegramClient(BOT_ID)));
		const res = await handler(
			doctorRequest({ server_nonce: nonce, hmac: expectedDoctorProof(h.secret, nonce), dm_probe: false }),
		);
		assert.equal(res.status, HTTP_UNAUTHORIZED);
		assert.equal(ipcErrorSchema.parse(res.body).code, DOCTOR_NONCE_INVALID);
	});
});

test("a 'session:'-labelled hmac is refused with DOCTOR_PROOF_INVALID, not accepted as a doctor proof", async () => {
	await withHarness(async (h) => {
		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(new FakeDoctorTelegramClient(BOT_ID)));
		const res = await handler(
			doctorRequest({ server_nonce: nonce, hmac: expectedSessionProof(h.secret, nonce), dm_probe: false }),
		);
		assert.equal(res.status, HTTP_UNAUTHORIZED);
		assert.equal(ipcErrorSchema.parse(res.body).code, DOCTOR_PROOF_INVALID);
	});
});

test("dm_probe true without project_id is refused 400 IPC_BAD_REQUEST and consumes no nonce", async () => {
	await withHarness(async (h) => {
		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(new FakeDoctorTelegramClient(BOT_ID)));
		const res = await handler(
			doctorRequest({ server_nonce: nonce, hmac: expectedDoctorProof(h.secret, nonce), dm_probe: true }),
		);
		assert.equal(res.status, HTTP_BAD_REQUEST);
		assert.equal(ipcErrorSchema.parse(res.body).code, IPC_BAD_REQUEST);
		assert.equal(h.store.consume(nonce), true, "a body-schema refusal must not have touched the pending nonce");
	});
});

test("an unbound project_id is refused 404 DOCTOR_UNBOUND_PROJECT", async () => {
	await withHarness(async (h) => {
		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(new FakeDoctorTelegramClient(BOT_ID)));
		const res = await handler(
			doctorRequest({
				server_nonce: nonce,
				hmac: expectedDoctorProof(h.secret, nonce),
				project_id: "prj-missing",
				dm_probe: false,
			}),
		);
		assert.equal(res.status, HTTP_NOT_FOUND);
		assert.equal(ipcErrorSchema.parse(res.body).code, DOCTOR_UNBOUND_PROJECT);
	});
});

// ---------------------------------------------------------------------------
// Online checks
// ---------------------------------------------------------------------------

test("a healthy binding reports pass for bot identity, group reachability and every roster member", async () => {
	await withHarness(async (h) => {
		h.bindings.set(managedBindingFixture());
		const client = new FakeDoctorTelegramClient(BOT_ID);

		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(client));
		const res = await handler(
			doctorRequest({
				server_nonce: nonce,
				hmac: expectedDoctorProof(h.secret, nonce),
				project_id: PROJECT_ID,
				dm_probe: false,
			}),
		);
		assert.equal(res.status, HTTP_OK);
		const body = doctorResponseSchema.parse(res.body);
		assert.equal(body.bindings.length, 1);
		const checks = body.bindings[0]!.checks;
		assert.equal(checks.length, 4, "bot-identity + group-reachable + 2 roster members");
		for (const check of checks) {
			assert.equal(check.status, "pass", `${check.id} should pass: ${check.detail}`);
		}
		assert.deepEqual(
			checks.map((c) => c.id).sort(),
			["bot-identity", "group-reachable", "roster-membership-@alice-agent", "roster-membership-@bob-agent"].sort(),
		);
	});
});

test("a getMe mismatch fails only the bot-identity check; getChat and getChatMember still run (per-check isolation)", async () => {
	await withHarness(async (h) => {
		h.bindings.set(managedBindingFixture());
		const client = new FakeDoctorTelegramClient(BOT_ID + 1); // mismatched identity

		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(client));
		const res = await handler(
			doctorRequest({
				server_nonce: nonce,
				hmac: expectedDoctorProof(h.secret, nonce),
				project_id: PROJECT_ID,
				dm_probe: false,
			}),
		);
		const body = doctorResponseSchema.parse(res.body);
		const checks = body.bindings[0]!.checks;
		assert.equal(checks.length, 4);
		const byId = new Map(checks.map((c) => [c.id, c]));
		assert.equal(byId.get("bot-identity")!.status, "fail");
		assert.equal(byId.get("group-reachable")!.status, "pass");
		assert.equal(byId.get("roster-membership-@bob-agent")!.status, "pass");
	});
});

test("getMe throwing fails the bot-identity check with a redacted detail instead of aborting the response", async () => {
	await withHarness(async (h) => {
		h.bindings.set(managedBindingFixture());
		const client = new FakeDoctorTelegramClient(BOT_ID);
		client.getMeError = new Error(`upstream said: 123456789:${"A".repeat(35)}`);

		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(client));
		const res = await handler(
			doctorRequest({
				server_nonce: nonce,
				hmac: expectedDoctorProof(h.secret, nonce),
				project_id: PROJECT_ID,
				dm_probe: false,
			}),
		);
		const body = doctorResponseSchema.parse(res.body);
		const checks = body.bindings[0]!.checks;
		assert.equal(checks.length, 4, "one check failing must not drop the other three");
		const identity = checks.find((c) => c.id === "bot-identity")!;
		assert.equal(identity.status, "fail");
		assert.ok(identity.detail.includes("<redacted>"), "a token-shaped error message must be redacted");
		assert.ok(!identity.detail.includes("A".repeat(35)), "the raw token shape must never reach the response");
	});
});

test("getChat reachable but not a supergroup reports a warn, not a fail", async () => {
	await withHarness(async (h) => {
		h.bindings.set(managedBindingFixture());
		const client = new FakeDoctorTelegramClient(BOT_ID);
		client.chatType = "group";

		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(client));
		const res = await handler(
			doctorRequest({
				server_nonce: nonce,
				hmac: expectedDoctorProof(h.secret, nonce),
				project_id: PROJECT_ID,
				dm_probe: false,
			}),
		);
		const body = doctorResponseSchema.parse(res.body);
		const groupCheck = body.bindings[0]!.checks.find((c) => c.id === "group-reachable")!;
		assert.equal(groupCheck.status, "warn");
	});
});

test("getChatMember: administrator, creator, left and kicked all fail; member and restricted pass (design §9.2 severity)", async () => {
	await withHarness(async (h) => {
		const admin: ProjectRosterEntry = { agent_id: "@admin-agent", user_id: 200, username: "admin_bot" };
		const creator: ProjectRosterEntry = { agent_id: "@creator-agent", user_id: 201, username: "creator_bot" };
		const left: ProjectRosterEntry = { agent_id: "@left-agent", user_id: 202, username: "left_bot" };
		const kicked: ProjectRosterEntry = { agent_id: "@kicked-agent", user_id: 203, username: "kicked_bot" };
		const restricted: ProjectRosterEntry = { agent_id: "@restricted-agent", user_id: 204, username: "restricted_bot" };
		const roster = [SELF_ENTRY, admin, creator, left, kicked, restricted];

		h.bindings.set(managedBindingFixture({ roster_snapshot: roster }));
		const client = new FakeDoctorTelegramClient(BOT_ID);
		client.memberStatuses.set(admin.user_id, "administrator");
		client.memberStatuses.set(creator.user_id, "creator");
		client.memberStatuses.set(left.user_id, "left");
		client.memberStatuses.set(kicked.user_id, "kicked");
		client.memberStatuses.set(restricted.user_id, "restricted");

		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(client));
		const res = await handler(
			doctorRequest({
				server_nonce: nonce,
				hmac: expectedDoctorProof(h.secret, nonce),
				project_id: PROJECT_ID,
				dm_probe: false,
			}),
		);
		const body = doctorResponseSchema.parse(res.body);
		const byId = new Map(body.bindings[0]!.checks.map((c) => [c.id, c.status]));
		assert.equal(byId.get("roster-membership-@alice-agent"), "pass");
		assert.equal(byId.get("roster-membership-@admin-agent"), "fail");
		assert.equal(byId.get("roster-membership-@creator-agent"), "fail");
		assert.equal(byId.get("roster-membership-@left-agent"), "fail");
		assert.equal(byId.get("roster-membership-@kicked-agent"), "fail");
		assert.equal(byId.get("roster-membership-@restricted-agent"), "pass");
	});
});

test("no project_id and dm_probe false checks every active binding", async () => {
	await withHarness(async (h) => {
		h.bindings.set(managedBindingFixture());
		h.bindings.set(
			managedBindingFixture({
				project_id: "prj-second",
				bot_id: 100000003,
				group_id: -1001234567891,
				agent_id: "@carol-agent",
				roster_snapshot: [{ agent_id: "@carol-agent", user_id: 100000003, username: "carol_example_bot" }],
			}),
		);
		const client = new FakeDoctorTelegramClient(BOT_ID);
		// The single fake client answers getMe() with BOT_ID for both bindings — the second binding's
		// own bot-identity check therefore fails (a mismatch), which is fine: this test only pins that
		// BOTH bindings are visited when project_id is omitted, not their individual verdicts.

		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(client));
		const res = await handler(
			doctorRequest({ server_nonce: nonce, hmac: expectedDoctorProof(h.secret, nonce), dm_probe: false }),
		);
		const body = doctorResponseSchema.parse(res.body);
		assert.deepEqual(
			body.bindings.map((b) => b.project_id).sort(),
			[PROJECT_ID, "prj-second"].sort(),
		);
	});
});

// ---------------------------------------------------------------------------
// DM probe
// ---------------------------------------------------------------------------

test("dm probe excludes the bound bot's own roster entry, addresses by username, and appends one 'ok' DOCTOR_PROBE audit row", async () => {
	await withHarness(async (h) => {
		const roomGuard = new FakeRoomGuard();
		h.bindings.set(managedBindingFixture({}, roomGuard));
		const client = new FakeDoctorTelegramClient(BOT_ID);

		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(client));
		const res = await handler(
			doctorRequest({
				server_nonce: nonce,
				hmac: expectedDoctorProof(h.secret, nonce),
				project_id: PROJECT_ID,
				dm_probe: true,
			}),
		);
		const body = doctorResponseSchema.parse(res.body);
		const probe = body.bindings[0]!.checks.find((c) => c.id === "dm-probe")!;
		assert.equal(probe.status, "pass");

		assert.equal(roomGuard.calls.length, 1, "the bot's own roster entry must never be a DM target");
		assert.equal(roomGuard.calls[0]!.chat_id, "@bob_example_bot", "addressed by username, mirroring DirectTransport's own convention");

		const rows = h.doctorProbeRows();
		assert.equal(rows.length, 1);
		assert.equal(rows[0]!.outcome, "ok");
		assert.equal(rows[0]!.project_id, PROJECT_ID);
		assert.equal(rows[0]!.bot_id, BOT_ID);
		assert.equal(rows[0]!.chat_id, GROUP_ID);
		assert.equal(rows[0]!.direction, "send");
		assert.equal(rows[0]!.eid, null, "a doctor probe is not a bus envelope");
		assert.equal(rows[0]!.client_id, null, "no session bearer was minted for this route");
	});
});

test("dm probe failure reports a fail finding and a 'rejected' DOCTOR_PROBE audit row", async () => {
	await withHarness(async (h) => {
		const roomGuard = new FakeRoomGuard();
		roomGuard.errorsByChatId.set("@bob_example_bot", new TransportError("simulated outage"));
		h.bindings.set(managedBindingFixture({}, roomGuard));
		const client = new FakeDoctorTelegramClient(BOT_ID);

		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(client));
		const res = await handler(
			doctorRequest({
				server_nonce: nonce,
				hmac: expectedDoctorProof(h.secret, nonce),
				project_id: PROJECT_ID,
				dm_probe: true,
			}),
		);
		const body = doctorResponseSchema.parse(res.body);
		const probe = body.bindings[0]!.checks.find((c) => c.id === "dm-probe")!;
		assert.equal(probe.status, "fail");
		assert.ok(probe.detail.includes("probe failed"));

		const rows = h.doctorProbeRows();
		assert.equal(rows.length, 1);
		assert.equal(rows[0]!.outcome, "rejected");
	});
});

test("an opted-in DM probe scoped to one project never touches a second bound project's room guard (PR-22, spec `doctor › Opted-in DM probe never crosses project boundaries`)", async () => {
	await withHarness(async (h) => {
		const roomGuardA = new FakeRoomGuard();
		h.bindings.set(managedBindingFixture({}, roomGuardA));

		const roomGuardB = new FakeRoomGuard();
		const daveEntry: ProjectRosterEntry = { agent_id: "@dave-agent", user_id: 100000004, username: "dave_example_bot" };
		const carolSelfEntry: ProjectRosterEntry = { agent_id: "@carol-agent", user_id: 100000003, username: "carol_example_bot" };
		h.bindings.set(
			managedBindingFixture(
				{
					project_id: "prj-second",
					bot_id: 100000003,
					group_id: -1001234567891,
					agent_id: "@carol-agent",
					roster_snapshot: [carolSelfEntry, daveEntry],
				},
				roomGuardB,
			),
		);

		const client = new FakeDoctorTelegramClient(BOT_ID);
		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(client));
		const res = await handler(
			doctorRequest({
				server_nonce: nonce,
				hmac: expectedDoctorProof(h.secret, nonce),
				project_id: PROJECT_ID,
				dm_probe: true,
			}),
		);
		assert.equal(res.status, HTTP_OK);
		const body = doctorResponseSchema.parse(res.body);
		assert.equal(body.bindings.length, 1, "only the requested project's binding is checked at all");
		assert.equal(body.bindings[0]!.project_id, PROJECT_ID);

		assert.equal(roomGuardA.calls.length, 1, "project A's own roster peer receives exactly one probe message");
		assert.equal(roomGuardA.calls[0]!.chat_id, "@bob_example_bot");
		assert.equal(roomGuardB.calls.length, 0, "project B's room guard must never be invoked by a probe scoped to project A");
	});
});

test("a binding with no room guard wired fails the dm-probe finding defensively, without throwing", async () => {
	await withHarness(async (h) => {
		h.bindings.set(managedBindingFixture()); // no roomGuard passed
		const client = new FakeDoctorTelegramClient(BOT_ID);

		const nonce = h.store.issue()!;
		const handler = createDoctorHandler(h.buildDeps(client));
		const res = await handler(
			doctorRequest({
				server_nonce: nonce,
				hmac: expectedDoctorProof(h.secret, nonce),
				project_id: PROJECT_ID,
				dm_probe: true,
			}),
		);
		const body = doctorResponseSchema.parse(res.body);
		const probe = body.bindings[0]!.checks.find((c) => c.id === "dm-probe")!;
		assert.equal(probe.status, "fail");
		assert.equal(h.doctorProbeRows().length, 0, "no audit row when the probe never attempted a send");
	});
});
