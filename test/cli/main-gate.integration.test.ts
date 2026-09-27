import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { EXIT_NODE_FLOOR, NODE_FLOOR } from "../../src/shared/constants.js";

/**
 * Real child-process proof that the compiled CLI entry point (`dist/src/cli/main.js`) refuses to
 * proceed on a below-floor Node version, before any filesystem write (`daemon/node-floor.ts`'s
 * `enforceNodeFloor`, D-25/ADR-0030).
 *
 * Unlike `test/cli/main.test.ts`'s in-process `runCli` unit spies, this test spawns the REAL compiled
 * entry point as a genuine child process, with `process.version` overridden via a `--require` CJS
 * preload (`Object.defineProperty(process, "version", { value, configurable: true })`) — a bare
 * assignment to `process.version` silently no-ops, this does not.
 *
 * "Zero git calls" (design's own wording) needs no special instrumentation: nothing in this codebase
 * invokes git at all, and the Node-floor gate is the literal first statement in every gated branch
 * (`src/cli/main.ts`), so a passing exit-code + stderr + empty-scratch-dir assertion already proves
 * this transitively — a fake git binary / PATH-injection harness would solve a problem this codebase
 * does not have.
 */

// dist/test/cli/main-gate.integration.test.js -> repo root is three levels up.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CLI_ENTRY = join(REPO_ROOT, "dist", "src", "cli", "main.js");

/** Below `NODE_FLOOR` regardless of what it is today; any version older than the floor proves the gate. */
const FAKE_OLD_VERSION = "v18.0.0";

/** The exact message `enforceNodeFloor` writes to stderr (`daemon/node-floor.ts`), pinned rather than loosely matched. */
const EXPECTED_NODE_FLOOR_MESSAGE = `Node.js ${NODE_FLOOR} or higher is required (found ${FAKE_OLD_VERSION}). Please download and install a supported version from https://nodejs.org/`;

interface SpawnResult {
	readonly exitCode: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

/** Spawns a real `node` child process, collecting both streams and the exit code. */
function runNode(args: readonly string[], cwd: string): Promise<SpawnResult> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.execPath, [...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", reject);
		child.on("close", (code) => resolvePromise({ exitCode: code, stdout, stderr }));
	});
}

/** Writes a fresh `--require`-able CJS preload overriding `process.version`, in its own temp dir. */
function writeFakeOldNodePreload(): { readonly preloadPath: string; readonly cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-fake-node-"));
	const preloadPath = join(dir, "fake-old-node.cjs");
	writeFileSync(
		preloadPath,
		`Object.defineProperty(process, "version", { value: ${JSON.stringify(FAKE_OLD_VERSION)}, configurable: true });\n`,
	);
	return { preloadPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("sanity: the --require preload technique actually overrides process.version in isolation", async () => {
	const { preloadPath, cleanup } = writeFakeOldNodePreload();
	try {
		const result = await runNode(["--require", preloadPath, "-e", "console.log(process.version)"], process.cwd());
		assert.equal(result.exitCode, 0, `expected a clean exit; stderr: ${result.stderr}`);
		assert.equal(result.stdout.trim(), FAKE_OLD_VERSION);
	} finally {
		cleanup();
	}
});

/** Every subcommand branch that calls `enforceNodeFloor` as its literal first action (`src/cli/main.ts`). */
const GATED_SUBCOMMANDS: readonly (readonly string[])[] = [
	["setup"],
	["mcp", "--project", "x"],
	["migrate-v1"],
	["daemon", "start"],
];

for (const args of GATED_SUBCOMMANDS) {
	test(`node-floor gate: 'conmuta ${args.join(" ")}' refuses a below-floor Node before any filesystem write`, async () => {
		const { preloadPath, cleanup: cleanupPreload } = writeFakeOldNodePreload();
		const scratchDir = mkdtempSync(join(tmpdir(), "conmuta-gate-scratch-"));
		try {
			const result = await runNode(["--require", preloadPath, CLI_ENTRY, ...args], scratchDir);
			assert.equal(result.exitCode, EXIT_NODE_FLOOR, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
			assert.ok(
				result.stderr.includes(EXPECTED_NODE_FLOOR_MESSAGE),
				`expected stderr to contain the exact node-floor message, got: ${result.stderr}`,
			);
			assert.ok(result.stderr.includes("Node.js"));
			assert.ok(result.stderr.includes("https://nodejs.org/"));
			assert.deepEqual(readdirSync(scratchDir), [], "the gate must refuse before any filesystem write");
		} finally {
			rmSync(scratchDir, { recursive: true, force: true });
			cleanupPreload();
		}
	});
}
