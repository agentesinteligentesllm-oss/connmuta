/**
 * Provenance: telegram-agent-bus src/tools/send.ts:380-660 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 25926e38a82e8c12138015a9cdaac7320a9098e4b5726f5d868b8aae1fbb804b
 *   (SHA-256 of lines 380-660 of the frozen v1 file, LF-normalized with the terminating newline —
 *    the line-range rule `bus-v2-f1-pr-04-001` ratified. Reproduce with `node -e "…"` over the frozen
 *    checkout; the registry `test/fixtures/v1-provenance.json` lists the entry but carries no hash.)
 * Changes: (1) v1's bridge lock (`acquireBridgeLock`, `BRIDGE_BUSY`) is replaced by `BindingMutex`, a
 * promise chain per `project_id` (design §9); (2) `loadState`/`saveState` become one ledger
 * transaction (`withTransaction`) run AFTER the network call: thread bookkeeping via `applyEnvelope`
 * over ONE `ThreadRecord | undefined` (the v2 signature) plus `writeThreadRecord`, the `group_outage`
 * condition via `raiseCondition`/`clearCondition` (v1's `withGroupOutage`), and the audit `send` row;
 * (3) the room guard is wired in: a no-network pre-check `roomGuard.assertTarget(...)` on the group
 * chat and on every recipient's `@username` runs BEFORE `transport.send`, because the AS-IS
 * `GroupTransport` turns a guard refusal into a soft group failure and the DMs would still go out —
 * the spec requires `WRONG_ROOM`, an audit row and zero `sendMessage` calls; the decorator stays the
 * last line inside the transport (PT-28); (4) `obligations` removed from the output (design §12's
 * send-path row, change (4)); (5) rate discipline (`send/rate.ts`, PR-28) is wired in: a local
 * pre-check against `offsets.retry_after_until` and `SendRateBudget`'s timestamp-window budget runs
 * after the room pre-check and before `transport.send`, and a 429 surfacing from the call itself —
 * via the `RateLimitRecorder` decorator `bindings.ts` wraps around the raw Telegram client, deep
 * inside the transport stack this module cannot see through — is detected by re-reading
 * `offsets.retry_after_until` around the call and reclassified from `TRANSPORT_ERROR` to
 * `RATE_LIMITED`; (6) validation stages come from `validateSend` and the encoded-length guard from
 * `guardEncodedLength` (PR-26), called once each instead of v1's inline stages; (7) the
 * `unannounced_closures` remedy names `${TOOL_PREFIX}fetch`, not v1's `agentbus_fetch`; (8)
 * `IN_THREAD_TYPES` re-declared locally, as PR-26 did.
 *
 * ---
 *
 * The send path (`daemon/send/send-path.ts`, design §9, PT-01, PT-02, PT-15, PT-25, PT-28; unit 8
 * `send-path`, after PR-26's `validate.ts` and before PR-28's `rate.ts`, which closes the unit).
 *
 * **What runs, in order, all under `deps.mutex.run(deps.project_id, …)`:** `validateSend` (PR-26) →
 * build the envelope and stamp `eid`/`thread`/`to_user_id` → `guardEncodedLength` (PR-26) → the
 * no-network room pre-check (`roomGuard.assertTarget`) on the group chat and every recipient →
 * `transport.send` → one ledger transaction for thread bookkeeping, the `group_outage` condition and
 * the audit `send` row.
 *
 * **No direct Telegram send call anywhere in this file (PT-28).** The one call here that reaches the
 * network is `transport.send`; `roomGuard.assertTarget` is a pure pre-check that makes no call at all.
 * The network call sites stay confined to `transport/{group,direct,room-guard}.ts`, and this module
 * never constructs or holds a `TelegramClient`.
 *
 * **What the decorator inside the transport can and cannot report.** The pre-check and the decorator
 * share one rule set (`assertTarget`), and the transport `bindings.ts` builds targets the same group the
 * guard holds, so after the pre-check passes the decorator has nothing left to refuse. If a transport
 * were built against another group, the decorator would still refuse that post before any call — no
 * message reaches the wrong room — but the AS-IS `GroupTransport` reports it as a soft group failure
 * without the `WrongRoomError` underneath, so the send degrades and raises `group_outage` instead of
 * writing a `WRONG_ROOM` row (a test pins exactly this; backlog B-44). A `WrongRoomError` never
 * propagates out of `transport.send` as itself. The only caller of {@link sendPath}
 * will be PR-31's IPC route.
 *
 * **Rate discipline (PR-28, `send/rate.ts`).** Two independent gates run after the room pre-check and
 * before `transport.send`: the ledger's own `offsets.retry_after_until` (set by
 * `RateLimitRecorder`, which `bindings.ts`'s `buildTransport` wraps around the raw `TelegramClient`
 * whenever a 429 lands on `sendMessage`, group or direct) and, only when that column has nothing to
 * say, `deps.rateBudget`'s in-memory `GROUP_MESSAGES_PER_MINUTE`/`CHAT_MESSAGES_PER_SECOND`
 * timestamp-window budget. A refusal from either gate makes zero network calls, writes one
 * `rejected`/`RATE_LIMITED` audit row, and throws `SendToolError("RATE_LIMITED", …, { retry_after_s })`;
 * a pass consumes the budget immediately, before the call, whether or not the call itself lands — an
 * attempted post spends budget regardless of outcome. A 429 that instead surfaces FROM
 * `transport.send` — `RateLimitRecorder` sits underneath `RoomGuardClient`, deep inside the transport
 * stack this module cannot see through directly — is detected by re-reading
 * `offsets.retry_after_until` around the call and reclassifying the resulting `TRANSPORT_ERROR` into
 * the same `RATE_LIMITED`, `retry_after_s` and all; a delivery that only PARTLY landed is still a
 * success (`degraded`, exactly as today), never promoted into this error, and the recorded column
 * simply gates the next send. `offsets.next_update_id` — the one cursor DATA-MODEL.md defines on this
 * side of the ledger — is never named by any of this: a rate-limited send, local or reclassified,
 * advances nothing (spec "leaves the relevant cursor unmoved").
 *
 * **No audit row on `TRANSPORT_ERROR`.** DATA-MODEL's closed `audit_log.reason` enum has no code for
 * a transport failure; PR-42 task 42.1 aligns the enum. Recording one here would mean inventing a
 * reason the schema does not carry, so this module does not.
 *
 * **`delivery.group.new_chat_id` is informational only (PT-25).** A `GroupMigratedError` on the group
 * post surfaces through `deliveryResult.group` exactly as `GroupTransport` reports it; this module
 * never follows the new id and never mutates `config` or the binding (design §8.2, THREAT-MODEL T15).
 * Design §8.2 also says the new id surfaces in "the audit row"; `audit_log` has no column for it and
 * DATA-MODEL's closed `reason` enum no code, so the row records the send as `degraded` and nothing
 * more — the same enum alignment PR-42 task 42.1 owns.
 */

import type { DatabaseSync } from "node:sqlite";

import { appendAuditRow } from "../../ledger/audit.js";
import { clearCondition, raiseCondition } from "../../ledger/conditions-store.js";
import { withTransaction } from "../../ledger/transaction.js";
import { writeThreadRecord } from "../../ledger/threads.js";
import { TOOL_PREFIX } from "../../shared/constants.js";
import { ABANDON_BASIS_VALUE, renderMessageHtml, type Envelope } from "../../shared/envelope.js";
import { applyEnvelope, type ApplyContext } from "../../shared/protocol-apply.js";
import type { SendToolInput } from "../../shared/tool-schemas.js";
import type { BindingConfig } from "../binding-config.js";
import type { RoomGuardClient } from "../transport/room-guard.js";
import { WrongRoomError } from "../transport/room-guard.js";
import { TransportError, type DualWriteResult, type Transport } from "../transport/types.js";
import {
	defaultGenerateId,
	guardEncodedLength,
	validateSend,
	SendToolError,
	type SendToolOutput,
	type SendValidationDeps,
} from "./validate.js";
import { readRetryAfterUntil, retryAfterSeconds, type SendRateBudget } from "./rate.js";

/**
 * Serialises calls under the same `key`; calls under different keys run concurrently.
 *
 * A promise chain in a `Map`, one entry per key. The stored link **never rejects** — it is always a
 * settled-tracking view of the call it stands for — so a caller whose `fn` rejects never poisons the
 * chain for the next call under that key: that next call still runs, on schedule, once its own turn
 * comes. The map entry is removed once nothing is queued behind the call that just finished, so a key
 * that goes quiet does not grow the map forever (one instance of this class lives for the daemon's
 * whole run, PR-31).
 */
export class BindingMutex {
	private readonly chains = new Map<string, Promise<void>>();

	async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const previousLink = this.chains.get(key);
		const start = previousLink ?? Promise.resolve();

		const runPromise = start.then(fn);
		// A never-rejecting view of this call, stored so the NEXT call under `key` waits for this one
		// to settle — success or failure — without this call's own rejection reaching that later caller.
		const ownLink: Promise<void> = runPromise.then(
			() => undefined,
			() => undefined,
		);
		this.chains.set(key, ownLink);

		try {
			return await runPromise;
		} finally {
			// Drain: only the call whose link is still the one on file for `key` removes the entry — a
			// later call has already replaced it by the time an earlier one's `finally` runs otherwise.
			if (this.chains.get(key) === ownLink) {
				this.chains.delete(key);
			}
		}
	}
}

/** Everything {@link sendPath} reads from the binding, the ledger and the transport stack. */
export interface SendPathDeps {
	readonly db: DatabaseSync;
	readonly project_id: string;
	readonly bot_id: number;
	readonly config: Pick<BindingConfig, "agent_id" | "roster" | "secret_markers" | "chat_id">;
	readonly transport: Transport;
	readonly roomGuard: Pick<RoomGuardClient, "assertTarget">;
	readonly mutex: BindingMutex;
	readonly rateBudget: SendRateBudget;
	readonly now?: () => Date;
	readonly generateId?: () => string;
}

/**
 * Envelope types that do NOT ring four phones (E2, v1 `:454-466` verbatim).
 *
 * Notify on lifecycle boundaries — a task started, a task finished, an announcement — and stay
 * silent in between. `ACK` is routine acknowledgement traffic, and ten turns of it buzzing four
 * phones is precisely what makes people mute the group. Muting costs everything: it does not degrade
 * observability, it deletes it. The humans keep it by being able to OPEN the chat and read, not by
 * the phone vibrating.
 *
 * Suppression of the post itself was considered and rejected — it breaks ADR-04's record of intent.
 * The lever is notification, never suppression.
 */
const SILENT_TYPES: ReadonlySet<string> = new Set(["ACK"]);

/** Types that continue an existing thread rather than opening one (re-declared, as PR-26 did: change (8)). */
const IN_THREAD_TYPES: ReadonlySet<string> = new Set(["REPLY", "ACK", "RESOLVED"]);

/**
 * ACK always gets the bridge-stamped `acknowledged-only`; RESOLVED passes through its
 * (already-validated) caller basis; BROADCAST/REQUEST carry none (v1 `:469-477`).
 */
function stampBasis(input: SendToolInput): Envelope["basis"] {
	if (input.type === "ACK") {
		return "acknowledged-only";
	}
	if (input.type === "RESOLVED") {
		return input.basis;
	}
	return undefined;
}

/**
 * The message id and channel to stamp on a locally-recorded thread (v1 `:380-404`).
 *
 * A reply prefers the DM copy and an opening REQUEST prefers the group copy, but neither channel is
 * guaranteed to have succeeded (D1), so each falls back to the other. At least one always landed:
 * `Transport.send` rejects when nothing was delivered anywhere — the final throw here is the case
 * where a caller supplies a `Transport` whose contract that rejection does not hold for.
 */
function stampFrom(result: DualWriteResult, prefer: "direct" | "group"): { message_id: number; via: "direct" | "group" } {
	const landedDm = result.direct.find((outcome) => outcome.ok && typeof outcome.message_id === "number");
	const dm = landedDm?.message_id !== undefined ? { message_id: landedDm.message_id, via: "direct" as const } : null;
	const group = result.group.ok ? { message_id: result.group.message_id, via: "group" as const } : null;

	const stamp = prefer === "direct" ? (dm ?? group) : (group ?? dm);
	if (stamp === null) {
		throw new SendToolError(
			"TRANSPORT_ERROR",
			"The transport reported a successful send with no delivered message on either plane — nothing can be recorded against it.",
		);
	}
	return stamp;
}

/**
 * Whether `offsets.retry_after_until` CHANGED during a `transport.send` call that just failed, and
 * still names a future instant — the one signal a 429 recorded by `RateLimitRecorder`, deep inside
 * the transport stack, leaves for this module to find (module doc). `before` is read just before the
 * call so a value already in place before this send started is never misattributed to it; `nowMs` is
 * read fresh by the caller rather than reused from earlier in the pipeline, since real time passed
 * during the awaited call.
 */
function rateLimitedDuring(db: DatabaseSync, bot_id: number, before: string | null, nowMs: number): number | undefined {
	const after = readRetryAfterUntil(db, bot_id);
	if (after === null || after === before) {
		return undefined;
	}
	return retryAfterSeconds(after, nowMs);
}

/** Runs the whole pipeline for one send, assuming the binding's mutex is already held. */
async function runSendPath(input: SendToolInput, deps: SendPathDeps): Promise<SendToolOutput> {
	const now = deps.now ?? (() => new Date());
	const generateId = deps.generateId ?? defaultGenerateId;
	const validationDeps: SendValidationDeps = { db: deps.db, project_id: deps.project_id, config: deps.config };

	let validated: ReturnType<typeof validateSend>;
	try {
		validated = validateSend(input, validationDeps);
	} catch (err) {
		if (err instanceof SendToolError && err.code === "SECRET_PATTERN_DETECTED") {
			withTransaction(deps.db, () => {
				appendAuditRow(deps.db, {
					ts: now().toISOString(),
					project_id: deps.project_id,
					bot_id: deps.bot_id,
					chat_id: deps.config.chat_id,
					client_id: null,
					direction: "send",
					eid: null,
					envelope_type: typeof input.type === "string" ? input.type : null,
					from_user_id: null,
					to_user_id: null,
					outcome: "rejected",
					reason: "SECRET_PATTERN_DETECTED",
				});
			});
		}
		throw err;
	}
	const { input: validatedInput, existingThread, recipients } = validated;

	const continuesThread = IN_THREAD_TYPES.has(validatedInput.type);
	const isOutboundRequest = validatedInput.type === "REQUEST";

	const eid = generateId();
	const thread = continuesThread ? validatedInput.thread! : generateId();
	const ts = now().toISOString();

	const envelope: Envelope = {
		eid,
		type: validatedInput.type,
		from: deps.config.agent_id,
		to: validatedInput.type === "BROADCAST" ? null : validatedInput.to!,
		thread,
		ts,
		body: validatedInput.body,
		basis: stampBasis(validatedInput),
		approval_ref: validatedInput.approval_ref,
		// Stamped from the local roster, never accepted from the caller (`validateSend`'s own PT-02
		// guarantee). Safe to assert non-null for an addressed type: `checkRecipientsKnown` already
		// confirmed the addressee is in the roster, inside `validateSend`, before any network call.
		to_user_id: validatedInput.type === "BROADCAST" ? undefined : deps.config.roster[validatedInput.to!]!.user_id,
	};

	const { wire } = guardEncodedLength(envelope);

	const applyContext: ApplyContext = { agentId: deps.config.agent_id, roster: deps.config.roster };
	const senderUserId = deps.config.roster[deps.config.agent_id]?.user_id ?? null;

	try {
		deps.roomGuard.assertTarget(deps.config.chat_id);
		for (const to of recipients) {
			deps.roomGuard.assertTarget(`@${deps.config.roster[to]!.username}`);
		}
	} catch (err) {
		if (!(err instanceof WrongRoomError)) {
			throw err;
		}
		withTransaction(deps.db, () => {
			appendAuditRow(deps.db, {
				ts,
				project_id: deps.project_id,
				bot_id: deps.bot_id,
				chat_id: deps.config.chat_id,
				client_id: null,
				direction: "send",
				eid,
				envelope_type: envelope.type,
				from_user_id: senderUserId,
				to_user_id: envelope.to_user_id ?? null,
				outcome: "rejected",
				reason: "WRONG_ROOM",
			});
		});
		throw new SendToolError(
			"WRONG_ROOM",
			`Send refused: chat_id "${err.chat_id}" is not authorized for binding "${deps.project_id}" — ${err.message}`,
			{ cause: err },
		);
	}

	// Rate discipline (PR-28, `send/rate.ts`, module doc "Two independent gates"). The ledger's own
	// `offsets.retry_after_until` — Telegram's own word this bot is throttled — is checked first; only
	// when it has nothing to say does the in-memory `SendRateBudget` get asked. Either refusing means
	// zero network calls and one `rejected`/`RATE_LIMITED` audit row.
	const recipientChats = recipients.map((to) => `@${deps.config.roster[to]!.username}`);
	const rateCheckMs = now().getTime();
	const wait =
		retryAfterSeconds(readRetryAfterUntil(deps.db, deps.bot_id), rateCheckMs) ??
		deps.rateBudget.check(deps.bot_id, deps.config.chat_id, [deps.config.chat_id, ...recipientChats], rateCheckMs);
	if (wait !== undefined) {
		withTransaction(deps.db, () => {
			appendAuditRow(deps.db, {
				ts,
				project_id: deps.project_id,
				bot_id: deps.bot_id,
				chat_id: deps.config.chat_id,
				client_id: null,
				direction: "send",
				eid,
				envelope_type: envelope.type,
				from_user_id: senderUserId,
				to_user_id: envelope.to_user_id ?? null,
				outcome: "rejected",
				reason: "RATE_LIMITED",
			});
		});
		throw new SendToolError(
			"RATE_LIMITED",
			`Send refused: rate-limited for ${wait}s — nothing was sent and this call will not retry automatically.`,
			{ retry_after_s: wait },
		);
	}
	// A pass spends budget immediately, before the call: an ATTEMPTED post costs the same whether or
	// not it lands (module doc); a locally-refused send above never reaches here and spends nothing.
	deps.rateBudget.record(deps.bot_id, deps.config.chat_id, [deps.config.chat_id, ...recipientChats], rateCheckMs);

	// Read just before the call: `RateLimitRecorder`, wrapped around the raw client deep inside the
	// transport stack (`bindings.ts`'s `buildTransport`), is the only place a 429 from THIS call could
	// still record against this same column, so a value already there is never misattributed below.
	const retryBefore = readRetryAfterUntil(deps.db, deps.bot_id);

	let deliveryResult: DualWriteResult;
	try {
		// The transport carries the HTML presentation (ADR-05c); the canonical `text` `guardEncodedLength`
		// already measured is what Telegram stores, what peers decode, and what the 4096 limit is
		// measured against ("after entities parsing") — `renderMessageHtml` re-derives the same envelope
		// bytes into that presentation, never a second source of truth for the body.
		deliveryResult = await deps.transport.send(renderMessageHtml(envelope), [...recipients], {
			groupReplyTo: existingThread?.group_message_id ?? undefined,
			silent: SILENT_TYPES.has(validatedInput.type),
		});
	} catch (err) {
		if (!(err instanceof TransportError)) {
			throw err;
		}
		const retryAfter = rateLimitedDuring(deps.db, deps.bot_id, retryBefore, now().getTime());
		// D6 — the ONE undelivered transition applied locally anyway. `abandoned` asserts nothing about
		// the peer and touches no repository (`shared/envelope.ts`), so it is the only basis a failed
		// transport may still close locally.
		if (validatedInput.type === "RESOLVED" && validatedInput.basis === ABANDON_BASIS_VALUE && existingThread !== undefined) {
			withTransaction(deps.db, () => {
				const applied = applyEnvelope(
					existingThread,
					{
						envelope,
						// Nothing was delivered, so there is no new message to point at; the thread keeps the
						// id of the message that opened it.
						telegram_message_id: existingThread.opened_message_id,
						message_date: ts,
						via: existingThread.via,
					},
					applyContext,
				);
				if (applied.thread === undefined) {
					throw new Error(
						"sendPath: local abandonment produced no thread to close for a RESOLVED that references an existing one — this is a defect.",
					);
				}
				writeThreadRecord(deps.db, {
					project_id: deps.project_id,
					thread_id: envelope.thread,
					record: { ...applied.thread, closure_delivered: false },
					updated_at: ts,
				});
				// The closure and its refusal are one fact: a rate-limited abandonment is audited like
				// every other rate-limited send (Judgment Day `JD-AB-001`), inside the same transaction.
				if (retryAfter !== undefined) {
					appendAuditRow(deps.db, {
						ts,
						project_id: deps.project_id,
						bot_id: deps.bot_id,
						chat_id: deps.config.chat_id,
						client_id: null,
						direction: "send",
						eid,
						envelope_type: envelope.type,
						from_user_id: senderUserId,
						to_user_id: envelope.to_user_id ?? null,
						outcome: "rejected",
						reason: "RATE_LIMITED",
					});
				}
			});
			const closureMessage = `${err.message} — the thread was closed locally anyway (abandonment is yours alone to declare), but the peer was NEVER told. It is reported in ${TOOL_PREFIX}fetch's \`unannounced_closures\` until you re-send it.`;
			if (retryAfter !== undefined) {
				throw new SendToolError(
					"RATE_LIMITED",
					`${closureMessage} Telegram rate-limited this bot for ${retryAfter}s during this call — nothing further will be retried automatically.`,
					{ cause: err, retry_after_s: retryAfter },
				);
			}
			throw new SendToolError("TRANSPORT_ERROR", closureMessage, { cause: err });
		}
		if (retryAfter !== undefined) {
			withTransaction(deps.db, () => {
				appendAuditRow(deps.db, {
					ts,
					project_id: deps.project_id,
					bot_id: deps.bot_id,
					chat_id: deps.config.chat_id,
					client_id: null,
					direction: "send",
					eid,
					envelope_type: envelope.type,
					from_user_id: senderUserId,
					to_user_id: envelope.to_user_id ?? null,
					outcome: "rejected",
					reason: "RATE_LIMITED",
				});
			});
			throw new SendToolError(
				"RATE_LIMITED",
				`Send refused: Telegram rate-limited this bot for ${retryAfter}s during this call — nothing was delivered and this call will not retry automatically.`,
				{ cause: err, retry_after_s: retryAfter },
			);
		}
		throw new SendToolError("TRANSPORT_ERROR", err.message, { cause: err });
	}

	withTransaction(deps.db, () => {
		if (deliveryResult.group.ok) {
			clearCondition(deps.db, deps.project_id, "group_outage");
		} else {
			raiseCondition(deps.db, {
				scope: deps.project_id,
				name: "group_outage",
				since: ts,
				// The classification CODE, never the free-text error — `conditions-store.ts`'s own rule
				// ("detail carries codes and ids, never prose").
				detail: { last_error: deliveryResult.group.code },
			});
		}

		let applied: ReturnType<typeof applyEnvelope> | undefined;
		if (continuesThread && existingThread) {
			const stamp = stampFrom(deliveryResult, "direct");
			applied = applyEnvelope(
				existingThread,
				{ envelope, telegram_message_id: stamp.message_id, message_date: ts, via: stamp.via },
				applyContext,
			);
		} else if (isOutboundRequest) {
			const stamp = stampFrom(deliveryResult, "group");
			applied = applyEnvelope(
				undefined,
				{ envelope, telegram_message_id: stamp.message_id, message_date: ts, via: stamp.via },
				applyContext,
			);
		}
		// BROADCAST opens no thread (v1); `applied` stays `undefined` for it and nothing is written.

		if (applied !== undefined) {
			if (applied.thread === undefined) {
				throw new Error(
					`sendPath: applyEnvelope produced no thread for a ${envelope.type} that must open or update one — this is a defect, not a ${TOOL_PREFIX}send input problem.`,
				);
			}
			writeThreadRecord(deps.db, {
				project_id: deps.project_id,
				thread_id: envelope.thread,
				record: applied.thread,
				updated_at: ts,
			});
		}

		appendAuditRow(deps.db, {
			ts,
			project_id: deps.project_id,
			bot_id: deps.bot_id,
			chat_id: deps.config.chat_id,
			client_id: null,
			direction: "send",
			eid,
			envelope_type: envelope.type,
			from_user_id: senderUserId,
			to_user_id: envelope.to_user_id ?? null,
			outcome: deliveryResult.degraded ? "degraded" : "ok",
			reason: null,
		});
	});

	return {
		ok: true,
		eid,
		thread,
		sent_at: ts,
		wire,
		delivery: {
			group: deliveryResult.group,
			direct: deliveryResult.direct,
			degraded: deliveryResult.degraded,
		},
	};
}

/**
 * `send` (design §9). Everything runs under `deps.mutex.run(deps.project_id, …)`, so a
 * read-validate-send-write sequence for one binding never interleaves with another call on the same
 * binding — `validateSend`'s own doc names exactly this hazard for its unlocked thread-row read.
 */
export function sendPath(input: SendToolInput, deps: SendPathDeps): Promise<SendToolOutput> {
	return deps.mutex.run(deps.project_id, () => runSendPath(input, deps));
}
