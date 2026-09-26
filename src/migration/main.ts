import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { resolveHomeDir } from "../daemon/home.js";
import { isNodeAtOrAboveFloor } from "../daemon/node-floor.js";
import { openLedger, type LedgerOpenOptions } from "../ledger/open.js";
import { writeThreadRecord } from "../ledger/threads.js";
import { withTransaction } from "../ledger/transaction.js";
import { parseRegistryText } from "../registry/loader.js";
import { parseRegistryDocument, type Registry, type RegistryProblem, type RegistryTokenRef } from "../registry/schema.js";
import { selectSecretStore, type SecretStoreSelection } from "../secret-store/index.js";
import {
	EXIT_MIGRATION_REFUSED,
	EXIT_NODE_FLOOR,
	NODE_FLOOR,
	POSIX_PRIVATE_FILE_MODE,
	PRODUCT_NAME,
	PROJECT_FILE_NAME,
	PROJECT_FILE_SCHEMA_VERSION,
	REGISTRY_VERSION,
} from "../shared/constants.js";
import type { ProjectFile } from "../shared/project-file.js";
import { synthesizeMigration, type SynthesizedBindingState, type SynthesizedMigration, type SynthesizedOffset } from "./synthesize.js";
import { loadV1Config, resolveV1AgentBusHome, type V1ConfigRefusal } from "./v1-config.js";
import { loadV1State, type V1StateRefusal } from "./v1-state.js";

/**
 * The v1-to-v2 migration CLI's entry point (`migration/main.ts`, design §13): the full non-interactive
 * flow behind `conmuta migrate-v1`, exported as one testable async function.
 *
 * Mirrors `client/main.ts`'s `runMcpClient` shape: an options object with injectable collaborators,
 * a returned exit code, never `process.exit`. `src/cli/main.ts` owns the real process entry point and
 * argv parsing for the `migrate-v1` subcommand (mirroring its own `mcp` branch) and performs the same
 * outer Node-floor gate *before* its dynamic import of this module; the gate below is this function's
 * own defense for a caller that reaches it directly, matching design §13 step 1 being part of the
 * flow itself. Unlike `client/main.ts`, this module's `tsconfig.json` can and does reference
 * `../daemon`, so the floor check is reused rather than re-implemented.
 *
 * No `Provenance:` header: v1 (`telegram-agent-bus`) has no standalone migration tool, so there is
 * nothing to pin against — the same treatment `client/main.ts` and `ledger/open.ts` already document.
 *
 * **Design decisions this module makes that design §13 leaves to the implementation, disclosed:**
 *
 * - **The secret-store probe runs even under `--dry-run`.** `selectSecretStore`'s round trip only
 *   ever touches a self-cleaning `__probe__` entry (`secret-store/index.ts`) — never the bot's real
 *   token — so running it is what lets a dry run report *which* store would hold the token, honestly.
 *   Only the mutating `store.set(botId, token)` call is skipped under `--dry-run`; every test that
 *   exercises this module injects a fake `selectSecretStoreImpl`, so the real OS keychain is never
 *   touched by the suite either way.
 * - **"Already migrated" is `existingRegistry.bots` holding this exact `bot_id` AND a same-day backup
 *   existing (design §13 step 4).** When the registry holds the bot but no matching backup exists,
 *   this is treated as a genuine conflict (a stale or hand-edited registry) and refused, rather than
 *   silently duplicated — `bots[]`/`groups[]` carry no uniqueness constraint of their own the way
 *   `registry/invariants.ts`'s R1–R3 constrain bindings, so a blind re-append would corrupt the file.
 * - **A second migration into a v2 home that already holds a registry is a merge, not an overwrite.**
 *   `registry.json` is validated (`registry/loader.ts`'s `parseRegistryText`, R5 included) and its
 *   arrays are extended with this migration's own bot/group/project/binding, then the *whole* merged
 *   document is re-validated (`registry/schema.ts`'s `parseRegistryDocument`, R1–R3 included) before
 *   anything is written — this is the first real-world producer of this file (no precedent exists),
 *   and re-validating the merged whole is what catches an invariant violation the append itself cannot
 *   see (e.g. two active bindings on one `bot_id`).
 * - **`registry.json` is written with a plain `writeFileSync`, not atomically.** This is a one-shot,
 *   non-interactive CLI tool with no concurrent writer (R6: every registry change is a human action,
 *   and this run *is* that action) — unlike `secret-store/file-fallback.ts`'s token file, which is
 *   read by a live daemon.
 * - **`token_ref.account`/`.path` mirror two private constants this module cannot import.**
 *   `secret-store/keyring.ts`'s `ACCOUNT_PREFIX` and `secret-store/file-fallback.ts`'s directory/suffix
 *   are not exported (design §12 marks both PRs already audited and merged), so the values are
 *   reproduced locally as named constants below rather than re-exporting from an already-shipped unit.
 * - **A migrated thread's `threads.updated_at` is stamped with the migration instant**, not backdated:
 *   v1 carried no separate "thread last written" timestamp distinct from the fields already copied
 *   into the record itself.
 */

/** Mirrors `secret-store/keyring.ts`'s own private `ACCOUNT_PREFIX` ("bot:"), which that module does not export. */
const REGISTRY_TOKEN_ACCOUNT_PREFIX = "bot:";

/** Mirrors `secret-store/file-fallback.ts`'s own private directory name, which that module does not export. */
const FALLBACK_SECRETS_DIR_NAME = "secrets";

/** Mirrors `secret-store/file-fallback.ts`'s own private token-file suffix, which that module does not export. */
const FALLBACK_TOKEN_SUFFIX = ".token";

/** The registry file's name under the v2 home (`~/.conmuta/registry.json`, DATA-MODEL §2). No exported constant exists for it (`daemon/bootstrap.ts` uses the same literal). */
const REGISTRY_FILE_NAME = "registry.json";

/** Backup suffix, before the `YYYYMMDD` date (design §13 step 4: `config.json.bak-pre-v2-<YYYYMMDD>`). */
const BACKUP_SUFFIX_PREFIX = ".bak-pre-v2-";

/** Width each `YYYYMMDD` component is zero-padded to. */
const BACKUP_DATE_COMPONENT_WIDTH = 2;

/** One line's worth of log prefix, shared by every message this module emits. */
const LOG_PREFIX = `${PRODUCT_NAME} migrate-v1`;

export interface RunMigrationOptions {
	/** v1's home; defaults to `resolveV1AgentBusHome(env)` (an explicit `AGENTBUS_HOME`, else `~/.agentbus`). */
	readonly v1Home?: string;
	/** v2's home; defaults to `resolveHomeDir()` (`~/.conmuta`). Never exposed as a CLI flag — design §13 names none. */
	readonly v2Home?: string;
	/** The project to bind (D-23); both this and {@link projectPath} or neither. */
	readonly projectId?: string;
	/** The project path to bind (D-23); both this and {@link projectId} or neither. */
	readonly projectPath?: string;
	/** Read the token from stdin when `config.bot_token` is absent (D-24). */
	readonly tokenStdin?: boolean;
	/** Run every check identically but skip every write. */
	readonly dryRun?: boolean;
	/** Defaults to `process.env`; only consulted by {@link resolveV1AgentBusHome} when {@link v1Home} is absent. */
	readonly env?: NodeJS.ProcessEnv;
	readonly stdout?: (line: string) => void;
	readonly stderr?: (line: string) => void;
	/** Reads the token from stdin; defaults to a synchronous `readFileSync(0, "utf8")`. Injected so no test touches real stdin. */
	readonly readStdinToken?: () => string;
	/** The wall clock; defaults to `() => new Date()`. Injected for deterministic backup dates and timestamps. */
	readonly now?: () => Date;
	readonly nodeVersion?: string;
	readonly loadV1ConfigImpl?: typeof loadV1Config;
	readonly loadV1StateImpl?: typeof loadV1State;
	/** Defaults to the real `selectSecretStore`; injected so no test touches the real OS keychain. */
	readonly selectSecretStoreImpl?: (v2Home: string) => Promise<SecretStoreSelection>;
	readonly openLedgerImpl?: (options: LedgerOpenOptions) => ReturnType<typeof openLedger>;
}

export interface RunMigrationResult {
	readonly exitCode: number;
}

/** `YYYYMMDD` in UTC — the calendar date, not the local one, so two machines in different zones agree. */
function formatBackupDate(date: Date): string {
	const year = String(date.getUTCFullYear());
	const month = String(date.getUTCMonth() + 1).padStart(BACKUP_DATE_COMPONENT_WIDTH, "0");
	const day = String(date.getUTCDate()).padStart(BACKUP_DATE_COMPONENT_WIDTH, "0");
	return `${year}${month}${day}`;
}

function describeConfigRefusal(refusal: V1ConfigRefusal): string {
	switch (refusal.kind) {
		case "unreadable":
			return "v1 config.json could not be read";
		case "invalid_json":
			return "v1 config.json is not valid JSON";
		case "schema_invalid":
			return "v1 config.json does not match the expected schema";
	}
}

function describeStateRefusal(refusal: V1StateRefusal): string {
	switch (refusal.kind) {
		case "unreadable":
			return "v1 state.json could not be read";
		case "invalid_json":
			return "v1 state.json is not valid JSON";
		case "not_object":
			return "v1 state.json is not a JSON object";
		case "future_version":
			return `v1 state.json declares a future state_version (${refusal.found})`;
		case "schema_invalid":
			return "v1 state.json does not match the expected schema after migration";
	}
}

/** Reads and validates `~/.conmuta/registry.json`, when it exists. A missing file is not a refusal. */
function readExistingRegistry(
	registryPath: string,
): { readonly ok: true; readonly registry: Registry | undefined } | { readonly ok: false; readonly problems: readonly RegistryProblem[] } {
	if (!existsSync(registryPath)) {
		return { ok: true, registry: undefined };
	}
	const parsed = parseRegistryText(readFileSync(registryPath, "utf8"));
	if (!parsed.ok) {
		return { ok: false, problems: parsed.problems };
	}
	return { ok: true, registry: parsed.registry };
}

/** Appends one migration's synthesized arrays onto an existing registry (or an empty one). */
function mergeRegistry(existing: Registry | undefined, addition: SynthesizedMigration): Registry {
	return {
		registry_version: REGISTRY_VERSION,
		bots: [...(existing?.bots ?? []), ...addition.bots],
		groups: [...(existing?.groups ?? []), ...addition.groups],
		projects: [...(existing?.projects ?? []), ...addition.projects],
		bindings: [...(existing?.bindings ?? []), ...addition.bindings],
	};
}

function writeOffsetRow(db: DatabaseSync, offset: SynthesizedOffset): void {
	db.prepare(
		`INSERT INTO offsets (bot_id, next_update_id) VALUES (?, ?)
		 ON CONFLICT (bot_id) DO UPDATE SET next_update_id = excluded.next_update_id`,
	).run(offset.bot_id, offset.next_update_id);
}

function writeBindingStateRow(db: DatabaseSync, bindingState: SynthesizedBindingState): void {
	db.prepare(
		`INSERT INTO binding_state (project_id, last_checkpoint_at, last_checkpoint_by) VALUES (?, ?, ?)
		 ON CONFLICT (project_id) DO UPDATE SET
		   last_checkpoint_at = excluded.last_checkpoint_at, last_checkpoint_by = excluded.last_checkpoint_by`,
	).run(bindingState.project_id, bindingState.last_checkpoint_at, bindingState.last_checkpoint_by);
}

function printProposedProjectFile(out: (line: string) => void, projectPath: string, synthesized: SynthesizedMigration): void {
	const binding = synthesized.bindings[0];
	if (binding === undefined) {
		return;
	}
	const proposed: ProjectFile = {
		schema_version: PROJECT_FILE_SCHEMA_VERSION,
		project_id: binding.project_id,
		group_id: binding.group_id,
		roster: binding.roster_snapshot,
	};
	out(`${LOG_PREFIX}: proposed ${PROJECT_FILE_NAME} for ${projectPath} (commit this yourself; this tool never writes into a repository):`);
	out(JSON.stringify(proposed, null, 2));
}

export async function runMigration(options: RunMigrationOptions = {}): Promise<RunMigrationResult> {
	const out = options.stdout ?? ((line: string) => { process.stdout.write(`${line}\n`); });
	const err = options.stderr ?? ((line: string) => { process.stderr.write(`${line}\n`); });

	const nodeVersion = options.nodeVersion ?? process.version;
	if (!isNodeAtOrAboveFloor(nodeVersion)) {
		err(`Node.js ${NODE_FLOOR} or higher is required (found ${nodeVersion}). Please download and install a supported version from https://nodejs.org/`);
		return { exitCode: EXIT_NODE_FLOOR };
	}

	if ((options.projectId !== undefined) !== (options.projectPath !== undefined)) {
		err(`${LOG_PREFIX}: --project-id and --project-path must be given together`);
		return { exitCode: EXIT_MIGRATION_REFUSED };
	}

	const loadConfig = options.loadV1ConfigImpl ?? loadV1Config;
	const loadState = options.loadV1StateImpl ?? loadV1State;
	const selectStore = options.selectSecretStoreImpl ?? ((homeDir: string) => selectSecretStore(homeDir));
	const openLedgerFn = options.openLedgerImpl ?? openLedger;
	const now = options.now ?? (() => new Date());
	const dryRun = options.dryRun ?? false;

	const v1Home = options.v1Home ?? resolveV1AgentBusHome(options.env ?? process.env);
	const v2Home = resolveHomeDir(options.v2Home);

	// --- Step 1: read config.json and state.json read-only (design §13). Nothing is renamed or written. ---
	const configResult = loadConfig(v1Home);
	if (!configResult.ok) {
		err(`${LOG_PREFIX}: ${describeConfigRefusal(configResult.refusal)}`);
		return { exitCode: EXIT_MIGRATION_REFUSED };
	}
	const config = configResult.config;

	const stateResult = loadState(v1Home, config.roster);
	if (!stateResult.ok) {
		err(`${LOG_PREFIX}: ${describeStateRefusal(stateResult.refusal)}`);
		return { exitCode: EXIT_MIGRATION_REFUSED };
	}
	const state = stateResult.state;

	// --- Step 2: token. config.bot_token, else stdin under --token-stdin. Never argv, never env (D-24). ---
	let token = config.bot_token;
	if (token === undefined && options.tokenStdin === true) {
		const readStdin = options.readStdinToken ?? (() => readFileSync(0, "utf8"));
		const fromStdin = readStdin().trim();
		if (fromStdin.length > 0) {
			token = fromStdin;
		}
	}
	if (token === undefined) {
		err(`${LOG_PREFIX}: no bot token available (v1 config.json has no bot_token, and --token-stdin was not given or produced nothing)`);
		return { exitCode: EXIT_MIGRATION_REFUSED };
	}

	// --- Step 3: bot_id = config.roster[config.agent_id].user_id; refuse if absent. ---
	const botId = config.roster[config.agent_id]?.user_id;
	if (botId === undefined) {
		err(`${LOG_PREFIX}: agent_id '${config.agent_id}' is not present in its own roster`);
		return { exitCode: EXIT_MIGRATION_REFUSED };
	}

	const project =
		options.projectId !== undefined && options.projectPath !== undefined
			? { projectId: options.projectId, projectPath: options.projectPath }
			: undefined;

	const registryPath = join(v2Home, REGISTRY_FILE_NAME);
	const existingRegistryResult = readExistingRegistry(registryPath);
	if (!existingRegistryResult.ok) {
		err(
			`${LOG_PREFIX}: the existing v2 registry at ${registryPath} could not be validated (${existingRegistryResult.problems.length} problem(s)); refusing rather than merge into it`,
		);
		return { exitCode: EXIT_MIGRATION_REFUSED };
	}
	const existingRegistry = existingRegistryResult.registry;
	const alreadyRegistered = existingRegistry?.bots.some((bot) => bot.bot_id === botId) ?? false;

	// --- Step 4: backups, and the "already migrated" shortcut (design §13 step 4). ---
	const nowDate = now();
	const backupDate = formatBackupDate(nowDate);
	const v1ConfigPath = join(v1Home, "config.json");
	const v1StatePath = join(v1Home, "state.json");
	const configBackupPath = join(v1Home, `config.json${BACKUP_SUFFIX_PREFIX}${backupDate}`);
	const stateBackupPath = join(v1Home, `state.json${BACKUP_SUFFIX_PREFIX}${backupDate}`);
	const stateFileExists = existsSync(v1StatePath);
	const backupExists = existsSync(configBackupPath) && (!stateFileExists || existsSync(stateBackupPath));

	if (backupExists && alreadyRegistered) {
		out(`${LOG_PREFIX}: bot ${botId} was already migrated on ${backupDate}; nothing to do`);
		return { exitCode: 0 };
	}
	if (alreadyRegistered) {
		err(
			`${LOG_PREFIX}: bot ${botId} is already present in the v2 registry at ${registryPath}, but no matching ${backupDate} backup was found; refusing rather than risk a duplicate entry`,
		);
		return { exitCode: EXIT_MIGRATION_REFUSED };
	}

	// --- Secret-store selection: probe-safe (see module doc), so it runs on every path including --dry-run. ---
	const selection = await selectStore(v2Home);
	const tokenRef: RegistryTokenRef =
		selection.store.kind === "keychain"
			? { store: "keychain", account: `${REGISTRY_TOKEN_ACCOUNT_PREFIX}${botId}` }
			: { store: "file", path: join(v2Home, FALLBACK_SECRETS_DIR_NAME, `${botId}${FALLBACK_TOKEN_SUFFIX}`) };

	// --- Step 5: synthesize, merge, and validate before writing anything. ---
	const nowIso = nowDate.toISOString();
	const synthesized = synthesizeMigration({ config, state, botId, tokenRef, nowIso, project });
	const mergedRegistry = mergeRegistry(existingRegistry, synthesized);
	const validated = parseRegistryDocument(mergedRegistry);
	if (!validated.ok) {
		err(`${LOG_PREFIX}: the synthesized registry failed validation (${validated.problems.length} problem(s)); refusing to write`);
		return { exitCode: EXIT_MIGRATION_REFUSED };
	}

	if (dryRun) {
		out(`${LOG_PREFIX}: dry run — no files were written`);
		out(`${LOG_PREFIX}: would back up ${v1ConfigPath} and ${stateFileExists ? v1StatePath : "(no state.json to back up)"}`);
		out(`${LOG_PREFIX}: would write registry ${registryPath}`);
		out(`${LOG_PREFIX}: would store the token for bot ${botId} under the ${selection.store.kind} store`);
		out(
			`${LOG_PREFIX}: would write ${v2Home}'s ledger: 1 offset row, ${synthesized.threads.length} thread row(s)${synthesized.bindingState !== undefined ? ", 1 binding_state row" : ""}`,
		);
		if (project !== undefined) {
			printProposedProjectFile(out, project.projectPath, synthesized);
		}
		return { exitCode: 0 };
	}

	// --- Real writes: backups, token, then the ledger, then the registry LAST.
	// The registry write is deliberately last, not "registry then ledger" as design §13's prose
	// lists them (that prose describes step 5's *content*, not a write order): `alreadyRegistered`
	// above is the retry/idempotency check, and it reads the registry alone. Every ledger writer
	// this function calls (`writeOffsetRow`, `writeThreadRecord`, `writeBindingStateRow`) is an
	// `ON CONFLICT ... DO UPDATE` upsert, so re-running the ledger write on a retry is always safe.
	// Writing the registry last means a crash at any point before it completes leaves
	// `alreadyRegistered` false, so a retry redoes the (idempotent) work instead of silently
	// reporting "nothing to do" over a half-migrated ledger. ---
	copyFileSync(v1ConfigPath, configBackupPath);
	if (stateFileExists) {
		copyFileSync(v1StatePath, stateBackupPath);
	}

	await selection.store.set(String(botId), token);

	const ledgerResult = openLedgerFn({ homeDir: v2Home, now: () => nowDate.getTime() });
	try {
		withTransaction(ledgerResult.db, () => {
			writeOffsetRow(ledgerResult.db, synthesized.offset);
			for (const thread of synthesized.threads) {
				writeThreadRecord(ledgerResult.db, {
					project_id: thread.project_id,
					thread_id: thread.thread_id,
					record: thread.record,
					updated_at: nowIso,
				});
			}
			if (synthesized.bindingState !== undefined) {
				writeBindingStateRow(ledgerResult.db, synthesized.bindingState);
			}
		});
	} finally {
		ledgerResult.db.close();
	}

	writeFileSync(registryPath, `${JSON.stringify(validated.registry, null, 2)}\n`, { encoding: "utf8", mode: POSIX_PRIVATE_FILE_MODE });

	out(`${LOG_PREFIX}: migrated bot ${botId} into ${v2Home}`);
	if (project !== undefined) {
		printProposedProjectFile(out, project.projectPath, synthesized);
	}
	return { exitCode: 0 };
}
