# Silent false health — B-82 and the rest of B-85

> **Status:** open — in progress.
> **Branch:** `fix/b-129-ring-budget` (carries B-129's closed unit and this class).
> **Authority:** the Director scheduled this class on 2026-10-07 ("la clase salud silenciosa", recorded in
> `26d3ce2`), delegated with full authority, and this session's opening prompt re-states it. Inside the rows the
> dispositions are fixed; the engineering is mine.
> **Rows:** `docs/06-backlog/CHECKLIST.md` → `B-82` (all findings), `B-85` findings (2), (3) and (4). B-85's (1)
> closed in session 75 (`9577f23`, merged as `f71d0e9`).

## Why this class, and not one row at a time

The handoff's §3.3 says it directly: *"a test that can never fail and a doctor that lies are the worst failure
modes this repository's own doctrine names."* Both rows are the residue of the F1/F2 SDD cycles, each filed as
"non-blocking, disclosed rather than fixed". They share one root: **a health report that cannot fail is not a
health report**, and a check whose failure destroys the rest of the report is not fail-safe either.

The class is attacked by root, not row by row (the `systemic-issue-triage` rule the Director applies to this
backlog): every unit below removes a way for a *report* to be wrong without saying so.

## Units

### Unit 1 — the vacuous assertions of B-82 (test-only)

`test/doctor/offline.test.ts`.

- **A1, the headline vacuity.** The test claimed `runOfflineDoctor` "never reads the stored token" by wrapping a
  call-counting spy around a `SecretStore` **the test itself constructs** — and `runOfflineDoctor({ homeDir })`
  never receives it (it takes no store parameter, and no module in its closure imports `secret-store/*`). The
  assertion `getCallCount === 0` was true regardless of what the doctor did.
- **A2, an incomplete spy.** The zero-network spy patched `globalThis.fetch` and `http.request`'s default-export
  property, but not `https.request`, and could never see a named `import { request } from "node:http"` binding.
- **A3, a title stronger than its assertion.** A test whose name claims the composition `runSystemChecks` defines
  asserted only a hard-coded id list, never calling the tier.

**The fix, and why it is not another spy.** B-82's own pointer offers two routes ("replace the assertion with a
static import-graph check"); the import-graph one is taken, because it is the only one no binding shape can route
around. `test/security/closure.ts` already exports `computeClosure`/`bareSpecifiers` (used by
`channel-bundle.test.ts` and `channel-pi-bundle.test.ts`), and `src/doctor/offline.ts`'s own comment already
promised this half ("design.md §9.1's static half is Unit 11's job") — it had never been written. Two new pins:

1. the offline entry's relative-import closure reaches **no `src/secret-store/**` module**; and
2. that closure's bare specifiers include **no network module** (`node:http`, `node:https`, `node:net`,
   `node:dgram`, `node:tls`, `undici`).

**Measured at HEAD: the closure is 28 files** (`src/doctor/2`, `src/installer/10`, `src/ledger/4`, `src/registry/4`,
`src/shared/7`, `src/daemon/1`), with no `secret-store` and no network module. The runtime spies stay, extended to
`https.request`, as the behavioural half.

**Non-vacuity, measured by mutation, and it is the point of the unit:** with `offline.ts` mutated to read the
stored token itself (B-82's own feared future change, *"a future change built its own store over the same homeDir
and read the token directly"*), the **runtime spy test still passes** and only the new closure pin fails. With
`import https from "node:https"` added and never called, the spy still passes and only the new network pin fails.
That is the missing detection power, demonstrated rather than argued.

A3 is fixed by comparing the composed ids against `runSystemChecks` + `runRegistryChecks` output, keeping the
hard-coded list beside it — the comparison pins composition, the list pins content, and neither implies the other.

### Unit 2 — the doctor must not abort or lie about its own report (B-82 B1, B3, B4, B5)

- **B1.** `runDoctorMain` concatenates `report.out` and `report.err` into one `io.out` sink. It therefore
  discards the split `report.ts` was built to produce and reorders every failure after every pass, contradicting
  `runSystemChecks`' documented order. Fix: an `io.err` sink; `out` keeps its order, `err` keeps its own.
- **B3 (first half only).** `checkAcl`'s POSIX `statSync` is unguarded — an `EACCES` throw escapes
  `runSystemChecks` and destroys every other finding. Fix: wrap it, mirroring the win32 branch's own catch.
  **The second half of B3 is false at HEAD** and is recorded, not "fixed": `checkLock`'s `readLockFile` cannot
  throw — `src/daemon/lifecycle/lock.ts:83-89` wraps `readFileSync` + `JSON.parse` in a try/catch returning `null`,
  and `isProcessAlive` is guarded too.
- **B4.** The read-only ledger connection sets no `busy_timeout`, so a database mid-checkpoint reports a
  false-alarm `fail`. Fix: the codebase's own precedent, `installer/ledger-access.ts`'s named constant.
- **B5.** The POSIX "home not writable" test is skipped only on win32; under a root CI container
  `accessSync`/mode bits do not fail and the test silently stops testing. Fix: extend the skip predicate.

### Unit 3 — B-85 (2) and (4)

- **(2)** `appendAuditRow` after a DM send runs unguarded inside `runDmProbe`: a ledger write failure rejects the
  whole `POST /doctor` handler and discards every finding already collected, after real DMs have gone out — against
  the same module's "every check is independently fail-safe" discipline. Fix: degrade the audit-row failure into
  the finding instead of rejecting.
- **(4)** The DM-probe cross-project test passes a fake room guard that enforces nothing, so cross-project
  confinement is asserted by design, not proven. Fix: a real `RoomGuardClient` over a fake Telegram client, with a
  non-vacuity assertion that the guard's `assertTarget` really refuses a foreign target.

### Unit 4 — B-85 (3), decided as documented-not-fixed

The client applies one `IPC_REQUEST_TIMEOUT_MS` (~70 s) abort to the whole `POST /doctor`, while the daemon
awaits every binding's checks sequentially. **Measured, and the finding is real:** each Telegram call carries
`requestTimeoutMs()` = 20 s (`telegram.ts:244-247`), so one binding with a two-peer roster can legally take
`20*(2+2*2)` = 120 s against a 70 s client budget. **A client constant cannot bound it**, because
`roster_snapshot` is uncapped (`registry/schema.ts:189`, `z.array(...).min(1)`), so no single number is an upper
bound of the daemon's work.

**The decision, taken in session 77 under the Director's delegation, is shape (b): accept the long tail and
document it** — `docs/02-architecture/OVERVIEW.md` §10.4, where the DM probe's tier is described — on the reasoning
that the probe is **opt-in**, an operator asked for it, and the `audit_log` `DOCTOR_PROBE` rows are the durable
record of what was actually sent. **Shape (a) was rejected for now on a technical ground, not a preference:** a
per-request deadline that only stops *awaiting* leaves the probe DMs going out anyway, which is the exact harm it
is meant to remove, so a correct deadline needs an abort signal threaded into `src/daemon/telegram.ts` — a change
of its own, with a rate-limit interaction (`GROUP_MESSAGES_PER_MINUTE = 20`). The row says to reopen it if someone
takes that plumbing. Nothing was shipped that claims to bound the long tail.

## Non-goals

- B-82's **B2** (hand-copied constants) is a cross-module export change with a project-reference constraint
  (`src/doctor/tsconfig.json` references no `src/client`), and its own row says two of the copies have **no owner
  module to import from**. Its disposition is recorded in the row rather than forced here.
- No behaviour change to any check's *verdict logic*: this class is about reports that cannot fail and failures
  that destroy reports.
- Does not reopen B-85 (1) (closed, `f71d0e9`).

## Tasks and evidence

| # | Unit | Evidence |
|---|---|---|
| 1 | B-82 A1/A2/A3 | closure = 28 files, no secret-store, no network module; two mutations, each failing only the new pin while the old spy passes |
| 2 | B-82 B1/B3/B4/B5 | see the unit's commit and its tests |
| 3 | B-85 (2)/(4) | **(2)** pinned by dropping `audit_log`: the handler answers `HTTP 200`, the probe is `warn` with the audit note, and the earlier findings survive; RED observed first (the test failed while the handler still rejected). **(4)** a real `RoomGuardClient` is now in the probe's path — emptying its roster fails four tests, and the cross-project test asserts A's guard refuses B's peer (`WrongRoomError`) instead of inferring the boundary |
| 4 | B-85 (3) | **DECIDED as (b): documented, not fixed.** Measured 20 s per Telegram call × `(2 + 2r)` per binding against a 70 s client budget, with an **uncapped roster**, so no client constant is an upper bound. The bound is now documented where the operator reads it (`docs/02-architecture/OVERVIEW.md` §10.4) and the row carries the decision, the measurement and the reason shape (a) was rejected for now (a deadline that only stops awaiting leaves the DMs going out; it needs abort plumbing in `src/daemon/telegram.ts`) |

## Evidence to record at close

The **independent pass** for the three units was `gentle-ai-verify` (see HANDOFF §5.1): it reproduced
1986/1980/0/6, `test:static` 129/129, `test:wrong-room` 5/5 and `%TEMP%` 0 → 0, and re-ran all four non-vacuity
experiments in a `%TEMP%` copy — the closure mutation, the merged-`runDoctorMain` mutation (2 of 4 fail), the
empty-roster mutation (exactly 4 fail), and its own WAL `BEGIN EXCLUSIVE` script. It also corrected this
document's own wording: one of the two `runDoctorMain` pins that fail under the merge mutation is *modified*
rather than newly added. The parent re-verified every number and mutation first.

## Engram mirror

**Due, and impossible right now** — `engram serve` cannot bind `127.0.0.1:7437` (reserved range 7364-7463,
HANDOFF §8). Not re-derived here.

## B-129 close-out (folded here, not its own commit)

`de1e56e` closed B-129. Its native review, lineage `review-1260155c41b03eb5`, graded the candidate `medium`,
ran one lens (`review-reliability`) and closed **approved**; its authority was burned with
`gentle-ai.review-acknowledged/v1`. Two **informational** findings were recorded at capture time, because a
reviewer's prose is unrecoverable after acknowledgement (B-126): `R3-1` (WARNING, `channel-pi/host.ts:121-122`)
and `R3-2` (WARNING, `test/channel-pi/host.test.ts:190-212`). They are filed as **B-134** in the backlog.
