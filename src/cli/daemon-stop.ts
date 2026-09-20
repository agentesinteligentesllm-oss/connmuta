import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { resolveHomeDir } from "../daemon/home.js";
import { isProcessAlive, readLockFile, releaseLock, resolveLockPath } from "../daemon/lifecycle/lock.js";
import { deleteRunFile, readRunFile } from "../daemon/lifecycle/run-file.js";
import { IPC_NONCE_BYTES, PRODUCT_NAME } from "../shared/constants.js";

export interface StopDaemonIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

/**
 * Default timeout in milliseconds for the HTTP `/identity` challenge request.
 *
 * 5000ms is generous enough for a local daemon under event-loop load to respond
 * while bounding operator wait time when a rogue or hung port holder does not reply.
 */
export const DEFAULT_STOP_TIMEOUT_MS = 5000;

/**
 * Maximum duration in milliseconds to wait for the daemon process to exit after SIGTERM.
 *
 * 5000ms gives the daemon sufficient time to close active connections, flush pending
 * state, and cleanly shut down before the stop command reports a timeout failure.
 */
export const SHUTDOWN_WAIT_TIMEOUT_MS = 5000;

/**
 * Polling interval in milliseconds when checking if the daemon process has terminated.
 *
 * 50ms provides low-latency detection of process exit without causing excessive CPU churn.
 */
export const SHUTDOWN_POLL_INTERVAL_MS = 50;

export interface StopDaemonOptions {
  readonly homeDir?: string;
  readonly io?: StopDaemonIo;
  readonly fetch?: typeof globalThis.fetch;
  readonly kill?: (pid: number, signal: NodeJS.Signals) => void;
  readonly timeoutMs?: number;
}

export interface StopDaemonResult {
  readonly exitCode: number;
  readonly message?: string;
}

function safeCompareHex(a: string, b: string): boolean {
  if (typeof a !== "string" || !/^[0-9a-fA-F]{64}$/.test(a)) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.byteLength === bufB.byteLength && timingSafeEqual(bufA, bufB);
}

export async function stopDaemon(options?: StopDaemonOptions): Promise<StopDaemonResult> {
  const homeDir = resolveHomeDir(options?.homeDir);
  const runDir = join(homeDir, "run");
  const io = options?.io ?? {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  };

  const payload = readRunFile(runDir);
  if (payload === null) {
    io.err(`${PRODUCT_NAME}: daemon is not running`);
    return { exitCode: 1, message: "daemon is not running" };
  }

  const nonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
  const expectedProof = createHmac("sha256", payload.secret)
    .update(`identity:${nonce}`)
    .digest("hex");

  let confirmed = false;
  try {
    const fetchFn = options?.fetch ?? globalThis.fetch;
    const res = await fetchFn(`http://127.0.0.1:${payload.port}/identity?nonce=${nonce}`, {
      headers: { host: `127.0.0.1:${payload.port}` },
      signal: AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_STOP_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = (await res.json()) as { proof?: unknown; pid?: unknown };
      confirmed =
        data.pid === payload.pid &&
        typeof data.proof === "string" &&
        safeCompareHex(data.proof, expectedProof);
    }
  } catch {}

  if (!confirmed) {
    io.err(`${PRODUCT_NAME}: identity challenge failed`);
    return { exitCode: 1, message: "identity challenge failed" };
  }

  const killFn = options?.kill ?? process.kill;
  try {
    killFn(payload.pid, "SIGTERM");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ESRCH" && !(err as Error).message?.includes("ESRCH")) {
      const msg = err instanceof Error ? err.message : String(err);
      io.err(`${PRODUCT_NAME}: failed to signal daemon process: ${msg}`);
      return { exitCode: 1, message: "failed to signal daemon" };
    }
  }

  const deadline = Date.now() + SHUTDOWN_WAIT_TIMEOUT_MS;
  while (isProcessAlive(payload.pid)) {
    if (Date.now() >= deadline) {
      io.err(
        `${PRODUCT_NAME}: daemon process (pid ${payload.pid}) did not terminate within ${SHUTDOWN_WAIT_TIMEOUT_MS}ms`,
      );
      return { exitCode: 1, message: "daemon shutdown timed out" };
    }
    await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_POLL_INTERVAL_MS));
  }

  const lockPath = resolveLockPath(homeDir);
  const lock = readLockFile(lockPath);
  if (lock && lock.pid === payload.pid) releaseLock(lockPath, lock);
  deleteRunFile(runDir, payload.pid);

  io.out(`daemon stopped (pid: ${payload.pid})`);
  return { exitCode: 0, message: "daemon stopped" };
}
