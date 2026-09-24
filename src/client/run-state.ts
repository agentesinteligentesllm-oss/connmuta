import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  watch,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  HOME_DIR_NAME,
  POSIX_PRIVATE_DIR_MODE,
  POSIX_PRIVATE_FILE_MODE,
  SPAWN_LOCK_STALE_SECONDS,
  SPAWN_WAIT_SECONDS,
} from "../shared/constants.js";
import { spawnDaemon } from "./spawn.js";

/**
 * Client-side spawn election over `run/spawn.lock` (D-16), and the client's own read of the daemon's
 * run file (`run/daemon.json`).
 *
 * Disclosed apply-time decision: `src/client/tsconfig.json`'s `references` is `[{"path":"../shared"}]`
 * only — there is no TypeScript project-reference path from `client/*` to `src/daemon/*`, so importing
 * the daemon's own `lifecycle/lock.ts`, `lifecycle/run-file.ts` or `home.ts` is a `tsc -b` build error,
 * not a style choice. This module therefore locally reimplements the pieces of those three daemon
 * modules the client needs: the `wx`-create-in-one-call election with stale-age check and
 * reclaim-once semantics, the dead-pid-invalidates run-file read, and the `~/.conmuta` + `run/` path
 * resolution — scoped to `run/spawn.lock` and keyed by {@link SPAWN_LOCK_STALE_SECONDS} instead of the
 * daemon's own `DAEMON_LOCK_STALE_SECONDS`. A client MUST NEVER touch `run/daemon.lock` — the daemon's
 * own singleton lock — only `run/spawn.lock`.
 */

/** Name of the client's own spawn-election lock file, distinct from the daemon's `daemon.lock`. */
const SPAWN_LOCK_FILENAME = "spawn.lock";

/** Name of the daemon's run file, as written by `daemon/lifecycle/run-file.ts`'s `writeRunFile`. */
const DAEMON_RUN_FILENAME = "daemon.json";

/** `{port, pid, secret}` as the daemon's run file carries it (mirrors `daemon/lifecycle/run-file.ts`). */
export interface DaemonRunPayload {
  port: number;
  pid: number;
  secret: string;
}

/** The spawn-lock's lease identity. No `heartbeat_at`: this is a short election, not a held singleton. */
export interface SpawnLockPayload {
  pid: number;
  acquired_at: number;
}

/** Thrown by {@link acquireSpawnLock} when `run/spawn.lock` is held by another live, non-stale process. */
export class SpawnLockHeldError extends Error {
  readonly pid?: number;
  readonly acquired_at?: number;

  constructor(message?: string, payload?: SpawnLockPayload | null) {
    super(message ?? `run/spawn.lock is held by another process${payload?.pid ? ` (pid: ${payload.pid})` : ""}`);
    this.name = "SpawnLockHeldError";
    this.pid = payload?.pid;
    this.acquired_at = payload?.acquired_at;
  }
}

/** Thrown by {@link ensureDaemonRunning} when the run-file wait exceeds its bound with no live daemon. */
export class DaemonSpawnTimeoutError extends Error {
  constructor(message = "Timed out waiting for the daemon to report a live run/daemon.json") {
    super(message);
    this.name = "DaemonSpawnTimeoutError";
  }
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

/** Ensures `<homeDir>/run` exists (private mode) and returns its path. */
function ensureRunDir(homeDir: string): string {
  const runDir = join(homeDir, "run");
  if (!existsSync(runDir)) {
    mkdirSync(runDir, { recursive: true, mode: POSIX_PRIVATE_DIR_MODE });
  }
  return runDir;
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

function spawnLockPath(runDir: string): string {
  return join(runDir, SPAWN_LOCK_FILENAME);
}

// Single writeFileSync call with flag "wx" — see `daemon/lifecycle/lock.ts`'s `writeLockFile` doc for
// why this must not be split into an open-then-write pair (it would leave a window where the file
// exists but is empty, and a healthy lock a millisecond old would read as Infinity seconds old).
function writeSpawnLockFile(lockPath: string): SpawnLockPayload {
  const payload: SpawnLockPayload = { pid: process.pid, acquired_at: Date.now() };
  writeFileSync(lockPath, JSON.stringify(payload), { flag: "wx", mode: POSIX_PRIVATE_FILE_MODE });
  return payload;
}

function readSpawnLockFile(lockPath: string): SpawnLockPayload | null {
  try {
    return JSON.parse(readFileSync(lockPath, "utf8")) as SpawnLockPayload;
  } catch {
    return null;
  }
}

/** Age of the spawn lock in seconds, from `acquired_at` or, failing that, the file's own mtime. */
export function spawnLockAgeSeconds(
  lockPath: string,
  payload: SpawnLockPayload | null,
  now: number = Date.now(),
): number {
  if (payload !== null && typeof payload.acquired_at === "number" && Number.isFinite(payload.acquired_at)) {
    return Math.max(0, (now - payload.acquired_at) / 1000);
  }
  try {
    return Math.max(0, (now - statSync(lockPath).mtimeMs) / 1000);
  } catch {
    // The lock vanished between the failed read and this stat — treat it as free.
    return Infinity;
  }
}

/**
 * Releases `run/spawn.lock` ONLY if this caller still owns it (matches `daemon/lifecycle/lock.ts`'s
 * `releaseLock`).
 */
export function releaseSpawnLock(lockPath: string, own: SpawnLockPayload): void {
  try {
    const current = readSpawnLockFile(lockPath);
    if (current === null || current.pid !== own.pid || current.acquired_at !== own.acquired_at) {
      return;
    }
    unlinkSync(lockPath);
  } catch {
    // Already released, or unreadable — either way there is nothing safe left to do.
  }
}

/**
 * Acquires `run/spawn.lock` under `runDir` (an already-existing directory — {@link ensureDaemonRunning}
 * ensures it via {@link ensureRunDir} first). Throws {@link SpawnLockHeldError} when a live, non-stale
 * holder already has it. A lock older than `staleSeconds` (default {@link SPAWN_LOCK_STALE_SECONDS})
 * is reclaimed instead — the same algorithm as `daemon/lifecycle/lock.ts`'s `acquireLock`, scoped to
 * `spawn.lock` and with no heartbeat (a short election, not a held singleton).
 */
export function acquireSpawnLock(
  runDir: string,
  staleSeconds: number = SPAWN_LOCK_STALE_SECONDS,
): { release: () => void; payload: SpawnLockPayload } {
  const lockPath = spawnLockPath(runDir);

  try {
    const own = writeSpawnLockFile(lockPath);
    return { release: () => releaseSpawnLock(lockPath, own), payload: own };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }

  const existing = readSpawnLockFile(lockPath);
  const holderIsGone = existing !== null && !isProcessAlive(existing.pid);
  const age = spawnLockAgeSeconds(lockPath, existing);
  if (!holderIsGone && age < staleSeconds) {
    throw new SpawnLockHeldError(
      `run/spawn.lock is held by a live process (pid ${existing?.pid ?? "unknown"}, age ${age.toFixed(1)}s)`,
      existing,
    );
  }

  // Stale lock: reclaim it. `unlinkSync` may lose a race with another reclaimer that got there first,
  // which is harmless — the exclusive create below is the real arbiter, and whoever loses it sees
  // EEXIST and throws SpawnLockHeldError rather than proceeding alongside the winner.
  try {
    unlinkSync(lockPath);
  } catch {
    // Someone else removed it already.
  }

  try {
    const own = writeSpawnLockFile(lockPath);
    return { release: () => releaseSpawnLock(lockPath, own), payload: own };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      const current = readSpawnLockFile(lockPath);
      throw new SpawnLockHeldError("run/spawn.lock was claimed by another process during reclaim", current);
    }
    throw err;
  }
}

/**
 * Waits for `run/daemon.json` to parse with a live pid: `fs.watch` on `runDir` plus
 * `AbortSignal.timeout(waitMs)` (design §11 "Spawn wait" row — the same timer-free primitive v1 uses
 * for HTTP, `v1:src/telegram.ts:388-392`). Re-reads the run file on every directory event — and once
 * synchronously right after the watcher is registered, so a write that landed between the caller's
 * earlier read and this registration is never missed — until it parses with a live pid, or rejects
 * with {@link DaemonSpawnTimeoutError} once `waitMs` elapses. The watcher and the abort listener are
 * cleaned up on every exit path.
 *
 * `runDir` is resolved with `realpathSync.native` before watching it. `os.tmpdir()` (and therefore
 * every `mkdtempSync`-based test fixture) can return an 8.3 short path on Windows (e.g.
 * `C:\Users\LABORA~1\...`); watching a directory by its short-path form crashes the process natively
 * the moment a change event needs to be reported for it (`Assertion failed: !_wcsnicmp(filename, dir,
 * dirlen)`, libuv `src/win/fs-event.c`) — hit directly by this module's own tests. The plain
 * (non-native) `realpathSync` does not perform this short-to-long conversion; `.native` does.
 */
function waitForRunFile(runDir: string, waitMs: number): Promise<DaemonRunPayload> {
  return new Promise<DaemonRunPayload>((resolve, reject) => {
    const signal = AbortSignal.timeout(waitMs);
    const watcher = watch(realpathSync.native(runDir));

    const cleanup = (): void => {
      signal.removeEventListener("abort", onAbort);
      watcher.off("change", onCheck);
      watcher.off("error", onError);
      watcher.close();
    };
    const onAbort = (): void => {
      cleanup();
      reject(new DaemonSpawnTimeoutError());
    };
    const onError = (err: unknown): void => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const onCheck = (): void => {
      const payload = readRunFile(runDir);
      if (payload !== null) {
        cleanup();
        resolve(payload);
      }
    };

    signal.addEventListener("abort", onAbort, { once: true });
    watcher.on("change", onCheck);
    watcher.on("error", onError);
    // Re-check synchronously right after the watcher is registered, so a write that landed between
    // the caller's earlier read and this registration is not missed (mirrors
    // `daemon/serve/fetch.ts`'s `waitForRows` comment on the same hazard).
    onCheck();
  });
}

/** What {@link ensureDaemonRunning} needs beyond the constants it already imports. */
export interface EnsureDaemonRunningOptions {
  /** Defaults to `~/.conmuta` via {@link resolveClientHomeDir}. */
  readonly homeDir?: string;
  /** Defaults to the real {@link spawnDaemon}; tests inject a fake so no real process is launched. */
  readonly spawnDaemonImpl?: () => number | undefined;
  /** Milliseconds to wait for the run file to go live. Defaults to `SPAWN_WAIT_SECONDS * 1000`. */
  readonly waitMs?: number;
}

/**
 * Ensures a daemon is reachable, spawning one if needed, and resolves with `{port, pid, secret}`.
 *
 * 1. Reads `run/daemon.json` first; a parsed payload with a live pid resolves immediately — no lock,
 *    no spawn.
 * 2. Otherwise races for `run/spawn.lock`. The winner calls the injected spawn implementation exactly
 *    once, then waits for the run file; a loser (an immediate {@link SpawnLockHeldError}) skips
 *    straight to the same wait with no spawn call.
 * 3. The winner releases `run/spawn.lock` only AFTER the wait resolves or times out — releasing
 *    earlier would let a client arriving mid-boot spawn a second daemon, which is exactly why
 *    {@link SPAWN_LOCK_STALE_SECONDS} outlasts the whole spawn-and-boot wait (spec
 *    `daemon-lifecycle › Client-side spawn election uses a separate stale window`).
 *
 * Never touches `run/daemon.lock` — the daemon's own singleton lock.
 */
export async function ensureDaemonRunning(options: EnsureDaemonRunningOptions = {}): Promise<DaemonRunPayload> {
  const homeDir = resolveClientHomeDir(options.homeDir);
  const runDir = ensureRunDir(homeDir);
  const spawnDaemonImpl = options.spawnDaemonImpl ?? spawnDaemon;
  const waitMs = options.waitMs ?? SPAWN_WAIT_SECONDS * 1000;

  const existing = readRunFile(runDir);
  if (existing !== null) {
    return existing;
  }

  let handle: { release: () => void; payload: SpawnLockPayload } | undefined;
  try {
    handle = acquireSpawnLock(runDir);
  } catch (err) {
    if (!(err instanceof SpawnLockHeldError)) {
      throw err;
    }
  }

  try {
    if (handle !== undefined) {
      // Re-check: between the read above and winning the lock, another process's spawn may have
      // already landed (real cross-process races only — impossible to observe within one process,
      // since readRunFile/acquireSpawnLock are synchronous with no await between them). Skipping a
      // redundant spawnDaemonImpl() call here is strictly safe either way: run/daemon.lock is the
      // actual singleton backstop, so a redundant spawn would self-terminate, not corrupt state —
      // this just keeps the call count matching the spec's "calls spawnDaemon() exactly once".
      const recheck = readRunFile(runDir);
      if (recheck !== null) {
        return recheck;
      }
      spawnDaemonImpl();
    }
    return await waitForRunFile(runDir, waitMs);
  } finally {
    handle?.release();
  }
}
