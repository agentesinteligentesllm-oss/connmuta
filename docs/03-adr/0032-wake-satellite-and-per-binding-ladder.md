# ADR-0032 — Wake satellite and the per-binding wake ladder (`off` · `notify` · `wake` · `autopilot`)

## Status

`proposed` — reviewed under the tribunal's documented substitute for an unreachable Arena (Judgment
Day: `jd-judge-a`, `jd-judge-b`, plus independent verification) in debate
`bus-v2-b104-wake-satellite-001`, pending Director confirmation. **Implemented as F7a slice 1 on
2026-09-30** — see the Implementation note at the end, which also discloses six apply-time
refinements. It amends
[CONSTITUTION.md](../01-constitution/CONSTITUTION.md) §3 and supersedes, in
part only (the phase target sentence), [ADR-0006](0006-autonomy-boundary.md) and
[ADR-0029](0029-per-user-daemon-and-thin-clients.md).

## Date

2026-09-30

## Debate

`bus-v2-b104-wake-satellite-001`. Record: [../05-tribunal/INDEX.md](../05-tribunal/INDEX.md).

The Arena bridge was unreachable at this session's start — a real tool-level connection failure
(`mcp connect arena` → *nothing is listening at `http://127.0.0.1:8765/mcp`*), not a `curl` guess —
which satisfies DN-09's substitute condition directly, exactly as sessions 55–58 recorded. The audit
of this ADR therefore ran under **Judgment Day** (`jd-judge-a`, `jd-judge-b`, plus independent
verification), disclosed as a DN-05 waiver in the tribunal record.

## Context

The Director instructed on 2026-09-30 that the bus must wake an agent's turn by itself when a roster
peer sends a `BROADCAST` or addresses that agent, instead of waiting for a human to open the session
and fetch (backlog **B-104**; request document
[../02-architecture/RFC-DESPERTADOR-TRIGGER-AUTOMATICO.md](../02-architecture/RFC-DESPERTADOR-TRIGGER-AUTOMATICO.md)).
The Director also asked that the "notify a human only" shape and a "piloto automático" mode be the
user's own per-binding choice.

Verified facts that constrain any answer:

| Fact | Evidence |
|---|---|
| The core may not execute: no exec, no shell, no tool invocation, no timer that emits. | [CONSTITUTION.md](../01-constitution/CONSTITUTION.md) §3 layers 1–2; [ADR-0006](0006-autonomy-boundary.md) (Alpha objection n1, accepted); [ADR-0029](0029-per-user-daemon-and-thin-clients.md) "Options considered" |
| The threat this forbids is indirect prompt injection from Telegram becoming remote code execution on the developer machine. | [THREAT-MODEL.md](../02-architecture/THREAT-MODEL.md) T17 |
| **The detection half already ships.** The F4 doorbell selects exactly `via === "direct" \|\| type === "BROADCAST" \|\| to === agentId`, with the sender verified against the binding roster by `reverseRosterLookup`, and answers a body-less, closed-key-set summary. | `src/daemon/serve/doorbell.ts` (module doc + `isRelevant`); `src/shared/ipc-contract.ts:97-108` (the closed ten-route set — `/identity`, `/session`, `/tools/*`, `/doctor`, `/channel/{doorbell,cursor}`; no `/events/*` family and none added) |
| No wake endpoint is missing: a local client can already arm that doorbell with a bounded long-poll, the same substrate `POST /tools/fetch` uses. | `src/daemon/serve/fetch.ts` `effectiveWaitSeconds`/`waitForInboxRows`; `src/shared/constants.ts:86` (`MAX_LONGPOLL_SECONDS`) and `:94` (`FETCH_LONGPOLL_MAX_SECONDS`) |
| The daemon's `audit_log` has no column for a thread, a ladder level or an action, and no route lets an out-of-core component append to it. | THREAT-MODEL T10 (the `audit_log` field list); `src/shared/ipc-contract.ts:97-108` (no write route of that shape); `src/daemon/serve/doorbell.ts` (D2: the read writes nothing) |
| `conmuta.json` is a committed, id-only project file. The live file holds only `schema_version`, `project_id`, `group_id`, `roster`. | CONSTITUTION §3 (D5); `src/shared/project-file.ts`; the repository's own `conmuta.json` |
| A woken, headless turn has no human at the permission prompt. | The fence is a labelling control, not a safety guarantee (THREAT-MODEL T06, ADR-06 layer 7, "Mitigation"); a headless host has no interactive prompt to fall back on |
| The private group and the roster filter **who may send**; they say nothing about the content a legitimately rostered peer carries, and a peer's own context can be poisoned. | THREAT-MODEL §1.3 X1; T06 |

The RFC's own two defects, corrected here rather than implemented:

1. **RFC §4.1** proposes `runner.{enabled,harness,trigger_on,cooldown_seconds}` inside `conmuta.json`.
   That file is committed, id-only and read by strangers (D5, THREAT-MODEL T12/T03). An execution
   policy is machine-local and belongs under the daemon home; putting it in a committed file would also
   make one operator's pilot-automatic choice a repository fact.
2. **RFC §2** rests on the private group, the roster and the agent's discernment as the safety
   argument. The first two are an **access** filter, the third is a **behaviour**. Neither bounds what a
   woken turn may do; only its capability profile does. The amendment below is written so that the
   control is the profile, and so that the fence stays what it has always been documented as: a
   mitigation, never a control.

## Options considered

| Option | Trade-off | Why rejected / chosen |
|---|---|---|
| **A. Keep the runner out entirely; leave the function unimplemented** | Zero new risk, and the core's invariants stay untouched. | Rejected. The Director ordered the capability, the operational cost of not having it is real, and the risk can be located outside the core by construction. |
| **B. Move the exec capability into the core** (the daemon wakes agents itself) | One process, simplest operations, no second package. | Rejected. It is exactly objection n1: it puts an arbitrary-execution path inside the component that holds every bot token, with no separate constitution, no unit boundary and no way to ship the core to a user who does not want it. |
| **C. Sanction a separate wake satellite that consumes the existing body-less doorbell, with a per-binding ladder, default `off`** | The capability exists; the core gains no route, no wire change, no exec, no timer; the risk lives in a separate, opt-in, auditable component with its own constitution. | **Chosen.** |
| **D. Notify a human, never start a turn** | Least risk; still removes the "nobody knows" delay. | Chosen as ladder level `notify`, not as the whole answer — the Director wants the turn to start. |

## Decision

A component outside the core — the **wake satellite** — may start a harness turn on a local, body-less
wake signal, subject to a per-binding ladder whose default is `off`; the core keeps its layer 1–3
isolation verbatim, gains no new route and no wire change, and never learns that a satellite exists.

Rules this ADR fixes:

- **R1 — The core is unchanged.** CONSTITUTION §3 layers 1–3 and the invariants stand verbatim. No
  `child_process`, no shell, no tool invocation, no timer that emits, no settings or permissions write,
  and no `deleteMessage` enters a core bundle. Every existing static assertion (PT-27, PT-28 and the
  bundle-closure tests) stays enforced and none is relaxed or released.
- **R2 — Three component classes.** (a) The **core**: daemon, thin stdio client, installer/doctor,
  local web panel. (b) **Doorbell adapters**: body-less consumers, of which the F4 Claude Code adapter
  is the shipped example. (c) The **wake satellite**: the only component that may spawn a harness
  process. It ships as its own `bin` outside the core's bundles, exactly as the F4 adapter does, and
  **the core's built closures must contain no reference to it** (pinned by PT-34). See the
  Implementation note at the end of this ADR for why "its own `bin`" replaced an earlier "outside the
  package and `files` whitelist" phrasing.
- **R3 — The trigger path carries no prose.** The satellite consumes only the body-less local wake
  signal family the daemon already serves (`/channel/*`, unchanged; no new route, no IPC contract
  change, no wire change). It holds no bot token, never calls the Telegram API, never reads the ledger
  or the `updates` table directly, and writes no daemon state — the daemon does not know it exists and
  records nothing about it. Bodies reach a turn only through the thin client's `fetch`, inside the turn,
  fenced and origin-labelled as `UNTRUSTED-PEER-INPUT`.
- **R4 — Opt-in is a human action, machine-local.** The ladder lives per **binding** under the daemon
  home (`~/.conmuta/`), never in the committed `conmuta.json` (D5 preserved and pinned by PT-35). It is
  written only by an explicit, audit-logged human action through the `conmuta` CLI or the panel. A
  binding with no ladder record is `off` — and so is a record that is missing, unreadable, malformed or
  names an unknown level: the ladder **fails closed**, and the resolution is counted and surfaced rather
  than silent (ADR-0015's validate/quarantine doctrine applies to the satellite's own state file).
  Nothing in the satellite, the daemon or the bus may raise it.
- **R5 — The ladder is monotone, and its default is the safest useful level.** `off` (default; no wake
  signal acted on) → `notify` (a local notification to the human; **no turn is started**) → `wake` (one
  turn, started in the read/reply-only profile: read the inbox, read the repository, reply or `ACK` over
  the bus) → `autopilot` (one turn, started in a declared **act** profile). Level names, the ladder
  record's shape and every bound's value are named constants fixed in the F7a spec (CONSTITUTION §5) —
  never in this ADR, so no number here can drift from the code.
- **R6 — Bounds are structural, not advisory.** Per-binding wake cooldown, a per-window wake budget, at
  most one turn in flight per binding, and a kill switch that returns the binding to `off` — each a
  named constant with its reasoning, values fixed in the F7a spec. The satellite keeps its **own**
  append-only **wake ledger** under its own home: exactly one row per accepted wake, naming the trigger's
  verified identity, the thread, the ladder level and the action taken — never a body, never a token. A
  refused wake is a counted refusal with a reason, never a silent drop (pinned by PT-36).
- **R6a — What the daemon cannot attest to.** That wake ledger is **self-reported by the satellite**. The
  daemon does not know the satellite exists (R1, R3), exposes no route by which an out-of-core component
  appends to its own `audit_log`, and that table's schema carries no column for a thread, a ladder level
  or an action (THREAT-MODEL T10). The daemon's `audit_log` therefore keeps recording only what the daemon
  itself does — send, receive, reject — and **no clause of this ADR claims a daemon-attested wake
  record.** A future daemon-side wake record would be an IPC contract change and needs its own ADR; it is
  out of F7a's scope.
- **R7 — The act profile (`autopilot`).** Enforced by the spawn surface: the binding's own project worktree as
  the working directory, a closed executable set, an argv that cannot carry a shell/an interpreter/a
  permission-bypass flag, an allow-listed environment, and a bounded turn (PT-37). Instructed by the prompt
  and refused by the harness's own configuration: no `git push`, `merge`, `tag` or release; no settings or
  permissions file; no secret-store read; no `deleteMessage`; no admin role; no send to any room other than
  the binding's group. The runner invokes no version-control command itself, so there is no call site for a
  static assertion to forbid the second list — see PT-37's own correction and CONSTITUTION §3.1.
- **R8 — The satellite's own constitution is not weaker than invariants 2, 4 and 5**, and it may not
  weaken the core's layers 1–3. Its own threat model and its own pinning tests are F7a deliverables;
  the rows T23–T25 added to the core threat model are the core-side consequences of sanctioning it.
- **R9 — Nothing is applied automatically.** A woken turn's conclusions reach the bus only as ordinary
  sends, and any code change remains a human-authorized commit and merge (GOVERNANCE §6, §8; invariant 5
  unchanged: the bus authorizes nothing, `CONSENSUS` is a message).
- **R10 — Phase.** The satellite is **F7a** (`f7a-wake-satellite`), depending on F1 and on F4's shipped
  doorbell — **not** on F6, whose blockers are commercial (B-11, B-12, B-16). The referee role becomes
  **F7b** and keeps its own debate `bus-v2-referee-001`.

### What this ADR does not do

- It releases **no** invariant, **no** pinning test and **no** default. Invariant 5's "no exec" clause
  binds the core and is unchanged; this ADR *locates* outside the core the capability the core may never
  hold. "Read/reply-only by default" in ADR-0006 and ADR-0029 also stays true: `off` is the default
  overall and `wake` (read/reply-only) is the default *when a human enables the ladder*.
- **It does not promise a host wake-up contract.** [ADR-0029](0029-per-user-daemon-and-thin-clients.md)
  rule 6 and spike B-09 say that no verified contract exists for waking an *interactive* host session
  (Cursor, OpenCode, Codex, Gemini CLI, Antigravity; Claude Code channels are a research preview). That
  stays true and is untouched. The satellite starts a **new headless turn** on a local signal; it never
  wakes a host session, and no host-specific logic enters the core.
- If the Director or the tribunal reads this as a **weakening** of invariant 5 rather than a
  clarification of its scope, §9.3 applies and this ADR must be re-issued as a superseding ADR that
  names invariant 5 and the tests it releases, with the Director's explicit recorded decision. That is
  why this ADR is `proposed` and not `accepted`: the Director's authorization is the recorded decision
  that settles it.

## Consequences

**Easier.** An agent can be reached without a human opening its session: the wake path is local, opt-in,
reversible and auditable. The core stays shippable to a user who never enables it, and the F4 doorbell
becomes reusable rather than single-consumer.

**Harder / costs.** A new package to maintain and ship (own constitution, own threat model, own pinning
tests, own release cadence). An operational surface a human must understand: the ladder's level is a
capability decision, not a preference, and `autopilot` is the level where a peer's injected text can
reach an acting agent with nobody at the prompt.

**Residual risk, stated plainly.** At `wake` the worst case is a turn that reads and replies to
injected text — bounded by the profile, not eliminated. At `autopilot` a capable model can still be
misled into using an *allowed* command wrongly, so the allow-list is the security boundary and must be
reviewed as such; a model being "able to discriminate business instructions" is behaviour, not a
control, and no test can pin behaviour. Two further limits follow from R6a: the wake ledger is
self-reported, so a satellite that lies about its own wakes cannot be contradicted by the daemon; and
the daemon cannot tell an enabled binding from a disabled one, so the ladder's state is only as
trustworthy as the machine-local record.

**Reopens / supersedes.** Nothing from the "closed permanently" list (§6) is reopened; no wire change
(§4 untouched). ADR-0006 and ADR-0029 lose, in part, only their **phase-target sentence** for the
runner satellite (`post-F6` → F7a); each gains a reciprocal note. The RFC keeps its text and gains a
correction block.

**Roadmap.** F7 splits into F7a (wake satellite, unblocked) and F7b (referee, still after F6 and still
gated by `bus-v2-referee-001`).

## Supersedes

- [ADR-0006](0006-autonomy-boundary.md) — **in part**: the phase target of the runner satellite
  (`post-F6` → F7a). Its core ruling (the core is a passive switch; the runner never lives inside it) is
  reaffirmed, not superseded.
- [ADR-0029](0029-per-user-daemon-and-thin-clients.md) — **in part**: the same phase-target sentence in
  its "Options considered" table. Its rejection of an in-core runner is reaffirmed.
- Neither ADR's status changes; both gain a note naming this ADR.

## Tests that must pin it

Every line below is a **requirement on F7a**, not an existing test (CONSTITUTION §1: until the code
exists the named test is a requirement on the phase that introduces the guarantee). Values and file
names are assigned by the F7a spec.

| Id | Guarantee (the invariant, not an example) | Fails when |
|---|---|---|
| PT-34 | The core's built closures (daemon, client, channel, installer/doctor) cannot reach the wake satellite: no reference to it, no new spawn capability. | the runner is ever imported into, or bundled with, the core |
| PT-35 | The ladder is machine-local, human-set and fails closed: `conmuta.json` carries no ladder key (schema-shape assertion); a binding with no record, or a record that is missing, unreadable, malformed or names an unknown level, emits and acts on zero wake signals, and the resolution is counted and surfaced. | the opt-in appears in a committed file, a default-on path appears, or a corrupt record is read as enabled |
| PT-36 | Every wake is bounded and visible **in the satellite's own append-only wake ledger**: a wake outside the cooldown or budget is refused with a counted reason, at most one turn is in flight per binding, and each accepted wake appends exactly one row (verified trigger identity, thread, level, action) with no body and no token. | a wake fires silently, unbounded, or more than once per event |
| PT-37 | **The satellite's spawn surface stays closed**: exactly one spawn site, a closed executable set, an argv that cannot carry a shell, an interpreter or a permission-bypass flag, an allow-listed environment and the project's own `cwd`. | a second spawn site appears, a new executable is reachable, a refused-argument gap opens, or an environment key outside the allow-list reaches the child |
| PT-38 | The trigger path stays body-less: the wake signal's key set is unchanged from the F4 doorbell and carries no peer prose. | a body, a thread transcript or a sender's text reaches the satellite through the trigger |

PT-37 and PT-38 are pinned in the satellite's own suite (F7a); PT-34/PT-35/PT-36 include the core-side
halves that must live in this repository.

**PT-37, as originally written, is corrected here rather than implemented as prose.** The first draft said the
satellite's own bundle assertion would refuse `git push`/`merge`/`tag`, settings writes, secret-store reads and
`deleteMessage`. That was an over-claim: the runner never invokes git, the settings files or the secret store
at all — it invokes a **harness** — so there is no call site for such an assertion to forbid. What is
enforceable, and is what PT-37 now pins, is the spawn surface itself (one site, a closed executable set, a
refused-argument list, an allow-listed environment, a confined `cwd`). The R7 profile — "never push, merge,
tag or release; never write settings; never read secrets" — is carried by the prompt the turn receives, by
the harness's own configuration, and by this repository's rule that only a human authorizes a merge. It is an
instruction and a policy, not a static assertion, and the runbook says so in the operator's own words.

## Implementation note (2026-09-30, session 59 — F7a slice 1)

Implemented and verified by this repository's own suite; six apply-time refinements are disclosed here rather
than left implicit, following the "spec drift found during apply, corrected in the implementing change"
pattern this project has used since B-55.

1. **R2's packaging sentence is refined** (the ADR's own text now says "its own `bin`"). It first read
   "outside the core's package and `files` whitelist". Shipped: the satellite is a **third `bin` built from
   `runner/` into `dist/runner/main.js` and packed by the same `files` whitelist**, the shape the F4 channel
   adapter already has. What R2 protects is unchanged and now pinned: no core closure reaches the satellite
   (PT-34), and the core is inert for a user who never arms it.
2. **R4's "through the `conmuta` CLI or the panel" is implemented in the satellite's own bin** —
   `conmuta-runner ladder set|get|disable` is the only writer of the record. Putting that verb in the core CLI
   would put a wake concept inside the core's bundles, which PT-34 forbids.
3. **R6's wake ledger has a path and a row vocabulary:** `~/.conmuta/runner/wake-ledger.jsonl`, with `wake`
   (one row per accepted wake), `refused` (a bound or a broken record, always with its reason), `notify`, and
   `ladder` (every human action on the ladder, with the note it carried).
4. **R5's values live in `runner/constants.ts`**, each beside its reasoning. R5 deferred them to "the F7a
   spec"; this session implemented under ODD with no separate SDD spec, so the reasoning that would have been
   that spec's constants table ships one file earlier. The SDD artifacts are owed, and filed as backlog
   **B-105** rather than left unstated.
5. **`--by` is mandatory on every ladder write** and stored in the record: a record nobody signed is refused at
   the write and treated as malformed at the read.
6. **The harness argv templates are the Director's RFC's four forms** (`pi -p`, `claude -p`, `codex exec`,
   `opencode run`) with the prompt appended last. The tests pin the shape — a closed executable set, a literal
   argv, `shell: false`, an allow-listed environment, the project's own `cwd` — never any harness version's
   flags; the runbook tells the operator to verify the form by hand. On Windows a `.cmd` shim is refused
   (`unavailable` in the ledger) instead of being wrapped in a shell.

**Where each guarantee is pinned:** PT-34 in `test/security/runner-bundle.test.ts`; PT-35 in
`test/runner/ladder.test.ts` (fail-closed resolution, plus the schema-shape half); PT-36 in
`test/runner/ledger.test.ts` and `test/runner/loop.test.ts`; PT-37 in `test/security/runner-bundle.test.ts`
(the single spawn site) and `test/runner/harness.test.ts` (closed argv, confined environment); PT-38 in
`test/runner/prompt.test.ts` and `test/runner/loop.test.ts`. The satellite's own suite adds 86 tests to the
repository's total (1824 vs the session-58 baseline of 1738), and **no file under `src/` was changed by this
work** — the core's isolation is untouched by construction, not by promise.

**Operator entry point:** [`docs/runbooks/wake-satellite.md`](../runbooks/wake-satellite.md).

**What is not verified yet:** the tests drive a scripted daemon link and a scripted turn; no real
end-to-end run (a live daemon, a real harness, a real message) has been performed, and the four harness argv
forms have not been exercised against installed harness versions. Filed as **B-105**.

### Resolution of B-105 (sessions 60, 61, 66)

- **B-105(a) (SDD artifact set)**: closed in session 61 (2026-10-01) and archived to
  `openspec/changes/archive/2026-10-01-f7a-wake-satellite/`.
- **B-105(b) (real end-to-end run and live harness argv verification)**: closed in sessions 60 and 66.
  `pi -p` verified end to end on the bus with real messages in session 60. In session 66, all four
  harnesses (`pi`, `claude`, `codex`, `opencode`) installed on Windows 11 were verified live against real
  binaries with `shell: false`. `HARNESS_DEFAULT_ARGS` in `runner/constants.ts` matches real CLIs exactly.

### Amendment (2026-10-05) — no woken turn may send

The Director ordered on 2026-10-05 that the bus answer **only from a living interactive session**: with a
live session open that session answers, and with none open nobody answers and the thread simply stays
pending. **No woken (headless) turn may send anything, directly or indirectly.**

Measured trigger. Four `REPLY`s left in `@luisgtz-agent`'s name on 2026-10-04 without the Director's session
knowing (two at 22:46Z, two at 23:28Z; `thread_history` in `~/.conmuta/ledger.db`). The woken turn had **no**
`conmuta_*` tool, but it had `bash`: it read `~/.conmuta/run/daemon.json` (the run-file secret), wrote its own
IPC client and sent anyway. The session transcript is the proof of the mechanism, and `audit_log.client_id`
was `null` on all four send rows, so the ledger could not even name the client.

What this amendment changes (R5 and R7 refined; nothing else touched):

- **R5.** `wake` no longer means "read/reply-only". A woken turn is started under a **send-proof capability
  profile**: no shell and no extension surface, therefore no `conmuta_*` tool and no raw-IPC path. It records
  what it found and stops. The profile is a named constant (`SEND_PROOF_PROFILES`, `runner/constants.ts`),
  appended **after** the record's own `harness_args`; the flags that would widen or remove it (`--tools`,
  `--exclude-tools`, `--no-tools`, `--no-extensions`, `-e`, …) are refused outright.
- **R5/R7.** A level or harness with **no verified send-proof profile is refused**, never started with its
  full toolset, and the refusal is a counted row (`refused (profile_unavailable)`) — never a silent drop.
  `autopilot` is refused by this rule, because the act profile needs a shell and a shell can always send.
  Adding a verified profile is the one thing that re-enables a harness or the act level.
- **R3 and R6a stand unchanged.** The daemon gains no knowledge of the satellite: it gains no route, no IPC
  contract change and no wire change. Its single change is that `audit_log.client_id` now carries the sending
  session's `client_id` (it was pinned at `null`), so a send is attributable after the fact.

**Residual risk, stated plainly.** A local process of the same OS user, started outside this runner with a
shell of its own, can still impersonate an interactive client: the daemon cannot accredit "a human is
present", and the thin client's `host` label is the same literal for an interactive session and a woken one.
The capability profile is what closes the measured path, and today it pins exactly one harness (`pi`) and one
level (`wake`).
