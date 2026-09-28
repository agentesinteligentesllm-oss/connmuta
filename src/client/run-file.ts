import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { HOME_DIR_NAME } from "../shared/constants.js";

/**
 * The client's read-only view of the daemon's run file (`run/daemon.json`), split out of
 * `client/run-state.ts` as a move-only refactor (F4 design D6). This module deliberately has NO spawn
 * capability: it must never import Node's process-spawning module, `./spawn.js` or `./run-state.js`, directly or
 * transitively, so a consumer that only needs to read the run file (the channel adapter) does not pull
 * the daemon-spawning closure into its bundle. `client/run-state.ts` re-exports every name below, so
 * existing import paths keep working. See `client/run-state.ts`'s module doc for why these are
 * reimplemented locally instead of imported from `src/daemon/*`.
 */

/** Name of the daemon's run file, as written by `daemon/lifecycle/run-file.ts`'s `writeRunFile`. */
const DAEMON_RUN_FILENAME = "daemon.json";

/** `{port, pid, secret}` as the daemon's run file carries it (mirrors `daemon/lifecycle/run-file.ts`). */
export interface DaemonRunPayload {
  port: number;
  pid: number;
  secret: string;
}

/**
 * Resolves the daemon's home directory the same way `daemon/home.ts`'s `resolveHomeDir` does
 * (reimplemented locally — see the module doc).
 */
export function resolveClientHomeDir(explicitHome?: string): string {
  if (explicitHome !== undefined && explicitHome.trim().length > 0) {
    return resolve(explicitHome);
  }
  return join(homedir(), HOME_DIR_NAME);
}

/**
 * Whether `pid` is still running (reimplemented locally from `daemon/lifecycle/lock.ts`'s
 * `isProcessAlive` — see the module doc). Fails CLOSED: an unreadable signal reads as alive, so this
 * can only ever make a reclaim or an invalidation happen faster, never make one happen wrongly.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/**
 * Reads and parses `run/daemon.json` (reimplemented locally from `daemon/lifecycle/run-file.ts`'s
 * `readRunFile` — see the module doc). Returns `null` when the file is missing, corrupt, missing a
 * required field, or names a pid that is no longer alive.
 */
export function readRunFile(runDir: string): DaemonRunPayload | null {
  const runFilePath = join(runDir, DAEMON_RUN_FILENAME);
  try {
    const raw = readFileSync(runFilePath, "utf8");
    const data = JSON.parse(raw) as Partial<DaemonRunPayload>;

    if (typeof data.port !== "number" || typeof data.pid !== "number" || typeof data.secret !== "string") {
      return null;
    }
    if (!isProcessAlive(data.pid)) {
      return null;
    }
    return { port: data.port, pid: data.pid, secret: data.secret };
  } catch {
    return null;
  }
}
