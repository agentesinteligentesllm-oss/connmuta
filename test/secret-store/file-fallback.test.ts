import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { POSIX_PRIVATE_FILE_MODE } from "../../src/shared/constants.js";
import { createFileFallbackStore } from "../../src/secret-store/file-fallback.js";

/**
 * The ACL'd file fallback (`src/secret-store/file-fallback.ts`, PT-09 fallback half, PT-19).
 *
 * PT-19 (win-x64 half): the test applies `icacls` to a **temp home** itself and then has the store
 * write a fallback file, asserting through `icacls` output that only the current user is listed.
 * That is what proves the file **inherits** the home's DACL — the mechanism the F2 doctor will rely
 * on. `icacls` runs in this test file only: the daemon never spawns it (design §6, PT-28).
 * POSIX half: the mode is `POSIX_PRIVATE_FILE_MODE` (0600).
 */

/** A fixture bot id, deliberately seven digits: it can never satisfy the 8–10 digit token shape (PT-22). */
const BOT_ID = "1234567";

/** A fixture token shaped like a real one but unmistakably synthetic. */
const FIXTURE_TOKEN = `${BOT_ID}:${"A".repeat(35)}`;

/** The file name a committed token occupies under `secrets/` (design §6). */
const TOKEN_FILE_NAME = `${BOT_ID}.token`;

/**
 * Windows grantee names (and their well-known SIDs) that must never appear on the fallback file.
 *
 * `icacls` prints names on an English system and SIDs where a name cannot be resolved, so both
 * spellings are listed; one hit is the failure.
 */
const FORBIDDEN_GRANTEES = [
	"BUILTIN\\Users",
	"Everyone",
	"Authenticated Users",
	"NT AUTHORITY\\Authenticated Users",
	"CREATOR OWNER",
	"S-1-1-0",
	"S-1-5-32-545",
	"S-1-5-11",
];

/** Runs `body` against a fresh temp home and removes the home afterwards. */
async function inHome(body: (home: string) => Promise<void>): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "conmuta-fallback-"));
	let failure: unknown;
	try {
		await body(home);
	} catch (error) {
		failure = error;
	}
	try {
		rmSync(home, { recursive: true, force: true });
	} catch (error) {
		// Cleanup must never replace the failure under test: report it as a note and let the assertion
		// error be the one the runner shows. Only a cleanup failure on an otherwise green test fails it.
		if (failure === undefined) {
			throw error;
		}
		console.error(`cleanup of ${home} failed after an unrelated test failure:`, error);
	}
	if (failure !== undefined) {
		throw failure;
	}
}

/** The `secrets/` directory the store owns under a home (design §6). */
function secretsDir(home: string): string {
	return join(home, "secrets");
}

/** The committed token path for {@link BOT_ID}. */
function tokenPath(home: string): string {
	return join(secretsDir(home), TOKEN_FILE_NAME);
}

/**
 * The current user as `DOMAIN\name` — the form `icacls` needs to resolve it unambiguously.
 *
 * Measured on this host: `COMPUTERNAME`, `USERDOMAIN` and `USERNAME` are all `LABORATORIO`, and the
 * bare name is therefore read as a **domain**: `icacls <dir> /grant:r LABORATORIO:(OI)(CI)F` exits 0
 * having granted `LABORATORIO\` (an empty account) instead of the user, which strips the current
 * user's access when it is combined with `/inheritance:r` — the next `mkdir` then fails `EPERM`.
 * Qualifying the name is what the F2 doctor's home-hardening step must do on such a host too.
 */
function currentUserName(): string {
	const name = process.env.USERNAME ?? process.env.USER ?? "";
	assert.notEqual(name, "", "expected the current user's name to be in the environment");
	const domain = process.env.USERDOMAIN ?? "";
	return domain === "" ? name : `${domain}\\${name}`;
}

/** `icacls <path>` output: what the DACL assertions read, and what a failure prints. */
function aclOf(path: string): string {
	return execFileSync("icacls", [path], { encoding: "utf8" });
}

test("the fallback store reports kind 'file'", async () => {
	await inHome(async (home) => {
		assert.equal(createFileFallbackStore(home).kind, "file");
	});
});

test("round trip: set then get returns the same token", async () => {
	await inHome(async (home) => {
		const store = createFileFallbackStore(home);
		await store.set(BOT_ID, FIXTURE_TOKEN);
		assert.equal(await store.get(BOT_ID), FIXTURE_TOKEN);
	});
});

test("get returns null for a non-existent entry", async () => {
	await inHome(async (home) => {
		assert.equal(await createFileFallbackStore(home).get(BOT_ID), null);
	});
});

test("set creates the `secrets/` directory when it is missing", async () => {
	await inHome(async (home) => {
		assert.equal(existsSync(secretsDir(home)), false, "the store must not create the directory on construction");
		await createFileFallbackStore(home).set(BOT_ID, FIXTURE_TOKEN);
		assert.equal(existsSync(secretsDir(home)), true);
		assert.equal(existsSync(tokenPath(home)), true);
	});
});

test("delete removes the file and get returns null afterwards", async () => {
	await inHome(async (home) => {
		const store = createFileFallbackStore(home);
		await store.set(BOT_ID, FIXTURE_TOKEN);
		await store.delete(BOT_ID);
		assert.equal(existsSync(tokenPath(home)), false);
		assert.equal(await store.get(BOT_ID), null);
	});
});

test("delete is a no-op (not a throw) when there is no entry", async () => {
	await inHome(async (home) => {
		// The interface documents "no-op if it does not exist": a `bot remove` on a token already gone
		// must not fail the command.
		await createFileFallbackStore(home).delete(BOT_ID);
		assert.equal(existsSync(tokenPath(home)), false);
	});
});

test("the write is atomic: it leaves exactly one committed file and no `.tmp` leftovers", async () => {
	await inHome(async (home) => {
		const store = createFileFallbackStore(home);
		await store.set(BOT_ID, FIXTURE_TOKEN);
		const afterFirst = readdirSync(secretsDir(home));
		assert.deepEqual(afterFirst, [TOKEN_FILE_NAME], "a temp file survived the rename");
		assert.equal(
			afterFirst.some((name) => name.endsWith(".tmp")),
			false,
			`expected no temp file, found: ${afterFirst.join(", ")}`,
		);

		// A second write replaces the first in place — the rename target already exists, so the file
		// count must stay at one and the newest token must win.
		const replacement = `${BOT_ID}:${"B".repeat(35)}`;
		await store.set(BOT_ID, replacement);
		assert.deepEqual(readdirSync(secretsDir(home)), [TOKEN_FILE_NAME]);
		assert.equal(await store.get(BOT_ID), replacement);
	});
});

test("concurrent writes for the same botId do not collide on temp files", async () => {
	await inHome(async (home) => {
		const store = createFileFallbackStore(home);
		const writes = Array.from({ length: 20 }, (_, i) =>
			store.set(BOT_ID, `${BOT_ID}:${String(i).padStart(35, "0")}`),
		);
		await Promise.all(writes);
		const finalToken = await store.get(BOT_ID);
		assert.ok(finalToken !== null && finalToken.startsWith(`${BOT_ID}:`));
		const files = readdirSync(secretsDir(home));
		assert.deepEqual(files, [TOKEN_FILE_NAME], "no temp files should remain after concurrent writes");
	});
});

test("delete cleans up orphaned .tmp files for that botId without touching other bots' files", async () => {
	await inHome(async (home) => {
		const store = createFileFallbackStore(home);
		await store.set(BOT_ID, FIXTURE_TOKEN);

		// Plant orphaned temp files for BOT_ID and another bot
		const otherBotId = "7654321";
		const orphanedTmp1 = join(secretsDir(home), `${BOT_ID}.${randomUUID()}.token.tmp`);
		const orphanedTmp2 = join(secretsDir(home), `${BOT_ID}.token.tmp`);
		const otherTmp = join(secretsDir(home), `${otherBotId}.${randomUUID()}.token.tmp`);
		writeFileSync(orphanedTmp1, "orphan1", "utf8");
		writeFileSync(orphanedTmp2, "orphan2", "utf8");
		writeFileSync(otherTmp, "other-orphan", "utf8");

		await store.delete(BOT_ID);

		assert.equal(existsSync(tokenPath(home)), false, "committed token file must be deleted");
		assert.equal(existsSync(orphanedTmp1), false, "orphaned UUID temp file must be cleaned up");
		assert.equal(existsSync(orphanedTmp2), false, "orphaned legacy temp file must be cleaned up");
		assert.equal(existsSync(otherTmp), true, "other bot's temp file must remain untouched");
	});
});

test("path traversal and invalid characters in botId throw TypeError", async () => {
	await inHome(async (home) => {
		const store = createFileFallbackStore(home);
		const invalidIds = [
			"../bot",
			"..\\bot",
			"bot/1",
			"bot\\1",
			"bot\0null",
			"bot..id",
			"bot id",
			"",
			".",
			"..",
		];
		for (const invalid of invalidIds) {
			await assert.rejects(
				async () => store.get(invalid),
				{ name: "TypeError" },
				`expected store.get(${JSON.stringify(invalid)}) to reject with TypeError`,
			);
			await assert.rejects(
				async () => store.set(invalid, FIXTURE_TOKEN),
				{ name: "TypeError" },
				`expected store.set(${JSON.stringify(invalid)}) to reject with TypeError`,
			);
			await assert.rejects(
				async () => store.delete(invalid),
				{ name: "TypeError" },
				`expected store.delete(${JSON.stringify(invalid)}) to reject with TypeError`,
			);
		}
	});
});

test("POSIX: the fallback file mode is POSIX_PRIVATE_FILE_MODE and the directory is owner-only", { skip: process.platform === "win32" }, async () => {
	await inHome(async (home) => {
		const store = createFileFallbackStore(home);
		await store.set(BOT_ID, FIXTURE_TOKEN);
		assert.equal(statSync(tokenPath(home)).mode & 0o777, POSIX_PRIVATE_FILE_MODE);
		// The directory must not be readable or traversable by group or other, or the file's own mode
		// would be moot for a listing attacker.
		assert.equal(statSync(secretsDir(home)).mode & 0o077, 0, "the secrets directory grants group/other access");
	});
});

test("Windows: the fallback file inherits a DACL that lists only the current user", { skip: process.platform !== "win32" }, async () => {
	await inHome(async (home) => {
		// What the installer/doctor does once to the daemon home (design §6): strip inheritance and
		// grant the current user full control, inheritable by the children the daemon creates later.
		const user = currentUserName();
		execFileSync("icacls", [home, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)F`], { stdio: "pipe" });

		// PT-19's other half: the daemon **home** must list only the current user, since that ACE is what
		// every file the daemon creates later inherits.
		const homeAcl = aclOf(home);
		const homeListed = FORBIDDEN_GRANTEES.filter((grantee) => homeAcl.includes(grantee));
		assert.deepEqual(homeListed, [], `hardened home DACL lists non-user grantee(s): ${homeListed.join(", ")}\n${homeAcl}`);
		assert.ok(
			homeAcl.toUpperCase().includes(user.toUpperCase()),
			`expected the hardened home DACL to list the current user (${user})\n${homeAcl}`,
		);

		const store = createFileFallbackStore(home);
		try {
			await store.set(BOT_ID, FIXTURE_TOKEN);
		} catch (error) {
			assert.fail(`the store could not write under the hardened home DACL\n--- icacls home ---\n${homeAcl}\n--- error ---\n${String(error)}`);
		}

		const output = aclOf(tokenPath(home));
		const listed = FORBIDDEN_GRANTEES.filter((grantee) => output.includes(grantee));
		assert.deepEqual(listed, [], `fallback file DACL lists non-user grantee(s): ${listed.join(", ")}\n${output}`);
		assert.ok(
			output.toUpperCase().includes(user.toUpperCase()),
			`expected the DACL to list the current user (${user})\n${output}`,
		);
	});
});
