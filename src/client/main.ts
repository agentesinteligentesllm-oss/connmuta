import { hostname } from "node:os";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { EXIT_NODE_FLOOR, EXIT_USAGE, NODE_FLOOR } from "../shared/constants.js";
import { computeRosterHash } from "../shared/roster-hash.js";
import { resolveProjectBinding, type BindingRefusal } from "./binding.js";
import { createIpcSession } from "./ipc-stub.js";
import { createServer } from "./server.js";

/**
 * The thin MCP client's process-entry building block (design §11 "Startup"/"Handshake timing" rows;
 * spec `thin-client-tools` › launcher-refusal requirements). `src/cli/main.ts` owns the real process
 * entry point and all argv parsing for the `mcp` subcommand; this module exports one testable async
 * function, {@link runMcpClient}, that runs the startup sequence below and returns an exit code —
 * unlike `src/daemon/main.ts`, this file is never a top-level side-effecting script.
 *
 * **Reading of design.md:43's "gate then dynamic import" language.** That describes the OUTER dynamic
 * import `cli/main.ts` performs when it dispatches the `mcp` subcommand
 * (`await import("../client/main.js")`), not a second, inner dynamic import inside this file. Every
 * collaborator this module needs is a static top-of-file import; deliberate, not an oversight.
 *
 * **Why the Node-floor check is reimplemented locally instead of importing `daemon/node-floor.ts`.**
 * `src/client/tsconfig.json`'s `references` is `[{"path":"../shared"}]` only, so an import from
 * `../daemon/*` is a `tsc -b` compile error — the same disclosed, deliberate client/daemon dependency
 * boundary `client/run-state.ts` and `client/handshake.ts` already document for the same reason. This
 * file duplicates only the small, pure semver-floor comparison it needs (mirroring
 * `daemon/node-floor.ts`'s `parseSemver`/`isNodeAtOrAboveFloor`), not the full
 * `NodeFloorOptions`/`enforceNodeFloor` ceremony — that helper also calls `process.exit`, which would
 * be wrong here: this function only ever returns an exit code, it never exits the process itself.
 *
 * **No `Provenance:` header.** `v1:src/index.ts:250-292 main` is verdict REPLACED (design.md:471), and
 * REPLACED code carries no Provenance/SHA header — only AS-IS and SEAM rows do.
 * `test/security/provenance.test.ts` treats any such header line as an opt-in claim that must be
 * bidirectionally registered in `test/fixtures/v1-provenance.json`, so this file stays invisible to it.
 */

export interface RunMcpClientOptions {
  readonly project: string | undefined;
  /** Defaults to `process.cwd()`, forwarded to {@link resolveProjectBinding}. */
  readonly cwd?: string;
  /** Defaults to `process.stderr.write(line + "\n")`. */
  readonly stderr?: (line: string) => void;
  /** Defaults to `process.version`; injection point for the node-floor test. */
  readonly nodeVersion?: string;
  /** Defaults to `new StdioServerTransport()`. */
  readonly transport?: Transport;
  readonly resolveProjectBindingImpl?: typeof resolveProjectBinding;
  readonly createIpcSessionImpl?: typeof createIpcSession;
  readonly createServerImpl?: typeof createServer;
}

/**
 * Parses a semver-ish string into its three numeric components, or `undefined` if unparseable.
 * Mirrors `daemon/node-floor.ts`'s `parseSemver` — duplicated locally, see the module doc.
 */
function parseSemver(version: string): [number, number, number] | undefined {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Whether `version` is at or above {@link NODE_FLOOR}. Mirrors `daemon/node-floor.ts`'s `isNodeAtOrAboveFloor`. */
function isNodeAtOrAboveFloor(version: string): boolean {
  const v = parseSemver(version);
  const f = parseSemver(NODE_FLOOR);
  if (!v || !f) {
    return false;
  }
  if (v[0] !== f[0]) return v[0] > f[0];
  if (v[1] !== f[1]) return v[1] > f[1];
  return v[2] >= f[2];
}

/**
 * One plain, value-safe stderr line for a binding refusal. `path`/`searchedFrom`/`foundProjectId`/
 * `expectedProjectId` are filesystem/identifier data, not document content, so echoing them does not
 * violate the "never echo forbidden content" rule — that rule is about `ProjectFileProblem`
 * (`../shared/project-file.js`), which is value-free by construction: for `invalid_project_file` this
 * only reports the problem count, never stringifying a `ProjectFileProblem` itself.
 */
function refusalMessage(refusal: BindingRefusal): string {
  switch (refusal.kind) {
    case "missing_project_flag":
      return "conmuta mcp: --project is required";
    case "no_project_file_found":
      return `conmuta mcp: no conmuta.json found above ${refusal.searchedFrom}`;
    case "invalid_project_file":
      return `conmuta mcp: ${refusal.path} is not a valid project file (${refusal.problems.length} problem(s))`;
    case "unreadable_project_file":
      return `conmuta mcp: ${refusal.path} could not be read`;
    case "project_id_mismatch":
      return `conmuta mcp: ${refusal.path} is bound to '${refusal.foundProjectId}', expected '${refusal.expectedProjectId}'`;
  }
}

/**
 * Runs the thin MCP client's startup sequence and returns the process exit code. Never calls
 * `process.exit` — `src/cli/main.ts`'s entry point sets `process.exitCode` from the returned number,
 * matching its existing convention for `validate`/`daemon stop`.
 *
 * Order (design §11 "Startup"/"Handshake timing"): the Node-floor gate first, then `--project`
 * presence, then the synchronous project-binding walk-up, then exactly one `IpcSession` construction,
 * then the MCP server construction, then `server.connect(transport)`. Every step before the final
 * connect makes zero network calls and zero daemon-spawn calls: `createIpcSession` is proven lazy
 * (its handshake runs only on the first `callTool`, cached for the session), so nothing here adds an
 * extra `await` on the session that would defeat that laziness.
 */
export async function runMcpClient(options: RunMcpClientOptions): Promise<number> {
  const writeErr = options.stderr ?? ((line: string) => { process.stderr.write(`${line}\n`); });

  const nodeVersion = options.nodeVersion ?? process.version;
  if (!isNodeAtOrAboveFloor(nodeVersion)) {
    writeErr(
      `Node.js ${NODE_FLOOR} or higher is required (found ${nodeVersion}). Please download and install a supported version from https://nodejs.org/`,
    );
    return EXIT_NODE_FLOOR;
  }

  // cli/main.ts already validates --project's presence as its own usage error before ever calling
  // this function, so no extra message is written here; this check remains as defense for any other
  // caller, and is what test/client/main.test.ts exercises directly.
  if (options.project === undefined) {
    return EXIT_USAGE;
  }

  const resolveBindingImpl = options.resolveProjectBindingImpl ?? resolveProjectBinding;
  const binding = resolveBindingImpl({ project: options.project, cwd: options.cwd });
  if (!binding.ok) {
    writeErr(refusalMessage(binding.refusal));
    return binding.refusal.exitCode;
  }

  const rosterHash = computeRosterHash(binding.file.roster);
  // client_cursors.host is an operator-facing label identifying which machine a session came from; no
  // existing helper produces it, os.hostname() is the natural value (orchestrator decision).
  const ipc = (options.createIpcSessionImpl ?? createIpcSession)({
    projectId: binding.file.project_id,
    groupId: binding.file.group_id,
    rosterHash,
    host: hostname(),
  });

  const server = (options.createServerImpl ?? createServer)({ ipc, projectId: binding.file.project_id });

  const transport = options.transport ?? new StdioServerTransport();
  await server.connect(transport);
  return 0;
}
