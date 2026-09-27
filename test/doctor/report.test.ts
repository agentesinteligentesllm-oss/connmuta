import { test } from "node:test";
import assert from "node:assert/strict";

import { formatFindings } from "../../src/doctor/report.js";
import type { Finding } from "../../src/doctor/checks/system.js";

/**
 * `doctor/report.ts` (design.md §9.1/§9.2's `redactTokenShapes` rule; tasks.md 14.5): pure formatting
 * of {@link Finding}s, mirroring `cli/validate.ts`'s `{exitCode, out, err}` shape.
 */

const BOT_ID = "900000888";
const FIXTURE_TOKEN = `${BOT_ID}:${"A".repeat(35)}`;

test("a passing finding lands in out with exitCode 0", () => {
	const findings: Finding[] = [{ id: "node-floor", status: "pass", detail: "node v24.15.0 meets the required floor (24.15.0)" }];
	const report = formatFindings(findings);
	assert.equal(report.exitCode, 0);
	assert.deepEqual(report.err, []);
	assert.equal(report.out.length, 1);
	assert.match(report.out[0] as string, /^\[pass\] node-floor: /);
});

test("a warn finding lands in out, and does not flip exitCode to non-zero", () => {
	const findings: Finding[] = [{ id: "home-acl", status: "warn", detail: "extra trustee present" }];
	const report = formatFindings(findings);
	assert.equal(report.exitCode, 0);
	assert.equal(report.out.length, 1);
	assert.deepEqual(report.err, []);
});

test("a fail finding lands in err and flips exitCode to non-zero", () => {
	const findings: Finding[] = [{ id: "ledger", status: "fail", detail: "quick_check reported damage" }];
	const report = formatFindings(findings);
	assert.equal(report.exitCode, 1);
	assert.deepEqual(report.out, []);
	assert.equal(report.err.length, 1);
	assert.match(report.err[0] as string, /^\[fail\] ledger: /);
});

test("a mix of pass, warn and fail findings splits into out/err in the given order, with exitCode 1", () => {
	const findings: Finding[] = [
		{ id: "node-floor", status: "pass", detail: "ok" },
		{ id: "home-acl", status: "warn", detail: "hmm" },
		{ id: "ledger", status: "fail", detail: "bad" },
		{ id: "daemon-lock", status: "pass", detail: "absent" },
	];
	const report = formatFindings(findings);
	assert.equal(report.exitCode, 1);
	assert.equal(report.out.length, 3);
	assert.equal(report.err.length, 1);
	assert.match(report.out[0] as string, /^\[pass\] node-floor:/);
	assert.match(report.out[1] as string, /^\[warn\] home-acl:/);
	assert.match(report.out[2] as string, /^\[pass\] daemon-lock:/);
	assert.match(report.err[0] as string, /^\[fail\] ledger:/);
});

test("no findings produces empty out/err and exitCode 0 (vacuously nothing failed)", () => {
	const report = formatFindings([]);
	assert.equal(report.exitCode, 0);
	assert.deepEqual(report.out, []);
	assert.deepEqual(report.err, []);
});

test("a token-shaped substring in a finding's detail is redacted before it is printed", () => {
	const findings: Finding[] = [
		{ id: "secrets-acl", status: "fail", detail: `unexpected trustee token-shaped-lookalike ${FIXTURE_TOKEN} in ACL dump` },
	];
	const report = formatFindings(findings);
	assert.equal(report.err.length, 1);
	const line = report.err[0] as string;
	assert.equal(line.includes(FIXTURE_TOKEN), false, "the raw token shape must never reach the formatted line");
	assert.match(line, /<redacted>/);
});
