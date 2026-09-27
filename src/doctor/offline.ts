import { runSystemChecks, type Finding, type RunSystemChecksOptions } from "./checks/system.js";

/**
 * The offline doctor tier (`doctor/offline.ts`, design.md §9.1; tasks.md 14.3/14.4).
 *
 * Wires `checks/system.ts` (this PR); PR-15's `checks/registry.ts` joins here next, at the marked
 * seam below, still offline and zero-network.
 *
 * **Zero-network pin, the code-level half (design.md §9.1's static half is Unit 11's job, a later
 * PR's `test/security/installer-bundle.test.ts`).** This module's own closure is: `./checks/system.js`,
 * which itself reaches only `node:fs`, `node:os`, `node:path`, `node:sqlite`,
 * `daemon/lifecycle/lock.js`, `daemon/node-floor.js`, `installer/exec.js`, `installer/launcher.js`,
 * `ledger/open.js` (its `LEDGER_FILE_NAME` constant only) and `shared/constants.js` — none of which
 * import `daemon/telegram.js`, `node:http`, `node:https`, or call a bare `fetch(`.
 */

/** What {@link runOfflineDoctor} needs; identical to {@link RunSystemChecksOptions} today. */
export type RunOfflineDoctorOptions = RunSystemChecksOptions;

/** Runs every offline tier, in order, and returns their findings together. */
export function runOfflineDoctor(options: RunOfflineDoctorOptions): Finding[] {
	const findings: Finding[] = [...runSystemChecks(options)];
	// Seam for PR-15: `runRegistryChecks(options)` from `checks/registry.ts` joins here next.
	return findings;
}

export type { Finding };
