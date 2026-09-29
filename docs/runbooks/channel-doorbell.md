# Runbook: arming the Claude Code channel adapter (`conmuta-channel`)

Audience: an operator who wants to manually arm the `conmuta-channel` adapter for Claude Code
against a project already bound to a running conmuta daemon. This is a step-by-step operational
guide, not a design document — see
[ADR-0024](../03-adr/0024-channel-doorbell-not-a-second-reader.md) and
[ADR-0025](../03-adr/0025-peek-saturation-and-watermark-commits-last.md) for the semantics behind
this adapter, and the `f4-claude-channels-adapter` design for its shipped shape.

`conmuta-channel` is a doorbell, not a second reader (ADR-0024): it tells an armed Claude Code
session that new traffic is waiting and sends it to `agentbus_fetch` for the actual content. It
never carries peer text itself, never acknowledges delivery, and never starts a daemon of its own —
it needs a conmuta daemon already running and already bound to the project you name. Arming it is
entirely manual: nothing in this repository auto-registers or auto-loads it for you, and this guide
covers only that manual configuration, not the daemon's own lifecycle.

## Before you begin

1. **Have a running conmuta daemon already bound to the project you want to arm.** `conmuta-channel`
   never starts one — if the daemon isn't up and bound, the adapter has nothing to read from.
2. **Know your project's id**, the value you will pass as `--project`.
3. **Confirm your Claude Code access is eligible for channels.** As of this writing the feature is a
   research preview: it requires Anthropic auth via claude.ai or a Console API key, and it is not
   available on Amazon Bedrock, Google Cloud Agent Platform, or Microsoft Foundry.
4. **If you're in a Team or Enterprise organization, confirm with your admin that the
   `channelsEnabled` managed setting is turned on.** Until an admin explicitly enables it, no user in
   the org can receive channel events at all — and, as with every other failure mode in this guide,
   that failure is silent, so don't assume a config mistake if nothing happens.

## Step 1: know the binary's invocation form

`conmuta-channel` is invoked as:

```sh
conmuta-channel --project <id>
```

or, equivalently:

```sh
conmuta-channel --project=<id>
```

You will not normally run this yourself on the command line — Claude Code launches it for you once
it's registered as an MCP server, which is step 2. This section just documents the form that
registration wraps.

## Step 2: register `conmuta-channel` as an MCP server

Register it under `mcpServers`, either at the project level or the user level.

**Project-level** (`.mcp.json` at the project root; the command path is relative to the project
root):

```json
{
  "mcpServers": {
    "conmuta-channel": {
      "command": "conmuta-channel",
      "args": ["--project", "<id>"]
    }
  }
}
```

**User-level** (`~/.claude.json`; the command path must be absolute):

```json
{
  "mcpServers": {
    "conmuta-channel": {
      "command": "/abs/path/to/conmuta-channel",
      "args": ["--project", "<id>"]
    }
  }
}
```

Registering the server here makes Claude Code aware of it. It does not, by itself, arm it as a
channel for a session — that's step 3.

## Step 3: arm the channel for a session

`conmuta-channel` is a bare custom/local MCP server, not an installed marketplace plugin, so during
the research preview the plain `--channels` flag's Anthropic-maintained allowlist does not cover it.
Arm it explicitly with the `server:<name>` form, where `<name>` matches the key you used under
`mcpServers` in step 2:

```sh
claude --dangerously-load-development-channels server:conmuta-channel
```

The first time you do this, expect two separate dialogs, and accept both:

1. A one-time full-screen confirmation ("I am using this for local development").
2. The normal "New MCP server found in this project" MCP consent dialog.

If either is declined, the channel is not armed for that session.

## Step 4: verify the server connected

Inside the running session, run:

```
/mcp
```

and confirm `conmuta-channel` is listed as connected.

Alternatively, restart with debug logging and inspect the log:

```sh
claude --debug --dangerously-load-development-channels server:conmuta-channel
```

## Best-effort delivery — not a guarantee

Claude Code channels are a research preview; delivery is best-effort and silently dropped when
disabled. Nothing here may be documented as a delivery guarantee.

Concretely: Claude Code does not acknowledge channel notifications. If the session hasn't loaded
`conmuta-channel` as a channel — the flag was omitted, either dialog in step 3 was declined, or the
organization's `channelsEnabled` policy is off or unset — events are dropped silently. No error
surfaces anywhere, on either side; the operator has no way to detect a drop from the conmuta side or
from Claude Code's side. Keep whatever recurring `agentbus_fetch` cadence you already rely on — this
adapter is a latency improvement on top of it, never a replacement for it.

## Sources

- <https://code.claude.com/docs/en/channels.md>
- <https://code.claude.com/docs/en/channels-reference>

Accessed 2026-09-29.
