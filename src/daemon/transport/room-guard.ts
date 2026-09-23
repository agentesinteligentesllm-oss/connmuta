import type {
  GetUpdatesParams,
  SendMessageParams,
  TelegramChat,
  TelegramClient,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from "../telegram.js";
import { TransportError } from "./types.js";

/**
 * Raised when an outbound sendMessage call targets a chat_id outside the binding's authorized scope (PT-01, D-22).
 */
export class WrongRoomError extends TransportError {
  readonly chat_id: number | string;
  readonly expected_group_id?: number;

  constructor(message: string, chat_id: number | string, expected_group_id?: number) {
    super(message);
    this.name = "WrongRoomError";
    this.chat_id = chat_id;
    this.expected_group_id = expected_group_id;
  }
}

export interface RoomGuardOptions {
  readonly groupId: number;
  readonly roster: readonly { readonly username: string }[] | Record<string, { readonly username: string }>;
}

/**
 * Decorator wrapping TelegramClient to enforce the D-22 room guard:
 * numeric chat_id must equal the binding's group_id;
 * string chat_id must be @<username> of a roster member.
 * Violations throw WrongRoomError before any network call (PT-01, PT-28).
 */
export class RoomGuardClient implements TelegramClient {
  private readonly client: TelegramClient;
  private readonly expectedGroupId: number;
  private readonly rosterUsernames: Set<string>;

  constructor(client: TelegramClient, options: RoomGuardOptions) {
    this.client = client;
    this.expectedGroupId = options.groupId;
    const usernames = new Set<string>();
    const entries = Array.isArray(options.roster)
      ? options.roster
      : Object.values(options.roster);
    for (const entry of entries) {
      if (entry?.username) {
        const normalized = entry.username.startsWith("@")
          ? entry.username.slice(1).toLowerCase()
          : entry.username.toLowerCase();
        usernames.add(normalized);
      }
    }
    this.rosterUsernames = usernames;
  }

  /**
   * The D-22 room-guard check on its own, with no network call — extracted from {@link sendMessage}
   * (PR-27) so the send path can pre-check a group post and every recipient's `@username` before
   * `transport.send` runs, instead of discovering a mismatch only after the group post already went
   * out. Same rules, same {@link WrongRoomError}s, same messages as before the extraction.
   */
  assertTarget(chat_id: number | string): void {
    if (typeof chat_id === "number") {
      if (chat_id !== this.expectedGroupId) {
        throw new WrongRoomError(
          `Numeric chat_id ${chat_id} does not match binding group_id ${this.expectedGroupId}`,
          chat_id,
          this.expectedGroupId
        );
      }
    } else if (typeof chat_id === "string") {
      if (!chat_id.startsWith("@")) {
        throw new WrongRoomError(
          `String chat_id "${chat_id}" must be @<username> of a roster member`,
          chat_id,
          this.expectedGroupId
        );
      }
      const username = chat_id.slice(1).toLowerCase();
      if (!this.rosterUsernames.has(username)) {
        throw new WrongRoomError(
          `Target username "${chat_id}" is not present in the roster`,
          chat_id,
          this.expectedGroupId
        );
      }
    } else {
      throw new WrongRoomError(
        `Invalid chat_id type: ${typeof chat_id}`,
        chat_id,
        this.expectedGroupId
      );
    }
  }

  async sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
    this.assertTarget(params.chat_id);
    return await this.client.sendMessage(params);
  }

  async getUpdates(params?: GetUpdatesParams): Promise<TelegramUpdate[]> {
    return await this.client.getUpdates(params);
  }

  async getMe(): Promise<TelegramUser> {
    return await this.client.getMe();
  }

  async getChat(chatId: number | string): Promise<TelegramChat> {
    return await this.client.getChat(chatId);
  }
}
