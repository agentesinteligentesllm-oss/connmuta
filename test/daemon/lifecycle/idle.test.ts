import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIdleShutdown, startIdleCheck } from "../../../src/daemon/lifecycle/idle.js";
import { IDLE_SHUTDOWN_HOURS } from "../../../src/shared/constants.js";

const ONE_HOUR_MS = 3600 * 1000;
const IDLE_WINDOW_MS = IDLE_SHUTDOWN_HOURS * ONE_HOUR_MS;

test("idle: open thread blocks idle shutdown even if idle time exceeds threshold", () => {
  let onIdleCalled = false;
  const now = 1_000_000_000;

  const shouldShutdown = checkIdleShutdown({
    now: () => now,
    startedAt: now - (IDLE_WINDOW_MS + 1000),
    getLastSessionSeenAt: () => now - (IDLE_WINDOW_MS + 1000),
    getOpenThreadCount: () => 1, // 1 open thread
    onIdle: () => {
      onIdleCalled = true;
    },
  });

  assert.equal(shouldShutdown, false, "open thread must block idle shutdown");
  assert.equal(onIdleCalled, false, "onIdle must not be called when open threads exist");
});

test("idle: shutdown triggers when 0 open threads and idle window elapsed", () => {
  let onIdleCalled = false;
  const now = 1_000_000_000;

  const shouldShutdown = checkIdleShutdown({
    now: () => now,
    startedAt: now - (IDLE_WINDOW_MS + 1000),
    getLastSessionSeenAt: () => now - (IDLE_WINDOW_MS + 1000),
    getOpenThreadCount: () => 0, // no open threads
    onIdle: () => {
      onIdleCalled = true;
    },
  });

  assert.equal(shouldShutdown, true, "idle shutdown should trigger when idle window elapsed with 0 open threads");
  assert.equal(onIdleCalled, true, "onIdle should be called when idle shutdown triggers");
});

test("idle: does not trigger when within idle window", () => {
  let onIdleCalled = false;
  const now = 1_000_000_000;

  const shouldShutdown = checkIdleShutdown({
    now: () => now,
    startedAt: now - (IDLE_WINDOW_MS - 5000),
    getLastSessionSeenAt: () => now - (IDLE_WINDOW_MS - 5000),
    getOpenThreadCount: () => 0,
    onIdle: () => {
      onIdleCalled = true;
    },
  });

  assert.equal(shouldShutdown, false, "idle shutdown must not trigger within idle window");
  assert.equal(onIdleCalled, false);
});

test("idle: falls back to startedAt when no session was seen", () => {
  let onIdleCalled = false;
  const now = 1_000_000_000;

  const shouldShutdown = checkIdleShutdown({
    now: () => now,
    startedAt: now - (IDLE_WINDOW_MS + 5000),
    getLastSessionSeenAt: () => null, // no session ever seen
    getOpenThreadCount: () => 0,
    onIdle: () => {
      onIdleCalled = true;
    },
  });

  assert.equal(shouldShutdown, true, "should use startedAt if no session was ever seen");
  assert.equal(onIdleCalled, true);
});

test("idle: startIdleCheck runs periodically and triggers onIdle, and stops on .stop()", async () => {
  let idleTriggered = false;
  const now = 1_000_000_000;

  const handle = startIdleCheck({
    checkIntervalMs: 15,
    now: () => now,
    startedAt: now - (IDLE_WINDOW_MS + 1000),
    getLastSessionSeenAt: () => null,
    getOpenThreadCount: () => 0,
    onIdle: () => {
      idleTriggered = true;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 40));
  handle.stop();

  assert.equal(idleTriggered, true, "startIdleCheck should trigger onIdle periodically");
});
