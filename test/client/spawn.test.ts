import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { spawnDaemon, DAEMON_ENTRY, SPAWN_OPTIONS, REAL_SPAWN, type SpawnImpl } from "../../src/client/spawn.js";

interface RecordedSpawnCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: typeof SPAWN_OPTIONS;
}

function createFakeSpawn(): {
  spawnImpl: SpawnImpl;
  calls: RecordedSpawnCall[];
  getUnrefCallCount: () => number;
} {
  const calls: RecordedSpawnCall[] = [];
  let unrefCallCount = 0;
  const spawnImpl: SpawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    return {
      pid: 4242,
      unref: () => {
        unrefCallCount += 1;
      },
    } as unknown as ChildProcess;
  };
  return { spawnImpl, calls, getUnrefCallCount: () => unrefCallCount };
}

test("spawnDaemon calls the injected spawn implementation once with the literal argv and options", () => {
  const fake = createFakeSpawn();

  const pid = spawnDaemon(fake.spawnImpl);

  assert.equal(fake.calls.length, 1, "spawn must be called exactly once");
  assert.equal(fake.calls[0].command, process.execPath);
  assert.deepEqual(fake.calls[0].args, [DAEMON_ENTRY]);
  assert.deepEqual(fake.calls[0].options, SPAWN_OPTIONS);
  assert.equal(SPAWN_OPTIONS.shell, false);
  assert.equal(SPAWN_OPTIONS.detached, true);
  assert.equal(SPAWN_OPTIONS.windowsHide, true);
  assert.equal(fake.getUnrefCallCount(), 1, "the returned child must be unref'd exactly once");
  assert.equal(pid, 4242);
});

test("argv never carries caller input regardless of --project", () => {
  const originalArgv = process.argv;
  try {
    process.argv = [...originalArgv, "--project", "alpha-project"];
    const fakeA = createFakeSpawn();
    spawnDaemon(fakeA.spawnImpl);

    process.argv = [...originalArgv, "--project", "totally-different-project-xyz"];
    const fakeB = createFakeSpawn();
    spawnDaemon(fakeB.spawnImpl);

    assert.deepEqual(fakeA.calls[0].args, [DAEMON_ENTRY]);
    assert.deepEqual(fakeB.calls[0].args, [DAEMON_ENTRY]);
    assert.deepEqual(fakeA.calls[0].args, fakeB.calls[0].args, "argv must be identical regardless of --project");
    assert.ok(!fakeA.calls[0].args.some((arg) => arg.includes("alpha-project")));
    assert.ok(!fakeB.calls[0].args.some((arg) => arg.includes("totally-different-project-xyz")));
  } finally {
    process.argv = originalArgv;
  }
});

test("the default spawnImpl is the real node:child_process spawn, by reference", () => {
  // Never invoke the default for real: that would launch an actual daemon process against the
  // developer's real ~/.conmuta. Reference identity is the whole guarantee — every behavioral test
  // above injects an explicit fake, so nothing else in this file exercises the default at all.
  assert.equal(REAL_SPAWN, spawn);
});

test("DAEMON_ENTRY is a fixed, resolvable path to the compiled daemon entry point", () => {
  assert.ok(DAEMON_ENTRY.length > 0);
  assert.ok(DAEMON_ENTRY.endsWith("main.js"));
  assert.ok(DAEMON_ENTRY.includes("daemon"));
  assert.ok(existsSync(DAEMON_ENTRY), "DAEMON_ENTRY must resolve to the real compiled daemon entry point");
});
