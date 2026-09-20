import { test } from "node:test";
import assert from "node:assert/strict";

import { TelegramApiError } from "../../../src/daemon/telegram.js";
import { DirectTransport } from "../../../src/daemon/transport/direct.js";
import { DualWriteTransport } from "../../../src/daemon/transport/dual.js";
import { GroupTransport } from "../../../src/daemon/transport/group.js";
import { TransportError } from "../../../src/daemon/transport/types.js";
import { FakeTelegramClient } from "../../fakes/telegram.js";

const GROUP_CHAT_ID = -1001234567890;

// Roster of 4 — SELF plus the "other three" (OTHER_THREE), so BROADCAST
// fan-out is genuinely exercised against 3 recipients, not just 1.
const SELF = "@dev1-agent";
const ROSTER = {
  [SELF]: { agent_id: SELF, username: "dev1_orion_bot", user_id: 8123456789 },
  "@dev2-agent": { agent_id: "@dev2-agent", username: "dev2_orion_bot", user_id: 8223456789 },
  "@dev3-agent": { agent_id: "@dev3-agent", username: "dev3_orion_bot", user_id: 8323456789 },
  "@dev4-agent": { agent_id: "@dev4-agent", username: "dev4_orion_bot", user_id: 8423456789 },
};
const OTHER_THREE = Object.keys(ROSTER).filter((id) => id !== SELF);

function makeTransport(client: FakeTelegramClient): DualWriteTransport {
  return new DualWriteTransport(new GroupTransport(client, GROUP_CHAT_ID), new DirectTransport(client, ROSTER));
}

// --- BROADCAST shape: 1 group post + fan-out to every other roster entry (T3-c) ---

test("a BROADCAST-shaped send (all-but-self recipients) produces one group post plus a DM to each of the other three roster entries", async () => {
  const client = new FakeTelegramClient();
  const transport = makeTransport(client);
  const text = "AGENTBUS/1 {\"type\":\"BROADCAST\",\"body\":\"deploying now\"}";

  const result = await transport.send(text, OTHER_THREE);

  assert.equal(result.direct.length, 3);
  assert.deepEqual(
    result.direct.map((d) => d.to).sort(),
    [...OTHER_THREE].sort()
  );
  assert.ok(result.direct.every((d) => d.ok === true));
  assert.equal(result.degraded, false);
  assert.equal(client.sentMessages.length, 4, "1 group post + 3 DMs = 4 total sendMessage calls");
});

// --- REQUEST/ACK/RESOLVED shape: 1 group post + exactly 1 DM (T3-c) ---

test("a REQUEST-shaped send (single addressee) produces one group post plus exactly one DM", async () => {
  const client = new FakeTelegramClient();
  const transport = makeTransport(client);
  const text = "AGENTBUS/1 {\"type\":\"REQUEST\",\"to\":\"@dev2-agent\"}";

  const result = await transport.send(text, ["@dev2-agent"]);

  assert.equal(result.direct.length, 1);
  assert.equal(result.direct[0].to, "@dev2-agent");
  assert.equal(result.direct[0].ok, true);
  assert.equal(result.degraded, false);
  assert.equal(client.sentMessages.length, 2, "1 group post + 1 DM = 2 total sendMessage calls");
});

// --- Ordering: group is ALWAYS attempted before any DM (call order, not just call count) ---

test("the group post is attempted before any direct DM, verified by call order in the fake's call log", async () => {
  const client = new FakeTelegramClient();
  const transport = makeTransport(client);
  const text = "AGENTBUS/1 {\"type\":\"BROADCAST\"}";

  await transport.send(text, OTHER_THREE);

  assert.equal(client.sentMessages[0].chat_id, GROUP_CHAT_ID, "the FIRST call in the log must be the group post");
  const laterCalls = client.sentMessages.slice(1);
  assert.equal(laterCalls.length, 3);
  for (const call of laterCalls) {
    assert.equal(typeof call.chat_id, "string", "every call after the first must be a @username DM, not the group");
  }
});

// --- D1: the failure taxonomy. Which plane's failure is allowed to take the other one down ---

test("a MESSAGE-LEVEL 400 hard-fails immediately with zero DM attempts", async () => {
  // The one class where stopping is right: the payload itself is what Telegram rejected, so all
  // three DMs would reject it identically. This is the surviving half of the original hard-fail
  // contract, narrowed from "any group failure" to "a failure the DMs would share".
  const client = new FakeTelegramClient();
  client.failNextSendMessageWith(new TelegramApiError(400, "Bad Request: can't parse entities: unclosed tag"));
  const transport = makeTransport(client);

  await assert.rejects(() => transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}", OTHER_THREE), TransportError);

  assert.equal(client.sentMessages.length, 0, "no DM may be attempted when the message itself is what failed");
});

test("a SOFT group failure (403) still attempts every DM, and the call resolves with delivery.group.ok:false", async () => {
  const client = new FakeTelegramClient();
  client.failNextSendMessageWith(new TelegramApiError(403, "Forbidden: bot was kicked from the group chat"));
  const transport = makeTransport(client);

  const result = await transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}", OTHER_THREE);

  assert.equal(result.group.ok, false, "the group outcome is reported, not thrown");
  assert.equal(client.sentMessages.length, 3, "all three DMs must still be attempted");
  assert.ok(result.direct.every((d) => d.ok === true), "the delivery plane is unaffected by the observability plane");
  assert.equal(result.degraded, true, "a blind human plane is a degraded send even when every DM landed");
});

test("group AND every DM failing is the only definition of a failed send — it hard-fails", async () => {
  const client = new FakeTelegramClient();
  client.failNextSendMessageWith(new TelegramApiError(403, "Forbidden: bot was kicked from the group chat"));
  for (const username of ["dev2_orion_bot", "dev3_orion_bot", "dev4_orion_bot"]) {
    client.failSendMessageTo(`@${username}`, new Error("peer unreachable"));
  }
  const transport = makeTransport(client);

  await assert.rejects(() => transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}", OTHER_THREE), TransportError);
});

test("a soft group failure with NO recipients at all also hard-fails — nothing was delivered anywhere", async () => {
  // The empty fan-out is the edge that an `every(ok)` check gets backwards: vacuously true over an
  // empty array, so "every DM succeeded" would report success for a send that reached nobody.
  const client = new FakeTelegramClient();
  client.failNextSendMessageWith(new TelegramApiError(403, "Forbidden: bot was kicked from the group chat"));
  const transport = makeTransport(client);

  await assert.rejects(() => transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}", []), TransportError);
});

test("one surviving DM is enough for the send to succeed, even with the group down", async () => {
  const client = new FakeTelegramClient();
  client.failNextSendMessageWith(new TelegramApiError(403, "Forbidden: bot was kicked from the group chat"));
  client.failSendMessageTo("@dev3_orion_bot", new Error("peer unreachable"));
  client.failSendMessageTo("@dev4_orion_bot", new Error("peer unreachable"));
  const transport = makeTransport(client);

  const result = await transport.send("AGENTBUS/1 {\"type\":\"BROADCAST\"}", OTHER_THREE);

  assert.equal(result.group.ok, false);
  assert.equal(result.direct.filter((d) => d.ok).length, 1);
});

// --- Partial fan-out failure: soft, per-recipient, no rollback, call still succeeds (availability, not security) ---

test("a partial fan-out failure (DM 2 of 3) is reported per recipient, does not roll back the group post, and the overall call still succeeds", async () => {
  const client = new FakeTelegramClient();
  client.failSendMessageTo("@dev3_orion_bot", new Error("peer unreachable"));
  const transport = makeTransport(client);
  const text = "AGENTBUS/1 {\"type\":\"BROADCAST\"}";

  const result = await transport.send(text, OTHER_THREE);

  assert.equal(result.degraded, true);
  assert.equal(result.group.ok, true, "the group post result is untouched by the DM failure");

  const failed = result.direct.find((d) => d.to === "@dev3-agent");
  assert.ok(failed, "the failed recipient must still appear in the per-recipient results");
  assert.equal(failed!.ok, false);
  assert.ok(typeof failed!.error === "string" && failed!.error.length > 0);

  const succeeded = result.direct.filter((d) => d.ok === true);
  assert.equal(succeeded.length, 2, "the other two recipients must still have succeeded");
});

// --- Byte-identical payload across both channels (ADR-05) ---

test("the group post and every direct DM copy carry byte-identical text", async () => {
  const client = new FakeTelegramClient();
  const transport = makeTransport(client);
  const text =
    'AGENTBUS/1 {"eid":"9f3c1a7e40b2","type":"BROADCAST","from":"@dev1-agent","to":null,"thread":"a1b2c3d4e5f6","ts":"2026-08-14T18:04:11Z","body":"same bytes everywhere"}';

  await transport.send(text, OTHER_THREE);

  assert.equal(client.sentMessages.length, 4);
  for (const call of client.sentMessages) {
    assert.equal(call.text, text, "every channel must receive the exact same text argument");
  }
});
