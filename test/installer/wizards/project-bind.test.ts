import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { MCP_SERVER_NAME } from "../../../src/installer/constants.js";
import { runProjectBind } from "../../../src/installer/wizards/project-bind.js";
import { USER_LEVEL_REGISTRATION_GUIDANCE } from "../../../src/installer/instructions.js";
import { parseRegistryDocument, type Registry } from "../../../src/registry/schema.js";
import { serializeRegistry } from "../../../src/registry/writer.js";
import { PROJECT_FILE_SCHEMA_VERSION, PROJECT_ID_PATTERN, REGISTRY_VERSION } from "../../../src/shared/constants.js";
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
		assert.deepEqual(mcpJson.mcpServers[MCP_SERVER_NAME].args.slice(1), ["mcp"]);
		assert.ok(
			!mcpJson.mcpServers[MCP_SERVER_NAME].args.includes("--project"),
			"ADR-0034: the written entry carries no project id — the binding comes from the conmuta.json this bind just wrote",
		);

		assert.equal(existsSync(join(targetDir, "AGENTS.md")), true);
		assert.equal(outcome.instructionFiles.agentsMd, "created");
		assert.equal(outcome.instructionFiles.claudeMd, "created");
		const claudeMd = readFileSync(join(targetDir, "CLAUDE.md"), "utf8");
		assert.ok(claudeMd.includes("@AGENTS.md"));
	});
});

test("a successful bind with no existing .gitignore appends a new anchored entry per written tool", async () => {
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
		assert.deepEqual(outcome.gitignoreResults.get("claude-code"), { alreadyCovered: false, appendedLine: "/.mcp.json" });

		const gitignoreText = readFileSync(join(targetDir, ".gitignore"), "utf8");
		assert.equal(gitignoreText, "/.mcp.json\n");
	});
});

test("a successful bind whose target's .gitignore already covers the tool's path leaves it untouched", async () => {
	await withProjectBindFixture(async ({ db, registryPath, targetDir }) => {
		const gitignorePath = join(targetDir, ".gitignore");
		const gitignoreBefore = "/.mcp.json\n";
		writeFileSync(gitignorePath, gitignoreBefore, "utf8");

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
		assert.deepEqual(outcome.gitignoreResults.get("claude-code"), { alreadyCovered: true });
		assert.equal(readFileSync(gitignorePath, "utf8"), gitignoreBefore, ".gitignore must be byte-identical, untouched");
	});
});

test(
	"resolveProjectId's suffix search terminates and yields a distinct id when a max-length slug is already taken (native review correction, R2-001/R3-project-id-suffix-infinite-loop)",
	async () => {
		await withProjectBindFixture(async ({ db, registryPath, targetDir }) => {
			// PROJECT_ID_PATTERN's own 41-char maximum (shared/constants.ts): before the fix, every
			// `${base}-${suffix}` candidate truncated back to this exact, already-taken 41-char base,
			// so the disambiguation loop never terminated.
			const maxLengthSlug = "x".repeat(41);
			const collidingTargetDir = join(dirname(targetDir), maxLengthSlug);
			mkdirSync(collidingTargetDir);

			const seeded = parseRegistryDocument({
				registry_version: REGISTRY_VERSION,
				bots: [],
				groups: [],
				projects: [{ project_id: maxLengthSlug, path: "C:\\some\\other\\already-registered-project" }],
				bindings: [],
			});
			assert.equal(seeded.ok, true, "fixture must itself be valid");
			if (!seeded.ok) return;
			writeFileSync(registryPath, serializeRegistry(seeded.registry), "utf8");

			const outcome = await runProjectBind({
				db,
				registryPath,
				targetDir: collidingTargetDir,
				botId: BOT_ID,
				groupId: GROUP_ID,
				agentId: AGENT_ID,
				roster: ROSTER,
				selectedToolIds: new Set(),
				now: () => NOW,
			});

			assert.equal(outcome.outcome, "bound");
			if (outcome.outcome !== "bound") return;
			assert.notEqual(outcome.project_id, maxLengthSlug, "the disambiguated id must differ from the already-taken base");
			assert.match(outcome.project_id, PROJECT_ID_PATTERN);
		});
	},
);

// Judgment Day round 1 (JD-B-003): the guidance is written by the wizard, so a test that only calls
// `printRegistrationGuidance` directly cannot tell whether the wizard still calls it — deleting that
// call left the suite green. This pins the call site: the recommendation must be the LAST line the
// wizard emits, after the selected tools' own trust steps.
test("a successful bind emits the id-free registration recommendation through the injected sink (B-109, ADR-0034)", async () => {
	await withProjectBindFixture(async ({ db, registryPath, targetDir }) => {
		const written: string[] = [];
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
			trustStepIo: { write: (line) => written.push(line) },
		});

		assert.equal(outcome.outcome, "bound");
		assert.ok(
			written.some((line) => line.includes("Claude Code")),
			"the selected tool's own trust step is still printed",
		);
		assert.equal(written.at(-1), USER_LEVEL_REGISTRATION_GUIDANCE, "the guidance is the last line the wizard prints");
	});
});
