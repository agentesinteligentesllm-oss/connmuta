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
 * The Windows argv-shape test injects a fake exec implementation; the grantee, inheritance-flag and
 * idempotent-re-run assertions run a **real** `icacls` round trip against a scratch temp directory
 * this file creates and removes itself — never a real system path, never `$HOME`. Mirrors the real-
 * round-trip pattern `test/secret-store/file-fallback.test.ts` already established for PT-19. Grantee
 * assertions parse `icacls`'s own ACE lines ({@link aclTrustees}) rather than substring-matching the
 * raw output, which also contains the queried path — a scratch temp directory sitting under the
 * current user's profile can otherwise make the username match the path text, not a real ACE (native
 * review findings R2-001/R2-002/R3-idempotency-count-fragile/R3-only-user-not-proved).
 */

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

/**
 * Real `icacls <path>` output with the leading path stripped from its first line.
 *
 * `icacls`'s own output starts with the queried path followed by its first ACE on the same line
 * (`<path> <trustee>:(...)`, continuation ACEs indented on their own lines below). A scratch temp
 * directory normally sits under the current user's profile path, so the path itself can contain the
 * username — matching or counting against the *raw* output would then find a false hit in the path
 * text, not a real ACE (native review findings R2-001/R2-002/R3-idempotency-count-fragile).
 */
function aclEntriesOf(path: string): string {
	const raw = REAL_EXEC_FILE(icaclsExePath(), [path], EXEC_FILE_OPTIONS);
	return raw.startsWith(path) ? raw.slice(path.length) : raw;
}

/** Extracts each ACE's trustee name from `icacls` output already stripped of its leading path. */
function aclTrustees(entriesText: string): string[] {
	return [...entriesText.matchAll(/^[ \t]*(\S[^\r\n]*?):\(/gm)].map((match) => match[1].trim());
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

			const entries = aclEntriesOf(home);
			const user = qualifiedCurrentUser();
			const trustees = aclTrustees(entries).map((trustee) => trustee.toUpperCase());
			assert.deepEqual(
				trustees,
				[user.toUpperCase()],
				`expected exactly one ACE, granting only the current user (${user})\n${entries}`,
			);
			assert.ok(entries.includes("(OI)") && entries.includes("(CI)"), `expected inheritable (OI)(CI) flags in the ACL\n${entries}`);
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

			const entries = aclEntriesOf(home);
			const user = qualifiedCurrentUser();
			const trustees = aclTrustees(entries).map((trustee) => trustee.toUpperCase());
			assert.deepEqual(
				trustees,
				[user.toUpperCase()],
				`expected exactly one ACE for the current user after two runs, neither duplicated nor widened\n${entries}`,
			);
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
