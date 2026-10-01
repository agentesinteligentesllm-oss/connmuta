import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { LadderLevel } from "./ladder.js";

/**
 * The satellite's own append-only wake ledger (`runner/ledger.ts`; ADR-0032 R6/R6a, PT-36).
 *
 * **Self-reported, and the ADR says so.** The daemon neither knows the satellite exists nor has a route or
 * a column set to attest a wake (R6a), so this file is the only record and it is written by the component it
 * describes. That is stated as residual risk, never as a control.
 *
 * **One row per accepted wake.** A wake writes exactly one row, naming the verified trigger identity, the
 * thread, the level and the action taken. A wake that was refused by a bound writes one `refused` row with a
 * reason (counted, never a silent drop). `ladder` rows record the human action that raised or lowered a
 * binding, so the opt-in's own history is auditable next to what it caused.
 *
 * **No body, no token, by construction.** The row builders below accept a trigger SUMMARY — the doorbell's
 * closed key set, already schema-validated by the daemon — and never a message text. No caller can add a
 * field: the builders return exactly the documented shape, and `appendLedgerRow` serializes only that. A
 * peer's prose therefore cannot reach this file through the wake path, which is the property PT-36 asserts.
 */

/** The four row kinds. `wake` and `notify` carry a trigger summary; `refused` carries a reason. */
export type LedgerKind = "wake" | "refused" | "notify" | "ladder";

/** What the doorbell summary gave us: counts and identifiers, never prose (it has no body field at all). */
export interface LedgerTrigger {
	readonly count: number;
	readonly senders: readonly string[];
	readonly types: readonly string[];
	readonly threads: readonly string[];
}

export interface LedgerRow {
	readonly ts: string;
	readonly kind: LedgerKind;
	readonly project_id: string;
	readonly level: LadderLevel;
	readonly trigger?: LedgerTrigger;
	readonly reason?: string;
	readonly harness?: string;
	readonly outcome?: string;
	readonly note?: string;
}

export interface RowContext {
	readonly ts: string;
	readonly project_id: string;
	readonly level: LadderLevel;
}

/** `<home>/runner/wake-ledger.jsonl`. Named once so the loop, the CLI and the tests cannot disagree. */
export function wakeLedgerPathFor(homeDir: string): string {
	return join(homeDir, "runner", "wake-ledger.jsonl");
}

/** The one row an accepted wake writes. */
export function wakeRow(ctx: RowContext, trigger: LedgerTrigger, harness: string, outcome: string): LedgerRow {
	return { ts: ctx.ts, kind: "wake", project_id: ctx.project_id, level: ctx.level, trigger, harness, outcome };
}

/** The one row a refused wake writes: a bound or a broken harness, always with a reason. */
export function refusedRow(ctx: RowContext, reason: string): LedgerRow {
	return { ts: ctx.ts, kind: "refused", project_id: ctx.project_id, level: ctx.level, reason };
}

/** The one row a `notify`-level delivery writes: the human was told and no turn was started. */
export function notifyRow(ctx: RowContext, trigger: LedgerTrigger): LedgerRow {
	return { ts: ctx.ts, kind: "notify", project_id: ctx.project_id, level: ctx.level, trigger };
}

/** The one row a human action on the ladder writes (which level, and who said so). */
export function ladderRow(ctx: RowContext, note: string): LedgerRow {
	return { ts: ctx.ts, kind: "ladder", project_id: ctx.project_id, level: ctx.level, note };
}

/** Appends one row. Creates the directory on first use. Append-only: this module has no update or delete. */
export function appendLedgerRow(path: string, row: LedgerRow): void {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	appendFileSync(path, `${JSON.stringify(row)}\n`, { encoding: "utf8", mode: 0o600 });
}

/** Reads the ledger back for an operator or a test. Returns `[]` when the file does not exist yet.
 *
 * A line that is not JSON is **skipped, never fatal**: the file is append-only and written by a process that
 * can be killed mid-write, so a torn last line is an ordinary crash artifact. Throwing on it would make this
 * read path — the operator's only way to look at the ledger — fail exactly when an incident happened. Both
 * judges of this phase's audit found the unguarded version. */
export function readLedgerRows(path: string): LedgerRow[] {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return [];
	}
	const rows: LedgerRow[] = [];
	for (const line of text.split("\n")) {
		if (line.length === 0) continue;
		try {
			rows.push(JSON.parse(line) as LedgerRow);
		} catch {
			// Skip it: see the doc comment above.
		}
	}
	return rows;
}
