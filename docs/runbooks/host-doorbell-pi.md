# Runbook: arming the Pi host adapter (`channel-pi`)

Audience: an operator who wants the **interactive Pi session they are sitting in** to learn about new bus
traffic without running `fetch` by hand. This is a step-by-step operational guide, not a design document —
see [ADR-0036](../03-adr/0036-pi-host-doorbell-adapter.md) for the decision and its boundaries, and
[ADR-0024](../03-adr/0024-channel-doorbell-not-a-second-reader.md) for the doorbell contract it shares
with the Claude Code adapter.

`channel-pi` is a **doorbell, not a second reader**: it tells the live session that traffic is waiting and
the session then calls `conmuta_fetch` for the content. It never carries peer text, never acknowledges
delivery, and never starts a daemon of its own — it needs a conmuta daemon already running and already
bound to the project the session sits in.

**Why this is not `conmuta-channel`.** Claude Code has a `claude/channel` capability an MCP server can
push into; **Pi does not**. Measured on 2026-10-05: Pi's MCP runtime handles exactly three notifications,
and `notifications/message` is appended to `~/.pi/agent/mcp.log` — it appears nowhere in the session. So on
Pi the doorbell is held by a **host extension** instead, which is why arming looks different here.

## Before you begin

1. **Have a running conmuta daemon already bound to the project.** `channel-pi` never starts one: no
   daemon means no run file, and the adapter says so once and stops.
2. **Know the project's `conmuta.json`.** Nothing is passed on a command line: like the thin client, the
   adapter resolves the binding from the nearest ancestor `conmuta.json` above the session's working
   directory ([ADR-0033](../03-adr/0033-project-flag-as-assertion.md)).
3. **Know where the built extension is.** In this repository it is `dist/channel-pi/main.js` after
   `npm run build`. Published, it arrives with the package under the same relative path.
4. **Have the bus MCP tools in the session you want rung.** The ring starts a turn *in your session*, and
   that turn can only fetch if `conmuta_*` is there: `pi mcp list` in that cwd must show
   `conmuta: connected, 4 tools`. The recommended registration is **one id-free entry at the user level**
   ([ADR-0033](../03-adr/0033-project-flag-as-assertion.md), [ADR-0034](../03-adr/0034-id-free-installer-entry.md));
   a project-level entry of the same name **replaces** it, which is how a session in a subfolder, or a
   headless run with nobody to answer a trust prompt, loses the tools while another cwd keeps them
   (**B-131**).

## Step 1: load the extension

`channel-pi` has **no `bin` and no installer entry on purpose**. The repository ships nothing that
executes code when a project is opened ([ADR-0031](../03-adr/0031-npm-distribution-and-license.md)), and a
project-level extension would be exactly that. Arming is manual and per machine:

```sh
pi --extension /abs/path/to/dist/channel-pi/main.js
```

To arm it for every session on this machine instead, drop a file into the user-level extensions directory
(`~/.pi/agent/extensions/`) whose default export re-exports the built entry, or point Pi at the built path
there. Do not place it in a project's own extensions directory: it would only load after project trust,
which is later than useful, and it is the thing ADR-0031 forbids shipping.

**Machine-wide arming costs one line per unbound session.** With every session armed, a session started
outside any bound tree reports `no conmuta.json found above <path>` once, at start, and arms nothing. That
is deliberate — an adapter that stayed silent when it could not bind would be indistinguishable from one
that bound and found nothing — so arm machine-wide only if that single line in unrelated trees is
acceptable. Arming per session with `--extension` avoids it entirely.

**A programmatic session is never rung.** The adapter arms only for a session a person is sitting in: the
terminal TUI, or the interactive desktop host (the app spawns `pi --mode rpc` with
`GENTLE_SHELL_INTERACTIVE_HOST=1`, and the harness strips that marker from every subagent child). A headless
child a harness starts as `pi --mode rpc` (no marker), a `--mode json` or `--print` run, and any other
programmatic session load the extension but arm nothing, mint no daemon session and print nothing. That is
what keeps a machine-wide arming from injecting an automatic turn into a subagent — which would make the
parent's task prompt be rejected with *"Agent is already processing…"* — and it is the point of the adapter:
the doorbell wakes the session **you are sitting in**, and a session no one is sitting in is not woken
([ADR-0036](../03-adr/0036-pi-host-doorbell-adapter.md) amendment of 2026-10-06).

## Step 2: verify it is loaded and ringing

Start a session inside a bound tree. The adapter arms itself at `session_start` and says so through the
host's notification surface when something is wrong:

- `pi-host-doorbell: no conmuta.json found above <path>` — the session is not inside a bound tree.
- `pi-host-doorbell: no live daemon run file` (or a handshake failure) — the daemon is not running, or the
  run file is stale. The loop backs off and retries; it does not exit.
- Nothing at all is the healthy case: a quiet bus rings nothing.
- **A ring arrives and the session carries no `conmuta_*` tools** — the ring is fired on doorbell traffic,
  never on the read path's availability, so a session without the bus MCP cannot act on it: check
  `pi mcp list` in that cwd before suspecting the adapter. Filed as **B-130**.

To see it work, have a roster peer send a directed message or a broadcast. The session shows a
`custom_message` entry of type `conmuta-doorbell` and **starts a turn** on it; the text names the count,
the senders and the threads, and tells the session to fetch. Bodies are not in the ring — they arrive when
the session calls `conmuta_fetch`.

Identify the adapter's own session on the daemon side by its host label, `pi-host-doorbell` — the label it
mints its daemon session with (`channel-pi/constants.ts`). **No CLI verb prints the session list in this
build**: `conmuta status` and `conmuta doctor` are named in earlier drafts of this page but neither is wired
(`doctor`'s verb dispatch is a disclosed deferral, `src/cli/main.ts`), so the followable location is the row
itself — the daemon ledger's `client_cursors` table, column `host`.

## What the ring does, and how to stop it

The ring starts a turn in **your** session, using that session's own tools — so that session can read the
inbox and answer. That is deliberate and was ratified by the Director on 2026-10-05 as the point of the
bus answering only from a live session. The consequences an operator should hold onto:

- **You can stop it.** Declining or interrupting the turn, or removing the extension, ends it; nothing is
  armed outside the session, and the adapter holds no state that outlives it.
- **One ring per 15 seconds, and no more than 20 rings an hour.** A burst that arrives while the session is
  already awake from a previous ring is merged into the next ring rather than queueing another turn. No row is
  lost: the doorbell's own cursor is not the cursor the session's `fetch` uses.
- **The cooldown is a rate limit; the budget is the cap.** The cooldown bounds how *often* a ring may fire —
  up to four times a minute under steady traffic — while `PI_RING_BUDGET_PER_WINDOW` (20) per
  `PI_RING_BUDGET_WINDOW_MS` (one hour) bounds how *many* fire. Every ring is a model turn, so the cap is what
  turns a busy afternoon, a peer storm or a loop into a bounded cost; twenty an hour is a **ceiling, not a
  target**, and it is the number to revisit with measurements.
- **A budget-suppressed ring is quiet, not broken — and it says so once.** When the window's cap is spent, the
  ring resolves without starting a turn, exactly as a cooldown merge does: it is not a delivery failure, it is
  not retried, and no row is lost (the same cursor split below). Because a session that has quietly stopped
  ringing and a bus with nothing on it look identical from inside the session, the adapter reports the spent
  budget **once per session** through the session's own UI, and rings resume as the window refills.
- **It never sends.** The adapter has no send path, no shell and no MCP client of its own; only your
  session can reply, and only through the bus tools.

## Best-effort delivery: the message is guaranteed, the nudge is not

The ring is **best-effort**, and that is a decided disposition rather than an open question
([ADR-0038](../03-adr/0038-a-ring-is-best-effort.md), option (b), confirmed 2026-10-07). What makes that
bound acceptable is a **cursor split**, not a retry:

- **The message is guaranteed.** The doorbell cursor this adapter advances is its own daemon session's
  cursor (`pi-host-doorbell`), never the cursor your session's `conmuta_fetch` reads. A ring that resolves
  without being delivered consumes nothing: the row is still there on the session's next fetch. This is the
  property the decision rests on, and it is **pinned by a test** rather than asserted here.
- **The nudge is best-effort.** If the extension is not loaded, its host fails to resolve a binding, the
  daemon is down, or the host's own runtime swallows the delivery, the ring is dropped and **no error
  surfaces on either side**.
- **The half that can be detected is retried.** A ring attempted against a stale context throws
  synchronously; the throw reaches the watcher, which records `deliver_failed` and does **not** advance the
  cursor, so the same window is read again. That is the only failure this adapter can see. A ring merged by
  the cooldown is not a failure: it resolves, so the cursor does advance — and a ring the **budget** suppresses
  behaves the same way, resolving without a turn and reporting the spent budget once.

[ADR-0038](../03-adr/0038-a-ring-is-best-effort.md) names the four tests that pin this, including the one
that carries the decision. Keep whatever recurring `conmuta_fetch` cadence your project's `AGENTS.md`
prescribes: this adapter is a latency improvement on top of it, never a replacement for it.
