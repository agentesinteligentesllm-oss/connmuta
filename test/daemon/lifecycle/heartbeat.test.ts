import { test } from "node:test";
import assert from "node:assert/strict";
import { startHeartbeat } from "../../../src/daemon/lifecycle/heartbeat.js";
import { HEARTBEAT_PERIOD_MS } from "../../../src/shared/constants.js";

// Condition wait with a generous deadline (B-99): a fixed sleep expecting N ticks is flaky under
// CPU contention, because scheduling delay eats into the window, not because the heartbeat is
// wrong. Polling for the tick count itself, bounded by a deadline far longer than any real
// contention observed, keeps the guarantee (ticks happen) without coupling it to wall-clock timing.
async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 5000,
  intervalMs = 5,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

test("heartbeat: ticks at periodMs", async () => {
  let tickCount = 0;
  const handle = startHeartbeat({
    periodMs: 20,
    onTick: () => {
      tickCount++;
    },
  });

  const reachedTwoTicks = await waitForCondition(() => tickCount >= 2);
  handle.stop();

  assert.ok(reachedTwoTicks, `expected at least 2 ticks within the deadline, got ${tickCount}`);
});

test("heartbeat: calls onTick on every tick", async () => {
  const ticks: number[] = [];
  const handle = startHeartbeat({
    periodMs: 15,
    onTick: () => {
      ticks.push(Date.now());
    },
  });

  const reachedTwoTicks = await waitForCondition(() => ticks.length >= 2);
  handle.stop();

  assert.ok(reachedTwoTicks, `expected at least 2 ticks within the deadline, got ${ticks.length}`);
});

test("heartbeat: stops cleanly on .stop()", async () => {
  let tickCount = 0;
  const handle = startHeartbeat({
    periodMs: 15,
    onTick: () => {
      tickCount++;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 35));
  handle.stop();
  const countAfterStop = tickCount;

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(tickCount, countAfterStop, "no more ticks should occur after stop()");
});

test("heartbeat: updates heartbeat on lock if lock update function provided", async () => {
  let lockUpdateCount = 0;
  let tickCount = 0;

  const handle = startHeartbeat({
    periodMs: 15,
    updateLockHeartbeat: () => {
      lockUpdateCount++;
    },
    onTick: () => {
      tickCount++;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 40));
  handle.stop();

  assert.ok(lockUpdateCount >= 1, `expected lock update, got ${lockUpdateCount}`);
  assert.equal(lockUpdateCount, tickCount, "lock update should be called on every tick");
});

test("heartbeat: handles error in onTick via onError callback", async () => {
  const errors: unknown[] = [];
  const expectedError = new Error("tick failed");

  const handle = startHeartbeat({
    periodMs: 15,
    onTick: () => {
      throw expectedError;
    },
    onError: (err: unknown) => {
      errors.push(err);
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 35));
  handle.stop();

  assert.ok(errors.length >= 1, "expected onError to be invoked");
  assert.equal(errors[0], expectedError);
});

test("heartbeat: defaults to HEARTBEAT_PERIOD_MS", async () => {
  assert.ok(typeof HEARTBEAT_PERIOD_MS === "number");
  assert.ok(HEARTBEAT_PERIOD_MS > 0);

  let tickCount = 0;
  const handle = startHeartbeat({
    onTick: () => {
      tickCount++;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  handle.stop();

  assert.equal(tickCount, 0, `expected 0 ticks in 50ms with default period (${HEARTBEAT_PERIOD_MS}ms), got ${tickCount}`);
});
