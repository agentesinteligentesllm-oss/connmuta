import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runRegistryChecks, type Finding } from "../../../src/doctor/checks/registry.js";
import { MCP_SERVER_NAME } from "../../../src/shared/constants.js";
import type { ProjectRosterEntry } from "../../../src/shared/project-file.js";
import { serializeProjectFile, type IntendedProjectBinding } from "../../../src/shared/project-file-writer.js";
import { activeBinding, validRegistryDocument, type JsonObject } from "../../registry/fixtures.js";

/**
 * `doctor/checks/registry.ts` (design.md §9.1's "Registry" row, spec.md "Registry tier checks
 * bijective invariants and the token-shape scan"; tasks.md PR-15, closing unit 8). A real temp home
 * and real temp project directories per scenario, mirroring `test/doctor/checks/system.test.ts`'s own
 * harness — never the real `~/.conmuta` or a mocked filesystem.
 */

const REGISTRY_FILE_NAME = "registry.json";
const PROJECT_FILE_NAME = "conmuta.json";

/** The one roster entry `validRegistryDocument()`'s default binding carries. */
const ALICE_ROSTER: readonly ProjectRosterEntry[] = [{ agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" }];

function withTempHome(run: (homeDir: string) => void): void {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-doctor-registry-home-"));
	try {
		run(homeDir);
	} finally {
		rmSync(homeDir, { recursive: true, force: true });
	}
}

function withTempProject(run: (projectDir: string) => void): void {
	const projectDir = mkdtempSync(join(tmpdir(), "conmuta-doctor-registry-project-"));
	try {
		run(projectDir);
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
}

function writeRegistry(homeDir: string, document: unknown): void {
	writeFileSync(join(homeDir, REGISTRY_FILE_NAME), JSON.stringify(document, null, 2), "utf8");
}

function writeMcpJson(projectDir: string, relativePath: string, entry: Record<string, unknown>): void {
	const path = join(projectDir, relativePath);
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: entry } }, null, 2), "utf8");
}

function findingOf(findings: readonly Finding[], id: string): Finding {
	const finding = findings.find((f) => f.id === id);
	assert.ok(
		finding !== undefined,
		`expected a finding with id '${id}', got: ${findings.map((f) => f.id).join(", ")}`,
	);
	return finding as Finding;
}

/** A registry document with its one project's `path` pointed at a real temp directory. */
function registryDocumentFor(projectDir: string): ReturnType<typeof validRegistryDocument> {
	const document = validRegistryDocument();
	(document.projects[0] as JsonObject)["path"] = projectDir;
	return document;
}

test("an absent registry.json is a pass finding ('not yet created'), not a fail", () => {
	withTempHome((homeDir) => {
		const findings = runRegistryChecks({ homeDir });
		assert.deepEqual(findings.map((f) => f.id), ["registry-parse-unreadable"]);
		assert.equal(findings[0].status, "pass");
		assert.match(findings[0].detail, /not yet created/);
	});
});

test("a fully valid registry and bound project produce no fail findings", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));

			const intended: IntendedProjectBinding = { project_id: "prj-example", group_id: -1001234567890, roster: ALICE_ROSTER };
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), serializeProjectFile(intended), "utf8");
			writeMcpJson(projectDir, ".mcp.json", { command: "node", args: ["x"] });

			const findings = runRegistryChecks({ homeDir });
			assert.deepEqual(
				findings.filter((f) => f.status === "fail"),
				[],
			);
			assert.equal(findingOf(findings, "referential-integrity-prj-example").status, "pass");
			assert.equal(findingOf(findings, "r4-project-prj-example").status, "pass");
			assert.equal(findingOf(findings, "token-shape-prj-example").status, "pass");
			assert.equal(findingOf(findings, "mcp-json-readers-prj-example").status, "pass");
			assert.match(findingOf(findings, "mcp-json-readers-prj-example").detail, /Claude Code/);
		});
	});
});

test("an R1 invariant violation reports only the invariant finding and skips every other check", () => {
	withTempHome((homeDir) => {
		const document = validRegistryDocument();
		document.groups.push({ group_id: -999888777, added_at: "2026-09-16T00:00:00Z" });
		document.projects.push({ project_id: "prj-dup", path: "C:\\work\\dup" });
		document.bindings.push(activeBinding({ project_id: "prj-dup", group_id: -999888777 }));
		writeRegistry(homeDir, document);

		const findings = runRegistryChecks({ homeDir });
		assert.ok(findings.every((f) => f.id.startsWith("registry-invariant-")));
		assert.ok(findings.some((f) => f.id === "registry-invariant-r1" && f.status === "fail"));
	});
});

test("R5 forbidden content on ordinary human-authored text is a warn finding citing B-30", () => {
	withTempHome((homeDir) => {
		const document = validRegistryDocument();
		(document.groups[0] as JsonObject)["title"] = "Budget API_KEY=123";
		writeRegistry(homeDir, document);

		const findings = runRegistryChecks({ homeDir });
		assert.deepEqual(
			findings.map((f) => f.id),
			["registry-forbidden-content"],
		);
		const finding = findings[0];
		assert.equal(finding.status, "warn");
		assert.match(finding.detail, /B-30/);
		assert.equal(finding.detail.includes("API_KEY=123"), false);
	});
});

test("a binding referencing a nonexistent bot_id is reported as a dangling reference", () => {
	withTempHome((homeDir) => {
		const document = validRegistryDocument();
		const DANGLING_BOT_ID = 100099999;
		(document.bindings[0] as JsonObject)["bot_id"] = DANGLING_BOT_ID;
		((document.bindings[0] as JsonObject)["roster_snapshot"] as JsonObject[])[0]["user_id"] = DANGLING_BOT_ID;
		writeRegistry(homeDir, document);

		const findings = runRegistryChecks({ homeDir });
		const finding = findingOf(findings, "referential-integrity-prj-example");
		assert.equal(finding.status, "fail");
		assert.match(finding.detail, new RegExp(`bot_id ${DANGLING_BOT_ID}`));
	});
});

test("a conmuta.json disagreeing on group_id with its binding is an R4 fail finding naming the project", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));

			const wrong: IntendedProjectBinding = { project_id: "prj-example", group_id: -1, roster: ALICE_ROSTER };
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), serializeProjectFile(wrong), "utf8");

			const findings = runRegistryChecks({ homeDir });
			const finding = findingOf(findings, "r4-project-prj-example");
			assert.equal(finding.status, "fail");
			assert.match(finding.detail, /group_id/);
		});
	});
});

test("a missing conmuta.json is an R4 fail finding distinct from a mismatch", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));
			// No conmuta.json written at all.

			const findings = runRegistryChecks({ homeDir });
			const finding = findingOf(findings, "r4-project-prj-example");
			assert.equal(finding.status, "fail");
			assert.match(finding.detail, /missing/);
			assert.doesNotMatch(finding.detail, /disagrees/);
			assert.equal(
				findings.some((f) => f.id === "token-shape-prj-example"),
				false,
			);
		});
	});
});

test("a token-shaped roster field is reported by field name, never by value", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));

			const TOKEN_SHAPE = `123456789:${"A".repeat(35)}`;
			const projectFileText = JSON.stringify({
				schema_version: 1,
				project_id: "prj-example",
				group_id: -1001234567890,
				roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: TOKEN_SHAPE }],
			});
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), projectFileText, "utf8");

			const findings = runRegistryChecks({ homeDir });
			const finding = findingOf(findings, "token-shape-prj-example");
			assert.equal(finding.status, "fail");
			assert.match(finding.detail, /roster\[0\]\.username/);
			assert.equal(finding.detail.includes(TOKEN_SHAPE), false);
		});
	});
});

test("identical entries in .pi/mcp.json and .mcp.json are reported as a Pi duplicate", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));
			const intended: IntendedProjectBinding = { project_id: "prj-example", group_id: -1001234567890, roster: ALICE_ROSTER };
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), serializeProjectFile(intended), "utf8");

			const entry = { command: "node", args: ["x"] };
			writeMcpJson(projectDir, ".mcp.json", entry);
			writeMcpJson(projectDir, join(".pi", "mcp.json"), entry);

			const findings = runRegistryChecks({ homeDir });
			const finding = findingOf(findings, "pi-duplicate-prj-example");
			assert.equal(finding.status, "warn");
		});
	});
});

test("only .mcp.json present reports the .mcp.json-readers informational finding and no Pi duplicate", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));
			const intended: IntendedProjectBinding = { project_id: "prj-example", group_id: -1001234567890, roster: ALICE_ROSTER };
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), serializeProjectFile(intended), "utf8");
			writeMcpJson(projectDir, ".mcp.json", { command: "node", args: ["x"] });

			const findings = runRegistryChecks({ homeDir });
			assert.equal(findingOf(findings, "mcp-json-readers-prj-example").status, "pass");
			assert.equal(
				findings.some((f) => f.id === "pi-duplicate-prj-example"),
				false,
			);
		});
	});
});

test("a tool config file that fails to parse is reported as a fail finding", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));
			const intended: IntendedProjectBinding = { project_id: "prj-example", group_id: -1001234567890, roster: ALICE_ROSTER };
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), serializeProjectFile(intended), "utf8");
			writeFileSync(join(projectDir, ".mcp.json"), "{ not valid json", "utf8");

			const findings = runRegistryChecks({ homeDir });
			const finding = findingOf(findings, "tool-config-prj-example-claude-code");
			assert.equal(finding.status, "fail");
		});
	});
});

test("an uncovered tool-config file in a git-directory project is flagged with a warn finding (D-52)", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));
			const intended: IntendedProjectBinding = { project_id: "prj-example", group_id: -1001234567890, roster: ALICE_ROSTER };
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), serializeProjectFile(intended), "utf8");
			writeMcpJson(projectDir, ".mcp.json", { command: "node", args: ["x"] });
			mkdirSync(join(projectDir, ".git"));

			const findings = runRegistryChecks({ homeDir });
			const finding = findingOf(findings, "gitignore-coverage-prj-example-claude-code");
			assert.equal(finding.status, "warn");
			assert.match(finding.detail, /\.mcp\.json/);
			assert.doesNotMatch(finding.detail, /is tracked by git/);
		});
	});
});

test("a tool-config file already covered by .gitignore in a git-directory project is not flagged", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));
			const intended: IntendedProjectBinding = { project_id: "prj-example", group_id: -1001234567890, roster: ALICE_ROSTER };
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), serializeProjectFile(intended), "utf8");
			writeMcpJson(projectDir, ".mcp.json", { command: "node", args: ["x"] });
			mkdirSync(join(projectDir, ".git"));
			writeFileSync(join(projectDir, ".gitignore"), "/.mcp.json\n", "utf8");

			const findings = runRegistryChecks({ homeDir });
			assert.equal(
				findings.some((f) => f.id === "gitignore-coverage-prj-example-claude-code"),
				false,
			);
		});
	});
});

test("a project with no .git path reports no gitignore-coverage finding at all", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));
			const intended: IntendedProjectBinding = { project_id: "prj-example", group_id: -1001234567890, roster: ALICE_ROSTER };
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), serializeProjectFile(intended), "utf8");
			writeMcpJson(projectDir, ".mcp.json", { command: "node", args: ["x"] });
			// No `.git` path of any kind is created.

			const findings = runRegistryChecks({ homeDir });
			assert.equal(
				findings.some((f) => f.id.startsWith("gitignore-coverage-")),
				false,
			);
		});
	});
});

test("a .gitignore that cannot be read (e.g. a directory in its place) reports its own warn finding instead of throwing", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));
			const intended: IntendedProjectBinding = { project_id: "prj-example", group_id: -1001234567890, roster: ALICE_ROSTER };
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), serializeProjectFile(intended), "utf8");
			writeMcpJson(projectDir, ".mcp.json", { command: "node", args: ["x"] });
			mkdirSync(join(projectDir, ".git"));
			mkdirSync(join(projectDir, ".gitignore"));

			const findings = runRegistryChecks({ homeDir });
			const finding = findingOf(findings, "gitignore-unreadable-prj-example");
			assert.equal(finding.status, "warn");
			assert.equal(
				findings.some((f) => f.id.startsWith("gitignore-coverage-")),
				false,
			);
			// The r4-project fail finding for this same binding is still present: a .gitignore read
			// failure does not abort the rest of boundProjectFindings for its own binding either.
			assert.ok(findings.some((f) => f.id === "r4-project-prj-example"));
		});
	});
});

test("a file-shaped .git (linked worktree/submodule) is still detected via existsSync, not isDirectory", () => {
	withTempHome((homeDir) => {
		withTempProject((projectDir) => {
			writeRegistry(homeDir, registryDocumentFor(projectDir));
			const intended: IntendedProjectBinding = { project_id: "prj-example", group_id: -1001234567890, roster: ALICE_ROSTER };
			writeFileSync(join(projectDir, PROJECT_FILE_NAME), serializeProjectFile(intended), "utf8");
			writeMcpJson(projectDir, ".mcp.json", { command: "node", args: ["x"] });
			writeFileSync(join(projectDir, ".git"), "gitdir: ../somewhere\n", "utf8");

			const findings = runRegistryChecks({ homeDir });
			const finding = findingOf(findings, "gitignore-coverage-prj-example-claude-code");
			assert.equal(finding.status, "warn");
		});
	});
});
