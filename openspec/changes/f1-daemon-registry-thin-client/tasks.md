# Tasks: F1 — Daemon, registry, thin client, migration

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Inputs | `proposal.md`; `design.md` (§2 layout, §3 constants, §12 v1 reuse, §14 static assertions, §15 test strategy, §20 build order); `specs/README.md` (47 requirements / 85 scenarios); nine `specs/*/spec.md`; tribunal `bus-v2-f1-proposal-001` rulings (a)–(e); tribunal `bus-v2-f1-design-001` rulings (1)–(7); Director note DN-06 |
| Delivery strategy | `auto-chain`. DN-06 exception: `size:exception` applies **only** to PR slices that vendor **whole** v1 files AS-IS (1:1 at `bf8f365`, import block and header excluded), with the v1 body SHA-256 carried in the provenance header and re-verified by `test/security/provenance.test.ts`. A module assembled from line ranges of v1 files is a SEAM by construction (tribunal `bus-v2-f1-tasks-001` items 1–2). Every SEAM or new-code PR stays ≤ 400 changed lines (additions + deletions, authored text only) |
| Chain strategy | `stacked-to-main`. Each PR targets `main` in sequence; PR N+1 branches from PR N's branch and is retargeted to `main` after PR N merges; no tracker branch. Remote `origin` = `agentesinteligentesllm-oss/connmuta`, default branch `main` |
| TDD rule | Strict TDD (CONSTITUTION §5–6, GOVERNANCE §6, ADR-0031). Red before green. Every `src/**/*.ts` has a `test/**/<same>.test.ts` twin (`test/twins.test.ts` enforces it). In every PR below, the RED task precedes the GREEN task that creates the `src` file it tests |
| PR budget | 400 changed lines per PR (review policy from SDD preflight), except `size:exception (AS-IS hash-pinned)` slices. Counted: authored additions + deletions. Not counted: generated files (`npm-shrinkwrap.json`) and SDD bookkeeping (`tasks.md` checkbox flips, `apply-progress.md`) — they travel in the same PR but are not review load (session 3, `bus-v2-f1-pr-01-001`) |
| Rollback (default, all PRs) | Revert the PR (`git revert`); no data migration inside F1 except the ledger's own `PRAGMA user_version = 1` (introduced in PR-11, still pre-production at that point) |
| Verify (base commands) | Build: `npm run build` (`tsc -b`). Full suite: `npm test` (`tsc -b && node --test "dist/test/**/*.test.js"`). Static suite: `npm run test:static`. Wrong-room named CI step: `npm run test:wrong-room`. Focused: `node --test "dist/test/<glob>"` after `npm run build` — the glob is named per PR below |
| Proposal deliverable 11 amendment (D-15) | Fence is applied **by the daemon at the IPC response boundary**, not by the client (tribunal ruling `bus-v2-f1-design-001` item 2; design.md D-15). One fencing/origin-labelling site; the client only forwards fenced text. Implemented in PR-06 (`shared/fence.ts`) and consumed in PR-23/PR-25 (`daemon/serve/fetch.ts`, `daemon/serve/thread.ts`) |
| Documentation per PR | Every PR whose Requirements line names a PT id updates the file-name cell(s) of those PT rows in `docs/02-architecture/THREAT-MODEL.md` §4 in the same PR (1–2 lines each, counted in its budget; tribunal `bus-v2-f1-tasks-001` item 5). PR-42 remains the close-out for DATA-MODEL and CHECKLIST |
| D-29 deliverables | `conmuta daemon stop` (PR-17) and `conmuta validate [<path> \| --stdin]` (PR-08) ship as explicit F1 CLI deliverables, ratified by tribunal ruling `bus-v2-f1-design-001` item 3 |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ≈13,000 authored lines in the tree (design §20 total, cross-checked in this phase against real `telegram-agent-bus@bf8f365` line counts — see reconciliation below) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 45 PR slices, PR-01a → PR-42 with PR-01a/PR-01b, PR-07a/PR-07b and PR-22a/PR-22b, in design §20's unit order |
| Delivery strategy | `auto-chain` |
| Chain strategy | `stacked-to-main` |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
400-line budget risk: High
```

- Total PR slices: 45 (44 at the tasks gate; PR-01 was re-sliced into PR-01a/PR-01b at apply time on real diff evidence — see the apply-time re-slice note below).
- Slices carrying `size:exception (AS-IS hash-pinned)`: 2 — PR-02 (`shared/envelope.ts` + twin, ≈1,030 vendored body lines) and PR-20 (`daemon/transport/*.ts` + twins, ≈732 vendored body lines). Combined vendored-body total excluded from the 400-line check: ≈1,760 lines. `tool-schemas.ts`, `tool-output.ts` and `test/security/predicates.ts` are range extracts of v1 files, therefore SEAM with full review (tribunal `bus-v2-f1-tasks-001` items 1–2).
- Non-exception authored total: ≈13,000 − 1,760 ≈ 11,240 lines across the remaining 43 PR slices (≈260 lines/PR average).
- Largest non-exception slice: **PR-05** (`shared/protocol-apply.ts` + D-05 twin, ≈390 lines — one cohesive state-machine module; `sdd-apply` watches its real diff size). The seven-step admission pipeline (PT-03, PT-04, PT-16, PT-17, PT-31; invariants 1, 4, 5) is pre-split into **PR-22a** (`daemon/admission.ts`, ≈250) and **PR-22b** (`daemon/poller.ts`, ≈145) so the highest-risk code gets its own review (tribunal `bus-v2-f1-tasks-001` item 4). PR-07b (`shared/tool-output.ts` + twin, ≈385) is the next largest; if its twin pushes it over 400, the twin ships as PR-07c.
- **Arithmetic reconciliation against design §20**: design's own total is "≈13,000 authored lines over ≈38–40 chained PRs". This plan lands at **44** PR slices for the same ≈13,000 lines — 4 to 6 more than design's range — because, besides the PR-07a/b and PR-22a/b splits ruled in `bus-v2-f1-tasks-001`, two vendor points design flagged only qualitatively (§19 Risks: "vendored modules split at natural seams... telegram.ts seam split") needed a concrete split at the tasks phase: (a) `daemon/telegram.ts` (428 real v1 lines, SEAM, no exception — see PR-18/PR-19) is delivered incrementally across two PRs at an internal function-group seam (client + request plumbing, then error classification + redaction wiring) to stay under budget, without changing the fixed single-file target design.md §2.1 names; (b) `daemon/serve/status.ts` + `daemon/serve/thread.ts` (162 + 164 real v1 lines) are delivered as two independent PRs (PR-24/PR-25) instead of one, since combined with ledger-read adaptation and tests they exceed 400 authored lines. No unit required an artificial cut below a cohesive slice; every split follows an existing file boundary or, for `telegram.ts` only, a function-group boundary inside the one file design names.
- **Apply-time re-slice (session 3, `bus-v2-f1-pr-01-001`)**: the real authored diff of PR-01 as planned was ≈790 lines against its ≈350 estimate — the named-constant rule (one reasoned doc comment per constant, ≈45 constants → 319 lines) plus Strict TDD twins doubled it, and DN-06's `size:exception` does not apply to new code. The slice was cut at the module boundary into PR-01a (scaffold + CI + static gates) and PR-01b (`shared/constants.ts` + twin); no other slice changed. Planning lesson for the remaining slices: estimates that count v1 lines under-count SEAM modules whose doc comments must be re-authored; `sdd-apply` measures the real diff before opening each PR and re-slices at a file boundary when it exceeds 400.
- Real v1 line counts pulled from the frozen `telegram-agent-bus@bf8f365` checkout in this phase (read-only): `envelope.ts` 331, `secrets.ts` 86, `config.ts` 267, `protocol.ts` 477, `state.ts` 602, `telegram.ts` 428, `transport/{types,direct,group,dual}.ts` 111+67+97+62=337, `tools/fetch.ts` 931, `tools/send.ts` 660, `tools/status.ts` 162, `tools/thread.ts` 164, `index.ts` 292; test twins `envelope.test.ts` 699, `protocol.test.ts` 897, `security.test.ts` 273, `fakes/telegram.ts` 154, `transport/{direct,group,dual}.test.ts` 113+104+178=395, `secrets.test.ts` 133, `tools/fetch.test.ts` 2116, `tools/send.test.ts` 1572, `tools/status.test.ts` 398, `tools/thread.test.ts` 236, `index.test.ts` 332, `state.test.ts` 645, `telegram.test.ts` 367, `config.test.ts` 233. These confirm design §3/§12/§20's rough figures within the expected range and drove the PR-05, PR-18/19, PR-24/25 slicing decisions above.

## PR Slices

Each PR below follows design §20's unit order exactly: scaffold+constants+CI → shared vendored → project-binding → ledger → secret-store → daemon-lifecycle → durable-inbox → send-path → ipc-handshake → thin-client-tools → v1-migration → static assertions + wrong-room CI → documentation.

### Unit 1 — Scaffold, constants, CI

#### PR-01a — scaffold + CI + static gates
Branch `f1/01a-scaffold-ci-gates` → `main`. Depends: none (first PR). Size: ≈360 lines, no exception. Re-sliced from the planned PR-01 at apply time (see the forecast's apply-time re-slice note).
Scope: `package.json`, `tsconfig.base.json`, `tsconfig.json`, `src/shared/tsconfig.json`, `src/client/tsconfig.json`, `src/daemon/tsconfig.json`, `src/cli/tsconfig.json`, `npm-shrinkwrap.json`, `.github/workflows/ci.yml`, `src/shared/version.ts`, `test/shared/version.test.ts`, `test/twins.test.ts`, `test/security/pack.test.ts`, `test/security/repo-scan.test.ts`, `test/fixtures/repo-scan-negative.txt`, `.gitignore` (one negation line: the `*.txt` rule from THREAT-MODEL T12 would otherwise swallow the seeded fixture and make PT-22 vacuous in CI).
Requirements: scaffolding for every capability; static gates `daemon-lifecycle › Static bundle assertions and packaging conformance` (PT-21 half) and repo-scan (PT-22) pinned early per design §20 unit 1.
Runtime harness: N/A — build-only checks (no daemon/client process exists yet).

- [x] 1a.1 RED: write `test/shared/version.test.ts` asserting `SERVER_VERSION` equals `package.json` `version` (the v1 pattern `v1:src/config.ts:44-52` / `test/index.test.ts`; this twin is required by the rule 1a.4 introduces and was missing from the planned scope).
- [x] 1a.2 Scaffold `package.json` (`name: conmuta`, `private: true`, `type: module`, `bin.conmuta = dist/src/cli/main.js`, `engines.node: >=24.15.0`, `files` whitelist, `scripts` with no lifecycle hook, exact dependency pins), `tsconfig.base.json` plus the root and four unit `tsconfig.json` files per design §2.2's compile-unit boundary (`extends` the base; a unit enters the root `references` when its first `.ts` file lands, because an empty composite project is `TS18003`; build info under `dist/.tsbuildinfo/` so it is never packed), `npm-shrinkwrap.json`, and `.github/workflows/ci.yml` (`windows-latest` × Node `24.15`/`26`).
- [x] 1a.3 GREEN: implement `src/shared/version.ts` (`SERVER_VERSION` literal; the shared unit stays free of `node:fs`) — 1a.1 passes.
- [x] 1a.4 RED: write `test/twins.test.ts` enumerating `src/**/*.ts` and failing when any file has no `test/**/<same>.test.ts` twin (non-vacuous: at least one source file must be found).
- [x] 1a.5 RED: write `test/security/pack.test.ts` (PT-21: `npm pack --dry-run` whitelist matches `files`, no `preinstall`/`install`/`postinstall`/`prepare` script, `npm-shrinkwrap.json` present, no `.tsbuildinfo` packed) and `test/security/repo-scan.test.ts` (PT-22: token-shape regex + tenant deny-list scan over tracked files; seeded `test/fixtures/repo-scan-negative.txt` must fail the scan so it is non-vacuous; `npm-shrinkwrap.json` excluded as generated).
- [x] 1a.6 GREEN: wire `build`/`test`/`test:wrong-room`/`test:static` npm scripts so 1a.1, 1a.4, 1a.5 pass under `npm test` (`test:wrong-room` matches by glob so the step is green until PR-41 lands its file).
- [x] 1a.7 Verify: `npm run build && npm test`. Note two pending Director items surfaced by this PR: B-11 (`PRODUCT_NAME` is the single rename constant; trademark screening still open) and B-16/D-10 (this scaffold follows Kairo's DN-06 assumption — `LICENSE` ships now with `private: true` until F6 — open to Director veto).
- [x] 1a.8 Docs: update the file-name cell(s) of PT-21, PT-22 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-01b — `shared/constants.ts` (SEAM)
Branch `f1/01b-shared-constants` → `main`. Depends: PR-01a. Size: ≈380 lines, no exception.
Scope: `src/shared/constants.ts`, `test/shared/constants.test.ts`.
Requirements: W1/W8 sentinel agreement (design §15 mapping "W8 `shared/constants`"); D-03 `NODE_FLOOR`; D-09 `PRODUCT_NAME` as the single rename constant (B-11); every design §3 value named with its reasoning (named-constant rule, CONSTITUTION §5).
Runtime harness: N/A — unit test over exported constants.

- [x] 1b.1 RED: write `test/shared/constants.test.ts` asserting `PROTOCOL_SENTINEL === "AGENTBUS/2"`, `SUPPORTED_PROTOCOL_SENTINELS` contains both `/1` and `/2` sentinels and the emitted one (W8), `NODE_FLOOR === "24.15.0"` (D-03), the `PRODUCT_NAME` derivations, and every derived value in design §3 as an expression over its base (values marked "tuning" pin the invariant, never the number).
- [x] 1b.2 GREEN: implement `src/shared/constants.ts` (SEAM from `v1:src/config.ts:26-166` with the design §12 provenance header and the v1 body SHA-256; `HTTP_*` codes stay for `shared/ipc-contract.ts` in PR-29 and `TELEGRAM_BOT_TOKEN_RE` for `shared/secrets.ts` in PR-03) — 1b.1 passes.
- [x] 1b.3 Verify: `npm run build && node --test "dist/test/shared/constants.test.js"`, then the full `npm test`.

### Unit 2 — Shared vendored modules

#### PR-02 — provenance mechanism + `envelope.ts` (size:exception, AS-IS hash-pinned)
Branch `f1/02-envelope-provenance` → `main`. Depends: PR-01b. Size: ≈110 new authored lines + 331 (`envelope.ts`) + 699 (test twin) AS-IS vendored body, excluded.
Scope: `test/security/provenance.test.ts`, `test/fixtures/v1-provenance.json`, `src/shared/envelope.ts`, `test/shared/envelope.test.ts`.
Requirements: wire policy W1 (`envelope.ts` verbatim); D-08 vendoring mechanism.
Runtime harness: N/A — pure hash comparison over source text.

- [x] 2.1 RED: write `test/security/provenance.test.ts` that scans `src/**` and `test/**` for files carrying a `Provenance:` line, strips each file's provenance header and import block, SHA-256-hashes the remainder and compares it to the header's `v1 body sha256:` value — equal for `verdict: AS-IS`, **not** equal for `verdict: SEAM` — and asserts the scanned set equals `test/fixtures/v1-provenance.json` (design §12, hash in the header per DN-06) — RED with an empty fixture and no vendored file yet.
- [x] 2.2 Create `test/fixtures/v1-provenance.json` with one entry `{v2Path: "src/shared/envelope.ts", v1Path: "src/envelope.ts", commit: "bf8f365", verdict: "AS-IS"}` (registry of vendored files; the hash lives in each header).
- [x] 2.3 GREEN: vendor `src/shared/envelope.ts` verbatim from `telegram-agent-bus/src/envelope.ts` (read-only source, 331 lines) with the header `/** Provenance: telegram-agent-bus src/envelope.ts @ bf8f365 — verdict: AS-IS (D-08). v1 body sha256: <hex computed once from the frozen checkout>. Changes: none. */`.
- [x] 2.4 Vendor the twin `test/shared/envelope.test.ts` from `telegram-agent-bus/test/envelope.test.ts` (read-only source, 699 lines) with the same header and `verdict: AS-IS` entry added to the fixture — 2.1 passes for both entries.
- [x] 2.5 Verify: `npm run build && node --test "dist/test/shared/envelope.test.js" "dist/test/security/provenance.test.js"`.
- [x] 2.6 Note (size:exception rationale, applies to every exception PR below): reviewers verify the header (path, commit, verdict, `v1 body sha256`), re-hash the body, and check that `provenance.test.ts` passes — not a line-by-line body review (tribunal ruling `bus-v2-f1-design-001` item 5; DN-06). The exception applies only to whole-file AS-IS copies (design §12).

#### PR-03 — `shared/secrets.ts` (SEAM)
Branch `f1/03-secrets` → `main`. Depends: PR-02. Size: ≈230 lines, no exception.
Scope: `src/shared/secrets.ts`, `test/shared/secrets.test.ts`.
Requirements: underlies `send-path › Validation pipeline and secret backstop` (PT-15) and `secret-store › No token in errors, logs or stacks` (PT-08, redaction consumes this regex).
Runtime harness: N/A — unit test over the exported regex/functions.

- [x] 3.1 RED: write `test/shared/secrets.test.ts` (adapted from `telegram-agent-bus/test/secrets.test.ts`, read-only reference, 133 lines) asserting `TELEGRAM_BOT_TOKEN_RE` is exported and matches a fixture token shape, and the secret-backstop predicate rejects a PEM block / `.env`-style assignment / bot-token shape / configured marker.
- [x] 3.2 GREEN: implement `src/shared/secrets.ts` (SEAM from `telegram-agent-bus/src/secrets.ts`, read-only source, 86 lines; change: `export` the regex so the validator and the redactor share one definition).
- [x] 3.3 Verify: `npm run build && node --test "dist/test/shared/secrets.test.js"`.
- [x] 3.4 Docs: update the file-name cell(s) of PT-08, PT-15 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-04 — `shared/thread-record.ts` (SEAM)
Branch `f1/04-thread-record` → `main`. Depends: PR-03. Size: ≈190 lines, no exception.
Scope: `src/shared/thread-record.ts`, `test/shared/thread-record.test.ts`.
Requirements: underlies `durable-inbox` thread persistence (no standalone requirement; supports PR-05, PR-12).
Runtime harness: N/A.

- [x] 4.1 RED: write `test/shared/thread-record.test.ts` asserting the `ThreadRecord` shape (adapted from `telegram-agent-bus/test/state.test.ts` type-relevant cases, read-only reference) with `first_surfaced_at` removed (per-client state moved to `client_surfaced`, PR-12).
- [x] 4.2 GREEN: implement `src/shared/thread-record.ts` (SEAM from `telegram-agent-bus/src/state.ts:15-87`, read-only source).
- [x] 4.3 Verify: `npm run build && node --test "dist/test/shared/thread-record.test.js"`.

#### PR-05 — `shared/protocol-apply.ts` (SEAM, D-05)
Branch `f1/05-protocol-apply` → `main`. Depends: PR-04. Size: ≈390 lines estimated; real authored diff 609 lines (56% over estimate, 209 over the 400-line cap) — one cohesive state-machine module, not splittable per design (confirmed at apply time: a test/implementation split across two PRs would fail `test/twins.test.ts` on the first PR's own merge to `main`). Granted a one-time, PR-05-scoped size exception at apply time (Director-authorized, distinct from DN-06's AS-IS-only exception; see `apply-progress.md` "Orchestrator decision on the budget overage").
Scope: `src/shared/protocol-apply.ts`, `test/shared/protocol-apply.test.ts`.
Requirements: `durable-inbox › A null addressee anchor fails closed (D-05)` (PT-17); underlies `durable-inbox › Forged sender never overrides the verified identity` (PT-16) and `durable-inbox › Seven-step admission pipeline` step 6-7 (consumed by PR-22a).
Runtime harness: N/A — unit test over `applyEnvelope`/`isAddressee`/`classifyRejection`.

- [x] 5.1 RED: write `test/shared/protocol-apply.test.ts` covering REQUEST/ACK/REPLY/RESOLVED/NOTED transitions (adapted from `telegram-agent-bus/test/protocol.test.ts`, read-only reference, apply-side slice of 897 lines) and the D-05 scenario "Unanchored transition is rejected, not authorized".
- [x] 5.2 GREEN: implement `src/shared/protocol-apply.ts` (SEAM from `telegram-agent-bus/src/protocol.ts:1-333`, read-only source; changes: `ThreadRecord` from PR-04, REPLY branch no longer touches `first_surfaced_at`, `isAddressee`/`classifyRejection` fail closed with reason `unanchored`, `isDuplicateEid` unused).
- [x] 5.3 Verify: `npm run build && node --test "dist/test/shared/protocol-apply.test.js"`.
- [x] 5.4 Docs: update the file-name cell(s) of PT-16, PT-17 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-06 — `shared/protocol-select.ts` + `shared/fence.ts` (SEAM, D-15) — **re-sliced at apply time into PR-06a/PR-06b**
Two serial branches from `main`: `f1/06a-fence` → `main`, then `f1/06b-protocol-select` → `main`. Depends: PR-05. Size: ≈315 estimated; the real authored diff is **618 lines**, re-sliced at the file boundary instead of granted one large exception, because — unlike PR-05 — these are two *independent* modules with no cohesion argument (apply-time decision, Director-authorized this session; same in-place re-slice precedent as PR-01 → PR-01a/PR-01b, tribunal `bus-v2-f1-pr-01-001`).
  - **PR-06a** (`f1/06a-fence`): `src/shared/fence.ts` (74) + `test/shared/fence.test.ts` (110) + its fixture entry (6) + the PT-13 cell in THREAT-MODEL §4 (2) ≈ **192** authored lines — **inside** the 400-line budget. Owns the D-15 fence amendment and PT-13. **PT-14 stays daemon-scoped**: design §15 maps it to `daemon/serve/fetch.ts` and the PT→PR map sends it to PR-23, so this slice deliberately leaves its cell at `daemon unit` and PR-25's task 25.4 fills it — crediting the fence twin with PT-14 was an over-claim two independent judges caught, because that twin pins only the label *shape* while PT-14's clause is about where the values come from.
  - **PR-06b** (`f1/06b-protocol-select`): `src/shared/protocol-select.ts` (160) + `test/shared/protocol-select.test.ts` (260) + its fixture entry (6) = **426 authored lines, 26 over** the 400-line review budget; granted a one-time, PR-06b-scoped size exception distinct from DN-06 (DN-06 stays AS-IS-only and is not amended). Grounds: 143 of the module's 160 lines are the byte-faithful v1 body the SEAM requires, and the 17 behavioral cases plus the shared `ThreadRecord` fixture helper cannot shed 26 lines without deleting review context — which the budget rule explicitly forbids. (The first pass measured 406; the extra 20 lines are the review-driven strengthening of four cases whose names promised more than their assertions could detect — see the PR-06b validator findings in `apply-progress.md`. Strengthening tests is never what gets trimmed to fit a budget.)
Scope (both slices): `src/shared/protocol-select.ts`, `src/shared/fence.ts`, `test/shared/protocol-select.test.ts`, `test/shared/fence.test.ts`, `test/fixtures/v1-provenance.json`.
Requirements: underlies `durable-inbox` digest computation; `thin-client-tools › Fence soundness and origin labels` (PT-13, PT-14) — the D-15 amendment fencing site.
Runtime harness: N/A.

Tasks 6.1–6.4 flipped to `[x]` in the **PR-06b** commit: the slice is complete only once both modules are in, so PR-06a merged with them still open (unfinished work is never checked off).

- [x] 6.1 RED: write `test/shared/protocol-select.test.ts` (select-side slice of `telegram-agent-bus/test/protocol.test.ts`, read-only reference) and `test/shared/fence.test.ts` asserting the fence cannot be forged by a peer body containing `</UNTRUSTED-PEER-INPUT>` and that `<` is escaped to `&lt;`.
- [x] 6.2 GREEN: implement `src/shared/protocol-select.ts` (SEAM from `telegram-agent-bus/src/protocol.ts:335-478`, read-only source; `computeWorkDigest` takes the per-client surfaced set and checkpoint) and `src/shared/fence.ts` (SEAM from `telegram-agent-bus/src/tools/fetch.ts:43-63`, read-only source; origin attributes added per D-15).
- [x] 6.3 Verify: `npm run build && node --test "dist/test/shared/protocol-select.test.js" "dist/test/shared/fence.test.js"`.
- [x] 6.4 Docs: update the file-name cell(s) of PT-13, PT-14 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-07a — `shared/tool-schemas.ts` (SEAM) + `shared/error-payload.ts` (SEAM)
Branch `f1/07a-tool-schemas-errors` → `main`. Depends: PR-06. Size: ≈290 lines, no exception (`tool-schemas.ts` is a range extract of two v1 files, therefore SEAM — tribunal `bus-v2-f1-tasks-001` item 1).
Scope: `src/shared/tool-schemas.ts`, `src/shared/error-payload.ts`, `test/shared/tool-schemas.test.ts`, `test/shared/error-payload.test.ts`, `test/fixtures/v1-provenance.json` (append one SEAM entry).
Requirements: `send-path › Send input carries no destination` (PT-02); `thin-client-tools › Four tool input schemas port unchanged`; `thin-client-tools › Client-local error payload constructor` (PT-07, shape only).
Runtime harness: N/A.

- [x] 7a.1 RED: write `test/shared/tool-schemas.test.ts` (shape assertion: no `chat_id`/`bot`/`group`/`to_chat`/`from` key; the four schemas parse v1's documented inputs) against a not-yet-present module.
- [x] 7a.2 GREEN: implement `src/shared/tool-schemas.ts` as a SEAM extracted from `telegram-agent-bus/src/tools/send.ts:47-109` + `src/index.ts:29-42` (read-only source, ≈77 lines) with a provenance header `verdict: SEAM`, `v1 body sha256` of `src/tools/send.ts`, and `Changes: (1) extracted lines 47-109 and index.ts:29-42 into one module; (2) imports relocated`.
- [x] 7a.3 RED: write `test/shared/error-payload.test.ts` asserting the closed `{code, message, retryable, retry_after_s?, new_chat_id?}` shape and `RETRYABLE_TOOL_CODES` allow-list.
- [x] 7a.4 GREEN: implement `src/shared/error-payload.ts` (SEAM from `telegram-agent-bus/src/index.ts:45-103`, read-only source; the client side drops the `telegram.ts` dependency, kept only in `daemon/ipc/routes.ts`'s `toTelegramErrorPayload`, PR-31).
- [x] 7a.5 Verify: `npm run build && node --test "dist/test/shared/tool-schemas.test.js" "dist/test/shared/error-payload.test.js" "dist/test/security/provenance.test.js"`.
- [x] 7a.6 Docs: update the file-name cell(s) of PT-02, PT-07 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

**Apply-time amendment (PR-07a, session 9).** Tasks 7a.1–7a.6 flipped to `[x]` in the PR-07a commits;
PR #9, merge `535ce67`, audited code tip `53d5aad`. Final measured figures: **420 authored lines, 20 over**
the 400-line review budget, granted a one-time PR-07a-scoped size exception distinct from DN-06 (DN-06
stays AS-IS-only and is not amended). The slice was inside the budget at **398** when the audit opened;
the two bounded Judgment Day correction rounds took it to 415 and then 420, and every added line is a
test assertion or a documentation-accuracy correction (`apply-progress.md`'s PR-07a section,
`bus-v2-f1-pr-07a-audit-001`). Two deliberate deviations from this block, both Director decisions and
both disclosed rather than silent: **7a.6's PT-07 half was not executed** — PT-07's assertion is
bundle-level (`security/client-bundle`, PR-34/PR-40) and annotating the cell would repeat the PT-14
over-claim PR-06's judges caught — and the slice ran under **ODD + Judgment Day** because the SDD
dispatcher is still refused by the host-owned native preflight. The module's provenance header cites the
larger of its two v1 ranges (`src/tools/send.ts:47-109`); the second (`src/index.ts:29-42`) is named in
the `Changes:` line because the registry's `v1Path` is a single token.

#### PR-07b — `shared/tool-output.ts` (SEAM)
Branch `f1/07b-tool-output` → `main`. Depends: PR-07a. Size: ≈385 lines (≈284 extracted body + ≈100 twin), no exception (range extract of `tools/fetch.ts`, therefore SEAM). If the twin exceeds ≈115 authored lines, ship the twin as PR-07c (`f1/07c-tool-output-tests`) so PR-07b stays ≤ 400.
Scope: `src/shared/tool-output.ts`, `test/shared/tool-output.test.ts`, `test/fixtures/v1-provenance.json` (append one SEAM entry). Carried findings add `test/shared/error-payload.test.ts` — see below.
Requirements: `thin-client-tools › Four tool input schemas port unchanged` (output shapes half); `durable-inbox` digest rendering consumed by PR-23.
Runtime harness: N/A.

**Carried findings from PR-07a (session 9) — read before opening this slice.**

1. **The PR-07c split this block allows is NOT CI-safe and must not be used.** `test/twins.test.ts` walks
every `src/**/*.ts` and fails when `test/**/<same>.test.ts` is missing **in the same tree**, so a PR that
lands `tool-output.ts` without its twin fails its own merge — the same finding that carried PR-05.
Decide **before** opening: trim the twin to fit, or take a **disclosed** PR-scoped exception like
PR-06b's 26 lines and PR-07a's 20. Never split a module from its twin. Budget accordingly: PR-07a's
≈290-line estimate measured 398 at audit open, because a SEAM module's doc comments must be
re-authored, never copied.
2. **D4, the first correction of this slice (Director decision).** `test/shared/error-payload.test.ts`
still drives the client-taxonomy code `UNBOUND_PROJECT` through `toolErrorPayload`. Nothing behaves
wrongly — the value the tool-level allow-list yields for it coincides with design §10's client value —
but it models the pattern that module's own JSDoc forbids, so change the example to a tool-level code
while this slice is open. It was escalated rather than fixed in PR-07a because that slice's Judgment
Day round budget was exhausted and its two judges disagreed on whether the earlier correction
introduced it.

   **Apply-time amendment (appended — the note above stays as audited).** D4 was closed by this slice's
   first commit, `27100ce`: `test/shared/error-payload.test.ts` now drives `UNKNOWN_THREAD`, a v1
   tool-level code, through `toolErrorPayload`. Judgment Day round 1 found that a session reading the
   gated artifacts in the order `AGENTS.md` §1 prescribes still saw the defect described above in the
   present tense (finding JD-B-002), so the closure is recorded at the gate and not only in
   `apply-progress.md`.

- [x] 7b.1 RED: write `test/shared/tool-output.test.ts` (rendering of the fetch digest, `body_omitted` marker, fence-safe output) against a not-yet-present module.
- [x] 7b.2 GREEN: implement `src/shared/tool-output.ts` as a SEAM extracted from `telegram-agent-bus/src/tools/fetch.ts:65-348` (read-only source, ≈284 lines) with a provenance header `verdict: SEAM`, `v1 body sha256` of `src/tools/fetch.ts`, and `Changes: (1) extracted lines 65-348; (2) imports relocated`.
- [x] 7b.3 Verify: `npm run build && node --test "dist/test/shared/tool-output.test.js" "dist/test/security/provenance.test.js"`.

### Unit 3 — `project-binding`

#### PR-08 — `conmuta.json` schema, token-shape validator, `conmuta validate` (D-29) — **re-sliced at apply time into PR-08a/PR-08b**
Two serial branches: `f1/08a-shared-validators` → `main`, then `f1/08b-roster-cli` → `main` (stacked; PR-08b's candidate imports PR-08a's `project-file.ts`). Depends: PR-07b. Size: ≈370 estimated; the real authored diff is **1,400 lines**, re-sliced at the file/dependency boundary instead of one 1,400-line exception (apply-time decision, Director-authorized this session; same in-place re-slice precedent as PR-01 → PR-01a/PR-01b and PR-06 → PR-06a/PR-06b).
  - **PR-08a** (`f1/08a-shared-validators`): `src/shared/token-shape.ts` (82) + `test/shared/token-shape.test.ts` (114) + `src/shared/project-file.ts` (247) + `test/shared/project-file.test.ts` (305) = **748 authored lines, 348 over** the 400-line review budget; granted a PR-08a-scoped size exception. Grounds: two modules that share one contract (`project-file.ts` applies `token-shape.ts` to the parsed document), and the test files carry one assertion per rule DATA-MODEL §1 states — uniqueness, `referee` membership, the four content rules and the unknown-key path — which the mutation round confirms can fail; trimming them is what the budget rule forbids. Both modules live in `src/shared/`, so this slice needs **no** tsconfig wiring and leaves the tree self-consistent on its own.
  - **PR-08b** (`f1/08b-roster-cli`): `src/shared/roster-hash.ts` (39) + `test/shared/roster-hash.test.ts` (86) + `src/cli/validate.ts` (63) + `test/cli/validate.test.ts` (189) + `src/cli/main.ts` (125) + `test/cli/main.test.ts` (150) + `EXIT_VALIDATION_FAILED` in `constants.ts` (14) + the two tsconfig edits (6) = **652 authored lines, 252 over**; granted a PR-08b-scoped size exception on the same grounds. This slice owns the two carried traps HANDOFF §4 recorded: it adds the missing `test/cli/main.test.ts` twin (the twin rule fails the slice's own merge otherwise) and adds `{ "path": "src/cli" }` to the root `references`.
  - **Cell discipline:** PR-08a updates PT-06's cell and PT-05's `shared/token-shape` half (the files it pins); PR-08b appends the `cli/validate` half. PT-05 is touched twice on purpose — a PR names only the files it actually adds, and an over-claimed cell is the defect two independent judges caught in PR-06a.
Scope (both slices): `src/shared/token-shape.ts`, `src/shared/roster-hash.ts`, `src/shared/project-file.ts`, `src/cli/validate.ts`, `src/cli/main.ts` (dispatcher skeleton), `test/shared/token-shape.test.ts`, `test/shared/roster-hash.test.ts`, `test/shared/project-file.test.ts`, `test/cli/validate.test.ts`, `test/cli/main.test.ts` (the twin HANDOFF §4 recorded as missing from this slice's scope).
Requirements: `project-binding › Committed project file schema` (PT-06); `project-binding › Token-shape validator` (PT-05, D-29 `conmuta validate`); `project-binding › Name-bearing identifiers derive from one constant`.
Runtime harness: `conmuta validate --stdin` invoked as a real child process in `test/cli/validate.test.ts` (design §15 "Integration" layer).
Tasks 8.1 and 8.2 flipped to `[x]` in the **PR-08a** commit; 8.3–8.6 stay open until **PR-08b** lands, because 8.5 verifies all four test files and 8.6 names PT-05's second test file.

- [x] 8.1 RED: write `test/shared/project-file.test.ts` covering the three spec scenarios (valid file loads, unknown key rejected, future `schema_version` refused) and `test/shared/token-shape.test.ts` (seeded token-shaped match caught, clean file passes).
- [x] 8.2 GREEN: implement `src/shared/token-shape.ts` (`findTokenShapes`/`assertNoTokenShape`, PEM/`.env`/marker detection) and `src/shared/project-file.ts` (`z.strictObject` schema per DATA-MODEL §1, `PROJECT_ID_PATTERN` slug, path-separator/`Authorization` rejection).
- [ ] 8.3 RED: write `test/shared/roster-hash.test.ts` (sorted `[agent_id, user_id]` pairs, `username` excluded, D-27) and `test/cli/validate.test.ts` (`conmuta validate --stdin` exits non-zero on a token-shaped match, never echoes it).
- [ ] 8.4 GREEN: implement `src/shared/roster-hash.ts`, `src/cli/validate.ts`, and the `src/cli/main.ts` dispatcher skeleton (single `bin` entry, `validate` subcommand wired; `mcp`/`daemon stop`/`migrate-v1` added in PR-17/PR-35/PR-37).
- [ ] 8.5 Verify: `npm run build && node --test "dist/test/shared/token-shape.test.js" "dist/test/shared/roster-hash.test.js" "dist/test/shared/project-file.test.js" "dist/test/cli/validate.test.js"`.
- [ ] 8.6 Docs: update the file-name cell(s) of PT-05, PT-06 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-09 — machine registry (schema, invariants, hot-reload)
Branch `f1/09-registry` → `main`. Depends: PR-08. Size: ≈380 lines, no exception.
Scope: `src/registry/schema.ts`, `src/registry/invariants.ts`, `src/registry/loader.ts`, `test/registry/schema.test.ts`, `test/registry/invariants.test.ts`, `test/registry/loader.test.ts`.
Requirements: `project-binding › Machine registry schema and invariants` (PT-18, PT-25).
Runtime harness: N/A — loader tested against temp fixture files (design §15 "Integration" layer, temp homes).

- [ ] 9.1 RED: write `test/registry/invariants.test.ts` covering R1–R6's five spec scenarios (duplicate `bot_id` rejected, hot-reload without restart, malformed registry quarantined not defaulted, binding never rewritten from bus/API data) plus R3/R4 checks.
- [ ] 9.2 GREEN: implement `src/registry/schema.ts` (`z.strictObject`, `roster_snapshot`/`roster_hash` required, `REGISTRY_VERSION`) and `src/registry/invariants.ts` (`superRefine` for R1–R6).
- [ ] 9.3 RED: write `test/registry/loader.test.ts` asserting the mtime/size fingerprint reload (D-12) and the never-renamed quarantine-on-invalid behavior.
- [ ] 9.4 GREEN: implement `src/registry/loader.ts` (last-good-in-memory, `registry_invalid` condition, R5 pre-parse scan via `token-shape.ts` from PR-08).
- [ ] 9.5 Verify: `npm run build && node --test "dist/test/registry/schema.test.js" "dist/test/registry/invariants.test.js" "dist/test/registry/loader.test.js"`.
- [ ] 9.6 Docs: update the file-name cell(s) of PT-18, PT-25 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

### Unit 4 — `ledger`

#### PR-10 — ledger schema + `node:sqlite` transaction spike (RED first)
Branch `f1/10-ledger-schema-spike` → `main`. Depends: PR-09. Size: ≈400 lines, no exception.
Scope: `src/ledger/schema.ts`, `src/ledger/transaction.ts`, `test/ledger/transaction.test.ts`, `test/ledger/schema.test.ts`.
Requirements: risk mitigation for design §5.3 ("`node:sqlite` transaction idiom unconfirmed on the pinned build"); underlies `durable-inbox › Write-ahead before offset confirmation` (PT-10, consumed in PR-12).
Runtime harness: real `node:sqlite` against a `mkdtemp` temp file (design §15 "Ledger" layer) — this is the in-phase spike the risk register calls for, run **before** PR-12's inbox transaction task.

- [ ] 10.1 RED (spike): write `test/ledger/transaction.test.ts` on the pinned Node build asserting `db.isTransaction` flips true on `BEGIN IMMEDIATE`, a throw inside the transaction callback leaves no row, and a nested `withTransaction` call throws (no savepoints in F1) — fails because `withTransaction` does not exist yet.
- [ ] 10.2 GREEN: implement `src/ledger/transaction.ts` (`withTransaction(db, fn)`: `BEGIN IMMEDIATE` … `COMMIT`, `ROLLBACK` on throw) — 10.1 passes, closing the spike with no ADR needed.
- [ ] 10.3 RED: write `test/ledger/schema.test.ts` asserting every DDL table from design §5.2 (`offsets`, `updates`, `threads`, `thread_history`, `needs_action` VIEW, `client_cursors`, `client_surfaced`, `audit_log`, `unknown_senders`, `binding_state`, `conditions`) exists with its `STRICT`/`CHECK` constraints.
- [ ] 10.4 GREEN: implement `src/ledger/schema.ts` with the full DDL from design §5.2 verbatim.
- [ ] 10.5 Verify: `npm run build && node --test "dist/test/ledger/transaction.test.js" "dist/test/ledger/schema.test.js"`.
- [ ] 10.6 Docs: update the file-name cell(s) of PT-10 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-11 — ledger open sequence + migrations (D-21)
Branch `f1/11-ledger-open-migrations` → `main`. Depends: PR-10. Size: ≈350 lines, no exception.
Scope: `src/ledger/open.ts`, `src/ledger/migrations.ts`, `test/ledger/open.test.ts`, `test/ledger/migrations.test.ts`.
Requirements: `ledger › Schema-version migrations and quarantine on corruption or a future version` (D-21).
Runtime harness: real `node:sqlite` over temp files, including a deliberately corrupted fixture file.

- [ ] 11.1 RED: write `test/ledger/open.test.ts` covering the two spec scenarios (corrupt ledger quarantined not defaulted, future `user_version` quarantined too) plus `PRAGMA synchronous = FULL`/`journal_mode = WAL` assertions.
- [ ] 11.2 GREEN: implement `src/ledger/open.ts` (mkdir home, open, `quick_check`, quarantine-rename to `ledger.corrupt-<epochMs>.db` on corruption or a future version, PRAGMA sequence per design §5.1).
- [ ] 11.3 RED: write `test/ledger/migrations.test.ts` asserting forward-only `{to, up}` migrations run inside one transaction each and `PRAGMA user_version` lands at `LEDGER_SCHEMA_VERSION` (1).
- [ ] 11.4 GREEN: implement `src/ledger/migrations.ts`.
- [ ] 11.5 Verify: `npm run build && node --test "dist/test/ledger/open.test.js" "dist/test/ledger/migrations.test.js"`.

#### PR-12 — inbox write-ahead transaction + thread adapter + cursors
Branch `f1/12-ledger-inbox-cursors` → `main`. Depends: PR-11. Size: ≈400 lines, no exception.
Scope: `src/ledger/inbox.ts`, `src/ledger/threads.ts`, `src/ledger/cursors.ts`, `test/ledger/inbox.test.ts`, `test/ledger/threads.test.ts`, `test/ledger/cursors.test.ts`.
Requirements: `durable-inbox › Write-ahead before offset confirmation` (PT-10); `durable-inbox › Per-client cursors and surfaced state decouple presentation` (PT-11, D-19 catch-up window).
Runtime harness: real `node:sqlite`, fault injection by throwing inside `withTransaction`.

- [ ] 12.1 RED: write `test/ledger/inbox.test.ts` covering "crash between insert and offset advance replays once" (fault injected before the offset-advance commit; redelivery deduplicated by `UNIQUE (bot_id, update_id)`).
- [ ] 12.2 GREEN: implement `src/ledger/inbox.ts` (one transaction per poll batch: insert `updates`, upsert `threads`/`thread_history`, insert `audit_log` rows, advance `offsets.next_update_id`) and `src/ledger/threads.ts` (`ThreadRecord` adapter consumed by `shared/protocol-apply.ts` from PR-05).
- [ ] 12.3 RED: write `test/ledger/cursors.test.ts` covering "two clients each see the full batch once" and "a fresh session's cursor starts at the catch-up window, not at zero" (D-19, `SESSION_CATCHUP_HOURS`).
- [ ] 12.4 GREEN: implement `src/ledger/cursors.ts` (`client_cursors`/`client_surfaced` reads/writes).
- [ ] 12.5 Verify: `npm run build && node --test "dist/test/ledger/inbox.test.js" "dist/test/ledger/threads.test.js" "dist/test/ledger/cursors.test.js"`.
- [ ] 12.6 Docs: update the file-name cell(s) of PT-10, PT-11 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-13 — audit, unknown senders, conditions, retention
Branch `f1/13-ledger-audit-retention` → `main`. Depends: PR-12. Size: ≈350 lines, no exception.
Scope: `src/ledger/audit.ts`, `src/ledger/unknown-senders.ts`, `src/ledger/conditions-store.ts`, `src/ledger/retention.ts`, `test/ledger/audit.test.ts`, `test/ledger/unknown-senders.test.ts`, `test/ledger/conditions-store.test.ts`, `test/ledger/retention.test.ts`.
Requirements: `ledger › Audit log is append-only and stores no rejected body or token` (PT-20); `ledger › No token in any ledger table`; `ledger › Retention is a named constant, pruning runs in the daemon`.
Runtime harness: real `node:sqlite` fixture rows aged past each retention window.

- [ ] 13.1 RED: write `test/ledger/audit.test.ts` (rejected update leaves a bodiless row; no row ever matches the token regex through every write path).
- [ ] 13.2 GREEN: implement `src/ledger/audit.ts`, `src/ledger/unknown-senders.ts` (bodiless upsert on `unknown_sender`), `src/ledger/conditions-store.ts` (`scope`/`name` upsert, `detail` codes/ids only).
- [ ] 13.3 RED: write `test/ledger/retention.test.ts` covering "`thread_history` is capped, not truncated on read" and "hourly sweep removes rows past each window, keeps everything younger" (`INBOX_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `UNKNOWN_SENDER_RETENTION_DAYS`, `CLIENT_SESSION_STALE_HOURS`).
- [ ] 13.4 GREEN: implement `src/ledger/retention.ts` (`RETENTION_SWEEP_INTERVAL_HOURS` schedule, one indexed `DELETE` per table, open threads never pruned).
- [ ] 13.5 Verify: `npm run build && node --test "dist/test/ledger/audit.test.js" "dist/test/ledger/unknown-senders.test.js" "dist/test/ledger/conditions-store.test.js" "dist/test/ledger/retention.test.js"`.
- [ ] 13.6 Docs: update the file-name cell(s) of PT-20 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

### Unit 5 — `secret-store`

#### PR-14 — keyring, ACL'd fallback, redaction
Branch `f1/14-secret-store` → `main`. Depends: PR-13. Size: ≈380 lines, no exception.
Scope: `src/secret-store/types.ts`, `src/secret-store/keyring.ts`, `src/secret-store/file-fallback.ts`, `src/secret-store/redaction.ts`, `src/secret-store/index.ts`, `test/secret-store/keyring.test.ts`, `test/secret-store/file-fallback.test.ts`, `test/secret-store/redaction.test.ts`, `test/secret-store/index.test.ts`.
Requirements: `secret-store › Tokens live only in the keychain or the ACL'd fallback` (PT-09); `secret-store › Fallback file and daemon home are ACL'd` (PT-19, win-x64); `secret-store › No token in errors, logs or stacks` (PT-08, redaction consumed by PR-19).
Runtime harness: PT-19 spawns `icacls` **in test code only** against a temp home (allowed — tests may spawn, the daemon never does); PT-09 round-trips against the real `windows-latest` keyring in CI.

- [ ] 14.1 RED: write `test/secret-store/keyring.test.ts` (round trip on the keychain never touches `registry.json`) and `test/secret-store/file-fallback.test.ts` (fallback file created when keyring unavailable; POSIX mode `0600`; Windows ACL lists only the current user, asserted via `icacls` output in the test).
- [ ] 14.2 GREEN: implement `src/secret-store/types.ts` (`SecretStore` interface), `src/secret-store/keyring.ts` (`@napi-rs/keyring`, `Entry(KEYRING_SERVICE, "bot:<bot_id>")`), `src/secret-store/file-fallback.ts` (tmp+rename write, `POSIX_PRIVATE_FILE_MODE`).
- [ ] 14.3 RED: write `test/secret-store/redaction.test.ts` (fixture token never leaks through a classified error path) and `test/secret-store/index.test.ts` (probe-then-fallback selection raises `secret_store_fallback`).
- [ ] 14.4 GREEN: implement `src/secret-store/redaction.ts` (`redactTokenShapes`, consumes `shared/secrets.ts` from PR-03) and `src/secret-store/index.ts` (selection probe at daemon start).
- [ ] 14.5 Verify: `npm run build && node --test "dist/test/secret-store/**/*.test.js"`.
- [ ] 14.6 Docs: update the file-name cell(s) of PT-08, PT-09, PT-19 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

### Unit 6 — `daemon-lifecycle`

#### PR-15 — node-floor, home, log, singleton lock, run-file
Branch `f1/15-lifecycle-lock-runfile` → `main`. Depends: PR-14. Size: ≈390 lines, no exception.
Scope: `src/daemon/node-floor.ts`, `src/daemon/home.ts`, `src/daemon/log.ts`, `src/daemon/lifecycle/lock.ts`, `src/daemon/lifecycle/run-file.ts`, `test/daemon/node-floor.test.ts`, `test/daemon/home.test.ts`, `test/daemon/log.test.ts`, `test/daemon/lifecycle/lock.test.ts`, `test/daemon/lifecycle/singleton.test.ts`, `test/daemon/lifecycle/run-file.test.ts`.
Requirements: `daemon-lifecycle › Node floor gate before any disk write`; `daemon-lifecycle › Singleton election and lock staleness` (PT-12); `daemon-lifecycle › Run-file lifecycle`.
Runtime harness: real child processes (`node dist/src/daemon/main.js --home <tmp>`, no bindings so no network) and real pids for liveness checks (design §15 "Lifecycle" layer) — first exercised fully in PR-16 once `main.ts`/`bootstrap.ts` exist; this PR unit-tests the lock/run-file modules directly.

- [ ] 15.1 RED: write `test/daemon/node-floor.test.ts` ("Node below the floor exits before any write", zero files under `~/.conmuta/` created).
- [ ] 15.2 GREEN: implement `src/daemon/node-floor.ts` (import-free `main.ts`-callable gate, D-25), `src/daemon/home.ts`, `src/daemon/log.ts` (`DAEMON_LOG_MAX_BYTES` truncate-on-exceed, redaction wired from PR-14).
- [ ] 15.3 RED: write `test/daemon/lifecycle/lock.test.ts` and `test/daemon/lifecycle/singleton.test.ts` covering "second instance refuses to poll" and "stale lock reclaimed exactly once" (`DAEMON_LOCK_STALE_SECONDS`).
- [ ] 15.4 GREEN: implement `src/daemon/lifecycle/lock.ts` (SEAM from `telegram-agent-bus/src/state.ts:458-602`, read-only source; `heartbeat_at` added, stale default `DAEMON_LOCK_STALE_SECONDS`, `LockHeldError`).
- [ ] 15.5 RED: write `test/daemon/lifecycle/run-file.test.ts` ("fresh secret on every start"; delete only when `pid === process.pid`).
- [ ] 15.6 GREEN: implement `src/daemon/lifecycle/run-file.ts`.
- [ ] 15.7 Verify: `npm run build && node --test "dist/test/daemon/node-floor.test.js" "dist/test/daemon/home.test.js" "dist/test/daemon/log.test.js" "dist/test/daemon/lifecycle/lock.test.js" "dist/test/daemon/lifecycle/singleton.test.js" "dist/test/daemon/lifecycle/run-file.test.js"`.
- [ ] 15.8 Docs: update the file-name cell(s) of PT-12 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-16 — heartbeat, idle, bootstrap, main (Windows console-flash check)
Branch `f1/16-lifecycle-heartbeat-idle-bootstrap` → `main`. Depends: PR-15. Size: ≈340 lines, no exception.
Scope: `src/daemon/lifecycle/heartbeat.ts`, `src/daemon/lifecycle/idle.ts`, `src/daemon/bootstrap.ts`, `src/daemon/main.ts`, `test/daemon/lifecycle/heartbeat.test.ts`, `test/daemon/lifecycle/idle.test.ts`, `test/daemon/bootstrap.test.ts`, `test/daemon/no-emission.test.ts`.
Requirements: `daemon-lifecycle › Idle shutdown respects open threads`; ADR-0029 "no heartbeat emission" row.
Runtime harness: real child process boot via `node dist/src/daemon/main.js --home <tmp>` (design §15 "Lifecycle" layer). **Manual, non-automatable check**: verify on Windows 11 whether the `{detached: true, windowsHide: true}` spawn (design §7.2, nodejs/node#21825) flashes a console; record the observation in this PR's description, not as a test assertion.

- [ ] 16.1 RED: write `test/daemon/lifecycle/idle.test.ts` ("open thread blocks idle shutdown", "no emission on an idle window") and `test/daemon/no-emission.test.ts` (simulated idle window, fake clients record zero sends).
- [ ] 16.2 GREEN: implement `src/daemon/lifecycle/heartbeat.ts` (`HEARTBEAT_PERIOD_MS` tick, `onTick` callback importing no transport/send module) and `src/daemon/lifecycle/idle.ts` (`IDLE_SHUTDOWN_HOURS`, open-thread count check).
- [ ] 16.3 RED: write `test/daemon/bootstrap.test.ts` asserting the full boot sequence from design §7.1 (gate → dynamic import → ensure home → acquire lock → open ledger → load registry → select secret store → listen IPC → write run file → start heartbeat → reconcile bindings → RUNNING).
- [ ] 16.4 GREEN: implement `src/daemon/bootstrap.ts` (`startDaemon(options)` composition root, injectable `telegramClientFactory`/`secretStore`/`now` per design §15) and `src/daemon/main.ts` (node-floor gate then `dynamic import("./bootstrap.js")`, D-25).
- [ ] 16.5 Verify: `npm run build && node --test "dist/test/daemon/lifecycle/heartbeat.test.js" "dist/test/daemon/lifecycle/idle.test.js" "dist/test/daemon/bootstrap.test.js" "dist/test/daemon/no-emission.test.js"`. Record the Windows 11 console-flash manual observation in the PR description.

#### PR-17 — `conmuta daemon stop` (D-29)
Branch `f1/17-daemon-stop` → `main`. Depends: PR-16. Size: ≈200 lines, no exception.
Scope: `src/cli/daemon-stop.ts`, `src/cli/main.ts` (add `daemon stop` subcommand), `test/cli/daemon-stop.test.ts`.
Requirements: `daemon-lifecycle › conmuta daemon stop challenges identity before terminating` (D-29). Depends conceptually on ipc-handshake's identity challenge (§10), stubbed against a fake daemon here and re-verified end-to-end once PR-30 lands.
Runtime harness: real child process daemon + real `process.kill`.

- [ ] 17.1 RED: write `test/cli/daemon-stop.test.ts` covering "stop terminates a live, identity-confirmed daemon" and "stop refuses when the identity challenge fails" (foreign process reusing the recorded pid).
- [ ] 17.2 GREEN: implement `src/cli/daemon-stop.ts` (read run file, identity challenge per ipc-handshake §10 shape, `process.kill(pid, "SIGTERM")`, release lock, delete only its own run files) and wire the `daemon stop` subcommand into `src/cli/main.ts`.
- [ ] 17.3 Verify: `npm run build && node --test "dist/test/cli/daemon-stop.test.js"`.

### Unit 7 — `durable-inbox`

#### PR-18 — `daemon/telegram.ts` part 1: client construction + request plumbing (SEAM)
Branch `f1/18-telegram-client-p1` → `main`. Depends: PR-17. Size: ≈220 lines, no exception.
Scope: `src/daemon/telegram.ts` (partial), `test/daemon/telegram.test.ts` (partial).
Requirements: underlies every admission/send scenario; no standalone spec requirement by itself.
Runtime harness: fake HTTP transport (adapted from `telegram-agent-bus/test/fakes/telegram.ts`, read-only reference, 154 lines, placeholders only per PT-22).

- [ ] 18.1 RED: write the construction/request half of `test/daemon/telegram.test.ts` (`TelegramApiClient` constructed per binding, `getUpdates`/`sendMessage` request shape, `requestTimeoutMs` budget).
- [ ] 18.2 GREEN: implement the corresponding half of `src/daemon/telegram.ts` (SEAM from `telegram-agent-bus/src/telegram.ts`, read-only source, 428 lines total across PR-18/PR-19; `LOCK_STALE_SECONDS` import dropped).
- [ ] 18.3 Verify: `npm run build && node --test "dist/test/daemon/telegram.test.js"`.

#### PR-19 — `daemon/telegram.ts` part 2: error classification + redaction (SEAM, completes the file)
Branch `f1/19-telegram-client-p2` → `main`. Depends: PR-18. Size: ≈210 lines, no exception.
Scope: `src/daemon/telegram.ts` (completes the file), `test/daemon/telegram.test.ts` (completes the twin).
Requirements: `secret-store › No token in errors, logs or stacks` (PT-08, redaction wiring); `daemon-lifecycle` Telegram 409 scenario; `send-path › Rate discipline` (429 classification half, consumed by PR-22b/PR-28).
Runtime harness: fake HTTP transport injecting 409/429/network/protocol errors.

- [ ] 19.1 RED: complete `test/daemon/telegram.test.ts` with `TelegramConflictError` (409), `RateLimitedError` (429, `retry_after_s`), network/protocol error classification, and `GroupMigratedError` surfaced on send but never followed (PT-25).
- [ ] 19.2 GREEN: complete `src/daemon/telegram.ts` — every error constructor's message passes through `redactTokenShapes` from PR-14 (THREAT-MODEL residual "undici `cause` may embed the URL", PT-08).
- [ ] 19.3 Verify: `npm run build && node --test "dist/test/daemon/telegram.test.js"`.
- [ ] 19.4 Docs: update the file-name cell(s) of PT-08 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-20 — `daemon/transport/{types,group,direct,dual}.ts` (size:exception, AS-IS hash-pinned)
Branch `f1/20-transport-asis` → `main`. Depends: PR-19. Size: ≈30 new authored lines (provenance headers/fixture entries) + 337 AS-IS vendored body + 395 AS-IS vendored twin body, excluded.
Scope: `src/daemon/transport/types.ts`, `src/daemon/transport/group.ts`, `src/daemon/transport/direct.ts`, `src/daemon/transport/dual.ts`, `test/daemon/transport/types.test.ts`, `test/daemon/transport/group.test.ts`, `test/daemon/transport/direct.test.ts`, `test/daemon/transport/dual.test.ts`, `test/fixtures/v1-provenance.json` (append four entries).
Requirements: underlies `send-path › One DualWriteTransport per binding` (consumed by PR-27).
Runtime harness: N/A at this PR (transport unit tests only; room-guard wiring and live send-path behavior land in PR-21/PR-27).

- [ ] 20.1 RED: write the four provenance fixture entries and confirm `test/security/provenance.test.ts` (PR-02) fails against them before vendoring.
- [ ] 20.2 GREEN: vendor `src/daemon/transport/{types,group,direct,dual}.ts` AS-IS from `telegram-agent-bus/src/transport/{types,group,direct,dual}.ts` (read-only source, 111+97+67+62=337 lines) and their twins from `telegram-agent-bus/test/transport/{group,direct,dual}.test.ts` (read-only source, 104+113+178=395 lines), each with its provenance header — `provenance.test.ts` passes.
- [ ] 20.3 Verify: `npm run build && node --test "dist/test/daemon/transport/**/*.test.js" "dist/test/security/provenance.test.js"`.

#### PR-21 — room guard (D-22), binding config, bindings reconciliation
Branch `f1/21-room-guard-bindings` → `main`. Depends: PR-20. Size: ≈340 lines, no exception.
Scope: `src/daemon/transport/room-guard.ts`, `src/daemon/binding-config.ts`, `src/daemon/bindings.ts`, `test/daemon/transport/room-guard.test.ts`, `test/daemon/binding-config.test.ts`, `test/daemon/bindings.test.ts`.
Requirements: `send-path › chat_id must equal the binding's group_id or the send is refused` (PT-01 mechanism, wired end-to-end in PR-27/PR-41); registry-to-poller reconciliation half of `project-binding › Machine registry schema and invariants`.
Runtime harness: N/A here — the two-binding wrong-room CI scenario runs end-to-end in PR-41.

- [ ] 21.1 RED: write `test/daemon/transport/room-guard.test.ts` ("forced mismatch yields WRONG_ROOM": numeric `chat_id` must equal `binding.group_id`, string `chat_id` must be `@<username>` of a roster member, violation throws before the call).
- [ ] 21.2 GREEN: implement `src/daemon/transport/room-guard.ts` (D-22 decorator wrapping the binding's transport, inside `transport/` so PT-28's call-site confinement holds).
- [ ] 21.3 RED: write `test/daemon/binding-config.test.ts` (`BindingConfig` = v1 `Config` minus `bot_token`, materialized per binding) and `test/daemon/bindings.test.ts` ("pollers start for new active bindings and stop for removed/suspended ones; a `BINDING_CHANGED` audit row is written per delta").
- [ ] 21.4 GREEN: implement `src/daemon/binding-config.ts` (SEAM from `telegram-agent-bus/src/config.ts:168-187`, read-only source) and `src/daemon/bindings.ts` (registry hot-reload reconciliation, consumes PR-09's loader).
- [ ] 21.5 Verify: `npm run build && node --test "dist/test/daemon/transport/room-guard.test.js" "dist/test/daemon/binding-config.test.js" "dist/test/daemon/bindings.test.js"`.
- [ ] 21.6 Docs: update the file-name cell(s) of PT-01 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-22a — seven-step admission pipeline
Branch `f1/22a-admission` → `main`. Depends: PR-21. Size: ≈250 lines, no exception (pre-split from the poller so the highest-risk code — invariants 1, 4, 5 — gets its own review; tribunal `bus-v2-f1-tasks-001` item 4).
Scope: `src/daemon/admission.ts`, `test/daemon/admission.test.ts`.
Requirements: `durable-inbox › Seven-step admission pipeline with the chat-scope check` (PT-03, PT-04, PT-31); `durable-inbox › Forged sender never overrides the verified identity` (PT-16); `durable-inbox › A null addressee anchor fails closed` (PT-17, consumes PR-05); `durable-inbox › updates.body is NULL for rejected and ignored` (D-20).
Runtime harness: ledger from PR-12/PR-13 on a temp home; no network.

- [ ] 22a.1 RED: write `test/daemon/admission.test.ts` covering the four spec scenarios ("foreign chat dropped and audited without a body", "unknown sender recorded, never surfaced", "mixed batch isolates human chat text", "`updates.body` is NULL for rejected/ignored, kept for not_mine/noted").
- [ ] 22a.2 GREEN: implement `src/daemon/admission.ts` (SEAM split from `telegram-agent-bus/src/tools/fetch.ts:404-460,525-656`, read-only source, ≈189 lines; step 3 chat-scope check is new, ledger writes via PR-12, `unknown_senders` upsert via PR-13).
- [ ] 22a.3 Verify: `npm run build && node --test "dist/test/daemon/admission.test.js"`.
- [ ] 22a.4 Docs: update the file-name cell(s) of PT-03, PT-04, PT-16, PT-17, PT-31 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-22b — poller loop
Branch `f1/22b-poller` → `main`. Depends: PR-22a. Size: ≈145 lines, no exception.
Scope: `src/daemon/poller.ts`, `test/daemon/poller.test.ts`.
Requirements: `daemon-lifecycle` Telegram 409 scenario (`TELEGRAM_CONFLICT`, loop stops, visible in `status`); `send-path › Rate discipline` (poller-side 429 half, PT-33); `durable-inbox › Write-ahead before offset confirm` (loop side, consumes PR-12).
Runtime harness: fake Telegram client (PR-18/19's fixtures) driving the poller loop end to end.

- [ ] 22b.1 RED: write `test/daemon/poller.test.ts` covering "409 surfaced, never retried blindly" and "429 honoured with `retry_after_s` sleep, no blind retry" (PT-33 poller half), and "offset advances only after the write-ahead transaction commits".
- [ ] 22b.2 GREEN: implement `src/daemon/poller.ts` (the daemon bundle's one unbounded loop per design §8.1; imports `admission.ts`, emits `inbox:<project_id>` on the in-process `EventEmitter` for PR-23's D-02 wait).
- [ ] 22b.3 Verify: `npm run build && node --test "dist/test/daemon/poller.test.js" "dist/test/daemon/admission.test.js"`.
- [ ] 22b.4 Docs: update the file-name cell(s) of PT-33 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-23 — `daemon/serve/fetch.ts` (D-02, D-15)
Branch `f1/23-serve-fetch` → `main`. Depends: PR-22b. Size: ≈350 lines, no exception.
Scope: `src/daemon/serve/fetch.ts`, `test/daemon/serve/fetch.test.ts`.
Requirements: `durable-inbox › timeout_s is a long-poll against the ledger` (D-02); `durable-inbox › needs_action and seen_eids resolve DATA-MODEL's open points` (D-06 VIEW/index); D-15 fence application site (consumes `shared/fence.ts` from PR-06).
Runtime harness: in-process daemon serving `fetch` over a real ledger temp file, waiting on the `inbox:<project_id>` event.

- [ ] 23.1 RED: write `test/daemon/serve/fetch.test.ts` covering "fetch blocks against new ledger rows, not Telegram", "timeout_s is clamped" to `FETCH_LONGPOLL_MAX_SECONDS`, and "`needs_action` reflects threads without a write-behind step".
- [ ] 23.2 GREEN: implement `src/daemon/serve/fetch.ts` (per-client `inbox_seq`/`client_surfaced` reads from PR-12, D-02 bounded wait on the poller's event emitter, fence applied at this boundary per D-15).
- [ ] 23.3 Verify: `npm run build && node --test "dist/test/daemon/serve/fetch.test.js"`.

#### PR-24 — `daemon/serve/status.ts`
Branch `f1/24-serve-status` → `main`. Depends: PR-23. Size: ≈300 lines, no exception.
Scope: `src/daemon/serve/status.ts`, `test/daemon/serve/status.test.ts`.
Requirements: `thin-client-tools › status and thread are local, no-network reads` (status half).
Runtime harness: in-process daemon with a fake Telegram client recording zero calls.

- [ ] 24.1 RED: write `test/daemon/serve/status.test.ts` ("status makes no Telegram call"; response includes daemon uptime, last poll per bot, binding identity, secret-store kind, conditions from the table).
- [ ] 24.2 GREEN: implement `src/daemon/serve/status.ts` (SEAM from `telegram-agent-bus/src/tools/status.ts`, read-only source, 162 lines; ledger reads via PR-13's `conditions-store.ts`).
- [ ] 24.3 Verify: `npm run build && node --test "dist/test/daemon/serve/status.test.js"`.

#### PR-25 — `daemon/serve/thread.ts` (D-15 fence consumer)
Branch `f1/25-serve-thread` → `main`. Depends: PR-24. Size: ≈300 lines, no exception.
Scope: `src/daemon/serve/thread.ts`, `test/daemon/serve/thread.test.ts`.
Requirements: `thin-client-tools › status and thread are local, no-network reads` (thread half); `thin-client-tools › Fence soundness and origin labels` (PT-13, PT-14, daemon-side of the D-15 amendment).
Runtime harness: in-process daemon over a real ledger temp file.

- [ ] 25.1 RED: write `test/daemon/serve/thread.test.ts` ("fence cannot be forged by peer content", "origin label reflects the verified sender" regardless of the envelope's own `from` claim).
- [ ] 25.2 GREEN: implement `src/daemon/serve/thread.ts` (SEAM from `telegram-agent-bus/src/tools/thread.ts`, read-only source, 164 lines; fence with origin applied here per D-15, consumes `shared/fence.ts` from PR-06).
- [ ] 25.3 Verify: `npm run build && node --test "dist/test/daemon/serve/thread.test.js"`.
- [ ] 25.4 Docs: update the file-name cell(s) of PT-13, PT-14 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

### Unit 8 — `send-path`

#### PR-26 — send validation pipeline + secret backstop
Branch `f1/26-send-validate` → `main`. Depends: PR-25. Size: ≈330 lines, no exception.
Scope: `src/daemon/send/validate.ts`, `test/daemon/send/validate.test.ts`.
Requirements: `send-path › Validation pipeline and secret backstop run before any network call` (PT-15); `send-path › Send input carries no destination` (PT-02 half, consumes PR-07a's schema).
Runtime harness: N/A — pure pipeline unit test.

- [ ] 26.1 RED: write `test/daemon/send/validate.test.ts` covering "secret-shaped body rejected before any network call" (names the rule, never the matched text) and "encoded length guard reports headroom" (`wire.headroom_chars` vs. a late `BODY_TOO_LONG`).
- [ ] 26.2 GREEN: implement `src/daemon/send/validate.ts` (SEAM from `telegram-agent-bus/src/tools/send.ts:113-192,205-378`, read-only source, ≈254 lines; `BRIDGE_BUSY` removed, thread lookups against the ledger via PR-12).
- [ ] 26.3 Verify: `npm run build && node --test "dist/test/daemon/send/validate.test.js"`.
- [ ] 26.4 Docs: update the file-name cell(s) of PT-02, PT-15 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-27 — send path, room guard integration, `DualWriteTransport`
Branch `f1/27-send-path` → `main`. Depends: PR-26. Size: ≈350 lines, no exception.
Scope: `src/daemon/send/send-path.ts`, `test/daemon/send/send-path.test.ts`.
Requirements: `send-path › chat_id must equal the binding's group_id or the send is refused` (PT-01 unit half — full two-binding CI job in PR-41); `send-path › One DualWriteTransport per binding` (BROADCAST never crosses bindings); `send-path › Send input carries no destination` (stamping half — `from`/`to_user_id` never inputs).
Runtime harness: `FakeTelegramClient` per token driving a real `send-path.ts` instance over the ledger.

- [ ] 27.1 RED: write `test/daemon/send/send-path.test.ts` covering "BROADCAST never crosses bindings" and a room-guard-integration variant of "forced mismatch yields WRONG_ROOM" at the send-path level (audit row, zero `sendMessage` calls).
- [ ] 27.2 GREEN: implement `src/daemon/send/send-path.ts` (SEAM from `telegram-agent-bus/src/tools/send.ts:380-660`, read-only source, ≈281 lines; lock→`BindingMutex`, `saveState`→transaction, room guard from PR-21 wired in, `obligations` removed).
- [ ] 27.3 Verify: `npm run build && node --test "dist/test/daemon/send/send-path.test.js"`.
- [ ] 27.4 Docs: update the file-name cell(s) of PT-01 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-28 — send rate discipline
Branch `f1/28-send-rate` → `main`. Depends: PR-27. Size: ≈220 lines, no exception.
Scope: `src/daemon/send/rate.ts`, `test/daemon/send/rate.test.ts`.
Requirements: `send-path › Rate discipline without auto-retry` (PT-33 429 half).
Runtime harness: fake Telegram client returning a 429 with `retry_after_s`.

- [ ] 28.1 RED: write `test/daemon/send/rate.test.ts` ("429 surfaced, cursor unmoved, no retry": returns `RATE_LIMITED{retry_after_s: 30}`, no automatic retry, cursor unmoved).
- [ ] 28.2 GREEN: implement `src/daemon/send/rate.ts` (`offsets.retry_after_until` local check, `GROUP_MESSAGES_PER_MINUTE`/`CHAT_MESSAGES_PER_SECOND` timestamp-window budget).
- [ ] 28.3 Verify: `npm run build && node --test "dist/test/daemon/send/rate.test.js"`.
- [ ] 28.4 Docs: update the file-name cell(s) of PT-33 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

### Unit 9 — `ipc-handshake`

#### PR-29 — IPC contract + HTTP server scaffolding
Branch `f1/29-ipc-contract-server` → `main`. Depends: PR-28. Size: ≈310 lines, no exception.
Scope: `src/shared/ipc-contract.ts`, `src/daemon/ipc/server.ts`, `test/shared/ipc-contract.test.ts`, `test/daemon/ipc/server.test.ts`.
Requirements: transport scaffolding underlying every `ipc-handshake` requirement (`Host` DNS-rebinding check, body cap `IPC_MAX_BODY_BYTES`).
Runtime harness: real `node:http` listener on port 0 (design §15 "IPC" layer).

- [ ] 29.1 RED: write `test/daemon/ipc/server.test.ts` (request with a wrong `Host` header refused; body over `IPC_MAX_BODY_BYTES` returns `HTTP_PAYLOAD_TOO_LARGE`).
- [ ] 29.2 GREEN: implement `src/shared/ipc-contract.ts` (zod schemas for every request/response) and `src/daemon/ipc/server.ts` (`node:http` on `127.0.0.1:IPC_EPHEMERAL_PORT`, JSON-only, `Host` check).
- [ ] 29.3 Verify: `npm run build && node --test "dist/test/shared/ipc-contract.test.js" "dist/test/daemon/ipc/server.test.js"`.

#### PR-30 — identity handshake + session bearer (D-14, D-04)
Branch `f1/30-ipc-handshake-sessions` → `main`. Depends: PR-29. Size: ≈370 lines, no exception.
Scope: `src/daemon/ipc/handshake.ts`, `src/daemon/ipc/sessions.ts`, `test/daemon/ipc/handshake.test.ts`, `test/daemon/ipc/sessions.test.ts`.
Requirements: `ipc-handshake › No bearer before identity proof` (PT-26); `ipc-handshake › Bearer is a per-session token, not the raw per-boot secret`; `ipc-handshake › Secret and session rotate per daemon boot` (PT-24).
Runtime harness: in-process daemon on port 0; a fake `http` client for the excess-pending-handshakes scenario.

- [ ] 30.1 RED: write `test/daemon/ipc/handshake.test.ts` covering "wrong HMAC yields no bearer" (`DAEMON_IDENTITY_MISMATCH`, one re-read, never `DAEMON_DOWN`), "valid HMAC allows the bearer", and "excess pending handshakes are refused, not queued" (`MAX_PENDING_HANDSHAKES`).
- [ ] 30.2 GREEN: implement `src/daemon/ipc/handshake.ts` (`GET /identity`, `HMAC-SHA256(secret, "identity:"+nonce)`, D-14 domain-separated labels, `HANDSHAKE_NONCE_TTL_SECONDS`).
- [ ] 30.3 RED: write `test/daemon/ipc/sessions.test.ts` ("session token issued at `POST /session`", "raw per-boot secret is rejected as a bearer", "stale-boot bearer rejected" with no side effect).
- [ ] 30.4 GREEN: implement `src/daemon/ipc/sessions.ts` (per-session `SESSION_TOKEN_BYTES` bearer minted at `POST /session`, memory-only, invalidated per boot).
- [ ] 30.5 Verify: `npm run build && node --test "dist/test/daemon/ipc/handshake.test.js" "dist/test/daemon/ipc/sessions.test.js"`.
- [ ] 30.6 Docs: update the file-name cell(s) of PT-24, PT-26 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-31 — session routes, freeze, roster drift, error taxonomy
Branch `f1/31-ipc-routes` → `main`. Depends: PR-30. Size: ≈390 lines, no exception.
Scope: `src/daemon/ipc/routes.ts`, `test/daemon/ipc/routes.test.ts`.
Requirements: `ipc-handshake › Session binds one project and freezes for its lifetime`; `ipc-handshake › Roster hash detects drift without auto-resolving it` (D-07); `ipc-handshake › Client error taxonomy for handshake and session failures`.
Runtime harness: in-process daemon over a real registry temp file (PR-09).

- [ ] 31.1 RED: write `test/daemon/ipc/routes.test.ts` covering "unbound project refused at session start", "binding never changes mid-session", "roster hash mismatch raises a condition, not a failure", "live binding drift is refused per call" (`BINDING_CHANGED`, `HTTP_CONFLICT`), "session refused when the project file's group disagrees with the binding" (`BINDING_MISMATCH`, R4), and version-skew/transport-failure scenarios (`DAEMON_VERSION_MISMATCH`, `IPC_ERROR`).
- [ ] 31.2 GREEN: implement `src/daemon/ipc/routes.ts` (`POST`/`DELETE /session`, `/tools/*` routing, binding snapshot freeze-and-compare, `toTelegramErrorPayload` consuming `daemon/telegram.ts` from PR-19).
- [ ] 31.3 Verify: `npm run build && node --test "dist/test/daemon/ipc/routes.test.js"`.

### Unit 10 — `thin-client-tools`

#### PR-32 — lazy spawn (D-01) + client run-state (spawn election)
Branch `f1/32-client-spawn-runstate` → `main`. Depends: PR-31. Size: ≈300 lines, no exception.
Scope: `src/client/spawn.ts`, `src/client/run-state.ts`, `test/client/spawn.test.ts`, `test/client/run-state.test.ts`.
Requirements: `daemon-lifecycle › Lazy spawn is one allow-listed call site (D-01 Option A)` (PT-27 — full multi-clause bundle scan in PR-40); `daemon-lifecycle › Client-side spawn election uses a separate stale window` (`run/spawn.lock`, `SPAWN_LOCK_STALE_SECONDS`).
Runtime harness: injected `spawnImpl` in unit tests; the N-clients-race scenario runs concurrent in-process client instances against a shared temp `run/` directory.

- [ ] 32.1 RED: write `test/client/spawn.test.ts` ("argv never carries caller input": spawned argv is unchanged from the compile-time literal regardless of `--project`) and `test/client/run-state.test.ts` ("N clients racing spawn exactly one daemon": exactly one client wins `run/spawn.lock`, calls `spawnDaemon()` once, others wait on the run-file event).
- [ ] 32.2 GREEN: implement `src/client/spawn.ts` (the one allow-listed `child_process` reference: `spawn(process.execPath, [DAEMON_ENTRY], SPAWN_OPTIONS)`, `shell: false`, `detached: true`, `windowsHide: true`, `child.unref()`) and `src/client/run-state.ts` (`fs.watch` + `AbortSignal.timeout(SPAWN_WAIT_SECONDS * 1000)`, `run/spawn.lock` `wx` election with `SPAWN_LOCK_STALE_SECONDS`).
- [ ] 32.3 Verify: `npm run build && node --test "dist/test/client/spawn.test.js" "dist/test/client/run-state.test.js"`.
- [ ] 32.4 Docs: update the file-name cell(s) of PT-27 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-33 — binding walk-up + client handshake
Branch `f1/33-client-binding-handshake` → `main`. Depends: PR-32. Size: ≈340 lines, no exception.
Scope: `src/client/binding.ts`, `src/client/handshake.ts`, `test/client/binding.test.ts`, `test/client/handshake.test.ts`.
Requirements: `thin-client-tools › Launcher requires --project and refuses when unbound or mismatched`; `thin-client-tools › DAEMON_DOWN makes zero network calls` (PT-26 a/b).
Runtime harness: fake `fetch` that throws on any call (proves zero network on `DAEMON_DOWN`).

- [ ] 33.1 RED: write `test/client/binding.test.ts` ("missing `--project` exits before any IPC call", "`project_id` mismatch is `UNBOUND_PROJECT`") and `test/client/handshake.test.ts` ("no daemon, zero network calls": a network recorder shows zero outbound calls and no `Authorization` header).
- [ ] 33.2 GREEN: implement `src/client/binding.ts` (cwd walk-up to the nearest `conmuta.json`, strict-parse via PR-08, `EXIT_UNBOUND_PROJECT`/`EXIT_PROJECT_MISMATCH`) and `src/client/handshake.ts` (identity verify, `POST /session`, `DAEMON_IDENTITY_MISMATCH` re-read-once).
- [ ] 33.3 Verify: `npm run build && node --test "dist/test/client/binding.test.js" "dist/test/client/handshake.test.js"`.
- [ ] 33.4 Docs: update the file-name cell(s) of PT-26 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-34 — IPC stub, client errors, `createServer(deps)`
Branch `f1/34-client-server` → `main`. Depends: PR-33. Size: ≈360 lines, no exception.
Scope: `src/client/ipc-stub.ts`, `src/client/errors.ts`, `src/client/server.ts`, `test/client/ipc-stub.test.ts`, `test/client/errors.test.ts`, `test/client/server.test.ts`.
Requirements: `thin-client-tools › Client-local error payload constructor` (PT-07); `thin-client-tools › Four tool input schemas port unchanged`.
Runtime harness: N/A — unit tests over the handler wiring; the client bundle scan runs in PR-40.

- [ ] 34.1 RED: write `test/client/errors.test.ts` ("client-local codes need no Telegram import": the built client bundle has no reference to the Telegram-classification module) and `test/client/server.test.ts` ("tool count and shapes are unchanged" against v1's four schemas from PR-07a).
- [ ] 34.2 GREEN: implement `src/client/ipc-stub.ts` (`deps = {ipc: IpcSession, projectId, now?}`), `src/client/errors.ts` (client-local `{code, message, retryable}` constructor mirroring PR-07a's shape), `src/client/server.ts` (`createServer(deps)` keeps v1's shape; tool names from `TOOL_PREFIX`).
- [ ] 34.3 Verify: `npm run build && node --test "dist/test/client/ipc-stub.test.js" "dist/test/client/errors.test.js" "dist/test/client/server.test.js"`.
- [ ] 34.4 Docs: update the file-name cell(s) of PT-07 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-35 — client entry point + `conmuta mcp` subcommand
Branch `f1/35-client-main-cli-mcp` → `main`. Depends: PR-34. Size: ≈250 lines, no exception.
Scope: `src/client/main.ts`, `src/cli/main.ts` (add `mcp` subcommand), `test/client/main.test.ts`.
Requirements: completes the client bundle entry point (`ADR-0029` "starts within the MCP timeout").
Runtime harness: MCP host simulated by `StdioServerTransport` in-process.

- [ ] 35.1 RED: write `test/client/main.test.ts` ("handshake is lazy, on the first tool call, cached for the session": MCP initialization completes within the host timeout even with no daemon running).
- [ ] 35.2 GREEN: implement `src/client/main.ts` (node-floor gate → parse `--project` → `client/binding.ts` walk-up → `server.connect(new StdioServerTransport())` immediately) and wire `conmuta mcp --project <id>` as a dynamic-`import()` subcommand in `src/cli/main.ts` so the IDE-facing process loads only the client closure.
- [ ] 35.3 Verify: `npm run build && node --test "dist/test/client/main.test.js"`.

### Unit 11 — `v1-migration`

#### PR-36 — read-only v1 config/state loaders (SEAM)
Branch `f1/36-migration-v1-readers` → `main`. Depends: PR-35. Size: ≈360 lines, no exception.
Scope: `src/migration/v1-config.ts`, `src/migration/v1-state.ts`, `test/migration/v1-config.test.ts`, `test/migration/v1-state.test.ts`.
Requirements: read-side of `v1-migration › v1 files are backed up and never modified or deleted`.
Runtime harness: temp `~/.agentbus`-shaped fixture directories (placeholders only).

- [ ] 36.1 RED: write `test/migration/v1-config.test.ts` and `test/migration/v1-state.test.ts` against a placeholder fixture, asserting read-only parsing and that the quarantine-rename branch becomes a hard error (v1 files are never modified).
- [ ] 36.2 GREEN: implement `src/migration/v1-config.ts` (SEAM from `telegram-agent-bus/src/config.ts:168-233`, read-only source, no token resolution from env) and `src/migration/v1-state.ts` (SEAM from `telegram-agent-bus/src/state.ts:252-439`, read-only source, `to_user_id` backfilled from the v1 roster).
- [ ] 36.3 Verify: `npm run build && node --test "dist/test/migration/v1-config.test.js" "dist/test/migration/v1-state.test.js"`.

#### PR-37 — synthesis + non-interactive CLI entry (D-24)
Branch `f1/37-migration-synthesize-cli` → `main`. Depends: PR-36. Size: ≈390 lines, no exception.
Scope: `src/migration/synthesize.ts`, `src/migration/main.ts`, `src/cli/main.ts` (add `migrate-v1` dispatch), `test/migration/synthesize.test.ts`, `test/migration/main.test.ts`.
Requirements: `v1-migration › Migration synthesizes the registry, secret-store entry and ledger rows` (env-only-refused scenario, D-24); `v1-migration › Minimal non-interactive migration entry point`.
Runtime harness: end-to-end fixture run deferred to PR-38; this PR unit-tests synthesis and CLI parsing in isolation.

- [ ] 37.1 RED: write `test/migration/synthesize.test.ts` ("project assignment stays a mandatory human action": no `project_id` bound to the synthesized pair) and `test/migration/main.test.ts` ("env-only token is refused, nothing is written": `AGENTBUS_BOT_TOKEN` present but never read, `EXIT_MIGRATION_REFUSED`, zero writes).
- [ ] 37.2 GREEN: implement `src/migration/synthesize.ts` (registry `bots[]`/`groups[]`/`projects[]`/`bindings[]`, secret-store `set`, ledger `offsets`/`threads`/`thread_history`/`binding_state` rows per design §13 step 5) and `src/migration/main.ts` (`--v1-home`, `--project-id`, `--project-path`, `--token-stdin`, `--dry-run`; token only from `config.bot_token` or stdin, D-24).
- [ ] 37.3 Wire `migrate-v1` as a dynamic-`import()` subcommand in `src/cli/main.ts`.
- [ ] 37.4 Verify: `npm run build && node --test "dist/test/migration/synthesize.test.js" "dist/test/migration/main.test.js"`.

#### PR-38 — placeholder fixture, end-to-end migration test, runbook
Branch `f1/38-migration-fixture-runbook` → `main`. Depends: PR-37. Size: ≈290 lines, no exception.
Scope: `test/fixtures/v1-home/` (placeholder `config.json`/`state.json`), `test/migration/integration.test.ts`, `docs/runbooks/migrate-from-v1.md`.
Requirements: `v1-migration › v1 files are backed up and never modified or deleted` (full scenario); `v1-migration › The >24h cursor gap is stated, never silently absorbed`.
Runtime harness: `conmuta migrate-v1` invoked as a real child process against the fixture (design §15 "Integration" layer, temp homes).

- [ ] 38.1 RED: write `test/migration/integration.test.ts` covering "originals are byte-identical after migration", "fixture migrates with a synthesized registry and secret entry", and "stale cursor carries forward without a false recovery claim" (> `BOT_API_RETENTION_HOURS`).
- [ ] 38.2 GREEN: build `test/fixtures/v1-home/config.json`/`state.json` (placeholders only, PT-22 deny-list clean) and run the migration CLI from PR-37 against it until 38.1 passes.
- [ ] 38.3 Write `docs/runbooks/migrate-from-v1.md` (deliverable of this change, design §13): the >24h cursor gap, the one-poller rule, rollback steps (`conmuta daemon stop`, remove `~/.conmuta`, delete keyring entries `bot:<bot_id>`, resume v1), the backup still holds the token, null-anchor threads fail closed, hand-editing the registry until F2's wizards exist.
- [ ] 38.4 Verify: `npm run build && node --test "dist/test/migration/integration.test.js"`.

### Unit 12 — Static assertions + wrong-room CI

#### PR-39 — predicates (SEAM) + closure walker
Branch `f1/39-security-predicates-closure` → `main`. Depends: PR-38. Size: ≈197 lines, no exception (`predicates.ts` is a range extract of v1 `test/security.test.ts`, therefore SEAM; tribunal `bus-v2-f1-tasks-001` item 2).
Scope: `test/security/predicates.ts`, `test/security/closure.ts`, `test/security/closure.test.ts`, `test/fixtures/v1-provenance.json` (append one SEAM entry).
Requirements: risk mitigation groundwork for `daemon-lifecycle › Static bundle assertions and packaging conformance` (predicates half).
Runtime harness: N/A — pure static analysis over `dist/src/**` after `tsc -b`.

- [ ] 39.1 RED: add the SEAM fixture entry for `test/security/predicates.ts` and confirm `provenance.test.ts` fails before the file exists.
- [ ] 39.2 GREEN: implement `test/security/predicates.ts` as a SEAM extracted from `telegram-agent-bus/test/security.test.ts:25-101` (read-only source, ≈77 lines) with a provenance header `verdict: SEAM`, `v1 body sha256` of `test/security.test.ts`, and `Changes: (1) extracted lines 25-101 into a reusable module; (2) imports relocated`.
- [ ] 39.3 RED: write a `test/security/closure.test.ts` unit test asserting `closure.ts`'s relative-import walker correctly resolves a two-hop fixture closure and correctly excludes an unrelated module.
- [ ] 39.4 GREEN: implement `test/security/closure.ts` (transitive closure of relative `import`/`export … from` specifiers over `dist/src/**`).
- [ ] 39.5 Verify: `npm run build && node --test "dist/test/security/predicates.test.js" "dist/test/security/closure.test.js" "dist/test/security/provenance.test.js"`.

#### PR-40 — client/daemon bundle assertion tables (PT-27, PT-28, PT-07)
Branch `f1/40-security-bundle-tables` → `main`. Depends: PR-39. Size: ≈380 lines, no exception.
Scope: `test/security/client-bundle.test.ts`, `test/security/daemon-bundle.test.ts`.
Requirements: `daemon-lifecycle › Static bundle assertions and packaging conformance` (PT-27 with the D-01 multi-clause spawn assertion, PT-28); `thin-client-tools › Client-local error payload constructor` (PT-07 bundle-scan half).
Runtime harness: static scan over `dist/src/client/**`/`dist/src/daemon/**` after `tsc -b`, each predicate exercised against a seeded negative fixture so the scan cannot pass vacuously.

- [ ] 40.1 RED: write `test/security/client-bundle.test.ts` ("bundle scan finds exactly one spawn site": `hasChildProcessReference` matches exactly once at `client/spawn.js`, `spawn(` count == 1, literal argv, `shell: false`; forbidden `node:sqlite`/`api.telegram.org`/`getUpdates`/`@napi-rs/keyring`/`secrets/`; each predicate seeded-fails on a negative fixture).
- [ ] 40.2 GREEN: make 40.1 pass against the built client closure from PR-32/PR-34 (adjust closure boundaries only if the scan finds an unintended cross-import; no new source files expected).
- [ ] 40.3 RED: write `test/security/daemon-bundle.test.ts` ("daemon bundle scan is clean and non-vacuous": no `child_process`; `node:fs` confined to the allow-listed home-scoped modules; `sendMessage` confined to transport modules reachable only from an IPC handler; unbounded loop confined to `poller.js`, which imports no transport module; timers confined to the allow-list including `serve/fetch.js` with the reverse-import-graph exclusion of `transport/*`/`send/*`).
- [ ] 40.4 GREEN: make 40.3 pass against the built daemon closure from PR-15–PR-31 (adjust nothing in source; this PR only adds tests, per the twin rule the daemon files were already implemented).
- [ ] 40.5 Verify: `npm run build && npm run test:static`.
- [ ] 40.6 Docs: update the file-name cell(s) of PT-07, PT-27, PT-28 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

#### PR-41 — two-binding wrong-room CI job (PT-01)
Branch `f1/41-security-wrong-room-ci` → `main`. Depends: PR-40. Size: ≈180 lines, no exception.
Scope: `test/security/wrong-room.test.ts`, `.github/workflows/ci.yml` (add the named `test:wrong-room` step).
Requirements: `send-path › chat_id must equal the binding's group_id or the send is refused` (PT-01, full two-binding CI scenario).
Runtime harness: `startDaemon` booted in-process with a temp home, two bindings, one `FakeTelegramClient` per token, two sessions.

- [ ] 41.1 RED: write `test/security/wrong-room.test.ts` boots two bindings (A, B), N sends from each session, asserts the per-fake `sentMessages[].chat_id` partition never crosses, then wires a guard with the wrong group and asserts `WRONG_ROOM` plus an audit row.
- [ ] 41.2 GREEN: this scenario should already pass against PR-21/PR-27's room-guard and send-path implementations; if it does not, the gap is a defect in those PRs to fix here, not new production code.
- [ ] 41.3 Add the named `test:wrong-room` CI step (`.github/workflows/ci.yml`, after `npm run build`, before `npm pack --dry-run`).
- [ ] 41.4 Verify: `npm run build && npm run test:wrong-room`.
- [ ] 41.5 Docs: update the file-name cell(s) of PT-01 in `docs/02-architecture/THREAT-MODEL.md` §4 with the test files this PR adds (same PR; tribunal `bus-v2-f1-tasks-001` item 5).

### Unit 13 — Documentation

#### PR-42 — DATA-MODEL / THREAT-MODEL / CHECKLIST close-out
Branch `f1/42-docs-close-out` → `main`. Depends: PR-41. Size: ≈300 lines, no exception (documentation only — no test-first rule applies).
Scope: `docs/02-architecture/DATA-MODEL.md`, `docs/02-architecture/THREAT-MODEL.md` (§4 only), `docs/06-backlog/CHECKLIST.md`. `docs/03-adr/INDEX.md` is explicitly **untouched** (no ADR amendment; design.md states none is needed).
Requirements: proposal.md deliverable 15.
Runtime harness: N/A — documentation.

- [ ] 42.1 Finalize DATA-MODEL.md fields: `roster_snapshot`/`roster_hash` required (§2.4), `audit_log.reason` enum aligned to the classification codes used across PR-13/PR-22a/PR-26/PR-27, `updates.body` NULL rule (D-20), the two open points resolved in code (§8: `needs_action` VIEW, `seen_eids` as `UNIQUE` index, D-06).
- [ ] 42.2 Update THREAT-MODEL.md §4 with the real test file names from design §15's PT → file mapping (e.g., PT-01 `test/security/wrong-room.test.ts`, PT-10 `test/ledger/inbox.test.ts`, PT-26 `test/client/handshake.test.ts` — full list per design.md:527).
- [ ] 42.3 Close CHECKLIST.md pointers for B-13 (v1 migration, → PR-36–PR-38), B-15 (secret store, → PR-14), B-18 (token-shape validator, → PR-08); leave B-11, B-16, B-12, and the T22/organisation-marker items exactly as `pending Director decision` per design §19 — do not resolve them here.
- [ ] 42.4 Verify: `npm run build && npm test && npm run test:static && npm run test:wrong-room` (full suite green, confirming every ADR "Tests that must pin it" row and every F1 PT id).

## Success Criteria Checklist

Mirrors `proposal.md` "Success criteria" verbatim, with the closing PR(s) for each item.

- [ ] All "Tests that must pin it" rows of ADR-0028 (6), ADR-0029 (8) and ADR-0030 (8) are green in CI — cumulative across PR-02 → PR-41; final CI gate confirmed at PR-41/PR-42.
- [ ] The two-binding wrong-room CI job is green (PT-01) — PR-41.
- [ ] Static assertions are green and non-vacuous over both built bundles (PT-27 with the D-01 clauses, PT-28, PT-07) — PR-39, PR-40.
- [ ] The `DAEMON_DOWN` path makes zero network calls and sends no `Authorization` header (PT-26 a/b) — PR-33.
- [ ] A v1 `~/.agentbus` fixture (placeholders only) migrates with `.bak-pre-v2-*` siblings, a synthesized registry, a secret-store entry and imported threads; the originals are unchanged — PR-38.
- [ ] F1 pinning tests green: PT-02..PT-06, PT-08, PT-09 (win-x64), PT-10..PT-20 (PT-19 on Windows), PT-24..PT-28, PT-31, PT-33 (429 half); PT-21 pinned early against the scaffold — PT-21/PT-22 → PR-01a; PT-02 → PR-07a/PR-27; PT-03/04/16/31 → PR-22a; PT-05/06 → PR-08; PT-07 → PR-34/PR-40; PT-08 → PR-19; PT-09/19 → PR-14; PT-10 → PR-12; PT-11 → PR-12/PR-23; PT-12 → PR-15; PT-13 → PR-06; PT-14 → PR-23; PT-15 → PR-03/PR-26; PT-17 → PR-05; PT-18 → PR-09; PT-20 → PR-13; PT-24 → PR-30; PT-25 → PR-27; PT-26 → PR-33; PT-27 → PR-32/PR-40; PT-28 → PR-40; PT-33 → PR-22b/PR-28.
- [ ] Every `src` file has a `test` twin; `npm test` and `npm run build` pass; no v1 production identifier in the tree (PT-22 deny-list) — enforced by `test/twins.test.ts` and `test/security/repo-scan.test.ts` (PR-01a), checked cumulatively in every later PR.
- [ ] A re-run of `sdd-init` flips `openspec/config.yaml` `strict_tdd` to `true` against the real `npm test` — not itself a PR deliverable; an orchestrator/Director action after PR-42 merges, against the real `npm test` script fixed in PR-01a.

## Pending Director Decisions Carried Into Tasks

- **B-11** (trademark screening): `PRODUCT_NAME` is the single rename constant (PR-01b, `src/shared/constants.ts`); no task blocks on the outcome.
- **B-16 / D-10 vs DN-04**: PR-01a ships `package.json` with `private: true` and `LICENSE` present, per Kairo's DN-06 assumption ("D-10 is superseded by DN-04") — open to Director veto; tribunal ruling `bus-v2-f1-design-001` item 6 raised no objection but the Director's confirmation is still the authorizing act.
- **Provenance header format**: resolved — the v1 body SHA-256 travels in the header (design §12 as amended; tribunal `bus-v2-f1-design-001` item 5, `bus-v2-f1-tasks-001`; DN-06). No Director action needed.
- **T22 bytes-per-hour exfiltration ceiling and the origin-label organisation marker** (THREAT-MODEL §7): explicitly out of F1 design scope, no backlog id yet — no task added; documented as still-open in PR-42.
- **macOS half of PT-09/PT-19**: out of scope (B-12, F6) — no task added.
