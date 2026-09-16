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
  MAX_LONGPOLL_SECONDS,
  POLL_ERROR_BACKOFF_SECONDS,
  PRODUCT_NAME,
  PROJECT_FILE_NAME,
  HOME_DIR_NAME,
  TOOL_PREFIX,
} from "../../src/shared/constants.js";

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
