import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { reportProjectBindOutcome, runCli, type CliIo } from "../../src/cli/main.js";
import type { EditFileOutcome } from "../../src/installer/file-edit.js";
import type { GitignoreCheckResult } from "../../src/installer/gitignore.js";
import type { ToolId } from "../../src/installer/tool-targets.js";
import type { ProjectBindOutcome } from "../../src/installer/wizards/project-bind.js";
import {
  CHANNEL_SERVER_NAME,
  EXIT_MIGRATION_REFUSED,
  EXIT_NODE_FLOOR,
  EXIT_UNBOUND_PROJECT,
  EXIT_USAGE,
  EXIT_VALIDATION_FAILED,
  PRODUCT_NAME,
} from "../../src/shared/constants.js";

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

test("package.json declares the product bin and the channel adapter's, and the product bin resolves to the built CLI", () => {
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    bin?: Record<string, string>;
  };
  // F4 added the adapter as a second bin, built outside `src/` (spec "Adapter ships as a second `bin` entry").
  assert.deepEqual(Object.keys(packageJson.bin ?? {}), [PRODUCT_NAME, CHANNEL_SERVER_NAME]);
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

// B-97: the entry guard (`import.meta.main`) has no test that actually spawns the built CLI and
// confirms it runs. The prior `process.argv[1]` guard was silently false only behind a POSIX
// symlinked npm bin, which this Windows machine cannot reproduce, so this test cannot show a RED
// against that specific defect; it pins the guard firing on direct execution at all, a guarantee
// that had no test before. Proven with a mutation, not a reproduced symlink bug: a direct temporary
// edit to a permanently-false condition made this test fail before the fix landed.
test("spawning the built CLI directly runs it (the entry guard fires)", () => {
  const result = spawnSync(process.execPath, [CLI_ENTRY], { encoding: "utf8", shell: false });
  assert.equal(result.status, EXIT_USAGE, `expected the guard to fire and runCli to run: ${result.stderr}`);
  assert.ok(
    result.stderr.includes(PRODUCT_NAME),
    `expected usage output naming ${PRODUCT_NAME} on stderr, got: ${JSON.stringify(result.stderr)}`,
  );
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

// `migrate-v1` is not in this loop: unlike `daemon` (needs a subcommand) and `mcp` (needs
// `--project`), every one of its own flags is optional (`--v1-home` defaults, `--project-id`/
// `--project-path` are an opt-in pair, D-23), so a bare invocation is a legitimate call that runs
// against the real default homes — not a usage error. Its own dispatch is exercised below instead,
// always against an isolated `--v1-home`.
test("a subcommand reserved for a later slice is a usage error, not a stub that pretends to work", () => {
  for (const reserved of ["daemon", "mcp"]) {
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
  assert.match(text, /daemon start/);
  assert.match(text, /daemon stop \[--home <dir>\]/);
  assert.match(text, /setup/);
  assert.match(text, /bot add/);
  assert.match(text, /group add/);
  assert.match(text, /project bind <path>/);
  assert.match(text, /project sync-roster \[path\] \[--home <dir>\]/);
  assert.match(text, /panel \[--home <dir>\]/);
  assert.match(text, /mcp --project <id>/);
  assert.equal(text.includes("[<path>"), false, "the usage text must not advertise an optional target");
  // `doctor` is deliberately deferred to Unit 8 (`src/doctor/main.ts` does not exist yet) — this pins
  // the disclosure that it is not silently wired alongside `setup`/`bot`/`group`/`project`.
  assert.equal(text.includes("doctor"), false, "the usage text must not advertise the unwired 'doctor' verb");
});

// --- daemon start/stop subcommand dispatch ---

test("`daemon` with an unknown subcommand is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["daemon", "restart"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown daemon subcommand 'restart'/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`daemon start` with an unexpected argument is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["daemon", "start", "unexpected-arg"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unexpected argument 'unexpected-arg'/);
  assert.match(captured.err.join("\n"), /usage:/);
});

// Same Judgment Day gate-ordering idiom as the `mcp`/`migrate-v1` tests below: a scoped, `finally`-
// restored override of `process.version`, the one built-in this dispatcher has no injection seam for.
test("`daemon start` checks the Node-floor gate before anything else, reporting EXIT_NODE_FLOOR on a below-floor Node", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, "version");
  try {
    Object.defineProperty(process, "version", { value: "v0.1.0", configurable: true });

    const captured = makeIo();
    const result = runCli(["daemon", "start"], captured.io);
    assert.equal(result, EXIT_NODE_FLOOR, "expected a synchronous EXIT_NODE_FLOOR, not the async ensureDaemonRunning dispatch");
    assert.match(captured.err.join("\n"), /Node\.js/);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(process, "version", originalDescriptor);
    }
  }
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

// --- panel subcommand dispatch ---

test("`panel` checks the Node-floor gate before anything else, reporting EXIT_NODE_FLOOR on a below-floor Node", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, "version");
  try {
    Object.defineProperty(process, "version", { value: "v0.1.0", configurable: true });

    const captured = makeIo();
    const result = runCli(["panel"], captured.io);
    assert.equal(result, EXIT_NODE_FLOOR, "expected a synchronous EXIT_NODE_FLOOR, not the async runPanelCommand dispatch");
    assert.match(captured.err.join("\n"), /Node\.js/);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(process, "version", originalDescriptor);
    }
  }
});

test("`panel` with an unknown option is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["panel", "--verbose"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown option '--verbose'/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`panel` with --home missing its argument is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["panel", "--home"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /--home requires a directory/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`panel` with extra positional arguments is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["panel", "unexpected-arg"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unexpected argument 'unexpected-arg'/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`panel` invokes runPanelCommand and returns its exit code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-cli-panel-"));
  try {
    const captured = makeIo();
    const result = await runCli(["panel", "--home", dir], captured.io);
    assert.equal(result, 1);
    assert.match(captured.err.join("\n"), /not running/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- project sync-roster subcommand dispatch ---
//
// `project bind <path>` still dispatches through `installer/cli.ts`'s own verb parser (see the
// `setup`/`bot`/`group`/`project` section below); `project sync-roster` does not — it is its own
// direct branch, matching `panel`'s own style, because it is a distinct new capability this PR alone
// authors and `installer/cli.ts` is an already-merged, multi-purpose file this PR's own scope note
// (tasks.md PR-07) does not list as in scope.

test("`project sync-roster` checks the Node-floor gate before anything else, reporting EXIT_NODE_FLOOR on a below-floor Node", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, "version");
  try {
    Object.defineProperty(process, "version", { value: "v0.1.0", configurable: true });

    const captured = makeIo();
    const result = runCli(["project", "sync-roster"], captured.io);
    assert.equal(result, EXIT_NODE_FLOOR, "expected a synchronous EXIT_NODE_FLOOR, not the async runSyncRosterCommand dispatch");
    assert.match(captured.err.join("\n"), /Node\.js/);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(process, "version", originalDescriptor);
    }
  }
});

test("`project sync-roster` with an unknown option is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["project", "sync-roster", "--verbose"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown option '--verbose'/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`project sync-roster` with --home missing its argument is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["project", "sync-roster", "--home"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /--home requires a directory/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`project sync-roster` with two positional paths is a usage error", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["project", "sync-roster", "/tmp/a", "/tmp/b"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unexpected argument '\/tmp\/b'/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`project sync-roster [path]` invokes runSyncRosterCommand and returns its exit code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-cli-sync-roster-"));
  const targetDir = mkdtempSync(join(tmpdir(), "conmuta-cli-sync-roster-project-"));
  try {
    writeFileSync(join(targetDir, "conmuta.json"), VALID_FILE, "utf8");
    const captured = makeIo();
    const result = await runCli(["project", "sync-roster", targetDir, "--home", dir], captured.io);
    // No registry.json exists yet under this isolated --home, so the real dependency chain (a real
    // ledger open, a real registry read) reaches its own fast, real refusal rather than a fake.
    assert.equal(result, EXIT_UNBOUND_PROJECT);
    assert.match(captured.err.join("\n"), /no active binding/i);
  } finally {
    // `openInstallerLedgerOrFail` leaves the ledger connection open (the same pre-existing behavior
    // `bot add`/`group add`/`project bind` already have, out of this PR's own scope): on Windows the
    // still-open `ledger.db` file keeps the directory locked, so cleanup tolerates EPERM the same way
    // `test/daemon/bootstrap.test.ts`'s own `cleanupTempHome` does.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failure in tests
    }
    rmSync(targetDir, { recursive: true, force: true });
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

// --- migrate-v1 subcommand dispatch ---

// Always run against an isolated `--v1-home`, never the real default: an empty directory refuses at
// the config-load step (before any v2-home read/write), which is what makes this a safe dispatch test
// rather than one that touches the real `~/.agentbus`/`~/.conmuta`.
test("`migrate-v1 --v1-home <dir>` reaches the real migration module through the dynamic import with correctly parsed flags, and returns its own refusal exit code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-cli-migrate-v1-"));
  try {
    const captured = makeIo();
    const result = await runCli(["migrate-v1", "--v1-home", dir], captured.io);
    assert.equal(result, EXIT_MIGRATION_REFUSED);

    const second = makeIo();
    const secondResult = await runCli(["migrate-v1", `--v1-home=${dir}`], second.io);
    assert.equal(secondResult, EXIT_MIGRATION_REFUSED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("`migrate-v1` requires --project-id and --project-path together", () => {
  const captured = makeIo();
  assert.equal(runCli(["migrate-v1", "--project-id", "prj-example"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /--project-id and --project-path must be given together/);
});

test("`migrate-v1 --project-path` must be an absolute path", () => {
  const captured = makeIo();
  assert.equal(
    runCli(["migrate-v1", "--project-id", "prj-example", "--project-path", "relative/path"], captured.io),
    EXIT_USAGE,
  );
  assert.match(captured.err.join("\n"), /--project-path must be an absolute path/);
});

test("`migrate-v1` with an unknown option is a usage error", () => {
  const captured = makeIo();
  assert.equal(runCli(["migrate-v1", "--verbose"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown option '--verbose'/);
});

// Same Judgment Day correction as `mcp`'s own gate test above: the Node-floor gate must fire before
// migrate-v1's own flag parsing, so a malformed invocation on a below-floor Node still reports the
// actionable Node version message.
test("`migrate-v1` checks the Node-floor gate before parsing its flags, reporting EXIT_NODE_FLOOR on a below-floor Node", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, "version");
  try {
    Object.defineProperty(process, "version", { value: "v0.1.0", configurable: true });

    const captured = makeIo();
    const result = runCli(["migrate-v1", "--project-id"], captured.io);
    assert.equal(result, EXIT_NODE_FLOOR, "expected a synchronous EXIT_NODE_FLOOR, not the async migration dispatch branch");
    assert.match(captured.err.join("\n"), /Node\.js/);
    assert.doesNotMatch(captured.err.join("\n"), /--project-id/);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(process, "version", originalDescriptor);
    }
  }
});

// --- setup / bot add / group add / project bind dispatch ---
//
// These four verbs dispatch through `installer/cli.ts`'s own `runInstallerCli`, which this
// dispatcher hands a real `Prompter` and a real, opened ledger connection (`installer/ledger-access.ts`).
// Neither is fakeable at this level without an injection seam this file does not have (the same
// situation `mcp`/`migrate-v1` are already in above), and unlike those two, none of `setup`/`bot add`/
// `group add`/`project bind` has a fast, side-effect-free *refusal* path reachable before a real
// prompt or a real ledger write — `bot add` alone would create `~/.conmuta` on the machine running
// this suite. So, deliberately, no test here drives a real wizard closure to completion; each of
// `bot`/`group`/`project`'s own *malformed*-invocation cases below is chosen because
// `installer/cli.ts`'s own strict conditional chain refuses them before calling any closure at all
// (pinned separately by `test/installer/cli.test.ts`), and each wizard's own real behavior is already
// covered by its own test file (`test/installer/wizards/*.test.ts`) — the same division of labor
// `mcp`'s test already draws around `runMcpClient`'s internals.

test("`setup`/`bot`/`group`/`project` each check the Node-floor gate before anything else, reporting EXIT_NODE_FLOOR on a below-floor Node", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, "version");
  try {
    Object.defineProperty(process, "version", { value: "v0.1.0", configurable: true });

    for (const argv of [["setup"], ["bot"], ["group"], ["project"]]) {
      const captured = makeIo();
      const result = runCli(argv, captured.io);
      assert.equal(
        result,
        EXIT_NODE_FLOOR,
        `expected a synchronous EXIT_NODE_FLOOR for ${JSON.stringify(argv)}, not the async installer dispatch`,
      );
      assert.match(captured.err.join("\n"), /Node\.js/);
    }
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(process, "version", originalDescriptor);
    }
  }
});

test("`bot` with an unknown sub-verb is a usage error and calls no wizard", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["bot", "remove"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown installer invocation \(unknown-verb\)/);
  assert.match(captured.err.join("\n"), /usage:/);
});

test("`group` with an unknown sub-verb is a usage error and calls no wizard", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["group", "remove"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown installer invocation \(unknown-verb\)/);
});

test("`setup` with an unexpected extra argument is a usage error and calls no wizard", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["setup", "extra"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown installer invocation \(unknown-verb\)/);
});

test("`project bind` with no path is a usage error and calls no wizard", async () => {
  const captured = makeIo();
  assert.equal(await runCli(["project", "bind"], captured.io), EXIT_USAGE);
  assert.match(captured.err.join("\n"), /unknown installer invocation \(missing-path\)/);
});

// `reportProjectBindOutcome`'s own "bound" reporting (D-52 gitignore lines) has no reachable path
// through `runCli` above: driving a real `project bind` wizard closure to a "bound" outcome needs a
// real ledger and a real registry, exactly what the comment above this section explains is out of
// scope for this dispatcher-level file. Exercised directly instead, mirroring how `runCli`/`CliIo`
// are already tested here as plain functions with a fake `CliIo`.
test("reportProjectBindOutcome prints a .gitignore line for each newly-appended entry", () => {
  const captured = makeIo();
  const result: ProjectBindOutcome = {
    outcome: "bound",
    project_id: "prj-example",
    toolConfigResults: new Map<ToolId, EditFileOutcome>([["claude-code", "created"]]),
    gitignoreResults: new Map<ToolId, GitignoreCheckResult>([
      ["claude-code", { alreadyCovered: false, appendedLine: "/.mcp.json" }],
      ["cursor", { alreadyCovered: true }],
    ]),
    instructionFiles: { agentsMd: "created", claudeMd: "created" },
  };

  assert.equal(reportProjectBindOutcome(captured.io, result), 0);
  assert.deepEqual(captured.out, ["project bound: prj-example", `${PRODUCT_NAME}: .gitignore updated (claude-code): /.mcp.json`]);
});

test("reportProjectBindOutcome prints nothing extra when every gitignore entry was already covered", () => {
  const captured = makeIo();
  const result: ProjectBindOutcome = {
    outcome: "bound",
    project_id: "prj-example",
    toolConfigResults: new Map<ToolId, EditFileOutcome>([["claude-code", "noop"]]),
    gitignoreResults: new Map<ToolId, GitignoreCheckResult>([["claude-code", { alreadyCovered: true }]]),
    instructionFiles: { agentsMd: "noop", claudeMd: "noop" },
  };

  assert.equal(reportProjectBindOutcome(captured.io, result), 0);
  assert.deepEqual(captured.out, ["project bound: prj-example"]);
});

// A caught ensureGitignored failure (R4-ensureGitignored-unguarded-throw-partial-bind) is reported on
// stderr rather than silently dropped or thrown, and the bind itself is still reported as successful:
// the tool config for that target was already written before the gitignore step ran.
test("reportProjectBindOutcome reports a failed gitignore update on stderr without failing the bind", () => {
  const captured = makeIo();
  const result: ProjectBindOutcome = {
    outcome: "bound",
    project_id: "prj-example",
    toolConfigResults: new Map<ToolId, EditFileOutcome>([["claude-code", "created"]]),
    gitignoreResults: new Map<ToolId, GitignoreCheckResult>([["claude-code", { alreadyCovered: false, failed: true, reason: "EACCES" }]]),
    instructionFiles: { agentsMd: "created", claudeMd: "created" },
  };

  assert.equal(reportProjectBindOutcome(captured.io, result), 0);
  assert.deepEqual(captured.out, ["project bound: prj-example"]);
  assert.deepEqual(captured.err, [`${PRODUCT_NAME}: could not update .gitignore for claude-code: EACCES`]);
});

