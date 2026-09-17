import { test } from "node:test";
import assert from "node:assert/strict";

import { parseRegistryDocument, type Registry } from "../../src/registry/schema.js";
import {
	REGISTRY_INVARIANTS,
	REGISTRY_INVARIANT_TAG,
	applyRegistryInvariants,
	type RegistryInvariant,
	type RegistryIssueSink,
	registryInvariantFromIssue,
} from "../../src/registry/invariants.js";
import { activeBinding, rosterSnapshotEntry, validRegistryDocument, type JsonObject } from "./fixtures.js";

/** The document refused as expected; the problems it produced. */
function problemsOf(document: unknown) {
	const result = parseRegistryDocument(document);
	if (result.ok) {
		assert.fail("expected the registry to be refused, but it loaded");
	}
	return result.problems;
}

/** A shape-valid input for the invariant check: R1–R3 violations are shape-valid by construction. */
function asShapeValid(document: unknown): Registry {
	return document as unknown as Registry;
}

/** A sink that records what the refinement reported, the way zod's `superRefine` would receive it. */
function recordingSink() {
	const issues: { code: "custom"; params: Record<string, unknown> }[] = [];
	const sink: RegistryIssueSink = {
		addIssue(issue) {
			issues.push(issue);
		},
	};
	return { sink, issues };
}

/** A second bot id, used so R1 cannot fire when a test means to exercise R2 or R3. */
const BOB = {
	bot_id: 100000002,
	username: "bob_example_bot",
	token_ref: { store: "file", path: "secrets/100000002.token" },
	added_at: "2026-09-16T00:00:00Z",
};

/** A valid, shape-correct second binding belonging to {@link BOB}. */
function bobBinding(overrides: JsonObject = {}): JsonObject {
	return activeBinding({
		project_id: "prj-second",
		bot_id: 100000002,
		group_id: -1001234567891,
		agent_id: "@bob-agent",
		roster_snapshot: [
			rosterSnapshotEntry({ agent_id: "@bob-agent", user_id: 100000002, username: "bob_example_bot" }),
		],
		...overrides,
	});
}

// --- R1: one `bot_id` in at most one active binding (D2; PT-18) ---

test("R1: two active bindings with one bot_id are refused, and the violation names R1 (PT-18)", () => {
	const document = validRegistryDocument();
	document.groups.push({ group_id: -1001234567892, added_at: "2026-09-16T00:00:00Z" });
	document.projects.push({ project_id: "prj-shared", path: "C:\\work\\shared" });
	document.bindings.push(activeBinding({ project_id: "prj-shared", group_id: -1001234567892 }));

	assert.deepEqual(problemsOf(document), [{ kind: "invariant_violated", invariant: "R1" }]);
});

test("R1 counts active bindings only: the same bot_id once active and once suspended still loads", () => {
	const document = validRegistryDocument();
	document.groups.push({ group_id: -1001234567892, added_at: "2026-09-16T00:00:00Z" });
	document.projects.push({ project_id: "prj-shared", path: "C:\\work\\shared" });
	const suspended = activeBinding({ project_id: "prj-shared", group_id: -1001234567892, status: "suspended" });
	document.bindings.push(suspended);

	const loaded = parseRegistryDocument(document);
	assert.equal(loaded.ok, true, JSON.stringify(loaded.ok ? [] : loaded.problems));

	// Non-vacuity: the document is refused the moment that one binding is active, so the acceptance
	// above is `status` talking and not a table that stopped looking.
	document.bindings[1] = { ...suspended, status: "active" };
	assert.deepEqual(problemsOf(document), [{ kind: "invariant_violated", invariant: "R1" }]);
});

// --- R2: one `group_id` and one `project_id` in at most one active binding (I-1) ---

test("R2: two active bindings sharing a group_id, or sharing a project_id, are refused", () => {
	const sharedGroup = validRegistryDocument();
	sharedGroup.bots.push(BOB);
	sharedGroup.projects.push({ project_id: "prj-second", path: "C:\\work\\second" });
	// Distinct bot and distinct project; the group is the first binding's, so only R2 can fire.
	sharedGroup.bindings.push(bobBinding({ group_id: -1001234567890 }));
	assert.deepEqual(problemsOf(sharedGroup), [{ kind: "invariant_violated", invariant: "R2" }]);

	const sharedProject = validRegistryDocument();
	sharedProject.bots.push(BOB);
	sharedProject.groups.push({ group_id: -1001234567891, added_at: "2026-09-16T00:00:00Z" });
	// Distinct bot and distinct group; the project is the first binding's.
	sharedProject.bindings.push(bobBinding({ project_id: "prj-example" }));
	assert.deepEqual(problemsOf(sharedProject), [{ kind: "invariant_violated", invariant: "R2" }]);
});

test("R2 counts active bindings only, like R1", () => {
	const document = validRegistryDocument();
	document.bots.push(BOB);
	document.projects.push({ project_id: "prj-second", path: "C:\\work\\second" });
	const suspended = bobBinding({ group_id: -1001234567890, status: "suspended" });
	document.bindings.push(suspended);
	assert.equal(parseRegistryDocument(document).ok, true);

	document.bindings[1] = { ...suspended, status: "active" };
	assert.deepEqual(problemsOf(document), [{ kind: "invariant_violated", invariant: "R2" }]);
});

test("two active bindings with distinct bots, groups and projects load, so the R2 rule is not blanket", () => {
	const document = validRegistryDocument();
	document.bots.push(BOB);
	document.groups.push({ group_id: -1001234567891, added_at: "2026-09-16T00:00:00Z" });
	document.projects.push({ project_id: "prj-second", path: "C:\\work\\second" });
	document.bindings.push(bobBinding());
	const loaded = parseRegistryDocument(document);
	assert.equal(loaded.ok, true, JSON.stringify(loaded.ok ? [] : loaded.problems));
	if (loaded.ok) {
		assert.equal(loaded.registry.bindings.length, 2);
	}
});

// --- R3: `agent_id` is a snapshot member whose `user_id` equals `bot_id` ---

test("R3: a binding whose agent is absent from its snapshot, or carries another user_id, is refused", () => {
	// The snapshot no longer lists the binding's agent at all.
	const absent = validRegistryDocument();
	absent.bindings[0] = { ...absent.bindings[0], agent_id: "@carol-agent" };
	assert.deepEqual(problemsOf(absent), [{ kind: "invariant_violated", invariant: "R3" }]);

	// The agent is listed but belongs to a different bot: my own posts would be dropped by peers.
	const mismatched = validRegistryDocument();
	mismatched.bindings[0] = {
		...mismatched.bindings[0],
		roster_snapshot: [rosterSnapshotEntry({ user_id: 100000009 })],
	};
	assert.deepEqual(problemsOf(mismatched), [{ kind: "invariant_violated", invariant: "R3" }]);
});

test("R3 carries no `active` qualifier: a suspended binding with a stale snapshot is still refused", () => {
	const document = validRegistryDocument();
	document.bindings[0] = {
		...document.bindings[0],
		status: "suspended",
		agent_id: "@carol-agent",
	};
	// The design's R3 row states the rule without the `active` restriction that R1 and R2 carry, so a
	// suspended binding is checked too. Pinned here because a reader would otherwise assume otherwise.
	assert.deepEqual(problemsOf(document), [{ kind: "invariant_violated", invariant: "R3" }]);
});

test("a binding satisfying R3 loads: the check is not satisfied by refusing everything", () => {
	assert.equal(parseRegistryDocument(validRegistryDocument()).ok, true);
});

// --- What this module deliberately does NOT enforce, pinned so the decision is visible ---

test("R4 is not a load-time check: the registry does not compare against a project file (design §4)", () => {
	// R4 compares `binding.group_id` with `conmuta.json.group_id`, and the registry module never sees
	// that file: design §4 places R4 in `POST /session` and (F2) `doctor`. A registry whose binding
	// disagrees with a file this module cannot read must therefore still load.
	const document = validRegistryDocument();
	document.bindings[0] = { ...document.bindings[0], group_id: -1009999999999 };
	assert.equal(parseRegistryDocument(document).ok, true);
});

test("no R1–R6 row demands referential integrity, so a dangling reference still loads (observation)", () => {
	// `bindings[].bot_id`, `group_id` and `project_id` name entries of `bots[]`, `groups[]` and
	// `projects[]` (DATA-MODEL §2.4), but no invariant row requires the entry to exist: this module
	// refuses referential integrity rather than inventing a rule the gate does not carry, and the
	// observation is reported with the slice (a later `doctor` check owns it). All three dimensions are
	// exercised, because one case would leave the other two unpinned (the verifier's `F10`).
	// The dangling `bot_id` carries its snapshot entry in lockstep, so R3 stays satisfied and the only
	// thing under test is the missing `bots[]` entry.
	const dangling: JsonObject[] = [
		{ group_id: -1009999999999 },
		{ bot_id: 100999999999, roster_snapshot: [rosterSnapshotEntry({ user_id: 100999999999 })] },
		{ project_id: "prj-dangling" },
	];
	for (const overrides of dangling) {
		const document = validRegistryDocument();
		document.bindings[0] = { ...document.bindings[0], ...overrides };
		assert.equal(parseRegistryDocument(document).ok, true, JSON.stringify(overrides));
	}
});

// --- The refinement itself: the vocabulary, the tag and the value-free payload ---

test("REGISTRY_INVARIANTS is exactly the load-time vocabulary R1–R3", () => {
	// R4 needs `conmuta.json`, R5 is the loader's pre-parse raw-text scan and R6 holds by
	// construction: none of the three can be a refinement over the parsed document.
	assert.deepEqual([...REGISTRY_INVARIANTS], ["R1", "R2", "R3"]);
});

test("applyRegistryInvariants reports nothing for a valid file and one R1 issue for a duplicate bot_id", () => {
	const valid = recordingSink();
	applyRegistryInvariants(asShapeValid(validRegistryDocument()), valid.sink);
	assert.deepEqual(valid.issues, []);

	const duplicate = validRegistryDocument();
	duplicate.groups.push({ group_id: -1001234567892, added_at: "2026-09-16T00:00:00Z" });
	duplicate.projects.push({ project_id: "prj-shared", path: "C:\\work\\shared" });
	duplicate.bindings.push(activeBinding({ project_id: "prj-shared", group_id: -1001234567892 }));

	const found = recordingSink();
	applyRegistryInvariants(asShapeValid(duplicate), found.sink);
	assert.equal(found.issues.length, 1, "one violation per duplicated key, not one per binding pair");
	const issue = found.issues[0];
	assert.equal(issue.code, "custom");
	// Value-free: the payload carries the invariant id and nothing the document supplied.
	assert.deepEqual(issue.params, { [REGISTRY_INVARIANT_TAG]: "R1" });
});

test("every declared invariant round-trips through the issue tag, and nothing else does", () => {
	for (const invariant of REGISTRY_INVARIANTS) {
		assert.equal(
			registryInvariantFromIssue({ code: "custom", params: { [REGISTRY_INVARIANT_TAG]: invariant } }),
			invariant,
		);
	}

	const notAnInvariant = [
		{ code: "custom", params: {} },
		{ code: "custom" },
		{ code: "custom", params: { [REGISTRY_INVARIANT_TAG]: "R9" } },
		{ code: "custom", params: { [REGISTRY_INVARIANT_TAG]: 1 } },
		// A non-custom issue carrying the tag is still not an invariant: only the refinement tags
		// issues, and reading a schema issue as one would report the wrong cause.
		{ code: "unrecognized_keys", params: { [REGISTRY_INVARIANT_TAG]: "R1" } },
	];
	for (const issue of notAnInvariant) {
		assert.equal(registryInvariantFromIssue(issue), undefined, JSON.stringify(issue));
	}
});

test("several violations in one document are all reported, not just the first", () => {
	const document = validRegistryDocument();
	document.projects.push({ project_id: "prj-second", path: "C:\\work\\second" });
	// Same bot and same group as the first binding (R1 and R2 at once), a distinct project and a
	// snapshot that satisfies R3, so exactly the two invariants under test fire.
	document.bindings.push(activeBinding({ project_id: "prj-second" }));

	const problems = problemsOf(document);
	const named = problems.map((problem) => (problem.kind === "invariant_violated" ? problem.invariant : problem.kind));
	assert.deepEqual(named.sort(), ["R1", "R2"]);
});

test("an invariant problem carries no document text and has no free-text member", () => {
	const marker = "SYNTHETIC-MARKER-NOT-A-SECRET";
	const document = validRegistryDocument();
	document.groups.push({ group_id: -1001234567892, title: marker, added_at: "2026-09-16T00:00:00Z" });
	document.projects.push({ project_id: "prj-shared", path: "C:\\work\\shared" });
	document.bindings.push(activeBinding({ project_id: "prj-shared", group_id: -1001234567892 }));

	const problems = problemsOf(document);
	assert.deepEqual(problems, [{ kind: "invariant_violated", invariant: "R1" }]);
	assert.equal(JSON.stringify(problems).includes(marker), false);
	assert.deepEqual(Object.keys(problems[0]), ["kind", "invariant"]);
});

test("an invariant id is a closed vocabulary, not a string that could carry document text", () => {
	// The guarantee is a property of the type, so the pin has to be a compile-time one: widening
	// `RegistryInvariant` to `string` is exactly what would let a document value ride in `invariant`,
	// and it would turn the directive below into an unused `@ts-expect-error` that fails `tsc -b`.
	// @ts-expect-error — a document-derived string is not an invariant id.
	const notAnId: RegistryInvariant = "SYNTHETIC-MARKER-NOT-A-SECRET";
	assert.equal(notAnId, "SYNTHETIC-MARKER-NOT-A-SECRET");
});
