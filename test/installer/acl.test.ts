import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

import { POSIX_PRIVATE_DIR_MODE } from "../../src/shared/constants.js";
import { hardenHomeAcl } from "../../src/installer/acl.js";
import { icaclsExePath, REAL_EXEC_FILE, EXEC_FILE_OPTIONS, type ExecFileImpl } from "../../src/installer/exec.js";

/**
 * `installer/acl.ts` (design.md §11, D-49, THREAT-MODEL §5.5; tasks.md PR-08 sub-task 8.3): the Windows
 * DACL / POSIX mode hardening `setup` applies to the daemon home once.
 *
 * The Windows argv-shape test injects a fake exec implementation; the grantee-list, inheritance-flag
 * and idempotent-re-run assertions run a **real** `icacls` round trip against a scratch temp directory
 * this file creates and removes itself — never a real system path, never `$HOME`. Mirrors the pattern
 * `test/secret-store/file-fallback.test.ts` already established for PT-19's own real `icacls` round
 * trip (its grantee/negative list is intentionally duplicated here in miniature rather than importing
 * from that already-merged, frozen test file across an unrelated compile boundary).
 */

/** Windows grantee names that must never appear on a hardened home's DACL (subset of PT-19's own list). */
const FORBIDDEN_GRANTEES = ["BUILTIN\\Users", "Everyone", "Authenticated Users", "S-1-1-0", "S-1-5-32-545"];

/** Runs `body` against a fresh scratch directory and removes it afterwards, even on failure. */
function withScratchHome(body: (home: string) => void): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-acl-"));
	try {
		body(home);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}

/** The trustee name `icacls` resolves unambiguously, mirroring `acl.ts`'s own private construction. */
function qualifiedCurrentUser(): string {
	const { username } = userInfo();
	const domain = process.env.USERDOMAIN ?? "";
	return domain === "" ? username : `${domain}\\${username}`;
}

/** Real `icacls <path>` output: what the DACL assertions read. */
function aclOf(path: string): string {
	return REAL_EXEC_FILE(icaclsExePath(), [path], EXEC_FILE_OPTIONS);
}

test(
	"Windows: hardenHomeAcl issues the exact icacls invocation shape D-49 requires",
	{ skip: process.platform !== "win32" },
	() => {
		const calls: { file: string; args: readonly string[] }[] = [];
		const execImpl: ExecFileImpl = (file, args, options) => {
			calls.push({ file, args });
			assert.equal(options.shell, false);
			return "";
		};

		hardenHomeAcl({ homeDir: "C:\\fake\\home", execImpl });

		assert.equal(calls.length, 1, "icacls must be invoked exactly once");
		assert.equal(calls[0]?.file, icaclsExePath());
		assert.deepEqual(calls[0]?.args.slice(0, 3), ["C:\\fake\\home", "/inheritance:r", "/grant:r"]);
		const grantArg = calls[0]?.args[3] ?? "";
		assert.match(grantArg, /:\(OI\)\(CI\)F$/, "the grant must carry the inheritable (OI)(CI) flags (D-49)");
		assert.equal(calls[0]?.args.length, 4, "argv must be exactly [home, /inheritance:r, /grant:r, grant]");
	},
);

test(
	"Windows: hardenHomeAcl grants only the current user, with inheritable flags, on a real scratch directory",
	{ skip: process.platform !== "win32" },
	() => {
		withScratchHome((home) => {
			hardenHomeAcl({ homeDir: home });

			const acl = aclOf(home);
			const user = qualifiedCurrentUser();
			const forbidden = FORBIDDEN_GRANTEES.filter((grantee) => acl.includes(grantee));
			assert.deepEqual(forbidden, [], `hardened home DACL lists non-user grantee(s): ${forbidden.join(", ")}\n${acl}`);
			assert.ok(
				acl.toUpperCase().includes(user.toUpperCase()),
				`expected the hardened home DACL to list the current user (${user})\n${acl}`,
			);
			assert.ok(acl.includes("(OI)") && acl.includes("(CI)"), `expected inheritable (OI)(CI) flags in the ACL\n${acl}`);
		});
	},
);

test(
	"Windows: re-running hardenHomeAcl on an already-hardened home does not duplicate or widen the grant",
	{ skip: process.platform !== "win32" },
	() => {
		withScratchHome((home) => {
			hardenHomeAcl({ homeDir: home });
			hardenHomeAcl({ homeDir: home });

			const acl = aclOf(home);
			const user = qualifiedCurrentUser();
			const occurrences = acl.toUpperCase().split(user.toUpperCase()).length - 1;
			assert.equal(occurrences, 1, `expected the current user to appear exactly once after two runs\n${acl}`);
			const forbidden = FORBIDDEN_GRANTEES.filter((grantee) => acl.includes(grantee));
			assert.deepEqual(forbidden, [], `re-run must not widen the grant: ${forbidden.join(", ")}\n${acl}`);
		});
	},
);

test(
	"POSIX: hardenHomeAcl chmods the home directory to the owner-only directory mode",
	{ skip: process.platform === "win32" },
	() => {
		withScratchHome((home) => {
			hardenHomeAcl({ homeDir: home });
			assert.equal(statSync(home).mode & 0o777, POSIX_PRIVATE_DIR_MODE);
		});
	},
);
