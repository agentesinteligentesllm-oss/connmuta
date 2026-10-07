import { resolveHomeDir } from "../daemon/home.js";
import type { ExecFileImpl } from "../installer/exec.js";
import { runOfflineDoctor } from "./offline.js";
import { formatFindings } from "./report.js";

/**
 * The `doctor` tier-dispatch entry point (`doctor/main.ts`, design.md §9.1; tasks.md 14.5).
 *
 * This PR wires only the offline default path. `--online`/`--dm-probe` (D-46) are a later PR (Unit
 * 10): they run daemon-side and need a token, which this tier never touches (spec.md "Offline tiers
 * make zero network calls").
 *
 * **Not wired in this PR** (both disclosed follow-ups): `installer/wizards/setup.ts`'s own
 * `runDoctor?: () => Promise<void> | void` hook, and `cli/main.ts`'s `doctor` verb dispatch (PR-13's
 * own disclosed deferral, since `doctor/main.ts` did not exist until now). {@link runDoctorMain}'s
 * signature is shaped for both: `() => runDoctorMain({ io }).then(() => {})` satisfies the setup hook,
 * and its `{ exitCode }` result is exactly what a CLI dispatcher branch returns today for every other
 * verb.
 */

/** What {@link runDoctorMain} needs. */
export interface RunDoctorMainOptions {
	/** The daemon home; defaults to `~/.conmuta` via {@link resolveHomeDir}. */
	readonly homeDir?: string;
	/** Overridable for tests; defaults to the real `installer/exec.ts` icacls runner (Windows only). */
	readonly execImpl?: ExecFileImpl;
	/**
	 * Where each formatted line is printed. Two sinks, not one: `report.ts` splits `pass`/`warn` from `fail`
	 * precisely so a caller can route them differently (its own doc says so), and merging them here discarded
	 * that split and reordered every `fail` line after every `pass`/`warn` line, contradicting the fixed order
	 * `runSystemChecks` documents (B-82).
	 */
	readonly io: {
		readonly out: (line: string) => void;
		readonly err: (line: string) => void;
	};
}

/** What {@link runDoctorMain} returns: the process exit code a CLI dispatcher can forward as-is. */
export interface RunDoctorMainResult {
	readonly exitCode: number;
}

/** Runs the offline doctor, prints `out` lines through `io.out` and `err` lines through `io.err`, and returns
 * the exit code. Each stream keeps `report.ts`'s own order (B-82). */
export async function runDoctorMain(options: RunDoctorMainOptions): Promise<RunDoctorMainResult> {
	const homeDir = resolveHomeDir(options.homeDir);
	const findings = runOfflineDoctor({ homeDir, execImpl: options.execImpl });
	const report = formatFindings(findings);

	for (const line of report.out) {
		options.io.out(line);
	}
	for (const line of report.err) {
		options.io.err(line);
	}

	return { exitCode: report.exitCode };
}
