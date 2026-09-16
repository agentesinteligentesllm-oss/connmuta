import { test } from "node:test";
import assert from "node:assert/strict";

import type { HistoryEntry, ThreadRecord } from "../../src/shared/thread-record.js";

// Adapted from telegram-agent-bus/test/state.test.ts's sampleThread() (read-only reference), with
// `first_surfaced_at` removed per design §12: per-client surfaced state moves to `client_surfaced`
// (PR-12). If a future edit reintroduces the field as required on ThreadRecord, this factory stops
// compiling ("Property 'first_surfaced_at' is missing in type...") — the type system enforces the
// removal for every literal built against this factory, which is the only enforceable check a
// types-only module can offer.
function sampleThread(): ThreadRecord {
  return {
    status: "open",
    opened_type: "REQUEST",
    opened_eid: "9f3c1a7e40b2",
    from: "@dev1-agent",
    to: "@dev2-agent",
    body: "Please review PR #12",
    opened_at: "2026-08-14T18:04:11Z",
    opened_message_id: 501,
    via: "direct",
    acked_at: null,
    ack_count: 0,
    resolved_at: null,
    resolved_by: null,
    basis: null,
    to_user_id: null,
    group_message_id: null,
    closure_delivered: false,
    awaiting: "@dev2-agent",
    history: [],
  };
}

function sampleHistoryEntry(): HistoryEntry {
  return {
    eid: "b2c4d6e8f0a1",
    type: "REPLY",
    from: "@dev2-agent",
    body: "Looking now",
    at: "2026-08-14T18:05:02Z",
    via: "direct",
  };
}

test("ThreadRecord no longer carries first_surfaced_at as an own property on a plain construction", () => {
  const thread = sampleThread();
  assert.equal(Object.prototype.hasOwnProperty.call(thread, "first_surfaced_at"), false);
});

test("ThreadRecord accepts a full opened-REQUEST record and every field round-trips unchanged", () => {
  const thread = sampleThread();
  assert.equal(thread.status, "open");
  assert.equal(thread.opened_type, "REQUEST");
  assert.equal(thread.from, "@dev1-agent");
  assert.equal(thread.to, "@dev2-agent");
  assert.equal(thread.via, "direct");
  assert.equal(thread.awaiting, "@dev2-agent");
  assert.deepEqual(thread.history, []);
});

test("ThreadRecord's resolved state carries the resolution fields distinct from the open baseline", () => {
  const resolved: ThreadRecord = {
    ...sampleThread(),
    status: "resolved",
    resolved_at: "2026-08-14T19:00:00Z",
    resolved_by: "@dev2-agent",
    basis: "9f3c1a7e40b2",
  };
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolved_by, "@dev2-agent");
  assert.equal(resolved.basis, "9f3c1a7e40b2");
});

test("HistoryEntry shape carries the verified sender and via channel for an in-thread reply", () => {
  const entry = sampleHistoryEntry();
  assert.equal(entry.type, "REPLY");
  assert.equal(entry.from, "@dev2-agent");
  assert.equal(entry.via, "direct");
});

test("ThreadRecord.history holds an ordered list of HistoryEntry without losing entries", () => {
  const second = { ...sampleHistoryEntry(), eid: "c3d5e7f9a1b2", body: "Second reply" };
  const thread: ThreadRecord = { ...sampleThread(), history: [sampleHistoryEntry(), second] };
  assert.equal(thread.history.length, 2);
  assert.deepEqual(thread.history[0], sampleHistoryEntry());
  assert.equal(thread.history[1].body, "Second reply");
});
