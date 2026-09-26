import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PROJECT_FILE_SCHEMA_VERSION } from "../../src/shared/constants.js";
import { parseProjectFile } from "../../src/shared/project-file.js";
import {
	serializeProjectFile,
	verifyProjectFileMatches,
	writeProjectFile,
	type IntendedProjectBinding,
} from "../../src/shared/project-file-writer.js";

/**
 * `shared/project-file-writer.ts` (design.md §2.1, §8.2; registry-authoring spec "conmuta.json
 * writer writes identifiers only, write-if-absent or verify").
 */

const INTENDED: IntendedProjectBinding = {
	project_id: "prj-example",
	group_id: -1001234567890,
	roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" }],
};

/** Runs `body` against a fresh temp directory and removes it afterwards, even on failure. */
function withTempDir(body: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-project-file-writer-"));
	try {
		body(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("an absent file is written as identifiers-only and parses through the strict schema", () => {
	withTempDir((dir) => {
		const path = join(dir, "conmuta.json");

		const outcome = writeProjectFile({ path, intended: INTENDED });

		assert.deepEqual(outcome, { outcome: "written" });
		const writtenText = readFileSync(path, "utf8");
		const writtenRaw = JSON.parse(writtenText) as Record<string, unknown>;
		assert.deepEqual(Object.keys(writtenRaw).sort(), ["group_id", "project_id", "roster", "schema_version"]);
		assert.equal(writtenRaw["schema_version"], PROJECT_FILE_SCHEMA_VERSION);

		const parsed = parseProjectFile(writtenText);
		assert.equal(parsed.ok, true, JSON.stringify(parsed.ok ? [] : parsed.problems));
	});
});

test("an existing file matching the intended binding exactly is left untouched", () => {
	withTempDir((dir) => {
		const path = join(dir, "conmuta.json");
		// A compact, differently-formatted (but content-equal) file: proves the writer never rewrites
		// it, rather than merely rewriting it back to the same bytes by coincidence.
		const original = JSON.stringify({
			schema_version: PROJECT_FILE_SCHEMA_VERSION,
			project_id: INTENDED.project_id,
			group_id: INTENDED.group_id,
			roster: INTENDED.roster,
		});
		writeFileSync(path, original, "utf8");

		const outcome = writeProjectFile({ path, intended: INTENDED });

		assert.deepEqual(outcome, { outcome: "already-correct" });
		assert.equal(readFileSync(path, "utf8"), original, "the file must not be reformatted or rewritten");
	});
});

test("an existing file matching the intended roster in a different order is still already-correct", () => {
	withTempDir((dir) => {
		const path = join(dir, "conmuta.json");
		const reordered: IntendedProjectBinding = {
			...INTENDED,
			roster: [
				{ agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" },
				INTENDED.roster[0],
			],
		};
		writeFileSync(path, serializeProjectFile(reordered), "utf8");
		const sameMembersDifferentOrder: IntendedProjectBinding = {
			...INTENDED,
			roster: [reordered.roster[1], reordered.roster[0]],
		};

		const outcome = writeProjectFile({ path, intended: sameMembersDifferentOrder });

		assert.deepEqual(outcome, { outcome: "already-correct" });
	});
});

test("an existing file disagreeing on group_id is refused, names the disagreement, and is not overwritten", () => {
	withTempDir((dir) => {
		const path = join(dir, "conmuta.json");
		const original = serializeProjectFile({ ...INTENDED, group_id: -1009999999999 });
		writeFileSync(path, original, "utf8");

		const outcome = writeProjectFile({ path, intended: INTENDED });

		assert.deepEqual(outcome, { outcome: "refused", disagreements: ["group_id"] });
		assert.equal(readFileSync(path, "utf8"), original);
	});
});

test("an existing file disagreeing on project_id and roster reports both, and is not overwritten", () => {
	withTempDir((dir) => {
		const path = join(dir, "conmuta.json");
		const original = serializeProjectFile({
			project_id: "prj-other",
			group_id: INTENDED.group_id,
			roster: [{ agent_id: "@carol-agent", user_id: 100000003, username: "carol_example_bot" }],
		});
		writeFileSync(path, original, "utf8");

		const outcome = writeProjectFile({ path, intended: INTENDED });

		assert.deepEqual(outcome, { outcome: "refused", disagreements: ["project_id", "roster"] });
		assert.equal(readFileSync(path, "utf8"), original);
	});
});

test("an existing file that fails to parse is refused as unparseable, never overwritten", () => {
	withTempDir((dir) => {
		const path = join(dir, "conmuta.json");
		const original = "not json at all";
		writeFileSync(path, original, "utf8");

		const outcome = writeProjectFile({ path, intended: INTENDED });

		assert.deepEqual(outcome, { outcome: "refused", disagreements: ["unparseable"] });
		assert.equal(readFileSync(path, "utf8"), original);
	});
});

test("verifyProjectFileMatches is the same comparison writeProjectFile uses internally", () => {
	const text = serializeProjectFile(INTENDED);
	assert.deepEqual(verifyProjectFileMatches(text, INTENDED), { matches: true });
	assert.deepEqual(verifyProjectFileMatches(text, { ...INTENDED, project_id: "prj-different" }), {
		matches: false,
		disagreements: ["project_id"],
	});
});
