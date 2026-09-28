#!/usr/bin/env node
// The shebang is line 1, and `tsc` copies it into `dist/src/cli/main.js` verbatim: ADR-0012
// remediation 2. It is load-bearing, not decoration. `package.json` wires exactly one bin
// (`conmuta` -> `dist/src/cli/main.js`), so without it a POSIX invocation never reaches the
// dispatcher — the process exits 0 with zero bytes on both streams, the least diagnosable outcome,
// and a pre-commit hook reads that silence as "clean" (PT-05). `test/cli/main.test.ts` pins the
// emitted line so this can fail instead of regressing.
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DatabaseSync } from "node:sqlite";

import { EXIT_NODE_FLOOR, EXIT_USAGE, PRODUCT_NAME } from "../shared/constants.js";
import { SERVER_VERSION } from "../shared/version.js";
import { enforceNodeFloor } from "../daemon/node-floor.js";
import { validateText } from "./validate.js";
import type { InstallerCliDeps, InstallerCliOutcome } from "../installer/cli.js";
import type { Prompter } from "../installer/prompter.js";
import type { ToolId } from "../installer/tool-targets.js";
import type { SetupOutcome } from "../installer/wizards/setup.js";
import type { BotAddOutcome } from "../installer/wizards/bot-add.js";
import type { GroupAddOutcome } from "../installer/wizards/group-add.js";
import type { ProjectBindOutcome } from "../installer/wizards/project-bind.js";
import type { ProjectRosterEntry } from "../shared/project-file.js";

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
 * One line per invocation form this build wires.
 *
 * The usage text describes what **this build accepts**, not the requirement's bracket notation: the
 * spec spells the surface `conmuta validate [<path> | --stdin]`, and this CLI refuses a bare
 * invocation deliberately (see `apply-progress.md` §PR-08b, `JD-A-002`), so advertising an optional
 * target here would promise an operator a form that exits 2. `test/cli/main.test.ts` pins the text.
 */
const USAGE_LINES = [
	`usage: ${PRODUCT_NAME} validate <path> | --stdin`,
	`       ${PRODUCT_NAME} daemon start`,
	`       ${PRODUCT_NAME} daemon stop [--home <dir>]`,
	`       ${PRODUCT_NAME} panel [--home <dir>]`,
	`       ${PRODUCT_NAME} setup`,
	`       ${PRODUCT_NAME} bot add`,
	`       ${PRODUCT_NAME} group add`,
	`       ${PRODUCT_NAME} project bind <path>`,
	`       ${PRODUCT_NAME} project sync-roster [path] [--home <dir>]`,
	`       ${PRODUCT_NAME} mcp --project <id>`,
	`       ${PRODUCT_NAME} migrate-v1 [--v1-home <dir>] [--project-id <slug>] [--project-path <abs dir>] [--token-stdin] [--dry-run]`,
	`  validate      refuse a project file that is not identifiers-only (PT-05, PT-06)`,
	`  daemon start  ensure the daemon is running, spawning it if needed`,
	`  daemon stop   stop the running daemon after confirming identity (D-29)`,
	`  panel         print the one-time web panel URL (F3)`,
	`  setup         interactive first-run setup: home, registry scaffold, ledger, ACL, autostart`,
	`  bot add       register a Telegram bot's token`,
	`  group add     register a Telegram group id`,
	`  project bind  bind a project directory to a bot, group and roster`,
	`  project sync-roster  re-sync a project's roster after a confirmed conmuta.json change (roster-sync)`,
	`  mcp           start the MCP server for an IDE host (ADR-0029)`,
	`  migrate-v1    one-shot v1-to-v2 migration (D-24); non-interactive, refuses on any precondition failure`,
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
 * Thrown by one of the installer dependency closures below for a failure `installer/cli.ts`'s own
 * outcome unions have no member for — a refused ledger open (`ledger-access.ts`'s `"version_mismatch"`
 * has no home in {@link BotAddOutcome}/{@link GroupAddOutcome}/{@link ProjectBindOutcome}), a cancelled
 * interactive prompt, or input that does not parse. Caught once around the `runInstallerCli` call
 * below, so it becomes a reported CLI failure instead of an uncaught crash.
 */
class InstallerDependencyFailure extends Error {}

/** Opens the installer's ledger view once per invocation, or throws {@link InstallerDependencyFailure}. */
async function openInstallerLedgerOrFail(homeDir: string): Promise<{ readonly db: DatabaseSync; readonly registryPath: string }> {
	const { openInstallerLedger } = await import("../installer/ledger-access.js");
	const result = openInstallerLedger({ homeDir });
	if (result.status === "refused") {
		throw new InstallerDependencyFailure(
			`ledger refused (${result.reason}) at ${result.path}: found schema version ${result.foundVersion}`,
		);
	}
	return { db: result.db, registryPath: join(homeDir, "registry.json") };
}

/**
 * Collects `group add`'s own interactive inputs. Neither `groupId` nor `title` is prompted for
 * anywhere upstream — `group-add.ts`'s own module doc discloses this as deferred to "a later
 * CLI-wiring slice", which is this one. Throws {@link InstallerDependencyFailure} on a cancelled prompt
 * or an id that does not parse as a negative integer (Telegram's own supergroup convention): neither
 * is a member {@link GroupAddOutcome} carries.
 */
async function collectGroupAddInputs(prompter: Prompter): Promise<{ readonly groupId: number; readonly title?: string }> {
	const idAnswer = await prompter.text({ message: "Telegram group id (negative number, e.g. -1001234567890):" });
	if (prompter.isCancel(idAnswer)) {
		throw new InstallerDependencyFailure("group add cancelled");
	}
	const groupId = Number(idAnswer);
	if (!Number.isInteger(groupId) || groupId >= 0) {
		throw new InstallerDependencyFailure(`invalid group id '${idAnswer as string}': expected a negative integer`);
	}

	const titleAnswer = await prompter.text({ message: "Display title (optional):", defaultValue: "" });
	if (prompter.isCancel(titleAnswer)) {
		throw new InstallerDependencyFailure("group add cancelled");
	}
	const title = titleAnswer as string;
	return { groupId, title: title.length > 0 ? title : undefined };
}

/**
 * Collects `project bind`'s own interactive inputs: a bot/group selection read off the current
 * registry, an `agent_id`, and the tool-config multiselect. None of these are prompted for anywhere
 * upstream either (`project-bind.ts`'s own module doc: "interactive selection and roster composition
 * are deferred"), so this is that later CLI-wiring slice.
 *
 * **Disclosed simplification** (see this PR's own report): building a full multi-human roster
 * composer (`roster-source.ts`'s `composeRoster`) is out of scope for this wiring layer. The one typed
 * `agent_id` becomes this project's sole roster entry, pointed at the selected bot's own identity —
 * correct for a fresh project with one human operator, and the common case this installer targets.
 */
async function collectProjectBindInputs(
	prompter: Prompter,
	registryPath: string,
): Promise<{
	readonly botId: number;
	readonly groupId: number;
	readonly agentId: string;
	readonly roster: readonly ProjectRosterEntry[];
	readonly selectedToolIds: ReadonlySet<ToolId>;
}> {
	const { parseRegistryText } = await import("../registry/loader.js");
	const { TOOL_CONFIG_TARGETS } = await import("../installer/tool-targets.js");

	const parsed = parseRegistryText(readFileSync(registryPath, "utf8"));
	if (!parsed.ok) {
		throw new InstallerDependencyFailure("registry.json is not currently valid; fix it before project bind");
	}
	const { registry } = parsed;

	const botAnswer = await prompter.select({
		message: "Select the bot to bind:",
		options: registry.bots.map((bot) => ({ value: bot.bot_id, label: `${bot.username || bot.bot_id} (${bot.bot_id})` })),
	});
	if (prompter.isCancel(botAnswer)) {
		throw new InstallerDependencyFailure("project bind cancelled");
	}

	const groupAnswer = await prompter.select({
		message: "Select the group to bind:",
		options: registry.groups.map((group) => ({ value: group.group_id, label: `${group.title ?? group.group_id} (${group.group_id})` })),
	});
	if (prompter.isCancel(groupAnswer)) {
		throw new InstallerDependencyFailure("project bind cancelled");
	}

	const agentIdAnswer = await prompter.text({ message: "Agent id for this project's roster (e.g. @alice-agent):" });
	if (prompter.isCancel(agentIdAnswer)) {
		throw new InstallerDependencyFailure("project bind cancelled");
	}

	const toolAnswer = await prompter.multiselect({
		message: "Select which host tool configs to write:",
		options: TOOL_CONFIG_TARGETS.map((target) => ({ value: target.id, label: target.label })),
	});
	if (prompter.isCancel(toolAnswer)) {
		throw new InstallerDependencyFailure("project bind cancelled");
	}

	const botId = botAnswer as number;
	const agentId = agentIdAnswer as string;
	const selectedBot = registry.bots.find((bot) => bot.bot_id === botId);
	const roster: readonly ProjectRosterEntry[] = [{ agent_id: agentId, user_id: botId, username: selectedBot?.username ?? "" }];

	return {
		botId,
		groupId: groupAnswer as number,
		agentId,
		roster,
		selectedToolIds: new Set(toolAnswer as ToolId[]),
	};
}

/** Maps one {@link InstallerCliOutcome} to an exit code, reporting which sub-outcome occurred rather than swallowing it. */
function reportInstallerOutcome(io: CliIo, outcome: InstallerCliOutcome): number {
	switch (outcome.outcome) {
		case "refused":
			return usageError(io, `unknown installer invocation (${outcome.reason})`);
		case "setup":
			return reportSetupOutcome(io, outcome.result);
		case "bot-add":
			return reportBotAddOutcome(io, outcome.result);
		case "group-add":
			return reportGroupAddOutcome(io, outcome.result);
		case "project-bind":
			return reportProjectBindOutcome(io, outcome.result);
	}
}

function reportSetupOutcome(io: CliIo, result: SetupOutcome): number {
	if (result.outcome === "ledger-refused") {
		io.err(`${PRODUCT_NAME}: ledger refused (${result.reason}) at ${result.path}: found schema version ${result.foundVersion}`);
		return 1;
	}
	io.out(`setup completed (registry ${result.registryScaffolded ? "created" : "already present"}, autostart: ${result.autostart})`);
	return 0;
}

function reportBotAddOutcome(io: CliIo, result: BotAddOutcome): number {
	switch (result.outcome) {
		case "added":
			io.out(`bot added: ${result.username} (${result.bot_id})`);
			return 0;
		case "cancelled":
			io.err(`${PRODUCT_NAME}: bot add cancelled`);
			return 1;
		case "getMe-failed":
			io.err(`${PRODUCT_NAME}: ${result.message}`);
			return 1;
		case "registry-commit-failed":
			io.err(`${PRODUCT_NAME}: registry commit failed (${result.detail.outcome})`);
			return 1;
	}
}

function reportGroupAddOutcome(io: CliIo, result: GroupAddOutcome): number {
	switch (result.outcome) {
		case "added":
			io.out(`group added: ${result.group_id}`);
			return 0;
		case "group-already-bound":
			io.err(`${PRODUCT_NAME}: that group already has an active binding`);
			return 1;
		case "registry-commit-failed":
			io.err(`${PRODUCT_NAME}: registry commit failed (${result.detail.outcome})`);
			return 1;
	}
}

export function reportProjectBindOutcome(io: CliIo, result: ProjectBindOutcome): number {
	switch (result.outcome) {
		case "bound":
			io.out(`project bound: ${result.project_id}`);
			for (const [toolId, gitignoreResult] of result.gitignoreResults) {
				if (gitignoreResult.alreadyCovered) {
					continue;
				}
				if ("failed" in gitignoreResult) {
					io.err(`${PRODUCT_NAME}: could not update .gitignore for ${toolId}: ${gitignoreResult.reason}`);
					continue;
				}
				io.out(`${PRODUCT_NAME}: .gitignore updated (${toolId}): ${gitignoreResult.appendedLine}`);
			}
			return 0;
		case "invariant-violated":
			io.err(`${PRODUCT_NAME}: binding refused (${result.invariant})`);
			return 1;
		case "project-file-refused":
			io.err(`${PRODUCT_NAME}: conmuta.json write refused (${result.disagreements.length} disagreement(s))`);
			return 1;
		case "registry-commit-failed":
			io.err(`${PRODUCT_NAME}: registry commit failed (${result.detail.outcome})`);
			return 1;
	}
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
export function runCli(argv: readonly string[], io: CliIo): number | Promise<number> {
	const [command, ...rest] = argv;
	if (command === undefined) {
		return usageError(io);
	}

	if (command === "daemon") {
		const [subcommand, ...subArgs] = rest;
		if (subcommand === undefined) {
			return usageError(io);
		}
		if (subcommand !== "stop" && subcommand !== "start") {
			return usageError(io, `unknown daemon subcommand '${subcommand}'`);
		}

		if (subcommand === "start") {
			// Same Judgment Day correction as `mcp`/`migrate-v1` below: the gate is this branch's literal
			// first action. Disclosed choice (PR-13): `daemon stop` predates this gate requirement and is
			// left as-is here — retrofitting it is outside this PR's own scope (D-39/D-48).
			let belowNodeFloor = false;
			enforceNodeFloor({ stderr: io.err, exit: () => { belowNodeFloor = true; } });
			if (belowNodeFloor) {
				return EXIT_NODE_FLOOR;
			}
			if (subArgs.length > 0) {
				return usageError(io, `unexpected argument '${subArgs[0]}'`);
			}

			return (async () => {
				const { ensureDaemonRunning } = await import("../client/run-state.js");
				try {
					const payload = await ensureDaemonRunning();
					io.out(`daemon running (pid ${payload.pid})`);
					return 0;
				} catch (err) {
					io.err(err instanceof Error ? err.message : String(err));
					return 1;
				}
			})();
		}

		let explicitHome: string | undefined;
		for (let i = 0; i < subArgs.length; i++) {
			const arg = subArgs[i];
			if (arg === "--home") {
				if (i + 1 >= subArgs.length || subArgs[i + 1].startsWith("--")) {
					return usageError(io, "--home requires a directory");
				}
				explicitHome = subArgs[++i];
			} else if (arg.startsWith("--home=")) {
				explicitHome = arg.slice("--home=".length);
				if (explicitHome.length === 0) {
					return usageError(io, "--home requires a directory");
				}
			} else if (arg.startsWith("--")) {
				return usageError(io, `unknown option '${arg}'`);
			} else {
				return usageError(io, `unexpected argument '${arg}'`);
			}
		}

		return (async () => {
			const { stopDaemon } = await import("./daemon-stop.js");
			const result = await stopDaemon({ homeDir: explicitHome, io: { out: io.out, err: io.err } });
			return result.exitCode;
		})();
	}

	if (command === "panel") {
		// Same Judgment Day gate-ordering convention as `mcp`/`migrate-v1`/`setup` below (session 35): the
		// gate is this branch's literal first action for every verb introduced after PR-13's correction.
		let belowNodeFloor = false;
		enforceNodeFloor({ stderr: io.err, exit: () => { belowNodeFloor = true; } });
		if (belowNodeFloor) {
			return EXIT_NODE_FLOOR;
		}

		let explicitHome: string | undefined;
		for (let i = 0; i < rest.length; i++) {
			const arg = rest[i];
			if (arg === "--home") {
				if (i + 1 >= rest.length || rest[i + 1].startsWith("--")) {
					return usageError(io, "--home requires a directory");
				}
				explicitHome = rest[++i];
			} else if (arg.startsWith("--home=")) {
				explicitHome = arg.slice("--home=".length);
				if (explicitHome.length === 0) {
					return usageError(io, "--home requires a directory");
				}
			} else if (arg.startsWith("--")) {
				return usageError(io, `unknown option '${arg}'`);
			} else {
				return usageError(io, `unexpected argument '${arg}'`);
			}
		}

		return (async () => {
			const { runPanelCommand } = await import("./panel.js");
			const result = runPanelCommand({ homeDir: explicitHome, io: { out: io.out, err: io.err } });
			return result.exitCode;
		})();
	}

	if (command === "project" && rest[0] === "sync-roster") {
		// Same Judgment Day gate-ordering convention as `panel`/`mcp`/`migrate-v1`/`setup`: the gate is
		// this branch's literal first action. This is its own direct branch rather than a sub-verb of
		// `installer/cli.ts`'s own verb parser (which only knows `project bind`): that dispatcher is an
		// already-merged, multi-purpose file this PR's own scope (tasks.md PR-07) does not list, and its
		// `InstallerCliOutcome` union would need a new member reported through a new switch arm there —
		// invasive for a capability this PR alone authors. Mirrors `panel`'s own direct-branch shape.
		let belowNodeFloor = false;
		enforceNodeFloor({ stderr: io.err, exit: () => { belowNodeFloor = true; } });
		if (belowNodeFloor) {
			return EXIT_NODE_FLOOR;
		}

		let explicitHome: string | undefined;
		let targetDir: string | undefined;
		const subArgs = rest.slice(1);
		for (let i = 0; i < subArgs.length; i++) {
			const arg = subArgs[i];
			if (arg === "--home") {
				if (i + 1 >= subArgs.length || subArgs[i + 1].startsWith("--")) {
					return usageError(io, "--home requires a directory");
				}
				explicitHome = subArgs[++i];
			} else if (arg.startsWith("--home=")) {
				explicitHome = arg.slice("--home=".length);
				if (explicitHome.length === 0) {
					return usageError(io, "--home requires a directory");
				}
			} else if (arg.startsWith("--")) {
				return usageError(io, `unknown option '${arg}'`);
			} else if (targetDir === undefined) {
				targetDir = arg;
			} else {
				return usageError(io, `unexpected argument '${arg}'`);
			}
		}

		return (async () => {
			const { resolveHomeDir } = await import("../daemon/home.js");
			const { createPrompter } = await import("../installer/prompter.js");
			const homeDir = resolveHomeDir(explicitHome);
			const resolvedTargetDir = resolve(targetDir ?? process.cwd());
			try {
				const { db, registryPath } = await openInstallerLedgerOrFail(homeDir);
				const { runSyncRosterCommand } = await import("./project-sync-roster.js");
				const result = await runSyncRosterCommand({
					db,
					registryPath,
					targetDir: resolvedTargetDir,
					prompter: createPrompter(),
					io: { out: io.out, err: io.err },
				});
				return result.exitCode;
			} catch (err) {
				if (err instanceof InstallerDependencyFailure) {
					io.err(`${PRODUCT_NAME}: ${err.message}`);
					return 1;
				}
				throw err;
			}
		})();
	}

	if (command === "mcp") {
		// Judgment Day correction (session 35, both judges independently): the Node-floor gate must run
		// before anything else the `mcp` branch does, including argument parsing — design.md:418's
		// Startup row and D-25's "gate then dynamic import" apply to the whole dispatch, not just
		// `client/main.ts`'s own internal function. Reuses `daemon/node-floor.ts`'s already-tested
		// `enforceNodeFloor` (cli/main.ts's tsconfig references `daemon`, unlike `client/main.ts`'s own
		// boundary), injecting `exit` so a below-floor Node reports EXIT_NODE_FLOOR here instead of
		// `process.exit`ing directly — this dispatcher only ever returns exit codes.
		let belowNodeFloor = false;
		enforceNodeFloor({ stderr: io.err, exit: () => { belowNodeFloor = true; } });
		if (belowNodeFloor) {
			return EXIT_NODE_FLOOR;
		}

		let project: string | undefined;
		for (let i = 0; i < rest.length; i++) {
			const arg = rest[i];
			if (arg === "--project") {
				if (i + 1 >= rest.length || rest[i + 1].startsWith("--")) {
					return usageError(io, "--project requires a value");
				}
				project = rest[++i];
			} else if (arg.startsWith("--project=")) {
				project = arg.slice("--project=".length);
				if (project.length === 0) {
					return usageError(io, "--project requires a value");
				}
			} else if (arg.startsWith("--")) {
				return usageError(io, `unknown option '${arg}'`);
			} else {
				return usageError(io, `unexpected argument '${arg}'`);
			}
		}
		if (project === undefined) {
			return usageError(io, "mcp requires --project <id>");
		}

		return (async () => {
			const { runMcpClient } = await import("../client/main.js");
			return await runMcpClient({ project, stderr: io.err });
		})();
	}

	if (command === "migrate-v1") {
		// Same Judgment Day correction as the `mcp` branch above, and the same reason: the gate must run
		// before this branch's own flag parsing, not after.
		let belowNodeFloor = false;
		enforceNodeFloor({ stderr: io.err, exit: () => { belowNodeFloor = true; } });
		if (belowNodeFloor) {
			return EXIT_NODE_FLOOR;
		}

		let v1Home: string | undefined;
		let projectId: string | undefined;
		let projectPath: string | undefined;
		let tokenStdin = false;
		let dryRun = false;
		for (let i = 0; i < rest.length; i++) {
			const arg = rest[i];
			if (arg === "--v1-home") {
				if (i + 1 >= rest.length || rest[i + 1].startsWith("--")) {
					return usageError(io, "--v1-home requires a directory");
				}
				v1Home = rest[++i];
			} else if (arg.startsWith("--v1-home=")) {
				v1Home = arg.slice("--v1-home=".length);
				if (v1Home.length === 0) {
					return usageError(io, "--v1-home requires a directory");
				}
			} else if (arg === "--project-id") {
				if (i + 1 >= rest.length || rest[i + 1].startsWith("--")) {
					return usageError(io, "--project-id requires a value");
				}
				projectId = rest[++i];
			} else if (arg.startsWith("--project-id=")) {
				projectId = arg.slice("--project-id=".length);
				if (projectId.length === 0) {
					return usageError(io, "--project-id requires a value");
				}
			} else if (arg === "--project-path") {
				if (i + 1 >= rest.length || rest[i + 1].startsWith("--")) {
					return usageError(io, "--project-path requires a value");
				}
				projectPath = rest[++i];
			} else if (arg.startsWith("--project-path=")) {
				projectPath = arg.slice("--project-path=".length);
				if (projectPath.length === 0) {
					return usageError(io, "--project-path requires a value");
				}
			} else if (arg === "--token-stdin") {
				tokenStdin = true;
			} else if (arg === "--dry-run") {
				dryRun = true;
			} else if (arg.startsWith("--")) {
				return usageError(io, `unknown option '${arg}'`);
			} else {
				return usageError(io, `unexpected argument '${arg}'`);
			}
		}
		if ((projectId === undefined) !== (projectPath === undefined)) {
			return usageError(io, "--project-id and --project-path must be given together");
		}
		if (projectPath !== undefined && !isAbsolute(projectPath)) {
			return usageError(io, "--project-path must be an absolute path");
		}

		return (async () => {
			const { runMigration } = await import("../migration/main.js");
			const result = await runMigration({
				v1Home,
				projectId,
				projectPath,
				tokenStdin,
				dryRun,
				stdout: io.out,
				stderr: io.err,
				readStdinToken: io.readStdin,
			});
			return result.exitCode;
		})();
	}

	// `setup | bot add | group add | project bind <path>` dispatch through the installer's own verb
	// parser (`installer/cli.ts`'s `runInstallerCli`), which this branch hands real, closed-over
	// dependencies (a real `Prompter`, an opened ledger connection, the registry path). `doctor` is the
	// fifth verb tasks.md's own PR-13 task text names, but it is deliberately left unwired here:
	// `src/doctor/main.ts` does not exist yet (Unit 8, a later PR) — see the "Only ..." comment below.
	if (command === "setup" || command === "bot" || command === "group" || command === "project") {
		// Same Judgment Day correction as `mcp`/`migrate-v1`: the gate is this branch's literal first
		// action, before this dispatcher even looks at `rest` — `installer/cli.ts` does its own verb/argv
		// parsing once this branch calls it, so there is no separate flag-parsing step of this file's own
		// to gate ahead of.
		let belowNodeFloor = false;
		enforceNodeFloor({ stderr: io.err, exit: () => { belowNodeFloor = true; } });
		if (belowNodeFloor) {
			return EXIT_NODE_FLOOR;
		}

		return (async () => {
			const { resolveHomeDir } = await import("../daemon/home.js");
			const { createPrompter } = await import("../installer/prompter.js");
			const { runInstallerCli } = await import("../installer/cli.js");
			const { runSetup } = await import("../installer/wizards/setup.js");

			const homeDir = resolveHomeDir();
			const prompter = createPrompter();

			const deps: InstallerCliDeps = {
				setup: () => runSetup({ homeDir, prompter }),
				botAdd: async () => {
					const { db, registryPath } = await openInstallerLedgerOrFail(homeDir);
					const { runBotAdd } = await import("../installer/wizards/bot-add.js");
					return runBotAdd({ db, registryPath, homeDir, prompter });
				},
				groupAdd: async () => {
					const { db, registryPath } = await openInstallerLedgerOrFail(homeDir);
					const { groupId, title } = await collectGroupAddInputs(prompter);
					const { runGroupAdd } = await import("../installer/wizards/group-add.js");
					return runGroupAdd({ db, registryPath, groupId, title });
				},
				projectBind: async (targetDir) => {
					const { db, registryPath } = await openInstallerLedgerOrFail(homeDir);
					const inputs = await collectProjectBindInputs(prompter, registryPath);
					const { runProjectBind } = await import("../installer/wizards/project-bind.js");
					return runProjectBind({ db, registryPath, targetDir, ...inputs });
				},
			};

			try {
				const outcome = await runInstallerCli(argv, deps);
				return reportInstallerOutcome(io, outcome);
			} catch (err) {
				if (err instanceof InstallerDependencyFailure) {
					io.err(`${PRODUCT_NAME}: ${err.message}`);
					return 1;
				}
				throw err;
			}
		})();
	}

	// `validate`, `daemon start`/`stop`, `setup`, `bot add`, `group add`, `project bind`, `mcp` and
	// `migrate-v1` are wired in this CLI slice. `doctor` is deliberately NOT wired: `doctor/main.ts`
	// does not exist yet (Unit 8, a later PR — see tasks.md's own PR-13 scope note). Any other
	// subcommand is named so a caller that tries one gets a usage error instead of a stub that
	// pretends to work.
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
	process.exitCode = await runCli(process.argv.slice(2), createProcessIo());
}
