import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { runSyncRosterCommand } from "../../src/cli/project-sync-roster.js";
import { openLedger } from "../../src/ledger/open.js";
import type { Registry } from "../../src/registry/schema.js";
import { serializeRegistry } from "../../src/registry/writer.js";
import type { Prompter } from "../../src/installer/prompter.js";
import { activeBinding, validRegistryDocument, VALID_ROSTER_HASH } from "../registry/fixtures.js";
import { EXIT_UNBOUND_PROJECT, EXIT_VALIDATION_FAILED, PROJECT_FILE_SCHEMA_VERSION } from "../../src/shared/constants.js";

/**
 * `cli/project-sync-roster.ts` (roster-sync spec.md; tasks.md PR-07 sub-task 7.3): the human-triggered
 * `conmuta project sync-roster [path]` command that resolves `roster_drift` by re-reading a project's
 * `conmuta.json` and, on confirmation, committing the recomputed roster through `commitRegistryChange`.
 *
 * Real `node:sqlite` over a temp ledger opened through `ledger/open.ts`, a real `registry.json` beside
 * it and a real `conmuta.json` in a separate project directory — the same fixture convention
 * `test/installer/registry-commit.test.ts` and `test/installer/wizards/setup.test.ts` already use.
 */

const CANCEL = Symbol("cancel");

/** A `Prompter` whose `confirm()` answers with a fixed value; every other method throws if reached. */
function confirmPrompter(answer: boolean | typeof CANCEL): Prompter {
	return {
		async password() {
			throw new Error("not used by this suite");
		},
		async text() {
			throw new Error("not used by this suite");
		},
		async select() {
			throw new Error("not used by this suite");
		},
		async multiselect() {
			throw new Error("not used by this suite");
		},
		async confirm() {
			return answer === CANCEL ? CANCEL : answer;
		},
		isCancel(value) {
			return value === CANCEL;
		},
	};
}

interface CapturedIo {
	readonly io: { out: (line: string) => void; err: (line: string) => void };
	readonly out: string[];
	readonly err: string[];
}

function makeIo(): CapturedIo {
	const out: string[] = [];
	const err: string[] = [];
	return { io: { out: (line) => out.push(line), err: (line) => err.push(line) }, out, err };
}

const PROJECT_ID = "prj-example";

function validConmutaJson(rosterOverride?: unknown): string {
	return JSON.stringify({
		schema_version: PROJECT_FILE_SCHEMA_VERSION,
		project_id: PROJECT_ID,
		group_id: -1001234567890,
		roster: rosterOverride ?? [{ agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" }],
	});
}

/**
 * A roster with a real difference from the fixture's stored `roster_snapshot` (a second agent added)
 * while still satisfying R3 (the original `@alice-agent`/100000001 pair, which the binding's own
 * `agent_id`/`bot_id` require, stays present) — `roster_hash` deliberately excludes `username`
 * (`shared/roster-hash.ts`), so a rename alone would not be real drift.
 */
function driftedRoster(): unknown {
	return [
		{ agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" },
		{ agent_id: "@carol-agent", user_id: 100000003, username: "carol_example_bot" },
	];
}

/**
 * A temp home with a real ledger open on it, a seeded `registry.json` whose one project's `path` is
 * `targetDir`, and a temp project directory holding `conmuta.json` (unless `conmutaJsonText` is `null`).
 */
async function withSyncRosterFixture(
	options: { readonly conmutaJsonText?: string | null },
	run: (fixture: { readonly db: DatabaseSync; readonly registryPath: string; readonly targetDir: string }) => Promise<void>,
): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-sync-roster-"));
	const targetDir = mkdtempSync(join(tmpdir(), "conmuta-sync-roster-project-"));
	const ledger = openLedger({ homeDir: home });
	const registryPath = join(home, "registry.json");

	const doc = validRegistryDocument();
	doc.projects[0] = { project_id: PROJECT_ID, path: targetDir };
	writeFileSync(registryPath, serializeRegistry(doc as unknown as Registry), "utf8");

	const conmutaJsonText = options.conmutaJsonText === undefined ? validConmutaJson() : options.conmutaJsonText;
	if (conmutaJsonText !== null) {
		writeFileSync(join(targetDir, "conmuta.json"), conmutaJsonText, "utf8");
	}

	try {
		await run({ db: ledger.db, registryPath, targetDir });
	} finally {
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
		rmSync(targetDir, { recursive: true, force: true });
	}
}

function auditRowCount(db: DatabaseSync): number {
	return (db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE reason = 'ROSTER_SYNCED'").get() as { n: number }).n;
}

test("no drift: the roster already matches the stored snapshot, so no write and no audit row", async () => {
	await withSyncRosterFixture({}, async ({ db, registryPath, targetDir }) => {
		const before = readFileSync(registryPath, "utf8");
		const captured = makeIo();

		const result = await runSyncRosterCommand({
			db,
			registryPath,
			targetDir,
			prompter: confirmPrompter(CANCEL), // must never be reached: no drift means no confirm prompt
			io: captured.io,
		});

		assert.equal(result.exitCode, 0);
		assert.equal(readFileSync(registryPath, "utf8"), before, "no drift must make no registry write");
		assert.equal(auditRowCount(db), 0);
		assert.match(captured.out.join("\n"), /in sync/i);
	});
});

test("drift is shown before commit, and a confirmed sync commits the new roster_hash and one audit row", async () => {
	await withSyncRosterFixture(
		{ conmutaJsonText: validConmutaJson(driftedRoster()) },
		async ({ db, registryPath, targetDir }) => {
			const captured = makeIo();

			const result = await runSyncRosterCommand({
				db,
				registryPath,
				targetDir,
				prompter: confirmPrompter(true),
				io: captured.io,
				now: () => new Date("2026-09-27T00:00:00.000Z"),
			});

			assert.equal(result.exitCode, 0);
			const printedBeforeCommit = captured.out.join("\n");
			assert.match(printedBeforeCommit, /drift/i, "the difference must be displayed");

			const rows = db.prepare("SELECT * FROM audit_log WHERE reason = 'ROSTER_SYNCED'").all() as Record<string, unknown>[];
			assert.equal(rows.length, 1, "exactly one ROSTER_SYNCED audit row");
			assert.equal(rows[0]?.["project_id"], PROJECT_ID);

			const writtenRegistry = JSON.parse(readFileSync(registryPath, "utf8")) as {
				bindings: { readonly roster_hash: string }[];
			};
			assert.notEqual(writtenRegistry.bindings[0]?.roster_hash, VALID_ROSTER_HASH, "the stored roster_hash must change");
		},
	);
});

test("an unbound project (no active binding at this path) is refused with no write", async () => {
	await withSyncRosterFixture({}, async ({ db, registryPath, targetDir }) => {
		const foreignDir = mkdtempSync(join(tmpdir(), "conmuta-sync-roster-foreign-"));
		writeFileSync(join(foreignDir, "conmuta.json"), validConmutaJson(), "utf8");
		try {
			const before = readFileSync(registryPath, "utf8");
			const captured = makeIo();

			const result = await runSyncRosterCommand({
				db,
				registryPath,
				targetDir: foreignDir,
				prompter: confirmPrompter(CANCEL),
				io: captured.io,
			});

			assert.equal(result.exitCode, EXIT_UNBOUND_PROJECT);
			assert.equal(readFileSync(registryPath, "utf8"), before, "an unbound project refusal must make no write");
			assert.equal(auditRowCount(db), 0);
			assert.match(captured.err.join("\n"), /no active binding/i);
		} finally {
			rmSync(foreignDir, { recursive: true, force: true });
		}
	});
});

test("a suspended-only binding at this path is treated as unbound (no active binding)", async () => {
	await withSyncRosterFixture({}, async ({ db, registryPath, targetDir }) => {
		const doc = validRegistryDocument();
		doc.projects[0] = { project_id: PROJECT_ID, path: targetDir };
		doc.bindings[0] = activeBinding({ project_id: PROJECT_ID, status: "suspended" });
		writeFileSync(registryPath, serializeRegistry(doc as unknown as Registry), "utf8");

		const captured = makeIo();
		const result = await runSyncRosterCommand({
			db,
			registryPath,
			targetDir,
			prompter: confirmPrompter(CANCEL),
			io: captured.io,
		});

		assert.equal(result.exitCode, EXIT_UNBOUND_PROJECT);
		assert.equal(auditRowCount(db), 0);
	});
});

test("a conmuta.json whose project_id does not match the binding at this path is refused with no write (RDD review-21eb25a2eb6f76f7, R3-project-id-not-cross-checked)", async () => {
	await withSyncRosterFixture({ conmutaJsonText: null }, async ({ db, registryPath, targetDir }) => {
		writeFileSync(
			join(targetDir, "conmuta.json"),
			JSON.stringify({
				schema_version: PROJECT_FILE_SCHEMA_VERSION,
				project_id: "prj-foreign",
				group_id: -1001234567890,
				roster: driftedRoster(),
			}),
			"utf8",
		);
		const before = readFileSync(registryPath, "utf8");
		const captured = makeIo();

		const result = await runSyncRosterCommand({
			db,
			registryPath,
			targetDir,
			prompter: confirmPrompter(CANCEL),
			io: captured.io,
		});

		assert.equal(result.exitCode, EXIT_VALIDATION_FAILED);
		assert.equal(readFileSync(registryPath, "utf8"), before, "a project_id mismatch must make no write");
		assert.equal(auditRowCount(db), 0);
		assert.match(captured.err.join("\n"), /project_id/i);
	});
});

test("a missing conmuta.json is refused with the validation exit code and no write", async () => {
	await withSyncRosterFixture({ conmutaJsonText: null }, async ({ db, registryPath, targetDir }) => {
		const before = readFileSync(registryPath, "utf8");
		const captured = makeIo();

		const result = await runSyncRosterCommand({
			db,
			registryPath,
			targetDir,
			prompter: confirmPrompter(CANCEL),
			io: captured.io,
		});

		assert.equal(result.exitCode, EXIT_VALIDATION_FAILED);
		assert.equal(readFileSync(registryPath, "utf8"), before);
		assert.equal(auditRowCount(db), 0);
		assert.match(captured.err.join("\n"), /cannot read/i);
	});
});

test("an invalid conmuta.json (fails identifiers-only validation) is refused with the same error `conmuta validate` reports", async () => {
	const seededTokenText = validConmutaJson().replace(
		"alice_example_bot",
		"bot 1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg",
	);
	await withSyncRosterFixture({ conmutaJsonText: seededTokenText }, async ({ db, registryPath, targetDir }) => {
		const before = readFileSync(registryPath, "utf8");
		const captured = makeIo();

		const result = await runSyncRosterCommand({
			db,
			registryPath,
			targetDir,
			prompter: confirmPrompter(CANCEL),
			io: captured.io,
		});

		assert.equal(result.exitCode, EXIT_VALIDATION_FAILED);
		assert.equal(readFileSync(registryPath, "utf8"), before);
		assert.equal(auditRowCount(db), 0);
		assert.match(captured.err.join("\n"), /roster\[0\]\.username/);
		assert.equal(captured.err.join("\n").includes("1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg"), false);
	});
});

test("an operator decline produces no write and no audit row", async () => {
	await withSyncRosterFixture(
		{ conmutaJsonText: validConmutaJson(driftedRoster()) },
		async ({ db, registryPath, targetDir }) => {
			const before = readFileSync(registryPath, "utf8");
			const captured = makeIo();

			const result = await runSyncRosterCommand({
				db,
				registryPath,
				targetDir,
				prompter: confirmPrompter(false),
				io: captured.io,
			});

			assert.notEqual(result.exitCode, 0);
			assert.equal(readFileSync(registryPath, "utf8"), before, "a decline must make no registry write");
			assert.equal(auditRowCount(db), 0);
		},
	);
});

test("a cancelled confirmation prompt is treated the same as a decline", async () => {
	await withSyncRosterFixture(
		{ conmutaJsonText: validConmutaJson(driftedRoster()) },
		async ({ db, registryPath, targetDir }) => {
			const before = readFileSync(registryPath, "utf8");
			const captured = makeIo();

			const result = await runSyncRosterCommand({
				db,
				registryPath,
				targetDir,
				prompter: confirmPrompter(CANCEL),
				io: captured.io,
			});

			assert.notEqual(result.exitCode, 0);
			assert.equal(readFileSync(registryPath, "utf8"), before);
			assert.equal(auditRowCount(db), 0);
		},
	);
});
