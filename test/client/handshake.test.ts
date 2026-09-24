import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HANDSHAKE_ERROR_CODES,
  HandshakeError,
  performHandshake,
  type HandshakeErrorCode,
} from "../../src/client/handshake.js";
import { DaemonSpawnTimeoutError } from "../../src/client/run-state.js";
import { SERVER_VERSION } from "../../src/shared/version.js";

const ROSTER_HASH = `sha256:${"d".repeat(64)}`;

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/** Records every call and dispatches to `handler`, which answers by URL (`/identity` vs `/session`). */
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

/** A fetch that throws on any call, tracking whether it was ever invoked. */
function createThrowingFetch(): { fetchImpl: typeof globalThis.fetch; callCount: () => number } {
  let count = 0;
  const fetchImpl = (async (): Promise<Response> => {
    count += 1;
    throw new Error("fetch must not be called");
  }) as typeof globalThis.fetch;
  return { fetchImpl, callCount: () => count };
}

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

const SESSION_IDENTITY = {
  projectId: "prj-example",
  groupId: -100,
  rosterHash: ROSTER_HASH,
  host: "claude-code",
};

test("HANDSHAKE_ERROR_CODES is the closed four-code vocabulary this slice authors", () => {
  assert.deepEqual(HANDSHAKE_ERROR_CODES, [
    "DAEMON_DOWN",
    "DAEMON_IDENTITY_MISMATCH",
    "DAEMON_VERSION_MISMATCH",
    "IPC_ERROR",
  ]);
  const codes: readonly HandshakeErrorCode[] = HANDSHAKE_ERROR_CODES;
  assert.equal(codes.length, 4);
});

test("performHandshake raises DAEMON_DOWN and makes zero fetch calls when ensureDaemonRunning cannot confirm a live daemon", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "handshake-down-"));
  const { fetchImpl, callCount } = createThrowingFetch();

  try {
    await assert.rejects(
      () =>
        performHandshake({
          ...SESSION_IDENTITY,
          homeDir,
          ensureDaemonRunningImpl: async () => {
            throw new DaemonSpawnTimeoutError();
          },
          fetchImpl,
        }),
      (err: unknown) => {
        assert.ok(err instanceof HandshakeError);
        assert.equal((err as HandshakeError).code, "DAEMON_DOWN");
        assert.equal((err as HandshakeError).retryable, true);
        return true;
      },
    );

    assert.equal(callCount(), 0, "DAEMON_DOWN must make zero network calls");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("performHandshake sends no Authorization header on GET /identity, verifies the proof, and returns the daemon's session response", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "handshake-happy-"));
  const secret = "real-secret-1";
  const port = 5555;

  try {
    const { fetchImpl, calls } = createFakeFetch((url, init) => {
      if (url.includes("/identity")) {
        const nonce = nonceFromUrl(url);
        return new Response(
          JSON.stringify({
            proof: identityProof(secret, nonce),
            server_nonce: "b".repeat(64),
            pid: process.pid,
            build: SERVER_VERSION,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/session")) {
        const body = JSON.parse(String(init?.body)) as { server_nonce: string; hmac: string };
        assert.equal(body.hmac, sessionProof(secret, body.server_nonce), "POST /session must carry the correct session hmac");
        return new Response(
          JSON.stringify({
            client_id: "client-1",
            bearer: "c".repeat(64),
            binding: {
              project_id: "prj-example",
              bot_id: 1,
              group_id: -100,
              agent_id: "@claude",
              roster_hash: ROSTER_HASH,
            },
            conditions: [],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const result = await performHandshake({
      ...SESSION_IDENTITY,
      homeDir,
      ensureDaemonRunningImpl: async () => ({ port, pid: process.pid, secret }),
      fetchImpl,
    });

    assert.equal(result.client_id, "client-1");
    assert.equal(result.bearer, "c".repeat(64));
    assert.equal(result.binding.project_id, "prj-example");

    const identityCall = calls.find((call) => call.url.includes("/identity"));
    assert.ok(identityCall, "expected a GET /identity call");
    const headers = identityCall?.init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.["Authorization"], undefined);
    assert.equal(headers?.["authorization"], undefined);

    assert.equal(calls.filter((call) => call.url.includes("/identity")).length, 1);
    assert.equal(calls.filter((call) => call.url.includes("/session")).length, 1);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("performHandshake retries GET /identity once on a proof mismatch, using the re-read run file's secret, and no bearer is lost", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "handshake-retry-"));
  const runDir = join(homeDir, "run");
  const port = 6001;
  const staleSecret = "stale-secret";
  const freshSecret = "fresh-secret";

  try {
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "daemon.json"), JSON.stringify({ port, pid: process.pid, secret: staleSecret }), "utf8");

    let identityCallCount = 0;
    const { fetchImpl, calls } = createFakeFetch((url, init) => {
      if (url.includes("/identity")) {
        identityCallCount += 1;
        const nonce = nonceFromUrl(url);
        if (identityCallCount === 1) {
          // Simulate a daemon restart landing between our first read and this response: the run
          // file now carries a fresh secret, but this first response is still signed with a secret
          // this client's first read never saw, so local verification fails and a retry is required.
          writeFileSync(join(runDir, "daemon.json"), JSON.stringify({ port, pid: process.pid, secret: freshSecret }), "utf8");
          return new Response(
            JSON.stringify({
              proof: identityProof("a-secret-the-client-never-saw", nonce),
              server_nonce: "b".repeat(64),
              pid: process.pid,
              build: SERVER_VERSION,
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            proof: identityProof(freshSecret, nonce),
            server_nonce: "b".repeat(64),
            pid: process.pid,
            build: SERVER_VERSION,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/session")) {
        const body = JSON.parse(String(init?.body)) as { server_nonce: string; hmac: string };
        assert.equal(body.hmac, sessionProof(freshSecret, body.server_nonce), "POST /session must use the re-read secret");
        return new Response(
          JSON.stringify({
            client_id: "client-1",
            bearer: "c".repeat(64),
            binding: { project_id: "prj-example", bot_id: 1, group_id: -100, agent_id: "@claude", roster_hash: ROSTER_HASH },
            conditions: [],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const result = await performHandshake({
      ...SESSION_IDENTITY,
      homeDir,
      ensureDaemonRunningImpl: async () => ({ port, pid: process.pid, secret: staleSecret }),
      fetchImpl,
    });

    assert.equal(result.client_id, "client-1");
    assert.equal(identityCallCount, 2, "must retry GET /identity exactly once after a mismatch");
    assert.equal(calls.filter((call) => call.url.includes("/session")).length, 1, "must call POST /session exactly once, after the retry succeeds");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("performHandshake raises DAEMON_IDENTITY_MISMATCH and never calls POST /session when the retry also fails", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "handshake-mismatch-"));
  const runDir = join(homeDir, "run");
  const port = 6002;

  try {
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "daemon.json"), JSON.stringify({ port, pid: process.pid, secret: "real-secret" }), "utf8");

    const { fetchImpl, calls } = createFakeFetch((url) => {
      if (url.includes("/identity")) {
        const nonce = nonceFromUrl(url);
        return new Response(
          JSON.stringify({
            proof: identityProof("attacker-secret", nonce),
            server_nonce: "b".repeat(64),
            pid: process.pid,
            build: SERVER_VERSION,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    await assert.rejects(
      () =>
        performHandshake({
          ...SESSION_IDENTITY,
          homeDir,
          ensureDaemonRunningImpl: async () => ({ port, pid: process.pid, secret: "real-secret" }),
          fetchImpl,
        }),
      (err: unknown) => {
        assert.ok(err instanceof HandshakeError);
        assert.equal((err as HandshakeError).code, "DAEMON_IDENTITY_MISMATCH");
        assert.equal((err as HandshakeError).retryable, true);
        return true;
      },
    );

    assert.equal(calls.filter((call) => call.url.includes("/identity")).length, 2, "must attempt GET /identity twice (initial + one retry)");
    assert.equal(calls.filter((call) => call.url.includes("/session")).length, 0, "no bearer sent: POST /session must never be called");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("performHandshake raises DAEMON_DOWN, not DAEMON_IDENTITY_MISMATCH, when GET /identity is unreachable on both attempts", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "handshake-unreachable-"));
  const runDir = join(homeDir, "run");
  const port = 6100;

  try {
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "daemon.json"), JSON.stringify({ port, pid: process.pid, secret: "real-secret" }), "utf8");

    let identityCallCount = 0;
    const fetchImpl = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/identity")) {
        identityCallCount += 1;
        throw new Error("ECONNREFUSED (simulated)");
      }
      throw new Error(`unexpected fetch to ${url}`);
    }) as typeof globalThis.fetch;

    await assert.rejects(
      () =>
        performHandshake({
          ...SESSION_IDENTITY,
          homeDir,
          ensureDaemonRunningImpl: async () => ({ port, pid: process.pid, secret: "real-secret" }),
          fetchImpl,
        }),
      (err: unknown) => {
        assert.ok(err instanceof HandshakeError);
        assert.equal((err as HandshakeError).code, "DAEMON_DOWN");
        assert.equal((err as HandshakeError).retryable, true);
        return true;
      },
    );

    assert.equal(identityCallCount, 2, "must attempt GET /identity twice (initial + one re-read retry) before giving up");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("performHandshake raises DAEMON_DOWN when GET /identity is unreachable and the re-read finds no live run file at all", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "handshake-unreachable-noreread-"));
  const port = 6101;

  try {
    // No run/daemon.json written anywhere under homeDir: the re-read after the first failed
    // attempt finds nothing, so the retry never happens at all.
    let identityCallCount = 0;
    const fetchImpl = (async (): Promise<Response> => {
      identityCallCount += 1;
      throw new Error("ECONNREFUSED (simulated)");
    }) as typeof globalThis.fetch;

    await assert.rejects(
      () =>
        performHandshake({
          ...SESSION_IDENTITY,
          homeDir,
          ensureDaemonRunningImpl: async () => ({ port, pid: process.pid, secret: "real-secret" }),
          fetchImpl,
        }),
      (err: unknown) => {
        assert.ok(err instanceof HandshakeError);
        assert.equal((err as HandshakeError).code, "DAEMON_DOWN");
        return true;
      },
    );

    assert.equal(identityCallCount, 1, "no live run file on re-read must stop after the initial attempt, no second GET /identity");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("performHandshake raises DAEMON_VERSION_MISMATCH and never calls POST /session when the daemon's build does not match SERVER_VERSION", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "handshake-version-"));
  const secret = "real-secret-2";
  const port = 7000;

  try {
    const { fetchImpl, calls } = createFakeFetch((url) => {
      if (url.includes("/identity")) {
        const nonce = nonceFromUrl(url);
        return new Response(
          JSON.stringify({
            proof: identityProof(secret, nonce),
            server_nonce: "b".repeat(64),
            pid: process.pid,
            build: "0.0.1-not-real",
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    await assert.rejects(
      () =>
        performHandshake({
          ...SESSION_IDENTITY,
          homeDir,
          ensureDaemonRunningImpl: async () => ({ port, pid: process.pid, secret }),
          fetchImpl,
        }),
      (err: unknown) => {
        assert.ok(err instanceof HandshakeError);
        assert.equal((err as HandshakeError).code, "DAEMON_VERSION_MISMATCH");
        assert.equal((err as HandshakeError).retryable, false);
        return true;
      },
    );

    assert.equal(calls.filter((call) => call.url.includes("/session")).length, 0, "no session request once a version mismatch is detected");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});
