/**
 * Provenance: telegram-agent-bus src/state.ts @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 062c9c7fdf9e28dc5a0342371dc0155b91a78ee9d4999e2a537f59d5dc0d76eb. Changes: (1) extracted lines 458-602; (2) added heartbeat_at to LockPayload and lockAgeSeconds; (3) renamed BridgeBusyError to LockHeldError; (4) imports relocated.
 */

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DAEMON_LOCK_STALE_SECONDS } from "../../shared/constants.js";

/** Name of the daemon lock file. */
const DAEMON_LOCK_FILENAME = "daemon.lock";

/**
 * The lease identity. `pid` alone is NOT sufficient to prove ownership — pids are recycled by the
 * OS, so a later process can legitimately hold the same one. `acquired_at` is already written for
 * staleness, so pairing them costs nothing and makes the identity unique in practice (ADR-12).
 * `heartbeat_at` is updated periodically by a live holder to extend the lease.
 */
export interface LockPayload {
  pid: number;
  acquired_at: number;
  heartbeat_at?: number;
}

/**
 * Thrown when attempting to acquire a lock that is already held by a live, non-stale process.
 * Replaces v1's BridgeBusyError.
 */
export class LockHeldError extends Error {
  readonly pid?: number;
  readonly acquired_at?: number;
  readonly heartbeat_at?: number;

  constructor(message?: string, payload?: LockPayload | null) {
    super(message ?? `Lock is held by another process${payload?.pid ? ` (pid: ${payload.pid})` : ""}`);
    this.name = "LockHeldError";
    this.pid = payload?.pid;
    this.acquired_at = payload?.acquired_at;
    this.heartbeat_at = payload?.heartbeat_at;
  }
}

/**
 * Resolves the lock file path.
 * If `dirOrPath` ends with `.lock`, it is treated as the direct lock path.
 * If its basename is `run`, `daemon.lock` is placed directly within it.
 * Otherwise, it targets `run/daemon.lock` inside the directory, ensuring `run/` exists.
 */
export function resolveLockPath(dirOrPath: string): string {
  if (dirOrPath.endsWith(".lock")) {
    const parent = dirname(dirOrPath);
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true });
    }
    return dirOrPath;
  }

  const runDir = basename(dirOrPath) === "run" ? dirOrPath : join(dirOrPath, "run");
  if (!existsSync(runDir)) {
    mkdirSync(runDir, { recursive: true });
  }
  return join(runDir, DAEMON_LOCK_FILENAME);
}

/**
 * Creates the lock in ONE call rather than `openSync("wx")` followed by a separate write.
 *
 * The two-call form left a window in which the file existed but was empty; `readLockFile` returns
 * `null` for unparseable JSON, and `acquireLock` scored `null` as `Infinity` seconds old, so a
 * healthy lock a millisecond into its life was reclaimed as abandoned. `flag: "wx"` keeps the
 * exclusive-create semantics (EEXIST when another holder has it) with no gap to interrupt.
 */
export function writeLockFile(lockPath: string): LockPayload {
  const payload: LockPayload = { pid: process.pid, acquired_at: Date.now() };
  writeFileSync(lockPath, JSON.stringify(payload), { flag: "wx" });
  return payload;
}

export function readLockFile(lockPath: string): LockPayload | null {
  try {
    return JSON.parse(readFileSync(lockPath, "utf8")) as LockPayload;
  } catch {
    return null;
  }
}

/**
 * Whether the process that wrote the lock is still running (ADR-12).
 *
 * `pid` was recorded from the first release and never consulted, so a session killed mid-call — a
 * Ctrl+C, a window reload, a crash — left the bridge answering `BRIDGE_BUSY` for up to two minutes
 * with no live holder anywhere. That is the most common way a developer meets this code and the
 * least explicable.
 *
 * Signal `0` performs the permission and existence check without delivering anything. Fails CLOSED:
 * `EPERM` means the pid exists but belongs to another user, and anything unexpected is treated as
 * alive too, so this can only ever make reclaiming a DEAD holder's lock faster — never make
 * reclaiming a live one possible. A recycled pid reads as alive and simply falls back to the stale
 * timer, exactly as before.
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
 * Age of the lock in seconds.
 *
 * Uses `heartbeat_at` if present and finite, else `acquired_at` if finite.
 * When the payload is unreadable — a torn or truncated write from an older build, or a file
 * someone else corrupted — the filesystem's own mtime answers the question the payload cannot.
 * mtime is the only reading that is both available and honest.
 */
export function lockAgeSeconds(
  lockPath: string,
  payload: LockPayload | null,
  now: number = Date.now(),
): number {
  if (payload !== null) {
    if (typeof payload.heartbeat_at === "number" && Number.isFinite(payload.heartbeat_at)) {
      return Math.max(0, (now - payload.heartbeat_at) / 1000);
    }
    if (typeof payload.acquired_at === "number" && Number.isFinite(payload.acquired_at)) {
      return Math.max(0, (now - payload.acquired_at) / 1000);
    }
  }
  try {
    return Math.max(0, (now - statSync(lockPath).mtimeMs) / 1000);
  } catch {
    // The lock vanished between the failed read and this stat — treat it as free.
    return Infinity;
  }
}

/**
 * Acquires the exclusive daemon lock under `homeDir` (arbitrated by `run/daemon.lock`).
 * Throws {@link LockHeldError} if a live (non-stale) lock already exists.
 * A lock older than `staleSeconds` (default {@link DAEMON_LOCK_STALE_SECONDS}) is
 * treated as abandoned and reclaimed instead. Returns a release function, an updateHeartbeat function,
 * and the acquired payload.
 */
export function acquireLock(
  homeDir: string,
  staleSeconds: number = DAEMON_LOCK_STALE_SECONDS,
): { release: () => void; updateHeartbeat: () => void; payload: LockPayload } {
  const lockPath = resolveLockPath(homeDir);

  try {
    const own = writeLockFile(lockPath);
    return {
      release: () => releaseLock(lockPath, own),
      updateHeartbeat: () => updateHeartbeat(lockPath, own),
      payload: own,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }

  const existing = readLockFile(lockPath);
  const holderIsGone = existing !== null && !isProcessAlive(existing.pid);
  const age = lockAgeSeconds(lockPath, existing);
  if (!holderIsGone && age < staleSeconds) {
    throw new LockHeldError(
      `Lock at ${lockPath} is held by a live process (pid ${existing?.pid ?? "unknown"}, age ${age.toFixed(1)}s)`,
      existing,
    );
  }

  // Stale lock: reclaim it. `unlinkSync` may lose a race with another reclaimer that got there
  // first, which is harmless — the exclusive create below is the real arbiter, and whoever loses it
  // sees EEXIST and throws LockHeldError rather than proceeding alongside the winner.
  try {
    unlinkSync(lockPath);
  } catch {
    // Someone else removed it already.
  }

  try {
    const own = writeLockFile(lockPath);
    return {
      release: () => releaseLock(lockPath, own),
      updateHeartbeat: () => updateHeartbeat(lockPath, own),
      payload: own,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      const current = readLockFile(lockPath);
      throw new LockHeldError(
        `Lock at ${lockPath} was claimed by another process during reclaim`,
        current,
      );
    }
    throw err;
  }
}

/**
 * Updates the heartbeat timestamp of the lock file if and only if this process still owns it.
 */
export function updateHeartbeat(lockPath: string, own: LockPayload): void {
  try {
    const current = readLockFile(lockPath);
    if (current === null || current.pid !== own.pid || current.acquired_at !== own.acquired_at) {
      return;
    }
    own.heartbeat_at = Date.now();
    writeFileSync(lockPath, JSON.stringify(own), "utf8");
  } catch {
    // Write failed or file removed — safe to ignore.
  }
}

/**
 * Releases the lease ONLY if this holder still owns it (ADR-12).
 */
export function releaseLock(lockPath: string, own: LockPayload): void {
  try {
    const current = readLockFile(lockPath);
    if (current === null || current.pid !== own.pid || current.acquired_at !== own.acquired_at) {
      return;
    }
    unlinkSync(lockPath);
  } catch {
    // Already released, or unreadable — either way there is nothing safe left to do.
  }
}
