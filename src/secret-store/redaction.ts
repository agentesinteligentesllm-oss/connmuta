import { TELEGRAM_BOT_TOKEN_RE } from "../shared/secrets.js";

/**
 * The shared redactor (`secret-store/redaction.ts`, design §6, PT-08).
 *
 * `redactTokenShapes` is the single function every sink that can carry free text routes through:
 * `daemon/telegram.ts`'s error constructors (design §12's seam), `daemon/log.ts`, and every audit
 * and condition writer. A classified error may quote a request URL, and a Telegram Bot API URL
 * carries the token in its path — so the redactor is the layer that keeps PT-08 true regardless of
 * what any individual `catch` decides to include.
 *
 * **New code, not vendored** (design §12 has no row for `secret-store/*`), so the module begins with
 * its imports and carries no `Provenance:` header.
 *
 * **One pattern, not two.** The shape lives in `shared/secrets.ts` as {@link TELEGRAM_BOT_TOKEN_RE},
 * which the send-path backstop (`checkForSecrets`) also uses; this module derives its global form
 * from that regex's own `source` rather than restating the pattern, so the two can never drift.
 * `String.prototype.replace` needs the `g` flag to reach past the first match, and the shared
 * constant is deliberately flagless (a stateful global would make `test()` results depend on call
 * order for every consumer). Deriving `.source` is what bridges those two requirements without a
 * second literal.
 *
 * **It replaces every match, including non-token look-alikes.** `TELEGRAM_BOT_TOKEN_RE` is
 * `\d+:[A-Za-z0-9_-]{35}`, which also matches the `256:<35 hex>` tail of a `sha256:<hex>` roster
 * hash — B-27's warning. That is deliberate here: this is a general-purpose text redactor, and a
 * conservative over-replacement is the safe direction for its sinks. Where an unredacted hash
 * actually matters (the registry loader's digest comparison) the workaround sits at the call site,
 * not in this function (B-27).
 */

/** The literal a token-shaped match is replaced with (design §6). */
const REDACTED_PLACEHOLDER = "<redacted>";

/** Global form of {@link TELEGRAM_BOT_TOKEN_RE}, built from that regex's `source`. */
const TOKEN_SHAPE_GLOBAL_RE = new RegExp(TELEGRAM_BOT_TOKEN_RE.source, "g");

/** Replaces every token-shaped substring of `text` with `<redacted>`, leaving the rest untouched. */
export function redactTokenShapes(text: string): string {
	return text.replace(TOKEN_SHAPE_GLOBAL_RE, REDACTED_PLACEHOLDER);
}
