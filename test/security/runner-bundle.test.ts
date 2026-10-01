import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { bareSpecifiers, computeClosure } from "./closure.js";
import { hasChildProcessReference } from "./predicates.js";

/**
 * PT-34 — **the core cannot reach the wake satellite, and the satellite cannot reach the core's internals**
 * (ADR-0032 R2/R3, THREAT-MODEL PT-34; CONSTITUTION §3.1).
 *
 * The satellite is the only component in this product that starts another program. Two structural claims keep
 * that from spreading, and both are asserted here over the built closures rather than over prose:
 *
 *  1. **One direction only.** No core closure — daemon, thin client, installer/doctor CLI, or the F4 channel
 *     adapter — contains a file under `dist/runner/`. A future import in the other direction fails here.
 *  2. **The satellite goes through the daemon's IPC, not around it.** The runner's closure contains no
 *     `node:sqlite`, no `dist/src/ledger/*` and no `dist/src/daemon/*`: it cannot read the ledger directly
 *     (R3) and cannot link the daemon's poller or write paths. It reaches the bus the same way every other
 *     local client does — the loopback handshake and the body-less `/channel/*` routes.
 *
 * It also pins the runner's own bare-specifier surface, the same reviewed-allow-list discipline B-100(b) and
 * B-103 applied to the other five `computeClosure` consumers, and the single spawn site: exactly one file in
 * the runner's closure references `child_process`, and it is `runner/harness.js`.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const distPath = (relative: string): string => join(REPO_ROOT, "dist", relative);

/** The four closures that must never reach the satellite. */
const CORE_ENTRIES: readonly string[] = [
	"src/daemon/main.js",
	"src/client/main.js",
	"src/cli/main.js",
	"channel/main.js",
];

const RUNNER_ENTRY = "runner/main.js";

/** The runner's reviewed bare-specifier surface, computed from the built closure and reconciled against
 * `package.json`'s declared dependencies: every one of these is either a Node builtin or `zod`, which the
 * runner reaches through the shared IPC-contract schemas. */
const ALLOWED_RUNNER_BARE_SPECIFIERS: readonly string[] = [
	"node:child_process",
	"node:crypto",
	"node:fs",
	"node:os",
	"node:path",
	"zod",
];

const closureFiles = (entry: string): string[] => [...computeClosure(distPath(entry))].map((file) => resolve(file));

const closureBareSpecifiers = (files: readonly string[]): string[] => {
	const all = new Set<string>();
	for (const file of files) {
		for (const specifier of bareSpecifiers(readFileSync(file, "utf8"))) all.add(specifier);
	}
	return [...all].sort();
};

const withinDist = (absolute: string): string => {
	const parts = absolute.split(/[\\/]/);
	const index = parts.lastIndexOf("dist");
	return index === -1 ? absolute : parts.slice(index + 1).join("/");
};

test("PT-34: no core closure reaches the wake satellite", () => {
	for (const entry of CORE_ENTRIES) {
		const files = closureFiles(entry);
		assert.ok(files.length > 1, `${entry} closure must be non-vacuous`);
		const reaching = files.filter((file) => withinDist(file).startsWith("runner/"));
		assert.deepEqual(reaching, [], `${entry} must not reach the wake satellite`);
	}
});

test("PT-34: the satellite links the daemon's IPC, never its ledger or its internals", () => {
	const files = closureFiles(RUNNER_ENTRY);
	const relative = files.map(withinDist).sort();

	assert.ok(relative.includes("runner/main.js"), "the scan must start from the runner's own entry");
	assert.ok(
		relative.some((file) => file === "channel/daemon-link.js"),
		"the runner reaches the daemon through the same body-less link the F4 adapter uses",
	);
	for (const forbidden of ["src/ledger/", "src/daemon/", "src/registry/", "src/installer/"]) {
		assert.deepEqual(
			relative.filter((file) => file.startsWith(forbidden)),
			[],
			`the runner must not link ${forbidden}`,
		);
	}
	assert.ok(!closureBareSpecifiers(files).includes("node:sqlite"), "the runner must not open the ledger's database");
});

test("PT-34: exactly one file in the satellite's closure can start a process, and it is the harness adapter", () => {
	const files = closureFiles(RUNNER_ENTRY);
	const spawners = files.filter((file) => hasChildProcessReference(readFileSync(file, "utf8"))).map(withinDist);
	assert.deepEqual(spawners, ["runner/harness.js"]);
});

test("PT-34: the satellite's bare-specifier surface is a reviewed allow-list", () => {
	const files = closureFiles(RUNNER_ENTRY);
	assert.deepEqual(closureBareSpecifiers(files), [...ALLOWED_RUNNER_BARE_SPECIFIERS].sort());
});

test("PT-34: the channel adapter stays spawn-free while the satellite has its one spawn site", () => {
	const spawners = closureFiles("channel/main.js").filter((file) => hasChildProcessReference(readFileSync(file, "utf8")));
	assert.deepEqual(spawners, [], "the F4 doorbell adapter must not gain a spawn capability");
});
