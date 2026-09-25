import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { loadV1Config, resolveV1AgentBusHome } from "../../src/migration/v1-config.js";

/** A fresh temp v1 home; removed when `operation` returns. */
function withV1Home(operation: (homeDir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-v1-migration-config-"));
  try {
    operation(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A minimal, schema-valid v1 `config.json` body. Placeholder identifiers only (AGENTS.md §3). */
function validV1ConfigJson(): Record<string, unknown> {
  return {
    agent_id: "agent-placeholder-a",
    bot_username: "placeholder_bot",
    chat_id: -1001111111111,
    roster: {
      "agent-placeholder-a": { username: "placeholder_a", user_id: 111111 },
      "agent-placeholder-b": { username: "placeholder_b", user_id: 222222 },
    },
  };
}

test("loadV1Config parses a valid placeholder config.json", () => {
  withV1Home((homeDir) => {
    writeFileSync(join(homeDir, "config.json"), JSON.stringify(validV1ConfigJson()), "utf8");

    const result = loadV1Config(homeDir);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.config.agent_id, "agent-placeholder-a");
      assert.equal(result.config.bot_username, "placeholder_bot");
      assert.equal(result.config.chat_id, -1001111111111);
      assert.equal(result.config.reminder_window_hours, 24, "v1's own REQUEST_REMINDER_WINDOW_HOURS default");
      assert.deepEqual(result.config.secret_markers, []);
      assert.equal(result.config.roster["agent-placeholder-b"]?.user_id, 222222);
    }
  });
});

test("loadV1Config returns an 'unreadable' refusal when config.json is missing (v1's own undifferentiated throw)", () => {
  withV1Home((homeDir) => {
    const result = loadV1Config(homeDir);
    assert.deepEqual(result, { ok: false, refusal: { kind: "unreadable" } });
  });
});

test("loadV1Config returns an 'unreadable' refusal when config.json exists but cannot be read as a file", () => {
  withV1Home((homeDir) => {
    // A directory in config.json's place: existsSync-equivalent path exists, readFileSync throws EISDIR
    // — the same portable technique test/migration/v1-state.test.ts and test/registry/loader.test.ts use
    // to force an I/O fault on an existing path without relying on OS permission bits.
    mkdirSync(join(homeDir, "config.json"));

    const result = loadV1Config(homeDir);

    assert.deepEqual(result, { ok: false, refusal: { kind: "unreadable" } });
  });
});

test("loadV1Config parses an optional bot_token when present", () => {
  withV1Home((homeDir) => {
    writeFileSync(
      join(homeDir, "config.json"),
      JSON.stringify({ ...validV1ConfigJson(), bot_token: "1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg" }),
      "utf8",
    );

    const result = loadV1Config(homeDir);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.config.bot_token, "1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg");
    }
  });
});

test("loadV1Config returns a 'schema_invalid' refusal for a non-negative chat_id", () => {
  withV1Home((homeDir) => {
    writeFileSync(join(homeDir, "config.json"), JSON.stringify({ ...validV1ConfigJson(), chat_id: 1001111111111 }), "utf8");

    const result = loadV1Config(homeDir);

    assert.deepEqual(result, { ok: false, refusal: { kind: "schema_invalid" } });
  });
});

test("loadV1Config returns a 'schema_invalid' refusal for an empty bot_username", () => {
  withV1Home((homeDir) => {
    writeFileSync(join(homeDir, "config.json"), JSON.stringify({ ...validV1ConfigJson(), bot_username: "" }), "utf8");

    const result = loadV1Config(homeDir);

    assert.deepEqual(result, { ok: false, refusal: { kind: "schema_invalid" } });
  });
});

test("loadV1Config returns an 'invalid_json' refusal for malformed JSON", () => {
  withV1Home((homeDir) => {
    writeFileSync(join(homeDir, "config.json"), "{not valid json", "utf8");

    const result = loadV1Config(homeDir);

    assert.deepEqual(result, { ok: false, refusal: { kind: "invalid_json" } });
  });
});

test("loadV1Config returns a 'schema_invalid' refusal for a structurally wrong object (missing agent_id)", () => {
  withV1Home((homeDir) => {
    const { agent_id: _agentId, ...withoutAgentId } = validV1ConfigJson();
    writeFileSync(join(homeDir, "config.json"), JSON.stringify(withoutAgentId), "utf8");

    const result = loadV1Config(homeDir);

    assert.deepEqual(result, { ok: false, refusal: { kind: "schema_invalid" } });
  });
});

test("resolveV1AgentBusHome honors an AGENTBUS_HOME override", () => {
  const env = { AGENTBUS_HOME: "/custom/agentbus/home" } as unknown as NodeJS.ProcessEnv;
  assert.equal(resolveV1AgentBusHome(env), "/custom/agentbus/home");
});

test("resolveV1AgentBusHome ignores a blank AGENTBUS_HOME and falls back to homedir()/.agentbus", () => {
  const env = { AGENTBUS_HOME: "   " } as unknown as NodeJS.ProcessEnv;
  assert.equal(resolveV1AgentBusHome(env), join(homedir(), ".agentbus"));
});

test("resolveV1AgentBusHome falls back to homedir()/.agentbus when AGENTBUS_HOME is unset", () => {
  const env = {} as unknown as NodeJS.ProcessEnv;
  assert.equal(resolveV1AgentBusHome(env), join(homedir(), ".agentbus"));
});

test("resolveV1AgentBusHome returns a whitespace-padded override verbatim, untrimmed (matches v1's own getAgentBusHome exactly)", () => {
  const env = { AGENTBUS_HOME: "  /custom/agentbus/home  " } as unknown as NodeJS.ProcessEnv;
  assert.equal(resolveV1AgentBusHome(env), "  /custom/agentbus/home  ");
});
