import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { runCli, type CliIo } from "../../src/cli/main.js";
import { EXIT_NODE_FLOOR, EXIT_UNBOUND_PROJECT, EXIT_USAGE, EXIT_VALIDATION_FAILED, PRODUCT_NAME } from "../../src/shared/constants.js";

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

// ADR-0012 remediation 2 pins the shebang with an assertion over the built bundle, because the
// failure mode is exit 0 with zero bytes on both streams. CI runs windows-latest only, where the
// npm shim invokes node explicitly and masks the defect (`.github/workflows/ci.yml`), so this
// assertion is the only thing that can fail: it reads the emitted file, not the source.
test("the built CLI entry starts with a shebang so a POSIX bin invocation reaches the dispatcher", () => {
  assert.ok(existsSync(CLI_ENTRY), `expected the built CLI at ${CLI_ENTRY}: run 'npm run build' first`);
  const firstLine = readFileSync(CLI_ENTRY, "utf8").split("\n", 1)[0];
  assert.equal(
    firstLine,
    "#!/usr/bin/env node",
    "without it the `conmuta` bin exits 0 with no output on POSIX (ADR-0012)",
  );
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

test("the usage line names the one command this build wires, and only the forms it accepts", () => {
  const captured = makeIo();
  runCli([], captured.io);
  const text = captured.err.join("\n");
  assert.match(text, /validate/);
  // The program's own text must describe the program: the requirement writes the target as optional
  // (`conmuta validate [<path> | --stdin]`), but this build refuses a bare invocation on purpose, so
  // advertising an optional target would promise a form that exits 2 (JD-A-002, disclosed).
  assert.match(text, /validate <path> \| --stdin/);
  assert.match(text, /daemon stop \[--home <dir>\]/);
  assert.match(text, /mcp --project <id>/);
  assert.equal(text.includes("[<path>"), false, "the usage text must not advertise an optional target");
});

// --- daemon stop subcommand dispatch ---

test("`daemon` with an unknown subcommand is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["daemon", "start"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown daemon subcommand 'start'/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`daemon stop` with an unknown option is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["daemon", "stop", "--verbose"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown option '--verbose'/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`daemon stop` with --home missing its argument is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["daemon", "stop", "--home"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /--home requires a directory/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`daemon stop` with extra positional arguments is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["daemon", "stop", "unexpected-arg"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unexpected argument 'unexpected-arg'/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`daemon stop` invokes stopDaemon and returns its exit code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-cli-stop-"));
  try {
    const captured = makeIo();
    const result = await runCli(["daemon", "stop", "--home", dir], captured.io);
    assert.equal(result, 1);
    assert.match(captured.err.join("\n"), /not running/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- mcp subcommand dispatch ---

test("`mcp` without --project is a usage error naming the missing flag", () => {
  const captured = makeIo();
  assert.equal(runCli(["mcp"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /mcp requires --project <id>/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`mcp --project` with no value is a usage error", () => {
  const captured = makeIo();
  assert.equal(runCli(["mcp", "--project"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /--project requires a value/);
});

test("`mcp --project=` with an empty value is a usage error", () => {
  const captured = makeIo();
  assert.equal(runCli(["mcp", "--project="], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /--project requires a value/);
});

test("`mcp` with an unknown option is a usage error", () => {
  const captured = makeIo();
  assert.equal(runCli(["mcp", "--verbose"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown option '--verbose'/);
});

test("`mcp` with an unexpected positional argument is a usage error", () => {
  const captured = makeIo();
  assert.equal(runCli(["mcp", "extra-arg"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unexpected argument 'extra-arg'/);
});

// `daemon stop`'s own dispatch test above (`invokes stopDaemon and returns its exit code`) lets the
// real `stopDaemon` run for real against an isolated --home directory with no daemon running:
// `stopDaemon` takes `homeDir` as one of its own options, so the CLI can inject a fully isolated temp
// directory with no chdir needed. `runMcpClient` has no such CLI-level --cwd flag (its binding walk-up
// reads `process.cwd()` by design — see `src/client/main.ts`), so the only way to exercise this
// dispatch branch end to end, without mocking the dynamic import and without ever touching real stdin,
// is to control `process.cwd()` itself. `node --test` runs each matched file in its own child process
// and runs a file's top-level tests sequentially (verified locally), so a chdir here cannot leak into
// another test file or race a concurrent test in this one. Both --project forms are proven through the
// real module chain, landing on the binding walk-up's own fast, real refusal (no conmuta.json) rather
// than ever reaching `server.connect(new StdioServerTransport())`.
test("`mcp --project <id>` and `mcp --project=<id>` both reach the real client module through the dynamic import and return its own refusal exit code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-cli-mcp-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(dir);

    const first = makeIo();
    assert.equal(await runCli(["mcp", "--project", "prj-example"], first.io), EXIT_UNBOUND_PROJECT);
    assert.match(first.err.join("\n"), /no conmuta\.json found/);

    const second = makeIo();
    assert.equal(await runCli(["mcp", "--project=prj-example"], second.io), EXIT_UNBOUND_PROJECT);
    assert.match(second.err.join("\n"), /no conmuta\.json found/);
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

// Judgment Day correction (session 35, both judges independently): the Node-floor gate must fire
// before `mcp`'s own argument validation, not after — otherwise a malformed invocation on an old Node
// (e.g. missing --project) reports "mcp requires --project <id>" instead of the actionable Node
// version message, masking the true cause. `process.version` has no injection seam anywhere in this
// dispatcher (unlike `runMcpClient`'s own `nodeVersion` option), so this is the one place in the suite
// that needs a scoped, `finally`-restored override of a Node built-in to observe the fix — the same
// class of monkey-patch this project's own `ipc-stub.test.ts` already established as acceptable when
// there is no other way to observe an argument passed to (or, here, read from) a built-in.
test("`mcp` checks the Node-floor gate before parsing --project, so a below-floor Node with a malformed invocation reports EXIT_NODE_FLOOR, not a --project usage error", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, "version");
  try {
    Object.defineProperty(process, "version", { value: "v0.1.0", configurable: true });

    const captured = makeIo();
    const result = runCli(["mcp"], captured.io);
    assert.equal(result, EXIT_NODE_FLOOR, "expected a synchronous EXIT_NODE_FLOOR, not the async --project dispatch branch");
    assert.match(captured.err.join("\n"), /Node\.js/);
    assert.doesNotMatch(captured.err.join("\n"), /--project/);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(process, "version", originalDescriptor);
    }
  }
});

