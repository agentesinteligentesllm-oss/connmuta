import { test } from "node:test";
import assert from "node:assert/strict";

import { runInstallerCli, type InstallerCliDeps } from "../../src/installer/cli.js";
import type { BotAddOutcome } from "../../src/installer/wizards/bot-add.js";
import type { GroupAddOutcome } from "../../src/installer/wizards/group-add.js";
import type { ProjectBindOutcome } from "../../src/installer/wizards/project-bind.js";
import type { SetupOutcome } from "../../src/installer/wizards/setup.js";

/**
 * `installer/cli.ts` (design.md §8; tasks.md PR-12 sub-task 12.5): verb parsing
 * (`setup | bot add | group add | project bind <path>`) dispatches to the right wizard runner; an
 * unknown verb or a malformed `project bind` invocation refuses without calling any wizard.
 *
 * Every wizard runner in `deps` is a fake here — the wizards' own real behavior is already fully
 * covered by `setup.test.ts`/`project-bind.test.ts`/`bot-add.test.ts`/`group-add.test.ts`; this suite
 * only proves the dispatch itself.
 */

const FAKE_SETUP_OUTCOME: SetupOutcome = { outcome: "ledger-refused", reason: "version_mismatch", path: "/fake/ledger.db", foundVersion: 2 };
const FAKE_BOT_ADD_OUTCOME: BotAddOutcome = { outcome: "cancelled" };
const FAKE_GROUP_ADD_OUTCOME: GroupAddOutcome = { outcome: "group-already-bound" };
const FAKE_PROJECT_BIND_OUTCOME: ProjectBindOutcome = { outcome: "invariant-violated", invariant: "R1" };

function fakeDeps(): { readonly deps: InstallerCliDeps; readonly calls: string[] } {
	const calls: string[] = [];
	const deps: InstallerCliDeps = {
		setup: async () => {
			calls.push("setup");
			return FAKE_SETUP_OUTCOME;
		},
		botAdd: async () => {
			calls.push("bot-add");
			return FAKE_BOT_ADD_OUTCOME;
		},
		groupAdd: async () => {
			calls.push("group-add");
			return FAKE_GROUP_ADD_OUTCOME;
		},
		projectBind: async (targetDir: string) => {
			calls.push(`project-bind:${targetDir}`);
			return FAKE_PROJECT_BIND_OUTCOME;
		},
	};
	return { deps, calls };
}

test("setup dispatches to deps.setup", async () => {
	const { deps, calls } = fakeDeps();
	const outcome = await runInstallerCli(["setup"], deps);
	assert.deepEqual(calls, ["setup"]);
	assert.deepEqual(outcome, { outcome: "setup", result: FAKE_SETUP_OUTCOME });
});

test("bot add dispatches to deps.botAdd", async () => {
	const { deps, calls } = fakeDeps();
	const outcome = await runInstallerCli(["bot", "add"], deps);
	assert.deepEqual(calls, ["bot-add"]);
	assert.deepEqual(outcome, { outcome: "bot-add", result: FAKE_BOT_ADD_OUTCOME });
});

test("group add dispatches to deps.groupAdd", async () => {
	const { deps, calls } = fakeDeps();
	const outcome = await runInstallerCli(["group", "add"], deps);
	assert.deepEqual(calls, ["group-add"]);
	assert.deepEqual(outcome, { outcome: "group-add", result: FAKE_GROUP_ADD_OUTCOME });
});

test("project bind <path> dispatches to deps.projectBind with the given path", async () => {
	const { deps, calls } = fakeDeps();
	const outcome = await runInstallerCli(["project", "bind", "/abs/project"], deps);
	assert.deepEqual(calls, ["project-bind:/abs/project"]);
	assert.deepEqual(outcome, { outcome: "project-bind", result: FAKE_PROJECT_BIND_OUTCOME });
});

test("an unknown verb is refused and calls no wizard", async () => {
	const { deps, calls } = fakeDeps();
	const outcome = await runInstallerCli(["frobnicate"], deps);
	assert.deepEqual(outcome, { outcome: "refused", reason: "unknown-verb", argv: ["frobnicate"] });
	assert.deepEqual(calls, []);
});

test("an empty argv is refused as an unknown verb and calls no wizard", async () => {
	const { deps, calls } = fakeDeps();
	const outcome = await runInstallerCli([], deps);
	assert.deepEqual(outcome, { outcome: "refused", reason: "unknown-verb", argv: [] });
	assert.deepEqual(calls, []);
});

test("project bind with a missing path is refused and calls no wizard", async () => {
	const { deps, calls } = fakeDeps();
	const outcome = await runInstallerCli(["project", "bind"], deps);
	assert.deepEqual(outcome, { outcome: "refused", reason: "missing-path", argv: ["project", "bind"] });
	assert.deepEqual(calls, []);
});

test("project bind with an empty-string path is refused and calls no wizard", async () => {
	const { deps, calls } = fakeDeps();
	const outcome = await runInstallerCli(["project", "bind", ""], deps);
	assert.deepEqual(outcome, { outcome: "refused", reason: "missing-path", argv: ["project", "bind", ""] });
	assert.deepEqual(calls, []);
});
