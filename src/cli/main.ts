#!/usr/bin/env node
// The shebang is line 1, and `tsc` copies it into `dist/src/cli/main.js` verbatim: ADR-0012
// remediation 2. It is load-bearing, not decoration. `package.json` wires exactly one bin
// (`conmuta` -> `dist/src/cli/main.js`), so without it a POSIX invocation never reaches the
// dispatcher — the process exits 0 with zero bytes on both streams, the least diagnosable outcome,
// and a pre-commit hook reads that silence as "clean" (PT-05). `test/cli/main.test.ts` pins the
// emitted line so this can fail instead of regressing.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { EXIT_USAGE, PRODUCT_NAME } from "../shared/constants.js";
import { SERVER_VERSION } from "../shared/version.js";
import { validateText } from "./validate.js";

/**
 * The process surface the dispatcher needs, injected rather than reached for.
 *
 * Injection is what keeps the dispatcher testable without a child process and without touching the
 * real filesystem, while `test/cli/validate.test.ts` still exercises the real thing end to end.
 */
export interface CliIo {
	readonly out: (line: string) => void;
	readonly err: (line: string) => void;
	readonly readFile: (path: string) => string;
	readonly readStdin: () => string;
}

/**
 * One line per invocation form this build wires; `mcp`, `daemon stop` and `migrate-v1` land later.
 *
 * The usage text describes what **this build accepts**, not the requirement's bracket notation: the
 * spec spells the surface `conmuta validate [<path> | --stdin]`, and this CLI refuses a bare
 * invocation deliberately (see `apply-progress.md` §PR-08b, `JD-A-002`), so advertising an optional
 * target here would promise an operator a form that exits 2. `test/cli/main.test.ts` pins the text.
 */
const USAGE_LINES = [
	`usage: ${PRODUCT_NAME} validate <path> | --stdin`,
	`  validate      refuse a project file that is not identifiers-only (PT-05, PT-06)`,
];

/** Report a usage failure: a short reason, then the usage block. Always {@link EXIT_USAGE}. */
function usageError(io: CliIo, reason?: string): number {
	if (reason !== undefined) {
		io.err(`${PRODUCT_NAME}: ${reason}`);
	}
	for (const line of USAGE_LINES) {
		io.err(line);
	}
	io.err(`${PRODUCT_NAME} ${SERVER_VERSION}`);
	return EXIT_USAGE;
}

/**
 * Dispatch one command line.
 *
 * `argv` is the arguments **after** the runtime and the script (`process.argv.slice(2)`), so the
 * first element is the subcommand. Returns the process exit code; the caller decides what to do with
 * it, which keeps the whole dispatcher callable from a test.
 *
 * Every misuse — no subcommand, an unknown subcommand, an unknown option, a target given twice,
 * neither target, more than one path, an unreadable path — is a usage error and never a silent
 * success: a hook or a host that mis-invokes this command must not read exit 0 as "clean file".
 */
export function runCli(argv: readonly string[], io: CliIo): number {
	const [command, ...rest] = argv;
	if (command === undefined) {
		return usageError(io);
	}
	// Only `validate` is wired in F1's first CLI slice. The reserved subcommands are named so a
	// caller that tries one gets a usage error instead of a stub that pretends to work.
	if (command !== "validate") {
		return usageError(io, `unknown command '${command}'`);
	}

	const flags = rest.filter((arg) => arg.startsWith("--"));
	const paths = rest.filter((arg) => !arg.startsWith("--"));
	const unknownOption = flags.find((flag) => flag !== "--stdin");
	if (unknownOption !== undefined) {
		return usageError(io, `unknown option '${unknownOption}'`);
	}
	const wantsStdin = flags.includes("--stdin");
	if (wantsStdin && paths.length > 0) {
		return usageError(io, "give either a path or --stdin, not both");
	}
	if (!wantsStdin && paths.length === 0) {
		return usageError(io, "validate needs a path or --stdin");
	}
	if (paths.length > 1) {
		return usageError(io, "validate takes at most one path");
	}

	const path = paths[0];
	const source = wantsStdin ? "<stdin>" : (path as string);
	let text: string;
	try {
		text = wantsStdin ? io.readStdin() : io.readFile(source);
	} catch {
		// The path is named but the failure's detail is not echoed: the detail is an OS message, and
		// this output is one more place a value could travel through (see `validateText`).
		return usageError(io, `cannot read ${source}`);
	}

	const report = validateText(text, source);
	for (const line of report.out) {
		io.out(line);
	}
	for (const line of report.err) {
		io.err(line);
	}
	return report.exitCode;
}

/** The real process surface, used only by the entry point below. */
function createProcessIo(): CliIo {
	return {
		out: (line) => process.stdout.write(`${line}\n`),
		err: (line) => process.stderr.write(`${line}\n`),
		readFile: (path) => readFileSync(path, "utf8"),
		readStdin: () => readFileSync(0, "utf8"),
	};
}

/**
 * Whether this module is the process entry point rather than an import.
 *
 * Load-bearing: `test/cli/main.test.ts` imports this module, and an unguarded top-level call would
 * make every import print usage and set an exit code. Compared through `pathToFileURL` so a Windows
 * drive-lettered `process.argv[1]` matches the file URL form of `import.meta.url`.
 */
function isDirectlyExecuted(): boolean {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectlyExecuted()) {
	// `exitCode` rather than `process.exit`: the stdio streams must flush, and an abrupt exit can
	// truncate the very lines a hook reads.
	process.exitCode = runCli(process.argv.slice(2), createProcessIo());
}
