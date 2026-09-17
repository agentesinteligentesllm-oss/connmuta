import { EXIT_VALIDATION_FAILED, PROJECT_FILE_NAME, PROJECT_FILE_SCHEMA_VERSION } from "../shared/constants.js";
import { parseProjectFile } from "../shared/project-file.js";
import { findTokenShapes } from "../shared/token-shape.js";

/** What the command reports, already split by stream so the shell only has to print it. */
export interface ValidateReport {
	readonly exitCode: number;
	readonly out: readonly string[];
	readonly err: readonly string[];
}

/**
 * The pure core of `conmuta validate [<path> | --stdin]` (D-29, design.md:150): classify one text and
 * return the lines to print.
 *
 * Ordering that matters:
 * - A document that is **not** JSON is reported as invalid JSON, but the raw text is scanned for the
 *   token shape first. Otherwise a leak inside a file with a stray comma would be invisible to the
 *   very command the opt-in pre-commit hook runs.
 * - The source label (a path, or `<stdin>`) prefixes every line, because a hook reports the failure
 *   outside the command's own output.
 *
 * **No line can carry a value.** Every message is built from a problem's `kind`, `field` and `rule`,
 * never from the document's text: this output lands in a terminal, in a commit hook log and (F2) in
 * `doctor`. That property is inherited from {@link parseProjectFile}'s value-free problem type, and
 * pinned by tests at both the function and the process boundary.
 *
 * Exit codes: a validated file returns 0; any refusal returns {@link EXIT_VALIDATION_FAILED}. Usage
 * errors are the dispatcher's (`cli/main.ts`), never this function's.
 */
export function validateText(text: string, source: string): ValidateReport {
	const result = parseProjectFile(text);
	if (result.ok) {
		return { exitCode: 0, out: [`${source}: valid ${PROJECT_FILE_NAME}`], err: [] };
	}

	const err: string[] = [];
	for (const problem of result.problems) {
		switch (problem.kind) {
			case "invalid_json":
				if (findTokenShapes(text).count > 0) {
					err.push(
						`${source}: forbidden content in <document> (rule: telegram_bot_token_shape)`,
					);
				}
				err.push(`${source}: not valid JSON`);
				break;
			case "unsupported_schema_version":
				err.push(
					`${source}: unsupported schema_version ${problem.found}; this build supports ${PROJECT_FILE_SCHEMA_VERSION}. Upgrade before continuing.`,
				);
				break;
			case "schema_invalid":
				err.push(`${source}: invalid ${problem.field}`);
				break;
			case "forbidden_content":
				err.push(`${source}: forbidden content in ${problem.field} (rule: ${problem.rule})`);
				break;
		}
	}

	return { exitCode: EXIT_VALIDATION_FAILED, out: [], err };
}
