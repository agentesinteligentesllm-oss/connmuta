# B-117 — refuse a record argument by shape, not by an ever-growing deny-list

## Objective

Implement the confirmed **ADR-0037** (`accepted` by the Director on 2026-10-07, delegating the choice): a
`harness_args` entry in a ladder record is classified by **shape**, so the `--no-extensions` swallow becomes
**unrepresentable** instead of merely unenumerated.

- `--name=value` (one token containing `=`) — accepted.
- a bare token beginning with `-` — accepted only if it is on the named allow-list of known value-less flags;
  otherwise refused with a reason **distinct** from `arguments_refused`.
- anything else (a positional, including `@file`) — refused by the same rule that refuses `--`.

`REFUSED_ARGUMENTS` stays as the second layer, and `SEND_PROOF_PROFILES` keeps its appended-last position with
`--tools` as the floor.

## Problem / why

Round 2 of PR #106's audit found, in both blind judges independently, that a record argument which consumes the
next argv element and is placed last (`--model`, `--provider`, `--system-prompt`, `--api-key`, `--session`,
`--thinking`, …) swallows the adjacent `--no-extensions`, so extension discovery returns and the built-in MCP
extension comes back. The bound is bounded by `--tools` (no shell, no `conmuta_*`), but the root cause is that
the runner never reasons about argument *shape* at all: it compares tokens against a list.

## Scope decision

- **In scope**: `runner/constants.ts` (the named allow-list + doc), `runner/harness.ts` (shape classification,
  new refusal reason), `test/runner/harness.test.ts` and `test/runner/loop.test.ts` (the ADR's five pins plus
  the two existing records written in the old form), and `docs/runbooks/wake-satellite.md` (the argument form,
  the symptom table, the profile paragraph).
- **Deliberately not in scope**: option (b) (parsing each host's resolved argv), and any change to
  `REFUSED_ARGUMENTS` membership, to `SEND_PROOF_PROFILES`, or to the appended-last position.
- The allow-list starts **empty**: no verified send-proof profile needs a bare value-less record flag today
  (the only live profile is `wake` on `pi`, whose useful flags either take a value — so they are written
  `--name=value` — or are already refused by name). Adding an entry is a reviewed decision, and the constant
  says so.

## Tasks

| # | Task | Evidence |
|---|---|---|
| 1 | RED: write the ADR's five pins against the unchanged implementation and observe them fail. | observed RED: 52 focused tests, 50 pass, 2 fail — pin 1 (a bare value-consuming flag resolved to a `spec` instead of a refusal) and pin 2 (`@x` resolved to a `spec`); then reproduced independently by the parent mutating the compiled shape check, which failed exactly those two again |
| 2 | GREEN: classify record arguments by shape, with the distinct refusal reason and the named allow-list. | observed GREEN after the two parent edits (`runner/loop.ts`'s `RefusalReason` union, `runner/constants.ts`'s stale residual paragraph): 52/52 focused, then `npm test` 1974/1968/0/6, `test:static` 129/129, `test:wrong-room` 5/5, `%TEMP%` 0 -> 0 |
| 3 | Update the two existing records/tests written in the old form, and the runbook's argument form, symptom row and profile paragraph. | `test/runner/harness.test.ts` and `test/runner/loop.test.ts` records rewritten to `--model=placeholder-model`; `docs/runbooks/wake-satellite.md` argument form, `refused (argument_shape_invalid)` symptom row and profile paragraph |
| 4 | Governance and close: ADR-0037 `proposed` -> `accepted`, the ADR index row, `CHECKLIST.md` B-117 -> `done`, and the handoff. | `docs/03-adr/0037-self-contained-record-arguments.md`; `docs/03-adr/INDEX.md`; `docs/06-backlog/CHECKLIST.md`; `docs/08-sessions/HANDOFF.md` |

## Verification record

- **Delegation**: the writer was `gentle-ai-worker`, confined to five surfaces. It stopped honestly at the type
  boundary (`runner/loop.ts`'s `RefusalReason` union) instead of editing outside them, and flagged that the
  `SEND_PROOF_PROFILES` doc still described the closed swallow as an open residual. The parent extended the union
  and corrected that paragraph — both inside the parent's own authority — and then re-verified the writer's RED by
  mutation rather than quoting it.
- **The shape rule applies to the record only.** `HARNESS_DEFAULT_ARGS` carries `-p`, `exec` and `run`; the shape
  check is a second loop over `entry.harness_args ?? []`, after the unchanged deny-list loop over the combined
  argv, so a named refusal always wins and the four harnesses stay startable.
- **Allow-list**: `VALUE_LESS_ARGUMENTS` ships **empty** on purpose (no verified profile needs a bare value-less
  record flag), documented as a reviewed-decision surface.
- **Native review**: the host resolved this candidate's consent envelope as **`consent-declined-this-candidate`**
  (`lineage_created: false`, `mutation_performed: false`, no lineage), so no native review exists for `b077d76`.
  A decline is candidate-scoped and is not the kill switch; START was not re-driven, and the documented substitute
  ran instead.
- **Independent verification** (`gentle-ai-verify`, read-only, on the frozen `b077d76`): reproduced `npm test`
  1974/1968/0/6, `test:static` 129/129, `test:wrong-room` 5/5 and the focused 52/52; confirmed the deny-list loop
  still runs first over the combined argv while the shape loop reads only `entry.harness_args`, that
  `REFUSED_ARGUMENTS` and `SEND_PROOF_PROFILES` are byte-identical to the parent commit, and that all five pins can
  fail (mutations A-F). Two findings, both acted on:
  1. **A real hole, tightened.** The first cut tested `arg.includes("=")` alone, so the positionals `x=y` and `=`
     resolved to a spec. The `-` prefix is now required for both accepted shapes; RED observed by mutating the
     compiled prefix check (pin 2 fails, 24/25) and GREEN after (25/25), and ADR-0037 carries a clarification.
  2. **A pin that pins less than it looks.** Pin 4 iterates `REFUSED_ARGUMENTS`, so it pins the refusal *reason*
     but cannot detect the removal of an entry; membership is pinned by the pre-existing hardcoded list at
     `test/runner/harness.test.ts:225`, which mutation D confirmed. No change made.
- The verifier honestly left unverified the ADR's own disclosed residual (whether a host reads `--name=value` as a
  value-less flag plus junk) and stated that its mutations ran against the compiled pin file only. Its scratch
  directory was removed; `%TEMP%/conmuta-*` is 0.

## Verification

- Test-first with observed RED at the assertion level, then GREEN; the five ADR pins each fail for one reason.
- Non-vacuity: the swallow refusal must report a refusal where the pre-change runner reported a `spec`.
- `npm test`, `test:static`, `test:wrong-room`, `%TEMP%` no growth; independent verification on the frozen tip.
- Native review under RDD (the candidate is executable, so lenses are expected), one push before the next unit.
