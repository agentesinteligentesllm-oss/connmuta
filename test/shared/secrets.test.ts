import { test } from "node:test";
import assert from "node:assert/strict";

import { checkForSecrets, TELEGRAM_BOT_TOKEN_RE, type SecretRule } from "../../src/shared/secrets.js";

// --- TELEGRAM_BOT_TOKEN_RE export (SEAM change, design §12: the validator (shared/token-shape.ts,
// PR-08) and the redactor (secret-store/redaction.ts, PR-14) share this one regex instead of
// redeclaring it, so the two definitions can never drift apart) ---

// The digit run is 7 digits — deliberately outside the 8-10 digit range that
// `test/security/repo-scan.test.ts`'s own stricter TOKEN_SHAPE_RE requires (PT-22), so this
// synthetic fixture exercises the shared regex's shape without tripping the repo-wide secret scan.
const FIXTURE_TOKEN = "1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg";

test("TELEGRAM_BOT_TOKEN_RE is exported and matches a fixture Telegram bot-token shape", () => {
  assert.equal(TELEGRAM_BOT_TOKEN_RE.test(FIXTURE_TOKEN), true);
});

// --- Table-driven reject cases (B5, T6, Threat: secret exfiltration) ---

const REJECT_CASES: Array<{ name: string; body: string; secret: string; rule: SecretRule }> = [
  {
    name: "PEM RSA private key block",
    body:
      "Here's the key you asked for:\n" +
      "-----BEGIN RSA PRIVATE KEY-----\n" +
      "MIIEowIBAAKCAQEA1c7NeverRealSecretBase64BlobHere0987654321==\n" +
      "-----END RSA PRIVATE KEY-----",
    secret: "MIIEowIBAAKCAQEA1c7NeverRealSecretBase64BlobHere0987654321==",
    rule: "pem_private_key_block",
  },
  {
    name: "PEM OpenSSH private key block",
    body: "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmU\n-----END OPENSSH PRIVATE KEY-----",
    secret: "b3BlbnNzaC1rZXktdjEAAAAABG5vbmU",
    rule: "pem_private_key_block",
  },
  {
    name: ".env-style assignment with SECRET in the key",
    body: "just pasting my local env:\nAPP_SECRET=s3cr3t-value-123",
    secret: "s3cr3t-value-123",
    rule: "env_style_secret_assignment",
  },
  {
    name: ".env-style assignment with TOKEN in the key",
    body: "API_TOKEN=sk-abcdef1234567890",
    secret: "sk-abcdef1234567890",
    rule: "env_style_secret_assignment",
  },
  {
    name: ".env-style assignment with KEY in the key",
    body: "STRIPE_KEY=rk_live_51AbCdEfGhIjKlMn",
    secret: "rk_live_51AbCdEfGhIjKlMn",
    rule: "env_style_secret_assignment",
  },
  {
    name: ".env-style assignment with PASSWORD in the key",
    body: "DB_PASSWORD=hunter2fallback",
    secret: "hunter2fallback",
    rule: "env_style_secret_assignment",
  },
  {
    name: "Telegram bot-token-shaped string",
    body: `use this bot token: ${FIXTURE_TOKEN}`,
    secret: FIXTURE_TOKEN,
    rule: "telegram_bot_token_shape",
  },
];

for (const { name, body, secret, rule } of REJECT_CASES) {
  test(`checkForSecrets rejects: ${name}`, () => {
    const result = checkForSecrets(body);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rule, rule);
      assert.ok(
        !result.message.includes(secret),
        "rejection message must never echo the matched secret text"
      );
    }
  });
}

// --- Clean payload passes ---

test("checkForSecrets passes a clean, ordinary prose payload", () => {
  const result = checkForSecrets("Deploying the staging build now, should be done in 10 minutes.");
  assert.equal(result.ok, true);
});

// --- Operator-configured secret markers (B5's third clause; secretMarkers sourced from config.json) ---

test("checkForSecrets rejects a body containing an operator-configured secret marker", () => {
  const result = checkForSecrets("shared the INTERNAL-SECRET value with the team", ["INTERNAL-SECRET"]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rule, "configured_secret_marker");
    assert.ok(!result.message.includes("INTERNAL-SECRET"));
  }
});

test("checkForSecrets does not flag a clean payload even when secretMarkers is non-empty", () => {
  const result = checkForSecrets("Deploying the staging build now.", ["INTERNAL-SECRET"]);
  assert.equal(result.ok, true);
});

// --- The rejection error never echoes the matched text (asserted explicitly, not only implicitly above) ---

test("rejection message never contains the raw secret substring for any matched rule", () => {
  for (const { body, secret } of REJECT_CASES) {
    const result = checkForSecrets(body);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        !result.message.includes(secret),
        `message for rule ${result.rule} must not contain the matched secret`
      );
    }
  }
});

// --- The bypass ADR-05a introduced without noticing (ADR-12) ---

test("an env-style secret is caught wherever it sits in the body, not only as the first assignment", () => {
  // `ENV_ASSIGNMENT_RE.exec()` is non-global, so it reported only the FIRST assignment on a line.
  // That was survivable while bodies could span lines and the scan looped over them — but ADR-05a's
  // `normalizeBody` collapses every body to ONE line before the backstop runs, which quietly reduced
  // the whole check to "inspect the first `=` in the message". Any benign assignment in front of a
  // real credential disarmed it.
  const SECRET = "AWS_SECRET_ACCESS_KEY = wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY";

  const alone = checkForSecrets(SECRET);
  assert.equal(alone.ok, false, "baseline: the assignment is detected on its own");

  const preceded = checkForSecrets(`Deploy is x = 1 and ${SECRET}`);
  assert.equal(preceded.ok, false, "a benign assignment in front must not disarm the scan");
  if (!preceded.ok) {
    assert.equal(preceded.rule, "env_style_secret_assignment");
  }
});

test("every assignment in a single normalized line is examined, not just the first two", () => {
  // Triangulation: the secret sits third, after two innocent assignments.
  const result = checkForSecrets("a = 1, b = 2, DATABASE_PASSWORD = hunter2correct");
  assert.equal(result.ok, false);
});
