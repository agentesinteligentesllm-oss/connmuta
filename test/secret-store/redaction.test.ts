import { test } from "node:test";
import assert from "node:assert/strict";

import { TELEGRAM_BOT_TOKEN_RE } from "../../src/shared/secrets.js";
import { redactTokenShapes } from "../../src/secret-store/redaction.js";

/**
 * The shared redactor (`src/secret-store/redaction.ts`, PT-08).
 *
 * Every audit/condition writer, `daemon/log.ts` and the Telegram client's error constructors route
 * text through this one function (design §6), so these cases pin the two properties those sinks
 * depend on: **every** match is replaced (not just the first), and text with no match is returned
 * unchanged.
 */

/** A fixture bot id, deliberately seven digits: it can never satisfy the 8–10 digit token shape (PT-22). */
const BOT_ID = "1234567";

/** A fixture token shaped like a real one but unmistakably synthetic. */
const FIXTURE_TOKEN = `${BOT_ID}:${"A".repeat(35)}`;

/** The literal the redactor substitutes (design §6). */
const PLACEHOLDER = "<redacted>";

test("a token-shaped substring is replaced by the placeholder", () => {
	assert.equal(redactTokenShapes(`token=${FIXTURE_TOKEN}`), `token=${PLACEHOLDER}`);
	assert.equal(redactTokenShapes(FIXTURE_TOKEN), PLACEHOLDER);
});

test("the placeholder leaves no fragment of the matched token behind", () => {
	const redacted = redactTokenShapes(`msg ${FIXTURE_TOKEN} end`);
	assert.equal(redacted, `msg ${PLACEHOLDER} end`);
	assert.equal(redacted.includes("A".repeat(35)), false, "the token body survived redaction");
});

test("every token in one string is redacted, not only the first", () => {
	const second = `7654321:${"B".repeat(35)}`;
	const redacted = redactTokenShapes(`first ${FIXTURE_TOKEN} then ${second} end`);
	assert.equal(redacted, `first ${PLACEHOLDER} then ${PLACEHOLDER} end`);
	// Non-vacuous: the second token was really present in the input and really matched the shape.
	assert.equal(TELEGRAM_BOT_TOKEN_RE.test(second), true);
});

test("text with no token shape passes through unchanged", () => {
	const plain = "connect ECONNREFUSED 127.0.0.1:443 — request id 42, no secret here";
	assert.equal(redactTokenShapes(plain), plain);
	assert.equal(redactTokenShapes(""), "");
});

test("a token one character short of the shape is not redacted", () => {
	// `{35}` is exact: 34 characters after the colon is not a token, and the redactor must not
	// swallow neighbouring text by over-matching.
	const almost = `${BOT_ID}:${"A".repeat(34)}`;
	assert.equal(redactTokenShapes(almost), almost);
});
