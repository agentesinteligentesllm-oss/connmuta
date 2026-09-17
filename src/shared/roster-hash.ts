import { createHash } from "node:crypto";

/**
 * Prefix every roster hash carries, so a value read out of a log or a status report is identifiable
 * as a roster fingerprint rather than a bare digest (DATA-MODEL §2.4 `roster_hash`).
 */
export const ROSTER_HASH_PREFIX = "sha256:";

/**
 * The only roster fields that participate in the fingerprint.
 *
 * `username` is deliberately absent: it is display-only and mutable, so including it would report
 * `roster_drift` for a rename that changes no authorization decision, while an *authority* change
 * (`user_id`) would hide behind it (D-27, design.md:589). The type says that, rather than leaving it
 * to a comment a caller could miss.
 */
export interface RosterHashInput {
	readonly agent_id: string;
	readonly user_id: number;
}

/**
 * The roster fingerprint a session handshake carries (design.md:149, `POST /session`): the SHA-256
 * of the canonical JSON of `[agent_id, user_id]` pairs sorted by `agent_id`, prefixed `sha256:`.
 *
 * Sorted, because the hash must depend on the roster's *content* and not on the order a human
 * happened to write the entries in: the daemon compares its own snapshot against the client's
 * `conmuta.json`, and those two files are edited independently. `agent_id` is unique per DATA-MODEL
 * §1, so there is no tie to break; the comparison is a plain code-unit ordering, pinned by the
 * known-answer vectors in `test/shared/roster-hash.test.ts`.
 *
 * Pure: it reads its argument and never reorders or mutates it.
 */
export function computeRosterHash(roster: readonly RosterHashInput[]): string {
	const pairs = roster
		.map((entry) => [entry.agent_id, entry.user_id] as const)
		.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
	return `${ROSTER_HASH_PREFIX}${createHash("sha256").update(JSON.stringify(pairs), "utf8").digest("hex")}`;
}
