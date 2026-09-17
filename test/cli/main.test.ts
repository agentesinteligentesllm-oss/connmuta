import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { runCli, type CliIo } from "../../src/cli/main.js";
import { EXIT_USAGE, EXIT_VALIDATION_FAILED, PRODUCT_NAME } from "../../src/shared/constants.js";

// dist/test/cli/main.test.js -> repo root is three levels up.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CLI_ENTRY = join(REPO_ROOT, "dist", "src", "cli", "main.js");

const VALID_FILE = JSON.stringify({
  schema_version: 1,
  project_id: "prj-example",
  group_id: -1001234567890,
  roster: [{ agent_id: "@alice-agent", user_id: 100000001, username: "alice_example_bot" }],
});

interface CapturedIo {
  readonly io: CliIo;
  readonly out: string[];
  readonly err: string[];
}

/** An in-memory process surface: the dispatcher never needs the real one to be exercised. */
function makeIo(files: Record<string, string> = {}, stdin = ""): CapturedIo {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      readFile: (path) => {
        const content = files[path];
        if (content === undefined) {
          throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        }
        return content;
      },
      readStdin: () => stdin,
    },
    out,
    err,
  };
}

// --- The single bin entry (D-09: every product-shaped name derives from one constant) ---

test("package.json declares exactly one bin entry and it resolves to the built CLI", () => {
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    bin?: Record<string, string>;
  };
  assert.deepEqual(Object.keys(packageJson.bin ?? {}), [PRODUCT_NAME]);
  const entry = packageJson.bin?.[PRODUCT_NAME];
  assert.equal(entry, "dist/src/cli/main.js");
  assert.ok(existsSync(CLI_ENTRY), `expected the built CLI at ${CLI_ENTRY}: run 'npm run build' first`);
});

// --- Importing the module must never run the CLI ---

test("importing the CLI module does not execute it", () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-main-"));
  try {
    const probe = join(dir, "probe.mjs");
    writeFileSync(probe, `await import(${JSON.stringify(pathToFileURL(CLI_ENTRY).href)});\n`);
    const result = spawnSync(process.execPath, [probe], { encoding: "utf8", shell: false });
    assert.equal(result.status, 0, `importing the module must not fail: ${result.stderr}`);
    assert.equal(result.stdout, "", "importing the module must not write to stdout");
    assert.equal(result.stderr, "", "importing the module must not print usage or an error");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Dispatcher: exactly one wired subcommand, and every misuse is a usage error ---

test("`validate <path>` on a valid file exits 0", () => {
  const captured = makeIo({ "/tmp/conmuta.json": VALID_FILE });
  assert.equal(runCli(["validate", "/tmp/conmuta.json"], captured.io), 0);
  assert.equal(captured.err.length, 0);
  assert.equal(captured.out.length, 1);
});

test("`validate --stdin` reads the piped text", () => {
  const captured = makeIo({}, VALID_FILE);
  assert.equal(runCli(["validate", "--stdin"], captured.io), 0);
  assert.equal(captured.err.length, 0);
});

test("`validate --stdin` on a token-seeded file exits with the validation code and names the field", () => {
  const seeded = VALID_FILE.replace("alice_example_bot", "bot 1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg");
  const captured = makeIo({}, seeded);
  assert.equal(runCli(["validate", "--stdin"], captured.io), EXIT_VALIDATION_FAILED);
  assert.match(captured.err.join("\n"), /roster\[0\]\.username/);
  assert.equal(captured.err.join("\n").includes("1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg"), false);
});

test("no subcommand prints usage and exits with EXIT_USAGE", () => {
  const captured = makeIo();
  assert.equal(runCli([], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /usage:/);
  assert.equal(captured.out.length, 0);
});

test("an unknown subcommand is a usage error, never a silent success", () => {
  const captured = makeIo();
  assert.equal(runCli(["frobnicate"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`validate` without a target is a usage error", () => {
  const captured = makeIo();
  assert.equal(runCli(["validate"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`validate` with both a path and --stdin is a usage error, never an ambiguous read", () => {
  const captured = makeIo({ "/tmp/conmuta.json": VALID_FILE }, VALID_FILE);
  assert.equal(runCli(["validate", "/tmp/conmuta.json", "--stdin"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("an unknown flag is a usage error", () => {
  const captured = makeIo();
  assert.equal(runCli(["validate", "--frobnicate"], captured.io), EXIT_USAGE);
});

test("an unreadable path is a usage error that names the path", () => {
  const captured = makeIo();
  assert.equal(runCli(["validate", "/tmp/absent-conmuta.json"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /absent-conmuta\.json/);
});

test("a subcommand reserved for a later slice is a usage error, not a stub that pretends to work", () => {
  for (const reserved of ["daemon", "mcp", "migrate-v1"]) {
    const captured = makeIo();
    assert.equal(runCli([reserved], captured.io), EXIT_USAGE);
    assert.match(captured.err.join("\n"), /usage:/);
  }
});

test("the usage line names the one command this build wires", () => {
  const captured = makeIo();
  runCli([], captured.io);
  assert.match(captured.err.join("\n"), /validate/);
});
