import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TELEGRAM_BOT_TOKEN_RE,
} from "../../src/shared/secrets.js";
import {
  AUTHORIZATION_LITERAL,
  assertNoTokenShape,
  findTokenShapes,
} from "../../src/shared/token-shape.js";

// The digit run is 7 digits — deliberately outside the 8-10 digit range that
// `test/security/repo-scan.test.ts`'s own stricter TOKEN_SHAPE_RE requires (PT-22), so this
// synthetic fixture exercises the shared token shape without tripping the repo-wide secret scan.
// It is a placeholder invented for this test, never a production credential (AGENTS.md §3).
const FIXTURE_TOKEN = "1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg";

/** A same-shape, different-value token, to prove the scan counts occurrences rather than boolean-ising. */
const SECOND_FIXTURE_TOKEN = "7654321:ZzYyXxWwVvUuTtSsRrQqPpOoNnMmLlKkJjIi";

test("the fixture really is the shared token shape this module scans for (non-vacuous)", () => {
  assert.equal(TELEGRAM_BOT_TOKEN_RE.test(FIXTURE_TOKEN), true);
  assert.equal(TELEGRAM_BOT_TOKEN_RE.test(SECOND_FIXTURE_TOKEN), true);
});

// --- findTokenShapes: the shape-only count, never the match (design.md:150) ---

test("findTokenShapes counts a token-shaped string without returning any part of it", () => {
  const findings = findTokenShapes(`{"username":"${FIXTURE_TOKEN}"}`);
  assert.equal(findings.count, 1);
  assert.equal(
    JSON.stringify(findings).includes(FIXTURE_TOKEN),
    false,
    "the scan result must never carry the matched text: echoing it would copy the secret into a report",
  );
});

test("findTokenShapes reports zero for identifiers-only content", () => {
  const findings = findTokenShapes(
    '{"schema_version":1,"project_id":"prj-example","group_id":-1001234567890}',
  );
  assert.equal(findings.count, 0);
});

test("findTokenShapes counts every occurrence, not just the first", () => {
  const findings = findTokenShapes(`${FIXTURE_TOKEN} and ${SECOND_FIXTURE_TOKEN}`);
  assert.equal(findings.count, 2);
});

test("findTokenShapes treats the Authorization literal as a forbidden shape", () => {
  const findings = findTokenShapes('{"headers":{"x":"Authorization: Bearer nothing-secret"}}');
  assert.equal(findings.count, 1);
  assert.equal(AUTHORIZATION_LITERAL, "Authorization");
});

test("findTokenShapes counts both a token shape and an Authorization literal in one text", () => {
  const findings = findTokenShapes(`${AUTHORIZATION_LITERAL} ${FIXTURE_TOKEN}`);
  assert.equal(findings.count, 2);
});

test("findTokenShapes is pure: the same input yields the same count and the input is untouched", () => {
  const text = `${FIXTURE_TOKEN}`;
  const first = findTokenShapes(text);
  const second = findTokenShapes(text);
  assert.deepEqual(first, second);
  assert.equal(text, FIXTURE_TOKEN);
});

// --- assertNoTokenShape: the rejecting convenience ---

test("assertNoTokenShape throws on a token-shaped string and never echoes it", () => {
  assert.throws(
    () => assertNoTokenShape(`username=${FIXTURE_TOKEN}`),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message.includes(FIXTURE_TOKEN),
        false,
        "the rejection message must name the rule, never the matched text",
      );
      return true;
    },
  );
});

test("assertNoTokenShape throws on the Authorization literal, naming the rule", () => {
  assert.throws(() => assertNoTokenShape(`{"h":"${AUTHORIZATION_LITERAL}"}`), /authorization_literal/);
});

test("assertNoTokenShape accepts identifiers-only content", () => {
  assert.doesNotThrow(() => assertNoTokenShape('{"project_id":"prj-example"}'));
});

// --- The assertion is deliberately stricter than the count: it reuses the shared secret table ---

test("assertNoTokenShape rejects a PEM private-key block (shared secret table, reused not copied)", () => {
  assert.throws(() => assertNoTokenShape("-----BEGIN RSA PRIVATE KEY-----"), /private key/i);
});

test("assertNoTokenShape rejects a .env-style secret assignment whose key name suggests a secret", () => {
  assert.throws(() => assertNoTokenShape("BOT_TOKEN = 1234567890abcdef"), /\.env-style/);
});

test("assertNoTokenShape rejects an operator-configured secret marker passed by the caller", () => {
  assert.throws(
    () => assertNoTokenShape("carrying SYNTHETIC-OPERATOR-MARKER here", ["SYNTHETIC-OPERATOR-MARKER"]),
    /configured secret marker/,
  );
});

test("assertNoTokenShape does not reject ordinary prose", () => {
  assert.doesNotThrow(() => assertNoTokenShape("the roster names two agents and no more"));
});
