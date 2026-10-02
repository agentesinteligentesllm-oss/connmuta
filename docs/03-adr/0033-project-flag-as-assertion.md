# ADR-0033 — `--project` is an assertion, not a requirement: one registration serves a whole tree

## Status

`accepted` — confirmed by the Director on 2026-10-01, the same day the work was authorized (the DN-04
pattern used for ADR-0028..0031). Amends
[ADR-0028](0028-project-scoped-bijective-binding.md) rule 4 **in part** (the sentence that requires
`--project`). Nothing else in ADR-0028 is touched. It does not amend the CONSTITUTION: Invariant 1
survives unchanged, and the section below says why.

Audited under the tribunal's documented substitute for an unreachable Arena (Judgment Day) in debate
`bus-v2-b107-optional-project-001`. The round-by-round record, the confirmations and the terminal
verdict live in the [tribunal row](../05-tribunal/INDEX.md) — not restated here, where a sentence can
drift out of date the moment a finding is filed. The Arena bridge was unreachable at this session's
start, proven by a real tool call (`mcp connect arena` → *Nothing is listening at
`http://127.0.0.1:8765/mcp`*), which satisfies DN-09's substitute condition directly. Disclosed as a
DN-05 waiver.

## Date

2026-10-01

## Debate

`bus-v2-b107-optional-project-001`. Record: [../05-tribunal/INDEX.md](../05-tribunal/INDEX.md).

## Context

The committed project file has always been the binding's source of truth (ADR-0028 rule 3): one
`conmuta.json` per bound root, carrying `project_id`, `group_id` and the roster. ADR-0028 rule 4 then
made the *registration* repeat that identity: the launcher requires `--project <id>`, and the client
refuses to start when the flag is missing or disagrees with the file the walk-up found.

That duplication is harmless while the entry is written once per project, and it is the source of the
defect once the entry's *location* is decided by the host rather than by the binding. Session 60 moved
the bus registration from the user-level Pi config to the project-level one
(`…\FRISCO\.pi\mcp.json`) and measured three consequences (backlog **B-107**):

| Fact | Evidence |
|---|---|
| A host reads a **project** MCP config relative to its cwd, with no ancestor walk-up, so a session in a subfolder (`…\FRISCO\frisco-erp`, itself a separate Git repository) never sees the parent's entry. | Pi's own config resolution, reproduced: `pi mcp list` in `FRISCO` → `conmuta: connected, 4 tools`; in `FRISCO\frisco-erp` → absent |
| A host may gate a **project** config behind a trust decision, and a non-UI run has nobody to ask — it resolves *not trusted*. The wake satellite starts exactly such a run (`HARNESS_DEFAULT_ARGS.pi = ["-p"]`), so the woken turn would keep its quota cost and lose every bus tool. | `runner/constants.ts`; Pi's `resolveProjectTrusted`/`loadMcpConfig` (`hasUI: false` → `false` with no saved decision) |
| A **user-level** entry is not cwd-relative at all — but one that hardcodes `--project <id>` is worse than useless: every session on the machine would load a client bound to one project. | The session-60 removal of exactly that entry from `~/.pi/agent/mcp.json` |

All three are one defect: **the registration artifact encodes the project**, when the project is
already recorded on disk at the bound root. A registration is a launch recipe, not an identity.

## Decision

1. **`--project <id>` becomes optional on `conmuta mcp`.** With the flag, it is an assertion: the found
   file's `project_id` must equal it, or the client refuses with `EXIT_PROJECT_MISMATCH` before any IPC
   call. Without the flag, the nearest ancestor `conmuta.json` fixes the binding on its own.
   `conmuta.json` remains the only source of the binding — nothing is inferred from an environment
   variable, a registry lookup at launch, or a default id.
2. **The recommended registration is one entry per user, with no project id** (`conmuta mcp`). It is
   correct in every bound tree for every cwd inside it, it is not subject to a host's project-trust
   gate, and it does not have to be re-written when a new binding is armed. An installer-written
   project entry keeps working unchanged — with its `--project <id>` it is still a valid assertion.
3. **The two operator-spawned bins keep the strict flag.** `conmuta-channel` and `conmuta-runner` are
   launched per binding by the daemon or by a wrapper that already knows which binding it serves, so
   `--project` costs nothing there and catches a mistake at startup. They opt into the pre-ADR-0033
   refusal explicitly (`requireProjectFlag: true`) and their exit codes and messages do not change.
4. **`--project`'s own malformed forms stay usage errors — all three spellings.** `--project` with no
   value, `--project` followed by an empty token, and `--project=`. An explicitly empty assertion is
   malformed input, not an instruction to infer the project. Judgment Day round 1 caught that the
   space-separated empty token was the one spelling that slipped through to the resolver, which reads
   `""` as "no assertion" — a host config interpolating an empty variable would have misbound quietly.

## Why this does not weaken Invariant 1

Invariant 1 is bijective binding and no cross-project leakage. It is enforced by two mechanisms, and
this ADR touches neither:

- **The walk-up still fixes the binding before any IPC call.** The nearest `conmuta.json` — a
  committed, reviewed, identifiers-only file — is what the client binds to, exactly as before. The flag
  was never the enforcement; the file is.
- **The daemon still asserts `chat_id === binding.group_id` before every `sendMessage`**, refusing with
  `WRONG_ROOM` and writing an audit row otherwise (`src/daemon/transport/room-guard.ts`; PT-01). A
  client bound to the wrong binding of the same bot cannot post into the other group.

What changes is the shape of the invariant's pinning test: it moves from "the launcher refuses when the
flag is missing" to "the launcher refuses when nothing is bound above the cwd, when the found file is
invalid, or when an explicit flag disagrees with it" — three refusals, all still before any IPC call.
[CONSTITUTION.md](../01-constitution/CONSTITUTION.md) §2's Invariant-1 test row is updated to say so.

The residual risk this ADR accepts, disclosed: a session whose cwd sits inside a tree bound to a
project it did not intend now binds to that project silently instead of failing loudly. That is the
*same* resolution a session in that tree would have got with a correct global registration before the
flag existed, and it is the behaviour the Director asked for; the room guard remains the hard stop for
the case that matters (posting into another group).

## Consequences

- **Positive**: one registration per machine, correct from any cwd inside a bound tree; headless turns
  keep their bus tools; a new binding needs no registration write; the launcher's refusal surface gains
  a case (nothing bound above the cwd) and loses none.
- **Negative / disclosed**: the flag no longer *guarantees* the session's own idea of the project — it
  only checks it when supplied. The installer's per-project entry (`buildLauncherEntry`) still emits
  `--project <id>`; with a global entry present, a host that reads the project file *replaces* the
  global by server name, which would reintroduce the trust gate for that project. Making the installer
  emit an id-free entry is therefore the natural follow-up, and it is **not** done here: it changes a
  wizard-generated artifact under D-42 and has its own blast radius (the wizard flow, `tool-config-merge`,
  its PT entries). Filed as a new backlog row rather than folded in silently.
- **Documentation**: every document that stated "the launcher requires `--project`" now states the
  assertion form — `CONSTITUTION.md` §2, `OVERVIEW.md` (the D5 row, the architecture diagram, the
  component table, §6 "Launcher resolution", §8's invocation row, §9's IPC-handshake sequence diagram
  and §10.3), `DATA-MODEL.md` §1, `THREAT-MODEL.md` T01 and T03, `WORK-PLAN.md` F1, `00-INDEX.md`'s
  ADR table, the tribunal's D5 row, the runbook, and the canonical
  `openspec/specs/thin-client-tools/spec.md` requirement.

## What is pinned by a test that can fail

| Guarantee | Test |
|---|---|
| No flag, valid ancestor → binds to it (the B-107 case) | `test/client/binding.test.ts` ("binds to the nearest ancestor `conmuta.json` when `--project` is undefined"); `test/client/main.test.ts` (the no-flag client starts a live server) |
| No flag, nested cwd → binds to the enclosing tree | `test/client/binding.test.ts` ("binds from a nested subfolder …") |
| No flag, nothing bound → `EXIT_UNBOUND_PROJECT`, zero IPC | `test/client/binding.test.ts`; `test/cli/main.test.ts` (bare `mcp` from an isolated cwd) |
| Explicit flag, mismatch → `EXIT_PROJECT_MISMATCH` | `test/client/binding.test.ts`; `test/client/main.test.ts` |
| `requireProjectFlag: true`, absent/empty → `EXIT_USAGE` (the two bins' unchanged behaviour) | `test/client/binding.test.ts` (both cases); `test/channel/main.test.ts` (the resolver inputs it passes); `test/runner/main.test.ts` |
| The flag's malformed forms stay usage errors (all three spellings) | `test/cli/main.test.ts` |
