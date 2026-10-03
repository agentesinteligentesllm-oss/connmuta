# Tasks: F7a — Wake satellite (bounded, per-binding autonomous harness execution)

| Field | Value |
|---|---|
| Change | `f7a-wake-satellite` |
| Inputs | `proposal.md` (ADR-0032, B-104 RFC, Judgment Day debate `bus-v2-b104-wake-satellite-001`, CONSTITUTION §3.1 amendment); `specs/wake-satellite/spec.md`, `specs/wake-ladder/spec.md`, `specs/wake-ledger/spec.md`, `specs/harness-execution-profile/spec.md`; `design.md` (Architecture Decisions D1–D9, technical flow, security pinning) |
| Delivery strategy | `auto-chain` (from SDD preflight; delivered directly to `main` in session 59 under explicit per-session Director authorization) |
| Chain strategy | `stacked-to-main` (9 reviewable work-unit commits pushed directly to `main` under explicit per-session Director authorization; five individual commits knowingly exceeded the 400-line budget with disclosed size-exception) |
| TDD rule | Strict TDD. Red before green. Every module under `runner/` twinned under `test/runner/`; static isolation enforced by `test/security/runner-bundle.test.ts` (PT-34) |
| PR budget | 400 authored changed lines (additions + deletions) per unit (knowingly exceeded per-commit; recorded with size-exception) |
| Rollback (default, all units) | Revert commit (`git revert`). Zero files under `src/` touched; satellite isolated in `runner/` and `test/runner/` |
| Verify (base commands) | Build: `npm run build`. Full suite: `npm test`. Static suite: `npm run test:static`. Focused: `node --test "dist/test/runner/<test>.js"` and `node --test "dist/test/security/runner-bundle.test.js"` |
| Retrospective note | Phase F7a was implemented and verified in session 59 (2026-09-30) and pushed to `main`. Every task below records completed work with its commit hash as evidence, not a plan for future work. |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 4,565 changed lines (4,517 insertions, 48 deletions across 44 files; delivered as 9 commits on `main`) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | 9 work-unit commits (commits 1–9 as delivered on `main`) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: High
```

### Review Workload and Delivery Analysis

The delivered change spans 44 files, 4,517 insertions, and 48 deletions across nine reviewable work-unit commits pushed directly to `main`. Zero files under `src/` were touched, ensuring that the core daemon and thin client remain completely unmodified and isolated. The satellite's own test suite added 86 tests to the repository total (reaching 1,824 total at commit `f00e8fb`, against the session-58 baseline of 1,738).

#### Measured Diff per Work-Unit Commit

| # | Commit | Message | Files | Insertions | Deletions | 400-Line Budget Status |
|---|---|---|---|---|---|---|
| 1 | `e1ef614` | `feat(runner): add the wake satellite's ladder, ledger and wake prompt` | 7 | 966 | 0 | Exceeded (+966 lines; size-exception) |
| 2 | `8c0b5dd` | `feat(runner): add the harness adapter with a closed executable set` | 2 | 513 | 0 | Exceeded (+513 lines; size-exception) |
| 3 | `828adb1` | `feat(runner): add the wake loop and its persisted watermark` | 4 | 1036 | 0 | Exceeded (+1036 lines; size-exception) |
| 4 | `4334deb` | `feat(runner): add the conmuta-runner CLI and its bin entry` | 7 | 897 | 1 | Exceeded (+898 lines; size-exception) |
| 5 | `a0ea37f` | `test(security): pin the wake satellite's isolation from the core (PT-34)` | 3 | 133 | 4 | Within budget (137 lines) |
| 6 | `188bd07` | `docs(governance): sanction the wake satellite and its per-binding ladder (ADR-0032)` | 14 | 524 | 43 | Exceeded (+567 lines; size-exception) |
| 7 | `c862339` | `docs(runner): add the operator runbook for the wake satellite` | 1 | 155 | 0 | Within budget (155 lines) |
| 8 | `cfc8fe7` | `docs(odd): record the B-104 feature, its two audit briefs and the F7a evidence` | 3 | 261 | 0 | Within budget (261 lines) |
| 9 | `f00e8fb` | `chore(conmuta): record this repository's bus binding` | 3 | 32 | 0 | Within budget (32 lines) |
| **Total** | | | **44** | **4,517** | **48** | **4,565 changed lines** |

#### Delivery Shape & Exception Authorization

Because apply already happened, the Review Workload Guard's action is moot. The phase was delivered as **nine work-unit commits pushed directly to `main`** under the Director's explicit per-session authorization, recorded in `docs/08-sessions/HANDOFF.md` §0.4: *"Commits are authorized when the Director says so, per session. Session 59 was authorized explicitly and the nine work-unit commits were pushed to `main` (`2aa0da0..f00e8fb`)."*

Five commits (four implementation commits 1–4 and the governance documentation commit 6) individually exceeded the 400-authored-line budget; the budget was knowingly exceeded and **no chained PRs were opened**. Rather than decomposing cohesive architectural modules across artificial chained PRs (e.g., splitting a module from its twin test suite or separating interrelated loop/watermark routines), the work units were kept intact and delivered as discrete, logical commits directly on `main` with disclosed `size-exception`.

All work was audited under Judgment Day debate `bus-v2-f7a-audit-001` across two review rounds (eleven initial findings across two independent judges resolved to zero defects in round 2).

### Summary of Work Units

| Unit | Commit | Goal | Diff | Scope |
|---|---|---|---|---|
| Unit 1 | `e1ef614` | Satellite foundations: named constants, fail-closed ladder store, append-only JSONL ledger, and structured wake prompt | 7 files, 966 ins | `runner/constants.ts`, `runner/ladder.ts`, `runner/ledger.ts`, `runner/prompt.ts`, `test/runner/ladder.test.ts`, `test/runner/ledger.test.ts`, `test/runner/prompt.test.ts` |
| Unit 2 | `8c0b5dd` | Confined harness execution adapter: spawner, closed executable set, literal argv with prompt last, `shell: false`, 3-shape argument refusal, allow-listed env, and Windows `.cmd` refusal | 2 files, 513 ins | `runner/harness.ts`, `test/runner/harness.test.ts` |
| Unit 3 | `828adb1` | Autonomous wake loop, doorbell long-polling, double ladder check, structural bounds, and independent persistent watermark | 4 files, 1036 ins | `runner/watermark.ts`, `runner/loop.ts`, `test/runner/watermark.test.ts`, `test/runner/loop.test.ts` |
| Unit 4 | `4334deb` | Runner CLI (`conmuta-runner`), subcommands (`run`, `ladder set\|get\|disable`), project binding resolution, and third bin packaging | 7 files, 897 ins, 1 del | `runner/cli.ts`, `runner/main.ts`, `runner/tsconfig.json`, `package.json`, `tsconfig.json`, `test/runner/cli.test.ts`, `test/runner/main.test.ts` |
| Unit 5 | `a0ea37f` | Security pinning assertions (PT-34): closure isolation, zero core reach to runner, zero runner reach to SQLite/daemon, single spawn site, and pack whitelist | 3 files, 133 ins, 4 del | `test/security/runner-bundle.test.ts`, `test/security/pack.test.ts`, `test/security/predicates.ts` |
| Unit 6 | `188bd07` | Governance ratification: ADR-0032, CONSTITUTION §3.1 amendment (Component Class c), THREAT-MODEL (T23–T25, PT-34–PT-38), and tribunal debate record | 14 files, 524 ins, 43 del | `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md`, `docs/01-constitution/CONSTITUTION.md`, `docs/02-architecture/THREAT-MODEL.md`, `docs/07-plan/WORK-PLAN.md`, etc. |
| Unit 7 | `c862339` | Operational runbook: installation, ladder management, audit attribution, Windows `.cmd` wrapper remedy, kill switch, and troubleshooting | 1 file, 155 ins | `docs/runbooks/wake-satellite.md` |
| Unit 8 | `cfc8fe7` | ODD records: feature scope, two-round Judgment Day audit briefs (`bus-v2-f7a-audit-001`), and delivery evidence | 3 files, 261 ins | `docs/08-sessions/LOG.md`, `docs/08-sessions/HANDOFF.md`, `docs/09-odd/features/B-104-wake-satellite.md` |
| Unit 9 | `f00e8fb` | Repository bus binding: local conmuta registration for this project | 3 files, 32 ins | `conmuta.json`, `AGENTS.md`, `.gitignore` |

---

## Work Units (Delivered Retrospective Record)

### Phase 1: Wake Satellite Core Implementation

#### Unit 1 — Foundations: Constants, Ladder Store, Append-Only Ledger, and Wake Prompt
Commit: `e1ef614` (`feat(runner): add the wake satellite's ladder, ledger and wake prompt`).  
Diff: 7 files, 966 insertions, 0 deletions.  
Scope: `runner/constants.ts`, `runner/ladder.ts`, `runner/ledger.ts`, `runner/prompt.ts`, `test/runner/ladder.test.ts`, `test/runner/ledger.test.ts`, `test/runner/prompt.test.ts`.  
Requirements: `specs/wake-satellite/spec.md`, `specs/wake-ladder/spec.md`, `specs/wake-ledger/spec.md`, `specs/harness-execution-profile/spec.md`.  
Security Pinning: PT-35 (`test/runner/ladder.test.ts`), PT-36 (`test/runner/ledger.test.ts`), PT-38 (`test/runner/prompt.test.ts`).

- [x] 1.1 RED `test/runner/ladder.test.ts`: Pin fail-closed ladder resolution on missing file (`no_record`), unreadable file (`unreadable`), invalid JSON or wrong schema version (`malformed`), unknown level (`unknown_level`), unknown harness (`unknown_harness`), and unsigned record with empty note (`malformed`). Pin schema-shape isolation preventing ladder keys in `conmuta.json` (PT-35).
- [x] 1.2 GREEN `runner/constants.ts` and `runner/ladder.ts`: Define satellite constants in dedicated module `runner/constants.ts` isolated from core (declaring named constants `LADDER_SCHEMA_VERSION = 1`, `LADDER_LEVELS = ["off", "notify", "wake", "autopilot"]`, `LADDER_POLL_MS = 5_000`, `MILLISECONDS_PER_SECOND = 1_000`, `REFUSAL_REPEAT_MS = 60_000`; see reasoning in `runner/constants.ts` and `specs/wake-satellite/spec.md`). Implement `ladderPathFor`, `readLadderFile`, `writeLadderEntry`, `removeLadderEntry`, and `resolveLadder` enforcing fail-closed evaluation and mandatory `--by` operator signature.
- [x] 1.3 RED `test/runner/ledger.test.ts`: Pin append-only audit trail in `<home>/runner/wake-ledger.jsonl`, strict four-kind row vocabulary (`ladder`, `wake`, `refused`, `notify`), and invariant that no row contains peer message bodies or secret tokens (PT-36).
- [x] 1.4 GREEN `runner/ledger.ts`: Implement `wakeLedgerPathFor`, `appendLedgerRow`, `readLedgerRows`, and row constructors `wakeRow`, `refusedRow`, `notifyRow`, and `ladderRow`. Enforce directory mode `0o700` and file mode `0o600`.
- [x] 1.5 RED `test/runner/prompt.test.ts`: Pin structured prompt generator verifying that prompt names the fetch tool and project identifier, carries no peer text or bot token, strictly frames peer bodies as `<UNTRUSTED-PEER-INPUT>` data, and differentiates between `wake` (read/reply-only) and `autopilot` (confined act) profiles (PT-38).
- [x] 1.6 GREEN `runner/prompt.ts`: Implement `formatWakePrompt`, enforcing prompt ceiling constant `MAX_WAKE_PROMPT_CHARS = 2_000` (reasoning in `runner/constants.ts`) and behavioral guidance prohibiting repository modification in `wake` mode.
- [x] 1.7 RED/GREEN Regression fix in `runner/ledger.ts` (`readLedgerRows`): Handle torn, partial, or corrupted lines gracefully by skipping invalid JSON lines without throwing or losing valid historical rows, verified by `test/runner/ledger.test.ts` ("ledger: a torn or corrupt line is skipped, never fatal").
- [x] 1.8 Verify Unit 1: Build with `npm run build` and run focused unit tests `node --test "dist/test/runner/ladder.test.js" "dist/test/runner/ledger.test.js" "dist/test/runner/prompt.test.js"`.

---

#### Unit 2 — Confined Harness Execution Adapter
Commit: `8c0b5dd` (`feat(runner): add the harness adapter with a closed executable set`).  
Diff: 2 files, 513 insertions, 0 deletions.  
Scope: `runner/harness.ts`, `test/runner/harness.test.ts`.  
Requirements: `specs/harness-execution-profile/spec.md` (all requirements).  
Security Pinning: PT-37 (`test/runner/harness.test.ts`).

- [x] 2.1 RED `test/runner/harness.test.ts`: Pin spawner confinement: closed harness set (`pi`, `claude`, `codex`, `opencode`), literal argv with prompt appended as last element, execution with `shell: false`, allow-listed environment inheritance, project root cwd, and 3-shape argument refusal blocklist (PT-37).
- [x] 2.2 GREEN `runner/harness.ts`: Implement `runTurn`, `resolveHarnessSpec`, `isRefusedArgument`, and `buildHarnessEnv`. Declare named constants in `runner/constants.ts`: `HARNESS_NAMES = ["pi", "claude", "codex", "opencode"]`, `HARNESS_DEFAULT_ARGS`, `REFUSED_ARGUMENTS`, `HARNESS_ENV_ALLOW_LIST`, `WAKE_TURN_TIMEOUT_MS = 600_000` (10 min), `WAKE_KILL_GRACE_MS = 5_000` (5 s), and `MAX_TURN_OUTPUT_CHARS = 8_000` (reasoning in `runner/constants.ts` and `specs/wake-satellite/spec.md`).
- [x] 2.3 RED/GREEN Argument refusal blocklist: Enforce three-shape matching in `isRefusedArgument` covering exact equality (`arg === token`), key-value assignment (`arg.startsWith(`${token}=`)`), and attached short form (`arg.startsWith(token)` for non-`--` flags), blocking flags such as `--command=sh`, `-cwhoami`, and `--dangerously-skip-permissions=true`. Verified by `test/runner/harness.test.ts` ("harness: `--flag=value` and an attached short form are refused too, not only exact equality").
- [x] 2.4 RED/GREEN Windows `.cmd` batch shim refusal: Refuse Windows batch shims failing under `shell: false` (`EINVAL` or spawn `error` event) as outcome `{ kind: "unavailable" }` without falling back to `cmd.exe` or shell execution. Verified by `test/runner/harness.test.ts` ("harness: a launch failure is `unavailable`, never a shell fallback", "harness: an `error` event after spawn is `unavailable` too").
- [x] 2.5 RED/GREEN Turn timeout and escalation: Enforce turn execution timeout (`WAKE_TURN_TIMEOUT_MS`) with `SIGTERM` followed by `SIGKILL` after grace period (`WAKE_KILL_GRACE_MS`). Cap forwarded diagnostic output to stderr at `MAX_TURN_OUTPUT_CHARS`. Verified by `test/runner/harness.test.ts`.
- [x] 2.6 Verify Unit 2: Build with `npm run build` and run focused unit tests `node --test "dist/test/runner/harness.test.js"`.

---

#### Unit 3 — Wake Loop, Doorbell Integration, and Persistent Watermark
Commit: `828adb1` (`feat(runner): add the wake loop and its persisted watermark`).  
Diff: 4 files, 1036 insertions, 0 deletions.  
Scope: `runner/watermark.ts`, `runner/loop.ts`, `test/runner/watermark.test.ts`, `test/runner/loop.test.ts`.  
Requirements: `specs/wake-satellite/spec.md` (Requirements: Independent Watermark Tracking, Bound Enforcement, Commit-Last Cursor Semantics, Graceful Loop Termination).  
Security Pinning: PT-36 (`test/runner/loop.test.ts`).

- [x] 3.1 RED `test/runner/watermark.test.ts`: Pin independent machine-local watermark persistence in `<home>/runner/watermark.json` (`watermarkPathFor`), verifying monotonic advance, round-trip persistence, non-corruption on absent file, and isolation between bindings.
- [x] 3.2 GREEN `runner/watermark.ts`: Implement `watermarkPathFor`, `readWatermarkFile`, `readWatermarkFor`, and `writeWatermarkFor` with atomic temporary-file write pattern.
- [x] 3.3 RED `test/runner/loop.test.ts`: Pin `WakeLoop.tick` and `WakeLoop.run`: bootstrap watermark from daemon cursor seed on first run, resume from persistent watermark across restarts, idle pacing when ladder is `off` (`LADDER_POLL_MS = 5_000`), and link failure handling.
- [x] 3.4 GREEN `runner/loop.ts`: Implement `WakeLoop` linking loopback IPC via `channel/daemon-link.ts` (`readDoorbell`, `commitCursor`). Declare named constants in `runner/constants.ts`: `WAKE_COOLDOWN_MS = 10_000` (10 s), `WAKE_BUDGET_WINDOW_MS = 3_600_000` (1 h), and `WAKE_BUDGET_PER_WINDOW = 20` (reasoning in `runner/constants.ts` and `specs/wake-satellite/spec.md`).
- [x] 3.5 RED/GREEN Bounds enforcement and debounced refusals: Enforce single in-flight turn per binding, cooldown (`WAKE_COOLDOWN_MS`), and rolling 1-hour window budget (`WAKE_BUDGET_PER_WINDOW`). Implement debounced refusal logging (`REFUSAL_REPEAT_MS = 60_000`) preventing ledger flooding. Verified by `test/runner/loop.test.ts`.
- [x] 3.6 RED/GREEN Post-poll ladder re-check (kill switch race prevention): Implement double ladder resolution in `runner/loop.ts` re-reading ladder state immediately after long-poll doorbell returns to honor immediate operator deactivation. Verified by `test/runner/loop.test.ts` ("loop: the ladder is re-read after the poll — disabling during the wait stops the wake").
- [x] 3.7 RED/GREEN Cursor commit and watermark semantics: Advance local watermark on silent doorbell tick without committing daemon cursor (`commitCursor`); clear refusal memo on accepted wake; enforce commit-last cursor semantics where `commitCursor` runs only after successful turn completion (`exited`), leaving message pending on timeout or launch failure. Verified by `test/runner/loop.test.ts`.
- [x] 3.8 Verify Unit 3: Build with `npm run build` and run focused unit tests `node --test "dist/test/runner/watermark.test.js" "dist/test/runner/loop.test.js"`.

---

#### Unit 4 — Runner CLI, Packaging, and Binary Entry Point
Commit: `4334deb` (`feat(runner): add the conmuta-runner CLI and its bin entry`).  
Diff: 7 files, 897 insertions, 1 deletion.  
Scope: `runner/cli.ts`, `runner/main.ts`, `runner/tsconfig.json`, `package.json`, `tsconfig.json`, `test/runner/cli.test.ts`, `test/runner/main.test.ts`.  
Requirements: `specs/wake-satellite/spec.md` (Standalone Binary Entry Point), `specs/wake-ladder/spec.md` (CLI subcommands).  
Security Pinning: PT-34 (`test/runner/main.test.ts`), PT-35 (`test/runner/cli.test.ts`).

- [x] 4.1 RED `test/runner/cli.test.ts`: Pin CLI argument parser for `run`, `ladder set`, `ladder get`, and `ladder disable`. Verify requirement that `ladder set` mandates `--by` note, requires `--harness` for turn-starting levels, supports repeated `--arg`, and refuses unrecognized options.
- [x] 4.2 GREEN `runner/cli.ts`: Implement `parseRunnerArgs` and `runCli` with exit codes `EXIT_SUCCESS = 0`, `EXIT_FAILURE = 1`, `EXIT_USAGE = 2`, and `EXIT_UNBOUND_PROJECT = 3`.
- [x] 4.3 RED `test/runner/main.test.ts`: Pin binary entry point: walk-up binding resolution finding nearest `conmuta.json` (`resolveProjectBinding`), verification that file's `project_id` matches `--project`, IPC authentication without secrets, and single-turn mode (`--once`).
- [x] 4.4 GREEN `runner/main.ts`: Implement `runLoop` and `resolveProjectBinding`. Link daemon via loopback IPC handshake with `host: RUNNER_NAME` (`"conmuta-runner"`). Enforce graceful shutdown bounded by `RUNNER_SHUTDOWN_TIMEOUT_MS = 5_000` (reasoning in `runner/constants.ts`).
- [x] 4.5 Package wiring: Add `"conmuta-runner": "dist/runner/main.js"` to `package.json`'s `bin` map. Create `runner/tsconfig.json` extending root configuration, and register project reference in root `tsconfig.json`.
- [x] 4.6 Verify Unit 4: Build with `npm run build` and run focused unit tests `node --test "dist/test/runner/cli.test.js" "dist/test/runner/main.test.js"`.

---

### Phase 2: Bundle Isolation Assertions & Security Pinning

#### Unit 5 — Security Assertions and Pack Whitelist
Commit: `a0ea37f` (`test(security): pin the wake satellite's isolation from the core (PT-34)`).  
Diff: 3 files, 133 insertions, 4 deletions.  
Scope: `test/security/runner-bundle.test.ts`, `test/security/pack.test.ts`, `test/security/predicates.ts`.  
Requirements: CONSTITUTION §3.1, ADR-0032 (R2, R3, R7).  
Security Pinning: PT-34 (Runner bundle isolation), PT-37 (Single spawn site).

- [x] 5.1 Author static assertion PT-34 in `test/security/runner-bundle.test.ts` verifying that no core built closure (`src/daemon/main.js`, `src/client/main.js`, `src/cli/main.js`, `channel/main.js`) contains any file under `dist/runner/`.
- [x] 5.2 Author static assertion PT-34 in `test/security/runner-bundle.test.ts` verifying that `runner/main.js` links the daemon exclusively through loopback IPC (`channel/daemon-link.js`), contains zero references to `src/ledger/`, `src/daemon/`, `src/registry/`, or `src/installer/`, does not import `node:sqlite`, and restricts bare specifiers to the reviewed set (`node:child_process`, `node:crypto`, `node:fs`, `node:os`, `node:path`, `zod`).
- [x] 5.3 Author static assertion PT-34 / PT-37 in `test/security/runner-bundle.test.ts` verifying that exactly one file in the satellite closure contains `child_process` references (`runner/harness.js`).
- [x] 5.4 Update npm pack whitelist in `test/security/pack.test.ts` to include `dist/runner/**` and verify bin target `dist/runner/main.js`. Run full static suite `npm run test:static` and security bundle test `node --test "dist/test/security/runner-bundle.test.js"`.

---

### Phase 3: Governance, Constitutional Law & Threat Model

#### Unit 6 — Constitutional Amendment, ADR-0032, and Threat Model
Commit: `188bd07` (`docs(governance): sanction the wake satellite and its per-binding ladder (ADR-0032)`).  
Diff: 14 files, 524 insertions, 43 deletions.  
Scope: `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md`, `docs/03-adr/INDEX.md`, `docs/01-constitution/CONSTITUTION.md`, `docs/01-constitution/GOVERNANCE.md`, `docs/02-architecture/THREAT-MODEL.md`, `docs/00-INDEX.md`, `docs/02-architecture/OVERVIEW.md`, `docs/07-plan/WORK-PLAN.md`, `docs/06-backlog/CHECKLIST.md`, `docs/05-tribunal/INDEX.md`, `docs/05-tribunal/debates/bus-v2-b104-wake-satellite-001/`.  
Requirements: CONSTITUTION §3.1, ADR-0032.

- [x] 6.1 Author and ratify ADR-0032 in `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md` recording decisions R1–R7, implementation refinements D1–D6, and record acceptance in `docs/03-adr/INDEX.md`.
- [x] 6.2 Enact constitutional amendment in `docs/01-constitution/CONSTITUTION.md` §3.1 establishing Component Class (c) — the wake satellite, affirming that local body-less trigger signals do not constitute outbound autonomous bus emissions, and establishing the per-binding machine-local ladder doctrine.
- [x] 6.3 Document reciprocal in-part supersession on [ADR-0006](../../../../docs/03-adr/0006-autonomy-boundary.md) and [ADR-0029](../../../../docs/03-adr/0029-per-user-daemon-and-thin-clients.md) amending phase targets (`post-F6` → `F7a`) while preserving core isolation rulings verbatim.
- [x] 6.4 Update `docs/02-architecture/THREAT-MODEL.md` documenting new threats T23 (Wake storm and cost amplification), T24 (Headless turn under injection), and T25 (Silent opt-in drift), and registering security pinning tests PT-34 through PT-38.
- [x] 6.5 Update architecture documentation and roadmap: reflect satellite topology in `docs/02-architecture/OVERVIEW.md` and `docs/00-INDEX.md`; split Phase F7 in `docs/07-plan/WORK-PLAN.md` into F7a (wake satellite) and F7b (referee); mark backlog B-104 as `done` and file B-105 in `docs/06-backlog/CHECKLIST.md`.
- [x] 6.6 Record Judgment Day debate consensus for `bus-v2-b104-wake-satellite-001` in `docs/05-tribunal/INDEX.md` and record Director Notes DN-10.

---

### Phase 4: Operational Documentation, ODD Evidence & Repository Bus Binding

#### Unit 7 — Operator Runbook
Commit: `c862339` (`docs(runner): add the operator runbook for the wake satellite`).  
Diff: 1 file, 155 insertions, 0 deletions.  
Scope: `docs/runbooks/wake-satellite.md`.

- [x] 7.1 Author comprehensive operator guide `docs/runbooks/wake-satellite.md` covering architecture, per-binding opt-in ladder management (`conmuta-runner ladder`), mandatory audit attribution (`--by`), Windows `.cmd` shell-free launcher remedy, bounds configuration, kill switch operation, and troubleshooting.
- [x] 7.2 Verify runbook cross-references against code and ensure all named constants match `runner/constants.ts`.

---

#### Unit 8 — ODD Feature Records and Tribunal Audit Briefs
Commit: `cfc8fe7` (`docs(odd): record the B-104 feature, its two audit briefs and the F7a evidence`).  
Diff: 3 files, 261 insertions, 0 deletions.  
Scope: `docs/08-sessions/LOG.md`, `docs/08-sessions/HANDOFF.md`, `docs/09-odd/features/B-104-wake-satellite.md`.

- [x] 8.1 Record session 59 narrative in `docs/08-sessions/LOG.md`, detailing the two-round Judgment Day audit `bus-v2-f7a-audit-001` where 11 initial findings across two independent judges were fixed and verified with zero remaining defects.
- [x] 8.2 Update `docs/08-sessions/HANDOFF.md` with delivered state, test suite growth (+103 tests in session 59, baseline 1,738 → 1,841 tests at session close), and open B-105 items.
- [x] 8.3 Author ODD feature record `docs/09-odd/features/B-104-wake-satellite.md` capturing feature specification, audit briefs, and verified delivery evidence.

---

#### Unit 9 — Repository Bus Binding
Commit: `f00e8fb` (`chore(conmuta): record this repository's bus binding`).  
Diff: 3 files, 32 insertions, 0 deletions.  
Scope: `conmuta.json`, `AGENTS.md`, `.gitignore`.

- [x] 9.1 Register local project bus binding in repository root `conmuta.json` with project identifier `telegram-bus-agent`.
- [x] 9.2 Add conmuta bus protocol guidance block to `AGENTS.md` and ensure local runner caches are ignored in `.gitignore`.
