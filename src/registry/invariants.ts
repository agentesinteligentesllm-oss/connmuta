import type { Registry } from "./schema.js";

/**
 * The registry invariants this module can decide from the parsed document alone, in the order
 * DATA-MODEL §2.5 lists them.
 *
 * The vocabulary stops at R3 on purpose, and the other three are enforced where they can be:
 * **R4** compares `binding.group_id` with a project's `conmuta.json`, a file this module never sees,
 * so design §4 places it in `POST /session` (§10) and in (F2) `doctor`; **R5** is a scan over the raw
 * text and runs in the loader *before* parsing (design §4); **R6** — every registry change is a human
 * action — holds by construction, because no module in this unit has a write call at all (design §14
 * asserts it over the daemon bundle, PR-28). Declaring them here would mean declaring a check this
 * code cannot perform.
 */
export const REGISTRY_INVARIANTS = ["R1", "R2", "R3"] as const;

/**
 * One invariant id.
 *
 * A closed union, never `string`, and that is the point: the id ends up in a problem object an
 * operator reads, so a `string` here would be one more field a document value could ride out on
 * (the PR-08a lesson). `test/registry/invariants.test.ts` pins the closure with a `@ts-expect-error`
 * that fails the build if this type is ever widened.
 */
export type RegistryInvariant = (typeof REGISTRY_INVARIANTS)[number];

/**
 * The `params` key an invariant violation travels under on a zod custom issue.
 *
 * The invariant is decided in this module but reported through zod's `superRefine` (design §4: "at
 * every load"), so it needs a machine-readable tag rather than prose in `message`: the tag makes the
 * id survive the trip through zod's issue list with no parsing, and keeps the message free of
 * document text.
 */
export const REGISTRY_INVARIANT_TAG = "registryInvariant";

/**
 * The one method of zod's refinement context this module uses.
 *
 * Structural rather than `z.RefinementCtx` so the invariant rules can be tested against a recording
 * sink, with no zod in the loop: the rules are the value here, and a test that has to build a zod
 * issue list to exercise them tests zod instead.
 */
export interface RegistryIssueSink {
	addIssue(issue: { readonly code: "custom"; readonly params: Record<string, unknown> }): void;
}

/**
 * R1, R2 and R3 over a shape-valid document (DATA-MODEL §2.5, design §4; PT-18).
 *
 * - **R1** — at most one *active* binding per `bot_id` (D2: one token is one poller, and the DM plane
 *   carries no project context, so two active bindings on one token would let a bot of one project be
 *   accepted by another).
 * - **R2** — at most one *active* binding per `group_id` and per `project_id` (I-1 bijectivity).
 * - **R3** — every binding's `agent_id` is a member of its own `roster_snapshot` whose `user_id`
 *   equals the binding's `bot_id` (otherwise my own posts are dropped by peers as `unknown_sender`).
 *
 * Two deliberate asymmetries, both from the gate's own wording rather than from convenience:
 * R1 and R2 count **active** bindings only — DATA-MODEL §2.4 says "at most one *active* binding per
 * `bot_id`", and a suspended binding polls nothing — while R3 carries no `active` qualifier and is
 * therefore checked on every binding, suspended included.
 *
 * Each invariant is reported **at most once** per document. One violation is enough to refuse the
 * file (the whole file is `registry_invalid` and the daemon activates no binding from it), and a
 * per-occurrence report would turn a file with four duplicate ids into four identical rows an
 * operator has to collapse by eye. The next load reports the next violation after the first is fixed.
 *
 * The violations are value-free: an issue carries the invariant id and nothing else — no binding
 * index, no id, no field name. Those are document text (the PR-08a CRITICAL was a document-derived
 * *key* echoed into a problem field), and the file is refused as a whole, so naming the offset buys
 * nothing that the invariant id does not already say.
 */
export function applyRegistryInvariants(registry: Registry, ctx: RegistryIssueSink): void {
	const reported = new Set<RegistryInvariant>();
	const report = (invariant: RegistryInvariant): void => {
		if (reported.has(invariant)) {
			return;
		}
		reported.add(invariant);
		ctx.addIssue({ code: "custom", params: { [REGISTRY_INVARIANT_TAG]: invariant } });
	};

	const activeBots = new Set<number>();
	const activeGroups = new Set<number>();
	const activeProjects = new Set<string>();

	for (const binding of registry.bindings) {
		const entry = binding.roster_snapshot.find((member) => member.agent_id === binding.agent_id);
		if (entry === undefined || entry.user_id !== binding.bot_id) {
			report("R3");
		}

		if (binding.status !== "active") {
			continue;
		}
		if (activeBots.has(binding.bot_id)) {
			report("R1");
		} else {
			activeBots.add(binding.bot_id);
		}
		if (activeGroups.has(binding.group_id)) {
			report("R2");
		} else {
			activeGroups.add(binding.group_id);
		}
		if (activeProjects.has(binding.project_id)) {
			report("R2");
		} else {
			activeProjects.add(binding.project_id);
		}
	}
}

/**
 * Read an invariant id back out of a zod issue, when this module put one there.
 *
 * Only a `custom` issue can carry an invariant: the tag is written by {@link applyRegistryInvariants}
 * alone, and reading it off any other issue code would let a schema complaint be reported as a rule
 * violation that was never evaluated. An unrecognised or non-string tag is `undefined` too, so a
 * future issue shape degrades to a plain schema problem instead of asserting an invariant.
 */
export function registryInvariantFromIssue(issue: {
	readonly code: string;
	readonly params?: Record<string, unknown>;
}): RegistryInvariant | undefined {
	if (issue.code !== "custom") {
		return undefined;
	}
	const tag = issue.params?.[REGISTRY_INVARIANT_TAG];
	return typeof tag === "string" && (REGISTRY_INVARIANTS as readonly string[]).includes(tag)
		? (tag as RegistryInvariant)
		: undefined;
}
