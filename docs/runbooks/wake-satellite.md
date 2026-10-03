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
3. **The `conmuta` MCP entry your host will load for the woken turn.** The turn reaches the bus with the
   same thin client every other session uses. Give it **one id-free entry** — `conmuta mcp`, with no
   `--project` — in your host's **user-level** config (a Pi host keeps it in `~/.pi/agent/mcp.json`). The
   client then binds to the nearest ancestor `conmuta.json` of the turn's own cwd, so that single entry
   serves every bound tree on the machine and keeps serving them when a new binding is armed
   ([ADR-0033](../03-adr/0033-project-flag-as-assertion.md)). Two traps this avoids, both measured on
   2026-10-01:
   - A **project-level** entry (`<project>/.pi/mcp.json`) is invisible to a session whose cwd is a
     subfolder of the bound root — host config is cwd-relative, with no ancestor walk-up.
   - A project-level entry is also **trust-gated**: the host reads it only after a trust decision for
     that folder has been saved, and a headless run (`pi -p`, exactly what this runner starts) has
     nobody to ask, so it resolves *not trusted* — the turn would keep its quota cost and lose every
     `conmuta_*` tool.
   A `--project <id>` on the entry is still accepted (it is an assertion the client checks against the
   file it found), but it is what makes the entry wrong in every other tree: do not use it for the
   woken turn. (Verified 2026-10-01: a woken turn with the user-level entry called `conmuta_fetch` and
   read its inbox.) A turn that cannot call `conmuta_fetch` will do nothing useful.

## The ladder: one machine-local record per binding

Nothing is woken until you say so, for one binding at a time, on this machine only. `off` is the default and
the ladder lives under the daemon home (`~/.conmuta/runner/ladder.json`), never in the committed
`conmuta.json`.

| Level | What it does |
|---|---|
| `off` | Nothing at all: the runner does not even hold a session against the daemon. |
| `notify` | Tells you on stderr and records the event. **Starts no turn.** |
| `wake` | Starts one turn, read/reply-only: it may fetch, read the project and reply or ACK. |
| `autopilot` | Starts one turn in the confined act profile: it may also run this project's own tests and linters and make scoped edits inside the worktree. |

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
are allowed (`--arg=--model --arg=placeholder-model`); a value beginning with `--` must use the `=` form.
Arguments that would defeat the closed-executable rule (`-c`, `eval`, `--dangerously-skip-permissions`, …) are
refused when the record is used.

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

## What happens when a message arrives

1. A roster peer sends a `BROADCAST` (the "all" tag) or a message addressed to this binding's agent.
2. The daemon admits it, and the doorbell answers the runner's long poll with a **body-less** summary: a
   count, the senders, the envelope types and the thread ids. No message text crosses this path.
3. The runner checks the binding's level and its three bounds — one turn in flight, the cooldown (10 s), and
   the per-window budget (20 wakes per hour). A refusal is recorded with its reason and **leaves the message
   pending**, so it wakes as soon as the bound clears.
4. It starts the harness with a literal argv (the prompt is the last element, `shell: false`) and an
   allow-listed environment, in the project's own directory.
5. The turn calls `conmuta_fetch`, reads the bodies **inside the fence**, applies this project's own rules,
   and replies with `conmuta_send`.
6. Only then does the runner advance the doorbell watermark, and it writes exactly one `wake` row.

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

## Limits — read these before choosing `autopilot`

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
| `refused (arguments_refused)` | The record's `--arg` list contains an interpreter or permission-bypass flag. |
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
