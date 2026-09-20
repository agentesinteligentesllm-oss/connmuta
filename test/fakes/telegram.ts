import type {
  GetUpdatesParams,
  SendMessageParams,
  TelegramChat,
  TelegramClient,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from "../../src/daemon/telegram.js";

/**
 * In-memory test double for {@link TelegramClient}. No test in this project
 * touches the live Telegram network (design.md's testing strategy) — every
 * layer above the client (transport, tools, and this phase's own tests) is
 * exercised against this fake instead.
 *
 * Queue inbound updates with `enqueueUpdates`, inspect outbound sends via
 * `sentMessages`, and script a one-shot failure with
 * `failNextGetUpdatesWith` / `failNextSendMessageWith` — each is consumed
 * exactly once, matching the real client's "no automatic retry" contract:
 * the fake never re-throws or repeats a scripted failure on its own.
 *
 * `failSendMessageTo` scripts a one-shot failure keyed by `chat_id` instead
 * of call order — needed to fail one specific recipient in the middle of a
 * multi-call dual-write fan-out (e.g. "DM 2 of 3") without also affecting
 * the group post or the other recipients, which a purely positional
 * "next call" script cannot target.
 */
/**
 * Models what Telegram stores as `Message.text` after parsing a `parse_mode:"HTML"`
 * payload: markup becomes `MessageEntity` metadata and the text itself is the un-escaped
 * inner text. This is what a RECEIVING bot's decoder actually sees, so it is the correct
 * subject for any test asserting decodability.
 *
 * Deliberately kept OUT of the fake client itself — the fake records exactly what it was
 * handed, and this transformation is applied explicitly by the tests that need it, so a
 * reader is never left wondering whether the double silently rewrote the payload.
 *
 * Verified against the live Bot API on 2026-08-15 with a body containing `<`, `>`, `&`,
 * literal `&amp;`/`&lt;` sequences and a literal `<blockquote>` tag: the returned
 * `Message.text` was byte-identical to `encodeEnvelope`'s canonical output.
 */
export function deliveredText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export class FakeTelegramClient implements TelegramClient {
  readonly sentMessages: SendMessageParams[] = [];
  /** Incremented on every `getUpdates()` call — lets a test assert "zero network calls" for a read-only tool. */
  getUpdatesCallCount = 0;
  /** Params of every `getUpdates()` call, so a test can assert what the tool actually asked Telegram for. */
  getUpdatesParams: GetUpdatesParams[] = [];

  /** What `getMe()` reports. Overridable so a doctor test can simulate a token/config mismatch. */
  identity: TelegramUser = { id: 8123456789, is_bot: true, username: "dev1_orion_bot" };
  /** What `getChat()` reports, keyed by chat id; anything absent is treated as reachable. */
  readonly chats = new Map<number | string, TelegramChat>();
  /** Every `getChat()` argument, so a test can assert which chat was probed. */
  readonly getChatCalls: Array<number | string> = [];

  private updateQueue: TelegramUpdate[] = [];
  private nextGetUpdatesError: Error | null = null;
  private nextSendMessageError: Error | null = null;
  private nextGetMeError: Error | null = null;
  private nextGetChatError: Error | null = null;
  private readonly chatIdErrors = new Map<string, Error>();
  private nextMessageId = 1;

  /** Scripts the NEXT `getMe()` call to reject. Consumed once, like every other scripted failure. */
  failNextGetMeWith(error: Error): void {
    this.nextGetMeError = error;
  }

  /** Scripts the NEXT `getChat()` call to reject. Consumed once. */
  failNextGetChatWith(error: Error): void {
    this.nextGetChatError = error;
  }

  async getMe(): Promise<TelegramUser> {
    const scripted = this.nextGetMeError;
    this.nextGetMeError = null;
    if (scripted) {
      throw scripted;
    }
    return this.identity;
  }

  async getChat(chatId: number | string): Promise<TelegramChat> {
    this.getChatCalls.push(chatId);
    const scripted = this.nextGetChatError;
    this.nextGetChatError = null;
    if (scripted) {
      throw scripted;
    }
    return this.chats.get(chatId) ?? { id: Number(chatId), type: "group" };
  }

  enqueueUpdates(updates: readonly TelegramUpdate[]): void {
    this.updateQueue.push(...updates);
  }

  /** Scripts the NEXT `getUpdates()` call to reject with `error`. Consumed once. */
  failNextGetUpdatesWith(error: Error): void {
    this.nextGetUpdatesError = error;
  }

  /** Scripts the NEXT `sendMessage()` call to reject with `error`. Consumed once. */
  failNextSendMessageWith(error: Error): void {
    this.nextSendMessageError = error;
  }

  /** Scripts the NEXT `sendMessage()` call whose `chat_id` matches `chatId` to reject with `error`. Consumed once. */
  failSendMessageTo(chatId: string | number, error: Error): void {
    this.chatIdErrors.set(String(chatId), error);
  }

  async getUpdates(_params: GetUpdatesParams = {}): Promise<TelegramUpdate[]> {
    this.getUpdatesCallCount++;
    this.getUpdatesParams.push(_params);
    if (this.nextGetUpdatesError) {
      const error = this.nextGetUpdatesError;
      this.nextGetUpdatesError = null;
      throw error;
    }
    const batch = this.updateQueue;
    this.updateQueue = [];
    return batch;
  }

  async sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
    const chatIdKey = String(params.chat_id);
    if (this.chatIdErrors.has(chatIdKey)) {
      const error = this.chatIdErrors.get(chatIdKey)!;
      this.chatIdErrors.delete(chatIdKey);
      throw error;
    }
    if (this.nextSendMessageError) {
      const error = this.nextSendMessageError;
      this.nextSendMessageError = null;
      throw error;
    }
    this.sentMessages.push(params);
    return {
      message_id: this.nextMessageId++,
      chat: { id: typeof params.chat_id === "number" ? params.chat_id : 0, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: params.text,
    };
  }
}
