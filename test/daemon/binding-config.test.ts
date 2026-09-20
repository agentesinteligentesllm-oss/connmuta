import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REQUEST_REMINDER_WINDOW_HOURS } from "../../src/shared/constants.js";
import {
  materializeBindingConfig,
  BindingConfigError,
  type BindingConfig,
} from "../../src/daemon/binding-config.js";
import type { RegistryBinding, RegistryBot } from "../../src/registry/schema.js";

describe("BindingConfig (DATA-MODEL §1, SEAM from v1 config.ts:168-187)", () => {
  const sampleBot: RegistryBot = {
    bot_id: 1234567,
    username: "test_bot",
    token_ref: { store: "keychain", account: "bot:1234567" },
    added_at: "2026-09-01T00:00:00.000Z",
  };

  const sampleBinding: RegistryBinding = {
    project_id: "prj-alpha",
    bot_id: 1234567,
    group_id: -1001234567890,
    agent_id: "@alpha-agent",
    status: "active",
    roster_snapshot: [
      { agent_id: "@alpha-agent", user_id: 1234567, username: "test_bot" },
      { agent_id: "@beta-agent", user_id: 7654321, username: "beta_bot" },
    ],
    roster_hash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    bound_at: "2026-09-01T00:00:00.000Z",
  };

  it("materializes BindingConfig with defaults and without bot_token (I-2)", () => {
    const config = materializeBindingConfig(sampleBinding, sampleBot);

    assert.equal(config.agent_id, "@alpha-agent");
    assert.equal(config.bot_username, "test_bot");
    assert.equal(config.chat_id, -1001234567890);
    assert.equal(config.reminder_window_hours, REQUEST_REMINDER_WINDOW_HOURS);
    assert.deepEqual(config.secret_markers, []);

    // Roster is keyed by agent_id with { username, user_id }
    assert.deepEqual(config.roster, {
      "@alpha-agent": { username: "test_bot", user_id: 1234567 },
      "@beta-agent": { username: "beta_bot", user_id: 7654321 },
    });

    // bot_token must not exist on BindingConfig
    assert.equal("bot_token" in (config as Record<string, unknown>), false);
  });

  it("applies optional settings when present in RegistryBinding", () => {
    const customBinding: RegistryBinding = {
      ...sampleBinding,
      settings: {
        reminder_window_hours: 12,
        secret_markers: ["sk-ant-", "ghp_"],
      },
    };

    const config = materializeBindingConfig(customBinding, sampleBot);

    assert.equal(config.reminder_window_hours, 12);
    assert.deepEqual(config.secret_markers, ["sk-ant-", "ghp_"]);
  });

  it("accepts a string bot username directly", () => {
    const config = materializeBindingConfig(sampleBinding, "direct_bot_username");
    assert.equal(config.bot_username, "direct_bot_username");
  });

  it("refuses non-negative chat_id (Telegram group ids must be negative)", () => {
    const invalidBinding: RegistryBinding = {
      ...sampleBinding,
      group_id: 1001234567890,
    };

    assert.throws(
      () => materializeBindingConfig(invalidBinding, sampleBot),
      (err: unknown) => {
        assert(err instanceof BindingConfigError);
        assert.match(err.message, /chat_id must be negative/);
        return true;
      }
    );
  });

  it("refuses empty agent_id or bot_username", () => {
    const emptyAgentBinding: RegistryBinding = {
      ...sampleBinding,
      agent_id: "",
    };

    assert.throws(
      () => materializeBindingConfig(emptyAgentBinding, sampleBot),
      (err: unknown) => err instanceof BindingConfigError
    );

    assert.throws(
      () => materializeBindingConfig(sampleBinding, ""),
      (err: unknown) => err instanceof BindingConfigError
    );
  });

  it("refuses null or undefined botOrUsername (JD-A-005)", () => {
    assert.throws(
      () => materializeBindingConfig(sampleBinding, null as unknown as string),
      (err: unknown) => {
        assert(err instanceof BindingConfigError);
        assert.match(err.message, /bot or username is required/);
        return true;
      }
    );

    assert.throws(
      () => materializeBindingConfig(sampleBinding, undefined as unknown as string),
      (err: unknown) => {
        assert(err instanceof BindingConfigError);
        assert.match(err.message, /bot or username is required/);
        return true;
      }
    );

    assert.throws(
      () => materializeBindingConfig(sampleBinding, { username: "" }),
      (err: unknown) => {
        assert(err instanceof BindingConfigError);
        assert.match(err.message, /bot username is required/);
        return true;
      }
    );
  });
});
