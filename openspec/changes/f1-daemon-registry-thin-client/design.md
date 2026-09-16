# Design: F1 — Daemon, registry, thin client, migration

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Implements | [ADR-0028](../../../docs/03-adr/0028-project-scoped-bijective-binding.md), [ADR-0029](../../../docs/03-adr/0029-per-user-daemon-and-thin-clients.md), [ADR-0030](../../../docs/03-adr/0030-sqlite-ledger-and-json-registry.md) in full; the packaging rules of [ADR-0031](../../../docs/03-adr/0031-npm-distribution-and-license.md). No ADR amendment is needed (the proposal states none; every choice below elaborates a delegated point). |
| Inputs | [proposal.md](./proposal.md) (D-01..D-10); tribunal `bus-v2-f1-proposal-001` rulings (a)–(e), not reopened here; [exploration.md](./exploration.md) §Q1–Q4; v1 checkout `telegram-agent-bus` at `bf8f365` (read-only evidence, cited `v1:path:lines`) |
| Status | design — pending tribunal audit (Alpha) and reconciliation with the parallel `sdd-spec` output |
| Binding rules | Strict TDD from the first commit; PRs ≤ `review_budget_lines` (400), auto-chained; English artifacts; placeholders only; no bare numeric constant |

**Read first.** §2 fixes names, §3 fixes numbers, §18 lists the decisions this design makes and why. Everything else elaborates one ADR rule and names the test that pins it. Sections are numbered to match the orchestrator's 20-item contract.

---

## 1. Technical approach

Three compile units over one pure layer, built with plain `tsc` project references so the client unit **cannot** import the daemon-side stores at compile time, and a closure-walking static test that re-proves it over the built `dist/` (PT-07, PT-27, PT-28). The daemon owns Telegram, the ledger, the registry and the secret store; the thin client owns the MCP surface, the binding cross-check, the handshake and the single spawn site (D-01). v1's pure modules are vendored from `bf8f365` with a provenance header and a hash test that makes "verbatim" falsifiable (D-08, W1).

```text
IDE host ──stdio──> client (createServer(deps), deps = IPC stubs)
                       │  loopback HTTP 127.0.0.1:<random>, identity proof, then per-session bearer
                       ▼
                    daemon ── registry.json (hot-reload, read-only in the daemon)
                       │   ── secret store (keyring | ACL'd file) ── TelegramApiClient per binding
                       │   ── ledger.db (WAL): offsets, updates, threads, cursors, audit, unknown_senders
                       ├── poller per active binding ──> admission (7 steps) ──> write-ahead transaction
                       └── send path per binding ──> room guard ──> DualWriteTransport ──> Telegram
```

---

## 2. Package and bundle layout

### 2.1 Source tree (names fixed here; the proposal left them "design fixes names")

| Path | Unit | Content |
|---|---|---|
| `src/shared/` | shared (pure) | `constants.ts`, `version.ts`, `envelope.ts`, `secrets.ts`, `protocol-apply.ts`, `protocol-select.ts`, `thread-record.ts`, `fence.ts`, `tool-schemas.ts`, `tool-output.ts`, `error-payload.ts`, `project-file.ts`, `token-shape.ts`, `roster-hash.ts`, `ipc-contract.ts` |
| `src/daemon/` | daemon | `main.ts` (gate then dynamic import), `node-floor.ts`, `bootstrap.ts` (composition root, `startDaemon(options)`), `home.ts`, `log.ts`, `lifecycle/{lock,heartbeat,run-file,idle}.ts`, `bindings.ts`, `binding-config.ts`, `telegram.ts`, `transport/{types,group,direct,dual,room-guard}.ts`, `poller.ts`, `admission.ts`, `serve/{fetch,status,thread}.ts`, `send/{validate,send-path,rate}.ts`, `ipc/{server,handshake,sessions,routes}.ts`, `conditions.ts` |
| `src/ledger/` | daemon | `open.ts`, `schema.ts`, `migrations.ts`, `transaction.ts`, `inbox.ts`, `threads.ts`, `cursors.ts`, `audit.ts`, `unknown-senders.ts`, `retention.ts`, `conditions-store.ts` |
| `src/registry/` | daemon | `schema.ts`, `invariants.ts`, `loader.ts` |
| `src/secret-store/` | daemon | `types.ts`, `keyring.ts`, `file-fallback.ts`, `redaction.ts`, `index.ts` |
| `src/client/` | client | `main.ts` (gate then dynamic import), `server.ts`, `binding.ts`, `run-state.ts`, `spawn.ts`, `handshake.ts`, `ipc-stub.ts`, `errors.ts` |
| `src/migration/` | cli | `v1-config.ts`, `v1-state.ts`, `synthesize.ts`, `main.ts` |
| `src/cli/` | cli | `main.ts` (dispatcher), `validate.ts`, `daemon-stop.ts` |
| `test/` | — | mirror of `src/` (twin rule, same base name); `test/security/` (static assertions, wrong-room, provenance, pack, repo scan); `test/fakes/` (`telegram-client.ts`, `secret-store.ts`, `clock.ts`); `test/fixtures/` (placeholder registries, v1 home fixture, `v1-provenance.json`) |

### 2.2 Compile units and the PT-07 boundary

| Unit | Entry | May import | Enforced by |
|---|---|---|---|
| `shared` | — | `zod`, `node:crypto` only | `src/shared/tsconfig.json` has no `references` |
| `client` | `dist/src/client/main.js` | `shared`, `@modelcontextprotocol/sdk`, `node:{http,fs,child_process,url,path,os,crypto,events}` | `src/client/tsconfig.json` references `shared` only → importing `ledger`, `registry`, `secret-store` or `daemon` is a compile error |
| `daemon` | `dist/src/daemon/main.js` | `shared`, `ledger`, `registry`, `secret-store`, `@napi-rs/keyring`, `node:sqlite`, `node:http` | `src/daemon/tsconfig.json` references those four |
| `cli` | `dist/src/cli/main.js` | everything (third bundle, THREAT-MODEL §5.6: excluded from the exec assertion, included in settings-path and `deleteMessage` assertions) | `src/cli/tsconfig.json` |

**Bundling decision (§18 D-11):** plain `tsc -b` with project references and **no bundler**. The "bundle" for static assertions is the transitive closure of relative `import` specifiers from each entry, computed by `test/security/closure.ts` over `dist/src/**`; the closure of `client/main.js` must be a subset of `dist/src/client/**` ∪ `dist/src/shared/**`, and it must contain no `api.telegram.org`, `@napi-rs/keyring`, `node:sqlite`, `getUpdates` or `secrets/` literal (PT-07). The dispatcher `cli/main.ts` loads subcommands with dynamic `import()` so the process that serves an IDE loads exactly the client closure.

### 2.3 `package.json` shape (ADR-0031 rules 1, 3, 5; D-03; D-10)

| Field | Value | Rule |
|---|---|---|
| `name` / `private` | `conmuta` / `true` | ADR-0031 rule 1; D-10 (F6 lifts `private`) |
| `type` | `module` | ESM |
| `bin` | `{ "conmuta": "dist/src/cli/main.js" }` | one bin; `conmuta mcp --project <id>` is a subcommand (ADR-0031 rule 2) |
| `engines.node` | `>=24.15.0` | D-03 |
| `files` | `dist/src/**`, `npm-shrinkwrap.json`, `package.json`, `README.md`, `LICENSE` | PT-21; `LICENSE` exists at the root (DN-04) — see §19 on D-10 |
| `scripts` | `build: tsc -b`, `test: tsc -b && node --test "dist/test/**/*.test.js"`, `test:wrong-room`, `test:static` | no `preinstall`/`install`/`postinstall`/`prepare` (PT-21) |
| `dependencies` | `@modelcontextprotocol/sdk`, `zod`, `@napi-rs/keyring` — exact pins, no `^` | ADR-0030 consequences; `npm-shrinkwrap.json` committed |
| `devDependencies` | `typescript`, `@types/node` | — |

CI (`.github/workflows/ci.yml`): `windows-latest` × Node `24.15` and `26`; steps `npm ci --ignore-scripts` → `npm run build` → `npm test` → `test:wrong-room` (named step, PT-01) → `npm pack --dry-run` assertion (PT-21) → repository secret scan (PT-22). The macOS job is added only by B-12.

---

## 3. Named constants (`src/shared/constants.ts`)

Every value below is a named export with the reasoning in its doc comment; derived values are derived in code (CONSTITUTION §5). "v1" = [DATA-MODEL §7](../../../docs/02-architecture/DATA-MODEL.md#7-named-constants-inherited-values-to-confirm-in-f1) value.

| Constant | Value | Status | Reasoning |
|---|---|---|---|
| `PRODUCT_NAME` | `"conmuta"` | new (D-09) | Single source for `PROJECT_FILE_NAME` (`${PRODUCT_NAME}.json`), `HOME_DIR_NAME` (`.${PRODUCT_NAME}`), `TOOL_PREFIX` (`${PRODUCT_NAME}_`), `KEYRING_SERVICE` (`PRODUCT_NAME`), `MCP_SERVER_NAME`; B-11 renames one line |
| `PROTOCOL_SENTINEL` / `SUPPORTED_PROTOCOL_SENTINELS` | `AGENTBUS/2` / `{/2, /1}` | confirmed | W1; W8 test forces agreement (`v1:src/config.ts:26,40`) |
| `SERVER_VERSION` | package version | confirmed | Build version returned by `GET /identity`; asserted equal to `package.json` |
| `LEDGER_SCHEMA_VERSION`, `REGISTRY_VERSION`, `PROJECT_FILE_SCHEMA_VERSION` | `1`, `1`, `1` | new | First shipped shape of each store |
| `NODE_FLOOR` | `"24.15.0"` | new (D-03) | `node:sqlite` is release candidate from 24.15.0 (exploration Q7) |
| `BOT_API_RETENTION_HOURS` | 24 | confirmed | H2 |
| `RETENTION_WARNING_HOURS` | `BOT_API_RETENTION_HOURS * 0.75` | confirmed | v1 derivation (`v1:src/config.ts:72`) |
| `MAX_LONGPOLL_SECONDS` | 50 | confirmed | H4 clamp |
| `FETCH_LONGPOLL_MAX_SECONDS` | `= MAX_LONGPOLL_SECONDS` | new (D-02) | A client blocked longer than one Telegram cycle gains nothing: every update the daemon can see arrives within one cycle |
| `MAX_BATCH` | 100 | confirmed | Bot API maximum per `getUpdates` |
| `REQUEST_OVERHEAD_SECONDS` | 20 | confirmed | v1 network allowance (`v1:src/telegram.ts:300`) |
| `IPC_REQUEST_TIMEOUT_MS` | `(FETCH_LONGPOLL_MAX_SECONDS + REQUEST_OVERHEAD_SECONDS) * 1000` | new | Same budget shape as `requestTimeoutMs` (`v1:src/telegram.ts:314-317`) applied to the client's IPC call |
| `REQUEST_REMINDER_WINDOW_HOURS` | 24 | confirmed | v1 |
| `SEEN_EID_RETENTION_DAYS` | 7 | confirmed | 7× margin over retention (`v1:src/config.ts:131-139`) |
| `INBOX_RETENTION_DAYS` | `= SEEN_EID_RETENTION_DAYS` | new | `updates` is the dedup set (`UNIQUE(project_id, eid)`, ruling (d)); the same argument bounds it |
| `RESOLVED_THREAD_RETENTION_DAYS` | 30 | confirmed | v1 |
| `AUDIT_RETENTION_DAYS` | `RESOLVED_THREAD_RETENTION_DAYS * 3` | new | An incident on any thread still readable is reconstructable from the audit log (T10) |
| `UNKNOWN_SENDER_RETENTION_DAYS` | `= RESOLVED_THREAD_RETENTION_DAYS` | new | A stranger silent for a month is not a bootstrap candidate |
| `CLIENT_SESSION_STALE_HOURS` | `= BOT_API_RETENTION_HOURS` | new | A session silent for the whole retention window is a dead IDE; its cursor is behind the catch-up window anyway |
| `SESSION_CATCHUP_HOURS` | `= BOT_API_RETENTION_HOURS` | new | A fresh session starts at the newest `updates.seq` older than this window, so it sees exactly what a v1 session got from Telegram (§8.4) |
| `MAX_THREAD_HISTORY` | 50 | confirmed | v1 |
| `MAX_SURFACED_THREADS`, `FLOOR_NEW`, `FLOOR_REMINDER` | 20, 8, 6 | confirmed | ADR-0017; the test pins the starvation invariant, not the numbers |
| `OPEN_THREAD_BACKLOG_THRESHOLD` | `MAX_SURFACED_THREADS * 2.5` | confirmed (now derived) | v1 wrote the literal with the derivation in prose (`v1:src/config.ts:161-166`) |
| `MAX_BODY_CHARS` / `TELEGRAM_MAX_TEXT_CHARS` | 3000 / 4096 | confirmed | v1 |
| `GROUP_MESSAGES_PER_MINUTE` / `CHAT_MESSAGES_PER_SECOND` | 20 / 1 | new | H3; per-binding outbound budget (§9) |
| `LOCK_STALE_SECONDS` (v1 120) | **replaced** | — | The bridge lock is gone (in-daemon mutex, OVERVIEW §7.4) |
| `DAEMON_LOCK_STALE_SECONDS` | 10 | new (D3 "~10 s") | Election window; asserted by behaviour (dead pid or stale heartbeat reclaimed, live respected) |
| `HEARTBEAT_PERIOD_MS` | `DAEMON_LOCK_STALE_SECONDS * 1000 / 3` | new | A live daemon writes at least two beats inside any stale window even when one write is delayed |
| `SPAWN_WAIT_SECONDS` | 15 | new (tuning) | Three times a generous cold start on a laptop disk, below every known host tool timeout; the test pins "returns `DAEMON_DOWN` after the bound and never polls", not the number |
| `SPAWN_LOCK_STALE_SECONDS` | `SPAWN_WAIT_SECONDS + DAEMON_LOCK_STALE_SECONDS` | new | A spawner that vanished mid-wait plus one election window |
| `IDLE_SHUTDOWN_HOURS` | 1 | new (tuning) | No session and no open thread for an hour: survives a lunch break, does not poll all night; a wrong guess costs one lazy respawn |
| `POLL_ERROR_BACKOFF_SECONDS` | `MAX_LONGPOLL_SECONDS / 10` | new | A transient fault costs one tenth of a cycle; a dead link does not spin |
| `RETENTION_SWEEP_INTERVAL_HOURS` | 1 | new | The smallest retention unit is a day; hourly sweeps bound overshoot to 1/24 of it for one indexed `DELETE` per table |
| `RUN_SECRET_BYTES`, `IPC_NONCE_BYTES`, `SESSION_TOKEN_BYTES` | 32, 32, 32 | new | HMAC-SHA256 output length; a key or nonce shorter than the MAC adds nothing (RFC 2104 §3) |
| `HANDSHAKE_NONCE_TTL_SECONDS` | `= REQUEST_OVERHEAD_SECONDS` | new | One local round trip's allowance; bounds the pending-nonce map |
| `MAX_PENDING_HANDSHAKES` | 64 | new | An order of magnitude above the sessions one machine runs; a runaway client is refused, not buffered |
| `IPC_MAX_BODY_BYTES` | `64 * 1024` | new | The largest legitimate request (a send body of `MAX_BODY_CHARS` in worst-case UTF-8 plus JSON framing) fits five times over |
| `IPC_EPHEMERAL_PORT` | 0 | new | Random port (ADR-0029 rule 3) |
| `HTTP_UNAUTHORIZED`, `HTTP_NOT_FOUND`, `HTTP_CONFLICT`, `HTTP_TOO_MANY_REQUESTS`, `HTTP_PAYLOAD_TOO_LARGE` | 401, 404, 409, 429, 413 | new | Protocol numbers, named once in `ipc-contract.ts` |
| `POSIX_PRIVATE_FILE_MODE` / `POSIX_PRIVATE_DIR_MODE` | `0o600` / `0o700` | new | POSIX owner-only; on Windows the DACL is inherited from the home (§6) |
| `DAEMON_LOG_MAX_BYTES` | `1024 * 1024` | new | Days of error lines; truncate-on-exceed keeps the home bounded without rotation code |
| `PROJECT_ID_PATTERN` | `^[a-z0-9][a-z0-9-]{2,40}$` | ruling (d) | Slug |
| `TELEGRAM_BOT_TOKEN_RE` | `\d+:[A-Za-z0-9_-]{35}` | confirmed | `v1:src/secrets.ts:16`, exported (§12) |
| `CHECKPOINT_MARKER` | `[CHECKPOINT-ESTADO]` | confirmed | Wire-visible (CONSTITUTION §7) |
| `EXIT_USAGE`, `EXIT_UNBOUND_PROJECT`, `EXIT_PROJECT_MISMATCH`, `EXIT_NODE_FLOOR`, `EXIT_DAEMON_ALREADY_RUNNING`, `EXIT_MIGRATION_REFUSED` | 2, 3, 4, 5, 6, 7 | new | 1 is reserved for uncaught errors; 2 is the conventional usage error; the rest are distinct so a host or runbook can branch (ADR-0029 pin "distinct code") |
| `MIN_CLIENT_BUNDLE_FILES` / `MIN_DAEMON_BUNDLE_FILES` | 8 / 24 | new | The closures §2.1 enumerates; a scan over fewer files means an entry moved and the assertion went blind (non-vacuous rule) |

Values marked "tuning" pin the invariant they serve, never the number (CONSTITUTION §5). `ARENA_LIGHT_MAX_ROUNDS` stays in F5.

---

## 4. Registry (`~/.conmuta/registry.json`)

**Schema** (`registry/schema.ts`, `z.strictObject` at every level): [DATA-MODEL §2](../../../docs/02-architecture/DATA-MODEL.md#2-conmutaregistryjson-machine-registry) finalized as follows: `roster_snapshot` and `roster_hash` are **required** on every binding (D-07 makes the snapshot the admission source); `bindings[].settings` is an optional `{ reminder_window_hours?, secret_markers? }` (DATA-MODEL §6 draft location, defaults from constants); `projects[].path` stays required. `registry_version` must equal `REGISTRY_VERSION`.

| Invariant | Where enforced | Failure |
|---|---|---|
| R1 one `bot_id` per active binding | `registry/invariants.ts`, at every load (zod `superRefine`) | whole file `registry_invalid`; the daemon activates **no** binding from it (PT-18) |
| R2 one `group_id` and one `project_id` per active binding | same | same |
| R3 `agent_id ∈ roster_snapshot` with `user_id === bot_id` | same | same |
| R4 `binding.group_id === conmuta.json.group_id` | `POST /session` (client sends `group_id` from the file, §10) and `doctor` (F2) | session refused `BINDING_MISMATCH`, condition `binding_mismatch` |
| R5 no token-shaped string | `registry/loader.ts` scans the raw text with `token-shape.ts` **before** parsing | `registry_invalid`; audit `system` row names no offset and no match |
| R6 human-only changes | by construction: the daemon bundle's `registry/*` has no write call (static assertion "registry is read-only in the daemon bundle", §14); writers are the CLI (`migration/`) and, later, the panel | — |

**Hot-reload mechanism (§18 D-12):** the loader keeps `{ mtimeMs, size }` of the last **successfully loaded** file. The heartbeat tick (`lifecycle/heartbeat.ts`, every `HEARTBEAT_PERIOD_MS`) calls an injected `onTick` that `stat`s the file; a changed fingerprint triggers a reload; `POST /session` performs the same check so a session never binds against a stale registry. An invalid or torn file keeps the last-good registry in memory, raises `registry_invalid`, and is **never renamed or rewritten** (ADR-0030 pin "registry validation and quarantine"; the quarantine-by-rename doctrine applies to the ledger only, DATA-MODEL §2). The next tick reloads once the human fixes it. `bindings.ts` reconciles: pollers start for new active bindings and stop for removed or suspended ones; a `BINDING_CHANGED` audit row is written per delta.

**Roster (D-07):** `roster-hash.ts` computes `sha256:<hex>` over the canonical JSON of `[agent_id, user_id]` pairs sorted by `agent_id` — `username` is excluded because it is display-only and mutable (DATA-MODEL §1). The client computes the same hash from `conmuta.json` and sends it at `POST /session`; a mismatch raises condition `roster_drift` (visible in `status` and every `fetch`), the session proceeds against the daemon's snapshot, and nothing is auto-resolved (F3 owns sync).

**Token-shape validator (B-18):** `shared/token-shape.ts` exposes `findTokenShapes(text): { count }` (never the match) and `assertNoTokenShape(text)` over any text; `shared/project-file.ts` applies it to `conmuta.json` after strict parsing and additionally rejects any string value containing a path separator or drive prefix, or the literal `Authorization` (PT-05, PT-06). `conmuta validate [<path> | --stdin]` (`cli/validate.ts`) wraps both for the documented opt-in pre-commit one-liner (`git show :conmuta.json | conmuta validate --stdin`, `core.hooksPath` opt-in, no `prepare` script) and for `doctor` in F2.

---

## 5. Ledger (`~/.conmuta/ledger.db`, `node:sqlite`, WAL)

### 5.1 Open sequence (`ledger/open.ts`)

`mkdir` home (`POSIX_PRIVATE_DIR_MODE`) → open → `PRAGMA quick_check` → on failure or `SQLITE_CORRUPT`/`SQLITE_NOTADB`: close, rename `ledger.db` (and its `-wal`/`-shm` siblings) to `ledger.corrupt-<epochMs>.db`, open fresh, raise `ledger_quarantined` + audit `system` row → `PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON` → read `PRAGMA user_version`: greater than `LEDGER_SCHEMA_VERSION` → quarantine (a file from the future, ADR-0015); lower → run each pending migration in `ledger/migrations.ts` (ordered `{ to, up }` list) inside one transaction each, then `PRAGMA user_version = to`. Forward-only; no down migrations. `synchronous = FULL` is deliberate: the offset confirmed to Telegram must never outlive a commit lost to power failure (I-3).

### 5.2 DDL (`ledger/schema.ts`, version 1)

```sql
CREATE TABLE offsets (
  bot_id INTEGER PRIMARY KEY, next_update_id INTEGER NOT NULL DEFAULT 0,
  last_poll_started_at TEXT, last_poll_ok_at TEXT, last_error_code TEXT,
  retry_after_until TEXT, poller_pid INTEGER) STRICT;

CREATE TABLE updates (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, bot_id INTEGER NOT NULL, update_id INTEGER NOT NULL,
  project_id TEXT NOT NULL, chat_id INTEGER NOT NULL,
  via TEXT NOT NULL CHECK (via IN ('group','direct')),
  message_id INTEGER NOT NULL, message_date INTEGER NOT NULL,
  from_user_id INTEGER NOT NULL, from_agent_id TEXT NOT NULL, eid TEXT NOT NULL,
  envelope_json TEXT NOT NULL,          -- validated envelope WITHOUT the body key
  body TEXT,                            -- NULL for apply_outcome IN ('rejected','ignored')
  apply_outcome TEXT NOT NULL CHECK (apply_outcome IN
    ('opened','acked','replied','resolved','noted','not_mine','ignored','rejected')),
  received_at TEXT NOT NULL,
  UNIQUE (bot_id, update_id),           -- crash replay dedup (PT-10)
  UNIQUE (project_id, eid)) STRICT;     -- seen_eids (ruling d)

CREATE TABLE threads (
  project_id TEXT NOT NULL, thread_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','resolved')),
  opened_type TEXT NOT NULL CHECK (opened_type IN ('REQUEST','BROADCAST')),
  opened_eid TEXT NOT NULL, from_agent_id TEXT NOT NULL, to_agent_id TEXT, to_user_id INTEGER,
  body TEXT NOT NULL, opened_at TEXT NOT NULL, opened_message_id INTEGER NOT NULL,
  group_message_id INTEGER, via TEXT NOT NULL CHECK (via IN ('group','direct')),
  ack_count INTEGER NOT NULL DEFAULT 0, acked_at TEXT, awaiting TEXT,
  resolved_at TEXT, resolved_by TEXT, basis TEXT,
  closure_delivered INTEGER NOT NULL DEFAULT 0 CHECK (closure_delivered IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, thread_id)) STRICT;
CREATE INDEX threads_needs_action ON threads (project_id, status, awaiting);

CREATE TABLE thread_history (
  project_id TEXT NOT NULL, thread_id TEXT NOT NULL, eid TEXT NOT NULL, type TEXT NOT NULL,
  from_agent_id TEXT NOT NULL, body TEXT NOT NULL, at TEXT NOT NULL,
  via TEXT NOT NULL CHECK (via IN ('group','direct')),
  PRIMARY KEY (project_id, thread_id, eid),
  FOREIGN KEY (project_id, thread_id) REFERENCES threads (project_id, thread_id) ON DELETE CASCADE) STRICT;

CREATE VIEW needs_action AS
  SELECT project_id, thread_id, from_agent_id, awaiting, opened_at, ack_count, acked_at
  FROM threads WHERE status = 'open' AND opened_type = 'REQUEST' AND awaiting IS NOT NULL;

CREATE TABLE client_cursors (
  client_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, host TEXT, pid INTEGER,
  started_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  inbox_seq INTEGER NOT NULL DEFAULT 0, last_surfaced_digest TEXT) STRICT;

CREATE TABLE client_surfaced (
  client_id TEXT NOT NULL, thread_id TEXT NOT NULL, first_surfaced_at TEXT NOT NULL,
  PRIMARY KEY (client_id, thread_id),
  FOREIGN KEY (client_id) REFERENCES client_cursors (client_id) ON DELETE CASCADE) STRICT;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, project_id TEXT, bot_id INTEGER,
  chat_id INTEGER, client_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('send','receive','reject','system')),
  eid TEXT, envelope_type TEXT, from_user_id INTEGER, to_user_id INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('ok','degraded','rejected','dropped')),
  reason TEXT) STRICT;                  -- no body column, by schema (PT-20)
CREATE INDEX audit_log_project_ts ON audit_log (project_id, ts);

CREATE TABLE unknown_senders (
  bot_id INTEGER NOT NULL, user_id INTEGER NOT NULL, username TEXT,
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bot_id, user_id)) STRICT; -- no body column (ADR-0028 rule 6)

CREATE TABLE binding_state (
  project_id TEXT PRIMARY KEY, last_checkpoint_at TEXT, last_checkpoint_by TEXT) STRICT;

CREATE TABLE conditions (
  scope TEXT NOT NULL, name TEXT NOT NULL, since TEXT NOT NULL, detail TEXT,
  PRIMARY KEY (scope, name)) STRICT;    -- scope = project_id or 'daemon'; detail = codes/ids only
```

Notes: `needs_action` is a VIEW plus the `(project_id, status, awaiting)` index (ruling (d)); the per-agent filter (`awaiting = ?`) and the reminder math (`computeAgeHours`/`isReminderDue`, `v1:src/protocol.ts:446-458`) stay in TypeScript so no window constant appears in DDL. `seen_eids` is the `UNIQUE (project_id, eid)` index (ruling (d)). `debate_journal` arrives with F5's own migration (D-06). `updates.body` is `NULL` exactly for outcomes that v1 never surfaced (`rejected`, `ignored`; `v1:src/tools/fetch.ts:596-629`): a peer body reaches the ledger only after passing every receive-side invariant. `conditions.detail` for `group_outage` stores the classification code, never error text (DATA-MODEL §3.0 "never stored").

### 5.3 Write-ahead transaction (`ledger/inbox.ts`, `ledger/transaction.ts`)

`withTransaction(db, fn)` issues `BEGIN IMMEDIATE` … `COMMIT`, `ROLLBACK` on throw. One transaction per poll batch: for each admitted update → `INSERT` into `updates`, upsert `threads`/`thread_history`, `INSERT` audit rows; for each dropped update → audit row only; finally `UPDATE offsets SET next_update_id = max(update_id) + 1`. The next `getUpdates` carries the new offset **only after** `COMMIT` returns (I-3). PT-10: a fault injected between the inbox insert and the offset update rolls the batch back; the re-served batch hits `UNIQUE (bot_id, update_id)` for anything already committed and is counted `replayed`.

**Risk and spike.** `node:sqlite` documents no `db.transaction(fn)` wrapper (exploration Q7). The first ledger task is a red test in `test/ledger/transaction.test.ts` on the pinned Node build asserting: `db.isTransaction` flips on `BEGIN IMMEDIATE`, a throw inside `fn` leaves no row, a nested call throws (no savepoints in F1). No ADR is needed; the idiom is an implementation detail behind `withTransaction`.

### 5.4 Retention (`ledger/retention.ts`)

Runs in the daemon on the heartbeat-driven schedule (`RETENTION_SWEEP_INTERVAL_HOURS`), never on a client call: `updates` older than `INBOX_RETENTION_DAYS`; resolved threads older than `RESOLVED_THREAD_RETENTION_DAYS` (history cascades); `thread_history` beyond `MAX_THREAD_HISTORY` per thread is trimmed by the writer on append (`v1:src/protocol.ts:161-172`); `audit_log` older than `AUDIT_RETENTION_DAYS`; `client_cursors` unseen for `CLIENT_SESSION_STALE_HOURS` (surfaced rows cascade); `unknown_senders` unseen for `UNKNOWN_SENDER_RETENTION_DAYS`. Open threads are never pruned; `open_thread_backlog` is raised past `OPEN_THREAD_BACKLOG_THRESHOLD` (report, never prune). The daemon never deletes a ledger file; quarantine renames. Audit export shape is fixed as JSON Lines of `audit_log` rows; the command surface belongs to F2's CLI.

---

## 6. Secret store (B-15)

| Item | Design |
|---|---|
| Interface | `secret-store/types.ts`: `SecretStore { kind: "keychain" \| "file"; get(botId): Promise<string \| null>; set(botId, token): Promise<void>; delete(botId): Promise<void> }` |
| Keyring | `secret-store/keyring.ts`: `@napi-rs/keyring` `Entry(KEYRING_SERVICE, \`bot:${botId}\`)`; the daemon resolves a token once per binding activation and hands it to `TelegramApiClient` (memory only) |
| Fallback | `secret-store/file-fallback.ts`: `~/.conmuta/secrets/<bot_id>.token`, written tmp + rename with `POSIX_PRIVATE_FILE_MODE`; on Windows the file **inherits** the home DACL that the installer/doctor sets with `icacls` in F2 (THREAT-MODEL §5.5); the daemon never spawns `icacls` (PT-28) |
| Selection | `secret-store/index.ts` probes the keyring once at daemon start (round trip on a probe account); on failure it selects the fallback and raises condition `secret_store_fallback` so `status` shows which store is live |
| Redaction | `secret-store/redaction.ts`: `redactTokenShapes(text)` replaces every `TELEGRAM_BOT_TOKEN_RE` match with `<redacted>`; applied by `daemon/telegram.ts` error constructors (§12 seam), `daemon/log.ts`, and every audit/condition writer |
| Never | Token in `registry.json` (R5), the ledger (no column receives it; PT "no token in the registry or the ledger" drives a fixture token through every write path), errors, logs, stacks (PT-08), IPC responses, the client bundle (PT-07) |

PT-19 in F1 (win-x64 half): the test applies `icacls` to a temp home **in test code** (tests may spawn), has the store write a fallback file, and asserts through `icacls` output that only the current user is listed — proving inheritance is what the F2 doctor will rely on. POSIX half: `stat` mode is `0o600`. PT-09: round trip against the real keyring on `windows-latest`, plus the forced-fallback path.

---

## 7. Daemon lifecycle

### 7.1 State machine (`daemon/bootstrap.ts`)

```text
boot ─▶ node-floor gate (daemon/main.ts imports nothing else; on < NODE_FLOOR: explicit message + download link, EXIT_NODE_FLOOR, zero disk writes)
     ─▶ dynamic import("./bootstrap.js")   (ESM imports are hoisted: node:sqlite must not load before the gate)
     ─▶ parse argv (--home <dir>, test/diagnostic only; the D-01 spawn passes none)
     ─▶ ensure ~/.conmuta/{run,secrets}
     ─▶ acquire run/daemon.lock (wx; reclaim only if pid dead OR heartbeat_at older than DAEMON_LOCK_STALE_SECONDS)
            └─ held and live ─▶ audit nothing, EXIT_DAEMON_ALREADY_RUNNING (never calls getUpdates)
     ─▶ open ledger (§5.1) ─▶ load registry (invalid ⇒ empty last-good + registry_invalid) ─▶ select secret store
     ─▶ listen 127.0.0.1:IPC_EPHEMERAL_PORT ─▶ write run/daemon.json {port, pid, secret: RUN_SECRET_BYTES random} (fresh every boot)
     ─▶ start heartbeat ─▶ reconcile bindings (pollers + transports) ─▶ RUNNING
RUNNING: heartbeat tick every HEARTBEAT_PERIOD_MS → write heartbeat_at; registry fingerprint check; retention sweep when due; idle check
STOP (SIGTERM/SIGINT/idle): abort pollers → close listener → delete run/daemon.json if it carries our pid → release lock if owner (v1 owner check) → close ledger → exit 0
```

| Rule | Mechanism | Pinned by |
|---|---|---|
| Singleton | `lifecycle/lock.ts` = `v1:src/state.ts:463-602` with `heartbeat_at` added to the payload and `lockAgeSeconds` reading it | PT-12 (`test/daemon/lifecycle/lock.test.ts`, `singleton.test.ts`) |
| Stale reclaim exactly once | v1 unlink-then-`wx` arbitration (`v1:src/state.ts:559-576`) | PT-12 |
| Idle | `lifecycle/idle.ts`: shut down when no session was seen for `IDLE_SHUTDOWN_HOURS` **and** `SELECT count(*) FROM threads WHERE status='open'` is zero | ADR-0029 pin "idle shutdown respects open threads" |
| Own files only | delete `daemon.json` only when its `pid === process.pid`; release lock only as owner | `test/daemon/lifecycle/run-file.test.ts` |
| No emission | heartbeat/idle modules receive an `onTick`/`onIdle` callback; they import no transport or send module (import-graph assertion §14) | ADR-0029 pin "no heartbeat emission" (`test/daemon/no-emission.test.ts`: simulated idle window, fake clients record zero sends) |
| Logs | `daemon/log.ts` appends redacted lines to `run/daemon.log`, truncating past `DAEMON_LOG_MAX_BYTES` | PT-08 bundle test |

### 7.2 Windows console flash (nodejs/node#21825)

The spawn options are `{ detached: true, stdio: "ignore", windowsHide: true, shell: false }` plus `child.unref()`. Whether a console flashes on Windows 11 cannot be asserted by a test; the lifecycle task records manual evidence on Windows 11 in the task's PR description. If the flash is unavoidable, the runbook documents it and the start-at-login registration (F2) becomes the recommended path; no design change follows.

### 7.3 `conmuta daemon stop` (`cli/daemon-stop.ts`)

Reads the run file, performs the identity challenge (§10) so it never signals a foreign pid, then `process.kill(pid, "SIGTERM")`. On Windows that is an unconditional termination; the lock becomes stale (dead pid) and WAL makes the ledger crash-safe. The runbook's rollback step needs a supported stop on Windows, where a detached process has no console.

---

## 8. Poller and admission

### 8.1 Loop (`daemon/poller.ts` — the only unbounded loop in the daemon bundle)

```text
for each active binding B (one bot token each), until aborted:
  offsets.last_poll_started_at = now
  updates = client.getUpdates({ offset: offsets[B.bot_id].next_update_id, limit: MAX_BATCH, timeout: MAX_LONGPOLL_SECONDS })
    409 TelegramConflictError → last_error_code = TELEGRAM_CONFLICT, condition poller_conflict, audit system row, STOP this loop (restart needs a registry change or daemon restart — never a blind retry)
    429 RateLimitedError      → retry_after_until = now + retry_after_s, condition poller_rate_limited, sleep retry_after_s, continue (honouring Telegram, not retrying blindly; PT-33)
    network/protocol error    → last_error_code, sleep POLL_ERROR_BACKOFF_SECONDS, continue
    GroupMigratedError cannot occur on getUpdates; on send it is surfaced and never followed (PT-25)
  withTransaction: admit(updates) → offsets.next_update_id = max(update_id) + 1; last_poll_ok_at = now
  emit inbox:<project_id> on the in-process EventEmitter (wakes D-02 waiters)
```

### 8.2 Seven-step admission (`daemon/admission.ts`, from `v1:src/tools/fetch.ts:525-656`, `:404-460`)

| Step | Check | Outcome |
|---|---|---|
| 1 | `message.text` absent | audit `reject/dropped/non_envelope` |
| 2 | `decodeEnvelope` (`shared/envelope.ts`) | `malformed` / `unsupported_version` |
| 3 (**new**) | `chat.id === binding.group_id` or `chat.type === "private"` | else `foreign_chat` (PT-03) — dropped, never surfaced, never replied |
| 4 | `message.from.id` reverse-looked-up in `binding.roster_snapshot` (D-07) | else `unknown_sender` (PT-04) + upsert `unknown_senders` (`user_id`, `username`, counts; no body) |
| 5 | sender is `binding.agent_id` | self-echo, dropped uncounted (outbound state was recorded by the send path) |
| 6 | three-key dedup: `UNIQUE (bot_id, update_id)` → `replayed`; `UNIQUE (project_id, eid)` → `duplicate` (+ additive `group_message_id` capture, `v1:src/protocol.ts:189-206`); a REQUEST whose `thread_id` exists with the same `opened_eid`, or an in-thread eid already in `thread_history`, → `duplicate` (covers the migration edge in §13 without a legacy table) | audit row |
| 6′ | `message.date` unusable → `malformed` (`v1:src/tools/fetch.ts:449-456`); trusted envelope = decoded envelope with `from` overwritten by the verified sender, `to` translated through `to_user_id`, body normalized (`v1:src/tools/fetch.ts:560-565`; PT-16) | — |
| 7 | `applyEnvelope` over the single thread row loaded as a `ThreadRecord` (`ledger/threads.ts` adapter); persist thread + history; insert `updates` row with `apply_outcome`; `unanchored` → `rejected` with reason `unanchored` (D-05, PT-17); `ignored` → row with `NULL` body (v1 `unapplied`); `[CHECKPOINT-ESTADO]` BROADCAST → `binding_state.last_checkpoint_*` | audit `receive/ok/<outcome>` |

`migrate_to_chat_id` is never followed: `GroupMigratedError` surfaces `new_chat_id` in the send result and the audit row; the binding is unchanged (PT-25, `v1:src/telegram.ts:140-160` inherited verbatim).

### 8.3 D-05 in the state machine

`shared/protocol-apply.ts` keeps the anchor derivation at open (`v1:src/protocol.ts:248`) and changes `isAddressee` (`:93-103`) so a `null` anchor returns `{ authorized: false, unanchored: true }`; `classifyRejection` then returns the new `RejectionReason` `"unanchored"` unless the originator arms apply (`abandoningOwnThread`, `continuingOwnThread`, `:128-134`). Receive-side only; the wire is unchanged. The parallel spec confirms the transition table; this design fixes the mechanism.

### 8.4 Serving `fetch` per client (`daemon/serve/fetch.ts`, from `v1:src/tools/fetch.ts:664-927`)

Inputs change, bodies do not: `client_cursors.inbox_seq` replaces `next_update_id`, `client_surfaced` replaces `first_surfaced_at`, `client_cursors.last_surfaced_digest` replaces the global digest. `log` = `updates` rows with `seq > inbox_seq` and a non-null body; `rejected`/`unapplied` = rows past the cursor with outcome `rejected`/`ignored` (metadata only); `skipped` = counts of `reject` audit rows for the binding since the client's previous `last_seen_at`. A new session's cursor starts at the newest `seq` older than `SESSION_CATCHUP_HOURS` (§3), so a fresh IDE sees the same window v1 offered. `mark_seen: false` advances nothing and stamps nothing (ADR-0025 semantics). D-02: with no row past the cursor and `timeout_s > 0`, the handler awaits `inbox:<project_id>` bounded by `min(timeout_s, FETCH_LONGPOLL_MAX_SECONDS)`; `timeout_s` is never forwarded to Telegram. Two clients on one binding each see the same batch; advancing one cursor moves nothing else (PT-11). `gap_warning` is re-scoped to "the daemon was not polling": raised from `offsets.last_poll_ok_at` older than `BOT_API_RETENTION_HOURS`.

---

## 9. Send path (`daemon/send/`)

Pipeline per binding, in the fixed v1 order (`v1:src/tools/send.ts:523-660`): schema (`shared/tool-schemas.ts`, no destination key — PT-02) → loop prevention against the ledger thread row (`:250-331`) → secret backstop over `body` and `approval_ref` (`:342-352`, `shared/secrets.ts`) → recipients from the binding's roster only (`:355-378`) → encoded-length guard → **room guard** → `DualWriteTransport` for that binding → thread bookkeeping in one transaction + audit `send` row.

| Concern | Design |
|---|---|
| Identity stamping | `from` = `binding.agent_id`, `to_user_id` = `roster_snapshot[to].user_id`; neither is an input |
| I-1 assertion | `transport/room-guard.ts` wraps the binding's `TelegramClient`: numeric `chat_id` must equal `binding.group_id`, string `chat_id` must be `@<username>` of a roster member; violation throws `WrongRoomError` before the call, audit `send/rejected/WRONG_ROOM`. Transports stay AS-IS; the guard sits inside `transport/` so `sendMessage` call sites remain confined (PT-28). PT-01 forces a mismatch by wiring a guard with a wrong group into a test binding |
| Mutual exclusion | `BindingMutex` (promise chain per `project_id`) replaces the filesystem lock; clients never see `BRIDGE_BUSY` |
| Rate discipline (`send/rate.ts`) | If `offsets.retry_after_until` is in the future → reject `TELEGRAM_RATE_LIMITED{retry_after_s}` locally, no call; a timestamp-window budget of `GROUP_MESSAGES_PER_MINUTE` and `CHAT_MESSAGES_PER_SECOND` per binding rejects the same way; a 429 from Telegram records `retry_after_until` and is surfaced, never retried (PT-33 429 half) |
| Local abandonment | `v1:src/tools/send.ts:426-452` kept: the single undelivered transition applied locally, `closure_delivered = 0` |
| Output | `SendToolOutput` minus `obligations` (host-specific wording, OVERVIEW §8); `delivery.group.new_chat_id` informational |

---

## 10. IPC

**Transport:** `node:http` on `127.0.0.1`, `IPC_EPHEMERAL_PORT`; `Host` header must be `127.0.0.1:<port>` (DNS-rebinding defence, applied to the client routes now and reused by the F3 panel); JSON only; bodies capped at `IPC_MAX_BODY_BYTES` (`HTTP_PAYLOAD_TOO_LARGE`). Routes are fixed here (§18 D-13): `GET /identity`, `POST /session`, `DELETE /session`, `POST /tools/send`, `POST /tools/fetch`, `POST /tools/status`, `POST /tools/thread`. F3 panel routes live under `/panel/*`.

```mermaid
sequenceDiagram
    autonumber
    participant C as Thin client (conmuta mcp --project P)
    participant R as run/daemon.json (ACL'd)
    participant D as Daemon 127.0.0.1:port
    C->>C: walk-up cross-check P (exit EXIT_UNBOUND_PROJECT / EXIT_PROJECT_MISMATCH before any IPC)
    C->>R: read {port, pid, secret}; process.kill(pid, 0)
    alt missing, unreadable, or pid dead
        C->>C: acquire run/spawn.lock (wx, stale SPAWN_LOCK_STALE_SECONDS); spawnDaemon() once (D-01); await run-file event bounded by SPAWN_WAIT_SECONDS, else DAEMON_DOWN
    end
    C->>D: GET /identity?nonce=<IPC_NONCE_BYTES hex>   (no Authorization header)
    D-->>C: { proof: HMAC-SHA256(secret, "identity:" + nonce), server_nonce, pid, build }
    C->>C: timingSafeEqual(proof, local HMAC); mismatch ⇒ re-read run file once, then DAEMON_IDENTITY_MISMATCH, no bearer ever sent
    C->>D: POST /session { project_id, group_id, roster_hash, host, pid, hmac: HMAC-SHA256(secret, "session:" + server_nonce) }
    D->>D: verify hmac (nonce single-use, TTL HANDSHAKE_NONCE_TTL_SECONDS); resolve binding; R4; roster_hash → roster_drift; mint bearer (SESSION_TOKEN_BYTES) and client_id
    D-->>C: { client_id, bearer, binding: {project_id, bot_id, group_id, agent_id, roster_hash}, conditions }
    Note over C,D: Binding frozen for the session. Every /tools/* call carries Authorization: Bearer <bearer>.
```

| Rule | Design |
|---|---|
| Bearer (ruling (b), D-04) | Per-session random token minted at `POST /session`, held in `ipc/sessions.ts` memory; the per-boot secret only keys the two HMACs (domain-separated labels `identity:` / `session:`) and never travels |
| 401 | Missing, unknown, or previous-boot bearer → `HTTP_UNAUTHORIZED`, no side effect, no audit body (PT-24). The client discards its session and re-runs the whole handshake once inside the same tool call (per-boot rotation is transparent); a second failure surfaces the client error |
| Per-boot rotation | The run file and the secret are rewritten on every start; sessions are memory-only, so a restart invalidates every bearer (ADR-0029 pin "secret rotates per boot") |
| Freeze | `POST /session` stores a binding snapshot; every tool call compares the live binding's `(bot_id, group_id, agent_id)` to it; a delta → `BINDING_CHANGED` (`HTTP_CONFLICT`), audit row, nothing sent; the client must start a new session |
| Unbound | No active binding for `project_id` → `UNBOUND_PROJECT` (`HTTP_NOT_FOUND`); the MCP server stays up and returns the error on every call until a human binds the project |
| Flood | Pending nonces beyond `MAX_PENDING_HANDSHAKES` → `HTTP_TOO_MANY_REQUESTS` |
| Contract | `shared/ipc-contract.ts` holds the zod schemas for every request and response; the daemon re-validates tool inputs with `shared/tool-schemas.ts` (it never trusts the client) |

**Client error taxonomy** (`shared/error-payload.ts`, `client/errors.ts`; shape `{code, message, retryable, retry_after_s?, new_chat_id?}` from `v1:src/index.ts:45-51`, built without importing `telegram.ts`):

| Code | Raised by | `retryable` |
|---|---|---|
| `DAEMON_DOWN` | run file absent/invalid, pid dead, spawn wait exhausted, connection refused — **zero network, no `Authorization` header** (PT-26 a/b) | true |
| `DAEMON_IDENTITY_MISMATCH` | HMAC proof failed after one re-read | true (resolves after the daemon lock staleness window) |
| `DAEMON_VERSION_MISMATCH` | `build` ≠ `SERVER_VERSION` | false (restart the daemon) |
| `IPC_ERROR` | transport failure mid-session after a successful handshake | true |
| `UNBOUND_PROJECT`, `BINDING_CHANGED`, `WRONG_ROOM`, `BINDING_MISMATCH` | daemon, passed through | false |
| v1 tool and Telegram codes | daemon, passed through unchanged (`v1:src/telegram.ts:209-229`, `v1:src/tools/send.ts:160-173`) | as classified by the daemon |

`RETRYABLE_TOOL_CODES` stays a closed allow-list (`v1:src/index.ts:63`); `BRIDGE_BUSY` is removed.

---

## 11. Thin client (`conmuta mcp --project <id>`)

| Aspect | Design | Evidence |
|---|---|---|
| `createServer(deps)` | `client/server.ts` keeps the shape; `deps = { ipc: IpcSession, projectId, now? }`; each handler validates with the ported schema, calls the stub, returns the daemon's payload or a client-local error | `v1:src/index.ts:112-248` |
| Tool schemas | `fetchInputSchema` (`v1:src/index.ts:29-34`), `statusInputSchema` (`:37`), `threadInputSchema` (`:40-42`), `sendInputSchema` (`v1:src/tools/send.ts:47-109`) ported unchanged to `shared/tool-schemas.ts` | PT-02 |
| Tool names | `${TOOL_PREFIX}send|fetch|status|thread` (D-09; OVERVIEW §8 "tool-name prefixes follow the final product name") | — |
| Startup | node-floor gate → parse `--project` (missing → `EXIT_USAGE`) → `client/binding.ts` walks up from `process.cwd()` to the filesystem root for the nearest `conmuta.json`, strict-parses it, requires `project_id === --project` (else `EXIT_UNBOUND_PROJECT` / `EXIT_PROJECT_MISMATCH`, before any IPC) → `server.connect(new StdioServerTransport())` immediately | ADR-0028 rule 4 and pin "launcher refuses" |
| Handshake timing | Lazy, on the first tool call, cached for the session: MCP initialization stays within the host timeout and `DAEMON_DOWN` is a tool error, not a dead server | ADR-0031 pin "starts within the MCP timeout" |
| Lazy spawn (D-01) | `client/spawn.ts` is the only file in the client closure referencing `child_process`: `const DAEMON_ENTRY = fileURLToPath(new URL("../daemon/main.js", import.meta.url)); const SPAWN_OPTIONS = { detached: true, stdio: "ignore", shell: false, windowsHide: true } as const; export function spawnDaemon(): number \| undefined { const child = spawn(process.execPath, [DAEMON_ENTRY], SPAWN_OPTIONS); child.unref(); return child.pid; }` — one call, literal argv, no user input, no env or cwd override | PT-27 multi-clause (§14) |
| Spawn wait | `client/run-state.ts`: `fs.watch` on `run/` + `AbortSignal.timeout(SPAWN_WAIT_SECONDS * 1000)`; the same timer-free primitive v1 uses for HTTP (`v1:src/telegram.ts:388-392`); re-reads the run file on each event until it parses with a live pid | PT-26 |
| Fence | Applied by the daemon at the IPC response boundary (§18 D-15); the client forwards fenced text unchanged | PT-13, PT-14 |
| Holds | `{ client_id, bearer }` in memory after the handshake; no token, no registry, no ledger handle; surfaced state lives in `client_surfaced` keyed by `client_id` | PT-07 |
| Startup errors | Message only, never `err.stack` (`v1:src/index.ts:279-284` printed stacks — a T04 vector) | PT-08 |

---

## 12. v1 reuse (D-08, exploration Q1)

Provenance header on every vendored file:

```ts
/**
 * Provenance: telegram-agent-bus <v1 path> @ bf8f365 — verdict: AS-IS | SEAM (D-08).
 * v1 body sha256: <hex>   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: none. | Changes: (1) …; (2) …
 */
```

The hash travels **in the header** (tribunal ruling `bus-v2-f1-design-001` item 5; DN-06): a reviewer of a `size:exception` PR verifies the header, re-hashes the body and checks that `test/security/provenance.test.ts` passes, without reading the body. That test scans `src/**` and `test/**` for files carrying a `Provenance:` line, strips the header and the import block, hashes the remainder and compares it to the header's `v1 body sha256`: AS-IS entries must match exactly; SEAM entries must **not** match (a seam that silently reverts to v1 is also a defect) and list their changes in the header. `test/fixtures/v1-provenance.json` (`{ v2Path, v1Path, commit: "bf8f365", verdict }`) is the expected registry of vendored files: the test asserts the scanned set equals it, so an unlisted vendored file or a missing one fails, and the assertion is non-vacuous. Import blocks are excluded because paths relocate; every other byte of an AS-IS module is pinned (W1 "`envelope.ts` verbatim"). The exception applies only to **whole-file** AS-IS copies; a module assembled from line ranges of several v1 files is a SEAM by construction and keeps full review.

| v1 module (`bf8f365`) | Verdict | v2 target | Change (SEAM) or reason (REPLACED) |
|---|---|---|---|
| `src/envelope.ts` | AS-IS | `shared/envelope.ts` | — (W1) |
| `src/secrets.ts` | SEAM | `shared/secrets.ts` | (1) `export` on `TELEGRAM_BOT_TOKEN_RE` so the validator and the redactor share one regex |
| `src/config.ts:26-166` constants | SEAM | `shared/constants.ts` | (1) `LOCK_STALE_SECONDS`, `STATE_VERSION` dropped; (2) `OPEN_THREAD_BACKLOG_THRESHOLD` derived; (3) §3 additions |
| `src/config.ts:168-187` schemas/types | SEAM | `daemon/binding-config.ts` | `BindingConfig` = v1 `Config` minus `bot_token`, materialized per binding (DATA-MODEL §1 derivation) |
| `src/config.ts:197-267` (`getAgentBusHome`, `loadConfig`, `resolveBotToken`, `computeIsMainModule`) | REPLACED | — | env/file token resolution violates I-2; home is fixed; entries export `main()` and need no main-module check |
| `src/protocol.ts:1-333` | SEAM | `shared/protocol-apply.ts` | (1) `ThreadRecord` from `shared/thread-record.ts`; (2) REPLY branch no longer touches `first_surfaced_at` (the ledger adapter clears `client_surfaced` for the thread on `replied`); (3) D-05 `isAddressee`/`classifyRejection` fail closed with reason `unanchored`; (4) `isDuplicateEid` unused (dedup is the index) |
| `src/protocol.ts:335-478` | SEAM | `shared/protocol-select.ts` | (1) `computeWorkDigest(threads, agentId, windowHours, now, surfaced: ReadonlySet<threadId>, checkpointAt)` takes the per-client surfaced set and the binding checkpoint instead of reading `state` |
| `src/state.ts:15-87` types | SEAM | `shared/thread-record.ts` | (1) `first_surfaced_at` removed (per client) |
| `src/state.ts:89-186, 217-250, 252-456` (conditions, prune, schema, load/save) | REPLACED | `ledger/*` | ADR-0030 (CONSTITUTION §6 reopened item); the pruning reasoning ports to `ledger/retention.ts` |
| `src/state.ts:252-439` (schemas, `migrateToCurrent`, `loadState`) | SEAM | `migration/v1-state.ts` | read-only: (1) the quarantine-rename branch becomes a hard error (v1 files are never modified); (2) `to_user_id` backfilled from the v1 roster at import |
| `src/config.ts:168-233` | SEAM | `migration/v1-config.ts` | read-only loader; no token resolution from env |
| `src/state.ts:458-602` locks | SEAM | `daemon/lifecycle/lock.ts` | (1) `heartbeat_at` in the payload, `lockAgeSeconds` reads it; (2) stale default = `DAEMON_LOCK_STALE_SECONDS`; (3) `BridgeBusyError` renamed `LockHeldError` |
| `src/telegram.ts` | SEAM (minimal) | `daemon/telegram.ts` | (1) `TelegramNetworkError`/`TelegramProtocolError` messages pass through `redactTokenShapes` (THREAT-MODEL residual "undici `cause` may embed the URL"; PT-08); (2) `LOCK_STALE_SECONDS` import dropped |
| `src/transport/{types,group,direct,dual}.ts` | AS-IS | `daemon/transport/*.ts` | — |
| `src/tools/fetch.ts:43-63` | SEAM | `shared/fence.ts` | (1) origin attributes (§11) |
| `src/tools/fetch.ts:65-348` types | AS-IS | `shared/tool-output.ts` | — (`gap_warning` doc re-scoped in the header) |
| `src/tools/fetch.ts:390-402` lock | REPLACED | — | in-daemon mutex |
| `src/tools/fetch.ts:404-460, 525-656` | SEAM (split) | `daemon/admission.ts` | (1) step 3 scope check; (2) ledger writes; (3) `unknown_senders` upsert |
| `src/tools/fetch.ts:664-927` | SEAM (split) | `daemon/serve/fetch.ts` | (1) per-client inputs (§8.4); (2) no `getUpdates`; (3) D-02 wait |
| `src/tools/send.ts:47-109` | AS-IS | `shared/tool-schemas.ts` | — |
| `src/tools/send.ts:113-192, 205-378` | SEAM | `daemon/send/validate.ts` | (1) `BRIDGE_BUSY` code removed; (2) thread lookups against the ledger |
| `src/tools/send.ts:380-660` | SEAM | `daemon/send/send-path.ts` | (1) lock → mutex; (2) `saveState` → transaction; (3) room guard; (4) `obligations` removed; (5) rate discipline |
| `src/tools/status.ts` | SEAM | `daemon/serve/status.ts` | (1) ledger reads; (2) adds daemon uptime, last poll per bot, binding identity, secret-store kind, conditions from the table |
| `src/tools/thread.ts` | SEAM | `daemon/serve/thread.ts` | (1) ledger reads; (2) fence with origin |
| `src/index.ts:29-42` schemas | AS-IS | `shared/tool-schemas.ts` | — |
| `src/index.ts:45-103` payload helpers | SEAM | `shared/error-payload.ts` (shape, allow-list), `daemon/ipc/routes.ts` (`toTelegramErrorPayload`) | (1) client side has no `telegram.ts` dependency |
| `src/index.ts:112-248` `createServer` | SEAM | `client/server.ts` | (1) handlers call IPC stubs; (2) tool names from `TOOL_PREFIX` |
| `src/index.ts:250-292` `main` | REPLACED | `client/main.ts`, `cli/main.ts` | different startup contract |
| `src/doctor.ts` | not in F1 | F2 | — |
| `test/security.test.ts:25-101` predicates | AS-IS | `test/security/predicates.ts` | — |
| `test/security.test.ts:176-273` tables | REPLACED | `test/security/{client-bundle,daemon-bundle}.test.ts` | two closures, allow-lists in §14 |
| `test/fakes/telegram.ts` | SEAM | `test/fakes/telegram-client.ts` | (1) the default `identity` literal at `v1:test/fakes/telegram.ts:59` is a production-shaped bot username and id — replaced by placeholders (data hygiene, PT-22 deny-list) |
| v1 `test/*.test.ts` for AS-IS modules | AS-IS (sliced) | twins | copied test-first; sliceable by test group for the PR budget |

---

## 13. v1 migration (B-13) — `conmuta migrate-v1`

`--v1-home <dir>` (default `~/.agentbus`), `--project-id <slug>`, `--project-path <abs dir>`, `[--token-stdin]`, `[--dry-run]`. Non-interactive; exit `EXIT_MIGRATION_REFUSED` with one reason on any precondition failure; runs in the CLI bundle.

1. Node-floor gate. Read `config.json` (`migration/v1-config.ts`) and `state.json` (`migration/v1-state.ts`) read-only; an unreadable or invalid file refuses — nothing is renamed or written.
2. Token: `config.bot_token`, else stdin when `--token-stdin` is given. Never argv (visible in process lists), never env (I-2). Refuse if neither.
3. `bot_id = config.roster[config.agent_id].user_id`; refuse if absent (v1 doctor rule "agent_id present in own roster").
4. Backups: **copy** `config.json` → `config.json.bak-pre-v2-<YYYYMMDD>` and `state.json` → `state.json.bak-pre-v2-<YYYYMMDD>`; refuse if a backup of that date exists and the registry already holds `bot_id` ("already migrated", exit 0 with `--dry-run` semantics). Originals are never modified or deleted; the backup keeps the token (runbook states it).
5. Synthesize under `~/.conmuta`: registry `bots[]` `{bot_id, username: bot_username, token_ref, added_at}`, `groups[]` `{group_id: chat_id}`, `projects[]` `{project_id, path}`, `bindings[]` `{project_id, bot_id, group_id, agent_id, status: "active", roster_snapshot: config.roster re-keyed, roster_hash, settings: {reminder_window_hours, secret_markers}}`; secret store `set(bot_id, token)`; ledger `offsets` row (`next_update_id` verbatim, `v1:src/state.ts:116`), `threads`/`thread_history` under `project_id` with `to_user_id` backfilled from the v1 roster (null stays null and will fail closed under D-05 — runbook states it), `binding_state.last_checkpoint_*`. `seen_eids`, `last_surfaced_digest`, `first_surfaced_at`, `lock` are not migrated (three-key dedup §8.2 covers the eid edge).
6. Print the proposed `conmuta.json` (identifiers only) to stdout for the human to commit at `--project-path`; the tool **never writes into a repository** (that is F2's `project bind`, DATA-MODEL §6 "assigning the project folder remains a human action" — the explicit flags are that action).

**Runbook** (`docs/runbooks/migrate-from-v1.md`, deliverable of this change): the >24 h cursor gap (Telegram has already dropped anything past a stale offset; the daemon reports `gap_warning`, never the content); the one-poller rule (stop every v1 session before the first daemon start, otherwise `TELEGRAM_CONFLICT` stops the poller and `status` shows it); rollback (§ proposal: `conmuta daemon stop`, remove `~/.conmuta`, delete keyring entries `bot:<bot_id>`, resume v1); the backup still holds the token; null-anchor threads fail closed; how to hand-edit the registry until F2's wizards exist (R6 permits it).

---

## 14. Static security assertions (`test/security/`)

Closure walker `closure.ts` (relative `import`/`export … from` specifiers over `dist/src/**`); predicates from `v1:test/security.test.ts:44-101` AS-IS; every predicate is exercised against a seeded negative fixture in the same file so the scan cannot pass vacuously; each closure must have at least `MIN_*_BUNDLE_FILES` files and must contain named sentinel modules.

| Assertion | Client closure (`client/main.js`) | Daemon closure (`daemon/main.js`) |
|---|---|---|
| `child_process` | exactly one file: `client/spawn.js`; in it `spawn(` count == 1, `exec(`/`execSync(`/`spawnSync(`/`fork(` count == 0; the call matches `spawn\(process\.execPath,\s*\[DAEMON_ENTRY\],\s*SPAWN_OPTIONS\)`; `SPAWN_OPTIONS` literal contains `shell: false`, `detached: true`, `windowsHide: true`, `stdio: "ignore"`; `DAEMON_ENTRY` is a `const` from `new URL("<string literal>", import.meta.url)` in the same file; predicate matches across the closure == 1 (PT-27, ruling (a)) | forbidden (PT-28) |
| `node:fs` | only `client/binding.js`, `client/run-state.js` | only `daemon/home.js`, `daemon/log.js`, `daemon/lifecycle/{lock,run-file}.js`, `ledger/open.js`, `registry/loader.js`, `secret-store/file-fallback.js`; `registry/*.js` has no `writeFileSync|renameSync|unlinkSync|openSync` (R6) |
| `node:sqlite` | forbidden | only `ledger/*.js` |
| `api.telegram.org`, `getUpdates`, `@napi-rs/keyring`, `secrets/` | forbidden (PT-07) | `api.telegram.org` exactly once (`daemon/telegram.js`) |
| settings paths, `deleteMessage(` | forbidden | forbidden |
| timers (`set(Interval\|Timeout\|Immediate)(`, `node:timers`) | forbidden | only `daemon/poller.js`, `daemon/lifecycle/{heartbeat,idle}.js`, `daemon/serve/fetch.js` (D-02 wait); the closure of each of these must exclude `daemon/transport/*` and `daemon/send/*` |
| unbounded loop | forbidden | only `daemon/poller.js` |
| `.sendMessage(` call lines | forbidden | only `daemon/transport/{group,direct,room-guard}.js`, indented; reverse import graph: `transport/*` imported only by `daemon/send/*`, `daemon/bindings.js`, `transport/*`; `daemon/send/send-path.js` imported only by `daemon/ipc/routes.js` |
| `Authorization` before proof | runtime PT-26 with a fake server recording headers | — |

The CLI closure (`cli/main.js`) is checked for settings paths and `deleteMessage(` only. `test/security/wrong-room.test.ts` (PT-01) boots `startDaemon` in-process with a temp home, two bindings, a `FakeTelegramClient` per token, two sessions, N sends each; asserts the per-fake `sentMessages[].chat_id` partition, then wires a guard with the wrong group and asserts `WRONG_ROOM` plus an audit row; CI runs it as its own named step. `pack.test.ts` (PT-21) and `repo-scan.test.ts` (PT-22, token regex + tenant deny-list, seeded fixture must fail) are pinned against the scaffold in the first unit.

---

## 15. Test strategy under Strict TDD

| Layer | What | How |
|---|---|---|
| Twin rule | every `src/**/*.ts` ↔ `test/**/<same>.test.ts` | `test/twins.test.ts` enumerates `src/` and fails on a missing twin |
| Fakes | `test/fakes/telegram-client.ts` (v1 fake, placeholder identity), `secret-store.ts` (in-memory), `clock.ts` | injected through `startDaemon({ homeDir, telegramClientFactory, secretStore, now })` and `createServer(deps)` — no env override exists in the product |
| Ledger | schema, migrations, quarantine, transaction, inbox replay, cursors, audit, retention | temp file per test (`mkdtemp`), real `node:sqlite`, fault injection by throwing inside `withTransaction` |
| Lifecycle | lock, heartbeat, reclaim, idle, run file | temp home; real child processes via `node dist/src/daemon/main.js --home <tmp>` (no bindings ⇒ no network); pid liveness with real pids |
| IPC | handshake, 401, rotation, freeze, D-02 wait | in-process daemon on port 0; a fake `http` server for PT-26(b) |
| Client | binding walk-up, spawn shape (injected `spawnImpl`), `DAEMON_DOWN` zero-network (fake `fetch` that throws on any call) | unit |
| Integration | wrong-room, migration fixture (`test/fixtures/v1-home/`, placeholders), token sinks | temp homes |
| Static | §14 | over `dist/` after `tsc -b` |
| CI | `windows-latest` × Node 24.15 / 26 | keyring live on the runner; fallback forced in tests |

**PT → file mapping** (deliverable 15 for THREAT-MODEL §4): PT-01 `security/wrong-room`; PT-02 `shared/tool-schemas`; PT-03, PT-04, PT-16, PT-31 `daemon/admission`; PT-05 `shared/token-shape` + `cli/validate`; PT-06 `shared/project-file`; PT-07, PT-27 `security/client-bundle`; PT-08 `daemon/telegram` + `security/token-redaction`; PT-09 `secret-store/index`; PT-10 `ledger/inbox`; PT-11 `ledger/cursors` + `daemon/serve/fetch`; PT-12 `daemon/lifecycle/lock` + `daemon/lifecycle/singleton`; PT-13 `shared/fence`; PT-14 `daemon/serve/fetch`; PT-15 `shared/secrets` + `daemon/send/validate`; PT-17 `shared/protocol-apply`; PT-18 `registry/invariants`; PT-19 `secret-store/file-fallback`; PT-20 `ledger/audit`; PT-21 `security/pack`; PT-22 `security/repo-scan`; PT-24 `daemon/ipc/server`; PT-25 `daemon/send/send-path`; PT-26 `client/handshake`; PT-28 `security/daemon-bundle`; PT-33 `daemon/poller`. ADR rows without a PT id: rotation `daemon/ipc/sessions`; idle `daemon/lifecycle/idle`; no emission `daemon/no-emission`; registry quarantine/hot edit `registry/loader`; token sinks `security/token-sink`; node floor `daemon/node-floor`; launcher `client/binding`; pending senders `ledger/unknown-senders`; W8 `shared/constants`.

Vendored AS-IS modules follow red-before-green through the provenance hash test (it fails until the body matches) and their vendored v1 twins.

---

## 16. Wire policy (W1)

F1 emits `AGENTBUS/2` and accepts `/1` and `/2`. `shared/envelope.ts` is vendored AS-IS and pinned by the provenance hash; `PROTOCOL_SENTINEL ∈ SUPPORTED_PROTOCOL_SENTINELS` is forced by `test/shared/constants.test.ts` (W8, `v1:test/config.test.ts:61-69`). No envelope field, type or `basis` value is added; roster, room and project identity ride the binding, never the wire. Arena-light metadata (F5) lives in body markers.

## 17. Autonomy boundary

The core (daemon + client) has no exec, no shell, no tool invocation (§14 `child_process` rows); zero autonomous emission: the poller is a receive loop, the heartbeat and idle timers reach no send module (import-graph assertion), the only `sendMessage` path is an IPC request handler serving an explicit tool call; nothing received is executed or applied; `fs` stays inside `~/.conmuta` plus the read-only `conmuta.json` walk-up. The D-01 spawn site is the single scoped exception: it starts the daemon's own entry point with a literal argv and never emits.

---

## 18. Decisions made in this design

Rulings (a)–(e) are inputs, not decisions. Each row below was delegated by the proposal or left open by the ADRs.

| Id | Decision | Options considered | Rationale |
|---|---|---|---|
| D-11 | Plain `tsc -b` with project references; no bundler; closures computed by the static test | esbuild single-file bundles (cleaner scan, but a native devDependency and a second build path under `--ignore-scripts`); plain `tsc` without references (boundary only in tests) | Compile-time boundary plus a dist-level proof, zero new dependencies, v1's own scan model (`v1:test/security.test.ts:7-23`) |
| D-12 | Registry hot-reload by mtime/size fingerprint on the heartbeat tick and at `POST /session` | `fs.watch` (Windows atomic-save rename semantics, duplicate events, needs a debounce timer in a module outside the timer allow-list); a dedicated poll timer (a fourth timer module) | Reload latency ≤ one heartbeat, no new timer module, no editor-dependent event semantics |
| D-13 | Route names: `GET /identity`, `POST\|DELETE /session`, `POST /tools/{send,fetch,status,thread}`; `Host` check; body cap | `/challenge` naming; REST-style verbs per resource | `/identity` follows ADR-0029 rule 3 verbatim; `/tools/*` leaves `/panel/*` to F3 |
| D-14 | Mutual proof: daemon proves with `HMAC(secret, "identity:"+nonce)`, client proves with `HMAC(secret, "session:"+server_nonce)`; bearer minted per session | Bearer = raw secret (ruled out by (b)); daemon-only proof (any local process could then open a session) | Another local principal cannot read the ACL'd secret and therefore cannot mint a session; domain separation prevents cross-replay |
| D-15 | Fence applied by the daemon at the IPC response boundary; client forwards unchanged | Fence in the client; fence on both sides with a client-side soundness check | One fencing site and one PT-13 test; the client never holds a raw peer body; daemon identity is HMAC-verified |
| D-16 | Two lock files: `run/daemon.lock` (daemon singleton, heartbeat) and `run/spawn.lock` (client election of the one spawner) | One file whose ownership transfers from client to daemon | Owner-checked release (`v1:src/state.ts:592-602`) breaks when ownership moves; the spawn lock avoids N clients spawning N processes (agentinbox #235 incident, OVERVIEW §7.1) |
| D-17 | Handshake-mismatch code `DAEMON_IDENTITY_MISMATCH`; also `DAEMON_VERSION_MISMATCH`, `IPC_ERROR`, `BINDING_CHANGED`, `BINDING_MISMATCH` | folding mismatch into `DAEMON_DOWN` | Distinct code required by OVERVIEW §9; a version skew after an upgrade must not read as an outage |
| D-18 | Fallback secret file relies on DACL inheritance from the home; F1 pins inheritance in the test harness (icacls in test code); the daemon never spawns | daemon applies `icacls` (breaks PT-28); PowerShell ACL APIs (same problem) | THREAT-MODEL §5.5 doctrine; the F2 doctor owns the real-home check |
| D-19 | New session cursor starts at the newest `updates.seq` older than `SESSION_CATCHUP_HOURS`; sessions die with `client_id` (stale after `CLIENT_SESSION_STALE_HOURS`) | cursor at 0 (replays weeks); cursor at `MAX(seq)` (loses overnight BROADCASTs a v1 session would have seen) | Same window v1 got from Telegram; `needs_action` comes from threads regardless |
| D-20 | `updates.body` is `NULL` for `rejected`/`ignored`; `not_mine` and `noted` keep the body | store every body; store none for non-applied | Exactly v1's surfaced set (`v1:src/tools/fetch.ts:589-650`); no peer prose that failed an invariant is at rest |
| D-21 | `PRAGMA synchronous = FULL` | `NORMAL` (fewer fsyncs) | The offset confirmed to Telegram must not outlive a lost commit (I-3); cost is one fsync per batch |
| D-22 | Room guard as a `TelegramClient` decorator inside `transport/` | assertion only in `send-path` before `transport.send` | The literal "before every `sendMessage`" of ADR-0028 rule 2 without touching AS-IS transports; PT-28's call-site confinement holds |
| D-23 | Migration takes `--project-id`/`--project-path`, synthesizes an active binding, prints `conmuta.json`, never writes into a repository | defer the binding to F2 (leaves F1 unusable end to end and threads without a project key) | The flags are the human action DATA-MODEL §6 requires; repository writes stay with F2's wizard |
| D-24 | `--token-stdin` for migration; never env or argv | `AGENTBUS_BOT_TOKEN` env (I-2 forbids env traversal) | The only remaining non-interactive channel that is invisible to process lists |
| D-25 | Node-floor gate in an import-free `main.ts` that dynamic-imports the rest | gate inside bootstrap | ESM hoisting would load `node:sqlite` before the gate on an old Node |
| D-26 | Timer allow-list extended with `daemon/serve/fetch.js` for the D-02 wait; import-graph proves it cannot reach a send path | `AbortSignal`-only wait (scan evasion, same semantics) | Honest allow-list plus the assertion that matters (ADR-0029 pin: no timer on a send path) |
| D-27 | Roster hash over `[agent_id, user_id]` pairs sorted by `agent_id` | include `username` | `username` is display-only and mutable; drift must mean an authority change |
| D-28 | Session freeze verified per call (`BINDING_CHANGED` on delta) | trust the session snapshot silently | A human re-binding must not be followed by a live session (I-1, T15) |
| D-29 | `conmuta daemon stop` and `conmuta validate` ship in F1's CLI bundle | leave stop to Task Manager and the hook to F2 | The runbook needs a supported stop on Windows; the validator needs a callable surface for the opt-in hook |
| D-30 | Daemon `--home` flag for tests and diagnostics; production spawn passes no argv | env override (`AGENTBUS_HOME` pattern, `v1:src/config.ts:201-207`) | No ambient-env configuration channel in the product; the literal argv cannot carry it |

## 19. Risks and open points

| Risk | Likelihood | Design-level mitigation | Status |
|---|---|---|---|
| D-01 assertion rots | Med | §14 multi-clause shape test plus closure count and seeded negatives | designed |
| `node:sqlite` transaction idiom | Med | §5.3 red spike before the inbox task | designed |
| Console flash on Windows 11 | Med | §7.2 manual evidence in the lifecycle PR; runbook fallback | open until verified |
| Keyring prebuild missing on a runner | Low | fallback first-class; CI forces the fallback path | designed |
| Migration cursor gap / 409 | Med | §13 runbook; `poller_conflict` stops the loop and is visible in `status` | designed |
| ADR-0028..0031 index status | Low | Director action outside this change | pending Director |
| Phase size vs 400-line PRs | High | §20 estimates; vendored modules split at natural seams (`protocol-apply`/`protocol-select`); v1 test files sliced by group | tasks phase forecasts |
| **D-10 vs DN-04** | Low | D-10 says "no LICENSE until B-16"; `LICENSE` (Apache-2.0) already exists at the root per CHECKLIST B-16 and DN-04. The design keeps `private: true` and lists `LICENSE` in `files` so PT-21 passes with the file present. Reported, not resolved | pending Director decision (B-16) |
| Trademark (B-11) | Low | `PRODUCT_NAME` single constant | pending Director decision (B-11) |
| Organisation marker in the origin label (THREAT-MODEL §7) | Low | Not added: the label carries `project_id`, `agent_id`, `user_id`; a tenant marker has no source of truth in F1 | pending Director decision (no backlog id) |
| Bytes-per-hour exfiltration ceiling (T22) | Low | Only the H3 rate budget in F1 | pending Director decision (no backlog id) |
| macOS half of PT-09/PT-19 | — | out of scope | B-12 (F6) |

## Threat matrix (skill step 2a)

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Documentation-like paths | N/A — no executable-file classification in F1 | — | — |
| Git repository selection | N/A — no product code invokes git; the pre-commit one-liner is documented, not shipped | — | — |
| Commit state | N/A — same | — | — |
| Push state / PR commands | N/A — no VCS or PR automation | — | — |
| Subprocess spawn (D-01) | Applicable | literal argv, `shell: false`, no env/cwd override, single site, bounded wait, spawn lock | §14 spawn-shape clauses; `client/spawn.test.ts` with injected `spawnImpl`; `client/run-state.test.ts` (bound, `DAEMON_DOWN`, zero network) |
| Local process integration (IPC listener, handshake) | Applicable | loopback only, `Host` check, body cap, mutual HMAC proof, per-session bearer, 401 without side effects, freeze | `daemon/ipc/{server,handshake,sessions}.test.ts`, `client/handshake.test.ts` (PT-24, PT-26) |
| Process signalling (`daemon stop`, pid liveness) | Applicable | identity challenge before `process.kill`; `kill(pid, 0)` is a pre-filter, never the guard | `cli/daemon-stop.test.ts`, `daemon/lifecycle/lock.test.ts` |

## 20. Suggested build order for `tasks` (authored src + test lines, rough)

| # | Unit (capability) | Content | Est. lines | PRs ≤ 400 |
|---|---|---|---|---|
| 1 | scaffold + constants + CI | `package.json`, tsconfigs, `ci.yml`, `shared/constants.ts`, `version.ts`, twins test, pack + repo-scan tests (PT-21, PT-22 pinned early) | ~350 | 1 |
| 2 | shared vendored | `envelope` (330 + sliced twin), `secrets`, `protocol-apply` (~333), `protocol-select` (~145), `thread-record`, `fence`, `tool-schemas`, `tool-output`, `error-payload`, provenance test + fixture | ~1,700 | 5–6 |
| 3 | `project-binding` | `project-file`, `token-shape`, `roster-hash`, registry `schema`/`invariants`/`loader` (fingerprint reload), `cli/validate` | ~750 | 2 |
| 4 | `ledger` | transaction spike, `schema`, `open`/`migrations`/quarantine, `inbox`, `threads` adapter, `cursors`, `audit`, `unknown-senders`, `conditions-store`, `retention` | ~1,500 | 4 |
| 5 | `secret-store` | types, keyring, file-fallback (PT-19 harness), redaction, selection | ~380 | 1 |
| 6 | `daemon-lifecycle` | `node-floor`, `home`, `log`, `lock` (SEAM), `heartbeat`, `run-file`, `idle`, `bootstrap`, `main`, `cli/daemon-stop`, `no-emission` test | ~1,000 | 3 |
| 7 | `durable-inbox` | `telegram` (SEAM, ~430), `transport/*` (AS-IS, ~330), `room-guard`, `binding-config`, `bindings`, `poller`, `admission`, `serve/fetch`, `serve/status`, `serve/thread` | ~2,300 | 6–7 |
| 8 | `send-path` | `send/validate`, `send/send-path`, `send/rate` | ~800 | 2–3 |
| 9 | `ipc-handshake` | `ipc-contract`, `ipc/server`, `handshake`, `sessions`, `routes` | ~950 | 3 |
| 10 | `thin-client-tools` | `server`, `binding`, `run-state`, `spawn`, `handshake`, `ipc-stub`, `errors`, `main`, `cli/main` | ~1,300 | 4 |
| 11 | `v1-migration` | `v1-config`, `v1-state`, `synthesize`, `main`, fixture home, runbook | ~1,000 | 3 |
| 12 | static assertions + wrong-room | `predicates` (AS-IS), `closure`, client/daemon tables, spawn shape, `wrong-room`, CI step | ~800 | 2–3 |
| 13 | documentation | DATA-MODEL fields final (incl. audit `reason` enum aligned to classification codes, `roster_snapshot` required, `body` column rule), THREAT-MODEL §4 file names (§15), CHECKLIST B-13/B-15/B-18 pointers | ~300 | 1 |

Total ≈ 13,000 authored lines over ≈ 38–40 chained PRs. `400-line budget risk: High` is expected; the tasks phase slices per unit as above. Where a vendored module exceeds the budget alone, the split named in §12 applies before any size exception is requested.
