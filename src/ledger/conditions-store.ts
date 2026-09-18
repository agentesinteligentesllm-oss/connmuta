import type { DatabaseSync } from "node:sqlite";

import type { Conditions } from "../shared/tool-output.js";
import { assertNoTokenShape } from "./audit.js";

/**
 * The condition store (`ledger/conditions-store.ts`, design §5.1 §5.4, `shared/tool-output.ts`).
 *
 * New code, not vendored: design §12's only row naming `ledger/*` is the **REPLACED** row
 * (`v1:src/state.ts:89-186, 217-250, 252-456` → `ledger/*`), and a replaced v1 module is not reused line
 * by line, so there is nothing to pin against — this file carries no header of the kind
 * `test/security/provenance.test.ts` looks for and `test/fixtures/v1-provenance.json` stays at its eleven
 * entries. (That gate reads a file's *leading* `/**` block; this module begins with its imports.)
 *
 * **What a condition is.** v1 kept a `state.conditions` container with three members, and only one of them
 * was ever raised. It is the persistent-warning channel: a per-call flag such as `delivery.degraded` lives
 * one turn, while a condition stays raised until it is resolved — which is what keeps a group soft-fail
 * from hiding an exchange from the four humans of the room. `conditions` is where the raised set lives, its
 * readers are `daemon/serve/status.ts` (PR-24) and `fetch`'s output, and this module is the only writer.
 *
 * **`(scope, name)` is the key, and the scope is a `project_id` or the literal `daemon`** (design §5.2's
 * inline comment). Two projects raising `group_outage` are two rows; a store that keyed on the name alone
 * would show one project's outage on every other project's status. `ledger_quarantined` is the daemon-scope
 * case — the *file* failed to open (design §5.1), so it is not any one project's ledger — and each name's
 * contract says which scope it may be raised under.
 *
 * **`since` is first-wins while raised, and clearing deletes the row.** That pair is the whole semantic of
 * the channel: `open_thread_backlog` is re-raised by every hourly sweep, and a `since` that moved each time
 * would answer "since the last sweep" for ever; a condition that clears and comes back is a new `since`
 * because there is no row left to hold the old one. So the upsert updates `detail` and never `since`, and
 * {@link clearCondition} issues a `DELETE`.
 *
 * **`detail` carries codes and ids, never prose** (DATA-MODEL §3.0; design §5.2: "`conditions.detail` for
 * `group_outage` stores the classification code, never error text"). What this module can decide
 * mechanically, it enforces, per name:
 *
 * - the record's members are exactly the ones the name's contract declares — no extra, none missing;
 * - each member has the declared type (`count` is a number, `last_error` is a string);
 * - a string member is single-line, because a multi-line value is the *shape* of a stack trace or an error
 *   message and no code or id has one;
 * - a string member carries no token shape (`ledger/audit.ts`).
 *
 * **Two more of the same kind, added by Judgment Day round 1**, each of them a column this store owns:
 *
 * - **`scope` carries no token shape either.** It is caller-supplied text and it is a column of a ledger
 *   table, so it gets the guard its detail members get — before the scope-shape check, so the refusal is the
 *   guard's and not a message about which scope was passed (`JD-B-001`, reached independently as
 *   `JD-A-002`; before this correction the store accepted a token-shaped scope and wrote it to the file);
 * - **`since` is stored in one canonical form** (`.toISOString()`), because a stored instant that some other
 *   comparison cannot place is the hazard `CONDITION_INSTANT_INVALID_MESSAGE` exists to name, and
 *   `parseInstant` alone admits `+05:00` forms whose text does not order against `Z` forms.
 *
 * **And one rule about the refusals themselves**: a refusal names the field and never the offending value,
 * because a refusal reaches the log. What may be interpolated is what this store owns — the condition's own
 * name once its contract has been found, and that contract's member names (`JD-B-004`).
 *
 * **What it cannot decide, stated so the module is not read as claiming it.** A single-line string that
 * looks like a code and a single-line string that is an error message are the same thing to a validator
 * with no vocabulary, and one legitimate member — F2's `state_quarantined.quarantined_path` — is a path.
 * So "codes and ids only" stays the *caller's* contract, enforced where the caller builds the record; the
 * four boundaries above are the half a store can hold, and they refuse rather than normalize because
 * silently stripping a message would delete the evidence of the bug that produced it.
 *
 * **The read side validates the same contract**, because the shape this table feeds has required members
 * (`Conditions`): a row whose detail cannot fill them refuses loudly instead of rendering a status with a
 * hole in it. That is reachable only by a write this module did not make — raw SQL, a downgrade, a
 * hand-edited file — which is exactly the case that must not be papered over.
 *
 * **This module opens no transaction.** The poll batch's is `ledger/inbox.ts`'s and `withTransaction`
 * refuses a nested call; the retention sweep (design §5.4) calls these functions outside any transaction of
 * its own. Called on their own, each statement autocommits.
 */

/** The scope value a daemon-wide condition is raised under (`design §5.2`: `project_id` or `'daemon'`). */
export const DAEMON_CONDITION_SCOPE = "daemon";

/**
 * The conditions this build can raise.
 *
 * A closed union and not a free string, because a name is a *decision*: `status` must be able to render it,
 * the detail record has a shape, and a fifth name is a code change with a reader — not a row this store
 * accepts and nothing ever shows. Refusing an unknown name is what keeps the store and its readers in step.
 */
export type ConditionName = "ledger_quarantined" | "group_outage" | "state_quarantined" | "open_thread_backlog";

/** A member of a condition's `detail` record: an id, a count, or a classification code. */
export type ConditionDetailValue = string | number;

/** The structured record `conditions.detail` holds, serialized to JSON in the column. */
export type ConditionDetail = Readonly<Record<string, ConditionDetailValue>>;

/** One condition to raise. */
export interface ConditionRaise {
	/** A `project_id`, or {@link DAEMON_CONDITION_SCOPE} for the names whose contract says so. */
	readonly scope: string;
	readonly name: ConditionName;
	/** When the condition became true, ISO 8601. Written only when the row is created. */
	readonly since: string;
	/** The record the name's contract declares; absent only for a name that declares no members. */
	readonly detail?: ConditionDetail;
}

/** A raised condition as the ledger holds it. */
export interface ConditionRow {
	readonly scope: string;
	readonly name: ConditionName;
	/** When it was first raised — not when it was last refreshed. */
	readonly since: string;
	/** The stored record, parsed; `null` only for a name whose contract declares no members. */
	readonly detail: ConditionDetail | null;
}

/** What each name promises: the scope it may be raised under, and its `detail` members with their types. */
interface ConditionContract {
	readonly scope: "daemon" | "project";
	readonly fields: ReadonlyMap<string, "string" | "number">;
}

/**
 * The four contracts, all of them traced to the shape that reads them.
 *
 * `ledger_quarantined` is design §5.1's `status`-visible outcome of the open sequence (reason is
 * `LedgerQuarantineReason`); `group_outage`, `state_quarantined` and `open_thread_backlog` are
 * `shared/tool-output.ts`'s `Conditions` members, whose required fields are `{ since, last_error }`,
 * `{ at, quarantined_path }` and `{ count, since }` respectively — the store holds the extra members and
 * `since` supplies the two timestamp members (`at` for the F2 case, `since` for the other two).
 *
 * A `Map` rather than an object literal, and a `Map` for each contract's members too, because an object
 * literal answers for every member of `Object.prototype`: `raiseCondition(db, …, name: "constructor")`
 * would find a function where a contract belongs and fail with a bare `TypeError` instead of this store's
 * refusal, and a detail member named `toString` would be reported as "expects a function" rather than as a
 * member the readers do not render. Judgment Day round 1 reproduced both (`JD-A-004`).
 */
const CONDITION_CONTRACTS: ReadonlyMap<ConditionName, ConditionContract> = new Map<ConditionName, ConditionContract>([
	["ledger_quarantined", { scope: "daemon", fields: new Map([["reason", "string"]]) }],
	["group_outage", { scope: "project", fields: new Map([["last_error", "string"]]) }],
	["state_quarantined", { scope: "project", fields: new Map([["quarantined_path", "string"]]) }],
	["open_thread_backlog", { scope: "project", fields: new Map([["count", "number"]]) }],
]);

/**
 * The refusal this store raises for anything that does not fit a name's contract, as a function of what
 * went wrong.
 *
 * One builder for the name, the scope and the detail cases, because they are one rule — the store holds only
 * what a reader can render — and exporting one spelling is what lets a caller and its test pin it instead of
 * matching prose.
 *
 * **`what` names the field and never the offending value**, and that is a rule rather than a style choice:
 * a refusal reaches the daemon's log, so interpolating a caller-supplied scope or detail member would copy
 * into the log the very string the guard beside it exists to keep out of the ledger. Judgment Day round 1
 * reached that with a token-shaped scope and a token-shaped member name (`JD-B-004`). What may be
 * interpolated is what the store itself owns: the condition's own name once its contract has been found,
 * and the member names of that contract.
 */
export function conditionContractRefusalMessage(what: string): string {
	return `conditions-store: ${what}; the store holds only the conditions this build raises, each under the scope and with the detail record its readers render (design §5.1 §5.4, PT-20).`;
}

/**
 * The refusal for a `since` a `Date` cannot read.
 *
 * `since` is rendered by every reader of `Conditions` and is compared as text, so an unreadable value is not
 * cosmetic. Exported for the same reason as the builder above.
 */
export const CONDITION_INSTANT_INVALID_MESSAGE =
	"conditions-store: `since` is not a timestamp this ledger can parse, so the condition would report an instant nothing can order (design §5.4).";

/**
 * Raises a condition, or refreshes the detail of one already raised.
 *
 * `since` is written only on the insert: a re-raise means "still true", and the row's job is to answer
 * "since when". The detail is replaced on every raise, so the count `open_thread_backlog` carries is the one
 * the latest sweep measured.
 *
 * Refuses an unknown name, a scope the name may not be raised under, an unreadable `since`, and a detail
 * that does not match the name's contract (see the module doc for exactly what is checked).
 */
export function raiseCondition(db: DatabaseSync, raise: ConditionRaise): void {
	// The scope is a caller-supplied text column this store writes, so it carries the same guard as the
	// detail's members — and it runs FIRST, so a token-shaped scope is refused by the guard rather than by a
	// message about scope shape. Before round 1's correction only the detail was guarded, and the module doc
	// claimed the store was the last line while a token-shaped scope went into the file (`JD-B-001`, reached
	// independently as `JD-A-002`).
	assertNoTokenShape("conditions.scope", raise.scope);
	const contract = contractFor(raise.name);
	assertScopeMatches(raise.name, contract, raise.scope);
	const since = canonicalInstant(raise.since);
	const detail = validateDetail(raise.name, contract, raise.detail ?? {});

	db.prepare(
		`INSERT INTO conditions (scope, name, since, detail) VALUES (?, ?, ?, ?)
		 ON CONFLICT (scope, name) DO UPDATE SET detail = excluded.detail`,
	).run(raise.scope, raise.name, since, serializeDetail(detail));
}

/**
 * Clears a condition and reports whether there was one to clear.
 *
 * `false` is not an error: the ordinary caller clears on the successful path, where most of the time nothing
 * was raised. Deleting rather than flagging is what makes a later raise a new `since`.
 */
export function clearCondition(db: DatabaseSync, scope: string, name: ConditionName): boolean {
	return db.prepare("DELETE FROM conditions WHERE scope = ? AND name = ?").run(scope, name).changes > 0;
}

/**
 * One condition as the ledger holds it, or `undefined` when it is not raised.
 *
 * Validates the stored detail against the name's contract, so an unreadable row refuses here rather than
 * becoming a half-filled `Conditions` downstream.
 */
export function readCondition(db: DatabaseSync, scope: string, name: ConditionName): ConditionRow | undefined {
	const row = db.prepare("SELECT scope, name, since, detail FROM conditions WHERE scope = ? AND name = ?").get(scope, name) as
		| { scope: string; name: string; since: string; detail: string | null }
		| undefined;
	if (row === undefined) {
		return undefined;
	}
	const storedName = row.name as ConditionName;
	return {
		scope: row.scope,
		name: storedName,
		since: row.since,
		detail: parseDetail(storedName, row.detail),
	};
}

/**
 * The scopes that currently have `name` raised, in scope order — the set the retention sweep reconciles its
 * own measure against (`open_thread_backlog` is cleared for exactly the projects that are no longer over
 * the threshold).
 */
export function listConditionScopes(db: DatabaseSync, name: ConditionName): readonly string[] {
	const rows = db.prepare("SELECT scope FROM conditions WHERE name = ? ORDER BY scope").all(name) as unknown as {
		scope: string;
	}[];
	return rows.map((row) => row.scope);
}

/**
 * One project's raised conditions, as the `Conditions` shape `shared/tool-output.ts` declares.
 *
 * All three members exist on the result whether or not a row backs them (`null` when it does not), because
 * that is what the response's type promises and a missing key would be a different absence. Daemon-scope
 * rows are not part of a project's answer — that is what the scope is for.
 */
export function readProjectConditions(db: DatabaseSync, project_id: string): Conditions {
	const group = readCondition(db, project_id, "group_outage");
	const quarantined = readCondition(db, project_id, "state_quarantined");
	const backlog = readCondition(db, project_id, "open_thread_backlog");
	return {
		group_outage: group === undefined ? null : { since: group.since, last_error: detailString(group, "last_error") },
		state_quarantined:
			quarantined === undefined
				? null
				: { at: quarantined.since, quarantined_path: detailString(quarantined, "quarantined_path") },
		open_thread_backlog:
			backlog === undefined ? null : { count: detailNumber(backlog, "count"), since: backlog.since },
	};
}

/** The contract for a name, refusing a name this build does not raise. */
function contractFor(name: ConditionName): ConditionContract {
	const contract = CONDITION_CONTRACTS.get(name);
	if (contract === undefined) {
		// The name is not echoed: this branch is reached exactly when the name is NOT one of ours, so the value
		// is caller-supplied text and a refusal that repeated it would be a log line carrying it.
		throw new Error(conditionContractRefusalMessage("the condition name is not one this build raises"));
	}
	return contract;
}

/** Refuses a scope the name may not be raised under, in both directions. */
function assertScopeMatches(name: ConditionName, contract: ConditionContract, scope: string): void {
	const daemonScoped = contract.scope === "daemon";
	if (daemonScoped !== (scope === DAEMON_CONDITION_SCOPE)) {
		// `name` and `contract.scope` are ours (the contract was found above); `scope` is the caller's and is
		// deliberately not repeated — see the builder's doc.
		throw new Error(
			conditionContractRefusalMessage(`the condition "${name}" is a ${contract.scope} condition and was raised under the other scope`),
		);
	}
}

/**
 * Refuses a detail record that does not match the contract, and returns it unchanged when it does.
 *
 * The order of the two loops is deliberate: an unknown member is named before a missing one, because that is
 * almost always the caller's mistake (a renamed field) and the fix is different.
 */
function validateDetail(name: ConditionName, contract: ConditionContract, detail: ConditionDetail): ConditionDetail {
	for (const key of Object.keys(detail)) {
		const expected = contract.fields.get(key);
		if (expected === undefined) {
			// The member's own name is not echoed: `detail`'s keys are caller-supplied, and a member named after a
			// token shape would be copied into the log by this message (`JD-B-004`).
			throw new Error(conditionContractRefusalMessage(`the detail for "${name}" carries a member its readers do not render`));
		}
		const value = detail[key];
		if (typeof value !== expected) {
			throw new Error(conditionContractRefusalMessage(`the detail member "${key}" of "${name}" is a ${typeof value}, and its reader expects a ${expected}`));
		}
		if (typeof value === "string") {
			if (value.includes("\n") || value.includes("\r")) {
				throw new Error(
					conditionContractRefusalMessage(
						`the detail member "${key}" of "${name}" spans lines, which is the shape of an error message and not of a code or an id`,
					),
				);
			}
			assertNoTokenShape(`conditions.detail.${key}`, value);
		} else if (!Number.isFinite(value)) {
			// `JSON.stringify(NaN)` is `"null"`, so a non-finite number would come back as a missing member.
			throw new Error(conditionContractRefusalMessage(`the detail member "${key}" of "${name}" is not a finite number`));
		}
	}

	for (const key of contract.fields.keys()) {
		// `Object.hasOwn` and not `in`: `in` walks the prototype chain, so an own member is not what it answers
		// for. Every key here is one of ours, which is what makes repeating it safe.
		if (!Object.hasOwn(detail, key)) {
			throw new Error(conditionContractRefusalMessage(`the detail for "${name}" is missing "${key}", which its readers require`));
		}
	}
	return detail;
}

/** The stored column as a record: parsed, then validated against the same contract the write side applies. */
function parseDetail(name: ConditionName, raw: string | null): ConditionDetail | null {
	const contract = contractFor(name);
	if (raw === null) {
		if (contract.fields.size > 0) {
			throw new Error(conditionContractRefusalMessage(`the stored detail for "${name}" is missing, and its readers require it`));
		}
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(conditionContractRefusalMessage(`the stored detail for "${name}" is not readable JSON`));
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(conditionContractRefusalMessage(`the stored detail for "${name}" is not a record`));
	}
	return validateDetail(name, contract, parsed as ConditionDetail);
}

/** The column value for a detail record; `null` only when the record is empty. */
function serializeDetail(detail: ConditionDetail): string | null {
	return Object.keys(detail).length === 0 ? null : JSON.stringify(detail);
}

/** A validated string member. Validated on the way in and on the way out, so this cannot be `undefined`. */
function detailString(row: ConditionRow, key: string): string {
	return String(row.detail?.[key]);
}

/** A validated number member. */
function detailNumber(row: ConditionRow, key: string): number {
	return Number(row.detail?.[key]);
}

/** An ISO 8601 instant as epoch milliseconds, refusing anything a `Date` cannot read. */
function parseInstant(instant: string): number {
	const ms = Date.parse(instant);
	if (Number.isNaN(ms)) {
		throw new Error(CONDITION_INSTANT_INVALID_MESSAGE);
	}
	return ms;
}

/**
 * The same instant in the one form this unit's text comparisons assume.
 *
 * `.toISOString()` and nothing else, because `2026-03-01T11:00:00+05:00` and `2026-03-01T10:00:00Z` are the
 * same instant written two ways and only the canonical form orders lexicographically against every other
 * value this unit stores. `parseInstant` alone would accept both, so a stored `since` could be an instant
 * no later comparison can place — and this is the same correction `ledger/unknown-senders.ts` received for
 * its `last_seen_at`, where the mis-ordering was measurable (`JD-B-002`, independently `JD-A-003`).
 */
function canonicalInstant(instant: string): string {
	return new Date(parseInstant(instant)).toISOString();
}
