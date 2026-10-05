import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DaemonLink, DoorbellResponse } from "../../channel/daemon-link.js";
import { LADDER_POLL_MS, LADDER_SCHEMA_VERSION, WAKE_COOLDOWN_MS } from "../../runner/constants.js";
import { resolveHarnessSpec, type HarnessSpec, type TurnOutcome } from "../../runner/harness.js";
import { readLedgerRows, wakeLedgerPathFor } from "../../runner/ledger.js";
import { ladderPathFor, readLadderFile, removeLadderEntry } from "../../runner/ladder.js";
import { WakeLoop, type WakeLoopDeps } from "../../runner/loop.js";
import { readWatermarkFor, watermarkPathFor, writeWatermark } from "../../runner/watermark.js";
import { FETCH_LONGPOLL_MAX_SECONDS } from "../../src/shared/constants.js";

/**
 * `runner/loop.ts` (ADR-0032 R3–R6, PT-36). The loop is where the ladder, the doorbell, the bounds and the
 * ledger meet, so these tests play all four: a scripted link, a scripted turn and a real ladder file in a
 * temp home. Nothing here reaches a daemon, a network or a process.
 *
 * The bounds are injected (they are the named constants in production), so no test waits ten seconds to prove
 * a cooldown works.
 */

const PROJECT = "telegram-bus-agent";
const CWD = "C:/placeholder/project";

const summary = (overrides: Partial<DoorbellResponse> = {}): DoorbellResponse => ({
	count: 2,
	senders: ["@alpha-one"],
	types: ["BROADCAST"],
	threads: ["aaaaaaaaaaaa"],
	covered_through_seq: 42,
	saturated: false,
	...overrides,
});

interface Fixture {
	readonly deps: WakeLoopDeps;
	readonly reads: Array<{ afterSeq: number; timeoutS: number }>;
	readonly commits: Array<number | undefined>;
	readonly turns: Array<{ spec: HarnessSpec; cwd: string }>;
	readonly warnings: string[];
	readonly home: string;
	setClock(ms: number): void;
	queueSummary(next: DoorbellResponse): void;
	failLink(): void;
	queueTurn(outcome: TurnOutcome): void;
}

function fixture(options: {
	ladder?: Record<string, unknown> | "missing" | "malformed";
	overrides?: Partial<WakeLoopDeps>;
	turn?: TurnOutcome;
}): Fixture {
	const home = mkdtempSync(join(tmpdir(), "conmuta-runner-loop-"));
	mkdirSync(join(home, "runner"), { recursive: true });
	if (options.ladder !== "missing") {
		const body =
			options.ladder === "malformed" || options.ladder === undefined
				? "{ not json"
				: JSON.stringify({ schema_version: LADDER_SCHEMA_VERSION, bindings: { [PROJECT]: options.ladder } });
		writeFileSync(ladderPathFor(home), body, "utf8");
	}

	const reads: Fixture["reads"] = [];
	const commits: Fixture["commits"] = [];
	const turns: Fixture["turns"] = [];
	const warnings: string[] = [];
	let clock = 1_000_000;
	let nextSummary = summary();
	let linkFails = false;
	let nextTurn: TurnOutcome = options.turn ?? { kind: "exited", code: 0 };

	const link: Pick<DaemonLink, "readDoorbell" | "commitCursor"> = {
		readDoorbell: async (afterSeq, timeoutS) => {
			reads.push({ afterSeq, timeoutS });
			if (linkFails) throw new Error("link down");
			const answer = nextSummary;
			nextSummary = summary({ ...answer, count: 0, senders: [], types: [], threads: [] });
			return answer;
		},
		commitCursor: async (commitSeq) => {
			commits.push(commitSeq);
			return commitSeq ?? 7;
		},
	};

	const deps: WakeLoopDeps = {
		projectId: PROJECT,
		cwd: CWD,
		ladderPath: ladderPathFor(home),
		ledgerPath: wakeLedgerPathFor(home),
		watermarkPath: watermarkPathFor(home),
		link,
		runTurn: async ({ spec, cwd }) => {
			turns.push({ spec, cwd });
			return nextTurn;
		},
		now: () => clock,
		sleep: async () => {},
		warn: (message) => warnings.push(message),
		cooldownMs: 10_000,
		budgetWindowMs: 3_600_000,
		budgetPerWindow: 5,
		refusalRepeatMs: 60_000,
		longPollSeconds: 50,
		...options.overrides,
	};

	return {
		deps,
		reads,
		commits,
		turns,
		warnings,
		home,
		setClock: (ms) => {
			clock = ms;
		},
		queueSummary: (next) => {
			nextSummary = next;
		},
		failLink: () => {
			linkFails = true;
		},
		queueTurn: (outcome) => {
			nextTurn = outcome;
		},
	};
}

const entry = (level: string, harness = "pi", harness_args?: readonly string[]): Record<string, unknown> => ({
	level,
	harness,
	...(harness_args === undefined ? {} : { harness_args }),
	by: "Director (placeholder)",
	at: "2026-09-30T00:00:00.000Z",
});

const rows = (fix: Fixture) => readLedgerRows(wakeLedgerPathFor(fix.home));

/** The cursor calls the loop made AFTER its bootstrap read. The first `commitCursor()` (no argument) is the
 * watermark bootstrap, named once here so every assertion below reads as "what the loop advanced". */
const advances = (fix: Fixture) => fix.commits.slice(1);

function withFixture(fix: Fixture, body: () => Promise<void>): Promise<void> {
	rmSync(fix.home, { recursive: true, force: true });
	return body();
}

test("loop: the first enabled tick bootstraps the watermark from the daemon's own cursor row", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		await new WakeLoop(fix.deps).tick(new AbortController().signal);
		assert.equal(fix.commits[0], undefined, "the bootstrap asks the daemon to ensure and read the row");
		assert.deepEqual(fix.reads[0] && fix.reads[0].afterSeq, 7, "the read starts after the daemon's own seed");
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: an `off` binding reads nothing at all — no daemon session, no ledger row, no turn", async () => {
	const fix = fixture({ ladder: "missing" });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "idle");
		assert.deepEqual(fix.reads, []);
		assert.deepEqual(fix.turns, []);
		assert.deepEqual(rows(fix), []);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a broken ladder file is recorded once with its reason, and never wakes anything", async () => {
	const fix = fixture({ ladder: "malformed" });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "idle");
		assert.equal(await loop.tick(new AbortController().signal), "idle");
		const written = rows(fix);
		assert.equal(written.length, 1, "a persistent problem must not be re-logged every tick");
		assert.equal(written[0].kind, "refused");
		assert.equal(written[0].reason, "malformed");
		assert.equal(written[0].level, "off");
		assert.deepEqual(fix.reads, []);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a quiet inbox is `silent` — no wake, no row, and the long poll carries the wait", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		fix.queueSummary(summary({ count: 0, senders: [], types: [], threads: [] }));
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "silent");
		assert.deepEqual(rows(fix), []);
		assert.deepEqual(fix.turns, []);
		assert.equal(fix.reads[0].timeoutS, 50);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: `notify` tells the human and starts no turn — its own row kind, and the cursor commits", async () => {
	const fix = fixture({ ladder: entry("notify") });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "notified");
		assert.deepEqual(fix.turns, [], "notify must never start a turn");
		const written = rows(fix);
		assert.equal(written.length, 1);
		assert.equal(written[0].kind, "notify");
		assert.deepEqual(written[0].trigger?.threads, ["aaaaaaaaaaaa"]);
		assert.deepEqual(advances(fix), [42], "a delivered notification may advance the watermark");
		assert.ok(fix.warnings.some((line) => line.includes("no turn started")));
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: `wake` starts exactly one turn, records exactly one accepted wake, then commits last", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "woke");
		assert.equal(fix.turns.length, 1);
		assert.equal(fix.turns[0].cwd, CWD);
		assert.deepEqual(fix.turns[0].spec.argv.slice(0, -1), ["-p", "--no-extensions", "--tools", "read,grep,find,ls"]);

		const written = rows(fix);
		assert.equal(written.length, 1, "exactly one row per accepted wake");
		assert.equal(written[0].kind, "wake");
		assert.equal(written[0].harness, "pi");
		assert.equal(written[0].outcome, "exited");
		assert.equal(written[0].level, "wake");
		assert.deepEqual(advances(fix), [42]);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: the turn's own environment is not the runner's — the spec carries the prompt last, after the send-proof profile", async () => {
	const fix = fixture({ ladder: entry("wake", "pi", ["--model", "placeholder-model"]) });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "woke");
		const argv = fix.turns[0].spec.argv;
		assert.deepEqual(argv.slice(0, -1), ["-p", "--model", "placeholder-model", "--no-extensions", "--tools", "read,grep,find,ls"]);
		const prompt = argv[argv.length - 1];
		assert.ok(prompt.includes(PROJECT));
		assert.ok(prompt.includes("wake"));
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a second message inside the cooldown is refused with a counted reason and does NOT advance the cursor", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "woke");

		fix.setClock(1_000_000 + 1_000);
		fix.queueSummary(summary({ covered_through_seq: 43 }));
		assert.equal(await loop.tick(new AbortController().signal), "refused");

		assert.equal(fix.turns.length, 1, "the cooldown must stop the second turn");
		assert.deepEqual(advances(fix), [42], "a refused wake leaves the watermark where it was");
		const written = rows(fix);
		assert.equal(written.length, 2);
		assert.equal(written[1].kind, "refused");
		assert.equal(written[1].reason, "cooldown");
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: past the cooldown the held message wakes — the pending work is not lost", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		const loop = new WakeLoop(fix.deps);
		await loop.tick(new AbortController().signal);
		fix.setClock(1_000_000 + WAKE_COOLDOWN_MS + 1);
		fix.queueSummary(summary({ covered_through_seq: 43 }));
		assert.equal(await loop.tick(new AbortController().signal), "woke");
		assert.equal(fix.turns.length, 2);
		assert.deepEqual(advances(fix), [42, 43]);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: the per-window budget refuses after its count, with its own reason", async () => {
	const fix = fixture({ ladder: entry("wake"), overrides: { budgetPerWindow: 1, cooldownMs: 0 } });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "woke");
		fix.queueSummary(summary({ covered_through_seq: 43 }));
		assert.equal(await loop.tick(new AbortController().signal), "refused");
		assert.equal(rows(fix).at(-1)?.reason, "budget_exhausted");
		assert.equal(fix.turns.length, 1);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: the budget window slides — an old wake no longer counts against it", async () => {
	const fix = fixture({ ladder: entry("wake"), overrides: { budgetPerWindow: 1, cooldownMs: 0, budgetWindowMs: 1_000 } });
	try {
		const loop = new WakeLoop(fix.deps);
		await loop.tick(new AbortController().signal);
		fix.setClock(1_000_000 + 5_000);
		fix.queueSummary(summary({ covered_through_seq: 43 }));
		assert.equal(await loop.tick(new AbortController().signal), "woke");
		assert.equal(fix.turns.length, 2);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a turn already in flight refuses a second wake with `in_flight`", async () => {
	const fix = fixture({ ladder: entry("wake"), overrides: { cooldownMs: 0 } });
	try {
		let release: (() => void) | undefined;
		const loop = new WakeLoop({
			...fix.deps,
			runTurn: async ({ spec, cwd }) => {
				fix.turns.push({ spec, cwd });
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return { kind: "exited", code: 0 };
			},
		});
		const first = loop.tick(new AbortController().signal);
		await new Promise((resolve) => setImmediate(resolve));

		fix.queueSummary(summary({ covered_through_seq: 90 }));
		assert.equal(await loop.tick(new AbortController().signal), "refused");
		assert.equal(rows(fix).at(-1)?.reason, "in_flight");
		assert.equal(fix.turns.length, 1);

		release?.();
		assert.equal(await first, "woke");
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a refused argument list stops the turn before anything is started", async () => {
	const fix = fixture({ ladder: entry("autopilot", "claude", ["--dangerously-skip-permissions"]) });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "refused");
		assert.deepEqual(fix.turns, []);
		assert.deepEqual(advances(fix), []);
		assert.equal(rows(fix).at(-1)?.reason, "arguments_refused");
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a level or harness with no send-proof profile is refused before anything is started (2026-10-05 order)", async () => {
	const fix = fixture({ ladder: entry("autopilot", "pi") });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "refused");
		assert.deepEqual(fix.turns, [], "no turn may start with the harness's full toolset");
		assert.deepEqual(advances(fix), []);
		assert.equal(rows(fix).at(-1)?.reason, "profile_unavailable");
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a `wake` turn with the read-only profile cannot have been given a shell", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "woke");
		const argv = fix.turns[0].spec.argv;
		assert.ok(argv.includes("--no-extensions"), "no extension surface means no bus tools");
		assert.ok(argv.includes("--tools"));
		assert.ok(!argv.includes("bash"), "the profile must not carry the shell tool");
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: an unavailable harness is recorded as a wake whose turn failed, and the message stays pending", async () => {	const fix = fixture({ ladder: entry("wake"), turn: { kind: "unavailable", detail: "ENOENT" } });
	try {
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "woke");
		const written = rows(fix);
		assert.equal(written.length, 1);
		assert.equal(written[0].kind, "wake");
		assert.equal(written[0].outcome, "unavailable");
		assert.deepEqual(advances(fix), [], "an unavailable harness must leave the message pending");
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a dead link is `link_failed` and never a wake", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		fix.failLink();
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "link_failed");
		assert.deepEqual(fix.turns, []);
		assert.deepEqual(rows(fix), []);
		assert.ok(fix.warnings.some((line) => line.includes("daemon link failed")));
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: run() paces an idle binding with the ladder poll and stops promptly on abort", async () => {
	const fix = fixture({ ladder: "missing" });
	try {
		const slept: number[] = [];
		const controller = new AbortController();
		const loop = new WakeLoop({
			...fix.deps,
			sleep: async (ms) => {
				slept.push(ms);
				controller.abort();
			},
		});
		await loop.run(controller.signal);
		assert.deepEqual(slept, [LADDER_POLL_MS]);
		assert.deepEqual(fix.reads, []);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: run() stops on an already-aborted signal without reading anything", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		const controller = new AbortController();
		controller.abort();
		await new WakeLoop(fix.deps).run(controller.signal);
		assert.deepEqual(fix.reads, []);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: the reader of the ladder file is the real one — a hand-edited typo disables the binding", async () => {
	const fix = fixture({});
	try {
		writeFileSync(fix.deps.ladderPath, JSON.stringify({ schema_version: 1, bindings: { [PROJECT]: entry("wakez") } }), "utf8");
		assert.equal(readLadderFile(fix.deps.ladderPath).problem, null);
		assert.equal(await new WakeLoop(fix.deps).tick(new AbortController().signal), "idle");
		assert.deepEqual(fix.reads, []);
		assert.equal(rows(fix).at(-1)?.reason, "unknown_level");
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a harness the record names but the closed set does not is refused before any turn", () => {
	const resolved = resolveHarnessSpec({ level: "wake", harness: "sh", by: "x", at: "y" }, "prompt");
	assert.deepEqual(resolved, { kind: "refused", reason: "harness_unknown" });
});

// --- Corrections from this phase's own judgment-day audit (both judges returned findings; all verified
// against the code before being accepted) ---

test("loop: a silent read advances the runner's own watermark, so the loop cannot re-read the same window", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		fix.queueSummary(summary({ count: 0, senders: [], types: [], threads: [], covered_through_seq: 42 }));
		const loop = new WakeLoop(fix.deps);
		assert.equal(await loop.tick(new AbortController().signal), "silent");
		assert.equal(await loop.tick(new AbortController().signal), "silent");

		assert.deepEqual(
			fix.reads.map((read) => read.afterSeq),
			[7, 42],
			"the second read must start after the rows the first one examined, or the loop spins",
		);
		assert.equal(readWatermarkFor(fix.deps.watermarkPath, PROJECT), 42);
		assert.deepEqual(advances(fix), [], "covering irrelevant rows is local, not a daemon commit");
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a restart resumes from its own persisted watermark, not from the daemon's catch-up window", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		writeWatermark(fix.deps.watermarkPath, PROJECT, 50);
		fix.queueSummary(summary({ count: 0, senders: [], types: [], threads: [], covered_through_seq: 60 }));
		await new WakeLoop(fix.deps).tick(new AbortController().signal);

		assert.equal(fix.reads[0].afterSeq, 50, "the persisted point must win over a fresh session's seed");
		assert.deepEqual(fix.commits, [], "a resumed run has no reason to bootstrap the daemon's cursor row");
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: the ladder is re-read after the poll — disabling during the wait stops the wake", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		let disabled = false;
		const loop = new WakeLoop({
			...fix.deps,
			link: {
				...fix.deps.link,
				readDoorbell: async (afterSeq, timeoutS) => {
					fix.reads.push({ afterSeq, timeoutS });
					// The operator's disable lands while this poll is in flight.
					if (!disabled) {
						disabled = true;
						removeLadderEntry(fix.deps.ladderPath, PROJECT);
					}
					return summary();
				},
			},
		});

		assert.equal(await loop.tick(new AbortController().signal), "idle");
		assert.deepEqual(fix.turns, [], "a binding disabled during the wait must not start a turn");
		assert.deepEqual(rows(fix), []);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: a turn that timed out or was aborted does not cover the message", async () => {
	for (const outcome of ["timed_out", "aborted"] as const) {
		const fix = fixture({ ladder: entry("wake"), turn: { kind: outcome } });
		try {
			assert.equal(await new WakeLoop(fix.deps).tick(new AbortController().signal), "woke");
			assert.deepEqual(advances(fix), [], `a ${outcome} turn did not do the work: the message stays pending`);
			assert.equal(rows(fix).at(-1)?.outcome, outcome);
			assert.ok(fix.warnings.some((line) => line.includes("stays pending")));
		} finally {
			await withFixture(fix, async () => {});
		}
	}
});

test("loop: an accepted wake clears the refusal memo, so a later refusal is a new fact", async () => {
	const fix = fixture({ ladder: entry("wake"), overrides: { refusalRepeatMs: 60_000 } });
	try {
		const loop = new WakeLoop(fix.deps);
		await loop.tick(new AbortController().signal);
		fix.setClock(1_000_000 + 1_000);
		fix.queueSummary(summary({ covered_through_seq: 43 }));
		assert.equal(await loop.tick(new AbortController().signal), "refused");

		fix.setClock(1_000_000 + WAKE_COOLDOWN_MS + 1);
		fix.queueSummary(summary({ covered_through_seq: 44 }));
		assert.equal(await loop.tick(new AbortController().signal), "woke");
		fix.setClock(1_000_000 + WAKE_COOLDOWN_MS + 2);
		fix.queueSummary(summary({ covered_through_seq: 45 }));
		assert.equal(await loop.tick(new AbortController().signal), "refused");

		assert.deepEqual(
			rows(fix)
				.filter((row) => row.kind === "refused")
				.map((row) => row.reason),
			["cooldown", "cooldown"],
			"a refusal after an accepted wake is a new fact, not a repeat",
		);
	} finally {
		await withFixture(fix, async () => {});
	}
});

test("loop: the doorbell read uses the daemon's own long-poll clamp by default", async () => {
	const fix = fixture({ ladder: entry("wake") });
	try {
		fix.queueSummary(summary({ count: 0, senders: [], types: [], threads: [] }));
		await new WakeLoop({ ...fix.deps, longPollSeconds: undefined }).tick(new AbortController().signal);
		assert.equal(fix.reads[0].timeoutS, FETCH_LONGPOLL_MAX_SECONDS);
	} finally {
		await withFixture(fix, async () => {});
	}
});
