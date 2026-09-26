import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { commitRegistryChange, type RegistryCommitAudit, type RegistryCommitIo } from "../../src/installer/registry-commit.js";
import { openLedger } from "../../src/ledger/open.js";
import { parseRegistryDocument, type Registry } from "../../src/registry/schema.js";
import { serializeRegistry } from "../../src/registry/writer.js";
import { activeBinding, validRegistryDocument } from "../registry/fixtures.js";

/**
 * `installer/registry-commit.ts` (design.md §5, D-41; tasks.md PR-07 sub-task 7.3): one `BEGIN
 * IMMEDIATE` ledger transaction carries both the R6 audit row and the `registry.json` rename.
 *
 * Real `node:sqlite` over a temp ledger opened through `ledger/open.ts`, one ledger per test, and a
 * real `registry.json` beside it — the same harness convention `test/ledger/audit.test.ts` uses.
 */

const REGISTRY_FILE_NAME = "registry.json";
const NOW = "2026-09-26T10:00:00.000Z";
/** SQLite's own result code for a locked database (`sqlite3.h`, `SQLITE_BUSY`); see `test/ledger/transaction.test.ts`. */
const SQLITE_BUSY = 5;

/** A real, shape-and-invariant-valid {@link Registry}, parsed through the same schema the writer validates against. */
function validRegistry(): Registry {
	const parsed = parseRegistryDocument(validRegistryDocument());
	assert.equal(parsed.ok, true, "fixture must itself be valid");
	if (!parsed.ok) {
		throw new Error("unreachable");
	}
	return parsed.registry;
}

/** One `installer/registry-commit.ts` audit row, with the fields a case is not about taken from a placeholder. */
function commitAudit(overrides: Partial<RegistryCommitAudit> = {}): RegistryCommitAudit {
	return {
		ts: NOW,
		project_id: null,
		bot_id: null,
		chat_id: null,
		eid: null,
		envelope_type: null,
		from_user_id: null,
		to_user_id: null,
		reason: "GROUP_ADDED",
		...overrides,
	};
}

/** A real temp-write-then-rename IO, mirroring the module's own default, with an injectable `afterRename` hook. */
function realIo(afterRename?: () => void): RegistryCommitIo {
	return {
		writeTemp(tempPath, text) {
			writeFileSync(tempPath, text, "utf8");
		},
		rename(tempPath, path) {
			renameSync(tempPath, path);
		},
		removeTemp(tempPath) {
			rmSync(tempPath, { force: true });
		},
		afterRename,
	};
}

/** A temp home with a real ledger open on it and a seeded `registry.json`; both are closed/removed after. */
function withCommitFixture(
	run: (fixture: {
		readonly db: DatabaseSync;
		readonly ledgerPath: string;
		readonly registryPath: string;
		readonly originalText: string;
	}) => void,
): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-registry-commit-"));
	const ledger = openLedger({ homeDir: home });
	const registryPath = join(home, REGISTRY_FILE_NAME);
	const originalText = serializeRegistry(validRegistry());
	writeFileSync(registryPath, originalText, "utf8");
	try {
		run({ db: ledger.db, ledgerPath: ledger.path, registryPath, originalText });
	} finally {
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

/**
 * Adds one more *consistent* group/project/binding for a new project, leaving R1/R2/R3 satisfied.
 *
 * Asserts on `current` itself (rather than ignoring the parameter) so a passing test also proves
 * `commitRegistryChange` handed this callback the document it actually read from `registryPath`, not
 * some other value.
 */
function withOneMoreProject(current: Registry): Registry {
	assert.equal(current.bots.length, 1, "must receive the registry read from registryPath");
	const doc = validRegistryDocument();
	doc.groups.push({ group_id: -1001234567892, added_at: NOW });
	doc.projects.push({ project_id: "prj-second", path: "C:\\work\\second" });
	doc.bindings.push(
		activeBinding({
			project_id: "prj-second",
			bot_id: 100000002,
			group_id: -1001234567892,
			agent_id: "@bob-agent",
			roster_snapshot: [{ agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" }],
		}),
	);
	doc.bots.push({
		bot_id: 100000002,
		username: "bob_example_bot",
		token_ref: { store: "file", path: "secrets/100000002.token" },
		added_at: NOW,
	});
	return doc as unknown as Registry;
}

/** Builds a document with **two active bindings on the same `bot_id`** — an R1 violation. */
function withR1Violation(): Registry {
	const doc = validRegistryDocument();
	doc.groups.push({ group_id: -1001234567892, added_at: NOW });
	doc.projects.push({ project_id: "prj-second", path: "C:\\work\\second" });
	doc.bindings.push(activeBinding({ project_id: "prj-second", group_id: -1001234567892 }));
	return doc as unknown as Registry;
}

test("a successful write commits exactly one audit row inside the same transaction as the rename", () => {
	withCommitFixture(({ db, registryPath }) => {
		const outcome = commitRegistryChange({
			db,
			registryPath,
			mutate: withOneMoreProject,
			audit: commitAudit({ reason: "PROJECT_BOUND", project_id: "prj-second", bot_id: 100000002 }),
		});

		assert.deepEqual(outcome, { outcome: "committed" });

		const rows = db.prepare("SELECT * FROM audit_log").all() as Record<string, unknown>[];
		assert.equal(rows.length, 1, "exactly one audit row");
		assert.equal(rows[0]?.["direction"], "system");
		assert.equal(rows[0]?.["outcome"], "ok");
		assert.equal(rows[0]?.["client_id"], null);
		assert.equal(rows[0]?.["reason"], "PROJECT_BOUND");
		assert.equal(rows[0]?.["project_id"], "prj-second");
		assert.equal(rows[0]?.["bot_id"], 100000002);

		const written = readFileSync(registryPath, "utf8");
		assert.equal(written, serializeRegistry(withOneMoreProject(validRegistry())));
	});
});

test("an unparseable current registry.json refuses with no audit row and no write", () => {
	withCommitFixture(({ db, registryPath }) => {
		writeFileSync(registryPath, "not json at all", "utf8");

		const outcome = commitRegistryChange({ db, registryPath, mutate: withOneMoreProject, audit: commitAudit() });

		assert.equal(outcome.outcome, "current-invalid");
		assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log").get()?.["n"], 0);
		assert.equal(readFileSync(registryPath, "utf8"), "not json at all");
	});
});

test("a change that fails validate-before-replace refuses with no audit row and no write", () => {
	withCommitFixture(({ db, registryPath, originalText }) => {
		const outcome = commitRegistryChange({
			db,
			registryPath,
			mutate: () => withR1Violation(),
			audit: commitAudit(),
		});

		assert.equal(outcome.outcome, "invalid");
		if (outcome.outcome === "invalid") {
			assert.deepEqual(outcome.problems, [{ kind: "invariant_violated", invariant: "R1" }]);
		}
		assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log").get()?.["n"], 0, "no audit row for a refused change");
		assert.equal(readFileSync(registryPath, "utf8"), originalText, "registry.json must be untouched");
	});
});

test("a failure after the rename but before commit rolls back the audit row and restores registry.json", () => {
	withCommitFixture(({ db, registryPath, originalText }) => {
		const outcome = commitRegistryChange({
			db,
			registryPath,
			mutate: withOneMoreProject,
			audit: commitAudit({ reason: "PROJECT_BOUND" }),
			io: realIo(() => {
				throw new Error("simulated commit-time I/O failure, after a successful rename");
			}),
		});

		assert.equal(outcome.outcome, "commit-failed");
		assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log").get()?.["n"], 0, "the audit row must be rolled back");
		assert.equal(readFileSync(registryPath, "utf8"), originalText, "registry.json must be restored to what this call started with");
		assert.equal(db.isTransaction, false, "no transaction is left open after the rollback");
	});
});

test("two concurrent commits serialize on the BEGIN IMMEDIATE lock", () => {
	withCommitFixture(({ db, ledgerPath, registryPath }) => {
		// No `busy_timeout` on this second connection: a locked database refuses immediately instead of
		// waiting, which is exactly the same technique `test/ledger/transaction.test.ts` uses to pin
		// `BEGIN IMMEDIATE`'s lock without a real multi-second wait.
		const other = new DatabaseSync(ledgerPath);
		let refusal: { errcode?: number } | undefined;

		try {
			const outcome = commitRegistryChange({
				db,
				registryPath,
				mutate: withOneMoreProject,
				audit: commitAudit({ reason: "PROJECT_BOUND" }),
				io: realIo(() => {
					try {
						other.exec("BEGIN IMMEDIATE");
						other.exec("ROLLBACK");
					} catch (error) {
						refusal = error as { errcode?: number };
					}
				}),
			});

			assert.equal(outcome.outcome, "committed");
			assert.ok(refusal, "the second connection must be refused while the first still holds the write lock");
			assert.equal(refusal?.errcode, SQLITE_BUSY);
		} finally {
			other.close();
		}
	});
});
