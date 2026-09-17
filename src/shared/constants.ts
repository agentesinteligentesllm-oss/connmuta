/**
 * Provenance: telegram-agent-bus src/config.ts:26-166 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 039d53a22b54f8c1a061c602f419e6272cd1f8a3fe260301d7fe36b4e892e15e
 * Changes: (1) LOCK_STALE_SECONDS, STATE_VERSION dropped; (2) OPEN_THREAD_BACKLOG_THRESHOLD
 * derived; (3) design §3 additions; (4) `EXIT_VALIDATION_FAILED` added by PR-08 (design.md:126's
 * exit-code table: the first command whose failure is neither a usage error nor a runtime fault).
 */

/**
 * Single source for the product's own name (D-09, B-11 — trademark clearance pending).
 *
 * Every other product-shaped literal below is derived from this one constant so renaming the
 * product touches exactly one line.
 */
export const PRODUCT_NAME = "conmuta";

/** Name of the per-project binding file the installer writes (derived from {@link PRODUCT_NAME}). */
export const PROJECT_FILE_NAME = `${PRODUCT_NAME}.json`;

/** Name of the daemon's home directory under the user's home (derived from {@link PRODUCT_NAME}). */
export const HOME_DIR_NAME = `.${PRODUCT_NAME}`;

/** Prefix every MCP tool name carries so two bridges never collide in one IDE (derived). */
export const TOOL_PREFIX = `${PRODUCT_NAME}_`;

/** OS keyring service name under which the daemon stores bot tokens (derived, §6). */
export const KEYRING_SERVICE = PRODUCT_NAME;

/** Name the thin client advertises as its MCP server identity to the IDE host that spawns it. */
export const MCP_SERVER_NAME = PRODUCT_NAME;

/**
 * Wire sentinel prefixing every envelope's serialized text — what this node EMITS.
 *
 * Confirmed from v1 (`v1:src/config.ts:26`); no wire change ships in v2 (CONSTITUTION §4, rule W1).
 */
export const PROTOCOL_SENTINEL = "AGENTBUS/2";

/**
 * Every sentinel this node ACCEPTS on decode (`v1:src/config.ts:40`).
 *
 * `test/shared/constants.test.ts` asserts {@link PROTOCOL_SENTINEL} is a member (W8): raising the
 * emitted sentinel without adding it here would leave this node unable to decode its own group copy.
 */
export const SUPPORTED_PROTOCOL_SENTINELS: ReadonlySet<string> = new Set([
  "AGENTBUS/2",
  "AGENTBUS/1",
]);

/**
 * Minimum Node.js version this package requires (D-03).
 *
 * `node:sqlite` is a release candidate starting at this exact version (exploration Q7); the daemon
 * gate refuses to start below it rather than fail confusingly deep inside the ledger.
 */
export const NODE_FLOOR = "24.15.0";

/** First shipped shape of the ledger's own schema. */
export const LEDGER_SCHEMA_VERSION = 1;

/** First shipped shape of `~/.conmuta/registry.json`. */
export const REGISTRY_VERSION = 1;

/** First shipped shape of the per-project binding file. */
export const PROJECT_FILE_SCHEMA_VERSION = 1;

/** Hours the Bot API retains undelivered updates before they are lost (H2, confirmed from v1). */
export const BOT_API_RETENTION_HOURS = 24;

/**
 * Hours since the last fetch at which a status report starts warning.
 *
 * Derived as three quarters of {@link BOT_API_RETENTION_HOURS} (`v1:src/config.ts:72`) so the two
 * can never drift apart.
 */
export const RETENTION_WARNING_HOURS = BOT_API_RETENTION_HOURS * 0.75;

/** Maximum long-poll duration, in seconds, for `getUpdates` (H4 clamp, confirmed from v1). */
export const MAX_LONGPOLL_SECONDS = 50;

/**
 * Longest a thin client may block on one `agentbus_fetch` IPC call, in seconds (D-02).
 *
 * A client blocked longer than one Telegram long-poll cycle gains nothing: every update the daemon
 * can see arrives within one cycle, so this equals {@link MAX_LONGPOLL_SECONDS} exactly.
 */
export const FETCH_LONGPOLL_MAX_SECONDS = MAX_LONGPOLL_SECONDS;

/** Maximum updates requested per `getUpdates` call — the Bot API's own ceiling (confirmed). */
export const MAX_BATCH = 100;

/** Network allowance added on top of the long-poll wait (`v1:src/telegram.ts:300`, confirmed). */
export const REQUEST_OVERHEAD_SECONDS = 20;

/**
 * Timeout, in milliseconds, the thin client applies to its IPC call to the daemon.
 *
 * Same budget shape as v1's `requestTimeoutMs` (`v1:src/telegram.ts:314-317`) applied to the local
 * IPC hop instead of the Telegram call.
 */
export const IPC_REQUEST_TIMEOUT_MS = (FETCH_LONGPOLL_MAX_SECONDS + REQUEST_OVERHEAD_SECONDS) * 1000;

/** Default hours after which an unresolved REQUEST is flagged as due for a reminder (confirmed). */
export const REQUEST_REMINDER_WINDOW_HOURS = 24;

/**
 * Days an `eid` stays in the dedup set before it is pruned (confirmed from v1, 7x margin over
 * {@link BOT_API_RETENTION_HOURS} per `v1:src/config.ts:131-139`).
 */
export const SEEN_EID_RETENTION_DAYS = 7;

/**
 * Days an inbox row stays before it is pruned.
 *
 * `updates` is the dedup set (`UNIQUE(project_id, eid)`, ruling (d)); the same margin argument that
 * justifies {@link SEEN_EID_RETENTION_DAYS} bounds it, so the two are equal by construction.
 */
export const INBOX_RETENTION_DAYS = SEEN_EID_RETENTION_DAYS;

/** Days a RESOLVED thread is kept before it is pruned (confirmed from v1). Open threads never age out. */
export const RESOLVED_THREAD_RETENTION_DAYS = 30;

/**
 * Days an audit row is kept before it is pruned.
 *
 * An incident on any thread still readable must still be reconstructable from the audit log (T10),
 * so the audit window outlives the thread window it can be asked about — three times over.
 */
export const AUDIT_RETENTION_DAYS = RESOLVED_THREAD_RETENTION_DAYS * 3;

/**
 * Days an unknown-sender row is kept before it is pruned.
 *
 * A stranger silent for a full resolved-thread window is not a live bootstrap candidate, so this
 * equals {@link RESOLVED_THREAD_RETENTION_DAYS}.
 */
export const UNKNOWN_SENDER_RETENTION_DAYS = RESOLVED_THREAD_RETENTION_DAYS;

/**
 * Hours of client silence after which a session is considered stale.
 *
 * A session silent for the whole Bot API retention window is a dead IDE; its cursor is already
 * behind the catch-up window, so this equals {@link BOT_API_RETENTION_HOURS}.
 */
export const CLIENT_SESSION_STALE_HOURS = BOT_API_RETENTION_HOURS;

/**
 * Hours of history a freshly attached session catches up on (§8.4).
 *
 * A fresh session starts at the newest `updates.seq` older than this window, so it sees exactly
 * what a v1 session got directly from Telegram; equals {@link BOT_API_RETENTION_HOURS}.
 */
export const SESSION_CATCHUP_HOURS = BOT_API_RETENTION_HOURS;

/** Maximum in-thread messages kept per thread, newest first (confirmed from v1). */
export const MAX_THREAD_HISTORY = 50;

/** Maximum thread entries any single tool result may carry (ADR-12, confirmed from v1). */
export const MAX_SURFACED_THREADS = 20;

/** Slots in the surfaced window reserved for threads never shown before (confirmed from v1). */
export const FLOOR_NEW = 8;

/** Slots in the surfaced window reserved for overdue threads (confirmed from v1). */
export const FLOOR_REMINDER = 6;

/**
 * Open-thread count past which a backlog condition is raised.
 *
 * v1 carried this as a literal with the derivation only in prose (`v1:src/config.ts:161-166`); here
 * it is derived in code so the two can never drift apart (CONSTITUTION §5).
 */
export const OPEN_THREAD_BACKLOG_THRESHOLD = MAX_SURFACED_THREADS * 2.5;

/** Maximum characters allowed in an envelope's `body` (confirmed from v1). */
export const MAX_BODY_CHARS = 3000;

/** Telegram's own text message length ceiling (confirmed from v1). */
export const TELEGRAM_MAX_TEXT_CHARS = 4096;

/** Outbound messages per minute allowed to one Telegram group binding (H3, new). */
export const GROUP_MESSAGES_PER_MINUTE = 20;

/** Outbound messages per second allowed to one Telegram chat (H3, new). */
export const CHAT_MESSAGES_PER_SECOND = 1;

/**
 * Seconds after which the daemon's own election lock is considered stale and reclaimable (D3
 * "~10 s", new).
 *
 * Replaces v1's bridge-level `LOCK_STALE_SECONDS` (120s): the bridge lock is gone entirely — there
 * is now an in-daemon mutex instead (OVERVIEW §7.4) — so only the daemon election window remains.
 */
export const DAEMON_LOCK_STALE_SECONDS = 10;

/**
 * Milliseconds between heartbeat writes by a live daemon.
 *
 * A live daemon must write at least two beats inside any stale window even when one write is
 * delayed, so this is a third of {@link DAEMON_LOCK_STALE_SECONDS} expressed in milliseconds.
 */
export const HEARTBEAT_PERIOD_MS = (DAEMON_LOCK_STALE_SECONDS * 1000) / 3;

/**
 * Seconds a spawning client waits for the daemon it just launched before giving up (tuning).
 *
 * Three times a generous cold start on a laptop disk, below every known host tool timeout; the test
 * pins "returns `DAEMON_DOWN` after the bound and never polls", never the number itself.
 */
export const SPAWN_WAIT_SECONDS = 15;

/**
 * Seconds after which a client's own spawn-election lock is considered stale.
 *
 * Covers a spawner that vanished mid-wait plus one full daemon election window.
 */
export const SPAWN_LOCK_STALE_SECONDS = SPAWN_WAIT_SECONDS + DAEMON_LOCK_STALE_SECONDS;

/**
 * Hours of no session and no open thread after which the daemon shuts itself down (tuning).
 *
 * Survives a lunch break, does not poll all night; a wrong guess costs one lazy respawn.
 */
export const IDLE_SHUTDOWN_HOURS = 1;

/**
 * Seconds the poller backs off after a transient fetch error.
 *
 * A transient fault costs one tenth of a long-poll cycle; a dead link does not spin.
 */
export const POLL_ERROR_BACKOFF_SECONDS = MAX_LONGPOLL_SECONDS / 10;

/**
 * Hours between retention sweeps.
 *
 * The smallest retention unit is a day; hourly sweeps bound overshoot to 1/24 of it for one indexed
 * `DELETE` per table.
 */
export const RETENTION_SWEEP_INTERVAL_HOURS = 1;

/** Bytes of randomness in the daemon's run secret — HMAC-SHA256 output length (RFC 2104 §3). */
export const RUN_SECRET_BYTES = 32;

/** Bytes of randomness in an IPC handshake nonce — HMAC-SHA256 output length (RFC 2104 §3). */
export const IPC_NONCE_BYTES = 32;

/** Bytes of randomness in an IPC session token — HMAC-SHA256 output length (RFC 2104 §3). */
export const SESSION_TOKEN_BYTES = 32;

/**
 * Seconds a pending handshake nonce stays valid.
 *
 * One local round trip's allowance; bounds the pending-nonce map. Equals
 * {@link REQUEST_OVERHEAD_SECONDS}.
 */
export const HANDSHAKE_NONCE_TTL_SECONDS = REQUEST_OVERHEAD_SECONDS;

/** Maximum pending (unconfirmed) handshakes the daemon holds at once (new). */
export const MAX_PENDING_HANDSHAKES = 64;

/**
 * Maximum bytes accepted in one IPC request body.
 *
 * The largest legitimate request — a send body of {@link MAX_BODY_CHARS} in worst-case UTF-8 plus
 * JSON framing — fits five times over.
 */
export const IPC_MAX_BODY_BYTES = 64 * 1024;

/** Port the daemon's IPC server binds to — 0 means "pick a random free port" (ADR-0029 rule 3). */
export const IPC_EPHEMERAL_PORT = 0;

/** Octal file mode for POSIX owner-only private files; Windows relies on the inherited home DACL (§6). */
export const POSIX_PRIVATE_FILE_MODE = 0o600;

/** Octal directory mode for POSIX owner-only private directories; see {@link POSIX_PRIVATE_FILE_MODE}. */
export const POSIX_PRIVATE_DIR_MODE = 0o700;

/**
 * Maximum bytes the daemon's own log file grows to before truncation.
 *
 * Days of error lines; truncate-on-exceed keeps the home bounded without rotation code.
 */
export const DAEMON_LOG_MAX_BYTES = 1024 * 1024;

/** Slug pattern a project id must match (ruling (d)). */
export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,40}$/;

/** Marker prefix that identifies a BROADCAST as a checkpoint for catch-up windowing (confirmed). */
export const CHECKPOINT_MARKER = "[CHECKPOINT-ESTADO]";

// Exit code 1 is reserved for uncaught errors and is never assigned a named constant.

/** Conventional usage-error exit code. */
export const EXIT_USAGE = 2;

/** Exit code: the CLI ran against a project with no binding recorded in the registry. */
export const EXIT_UNBOUND_PROJECT = 3;

/** Exit code: the bound project id does not match the one the caller expected. */
export const EXIT_PROJECT_MISMATCH = 4;

/** Exit code: the running Node.js version is below {@link NODE_FLOOR}. */
export const EXIT_NODE_FLOOR = 5;

/** Exit code: a second daemon instance refused to start because one is already running. */
export const EXIT_DAEMON_ALREADY_RUNNING = 6;

/** Exit code: a v1-to-v2 migration was refused (e.g. quarantined source data). */
export const EXIT_MIGRATION_REFUSED = 7;

/**
 * Exit code: `conmuta validate` refused a file's content.
 *
 * Distinct from {@link EXIT_USAGE} (2) because the invocation was well-formed and the *content* was
 * refused: a pre-commit hook and, in F2, `doctor` both branch on that difference, and reporting a
 * data refusal as a usage error would make the two indistinguishable. Distinct from 1, which is
 * reserved for uncaught errors and is never assigned a named constant (see the note above).
 * design.md:126 enumerates the other commands' codes; `conmuta validate` is the first command whose
 * failure is neither a usage error nor a runtime fault, so the table gains this next value.
 */
export const EXIT_VALIDATION_FAILED = 8;

/**
 * Minimum number of files the client bundle's transitive closure must contain (§14).
 *
 * A scan over fewer files than this means an entry moved and the static assertion went blind
 * (non-vacuous rule).
 */
export const MIN_CLIENT_BUNDLE_FILES = 8;

/** Minimum number of files the daemon bundle's transitive closure must contain (§14). See {@link MIN_CLIENT_BUNDLE_FILES}. */
export const MIN_DAEMON_BUNDLE_FILES = 24;
