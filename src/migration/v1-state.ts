/**
 * Provenance: telegram-agent-bus src/state.ts:252-439 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: b69550f0e09c9d201384b84b1305734117e3199c0c98a2121a2797cf4035bac1
 *   (lines 252-439, LF-normalized, including the terminating newline. Reproduce with a sha256 over
 *    the frozen checkout, or see `test/fixtures/v1-provenance.json`.)
 * Changes: (1) throw-based `loadState` becomes `loadV1State`, returning a typed `V1StateResult` —
 * never throws; (2) the quarantine-rename branch (`quarantineStateFile`, `renameSync`) becomes a
 * hard error: invalid JSON, a non-object/array body, a future `state_version`, and a
 * schema-invalid document after migration all return a typed refusal with the original file left
 * completely untouched — never renamed, never written (v1 files are never modified); (3) an I/O
 * fault reading an EXISTING file still returns a typed `"unreadable"` refusal instead of throwing,
 * the same treatment v1 itself gives that branch (v1 does not quarantine on an unreadable file
 * either — there is nothing wrong with the content); (4) a missing `state.json` is unchanged from
 * v1 — `{ok: true}` with a default state, never a refusal, never a write; (5) `to_user_id` gains an
 * optional roster-backed backfill pass after migration, behind a new `roster` parameter v1 never
 * had (v1's `loadState` took no config — see its own migration doc comment); (6) supporting
 * declarations this range depends on but does not itself define — the `State`/`ThreadRecord`/
 * `HistoryEntry`/`Conditions` interfaces, `defaultState()`, `noConditions()` (telegram-agent-bus
 * src/state.ts:15-190) and `STATE_VERSION`'s value (telegram-agent-bus src/config.ts:129) — are
 * reproduced/adapted locally below, disclosed as supporting and NOT separately SEAM-pinned, per
 * this module's own note at their definitions. `StateError` (telegram-agent-bus
 * src/state.ts:159-165) has no counterpart here: it is superseded entirely by the typed
 * `V1StateRefusal` union below, not reproduced.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

/**
 * v1's own historical state-schema version (telegram-agent-bus src/config.ts:129, currently `2`).
 * A supporting, non-pinned constant — not a v2 concept, and deliberately not imported from
 * `shared/constants.ts` (design.md drops `STATE_VERSION` there for v2). Used only to reproduce v1's
 * own future-version check.
 */
const V1_STATE_VERSION = 2;

// --- Supporting types, reproduced from telegram-agent-bus src/state.ts:15-190 (non-pinned) ---

/** One in-thread message after the opening one. Mirrors v1's `HistoryEntry`. */
export interface V1HistoryEntry {
  readonly eid: string;
  readonly type: string;
  readonly from: string;
  readonly body: string;
  readonly at: string;
  readonly via: "direct" | "group";
}

/** One v1 thread record, in v1's own (never `ThreadRecord`-reshaped) field names. */
export interface V1ThreadRecord {
  readonly status: "open" | "resolved";
  readonly opened_type: "REQUEST" | "BROADCAST";
  readonly opened_eid: string;
  readonly from: string;
  readonly to: string | null;
  readonly body: string;
  readonly opened_at: string;
  readonly opened_message_id: number;
  readonly via: "direct" | "group";
  readonly acked_at: string | null;
  readonly ack_count: number;
  readonly resolved_at: string | null;
  readonly resolved_by: string | null;
  readonly basis: string | null;
  readonly first_surfaced_at: string | null;
  readonly to_user_id: number | null;
  readonly group_message_id: number | null;
  readonly closure_delivered: boolean;
  readonly awaiting: string | null;
  readonly history: readonly V1HistoryEntry[];
}

/** v1's persistent-warning channel. Mirrors v1's `Conditions`. */
export interface V1Conditions {
  readonly group_outage: { readonly since: string; readonly last_error: string } | null;
  readonly state_quarantined: { readonly at: string; readonly quarantined_path: string } | null;
  readonly open_thread_backlog: { readonly count: number; readonly since: string } | null;
}

/** v1's whole state document. Mirrors v1's `State`. */
export interface V1State {
  readonly state_version: number;
  readonly next_update_id: number;
  readonly last_fetch_at: string | null;
  readonly last_checkpoint: { readonly at: string; readonly by: string } | null;
  readonly seen_eids: Readonly<Record<string, string>>;
  readonly threads: Readonly<Record<string, V1ThreadRecord>>;
  readonly last_surfaced_digest: string | null;
  readonly conditions: V1Conditions;
}

/** Mirrors v1's `noConditions()`: the shape every clean bridge reports. */
function noConditionsV1(): V1Conditions {
  return { group_outage: null, state_quarantined: null, open_thread_backlog: null };
}

/** Mirrors v1's `defaultState()`: the empty baseline for a bridge that never fetched or sent anything. */
function defaultV1State(): V1State {
  return {
    state_version: V1_STATE_VERSION,
    next_update_id: 0,
    last_fetch_at: null,
    last_checkpoint: null,
    seen_eids: {},
    threads: {},
    last_surfaced_digest: null,
    conditions: noConditionsV1(),
  };
}

// --- Schemas, mirroring v1's stateSchema/threadRecordSchema/historyEntrySchema/conditionsSchema ---

const v1HistoryEntrySchema = z.object({
  eid: z.string(),
  type: z.string(),
  from: z.string(),
  body: z.string(),
  at: z.string(),
  via: z.enum(["direct", "group"]),
});

const v1ThreadRecordSchema = z.object({
  status: z.enum(["open", "resolved"]),
  opened_type: z.enum(["REQUEST", "BROADCAST"]),
  opened_eid: z.string(),
  from: z.string(),
  to: z.string().nullable(),
  body: z.string(),
  opened_at: z.string(),
  opened_message_id: z.number(),
  via: z.enum(["direct", "group"]),
  acked_at: z.string().nullable(),
  ack_count: z.number(),
  resolved_at: z.string().nullable(),
  resolved_by: z.string().nullable(),
  basis: z.string().nullable(),
  first_surfaced_at: z.string().nullable(),
  to_user_id: z.number().nullable(),
  group_message_id: z.number().nullable(),
  closure_delivered: z.boolean(),
  awaiting: z.string().nullable(),
  history: z.array(v1HistoryEntrySchema),
});

const v1ConditionsSchema = z.object({
  group_outage: z.object({ since: z.string(), last_error: z.string() }).nullable(),
  state_quarantined: z.object({ at: z.string(), quarantined_path: z.string() }).nullable(),
  open_thread_backlog: z.object({ count: z.number(), since: z.string() }).nullable(),
});

const v1StateSchema = z.object({
  state_version: z.number(),
  next_update_id: z.number(),
  last_fetch_at: z.string().nullable(),
  last_checkpoint: z.object({ at: z.string(), by: z.string() }).nullable(),
  seen_eids: z.record(z.string(), z.string()),
  threads: z.record(z.string(), v1ThreadRecordSchema),
  last_surfaced_digest: z.string().nullable(),
  conditions: v1ConditionsSchema,
});

/**
 * Migrates a raw parsed `state.json` of any known past shape up to {@link V1_STATE_VERSION}.
 * Mirrors v1's `migrateToCurrent` verbatim: BROADCAST-opened threads are dropped, and
 * `awaiting`/`closure_delivered`/`group_message_id`/`first_surfaced_at` are derived exactly as v1
 * computes them. `to_user_id` is still left `null` here — the roster backfill runs separately,
 * after schema validation, in {@link loadV1State}.
 */
function migrateToCurrentV1(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.state_version === "number" ? raw.state_version : 1;
  if (version >= V1_STATE_VERSION) {
    return raw;
  }

  const rawThreads = (raw.threads ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const threads: Record<string, unknown> = {};
  for (const [id, thread] of Object.entries(rawThreads)) {
    // Dropped, not migrated: nothing has ever been able to read or close a BROADCAST-opened thread.
    if (thread?.opened_type === "BROADCAST") {
      continue;
    }
    const isOpen = thread?.status === "open";
    threads[id] = {
      ...thread,
      first_surfaced_at: thread?.first_surfaced_at ?? null,
      to_user_id: thread?.to_user_id ?? null,
      group_message_id:
        thread?.group_message_id ?? (thread?.via === "group" ? (thread?.opened_message_id ?? null) : null),
      closure_delivered: thread?.closure_delivered ?? !isOpen,
      awaiting: thread?.awaiting ?? (isOpen ? (thread?.to ?? null) : null),
      history: thread?.history ?? [],
    };
  }

  return {
    ...raw,
    state_version: V1_STATE_VERSION,
    threads,
    last_surfaced_digest: raw.last_surfaced_digest ?? null,
    conditions: { ...noConditionsV1(), ...((raw.conditions as object | undefined) ?? {}) },
  };
}

/**
 * Fills `to_user_id` on every thread that still has it `null` after migration, resolved from
 * `roster[thread.to]?.user_id`, when a roster was passed. No roster, no `to`, or no matching
 * roster entry all leave `to_user_id` exactly as migration left it — `null`, v1's own value.
 */
function backfillToUserId(state: V1State, roster: Readonly<Record<string, { user_id: number }>> | undefined): V1State {
  if (roster === undefined) {
    return state;
  }
  const threads: Record<string, V1ThreadRecord> = {};
  for (const [id, thread] of Object.entries(state.threads)) {
    if (thread.to_user_id !== null || thread.to === null) {
      threads[id] = thread;
      continue;
    }
    const resolvedUserId = roster[thread.to]?.user_id ?? null;
    threads[id] = resolvedUserId === null ? thread : { ...thread, to_user_id: resolvedUserId };
  }
  return { ...state, threads };
}

/**
 * Why {@link loadV1State} refused to load v1's `state.json`. Value-free by construction, matching
 * this repository's other typed-result readers.
 */
export type V1StateRefusal =
  | { readonly kind: "unreadable" }
  | { readonly kind: "invalid_json" }
  | { readonly kind: "not_object" }
  | { readonly kind: "future_version"; readonly found: number }
  | { readonly kind: "schema_invalid" };

/** {@link loadV1State}'s outcome: either a validated v1 state, or the refusal that stopped it. */
export type V1StateResult =
  | { readonly ok: true; readonly state: V1State }
  | { readonly ok: false; readonly refusal: V1StateRefusal };

/**
 * Reads and validates v1's `state.json` from `homeDir`. Never throws, and NEVER renames, writes or
 * deletes the file it reads — see the module header's Changes list for what replaced v1's
 * quarantine-by-rename branch. Returns {@link defaultV1State} when the file does not exist yet,
 * exactly like v1's `loadState`.
 *
 * When `roster` is passed, every migrated thread still missing `to_user_id` is backfilled from it
 * (`roster[thread.to]?.user_id`); v1 itself never had a roster available here and always left the
 * field `null`.
 */
export function loadV1State(homeDir: string, roster?: Readonly<Record<string, { user_id: number }>>): V1StateResult {
  const statePath = join(homeDir, "state.json");
  if (!existsSync(statePath)) {
    return { ok: true, state: defaultV1State() };
  }

  // An I/O fault is NOT a quarantine case, same as v1: there is nothing wrong with the content, and
  // renaming a file we could not even read might destroy recoverable state.
  let raw: string;
  try {
    raw = readFileSync(statePath, "utf8");
  } catch {
    return { ok: false, refusal: { kind: "unreadable" } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, refusal: { kind: "invalid_json" } };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, refusal: { kind: "not_object" } };
  }

  // A file from the future is unreadable in a way validation cannot express — same reasoning as
  // v1's own quarantine branch, now a hard error instead of a silent downgrade.
  const declaredVersion = (parsed as Record<string, unknown>).state_version;
  if (typeof declaredVersion === "number" && declaredVersion > V1_STATE_VERSION) {
    return { ok: false, refusal: { kind: "future_version", found: declaredVersion } };
  }

  const result = v1StateSchema.safeParse(migrateToCurrentV1(parsed as Record<string, unknown>));
  if (!result.success) {
    return { ok: false, refusal: { kind: "schema_invalid" } };
  }

  return { ok: true, state: backfillToUserId(result.data, roster) };
}
