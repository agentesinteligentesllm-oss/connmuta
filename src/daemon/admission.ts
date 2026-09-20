import type { DatabaseSync } from "node:sqlite";
import { CHECKPOINT_MARKER } from "../shared/constants.js";
import { decodeEnvelope, normalizeBody, type Envelope } from "../shared/envelope.js";
import {
  applyEnvelope,
  type ApplyContext,
  type ApplyResult,
  type IncomingEnvelope,
} from "../shared/protocol-apply.js";
import { readThreadRecord } from "../ledger/threads.js";
import { commitInboxBatch, type InboxApplyOutcome, type InboxBatchEntry } from "../ledger/inbox.js";
import type { AuditRow } from "../ledger/audit.js";
import { upsertUnknownSender } from "../ledger/unknown-senders.js";
import type { TelegramUpdate } from "./telegram.js";

export interface AdmissionRosterEntry {
  readonly agent_id: string;
  readonly user_id: number;
  readonly username?: string;
}

export interface AdmissionBinding {
  readonly project_id: string;
  readonly bot_id: number;
  readonly agent_id: string;
  readonly group_id: number;
  readonly roster_snapshot: readonly AdmissionRosterEntry[];
}

export interface AdmissionCounts {
  non_envelope: number;
  unsupported_version: number;
  malformed: number;
  foreign_chat: number;
  unknown_sender: number;
  self_echo: number;
  duplicate: number;
  unanchored: number;
  replayed: number;
}

export interface AdmissionResult {
  readonly inserted: number;
  readonly dropped: number;
  readonly replayed: number;
  readonly nextUpdateId: number | null;
  readonly counts: AdmissionCounts;
}

function reverseRosterLookup(
  rosterSnapshot: readonly AdmissionRosterEntry[],
  userId: number | undefined
): string | null {
  if (userId === undefined) {
    return null;
  }
  for (const entry of rosterSnapshot) {
    if (entry.user_id === userId) {
      return entry.agent_id;
    }
  }
  return null;
}

function translateAddressee(
  envelope: Envelope,
  rosterSnapshot: readonly AdmissionRosterEntry[]
): string | null {
  if (envelope.to_user_id === undefined) {
    return envelope.to;
  }
  return reverseRosterLookup(rosterSnapshot, envelope.to_user_id) ?? envelope.to;
}

function toIsoFromUnixSeconds(seconds: unknown): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return null;
  }
  const ms = seconds * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildRosterRecord(
  rosterSnapshot: readonly AdmissionRosterEntry[]
): Record<string, { user_id: number }> {
  const record: Record<string, { user_id: number }> = {};
  for (const entry of rosterSnapshot) {
    record[entry.agent_id] = { user_id: entry.user_id };
  }
  return record;
}

function isEidInUpdates(db: DatabaseSync, projectId: string, eid: string): boolean {
  const row = db.prepare("SELECT 1 AS present FROM updates WHERE project_id = ? AND eid = ?").get(projectId, eid);
  return row !== undefined;
}

function isOpenedEidInThreads(db: DatabaseSync, projectId: string, threadId: string, eid: string): boolean {
  const row = db
    .prepare("SELECT 1 AS present FROM threads WHERE project_id = ? AND thread_id = ? AND opened_eid = ?")
    .get(projectId, threadId, eid);
  return row !== undefined;
}

function isEidInThreadHistory(db: DatabaseSync, projectId: string, eid: string): boolean {
  const row = db.prepare("SELECT 1 AS present FROM thread_history WHERE project_id = ? AND eid = ?").get(projectId, eid);
  return row !== undefined;
}

function captureGroupMessageId(db: DatabaseSync, projectId: string, threadId: string, messageId: number): void {
  db.prepare(
    "UPDATE threads SET group_message_id = ? WHERE project_id = ? AND thread_id = ? AND group_message_id IS NULL"
  ).run(messageId, projectId, threadId);
}

function decodeAdmissionEnvelope(
  text: string
): { ok: true; envelope: Envelope } | { ok: false; reason: "non_envelope" | "unsupported_version" | "malformed" } {
  // First try the standard decodeEnvelope from shared/envelope.js
  const standard = decodeEnvelope(text);
  if (standard.ok) {
    return standard;
  }

  // If standard failed, check whether it carries a sentinel (including optional brackets like [AGENTBUS/2])
  const match = [...text.matchAll(/(?:\[)?AGENTBUS\/(\d+)(?:\])?\s+(.*)$/gm)].at(-1);
  if (!match) {
    return { ok: false, reason: "non_envelope" };
  }

  const [, versionDigits, rawJsonPart] = match;
  if (versionDigits !== "1" && versionDigits !== "2") {
    return { ok: false, reason: "unsupported_version" };
  }

  const jsonPart = rawJsonPart.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonPart);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "malformed" };
  }

  const p = parsed as Record<string, unknown>;
  if (
    typeof p.eid !== "string" ||
    p.eid.length === 0 ||
    typeof p.type !== "string" ||
    !["BROADCAST", "REQUEST", "REPLY", "ACK", "RESOLVED"].includes(p.type) ||
    typeof p.from !== "string" ||
    p.from.length === 0 ||
    typeof p.thread !== "string" ||
    p.thread.length === 0 ||
    typeof p.ts !== "string" ||
    typeof p.body !== "string" ||
    p.body.length === 0
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (p.type === "BROADCAST") {
    if (p.to !== null) return { ok: false, reason: "malformed" };
  } else {
    if (typeof p.to !== "string" || p.to.length === 0) return { ok: false, reason: "malformed" };
  }

  return {
    ok: true,
    envelope: p as unknown as Envelope,
  };
}

/**
 * Seven-step admission pipeline for incoming Telegram updates (design §8.2, durable-inbox/spec.md):
 * 1. message.text present, else non_envelope (dropped, audited with no body)
 * 2. decodeEnvelope, else malformed / unsupported_version (dropped, audited with no body)
 * 3. chat.id === binding.group_id or chat.type === "private", else foreign_chat (dropped, audited, PT-03)
 * 4. message.from.id reverse-looked-up in roster_snapshot, else unknown_sender (dropped, audited, upsert unknown_senders, PT-04)
 * 5. sender is binding.agent_id -> self_echo (dropped uncounted, no audit)
 * 6. three-key dedup & trusted envelope preparation (PT-16):
 *    - dedup (project_id, eid) in updates / in-batch seen eids; REQUEST whose thread_id exists with same opened_eid -> duplicate
 *    - trusted envelope: from overwritten with verified sender, body normalized, envelope_json without body key (PT-16)
 * 7. applyEnvelope over thread loaded from ledger:
 *    - unanchored -> rejected (D-05, PT-17)
 *    - updates.body = NULL for rejected & ignored (D-20)
 *    - writes to updates, threads, audit_log in one transaction via commitInboxBatch (PR-12)
 */
export function admitTelegramUpdates(
  db: DatabaseSync,
  binding: AdmissionBinding,
  updates: readonly TelegramUpdate[]
): AdmissionResult {
  const counts: AdmissionCounts = {
    non_envelope: 0,
    unsupported_version: 0,
    malformed: 0,
    foreign_chat: 0,
    unknown_sender: 0,
    self_echo: 0,
    duplicate: 0,
    unanchored: 0,
    replayed: 0,
  };

  const batchEntries: InboxBatchEntry[] = [];
  const batchSeenEids = new Set<string>();
  let droppedCount = 0;
  const checkpointsToRecord: Array<{ at: string; by: string }> = [];

  for (const update of updates) {
    const message = update.message;

    // Step 1: message.text present, else non_envelope (dropped, audited with no body)
    if (!message || typeof message.text !== "string") {
      counts.non_envelope++;
      droppedCount++;
      batchEntries.push({
        kind: "dropped",
        update_id: update.update_id,
        audits: [
          {
            ts: toIsoFromUnixSeconds(message?.date) ?? new Date().toISOString(),
            project_id: binding.project_id,
            bot_id: binding.bot_id,
            chat_id: message?.chat.id ?? null,
            client_id: null,
            direction: "reject",
            eid: null,
            envelope_type: null,
            from_user_id: message?.from?.id ?? null,
            to_user_id: null,
            outcome: "dropped",
            reason: "non_envelope",
          },
        ],
      });
      continue;
    }

    // Step 3: chat.id === binding.group_id or chat.type === "private", else foreign_chat (dropped, audited, PT-03)
    const isGroup = message.chat.id === binding.group_id;
    const isPrivate = message.chat.type === "private";
    if (!isGroup && !isPrivate) {
      counts.foreign_chat++;
      droppedCount++;
      batchEntries.push({
        kind: "dropped",
        update_id: update.update_id,
        audits: [
          {
            ts: toIsoFromUnixSeconds(message.date) ?? new Date().toISOString(),
            project_id: binding.project_id,
            bot_id: binding.bot_id,
            chat_id: message.chat.id,
            client_id: null,
            direction: "reject",
            eid: null,
            envelope_type: null,
            from_user_id: message.from?.id ?? null,
            to_user_id: null,
            outcome: "dropped",
            reason: "foreign_chat",
          },
        ],
      });
      continue;
    }

    // Step 2: decodeEnvelope, else malformed / unsupported_version (dropped, audited with no body)
    const decoded = decodeAdmissionEnvelope(message.text);
    if (!decoded.ok) {
      droppedCount++;
      if (decoded.reason === "non_envelope") {
        counts.non_envelope++;
      } else if (decoded.reason === "unsupported_version") {
        counts.unsupported_version++;
      } else {
        counts.malformed++;
      }
      batchEntries.push({
        kind: "dropped",
        update_id: update.update_id,
        audits: [
          {
            ts: toIsoFromUnixSeconds(message.date) ?? new Date().toISOString(),
            project_id: binding.project_id,
            bot_id: binding.bot_id,
            chat_id: message.chat.id,
            client_id: null,
            direction: "reject",
            eid: null,
            envelope_type: null,
            from_user_id: message.from?.id ?? null,
            to_user_id: null,
            outcome: "dropped",
            reason: decoded.reason,
          },
        ],
      });
      continue;
    }

    const messageDate = toIsoFromUnixSeconds(message.date);
    if (messageDate === null) {
      counts.malformed++;
      droppedCount++;
      batchEntries.push({
        kind: "dropped",
        update_id: update.update_id,
        audits: [
          {
            ts: new Date().toISOString(),
            project_id: binding.project_id,
            bot_id: binding.bot_id,
            chat_id: message.chat.id,
            client_id: null,
            direction: "reject",
            eid: decoded.envelope.eid,
            envelope_type: decoded.envelope.type,
            from_user_id: message.from?.id ?? null,
            to_user_id: null,
            outcome: "dropped",
            reason: "malformed",
          },
        ],
      });
      continue;
    }

    // Step 4: message.from.id reverse-looked-up in roster_snapshot, else unknown_sender (dropped, audited, upsert unknown_senders, PT-04)
    const verifiedFrom = reverseRosterLookup(binding.roster_snapshot, message.from?.id);
    if (verifiedFrom === null) {
      counts.unknown_sender++;
      droppedCount++;
      if (message.from?.id !== undefined) {
        upsertUnknownSender(db, {
          bot_id: binding.bot_id,
          user_id: message.from.id,
          username: message.from.username ?? null,
          seen_at: messageDate,
        });
      }
      batchEntries.push({
        kind: "dropped",
        update_id: update.update_id,
        audits: [
          {
            ts: messageDate,
            project_id: binding.project_id,
            bot_id: binding.bot_id,
            chat_id: message.chat.id,
            client_id: null,
            direction: "reject",
            eid: decoded.envelope.eid,
            envelope_type: decoded.envelope.type,
            from_user_id: message.from?.id ?? null,
            to_user_id: null,
            outcome: "dropped",
            reason: "unknown_sender",
          },
        ],
      });
      continue;
    }

    // Step 5: sender is binding.agent_id -> self_echo (dropped uncounted, no audit)
    if (verifiedFrom === binding.agent_id) {
      counts.self_echo++;
      droppedCount++;
      batchEntries.push({
        kind: "dropped",
        update_id: update.update_id,
        audits: [],
      });
      continue;
    }

    const via: "group" | "direct" = isGroup ? "group" : "direct";

    // Step 6: three-key dedup & trusted envelope preparation (PT-16):
    // dedup:
    // - (project_id, eid) in updates / in-batch seen eids;
    // - REQUEST whose thread_id exists with same opened_eid -> duplicate
    // - in-thread eid already in thread_history -> duplicate
    const isDuplicate =
      batchSeenEids.has(decoded.envelope.eid) ||
      isEidInUpdates(db, binding.project_id, decoded.envelope.eid) ||
      (decoded.envelope.type === "REQUEST" &&
        isOpenedEidInThreads(db, binding.project_id, decoded.envelope.thread, decoded.envelope.eid)) ||
      isEidInThreadHistory(db, binding.project_id, decoded.envelope.eid);

    if (isDuplicate) {
      counts.duplicate++;
      droppedCount++;
      if (via === "group") {
        captureGroupMessageId(db, binding.project_id, decoded.envelope.thread, message.message_id);
      }
      batchEntries.push({
        kind: "dropped",
        update_id: update.update_id,
        audits: [
          {
            ts: messageDate,
            project_id: binding.project_id,
            bot_id: binding.bot_id,
            chat_id: message.chat.id,
            client_id: null,
            direction: "reject",
            eid: decoded.envelope.eid,
            envelope_type: decoded.envelope.type,
            from_user_id: message.from?.id ?? null,
            to_user_id: decoded.envelope.to_user_id ?? null,
            outcome: "dropped",
            reason: "duplicate",
          },
        ],
      });
      continue;
    }

    batchSeenEids.add(decoded.envelope.eid);

    // trusted envelope: from overwritten with verified sender, body normalized, envelope_json without body key (PT-16)
    const trustedEnvelope: Envelope = {
      ...decoded.envelope,
      from: verifiedFrom,
      to: translateAddressee(decoded.envelope, binding.roster_snapshot),
      body: normalizeBody(decoded.envelope.body),
    };

    const { body: _body, ...envelopeWithoutBody } = trustedEnvelope;
    const envelope_json = JSON.stringify(envelopeWithoutBody);

    // Step 7: applyEnvelope over thread loaded from ledger:
    const existing = readThreadRecord(db, binding.project_id, trustedEnvelope.thread);
    const incoming: IncomingEnvelope = {
      envelope: trustedEnvelope,
      telegram_message_id: message.message_id,
      message_date: messageDate,
      via,
    };
    const applyContext: ApplyContext = {
      agentId: binding.agent_id,
      roster: buildRosterRecord(binding.roster_snapshot),
    };

    let applied: ApplyResult;
    if (existing !== undefined && trustedEnvelope.type === "REQUEST") {
      applied = {
        outcome: { kind: "rejected", thread: trustedEnvelope.thread, reason: "not_requestable" },
      };
    } else {
      applied = applyEnvelope(existing, incoming, applyContext);
    }

    if (
      applied.unanchored ||
      (applied.outcome.kind === "rejected" && applied.outcome.reason === "unanchored")
    ) {
      counts.unanchored++;
    }

    if (applied.outcome.kind === "duplicate") {
      counts.duplicate++;
      droppedCount++;
      if (via === "group") {
        captureGroupMessageId(db, binding.project_id, decoded.envelope.thread, message.message_id);
      }
      batchEntries.push({
        kind: "dropped",
        update_id: update.update_id,
        audits: [
          {
            ts: messageDate,
            project_id: binding.project_id,
            bot_id: binding.bot_id,
            chat_id: message.chat.id,
            client_id: null,
            direction: "reject",
            eid: decoded.envelope.eid,
            envelope_type: decoded.envelope.type,
            from_user_id: message.from?.id ?? null,
            to_user_id: decoded.envelope.to_user_id ?? null,
            outcome: "dropped",
            reason: "duplicate",
          },
        ],
      });
      continue;
    }

    const apply_outcome: InboxApplyOutcome = applied.outcome.kind;
    const storedBody =
      apply_outcome === "rejected" || apply_outcome === "ignored" ? null : trustedEnvelope.body;

    const auditReason =
      applied.outcome.kind === "rejected" ? applied.outcome.reason : applied.outcome.kind;
    const auditDirection = applied.outcome.kind === "rejected" ? "reject" : "receive";
    const auditOutcome = applied.outcome.kind === "rejected" ? "rejected" : "ok";

    const toUserId =
      trustedEnvelope.to_user_id ??
      (trustedEnvelope.to !== null
        ? (binding.roster_snapshot.find((r) => r.agent_id === trustedEnvelope.to)?.user_id ?? null)
        : null);

    const admittedAudits: AuditRow[] = [
      {
        ts: messageDate,
        project_id: binding.project_id,
        bot_id: binding.bot_id,
        chat_id: message.chat.id,
        client_id: null,
        direction: auditDirection,
        eid: trustedEnvelope.eid,
        envelope_type: trustedEnvelope.type,
        from_user_id: message.from?.id ?? null,
        to_user_id: toUserId,
        outcome: auditOutcome,
        reason: auditReason,
      },
    ];

    const threadUpdate =
      applied.thread !== undefined
        ? {
            thread_id: trustedEnvelope.thread,
            record: applied.thread,
          }
        : undefined;

    batchEntries.push({
      kind: "admitted",
      update: {
        update_id: update.update_id,
        project_id: binding.project_id,
        chat_id: message.chat.id,
        via,
        message_id: message.message_id,
        message_date: message.date,
        from_user_id: message.from!.id,
        from_agent_id: verifiedFrom,
        eid: trustedEnvelope.eid,
        envelope_json,
        body: storedBody,
        apply_outcome,
        received_at: messageDate,
      },
      thread: threadUpdate,
      audits: admittedAudits,
    });

    if (trustedEnvelope.type === "BROADCAST" && trustedEnvelope.body.startsWith(CHECKPOINT_MARKER)) {
      checkpointsToRecord.push({ at: messageDate, by: verifiedFrom });
    }
  }

  // writes to updates, threads, audit_log in one transaction via commitInboxBatch (PR-12)
  const batchResult = commitInboxBatch(db, {
    bot_id: binding.bot_id,
    entries: batchEntries,
  });

  counts.replayed = batchResult.replayed;

  for (const cp of checkpointsToRecord) {
    db.prepare(
      `INSERT INTO binding_state (project_id, last_checkpoint_at, last_checkpoint_by)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id) DO UPDATE SET
         last_checkpoint_at = excluded.last_checkpoint_at,
         last_checkpoint_by = excluded.last_checkpoint_by`
    ).run(binding.project_id, cp.at, cp.by);
  }

  return {
    inserted: batchResult.inserted,
    dropped: droppedCount,
    replayed: batchResult.replayed,
    nextUpdateId: batchResult.nextUpdateId,
    counts,
  };
}
