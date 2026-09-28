## Exploration: F5 — Arena-light, 2-party debates over the existing wire

### Current State

**Roadmap row.** `docs/07-plan/WORK-PLAN.md:99-110` is the authoritative F5 row: body-marker
subtypes (PROPOSAL = `REQUEST[marker]`, AUDIT/COUNTER = `REPLY[marker + verdict token]`,
CONSENSUS = `RESOLVED[existing basis]`, ESCALATE = `RESOLVED[basis abandoned] + marker`),
a daemon-enforced round cap, pointer-only payloads inside the 1,921-char effective ceiling,
a ledger side journal, `disable_notification` on debate turns, and AUDIT+COUNTER coalescing
against 20 msg/min/group. Dependency: F1 only (journal table, cursors) — F1 is fully archived
(`docs/07-plan/WORK-PLAN.md:105`; `AGENTS.md` status line). Tribunal decision `D7`
(`docs/05-tribunal/INDEX.md:89`) ratifies exactly this shape and explicitly defers N-party to
`B-10`. `docs/02-architecture/THREAT-MODEL.md:116` (T22, pinning test `PT-33`) already
anticipates "debate turns coalesced and sent with `disable_notification`" as a rate-exhaustion
mitigation, so F5 is not inventing new threat surface, only implementing a mitigation the threat
register already names.

**The wire is closed, by design, in three places that bound every approach below:**

- `src/shared/envelope.ts:44` — `type` is a closed zod enum
  `["BROADCAST","REQUEST","REPLY","ACK","RESOLVED"]`. No new type may be added without a wire
  change (forbidden by CONSTITUTION rule W1, restated in `AGENTS.md`'s working rules).
- `src/shared/envelope.ts:38,40,50` — `basis` is a closed enum:
  `RESOLVED_LOW_RISK_BASIS = ["context-shared","work-confirmed","lock-released"]` plus
  `"human-approved"` and `"abandoned"` (`ABANDON_BASIS_VALUE`), plus the ACK-only
  `"acknowledged-only"`. `envelope.ts:28-36`'s own comment states the reason this list cannot
  grow quietly: it "maps 1:1 to the spec's exhaustive low-risk set and its provenance is the
  reason ADR-06 layer 4 can call itself fail-closed" — appending a value would misrepresent that
  provenance. This is the literal mechanism behind the WORK-PLAN risk row ("adding a `basis`
  value would silently break v1 peers").
- `src/shared/envelope.ts:88-101` (`isBasisValidForType`) — `basis` is **forbidden** on
  BROADCAST/REQUEST/REPLY and **required** on RESOLVED. This means "AUDIT/COUNTER =
  `REPLY[marker + verdict token]`" cannot use the schema's `basis` field at all — the verdict
  token has to live inside `body`, exactly as the WORK-PLAN row already implies by calling it a
  body marker.

**The thread model is already two-party.** `src/daemon/send/validate.ts:213-304`
(`checkLoopPrevention`) enforces, today, with no debate-specific code:
- a thread's `to` is a single agent id (`threads` table, `src/ledger/schema.ts:62-73`), so a
  thread structurally cannot cross more than two identities;
- a REPLY may only come from `thread.from` or `thread.to` (`NOT_PARTICIPANT`,
  `validate.ts:244-249`) and must be addressed to "the other party"
  (`NOT_ADDRESSEE`, `validate.ts:251-257`);
- `RESOLVED` with any basis other than `abandoned` must be sent by the addressee
  (`thread.to`) back to the originator (`thread.from`) (`validate.ts:284-297`);
- `RESOLVED[abandoned]` may **only** be sent by the thread's originator (`thread.from`), and only
  to the same peer (`NOT_ORIGINATOR`/`NOT_ADDRESSEE`, `validate.ts:271-283`, citing ADR-13);
- `ALREADY_RESOLVED` makes RESOLVED terminal (`validate.ts:259-262,299-301`) — a thread cannot be
  reopened once closed.
- Threads are scoped by `(project_id, thread_id)` (`schema.ts:73`) and every lookup is
  project-scoped (`readThreadRecord`, `src/ledger/threads.ts:101-135`), so "a debate never
  crosses bindings" (the WORK-PLAN validation criterion) is already a structural property of the
  existing ledger, not something F5 has to build.

**Correction (post-exploration, via Alpha audit `bus-v2-f5-explore-decisions-001`):** the claim
below that no side journal exists is INCOMPLETE. `docs/02-architecture/DATA-MODEL.md:264-279`
(§3.7 `debate_journal`) already fully specifies this table under tribunal decision D7 — columns
`id`, `project_id`, `debate_id` (= the PROPOSAL thread's `thread_id`), `round`
(capped by the named constant `ARENA_LIGHT_MAX_ROUNDS`, exceeding it raises `ROUNDS_EXHAUSTED`),
`turn` (`PROPOSAL`/`AUDIT`/`COUNTER`/`CONSENSUS`/`ESCALATE`), `verdict`, `eid`,
`from_agent_id`/`to_agent_id`, `refs` (pointer-only JSON array), `basis_at_close`, `at`.
`docs/02-architecture/THREAT-MODEL.md:146` (PT-23) additionally requires: the (cap+1)-th COUNTER
rejects with `ROUNDS_EXHAUSTED`; a participant outside the roster is rejected; an inline
(non-pointer) patch body is rejected. `sdd-design`/`sdd-spec` implement this already-ratified
schema — they do not invent a new one. Approach 1 below stands, now with a stronger basis than
"recommended by analogy": it is the literal schema this project already committed to at the
landing-debate stage.

**No existing "side journal" — SUPERSEDED, see correction above.**
`LEDGER_SCHEMA_DDL` (`src/ledger/schema.ts:43-117`) has 11
tables/views today: `offsets`, `updates`, `threads`, `thread_history`, `needs_action` (view),
`client_cursors`, `client_surfaced`, `audit_log`, `unknown_senders`, `binding_state`,
`conditions`. None tracks a per-thread round count or a debate-specific marker. `thread_history`
(`schema.ts:76-81`) stores every REPLY/ACK/RESOLVED against a thread generically, capped at
`MAX_THREAD_HISTORY = 50` (`src/shared/constants.ts:156`) and reconciled to exactly match the
in-memory record on every write (`src/ledger/threads.ts:210-241`) — rows the array no longer
carries are deleted. `LEDGER_MIGRATIONS` (`src/ledger/migrations.ts:87-94`) is a single step today
(`{ to: 1, up: … LEDGER_SCHEMA_DDL }`); the path is forward-only and contiguous by construction
(`assertMigrationPath`, `migrations.ts:157-163`), so a side journal requires a genuine new
migration step (`{ to: 2, … }`) and a `LEDGER_SCHEMA_VERSION` bump (`constants.ts:59`) — this
would be F1's first schema change since the initial DDL.

**Rate discipline for 20 msg/min/group already exists and is not a queue.**
`GROUP_MESSAGES_PER_MINUTE = 20` (`constants.ts:182`) and `SendRateBudget`
(`src/daemon/send/rate.ts:199-264`) already enforce this exact ceiling per `(bot_id, chat_id)`
with a sliding one-minute window. `send-path.ts:322-353` checks it before every `transport.send`
and, on refusal, writes an audit row and throws `SendToolError("RATE_LIMITED", …, {
retry_after_s })` — the module doc for `rate.ts` is explicit that this "never retries, never
swallows" (`rate.ts:1-54` module doc). So "AUDIT+COUNTER coalesced ... to respect 20 msg/min/group"
cannot mean building a retry/queue layer (that would contradict the established no-auto-retry
policy); it can only mean composing what would otherwise be two logical debate steps into one
outbound envelope before the send ever reaches `rate.ts`.

**Silence today is type-only, not marker-aware.** `SILENT_TYPES = new Set(["ACK"])`
(`src/daemon/send/send-path.ts:172`) is the only place `disable_notification`-equivalent silence
is decided, and it looks at `validatedInput.type` alone — never at `body`. REQUEST/REPLY/RESOLVED
are today always notifying types. Making a debate-marked REQUEST/REPLY/RESOLVED silent while an
ordinary REQUEST/REPLY/RESOLVED of the same type stays audible requires a new, marker-aware
silencing decision that does not exist anywhere in the current pipeline.

**Existing precedent for a new condition.** `ConditionName` (`src/ledger/conditions-store.ts:84`)
is a closed union of five names today (`ledger_quarantined`, `group_outage`, `state_quarantined`,
`open_thread_backlog`, `roster_drift` — the last one added by F3 following the exact same
pattern). Surfacing something like "round cap exceeded" or "debate escalated" would follow this
precedent directly: add a sixth name, a `detail` contract, and a reader.

**Out of scope, confirmed twice.** `docs/02-architecture/THREAT-MODEL.md:17` and
`docs/06-backlog/CHECKLIST.md:24` both independently confirm: the N-party tribunal is `B-10`
(post-F6, needs `AGENTBUS/3` or Arena Orion) and the group referee role is reserved for its own
debate (`bus-v2-referee-001`, `docs/05-tribunal/INDEX.md:45,76,480`, backlog `B-01`-`B-03`). F5
must not grow into either.

**Not independently verifiable in-tree.** The WORK-PLAN risk row cites `critic.gaps[3]` as the
source for "only existing basis values may close a debate." I searched
`docs/05-tribunal/INDEX.md`, `docs/06-backlog/CHECKLIST.md`, and
`docs/02-architecture/THREAT-MODEL.md` and could not locate this citation as a file this
repository holds — it is very likely an F0 external analysis-bundle key outside this tree. The
constraint itself is independently confirmed structurally (the closed `basis` zod enum,
above), so the finding stands regardless of the citation; only the citation itself is
unverified.

### Affected Areas

- `src/shared/envelope.ts` — no schema change expected (types/basis stay closed), but a new
  pure module needs to reuse its exported patterns (`RESOLVED_BASIS_VALUES`,
  `ABANDON_BASIS_VALUE`) rather than duplicate them.
- `src/shared/constants.ts:59,182,185` — `LEDGER_SCHEMA_VERSION` (bump if a new table is chosen),
  `GROUP_MESSAGES_PER_MINUTE`/`CHAT_MESSAGES_PER_SECOND` (reused, not redefined) — a new named
  round-cap constant belongs here too (named-constant rule, `CONSTITUTION.md` §5).
- `src/ledger/schema.ts`, `src/ledger/migrations.ts` — only if the side journal is a new table
  (Approach 1 below); the first schema change since F1's initial DDL.
- `src/ledger/threads.ts`, `src/ledger/cursors.ts` — read for reference; neither currently tracks
  per-thread round counts or debate markers, so neither absorbs this by itself.
- `src/ledger/conditions-store.ts:84` — candidate to extend `ConditionName` if a debate condition
  is surfaced.
- `src/daemon/send/validate.ts:200-304` — `checkLoopPrevention` and `IN_THREAD_TYPES` are the
  natural home for a new round-cap validation stage, mirroring the existing
  `WRONG_ROOM`/`RATE_LIMITED`/`UNKNOWN_THREAD` refusal pattern (new `SendErrorCode` member).
- `src/daemon/send/send-path.ts:172` (`SILENT_TYPES`) — needs a marker-aware silence decision,
  not just a type-based one.
- `src/daemon/send/rate.ts` — reused as-is for the 20/min/group ceiling; coalescing must happen
  upstream of this module, not inside it.
- `src/daemon/admission.ts`, `src/daemon/poller.ts` — read for reference; inbound REQUEST/REPLY/
  RESOLVED classification is already generic (`applyEnvelope`), so a marker-carrying envelope is
  admitted today with no special handling — routing debate logic on receipt is additive, not a
  change to what already exists.
- `docs/02-architecture/THREAT-MODEL.md:116` (T22, `PT-33`) — the pinning test this phase's round
  cap and coalescing mitigations must satisfy.
- `docs/06-backlog/CHECKLIST.md:24` (`B-10`) — the boundary this phase must not cross.

### Approaches

1. **Dedicated ledger side journal (new table via a forward migration)** — a new table (e.g.
   `debate_rounds`, keyed `(project_id, thread_id)`) tracking round count and last-marker state,
   written inside the same transaction as `writeThreadRecord` in `send-path.ts` and read by a new
   validation stage in `validate.ts`.
   - Pros: matches the WORK-PLAN's own words ("side journal in the ledger") literally; O(1)
     lookup independent of `thread_history`'s 50-row cap; follows the exact precedent already
     established for `audit_log`/`conditions-store.ts` (a dedicated table, `STRICT`, no body);
     durable across daemon restarts and crash-safe under the same `withTransaction` discipline
     every other ledger writer uses.
   - Cons: F1's first schema change since the initial DDL — requires a new `LEDGER_MIGRATIONS`
     step, a `LEDGER_SCHEMA_VERSION` bump, and new migration tests pinning the three properties
     `migrations.ts`'s own doc already states (forward-only, one transaction per step, synchronous
     `up`); forward-only means a wrong column choice cannot be walked back, only migrated forward
     again.
   - Effort: Medium.

2. **Derive round count from `thread_history` at read time** — parse marker-tagged bodies out of
   the existing `thread_history` rows (`src/ledger/threads.ts:190-208`) instead of adding a table.
   - Pros: zero schema change, zero migration risk.
   - Cons: `thread_history` is capped at `MAX_THREAD_HISTORY = 50` and reconciled to exactly
     match the record's array (`ledger/threads.ts:184-186,210-241`) — a debate round accidentally
     could be silently truncated by ordinary conversation traffic sharing the same cap; makes the
     round count depend on parsing free-text `body` as the source of truth, which runs against
     this codebase's own established discipline that ledger-derived facts carry "codes and ids,
     never prose" (`conditions-store.ts:33`, restated for `detail` records); more CPU per send
     (a scan) versus an indexed point lookup.
   - Effort: Low, but fragile.

3. **In-memory-only round tracking (no ledger persistence at all)** — track round counts in a
   daemon-process map, mirroring `SendRateBudget`'s own in-memory windows
   (`src/daemon/send/rate.ts:199-264`).
   - Pros: simplest possible implementation; no migration.
   - Cons: contradicts the WORK-PLAN's explicit "side journal in the ledger" deliverable and this
     project's own crash-safety posture (every other durable count — cursors, retry-after,
     audit — lives in the ledger specifically so a daemon restart does not silently reset state a
     caller is relying on); a debate mid-round would silently reset its cap on daemon restart,
     which is exactly the "silent divergence" class of bug this codebase repeatedly refuses
     elsewhere (e.g. `cursors.ts:157-160`'s comment on why it avoids `ON CONFLICT DO NOTHING`).
   - Effort: Low, not recommended.

### Recommendation

Approach 1 (dedicated ledger side journal via a new forward migration) for round-cap state, and a
new pure `shared/` module (parallel to `shared/envelope.ts`/`shared/protocol-apply.ts`) for
marker encoding/decoding and basis-value mapping, wired into `validate.ts` as a new validation
stage that reuses the existing `SendToolError` refusal pattern (`WRONG_ROOM`/`RATE_LIMITED`
precedent). This is the option that matches the phase's own stated deliverable literally, reuses
every mechanism this codebase already has a tested precedent for (migration, condition, audit
row, `SendToolError` code), and keeps the round count crash-safe — consistent with how every
other durable counter in this system (cursors, retry-after, audit) is treated. It is Medium effort
specifically because it is F1's first schema change, which should be budgeted and tested with the
same rigor `migrations.test.ts` already applies to the single existing step.

Before (or during) `sdd-propose`, four decisions below need a tribunal ruling — none of them are
implementation details this phase can resolve unilaterally, because each touches either the wire
contract or an existing authorization rule enforced by shipped code.

### Risks

**All four items below were resolved by tribunal debate `bus-v2-f5-explore-decisions-001`
(CONSENSUS, round 2) before `sdd-propose`:** D1 CONSENSUS basis = `context-shared`; D2 round-cap
refusal code = `ROUNDS_EXHAUSTED` (the canonical, already forward-declared name — not a new
code), escalation asymmetry accepted as-is since COUNTER is structurally always sent by
`thread.from`, the only party with `RESOLVED[abandoned]` authority; D3 coalescing = one REPLY
with two fixed-delimited `AUDIT:`/`COUNTER:` sections, one send reaching `rate.ts`; D4 silence via
a new `DEBATE_MARKER_PREFIX` sentinel restricted to REPLY-only turns — PROPOSAL and
CONSENSUS/ESCALATE stay notifying, matching `send-path.ts:160-172`'s lifecycle-boundary
philosophy. Original text preserved below for audit-trail purposes.

- **[Needs tribunal decision] Which existing `basis` value CONSENSUS maps to is unresolved and
  consequential.** `RESOLVED_BASIS_VALUES` (`envelope.ts:38`) is
  `["context-shared","work-confirmed","lock-released","human-approved","abandoned"]`. Adding a
  sixth value is forbidden (confirmed structurally above). Picking the wrong existing value for
  CONSENSUS would misrepresent what that value's ADR-06 layer-4 fail-closed guarantee actually
  certifies (`envelope.ts:28-36`) — this is a semantic/protocol decision, not an engineering one.
- **[Needs tribunal decision] Escalation is structurally asymmetric today.** Only the thread's
  originator (`thread.from`, i.e. whoever sent the PROPOSAL) may send `RESOLVED[abandoned]`
  (`validate.ts:271-277`, ADR-13). If the round cap is hit on the **addressee's** (`thread.to`'s)
  Nth COUNTER, the addressee cannot self-escalate — only the original proposer can. F5 must
  decide explicitly whether the addressee instead gets a distinct refusal/signal that requires the
  proposer to escalate, or whether this asymmetry is accepted as-is.
- **[Needs tribunal decision] "Coalesced" is undefined today.** `SendRateBudget` already enforces
  20/min/group with no retry (`rate.ts` module doc). F5 must define what "coalesce AUDIT+COUNTER"
  concretely composes into one outbound envelope — this is a protocol-shape decision (what a
  combined AUDIT+COUNTER body looks like within the ~1,921-char effective ceiling,
  `docs/03-adr/0023-wire-ceiling-reported.md:14`), not something inferable from existing code.
- **[Needs tribunal decision] Marker-aware silence is a new coupling point.** `SILENT_TYPES`
  (`send-path.ts:172`) currently keys purely on envelope `type`. Making REQUEST/REPLY/RESOLVED
  conditionally silent based on `body` content (a debate marker) is a new kind of decision this
  pipeline has never made before and should be reviewed rather than added quietly.
- Migrations are forward-only and irreversible in practice (`migrations.ts:23-26`) — if Approach 1
  is chosen, the new table's shape must be right the first time; a mistake needs a second forward
  migration to correct, not a rollback.
- The `critic.gaps[3]` citation in the WORK-PLAN risk row could not be located in this repository
  (see Current State) — the underlying constraint is independently confirmed by the code, but the
  citation itself is unverified and should be corrected or footnoted when this citation is next
  touched.
- Scope discipline: N-party tribunal (`B-10`) and the group referee role (`bus-v2-referee-001`,
  `B-01`-`B-03`) are explicitly reserved elsewhere (`THREAT-MODEL.md:17`, `CHECKLIST.md:24`,
  `docs/05-tribunal/INDEX.md:45,76,480`) — the proposal must state explicitly that F5 stays
  2-party and does not introduce a referee/judge role.

### Ready for Proposal

Yes, with one condition: the four items marked "[Needs tribunal decision]" in Risks should be
resolved (at minimum, put to Alpha/the Director as an explicit debate) before or as the first
step of `sdd-propose`, since `sdd-propose` is not the phase that resolves open protocol-semantics
questions either — they bear directly on whether the proposal's scope and rollback plan are even
statable. Everything else (the ledger side-journal shape, the new `SendErrorCode`, the marker
encode/decode module) is ordinary engineering the design phase can carry forward once those four
decisions are made.

## Key Learnings

1. The thread model (`validate.ts:213-304`) already enforces two-party exclusivity, addressee
   correctness, and terminal RESOLVED — F5's "a debate never crosses bindings" validation
   criterion is already a structural property of the shipped F1 code, not new work.
2. `basis` is a closed zod enum forbidden on REQUEST/REPLY and required on RESOLVED
   (`envelope.ts:88-101`), so a debate's AUDIT/COUNTER verdict token cannot use the schema's
   `basis` field at all and must live in `body`, and CONSENSUS must map onto one of the five
   existing basis values rather than a new one.
3. Only the thread's originator may send `RESOLVED[abandoned]` (`validate.ts:271-277`, ADR-13),
   creating a structural asymmetry for who can escalate a debate that hits its round cap on the
   addressee's turn.
4. `GROUP_MESSAGES_PER_MINUTE` rate discipline (`rate.ts`) already exists and explicitly never
   retries, so "coalesced AUDIT+COUNTER" must mean composing two debate steps into one outbound
   envelope before the send reaches the rate check, not a new queueing/retry layer.
5. The ledger has no existing side journal or per-thread round counter; adding one is F1's first
   schema migration since the initial DDL and must follow `migrations.ts`'s forward-only,
   one-transaction-per-step contract exactly.
