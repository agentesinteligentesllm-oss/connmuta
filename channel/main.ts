#!/usr/bin/env node
import type { EventEmitter } from "node:events";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { createDaemonLink, type DaemonLink } from "./daemon-link.js";
import { DoorbellWatcher } from "./doorbell-loop.js";
import { CHANNEL_INSTRUCTIONS } from "./notify.js";
import { resolveProjectBinding, type BindingRefusal } from "../src/client/binding.js";
import {
	CHANNEL_HOST_LABEL,
	CHANNEL_SERVER_NAME,
	CHANNEL_SHUTDOWN_TIMEOUT_MS,
	EXIT_USAGE,
	PROJECT_FILE_NAME,
} from "../src/shared/constants.js";
import { computeRosterHash } from "../src/shared/roster-hash.js";
import { SERVER_VERSION } from "../src/shared/version.js";

/**
 * The `conmuta-channel` bin entry (`channel/main.ts`, F4 design D6/D7/D9, spec `channel-doorbell`): a
 * low-level MCP `Server` that declares the `claude/channel` capability and pushes one doorbell event per
 * announcement the {@link DoorbellWatcher} reads from the daemon. The server construction and the
 * `notifications/claude/channel` call follow v1's `telegram-agent-bus/channel/index.ts`.
 *
 * **Startup mirrors the thin client** (`src/client/main.ts`): the `--project` check, the client's own
 * {@link resolveProjectBinding}, the roster hash, then the server connect. A refusal creates no link and
 * makes no network call. This module imports none of the thin client's spawn, run-state or handshake
 * code: the link reads the run file and never starts the daemon.
 *
 * **stdout is the MCP stdio channel and carries protocol frames only.** Every refusal, warning and crash
 * goes to stderr, and the message only, never a stack.
 *
 * **Shutdown** has three triggers, first one wins: the transport closing, SIGINT and SIGTERM. Each aborts
 * the in-flight poll. The wait for the watcher is bounded by the shutdown timeout, because
 * `DaemonLink.commitCursor` takes no signal and a handshake in flight ignores a caller abort: awaiting
 * the loop unboundedly could hold the exit for as long as the daemon stays silent. The link is closed
 * (its `DELETE /session` is itself bounded) whether or not the watcher stopped in time.
 *
 * **No Node-floor gate.** `package.json` `engines` already requires >=24.15.0, and the adapter uses no
 * `node:sqlite`, the only reason the thin client and daemon gate on a version.
 */

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;
/** Exit code for an unexpected failure, the same "reserved for uncaught errors" fallback the thin client uses. */
const EXIT_FAILURE = 1;
const MISSING_PROJECT_MESSAGE = "--project is required";
const USAGE = `usage: ${CHANNEL_SERVER_NAME} --project <id>`;

export interface RunChannelOptions {
	/** The `--project` value; `undefined` is a usage error. */
	readonly project: string | undefined;
	/** Where the project-file walk-up starts; defaults to the process's working directory. */
	readonly cwd?: string;
	/** One diagnostic line, without its newline; defaults to writing it to the process's stderr. */
	readonly stderr?: (line: string) => void;
	/** Defaults to stdio, with the stream ending mapped onto a transport close. */
	readonly transport?: Transport;
	readonly resolveProjectBindingImpl?: typeof resolveProjectBinding;
	readonly createLinkImpl?: typeof createDaemonLink;
	/** Where SIGINT and SIGTERM arrive; defaults to the process. */
	readonly signals?: Pick<EventEmitter, "on" | "off">;
	/** Bound on waiting for the watcher to stop; injectable only so a test need not wait out the default. */
	readonly shutdownTimeoutMs?: number;
}

export type ParsedChannelArgs = { readonly ok: true; readonly project: string | undefined } | { readonly ok: false };

/** Accepts `--project <id>` and `--project=<id>`, once; anything else is a usage error. No arguments parse, and the core refuses the missing project. */
export function parseChannelArgs(argv: readonly string[]): ParsedChannelArgs {
	let project: string | undefined;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? "";
		let value: string | undefined;
		if (arg === "--project") {
			index += 1;
			value = argv[index];
		} else if (arg.startsWith("--project=")) {
			value = arg.slice("--project=".length);
		}
		if (value === undefined || project !== undefined) {
			return { ok: false };
		}
		project = value;
	}
	return { ok: true, project };
}

/** One line per refusal, naming its facts. Never prints the problems of an invalid file, only how many there are. */
function refusalMessage(refusal: BindingRefusal): string {
	switch (refusal.kind) {
		case "missing_project_flag":
			return MISSING_PROJECT_MESSAGE;
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

const describeFailure = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Resolves once `signal` aborts, at once if it already has. Bounds an await without a timer API, like `rejectOnAbort` in `daemon-link.ts`. */
function whenAborted(signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve();
			return;
		}
		signal.addEventListener("abort", () => resolve(), { once: true });
	});
}

/**
 * The SDK's stdio transport listens for `data` and `error` only, so it never reports stdin ending: a host
 * that closes our stdin would leave the loop polling for good. Mapping the stream's `close` onto the
 * transport's own `close` makes the server surface it as `onclose`, the same shutdown trigger.
 */
function createStdioTransport(): Transport {
	const transport = new StdioServerTransport();
	process.stdin.once("close", () => {
		void transport.close();
	});
	return transport;
}

/**
 * Runs the adapter until it is told to stop and returns the process exit code. Never exits the process:
 * the guarded entry below owns that, so this core stays testable.
 */
export async function runChannel(options: RunChannelOptions): Promise<number> {
	const writeErr =
		options.stderr ??
		((line: string) => {
			process.stderr.write(`${line}\n`);
		});
	const report = (message: string): void => writeErr(`${CHANNEL_SERVER_NAME}: ${message}`);

	if (options.project === undefined) {
		report(MISSING_PROJECT_MESSAGE);
		return EXIT_USAGE;
	}
	const binding = (options.resolveProjectBindingImpl ?? resolveProjectBinding)({ project: options.project, cwd: options.cwd, requireProjectFlag: true });
	if (!binding.ok) {
		report(refusalMessage(binding.refusal));
		return binding.refusal.exitCode;
	}
	const { file } = binding;

	const controller = new AbortController();
	const stop = (): void => controller.abort();
	let link: DaemonLink | undefined;
	let server: Server;
	try {
		// The link is lazy: nothing touches the network before the watcher's first route call.
		link = (options.createLinkImpl ?? createDaemonLink)({
			identity: {
				projectId: file.project_id,
				groupId: file.group_id,
				rosterHash: computeRosterHash(file.roster),
				host: CHANNEL_HOST_LABEL,
			},
		});
		server = new Server(
			{ name: CHANNEL_SERVER_NAME, version: SERVER_VERSION },
			// The presence of this key is the whole registration. `claude/channel/permission` is omitted as a
			// key, never `false`: a doorbell holds no authority to approve tool use, and before Claude Code
			// v2.1.234 an explicit `false` was read as a declaration.
			{ capabilities: { experimental: { "claude/channel": {} } }, instructions: CHANNEL_INSTRUCTIONS },
		);
		server.onclose = stop;
		await server.connect(options.transport ?? createStdioTransport());
	} catch (err) {
		report(describeFailure(err));
		await link?.close();
		return EXIT_FAILURE;
	}

	const signals = options.signals ?? process;
	for (const name of SHUTDOWN_SIGNALS) {
		signals.on(name, stop);
	}

	let exitCode = 0;
	const watcher = new DoorbellWatcher({
		link,
		deliver: (notification) =>
			server.notification({
				method: "notifications/claude/channel",
				params: { content: notification.content, meta: notification.meta },
			}),
	});
	// A crash must not leave a zombie: it is reported and takes the same shutdown path as a trigger.
	const running = watcher.run(controller.signal).catch((err: unknown) => {
		report(`doorbell loop stopped: ${describeFailure(err)}`);
		exitCode = EXIT_FAILURE;
		stop();
	});

	await whenAborted(controller.signal);
	for (const name of SHUTDOWN_SIGNALS) {
		signals.off(name, stop);
	}
	// An AbortSignal bound, not a timer call: this file must stay free of timer identifiers (its source pin checks).
	const watcherStopBound = AbortSignal.timeout(options.shutdownTimeoutMs ?? CHANNEL_SHUTDOWN_TIMEOUT_MS);
	await Promise.race([running, whenAborted(watcherStopBound)]);
	await link.close();
	// Closing after the transport already closed is harmless; a failure here must not change the exit.
	await server.close().catch(() => undefined);
	return exitCode;
}

if (import.meta.main) {
	const args = parseChannelArgs(process.argv.slice(2));
	if (!args.ok) {
		process.stderr.write(`${USAGE}\n`);
	}
	const exitCode = args.ok ? await runChannel({ project: args.project }) : EXIT_USAGE;
	process.exitCode = exitCode;
	// A hard exit, because a fetch or handshake still in flight would keep the event loop alive for up to
	// the request timeout. The empty write's callback fires once the earlier stderr lines have drained.
	process.stderr.write("", () => process.exit(exitCode));
}
