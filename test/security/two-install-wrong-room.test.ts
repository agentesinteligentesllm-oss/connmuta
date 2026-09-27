import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { PRODUCT_NAME, RUN_SECRET_BYTES, IPC_NONCE_BYTES } from "../../src/shared/constants.js";
import { HTTP_OK, IPC_LOOPBACK_HOST, sessionResponseSchema } from "../../src/shared/ipc-contract.js";
import { createIpcServer } from "../../src/daemon/ipc/server.js";
import { createIdentityHandler, PendingHandshakeStore } from "../../src/daemon/ipc/handshake.js";
import { SessionStore } from "../../src/daemon/ipc/sessions.js";
import { createSessionRoutes, type RoutesDeps } from "../../src/daemon/ipc/routes.js";
import { BindingsReconciler } from "../../src/daemon/bindings.js";
import { createRegistryLoader, parseRegistryText } from "../../src/registry/loader.js";
import type { RegistryBot } from "../../src/registry/schema.js";
import { FakeTelegramClient } from "../fakes/telegram.js";
import type { Prompter } from "../../src/installer/prompter.js";
import type { AutostartOptions } from "../../src/installer/autostart.js";
import { runReg } from "../../src/installer/exec.js";
import { runSetup } from "../../src/installer/wizards/setup.js";
import { runBotAdd } from "../../src/installer/wizards/bot-add.js";
import { runGroupAdd } from "../../src/installer/wizards/group-add.js";
import { runProjectBind } from "../../src/installer/wizards/project-bind.js";
import { createFileFallbackStore } from "../../src/secret-store/file-fallback.js";
import type { SecretStoreSelection } from "../../src/secret-store/index.js";

/**
 * PT-01, "two real installs never cross" — a REAL two-project install topology, produced end to end
 * through the real installer wizards (`setup` → `bot add` ×2 → `group add` ×2 → `project bind` ×2),
 * then wired into the daemon's own `BindingsReconciler`/`createSessionRoutes` composition, to prove the
 * room-guard machinery `test/security/wrong-room.test.ts` already proves against a synthetic
 * `test/registry/fixtures.ts` document also holds against wizard-produced state.
 *
 * Deliberately FLAT under `test/security/` (not a `test/security/integration/` subdirectory):
 * `package.json`'s `test:wrong-room` script globs `dist/test/security/*wrong-room*`, which does not
 * cross a subdirectory boundary — a nested path would silently exclude this file from that script.
 *
 * **Harness choice, mirroring `wrong-room.test.ts`'s own reasoning**: the same
 * `createIpcServer`+`createIdentityHandler`+`createSessionRoutes`+`BindingsReconciler` composition
 * `test/daemon/ipc/routes.test.ts` (PR-31) already uses, not `startDaemon` — it already exposes exactly
 * the hooks this test needs and needs no change to any already-merged `src/**` file.
 *
 * **Unlike `wrong-room.test.ts`, this test passes NO `createTransport` override.** The whole point here
 * is to prove the DEFAULT, non-overridden transport-building path — the one `bindings.ts`'s
 * `BindingsReconciler.buildTransport` runs in production, via its `createTelegramClient` hook — produces
 * the same isolation guarantee over topology the real wizards produced, not a topology this test hand-
 * assembles.
 *
 * **Scratch autostart target, mirroring `test/installer/wizards/setup.test.ts`'s own established
 * pattern**: never the real `HKCU\...\Run` key, even for a run that answers the checkbox `false` (which
 * still forwards to `disableAutostart`). A `reg query`/`reg delete` against an absent scratch key prints
 * one benign, locale-dependent error line to this process's own stderr (Windows' own `reg.exe`
 * behavior, inherited by `execFileSync`'s default `stdio`) — expected noise already present in that
 * existing suite's own passing runs, not a defect in this one.
 */

// ---------------------------------------------------------------------------
// Independent HMAC oracle (mirrors wrong-room.test.ts's own pattern)
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
// Raw HTTP client (duplicated per this project's own established convention, see wrong-room.test.ts)
// ---------------------------------------------------------------------------

interface RawResponse {
	status: number;
	bodyText: string;
}

/**
 * Bounds every raw HTTP call this test makes against the real daemon-side harness (native review
 * `review-7a7a525a6a0f732d`, R3-wrong-room-http-no-timeout / R4-no-request-timeout-hang, both
 * CRITICAL). Without this, a routing bug or an unresolved promise in a real handler under test would
 * hang `sendRequest` — and this whole test — indefinitely instead of failing with a diagnosable error,
 * the identical failure class `test/cli/main-gate.integration.test.ts`'s own `GATE_SPAWN_TIMEOUT_MS`
 * guards against for its own child-process calls.
 */
const REQUEST_TIMEOUT_MS = 5000;

function sendRequest(options: { port: number; method: string; path: string; body?: string; authorization?: string }): Promise<RawResponse> {
	return new Promise((resolvePromise, reject) => {
		const bodyBuffer = options.body === undefined ? undefined : Buffer.from(options.body, "utf8");
		const headers: http.OutgoingHttpHeaders = { Host: `${IPC_LOOPBACK_HOST}:${options.port}` };
		if (bodyBuffer !== undefined) {
			headers["Content-Type"] = "application/json";
			headers["Content-Length"] = String(bodyBuffer.length);
		}
		if (options.authorization !== undefined) {
			headers["Authorization"] = options.authorization;
		}
		// Correction (native review `review-119b0f2cb358a3b9`, R3-sendrequest-partial-response-hang /
		// R4-sendrequest-post-response-timeout-hang, both CRITICAL): the previous round gated every
		// reject on `!responded`, so a timeout firing AFTER headers arrived but before the body
		// completed (`res` never emits "end") destroyed the request without ever settling the promise —
		// the exact hang this timeout exists to eliminate, just in a narrower window. `settled` now
		// covers both the pre- and post-headers cases uniformly, and `res` itself gets its own "error"
		// listener, since destroying a request after its response has started can surface the error on
		// `res`, not `req` (Node's http client does not guarantee which stream sees it).
		let settled = false;
		const req = http.request(
			{
				host: IPC_LOOPBACK_HOST,
				port: options.port,
				method: options.method,
				path: options.path,
				headers,
				timeout: REQUEST_TIMEOUT_MS,
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () => {
					if (settled) return;
					settled = true;
					resolvePromise({ status: res.statusCode ?? 0, bodyText: Buffer.concat(chunks).toString("utf8") });
				});
				res.on("error", (err) => {
					if (settled) return;
					settled = true;
					reject(err);
				});
			},
		);
		// `timeout` above only sets socket inactivity detection — it emits "timeout" but does not itself
		// abort the request; `destroy` does, which then fires an "error" event on `req` and/or `res`.
		req.on("timeout", () => {
			req.destroy(new Error(`sendRequest: ${options.method} ${options.path} did not respond within ${REQUEST_TIMEOUT_MS}ms`));
		});
		req.on("error", (err) => {
			if (settled) return;
			settled = true;
			reject(err);
		});
		req.end(bodyBuffer);
	});
}

async function openSession(
	port: number,
	secret: string,
	identity: { projectId: string; groupId: number; rosterHash: string },
): Promise<string> {
	const nonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
	const identityRes = await sendRequest({ port, method: "GET", path: `/identity?nonce=${nonce}` });
	assert.equal(identityRes.status, HTTP_OK, `setup: GET /identity must succeed: ${identityRes.bodyText}`);
	const identityBody = JSON.parse(identityRes.bodyText) as { proof: string; server_nonce: string };
	assert.equal(identityBody.proof, expectedIdentityProof(secret, nonce), "setup: identity proof must verify against this daemon's real secret");

	const sessionBody = {
		project_id: identity.projectId,
		group_id: identity.groupId,
		roster_hash: identity.rosterHash,
		host: "claude-code",
		pid: process.pid,
		hmac: expectedSessionProof(secret, identityBody.server_nonce),
		server_nonce: identityBody.server_nonce,
	};
	const sessionRes = await sendRequest({ port, method: "POST", path: "/session", body: JSON.stringify(sessionBody) });
	assert.equal(sessionRes.status, HTTP_OK, `setup: POST /session must mint a bearer: ${sessionRes.bodyText}`);
	const { bearer } = sessionResponseSchema.parse(JSON.parse(sessionRes.bodyText));
	return bearer;
}

// ---------------------------------------------------------------------------
// Installer-side fakes: a prompter that never needs a real TTY, and fetch stubs standing in for
// Telegram's `getMe` (mirroring test/installer/wizards/bot-add.test.ts's own fakePrompter pattern).
// ---------------------------------------------------------------------------

function fakeSetupPrompter(): Prompter {
	return {
		async password() {
			throw new Error("not used by this suite");
		},
		async text() {
			throw new Error("not used by this suite");
		},
		async select() {
			throw new Error("not used by this suite");
		},
		async multiselect() {
			throw new Error("not used by this suite");
		},
		async confirm() {
			// Declines start-at-login; this test cares about registry/binding topology, not autostart.
			return false;
		},
		isCancel() {
			return false;
		},
	};
}

function fakeBotAddPrompter(token: string): Prompter {
	return {
		async password() {
			return token;
		},
		async text() {
			throw new Error("not used by this suite");
		},
		async select() {
			throw new Error("not used by this suite");
		},
		async multiselect() {
			throw new Error("not used by this suite");
		},
		async confirm() {
			throw new Error("not used by this suite");
		},
		isCancel() {
			return false;
		},
	};
}

async function fakeSelectSecretStore(homeDir: string): Promise<SecretStoreSelection> {
	return { store: createFileFallbackStore(homeDir) };
}

function fetchImplFor(botId: number, username: string): typeof fetch {
	return (async () =>
		new Response(JSON.stringify({ ok: true, result: { id: botId, is_bot: true, username } }), {
			status: 200,
			headers: { "content-type": "application/json" },
		})) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Fixture identities (placeholders, AGENTS.md §3 — never a production id)
// ---------------------------------------------------------------------------

const BOT_A_ID = 900000301;
const BOT_A_USERNAME = "wizard_a_bot";
const BOT_A_TOKEN = `${BOT_A_ID}:${"A".repeat(35)}`;
const BOT_B_ID = 900000302;
const BOT_B_USERNAME = "wizard_b_bot";
const BOT_B_TOKEN = `${BOT_B_ID}:${"B".repeat(35)}`;

const GROUP_A_ID = -1001111111111;
const GROUP_B_ID = -1002222222222;

const AGENT_A_ID = "@agent-a";
const AGENT_B_ID = "@agent-b";

const N_SENDS = 3;

test("two real installs: N sends from two independently wizard-produced projects never cross", async () => {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-two-install-home-"));
	const projectDirA = mkdtempSync(join(tmpdir(), "conmuta-two-install-proj-a-"));
	const projectDirB = mkdtempSync(join(tmpdir(), "conmuta-two-install-proj-b-"));
	// Scratch autostart target, mirroring `test/installer/wizards/setup.test.ts`'s own established
	// pattern: never the real `HKCU\...\Run` key, even for a run that answers the checkbox `false`
	// (which still forwards to `disableAutostart`).
	const scratchRunKey = `HKCU\\Software\\${PRODUCT_NAME}-test-${randomUUID()}`;
	const launchAgentsDir = mkdtempSync(join(tmpdir(), "conmuta-two-install-autostart-"));
	const autostartOptions: AutostartOptions = { runKey: scratchRunKey, launchAgentsDir };
	let db: DatabaseSync | undefined;
	let server: Awaited<ReturnType<typeof createIpcServer>> | undefined;

	try {
		// 1. `setup`: scaffolds registry.json, opens the ledger, hardens the home ACL.
		const setupOutcome = await runSetup({ homeDir, prompter: fakeSetupPrompter(), autostartOptions });
		assert.equal(setupOutcome.outcome, "completed", `setup must complete: ${JSON.stringify(setupOutcome)}`);
		if (setupOutcome.outcome !== "completed") {
			throw new Error("unreachable");
		}
		db = setupOutcome.db;
		const registryPath = setupOutcome.registryPath;

		// 2. `bot add` x2 — two independent bots, two independent tokens.
		const botAOutcome = await runBotAdd({
			db,
			registryPath,
			homeDir,
			prompter: fakeBotAddPrompter(BOT_A_TOKEN),
			fetchImpl: fetchImplFor(BOT_A_ID, BOT_A_USERNAME),
			selectSecretStoreImpl: fakeSelectSecretStore,
		});
		assert.deepEqual(botAOutcome, { outcome: "added", bot_id: BOT_A_ID, username: BOT_A_USERNAME });

		const botBOutcome = await runBotAdd({
			db,
			registryPath,
			homeDir,
			prompter: fakeBotAddPrompter(BOT_B_TOKEN),
			fetchImpl: fetchImplFor(BOT_B_ID, BOT_B_USERNAME),
			selectSecretStoreImpl: fakeSelectSecretStore,
		});
		assert.deepEqual(botBOutcome, { outcome: "added", bot_id: BOT_B_ID, username: BOT_B_USERNAME });

		// 3. `group add` x2 — two independent, negative Telegram group ids.
		const groupAOutcome = runGroupAdd({ db, registryPath, groupId: GROUP_A_ID });
		assert.deepEqual(groupAOutcome, { outcome: "added", group_id: GROUP_A_ID });

		const groupBOutcome = runGroupAdd({ db, registryPath, groupId: GROUP_B_ID });
		assert.deepEqual(groupBOutcome, { outcome: "added", group_id: GROUP_B_ID });

		// 4. `project bind` x2 — one project per bot/group pair, each roster's sole entry the bot's own
		// identity (R3: `user_id === botId`), no tool-config files written (out of this test's scope).
		const bindAOutcome = await runProjectBind({
			db,
			registryPath,
			targetDir: projectDirA,
			botId: BOT_A_ID,
			groupId: GROUP_A_ID,
			agentId: AGENT_A_ID,
			roster: [{ agent_id: AGENT_A_ID, user_id: BOT_A_ID, username: BOT_A_USERNAME }],
			selectedToolIds: new Set(),
		});
		assert.equal(bindAOutcome.outcome, "bound", `project bind A must succeed: ${JSON.stringify(bindAOutcome)}`);

		const bindBOutcome = await runProjectBind({
			db,
			registryPath,
			targetDir: projectDirB,
			botId: BOT_B_ID,
			groupId: GROUP_B_ID,
			agentId: AGENT_B_ID,
			roster: [{ agent_id: AGENT_B_ID, user_id: BOT_B_ID, username: BOT_B_USERNAME }],
			selectedToolIds: new Set(),
		});
		assert.equal(bindBOutcome.outcome, "bound", `project bind B must succeed: ${JSON.stringify(bindBOutcome)}`);
		if (bindAOutcome.outcome !== "bound" || bindBOutcome.outcome !== "bound") {
			throw new Error("unreachable");
		}
		const projectIdA = bindAOutcome.project_id;
		const projectIdB = bindBOutcome.project_id;

		// 5. Read the real registry.json the wizards just produced — proof of two distinct, active
		// bindings — and extract each binding's own wizard-computed roster_hash (never recomputed here).
		const registryText = readFileSync(registryPath, "utf8");
		const parsedRegistry = parseRegistryText(registryText);
		assert.equal(parsedRegistry.ok, true, "the wizard-produced registry.json must itself be valid");
		if (!parsedRegistry.ok) {
			throw new Error("unreachable");
		}
		const activeBindings = parsedRegistry.registry.bindings.filter((binding) => binding.status === "active");
		assert.equal(activeBindings.length, 2, "the two project binds must produce exactly two active bindings");

		const bindingA = activeBindings.find((binding) => binding.project_id === projectIdA);
		const bindingB = activeBindings.find((binding) => binding.project_id === projectIdB);
		assert.ok(bindingA, "binding A must be present in the real registry");
		assert.ok(bindingB, "binding B must be present in the real registry");
		assert.equal(bindingA!.group_id, GROUP_A_ID);
		assert.equal(bindingB!.group_id, GROUP_B_ID);
		assert.notEqual(bindingA!.group_id, bindingB!.group_id, "the two real installs must never share a group_id");
		const rosterHashA = bindingA!.roster_hash;
		const rosterHashB = bindingB!.roster_hash;

		// 6. Daemon-side harness: a real RegistryLoader over the wizard-produced file, and a
		// BindingsReconciler wired with NO createTransport override — the real, default production path
		// (`createTelegramClient`), keyed here by bot_id so each fake stands in for one bot's own client.
		const telegramClientsByBotId = new Map<number, FakeTelegramClient>();
		const loader = createRegistryLoader({ path: registryPath });
		const reconciler = new BindingsReconciler({
			db,
			loader,
			createTelegramClient: (bot: RegistryBot) => {
				const client = new FakeTelegramClient();
				telegramClientsByBotId.set(bot.bot_id, client);
				return client;
			},
		});
		await reconciler.reconcile();
		assert.equal(reconciler.getActiveBindings().length, 2, "the reconciler must activate both real bindings");

		const secret = freshSecret();
		const handshakeStore = new PendingHandshakeStore();
		const sessionStore = new SessionStore(secret);

		// Advances more than a second per call so consecutive sends in the same test never trip
		// CHAT_MESSAGES_PER_SECOND (send/rate.ts) — mirrors wrong-room.test.ts's own `now` override; this
		// test is about cross-install isolation, not rate discipline (test/daemon/send/rate.test.ts's own
		// scope).
		let clockMs = Date.parse("2026-01-01T00:00:00.000Z");
		const now = (): Date => {
			clockMs += 1100;
			return new Date(clockMs);
		};

		const handlers = {
			"GET /identity": createIdentityHandler({ secret, store: handshakeStore }),
		};
		const deps: RoutesDeps = {
			db,
			bindings: reconciler,
			handshakeStore,
			sessionStore,
			daemon: { pid: process.pid, started_at: "2026-01-01T00:00:00.000Z", secret_store_kind: "file" },
			now,
		};
		Object.assign(handlers, createSessionRoutes(deps));

		server = createIpcServer({ handlers });
		const { port } = await server.listen();

		// 7. Real handshake per project, using each binding's OWN wizard-computed roster_hash.
		const bearerA = await openSession(port, secret, { projectId: projectIdA, groupId: GROUP_A_ID, rosterHash: rosterHashA });
		const bearerB = await openSession(port, secret, { projectId: projectIdB, groupId: GROUP_B_ID, rosterHash: rosterHashB });

		// 8. N sends per session; assert each fake Telegram client only ever saw its own group_id.
		for (let i = 0; i < N_SENDS; i++) {
			const resA = await sendRequest({
				port,
				method: "POST",
				path: "/tools/send",
				body: JSON.stringify({ type: "BROADCAST", body: `A message ${i}` }),
				authorization: `Bearer ${bearerA}`,
			});
			assert.equal(resA.status, HTTP_OK, `session A send ${i} must succeed: ${resA.bodyText}`);

			const resB = await sendRequest({
				port,
				method: "POST",
				path: "/tools/send",
				body: JSON.stringify({ type: "BROADCAST", body: `B message ${i}` }),
				authorization: `Bearer ${bearerB}`,
			});
			assert.equal(resB.status, HTTP_OK, `session B send ${i} must succeed: ${resB.bodyText}`);
		}

		const telegramA = telegramClientsByBotId.get(BOT_A_ID)!;
		const telegramB = telegramClientsByBotId.get(BOT_B_ID)!;
		assert.ok(telegramA, "bot A's fake Telegram client must have been constructed by the reconciler");
		assert.ok(telegramB, "bot B's fake Telegram client must have been constructed by the reconciler");

		// Each binding's sole roster entry is the bot's own identity, so a BROADCAST excludes the caller
		// and fans out to the group post alone (`resolveRecipients`) — exactly N sends per client.
		assert.equal(telegramA.sentMessages.length, N_SENDS);
		assert.equal(telegramB.sentMessages.length, N_SENDS);

		for (const msg of telegramA.sentMessages) {
			assert.equal(msg.chat_id, GROUP_A_ID, "bot A's fake client must never see B's group_id");
		}
		for (const msg of telegramB.sentMessages) {
			assert.equal(msg.chat_id, GROUP_B_ID, "bot B's fake client must never see A's group_id");
		}
		assert.ok(!telegramA.sentMessages.some((m) => m.chat_id === GROUP_B_ID));
		assert.ok(!telegramB.sentMessages.some((m) => m.chat_id === GROUP_A_ID));
	} finally {
		// Correction (native review `review-588821941bef5e65`, R4-cleanup-cascade-abort, CRITICAL): each
		// step below releases an independent resource (the listening server, the ledger handle, four
		// temp directories, one scratch registry key). Running them as unguarded sequential statements
		// meant one throw (e.g. server.close() rejecting) would abort the whole block and skip every
		// later step — every one of the six best-effort steps now gets its own guard, not just the
		// registry delete this block already treated that way.
		const cleanupSteps: readonly (() => void | Promise<void>)[] = [
			async () => {
				if (server) await server.close();
			},
			() => {
				if (db) db.close();
			},
			() => rmSync(homeDir, { recursive: true, force: true }),
			() => rmSync(projectDirA, { recursive: true, force: true }),
			() => rmSync(projectDirB, { recursive: true, force: true }),
			() => rmSync(launchAgentsDir, { recursive: true, force: true }),
			() => {
				// Never created (this run answered the checkbox false, and disableAutostart is a noop on
				// an absent key), or already removed; the catch below absorbs either case.
				if (process.platform === "win32") runReg(["delete", scratchRunKey, "/f"]);
			},
		];
		for (const step of cleanupSteps) {
			try {
				await step();
			} catch {
				// Best-effort: a real assertion failure above must not also leak every remaining resource
				// because cleanup itself aborted partway through.
			}
		}
	}
});
