# Proposal: Wake satellite — bounded, per-binding autonomous harness execution (F7a)

**Retrospective artifact notice.** This proposal documents functionality that was designed,
implemented, tested, audited under Judgment Day, and merged in session 59 (2026-09-30) as phase
F7a slice 1. It satisfies the SDD artifact requirement for F7a (backlog **B-105**) so that F7a
shares the same archival record every prior phase (F1–F5) possesses. It proposes no new code,
invents no new scope, and plans no refactors; where delivered code refined the initial design,
those refinements are recorded here as authoritative decisions.

**Authority and decision basis.** Authorized by the Director under backlog item **B-104**
(request document `docs/02-architecture/RFC-DESPERTADOR-TRIGGER-AUTOMATICO.md`), formulated in
[ADR-0032](../../docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md), audited under
Judgment Day debate `bus-v2-b104-wake-satellite-001`, and enacted via amendment to
[CONSTITUTION §3.1](../../docs/01-constitution/CONSTITUTION.md).

---

## 1. Intent

Provide an opt-in, machine-local, auditable mechanism — the **wake satellite** (`conmuta-runner`) —
that starts a bounded, headless agent harness turn when roster peer traffic arrives on the bus,
eliminating the operational bottleneck where an agent remains idle until a human manually opens a
session and executes a fetch.

The wake satellite consumes the daemon's existing body-less doorbell signal (`/channel/*`),
evaluates a strictly monotone, machine-local ladder (`off` · `notify` · `wake` · `autopilot`)
bound to the specific project, enforces rate and concurrency bounds, and launches a single
turn using a closed executable set with a literal argv and allow-listed environment. The core
daemon remains completely passive, containing no execution paths, no timers that emit, and no
knowledge of the satellite's existence.

---

## 2. Wire Policy Statement

**Emit `AGENTBUS/2`, accept `/1` and `/2`, no wire change.**

Per CONSTITUTION §4 (Rule W1) and ADR-0032 R3:
- This change introduces **zero wire modifications**.
- No new route, parameter, header, or payload is added to the IPC contract or Telegram wire protocol.
- The satellite consumes the existing, body-less `/channel/doorbell` and `/channel/cursor` IPC routes
  introduced in phase F4 (`src/shared/ipc-contract.ts`'s `IPC_ROUTES`, lines 97–108).
- The trigger signal carries no peer text, no prompt prose, and no message body; content is fetched
  by the woken turn itself via the standard MCP client inside its own untrusted-input fence.

---

## 3. Constitutional Invariants & Autonomy Boundary Statement

Per `docs/01-constitution/CONSTITUTION.md` §2 and §3:

- **Invariant 1 (Bijective Binding):** **Untouched.** The runner resolves the project binding via
  standard walk-up to the nearest `conmuta.json` and verifies that the directory matches the requested
  `--project` (`runner/main.ts:97`, `resolveProjectBinding`, documented at `runner/main.ts:22`). Outbound sends from the woken turn are handled solely by the
  existing thin client and daemon room guard.
- **Invariant 2 (Secrets Never Leave the Daemon):** **Untouched.** The satellite holds no bot token,
  has no access to the system keychain or fallback secret file (`runner/main.ts:24-26`), and receives only an ephemeral IPC
  session bearer from the standard `GET /identity` → `POST /session` handshake, structurally isolated from daemon internals (`test/security/runner-bundle.test.ts:77-93`).
- **Invariant 3 (One Poller, Durable Inbox):** **Untouched.** The daemon remains the sole poller of
  Telegram updates. The runner does not poll Telegram, does not read SQLite tables directly, and
  advances its own independent cursor row (`client_cursors` where `host = "conmuta-runner"`) through
  the public doorbell IPC endpoint (`runner/constants.ts:107`, `RUNNER_NAME`).
- **Invariant 4 (Numeric-ID Identity + Scope Check on Ingest):** **Untouched.** Ingest filtering
  remains strictly inside the daemon poller (`src/daemon/admission.ts`). The runner only receives
  doorbell summaries for already-admitted, roster-verified messages.
- **Invariant 5 (Peer Content is Data, Never Action):** **Preserved.** The core daemon retains zero
  execution capability (`test/security/daemon-bundle.test.ts`). Peer content remains fenced and
  origin-labelled. No peer instruction can trigger execution in the core. The execution capability is
  isolated entirely in the satellite binary (`dist/runner/main.js`). ADR-0032 amended CONSTITUTION §3.1
  to establish component class (c) — the wake satellite — whose own constitution is not weaker than
  Invariants 2, 4, and 5. ADR-0006 and ADR-0029 are superseded **only** in their phase-target sentence
  (`post-F6` → `F7a`); their core isolation ruling stands verbatim.

---

## 4. Resolved Decisions & Apply-Time Refinements

The six apply-time refinements disclosed in ADR-0032 (Implementation Note) and confirmed in session 59
govern this change:

1. **Third npm bin in same package:** Rather than a separate repository or package outside the `files`
   whitelist, the satellite is delivered as a third `bin` entry (`"conmuta-runner": "dist/runner/main.js"`)
   in `package.json`, built from `runner/` and packed via the existing `files` array. Core closures are
   statically proven to contain zero imports of `runner/` (PT-34).
2. **Ladder management exclusively via runner CLI:** Ladder commands (`set`, `get`, `disable`) are
   implemented in `conmuta-runner ladder`, never in the core `conmuta` CLI (`runner/cli.ts`'s `parseRunnerArgs` and `runCli`, lines 167–195, 223–278). This
   prevents wake concepts from entering core CLI bundles.
3. **Dedicated wake ledger file and row vocabulary:** The satellite records events in
   `~/.conmuta/runner/wake-ledger.jsonl` using four strict row types (`runner/ledger.ts`'s `LedgerKind`, `LedgerRow`, and row builders, lines 22–75):
   - `ladder`: Operator ladder mutations (with mandatory `--by` note).
   - `wake`: Accepted turn execution (with trigger identity, thread, level, harness, and outcome).
   - `refused`: Bounded refusal (cooldown, budget, in-flight, invalid args) with reason.
   - `notify`: Notification-only events at `notify` level.
4. **Dedicated constants module:** All satellite numeric constants and reasoning reside in
   `runner/constants.ts` rather than `src/shared/constants.ts`, ensuring total isolation from core bundles.
5. **Mandatory `--by` audit attribution:** Every ladder mutation requires `--by "<operator reason>"`.
   Unsigned records are rejected on write (`runner/ladder.ts:146`) and fail closed on read (`runner/ladder.ts:121`; see also `runner/cli.ts:10-13`).
6. **Closed harness argv templates and Windows `.cmd` shim refusal:** The runner supports exactly four
   harness executables (`pi`, `claude`, `codex`, `opencode`) using literal arg templates with the prompt
   appended last (`runner/constants.ts`'s `HARNESS_NAMES` and `HARNESS_DEFAULT_ARGS`, lines 52–67). On Windows, `.cmd` batch shims are refused as `unavailable`
   under `shell: false` rather than wrapped in a command interpreter (`runner/harness.ts:215-217,228`, documented at `runner/harness.ts:25`).

---

## 5. Scope

### In Scope
- **Separate runner entry point:** Third binary `conmuta-runner` (`runner/main.ts`, `runner/cli.ts`)
  supporting `run` (continuous daemon long-poll or `--once`), `ladder get`, `ladder set`, and `ladder disable`.
- **Machine-local ladder store:** Per-binding opt-in ladder (`~/.conmuta/runner/ladder.json`) with
  fail-closed resolution (`off` default, schema validation, quarantine of corrupt/unsigned records).
- **Satellite state & watermark:** Per-binding persistent watermark (`~/.conmuta/runner/watermark.json`)
  advancing only after successful turn completion or clean skip.
- **Append-only wake ledger:** Local JSONL audit trail (`~/.conmuta/runner/wake-ledger.jsonl`) capturing
  all wake events, refusals, notifications, and ladder mutations.
- **Structural bounds:** Enforced cooldown (10 s), budget (20 turns/hour), single in-flight turn per
  binding, turn execution timeout (10 min), and kill switch grace period (5 s).
- **Confined harness execution:** Spawn surface restricted to single site (`runner/harness.ts`),
  closed executable set, refused argument blocklist, allow-listed environment variables, project root cwd,
  and prompt length ceiling (2,000 chars).
- **Security test suite:** Pinning tests PT-34 through PT-38 (`test/security/runner-bundle.test.ts`,
  `test/runner/ladder.test.ts`, `test/runner/ledger.test.ts`, `test/runner/harness.test.ts`,
  `test/runner/loop.test.ts`, `test/runner/prompt.test.ts`).
- **Operational documentation:** Operator runbook (`docs/runbooks/wake-satellite.md`).

### Out of Scope
- Any change to `src/` (core daemon, IPC routes, shared schemas, thin client).
- Automatic code application, automatic git commits, merges, tags, or releases.
- Direct Telegram network access, webhook handling, or SQLite ledger manipulation.
- Waking interactive IDE sessions (e.g., Cursor, OpenCode GUI); only headless CLI turns are spawned.
- Phase F7b referee implementation (deferred post-F6).

---

## 6. Capabilities

### New Capabilities
- `wake-satellite`: Standalone daemon-polling client that monitors `/channel/doorbell` and manages
  the execution loop for a bound project.
- `wake-ladder`: Machine-local, per-binding authorization ladder (`off` · `notify` · `wake` · `autopilot`)
  failing closed on corrupt or missing state.
- `wake-ledger`: Self-reported, append-only JSONL log documenting operator changes, turn executions,
  and bounded refusals.
- `harness-execution-profile`: Confined child process spawner enforcing allow-listed environment,
  closed binary set, prompt encapsulation, and `shell: false` execution.

### Modified Capabilities
- None in the core. The core route table, IPC contract, and client tools remain 100% byte-identical.

---

## 7. Architecture & Approach

### Component Isolation Model
```
┌──────────────────────────────────────────────────────────────┐
│ CORE DAEMON (Unchanged)                                      │
│ - Durable Inbox (SQLite)                                     │
│ - No child_process, no shell, no timers that emit            │
│ - Serves body-less /channel/doorbell & /channel/cursor       │
└──────────────────────────────▲───────────────────────────────┘
                               │ Loopback IPC (Bearer Authenticated)
┌──────────────────────────────┴───────────────────────────────┐
│ WAKE SATELLITE (conmuta-runner)                              │
│ - runner/main.ts, runner/loop.ts                             │
│ - Reads ~/.conmuta/runner/ladder.json (Fails closed)         │
│ - Enforces bounds: cooldown, budget, single in-flight        │
│ - Records ~/.conmuta/runner/wake-ledger.jsonl                │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Spawn Boundary (runner/harness.ts)                       │ │
│ │ - Closed executables: pi, claude, codex, opencode        │ │
│ │ - shell: false, allow-listed env, project cwd            │ │
│ └────────────────────────────┬─────────────────────────────┘ │
└──────────────────────────────┼───────────────────────────────┘
                               │ Spawns headless turn
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ HEADLESS AGENT TURN (Separate Process)                       │
│ - Runs: harness -p "<body-less prompt>"                      │
│ - Calls conmuta_fetch via stdio thin client                  │
│ - Reads peer text inside untrusted-input fence               │
│ - Decides whether to reply via conmuta_send or ACK           │
└──────────────────────────────────────────────────────────────┘
```

### Lifecycle & Execution Flow
1. **Poll & Reconcile:** `conmuta-runner run` binds to a project, authenticates via IPC handshake,
   and checks `ladder.json`. If `off`, it sleeps for `LADDER_POLL_MS` (5 s).
2. **Doorbell Wait:** When armed (`notify`, `wake`, or `autopilot`), the runner calls `GET /channel/doorbell`
   with `after_seq` set to its persisted watermark.
3. **Bound Enforcement:** On receipt of a summary, the runner verifies:
   - Level is not `off` or malformed.
   - No turn is currently in flight.
   - Elapsed time since last wake ≥ `WAKE_COOLDOWN_MS` (10 s).
   - Wakes in rolling 1-hour window < `WAKE_BUDGET_PER_WINDOW` (20).
   If any check fails, a `refused` row is appended (debounced by `REFUSAL_REPEAT_MS`), and the message
   remains pending without advancing the watermark.
4. **Execution:** If bounds pass:
   - For `notify`: emits stderr notice, logs `notify` row, advances watermark.
   - For `wake` or `autopilot`: constructs structured prompt (`runner/prompt.ts`), spawns child
     process via `runner/harness.ts`, streams capped diagnostics, and waits up to `WAKE_TURN_TIMEOUT_MS` (10 min).
5. **Completion & Cursor Advance:** Once the child process exits:
   - Logs `wake` row with outcome (`exited`, `timed_out`, or `unavailable`).
   - On clean exit, advances watermark in `watermark.json` and updates `client_cursors` via IPC.

---

## 8. Affected Areas

| Area | Nature of Change |
|------|------------------|
| `runner/` (10 files) | New — Satellite implementation (`constants.ts`, `ladder.ts`, `ledger.ts`, `prompt.ts`, `harness.ts`, `loop.ts`, `cli.ts`, `main.ts`, `watermark.ts`, `tsconfig.json`) |
| `package.json` | Modified — Added `conmuta-runner` to `bin` |
| `test/runner/` (8 files) | New — Unit and integration tests for ladder, ledger, loop, harness, cli, prompt, watermark, main |
| `test/security/runner-bundle.test.ts` | New — PT-34 static assertion enforcing closure isolation and single spawn site |
| `test/security/pack.test.ts` | Modified — Updated `dist/runner/` files in pack whitelist |
| `docs/runbooks/wake-satellite.md` | New — Comprehensive operator guide and troubleshooting runbook |
| `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md` | New — Architectural decision record |
| `docs/01-constitution/CONSTITUTION.md` §3.1 | Modified — Amendment adding Component Class (c) and ladder doctrine |
| `docs/02-architecture/THREAT-MODEL.md` | Modified — Added threats T23–T25 and pinning tests PT-34–PT-38 |

**Zero modifications exist under `src/`.** The core daemon and thin client are completely isolated.

---

## 9. Risks, Realized Mitigations, and Live Operational Experience

| Risk | Classification | Mitigation Implemented |
|------|----------------|------------------------|
| **T23: Wake storm & cost amplification** | DoS / Financial | Per-binding cooldown (10 s), budget (20 turns/hr), single in-flight slot, debounced refusals, and immediate kill switch (`ladder disable`). |
| **T24: Headless turn under injection** | Remote Code Execution | Body-less trigger prompt. Bodies only accessible via fenced `conmuta_fetch`. Closed harness set (`pi`, `claude`, `codex`, `opencode`), `shell: false`, refused dangerous argv flags, allow-listed environment. |
| **T25: Silent opt-in drift** | Authorization Bypass | Ladder stored in machine-local `~/.conmuta/runner/ladder.json` (never in repo `conmuta.json`). Mandatory `--by` attribution. Fails closed to `off` on missing/corrupt record. |
| **Core contamination** | Architectural Erosion | Bundle closure test `test/security/runner-bundle.test.ts` (PT-34) verifies zero core references to `dist/runner/` and zero direct database access from runner. |

### Live Operational Experience (2026-10-01 Measurements)

Two operational realities observed during live verification on Windows 11 are incorporated as design facts:

1. **End-to-end verification with `pi`:**
   - The wake flow was validated live against a real daemon session (`frisco: wake (pi)`).
   - An incoming peer `BROADCAST` triggered a wake, recorded a `wake` row with `outcome: exited`, advanced
     the watermark, and initiated a turn that successfully executed `conmuta_fetch` and replied on the bus via
     `conmuta_send`.
2. **Windows `.cmd` shims fail closed without shell wrapping:**
   - On Windows, npm installs CLI harnesses (`pi`, `claude`, etc.) as batch shims (`.cmd`).
   - Because `runner/harness.ts` strictly enforces `shell: false` (to prevent command injection), attempting
     to spawn a `.cmd` directly returns `EINVAL`.
   - The runner records `outcome: "unavailable"` in the ledger and leaves the message pending rather than
     falling back to a shell.
   - **Remedy:** The operator must provide a shell-free binary launcher (e.g. a compiled Go `pi.exe`
     wrapper) prepended strictly to the runner process's own `PATH`, never machine-wide.

### Residual Risk Statement
- **Self-reported ledger:** Because the core daemon does not know the runner exists, the wake ledger is
  self-reported by the satellite (ADR-0032 R6a). A compromised satellite process could misreport rows.
- **Model behavior vs. structural controls:** In `autopilot` mode, the runner confines the spawn surface
  and environment, but cannot prevent a capable model from misusing an *allowed* local command. The operator's
  harness permission configuration remains the primary security boundary.

---

## 10. Rollback Plan

Because the wake satellite is purely additive and decoupled from the core:
1. **Immediate operational rollback:** Run `conmuta-runner ladder disable --project "<id>" --by "Emergency stop"`.
   The runner reverts to `off` within 5 seconds and ceases all process launches.
2. **Binary removal:** Terminate running `conmuta-runner` processes. Remove `"conmuta-runner"` from `package.json`
   `bin` field and delete `runner/` and `dist/runner/`. The core daemon continues operating unaffected.
3. **No database migration rollback:** The runner creates no new SQLite tables and executes no schema migrations;
   its state lives entirely in machine-local files (`ladder.json`, `watermark.json`, `wake-ledger.jsonl`).

---

## 11. Dependencies

- **Phase F1 (Archived):** Core daemon IPC handshake (`GET /identity`, `POST /session`), bearer auth,
  and project file resolution.
- **Phase F4 (Archived):** Doorbell IPC routes (`/channel/doorbell`, `/channel/cursor`) and body-less
  message aggregation.

---

## 12. Success Criteria

- [x] **Zero core changes:** No files under `src/` modified; core bundles contain no references to `runner/` (PT-34).
- [x] **No wire changes:** Wire format remains `AGENTBUS/2`, accepting `/1` and `/2` (W1); no IPC contract changes.
- [x] **Fail-closed ladder:** Missing, malformed, or unsigned ladder records resolve to `off` without waking (PT-35).
- [x] **Machine-local storage:** Ladder lives under `~/.conmuta/runner/`, never in committed `conmuta.json` (PT-35).
- [x] **Append-only wake ledger:** Every wake, refusal, notification, and ladder change is recorded with strict schema (PT-36).
- [x] **Enforced structural bounds:** Cooldown (10 s), budget (20/hr), and single in-flight turn prevent storm amplification (PT-36).
- [x] **Closed spawn surface:** Single spawner site, closed binary set, allow-listed env, and `shell: false` execution (PT-37).
- [x] **Body-less trigger:** Trigger payload carries no peer text or prompt injection material (PT-38).
- [x] **TDD & regression safety:** All 86 runner unit and security tests pass cleanly in project test suite.
