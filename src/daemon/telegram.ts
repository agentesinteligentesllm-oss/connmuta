import { MAX_LONGPOLL_SECONDS, REQUEST_OVERHEAD_SECONDS } from "../shared/constants.js";

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

/** Base class for any error surfaced by a TelegramClient implementation. */
export class TelegramError extends Error {
  constructor(message: string) {
    super(message);
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
    this.message = `${this.message} — the group was upgraded to a supergroup, so the configured chat_id is dead ` +
      `and every further post to it will fail. Set "chat_id": ${newChatId} in configuration and restart. ` +
      `This is NOT followed automatically: chat_id is an access-control boundary.`;
  }
}

/** Raised when the HTTP request itself never produced a response (timeout, network drop). */
export class TelegramNetworkError extends TelegramError {
  constructor(method: string, cause: unknown) {
    const reason = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
    super(`Telegram ${method} request failed before any response: ${reason}`);
    this.name = "TelegramNetworkError";
    this.cause = cause;
  }
}

/** Raised when a response arrived but its body was not valid JSON. */
export class TelegramProtocolError extends TelegramError {
  readonly statusCode: number;
  constructor(method: string, statusCode: number, cause: unknown) {
    super(`Telegram ${method} returned a non-JSON body with HTTP ${statusCode} — an intermediary answered instead of the Bot API`);
    this.name = "TelegramProtocolError";
    this.statusCode = statusCode;
    this.cause = cause;
  }
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

    let payload: TelegramApiResponse<T>;
    try {
      payload = (await response.json()) as TelegramApiResponse<T>;
    } catch (err) {
      throw new TelegramProtocolError(method, response.status, err);
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
