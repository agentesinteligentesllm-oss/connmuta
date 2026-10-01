import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EXIT_OK, EXIT_REFUSED, EXIT_USAGE, parseRunnerArgs, runCli, type RunLoopRequest } from "../../runner/cli.js";
import { LADDER_SCHEMA_VERSION } from "../../runner/constants.js";
import { ladderPathFor, readLadderFile, resolveLadder } from "../../runner/ladder.js";
import { readLedgerRows, wakeLedgerPathFor } from "../../runner/ledger.js";

/**
 * `runner/cli.ts` (ADR-0032 R4/R6). Two things are being pinned here: **strict parsing** (this command raises
 * a capability, so a typo must fail rather than half-apply) and the **opt-in round trip** — a record written
 * by `ladder set` is resolvable by the loop, and `ladder disable` is the kill switch.
 */

const PROJECT = "telegram-bus-agent";
const NOW = 1_800_000_000_000;

function withTempHome<T>(body: (home: string) => T | Promise<T>): Promise<T> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-runner-cli-"));
	mkdirSync(join(home, "runner"), { recursive: true });
	const finish = (): void => rmSync(home, { recursive: true, force: true });
	return Promise.resolve(body(home)).finally(finish);
}

function capture() {
	const out: string[] = [];
	const err: string[] = [];
	return { out, err, io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) } };
}

const noLoop = (): Promise<number> => {
	throw new Error("the loop must not run in this test");
};

test("cli: parsing accepts both option forms and the documented flag", () => {
	assert.deepEqual(parseRunnerArgs(["run", "--project", PROJECT, "--once"]), {
		kind: "run",
		project: PROJECT,
		cwd: undefined,
		once: true,
		home: undefined,
	});
	assert.deepEqual(parseRunnerArgs(["run", `--project=${PROJECT}`, "--cwd", "C:/placeholder"]), {
		kind: "run",
		project: PROJECT,
		cwd: "C:/placeholder",
		once: false,
		home: undefined,
	});
	assert.deepEqual(parseRunnerArgs(["ladder", "get"]), { kind: "ladder-get", project: undefined, home: undefined });
	assert.deepEqual(parseRunnerArgs(["ladder", "get", "--project", PROJECT, "--home", "C:/placeholder-home"]), {
		kind: "ladder-get",
		project: PROJECT,
		home: "C:/placeholder-home",
	});
});

test("cli: parsing refuses anything it does not fully understand", () => {
	for (const argv of [
		[], // no command
		["ladder"], // no subcommand
		["ladder", "enable", "--project", PROJECT], // unknown subcommand
		["run"], // missing --project
		["run", "--project", PROJECT, "--unknown"], // unknown option
		["run", "--project"], // dangling value
		["run", "--project", PROJECT, "--project", PROJECT], // repeated single-valued option
		["ladder", "set", "--project", PROJECT, "--level", "wake", "--by", "n"], // missing --harness for a turn
		["ladder", "set", "--project", PROJECT, "--level", "wakez", "--harness", "pi", "--by", "n"], // unknown level
		["ladder", "set", "--project", PROJECT, "--level", "notify", "--by", ""], // empty note
		["ladder", "disable", "--project", PROJECT], // no note: a record nobody signed
	]) {
		assert.equal(parseRunnerArgs(argv), null, `expected a usage error for: ${argv.join(" ")}`);
	}
});

test("cli: `ladder set` requires a harness exactly for the levels that start a turn", () => {
	// `notify` starts no turn, so no harness is needed...
	assert.equal(parseRunnerArgs(["ladder", "set", "--project", PROJECT, "--level", "notify", "--by", "note"])?.kind, "ladder-set");
	// ...and `off` neither.
	assert.equal(parseRunnerArgs(["ladder", "set", "--project", PROJECT, "--level", "off", "--by", "note"])?.kind, "ladder-set");
	// but `wake` and `autopilot` do.
	for (const level of ["wake", "autopilot"]) {
		assert.equal(parseRunnerArgs(["ladder", "set", "--project", PROJECT, "--level", level, "--by", "note"]), null);
		assert.equal(
			parseRunnerArgs(["ladder", "set", "--project", PROJECT, "--level", level, "--harness", "claude", "--by", "note"])?.kind,
			"ladder-set",
		);
	}
});

test("cli: `--arg` repeats and keeps a value that looks like a flag in its `=` form", () => {
	const parsed = parseRunnerArgs([
		"ladder", "set", "--project", PROJECT, "--level", "wake", "--harness", "claude", "--by", "note",
		"--arg=--model", "--arg=placeholder-model",
	]);
	assert.equal(parsed?.kind, "ladder-set");
	if (parsed?.kind === "ladder-set") assert.deepEqual(parsed.args, ["--model", "placeholder-model"]);
});

test("cli: a usage error prints the usage to stderr and returns the core CLI's own usage code", async () => {
	const { out, err, io } = capture();
	const code = await runCli(["run"], io, { homeDir: () => "C:/placeholder", runLoop: noLoop, now: () => NOW });
	assert.equal(code, EXIT_USAGE);
	assert.equal(out.length, 0);
	assert.ok(err.join("\n").includes("usage: conmuta-runner"));
});

test("cli: `run` delegates to the loop with the resolved home, and prints nothing on stdout itself", async () => {
	await withTempHome(async (home) => {
		const { out, io } = capture();
		const seen: RunLoopRequest[] = [];
		const code = await runCli(["run", "--project", PROJECT, "--once"], io, {
			homeDir: () => home,
			runLoop: async (request) => {
				seen.push(request);
				return EXIT_OK;
			},
			now: () => NOW,
		});
		assert.equal(code, EXIT_OK);
		assert.equal(seen.length, 1);
		assert.equal(seen[0].home, home);
		assert.equal(seen[0].project, PROJECT);
		assert.equal(seen[0].once, true);
		assert.equal(out.length, 0);
	});
});

test("cli: the opt-in round trip — set writes a resolvable record and a signed ledger row", async () => {
	await withTempHome(async (home) => {
		const { out, io } = capture();
		const deps = { homeDir: () => home, runLoop: noLoop, now: () => NOW };

		assert.equal(await runCli(["ladder", "set", "--project", PROJECT, "--level", "autopilot", "--harness", "claude", "--by", "Director: audited review only"], io, deps), EXIT_OK);

		const read = readLadderFile(ladderPathFor(home));
		assert.equal(read.problem, null);
		const resolved = resolveLadder(read, PROJECT);
		assert.equal(resolved.kind, "entry");
		if (resolved.kind === "entry") {
			assert.equal(resolved.entry.level, "autopilot");
			assert.equal(resolved.entry.harness, "claude");
			assert.equal(resolved.entry.by, "Director: audited review only");
			assert.equal(resolved.entry.at, new Date(NOW).toISOString());
		}

		const ledger = readLedgerRows(wakeLedgerPathFor(home));
		assert.equal(ledger.length, 1);
		assert.equal(ledger[0].kind, "ladder");
		assert.equal(ledger[0].level, "autopilot");
		assert.equal(ledger[0].note, "Director: audited review only");

		out.length = 0;
		assert.equal(await runCli(["ladder", "get", "--project", PROJECT], io, deps), EXIT_OK);
		assert.ok(out[0].startsWith(`${PROJECT}: autopilot (claude, by Director: audited review only`));
	});
});

test("cli: `ladder get` lists every binding on the machine, and says so when there are none", async () => {
	await withTempHome(async (home) => {
		const { out, io } = capture();
		const deps = { homeDir: () => home, runLoop: noLoop, now: () => NOW };

		assert.equal(await runCli(["ladder", "get"], io, deps), EXIT_OK);
		assert.ok(out[0].includes("every binding is off"));

		await runCli(["ladder", "set", "--project", PROJECT, "--level", "notify", "--by", "note"], io, deps);
		out.length = 0;
		assert.equal(await runCli(["ladder", "get"], io, deps), EXIT_OK);
		assert.equal(out.length, 1);
		assert.ok(out[0].startsWith(`${PROJECT}: notify`));
	});
});

test("cli: `ladder disable` is the kill switch — the record is gone and the action is recorded", async () => {
	await withTempHome(async (home) => {
		const { out, io } = capture();
		const deps = { homeDir: () => home, runLoop: noLoop, now: () => NOW };

		await runCli(["ladder", "set", "--project", PROJECT, "--level", "wake", "--harness", "pi", "--by", "note"], io, deps);
		out.length = 0;
		assert.equal(await runCli(["ladder", "disable", "--project", PROJECT, "--by", "Director: stop"], io, deps), EXIT_OK);

		assert.deepEqual(resolveLadder(readLadderFile(ladderPathFor(home)), PROJECT), { kind: "off", reason: "no_record" });
		const ledger = readLedgerRows(wakeLedgerPathFor(home));
		assert.deepEqual(
			ledger.map((row) => [row.kind, row.level, row.note]),
			[
				["ladder", "wake", "note"],
				["ladder", "off", "Director: stop"],
			],
		);
		assert.ok(out[0].includes("will not wake"));
	});
});

test("cli: a ladder write refuses a file it cannot read, and says why, instead of destroying it", async () => {
	await withTempHome(async (home) => {
		writeFileSync(ladderPathFor(home), "{ not json", "utf8");
		const { err, io } = capture();
		const code = await runCli(["ladder", "set", "--project", PROJECT, "--level", "wake", "--harness", "pi", "--by", "note"], io, {
			homeDir: () => home,
			runLoop: noLoop,
			now: () => NOW,
		});
		assert.equal(code, EXIT_REFUSED);
		assert.ok(err[0].includes("refusing to write"));
	});
});

test("cli: a duplicate record for the same project replaces the previous one and is not a second row", async () => {
	await withTempHome(async (home) => {
		const { io } = capture();
		const deps = { homeDir: () => home, runLoop: noLoop, now: () => NOW };
		await runCli(["ladder", "set", "--project", PROJECT, "--level", "notify", "--by", "first"], io, deps);
		await runCli(["ladder", "set", "--project", PROJECT, "--level", "wake", "--harness", "pi", "--by", "second"], io, deps);

		const read = readLadderFile(ladderPathFor(home));
		assert.equal(read.bindings.size, 1);
		const resolved = resolveLadder(read, PROJECT);
		assert.equal(resolved.kind, "entry");
		if (resolved.kind === "entry") assert.equal(resolved.entry.by, "second");
		assert.equal(readLedgerRows(wakeLedgerPathFor(home)).length, 2, "both human actions are recorded");
		assert.equal(LADDER_SCHEMA_VERSION, 1);
	});
});
