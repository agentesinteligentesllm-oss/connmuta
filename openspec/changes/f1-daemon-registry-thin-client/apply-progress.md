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

---

# PR-08b — `shared/roster-hash.ts` + the CLI (`conmuta validate`, `cli/main.ts`) — the second half of the re-sliced PR-08

**Slice status:** implemented; **Judgment Day closed approved** for `72e09c0..a464a66`, and the ordinary
native review was **declined for this candidate** — which is *not* a closure — so its risk-gated fallback
ran instead. Both are recorded below. Stacked on PR-08a (merged as PR #11, `1770f84`). DN-05 is unsatisfied
for it too, for the same reason as the rest of F1 (Arena bridge down).

| Field | Value |
|---|---|
| Branch | `f1/08b-roster-cli` from `main` @ `72e09c0` (the PR-08a audit-path record) |
| Code commits | `7c6657b` (`roster-hash.ts` + its twin), `d0eac03` (the CLI unit, `EXIT_VALIDATION_FAILED` and the build wiring) |
| Requirements | `project-binding › Name-bearing identifiers derive from one constant`; the roster fingerprint of `ipc-handshake`/D-27, computed here and consumed in PR-30; `project-binding › Token-shape validator`'s callable surface (PT-05, D-29) |
| Provenance | none — no v1 range is vendored; the fixture stays at 11 entries |

## Scope and budget (measured)

| Path | Final lines | At the audited tip `bc5beec` |
|---|---|---|
| `src/shared/roster-hash.ts` | 39 | 39 |
| `test/shared/roster-hash.test.ts` | 120 | 86 |
| `src/cli/validate.ts` | 68 | 63 |
| `test/cli/validate.test.ts` | 212 | 189 |
| `src/cli/main.ts` | 139 | 125 |
| `test/cli/main.test.ts` | 170 | 150 |
| `src/shared/constants.ts` | +14 / −1 (`EXIT_VALIDATION_FAILED`) | same |
| `src/cli/tsconfig.json` | +5 / −1 (the build wiring below) | same |
| `src/shared/token-shape.ts`, `test/shared/token-shape.test.ts` | +4 / −4, +1 / −1 | comment-only |
| **budget total** (`git diff --numstat -- src test`) | **772 / 400** — **372-line PR-08b-scoped exception** | 671 / 400 |
| `tsconfig.json` (root — outside the `src`/`test` scope the total measures) | +1 / −1, **not counted** | same |

The exception follows the same grounds as PR-08a's: the CLI's value is in its contract — argument
handling, exit codes, never echoing, not executing on import — and `test/cli/validate.test.ts` exercises
it at the **process boundary** (a real child process, the design §15 "Integration" layer), which is the
only place a token could leak into a message. Trimming those cases is exactly what the budget rule
forbids.

The correction rounds grew the slice from **671 to 772** in that same `src`/`test` scope — **+101** — and two of
its files are **PR-08a's**, touched comment-only: `src/shared/token-shape.ts` and
`test/shared/token-shape.test.ts` carried `design.md` citations that this slice's own appended design row
invalidated, so leaving them stale would have shipped a trace that cannot be followed (AGENTS.md §3). No
behaviour in a merged file changed, no hash-pinned file was touched, and the correction is itself the
covered evidence above.

## The three carried findings this slice closes

1. **`test/cli/main.test.ts`, the twin PR-08's scope omitted** (HANDOFF §4): `test/twins.test.ts` requires
a twin for every non-declaration `src/**/*.ts`, so the slice would have failed its own merge. Added, and
it pins a real property: importing the module must not run the CLI.
2. **The root `tsconfig.json` `references`** now includes `{ "path": "src/cli" }` (an empty composite unit
is TS18003), which is what makes `test/cli/**` compilable at all.
3. **`src/cli/tsconfig.json` referenced `../client` and `../daemon`, neither of which has a single `.ts`
file**, so the first build that reached it would have failed TS18003. Both references are deferred to the
slices that write their first source file (PR-32, PR-15), with that instruction written in the file.

## TDD cycle evidence

| Step | Command | Observed |
|---|---|---|
| 8.3 RED | `node node_modules/typescript/bin/tsc -b` | `TS2307: Cannot find module '../../src/cli/main.js'` / `'../../src/cli/validate.js'` and `TS2305: … has no exported member 'EXIT_VALIDATION_FAILED'` — the RED for these modules was taken while the slice was still one tree, before PR-08a was split out, and is recorded here rather than replayed |
| 8.4 GREEN (at `bc5beec`) | focused run over the three new suites + `roster-hash` | **34/34** |
| 8.5 Verify (at `bc5beec`) | the exact command task 8.5 names | **75/75** (the four suites it lists) |

Both counts are **tip-labelled deliberately**, because they are pre-correction: at the frozen tip the same
commands report **39/39** and **79/79**, the correction round having added five tests. An unlabelled count
that has moved is the defect class this record's own audits keep finding.

## Mutants bound to this candidate

Three, all killed, each built first on a cleaned `dist/` in the clean worktree at `d0eac03` and restored
byte-identically with a `sha256` check:

| # | Mutant | Test that killed it |
|---|---|---|
| N1 | The roster hash includes the display-only `username` | `roster-hash.test.ts` — the exclusion case and both known-answer vectors |
| N2 | **PROCESS BOUNDARY**: the refusal line echoes the document | `validate.test.ts` — the child-process case that asserts the fixture never reaches stdout or stderr |
| N3 | The CLI runs on import | `main.test.ts` — the probe that imports the module and asserts no output and no exit code |

## Verification from a clean detached worktree

`git worktree add --detach ../telegram_bus_agent-worktrees/verify-08b d0eac03`, then
`npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js"` and the static set:

| Tree | Tests | `test:static` |
|---|---|---|
| `d0eac03` (PR-08b code tip, pre-audit) | **263 / 263** | **8 / 8** |
| `a464a66` (the corrected tip; `dist/` rebuilt from scratch) | **268 / 268** | **8 / 8** |

That is PR-08a's 229 plus this slice's **34**: `test/shared/roster-hash.test.ts` (8),
`test/cli/validate.test.ts` (13) and `test/cli/main.test.ts` (13). The correction round adds five more:
the shebang assertion over the built bundle, the `Authorization`-only and token-shaped raw-path cases, and
the disagreeing-order roster vector with its own non-vacuity check.

## Reportable contradictions resolved or carried

1. **Resolved — the exit code `conmuta validate` had nowhere to come from.** PR-08a reported that
   `design.md:126` enumerates codes 2–7 and reserves 1 for uncaught errors, leaving D-29's command with
   none. This slice adds `EXIT_VALIDATION_FAILED = 8` to `constants.ts` with its reasoning and **appends**
   a row to design §11's table naming it as an apply-time addition; the rows above it are untouched, so
   what was designed and what shipped both stay on the record. A content refusal is neither a usage error
   nor a runtime fault, and a pre-commit hook and (F2) `doctor` branch on that difference.
2. **Carried — `design.md:124` lists `TELEGRAM_BOT_TOKEN_RE` under `constants.ts`** while the exported
   regex ships in `shared/secrets.ts:24`. Not rewritten here; reported by PR-08a and still reported.
3. **Carried — the `Authorization` literal is matched case-insensitively**, which is wider than the
   requirement's literal spelling. Disclosed in PR-08a's record as a fail-closed hardening (RFC 9110
   §5.1); `cli/validate.ts` inherits it because it shares the definition rather than restating it.

## Judgment Day round 1 (substitute for the tribunal debate)

Two blind read-only judges (`jd-judge-a`, `jd-judge-b`) swept the initial review tree `bc5beec` in a clean
worktree, one exhaustive pass each, graph-v1 rows only. The Arena bridge is down, so nothing was debated
and **DN-05 is unsatisfied for PR-08b** as for the rest of F1.

Result: **1 CRITICAL**, 3 WARNINGs and 4 SUGGESTIONs — eight rows, of which two pairs are the same defect
reached independently. (An earlier revision of this record said three SUGGESTIONs, and `03c2231`'s own
commit message repeated it; the table below has four, which is the figure that counts.)

| Judge | Row | Severity | Disposition |
|---|---|---|---|
| B | `JD-B-001` | **CRITICAL** | the sole `bin` target had no shebang; fixed in round 1, re-judged `verified` |
| A | `JD-A-001` | WARNING | the raw-text path names the wrong rule (also `JD-B-002`); folded |
| B | `JD-B-002` | WARNING | same defect as `JD-A-001`, independently reached; folded |
| B | `JD-B-003` | WARNING | the test covering the raw-text scan could not fail; folded |
| A | `JD-A-002` | SUGGESTION | the bare `conmuta validate` narrowing was undisclosed; disclosed below |
| A | `JD-A-003` | SUGGESTION | `design.md` citations left stale by this slice's own appended row (also `JD-B-005`); fixed |
| B | `JD-B-004` | SUGGESTION | the roster-hash sort key was unpinned; folded |
| B | `JD-B-005` | SUGGESTION | same as `JD-A-003`; fixed |

Frozen ledger (canonical keys, the runtime's `canonicalHash`):
`2ef778b4266cf0ff8af5d2c296497b3ed7f70c058a989715cf55329774910867`, batch `1 of 2`, authorized ID
`JD-B-001`.

### The CRITICAL, and why it is constitution-level

`src/cli/main.ts` is the package's only `bin` target (`package.json` → `dist/src/cli/main.js`) and carried
no shebang: `git grep -n '^#!'` over the tree returned nothing, and `build` is only `tsc -b`, which copies a
shebang but does not add one. The consequence is not cosmetic. ADR-0012 — a constitution-level governing rule, its own `Status` being
`inherited-valid (constitution-level: the governing rule)` — carries a remediation table whose **row 2**
prescribes **exactly** `#!/usr/bin/env node` on line 1, "pinned by an assertion over the built bundle", and
records the failure mode of its absence as *"exit 0 with zero bytes on both streams — the least diagnosable
outcome"*. A pre-commit hook reads that
silence as *clean*, so on POSIX the PT-05 control that keeps a token out of a committed `conmuta.json`
could be bypassed with no signal at all.

**The ADR was re-read in this session rather than trusted from the row**, and it says what the row claims.
Two things about this defect are worth keeping: it was invisible to every gate in the tree (CI runs
`windows-latest` only, where npm's shim invokes `node` explicitly and masks it), and it was invisible to
this slice's own eight mutants and its author's read of the file, because a shebang is not a property of
the source's *behaviour* — it is a packaging contract. That is the class of defect an adversarial read
finds and a test suite does not.

### Round 1 — the correction

**The authorized severe batch** (`jd-fix-agent`, round 1 of 2, surfaces `src/cli/main.ts` +
`test/cli/main.test.ts`): the shebang, the ADR-0012 comment naming why it is load-bearing, and an assertion
that reads the **built** file's first line. Its non-vacuity was proven by deleting that line from the
untracked `dist/` and watching the assertion fail (13 pass / 1 fail), and the *packaged* artifact was
checked with `npm pack` + `tar -xOf`, which is the artifact npm bin-links on POSIX.

**The four informational rows**, folded by the author under the Director's established preference from
PR-08a. Judgment Day's own rule is that WARNING and SUGGESTION rows schedule no fix; folding them before
the re-judgment is what keeps the re-judged tree the shipped tree, and the PR was not yet open. Disclosed
as an author decision, not as part of the authorized batch:

| Row | Change | Why |
|---|---|---|
| `JD-A-001`/`JD-B-002` | the non-JSON path **recovers** the rule that fired instead of hard-coding the token shape | `findTokenShapes` counts two shapes through one API, so a malformed document whose only forbidden shape is an `Authorization` header was reported as a bot token — sending an operator to hunt a token that does not exist |
| `JD-B-003` | the raw-scan test now asserts the forbidden line is present **and** that it precedes the parse complaint | `parseProjectFile` reports `invalid_json` on its own, so deleting the scan left every existing assertion true: the guarantee the docstring calls load-bearing was unpinned (ADR-0012's rule) |
| `JD-B-004` | a second roster-hash vector whose `agent_id` and `user_id` orders **disagree** | with only the first vector, sorting by `user_id` reproduced every assertion, so the sort key was unpinned in a cross-module contract |
| `JD-A-003`/`JD-B-005` | nine `design.md` citations re-pointed (148→149, 150→151, 588→589, 143→144) | this slice's own appended design row shifted every later line, and the traceability doctrine says every statement traces to a source |

**Disclosed, not coded — `JD-A-002`.** The requirement spells the surface as
`conmuta validate [<path> | --stdin]`, whose bracket notation makes the target optional; this CLI refuses
the bare form with `EXIT_USAGE`. The narrowing is deliberate: a default target would need the walk-up
`client/binding.ts` owns in PR-33, and silently validating `./conmuta.json` would validate the wrong file
in any directory that is not the project root. Unlike the case-insensitive `Authorization` match and the
appended exit-code row, this one was **not** disclosed before the audit flagged it, which is the real
defect the judge named — so it is disclosed here.

### Mutants for the corrected tree (round 1)

Three, all killed, each built first on a cleaned `dist/` and restored byte-identically with a `sha256`
check: `M9` the raw-text rule assumed again, `M10` the raw-text scan removed — **the mutant that proves
`JD-B-003` is closed**, because that test could not fail before this round — and `M11` the roster pairs
re-keyed to `user_id`.

### Re-judgment (scoped, one round)

Judge B received only `JD-B-001`, its exact hash-bound row, and the fix diff (`git show a464a66`), with the
four folded rows disclosed for **fix-line regression** purposes only. Result: **`JD-B-001 → verified`**, no
regression, so the second scoped round is unspent — as in PR-08a.

### Final verification and verdict

One final verification, in a clean worktree at the corrected tip with `dist/` rebuilt from scratch:
**268/268** tests and `test:static` **8/8**, and the emitted `dist/src/cli/main.js` starts with
`#!/usr/bin/env node`. With no severe row surviving:

**`JUDGMENT: APPROVED`** for `72e09c0..a464a66`.

## The ordinary native review — DECLINED for this candidate

The Receipt-driven Development switch is on and the Director never left this candidate unreviewed, so the
preflight ran against the frozen worktree (`workspaceRoot`), which binds the candidate to this slice exactly.
`inspect` returned `ready` with a committed-range START; the START resolved consent as
**`declined_this_candidate`**:

- `lineage_created: false`, `mutation_performed: false`, `reset_eligible: false` — **no lineage exists and
  nothing was approved or mutated**;
- risk tier **high**, reason `process_boundary` on `src/cli/main.ts`, 15 changed files, 978 changed lines,
  correction budget 0 — the fork/spawn signal raised by the child-process integration test this slice adds
  on purpose.

**It is recorded as a decline, never as a review that closed**, and the same candidate is not re-reviewed.
The documented fallback is Receipt-driven Development's risk-gated path: `assess` with the decline stated
returned risk `high`, `outcome_source: explicit`, and the plan *"the writer self-verifies and a separate
independent verifier always runs"*. So both halves ran:

- **Writer self-verification** — the clean-worktree runs, the mutants and the final verification above.
- **Independent verifier** — `gentle-ai-verify` ran read-only over the frozen candidate `72e09c0..03c2231`
  and reproduced every figure that matters: 268/268 and 8/8; the built entry's shebang **and** the
  assertion's non-vacuity (deleting the emitted line made it fail 13 pass / 1 fail); mutants M10 and M11
  killed, each restored byte-identically; both known-answer vectors re-derived outside the module; the
  exit-code contract (8 for content, 2 for usage); the nine re-pointed citations each resolving to the
  paragraph they name; and that the `JD-A-002` narrowing is disclosed as a deviation rather than as the
  requirement's own wording.
- **It found five record defects and one observation** — all corrected — and then a **focused re-check of that
  very correction found two more defects that the correction itself had introduced**: a budget table measured
  before its own companion change, and a status line that called a declined review a closed lifecycle. Both
  are corrected too; see the correction note below. That is the instrument working twice over: the writer's
  own verification had passed over all of them, and so had the first correction pass.

### Correction note — the verifier's five record defects, its one observation, and the two this fix itself introduced

| # | Defect | Correction |
|---|---|---|
| 1 | "3 SUGGESTIONs" against a table with four, repeated in `03c2231`'s commit message | corrected to four here, with the commit message's error named rather than silently left |
| 2 | The budget table mixed scopes: the root `tsconfig.json` (+1/−1) sat outside the `-- src test` measure, so the table summed to 760 while the stated total was 759, and the audited tip read 672 in one scope and 671 in the other | the table now names its scope; the audited tip is 671 in that same scope; total 759; growth **+88**; the root tsconfig is listed as not counted |
| 3 | The native review was forward-referenced ("recorded below") with no section below, and the slice status still said the audit was pending | the decline is recorded above and the status line corrected |
| 4 | ADR-0012's document-level `Status` was presented as remediation row 2's status | reworded: the status is the ADR's, the prescription is row 2's |
| 5 | The TDD table's `34/34` and `75/75` were pre-correction and unlabelled | both tip-labelled, with the frozen-tip figures (`39/39`, `79/79`) recorded |
| 6 | *(its separate observation, not one of the five)*: the emitted usage text advertised the requirement's optional target (`[<path> | --stdin]`) while this build refuses a bare invocation with `EXIT_USAGE`, so the program's own text promised a form that exits 2 | the usage text now states the accepted forms and a test pins it, so the text cannot drift back into advertising an optional target |
| 7 | *(this pass)* The budget table was corrected for the tip *before* the change in row 6: that fix added 13 `src`/`test` lines, so the table and its prose describe `03c2231` while the tree they ship on measures **772** | re-measured here to **772 / 400**, exception **372**, growth **+101**; the class is the one this repository keeps recording — after a correction edits a file, every figure about that file is suspect |
| 8 | *(this pass)* The slice-status line said "both independent lifecycles closed", reusing PR-08a's phrase where both genuinely closed, while the section below records a **decline** — and a decline is not a closure | the status line now says Judgment Day closed `approved` and the review was **declined**, with the fallback named |

## Next

- Push, PR-08b, CI, and the Director's merge decision.


---

# PR-09a — machine registry document: `src/registry/{schema,invariants}.ts` (+ build wiring)

Slice 11 of 45 (re-sliced at apply time from PR-09; see `tasks.md`). Delivered under the settled route:
ODD with every substantive SDD contract preserved, then Judgment Day as the audit substitute. The Arena
bridge is down, so nothing was debated and **DN-05 is unsatisfied for PR-09a** as for the rest of F1.
Branch `f1/09-registry` from `main` @ `e177c58` (the block's original branch; PR-09b takes its own).

| Field | Value |
|---|---|
| Code commit | `c9b4ee1` (`schema.ts`, `invariants.ts`, the unit wiring, the three test files and the shared `rosterEntrySchema` export) |
| Correction commit | `d5d73a0` (the `M4` mutant's fix in `test/registry/schema.test.ts`; see the mutant matrix below) |
| Requirements | `project-binding › Machine registry schema and invariants` (PT-18; PT-25's half lands in PR-09b) |
| Provenance | none — no v1 range is vendored; the fixture stays at **11** entries, and all three new modules carry no `Provenance:` header |
| Budget | **1,266 authored lines / 400** — an **866-line PR-09a-scoped exception**. It was 663 when the Director granted it (1,063 authored, measured before Judgment Day); round 1's mandated corrections, its informational folds, the correction of the two defects that correction introduced, and the two lines the independent verifier's `F10` added to the referential-integrity pin took it to 1,266 (1,256 + 10). Re-measured in the same pass as the edits and again at the tip that ships, which is the lesson HANDOFF §2.4 draws from PR-08a/PR-08b — and the verifier's `F4` caught this table carrying a pair of rows whose two errors cancelled while the total stayed right |

## Scope and budget (measured)

| Path | Lines |
|---|---|
| `src/registry/schema.ts` | 309 (`262` before round 1: the snapshot's roster-level rules + `collapseShapeProblems`) |
| `src/registry/invariants.ts` | 133 |
| `src/registry/tsconfig.json` (new compile unit, counted in `src`) | 14 |
| `test/registry/fixtures.ts` | 88 (`100` at the code tip; round 1 re-pinned `VALID_ROSTER_HASH`, made `activeBinding` derive the field, and removed `addSecondBinding` — 12 lines fewer, not more) |
| `test/registry/schema.test.ts` | 390 (`280` at the code tip, `277` after `M4`'s first fix; round 1 added the four snapshot cases and the informational pins, and `010ed85` added the two that pin its own correction) |
| `test/registry/invariants.test.ts` | 277 (`267` before the verifier's `F10` widened the referential-integrity pin from one dimension to three) |
| `src/shared/project-file.ts` | +55 / −20 (the `rosterEntrySchema` export, then round 1's extracted `applyRosterUniqueness`) |
| **budget total** (`git diff --numstat e177c58..2279c15 -- src test`, loader half excluded) | **1,266 / 20** — 866-line exception |
| `tsconfig.json` (root — outside the `src`/`test` scope the total measures) | +1 / −1, **not counted** |

**Why the shared export, and why it is not drift.** `bindings[].roster_snapshot` is a *copy* of
`conmuta.json`'s roster (D-07 makes it the admission source while no client is connected) and
`roster_hash` is computed over either by the same `shared/roster-hash.ts` rule. A second declaration of
the entry shape in `registry/schema.ts` could accept an entry the project file refuses, with no test able
to see the divergence, so the schema object is now exported and reused; `schema.test.ts` pins the
equivalence by running both verdicts over one table of six entries. This is the only merged file the slice
touches, it changes no behaviour (`rosterEntrySchema` was already the schema `parseProjectFile` used), and
no hash-pinned file is involved.

## TDD cycle evidence

| Step | Command | Observed |
|---|---|---|
| 9.1/9.2 RED | `node node_modules/typescript/bin/tsc -b` | `TS2305` for every API the twins use, over modules that exist and export nothing (`parseRegistryDocument`, `Registry`, `REGISTRY_INVARIANTS`, `REGISTRY_INVARIANT_TAG`, `applyRegistryInvariants`, `RegistryInvariant`, `RegistryIssueSink`, `registryInvariantFromIssue`, `rosterEntrySchema`), plus the consequent `TS7006`/`TS18046`/`TS2578` inside the tests |
| 9.2 GREEN (local tree) | `node node_modules/typescript/bin/tsc -b`, then the two suites | clean build; **30/30** in the two suites (`schema` 14, `invariants` 16), inside a local full run of 45/45 that also carried PR-09b's three loader suites — which are **not** part of this commit |
| full suite (clean worktree at `d5d73a0`) | `npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js"` | **298/298** (PR-08's 268 + `schema` 14 + `invariants` 16); at the final tip `010ed85` the same command reports **304/304**, because round 1 added six cases |
| focused, task 9.5's half | `node --test "dist/test/registry/schema.test.js" "dist/test/registry/invariants.test.js"` | **30/30** at `d5d73a0`, **36/36** at `010ed85` |
| `test:static` (clean worktree at `d5d73a0`) | `node --test "dist/test/security/*.test.js"` | **8/8** — pack (4), provenance (2) and repo-scan (2), with the new files staged (`git add -N` first, because those scanners read `git ls-files`). The **twin walk is not in this glob**: `test/twins.test.ts` compiles to `dist/test/twins.test.js`, so the twin rule for `src/registry/*` is proved by the full-suite row above, not here (this attribution was wrong in the first draft; both judges reached it independently as `JD-A-006`/`JD-B-006`) |

**A figure in the first draft of this table was computed, not measured, and is corrected here.** It said
`29/29` and `297/297` — `268 + 29`, written before the clean-worktree run existed. The measured numbers
are **30** and **298**. The row now names where each was run, because a computed figure presented as a
measured one is exactly the defect class this repository's records keep finding, and the only reason it
was caught is that a clean worktree was built afterwards rather than trusted. It is recorded rather than
silently edited.

Four GREEN-cycle failures were real and were fixed as test defects, not as implementation conveniences:
`R3` fires together with `min(1)` on an empty `roster_snapshot` (both true, both pinned); a strict key
plus a discriminator can both complain about one `token_ref` field, so the table asserts "only shape
problems, at least one" instead of an exact count; the `agent_id` case mutated alone refused the document
for R3 rather than for the wire regex, so it now replaces agent, bot and snapshot entry in lockstep; and
the drift table's entries had to be paired with a binding whose identity was derived from them — which the
mutant sweep then proved was still the **wrong** construction (see `M4` below). Each is recorded because
the *implementation* was right and the *expectation* was wrong.

## Verification from a clean detached worktree

`git worktree add --detach ../telegram_bus_agent-worktrees/verify-09a <tip>` from the repository root — a
tree that contains only what this slice committed, which is the point: the local tree still holds PR-09b's
uncommitted loader files, and a run there would report figures this half cannot claim.

| Tree | Command | Result |
|---|---|---|
| `d5d73a0` (the tip the slice reached before Judgment Day; the docs commits after it change no code until `3508243`) | `npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js"` | **298/298** |
| `d5d73a0` | `node --test "dist/test/security/*.test.js"` | **8/8** |
| `d5d73a0` | `node --test "dist/test/registry/schema.test.js" "dist/test/registry/invariants.test.js"` | **30/30** |
| `2279c15` (the frozen tip, and the tip the audit's verdict covers) | `npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js"` | **304/304** |
| `2279c15` | `node --test "dist/test/security/*.test.js"` | **8/8** |
| `2279c15` | `node --test "dist/test/registry/schema.test.js" "dist/test/registry/invariants.test.js" "dist/test/shared/project-file.test.js"` | **75/75** |

The worktree is removed as soon as the run finishes, and an empty `telegram_bus_agent-worktrees`
directory is the expected end state (HANDOFF §8). One harness defect was found and fixed while doing this:
the first mutant sweep invoked `npm run build` through `spawnSync` without a shell, which on Windows
cannot execute `npm` at all, so all five mutants reported `build=FAILED` and looked killed when nothing had
run. The sweep now calls `node node_modules/typescript/bin/tsc -b` directly, which is also what the handoff
prescribes; the first sweep's output was discarded rather than reported.

## Mutant matrix — each built first on a cleaned `dist/`, each restored byte-identically

Run in the clean detached worktree (`../telegram_bus_agent-worktrees/verify-09a`, at `d5d73a0`), each
mutant applied to the source, `dist/` removed, `tsc -b` rebuilt, the focused suite run, then
`git checkout --` restore verified by `sha256sum` before and after (all five `restored=true`, and the
worktree's `git status` clean apart from the harness script).

| # | Mutant | Result | Test that killed it |
|---|---|---|---|
| `M1` | R1/R2 count **every** binding, not only the active ones (the `status !== "active"` guard dropped) | killed, 28/30 | *R1 counts active bindings only* + *R2 counts active bindings only, like R1* |
| `M2` | R3 checks only that the agent is **present**, dropping `entry.user_id !== binding.bot_id` | killed, 29/30 | *R3: a binding whose agent is absent from its snapshot, or carries another user_id, is refused* |
| `M3` | the version rule refuses **every** version but this build's (`!==` instead of `>`), so a lower version takes the upgrade path | killed, 29/30 | *a version that is not a future integer falls through to the schema, never to the upgrade path* |
| `M4` | the snapshot entry is a **second, looser declaration** (`z.number()` for `user_id`) instead of the shared `rosterEntrySchema` | **survived the first sweep**, killed after the fix below, 29/30 | *the snapshot entry is the project file's roster entry, not a second declaration* |
| `M5` | R2 checks `group_id` only, dropping the `project_id` dimension | killed, 29/30 | *R2: two active bindings sharing a group_id, or sharing a project_id, are refused* |

**`M4` survived, and that is the sweep earning its cost.** The drift pin derived the binding's `agent_id`
and `bot_id` from the entry under test, so an entry the project file refuses — a negative or fractional
`user_id` — was refused a second time by the binding's own `bot_id` rule; the assertion
"registry refuses === project file refuses" held as `false === false`, and a second, looser declaration of
the snapshot shape changed no verdict. The pin now leads the snapshot with a known-good entry for the
binding's own agent, so R3 is satisfied whatever the entry under test says and the entry's shape is the
only thing that can move the verdict. Fixed in `d5d73a0` (its own commit, with the reasoning); `M4` dies on
the re-run, and the four others were re-run on that same corrected tree and still die.

The loader's never-rename/quarantine boundary — the mutant HANDOFF §5.5 asks for — belongs to **PR-09b**,
where the loader lands: PR-09a has no code that touches the filesystem.

### The round-1 sweep (`M6`, `M7`), and why the first matrix was not enough

The independent verifier (`F5`) observed that the "`M1`–`M7` all killed" claim existed only in a commit
message: `M6` and `M7` were defined nowhere in the record. They are defined here, with the same protocol
as the table above — each applied to the source, `dist/` removed, `tsc -b` rebuilt, the focused suite run,
then restored and verified by `sha256`:

| # | Mutant | Result | Test that killed it |
|---|---|---|---|
| `M6` | `applyRosterUniqueness(binding.roster_snapshot, ctx)` replaced by `void ctx;` — the CRITICAL returns | killed, 3 failures | the three new snapshot cases (two duplicates refused, and the order-independence pin) |
| `M7` | `collapseShapeProblems` call removed, so every zod issue becomes a row | killed, 1 failure | *a malformed document reports one shape problem, not one per bad member (JD-A-005)* |

On the corrected tree at `010ed85` the whole set is killed: `M1`–`M5` as tabulated above (re-run there),
plus `M6` and `M7`. The verifier reproduced `M4`, `M6` and `M7` kills independently in its own scratch copy,
including `M6`'s "exactly three tests" count.

## Discovered while writing PR-09b's tests, and resolved there

The R5 pre-parse raw-text scan and the required `roster_hash` collide: `sha256:` ends in a digit run, so
the shared `TELEGRAM_BOT_TOKEN_RE` (`\d+:[A-Za-z0-9_-]{35}`, an **unbounded** digit run) matches every
canonical hash. PR-09b masks that one value before scanning — sound, because the mask is `sha256:` plus 64
hexadecimal characters and a token's own colon is outside that class — and files the root cause as backlog
**B-27**. Recorded here because it was found by this slice and because it is the kind of cross-module
contradiction a raw-text scanner discovers only when the second module exists.

## Reportable items (reported, not silently resolved)

1. **A problem does not name the offending field.** `ProjectFileProblem` names a field path; the registry's
   vocabulary deliberately has no free-text member at all, so `schema_invalid` names no field. The reason
   is the PR-08a CRITICAL: a document-derived *key* echoed into a problem field is document text too, and
   this vocabulary is the one that reaches a log line and a condition. The narrowing is disclosed here;
   F2's `doctor` can name the field from the schema path without ever round-tripping the value.
2. **No R1–R6 row demands referential integrity.** `bindings[].bot_id`/`group_id`/`project_id` name
   entries of `bots[]`/`groups[]`/`projects[]` (DATA-MODEL §2.4), but no invariant row requires the entry
   to exist, so a dangling reference still loads. The boundary is pinned by a test rather than left
   implicit, and filed as backlog **B-28** for a `doctor` check — inventing a rule the gate does not carry
   would make a hand-edited file invalid for a reason the design never stated.
3. **The R5 rule that fired is not named** (the loader's half, PR-09b): naming it would mean parsing
   `assertNoTokenShape`'s message prose or writing a second copy of the shape order it applies — two
   implementations of one rule. The problem stays value-free; naming the rule is part of **B-27**'s
   follow-up.
4. **Nothing at load time ties `roster_hash` to its own snapshot.** Both judges reached this independently
   in round 1 (`JD-A-001`, `JD-B-002`), and the slice's first draft made it visible by accident: the
   fixture pinned the *two-entry* known answer into a document whose snapshot has *one* entry — an
   internally inconsistent "valid registry" that loaded clean. The fixture now derives the field with
   `computeRosterHash`, so a fixture cannot disagree with its snapshot, but the underlying boundary holds:
   DATA-MODEL §2.4 calls `roster_hash` "derived", yet no R1–R6 row requires it to describe the snapshot the
   binding admits from, and this schema cannot decide the rule without inventing one. Reported and filed as
   **B-29** (a load-time consistency check, or a session handshake that recomputes from the snapshot
   instead of trusting the stored field) rather than silently added.
5. **`projects[].path` is not required to be absolute** (`JD-A-004`, `JD-B-003`). DATA-MODEL §2.3 calls it
   an "absolute local path" while the schema accepts any non-empty string — which is deliberate (an
   absolute-path test differs per platform, the value chooses no authorization decision, and the data model
   itself calls it informational) but was disclosed only in a code comment. It is now a pinned boundary
   (a relative path, a POSIX path and an empty path are exercised) and reported here; a later tightening
   needs its own decision rather than a silent test change.

## Judgment Day round 1 (substitute for the tribunal debate)

Two blind read-only judges (`jd-judge-a`, `jd-judge-b`) swept the frozen tree
(`../telegram_bus_agent-worktrees/jd-09a`, detached at `b096b65`) in one exhaustive pass each, graph-v1
rows only, with the slice's own record in scope. The Arena bridge is down, so nothing was debated and
**DN-05 is unsatisfied for PR-09a** as for the rest of F1.

Result: **13 rows — 1 CRITICAL, 4 WARNING, 8 SUGGESTION**, of which four pairs are the same defect reached
independently (`JD-A-001`/`JD-B-002`, `JD-A-002`/`JD-B-001`, `JD-A-004`/`JD-B-003`, `JD-A-006`/`JD-B-006`).
Judge A's `JD-A-002` arrived with `status_reference: null` instead of the canonical
`status_at_freeze`; the controller canonicalized that one field before freezing, which is recorded because
the frozen ledger's hash is computed over the canonical rows.

| Judge | Row | Severity | Disposition |
|---|---|---|---|
| B | `JD-B-001` | **CRITICAL** | the snapshot inherits only the *entry* shape, not the roster-level uniqueness rules of `conmuta.json`; fixed in round 1, and **`verified` in the terminal scoped re-judgment** |
| A | `JD-A-002` | WARNING | the same defect at `schema.ts:183`, independently reached; closed by the same patch |
| A | `JD-A-001` | WARNING | the fixture's `roster_hash` was the two-entry known answer inside a one-entry snapshot (also `JD-B-002`); folded |
| B | `JD-B-002` | WARNING | same defect as `JD-A-001`, independently reached; folded — and the underlying boundary reported as **B-29** |
| A | `JD-A-003` | WARNING | `tasks.md` checked 9.1 while the same block admitted its loader half was outstanding; folded (9.1 is open again) |
| A | `JD-A-004` | SUGGESTION | `projects[].path`'s absoluteness is documented but unpinned and unreported (also `JD-B-003`); folded |
| B | `JD-B-003` | SUGGESTION | same as `JD-A-004`, independently reached; folded |
| A | `JD-A-005` | SUGGESTION | shape problems were not collapsed, so a malformed document reported up to nine identical rows; folded |
| A | `JD-A-006` | SUGGESTION | the record credited the twin walk to the `test:static` glob, which cannot run it (also `JD-B-006`); folded |
| B | `JD-B-006` | SUGGESTION | same as `JD-A-006`, independently reached; folded |
| A | `JD-A-007` | SUGGESTION | "3.9×" conflated "under the estimate" (4.1×) with "over the budget" (3.9×) in the row that justifies the exception; folded |
| B | `JD-B-004` | SUGGESTION | the "strict at every level" guarantee had no unknown-key case for `groups[0]`, `projects[0]` or `token_ref`; folded |
| B | `JD-B-005` | SUGGESTION | `addSecondBinding` shipped unexercised in this tree (its only caller is PR-09b's loader suite); folded |

**The judges disagreed on severity, not on the defect.** `JD-B-001` is CRITICAL and `JD-A-002` is the same
defect as a WARNING; the higher severity governs, so the batch was dispatched as severe. This is recorded
plainly because the skill's own gate says a severity contradiction is a human decision: the Director
authorized round 1 in full (severe batch plus the informational folds) before anything was changed.

### The CRITICAL, and why it is a real one

`bindings[].roster_snapshot` is a **copy** of `conmuta.json`'s `roster[]` (D-07 makes it the admission
source while no client is connected), and the slice reused the project file's *entry* schema for it —
which is exactly the reuse the slice's own export rationale claimed prevented a copy from accepting what
its source refuses. It did not: DATA-MODEL §1's roster-level rules (`agent_id` unique, `user_id` unique)
lived in `projectFileSchema.superRefine`, not in `rosterEntrySchema`, so a snapshot with two entries
sharing one `agent_id` — or two different agents under one `user_id` — loaded clean. Judge B's impact
claim is the sharp end: design resolves `message.from.id` by reverse lookup in the snapshot, so a
hand-edited registry (permitted by R6 until F2) could map a second numeric id to a binding's `agent_id`,
and R3's first-match `find` made the verdict depend on entry *order* (Judge A reproduced the same
construction and rated it WARNING).

**Round 1's authorized batch** (`jd-fix-agent`, round 1 of 2, one authorized ID `JD-B-001`, frozen ledger
SHA-256 `664687b3…`, canonical lowercase): the uniqueness logic was extracted from
`projectFileSchema.superRefine` into an exported `applyRosterUniqueness` in `src/shared/project-file.ts`
(running over any roster array, keeping the project file's own issue paths so its 39 tests are unchanged)
and applied to `bindings[].roster_snapshot` in `src/registry/schema.ts`. Its issue is deliberately
**untagged**, so it maps to `schema_invalid` rather than naming an invariant: R3's gated row does not carry
a roster-level uniqueness rule and naming it there would claim a gate that never evaluated it. Fix evidence:
focused 74/74 (schema 19, invariants 16, project-file 39) — the fix actor's own report said 73/73 with
schema 18, and the independent verifier re-measured the same commit at 74, so the figure recorded here is
the verifier's. (`317/317` for a full local run is the actor's figure too and is *not* reproducible in this
tree, which excludes PR-09b's loader suites; what this record relies on is the measured focused run above
and the final clean-worktree verification at the end of this section.) A temporary
neutralization of the new call failed exactly the three new cases, so the rule is load-bearing.

Two earlier attempts at this dispatch were rejected by the runtime, and the reason is worth recording:
the first listed `JD-A-002` (a WARNING) among the "authorized severe IDs", and the validator requires that
section's rows to be exactly the BLOCKER/CRITICAL rows; the second used a ledger hash computed over the
two-row batch instead of the one authorized row. HANDOFF §2.2 calls this out, and it did indeed cost two
attempts.

### Corrections applied (round 1, informational folds)

Disclosed as author decisions, not as part of the authorized severe batch — the same shape PR-08a and
PR-08b used, under the Director's standing preference for folding informational rows before the re-judgment
so the re-judged tree is the shipped tree:

| Row(s) | Change | Why |
|---|---|---|
| `JD-A-001`/`JD-B-002` | `test/registry/fixtures.ts`: `VALID_ROSTER_HASH` is now the **single-entry** known answer and `activeBinding()` **derives** the field with `computeRosterHash` unless a case supplies its own; `schema.test.ts` ties the fixture to that vector | a fixture that spells the hash out drifts from the snapshot silently — and this one had, so every "valid registry" in the suite was internally inconsistent. Deriving it removes the class instead of the instance |
| `JD-A-003` | `tasks.md`: 9.1 back to `[ ]`, with the close-out note and the block's own text aligned | the file admitted in the same commit that two of 9.1's five scenarios land in PR-09b; "unfinished work is never checked off" |
| `JD-A-004`/`JD-B-003` | `schema.test.ts`: a pinned boundary (Windows, POSIX, relative and empty `projects[].path`) plus reportable item 5 | the documented rule was enforced nowhere and pinned nowhere; the boundary is now explicit and reversible |
| `JD-A-005` | `schema.ts`: `collapseShapeProblems` reports at most one `schema_invalid` per document | nine byte-identical rows carry no information an operator can act on, and the invariant vocabulary already collapsed per document |
| `JD-A-006`/`JD-B-006` | this record's `test:static` row names what the glob actually runs | the twin walk lives in `dist/test/twins.test.js`, outside `dist/test/security/`, so the row credited a leg that cannot execute |
| `JD-A-007` | this record and `tasks.md`: 4.1× against the estimate, 3.9× against the budget | the row justifying a 663-line exception has to be reproducible from its own numbers |
| `JD-B-004` | `schema.test.ts`: unknown-key cases for `groups[0]`, `projects[0]` and `bots[0].token_ref` | the module docstring claims the strictness is *pinned*, and three of the four levels it names had no case |
| `JD-B-005` | `test/registry/fixtures.ts`: `addSecondBinding` removed from this half | its only caller is PR-09b's loader suite; shipping it here would be an unexercised helper this tree cannot fail on |

One of those folds is itself a lesson worth keeping: `JD-B-005`'s removal means the local build needed the
helper back while PR-09b's suite stayed in the working tree, so the removal had to be verified in the clean
worktree rather than locally. That is the same reason the clean worktree exists.

## Next

- The ordinary native review of this candidate, then push, PR and the Director's merge decision.
- **PR-09b** (`f1/09b-registry-loader`, stacked on this slice): `src/registry/loader.ts` +
  `test/registry/loader.test.ts`, tasks 9.1's loader scenarios, 9.3–9.6, PT-25's registry-side cell,
  `addSecondBinding` back where it is used, and the R5/`roster_hash` resolution described above.
- The audit path is recorded in the tribunal index as the five earlier slices' are, with **DN-05
  unsatisfied** for PR-09a as for the rest of F1.

### Scoped re-judgment (round 1) — a contradiction, diagnosed by measurement

The two judges received only `JD-B-001`, its exact hash-bound row and the fix delta `b096b65..89a53ed`, with
the folded rows disclosed for fix-line regression purposes only. They **contradicted**: Judge A resolved
`verified`, Judge B resolved `regression`, and the shape carries no reason field to read.

The cause was therefore measured rather than argued — a full mutant sweep on the corrected tree, which is
the instrument that produced the contradiction's answer: **two mutants survived, both introduced by the fix
itself.**

| # | Mutant | What the correction had done |
|---|---|---|
| `M4` | a looser, locally declared snapshot entry schema | survived **again**: the new uniqueness rule refuses a two-entry snapshot whose entries repeat the leading entry's `agent_id` whatever their own shape is, and every rejected entry in the drift table repeated `@alice-agent` — so the array refused first and the entry declaration changed nothing |
| `M7` | `collapseShapeProblems` removed | survived: round 1 added the collapse with no test that could fail when it was deleted |

Both were corrected in `010ed85`: every entry in that drift table is now distinct in `agent_id` from the
known-good entry the document leads with, and a new test pins the collapse (two independent shape defects
report exactly one row) with its per-kind non-vacuity (a document that also violates an invariant still
reports both kinds). Sweep on the corrected tree: **`M1`–`M7` all killed**, each built first on a cleaned
`dist/` and restored byte-identically (`restored=true` for all seven).

### Scoped re-judgment (round 2, terminal)

Both judges received `JD-B-001`, its row, the complete delta `b096b65..010ed85` and the disclosure of what
round 1 produced. **Both resolved `verified`.** No severe row survives, and the round budget is exhausted
with the second re-judgment spent rather than the second fix round — the correction of a fix-caused defect
sits inside round 1's own batch.

### Final verification and verdict

Clean detached worktree at `2279c15` (`../telegram_bus_agent-worktrees/verify-09a-final`), `dist/` rebuilt
from scratch: **304/304** tests (PR-08's 268 + `schema` 20 + `invariants` 16), `test:static` **8/8**, and the
focused set over the three suites this half owns — `schema`, `invariants` and the shared `project-file` —
**75/75**. The verdict below was first reached at `010ed85` and re-measured at `2279c15`, which adds only the
verifier's `F10` pin and this record.

With no severe row surviving and the final verification passing:

**`JUDGMENT: APPROVED`** for `e177c58..2279c15`.

### The ordinary native review — DECLINED for this candidate

The Receipt-driven Development switch is on and the Director never left this candidate unreviewed, so the
preflight ran against the frozen worktree (`workspaceRoot`), which binds the candidate to this slice exactly.
`inspect` returned `ready` with a committed-range START — `base-ref` the full `e177c58` SHA; the short SHA was
rejected as `native-start-base-ref-unresolvable`, and a failed START creates no lineage, so the retry was
safe. The START resolved consent as **`declined_this_candidate`**: `lineage_created: false`,
`mutation_performed: false`, risk tier **medium** on 12 changed files and 1,587 changed lines, correction
budget 0.

It is recorded as a decline, **never as a closure**, and the same candidate is not re-reviewed. The
documented fallback then ran: `assess` with the decline stated returned risk **unassessable** — the native
assessment came back schema-incompatible — which the contract treats exactly like high risk, so the plan was
*writer self-verification plus a separate independent verifier*.

- **Writer self-verification**: the clean-worktree runs, the seven mutants, and the two scoped re-judgments
  above.
- **Independent verifier** (`gentle-ai-verify`, read-only, over `e177c58..010ed85`): reproduced **304/304**,
  `test:static` **8/8**, the focused **75/75**, the budget as **1,256 / 20** with `src/registry/tsconfig.json`
  inside the counted scope and the root one outside, the twin rule, the provenance registry at 11 entries with
  no header on any new file, the behavioural claims, and the `M4`/`M6`/`M7` kills in its own scratch copy
  (including `M6`'s "exactly three tests").
- It found **eleven record defects** (`F1`–`F11`), all corrected before the commit that claims they are: two
  of the writer's own figures were **computed rather than measured** (a pair of per-file rows whose errors
  cancelled while the total stayed right, and a test count no revision ever had); the round-1 row count
  contradicted its own table (5/7 against a table of 4/8); the "`M1`–`M7` all killed" claim existed only in a
  commit message, so `M6` and `M7` are now defined in the matrix; the branch name named a branch that does
  not exist; the verification table still called `d5d73a0` the code tip; one pair count was wrong (four pairs,
  not two); the 9.2 checkbox still advertised "R1–R6"; the referential-integrity pin covered one dimension of
  three; the record's own round-1 and round-2 sections were missing from the tree the verifier was handed
  because they were still uncommitted when it ran — the writer's sequencing error, fixed by committing them
  and re-verifying.

## Next

---

# PR-09b — the registry loader: `src/registry/loader.ts` (+ twin)

Slice 12 of 45, the second half of row PR-09, which it closes (11 of the 45 rows done, delivered as 14
PRs). Delivered under the settled route: ODD with every substantive SDD contract preserved, then Judgment
Day as the audit substitute. The Arena bridge is down, so nothing was debated and **DN-05 is unsatisfied
for PR-09b** as for the rest of F1. Branch `f1/09b-registry-loader` from `main` @ `11c6af4`.

| Field | Value |
|---|---|
| Code commit | `3eba70d` (`loader.ts`, its twin, and `addSecondBinding` restored in `test/registry/fixtures.ts`) |
| Requirements | `project-binding › Machine registry schema and invariants` — the loader-side half of the four spec scenarios; **PT-25**'s registry-side half (the daemon-side `migrate_to_chat_id` half stays with `daemon/send/send-path`, B-26) |
| Provenance | none — no v1 range is vendored; the fixture stays at **11** entries |
| Budget | **775 authored lines / 400** — a disclosed **375-line PR-09b-scoped exception**. It measured 672 (272 over) before Judgment Day; round 1's mandated corrections added **+103** (the CRITICAL's pin, the latched-condition test, the BOM test, the fingerprint-retention test, and the fixture-path fix), and every figure here is measured after the correction, at the tip that ships |

## Scope and budget (measured)

| Path | Lines |
|---|---|
| `src/registry/loader.ts` | 257 (`237` before round 1) |
| `test/registry/loader.test.ts` | 486 (`403` before round 1) |
| `test/registry/fixtures.ts` | +32 (`addSecondBinding`, whose only caller this half is, with its path corrected in round 1) |
| **budget total** (`git diff --numstat main -- src test` at `e11bfaa`) | **775 / 400** — 375-line exception |

The exception's grounds are PR-08b's: one assertion per rule the gated rows state, plus the boundaries the
rules imply — the fingerprint's **two** members (mtime and size, each pinned by its own case), the ordering
between the stat and the read, the four spec scenarios, the deletion and directory states, and the R5
exemption's soundness. Trimming those is what the budget rule forbids.

## Where the code came from

The loader was written during the PR-09a session and left **uncommitted, green and deliberately
unreviewed** — the Director asked for PR-09a only — and the review preflight declined that draft twice
(`9110d7de…` and `0bc4e9dd…`; handoff §0.1). This session reviewed it as a reviewer rather than as its
author, completed it, and closed the tasks. Three findings of that review are **not** gate changes and are
disclosed here instead:

1. **The R5 mask had to become case-insensitive.** `sha256:<HEX>` matches the shared token regex exactly as
   the lowercase form does, so a mask that recognised only lowercase reported a hand-typed uppercase hash as
   `forbidden_content` — a false secret report that would send an operator hunting a leaked token that is
   not there. The document is still refused; the verdict is now the truthful `schema_invalid`. The mask
   stays sound: it is `sha256:` plus 64 hexadecimal characters, and a token's own colon cannot occur inside
   that class. The *schema* keeps requiring the lowercase hex the shared hasher emits (B-27 is unchanged and
   still open for the root cause).
2. **An injectable `stat`/`read` seam was added** (`RegistryFileIo`, defaulting to `node:fs`). It is this
   repository's own testing pattern (design §15 injects `telegramClientFactory`, `secretStore` and `now` the
   same way), it keeps R6 structural — the interface has no write, rename, unlink or open — and it is the
   only way to pin the stat-before-read ordering, which is otherwise unobservable through `node:fs` alone
   (ADR-12). The daemon passes nothing and gets the real file system.
3. **Deletion keeps the last good registry** (pinned by a test). Deletion is one more unloadable state, and
   the last-good registry is only ever replaced by a successful load; what must hold *nothing* is a daemon
   that starts against a file that never parsed, because an empty registry there would be
   indistinguishable from a machine with no bindings. The alternative reading — a vanished file means "no
   registry" and should deactivate pollers — is defensible but belongs to the reconciler (PR-21) and the
   design states no rule for it.

## TDD cycle evidence

| Step | Command | Observed |
|---|---|---|
| 9.3/9.4 RED and GREEN | in the PR-09a session | the draft was written test-first there; this session's RED is the three additions below, each failing before its fix |
| review findings | focused suite as each was fixed | the uppercase-hash case failed while the mask was case-sensitive (1 failure); the ordering test failed once the fingerprint was re-stated after the read (1 failure); the size case failed once `size` left the comparison (1 failure) |
| 9.5 focused, clean worktree at `3eba70d` | `node --test "dist/test/registry/schema.test.js" "dist/test/registry/invariants.test.js" "dist/test/registry/loader.test.js"` | **56/56** (schema 20, invariants 16, loader 20) |
| full suite, clean worktree at `3eba70d` | `npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js"` | **324/324** (PR-09a's 304 + 20 loader tests) |
| `test:static`, same tree | `node --test "dist/test/security/*.test.js"` | **8/8** — the provenance registry (11 entries, no header on any new file), the repo scan and `pack`. The **twin walk is not in this glob**: `test/twins.test.ts` compiles to `dist/test/twins.test.js`, so the twin rule is proved by the full-suite row above, not here (this attribution was wrong in the first draft of this record — the same defect PR-09a's round 1 corrected, regressed; round 1's `JD-B-003`) |

## Mutant matrix — each built first on a cleaned `dist/`, each restored byte-identically

| # | Mutant | Result | Test that killed it |
|---|---|---|---|
| `N1` | the R5 mask removed, so a canonical roster hash is scanned as a token (B-27 returns) | killed, 12 failures | every loader case that loads a valid registry, starting with *the first sync loads a valid file* |
| `N2` | the mask case-sensitive again (`gi` → `g`) | killed, 1 failure | *the mask is case-insensitive, so an uppercase hash is the shape problem it is, not a secret report* |
| `N3` | **NEVER-RENAME BOUNDARY**: a refused registry renamed to a `corrupt-<epoch>` sibling | killed, 1 failure | *a torn edit keeps the last good registry, raises `registry_invalid`, and never renames the file* |
| `N4` | the fingerprint re-stated **after** the read | killed, 1 failure | *the fingerprint is taken before the read, so a write landing mid-read is not recorded as loaded* |
| `N5` | the fingerprint compares mtime only, dropping `size` | killed, 1 failure | *the fingerprint includes size, not only mtime* |
| `N6` | a successful load does not clear the condition | killed, 1 failure | *an invalid file at the first load leaves nothing loaded… the next sync loads the fix* |
| `N7` | a failed load forgets the last good registry | killed, 4 failures | *a torn edit keeps the last good registry* + three more |

`N3` is the never-rename/quarantine boundary the handoff asks a mutant for, and `N4` is the reason the io
seam exists: before it, the stat-before-read ordering was a reasoned argument with no test that could fail.

## Reportable items (reported, not silently resolved)

1. **The R5 exemption is a workaround at the call site** (B-27, unchanged): the root cause is the shared
   regex's unbounded `\d+`, which also reaches the send-path backstop. The mask is sound (proved above and
   pinned), but the decision belongs to the Director.
2. **The loader cannot name which R5 rule fired** without parsing `assertNoTokenShape`'s prose or
   re-implementing the shape order — the same disclosure PR-09a made, still carried by B-27.
3. **PT-25's cell names only the registry-side half**, and the split with `daemon/send/send-path` is stated
   rather than resolved (B-26 stays open for the Director).

## Judgment Day round 1 (substitute for the tribunal debate)

Two blind read-only judges (`jd-judge-a`, `jd-judge-b`) swept the frozen tree
(`../telegram_bus_agent-worktrees/jd-09b`, detached at `88a0c52`) in one exhaustive pass each, graph-v1 rows
only, with the slice's own record in scope. **12 rows — 1 CRITICAL, 6 WARNING, 5 SUGGESTION**, with two pairs
reached independently. The Director authorized the full round-1 batch (the severe fix plus the informational
folds), the same shape as PR-09a's round.

| Judge | Row | Severity | Disposition |
|---|---|---|---|
| A | `JD-A-001` | **CRITICAL** | the R5 mask could be completed by a token's own digit run; **reproduced by the writer**, fixed in round 1 |
| A | `JD-A-002` | WARNING | `registry_invalid` latched on the `unchanged` path (also `JD-B-001`); folded |
| B | `JD-B-001` | WARNING | same defect as `JD-A-002`, independently reached; folded |
| A | `JD-A-003` | WARNING | R5's strictness refuses a free-form `title` containing `Authorization` or `KEY=`; **reported, not fixed** (a design decision, **B-30**) |
| A | `JD-A-004` | WARNING | a UTF-8 BOM (PowerShell's `Set-Content -Encoding UTF8`) made a valid registry `invalid_json`; folded |
| B | `JD-B-002` | WARNING | the "fingerprint only for a file that parsed" guarantee was unpinned and two mutants survived it; pinned by a test |
| B | `JD-B-003` | WARNING | this record credited the twin walk to the `test:static` glob — PR-09a's corrected wording, regressed; folded |
| A | `JD-A-005` | SUGGESTION | the restored fixture wrote `C:\work\second` with single backslashes, so the value was `C:worksecond` (also `JD-B-004`); folded |
| B | `JD-B-004` | SUGGESTION | same as `JD-A-005`, independently reached; folded |
| B | `JD-B-005` | SUGGESTION | a docstring cited design §6 for a flow that is §7.1; folded |
| B | `JD-B-006` | SUGGESTION | a JSON-escaped colon (`\u003a`) bypasses the raw-text scan; **reported, not fixed** (**B-31**) |
| B | `JD-B-007` | SUGGESTION | the record said "two findings" above a list of three; folded |

**The CRITICAL was found by one judge, and the writer reproduced it before touching anything.** Judge B did
not see it, and the skill's rule is to record a single-judge severe row as *suspect* rather than auto-fix it —
so the mechanism was verified against the built module first: `sha256:` + hex + `<bot id>:<secret>` supplies
exactly the 64 hexadecimal characters the mask looked for, so the mask swallowed the digits and left
`:<secret>`, which no longer matches `\d+:`; the document **loaded** with a real token inside, while the bare
token was refused. The module's own proof — "a token's own colon cannot occur inside that class" — was
wrong: the colon was never inside the class, it was left dangling just outside it. The fix requires the
character after the 64-hex run to be **neither hexadecimal nor a colon**, which makes the proof hold: a
token's `\d+:` can never be swallowed, so the digits preceding it stay visible to the scan. The finding's own
construction is now a test, with its 9-digit bot id replaced by this suite's 7-digit fixture — the finding's
literal trips the repository's own PT-22 scan, a false positive of the family this slice is about. The
Director authorized the batch explicitly, on the record that the row is single-judge.

### Corrections applied (round 1)

| Row(s) | Change | Why |
|---|---|---|
| `JD-A-001` | `withoutRosterHashes` bounds the mask with `(?![0-9a-fA-F:])`, and its docstring carries the corrected proof | the exemption could hide a real token: R5 failed open |
| `JD-A-002`/`JD-B-001` | the `unchanged` fast path clears the condition when the file agrees with the registry we hold | a timestamp-preserving restore latched `registry_invalid` for the daemon's whole life |
| `JD-A-004` | `parseRegistryText` strips a leading `\uFEFF` before both the scan and the parse | PowerShell's default UTF-8 output was refused as `invalid_json` on the Windows-first hand-edit path |
| `JD-B-002` | a new test holds content length, mtime **and** size fixed across a failed load, so a fingerprint recorded for the failure is observable | the module's stated guarantee had no test that could fail (ADR-12) |
| `JD-A-005`/`JD-B-004` | `addSecondBinding` writes `C:\\work\\second`, and the loader test asserts it | the shared fixture modelled a path no disk ever had |
| `JD-B-003` | this record's `test:static` row now names what the glob really runs | it credited a leg outside the glob |
| `JD-B-005` | the docstring cites design §7.1 (design.md:280) | the quoted boot flow is not in §6 |
| `JD-B-007` | "three findings" | the count contradicted its own list |

### Mutants re-run on the corrected tree

Nine, all killed, each built first on a cleaned `dist/` and restored byte-identically (`restored=true` for
all nine): `N3` the never-rename boundary, `N4` the post-read fingerprint, `N5` `size` dropped from the
comparison, `N6` the success path not clearing the condition, `N7` a failed load forgetting the last good
registry, `N8` **the mask's boundary dropped again** (the CRITICAL returning), `N9` the `unchanged` path not
clearing the condition, `N10` the BOM strip removed, `N11` a failed parse refreshing the fingerprint.
`N8`–`N11` exist because of this round, and each dies on the test written for its row. The round-1 sweep
first failed here for an unrelated reason worth recording: the finding's own 9-digit literal tripped PT-22,
so the repository's own scan failed until the fixture moved to the 7-digit shape this suite uses — the trap
the handoff documents, hit exactly as documented.

## Scoped re-judgment (terminal) and the verdict

Both judges received `JD-A-001`, its exact hash-bound row (frozen ledger SHA-256
`89ea325eabae4333f69f2e8b9e20bf52d0f45bb20b46e442d8716b86ef5fcaf3`, the one authorized severe row) and the
complete fix delta `88a0c52..e11bfaa`, with the folded rows disclosed for fix-line regression purposes only.
**Both resolved `verified`.** No severe row survives; the round budget is exhausted with a single round used,
and the second scoped re-judgment is unspent — as in PR-08a and PR-08b.

One final verification, in a clean detached worktree at the corrected tip with `dist/` rebuilt from scratch:
**328/328** tests (PR-09a's 304 + 24 loader tests), `test:static` **8/8**, and the focused command task 9.5
names — over the three suites this slice owns — **60/60** (schema 20, invariants 16, loader 24).

With no severe row surviving and the final verification passing:

**`JUDGMENT: APPROVED`** for `11c6af4..e11bfaa`.

## Next

- PR-09b's ordinary native review, then the PR.

## The ordinary native review — APPROVED for this candidate

The Receipt-driven Development switch is on and the Director never left this candidate unreviewed, so the
preflight ran against the frozen worktree (`verify-09b` at `18ec622`). `inspect` returned `ready` with a
committed-range START (`base-ref` `11c6af4`), and this time the host **granted** consent: lineage
`review-c5a6b9c191154861`, risk tier **medium**, one lens (`review-reliability`), 7 changed files, 972
changed lines, correction budget 200.

The single slot materialized after its forecast (1 model run, Pi host relay — relayed and then
acknowledged), and the closure was **`approved`** with four advisory findings, every one of them a
SUGGESTION and explicitly non-blocking:

| Finding | Location | Severity | Disposition |
|---|---|---|---|
| `R3-1` | `src/registry/loader.ts:109-113` | SUGGESTION | informational — backlog **B-32** |
| `R3-2` | `src/registry/loader.ts:221-229` | SUGGESTION | informational — backlog **B-32** |
| `R3-3` | `src/registry/loader.ts:241-244` | SUGGESTION | informational — backlog **B-32** |
| `R3-4` | `test/registry/loader.test.ts:184-185` | SUGGESTION | informational — backlog **B-32** |

The exact acknowledgement was executed and its envelope reports **`authority: burned`**
(`gentle-ai.review-acknowledged/v1`), so the lifecycle is closed: no correction transition was offered, none
is taken, and this candidate is never re-reviewed. Review approval is informational and authorizes no
delivery — commit, push, PR and merge stay under ordinary repository policy.
---

# PR-10 — ledger schema + `node:sqlite` transaction spike (`src/ledger/{schema,transaction}.ts` + build wiring)

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Branch | `f1/10-ledger-schema-spike` → `main` (base `3534739`, the PR-09b docs commit) |
| Mode | Strict TDD (RED observed once per module, before its implementation existed) |
| Status | Implemented and verified; tasks 10.1–10.6 marked `[x]`; **Judgment Day audit and the ordinary native review pending** |

## Scope and budget (measured)

| File | Authored lines (re-measured after round 2) |
|---|---|
| `src/ledger/schema.ts` | 117 |
| `src/ledger/transaction.ts` | 150 |
| `src/ledger/tsconfig.json` (build wiring, not named in the block's Scope line) | 14 |
| `test/ledger/schema.test.ts` | 625 |
| `test/ledger/transaction.test.ts` | 379 |
| **Total, `git diff --numstat -- src test`** | **1,285 added, 0 deleted** |

Outside the budget rule's own unit (`src test`): `tsconfig.json` (+1/−1, the root `references` entry) and
`docs/02-architecture/THREAT-MODEL.md` (+1/−1, PT-10's cell). The block estimated ≈400, so the slice
carries a **disclosed PR-10-scoped size exception, 885 over**, granted by the Director with the commit
authorization and re-confirmed for the round-1 batch. The movement is recorded rather than smoothed —
885 / 485 before any correction, **1,140 / 740** after round 1's batch (`+284 / −29`), **1,285 / 885** after
round 2's fix (`+169 / −24`) — and the growth past the authorized batch is the cost of correcting a defect
that batch introduced, disclosed rather than absorbed. Every figure is measured, never derived. Grounds: the
DDL
and its twin pin one property per constraint rather than a sample of them — the object inventory, `STRICT`
plus the control that proves it bites, the `NOT NULL` inventory, the completeness *and* strictness of every
closed vocabulary, both unique keys PT-10's replay needs, `seq`'s monotonicity, both cascades, both
hand-written indexes, the bodiless tables, the VIEW's four branches and the DDL's refusal of a second
application — and trimming that list is what the budget rule forbids.

## Where the code came from

No vendoring: design §12's only row naming `ledger/*` is the **REPLACED** row
(`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), so there is no v1 text to reuse and neither
module carries a provenance header; `test/fixtures/v1-provenance.json` stays at **11 entries** (unchanged
since PR-07b). *(Corrected in round 1: the first record said no §12 row names `ledger/*` at all, which
`design.md:452` contradicts. The conclusion was right; the premise was not.)* The DDL is authored in design
§5.2 and this slice is that text; the transaction module is new code for an idiom design §5.3 settles as an
implementation detail.

**The DDL is verbatim, and that is a measurement rather than a claim.** The `sql` block was extracted
programmatically from `design.md` §5.2, spliced into `schema.ts` by a script, and compared back:
`sha256 9e9bb65545df29ce5871bea095a6d5457a8865a1a739abda9feb62058915b506`, **74 lines / 4,123 bytes**,
**0 differing lines**, with two failing controls (one byte appended; `STRICT` stripped) proving the
comparison can say "different".

## TDD cycle evidence

| Task | RED (observed) | GREEN |
|---|---|---|
| 10.1 | `npm run build` → `test/ledger/transaction.test.ts(8,61): error TS2307: Cannot find module '../../src/ledger/transaction.js'` (exit 2) | `test/ledger/transaction.test.ts` **5/5** |
| 10.3 | `npm run build` → `test/ledger/schema.test.ts(8,35): error TS2307: Cannot find module '../../src/ledger/schema.js'` (exit 2) | `test/ledger/schema.test.ts` **11/11** |
| 10.5 | — | focused **16/16**; full suite **344/344** (328 → 344); `test:static` **8/8**. Re-measured after round 1: focused **21/21**, full **349/349**, `test:static` **8/8**. Re-measured again after round 2: focused **24/24**, full **352/352**, `test:static` **8/8** |

Two test-side bugs of the slice's own were found by the first GREEN run and fixed before this record was
written, both in `schema.test.ts`: the `thread_history` vocabulary rows had no parent `threads` row
(`FOREIGN KEY constraint failed`, errcode 787), and the strictness case deleted that parent before the
invalid insert. The fix inserts one parent thread and gives the two rows distinct keys, which also removes
the chance that a unique-key refusal is mistaken for the CHECK's.

## The spike (design §5.3's risk-register row, closed)

Measured on the pinned build — Node **24.16.0**, SQLite **3.53.0** — before any file was written:

| Question | Answer |
|---|---|
| Does `DatabaseSync.isTransaction` exist? | Yes: `false` → `true` on `BEGIN IMMEDIATE` → `false` on `ROLLBACK` |
| Does a throw inside the callback roll the batch back? | Yes for a failed statement, which leaves the transaction open so the catch still owns the rollback. **Corrected in round 1:** SQLite's auto-rollback classes (`SQLITE_FULL`, `SQLITE_IOERR`, …) close the transaction themselves — measured, errcode 13 leaves `isTransaction` false — which is why the catch guards on `isTransaction` instead of rolling back unconditionally |
| Is a nested call refused? | Yes, by SQLite itself (`cannot start a transaction within a transaction`) — and `ROLLBACK` with no transaction throws `cannot rollback - no transaction is active` |
| Can `exec()` run the whole DDL at once? | Yes (multi-statement), which is why `schema.ts` exports one string |
| Is `PRAGMA foreign_keys` on by default? | Yes (`node:sqlite` opens with `enableForeignKeyConstraints`) |

**Verdict: the idiom holds, so no ADR is needed** — design §5.3's own expectation. One deliberate addition
is part of `transaction.ts`'s contract: the nested refusal is checked **before** `BEGIN` runs. SQLite
refuses the nested `BEGIN`, but a nested call whose own `catch` then ran `ROLLBACK` would roll back the
*outer* call's transaction — the batch it never opened. That is `M4`/`M5` below, and the suite pins the
refusal leaving the outer transaction intact and committable.

## Mutant matrix — each built on a cleaned `dist/` in an isolated worktree, each restored byte-identically

Run in `../telegram_bus_agent-worktrees/verify-10` (detached at `3534739`, the candidate applied as a patch
and proved sha256-identical to the working tree for all seven files, `npm ci --ignore-scripts`, `dist/`
rebuilt from scratch before each mutant).

| # | Mutant | Verdict | Killed by |
|---|---|---|---|
| `M1` | `BEGIN IMMEDIATE` → `BEGIN` (deferred) | KILLED | the write-lock test: with no writes made yet, the second connection's write would have succeeded |
| `M2` | the `ROLLBACK` call removed | KILLED | a throw inside the callback leaves no row |
| `M3` | `COMMIT` moved before the callback runs | KILLED | five tests, including the rollback boundary and every transaction-state assertion |
| `M4` | the nested-call refusal removed | KILLED | the nested call is refused **and** the outer transaction survives |
| `M5` | the catch's still-open guard removed | KILLED | a callback that ends the transaction itself must not mask the caller's error |
| `M6` | `STRICT` dropped from one table (`conditions`) | KILLED | every ledger table declares STRICT |
| `M7` | one `apply_outcome` value dropped (`noted`) | KILLED | the vocabulary is complete, not merely strict |
| `M8` | `UNIQUE (bot_id, update_id)` removed | KILLED | a redelivered update is refused, naming the key |
| `M9` | the VIEW's `awaiting IS NOT NULL` removed | KILLED | the waiting turn only |
| `M10` | a window-sized literal introduced (`DEFAULT 0` → `DEFAULT 7`) | KILLED | the DDL's executable text carries no window constant |
| `M11` | `ON DELETE CASCADE` dropped from the `thread_history` key | KILLED | both foreign keys cascade |
| `M12` | a `body` column added to `audit_log` | KILLED | the tables that must never hold a body have none |

**12 of 12 killed, 0 survived**, and each died on the test that owns the property (no collateral). Both
source files were restored byte-identically (sha256 control) and the restored tree re-verified green:
focused **16/16**, full **344/344**, `test:static` **8/8**, `npm test` **344/344**.

**The corrected tree was then swept again — the original twelve re-run from scratch (their sources changed)
plus five new ones, one per pin round 1 introduced: 17/17 killed, 0 survived.** `M13` the thenable refusal
removed, `M14` the thenable check moved after the `COMMIT`, `M15` every `NOT NULL` removed from the DDL,
`M16` both `AUTOINCREMENT` clauses removed, `M17` `IF NOT EXISTS` added to one table. Each died on the test
that owns the property: `M13`/`M14` on the async refusal, `M15` on the `NOT NULL` inventory, `M16` on
`seq`'s monotonicity, `M17` on the second-application refusal.

**`M17` survived the first corrected sweep, and that is disclosed rather than quietly repaired.** Adding
`IF NOT EXISTS` to `offsets` moves the failure to `updates`, and the assertion as first written only checked
that *something* was refused with "already exists", so it stayed green. The pin was strengthened — the
refusal must name `table offsets already exists`, plus a text check that no statement carries
`IF NOT EXISTS`, because the behavioural half alone can only ever see the first statement — and the mutant
then died. The scratch sweep script also had two stale anchors after the correction rewrote the lines they
matched; both were rebuilt with a guard that rejects a substitution which changes nothing, the same
silent-no-op class as the invalid AUTOINCREMENT probe in the round-1 record above.

Final state after the sweep: sources restored byte-identically (sha256 control), focused **21/21**, full
**349/349**, `test:static` **8/8**. Round 2 then added `M18`/`M19` and re-ran the whole matrix: **19 mutants,
19 killed, 0 survived, 0 skipped**, focused **24/24**, full **352/352**, `test:static` **8/8** — see the
round-2 section below.

## Reportable items (reported, not silently resolved)

1. **A leading doc comment must not spell `test/security/provenance.test.ts`'s header token.** That gate
   reads a file's leading `/**` block as a vendor header whenever the block carries the header's first
   token, and reports the file as a *malformed vendored module* otherwise. `src/ledger/schema.ts` has no
   imports, so its doc comment *is* the leading block, and the first draft stated the fact with the token
   spelled out — the static suite failed with `malformed Provenance header(s) in: src/ledger/schema.ts`.
   Both new modules now state the constraint without the token, and that gate is the pin. Every earlier
   non-vendored module was safe only because its imports came first.
2. **PT-10's cell is filled by two slices.** `design.md:551` sends PT-10 to `ledger/inbox`; task 10.6 asks
   PR-10 to fill the cell. PR-10 fills the half it pins (the rollback boundary and the
   `UNIQUE (bot_id, update_id)` dedup) and names `ledger/inbox` (PR-12) as the scenario's owner — the split
   PT-25's row states, per B-26. No document contradicts another, so no new backlog row is claimed here.
3. **PT-20's cell is deliberately *not* claimed.** The schema's `audit_log`/`unknown_senders` have no body
   column at all, which is PT-20's precondition rather than its assertion — the assertion is about rows the
   write paths append, and task 13.6 gives PR-13 that cell. Disclosed so the omission reads as a decision
   rather than an oversight.
4. **A boundary that is now pinned rather than stated.** `withTransaction`'s callback must be synchronous,
   and `() => T` cannot forbid `T = Promise<void>`, so the value is checked before `COMMIT`: a thenable is
   refused and the callback's synchronous part is rolled back. Round 1's `JD-B-007` pointed out that the
   earlier claim — "stated rather than pinned, no test could pin it" — was itself questionable, and the
   refusal is the stronger answer: a misuse the caller sees instead of a partial write it does not.

## Judgment Day round 1 (substitute for the tribunal debate)

Two blind read-only judges (`jd-judge-a`, `jd-judge-b`) swept one frozen tree,
`../telegram_bus_agent-worktrees/verify-10`, detached at the audited tip **`0c9d239`** with
`git status --porcelain` empty before and after, under identical scope, criteria and skill paths, with no
contact between them. Skill resolution: `paths-injected`.

**Ledger: 0 BLOCKER, 0 CRITICAL — 13 informational rows** (judge A: 4 WARNING + 1 SUGGESTION; judge B:
3 WARNING + 4 SUGGESTION), two of them reached independently by both judges.

| Row | Judge | Severity | Claim | Reproduced by the parent | Disposition |
|---|---|---|---|---|---|
| `JD-A-001` | A | WARNING | "design §12 has no row naming `ledger/*`" is false | yes — `design.md:452` names it, verdict **REPLACED** | **folded** |
| `JD-A-002` | A | WARNING | `transaction.ts`'s rationale claims a hazard that cannot apply to a module beginning with an import | yes — the gate inspects only a *leading* `/**` block | **folded** |
| `JD-A-003` + `JD-B-001` | both | WARNING | the hygiene claim about 8–10 digit runs is false | yes — `grep -oE '[0-9]{8,10}'` prints `100000001`, `1700000000` | **folded** |
| `JD-A-004` + `JD-B-003` | both | WARNING / SUGGESTION | "PT-27's rule" is the client-bundle row; the rule is ADR-0027 | yes — `THREAT-MODEL.md:150` | **folded** |
| `JD-A-005` | A | WARNING | `NOT NULL` and `AUTOINCREMENT` are unobserved by any assertion | yes — stripped `AUTOINCREMENT` and measured `seq` falling **3 → 1** after a full delete | **folded (two pins)** |
| `JD-A-006` | A | SUGGESTION | the suite promises a control for both text-level checks; the second has none | yes, by reading the suite | **folded** |
| `JD-B-002` | B | WARNING | the `updates.body` message implies a coupling the DDL does not enforce | yes — a `rejected` row carrying a body is accepted | **folded (message + module boundary)** |
| `JD-B-004` | B | WARNING | the recorded spike verdict is false for SQLite's auto-rollback classes | yes — `PRAGMA max_page_count = 8`, bulk insert → errcode **13**, `isTransaction` **false** | **folded (claim + pin)** |
| `JD-B-005` | B | SUGGESTION | "a second application is an error" has no pin | yes — errcode 1, `table offsets already exists` | **folded** |
| `JD-B-006` | B | SUGGESTION | the "durable" test observes nothing beyond its own connection | yes, by reading the test | **folded** |
| `JD-B-007` | B | SUGGESTION | the async boundary is not unpinnable, as the docstring claimed | yes, by reading the signature | **folded (thenable refusal)** |

Nothing was accepted on the judges' authority in either direction. Every consequential claim was
reproduced before it was folded, and one of the parent's own probes was rebuilt when its first form proved
invalid: the AUTOINCREMENT replacement string did not match the DDL (`AUTOINCREMENT,` has no trailing
space), so the "without" variant was silently identical to the original and reported `3 → 4` for both. The
corrected probe — with the substitution asserted to have changed the text — measured `3 → 1` without the
clause and `3 → 4` with it, which is the judge's own scenario.

### The correction batch (round 1), Director-authorized

Six statements the slice made about itself were false, and five pins were missing. All eleven were folded
in one correction commit, in keeping with the precedent that a correction is itself unaudited until
something re-checks it (the scoped re-judgment below, plus the extended mutant sweep):

**Corrected claims.** (1) the §12 premise in both modules and in *Where the code came from* above;
(2) `transaction.ts`'s self-referential provenance-token rationale; (3) the digit-run hygiene claim in
`schema.test.ts`'s header, now stating the scan's real shape; (4) the `PT-27` citation, now ADR-0027 plus
the durable-inbox spec; (5) the spike verdict in `tasks.md` and in *The spike* above, narrowed to the
constraint-failure case it was measured on; (6) the promise of a control for the window scan — the control
was written rather than the promise withdrawn.

**Added pins.** (7) the per-table `NOT NULL` inventory against `design §5.2`; (8) `updates.seq`'s
monotonicity across the full delete retention performs, which is what `AUTOINCREMENT` buys and what a
redelivered update below a client's cursor would break; (9) the DDL's refusal of a second application;
(10) SQLite's auto-rollback class, where the catch guard is the only thing keeping the caller's own error;
(11) the thenable refusal, which makes the synchronous-callback boundary a guarantee instead of a warning.

**A boundary the correction disclosed instead of coding:** the `updates.body` /
`apply_outcome IN ('rejected','ignored')` coupling is D-20's writer rule and is enforced nowhere in the
DDL — SQLite accepts a `rejected` row carrying a body — so `schema.ts`'s module comment now says so, and
that coupling stays with `ledger/inbox.ts` (PR-12).

### Scoped re-judgment over the fix delta — and the regression it found

Both judges re-judged `0c9d239..aa65b25`, resolving the eleven folded IDs and nothing else. **Ten resolved
`verified` on judge A and six on judge B; `JD-B-007` came back `regression` from both, independently** —
the only row neither judge would accept, and the row whose fix this slice had written itself.

Substantiated by both judges after the resolution (the graph-v1 resolution shape carries no claim field, and
a first attempt to obtain the substance went to the wrong sessions — the two discovery judges correctly
refused to invent substance for an ID they had not produced):

> the refusal only rolls back the pre-`await` part: statements the callback runs after an `await` still
> execute on the same live connection with `isTransaction === false` and autocommit, so the misuse yields an
> error **and** a silently half-applied batch — the worst case being only the later statements persisted,
> which is the batch-coherence loss PT-10's replay/offset design exists to prevent.

Reproduced by the parent before believing it (a scratch probe outside the frozen tree, against the module
built from `aa65b25`): `withTransaction(db, async () => { insert(1); await …; insert(2); })` surfaced
`ASYNC_CALLBACK_MESSAGE` **and** left row 2 committed, row 1 rolled back. The parent's own probe found a
second defect in the same fix: the abandoned promise was never settled, so a *rejecting* async callback
produced an unhandled rejection after the misuse had been reported — which Node's default policy turns into
a process crash.

### Round 2 — the final bounded fix round

The refusal moved to where it can actually prevent the work. `withTransaction` now checks the callback's
own shape **before `BEGIN`** (`isAsyncFunction`, read structurally):

- an `async` callback is refused **before it runs**, so nothing it would have written exists at all —
  including a tail after an `await`, which no later rollback could reach. This is the shape a caller
  actually writes; a bound or proxied `async` function whose constructor identity does not survive falls
  through to the value check, and the module doc says so rather than claiming otherwise.
- a thenable *returned* by a callback that is not itself `async` is still refused before `COMMIT` and rolled
  back, and the abandoned promise is now **settled** on the way out. What that promise's continuation does
  afterwards is the caller's code on the caller's connection and outside this module's reach — stated as a
  limitation, not as a guarantee.
- `isThenable` now covers **functions** as well as objects, because Promises/A+ §1.1 defines a thenable as
  "an object or function that defines a then method" and both are assimilated by `await` and by
  `Promise.resolve`. The narrower object-only check was itself a claim the docstring could not support (it
  said the check caught all of them), found by the discovery judge whose session was asked to substantiate
  the regression.

Three tests pin the corrected behaviour, and one of them is written to fail against the old shape: the async
tail test drains the macrotask queue before asserting, so a tail that did run would have landed, and it
asserts the callback never *started*.

**Sweep after round 2: 19 mutants, 19 killed, 0 survived, 0 skipped** — the seventeen re-run from scratch
(two of their anchors went stale when round 2 rewrote the lines they matched, and both were rebuilt before
the sweep was reported, so no gap was left silent) plus `M18` (the pre-flight refusal removed) and `M19`
(the abandoned promise left unsettled). Each died on the test that owns the property. Final state at the
round-2 tip: sources restored byte-identically, focused **24/24**, full **352/352**, `test:static` **8/8**.

**Budget after round 2: 1,285 authored lines, 885 over** the 400-line budget — 117 `schema.ts`, 150
`transaction.ts`, 14 its `tsconfig.json`, 625 `schema.test.ts`, 379 `transaction.test.ts`. The movement is
recorded rather than smoothed: 885 / 485 before any correction, 1,140 / 740 after round 1's batch, 1,285 /
885 here, with round 2's own delta at **+169 / −24**. The growth beyond the authorized batch is the cost of
correcting a defect that batch introduced, and it is disclosed to the Director rather than absorbed.

### Final verification and verdict (round 2, terminal)

Both judges resolved `JD-B-007 → verified` at `4951fc6`, independently. One authorized correction batch and
one final bounded fix round were used, with both scoped re-judgments spent and **no severe row outstanding
at any point** — no BLOCKER and no CRITICAL was raised in either round.

Final verification at the frozen tip `4951fc6`, `dist/` rebuilt from scratch in the isolated worktree:
focused **24/24**, full **352/352** (328 before the slice), `test:static` **8/8**, and the 19-mutant sweep
19/19 killed with both sources restored byte-identically.

**`JUDGMENT: APPROVED`** for `3534739..4951fc6`.

## Next

- The ordinary native review, then push, PR and the CI matrix. The audit-path record goes to
  `docs/05-tribunal/INDEX.md` at close as `bus-v2-f1-pr-10-audit-001`, with DN-05 unsatisfied.
