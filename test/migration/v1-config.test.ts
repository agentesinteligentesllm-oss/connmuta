import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
