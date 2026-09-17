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
   SHA-256 of `v1:src/config.ts` lines 26–166 joined with `\n` and no trailing newline (LF). It was
   therefore *reproducible* — but this record's next conclusion, that the value was therefore
   "honest", was **wrong**: `bus-v2-f1-pr-04-001` fixes a pin as the exact byte range **including**
   its terminating newline, so the correct value is `039d53a2…` and `4ce5e514…` is the strip
   control. Corrected in place by the B-19 re-pin (see that section at the end of this file);
   nothing else in this PR-04 record depended on the value, and the SEAM inequality assertion passed
   either way, which is exactly why no gate could see it.
6. **Re-verified from clean** after the edits: `rm -rf dist && npm run build` exit 0; full suite
   **89/89**; `npm run test:static` **8/8**; `provenance.test.ts` is 138 lines, authored total 215.

## Next

Tribunal audit of PR-02 (`bus-v2-f1-pr-02-001`), then PR-03 (`shared/secrets.ts`, SEAM).

---

# Apply Progress: F1 — PR-03 (`shared/secrets.ts`, SEAM)

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Branch | `f1/03-secrets` → `main` (stacked on PR-02) |
| Mode | Strict TDD |
| Status | Implemented and verified; tasks 3.1–3.4 marked `[x]`; tribunal audit pending before the PR opens |

## Scope

`src/shared/secrets.ts` (SEAM from `v1:src/secrets.ts` @ `bf8f365`), `test/shared/secrets.test.ts`
(adapted from `v1:test/secrets.test.ts` @ `bf8f365`), `test/fixtures/v1-provenance.json` (one SEAM
entry appended), `docs/02-architecture/THREAT-MODEL.md` (PT-08, PT-15 scope cells).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | `test/shared/secrets.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 14 tests (4 secret-shape rules × table-driven cases, clean payload, marker on/off, no-echo, ADR-05a regression, multi-assignment scan, regex export) | ➖ None needed |
| 3.2 | `src/shared/secrets.ts` | Unit (via 3.1) | N/A (new) | ✅ (3.1's RED covered it) | ✅ Passed | ➖ Single vendored module, one seam change (`export`) | ➖ SEAM, no further refactor — matches v1 body except the one named change |
| 3.3 | (verification, no new test) | — | — | — | ✅ 103/103 full suite, 8/8 static suite | — | — |
| 3.4 | `docs/02-architecture/THREAT-MODEL.md` | N/A (docs) | N/A | — | — | — | — |

## RED evidence (task 3.1, genuine failure captured before GREEN)

With `test/shared/secrets.test.ts` written and `src/shared/secrets.ts` not yet created,
`npm run build` failed for the intended reason (missing module, not a syntax or type error):

```
test/shared/secrets.test.ts:4:73 - error TS2307: Cannot find module '../../src/shared/secrets.js' or
its corresponding type declarations.

4 import { checkForSecrets, TELEGRAM_BOT_TOKEN_RE, type SecretRule } from "../../src/shared/secrets.js";
                                                                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Found 1 error in test/shared/secrets.test.ts:4
```

After implementing `src/shared/secrets.ts`, GREEN: `node --test "dist/test/shared/secrets.test.js"`
→ **14/14 pass**.

## Hash computation and reference cross-check

Computed the v1 body SHA-256 with the same `vendoredBody()` algorithm `provenance.test.ts` uses
(normalize `\r\n`→`\n`; strip a leading `Provenance:`-bearing header block, none present on the raw
v1 file; strip the leading contiguous import/blank-line block, none present — `src/secrets.ts` has
no imports, so the body starts at line 1) against the frozen `bf8f365` blob fetched with
`git show bf8f365:src/secrets.ts`:

| File | Body first line | Body lines (incl. trailing split element) | Computed hash |
|---|---|---|---|
| `v1:src/secrets.ts` | `/** PEM-formatted private-key block...` | 87 | `742bf4338505295b15f37d994e66e6d268d4fcba0fb5cc64c7458a80f2790bf6` |
| `v1:test/secrets.test.ts` | `// --- Table-driven reject cases...` | 134 | `510c409b8c73e5afdc6795b4c5419e2555eaa001b0a7c0840606eceaedaa5f8b` (reference only — the test twin carries no provenance header, so this hash is not asserted by `provenance.test.ts`) |

`742bf433...` is the value recorded in `src/shared/secrets.ts`'s header as `v1 body sha256`. Because
this is a SEAM (the one change is `export` on `TELEGRAM_BOT_TOKEN_RE`), `provenance.test.ts` asserts
the vendored body's hash is **unequal** to this reference — confirmed by the passing
`vendored files match the provenance registry and their pinned body hashes` test — and that
`Changes:` is not the literal `"none."`.

## Real diff size

Measured with `git diff HEAD --numstat` (staged + unstaged vs. the branch point on `main`):

| File | + | − |
|---|---|---|
| `src/shared/secrets.ts` | 94 | 0 |
| `test/shared/secrets.test.ts` | 146 | 0 |
| `test/fixtures/v1-provenance.json` | 6 | 0 |
| `docs/02-architecture/THREAT-MODEL.md` | 2 | 2 |
| `openspec/changes/f1-daemon-registry-thin-client/tasks.md` | 4 | 4 |

- **Authored, budget-counted total**: `secrets.ts` (94) + `secrets.test.ts` (146) +
  `v1-provenance.json` (6) + `THREAT-MODEL.md` docs cells (2+2=4) = **250 lines**. This PR's SEAM
  body is **not** a `size:exception` slice (DN-06 only exempts whole-file AS-IS copies; PR-03 is a
  SEAM by the one-line `export` change) — the entire 94-line `secrets.ts` file counts toward the
  budget, per the tasks header's "SEAM bodies are NOT size-exception" rule. 250 lines is within the
  400-line hard cap and ≈20 lines (≈9%) over the tasks.md ≈230-line estimate for this slice; the
  overage is the `TELEGRAM_BOT_TOKEN_RE` export test plus its digit-count doc comment (see
  "Corrections" below) and the fuller table-driven test adaptation from v1's 133-line original. No
  re-slice was needed — well under budget, no stop-and-report trigger.
- **SDD bookkeeping** (not review load, per the tasks header's counting rule): `tasks.md` 4+4.

## Corrections applied this round

1. **Fixture token digit count changed from the v1 original**: v1's own test fixture token (a
   10-digit bot id followed by a 35-char auth string — not reproduced verbatim here, since embedding
   the literal shape in a tracked doc would itself retrip the scan this note describes) is exactly
   the shape `test/security/repo-scan.test.ts`'s own `TOKEN_SHAPE_RE` (`\b\d{8,10}:[A-Za-z0-9_-]{35}\b`, PT-22)
   is built to catch — confirmed by running the full suite with the v1 literal in place: `npm test`
   failed `repository scan over tracked files is clean (PT-22)` with
   `unexpected token-shape or deny-list hit(s): [{"path":"test/shared/secrets.test.ts",
   "tokenShape":true,"denyList":false}]`. Since this v2 repository's own CI secret scan runs over
   every tracked file (not just v1's original scope), a vendored fixture that happens to fall inside
   the realistic 8–10 digit Telegram bot-id range trips it. Changed the fixture's digit run to 7
   digits (`1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg`) — still matches `shared/secrets.ts`'s own
   `TELEGRAM_BOT_TOKEN_RE` (`\d+:...`, unbounded digit count), still exercises the
   `telegram_bot_token_shape` rejection branch, but falls outside repo-scan's stricter 8–10 digit
   window and is unambiguously synthetic (sequential digits, not id-shaped). RED reproduced
   genuinely (the failure above), GREEN restored after the substitution — full suite back to
   103/103, static suite 8/8. Documented as a design note in the test file itself.
2. **DRY duplication observed, not fixed (orchestrator instruction)**: `test/security/repo-scan.test.ts:13`
   keeps its own `TOKEN_SHAPE_RE = /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/`, a stricter variant of
   `shared/secrets.ts`'s new `export const TELEGRAM_BOT_TOKEN_RE = /\d+:[A-Za-z0-9_-]{35}/` — two
   regex literals expressing the same Telegram bot-token shape with different digit-count bounds and
   different `\b` usage. The correction above (item 1) actually depends on this divergence: PT-22's
   stricter shape is what pushed the realistic-looking v1 fixture into a false positive against the
   repo-wide scan, while the shared regex (used for actual send-path/redaction detection) stayed
   permissive by design (any digit count). Left `repo-scan.test.ts` unmodified per instruction — not
   refactored to import from `shared/secrets.ts` — flagging the duplication for tribunal review: a
   future PR could import `TELEGRAM_BOT_TOKEN_RE` there and narrow it locally with an additional
   digit-count check, or leave the two intentionally decoupled (PT-22 is a repo-hygiene scan, not a
   product-behavior assertion, so some argue it should stay independent of product code by design).

## Data hygiene check (AGENTS.md §3)

Grepped `src/shared/secrets.ts` and `test/shared/secrets.test.ts` for `@`-prefixed usernames,
8–10-digit numeric ids, and `-100…` chat ids. The only `@`-matches are TSDoc `{@link ...}` cross-
references (`{@link SENSITIVE_ENV_KEY_RE}`, `{@link checkForSecrets}`), not Telegram usernames; zero
8–10-digit numeric runs (the fixture token's digit run was deliberately narrowed to 7, see
"Corrections" item 1); zero `-100…` chat-id-shaped strings. `npm run test:static` (PT-22 repo-scan)
passed with both new files staged and scanned.

## Verification (run in order, from clean)

| Command | Result |
|---|---|
| `rm -rf dist && npm run build` | exit 0, no errors |
| `node --test "dist/test/shared/secrets.test.js"` | **14/14 pass** (0 fail) |
| `node --test "dist/test/security/provenance.test.js" "dist/test/twins.test.js"` | **3/3 pass** (0 fail) — SEAM hash-inequality and non-`"none."` `Changes:` both hold; twin coverage holds |
| `npm test` (from clean) | **103/103 pass** (0 fail) — up from 89 before this PR |
| `npm run test:static` (from clean) | **8/8 pass** (0 fail) — same count as PR-02 (no new static-only assertion added by this PR) |
| `git status --short` (after) | only `src/shared/secrets.ts`, `test/shared/secrets.test.ts`, `test/fixtures/v1-provenance.json` (staged), `docs/02-architecture/THREAT-MODEL.md` + `tasks.md` (unstaged) changed; nothing under `dist/`, `node_modules/`, or the v1 checkout; no commit made |

Note on staging: as in PR-02, the three new/modified files carrying a provenance-relevant identity
(`secrets.ts`, `secrets.test.ts`, `v1-provenance.json`) were `git add`-staged (not committed) so
`git ls-files -z` — the mechanism both `provenance.test.ts` and `repo-scan.test.ts` use to enumerate
scanned files — could see them during verification. `tasks.md` and `THREAT-MODEL.md` were left
unstaged. Kairo reviews the full working-tree diff and creates the work-unit commit(s).

## Next

Tribunal audit of PR-03 (`bus-v2-f1-pr-03-001`), then PR-04 (`shared/thread-record.ts`, SEAM).

---

# Apply Progress: F1 — PR-04 (`shared/thread-record.ts`, SEAM)

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Branch | `f1/04-thread-record` → `main` (stacked on PR-03) |
| Mode | Strict TDD |
| Status | Implemented and verified; tasks 4.1–4.3 marked `[x]`; tribunal audit pending before the PR opens |

## Scope

`src/shared/thread-record.ts` (SEAM from `v1:src/state.ts:15-87` @ `bf8f365`), `test/shared/thread-record.test.ts`
(adapted from `v1:test/state.test.ts` type-relevant cases, read-only reference), `test/fixtures/v1-provenance.json`
(one SEAM entry appended). No docs task: PR-04's Requirements line names no PT id ("no standalone requirement;
supports PR-05, PR-12"), so no `THREAT-MODEL.md` row exists for this PR to update — confirmed by reading the
Requirements line before skipping it, per the process instructions.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 | `test/shared/thread-record.test.ts` | Unit (type-shape) | N/A (new) | ✅ Written | ✅ Passed | ➖ Skipped — purely structural (two interfaces, no branching logic); 5 shape/round-trip cases written for coverage instead of triangulation | ➖ None needed |
| 4.2 | `src/shared/thread-record.ts` | Unit (via 4.1) | N/A (new) | ✅ (4.1's RED covered it) | ✅ Passed | ➖ Single vendored module, one SEAM change (`first_surfaced_at` removed) | ➖ SEAM, no further refactor — matches v1 body except the one named change |
| 4.3 | (verification, no new test) | — | — | — | ✅ 108/108 full suite, 8/8 static suite | — | — |

**Triangulation note**: `ThreadRecord`/`HistoryEntry` are pure type declarations with no runtime logic — there is
no branch or transformation to force out with a second input/output pair. The type-only exception in
`strict-tdd.md` §"Choosing Test Layer"/triangulation gate applies: "the task is purely structural... there is
literally ONE possible output (no branching, no logic)". Instead of triangulating, 5 test cases cover distinct
shape scenarios (open baseline, resolved state, history entry, multi-entry history, and the `first_surfaced_at`
absence check) so the module still has real coverage beyond a single smoke case.

## RED evidence (task 4.1, genuine failure captured before GREEN)

With `test/shared/thread-record.test.ts` written and `src/shared/thread-record.ts` not yet created,
`npm run build` failed for the intended reason (missing module, not a syntax or type error):

```
test/shared/thread-record.test.ts:4:49 - error TS2307: Cannot find module '../../src/shared/thread-record.js' or
its corresponding type declarations.

4 import type { HistoryEntry, ThreadRecord } from "../../src/shared/thread-record.js";
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Found 1 error in test/shared/thread-record.test.ts:4
```

After implementing `src/shared/thread-record.ts`, GREEN: `node --test "dist/test/shared/thread-record.test.js"`
→ **5/5 pass**.

Because `first_surfaced_at` is a required field in v1, `sampleThread()` returns a literal typed as `ThreadRecord`
without that field — if the implementation still required it, this file would fail to compile with "Property
'first_surfaced_at' is missing in type...". The absence is therefore enforced at the type level, not only by
the runtime `hasOwnProperty` assertion in the first test.

## Hash computation and reference cross-check

The orchestrator's launch prompt supplied a pinned `v1 body sha256` of
`bd17737239958c20b317c0ea11860716d7db1da23f17eac9677e53d0c49d6160` for `v1:src/state.ts:15-87`, stated as
"independently verified this session, do not re-derive". `sdd-apply` re-derived it anyway per the standing
verification-before-completion rule, using `sed -n '15,87p' | head -c -1 | sha256sum`, got a different value
(`629db3c9e6cf879d322e7d7f3b64192c216e64ecb36d2b584a81b55649578838`), and used that instead — flagging the
supplied value as wrong.

Kairo re-verified both values after this notification, since a bare "I recomputed it and got something else"
claim is not itself evidence either party is right. `head -c -1` unconditionally strips the *last byte* of the
extracted range before hashing. `v1:src/state.ts` is 602 lines; line 87 (the slice's last line, `}`) is followed
by line 88, not EOF — so line 87 genuinely ends with an LF in the source, and `head -c -1` was silently stripping
that real, load-bearing newline rather than an artifact of extraction. That is the bug, not the orchestrator's
value.

Re-verified with three independent tools directly on `git show bf8f365:src/state.ts | sed -n '15,87p'` (no
byte-stripping): Node `crypto`, `sha256sum`, and `openssl dgst -sha256` all produced
`bd17737239958c20b317c0ea11860716d7db1da23f17eac9677e53d0c49d6160` — matching the orchestrator-supplied value
exactly. Confirmed a fourth way by running the exact `vendoredBody()` function from
`test/security/provenance.test.ts:39-66` in Node against the real 602-line source, sliced by array index
(`allLines.slice(14, 87).join("\n")`) both with and without a trailing `\n` appended: the no-trailing-newline
variant reproduces `629db3c9…` (the bug) and the with-trailing-newline variant reproduces `bd177372…` (the
correct value, since that trailing `\n` is exactly the real separator between v1's lines 87 and 88).

| File | Body first line | Body lines | Correct hash |
|---|---|---|---|
| `v1:src/state.ts:15-87` | `` /** One in-thread message after the opening one. `from`... `` | 73 | `bd17737239958c20b317c0ea11860716d7db1da23f17eac9677e53d0c49d6160` |

`src/shared/thread-record.ts`'s header was corrected back to this value. This had no functional test impact
either way (`provenance.test.ts` only asserts `assert.notEqual` for a SEAM's actual-vs-pinned hash), but
documentation honesty is the point (same standard PR-02's item 5 and PR-03's hash cross-check held to) — and here
the honest value was the one already supplied, not the recomputed one.

## Real diff size

Measured with `git diff HEAD --numstat` (staged vs. the branch point on `main`):

| File | + | − |
|---|---|---|
| `src/shared/thread-record.ts` | 74 | 0 |
| `test/shared/thread-record.test.ts` | 89 | 0 |
| `test/fixtures/v1-provenance.json` | 6 | 0 |

- **Authored, budget-counted total**: `thread-record.ts` (74) + `thread-record.test.ts` (89) +
  `v1-provenance.json` (6) = **169 lines**. This is a SEAM (DN-06's `size:exception` applies only to whole-file
  AS-IS copies) — the entire 74-line `thread-record.ts` file counts toward the budget, matching the rule PR-03's
  `secrets.ts` followed. 169 lines is well within the 400-line hard cap and ≈21 lines (≈11%) under the tasks.md
  ≈190-line estimate for this slice — the type-only module needed no additional runtime logic beyond the vendored
  interfaces, so the test twin stayed lean (5 shape assertions, no mocks, no fixtures beyond two small factories).
  No re-slice was needed.
- **SDD bookkeeping** (not review load, per the tasks header's counting rule): `tasks.md` and
  `apply-progress.md` checkbox/section changes, not measured above.

## Corrections applied this round

1. **`v1 body sha256` — `sdd-apply`'s recomputation reverted, orchestrator's original value restored** — see
   "Hash computation and reference cross-check" above. `sdd-apply`'s own re-derivation used a shell one-liner
   (`head -c -1`) that stripped a real trailing newline genuinely present in the v1 source (line 87 is followed
   by line 88 in the 602-line file, not EOF), producing a wrong hash; the orchestrator-supplied value was correct
   all along, confirmed by three independent tools plus a byte-exact rerun of the real `vendoredBody()` function.

## Data hygiene check (AGENTS.md §3)

Grepped `src/shared/thread-record.ts` and `test/shared/thread-record.test.ts` for `@`-prefixed usernames,
8–10-digit numeric ids, and `-100…` chat ids. The only `@`-matches are the synthetic AgentBus wire-level agent
identifiers `@dev1-agent`/`@dev2-agent` (same convention PR-02's vendored fixtures already established as safe —
matching `AGENT_ID_PATTERN`, not Telegram bot usernames or real production identifiers) and TSDoc `{@link ...}`
cross-references; zero 8–10-digit numeric runs; zero `-100…` chat-id-shaped strings. `npm run test:static`
(PT-22 repo-scan) passed with both new files staged and scanned.

## Verification (run in order, from clean)

| Command | Result |
|---|---|
| `rm -rf dist && npm run build` | exit 0, no errors |
| `node --test "dist/test/shared/thread-record.test.js"` | **5/5 pass** (0 fail) |
| `node --test "dist/test/security/provenance.test.js" "dist/test/twins.test.js"` | **3/3 pass** (0 fail) — SEAM hash-inequality holds against the corrected value; registry equality holds; twin coverage holds |
| `rm -rf dist && npm test` (from clean) | **108/108 pass** (0 fail) — up from 103 before this PR |
| `npm run test:static` | **8/8 pass** (0 fail) — same count as PR-03 (no new static-only assertion added by this PR) |
| `git status --short` (after) | only `src/shared/thread-record.ts`, `test/shared/thread-record.test.ts`, `test/fixtures/v1-provenance.json` (staged), `openspec/changes/f1-daemon-registry-thin-client/tasks.md` + `apply-progress.md` (unstaged) changed; nothing under `dist/`, `node_modules/`, or the v1 checkout; no commit made |

Note on staging: as in PR-02/PR-03, the three new/modified files carrying a provenance-relevant identity
(`thread-record.ts`, `thread-record.test.ts`, `v1-provenance.json`) were `git add`-staged (not committed) so
`git ls-files -z` — the mechanism both `provenance.test.ts` and `repo-scan.test.ts` use to enumerate scanned
files — could see them during verification. `tasks.md` and `apply-progress.md` were left unstaged. Kairo reviews
the full working-tree diff and creates the work-unit commit(s).

## Next

Tribunal audit of PR-04 (`bus-v2-f1-pr-04-001`), then PR-05 (`shared/protocol-apply.ts`, SEAM, D-05).

---

# Apply Progress: F1 — PR-05 (`shared/protocol-apply.ts`, SEAM, D-05)

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Branch | `f1/05-protocol-apply` → `main` (stacked on PR-04) |
| Mode | Strict TDD |
| Status | Implemented and verified; tasks 5.1–5.4 marked `[x]`. **Real diff is 609 authored lines — 209 over the 400-line cap and well past the ≈390 tasks.md estimate. Flagged for the orchestrator before this PR opens; see "Budget overage" below.** |

## ⚠ Budget overage — decision needed before this PR opens

Measured with `git diff HEAD --numstat` (staged, vs. the branch point on `main`):

| File | + | − |
|---|---|---|
| `src/shared/protocol-apply.ts` | 311 | 0 |
| `test/shared/protocol-apply.test.ts` | 288 | 0 |
| `test/fixtures/v1-provenance.json` | 6 | 0 |
| `docs/02-architecture/THREAT-MODEL.md` | 2 | 2 |
| **Authored total (budget-counted)** | **609** | |

tasks.md's own forecast called PR-05 "the largest non-exception slice in the whole 45-PR plan… ≈390 lines" and told `sdd-apply` to "watch its real diff size." The real total is **609** — 219 lines over that estimate (56%) and 209 over the 400-line hard cap, a materially larger overage than PR-01's 790-vs-350 re-slice (which was ~2.3x estimate on a scaffold PR with 45 named constants; this is ~1.6x on one state-machine module).

**Why it does not shrink further without cutting real coverage:**
- `src/shared/protocol-apply.ts` (311 lines) is smaller than v1's own vendored body (327 lines, `protocol.ts:7-333`) even after adding a new `RosterEntry` interface and rewriting three doc comments for the D-05 fail-closed behavior — the dedup branch, `isDuplicateEid`, and the two `first_surfaced_at` assignments were removed, not compressed. This is a SEAM, so DN-06's `size:exception` does not apply (PR-03/PR-04 precedent): the whole file counts.
- `test/shared/protocol-apply.test.ts` (288 lines, 20 tests) covers exactly what task 5.1 asks for — REQUEST/ACK/REPLY/RESOLVED/NOTED/IGNORED outcomes, all four `RejectionReason` values, the ADR-13 originator arms, and three dedicated D-05 cases (rejected-unanchored, anchored-not-flagged triangulation, and the arm-bypass-stays-countable case) — plus the REQUEST-anchoring and not-mine cases task 5.2's SEAM change list depends on being exercised. None of the 20 is incidental; each maps to a named behavior in design §8.2/§8.3 or a v1 precedent test.
- **A split was considered and rejected as unsafe, not just inconvenient**: `isAddressee`/`classifyRejection` are the single mechanism every ACK/REPLY/RESOLVED transition routes through. Splitting into "PR-05a: transitions" + "PR-05b: D-05 fail-closed" would ship PR-05a with v1's fail-OPEN anchor behavior live on `main` — reintroducing the exact PT-17 defect this change exists to close, even temporarily. Design §8.3 and tasks.md both describe this as "one cohesive state-machine module, not splittable per design" for this reason, not merely as a size convenience.

**Recommendation**: `size:exception` on cohesion grounds (not the DN-06 AS-IS-hash exception — a new, review-workload exception for this one slice), same as tasks.md's own pre-flagging of PR-05 as an outlier. If the orchestrator prefers a split instead, the only safe boundary I can see is temporal, not mechanical: land PR-05 exactly as implemented (state machine + full test suite, D-05 included from the start), and that itself is already the smallest cohesive unit — I did not find a way to make two safe cuts. Not committed, not opened as a PR; awaiting the orchestrator's decision on how to proceed.

## Scope

`src/shared/protocol-apply.ts` (SEAM from `v1:src/protocol.ts:1-333` @ `bf8f365`), `test/shared/protocol-apply.test.ts`
(apply-side slice adapted from `v1:test/protocol.test.ts`, read-only reference), `test/fixtures/v1-provenance.json`
(one SEAM entry appended), `docs/02-architecture/THREAT-MODEL.md` (PT-16, PT-17 scope cells).

## Design deviation note: `applyEnvelope`'s signature (not itself in the design's "Changes" list, but required by it)

Design §12's Changes list for this row is exactly four items (ThreadRecord import, REPLY drops
`first_surfaced_at`, D-05 fail-closed, `isDuplicateEid` unused) and does not spell out a signature
change. But v1's `applyEnvelope(state: State, incoming, context)` operated over a whole
`state.threads` map plus `state.seen_eids`; v2 has no `State` type at all — `ledger/*` REPLACED
`state.ts`'s schema/load/save (ADR-0030), and design §8.2 step 7 says applyEnvelope runs "over the
**single thread row** loaded as a ThreadRecord (`ledger/threads.ts` adapter)". Implemented that
literally: `applyEnvelope(existing: ThreadRecord | undefined, incoming, context): ApplyResult`,
where `ApplyResult.thread?: ThreadRecord` replaces the old `state: State` return field. This is the
necessary consequence of items (1) and (4) together, not an invented fifth change — noting it here
per the "don't silently deviate" rule since design's own bullet list did not spell it out.

A second gap: v1's `ApplyContext.roster: Record<string, RosterEntry>` imported `RosterEntry` from
`config.ts`, which v2 has not built yet (`daemon/binding-config.ts` is a later PR, and `shared/`
cannot depend on `daemon/`). Defined a minimal local `RosterEntry { user_id: number }` — the only
field this module ever reads off a roster entry — rather than block on an unbuilt module or invent a
speculative fuller shape.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.1 | `test/shared/protocol-apply.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 20 tests across REQUEST/ACK/REPLY/RESOLVED/NOTED/IGNORED, all 4 rejection reasons, 2 ADR-13 arms, 3 D-05 cases | ➖ None needed |
| 5.2 | `src/shared/protocol-apply.ts` | Unit (via 5.1) | N/A (new) | ✅ (5.1's RED covered it) | ✅ Passed | ➖ Single vendored module, changes named in the header | ➖ SEAM, no further refactor beyond the named changes |
| 5.3 | (verification, no new test) | — | — | — | ✅ 128/128 full suite, 8/8 static suite | — | — |
| 5.4 | `docs/02-architecture/THREAT-MODEL.md` | N/A (docs) | N/A | — | — | — | — |

Two test-fixture bugs surfaced and fixed during the first GREEN run (both in the test file, not
production code): (1) the "REQUEST between two other peers" case needs its `to` to be a KNOWN roster
member other than the caller for `isOurBusiness` to return `false` — an unknown `to` fails toward
storing by design (C2), so the fixture needed a fourth roster entry (`@dev4-agent`); (2) the "D-05
arm: continuing own thread" case must use an originator who is NOT `context.agentId`, or the separate
`isOurOwnSend` bypass (our own sends are never re-judged) fires instead of the `continuingOwnThread`
arm the test targets. Both were caught by the very first execution (2/20 failing) and fixed before
re-running; neither touched `src/shared/protocol-apply.ts`.

## RED evidence (task 5.1, genuine failure captured before GREEN)

With `test/shared/protocol-apply.test.ts` written and `src/shared/protocol-apply.ts` not yet created,
`npm run build` failed for the intended reason (missing module, not a syntax or type error):

```
test/shared/protocol-apply.test.ts:11:8 - error TS2307: Cannot find module '../../src/shared/protocol-apply.js' or
its corresponding type declarations.

11 } from "../../src/shared/protocol-apply.js";
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Found 1 error in test/shared/protocol-apply.test.ts:11
```

After implementing `src/shared/protocol-apply.ts` and fixing the two test-fixture bugs above, GREEN:
`node --test "dist/test/shared/protocol-apply.test.js"` → **20/20 pass**.

## Hash computation and reference cross-check

The orchestrator's launch prompt supplied a pinned `v1 body sha256` of
`e8b6f8a427d57f3133e088d7fe8659f66e41ba2c259e57050d30e1514a2ffcbe` for `v1:src/protocol.ts:1-333`
(body = lines 7-333, stated as independently verified three ways this session — Node `vendoredBody()`
against the real 477-line file, `sed | sha256sum`, `sed | openssl dgst -sha256` — with an explicit
warning that a prior session's `head -c -1` shell one-liner produces a WRONG hash on a line-range
slice whose last line is followed by a real line in the source (exactly PR-04's PR history: the same
bug, on `state.ts:15-87`, was caught and reverted last session).

Re-derived independently before trusting it, using the exact target algorithm rather than a blind
byte-strip: `git show bf8f365:src/protocol.ts` (478 elements after `split("\n")`, confirming line 334
is real and non-empty content follows through line 477 — line 333 is `}` and line 334 is the blank
separator before `computeWorkDigest`'s doc comment), array-sliced `lines.slice(6, 333)` (0-indexed,
lines 7-333), joined with `\n`, with a trailing `\n` appended (since line 333 is followed by a real
line 334, not EOF — same rule PR-04 established). Cross-checked three ways:

| Method | Result |
|---|---|
| Node `crypto`, exact `vendoredBody()`-equivalent slice + trailing `\n` | `e8b6f8a427d57f3133e088d7fe8659f66e41ba2c259e57050d30e1514a2ffcbe` |
| `git show bf8f365:src/protocol.ts \| sed -n '7,333p' \| sha256sum` | `e8b6f8a427d57f3133e088d7fe8659f66e41ba2c259e57050d30e1514a2ffcbe` |
| `git show bf8f365:src/protocol.ts \| sed -n '7,333p' \| openssl dgst -sha256` | `e8b6f8a427d57f3133e088d7fe8659f66e41ba2c259e57050d30e1514a2ffcbe` |
| (control) same slice WITHOUT the trailing `\n` | `fb82385de416cf2b1a50d6475bfcf0a04681be5c0068e20d348c941b762dbaac` — confirms the trailing-newline rule matters here too, same as PR-04 |

All three real methods agree with the orchestrator-supplied value exactly. No correction needed —
the header in `src/shared/protocol-apply.ts` carries `e8b6f8a427d57f3133e088d7fe8659f66e41ba2c259e57050d30e1514a2ffcbe`
as supplied.

## Data hygiene check (AGENTS.md §3)

Grepped `src/shared/protocol-apply.ts` and `test/shared/protocol-apply.test.ts` for `@`-prefixed
usernames, 8–10-digit numeric ids, and `-100…` chat ids. `@`-matches are the synthetic AgentBus
wire-level identifiers `@dev1-agent`/`@dev2-agent`/`@dev3-agent`/`@dev4-agent`/`@dev2-unknown` (same
convention PR-02/PR-04 already established as safe — matching `AGENT_ID_PATTERN`, not Telegram
usernames) and one TSDoc `{@link MAX_THREAD_HISTORY}` cross-reference. The four 8–10-digit numeric
runs are the roster `user_id` fixture values, copied unmodified from `v1:test/protocol.test.ts`'s own
`ROSTER` literal (`8223456789`, `8123456789`, `8323456789`, `8423456789`) — the same synthetic values
v1's own test suite already carried; not a token shape (`checkForSecrets`'/PT-22's
`TOKEN_SHAPE_RE` needs a trailing `:` plus a 35-char string, which plain numeric ids never match).
Zero `-100…` chat-id-shaped strings. `npm run test:static` (PT-22 repo-scan) passed with both new
files staged and scanned — confirms this by execution, not only by inspection.

## Verification (run in order, from clean)

| Command | Result |
|---|---|
| `rm -rf dist && npm run build` | exit 0, no errors |
| `node --test "dist/test/shared/protocol-apply.test.js"` | **20/20 pass** (0 fail) |
| `node --test "dist/test/security/provenance.test.js" "dist/test/twins.test.js"` | **3/3 pass** (0 fail) — SEAM hash-inequality holds (the one named change makes the body diverge from the AS-IS reference); registry equality holds; twin coverage holds |
| `rm -rf dist && npm test` (from clean) | **128/128 pass** (0 fail) — up from 108 before this PR (+20 new) |
| `npm run test:static` | **8/8 pass** (0 fail) — same count as PR-04 (no new static-only assertion added by this PR) |
| `git status --short` (after) | only `src/shared/protocol-apply.ts`, `test/shared/protocol-apply.test.ts`, `test/fixtures/v1-provenance.json` (staged), `docs/02-architecture/THREAT-MODEL.md` + `tasks.md` + `apply-progress.md` (unstaged) changed; nothing under `dist/`, `node_modules/`, or the v1 checkout; no commit made |

Note on staging: as in PR-02/PR-03/PR-04, the three new/modified files carrying a provenance-relevant
identity (`protocol-apply.ts`, `protocol-apply.test.ts`, `v1-provenance.json`) were `git add`-staged
(not committed) so `git ls-files -z` — the mechanism both `provenance.test.ts` and
`repo-scan.test.ts` use to enumerate scanned files — could see them during verification.
`THREAT-MODEL.md`, `tasks.md`, and `apply-progress.md` were left unstaged. Kairo reviews the full
working-tree diff, decides how to resolve the budget overage above, and creates the work-unit
commit(s).

## Orchestrator decision on the budget overage (Kairo, Director-authorized this session)

Independently re-verified before deciding: rebuilt from clean and reran `node --test` on the focused
suite (20/20), the full suite (128/128), and `test:static` (8/8) myself, and cross-checked
`git diff main --numstat` line-for-line against the table above (matches exactly). Read
`src/shared/protocol-apply.ts` and `test/shared/protocol-apply.test.ts` in full — the size is real
engineering (dense load-bearing comments on a security-relevant state machine, 20 tests each mapped
to a named behavior, no padding) not inflation.

**Decision: PR-05 gets a one-time, PR-05-scoped size exception, distinct from DN-06.** DN-06's
`size:exception` stays exactly as ratified — AS-IS whole-file vendoring only (`bus-v2-f1-tasks-001`
items 1-2); this does not amend it. This is a separate, narrower exception for this one slice, on
the grounds tasks.md itself already recorded before apply even started (§ "Largest non-exception
slice", line 37: "one cohesive state-machine module") plus one new finding from this session: the
apparent alternative — ship the state machine in one PR and its test twin in a follow-on PR, the
same pattern tasks.md already plans for PR-07b/PR-07c — is not actually safe here, because
`test/twins.test.ts:29-44` requires every `src/**/*.ts` file to have its twin present in the *same*
tree, so the first PR's own merge to `main` would fail CI. This same risk applies to the PR-07b/c
split when that slice is reached; flag it there before assuming that split is CI-safe.

**Additional fix found on review (not part of the flagged overage, small):** `src/shared/thread-record.ts`'s
`to_user_id` doc comment (written under PR-04, before D-05 existed) still described the OLD v1
behavior — "the addressee check FAILS OPEN" — which this very PR replaces with fail-closed. Left
as-is, it would actively mislead a future reader about the current security posture of the exact
mechanism D-05 changes. Corrected in place to describe the fail-closed behavior and point at
`protocol-apply.ts`'s `isAddressee`.

Before opening the tribunal debate, a fresh-context read-only validator agent independently
re-derived the pinned hash (matched), verified all four named design changes against the code and v1
source, reran the full test suite (128/128) and static gates (8/8), and confirmed the twins.test.ts
CI-blocking claim above by reading the test directly. It found one residual defect the first
doc-comment fix (commit `0b86808`) missed: `thread-record.ts`'s `to` field docstring, three lines
above `to_user_id`'s, repeated the same stale "the addressee check fails open" claim. Fixed in a
follow-up commit. No other finding from the validator required a change.

Next: Alpha audits PR-05 (tribunal debate `bus-v2-f1-pr-05-001`) before any commit, same as every
prior PR — the Director's authorization to decide the budget question does not skip that audit.

## Next

PR-06 (`shared/protocol-select.ts` + `shared/fence.ts`, SEAM, D-15) once PR-05 merges.

---

# Apply Progress: F1 — PR-06, re-sliced into PR-06a (`shared/fence.ts`) + PR-06b (`shared/protocol-select.ts`) (SEAM, D-15)

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Branches | `f1/06a-fence` → `main`; `f1/06b-protocol-select` → `main` (serial, both branched from `main` at `ef58020`) |
| Mode | Strict TDD |
| Workflow | **ODD for this slice only** — see "Why ODD, not the SDD dispatcher" |
| Status | Both slices implemented and verified (Strict TDD); tasks 6.1–6.4 deliberately still `[ ]` until PR-06b lands |

## Why ODD, not the SDD dispatcher

The planned `sdd-apply` launch was refused before the child started:

`SDD dispatch refused before child launch: SDD preflight cancelled or invalid; no session consent recorded.`

That gate is host-owned and, by design, not satisfiable by an agent: `extensions/gentle-ai.ts:9255`
calls `runSddPreflight`, which requires a native `ctx.ui.select` confirmation dialog and refuses
dispatch while `prefs.prompted` is false (`lib/sdd-preflight.ts:896-926`). Answering the canonical
`Gentle AI SDD preflight 1/3:`–`3/3:` questionnaire through the agent's own question tool does NOT
create that consent — and manufacturing it would be precisely the "model-authored preflight text
cannot create parent-confirmed authority" defect this repository already recorded twice.

**Environment drift found this session (supersedes the PR-06 handoff instructions).** `gentle-ai` is
now **3.0.2** (was 2.9.1): `sdd-attempt acquire` / `settle` / `status` / `reset` are retired — only
`sdd-attempt grant` remains, and the CLI reports `Runtime attempt operations are retired`. So the
handoff's steps about sizing `--max-changed-lines` and calling `sdd-attempt settle` are obsolete. The
native SDD status still reads `nextRecommended: apply`, 28/210 complete, `blockedReasons: []`. Engram
now also derives the session project from the git remote as `connmuta` and **rejects** writes passed
as `telegram_bus_agent` (`session project does not match requested project`); reads across projects
still work, so the earlier `sdd/f1-daemon-registry-thin-client/*` observations remain readable.

The Director explicitly authorized choosing the workflow for this slice. ODD is the harness default
and SDD is a branch inside it; the branch was unreachable, so the slice ran under ODD **with every
substantive SDD contract preserved**: the same design §12 rows, the same tasks 6.1–6.4, Strict TDD,
the same pinned hashes, the same provenance fixture, the same THREAT-MODEL §4 update, the same
400-line review budget and the same tribunal audit. The delegated writer was `gentle-ai-worker`
(bounded, write-surface-restricted), not `sdd-apply`.

**Disclosed consequence.** The orchestrator — not the `sdd-apply` executor — owns the SDD bookkeeping
for this slice, and no `sdd-apply` phase envelope exists for it. The native SDD status stays truthful
because checkboxes are flipped only when the work is actually complete (i.e. after PR-06b). The ODD
feature document that tracked the slice locally was intentionally **not** committed: AGENTS.md §2
names where live state lives (openspec, Engram, docs, ADRs) and does not include an ODD tree, so
adding one to the product repository would be governance drift; its substance is folded into this
file and the Engram twin.

## Pinned provenance — re-derived independently, four methods, all agreeing

| v2 path | v1 source | verdict | v1 body sha256 |
|---|---|---|---|
| `src/shared/protocol-select.ts` | `src/protocol.ts:335-478` @ `bf8f365` | SEAM | `29bcf0038187541d6448d5c68a554d77b0789fbdcfea77ce087de441d96621ce` |
| `src/shared/fence.ts` | `src/tools/fetch.ts:43-63` @ `bf8f365` | SEAM | `68e241b22383bf6a9ec4a9d112b1960fe4c9c6d00fe2c6f03644f47a978be878` |

Methods: (a) `node` `crypto` running the real `vendoredBody()` from
`test/security/provenance.test.ts`; (b) `sed -n 'A,Bp' | sha256sum`; (c) `sed … | openssl dgst
-sha256`; (d) a round trip that synthesizes the v2 file as header + imports + the range body and
confirms `vendoredBody()` recovers the range. Wrong-value controls (the value obtained if the
trailing newline is wrongly stripped): `110b649676bbff0c1f39b4a4ebe9fa0b962bb6f4c6e5d359ab81296ae5c6dd53`
(protocol) and `6ef490b84bffe7af2110342a027e7f68c60ae86df2ab15b04c0aa9cdb8b3118a` (fetch). **No
`head -c -1`** was used anywhere: that strips a real trailing newline whenever a further line exists
in the source (hostile finding `bus-v2-f1-pr-04-001` item 3).

Range facts: `src/protocol.ts` has 477 real lines; line 335 is `/**`, so the import-stripping step is
a no-op and the body runs 335–477 through EOF with `isNeedsAction` last. `src/tools/fetch.ts` line 63
is followed by real lines 64–65, so its trailing newline is content.

**The registry scanner never validates the header hash against the v1 source** — it only asserts that
a SEAM body *differs* from the pinned value (`provenance.test.ts:113-119`). The pinned value is
therefore verified only by independent re-derivation, which is why it was re-derived four times.

## PR-06a — `src/shared/fence.ts` (SEAM, D-15)

Real SEAM delta versus `v1:src/tools/fetch.ts:43-63`, confirmed by diffing `vendoredBody(v2)` against
the extracted v1 range body:

- restored, verbatim, the label's leading JSDoc from `v1:src/tools/fetch.ts:35-42` (immediately above
  the vendored range) — the fence's layer-7 rationale and its per-entry AUTHORSHIP rule;
- added `FenceOrigin` (`project_id`, `agent_id`, `user_id`) and the `escapeAttribute` helper;
- the opening tag now carries the three origin attributes in a fixed order;
- added the D-15 comment paragraph and rewrote the invariant sentence so it stays true for an
  attributed opening tag;
- the body escape is byte-identical to v1: `body.replace(/</g, "&lt;")`.

Attribute values are escaped `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, in that
order. Rationale: PT-14 requires the origin label to be *trustworthy*, so a value carrying `"` must
not be able to inject a second attribute (a forged `user_id`), and one carrying `>` must not be able
to close the opening tag early — `>` is the character that ENDS a tag and `<` only ever opens one, so
escaping `<` alone would have left the label readable but closable. `escapeHtml` was deliberately **not** reused: it is module-local in
`src/shared/envelope.ts:214` (not exported) and that file is AS-IS with a pinned hash.

TDD: RED observed first (both new test files import modules that did not exist:
`error TS2307: Cannot find module '../../src/shared/fence.js'` from `npm run build`, and
`ERR_MODULE_NOT_FOUND` plus `tests 2 / pass 0 / fail 2` from the focused run), then GREEN.
The 8 fence cases include v1's hostile payload (`v1:test/tools/fetch.test.ts:328-357`), an
attribute-injection case (`agent_id` carrying `"` and an embedded `user_id=` attribute), a two-origin
loop that defeats hardcoding, and an exact-output assertion pinning the whole format. The soundness
helper is a containment invariant — starts with the label, ends with the closing delimiter, exactly
one closing delimiter, exactly two raw `<` — and deliberately does **not** reintroduce v1's replaced
outer-shape regex, which returned `true` on the payload that defeated the control (ADR-12).

## PR-06b — `src/shared/protocol-select.ts` (SEAM)

Real SEAM delta versus `v1:src/protocol.ts:335-477`:

1. `MS_PER_HOUR` re-declared module-local (v1 keeps it at `src/protocol.ts:7`, outside the range);
2. `computeWorkDigest(state, agentId, reminderWindowHours, now)` became
   `computeWorkDigest(threads, agentId, windowHours, now, surfaced: ReadonlySet<string>, checkpointAt: string | null)`
   — design §12's own signature, including the `windowHours` rename it specifies;
3. `Object.entries(state.threads)` → `Object.entries(threads)`;
4. the row component `thread.first_surfaced_at === null ? 0 : 1` → `surfaced.has(id) ? 1 : 0`
   (per-client surfaced state is the ledger's `client_surfaced`);
5. `checkpoint=${state.last_checkpoint?.at ?? ""}` → `checkpoint=${checkpointAt ?? ""}`
   (`string | null` matches `binding_state.last_checkpoint_at TEXT`).

Every other byte of the range is faithful, including all of `Tiers`, `TieredSelection`,
`selectTiered`, `computeAgeHours`, `isReminderDue`, `isNeedsAction` and their load-bearing comments.

**Accepted v1 residue, recorded rather than silently rewritten:** `computeWorkDigest`'s doc comment
still contains the sentence "`next_update_id` is deliberately excluded…". v2 passes a plain thread
map, so the field is not an input at all and the sentence cannot mislead about current behaviour —
the rule it states (Telegram traffic must not flip the digest) is *more* true in v2, not less. It was
therefore kept byte-faithful instead of expanding the SEAM delta with an unaudited doc rewrite.

TDD: RED observed first (`TS2307` for `../../src/shared/protocol-select.js`; the `TS7006`
`implicitly has an 'any' type` errors in the same run had the same cause — with the import
unresolved, `Tiers<string>` inference is lost and the filter callbacks fall back to `any`), then
GREEN, then TRIANGULATE. The 17 cases cover the digest's turn/history/surfaced/checkpoint/reminder
components, the third-party exclusion, all seven F3 `selectTiered` properties, the exact reminder
boundary built from `REQUEST_REMINDER_WINDOW_HOURS`, and the turn-based `isNeedsAction` rule
(including a resolved-thread case that kills a naive `awaiting === caller` implementation).

## Orchestrator review findings — not caught by any automated check

Both were found by reading the new files in full before committing, the same way PR-04's stale
comment and PR-05's second stale comment were found. Neither would have failed any gate.

1. **Incomplete `Changes:` list in `src/shared/fence.ts`.** The module restores the label's leading
   JSDoc verbatim from `v1:src/tools/fetch.ts:35-42`, which sits *outside* the vendored range 43-63.
   That is a real difference between the pinned range body and the v2 body, and a reviewer
   re-deriving the header's claim would have hit an undeclared one. Declared in the header as change
   (3). Deleting the comment instead was rejected: it is faithful v1 text that explains ADR-06 layer
   7, and removing vendored documentation to simplify bookkeeping is the wrong trade.
2. **The digest's `reminders=` component was not pinned by any test.** `computeWorkDigest`'s own
   vendored comment calls `reminder_count` "clock-derived and is mandatory", and warns that dropping
   it leaves the feature "dead on arrival *while appearing to work*". The first pass asserted the
   `isReminderDue` boundary but never that crossing it flips the digest, so a mutant deleting the
   `reminders=` term from `canonical` left all 22 tests green — exactly the "documented guarantee must
   be pinned by a test that can fail" rule (ADR-12 governing rule). Added a test varying only the
   injected clock across the window with every other discrete input held fixed. **Mutant evidence:**
   with that component removed, `npm run build` succeeds and the focused run reports
   `tests 16 / pass 15 / fail 1`, failing exactly "crossing the reminder window flips the digest even
   though no other discrete state moved" and nothing else; restoring the component returns 16/16. The
   file was restored byte-identical (`diff` against the backup is empty).

## Re-slice and budget decision (Director-authorized this session)

| Slice | `src` | `test` | fixture | docs | Authored total | Budget |
|---|---|---|---|---|---|---|
| PR-06a (`fence.ts` + twin) | 74 | 110 | 6 | 2 | **192** | inside 400 |
| PR-06b (`protocol-select.ts` + twin) | 160 | 260 | 6 | 0 | **426** | 26 over |
| PR-06 as one slice (not taken) | 234 | 370 | 12 | 2 | **618** | 218 over |

`tasks.md` estimated ≈315. The real diff is 618. Unlike PR-05 (609, approved as one PR), these are two
**independent** modules with no cohesion argument, and the split is at a clean file boundary, so the
file boundary was used instead of one large exception: PR-06a lands inside budget and carries the
D-15 security control with its own focused review; PR-06b needs a **26-line** PR-scoped exception
distinct from DN-06 (which stays AS-IS-only and is not amended). Grounds for those 26 lines: 143 of
the module's 160 lines are the byte-faithful v1 body the SEAM requires, and 17 behavioral cases plus
a shared `ThreadRecord` fixture helper cannot shed 26 lines without deleting review context — which
the budget rule forbids. Not taken: the implementation/test-twin split across two PRs, which
`test/twins.test.ts:29-44` makes CI-unsafe on the first PR's own merge (the same finding that
carried PR-05).

## Verification (orchestrator-run, from clean, after staging the new files)

| Command | Result |
|---|---|
| `npm run build` (after `rm -rf dist`) | exit 0, no diagnostics |
| `node --test "dist/test/shared/protocol-select.test.js" "dist/test/shared/fence.test.js"` | **25/25 pass** (24/24 before the judgment-day correction added the `>` case) |
| `rm -rf dist && npm test` | **153/153 pass** (up from 128; +25) |
| `npm run test:static` | **8/8 pass** (provenance registry equality + repo scan + pack) |
| `node --test "dist/test/twins.test.js"` | 1/1 (both new modules have their twin) |
| SEAM delta diff vs the v1 range bodies | matches the declared `Changes:` lists exactly |
| mutant deletion of the `reminders=` component | fails exactly the one new test (see finding 2) |

Staging note: as in PR-02…PR-05, the new files were `git add`-ed (not committed) before the local
runs, because both `provenance.test.ts` and `repo-scan.test.ts` enumerate files through `git ls-files`
and would otherwise not see them. The delegated writer may not stage at all, so staging is
parent-owned by necessity and the writer's report accordingly shows the provenance registry failing
pre-staging by set difference — expected, not a defect.

## Data hygiene (AGENTS.md §3)

The new test fixtures use the repository's established synthetic identifiers (`@dev1-agent`,
`@dev2-agent`, `@dev3-agent`, `@dev4-agent`) matching the wire-level agent-id convention, and the
numeric roster id literals already carried by v1's own suite (`v1:test/protocol.test.ts`) — plain
numeric ids, not token-shaped (PT-22's token shape requires a colon plus a 35-character run, which
plain digits never match). Zero chat-id-shaped strings, zero usernames, zero real tenant identifiers,
zero tokens. `npm run test:static` (PT-22) passed with the new files staged, confirming this by
execution and not only by inspection.

## Next

Tribunal audit of PR-06a and PR-06b (`bus-v2-f1-pr-06-001`, one debate covering both units, the
PR-01a/PR-01b precedent) before either PR opens; then PR-06a → CI → merge, then PR-06b → CI → merge
(DN-08 pre-authorizes push/PR-open/merge once CI is green). Tasks 6.1–6.4 flip in the PR-06b commit.

## Independent validator (fresh-context, read-only) — findings and disposition

A fresh-context read-only verifier (`gentle-ai-verify`, no implementation context) reviewed the
committed slice `ef58020..733d283` on its own. It re-derived the pinned hash with its own method
(`git -C ../telegram-agent-bus show bf8f365:src/tools/fetch.ts | sed -n '43,63p' | sha256sum` →
`68e241b2…be878`, matching the header, with the range's trailing `0a` confirmed present via `xxd`),
reproduced the module body hash (`00ab82db…e2f79`) two ways and confirmed it differs as a SEAM
requires, confirmed the registry entry matches the header's identity line exactly on `v1Path`,
`commit` and `verdict`, confirmed the PT-13/PT-14 cells are the only THREAT-MODEL change and that no
other row moved, confirmed both commits' file sets and that PR-06b's files appear in neither, ran
`npm run build` plus the three focused suites itself (7/7, 2/2, 1/1, clean build), and audited all
seven fence cases for failable-ness and the soundness helper's containment shape.

Dispositions:

1. **`Changes:` granularity — accepted, actioned.** It reported that the header does not name, by
   name, the `FenceOrigin` interface, the `escapeAttribute` helper, `wrapUntrusted`'s signature
   change, or the reworded JSDoc paragraph, while judging that the list does cover every
   semantic/behavioural difference. Change (1) now names the required `origin: FenceOrigin` parameter
   explicitly, because PR-23/PR-25 consume that signature and a reader of the header alone should not
   have to infer it. The rest are declarations and a comment reword — the same granularity the
   accepted PR-05 header uses, which likewise does not enumerate its added types or its local helper.
2. **Body-escape coverage — accepted, no action needed.** Only 2 of the 7 cases would fail if
   `body.replace(/</g, "&lt;")` were removed (5 cases use `<`-free bodies). Two independent failing
   cases is what the ADR-12 governing rule requires, and on removal both the escape case and the
   hostile-payload case fail, so the guarantee is genuinely pinned. Recorded as a coverage note.
3. **Commit-scope premise correction — accepted.** The verification request attributed the
   THREAT-MODEL change to `733d283`; it is in `0c58972` (the second commit is docs-only). The content
   assertion held; the imprecision was in the request, not in the change.
4. **`exploration.md:26` staleness — reported, deliberately not rewritten.** That row says the
   pure-function bodies (`selectTiered`, `trimSurfaced`/`trimWaiting`, `wrapUntrusted`) "port
   unchanged" while their inputs change, and `wrapUntrusted`'s input does now change by gaining a
   required `origin`. The same paragraph already qualifies that the inputs change, and design §11 and
   §18 D-15 supersede the exploration phase on this exact point, so the contradiction is resolved by
   the documented precedence rule (`docs/00-INDEX.md`). It is **reported rather than silently
   resolved**, and routed to the tribunal: amending a superseded historical phase artifact is a
   different act from fixing a stale source comment (the PR-04/PR-05 precedent), and the governing
   rule says to report a contradiction instead of rewriting it. Not decided unilaterally.
5. **ADR-0027 v1 citation — no action.** `docs/03-adr/0027-…:41` shows the **v1** `wrapUntrusted` call
   shape; it cites v1 line numbers throughout and the label is unchanged, so it is a correct v1
   citation, not a stale v2 claim. Every other fence reference (`OVERVIEW.md:192`,
   `THREAT-MODEL.md:57,100`, `design.md:457`, the thin-client spec) becomes *more* accurate.

Note on method: the header lives outside the hashed body (`vendoredBody` strips it), so strengthening
change (1) does not disturb either pinned hash — re-confirmed after the edit.

## PR-06b — bookkeeping close and verification

Both slices are now in the tree, so tasks 6.1–6.4 flip to `[x]` in this commit (PR-06a merged with
them still open, which is the honest state for a partially completed task).

`f1/06b-protocol-select` is **stacked on PR-06a's tip** (`4c83c29`), per the ratified
`stacked-to-main` chain strategy: it is retargeted to `main` after PR-06a merges, so its own review
surface is only its three files.

Authored diff for this slice: `src/shared/protocol-select.ts` 160 + `test/shared/protocol-select.test.ts`
260 + its `test/fixtures/v1-provenance.json` entry 6 = **426 lines**. The first pass measured 406
+6 over the ceiling; the review-driven strengthening of four under-powered cases (see the validator
findings below) added 20 more, so the final disclosed overage is **26 lines** over the 400-line review
budget. The registry fixture now carries 8 entries (the 6 pre-existing plus one per slice).

Verification for PR-06b (orchestrator-run, from clean):

| Command | Result |
|---|---|
| `npm run build` (after `rm -rf dist`) | exit 0, no diagnostics |
| `node --test "dist/test/shared/protocol-select.test.js" "dist/test/shared/fence.test.js"` | **25/25 pass** — this is task 6.3's exact command |
| `rm -rf dist && npm test` | **153/153 pass** |
| `npm run test:static` | **8/8 pass** (registry equality with all 8 entries) |
| clean detached worktree at the PR-06b tip | full suite and static suite green, with only the committed files present |

Provenance for this slice re-confirmed with the real `vendoredBody()` after every edit:
`v1:src/protocol.ts:335-477` hashes to `29bcf0038187541d6448d5c68a554d77b0789fbdcfea77ce087de441d96621ce`,
matching the header, and the module body hashes to
`f1389e54dafe9cd523cc0b0b03003cf23d9a08e1a15b77b73365e78fe5160540`, which differs — the SEAM
inequality the scanner asserts.

One review-driven change to this module's test file after the delegated writer's first pass: the
`reminders=` component test described under finding 2 above (that component had no failing test
before it, which is exactly the gap the ADR-12 governing rule exists to catch).

## Independent validator for PR-06b (fresh-context, read-only) — findings and disposition

A second fresh-context read-only verifier (no implementation context) reviewed `4c83c29..262eee2` on
its own and ran `npm run build`, the focused suites, `npm test` and `npm run test:static` (151/151 and
8/8 observed), plus read-only git and v1-checkout reads.

1. **Pinned hash re-derived independently — MATCH.** `git -C ../telegram-agent-bus show
   bf8f365:src/protocol.ts | sed -n '335,477p' | sha256sum` →
   `29bcf0038187541d6448d5c68a554d77b0789fbdcfea77ce087de441d96621ce`, equal to the header, and
   reproduced a second way from the full-line split (7389 chars, same hash; the 16-byte difference the
   two methods report is multibyte UTF-8, not content). It independently confirmed line 477 is the
   file's last line, that it contains `}`, and that the file's final bytes are `;\n}\n` — so **no line
   478 exists** and the `478` in the citation is the array-slice convention, as recorded above.
2. **SEAM inequality holds.** `vendoredBody(v2)` = `f1389e54dafe9cd523cc0b0b03003cf23d9a08e1a15b77b73365e78fe5160540`
   versus the pinned v1 value — differs, which is what the scanner asserts. Matches the value derived
   independently by the orchestrator.
3. **No undeclared delta.** The real diff is exactly three hunks / eight lines, each covered by
   `Changes:` (1) or (2). It noted that change (1) is a *summary* rather than an itemized list — it
   does not spell out that the two replaced expressions are `first_surfaced_at` and
   `state.last_checkpoint.at`. Accepted at the same granularity the tribunal ratified for PR-05's
   header, which likewise summarizes; no undeclared difference exists, which is what DN-06 requires.
4. **Four cases promised more than their assertions could detect — accepted, actioned.** This was the
   substantive finding. Before the fix, a mutant that replaced tier ordering with a *global sort* — the
   exact thing the module's own comment rejects — passed both ordering and reachability, and the
   digest's clock handling was not pinned as its name claimed. Two of the four needed only different
   fixture literals (no added lines); the other two are now pinned by one additional case. The
   `ThreadRecord` fixture keeps both ids and expectations deliberate: the backlog ids now sort *before*
   `"brand-new"`, and the within-tier orders are deliberately non-lexicographic.
5. **Registry.** The entry matches the header identity line exactly on `v1Path`, `commit` and
   `verdict`; the fixture holds 8 entries and the scanner's set-equality assertion passes.
6. **`tasks.md` 6.1–6.4** are flipped and every artefact exists. The verifier could not run 6.3's
   two-file command verbatim under its authorized command set, so the orchestrator's own run of that
   exact command (25/25, from a clean rebuild) is the evidence of record for 6.3.
7. **Commit scopes** are exactly as intended, and `src/shared/fence.ts` / `test/shared/fence.test.ts`
   are not modified relative to `4c83c29` (no double-touch across the two slices).
8. **No other statement is made stale** by the new signature; every reference to
   `computeWorkDigest(threads, agentId, windowHours, now, surfaced, checkpointAt)` agrees with the code.
9. **Traceability gap — reported to the tribunal, deliberately not fixed here.** No scenario in any
   spec of this change mentions the digest, the quiet tick or `unchanged`; the module's behaviour is
   pinned only by its unit twin, while `durable-inbox` covers only the per-client `client_surfaced`
   input the SEAM signature serves. Specs are gated and audited and unchanged since
   `bus-v2-f1-pr-01-001`, so this is a ruling for the tribunal, not an edit for this slice.
10. **`next_update_id` v1 sentence** is flagged as slightly misleading — a reader who has not read v1
    will look for a field that does not exist in this module. It is kept for SEAM fidelity and was
    already recorded above as accepted residue; note that the guarantee it describes ("pure human
    chatter must not flip the digest") *is* pinned, by the third-party-exclusion case.

### Mutant matrix (observed, each with a clean rebuild and a byte-identical restore)

| Mutant applied to `src/shared/protocol-select.ts` | `pass/fail` | Caught by |
|---|---|---|
| digest hashes the raw clock (`now.getTime()`) | 16/1 | the clock case (new in this commit) |
| digest row carries the thread's `opened_at` | 16/1 | the clock case (new in this commit) |
| the checkpoint stops contributing to the digest | 16/1 | the checkpoint case |
| the digest ignores the passed `surfaced` set | 16/1 | the surfaced-set case |
| the digest row drops the `reminders=` term | 16/1 | the reminder-window case |
| `selectTiered` returns a global sort instead of tier order | 15/2 | the F3 reachability case **and** the within-tier ordering case (both strengthened in this commit) |

The first attempt at the checkpoint mutant produced invalid syntax and a broken build; it was
discarded and re-run in a syntactically valid form rather than reported, so the table above contains
no result that came from a failed build.

**Method note for future slices:** restoring a mutated source with `cp` and then running `tsc -b` can
leave stale compiled output in `dist/` when the timestamps fall inside the same granularity, which
reported a phantom failure during this session. Every mutant run above therefore removed `dist/`
first. A phantom failure that survives a source restore should be re-checked from a clean `dist/`
before it is believed.

## Judgment Day audit (substitute for the tribunal debate, on the Director's explicit waiver)

The Arena bridge that hosts the Alpha collaborator was unavailable for this mission
(`127.0.0.1:8766` → `ECONNREFUSED`), and **the Director explicitly waived the tribunal audit for it**,
directing that the mission be completed with the internal gentle-ai capability instead. That waiver
is recorded here and in `docs/05-tribunal/INDEX.md` rather than left as a silent skip: DN-05's
"Alpha audits every unit before it opens" is not satisfied, it is **waived for this slice by the
authority that owns it**, and replaced by the method below.

Judgment Day ran as the adversarial substitute, not as a re-run of the native RDD review (that
lifecycle is a different authority and had already closed `approved` for this candidate). Frozen
target: `ef58020..98ca9ef`, the 8 declared paths, working tree clean. Two blind read-only judges
(`jd-judge-a`, `jd-judge-b`) swept it in parallel with identical scope and criteria — correctness,
edge cases, error handling, security, project conventions — against `design.md` §11/§12/§15/§18 D-15,
the constitution's invariants and wire policy, THREAT-MODEL T06/PT-13/PT-14 and the budget rule.
Neither judge was told any prior finding, and neither was given the other's.

### Ledger (round 1)

| Id | Location | Severity | Causality | Confirmed by both? |
|---|---|---|---|---|
| JD-1 | `src/shared/fence.ts` `escapeAttribute` | WARNING | introduced | **yes** (A: `:39-43`, B: `:35-36`) |
| JD-2 | `docs/02-architecture/THREAT-MODEL.md:137` (PT-14 cell) | WARNING | introduced | **yes** (A and B independently) |
| JD-3 | `openspec/.../apply-progress.md` stale figures | SUGGESTION | introduced | **yes** (A and B independently) |
| JD-4 | `src/shared/protocol-select.ts:61` digest blind spots | WARNING (B) / SUGGESTION (A) | **pre_existing** | yes, same location |
| JD-5 | `src/shared/fence.ts` body escape does not neutralise `&` | WARNING | **pre_existing** | one judge (A) |
| JD-6 | `src/shared/fence.ts:4-8` `Changes:` list breadth | SUGGESTION | introduced | one judge (A) |

Confirmed/suspect/contradiction counts: **4 confirmed by both judges** (JD-1, JD-2, JD-3, and JD-4 at
its stated location), 2 single-judge (JD-5, JD-6), 0 contradictions, 0 CRITICAL.

**JUDGMENT: APPROVED** — no CRITICAL finding existed, so the protocol required no correction round.
The orchestrator nonetheless applied a bounded correction round to the three *introduced* defects
JD-1, JD-2 and JD-3 (see below), because merging a security register and a provenance header that
state something demonstrably false is worse than correcting them. Disclosed rather than dressed up:
the protocol did not *require* those fixes; the deliverable's owner chose them.

### Corrections applied (round 1)

- **JD-1.** `escapeAttribute` now escapes `&`, `<`, `>` and `"`. Both judges verified the hole the
  same way: an origin value carrying `>` ended the opening tag early
  (`project_id="proj-a>"` produced a tag that stopped before `agent_id`), while `assertFenceIsSound`
  still reported sound because it counts raw `<` and the closing delimiter only. Judge B's framing is
  the one that matters: the header's own change (2) claimed a value "can neither close the opening
  tag early nor inject a second attribute", and that claim was **false and unfalsifiable** for `>`.
  Judge A's parallel note that `<` cannot close a tag is correct and the helper's comment now says
  so: `>` ends a tag, `<` only ever opens one. Pinned by a new case; **mutant evidence:** with the
  `>` escape removed, `npm run build` succeeds and the focused run reports 7 pass / 1 fail, failing
  exactly "an attribute value carrying `>` cannot close the opening tag early (PT-14)" and nothing
  else; restored byte-identically, 8/8.
- **JD-2.** The PT-14 cell in THREAT-MODEL §4 is **reverted to `daemon unit`** (PR-06a had appended
  `test/shared/fence.test.ts`). Both judges found the same over-claim from opposite directions: the
  fence twin builds its own `FenceOrigin` literal and asserts only that the wrapper reproduces the
  caller's values, so PT-14's actual claim — values taken from *the binding and the verified sender,
  never from the envelope's own claim* — is pinned nowhere by this slice. The authoritative mapping
  agrees: `design.md:528` assigns PT-14 to `daemon/serve/fetch.ts`, `tasks.md`'s PT→PR map sends it
  to PR-23, and task 25.4 updates the same cells again. A register that credits an unpinned security
  guarantee is worse than a register with a blank cell, so the cell is blank again until PR-23/PR-25
  pins it for real. PT-13's cell keeps `test/shared/fence.test.ts`, which is correct.
  **Consequence for task 6.4:** its checkbox stays `[x]` for PT-13, and PT-14 is deliberately *not*
  updated — the task's instruction was boilerplate applied to a PT whose pinning test this slice does
  not contain. PR-25's task 25.4 inherits it.
- **JD-3.** The stale first-pass figures are corrected: "6-line exception" → 26, "The 16 cases" → 17.
  Both judges caught that the very commit whose subject was "reconcile the recorded PR-06b figures"
  had left two contradictory pairs behind. A record that contradicts itself is a defect in its own
  right.
- **JD-6.** The fence header's `Changes:` now also names the added `escapeAttribute` and the two
  modified vendored comment blocks, so a header-only reviewer — which `design.md:439` explicitly
  contemplates — sees the full delta. The header is outside the hashed body, so the pinned value is
  unaffected (re-confirmed).

### Queued, deliberately not fixed here

- **JD-4 (pre_existing).** The digest has discrete blind spots: `opened_type` (which flips
  `isNeedsAction`), a same-length replacement of a history entry, `closure_delivered`, `to_user_id`
  and a `from`/`to` swap that keeps the turn all leave it unchanged. Judge B found the sharpest
  instance: `MAX_THREAD_HISTORY = 50` **saturates** `history.length`, so once a thread holds 50
  messages a further peer REPLY appends and caps back to 50 while `awaiting`, `ack_count`, `status`
  and the surfaced bit stay identical — a byte-identical digest, so the quiet tick answers "nothing
  changed" while an unread reply waits. That is precisely the "follow-up vanishes" failure the
  module's own comment says the history-length component exists to prevent, and the new test uses
  1-vs-2 entries so it cannot fail on the capped case. **Not fixed here** on purpose: it is v1
  behavior carried unchanged by the SEAM, the ratified change list for this row is fixed, and
  amending a documented "nothing changed" algorithm inside a vendoring slice would ship an
  unreviewed behavioral change to a change detector. Proposed minimal fix for whoever takes it:
  include the last history entry's `eid` in the row (discrete, and it also closes the same-length
  replacement). **Recommended backlog id for the Director.**
- **JD-5 (pre_existing).** The fence body escape neutralises `<` but not `&`, so the fence is not
  injective: `wrapUntrusted("&lt;")` and `wrapUntrusted("<")` are the same string, and a body of
  `&lt;/UNTRUSTED-PEER-INPUT&gt;` decodes to a closing tag for any consumer that entity-decodes
  before reading. Judge A also notes the module's comment justifies the substitution with "`&lt;` …
  so peers read a familiar form", while v1's design chose to escape `<` rather than enumerate tags.
  **Not fixed here** on purpose: THREAT-MODEL §7 ratifies the fence as *inherited unchanged*, the
  design's change list for this row is "(1) origin attributes", and F1 has no entity-decoding
  consumer. Changing a documented, deliberate control needs its own decision and its own tests, not a
  drive-by edit inside a vendoring slice. **Recommended backlog id for the Director**, together with
  the observation that `escapeHtml` in `envelope.ts:214-216` escapes `&` first and is therefore
  injective where this fence is not.
- Judge A's remaining note on JD-1's neighbourhood — a newline or `>` in an attribute value makes the
  opening tag multi-line, which a line-oriented reader could mistake for a second label line — is
  closed for `>` by the correction above; the newline part cannot break the label's *structure* (a
  newline cannot terminate a quoted attribute) and belongs to upstream identifier validation, which
  `PROJECT_ID_PATTERN` (`constants.ts:285`, currently unreferenced) and the registry slices own.

### What the judges verified as sound

Both judges independently re-derived the two pinned hashes from the v1 checkout (including the
wrongly-stripped controls `6ef490b8…` and `110b6496…`), confirmed both module bodies differ from
their pinned values, confirmed the registry's 8 entries equal the scanned set, confirmed the fence's
body-escape cases are failable, brute-forced `selectTiered` (judge B: 1,417,176 cases across sizes
and floors including negatives and empty tiers — zero invariant violations and zero overfills; judge
A: 11 sizes × 7 floor sets, same result), confirmed no continuous quantity leaks into the digest (a
30-hour sweep produces exactly two distinct digests, i.e. only the window crossing), confirmed the
range touches exactly the 8 declared paths with no dependency, no wire change and no edit to a
hash-pinned AS-IS file, and ran the suites themselves (`npm test` 152/152 at the time of judging,
`npm run test:static` 8/8). Judge A additionally confirmed the `Changes:` delta of
`protocol-select.ts` is exactly the five declared substitutions and nothing else.

---

# Apply Progress: F1 — PR-07a (`shared/tool-schemas.ts` + `shared/error-payload.ts`, SEAM)

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Branch | `f1/07a-tool-schemas-errors` → `main` (branched from `main` at `c971e25`) |
| Mode | Strict TDD |
| Workflow | **ODD for this slice only** — the Director chose it this session over the two alternatives below |
| Status | Implemented and verified (Strict TDD); tasks 7a.1–7a.6 `[x]`; audited range `c971e25..dbb7494`, corrected code tip `53d5aad` (round 1 `05ba773`, round 2 `53d5aad`) |

## Audit path (Director decisions, session 9)

Two questions were put to the Director **before any write**, because the handoff (step 4) requires the
audit path to be decided rather than assumed and one gated task instruction conflicted with a ratified
rule:

1. **Audit:** ODD + Judgment Day — the `bus-v2-f1-pr-06-waiver-001` substitute — **not** `sdd-apply`
   and **not** the Arena tribunal. `sdd-apply` is still refused before child launch by the host-owned
   native preflight (`extensions/gentle-ai.ts` ~L9255 → `lib/sdd-preflight.ts:896-926`), which an agent
   can neither satisfy nor fabricate; the Arena Orion bridge was down. The pre-slice status was
   re-read and truthful: `nextRecommended: apply`, **32/210**, `blockedReasons: []`. This records no
   new waiver — DN-05 for this slice rests on the same Director decision that carried PR-06.
2. **PT-07 cell:** left as `static (client bundle)`. Task 7a.6 asks for the PT-02 **and** PT-07 cells,
   but PT-07's assertion is bundle-level (`security/client-bundle`, design §14 and §528 → PR-34/PR-40)
   while this slice pins only the constructor's *shape* half. Annotating it would repeat exactly the
   PT-14 over-claim two PR-06 judges caught independently. Task 7a.6 stays `[x]` for its PT-02 half; the
   PT-07 half is **deliberately not executed** and PR-34/PR-40 own it. This is the only deviation from
   the gated `tasks.md` text in this slice and it is disclosed here rather than written into
   `tasks.md`, whose task text stays as audited and whose checkboxes are the only edit.

## Scope and budget (measured, not estimated)

Final figures are after both correction rounds; the audited tip `dbb7494` measured 398 and the final
code tip measures 420.

| Path | Lines | Kind |
|---|---|---|
| `src/shared/tool-schemas.ts` | 114 | SEAM (range extract of two v1 files) |
| `src/shared/error-payload.ts` | 66 | SEAM |
| `test/shared/tool-schemas.test.ts` | 146 | twin |
| `test/shared/error-payload.test.ts` | 80 | twin |
| `test/fixtures/v1-provenance.json` | +12 | two SEAM registry entries |
| `docs/02-architecture/THREAT-MODEL.md` | +1/−1 | PT-02 file-name cell |
| **budget total** | **420 / 400** | **20-line disclosed PR-scoped exception** — see the correction rounds |

The tasks-phase estimate was ≈290 lines. That under-count is the one PR-01a already recorded
(`bus-v2-f1-pr-01-001`): a SEAM module's doc comments must be **re-authored**, never copied, and the
estimate counted v1's lines instead. The first draft measured 402 and 2 lines were trimmed from the two
`Changes:` blocks rather than taking an exception; the audited tip landed at 398, and the two bounded
correction rounds below carry it to 420 (`114 + 66 + 146 + 80 + 12` plus the 2-line cell).

## TDD cycle evidence

| Task | Test file | Safety net | RED | GREEN | TRIANGULATE |
|---|---|---|---|---|---|
| 7a.1 | `test/shared/tool-schemas.test.ts` | N/A (new module) | ✅ `tsc` failed with `TS2307` at `(11,8)` plus `TS2578` at `(60,3)` | ✅ 9/9 | ✅ 9 cases: key-set, PT-02 forbidden keys, stripped extra key, compile-time `from`, accept table, 16-row refusal table, `approval_ref` blank |
| 7a.2 | `src/shared/tool-schemas.ts` | covered by 7a.1 | ✅ (7a.1's RED) | ✅ | ✅ four mutants, all killed |
| 7a.3 | `test/shared/error-payload.test.ts` | N/A (new module) | ✅ `TS2307` at `(11,8)` plus `TS2578` at `(27,3)` | ✅ 7/7 | ✅ 7 cases: refinements, closed shape, constructor keys, exact allow-list, retryable table, serializer, no-Telegram-import |
| 7a.4 | `src/shared/error-payload.ts` | covered by 7a.3 | ✅ (7a.3's RED) | ✅ | ✅ four mutants, all killed |
| 7a.5 | focused + full + static | — | — | ✅ 18/18, 169/169, 8/8 | — |
| 7a.6 | `docs/02-architecture/THREAT-MODEL.md` §4 | — | — | ✅ PT-02 cell carries `test/shared/tool-schemas.test.ts` | — |

**The RED caught an author error, which is the point of writing it first.** 7a.1's refusal table
originally asserted that a `REPLY` needs only a `thread`; the RED failed with
`expected to accept {"type":"REPLY","body":"on it","thread":"a1b2c3d4e5f6"}`. v1 requires `to` for
**every** type except BROADCAST — REPLY, ACK and RESOLVED included (`v1:test/tools/send.test.ts:181,404,420`).
The accepted-input and refusal tables were corrected so each refusal case isolates exactly one
violation, which is also what makes the mutant below attributable.

## Pinned provenance — re-derived independently

| v2 path | v1 source | verdict | v1 body sha256 (pinned) | wrong-value control |
|---|---|---|---|---|
| `src/shared/tool-schemas.ts` | `src/tools/send.ts:47-109` @ `bf8f365` | SEAM | `84aae049e711e5ec6725007d561e65cebcf3ca3b9035333ae9b2b734494d42e6` | `c16ce5a50aa6c438541b51626c9289c156695688219c135c199ee915cca2a6e1` |
| `src/shared/error-payload.ts` | `src/index.ts:45-103` @ `bf8f365` | SEAM | `1f59f8f8fa186e22ab1281f4ca9a2dded1f559eb9f9e43b6c7494c8c01a3d948` | `b8990a6a74974e22dabfbffee11dd87718d1d40531d9973c605c6223b767ef76` |

Methods, two of them independent of each other: (a) `python` re-implementing the real `vendoredBody()`
over `git show bf8f365:<path>`; (b) shell `git show bf8f365:<path> | sed -n 'A,Bp' | sha256sum`. Both
agree on both values. **The method itself was validated against an already-ratified value**: the same
shell pipeline over `src/tools/fetch.ts:43-63` reproduced `68e241b2…`, the fence hash pinned in
`bus-v2-f1-pr-06-001`. The wrong-value controls above are what you get if the range's own terminating
newline is wrongly stripped (`head -c -1`), used here **only** to produce the control — the pinned
values themselves are the exact byte range including that newline, per the `bus-v2-f1-pr-04-001` rule.
The registry's own scanner still never validates a pinned hash against v1; these two values were
re-derived from the read-only checkout, not read off the headers.

**Range convention.** `src/tools/send.ts:47-109` and `src/index.ts:45-103` are both interior ranges,
so both carry their terminating newline; neither extends to EOF. A module assembled from **two** v1
ranges can name only one in the header and the fixture (`v1Path` is a single `\S+` token in the header
grammar), so the header cites the larger, primary range and the `Changes:` line names the second
explicitly. The SEAM assertion is unaffected — it only requires the v2 body to *differ* from the pinned
value, which an assembly of two ranges trivially does.

## Mutant matrix — every mutant killed, no phantom failures

`rm -rf dist` before every mutant (a `cp`-restored source plus a stale `dist/` produced a phantom
failure in an earlier session). Each mutant was built first: a mutant whose build fails is not evidence.

| Module | Mutation | Focused result | Killed by |
|---|---|---|---|
| `tool-schemas` | declare `chat_id` in the base schema | 3 fail | exact key set, PT-02 forbidden keys, "extra key is stripped" |
| `tool-schemas` | drop the `basis` cross-field `.refine()` | 1 fail | the refusal table |
| `tool-schemas` | `isApprovalRefValidForInputType` returns `true` unconditionally | 2 fail | refusal table + the whitespace-only case |
| `tool-schemas` | `isToValidForInputType` returns `true` unconditionally | 1 fail | refusal table |
| `error-payload` | put `BRIDGE_BUSY` back in the allow-list | 1 fail | exact allow-list |
| `error-payload` | `retryable` hardcoded `true` | 2 fail | unclassified-code case + listed/unlisted pair |
| `error-payload` | always emit a stray `retry_after_s: undefined` | 1 fail | constructor key set |
| `error-payload` | re-add a Telegram-classification import | 1 fail | the source-level no-Telegram-import assertion |

The last mutant needed a temporary stub module, because no `telegram.ts` exists yet in `src/` and the
import cannot even resolve: a forbidden-import assertion whose subject cannot compile proves nothing.
With a stub in place the build succeeded and exactly the import assertion failed; stub and mutation were
then removed and the tree confirmed identical to the commit.

## SEAM deltas, as a header-only reviewer sees them

Both headers carry a non-`none` `Changes:` line, as `provenance.test.ts` requires of every SEAM, and
each names its **full** delta — including the comment blocks and the one function that is new rather
than moved, which is the JD-6 correction PR-06's judges asked for on `fence.ts`:

- `tool-schemas.ts`: two v1 ranges into one module; imports relocated to `shared/envelope.js`; the
  leading JSDoc restored from `v1:src/tools/send.ts:36-46` **plus** one added paragraph covering the
  destination half of the same structural guarantee (v1 stated it only for `from`).
- `error-payload.ts`: `toTelegramErrorPayload` and its caller are not vendored (they need
  `telegram.ts`'s `classifyErrorChain`, which the client closure must not contain); `RETRYABLE_TOOL_CODES`
  loses `BRIDGE_BUSY`; the retained JSDoc keeps v1's sentences plus four declared additions, among them
  `toolErrorPayload` — the fallback branch v1 kept inline inside `toToolErrorPayload`, lifted into its
  own export so the allow-list stays the single place `retryable` is decided, and so the daemon route
  (PR-31) and the client constructor (PR-34) compose instead of duplicating it.

## Verification from a clean detached worktree

Run three times: at the pre-audit tip `f3b3383`, at the round-1 tip `05ba773`, and at the round-2 code
tip `53d5aad` — identical results every time.

```
git worktree add --detach ../telegram_bus_agent-worktrees/verify-07a-r2 53d5aad
npm ci --ignore-scripts && npm run build
node --test "dist/test/**/*.test.js"   -> 169 tests, 169 pass, 0 fail
npm run test:static                    ->   8 tests,   8 pass, 0 fail
(node --test on the three focused files) ->  18 tests,  18 pass, 0 fail
```

Only the committed files are present in that tree; the worktree was removed as soon as the run
finished. `git diff --name-status c971e25..53d5aad` lists those five code/test/fixture paths, the
`THREAT-MODEL.md` cell and the two SDD bookkeeping files (`tasks.md`, `apply-progress.md`) that the
same slice added — the bookkeeping is what the budget rule excludes from review load, and the claim
here is only about the rest: **no** edit to any hash-pinned AS-IS file, no wire change, no dependency
change. The doc commits that follow `05ba773` carry no code.

## Correction round 2 (fix-caused defects only)

Both judges re-judged the frozen ledger plus the round-1 delta. They confirmed every round-1 fix real and
falsifiable (C1's mutant now kills, A3's field-set pins fail on an added key, B4's case can fail, both
pinned hashes re-derive, the allow-list is untouched) and found **no behavioural regression and no
CRITICAL**. What they did find was four defects the correction round itself created — the same pattern
PR-06's round 2 produced — all fixed here:

| Fix-caused | Item | Correction |
|---|---|---|
| C3 (both) | The `Changes:` clause claimed the added JSDoc paragraph states "the destination half … and the `to_user_id` half", but the paragraph named only `chat_id`/`bot`/`group`/`to_chat` | The paragraph now names `to_user_id` and the roster derivation, so the header claim is true |
| C4 (both) | C2's fix left the twin titling `toolErrorPayload` "the client-local constructor" and driving `DAEMON_DOWN` through it — the exact misuse C2 was about, now sourced from the test | The case is titled for the tool-level constructor, uses a real tool-level code, and asserts `retryable: false` |
| C5 (both) | This record said round 1 cost "12 net lines"; the real figure is **17** (415 − 398) | Corrected to 17 |
| C6 (one) | The claim that `git diff --name-status c971e25..05ba773` is "exactly the five code/test/fixture paths plus the THREAT-MODEL cell" omitted the two SDD bookkeeping files inside that range | Reworded below |
| C7 (one) | `export type SendToolInput` is at v1:111 with line 110 blank, i.e. **two** lines past the cited range, not one | Corrected in the header |

## Re-judgment 2 (terminal) and verdict

The second and final scoped re-judgment ran over the round-2 fix delta `05ba773..53d5aad` plus the
frozen round-2 ledger (C3–C7). It confirmed C3, C4 (the titled case), C6 and C7 fixed and their claims
true, and found no CRITICAL and no behavioural regression. It found three defects my own record still
carried plus one contested item:

| Id | Judges | Item | Disposition |
|---|---|---|---|
| D1 | both, WARNING | The per-path budget table still held the pre-round-2 counts (`tool-schemas.ts` 112, `error-payload.test.ts` 77), so its rows summed to 415 while its own total row said 420 | **Fixed here** — rows corrected to 114 and 80, and the table now sums to 420 |
| D2 | both, WARNING | The exception paragraph enumerated `115 + …`, one more than the file's 114, so it implied 421 | **Fixed here** — 114 |
| D3 | one, SUGGESTION | The Status field still named round 1's tip as "corrected range" | **Fixed here** — Status names both tips |
| D4 | **contradiction** | `test/shared/error-payload.test.ts:60` drives the client-taxonomy code `UNBOUND_PROJECT` through `toolErrorPayload`. Judge A called it introduced (the C4 fix left it); judge B called it pre-existing (present since the slice's first commit, `f3b3383`, and untouched by both rounds). Its asserted `retryable: false` happens to equal design §10's value for that code, so nothing behaves wrongly — the defect is the pattern a future reader copies | **Escalated to the Director.** The round budget is exhausted (two fix rounds, two re-judgments) and the judges disagree on causality, so the skill's rule is an explicit human decision rather than a third round |

**Terminal verdict.** Three audit passes, two bounded fix rounds, two scoped re-judgments.
**0 CRITICAL** and **no confirmed severe finding** in any round; `scoped_rejudgment: approved` on the
reviewed range. The D1–D3 record fixes were applied after this re-judgment (they are SDD bookkeeping,
excluded from the review load, and leaving a self-contradicting record is itself a defect class this
repository has recorded twice) — disclosed here rather than presented as re-audited.

**`JUDGMENT: APPROVED`** for the reviewed range `c971e25..53d5aad`, with three items carried to the
Director: S1 (pre-existing `constants.ts` pin), A4 (design §12's stale AS-IS rows over a SEAM module),
and D4 (the contested-causality test pattern).

## Carried forward to PR-07b (re-verified here, as the handoff asked)

**D4, first commit of PR-07b (Director decision).** `test/shared/error-payload.test.ts`'s `errorResult`
case drives the client-taxonomy code `UNBOUND_PROJECT` through `toolErrorPayload`. Nothing behaves
wrongly — the value the tool-level allowlist yields for it happens to equal design §10's client value —
but it models the pattern C2/C4 exist to forbid, so change the example to a tool-level code when
PR-07b touches that file. The round budget was exhausted when it was found (two fix rounds, two
re-judgments) and the two judges disagreed on its causality (one called it introduced by the round-1
correction, one pre-existing since the slice's first commit), so it was escalated and decided by the
Director rather than fixed in a third round.

The tasks-phase plan allows PR-07b to cover `shared/tool-output.ts` and, if its twin pushes it past
400 lines, to ship the twin as a separate PR-07c. **That split is not CI-safe and must not be used.**
`test/twins.test.ts` walks every `src/**/*.ts` and fails when the twin is missing, so a PR that lands
`tool-output.ts` without `test/shared/tool-output.test.ts` fails its own merge — the same finding that
carried PR-05. PR-07b is estimated at ≈284 extracted + ≈100 twin; the PR-07a evidence says the real
number will exceed that estimate once the doc comments are re-authored. Decide *before* opening
PR-07b: trim to fit, or take a **disclosed** PR-scoped exception like PR-06b's 26 lines. Never split a
module from its twin.

## Judgment Day audit (round 1) — substitute for the tribunal debate

Two blind read-only judges (`jd-judge-a`, `jd-judge-b`) were launched in parallel over the frozen
range `c971e25..dbb7494`, each told to falsify the record's claims rather than trust them, and each
required to return only `{"findings":[…],"evidence":[…]}`. **No CRITICAL finding.** Ledger:

| Id | Severity | Causality | Verdict | Item |
|---|---|---|---|---|
| C1 | WARNING | introduced | **corroborated by both** | The PT-02 shape assertion inspected `sendInputBaseSchema`, not the schema the tools and the daemon actually use, and omitted `to_user_id`. Judge A proved it with a zod 4.6.5 probe: a `bot` key added to the refined and exported `sendInputSchema` passed every assertion in the file, and the tool surface accepted it. |
| C2 | WARNING | introduced | **corroborated by both** | `toolErrorPayload`'s JSDoc told PR-34 to build the client-local payloads on it, while design §10's client taxonomy marks `DAEMON_DOWN`, `DAEMON_IDENTITY_MISMATCH` and `IPC_ERROR` retryable — none of which is in the tool-level allowlist. Following the shipped doc, PR-34 would mark a transiently-down daemon permanent. |
| A3 | SUGGESTION | introduced | one judge | The exact field set was pinned only for `send`; `fetch`/`thread` were covered behaviourally, so an extra optional key satisfied every assertion. |
| A4 | SUGGESTION | introduced | one judge | design §12's reuse table marks `src/tools/send.ts:47-109` and `src/index.ts:29-42` **AS-IS** → `shared/tool-schemas.ts`, while the module ships as SEAM. The record did not report that contradiction. |
| B3 | SUGGESTION | introduced | one judge | The header under-disclosed its delta: `export type SendToolInput` comes from `v1:src/tools/send.ts:111`, one line past the cited range, and the three per-tool JSDoc lines were rewritten from `agentbus_*`. |
| B4 | SUGGESTION | introduced | one judge | The case named "…survive serialization" never serialized anything: it read two fields off module-level literals and could not fail. |
| S1 | WARNING | **pre_existing** | one judge (suspect) | `src/shared/constants.ts:3` pins the blind-stripped hash of `src/config.ts:26-166` (`4ce5e514…`) instead of the rule-conformant `039d53a2…`. Pre-existing from the PR-01b lineage, outside this slice's frozen range. Queued, not fixed here. |

### A4 — the contradiction, reported rather than resolved silently (AGENTS.md §2)

design §12's table carries one row per v1 range (`src/tools/send.ts:47-109` → AS-IS;
`src/index.ts:29-42` → AS-IS), while this module is SEAM because it is **assembled** from both. The
tribunal ruling `bus-v2-f1-tasks-001` items 1–2 settles it ("a module assembled from line ranges of
several v1 files is a SEAM by construction") and task 7a.2 repeats it, so the SEAM verdict is the
correct one and the §12 rows are the stale side. Nothing is changed in `design.md` here: it is gated
and audited, so the contradiction is recorded for the Director instead. The registry cannot express
it either — `v1Path` is a single token, so the second range appears only in the `Changes:` prose.

### S1 — queued for the Director with its own evidence

Re-derived here with my own method, plus the control that proves the method: `src/state.ts:15-87`
pins `bd177372…`, which is the value **with** the terminating newline (rule-conformant), while
`src/config.ts:26-166` pins `4ce5e514…`, which is the value **without** it. `039d53a2…` is the
rule-conformant value. The scanner never notices, because for a SEAM it only asserts *inequality*.
**Not fixed here**: it is pre-existing, one judge alone reported it, and it touches a file outside
this slice; changing a pinned hash also invalidates the wrong-value-control table PR-04 recorded.
Recommended minimal fix for whoever takes it: re-pin `constants.ts:3` to `039d53a2…` and record the
old value as the strip control. **Recommended backlog id for the Director.**

**Closed by the B-19 re-pin (appended 2026-09-17, after this ledger was frozen; the rows above stay as
recorded).** The Director filed it as backlog **B-19** and, in session 10's delegation, authorized the
minimal fix. `src/shared/constants.ts:3` now pins `039d53a2…` and `4ce5e514…` is recorded as the strip
control; PR-04's conclusion above is corrected in place, and this ledger's S1 row is left untouched
because it was true when frozen. See the `## B-19 — provenance re-pin` section at the end of this file
and the tribunal record `bus-v2-f1-b19-repin-001`.

### Note for PR-34 (raised by C2)

`client/errors.ts` must implement **design §10's client taxonomy** itself — `DAEMON_DOWN`,
`DAEMON_IDENTITY_MISMATCH` and `IPC_ERROR` are `retryable: true`; `DAEMON_VERSION_MISMATCH`,
`UNBOUND_PROJECT`, `BINDING_CHANGED`, `WRONG_ROOM` and `BINDING_MISMATCH` are `false` — and must
**not** route client-local codes through `RETRYABLE_TOOL_CODES`, which classifies v1 tool codes only.

## Correction round 1 (bounded, introduced items only)

Per the Director's authorization and the PR-06 precedent (correct what this slice introduced, queue
what it did not), one bounded round fixed C1, C2, B3 and B4 and folded A3 into C1's fix. A4 became a
report rather than a change; S1 is queued. Commits `aedd5d9`, `05ba773`.

| Finding | Correction | Falsifiability re-checked |
|---|---|---|
| C1 | Every forbidden key is now exercised behaviourally against the refined, tool-visible `sendInputSchema`; `to_user_id` joins the set; each read-only schema's exact field set is pinned | Mutant "add `bot` to the refined schema" now fails 1 test (it passed all of them before); mutant "add `to_user_id` to the base" fails 3 |
| C2 | The JSDoc states the function is the TOOL-LEVEL fallback and that the client-local family keeps design §10's classification | The claim is now consistent with `design.md:399-402` and with the allow-list the twin pins |
| B3 | `Changes:` names `SendToolInput` (v1:111) and the three rewritten per-tool JSDoc lines, and no longer claims v1 stated the guarantee "only for `from`" | Header-only review now sees the whole delta |
| B4 | The case serializes both payloads through `errorResult` and compares the round trip | The case can now fail |

**Disclosed PR-scoped exception: 20 lines over the 400-line policy.** The slice measures **420**
changed lines (`114 + 66 + 146 + 80 + 12` in `src`/`test`, plus the 2-line THREAT-MODEL cell). It was
inside the policy at **398** before the audit; round 1 cost **+17** (415) and round 2, which fixed the
defects round 1 itself created, cost **+5** (420). The Director authorized the correction round with a
disclosed PR-scoped exception — the same instrument as PR-06b's 26-line one, distinct from DN-06's
AS-IS exception — and was told to expect ~10-15 lines; the real figure is 20, and this is the honest
number rather than a trimmed one. A prose-only compression pass was attempted and yielded ~1 line, so
the alternatives were deleting reasoning the judges had just validated or disclosing the overage. This
is a review-load disclosure, not an unreviewed change: every added line is a test assertion or an
accuracy fix, and the extra 20 lines are 5% of the policy.

## Verification after the correction round

```
node --test "dist/test/shared/tool-schemas.test.js"   ->  9 tests, 9 pass
node --test "dist/test/shared/error-payload.test.js"  ->  7 tests, 7 pass
node --test "dist/test/security/provenance.test.js"   ->  2 tests, 2 pass
npm test                                              -> 169 tests, 169 pass, 0 fail
npm run test:static                                   ->   8 tests,   8 pass, 0 fail
```

## Next

Scoped re-judgment of the frozen ledger plus the fix delta (`dbb7494..HEAD`), then push and open the PR.

---

# Apply Progress: F1 — PR-07b (`shared/tool-output.ts`, SEAM)

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Branch | `f1/07b-tool-output` → `main` (branched from `main` at `a3b56c3`) |
| Mode | Strict TDD |
| Workflow | **ODD for this slice only** (handoff §2, the settled path). `sdd-apply` is still refused before child launch by the host-owned native preflight, so **no `sdd-apply` phase envelope exists for this slice**; the orchestrator owns the bookkeeping below |
| Status | Implemented and verified (Strict TDD); tasks 7b.1–7b.3 `[x]`; audited range `a3b56c3..2a66fdc` |
| Pre-slice status | read truthfully before any write: `nextRecommended: apply`, **38/210**, `blockedReasons: []` |

## Scope and budget (measured, not estimated)

| Path | Added | Deleted | Kind |
|---|---|---|---|
| `src/shared/tool-output.ts` | 340 | 0 | SEAM, range extract of `v1:src/tools/fetch.ts:65-348` (284 vendored lines) |
| `test/shared/tool-output.test.ts` | 201 | 0 | twin (ships in the same PR — see below) |
| `test/fixtures/v1-provenance.json` | 6 | 0 | one SEAM registry entry |
| `test/shared/error-payload.test.ts` | 7 | 3 | D4 (own commit, `27100ce`) |
| **budget total** | **554** | **3** | **disclosed PR-scoped exception of 154 lines over the 400-line policy** |

The tasks phase estimated ≈385 (≈284 extracted + ≈100 twin). The gap is the one PR-01a recorded
(`bus-v2-f1-pr-01-001`): a SEAM module's doc comments must be **re-authored**, and an estimate that
counts v1's lines under-counts. The first draft measured **549**; a prose pass over both files brought
it to **495** before the authorization request, and the Director authorized that exception explicitly
this session (options offered: disclose 495 · chain PR-07c for the shape half ≈449 · fit at ≈405 by
under-disclosing the header).

**It opened the audit at 495 and closed at 554: round 1 cost +59 net** — 56 of them the twin's shape
pins and the rewritten fence case, 3 the module's header — every line of it a coverage gap the two
judges found (`JD-A-002`, `JD-B-001`, `JD-B-003`), not new scope. The Director authorized the 495
figure and reserved the merge, so this growth is disclosed here and in the PR rather than absorbed
silently. Precedents: PR-06b 26 lines, PR-07a 20 — both far smaller, which is why this slice's
justification rests on the design-mandated 284-line vendored range rather than on the precedent alone.

**Why the PR-07c split the task block allows is not CI-safe** (re-verified by reading the test, handoff
§2.4): `test/twins.test.ts:29-44` walks every `src/**/*.ts` and fails when `test/**/<same>.test.ts` is
missing **in the same tree**, so a PR that lands the module without its twin fails its own merge. The
twin therefore ships here, and the exception is taken instead of the split.

## TDD cycle evidence

| Task | Test file | Safety net | RED | GREEN | TRIANGULATE |
|---|---|---|---|---|---|
| 7b.1 | `test/shared/tool-output.test.ts` | N/A (new module) | ✅ `tsc` failed with `TS2307` at `(12,8)`, plus `TS2344` at `(127,3)` and `TS2578` at `(158,3)` — both secondary, both caused by the missing module | ✅ 7/7, and 6/6 at the corrected tip (round 1 removed one case — see the ledger) | ✅ 6 cases: trim key set + marker, overdue verbatim, `trimWaiting` key set, folding drops the body while the overdue branch keeps it, the declared key set and every declared shape, `FetchToolInput` excess-property check |
| 7b.2 | `src/shared/tool-output.ts` | covered by 7b.1 | ✅ (7b.1's RED) | ✅ | ✅ seven mutants, none surviving (below) |
| 7b.3 | focused + full + static | — | — | ✅ 16/16, 176/176, 8/8 | — |

**The RED caught a twin author error, which is the point of writing it first.** The first draft asserted
that the full-form fixture's own keys equal the declared eighteen; it failed, correctly — three of the
eighteen are per-tick optional (`needs_action_summary`, `waiting_on_peer_summary`, `gap_warning`) and a
full tick carries fifteen of them. The case now pins the fifteen at runtime and the eighteen by
compilation. The RED run's line numbers above are from that draft; the numbers a reviewer can re-derive
are the ones in the mutant matrix, which ran on the committed twin.

## Pinned provenance — re-derived independently

| v2 path | v1 source | verdict | v1 body sha256 (pinned) | wrong-value control |
|---|---|---|---|---|
| `src/shared/tool-output.ts` | `src/tools/fetch.ts:65-348` @ `bf8f365` | SEAM | `25d39d9ceb07e585c0b6d9a12510fe445c9e81e78e401f2e3feb30c230ba0607` | `01c35ebf62eb9c5e04d10f612484100d06f9d21c993a5e9ac4392587f7fbfdac` |

Two methods, independent of each other: (a) shell `git show bf8f365:src/tools/fetch.ts | sed -n '65,348p' |
sha256sum`; (b) `python` re-reading the blob and hashing the joined lines 65-348 plus the terminating
newline. Both agree. **The method validates itself against two already-ratified pins**: the same two
methods reproduce the fence's `68e241b2…` from `src/tools/fetch.ts:43-63` and `thread-record`'s
`bd177372…` from `src/state.ts:15-87`. The control is what you get when the range's own terminating
newline is wrongly stripped (`head -c -1`), used **only** to produce the control: 65-348 is an interior
range, so the pinned value includes that newline (`bus-v2-f1-pr-04-001`).

## Mutant matrix — each built first on a cleaned `dist/`, each restored byte-identically

**These seven rows are the pre-audit tip (`2a66fdc`, the 7-case twin).** Their pass counts belong to that
revision and their type-level line numbers are stale for the shipped artifact — every one was re-measured
on the corrected tip in the round-2 sweep below, which is the table to check against the shipped tree.

The four behavioural mutants are killed by named failing tests; the three type-level ones are reported
as **mechanism proofs** (the build fails with the diagnostic at the assertion's own line), not as test
kills, because for a compile-time assertion that diagnostic *is* the assertion firing.

| # | Mutation | Observed | Killed by |
|---|---|---|---|
| M1 | `trimSurfaced` copies every field forward (`return { ...entry, body_omitted: true }`) | 6 pass / **1 fail** | "a trimmed needs_action entry is exactly the five carry-forward fields plus the marker" |
| M2 | drop `trimSurfaced`'s overdue exemption | 6 pass / **1 fail** | "an OVERDUE entry is returned untouched" |
| M3 | `trimWaiting` copies the body through (`...entry`) | 5 pass / **2 fail** | the `trimWaiting` key-set case **and** the fence case's `"body" in trimmed` assertion |
| M4 | `trimWaiting` stops setting `body_omitted` | 6 pass / **1 fail** | the `trimWaiting` key-set case |
| M5t | rename `Conditions.open_thread_backlog` | build fails `TS2561` ×2, at `tool-output.test.ts(116,62)` and `(141,30)` | the two `Conditions` literals — the shape is pinned by compilation |
| M6t | `FetchToolInput` regains `chat_id?: number` | build fails `TS2578` at `tool-output.test.ts(131,3)` | the `@ts-expect-error` is load-bearing, not decorative |
| M7t | `FetchToolOutput` gains an optional `extra_debug?: number` | build fails `TS2344` at `tool-output.test.ts(105,3)` | the two-way key-set exhaustiveness alias |

## SEAM deltas, as a header-only reviewer sees them

The header's `Changes:` lists six clauses — a superset of the two the task block prescribes, and
deliberately so, because B3 in PR-07a was a header that under-disclosed its delta. The two a reviewer
must not miss are:

- `trimSurfaced`/`trimWaiting` are **exported** (v1 kept them module-private): they are the compact
  tick's only rendering, and design §8.4 has the daemon serve it from here rather than re-deriving the
  rule.
- `Conditions` is **declared here**, carried from `v1:src/state.ts:89-111`: the response reports it and
  no `shared/` module owns it (design §2 lists no `shared/conditions.ts`), while design §12 marks v1's
  state container REPLACED by `ledger/*`. The type is therefore a wire shape; the raised set stays
  ledger-side.

## Verification from a clean detached worktree

The tree verified is the one that was committed: the dangling tree built for verification hashes to
`28472b09…`, identical to `2a66fdc^{tree}`, so the run transfers to the committed tip exactly.

```
git worktree add --detach ../telegram_bus_agent-worktrees/verify-07b <verified tree>
npm ci --ignore-scripts && npm run build
node --test "dist/test/**/*.test.js"                   -> 176 tests, 176 pass, 0 fail (pre-correction tip; 175/175 after round 1)
npm run test:static                                    ->   8 tests,   8 pass, 0 fail
node --test (the three focused files)                  ->  16 tests,  16 pass, 0 fail
git ls-files --eol src/shared/tool-output.ts test/shared/tool-output.test.ts -> i/lf w/lf
```

The worktree was removed as soon as the run finished (the directory is empty again), and only committed
files were present in it. `git diff --name-status a3b56c3..2a66fdc` lists exactly the four paths in the
budget table — **no** edit to any hash-pinned AS-IS file, no wire change, no dependency change.

## Reportable contradictions (reported, not resolved — AGENTS.md §2)

1. **design §12's row for this range says AS-IS over a SEAM module.** The row marks
   `src/tools/fetch.ts:65-348` types **AS-IS** → `shared/tool-output.ts`, while `tasks.md` 7b.2 and the
   tribunal ruling `bus-v2-f1-tasks-001` items 1-2 make a module extracted from a v1 line range a
   **SEAM by construction**. The registry settles it independently, and by body alone: `vendoredBody`
   strips the provenance header before hashing, so the header is irrelevant to the comparison — the two
   `export` keywords on `trimSurfaced`/`trimWaiting` and the declared `Conditions` block are what make
   the body differ from the pin, and an AS-IS entry requires exact equality. This is the same A4-class
   contradiction PR-07a reported for `tool-schemas.ts`, and the handoff predicted PR-07b would meet the
   same table shape. `design.md` is gated, so nothing is changed there. **Round 1 corrected this entry's
   own wording**: it had named the re-authored header as one of the causes, which is exactly backwards —
   `vendoredBody` strips it (findings JD-A-003 and JD-B-004, corroborated by both judges).
2. **`Conditions`' home.** Recorded above as SEAM change 4. `design.md` §2's file list has no
   `shared/conditions.ts`, so declaring it in the one shared module that consumes it is the only
   design-consistent option; a later daemon PR (PR-31's `ipc/routes.ts`, the ledger's
   `conditions-store.ts`) can import it from here instead of re-declaring the wire shape.

## Deviations from the gated task text (disclosed, not written into the gate)

1. `Changes:` is a six-clause superset of the two clauses task 7b.2 names. No clause it names is
   contradicted; the full delta is what the provenance rule and PR-07a's B3 finding require.
2. **The `export` on `trimSurfaced`/`trimWaiting` is a v2 choice, not a design mandate**, and it is a
   deviation from design §12's AS-IS row for this range: that row mandates no export, no spec or design
   section names either function except `exploration.md:26` (which places their *bodies* with the
   daemon's split handler), and the word "compact" does not appear in `design.md` at all. The header and
   this record say exactly that since round 1 (finding JD-A-001); the pre-correction header cited design
   §8.4 as if it required the export, and commit `2a66fdc`'s message repeats that overstated
   attribution. The message is not rewritten — the audited range is frozen and force-push is blocked
   (DN-08) — so the correction is recorded here instead.
3. **`digest` is pinned as carried, not as computed.** Task 7b.1 names "rendering of the fetch digest"
   as this twin's coverage; the twin pins that `FetchToolOutput` carries a `digest` key (the declared-key
   alias, falsifiable — M7t) while the digest's VALUE stays `shared/protocol-select.ts`'s business, whose
   own twin pins it. The pre-correction twin's only digest assertion was `typeof digest === "string"` on
   a test-local literal, which could not fail; round 1 removed it and records the narrowing here
   (finding JD-B-001).
4. The pinned `v1 body sha256` is the hash of the cited **range** (65-348, terminating newline
   included), not of the whole `src/tools/fetch.ts`. That is the ratified convention (§3,
   `bus-v2-f1-pr-04-001`) and exactly what PR-07a shipped for its own range rows.
5. `docs/02-architecture/THREAT-MODEL.md` §4 is **unchanged**, and that is the rule check rather than an
   omission: this slice's Requirements line names no PT id, no PT row names `shared/tool-output.ts`,
   PT-13 is owned by `test/shared/fence.test.ts` (PR-06a) and PT-02 by `test/shared/tool-schemas.test.ts`
   (PR-07a). Annotating a cell here would repeat the PT-14 over-claim two PR-06 judges caught. Round 1
   removed the twin's restatement of PT-13's fence-soundness assertions for the same reason (JD-B-003).
6. **Audit-tooling drift, disclosed:** handoff §2.2 says the judges return exactly
   `{"findings":[…],"evidence":[…]}` (how PR-07a recorded them). The installed `jd-judge-a`/`jd-judge-b`
   agents and the current Judgment Day skill mandate the graph-v1 shape `{"rows":[…]}` and forbid prose
   beside it. The runtime contract wins; round 1 returned rows in that shape, canonicalized below.
7. **The correction round ran on WARNING rows.** The skill's strict reading is that WARNING and
   SUGGESTION rows are informational and never schedule a fix; PR-07a's practice, under the Director's
   authorization, was to fix the corroborated and introduced ones, and handoff §2.2's settled route ends
   in "a bounded correction round". Round 1 followed that route. **No CRITICAL row was found.**

## Judgment Day round 1 (substitute for the tribunal debate)

Two blind read-only judges (`jd-judge-a`, `jd-judge-b`) ran in parallel over the frozen range
`a3b56c3..1b73722`, each told to falsify this record's claims rather than trust them. **Neither returned a
CRITICAL row.** Both used the runtime's `{"rows":[…]}` shape (deviation 6). Canonicalized ledger, each
row re-verified here before it was scheduled:

| Id | Severity | Judge(s) | Verdict | Item |
|---|---|---|---|---|
| JD-A-001 | WARNING | A | **confirmed** | Header clause 3 justified the two exports with design §8.4, which mandates nothing of the kind ("compact" appears 0 times in `design.md`), and the deviations list never named the export |
| JD-A-002 | WARNING | A | **confirmed** | The twin constrained no member of `LogEntry`, `RejectedEntry`, `UnappliedEntry`, `UnannouncedClosure` or `PendingSummary`: a mutant deleting `LogEntry.basis` or narrowing `UnannouncedClosure.resolved_at` left the whole suite green |
| JD-B-001 | WARNING | B | **confirmed** | The only digest assertion was `typeof digest === "string"` over a test-local literal — it could not fail — and the coverage narrowing against task 7b.1 was undisclosed |
| JD-B-002 | WARNING | B | **confirmed** | The gated carried-findings note still described D4 in the present tense although `27100ce` had closed it, and `tasks.md` carried no apply-time amendment |
| JD-A-003 + JD-B-004 | SUGGESTION | **both** | **confirmed as one finding** | The AS-IS/SEAM rationale named the re-authored header as a cause, but `vendoredBody` strips the header before hashing |
| JD-B-003 | SUGGESTION | B | **confirmed** | The fence case restated PT-13's soundness assertions (owned by `test/shared/fence.test.ts`), and its title claimed a "compact path" guarantee the case did not exercise — `trimSurfaced`'s overdue branch was untested against the fence |
| JD-A-004 | SUGGESTION | A | **confirmed** | The `Conditions` round-trip assertion could not fail for any value the declared type admits |

Judge A's four mutant line/column claims and its `grep -c compact` figure were re-checked against the
frozen tree and are exact. The two judges' rows were entirely disjoint except for the AS-IS rationale,
which both reached independently.

### Corrections applied (round 1, introduced items only)

| Finding | Correction | Falsifiability re-checked |
|---|---|---|
| JD-A-001 | Header clause 3 rewritten: the export is a v2 choice with its real reasons, and design §8.4 is cited only for the per-client serve handler. Deviation 2 records it | `grep -c compact design.md` → 0; the clause no longer claims a mandate |
| JD-A-002 | `SameShape` pins — key set **and** structure — for every declared shape | M9t, M8t, M10t, M11t, M12t and M13t each now fail the build at the pin's own line; M9t and M8t were green before |
| JD-B-001 | The `typeof digest` assertion removed; the narrowing recorded as deviation 3 | The digest's presence is pinned by the declared-key alias, which M7t kills |
| JD-B-002 | An apply-time amendment appended to the gated carried-findings note (`tasks.md`); the audited text above it is unchanged | The gate now states D4's closure |
| JD-A-003 + JD-B-004 | The rationale corrected in place, with the correction disclosed inside the entry | The two causes named are the `export` keywords and the `Conditions` block, both re-verified against `vendoredBody` |
| JD-B-003 | The case retitled and rewritten: the folding branch drops the body even when it is a well-formed fenced one, the overdue branch keeps it raw, and fence soundness stays with its PT-13 owner | M2 and M3 each fail it (below) |
| JD-A-004 | The case deleted rather than dressed up; `Conditions` is pinned by `_ConditionsShape` instead | M8t-class mutants prove the replacement pin can fail |

**Round 1 measured +59 net lines** (module +3, twin +56): every one a coverage gap or an accuracy fix from
the ledger above, none of it new scope. The suite is **175 tests** after round 1 (176 before): the single
test removed is the decorative `Conditions` case, and the pins that replace it are compile-time.

### Mutants added or re-run in round 1 (on the corrected tree, each built first)

| # | Mutation | Observed |
|---|---|---|
| M2 (re-run) | drop `trimSurfaced`'s overdue exemption | **4 pass / 2 fail** — the identity case and the rewritten fence case's overdue assertion |
| M3 (re-run) | `trimWaiting` copies the body through | **4 pass / 2 fail** — the `trimWaiting` key-set case and the folding case |
| M8t | narrow `UnannouncedClosure.resolved_at` to `string` | build fails `TS2344` at `tool-output.test.ts(154,3)` (green before the fix) |
| M9t | delete `LogEntry.basis` | build fails `TS2344` at `(144,3)` (green before the fix) |
| M10t | add a member to `PendingSummary` | build fails `TS2344` at `(167,3)` |
| M11t | add an optional member to `NeedsActionEntry` | build fails `TS2344` at `(131,3)` |
| M12t | add an optional member to `WaitingOnPeerEntry` | build fails `TS2344` at `(138,3)` |
| M13t | add a required member to the inline `checkpoint` shape | build fails `TS2344` at `(169,32)` **and** `TS2741` at `(179,3)` (the `FULL_OUTPUT` literal) |

**A defect the round-1 fix itself introduced, found by its own mutant run:** the first version of the
shape pins used mutual assignability alone, and M9t stayed green through it — an object with an extra
optional property is still assignable to one without it. `SameShape` (key set *and* structure) was
written in response, and M9t then failed at the pin. That is the class the round-2 scoped re-judgment
exists to check, so it is disclosed here rather than presented as a clean fix.

### Round 2 — every mutant re-measured on the corrected tip (`5c3ba96`)

Round 1 left two defects of its own, both fixed in round 2 and both found by finishing the sweep rather
than by the judge's verdict (which named no reason beyond the outcome): the pre-audit figures above were
still presented as the artifact's, and `SameShape`'s comment claimed that "only both together reject
every member-level regression this module can take" — a universal no mutant demonstrates, now narrowed to
what was actually measured. This table is the authoritative one for the shipped tree.

| # | Mutation | Observed on the corrected tip |
|---|---|---|
| M1 | `trimSurfaced` copies every field forward | 5 pass / **1 fail** — the five-carry-forward-fields case |
| M2 | drop `trimSurfaced`'s overdue exemption | 4 pass / **2 fail** — the identity case and the folding case |
| M3 | `trimWaiting` copies the body through | 4 pass / **2 fail** — the `trimWaiting` key-set case and the folding case |
| M4 | `trimWaiting` stops setting `body_omitted` | 5 pass / **1 fail** — the `trimWaiting` key-set case |
| P1 | `FetchToolInput` gains an optional key | `TS2344` at `tool-output.test.ts(129,36)` |
| P5 | `RejectedEntry` narrows `reason` to one literal | `TS2344` at `(150,3)` |
| P6 | `UnappliedEntry` gains a member | `TS2344` at `(152,36)` |
| M8t (= P7) | narrow `UnannouncedClosure.resolved_at` to `string` | `TS2344` at `(154,3)` |
| P8 | `SkippedCounts` gains a member | `TS2344` at `(157,3)` **and** `TS2741` at `(181,3)` |
| P9, M5t (= P17) | narrow `Conditions.state_quarantined` / rename a `Conditions` member | `TS2344` at `(160,3)`, plus `TS2561` at `(184,62)` for the rename |
| M10t (= P10) | add a member to `PendingSummary` | `TS2344` at `(167,3)` |
| P12 | narrow `cursor.advanced` to `true` | `TS2344` at `(170,28)` **and** `TS2322` at `(180,55)` |
| P13 | add a member to `omitted` | `TS2344` at `(171,29)` **and** `TS2741` at `(183,3)` |
| P14 | widen `gap_warning.possible` to `boolean` | `TS2344` at `(173,3)` |
| M7t (= P15) | add an optional key to `FetchToolOutput` | `TS2344` at `(120,3)` |
| M6t (= P16) | `FetchToolInput` regains `chat_id` | `TS2344` at `(129,36)` **and** `TS2578` at `(198,3)` |
| M13t (= P11) | add a required member to the inline `checkpoint` shape | `TS2344` at `(169,32)` **and** `TS2741` at `(179,3)` |
| M9t | delete `LogEntry.basis` | `TS2344` at `(144,3)` |
| M11t | add an optional member to `NeedsActionEntry` | `TS2344` at `(131,3)` |
| M12t | add an optional member to `WaitingOnPeerEntry` | `TS2344` at `(138,3)` |
| P18 | narrow `NeedsActionEntry.age_hours` to a literal | `TS2344` at `(131,3)` |

Every type-level row above is the assertion firing at its own line, and no pin was found vacuous: the
fifteen of them were each mutated, not a sample. The complement is that no behavioural mutant survives.

## Round 2 (terminal) — scoped re-judgment of the round-1 fix delta

Both judges received the same frozen ledger (SHA-256
`3ec3996a3fafcb03847aa822ce3b92f93742b23cb1a94f9d6fdbcbdec722db95`) and resolved only their own four rows.

| Pass | Judge A | Judge B |
|---|---|---|
| Re-judgment 1, `1b73722..5c3ba96` | JD-A-001 `verified`, **JD-A-002 `regression`**, JD-A-003 `verified`, JD-A-004 `verified` | JD-B-001…004, all `verified` |
| Re-judgment 2 (terminal), `5c3ba96..cec18ef` | all four `verified` | all four `verified` |

**Why a second round ran, and what it fixed.** The native resolution shape carries no reason, so the
`regression` on JD-A-002 could not be read off the verdict. Rather than guess, soften the row, or
present the fix as clean, the mutation sweep was finished by hand and the two defects the round-1 fix
had itself left were found and fixed in `cec18ef`: `SameShape`'s JSDoc asserted a universal that no
mutant demonstrates, and this record's mutant matrix still presented the pre-audit pass counts and stale
type-level line numbers as the shipped artifact's. The terminal re-judgment then resolved all eight rows
`verified`, which is also the confirmation that the reported regression was one of those two.

**Terminal verdict.** Two audit passes, two bounded fix rounds, two scoped re-judgments. **No CRITICAL
row in any pass**, no confirmed severe finding, no behavioural regression, every frozen row closed
`verified` by both judges. The round-2 sweep is the one that matches the shipped tree: fifteen type pins
mutated one by one and none vacuous, four behavioural mutants all killed.

**`JUDGMENT: APPROVED`** for the reviewed range `a3b56c3..cec18ef`. The two reportable contradictions
(design §12's AS-IS row and `Conditions`' home) are carried to the Director as reports rather than
fixes, and **DN-05 is explicitly unsatisfied for this slice** — no tribunal debate occurred, so no
Arena consensus exists and none is claimed. The record commits that followed the terminal re-judgment
(the round-2 ledger above, the tribunal entry) are SDD bookkeeping, excluded from the review load and
**not** re-audited.

## Next

**Merged as PR #10 (`bd3c6ed`) and swept.** Nothing is pending for this slice: `HANDOFF.md` was
rewritten for PR-08, `LOG.md` prepended, the status lines swept in `AGENTS.md`, `README.md`,
`docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml`, the audit-path record added to
`docs/05-tribunal/INDEX.md`, and the three backlog rows this audit produced filed (B-19, B-20, B-21) and
closed by the post-merge integrity sweep below. The ODD feature document was deleted at close, as
PR-07a's was; its substance is this record and Engram.

---

# B-19 — provenance re-pin (`src/shared/constants.ts`), the post-merge integrity sweep

Out of band with respect to the slice above: this closes a defect the PR-07a audit reported and PR-07b
re-confirmed, under the Director's session-10 delegation ("toma las riendas … tienes toda mi
autorización"). It is **not** a slice of `f1-daemon-registry-thin-client` and consumes no slice budget;
it changes no behaviour.

| Field | Value |
|---|---|
| Change | One token in one provenance header: `src/shared/constants.ts:3` |
| Defect | The header pinned `4ce5e514…` for `v1:src/config.ts:26-166`. `bus-v2-f1-pr-04-001` fixes a pin as the exact byte range **including** its terminating newline, so the correct value is `039d53a2…`. No gate could see it: for a SEAM the registry asserts only *inequality* against the pin |
| Why now | Reported by PR-07a's audit as S1 (`bus-v2-f1-pr-07a-audit-001`), re-confirmed by PR-07b's, filed as backlog **B-19**, and authorized by the Director in session 10's delegation |
| Fix | `constants.ts:3` → `039d53a2b54f8c1a061c602f419e6272cd1f8a3fe260301d7fe36b4e892e15e`; `4ce5e514…` recorded as the strip control; PR-04's own conclusion corrected in place (it had called the wrong value "honest"), with its frozen S1 row left untouched |

**Re-derived with two methods before the pin was touched, and the method validated against a ratified
value** (the same two methods reproduce the fence's `68e241b2…`):

```
git -C ../telegram-agent-bus show bf8f365:src/config.ts | sed -n '26,166p' | sha256sum
  -> 039d53a22b54f8c1a061c602f419e6272cd1f8a3fe260301d7fe36b4e892e15e   (pinned)
python: '\n'.join(lines[25:166]) + '\n' over the same blob
  -> 039d53a22b54f8c1a061c602f419e6272cd1f8a3fe260301d7fe36b4e892e15e   (agrees)
control, the range joined with '\n' and NO trailing newline
  -> 4ce5e514f95c4a73bbaa49e01d5fe41f707552e2928b204a148bf279b2a1b48a   (the superseded value)
```

**Verification.** `npm run build` clean; `node --test` over `constants.test.js` + `provenance.test.js`
**8/8**; the full suite and `test:static` re-run in the same session (**175/175**, **8/8**) — the
registry's SEAM inequality assertion passes either way, which is precisely why it could not have caught
this. The superseded value occurred **11 times in 7 files** at `HEAD` (`git grep -n 4ce5e514 HEAD`) and
each occurrence was dispositioned: the header itself (re-pinned to `039d53a2…`); PR-04's record
(corrected in place, its conclusion recorded as wrong); PR-07a's frozen ledger row and its
carried-forward cell, the PR-01b and PR-02 debate records and PR-07b's ledger (left exactly as recorded,
with a closure note appended where they spoke in the present tense); and the live-state files and LOG
entry that carried the defect itself (00-INDEX, CHECKLIST, HANDOFF). Every remaining occurrence is now
labelled the **recorded strip control** or sits inside a frozen historical record; none presents
`4ce5e514…` as the current pin.

**Audit of this change — the review was declined, so the risk-gated path ran instead.** The ordinary
native review was offered for this candidate and the host resolved consent as `declined_this_candidate`
(`lineage_created: false`, `mutation_performed: false`, `reset_eligible: false`), so no review authority
exists for it and none is claimed. Receipt-driven Development prescribes exactly this fallback: the
candidate is treated as high risk, the writer self-verifies, and a separate independent verifier always
runs. `gentle-ai-verify` ran read-only over this diff and reported: the pin re-derived with three
independent methods plus the control confirmed; the 63 exported constants of `constants.ts` compared
between `HEAD` and the candidate at runtime (identical); no other file moved and no hash-pinned body
changed; the record's test figures reproduced. It also raised seven record defects — six real and
corrected in this commit, one tested and rejected: it held that `apply.tribunal_state` never contained
`": "` and needed no quoting, but the staged value does contain it, in this session's own appended
sentence, and its unquoted form is rejected by a strict parser, so the quoting was required.
**Judgment Day was deliberately not run**: there is no behavioural surface for a two-lens adversarial
pass to attack, and inventing one would misrepresent what that instrument is for.

---

# PR-08a — `shared/token-shape.ts` + `shared/project-file.ts` (re-sliced at apply time from PR-08)

**Slice status:** implemented; **both independent lifecycles closed** at the code tip `ddfa1c3`,
re-sliced at apply time from PR-08 into PR-08a/PR-08b. Judgment Day returned **approved** for
`014f661..ddfa1c3` after one bounded correction round, and the ordinary native review closed
**approved** with its authority burned. The tribunal is **not** available (Arena bridge down), so this
slice is audited by the substitute path and **DN-05 is unsatisfied** — the same disclosure PR-06,
PR-07a and PR-07b carry.

| Field | Value |
|---|---|
| Branch | `f1/08a-shared-validators` → `main`, from `main` @ `014f661` |
| Code commits | `984c2f3` (`token-shape.ts` + its twin), `888c1ec` (`project-file.ts` + its twin), `ddfa1c3` (Judgment Day round 1 + the four folded hardening rows) |
| Docs commit | `44ea9a1` (the re-slice note, the PT cells, this record) |
| Requirements | `project-binding › Committed project file schema` (PT-06); `project-binding › Token-shape validator` (PT-05, D-29) |
| Provenance | none — PR-08a vendors **no** v1 range; `test/fixtures/v1-provenance.json` stays at 11 entries |
| tsconfig | untouched: both modules live in `src/shared/`, already referenced by the root project |

## Why PR-08 was re-sliced (measured, not estimated)

The tasks phase planned PR-08 at ≈370 authored lines against a 400-line budget. The realised slice is
**1,400 authored lines** (`git diff --numstat` over the ten files: 983 code, 251 doc-comment, 166
blank), i.e. **3.5× the budget and 2.3× the largest PR this repository has accepted** (PR-05, 609).
That is not a rounding error, so it was escalated to the Director before any commit, with the four
options (one PR with a 1,400-line exception / two stacked PRs / four file-boundary PRs / trim tests and
comments). The Director chose the file-and-dependency boundary: **PR-08a** (the two shared validators)
and **PR-08b** (roster hash + the CLI), each with its own disclosed, PR-scoped exception. Precedent:
the same in-place re-slice as PR-01 → PR-01a/PR-01b and PR-06 → PR-06a/PR-06b. The split is not
cosmetic: `cli/validate.ts` imports `project-file.ts`, so PR-08b's candidate stacks on PR-08a's and the
review unit for each half is roughly half.

Root cause, stated plainly: the tasks-phase estimate for this slice was **3.8× under** (≈370 vs 1,400),
and the two halves are over budget *in the same way* — the test files carry one assertion per rule the
gated documents state (DATA-MODEL §1's field table, the four content rules, the unknown-key path). The
budget rule forbids trimming review context to fit, which is why an exception is declared rather than a
smaller slice claimed.

## Scope and budget (PR-08a)

| Path | Authored lines, final | At the audited tip `888c1ec` |
|---|---|---|
| `src/shared/token-shape.ts` | 99 | 82 |
| `test/shared/token-shape.test.ts` | 120 | 114 |
| `src/shared/project-file.ts` | 316 | 247 |
| `test/shared/project-file.test.ts` | 419 | 305 |
| **budget total** | **954 / 400** — **554-line PR-08a-scoped exception** | 748 / 400 |

The correction round grew the slice by **206 lines** (748 → 954), which is the documented expectation
rather than a surprise: PR-07a grew 398→420 and PR-07b 495→554, and the four hardening rows the
Director folded into the same round are the reason this figure is larger than those. The growth is
tests and doc comments, never review context removed.

Grounds for the exception, in the shape PR-06b's was granted: these are two modules that share one
contract (`project-file.ts` applies `token-shape.ts` to the parsed document), so splitting them at the
file boundary would put one module's consumer in a different PR than its provider for no review gain;
and the test files carry one assertion per documented rule — uniqueness, `referee` membership, the four
content rules, the unknown-key path per level, and the never-echo property — every one of which the
mutation rounds below show can fail. Trimming them is exactly what the budget rule forbids.
The exception is **PR-08a-scoped** and distinct from DN-06 (which stays AS-IS-only and is not amended).

## TDD cycle evidence

Red before green, per module, both twins shipped in the same commit as the module they test.

| Step | Command | Observed RED |
|---|---|---|
| 8.1 RED | `node node_modules/typescript/bin/tsc -b` | `TS2307: Cannot find module '../../src/shared/project-file.js'` and `…/token-shape.js` — the legitimate brand-new-module RED per `strict-tdd.md` |
| 8.1 RED (first green attempt) | `node --test "dist/test/shared/project-file.test.js" "dist/test/shared/token-shape.test.js"` | 38/44 pass, **6 fail** — see the defect below |
| 8.2 GREEN | same two commands | **44/44** pass |

**The RED caught a real defect, which is the point of the order.** `parseProjectFile` returned
`{ ok: true, file }` whenever the schema passed, discarding the content findings collected by the walk:
a file with a valid shape and a token-shaped value in a schema-valid field was **accepted**. The six
failures were the content-rule cases. Fixed by refusing when either the schema fails or content problems
exist, and pinned by mutant M2 below. Two smaller corrections came from the same round: an assertion of
mine expected the literal spelling `Authorization` where the message names the rule token
`authorization_literal`, and one content case seeded `project_id` — which also violates the slug pattern,
so the structural problem correctly came first; the case now seeds a schema-valid field.

**One test-side defect the security gates caught, recorded because it is a reusable trap:** the first
draft of `token-shape.test.ts` used the *synthetic deny-list markers* from
`test/security/repo-scan.test.ts` as a fake operator marker. That test excludes only itself from the
repository scan, so quoting its markers in any other file fails PT-22. Replaced with a marker invented
for this test; `npm run test:static` then passed. The token fixtures keep the house 7-digit bot-id run
so they exercise the shared shape while staying outside PT-22's 8–10 digit scan (documented in both
test files).

## Mutant matrix — each built first, each restored byte-identically

Seven mutants were built during the slice against the pre-split working tree (all seven killed). Four of
them attack PR-08a's files, and those four were **re-run bound to the actual candidate** `888c1ec` in the
clean verification worktree, so this PR's evidence is not inherited from a tree that no longer exists:

| # | Mutant | Test that killed it |
|---|---|---|
| M1 | Drive-prefix rule asked *after* the path-separator rule, so a Windows path is reported as the weaker rule | `test/shared/project-file.test.ts` — “reported as a drive prefix, not a separator” |
| M2 | Content problems dropped on the success path — **the exact defect the RED caught** | `test/shared/project-file.test.ts` — the four content cases |
| M3 | `z.strictObject` replaced by a stripping `z.object` | `test/shared/project-file.test.ts` — “unknown key is rejected, never stripped” |
| M4 | `assertNoTokenShape` stops consulting the shared secret table | `test/shared/token-shape.test.ts` — the PEM, `.env`-style and configured-marker cases |

The three remaining mutants (roster hash including `username`, the CLI echoing the document on a refusal,
and the CLI running on import) attack PR-08b's files and are recorded there. Every mutant ran on a
byte-restored copy and the restore was verified by `sha256` before the next one; the round ends with the
candidate green again.

## Verification from a clean detached worktree

`git worktree add --detach ../telegram_bus_agent-worktrees/verify-08a 888c1ec`, then
`npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js"`, then
the same worktree re-checked-out at `014f661` (with `rm -rf dist` first, because a stale `dist/`
silently fakes results) to **measure** the baseline instead of citing it:

| Tree | Tests | `test:static` |
|---|---|---|
| `014f661` (`main`, measured) | **175 / 175** | 8 / 8 |
| `888c1ec` (PR-08a code tip) | **219 / 219** | **8 / 8** |

PR-08a therefore adds **44 tests**: `test/shared/token-shape.test.ts` (14) +
`test/shared/project-file.test.ts` (30). The 253-test figure recorded for the whole slice belongs to the
pre-split tree (219 + the 34 tests of PR-08b's three suites), and is not claimed here. The focused command
task 8.5 names passes on the 08a subset. Worktree removed; `git worktree list` shows only the main tree.

## Reportable contradictions (reported, not resolved — AGENTS.md §2)

1. **`conmuta validate` has no exit code anywhere in the gated documents.** `design.md:126` enumerates
the other commands' codes 2–7 and reserves 1 for uncaught errors; the command D-29 introduces has none,
yet the documented pre-commit one-liner has to branch on it. PR-08b resolves it by adding
`EXIT_VALIDATION_FAILED = 8` to `constants.ts` with its reasoning, disclosed as an apply-time addition
to design §11's table rather than a silent new literal.
2. **`design.md:124` lists `TELEGRAM_BOT_TOKEN_RE` under `constants.ts`**, but the exported regex ships
in `src/shared/secrets.ts:24`; `design.md:444` (the §12 reuse row) is the source of truth. PR-08a imports
from `secrets.ts` and does **not** rewrite the design table — reported here instead.
3. **PT-05 and PT-06 carried no file-name cell.** Both rows' second cell held only a scope phrase
(`installer unit + hook`, `shared unit`), and `THREAT-MODEL.md:7` calls the PT identifiers proposed names
rather than files, delegating the real names to the F1 spec (`design.md:550`). Task 8.6's “file-name
cell” therefore means *filling a cell that did not exist*. Done in this slice for PT-06 and for PT-05's
`token-shape` half; **PR-08b appends PT-05's `cli/validate` half**, so each PR names only the files it
actually adds. The cell is touched twice on purpose: an over-claimed cell is the defect two judges
caught in PR-06a.
4. **`src/cli/tsconfig.json` referenced `../client` and `../daemon`, neither of which has a single `.ts`
file**, so a `tsc -b` that reached it would fail `TS18003`. Deferring those two references to PR-32 and
PR-15 is a PR-08b change (with the reason written next to them in the file); recorded here because it is
a trap PR-08's own scope would have hit on its first build.
5. **The twin `test/cli/main.ts`'s scope omitted is real**, as HANDOFF §4 predicted: `test/twins.test.ts`
requires a twin for every non-declaration `.ts` under `src/`, so PR-08b adds
`test/cli/main.test.ts`. Carried finding, not an invention of this record.

## Judgment Day round 1 (substitute for the tribunal debate)

Two blind read-only judges (`jd-judge-a`, `jd-judge-b`) swept the initial review tree `44ea9a1` and
returned only the graph-v1 shape (`{"rows":[…]}`), one exhaustive pass each, in the clean worktree
`../telegram_bus_agent-worktrees/jd-08a`. The record uses the graph-v1 shape throughout; PR-07a's
older `{"findings":…,"evidence":…}` drift is not repeated here.

**Both judges found the same CRITICAL, independently — and it was real.** A document-derived **key**
name was rendered verbatim into `ProjectFileProblem.field`, so a token pasted into key position instead
of value position came back **echoed in the problem list**, in a value this module documents as reaching
operator terminals, pre-commit output and (F2) `doctor`. That falsified the type's own "value-free by
construction" guarantee, which was true of values and false of keys. `JD-A-001` and `JD-B-001`, both
`deterministic`, both `open`, the same defect from two directions.

| Judge | Row | Severity | Disposition |
|---|---|---|---|
| A | `JD-A-001` | CRITICAL | fixed in round 1; re-judged `verified` |
| B | `JD-B-001` | CRITICAL | fixed in round 1; re-judged `verified` |
| A | `JD-A-002` | WARNING | informational — **folded** by Director decision (below) |
| A | `JD-A-003` | SUGGESTION | informational (the version early-return's deliberate precedence) |
| B | `JD-B-002` | SUGGESTION | informational — **folded** by Director decision |
| B | `JD-B-003` | SUGGESTION | informational — **folded** by Director decision |
| B | `JD-B-004` | SUGGESTION | informational — **folded** by Director decision |

Frozen ledger (canonical, keys sorted as the runtime's `canonicalHash` does):
`28dd8e53bbb3c8a4213619e07e4db6531052b4e09b8b9fdd77b708cbae08ac`, batch `1 of 2`, authorized IDs
`JD-A-001`, `JD-B-001`. The two rows were normalized before freezing so that **no token-shaped literal
is written into this file** (PT-22/doc hygiene, `bus-v2-f1-pr-03-001`): the field the judges reproduced
is described as "the 7-digit fixture token".

### Round 1 — the correction (one bounded batch)

| Item | Value |
|---|---|
| Mechanism | `jd-fix-agent`, the standalone dispatch the runtime accepts, allowed surfaces `src/shared/project-file.ts` + its twin |
| Fix | `REDACTED_FIELD_SEGMENT`/`keySegment` redact a key that is itself forbidden content; `joinPath` uses it, and the walk now inspects **key names** too, reporting the rule against the container path so the operator still learns where the problem is |
| TDD | five tests written RED first (all five failed against the unpatched build with the token echoed), then GREEN |
| Result | that file 35/35; the correction commit is `ddfa1c3` |

### The four informational rows, folded by Director decision

Judgment Day's own rule is that WARNING and SUGGESTION candidates become one-time informational rows and
never schedule fixes. The Director was asked explicitly whether to fold them into this same round —
because folding them **before** re-judgment is what makes the re-judged tree the shipped tree, and
because the PR was not yet open — and chose to fold all four. They are therefore an **author decision
disclosed as such**, not part of the authorized severe batch:

| Row | Change | Why it matters |
|---|---|---|
| `JD-A-002` (WARNING) | the field walk applies the whole shared secret table via `checkForSecrets`, so a PEM block or a `.env`-style assignment committed inside `conmuta.json` is refused; the rule vocabulary is now `SecretRule` plus this module's three own names | the loader is the only consumer that sees the file first; a committed secret is the threat class PT-05 exists for |
| `JD-B-002` (SUGGESTION) | the walk is bounded by `MAX_CONTENT_WALK_DEPTH = 32` | a ~5k-deep document made the documented pre-commit path throw `RangeError` instead of returning a verdict; no **accepted** file can reach the bound, because the strict schema caps accepted documents at three levels |
| `JD-B-004` (SUGGESTION) | the `Authorization` literal is matched case-insensitively, through one exported `matchesAuthorizationLiteral` shared by both consumers | RFC 9110 §5.1 makes field names case-insensitive; **disclosed as a hardening beyond the requirement's literal spelling**, in the fail-closed direction |
| `JD-B-003` (SUGGESTION) | `RosterEntry` renamed `ProjectRosterEntry` | `shared/protocol-apply.ts:50` already exports a `RosterEntry` (its minimal `user_id` projection, inside an audited SEAM); two public types with one name in one layer force every consumer that needs both to alias one, and the rename is free only while this type is unpublished |

### Mutants for the corrected tree (round 1)

Four, all killed, each built first on a cleaned `dist/` and restored byte-identically with a `sha256`
check: `M8` the CRITICAL fix reverted (a forbidden key named verbatim again), `M6` the loader stops
consulting the shared secret table, `M7` the `Authorization` literal matched case-sensitively again,
**`M5` the depth bound removed — which is what proves the deep-document test is load-bearing rather
than decorative** (without the bound the walk really does throw).

### Re-judgment (scoped, one round)

Each judge received only its own frozen ID, that ID's exact hash-bound row, and the fix diff
(`git show ddfa1c3`), with the four folded rows disclosed for **fix-line regression** purposes only.
Result: `JD-A-001 → verified`, `JD-B-001 → verified`. No regression was returned and no second round was
needed, so the terminal re-judgment budget of two rounds is unspent.

### Final verification and verdict

One final verification, in the frozen worktree at `ddfa1c3` with `dist/` rebuilt from scratch:
**229/229** tests and `test:static` **8/8**. With no severe row surviving:

**`JUDGMENT: APPROVED`** for `014f661..ddfa1c3`.

## The ordinary native review — a separate, independent lifecycle

The Receipt-driven Development switch is on and the Director never left this candidate unreviewed, so
the preflight ran. It was executed against the **frozen worktree** (`workspaceRoot`), not the main tree,
so the candidate is exactly this slice and excludes PR-08b's uncommitted files:

| Step | Result |
|---|---|
| `inspect` | `ready`, action `start`, offered a **committed-range** START (`--base-ref=014f661… --committed-only=true`) |
| `start` | lineage `review-f644a39f445a2a0c`, risk **medium** (reason: not purely passive documentation), lens `review-reliability`, 7 changed files, 1121 changed lines, correction budget 200 |
| `status` | `collect` with exactly one slot |
| `capture` (1st) | **forecast, no mutation**: transport `pi_host_relay`, **1 model run**, lens `review-reliability` — relayed, then re-submitted with `reviewerRunAcknowledged: true` |
| `capture` (2nd) | `approved` — closure `native-last-event-closure` |
| `acknowledge-approved` | **authority burned** (`gentle-ai.review-acknowledged/v1`); delivery is ordinary repository policy |

The closure's own text is the disposition of its findings: *"This review is approved and its receipt
stands. Every finding listed here is non-blocking: none opened a correction, none reopens this review,
and no correction transition is offered for this candidate."* Four advisory findings, recorded verbatim
by id and location and filed as backlog **B-22** rather than acted on here: `R3-01` (WARNING,
`src/shared/project-file.ts:294-296`), `R3-02` (WARNING, `test/shared/project-file.test.ts:5-9`),
`R3-03` (SUGGESTION, `test/shared/project-file.test.ts:352-362`), `R3-04` (SUGGESTION,
`src/shared/project-file.ts:151-158`). Review approval **never** authorizes delivery, and this PR is not
authorization either: commit, push, PR and merge stay ordinary repository policy.

## Next

- Push `ddfa1c3`, open PR-08a, wait for the CI matrix, and leave the merge to the Director.
- PR-08b (`roster-hash.ts`, `cli/validate.ts`, `cli/main.ts`, `EXIT_VALIDATION_FAILED`, the tsconfig
  wiring and the twins) is prepared afterwards on top of the merged `main`, with its own verification,
  its own Judgment Day audit and its own review lifecycle.

