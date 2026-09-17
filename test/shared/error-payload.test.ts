import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  RETRYABLE_TOOL_CODES,
  errorResult,
  toolErrorPayload,
  type ToolErrorPayload,
} from "../../src/shared/error-payload.js";

// --- The payload shape is CLOSED (D3, `v1:src/index.ts:45-51`): five keys, of which only `code`,
// `message` and `retryable` are mandatory. The optional two are the refinements a Telegram
// classification can add — a rate limit's `retry_after_s` and a migrated chat's `new_chat_id` —
// so they belong to the shape even though the client-local constructor never sets them.

const RATE_LIMITED: ToolErrorPayload = { code: "RATE_LIMITED", message: "slow down", retryable: true, retry_after_s: 30 };
const CHAT_GONE: ToolErrorPayload = { code: "CHAT_GONE", message: "chat migrated", retryable: false, new_chat_id: -1009876543210 };

test("the optional refinements are part of the shape and survive serialization", () => {
  assert.equal(RATE_LIMITED.retry_after_s, 30);
  assert.equal(CHAT_GONE.new_chat_id, -1009876543210);
});

test("the shape is closed — an arbitrary extra field is not representable", () => {
  // @ts-expect-error the payload has no `chat_id`: a rejection can never leak a destination (PT-02).
  const unexpected: ToolErrorPayload = { code: "X", message: "y", retryable: false, chat_id: -1009876543210 };
  assert.ok(unexpected, "reached only if compilation succeeded despite the injected `chat_id` field");
});

test("the client-local constructor sets exactly `code`, `message` and `retryable`", () => {
  const payload = toolErrorPayload("DAEMON_DOWN", "no daemon answered");
  assert.deepEqual(Object.keys(payload).sort(), ["code", "message", "retryable"]);
  assert.equal(payload.code, "DAEMON_DOWN");
  assert.equal(payload.message, "no daemon answered");
});

// --- `RETRYABLE_TOOL_CODES` is a closed ALLOW-list, not a deny-list: an unrecognised code is NOT
// retryable, so a future error type cannot become a hot loop just because nobody classified it.
// v1 also listed `BRIDGE_BUSY`; v2 deletes that code with the v1 bridge lock (design §10, §12).

test("the retryable allow-list is exactly TRANSPORT_ERROR — BRIDGE_BUSY is gone with the v1 lock", () => {
  assert.deepEqual([...RETRYABLE_TOOL_CODES], ["TRANSPORT_ERROR"]);
  assert.equal(RETRYABLE_TOOL_CODES.has("BRIDGE_BUSY"), false);
});

test("an unrecognised code is not retryable, while a listed one is", () => {
  assert.equal(toolErrorPayload("TRANSPORT_ERROR", "socket closed").retryable, true);
  assert.equal(toolErrorPayload("NO_SUCH_CODE", "invented").retryable, false);
  assert.equal(toolErrorPayload("BODY_TOO_LONG", "too long").retryable, false);
});

test("errorResult serializes the payload as the single text block of an isError result", () => {
  const result = errorResult(toolErrorPayload("UNBOUND_PROJECT", "no binding"));
  assert.equal(result.isError, true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.deepEqual(JSON.parse(result.content[0].text), {
    code: "UNBOUND_PROJECT",
    message: "no binding",
    retryable: false,
  });
});

// --- The SEAM change this module carries: the two v1 helpers that consumed `telegram.ts`'s
// `classifyErrorChain` are NOT vendored here, because the thin client's closure must contain no
// Telegram-classification module (design §10, spec "Client-local error payload constructor"). The
// bundle-level half of that closure is PT-07 and belongs to `security/client-bundle` (PR-34/PR-40);
// this assertion catches a regression at the source, years of build time earlier.

test("error-payload.ts imports no Telegram classification module", () => {
  const source = readFileSync(fileURLToPath(new URL("../../../src/shared/error-payload.ts", import.meta.url)), "utf8");
  assert.equal(/from\s+["'][^"']*telegram/i.test(source), false, "the client closure must not pull in telegram.ts");
});
