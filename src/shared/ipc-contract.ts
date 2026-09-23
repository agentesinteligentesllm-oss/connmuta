/**
 * IPC wire contract for the daemon's local HTTP surface (`shared/ipc-contract.ts`, design §10 "IPC",
 * design §3's HTTP-status row: "Protocol numbers, named once in `ipc-contract.ts`"). New code: design
 * §12 lists no v1 range for this module — v1 had no local daemon and no HTTP surface at all — so this
 * file carries no vendoring header and adds no row to `test/fixtures/v1-provenance.json`.
 *
 * Holds three things, and three things only:
 * 1. The daemon's own HTTP status names — design §3 row 120's five, plus this scaffolding's own
 *    transport-status additions, each disclosed where it is declared below.
 * 2. The fixed seven-route table (design §10 D-13) and, for every route, the zod schema its request
 *    and its success response must satisfy — shared between the daemon's route handlers (PR-30/31)
 *    and the thin client (PR-33/34), so both read one definition of each shape (design §10
 *    "Contract" row: "the daemon re-validates tool inputs … it never trusts the client").
 * 3. The closed set of transport-level refusal codes `daemon/ipc/server.ts` itself can raise, before
 *    any route handler runs.
 *
 * Deliberately NOT this module's job: authenticating a request (no `Authorization` check anywhere
 * here — PR-30/31 own the bearer), the route HANDLERS (`daemon/ipc/{handshake,sessions,routes}.ts`),
 * the vocabulary of condition names a session may carry (owned by the daemon, not enumerated here),
 * and the SHAPE of a tool call's success body (owned by `shared/tool-output.ts` and the
 * `daemon/serve/*` modules — a tool route's success response is treated here as an opaque JSON
 * object; see {@link toolSuccessSchema}).
 */

import { z } from "zod";

import { IPC_NONCE_BYTES, PROJECT_ID_PATTERN, SESSION_TOKEN_BYTES } from "./constants.js";
import { AGENT_ID_PATTERN } from "./envelope.js";
import { ROSTER_HASH_PREFIX } from "./roster-hash.js";
import { fetchInputSchema, sendInputSchema, statusInputSchema, threadInputSchema } from "./tool-schemas.js";

// ---------------------------------------------------------------------------
// HTTP status names
// ---------------------------------------------------------------------------

/** No bearer, an unrecognized bearer, or a previous-boot bearer (design §10 "401" row, PT-24). */
export const HTTP_UNAUTHORIZED = 401;

/** No active binding for the requested `project_id`, or a route outside the fixed table (design §10 "Unbound" row). */
export const HTTP_NOT_FOUND = 404;

/** A live binding drift against the session's frozen snapshot (design §10 "Freeze" row: `BINDING_CHANGED`). */
export const HTTP_CONFLICT = 409;

/** Pending handshake nonces beyond `MAX_PENDING_HANDSHAKES` (design §10 "Flood" row). */
export const HTTP_TOO_MANY_REQUESTS = 429;

/** A request body over `IPC_MAX_BODY_BYTES` (`shared/constants.ts`), refused before it is parsed. */
export const HTTP_PAYLOAD_TOO_LARGE = 413;

/**
 * Disclosed addition beyond design §3 row 120's five names: the ordinary success status every
 * route's happy path returns.
 */
export const HTTP_OK = 200;

/**
 * Disclosed addition: a request the transport itself refuses as malformed before any handler runs —
 * an empty or non-JSON `POST` body, or a body on a method that must not carry one.
 */
export const HTTP_BAD_REQUEST = 400;

/** Disclosed addition: the `Host` header does not name this daemon's own loopback address (design §10 transport line: DNS-rebinding defence). */
export const HTTP_FORBIDDEN = 403;

/** Disclosed addition: a `POST` body whose `Content-Type` is not `application/json`. */
export const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;

/** Disclosed addition: a route handler threw — the daemon's own fault, never the caller's. */
export const HTTP_INTERNAL_SERVER_ERROR = 500;

/** The only host `daemon/ipc/server.ts` binds to and accepts requests from (design §10 transport line). */
export const IPC_LOOPBACK_HOST = "127.0.0.1";

/**
 * Maximum characters accepted in a session request's `host` field.
 *
 * `host` is the informational MCP-host label the thin client reports (`claude-code`, `cursor`,
 * `opencode`, …) and the daemon stores in `client_cursors.host` (DATA-MODEL, `client_cursors`). The
 * known labels are a dozen characters; 64 leaves room for any future host name while keeping a
 * malformed or hostile caller from writing an unbounded string into the ledger and its audit output.
 * It bounds length only; it does not validate the label's vocabulary.
 */
export const IPC_SESSION_HOST_MAX_CHARS = 64;

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

/**
 * The seven fixed IPC routes (design §10 D-13). `/panel/*` is F3 scope and is deliberately not a
 * member of this table.
 */
export const IPC_ROUTES = [
  "GET /identity",
  "POST /session",
  "DELETE /session",
  "POST /tools/send",
  "POST /tools/fetch",
  "POST /tools/status",
  "POST /tools/thread",
] as const;

/** One of the seven fixed routes, as `"<METHOD> <path>"`. */
export type IpcRouteKey = (typeof IPC_ROUTES)[number];

// ---------------------------------------------------------------------------
// Shared field shapes
// ---------------------------------------------------------------------------

/** Lowercase-hex digest length in characters for a raw `IPC_NONCE_BYTES`-byte value. */
const NONCE_HEX_LENGTH = IPC_NONCE_BYTES * 2;

/** A handshake nonce as the client and the daemon exchange it: lowercase hex, exactly `IPC_NONCE_BYTES` bytes. */
const nonceHexSchema = z.string().regex(new RegExp(`^[0-9a-f]{${NONCE_HEX_LENGTH}}$`));

/** Lowercase-hex digest length in characters for a raw `SESSION_TOKEN_BYTES`-byte value. */
const SESSION_TOKEN_HEX_LENGTH = SESSION_TOKEN_BYTES * 2;

/** A session bearer as `POST /session` mints it: lowercase hex, exactly `SESSION_TOKEN_BYTES` bytes. */
const sessionTokenHexSchema = z.string().regex(new RegExp(`^[0-9a-f]{${SESSION_TOKEN_HEX_LENGTH}}$`));

/**
 * SHA-256 (and HMAC-SHA256) hex-digest length in characters. Fixed at 64 by the algorithm itself,
 * independent of key or nonce length (RFC 2104 §3) — this is a different constant from the two hex
 * lengths above even though today's `IPC_NONCE_BYTES`/`SESSION_TOKEN_BYTES` choice (32) happens to
 * produce the same character count.
 */
const SHA256_HEX_LENGTH = 64;

/** A raw SHA-256 or HMAC-SHA256 digest, lowercase hex — the shape of `identity`'s `proof` and `session`'s `hmac`. */
const hmacDigestSchema = z.string().regex(new RegExp(`^[0-9a-f]{${SHA256_HEX_LENGTH}}$`));

/**
 * The shape `shared/roster-hash.ts` emits: its own `ROSTER_HASH_PREFIX` followed by SHA-256's 64 hex
 * characters (see {@link computeRosterHash} there). The anchored hex count is reconstructed here
 * rather than imported from `registry/schema.ts`'s `ROSTER_HASH_VALUE_PATTERN`, because that export
 * lives outside `src/shared` and a `shared/` module may import only zod, `node:crypto` and other
 * `shared/` modules (design §2.2 compile-unit boundary) — the prefix, the one value both modules must
 * actually agree on, is still the single shared constant.
 */
const rosterHashSchema = z.string().regex(new RegExp(`^${ROSTER_HASH_PREFIX}[0-9a-f]{${SHA256_HEX_LENGTH}}$`));

// ---------------------------------------------------------------------------
// GET /identity
// ---------------------------------------------------------------------------

/** `GET /identity`'s query string (design §10 sequence step 4: `GET /identity?nonce=<IPC_NONCE_BYTES hex>`). */
export const identityRequestQuerySchema = z.strictObject({
  nonce: nonceHexSchema,
});

/** `GET /identity`'s response (design §10 sequence step 5). */
export const identityResponseSchema = z.strictObject({
  proof: hmacDigestSchema,
  server_nonce: nonceHexSchema,
  pid: z.number().int().positive(),
  build: z.string().min(1),
});

export type IdentityResponse = z.infer<typeof identityResponseSchema>;

// ---------------------------------------------------------------------------
// POST /session, DELETE /session
// ---------------------------------------------------------------------------

/** `POST /session`'s request body (design §10 sequence step 7). */
export const sessionRequestSchema = z.strictObject({
  project_id: z.string().regex(PROJECT_ID_PATTERN),
  group_id: z.number().int().negative(),
  roster_hash: rosterHashSchema,
  host: z.string().min(1).max(IPC_SESSION_HOST_MAX_CHARS),
  pid: z.number().int().positive(),
  hmac: hmacDigestSchema,
});

export type SessionRequest = z.infer<typeof sessionRequestSchema>;

/**
 * The binding snapshot a session freezes for its lifetime (design §10 "Freeze" row). Every field
 * comes from the daemon's own registry/binding resolution — never echoed back from the request — so
 * this schema exists to describe the RESPONSE shape, not to validate caller input.
 */
export const sessionBindingSchema = z.strictObject({
  project_id: z.string().regex(PROJECT_ID_PATTERN),
  bot_id: z.number().int().positive(),
  group_id: z.number().int().negative(),
  agent_id: z.string().regex(AGENT_ID_PATTERN),
  roster_hash: rosterHashSchema,
});

/**
 * `POST /session`'s response (design §10 sequence step 8). `conditions` is a plain string array on
 * purpose: the condition-name vocabulary a session may carry (e.g. `roster_drift`) is owned by the
 * daemon's own condition machinery, not enumerated by this transport contract.
 */
export const sessionResponseSchema = z.strictObject({
  client_id: z.string().min(1),
  bearer: sessionTokenHexSchema,
  binding: sessionBindingSchema,
  conditions: z.array(z.string()),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/**
 * `DELETE /session`'s response. **Provisional**: the spec has no scenario naming this route's
 * behaviour — PR-31 owns closing that gap — so this is the minimal shape that lets the scaffolding's
 * route table and its tests compile against something, not a claim about the finished contract.
 * `DELETE /session` carries no request body (see {@link IPC_REQUEST_SCHEMAS}).
 */
export const sessionCloseResponseSchema = z.strictObject({
  closed: z.literal(true),
});

// ---------------------------------------------------------------------------
// Tool routes
// ---------------------------------------------------------------------------

/**
 * A tool route's success body. Deliberately a bare "some JSON object" check: the actual shapes
 * (`SendToolOutput`, the `fetch`/`status`/`thread` outputs) are owned by `shared/tool-output.ts` and
 * the `daemon/serve/*` modules, none of which this PR touches.
 */
export const toolSuccessSchema = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// Error responses
// ---------------------------------------------------------------------------

/**
 * The error body every route (identity/session included) may answer with instead of its success
 * shape. Mirrors `shared/error-payload.ts`'s `ToolErrorPayload` exactly — same fields, same optional
 * members — so a daemon-classified rejection and a bare transport refusal both serialize through one
 * wire shape.
 */
export const ipcErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  retry_after_s: z.number().optional(),
  new_chat_id: z.number().optional(),
});

export type IpcErrorPayload = z.infer<typeof ipcErrorSchema>;

/**
 * The daemon's own transport-refusal vocabulary — raised by `daemon/ipc/server.ts` itself, before any
 * route handler runs, never by a route handler. Closed set, every member non-retryable: a malformed
 * or oversized request does not become retryable just by trying again unchanged. This is NOT the
 * client-side family design §10's error-taxonomy table defines (`DAEMON_DOWN`, `IPC_ERROR`, …) — the
 * client (PR-33/34) surfaces any failure outside this contract as its own `IPC_ERROR`; the codes here
 * are what the daemon itself puts on the wire when it refuses a request at the transport layer.
 */
export const IPC_HOST_REJECTED = "IPC_HOST_REJECTED";
export const IPC_PAYLOAD_TOO_LARGE = "IPC_PAYLOAD_TOO_LARGE";
export const IPC_UNSUPPORTED_MEDIA_TYPE = "IPC_UNSUPPORTED_MEDIA_TYPE";
export const IPC_BAD_REQUEST = "IPC_BAD_REQUEST";
export const IPC_ROUTE_NOT_FOUND = "IPC_ROUTE_NOT_FOUND";
export const IPC_INTERNAL_ERROR = "IPC_INTERNAL_ERROR";

/** Every transport-refusal code {@link IPC_HOST_REJECTED} through {@link IPC_INTERNAL_ERROR}, as one closed list. */
export const IPC_TRANSPORT_ERROR_CODES = [
  IPC_HOST_REJECTED,
  IPC_PAYLOAD_TOO_LARGE,
  IPC_UNSUPPORTED_MEDIA_TYPE,
  IPC_BAD_REQUEST,
  IPC_ROUTE_NOT_FOUND,
  IPC_INTERNAL_ERROR,
] as const;

export type IpcTransportErrorCode = (typeof IPC_TRANSPORT_ERROR_CODES)[number];

/** Builds an {@link ipcErrorSchema}-shaped payload for one of {@link IPC_TRANSPORT_ERROR_CODES}. Always `retryable: false` (see the vocabulary's own doc). */
export function ipcTransportError(code: IpcTransportErrorCode, message: string): IpcErrorPayload {
  return { code, message, retryable: false };
}

/**
 * Disclosed extension to the vocabulary above (PR-30), raised by `daemon/ipc/handshake.ts` — a route
 * HANDLER, not `daemon/ipc/server.ts` itself — when `PendingHandshakeStore.issue` reports the
 * pending-nonce store already holds `MAX_PENDING_HANDSHAKES` entries (design §10 "Flood" row). Kept
 * out of {@link IPC_TRANSPORT_ERROR_CODES} rather than folded into it: that set's own contract is
 * "raised by the transport itself" and "every member non-retryable", and this code satisfies neither
 * — a flood clears on its own as pending nonces expire past `HANDSHAKE_NONCE_TTL_SECONDS`, with
 * nothing for the caller to fix.
 */
export const IPC_HANDSHAKE_FLOOD = "IPC_HANDSHAKE_FLOOD";

/** Builds an {@link ipcErrorSchema}-shaped payload for {@link IPC_HANDSHAKE_FLOOD}. Always `retryable: true` — see its own doc. */
export function ipcHandshakeFloodError(message: string): IpcErrorPayload {
  return { code: IPC_HANDSHAKE_FLOOD, message, retryable: true };
}

// ---------------------------------------------------------------------------
// Route -> schema tables
// ---------------------------------------------------------------------------

/**
 * Every route's request schema, keyed by {@link IpcRouteKey}. The four tool routes reference
 * `shared/tool-schemas.ts`'s schema objects directly (not a copy), so a caller can tell whether it is
 * looking at the one true `send`/`fetch`/`status`/`thread` input schema. `DELETE /session` maps to
 * `z.undefined()`: the route carries no request body at all (see {@link sessionCloseResponseSchema}).
 */
export const IPC_REQUEST_SCHEMAS = {
  "GET /identity": identityRequestQuerySchema,
  "POST /session": sessionRequestSchema,
  "DELETE /session": z.undefined(),
  "POST /tools/send": sendInputSchema,
  "POST /tools/fetch": fetchInputSchema,
  "POST /tools/status": statusInputSchema,
  "POST /tools/thread": threadInputSchema,
} satisfies Record<IpcRouteKey, z.ZodType>;

/** Every route's success-response schema, keyed by {@link IpcRouteKey}. See {@link toolSuccessSchema} for why the four tool routes share one opaque schema. */
export const IPC_RESPONSE_SCHEMAS = {
  "GET /identity": identityResponseSchema,
  "POST /session": sessionResponseSchema,
  "DELETE /session": sessionCloseResponseSchema,
  "POST /tools/send": toolSuccessSchema,
  "POST /tools/fetch": toolSuccessSchema,
  "POST /tools/status": toolSuccessSchema,
  "POST /tools/thread": toolSuccessSchema,
} satisfies Record<IpcRouteKey, z.ZodType>;

/** Looks up one route's request schema — the same table PR-30/31's handlers and PR-33/34's client read. */
export function requestSchemaFor(route: IpcRouteKey): (typeof IPC_REQUEST_SCHEMAS)[IpcRouteKey] {
  return IPC_REQUEST_SCHEMAS[route];
}

/** Looks up one route's success-response schema. See {@link requestSchemaFor}. */
export function responseSchemaFor(route: IpcRouteKey): (typeof IPC_RESPONSE_SCHEMAS)[IpcRouteKey] {
  return IPC_RESPONSE_SCHEMAS[route];
}
