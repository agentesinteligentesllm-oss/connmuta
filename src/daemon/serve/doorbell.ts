/**
 * Serves `POST /channel/doorbell` (`daemon/serve/doorbell.ts`, F4 design D3, D4, D5; spec
 * `channel-doorbell` "Doorbell response is a closed-key-set summary, not a fetch shape", "The doorbell
 * read persists nothing", "The doorbell's bounded wait reuses the existing long-poll substrate",
 * "Repeated after_seq reads eventually cover a backlog larger than one scan, and a partial scan says
 * so", "Sender identity gates a row; room membership never does").
 *
 * New code, no v1 range: the relevance rule below is v1 `peek.ts:79-85`'s, carried unchanged over the
 * addressee admission already translated and stored.
 *
 * **A summary, never a message.** The read selects `seq`, `envelope_json`, `via`, `from_agent_id` and
 * `from_user_id` from `updates` — never the message text column — and answers with the closed field set
 * `{count, senders, types, threads, covered_through_seq, saturated}`. Peer prose cannot reach the
 * response because it is never read.
 *
 * **The read writes nothing (D2).** This module imports no function from `ledger/{cursors,transaction,
 * audit}` and issues no statement other than `SELECT`; it does not stamp `last_seen_at` either, so a
 * quiet armed adapter never defers idle shutdown (D7). Committing a cursor is a separate route.
 *
 * **Scan depth and saturation (D3).** One scan reads `DOORBELL_SCAN_DEPTH + 1` rows: the extra row is a
 * probe that proves a row lies beyond the ones examined, so `saturated` is exact. `covered_through_seq`
 * is the seq of the last EXAMINED row — never the probe — or `after_seq` when the scan found none, so a
 * caller advancing `after_seq` to it pages through a backlog of any size without skipping a row.
 *
 * **The gate is admission's, not a copy of it (D5).** A row counts only when the roster still maps its
 * verified `from_user_id` back to the stored `from_agent_id` (admission's own {@link reverseRosterLookup},
 * exported and called) and that agent is not this binding's own, and when it is relevant: `direct`, a
 * `BROADCAST`, or stored `to` equal to this agent. Room membership never gates a row. A gated or
 * irrelevant row is still examined, so it still advances `covered_through_seq`.
 *
 * **The wait is fetch's (D4).** With no row past `after_seq` and a positive effective wait, this calls
 * {@link waitForInboxRows}, which subscribes to `inbox:<project_id>` before its first `await`. This
 * module owns no timer, so the daemon-bundle timer allowlist is unchanged.
 */

import type { DatabaseSync } from "node:sqlite";
import type { EventEmitter } from "node:events";
import type { z } from "zod";

import { DOORBELL_SCAN_DEPTH } from "../../shared/constants.js";
import type { doorbellRequestSchema, doorbellResponseSchema } from "../../shared/ipc-contract.js";
import type { ProjectRosterEntry } from "../../shared/project-file.js";
import { reverseRosterLookup } from "../admission.js";
import { effectiveWaitSeconds, waitForInboxRows } from "./fetch.js";

export type DoorbellRequest = z.infer<typeof doorbellRequestSchema>;
export type DoorbellResponse = z.infer<typeof doorbellResponseSchema>;

/** The binding fields `serveDoorbell` reads, and no others. */
export interface DoorbellServeBinding {
	readonly project_id: string;
	readonly agent_id: string;
	readonly roster_snapshot: readonly ProjectRosterEntry[];
}

/** What {@link serveDoorbell} needs. */
export interface ServeDoorbellDeps {
	readonly db: DatabaseSync;
	readonly binding: DoorbellServeBinding;
	/** The poller's event emitter; the wait subscribes to `inbox:<project_id>` on it. Omitted, the call never waits past its first empty read. */
	readonly emitter?: EventEmitter;
	/** Injected for the wait; production uses fetch's `AbortSignal`-driven `setTimeout`. */
	readonly delay?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** One `updates` row as the doorbell reads it back: routing facts only, never the message text. */
interface ScanRow {
	readonly seq: number;
	readonly envelope_json: string;
	readonly via: "direct" | "group";
	readonly from_agent_id: string;
	readonly from_user_id: number;
}

/** The envelope fields the doorbell reads out of `updates.envelope_json`. */
interface ScannedEnvelope {
	readonly type: DoorbellResponse["types"][number];
	readonly to: string | null;
	readonly thread: string;
}

function readScanRows(db: DatabaseSync, projectId: string, afterSeq: number): ScanRow[] {
	return db
		.prepare(
			`SELECT seq, envelope_json, via, from_agent_id, from_user_id
			   FROM updates WHERE project_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?`,
		)
		.all(projectId, afterSeq, DOORBELL_SCAN_DEPTH + 1) as unknown as ScanRow[];
}

/** v1 `peek.ts:79-85`'s relevance rule, over the addressee admission already translated and stored. */
function isRelevant(row: ScanRow, envelope: ScannedEnvelope, agentId: string): boolean {
	return row.via === "direct" || envelope.type === "BROADCAST" || envelope.to === agentId;
}

/** Unique values in code-unit order, so equal scans give byte-equal summaries. */
function uniqueSorted<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)].sort();
}

/** Serves one doorbell read for one session's project (D3, D4, D5). See the module doc. */
export async function serveDoorbell(input: DoorbellRequest, deps: ServeDoorbellDeps): Promise<DoorbellResponse> {
	const { db, binding } = deps;
	const readRows = (): ScanRow[] => readScanRows(db, binding.project_id, input.after_seq);
	let rows = readRows();
	const waitSeconds = effectiveWaitSeconds(input.timeout_s);
	if (rows.length === 0 && waitSeconds > 0) {
		rows = await waitForInboxRows(deps, binding.project_id, waitSeconds, readRows);
	}

	const saturated = rows.length > DOORBELL_SCAN_DEPTH;
	const examined = saturated ? rows.slice(0, DOORBELL_SCAN_DEPTH) : rows;

	const senders: string[] = [];
	const types: DoorbellResponse["types"] = [];
	const threads: string[] = [];
	let count = 0;
	for (const row of examined) {
		const senderVerified =
			reverseRosterLookup(binding.roster_snapshot, row.from_user_id) === row.from_agent_id &&
			row.from_agent_id !== binding.agent_id;
		if (!senderVerified) {
			continue;
		}
		const envelope = JSON.parse(row.envelope_json) as ScannedEnvelope;
		if (!isRelevant(row, envelope, binding.agent_id)) {
			continue;
		}
		count += 1;
		senders.push(row.from_agent_id);
		types.push(envelope.type);
		threads.push(envelope.thread);
	}

	return {
		count,
		senders: uniqueSorted(senders),
		types: uniqueSorted(types),
		threads: uniqueSorted(threads),
		covered_through_seq: examined.length > 0 ? examined[examined.length - 1].seq : input.after_seq,
		saturated,
	};
}
