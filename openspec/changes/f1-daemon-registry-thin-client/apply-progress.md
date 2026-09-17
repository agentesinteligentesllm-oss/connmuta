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
