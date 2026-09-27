import { redactTokenShapes } from "../secret-store/redaction.js";
import type { Finding } from "./checks/system.js";

/**
 * Formats {@link Finding}s into printable lines (`doctor/report.ts`, design.md §9.1; tasks.md 14.5).
 *
 * Mirrors `cli/validate.ts`'s own `{exitCode, out, err}` shape (`ValidateReport`): `out` carries
 * `pass`/`warn` lines, `err` carries `fail` lines, and `exitCode` is 0 only when nothing failed.
 *
 * Every printed detail passes {@link redactTokenShapes} before it is added to either stream.
 * design.md §9.2 states this rule against the *online* tier's response ("every `detail` passes
 * `redactTokenShapes`"), but the same defense-in-depth applies here: an offline detail string can
 * embed a home directory path, an ACL trustee name or a lock file's raw contents, and redacting a
 * token-shaped substring out of any of those costs nothing.
 */

/** What {@link formatFindings} produces. */
export interface DoctorReport {
	readonly exitCode: number;
	readonly out: readonly string[];
	readonly err: readonly string[];
}

/** Formats `findings` into a {@link DoctorReport}: `pass`/`warn` land in `out`, `fail` lands in `err`. */
export function formatFindings(findings: readonly Finding[]): DoctorReport {
	const out: string[] = [];
	const err: string[] = [];
	let anyFailed = false;

	for (const finding of findings) {
		const line = redactTokenShapes(`[${finding.status}] ${finding.id}: ${finding.detail}`);
		if (finding.status === "fail") {
			anyFailed = true;
			err.push(line);
		} else {
			out.push(line);
		}
	}

	return { exitCode: anyFailed ? 1 : 0, out, err };
}
