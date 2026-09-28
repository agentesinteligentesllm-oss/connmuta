import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import { appendAuditRow, type AuditRow } from "../ledger/audit.js";
import { withTransaction } from "../ledger/transaction.js";
import { parseRegistryText } from "../registry/loader.js";
import type { Registry, RegistryProblem } from "../registry/schema.js";
import { serializeRegistry, validateRegistryBytes } from "../registry/writer.js";

/**
 * The installer's one-transaction registry commit (D-41, design.md §5): every registry write appends
 * its own R6 audit row and renames `registry.json` inside the same `BEGIN IMMEDIATE` ledger
 * transaction, so a crash between the two can never leave one without the other.
 *
 * **Why this does not call `registry/writer.ts`'s `replaceRegistryFile` for the rename itself.** That
 * function is built to run *outside* any transaction: a rename failure there is retried a bounded
 * number of times and always returned as a typed `"replace-failed"` outcome, never thrown. Inside a
 * transaction the opposite is required — a failure must *throw*, so `withTransaction` rolls the just
 * -appended audit row back — so this module performs its own single-attempt temp-write-then-rename
 * instead. It still reuses that module's pure `serializeRegistry`/`validateRegistryBytes` pair for the
 * identical validate-before-replace check, so there is exactly one place that decides whether a
 * document is fit to write.
 *
 * **The restore-from-backup case design §5 describes** ("a commit failure after the rename... restores
 * the backup") is the one window a SQL transaction cannot cover: the filesystem rename is not part of
 * SQLite's own atomicity, so a failure *after* a successful rename but before `COMMIT` (an I/O failure
 * at commit time; `ledger/transaction.ts`'s own doc names `SQLITE_FULL`/`SQLITE_IOERR` as automatic-
 * rollback classes) would otherwise leave `registry.json` reflecting a change the ledger just rolled
 * back. This module tracks whether its own rename actually landed and, only in that case, restores the
 * text read at the start of the call.
 */

/** The `audit_log.reason` values a registry commit may write (design §5). */
export type RegistryCommitReason = "REGISTRY_CREATED" | "BOT_ADDED" | "GROUP_ADDED" | "PROJECT_BOUND" | "ROSTER_SYNCED";

/**
 * The audit row a caller supplies for one commit.
 *
 * `direction`, `outcome` and `client_id` are this module's own — always `"system"`, `"ok"` and
 * `null` (design §5) — so a caller cannot drift from R6's fixed shape for an installer-authored row.
 */
export type RegistryCommitAudit = Omit<AuditRow, "direction" | "outcome" | "client_id" | "reason"> & {
	readonly reason: RegistryCommitReason;
};

/** The file operations {@link commitRegistryChange} needs, as an injectable seam for tests. */
export interface RegistryCommitIo {
	writeTemp(tempPath: string, text: string): void;
	rename(tempPath: string, path: string): void;
	removeTemp(tempPath: string): void;
	/**
	 * Test-only seam: called immediately after a successful rename, before the transaction's `COMMIT`.
	 * Real IO leaves this absent; a test uses it to pin the restore-from-backup path without needing a
	 * genuine SQLite commit-time I/O failure.
	 */
	afterRename?(): void;
}

const NODE_COMMIT_IO: RegistryCommitIo = {
	writeTemp(tempPath, text) {
		writeFileSync(tempPath, text, "utf8");
	},
	rename(tempPath, path) {
		renameSync(tempPath, path);
	},
	removeTemp(tempPath) {
		rmSync(tempPath, { force: true });
	},
};

/** What {@link commitRegistryChange} needs. */
export interface RegistryCommitOptions {
	/** The open ledger connection (`installer/ledger-access.ts`); not inside a transaction already. */
	readonly db: DatabaseSync;
	/** Absolute path of `registry.json`. */
	readonly registryPath: string;
	/** Computes the next registry from the current, already-validated one. */
	readonly mutate: (current: Registry) => Registry;
	/** The audit row this commit writes on success. */
	readonly audit: RegistryCommitAudit;
	/** Overridable for tests; defaults to real `node:fs` temp-write-then-rename. */
	readonly io?: RegistryCommitIo;
}

/** What {@link commitRegistryChange} decided. */
export type RegistryCommitOutcome =
	| { readonly outcome: "committed" }
	| { readonly outcome: "current-invalid"; readonly problems: readonly RegistryProblem[] }
	| { readonly outcome: "invalid"; readonly problems: readonly RegistryProblem[] }
	| { readonly outcome: "commit-failed"; readonly error: unknown };

/**
 * Validates the current `registry.json`, computes the next document, and — only if both the current
 * read and the computed change validate — appends exactly one audit row and renames the file into
 * place inside one `BEGIN IMMEDIATE` ledger transaction (design §5).
 *
 * A refusal (`"current-invalid"` or `"invalid"`) is decided before any transaction opens: no audit row
 * is appended and no file is touched. A failure after that point (the rename itself, or the transaction's
 * own `COMMIT`) rolls the audit row back and, if the rename had already landed, restores the original
 * bytes this call started with.
 */
export function commitRegistryChange(options: RegistryCommitOptions): RegistryCommitOutcome {
	const { db, registryPath, mutate, audit } = options;
	const io = options.io ?? NODE_COMMIT_IO;

	const currentText = readFileSync(registryPath, "utf8");
	const currentParsed = parseRegistryText(currentText);
	if (!currentParsed.ok) {
		return { outcome: "current-invalid", problems: currentParsed.problems };
	}

	const nextText = serializeRegistry(mutate(currentParsed.registry));
	const validated = validateRegistryBytes(nextText);
	if (!validated.ok) {
		return { outcome: "invalid", problems: validated.problems };
	}

	let renamed = false;
	try {
		withTransaction(db, () => {
			appendAuditRow(db, {
				ts: audit.ts,
				project_id: audit.project_id,
				bot_id: audit.bot_id,
				chat_id: audit.chat_id,
				client_id: null,
				direction: "system",
				eid: audit.eid,
				envelope_type: audit.envelope_type,
				from_user_id: audit.from_user_id,
				to_user_id: audit.to_user_id,
				outcome: "ok",
				reason: audit.reason,
			});

			const tempPath = `${registryPath}.tmp-${randomUUID()}`;
			io.writeTemp(tempPath, nextText);
			try {
				io.rename(tempPath, registryPath);
			} catch (error) {
				io.removeTemp(tempPath);
				throw error;
			}
			renamed = true;
			io.afterRename?.();
		});
	} catch (error) {
		if (renamed) {
			// The rename already landed but the transaction did not commit: restore what this call
			// started with, so the file and the (rolled-back) ledger agree again.
			writeFileSync(registryPath, currentText, "utf8");
		}
		return { outcome: "commit-failed", error };
	}

	return { outcome: "committed" };
}
