import { readFileSync, statSync } from "node:fs";

import { assertNoTokenShape } from "../shared/token-shape.js";
import {
	ROSTER_HASH_VALUE_PATTERN,
	parseRegistryDocument,
	type Registry,
	type RegistryParseResult,
	type RegistryProblem,
} from "./schema.js";

/**
 * Read and hot-reload `~/.conmuta/registry.json` (design §4, §18 D-12; ADR-0030 rules 1 and 5).
 *
 * The loader owns the three things the schema cannot: the file, the R5 raw-text scan that runs
 * **before** parsing, and the last-good registry a failed load leaves in place.
 *
 * **This module never writes.** R6 makes every registry change a human action (CLI wizard, panel or
 * editor), so there is no `writeFileSync`, `renameSync`, `unlinkSync` or `openSync` here, and an
 * invalid file is left exactly as the human wrote it — the quarantine-by-rename doctrine belongs to
 * the ledger alone (DATA-MODEL §2). `test/registry/loader.test.ts` pins the absence structurally (the
 * loader's own key set) and behaviourally (the file's bytes, mtime and directory listing after a
 * refusal), and design §14's daemon-bundle assertion re-checks it over the built closure in PR-28.
 */

/**
 * The condition raised while the registry on disk cannot be used (design §4).
 *
 * A named export rather than a literal, so the daemon's condition store (PR-13), its audit rows and
 * F2's `doctor` share one spelling with the value this loader hands them.
 */
export const REGISTRY_INVALID_CONDITION = "registry_invalid";

/** Stands in for a canonical roster hash while R5 scans the raw text (see `parseRegistryText`). */
const ROSTER_HASH_PLACEHOLDER = "<roster_hash>";

/** The condition name this loader raises. */
export type RegistryCondition = typeof REGISTRY_INVALID_CONDITION;

/**
 * What D-12 reloads on: the file's modification time and size.
 *
 * Not a content hash: the check runs on every heartbeat tick (`HEARTBEAT_PERIOD_MS`) and at
 * `POST /session`, and a fingerprint that costs one `stat` is what keeps it off the read path when
 * nothing changed. The consequence is deliberate and pinned by a test — an edit that preserves both
 * mtime and size is not seen — which is why the pair is recorded only for a file that actually
 * parsed.
 */
export interface RegistryFingerprint {
	readonly mtimeMs: number;
	readonly size: number;
}

/** What one {@link RegistryLoader.sync} found. */
export type RegistrySyncResult =
	| { readonly status: "unchanged" }
	| { readonly status: "loaded"; readonly registry: Registry }
	| { readonly status: "invalid"; readonly condition: RegistryCondition; readonly problems: readonly RegistryProblem[] };

/**
 * A hot-reloadable view of the registry file.
 *
 * `sync()` is what the heartbeat tick and `POST /session` call: it stats the file, reads it only when
 * the fingerprint moved, and never throws — a fault becomes an `invalid` result and the condition,
 * because a daemon that crashed on a human's typo would be the failure mode this design exists to
 * avoid.
 */
export interface RegistryLoader {
	/** The file this loader watches, as given. */
	readonly path: string;
	/** First load and every later reload: one `stat`, and a read only if the fingerprint moved. */
	sync(): RegistrySyncResult;
	/** The last registry that parsed, or `undefined` when nothing valid has ever been loaded. */
	current(): Registry | undefined;
	/** The condition the last failed attempt raised, cleared by the next successful load. */
	condition(): RegistryCondition | undefined;
}

/**
 * Validate registry **text**: R5's scan, then the JSON parse, then the schema and R1–R3.
 *
 * The scan runs first because design §4 says so, and the order is observable: a torn file that also
 * carries a forbidden shape reports `forbidden_content` **alone**. Parsing it as well would add an
 * `invalid_json` complaint about a file that must not be on disk in any form, and would invite an
 * operator to repair the syntax of a file whose content is the actual problem. When the scan fires,
 * parsing is not attempted at all.
 *
 * **The one exception the scan needs, and why it is sound.** `roster_hash` is required on every
 * binding, and its value is `sha256:<64 hex>` — which the shared token regex
 * (`\d+:[A-Za-z0-9_-]{35}`, an unbounded digit run) matches by accident, because `sha256` ends in
 * digits. Scanning the raw text unchanged would therefore refuse *every* valid registry, so the
 * canonical hash value is masked out first ({@link withoutRosterHashes}). The mask cannot hide a real
 * token: it matches exactly `sha256:` followed by 64 characters of `[0-9a-f]`, and a token needs a
 * colon inside that run, which the hexadecimal class cannot contain. Everything else in the file is
 * scanned untouched.
 *
 * The rule that fired is deliberately **not** reported. `assertNoTokenShape` rejects the same shape
 * table the rest of this repository uses (the two shapes of `shared/token-shape.ts` plus the shared
 * secret table), and naming which one it was would mean either parsing that rejection's prose or
 * writing a second copy of the order it applies them in — two implementations of one rule, which is
 * the drift this repository's shared-regex exports exist to prevent. The problem stays value-free
 * instead; naming the rule is a backlog row for the slice that renders the condition.
 */
export function parseRegistryText(text: string): RegistryParseResult {
	try {
		assertNoTokenShape(withoutRosterHashes(text));
	} catch {
		return { ok: false, problems: [{ kind: "forbidden_content" }] };
	}

	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, problems: [{ kind: "invalid_json" }] };
	}
	return parseRegistryDocument(raw);
}

/**
 * Replace every canonical roster-hash value with a placeholder, for the R5 scan only.
 *
 * The returned text is never parsed: {@link parseRegistryText} parses the original. The placeholder
 * carries no digit run and no colon, so it cannot itself become a token shape.
 *
 * The `i` flag is deliberate and is not the schema's rule. `registry/schema.ts` requires the lowercase
 * `sha256:<64 hex>` the shared hasher emits, but this mask has to recognise the *shape* a human can
 * type: an uppercase `sha256:<HEX>` also matches the token regex, and without the `i` flag it would be
 * reported as `forbidden_content` — a false secret report — instead of the `schema_invalid` it really
 * is. The mask stays sound either way: it is `sha256:` followed by 64 hexadecimal characters, and a
 * token's own colon cannot occur inside that class, so no token can ride in a masked region.
 */
function withoutRosterHashes(text: string): string {
	return text.replace(new RegExp(ROSTER_HASH_VALUE_PATTERN, "gi"), ROSTER_HASH_PLACEHOLDER);
}

/** Whether two fingerprints describe the same file state (both members, D-12). */
function isSameFingerprint(left: RegistryFingerprint, right: RegistryFingerprint): boolean {
	return left.mtimeMs === right.mtimeMs && left.size === right.size;
}

/**
 * The only two file operations this loader performs, as a seam.
 *
 * A seam rather than a hard-wired `node:fs` import for two reasons. It is this repository's own testing
 * pattern (design §15 injects `telegramClientFactory`, `secretStore` and `now` the same way), and the
 * ordering guarantee below is otherwise unpinnable: "the fingerprint is taken *before* the read" only
 * becomes observable when the two calls can be separated by a test. It also keeps R6 structural — the
 * interface has no write, rename, unlink or open, so this module cannot rewrite the human's file even
 * by accident, which is the property design §14 asserts over `registry/*.js`.
 */
export interface RegistryFileIo {
	/** `fs.statSync`, reduced to the two fields the fingerprint uses. */
	stat(path: string): { readonly mtimeMs: number; readonly size: number };
	/** `fs.readFileSync(path, "utf8")`. */
	read(path: string): string;
}

/** The real file system, and the default the daemon uses. */
const NODE_FILE_IO: RegistryFileIo = {
	stat(path) {
		const stats = statSync(path);
		return { mtimeMs: stats.mtimeMs, size: stats.size };
	},
	read(path) {
		return readFileSync(path, "utf8");
	},
};

/**
 * A loader over one registry file.
 *
 * The last good registry is held **in memory**: an invalid or torn file keeps it, raises
 * `registry_invalid` and changes nothing on disk, and the next `sync` picks the file up as soon as the
 * human fixes it. A daemon that starts against a file that never parsed holds nothing at all and
 * activates no binding — design §6's flow ("invalid ⇒ empty last-good + `registry_invalid`"), never a
 * defaulted empty registry, which would be indistinguishable from a machine with no bindings.
 */
export function createRegistryLoader(options: { readonly path: string; readonly io?: RegistryFileIo }): RegistryLoader {
	const path = options.path;
	const io = options.io ?? NODE_FILE_IO;
	// The fingerprint is the one observed *before* the read (see `sync`), so it is only recorded for a
	// file that actually parsed: a fingerprint kept for a failed read would make the next `sync` report
	// "unchanged" for content the loader never accepted.
	let lastGood: { readonly registry: Registry; readonly fingerprint: RegistryFingerprint } | undefined;
	let condition: RegistryCondition | undefined;

	const fail = (problems: readonly RegistryProblem[]): RegistrySyncResult => {
		condition = REGISTRY_INVALID_CONDITION;
		return { status: "invalid", condition: REGISTRY_INVALID_CONDITION, problems };
	};

	return {
		path,
		sync(): RegistrySyncResult {
			// The stat is taken **before** the read on purpose: the recorded fingerprint then describes
			// the file the read may have raced with, so a write landing mid-read is picked up by the next
			// `sync` instead of being recorded as already loaded. The cost of this order is one extra
			// read; the cost of the other is admitting updates against content the file no longer has.
			let fingerprint: RegistryFingerprint;
			try {
				fingerprint = io.stat(path);
			} catch {
				return fail([{ kind: "unreadable" }]);
			}

			if (lastGood !== undefined && isSameFingerprint(lastGood.fingerprint, fingerprint)) {
				return { status: "unchanged" };
			}

			// A missing file is refused rather than defaulted, and so is an unreadable one (a directory in
			// the file's place lands here too): on a machine whose registry never parsed, the daemon must
			// hold nothing rather than an empty registry it cannot distinguish from a real empty one.
			let text: string;
			try {
				text = io.read(path);
			} catch {
				return fail([{ kind: "unreadable" }]);
			}

			const parsed = parseRegistryText(text);
			if (!parsed.ok) {
				return fail(parsed.problems);
			}

			lastGood = { registry: parsed.registry, fingerprint };
			condition = undefined;
			return { status: "loaded", registry: parsed.registry };
		},
		current(): Registry | undefined {
			return lastGood?.registry;
		},
		condition(): RegistryCondition | undefined {
			return condition;
		},
	};
}
