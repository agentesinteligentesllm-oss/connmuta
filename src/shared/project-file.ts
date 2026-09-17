import { z } from "zod";

import { PROJECT_FILE_SCHEMA_VERSION, PROJECT_ID_PATTERN } from "./constants.js";
import { AGENT_ID_PATTERN } from "./envelope.js";
import { AUTHORIZATION_LITERAL, findTokenShapes } from "./token-shape.js";

/**
 * One member of a project's bus roster (DATA-MODEL §1).
 *
 * `username` is display-only and is never an authorization input; `user_id` is the identity anchor.
 */
export interface RosterEntry {
	readonly agent_id: string;
	readonly user_id: number;
	readonly username: string;
}

/** A validated `conmuta.json` (DATA-MODEL §1; project-binding › Committed project file schema). */
export interface ProjectFile {
	readonly schema_version: typeof PROJECT_FILE_SCHEMA_VERSION;
	readonly project_id: string;
	readonly group_id: number;
	readonly roster: readonly RosterEntry[];
	readonly referee?: string;
}

/**
 * The content rules the field-level walk enforces (DATA-MODEL §1 "Must never contain").
 *
 * The first two are {@link findTokenShapes}' classes; the last two are this module's own, because a
 * committed local path is a leak of machine layout rather than a secret shape.
 */
export type ForbiddenContentRule =
	| "authorization_literal"
	| "token_shape"
	| "drive_prefix"
	| "path_separator";

/**
 * Why a file was refused.
 *
 * **Every member is value-free by construction.** A problem carries a `kind`, the offending
 * `field`, and the `rule` that fired — never the matched or rejected text. This is a structural
 * guarantee, not a review promise: `unsupported_schema_version.found` is typed `number`, so a
 * string can never be smuggled through it, and no other member has a field that could hold one.
 * These problems reach operator terminals, pre-commit hooks and (F2) `doctor` output, so a value
 * here would copy the very content the validator exists to keep out (PT-05, PT-06).
 */
export type ProjectFileProblem =
	| { readonly kind: "invalid_json" }
	| { readonly kind: "unsupported_schema_version"; readonly found: number }
	| { readonly kind: "schema_invalid"; readonly field: string }
	| { readonly kind: "forbidden_content"; readonly field: string; readonly rule: ForbiddenContentRule };

/** The loader's outcome: either a fully validated file, or every problem found. */
export type ProjectFileResult =
	| { readonly ok: true; readonly file: ProjectFile }
	| { readonly ok: false; readonly problems: readonly ProjectFileProblem[] };

/** A Windows drive prefix. Anchored deliberately: the rule is about a prefix, not a colon anywhere. */
const DRIVE_PREFIX_RE = /^[A-Za-z]:/;

/**
 * Path separators from both families.
 *
 * Both, not just the local host's: the file is committed and read on whichever machine a teammate
 * uses, so a POSIX separator is as much a leak here as a Windows one.
 */
const PATH_SEPARATORS = ["/", "\\"] as const;

const rosterEntrySchema = z.strictObject({
	agent_id: z.string().regex(AGENT_ID_PATTERN),
	user_id: z.number().int().positive(),
	username: z.string(),
});

const projectFileSchema = z
	.strictObject({
		schema_version: z.literal(PROJECT_FILE_SCHEMA_VERSION),
		project_id: z.string().regex(PROJECT_ID_PATTERN),
		group_id: z.number().int().negative(),
		roster: z.array(rosterEntrySchema).min(1),
		referee: z.string().optional(),
	})
	.superRefine((file, ctx) => {
		const firstAgentUse = new Map<string, number>();
		const firstUserUse = new Map<number, number>();
		file.roster.forEach((entry, index) => {
			const agentSeenAt = firstAgentUse.get(entry.agent_id);
			if (agentSeenAt === undefined) {
				firstAgentUse.set(entry.agent_id, index);
			} else {
				// No value in the message: it is rendered into operator output, and the problem type it
				// becomes carries the path only.
				ctx.addIssue({ code: "custom", path: ["roster", index, "agent_id"] });
			}
			const userSeenAt = firstUserUse.get(entry.user_id);
			if (userSeenAt === undefined) {
				firstUserUse.set(entry.user_id, index);
			} else {
				ctx.addIssue({ code: "custom", path: ["roster", index, "user_id"] });
			}
		});
		if (file.referee !== undefined && !firstAgentUse.has(file.referee)) {
			ctx.addIssue({ code: "custom", path: ["referee"] });
		}
	});

/** A zod issue, viewed only through the members the mapping needs. */
interface IssueShape {
	readonly code: string;
	readonly path: readonly PropertyKey[];
	readonly keys?: readonly string[];
}

/** Render a zod issue path as `roster[0].agent_id`-style text; the document root is `<root>`. */
function renderPath(path: readonly PropertyKey[]): string {
	if (path.length === 0) {
		return "<root>";
	}
	let rendered = "";
	for (const segment of path) {
		rendered += typeof segment === "number" ? `[${segment}]` : rendered === "" ? String(segment) : `.${String(segment)}`;
	}
	return rendered;
}

/** Append an unknown-key name to its parent path, so an unknown key names the key itself. */
function joinPath(path: readonly PropertyKey[], key: string): string {
	const parent = renderPath(path);
	return parent === "<root>" ? key : `${parent}.${key}`;
}

/**
 * Map one issue to problems.
 *
 * An `unrecognized_keys` issue reports the whole rejected key set on one issue with an empty path,
 * so it expands to one problem per key: the requirement is that the *offending field* is named, and
 * naming only the first unknown key would send an operator round twice for a two-typo file.
 */
function issueToProblems(issue: IssueShape): ProjectFileProblem[] {
	if (issue.code === "unrecognized_keys") {
		return (issue.keys ?? []).map((key) => ({ kind: "schema_invalid" as const, field: joinPath(issue.path, key) }));
	}
	return [{ kind: "schema_invalid", field: renderPath(issue.path) }];
}

/**
 * The first content rule `value` violates, in this fixed order: `Authorization` literal, token
 * shape, drive prefix, path separator.
 *
 * The order is load-bearing and pinned: a Windows path such as `C:\project` contains a separator
 * too, so the anchored drive-prefix rule must be asked first or the report would name the weaker
 * rule. `Authorization` is asked before the token shape because {@link findTokenShapes} counts both
 * shapes together and the specific rule is the more useful report.
 */
function forbiddenContentRule(value: string): ForbiddenContentRule | undefined {
	if (value.includes(AUTHORIZATION_LITERAL)) return "authorization_literal";
	if (findTokenShapes(value).count > 0) return "token_shape";
	if (DRIVE_PREFIX_RE.test(value)) return "drive_prefix";
	if (PATH_SEPARATORS.some((separator) => value.includes(separator))) return "path_separator";
	return undefined;
}

/**
 * Walk every string in the raw parsed document, in document order, collecting content problems.
 *
 * Runs over the **raw** value rather than the validated file on purpose: a file with an unknown key
 * is refused anyway, and skipping the walk there would hide a token sitting in the same document.
 * The path is built with the same `roster[0].agent_id` convention as the schema problems.
 */
function collectForbiddenContent(value: unknown, path: string, findings: ProjectFileProblem[]): void {
	if (typeof value === "string") {
		const rule = forbiddenContentRule(value);
		if (rule !== undefined) {
			findings.push({ kind: "forbidden_content", field: path === "" ? "<root>" : path, rule });
		}
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => collectForbiddenContent(item, `${path}[${index}]`, findings));
		return;
	}
	if (typeof value === "object" && value !== null) {
		for (const [key, item] of Object.entries(value)) {
			collectForbiddenContent(item, path === "" ? key : `${path}.${key}`, findings);
		}
	}
}

/** Read `schema_version` from a parsed document when it is a usable integer. */
function readSchemaVersion(raw: unknown): number | undefined {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return undefined;
	}
	const value = (raw as Record<string, unknown>)["schema_version"];
	return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/**
 * Validate the text of a `conmuta.json` (DATA-MODEL §1, project-binding spec).
 *
 * Order of work, and why:
 * 1. `JSON.parse` — a document that is not JSON is reported as `invalid_json` and nothing else; the
 *    caller that wants to catch a leak inside a broken document runs the raw-text scan itself.
 * 2. A `schema_version` **greater** than this build's is refused as its own problem with the found
 *    version, before any shape validation: an unknown version makes no promise about its member
 *    shapes, so reporting a member as invalid would name the wrong cause (the same rule
 *    `shared/envelope.ts` applies to an unsupported wire sentinel). A missing or non-numeric
 *    `schema_version` is not an upgrade path and falls through to the schema.
 * 3. Strict schema validation, then the content walk over the raw document. Schema problems come
 *    first in the list because they describe the document's structure; content problems follow.
 *
 * This function is pure: it reads its argument and returns a result. It never renames, rewrites or
 * removes the file it was given the text of (DATA-MODEL §1), and a refused document never yields a
 * partially parsed or silently stripped `ProjectFile`.
 */
export function parseProjectFile(text: string): ProjectFileResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, problems: [{ kind: "invalid_json" }] };
	}

	const version = readSchemaVersion(raw);
	if (version !== undefined && version > PROJECT_FILE_SCHEMA_VERSION) {
		return { ok: false, problems: [{ kind: "unsupported_schema_version", found: version }] };
	}

	const problems: ProjectFileProblem[] = [];
	const parsed = projectFileSchema.safeParse(raw);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			problems.push(...issueToProblems(issue));
		}
	}
	collectForbiddenContent(raw, "", problems);

	// Both classes refuse the file. A document whose schema is valid but whose content leaks is
	// refused just the same, and must not yield a `file`: returning the parsed file here while
	// dropping the content problems was a live defect this slice's RED caught.
	if (!parsed.success || problems.length > 0) {
		return { ok: false, problems };
	}
	return { ok: true, file: parsed.data };
}
