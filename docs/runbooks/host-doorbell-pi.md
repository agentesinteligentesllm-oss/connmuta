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

## Step 2: verify it is loaded and ringing

Start a session inside a bound tree. The adapter arms itself at `session_start` and says so through the
host's notification surface when something is wrong:

- `pi-host-doorbell: no conmuta.json found above <path>` — the session is not inside a bound tree.
- `pi-host-doorbell: no live daemon run file` (or a handshake failure) — the daemon is not running, or the
  run file is stale. The loop backs off and retries; it does not exit.
- Nothing at all is the healthy case: a quiet bus rings nothing.

To see it work, have a roster peer send a directed message or a broadcast. The session shows a
`custom_message` entry of type `conmuta-doorbell` and **starts a turn** on it; the text names the count,
the senders and the threads, and tells the session to fetch. Bodies are not in the ring — they arrive when
the session calls `conmuta_fetch`.

Identify the adapter's own session on the daemon side by its host label, `pi-host-doorbell`
(`conmuta status`, `conmuta doctor`).

## What the ring does, and how to stop it

The ring starts a turn in **your** session, using that session's own tools — so that session can read the
inbox and answer. That is deliberate and was ratified by the Director on 2026-10-05 as the point of the
bus answering only from a live session. The consequences an operator should hold onto:

- **You can stop it.** Declining or interrupting the turn, or removing the extension, ends it; nothing is
  armed outside the session, and the adapter holds no state that outlives it.
- **One ring per 15 seconds.** A burst that arrives while the session is already awake from a previous
  ring is merged into the next ring rather than queueing another turn. No row is lost: the doorbell's own
  cursor is not the cursor the session's `fetch` uses.
- **It never sends.** The adapter has no send path, no shell and no MCP client of its own; only your
  session can reply, and only through the bus tools.

## Best-effort delivery — not a guarantee

Nothing here may be documented as a delivery guarantee. If the extension is not loaded, its host fails to
resolve a binding, or the daemon is down, the ring is dropped and **no error surfaces on either side**.
Keep whatever recurring `conmuta_fetch` cadence your project's `AGENTS.md` prescribes: this adapter is a
latency improvement on top of it, never a replacement for it.
