import { test } from "node:test";
import assert from "node:assert/strict";

import { HandshakeError } from "../../src/client/handshake.js";
import { createIpcSession, IpcTransportError } from "../../src/client/ipc-stub.js";
import type { DaemonRunPayload } from "../../src/client/run-state.js";
import { IPC_LOOPBACK_HOST, type SessionResponse } from "../../src/shared/ipc-contract.js";
import { IPC_REQUEST_TIMEOUT_MS } from "../../src/shared/constants.js";

const IDENTITY = {
  projectId: "prj-example",
  groupId: -100,
  rosterHash: `sha256:${"d".repeat(64)}`,
  host: "claude-code",
};

const RUN_PAYLOAD: DaemonRunPayload = { port: 4123, pid: process.pid, secret: "unused-secret" };

const SESSION_RESPONSE: SessionResponse = {
  client_id: "client-1",
  bearer: "b".repeat(64),
  binding: {
    project_id: "prj-example",
    bot_id: 1,
    group_id: -100,
    agent_id: "@claude",
    roster_hash: IDENTITY.rosterHash,
  },
  conditions: [],
};

/** Builds a session with fake collaborators; every test overrides at least `fetchImpl`. */
function session(overrides: {
  ensureDaemonRunningImpl?: () => Promise<DaemonRunPayload>;
  performHandshakeImpl?: () => Promise<SessionResponse>;
  fetchImpl: typeof fetch;
}) {
  return createIpcSession({
    ...IDENTITY,
    ensureDaemonRunningImpl: overrides.ensureDaemonRunningImpl ?? (async () => RUN_PAYLOAD),
    performHandshakeImpl: overrides.performHandshakeImpl ?? (async () => SESSION_RESPONSE),
    fetchImpl: overrides.fetchImpl,
  });
}

test("callTool returns {ok:true, data} on a 200 response parsing as a tool success body", async () => {
  const s = session({ fetchImpl: (async () => new Response(JSON.stringify({ hello: "world" }), { status: 200 })) as typeof fetch });
  const result = await s.callTool("POST /tools/status", {});
  assert.deepEqual(result, { ok: true, data: { hello: "world" } });
});

test("callTool returns {ok:false, error} on a non-2xx response parsing as an ipcErrorSchema body", async () => {
  const errorBody = { code: "UNBOUND_PROJECT", message: "no active binding", retryable: false };
  const s = session({ fetchImpl: (async () => new Response(JSON.stringify(errorBody), { status: 404 })) as typeof fetch });
  const result = await s.callTool("POST /tools/send", { type: "BROADCAST", body: "hi" });
  assert.deepEqual(result, { ok: false, error: errorBody });
});

test("callTool throws IpcTransportError when fetch itself throws (network failure)", async () => {
  const s = session({
    fetchImpl: (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch,
  });
  await assert.rejects(() => s.callTool("POST /tools/status", {}), IpcTransportError);
});

test("callTool throws IpcTransportError when the response body parses as neither schema", async () => {
  const s = session({ fetchImpl: (async () => new Response(JSON.stringify({ nonsense: true }), { status: 500 })) as typeof fetch });
  await assert.rejects(() => s.callTool("POST /tools/status", {}), IpcTransportError);
});

test("callTool throws IpcTransportError when the response body is not valid JSON", async () => {
  const s = session({ fetchImpl: (async () => new Response("not json", { status: 200 })) as typeof fetch });
  await assert.rejects(() => s.callTool("POST /tools/status", {}), IpcTransportError);
});

test("callTool lets a HandshakeError from performHandshakeImpl propagate unchanged, not wrapped", async () => {
  const s = session({
    performHandshakeImpl: async () => {
      throw new HandshakeError("DAEMON_DOWN", "no daemon reachable");
    },
    fetchImpl: (async () => {
      throw new Error("must not be called");
    }) as typeof fetch,
  });
  await assert.rejects(
    () => s.callTool("POST /tools/status", {}),
    (err: unknown) => {
      assert.ok(err instanceof HandshakeError);
      assert.equal((err as HandshakeError).code, "DAEMON_DOWN");
      return true;
    },
  );
});

test("callTool wraps an ensureDaemonRunningImpl failure as IpcTransportError, making zero fetch calls", async () => {
  let fetchCalls = 0;
  const s = session({
    ensureDaemonRunningImpl: async () => {
      throw new Error("spawn timed out");
    },
    fetchImpl: (async () => {
      fetchCalls += 1;
      throw new Error("must not be called");
    }) as typeof fetch,
  });
  await assert.rejects(() => s.callTool("POST /tools/status", {}), IpcTransportError);
  assert.equal(fetchCalls, 0);
});

test("callTool POSTs to the daemon's loopback port with the stripped path, bearer header, and JSON body", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const s = session({
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch,
  });

  await s.callTool("POST /tools/send", { type: "BROADCAST", body: "hi" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `http://${IPC_LOOPBACK_HOST}:${RUN_PAYLOAD.port}/tools/send`);
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["content-type"], "application/json");
  assert.equal(headers["authorization"], `Bearer ${SESSION_RESPONSE.bearer}`);
  assert.equal(calls[0].init.body, JSON.stringify({ type: "BROADCAST", body: "hi" }));
});

// --- Judgment Day CRITICAL fix: session caching (design §11 "Handshake timing: cached for the session") ---

test("callTool caches the session: a second call reuses the same handshake result, no second performHandshakeImpl call", async () => {
  let ensureCalls = 0;
  let handshakeCalls = 0;
  const calls: Array<{ init: RequestInit }> = [];
  const s = session({
    ensureDaemonRunningImpl: async () => {
      ensureCalls += 1;
      return RUN_PAYLOAD;
    },
    performHandshakeImpl: async () => {
      handshakeCalls += 1;
      return SESSION_RESPONSE;
    },
    fetchImpl: (async (_url: string | URL, init?: RequestInit) => {
      calls.push({ init: init as RequestInit });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch,
  });

  await s.callTool("POST /tools/status", {});
  await s.callTool("POST /tools/status", {});

  assert.equal(ensureCalls, 1, "ensureDaemonRunningImpl must run at most once per session");
  assert.equal(handshakeCalls, 1, "performHandshakeImpl must run at most once per session");
  assert.equal(calls.length, 2);
  const bearer1 = (calls[0].init.headers as Record<string, string>)["authorization"];
  const bearer2 = (calls[1].init.headers as Record<string, string>)["authorization"];
  assert.equal(bearer1, bearer2, "both calls must reuse the identical cached bearer");
});

test("callTool shares one in-flight handshake across two calls that race before either resolves (Judgment Day round-1 fix, Judge A)", async () => {
  let handshakeCalls = 0;
  let releaseHandshake: () => void = () => {};
  const handshakeGate = new Promise<void>((resolve) => {
    releaseHandshake = resolve;
  });
  const s = session({
    performHandshakeImpl: async () => {
      handshakeCalls += 1;
      await handshakeGate; // both racing callTool() calls must reach this point before either resolves
      return SESSION_RESPONSE;
    },
    fetchImpl: (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch,
  });

  const first = s.callTool("POST /tools/status", {});
  const second = s.callTool("POST /tools/status", {});
  queueMicrotask(releaseHandshake);
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(handshakeCalls, 1, "two calls racing before the first handshake resolves must share ONE attempt, not mint two");
  assert.deepEqual(firstResult, { ok: true, data: {} });
  assert.deepEqual(secondResult, { ok: true, data: {} });
});

test("callTool re-handshakes once and retries once on a 401 from a stale cached bearer, without looping", async () => {
  let handshakeCalls = 0;
  const staleBearer = "b".repeat(64);
  const freshBearer = "c".repeat(64);
  const s = session({
    performHandshakeImpl: async () => {
      handshakeCalls += 1;
      return { ...SESSION_RESPONSE, bearer: handshakeCalls === 1 ? staleBearer : freshBearer };
    },
    fetchImpl: (async (_url: string | URL, init?: RequestInit) => {
      const bearer = (init?.headers as Record<string, string>)["authorization"];
      if (bearer === `Bearer ${staleBearer}`) {
        return new Response(JSON.stringify({ code: "SESSION_UNAUTHORIZED", message: "stale bearer", retryable: false }), { status: 401 });
      }
      return new Response(JSON.stringify({ served: "fresh" }), { status: 200 });
    }) as typeof fetch,
  });

  const result = await s.callTool("POST /tools/status", {});

  assert.equal(handshakeCalls, 2, "exactly one re-handshake after the 401");
  assert.deepEqual(result, { ok: true, data: { served: "fresh" } });
});

test("callTool does not loop forever: a second consecutive 401 after the one retry is classified normally", async () => {
  let handshakeCalls = 0;
  let fetchCalls = 0;
  const errorBody = { code: "SESSION_UNAUTHORIZED", message: "still stale", retryable: false };
  const s = session({
    performHandshakeImpl: async () => {
      handshakeCalls += 1;
      return SESSION_RESPONSE;
    },
    fetchImpl: (async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify(errorBody), { status: 401 });
    }) as typeof fetch,
  });

  const result = await s.callTool("POST /tools/status", {});

  assert.equal(handshakeCalls, 2, "one initial connect plus exactly one re-handshake, never more");
  assert.equal(fetchCalls, 2, "one initial attempt plus exactly one retry, never more");
  assert.deepEqual(result, { ok: false, error: errorBody });
});

// --- Independent-verifier WARNING fixes: previously-unasserted wiring details ---

test("callTool derives its fetch abort timeout from IPC_REQUEST_TIMEOUT_MS", async () => {
  const originalTimeout = AbortSignal.timeout;
  let capturedMs: number | undefined;
  AbortSignal.timeout = ((ms: number) => {
    capturedMs = ms;
    return originalTimeout(ms);
  }) as typeof AbortSignal.timeout;
  try {
    const s = session({ fetchImpl: (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch });
    await s.callTool("POST /tools/status", {});
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
  assert.equal(capturedMs, IPC_REQUEST_TIMEOUT_MS);
});

test("callTool forwards a daemon error's optional retry_after_s and new_chat_id fields unchanged", async () => {
  const errorBody = { code: "RATE_LIMITED", message: "slow down", retryable: true, retry_after_s: 30, new_chat_id: -100999 };
  const s = session({ fetchImpl: (async () => new Response(JSON.stringify(errorBody), { status: 429 })) as typeof fetch });
  const result = await s.callTool("POST /tools/send", { type: "BROADCAST", body: "hi" });
  assert.deepEqual(result, { ok: false, error: errorBody });
});

test("callTool forwards options.homeDir to both ensureDaemonRunningImpl and performHandshakeImpl", async () => {
  const seenHomeDirs: Array<string | undefined> = [];
  const s = createIpcSession({
    ...IDENTITY,
    homeDir: "/custom/home",
    ensureDaemonRunningImpl: async (opts) => {
      seenHomeDirs.push(opts?.homeDir);
      return RUN_PAYLOAD;
    },
    performHandshakeImpl: async (opts) => {
      seenHomeDirs.push(opts.homeDir);
      return SESSION_RESPONSE;
    },
    fetchImpl: (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch,
  });
  await s.callTool("POST /tools/status", {});
  assert.deepEqual(seenHomeDirs, ["/custom/home", "/custom/home"]);
});

// --- release() (B-106: the leak the client's own module doc disclosed) ---
// The daemon's SessionStore is bounded by MAX_ACTIVE_SESSIONS and never self-expires, and
// `SessionStore.revoke` plus the `DELETE /session` route have existed since PR-31 while nothing in
// this client ever called them. These tests pin the release obligation: it must happen, it must not
// resurrect a daemon to do it, and it must never turn the exit path into an error path.

test("release sends DELETE /session with the cached bearer to the cached port", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const s = session({
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch,
  });

  await s.callTool("POST /tools/status", {});
  await s.release();

  assert.equal(calls.length, 2, "exactly one tool call plus one release");
  assert.equal(calls[0]?.url, `http://${IPC_LOOPBACK_HOST}:4123/tools/status`);
  assert.equal(calls[1]?.url, `http://${IPC_LOOPBACK_HOST}:4123/session`);
  assert.equal(calls[1]?.init?.method, "DELETE");
  assert.equal(
    (calls[1]?.init?.headers as Record<string, string> | undefined)?.authorization,
    `Bearer ${SESSION_RESPONSE.bearer}`,
  );
});

test("release makes zero calls and never spawns a daemon when no session was ever minted", async () => {
  let spawns = 0;
  let fetches = 0;
  const s = session({
    ensureDaemonRunningImpl: async () => {
      spawns += 1;
      return RUN_PAYLOAD;
    },
    fetchImpl: (async () => {
      fetches += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });

  await s.release();

  assert.equal(fetches, 0, "releasing an unused session must not touch the network");
  assert.equal(spawns, 0, "releasing must never make the exit path capable of starting a daemon");
});

test("release swallows a transport failure instead of turning the exit path into an error path", async () => {
  // Judgment Day round 1 (judge B AND judge A, independently, found this test vacuous as first written):
  // it called `release()` on a session that had never minted one, so `release()` returned at its
  // `current === undefined` guard and the throwing fetch was never invoked — the `try/catch` under test
  // was dead code and deleting it would not have failed anything. The session is minted FIRST now, and
  // the test counts the attempt.
  let deletesAttempted = 0;
  const s = session({
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deletesAttempted += 1;
        throw new Error("ECONNREFUSED");
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });

  await s.callTool("POST /tools/status", {});
  await s.release();

  assert.equal(deletesAttempted, 1, "the release must actually be attempted against a minted session");
});

test("release waits for an in-flight handshake and revokes the slot it mints", async () => {
  // Judgment Day round 1 (judge B's WARNING, corroborated by judge A): consulting only the SETTLED value
  // meant a release that arrived while the first handshake was still resolving saw nothing to revoke —
  // and the handshake then minted a slot that nobody ever gave back. Awaiting the attempt that already
  // exists is not starting one, so this stays spawn-free and handshake-free by construction.
  const deleted: string[] = [];
  let openGate: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  const s = session({
    performHandshakeImpl: async () => {
      await gate;
      return SESSION_RESPONSE;
    },
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted.push((init.headers as Record<string, string>).authorization);
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });

  const toolCall = s.callTool("POST /tools/status", {});
  const releasing = s.release();
  openGate?.();
  await Promise.all([toolCall, releasing]);

  assert.deepEqual(deleted, [`Bearer ${SESSION_RESPONSE.bearer}`], "the slot minted mid-flight must still be revoked");
});

test("release after a 401-driven re-handshake revokes the FRESH bearer, not the stale one", async () => {
  const deleted: string[] = [];
  let handshakes = 0;
  const s = session({
    performHandshakeImpl: async () => {
      handshakes += 1;
      return { ...SESSION_RESPONSE, bearer: `${handshakes}`.repeat(64) };
    },
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted.push((init.headers as Record<string, string>).authorization);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: handshakes === 1 ? 401 : 200 });
    }) as typeof fetch,
  });

  await s.callTool("POST /tools/status", {});
  await s.release();

  assert.equal(handshakes, 2, "the 401 path re-handshakes once");
  assert.deepEqual(deleted, [`Bearer ${"2".repeat(64)}`], "the revoked bearer is the one actually in use");
});

test("release clears the cache, so a later tool call re-handshakes instead of reusing a revoked bearer", async () => {
  let handshakes = 0;
  const s = session({
    performHandshakeImpl: async () => {
      handshakes += 1;
      return SESSION_RESPONSE;
    },
    fetchImpl: (async () => new Response("{}", { status: 200 })) as typeof fetch,
  });

  await s.callTool("POST /tools/status", {});
  await s.release();
  await s.release();
  assert.equal(handshakes, 1, "a second release has nothing cached to revoke");

  await s.callTool("POST /tools/status", {});
  assert.equal(handshakes, 2, "the call after a release must mint a fresh session, never reuse a revoked bearer");
});
