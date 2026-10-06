# ADR-0036 — A Pi host adapter holds the doorbell and rings the live session

## Status

`accepted` — confirmed explicitly by the Director on **2026-10-05**, asked as its own question and answered as
such (“Confirmarlo como `accepted`”), in the same session that ratified the design. **Disclosed exactly**, the
way [ADR-0035](./0035-pre-validate-tool-configs-in-project-bind.md) discloses its own basis: this status rests
on **two questionnaires and nothing else**. The first put three questions with their consequences written
out — the classification (a new backlog row under a new phase **F7c**), the minimal design, and the one
genuinely contested point (an automatically started turn inside the interactive session runs with that
session's own tools and may therefore reply) — and the Director answered all three in the affirmative. The
second asked separately whether the ADR should be recorded `accepted`, precisely so the status word would not
be inferred from the answers to a design question the way [ADR-0033](./0033-project-flag-as-assertion.md)
requires. **No tribunal debate exists for this ADR**: Arena has been unreachable at every session start since
session 55, and DN-09's substitute condition is met by a real tool-level probe — which is why the two
questionnaires are named here rather than a debate id. A Director who wants this revisited can supersede this
ADR the ordinary way.

It closes backlog **B-116** and answers the report recorded in **B-115**. It does **not** amend the
CONSTITUTION: no invariant and no layer rule changes. Functionally it adds a **fifth addressable plane**
inside the host process — the extension — without moving the core, which stays passive exactly as it is
today; the capability lives outside the core, the way the wake satellite does.

**Amended 2026-10-06** (backlog [B-124](../06-backlog/CHECKLIST.md)): the ring is armed **only for a
session a person is sitting in** — the terminal TUI, or the interactive RPC host identified by the host's own
`GENTLE_SHELL_INTERACTIVE_HOST=1` marker — so a harness child started as `pi --mode rpc` is never rung. The
amendment at the end of this file carries the measurement and the reason; decision 1 and the test table are
extended, and nothing else changes.

## Date

2026-10-05

## Context

**The report.** The Director reported that a message addressed to him — or a broadcast — never reaches the
live session he is sitting in, and expected a directed message to wake that session. The audit is
[B-115](../06-backlog/CHECKLIST.md) and its detail is
[`odd/tasks/b-115-wake-does-not-reach-a-live-session.md`](../../odd/tasks/b-115-wake-does-not-reach-a-live-session.md):
no level of the wake ladder reaches an interactive session. `notify` writes to the **runner process's
stderr**, `wake` starts a **separate headless turn** that since 2026-10-05 has no shell and no MCP surface,
and `autopilot` is refused. `OVERVIEW.md`'s Wake-up row already said it: the satellite *"never wakes an
interactive host session"*, and host-session wake-up is **pull only**.

**Why the shipped adapter does not carry over.** F4's `conmuta-channel`
([ADR-0024](./0024-channel-doorbell-not-a-second-reader.md)) is an MCP server that declares the
`claude/channel` capability and pushes one body-less doorbell event per announcement. That capability is
Claude Code's, and it has **no Pi equivalent** — measured on 2026-10-05, not assumed:

- Pi's MCP runtime handles exactly three notifications: `notifications/message` is appended to
  `~/.pi/agent/mcp.log`; `notifications/tools/list_changed` and `notifications/resources/list_changed`
  refresh the tool/resource lists
  (`dist/extensions/mcp/runtime.js:299,304,307`).
- Live probe: a minimal stdio MCP server emitting `notifications/message` on `initialize` produced one line
  in `mcp.log` (`2026-10-05T15:58:23.272Z [conmuta-probe] warning …`) and **zero occurrences in the session
  transcript**. Nothing was rendered, no turn started, the model never saw it.

So the MCP-notification doorbell — the shape B-09 was filed to investigate per host — is answered **no** for
Pi, and the answer is a property of the host, not of the adapter.

**What Pi does have.** Pi loads extensions into the same process as the session (interactive, RPC, JSON and
print modes), and the extension API can put a message into the live session:

- `pi.sendUserMessage(text, { deliverAs })` — "Send a user message to the agent. **Always triggers a turn.**"
- `pi.sendMessage({ customType, content, display }, { triggerTurn, deliverAs })` — custom content stored and
  sent to the model, also able to trigger a turn
  (`dist/core/extensions/types.d.ts:1149`, `:1230`, `:1240`).

Both were proved live on 2026-10-05 with a throwaway extension that started a file watcher at
`session_start`; an **external** process created the trigger file five seconds later while the session was
mid-turn. The transcript then shows three things: the original turn, the injected message as **its own
entry**, and a **new assistant turn** answering it. Two measured details shape the decision:

- `deliverAs` is required only while streaming — without it the call throws *"Agent is already processing.
  Specify streamingBehavior ('steer' or 'followUp') to queue the message."* While idle it is optional
  (`agent-session.js:1812` maps `deliverAs` → `streamingBehavior`; `prompt()` at `:1481` ignores it when not
  streaming). `"followUp"` waits for the turn in flight; `"steer"` interrupts it.
- `sendUserMessage` stores a plain `user` message — **indistinguishable from the human's own typing**.
  `sendMessage` with a `customType` stores a distinct `custom_message` entry — **attributable** — and still
  starts a turn when `triggerTurn` is set. Attribution is not cosmetic: this daemon cannot accredit "a human
  is present" (B-113), so a ring that looks like the human's typing would destroy the only signal a reader has
  about where a turn came from.

**What already exists and is reused.** The daemon's doorbell was built in F4 and needs no new route and no
wire change: `POST /channel/doorbell` is a **body-less** long-poll that answers a closed field set
`{count, senders, types, threads, covered_through_seq, saturated}`, gates every row through admission's own
roster reverse-lookup, and **never selects the message-text column** (`src/daemon/serve/doorbell.ts`). The
client half — session handshake from the run file, `readDoorbell`, `commitCursor`, bounded `close` — is
`channel/daemon-link.ts`; the pacing and saturation handling is `channel/doorbell-loop.ts`; the sanitizer and
the instruction text are `channel/notify.ts`. Two consumers of that client half already exist (`conmuta-channel`
and the watcher inside `conmuta-runner`), so a third is a shape this repository has already accepted.

## Options considered

1. **Option (a): a Pi extension that holds the doorbell and injects one body-less, attributable ring.**
   The extension lives in the host process, long-polls the existing `/channel/doorbell`, and on an event calls
   `pi.sendMessage({ customType: "conmuta-doorbell", … }, { triggerTurn: true, deliverAs: "followUp" })`. The
   session wakes, runs its own `conmuta_fetch`, and answers with `conmuta_send` like any live session. This is
   the Claude Code adapter's contract transposed to the surface Pi actually has.
2. **Option (b): an MCP server that pushes a doorbell, hoping Pi renders it.** Measured impossible above: the
   notification reaches `mcp.log` and nothing else. It would look like the shipped adapter and deliver nothing.
3. **Option (c): document the expectation and keep the bus pull-only for host sessions.** The honest zero-surface
   option, and the part of B-115 that **already landed** on 2026-10-05 regardless (the runbook's "What this does
   not promise, second part"). It answers no part of the report, which is legitimate.
4. **Option (d): make the injected turn send-proof, the way `wake` is.** This is the option that *sounds*
   conservative and is actually the one that breaks the requirement: `SEND_PROOF_PROFILES` (`runner/constants.ts`)
   gives a woken turn no shell and no MCP surface precisely so it cannot send. A live session that cannot send
   cannot answer, and "the session answers" is the whole point of `solo-sesion-viva`. It would also be a rule the
   adapter cannot enforce, because the profile belongs to the runner's process launch, not to a turn inside an
   already-running interactive process.

## Decision

**Option (a), with (c) retained as the honest fallback and as documentation already landed.**

1. **The push surface is an extension, not a notification.** The measured answer to "can an MCP server notify
   Pi and have it rendered" is **no**, and that finding is recorded here rather than rediscovered. The Pi
   adapter is therefore a **host-side extension**, and it ships as its own artifact (`channel-pi/`), never
   inside `src/` and never inside any core bundle closure. It is **armed only in a session a person is
   sitting in** — the terminal TUI, or the interactive RPC host (see the amendment of 2026-10-06 and backlog
   B-124).

2. **It is the same doorbell, held by a third consumer.** No new daemon route, no wire change, no new ledger
   table, no new cursor kind. The adapter calls the existing `/channel/doorbell` and a body-less ring is the
   whole of what it may inject: `count`, `senders`, `types`, `threads` and the saturation flag, all already
   fields of the closed doorbell schema, sanitized by the shipped `channel/notify.ts`. **It is a doorbell, not
   a second reader** (ADR-0024): peer prose never enters the extension's response because the daemon never
   reads it, and the injected text is assembled by the adapter, never quoted from anything a peer sent.

3. **The ring is attributable and it triggers a turn.** `pi.sendMessage({ customType: "conmuta-doorbell",
   content, display: true }, { triggerTurn: true, deliverAs: "followUp" })`. `"followUp"` and not `"steer"`:
   a ring waits for the turn in flight instead of derailing the Director's work, and it is harmless when the
   session is idle. The `customType` is load-bearing — it is what keeps a ring from being indistinguishable
   from the human's typing.

4. **The adapter never sends on the bus and never acts for the session.** It has no send path, no `bash`, no
   MCP client of its own: it rings, the session decides. The invariants this keeps are pinned statically, the
   way the F4 adapter's are (`test/security/channel-bundle.test.ts`): no `src/daemon/` member in the closure,
   no `child_process`, no Telegram URL, no `.getUpdates(`, no `.sendMessage(`, `fs` confined to the two
   shipped readers, and a closed timer allow-list.

5. **Ratified, and stated plainly: the turn the ring starts runs with the live session's own tools, so it can
   read the inbox and it can reply.** The Director ratified this on 2026-10-05 as the entire point of
   `solo-sesion-viva` mode — with a session open, that session answers; with none open, nobody answers. It is
   *not* the 2026-10-04 incident and it does not reopen it: that incident was a **headless** turn, started by
   the runner with no human present, that reached around its missing tools with `bash`. Here the turn runs
   inside a process a human opened and is sitting in, and the ring is attributable in the transcript. Option
   (d) is rejected for the reason above: a guardrail that forbids the session to send forbids it to answer.

6. **The bounds are named constants with their reasoning**, the way the ladder's are: one doorbell read in
   flight, a ring cooldown per burst, a per-window ring budget, a bounded shutdown, and a session cursor so a
   backlog larger than one scan rings once and says so rather than ringing per row. Every one of them is a
   constant in this repository's named-constant style, not a literal.

7. **Arming is manual and user-level; the repository writes nothing that executes code on open.** There is no
   installer-written extension entry and no project-level `.pi/extensions/` file: ADR-0031 forbids the
   repository shipping something that executes code when a project is opened, and a project extension would
   be exactly that (it also loads only after project trust, so it could not help before then). The runbook
   mirrors `conmuta-channel`'s: the operator loads the extension by path, deliberately, per machine.

8. **Delivery is best-effort and is documented as such.** `notifications/message` and channel events are
   dropped silently when disabled; so is this ring when the extension is not loaded. Nothing here may be
   documented as a delivery guarantee, and the recurring fetch cadence a project's `AGENTS.md` prescribes
   stays the floor.

## Consequences

- **Positive**: the report is answered by a mechanism the host actually has; the daemon, the ledger, the wire
  and the core are untouched; the shipped doorbell client half is reused, so the new code is the host binding
  and its bounds; the ring is attributable; and the adapter's inability to send is a static property, not a
  promise.
- **Negative / disclosed**: a new artifact with a new trust boundary **inside the host process** — an
  extension "runs with the same operating-system permissions" and "can inspect prompts, tool calls, files,
  credentials, and session history" (Pi's own extension documentation), which is a larger surface than an MCP
  server and is exactly why arming stays manual; the ring costs one model turn per burst, so the cooldown and
  the per-window budget are the reviewable part of the design; a ring injected while a turn is streaming is
  queued rather than immediate, which is intentional and is not a wake guarantee; and the end-to-end
  acceptance test still needs a roster peer (B-114), so the criterion can be owed but never declared.
- **Not promised**: that a session with no conmuta tools loaded can answer a ring it can act on, that a ring
  is delivered while the extension is not armed, or that a woken headless turn gains any capability —
  `SEND_PROOF_PROFILES` is untouched by this ADR. Since the 2026-10-06 amendment the first case is also
  structurally out of reach in the shape that mattered: a non-interactive session is not rung at all.

## Tests that must pin it

| Guarantee | Test |
|---|---|
| Ringing is the only effect: a doorbell event produces exactly one `sendMessage` with `customType` `conmuta-doorbell`, `triggerTurn: true` and `deliverAs: "followUp"` | `test/channel-pi/host.test.ts` |
| The injected content is built only from the doorbell's closed field set and never from peer prose | `test/channel-pi/host.test.ts` (a response carrying a hostile string in a field cannot reach the content verbatim) |
| One read in flight, cooldown and per-window budget hold under a burst and under `saturated` | `test/channel-pi/host.test.ts` |
| A call after the session ended (measured: stale-runtime error) is caught, logged to the adapter's own surface, and never crashes the host | `test/channel-pi/host.test.ts` |
| `session_shutdown` aborts the loop and closes the link, bounded | `test/channel-pi/host.test.ts` |
| A session that is not one a person is sitting in (`rpc` without the interactive marker, `json`, `print`, or no mode) arms no watcher, mints no link and says nothing; a terminal TUI and an interactive RPC host still arm | `test/channel-pi/main.test.ts` |
| The adapter's closure cannot reach `src/daemon/`, `child_process`, `node:sqlite`, the keyring, the Telegram API or a send call, and only the paced loop arms a timer | `test/security/channel-pi-bundle.test.ts` (modeled on `channel-bundle.test.ts`) |
| The `customType` survives into the session as a `custom_message` rather than a plain `user` entry | live probe recorded in the runbook, not a unit test (Pi's runtime is the judge, not this repository) |

### Amendment (2026-10-06) — the ring is armed only in an interactive session

**The defect (measured, backlog [B-124](../06-backlog/CHECKLIST.md)).** The adapter is armed machine-wide
(`~/.pi/agent/settings.json`), so it loads in **every** Pi process, including the child `pi --mode rpc`
processes that a harness uses as subagents. In a bound tree the child was rung at `session_start`: the
transcript `2026-10-06T00-09-38-630Z_01a10e8b…jsonl` shows the injected `custom_message` of type
`conmuta-doorbell` as its own entry, followed by an assistant turn, before the parent ever spoke. The ring
starts a turn, so the parent's `{type:"prompt"}` was then rejected — reproduced this session with the exact
error `Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.` —
and the child failed with zero tool calls. A project-level exclusion (`"extensions": ["-<path>"]`) does not
override the machine-wide inclusion; only the adapter itself can decline.

**What changes.** Decision 1 gains its missing condition: the watcher is armed only for a session a person is
sitting in — the terminal TUI (`ctx.mode === "tui"`), or an interactive RPC host, identified by the host's own
`GENTLE_SHELL_INTERACTIVE_HOST=1` marker. Every other session (`rpc` **without** that marker, `json`, `print`,
or a host that reports no mode at all) arms no watcher, mints no daemon session and prints nothing — a correct
no-op, not a failure. The ring's shape, its transport, its bounds and its inability to send are untouched.

**Why the host's marker, and neither `tui` alone nor "the session has no conmuta tools".** Two measurements
settle it. First, `tui` alone switches the ring off for the *attended* desktop host: Gentle Shell spawns
`pi --mode rpc` and sets `GENTLE_SHELL_INTERACTIVE_HOST=1` on it, and the harness runner **strips that marker
from every subagent child** (`gentle-pi/lib/rpc-host.ts`, `agents-runner.ts` → `withoutInteractiveHost`), so
the marker is exactly the attended-versus-headless discriminator — and reading it mirrors the host's own
`isInteractiveMode` instead of inventing a rule. Second, the tool signal does not exist at the moment the
decision is made: measured on 2026-10-06, `pi.getActiveTools()` at `session_start` lists **no**
`mcp__conmuta__*` even in a full interactive session, because MCP connects asynchronously about four seconds
later, so a tool gate would suppress the live session's watcher entirely. `hasUI` cannot separate the two
either — a `--mode rpc` child reports `hasUI: true`.

**The scope, stated so it is not over-read.** This bounds **this adapter**, not extension loading in general.
A child process that legitimately needs other extensions still gets them; the fix is not "remove all
extensions". Reading `GENTLE_SHELL_INTERACTIVE_HOST` is a string contract with the host ecosystem, not a
dependency on the host's package, and it fails safe: a host that renames the marker declines to arm rather
than ringing a session it cannot classify. The defence-in-depth half — having the harness runner pass
`--no-extensions` (or an equivalent marker) to its children so no extension can interfere at all — is a
separate proposal that lives in `gentle-pi`, another package; it is filed as backlog **B-125** and is not
edited here. Sending `streamingBehavior: "followUp"` from that runner was rejected: it stops the crash, but
the automatic turn it queues is useless (the child has no `conmuta_*` tools) and none of the interference is
removed.
