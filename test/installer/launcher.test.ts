import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, realpathSync } from "node:fs";

import { buildLauncherEntry, CLI_ENTRY } from "../../src/installer/launcher.js";

/** `installer/launcher.ts` (design.md §7.1, D-42; tasks.md PR-04 sub-task 4.1). */

test("CLI_ENTRY resolves to the real compiled cli entry point", () => {
	assert.ok(CLI_ENTRY.length > 0);
	assert.ok(CLI_ENTRY.endsWith("main.js"));
	assert.ok(CLI_ENTRY.includes("cli"));
	assert.ok(existsSync(CLI_ENTRY), "CLI_ENTRY must resolve to the real compiled cli entry point");
});

test("buildLauncherEntry's command is the realpath of the running node binary", () => {
	const entry = buildLauncherEntry("project-alpha");

	assert.equal(entry.command, realpathSync(process.execPath));
});

test("buildLauncherEntry's args are the absolute cli entry, then the literal mcp --project invocation", () => {
	const entry = buildLauncherEntry("project-alpha");

	assert.deepEqual(entry.args, [CLI_ENTRY, "mcp", "--project", "project-alpha"]);
});

test("buildLauncherEntry carries no env key at all", () => {
	const entry = buildLauncherEntry("project-alpha");

	assert.deepEqual(Object.keys(entry).sort(), ["args", "command"]);
	assert.ok(!("env" in entry), "the entry must not carry an env key, not even an empty one");
});

test("buildLauncherEntry forwards a different project id verbatim, with no other change", () => {
	const first = buildLauncherEntry("project-alpha");
	const second = buildLauncherEntry("totally-different-project-xyz");

	assert.equal(first.command, second.command);
	assert.equal(first.args[0], second.args[0]);
	assert.deepEqual(first.args.slice(1, 3), ["mcp", "--project"]);
	assert.deepEqual(second.args.slice(1, 3), ["mcp", "--project"]);
	assert.equal(first.args[3], "project-alpha");
	assert.equal(second.args[3], "totally-different-project-xyz");
});
