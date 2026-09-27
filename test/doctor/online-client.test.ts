import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runOnlineDoctor } from "../../src/doctor/online-client.js";
import { computeIdentityProof } from "../../src/daemon/ipc/handshake.js";
import { computeDoctorProof } from "../../src/daemon/ipc/doctor.js";
import { writeRunFile, type DaemonRunPayload } from "../../src/daemon/lifecycle/run-file.js";
import { SERVER_VERSION } from "../../src/shared/version.js";

/**
 * `doctor/online-client.ts` (PR-17, design §9.2 D-44, tasks.md 17.5). New code — no v1 range — so this
 * twin needs no `test/fixtures/v1-provenance.json` entry.
 *
 * Fetch fake mirrors `test/client/handshake.test.ts`'s own `createFakeFetch`/`createThrowingFetch`
 * convention (disclosed duplication, same reason: no project-reference path lets this module import a
 * shared test helper across the `client`/`doctor` compile-unit boundary either). Run-file setup writes
 * a REAL `run/daemon.json` via `daemon/lifecycle/run-file.ts`'s own `writeRunFile` rather than
 * hand-rolling the JSON shape, since `doctor`'s tsconfig already references `../daemon`.
 */

interface FetchCall {
	readonly url: string;
	readonly init: RequestInit | undefined;
}

function createFakeFetch(handler: (url: string, init: RequestInit | undefined) => Response): {
	fetchImpl: typeof globalThis.fetch;
	calls: FetchCall[];
} {
	const calls: FetchCall[] = [];
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = typeof input === "string" ? input : input.toString();
		calls.push({ url, init });
		return handler(url, init);
	}) as typeof globalThis.fetch;
	return { fetchImpl, calls };
}

function createThrowingFetch(): { fetchImpl: typeof globalThis.fetch; callCount: () => number } {
	let count = 0;
	const fetchImpl = (async (): Promise<Response> => {
		count += 1;
		throw new Error("fetch must not be called");
	}) as typeof globalThis.fetch;
	return { fetchImpl, callCount: () => count };
}

function writeLiveRunFile(homeDir: string, port: number): DaemonRunPayload {
	const runDir = join(homeDir, "run");
	mkdirSync(runDir, { recursive: true });
	return writeRunFile(runDir, port);
}

function nonceFromUrl(url: string): string {
	const nonce = new URL(url).searchParams.get("nonce");
	assert.ok(nonce, "expected a nonce query parameter");
	return nonce;
}

const VALID_DOCTOR_RESPONSE = {
	bindings: [{ project_id: "prj-example", checks: [{ id: "bot-identity", status: "pass", detail: "ok" }] }],
};

/** A fake `GET /identity` handler signed with `secret`, using a fixed `server_nonce`. */
function identityResponder(secret: string, serverNonce: string) {
	return (url: string): Response => {
		const nonce = nonceFromUrl(url);
		return new Response(
			JSON.stringify({ proof: computeIdentityProof(secret, nonce), server_nonce: serverNonce, pid: process.pid, build: SERVER_VERSION }),
			{ status: 200 },
		);
	};
}

async function withTempHome(run: (homeDir: string) => Promise<void>): Promise<void> {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-online-client-"));
	try {
		await run(homeDir);
	} finally {
		rmSync(homeDir, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// Never spawns a daemon
// ---------------------------------------------------------------------------

test("resolves 'skipped' and makes zero fetch calls when no daemon is running", async () => {
	await withTempHome(async (homeDir) => {
		const { fetchImpl, callCount } = createThrowingFetch();
		const result = await runOnlineDoctor({ homeDir, fetchImpl });
		assert.deepEqual(result, { status: "skipped" });
		assert.equal(callCount(), 0);
	});
});

test("dmProbe without projectId resolves 'error' before any fetch call, mirroring POST /doctor's own cross-field rule", async () => {
	await withTempHome(async (homeDir) => {
		const { fetchImpl, callCount } = createThrowingFetch();
		const result = await runOnlineDoctor({ homeDir, dmProbe: true, fetchImpl });
		assert.equal(result.status, "error");
		assert.equal(callCount(), 0, "no daemon liveness check and no network call for a request the daemon would refuse anyway");
	});
});

// ---------------------------------------------------------------------------
// Full round trip
// ---------------------------------------------------------------------------

test("a full round trip verifies the identity proof and posts the correctly-labelled doctor hmac, scoped to project_id and dm_probe", async () => {
	await withTempHome(async (homeDir) => {
		const runPayload = writeLiveRunFile(homeDir, 5601);
		const serverNonce = "b".repeat(64);

		const { fetchImpl, calls } = createFakeFetch((url, init) => {
			if (url.includes("/identity")) {
				return identityResponder(runPayload.secret, serverNonce)(url);
			}
			if (url.includes("/doctor")) {
				const body = JSON.parse(String(init?.body)) as {
					server_nonce: string;
					hmac: string;
					project_id?: string;
					dm_probe: boolean;
				};
				assert.equal(body.server_nonce, serverNonce);
				assert.equal(body.hmac, computeDoctorProof(runPayload.secret, serverNonce), "must carry the 'doctor:'-labelled proof, not 'identity:' or 'session:'");
				assert.equal(body.project_id, "prj-example");
				assert.equal(body.dm_probe, true);
				return new Response(JSON.stringify(VALID_DOCTOR_RESPONSE), { status: 200 });
			}
			throw new Error(`unexpected fetch to ${url}`);
		});

		const result = await runOnlineDoctor({ homeDir, projectId: "prj-example", dmProbe: true, fetchImpl });
		assert.equal(result.status, "ok");
		assert.deepEqual(result.status === "ok" ? result.response : undefined, VALID_DOCTOR_RESPONSE);
		assert.equal(calls.filter((c) => c.url.includes("/identity")).length, 1);
		assert.equal(calls.filter((c) => c.url.includes("/doctor")).length, 1);
	});
});

test("an unscoped run (no projectId, dm_probe false) omits project_id from the request body entirely", async () => {
	await withTempHome(async (homeDir) => {
		const runPayload = writeLiveRunFile(homeDir, 5602);
		const serverNonce = "c".repeat(64);

		const { fetchImpl } = createFakeFetch((url, init) => {
			if (url.includes("/identity")) {
				return identityResponder(runPayload.secret, serverNonce)(url);
			}
			if (url.includes("/doctor")) {
				const rawBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
				assert.equal("project_id" in rawBody, false, "project_id must be entirely absent, not merely undefined");
				assert.equal(rawBody.dm_probe, false);
				return new Response(JSON.stringify({ bindings: [] }), { status: 200 });
			}
			throw new Error(`unexpected fetch to ${url}`);
		});

		const result = await runOnlineDoctor({ homeDir, fetchImpl });
		assert.deepEqual(result, { status: "ok", response: { bindings: [] } });
	});
});

// ---------------------------------------------------------------------------
// GET /identity failure modes
// ---------------------------------------------------------------------------

test("GET /identity transport failure resolves 'error' naming the failed call", async () => {
	await withTempHome(async (homeDir) => {
		writeLiveRunFile(homeDir, 5603);
		const fetchImpl = (async () => {
			throw new Error("ECONNREFUSED");
		}) as typeof globalThis.fetch;
		const result = await runOnlineDoctor({ homeDir, fetchImpl });
		assert.equal(result.status, "error");
		assert.ok(result.status === "error" && result.message.includes("GET /identity failed"));
	});
});

test("GET /identity non-OK status resolves 'error'", async () => {
	await withTempHome(async (homeDir) => {
		writeLiveRunFile(homeDir, 5604);
		const { fetchImpl } = createFakeFetch(() => new Response("nope", { status: 500 }));
		const result = await runOnlineDoctor({ homeDir, fetchImpl });
		assert.equal(result.status, "error");
		assert.ok(result.status === "error" && result.message.includes("HTTP 500"));
	});
});

test("GET /identity schema-invalid body resolves 'error'", async () => {
	await withTempHome(async (homeDir) => {
		writeLiveRunFile(homeDir, 5605);
		const { fetchImpl } = createFakeFetch(() => new Response(JSON.stringify({ nonsense: true }), { status: 200 }));
		const result = await runOnlineDoctor({ homeDir, fetchImpl });
		assert.equal(result.status, "error");
		assert.ok(result.status === "error" && result.message.includes("does not match its schema"));
	});
});

test("an identity proof signed with the wrong secret resolves 'error' naming the proof, not a false 'ok'", async () => {
	await withTempHome(async (homeDir) => {
		const runPayload = writeLiveRunFile(homeDir, 5606);
		const serverNonce = "d".repeat(64);
		const { fetchImpl } = createFakeFetch((url) => identityResponder("a-secret-the-client-never-saw", serverNonce)(url));
		assert.notEqual(runPayload.secret, "a-secret-the-client-never-saw");
		const result = await runOnlineDoctor({ homeDir, fetchImpl });
		assert.equal(result.status, "error");
		assert.ok(result.status === "error" && result.message.includes("proof did not verify"));
	});
});

// ---------------------------------------------------------------------------
// POST /doctor failure modes
// ---------------------------------------------------------------------------

test("POST /doctor transport failure resolves 'error' naming the failed call", async () => {
	await withTempHome(async (homeDir) => {
		const runPayload = writeLiveRunFile(homeDir, 5607);
		const serverNonce = "e".repeat(64);
		const { fetchImpl } = createFakeFetch((url) => {
			if (url.includes("/identity")) return identityResponder(runPayload.secret, serverNonce)(url);
			throw new Error("ECONNRESET");
		});
		const result = await runOnlineDoctor({ homeDir, fetchImpl });
		assert.equal(result.status, "error");
		assert.ok(result.status === "error" && result.message.includes("POST /doctor failed"));
	});
});

test("POST /doctor non-OK status resolves 'error'", async () => {
	await withTempHome(async (homeDir) => {
		const runPayload = writeLiveRunFile(homeDir, 5608);
		const serverNonce = "f".repeat(64);
		const { fetchImpl } = createFakeFetch((url) => {
			if (url.includes("/identity")) return identityResponder(runPayload.secret, serverNonce)(url);
			return new Response("nope", { status: 401 });
		});
		const result = await runOnlineDoctor({ homeDir, fetchImpl });
		assert.equal(result.status, "error");
		assert.ok(result.status === "error" && result.message.includes("HTTP 401"));
	});
});

test("POST /doctor schema-invalid body resolves 'error'", async () => {
	await withTempHome(async (homeDir) => {
		const runPayload = writeLiveRunFile(homeDir, 5609);
		const serverNonce = "0".repeat(64);
		const { fetchImpl } = createFakeFetch((url) => {
			if (url.includes("/identity")) return identityResponder(runPayload.secret, serverNonce)(url);
			return new Response(JSON.stringify({ nonsense: true }), { status: 200 });
		});
		const result = await runOnlineDoctor({ homeDir, fetchImpl });
		assert.equal(result.status, "error");
		assert.ok(result.status === "error" && result.message.includes("does not match its schema"));
	});
});
