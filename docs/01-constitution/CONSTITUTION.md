# Conmuta — Constitution

> **Working name.** "Conmuta" is a working name pending trademark clearance (backlog item B-11 in
> [CHECKLIST.md](../06-backlog/CHECKLIST.md)); the fallback is "Emisario". The Director decides.

| Field | Value |
|---|---|
| Status | F0 landing — ratified by tribunal CONSENSUS in debate `bus-v2-landing-architecture-001`; **Director confirmation pending** where marked |
| Date | 2026-09-15 |
| Debate record | [../05-tribunal/INDEX.md](../05-tribunal/INDEX.md) |
| Companion documents | [GOVERNANCE.md](./GOVERNANCE.md) (how decisions are made) · [../03-adr/INDEX.md](../03-adr/INDEX.md) (why each decision was made) · [../02-architecture/OVERVIEW.md](../02-architecture/OVERVIEW.md) (what was built) · [../02-architecture/THREAT-MODEL.md](../02-architecture/THREAT-MODEL.md) (what each invariant defends against) |

This document is the immutable law of the project: what no phase, pull request, debate or
convenience may violate. It states **what** is non-negotiable. **How** decisions are made lives in
GOVERNANCE.md. Nothing here describes live operational state; see GOVERNANCE.md §8.

---

## 0. Precedence

When two sources disagree, the higher row wins. A conflict is reported, never resolved silently.

| Rank | Source | Wins on |
|---|---|---|
| 1 | The Director's explicit, recorded decision | everything — recorded as a Director note, a debate outcome or an ADR |
| 2 | This constitution | any conflict with a lower row |
| 3 | Accepted ADRs ([../03-adr/INDEX.md](../03-adr/INDEX.md)) | design questions |
| 4 | Architecture and data-model documents | descriptions of the landed design |
| 5 | Work plan and backlog | sequencing and pending items |
| 6 | A dated live-state log, when one exists | questions of live state only — which machine runs what — never design |

Row 6 is inherited from v1: "When this log and another document disagree, this log wins for
questions of live state … The reverse holds for design questions: `design.md` and the ADRs win
there" (v1 `docs/ROLLOUT-LOG.md:31-34`).

---

## 1. The governing rule (inherited from v1 ADR-12)

> **A documented guarantee must be pinned by a test that can fail.**
>
> An assertion about shape (`does the output look wrapped?`) does not pin an invariant about
> containment (`can the wrapped content escape?`). Every guarantee this design states in prose now
> names the invariant it rests on, and the invariant — not an example of it — is what the test
> asserts.

Source: v1 `openspec/changes/telegram-agent-bus/design.md:270`. The rule was written after three
severe defects were found *behind* documented guarantees, each covered by a test that could not fail
(`design.md:262-268`).

Consequences that bind this project:

- Every article below that states a runtime guarantee names the test that must pin it. Until the
  code exists, the named test is a requirement on the phase that introduces the guarantee
  ([../07-plan/WORK-PLAN.md](../07-plan/WORK-PLAN.md)). A guarantee without a named test is a claim.
- A regression test that pins one attack string is rejected for the same reason the greedy regex it
  replaces was rejected: it pins an example, not the invariant (`design.md:270`).
- "No finding is closed by inspection alone" (v1 `docs/functional-audit/README.md:22-23`).
- Every ADR ends with a section **Tests that must pin it** (see the template in GOVERNANCE.md §4).

---

## 2. The five non-negotiable invariants

Verbatim from the decision record of `bus-v2-landing-architecture-001` (derived from the
`security-isolation` research in the analysis bundle, threats T01–T15). They cannot be weakened by
amendment (§9). Each is owned by an ADR and must be pinned by the tests listed.

### Invariant 1 — BIJECTIVE BINDING

> One bot token <-> one group <-> one project folder; a bot is a member of exactly one group and
> never reused across bindings; send carries no destination: the daemon derives (bot, group, roster)
> from the binding fixed at MCP-session start and asserts `chat_id === binding.group_id` before every
> `sendMessage`; a two-binding "wrong room" test runs in CI.

| | |
|---|---|
| Owner | [ADR-0028](../03-adr/0028-project-scoped-bijective-binding.md) — registry invariant "one `bot_id` in at most one active binding" |
| Defends against | T01 cross-project leakage on send, T02 on receive, T08 cross-tenant spoofing (research `security-isolation`) |
| Tests that must pin it | the two-binding wrong-room CI test; the registry rejects a second active binding for a `bot_id`; the send path asserts `chat_id === binding.group_id` and a mismatched binding fails closed before any network call; the launcher refuses to start when `--project` and the nearest `conmuta.json` disagree (D5) |

### Invariant 2 — SECRETS NEVER LEAVE THE DAEMON

> Project-scoped files bind by numeric ids only; tokens live in the machine secret store; never
> traverse env into IDE processes; never appear in URLs, logs, errors, stacks; a validator rejects
> token-shaped strings in project files.

| | |
|---|---|
| Owner | [ADR-0029](../03-adr/0029-per-user-daemon-and-thin-clients.md) (thin clients hold no token) and [ADR-0030](../03-adr/0030-sqlite-ledger-and-json-registry.md) (secret store) |
| Defends against | T03 committed secret, T04 token theft, T09 Windows has no POSIX modes, T14 loopback IPC exposure |
| Tests that must pin it | the token-shape validator runs in pre-commit and in `doctor` (D5); the client bundle contains no token resolution path; error and log formatting never emits a token-shaped string (v1 leaked the token in every request URL, `src/telegram.ts:361`); ACL/mode enforcement tested on Windows and POSIX (B-15); the IPC handshake proves daemon identity before any bearer is sent (D3, spike B-08) |

### Invariant 3 — ONE POLLER, DURABLE INBOX

> The daemon is the sole `getUpdates` consumer per token; every update is written to the durable
> inbox before the offset is confirmed; clients read through per-client cursors; a second daemon
> instance refuses to poll.

| | |
|---|---|
| Owner | [ADR-0029](../03-adr/0029-per-user-daemon-and-thin-clients.md) and [ADR-0030](../03-adr/0030-sqlite-ledger-and-json-registry.md) |
| Defends against | T05 concurrent clients (HTTP 409, one shared cursor, 24 h retention loss); v1 `BRIDGE_BUSY`/`body_omitted` collisions (`src/tools/fetch.ts:500-930`) |
| Tests that must pin it | inbox write precedes offset confirmation (ordering test that fails when swapped); a second daemon instance on the same user refuses to poll; a client that finds no daemon returns `DAEMON_DOWN` and never calls `getUpdates` (static assertion over the client bundle); per-client cursor advance does not affect another client's view |

### Invariant 4 — NUMERIC-ID IDENTITY + SCOPE CHECK ON INGEST

> Sender = `message.from.id` verified against the binding's roster; chat must be the binding's group
> or a private chat from a roster member; anything else is counted (`foreign_chat` /
> `unknown_sender`) and dropped, never surfaced, never replied to; no fail-open anchors.

| | |
|---|---|
| Owner | inherited v1 ADR-10 and ADR-18 semantics, scoped per binding by [ADR-0028](../03-adr/0028-project-scoped-bijective-binding.md) |
| Defends against | T02 foreign-chat ingest (v1 had no chat-scope filter, `src/tools/fetch.ts:436-437, 566`), T07 roster spoofing, the null-anchor fail-open path (v1 `src/protocol.ts:241-248`) |
| Tests that must pin it | a message from a chat other than the binding's group or a roster member's private chat is counted and dropped, body never persisted; an unknown sender is counted and dropped; a missing addressee anchor fails **closed**; the envelope's self-declared `from` never overrides the numeric sender (v1 `src/tools/fetch.ts:404-415`) |

The research draft of this invariant also required an envelope `project_id` and a `foreign_project`
counter. That clause was dropped by decision D2: the binding fixes the scope without a wire change
(see §4). It is not part of the invariant.

### Invariant 5 — PEER CONTENT IS DATA, NEVER ACTION

> Everything received is fenced and origin-labelled; the core has no exec and no fs outside its home;
> nothing from the bus is executed or applied automatically (no PATCH auto-apply; CONSENSUS is a
> message); rounds and participants are capped; every send/receive/reject is appended to a
> per-binding audit log that stores no rejected bodies and no tokens.

| | |
|---|---|
| Owner | §3 below (inherited ADR-06), decisions D6 and D7 |
| Defends against | T06 prompt injection into a coding agent, T13 unbounded debates and PATCH-as-instruction, T10 no local audit trail |
| Tests that must pin it | fence soundness — the fenced content cannot form a tag of any kind (v1 `test/tools/fetch.test.ts:86-93, 328-357`); static assertions over the built bundle — no `child_process`, `node:fs` only inside the home-scoped modules, no timers, no settings paths (v1 `test/security.test.ts:176-270`); the daemon rejects a debate turn past the round cap; the audit log schema has no column for a rejected body and the writer never receives one |

---

## 3. Autonomy boundary (inherited from v1 ADR-06)

The seven layers are inherited verbatim in spirit (v1 `design.md:181-197`). Layers 1–3 are
structural properties verified by static assertions over the built bundle; 4 and 6 are schema and
regex validation before any network call; 5 is an audit trail honestly labelled unverifiable; 7 is a
mitigation.

| # | Layer | Rule in Conmuta | Strength |
|---|---|---|---|
| 1 | Capability isolation | The core (daemon + thin client) has no exec, no shell, no arbitrary file access, no ability to invoke another tool. Only effects: HTTPS to `api.telegram.org`, loopback IPC on `127.0.0.1`, reads/writes under its own home (`~/.conmuta`) | Enforced, load-bearing |
| 2 | Zero autonomous emission | No timer that emits, no background task that sends, no auto-reply. The daemon's long-poll is a **read** loop; the only send path is an explicit tool call in an agent turn. Version observability rides the render-only header of posts the agent sends anyway — no heartbeat (amendment A1, B-14) | Enforced |
| 3 | Settings immutability | No component reads, writes or proposes edits to any IDE settings or permissions file (`.claude/settings*.json`, `permissions.allow` or their equivalents in other hosts). The installer writes only an id-only MCP registration entry into a **detected** tool's project-level config, merging never overwriting, opt-in per tool (D5) | Enforced |
| 4 | Fail-closed `basis` enum | Every `RESOLVED` declares `basis ∈ {context-shared, work-confirmed, lock-released, human-approved, abandoned}`; nothing else has a representation (v1 ADR-06 L4, ADR-13) | Enforced at schema level |
| 5 | `human-approved` escape hatch | Requires a non-empty `approval_ref`. The bus cannot verify that a human approved anything | Audit trail, not a control |
| 6 | Secret-pattern backstop | Every outbound body and `approval_ref` is scanned before either channel is written; on a match the tool names the rule, never the matched text (v1 `design.md:197`, `src/secrets.ts:41-86`) | Enforced for known shapes; not a classifier |
| 7 | Untrusted-input framing | Incoming bodies are returned inside a delimited, labelled, origin-tagged untrusted block whose fence cannot be forged (`<` escaped, v1 ADR-12 remediation 1) | Mitigation |

Decisions that fix the boundary for v2:

- **The core is a passive switch** (D6, Alpha objection n1). A headless runner that invokes an
  agent CLI on new `needs_action` violates layers 1–2 and creates an RCE vector via indirect prompt
  injection from Telegram. It is out of the core: an optional satellite package `@conmuta/runner`,
  post-F6, with its own constitution, read/reply-only by default (B-06). Its constitution may not be
  weaker than invariants 2, 4 and 5.
- **The Claude Code channels adapter is a doorbell only** (D6): no body crosses, it never writes,
  it never replaces a fetch (v1 ADR-24 semantics, `design.md:509-537`).
- **Never `deleteMessage`** anywhere (v1 hard rule 1, `docs/functional-audit/HANDOFF.md:297`;
  asserted statically in `test/security.test.ts:205-214`).
- **The bot never holds an admin role** in its group (v1 hard rule 2, `HANDOFF.md:298-299`). Spike
  B-07 measures whether non-admin bots see each other's posts; if it forces a change, that change
  needs an ADR that re-examines this rule and the "pinning" entry in §6 explicitly.

---

## 4. Wire and freeze doctrine

The wire is the set of bytes a peer's decoder sees. Presentation (Telegram entities, HTML render) is
not the wire — that distinction was measured against the live Bot API, not argued (v1 ADR-05c,
`design.md:156-171`).

| Rule | Statement | Source |
|---|---|---|
| W1 | v2 emits `AGENTBUS/2` and accepts `/1` and `/2`. **No wire change in v2.** | D1; v1 ADR-21 `design.md:449-467`; `test/config.test.ts:61-75` |
| W2 | Any future wire change happens only by ADR, and executes as a **per-binding coordinated send freeze**. Arena-light adds no wire types (body markers over existing types, D7); an N-party tribunal would need `AGENTBUS/3` (B-10). | D1, D7 |
| W3 | A wire change is a **send freeze, never an ordering**. A partially-upgraded roster fails in both directions at once, and in both the sender still sees `delivery.ok: true`. | v1 `README.md:162-166`; `CLAUDE.md:247, 253` |
| W4 | **An instruction never names a version number.** The number goes false the moment the pin moves; the reader is sent to where the pin is published. | v1 `CLAUDE.md:253`; `docs/ROLLOUT-LOG.md:1217` |
| W5 | **`SERVER_VERSION` is the wire-compatibility gate, not a feature counter.** It moves only when a peer's decoder would see different bytes. | v1 `design.md:531`; `README.md:121` |
| W6 | **The repository never says what a machine runs.** Only the running node's status tool does; a version written without being measured is marked as inferred. | v1 `CLAUDE.md:235`; `docs/ROLLOUT-LOG.md:26-28` |
| W7 | The wire deltas of each protocol version are enumerated by the ADR that introduces them; an unlisted delta means something was missed — re-audit before adding. (Restates v1 Rule 8, `HANDOFF.md:311-314`, whose fixed count of three was specific to `AGENTBUS/2`.) | analysis bundle, map `governance-docs` |
| W8 | The protocol is a property of the node, never of a message (per-message versioning is closed, §6). Emitted and accepted sentinels are two constants that a test forces to agree. | v1 ADR-21; `test/config.test.ts:61-69` |
| W9 | The freeze unit in v2 is the **binding**: one bot, one group, one roster (D2). Onboarding a new member of a binding is not a freeze, but merges into one when the live roster is not on the pin. | v1 `openspec/changes/telegram-agent-bus/tasks.md:129`; D2 |
| W10 | `doctor`'s online checks send real DMs; it is never run inside a send freeze. | v1 `HANDOFF.md:147`; F2 in the work plan |

---

## 5. Named-constant rule

> Every numeric constant … must be a named constant … with its reasoning in the doc comment. … A
> number a handoff leaves undefined will be invented, and the invention will not announce itself.

Source: v1 `docs/functional-audit/HANDOFF.md:363-369`; pinned in v1 by
`test/config.test.ts:49-59`.

- Every numeric constant is a named constant with its reasoning next to it. This includes the values
  the decision record already fixes: the long-poll clamp (50 s), the stale-heartbeat window (~10 s),
  the Telegram text ceiling (4096), the group rate limit (20 msg/min), the effective pointer-only
  ceiling (1,921 chars, v1 ADR-23) and the Arena-light round cap. Their names and values are fixed
  in the F1 and F5 SDD specs, not here.
- A constant derived from another is derived in code, never restated as a literal, so the two
  cannot drift (v1 `HANDOFF.md:360`, `RETENTION_WARNING_HOURS`).
- When a constant is a tuning parameter, the test pins the falsifiable invariant it serves, never
  the number (v1 ADR-17, `HANDOFF.md:359`).
- A constant added while implementing is added to the phase's constants table in the same commit.

---

## 6. Closed permanently — with two items consciously reopened

Inherited from v1 `docs/functional-audit/06-verdict.md:160-177` (single copy; the v1 duplicate in
`HANDOFF.md:336-345` is retired). Recorded so a future reader does not mistake a decision for an
oversight. An entry is reopened **only** by an ADR that cites it by name, passes a debate and is
authorized by the Director (§9).

| Entry | v1 reasoning | Status in Conmuta |
|---|---|---|
| Multipart messages | The bus is a control plane; anything large belongs in the repository behind a pointer | **Closed.** Pointer-only payloads are reaffirmed by D7 |
| Pinning the checkpoint | `pinChatMessage` requires admin rights and the bot must never hold an admin role | **Closed.** See the admin rule in §3 and spike B-07 |
| Reducing group volume by suppressing posts | Breaks ADR-04's record of intent; the lever is notification, never suppression | **Closed.** D7 uses `disable_notification` on debate turns and coalesces AUDIT+COUNTER — notification, not suppression |
| Auto-following a group migration | `chat_id` is an access-control boundary; following silently would post to a chat no operator authorized | **Closed and strengthened.** Under Invariant 1 the binding is fixed; a re-binding is an explicit, audit-logged human action in the control panel (research `security-isolation` T15) |
| Rewriting `saveState`'s whole-file write | "an append log or a database would violate ADR-02's zero-dependency stance and ADR-03's no-daemon simplicity" | **Reopened, consciously.** The entry rests on two premises and both are superseded: *no daemon* (ADR-03) by [ADR-0029](../03-adr/0029-per-user-daemon-and-thin-clients.md); *no database* (ADR-02 in part) by [ADR-0030](../03-adr/0030-sqlite-ledger-and-json-registry.md). Reason: Invariant 3 cannot be met atomically with whole-file JSON, and the production `state.json` is 1.4 MB with manual backups. The registry stays human-editable JSON |
| A runtime peer-probe MCP tool | Send already reports per-recipient failure; the status tool's structural no-network guarantee is worth more | **Closed.** The status tool stays no-network. `doctor` (F2) is a CLI command with an opt-in DM probe, not an MCP tool |
| Per-message protocol versioning | The protocol is a property of the node; `server_version` already covers peer capability | **Closed.** Rule W8 |

Inherited hard rules that are neither invariants nor closed entries (v1 `HANDOFF.md:297-309`):

| v1 rule | Status |
|---|---|
| 1 Never add `deleteMessage` | inherited (§3) |
| 2 The bot never holds an admin role | inherited, subject to spike B-07 (§3) |
| 3 No new runtime dependencies | **superseded** by D4/D9 ([ADR-0030](../03-adr/0030-sqlite-ledger-and-json-registry.md), [ADR-0031](../03-adr/0031-npm-distribution-and-license.md)); the replacement rule is a compiled `dist`, `npm-shrinkwrap` and a `files` whitelist, and `--ignore-scripts` installs (research `security-isolation` T11) |
| 4 No timers, no autonomous emission | inherited (§3 layer 2) |
| 5 Strict TDD | inherited (GOVERNANCE.md §6) |
| 6 ≤ 400 lines per PR | inherited (GOVERNANCE.md §6) |
| 7 A documented guarantee must be backed by a test that can fail | inherited (§1) |

---

## 7. Language contract

| Domain | Language | Source |
|---|---|---|
| Code, identifiers, comments, commit messages, specs, ADRs, documentation, tests, fixtures, UI copy | **English**, neutral professional register | v1 `CLAUDE.md:25`; `docs/functional-audit/README.md:73-76`; decision record |
| Conversation with the Director | Spanish (Mexico), formal and technical | decision record |
| Runtime messages between agents over the bus | may be Spanish — team preference; the bus does not constrain body language | decision record |
| Director quotes that are requirements | kept verbatim in Spanish, marked as quotes, inside English documents | writing rules of this repository |
| Wire-visible tokens | frozen regardless of language — e.g. the `[CHECKPOINT-ESTADO]` marker (v1 `src/config.ts:116`) stays because it is on the wire and v2 has no wire change (W1) | v1 ADR-08; research `security-isolation` T12 |

---

## 8. Human authority boundaries

- The Director authorizes and has the last word. Nothing is committed to this repository without
  the Director; consensus authorizes the work, not the merge (GOVERNANCE.md §2).
- Boundaries only a human may move, each an explicit, audit-logged action and never inferred by the
  system: the group `chat_id` of a binding (v1 `src/telegram.ts:140-160`, hard rule 12), the
  roster of a binding (v1 ADR-10 — the roster is the access list), the assignment of a project to a
  binding (D5, installer flow "Assign project"), and the membership of a bot in a group.
- The bus authorizes nothing. `CONSENSUS` is a message (Invariant 5). `human-approved` is an audit
  trail, not a control (§3 layer 5). The v1 "pending unknown senders" bootstrap list carries
  `user_id` and `username`, never a body, and grants nothing until a human adds the sender to a
  roster (D5).

---

## 9. Amendment procedure

1. **Who may propose.** The writer of the tree, an auditor (as a `PATCH` proposal, never a commit),
   or the Director at any time.
2. **Path.** An Arena debate reaches CONSENSUS or an explicit Director ESCALATE decision
   (GOVERNANCE.md §2) → an ADR is written with status "accepted by tribunal, pending Director" → the
   Director authorizes → the constitution text is changed **in the same pull request** as the ADR,
   citing the ADR number inline → the tribunal record and the ADR index are updated.
3. **What cannot be weakened by amendment.** The five invariants (§2) and the governing rule (§1)
   may be clarified or strengthened. Retiring or weakening one requires the Director's explicit
   recorded decision plus a superseding ADR that names the invariant and the tests it releases; the
   CI tests that pin an invariant are never deleted ahead of that ADR.
4. **Reopening a closed entry (§6)** follows step 2 and the ADR cites the entry by name.
5. **Wire changes (§4)** follow step 2 and the ADR includes the freeze runbook and the
   `SERVER_VERSION` decision.
6. **Every amendment is dated** and appended to the changelog below with its debate id and ADR.

---

## 10. Traceability

| Article | Primary source |
|---|---|
| 0 Precedence | v1 `docs/ROLLOUT-LOG.md:20-34`; decision record ("the Director authorizes and has the last word") |
| 1 Governing rule | v1 `design.md:258-291` (ADR-12); `docs/functional-audit/README.md:22-23` |
| 2 Five invariants | decision record, verbatim; analysis bundle `research[security-isolation]` recommendation and findings T01–T15 |
| 3 Autonomy boundary | v1 `design.md:181-197` (ADR-06); `test/security.test.ts:176-270`; D6; B-06, B-14 |
| 4 Wire and freeze doctrine | D1, D2, D7; v1 `design.md:449-467, 531`; `README.md:121, 162-166`; `CLAUDE.md:235, 247, 253`; `HANDOFF.md:311-314` |
| 5 Named-constant rule | v1 `HANDOFF.md:359-369`; `test/config.test.ts:49-59` |
| 6 Closed permanently | v1 `06-verdict.md:160-177`; `HANDOFF.md:297-309, 336-345`; D3, D4 |
| 7 Language contract | v1 `CLAUDE.md:25`; `docs/functional-audit/README.md:73-76`; decision record |
| 8 Human authority | decision record; v1 `src/telegram.ts:140-160`; `HANDOFF.md:322-323`; research T15 |
| 9 Amendment | decision record (one writer + tribunal; Director last word); GOVERNANCE.md §2–§4 |

## Changelog

| Version | Date | Change | Debate / ADR |
|---|---|---|---|
| 0.1 | 2026-09-15 | Initial text from the landing debate; pending Director confirmation | `bus-v2-landing-architecture-001`; ADR-0028..0031 |
