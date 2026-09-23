import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";

import { HANDSHAKE_NONCE_TTL_SECONDS, IPC_NONCE_BYTES, MAX_PENDING_HANDSHAKES, RUN_SECRET_BYTES } from "../../../src/shared/constants.js";
import {
  HTTP_BAD_REQUEST,
  HTTP_OK,
  HTTP_TOO_MANY_REQUESTS,
  IPC_BAD_REQUEST,
  IPC_HANDSHAKE_FLOOD,
  IPC_LOOPBACK_HOST,
  identityResponseSchema,
  ipcErrorSchema,
} from "../../../src/shared/ipc-contract.js";
import { SERVER_VERSION } from "../../../src/shared/version.js";
import { createIpcServer } from "../../../src/daemon/ipc/server.js";
import { createIdentityHandler, PendingHandshakeStore } from "../../../src/daemon/ipc/handshake.js";

/**
 * `daemon/ipc/handshake.ts` (PR-30, design §10 "IPC", spec `ipc-handshake` "No bearer before identity
 * proof", PT-26). New code — no v1 range — so this twin needs no `test/fixtures/v1-provenance.json`
 * entry.
 *
 * Design decision carried from this PR's brief (not re-litigated here): `DAEMON_IDENTITY_MISMATCH` is
 * exclusively client-side vocabulary (PR-33's `client/handshake.ts`) — this module never raises it.
 * What it guarantees instead, and what "wrong HMAC yields no bearer" below actually pins, is that the
 * returned `proof` is deterministic and bound to the daemon's REAL per-boot secret: a verifier that
 * recomputes the same HMAC with a *different* secret gets a *different* value, and so refuses to send
 * a bearer. `expectedIdentityProof` below recomputes the wire format independently (raw `createHmac`,
 * not a re-export of the module under test), so a regression in the module's own label or algorithm
 * cannot hide behind a tautology.
 */

/** Independent oracle for `HMAC-SHA256(secret, "identity:" + nonce)` — see the module doc. */
function expectedIdentityProof(secret: string, nonce: string): string {
  return createHmac("sha256", secret).update(`identity:${nonce}`).digest("hex");
}

/**
 * Constant-time equality of two lowercase-hex digests (D-14: "verified by constant-time comparison").
 * A length mismatch is `false` without calling `timingSafeEqual`, which throws on unequal-length
 * buffers.
 */
function hexDigestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

async function withServer(
  handlers: Parameters<typeof createIpcServer>[0]["handlers"],
  run: (port: number) => Promise<void>,
): Promise<void> {
  const server = createIpcServer({ handlers });
  const { port } = await server.listen();
  try {
    await run(port);
  } finally {
    await server.close();
  }
}

interface RawResponse {
  status: number;
  bodyText: string;
}

/** A minimal `GET` client for this daemon's loopback IPC surface — see `server.test.ts` for the fuller version this mirrors. */
function getIdentity(port: number, path: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: IPC_LOOPBACK_HOST, port, method: "GET", path, headers: { Host: `${IPC_LOOPBACK_HOST}:${port}` } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, bodyText: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function freshNonce(): string {
  return randomBytes(IPC_NONCE_BYTES).toString("hex");
}

test("wrong HMAC yields no bearer, valid HMAC allows the bearer: the daemon's proof is deterministic and bound to its real secret", async () => {
  const secret = randomBytes(RUN_SECRET_BYTES).toString("hex");
  const wrongSecret = randomBytes(RUN_SECRET_BYTES).toString("hex");
  const nonce = freshNonce();

  await withServer(
    { "GET /identity": createIdentityHandler({ secret, store: new PendingHandshakeStore() }) },
    async (port) => {
      const res = await getIdentity(port, `/identity?nonce=${nonce}`);
      assert.equal(res.status, HTTP_OK);
      const body = identityResponseSchema.parse(JSON.parse(res.bodyText));

      // Valid HMAC allows the bearer: the daemon's proof matches what the real secret computes.
      assert.ok(
        hexDigestsEqual(body.proof, expectedIdentityProof(secret, nonce)),
        "daemon proof must equal HMAC-SHA256(secret, 'identity:'+nonce) under the real secret",
      );

      // Wrong HMAC yields no bearer: a verifier holding a DIFFERENT secret computes a different
      // value and therefore refuses to proceed — the daemon's proof is not a constant and is not
      // independent of the secret.
      assert.ok(
        !hexDigestsEqual(body.proof, expectedIdentityProof(wrongSecret, nonce)),
        "daemon proof must not equal a different secret's HMAC",
      );

      assert.equal(body.pid, process.pid);
      assert.equal(body.build, SERVER_VERSION);
      assert.notEqual(body.server_nonce, nonce, "server_nonce is the daemon's own challenge, distinct from the client's nonce");
    },
  );
});

test("a consumed server_nonce cannot be consumed again (single-use)", () => {
  const store = new PendingHandshakeStore();
  const nonce = store.issue();
  assert.ok(nonce, "issue() must hand out a nonce below its capacity");
  assert.equal(store.consume(nonce), true, "the first consume of a freshly issued nonce must succeed");
  assert.equal(store.consume(nonce), false, "a second consume of the same nonce must fail — single-use");
});

test("a pending nonce is consumable just under its TTL and expired at/after the boundary", () => {
  let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
  const store = new PendingHandshakeStore(() => nowMs);

  const nonceUnderTtl = store.issue();
  assert.ok(nonceUnderTtl);
  nowMs += HANDSHAKE_NONCE_TTL_SECONDS * 1000 - 1;
  assert.equal(store.consume(nonceUnderTtl), true, "a nonce one ms under its TTL must still be consumable");

  nowMs = Date.parse("2026-01-01T00:00:00.000Z");
  const nonceAtBoundary = store.issue();
  assert.ok(nonceAtBoundary);
  nowMs += HANDSHAKE_NONCE_TTL_SECONDS * 1000;
  assert.equal(store.consume(nonceAtBoundary), false, "a nonce at or past its TTL boundary must be treated as expired");
});

test("a missing or malformed nonce is answered 400 IPC_BAD_REQUEST, not a generic 500", async () => {
  const secret = randomBytes(RUN_SECRET_BYTES).toString("hex");

  await withServer(
    { "GET /identity": createIdentityHandler({ secret, store: new PendingHandshakeStore() }) },
    async (port) => {
      const missing = await getIdentity(port, "/identity");
      assert.equal(missing.status, HTTP_BAD_REQUEST);
      assert.equal(ipcErrorSchema.parse(JSON.parse(missing.bodyText)).code, IPC_BAD_REQUEST);

      const malformed = await getIdentity(port, "/identity?nonce=not-hex");
      assert.equal(malformed.status, HTTP_BAD_REQUEST);
      assert.equal(ipcErrorSchema.parse(JSON.parse(malformed.bodyText)).code, IPC_BAD_REQUEST);
    },
  );
});

test("excess pending handshakes are refused, not queued", async () => {
  const secret = randomBytes(RUN_SECRET_BYTES).toString("hex");
  // A fixed clock that never advances: no issued nonce can expire mid-test, so the flood triggers
  // deterministically at the (MAX_PENDING_HANDSHAKES + 1)-th call regardless of real elapsed time.
  const fixedNowMs = Date.parse("2026-01-01T00:00:00.000Z");
  const store = new PendingHandshakeStore(() => fixedNowMs);

  await withServer({ "GET /identity": createIdentityHandler({ secret, store }) }, async (port) => {
    for (let i = 0; i < MAX_PENDING_HANDSHAKES; i += 1) {
      const res = await getIdentity(port, `/identity?nonce=${freshNonce()}`);
      assert.equal(res.status, HTTP_OK, `handshake ${i} of ${MAX_PENDING_HANDSHAKES} should be accepted`);
    }

    const overflow = await getIdentity(port, `/identity?nonce=${freshNonce()}`);
    assert.equal(overflow.status, HTTP_TOO_MANY_REQUESTS);
    const parsed = ipcErrorSchema.parse(JSON.parse(overflow.bodyText));
    assert.equal(parsed.code, IPC_HANDSHAKE_FLOOD);
    assert.equal(parsed.retryable, true, "a handshake flood clears itself as pending nonces expire, unlike the transport-refusal codes");
  });
});
