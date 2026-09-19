import { randomBytes } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RUN_SECRET_BYTES, POSIX_PRIVATE_FILE_MODE } from "../../shared/constants.js";
import { isProcessAlive } from "./lock.js";

/** Name of the daemon run file in runDir. */
const DAEMON_RUN_FILENAME = "daemon.json";

/**
 * Payload written to `run/daemon.json` on daemon startup.
 */
export interface DaemonRunPayload {
  port: number;
  pid: number;
  secret: string;
}

/**
 * Generates a fresh per-boot secret and writes `run/daemon.json` with `{ port, pid, secret }`.
 * Written with POSIX mode `0o600` (owner-only read/write).
 */
export function writeRunFile(runDir: string, port: number): DaemonRunPayload {
  const secret = randomBytes(RUN_SECRET_BYTES).toString("hex");
  const payload: DaemonRunPayload = {
    port,
    pid: process.pid,
    secret,
  };

  const runFilePath = join(runDir, DAEMON_RUN_FILENAME);
  writeFileSync(runFilePath, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: POSIX_PRIVATE_FILE_MODE,
  });

  return payload;
}

/**
 * Reads and parses `run/daemon.json`.
 * Returns null if the file is missing, corrupt, missing required fields, or if its recorded pid is dead.
 */
export function readRunFile(runDir: string): DaemonRunPayload | null {
  const runFilePath = join(runDir, DAEMON_RUN_FILENAME);
  try {
    const raw = readFileSync(runFilePath, "utf8");
    const data = JSON.parse(raw) as Partial<DaemonRunPayload>;

    if (
      typeof data.port !== "number" ||
      typeof data.pid !== "number" ||
      typeof data.secret !== "string"
    ) {
      return null;
    }

    if (!isProcessAlive(data.pid)) {
      return null;
    }

    return {
      port: data.port,
      pid: data.pid,
      secret: data.secret,
    };
  } catch {
    return null;
  }
}

/**
 * Deletes `run/daemon.json` only if the recorded pid matches `ownPid`.
 * Returns true if the file was deleted, false otherwise.
 */
export function deleteRunFile(runDir: string, ownPid: number = process.pid): boolean {
  const runFilePath = join(runDir, DAEMON_RUN_FILENAME);
  try {
    const raw = readFileSync(runFilePath, "utf8");
    const data = JSON.parse(raw) as Partial<DaemonRunPayload>;

    if (data.pid !== ownPid) {
      return false;
    }

    unlinkSync(runFilePath);
    return true;
  } catch {
    return false;
  }
}
