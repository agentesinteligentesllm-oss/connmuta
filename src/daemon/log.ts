import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DAEMON_LOG_MAX_BYTES, POSIX_PRIVATE_FILE_MODE } from "../shared/constants.js";
import { redactTokenShapes } from "../secret-store/redaction.js";

/** Name of the daemon log file in runDir. */
const DAEMON_LOG_FILENAME = "daemon.log";

/**
 * Appends a message to `run/daemon.log` after redacting any token shapes.
 *
 * If the log file exceeds `maxBytes` (defaulting to {@link DAEMON_LOG_MAX_BYTES}),
 * it is truncated to roughly the last half of the file, aligned to a newline boundary,
 * keeping the log bounded without rotation complexity.
 */
export function writeDaemonLog(
  runDir: string,
  message: string,
  maxBytes: number = DAEMON_LOG_MAX_BYTES,
): void {
  const logPath = join(runDir, DAEMON_LOG_FILENAME);
  const redacted = redactTokenShapes(message);
  const line = redacted.endsWith("\n") ? redacted : redacted + "\n";

  appendFileSync(logPath, line, { encoding: "utf8", mode: POSIX_PRIVATE_FILE_MODE });

  try {
    const stat = statSync(logPath);
    if (stat.size > maxBytes) {
      truncateLogFile(logPath, maxBytes);
    }
  } catch {
    // If stat or truncation fails, allow execution to continue.
  }
}

/**
 * Truncates `logPath` to keep roughly the last half of `maxBytes`.
 */
function truncateLogFile(logPath: string, maxBytes: number): void {
  const buf = readFileSync(logPath);
  if (buf.length <= maxBytes) {
    return;
  }

  const targetKeep = Math.floor(maxBytes / 2);
  const startOffset = buf.length - targetKeep;

  // Find the first newline after startOffset to avoid leaving a torn log line
  let sliceStart = startOffset;
  for (let i = startOffset; i < buf.length; i++) {
    if (buf[i] === 0x0a /* '\n' */) {
      sliceStart = i + 1;
      break;
    }
  }

  const retained = buf.subarray(sliceStart);
  writeFileSync(logPath, retained, { mode: POSIX_PRIVATE_FILE_MODE });
}
