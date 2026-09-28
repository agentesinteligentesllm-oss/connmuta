/**
 * The ledger's schema, version 1 (`ledger/schema.ts`, design §5.2).
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against: this file carries no provenance header and
 * `test/fixtures/v1-provenance.json` stays at its eleven entries. That header's own first token — a
 * capitalised `Provenance` with a colon — is what `test/security/provenance.test.ts` keys on when it
 * decides whether a file is a vendored copy, so this comment states the fact without spelling the token:
 * a *leading* block that carries it must also parse as a complete header, and this module has no imports
 * to put in front of its doc comment. That gate is exactly what caught the first draft, which spelled the
 * token out and was reported as a malformed vendored module.
 *
 * The DDL is authored in the design and this file is that text, so the suite in
 * `test/ledger/schema.test.ts` checks what a database does with it rather than reading it back. It is
 * one string because `node:sqlite`'s `exec()` runs multiple statements — `ledger/open.ts` passes it to
 * `exec()` inside the transaction its first migration opens (design §5.1).
 * This module owns no connection, no file path and no PRAGMA — the open sequence owns those, including
 * the `PRAGMA user_version` this DDL deliberately does not stamp (the version constant is
 * `LEDGER_SCHEMA_VERSION` in `shared/constants.ts`).
 *
 * Three choices in the text carry their reasoning inline, where the reader of the SQL will meet them:
 *
 * - every table is `STRICT`, so a wrong storage class is a refusal instead of a silent conversion;
 * - `needs_action` is a VIEW plus an index rather than a materialized table (ruling (d)), which keeps
 *   the per-agent filter and the reminder math in TypeScript — no window constant appears in the DDL;
 * - `audit_log` and `unknown_senders` have no body column at all, so PT-20's "no body of a rejected or
 *   foreign message" is a property of the schema and not only of the writers.
 *
 * **A boundary the DDL does not enforce, so that the inline comments are not read as one.** The
 * `-- NULL for apply_outcome IN ('rejected','ignored')` beside `updates.body` is a *destination* for
 * D-20's writer rule, not a constraint: SQLite accepts a `rejected` row carrying a body (measured on the
 * pinned build), because coupling two columns is not something this DDL does. `ledger/inbox.ts` (PR-12)
 * is where the coupling is enforced, and the durable-inbox requirement is what it answers to.
 */

/**
 * The complete version-1 DDL, verbatim from design §5.2.
 *
 * Applied once per fresh ledger by the first migration; `CREATE TABLE` is not idempotent, and nothing
 * here uses `IF NOT EXISTS`, so a second application is an error rather than a silent no-op.
 */
export const LEDGER_SCHEMA_DDL = `CREATE TABLE offsets (
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
`;

/**
 * The version-2 addition to the ledger's schema: `debate_journal`, Arena-light's side journal
 * (F5; DATA-MODEL.md §3.7, "Arena-light side journal (D7, F5)").
 *
 * Debate metadata cannot ride the wire — an envelope field the decoder does not recognise is
 * stripped (v1 `src/envelope.ts:115`) — so the daemon journals it here instead, from the body
 * markers `shared/debate-marker.ts` recognises. Applied only through `ledger/migrations.ts`'s
 * version-2 step (design.md Architecture Decisions (a): "Append `{ to: 2, up }` to
 * `LEDGER_MIGRATIONS`; new `DEBATE_JOURNAL_DDL` (v1 DDL untouched)"), never appended to
 * {@link LEDGER_SCHEMA_DDL} — a schema change is the next migration, never an edit to a shipped
 * one, the same rule that DDL's own doc comment states above.
 *
 * `STRICT` and no `IF NOT EXISTS` mirror the v1 table conventions, for the same reasons: a wrong
 * storage class is a refusal instead of a silent conversion, and a second application is an error
 * rather than a silent no-op — both properties the forward-only migration path depends on.
 *
 * Columns, in DATA-MODEL.md §3.7's own order: `id` (rowid alias); `project_id`/`debate_id` (a
 * debate never crosses bindings; `debate_id` = the `PROPOSAL` thread's `thread_id`); `round`
 * (daemon-enforced cap `ARENA_LIGHT_MAX_ROUNDS`); `turn` (the body-marker subtype, CHECK-closed to
 * the five `DebateTurnKind` values); `verdict` (nullable — its closed token set is fixed by F5 in
 * TypeScript rather than a second DDL CHECK, the same "open string, not a DB-level closed enum"
 * choice `audit_log.reason`'s own doc above states, for a value this table only stores and never
 * branches on); `eid`/`from_agent_id`/`to_agent_id` (always known at journal time); `refs` (a JSON
 * array of pointer-only payloads — commit, PR, path, memory id — never an inline diff, D7);
 * `basis_at_close` (nullable, set only on `CONSENSUS`/`ESCALATE`); `at` (ISO timestamp).
 */
export const DEBATE_JOURNAL_DDL = `CREATE TABLE debate_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, debate_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  turn TEXT NOT NULL CHECK (turn IN ('PROPOSAL','AUDIT','COUNTER','CONSENSUS','ESCALATE')),
  verdict TEXT, eid TEXT NOT NULL, from_agent_id TEXT NOT NULL, to_agent_id TEXT NOT NULL,
  refs TEXT NOT NULL, basis_at_close TEXT, at TEXT NOT NULL) STRICT;
`;
