import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { checkFileEdit, editFile, FileEditRefusal, formatBackupTimestamp, type FormatAdapter } from "../../src/installer/file-edit.js";
import { BACKUP_SUFFIX_PREFIX } from "../../src/installer/constants.js";

/**
 * `installer/file-edit.ts`'s seven-step pipeline (design.md §4.1, tasks.md PR-02 sub-task 2.1).
 *
 * These tests exercise the pipeline itself against a minimal in-file {@link FormatAdapter}, kept
 * deliberately simple (a flat JSON object, a "BROKEN" sentinel standing in for a real parse error)
 * so failures here point at the pipeline, not at JSON/JSONC parsing specifics — those are
 * `test/installer/formats/jsonc.test.ts`'s job.
 */

const ENTRY_PATH = ["mcpServers", "conmuta"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setNested(base: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown> {
	if (path.length === 1) {
		return { ...base, [path[0]]: value };
	}
	const [head, ...rest] = path;
	const child = isPlainObject(base[head]) ? (base[head] as Record<string, unknown>) : {};
	return { ...base, [head]: setNested(child, rest, value) };
}

/** A minimal {@link FormatAdapter}: flat JSON, and a "BROKEN" sentinel standing in for a parse error. */
const fakeAdapter: FormatAdapter = {
	parse(text) {
		if (text.trim() === "") {
			return {};
		}
		if (text.trim().startsWith("BROKEN")) {
			throw new FileEditRefusal("parse-error", "invalid content at line 3, column 5: mock parse error");
		}
		return JSON.parse(text) as unknown;
	},
	buildText(text, entryPath, entry) {
		const base = text.trim() === "" ? {} : (JSON.parse(text) as Record<string, unknown>);
		return JSON.stringify(setNested(base, entryPath, entry), null, 2);
	},
};

/**
 * A {@link FormatAdapter} whose `buildText` always returns the `"CORRUPTED"` sentinel, and whose
 * `parse` throws on exactly that sentinel — standing in for a write step 7's readback catches (a
 * write that somehow produced content the format can no longer parse back).
 */
const corruptingAdapter: FormatAdapter = {
	parse(text) {
		if (text.trim() === "") {
			return {};
		}
		if (text.trim() === "CORRUPTED") {
			throw new FileEditRefusal("parse-error", "invalid content: mock post-write corruption");
		}
		return JSON.parse(text) as unknown;
	},
	buildText() {
		return "CORRUPTED";
	},
};

/** Runs `body` against a fresh temp directory and removes it afterwards, even on failure. */
function withTempDir(body: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-file-edit-"));
	try {
		body(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * Creates a symlink at `linkPath` pointing at `targetDir` (always a directory: a plain file symlink
 * needs a privilege this sandbox does not have). Falls back to a junction on `EPERM`, which Node
 * still reports as `isSymbolicLink() === true` — the exact predicate `editFile`'s step 1 checks — so
 * the refusal path under test is exercised either way.
 */
function linkDirectory(targetDir: string, linkPath: string): void {
	try {
		symlinkSync(targetDir, linkPath, "dir");
	} catch (error) {
		if (!isErrno(error, "EPERM")) {
			throw error;
		}
		symlinkSync(targetDir, linkPath, "junction");
	}
}

function isErrno(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function backupFilesFor(dir: string, targetFileName: string): string[] {
	return readdirSync(dir).filter((name) => name.startsWith(`${targetFileName}${BACKUP_SUFFIX_PREFIX}`));
}

test("refuses when the target path is itself a symlink (step 1)", () => {
	withTempDir((dir) => {
		const realDir = join(dir, "real");
		mkdirSync(realDir);
		const target = join(dir, "config.json");
		linkDirectory(realDir, target);

		assert.throws(
			() => editFile({ path: target, adapter: fakeAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } }),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "symlink",
		);
	});
});

test("refuses when the target's parent directory is a symlink (step 1)", () => {
	withTempDir((dir) => {
		const realDir = join(dir, "real");
		mkdirSync(realDir);
		const parentLink = join(dir, "linked-parent");
		linkDirectory(realDir, parentLink);
		const target = join(parentLink, "config.json");

		assert.throws(
			() => editFile({ path: target, adapter: fakeAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } }),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "symlink",
		);
	});
});

test("refuses a dangling symlink target instead of silently treating it as absent (step 1)", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		const missingTarget = join(dir, "does-not-exist");
		linkDirectory(missingTarget, target);

		// existsSync(target) is false here (it follows the link to a target that doesn't exist), which
		// is exactly the gap a naive existsSync-gated check would fall through: this must still refuse
		// as a symlink, not fall through to step 2's create-if-absent branch.
		assert.equal(existsSync(target), false);
		assert.throws(
			() => editFile({ path: target, adapter: fakeAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } }),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "symlink",
		);
	});
});

test("an absent file creates its parent directories and takes no backup", () => {
	withTempDir((dir) => {
		const target = join(dir, "nested", "sub", "config.json");
		const entry = { command: "node", args: ["x"] };

		const outcome = editFile({ path: target, adapter: fakeAdapter, entryPath: ENTRY_PATH, entry });

		assert.equal(outcome, "created");
		assert.equal(existsSync(target), true);
		const written = JSON.parse(readFileSync(target, "utf8")) as { mcpServers: { conmuta: unknown } };
		assert.deepEqual(written.mcpServers.conmuta, entry);
		assert.deepEqual(backupFilesFor(join(dir, "nested", "sub"), "config.json"), []);
	});
});

test("a present file with a parse error refuses citing the error position and writes nothing", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		writeFileSync(target, "BROKEN not json", "utf8");

		assert.throws(
			() => editFile({ path: target, adapter: fakeAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } }),
			(error: unknown) =>
				error instanceof FileEditRefusal && error.reason === "parse-error" && /line \d+, column \d+/.test(error.message),
		);
		assert.equal(readFileSync(target, "utf8"), "BROKEN not json");
	});
});

test("an identical same-named entry is a no-op: no write, no backup", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		const entry = { command: "node", args: ["x"] };
		const original = JSON.stringify({ mcpServers: { conmuta: entry } }, null, 2);
		writeFileSync(target, original, "utf8");

		const outcome = editFile({ path: target, adapter: fakeAdapter, entryPath: ENTRY_PATH, entry: { ...entry } });

		assert.equal(outcome, "noop");
		assert.equal(readFileSync(target, "utf8"), original);
		assert.deepEqual(backupFilesFor(dir, "config.json"), []);
	});
});

test("a different same-named entry refuses with a diff and writes nothing", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		const original = JSON.stringify({ mcpServers: { conmuta: { command: "old-command" } } }, null, 2);
		writeFileSync(target, original, "utf8");

		assert.throws(
			() => editFile({ path: target, adapter: fakeAdapter, entryPath: ENTRY_PATH, entry: { command: "new-command" } }),
			(error: unknown) =>
				error instanceof FileEditRefusal &&
				error.reason === "conflict" &&
				error.message.includes("- ") &&
				error.message.includes("+ ") &&
				error.message.includes("old-command") &&
				error.message.includes("new-command"),
		);
		assert.equal(readFileSync(target, "utf8"), original);
		assert.deepEqual(backupFilesFor(dir, "config.json"), []);
	});
});

test("a pre-existing backup filename collision never overwrites the earlier backup", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		const originalContent = "{}";
		writeFileSync(target, originalContent, "utf8");

		const fixedDate = new Date("2026-05-01T12:00:00.000Z");
		const collidingBackupPath = `${target}${BACKUP_SUFFIX_PREFIX}${formatBackupTimestamp(fixedDate)}`;
		writeFileSync(collidingBackupPath, "PRE-EXISTING-BACKUP-SENTINEL", "utf8");

		const outcome = editFile({
			path: target,
			adapter: fakeAdapter,
			entryPath: ENTRY_PATH,
			entry: { command: "node" },
			now: () => fixedDate,
		});

		assert.equal(outcome, "written");
		// The pre-existing backup must survive byte-for-byte: COPYFILE_EXCL refused the collision.
		assert.equal(readFileSync(collidingBackupPath, "utf8"), "PRE-EXISTING-BACKUP-SENTINEL");

		const backups = backupFilesFor(dir, basename(target));
		assert.equal(backups.length, 2, `expected exactly 2 backups, found: ${backups.join(", ")}`);
		const secondBackupName = backups.find((name) => name !== basename(collidingBackupPath));
		assert.ok(secondBackupName !== undefined, "expected a second, differently-named backup file");
		assert.equal(readFileSync(join(dir, secondBackupName as string), "utf8"), originalContent);

		const written = JSON.parse(readFileSync(target, "utf8")) as { mcpServers: { conmuta: unknown } };
		assert.deepEqual(written.mcpServers.conmuta, { command: "node" });
	});
});

test("step 7 restores the previous file from backup when the written content fails to re-parse", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		const original = JSON.stringify({ mcpServers: {} }, null, 2);
		writeFileSync(target, original, "utf8");

		assert.throws(
			() => editFile({ path: target, adapter: corruptingAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } }),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "verification-failed",
		);

		// Restored byte-for-byte from the pre-edit backup, not left holding the corrupted write.
		assert.equal(readFileSync(target, "utf8"), original);
	});
});

test("step 7 removes a newly-created file when the written content fails to re-parse", () => {
	withTempDir((dir) => {
		const target = join(dir, "new-config.json");

		assert.throws(
			() => editFile({ path: target, adapter: corruptingAdapter, entryPath: ENTRY_PATH, entry: { command: "node" } }),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "verification-failed",
		);

		// No backup existed to restore from (the file didn't exist before this call), so the failed
		// write is removed rather than left behind as a corrupted, half-installed file.
		assert.equal(existsSync(target), false);
	});
});

test("checkFileEdit returns 'created' without creating files or directories when target is absent", () => {
	withTempDir((dir) => {
		const target = join(dir, "nested", "config.json");
		const result = checkFileEdit({
			path: target,
			adapter: fakeAdapter,
			entryPath: ENTRY_PATH,
			entry: { command: "node" },
		});
		assert.equal(result, "created");
		assert.equal(existsSync(target), false, "target file must not be created");
		assert.equal(existsSync(join(dir, "nested")), false, "parent directory must not be created");
	});
});

test("checkFileEdit returns 'noop' when identical entry already exists, making zero writes", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		const original = JSON.stringify({ mcpServers: { conmuta: { command: "node" } } }, null, 2);
		writeFileSync(target, original, "utf8");

		const result = checkFileEdit({
			path: target,
			adapter: fakeAdapter,
			entryPath: ENTRY_PATH,
			entry: { command: "node" },
		});
		assert.equal(result, "noop");
		assert.equal(readFileSync(target, "utf8"), original, "target must remain byte-identical");
		assert.equal(backupFilesFor(dir, "config.json").length, 0, "no backup must be taken");
	});
});

test("checkFileEdit returns 'will-write' when entry is absent in existing file, making zero writes", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		const original = JSON.stringify({ mcpServers: { other: { command: "python" } } }, null, 2);
		writeFileSync(target, original, "utf8");

		const result = checkFileEdit({
			path: target,
			adapter: fakeAdapter,
			entryPath: ENTRY_PATH,
			entry: { command: "node" },
		});
		assert.equal(result, "will-write");
		assert.equal(readFileSync(target, "utf8"), original, "target must remain byte-identical");
		assert.equal(backupFilesFor(dir, "config.json").length, 0, "no backup must be taken");
	});
});

test("checkFileEdit throws FileEditRefusal('conflict') when a differing entry is already present, making zero writes", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		const original = JSON.stringify({ mcpServers: { conmuta: { command: "old-command" } } }, null, 2);
		writeFileSync(target, original, "utf8");

		assert.throws(
			() =>
				checkFileEdit({
					path: target,
					adapter: fakeAdapter,
					entryPath: ENTRY_PATH,
					entry: { command: "new-command" },
				}),
			(error: unknown) =>
				error instanceof FileEditRefusal &&
				error.reason === "conflict" &&
				error.message.includes("old-command") &&
				error.message.includes("new-command"),
		);
		assert.equal(readFileSync(target, "utf8"), original, "target must remain byte-identical");
		assert.equal(backupFilesFor(dir, "config.json").length, 0, "no backup must be taken");
	});
});

test("checkFileEdit throws FileEditRefusal('parse-error') when file contains syntax errors, making zero writes", () => {
	withTempDir((dir) => {
		const target = join(dir, "config.json");
		const malformed = "BROKEN content";
		writeFileSync(target, malformed, "utf8");

		assert.throws(
			() =>
				checkFileEdit({
					path: target,
					adapter: fakeAdapter,
					entryPath: ENTRY_PATH,
					entry: { command: "node" },
				}),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "parse-error",
		);
		assert.equal(readFileSync(target, "utf8"), malformed, "target must remain byte-identical");
		assert.equal(backupFilesFor(dir, "config.json").length, 0, "no backup must be taken");
	});
});

test("checkFileEdit throws FileEditRefusal('symlink') when target is a symlink", () => {
	withTempDir((dir) => {
		const realDir = join(dir, "real");
		mkdirSync(realDir);
		const target = join(dir, "config.json");
		linkDirectory(realDir, target);

		assert.throws(
			() =>
				checkFileEdit({
					path: target,
					adapter: fakeAdapter,
					entryPath: ENTRY_PATH,
					entry: { command: "node" },
				}),
			(error: unknown) => error instanceof FileEditRefusal && error.reason === "symlink",
		);
	});
});

