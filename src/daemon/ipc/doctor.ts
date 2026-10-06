/**
 * The daemon's `POST /doctor` route (`daemon/ipc/doctor.ts`, design §9.2 D-44, spec `doctor` "Online
 * tier runs inside the daemon and checks live Telegram state", PT-32, B-28). New code: design §12
 * lists no v1 range for this module — v1's doctor made every check in-process against the live token,
 * with no local daemon and no HTTP surface at all — so this file carries no vendoring header and adds
 * no row to `test/fixtures/v1-provenance.json`.
 *
 * A **new** route in `IPC_ROUTES` (already added to `shared/ipc-contract.ts` by PR-16, alongside
 * `doctorRequestSchema`/`doctorResponseSchema`). `daemon/ipc/routes.ts` is deliberately not edited
 * (D-44): this handler is built and exported so a later PR (`daemon/bootstrap.ts`, PR-18) can wire it
 * into `createIpcServer`'s `handlers` map without touching `routes.ts` at all.
 *
 * **Correction to this PR's own brief: `DOCTOR_PROOF_LABEL` is reimplemented locally, not imported
 * from `installer/constants.ts`.** The brief named `installer/constants.ts:84`'s export as the one to
 * reuse, but `src/daemon/tsconfig.json`'s `references` is `shared`/`secret-store`/`ledger`/`registry`
 * only — there is no TypeScript project-reference path from `daemon/*` to `installer/*` (confirmed:
 * `design.md` §2.2's compile-unit table lists `installer` as referencing `daemon`, never the reverse,
 * and no file anywhere under `src/daemon/**` imports from `installer/*` today). Importing it here would
 * be a `tsc -b` build error, not a style choice. This mirrors the identical, already-disclosed pattern
 * `daemon/ipc/handshake.ts` (`IDENTITY_PROOF_LABEL`) and `daemon/ipc/sessions.ts` (`SESSION_PROOF_LABEL`)
 * already use for the same reason within this very module family: each proof label is a private literal
 * owned by the module that computes it, not a shared import.
 *
 * **Auth runs before registry resolution — the opposite order from `POST /session`.** `routes.ts`'s own
 * module doc checks the registry BEFORE consuming the nonce/minting a bearer, to avoid burning a
 * single-use nonce or an orphaned `MAX_ACTIVE_SESSIONS` slot on a request refused anyway for registry
 * reasons. This route mints no bearer at all (D-44), so the orphaned-slot argument does not apply, and
 * checking auth first avoids answering an unauthenticated caller's "is project X bound?" question for
 * free. Nonce consumption still precedes the hmac check (an unverified hmac still burns the nonce),
 * mirroring `routes.ts`'s own `POST /session` ordering between those two steps specifically.
 *
 * **Room-guard enforcement inside `managed.transport.send()` is transparent, confirmed by reading
 * `daemon/bindings.ts` and `daemon/transport/{group,direct,dual,room-guard}.ts` in full.**
 * `BindingsReconciler.buildTransport` (`daemon/bindings.ts:150-181`) constructs exactly one
 * `RoomGuardClient` per binding and passes THAT SAME object — not the raw client — as the `client`
 * constructor argument to both `GroupTransport` and `DirectTransport` (`daemon/bindings.ts:167,171,176`).
 * `RoomGuardClient.sendMessage` (`daemon/transport/room-guard.ts:101-104`) calls
 * `this.assertTarget(params.chat_id)` before ever delegating to the wrapped client, for both the numeric
 * group `chat_id` (`GroupTransport.send`, `daemon/transport/group.ts:78`) and every `@username` DM
 * target (`DirectTransport.send`, `daemon/transport/direct.ts:55`). So a call to
 * `managed.transport.send(...)` — `DualWriteTransport.send`, `daemon/transport/dual.ts:36-68` — cannot
 * reach `sendMessage` for any chat outside the binding's own group or roster without a `WrongRoomError`
 * first; this handler adds no separate `roomGuard.assertTarget` pre-check, exactly as the brief
 * anticipated finding.
 *
 * **Correction, found during Kairo's own review (not the implementing subagent's draft): the DM probe
 * calls `managed.roomGuard.sendMessage(...)` directly, once per recipient — it never calls
 * `managed.transport.send(...)`.** Two independent problems with the transport-based draft, both
 * confirmed by reading source:
 *
 * 1. **A real bug.** `DirectTransport`'s roster map is keyed by `agent_id`
 *    (`daemon/bindings.ts:172-175`: `directRoster[entry.agent_id] = entry`), and `DirectTransport.send`
 *    resolves its `to` parameter against THAT map (`daemon/transport/direct.ts`: `this.roster[to]`) —
 *    the `@<username>` transformation happens INSIDE `DirectTransport.send`, after the lookup, never
 *    before it (confirmed against the real `send` tool's own call site, `daemon/send/send-path.ts:369`,
 *    which passes the tool input's own `agent_id`-shaped recipients unchanged). A recipient list built
 *    as `@<username>` strings — what the earlier draft passed to `Transport.send` — can never match that
 *    map: every DM would fail with `UnknownRecipientError`, always.
 * 2. **A design mismatch.** `Transport` exposes exactly one method, `send`, and `DualWriteTransport.send`
 *    (the only real implementation `managed.transport` is in production) always posts to the group FIRST,
 *    unconditionally, before any DM fan-out (`daemon/transport/dual.ts:36-37`) — there is no DM-only path
 *    through that interface at all. A literal `managed.transport.send(...)` call for a "DM probe" would
 *    therefore also post a visible message into the real, human-facing group on every single
 *    `--dm-probe` run, which the term "probe" does not suggest and which repeated diagnostic runs would
 *    turn into ongoing group noise.
 *
 * The fix resolves both at once by going one layer lower, to the same `RoomGuardClient` instance
 * `ManagedBinding.roomGuard` already exposes (Alpha-audited, Arena debate
 * `bus-v2-f2-pr-17-dm-probe-design-001`, `CONSENSUS`): `roomGuard.sendMessage({chat_id: '@'+username,
 * text})`, built exactly the way `DirectTransport.send` itself builds it internally, once per roster
 * peer. Both guarantees design §9.2 names survive: `RoomGuardClient.sendMessage` calls
 * `assertTarget(chat_id)` before delegating (`daemon/transport/room-guard.ts:101-104`) — the
 * cross-project boundary check is unchanged; and `roomGuard`'s own wrapped client IS the
 * `RateLimitRecorder`-decorated client (`daemon/bindings.ts:164-170`: `RateLimitRecorder` wraps the raw
 * client, `RoomGuardClient` wraps THAT) — rate discipline is unchanged. No group post; a corrected
 * recipient format; the same audit row.
 *
 * **Recipients** are every `roster_snapshot` entry except the one whose `user_id` equals the binding's
 * own `bot_id` (that entry is the bound bot's own roster identity, never a DM peer of itself).
 *
 * **PT-32 vs B-28 severity: both fail, not split into warn.** design §9.2's own sentence is explicit —
 * "fail on `administrator`/`creator` (PT-32) or `left`/`kicked` (B-28 membership)" — and
 * `specs/doctor/spec.md`'s requirement text ("every roster bot is a member of the bound group and is
 * not an administrator or creator") independently implies the same for `left`/`kicked`: failing to be a
 * member at all is a stronger violation than holding elevated status, not a lesser one. All four
 * statuses are therefore `fail`; only `member`/`restricted` (still a member, per Telegram's own model)
 * pass.
 *
 * **Online-check scope matches design §9.2's shorter list, not `specs/doctor/spec.md`'s broader
 * five-item prose.** The spec's requirement text also names "my `agent_id` is present in the roster
 * with my `bot_id`" and "`bot_id` is unique across bindings" — both are static registry-consistency
 * checks with no network call, already the offline/registry tier's job (`doctor/checks/registry.ts`'s
 * R1-R6 walk and PR-09a's referential-integrity check), not this route's. This route implements exactly
 * design §9.2's three network checks: `getMe`, `getChat`, `getChatMember` per roster entry.
 *
 * **Every check is independently fail-safe (mirrors `doctor/checks/{system,registry}.ts`'s own
 * discipline, PR-14/15's B-79/B-83 lesson: an unguarded read must never abort the whole response).** A
 * thrown error from `doctorClientFor`, `getMe`, `getChat` or `getChatMember` becomes one `fail` finding
 * for that check, never an uncaught rejection.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { appendAuditRow } from "../../ledger/audit.js";
import type { RegistryBinding } from "../../registry/schema.js";
import { redactTokenShapes } from "../../secret-store/redaction.js";
import type { ProjectRosterEntry } from "../../shared/project-file.js";
import { MAX_ACTIVE_SESSIONS } from "../../shared/constants.js";
import {
	doctorRequestSchema,
	HTTP_BAD_REQUEST,
	HTTP_NOT_FOUND,
	HTTP_OK,
	HTTP_UNAUTHORIZED,
	IPC_BAD_REQUEST,
	ipcTransportError,
	type DoctorResponse,
	type IpcErrorPayload,
} from "../../shared/ipc-contract.js";
import type { ManagedBinding } from "../bindings.js";
import type { TelegramChat, TelegramChatMember, TelegramUser } from "../telegram.js";
import type { PendingHandshakeStore } from "./handshake.js";
import type { IpcHandler, IpcRequest, IpcResponse } from "./server.js";
import type { SessionStore } from "./sessions.js";

/** D-14's domain-separation label for the doctor proof — see the module doc's correction to this PR's brief. */
const DOCTOR_PROOF_LABEL = "doctor:";

/**
 * `HMAC-SHA256(secret, "doctor:" + serverNonce)`, lowercase hex — what a legitimate `POST /doctor`
 * caller must present as `hmac` (design §9.2 D-14). Pure: no I/O, no clock.
 */
export function computeDoctorProof(secret: string, serverNonce: string): string {
	return createHmac("sha256", secret).update(`${DOCTOR_PROOF_LABEL}${serverNonce}`).digest("hex");
}

/** Constant-time equality of two lowercase-hex digests (mirrors `sessions.ts`'s identical helper). A length mismatch is `false` without calling `timingSafeEqual`, which throws on unequal-length buffers. */
function hexDigestsEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "hex");
	const bufB = Buffer.from(b, "hex");
	return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** `POST /doctor` refused: `PendingHandshakeStore.consume(server_nonce)` found no matching, unexpired, unconsumed nonce. */
export const DOCTOR_NONCE_INVALID = "DOCTOR_NONCE_INVALID";

/** `POST /doctor` refused: the nonce consumed, but the claimed `hmac` did not verify against `computeDoctorProof`. */
export const DOCTOR_PROOF_INVALID = "DOCTOR_PROOF_INVALID";

/** `POST /doctor` refused: `project_id` was given but names no active binding. */
export const DOCTOR_UNBOUND_PROJECT = "DOCTOR_UNBOUND_PROJECT";

function doctorError(code: string, message: string): IpcErrorPayload {
	return { code, message, retryable: false };
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * The two `BindingsReconciler` accessors this route needs, narrowed to an interface (mirrors
 * `routes.ts`'s own `BindingResolver`) so a test can inject a lightweight fake instead of constructing
 * a real reconciler. Named distinctly from `routes.ts`'s `BindingResolver` since a later PR
 * (`bootstrap.ts`) may pass the same reconciler instance to both routes.
 */
export interface DoctorBindingsAccessor {
	getBinding(projectId: string): ManagedBinding | undefined;
	getActiveBindings(): readonly ManagedBinding[];
}

/**
 * The minimal Telegram surface this route needs. Narrower than `daemon/telegram.ts`'s `TelegramClient`
 * interface — which does not include `getChatMember` at all (D-48: added to the `TelegramApiClient`
 * CLASS only, so the room guard and rate recorder stay untouched) — and narrower than
 * `TelegramApiClient` itself, so a test fake needs to implement only these three methods.
 */
export interface DoctorTelegramClient {
	getMe(): Promise<TelegramUser>;
	getChat(chatId: number | string): Promise<TelegramChat>;
	getChatMember(chatId: number | string, userId: number): Promise<TelegramChatMember>;
}

export interface DoctorHandlerDeps {
	/** This boot's run secret (`writeRunFile`'s `secret`) — signs the doctor proof and nothing else. */
	readonly secret: string;
	readonly store: PendingHandshakeStore;
	readonly bindings: DoctorBindingsAccessor;
	/** Resolves the bot's token from the secret store and returns a `TelegramApiClient` — wired in `bootstrap.ts` (PR-18, D-48). */
	readonly doctorClientFor: (botId: number) => Promise<DoctorTelegramClient> | DoctorTelegramClient;
	readonly db: DatabaseSync;
	readonly now?: () => Date;
	/** Injected session store for checking active session pool occupancy (B-106 remainder). */
	readonly sessionStore?: SessionStore;
	/** Optional sweep function to reclaim dead-PID slots before measuring occupancy. */
	readonly sweepSessions?: () => number;
}

// ---------------------------------------------------------------------------
// One finding
// ---------------------------------------------------------------------------

interface DoctorCheckFinding {
	readonly id: string;
	readonly status: "pass" | "warn" | "fail";
	readonly detail: string;
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Online checks (design §9.2)
// ---------------------------------------------------------------------------

/** The chat type `getChat` must report for a `pass` (design §9.2: "warn when `type !== "supergroup"`"). */
const EXPECTED_GROUP_CHAT_TYPE = "supergroup";

/** PT-32 (`administrator`/`creator`) and B-28's membership half (`left`/`kicked`) — see the module doc's severity disclosure. */
const NON_MEMBER_CHAT_MEMBER_STATUSES: ReadonlySet<TelegramChatMember["status"]> = new Set([
	"administrator",
	"creator",
	"left",
	"kicked",
]);

async function checkBotIdentity(client: DoctorTelegramClient, expectedBotId: number): Promise<DoctorCheckFinding> {
	try {
		const me = await client.getMe();
		if (me.id !== expectedBotId) {
			return { id: "bot-identity", status: "fail", detail: `getMe() returned bot_id ${me.id}, expected ${expectedBotId}` };
		}
		return { id: "bot-identity", status: "pass", detail: `getMe() confirms bot_id ${expectedBotId}` };
	} catch (err) {
		return { id: "bot-identity", status: "fail", detail: `getMe() failed: ${describeError(err)}` };
	}
}

async function checkGroupReachable(client: DoctorTelegramClient, groupId: number): Promise<DoctorCheckFinding> {
	try {
		const chat = await client.getChat(groupId);
		if (chat.type !== EXPECTED_GROUP_CHAT_TYPE) {
			return {
				id: "group-reachable",
				status: "warn",
				detail: `getChat(${groupId}) is reachable but its type is "${chat.type}", not "${EXPECTED_GROUP_CHAT_TYPE}"`,
			};
		}
		return { id: "group-reachable", status: "pass", detail: `getChat(${groupId}) is reachable and is a ${EXPECTED_GROUP_CHAT_TYPE}` };
	} catch (err) {
		return { id: "group-reachable", status: "fail", detail: `getChat(${groupId}) failed: ${describeError(err)}` };
	}
}

async function checkRosterMembership(
	client: DoctorTelegramClient,
	groupId: number,
	entry: ProjectRosterEntry,
): Promise<DoctorCheckFinding> {
	const id = `roster-membership-${entry.agent_id}`;
	try {
		const member = await client.getChatMember(groupId, entry.user_id);
		if (NON_MEMBER_CHAT_MEMBER_STATUSES.has(member.status)) {
			return { id, status: "fail", detail: `${entry.agent_id}'s getChatMember status is "${member.status}"` };
		}
		return { id, status: "pass", detail: `${entry.agent_id} is a plain member of the bound group` };
	} catch (err) {
		return { id, status: "fail", detail: `getChatMember for ${entry.agent_id} failed: ${describeError(err)}` };
	}
}

/**
 * Evaluates the daemon's active session pool occupancy against {@link MAX_ACTIVE_SESSIONS} (B-106 remainder).
 * Reports `pass` when occupancy is healthy (<80%), `warn` when near capacity (>=80%), and `fail`
 * when at or exceeding capacity.
 */
function checkSessionPool(store: SessionStore): DoctorCheckFinding {
	const active = store.size;
	const max = MAX_ACTIVE_SESSIONS;
	if (active >= max) {
		return {
			id: "session-pool",
			status: "fail",
			detail: `${active}/${max} active sessions (pool exhausted)`,
		};
	}
	if (active >= Math.floor(max * 0.8)) {
		return {
			id: "session-pool",
			status: "warn",
			detail: `${active}/${max} active sessions (pool near capacity)`,
		};
	}
	return {
		id: "session-pool",
		status: "pass",
		detail: `${active}/${max} active sessions`,
	};
}

async function runOnlineChecksFor(managed: ManagedBinding, deps: DoctorHandlerDeps): Promise<DoctorCheckFinding[]> {
	let client: DoctorTelegramClient;
	try {
		client = await deps.doctorClientFor(managed.binding.bot_id);
	} catch (err) {
		return [
			{
				id: "telegram-client",
				status: "fail",
				detail: `could not resolve a Telegram client for bot_id ${managed.binding.bot_id}: ${describeError(err)}`,
			},
		];
	}

	const findings: DoctorCheckFinding[] = [
		await checkBotIdentity(client, managed.binding.bot_id),
		await checkGroupReachable(client, managed.binding.group_id),
	];
	for (const entry of managed.binding.roster_snapshot) {
		findings.push(await checkRosterMembership(client, managed.binding.group_id, entry));
	}
	if (deps.sessionStore !== undefined) {
		findings.push(checkSessionPool(deps.sessionStore));
	}
	return findings;
}

// ---------------------------------------------------------------------------
// DM probe (design §9.2)
// ---------------------------------------------------------------------------

/** A fixed, self-identifying probe message — never real conversational content (design §9.2's "DM probe"). */
const DOCTOR_PROBE_MESSAGE_TEXT = "conmuta doctor: connectivity probe — no reply needed.";

/** `audit_log.reason` for the DM probe's one row (a free-string column, no CHECK constraint — see `ledger/audit.ts`). */
const DOCTOR_PROBE_AUDIT_REASON = "DOCTOR_PROBE";

/** Every roster peer except the binding's own bot identity — never a DM target of itself. See the module doc's "Recipients" paragraph. */
function dmProbePeers(binding: RegistryBinding): ProjectRosterEntry[] {
	return binding.roster_snapshot.filter((entry) => entry.user_id !== binding.bot_id);
}

async function runDmProbe(managed: ManagedBinding, deps: DoctorHandlerDeps, now: () => Date): Promise<DoctorCheckFinding> {
	const id = "dm-probe";
	if (managed.roomGuard === undefined) {
		// Never expected once bootstrap.ts wires a real roomGuard per active binding (PR-18, D-48);
		// defensive only, mirroring routes.ts's own createSendHandler guard for the identical case.
		return { id, status: "fail", detail: "this binding has no room guard wired" };
	}
	const roomGuard = managed.roomGuard;

	const peers = dmProbePeers(managed.binding);
	if (peers.length === 0) {
		// Nothing to probe: a binding whose roster holds no peer besides its own bot is legitimate, but "pass"
		// would claim connectivity that was never tested and an `ok` audit row would record a send that never
		// happened. Warn, and follow the unwired-room-guard branch's own rule: no attempted send, no row.
		return { id, status: "warn", detail: "no roster peer besides this bot; nothing was probed" };
	}
	const ts = now().toISOString();
	const auditBase = {
		ts,
		project_id: managed.binding.project_id,
		bot_id: managed.binding.bot_id,
		chat_id: managed.binding.group_id,
		client_id: null,
		direction: "send" as const,
		eid: null,
		envelope_type: null,
		from_user_id: null,
		to_user_id: null,
		reason: DOCTOR_PROBE_AUDIT_REASON,
	};

	let delivered = 0;
	const failures: string[] = [];
	for (const peer of peers) {
		try {
			await roomGuard.sendMessage({ chat_id: `@${peer.username}`, text: DOCTOR_PROBE_MESSAGE_TEXT });
			delivered += 1;
		} catch (err) {
			failures.push(`${peer.agent_id}: ${describeError(err)}`);
		}
	}

	const outcome = failures.length === 0 ? "ok" : delivered > 0 ? "degraded" : "rejected";
	appendAuditRow(deps.db, { ...auditBase, outcome });
	if (outcome === "rejected") {
		return { id, status: "fail", detail: `probe failed for all ${peers.length} roster peer(s): ${failures.join("; ")}` };
	}
	if (outcome === "degraded") {
		// The audit row already says "degraded"; the finding an operator reads has to agree with it, or a
		// partially reachable roster reads as healthy (B-85 (1)).
		return { id, status: "warn", detail: `probe delivered to ${delivered}/${peers.length} roster peer(s) (failed: ${failures.join("; ")})` };
	}
	return { id, status: "pass", detail: `probe delivered to ${delivered}/${peers.length} roster peer(s)` };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Builds the `POST /doctor` {@link IpcHandler} (design §9.2 D-44). See the module doc for the auth
 * ordering, the room-guard finding, the DM-probe scoping and the PT-32/B-28 severity disclosure.
 */
export function createDoctorHandler(deps: DoctorHandlerDeps): IpcHandler {
	return async (request: IpcRequest): Promise<IpcResponse> => {
		const parsed = doctorRequestSchema.safeParse(request.body);
		if (!parsed.success) {
			return { status: HTTP_BAD_REQUEST, body: ipcTransportError(IPC_BAD_REQUEST, "invalid POST /doctor body") };
		}
		const { server_nonce, hmac, project_id, dm_probe } = parsed.data;

		if (!deps.store.consume(server_nonce)) {
			return {
				status: HTTP_UNAUTHORIZED,
				body: doctorError(DOCTOR_NONCE_INVALID, "unknown, expired, or already-consumed handshake nonce"),
			};
		}

		const expectedProof = computeDoctorProof(deps.secret, server_nonce);
		if (!hexDigestsEqual(expectedProof, hmac)) {
			return { status: HTTP_UNAUTHORIZED, body: doctorError(DOCTOR_PROOF_INVALID, "the doctor hmac did not verify") };
		}

		let targets: ManagedBinding[];
		if (project_id !== undefined) {
			const managed = deps.bindings.getBinding(project_id);
			if (managed === undefined) {
				return {
					status: HTTP_NOT_FOUND,
					body: doctorError(DOCTOR_UNBOUND_PROJECT, `no active binding for project "${project_id}"`),
				};
			}
			targets = [managed];
		} else {
			targets = [...deps.bindings.getActiveBindings()];
		}

		const now = deps.now ?? ((): Date => new Date());
		deps.sweepSessions?.();
		const bindings: DoctorResponse["bindings"] = [];
		for (const managed of targets) {
			const findings = await runOnlineChecksFor(managed, deps);
			if (dm_probe) {
				findings.push(await runDmProbe(managed, deps, now));
			}
			bindings.push({
				project_id: managed.binding.project_id,
				checks: findings.map((finding) => ({ ...finding, detail: redactTokenShapes(finding.detail) })),
			});
		}

		return { status: HTTP_OK, body: { bindings } satisfies DoctorResponse };
	};
}
