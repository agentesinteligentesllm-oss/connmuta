# Runbook: arming the wake satellite (`conmuta-runner`)

Audience: an operator who wants a bound agent to be woken by its own bus traffic instead of waiting for a
human to open a session. This is a step-by-step operational guide and an honest list of limits, not a design
document — see [ADR-0032](../03-adr/0032-wake-satellite-and-per-binding-ladder.md) for the decisions and
[CONSTITUTION §3.1](../01-constitution/CONSTITUTION.md) for the law it implements.

`conmuta-runner` is a **satellite**: a separate program outside the core, started by you, that holds the
daemon's body-less doorbell for one binding and — when traffic arrives and the binding's own ladder level
allows it — starts one headless turn. It holds no bot token, never talks to Telegram, never reads the ledger
and never writes to any settings or permissions file.

## Before you begin

1. **A running daemon bound to the project you want to wake.** The runner never starts one. Confirm with
   `conmuta panel` or `conmuta doctor` if you are unsure.
2. **A harness that a process can actually start.** Run the harness's own headless form yourself first (for
   example `claude -p "<a prompt>"` from the project directory). If that does not work in your shell, the
   runner cannot make it work either — and on Windows there is a second, harder gate: see "Windows: the four
   harnesses are `.cmd` shims" below, because for those four names a shell is the *only* thing your
   terminal has that the runner deliberately refuses.
3. **The `conmuta` MCP entry your *interactive* session will load.** Since 2026-10-05 a woken turn is
   started with **no MCP surface at all** (`--no-extensions`, see "A woken turn cannot send" below), so this
   entry is for the session you sit in, not for the turn. Give it **one id-free entry** — `conmuta mcp`, with
   no `--project` — in your host's **user-level** config (a Pi host keeps it in `~/.pi/agent/mcp.json`), and
   set `"exposure": "direct"` on it so the four `conmuta_*` tools are declared instead of hidden behind
   `codemode`. The client then binds to the nearest ancestor `conmuta.json` of the session's own cwd, so that
   single entry serves every bound tree on the machine and keeps serving them when a new binding is armed
   ([ADR-0033](../03-adr/0033-project-flag-as-assertion.md)). Two traps this avoids, both measured on
   2026-10-01:
   - A **project-level** entry (`<project>/.pi/mcp.json`) is invisible to a session whose cwd is a
     subfolder of the bound root — host config is cwd-relative, with no ancestor walk-up.
   - A project-level entry is also **trust-gated**: the host reads it only after a trust decision for
     that folder has been saved, and a headless run (`pi -p`, exactly what this runner starts) has
     nobody to ask, so it resolves *not trusted*.
   A `--project <id>` on the entry is still accepted (it is an assertion the client checks against the
   file it found), but it is what makes the entry wrong in every other tree: do not use it.

   > **Measured 2026-10-05, correcting this runbook's own premise.** `~/.pi/agent/trust.json` **does exist**
   > and marks FRISCO trusted, and the entry was correct — and neither session had a `conmuta_*` tool anyway.
   > The real cause was `"extensions": ["-builtin:mcp"]` in `~/.pi/agent/settings.json`, left behind by an
   > unregistered `pi-mcp-adapter`, which turns Pi's built-in MCP off for **every** session. `pi mcp list`
   > still connected (it always uses the built-in), which is what made the failure look like a trust problem.
   > Fixed by removing that entry and setting `exposure: "direct"`; a session in FRISCO now declares
   > `mcp__conmuta__conmuta_send/fetch/status/thread` (verified from the session's own request).

## The ladder: one machine-local record per binding

Nothing is woken until you say so, for one binding at a time, on this machine only. `off` is the default and
the ladder lives under the daemon home (`~/.conmuta/runner/ladder.json`), never in the committed
`conmuta.json`.

| Level | What it does |
|---|---|
| `off` | Nothing at all: the runner does not even hold a session against the daemon. |
| `notify` | Tells you on stderr and records the event. **Starts no turn.** This is the level to arm when all you want is to be told. |
| `wake` | Starts one turn under a **send-proof profile**: no shell and no MCP surface, so it cannot read the inbox, cannot reply and cannot run anything. It records what it found and stops. **A `wake` turn cannot answer the bus** (2026-10-05) — see "A woken turn cannot send". |
| `autopilot` | **Refused.** The act profile needs a shell, and a shell can always send, so no `autopilot` turn is ever started; the refusal is recorded as `profile_unavailable`. |

```sh
# 1. See what is armed right now.
conmuta-runner ladder get

# 2. Arm one binding, read/reply only. --by is required and recorded.
conmuta-runner ladder set --project "<project-id>" --level wake --harness pi --by "Director: review my inbox"

# 3. Or let it act (tests, linters, scoped edits). Read "Limits" first.
conmuta-runner ladder set --project "<project-id>" --level autopilot --harness claude --by "Director: audited review only"

# 4. Start the runner (leave it running; Ctrl-C stops it).
#    `--cwd` must name the directory that holds THIS binding's conmuta.json, or run it from inside the project:
conmuta-runner run --project "<project-id>" --cwd "<binding root>"

# 5. The kill switch: the binding resolves back to off within one ladder poll (5 s).
conmuta-runner ladder disable --project "<project-id>" --by "Director: stopping"
```

**Why `--cwd` matters.** The runner resolves the binding by walking up from the directory it was started in
and stopping at the **nearest** `conmuta.json`. Start it from another repository and it finds *that*
repository's file and refuses:

```text
conmuta.json is bound to '<the other project>', expected '<your project id>'
```

Naming `--cwd` (or starting the runner from inside the project) is what makes `--project` and the walk-up
agree. `ladder get|set|disable` do not need it: they are machine-local and never touch a project's tree.

`--harness` is mandatory for `wake` and `autopilot` because it decides **which program gets executed**; the
four names the runner will ever run are `pi`, `claude`, `codex` and `opencode`. Additional literal arguments
are allowed (`--arg=--model=placeholder-model`), and a record flag that **takes a value must be written
`--name=value`** as one token — `--arg=--model` followed by `--arg=placeholder-model` is two bare tokens and is
refused, because a bare flag could swallow the first token of the appended send-proof profile. A bare flag is
accepted only when it is on the named value-less allow-list (`VALUE_LESS_ARGUMENTS` in `runner/constants.ts`,
empty today), and a positional — `@file` included — is refused. Arguments that would defeat the
closed-executable rule (`-c`, `eval`, `--dangerously-skip-permissions`, …) are refused when the record is used.

> **On Windows, none of the four can be started as they are installed** — npm ships them as `.cmd` shims and a
> shell-free spawn refuses them (`EINVAL`). The failure is **silent**: the message stays pending and the ledger
> records `unavailable`, once a minute, with no error on screen. Read the Windows bullet under *Limits* before
> arming, and give the runner process a real executable of its own.

### Checking it by hand

```sh
conmuta-runner run --project "<project-id>" --once
```

One tick: it reads the ladder, and either does nothing (`idle`), reports a quiet inbox (`silent`), notifies
(`notified`), wakes (`woke`), refuses (`refused`) or reports the daemon unreachable (`link_failed`). This is
the safest way to confirm that a level, a harness and the daemon are wired correctly.

## Verifying the live-session path (owed)

The path this runbook assumes — *a live session answers the bus* — has one part that cannot be checked on a
single machine, and it is deliberately left **owed** rather than called done. To execute it later you need
**one roster peer whose owner is reachable**, because AGENTBUS has no private loopback: every `send` reaches
the bound group *and* a direct DM, so a test message fans out to the other agents. A message a human types in
Telegram does not work either — a human `user_id` is not on the roster and ingest drops it as `unknown_sender`.

1. **With a live session.** Have the peer send a `REQUEST` to `@luisgtz-agent`; in your open session call
   `conmuta_fetch`, read the fenced body, and answer on the same thread with `conmuta_send`. Then read the
   ledger read-only: the `audit_log` `send` row must carry **your session's `client_id`** — that is the live
   proof of the attribution change, and it cannot be produced without posting.
2. **With no live session.** Close every session that has the bus, have the peer send again, and confirm three
   negatives: no `@luisgtz-agent` row in `thread_history`, no `send` row in `audit_log`, thread still pending.
   That is correct behaviour, not a fault.
3. **The headless attempt.** Arm `autopilot` for the binding *temporarily* only to watch it be refused: the
   wake ledger gets a `refused` row with `reason: "profile_unavailable"`, no turn starts and nothing is sent.
   Then `ladder disable` again.

The exact commands and the acceptance criteria live in
[`odd/tasks/solo-sesion-viva.md` §OWED](../../odd/tasks/solo-sesion-viva.md) and the row is tracked as
**B-114**. Until it runs, treat criterion 1 as owed.

## What happens when a message arrives

1. A roster peer sends a `BROADCAST` (the "all" tag) or a message addressed to this binding's agent.
2. The daemon admits it, and the doorbell answers the runner's long poll with a **body-less** summary: a
   count, the senders, the envelope types and the thread ids. No message text crosses this path.
3. The runner checks the binding's level and its three bounds — one turn in flight, the cooldown (10 s), and
   the per-window budget (20 wakes per hour). A refusal is recorded with its reason and **leaves the message
   pending**, so it wakes as soon as the bound clears.
4. It starts the harness with a literal argv (the prompt is the last element, `shell: false`) and an
   allow-listed environment, in the project's own directory.
5. The turn runs under the send-proof profile: it reads what it can of the project, records what it found,
   and **cannot call any bus tool** — the profile has no MCP surface. It does not reply.
6. Only then does the runner advance the doorbell watermark, and it writes exactly one `wake` row. The
   thread stays **pending** until a live session with the bus answers it.

## What is recorded

Three files, all under the daemon home and none of them daemon-attested:

- `~/.conmuta/runner/ladder.json` — the opt-in record, per binding.
- `~/.conmuta/runner/watermark.json` — how far the doorbell has been read, per binding, so a restart resumes
  exactly where the previous run stopped instead of re-reading the daemon's catch-up window.
- `~/.conmuta/runner/wake-ledger.jsonl` — append-only, one JSON object per line:

| `kind` | When |
|---|---|
| `ladder` | Every human action on the ladder, with the note you passed to `--by`. |
| `wake` | One row per accepted wake: trigger identity, thread, level, harness, outcome. |
| `refused` | A bound in force, a refused argument list or an unreadable ladder record — with the reason. |
| `notify` | A `notify`-level delivery. |

The runner's own diagnostics (the same facts, plus the turn's own output, capped) go to stderr.

### First run, restarts, and what "pending" means

- **The first run ever** starts from the daemon's own catch-up seed (`SESSION_CATCHUP_HOURS`), so recent traffic
  may wake the agent as soon as you arm it. Every run after that resumes from `watermark.json`, so a restart
  does not re-wake what was already handled.
- **A turn that times out, or is aborted at shutdown, does not cover its message**: it stays pending and is
  woken again, bounded by the per-window budget. Only a turn that ran to completion advances the cursor.
- **The kill switch is effective before the next turn starts**, even if the runner is in the middle of a long
  poll: the ladder is re-read after every poll that finds traffic.

### A woken turn cannot send (2026-10-05, Director's order)

On 2026-10-04 four `REPLY`s left in `@luisgtz-agent`'s name without the Director's interactive session
knowing: the woken turn had **no** `conmuta_*` tool, but it had `bash`, so it read the daemon's run-file
secret, wrote its own IPC client and sent anyway. Measured in `~/.conmuta/ledger.db` (`thread_history`,
`client_cursors`) and in the turn's own session transcript.

The rule now is absolute: **no woken turn may send anything, directly or indirectly.** It is enforced by
capability, not by permission:

- `wake` on `pi` is started as `pi -p --no-extensions --tools read,grep,find,ls`. `--no-extensions` removes
the built-in MCP extension, so there is no `conmuta_*` tool to call; `--tools read,grep,find,ls` removes
`bash`, so there is no shell to read the run file or speak raw IPC with.
- The profile is appended **after** the record's own `harness_args`, and a record that tries to *replace* it
  (`--tools`, `--exclude-tools`, `--no-tools`, `--no-extensions`, `-e`, `--`, …) is refused. `--` is the entry
  that is not a flag at all: it is the option terminator, and refusing it is what keeps appending meaningful —
  a parser that stops flag parsing there turns the whole profile into prompt text.
- **Which half is load-bearing, stated because the audit of 2026-10-05 measured it.**
  `--tools read,grep,find,ls` is the floor: it removes the shell and every `conmuta_*` tool, and a record cannot
  replace it, because a later `--tools` wins and the record's own `--tools` is refused. `--no-extensions` is
  depth, not the floor: a record argument that *consumes the next argv element* and is placed last — `--model`,
  `--provider`, `--system-prompt`, `--api-key`, `--session`, `--thinking`, … none of which is a widening flag
  and none of which a deny-list names — would swallow it, so extensions would load again, the built-in MCP
  extension included. The bus tools stay out of reach because `--tools` still holds, and that is the measured
  bound. What closes the swallow is the **shape rule** (ADR-0037), not the deny-list: a record argument that
  takes a value must be written self-contained as `--name=value`, a bare flag is accepted only when it is on the
  named value-less allow-list, and anything else — a positional, `@file` included — is refused. A `--name=value`
  token cannot consume the next element, so the swallow is **unrepresentable** rather than enumerated, and a new
  host flag is refused by shape until it is written that way.
- A level or harness with **no verified send-proof profile is refused, never started with its full toolset**:
  `autopilot`, and `wake` on `claude`, `codex` and `opencode`. The refusal is recorded in the wake ledger as
  `refused (profile_unavailable)` — not a silent drop.
- The daemon now records the sending session's `client_id` on every `send` audit row written by a
  **session-authenticated** call, so a send is attributable after the fact; it was hardcoded `null` until this
  change, which is why the four replies above could not be traced to a client from the ledger at all. The
  daemon's own `doctor` DM probe also writes a `send` row, and it carries `client_id: null` on purpose: no
  session exists to name, and the row identifies itself by `reason: "DOCTOR_PROBE"`.

**What this does not promise.** A daemon-side proof of "a human is present" is not achievable inside the
core: every local process of the same OS user reads the same run file and speaks the same authenticated
loopback IPC, and the thin client's `host` is the same literal for an interactive session and a woken one.
The load-bearing control is therefore the capability profile above, and its limit is the operator's own
harness configuration. A process started outside this runner with a shell of its own is outside what the
runner can bound.

**What this does not promise, second part: it never reaches the session you are sitting in.** No level above
delivers a bus message to the interactive host session you have open. `notify` tells you on the runner
process's **stderr** and records the event — it does not post to Telegram and it does not surface in your
session. `wake` starts a **separate headless turn**, which since 2026-10-05 has no shell and no MCP surface,
so it cannot read the inbox or reply either. `autopilot` is refused. **The bus is pull-only for a host
session**: a live session learns what arrived when *it* runs `fetch`, which is the only reason the
`<!-- conmuta:begin -->` block in a bound project tells an agent to fetch. If your expectation is "a message
addressed to me should wake the session I am sitting in", that path was never built — it is recorded as
[B-115](../06-backlog/CHECKLIST.md), with its evidence in
[`odd/tasks/b-115-wake-does-not-reach-a-live-session.md`](../../odd/tasks/b-115-wake-does-not-reach-a-live-session.md),
and it needs an ADR before code. What the ladder is for is the other direction: letting the *machine* notice
while no session is open, at the level you arm. Arming it again is now safe **for the reason it was disarmed**
(no woken turn can send), and unsafe for the reason this paragraph gives (it still will not reach you).

**How to turn it back on.** Adding a verified send-proof profile for a harness (or a safe `autopilot` shape)
is a code change in `runner/constants.ts` plus a live probe like the one that verified `pi`. To arm the
despertador at all, `conmuta-runner ladder set --project "<id>" --level notify --harness pi --by "<you>"`;
`notify` needs no profile and starts no turn.

## Limits — read these before choosing a level

- **A woken turn cannot send, and cannot be made able to.** Since 2026-10-05 there is no level that lets a
  headless turn answer the bus: `wake` has no shell and no bus tool, and `autopilot` is refused. If you want
  the bus answered, answer it from a live session; if you want to be told, use `notify`.
- **The profile is not a sandbox.** The runner confines *which program* runs and *what environment and
  directory* it gets. What that program's tools may then do is decided by **your own harness configuration**,
  which the runner never reads and never writes. A capable model can still be talked into misusing a command
  it is allowed to run: the allow-list you configured is the security boundary.
- **A woken turn is headless.** There is no human at a permission prompt. That is why `wake` is the default
  for an enabled binding and why `off` is the default overall.
- **The argv templates mirror the RFC's proposal** (`pi -p`, `claude -p`, `codex exec`, `opencode run`) and the
  prompt is appended as the final argument. **All four forms are verified live against installed versions on
  Windows 11 (sessions 60 and 66)**:
  - `pi -p`: verified end to end on the bus (Pi 0.99.2 / 1.0.1; 2026-10-01) — the turn started, called `conmuta_fetch`,
    read its inbox, and posted replies with `conmuta_send`.
  - `claude -p`: verified live (Claude Code 2.1.283; 2026-10-03) — parsed `-p` and processed headless prompt directly.
  - `codex exec`: verified live (Codex CLI 0.152.1; 2026-10-03) — parsed `exec` and processed headless prompt with
    `stdio: ["ignore", "pipe", "pipe"]`.
  - `opencode run`: verified live (Opencode 1.18.31; 2026-10-03) — parsed `run` and processed headless prompt with
    `stdio: ["ignore", "pipe", "pipe"]`.
  The phase's tests pin the *shape* (closed executable, literal argv, `shell: false`, confined cwd and environment),
  and the default argv table in `runner/constants.ts` matches real CLIs.
- **On Windows npm harnesses are `.cmd` shims, and the runner refuses them under `shell: false`.** npm installs
  `pi`, `codex` and `opencode` as batch shims, and a process started with `shell: false` cannot execute a `.cmd`
  (`EINVAL` — pinned by `test/runner/harness.test.ts`'s "a launch failure is `unavailable`, never a shell fallback").
  `claude` on Windows ships a native PE binary (`~/.local/bin/claude.exe`), so it starts directly without a shell.
  For `pi`, `codex` and `opencode`, both `@openai/codex` and `opencode-ai` package precompiled native `.exe` binaries
  inside their platform packages, and the working remedy for any harness requiring one is a **real executable**
  that takes the same argv: a small shell-free launcher (the team's working example is a Go `pi.exe` that runs
  `exec.Command` with a literal argv) delivered **only to the runner process's environment**, by prepending its
  directory to that process's own `PATH`.
- **Never put that executable on the machine `PATH`.** A `pi.exe` ahead of npm's `pi.cmd` would shadow the
  interactive `pi` command for **every** terminal on the machine. The runner's shell-free requirement is the
  runner's; the rest of the machine keeps its shims.
- **The runner will not fall back to a shell**, because that fallback is exactly the command-injection path
  this design exists to prevent. `unavailable` is the correct, fail-closed answer.
- **Running it permanently.** Keep the autostart its **own** entry — a `Run` value of its own, a shortcut in the
  per-user **Startup folder**, or a tiny wrapper with a restart loop — never a Windows service, and never folded
  into the installer's existing `conmuta` value, which starts the daemon and nothing else. A restart-loop
  wrapper revives the runner about fifteen seconds after it dies, so **killing the node process does not stop
  it**. To stop a permanent installation, in this order: (1) `ladder disable` — the binding returns to `off`
  within one poll and stops waking at once, which is the step that actually matters; (2) remove the autostart
  entry so it does not come back at the next logon; (3) stop the wrapper **and** its node process.
- **The woken turn is a separate, headless turn — your open session is not notified.** Arming this does not make
  the session you are sitting in receive anything: the runner starts a **new** harness turn, which reads the
  inbox, may reply on the bus and may save to its own memory, and then exits. A doorbell *into an interactive
  session* is a different mechanism — the F4 `conmuta-channel` adapter, today exclusive to Claude Code
  ([`channel-doorbell.md`](channel-doorbell.md)). If you armed the runner and "nothing arrived" in the window
  you were looking at, this is why, and it is not a fault.
- **The wake ledger is self-reported.** The daemon does not know the runner exists, so nothing in the daemon
  can corroborate these rows (ADR-0032 R6a). Treat the ledger as the satellite's own account.
- **The roster and the private group are not controls here.** They decide who may send. What a rostered peer
  writes is still untrusted data, and a peer's own context can be poisoned.
- **A refused harness leaves the message pending**, so a permanently misconfigured harness produces a refusal
  every minute rather than losing the message. Fix the harness; the pending message then wakes.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `idle` in `--once` and `ladder get` says `off (no_record)` | The binding was never armed, or you passed a different `--project`. |
| `off (malformed)` | The ladder file is not readable JSON, or its `schema_version` is not `1`. Fix or delete it; the runner will not guess. |
| `off (unknown_harness)` | The record names a harness outside the closed set. Re-arm with one of the four names. |
| `off (unknown_level)` | A typo in the level. Re-arm. |
| `refused (cooldown)` / `(budget_exhausted)` | Working as designed; the message stays pending. |
| `refused (arguments_refused)` | The record's `--arg` list contains an interpreter, a permission-bypass flag, the option terminator `--`, or a flag that would replace the send-proof profile (`--tools`, `--no-extensions`, `-e`, …). Note that `ladder set` does **not** pre-validate the list, so a record carrying one of these is written successfully and only refuses at the first tick — the message stays pending. |
| `refused (argument_shape_invalid)` | The record's `--arg` list has an entry that is not **self-contained**: a flag that takes a value must be written `--name=value` (`--arg=--model=placeholder-model`, not `--arg=--model --arg=placeholder-model`), a bare flag is accepted only when it is on the named value-less allow-list (`VALUE_LESS_ARGUMENTS` in `runner/constants.ts`, empty today), and a positional — `@file` included — is always refused. `ladder set` does **not** pre-validate the list, so the record is written successfully and only refuses at the first tick — the message stays pending. |
| `refused (profile_unavailable)` | The level or harness has no verified send-proof profile — `autopilot`, or `wake` on `claude`/`codex`/`opencode`. Nothing was started; the message stays pending. |
| `refused (in_flight)` | A turn is still running. It is bounded by the ten-minute turn timeout. |
| `link_failed` | No live daemon for this user, or the run file's daemon died. Start the daemon and run again. |
| A peer message arrives but no new `wake` row appears | The message was sent by the binding's **own** agent: the doorbell skips self-echo (`row.from_agent_id !== binding.agent_id`, `src/daemon/serve/doorbell.ts:154`), so a binding cannot wake itself. Test with **another** roster agent — a `REQUEST` to this binding's agent, or a `BROADCAST` with no `to` (a `BROADCAST` carrying `to` is refused by the wire schema). A human typing in Telegram does not work either: their `user_id` is not on the roster and ingest drops it as `unknown_sender`. |
| `woke` but nothing appears on the bus | Two very different cases. (a) The turn ran and **legitimately decided to do nothing** — a `wake` turn may read its inbox, find nothing addressed to it, and reply-not at all; the ledger's `outcome: "exited"` is the whole truth, and a silent turn is a correct turn. (b) Something is wrong: read the turn's own output on the runner's stderr (capped), and check the reminder that the harness form and the host's MCP entry are the two things a turn needs. |
| `unavailable` on every wake, and a `refused` row roughly every minute | The harness could not be started: on Windows, a `.cmd` shim under `shell: false` (`EINVAL`). See "Windows: the four harnesses are `.cmd` shims" in Limits. The message stays pending throughout, so nothing is lost while you fix it. |
| The turn runs but reports no `conmuta_*` tools, or cannot read the bus | The host never loaded the `conmuta` entry. Almost always one of the two traps in "Before you begin" item 3: the entry is **project-level** (invisible from a subfolder, and trust-gated so a headless run resolves *not trusted*), or it carries a `--project <id>` that no longer matches. Use one id-free **user-level** entry. |
| A permanent wrapper will not stop when I kill the process | A restart-loop wrapper revives it. The real switch is `ladder disable`, honoured on the running process's next ladder read. |
| The harness exits immediately with a permission error | Your harness's own configuration refuses headless tool use. That refusal is the control working; the runner will not override it. |

## Related

- [ADR-0032](../03-adr/0032-wake-satellite-and-per-binding-ladder.md) — the decision, its rules and the
  threat rows it added.
- [ADR-0033](../03-adr/0033-project-flag-as-assertion.md) — why one id-free registration serves every tree,
  and what the woken turn's cwd therefore resolves to.
- [`docs/runbooks/channel-doorbell.md`](channel-doorbell.md) — the F4 Claude Code doorbell, which is a
  different consumer of the same body-less signal (it notifies an interactive session instead of starting a
  turn).
