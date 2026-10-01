import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	ladderPathFor,
	readLadderFile,
	removeLadderEntry,
	resolveLadder,
	writeLadderEntry,
} from "../../runner/ladder.js";
import { HARNESS_NAMES, LADDER_SCHEMA_VERSION } from "../../runner/constants.js";
import { parseProjectFile } from "../../src/shared/project-file.js";

/**
 * `runner/ladder.ts` (ADR-0032 R4/R5, PT-35). The ladder is the satellite's only security decision: which
 * binding may be woken, and in which profile. Every test below is therefore about **failing closed** — a
 * record that cannot be trusted must resolve to `off`, never to a permissive default.
 *
 * Real temp directories, no mocks: the whole point of R4 is how a file on disk is read, so a fake reader
 * would test nothing. Every id is a placeholder (AGENTS.md §3).
 */

const PROJECT = "telegram-bus-agent";
const OTHER_PROJECT = "frisco-erp";

function withTempHome<T>(body: (home: string) => T): T {
	const home = mkdtempSync(join(tmpdir(), "conmuta-runner-ladder-"));
	try {
		// `ladderPathFor` names `<home>/runner/ladder.json`; the directory is the runner's own, so the fixture
		// creates it once and every hand-written file below lands where the reader looks.
		mkdirSync(join(home, "runner"), { recursive: true });
		return body(home);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}

const validEntry = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
	level: "wake",
	harness: "pi",
	by: "Director (placeholder note)",
	at: "2026-09-30T00:00:00.000Z",
	...overrides,
});

const ladderFile = (bindings: Record<string, unknown>): string =>
	JSON.stringify({ schema_version: LADDER_SCHEMA_VERSION, bindings });

test("ladder: a missing file resolves every binding to off with `no_record`", () => {
	withTempHome((home) => {
		const read = readLadderFile(ladderPathFor(home));
		assert.equal(read.problem, "missing");
		assert.deepEqual(resolveLadder(read, PROJECT), { kind: "off", reason: "no_record" });
	});
});

test("ladder: a binding with no record is off even when other bindings are enabled", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeFileSync(path, ladderFile({ [OTHER_PROJECT]: validEntry() }), "utf8");
		const read = readLadderFile(path);
		assert.deepEqual(resolveLadder(read, PROJECT), { kind: "off", reason: "no_record" });
		assert.equal(resolveLadder(read, OTHER_PROJECT).kind, "entry");
	});
});

test("ladder: an unparseable file resolves every binding to off with `malformed`, never to a default", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeFileSync(path, "{ this is not json", "utf8");
		const read = readLadderFile(path);
		assert.equal(read.problem, "malformed");
		assert.deepEqual(resolveLadder(read, PROJECT), { kind: "off", reason: "malformed" });
	});
});

test("ladder: a wrong or missing schema_version is malformed", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeFileSync(path, JSON.stringify({ schema_version: 99, bindings: { [PROJECT]: validEntry() } }), "utf8");
		assert.deepEqual(resolveLadder(readLadderFile(path), PROJECT), { kind: "off", reason: "malformed" });
	});
});

test("ladder: an unknown level is off with `unknown_level` (never the nearest known level)", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeFileSync(path, ladderFile({ [PROJECT]: validEntry({ level: "autopilot-please" }) }), "utf8");
		assert.deepEqual(resolveLadder(readLadderFile(path), PROJECT), { kind: "off", reason: "unknown_level" });
	});
});

test("ladder: an unknown harness is off with `unknown_harness` (the executable set is closed)", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeFileSync(path, ladderFile({ [PROJECT]: validEntry({ harness: "sh" }) }), "utf8");
		assert.deepEqual(resolveLadder(readLadderFile(path), PROJECT), { kind: "off", reason: "unknown_harness" });
	});
});

test("ladder: a record with no human note is malformed — a record nobody signed cannot raise a binding", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeFileSync(path, ladderFile({ [PROJECT]: validEntry({ by: "" }) }), "utf8");
		assert.deepEqual(resolveLadder(readLadderFile(path), PROJECT), { kind: "off", reason: "malformed" });
	});
});

test("ladder: an explicit `off` record resolves to off with `level_off`, distinct from `no_record`", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeFileSync(path, ladderFile({ [PROJECT]: validEntry({ level: "off" }) }), "utf8");
		assert.deepEqual(resolveLadder(readLadderFile(path), PROJECT), { kind: "off", reason: "level_off" });
	});
});

test("ladder: every declared harness name is accepted, and the level is carried through verbatim", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		for (const harness of HARNESS_NAMES) {
			writeFileSync(path, ladderFile({ [PROJECT]: validEntry({ harness, level: "autopilot" }) }), "utf8");
			const resolved = resolveLadder(readLadderFile(path), PROJECT);
			assert.equal(resolved.kind, "entry");
			if (resolved.kind === "entry") {
				assert.equal(resolved.entry.harness, harness);
				assert.equal(resolved.entry.level, "autopilot");
			}
		}
	});
});

test("ladder: writing an entry preserves the other bindings and round-trips through the reader", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeLadderEntry(path, OTHER_PROJECT, {
			level: "notify",
			harness: "claude",
			by: "Director (placeholder note)",
			at: "2026-09-30T00:00:00.000Z",
		});
		writeLadderEntry(path, PROJECT, {
			level: "wake",
			harness: "pi",
			harness_args: ["-p", "--model", "placeholder-model"],
			by: "Director (placeholder note)",
			at: "2026-09-30T00:00:01.000Z",
		});

		const read = readLadderFile(path);
		assert.equal(read.problem, null);
		const mine = resolveLadder(read, PROJECT);
		const theirs = resolveLadder(read, OTHER_PROJECT);
		assert.equal(mine.kind, "entry");
		assert.equal(theirs.kind, "entry");
		if (mine.kind === "entry") {
			assert.deepEqual(mine.entry.harness_args, ["-p", "--model", "placeholder-model"]);
		}
		// The file stays readable JSON with the declared schema version, so a human can edit it.
		const raw = JSON.parse(readFileSync(path, "utf8")) as { schema_version: number; bindings: object };
		assert.equal(raw.schema_version, LADDER_SCHEMA_VERSION);
		assert.deepEqual(Object.keys(raw.bindings).sort(), [PROJECT, OTHER_PROJECT].sort());
	});
});

test("ladder: an invalid entry is refused at the write, so the file never carries an unusable record", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		assert.throws(
			() => writeLadderEntry(path, PROJECT, { level: "autopilot" as never, harness: "sh", by: "x", at: "y" }),
			/unknown harness/,
		);
		assert.equal(readLadderFile(path).problem, "missing");
	});
});

test("ladder: removeLadderEntry is the kill switch — the binding is gone, the others survive", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeLadderEntry(path, PROJECT, { level: "autopilot", harness: "pi", by: "Director", at: "2026-09-30T00:00:00.000Z" });
		writeLadderEntry(path, OTHER_PROJECT, { level: "wake", harness: "pi", by: "Director", at: "2026-09-30T00:00:00.000Z" });

		removeLadderEntry(path, PROJECT);

		const read = readLadderFile(path);
		assert.deepEqual(resolveLadder(read, PROJECT), { kind: "off", reason: "no_record" });
		assert.equal(resolveLadder(read, OTHER_PROJECT).kind, "entry");
	});
});

test("ladder: removing the last entry leaves an empty, still-readable file rather than a corrupt one", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeLadderEntry(path, PROJECT, { level: "wake", harness: "pi", by: "Director", at: "2026-09-30T00:00:00.000Z" });
		removeLadderEntry(path, PROJECT);
		const read = readLadderFile(path);
		assert.equal(read.problem, null);
		assert.deepEqual(resolveLadder(read, PROJECT), { kind: "off", reason: "no_record" });
	});
});

test("ladder: removal refuses to rewrite a file it could not read, instead of destroying it", () => {
	withTempHome((home) => {
		const path = ladderPathFor(home);
		writeFileSync(path, "{ not json", "utf8");
		assert.throws(() => removeLadderEntry(path, PROJECT), /unreadable|malformed/);
		assert.equal(readFileSync(path, "utf8"), "{ not json");
	});
});

test("ladder: the committed project file cannot carry a ladder key at all (PT-35's schema-shape half)", () => {
	// The opt-in is machine-local by construction, not by convention: `parseProjectFile` is strict, so a
	// `runner`/`ladder` key in a committed `conmuta.json` is an unknown key and the file is refused.
	const withLadderKey = JSON.stringify({
		schema_version: 1,
		project_id: PROJECT,
		group_id: -5419222443,
		roster: [{ agent_id: "@kairo-agent", user_id: 8984831584, username: "agente_kairo_bot" }],
		runner: { enabled: true, level: "autopilot", harness: "pi" },
	});
	const parsed = parseProjectFile(withLadderKey);
	assert.equal(parsed.ok, false, "a ladder key in the committed project file must be refused, not ignored");

	const withoutIt = JSON.stringify({
		schema_version: 1,
		project_id: PROJECT,
		group_id: -5419222443,
		roster: [{ agent_id: "@kairo-agent", user_id: 8984831584, username: "agente_kairo_bot" }],
	});
	assert.equal(parseProjectFile(withoutIt).ok, true, "the fixture itself must be a valid project file");
});
