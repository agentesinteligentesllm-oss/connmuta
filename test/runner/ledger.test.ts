import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	appendLedgerRow,
	ladderRow,
	notifyRow,
	readLedgerRows,
	refusedRow,
	wakeLedgerPathFor,
	wakeRow,
	type LedgerTrigger,
} from "../../runner/ledger.js";
import type { LadderLevel } from "../../runner/ladder.js";

/**
 * `runner/ledger.ts` (ADR-0032 R6/R6a, PT-36). The ledger is the satellite's only record of what it did, so
 * these tests are about two things: exactly one row per event, and a row that cannot carry a peer's prose.
 */

const PROJECT = "telegram-bus-agent";
const CTX = { ts: "2026-09-30T00:00:00.000Z", project_id: PROJECT, level: "wake" as LadderLevel };
const TRIGGER: LedgerTrigger = {
	count: 2,
	senders: ["@alpha-one"],
	types: ["BROADCAST"],
	threads: ["aaaaaaaaaaaa"],
};

/** Every key any row may carry. A new field added without this list being updated fails the shape tests. */
const ALLOWED_ROW_KEYS: readonly string[] = [
	"ts",
	"kind",
	"project_id",
	"level",
	"trigger",
	"reason",
	"harness",
	"outcome",
	"note",
];
/** A peer body sentinel: the builders have no parameter that could carry it, and the rows must not contain it. */
const PEER_BODY_SENTINEL = "SENTINEL-PEER-BODY-IGNORE-PREVIOUS-INSTRUCTIONS";

function withTempHome<T>(body: (home: string) => T): T {
	const home = mkdtempSync(join(tmpdir(), "conmuta-runner-ledger-"));
	try {
		return body(home);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}

test("ledger: one accepted wake writes exactly one row naming the trigger, the level and the action", () => {
	withTempHome((home) => {
		const path = wakeLedgerPathFor(home);
		appendLedgerRow(path, wakeRow(CTX, TRIGGER, "pi", "exited"));

		const rows = readLedgerRows(path);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].kind, "wake");
		assert.equal(rows[0].project_id, PROJECT);
		assert.equal(rows[0].level, "wake");
		assert.equal(rows[0].harness, "pi");
		assert.equal(rows[0].outcome, "exited");
		assert.deepEqual(rows[0].trigger, TRIGGER);
	});
});

test("ledger: every row kind carries only the documented keys — no field can smuggle a body", () => {
	for (const row of [
		wakeRow(CTX, TRIGGER, "pi", "exited"),
		refusedRow(CTX, "cooldown"),
		notifyRow(CTX, TRIGGER),
		ladderRow({ ...CTX, level: "off" }, "Director lowered it"),
	]) {
		for (const key of Object.keys(row)) {
			assert.ok(ALLOWED_ROW_KEYS.includes(key), `unexpected ledger key: ${key}`);
		}
		for (const value of Object.values(row)) {
			assert.ok(!JSON.stringify(value).includes(PEER_BODY_SENTINEL));
		}
	}
});

test("ledger: a refusal row carries a reason and no trigger — a bound is recorded, not inferred", () => {
	const row = refusedRow({ ...CTX, level: "autopilot" }, "budget_exhausted");
	assert.equal(row.kind, "refused");
	assert.equal(row.reason, "budget_exhausted");
	assert.equal(row.level, "autopilot");
	assert.equal(row.trigger, undefined);
});

test("ledger: rows append, in order, and never overwrite an earlier one", () => {
	withTempHome((home) => {
		const path = wakeLedgerPathFor(home);
		appendLedgerRow(path, notifyRow(CTX, TRIGGER));
		appendLedgerRow(path, refusedRow(CTX, "cooldown"));
		appendLedgerRow(path, wakeRow(CTX, TRIGGER, "claude", "timed_out"));

		const rows = readLedgerRows(path);
		assert.deepEqual(
			rows.map((row) => row.kind),
			["notify", "refused", "wake"],
		);
		assert.equal(readFileSync(path, "utf8").trim().split("\n").length, 3);
	});
});

test("ledger: an absent file reads as no rows, so a fresh machine is not an error", () => {
	withTempHome((home) => {
		assert.deepEqual(readLedgerRows(wakeLedgerPathFor(home)), []);
	});
});

test("ledger: a torn or corrupt line is skipped, never fatal — the read path must survive an incident", () => {
	withTempHome((home) => {
		const path = wakeLedgerPathFor(home);
		appendLedgerRow(path, wakeRow(CTX, TRIGGER, "pi", "exited"));
		// What a kill mid-write leaves behind: a half-written line, then a good one.
		appendFileSync(path, '{"ts":"2026-09-30T00:00:01.000Z","kind":"wake","proj\n', "utf8");
		appendLedgerRow(path, refusedRow(CTX, "cooldown"));

		const rows = readLedgerRows(path);
		assert.deepEqual(
			rows.map((row) => row.kind),
			["wake", "refused"],
			"the readable rows survive; only the torn one is dropped",
		);
	});
});

test("ledger: the ladder row records the human action next to the wakes it causes", () => {
	const row = ladderRow({ ts: CTX.ts, project_id: PROJECT, level: "autopilot" }, "Director: audited review only");
	assert.deepEqual(Object.keys(row).sort(), ["kind", "level", "note", "project_id", "ts"]);
	assert.equal(row.kind, "ladder");
	assert.equal(row.level, "autopilot");
});
