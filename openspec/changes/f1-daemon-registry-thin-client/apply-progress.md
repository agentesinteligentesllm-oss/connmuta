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

## Next (superseded by PR-02 below)

Tribunal audit of PR-01a/PR-01b, then PR-02 (`shared/envelope.ts`, size:exception, AS-IS vendored).

---

# Apply Progress: F1 — PR-02 (provenance mechanism + `envelope.ts`, size:exception)

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Branch | `f1/02-envelope-provenance` → `main` (stacked on PR-01b) |
| Mode | Strict TDD |
| Status | Implemented and verified; tasks 2.1–2.6 marked `[x]`; tribunal audit pending before the PR opens |

## Scope

`test/security/provenance.test.ts` (new), `test/fixtures/v1-provenance.json` (new),
`src/shared/envelope.ts` (vendored AS-IS from `v1:src/envelope.ts` @ `bf8f365`),
`test/shared/envelope.test.ts` (vendored AS-IS from `v1:test/envelope.test.ts` @ `bf8f365`),
`test/fakes/delivered-text.ts` (new, tiny authored helper).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 | `test/security/provenance.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 2 tests (registry+hash test, SEAM-detection unit test) | ➖ None needed |
| 2.2 | `test/fixtures/v1-provenance.json` | N/A (data) | N/A (new) | — | — | ➖ Structural, no branching | — |
| 2.3 | `src/shared/envelope.ts` | Unit (via provenance + twin) | N/A (new) | ✅ (2.1's RED covered it) | ✅ Passed | ➖ Single vendored module | ➖ AS-IS, no refactor allowed |
| 2.4 | `test/shared/envelope.test.ts` | Unit | N/A (new) | ✅ (2.1's RED covered it) | ✅ Passed | ➖ AS-IS twin, 74 pre-existing v1 scenarios | ➖ AS-IS, no refactor allowed |

## RED evidence (task 2.1, genuine failure captured before GREEN)

With `test/fixtures/v1-provenance.json` set to `[]` and both vendored files already on disk with
their Provenance headers (staged via `git add` so `git ls-files -z` — the same scan mechanism as
`test/security/repo-scan.test.ts` — could see them), `node --test "dist/test/security/provenance.test.js"`
failed for the intended reason (the non-vacuity guard, not a crash or a missing-module error):

```
✖ vendored files match the provenance registry and their pinned body hashes (design §12, DN-06)
  AssertionError [ERR_ASSERTION]: expected the provenance fixture to be non-empty
      at TestContext.<anonymous> (.../dist/test/security/provenance.test.js:87:12)
```

After populating the fixture with the real entries, GREEN: `node --test "dist/test/shared/envelope.test.js" "dist/test/security/provenance.test.js"` → **75/75 pass** (73 vendored `envelope.test.ts` scenarios + 2 `provenance.test.ts` tests).

## Hash computation and reference cross-check (orchestrator decision A)

Implemented `vendoredBody(text)` in `provenance.test.ts`: normalize `\r\n`→`\n`, strip a leading
`/** ... */` header only when it contains `Provenance:`, then strip the leading contiguous
`import`/blank-line block (multi-line imports tracked to their terminating `;`). Hashed with
`createHash("sha256").update(body, "utf8").digest("hex")`.

Cross-checked against the orchestrator's reference values computed from the frozen `bf8f365` blobs:

| File | Body first line | Body lines | Computed hash | Matches reference |
|---|---|---|---|---|
| `v1:src/envelope.ts` | `// Exported so \`src/tools/send.ts\` …` | 323 (incl. trailing empty split element) | `e4aba6ec2128ed5dae858ae5633a94df371696e0aace95886595f61432f62663` | ✅ Yes |
| `v1:test/envelope.test.ts` | `function validRequestEnvelope(` | 682 (incl. trailing empty split element) | `db6cda680cbf23264656eb778bad981c5028b94b5c72f8ae4ad71f1b4e73db7f` | ✅ Yes |

Both matched on the first attempt — the algorithm as specified (normalize → strip header → strip
import block) reproduces the orchestrator's reference hashes exactly.

## Discovery: `src/shared/constants.ts` already carries a Provenance header (fixture now has 3 entries, not 2)

`src/shared/constants.ts` (PR-01b, already on this branch from a prior session) was vendored as a
SEAM from `v1:src/config.ts:26-166` and already carries a `Provenance:`-style header — written
before `provenance.test.ts` existed to enforce anything. Once the scanner in this PR started
walking `src/**`, it found that header and failed the registry-equality assertion because the
fixture only listed the two PR-02 files.

This is not scope creep: the registry's whole point (design §12) is that it equals **every**
currently-vendored file with a header, regardless of which PR introduced it. `constants.ts` itself
was not touched — only `test/fixtures/v1-provenance.json` gained a third entry
(`src/shared/constants.ts` ← `src/config.ts:26-166`, `verdict: SEAM`). Its SEAM hash-mismatch and
non-`"none."` `Changes:` assertions both pass against the pre-existing header without modification.
Flagging for tribunal ratification: PR-01b's header was written before this mechanism existed, and
happened to already conform to the format's field order — future PRs should not assume that; this
PR is the first to actually validate it.

## Note on `changes` parsing for multi-line `Changes:` fields

`constants.ts`'s header wraps its `Changes:` text across two lines. The test's `parseHeader`
regex (`/Changes: ([^\n]*)/`) only captures up to the first newline, so `entry.changes` for that
entry is a truncated string, not the full text. This is sufficient for the test's only use of the
field (asserting it is not the literal `"none."`) but is not a complete parser. Left as-is rather
than widened, since widening it has no assertion depending on it and no spec scenario requires it
(YAGNI); noting it here so a future PR does not assume `changes` is complete.

## `deliveredText` helper split (orchestrator decision E — flagged for tribunal ratification)

`test/fakes/delivered-text.ts` exports `deliveredText`, extracted verbatim from
`v1:test/fakes/telegram.ts:43-49`, with no `Provenance:` header (it is a range extract, not a
vendored whole file, and must not enter the provenance registry — confirmed it does not appear in
the scan). `test/twins.test.ts` does not require test helpers to have `src/` twins, confirmed by
reading its implementation (it only walks `src/**/*.ts`). PR-18's `test/fakes/telegram-client.ts`
must import `deliveredText` from here instead of redefining it, once `TelegramClient` types exist.

## Data hygiene check (AGENTS.md §3)

Grepped both vendored files for `@`-prefixed bot usernames, 8–10-digit numeric ids followed by
`:`, and `-100…` chat ids. The only `@`-prefixed matches are `@dev1-agent` / `@dev2-agent` —
synthetic AgentBus wire-level agent identifiers used throughout v1's own test fixtures (matching
`AGENT_ID_PATTERN`), not Telegram bot usernames or real production identifiers.
`npm run test:static` (PT-22 repo-scan) stayed green with both vendored files staged and scanned.

## Verification (run in order, from clean)

| Command | Result |
|---|---|
| `rm -rf dist && npm run build` | exit 0, no errors |
| `node --test "dist/test/shared/envelope.test.js" "dist/test/security/provenance.test.js"` | **75/75 pass** (0 fail) |
| `npm test` | **89/89 pass** (0 fail) — up from 14 before this PR |
| `npm run test:static` | **8/8 pass** (0 fail) — up from 6 before this PR |
| `git status --short` (after) | only the 5 scope files + `tasks.md` + `apply-progress.md` changed; nothing under `dist/`, `node_modules/`, or the v1 checkout |

## Real diff size (step 5)

Measured with `git diff HEAD --numstat` (staged + unstaged vs. the branch point on `main`):

| File | + | − |
|---|---|---|
| `test/security/provenance.test.ts` | 138 | 0 |
| `test/fixtures/v1-provenance.json` | 20 | 0 |
| `test/fakes/delivered-text.ts` | 18 | 0 |
| `src/shared/envelope.ts` | 337 | 0 |
| `test/shared/envelope.test.ts` | 705 | 0 |
| `openspec/changes/f1-daemon-registry-thin-client/tasks.md` | 6 | 6 |
| `openspec/changes/f1-daemon-registry-thin-client/apply-progress.md` | ~143 | 1 |

- **Authored new lines** (counted toward the 400-line budget): `provenance.test.ts` (138) +
  `v1-provenance.json` (20) + `delivered-text.ts` (18) + `envelope.ts` header/import block (6
  header-comment lines + 9 import-block lines = 15) + `envelope.test.ts` header/import block (6
  header-comment lines + 18 import-block lines = 24) = **215 lines**. Within budget (215 < 400);
  above the ≈110-line target for `provenance.test.ts` alone (138, +28) because of the SEAM
  hash-mismatch unit test (required so that branch is exercised, not dead code) and the
  `constants.ts` discovery — both add real assertions, not incidental bulk.
- **Vendored AS-IS body lines** (DN-06 `size:exception`, excluded from the budget): `envelope.ts`
  body 322 + `envelope.test.ts` body 681 = **1,003 lines**, matching `wc -l` on the frozen
  `bf8f365` blobs minus their import blocks (331−9 and 699−18).
- **SDD bookkeeping** (not review load): `tasks.md` 6+6, `apply-progress.md` ~143+1 (this file's
  own diff count is a moving target while being edited; not review load either way per the tasks
  header's counting rule).

## Corrections applied this round (orchestrator review)

1. **Malformed headers now fail instead of being skipped**: `parseHeader` returned `undefined` for a
   header that carries `Provenance:` but does not parse (mistyped verdict, short hash, missing
   `Changes:`), and the scan silently treated such a file as unvendored — a way past the registry
   check. The scan now collects those paths into `malformed` and asserts the list is empty. RED
   reproduced genuinely: a probe `test/fakes/malformed-probe.ts` with `verdict: ASIS` and a 4-hex
   hash, made visible to `git ls-files` with `git add -N`, failed with
   `malformed Provenance header(s) in: test/fakes/malformed-probe.ts`; probe removed, GREEN restored.
2. **Dead code removed**: the trailing `while (… trim() === "") i += 1` after the import-block loop
   could never advance (the loop already skips blank lines before breaking on the first body line).
3. **Second test retitled**: "no SEAM file ships in PR-02" held for PR-02's own files but misled once
   `constants.ts` (SEAM) entered the registry; the test is a parser unit test over a synthetic
   header and is now named as such.
4. **RED fidelity note for the tribunal**: task 2.1 specifies RED "with an empty fixture and no
   vendored file yet"; the captured RED had both vendored files already staged, so it exercised only
   the non-vacuity guard. The failure was genuine and for the intended reason, and with
   `constants.ts` already headered the "no vendored file" variant would also have failed (scanned
   set ≠ empty fixture) — recorded as a process deviation, not a correctness gap.
5. **`constants.ts` header hash verified reproducible** by the orchestrator: `4ce5e514…` is the
   SHA-256 of `v1:src/config.ts` lines 26–166 joined with `\n` and no trailing newline (LF), so the
   registry's only SEAM entry is honest even though the test asserts only inequality for SEAMs.
6. **Re-verified from clean** after the edits: `rm -rf dist && npm run build` exit 0; full suite
   **89/89**; `npm run test:static` **8/8**; `provenance.test.ts` is 138 lines, authored total 215.

## Next

Tribunal audit of PR-02 (`bus-v2-f1-pr-02-001`), then PR-03 (`shared/secrets.ts`, SEAM).
