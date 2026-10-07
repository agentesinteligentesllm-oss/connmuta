# ADR-0037 — A record argument must be self-contained: `--name=value` for flags that take a value

## Status

`accepted` — confirmed by the Director on 2026-10-07, who delegated the choice among the options below with full
authority and left it to the maintainer's judgement; option (c) was taken. Implemented the same day in
`runner/constants.ts` (`VALUE_LESS_ARGUMENTS`) and `runner/harness.ts` (`isAcceptedRecordArgumentShape` and the
distinct `argument_shape_invalid` reason), with the five pins below. Written by session 76 on 2026-10-06 to close
the open design question of **B-117**, whose row had reserved the choice to the Director.

## Date

2026-10-06.

## Debate

None, and this ADR does not claim one. Arena has been unreachable at every session start since session 55, so
**no debate id exists for this ADR**. The finding it decides came from the PR #106 audit's round 2, where it was
reported **independently by both blind judges** (`JD-A-R2-001`, `JD-A-R2-002`, `JD-B-1`), under the DN-09
substitute; the audit record is the tribunal row for that audit, not a sentence here.

## Context

`runner/constants.ts` carries two mechanisms that together make a woken turn unable to send:

- `SEND_PROOF_PROFILES` — the capability profile appended **after** a record's own `harness_args`. For `pi`:
  `--no-extensions --tools read,grep,find,ls`. `--tools` is the **floor**: it removes `bash` and every
  `conmuta_*` tool. `--no-extensions` is **depth** on top of it: it drops extension discovery, the built-in
  MCP extension included.
- `REFUSED_ARGUMENTS` — a **deny-list** of tokens refused outright in a record, including the tool-exposure
  flags (`--tools`, `--no-extensions`, …) and `--`.

Round 2 of the audit found the hole this ADR is about: a record argument that **consumes the next argv
element** and happens to sit immediately before the profile swallows the profile's first token. A record whose
`harness_args` end in a bare `--model`, `--provider`, `--system-prompt`, `--api-key`, `--session` or
`--thinking` makes the host parse `--no-extensions` as *that flag's value*, so extension discovery returns.

Two things bound it, and both are measured:

- A later `--tools` always wins, and a record's own `--tools` is refused, so `read,grep,find,ls` still applies:
  neither `bash` nor any `conmuta_*` tool comes back. **No send path was found**, which is why this is a
  WARNING and not a repeat of the closed CRITICAL.
- Judge A separately noted `@file` positionals are unrefused (`harness_args: ["@x"]` resolves to a spec),
  letting a record pull an arbitrary path into the turn. The `read` tool already reaches that, so it is not a
  bypass — but it is the same root cause and it belongs in the same decision.

**The root cause is not the missing token. It is that the runner does not reason about the *shape* of a record
argument at all** — it compares tokens against a list. A deny-list can only refuse the tokens it names, so
every new host flag is a new hole by default.

There is a tension inside the current design that is worth stating plainly, because it is what makes the
"just move the profile" reflex wrong: `--no-extensions` is protected by being **last** in argv, while `--tools`
is protected by being **last** in argv *and* by being refused in a record. Last-wins defends the floor against a
`--tools`-style flag and simultaneously exposes the depth to a value-consuming flag. Both holes have the same
fix, and it is not an ordering.

## Options considered

**(a) Keep the deny-list and disclose the residual.** Today's state. It is honest and cheap, and the floor
holds. It leaves `--no-extensions` bypassable by an unbounded, growing set of host flags, and it leaves the
`@file` shape unexamined. It also means the guarantee cannot be stated without an asterisk that grows with the
host's argument surface.

**(b) Parse the resolved argv and refuse on any mismatch with the intended profile.** Makes the error
impossible instead of enumerated. Rejected as the primary mechanism: it couples this repository to **each
host's** argument grammar — four parsers, each free to change without notice — and the actual swallow happens
in the *host's* parse, not in the argv array, so a home-grown parser that disagrees with the host's is a new
class of bug in the thing that is supposed to be the safety net.

**(c) Require every record argument to be self-contained: a flag that takes a value must be written
`--name=value`, and bare flags are refused unless they are on a small, named allow-list of known-value-less
flags.** The runner then reasons about shape — a purely syntactic property of the record — and a
`--name=value` token **cannot** consume the next element, so the swallow is not refused but *unrepresentable*.
Host-agnostic, checkable without any host parser, and testable by construction.

**(d) Reorder so the profile comes first.** Reduces the swallow to a prompt-stealing functional bug, but it
swaps which half is protected by position and breaks the documented and test-pinned "the profile is appended
last, after the record's own arguments" guarantee. Rejected as a decision *by ordering*: it is the same
deny-list reasoning moved around, and it weakens the floor to protect the depth.

## Decision

**Adopt (c), as depth on top of the existing mechanisms rather than instead of them.**

1. `harness_args` entries are classified by **shape**, before the profile is appended:
   - `--name=value` (a single token containing `=`) — accepted;
   - a bare token beginning with `-` — accepted only if it is on a named allow-list of flags documented as
     taking no value; otherwise refused with a distinct reason;
   - anything else (a positional, including `@file`) — refused by the same rule that already refuses `--`,
     because a positional is exactly the token whose meaning depends on the host's parse.
2. `REFUSED_ARGUMENTS` **stays**. It is not replaced: it refuses the tool-exposure and interpreter-class tokens
   by name, and (c) is orthogonal to it. Neither mechanism alone is sufficient, and this ADR does not claim the
   allow-list makes the deny-list redundant.
3. `SEND_PROOF_PROFILES` keeps its **appended-last** position and `--tools` stays the floor. This ADR does not
   change which half is depth and which is the floor; it removes the shape that made the depth bypassable.
4. The refusing reason must be **distinct** from `arguments_refused` so an operator can tell "this flag is
   forbidden" from "this flag must be written `--name=value`".

The operator-facing cost is real and accepted: a record that today says `--arg=--model --arg=x` must say
`--arg=--model=x`. The runbook documents the argument form, so it changes with the code, in the same commit.

## Consequences

- The swallow becomes unrepresentable rather than enumerated, so a **new** host flag that consumes a value stops
  being a new hole: it arrives as a bare token and is refused by shape until it is written `--name=value`.
- The `@file` positional is refused by the same rule, which closes judge A's second observation without a
  special case for `@`.
- A value-less flag not yet on the allow-list is refused. That is fail-closed and correct, but it *is* operator
  friction, and the allow-list becomes a small maintenance surface that must be updated when a legitimate
  value-less flag appears. This is the cost of the decision and it is disclosed rather than minimized.
- `--tools` remains the floor. Removing `--no-extensions` from a woken turn is now harder than before, but the
  guarantee that no send path exists never rested on it, and still does not.
- A host grammar could in principle read `--name=value` as a value-less flag followed by junk. Not observed for
  any of the four harnesses, and it is the one residual this decision does not close; it belongs to the same
  class of host-parser dependence that option (b) tried to fix, and it is bounded by the floor.

## Supersedes

Nothing. It narrows and hardens the **mechanism** of ADR-0032's R5/R7 profile without changing the decision
that a woken turn gets one; ADR-0032 stays `proposed` and unamended. It closes the design question inside
**B-117**; the audit findings that produced it (`JD-A-R2-001`, `JD-A-R2-002`, `JD-B-1`) are its source, not a
debate.

## Tests that must pin it

Each of these can fail, and each fails for one reason:

1. **The swallow is refused.** A record ending in a bare value-consuming flag (`--model`, `--provider`,
   `--system-prompt`, `--api-key`, `--session`, `--thinking`) resolves to a refusal, and the resolved argv for
   the same record written `--model=value` still ends `[--no-extensions, --tools, read,grep,find,ls, PROMPT]`.
   Non-vacuity: against the pre-change runner the first half of this test reports a `spec`, not a refusal.
2. **The positional shape is refused.** `harness_args: ["@x"]` and a bare non-flag token are refused, with the
   same distinct reason as (1)'s bare flags rather than `arguments_refused`.
3. **The floor is untouched.** With any accepted record, the resolved argv still contains
   `["--tools", "read,grep,find,ls"]` contiguously, and contains no `bash` — asserted on the **tool list**, not
   on the string's presence, so that a list which merely *contains* the substring cannot pass.
4. **The deny-list is still live.** All eight `REFUSED_ARGUMENTS` tool-exposure tokens still resolve to
   `arguments_refused`, so (c) has not quietly displaced the named refusals.
5. **The profile still comes last, with the prompt after it** — the existing guarantee, unchanged and still
   pinned, so this ADR cannot be read as having moved the profile.
