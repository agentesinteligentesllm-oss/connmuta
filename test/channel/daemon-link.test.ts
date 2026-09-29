import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	createDaemonLink,
	DAEMON_LINK_ERROR_CODES,
	DaemonLinkError,
	type DaemonLink,
	type DaemonLinkErrorCode,
} from "../../channel/daemon-link.js";
import { CHANNEL_HOST_LABEL } from "../../src/shared/constants.js";
import { SERVER_VERSION } from "../../src/shared/version.js";
import {
	hasAutonomousTimerReference,
	hasChildProcessReference,
	hasFsModuleReference,
	hasTimersModuleReference,
	hasUnboundedLoopReference,
} from "../security/predicates.js";

/**
 * `channel/daemon-link.ts` (F4 PR-05b, design D6/D7/D12, spec `channel-doorbell`). A scripted `fetchImpl`
 * plays the daemon against a temp home holding a real run file, so no network call is ever made. Every id
 * is a placeholder (AGENTS.md §3). The live-daemon case is replaced by these scripted ones (Alpha
 * CONSENSUS `bus-v2-f4-apply-pr05b-001`).
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SECRET = "link-secret";
const PORT_A = 41001;
const PORT_B = 41002;
const ROSTER_HASH = `sha256:${"d".repeat(64)}`;
const SERVER_NONCE = "b".repeat(64);
const IDENTITY = { projectId: "prj-example", groupId: -100, rosterHash: ROSTER_HASH, host: CHANNEL_HOST_LABEL };
const DOORBELL_OK = { count: 1, senders: ["@alpha-one"], types: ["REQUEST"], threads: ["0123456789ab"], covered_through_seq: 7, saturated: false };
const ALLOWED_SPECIFIER = /^(?:node:path|zod|\.\.\/src\/shared\/[a-z-]+\.js|\.\.\/src\/client\/(?:run-file|session-exchange)\.js)$/;

/** The n-th minted bearer: distinct per mint, and lowercase hex of the length the session schema requires. */
const bearerFor = (n: number): string => n.toString(16).padStart(64, "0");

interface FetchCall {
	readonly url: string;
	readonly init: RequestInit | undefined;
}

/** Answers a call itself (a Response, or a promise of one), or returns `undefined` to fall through to the fake daemon. */
type Intercept = (call: FetchCall) => Response | Promise<Response> | undefined;

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const refusal = (code: string, status: number): Response => json({ code, message: "m", retryable: false }, status);
const pathOf = (call: FetchCall): string => new URL(call.url).pathname;
const methodOf = (call: FetchCall): string => call.init?.method ?? "GET";
const portOf = (call: FetchCall | undefined): string => new URL(call?.url ?? "").port;
const named = (calls: FetchCall[], method: string, path: string): FetchCall[] =>
	calls.filter((call) => methodOf(call) === method && pathOf(call) === path);
const headerOf = (call: FetchCall | undefined, name: string): string | undefined =>
	(call?.init?.headers as Record<string, string> | undefined)?.[name];

function identityResponse(url: string, build: string = SERVER_VERSION): Response {
	const nonce = new URL(url).searchParams.get("nonce") ?? "";
	const proof = createHmac("sha256", SECRET).update(`identity:${nonce}`).digest("hex");
	return json({ proof, server_nonce: SERVER_NONCE, pid: process.pid, build });
}

function fakeDaemon(intercept: Intercept = () => undefined): { fetchImpl: typeof fetch; calls: FetchCall[] } {
	const calls: FetchCall[] = [];
	let mints = 0;
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const call = { url: String(input), init };
		calls.push(call);
		const forced = intercept(call);
		if (forced !== undefined) {
			return forced;
		}
		const path = pathOf(call);
		if (path === "/identity") {
			return identityResponse(call.url);
		}
		if (path === "/session") {
			const binding = { project_id: "prj-example", bot_id: 1, group_id: -100, agent_id: "@claude", roster_hash: ROSTER_HASH };
			mints += 1;
			return methodOf(call) === "DELETE"
				? json({ closed: true })
				: json({ client_id: `client-${mints}`, bearer: bearerFor(mints), binding, conditions: [] });
		}
		const body = JSON.parse(String(init?.body)) as { commit_seq?: number };
		return path === "/channel/cursor" ? json({ inbox_seq: body.commit_seq ?? 4 }) : json(DOORBELL_OK);
	}) as typeof fetch;
	return { fetchImpl, calls };
}

/** Fails the first doorbell route call through `failure` (which may throw), then falls through to the fake daemon. */
function failDoorbellOnce(failure: () => Response): Intercept {
	let failed = false;
	return (call) => {
		if (pathOf(call) !== "/channel/doorbell" || failed) {
			return undefined;
		}
		failed = true;
		return failure();
	};
}

function gate(): { reached: Promise<void>; open: () => void; wait: () => Promise<void> } {
	let open!: () => void;
	let reach!: () => void;
	const passed = new Promise<void>((resolve) => (open = resolve));
	const reached = new Promise<void>((resolve) => (reach = resolve));
	return { reached, open, wait: () => (reach(), passed) };
}

function writeRunFile(homeDir: string, port: number): void {
	mkdirSync(join(homeDir, "run"), { recursive: true });
	writeFileSync(join(homeDir, "run", "daemon.json"), JSON.stringify({ port, pid: process.pid, secret: SECRET }), "utf8");
}

/** Runs `run` against a temp home whose run file names `runFilePort` (`null` = no run file), then removes it. */
async function withHome(run: (homeDir: string) => Promise<void>, runFilePort: number | null = PORT_A): Promise<void> {
	const homeDir = mkdtempSync(join(tmpdir(), "daemon-link-"));
	try {
		if (runFilePort !== null) {
			writeRunFile(homeDir, runFilePort);
		}
		await run(homeDir);
	} finally {
		rmSync(homeDir, { recursive: true, force: true });
	}
}

const linkFor = (homeDir: string, fetchImpl: typeof fetch): DaemonLink => createDaemonLink({ identity: IDENTITY, homeDir, fetchImpl });

/** Awaits a `DaemonLinkError` of `code`; no message may carry a bearer-shaped (64 lowercase hex) string. */
async function rejectsWith(pending: Promise<unknown>, code: DaemonLinkErrorCode): Promise<DaemonLinkError> {
	const err: unknown = await pending.then(() => undefined, (rejection: unknown) => rejection);
	assert.ok(err instanceof DaemonLinkError, `expected DaemonLinkError ${code}, got ${String(err)}`);
	assert.equal(err.code, code);
	assert.doesNotMatch(err.message, /[0-9a-f]{64}/, "the bearer must never reach an error message");
	return err;
}

test("DAEMON_LINK_ERROR_CODES is the closed eight-code vocabulary", () => {
	assert.deepEqual(DAEMON_LINK_ERROR_CODES, [
		"NO_DAEMON", "HANDSHAKE_FAILED", "UNAUTHORIZED", "BINDING_CHANGED", "REFUSED", "TRANSPORT", "MALFORMED", "ABORTED",
	]);
});

test("the handshake is GET /identity then POST /session with the channel host label, then the route call with the bearer", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon();
		const link = linkFor(homeDir, fetchImpl);
		assert.equal(calls.length, 0, "construction is lazy");
		await link.readDoorbell(0, 25);
		assert.deepEqual(calls.map((call) => `${methodOf(call)} ${pathOf(call)}`), ["GET /identity", "POST /session", "POST /channel/doorbell"]);
		assert.equal(headerOf(calls[0], "authorization"), undefined);
		assert.equal((JSON.parse(String(calls[1]?.init?.body)) as { host: string }).host, CHANNEL_HOST_LABEL);
		assert.equal(headerOf(calls[2], "authorization"), `Bearer ${bearerFor(1)}`);
	});
});

test("readDoorbell posts after_seq and timeout_s to the doorbell route and returns the parsed summary", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon();
		const result = await linkFor(homeDir, fetchImpl).readDoorbell(3, 25);
		const call = named(calls, "POST", "/channel/doorbell")[0];
		assert.equal(call?.url, `http://127.0.0.1:${PORT_A}/channel/doorbell`);
		assert.deepEqual(JSON.parse(String(call?.init?.body)), { after_seq: 3, timeout_s: 25 });
		assert.equal(headerOf(call, "content-type"), "application/json");
		assert.deepEqual(result, DOORBELL_OK);
	});
});

test("commitCursor sends an empty body to ensure and read, or commit_seq to advance, and returns inbox_seq", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon();
		const link = linkFor(homeDir, fetchImpl);
		assert.equal(await link.commitCursor(), 4);
		assert.equal(await link.commitCursor(9), 9);
		const bodies = named(calls, "POST", "/channel/cursor").map((call) => JSON.parse(String(call.init?.body)));
		assert.deepEqual(bodies, [{}, { commit_seq: 9 }]);
	});
});

test("a 401 re-handshakes once against a fresh run-file read and retries once on the new port", async () => {
	await withHome(async (homeDir) => {
		const intercept = failDoorbellOnce(() => {
			writeRunFile(homeDir, PORT_B);
			return refusal("SESSION_UNAUTHORIZED", 401);
		});
		const { fetchImpl, calls } = fakeDaemon(intercept);
		assert.deepEqual(await linkFor(homeDir, fetchImpl).readDoorbell(0, 25), DOORBELL_OK);
		assert.equal(named(calls, "GET", "/identity").length, 2);
		assert.equal(named(calls, "POST", "/session").length, 2);
		const attempts = named(calls, "POST", "/channel/doorbell");
		assert.deepEqual(attempts.map(portOf), [String(PORT_A), String(PORT_B)]);
		assert.equal(headerOf(attempts[1], "authorization"), `Bearer ${bearerFor(2)}`);
	});
});

test("a second consecutive 401 throws UNAUTHORIZED with exactly two route calls and no third handshake", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon((call) => (pathOf(call) === "/channel/doorbell" ? refusal("SESSION_UNAUTHORIZED", 401) : undefined));
		await rejectsWith(linkFor(homeDir, fetchImpl).readDoorbell(0, 25), "UNAUTHORIZED");
		assert.equal(named(calls, "POST", "/channel/doorbell").length, 2);
		assert.equal(named(calls, "POST", "/session").length, 2);
	});
});

test("no run file throws NO_DAEMON with zero fetch calls, on every attempt", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon();
		const link = linkFor(homeDir, fetchImpl);
		await rejectsWith(link.readDoorbell(0, 25), "NO_DAEMON");
		await rejectsWith(link.commitCursor(), "NO_DAEMON");
		assert.equal(calls.length, 0);
	}, null);
});

test("a connection failure throws TRANSPORT and clears the cache, so the next call re-reads the run file and re-handshakes", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon(failDoorbellOnce(() => {
			throw new TypeError("fetch failed");
		}));
		const link = linkFor(homeDir, fetchImpl);
		await rejectsWith(link.readDoorbell(0, 25), "TRANSPORT");
		writeRunFile(homeDir, PORT_B);
		await link.readDoorbell(0, 25);
		assert.equal(named(calls, "GET", "/identity").length, 2);
		assert.equal(portOf(named(calls, "POST", "/channel/doorbell")[1]), String(PORT_B));
	});
});

test("a per-request timeout throws TRANSPORT but keeps the cache, so the next call makes no new handshake", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon(failDoorbellOnce(() => {
			throw new DOMException("The operation timed out", "TimeoutError");
		}));
		const link = linkFor(homeDir, fetchImpl);
		await rejectsWith(link.readDoorbell(0, 25), "TRANSPORT");
		await link.readDoorbell(0, 25);
		assert.equal(named(calls, "GET", "/identity").length, 1);
		assert.equal(named(calls, "POST", "/session").length, 1);
	});
});

test("a 409 BINDING_CHANGED throws BINDING_CHANGED without a re-handshake and keeps the cache", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon(failDoorbellOnce(() => refusal("BINDING_CHANGED", 409)));
		const link = linkFor(homeDir, fetchImpl);
		await rejectsWith(link.readDoorbell(0, 25), "BINDING_CHANGED");
		await link.readDoorbell(0, 25);
		assert.equal(named(calls, "GET", "/identity").length, 1);
		assert.equal(named(calls, "POST", "/channel/doorbell").length, 2);
	});
});

const CLASSIFIED: ReadonlyArray<readonly [string, () => Response, DaemonLinkErrorCode, string]> = [
	["a daemon refusal", () => refusal("CURSOR_COMMIT_OUT_OF_RANGE", 400), "REFUSED", "CURSOR_COMMIT_OUT_OF_RANGE"],
	["a 409 carrying another code", () => refusal("WRONG_ROOM", 409), "REFUSED", "WRONG_ROOM"],
	["a non-JSON error body", () => new Response("<html>", { status: 502 }), "MALFORMED", "502"],
	["a 2xx body with an extra key", () => json({ ...DOORBELL_OK, body: "peer text" }), "MALFORMED", "200"],
];

for (const [name, failure, code, mention] of CLASSIFIED) {
	test(`${name} throws ${code} naming ${mention}`, async () => {
		await withHome(async (homeDir) => {
			const { fetchImpl } = fakeDaemon(failDoorbellOnce(failure));
			const err = await rejectsWith(linkFor(homeDir, fetchImpl).readDoorbell(0, 25), code);
			assert.ok(err.message.includes(mention), err.message);
		});
	});
}

test("a handshake failure throws HANDSHAKE_FAILED naming the handshake code, and the next call retries the handshake", async () => {
	await withHome(async (homeDir) => {
		let mismatched = false;
		const { fetchImpl, calls } = fakeDaemon((call) => {
			if (pathOf(call) !== "/identity" || mismatched) {
				return undefined;
			}
			mismatched = true;
			return identityResponse(call.url, "0.0.1-not-real");
		});
		const link = linkFor(homeDir, fetchImpl);
		const err = await rejectsWith(link.readDoorbell(0, 25), "HANDSHAKE_FAILED");
		assert.match(err.message, /DAEMON_VERSION_MISMATCH/);
		await link.readDoorbell(0, 25);
		assert.equal(named(calls, "GET", "/identity").length, 2);
	});
});

test("concurrent callers share one GET /identity and one POST /session", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon();
		const link = linkFor(homeDir, fetchImpl);
		await Promise.all([link.readDoorbell(0, 25), link.commitCursor()]);
		assert.equal(named(calls, "GET", "/identity").length, 1);
		assert.equal(named(calls, "POST", "/session").length, 1);
	});
});

test("a pre-aborted signal throws ABORTED with zero fetch calls", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon();
		await rejectsWith(linkFor(homeDir, fetchImpl).readDoorbell(0, 25, AbortSignal.abort()), "ABORTED");
		assert.equal(calls.length, 0);
	});
});

test("a caller abort mid-flight throws ABORTED", async () => {
	await withHome(async (homeDir) => {
		let reach!: () => void;
		const reached = new Promise<void>((resolve) => (reach = resolve));
		const { fetchImpl } = fakeDaemon((call) => {
			if (pathOf(call) !== "/channel/doorbell") {
				return undefined;
			}
			reach();
			return new Promise<Response>((_, reject) => {
				call.init?.signal?.addEventListener("abort", () => reject(call.init?.signal?.reason));
			});
		});
		const controller = new AbortController();
		const pending = rejectsWith(linkFor(homeDir, fetchImpl).readDoorbell(0, 25, controller.signal), "ABORTED");
		await reached;
		controller.abort();
		await pending;
	});
});

test("close sends one DELETE /session with the bearer and a bounded signal, and later calls throw ABORTED", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon();
		const link = linkFor(homeDir, fetchImpl);
		await link.readDoorbell(0, 25);
		await link.close();
		await link.close();
		const deletes = named(calls, "DELETE", "/session");
		assert.equal(deletes.length, 1);
		assert.equal(portOf(deletes[0]), String(PORT_A));
		assert.equal(headerOf(deletes[0], "authorization"), `Bearer ${bearerFor(1)}`);
		assert.ok(deletes[0]?.init?.signal instanceof AbortSignal);
		const before = calls.length;
		await rejectsWith(link.readDoorbell(0, 25), "ABORTED");
		await rejectsWith(link.commitCursor(), "ABORTED");
		assert.equal(calls.length, before);
	});
});

test("close never throws when the DELETE is rejected or answers 401, and never re-handshakes", async () => {
	const replies: Array<() => Response> = [
		() => {
			throw new TypeError("fetch failed");
		},
		() => refusal("SESSION_UNAUTHORIZED", 401),
	];
	for (const reply of replies) {
		await withHome(async (homeDir) => {
			const { fetchImpl, calls } = fakeDaemon((call) => (methodOf(call) === "DELETE" ? reply() : undefined));
			const link = linkFor(homeDir, fetchImpl);
			await link.readDoorbell(0, 25);
			await link.close();
			assert.equal(named(calls, "POST", "/session").length, 1);
			assert.equal(named(calls, "DELETE", "/session").length, 1);
		});
	}
});

test("close is a no-op with zero fetch calls when no session was ever minted", async () => {
	await withHome(async (homeDir) => {
		const { fetchImpl, calls } = fakeDaemon();
		await linkFor(homeDir, fetchImpl).close();
		assert.equal(calls.length, 0);
	});
});

test("close awaits an in-flight handshake, deletes the session it minted, and the racing call throws ABORTED", async () => {
	await withHome(async (homeDir) => {
		const held = gate();
		const { fetchImpl, calls } = fakeDaemon((call) =>
			pathOf(call) === "/identity" ? held.wait().then(() => identityResponse(call.url)) : undefined,
		);
		const link = linkFor(homeDir, fetchImpl);
		const racing = rejectsWith(link.readDoorbell(0, 25), "ABORTED");
		await held.reached;
		const closing = link.close();
		held.open();
		await closing;
		await racing;
		const deletes = named(calls, "DELETE", "/session");
		assert.equal(deletes.length, 1);
		assert.equal(headerOf(deletes[0], "authorization"), `Bearer ${bearerFor(1)}`);
		assert.equal(named(calls, "POST", "/channel/doorbell").length, 0);
	});
});

test("channel/daemon-link.ts stays inside the adapter closure: no spawn, timer, loop or fs, both bounds pinned, imports allow-listed", () => {
	const source = readFileSync(`${REPO_ROOT}channel/daemon-link.ts`, "utf8");
	assert.equal(hasChildProcessReference(source), false);
	assert.equal(hasAutonomousTimerReference(source), false);
	assert.equal(hasTimersModuleReference(source), false);
	assert.equal(hasUnboundedLoopReference(source), false);
	assert.equal(hasFsModuleReference(source), false);
	assert.ok(source.includes("AbortSignal.timeout(IPC_REQUEST_TIMEOUT_MS)"), "the per-request bound is pinned");
	assert.ok(source.includes("AbortSignal.timeout(CHANNEL_SHUTDOWN_TIMEOUT_MS)"), "the shutdown bound is pinned");
	const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "");
	assert.ok(specifiers.length >= 5, "non-vacuous: the scan must see the module's imports");
	for (const specifier of specifiers) {
		assert.match(specifier, ALLOWED_SPECIFIER);
	}
});
