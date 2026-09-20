import { test } from "node:test";
import assert from "node:assert/strict";

import { MAX_LONGPOLL_SECONDS, REQUEST_OVERHEAD_SECONDS } from "../../src/shared/constants.js";
import {
  GroupMigratedError,
  RateLimitedError,
  TelegramApiClient,
  TelegramApiError,
  TelegramConflictError,
  TelegramNetworkError,
  TelegramProtocolError,
  requestTimeoutMs,
} from "../../src/daemon/telegram.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockClient(status: number, body: unknown, onCall?: (url: string, init?: RequestInit) => void) {
  return new TelegramApiClient("test-token", {
    fetchImpl: async (url, init) => {
      onCall?.(String(url), init);
      return jsonResponse(status, body);
    },
  });
}

test("TelegramClient exposes no deleteMessage method on its prototype or instance (T5)", () => {
  const client = mockClient(200, { ok: true, result: [] });
  assert.equal("deleteMessage" in client, false);
  assert.equal("deleteMessage" in TelegramApiClient.prototype, false);
});

test("TelegramApiClient constructs base URL from token and options", async () => {
  let capturedUrl = "";
  const client = new TelegramApiClient("bot-token-123", {
    baseUrl: "https://custom.telegram.local",
    fetchImpl: async (url) => {
      capturedUrl = String(url);
      return jsonResponse(200, { ok: true, result: [] });
    },
  });
  await client.getUpdates();
  assert.equal(capturedUrl, "https://custom.telegram.local/botbot-token-123/getUpdates");

  const defaultClient = new TelegramApiClient("bot-token-456", {
    fetchImpl: async (url) => {
      capturedUrl = String(url);
      return jsonResponse(200, { ok: true, result: [] });
    },
  });
  await defaultClient.getUpdates();
  assert.equal(capturedUrl, "https://api.telegram.org/botbot-token-456/getUpdates");
});

test("requestTimeoutMs clamps pollSeconds to [0, MAX_LONGPOLL_SECONDS] and adds REQUEST_OVERHEAD_SECONDS", () => {
  assert.equal(requestTimeoutMs(0), REQUEST_OVERHEAD_SECONDS * 1000);
  assert.equal(requestTimeoutMs(10), (10 + REQUEST_OVERHEAD_SECONDS) * 1000);
  assert.equal(requestTimeoutMs(MAX_LONGPOLL_SECONDS), (MAX_LONGPOLL_SECONDS + REQUEST_OVERHEAD_SECONDS) * 1000);
  assert.equal(requestTimeoutMs(-10), REQUEST_OVERHEAD_SECONDS * 1000);
  assert.equal(requestTimeoutMs(9999), (MAX_LONGPOLL_SECONDS + REQUEST_OVERHEAD_SECONDS) * 1000);
});

test("TelegramApiClient.getUpdates formats request shape correctly", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = mockClient(200, { ok: true, result: [{ update_id: 101 }] }, (u, i) => {
    capturedUrl = u;
    capturedInit = i;
  });

  const updates = await client.getUpdates({ offset: 50, limit: 10, timeout: 30 });
  assert.equal(capturedUrl, "https://api.telegram.org/bottest-token/getUpdates");
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(capturedInit?.headers, { "content-type": "application/json" });
  assert.equal(capturedInit?.body, JSON.stringify({ offset: 50, limit: 10, timeout: 30 }));
  assert.ok(capturedInit?.signal instanceof AbortSignal);
  assert.deepEqual(updates, [{ update_id: 101 }]);
});

test("TelegramApiClient.sendMessage formats request shape correctly", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = mockClient(
    200,
    { ok: true, result: { message_id: 1, chat: { id: 12345, type: "group" }, date: 1700000000, text: "hi" } },
    (u, i) => {
      capturedUrl = u;
      capturedInit = i;
    },
  );

  const sent = await client.sendMessage({ chat_id: 12345, text: "hi", parse_mode: "HTML", reply_to_message_id: 99 });
  assert.equal(capturedUrl, "https://api.telegram.org/bottest-token/sendMessage");
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(capturedInit?.headers, { "content-type": "application/json" });
  assert.equal(capturedInit?.body, JSON.stringify({ chat_id: 12345, text: "hi", parse_mode: "HTML", reply_to_message_id: 99 }));
  assert.ok(capturedInit?.signal instanceof AbortSignal);
  assert.equal(sent.message_id, 1);
});

test("TelegramApiClient.getMe and getChat format request shape correctly", async () => {
  const calls: Array<{ url: string; body: string | undefined }> = [];
  const client = new TelegramApiClient("test-token", {
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: init?.body as string | undefined });
      if (String(url).endsWith("/getMe")) {
        return jsonResponse(200, { ok: true, result: { id: 777, is_bot: true, username: "test_bot" } });
      }
      return jsonResponse(200, { ok: true, result: { id: 888, type: "group" } });
    },
  });

  const me = await client.getMe();
  const chat = await client.getChat(888);
  assert.equal(me.id, 777);
  assert.equal(chat.id, 888);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.telegram.org/bottest-token/getMe");
  assert.equal(calls[0].body, "{}");
  assert.equal(calls[1].url, "https://api.telegram.org/bottest-token/getChat");
  assert.equal(calls[1].body, JSON.stringify({ chat_id: 888 }));
});

test("TelegramApiClient maps network error to TelegramNetworkError", async () => {
  const client = new TelegramApiClient("test-token", {
    fetchImpl: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  await assert.rejects(
    () => client.getUpdates(),
    (err: unknown) => {
      assert.ok(err instanceof TelegramNetworkError);
      assert.ok(err.message.includes("getUpdates"));
      assert.ok(err.message.includes("Failed to fetch"));
      return true;
    },
  );
});

test("TelegramApiClient maps non-JSON response to TelegramProtocolError", async () => {
  const client = new TelegramApiClient("test-token", {
    fetchImpl: async () => new Response("<html>Gateway Timeout</html>", { status: 504 }),
  });
  await assert.rejects(
    () => client.sendMessage({ chat_id: 123, text: "hi" }),
    (err: unknown) => {
      assert.ok(err instanceof TelegramProtocolError);
      assert.equal(err.statusCode, 504);
      assert.ok(err.message.includes("sendMessage"));
      return true;
    },
  );
});

test("TelegramApiClient maps error responses to typed error classes", async () => {
  // 429 -> RateLimitedError
  const c429 = mockClient(429, { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 15 } });
  await assert.rejects(() => c429.getUpdates(), (err: unknown) => {
    assert.ok(err instanceof RateLimitedError);
    assert.equal(err.retry_after_s, 15);
    return true;
  });

  // 409 -> TelegramConflictError
  const c409 = mockClient(409, { ok: false, error_code: 409, description: "Conflict: terminated by other getUpdates request" });
  await assert.rejects(() => c409.getUpdates(), (err: unknown) => {
    assert.ok(err instanceof TelegramConflictError);
    assert.ok(err.message.includes("terminated by other getUpdates request"));
    return true;
  });

  // 400 with migrate_to_chat_id -> GroupMigratedError
  const cMigrate = mockClient(400, {
    ok: false,
    error_code: 400,
    description: "Bad Request: group chat was upgraded to a supergroup chat",
    parameters: { migrate_to_chat_id: -1001234567890 },
  });
  await assert.rejects(() => cMigrate.sendMessage({ chat_id: -123456, text: "test" }), (err: unknown) => {
    assert.ok(err instanceof GroupMigratedError);
    assert.equal(err.new_chat_id, -1001234567890);
    assert.equal(err.statusCode, 400);
    assert.ok(err.message.includes("-1001234567890"));
    return true;
  });

  // 403 -> TelegramApiError
  const c403 = mockClient(403, { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" });
  await assert.rejects(() => c403.getUpdates(), (err: unknown) => {
    assert.ok(err instanceof TelegramApiError);
    assert.equal(err.statusCode, 403);
    assert.ok(err.message.includes("bot was blocked by the user"));
    return true;
  });
});
