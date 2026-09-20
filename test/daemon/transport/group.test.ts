import { test } from "node:test";
import assert from "node:assert/strict";

import { GroupMigratedError, TelegramApiError } from "../../../src/daemon/telegram.js";
import { GroupTransport } from "../../../src/daemon/transport/group.js";
import { TransportError } from "../../../src/daemon/transport/types.js";
import { FakeTelegramClient } from "../../fakes/telegram.js";

const GROUP_CHAT_ID = -1001234567890;

test("GroupTransport.send posts the given text to the configured group chat id and returns the message id", async () => {
  const client = new FakeTelegramClient();
  const transport = new GroupTransport(client, GROUP_CHAT_ID);

  const result = await transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}");

  assert.equal(client.sentMessages.length, 1);
  assert.deepEqual(client.sentMessages[0], {
    chat_id: GROUP_CHAT_ID,
    text: "AGENTBUS/1 {\"type\":\"BROADCAST\"}",
    // ADR-05c: presentation only. Telegram stores Message.text as the un-escaped inner
    // text, so this never changes the bytes a peer decodes.
    parse_mode: "HTML",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok === true && typeof result.message_id, "number");
});

test("GroupTransport.send posts to a DIFFERENT configured chat id with DIFFERENT text (triangulation)", async () => {
  const client = new FakeTelegramClient();
  const transport = new GroupTransport(client, -1009999999999);

  await transport.send("AGENTBUS/1 {\"type\":\"REQUEST\"}");

  assert.deepEqual(client.sentMessages[0], {
    chat_id: -1009999999999,
    text: "AGENTBUS/1 {\"type\":\"REQUEST\"}",
    parse_mode: "HTML",
  });
});

// --- D1: a group failure must stop taking the DM plane down with it ---
//
// The original contract here was "any group-post failure throws", and `DualWriteTransport` relied on
// that to guarantee no DM followed. That is precisely the defect: the observability plane failing
// took the *delivery* plane down with it. The replacement contract is narrower — only a failure that
// would repeat identically on every DM is hard.

test("a soft group failure (403 kicked from the group) RESOLVES with ok:false instead of throwing", async () => {
  const client = new FakeTelegramClient();
  client.failNextSendMessageWith(new TelegramApiError(403, "Forbidden: bot was kicked from the group chat"));
  const transport = new GroupTransport(client, GROUP_CHAT_ID);

  const result = await transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}");

  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.error.includes("kicked"), "the raw cause must survive into the outcome");
  assert.ok(result.ok === false && typeof result.code === "string" && result.code.length > 0);
});

test("a message-level 400 (can't parse entities) still THROWS — it would fail identically on every DM", async () => {
  const client = new FakeTelegramClient();
  client.failNextSendMessageWith(new TelegramApiError(400, "Bad Request: can't parse entities: unclosed tag"));
  const transport = new GroupTransport(client, GROUP_CHAT_ID);

  await assert.rejects(() => transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}"), TransportError);
});

test("a supergroup migration is SOFT and carries the successor chat id in the outcome (group-specific, not payload-specific)", async () => {
  const client = new FakeTelegramClient();
  client.failNextSendMessageWith(
    new GroupMigratedError(400, "Bad Request: group chat was upgraded to a supergroup chat", -1009876543210)
  );
  const transport = new GroupTransport(client, GROUP_CHAT_ID);

  const result = await transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}");

  assert.equal(result.ok, false, "a dead group must not stop the DMs — that composition is what made D5 a total outage");
  assert.equal(result.ok === false && result.code, "GROUP_MIGRATED");
  assert.equal(result.ok === false && result.new_chat_id, -1009876543210);
});

test("an UNCLASSIFIED failure resolves SOFT, deliberately", async () => {
  // The asymmetry decides this, not confidence: being wrong toward attempting costs at most three
  // doomed HTTP calls, and the resulting wall of N identical DM errors is itself the diagnostic that
  // the failure was intrinsic to the message. Being wrong toward hard failure costs the bus.
  const client = new FakeTelegramClient();
  client.failNextSendMessageWith(new Error("network exploded"));
  const transport = new GroupTransport(client, GROUP_CHAT_ID);

  const result = await transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}");

  assert.equal(result.ok, false);
});

test("GroupTransport.send makes no other client call once the post itself has failed", async () => {
  const client = new FakeTelegramClient();
  client.failNextSendMessageWith(new Error("network exploded"));
  const transport = new GroupTransport(client, GROUP_CHAT_ID);

  await transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}");

  assert.equal(client.sentMessages.length, 0, "a failed post must not be recorded as sent");
});
