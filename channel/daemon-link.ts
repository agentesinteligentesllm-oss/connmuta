import { join } from "node:path";
import type { z } from "zod";

import { readRunFile, resolveClientHomeDir } from "../src/client/run-file.js";
import { exchangeSession, HandshakeError, type SessionIdentity } from "../src/client/session-exchange.js";
import { CHANNEL_SHUTDOWN_TIMEOUT_MS, IPC_REQUEST_TIMEOUT_MS } from "../src/shared/constants.js";
import {
	channelCursorResponseSchema,
	doorbellResponseSchema,
	HTTP_CONFLICT,
	HTTP_UNAUTHORIZED,
	ipcErrorSchema,
	IPC_LOOPBACK_HOST,
} from "../src/shared/ipc-contract.js";

/**
 * The channel adapter's link to the daemon (`channel/daemon-link.ts`, F4 design D6/D7/D12, spec
 * `channel-doorbell`): one lazily minted session, the two `/channel/*` route calls parsed by their strict
 * schemas, and a best-effort `DELETE /session` on close.
 *
 * **Spawn-free and timer-free (D7).** The link reads the run file and hands it to `exchangeSession`; it
 * never starts or keeps the daemon alive, so a missing run file is `NO_DAEMON` and the caller decides when
 * to probe again. It owns no sleep and no backoff: pacing belongs to `channel/doorbell-loop.ts`, the only
 * timer file. Its bounds use `AbortSignal.timeout`, which schedules nothing this module can see.
 *
 * **Session cache.** A memoized promise, the shape of `client/ipc-stub.ts` `createIpcSession`: concurrent
 * callers share one handshake and a rejected handshake clears itself. Every attempt re-reads the run file,
 * because a daemon that idle-shut-down restarts on a new ephemeral port. Known limitation: `exchangeSession`
 * may re-read the run file itself and mint on a different port than the payload passed to it; the first
 * route call then fails with `TRANSPORT`, the cache clears, and the next attempt heals it.
 *
 * **Errors.** Every failure is a {@link DaemonLinkError} from a closed vocabulary; the watcher treats them
 * all alike. No message carries the bearer, and no cause is attached, so nothing thrown can leak it.
 */

/** The daemon's frozen-binding-drift code (`BINDING_CHANGED` in the daemon's IPC routes). Mirrored, not imported: the adapter's closure holds no daemon module. */
const BINDING_CHANGED_CODE = "BINDING_CHANGED";

const SESSION_PATH = "/session";
const DOORBELL_PATH = "/channel/doorbell";
const CURSOR_PATH = "/channel/cursor";

export const DAEMON_LINK_ERROR_CODES = [
	"NO_DAEMON",
	"HANDSHAKE_FAILED",
	"UNAUTHORIZED",
	"BINDING_CHANGED",
	"REFUSED",
	"TRANSPORT",
	"MALFORMED",
	"ABORTED",
] as const;

export type DaemonLinkErrorCode = (typeof DAEMON_LINK_ERROR_CODES)[number];

export class DaemonLinkError extends Error {
	readonly code: DaemonLinkErrorCode;

	constructor(code: DaemonLinkErrorCode, message: string) {
		super(message);
		this.name = "DaemonLinkError";
		this.code = code;
	}
}

export type DoorbellResponse = z.infer<typeof doorbellResponseSchema>;

/** What the doorbell loop needs from the daemon; an interface so its tests can inject a fake. */
export interface DaemonLink {
	/** One long-poll doorbell read. `signal` is the caller's abort (shutdown); the per-request bound is the link's own. */
	readDoorbell(afterSeq: number, timeoutS: number, signal?: AbortSignal): Promise<DoorbellResponse>;
	/** Ensures and reads the cursor row when `commitSeq` is absent, else advances it; resolves to the stored `inbox_seq`. */
	commitCursor(commitSeq?: number): Promise<number>;
	/** Best effort, idempotent, never rejects. Afterwards every route call throws `ABORTED`. */
	close(): Promise<void>;
}

export interface DaemonLinkDeps {
	/** The caller supplies `host` (the adapter passes `CHANNEL_HOST_LABEL`); the link names none of its own. */
	readonly identity: SessionIdentity;
	readonly homeDir?: string;
	readonly fetchImpl?: typeof fetch;
}

interface LinkSession {
	readonly port: number;
	readonly bearer: string;
}

/** Rejects when `signal` aborts, so an await can be bounded without a timer API. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		signal.addEventListener("abort", () => reject(signal.reason), { once: true });
	});
}

/** Turns one route response into its parsed body or a {@link DaemonLinkError}. A 401 here is the second in a row: the caller already retried. */
async function parseResponse<T>(path: string, res: Response, schema: z.ZodType<T>): Promise<T> {
	if (res.status === HTTP_UNAUTHORIZED) {
		throw new DaemonLinkError("UNAUTHORIZED", `${path} rejected the session bearer after one re-handshake`);
	}
	const body: unknown = await res.json().catch(() => undefined);
	if (res.ok) {
		const parsed = schema.safeParse(body);
		if (parsed.success) {
			return parsed.data;
		}
		throw new DaemonLinkError("MALFORMED", `${path} answered ${res.status} with a body outside its schema`);
	}
	const refusal = ipcErrorSchema.safeParse(body);
	if (!refusal.success) {
		throw new DaemonLinkError("MALFORMED", `${path} answered ${res.status} without a valid error body`);
	}
	if (res.status === HTTP_CONFLICT && refusal.data.code === BINDING_CHANGED_CODE) {
		throw new DaemonLinkError("BINDING_CHANGED", `${path} refused: the session's frozen binding no longer matches`);
	}
	throw new DaemonLinkError("REFUSED", `${path} refused: ${refusal.data.code}`);
}

export function createDaemonLink(deps: DaemonLinkDeps): DaemonLink {
	const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
	let connecting: Promise<LinkSession> | undefined;
	let closed = false;
	let closing: Promise<void> | undefined;

	const urlFor = (session: LinkSession, path: string): string => `http://${IPC_LOOPBACK_HOST}:${session.port}${path}`;

	/** Reads a fresh run file and handshakes. Never call directly; go through {@link ensureSession}. */
	async function connect(): Promise<LinkSession> {
		const run = readRunFile(join(resolveClientHomeDir(deps.homeDir), "run"));
		if (run === null) {
			throw new DaemonLinkError("NO_DAEMON", "no live daemon run file");
		}
		try {
			const session = await exchangeSession(run, deps.identity, { homeDir: deps.homeDir, fetchImpl });
			return { port: run.port, bearer: session.bearer };
		} catch (err) {
			const detail = err instanceof HandshakeError ? `${err.code}: ${err.message}` : "unexpected failure";
			throw new DaemonLinkError("HANDSHAKE_FAILED", `handshake failed (${detail})`);
		}
	}

	/** Forgets `used` unless a newer attempt already replaced it, so a stale failure never clears a fresh session. */
	function dropSession(used: Promise<LinkSession>): void {
		if (connecting === used) {
			connecting = undefined;
		}
	}

	/** The one shared handshake attempt, in flight or settled. A rejection clears itself so the next call retries. */
	function ensureSession(): Promise<LinkSession> {
		if (connecting === undefined) {
			const attempt = connect();
			connecting = attempt;
			attempt.catch(() => dropSession(attempt));
		}
		return connecting;
	}

	function assertOpen(callerSignal?: AbortSignal): void {
		if (closed || callerSignal?.aborted) {
			throw new DaemonLinkError("ABORTED", closed ? "the link is closed" : "aborted by the caller");
		}
	}

	/** One `POST` attempt on the session behind `used`. A connection failure drops that session; a timeout keeps it (daemon alive, just slow). */
	async function send(used: Promise<LinkSession>, path: string, payload: string, callerSignal?: AbortSignal): Promise<Response> {
		const session = await used;
		assertOpen(callerSignal);
		const bound = AbortSignal.timeout(IPC_REQUEST_TIMEOUT_MS);
		try {
			return await fetchImpl(urlFor(session, path), {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${session.bearer}` },
				body: payload,
				signal: callerSignal === undefined ? bound : AbortSignal.any([callerSignal, bound]),
			});
		} catch (err) {
			if (callerSignal?.aborted) {
				throw new DaemonLinkError("ABORTED", "aborted by the caller");
			}
			const timedOut = err instanceof Error && err.name === "TimeoutError";
			if (!timedOut) {
				dropSession(used);
			}
			throw new DaemonLinkError("TRANSPORT", `${path} ${timedOut ? "timed out" : "was unreachable"}`);
		}
	}

	async function post<T>(path: string, body: unknown, schema: z.ZodType<T>, callerSignal?: AbortSignal): Promise<T> {
		assertOpen(callerSignal);
		const payload = JSON.stringify(body);
		let used = ensureSession();
		let res = await send(used, path, payload, callerSignal);
		if (res.status === HTTP_UNAUTHORIZED) {
			// The bearer is no longer recognized (a daemon restart voids every prior one): one fresh
			// handshake and one retry, never a loop. A second 401 surfaces from parseResponse.
			dropSession(used);
			used = ensureSession();
			res = await send(used, path, payload, callerSignal);
		}
		return parseResponse(path, res, schema);
	}

	/** Waits for an in-flight handshake (bounded), then deletes that session. Never mints one and never rejects. */
	async function deleteSession(): Promise<void> {
		const pending = connecting;
		if (pending === undefined) {
			return;
		}
		try {
			const session = await Promise.race([pending, rejectOnAbort(AbortSignal.timeout(CHANNEL_SHUTDOWN_TIMEOUT_MS))]);
			await fetchImpl(urlFor(session, SESSION_PATH), {
				method: "DELETE",
				headers: { authorization: `Bearer ${session.bearer}` },
				signal: AbortSignal.timeout(CHANNEL_SHUTDOWN_TIMEOUT_MS),
			});
		} catch {
			// Best effort: a dead daemon has already freed the slot, and shutdown must not wait on it.
		}
	}

	return {
		readDoorbell: (afterSeq, timeoutS, signal) =>
			post(DOORBELL_PATH, { after_seq: afterSeq, timeout_s: timeoutS }, doorbellResponseSchema, signal),
		commitCursor: async (commitSeq) => {
			const { inbox_seq } = await post(CURSOR_PATH, commitSeq === undefined ? {} : { commit_seq: commitSeq }, channelCursorResponseSchema);
			return inbox_seq;
		},
		close: () => {
			closed = true;
			closing ??= deleteSession();
			return closing;
		},
	};
}
