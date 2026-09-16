# Apply Progress: F1 — PR-01 (split into PR-01a/PR-01b)

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Branches | `f1/01a-scaffold-ci-gates` → `main`; `f1/01b-shared-constants` → `main` (stacked on PR-01a) |
| Mode | Strict TDD |
| Status | PR-01a and PR-01b implemented and verified (Strict TDD); tasks.md re-sliced; tribunal audit `bus-v2-f1-pr-01-001` pending before the PRs open |

## PR-01a — scaffold + CI + static security (380 lines, within budget)

`package.json`, `tsconfig.base.json`, `tsconfig.json`, `src/{shared,client,daemon,cli}/tsconfig.json`,
`.github/workflows/ci.yml`, `src/shared/version.ts`, `test/shared/version.test.ts`, `test/twins.test.ts`,
`test/security/pack.test.ts`, `test/security/repo-scan.test.ts`, `test/fixtures/repo-scan-negative.txt`,
`.gitignore` (+1), `docs/02-architecture/THREAT-MODEL.md` (+2/-2).

## PR-01b — constants (386 lines, within budget)

`src/shared/constants.ts` (319) + `test/shared/constants.test.ts` (67).

## Corrections applied this round (orchestrator review)

1. **DRY'd tsconfigs**: new `tsconfig.base.json` holds shared `compilerOptions`; all 5 unit configs `extends` it, keeping only `rootDir`/`outDir`/`tsBuildInfoFile`/`include`/`references`. `client`/`daemon`/`cli` tsconfigs still exist on disk but stay out of the root's `references` — an empty composite unit's `include` is `TS18003`; each rejoins `references` when its first `.ts` file lands.
2. **Fixed the tsbuildinfo leak**: `tsBuildInfoFile` now points under `dist/.tsbuildinfo/<unit>.tsbuildinfo`, outside the packed `dist/src/**` glob. RED reproduced genuinely (temporarily reverted `src/shared/tsconfig.json`, rebuilt, confirmed `pack.test.ts` failed on the new `tsBuildInfoLeaks` assertion with `dist/src/shared/tsconfig.tsbuildinfo`), then restored and confirmed GREEN. `pack.test.ts`'s whitelist check now derives from `PACKAGE_JSON_WHITELIST` via `isWhitelisted()` instead of repeating the literal array.
3. **`MCP_SERVER_NAME` doc comment corrected**: the thin client, not the daemon, is the MCP server the IDE host spawns.
4. **`constants.test.ts` trimmed**: removed the tuning-number pin (`SPAWN_LOCK_STALE_SECONDS === 25`), kept the relation-only assertion; grouped derived-value checks into one test, confirmed-base values into another; W1/W8/D-03/PRODUCT_NAME stayed separate. 85 → 67 lines, zero assertions lost.
5. **Re-verified from clean**: `rm -rf dist && npm run build && npm test` → **14/14 pass**; `npm run test:static` → **6/6 pass**; `npm pack --dry-run --json` → 8 files, zero `.tsbuildinfo` entries.

## Next

Tribunal audit of PR-01a/PR-01b, then PR-02 (`shared/envelope.ts`, size:exception, AS-IS vendored).
