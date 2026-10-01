# Judgment Day round 2 — scoped re-judgment, F7a wake satellite (session 59)

**Read ONLY this brief, the frozen ledger below, the fix delta it names, and the files the delta touches.**
Record any fix-caused defect with proof.

Repository: `C:/Users/LABORATORIO/Downloads/desarrollos/ORION OCG/telegram_bus_agent`.

- Round-1 frozen target: `git stash create` → `6f6600c929d1ad6d313d3f5d3352aaca31ba5612` (both judges ran against it; Judge B's first launch failed technically and was re-launched, and its second run delivered the report below).
- Round-1 ledger: Judge A returned 4 CRITICAL + 5 WARNING; Judge B returned 3 CRITICAL + 5 WARNING.
- **Round-2 frozen target** (the tree is frozen again for this audit — no further edit will be made until both judges return): `git stash create` → see the freeze hash in the launch prompt.

## Frozen round-1 ledger, merged, with dispositions

| Id | Finding (both judges unless marked) | Disposition |
|---|---|---|
| F1 | **CRITICAL — `REFUSED_ARGUMENTS` was matched by exact equality only**, so `--dangerously-skip-permissions=true`, `--command=sh` and an attached short form like `-crm -rf /` passed the ladder's argument validation and reached the spawned harness. | **Fixed**: `runner/harness.ts` gained `isRefusedArgument` — exact match, `--flag=value`, and any attached form of a single-dash token — used by `resolveHarnessSpec`. New test: `test/runner/harness.test.ts` "`--flag=value` and an attached short form are refused too". |
| F2 | **CRITICAL — the ladder was resolved only BEFORE the doorbell long poll**, so a binding disabled or lowered during a poll still woke its harness on the stale entry, defeating the kill switch. | **Fixed**: `runner/loop.ts` re-resolves the ladder after every read that finds traffic and acts on the fresh answer (returning `idle` if it is now `off`). New test: "the ladder is re-read after the poll — disabling during the wait stops the wake". |
| F3 | **CRITICAL (Judge A) — a tight spin.** When the inbox held rows none of which is relevant to this binding, the doorbell answers immediately with `count: 0` and a `covered_through_seq` past the request; the loop treated that as `silent`, did not advance anything and did not sleep, so it re-read the same window at full speed. | **Fixed**: a silent read now advances the runner's own watermark (`advanceTo`) without committing a daemon cursor. New test: "a silent read advances the runner's own watermark" (asserts the second read starts at the covered seq). |
| F4 | **CRITICAL (Judge A) — an aborted turn covered its message**: the loop committed the cursor for any outcome other than `unavailable`, so a turn killed at shutdown (or one that timed out) marked the message handled without the work being done. | **Fixed**: only `exited` commits; `timed_out`/`aborted`/`unavailable` leave the message pending (bounded by the per-window budget) and warn. New test: "a turn that timed out or was aborted does not cover the message". |
| F5 | **CRITICAL (Judge B) — restart re-wakes.** The daemon keys `client_cursors` by the session id the handshake mints (`src/ledger/cursors.ts`'s `ensureClientCursor`, seeded at `SESSION_CATCHUP_HOURS`), so every new runner process bootstrapped from the catch-up window and could re-wake up to a day of already-handled traffic — including repeated `--once` runs. | **Fixed**: new module `runner/watermark.ts` persists one watermark per binding under the daemon home; the loop resumes from it and falls back to the daemon's seed only on a first run. New test file `test/runner/watermark.test.ts` plus the loop test "a restart resumes from its own persisted watermark". |
| F6 | WARNING (both) — the refusal memo was not cleared by an accepted wake, so a refusal that followed a successful wake could be silently dropped as a "repeat". | **Fixed**: an accepted wake clears the memo. New test: "an accepted wake clears the refusal memo". |
| F7 | WARNING (both) — `readLedgerRows` parsed lines with an unguarded `JSON.parse`, so a torn line (an ordinary crash artifact in an append-only file) made the read path throw. | **Fixed**: unparsable lines are skipped. New test: "a torn or corrupt line is skipped, never fatal". |
| F8 | WARNING (both) — `runner/loop.ts` defaulted the long poll to a bare `50`, against CONSTITUTION §5's named-constant rule. | **Fixed**: the default is `FETCH_LONGPOLL_MAX_SECONDS` from `src/shared/constants.ts` (the daemon's own clamp). New test asserts the read uses it. |
| F9 | WARNING (both) — `runTurn` spawned before checking whether the signal was already aborted, so an "aborted" turn had in fact started a process, and an early return after the spawn left the child's `error` event unlistened. | **Fixed**: the abort check now leads and returns without spawning; the post-spawn check remains only as a race guard. Test renamed to "an already-aborted signal starts nothing at all" and now asserts zero spawns. |
| F10 | WARNING (Judge A) — the abort path issued `SIGTERM` and resolved with no escalation, so a child ignoring `SIGTERM` survived the runner. | **Fixed**: the abort path arms an `unref`ed `SIGKILL` escalation after the grace period (never waited for). New test: "an abort whose child ignores SIGTERM is SIGKILLed after the grace period". |
| F11 | WARNING (Judge B) — CONSTITUTION §3.1 still claimed `autopilot` was "confined by construction", contradicting ADR-0032's PT-37 correction that the R7 profile is an instruction plus harness policy, not a mechanism. | **Fixed**: §3.1 and ADR-0032's R7 now separate what the spawn surface enforces from what the prompt and the harness's own configuration must refuse, and the runbook states the same in operator words. |

## The fix delta — read these files and judge only this delta

- `runner/harness.ts` — `isRefusedArgument` + its use; the leading abort check; the `SIGKILL` escalation.
- `runner/loop.ts` — the re-resolution of the ladder after the poll; the silent-path advance; the commit-only-on-`exited` policy; the memo reset; the `FETCH_LONGPOLL_MAX_SECONDS` default; the watermark wiring.
- `runner/watermark.ts` (new) and `runner/main.ts` (passes `watermarkPath`).
- `runner/ledger.ts` — the guarded `readLedgerRows`.
- `test/runner/harness.test.ts`, `test/runner/loop.test.ts`, `test/runner/ledger.test.ts`, `test/runner/watermark.test.ts` (new).
- `docs/01-constitution/CONSTITUTION.md` §3.1, `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md` (R7), `docs/runbooks/wake-satellite.md`.

## Your task

For each of F1–F11: verify with proof that (a) the fix exists as described, (b) it actually closes the finding
it claims to close, and (c) it introduces no new defect — a stale doc, a contradictory cross-reference, a
guarantee whose mechanism still cannot exist, an over-claim, a test that would pass even if the fix regressed, a
new spin or leak. Read the cited source files where a fix asserts a fact about the codebase. Report only
findings with `location`, and mark `causal_disposition` `introduced` when this delta caused them.

## Output

Return one JSON object and no prose:

{"findings":[{"location":"path:line","severity":"CRITICAL","claim":"observable incorrect behavior","evidence_class":"deterministic","causal_disposition":"introduced","proof_refs":["concrete proof"]}],"evidence":["what was inspected"]}

Allowed: `severity` ∈ CRITICAL | WARNING | SUGGESTION; `evidence_class` ∈ deterministic | inferential;
`causal_disposition` ∈ introduced | pre-existing | unknown. Only `findings` and `evidence` at the top level;
only `location`, `severity`, `claim`, `evidence_class`, `causal_disposition` and `proof_refs` inside a finding.
Return {"findings":[],"evidence":["what was inspected"]} when clean, then terminate.
