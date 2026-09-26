# Conmuta v2 — Data model (draft)

> **Working name.** "Conmuta" is a working name pending trademark clearance (backlog [B-11](../06-backlog/CHECKLIST.md); fallback "Emisario"). File names that embed it (`conmuta.json`, `~/.conmuta/`) follow the final name.

> **Draft status.** Every schema in this document is a **draft to be finalized in the F1 SDD spec** (see [../07-plan/WORK-PLAN.md](../07-plan/WORK-PLAN.md)). Field names, table splits and constant values may change there. What may **not** change without an ADR: the sources of truth, the "never contains" rules, and the invariants marked **I-1 … I-5** (the five non-negotiable invariants in [../01-constitution/CONSTITUTION.md](../01-constitution/CONSTITUTION.md)).

**How to read citations.** `v1 <path>:<lines>` refers to the v1 repository `telegram-agent-bus` at `v1.0.2-2-gbf8f365`; `bundle: maps[key]` / `bundle: research[key]` to the F0 analysis bundle; `D1`–`D11` to the decisions in [../05-tribunal/INDEX.md](../05-tribunal/INDEX.md). Architecture context: [OVERVIEW.md](OVERVIEW.md).

## 0. Stores at a glance

| Store | Format | Location | Owner (writes) | Readers | Contains | Secrets? |
|---|---|---|---|---|---|---|
| Project file | JSON, strict schema | `<repo>/conmuta.json`, **committed** | `conmuta project bind` once; then the team via version control | Thin client, installer, doctor, pre-commit validator | Identifiers only: `project_id`, `group_id`, roster, optional referee | **Never** (I-2) |
| Machine registry | JSON, human-editable, strict schema | `~/.conmuta/registry.json` | CLI wizards, panel, human editor | Daemon (hot-reload), CLI, panel | Bots (token **references**), groups, projects, bindings | **Never** (only `token_ref`) |
| Ledger | SQLite via `node:sqlite`, WAL | `~/.conmuta/ledger.db` (name draft) | Daemon only | Daemon; panel through the daemon | Inbox, offsets, threads, `needs_action`, client cursors, audit log, debate journal | **Never** (I-2, I-5) |
| Secret store | OS keychain (`@napi-rs/keyring`); fallback ACL'd file | Credential Manager / Keychain; fallback `~/.conmuta/secrets/` | `conmuta bot add`, token rotation | Daemon only | Bot tokens keyed by `bot_id` | Yes — the only place |
| Run state | Small files | `~/.conmuta/run/` | Daemon (identity file), first client (spawn lock) | Thin clients | `{port, pid, secret}` per boot; spawn lock | Per-boot IPC secret only, ACL'd |
| Wire | `AGENTBUS/2` envelope | Telegram group + DMs | Daemon (send path) | Peers | See §5 — unchanged from v1 (D1) | Never (secret backstop, v1 `src/secrets.ts:41-86`) |

Everything under `~/.conmuta/` is the daemon's **home**: the only filesystem area the core may touch (D6; v1 `test/security.test.ts:185-192` pattern).

## 1. `conmuta.json` (committed project file)

Source of truth for **who is on this project's bus**. Decided by D5 / objection n4 (backlog B-18). Validated with a **strict** zod schema: unknown keys are rejected, not stripped (v1 stripped them silently, which hid typos — bundle: maps[config-state] risk).

| Field | Type | Required | Source of truth | Rule |
|---|---|---|---|---|
| `schema_version` | integer literal `1` | yes | this file | A future version is refused with an explicit upgrade message; a committed file is never renamed or rewritten by the tool |
| `project_id` | string, opaque stable id (format fixed in F1: UUID v4 or slug `^[a-z0-9][a-z0-9-]{2,40}$`) | yes | this file (minted once by `project bind`) | Must equal the launcher's `--project`; the thin client refuses otherwise (D5) |
| `group_id` | integer `< 0` — numeric supergroup id | yes | this file | Negativity rule inherited (v1 `src/config.ts:176-179`); bijective with `project_id` (I-1) |
| `roster` | array of `RosterEntry`, min 1 | yes | this file (team-shared) | `agent_id` unique; `user_id` unique |
| `roster[].agent_id` | string matching `^@[a-z0-9][a-z0-9-]{1,30}$` (v1 `src/envelope.ts:13`) | yes | — | Enforced at load — v1 did **not** enforce the wire regex on config, so a bad id was emitted and silently discarded by peers as `malformed` (bundle: maps[config-state] must_change) |
| `roster[].user_id` | integer `> 0` — numeric Telegram user id of that member's **bot** | yes | — | The identity anchor on ingest (I-4); the only field authorization uses |
| `roster[].username` | string, display only | yes | — | Never used for authorization: usernames are mutable (bundle: research[security-isolation] T07) |
| `referee` | `agent_id`, must be a roster member | no | this file | Reserved for the group referee role (B-01, F7) |

**Must never contain:** any local path; any token-shaped string (`\d+:[A-Za-z0-9_-]{35}`, v1 `src/secrets.ts:16`); any `Authorization` literal; the bot username of the machine owner as an authority field. A token-shape validator runs in pre-commit and in `doctor` (I-2).

**Example (placeholders only):**

```json
{
  "schema_version": 1,
  "project_id": "prj-example",
  "group_id": -1001234567890,
  "roster": [
    { "agent_id": "@alice-agent", "user_id": 100000001, "username": "alice_example_bot" },
    { "agent_id": "@bob-agent",   "user_id": 100000002, "username": "bob_example_bot" }
  ],
  "referee": "@alice-agent"
}
```

**Derivation for reused v1 modules.** v1's `Config` (v1 `src/config.ts:173-184`) is materialized per binding from this file plus the registry: `agent_id` = `binding.agent_id`, `chat_id` = `group_id`, `roster` = the array re-keyed by `agent_id` into v1's record shape, `bot_username` = `registry.bots[bot_id].username`. This keeps `protocol.ts`, `envelope.ts`, the transports and the doctor consuming the same type they consume today (bundle: maps[config-state] single_tenant_assumptions). Draft: whether the daemon receives the roster from the thin client at session start or from a registry snapshot refreshed at bind time is an F1/F3 decision (F3 = "roster sync"); §2.4 records the current proposal.

## 2. `~/.conmuta/registry.json` (machine registry)

Source of truth for **which of my bots serves which of my project folders**. Human-editable, hot-reloaded by the daemon (D4). Strict zod schema; on an invalid file the daemon keeps the last good registry in memory, raises the condition `registry_invalid` and never renames a human-edited file (draft; contrast with the ledger's quarantine in §3.0).

### 2.0 Top-level fields

| Field | Type | Required | Source of truth | Rule |
|---|---|---|---|---|
| `registry_version` | integer; literal `1` in this draft | yes | written once when the CLI creates the file | Schema version of the registry file, validated at load under the ADR-0015 doctrine that [ADR-0030](../03-adr/0030-sqlite-ledger-and-json-registry.md) (decision 5) applies to the registry: a version this daemon does not know is an invalid file, reported as `registry_invalid`, last good registry kept, file never rewritten or stripped ([ADR-0015](../03-adr/0015-state-integrity-validate-quarantine-migrate-once.md): "a file from the future is quarantined too"). Forward migrations are finalized in the F1 SDD spec |

### 2.1 `bots[]`

| Field | Type | Required | Source of truth | Rule |
|---|---|---|---|---|
| `bot_id` | integer `> 0` — the bot's own numeric user id (`getMe().id`) | yes | Telegram (`getMe`), captured by `bot add` | Primary key; equals my `user_id` in every roster that lists me |
| `username` | string, display only | yes | Telegram (`getMe`) | Refreshed by doctor; never an authority field |
| `token_ref` | object `{ "store": "keychain", "account": "bot:<bot_id>" }` or `{ "store": "file", "path": "~/.conmuta/secrets/<bot_id>.token" }` | yes | `bot add` | **The token itself never appears here** (I-2) |
| `added_at` | ISO 8601 UTC | yes | `bot add` | — |

### 2.2 `groups[]`

| Field | Type | Required | Source of truth | Rule |
|---|---|---|---|---|
| `group_id` | integer `< 0` | yes | `group add` (typed or picked) | Primary key; a basic group is accepted with a warning (promotion to supergroup changes the id: v1 `src/telegram.ts:131-162`) |
| `title` | string, display only | no | `getChat` or the human | — |
| `added_at` | ISO 8601 UTC | yes | `group add` | — |

### 2.3 `projects[]`

| Field | Type | Required | Source of truth | Rule |
|---|---|---|---|---|
| `project_id` | string (same format as `conmuta.json`) | yes | `conmuta.json` of that folder | Primary key |
| `path` | absolute local path | yes | `project bind` | Machine-local, informational (used by the overview table and the doctor); never copied into `conmuta.json` |
| `name` | string, display only | no | Folder name by default | — |

### 2.4 `bindings[]`

| Field | Type | Required | Source of truth | Rule |
|---|---|---|---|---|
| `project_id` | string | yes | `projects[]` | Primary key of a binding (bijectivity makes a separate `binding_id` unnecessary — draft) |
| `bot_id` | integer | yes | `bots[]` | **At most one active binding per `bot_id`** (D2) |
| `group_id` | integer | yes | `groups[]`, must equal `conmuta.json.group_id` | **At most one active binding per `group_id`** |
| `agent_id` | string, wire regex | yes | the human at `project bind` | Must be a roster member whose `user_id` equals `bot_id` (v1 doctor check "agent_id present in own roster", `src/doctor.ts:52-87`) |
| `status` | `"active"` \| `"suspended"` | yes | CLI / panel | Only `active` bindings are polled; suspension is a human action (I-1) |
| `roster_snapshot` | array of `RosterEntry`, min 1 | yes (shipped `src/registry/schema.ts`'s `z.array(rosterEntrySchema).min(1)`, no longer draft) | copied from `conmuta.json` at bind time; refreshed by roster sync (F3) | Lets the daemon admit updates while no client is connected; a mismatch with the client-forwarded roster at session start is surfaced as condition `roster_drift`, never auto-resolved |
| `roster_hash` | `sha256:<hex>` | yes (shipped `src/registry/schema.ts`'s `z.string().regex(...)`, no longer draft) | derived | Cheap drift check in the session handshake ([OVERVIEW.md §9](OVERVIEW.md#9-ipc-handshake-d3-objection-n2)) |
| `bound_at` | ISO 8601 UTC | yes | `project bind` | — |

### 2.5 Registry invariants (checked at every load, by `doctor`, and by the wizards)

| Id | Invariant | Why |
|---|---|---|
| R1 | One `bot_id` in at most one active binding | One token = one poller (H1); the DM plane has no project context (v1 `src/transport/direct.ts:42-66`) — D2 |
| R2 | One `group_id` and one `project_id` in at most one active binding | Bijectivity (I-1) |
| R3 | `binding.agent_id` ∈ roster and `roster[agent_id].user_id === binding.bot_id` | My bot is my roster entry; otherwise my own posts are dropped by peers as `unknown_sender` |
| R4 | `binding.group_id === conmuta.json.group_id` for that project | The committed file and the machine agree on the room |
| R5 | No token-shaped string anywhere in the file | I-2 |
| R6 | Every change is a human action through CLI/panel/editor, written to the audit log; never derived from bus data or Bot API responses | bundle: research[security-isolation] T15; v1 `GroupMigratedError` doctrine |

**Example (placeholders only):**

```json
{
  "registry_version": 1,
  "bots": [
    { "bot_id": 100000001, "username": "alice_example_bot",
      "token_ref": { "store": "keychain", "account": "bot:100000001" },
      "added_at": "2026-09-16T00:00:00Z" }
  ],
  "groups": [
    { "group_id": -1001234567890, "title": "Example project", "added_at": "2026-09-16T00:00:00Z" }
  ],
  "projects": [
    { "project_id": "prj-example", "path": "C:\\work\\example", "name": "example" }
  ],
  "bindings": [
    { "project_id": "prj-example", "bot_id": 100000001, "group_id": -1001234567890,
      "agent_id": "@alice-agent", "status": "active",
      "roster_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "bound_at": "2026-09-16T00:00:00Z" }
  ]
}
```

## 3. SQLite ledger (`node:sqlite`, WAL)

### 3.0 General rules

| Rule | Detail | Evidence |
|---|---|---|
| Engine | Built-in `node:sqlite` (`DatabaseSync`), `PRAGMA journal_mode = WAL`; no `better-sqlite3`, no ORM | D4; bundle: research[packaging-runtime] |
| One file per OS user | `~/.conmuta/ledger.db`; every table is keyed by `project_id` (= binding) or `bot_id` so N bindings share one file safely | D4 |
| Schema version | `PRAGMA user_version`; forward-only migrations run by the daemon at open | v1 `STATE_VERSION` + `migrateToCurrent` pattern (v1 `src/state.ts:333-367`) |
| Corruption / future version | Quarantine: rename to `ledger.corrupt-<epochMs>.db`, start empty, raise condition `ledger_quarantined` | v1 `src/state.ts:375-379` and `conditions.state_quarantined` (`src/state.ts:104-111`) |
| Write-ahead for updates | Inbox rows + audit rows + offset advance are one transaction; the next `getUpdates` carries the new offset only after commit | I-3; H1 confirmation semantics |
| Never stored | Tokens; bodies of rejected/dropped messages; raw error text that could embed a request URL | I-2, I-5; bundle: research[security-isolation] T04, T10 |
| Retention | Named constants inherited from v1 (§7); pruning runs in the daemon, not on client calls | v1 `src/state.ts:217-250` |
| Backups | The daemon never deletes a ledger; migration and quarantine produce `*.bak-<reason>-<date>` siblings | v1 operators' own convention (bundle: maps[config-state]) |

Tables listed by the F0 assignment are 3.1–3.7. Tables marked **aux** are candidates that F1 may fold into their neighbours.

### 3.1 `offsets` — one row per bot token

The `getUpdates` cursor is intrinsically **per token** (group and DM updates arrive together, v1 `src/tools/fetch.ts:463-464`), so this table is keyed by `bot_id`, not by project.

| Column | Type | Required | Source of truth | Notes |
|---|---|---|---|---|
| `bot_id` | INTEGER PK | yes | registry | — |
| `next_update_id` | INTEGER NOT NULL DEFAULT 0 | yes | daemon poller | Advanced only inside the write-ahead transaction (I-3); v1 `state.json.next_update_id` (`src/state.ts:116`) |
| `last_poll_started_at` | TEXT (ISO) | no | daemon | Feeds `status` ("daemon was not polling for N h") |
| `last_poll_ok_at` | TEXT (ISO) | no | daemon | Basis for the re-scoped `gap_warning` (bundle: maps[transport] must_change) |
| `last_error_code` | TEXT | no | daemon | Closed enum from the v1 taxonomy (`TELEGRAM_CONFLICT`, `RATE_LIMITED`, `NETWORK`, …); never message text |
| `retry_after_until` | TEXT (ISO) | no | daemon | From Telegram `429 retry_after` (v1 `src/telegram.ts:90-104`) |
| `poller_pid` | INTEGER | no | daemon | Informational; the singleton lock, not this column, prevents a second poller |

### 3.2 `updates` — the durable inbox

Holds **admitted** updates only (I-4). Rejected updates leave a bodiless audit row (§3.6). `seq` is the position that per-client cursors advance over.

| Column | Type | Required | Source of truth | Notes |
|---|---|---|---|---|
| `seq` | INTEGER PK AUTOINCREMENT | yes | ledger | Monotonic delivery order |
| `bot_id` | INTEGER NOT NULL | yes | poller | — |
| `update_id` | INTEGER NOT NULL | yes | Telegram | `UNIQUE (bot_id, update_id)` — dedup across restarts |
| `project_id` | TEXT NOT NULL | yes | binding at ingest | Every row is scoped to exactly one binding |
| `chat_id` | INTEGER NOT NULL | yes | Telegram | Must equal `binding.group_id` or be a private chat (I-4) |
| `via` | TEXT CHECK IN (`group`,`direct`) | yes | admission step 3 | v1 `classifyVia` (`src/tools/fetch.ts:436-438`), now with the foreign-chat drop before it |
| `message_id` | INTEGER | yes | Telegram | Reply anchoring (v1 `group_message_id`) |
| `message_date` | INTEGER (unix s) | yes | Telegram | Reminder math uses the Telegram date, never the envelope `ts` (v1 `src/protocol.ts:446-458`) |
| `from_user_id` | INTEGER NOT NULL | yes | Telegram `message.from.id` | The verified sender (I-4) |
| `from_agent_id` | TEXT NOT NULL | yes | roster reverse lookup | Overrides whatever the envelope claimed (v1 `src/tools/fetch.ts:538-565`) |
| `eid` | TEXT(12 hex) NOT NULL | yes | envelope | `UNIQUE (project_id, eid)` — replaces the `seen_eids` aux table (F1 resolution, §8; shipped as `ledger/schema.ts`'s `UNIQUE (project_id, eid)` on this table) |
| `envelope_json` | TEXT NOT NULL | yes | decoder + anchor translation | Validated envelope **without the body key** (`ledger/schema.ts`'s own inline comment); the body is stored raw in its own column below and **fenced at presentation**, not at rest |
| `body` | TEXT | nullable | decoder | `NULL` for `apply_outcome IN ('rejected','ignored')` (D-20); populated otherwise |
| `apply_outcome` | TEXT NOT NULL | yes | `applyEnvelope`/admission | Shipped enum (`ledger/schema.ts`'s `CHECK` constraint): `opened` \| `acked` \| `replied` \| `resolved` \| `noted` \| `not_mine` \| `ignored` \| `rejected` — a thread-lifecycle vocabulary, **not** v1's flatter `applied`/`duplicate`/`unapplied` set (v1 `ApplyOutcome`, `src/protocol.ts:18-31`), which this draft previously and incorrectly carried over verbatim |
| `received_at` | TEXT (ISO) | yes | daemon | — |

### 3.3 `threads` — one row per (binding, thread)

Mirrors v1's `ThreadRecord` (v1 `src/state.ts:29-87`) so `applyEnvelope` (v1 `src/protocol.ts:186-333`) is reused unchanged over a per-binding view.

| Column | Type | Required | Source of truth | Notes |
|---|---|---|---|---|
| `project_id` | TEXT | yes | binding | PK part |
| `thread_id` | TEXT(12 hex) | yes | envelope | PK part |
| `status` | TEXT CHECK IN (`open`,`resolved`) | yes | state machine | `RESOLVED` is the only closer and is terminal |
| `opened_type` | TEXT CHECK IN (`REQUEST`,`BROADCAST`) | yes | state machine | `BROADCAST` kept in the union only for migrated rows (v1 `src/state.ts:29-37`) |
| `opened_eid` | TEXT(12 hex) | yes | envelope | — |
| `from_agent_id`, `to_agent_id` | TEXT | yes / nullable | roster-resolved | `to` in **this machine's** namespace when the anchor resolved it |
| `to_user_id` | INTEGER | nullable | envelope anchor | v2 emits it always; a null anchor from a legacy peer keeps v1's fail-open accounting (`unanchored` counter) until a wire change removes it (bundle: research[security-isolation] T07) |
| `body` | TEXT | yes | envelope | Opening body, kept outside the history cap |
| `opened_at` | TEXT (ISO) | yes | Telegram `message.date` | — |
| `opened_message_id`, `group_message_id` | INTEGER | yes / nullable | Telegram | Reply anchoring |
| `via` | TEXT CHECK IN (`group`,`direct`) | yes | admission | — |
| `ack_count`, `acked_at` | INTEGER / TEXT | yes / nullable | state machine | `ACK` never resets the reminder |
| `awaiting` | TEXT | nullable | state machine | Whose turn it is; `needs_action` derives from it |
| `resolved_at`, `resolved_by`, `basis` | TEXT | nullable | state machine | `basis` ∈ the closed set (v1 `src/envelope.ts:18-31`) |
| `closure_delivered` | INTEGER (bool) | yes | send path | Local abandonment keeps `false` |
| `updated_at` | TEXT (ISO) | yes | daemon | — |

**aux `thread_history`** — `(project_id, thread_id, eid PK, type, from_agent_id, body, at, via)`, capped at `MAX_THREAD_HISTORY = 50` per thread (v1 `src/config.ts:155`, `src/protocol.ts:161-172`).

### 3.4 `needs_action` — the "my turn" queue per binding

In v1 this is a pure derivation: open `REQUEST` thread whose `awaiting === me` (v1 `src/protocol.ts:475-477`). **Resolved in F1** (PR-12): a `CREATE VIEW needs_action` over `threads`, backed by the `threads_needs_action` index (`ledger/schema.ts`), not a maintained table.

| Column | Type | Required | Source of truth | Notes |
|---|---|---|---|---|
| `project_id`, `thread_id` | TEXT | yes | `threads` | PK |
| `from_agent_id` | TEXT | yes | `threads` | The peer waiting on me |
| `awaiting_since` | TEXT (ISO) | yes | last peer message awaiting an answer | v1 ADR-27: the entry describes the last peer message, not the opening (`src/tools/fetch.ts:490-498`) |
| `reminder_due_at` | TEXT (ISO) | yes | `opened_at + REQUEST_REMINDER_WINDOW_HOURS` | Default 24 h; `ACK` never resets it (v1 `src/protocol.ts:456-458`) |
| `ack_count` | INTEGER | yes | `threads` | Surfaced as `acked` |

Per-client "already shown" state does **not** live here; it lives in §3.5 so two clients on one project never hide bodies from each other (bundle: maps[transport] must_change).

### 3.5 `client_cursors` — one row per MCP session

| Column | Type | Required | Source of truth | Notes |
|---|---|---|---|---|
| `client_id` | TEXT PK | yes | daemon (random, minted at `POST /session`) | Carried on every tool call |
| `project_id` | TEXT NOT NULL | yes | frozen binding | A client never changes binding |
| `host` | TEXT | no | client hello | Informational: `claude-code`, `cursor`, `opencode`, … |
| `pid` | INTEGER | no | client hello | Stale-session cleanup |
| `started_at`, `last_seen_at` | TEXT (ISO) | yes | daemon | Idle-shutdown input |
| `inbox_seq` | INTEGER NOT NULL DEFAULT 0 | yes | fetch | Last `updates.seq` delivered to **this** client (I-3: per-client cursors) |
| `last_surfaced_digest` | TEXT | nullable | fetch | v1's compact-tick digest (`src/protocol.ts:357-383`), now per client |

**aux `client_surfaced`** — `(client_id, thread_id PK, first_surfaced_at)`: v1's `first_surfaced_at` (`src/state.ts:67`) made per client so `body_omitted` applies only to what this client saw. Rows die with the session.

### 3.6 `audit_log` — append-only, per binding

Answers bundle: research[security-isolation] T10 ("no local audit trail") without storing what I-5 forbids.

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | yes | — |
| `ts` | TEXT (ISO) | yes | — |
| `project_id` | TEXT | nullable | Null only for daemon-level events |
| `bot_id`, `chat_id`, `client_id` | INTEGER / INTEGER / TEXT | nullable | Whatever is known at that point |
| `direction` | TEXT CHECK IN (`send`,`receive`,`reject`,`system`) | yes | — |
| `eid`, `envelope_type` | TEXT | nullable | No body, ever, for `reject` |
| `from_user_id`, `to_user_id` | INTEGER | nullable | Numeric ids only |
| `outcome` | TEXT CHECK IN (`ok`,`degraded`,`rejected`,`dropped`) | yes | — |
| `reason` | TEXT | nullable | Open string, not a DB-level closed enum (`shared/ipc-contract.ts`'s `ipcErrorSchema.code` doc applies the same reasoning here). Shipped in F1, grepped against every `appendAuditRow`/`reason:` call site across `src/daemon/{admission,poller,bindings,send/send-path,ipc/routes}.ts`: `foreign_chat`, `unknown_sender`, `non_envelope`, `unsupported_version`, `malformed`, `duplicate`, `unanchored`, `unauthorized`, `stale`, `not_requestable`, `replayed` (admission/protocol-apply, lowercase — `self_echo` is the one admission outcome that deliberately writes **no** audit row at all, design §8.2 step 5), `WRONG_ROOM`, `SECRET_PATTERN_DETECTED`, `RATE_LIMITED` (send-path), `TELEGRAM_CONFLICT` (poller), `BINDING_CHANGED` (bindings/routes). `ROUNDS_EXHAUSTED` (F5 Arena-light), `DAEMON_START`/`DAEMON_STOP`/`REGISTRY_RELOAD`/`DOCTOR_PROBE` (F2/F3 lifecycle/doctor) are forward-declared for later phases and do not exist in F1's shipped code yet — kept here as the reserved vocabulary those phases will use, not implied to be live today |

Retention and export per binding are configurable (named constants, F1). Never stored: rejected bodies, tokens, raw error text (I-2, I-5).

### 3.7 `debate_journal` — Arena-light side journal (D7, F5)

Debate metadata cannot ride the wire (unknown envelope fields are stripped, v1 `src/envelope.ts:115`), so the daemon journals it here from the body markers it recognises.

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | yes | — |
| `project_id` | TEXT | yes | Debates never cross bindings |
| `debate_id` | TEXT(12 hex) | yes | = `thread_id` of the `PROPOSAL` thread |
| `round` | INTEGER | yes | Daemon-enforced cap `ARENA_LIGHT_MAX_ROUNDS` (value in the F5 spec); exceeding it → `ROUNDS_EXHAUSTED` |
| `turn` | TEXT CHECK IN (`PROPOSAL`,`AUDIT`,`COUNTER`,`CONSENSUS`,`ESCALATE`) | yes | Body-marker subtypes: `PROPOSAL` = `REQUEST`, `AUDIT`/`COUNTER` = `REPLY`, `CONSENSUS` = `RESOLVED` (existing basis), `ESCALATE` = `RESOLVED` basis `abandoned` + marker |
| `verdict` | TEXT | nullable | Closed token set fixed in F5 |
| `eid`, `from_agent_id`, `to_agent_id` | TEXT | yes | — |
| `refs` | TEXT (JSON array) | yes | Pointer-only payloads (commit, PR, path, memory id); bodies stay ≤ 1,921 chars (v1 ADR-23) |
| `basis_at_close` | TEXT | nullable | Set on `CONSENSUS`/`ESCALATE` |
| `at` | TEXT (ISO) | yes | — |

**aux `unknown_senders`** — the "pending unknown senders" list of D5: `(bot_id, user_id PK, username, first_seen_at, last_seen_at, count)`, **no body**. Feeds the `Add group` screen; cleared when the sender becomes rostered.

## 4. Secret store and run state

| Key / file | Store | Value | Written by | Read by | Protection |
|---|---|---|---|---|---|
| service `conmuta`, account `bot:<bot_id>` | `@napi-rs/keyring` → Windows Credential Manager / macOS Keychain | Bot token (~46 chars; fits the 2560-byte Windows blob limit, bundle: research[packaging-runtime]) | `conmuta bot add`, `bot rotate` | Daemon only | OS keychain |
| `~/.conmuta/secrets/<bot_id>.token` (fallback) | File | Bot token | Same | Daemon only | Windows: `icacls <file> /inheritance:r /grant:r <user>:F`; POSIX: `chmod 600`; verified by `doctor` (bundle: research[security-isolation] T09) |
| `~/.conmuta/run/daemon.json` | File | `{ "port": <int>, "pid": <int>, "secret": <random> }` | Daemon, on **every** start (fresh secret) | Thin clients (handshake, [OVERVIEW.md §9](OVERVIEW.md#9-ipc-handshake-d3-objection-n2)) | ACL'd to the user; invalid when `pid` is dead |
| `~/.conmuta/run/daemon.lock` | File (`wx`) | `{ "pid": <int>, "acquired_at": <ISO>, "heartbeat_at": <ISO> }` | First client that spawns; the daemon while alive | Clients deciding whether to spawn | Stale after ~10 s (D3); owner-checked release (v1 `src/state.ts:541-577` pattern) |
| Panel token | Memory; shown once by `conmuta panel` | Per-boot random token | Daemon | Browser | Whether it shares the run file or is a separate value is an F3 detail |

Token hygiene (I-2), restated for the data layer: tokens never traverse env into IDE processes; never appear in URLs, logs, errors or stacks; `doctor` and the panel print `bot_id` only; the token-shape regex `\d+:[A-Za-z0-9_-]{35}` (v1 `src/secrets.ts:16`) is the shared validator for project files, registry, logs and tests. Rotation follows BotFather `/token`; `bot rotate` replaces the stored value and restarts that bot's poller.

## 5. Wire envelope (unchanged, for reference)

No wire change in v2 (D1). Emit `AGENTBUS/2`; accept `/1` and `/2` (v1 `src/config.ts:26, 40`). Frame: bold header, blank, one-line body, blank, `AGENTBUS/2 {json}` (v1 `src/envelope.ts:200-202`); the decoder takes the last sentinel line (v1 `src/envelope.ts:298-314`).

| Field | Type / rule | Notes (v1 `src/envelope.ts:33-60`) |
|---|---|---|
| `eid` | 12 lowercase hex | Dedup key |
| `type` | `BROADCAST` \| `REQUEST` \| `REPLY` \| `ACK` \| `RESOLVED` | Adding a type is a wire change (v1 ADR-20/21) |
| `from`, `to` | `^@[a-z0-9][a-z0-9-]{1,30}$`; `to` null only for `BROADCAST` | `from` is overwritten by the verified sender on ingest |
| `thread` | 12 lowercase hex | — |
| `ts` | ISO 8601 UTC | Never used for reminders |
| `body` | 1..3000 chars, one line (`normalizeBody`, v1 `src/envelope.ts:241-269`) | Effective ceiling ~1,921 plain-ASCII chars |
| `basis` | forbidden on `BROADCAST`/`REQUEST`/`REPLY`; exactly `acknowledged-only` on `ACK`; required on `RESOLVED` ∈ {`context-shared`, `work-confirmed`, `lock-released`, `human-approved`, `abandoned`} | Adding a basis value is a wire change (v1 `README.md:179`) |
| `approval_ref` | required iff `basis = human-approved` | Audit trail only |
| `to_user_id` | optional integer; forbidden on `BROADCAST` | Identity anchor; v2 always emits it |

Unknown fields are stripped (v1 `src/envelope.ts:115`); Arena-light metadata therefore lives in body markers (§3.7), never in new JSON fields.

## 6. Migration from `~/.agentbus` (F1, B-13)

Unilateral, no wire change, no peer coordination (D1, D11 F1). v1 files are backed up as `*.bak-pre-v2-<date>` following the operators' existing convention (bundle: maps[config-state]) and never deleted. The migration synthesizes the registry; **assigning the project folder remains a human action** (`project bind`), because v1 has no notion of project.

| v1 artifact (v1 `src/config.ts:173-184`, `src/state.ts:113-127`) | v2 destination |
|---|---|
| `config.json.agent_id`, `bot_username`, `roster[agent_id].user_id` | `registry.bots[]` = `{bot_id: roster[agent_id].user_id, username: bot_username}`; the future `binding.agent_id` |
| `config.json.chat_id` | `registry.groups[]` = `{group_id: chat_id}` |
| `config.json.roster` | `roster_snapshot` for the future binding; proposed `roster` for the project's `conmuta.json` at `project bind` |
| `config.json.bot_token` or env `AGENTBUS_BOT_TOKEN` | Secret store under `bot:<bot_id>`; removed from the JSON copy (the backup keeps it — the runbook must say so) |
| `config.json.reminder_window_hours`, `secret_markers` | Per-binding settings (draft location: `bindings[]`) |
| `state.json.next_update_id` | `offsets.next_update_id` |
| `state.json.threads` (+ `history`) | `threads` / `thread_history` via the v1 loader and `migrateToCurrent` (v1 `src/state.ts:333-367`) |
| `state.json.seen_eids` | `seen_eids` aux or `UNIQUE (project_id, eid)` on `updates` |
| `state.json.conditions` | Daemon conditions per binding |
| `state.json.last_surfaced_digest`, `threads[].first_surfaced_at` | Dropped — they become per client (§3.5) |
| `lock` | Not migrated |

Peers who never upgrade are unaffected: the wire is identical, the same guarantee v1.0.2 gave (v1 `docs/UPGRADE-v1.0.2.md:16-24`).

## 7. Named constants inherited (values to confirm in F1)

Every numeric constant is a named constant with its reasoning (constitution: named-constant rule). Values below are v1's; F1 confirms or changes them with a reason.

| Constant | v1 value | v1 evidence | v2 scope |
|---|---|---|---|
| `BOT_API_RETENTION_HOURS` | 24 | `src/config.ts:59` | Daemon-down warning threshold |
| `MAX_LONGPOLL_SECONDS` | 50 | `src/config.ts:112` | Daemon loop timeout (H4) |
| `REQUEST_REMINDER_WINDOW_HOURS` | 24 | `src/config.ts:53` | `needs_action.reminder_due_at` |
| `SEEN_EID_RETENTION_DAYS` | 7 | `src/config.ts:139` | Dedup retention |
| `RESOLVED_THREAD_RETENTION_DAYS` | 30 | `src/config.ts:147` | Thread pruning |
| `MAX_THREAD_HISTORY` | 50 | `src/config.ts:155` | `thread_history` cap |
| `OPEN_THREAD_BACKLOG_THRESHOLD` | 50 | `src/config.ts:166` | Condition `open_thread_backlog` |
| `MAX_BODY_CHARS` / `TELEGRAM_MAX_TEXT_CHARS` | 3000 / 4096 | `src/config.ts:55, 57` | Send-side guard |
| `LOCK_STALE_SECONDS` | 120 | `src/config.ts:114` | Replaced by the spawn-lock staleness (~10 s, D3) and the in-daemon mutex |
| `SPAWN_LOCK_STALE_SECONDS` | ~10 (new) | D3 | Daemon election |
| `ARENA_LIGHT_MAX_ROUNDS` | new | D7 | Value in the F5 spec |

## 8. Open points

| Point | Status |
|---|---|
| `project_id` format (UUID v4 vs slug) | F1 |
| Roster delivery to the daemon (registry snapshot vs client-forwarded at session start) and the F3 roster-sync mechanism | F1 / F3 |
| `needs_action` as VIEW vs table; `seen_eids` as table vs UNIQUE index | **Resolved in F1** (PR-12): `needs_action` ships as a `CREATE VIEW` backed by the `threads_needs_action` index (`ledger/schema.ts`); `seen_eids` was folded into `UNIQUE (project_id, eid)` on `updates`, no separate table |
| Bearer derivation (raw per-boot secret vs session token) | Spike B-08, F1 |
| Keyring prebuilds on win-x64 / darwin-arm64 and ACL fallback tests | B-15 |
| Audit-log retention and export format | F1 |
| Verdict token set and `ARENA_LIGHT_MAX_ROUNDS` | F5 |
| Final file names (`conmuta.json`, `~/.conmuta/`, `ledger.db`) | **Pending Director decision** (B-11) |
