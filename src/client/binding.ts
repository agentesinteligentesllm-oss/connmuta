import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { EXIT_PROJECT_MISMATCH, EXIT_UNBOUND_PROJECT, EXIT_USAGE, PROJECT_FILE_NAME } from "../shared/constants.js";
import { parseProjectFile, type ProjectFile, type ProjectFileProblem } from "../shared/project-file.js";

/**
 * Project-binding resolution for the thin MCP client's synchronous startup walk-up (design §10
 * "Startup" row: `client/binding.ts` walks up from `process.cwd()` to the filesystem root for the
 * nearest `conmuta.json`, strict-parses it; spec `thin-client-tools` › "Launcher resolves the
 * nearest binding and refuses when unbound or mismatched").
 *
 * **ADR-0033 (amending ADR-0028 rule 4): `--project` is an assertion, not a requirement.** When the
 * caller supplies a non-empty `--project <id>`, a found file whose `project_id` disagrees is refused
 * exactly as before. When the caller supplies none (`undefined` or `""`), the nearest ancestor
 * `conmuta.json` fixes the binding on its own — no refusal, no default id. That is what lets a single
 * registration (`conmuta mcp`, no id) be correct for every session inside a tree, including a session
 * whose cwd is a subfolder of the bound root and a headless harness turn: the binding lives in the
 * committed project file (ADR-0028 rule 3), so the registration artifact does not have to repeat it.
 * Invariant 1 is unaffected — the walk-up still fixes the binding before any IPC call, and the daemon
 * still asserts `chat_id === binding.group_id` before every `sendMessage` (`WRONG_ROOM`).
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
 * exit constants describe. That leaves exactly two walk-up failures for exactly two exit constants, plus
 * the opt-in `missing_project_flag` gate described above (whose `EXIT_USAGE` is not a walk-up failure at
 * all, which is why it is not one of the two):
 * - No `conmuta.json` anywhere in the walk-up → `EXIT_UNBOUND_PROJECT` (3): nothing is bound at this
 *   location at all.
 * - A `conmuta.json` was found but its `project_id` disagrees with an explicit `--project` →
 *   `EXIT_PROJECT_MISMATCH` (4): matches that constant's own doc comment verbatim. Since ADR-0033 this
 *   arm needs an EXPLICIT `--project`; with no flag there is nothing to disagree with, and the found
 *   file is adopted.
 * - A caller that set `requireProjectFlag` passed neither `--project` nor `--project=<id>` →
 *   `EXIT_USAGE` (2), refusal kind `missing_project_flag`. Only `conmuta-channel` and `conmuta-runner`
 *   opt into this; the thin client does not (ADR-0033).
 *
 * **The F1 wording is now resolved, not read loosely.** The F1 delta spec's Scenario 39 read "project_id
 * mismatch is UNBOUND_PROJECT", which this module always implemented as `EXIT_PROJECT_MISMATCH` —
 * matching that constant's own doc comment. ADR-0033's rewrite of the requirement states the refusal
 * without naming the wrong constant, so the disclosed reading above is retired: the canonical scenario is
 * now "An explicit --project that disagrees is refused", and this module's test twin pins the exit code.
 *
 * Disclosed completeness addition beyond the named scenarios above: a `conmuta.json` that IS
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
  /**
   * The `--project` flag's value as the caller parsed it; `undefined` or `""` both mean "no
   * assertion" (ADR-0033): the nearest ancestor `conmuta.json` fixes the binding on its own.
   */
  readonly project: string | undefined;
  /** Defaults to `process.cwd()`. */
  readonly cwd?: string;
  /**
   * ADR-0028 rule 4's original strict mode, kept for the two bindings whose argv is written per binding
   * by the operator or the daemon — never by a host's MCP config. `conmuta-channel` and
   * `conmuta-runner` set this `true` and keep refusing `EXIT_USAGE` when the flag is absent or empty;
   * the thin client (`conmuta mcp`) does NOT set it, because ADR-0033 makes its flag an assertion.
   *
   * The asymmetry is deliberate and is the whole point of ADR-0033: the client's entry is written once,
   * by a host config, for every session under a tree, so it must not have to name the project; the other
   * two are spawned per binding with the id already known, so the explicit flag costs nothing and
   * catches an operator mistake at startup.
   */
  readonly requireProjectFlag?: boolean;
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
  // ADR-0033: for the thin client an absent or empty flag is no assertion at all, not a usage error.
  // `--project`'s own empty/valueless forms are refused by `cli/main.ts` before it ever reaches this
  // function. A caller that wants the pre-ADR-0033 strictness (see `requireProjectFlag`) asks for it;
  // the check below keeps that refusal reachable and its exit code unchanged for those callers.
  if (
    options.requireProjectFlag === true &&
    (options.project === undefined || options.project === "")
  ) {
    return { ok: false, refusal: { kind: "missing_project_flag", exitCode: EXIT_USAGE } };
  }
  const expectedProjectId = options.project === undefined || options.project === "" ? undefined : options.project;

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

  if (expectedProjectId !== undefined && parsed.file.project_id !== expectedProjectId) {
    return {
      ok: false,
      refusal: {
        kind: "project_id_mismatch",
        exitCode: EXIT_PROJECT_MISMATCH,
        path: found,
        foundProjectId: parsed.file.project_id,
        expectedProjectId,
      },
    };
  }

  return { ok: true, file: parsed.file, path: found };
}
