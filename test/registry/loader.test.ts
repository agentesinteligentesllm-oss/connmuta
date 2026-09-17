import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { TELEGRAM_BOT_TOKEN_RE } from "../../src/shared/secrets.js";
import { REGISTRY_INVALID_CONDITION, createRegistryLoader, parseRegistryText } from "../../src/registry/loader.js";
import { addSecondBinding, validRegistryDocument, VALID_ROSTER_HASH } from "./fixtures.js";

// The digit run is 7 digits — deliberately outside the 8-10 digit range that
// `test/security/repo-scan.test.ts`'s own stricter TOKEN_SHAPE_RE requires (PT-22), so this synthetic
// fixture exercises the shared token shape without tripping the repo-wide secret scan. It is a
// placeholder invented for this test, never a production credential (AGENTS.md §3).
const FIXTURE_TOKEN = "1234567:AAHk3x9pQ7vLz2mR8sT1uV6wX0yZaBcDeFg";

/**
 * A whole-second mtime, so a fingerprint the test chooses is a value the filesystem returns exactly:
 * with a fractional millisecond the recorded `mtimeMs` and the one re-read after `utimesSync` could
 * differ in the last bits, which would make "the fingerprint did not change" untestable.
 */
const FIXED_TIME = new Date("2026-01-02T03:04:05Z");

/** A fresh temp home with the loader's file name inside it; removed when `operation` returns. */
function withRegistry(operation: (path: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "conmuta-registry-"));
	try {
		operation(join(dir, "registry.json"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Write `text` and pin the file's mtime, so the fingerprint is the test's own input (design §18 D-12). */
function writeAt(path: string, text: string, at: Date): void {
	writeFileSync(path, text);
	utimesSync(path, at, at);
}

// --- The first load ---

test("the first sync loads a valid file, with no condition before or after it", () => {
	withRegistry((path) => {
		writeAt(path, JSON.stringify(validRegistryDocument()), FIXED_TIME);
		const loader = createRegistryLoader({ path });
		assert.equal(loader.condition(), undefined);
		assert.equal(loader.current(), undefined);

		assert.equal(loader.sync().status, "loaded");
		assert.equal(loader.condition(), undefined);
		assert.equal(loader.current()?.bindings.length, 1);
		assert.equal(loader.current()?.projects[0]?.name, "example");
	});
});

// --- The mtime/size fingerprint (design §18 D-12, ADR-0030 rule 5) ---

test("an unchanged fingerprint is not re-read: an edit hidden behind the same mtime and size is not seen", () => {
	withRegistry((path) => {
		const before = JSON.stringify(validRegistryDocument());
		writeAt(path, before, FIXED_TIME);
		const loader = createRegistryLoader({ path });
		assert.equal(loader.sync().status, "loaded");

		const after = before.replace('"Example project"', '"EXAMPLE project"');
		assert.notEqual(after, before);
		assert.equal(after.length, before.length, "the fixture must differ in content, not in size");
		writeAt(path, after, FIXED_TIME);
		assert.equal(readFileSync(path, "utf8"), after, "the file on disk really changed");

		assert.equal(loader.sync().status, "unchanged");
		assert.equal(loader.current()?.groups[0]?.title, "Example project", "an unchanged fingerprint must not be re-read");
	});
});

test("the fingerprint includes mtime, not only size: a same-size edit with a new mtime reloads", () => {
	withRegistry((path) => {
		const before = JSON.stringify(validRegistryDocument());
		writeAt(path, before, FIXED_TIME);
		const loader = createRegistryLoader({ path });
		assert.equal(loader.sync().status, "loaded");

		const after = before.replace('"Example project"', '"EXAMPLE project"');
		assert.equal(after.length, before.length);
		writeAt(path, after, new Date(FIXED_TIME.getTime() + 1000));

		assert.equal(loader.sync().status, "loaded");
		assert.equal(loader.current()?.groups[0]?.title, "EXAMPLE project");
	});
});

test("the fingerprint includes size, not only mtime: a same-mtime edit of a different length reloads", () => {
	withRegistry((path) => {
		const before = JSON.stringify(validRegistryDocument());
		writeAt(path, before, FIXED_TIME);
		const loader = createRegistryLoader({ path });
		assert.equal(loader.sync().status, "loaded");

		const after = before.replace('"name":"example"', '"name":"a much longer project name"');
		assert.notEqual(after.length, before.length);
		writeAt(path, after, FIXED_TIME);

		assert.equal(loader.sync().status, "loaded");
		assert.equal(loader.current()?.projects[0]?.name, "a much longer project name");
	});
});

test("the fingerprint is taken before the read, so a write landing mid-read is not recorded as loaded", () => {
	// A fake file that moves the instant its content is read: exactly the sequence a concurrent save
	// produces, and the reason this module takes the stat first. Recorded before the read, the fingerprint
	// (1000) is already stale when the read succeeds, so the next `sync` sees 2000 and re-reads. Recorded
	// *after* the read, the loader would hold the old content while recording 2000 and report "unchanged"
	// next time — serving a registry the file no longer has, which is the failure this order prevents.
	// The seam exists for this pin: the ordering is unobservable through `node:fs` alone (ADR-12).
	let mtimeMs = 1000;
	const content = JSON.stringify(validRegistryDocument());
	const io = {
		stat: () => ({ mtimeMs, size: Buffer.byteLength(content, "utf8") }),
		read: () => {
			const text = content;
			mtimeMs = 2000;
			return text;
		},
	};

	const loader = createRegistryLoader({ path: "/not/the/real/file", io });
	assert.equal(loader.sync().status, "loaded");
	assert.equal(loader.sync().status, "loaded", "the pre-read fingerprint no longer matches, so it must re-read");
});

test("a human edit adding a binding is picked up without a restart (project-binding scenario)", () => {
	withRegistry((path) => {
		writeAt(path, JSON.stringify(validRegistryDocument()), FIXED_TIME);
		const loader = createRegistryLoader({ path });
		assert.equal(loader.sync().status, "loaded");
		assert.equal(loader.current()?.bindings.length, 1);

		writeAt(
			path,
			JSON.stringify(addSecondBinding(validRegistryDocument())),
			new Date(FIXED_TIME.getTime() + 1000),
		);

		assert.equal(loader.sync().status, "loaded");
		assert.equal(loader.current()?.bindings.length, 2);
		assert.equal(loader.current()?.bindings[1]?.project_id, "prj-second");
	});
});

// --- An invalid file: last good in memory, condition raised, file never touched ---

test("a torn edit keeps the last good registry, raises registry_invalid, and never renames the file", () => {
	withRegistry((path) => {
		writeAt(path, JSON.stringify(validRegistryDocument()), FIXED_TIME);
		const loader = createRegistryLoader({ path });
		loader.sync();
		const good = loader.current();

		// A partially written file: what an editor's non-atomic save can leave behind.
		writeAt(path, '{"registry_version":1,"bots":[', new Date(FIXED_TIME.getTime() + 1000));
		const directory = dirname(path);
		const before = {
			bytes: readFileSync(path),
			entries: readdirSync(directory).sort(),
			mtimeMs: statSync(path).mtimeMs,
		};

		const result = loader.sync();

		assert.equal(result.status, "invalid");
		if (result.status === "invalid") {
			assert.equal(result.condition, REGISTRY_INVALID_CONDITION);
			assert.deepEqual(result.problems, [{ kind: "invalid_json" }]);
		}
		assert.equal(loader.condition(), REGISTRY_INVALID_CONDITION);
		assert.equal(loader.current(), good, "the last good registry stays in memory");
		assert.deepEqual(readFileSync(path), before.bytes, "the human's file must be byte-identical");
		assert.deepEqual(readdirSync(directory).sort(), before.entries, "no quarantine or repair copy may appear");
		assert.equal(statSync(path).mtimeMs, before.mtimeMs, "the loader never rewrites the file");
		assert.equal(readdirSync(directory).length, 1, "the registry is the only file in the home");
	});
});

test("a shape-valid but R1-violating edit is refused the same way, keeping the last good registry", () => {
	withRegistry((path) => {
		writeAt(path, JSON.stringify(validRegistryDocument()), FIXED_TIME);
		const loader = createRegistryLoader({ path });
		loader.sync();
		const good = loader.current();

		const violating = validRegistryDocument();
		violating.groups.push({ group_id: -1001234567892, added_at: "2026-09-16T00:00:00Z" });
		violating.projects.push({ project_id: "prj-shared", path: "C:\\work\\shared" });
		violating.bindings.push(
			// Same bot_id as the first binding, a distinct group and project: R1 and only R1.
			{ ...violating.bindings[0], project_id: "prj-shared", group_id: -1001234567892 },
		);
		writeAt(path, JSON.stringify(violating), new Date(FIXED_TIME.getTime() + 1000));

		const result = loader.sync();
		assert.equal(result.status, "invalid");
		if (result.status === "invalid") {
			assert.deepEqual(result.problems, [{ kind: "invariant_violated", invariant: "R1" }]);
		}
		assert.equal(loader.current(), good);
		assert.equal(readdirSync(dirname(path)).length, 1, "still no quarantine copy");
	});
});

test("an invalid file at the first load leaves nothing loaded, never a default, and the next sync loads the fix", () => {
	withRegistry((path) => {
		writeAt(path, "{ not json", FIXED_TIME);
		const loader = createRegistryLoader({ path });

		assert.equal(loader.sync().status, "invalid");
		assert.equal(loader.current(), undefined, "an invalid file is not defaulted into an empty registry");
		assert.equal(loader.condition(), REGISTRY_INVALID_CONDITION);

		writeAt(path, JSON.stringify(validRegistryDocument()), new Date(FIXED_TIME.getTime() + 1000));
		assert.equal(loader.sync().status, "loaded");
		assert.equal(loader.condition(), undefined, "the condition clears once the human fixes the file");
		assert.equal(loader.current()?.bindings.length, 1);
	});
});

test("a missing file is reported, never invented as an empty registry", () => {
	withRegistry((path) => {
		const loader = createRegistryLoader({ path });
		const result = loader.sync();
		assert.equal(result.status, "invalid");
		if (result.status === "invalid") {
			assert.deepEqual(result.problems, [{ kind: "unreadable" }]);
		}
		assert.equal(loader.current(), undefined);
	});
});

test("a directory where the registry should be is refused, not crashed on", () => {
	// `statSync` succeeds on a directory and `readFileSync` throws `EISDIR`, so the refusal has to come
	// from the read path: the daemon reports the condition instead of throwing out of the heartbeat tick
	// (the same "a human's mistake is not a crash" rule the rest of this module follows).
	const dir = mkdtempSync(join(tmpdir(), "conmuta-registry-"));
	try {
		const path = join(dir, "registry.json");
		mkdirSync(path);
		const loader = createRegistryLoader({ path });

		const result = loader.sync();
		assert.equal(result.status, "invalid");
		if (result.status === "invalid") {
			assert.deepEqual(result.problems, [{ kind: "unreadable" }]);
		}
		assert.equal(loader.current(), undefined);
		assert.equal(loader.condition(), REGISTRY_INVALID_CONDITION);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a file that disappears after a good load keeps the last good registry", () => {
	// Deletion is one more unloadable state, not a reason to forget what the human last wrote: the
	// last-good registry is only ever replaced by a successful load. What must hold *nothing* is a
	// daemon that starts against a file that never parsed (the two cases above), because an empty
	// registry there would be indistinguishable from a machine with no bindings.
	withRegistry((path) => {
		writeAt(path, JSON.stringify(validRegistryDocument()), FIXED_TIME);
		const loader = createRegistryLoader({ path });
		loader.sync();
		const good = loader.current();

		rmSync(path);

		const result = loader.sync();
		assert.equal(result.status, "invalid");
		if (result.status === "invalid") {
			assert.deepEqual(result.problems, [{ kind: "unreadable" }]);
		}
		assert.equal(loader.current(), good, "a vanished file does not erase the last good registry");
		assert.equal(loader.condition(), REGISTRY_INVALID_CONDITION);
	});
});

// --- R5: the raw-text scan runs before parsing (design §4) ---

test("the seeded fixture really is the shared token shape, and is outside PT-22's digit range", () => {
	assert.equal(TELEGRAM_BOT_TOKEN_RE.test(FIXTURE_TOKEN), true);
	assert.equal(/^\d{7}:/u.test(FIXTURE_TOKEN), true);
});

test("R5 precedes parsing: a leak inside an unparseable file is still caught, with no parse complaint", () => {
	const result = parseRegistryText(`{ "title": "${FIXTURE_TOKEN}", oops`);
	if (result.ok) {
		assert.fail("expected the registry text to be refused");
	}
	assert.deepEqual(result.problems, [{ kind: "forbidden_content" }]);
});

test("a well-formed registry carrying a token-shaped value is refused and never echoes the match", () => {
	withRegistry((path) => {
		writeAt(path, JSON.stringify(validRegistryDocument()), FIXED_TIME);
		const loader = createRegistryLoader({ path });
		loader.sync();
		const good = loader.current();

		const leaky = validRegistryDocument();
		leaky.groups[0] = { ...leaky.groups[0], title: `leaked ${FIXTURE_TOKEN}` };
		writeAt(path, JSON.stringify(leaky), new Date(FIXED_TIME.getTime() + 1000));

		const result = loader.sync();
		assert.equal(result.status, "invalid");
		if (result.status !== "invalid") {
			assert.fail("expected the leaky registry to be refused");
		}
		assert.deepEqual(result.problems, [{ kind: "forbidden_content" }]);
		assert.equal(JSON.stringify(result).includes(FIXTURE_TOKEN), false, "the result must never carry the match");
		assert.equal(loader.current(), good, "a leaky edit is not loaded over the last good registry");
	});
});

test("the canonical roster hash is exempt from R5: a registry carrying one loads", () => {
	// `sha256:` ends in a digit run, so the shared token regex (`\d+:[A-Za-z0-9_-]{35}`) matches a
	// canonical roster hash by accident. Masking that one documented value is what keeps a valid
	// registry — and therefore the whole daemon — from being refused, so it is pinned here.
	withRegistry((path) => {
		writeAt(path, JSON.stringify(validRegistryDocument()), FIXED_TIME);
		const loader = createRegistryLoader({ path });
		assert.equal(loader.sync().status, "loaded");
		assert.equal(loader.current()?.bindings[0]?.roster_hash, VALID_ROSTER_HASH);
	});
});

test("the R5 exemption cannot hide a real token: only the exact hash value is masked", () => {
	// The mask is `sha256:` plus 64 hexadecimal characters and nothing more, so a token cannot ride
	// inside a masked region: a token's own colon is outside the hexadecimal class.
	const disguised = `sha256:${FIXTURE_TOKEN}`;
	const result = parseRegistryText(`{"roster_hash":"${disguised}"}`);
	if (result.ok) {
		assert.fail("expected the disguised token to be refused");
	}
	assert.deepEqual(result.problems, [{ kind: "forbidden_content" }]);

	// Non-vacuity: the same scan accepts a document whose only hash-shaped value is a canonical one.
	assert.equal(parseRegistryText(JSON.stringify(validRegistryDocument())).ok, true);
});

test("the mask is case-insensitive, so an uppercase hash is the shape problem it is, not a secret report", () => {
	// `sha256:<HEX>` matches the token regex as well as the lowercase form does, so a mask that only
	// recognised lowercase would report a hand-typed uppercase hash as `forbidden_content` — sending an
	// operator to hunt a leaked token that is not there. The document is still refused: the schema
	// requires the lowercase hex the shared hasher emits, so the verdict is `schema_invalid`.
	const uppercase = validRegistryDocument();
	uppercase.bindings[0] = {
		...uppercase.bindings[0],
		roster_hash: `sha256:${"0123456789abcdef".repeat(4).toUpperCase()}`,
	};
	const result = parseRegistryText(JSON.stringify(uppercase));
	if (result.ok) {
		assert.fail("expected the uppercase hash to be refused by the schema, not accepted");
	}
	assert.deepEqual(result.problems, [{ kind: "schema_invalid" }]);
});

// --- R6: this module has no path that writes a binding ---

test("the loader exposes no write path, and hands out one stable snapshot (R6)", () => {
	withRegistry((path) => {
		writeAt(path, JSON.stringify(validRegistryDocument()), FIXED_TIME);
		const loader = createRegistryLoader({ path });
		loader.sync();

		// Registry changes are a human action (R6): this module has no `save`, `write`, `rename` or
		// `unlink` surface for bus or Bot API data to reach. A method added later fails this list.
		assert.deepEqual(Object.keys(loader).sort(), ["condition", "current", "path", "sync"]);
		assert.equal(loader.path, path);
		assert.equal(loader.current(), loader.current(), "a repeated read returns the same snapshot");
	});
});

test("a refused registry's problems are value-free, with no member that could hold document text", () => {
	withRegistry((path) => {
		const marker = "SYNTHETIC-MARKER-NOT-A-SECRET";
		const leaking = validRegistryDocument();
		leaking.projects[0] = { ...leaking.projects[0], project_id: marker };
		writeAt(path, JSON.stringify(leaking), FIXED_TIME);

		const result = createRegistryLoader({ path }).sync();
		assert.equal(result.status, "invalid");
		if (result.status !== "invalid") {
			assert.fail("expected the registry to be refused");
		}
		assert.deepEqual(result.problems, [{ kind: "schema_invalid" }]);
		assert.equal(
			JSON.stringify(result).includes(marker),
			false,
			"a problem reaches a log, a condition and (F2) doctor: carrying the rejected text would copy it",
		);
		for (const problem of result.problems) {
			// The structural half of the guarantee: the vocabulary has no free-text member at all, so a
			// `field` or `message` added later fails here even if today's values happened to be clean.
			assert.deepEqual(Object.keys(problem), ["kind"]);
		}
	});
});
