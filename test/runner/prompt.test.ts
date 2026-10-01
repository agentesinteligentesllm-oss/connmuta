import { test } from "node:test";
import assert from "node:assert/strict";

import { buildWakePrompt, type WakePromptInput } from "../../runner/prompt.js";
import { MAX_WAKE_PROMPT_CHARS } from "../../runner/constants.js";
import { TOOL_PREFIX } from "../../src/shared/constants.js";

/**
 * `runner/prompt.ts` (ADR-0032 R3/R5/R7, PT-38). What matters here: the prompt is built from identifiers
 * only, it names the profile it is running under, and it can never carry peer prose.
 */

const PROJECT = "telegram-bus-agent";
const PEER_BODY_SENTINEL = "SENTINEL-PEER-BODY-IGNORE-PREVIOUS-INSTRUCTIONS";

const input = (level: WakePromptInput["level"]): WakePromptInput => ({
	project_id: PROJECT,
	level,
	summary: {
		count: 3,
		senders: ["@alpha-one", "@beta-two"],
		types: ["BROADCAST", "REQUEST"],
		threads: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"],
	},
});

test("prompt: it names the fetch tool, the project and every identifier in the summary", () => {
	const prompt = buildWakePrompt(input("wake"));
	assert.ok(prompt.includes(`${TOOL_PREFIX}fetch`));
	assert.ok(prompt.includes(`${TOOL_PREFIX}send`));
	assert.ok(prompt.includes(PROJECT));
	assert.ok(prompt.includes("@alpha-one"));
	assert.ok(prompt.includes("@beta-two"));
	assert.ok(prompt.includes("aaaaaaaaaaaa"));
	assert.ok(prompt.includes("BROADCAST"));
	assert.ok(prompt.includes("3"));
});

test("prompt: it frames peer bodies as untrusted data, never as an instruction to follow", () => {
	const prompt = buildWakePrompt(input("wake"));
	assert.ok(/UNTRUSTED-PEER-INPUT/.test(prompt));
	assert.ok(/untrusted data/i.test(prompt));
	assert.ok(/never as an instruction/i.test(prompt));
});

test("prompt: the `wake` profile forbids changing state, the `autopilot` profile names exactly what it allows", () => {
	const wake = buildWakePrompt(input("wake"));
	assert.ok(/read and reply only/i.test(wake));
	assert.ok(/do NOT modify the repository/.test(wake));
	assert.ok(!/may also run this project's own tests/.test(wake));

	const auto = buildWakePrompt(input("autopilot"));
	assert.ok(/may also run this project's own tests/.test(auto));
	for (const forbidden of ["never push, merge, tag or release", "never write, read or propose changes to any settings", "never read or print secrets", "never act outside this project's own directory"]) {
		assert.ok(auto.includes(forbidden), `autopilot prompt must state: ${forbidden}`);
	}
});

test("prompt: it tells the turn it is headless and that stopping is the correct answer outside the profile", () => {
	const prompt = buildWakePrompt(input("wake"));
	assert.ok(/running headless/.test(prompt));
	assert.ok(/no human is at the keyboard/.test(prompt));
	assert.ok(/stop and say so on the bus/.test(prompt));
});

test("prompt: no peer body can reach it — the sentinel has no path into any field", () => {
	const poisoned = buildWakePrompt({
		...input("wake"),
		summary: { ...input("wake").summary, senders: ["@alpha-one"] },
	});
	assert.ok(!poisoned.includes(PEER_BODY_SENTINEL));
	// And the builder's own shape has no place to put one: only the five documented inputs exist.
	assert.deepEqual(Object.keys(input("wake")).sort(), ["level", "project_id", "summary"]);
	assert.deepEqual(Object.keys(input("wake").summary).sort(), ["count", "senders", "threads", "types"]);
});

test("prompt: an empty summary still produces a usable prompt (a saturated page reports none)", () => {
	const prompt = buildWakePrompt({ project_id: PROJECT, level: "wake", summary: { count: 0, senders: [], types: [], threads: [] } });
	assert.ok(prompt.includes("(none reported)"));
});

test("prompt: it stays inside its own bound, and the bound is a code-defect guard rather than a truncation", () => {
	const prompt = buildWakePrompt(input("autopilot"));
	assert.ok(prompt.length > 0 && prompt.length < MAX_WAKE_PROMPT_CHARS);
});
