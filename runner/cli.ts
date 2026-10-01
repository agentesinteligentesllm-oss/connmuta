import { EXIT_USAGE } from "../src/shared/constants.js";
import { LADDER_LEVELS } from "./constants.js";
import { ladderPathFor, readLadderFile, removeLadderEntry, resolveLadder, writeLadderEntry, type LadderLevel } from "./ladder.js";
import { appendLedgerRow, ladderRow, wakeLedgerPathFor } from "./ledger.js";

/**
 * `conmuta-runner`'s command line (`runner/cli.ts`; ADR-0032 R4/R6). Two jobs, deliberately in one file
 * because they share one vocabulary:
 *
 *  1. **the human's opt-in** — `ladder set|get|disable`. This is the only way a binding is ever raised.
 *     `--by` is required and stored in the record: a ladder entry nobody signed is refused at the write and
 *     treated as malformed at the read. Every change also appends one `ladder` row to the satellite's own
 *     ledger, so the opt-in's history sits next to the wakes it caused. `ladder disable` is the kill switch.
 *  2. **the runner itself** — `run`, which this module only parses and hands to the injected loop runner.
 *
 * **Strict parsing, no guessing.** An unrecognized option, a missing value, a repeated single-valued option
 * or an unknown level is a usage error (exit {@link EXIT_USAGE}, the same code the core CLI uses), never a
 * silently ignored flag: this command raises a capability, so a typo must fail rather than half-apply.
 *
 * Everything here returns an exit code and never exits the process, so the whole CLI is testable and the
 * guarded entry in `main.ts` owns `process.exit`.
 */

export const EXIT_OK = 0;
/** A completed tick that could not reach the daemon, or a ladder write that was refused by the file: distinct
 * from a usage error and from success. */
export const EXIT_REFUSED = 1;
export { EXIT_USAGE };

export const RUNNER_USAGE = [
	"usage: conmuta-runner <command> [options]",
	"",
	"commands:",
	"  run --project <id> [--cwd <dir>] [--once]",
	"      Hold the daemon's doorbell for this project and wake its harness when traffic arrives.",
	"",
	"  ladder get [--project <id>]",
	"      Show the resolved level for one binding, or for every binding on this machine.",
	"",
	"  ladder set --project <id> --level <off|notify|wake|autopilot> --harness <pi|claude|codex|opencode> --by <note> [--arg <value>]...",
	"      Raise or change one binding. `--harness` is required for any level that starts a turn, because",
	"      it decides which program is executed. Repeat --arg to add literal harness arguments.",
	"",
	"  ladder disable --project <id> --by <note>",
	"      The kill switch: remove this binding's record so it resolves to off.",
	"",
	"global:",
	"  --home <dir>   the daemon home (default ~/.conmuta)",
	"",
	"note: a value that begins with `--` must use the --name=value form.",
].join("\n");

export interface CliIo {
	readonly out: (line: string) => void;
	readonly err: (line: string) => void;
}

export type ParsedCommand =
	| { readonly kind: "run"; readonly project: string; readonly cwd: string | undefined; readonly once: boolean; readonly home: string | undefined }
	| { readonly kind: "ladder-get"; readonly project: string | undefined; readonly home: string | undefined }
	| {
			readonly kind: "ladder-set";
			readonly project: string;
			readonly level: LadderLevel;
			readonly harness: string | undefined;
			readonly args: readonly string[];
			readonly by: string;
			readonly home: string | undefined;
	  }
	| { readonly kind: "ladder-disable"; readonly project: string; readonly by: string; readonly home: string | undefined };

/** The levels for which an explicit `--harness` is mandatory. */
const LEVELS_THAT_START_A_TURN: readonly LadderLevel[] = ["wake", "autopilot"];

interface Tokenized {
	readonly words: readonly string[];
	/** Every `--name` seen with the values it carried (`--flag` records an empty array). */
	readonly options: ReadonlyMap<string, readonly string[]>;
	/** True when a token could not be classified (a bare word after the command, or a dangling `--name`). */
	readonly malformed: boolean;
}

/** Splits argv into command words and `--name[=value]` options. A value beginning with `--` needs the `=` form. */
function tokenize(argv: readonly string[]): Tokenized {
	const words: string[] = [];
	const options = new Map<string, string[]>();
	let malformed = false;
	const push = (name: string, value?: string): void => {
		const bucket = options.get(name);
		if (value === undefined) {
			if (bucket === undefined) options.set(name, []);
			return;
		}
		if (bucket === undefined) options.set(name, [value]);
		else bucket.push(value);
	};

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index] ?? "";
		if (!token.startsWith("--")) {
			words.push(token);
			continue;
		}
		const equals = token.indexOf("=");
		if (equals > 2) {
			push(token.slice(0, equals), token.slice(equals + 1));
			continue;
		}
		const next = argv[index + 1];
		if (next !== undefined && !next.startsWith("--")) {
			push(token, next);
			index += 1;
			continue;
		}
		push(token);
	}
	return { words, options, malformed };
}

export function parseRunnerArgs(argv: readonly string[]): ParsedCommand | null {
	const { words, options, malformed } = tokenize(argv);
	if (malformed) return null;

	const command = words[0];
	const sub = words[1];
	const known: readonly string[] =
		command === "run"
			? ["--project", "--cwd", "--once", "--home"]
			: command === "ladder" && sub === "get"
				? ["--project", "--home"]
				: command === "ladder" && sub === "set"
					? ["--project", "--level", "--harness", "--by", "--arg", "--home"]
					: command === "ladder" && sub === "disable"
						? ["--project", "--by", "--home"]
						: [];
	const commandWords = command === "ladder" ? 2 : 1;
	if (words.length !== commandWords || known.length === 0) return null;
	for (const name of options.keys()) {
		if (!known.includes(name)) return null;
	}

	const single = (name: string): string | undefined => {
		const values = options.get(name);
		if (values === undefined || values.length !== 1 || values[0].length === 0) return undefined;
		return values[0];
	};
	const optionalSingle = (name: string): { value?: string; ok: boolean } => {
		const values = options.get(name);
		if (values === undefined) return { ok: true };
		if (values.length !== 1 || values[0].length === 0) return { ok: false };
		return { value: values[0], ok: true };
	};
	const flag = (name: string): boolean => options.get(name)?.length === 0;
	const home = optionalSingle("--home");

	if (command === "run") {
		const project = single("--project");
		const cwd = optionalSingle("--cwd");
		if (project === undefined || !cwd.ok || !home.ok) return null;
		return { kind: "run", project, cwd: cwd.value, once: flag("--once"), home: home.value };
	}

	if (command === "ladder" && sub === "get") {
		const project = optionalSingle("--project");
		if (!project.ok || !home.ok) return null;
		return { kind: "ladder-get", project: project.value, home: home.value };
	}

	if (command === "ladder" && sub === "set") {
		const project = single("--project");
		const by = single("--by");
		const level = single("--level");
		const harness = optionalSingle("--harness");
		const args = options.get("--arg") ?? [];
		if (project === undefined || by === undefined || level === undefined || !harness.ok || !home.ok) return null;
		if (!(LADDER_LEVELS as readonly string[]).includes(level)) return null;
		const chosen = level as LadderLevel;
		if (LEVELS_THAT_START_A_TURN.includes(chosen) && harness.value === undefined) return null;
		return { kind: "ladder-set", project, level: chosen, harness: harness.value, args, by, home: home.value };
	}

	if (command === "ladder" && sub === "disable") {
		const project = single("--project");
		const by = single("--by");
		if (project === undefined || by === undefined || !home.ok) return null;
		return { kind: "ladder-disable", project, by, home: home.value };
	}

	return null;
}

export interface RunLoopRequest {
	readonly project: string;
	readonly cwd: string | undefined;
	readonly once: boolean;
	readonly home: string;
	readonly err: (line: string) => void;
}

export interface CliDeps {
	/** Resolves the daemon home; `main.ts` supplies the shared client-home resolver (`~/.conmuta`). */
	readonly homeDir: (explicit: string | undefined) => string;
	/** The real runner: injected so the CLI's parsing and the ladder commands are testable without a daemon. */
	readonly runLoop: (request: RunLoopRequest) => Promise<number>;
	readonly now?: () => number;
}

/**
 * Runs one command line and returns its exit code. A usage error prints the usage and returns
 * {@link EXIT_USAGE}; a ladder write the file refused returns {@link EXIT_REFUSED} with the reason on stderr.
 */
export async function runCli(argv: readonly string[], io: CliIo, deps: CliDeps): Promise<number> {
	const parsed = parseRunnerArgs(argv);
	if (parsed === null) {
		io.err(RUNNER_USAGE);
		return EXIT_USAGE;
	}
	const home = deps.homeDir(parsed.home);
	const now = deps.now ?? (() => Date.now());

	switch (parsed.kind) {
		case "ladder-get": {
			const read = readLadderFile(ladderPathFor(home));
			const projects = parsed.project === undefined ? [...read.bindings.keys()].sort() : [parsed.project];
			if (projects.length === 0) {
				io.out("no binding has a ladder record on this machine (every binding is off)");
				return EXIT_OK;
			}
			for (const project of projects) {
				const resolved = resolveLadder(read, project);
				io.out(
					resolved.kind === "entry"
						? `${project}: ${resolved.entry.level} (${resolved.entry.harness}, by ${resolved.entry.by} at ${resolved.entry.at})`
						: `${project}: off (${resolved.reason})`,
				);
			}
			return EXIT_OK;
		}

		case "ladder-set": {
			const entry = {
				level: parsed.level,
				harness: parsed.harness ?? "pi",
				...(parsed.args.length > 0 ? { harness_args: parsed.args } : {}),
				by: parsed.by,
				at: new Date(now()).toISOString(),
			};
			try {
				writeLadderEntry(ladderPathFor(home), parsed.project, entry);
			} catch (err) {
				io.err(`conmuta-runner: ${err instanceof Error ? err.message : String(err)}`);
				return EXIT_REFUSED;
			}
			appendLedgerRow(wakeLedgerPathFor(home), ladderRow({ ts: entry.at, project_id: parsed.project, level: parsed.level }, parsed.by));
			io.out(`${parsed.project}: ${parsed.level} (${entry.harness}) — recorded by ${parsed.by}`);
			return EXIT_OK;
		}

		case "ladder-disable": {
			try {
				removeLadderEntry(ladderPathFor(home), parsed.project);
			} catch (err) {
				io.err(`conmuta-runner: ${err instanceof Error ? err.message : String(err)}`);
				return EXIT_REFUSED;
			}
			appendLedgerRow(
				wakeLedgerPathFor(home),
				ladderRow({ ts: new Date(now()).toISOString(), project_id: parsed.project, level: "off" }, parsed.by),
			);
			io.out(`${parsed.project}: off — the runner will not wake this binding`);
			return EXIT_OK;
		}

		case "run":
			return deps.runLoop({ project: parsed.project, cwd: parsed.cwd, once: parsed.once, home, err: io.err });
	}
}
