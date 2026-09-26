import { EXIT_VALIDATION_FAILED, PRODUCT_NAME } from "../shared/constants.js";

/**
 * Named constants for the F2 installer/doctor surface (design.md §3).
 *
 * Kept out of the merged `shared/constants.ts` on purpose: nothing here is read by the daemon or the
 * thin client, only by the installer/doctor CLI surface this change adds. `test/installer/
 * constants.test.ts` still pins the two exit codes below against every `EXIT_*` value
 * `shared/constants.ts` exports, so a future addition to either file cannot silently collide.
 */

/**
 * The MCP server identity every written tool-config entry advertises (design.md:66).
 *
 * One name on every surface is what makes Pi's name-keyed merge rule (§7.3, D-43) deduplicate a
 * `.pi/mcp.json` entry against an equivalent one already present in `.mcp.json`.
 */
export const MCP_SERVER_NAME = PRODUCT_NAME;

/**
 * Exit code: the installer refused to proceed on an unmet precondition (design.md:67).
 *
 * Next free code after {@link EXIT_VALIDATION_FAILED}; plays the same "well-formed invocation, refused
 * content/state" role `shared/constants.ts` already documents for `EXIT_MIGRATION_REFUSED`.
 */
export const EXIT_INSTALLER_REFUSED = EXIT_VALIDATION_FAILED + 1;

/**
 * Exit code: `conmuta doctor` found at least one `fail`-tier check (design.md:68).
 *
 * Next free code after {@link EXIT_INSTALLER_REFUSED}. A run with only `warn`-tier findings still
 * exits 0 — only a `fail` is disruptive enough to fail a script that shells out to `doctor`.
 */
export const EXIT_DOCTOR_FAILED = EXIT_INSTALLER_REFUSED + 1;

/**
 * Milliseconds `installer/ledger-access.ts` sets as the ledger's `busy_timeout` pragma (design.md:69).
 *
 * A poll-batch commit only ever holds the write lock for milliseconds; five seconds absorbs a burst
 * of daemon activity while a human is still sitting at a wizard prompt, rather than surfacing a
 * transient busy lock as a hard installer failure.
 */
export const INSTALLER_LEDGER_BUSY_TIMEOUT_MS = 5000;

/**
 * Prefix for every pre-edit backup file the installer's edit engine writes (design.md:70).
 *
 * Follows DATA-MODEL's `*.bak-<reason>-<date>` convention with `<reason>` fixed to this product's own
 * name (B-11); `installer/file-edit.ts` (PR-02) appends a second-resolution `YYYYMMDDTHHMMSSZ`
 * timestamp plus `COPYFILE_EXCL` so a same-day re-run never overwrites the original backup.
 */
export const BACKUP_SUFFIX_PREFIX = `.bak-pre-${PRODUCT_NAME}-`;

/** Spaces per indent level, used only when a target file has no indented line to learn from (design.md:71). */
export const JSON_DEFAULT_INDENT = 2;

/** Maximum lines the installer's `AGENTS.md` template writes (design.md:72, OVERVIEW §10.1 step 5). */
export const AGENTS_MD_MAX_LINES = 200;

/** Windows registry key under which the installer registers start-at-login (design.md:73, OVERVIEW §7.1, D-40). */
export const AUTOSTART_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

/**
 * Registry value name the installer writes under {@link AUTOSTART_RUN_KEY} (design.md:74).
 *
 * Follows this product's own name (B-11, trademark clearance pending): renaming the product renames
 * this value too.
 */
export const AUTOSTART_VALUE_NAME = PRODUCT_NAME;

/**
 * macOS launchd label the installer's plist declares (design.md:75).
 *
 * Reverse-DNS form launchd expects; renamed together with {@link AUTOSTART_VALUE_NAME} under B-11.
 */
export const AUTOSTART_LAUNCHD_LABEL = `io.${PRODUCT_NAME}.daemon`;

/**
 * Domain-separation label doctor's own proof strings carry (design.md:76, D-14).
 *
 * Keeps a doctor proof from ever being mistaken for an `identity:` or `session:` proof — the same
 * domain-separation rule D-14 already applies to those two.
 */
export const DOCTOR_PROOF_LABEL = "doctor:";

/**
 * Bounded retries for a Windows rename-over of `registry.json` (design.md:77).
 *
 * A concurrent daemon read can transiently fail the rename with `EPERM`/`EBUSY`; after this many
 * attempts the installer gives up and refuses with the pre-edit backup still intact, rather than
 * retrying forever.
 */
export const REGISTRY_REPLACE_ATTEMPTS = 3;
