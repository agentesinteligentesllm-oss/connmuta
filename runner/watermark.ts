import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The runner's own doorbell watermark (`runner/watermark.ts`; ADR-0032 R3/R6).
 *
 * **Why the satellite needs its own copy.** The daemon's `client_cursors` row is keyed by the session id the
 * IPC handshake mints, and a *new* session's row is seeded at the daemon's own catch-up window
 * (`SESSION_CATCHUP_HOURS`, `src/ledger/cursors.ts`'s `ensureClientCursor`). For an interactive session that
 * seed is the documented D-19 behaviour — a fresh session re-reads the window a v1 session would have
 * received from Telegram. For a **wake satellite** it is wrong: every runner restart would mint a new session,
 * re-read up to that whole window, and start turns for messages that were handled hours ago. The Judgment Day
 * audit of this phase found exactly that (both judges, `bus-v2-f7a-audit-001`), which is what this module
 * exists to fix.
 *
 * So the runner persists one watermark per binding, machine-local, and resumes from
 * `max(persisted, daemon's seed)`: the first run ever still sees the daemon's catch-up window (nothing is
 * skipped that a first look should see), and every later run resumes exactly where the previous one stopped.
 * A watermark that cannot be read is treated as absent, never as zero — reading it as zero would re-wake the
 * whole backlog, so the failure has to fall back to the daemon's own seed instead.
 *
 * **What it is not.** It is not a delivery receipt and not a security record: the ledger
 * (`runner/ledger.ts`) carries what happened, and this file carries only "how far the doorbell has been
 * read". Neither is daemon-attested (R6a).
 */

export interface WatermarkRead {
	readonly seqs: ReadonlyMap<string, number>;
	readonly problem: "missing" | "unreadable" | "malformed" | null;
}

/** `<home>/runner/watermark.json`. Named once so the loop, the CLI and the tests cannot disagree. */
export function watermarkPathFor(homeDir: string): string {
	return join(homeDir, "runner", "watermark.json");
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads the file. A missing, unreadable or malformed file yields no watermarks and says which it was. */
export function readWatermark(path: string): WatermarkRead {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		return { seqs: new Map(), problem: code === "ENOENT" ? "missing" : "unreadable" };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { seqs: new Map(), problem: "malformed" };
	}
	if (!isRecord(parsed) || !isRecord(parsed.seqs)) {
		return { seqs: new Map(), problem: "malformed" };
	}
	const seqs = new Map<string, number>();
	for (const [projectId, value] of Object.entries(parsed.seqs)) {
		if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) seqs.set(projectId, value);
	}
	return { seqs, problem: null };
}

/** One binding's persisted watermark, or `undefined` when there is none to resume from. */
export function readWatermarkFor(path: string, projectId: string): number | undefined {
	return readWatermark(path).seqs.get(projectId);
}

/**
 * Persists one binding's watermark, never moving it backwards, and preserving the other bindings. Atomic
 * (temp file plus rename) for the same reason the ladder's write is: a crash mid-write must not leave a file
 * that reads as "no watermark". An unreadable file is replaced rather than trusted — the watermark's only job
 * is to resume, so losing it costs a re-read of the daemon's window, never a lost message.
 */
export function writeWatermark(path: string, projectId: string, seq: number): void {
	if (!Number.isSafeInteger(seq) || seq < 0) return;
	const read = readWatermark(path);
	const current = read.seqs.get(projectId);
	if (current !== undefined && current >= seq) return;
	const next = new Map(read.seqs);
	next.set(projectId, seq);
	const sorted = [...next.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	const body = `${JSON.stringify({ seqs: Object.fromEntries(sorted) }, null, 2)}\n`;

	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temp = `${path}.${process.pid}.tmp`;
	try {
		writeFileSync(temp, body, { encoding: "utf8", mode: 0o600 });
		renameSync(temp, path);
	} catch (err) {
		rmSync(temp, { force: true });
		throw err;
	}
}
