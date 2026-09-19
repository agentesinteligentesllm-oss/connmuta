import { NODE_FLOOR, EXIT_NODE_FLOOR } from "../shared/constants.js";

/**
 * Node-floor gate options for testing and dependency injection.
 */
export interface NodeFloorOptions {
  version?: string;
  stderr?: (message: string) => void;
  exit?: (code: number) => never | void;
}

/**
 * Parses a semantic version string (e.g. "v24.15.0" or "24.15.0") into [major, minor, patch].
 * Returns null if the string is not a valid semver.
 */
export function parseSemver(version: string): [number, number, number] | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/**
 * Checks whether `version` satisfies `>= floor` (defaulting floor to {@link NODE_FLOOR}).
 */
export function isNodeAtOrAboveFloor(version: string, floor: string = NODE_FLOOR): boolean {
  const v = parseSemver(version);
  const f = parseSemver(floor);
  if (!v || !f) return false;
  if (v[0] !== f[0]) return v[0] > f[0];
  if (v[1] !== f[1]) return v[1] > f[1];
  return v[2] >= f[2];
}

/**
 * Node-floor gate (D-25, ADR-0030).
 *
 * Verifies that the running Node.js version is at or above {@link NODE_FLOOR}.
 * On failure, writes an explicit error message with a download link to stderr and exits
 * with code {@link EXIT_NODE_FLOOR} before any filesystem write or further initialization.
 */
export function enforceNodeFloor(options?: NodeFloorOptions): void {
  const version = options?.version ?? process.version;
  if (!isNodeAtOrAboveFloor(version, NODE_FLOOR)) {
    const writeErr = options?.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));
    const doExit = options?.exit ?? ((code: number) => process.exit(code));
    writeErr(
      `Node.js ${NODE_FLOOR} or higher is required (found ${version}). Please download and install a supported version from https://nodejs.org/`,
    );
    doExit(EXIT_NODE_FLOOR);
  }
}
