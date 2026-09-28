/**
 * Provenance: telegram-agent-bus src/tools/send.ts:113-192,205-378 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 771f968e37a1897e7ecb3e277bacb294c30375b1018f30be8e9ce6cb4e1ca423
 *   (SHA-256 of lines 113-192 then 205-378 of the frozen v1 file, each LF-normalized with its
 *    terminating newline, concatenated in that order — the two-range rule `daemon/admission.ts`
 *    established. Reproduce with `node -e "…"` over the frozen checkout; the registry
 *    `test/fixtures/v1-provenance.json` lists the entry but carries no hash.)
 * Changes: (1) `BRIDGE_BUSY` removed from `SendErrorCode` — the ledger replaces v1's bridge lock, and
 * PR-27's `BindingMutex` serialises sends instead (design §9); (2) thread lookups against the ledger:
 * `checkLoopPrevention` reads ONE row with `readThreadRecord(db, project_id, thread)` instead of
 * indexing v1's whole `state.threads` map, so a thread that exists only under another project answers
 * `UNKNOWN_THREAD` the same as one this ledger has never seen at all (invariant 1); (3) `Config` becomes
 * the binding's materialized config — `Pick<BindingConfig, "agent_id" | "roster" | "secret_markers">`;
 * (4) the four stages are composed here into one exported `validateSend`, in the spec's order, because
 * v1 composed them inside `sendTool` (`v1:523-535`, outside this SEAM's two cited ranges); (5) the
 * encoded-length guard and the wire gauge are lifted from v1 `:563-574` and `:642-649` (also outside the
 * cited ranges) into the pure `guardEncodedLength`, because the spec lists the guard as the pipeline's
 * last stage and PT-15/task 26.1 pin it here — PR-27 calls it with the envelope it builds; (6)
 * `obligations` removed from `SendToolOutput` (design §12 row for send-path, change (4)); (7)
 * `IN_THREAD_TYPES` is re-declared locally because `shared/tool-schemas.ts` keeps its own copy
 * module-private and PR-26 does not reopen that hash-pinned module; (8) an ACK or a non-abandon
 * RESOLVED must be addressed back to the thread's originator (`input.to === thread.from`, else
 * `NOT_ADDRESSEE`) — v1 checked only that the caller was the addressee, so a correct addressee could
 * direct the closing message to any other roster member and the originator never received it
 * (Judgment Day `JD-A-001`, spec "addressee correct"); (9) the `UNKNOWN_THREAD` remedy names this
 * product's tool, `${TOOL_PREFIX}fetch`, not v1's `agentbus_fetch`; (10) `WRONG_ROOM` added for PR-27's
 * send-path room pre-check, so both modules report through one error class; (11) `RATE_LIMITED` added
 * for PR-28's rate discipline (`send/rate.ts`), and `SendToolError` gains an optional `retry_after_s`
 * so a locally-refused or reclassified 429 carries the same field a caller would get from Telegram
 * directly, instead of it being reduced to English inside a message; (12) `guardEncodedLength`'s
 * `headroom_chars` now subtracts `VERSION_STAMP_SUFFIX.length` (F3 PR-08, version-observability):
 * once `renderMessageHtml` renders a build/wire version stamp into the delivered message, that fixed
 * overhead counts toward Telegram's real ceiling too, so a headroom figure that ignored it overstated
 * the real safety margin by exactly the stamp's length (RDD review review-49f5f64f1398a087); (13)
 * `checkDebateTurn` added between loop prevention and the secret backstop (F5, Arena-light 2-party
 * debates, D7, design.md Decision (c)): a no-op unless `body` decodes as a debate marker
 * (`shared/debate-marker.ts`), it enforces the COUNTER/AUDIT role split by reusing `NOT_ORIGINATOR`/
 * `NOT_ADDRESSEE` (ADR-13's own vocabulary) and the `ARENA_LIGHT_MAX_ROUNDS` round cap
 * (`ROUNDS_EXHAUSTED`, new); an inline patch shape is refused `INLINE_PATCH_REJECTED` (new). This
 * stage never journals — journaling an accepted turn is `send-path.ts`'s job (PR-5).
 *
 * ---
 *
 * The `send` validation pipeline (`daemon/send/validate.ts`, design §12's `send` row, PT-02, PT-15;
 * opens unit 8 `send-path`).
 *
 * **A pure function over the ledger — no network call, no ledger write.** `validateSend` has no
 * transport dependency at all: the only things it imports from `../transport/types.js` are the two
 * outcome TYPES `SendToolOutput` re-exposes for its caller's convenience, never a transport value. The
 * ledger accesses it makes are single reads — `readThreadRecord` in stage 2, and `readMaxCounterRound`
 * in stage 2.5 for an Arena-light COUNTER turn (F5) — nothing here calls `writeThreadRecord`,
 * `appendDebateTurn`, or any other mutating statement. Minting `eid`/`thread`, building the envelope,
 * stamping `to_user_id` from the roster, and sending are PR-27's job (`daemon/send/send-path.ts`), not this
 * module's.
 *
 * **The caller must hold the binding's mutex.** `validateSend` reads one thread row (stage 2) and
 * returns it as `existingThread`; nothing here locks that row. If PR-27 calls this without already
 * holding the binding's `BindingMutex` for the whole read-validate-send-write sequence, the row
 * validated against can go stale before the bookkeeping write that follows a successful send — this
 * module cannot protect against that on its own, and does not try to.
 *
 * **No destination in, no destination out.** The `send` input schema (`shared/tool-schemas.ts`) has no
 * `from`, `chat_id`, `bot`, `group` or `to_chat` key at all, so `sendInputSchema.safeParse` strips any
 * caller-supplied stray of that shape before `ValidatedSend.input` is ever built — a forged `from` or a
 * caller-chosen room never survives stage 1 (PT-02). `from` and the numeric `to_user_id` anchor are
 * stamped by PR-27 from the binding, never read from the caller here.
 */

import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { readThreadRecord } from "../../ledger/threads.js";
import { readMaxCounterRound } from "../../ledger/debate-journal.js";
import { ARENA_LIGHT_MAX_ROUNDS, MAX_BODY_CHARS, TELEGRAM_MAX_TEXT_CHARS, TOOL_PREFIX } from "../../shared/constants.js";
import {
	ABANDON_BASIS_VALUE,
	VERSION_STAMP_SUFFIX,
	encodeEnvelope,
	encodedTextExceedsTelegramLimit,
	normalizeBody,
	type Envelope,
} from "../../shared/envelope.js";
import { containsInlinePatchShape, decodeDebateBody, type DebateTurnMarker } from "../../shared/debate-marker.js";
import { checkForSecrets } from "../../shared/secrets.js";
import type { ThreadRecord } from "../../shared/thread-record.js";
import { sendInputSchema, type SendToolInput } from "../../shared/tool-schemas.js";
import type { BindingConfig } from "../binding-config.js";
import type { DirectSendOutcome, GroupSendOutcome } from "../transport/types.js";

/**
 * What this message actually cost on the wire, and what is left (ADR-23).
 *
 * The limit that binds a caller is not `MAX_BODY_CHARS`. ADR-05b's two-plane layout carries the body
 * TWICE — once as human prose, once inside the JSON envelope — so the raw cap advertises 3,000 while
 * the true ceiling for plain ASCII is far lower, and JSON escaping lowers it further for text carrying
 * backslashes or quotes. Nothing exposed that number, so the effective limit could only be discovered
 * by hitting it: a hard `BODY_TOO_LONG` after the message was already composed.
 *
 * Reporting the spend turns the wall into a gauge. It is deliberately three plain numbers rather than a
 * warning flag, because a threshold is a second opinion about what is "close" and the caller composing
 * the message is better placed to hold that opinion than this tool is.
 */
export interface WireCost {
	/** Length of the CANONICAL encoding — the bytes the peer decodes and the guard measures. */
	chars: number;
	/** Telegram's own ceiling, stated rather than left implicit. */
	limit: number;
	/** `limit - chars`. Never a second definition of the same thing. */
	headroom_chars: number;
}

/** `send` tool output (design.md "MCP tool surface"), unchanged from v1 except `obligations` (change (6)). */
export interface SendToolOutput {
	ok: true;
	eid: string;
	thread: string;
	sent_at: string;
	/** What this send spent of Telegram's per-message ceiling, and what remained (ADR-23). */
	wire: WireCost;
	delivery: {
		group: GroupSendOutcome;
		direct: DirectSendOutcome[];
		degraded: boolean;
	};
}

export type SendErrorCode =
	| "VALIDATION_ERROR"
	| "BODY_TOO_LONG"
	| "SECRET_PATTERN_DETECTED"
	| "UNKNOWN_THREAD"
	| "NOT_REQUESTABLE"
	| "NOT_ADDRESSEE"
	| "NOT_ORIGINATOR"
	/** The caller is party to neither end of the thread — distinct from being the wrong one of the two. */
	| "NOT_PARTICIPANT"
	| "ALREADY_RESOLVED"
	| "UNKNOWN_RECIPIENT"
	| "WRONG_ROOM"
	| "RATE_LIMITED"
	/** F5 (Arena-light): a debate turn's `text` carries the shape of a literal diff/patch instead of a pointer-only ref (D7, spec "Debate bodies are pointer-only, never inline patches"). */
	| "INLINE_PATCH_REJECTED"
	/** F5 (Arena-light): a COUNTER would exceed `ARENA_LIGHT_MAX_ROUNDS` for this debate — refused before any journal write (design.md Decision (c)). */
	| "ROUNDS_EXHAUSTED"
	| "TRANSPORT_ERROR";

/**
 * Raised by {@link validateSend} for any rejection in the fixed validation pipeline (design.md's Errors
 * list). `TRANSPORT_ERROR` is not thrown here — it stays in the union for PR-27's own use, so both
 * modules report failures through one error class.
 *
 * Carries `cause` so a `TRANSPORT_ERROR` does not FLATTEN the thing underneath it (D2).
 */
export class SendToolError extends Error {
	readonly code: SendErrorCode;
	/** Seconds until a rate-limited send may be retried — set only for `RATE_LIMITED` (change (11)). */
	readonly retry_after_s?: number;

	constructor(code: SendErrorCode, message: string, options?: { cause?: unknown; retry_after_s?: number }) {
		super(message, options);
		this.name = "SendToolError";
		this.code = code;
		this.retry_after_s = options?.retry_after_s;
	}
}

/** Bytes of randomness `defaultGenerateId` draws — hex-encodes to the 12 characters `EID_PATTERN`/`THREAD_PATTERN` require. */
const GENERATED_ID_BYTES = 6;

/** Default `eid`/`thread` generator (v1 `:205-207`), exported so PR-27 can use it as its own default. */
export function defaultGenerateId(): string {
	return randomBytes(GENERATED_ID_BYTES).toString("hex");
}

/** Stage 1a — the specific `BODY_TOO_LONG` code, checked before the general schema pass. */
function assertBodyLength(body: string, maxChars: number): void {
	if (body.length > maxChars) {
		throw new SendToolError("BODY_TOO_LONG", `body exceeds the ${maxChars}-character limit (was ${body.length})`);
	}
}

/**
 * Stage 1 — schema validation. `MAX_BODY_CHARS` is checked FIRST and separately from the rest of the
 * shape rules so an over-long body reports the more specific `BODY_TOO_LONG` instead of the generic
 * `VALIDATION_ERROR`. Everything else — closed type set, `to`/`thread`/`basis`/`approval_ref`
 * conditionals — goes through `sendInputSchema`, which also strips any caller-supplied key the schema
 * does not declare (PT-02): a stray `from`, `chat_id`, `bot`, `group` or `to_chat` never survives this
 * stage.
 */
function validateInput(input: SendToolInput, maxBodyChars: number): SendToolInput {
	if (typeof input.body === "string") {
		assertBodyLength(input.body, maxBodyChars);
	}
	const result = sendInputSchema.safeParse(input);
	if (!result.success) {
		throw new SendToolError("VALIDATION_ERROR", result.error.message);
	}

	// Normalizing HERE, at the single point every later stage reads from, is what makes "what was
	// secret-checked is what is sent" true: the backstop, the envelope PR-27 builds later, and the
	// persisted thread record all see the same normalized prose. Length is checked against the RAW body
	// above and normalization never lengthens a string, so `MAX_BODY_CHARS` stays a valid upper bound
	// either way.
	const body = normalizeBody(result.data.body);
	if (body.length === 0) {
		throw new SendToolError("VALIDATION_ERROR", "body is empty once whitespace and control characters are normalized away");
	}

	return { ...result.data, body };
}

/** Types that continue an existing thread rather than opening one (re-declared: change (7)). */
const IN_THREAD_TYPES: ReadonlySet<string> = new Set(["REPLY", "ACK", "RESOLVED"]);

/**
 * Stage 2 — loop prevention (ADR-07). Only REPLY/ACK/RESOLVED reference an existing thread;
 * BROADCAST/REQUEST always open a new one and skip this stage entirely (returns `undefined`). Returns
 * the referenced thread record on success so the caller does not have to look it up a second time for
 * the outbound state-bookkeeping step.
 *
 * The lookup is the one change from v1 (change (2)): a single ledger read scoped to `project_id`
 * (`readThreadRecord`), not an index into v1's whole `state.threads` map — a thread that exists only
 * under another project answers `UNKNOWN_THREAD` here exactly as one this ledger has never seen at all
 * does (invariant 1).
 */
function checkLoopPrevention(
	input: SendToolInput,
	db: DatabaseSync,
	project_id: string,
	callerAgentId: string,
): ThreadRecord | undefined {
	if (!IN_THREAD_TYPES.has(input.type)) {
		return undefined;
	}

	const thread = readThreadRecord(db, project_id, input.thread!);
	if (!thread) {
		throw new SendToolError(
			"UNKNOWN_THREAD",
			`Thread "${input.thread}" is not known locally — run ${TOOL_PREFIX}fetch first to receive it before acknowledging or resolving it.`,
		);
	}
	if (thread.opened_type !== "REQUEST") {
		throw new SendToolError(
			"NOT_REQUESTABLE",
			`Thread "${input.thread}" was opened by a ${thread.opened_type}, not a REQUEST — it cannot be acknowledged or resolved.`,
		);
	}
	// A REPLY obeys neither the addressee rule nor ADR-13's inversion of it: EITHER participant may
	// continue a thread, which is the whole difference between a mailbox and a conversation. Without it
	// the originator goes blind — the peer asks "which branch?" and the asker has no way to answer,
	// while the thread sits in their pending list with no signal the ball came back.
	//
	// It is deliberately NOT gated on whose turn it is. Block 2 closed multipart on the argument that an
	// agent with more to say sends two replies, so refusing an out-of-turn reply would break the remedy
	// that replaced multipart.
	if (input.type === "REPLY") {
		if (thread.from !== callerAgentId && thread.to !== callerAgentId) {
			throw new SendToolError(
				"NOT_PARTICIPANT",
				`Thread "${input.thread}" is between "${thread.from}" and "${thread.to}" — "${callerAgentId}" is party to neither end and cannot continue it.`,
			);
		}
		const otherParty = thread.from === callerAgentId ? thread.to : thread.from;
		if (input.to !== otherParty) {
			throw new SendToolError(
				"NOT_ADDRESSEE",
				`Thread "${input.thread}" is a conversation with "${otherParty}", so a reply must be addressed there, not to "${input.to}".`,
			);
		}
		if (thread.status === "resolved") {
			throw new SendToolError(
				"ALREADY_RESOLVED",
				`Thread "${input.thread}" is already resolved, and RESOLVED is terminal (ADR-07) — a reply cannot reopen it. Open a new REQUEST instead.`,
			);
		}
		return thread;
	}

	// ADR-13: `abandoned` is the one basis that inverts the addressee rule instead of obeying it.
	// Everything else on a thread is the addressee's to say; giving up on an unanswered REQUEST is only
	// ever the originator's. The relaxation is scoped to exactly this basis — letting any other agent
	// abandon a thread would turn a closure path into a way to silence someone else's obligation.
	if (input.type === "RESOLVED" && input.basis === ABANDON_BASIS_VALUE) {
		if (thread.from !== callerAgentId) {
			throw new SendToolError(
				"NOT_ORIGINATOR",
				`Thread "${input.thread}" was opened by "${thread.from}", not "${callerAgentId}" — only the agent that opened a REQUEST may abandon it. If you are the addressee, resolve it with a basis that describes the work instead.`,
			);
		}
		if (input.to !== thread.to) {
			throw new SendToolError(
				"NOT_ADDRESSEE",
				`Thread "${input.thread}" was addressed to "${thread.to}", so its abandonment must go to the same peer, not "${input.to}".`,
			);
		}
	} else {
		if (thread.to !== callerAgentId) {
			throw new SendToolError(
				"NOT_ADDRESSEE",
				`Thread "${input.thread}" is addressed to "${thread.to}", not "${callerAgentId}" — only the addressee may acknowledge or resolve it.`,
			);
		}
		// Change (8): the acknowledgement or resolution goes back to the one agent waiting for it.
		if (input.to !== thread.from) {
			throw new SendToolError(
				"NOT_ADDRESSEE",
				`Thread "${input.thread}" was opened by "${thread.from}", so its acknowledgement or resolution must go back there, not to "${input.to}".`,
			);
		}
	}
	if (input.type === "RESOLVED" && thread.status === "resolved") {
		throw new SendToolError("ALREADY_RESOLVED", `Thread "${input.thread}" is already resolved.`);
	}

	return thread;
}

/**
 * Stage 2.5 — Arena-light debate-turn stage (F5, D7; design.md Decision (c)), inserted between loop
 * prevention and the secret backstop. A no-op unless `body` decodes as one or more debate markers
 * (`shared/debate-marker.ts`'s `decodeDebateBody`) — an ordinary send's body never carries the
 * `[ARENA-LIGHT:...]` prefix, so this stage costs one failed regex scan and returns `undefined` for
 * every non-debate send.
 *
 * For every decoded marker, in this order:
 * 1. Role check — reuses loop prevention's own codes rather than inventing new ones (ADR-13): a
 *    COUNTER is refused `NOT_ORIGINATOR` unless the caller is `thread.from`; an AUDIT is refused
 *    `NOT_ADDRESSEE` unless the caller is `thread.to`. A third party never reaches this stage at all —
 *    `checkLoopPrevention`'s REPLY branch already refused it `NOT_PARTICIPANT`.
 * 2. Pointer-only check — `containsInlinePatchShape(marker.text)` refuses a literal diff/patch with
 *    `INLINE_PATCH_REJECTED` (spec "Debate bodies are pointer-only, never inline patches").
 * 3. Round-cap check — only when at least one marker is a COUNTER: `readMaxCounterRound(...) + 1 >
 *    ARENA_LIGHT_MAX_ROUNDS` refuses `ROUNDS_EXHAUSTED`. AUDIT never advances or checks this count
 *    (design.md "Round counting": "Increment on AUDIT too" was rejected).
 *
 * This stage never journals, on refusal or on success — journaling an accepted turn is
 * `send-path.ts`'s job (PR-5), so a refusal here can never be a half-written turn.
 */
function checkDebateTurn(
	body: string,
	thread: ThreadRecord | undefined,
	debateId: string | undefined,
	db: DatabaseSync,
	project_id: string,
	callerAgentId: string,
): readonly DebateTurnMarker[] | undefined {
	const markers = decodeDebateBody(body);
	if (markers === undefined) {
		return undefined;
	}

	for (const marker of markers) {
		if (marker.turn === "COUNTER" && thread?.from !== callerAgentId) {
			throw new SendToolError(
				"NOT_ORIGINATOR",
				`Debate "${debateId}" was opened by "${thread?.from}" — only its originator may send a COUNTER, not "${callerAgentId}".`,
			);
		}
		if (marker.turn === "AUDIT" && thread?.to !== callerAgentId) {
			throw new SendToolError(
				"NOT_ADDRESSEE",
				`Debate "${debateId}" is addressed to "${thread?.to}" — only its addressee may send an AUDIT, not "${callerAgentId}".`,
			);
		}
	}

	for (const marker of markers) {
		if (containsInlinePatchShape(marker.text)) {
			throw new SendToolError(
				"INLINE_PATCH_REJECTED",
				`Debate "${debateId}" turn text carries the shape of a literal diff/patch — refs must be pointer-only (commit, PR, path, memory id), never an inline patch.`,
			);
		}
	}

	if (markers.some((marker) => marker.turn === "COUNTER")) {
		const nextRound = readMaxCounterRound(db, project_id, debateId!) + 1;
		if (nextRound > ARENA_LIGHT_MAX_ROUNDS) {
			throw new SendToolError(
				"ROUNDS_EXHAUSTED",
				`Debate "${debateId}" is already at its ${ARENA_LIGHT_MAX_ROUNDS}-round cap — no further COUNTER is accepted until it closes with CONSENSUS or ESCALATE.`,
			);
		}
	}

	return markers;
}

/**
 * Stage 3 — secret-pattern backstop (ADR-06 L6), run once before either channel is touched.
 *
 * Scans EVERY caller-authored field that reaches the wire, not just `body` (ADR-12): `approval_ref` is
 * the only field the schema leaves as unconstrained free text, and it is serialized into the envelope
 * JSON like everything else.
 */
function checkSecretBackstop(input: SendToolInput, secretMarkers: readonly string[]): void {
	for (const field of [input.body, input.approval_ref]) {
		if (field === undefined) {
			continue;
		}
		const result = checkForSecrets(field, secretMarkers);
		if (!result.ok) {
			throw new SendToolError("SECRET_PATTERN_DETECTED", `Rejected by rule "${result.rule}": ${result.message}`);
		}
	}
}

/** The fan-out recipient set: every other roster entry for BROADCAST, the single `to` otherwise. */
function resolveRecipients(input: SendToolInput, config: SendValidationDeps["config"]): string[] {
	if (input.type === "BROADCAST") {
		return Object.keys(config.roster).filter((agentId) => agentId !== config.agent_id);
	}
	return [input.to!];
}

/**
 * Stage 4 — recipient/roster pre-check, run BEFORE the transport is ever invoked. An unknown addressee
 * fails the WHOLE call — no group post either — instead of surfacing as a partial/degraded delivery: an
 * unknown recipient is a configuration/protocol error, not a transient delivery failure.
 */
function checkRecipientsKnown(recipients: string[], config: SendValidationDeps["config"]): void {
	for (const to of recipients) {
		if (!config.roster[to]) {
			throw new SendToolError("UNKNOWN_RECIPIENT", `"${to}" is not present in the local roster.`);
		}
	}
}

/** The binding fields {@link validateSend} reads, and no others. */
export interface SendValidationDeps {
	readonly db: DatabaseSync;
	readonly project_id: string;
	readonly config: Pick<BindingConfig, "agent_id" | "roster" | "secret_markers">;
}

/** The pipeline's output: the normalized input, the referenced thread (if any) and the resolved recipients. */
export interface ValidatedSend {
	/** The schema-validated, normalized input — never carries a destination key (PT-02). */
	readonly input: SendToolInput;
	/** The thread REPLY/ACK/RESOLVED continues; `undefined` for BROADCAST/REQUEST (which open one). */
	readonly existingThread: ThreadRecord | undefined;
	/** Every logical agent id this send must reach. */
	readonly recipients: readonly string[];
	/**
	 * Decoded Arena-light debate markers, if `body` carried any (F5); `undefined` for an ordinary send.
	 * Consumed by `send-path.ts` (PR-5) for silence and journaling, without re-decoding `body`.
	 */
	readonly debateTurns?: readonly DebateTurnMarker[];
}

/**
 * Runs the five validation stages, in the spec's order (`send-path` spec, "Validation pipeline and
 * secret backstop run before any network call"): schema validation and normalization; loop prevention;
 * the Arena-light debate-turn stage (F5 — round cap, role check, pointer-only, no-op unless `body`
 * decodes as a debate marker); the secret backstop; recipient/roster resolution. See the module doc
 * for what it deliberately does NOT do — no network call, no ledger write, no envelope built.
 */
export function validateSend(input: SendToolInput, deps: SendValidationDeps): ValidatedSend {
	const validated = validateInput(input, MAX_BODY_CHARS);

	const existingThread = checkLoopPrevention(validated, deps.db, deps.project_id, deps.config.agent_id);

	const debateTurns = checkDebateTurn(validated.body, existingThread, validated.thread, deps.db, deps.project_id, deps.config.agent_id);

	checkSecretBackstop(validated, deps.config.secret_markers);

	const recipients = resolveRecipients(validated, deps.config);
	checkRecipientsKnown(recipients, deps.config);

	return { input: validated, existingThread, recipients, debateTurns };
}

/**
 * The encoded-length guard (v1 `:563-574` for the throw, `:642-649` for the gauge — both outside this
 * SEAM's two cited ranges, change (5)). Pure: measures `encodeEnvelope(envelope)`, the same canonical
 * text a peer decodes, but the ceiling itself is measured against Telegram's real delivered length
 * ("after entities parsing") — canonical length plus `renderMessageHtml`'s fixed
 * {@link VERSION_STAMP_SUFFIX} overhead (F3 PR-08, change (12)). PR-27 calls this with the envelope it
 * has already built, after `validateSend` succeeds and `eid`/`thread`/`to_user_id` have been stamped.
 */
export function guardEncodedLength(envelope: Envelope): { readonly text: string; readonly wire: WireCost } {
	const text = encodeEnvelope(envelope);

	// The raw-body cap cannot see JSON escaping, the envelope metadata, or ADR-05b's two-plane layout
	// (the body carried twice — once as human prose, once inside the JSON envelope), so a within-cap
	// body can still encode past Telegram's own ceiling. Catching it here turns what used to be an
	// opaque Telegram 400 on the group post into a local rejection with no channel touched.
	if (encodedTextExceedsTelegramLimit(text)) {
		throw new SendToolError(
			"BODY_TOO_LONG",
			`the encoded message is ${text.length} characters, over Telegram's ${TELEGRAM_MAX_TEXT_CHARS}-character limit — shorten the body. The two-plane layout (ADR-05b) carries the body twice, once as human prose and once inside the JSON envelope, so plain prose costs roughly double its length plus ~240 characters of header and metadata. That puts the practical ceiling near 1900 characters, well under the ${MAX_BODY_CHARS}-character raw cap, and JSON escaping of characters like backslashes lowers it further.`,
		);
	}

	return {
		text,
		wire: {
			chars: text.length,
			limit: TELEGRAM_MAX_TEXT_CHARS,
			headroom_chars: TELEGRAM_MAX_TEXT_CHARS - text.length - VERSION_STAMP_SUFFIX.length,
		},
	};
}
