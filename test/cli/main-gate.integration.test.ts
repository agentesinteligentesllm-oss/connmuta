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

/**
 * Bounds how long `runNode` waits for the child to close on its own (native review
 * `review-1be8b7288fa0197f`, R4-node-floor-gate-spawn-no-timeout, CRITICAL). Comfortably above every
 * observed real gate-refusal time (~35-100ms) but far below a CI job timeout, so a genuine regression
 * still fails fast rather than hanging.
 */
const GATE_SPAWN_TIMEOUT_MS = 5000;

/**
 * Bounds how long `runNode` waits for the OS to confirm the child actually exited after `SIGKILL`,
 * once a {@link GATE_SPAWN_TIMEOUT_MS} timeout fires (native review `review-7a7a525a6a0f732d`,
 * R4-sigkill-no-process-tree-wait, CRITICAL, found against this file's own first correction round).
 * An immediate reject without waiting for `close` would race the caller's own `finally` cleanup
 * (`rmSync(scratchDir, ...)`) against a still-alive process still holding that directory as its cwd —
 * a real failure mode on Windows, where such a directory cannot be removed.
 */
const GATE_KILL_GRACE_MS = 2000;

/**
 * Spawns a real `node` child process, collecting both streams and the exit code — bounded by
 * {@link GATE_SPAWN_TIMEOUT_MS}. Without this bound, a Node-floor-gate regression on the
 * `daemon start` case (the one gated subcommand whose successful, non-gated path is a persistent
 * process that never exits on its own) would hang this promise, and the whole test run, forever
 * instead of failing with a diagnosable error.
 *
 * **`HOME`/`USERPROFILE` are overridden to `cwd` itself** (native review `review-119b0f2cb358a3b9`,
 * R3-node-floor-test-no-env-isolation, CRITICAL): without this, the spawned child inherits this test
 * process's REAL environment, so `daemon/home.ts`'s `resolveHomeDir()` (via `node:os`'s `homedir()`)
 * would resolve to the real developer/CI home directory in the exact regression scenario this test
 * exists to catch — a below-floor Node reaching `setup`/`migrate-v1`/`daemon start` anyway could then
 * write a real `registry.json`/ledger/secrets there, a side effect the scratch-dir emptiness assertion
 * cannot see or prevent. Pointing `HOME`/`USERPROFILE` at the same scratch `cwd` this test already
 * inspects means any such write, if the gate ever regressed, would land exactly where that assertion
 * would catch it.
 */
function runNode(args: readonly string[], cwd: string): Promise<SpawnResult> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.execPath, [...args], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, HOME: cwd, USERPROFILE: cwd },
		});
		let stdout = "";
		let stderr = "";
		let settled = false;

		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			const timeoutError = new Error(
				`runNode: child process did not exit within ${GATE_SPAWN_TIMEOUT_MS}ms (args: ${args.join(" ")}) — ` +
					"if the Node-floor gate regressed for a persistent-process command like 'daemon start', this " +
					"timeout is what turns that into a failed test instead of a hung one",
			);
			// Wait for the OS to confirm the direct child actually exited before rejecting, so the
			// caller's own `finally` cleanup never races a still-alive process (see GATE_KILL_GRACE_MS).
			// A bounded grace timer still rejects even if `close` never fires (SIGKILL not acknowledged).
			let killGraceTimer: ReturnType<typeof setTimeout> | undefined;
			child.once("close", () => {
				if (killGraceTimer) clearTimeout(killGraceTimer);
				reject(timeoutError);
			});
			child.kill("SIGKILL");
			killGraceTimer = setTimeout(() => reject(timeoutError), GATE_KILL_GRACE_MS);
		}, GATE_SPAWN_TIMEOUT_MS);

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", (err) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(err);
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolvePromise({ exitCode: code, stdout, stderr });
		});
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
			// Correction (native review `review-f59ee7b3eaaad38b`, R4-main-gate-unguarded-cleanup-rmsync,
			// CRITICAL): if runNode's own SIGKILL grace timer expired without the child ever emitting
			// "close" (a live risk this file's own two prior correction rounds targeted), the child could
			// still be alive holding scratchDir as its cwd on Windows — rmSync's `force: true` only
			// suppresses a missing-path error, not EBUSY/EPERM from a still-open cwd. An unguarded throw
			// here would replace the original diagnosable runNode timeout with a filesystem error and
			// skip cleanupPreload() entirely, leaking the preload temp directory too.
			try {
				rmSync(scratchDir, { recursive: true, force: true });
			} catch {
				// Best-effort; see comment above.
			}
			cleanupPreload();
		}
	});
}
