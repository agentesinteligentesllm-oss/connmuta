# Archive Report: Wake Satellite (F7a)

**Change**: `f7a-wake-satellite`  
**Date**: 2026-10-01  
**Archived to**: `openspec/changes/archive/2026-10-01-f7a-wake-satellite/`  
**Executed by**: Gentle AI SDD Archive Executor  
**Artifact Store**: hybrid (`openspec` filesystem + Engram persistent memory)  
**Execution Mode**: auto  
**Delivery Strategy**: auto-chain / stacked-to-main (size-exception disclosed)  
**Status**: PASS  

---

## 1. Executive Summary & Retrospective Notice

This archive report closes SDD change `f7a-wake-satellite` and composes its four capability specifications into canonical `openspec/specs/`.

### Retrospective Artifact Notice (B-105(a))
Phase F7a was **already implemented, tested, audited under Judgment Day, and pushed to `main` in session 59 (2026-09-30)** under ODD with no SDD change documents. Session 61 (2026-10-01) authored `proposal.md`, `design.md`, `tasks.md`, and four capability delta specs against the shipped code to satisfy backlog **B-105(a)**, giving F7a the same durable architectural record possessed by phases F1–F5. The artifacts record delivered behavior; they did not drive it.

Provider artifacts `apply-progress.md` and `verify-report.md` were not generated for this retrospective change. Their absence is expected, authorized by the Director, and acknowledged as valid in the SDD session preflight and native status engine (`gentle-ai.sdd-status` v2).

---

## 2. Final Task Completion Gate

The persisted tasks artifact (`openspec/changes/f7a-wake-satellite/tasks.md`) was re-read immediately prior to spec composition, report generation, and folder archiving:

- **Total Tasks**: 45
- **Completed Tasks (`[x]`)**: 45 (100%)
- **Pending Tasks (`- [ ]`)**: 0 (0%)
- **Unchecked implementation lines**: None
- **Native Status Check**: `apply: all_done`, `verify: ready`, `archive: ready`, `tasks: 45/45 complete`.

All 45 tasks carry verified delivery evidence citing commit hashes `e1ef614..f00e8fb` on `main`.

---

## 3. Delivery & Workload Audit

Phase F7a was delivered as **nine reviewable work-unit commits pushed directly to `main`** under the Director's explicit per-session authorization (recorded in `docs/08-sessions/HANDOFF.md` §0.4):

- **Tree footprint**: 44 files changed, 4,517 insertions, 48 deletions (+4,565 changed lines).
- **Core isolation**: **Zero files under `src/` were touched**. The core daemon and thin client remain completely unmodified.
- **Review workload**: Five commits individually exceeded the 400-authored-line budget; these were disclosed as size exceptions (`size:exception`) to preserve module cohesion (pairing modules with twin test suites and security assertions) rather than opening artificial chained PRs.

### Delivered Work Units on `main`

| # | Commit | Summary | Scope | Changed Lines |
|---|---|---|---|---|
| 1 | `e1ef614` | Satellite foundations: ladder store, append-only JSONL ledger, and wake prompt | `runner/{constants,ladder,ledger,prompt}.ts`, twin tests | 7 files, +966 / -0 |
| 2 | `8c0b5dd` | Confined harness adapter: spawner, closed executable set, literal argv, `shell: false`, 3-shape argument refusal | `runner/harness.ts`, twin tests | 2 files, +513 / -0 |
| 3 | `828adb1` | Autonomous wake loop, doorbell polling, double ladder check, bounds, persistent watermark | `runner/{watermark,loop}.ts`, twin tests | 4 files, +1036 / -0 |
| 4 | `4334deb` | Runner CLI (`conmuta-runner`), subcommands (`run`, `ladder`), third bin packaging | `runner/{cli,main,tsconfig.json}`, `package.json`, twin tests | 7 files, +897 / -1 |
| 5 | `a0ea37f` | Security pinning (PT-34): bundle isolation, zero core reach to runner, zero runner reach to SQLite | `test/security/{runner-bundle,pack,predicates}.ts` | 3 files, +133 / -4 |
| 6 | `188bd07` | Governance ratification: ADR-0032, CONSTITUTION §3.1 amendment (Class c), THREAT-MODEL (T23–T25, PT-34–PT-38) | `docs/03-adr/0032*`, `docs/01-constitution/*`, `docs/02-architecture/*` | 14 files, +524 / -43 |
| 7 | `c862339` | Operational runbook: installation, ladder management, attribution, Windows `.cmd` remedy | `docs/runbooks/wake-satellite.md` | 1 file, +155 / -0 |
| 8 | `cfc8fe7` | ODD records: B-104 feature scope, two-round Judgment Day briefs, F7a evidence | `docs/08-sessions/{LOG,HANDOFF}.md`, `docs/09-odd/features/B-104*` | 3 files, +261 / -0 |
| 9 | `f00e8fb` | Repository bus binding: local conmuta registration for this project | `conmuta.json`, `AGENTS.md`, `.gitignore` | 3 files, +32 / -0 |

---

## 4. Tribunal Audit & Quality Assurance

- **Audit Process**: Audited under Judgment Day debate `bus-v2-f7a-audit-001` with two independent blind judges (`jd-judge-a` and `jd-judge-b`).
- **Defect Resolution**:
  - **Round 1**: Identified 11 real defects (4 CRITICAL: argument refusal prefix bypass, long-poll ladder demotion race, silent doorbell polling spin, and cursor over-commitment on failed turns).
  - Every single defect was remediated with an explicit regression test twin under `test/runner/`.
  - **Round 2**: Evaluated the remediated codebase; both judges returned zero findings.
  - **Terminal Verdict**: APPROVED.

### Test Suite State (Pre-Archive Baseline)
- `npm run build`: Clean build (`tsc -b`, exit code 0).
- `npm test`: 1,841 tests total (1,835 passing, 0 failing, 6 skipped).
- `npm run test:static`: 99/99 static assertions passing.
- **Phase Contribution**: The satellite test suite added 86 tests directly in session 59 (reaching 1,824 at commit `f00e8fb`, against session-58 baseline of 1,738).

---

## 5. Canonical Spec Composition

The four delta specifications define four brand-new capabilities. Composition created four new canonical capability directories under `openspec/specs/`:

| Capability Domain | Canonical Path | Requirements | Scenarios | Status |
|---|---|---|---|---|
| `harness-execution-profile` | `openspec/specs/harness-execution-profile/spec.md` | 10 | 10 | Created (New) |
| `wake-ladder` | `openspec/specs/wake-ladder/spec.md` | 7 | 11 | Created (New) |
| `wake-ledger` | `openspec/specs/wake-ledger/spec.md` | 6 | 9 | Created (New) |
| `wake-satellite` | `openspec/specs/wake-satellite/spec.md` | 11 | 13 | Created (New) |
| **Total** | | **34** | **43** | **4 New Capabilities** |

- **Diff Verification**: All 4 canonical specs match their delta counterparts byte-for-byte (`diff -u` returned empty diffs).
- **Destructive Delta Guard**: Zero requirements were REMOVED or MODIFIED. All requirements are ADDED.
- **Spec Collision Check**: No collisions. The 18 pre-existing canonical specifications under `openspec/specs/` were preserved intact without modifications.

---

## 6. Post-Apply Operational Facts & Real-World Validation

1. **Live Wake Loop Proven End-to-End**:
   The wake path has been proven live in production on this machine with the `pi` harness:
   - The `frisco` project binding was armed at level `wake (pi)`.
   - A live bus `BROADCAST` from peer `@rodrigo-agent` produced exactly one `wake` row in `wake-ledger.jsonl` with `outcome: exited`.
   - The runner's persistent watermark advanced from 24 to 25.
   - The autonomous wake turn successfully invoked `conmuta_fetch`, processed the untrusted peer input, and replied to the thread on the bus via `conmuta_send`.
2. **Windows `.cmd` Shim Resolution**:
   On Windows, npm-installed harness CLI batch shims (`.cmd`) fail under `spawn(bin, argv, { shell: false })` with `EINVAL`. The runner handles this strictly by resolving turn outcome to `{ kind: "unavailable" }` without shell wrapping, keeping the message pending. The documented operational remedy is placing a shell-free binary launcher on the runner process's `PATH`.

---

## 7. Out-of-Scope Items & Open Backlog Trackers

- **B-105(b)**: The argument lists for `claude`, `codex`, and `opencode` are implemented per the approved RFC, but have not yet been executed against installed CLI binaries.
- **B-106**: Daemon IPC session pool cap (64 concurrent sessions in-memory) measured under multi-session runner usage.
- **B-107**: Daemon session release mechanism on runner process shutdown.

---

## 8. Archive Move Verification

- **Source**: `openspec/changes/f7a-wake-satellite/`
- **Destination**: `openspec/changes/archive/2026-10-01-f7a-wake-satellite/`
- **Archived Tree Contents**:
  - `proposal.md` (Proposal document and constitutional basis)
  - `design.md` (Design architecture, D1–D9 decisions, security pinning)
  - `tasks.md` (45/45 completed tasks with per-commit delivery evidence)
  - `specs/harness-execution-profile/spec.md` (Delta spec)
  - `specs/wake-ladder/spec.md` (Delta spec)
  - `specs/wake-ledger/spec.md` (Delta spec)
  - `specs/wake-satellite/spec.md` (Delta spec)
  - `archive-report.md` (This closing report)
- **Active Changes Clean**: Only `openspec/changes/archive/` remains under `openspec/changes/`.

---

## 9. SDD Cycle Closure

Change `f7a-wake-satellite` is fully planned, delivered, audited, canonicalized in `openspec/specs/`, and archived. Backlog item **B-105(a)** is formally satisfied.
