#!/usr/bin/env node
import type { EventEmitter } from "node:events";
import { dirname } from "node:path";

import { createDaemonLink, type DaemonLink } from "../channel/daemon-link.js";
import { resolveProjectBinding, type BindingRefusal } from "../src/client/binding.js";
import { resolveClientHomeDir } from "../src/client/run-file.js";
import { PROJECT_FILE_NAME } from "../src/shared/constants.js";
import { computeRosterHash } from "../src/shared/roster-hash.js";
import { EXIT_USAGE, runCli, RUNNER_USAGE, type RunLoopRequest } from "./cli.js";
import { RUNNER_NAME, RUNNER_SHUTDOWN_TIMEOUT_MS } from "./constants.js";
import { runTurn, type HarnessSpec, type TurnOutcome } from "./harness.js";
import { ladderPathFor } from "./ladder.js";
import { wakeLedgerPathFor } from "./ledger.js";
import { WakeLoop } from "./loop.js";
import { watermarkPathFor } from "./watermark.js";

/**
 * The `conmuta-runner` bin entry (`runner/main.ts`; ADR-0032 R2/R3/R10, PT-34). It owns the three things the
 * library modules deliberately do not: the project walk-up, the daemon session, and the process lifetime.
 *
 * **The startup mirrors the thin client's.** `--project` is required, the nearest `conmuta.json` decides the
 * project's root directory (which becomes the woken turn's `cwd`), and a refusal exits with the binding's own
 * exit code before any daemon session exists. The runner holds no bot token: it uses the same
 * `GET /identity` challenge-response handshake every other local client uses, and it reads only the
 * body-less doorbell.
 *
 * **stdout carries human text, stderr carries diagnostics.** Nothing consumes this bin over stdio (unlike the
 * MCP client and the channel adapter), so there are no protocol frames to protect — but the split is kept
 * because it is what an operator's own logging expects.
 *
 * **Shutdown has three triggers, first one wins:** SIGINT, SIGTERM, or `--once` finishing. An abort reaches
 * the in-flight turn (which SIGTERMs its harness) and the doorbell long poll (which returns), then the
 * session is deleted. The wait is bounded by {@link RUNNER_SHUTDOWN_TIMEOUT_MS}, because a handshake or a
 * cursor commit in flight takes no signal of its own.
 *
 * **A hard exit at the end, on purpose.** A harness whose pipes are still open, or a fetch still in flight,
 * would otherwise keep the event loop alive after the operator asked to stop. The empty write's callback fires
 * once the earlier stderr lines have drained.
 */

/** Exit code for an unexpected failure: the same "reserved for uncaught errors" fallback the other bins use. */
const EXIT_FAILURE = 1;
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

export interface RunLoopDeps {
	readonly resolveProjectBindingImpl?: typeof resolveProjectBinding;
	readonly createLinkImpl?: typeof createDaemonLink;
	readonly runTurnImpl?: (input: { readonly spec: HarnessSpec; readonly cwd: string; readonly signal: AbortSignal }) => Promise<TurnOutcome>;
	readonly signals?: Pick<EventEmitter, "on" | "off">;
	readonly shutdownTimeoutMs?: number;
}

/** One line per refusal, naming its facts — the thin client's and the channel adapter's own wording. */
function refusalMessage(refusal: BindingRefusal): string {
	switch (refusal.kind) {
		case "missing_project_flag":
			return "--project is required";
		case "no_project_file_found":
			return `no ${PROJECT_FILE_NAME} found above ${refusal.searchedFrom}`;
		case "invalid_project_file":
			return `${refusal.path} is not a valid project file (${refusal.problems.length} problem(s))`;
		case "unreadable_project_file":
			return `${refusal.path} could not be read`;
		case "project_id_mismatch":
			return `${refusal.path} is bound to '${refusal.foundProjectId}', expected '${refusal.expectedProjectId}'`;
	}
}

/** Resolves once `signal` aborts, at once if it already has. Bounds an await without owning a timer. */
function whenAborted(signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve();
			return;
		}
		signal.addEventListener("abort", () => resolve(), { once: true });
	});
}

const describeFailure = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The turn runner the loop gets: the test's own, or the real adapter with its production defaults. */
function runTurnFor(deps: RunLoopDeps): (input: { readonly spec: HarnessSpec; readonly cwd: string; readonly signal: AbortSignal }) => Promise<TurnOutcome> {
	const injected = deps.runTurnImpl;
	if (injected !== undefined) return injected;
	return (input) => runTurn({}, input);
}

/**
 * The real `run` command: resolve, connect, loop. Returns the process exit code and never exits.
 * `--once` runs exactly one tick, which is what an operator uses to check a binding by hand.
 */
export async function runLoop(request: RunLoopRequest, deps: RunLoopDeps = {}): Promise<number> {
	const report = (message: string): void => request.err(`${RUNNER_NAME}: ${message}`);

	const binding = (deps.resolveProjectBindingImpl ?? resolveProjectBinding)({ project: request.project, cwd: request.cwd });
	if (!binding.ok) {
		report(refusalMessage(binding.refusal));
		return binding.refusal.exitCode;
	}
	const projectRoot = dirname(binding.path);
	const { file } = binding;

	const controller = new AbortController();
	const stop = (): void => controller.abort();
	const signals = deps.signals ?? process;
	let link: DaemonLink | undefined;

	try {
		link = (deps.createLinkImpl ?? createDaemonLink)({
			identity: {
				projectId: file.project_id,
				groupId: file.group_id,
				rosterHash: computeRosterHash(file.roster),
				host: RUNNER_NAME,
			},
		});

		const loop = new WakeLoop({
			projectId: file.project_id,
			cwd: projectRoot,
			ladderPath: ladderPathFor(request.home),
			ledgerPath: wakeLedgerPathFor(request.home),
			watermarkPath: watermarkPathFor(request.home),
			link: { readDoorbell: link.readDoorbell, commitCursor: link.commitCursor },
			runTurn: runTurnFor(deps),
			warn: report,
		});

		if (request.once) {
			const outcome = await loop.tick(controller.signal);
			report(`one tick: ${outcome}`);
			await link.close();
			return outcome === "link_failed" ? EXIT_FAILURE : 0;
		}

		for (const name of SHUTDOWN_SIGNALS) signals.on(name, stop);

		let exitCode = 0;
		const running = loop.run(controller.signal).catch((err: unknown) => {
			report(`wake loop stopped: ${describeFailure(err)}`);
			exitCode = EXIT_FAILURE;
			stop();
		});

		await whenAborted(controller.signal);
		for (const name of SHUTDOWN_SIGNALS) signals.off(name, stop);
		// An AbortSignal bound rather than a timer of this module's own, mirroring `channel/main.ts`.
		await Promise.race([running, whenAborted(AbortSignal.timeout(deps.shutdownTimeoutMs ?? RUNNER_SHUTDOWN_TIMEOUT_MS))]);
		await link.close();
		return exitCode;
	} catch (err) {
		report(describeFailure(err));
		await link?.close();
		return EXIT_FAILURE;
	}
}

if (import.meta.main) {
	const writeErr = (line: string): void => {
		process.stderr.write(`${line}\n`);
	};
	const exitCode = await runCli(process.argv.slice(2), { out: (line) => process.stdout.write(`${line}\n`), err: writeErr }, {
		homeDir: (explicit) => resolveClientHomeDir(explicit),
		runLoop: (request) => runLoop(request),
	});
	if (exitCode === EXIT_USAGE) writeErr(RUNNER_USAGE);
	process.exitCode = exitCode;
	process.stderr.write("", () => process.exit(exitCode));
}
