import { test } from "node:test";
import assert from "node:assert/strict";

import { IPC_NONCE_BYTES, PROJECT_ID_PATTERN, SESSION_TOKEN_BYTES } from "../../src/shared/constants.js";
import { computeRosterHash } from "../../src/shared/roster-hash.js";
import { toolErrorPayload } from "../../src/shared/error-payload.js";
import { fetchInputSchema, sendInputSchema, statusInputSchema, threadInputSchema } from "../../src/shared/tool-schemas.js";
import {
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_PAYLOAD_TOO_LARGE,
  HTTP_TOO_MANY_REQUESTS,
  HTTP_UNAUTHORIZED,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
  IPC_BAD_REQUEST,
  IPC_HOST_REJECTED,
  IPC_INTERNAL_ERROR,
  IPC_LOOPBACK_HOST,
  IPC_PAYLOAD_TOO_LARGE,
  IPC_REQUEST_SCHEMAS,
  IPC_RESPONSE_SCHEMAS,
  IPC_ROUTES,
  IPC_ROUTE_NOT_FOUND,
  IPC_SESSION_HOST_MAX_CHARS,
  IPC_TRANSPORT_ERROR_CODES,
  IPC_UNSUPPORTED_MEDIA_TYPE,
  identityRequestQuerySchema,
  identityResponseSchema,
  ipcErrorSchema,
  ipcTransportError,
  requestSchemaFor,
  responseSchemaFor,
  sessionBindingSchema,
  sessionCloseResponseSchema,
  sessionRequestSchema,
  sessionResponseSchema,
  toolSuccessSchema,
  type IpcRouteKey,
} from "../../src/shared/ipc-contract.js";

/**
 * `shared/ipc-contract.ts` (PR-29, design §10 "IPC", design §3 row 120). New code — no v1 range, no
 * `test/fixtures/v1-provenance.json` entry — so this twin pins the contract's own shapes directly
 * rather than against a v1 fixture.
 *
 * Every id below is a placeholder (AGENTS.md §3).
 */

const VALID_NONCE = "a".repeat(IPC_NONCE_BYTES * 2);
const VALID_DIGEST = "b".repeat(64);
const VALID_BEARER = "c".repeat(SESSION_TOKEN_BYTES * 2);
const VALID_ROSTER_HASH = computeRosterHash([{ agent_id: "@ipc-agent", user_id: 1 }]);
const VALID_PROJECT_ID = "ipc-contract-project";

test("PROJECT_ID_PATTERN accepts the fixture project id used below (sanity)", () => {
  assert.match(VALID_PROJECT_ID, PROJECT_ID_PATTERN);
});

test("IPC_ROUTES lists exactly the seven fixed routes, and every one has a request and a response schema", () => {
  assert.deepEqual(
    [...IPC_ROUTES].sort(),
    [
      "DELETE /session",
      "GET /identity",
      "POST /session",
      "POST /tools/fetch",
      "POST /tools/send",
      "POST /tools/status",
      "POST /tools/thread",
    ].sort(),
  );

  for (const route of IPC_ROUTES) {
    assert.ok(IPC_REQUEST_SCHEMAS[route], `missing request schema for ${route}`);
    assert.ok(IPC_RESPONSE_SCHEMAS[route], `missing response schema for ${route}`);
    assert.equal(requestSchemaFor(route), IPC_REQUEST_SCHEMAS[route]);
    assert.equal(responseSchemaFor(route), IPC_RESPONSE_SCHEMAS[route]);
  }
});

test("HTTP status constants carry the design's protocol numbers", () => {
  assert.equal(HTTP_UNAUTHORIZED, 401);
  assert.equal(HTTP_NOT_FOUND, 404);
  assert.equal(HTTP_CONFLICT, 409);
  assert.equal(HTTP_TOO_MANY_REQUESTS, 429);
  assert.equal(HTTP_PAYLOAD_TOO_LARGE, 413);
  assert.equal(HTTP_OK, 200);
  assert.equal(HTTP_BAD_REQUEST, 400);
  assert.equal(HTTP_FORBIDDEN, 403);
  assert.equal(HTTP_UNSUPPORTED_MEDIA_TYPE, 415);
  assert.equal(HTTP_INTERNAL_SERVER_ERROR, 500);
});

test("IPC_LOOPBACK_HOST is the literal loopback address", () => {
  assert.equal(IPC_LOOPBACK_HOST, "127.0.0.1");
});

test("identity request query accepts exactly a lowercase-hex nonce of IPC_NONCE_BYTES bytes", () => {
  assert.equal(identityRequestQuerySchema.safeParse({ nonce: VALID_NONCE }).success, true);
  assert.equal(identityRequestQuerySchema.safeParse({ nonce: VALID_NONCE.slice(1) }).success, false, "too short");
  assert.equal(identityRequestQuerySchema.safeParse({ nonce: VALID_NONCE + "a" }).success, false, "too long");
  assert.equal(identityRequestQuerySchema.safeParse({ nonce: VALID_NONCE.toUpperCase() }).success, false, "uppercase hex refused");
  assert.equal(identityRequestQuerySchema.safeParse({ nonce: VALID_NONCE, extra: "x" }).success, false, "strict: extra key refused");
});

test("identity response requires a 64-char proof, a nonce-shaped server_nonce, a positive pid and a non-empty build", () => {
  const valid = { proof: VALID_DIGEST, server_nonce: VALID_NONCE, pid: 1234, build: "2.0.0-alpha.0" };
  assert.equal(identityResponseSchema.safeParse(valid).success, true);
  assert.equal(identityResponseSchema.safeParse({ ...valid, proof: valid.proof.toUpperCase() }).success, false);
  assert.equal(identityResponseSchema.safeParse({ ...valid, pid: 0 }).success, false);
  assert.equal(identityResponseSchema.safeParse({ ...valid, pid: -1 }).success, false);
  assert.equal(identityResponseSchema.safeParse({ ...valid, build: "" }).success, false);
});

const VALID_SESSION_REQUEST = {
  project_id: VALID_PROJECT_ID,
  group_id: -1001,
  roster_hash: VALID_ROSTER_HASH,
  host: "dev-machine",
  pid: 4242,
  hmac: VALID_DIGEST,
};

test("session request accepts the full valid shape and is strict about extra keys", () => {
  assert.equal(sessionRequestSchema.safeParse(VALID_SESSION_REQUEST).success, true);
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, extra: "nope" }).success, false);
});

test("session request refuses a positive group_id (Telegram groups are negative)", () => {
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, group_id: 1001 }).success, false);
});

test("session request refuses a roster_hash missing the shared sha256: prefix or wrong hex length", () => {
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, roster_hash: "a".repeat(64) }).success, false);
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, roster_hash: `sha256:${"a".repeat(63)}` }).success, false);
});

test("session request bounds host length at IPC_SESSION_HOST_MAX_CHARS and refuses an empty host", () => {
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, host: "" }).success, false);
  assert.equal(
    sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, host: "h".repeat(IPC_SESSION_HOST_MAX_CHARS) }).success,
    true,
  );
  assert.equal(
    sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, host: "h".repeat(IPC_SESSION_HOST_MAX_CHARS + 1) }).success,
    false,
  );
});

test("session request refuses a non-64-char hmac", () => {
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, hmac: "not-hex" }).success, false);
});

const VALID_SESSION_BINDING = {
  project_id: VALID_PROJECT_ID,
  bot_id: 7,
  group_id: -1001,
  agent_id: "@ipc-agent",
  roster_hash: VALID_ROSTER_HASH,
};

test("session binding requires bot_id positive, group_id negative, a valid agent_id, and is strict", () => {
  assert.equal(sessionBindingSchema.safeParse(VALID_SESSION_BINDING).success, true);
  assert.equal(sessionBindingSchema.safeParse({ ...VALID_SESSION_BINDING, bot_id: -1 }).success, false);
  assert.equal(sessionBindingSchema.safeParse({ ...VALID_SESSION_BINDING, agent_id: "not-an-agent-id" }).success, false);
  assert.equal(sessionBindingSchema.safeParse({ ...VALID_SESSION_BINDING, extra: 1 }).success, false);
});

test("session response requires client_id, a session-token-shaped bearer, a valid binding, and a string[] of conditions", () => {
  const valid = { client_id: "client-1", bearer: VALID_BEARER, binding: VALID_SESSION_BINDING, conditions: [] };
  assert.equal(sessionResponseSchema.safeParse(valid).success, true);
  assert.equal(sessionResponseSchema.safeParse({ ...valid, conditions: ["roster_drift"] }).success, true);
  assert.equal(sessionResponseSchema.safeParse({ ...valid, client_id: "" }).success, false);
  assert.equal(sessionResponseSchema.safeParse({ ...valid, bearer: "too-short" }).success, false);
  assert.equal(sessionResponseSchema.safeParse({ ...valid, conditions: [1] }).success, false);
  assert.equal(sessionResponseSchema.safeParse({ ...valid, extra: true }).success, false);
});

test("DELETE /session's response is the provisional { closed: true } shape", () => {
  assert.equal(sessionCloseResponseSchema.safeParse({ closed: true }).success, true);
  assert.equal(sessionCloseResponseSchema.safeParse({ closed: false }).success, false);
  assert.equal(sessionCloseResponseSchema.safeParse({}).success, false);
});

test("DELETE /session's request schema accepts no body at all", () => {
  const schema = IPC_REQUEST_SCHEMAS["DELETE /session"];
  assert.equal(schema.safeParse(undefined).success, true);
  assert.equal(schema.safeParse({}).success, false);
});

test("the four tool routes map to the exact shared/tool-schemas.ts schema objects (reference equality)", () => {
  assert.equal(IPC_REQUEST_SCHEMAS["POST /tools/send"], sendInputSchema);
  assert.equal(IPC_REQUEST_SCHEMAS["POST /tools/fetch"], fetchInputSchema);
  assert.equal(IPC_REQUEST_SCHEMAS["POST /tools/status"], statusInputSchema);
  assert.equal(IPC_REQUEST_SCHEMAS["POST /tools/thread"], threadInputSchema);
});

test("every tool route's response schema is the same opaque toolSuccessSchema, accepting any JSON object", () => {
  const toolRoutes: IpcRouteKey[] = ["POST /tools/send", "POST /tools/fetch", "POST /tools/status", "POST /tools/thread"];
  for (const route of toolRoutes) {
    assert.equal(IPC_RESPONSE_SCHEMAS[route], toolSuccessSchema);
  }
  assert.equal(toolSuccessSchema.safeParse({ ok: true, anything: [1, 2, 3] }).success, true);
  assert.equal(toolSuccessSchema.safeParse("not an object").success, false);
});

test("ipcErrorSchema mirrors ToolErrorPayload exactly: a toolErrorPayload(...) result parses", () => {
  const payload = toolErrorPayload("UNKNOWN_RECIPIENT", "not in roster");
  assert.equal(ipcErrorSchema.safeParse(payload).success, true);
});

test("ipcErrorSchema accepts the optional refinements and is strict about unknown keys", () => {
  const withRefinements = { code: "RATE_LIMITED", message: "slow down", retryable: true, retry_after_s: 5, new_chat_id: 42 };
  assert.equal(ipcErrorSchema.safeParse(withRefinements).success, true);
  assert.equal(ipcErrorSchema.safeParse({ ...withRefinements, extra: 1 }).success, false);
  assert.equal(ipcErrorSchema.safeParse({ code: "X", message: "m" }).success, false, "retryable is required");
});

test("IPC_TRANSPORT_ERROR_CODES is the closed six-code set and every one builds a non-retryable payload", () => {
  assert.deepEqual(
    [...IPC_TRANSPORT_ERROR_CODES].sort(),
    [
      IPC_HOST_REJECTED,
      IPC_PAYLOAD_TOO_LARGE,
      IPC_UNSUPPORTED_MEDIA_TYPE,
      IPC_BAD_REQUEST,
      IPC_ROUTE_NOT_FOUND,
      IPC_INTERNAL_ERROR,
    ].sort(),
  );
  for (const code of IPC_TRANSPORT_ERROR_CODES) {
    const payload = ipcTransportError(code, "refused");
    assert.equal(payload.retryable, false);
    assert.equal(payload.code, code);
    assert.equal(ipcErrorSchema.safeParse(payload).success, true);
  }
});

test("session request and binding refuse a roster_hash whose digest is not lowercase hex", () => {
  const nonHex = VALID_ROSTER_HASH.slice(0, -1) + "z";
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, roster_hash: nonHex }).success, false);
  assert.equal(sessionBindingSchema.safeParse({ ...VALID_SESSION_BINDING, roster_hash: nonHex }).success, false);
});

test("session request refuses a project_id outside PROJECT_ID_PATTERN", () => {
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, project_id: "Not A Project!" }).success, false);
});

test("session response refuses a bearer longer than SESSION_TOKEN_BYTES", () => {
  const response = { client_id: "client-1", bearer: VALID_BEARER + "cc", binding: VALID_SESSION_BINDING, conditions: [] };
  assert.equal(sessionResponseSchema.safeParse(response).success, false);
});
