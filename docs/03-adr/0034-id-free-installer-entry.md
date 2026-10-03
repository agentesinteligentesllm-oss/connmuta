# ADR-0034 — The installer writes id-free launcher entries: the project file is the binding, the entry is a launch recipe

## Status

`accepted` — applied in the session of 2026-10-02 under the Director's standing authorization for that
session ("tienes toda mi autorización para que apliques todo lo que consideres necesario y prudente"),
which explicitly asked that no question be put back to the Director. **Disclosed exactly**: there was no
separate, per-decision confirmation of this ADR, because the session's instruction was that none be asked
for; the authorization quoted above is the whole of what this status rests on, and it is recorded here so
a later reader does not have to infer it. A Director who wants the entry shape revisited can supersede this
ADR the ordinary way.

It closes backlog **B-109** and completes the arc ADR-0033 opened. It amends
[ADR-0031](0031-npm-distribution-and-license.md) rule 2 **in part** (the parenthetical that spells the
entry as `conmuta mcp --project <id>`) and states the installer-side consequence ADR-0033 filed rather
than folded in. It does **not** amend the CONSTITUTION: no invariant and no layer *rule* changes, Invariant
1's enforcement is untouched, and its pinning test does not change shape here. One descriptive phrase
inside a layer rule is reconciled — §3 layer 3's "an id-only MCP registration entry" now reads "a
credential-free MCP registration entry … naming no project id", because the entry no longer names one.
That is wording (the prohibition it states is unchanged), and it is listed in Consequences below so a
reader comparing this ADR against the constitution sees the edit named rather than silent.

## Date

2026-10-02

## Debate

`bus-v2-b109-id-free-installer-entry-001` — Judgment Day, in the tribunal's index under that id and in the
session's LOG entry. Arena was unreachable at the start of the session that landed this ADR (DN-09's
substitute condition), so the two-blind-reviewer rule applied. **This ADR's audit record is that row and
only that row**: if the tribunal index carries no row under that id, then this change's audit has not
happened, and the `accepted` status above rests on the Director's standing authorization alone — which the
Status section already states in those words. The row records the round-by-round detail, including that
round 1's first freeze was defective (the manifest did not match the workspace while the judges read it)
and that round 2 re-froze the candidate; that defect is recorded there rather than quietly re-cut here.

## Context

ADR-0033 removed the project id from the *binding*: the thin client resolves its project by walking up
from its cwd to the nearest `conmuta.json`, and `--project <id>` is an assertion on that resolution, never
its source. The registration is therefore a **launch recipe, not an identity**.

The installer was not changed with it, and the gap was filed as B-109 rather than folded into that
session. As of ADR-0033, `buildLauncherEntry(projectId)` still wrote
`args: [CLI_ENTRY, "mcp", "--project", projectId]` (`src/installer/launcher.ts` before this change), so every tool-config
entry `conmuta project bind` merges into a detected tool's project config carried a second copy of an
identity that is already recorded, committed and reviewed at the bound root. Two consequences follow, and
both are concrete rather than theoretical:

| Fact | Evidence |
|---|---|
| **A copied or re-bound directory carries a stale assertion.** The entry is written into the project's own config, which travels with the directory. `conmuta project bind` on a copy, or a re-bind that mints a new `project_id`, leaves the old id in the entry; because ADR-0033 makes the flag an *assertion against the found file*, the client then refuses to start with `EXIT_PROJECT_MISMATCH` and the bus disappears from the host with no further explanation. | `src/installer/launcher.ts`'s old `buildLauncherEntry`; `test/installer/launcher.test.ts` before this change; ADR-0033 decision 1 |
| **A project entry reads as *the* registration.** Where a host reads both a user-level config and a project-level one and resolves a name collision in favour of the project file, that entry replaces the id-free user-level one for that cwd. An operator who then deletes the user-level entry — reasonably believing the installer already registered the bus — trades a working headless turn for a project-trust-gated one (Pi: `resolveProjectTrusted` with `hasUI: false`). | B-109's own text; ADR-0033's context table; `src/installer/tool-targets.ts:73` (project-relative, never global) |

The duplicated id bought one thing: a startup assertion that the tree the host launched in is the tree the
installer bound. ADR-0033 already gives that assertion to anyone who wants it, by hand, at no cost to the
default shape — and it cannot be safely *defaulted*, because the default is the artifact that gets copied.

## Decision

1. **`buildLauncherEntry()` takes no project and writes no id.** The entry is
   `{ command: realpath(process.execPath), args: [CLI_ENTRY, "mcp"] }`, unchanged in every other respect:
   still an installed-binary stdio command, still zero `env` block (not an empty one), still never `npx`
   (D-42; ADR-0031 rule 2). It becomes a pure function of the running interpreter and the compiled CLI
   path, so two installer runs on the same installation produce byte-identical entries and `editFile`'s
   identical-entry branch is a `noop` rather than a rewrite **wherever the merge is reached**. (Round 2
   corrected an overstatement here: the merge is only reached on a *first* bind of a directory, because a
   second bind of an already-bound project is refused earlier with `invariant-violated` R2 —
   `project-bind.ts`'s own pre-check, and F2 has no `unbind` verb. Entry purity is what makes a future
   merge deterministic; it is not a licence to re-bind.)
2. **The strict `--project` assertion stays available and stays unremoved.** A human who wants the
   startup check passes `--project <id>` by hand; the client's behaviour is exactly ADR-0033's. Nothing in
   the installer writes one.
3. **The installer says so once per run.** `project bind` prints one line recommending the single id-free
   user-level registration (`conmuta mcp`, no `--project`), because the entries it writes are
   project-level by D-42's matrix and a reader would otherwise take them for the whole registration.
4. **The canonical requirement is restated, not the matrix.** `tool-config-merge`'s requirement becomes
   *"Written entries are id-free stdio, zero env, never npx"* with its scenario extended to assert the
   absence of a `--project` argument. The 8-row tool matrix, the wizard's tool selection, the
   refuse-and-diff merge, the pre-edit backup and the `.gitignore` coverage are all unchanged.

## Why this does not weaken Invariant 1

Invariant 1 is bijective binding and no cross-project leakage, enforced (ADR-0033's own analysis) by the
walk-up plus the daemon's `WRONG_ROOM` assertion before every `sendMessage`. **This ADR touches neither.**
It removes a *redundant copy* of an identity that the walk-up already reads from the one reviewed file.
The invariant's pinning test does not change shape: the launcher still refuses when nothing is bound above
the cwd, when the found file is invalid or unreadable, and when an explicit flag disagrees.

## Consequences

- **Positive**: an installer-written entry survives a copy, a clone or a re-bind of its directory; a
  re-merge of an already-configured project is a no-op instead of a rewrite; the entry stops being a
  second, silently-stale source of a project's identity; and the recommended and the written shapes now
  agree on the thing that actually matters — neither names a project.
- **Negative / disclosed**: an entry written by an **older build** still carries `--project <id>` and keeps
  working (its assertion agrees with its own tree), but a directory copied from it will fail as described
  above until the entry is rewritten, and **the installer neither detects nor rewrites such an entry**: a
  re-run of `conmuta project bind` over that directory does not silently fix it. The merge is
  refuse-and-diff by design (`tool-config-merge`), so an entry that differs from the one being written
  throws a `FileEditRefusal("conflict")` with a diff, the wizard does not catch it, and the run stops
  there — after the registry commit and the `conmuta.json` write, so the outcome is a bound project whose
  tool config was left alone. **The remedy is a single step, and re-running `conmuta project bind` is NOT
  it** (round 2 corrected this paragraph): read the refusal's diff and edit the entry in place to
  `args: [<node>, <cli>, "mcp"]`. A re-run cannot work at all — the project is now actively bound, so the
  wizard refuses it with `invariant-violated` R2 before reaching the merge, and F2 ships no `unbind` verb
  to undo that. This is a **pre-existing** shape of the wizard, not something this ADR
  introduces — it needed a real stale entry to surface, which is exactly what this change creates — and it
  is filed as **B-111** rather than fixed inside this candidate. That row and this paragraph must say the
  same thing, and after round 2 they do.
- **Not done here, deliberately**: the installer still writes *project-level* entries and does not write or
  modify any user-level config. D-42's matrix is per-project by design, the installer never writes outside
  the project directory, and changing that is a different decision with a different blast radius. The
  printed guidance of decision 3 is the disclosure, not a substitute for that decision.
- **Documentation reconciled**: `CONSTITUTION.md` §3 layer 3, `OVERVIEW.md`'s D5 row, its "Assign project"
  table row and §10.3's "the generated entry", `WORK-PLAN.md`'s F2 deliverables, the tribunal's D5 row,
  and the canonical `openspec/specs/tool-config-merge/spec.md`. ADR-0031 and ADR-0033 each gain an
  append-only note (neither file is rewritten).

## Supersedes / amends

- Amends [ADR-0031](0031-npm-distribution-and-license.md) **rule 2 in part**: the entry it describes is
  spelled `conmuta mcp`, not `conmuta mcp --project <id>`. The rule's substance — installed binary, never
  `npx` — stands.
- States the installer-side consequence filed as an open end by
  [ADR-0033](0033-project-flag-as-assertion.md); it amends nothing in ADR-0033's decisions.
- Amends nothing in [ADR-0028](0028-project-scoped-bijective-binding.md): rule 4's first sentence was
  already amended in part by ADR-0033, and this ADR does not touch the remaining rules.
- Retires `test/installer/launcher.test.ts`'s id-carrying expectations and
  `test/installer/wizards/project-bind.test.ts`'s `args.slice(-3)` assertion, which pinned the old shape.

## Tests that must pin it

| Guarantee | Test |
|---|---|
| The written entry names no project and is exactly `[CLI_ENTRY, "mcp"]` | `test/installer/launcher.test.ts` ("args are the absolute cli entry, then the literal mcp invocation — no `--project`") |
| The entry is a pure function of the installation, not of a project | `test/installer/launcher.test.ts` ("stable across calls") |
| The entry still carries no `env` key at all | `test/installer/launcher.test.ts` ("carries no `env` key at all") |
| A real `project bind` writes the id-free entry into a real `.mcp.json` | `test/installer/wizards/project-bind.test.ts` ("a selected tool's config entry and the instruction files are written for a successful bind") |
| The wizard itself emits the user-level recommendation, last, through its injected sink | `test/installer/wizards/project-bind.test.ts` ("a successful bind emits the id-free registration recommendation through the injected sink") — added in round 1 because the unit test below could not tell whether the wizard still called it (JD-B-003) |
| The guidance line's own text is the recommended id-free form | `test/installer/instructions.test.ts` ("printRegistrationGuidance emits exactly one line, and it recommends the id-free user-level entry") |
| The installer's ledger is released on every path, including a throwing body, so an installer run leaves no pinned home directory on Windows | `test/cli/main.test.ts` ("withInstallerLedger hands the body a live ledger and releases it before returning"; "…even when the body throws") and ("`closeSetupOutcomeLedger` closes the ledger a completed setup handed back…") — added in round 1 for B-108's `setup` path and to pin the mechanism itself rather than one end-to-end run (JD-B-005, JD-B-006) |
| `runSetup` releases the handle it opened when its own run fails after the open | `test/installer/wizards/setup.test.ts` ("runSetup releases the ledger it opened when the run fails after the open…") — added in the round-2 batch, after `jd-judge-b` pointed out that a throwing prompt, an autostart write or an injected doctor run rejected before the caller ever received the handle |
| **Known gap, stated rather than implied**: the CLI's `trustStepIo: { write: io.out }` wiring itself is NOT pinned | The wizard-level pin above covers `runProjectBind`'s call, not `src/cli/main.ts`'s one-line injection of the sink. No test can drive the CLI's `projectBind` closure to completion — it prompts through the real `@clack/prompts` — so the wiring is verified by inspection only, and `jd-judge-b`'s round-2 note is recorded here instead of being papered over |
