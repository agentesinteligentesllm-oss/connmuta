import { z } from "zod";

import { PROJECT_ID_PATTERN, REGISTRY_VERSION } from "../shared/constants.js";
import { AGENT_ID_PATTERN } from "../shared/envelope.js";
import { applyRosterUniqueness, rosterEntrySchema, type ProjectRosterEntry } from "../shared/project-file.js";
import { ROSTER_HASH_PREFIX } from "../shared/roster-hash.js";
import { applyRegistryInvariants, registryInvariantFromIssue, type RegistryInvariant } from "./invariants.js";

/**
 * The machine registry `~/.conmuta/registry.json` (DATA-MODEL §2): the strict shape, the schema
 * version rule, and the load-time verdict.
 *
 * New code, not vendored: design §12 has no row naming `registry/*`, so these files carry no
 * `Provenance:` header and `test/fixtures/v1-provenance.json` stays at its eleven entries.
 *
 * The document is validated with a strict schema at **every** level — unknown keys are refused, never
 * stripped — and the cross-field rules R1–R3 are applied in the same schema through
 * `applyRegistryInvariants`, so there is no path that parses a registry without checking them. A
 * binding's `roster_snapshot` is additionally held to the roster-level rules DATA-MODEL §1 attaches to
 * `conmuta.json`'s roster array (`agent_id` unique, `user_id` unique) through that module's own
 * exported `applyRosterUniqueness`, because the snapshot is a copy of that array and must refuse what
 * its source refuses.
 *
 * **No problem this module can produce carries document text**, and that is structural rather than a
 * promise: the vocabulary below has no free-text member, `unsupported_registry_version.found` is
 * typed `number` so a string cannot be smuggled through it, and `invariant` is the closed
 * `RegistryInvariant` union. These problems reach a log line, a condition an operator reads and (F2)
 * `doctor` output, so a member that could hold a value would copy the file's content into a report —
 * which is exactly the CRITICAL PR-08a's audit found in the sibling module. The one narrowing this
 * costs is that a problem does not name the *field* that failed: the whole file is `registry_invalid`
 * and the message names the rule, not the offset (disclosed in `apply-progress.md`).
 */

/**
 * A bot's token **reference** — never the token (I-2). The keychain arm names the account the secret
 * store was written under; the file arm names the fallback file's path. A token-shaped string in
 * either arm is caught by the loader's raw-text scan (R5) before this schema ever sees the document.
 */
export type RegistryTokenRef =
	| { readonly store: "keychain"; readonly account: string }
	| { readonly store: "file"; readonly path: string };

/** One bot this machine owns (DATA-MODEL §2.1). `username` is display-only and never an authority. */
export interface RegistryBot {
	readonly bot_id: number;
	readonly username: string;
	readonly token_ref: RegistryTokenRef;
	readonly added_at: string;
}

/** One group a bot may serve (DATA-MODEL §2.2). A supergroup id is negative by Telegram's own rule. */
export interface RegistryGroup {
	readonly group_id: number;
	readonly title?: string;
	readonly added_at: string;
}

/**
 * One project folder bound on this machine (DATA-MODEL §2.3).
 *
 * `path` is machine-local and informational — the overview table and (F2) `doctor` read it — and it is
 * deliberately never copied into `conmuta.json`. This schema checks that it is a non-empty string and
 * not that it is absolute: an absolute-path test differs per platform, and a wrong path here chooses
 * no authorization decision (the binding is by `project_id`).
 */
export interface RegistryProject {
	readonly project_id: string;
	readonly path: string;
	readonly name?: string;
}

/**
 * A binding's optional settings (DATA-MODEL §6's draft location).
 *
 * Both keys are optional, so an empty object is a valid settings object. The defaults the consumers
 * apply (`REQUEST_REMINDER_WINDOW_HOURS` from `shared/constants.ts`) are not materialized here: this
 * module's job is the file's shape, and a default written into the parsed registry would make an
 * absent key indistinguishable from one the human set to the default value.
 */
export interface RegistryBindingSettings {
	readonly reminder_window_hours?: number;
	readonly secret_markers?: readonly string[];
}

/**
 * One binding: which bot serves which project in which group (DATA-MODEL §2.4).
 *
 * `roster_snapshot` and `roster_hash` are **required**: D-07 makes the snapshot the admission source,
 * so a binding without it could admit updates while no client is connected using a roster nobody
 * pinned. Both are a copy of the project's `conmuta.json` roster, which is why the snapshot's entries
 * are validated by the project file's own roster schema rather than by a second declaration here, and
 * why the array itself carries that file's roster-level uniqueness rules (see below).
 */
export interface RegistryBinding {
	readonly project_id: string;
	readonly bot_id: number;
	readonly group_id: number;
	readonly agent_id: string;
	readonly status: "active" | "suspended";
	readonly roster_snapshot: readonly ProjectRosterEntry[];
	readonly roster_hash: string;
	readonly settings?: RegistryBindingSettings;
	readonly bound_at: string;
}

/** A validated `~/.conmuta/registry.json` (DATA-MODEL §2). */
export interface Registry {
	readonly registry_version: typeof REGISTRY_VERSION;
	readonly bots: readonly RegistryBot[];
	readonly groups: readonly RegistryGroup[];
	readonly projects: readonly RegistryProject[];
	readonly bindings: readonly RegistryBinding[];
}

/**
 * Why a registry file was refused.
 *
 * Every member is value-free by construction (see the module docstring). The kinds are the sequence
 * of checks that produce them: `unreadable` and `invalid_json` come from the loader, which is the only
 * layer that touches the file; `unsupported_registry_version` is decided before any shape check, so an
 * unknown version never reports a member as invalid; `schema_invalid` is the strict shape;
 * `invariant_violated` names one of R1–R3; `forbidden_content` is R5's pre-parse raw-text scan.
 */
export type RegistryProblem =
	| { readonly kind: "unreadable" }
	| { readonly kind: "invalid_json" }
	| { readonly kind: "unsupported_registry_version"; readonly found: number }
	| { readonly kind: "schema_invalid" }
	| { readonly kind: "invariant_violated"; readonly invariant: RegistryInvariant }
	| { readonly kind: "forbidden_content" };

/** The verdict on one registry document: the parsed registry, or every problem found. */
export type RegistryParseResult =
	| { readonly ok: true; readonly registry: Registry }
	| { readonly ok: false; readonly problems: readonly RegistryProblem[] };

/**
 * The value `shared/roster-hash.ts` emits: the shared prefix plus SHA-256's 64 hex characters.
 *
 * Exported as a pattern *source* rather than only in anchored form because the loader's R5 raw-text
 * scan has to recognize the same value, and for a reason worth stating: `TELEGRAM_BOT_TOKEN_RE` is
 * `\d+:[A-Za-z0-9_-]{35}` with an **unbounded** digit run, and `sha256:` ends in one, so every
 * canonical roster hash matches the token shape by accident. The loader masks this one value before
 * it scans (see `registry/loader.ts`); the anchored form below validates a stored hash.
 */
export const ROSTER_HASH_VALUE_PATTERN = `${ROSTER_HASH_PREFIX}[0-9a-f]{64}`;

/** The exact shape a stored `roster_hash` must have (anchored form of {@link ROSTER_HASH_VALUE_PATTERN}). */
const ROSTER_HASH_RE = new RegExp(`^${ROSTER_HASH_VALUE_PATTERN}$`);

const tokenRefSchema = z.discriminatedUnion("store", [
	z.strictObject({ store: z.literal("keychain"), account: z.string().min(1) }),
	z.strictObject({ store: z.literal("file"), path: z.string().min(1) }),
]);

const botSchema = z.strictObject({
	bot_id: z.number().int().positive(),
	username: z.string(),
	token_ref: tokenRefSchema,
	// `z.iso.datetime()` without `offset: true` requires the `Z` suffix: DATA-MODEL §2.1/§2.4 call
	// these fields ISO 8601 **UTC**, and an offset or a local time is a different convention.
	added_at: z.iso.datetime(),
});

const groupSchema = z.strictObject({
	group_id: z.number().int().negative(),
	title: z.string().optional(),
	added_at: z.iso.datetime(),
});

const projectSchema = z.strictObject({
	project_id: z.string().regex(PROJECT_ID_PATTERN),
	path: z.string().min(1),
	name: z.string().optional(),
});

const bindingSettingsSchema = z.strictObject({
	reminder_window_hours: z.number().int().positive().optional(),
	secret_markers: z.array(z.string()).optional(),
});

const bindingSchema = z
	.strictObject({
		project_id: z.string().regex(PROJECT_ID_PATTERN),
		bot_id: z.number().int().positive(),
		group_id: z.number().int().negative(),
		agent_id: z.string().regex(AGENT_ID_PATTERN),
		status: z.union([z.literal("active"), z.literal("suspended")]),
		roster_snapshot: z.array(rosterEntrySchema).min(1),
		roster_hash: z.string().regex(ROSTER_HASH_RE),
		settings: bindingSettingsSchema.optional(),
		bound_at: z.iso.datetime(),
	})
	.superRefine((binding, ctx) => {
		// The snapshot is a copy of `conmuta.json`'s roster, so it is held to the rules DATA-MODEL §1
		// attaches to that array and not only to the entry shape: a repeated `agent_id` or a repeated
		// `user_id` is refused, which also makes R3's first-match lookup below order-independent.
		//
		// The issue is deliberately **untagged**: R3's gated row does not carry a roster-level
		// uniqueness rule, so naming R3 here would claim a gate that never evaluated it, and the
		// refinement must not name the failing field either — this module's problem vocabulary is
		// value-free by construction. Untagged, it maps to `schema_invalid` through
		// `issueToProblem`.
		applyRosterUniqueness(binding.roster_snapshot, ctx);
	});

/**
 * The strict shape, with the load-time invariants attached.
 *
 * Exported because the design names it as the artifact ("`registry/schema.ts`, `z.strictObject` at
 * every level", design §4) and because F2's `doctor` will want the same schema; a caller that only
 * needs to know whether a document is a registry should use {@link parseRegistryDocument}, which is
 * the function that also decides the version rule.
 */
export const registryFileSchema = z
	.strictObject({
		registry_version: z.literal(REGISTRY_VERSION),
		bots: z.array(botSchema),
		groups: z.array(groupSchema),
		projects: z.array(projectSchema),
		bindings: z.array(bindingSchema),
	})
	.superRefine(applyRegistryInvariants);

/** A zod issue, viewed only through the members the mapping needs. */
interface IssueShape {
	readonly code: string;
	readonly params?: Record<string, unknown>;
}

/**
 * Map one zod issue to a problem.
 *
 * The only distinction is whether the issue carries this module's invariant tag
 * ({@link registryInvariantFromIssue}); everything else is one `schema_invalid`, because the problem
 * vocabulary deliberately names no field (see the module docstring). An untagged custom issue — none
 * exists today — degrades to `schema_invalid` rather than inventing an invariant.
 */
function issueToProblem(issue: IssueShape): RegistryProblem {
	const invariant = registryInvariantFromIssue(issue);
	return invariant === undefined ? { kind: "schema_invalid" } : { kind: "invariant_violated", invariant };
}

/** Read `registry_version` from a parsed document when it is a usable integer. */
function readRegistryVersion(raw: unknown): number | undefined {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return undefined;
	}
	const value = (raw as Record<string, unknown>)["registry_version"];
	return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/**
 * Validate one already-parsed registry document (DATA-MODEL §2, project-binding spec).
 *
 * Order of work, and why:
 * 1. `registry_version` **greater** than this build's is refused as its own problem, carrying the
 *    version it found and nothing else, before any shape validation: an unknown version makes no
 *    promise about its member shapes, so reporting a member as invalid would name the wrong cause
 *    (the same rule `shared/project-file.ts` and `shared/envelope.ts` apply to their own versions).
 *    A missing or non-integer version is not an upgrade path and falls through to the schema.
 * 2. Strict shape parsing, with R1–R3 applied inside the schema.
 *
 * This function is pure: it reads its argument and returns a verdict. It never renames, rewrites or
 * removes the file it was given the text of, and a refused document never yields a partially parsed
 * or silently stripped `Registry` (DATA-MODEL §2, ADR-0030 rule 5). Reading the file, the R5 raw-text
 * scan and the JSON parse are the loader's (`registry/loader.ts`).
 */
export function parseRegistryDocument(raw: unknown): RegistryParseResult {
	const version = readRegistryVersion(raw);
	if (version !== undefined && version > REGISTRY_VERSION) {
		return { ok: false, problems: [{ kind: "unsupported_registry_version", found: version }] };
	}

	const parsed = registryFileSchema.safeParse(raw);
	if (!parsed.success) {
		return { ok: false, problems: collapseShapeProblems(parsed.error.issues.map(issueToProblem)) };
	}
	return { ok: true, registry: parsed.data };
}

/**
 * Collapse the shape problems one malformed document produces into at most one row of each kind.
 *
 * A strict object with several bad members yields one zod issue per member, and every one of them maps
 * to the same `{ kind: "schema_invalid" }` because this vocabulary names no field, by construction.
 * Left alone, a document with two typos reports two byte-identical rows and a thoroughly malformed one
 * reports nine, so the list's length carries no information an operator can act on — two independent
 * judges reached that in round 1 (`JD-A-005`). One row per document is what the invariant vocabulary
 * already does, for the same reason.
 *
 * `invariant_violated` rows need no collapsing here (`applyRegistryInvariants` reports each of R1–R3 at
 * most once) and `unsupported_registry_version` returns before the shape is parsed at all, so these
 * lists stay deterministic per document rather than per issue.
 */
function collapseShapeProblems(problems: readonly RegistryProblem[]): readonly RegistryProblem[] {
	let sawSchemaInvalid = false;
	const kept: RegistryProblem[] = [];
	for (const problem of problems) {
		if (problem.kind === "schema_invalid") {
			if (sawSchemaInvalid) {
				continue;
			}
			sawSchemaInvalid = true;
		}
		kept.push(problem);
	}
	return kept;
}
