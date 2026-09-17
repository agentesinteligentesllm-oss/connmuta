import { test } from "node:test";
import assert from "node:assert/strict";

import { FLOOR_NEW, FLOOR_REMINDER, MAX_SURFACED_THREADS, REQUEST_REMINDER_WINDOW_HOURS } from "../../src/shared/constants.js";
import type { HistoryEntry, ThreadRecord } from "../../src/shared/thread-record.js";
import {
  computeAgeHours,
  computeWorkDigest,
  isNeedsAction,
  isReminderDue,
  selectTiered,
} from "../../src/shared/protocol-select.js";

// Select-side slice adapted from telegram-agent-bus/test/protocol.test.ts (read-only reference). The
// apply-side cases (applyEnvelope, ACK/REPLY/RESOLVED transitions) live in
// `test/shared/protocol-apply.test.ts` and are not duplicated here. Two SEAM changes are under test:
// `computeWorkDigest` takes the per-client surfaced set and the binding checkpoint instead of reading
// a whole `State`, and `ThreadRecord` no longer carries a `first_surfaced_at` property at all —
// per-client surfaced state lives in the ledger's `client_surfaced` table.

const SELF = "@dev2-agent";
const PEER = "@dev1-agent";
const OTHER_A = "@dev3-agent";
const OTHER_B = "@dev4-agent";
const THREAD = "a1b2c3d4e5f6";
const NOW = new Date("2026-08-14T18:30:00Z");

/** An open REQUEST from PEER to SELF with the turn on its addressee (v1's `openThreadFor`). */
function thread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    status: "open",
    opened_type: "REQUEST",
    opened_eid: "9f3c1a7e40b2",
    from: PEER,
    to: SELF,
    body: "Please review PR #12",
    opened_at: "2026-08-14T18:04:11Z",
    opened_message_id: 501,
    via: "direct",
    acked_at: null,
    ack_count: 0,
    resolved_at: null,
    resolved_by: null,
    basis: null,
    to_user_id: 8223456789,
    group_message_id: null,
    closure_delivered: false,
    awaiting: SELF,
    history: [],
    ...overrides,
  };
}

function reply(eid: string, from: string): HistoryEntry {
  return { eid, type: "REPLY", from, body: "follow-up", at: "2026-08-14T18:10:00Z", via: "direct" };
}

/** The digest over one thread map, with the per-client surfaced set and the checkpoint spelled out. */
function digest(threads: Record<string, ThreadRecord>, surfaced: string[] = [], checkpointAt: string | null = null): string {
  return computeWorkDigest(threads, SELF, REQUEST_REMINDER_WINDOW_HOURS, NOW, new Set(surfaced), checkpointAt);
}

function ids(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

// --- The SEAM: the digest is per client, over discrete state only ---

test("the digest moves when the turn moves, or the quiet tick reports unchanged on a thread that changed hands", () => {
  const onCaller = { [THREAD]: thread({ awaiting: SELF }) };
  const onPeer = { [THREAD]: thread({ awaiting: PEER }) };

  assert.notEqual(onCaller[THREAD].awaiting, onPeer[THREAD].awaiting, "precondition: only the turn differs");
  assert.notEqual(digest(onCaller), digest(onPeer), "handing the turn over is a discrete state change and must flip the digest");
});

test("a second reply from the same agent moves the digest even though the turn did not move", () => {
  // `awaiting` alone cannot see this: two consecutive replies from one agent leave the turn where it
  // already was. The history length is what makes a follow-up visible, and it is as discrete as the turn.
  const once = { [THREAD]: thread({ awaiting: PEER, history: [reply("1e2f3a4b5c6d", SELF)] }) };
  const twice = {
    [THREAD]: thread({ awaiting: PEER, history: [reply("1e2f3a4b5c6d", SELF), reply("2f3a4b5c6d7e", SELF)] }),
  };

  assert.equal(once[THREAD].awaiting, twice[THREAD].awaiting, "precondition: the turn did not move");
  assert.notEqual(digest(once), digest(twice), "a follow-up must never be swallowed as unchanged");
});

test("identical threads and identical arguments produce an identical digest", () => {
  assert.equal(digest({ [THREAD]: thread() }), digest({ [THREAD]: thread() }));
});

test("the digest is a function of the passed surfaced set, not of any per-thread surfaced flag", () => {
  const threads = { [THREAD]: thread() };

  assert.equal(
    Object.prototype.hasOwnProperty.call(threads[THREAD], "first_surfaced_at"),
    false,
    "per-client surfaced state left the record entirely (design §12)"
  );
  assert.notEqual(digest(threads, [THREAD]), digest(threads, []), "surfacing a thread is a discrete per-client change");
});

test("the digest depends on the passed checkpoint, and not on any thread-derived timestamp", () => {
  const threads = { [THREAD]: thread() };
  const checkpointAt = "2026-08-14T18:20:00Z";

  assert.notEqual(threads[THREAD].opened_at, checkpointAt, "precondition: the checkpoint is not a thread field");
  assert.notEqual(digest(threads, [], null), digest(threads, [], checkpointAt));
});

test("the clock enters only through the quantized reminder count, never as a continuous quantity", () => {
  // The digest's own comment forbids continuous quantities: hashing `now` or a thread's age would make
  // `unchanged` permanently false and the compact tick dead on arrival while appearing to work. Both
  // comparisons below stay inside the reminder window, so the quantized count is identical in each pair.
  const threads = { [THREAD]: thread({ awaiting: SELF }) };
  const sameBucketLater = new Date(NOW.getTime() + 60_000);
  const openedEarlier = { [THREAD]: thread({ awaiting: SELF, opened_at: "2026-08-14T17:00:00Z" }) };

  assert.equal(
    computeWorkDigest(threads, SELF, REQUEST_REMINDER_WINDOW_HOURS, NOW, new Set(), null),
    computeWorkDigest(threads, SELF, REQUEST_REMINDER_WINDOW_HOURS, sameBucketLater, new Set(), null),
    "a later clock inside the same window must not move the digest"
  );
  assert.equal(digest(threads), digest(openedEarlier), "`opened_at` is not part of the digest row");
});

test("crossing the reminder window flips the digest even though no other discrete state moved", () => {
  // `reminder_count` is clock-derived and mandatory: a thread going overdue changes nothing else
  // discrete about itself, so without this component the digest would keep answering `unchanged:
  // true` for the one transition the spec asks to highlight. A digest that drops it looks correct
  // and is quietly unreachable — the failure mode `computeWorkDigest`'s own comment warns about.
  const threads = { [THREAD]: thread({ awaiting: SELF }) };
  const openedAt = threads[THREAD].opened_at;
  const windowMs = REQUEST_REMINDER_WINDOW_HOURS * 60 * 60 * 1000;
  const before = new Date(new Date(openedAt).getTime() + windowMs - 1);
  const after = new Date(new Date(openedAt).getTime() + windowMs);

  assert.equal(isReminderDue(computeAgeHours(openedAt, before)), false, "precondition: not yet overdue");
  assert.equal(isReminderDue(computeAgeHours(openedAt, after)), true, "precondition: exactly overdue");
  assert.notEqual(
    computeWorkDigest(threads, SELF, REQUEST_REMINDER_WINDOW_HOURS, before, new Set(), null),
    computeWorkDigest(threads, SELF, REQUEST_REMINDER_WINDOW_HOURS, after, new Set(), null)
  );
});

test("threads between two other agents are excluded — pure human chatter must not flip the digest", () => {
  const mine = { [THREAD]: thread() };
  const withStranger = {
    ...mine,
    zzzzzzzzzzzz: thread({ from: OTHER_A, to: OTHER_B, to_user_id: null, awaiting: OTHER_B }),
  };

  assert.equal(digest(withStranger), digest(mine));
});

// --- F3: the window is partitioned by priority, so a burst cannot make new work unreachable ---

test("THE INVARIANT: while anything was withheld from fresh or reminder, no already-seen entry occupies a slot", () => {
  const selection = selectTiered(
    { fresh: ids("n", 30), reminder: ids("r", 30), rest: ids("s", 30) },
    MAX_SURFACED_THREADS,
    { fresh: FLOOR_NEW, reminder: FLOOR_REMINDER }
  );

  assert.ok(selection.omitted.fresh > 0 || selection.omitted.reminder > 0, "precondition: a tier was actually starved");
  assert.equal(selection.selected.filter((id) => id.startsWith("s")).length, 0);
  assert.equal(selection.selected.length, MAX_SURFACED_THREADS);
});

test("twenty already-seen threads do NOT make a brand-new REQUEST unreachable — the defect F3 names", () => {
  // The backlog ids sort BEFORE "brand-new", deliberately: with a backlog that sorted after it, a global
  // sort would satisfy the assertion below without any tiering, so the test could not fail for its claim.
  const selection = selectTiered(
    { fresh: ["brand-new"], reminder: [], rest: ids("a", 20) },
    MAX_SURFACED_THREADS,
    { fresh: FLOOR_NEW, reminder: FLOOR_REMINDER }
  );

  assert.equal(selection.selected[0], "brand-new", "never-seen work is surfaced first, not buried behind the backlog");
});

test("an unused floor SPILLS — it is never wasted on an empty tier", () => {
  const selection = selectTiered(
    { fresh: [], reminder: [], rest: ids("s", 30) },
    MAX_SURFACED_THREADS,
    { fresh: FLOOR_NEW, reminder: FLOOR_REMINDER }
  );

  assert.equal(selection.selected.length, MAX_SURFACED_THREADS, "every slot goes to `rest` when nothing else needs one");
  assert.equal(selection.omitted.total, 30 - MAX_SURFACED_THREADS);
});

test("a burst of new arrivals cannot starve the overdue tier — that is what the floor is for", () => {
  const selection = selectTiered(
    { fresh: ids("n", 25), reminder: ids("r", 10), rest: [] },
    MAX_SURFACED_THREADS,
    { fresh: FLOOR_NEW, reminder: FLOOR_REMINDER }
  );

  assert.equal(selection.selected.filter((id) => id.startsWith("r")).length, FLOOR_REMINDER);
  assert.equal(selection.selected.filter((id) => id.startsWith("n")).length, MAX_SURFACED_THREADS - FLOOR_REMINDER);
});

test("omitted is broken down by tier, so a starved tier is a visible number even at zero slots", () => {
  const selection = selectTiered(
    { fresh: ids("n", 25), reminder: ids("r", 10), rest: ids("s", 5) },
    MAX_SURFACED_THREADS,
    { fresh: FLOOR_NEW, reminder: FLOOR_REMINDER }
  );

  assert.equal(selection.omitted.fresh, 25 - (MAX_SURFACED_THREADS - FLOOR_REMINDER));
  assert.equal(selection.omitted.reminder, 10 - FLOOR_REMINDER);
  assert.equal(selection.omitted.total, 40 - MAX_SURFACED_THREADS);
});

test("floors that sum past the window are clamped rather than overfilling it", () => {
  const selection = selectTiered({ fresh: ids("n", 10), reminder: ids("r", 10), rest: [] }, 5, { fresh: 8, reminder: 6 });

  assert.equal(selection.selected.length, 5);
});

test("ordering within each tier is preserved untouched — oldest-first stays ADR-12's rule", () => {
  // Deliberately not in lexicographic order, within a tier or across tiers: a fixture that happened to
  // be sorted would let a global sort — the thing the module's own comment rejects — pass this assertion.
  const selection = selectTiered(
    { fresh: ["n2", "n0", "n1"], reminder: ["r1", "r0"], rest: ["s1", "s0"] },
    MAX_SURFACED_THREADS,
    { fresh: FLOOR_NEW, reminder: FLOOR_REMINDER }
  );

  assert.deepEqual(selection.selected, ["n2", "n0", "n1", "r1", "r0", "s1", "s0"]);
});

// --- Reminder boundary on the injected clock, and the turn-based needs-action rule ---

test("age comes from `opened_at` against the injected `now`, and the reminder boundary is exact", () => {
  const openedAt = "2026-08-14T00:00:00Z";

  assert.equal(computeAgeHours(openedAt, new Date("2026-08-14T12:00:00Z")), 12);
  const justBefore = new Date(new Date(openedAt).getTime() + (REQUEST_REMINDER_WINDOW_HOURS * 60 - 1) * 60 * 1000);
  const exactly = new Date(new Date(openedAt).getTime() + REQUEST_REMINDER_WINDOW_HOURS * 60 * 60 * 1000);
  assert.equal(isReminderDue(computeAgeHours(openedAt, justBefore)), false);
  assert.equal(isReminderDue(computeAgeHours(openedAt, exactly)), true);
});

test("isNeedsAction is turn-based, not addressee-based — the redefinition B1 forced", () => {
  // The addressee-based rule (`to === caller`) cannot express multi-turn: a request addressed to me
  // that I have already answered would sit in needs_action forever, and a request I OPENED could
  // never appear there even after the peer handed the ball back.
  const answered = thread({ awaiting: PEER });
  assert.equal(answered.to, SELF, "still addressed to me");
  assert.equal(isNeedsAction(answered, SELF), false, "but not my turn");

  const returned = thread({ from: SELF, to: PEER, awaiting: SELF });
  assert.equal(isNeedsAction(returned, SELF), true, "a thread I opened is mine to act on once the turn returns");

  const closed = thread({ status: "resolved", resolved_at: "2026-08-14T18:20:00Z", resolved_by: SELF, awaiting: SELF });
  assert.equal(isNeedsAction(closed, SELF), false, "a closed thread owes nobody anything, turn or not");
});
