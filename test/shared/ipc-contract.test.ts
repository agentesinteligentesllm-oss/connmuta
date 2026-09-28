import { test } from "node:test";
import assert from "node:assert/strict";

import { DOORBELL_SCAN_DEPTH, IPC_NONCE_BYTES, PROJECT_ID_PATTERN, SESSION_TOKEN_BYTES } from "../../src/shared/constants.js";
import { ENVELOPE_TYPES } from "../../src/shared/envelope.js";
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
  channelCursorRequestSchema,
  channelCursorResponseSchema,
  doctorFindingSchema,
  doctorRequestSchema,
  doctorResponseSchema,
  doorbellRequestSchema,
  doorbellResponseSchema,
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

test("IPC_ROUTES lists exactly the ten fixed routes, and every one has a request and a response schema", () => {
  assert.deepEqual(
    [...IPC_ROUTES].sort(),
    [
      "DELETE /session",
      "GET /identity",
      "POST /channel/cursor",
      "POST /channel/doorbell",
      "POST /doctor",
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
  server_nonce: VALID_NONCE,
};

test("session request accepts the full valid shape and is strict about extra keys", () => {
  assert.equal(sessionRequestSchema.safeParse(VALID_SESSION_REQUEST).success, true);
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, extra: "nope" }).success, false);
});

test("session request requires a nonce-shaped server_nonce, matching GET /identity's own shape", () => {
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, server_nonce: VALID_NONCE.slice(1) }).success, false, "too short");
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, server_nonce: VALID_NONCE.toUpperCase() }).success, false, "uppercase hex refused");
  const { server_nonce: _omitted, ...withoutNonce } = VALID_SESSION_REQUEST;
  assert.equal(sessionRequestSchema.safeParse(withoutNonce).success, false, "server_nonce is required, not optional");
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

test("session request refuses a zero, negative, or non-integer pid", () => {
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, pid: 0 }).success, false);
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, pid: -1 }).success, false);
  assert.equal(sessionRequestSchema.safeParse({ ...VALID_SESSION_REQUEST, pid: 1.5 }).success, false);
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

// --- F4: POST /channel/doorbell, POST /channel/cursor (Unit 1: schema only, no live route yet) ---

test("the two channel routes map to the exact doorbell/cursor schema objects (reference equality)", () => {
  assert.equal(IPC_REQUEST_SCHEMAS["POST /channel/doorbell"], doorbellRequestSchema);
  assert.equal(IPC_RESPONSE_SCHEMAS["POST /channel/doorbell"], doorbellResponseSchema);
  assert.equal(IPC_REQUEST_SCHEMAS["POST /channel/cursor"], channelCursorRequestSchema);
  assert.equal(IPC_RESPONSE_SCHEMAS["POST /channel/cursor"], channelCursorResponseSchema);
});

const VALID_DOORBELL_REQUEST = { after_seq: 0 };

test("doorbell request accepts after_seq alone and an optional timeout_s, and is strict about extra keys", () => {
  assert.equal(doorbellRequestSchema.safeParse(VALID_DOORBELL_REQUEST).success, true);
  assert.equal(doorbellRequestSchema.safeParse({ ...VALID_DOORBELL_REQUEST, timeout_s: 30 }).success, true);
  assert.equal(doorbellRequestSchema.safeParse({ ...VALID_DOORBELL_REQUEST, extra: "nope" }).success, false);
  assert.equal(doorbellRequestSchema.safeParse({ ...VALID_DOORBELL_REQUEST, after_seq: -1 }).success, false);
});

const VALID_DOORBELL_RESPONSE = {
  count: 1,
  senders: ["@ipc-agent"],
  types: ["REQUEST"],
  threads: ["a1b2c3d4e5f6"],
  covered_through_seq: 5,
  saturated: false,
};

test("doorbell response round-trips a valid non-empty summary and is strict about extra keys (closed field set)", () => {
  assert.equal(doorbellResponseSchema.safeParse(VALID_DOORBELL_RESPONSE).success, true);
  assert.equal(doorbellResponseSchema.safeParse({ ...VALID_DOORBELL_RESPONSE, extra: "nope" }).success, false);
});

test("doorbell response round-trips a valid empty (count: 0) summary with every list empty", () => {
  const empty = { count: 0, senders: [], types: [], threads: [], covered_through_seq: 5, saturated: false };
  assert.equal(doorbellResponseSchema.safeParse(empty).success, true);
});

test("doorbell response rejects count: 0 paired with a non-empty senders/types/threads list (co-emptiness refine)", () => {
  const invalid = { ...VALID_DOORBELL_RESPONSE, count: 0 };
  assert.equal(doorbellResponseSchema.safeParse(invalid).success, false);
});

test("doorbell response rejects a types array longer than ENVELOPE_TYPES.length (the closed enum has no room for repeats)", () => {
  const atCeiling = { ...VALID_DOORBELL_RESPONSE, types: [...ENVELOPE_TYPES] };
  assert.equal(doorbellResponseSchema.safeParse(atCeiling).success, true);
  const overCeiling = { ...VALID_DOORBELL_RESPONSE, types: [...ENVELOPE_TYPES, "REQUEST"] };
  assert.equal(doorbellResponseSchema.safeParse(overCeiling).success, false);
});

test("doorbell response pins the DOORBELL_SCAN_DEPTH ceilings: accepted at the ceiling, rejected one over", () => {
  const agent = (i: number): string => `@agent-${i}`;
  const thread = (i: number): string => i.toString(16).padStart(12, "0");
  const fullLists = {
    senders: Array.from({ length: DOORBELL_SCAN_DEPTH }, (_, i) => agent(i)),
    threads: Array.from({ length: DOORBELL_SCAN_DEPTH }, (_, i) => thread(i)),
  };
  const atCeiling = { ...VALID_DOORBELL_RESPONSE, count: DOORBELL_SCAN_DEPTH, ...fullLists };
  assert.equal(doorbellResponseSchema.safeParse(atCeiling).success, true);

  assert.equal(doorbellResponseSchema.safeParse({ ...atCeiling, count: DOORBELL_SCAN_DEPTH + 1 }).success, false, "count");
  assert.equal(
    doorbellResponseSchema.safeParse({ ...atCeiling, senders: [...fullLists.senders, agent(DOORBELL_SCAN_DEPTH)] }).success,
    false,
    "senders",
  );
  assert.equal(
    doorbellResponseSchema.safeParse({ ...atCeiling, threads: [...fullLists.threads, thread(DOORBELL_SCAN_DEPTH)] }).success,
    false,
    "threads",
  );
});

test("doorbell response currently ACCEPTS count > 0 with every list empty: the refine pins only the count === 0 direction", () => {
  // Pinned as CURRENT behavior, not as a guarantee: the reverse co-emptiness direction is deliberately
  // not enforced by the schema (F4 PR-03 Arena consensus, disclosed). Tightening it would flip this test.
  const countWithoutLists = { count: 1, senders: [], types: [], threads: [], covered_through_seq: 5, saturated: false };
  assert.equal(doorbellResponseSchema.safeParse(countWithoutLists).success, true);
});

test("channel cursor request accepts an absent commit_seq (ensure + read) and a present one, and is strict about extra keys", () => {
  assert.equal(channelCursorRequestSchema.safeParse({}).success, true);
  assert.equal(channelCursorRequestSchema.safeParse({ commit_seq: 7 }).success, true);
  assert.equal(channelCursorRequestSchema.safeParse({ commit_seq: 7, extra: "nope" }).success, false);
  assert.equal(channelCursorRequestSchema.safeParse({ commit_seq: -1 }).success, false);
});

test("channel cursor response round-trips a valid inbox_seq and is strict about extra keys", () => {
  assert.equal(channelCursorResponseSchema.safeParse({ inbox_seq: 5 }).success, true);
  assert.equal(channelCursorResponseSchema.safeParse({ inbox_seq: 5, extra: "nope" }).success, false);
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

/**
 * `POST /doctor` (design §9.2 D-44). `project_id` is always optional at the schema level: `dm_probe:
 * true` requires it (the probe targets one binding's roster), `dm_probe: false` permits it present
 * (an online check scoped to one project) or absent (every bound project) — design §9.2 does not
 * forbid the former, and the response's own `bindings` array already reports per-project results.
 */
const VALID_DOCTOR_REQUEST = {
  server_nonce: VALID_NONCE,
  hmac: VALID_DIGEST,
  dm_probe: false,
};

test("doctor request accepts dm_probe: false with no project_id", () => {
  assert.equal(doctorRequestSchema.safeParse(VALID_DOCTOR_REQUEST).success, true);
});

test("doctor request accepts dm_probe: false WITH a project_id present (scoped online check, disclosed permissive reading)", () => {
  assert.equal(
    doctorRequestSchema.safeParse({ ...VALID_DOCTOR_REQUEST, project_id: VALID_PROJECT_ID }).success,
    true,
  );
});

test("doctor request accepts dm_probe: true only when project_id is present", () => {
  assert.equal(
    doctorRequestSchema.safeParse({ ...VALID_DOCTOR_REQUEST, dm_probe: true, project_id: VALID_PROJECT_ID }).success,
    true,
  );
  assert.equal(doctorRequestSchema.safeParse({ ...VALID_DOCTOR_REQUEST, dm_probe: true }).success, false, "dm_probe: true requires project_id");
});

test("doctor request refuses a project_id outside PROJECT_ID_PATTERN", () => {
  assert.equal(
    doctorRequestSchema.safeParse({ ...VALID_DOCTOR_REQUEST, project_id: "Not A Project!" }).success,
    false,
  );
});

test("doctor request requires nonce-shaped server_nonce and 64-char hmac, and is strict about extra keys", () => {
  assert.equal(doctorRequestSchema.safeParse({ ...VALID_DOCTOR_REQUEST, server_nonce: VALID_NONCE.slice(1) }).success, false, "too short");
  assert.equal(doctorRequestSchema.safeParse({ ...VALID_DOCTOR_REQUEST, hmac: "not-hex" }).success, false);
  const { dm_probe: _omitted, ...withoutDmProbe } = VALID_DOCTOR_REQUEST;
  assert.equal(doctorRequestSchema.safeParse(withoutDmProbe).success, false, "dm_probe is required, not optional");
  assert.equal(doctorRequestSchema.safeParse({ ...VALID_DOCTOR_REQUEST, extra: "nope" }).success, false);
});

test("doctor finding requires one of the three-member status enum and is strict", () => {
  const valid = { id: "bot-reachable", status: "pass", detail: "ok" };
  assert.equal(doctorFindingSchema.safeParse(valid).success, true);
  assert.equal(doctorFindingSchema.safeParse({ ...valid, status: "warn" }).success, true);
  assert.equal(doctorFindingSchema.safeParse({ ...valid, status: "fail" }).success, true);
  assert.equal(doctorFindingSchema.safeParse({ ...valid, status: "unknown" }).success, false);
  assert.equal(doctorFindingSchema.safeParse({ ...valid, extra: 1 }).success, false);
});

test("doctor response round-trips multiple bindings each with multiple checks, and is strict", () => {
  const valid = {
    bindings: [
      {
        project_id: VALID_PROJECT_ID,
        checks: [
          { id: "bot-identity", status: "pass", detail: "bot id matches" },
          { id: "group-reachable", status: "warn", detail: "not a supergroup" },
        ],
      },
      {
        project_id: "another-project",
        checks: [{ id: "roster-membership", status: "fail", detail: "left the group" }],
      },
    ],
  };
  assert.equal(doctorResponseSchema.safeParse(valid).success, true);
  assert.equal(doctorResponseSchema.safeParse({ ...valid, extra: 1 }).success, false);
});

test("doctor response refuses a check status outside the three-member enum", () => {
  const invalid = {
    bindings: [{ project_id: VALID_PROJECT_ID, checks: [{ id: "x", status: "ok", detail: "d" }] }],
  };
  assert.equal(doctorResponseSchema.safeParse(invalid).success, false);
});

test("doctor response refuses a binding project_id outside PROJECT_ID_PATTERN", () => {
  const invalid = { bindings: [{ project_id: "Not A Project!", checks: [] }] };
  assert.equal(doctorResponseSchema.safeParse(invalid).success, false);
});
