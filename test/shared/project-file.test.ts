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
    rule: "token_shape",
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
    rule: "token_shape",
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
