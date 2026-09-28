import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_SENTINEL,
  SUPPORTED_PROTOCOL_SENTINELS,
  NODE_FLOOR,
  BOT_API_RETENTION_HOURS,
  RETENTION_WARNING_HOURS,
  MAX_SURFACED_THREADS,
  OPEN_THREAD_BACKLOG_THRESHOLD,
  DAEMON_LOCK_STALE_SECONDS,
  HEARTBEAT_PERIOD_MS,
  FETCH_LONGPOLL_MAX_SECONDS,
  REQUEST_OVERHEAD_SECONDS,
  IPC_REQUEST_TIMEOUT_MS,
  SPAWN_WAIT_SECONDS,
  SPAWN_LOCK_STALE_SECONDS,
  RESOLVED_THREAD_RETENTION_DAYS,
  AUDIT_RETENTION_DAYS,
  MAX_BATCH,
  MAX_LONGPOLL_SECONDS,
  POLL_ERROR_BACKOFF_SECONDS,
  PRODUCT_NAME,
  PROJECT_FILE_NAME,
  HOME_DIR_NAME,
  TOOL_PREFIX,
  LEDGER_SCHEMA_VERSION,
  ARENA_LIGHT_MAX_ROUNDS,
  DEBATE_MARKER_PREFIX,
  ARENA_LIGHT_MESSAGES_PER_ROUND,
  GROUP_MESSAGES_PER_MINUTE,
  DOORBELL_SCAN_DEPTH,
  CHANNEL_SERVER_NAME,
  CHANNEL_HOST_LABEL,
  CHANNEL_RETRY_BACKOFF_SECONDS,
  CHANNEL_META_LIST_LIMIT,
  CHANNEL_SHUTDOWN_TIMEOUT_MS,
} from "../../src/shared/constants.js";
import { IPC_SESSION_HOST_MAX_CHARS } from "../../src/shared/ipc-contract.js";

test("PROTOCOL_SENTINEL pins the emitted wire sentinel to AGENTBUS/2 (W1)", () => {
  assert.equal(PROTOCOL_SENTINEL, "AGENTBUS/2");
});

test("SUPPORTED_PROTOCOL_SENTINELS accepts both /1 and /2 and always includes the emitted sentinel (W8)", () => {
  assert.equal(SUPPORTED_PROTOCOL_SENTINELS.has("AGENTBUS/1"), true);
  assert.equal(SUPPORTED_PROTOCOL_SENTINELS.has("AGENTBUS/2"), true);
  assert.equal(SUPPORTED_PROTOCOL_SENTINELS.has(PROTOCOL_SENTINEL), true);
});

test("NODE_FLOOR pins the node:sqlite release-candidate floor (D-03)", () => {
  assert.equal(NODE_FLOOR, "24.15.0");
});

test("PRODUCT_NAME derives the project file name, home directory name and tool prefix (D-09, B-11)", () => {
  assert.equal(PRODUCT_NAME, "conmuta");
  assert.equal(PROJECT_FILE_NAME, `${PRODUCT_NAME}.json`);
  assert.equal(HOME_DIR_NAME, `.${PRODUCT_NAME}`);
  assert.equal(TOOL_PREFIX, `${PRODUCT_NAME}_`);
});

test("confirmed base values stay pinned to their v1-derived numbers", () => {
  assert.equal(BOT_API_RETENTION_HOURS, 24);
  assert.equal(MAX_LONGPOLL_SECONDS, 50);
  assert.equal(MAX_SURFACED_THREADS, 20);
  assert.equal(REQUEST_OVERHEAD_SECONDS, 20);
  assert.equal(RESOLVED_THREAD_RETENTION_DAYS, 30);
  assert.equal(DAEMON_LOCK_STALE_SECONDS, 10); // D3, not tuning
});

test("derived constants are derived from their bases, never restated", () => {
  assert.equal(RETENTION_WARNING_HOURS, BOT_API_RETENTION_HOURS * 0.75);
  assert.equal(OPEN_THREAD_BACKLOG_THRESHOLD, MAX_SURFACED_THREADS * 2.5);
  assert.equal(HEARTBEAT_PERIOD_MS, (DAEMON_LOCK_STALE_SECONDS * 1000) / 3);
  assert.equal(IPC_REQUEST_TIMEOUT_MS, (FETCH_LONGPOLL_MAX_SECONDS + REQUEST_OVERHEAD_SECONDS) * 1000);
  // SPAWN_WAIT_SECONDS is tuning (design §3): pin the relation, never the resulting number.
  assert.equal(SPAWN_LOCK_STALE_SECONDS, SPAWN_WAIT_SECONDS + DAEMON_LOCK_STALE_SECONDS);
  assert.equal(AUDIT_RETENTION_DAYS, RESOLVED_THREAD_RETENTION_DAYS * 3);
  assert.equal(POLL_ERROR_BACKOFF_SECONDS, MAX_LONGPOLL_SECONDS / 10);
});

// --- F5: Arena-light 2-party debates (Phase 1: Foundation) ---

test("LEDGER_SCHEMA_VERSION is bumped to 2 by the debate_journal migration (ledger spec 'Forward migration adds debate_journal at schema version 2')", () => {
  assert.equal(LEDGER_SCHEMA_VERSION, 2);
});

test("ARENA_LIGHT_MAX_ROUNDS caps an Arena-light debate at 3 COUNTER rounds (T13, GOVERNANCE.md's tribunal round-cap precedent)", () => {
  assert.equal(ARENA_LIGHT_MAX_ROUNDS, 3);
});

test("DEBATE_MARKER_PREFIX matches design.md Decision (b)'s one-line delimiter format", () => {
  assert.equal(DEBATE_MARKER_PREFIX, "[ARENA-LIGHT:");
});

test("ARENA_LIGHT_MESSAGES_PER_ROUND is declared alongside GROUP_MESSAGES_PER_MINUTE for the per-turn rate budget (proposal.md Success Criteria)", () => {
  // Deferred wiring (task 3.4, PR-5): `send-path.ts` is what asserts this by behaviour once a
  // debate turn's own send is wired to the rate check. This Phase-1 slice pins only the value.
  assert.equal(ARENA_LIGHT_MESSAGES_PER_ROUND, 1);
  assert.equal(typeof GROUP_MESSAGES_PER_MINUTE, "number");
});

// --- F4: Claude Code channels adapter (Unit 1: shared schema, constants, envelope export) ---

test("DOORBELL_SCAN_DEPTH equals MAX_BATCH, so a doorbell scan never does more work than one fetch batch (D3)", () => {
  assert.equal(DOORBELL_SCAN_DEPTH, MAX_BATCH);
});

test("CHANNEL_SERVER_NAME derives from PRODUCT_NAME and is also the adapter's bin name (D9)", () => {
  assert.equal(CHANNEL_SERVER_NAME, `${PRODUCT_NAME}-channel`);
});

test("CHANNEL_HOST_LABEL matches DATA-MODEL §3.5's host label and fits IPC_SESSION_HOST_MAX_CHARS", () => {
  assert.equal(CHANNEL_HOST_LABEL, "claude-code-channel");
  assert.ok(CHANNEL_HOST_LABEL.length <= IPC_SESSION_HOST_MAX_CHARS);
});

test("CHANNEL_RETRY_BACKOFF_SECONDS equals POLL_ERROR_BACKOFF_SECONDS, the daemon's own transient-fault pacing (D7)", () => {
  assert.equal(CHANNEL_RETRY_BACKOFF_SECONDS, POLL_ERROR_BACKOFF_SECONDS);
});

test("CHANNEL_META_LIST_LIMIT pins the distinct-values-per-meta-list cap (v1 notify.ts:10)", () => {
  assert.equal(CHANNEL_META_LIST_LIMIT, 4);
});

test("CHANNEL_SHUTDOWN_TIMEOUT_MS bounds the shutdown DELETE /session at one local round trip, = REQUEST_OVERHEAD_SECONDS in ms", () => {
  assert.equal(CHANNEL_SHUTDOWN_TIMEOUT_MS, REQUEST_OVERHEAD_SECONDS * 1000);
});
