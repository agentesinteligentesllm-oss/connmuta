/**
 * The daemon's session and tool routing (`daemon/ipc/routes.ts`, design §10 "IPC", spec
 * `ipc-handshake` "Session binds one project and freezes for its lifetime", "Roster hash detects
 * drift without auto-resolving it" (D-07), "Client error taxonomy for handshake and session
 * failures"). New code: design §12 lists no v1 range for this module — v1 had no local daemon and no
 * HTTP surface at all — so this file carries no vendoring header and adds no row to
 * `test/fixtures/v1-provenance.json`.
 *
 * Owns `POST /session` (binding resolution, R4, roster-hash drift, bearer mint), `DELETE /session`
 * (bearer revoke), and the four `POST /tools/*` routes (401 gate, per-call freeze check, request-body
 * validation, dispatch to the real tool function, and the `ToolErrorPayload` composition on failure).
 * `handshake.ts` (`GET /identity`) and `sessions.ts` (the bearer store's own primitives) are deliberately
 * separate modules this one calls into — see their own docs for why.
 *
 * **Decision 1 — `DAEMON_VERSION_MISMATCH` and `IPC_ERROR` are exclusively client-side vocabulary.**
 * Confirmed the same way `handshake.ts` confirms it for `DAEMON_IDENTITY_MISMATCH`: spec's own scenario
 * wording is framed as "WHEN the client compares…" / "THEN the client surfaces…", and
 * `shared/error-payload.ts`'s and `shared/ipc-contract.ts`'s doc comments both disclaim this family from
 * the daemon's own contract. `DAEMON_VERSION_MISMATCH` depends only on `GET /identity`'s `build` field
 * (already shipped, PR-30); `IPC_ERROR` is the client's own classification of a raw transport failure —
 * there is nothing for this module to guarantee about either one, and no test here asserts them.
 *
 * **A real gap found in the already-shipped `shared/ipc-contract.ts` (PR-29/30) — fixed in this PR,
 * not worked around.** Design's own sequence diagram (§10, step 7) shows `POST /session`'s body
 * carrying `hmac: HMAC-SHA256(secret, "session:" + server_nonce)`, and step 8 says the daemon "verifies
 * hmac (nonce single-use...)" — which requires the daemon to know WHICH `server_nonce` a request's
 * `hmac` was computed against, so it can call `PendingHandshakeStore.consume(server_nonce)` and
 * `SessionStore.mint(server_nonce, hmac)` (both take that value as an explicit argument; neither
 * searches for it). `sessionRequestSchema` had no `server_nonce` field — a `z.strictObject` silently
 * unable to keep a guarantee (ADR-12) the daemon actually needs on every real request. Extended
 * `sessionRequestSchema` itself (reusing `identityResponseSchema`'s own `nonceHexSchema` for the same
 * value) rather than reading the field off the raw body out-of-band: this is the module that first
 * implements `POST /session` end-to-end, so the contract's own gap is this PR's to close, not to route
 * around. `test/shared/ipc-contract.test.ts` carries the updated fixture and a new shape test.
 *
 * **Check order at `POST /session`: registry resolution before nonce consumption.** `UNBOUND_PROJECT`
 * and `BINDING_MISMATCH` (R4) are checked BEFORE `PendingHandshakeStore.consume` and `SessionStore.mint`
 * run, even though neither spec nor design pins the order (every RED scenario isolates exactly one
 * failing condition, so the order is not independently observable by any of them). The reason is
 * resource hygiene, not security: consuming a single-use nonce or minting a bearer for a request that
 * is refused anyway for registry reasons would burn a nonce and (worse) mint an orphaned bearer nothing
 * can ever reach — `POST /session`'s own success response is the only place a bearer is returned, so a
 * bearer minted just before an unrelated refusal would sit in `SessionStore` wasting a
 * `MAX_ACTIVE_SESSIONS` slot until the daemon restarts. Checking the cheap, side-effect-free registry
 * lookup first avoids that.
 *
 * **Freeze state is this module's own, keyed by bearer.** `SessionStore` only tracks bearer validity;
 * the `(bot_id, group_id, agent_id)` snapshot a session freezes (design §10 "Freeze" row) is a private
 * `Map<string, FrozenSessionRecord>` here, mutated in lockstep with `SessionStore` (`POST /session` sets
 * both; `DELETE /session` clears both) so the two can never drift apart under correct operation.
 *
 * **`toTelegramErrorPayload` (decision 7).** Composes `daemon/telegram.ts`'s `classifyErrorChain` with
 * `shared/error-payload.ts`'s `toolErrorPayload`, with one addition beyond the literal composition: a
 * `SendToolError`'s own `retry_after_s` (set for a LOCALLY re-detected 429 — `send/rate.ts`'s own module
 * doc states the AS-IS transports deliberately sever the cause chain for that exact case, so
 * `classifyErrorChain` finds nothing to walk) is carried onto the fallback payload rather than silently
 * dropped, since `toolErrorPayload` itself carries no `retry_after_s` parameter.
 *
 * **HTTP status for a tool-level rejection.** Neither spec nor design pins one per `SendErrorCode`/
 * `ThreadErrorCode` (design's own client taxonomy table calls these "daemon, passed through unchanged",
 * discriminated by the body's `code`, not by a bespoke status per code). This module uses
 * {@link HTTP_TOO_MANY_REQUESTS} for a rate-limited rejection (`RATE_LIMITED`, `TELEGRAM_RATE_LIMITED` —
 * the one pairing that is unambiguous either way), {@link HTTP_INTERNAL_SERVER_ERROR} for a genuinely
 * unclassified defect (no tool-level `.code` at all — never expected in correct operation), and
 * {@link HTTP_BAD_REQUEST} for every other tool-level rejection.
 */

import { randomUUID } from "node:crypto";
import type { EventEmitter } from "node:events";
import type { DatabaseSync } from "node:sqlite";

import { appendAuditRow } from "../../ledger/audit.js";
import { toolErrorPayload, type ToolErrorPayload } from "../../shared/error-payload.js";
import {
	HTTP_BAD_REQUEST,
	HTTP_CONFLICT,
	HTTP_INTERNAL_SERVER_ERROR,
	HTTP_NOT_FOUND,
	HTTP_OK,
	HTTP_TOO_MANY_REQUESTS,
	HTTP_UNAUTHORIZED,
	IPC_BAD_REQUEST,
	ipcTransportError,
	sessionRequestSchema,
	type IpcRouteKey,
	type SessionResponse,
} from "../../shared/ipc-contract.js";
import { fetchInputSchema, sendInputSchema, statusInputSchema, threadInputSchema } from "../../shared/tool-schemas.js";
import type { ManagedBinding } from "../bindings.js";
import { BindingMutex, sendPath, type SendPathDeps } from "../send/send-path.js";
import { SendRateBudget } from "../send/rate.js";
import { SendToolError } from "../send/validate.js";
import { serveFetch, type ServeFetchDeps } from "../serve/fetch.js";
import { serveStatus, type ServeStatusDeps, type StatusDaemonFacts } from "../serve/status.js";
import { serveThread, ThreadToolError, type ServeThreadDeps } from "../serve/thread.js";
import { classifyErrorChain } from "../telegram.js";
import type { PendingHandshakeStore } from "./handshake.js";
import type { IpcHandler, IpcRequest, IpcResponse } from "./server.js";
import type { SessionStore } from "./sessions.js";

// ---------------------------------------------------------------------------
// Daemon-raised business codes (open strings — `ipcErrorSchema.code` has no closed enum, see its doc)
// ---------------------------------------------------------------------------

/** `POST /session` refused: no active registry binding for the requested `project_id` (design §10 "Unbound"). */
export const UNBOUND_PROJECT = "UNBOUND_PROJECT";

/** `POST /session` refused: `PendingHandshakeStore.consume(server_nonce)` found no matching, unexpired, unconsumed nonce. */
export const HANDSHAKE_NONCE_INVALID = "HANDSHAKE_NONCE_INVALID";

/** `POST /session` refused: the nonce consumed, but `SessionStore.mint` rejected the claimed hmac or the store was at capacity — the two are deliberately not distinguished, see `sessions.ts`. */
export const SESSION_MINT_REFUSED = "SESSION_MINT_REFUSED";

/** `POST /session` refused: the client's `group_id` disagrees with the resolved binding's `group_id` (registry invariant R4). */
export const BINDING_MISMATCH = "BINDING_MISMATCH";

/** A `/tools/*` call refused: the live binding's `(bot_id, group_id, agent_id)` differs from this session's frozen snapshot (design §10 "Freeze"). */
export const BINDING_CHANGED = "BINDING_CHANGED";

/**
 * A `/tools/*` or `DELETE /session` call refused: the bearer is missing, unrecognized, or from a
 * previous daemon boot (design §10 "401"; spec "Raw per-boot secret is rejected as a bearer",
 * "Stale-boot bearer rejected"). Neither spec nor design names a code for this one beyond "401" itself
 * — every other refusal in this module has one, so this is this module's own name for it.
 */
export const SESSION_UNAUTHORIZED = "SESSION_UNAUTHORIZED";

/** The condition `POST /session` raises in its response when the client's forwarded `roster_hash` disagrees with the resolved binding's stored one (D-07). Never auto-resolved; the session is still minted. */
export const ROSTER_DRIFT_CONDITION = "roster_drift";

/** Fallback tool-error code for a failure with no recognizable tool-level `.code` of its own — never expected in correct operation; see {@link toolErrorHttpStatus}. */
const UNCLASSIFIED_TOOL_ERROR_CODE = "TOOL_ERROR";

/** The two codes `toolErrorHttpStatus` maps to {@link HTTP_TOO_MANY_REQUESTS} — see the module doc's "HTTP status for a tool-level rejection". */
const RATE_LIMITED_TOOL_CODES: ReadonlySet<string> = new Set(["RATE_LIMITED", "TELEGRAM_RATE_LIMITED"]);

/** `"Bearer "` — the only scheme `/tools/*` and `DELETE /session` accept on `Authorization` (design §10 sequence note). */
const BEARER_PREFIX = "Bearer ";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/** The one `BindingsReconciler` method this module needs — see its own doc for why the freeze compare is narrower than `areBindingsEquivalent`. */
export interface BindingResolver {
	getBinding(projectId: string): ManagedBinding | undefined;
}

export interface RoutesDeps {
	readonly db: DatabaseSync;
	readonly bindings: BindingResolver;
	readonly handshakeStore: PendingHandshakeStore;
	readonly sessionStore: SessionStore;
	/** Daemon-level facts `POST /tools/status` reports that no ledger row carries (`serve/status.ts`). */
	readonly daemon: StatusDaemonFacts;
	/** The poller's event emitter; forwarded to `serveFetch`'s D-02 wait. Omitted, a fetch never waits past its first empty read. */
	readonly emitter?: EventEmitter;
	/** Injected for `serveFetch`'s D-02 wait; production uses an `AbortSignal`-driven `setTimeout` (its own default). */
	readonly delay?: (ms: number, signal: AbortSignal) => Promise<void>;
	readonly now?: () => Date;
	/**
	 * Generates `POST /session`'s `client_id` (decision 10) — defaults to `crypto.randomUUID()`.
	 * Deliberately NOT threaded into `sendPath`'s own `generateId`: `client_id` carries no format
	 * constraint, but `sendPath`'s `eid`/`thread` MUST be `EID_PATTERN`/`THREAD_PATTERN`-shaped (12
	 * lowercase hex characters) — sharing one generator between the two broke that shape (found during
	 * this PR's own GREEN pass; see `send/send-path.ts`'s `SendPathDeps.generateId`, left at its own
	 * default here).
	 */
	readonly generateId?: () => string;
}

// ---------------------------------------------------------------------------
// Per-session frozen state (this module's own — not `SessionStore`'s job, see its doc)
// ---------------------------------------------------------------------------

/** The three fields a session freezes for its lifetime (design §10 "Freeze" row) — deliberately narrower than `bindings.ts`'s own `areBindingsEquivalent`, which also compares `roster_hash`/`roster_snapshot`/`settings` for a different purpose (hot-reload change detection). */
interface FrozenBindingSnapshot {
	readonly bot_id: number;
	readonly group_id: number;
	readonly agent_id: string;
}

interface FrozenSessionRecord {
	readonly project_id: string;
	readonly client_id: string;
	readonly host: string;
	readonly pid: number;
	readonly started_at: string;
	readonly frozen: FrozenBindingSnapshot;
}

function sameFrozenBinding(a: FrozenBindingSnapshot, b: FrozenBindingSnapshot): boolean {
	return a.bot_id === b.bot_id && a.group_id === b.group_id && a.agent_id === b.agent_id;
}

function frozenSnapshotOf(binding: ManagedBinding["binding"]): FrozenBindingSnapshot {
	return { bot_id: binding.bot_id, group_id: binding.group_id, agent_id: binding.agent_id };
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function ipcError(code: string, message: string, retryable = false): ToolErrorPayload {
	return { code, message, retryable };
}

/** `Authorization: Bearer <token>` — `undefined` for anything else (missing header, wrong scheme, empty token). */
function extractBearer(headers: IpcRequest["headers"]): string | undefined {
	const raw = headers.authorization;
	if (typeof raw !== "string" || !raw.startsWith(BEARER_PREFIX)) {
		return undefined;
	}
	const token = raw.slice(BEARER_PREFIX.length);
	return token.length > 0 ? token : undefined;
}

/**
 * `daemon/telegram.ts`'s `classifyErrorChain` composed with `shared/error-payload.ts`'s
 * `toolErrorPayload` (decision 7; see the module doc for the `retry_after_s` addition beyond the
 * literal composition).
 */
export function toTelegramErrorPayload(err: unknown, fallbackCode: string): ToolErrorPayload {
	const message = err instanceof Error ? err.message : String(err);
	const classified = classifyErrorChain(err);
	if (classified !== null) {
		const payload: ToolErrorPayload = { code: classified.code, message, retryable: classified.retryable };
		if (classified.retry_after_s !== undefined) payload.retry_after_s = classified.retry_after_s;
		if (classified.new_chat_id !== undefined) payload.new_chat_id = classified.new_chat_id;
		return payload;
	}
	const payload = toolErrorPayload(fallbackCode, message);
	// SendToolError's own retry_after_s (a LOCALLY re-detected 429 — see the module doc) is not part of
	// toolErrorPayload's shape; carried over here rather than dropped. Gated on `payload.retryable`
	// (not just "is this a SendToolError with retry_after_s set"), tying the carry-over to the SAME
	// fact that decided retryable, so no code could ever produce `retryable: false` alongside a
	// populated `retry_after_s` — the structural version of JD-B-001's fix, not just the one code it
	// was reported against (PR-31 Judgment Day round 2, judge B).
	if (err instanceof SendToolError && err.retry_after_s !== undefined && payload.retryable) {
		return { ...payload, retry_after_s: err.retry_after_s };
	}
	return payload;
}

/** The tool-level error's own code, when it has one — see {@link toTelegramErrorPayload}'s `fallbackCode`. */
function toolErrorCodeOf(err: unknown): string {
	if (err instanceof SendToolError) return err.code;
	if (err instanceof ThreadToolError) return err.code;
	return UNCLASSIFIED_TOOL_ERROR_CODE;
}

/** See the module doc's "HTTP status for a tool-level rejection". */
export function toolErrorHttpStatus(code: string): number {
	if (RATE_LIMITED_TOOL_CODES.has(code)) return HTTP_TOO_MANY_REQUESTS;
	if (code === UNCLASSIFIED_TOOL_ERROR_CODE) return HTTP_INTERNAL_SERVER_ERROR;
	return HTTP_BAD_REQUEST;
}

/** Runs a dispatched tool call, turning a thrown error into a `ToolErrorPayload` response instead of letting it reach `server.ts`'s generic 500 catch-all. */
async function dispatchTool(run: () => Promise<unknown>): Promise<IpcResponse> {
	try {
		const output = await run();
		return { status: HTTP_OK, body: output };
	} catch (err) {
		const payload = toTelegramErrorPayload(err, toolErrorCodeOf(err));
		return { status: toolErrorHttpStatus(payload.code), body: payload };
	}
}

// ---------------------------------------------------------------------------
// Authentication (shared by DELETE /session and every /tools/* route)
// ---------------------------------------------------------------------------

type AuthResult =
	| { readonly ok: true; readonly bearer: string; readonly session: FrozenSessionRecord }
	| { readonly ok: false; readonly response: IpcResponse };

/** The bare 401 gate: a valid, currently-live bearer, resolved back to its frozen session record. No freeze/drift check — see {@link authenticateSessionForTool} for that. */
function authenticateBearer(deps: RoutesDeps, sessions: Map<string, FrozenSessionRecord>, request: IpcRequest): AuthResult {
	const bearer = extractBearer(request.headers);
	if (bearer === undefined || !deps.sessionStore.validate(bearer)) {
		return {
			ok: false,
			response: { status: HTTP_UNAUTHORIZED, body: ipcError(SESSION_UNAUTHORIZED, "missing, unrecognized, or previous-boot bearer") },
		};
	}
	const session = sessions.get(bearer);
	if (session === undefined) {
		// Defensive only: SessionStore and this module's own frozen-state map are mutated together on
		// every mint and every revoke (POST /session, DELETE /session), so this cannot happen under
		// correct operation. Treated as unauthenticated rather than thrown, since a caller cannot fix it.
		return {
			ok: false,
			response: { status: HTTP_UNAUTHORIZED, body: ipcError(SESSION_UNAUTHORIZED, "no frozen session state for this bearer") },
		};
	}
	return { ok: true, bearer, session };
}

type ToolAuthResult =
	| { readonly ok: true; readonly session: FrozenSessionRecord; readonly managed: ManagedBinding }
	| { readonly ok: false; readonly response: IpcResponse };

/** The full `/tools/*` gate: {@link authenticateBearer} plus the per-call freeze/drift check (design §10 "Freeze"). */
function authenticateSessionForTool(
	deps: RoutesDeps,
	sessions: Map<string, FrozenSessionRecord>,
	request: IpcRequest,
	now: () => Date,
): ToolAuthResult {
	const auth = authenticateBearer(deps, sessions, request);
	if (!auth.ok) {
		return auth;
	}

	const managed = deps.bindings.getBinding(auth.session.project_id);
	if (managed === undefined || !sameFrozenBinding(frozenSnapshotOf(managed.binding), auth.session.frozen)) {
		appendAuditRow(deps.db, {
			ts: now().toISOString(),
			project_id: auth.session.project_id,
			bot_id: auth.session.frozen.bot_id,
			chat_id: auth.session.frozen.group_id,
			client_id: auth.session.client_id,
			direction: "system",
			eid: null,
			envelope_type: null,
			from_user_id: null,
			to_user_id: null,
			outcome: "ok",
			reason: "BINDING_CHANGED",
		});
		return {
			ok: false,
			response: {
				status: HTTP_CONFLICT,
				body: ipcError(BINDING_CHANGED, "the live binding no longer matches this session's frozen snapshot; start a new session"),
			},
		};
	}

	return { ok: true, session: auth.session, managed };
}

// ---------------------------------------------------------------------------
// POST /session
// ---------------------------------------------------------------------------

function createOpenSessionHandler(
	deps: RoutesDeps,
	sessions: Map<string, FrozenSessionRecord>,
	now: () => Date,
	generateId: () => string,
): IpcHandler {
	return (request: IpcRequest): IpcResponse => {
		const parseResult = sessionRequestSchema.safeParse(request.body);
		if (!parseResult.success) {
			return { status: HTTP_BAD_REQUEST, body: ipcTransportError(IPC_BAD_REQUEST, "invalid POST /session body") };
		}
		const parsed = parseResult.data;

		const managed = deps.bindings.getBinding(parsed.project_id);
		if (managed === undefined) {
			return {
				status: HTTP_NOT_FOUND,
				body: ipcError(UNBOUND_PROJECT, `no active binding for project "${parsed.project_id}"`),
			};
		}

		if (managed.binding.group_id !== parsed.group_id) {
			return {
				status: HTTP_CONFLICT,
				body: ipcError(BINDING_MISMATCH, "the project file's group_id disagrees with the resolved binding's group_id (registry invariant R4)"),
			};
		}

		if (!deps.handshakeStore.consume(parsed.server_nonce)) {
			return {
				status: HTTP_UNAUTHORIZED,
				body: ipcError(HANDSHAKE_NONCE_INVALID, "unknown, expired, or already-consumed handshake nonce"),
			};
		}

		const bearer = deps.sessionStore.mint(parsed.server_nonce, parsed.hmac);
		if (bearer === undefined) {
			return {
				status: HTTP_UNAUTHORIZED,
				body: ipcError(SESSION_MINT_REFUSED, "the session hmac did not verify, or the daemon is at its active-session capacity"),
			};
		}

		const conditions: string[] = [];
		if (managed.binding.roster_hash !== parsed.roster_hash) {
			conditions.push(ROSTER_DRIFT_CONDITION);
		}

		const clientId = generateId();
		sessions.set(bearer, {
			project_id: parsed.project_id,
			client_id: clientId,
			host: parsed.host,
			pid: parsed.pid,
			started_at: now().toISOString(),
			frozen: frozenSnapshotOf(managed.binding),
		});

		const response: SessionResponse = {
			client_id: clientId,
			bearer,
			binding: {
				project_id: managed.binding.project_id,
				bot_id: managed.binding.bot_id,
				group_id: managed.binding.group_id,
				agent_id: managed.binding.agent_id,
				roster_hash: managed.binding.roster_hash,
			},
			conditions,
		};
		return { status: HTTP_OK, body: response };
	};
}

// ---------------------------------------------------------------------------
// DELETE /session
// ---------------------------------------------------------------------------

/** No freeze/drift check on close — a client tearing a session down is not asking to keep operating against it; see the module doc's decision-6 disclosure in the caller's report for the alternative considered. */
function createCloseSessionHandler(deps: RoutesDeps, sessions: Map<string, FrozenSessionRecord>): IpcHandler {
	return (request: IpcRequest): IpcResponse => {
		const auth = authenticateBearer(deps, sessions, request);
		if (!auth.ok) {
			return auth.response;
		}
		deps.sessionStore.revoke(auth.bearer);
		sessions.delete(auth.bearer);
		return { status: HTTP_OK, body: { closed: true } };
	};
}

// ---------------------------------------------------------------------------
// POST /tools/send
// ---------------------------------------------------------------------------

function createSendHandler(
	deps: RoutesDeps,
	sessions: Map<string, FrozenSessionRecord>,
	mutex: BindingMutex,
	rateBudget: SendRateBudget,
	now: () => Date,
): IpcHandler {
	return async (request: IpcRequest): Promise<IpcResponse> => {
		const auth = authenticateSessionForTool(deps, sessions, request, now);
		if (!auth.ok) {
			return auth.response;
		}

		const parsedInput = sendInputSchema.safeParse(request.body);
		if (!parsedInput.success) {
			return { status: HTTP_BAD_REQUEST, body: ipcTransportError(IPC_BAD_REQUEST, "invalid POST /tools/send body") };
		}

		const { transport, roomGuard } = auth.managed;
		if (transport === undefined || roomGuard === undefined) {
			// Never expected once bootstrap.ts wires a real transport per active binding (a later PR's
			// job); defensive only, so a misconfigured daemon answers a clean 500 instead of throwing
			// past this handler.
			return { status: HTTP_INTERNAL_SERVER_ERROR, body: ipcError(UNCLASSIFIED_TOOL_ERROR_CODE, "this binding has no transport wired") };
		}

		const sendDeps: SendPathDeps = {
			db: deps.db,
			project_id: auth.session.project_id,
			bot_id: auth.managed.binding.bot_id,
			config: auth.managed.config,
			transport,
			roomGuard,
			mutex,
			rateBudget,
			now,
			// Deliberately NOT this module's own generateId: that one defaults to crypto.randomUUID()
			// for client_id (unconstrained shape, decision 10), while sendPath's eid/thread MUST be
			// EID_PATTERN/THREAD_PATTERN-shaped (12 lowercase hex characters, validate.ts's own
			// defaultGenerateId) — sharing one generator between the two broke that shape. Omitted here
			// so sendPath applies its own correctly-shaped default.
		};

		return dispatchTool(() => sendPath(parsedInput.data, sendDeps));
	};
}

// ---------------------------------------------------------------------------
// POST /tools/fetch
// ---------------------------------------------------------------------------

function createFetchHandler(deps: RoutesDeps, sessions: Map<string, FrozenSessionRecord>, now: () => Date): IpcHandler {
	return async (request: IpcRequest): Promise<IpcResponse> => {
		const auth = authenticateSessionForTool(deps, sessions, request, now);
		if (!auth.ok) {
			return auth.response;
		}

		const parsedInput = fetchInputSchema.safeParse(request.body);
		if (!parsedInput.success) {
			return { status: HTTP_BAD_REQUEST, body: ipcTransportError(IPC_BAD_REQUEST, "invalid POST /tools/fetch body") };
		}

		const fetchDeps: ServeFetchDeps = {
			db: deps.db,
			binding: {
				project_id: auth.session.project_id,
				bot_id: auth.managed.binding.bot_id,
				agent_id: auth.managed.binding.agent_id,
				roster_snapshot: auth.managed.binding.roster_snapshot,
				reminder_window_hours: auth.managed.config.reminder_window_hours,
			},
			session: {
				client_id: auth.session.client_id,
				host: auth.session.host,
				pid: auth.session.pid,
				started_at: auth.session.started_at,
			},
			emitter: deps.emitter,
			now,
			delay: deps.delay,
		};

		return dispatchTool(() => serveFetch(parsedInput.data, fetchDeps));
	};
}

// ---------------------------------------------------------------------------
// POST /tools/status
// ---------------------------------------------------------------------------

function createStatusHandler(deps: RoutesDeps, sessions: Map<string, FrozenSessionRecord>, now: () => Date): IpcHandler {
	return async (request: IpcRequest): Promise<IpcResponse> => {
		const auth = authenticateSessionForTool(deps, sessions, request, now);
		if (!auth.ok) {
			return auth.response;
		}

		const parsedInput = statusInputSchema.safeParse(request.body);
		if (!parsedInput.success) {
			return { status: HTTP_BAD_REQUEST, body: ipcTransportError(IPC_BAD_REQUEST, "invalid POST /tools/status body") };
		}

		const statusDeps: ServeStatusDeps = {
			db: deps.db,
			binding: {
				project_id: auth.session.project_id,
				bot_id: auth.managed.binding.bot_id,
				group_id: auth.managed.binding.group_id,
				agent_id: auth.managed.binding.agent_id,
				bot_username: auth.managed.config.bot_username,
				roster_snapshot: auth.managed.binding.roster_snapshot,
				roster_hash: auth.managed.binding.roster_hash,
				reminder_window_hours: auth.managed.config.reminder_window_hours,
			},
			session: { client_id: auth.session.client_id },
			daemon: deps.daemon,
			now,
		};

		return dispatchTool(() => serveStatus(parsedInput.data, statusDeps));
	};
}

// ---------------------------------------------------------------------------
// POST /tools/thread
// ---------------------------------------------------------------------------

function createThreadHandler(deps: RoutesDeps, sessions: Map<string, FrozenSessionRecord>, now: () => Date): IpcHandler {
	return async (request: IpcRequest): Promise<IpcResponse> => {
		const auth = authenticateSessionForTool(deps, sessions, request, now);
		if (!auth.ok) {
			return auth.response;
		}

		const parsedInput = threadInputSchema.safeParse(request.body);
		if (!parsedInput.success) {
			return { status: HTTP_BAD_REQUEST, body: ipcTransportError(IPC_BAD_REQUEST, "invalid POST /tools/thread body") };
		}

		const threadDeps: ServeThreadDeps = {
			db: deps.db,
			binding: {
				project_id: auth.session.project_id,
				agent_id: auth.managed.binding.agent_id,
				roster_snapshot: auth.managed.binding.roster_snapshot,
			},
			now,
		};

		return dispatchTool(() => serveThread(parsedInput.data, threadDeps));
	};
}

// ---------------------------------------------------------------------------
// Factory (decision 9)
// ---------------------------------------------------------------------------

/**
 * Builds all six session/tool routes at once, closing over one shared frozen-session map and the two
 * daemon-lifetime singletons `POST /tools/send` needs (decision 8 — this is the first PR to actually
 * construct either): preferred over six separate per-route factories threading a shared mutable map
 * between them.
 */
export function createSessionRoutes(deps: RoutesDeps): Partial<Record<IpcRouteKey, IpcHandler>> {
	const sessions = new Map<string, FrozenSessionRecord>();
	const mutex = new BindingMutex();
	const rateBudget = new SendRateBudget();
	const now = deps.now ?? ((): Date => new Date());
	const generateId = deps.generateId ?? randomUUID;

	return {
		"POST /session": createOpenSessionHandler(deps, sessions, now, generateId),
		"DELETE /session": createCloseSessionHandler(deps, sessions),
		"POST /tools/send": createSendHandler(deps, sessions, mutex, rateBudget, now),
		"POST /tools/fetch": createFetchHandler(deps, sessions, now),
		"POST /tools/status": createStatusHandler(deps, sessions, now),
		"POST /tools/thread": createThreadHandler(deps, sessions, now),
	};
}
