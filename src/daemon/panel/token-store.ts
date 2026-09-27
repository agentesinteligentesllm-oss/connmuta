/**
 * The panel's single per-boot access token (design's "`PanelTokenStore` is a single per-boot token,
 * not a bearer set" decision, F3 PR-03). Unlike `daemon/ipc/sessions.ts`'s `SessionStore`, there is
 * no mint/revoke lifecycle: one token is generated at construction (daemon boot) and checked by
 * constant-time comparison for the life of the process.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";

import { PANEL_TOKEN_BYTES } from "../../shared/constants.js";

/**
 * Constant-time equality of two hex strings, mirroring `ipc/sessions.ts`'s `hexDigestsEqual`. A
 * length mismatch is `false` without calling `timingSafeEqual`, which throws on unequal-length
 * buffers; `Buffer.from(x, "hex")` on a non-hex candidate simply stops at the first invalid
 * character, so an arbitrary or malformed candidate reliably produces a length mismatch here too.
 */
function hexTokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export class PanelTokenStore {
  readonly token: string;

  constructor() {
    this.token = randomBytes(PANEL_TOKEN_BYTES).toString("hex");
  }

  /** Constant-time comparison against the single token generated at construction. */
  validate(candidate: string): boolean {
    return hexTokensEqual(this.token, candidate);
  }
}
