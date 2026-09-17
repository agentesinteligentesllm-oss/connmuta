import { checkForSecrets, TELEGRAM_BOT_TOKEN_RE, type SecretRule } from "./secrets.js";

/**
 * Literal that must never appear in a committed project file (DATA-MODEL §1 "Must never contain",
 * PT-05). Exported so the field-level walk in `project-file.ts` shares this one spelling instead of
 * hard-coding a second copy that could drift from the raw-text scan below.
 */
export const AUTHORIZATION_LITERAL = "Authorization";

/**
 * The two shapes this module scans for by name — the bot-token shape and the `Authorization`
 * literal (design.md:150, PT-05).
 *
 * Deliberately narrower than {@link SecretRule}: the PEM / `.env` / operator-marker classes already
 * have an owner (`shared/secrets.ts`, the outbound backstop), and redeclaring them here would be the
 * two-copies-that-drift defect the shared regex export exists to prevent.
 */
export type TokenShapeRule = "telegram_bot_token_shape" | "authorization_literal";

/** What {@link findTokenShapes} reports: a count, never the match (design.md:150). */
export interface TokenShapeFindings {
	readonly count: number;
}

/**
 * Occurrences of the shared bot-token shape in `text`.
 *
 * The pattern is re-compiled with the global flag because the shared export is not global: a
 * `g`-flagged regex carries `lastIndex` state across calls, which would make a shared export
 * order-dependent for every other caller. A fresh copy per call keeps this scan stateless.
 */
function countTokenShapes(text: string): number {
	return text.match(new RegExp(TELEGRAM_BOT_TOKEN_RE.source, "g"))?.length ?? 0;
}

/** Occurrences of the `Authorization` literal in `text`, counted without a regex. */
function countAuthorizationLiterals(text: string): number {
	return text.split(AUTHORIZATION_LITERAL).length - 1;
}

/**
 * The first forbidden shape present in `text`, in the fixed order token shape then
 * `Authorization` literal. Used only to name the rule in a rejection message; the public scan
 * returns a count so that no caller can be handed the matched text.
 */
function firstTokenShapeRule(text: string): TokenShapeRule | undefined {
	if (countTokenShapes(text) > 0) return "telegram_bot_token_shape";
	if (countAuthorizationLiterals(text) > 0) return "authorization_literal";
	return undefined;
}

/**
 * Scan any text for the bot-token shape and the `Authorization` literal.
 *
 * Returns a count and nothing else, by construction: this result reaches logs, terminals and tool
 * outputs, so carrying the match would copy the very secret the scan exists to keep out
 * (DATA-MODEL §1 "Must never contain"; design.md:150).
 */
export function findTokenShapes(text: string): TokenShapeFindings {
	return { count: countTokenShapes(text) + countAuthorizationLiterals(text) };
}

/**
 * Reject `text` unless it is free of every forbidden shape this repository knows about.
 *
 * Stricter than {@link findTokenShapes} on purpose, and documented as such: it first applies the two
 * shapes above, then delegates to the shared secret table ({@link checkForSecrets}) so a raw-text
 * scan — the registry's pre-parse R5 scan (design.md:143) and the CLI's non-JSON fallback — cannot
 * under-reject just because a PEM block or a `.env`-style assignment is not a bot token.
 *
 * Throws an `Error` whose message names the rule and never the matched text.
 */
export function assertNoTokenShape(text: string, secretMarkers: readonly string[] = []): void {
	const rule = firstTokenShapeRule(text);
	if (rule !== undefined) {
		throw new Error(`Content carries a forbidden shape (rule: ${rule}).`);
	}
	const shared = checkForSecrets(text, secretMarkers);
	if (!shared.ok) {
		throw new Error(`Content carries a forbidden shape (rule: ${shared.rule}): ${shared.message}`);
	}
}
