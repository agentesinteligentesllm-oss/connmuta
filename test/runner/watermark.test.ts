import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readWatermark, readWatermarkFor, watermarkPathFor, writeWatermark } from "../../runner/watermark.js";

/**
 * `runner/watermark.ts` (ADR-0032 R3/R6). The audit of this phase found that the runner would re-read the
 * daemon's whole catch-up window on every restart, because a new IPC session mints a new `client_cursors` row.
 * These tests pin the fix: the watermark outlives the process, never moves backwards, and a broken file falls
 * back to the daemon's own seed rather than to zero.
 */

const PROJECT = "telegram-bus-agent";
const OTHER = "frisco-erp";

function withTempHome<T>(body: (home: string) => T): T {
	const home = mkdtempSync(join(tmpdir(), "conmuta-runner-watermark-"));
	mkdirSync(join(home, "runner"), { recursive: true });
	try {
		return body(home);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}

test("watermark: a fresh machine has none, and that is not an error", () => {
	withTempHome((home) => {
		assert.equal(readWatermarkFor(watermarkPathFor(home), PROJECT), undefined);
		assert.equal(readWatermark(watermarkPathFor(home)).problem, "missing");
	});
});

test("watermark: it round-trips and survives a second process reading the same file", () => {
	withTempHome((home) => {
		writeWatermark(watermarkPathFor(home), PROJECT, 42);
		// A second `readWatermarkFor` is what a restarted runner does: the value must come from the file.
		assert.equal(readWatermarkFor(watermarkPathFor(home), PROJECT), 42);
	});
});

test("watermark: it never moves backwards, so a replayed old value cannot re-open the backlog", () => {
	withTempHome((home) => {
		const path = watermarkPathFor(home);
		writeWatermark(path, PROJECT, 100);
		writeWatermark(path, PROJECT, 7);
		assert.equal(readWatermarkFor(path, PROJECT), 100);
	});
});

test("watermark: one binding's advance leaves the others alone", () => {
	withTempHome((home) => {
		const path = watermarkPathFor(home);
		writeWatermark(path, PROJECT, 10);
		writeWatermark(path, OTHER, 99);
		writeWatermark(path, PROJECT, 11);
		assert.equal(readWatermarkFor(path, PROJECT), 11);
		assert.equal(readWatermarkFor(path, OTHER), 99);
	});
});

test("watermark: a malformed file reads as absent rather than as zero", () => {
	withTempHome((home) => {
		const path = watermarkPathFor(home);
		writeFileSync(path, "{ not json", "utf8");
		const read = readWatermark(path);
		assert.equal(read.problem, "malformed");
		assert.equal(read.seqs.size, 0, "a broken file must not present seq 0 as a resume point");
		assert.equal(readWatermarkFor(path, PROJECT), undefined);
	});
});

test("watermark: a negative, fractional or non-numeric entry is not a watermark", () => {
	withTempHome((home) => {
		const path = watermarkPathFor(home);
		writeFileSync(path, JSON.stringify({ seqs: { [PROJECT]: -1, [OTHER]: "12", third: 1.5 } }), "utf8");
		const read = readWatermark(path);
		assert.equal(read.problem, null);
		assert.equal(read.seqs.size, 0);
	});
});

test("watermark: an unwritable target throws rather than silently losing the resume point", () => {
	withTempHome((home) => {
		// A directory where the file should be: the write cannot succeed, and the caller must see that.
		mkdirSync(watermarkPathFor(home), { recursive: true });
		assert.throws(() => writeWatermark(watermarkPathFor(home), PROJECT, 5));
	});
});
