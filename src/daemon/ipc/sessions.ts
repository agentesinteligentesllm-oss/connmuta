/**
 * The daemon's per-session bearer (`daemon/ipc/sessions.ts`, design §10 "IPC" rule table row "Bearer
 * (D-04)", spec `ipc-handshake` "Bearer is a per-session token, not the raw per-boot secret"). New
 * code: design §12 lists no v1 range for this module — v1 had no local daemon and no HTTP surface at
 * all — so this file carries no vendoring header and adds no row to `test/fixtures/v1-provenance.json`.
 *
 * **Deliberately narrow, and deliberately NOT wired to an HTTP route in this PR.** `POST /session`'s
 * actual routing — reading the request body, resolving the binding, freezing the snapshot, minting
 * `client_id` and returning the full session response shape — is `daemon/ipc/routes.ts` (PR-31). This
 * module owns only the two primitives that route will call: the `"session:"`-labelled HMAC proof, and
 * the in-memory bearer store itself.
 *
 * **This module never imports `daemon/ipc/handshake.ts` and knows nothing about the pending-nonce
 * store.** By the time a caller invokes {@link SessionStore.mint}, IT has already independently
 * consumed the `server_nonce` from `handshake.ts`'s `PendingHandshakeStore` (PR-31's `routes.ts` in
 * production; this module's own test twin for this PR). This module trusts that has happened and only
 * checks that the claimed HMAC is the one the real per-boot secret would produce for the given nonce.
 * Mixing the two stores into one module would couple two concerns this design keeps separate: nonce
 * provenance/expiry (`handshake.ts`) and bearer issuance (here).
 *
 * **Per-boot rotation is a property of process memory, not of this module's code.** {@link SessionStore}
 * holds its bearers in a plain in-memory set; a daemon restart constructs a brand-new store (and a
 * brand-new secret, `lifecycle/run-file.ts`'s `writeRunFile`), so every bearer minted before that
 * restart simply has nowhere left to be found (design §10 "Per-boot rotation" row).
 *
 * **{@link MAX_ACTIVE_SESSIONS} bounds the store; there is still no early revoke.** Judgment Day
 * flagged that this was the one per-boot map in this PR with no ceiling at all, unlike
 * `handshake.ts`'s `PendingHandshakeStore` — fixed here. Removing a single bearer before a full
 * restart (`DELETE /session`) is still `daemon/ipc/routes.ts`'s job (PR-31): design §10 lists it as a
 * fixed route, but no spec scenario names its daemon-side behaviour yet.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { MAX_ACTIVE_SESSIONS, SESSION_TOKEN_BYTES } from "../../shared/constants.js";

/**
 * D-14's domain-separation label for the session proof — distinct from `handshake.ts`'s `"identity:"`
 * label so the two HMACs can never be swapped for one another.
 */
const SESSION_PROOF_LABEL = "session:";

/**
 * `HMAC-SHA256(secret, "session:" + serverNonce)`, lowercase hex — what a legitimate `POST /session`
 * caller must present as `hmac` (D-14). Pure: no I/O, no clock.
 */
export function computeSessionProof(secret: string, serverNonce: string): string {
  return createHmac("sha256", secret).update(`${SESSION_PROOF_LABEL}${serverNonce}`).digest("hex");
}

/**
 * Constant-time equality of two lowercase-hex digests. A length mismatch is `false` without calling
 * `timingSafeEqual`, which throws on unequal-length buffers.
 */
function hexDigestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * The daemon's per-boot session bearers (design §10 "Bearer (D-04)" row): mints a fresh
 * {@link SESSION_TOKEN_BYTES}-byte hex bearer once a claimed `"session:"` HMAC verifies, and looks
 * bearers up on later calls. Memory-only, one instance per daemon boot — see the module doc's
 * rotation paragraph.
 */
export class SessionStore {
  private readonly secret: string;
  private readonly bearers = new Set<string>();

  constructor(secret: string) {
    this.secret = secret;
  }

  /**
   * Verifies `claimedHmac` against `computeSessionProof(secret, serverNonce)` (constant-time) and,
   * only on a match and only below {@link MAX_ACTIVE_SESSIONS}, mints and stores a fresh random
   * bearer. Returns `undefined` for either an unverified claim or a store already at capacity —
   * deliberately not distinguished, so a caller learns nothing about which one it was.
   */
  mint(serverNonce: string, claimedHmac: string): string | undefined {
    const expected = computeSessionProof(this.secret, serverNonce);
    if (!hexDigestsEqual(expected, claimedHmac)) {
      return undefined;
    }
    if (this.bearers.size >= MAX_ACTIVE_SESSIONS) {
      return undefined;
    }
    const bearer = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
    this.bearers.add(bearer);
    return bearer;
  }

  /**
   * Whether `bearer` was minted by this exact store instance. Compares against every stored bearer
   * with {@link hexDigestsEqual} rather than `Set.has`, so a lookup on a 256-bit bearer credential
   * costs the same regardless of which stored value (if any) matches — this PR's Judgment Day found
   * that every other secret-derived comparison here was already constant-time except this one.
   */
  validate(bearer: string): boolean {
    for (const stored of this.bearers) {
      if (hexDigestsEqual(stored, bearer)) {
        return true;
      }
    }
    return false;
  }

  /** Number of live bearers this store holds — a testability accessor, not part of the wire contract. */
  get size(): number {
    return this.bearers.size;
  }
}
