import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { editFile, FileEditRefusal, type FormatAdapter } from "../../src/installer/file-edit.js";
import { jsoncAdapter } from "../../src/installer/formats/jsonc.js";
import { tomlAdapter } from "../../src/installer/formats/toml.js";
import { buildLauncherEntry } from "../../src/installer/launcher.js";
import {
	resolveToolConfigPath,
	toolConfigEntryPath,
	TOOL_CONFIG_TARGETS,
	type ToolConfigTarget,
} from "../../src/installer/tool-targets.js";
import { BACKUP_SUFFIX_PREFIX, MCP_SERVER_NAME } from "../../src/installer/constants.js";

/**
 * Integration test for the 8-surface merge (tasks.md PR-05, Unit 3; closes B-05). Runs the real,
 * already-built `editFile` against real fixture files, dispatching to the real
 * `jsoncAdapter`/`tomlAdapter` per `TOOL_CONFIG_TARGETS` row — it reimplements no parsing/merging
 * logic of its own (design.md §4.2, §7.2; spec.md `tool-config-merge`).
 *
 * Every fixture (`test/fixtures/tool-configs/<id>/{populated,conflict,malformed}.*`) shares four
 * literal markers so one loop can assert the same properties across all 8 surfaces:
 * - `UNRELATED_ARG_MARKER`: inside a pre-existing, differently-named entry.
 * - `NON_MCP_VALUE_MARKER`: the value of a pre-existing non-MCP key.
 * - `OLD_COMMAND_MARKER`: the conflict fixture's own pre-existing `conmuta`-entry command.
 * - `COMMENT_MARKER`: present only in the 4 populated fixtures with a line or block comment
 *   (`claude-code`, `gemini-cli`: line comments; `opencode`, `antigravity`: block comments).
 *   `claude-code/populated.json` is installed with CRLF line endings (the one JSON fixture
 *   carrying that convention, per tasks.md 5.1) — applied by {@link installFixture} at copy time,
 *   never committed as CRLF bytes (this repo's `.gitattributes` would flatten those to LF anyway).
 */

const UNRELATED_ARG_MARKER = "keep-this-other-entry";
const NON_MCP_VALUE_MARKER = "keep-this-custom-value";
const OLD_COMMAND_MARKER = "old-pre-existing-command";
const COMMENT_MARKER = "keep this comment";
const SURFACES_WITH_COMMENTS = new Set(["claude-code", "gemini-cli", "opencode", "antigravity"]);

type FixtureName = "populated" | "conflict" | "malformed";

// dist/test/installer/tool-config-merge.test.js -> repo root is three levels up.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURES_ROOT = join(REPO_ROOT, "test/fixtures/tool-configs");

const LAUNCHER = buildLauncherEntry("test-project");

function adapterFor(target: ToolConfigTarget) {
	return target.id === "codex-cli" ? tomlAdapter : jsoncAdapter;
}

function fixtureExtension(target: ToolConfigTarget): string {
	return target.id === "codex-cli" ? "toml" : "json";
}

function fixturePath(target: ToolConfigTarget, name: FixtureName): string {
	return join(FIXTURES_ROOT, target.id, `${name}.${fixtureExtension(target)}`);
}

function withTempProjectDir(body: (projectDir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-tool-config-merge-"));
	try {
		body(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * The one fixture exercising CRLF input (tasks.md 5.1). Committed as plain LF — this repo's
 * `.gitattributes` (`* text=auto eol=lf`) would silently flatten any committed CRLF bytes back to
 * LF on checkout, defeating the fixture's purpose without failing any test — so CRLF is applied
 * here, at copy time, the same way `jsonc.test.ts`'s own CRLF case builds it in memory rather than
 * relying on a file's committed bytes.
 */
const CRLF_FIXTURE: { readonly toolId: ToolConfigTarget["id"]; readonly name: FixtureName } = {
	toolId: "claude-code",
	name: "populated",
};

/** Copies `name`'s fixture to `target`'s resolved path under `projectDir`, creating parent dirs. */
function installFixture(projectDir: string, target: ToolConfigTarget, name: FixtureName): string {
	const destPath = resolveToolConfigPath(projectDir, target);
	mkdirSync(dirname(destPath), { recursive: true });
	if (target.id === CRLF_FIXTURE.toolId && name === CRLF_FIXTURE.name) {
		const lfText = readFileSync(fixturePath(target, name), "utf8");
		writeFileSync(destPath, lfText.replace(/\r?\n/g, "\r\n"));
	} else {
		copyFileSync(fixturePath(target, name), destPath);
	}
	return destPath;
}

/** The pre-edit backup sibling `editFile` writes alongside `path`, if any. */
function findBackupSibling(path: string): string | undefined {
	const dir = dirname(path);
	const base = basename(path);
	return readdirSync(dir).find((name) => name.startsWith(`${base}${BACKUP_SUFFIX_PREFIX}`));
}

/**
 * Asserts the bytes outside the edited container are untouched (D-36).
 *
 * `jsoncAdapter`'s `modify`+`applyEdits` reformats the whole edited container's body once it
 * already holds a sibling entry (its indentation is relearned and reprinted for every key in that
 * object, not just the inserted one) — the sibling entry's own survival is checked semantically via
 * marker `.includes()` in the caller, matching this project's own `jsonc.test.ts` precedent.
 * `tomlAdapter` never rewrites existing bytes at all: the whole original file is an unmodified
 * prefix of the result (design.md §4.2, D-45).
 */
function assertBytesOutsideContainerPreserved(target: ToolConfigTarget, adapter: FormatAdapter, originalText: string, writtenText: string): void {
	if (adapter === tomlAdapter) {
		assert.equal(writtenText.slice(0, originalText.length), originalText, `${target.id}: TOML append must keep every original byte as a prefix`);
		return;
	}

	const containerKeyMarker = `"${target.containerKey}"`;
	const beforeContainerLength = originalText.indexOf(containerKeyMarker);
	assert.ok(beforeContainerLength >= 0, `${target.id}: expected to find the container key in the fixture`);
	assert.equal(
		originalText.slice(0, beforeContainerLength),
		writtenText.slice(0, beforeContainerLength),
		`${target.id}: content before the edited container must be byte-identical`,
	);

	const suffixMarker = `"customSetting": "${NON_MCP_VALUE_MARKER}"`;
	const originalSuffixIndex = originalText.indexOf(suffixMarker);
	const writtenSuffixIndex = writtenText.indexOf(suffixMarker);
	assert.ok(originalSuffixIndex >= 0 && writtenSuffixIndex >= 0, `${target.id}: expected to find the non-MCP key in both texts`);
	assert.equal(
		originalText.slice(originalSuffixIndex),
		writtenText.slice(writtenSuffixIndex),
		`${target.id}: content after the edited container must be byte-identical`,
	);
}

for (const target of TOOL_CONFIG_TARGETS) {
	const adapter = adapterFor(target);
	const entryPath = toolConfigEntryPath(target, MCP_SERVER_NAME);
	const intendedEntry = target.buildEntry(LAUNCHER);

	test(`${target.id}: populated merges, preserves surrounding bytes, and takes a backup`, () => {
		withTempProjectDir((projectDir) => {
			const path = installFixture(projectDir, target, "populated");
			// Read back what installFixture actually wrote (not the source fixture path): the
			// claude-code case is CRLF-converted at copy time and must be compared against that.
			const originalText = readFileSync(path, "utf8");

			const outcome = editFile({ path, adapter, entryPath, entry: intendedEntry });

			assert.equal(outcome, "written");
			const writtenText = readFileSync(path, "utf8");
			assert.ok(writtenText.includes(UNRELATED_ARG_MARKER), `${target.id}: unrelated entry must survive`);
			assert.ok(writtenText.includes(NON_MCP_VALUE_MARKER), `${target.id}: non-MCP key must survive`);
			if (SURFACES_WITH_COMMENTS.has(target.id)) {
				assert.ok(writtenText.includes(COMMENT_MARKER), `${target.id}: pre-existing comment must survive`);
			}

			assertBytesOutsideContainerPreserved(target, adapter, originalText, writtenText);

			const parsed = adapter.parse(writtenText) as Record<string, unknown>;
			const container = parsed[target.containerKey] as Record<string, unknown>;
			assert.deepEqual(container[MCP_SERVER_NAME], intendedEntry);

			const backupName = findBackupSibling(path);
			assert.ok(backupName !== undefined, `${target.id}: expected a pre-edit backup sibling`);
			assert.equal(readFileSync(join(dirname(path), backupName as string), "utf8"), originalText);
		});
	});

	test(`${target.id}: conflict refuses with a diff and makes no write`, () => {
		withTempProjectDir((projectDir) => {
			const originalText = readFileSync(fixturePath(target, "conflict"), "utf8");
			const path = installFixture(projectDir, target, "conflict");

			assert.throws(
				() => editFile({ path, adapter, entryPath, entry: intendedEntry }),
				(error: unknown) =>
					error instanceof FileEditRefusal && error.reason === "conflict" && error.message.includes(OLD_COMMAND_MARKER),
			);
			assert.equal(readFileSync(path, "utf8"), originalText, `${target.id}: a refused conflict must leave the file untouched`);
			assert.equal(findBackupSibling(path), undefined, `${target.id}: a refused conflict must take no backup`);
		});
	});

	test(`${target.id}: malformed refuses as a parse error and makes no write`, () => {
		withTempProjectDir((projectDir) => {
			const originalText = readFileSync(fixturePath(target, "malformed"), "utf8");
			const path = installFixture(projectDir, target, "malformed");

			assert.throws(
				() => editFile({ path, adapter, entryPath, entry: intendedEntry }),
				(error: unknown) => error instanceof FileEditRefusal && error.reason === "parse-error",
			);
			assert.equal(readFileSync(path, "utf8"), originalText, `${target.id}: a refused parse must leave the file untouched`);
			assert.equal(findBackupSibling(path), undefined, `${target.id}: a refused parse must take no backup`);
		});
	});
}

test("a second run against an already-merged file is an idempotent no-op, not a refusal", () => {
	const target = TOOL_CONFIG_TARGETS.find((candidate) => candidate.id === "claude-code");
	assert.ok(target, "expected a claude-code row in TOOL_CONFIG_TARGETS");
	const adapter = adapterFor(target as ToolConfigTarget);
	const entryPath = toolConfigEntryPath(target as ToolConfigTarget, MCP_SERVER_NAME);
	const intendedEntry = (target as ToolConfigTarget).buildEntry(LAUNCHER);

	withTempProjectDir((projectDir) => {
		const path = installFixture(projectDir, target as ToolConfigTarget, "populated");
		assert.equal(editFile({ path, adapter, entryPath, entry: intendedEntry }), "written");

		const writtenText = readFileSync(path, "utf8");
		const outcome = editFile({ path, adapter, entryPath, entry: intendedEntry });

		assert.equal(outcome, "noop");
		assert.equal(readFileSync(path, "utf8"), writtenText, "a no-op re-run must not change the file");
	});
});
