import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { REGISTRY_REPLACE_ATTEMPTS as INSTALLER_REGISTRY_REPLACE_ATTEMPTS } from "../../src/installer/constants.js";
import { parseRegistryDocument, type Registry } from "../../src/registry/schema.js";
import {
	REGISTRY_REPLACE_ATTEMPTS,
	replaceRegistryFile,
	serializeRegistry,
	validateRegistryBytes,
	type RegistryReplaceIo,
} from "../../src/registry/writer.js";
import { activeBinding, validRegistryDocument } from "./fixtures.js";

/**
 * `registry/writer.ts` (design.md §5, tasks.md PR-06 sub-task 6.1): validate-before-replace, an
 * invariant failure never touching the on-disk file, and the bounded rename-retry.
 */

/** A real, shape-and-invariant-valid {@link Registry}, built through the same parser the writer validates against. */
function validRegistry(): Registry {
	const parsed = parseRegistryDocument(validRegistryDocument());
	assert.equal(parsed.ok, true, "fixture must itself be valid");
	if (!parsed.ok) {
		throw new Error("unreachable");
	}
	return parsed.registry;
}

/** Runs `body` against a fresh temp directory and removes it afterwards, even on failure. */
function withTempDir(body: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-registry-writer-"));
	try {
		body(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * A {@link RegistryReplaceIo} whose `rename` throws an `EPERM`-shaped error for the first
 * `failuresBeforeSuccess` calls, then "succeeds" by writing the temp text directly to the target path
 * — standing in for the real rename's effect without needing a genuine concurrent-reader race.
 */
function fakeReplaceIo(failuresBeforeSuccess: number): { io: RegistryReplaceIo; renameCalls: () => number; removedTemps: string[] } {
	let renameCalls = 0;
	let writtenTempText: string | undefined;
	const removedTemps: string[] = [];
	const io: RegistryReplaceIo = {
		writeTemp(_tempPath, text) {
			writtenTempText = text;
		},
		rename(_tempPath, path) {
			renameCalls += 1;
			if (renameCalls <= failuresBeforeSuccess) {
				const error = new Error("mock EPERM: rename-over refused") as NodeJS.ErrnoException;
				error.code = "EPERM";
				throw error;
			}
			writeFileSync(path, writtenTempText ?? "", "utf8");
		},
		removeTemp(tempPath) {
			removedTemps.push(tempPath);
		},
	};
	return { io, renameCalls: () => renameCalls, removedTemps };
}

test("the writer's disclosed-duplicate constant matches installer/constants.ts's value", () => {
	assert.equal(REGISTRY_REPLACE_ATTEMPTS, INSTALLER_REGISTRY_REPLACE_ATTEMPTS, "the two copies must not drift apart");
});

test("a writeTemp failure returns a typed replace-failed outcome instead of throwing", () => {
	withTempDir((dir) => {
		const path = join(dir, "registry.json");
		const original = "ORIGINAL-SENTINEL-NOT-A-REGISTRY";
		writeFileSync(path, original, "utf8");
		const io: RegistryReplaceIo = {
			writeTemp() {
				const error = new Error("mock ENOSPC: no space left on device") as NodeJS.ErrnoException;
				error.code = "ENOSPC";
				throw error;
			},
			rename() {
				throw new Error("unreachable: writeTemp must fail before rename is ever attempted");
			},
			removeTemp() {
				// No-op: nothing was ever written, so there is nothing to remove in this fake.
			},
		};

		const outcome = replaceRegistryFile({ path, registry: validRegistry(), io });

		assert.equal(outcome.outcome, "replace-failed");
		assert.equal(readFileSync(path, "utf8"), original, "the original file must be untouched by a failed temp write");
	});
});

test("a valid change replaces the file atomically", () => {
	withTempDir((dir) => {
		const path = join(dir, "registry.json");
		const registry = validRegistry();

		const outcome = replaceRegistryFile({ path, registry });

		assert.deepEqual(outcome, { outcome: "replaced" });
		const written = readFileSync(path, "utf8");
		assert.equal(written, serializeRegistry(registry));
		assert.equal(validateRegistryBytes(written).ok, true);
	});
});

test("a change that would fail R1 leaves the on-disk file byte-identical and makes no write", () => {
	withTempDir((dir) => {
		const path = join(dir, "registry.json");
		const original = serializeRegistry(validRegistry());
		writeFileSync(path, original, "utf8");

		const duplicateBotDocument = validRegistryDocument();
		duplicateBotDocument.groups.push({ group_id: -1001234567892, added_at: "2026-09-16T00:00:00Z" });
		duplicateBotDocument.projects.push({ project_id: "prj-shared", path: "C:\\work\\shared" });
		duplicateBotDocument.bindings.push(activeBinding({ project_id: "prj-shared", group_id: -1001234567892 }));
		const invalidRegistry = duplicateBotDocument as unknown as Registry;

		const outcome = replaceRegistryFile({ path, registry: invalidRegistry });

		assert.equal(outcome.outcome, "invalid");
		if (outcome.outcome === "invalid") {
			assert.deepEqual(outcome.problems, [{ kind: "invariant_violated", invariant: "R1" }]);
		}
		assert.equal(readFileSync(path, "utf8"), original);
		// No temp file (or anything else) was ever created next to the target.
		assert.deepEqual(readdirSync(dir), ["registry.json"]);
	});
});

test("bounded retry on a rename failure exhausts REGISTRY_REPLACE_ATTEMPTS then refuses, original intact", () => {
	withTempDir((dir) => {
		const path = join(dir, "registry.json");
		const original = "ORIGINAL-SENTINEL-NOT-A-REGISTRY";
		writeFileSync(path, original, "utf8");
		const { io, renameCalls, removedTemps } = fakeReplaceIo(REGISTRY_REPLACE_ATTEMPTS);

		const outcome = replaceRegistryFile({ path, registry: validRegistry(), io });

		assert.equal(outcome.outcome, "replace-failed");
		assert.equal(renameCalls(), REGISTRY_REPLACE_ATTEMPTS, "retry is bounded, not indefinite");
		assert.equal(readFileSync(path, "utf8"), original);
		assert.equal(removedTemps.length, 1, "the abandoned temp file is cleaned up");
	});
});

test("a rename failure that clears within the retry budget still succeeds", () => {
	withTempDir((dir) => {
		const path = join(dir, "registry.json");
		const registry = validRegistry();
		const { io, renameCalls } = fakeReplaceIo(REGISTRY_REPLACE_ATTEMPTS - 1);

		const outcome = replaceRegistryFile({ path, registry, io });

		assert.deepEqual(outcome, { outcome: "replaced" });
		assert.equal(renameCalls(), REGISTRY_REPLACE_ATTEMPTS, "the last attempt in the budget is the one that succeeds");
		assert.equal(readFileSync(path, "utf8"), serializeRegistry(registry));
	});
});
