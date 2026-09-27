import { join } from "node:path";

import { resolveHomeDir } from "../daemon/home.js";
import { readPanelRunFile } from "../daemon/panel/panel-run-file.js";
import { PRODUCT_NAME } from "../shared/constants.js";

export interface PanelCommandIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

export interface PanelCommandOptions {
  readonly homeDir?: string;
  readonly io?: PanelCommandIo;
}

export interface PanelCommandResult {
  readonly exitCode: number;
  readonly message?: string;
}

/**
 * Prints the panel's one-time URL (`http://127.0.0.1:<port>/?token=<token>`) read from
 * `run/panel.json`, or a clear error when the daemon (and therefore the panel listener it mounts,
 * PR-05) is not running.
 */
export function runPanelCommand(options?: PanelCommandOptions): PanelCommandResult {
  const homeDir = resolveHomeDir(options?.homeDir);
  const runDir = join(homeDir, "run");
  const io = options?.io ?? {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  };

  const payload = readPanelRunFile(runDir);
  if (payload === null) {
    io.err(`${PRODUCT_NAME}: daemon is not running`);
    return { exitCode: 1, message: "daemon is not running" };
  }

  io.out(`http://127.0.0.1:${payload.port}/?token=${payload.token}`);
  return { exitCode: 0, message: "panel URL printed" };
}
