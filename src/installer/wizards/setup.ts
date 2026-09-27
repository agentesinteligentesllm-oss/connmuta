import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { ensureHomeDirs, resolveHomeDir } from "../../daemon/home.js";
import type { Registry } from "../../registry/schema.js";
import { serializeRegistry } from "../../registry/writer.js";
import { REGISTRY_VERSION } from "../../shared/constants.js";
import { hardenHomeAcl } from "../acl.js";
import {
	disableAutostart,
	enableAutostart,
	type AutostartOptions,
	type AutostartRemoveOutcome,
	type AutostartWriteOutcome,
} from "../autostart.js";
import type { ExecFileImpl } from "../exec.js";
import { openInstallerLedger, type InstallerLedgerRefusalReason } from "../ledger-access.js";
import type { Prompter } from "../prompter.js";

/**
 * The `setup` wizard (`installer/wizards/setup.ts`, design.md §8.2 "setup" row, spec.md:40-59 and
 * :145-172; tasks.md PR-12 sub-task 12.1/12.2).
 *
 * Flow: `ensureHomeDirs` → write-if-absent empty `registry.json` → `openInstallerLedger` →
 * `hardenHomeAcl` → the start-at-login checkbox (§10) → the offline doctor hook, last.
 *
 * **This module never imports `src/doctor/`.** `doctor` is a later SDD unit and design's own compile-
 * unit table (§2.2) has `doctor` depend on `installer`, never the reverse — an import back would be a
 * circular project reference. Instead this wizard takes an injectable `runDoctor` hook and calls it as
 * its own last step; production wiring (a later `cli/main.ts` slice) injects the real doctor runner,
 * and no caller injects anything today (ratified `bus-v2-f2-pr-12-offline-doctor-sequencing-001`).
 *
 * **Disclosed deviation from design.md §8.2's literal step order.** The table lists the registry
 * scaffold before the ledger step; that order cannot append a `REGISTRY_CREATED` audit row for the
 * scaffold, because no ledger connection exists yet at that point. Task 12.1's own RED pins only
 * "scaffolds an empty registry" and "a re-run makes no write" — neither requires an audit row — so
 * this implementation keeps the design's literal order and the scaffold step writes no audit row at
 * all, rather than reordering the flow to manufacture one.
 *
 * **Disclosed deviation on `hardenHomeAcl`'s own "Windows only" note above.** `installer/acl.ts`'s
 * `hardenHomeAcl` already branches on `process.platform` internally (POSIX takes a `chmodSync` branch),
 * so this wizard calls it unconditionally rather than guarding by platform itself.
 *
 * **Interactive chaining into `bot add`/`group add`/`project bind` is out of this slice's tested
 * scope**: tasks.md 12.1's RED covers the scaffold, the re-run and the checkbox forwarding only. This
 * function returns a structured {@link SetupOutcome} a later CLI layer (`installer/cli.ts`) can use to
 * decide whether to chain further, rather than chaining inline here.
 */

export interface RunSetupOptions {
	/** The daemon home; `~/.conmuta` in production, a temp directory in tests. */
	readonly homeDir?: string;
	/** The wizard's sole prompting port (D-38); never `@clack/prompts` directly. */
	readonly prompter: Prompter;
	/** Overridable for tests; defaults to the real `installer/exec.ts` icacls runner (Windows only). */
	readonly execImpl?: ExecFileImpl;
	/** Overridable for tests; defaults to the real Run key / LaunchAgents directory. */
	readonly autostartOptions?: AutostartOptions;
	/** Overridable for tests; defaults to `() => new Date()`. */
	readonly now?: () => Date;
	/** Called last, once, when supplied; production wiring injects the real doctor runner (see module doc). */
	readonly runDoctor?: () => Promise<void> | void;
}

/** What the start-at-login checkbox resolved to; `"unsupported-platform"` is this wizard's own no-op for a platform `autostart.ts` does not support. */
export type SetupAutostartOutcome = AutostartWriteOutcome | AutostartRemoveOutcome | "cancelled" | "unsupported-platform";

/** What {@link runSetup} decided. */
export type SetupOutcome =
	| {
			readonly outcome: "completed";
			readonly homeDir: string;
			readonly registryPath: string;
			readonly registryScaffolded: boolean;
			readonly db: DatabaseSync;
			readonly autostart: SetupAutostartOutcome;
	  }
	| {
			readonly outcome: "ledger-refused";
			readonly reason: InstallerLedgerRefusalReason;
			readonly path: string;
			readonly foundVersion: number;
	  };

function isEexist(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "EEXIST";
}

/** Write-if-absent an empty, schema-valid `registry.json`; never overwrites an existing document (spec.md:53-57). */
function scaffoldRegistryIfAbsent(registryPath: string): boolean {
	const empty: Registry = { registry_version: REGISTRY_VERSION, bots: [], groups: [], projects: [], bindings: [] };
	try {
		writeFileSync(registryPath, serializeRegistry(empty), { encoding: "utf8", flag: "wx" });
		return true;
	} catch (error) {
		if (isEexist(error)) {
			return false;
		}
		throw error;
	}
}

/**
 * Applies the start-at-login checkbox answer, forwarded to `installer/autostart.ts` unmodified
 * (tasks.md 12.1). Disclosed no-op on a platform `autostart.ts` itself does not support (neither
 * Windows nor macOS): its own `enableAutostart`/`disableAutostart` throw there, and this wizard must
 * not crash a CI leg or a host with no autostart mechanism in this design (D-40 covers only the two).
 */
function applyAutostartAnswer(answer: boolean, autostartOptions: AutostartOptions | undefined): SetupAutostartOutcome {
	if (process.platform !== "win32" && process.platform !== "darwin") {
		return "unsupported-platform";
	}
	return answer ? enableAutostart(autostartOptions) : disableAutostart(autostartOptions);
}

/** Runs `setup` (spec.md:40-59, :145-172): home + registry scaffold, ledger, ACL, autostart, then the doctor hook. */
export async function runSetup(options: RunSetupOptions): Promise<SetupOutcome> {
	const homeDir = resolveHomeDir(options.homeDir);
	ensureHomeDirs(homeDir);

	const registryPath = join(homeDir, "registry.json");
	const registryScaffolded = scaffoldRegistryIfAbsent(registryPath);

	const ledgerResult = openInstallerLedger({ homeDir });
	if (ledgerResult.status === "refused") {
		return { outcome: "ledger-refused", reason: ledgerResult.reason, path: ledgerResult.path, foundVersion: ledgerResult.foundVersion };
	}

	hardenHomeAcl({ homeDir, execImpl: options.execImpl });

	const startAtLoginAnswer = await options.prompter.confirm({
		message: "Start conmuta automatically when you log in?",
		initialValue: false,
	});
	// A cancelled prompt carries no human decision to act on; any existing entry is left exactly as
	// it was, matching every other cancel path in this codebase (never a silent enable or disable).
	const autostart = options.prompter.isCancel(startAtLoginAnswer)
		? "cancelled"
		: applyAutostartAnswer(startAtLoginAnswer as boolean, options.autostartOptions);

	await options.runDoctor?.();

	return { outcome: "completed", homeDir, registryPath, registryScaffolded, db: ledgerResult.db, autostart };
}
