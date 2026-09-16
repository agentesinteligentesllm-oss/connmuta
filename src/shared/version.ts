/**
 * This package's version — the single source of truth in source code.
 *
 * Asserted equal to `package.json`'s `version` field by `test/shared/version.test.ts` (the v1
 * pattern: `v1:src/config.ts:44-52` asserted the same equality via `test/index.test.ts`). Kept as a
 * literal rather than read from `package.json` at runtime so the `shared` compile unit stays free
 * of a `node:fs` dependency (design §2.2 compile-unit boundary).
 */
export const SERVER_VERSION = "2.0.0-alpha.0";
