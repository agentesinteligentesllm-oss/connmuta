import { ABANDON_BASIS_VALUE, RESOLVED_BASIS_VALUES } from "./envelope.js";
import { DEBATE_MARKER_PREFIX } from "./constants.js";

/**
 * Arena-light debate-turn body markers (`shared/debate-marker.ts`, F5, D7, design.md Decision (b)/(d)).
 *
 * A debate turn (PROPOSAL/AUDIT/COUNTER/CONSENSUS/ESCALATE) rides an EXISTING wire envelope
 * (`shared/envelope.ts`) as a one-line marker inside `body` — never as a new `type` or `basis` value:
 * an unknown envelope field is stripped on decode (v1 `src/envelope.ts:115`), and a new `type` would
 * be the wire change v2 forbids (CONSTITUTION §4, rule W1). The marker table this module encodes
 * against (spec "Debate turns map onto existing wire types", {@link DEBATE_TURN_WIRE_MAPPING}):
 *
 * | Turn | type | basis |
 * |---|---|---|
 * | PROPOSAL | REQUEST | none |
 * | AUDIT / COUNTER | REPLY | none |
 * | CONSENSUS | RESOLVED | context-shared |
 * | ESCALATE | RESOLVED | abandoned |
 *
 * **Single line, no exceptions.** `normalizeBody` (`daemon/send/validate.ts`) collapses every
 * whitespace run, including newlines, to one space before a decoder ever sees the body — a marker
 * that used a blank-line block or a newline-delimited section would already be mangled by the time it
 * reached this module (design.md "Discovery"). Decision (b)'s delimiter is therefore exactly one
 * line: `[ARENA-LIGHT:<TURN>[:<VERDICT>]] <text> refs: <r1>; <r2>`. Every function here both produces
 * and consumes that single-line shape, and {@link decodeDebateBody} never assumes an unnormalized
 * input (an embedded newline) is possible — by the time it runs in production, one never is.
 *
 * **`refs` is the pointer-only half of D7.** It carries commit shas, PR numbers, paths and memory
 * ids — never an inline diff — and {@link containsInlinePatchShape} is the check that keeps a literal
 * patch from being smuggled through as a "pointer" (spec "Debate bodies are pointer-only, never
 * inline patches"). This module only detects the shape; refusing the send is `checkDebateTurn`'s job
 * (`daemon/send/validate.ts`, Phase 3).
 *
 * **A body decodes as a whole or not at all.** A marker whose `turn` or `verdict` is not a value this
 * build knows fails the entire body closed (`undefined`) rather than returning the markers that did
 * parse — the same "refuse rather than partially trust a caller-controlled shape" rule
 * `ledger/conditions-store.ts` applies to its own inputs. A body that half-decodes is not a body
 * `checkDebateTurn` can safely act on.
 */

/** The five debate-turn subtypes a marker may carry (spec "Debate turns map onto existing wire types"). */
export const DEBATE_TURN_KINDS = ["PROPOSAL", "AUDIT", "COUNTER", "CONSENSUS", "ESCALATE"] as const;
export type DebateTurnKind = (typeof DEBATE_TURN_KINDS)[number];

/** Arena Orion's own verdict vocabulary (`GOVERNANCE.md:50`) — the only values an AUDIT/COUNTER marker may carry. */
export const DEBATE_VERDICTS = ["APPROVE", "APPROVE_WITH_CHANGES", "REJECT"] as const;
export type DebateVerdict = (typeof DEBATE_VERDICTS)[number];

/** One decoded (or to-be-encoded) debate turn. `verdict` is present only for AUDIT/COUNTER. */
export interface DebateTurnMarker {
	readonly turn: DebateTurnKind;
	readonly verdict?: DebateVerdict;
	readonly text: string;
	/** Pointer-only payloads (commit, PR, path, memory id) — never an inline diff (D7). */
	readonly refs: readonly string[];
}

/** The wire `type`/`basis` a turn maps onto, per this module's own doc comment table, in code so the
 * two can never drift apart (CONSTITUTION §5). The RESOLVED rows reuse `envelope.ts`'s own exported
 * basis vocabulary rather than redeclaring the literals, so a future rename of either value is caught
 * here at compile time instead of silently drifting. */
export const DEBATE_TURN_WIRE_MAPPING: Readonly<
	Record<DebateTurnKind, { readonly type: "REQUEST" | "REPLY" | "RESOLVED"; readonly basis?: (typeof RESOLVED_BASIS_VALUES)[number] }>
> = {
	PROPOSAL: { type: "REQUEST" },
	AUDIT: { type: "REPLY" },
	COUNTER: { type: "REPLY" },
	CONSENSUS: { type: "RESOLVED", basis: "context-shared" },
	ESCALATE: { type: "RESOLVED", basis: ABANDON_BASIS_VALUE },
};

/** The literal label that separates a marker's text from its pointer-only refs list. */
const REFS_LABEL = " refs: ";

/** The literal separator between two refs in an encoded marker. */
const REFS_SEPARATOR = "; ";

/** One marker's serialized `[ARENA-LIGHT:...]` header, without its text or refs. */
function encodeHeader(turn: DebateTurnKind, verdict: DebateVerdict | undefined): string {
	const verdictSuffix = verdict === undefined ? "" : `:${verdict}`;
	return `${DEBATE_MARKER_PREFIX}${turn}${verdictSuffix}]`;
}

/**
 * Serializes one debate turn into Decision (b)'s one-line body marker.
 *
 * `refs` is omitted entirely when empty rather than emitted as an empty `refs: ` tail — the two must
 * stay distinguishable so {@link decodeDebateBody} can round-trip "no refs yet" (a PROPOSAL usually
 * has none) without inventing a placeholder ref.
 */
export function encodeDebateTurn(marker: DebateTurnMarker): string {
	const header = encodeHeader(marker.turn, marker.verdict);
	const refsSuffix = marker.refs.length === 0 ? "" : `${REFS_LABEL}${marker.refs.join(REFS_SEPARATOR)}`;
	return `${header} ${marker.text}${refsSuffix}`;
}

/**
 * Composes one AUDIT and one COUNTER into the single silent REPLY the spec's coalesced-turn
 * requirement calls for — "two delimited sections, one line" (design.md Technical Approach). No new
 * composer state: the caller builds this one `body` and calls `send` once, so `rate.ts` is charged
 * once (design.md Data Flow, "one send = one budget hit").
 */
export function encodeCoalescedReply(audit: DebateTurnMarker, counter: DebateTurnMarker): string {
	return `${encodeDebateTurn(audit)} ${encodeDebateTurn(counter)}`;
}

/** Matches one marker header and captures its turn and (if present) verdict, globally within a body. */
const MARKER_HEADER_PATTERN = /\[ARENA-LIGHT:([A-Z]+)(?::([A-Z_]+))?\]/g;

function isDebateTurnKind(value: string): value is DebateTurnKind {
	return (DEBATE_TURN_KINDS as readonly string[]).includes(value);
}

function isDebateVerdict(value: string): value is DebateVerdict {
	return (DEBATE_VERDICTS as readonly string[]).includes(value);
}

/** Splits one marker's raw content (everything after its `]` header, up to the next header or the end) into text and refs. */
function parseMarkerContent(raw: string): { readonly text: string; readonly refs: readonly string[] } {
	const trimmed = raw.trim();
	const refsIndex = trimmed.lastIndexOf(REFS_LABEL);
	if (refsIndex === -1) {
		return { text: trimmed, refs: [] };
	}
	const text = trimmed.slice(0, refsIndex).trim();
	const refsText = trimmed.slice(refsIndex + REFS_LABEL.length);
	const refs = refsText
		.split(REFS_SEPARATOR)
		.map((ref) => ref.trim())
		.filter((ref) => ref.length > 0);
	return { text, refs };
}

/**
 * Decodes every marker in `body`, in order, or `undefined` when `body` carries none.
 *
 * `body` is always a single line by the time this runs (see the module doc) — the decoder never
 * splits on a newline and never assumes one could be present; {@link MARKER_HEADER_PATTERN} matches
 * the literal `[ARENA-LIGHT:...]` bracket wherever it sits, with no line-boundary anchor at all. A
 * coalesced reply decodes to two markers; an ordinary debate turn decodes to one.
 */
export function decodeDebateBody(body: string): readonly DebateTurnMarker[] | undefined {
	const headerMatches = [...body.matchAll(MARKER_HEADER_PATTERN)];
	if (headerMatches.length === 0) {
		return undefined;
	}

	const markers: DebateTurnMarker[] = [];
	for (const [index, match] of headerMatches.entries()) {
		const [rawHeader, turn, verdict] = match;
		if (!isDebateTurnKind(turn) || (verdict !== undefined && !isDebateVerdict(verdict))) {
			// Fails the WHOLE body closed — see the module doc on why a half-decoded body is refused
			// rather than returning only the markers that did parse.
			return undefined;
		}
		const contentStart = (match.index ?? 0) + rawHeader.length;
		const nextMatch = headerMatches[index + 1];
		const contentEnd = nextMatch === undefined ? body.length : (nextMatch.index ?? body.length);
		const { text, refs } = parseMarkerContent(body.slice(contentStart, contentEnd));
		markers.push(verdict === undefined ? { turn, text, refs } : { turn, verdict, text, refs });
	}
	return markers;
}

/**
 * Substrings unique to a literal git/unified diff, never to a pointer (a commit sha, PR number, file
 * path or memory id) — what `checkDebateTurn` (`daemon/send/validate.ts`, Phase 3) uses to refuse an
 * inline patch smuggled into `text`/`refs` instead of a real pointer (spec "Debate bodies are
 * pointer-only, never inline patches"). `normalizeBody` has already collapsed every newline to a
 * space by the time any debate body reaches this check, so a hunk header and a diff's file lines
 * survive as ordinary substrings on one line rather than as separate lines — these patterns are
 * written against exactly that collapsed shape.
 */
const GIT_DIFF_HEADER_PATTERN = /diff --git /;
const UNIFIED_DIFF_HUNK_HEADER_PATTERN = /@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;
const UNIFIED_DIFF_OLD_FILE_PATTERN = /(^|\s)--- \S/;
const UNIFIED_DIFF_NEW_FILE_PATTERN = /(^|\s)\+\+\+ \S/;

/**
 * True when `text` carries the shape of a literal patch rather than a pointer.
 *
 * A `diff --git` header or a hunk header (`@@ -a,b +c,d @@`) is distinctive enough alone; the
 * unified-diff old/new file-header pair (`--- `/`+++ `) is required TOGETHER, because either marker
 * alone is common enough in ordinary prose (a stray "+++" or a line of dashes) that it would false-
 * positive on legitimate pointer text.
 */
export function containsInlinePatchShape(text: string): boolean {
	if (GIT_DIFF_HEADER_PATTERN.test(text) || UNIFIED_DIFF_HUNK_HEADER_PATTERN.test(text)) {
		return true;
	}
	return UNIFIED_DIFF_OLD_FILE_PATTERN.test(text) && UNIFIED_DIFF_NEW_FILE_PATTERN.test(text);
}
