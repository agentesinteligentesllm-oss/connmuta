import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { EXIT_USAGE, EXIT_VALIDATION_FAILED } from "../../src/shared/constants.js";
import { validateText } from "../../src/cli/validate.js";

// dist/test/cli/validate.test.js -> repo root is three levels up.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CLI_ENTRY = join(REPO_ROOT, "dist", "src", "cli", "main.js");

// The digit run is 7 digits — deliberately outside the 8-10 digit range that
// `test/security/repo-scan.test.ts`'s own stricter TOKEN_SHAPE_RE requires (PT-22), so this
// synthetic fixture exercises the shared token shape without tripping the repo-wide secret scan.
// It is a placeholder invented for this test, never a production credential (AGENTS.md §3).
const FIXTURE_TOKEN = "1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg";

const VALID_FILE = JSON.stringify({
  schema_version: 1,
  project_id: "prj-example",
  group_id: -1001234567890,
  roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" }],
});

/** The valid file with the token shape seeded into the named field. */
function seededFile(field: "username" | "project_id"): string {
  const file = {
    schema_version: 1,
    project_id: field === "project_id" ? FIXTURE_TOKEN : "prj-example",
    group_id: -1001234567890,
    roster: [
      {
        agent_id: "@alice-agent",
        user_id: 100000001,
        username: field === "username" ? `bot ${FIXTURE_TOKEN}` : "alice_example_bot",
      },
    ],
  };
  return JSON.stringify(file);
}

/** Run the real CLI as a child process, the way the pre-commit one-liner does. */
function runCli(...args: readonly string[]) {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    input: "",
    encoding: "utf8",
    shell: false,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    combined: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/** Run the real CLI with text on stdin, the documented `git show :conmuta.json | conmuta validate --stdin`. */
function runCliStdin(text: string) {
  const result = spawnSync(process.execPath, [CLI_ENTRY, "validate", "--stdin"], {
    input: text,
    encoding: "utf8",
    shell: false,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    combined: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

// --- validateText: the pure command core ---

test("validateText accepts an identifiers-only project file and reports nothing on stderr", () => {
  const report = validateText(VALID_FILE, "conmuta.json");
  assert.equal(report.exitCode, 0);
  assert.deepEqual(report.err, []);
  assert.equal(report.out.length, 1);
});

test("validateText rejects a token-shaped value, names the field, and never echoes the match", () => {
  const report = validateText(seededFile("username"), "conmuta.json");
  assert.equal(report.exitCode, EXIT_VALIDATION_FAILED);
  assert.equal(report.err.length, 1);
  assert.match(report.err[0] ?? "", /roster\[0\]\.username/);
  assert.equal(
    report.err.join("\n").includes(FIXTURE_TOKEN),
    false,
    "the rejection must never carry the matched text: it goes to a terminal and (F2) to doctor",
  );
  assert.equal(report.out.length, 0);
});

test("validateText rejects a token shape in a top-level field too", () => {
  const report = validateText(seededFile("project_id"), "conmuta.json");
  assert.equal(report.exitCode, EXIT_VALIDATION_FAILED);
  assert.match(report.err[0] ?? "", /project_id/);
  assert.equal(report.err.join("\n").includes(FIXTURE_TOKEN), false);
});

test("validateText refuses a future schema_version with an explicit upgrade message", () => {
  const report = validateText(VALID_FILE.replace('"schema_version":1', '"schema_version":2'), "conmuta.json");
  assert.equal(report.exitCode, EXIT_VALIDATION_FAILED);
  assert.match(report.err.join("\n"), /Upgrade/);
  assert.match(report.err.join("\n"), /2/);
});

test("validateText names an unknown key instead of stripping it", () => {
  const report = validateText(VALID_FILE.replace('"group_id"', '"unexpected_key":1,"group_id"'), "conmuta.json");
  assert.equal(report.exitCode, EXIT_VALIDATION_FAILED);
  assert.match(report.err.join("\n"), /unexpected_key/);
});

test("validateText still catches a token shape inside a document that is not valid JSON", () => {
  const report = validateText(`{ "project_id": "${FIXTURE_TOKEN}", oops`, "broken.json");
  assert.equal(report.exitCode, EXIT_VALIDATION_FAILED);
  assert.equal(report.err.join("\n").includes(FIXTURE_TOKEN), false);
  assert.match(report.err.join("\n"), /broken\.json/);
  // The raw scan is the whole reason this path exists, so the two properties both judges found
  // unpinned in round 1 are asserted here: that the forbidden line is present at all (deleting the
  // scan left every other assertion above true, because `parseProjectFile` reports `invalid_json` on
  // its own), and that it comes **before** the parse complaint, which is the order a hook reader sees.
  assert.match(report.err.join("\n"), /forbidden content in <document>/);
  assert.equal(report.err[0]?.includes("forbidden content in <document>"), true);
  assert.equal(report.err[0]?.includes("not valid JSON"), false);
});

test("a malformed document whose only forbidden shape is an Authorization header is named as that rule", () => {
  const report = validateText(`{ "h": "authorization: Bearer opaque", oops`, "broken.json");
  assert.equal(report.exitCode, EXIT_VALIDATION_FAILED);
  assert.match(report.err.join("\n"), /rule: authorization_literal/);
  assert.equal(
    report.err.join("\n").includes("telegram_bot_token_shape"),
    false,
    "the one API counts two shapes: the rule that fired has to be recovered, not assumed",
  );
});

test("a malformed document carrying a token shape is named as the token shape", () => {
  const report = validateText(`{ "project_id": "${FIXTURE_TOKEN}", oops`, "broken.json");
  assert.match(report.err.join("\n"), /rule: telegram_bot_token_shape/);
});

test("validateText reports a clean but malformed document as invalid JSON", () => {
  const report = validateText("{ not json", "broken.json");
  assert.equal(report.exitCode, EXIT_VALIDATION_FAILED);
  assert.match(report.err.join("\n"), /JSON/);
});

test("a clean file never reports the usage code: usage is a different failure class", () => {
  assert.notEqual(EXIT_USAGE, EXIT_VALIDATION_FAILED);
});

// --- The CLI at the process boundary (design §15 "Integration": a real child process) ---

test("the CLI entry point is built before this integration test runs", () => {
  assert.ok(
    existsSync(CLI_ENTRY),
    `expected the built CLI at ${CLI_ENTRY}: run 'npm run build' first, a stale dist fakes results`,
  );
});

test("conmuta validate --stdin exits EXIT_VALIDATION_FAILED on a token-shaped match and never echoes it", () => {
  const run = runCliStdin(seededFile("username"));
  assert.equal(run.status, EXIT_VALIDATION_FAILED);
  assert.equal(
    run.combined.includes(FIXTURE_TOKEN),
    false,
    "the process boundary is the only place a token could leak into a message: it must not",
  );
  assert.match(run.stderr, /roster\[0\]\.username/);
});

test("conmuta validate --stdin exits 0 on an identifiers-only file", () => {
  const run = runCliStdin(VALID_FILE);
  assert.equal(run.status, 0);
  assert.equal(run.combined.includes(FIXTURE_TOKEN), false);
});

test("conmuta validate <path> exits 0 on an identifiers-only file", () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-validate-"));
  try {
    const path = join(dir, "conmuta.json");
    writeFileSync(path, VALID_FILE);
    const run = runCli("validate", path);
    assert.equal(run.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a refused file is never renamed, rewritten or accompanied by a repair copy (DATA-MODEL §1)", () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-validate-"));
  try {
    const path = join(dir, "conmuta.json");
    const badText = seededFile("username");
    writeFileSync(path, badText);
    const before = { bytes: readFileSync(path), entries: readdirSync(dir).sort() };

    const run = runCli("validate", path);

    assert.equal(run.status, EXIT_VALIDATION_FAILED);
    assert.deepEqual(readdirSync(dir).sort(), before.entries, "no quarantine or repair copy may appear");
    assert.deepEqual(readFileSync(path), before.bytes, "the refused file must be byte-identical afterwards");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
