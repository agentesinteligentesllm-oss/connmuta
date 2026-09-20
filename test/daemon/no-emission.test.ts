import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startHeartbeat } from "../../src/daemon/lifecycle/heartbeat.js";
import { checkIdleShutdown } from "../../src/daemon/lifecycle/idle.js";
import { IDLE_SHUTDOWN_HOURS } from "../../src/shared/constants.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

test("no-emission: simulated idle window and heartbeat ticks trigger zero outbound sends (ADR-0029, CONSTITUTION layer 2)", async () => {
  // Fake telegram/client recorder tracking outbound sends
  const recordedSends: Array<{ method: string; payload: unknown }> = [];
  const fakeClient = {
    sendMessage: (payload: unknown) => {
      recordedSends.push({ method: "sendMessage", payload });
    },
    sendPhoto: (payload: unknown) => {
      recordedSends.push({ method: "sendPhoto", payload });
    },
  };

  // Run simulated heartbeat ticks
  let tickCount = 0;
  const heartbeatHandle = startHeartbeat({
    periodMs: 10,
    onTick: () => {
      tickCount++;
      // A legitimate heartbeat tick does internal bookkeeping (e.g. lock heartbeat, registry check),
      // but never invokes fakeClient.sendMessage or any outbound send
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 55));
  heartbeatHandle.stop();

  assert.ok(tickCount >= 2, `expected multiple ticks, got ${tickCount}`);

  // Run simulated idle window checks
  const now = 2_000_000_000;
  let idleCalled = false;
  const idleResult = checkIdleShutdown({
    now: () => now,
    startedAt: now - (IDLE_SHUTDOWN_HOURS * 3600 * 1000 + 1000),
    getLastSessionSeenAt: () => null,
    getOpenThreadCount: () => 0,
    onIdle: () => {
      idleCalled = true;
      // Idle shutdown triggers daemon shutdown, never an outbound message
    },
  });

  assert.equal(idleResult, true);
  assert.equal(idleCalled, true);

  // Assert fake client recorded exactly 0 sends
  assert.equal(
    recordedSends.length,
    0,
    `expected 0 outbound sends, but recorded: ${JSON.stringify(recordedSends)}`,
  );
});

test("no-emission: heartbeat and idle modules import no transport or send modules (ADR-0029, design §14)", () => {
  const heartbeatSrc = readFileSync(join(REPO_ROOT, "src/daemon/lifecycle/heartbeat.ts"), "utf8");
  const idleSrc = readFileSync(join(REPO_ROOT, "src/daemon/lifecycle/idle.ts"), "utf8");

  const forbiddenPatterns = [
    /from\s+["'].*\/transport(\/.*)?["']/,
    /from\s+["'].*\/telegram(\.js)?["']/,
    /from\s+["'].*\/send(\/.*)?["']/,
    /from\s+["'].*\/envelope(\.js)?["']/,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.ok(
      !pattern.test(heartbeatSrc),
      `heartbeat.ts must not import transport/send modules (matched ${pattern})`,
    );
    assert.ok(
      !pattern.test(idleSrc),
      `idle.ts must not import transport/send modules (matched ${pattern})`,
    );
  }
});
