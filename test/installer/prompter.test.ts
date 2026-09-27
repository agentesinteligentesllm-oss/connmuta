import { test } from "node:test";
import assert from "node:assert/strict";

import { createPrompter } from "../../src/installer/prompter.js";

/**
 * `installer/prompter.ts` (design.md §6, §8.2, D-37, D-38; tasks.md 10.1): the wizard's sole
 * `@clack/prompts` seam.
 *
 * Only the TTY guard and the exported factory's shape are exercised here — driving a real
 * `@clack/prompts` interactive function (`text`/`select`/`multiselect`/`confirm`) would hang waiting
 * for real terminal input, so this suite never calls those beyond the synchronous, side-effect-free
 * `isCancel`.
 */

test("password() rejects when process.stdin.isTTY is falsy, before ever reaching @clack/prompts", async () => {
	const original = process.stdin.isTTY;
	process.stdin.isTTY = false;
	try {
		const prompter = createPrompter();
		await assert.rejects(() => prompter.password({ message: "token" }), /process\.stdin\.isTTY/);
	} finally {
		process.stdin.isTTY = original;
	}
});

test("createPrompter() exposes the full Prompter shape", () => {
	const prompter = createPrompter();

	assert.equal(typeof prompter.password, "function");
	assert.equal(typeof prompter.text, "function");
	assert.equal(typeof prompter.select, "function");
	assert.equal(typeof prompter.multiselect, "function");
	assert.equal(typeof prompter.confirm, "function");
	assert.equal(typeof prompter.isCancel, "function");
});

test("isCancel() delegates to @clack/prompts' own cancel-symbol check", () => {
	const prompter = createPrompter();

	assert.equal(prompter.isCancel(Symbol("not-cancel")), false);
	assert.equal(prompter.isCancel("a plain string"), false);
});
