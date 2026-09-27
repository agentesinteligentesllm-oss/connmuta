# doctor Specification

## Purpose

The `conmuta doctor` validator: offline system/registry tiers that make zero network calls, an
online per-binding tier that runs daemon-side because it needs the token, and an opt-in DM probe
(OVERVIEW §10.4; D-37).

## Requirements

### Requirement: Offline tiers make zero network calls

The offline/system tier and the registry tier MUST run with no token available and MUST make zero
network calls. This MUST be true even when a binding exists and a token is stored: the offline
tiers never read the secret store and never contact Telegram.

#### Scenario: Offline doctor run makes no network call

- GIVEN a machine with an installed registry and at least one stored token
- WHEN `conmuta doctor --offline` (or the offline-only phase of `conmuta doctor`) runs with all
  network access blocked at the test harness level
- THEN the run completes and reports its findings, and no network call was attempted

#### Scenario: Offline doctor never touches the secret store

- GIVEN a bound project with a stored token
- WHEN the offline tiers run
- THEN no secret-store read occurs for that token

Traces: OVERVIEW §10.4; proposal.md success criteria ("zero network calls; test fails if any occurs")

### Requirement: Offline/system tier checks the machine, not the registry content

The offline/system tier MUST check: Node >= the floor version, the launcher resolvable on PATH,
the home directory and registry writable, the ledger opens without quarantine, no stale locks,
and the secret-store ACL state.

#### Scenario: A stale lock is reported

- GIVEN a `run/daemon.lock` older than the stale threshold with no live process holding it
- WHEN the offline/system tier runs
- THEN it reports the stale lock as a finding, makes no network call, and takes no corrective
  action itself

Traces: OVERVIEW §10.4

### Requirement: Registry tier checks bijective invariants and the token-shape scan

The registry tier MUST re-run the bijective invariants (R1-R4) and the token-shape scan (R5) over
`registry.json` and every `conmuta.json` it can reach, and MUST report a finding rather than
silently accepting a document that would fail those checks at daemon load time.

#### Scenario: A token-shaped string in a project file is reported

- GIVEN a `conmuta.json` field whose value matches the token-shape regex
- WHEN the registry tier's token-shape scan runs
- THEN it reports the finding, names the offending field, and never echoes the matched text

Traces: OVERVIEW §10.4; DATA-MODEL.md §2.5 R1-R5; PT-05 (doctor half); B-30 (R5 tension surfaced here)

### Requirement: Registry tier warns on a tool-config file not covered by .gitignore

For each bound project whose directory is a git worktree (a `.git` path exists there, file or
directory — the latter for a linked worktree/submodule), the registry tier MUST check every
existing tool-config path against that project's `.gitignore` and report a `warn` finding, naming
the path, for any file not covered by an exact or covering-parent entry. This check MUST make no
subprocess call (`git` is never invoked — D-50's exec allow-list stays `{icacls.exe, reg.exe}`
only) and MUST NOT claim the file IS tracked by git, since that was never verified; the finding
wording states only what was checked (git-repo presence plus `.gitignore` coverage).

#### Scenario: An uncovered tool-config file in a git repository is flagged

- GIVEN a bound project with a `.git` path and a tool-config file whose path no `.gitignore` entry
  covers
- WHEN the registry tier runs
- THEN it reports a `warn` finding naming that file, without invoking `git` and without claiming
  the file is actually tracked

#### Scenario: A covered tool-config file is not flagged

- GIVEN a bound project with a `.git` path and a tool-config file already covered by `.gitignore`
- WHEN the registry tier runs
- THEN no finding is reported for that file

#### Scenario: A project with no .git path is never checked

- GIVEN a bound project directory with no `.git` file or directory
- WHEN the registry tier runs
- THEN no gitignore-coverage finding is reported for any tool-config file in that project

Traces: design.md D-52 (§16 risk table, doctor half — this requirement's actual scope is narrower
than that entry's literal wording, disclosed above and in `registry.ts`'s own doc comment: only
`.gitignore` coverage is checked, never real git-index membership); D-50 (exec allow-list stays
`{icacls.exe, reg.exe}` — no new subprocess dependency)

### Requirement: Online tier runs inside the daemon and checks live Telegram state

The online tier MUST run inside the daemon (it needs the token) and, per bound binding, MUST
check: `getMe` matches the recorded bot, `getChat(group_id)` is reachable, my `agent_id` is present
in the roster with my `bot_id`, `bot_id` is unique across bindings, and every roster bot is a
member of the bound group and is not an administrator or creator. The online tier MUST print
`bot_id` only, never a token.

#### Scenario: getMe mismatch is reported per binding

- GIVEN a binding whose stored `bot_id` no longer matches what `getMe` returns for that token
- WHEN the online tier checks that binding
- THEN it reports the mismatch for that `bot_id` and prints no token

#### Scenario: A roster bot with administrator status is flagged

- GIVEN a roster bot whose `getChatMember` status in the bound group is `administrator` or
  `creator`
- WHEN the online tier's membership check runs
- THEN it flags that bot as holding elevated status in the group

Traces: OVERVIEW §10.4; THREAT-MODEL.md T07, T21, PT-32; B-28 (membership-check ownership)

### Requirement: DM probe is opt-in and confined to the binding being validated

The DM probe MUST NOT run unless explicitly opted into for that `doctor` invocation, and MUST
message only roster peers of the binding being validated; it MUST NOT message peers of any other
project's binding.

#### Scenario: Doctor without the opt-in sends no DM

- GIVEN a `doctor` run for a bound project with the DM probe not selected
- WHEN the run completes
- THEN no DM was sent to any roster peer

#### Scenario: Opted-in DM probe never crosses project boundaries

- GIVEN two bound projects, A and B, each with its own roster
- WHEN `doctor` runs with the DM probe opted in for project A only
- THEN only project A's roster peers receive a probe message, and project B's peers receive none

Traces: OVERVIEW §10.4; v1 `src/doctor.ts:132-137` (the v1 defect being corrected)

## Traceability

| Source | Requirement / Scenario |
|---|---|
| proposal.md success criteria | Offline tiers make zero network calls |
| OVERVIEW §10.4 | Offline/system tier; registry tier; online tier |
| PT-05 (doctor half) | Registry tier token-shape scan |
| design.md D-52; D-50 | Registry tier warns on a tool-config file not covered by .gitignore |
| PT-32; THREAT-MODEL.md T21 | Online tier membership/admin check |
| B-28 | Online tier membership-check ownership |
| B-30 | Registry tier R5 tension surfaced here |
| v1 `src/doctor.ts:132-137` | DM probe confined to the binding being validated |
