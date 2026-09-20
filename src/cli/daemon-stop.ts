import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { resolveHomeDir } from "../daemon/home.js";
import { readLockFile, releaseLock, resolveLockPath } from "../daemon/lifecycle/lock.js";
import { deleteRunFile, readRunFile } from "../daemon/lifecycle/run-file.js";
import { IPC_NONCE_BYTES, PRODUCT_NAME } from "../shared/constants.js";

export interface StopDaemonIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

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
      signal: AbortSignal.timeout(options?.timeoutMs ?? 5000),
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

  try {
    (options?.kill ?? process.kill)(payload.pid, "SIGTERM");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ESRCH" && !(err as Error).message.includes("ESRCH")) throw err;
  }

  const lockPath = resolveLockPath(homeDir);
  const lock = readLockFile(lockPath);
  if (lock && lock.pid === payload.pid) releaseLock(lockPath, lock);
  deleteRunFile(runDir, payload.pid);

  io.out(`daemon stopped (pid: ${payload.pid})`);
  return { exitCode: 0, message: "daemon stopped" };
}
