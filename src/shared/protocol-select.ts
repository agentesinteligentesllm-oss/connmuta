/**
 * Provenance: telegram-agent-bus src/protocol.ts:335-478 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 29bcf0038187541d6448d5c68a554d77b0789fbdcfea77ce087de441d96621ce   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: (1) `computeWorkDigest` takes the per-client surfaced set and the binding checkpoint
 * instead of reading a `State`, making the digest per client — its reminder-window parameter is now
 * named `windowHours`; (2) `MS_PER_HOUR` re-declared locally because v1 keeps it outside this range.
 */

import { createHash } from "node:crypto";

import { REQUEST_REMINDER_WINDOW_HOURS } from "./constants.js";
import type { ThreadRecord } from "./thread-record.js";

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * A stable fingerprint of the work this agent can act on (A4).
 *
 * `agentbus_fetch`'s response is a function of the BACKLOG, not of the NEWS: `needs_action` is
 * recomputed from the whole thread store on every call and carries every body, so the more pending
 * work an agent has, the more expensive it is to check whether anything new arrived. A bus that is
 * expensive to listen to gets listened to rarely, which reopens the 24-hour retention loss. This
 * digest is what lets a quiet tick answer "nothing changed" without re-emitting the backlog.
 *
 * **Computed over DISCRETE state only, and that rule is what makes it work at all.** An earlier
 * draft included the age of the oldest thread. Age is continuous, so the digest would never match
 * itself, `unchanged` would be permanently false, and the feature would be dead on arrival *while
 * appearing to work* — the worst available failure mode.
 *
 * The precise rule is not "no clocks" but **no continuous quantities; quantized ones are required**.
 * `reminder_count` is clock-derived and is mandatory: a thread crossing the reminder window changes
 * nothing else discrete about itself, so dropping it would let a request go overdue without ever
 * flipping the digest — hiding the one transition the spec asks to highlight.
 *
 * `next_update_id` is deliberately excluded: it tracks Telegram traffic, not agent-relevant state,
 * so pure human chatter in the group must not flip it.
 */
export function computeWorkDigest(
  threads: Readonly<Record<string, ThreadRecord>>,
  agentId: string,
  windowHours: number,
  now: Date,
  surfaced: ReadonlySet<string>,
  checkpointAt: string | null
): string {
  const parties = Object.entries(threads)
    .filter(([, thread]) => thread.from === agentId || thread.to === agentId)
    .sort(([a], [b]) => a.localeCompare(b));

  let reminderCount = 0;
  const rows = parties.map(([id, thread]) => {
    if (isNeedsAction(thread, agentId) && isReminderDue(computeAgeHours(thread.opened_at, now), windowHours)) {
      reminderCount++;
    }
    // `awaiting` and the history length are what make a turn change visible here. A reply I send
    // MYSELF is self-filtered out of `log` on the next fetch, so it produces no news; without
    // these two the digest would not move and the tick would answer `unchanged: true` while the
    // thread crossed between our queues. `awaiting` alone is not enough — two consecutive replies
    // from the same agent leave the turn where it was, and the follow-up would vanish. Both are
    // DISCRETE, so neither reintroduces the continuous quantity that would kill the digest.
    return `${id}:${thread.status}:${thread.ack_count}:${surfaced.has(id) ? 1 : 0}:${thread.awaiting ?? ""}:${thread.history.length}`;
  });

  const canonical = [...rows, `reminders=${reminderCount}`, `checkpoint=${checkpointAt ?? ""}`].join("\n");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/** The three priority tiers of the surfaced window (F3), each already ordered oldest-first. */
export interface Tiers<T> {
  /** Never surfaced before — the reason a live channel exists. */
  fresh: T[];
  /** Already surfaced, and now overdue per ADR-12. */
  reminder: T[];
  /** Already surfaced and not overdue. */
  rest: T[];
}

export interface TieredSelection<T> {
  selected: T[];
  /** Withheld counts, broken down by tier so a STARVED tier is a visible number even at zero slots. */
  omitted: { total: number; fresh: number; reminder: number };
}

/**
 * Fills a window of `size` from the three tiers using floors with spill (F3).
 *
 * Floors guarantee a tier cannot be starved by a burst in the one above it; spill guarantees a floor
 * is never wasted when its tier is empty. The two together are why this is not simply "sort by
 * priority and slice".
 *
 * Output order is tier order — never-seen work first — rather than a global sort, because the point
 * of the partition is that a brand-new REQUEST is reachable at all. Within each tier the caller's
 * oldest-first ordering is preserved untouched (ADR-12).
 *
 * **The falsifiable invariant, and the thing that must survive any change to the floors: while
 * anything was withheld from `fresh` or `reminder`, `selected` contains ZERO entries from `rest`.**
 */
export function selectTiered<T>(tiers: Tiers<T>, size: number, floors: { fresh: number; reminder: number }): TieredSelection<T> {
  const window = Math.max(size, 0);
  // Clamped against the window as well as the tier length: a config where the floors sum past the
  // window would otherwise select more than the cap allows.
  let takeFresh = Math.min(tiers.fresh.length, Math.max(floors.fresh, 0), window);
  let takeReminder = Math.min(tiers.reminder.length, Math.max(floors.reminder, 0), window - takeFresh);

  let slack = window - takeFresh - takeReminder;
  const spillFresh = Math.min(tiers.fresh.length - takeFresh, slack);
  takeFresh += spillFresh;
  slack -= spillFresh;
  const spillReminder = Math.min(tiers.reminder.length - takeReminder, slack);
  takeReminder += spillReminder;
  slack -= spillReminder;
  const takeRest = Math.min(tiers.rest.length, slack);

  return {
    selected: [
      ...tiers.fresh.slice(0, takeFresh),
      ...tiers.reminder.slice(0, takeReminder),
      ...tiers.rest.slice(0, takeRest),
    ],
    omitted: {
      total: tiers.fresh.length + tiers.reminder.length + tiers.rest.length - takeFresh - takeReminder - takeRest,
      fresh: tiers.fresh.length - takeFresh,
      reminder: tiers.reminder.length - takeReminder,
    },
  };
}

/** Hours elapsed between `openedAt` (an ISO first-seen timestamp) and the injected clock `now`. */
export function computeAgeHours(openedAt: string, now: Date): number {
  return (now.getTime() - new Date(openedAt).getTime()) / MS_PER_HOUR;
}

/**
 * True once `ageHours` reaches `windowHours` (default {@link REQUEST_REMINDER_WINDOW_HOURS}).
 * Callers MUST derive `ageHours` from the thread's `opened_at` (first-seen `message.date`),
 * never from an envelope's own `ts` — this is what makes an ACK unable to reset the
 * reminder clock (ADR-09): ACK never touches `opened_at`.
 */
export function isReminderDue(ageHours: number, windowHours: number = REQUEST_REMINDER_WINDOW_HOURS): boolean {
  return ageHours >= windowHours;
}

/**
 * The needs-action classification (`agent-bridge-tools` B2): true for an OPEN REQUEST thread whose
 * turn currently rests with `callerAgentId`.
 *
 * **It used to read `thread.to === callerAgentId`, and REPLY is what forced the redefinition.**
 * With multi-turn, "addressed to me" and "mine to act on" stop being the same statement in both
 * directions: a request addressed to me that I have already answered would sit in `needs_action`
 * forever, and a request I OPENED could never appear there even after the peer handed the ball
 * back. Turn is the question the tool is actually being asked.
 *
 * `awaiting` is trustworthy for this comparison only because `fetchTool` translates the addressee
 * through the wire anchor before it is ever stored (T3.2) — otherwise it would inherit exactly the
 * namespace black hole `to` had, and a peer that spells our name differently would silently never
 * reach us.
 */
export function isNeedsAction(thread: ThreadRecord, callerAgentId: string): boolean {
  return thread.opened_type === "REQUEST" && thread.status === "open" && thread.awaiting === callerAgentId;
}
