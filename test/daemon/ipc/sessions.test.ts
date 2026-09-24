import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";

import { IPC_NONCE_BYTES, MAX_ACTIVE_SESSIONS, RUN_SECRET_BYTES, SESSION_TOKEN_BYTES } from "../../../src/shared/constants.js";
import { computeSessionProof, SessionStore } from "../../../src/daemon/ipc/sessions.js";
import { PendingHandshakeStore } from "../../../src/daemon/ipc/handshake.js";

/** Independent oracle for HMAC-SHA256(secret, "session:" + serverNonce) — mirrors handshake.test.ts's
 * own pattern (raw `createHmac`, not a re-export of the module under test) so a regression in
 * `sessions.ts`'s own label or algorithm cannot hide behind a tautological self-check. */
function expectedSessionProof(secret: string, serverNonce: string): string {
  return createHmac("sha256", secret).update(`session:${serverNonce}`).digest("hex");
}

/**
 * `daemon/ipc/sessions.ts` (PR-30, design §10 "IPC" rule table row "Bearer (D-04)", spec
 * `ipc-handshake` "Bearer is a per-session token, not the raw per-boot secret" and "Secret and
 * session rotate per daemon boot", PT-24). New code — no v1 range — so this twin needs no
 * `test/fixtures/v1-provenance.json` entry.
 *
 * `sessions.ts` has no registered HTTP handler in this PR (`daemon/ipc/routes.ts`, PR-31, owns
 * `POST /session`'s actual routing), so this suite exercises its exported primitives directly rather
 * than driving them through `createIpcServer`. The first scenario still assembles the REALISTIC call
 * sequence a future `routes.ts` handler will make — issue a `server_nonce` from `handshake.ts`'s
 * `PendingHandshakeStore` and consume it, then mint — so this file also documents the intended
 * calling convention for PR-31's author (`sessions.ts`'s own module doc makes the same point from the
 * production-code side: it never touches that store itself).
 */

const SESSION_TOKEN_HEX_LENGTH = SESSION_TOKEN_BYTES * 2;
const sessionTokenShape = new RegExp(`^[0-9a-f]{${SESSION_TOKEN_HEX_LENGTH}}$`);

function freshSecret(): string {
  return randomBytes(RUN_SECRET_BYTES).toString("hex");
}

test("session token issued at POST /session: a verified claimed HMAC mints a bearer distinct from the secret; an unverified one mints nothing", () => {
  const secret = freshSecret();
  const store = new SessionStore(secret);

  // The realistic sequence: a server_nonce is issued and consumed from handshake.ts's store before
  // sessions.ts is ever called (see the module doc — sessions.ts itself never touches that store).
  const pending = new PendingHandshakeStore();
  const serverNonce = pending.issue();
  assert.ok(serverNonce, "PendingHandshakeStore.issue() must hand out a nonce below its capacity");
  assert.equal(pending.consume(serverNonce), true);

  // Independent oracle, not sessions.ts's own computeSessionProof: a regression in the module's label
  // or algorithm must not be able to hide behind a self-referential check.
  const claimedHmac = expectedSessionProof(secret, serverNonce);
  const bearer = store.mint(serverNonce, claimedHmac);

  assert.ok(bearer, "a correctly verified claim must mint a bearer");
  assert.match(bearer, sessionTokenShape);
  assert.notEqual(bearer, secret, "the bearer must be a freshly minted token, never the raw secret");
  assert.equal(store.validate(bearer), true);
  assert.equal(store.size, 1, "a successful mint must be reflected as a concrete count, not just a before/after delta");

  // An unverified claim mints nothing and leaves the store unchanged.
  const sizeBefore = store.size;
  const rejected = store.mint(serverNonce, "0".repeat(SESSION_TOKEN_HEX_LENGTH));
  assert.equal(rejected, undefined);
  assert.equal(store.size, sizeBefore);
});

test("a wrong-length claimed HMAC is rejected without throwing (constant-time length guard)", () => {
  const secret = freshSecret();
  const store = new SessionStore(secret);
  const serverNonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
  const sizeBefore = store.size;

  const result = store.mint(serverNonce, "ab");
  assert.equal(result, undefined, "a claimed HMAC far shorter than a real digest must be rejected, not thrown on");
  assert.equal(store.size, sizeBefore);
});

test("raw per-boot secret is rejected as a bearer", () => {
  const secret = freshSecret();
  const store = new SessionStore(secret);
  const serverNonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
  const bearer = store.mint(serverNonce, computeSessionProof(secret, serverNonce));
  assert.ok(bearer, "setup: a correctly verified claim must mint a bearer");

  assert.equal(store.validate(secret), false, "the raw per-boot secret must never itself validate as a bearer");
  assert.equal(store.validate(bearer), true, "the actually minted bearer must still validate");
});

test("stale-boot bearer rejected: a bearer minted by one boot's store does not validate against a later boot's store, with no side effect", () => {
  const secretBoot1 = freshSecret();
  const secretBoot2 = freshSecret();
  const storeBoot1 = new SessionStore(secretBoot1);
  const storeBoot2 = new SessionStore(secretBoot2);

  const nonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
  const bearerFromBoot1 = storeBoot1.mint(nonce, computeSessionProof(secretBoot1, nonce));
  assert.ok(bearerFromBoot1, "setup: a correctly verified claim must mint a bearer");

  const sizeBefore = storeBoot2.size;
  assert.equal(storeBoot2.validate(bearerFromBoot1), false);
  assert.equal(storeBoot2.size, sizeBefore, "a failed validate() must not mutate the store");
});

test("revoke: a minted bearer stops validating after revoke; revoking an unknown or already-revoked bearer is a no-op", () => {
  const secret = freshSecret();
  const store = new SessionStore(secret);
  const serverNonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
  const bearer = store.mint(serverNonce, computeSessionProof(secret, serverNonce));
  assert.ok(bearer, "setup: a correctly verified claim must mint a bearer");
  assert.equal(store.validate(bearer), true, "setup: the freshly minted bearer must validate");

  assert.equal(store.revoke(bearer), true, "revoking a bearer that was minted must report it was removed");
  assert.equal(store.validate(bearer), false, "a revoked bearer must no longer validate");
  assert.equal(store.size, 0, "revoke must actually shrink the store, not just hide the bearer from validate");

  assert.equal(store.revoke(bearer), false, "revoking an already-revoked bearer must report nothing was removed");
  assert.equal(
    store.revoke("0".repeat(SESSION_TOKEN_HEX_LENGTH)),
    false,
    "revoking a bearer this store never minted must report nothing was removed",
  );
  assert.equal(store.size, 0, "a no-op revoke must not change the store's size");
});

test("mint refuses once MAX_ACTIVE_SESSIONS live bearers are held, without distinguishing why", () => {
  const secret = freshSecret();
  const store = new SessionStore(secret);

  for (let i = 0; i < MAX_ACTIVE_SESSIONS; i += 1) {
    const serverNonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
    const bearer = store.mint(serverNonce, computeSessionProof(secret, serverNonce));
    assert.ok(bearer, `mint ${i} of ${MAX_ACTIVE_SESSIONS} should succeed`);
  }
  assert.equal(store.size, MAX_ACTIVE_SESSIONS);

  const overflowNonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
  const overflow = store.mint(overflowNonce, computeSessionProof(secret, overflowNonce));
  assert.equal(overflow, undefined, "a correctly verified claim must still be refused once the store is full");
  assert.equal(store.size, MAX_ACTIVE_SESSIONS, "a refused mint at capacity must not grow the store");
});
