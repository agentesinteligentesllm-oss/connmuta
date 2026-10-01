# Judgment Day brief — F7a wake satellite (session 59)

Repository: `C:/Users/LABORATORIO/Downloads/desarrollos/ORION OCG/telegram_bus_agent` (Conmuta, a Telegram agent
bus).

**Frozen target**: `git stash create` → `6f6600c929d1ad6d313d3f5d3352aaca31ba5612` (the working tree is frozen
for the duration of this audit; no edit will be made until both judges return). Baseline HEAD is `179c6c6`.

## What was built

The **wake satellite** (F7a, ADR-0032): a separate bin `conmuta-runner` that holds the daemon's body-less
doorbell for one project and, when the binding's own machine-local ladder allows it, starts **one headless
harness turn**. Read these, in this order:

- `docs/03-adr/0032-wake-satellite-and-per-binding-ladder.md` — the decision: rules R1–R10, the pinning tests
  PT-34…PT-38, and an Implementation note listing six disclosed refinements.
- `docs/01-constitution/CONSTITUTION.md` §3.1 — the law it amends.
- `docs/runbooks/wake-satellite.md` — what the operator is told.
- `runner/constants.ts`, `runner/ladder.ts`, `runner/ledger.ts`, `runner/prompt.ts`, `runner/harness.ts`,
  `runner/loop.ts`, `runner/cli.ts`, `runner/main.ts`.
- Its tests: `test/runner/{ladder,ledger,prompt,harness,loop,cli,main}.test.ts` and
  `test/security/runner-bundle.test.ts`.
- The wiring it changed: `package.json` (a third `bin`, plus `dist/runner/**` in `files`), `tsconfig.json` (a
  project reference), `runner/tsconfig.json`, and the two packaging tests it updated
  (`test/security/pack.test.ts`, `test/cli/main.test.ts`).
- NOT part of the candidate: `.gitignore`, `AGENTS.md`, `conmuta.json`, `*.bak-pre-conmuta-*` — the bus
  installer's own dirt, not this change.

## Criteria — report only what you can prove by reading the code

1. **Correctness of the wake path.** The loop (`runner/loop.ts`) decides in this order: the ladder first (an
   `off` binding must not even hold a session against the daemon), then the doorbell read, then three bounds
   (in-flight, cooldown, window budget), then the spawn; the watermark commits only after the action the wake
   stands for actually happened. Look for real defects: a path that loses a pending message, a double wake, a
   spin (a loop branch that returns immediately without sleeping while a bound is in force), a wrong watermark,
   the refusal de-duplication behaving differently from its own doc comment, the cursor bootstrap, `--once`
   versus the long-running loop, and what happens if the ladder changes while a long poll is in flight.
2. **The spawn surface** (`runner/harness.ts`) — the security-critical part: the executable set is closed,
   `shell: false`, the prompt is the last argv element, the environment is an allow-list, the `cwd` is the
   project's own directory, the turn is bounded and killed, and no failure path falls back to a shell or to an
   interpreter. Try to defeat it: a `harness_args` value that widens it, a prototype or `toString` trick, a
   unicode or quoting path, an environment key smuggled through, a child that never closes, a spawn that
   throws, a close that arrives after the timeout, an abort during a turn, output flooding.
3. **The ladder** (`runner/ladder.ts`): does every failure mode really resolve to `off`? Is there any way a
   record nobody signed, a wrong schema version, an unknown level, an unknown harness or a corrupt file ends
   up enabling a binding? Is the write atomic, and can it destroy another binding's record?
4. **The ledger** (`runner/ledger.ts`): one row per accepted wake, a closed key set, no peer body or token
   able to reach it, append-only, and what a corrupt line does to `readLedgerRows`.
5. **Conventions this repository enforces**: strict TDD (does every module have tests that can fail, and are
   any of them vacuous?); the named-constant rule (CONSTITUTION §5 — no numeric literal that should be a named
   constant); module docs that state the guarantees they claim; **no file under `src/` may be changed by this
   work** (`git status --short -- src` must be empty), because the core must stay untouched (ADR-0032
   R1/PT-34); and the CLI's strict parsing.
6. **Honesty of the claims.** Compare the ADR's Implementation note and the runbook against the code: is
   anything claimed as pinned, enforced or confined that the code does not actually do? Especially PT-37 (the
   ADR says the R7 profile is carried by the prompt and by the harness's own configuration, not by a static
   assertion — is that stated everywhere the profile is described, or does some file still over-claim?) and
   PT-36 (the wake ledger is self-reported).
7. **Edge cases the tests do not cover**, which a reviewer should flag as risk rather than as a defect,
   separated clearly from real defects.

## Output

Return one JSON object and no prose, exactly this shape:

{"findings":[{"location":"path:line","severity":"CRITICAL","claim":"observable incorrect behavior","evidence_class":"deterministic","causal_disposition":"introduced","proof_refs":["concrete proof"]}],"evidence":["what was inspected"]}

Allowed: `severity` ∈ CRITICAL | WARNING | SUGGESTION; `evidence_class` ∈ deterministic | inferential;
`causal_disposition` ∈ introduced | pre-existing | unknown. Only `findings` and `evidence` at the top level;
only `location`, `severity`, `claim`, `evidence_class`, `causal_disposition` and `proof_refs` inside a finding.
Never emit `summary` or `skill_resolution`. Return {"findings":[],"evidence":["what was inspected"]} when
clean, then terminate.
