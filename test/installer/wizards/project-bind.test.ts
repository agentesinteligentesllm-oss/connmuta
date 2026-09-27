import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { MCP_SERVER_NAME } from "../../../src/installer/constants.js";
import { runProjectBind } from "../../../src/installer/wizards/project-bind.js";
import { parseRegistryDocument, type Registry } from "../../../src/registry/schema.js";
import { serializeRegistry } from "../../../src/registry/writer.js";
import { PROJECT_FILE_SCHEMA_VERSION, REGISTRY_VERSION } from "../../../src/shared/constants.js";
import type { ProjectRosterEntry } from "../../../src/shared/project-file.js";
import { computeRosterHash } from "../../../src/shared/roster-hash.js";
import { validRegistryDocument } from "../../registry/fixtures.js";

/**
 * `installer/wizards/project-bind.ts` (spec.md:104-123, DATA-MODEL §2.5 R1-R4; tasks.md PR-12
 * sub-task 12.3/12.4): R1-R3 pre-checked before any write, `conmuta.json` (R4) via `writeProjectFile`,
 * then one registry commit, then tool-config writes and instruction files.
 *
 * Real `node:sqlite` ledger, a real `registry.json` and a real temp target project directory,
 * mirroring `bot-add.test.ts`'s/`group-add.test.ts`'s own harness.
 */

const BOT_ID = 900000321;
const GROUP_ID = -1009999999999;
const AGENT_ID = "@alice-agent";
const ROSTER: readonly ProjectRosterEntry[] = [{ agent_id: AGENT_ID, user_id: BOT_ID, username: "alice_example_bot" }];
const NOW = new Date("2026-09-26T10:00:00.000Z");

function emptyRegistry(): Registry {
	const parsed = parseRegistryDocument({ registry_version: REGISTRY_VERSION, bots: [], groups: [], projects: [], bindings: [] });
	assert.equal(parsed.ok, true, "fixture must itself be valid");
	if (!parsed.ok) {
		throw new Error("unreachable");
	}
	return parsed.registry;
}

/** A temp home, an open ledger, a seeded empty `registry.json`, and a real temp target project dir; all removed after. */
function withProjectBindFixture(
	run: (fixture: { readonly db: DatabaseSync; readonly registryPath: string; readonly targetDir: string }) => Promise<void>,
): Promise<void> {
	const base = mkdtempSync(join(tmpdir(), "conmuta-project-bind-"));
	const homeDir = join(base, "home");
	const ledger = openLedger({ homeDir });
	const registryPath = join(homeDir, "registry.json");
	writeFileSync(registryPath, serializeRegistry(emptyRegistry()), "utf8");
	const targetDir = mkdtempSync(join(base, "project-"));
	return run({ db: ledger.db, registryPath, targetDir }).finally(() => {
		ledger.db.close();
		rmSync(base, { recursive: true, force: true });
	});
}

test("a selection satisfying R1-R4 writes conmuta.json (identifiers only) and records the project and binding", async () => {
	await withProjectBindFixture(async ({ db, registryPath, targetDir }) => {
		const outcome = await runProjectBind({
			db,
			registryPath,
			targetDir,
			botId: BOT_ID,
			groupId: GROUP_ID,
			agentId: AGENT_ID,
			roster: ROSTER,
			selectedToolIds: new Set(),
			now: () => NOW,
		});

		assert.equal(outcome.outcome, "bound");
		if (outcome.outcome !== "bound") return;

		const conmutaJson = JSON.parse(readFileSync(join(targetDir, "conmuta.json"), "utf8"));
		assert.deepEqual(conmutaJson, {
			schema_version: PROJECT_FILE_SCHEMA_VERSION,
			project_id: outcome.project_id,
			group_id: GROUP_ID,
			roster: [...ROSTER],
		});

		const registryParsed = parseRegistryDocument(JSON.parse(readFileSync(registryPath, "utf8")));
		assert.equal(registryParsed.ok, true);
		if (!registryParsed.ok) return;
		assert.ok(registryParsed.registry.projects.some((project) => project.project_id === outcome.project_id && project.path === targetDir));
		const binding = registryParsed.registry.bindings.find((candidate) => candidate.project_id === outcome.project_id);
		assert.ok(binding);
		assert.equal(binding?.bot_id, BOT_ID);
		assert.equal(binding?.group_id, GROUP_ID);
		assert.equal(binding?.agent_id, AGENT_ID);
		assert.equal(binding?.status, "active");
		assert.equal(binding?.roster_hash, computeRosterHash(ROSTER));
		assert.equal(binding?.bound_at, NOW.toISOString());
	});
});

test("a bot already carrying an active binding is refused citing R1, before any write", async () => {
	await withProjectBindFixture(async ({ db, registryPath, targetDir }) => {
		const seededParsed = parseRegistryDocument(validRegistryDocument());
		assert.equal(seededParsed.ok, true);
		if (!seededParsed.ok) throw new Error("unreachable");
		const seededText = serializeRegistry(seededParsed.registry);
		writeFileSync(registryPath, seededText, "utf8");

		const outcome = await runProjectBind({
			db,
			registryPath,
			targetDir,
			botId: 100000001, // already actively bound by `validRegistryDocument()`'s own fixture binding
			groupId: GROUP_ID,
			agentId: AGENT_ID,
			roster: ROSTER,
			selectedToolIds: new Set(),
			now: () => NOW,
		});

		assert.deepEqual(outcome, { outcome: "invariant-violated", invariant: "R1" });
		assert.equal(existsSync(join(targetDir, "conmuta.json")), false, "conmuta.json must never be written");
		assert.equal(readFileSync(registryPath, "utf8"), seededText, "registry.json must be byte-identical, untouched");
	});
});

test("re-binding an already-bound project with a different binding is refused (no unbind verb in F2)", async () => {
	await withProjectBindFixture(async ({ db, registryPath, targetDir }) => {
		const first = await runProjectBind({
			db,
			registryPath,
			targetDir,
			botId: BOT_ID,
			groupId: GROUP_ID,
			agentId: AGENT_ID,
			roster: ROSTER,
			selectedToolIds: new Set(),
			now: () => NOW,
		});
		assert.equal(first.outcome, "bound");

		const registryBeforeSecond = readFileSync(registryPath, "utf8");
		const conmutaBeforeSecond = readFileSync(join(targetDir, "conmuta.json"), "utf8");
		const secondBotId = BOT_ID + 1;
		const secondAgentId = "@bob-agent";
		const secondRoster: readonly ProjectRosterEntry[] = [{ agent_id: secondAgentId, user_id: secondBotId, username: "bob_example_bot" }];

		const second = await runProjectBind({
			db,
			registryPath,
			targetDir, // same directory ⇒ same derived project_id, already actively bound
			botId: secondBotId,
			groupId: GROUP_ID - 1,
			agentId: secondAgentId,
			roster: secondRoster,
			selectedToolIds: new Set(),
			now: () => NOW,
		});

		assert.deepEqual(second, { outcome: "invariant-violated", invariant: "R2" });
		assert.equal(readFileSync(registryPath, "utf8"), registryBeforeSecond, "registry.json must be unchanged by the refused second bind");
		assert.equal(
			readFileSync(join(targetDir, "conmuta.json"), "utf8"),
			conmutaBeforeSecond,
			"conmuta.json must be unchanged by the refused second bind",
		);
	});
});

test("a selected tool's config entry and the instruction files are written for a successful bind", async () => {
	await withProjectBindFixture(async ({ db, registryPath, targetDir }) => {
		const outcome = await runProjectBind({
			db,
			registryPath,
			targetDir,
			botId: BOT_ID,
			groupId: GROUP_ID,
			agentId: AGENT_ID,
			roster: ROSTER,
			selectedToolIds: new Set(["claude-code"]),
			now: () => NOW,
		});

		assert.equal(outcome.outcome, "bound");
		if (outcome.outcome !== "bound") return;
		assert.equal(outcome.toolConfigResults.get("claude-code"), "created");

		const mcpJsonPath = join(targetDir, ".mcp.json");
		assert.equal(existsSync(mcpJsonPath), true);
		const mcpJson = JSON.parse(readFileSync(mcpJsonPath, "utf8"));
		assert.ok(mcpJson.mcpServers?.[MCP_SERVER_NAME]);
		assert.deepEqual(mcpJson.mcpServers[MCP_SERVER_NAME].args.slice(-3), ["mcp", "--project", outcome.project_id]);

		assert.equal(existsSync(join(targetDir, "AGENTS.md")), true);
		assert.equal(outcome.instructionFiles.agentsMd, "created");
		assert.equal(outcome.instructionFiles.claudeMd, "created");
		const claudeMd = readFileSync(join(targetDir, "CLAUDE.md"), "utf8");
		assert.ok(claudeMd.includes("@AGENTS.md"));
	});
});
