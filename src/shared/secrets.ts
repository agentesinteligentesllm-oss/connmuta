/**
 * Provenance: telegram-agent-bus src/secrets.ts @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 742bf4338505295b15f37d994e66e6d268d4fcba0fb5cc64c7458a80f2790bf6   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: (1) `export` added to TELEGRAM_BOT_TOKEN_RE so the token-shape validator
 * (`shared/token-shape.ts`, PR-08) and the redactor (`secret-store/redaction.ts`, PR-14) share
 * one regex definition instead of two copies that could drift apart.
 */

/** PEM-formatted private-key block, any algorithm (RSA, OPENSSH, EC, generic). */
const PEM_PRIVATE_KEY_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
/**
 * `.env`-style `KEY = value` assignment; the key name is checked separately against
 * {@link SENSITIVE_ENV_KEY_RE}.
 *
 * The `g` flag is load-bearing (ADR-12). Without it this was consumed via `.exec()`, which returns
 * only the FIRST match — and once ADR-05a's `normalizeBody` began collapsing every body to a single
 * line, "first match per line" became "first match in the whole message". A body reading
 * `x = 1 and AWS_SECRET_ACCESS_KEY = …` passed the backstop, because the scan stopped at `x`.
 */
const ENV_ASSIGNMENT_RE = /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\S+/g;
/** Key names that mark a `.env`-style assignment as secret-shaped (B5). */
const SENSITIVE_ENV_KEY_RE = /SECRET|TOKEN|KEY|PASSWORD/i;
/** Telegram bot-token shape: numeric bot id, colon, 35-char auth string. */
export const TELEGRAM_BOT_TOKEN_RE = /\d+:[A-Za-z0-9_-]{35}/;

/** The fixed set of rules {@link checkForSecrets} enforces — a pattern table, not a general classifier. */
export type SecretRule =
  | "pem_private_key_block"
  | "env_style_secret_assignment"
  | "telegram_bot_token_shape"
  | "configured_secret_marker";

export type SecretCheckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly rule: SecretRule; readonly message: string };

/**
 * Secret-pattern backstop for an outbound envelope `body` (design.md ADR-06
 * layer 6 / spec requirement B5). Matches a FIXED table of known secret
 * shapes — PEM private-key blocks, `.env`-style assignments whose key name
 * contains SECRET/TOKEN/KEY/PASSWORD, the Telegram bot-token shape, and any
 * operator-configured `secretMarkers` (from `config.json`) — and is
 * explicitly NOT a general secret classifier.
 *
 * On a match, the result names the rule that fired but NEVER includes the
 * matched text: echoing it would copy the secret into the tool result and
 * the session transcript, defeating the backstop's purpose.
 */
export function checkForSecrets(
  body: string,
  secretMarkers: readonly string[] = []
): SecretCheckResult {
  if (PEM_PRIVATE_KEY_RE.test(body)) {
    return {
      ok: false,
      rule: "pem_private_key_block",
      message: "Outbound payload contains a PEM-formatted private key block.",
    };
  }

  // `matchAll` over the whole body, not `exec` per line: the per-line split was already dead code
  // for the send path (normalizeBody leaves exactly one line), and it was the split that made the
  // single-match limitation look safe. Scanning every assignment is what the guarantee always claimed.
  for (const match of body.matchAll(ENV_ASSIGNMENT_RE)) {
    if (SENSITIVE_ENV_KEY_RE.test(match[1])) {
      return {
        ok: false,
        rule: "env_style_secret_assignment",
        message:
          "Outbound payload contains a .env-style assignment whose key name suggests a secret (SECRET/TOKEN/KEY/PASSWORD).",
      };
    }
  }

  if (TELEGRAM_BOT_TOKEN_RE.test(body)) {
    return {
      ok: false,
      rule: "telegram_bot_token_shape",
      message: "Outbound payload contains a string shaped like a Telegram bot token.",
    };
  }

  for (const marker of secretMarkers) {
    if (marker.length > 0 && body.includes(marker)) {
      return {
        ok: false,
        rule: "configured_secret_marker",
        message: "Outbound payload contains an operator-configured secret marker.",
      };
    }
  }

  return { ok: true };
}
