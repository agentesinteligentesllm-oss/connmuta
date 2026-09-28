import { PROTOCOL_SENTINEL } from "./constants.js";

/**
 * This package's version — the single source of truth in source code.
 *
 * Asserted equal to `package.json`'s `version` field by `test/shared/version.test.ts` (the v1
 * pattern: `v1:src/config.ts:44-52` asserted the same equality via `test/index.test.ts`). Kept as a
 * literal rather than read from `package.json` at runtime so the `shared` compile unit stays free
 * of a `node:fs` dependency (design §2.2 compile-unit boundary).
 */
export const SERVER_VERSION = "2.0.0-alpha.0";

const WIRE_VERSION_PATTERN = /^AGENTBUS\/(\d+)$/;

/**
 * The wire protocol version this build emits — the digits in `AGENTBUS/2` (F3 PR-08,
 * version-observability). Derived from {@link PROTOCOL_SENTINEL} rather than a second hand-maintained
 * literal, so the two can never drift apart. Independent of {@link SERVER_VERSION}: a build's own
 * release number changes far more often than the wire protocol it speaks.
 *
 * Extracted with a matching regex, not a bare `split`, so a malformed `PROTOCOL_SENTINEL` throws at
 * module load instead of silently exporting `undefined` (RDD review review-bf6758a77fcaac8d,
 * R3-wire-version-unchecked-index).
 */
const wireVersionMatch = WIRE_VERSION_PATTERN.exec(PROTOCOL_SENTINEL);
if (wireVersionMatch === null) {
  throw new Error(`PROTOCOL_SENTINEL '${PROTOCOL_SENTINEL}' does not match the expected AGENTBUS/<digits> shape`);
}
export const WIRE_VERSION: string = wireVersionMatch[1];
