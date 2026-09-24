import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Lazy daemon spawn — the one allow-listed `child_process` call site in the client bundle (D-01
 * Option A; spec `daemon-lifecycle › Lazy spawn is one allow-listed call site (D-01 Option A)`).
 *
 * design.md's illustrative snippet (§11, "Lazy spawn (D-01)" row) shows `spawnDaemon()` taking no
 * parameters. This module adds one optional injectable spawn function on top of that snippet so unit
 * tests never launch a real background process against a developer's real `~/.conmuta` — production
 * behavior is identical to the design snippet when the parameter is omitted (disclosed apply-time
 * refinement).
 */

/** Resolved path to the compiled daemon entry point, next to this compiled module. */
export const DAEMON_ENTRY = fileURLToPath(new URL("../daemon/main.js", import.meta.url));

/** `child_process.spawn` options for the daemon: detached, silent, no shell, no console window. */
export const SPAWN_OPTIONS = { detached: true, stdio: "ignore", shell: false, windowsHide: true } as const;

/** The low-level spawn call this module needs — real `child_process.spawn` by default, injectable for tests. */
export type SpawnImpl = (
  command: string,
  args: readonly string[],
  options: typeof SPAWN_OPTIONS,
) => ChildProcess;

/**
 * The real spawn implementation, named so a test can assert the default binds to it by reference
 * (`assert.equal(REAL_SPAWN, spawn)`) without ever having to invoke it — invoking the default for
 * real would launch an actual daemon process against the developer's real `~/.conmuta`.
 */
export const REAL_SPAWN: SpawnImpl = spawn;

/**
 * Lazily spawns the daemon: exactly one call, with a compile-time-literal argv ({@link DAEMON_ENTRY})
 * that never incorporates caller input, then unrefs the child so it never keeps this process's event
 * loop alive. Returns the spawned pid, or `undefined` if the OS did not report one.
 *
 * Attaches a no-op `error` listener (Judgment Day finding): `ChildProcess` is an `EventEmitter`, and
 * Node's documented behavior for an unhandled `error` event is to throw and crash the whole process —
 * this process IS the long-running MCP client, so a real spawn failure (a missing entry file, an
 * AV/EDR block on process creation, `EAGAIN`/`ENFILE`) would otherwise take down the entire client
 * session instead of surfacing the already-designed `DaemonSpawnTimeoutError` path (`run-state.ts`).
 * Swallowing it here is deliberate: the caller's own bounded wait for `run/daemon.json` already turns
 * "no daemon ever came up" into that timeout regardless of the reason, including a spawn that never
 * started.
 */
export function spawnDaemon(spawnImpl: SpawnImpl = REAL_SPAWN): number | undefined {
  const child = spawnImpl(process.execPath, [DAEMON_ENTRY], SPAWN_OPTIONS);
  child.on("error", () => {
    // Intentionally swallowed — see the doc comment above.
  });
  child.unref();
  return child.pid;
}
