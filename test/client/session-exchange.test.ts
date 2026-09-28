import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as handshake from "../../src/client/handshake.js";
import {
  exchangeSession,
  HANDSHAKE_ERROR_CODES,
  HandshakeError,
  type HandshakeErrorCode,
} from "../../src/client/session-exchange.js";
import { SERVER_VERSION } from "../../src/shared/version.js";
import { computeClosure } from "../security/closure.js";

const ROSTER_HASH = `sha256:${"d".repeat(64)}`;
const SERVER_NONCE = "b".repeat(64);
const BEARER = "c".repeat(64);

const IDENTITY = { projectId: "prj-example", groupId: -100, rosterHash: ROSTER_HASH, host: "claude-code-channel" };

function identityProof(secret: string, nonce: string): string {
  return createHmac("sha256", secret).update(`identity:${nonce}`).digest("hex");
}

function sessionProof(secret: string, serverNonce: string): string {
  return createHmac("sha256", secret).update(`session:${serverNonce}`).digest("hex");
}

function nonceFromUrl(url: string): string {
  const nonce = new URL(url).searchParams.get("nonce");
  assert.ok(nonce, "expected a nonce query parameter");
  return nonce;
}

function identityBody(secret: string, nonce: string, build: string = SERVER_VERSION): string {
  return JSON.stringify({ proof: identityProof(secret, nonce), server_nonce: SERVER_NONCE, pid: process.pid, build });
}

const SESSION_BODY = JSON.stringify({
  client_id: "client-1",
  bearer: BEARER,
  binding: { project_id: "prj-example", bot_id: 1, group_id: -100, agent_id: "@claude", roster_hash: ROSTER_HASH },
  conditions: [],
});

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

const countCalls = (calls: FetchCall[], path: string): number => calls.filter((c) => c.url.includes(path)).length;

test("HANDSHAKE_ERROR_CODES is the closed four-code vocabulary, and HandshakeError derives retryable from its code", () => {
  assert.deepEqual(HANDSHAKE_ERROR_CODES, ["DAEMON_DOWN", "DAEMON_IDENTITY_MISMATCH", "DAEMON_VERSION_MISMATCH", "IPC_ERROR"]);
  const expected: Record<HandshakeErrorCode, boolean> = {
    DAEMON_DOWN: true,
    DAEMON_IDENTITY_MISMATCH: true,
    DAEMON_VERSION_MISMATCH: false,
    IPC_ERROR: true,
  };
  for (const code of HANDSHAKE_ERROR_CODES) {
    const err = new HandshakeError(code, "m");
    assert.equal(err.retryable, expected[code], code);
    assert.equal(err.name, "HandshakeError");
  }
});

test("handshake.ts re-exports the moved names by identity", () => {
  assert.equal(handshake.HandshakeError, HandshakeError);
  assert.equal(handshake.HANDSHAKE_ERROR_CODES, HANDSHAKE_ERROR_CODES);
  assert.equal(handshake.exchangeSession, exchangeSession);
});

test("exchangeSession sends an unauthenticated GET /identity, then a POST /session carrying the identity fields and the correct session hmac", async () => {
  const secret = "exchange-secret";
  const { fetchImpl, calls } = createFakeFetch((url, init) => {
    if (url.includes("/identity")) {
      return new Response(identityBody(secret, nonceFromUrl(url)), { status: 200 });
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(url, "http://127.0.0.1:5555/session");
    assert.equal(body["hmac"], sessionProof(secret, SERVER_NONCE));
    assert.equal(body["server_nonce"], SERVER_NONCE);
    assert.equal(body["project_id"], IDENTITY.projectId);
    assert.equal(body["group_id"], IDENTITY.groupId);
    assert.equal(body["roster_hash"], IDENTITY.rosterHash);
    assert.equal(body["host"], IDENTITY.host);
    assert.equal(body["pid"], process.pid);
    return new Response(SESSION_BODY, { status: 200 });
  });

  const result = await exchangeSession({ port: 5555, pid: process.pid, secret }, IDENTITY, { fetchImpl });

  assert.equal(result.client_id, "client-1");
  assert.equal(result.bearer, BEARER);
  assert.equal(calls[0]?.url.includes("/identity"), true, "GET /identity happens first, inside exchangeSession");
  const headers = calls[0]?.init?.headers as Record<string, string> | undefined;
  assert.equal(headers?.["Authorization"], undefined);
  assert.equal(countCalls(calls, "/session"), 1);
});

test("exchangeSession retries GET /identity once against the re-read run file's secret after a proof mismatch", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "exchange-retry-"));
  const runDir = join(homeDir, "run");
  const freshSecret = "fresh-secret";
  try {
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "daemon.json"), JSON.stringify({ port: 6001, pid: process.pid, secret: freshSecret }), "utf8");

    let identityCalls = 0;
    const { fetchImpl, calls } = createFakeFetch((url, init) => {
      if (url.includes("/identity")) {
        identityCalls += 1;
        const secret = identityCalls === 1 ? "a-secret-the-client-never-saw" : freshSecret;
        return new Response(identityBody(secret, nonceFromUrl(url)), { status: 200 });
      }
      const body = JSON.parse(String(init?.body)) as { hmac: string; server_nonce: string };
      assert.equal(body.hmac, sessionProof(freshSecret, body.server_nonce), "POST /session must use the re-read secret");
      return new Response(SESSION_BODY, { status: 200 });
    });

    const result = await exchangeSession({ port: 6001, pid: process.pid, secret: "stale-secret" }, IDENTITY, { homeDir, fetchImpl });

    assert.equal(result.client_id, "client-1");
    assert.equal(identityCalls, 2);
    assert.equal(countCalls(calls, "/session"), 1);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("exchangeSession raises DAEMON_IDENTITY_MISMATCH after the retry also fails its proof, and never calls POST /session", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "exchange-mismatch-"));
  try {
    mkdirSync(join(homeDir, "run"), { recursive: true });
    writeFileSync(join(homeDir, "run", "daemon.json"), JSON.stringify({ port: 6002, pid: process.pid, secret: "real" }), "utf8");
    const { fetchImpl, calls } = createFakeFetch((url) => new Response(identityBody("attacker", nonceFromUrl(url)), { status: 200 }));

    await assert.rejects(
      () => exchangeSession({ port: 6002, pid: process.pid, secret: "real" }, IDENTITY, { homeDir, fetchImpl }),
      (err: unknown) => err instanceof HandshakeError && err.code === "DAEMON_IDENTITY_MISMATCH",
    );
    assert.equal(countCalls(calls, "/identity"), 2);
    assert.equal(countCalls(calls, "/session"), 0);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("exchangeSession raises DAEMON_DOWN with no second GET /identity when the first attempt fails and the re-read finds no live run file", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "exchange-noreread-"));
  try {
    let identityCalls = 0;
    const fetchImpl = (async (): Promise<Response> => {
      identityCalls += 1;
      throw new Error("ECONNREFUSED (simulated)");
    }) as typeof globalThis.fetch;

    await assert.rejects(
      () => exchangeSession({ port: 6101, pid: process.pid, secret: "s" }, IDENTITY, { homeDir, fetchImpl }),
      (err: unknown) => err instanceof HandshakeError && err.code === "DAEMON_DOWN" && err.retryable,
    );
    assert.equal(identityCalls, 1);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("exchangeSession raises DAEMON_VERSION_MISMATCH before POST /session when the verified daemon build differs from SERVER_VERSION", async () => {
  const secret = "version-secret";
  const { fetchImpl, calls } = createFakeFetch((url) => new Response(identityBody(secret, nonceFromUrl(url), "0.0.1-not-real"), { status: 200 }));

  await assert.rejects(
    () => exchangeSession({ port: 7000, pid: process.pid, secret }, IDENTITY, { fetchImpl }),
    (err: unknown) => err instanceof HandshakeError && err.code === "DAEMON_VERSION_MISMATCH" && !err.retryable,
  );
  assert.equal(countCalls(calls, "/session"), 0);
});

test("exchangeSession folds a non-OK POST /session into DAEMON_DOWN", async () => {
  const secret = "session-fail-secret";
  const { fetchImpl } = createFakeFetch((url) =>
    url.includes("/identity") ? new Response(identityBody(secret, nonceFromUrl(url)), { status: 200 }) : new Response("nope", { status: 500 }),
  );

  await assert.rejects(
    () => exchangeSession({ port: 7001, pid: process.pid, secret }, IDENTITY, { fetchImpl }),
    (err: unknown) => err instanceof HandshakeError && err.code === "DAEMON_DOWN",
  );
});

/** A module specifier naming `child_process` (bare or `node:`-prefixed) in a `from`, bare-import, or dynamic-import position; prose in comments does not match. */
const CHILD_PROCESS_IMPORT_RE = /(?:from\s+|import\s*\(?\s*)["'](?:node:)?child_process["']/;

test("the run-file.ts and session-exchange.ts import closures contain no spawn capability (PR-06 bundle-closure prerequisite)", () => {
  // dist/test/client/session-exchange.test.js -> compiled siblings live in dist/src/client/.
  const clientDist = fileURLToPath(new URL("../../src/client/", import.meta.url));
  const forbiddenModules = new Set(["spawn.js", "run-state.js"]);

  for (const entry of ["run-file.js", "session-exchange.js"]) {
    for (const file of computeClosure(join(clientDist, entry))) {
      assert.equal(forbiddenModules.has(basename(file)), false, `${entry} must not reach ${basename(file)}`);
      assert.equal(CHILD_PROCESS_IMPORT_RE.test(readFileSync(file, "utf8")), false, `${entry} closure must not reference child_process (${basename(file)})`);
    }
  }
});
