import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { openLedger } from "../../src/ledger/open.js";
import { readThreadRecord } from "../../src/ledger/threads.js";
import { readUnknownSender } from "../../src/ledger/unknown-senders.js";
import { admitTelegramUpdates, type AdmissionBinding } from "../../src/daemon/admission.js";
import type { TelegramUpdate } from "../../src/daemon/telegram.js";
import { encodeEnvelope } from "../../src/shared/envelope.js";
import { PROTOCOL_SENTINEL } from "../../src/shared/constants.js";

function withLedger(run: (db: DatabaseSync) => void): void {
  const home = mkdtempSync(join(tmpdir(), "conmuta-admission-test-"));
  const ledger = openLedger({ homeDir: home });
  try {
    run(ledger.db);
  } finally {
    ledger.db.close();
    rmSync(home, { recursive: true, force: true });
  }
}

function createTestBinding(overrides: Partial<AdmissionBinding> = {}): AdmissionBinding {
  return {
    project_id: "test-project",
    bot_id: 100,
    agent_id: "bot-agent",
    group_id: -1001234567890,
    roster_snapshot: [
      { agent_id: "alice-agent", user_id: 111, username: "alice" },
      { agent_id: "bob-agent", user_id: 222, username: "bob" },
      { agent_id: "bot-agent", user_id: 333, username: "ourbot" },
    ],
    ...overrides,
  };
}

describe("daemon/admission.ts — seven-step admission pipeline", () => {
  it("Scenario: Foreign chat dropped and audited without a body (PT-03)", () => {
    withLedger((db) => {
      const binding = createTestBinding();

      // Telegram update from a foreign group chat
      const update: TelegramUpdate = {
        update_id: 1001,
        message: {
          message_id: 501,
          date: 1700000000,
          chat: { id: -1009999999999, type: "supergroup" }, // not binding.group_id and not private
          from: { id: 111, is_bot: false, username: "alice" },
          text: "hello from foreign group",
        },
      };

      const result = admitTelegramUpdates(db, binding, [update]);

      assert.equal(result.inserted, 0);
      assert.equal(result.dropped, 1);
      assert.equal(result.counts.foreign_chat, 1);

      // Check audit_log: exactly one row, no body, reason "foreign_chat", chat_id = -1009999999999
      const audits = db.prepare("SELECT * FROM audit_log WHERE project_id = ?").all(binding.project_id) as Array<{
        reason: string;
        chat_id: number;
        direction: string;
      }>;
      assert.equal(audits.length, 1);
      assert.equal(audits[0].reason, "foreign_chat");
      assert.equal(audits[0].chat_id, -1009999999999);
      assert.equal(audits[0].direction, "reject");

      // Ensure no updates row
      const countUpdates = db.prepare("SELECT count(*) as c FROM updates").get() as { c: number };
      assert.equal(countUpdates.c, 0);
    });
  });

  it("Scenario: Unknown sender recorded, never surfaced (PT-04)", () => {
    withLedger((db) => {
      const binding = createTestBinding();

      // Telegram update from a user not in roster_snapshot
      const update: TelegramUpdate = {
        update_id: 1002,
        message: {
          message_id: 502,
          date: 1700000001,
          chat: { id: binding.group_id, type: "supergroup" },
          from: { id: 999, is_bot: false, username: "stranger" },
          text: encodeEnvelope({
            type: "REQUEST",
            eid: "018f0000-0000-7000-8000-000000000001",
            thread: "018f0000-0000-7000-8000-000000000001",
            ts: "2026-01-01T00:00:00.000Z",
            from: "stranger-agent",
            to: "bot-agent",
            body: "secret attack text",
          }),
        },
      };

      const result = admitTelegramUpdates(db, binding, [update]);

      assert.equal(result.inserted, 0);
      assert.equal(result.dropped, 1);
      assert.equal(result.counts.unknown_sender, 1);

      // Audit row exists with reason "unknown_sender"
      const audits = db.prepare("SELECT * FROM audit_log WHERE project_id = ?").all(binding.project_id) as Array<{
        reason: string;
        direction: string;
      }>;
      assert.equal(audits.length, 1);
      assert.equal(audits[0].reason, "unknown_sender");
      assert.equal(audits[0].direction, "reject");

      // unknown_senders table has the record with NO body
      const unknown = readUnknownSender(db, binding.bot_id, 999);
      assert.ok(unknown);
      assert.equal(unknown.user_id, 999);
      assert.equal(unknown.username, "stranger");
      assert.equal(unknown.count, 1);

      // Ensure no updates row
      const countUpdates = db.prepare("SELECT count(*) as c FROM updates").get() as { c: number };
      assert.equal(countUpdates.c, 0);
    });
  });

  it("Scenario: Mixed batch isolates human chat text (PT-31)", () => {
    withLedger((db) => {
      const binding = createTestBinding();

      const validEid = "018f0000-0000-7000-8000-000000000010";
      const validEnvelopeText = encodeEnvelope({
        type: "REQUEST",
        eid: validEid,
        thread: validEid,
        ts: "2026-01-01T00:00:00.000Z",
        from: "alice-agent",
        to: "bot-agent",
        body: "valid message body",
      });

      const updates: TelegramUpdate[] = [
        // 1. Human chat message (no sentinel)
        {
          update_id: 2001,
          message: {
            message_id: 601,
            date: 1700000010,
            chat: { id: binding.group_id, type: "supergroup" },
            from: { id: 111, is_bot: false, username: "alice" },
            text: "Hey everyone, lunch at 12?",
          },
        },
        // 2. Valid envelope
        {
          update_id: 2002,
          message: {
            message_id: 602,
            date: 1700000011,
            chat: { id: binding.group_id, type: "supergroup" },
            from: { id: 111, is_bot: false, username: "alice" },
            text: validEnvelopeText,
          },
        },
        // 3. Malformed envelope (bad json)
        {
          update_id: 2003,
          message: {
            message_id: 603,
            date: 1700000012,
            chat: { id: binding.group_id, type: "supergroup" },
            from: { id: 111, is_bot: false, username: "alice" },
            text: `[${PROTOCOL_SENTINEL}] {"type": "REQUEST", malformed...`,
          },
        },
        // 4. Self-echo (from binding.agent_id / user_id 333)
        {
          update_id: 2004,
          message: {
            message_id: 604,
            date: 1700000013,
            chat: { id: binding.group_id, type: "supergroup" },
            from: { id: 333, is_bot: true, username: "ourbot" },
            text: encodeEnvelope({
              type: "REQUEST",
              eid: "018f0000-0000-7000-8000-000000000020",
              thread: "018f0000-0000-7000-8000-000000000020",
              ts: "2026-01-01T00:00:00.000Z",
              from: "bot-agent",
              to: "alice-agent",
              body: "our own send echo",
            }),
          },
        },
        // 5. Duplicate eid
        {
          update_id: 2005,
          message: {
            message_id: 605,
            date: 1700000014,
            chat: { id: binding.group_id, type: "supergroup" },
            from: { id: 111, is_bot: false, username: "alice" },
            text: validEnvelopeText, // same eid as update 2002
          },
        },
      ];

      const result = admitTelegramUpdates(db, binding, updates);

      // Only update 2002 is inserted
      assert.equal(result.inserted, 1);
      assert.equal(result.counts.non_envelope, 1);
      assert.equal(result.counts.malformed, 1);
      assert.equal(result.counts.self_echo, 1);
      assert.equal(result.counts.duplicate, 1);

      // Audit log has rows for non_envelope, malformed, duplicate, and receive/ok/opened
      const audits = db.prepare("SELECT * FROM audit_log WHERE project_id = ?").all(binding.project_id) as Array<{
        reason: string;
      }>;
      const reasons = audits.map((a) => a.reason);
      assert.ok(reasons.includes("non_envelope"));
      assert.ok(reasons.includes("malformed"));
      assert.ok(reasons.includes("duplicate"));
      assert.ok(reasons.includes("opened"));

      // Check that human text "lunch at 12" is NOT in any audit body (audit_log has no body column anyway)
      // and not in updates.
      const updatesRows = db.prepare("SELECT * FROM updates").all() as Array<{ body: string }>;
      assert.equal(updatesRows.length, 1);
      assert.equal(updatesRows[0].body, "valid message body");
    });
  });

  it("Scenario: updates.body is NULL for rejected and ignored, kept for not_mine and noted (D-20)", () => {
    withLedger((db) => {
      const binding = createTestBinding();

      // 1. noted: BROADCAST
      const eidNoted = "018f0000-0000-7000-8000-000000000101";
      const updateNoted: TelegramUpdate = {
        update_id: 3001,
        message: {
          message_id: 701,
          date: 1700000021,
          chat: { id: binding.group_id, type: "supergroup" },
          from: { id: 111, is_bot: false, username: "alice" },
          text: encodeEnvelope({
            type: "BROADCAST",
            eid: eidNoted,
            thread: eidNoted,
            ts: "2026-01-01T00:00:00.000Z",
            from: "alice-agent",
            to: null,
            body: "broadcast status update",
          }),
        },
      };

      // 2. not_mine: REQUEST to bob-agent (we are bot-agent)
      const eidNotMine = "018f0000-0000-7000-8000-000000000102";
      const updateNotMine: TelegramUpdate = {
        update_id: 3002,
        message: {
          message_id: 702,
          date: 1700000022,
          chat: { id: binding.group_id, type: "supergroup" },
          from: { id: 111, is_bot: false, username: "alice" },
          text: encodeEnvelope({
            type: "REQUEST",
            eid: eidNotMine,
            thread: eidNotMine,
            ts: "2026-01-01T00:00:00.000Z",
            from: "alice-agent",
            to: "bob-agent",
            body: "request intended for bob",
          }),
        },
      };

      // 3. ignored: ACK for a nonexistent thread
      const eidIgnored = "018f0000-0000-7000-8000-000000000103";
      const updateIgnored: TelegramUpdate = {
        update_id: 3003,
        message: {
          message_id: 703,
          date: 1700000023,
          chat: { id: binding.group_id, type: "supergroup" },
          from: { id: 111, is_bot: false, username: "alice" },
          text: encodeEnvelope({
            type: "ACK",
            eid: eidIgnored,
            thread: "018f0000-0000-7000-8000-999999999999", // nonexistent
            ts: "2026-01-01T00:00:00.000Z",
            from: "alice-agent",
            to: "bot-agent",
            body: "ack for phantom thread",
          }),
        },
      };

      // First open a thread so we can test 'rejected'
      const eidThread = "018f0000-0000-7000-8000-000000000100";
      const updateOpen: TelegramUpdate = {
        update_id: 3000,
        message: {
          message_id: 700,
          date: 1700000020,
          chat: { id: binding.group_id, type: "supergroup" },
          from: { id: 111, is_bot: false, username: "alice" },
          text: encodeEnvelope({
            type: "REQUEST",
            eid: eidThread,
            thread: eidThread,
            ts: "2026-01-01T00:00:00.000Z",
            from: "alice-agent",
            to: "bot-agent",
            body: "original request",
          }),
        },
      };

      admitTelegramUpdates(db, binding, [updateOpen]);

      // 4. rejected: second REQUEST on existing open thread (ALREADY_REQUESTED / invalid transition)
      const eidRejected = "018f0000-0000-7000-8000-000000000104";
      const updateRejected: TelegramUpdate = {
        update_id: 3004,
        message: {
          message_id: 704,
          date: 1700000024,
          chat: { id: binding.group_id, type: "supergroup" },
          from: { id: 222, is_bot: false, username: "bob" },
          text: encodeEnvelope({
            type: "REQUEST",
            eid: eidRejected,
            thread: eidThread, // already open!
            ts: "2026-01-01T00:00:00.000Z",
            from: "bob-agent",
            to: "bot-agent",
            body: "second request on open thread",
          }),
        },
      };

      admitTelegramUpdates(db, binding, [updateNoted, updateNotMine, updateIgnored, updateRejected]);

      const rows = db.prepare("SELECT eid, apply_outcome, body FROM updates WHERE eid IN (?, ?, ?, ?)").all(
        eidNoted,
        eidNotMine,
        eidIgnored,
        eidRejected
      ) as Array<{ eid: string; apply_outcome: string; body: string | null }>;

      const rowMap = new Map(rows.map((r) => [r.eid, r]));

      const rNoted = rowMap.get(eidNoted)!;
      assert.equal(rNoted.apply_outcome, "noted");
      assert.equal(rNoted.body, "broadcast status update");

      const rNotMine = rowMap.get(eidNotMine)!;
      assert.equal(rNotMine.apply_outcome, "not_mine");
      assert.equal(rNotMine.body, "request intended for bob");

      const rIgnored = rowMap.get(eidIgnored)!;
      assert.equal(rIgnored.apply_outcome, "ignored");
      assert.equal(rIgnored.body, null, "updates.body must be NULL for ignored (D-20)");

      const rRejected = rowMap.get(eidRejected)!;
      assert.equal(rRejected.apply_outcome, "rejected");
      assert.equal(rRejected.body, null, "updates.body must be NULL for rejected (D-20)");
    });
  });

  it("Scenario: Forged envelope's own from claim is discarded (PT-16)", () => {
    withLedger((db) => {
      const binding = createTestBinding();

      // alice (user_id 111) sends an envelope claiming to be bob-agent
      const eid = "018f0000-0000-7000-8000-000000000201";
      const update: TelegramUpdate = {
        update_id: 4001,
        message: {
          message_id: 801,
          date: 1700000030,
          chat: { id: binding.group_id, type: "supergroup" },
          from: { id: 111, is_bot: false, username: "alice" },
          text: encodeEnvelope({
            type: "REQUEST",
            eid,
            thread: eid,
            ts: "2026-01-01T00:00:00.000Z",
            from: "bob-agent", // FORGED claim! Telegram sender is user_id 111 (alice-agent)
            to: "bot-agent",
            body: "forged sender test",
          }),
        },
      };

      const result = admitTelegramUpdates(db, binding, [update]);
      assert.equal(result.inserted, 1);

      // Verify stored row in updates
      const row = db.prepare("SELECT from_agent_id, from_user_id, envelope_json FROM updates WHERE eid = ?").get(eid) as {
        from_agent_id: string;
        from_user_id: number;
        envelope_json: string;
      };

      assert.equal(row.from_agent_id, "alice-agent");
      assert.equal(row.from_user_id, 111);

      // Verify parsed envelope_json has the verified sender and NO body key
      const parsedEnvelope = JSON.parse(row.envelope_json);
      assert.equal(parsedEnvelope.from, "alice-agent", "envelope_json from must be overwritten with verified sender");
      assert.equal(parsedEnvelope.body, undefined, "envelope_json must NOT contain body key");

      // Verify thread record opened with verified sender
      const thread = readThreadRecord(db, binding.project_id, eid);
      assert.ok(thread);
      assert.equal(thread.from, "alice-agent");
    });
  });

  it("Scenario: Unanchored transition is rejected, not authorized (PT-17, D-05)", () => {
    withLedger((db) => {
      const binding = createTestBinding();

      // 1. Open a thread with to_user_id = null (simulating legacy /1 peer or unknown to)
      // To achieve to_user_id = null on thread open, send REQUEST with to: "charlie-agent" (absent from local roster, no wire to_user_id)
      const threadEid = "018f0000-0000-7000-8000-000000000300";
      const updateOpen: TelegramUpdate = {
        update_id: 5001,
        message: {
          message_id: 901,
          date: 1700000040,
          chat: { id: binding.group_id, type: "supergroup" },
          from: { id: 111, is_bot: false, username: "alice" },
          text: encodeEnvelope({
            type: "REQUEST",
            eid: threadEid,
            thread: threadEid,
            ts: "2026-01-01T00:00:00.000Z",
            from: "alice-agent",
            to: "charlie-agent", // not in roster
            body: "legacy request without resolved to_user_id",
          }),
        },
      };

      admitTelegramUpdates(db, binding, [updateOpen]);

      const thread = readThreadRecord(db, binding.project_id, threadEid);
      assert.ok(thread);
      assert.equal(thread.to_user_id, null, "thread must have null to_user_id");

      // 2. Now bob (user_id 222) attempts to send an ACK to that thread
      const ackEid = "018f0000-0000-7000-8000-000000000301";
      const updateAck: TelegramUpdate = {
        update_id: 5002,
        message: {
          message_id: 902,
          date: 1700000041,
          chat: { id: binding.group_id, type: "supergroup" },
          from: { id: 222, is_bot: false, username: "bob" },
          text: encodeEnvelope({
            type: "ACK",
            eid: ackEid,
            thread: threadEid,
            ts: "2026-01-01T00:00:00.000Z",
            from: "bob-agent",
            to: "alice-agent",
            body: "unanchored ack",
          }),
        },
      };

      const result = admitTelegramUpdates(db, binding, [updateAck]);
      assert.equal(result.inserted, 1);
      assert.equal(result.counts.unanchored, 1);

      // In updates, apply_outcome must be "rejected"
      const row = db.prepare("SELECT apply_outcome, body FROM updates WHERE eid = ?").get(ackEid) as {
        apply_outcome: string;
        body: string | null;
      };
      assert.equal(row.apply_outcome, "rejected");
      assert.equal(row.body, null);

      // Audit log has reason "unanchored"
      const audits = db.prepare("SELECT * FROM audit_log WHERE project_id = ? AND eid = ?").all(binding.project_id, ackEid) as Array<{
        reason: string;
        direction: string;
      }>;
      assert.equal(audits.length, 1);
      assert.equal(audits[0].reason, "unanchored");
      assert.equal(audits[0].direction, "reject");
    });
  });

  it("Private chat with roster member is admitted via 'direct' (PT-03 chat scope)", () => {
    withLedger((db) => {
      const binding = createTestBinding();

      const eid = "018f0000-0000-7000-8000-000000000401";
      const update: TelegramUpdate = {
        update_id: 6001,
        message: {
          message_id: 1001,
          date: 1700000050,
          chat: { id: 111, type: "private" }, // private chat with alice
          from: { id: 111, is_bot: false, username: "alice" },
          text: encodeEnvelope({
            type: "REQUEST",
            eid,
            thread: eid,
            ts: "2026-01-01T00:00:00.000Z",
            from: "alice-agent",
            to: "bot-agent",
            body: "dm request",
          }),
        },
      };

      const result = admitTelegramUpdates(db, binding, [update]);
      assert.equal(result.inserted, 1);
      assert.equal(result.dropped, 0);

      const row = db.prepare("SELECT via, chat_id FROM updates WHERE eid = ?").get(eid) as {
        via: string;
        chat_id: number;
      };
      assert.equal(row.via, "direct");
      assert.equal(row.chat_id, 111);
    });
  });
});
