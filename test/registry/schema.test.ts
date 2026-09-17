import { test } from "node:test";
import assert from "node:assert/strict";

import { REGISTRY_VERSION } from "../../src/shared/constants.js";
import { rosterEntrySchema } from "../../src/shared/project-file.js";
import { parseRegistryDocument } from "../../src/registry/schema.js";
import { activeBinding, rosterSnapshotEntry, validRegistryDocument, type JsonObject } from "./fixtures.js";

/** The document refused as expected; the problems it produced. */
function problemsOf(document: unknown) {
	const result = parseRegistryDocument(document);
	if (result.ok) {
		assert.fail("expected the registry to be refused, but it loaded");
	}
	return result.problems;
}

/** The document loaded as expected; the parsed registry. */
function registryOf(document: unknown) {
	const result = parseRegistryDocument(document);
	if (!result.ok) {
		assert.fail(`expected the registry to load, but it was refused: ${JSON.stringify(result.problems)}`);
	}
	return result.registry;
}

/**
 * The document refused for shape reasons only: at least one problem, and every one of them
 * `schema_invalid`.
 *
 * Used where the *count* of zod issues is not a contract of this module — a strict key and a
 * discriminator can both complain about one field, and pinning "exactly one" would make a zod patch
 * release a test failure. What is a contract is that no invariant is reported for a document whose
 * shape never got that far.
 */
function onlyShapeProblems(document: unknown, label: string): void {
	const problems = problemsOf(document);
	assert.ok(problems.length > 0, `${label}: expected at least one problem`);
	assert.equal(
		problems.every((problem) => problem.kind === "schema_invalid"),
		true,
		`${label}: expected only shape problems, got ${JSON.stringify(problems)}`,
	);
}

/** The valid document with one bot field replaced — a fresh document per call. */
function withBot(overrides: JsonObject) {
	const document = validRegistryDocument();
	document.bots[0] = { ...document.bots[0], ...overrides };
	return document;
}

/** The valid document with one binding field replaced — a fresh document per call. */
function withBinding(overrides: JsonObject) {
	const document = validRegistryDocument();
	document.bindings[0] = { ...document.bindings[0], ...overrides };
	return document;
}

/**
 * The valid document with the binding's identity replaced **in lockstep** — its `agent_id`, its
 * `bot_id` and its snapshot entry together.
 *
 * R3 requires all three to agree, so changing the agent alone would refuse the document for the wrong
 * reason and hide whatever the case under test is about.
 */
function withBindingIdentity(agent_id: unknown, user_id: unknown) {
	return withBinding({
		agent_id,
		bot_id: user_id,
		roster_snapshot: [rosterSnapshotEntry({ agent_id, user_id })],
	});
}

// --- The valid document, and the shape around it (DATA-MODEL §2; project-binding spec) ---

test("a valid registry loads with every field typed per DATA-MODEL §2 (project-binding scenario)", () => {
	const registry = registryOf(validRegistryDocument());
	assert.equal(registry.registry_version, REGISTRY_VERSION);
	assert.deepEqual(
		registry.bots.map((bot) => bot.bot_id),
		[100000001],
	);
	assert.equal(registry.bots[0].token_ref.store, "keychain");
	assert.equal(registry.groups[0].group_id, -1001234567890);
	assert.equal(registry.projects[0].path, "C:\\work\\example");
	assert.equal(registry.bindings[0].status, "active");
	assert.deepEqual(registry.bindings[0].roster_snapshot, [rosterSnapshotEntry()]);
	assert.equal(registry.bindings[0].roster_hash, activeBinding().roster_hash);
});

test("an unknown key is rejected at every level instead of being stripped (strict zod, DATA-MODEL §2)", () => {
	const documents: [string, unknown][] = [];
	const root: JsonObject = validRegistryDocument();
	root["unexpected_key"] = 1;
	documents.push(["root", root]);
	documents.push(["bots[0]", withBot({ unexpected_key: 1 })]);
	documents.push(["bindings[0]", withBinding({ unexpected_key: 1 })]);
	documents.push([
		"bindings[0].settings",
		withBinding({ settings: { reminder_window_hours: 24, unexpected_key: 1 } }),
	]);

	for (const [level, document] of documents) {
		onlyShapeProblems(document, `unknown key at ${level}`);
	}
	// Non-vacuity: the four documents differ from a document that loads by exactly one key.
	registryOf(validRegistryDocument());
});

test("a registry with no bindings yet still loads: the arrays are required, their contents are not", () => {
	const registry = registryOf({ ...validRegistryDocument(), bots: [], groups: [], projects: [], bindings: [] });
	assert.deepEqual(registry.bindings, []);
});

test("a root that is not an object at all is refused rather than reaching the field checks", () => {
	for (const document of [null, 42, "registry", [], true]) {
		assert.deepEqual(problemsOf(document), [{ kind: "schema_invalid" }], JSON.stringify(document));
	}
	// Non-vacuity: the array case above must fail because of the root, not because an empty object
	// is invalid — the previous test loads an object with four empty arrays.
	registryOf(validRegistryDocument());
});

// --- `registry_version` (DATA-MODEL §2.0, ADR-0015 doctrine) ---

test("a future registry_version is its own problem, with the version it found, before any shape check", () => {
	assert.deepEqual(problemsOf({ ...validRegistryDocument(), registry_version: REGISTRY_VERSION + 1 }), [
		{ kind: "unsupported_registry_version", found: REGISTRY_VERSION + 1 },
	]);
});

test("a version that is not a future integer falls through to the schema, never to the upgrade path", () => {
	for (const version of [0, "1", null, undefined]) {
		const document: JsonObject = { ...validRegistryDocument() };
		if (version === undefined) {
			delete document["registry_version"];
		} else {
			document["registry_version"] = version;
		}
		assert.deepEqual(problemsOf(document), [{ kind: "schema_invalid" }], `registry_version ${String(version)}`);
	}
});

// --- Fields the file is human-editable through, each with its own rule ---

test("bot_id, group_id, project_id, agent_id and status are each validated", () => {
	registryOf(validRegistryDocument());
	const cases: [string, unknown][] = [
		["bot_id 0", withBot({ bot_id: 0 })],
		["bot_id negative", withBot({ bot_id: -100000001 })],
		["bot_id fractional", withBot({ bot_id: 100000001.5 })],
		["bot_id a string", withBot({ bot_id: "100000001" })],
		["group_id 0", withBinding({ group_id: 0 })],
		["group_id positive", withBinding({ group_id: 1001234567890 })],
		["project_id not a slug", withBinding({ project_id: "prj example" })],
		["project_id too short", withBinding({ project_id: "ab" })],
		["agent_id without the wire prefix", withBindingIdentity("alice-agent", 100000001)],
		["status this build does not know", withBinding({ status: "paused" })],
	];

	for (const [label, document] of cases) {
		onlyShapeProblems(document, label);
	}
});

test("added_at and bound_at are ISO 8601 UTC: an offset or a local time is refused", () => {
	registryOf(withBot({ added_at: "2026-09-16T00:00:00.000Z" }));
	registryOf(withBinding({ bound_at: "2026-09-16T00:00:00Z" }));
	for (const stamp of ["2026-09-16T00:00:00+02:00", "2026-09-16T00:00:00", "2026-09-16", "not-a-date"]) {
		assert.deepEqual(problemsOf(withBot({ added_at: stamp })), [{ kind: "schema_invalid" }], `added_at ${stamp}`);
		assert.deepEqual(
			problemsOf(withBinding({ bound_at: stamp })),
			[{ kind: "schema_invalid" }],
			`bound_at ${stamp}`,
		);
	}
});

test("token_ref is the documented union and carries no token of its own (I-2)", () => {
	registryOf(withBot({ token_ref: { store: "keychain", account: "bot:100000001" } }));
	registryOf(withBot({ token_ref: { store: "file", path: "secrets/100000002.token" } }));
	const refused = [
		{ store: "keychain", path: "secrets/x.token" },
		{ store: "file" },
		{ store: "env", account: "bot:100000001" },
		{ account: "bot:100000001" },
	];
	for (const tokenRef of refused) {
		onlyShapeProblems(withBot({ token_ref: tokenRef }), JSON.stringify(tokenRef));
	}
});

test("roster_hash must be the exact shape the shared hasher emits, not a bare digest", () => {
	registryOf(validRegistryDocument());
	assert.equal(activeBinding().roster_hash, "sha256:5428267f998d27b4fefc15451bdc264cd3a5a4137a2b1ae4a4b585960786abe1");
	for (const hash of [
		"5428267f998d27b4fefc15451bdc264cd3a5a4137a2b1ae4a4b585960786abe1",
		"sha256:5428267f",
		"sha256:5428267F998D27B4FEFC15451BDC264CD3A5A4137A2B1AE4A4B585960786ABE1",
		"sha1:5428267f998d27b4fefc15451bdc264cd3a5a4137a2b1ae4a4b585960786abe1",
	]) {
		assert.deepEqual(problemsOf(withBinding({ roster_hash: hash })), [{ kind: "schema_invalid" }], hash);
	}
});

test("roster_snapshot is required on every binding and needs at least one entry (D-07)", () => {
	// An empty snapshot breaks the shape (`min(1)`) and R3 at once — there is no member for the
	// binding's agent to be — so both problems are expected, and both are true.
	const empty = problemsOf(withBinding({ roster_snapshot: [] }));
	assert.ok(empty.some((problem) => problem.kind === "schema_invalid"), JSON.stringify(empty));
	assert.ok(empty.some((problem) => problem.kind === "invariant_violated"), JSON.stringify(empty));

	// Absent altogether, the shape is not even an array and R3 is not evaluated over it: zod runs the
	// refinement only when the member types are intact, which is what makes `.find` safe inside it.
	const withoutSnapshot = validRegistryDocument();
	delete withoutSnapshot.bindings[0]["roster_snapshot"];
	assert.deepEqual(problemsOf(withoutSnapshot), [{ kind: "schema_invalid" }]);
});

test("settings is optional and strict: the two documented keys are accepted, a third or a zero is not", () => {
	registryOf(validRegistryDocument());
	registryOf(withBinding({ settings: { reminder_window_hours: 24 } }));
	registryOf(withBinding({ settings: { secret_markers: ["SYNTHETIC-MARKER"] } }));
	registryOf(withBinding({ settings: {} }));
	assert.deepEqual(problemsOf(withBinding({ settings: { reminder_window_hours: 0 } })), [{ kind: "schema_invalid" }]);
});

test("the snapshot entry is the project file's roster entry, not a second declaration (DATA-MODEL §1)", () => {
	const entries: JsonObject[] = [
		rosterSnapshotEntry(),
		rosterSnapshotEntry({ agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" }),
		{ agent_id: "@alice-agent", user_id: 100000001 },
		rosterSnapshotEntry({ extra_field: 1 }),
		rosterSnapshotEntry({ user_id: -1 }),
		rosterSnapshotEntry({ agent_id: "alice-agent" }),
	];

	for (const entry of entries) {
		const acceptedByProjectFile = rosterEntrySchema.safeParse(entry).success;
		// The binding's identity fields are derived from the entry, so R3 holds whenever the entry is
		// itself usable and the only remaining reason to refuse the document is the entry's own shape —
		// which is the declaration under test. The registry must agree with the project file's schema
		// entry by entry: if either declaration drifted, one of these two verdicts would move alone.
		const document = withBinding({
			agent_id: entry["agent_id"],
			bot_id: entry["user_id"],
			roster_snapshot: [entry],
		});
		assert.equal(
			parseRegistryDocument(document).ok,
			acceptedByProjectFile,
			`entry ${JSON.stringify(entry)}`,
		);
	}
	// Non-vacuity: the table exercises both verdicts, so the equality is not satisfied by a
	// declaration that accepts (or refuses) everything.
	assert.equal(entries.some((entry) => rosterEntrySchema.safeParse(entry).success), true);
	assert.equal(entries.some((entry) => !rosterEntrySchema.safeParse(entry).success), true);
});

// --- The problems themselves: value-free by construction ---

test("no problem carries document text, and no problem type has a field that could hold any", () => {
	const marker = "SYNTHETIC-MARKER-NOT-A-SECRET";
	const document = withBinding({ project_id: marker });
	const problems = problemsOf(document);

	assert.deepEqual(problems, [{ kind: "schema_invalid" }]);
	assert.equal(
		JSON.stringify(problems).includes(marker),
		false,
		"a problem reaches a terminal, a log and (F2) doctor: carrying the rejected text would copy it",
	);
	// The structural half of the guarantee: the vocabulary has no free-text member at all. A `field`
	// or `message` added later would fail here even if today's values happened to be clean.
	for (const problem of problems) {
		assert.deepEqual(Object.keys(problem), ["kind"]);
	}
});
