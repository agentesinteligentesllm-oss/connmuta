import { runSystemChecks, type Finding, type RunSystemChecksOptions } from "./checks/system.js";
import { runRegistryChecks } from "./checks/registry.js";

/**
 * The offline doctor tier (`doctor/offline.ts`, design.md §9.1; tasks.md 14.3/14.4, 15.3, closing Unit 8).
 *
 * Wires `checks/system.ts` and `checks/registry.ts`, in that order, still offline and zero-network.
 *
 * **Zero-network pin, the code-level half (design.md §9.1's static half is Unit 11's job, a later
 * PR's `test/security/installer-bundle.test.ts`).** This module's own closure is: `./checks/system.js`
 * and `./checks/registry.js`, neither of which imports `daemon/telegram.js`, `node:http`, `node:https`,
 * or calls a bare `fetch(` (independently grepped clean by both PR-14 and PR-15).
 */

/** What {@link runOfflineDoctor} needs; identical to {@link RunSystemChecksOptions} today. */
export type RunOfflineDoctorOptions = RunSystemChecksOptions;

/** Runs every offline tier, in order, and returns their findings together. */
export function runOfflineDoctor(options: RunOfflineDoctorOptions): Finding[] {
	return [...runSystemChecks(options), ...runRegistryChecks(options)];
}

export type { Finding };
