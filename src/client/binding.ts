import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { EXIT_PROJECT_MISMATCH, EXIT_UNBOUND_PROJECT, EXIT_USAGE, PROJECT_FILE_NAME } from "../shared/constants.js";
import { parseProjectFile, type ProjectFile, type ProjectFileProblem } from "../shared/project-file.js";

/**
 * Project-binding resolution for the thin MCP client's synchronous startup walk-up (design §10
 * "Startup" row: `client/binding.ts` walks up from `process.cwd()` to the filesystem root for the
 * nearest `conmuta.json`, strict-parses it, requires `project_id === --project`; spec
 * `thin-client-tools` › "Launcher requires --project and refuses when unbound or mismatched").
 *
 * Runs strictly before `server.connect(new StdioServerTransport())` (a later PR's CLI entry point
 * owns that call and turns {@link resolveProjectBinding}'s refusal into the process's actual exit
 * code) and touches no network at all — this module imports no `fetch`, so its "before any IPC call"
 * guarantee holds structurally, by construction, not by a network recorder in its tests.
 *
 * Walks up from `cwd` to the filesystem root looking for the NEAREST `conmuta.json`
 * ({@link PROJECT_FILE_NAME}), reads it with `readFileSync` and hands the raw text to
 * `shared/project-file.ts`'s `parseProjectFile` — this module never re-implements JSON parsing,
 * schema validation or roster-uniqueness checking; that is entirely `parseProjectFile`'s job (pure,
 * no I/O of its own).
 *
 * **Exit-code mapping, decided and disclosed (do not re-derive).** `shared/constants.ts` defines
 * exactly two binding-shaped exit codes:
 * - `EXIT_UNBOUND_PROJECT = 3` — "the CLI ran against a project with no binding recorded in the
 *   registry."
 * - `EXIT_PROJECT_MISMATCH = 4` — "the bound project id does not match the one the caller expected."
 *
 * Both exit codes in this design only ever fire during this synchronous startup walk-up, strictly
 * before `server.connect()`. The daemon handshake (`client/handshake.ts`) happens lazily, on the
 * first tool call, long after the process is already running as an MCP server — so a daemon-returned
 * `UNBOUND_PROJECT` (design §10's client error-taxonomy table lists it as an IPC-time, daemon-returned
 * tool error — a JSON error payload from a tool call, never a process exit) cannot be what these two
 * exit constants describe. That leaves exactly two non-missing-flag walk-up failures for exactly two
 * exit constants:
 * - No `conmuta.json` anywhere in the walk-up → `EXIT_UNBOUND_PROJECT` (3): nothing is bound at this
 *   location at all.
 * - A `conmuta.json` was found but its `project_id` disagrees with `--project` →
 *   `EXIT_PROJECT_MISMATCH` (4): matches that constant's own doc comment verbatim.
 *
 * `specs/thin-client-tools/spec.md`'s Scenario 39 ("project_id mismatch is UNBOUND_PROJECT") is read
 * here as loose/informal prose describing the *situation* — "this location isn't bound to the project
 * you expected" — not a literal pointer to the `EXIT_UNBOUND_PROJECT` constant name; this module's
 * test twin asserts the actual exit code for that scenario is `EXIT_PROJECT_MISMATCH`, matching that
 * constant's own doc comment instead.
 *
 * Disclosed completeness addition beyond the two named scenarios above: a `conmuta.json` that IS
 * found but that `parseProjectFile` refuses (invalid JSON, schema violation, forbidden content) is
 * treated the same as "no valid binding recorded here" (`EXIT_UNBOUND_PROJECT`) rather than silently
 * walked past in search of a valid ancestor. Walking past a broken-but-present binding file to bind
 * against a different, unrelated ancestor project would be a silent misbinding, not a refusal — the
 * walk-up stops at the NEAREST file regardless of whether that file turns out to be valid.
 *
 * Same reasoning covers a found-but-unreadable path: `findNearestProjectFile`'s `existsSync` check
 * returns `true` for any filesystem entry at that path, including a directory, and a TOCTOU window
 * exists between that check and the `readFileSync` call below. A `readFileSync` failure (`EISDIR`,
 * `ENOENT` from a deletion race, `EACCES`) is caught and treated the same as "no valid binding
 * recorded here" (`EXIT_UNBOUND_PROJECT`, refusal kind `unreadable_project_file`) rather than
 * propagating as an uncaught exception — this module's whole job is converting every walk-up failure
 * into a typed {@link BindingResult} refusal, never crashing.
 */

/** Why {@link resolveProjectBinding} refused to bind, paired with the exit code that names it. */
export type BindingRefusal =
  | { readonly kind: "missing_project_flag"; readonly exitCode: typeof EXIT_USAGE }
  | { readonly kind: "no_project_file_found"; readonly exitCode: typeof EXIT_UNBOUND_PROJECT; readonly searchedFrom: string }
  | {
      readonly kind: "invalid_project_file";
      readonly exitCode: typeof EXIT_UNBOUND_PROJECT;
      readonly path: string;
      readonly problems: readonly ProjectFileProblem[];
    }
  | {
      readonly kind: "unreadable_project_file";
      readonly exitCode: typeof EXIT_UNBOUND_PROJECT;
      readonly path: string;
      /** The caught error from `readFileSync` (e.g. `EISDIR`, `ENOENT`, `EACCES`); useful for future diagnostics/logging even though the exit code is the same as the other "nothing usable found here" cases. */
      readonly cause: unknown;
    }
  | {
      readonly kind: "project_id_mismatch";
      readonly exitCode: typeof EXIT_PROJECT_MISMATCH;
      readonly path: string;
      readonly foundProjectId: string;
      readonly expectedProjectId: string;
    };

/** The walk-up's outcome: either a resolved, validated binding, or the refusal that stops it. */
export type BindingResult =
  | { readonly ok: true; readonly file: ProjectFile; readonly path: string }
  | { readonly ok: false; readonly refusal: BindingRefusal };

export interface ResolveProjectBindingOptions {
  /** The `--project` flag's value as the CLI parsed it; `undefined` or `""` both count as missing. */
  readonly project: string | undefined;
  /** Defaults to `process.cwd()`. */
  readonly cwd?: string;
}

/** The nearest `conmuta.json` at or above `startDir`, or `undefined` if the walk-up reaches the filesystem root without finding one. */
function findNearestProjectFile(startDir: string): string | undefined {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, PROJECT_FILE_NAME);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      // dirname of the filesystem root returns the root itself — the walk-up is exhausted.
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Resolves the caller's project binding by walking up from `options.cwd` (default `process.cwd()`)
 * to the filesystem root for the nearest `conmuta.json`. Synchronous and network-free — see the
 * module doc for why that makes its "before any IPC call" guarantee structural.
 */
export function resolveProjectBinding(options: ResolveProjectBindingOptions): BindingResult {
  if (options.project === undefined || options.project === "") {
    return { ok: false, refusal: { kind: "missing_project_flag", exitCode: EXIT_USAGE } };
  }

  const startDir = resolve(options.cwd ?? process.cwd());
  const found = findNearestProjectFile(startDir);
  if (found === undefined) {
    return { ok: false, refusal: { kind: "no_project_file_found", exitCode: EXIT_UNBOUND_PROJECT, searchedFrom: startDir } };
  }

  let text: string;
  try {
    text = readFileSync(found, "utf8");
  } catch (cause) {
    return { ok: false, refusal: { kind: "unreadable_project_file", exitCode: EXIT_UNBOUND_PROJECT, path: found, cause } };
  }
  const parsed = parseProjectFile(text);
  if (!parsed.ok) {
    return {
      ok: false,
      refusal: { kind: "invalid_project_file", exitCode: EXIT_UNBOUND_PROJECT, path: found, problems: parsed.problems },
    };
  }

  if (parsed.file.project_id !== options.project) {
    return {
      ok: false,
      refusal: {
        kind: "project_id_mismatch",
        exitCode: EXIT_PROJECT_MISMATCH,
        path: found,
        foundProjectId: parsed.file.project_id,
        expectedProjectId: options.project,
      },
    };
  }

  return { ok: true, file: parsed.file, path: found };
}
