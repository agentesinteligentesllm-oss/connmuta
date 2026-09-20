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

  async sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
    if (typeof params.chat_id === "number") {
      if (params.chat_id !== this.expectedGroupId) {
        throw new WrongRoomError(
          `Numeric chat_id ${params.chat_id} does not match binding group_id ${this.expectedGroupId}`,
          params.chat_id,
          this.expectedGroupId
        );
      }
    } else if (typeof params.chat_id === "string") {
      if (!params.chat_id.startsWith("@")) {
        throw new WrongRoomError(
          `String chat_id "${params.chat_id}" must be @<username> of a roster member`,
          params.chat_id,
          this.expectedGroupId
        );
      }
      const username = params.chat_id.slice(1).toLowerCase();
      if (!this.rosterUsernames.has(username)) {
        throw new WrongRoomError(
          `Target username "${params.chat_id}" is not present in the roster`,
          params.chat_id,
          this.expectedGroupId
        );
      }
    } else {
      throw new WrongRoomError(
        `Invalid chat_id type: ${typeof params.chat_id}`,
        params.chat_id,
        this.expectedGroupId
      );
    }

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
