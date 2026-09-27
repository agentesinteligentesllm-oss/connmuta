/**
 * `run/panel.json` — the panel listener's discovery sibling (design's "Panel discovery via a sibling
 * run file" decision, F3 PR-03), mirroring `lifecycle/run-file.ts`'s `{port, pid, secret}` shape
 * exactly with `token` in place of `secret`. Kept as its own file rather than folded into
 * `run/daemon.json`: the two files are independent trust domains with independent lifetimes, and any
 * reader of `daemon.json` for the MCP handshake would otherwise incidentally see the panel token.
 *
 * Unlike `writeRunFile`, this module never generates the token itself — `PanelTokenStore` (PR-03,
 * same unit) owns generation; this module only persists whatever token its caller (`bootstrap.ts`,
 * PR-05) already minted, so there is exactly one place a panel token is ever created.
 */

import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { POSIX_PRIVATE_FILE_MODE } from "../../shared/constants.js";
import { isProcessAlive } from "../lifecycle/lock.js";

/** Name of the panel run file in runDir. */
const PANEL_RUN_FILENAME = "panel.json";

/**
 * Payload written to `run/panel.json` on panel listener startup.
 */
export interface PanelRunPayload {
  port: number;
  pid: number;
  token: string;
}

/**
 * Writes `run/panel.json` with `{ port, pid, token }`. Written with POSIX mode `0o600`
 * (owner-only read/write), mirroring `writeRunFile`.
 */
export function writePanelRunFile(runDir: string, port: number, token: string): PanelRunPayload {
  const payload: PanelRunPayload = { port, pid: process.pid, token };

  const runFilePath = join(runDir, PANEL_RUN_FILENAME);
  writeFileSync(runFilePath, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: POSIX_PRIVATE_FILE_MODE,
  });

  return payload;
}

/**
 * Reads and parses `run/panel.json`.
 * Returns null if the file is missing, corrupt, missing required fields, or if its recorded pid is dead.
 */
export function readPanelRunFile(runDir: string): PanelRunPayload | null {
  const runFilePath = join(runDir, PANEL_RUN_FILENAME);
  try {
    const raw = readFileSync(runFilePath, "utf8");
    const data = JSON.parse(raw) as Partial<PanelRunPayload>;

    if (
      typeof data.port !== "number" ||
      typeof data.pid !== "number" ||
      typeof data.token !== "string"
    ) {
      return null;
    }

    if (!isProcessAlive(data.pid)) {
      return null;
    }

    return {
      port: data.port,
      pid: data.pid,
      token: data.token,
    };
  } catch {
    return null;
  }
}

/**
 * Deletes `run/panel.json` only if the recorded pid matches `ownPid`.
 * Returns true if the file was deleted, false otherwise.
 */
export function deletePanelRunFile(runDir: string, ownPid: number = process.pid): boolean {
  const runFilePath = join(runDir, PANEL_RUN_FILENAME);
  try {
    const raw = readFileSync(runFilePath, "utf8");
    const data = JSON.parse(raw) as Partial<PanelRunPayload>;

    if (data.pid !== ownPid) {
      return false;
    }

    unlinkSync(runFilePath);
    return true;
  } catch {
    return false;
  }
}
