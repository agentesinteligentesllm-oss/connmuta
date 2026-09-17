import { test } from "node:test";
import assert from "node:assert/strict";

import { parseProjectFile, type ProjectFileProblem } from "../../src/shared/project-file.js";
import { AUTHORIZATION_LITERAL } from "../../src/shared/token-shape.js";

// The digit run is 7 digits — deliberately outside the 8-10 digit range that
// `test/security/repo-scan.test.ts`'s own stricter TOKEN_SHAPE_RE requires (PT-22), so this
// synthetic fixture exercises the shared token shape without tripping the repo-wide secret scan.
// It is a placeholder invented for this test, never a production credential (AGENTS.md §3).
const FIXTURE_TOKEN = "1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg";

/** The canonical example from DATA-MODEL §1, placeholders only. */
function validFile(): Record<string, unknown> {
  return {
    schema_version: 1,
    project_id: "prj-example",
    group_id: -1001234567890,
    roster: [
      { agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" },
      { agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" },
    ],
    referee: "@alice-agent",
  };
}

/** A valid file with one top-level override, serialized as the CLI would receive it. */
function file(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...validFile(), ...overrides });
}

/** Parse `text` and return its problems, failing the test if the file was accepted. */
function reject(text: string): readonly ProjectFileProblem[] {
  const result = parseProjectFile(text);
  assert.equal(result.ok, false, "expected the file to be rejected");
  if (result.ok) {
    throw new Error("unreachable: the file was accepted");
  }
  return result.problems;
}

function accept(text: string) {
  const result = parseProjectFile(text);
  if (!result.ok) {
    assert.fail(`expected the file to load, got ${JSON.stringify(result.problems)}`);
  }
  return result.file;
}

// --- Requirement: Committed project file schema — Scenario: Valid file loads ---

test("a valid conmuta.json loads with every field typed per DATA-MODEL §1", () => {
  const loaded = accept(file());
  assert.equal(loaded.schema_version, 1);
  assert.equal(loaded.project_id, "prj-example");
  assert.equal(loaded.group_id, -1001234567890);
  assert.deepEqual(loaded.roster, [
    { agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" },
    { agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" },
  ]);
  assert.equal(loaded.referee, "@alice-agent");
});

test("the optional referee field may be absent", () => {
  const { referee: _referee, ...withoutReferee } = validFile();
  const loaded = accept(JSON.stringify(withoutReferee));
  assert.equal(loaded.project_id, "prj-example");
  assert.equal("referee" in loaded, false);
});

// --- Requirement: Committed project file schema — Scenario: Unknown key rejected ---

test("an unknown key is rejected, never stripped (strict schema, DATA-MODEL §1)", () => {
  const problems = reject(file({ extra_key: 1 }));
  assert.equal(problems.length, 1);
  assert.deepEqual(problems[0], { kind: "schema_invalid", field: "extra_key" });
});

test("every unknown key is named, not only the first", () => {
  const problems = reject(file({ extra_key: 1, another_extra: 2 }));
  const fields = problems.map((problem) => (problem.kind === "schema_invalid" ? problem.field : problem.kind));
  assert.deepEqual(fields.sort(), ["another_extra", "extra_key"]);
});

test("a rejected file never yields a parsed file: nothing is stripped through (non-vacuous)", () => {
  const result = parseProjectFile(file({ extra_key: 1 }));
  assert.equal(result.ok, false);
  assert.equal("file" in result, false, "a partial or stripped-down file must never be returned");
});

// --- Requirement: Committed project file schema — Scenario: Future schema_version refused ---

test("schema_version 2 is refused as an unsupported version, naming the found version", () => {
  const problems = reject(file({ schema_version: 2 }));
  assert.deepEqual(problems, [{ kind: "unsupported_schema_version", found: 2 }]);
});

test("a missing or non-numeric schema_version is a schema problem, not an upgrade path", () => {
  const { schema_version: _version, ...withoutVersion } = validFile();
  assert.deepEqual(reject(JSON.stringify(withoutVersion))[0], {
    kind: "schema_invalid",
    field: "schema_version",
  });
  assert.deepEqual(reject(file({ schema_version: "1" }))[0], {
    kind: "schema_invalid",
    field: "schema_version",
  });
});

// --- Malformed input ---

test("text that is not JSON at all is reported as invalid_json", () => {
  assert.deepEqual(reject("not json at all"), [{ kind: "invalid_json" }]);
});

test("empty text is reported as invalid_json", () => {
  assert.deepEqual(reject(""), [{ kind: "invalid_json" }]);
});

test("a top-level JSON array is refused and named at the document root", () => {
  assert.deepEqual(reject("[]"), [{ kind: "schema_invalid", field: "<root>" }]);
});

// --- Field rules (DATA-MODEL §1) ---

test("group_id must be a negative integer", () => {
  for (const group_id of [0, 1001234567890, -1001234567890.5]) {
    assert.deepEqual(reject(file({ group_id }))[0], { kind: "schema_invalid", field: "group_id" });
  }
});

test("project_id must match the slug pattern (D-06: slug, not a UUID)", () => {
  for (const project_id of ["AB", "ab", "UPPER-case", `a${"b".repeat(41)}`, "prj example"]) {
    assert.deepEqual(reject(file({ project_id }))[0], { kind: "schema_invalid", field: "project_id" });
  }
});

test("roster must carry at least one entry", () => {
  assert.deepEqual(reject(file({ roster: [] }))[0], { kind: "schema_invalid", field: "roster" });
});

test("roster must be an array", () => {
  assert.deepEqual(reject(file({ roster: {} }))[0], { kind: "schema_invalid", field: "roster" });
});

test("agent_id must be a valid logical agent id, named per entry (v1 did not enforce this)", () => {
  for (const agent_id of ["alice-agent", "@Alice-Agent", "@agent id"]) {
    const problems = reject(
      file({ roster: [{ agent_id, user_id: 100000001, username: "alice_example_bot" }] }),
    );
    assert.deepEqual(problems[0], { kind: "schema_invalid", field: "roster[0].agent_id" });
  }
});

test("user_id must be a positive integer, named per entry", () => {
  for (const user_id of [0, -1, 1.5]) {
    const problems = reject(
      file({ roster: [{ agent_id: "@alice-agent", user_id, username: "alice_example_bot" }] }),
    );
    assert.deepEqual(problems[0], { kind: "schema_invalid", field: "roster[0].user_id" });
  }
});

test("a roster entry missing username is named", () => {
  const problems = reject(file({ roster: [{ agent_id: "@alice-agent", user_id: 100000001 }] }));
  assert.deepEqual(problems[0], { kind: "schema_invalid", field: "roster[0].username" });
});

test("an unknown key inside a roster entry is named with its full path", () => {
  const problems = reject(
    file({ roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: "x", role: "lead" }] }),
  );
  assert.deepEqual(problems[0], { kind: "schema_invalid", field: "roster[0].role" });
});

test("duplicate agent_id across entries is rejected (DATA-MODEL §1: agent_id unique)", () => {
  const problems = reject(
    file({
      roster: [
        { agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" },
        { agent_id: "@alice-agent", user_id: 100000002, username: "other_bot" },
      ],
    }),
  );
  assert.deepEqual(problems[0], { kind: "schema_invalid", field: "roster[1].agent_id" });
});

test("duplicate user_id across entries is rejected (DATA-MODEL §1: user_id unique)", () => {
  const problems = reject(
    file({
      roster: [
        { agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" },
        { agent_id: "@bob-agent", user_id: 100000001, username: "bob_example_bot" },
      ],
    }),
  );
  assert.deepEqual(problems[0], { kind: "schema_invalid", field: "roster[1].user_id" });
});

test("referee must be a roster member (DATA-MODEL §1)", () => {
  assert.deepEqual(reject(file({ referee: "@carol-agent" }))[0], {
    kind: "schema_invalid",
    field: "referee",
  });
});

test("referee naming a roster member is accepted", () => {
  assert.equal(accept(file({ referee: "@bob-agent" })).referee, "@bob-agent");
});

// --- Requirement: Token-shape validator — identifiers only, never content that leaks ---

test("a token-shaped value is rejected, names the offending field, and never echoes the match", () => {
  const text = file({
    roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: `bot ${FIXTURE_TOKEN}` }],
  });
  const problems = reject(text);
  assert.deepEqual(problems[0], {
    kind: "forbidden_content",
    field: "roster[0].username",
    rule: "telegram_bot_token_shape",
  });
  assert.equal(
    JSON.stringify(problems).includes(FIXTURE_TOKEN),
    false,
    "the problem must never carry the matched text: this result reaches logs and terminals",
  );
});

test("the offending field is named for the entry that actually carries it", () => {
  const text = file({
    roster: [
      { agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" },
      { agent_id: "@bob-agent", user_id: 100000002, username: `bot ${FIXTURE_TOKEN}` },
    ],
  });
  assert.deepEqual(reject(text)[0], {
    kind: "forbidden_content",
    field: "roster[1].username",
    rule: "telegram_bot_token_shape",
  });
});

test("an Authorization literal in any string value is rejected", () => {
  const problems = reject(
    file({ roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: AUTHORIZATION_LITERAL }] }),
  );
  assert.deepEqual(problems[0], {
    kind: "forbidden_content",
    field: "roster[0].username",
    rule: "authorization_literal",
  });
});

test("a string value containing a path separator is rejected (PT-06)", () => {
  for (const username of ["a/b", "a\\b"]) {
    const problems = reject(
      file({ roster: [{ agent_id: "@alice-agent", user_id: 100000001, username }] }),
    );
    assert.deepEqual(problems[0], {
      kind: "forbidden_content",
      field: "roster[0].username",
      rule: "path_separator",
    });
  }
});

test("a Windows drive prefix is rejected and reported as a drive prefix, not a separator (PT-06)", () => {
  const problems = reject(
    file({ roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: "C:\\project" }] }),
  );
  assert.deepEqual(problems[0], {
    kind: "forbidden_content",
    field: "roster[0].username",
    rule: "drive_prefix",
  });
});

test("a clean identifiers-only file yields no forbidden-content findings at all", () => {
  const result = parseProjectFile(file());
  assert.equal(result.ok, true);
});

test("structural problems are reported before content problems, and both are reported", () => {
  const problems = reject(
    file({ extra_key: 1, roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: "a/b" }] }),
  );
  assert.equal(problems[0]?.kind, "schema_invalid", "the document's structure is reported first");
  assert.deepEqual(problems[1], {
    kind: "forbidden_content",
    field: "roster[0].username",
    rule: "path_separator",
  });
});

// --- Requirement: Token-shape validator — a key is document text too (PT-05) ---

test("a token-shaped top-level key is rejected by rule and never echoed", () => {
  const problems = reject(file({ [FIXTURE_TOKEN]: 1 }));
  assert.equal(
    JSON.stringify(problems).includes(FIXTURE_TOKEN),
    false,
    "a key pasted in token position must not be echoed: this result reaches logs and terminals",
  );
  assert.deepEqual(problems, [
    { kind: "schema_invalid", field: "<redacted>" },
    { kind: "forbidden_content", field: "<root>", rule: "telegram_bot_token_shape" },
  ]);
});

test("a token-shaped key inside a roster entry is rejected and never echoed", () => {
  const problems = reject(
    file({
      roster: [
        { agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot", [FIXTURE_TOKEN]: 1 },
      ],
    }),
  );
  assert.equal(JSON.stringify(problems).includes(FIXTURE_TOKEN), false);
  assert.deepEqual(problems[0], { kind: "schema_invalid", field: "roster[0].<redacted>" });
  assert.deepEqual(problems[1], { kind: "forbidden_content", field: "roster[0]", rule: "telegram_bot_token_shape" });
});

test("an Authorization literal in key position is rejected by rule and never echoed", () => {
  const problems = reject(file({ [AUTHORIZATION_LITERAL]: 1 }));
  assert.equal(JSON.stringify(problems).includes(AUTHORIZATION_LITERAL), false);
  assert.deepEqual(problems, [
    { kind: "schema_invalid", field: "<redacted>" },
    { kind: "forbidden_content", field: "<root>", rule: "authorization_literal" },
  ]);
});

test("a forbidden value under a token-shaped key is named without the key being echoed", () => {
  const problems = reject(file({ [FIXTURE_TOKEN]: "a/b" }));
  assert.equal(
    JSON.stringify(problems).includes(FIXTURE_TOKEN),
    false,
    "the key-derived path of a nested finding must not carry the key",
  );
  assert.deepEqual(problems, [
    { kind: "schema_invalid", field: "<redacted>" },
    { kind: "forbidden_content", field: "<root>", rule: "telegram_bot_token_shape" },
    { kind: "forbidden_content", field: "<redacted>", rule: "path_separator" },
  ]);
});

test("redaction is scoped to the forbidden key: a benign unknown key is still named", () => {
  const problems = reject(file({ extra_key: 1, [FIXTURE_TOKEN]: 2 }));
  const fields = problems.map((problem) => (problem.kind === "schema_invalid" ? problem.field : problem.kind));
  assert.deepEqual(fields, ["extra_key", "<redacted>", "forbidden_content"]);
  assert.equal(JSON.stringify(problems).includes(FIXTURE_TOKEN), false);
});

test("a value carrying both the Authorization literal and a token shape is reported as the literal", () => {
  const problems = reject(
    file({ roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: `x ${FIXTURE_TOKEN} Authorization` }] }),
  );
  assert.deepEqual(problems[0], {
    kind: "forbidden_content",
    field: "roster[0].username",
    rule: "authorization_literal",
  });
});

// --- The loader applies the whole shared secret table, not only the token shape (JD-A-002) ---

test("a PEM private-key block in a schema-valid field is refused without echoing it", () => {
  const pem = "-----BEGIN RSA PRIVATE KEY-----";
  const problems = reject(
    file({ roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: pem }] }),
  );
  assert.deepEqual(problems[0], {
    kind: "forbidden_content",
    field: "roster[0].username",
    rule: "pem_private_key_block",
  });
  assert.equal(JSON.stringify(problems).includes(pem), false);
});

test("a .env-style secret assignment in a schema-valid field is refused", () => {
  const problems = reject(
    file({ roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: "BOT_TOKEN = 1234567890abcdef" }] }),
  );
  assert.deepEqual(problems[0], {
    kind: "forbidden_content",
    field: "roster[0].username",
    rule: "env_style_secret_assignment",
  });
});

test("the Authorization literal is refused in any casing (RFC 9110 §5.1 hardening)", () => {
  for (const value of ["authorization: Bearer opaque", "AUTHORIZATION: Bearer opaque", "Authorization: Bearer opaque"]) {
    const problems = reject(
      file({ roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: value }] }),
    );
    assert.deepEqual(problems[0], {
      kind: "forbidden_content",
      field: "roster[0].username",
      rule: "authorization_literal",
    });
  }
});

// --- A pathological document is refused, never a crash (JD-B-002) ---

/**
 * A 20000-level nested object, built by concatenation: `JSON.stringify` would recurse into it and
 * fail before the parser ever saw the document.
 */
function deeplyNestedDocument(depth: number): string {
  const open = '{"a":'.repeat(depth);
  const close = "}".repeat(depth);
  return `{"schema_version":1,"project_id":"prj-example","group_id":-1,"roster":[{"agent_id":"@alice-agent","user_id":100000001,"username":${open}1${close}}]}`;
}

test("a 20000-level document is refused instead of crashing the content walk", () => {
  const result = parseProjectFile(deeplyNestedDocument(20_000));
  assert.equal(result.ok, false, "a document this deep cannot satisfy the strict schema");
});
