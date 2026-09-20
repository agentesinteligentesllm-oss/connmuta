import { MAX_LONGPOLL_SECONDS, REQUEST_OVERHEAD_SECONDS } from "../shared/constants.js";
import { redactTokenShapes } from "../secret-store/redaction.js";

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  username?: string;
}
export interface TelegramChat {
  id: number;
  type: string;
}
export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}
export interface GetUpdatesParams {
  offset?: number;
  limit?: number;
  timeout?: number;
}
export interface SendMessageParams {
  chat_id: number | string;
  text: string;
  parse_mode?: "HTML";
  reply_to_message_id?: number;
  disable_notification?: boolean;
}

/** Thin client over Telegram Bot API; deleteMessage is deliberately absent. */
export interface TelegramClient {
  getUpdates(params?: GetUpdatesParams): Promise<TelegramUpdate[]>;
  sendMessage(params: SendMessageParams): Promise<TelegramMessage>;
  getMe(): Promise<TelegramUser>;
  getChat(chatId: number | string): Promise<TelegramChat>;
}

function sanitizeCause(cause: Error): Error {
  try {
    cause.message = redactTokenShapes(cause.message);
  } catch {
    // ignore if message property is non-writable
  }
  if (typeof cause.stack === "string") {
    try {
      cause.stack = redactTokenShapes(cause.stack);
    } catch {
      // ignore if stack property is non-writable
    }
  }
  return cause;
}

/** Base class for any error surfaced by a TelegramClient implementation. */
export class TelegramError extends Error {
  constructor(message: string) {
    super(redactTokenShapes(message));
    this.name = "TelegramError";
  }
}

/** Raised when Telegram responds with HTTP 429 (rate limited). */
export class RateLimitedError extends TelegramError {
  readonly retry_after_s: number;
  constructor(retryAfterS: number) {
    super(`Telegram rate limit exceeded, retry after ${retryAfterS}s`);
    this.name = "RateLimitedError";
    this.retry_after_s = retryAfterS;
  }
}

/** Raised when Telegram responds with HTTP 409 to getUpdates. */
export class TelegramConflictError extends TelegramError {
  constructor(description: string) {
    super(`Telegram getUpdates conflict (HTTP 409): ${description}`);
    this.name = "TelegramConflictError";
  }
}

/** Raised for any other non-2xx Telegram API response. */
export class TelegramApiError extends TelegramError {
  readonly statusCode: number;
  constructor(statusCode: number, description: string) {
    super(`Telegram API error ${statusCode}: ${description}`);
    this.name = "TelegramApiError";
    this.statusCode = statusCode;
  }
}

/** Raised when Telegram answers with parameters.migrate_to_chat_id. */
export class GroupMigratedError extends TelegramApiError {
  readonly new_chat_id: number;
  constructor(statusCode: number, description: string, newChatId: number) {
    super(statusCode, description);
    this.name = "GroupMigratedError";
    this.new_chat_id = newChatId;
    this.message = redactTokenShapes(
      `${this.message} — the group was upgraded to a supergroup, so the configured chat_id is dead ` +
      `and every further post to it will fail. Set "chat_id": ${newChatId} in configuration and restart. ` +
      `This is NOT followed automatically: chat_id is an access-control boundary.`,
    );
  }
}

/** Raised when the HTTP request itself never produced a response (timeout, network drop). */
export class TelegramNetworkError extends TelegramError {
  constructor(method: string, cause: unknown) {
    const reason = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
    super(`Telegram ${method} request failed before any response: ${reason}`);
    this.name = "TelegramNetworkError";
    this.cause = cause instanceof Error ? sanitizeCause(cause) : cause;
  }
}

/** Raised when a response arrived but its body was not valid JSON. */
export class TelegramProtocolError extends TelegramError {
  readonly statusCode: number;
  constructor(method: string, statusCode: number, cause: unknown) {
    const reason = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
    super(`Telegram ${method} returned a non-JSON body with HTTP ${statusCode} — an intermediary answered instead of the Bot API: ${reason}`);
    this.name = "TelegramProtocolError";
    this.statusCode = statusCode;
    this.cause = cause instanceof Error ? sanitizeCause(cause) : cause;
  }
}

/**
 * The structured form of a Telegram failure: a `code` an agent can branch on, plus whatever fields
 * make that particular failure actionable.
 *
 * Lives here rather than in the MCP layer because two callers now need the SAME vocabulary — the
 * tool-error payload in `index.ts`, and `GroupTransport`'s soft-failure outcome, which reports a
 * group post that failed without throwing (D1). Two tables would mean an agent branching on two
 * spellings of the same condition.
 */
export interface TelegramErrorClassification {
  code:
    | "GROUP_MIGRATED"
    | "TELEGRAM_RATE_LIMITED"
    | "TELEGRAM_CONFLICT"
    | "TELEGRAM_NETWORK_ERROR"
    | "TELEGRAM_PROTOCOL_ERROR"
    | "TELEGRAM_API_ERROR"
    | "TELEGRAM_ERROR";
  /**
   * Whether calling again could plausibly succeed without anything changing (D3).
   *
   * Today an agent has to know from memory which codes are transient, and one that does not know
   * either never retries or retries something that will never work. This is the field that answers
   * it, and it is present on EVERY error payload rather than only the interesting ones — an absent
   * `retryable` would just move the guessing.
   */
  retryable: boolean;
  retry_after_s?: number;
  new_chat_id?: number;
}

/**
 * Classifies a Telegram failure, or returns `null` for anything that is not one.
 *
 * The `null` is deliberate and load-bearing: a genuinely unexpected bug must keep propagating rather
 * than be disguised as a handled protocol condition.
 *
 * {@link GroupMigratedError} is tested FIRST because it extends {@link TelegramApiError}; reversing
 * the order silently reclassifies a permanent outage as a generic 400 and discards the successor
 * chat id that is its only remedy.
 */
export function classifyTelegramError(err: unknown): TelegramErrorClassification | null {
  if (err instanceof GroupMigratedError) {
    // Never retryable: the configured chat is permanently dead and a human must authorize the new
    // one. Retrying is the one thing guaranteed not to work.
    return { code: "GROUP_MIGRATED", retryable: false, new_chat_id: err.new_chat_id };
  }
  if (err instanceof RateLimitedError) {
    return { code: "TELEGRAM_RATE_LIMITED", retryable: true, retry_after_s: err.retry_after_s };
  }
  if (err instanceof TelegramConflictError) {
    // Another poller holds this token's exclusive long-poll — a second bridge on the same token,
    // which is a configuration fault, not a transient one. Retrying loops forever.
    return { code: "TELEGRAM_CONFLICT", retryable: false };
  }
  if (err instanceof TelegramNetworkError) {
    return { code: "TELEGRAM_NETWORK_ERROR", retryable: true };
  }
  if (err instanceof TelegramProtocolError) {
    // An intermediary answered instead of the Bot API. That is transient far more often than not.
    return { code: "TELEGRAM_PROTOCOL_ERROR", retryable: true };
  }
  if (err instanceof TelegramApiError) {
    // 5xx is Telegram's own fault and passes; 4xx means the request was wrong and will be wrong
    // again. 429 never reaches here — RateLimitedError is matched above.
    return { code: "TELEGRAM_API_ERROR", retryable: err.statusCode >= 500 };
  }
  if (err instanceof TelegramError) {
    // Unclassified: fail toward NOT retrying, so an unknown failure cannot become a hot loop.
    return { code: "TELEGRAM_ERROR", retryable: false };
  }
  return null;
}

/** How deep to follow `cause` before giving up. Bounded so a cyclic chain cannot spin (D2). */
const MAX_CAUSE_DEPTH = 8;

/**
 * Classifies the first Telegram failure found by walking the `cause` chain (D2).
 *
 * The transport wraps a Telegram error in a `TransportError`, and the send tool wraps THAT in a
 * `SendToolError` — so by the time a rate limit or a dead chat reaches the agent, the code was
 * flattened to a generic `TRANSPORT_ERROR` and `retry_after_s` had been reduced to English inside a
 * sentence. Walking the chain fixes it in ONE place for both tools and leaves every wrapper intact.
 */
export function classifyErrorChain(err: unknown): TelegramErrorClassification | null {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== null && current !== undefined; depth++) {
    const classified = classifyTelegramError(current);
    if (classified !== null) {
      return classified;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export const TELEGRAM_API_BASE_URL = "https://api.telegram.org";

/** Abort budget for one request in ms, clamped to MAX_LONGPOLL_SECONDS + REQUEST_OVERHEAD_SECONDS. */
export function requestTimeoutMs(pollSeconds: number = 0): number {
  const bounded = Math.min(Math.max(pollSeconds, 0), MAX_LONGPOLL_SECONDS);
  return (bounded + REQUEST_OVERHEAD_SECONDS) * 1000;
}

type TelegramApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error_code: number; description: string; parameters?: { retry_after?: number; migrate_to_chat_id?: number } };

export interface TelegramApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Real TelegramClient implementation over the Bot API via fetch. */
export class TelegramApiClient implements TelegramClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(token: string, options: TelegramApiClientOptions = {}) {
    const base = options.baseUrl ?? TELEGRAM_API_BASE_URL;
    this.baseUrl = `${base}/bot${token}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getUpdates(params: GetUpdatesParams = {}): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>("getUpdates", params, requestTimeoutMs(params.timeout));
  }
  async sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
    return this.call<TelegramMessage>("sendMessage", params, requestTimeoutMs());
  }
  async getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>("getMe", {}, requestTimeoutMs());
  }
  async getChat(chatId: number | string): Promise<TelegramChat> {
    return this.call<TelegramChat>("getChat", { chat_id: chatId }, requestTimeoutMs());
  }

  private async call<T>(method: string, body: unknown, timeoutMs: number): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new TelegramNetworkError(method, err);
    }

    let responseText = "";
    try {
      responseText = await response.text();
    } catch {
      // ignore
    }

    let payload: TelegramApiResponse<T>;
    try {
      payload = JSON.parse(responseText) as TelegramApiResponse<T>;
    } catch (err) {
      const cause = responseText
        ? new Error(`${err instanceof Error ? err.message : String(err)}: ${responseText}`, { cause: err })
        : err;
      throw new TelegramProtocolError(method, response.status, cause);
    }

    if (payload.ok) return payload.result;

    const migrateToChatId = payload.parameters?.migrate_to_chat_id;
    if (typeof migrateToChatId === "number") {
      throw new GroupMigratedError(response.status, payload.description, migrateToChatId);
    }
    if (response.status === 429) throw new RateLimitedError(payload.parameters?.retry_after ?? 1);
    if (response.status === 409) throw new TelegramConflictError(payload.description);
    throw new TelegramApiError(response.status, payload.description);
  }
}
