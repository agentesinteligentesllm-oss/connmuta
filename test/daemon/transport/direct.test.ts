import { test } from "node:test";
import assert from "node:assert/strict";

import { DirectTransport } from "../../../src/daemon/transport/direct.js";
import { TransportError, UnknownRecipientError } from "../../../src/daemon/transport/types.js";
import { TelegramApiError } from "../../../src/daemon/telegram.js";
import { FakeTelegramClient } from "../../fakes/telegram.js";

const ROSTER = {
  "@dev2-agent": { agent_id: "@dev2-agent", username: "dev2_orion_bot", user_id: 8223456789 },
  "@dev3-agent": { agent_id: "@dev3-agent", username: "dev3_orion_bot", user_id: 8323456789 },
};

// --- Roster resolution: addressed by username (ADR-04, ADR-10) ---

test("DirectTransport.send resolves the addressee through the roster and addresses the Bot API call by @username", async () => {
  const client = new FakeTelegramClient();
  const transport = new DirectTransport(client, ROSTER);

  const result = await transport.send("@dev2-agent", "AGENTBUS/1 {\"type\":\"REQUEST\"}");

  assert.equal(client.sentMessages.length, 1);
  assert.deepEqual(client.sentMessages[0], {
    chat_id: "@dev2_orion_bot",
    text: "AGENTBUS/1 {\"type\":\"REQUEST\"}",
    // ADR-05c: the DM plane carries the same presentation as the group post, so the two
    // copies stay byte-identical.
    parse_mode: "HTML",
  });
  assert.equal(typeof result.message_id, "number");
});

test("DirectTransport.send resolves a DIFFERENT addressee to a DIFFERENT username (triangulation, proves real roster lookup)", async () => {
  const client = new FakeTelegramClient();
  const transport = new DirectTransport(client, ROSTER);

  await transport.send("@dev3-agent", "AGENTBUS/1 {\"type\":\"ACK\"}");

  assert.deepEqual(client.sentMessages[0], {
    chat_id: "@dev3_orion_bot",
    text: "AGENTBUS/1 {\"type\":\"ACK\"}",
    parse_mode: "HTML",
  });
});

// --- Access control: unknown recipient rejected before any network call (T3-b, T4, ADR-10) ---

test("DirectTransport.send rejects an addressee absent from the local roster with UnknownRecipientError", async () => {
  const client = new FakeTelegramClient();
  const transport = new DirectTransport(client, ROSTER);

  await assert.rejects(
    () => transport.send("@ghost-bot", "AGENTBUS/1 {\"type\":\"REQUEST\"}"),
    (err: unknown) => {
      assert.ok(err instanceof UnknownRecipientError);
      assert.equal((err as UnknownRecipientError).to, "@ghost-bot");
      return true;
    }
  );
});

test("DirectTransport.send makes NO network call at all when the addressee is unknown", async () => {
  const client = new FakeTelegramClient();
  const transport = new DirectTransport(client, ROSTER);

  await assert.rejects(() => transport.send("@ghost-bot", "AGENTBUS/1 {\"type\":\"REQUEST\"}"));

  assert.equal(
    client.sentMessages.length,
    0,
    "the roster check must happen before sendMessage is ever invoked"
  );
});

test("an empty roster rejects every addressee as unknown, before any network call", async () => {
  const client = new FakeTelegramClient();
  const transport = new DirectTransport(client, {});

  await assert.rejects(() => transport.send("@dev2-agent", "AGENTBUS/1 {\"type\":\"REQUEST\"}"), UnknownRecipientError);
  assert.equal(client.sentMessages.length, 0);
});

test("DirectTransport.send translates a USER_BOT_TO_BOT_DISABLED failure into actionable BotFather guidance, without losing the raw Telegram error", async () => {
  const client = new FakeTelegramClient();
  const transport = new DirectTransport(client, ROSTER);
  client.failSendMessageTo("@dev2_orion_bot", new TelegramApiError(400, "Bad Request: USER_BOT_TO_BOT_DISABLED"));

  await assert.rejects(
    () => transport.send("@dev2-agent", "AGENTBUS/1 {\"type\":\"REQUEST\"}"),
    (err: unknown) => {
      assert.ok(err instanceof TransportError);
      assert.match(err.message, /USER_BOT_TO_BOT_DISABLED/, "the raw Telegram error must still be present");
      assert.match(err.message, /Bot to Bot Communication Mode/i, "must translate the code into actionable BotFather guidance");
      return true;
    }
  );
});

test("DirectTransport.send leaves an unrecognized Telegram error message untranslated (no hint appended)", async () => {
  const client = new FakeTelegramClient();
  const transport = new DirectTransport(client, ROSTER);
  client.failSendMessageTo("@dev2_orion_bot", new TelegramApiError(500, "Internal Server Error"));

  await assert.rejects(
    () => transport.send("@dev2-agent", "AGENTBUS/1 {\"type\":\"REQUEST\"}"),
    (err: unknown) => {
      assert.ok(err instanceof TransportError);
      assert.match(err.message, /Internal Server Error/);
      assert.doesNotMatch(err.message, /Bot to Bot Communication Mode/i);
      return true;
    }
  );
});
