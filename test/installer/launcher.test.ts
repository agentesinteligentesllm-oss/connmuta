import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, realpathSync } from "node:fs";

import { buildLauncherEntry, CLI_ENTRY } from "../../src/installer/launcher.js";

/** `installer/launcher.ts` (design.md §7.1, D-42; ADR-0034). */

test("CLI_ENTRY resolves to the real compiled cli entry point", () => {
	assert.ok(CLI_ENTRY.length > 0);
	assert.ok(CLI_ENTRY.endsWith("main.js"));
	assert.ok(CLI_ENTRY.includes("cli"));
	assert.ok(existsSync(CLI_ENTRY), "CLI_ENTRY must resolve to the real compiled cli entry point");
});

test("buildLauncherEntry's command is the realpath of the running node binary", () => {
	const entry = buildLauncherEntry();

	assert.equal(entry.command, realpathSync(process.execPath));
});

test("buildLauncherEntry's args are the absolute cli entry, then the literal mcp invocation — no --project (ADR-0034)", () => {
	const entry = buildLauncherEntry();

	assert.deepEqual(entry.args, [CLI_ENTRY, "mcp"]);
	assert.ok(
		!entry.args.includes("--project"),
		"the written entry must carry no --project assertion: the binding comes from the nearest ancestor conmuta.json (ADR-0033)",
	);
});

test("buildLauncherEntry carries no env key at all", () => {
	const entry = buildLauncherEntry();

	assert.deepEqual(Object.keys(entry).sort(), ["args", "command"]);
	assert.ok(!("env" in entry), "the entry must not carry an env key, not even an empty one");
});

// ADR-0034 removed the only per-project input, so the entry is now a pure function of the running
// interpreter and the compiled CLI path: two installer runs must write byte-identical entries, which
// is what lets a re-bind of the same directory be a no-op instead of a hidden rewrite.
test("buildLauncherEntry is stable across calls — nothing about a project can change it", () => {
	assert.deepEqual(buildLauncherEntry(), buildLauncherEntry());
});
