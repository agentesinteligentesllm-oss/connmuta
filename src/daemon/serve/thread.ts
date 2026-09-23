/**
 * Provenance: telegram-agent-bus src/tools/thread.ts @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 900f8be90853321ee609c0d6c3fa65a9f392a28329aacec732b61c882d0bfc89
 *   (SHA-256 of the frozen v1 file's whole body — its lines 1-164, LF-normalized, including line
 *    164's terminating newline. Reproduce with `node -e "…"` over the frozen checkout, following the
 *    same method `daemon/serve/status.ts`'s header documents and validates against its own pinned
 *    value.)
 * Changes: (1) `loadState`/`state.json` becomes one ledger read: `readThreadRecord` (`ledger/threads.ts`,
 * PR-12), scoped to `binding.project_id` — a thread id that exists only under another project answers
 * `UNKNOWN_THREAD` the same as one this ledger has never seen at all (invariant 1); (2) `renderBody`'s
 * single `wrapUntrusted(body)` call becomes D-15's attributed form, `wrapUntrusted(body, origin)`, with
 * the origin taken from the binding and the STORED verified sender — never the envelope's own `from`
 * claim, which admission (`daemon/admission.ts`) already overwrote before anything reached the ledger;
 * (3) the peer's numeric identity is resolved from `binding.roster_snapshot`, falling back to
 * {@link UNRESOLVED_ORIGIN_USER_ID} (`daemon/serve/fetch.ts`, PR-23) when the author has drifted out of
 * it since the thread opened; (4) `deps.config`/`deps.homeDir` become `deps.binding` (design §12 row
 * "`src/tools/thread.ts` | SEAM | `daemon/serve/thread.ts`"); (5) `ThreadToolInput` is not re-exported
 * from `shared/tool-output.ts` — the IPC boundary validates `thread_id` with `threadInputSchema`
 * (`shared/tool-schemas.ts`, twelve lowercase hex characters) before this module ever sees it, so
 * `serveThread` takes the already-validated shape directly.
 *
 * ---
 *
 * Serves `thread` for one calling client (`daemon/serve/thread.ts`, design §12's `thread` row; D-15;
 * `thin-client-tools › status and thread are local, no-network reads`, `thin-client-tools › Fence
 * soundness and origin labels`, PT-13, PT-14).
 *
 * **A pure ledger read, exactly like `daemon/serve/status.ts`.** This module writes nothing: it calls
 * {@link readThreadRecord} once and returns. No `ledger/cursors.ts` call belongs here — `thread` carries
 * no per-client state of its own, unlike `fetch`'s surfaced-thread stamps.
 *
 * **`UNKNOWN_THREAD` is scoped to the binding's project by construction.** `readThreadRecord` reads
 * `WHERE project_id = ? AND thread_id = ?`; a thread id that exists only under another binding's project
 * therefore returns `undefined` here exactly as an id this ledger has never seen at all does (invariant
 * 1) — there is no separate check to get wrong. `input.thread_id` reaches this module only after
 * `threadInputSchema` validated it at the IPC boundary, so the id interpolated into
 * {@link ThreadToolError}'s message is never attacker-shaped free text.
 *
 * **D-15's fence, applied per message, exactly like `daemon/serve/fetch.ts`.** A message this binding's
 * own agent authored is trusted prose and stays raw (v1's `renderBody` rule, unchanged); every other
 * message is wrapped with the origin `{ project_id: binding.project_id, agent_id: <the STORED author>,
 * user_id: <resolved from binding.roster_snapshot> }`. "Stored author" matters: `ThreadRecord.from` and
 * `HistoryEntry.from` are the VERIFIED sender admission wrote (`daemon/admission.ts` overwrites the
 * envelope's own `from` claim with a reverse roster lookup of the Telegram sender before anything is
 * persisted), so this module never re-derives identity — it only labels what is already on the row.
 *
 * **The unresolved sentinel, not a thrown error, for a drifted author.** `ThreadRecord`/`HistoryEntry`
 * carry only the author's agent id, never their numeric Telegram id, so a roster that changed since the
 * thread opened — or since this session's binding snapshot was taken — can leave that agent id absent
 * from `binding.roster_snapshot` here. {@link UNRESOLVED_ORIGIN_USER_ID} (`daemon/serve/fetch.ts`) is
 * imported rather than redefined, so the two serve modules share one sentinel value; the lookup itself
 * is not shared, because `daemon/serve/fetch.ts` never exports it (each caller keeps its own small
 * `roster.find`).
 */

import type { DatabaseSync } from "node:sqlite";

import { wrapUntrusted, type FenceOrigin } from "../../shared/fence.js";
import type { ProjectRosterEntry } from "../../shared/project-file.js";
import { computeAgeHours } from "../../shared/protocol-select.js";
import type { HistoryEntry, ThreadRecord } from "../../shared/thread-record.js";
import { readThreadRecord } from "../../ledger/threads.js";
import { UNRESOLVED_ORIGIN_USER_ID } from "./fetch.js";

/** The binding fields {@link serveThread} reads, and no others (design §12's `thread` row). */
export interface ThreadServeBinding {
	readonly project_id: string;
	readonly agent_id: string;
	readonly roster_snapshot: readonly ProjectRosterEntry[];
}

/** What {@link serveThread} needs. */
export interface ServeThreadDeps {
	readonly db: DatabaseSync;
	readonly binding: ThreadServeBinding;
	readonly now?: () => Date;
}

/** `agentbus_thread` tool input — one thread id, already validated at the IPC boundary (twelve lowercase hex). */
export interface ThreadToolInput {
	readonly thread_id: string;
}

/** One message in a thread's transcript, in arrival order (v1: `src/tools/thread.ts`, shape unchanged). */
export interface ThreadMessageEntry {
	eid: string;
	type: string;
	/** The VERIFIED sender — `daemon/admission.ts` overwrites the envelope's own claim before anything is stored. */
	from: string;
	/**
	 * Fenced in the D-15 label when a peer wrote it, raw when this binding's own agent did.
	 *
	 * Wrapping happens HERE, on the way out, never at rest: the stored form stays exactly what
	 * arrived, so the fence cannot be double-applied and a reader is never left guessing whether
	 * the delimiters are data or structure.
	 */
	body: string;
	at: string;
	via: "direct" | "group";
	/** Set on the opening message, the one held outside the capped history and therefore never pruned. */
	opening?: true;
}

/** `agentbus_thread` tool output — the thread's standing, then its transcript. */
export interface ThreadToolOutput {
	thread: string;
	status: "open" | "resolved";
	/** `outbound` when this binding's agent opened the thread, `inbound` when the peer did — `status.ts`'s idiom. */
	direction: "inbound" | "outbound";
	peer: string | null;
	/** Whose turn it is, or `null` on a closed thread. */
	awaiting: string | null;
	opened_at: string;
	age_hours: number;
	acked: boolean;
	ack_count: number;
	resolved_at: string | null;
	resolved_by: string | null;
	basis: string | null;
	/**
	 * `false` when this agent closed the thread locally while the transport was down (ADR-19).
	 *
	 * Surfaced here because a transcript showing a closed thread without saying the peer was never
	 * told would recreate the silent divergence local abandonment exists to make visible.
	 */
	closure_delivered: boolean;
	/** The opening message followed by every in-thread message, oldest first. */
	messages: ThreadMessageEntry[];
}

export type ThreadErrorCode = "UNKNOWN_THREAD";

/** Raised by {@link serveThread} for the one condition it rejects. */
export class ThreadToolError extends Error {
	readonly code: ThreadErrorCode;

	constructor(code: ThreadErrorCode, message: string) {
		super(message);
		this.name = "ThreadToolError";
		this.code = code;
	}
}

/** A peer agent id's numeric Telegram identity, from the binding's roster snapshot, or the unresolved sentinel. */
function resolveOriginUserId(roster: readonly ProjectRosterEntry[], agentId: string): number {
	const entry = roster.find((candidate) => candidate.agent_id === agentId);
	return entry !== undefined ? entry.user_id : UNRESOLVED_ORIGIN_USER_ID;
}

/** Peer-authored text is fenced with its D-15 origin; this binding's own prose is not untrusted input and stays raw. */
function renderBody(body: string, from: string, binding: ThreadServeBinding): string {
	if (from === binding.agent_id) {
		return body;
	}
	const origin: FenceOrigin = {
		project_id: binding.project_id,
		agent_id: from,
		user_id: resolveOriginUserId(binding.roster_snapshot, from),
	};
	return wrapUntrusted(body, origin);
}

function buildTranscript(record: ThreadRecord, binding: ThreadServeBinding): ThreadMessageEntry[] {
	const opening: ThreadMessageEntry = {
		eid: record.opened_eid,
		type: record.opened_type,
		from: record.from,
		body: renderBody(record.body, record.from, binding),
		at: record.opened_at,
		via: record.via,
		opening: true,
	};

	return [
		opening,
		...record.history.map((entry: HistoryEntry) => ({
			eid: entry.eid,
			type: entry.type,
			from: entry.from,
			body: renderBody(entry.body, entry.from, binding),
			at: entry.at,
			via: entry.via,
		})),
	];
}

/**
 * Serves one `thread` call over the ledger (design §12's `thread` row). See the module doc.
 *
 * Ported from v1's `threadTool` (`v1:src/tools/thread.ts:132-164`), unchanged in shape: reads one
 * thread record, fences every message not authored by this binding's own agent, and reports
 * `UNKNOWN_THREAD` for anything `readThreadRecord` cannot find under this binding's project.
 */
export async function serveThread(input: ThreadToolInput, deps: ServeThreadDeps): Promise<ThreadToolOutput> {
	const { db, binding } = deps;
	const now = deps.now ?? ((): Date => new Date());

	const record = readThreadRecord(db, binding.project_id, input.thread_id);
	if (record === undefined) {
		// Not an empty transcript: "this conversation had no messages" and "this ledger has never seen
		// that thread" (in this project) are different statements, and only one of them is true here.
		throw new ThreadToolError(
			"UNKNOWN_THREAD",
			`Thread "${input.thread_id}" is not known locally. Run agentbus_fetch to receive it, or check the id — a resolved thread is pruned after its retention window.`,
		);
	}

	const direction: "inbound" | "outbound" = record.from === binding.agent_id ? "outbound" : "inbound";

	return {
		thread: input.thread_id,
		status: record.status,
		direction,
		peer: direction === "outbound" ? record.to : record.from,
		awaiting: record.awaiting,
		opened_at: record.opened_at,
		age_hours: computeAgeHours(record.opened_at, now()),
		acked: record.ack_count > 0,
		ack_count: record.ack_count,
		resolved_at: record.resolved_at,
		resolved_by: record.resolved_by,
		basis: record.basis,
		closure_delivered: record.closure_delivered,
		messages: buildTranscript(record, binding),
	};
}
