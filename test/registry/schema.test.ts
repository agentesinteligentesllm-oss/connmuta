import { test } from "node:test";
import assert from "node:assert/strict";

import { REGISTRY_VERSION } from "../../src/shared/constants.js";
import { rosterEntrySchema } from "../../src/shared/project-file.js";
import { parseRegistryDocument } from "../../src/registry/schema.js";
import {
	VALID_ROSTER_HASH,
	activeBinding,
	rosterSnapshotEntry,
	validRegistryDocument,
	type JsonObject,
} from "./fixtures.js";

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

/** The valid document with one project field replaced — a fresh document per call. */
function withProject(overrides: JsonObject) {
	const document = validRegistryDocument();
	document.projects[0] = { ...document.projects[0], ...overrides };
	return document;
}

/** The valid document with one group field replaced — a fresh document per call. */
function withGroup(overrides: JsonObject) {
	const document = validRegistryDocument();
	document.groups[0] = { ...document.groups[0], ...overrides };
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
	documents.push(["groups[0]", withGroup({ unexpected_key: 1 })]);
	documents.push(["projects[0]", withProject({ unexpected_key: 1 })]);
	documents.push(["bots[0].token_ref", withBot({ token_ref: { store: "keychain", account: "bot:100000001", unexpected_key: 1 } })]);
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
	// The fixture derives this value with `computeRosterHash` over its own snapshot, so the assertion
	// ties it to the single-entry known answer rather than to itself: a fixture that stopped describing
	// one roster would fail here (round 1's `JD-A-001`/`JD-B-002`).
	assert.equal(activeBinding().roster_hash, VALID_ROSTER_HASH);
	assert.equal(VALID_ROSTER_HASH, "sha256:637627db2a9e58dea2b007df150da62dbbd45967d2aff85324714f32825d0513");
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

test("a malformed document reports one shape problem, not one per bad member (JD-A-005)", () => {
	// A strict object with several bad members produces one zod issue per member and every one of them maps
	// to the same value-free `{ kind: "schema_invalid" }`, so an uncollapsed list would carry the same row
	// two or nine times and its length would say nothing an operator can act on.
	const twoDefects = withBot({ bot_id: -1, added_at: "not a date" });
	assert.deepEqual(problemsOf(twoDefects), [{ kind: "schema_invalid" }]);

	// The other half of the rule, and the one that keeps the collapse from hiding a real refusal: it is
	// per kind, so a document that also violates an invariant still reports both kinds.
	const mixed = validRegistryDocument();
	mixed.groups.push({ group_id: -1001234567892, added_at: "2026-09-16T00:00:00Z" });
	mixed.projects.push({ project_id: "prj-shared", path: "C:\\work\\shared" });
	mixed.bindings.push(activeBinding({ project_id: "prj-shared", group_id: -1001234567892, bot_id: -1 }));
	const problems = problemsOf(mixed);
	assert.equal(problems.filter((problem) => problem.kind === "schema_invalid").length, 1, JSON.stringify(problems));
	assert.equal(
		problems.some((problem) => problem.kind === "invariant_violated"),
		true,
		JSON.stringify(problems),
	);
});

test("projects[].path is informational: this schema does not require an absolute path (F2 doctor owns that rule)", () => {
	// DATA-MODEL §2.3 calls the field an "absolute local path" and this schema enforces only "a
	// non-empty string": an absolute-path test differs per platform (a drive prefix versus a POSIX
	// root), the value chooses no authorization decision — a binding is by `project_id` — and the data
	// model itself calls it informational. Pinned so the boundary is visible instead of implied, and
	// reported in the record (round 1's `JD-A-004`/`JD-B-003`); a later tightening needs its own
	// decision, not a silent test change.
	registryOf(withProject({ path: "C:\\work\\example" }));
	registryOf(withProject({ path: "relative/dir" }));
	registryOf(withProject({ path: "/srv/project" }));
	onlyShapeProblems(withProject({ path: "" }), "an empty path is not a path");
});

test("the snapshot entry is the project file's roster entry, not a second declaration (DATA-MODEL §1)", () => {
	// Two rules apply to a two-entry snapshot and this table pins the *entry* one: **every** entry below
	// is therefore distinct in `agent_id` from the known-good entry the document leads with. An entry that
	// repeated `@alice-agent` is refused by the array's own uniqueness rule whatever its own shape was, so
	// a looser entry declaration would change no verdict — which is exactly how this pin was masked once
	// already, and why round 1's scoped re-judgment reported a regression (`M4` survived the sweep again).
	const entries: JsonObject[] = [
		rosterSnapshotEntry({ agent_id: "@carol-agent", user_id: 100000003, username: "carol_example_bot" }),
		rosterSnapshotEntry({ agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" }),
		{ agent_id: "@carol-agent", user_id: 100000003 },
		rosterSnapshotEntry({ agent_id: "@carol-agent", user_id: 100000003, extra_field: 1 }),
		rosterSnapshotEntry({ agent_id: "@carol-agent", user_id: -1 }),
		rosterSnapshotEntry({ agent_id: "carol-agent", user_id: 100000003 }),
	];

	for (const entry of entries) {
		const acceptedByProjectFile = rosterEntrySchema.safeParse(entry).success;
		// The snapshot leads with a known-good entry for the binding's own agent, so R3 is satisfied
		// whatever the entry under test says and the only thing that can move the verdict is that
		// entry's shape — the declaration under test. Deriving the binding's identity from the entry
		// instead would hide the pin: a `user_id` the entry rule refuses is refused a second time by
		// the binding's own `bot_id` rule, so a second, looser snapshot declaration would survive.
		const document = withBinding({ roster_snapshot: [rosterSnapshotEntry(), entry] });
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

// --- The snapshot array itself: the roster-level rules DATA-MODEL §1 puts on `roster[]` ---

test("a snapshot with two entries sharing one agent_id is refused (DATA-MODEL §1: agent_id unique)", () => {
	// The snapshot is a copy of `conmuta.json`'s roster array, so the roster-level rules travel with
	// it: two entries claiming one agent id make "the" admission entry for that agent ambiguous, which
	// is what the file it was copied from refuses. The binding's own agent leads and its `user_id`
	// equals `bot_id`, so R3 holds and the only rule that can move this verdict is the one under test.
	const document = withBinding({
		roster_snapshot: [rosterSnapshotEntry(), rosterSnapshotEntry({ user_id: 100000002 })],
	});
	assert.deepEqual(problemsOf(document), [{ kind: "schema_invalid" }]);
});

test("a snapshot listing two agents under one user_id is refused (DATA-MODEL §1: user_id unique)", () => {
	// One Telegram account cannot be two agents; the identity anchor is non-injective otherwise.
	const document = withBinding({
		roster_snapshot: [rosterSnapshotEntry(), rosterSnapshotEntry({ agent_id: "@bob-agent" })],
	});
	assert.deepEqual(problemsOf(document), [{ kind: "schema_invalid" }]);
});

test("a snapshot with distinct agent_ids and distinct user_ids loads, so the rule is not blanket", () => {
	const snapshot = [
		rosterSnapshotEntry(),
		rosterSnapshotEntry({ agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" }),
	];
	const registry = registryOf(withBinding({ roster_snapshot: snapshot }));
	assert.equal(registry.bindings[0].roster_snapshot.length, 2);
});

test("R3's first-match lookup can no longer be order-dependent: a repeated agent_id is refused in either order", () => {
	// Before this rule the verdict came from `.find`'s first match rather than from the document: a
	// snapshot listing `@alice-agent` twice with different `user_id`s loaded when the entry carrying the
	// binding's `bot_id` came first, and was refused as R3 when the stale one came first. Both orders
	// are now refused by the duplicate rule, so no load depends on entry order.
	const matching = rosterSnapshotEntry({ user_id: 100000001 });
	const stale = rosterSnapshotEntry({ user_id: 100000009 });
	for (const snapshot of [[matching, stale], [stale, matching]]) {
		const problems = problemsOf(withBinding({ roster_snapshot: snapshot }));
		assert.ok(
			problems.some((problem) => problem.kind === "schema_invalid"),
			JSON.stringify(snapshot),
		);
	}
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
