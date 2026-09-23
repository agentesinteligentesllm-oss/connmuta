import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TelegramClient, TelegramMessage, TelegramUser, TelegramChat } from "../../../src/daemon/telegram.js";
import { RoomGuardClient, WrongRoomError } from "../../../src/daemon/transport/room-guard.js";
import type { ProjectRosterEntry as RosterEntry } from "../../../src/shared/project-file.js";

function createMockTelegramClient(overrides: Partial<TelegramClient> = {}): TelegramClient & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    async getUpdates() {
      return [];
    },
    async sendMessage(params) {
      sent.push(params);
      return {
        message_id: 100,
        chat: { id: typeof params.chat_id === "number" ? params.chat_id : -100999, type: "group" },
        date: Math.floor(Date.now() / 1000),
        text: params.text,
      };
    },
    async getMe(): Promise<TelegramUser> {
      return { id: 1234567, is_bot: true, username: "test_bot" };
    },
    async getChat(chatId: number | string): Promise<TelegramChat> {
      return { id: typeof chatId === "number" ? chatId : -100999, type: "group" };
    },
    ...overrides,
  };
}

describe("RoomGuardClient (PT-01, D-22)", () => {
  const allowedGroupId = -1001234567890;
  const roster: readonly RosterEntry[] = [
    { agent_id: "@alice", user_id: 111, username: "alice_bot" },
    { agent_id: "@bob", user_id: 222, username: "bob_bot" },
  ];

  it("passes numeric chat_id matching binding.group_id through to underlying client", async () => {
    const mock = createMockTelegramClient();
    const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });

    const res = await guard.sendMessage({
      chat_id: allowedGroupId,
      text: "hello group",
    });

    assert.equal(res.message_id, 100);
    assert.equal(mock.sent.length, 1);
  });

  it("passes string chat_id matching @<username> of a roster member through to underlying client", async () => {
    const mock = createMockTelegramClient();
    const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });

    const res = await guard.sendMessage({
      chat_id: "@alice_bot",
      text: "hello alice",
    });

    assert.equal(res.message_id, 100);
    assert.equal(mock.sent.length, 1);
  });

  it("throws WrongRoomError before call when numeric chat_id does not match binding.group_id", async () => {
    const mock = createMockTelegramClient();
    const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });
    const wrongGroupId = -1009999999999;

    await assert.rejects(
      async () => {
        await guard.sendMessage({
          chat_id: wrongGroupId,
          text: "unauthorized room",
        });
      },
      (err: unknown) => {
        assert(err instanceof WrongRoomError);
        assert.equal(err.chat_id, wrongGroupId);
        assert.equal(err.expected_group_id, allowedGroupId);
        return true;
      }
    );

    assert.equal(mock.sent.length, 0, "underlying client must not be called");
  });

  it("throws WrongRoomError before call when string chat_id is not in roster", async () => {
    const mock = createMockTelegramClient();
    const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });
    const wrongUsername = "@eve_bot";

    await assert.rejects(
      async () => {
        await guard.sendMessage({
          chat_id: wrongUsername,
          text: "unauthorized direct message",
        });
      },
      (err: unknown) => {
        assert(err instanceof WrongRoomError);
        assert.equal(err.chat_id, wrongUsername);
        return true;
      }
    );

    assert.equal(mock.sent.length, 0, "underlying client must not be called");
  });

  it("throws WrongRoomError before call when string chat_id does not start with @", async () => {
    const mock = createMockTelegramClient();
    const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });
    const invalidChatId = "alice_bot";

    await assert.rejects(
      async () => {
        await guard.sendMessage({
          chat_id: invalidChatId,
          text: "no at prefix",
        });
      },
      (err: unknown) => {
        assert(err instanceof WrongRoomError);
        assert.equal(err.chat_id, invalidChatId);
        return true;
      }
    );

    assert.equal(mock.sent.length, 0, "underlying client must not be called");
  });

  it("normalizes roster usernames with leading @ so string chat_id matches with or without leading @ in roster (JD-A-004)", async () => {
    const mock = createMockTelegramClient();
    const rosterWithAt: readonly RosterEntry[] = [
      { agent_id: "@alice", user_id: 111, username: "@alice_bot" },
      { agent_id: "@bob", user_id: 222, username: "bob_bot" },
    ];
    const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster: rosterWithAt });

    const res1 = await guard.sendMessage({
      chat_id: "@alice_bot",
      text: "hello alice",
    });
    assert.equal(res1.message_id, 100);

    const res2 = await guard.sendMessage({
      chat_id: "@bob_bot",
      text: "hello bob",
    });
    assert.equal(res2.message_id, 100);
    assert.equal(mock.sent.length, 2);
  });

  describe("assertTarget (PR-27, the room-guard check with no network call)", () => {
    it("accepts a numeric chat_id matching binding.group_id and makes no call on the wrapped client", () => {
      const mock = createMockTelegramClient();
      const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });

      guard.assertTarget(allowedGroupId);

      assert.equal(mock.sent.length, 0, "assertTarget must never call the wrapped client");
    });

    it("accepts a string chat_id matching @<username> of a roster member and makes no call", () => {
      const mock = createMockTelegramClient();
      const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });

      guard.assertTarget("@alice_bot");

      assert.equal(mock.sent.length, 0, "assertTarget must never call the wrapped client");
    });

    it("throws WrongRoomError for a numeric chat_id mismatch and makes no call", () => {
      const mock = createMockTelegramClient();
      const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });
      const wrongGroupId = -1009999999999;

      assert.throws(
        () => guard.assertTarget(wrongGroupId),
        (err: unknown) => {
          assert(err instanceof WrongRoomError);
          assert.equal(err.chat_id, wrongGroupId);
          assert.equal(err.expected_group_id, allowedGroupId);
          return true;
        }
      );
      assert.equal(mock.sent.length, 0, "underlying client must not be called");
    });

    it("throws WrongRoomError for a string chat_id with no leading @ and makes no call", () => {
      const mock = createMockTelegramClient();
      const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });

      assert.throws(
        () => guard.assertTarget("alice_bot"),
        (err: unknown) => {
          assert(err instanceof WrongRoomError);
          assert.equal(err.chat_id, "alice_bot");
          return true;
        }
      );
      assert.equal(mock.sent.length, 0, "underlying client must not be called");
    });

    it("refuses a string without a leading @ even when dropping its first character would name a roster member", () => {
      const mock = createMockTelegramClient();
      const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });

      assert.throws(
        () => guard.assertTarget("xalice_bot"),
        (err: unknown) => err instanceof WrongRoomError && err.message.includes("must be @<username>"),
      );
      assert.equal(mock.sent.length, 0, "assertTarget must never call the wrapped client");
    });

    it("throws WrongRoomError for a username not present in the roster and makes no call", () => {
      const mock = createMockTelegramClient();
      const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });

      assert.throws(
        () => guard.assertTarget("@eve_bot"),
        (err: unknown) => {
          assert(err instanceof WrongRoomError);
          assert.equal(err.chat_id, "@eve_bot");
          return true;
        }
      );
      assert.equal(mock.sent.length, 0, "underlying client must not be called");
    });
  });

  it("delegates getUpdates, getMe, and getChat transparently to the underlying client", async () => {
    const mock = createMockTelegramClient();
    const guard = new RoomGuardClient(mock, { groupId: allowedGroupId, roster });

    const updates = await guard.getUpdates({ limit: 10 });
    assert.deepEqual(updates, []);

    const me = await guard.getMe();
    assert.equal(me.id, 1234567);

    const chat = await guard.getChat(allowedGroupId);
    assert.equal(chat.id, allowedGroupId);
  });
});
