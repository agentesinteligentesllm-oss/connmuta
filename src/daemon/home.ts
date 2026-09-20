import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { HOME_DIR_NAME, POSIX_PRIVATE_DIR_MODE } from "../shared/constants.js";

/**
 * Resolved home directory layout for the daemon.
 */
export interface HomeDirs {
  homeDir: string;
  runDir: string;
  secretsDir: string;
}

/**
 * Resolves the root home directory for the daemon.
 *
 * If `explicitHome` is provided and non-empty, it is resolved to an absolute path.
 * Otherwise defaults to `~/.conmuta` (via {@link HOME_DIR_NAME}).
 */
export function resolveHomeDir(explicitHome?: string): string {
  if (explicitHome !== undefined && explicitHome.trim().length > 0) {
    return resolve(explicitHome);
  }
  return join(homedir(), HOME_DIR_NAME);
}

/**
 * Ensures that the daemon home directory and its required subdirectories (`run` and `secrets`)
 * exist with POSIX private directory permissions (`0o700`).
 */
export function ensureHomeDirs(homeDir: string): HomeDirs {
  const runDir = join(homeDir, "run");
  const secretsDir = join(homeDir, "secrets");

  mkdirSync(homeDir, { recursive: true, mode: POSIX_PRIVATE_DIR_MODE });
  mkdirSync(runDir, { recursive: true, mode: POSIX_PRIVATE_DIR_MODE });
  mkdirSync(secretsDir, { recursive: true, mode: POSIX_PRIVATE_DIR_MODE });

  return { homeDir, runDir, secretsDir };
}
