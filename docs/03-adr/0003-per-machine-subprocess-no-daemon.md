# ADR-0003 — Deployment: per-machine session subprocess, no daemon

| Field | Value |
|---|---|
| Status | superseded — by ADR-0029 |
| Date | 2026-08-14 (original, v0.1.0 design) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-03 |
| Inheritance verdict | REVISIT in `maps[governance-docs]`; resolved by `bus-v2-landing-architecture-001` D3 |
| Superseded by | [ADR-0029](./0029-per-user-daemon-and-thin-clients.md) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

The v1 proposal accepted a session-bound scope: an offline developer's agent is a sleeping teammate. A VPS-hosted always-on process (the proposal's Option B) was out of scope (`openspec/changes/telegram-agent-bus/design.md:59-65`; `openspec/changes/telegram-agent-bus/proposal.md:31,37`). `openspec/config.yaml → rules.design` required this decision to be recorded as an ADR.

## Decision

The bridge is a stdio MCP subprocess owned by the Claude Code session. No VPS, no tmux, no systemd, no daemon.

## Consequences

- The Bot API retains updates for 24 h with no backfill; a machine offline longer loses those messages permanently, on the private inbox exactly as on the group. The design response was detection, not mitigation: `agentbus_fetch` compares `last_fetch_at` against `BOT_API_RETENTION_HOURS` and returns `gap_warning` (`src/tools/fetch.ts:788-794`; `src/config.ts:59`), and `agentbus_status` raises `retention_warning` at 75 % of the window (`src/config.ts:72`; `src/tools/status.ts:146-147`). This is why the v1 `session-catchup` spec made `mem_save` mandatory.
- One process per IDE session is bound at startup to exactly one home, one config, one token, one `agent_id`, one `chat_id`, one roster, one state file and one lock (`src/index.ts:250-269`; `src/config.ts:173-184, 201-207`) — single-tenant by construction (analysis bundle `maps[transport]`).
- The "no daemon" simplicity was cited when the v1 functional audit closed the database option (`docs/functional-audit/06-verdict.md:173-174`).

## Relevance to Conmuta

**Verdict: superseded by ADR-0029.** The tribunal reopened the "daemon" closed item with evidence (verified facts H1-H7 of the DECISION RECORD):

- One bot token admits exactly one `getUpdates` consumer (HTTP 409, newest caller wins); unfetched updates are dropped after 24 h and there is no history read; webhooks need public HTTPS, unrealistic on desktops.
- In v1, cursor advance equals presentation (`src/tools/fetch.ts:500-930`), so two IDE clients on one project collide with `BRIDGE_BUSY` / `body_omitted`; the pull model is the number-one production pain (`maps[governance-docs]`).

D3 lands a **daemon per OS user** as the sole `getUpdates` consumer per token (continuous long-poll <= 50 s, durable inbox) and **thin per-project stdio MCP clients**. The subprocess shape of this ADR survives as the client — it is what makes per-folder MCP binding work — while token, cursor and inbox move to the daemon. D3 also fixes: lazy spawn by the first client (wx lock file + pid + heartbeat, stale ~10 s); optional start-at-login without admin rights (HKCU Run on Windows, LaunchAgent on macOS); idle auto-shutdown disabled while a binding has open threads; and the rule that a client which finds no daemon returns `DAEMON_DOWN` and NEVER polls Telegram itself. IPC and the handshake live in ADR-0029 and the [threat model](../02-architecture/THREAT-MODEL.md); the named-pipe / unix-socket alternative is deferred to spike B-08.

Two things do not change: the daemon is local (the DECISION RECORD lands no hosted or VPS variant in F0-F8), and it is still Invariant 3's single poller — a second daemon instance refuses to poll. The Claude-Code-only host assumption of the original (`design.md:59-65`) is replaced by host-agnostic clients; the honest statement that no verified wake-up contract exists for Cursor, OpenCode, Codex, Gemini CLI or Antigravity is carried in D6 and spike B-09.
