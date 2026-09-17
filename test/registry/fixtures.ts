/**
 * Shared fixtures for the three registry suites (PR-09).
 *
 * Not a test file itself: `test/twins.test.ts` requires a twin only for the `.ts` files under `src`,
 * and the suite glob is `dist/test/<dir>/<name>.test.js`, so a helper here is compiled but never run
 * as a suite.
 * It exists because the three suites build the same valid document and the same valid binding, and
 * three copies of a security-relevant fixture is the drift the rest of this slice avoids.
 *
 * Every value is a placeholder (AGENTS.md §3): synthetic bot ids and a synthetic group id, never a
 * production identifier. The ids are 9 digits with no colon, so neither the six-digit-shape rules of
 * `test/security/repo-scan.test.ts` (PT-22) nor the shared token regex can match them.
 *
 * Fields are deliberately typed `Record<string, unknown>`: these builders exist to *break* the
 * document (an unknown key, a wrong type, a missing field), which a shape-typed builder could not
 * express. `parseRegistryDocument` takes `unknown` for the same reason.
 */

import { REGISTRY_VERSION } from "../../src/shared/constants.js";

/** A loose, mutable JSON object as a test writes it. */
export type JsonObject = Record<string, unknown>;

/** One roster-snapshot entry — exactly the three fields DATA-MODEL §1 gives a roster entry. */
export function rosterSnapshotEntry(overrides: JsonObject = {}): JsonObject {
	return { agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot", ...overrides };
}

/** The `sha256:<64 hex>` shape `shared/roster-hash.ts` emits, pinned against a known answer there. */
export const VALID_ROSTER_HASH =
	"sha256:5428267f998d27b4fefc15451bdc264cd3a5a4137a2b1ae4a4b585960786abe1";

/** One valid `active` binding: bot 100000001 → project `prj-example` → group -1001234567890. */
export function activeBinding(overrides: JsonObject = {}): JsonObject {
	return {
		project_id: "prj-example",
		bot_id: 100000001,
		group_id: -1001234567890,
		agent_id: "@alice-agent",
		status: "active",
		roster_snapshot: [rosterSnapshotEntry()],
		roster_hash: VALID_ROSTER_HASH,
		bound_at: "2026-09-16T00:00:00Z",
		...overrides,
	};
}

/** A complete, valid `~/.conmuta/registry.json` document (DATA-MODEL §2), freshly built per call. */
export function validRegistryDocument(): {
	registry_version: number;
	bots: JsonObject[];
	groups: JsonObject[];
	projects: JsonObject[];
	bindings: JsonObject[];
} {
	return {
		registry_version: REGISTRY_VERSION,
		bots: [
			{
				bot_id: 100000001,
				username: "alice_example_bot",
				token_ref: { store: "keychain", account: "bot:100000001" },
				added_at: "2026-09-16T00:00:00Z",
			},
		],
		groups: [{ group_id: -1001234567890, title: "Example project", added_at: "2026-09-16T00:00:00Z" }],
		projects: [{ project_id: "prj-example", path: "C:\\work\\example", name: "example" }],
		bindings: [activeBinding()],
	};
}

/**
 * Add one more *consistent* binding — a second bot, group, project and roster snapshot — so the
 * result is a valid registry with two active bindings and satisfies R1, R2 and R3 at once.
 *
 * Mutates in place and returns the same document, because every caller wants the extended document
 * rather than a copy. Kept here rather than in a suite so the four arrays cannot drift apart: a
 * binding added without its bot or group would fail R2 for a reason unrelated to what a test means
 * to exercise.
 */
export function addSecondBinding(document: ReturnType<typeof validRegistryDocument>): typeof document {
	document.bots.push({
		bot_id: 100000002,
		username: "bob_example_bot",
		token_ref: { store: "file", path: "secrets/100000002.token" },
		added_at: "2026-09-16T00:00:00Z",
	});
	document.groups.push({ group_id: -1001234567891, added_at: "2026-09-16T00:00:00Z" });
	document.projects.push({ project_id: "prj-second", path: "C:\\work\\second" });
	document.bindings.push(
		activeBinding({
			project_id: "prj-second",
			bot_id: 100000002,
			group_id: -1001234567891,
			agent_id: "@bob-agent",
			roster_snapshot: [rosterSnapshotEntry({ agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" })],
		}),
	);
	return document;
}
