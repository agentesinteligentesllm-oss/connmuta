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
