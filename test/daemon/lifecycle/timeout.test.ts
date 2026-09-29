import { test } from "node:test";
import assert from "node:assert/strict";
import { raceAgainstTimeout } from "../../../src/daemon/lifecycle/timeout.js";

test("raceAgainstTimeout: resolves once the promise settles when it is faster than the timeout", async () => {
  let resolved = false;
  const fast = new Promise<void>((resolve) =>
    setTimeout(() => {
      resolved = true;
      resolve();
    }, 5),
  );

  await raceAgainstTimeout(fast, 5_000);

  assert.equal(resolved, true, "the awaited promise must have actually settled, not just the timeout");
});

test("raceAgainstTimeout: resolves via the timeout when the promise never settles, without throwing", async () => {
  const stuck = new Promise<void>(() => {});

  const startedAt = Date.now();
  await raceAgainstTimeout(stuck, 20);
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 2_000, `must resolve via the timeout, not hang forever; took ${elapsedMs}ms`);
});
