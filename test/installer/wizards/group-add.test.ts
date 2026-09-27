import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { parseRegistryDocument, type Registry } from "../../../src/registry/schema.js";
import { serializeRegistry } from "../../../src/registry/writer.js";
import { runGroupAdd } from "../../../src/installer/wizards/group-add.js";
import { activeBinding, validRegistryDocument } from "../../registry/fixtures.js";

/**
 * `installer/wizards/group-add.ts` (spec.md:85-102, DATA-MODEL §2.5 R2; tasks.md PR-11 sub-task
 * 11.4/11.5): records a group, refusing a `group_id` already bound by an *active* binding before any
 * registry write.
 *
 * Real `node:sqlite` ledger and a real `registry.json`, mirroring `test/installer/registry-commit.
 * test.ts`'s own harness; the seeded registry reuses `test/registry/fixtures.ts`'s shared builders so
 * the "already bound" case starts from a document the registry schema itself accepts.
 */

const NOW = new Date("2026-09-26T10:00:00.000Z");
const NEW_GROUP_ID = -1009999999999;
const ALREADY_BOUND_GROUP_ID = -1001234567890;

/** A valid {@link Registry} parsed from `validRegistryDocument()`'s one active binding on {@link ALREADY_BOUND_GROUP_ID}. */
function seededRegistry(): Registry {
	const parsed = parseRegistryDocument(validRegistryDocument());
	assert.equal(parsed.ok, true, "fixture must itself be valid");
	if (!parsed.ok) {
		throw new Error("unreachable");
	}
	return parsed.registry;
}

/** A temp home, an open ledger, and a seeded `registry.json`; both are closed/removed after. */
function withGroupAddFixture(
	run: (fixture: { readonly db: DatabaseSync; readonly registryPath: string; readonly originalText: string }) => void,
): void {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-group-add-"));
	const ledger = openLedger({ homeDir });
	const registryPath = join(homeDir, "registry.json");
	const originalText = serializeRegistry(seededRegistry());
	writeFileSync(registryPath, originalText, "utf8");
	try {
		run({ db: ledger.db, registryPath, originalText });
	} finally {
		ledger.db.close();
		rmSync(homeDir, { recursive: true, force: true });
	}
}

test("a fresh group_id is recorded with its title", () => {
	withGroupAddFixture(({ db, registryPath }) => {
		const outcome = runGroupAdd({ db, registryPath, groupId: NEW_GROUP_ID, title: "New project group", now: () => NOW });

		assert.deepEqual(outcome, { outcome: "added", group_id: NEW_GROUP_ID });

		const parsed = parseRegistryDocument(JSON.parse(readFileSync(registryPath, "utf8")));
		assert.equal(parsed.ok, true);
		if (parsed.ok) {
			assert.ok(
				parsed.registry.groups.some(
					(group) => group.group_id === NEW_GROUP_ID && group.title === "New project group" && group.added_at === NOW.toISOString(),
				),
			);
		}
	});
});

test("a group_id already bound by an active binding is refused before any write", () => {
	withGroupAddFixture(({ db, registryPath, originalText }) => {
		const outcome = runGroupAdd({ db, registryPath, groupId: ALREADY_BOUND_GROUP_ID, title: "Duplicate", now: () => NOW });

		assert.deepEqual(outcome, { outcome: "group-already-bound" });
		assert.equal(readFileSync(registryPath, "utf8"), originalText, "registry.json must be byte-identical, untouched");
		assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log").get()?.["n"], 0, "no audit row for a refused add");
	});
});

test("a group_id referenced only by a suspended binding is not refused", () => {
	withGroupAddFixture(({ db, registryPath }) => {
		const doc = validRegistryDocument();
		const suspendedGroupId = -1005555555555;
		doc.groups.push({ group_id: suspendedGroupId, added_at: NOW.toISOString() });
		doc.projects.push({ project_id: "prj-suspended", path: "C:\\work\\suspended" });
		doc.bindings.push(
			activeBinding({
				project_id: "prj-suspended",
				group_id: suspendedGroupId,
				status: "suspended",
			}),
		);
		const parsed = parseRegistryDocument(doc);
		assert.equal(parsed.ok, true, "fixture must itself be valid");
		if (!parsed.ok) {
			throw new Error("unreachable");
		}
		writeFileSync(registryPath, serializeRegistry(parsed.registry), "utf8");

		const outcome = runGroupAdd({ db, registryPath, groupId: suspendedGroupId, title: "Reused group", now: () => NOW });

		assert.equal(outcome.outcome, "added");
	});
});

test("an unparseable registry.json is surfaced as a registry-commit-failed current-invalid, not swallowed", () => {
	withGroupAddFixture(({ db, registryPath }) => {
		writeFileSync(registryPath, "not json at all", "utf8");

		const outcome = runGroupAdd({ db, registryPath, groupId: NEW_GROUP_ID, title: "Whatever", now: () => NOW });

		assert.equal(outcome.outcome, "registry-commit-failed");
		if (outcome.outcome === "registry-commit-failed") {
			assert.equal(outcome.detail.outcome, "current-invalid");
		}
		assert.equal(readFileSync(registryPath, "utf8"), "not json at all", "registry.json must be untouched");
	});
});
