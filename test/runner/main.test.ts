import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DaemonLink, DaemonLinkDeps, DoorbellResponse } from "../../channel/daemon-link.js";
import { LADDER_SCHEMA_VERSION, RUNNER_NAME } from "../../runner/constants.js";
import { ladderPathFor, writeLadderEntry } from "../../runner/ladder.js";
import { readLedgerRows, wakeLedgerPathFor } from "../../runner/ledger.js";
import { runLoop } from "../../runner/main.js";
import { EXIT_UNBOUND_PROJECT, EXIT_USAGE, PRODUCT_NAME, PROJECT_FILE_NAME } from "../../src/shared/constants.js";

/**
 * `runner/main.ts` (ADR-0032 R3/R10, PT-34). The wiring test: a real project file in a temp directory, a fake
 * daemon link and a fake turn, so what is pinned is the startup contract (the walk-up, the refusal codes, the
 * runner holding no token) and the one-tick path end to end.
 */

const PROJECT = "telegram-bus-agent";

function projectFile(projectId: string): string {
	return JSON.stringify({
		schema_version: 1,
		project_id: projectId,
		group_id: -5419222443,
		roster: [{ agent_id: "@kairo-agent", user_id: 8984831584, username: "agente_kairo_bot" }],
	});
}

function withTempDir<T>(body: (dir: string) => Promise<T>): Promise<T> {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-runner-main-"));
	const finish = (): void => rmSync(dir, { recursive: true, force: true });
	return body(dir).finally(finish);
}

const homeIn = (dir: string): string => join(dir, "home");

const summary = (count: number): DoorbellResponse => ({
	count,
	senders: count > 0 ? ["@alpha-one"] : [],
	types: count > 0 ? ["BROADCAST"] : [],
	threads: count > 0 ? ["aaaaaaaaaaaa"] : [],
	covered_through_seq: 11,
	saturated: false,
});

function fakeLink(overrides: Partial<DaemonLink> = {}): (deps: DaemonLinkDeps) => DaemonLink {
	return () => ({
		readDoorbell: async () => summary(2),
		commitCursor: async (commitSeq) => commitSeq ?? 5,
		close: async () => {},
		...overrides,
	});
}

test("main: the runner is named once, so its usage line and its session host label cannot drift", () => {
	assert.equal(RUNNER_NAME, "conmuta-runner");
	assert.ok(PRODUCT_NAME.length > 0); // the product's own name is not re-declared here
});

test("main: without --project the startup refuses before touching anything, with the core CLI's usage code", async () => {
	const lines: string[] = [];
	const code = await runLoop({ project: "", once: true, home: "C:/placeholder", cwd: undefined, err: (line) => lines.push(line) });
	assert.equal(code, EXIT_USAGE);
	assert.ok(lines[0].includes("--project is required"));
});

test("main: an unbound directory refuses and never creates a daemon session", async () => {
	await withTempDir(async (dir) => {
		const lines: string[] = [];
		let links = 0;
		const code = await runLoop(
			{ project: PROJECT, once: true, home: homeIn(dir), cwd: dir, err: (line) => lines.push(line) },
			{
				createLinkImpl: (deps) => {
					links += 1;
					return fakeLink()(deps);
				},
			},
		);
		assert.equal(code, EXIT_UNBOUND_PROJECT);
		assert.equal(links, 0, "a refusal must not open a session");
		assert.ok(lines[0].includes(PROJECT_FILE_NAME));
	});
});

test("main: a project file bound to another project refuses with its own exit code", async () => {
	await withTempDir(async (dir) => {
		writeFileSync(join(dir, PROJECT_FILE_NAME), projectFile("frisco-erp"), "utf8");
		const lines: string[] = [];
		const code = await runLoop({ project: PROJECT, once: true, home: homeIn(dir), cwd: dir, err: (line) => lines.push(line) });
		assert.notEqual(code, 0);
		assert.ok(lines[0].includes("frisco-erp"));
	});
});

test("main: `--once` on an enabled binding wakes once and records it, then closes the session", async () => {
	await withTempDir(async (dir) => {
		const home = homeIn(dir);
		writeFileSync(join(dir, PROJECT_FILE_NAME), projectFile(PROJECT), "utf8");
		writeLadderEntry(ladderPathFor(home), PROJECT, {
			level: "wake",
			harness: "pi",
			by: "Director (placeholder)",
			at: "2026-09-30T00:00:00.000Z",
		});

		const lines: string[] = [];
		const turns: string[] = [];
		let closed = 0;
		const code = await runLoop(
			{ project: PROJECT, once: true, home, cwd: dir, err: (line) => lines.push(line) },
			{
				createLinkImpl: fakeLink({ close: async () => void (closed += 1) }),
				runTurnImpl: async (input) => {
					turns.push(input.cwd);
					assert.ok(input.spec.argv[input.spec.argv.length - 1].includes(PROJECT));
					return { kind: "exited", code: 0 };
				},
			},
		);

		assert.equal(code, 0);
		assert.deepEqual(turns, [dir], "the woken turn's cwd is the project's own root");
		assert.equal(closed, 1, "the session is deleted on the way out");
		const ledger = readLedgerRows(wakeLedgerPathFor(home));
		assert.equal(ledger.length, 1);
		assert.equal(ledger[0].kind, "wake");
		assert.equal(ledger[0].project_id, PROJECT);
		assert.ok(lines.some((line) => line.includes("one tick: woke")));
	});
});

test("main: `--once` on an `off` binding wakes nothing and reads nothing", async () => {
	await withTempDir(async (dir) => {
		writeFileSync(join(dir, PROJECT_FILE_NAME), projectFile(PROJECT), "utf8");
		let reads = 0;
		const lines: string[] = [];
		const code = await runLoop(
			{ project: PROJECT, once: true, home: homeIn(dir), cwd: dir, err: (line) => lines.push(line) },
			{
				createLinkImpl: fakeLink({
					readDoorbell: async () => {
						reads += 1;
						return summary(0);
					},
				}),
				runTurnImpl: async () => {
					throw new Error("an off binding must never start a turn");
				},
			},
		);
		assert.equal(code, 0);
		assert.equal(reads, 0);
		assert.ok(lines.some((line) => line.includes("one tick: idle")));
		assert.equal(LADDER_SCHEMA_VERSION, 1);
	});
});

test("main: a daemon the runner cannot reach is a failed tick, not a crash", async () => {
	await withTempDir(async (dir) => {
		const home = homeIn(dir);
		writeFileSync(join(dir, PROJECT_FILE_NAME), projectFile(PROJECT), "utf8");
		writeLadderEntry(ladderPathFor(home), PROJECT, { level: "wake", harness: "pi", by: "note", at: "2026-09-30T00:00:00.000Z" });
		const lines: string[] = [];
		const code = await runLoop(
			{ project: PROJECT, once: true, home, cwd: dir, err: (line) => lines.push(line) },
			{
				createLinkImpl: fakeLink({
					readDoorbell: async () => {
						throw new Error("connection refused");
					},
				}),
			},
		);
		assert.equal(code, 1);
		assert.ok(lines.some((line) => line.includes("one tick: link_failed")));
	});
});

test("main: the runner holds no token — its session identity carries ids, a roster hash and its own host label", async () => {
	await withTempDir(async (dir) => {
		const home = homeIn(dir);
		writeFileSync(join(dir, PROJECT_FILE_NAME), projectFile(PROJECT), "utf8");
		writeLadderEntry(ladderPathFor(home), PROJECT, { level: "notify", harness: "pi", by: "note", at: "2026-09-30T00:00:00.000Z" });

		let identity: DaemonLinkDeps["identity"] | undefined;
		await runLoop(
			{ project: PROJECT, once: true, home, cwd: dir, err: () => {} },
			{
				createLinkImpl: (deps) => {
					identity = deps.identity;
					return fakeLink({ readDoorbell: async () => summary(0) })(deps);
				},
			},
		);

		assert.ok(identity !== undefined);
		assert.equal(identity.host, RUNNER_NAME);
		assert.equal(identity.projectId, PROJECT);
		assert.equal(typeof identity.groupId, "number");
		assert.match(identity.rosterHash, /^sha256:[0-9a-f]{64}$/);
		assert.deepEqual(Object.keys(identity).sort(), ["groupId", "host", "projectId", "rosterHash"]);
	});
});
