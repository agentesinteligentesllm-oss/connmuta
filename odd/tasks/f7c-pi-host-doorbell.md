# ODD task — F7c: the Pi host adapter (a doorbell that rings the live session)

**Backlog row:** B-116 · **ADR:** [ADR-0036](../../docs/03-adr/0036-pi-host-doorbell-adapter.md) (`accepted`)
**Authorized by:** the Director, 2026-10-05, from an explicit questionnaire — classification as a new row
under a new phase **F7c**; the minimal design; and the ratification that the ring may start a turn of the
live session that runs with that session's own tools and can therefore reply.

**Objective.** A message a roster agent sends on Telegram — directed to `@luisgtz-agent` or a `BROADCAST` —
reaches the interactive session the Director has open, **without anyone running `fetch` by hand**, and that
session can answer it. Today nothing pushes into a host session ([B-115](./b-115-wake-does-not-reach-a-live-session.md)):
the bus is pull-only for a host.

**Acceptance criterion (measured, never declared).** With the live session open and the Director sitting in
it: a roster agent sends a directed message or a broadcast; **that** session learns of it with no manual
`fetch`; and it can reply. The reply's `audit_log` `send` row carries a **non-null `client_id`** — the payoff
promised in B-114. The proof needs a roster **peer** (AGENTBUS has no private loopback: a test message fans
out to every agent in the group), so if no peer is available the criterion stays **owed and documented**,
exactly as B-114 is.

## Measured baseline (2026-10-05, on this machine, read-only)

| Fact | Evidence |
|---|---|
| Pi does **not** render MCP notifications | `notifications/message` → `~/.pi/agent/mcp.log` only (`dist/extensions/mcp/runtime.js:299,304,307`); live probe: the line `2026-10-05T15:58:23.272Z [conmuta-probe] warning …` appeared in `mcp.log` and **0 times** in the session transcript |
| A Pi extension **can** put a message into the live session and it **starts a turn** | live probe; transcript shows the original turn, the injected entry, and a new assistant turn answering it |
| It must be attributable, or it is indistinguishable from the Director's typing | `sendUserMessage` stores a plain `user` message; `sendMessage` + `customType` stores a `custom_message` entry (probe transcript) |
| `deliverAs` is required only while streaming | `agent-session.js:1812`; `prompt()` at `:1481`; live failure without it: *"Agent is already processing…"* |
| A call after the session ended throws a stale-runtime error and **crashes the host** if unguarded | live probe with `sendMessage` after the print-mode session finished |
| The doorbell already exists and is body-less | `src/daemon/serve/doorbell.ts` — `POST /channel/doorbell`, closed field set, roster-gated, never reads the message-text column (`channel/notify.ts`, [ADR-0024](../../docs/03-adr/0024-channel-doorbell-not-a-second-reader.md)) |
| The client half is already written and tested | `channel/daemon-link.ts` (run file → handshake → `readDoorbell` / `commitCursor` / bounded `close`), `channel/doorbell-loop.ts` (pacing, saturation), two existing consumers (`conmuta-channel`, `conmuta-runner`) |

## Design in one paragraph

A host-side **Pi extension** (`channel-pi/`) started at `session_start`: it resolves the binding, holds the
daemon's existing body-less doorbell, and on an event injects exactly one **attributable, body-less ring** —
`pi.sendMessage({ customType: "conmuta-doorbell", content: <sanitized count/senders/types/threads>, display: true },
{ triggerTurn: true, deliverAs: "followUp" })`. The session wakes, runs its own `conmuta_fetch`, and replies
with `conmuta_send`. The extension never carries peer prose, never acknowledges, never sends, and has no
`bash`. The core is untouched; the ring is a doorbell, not a second reader.

## Tasks

- [ ] **T1 — the host module, test-first.** `channel-pi/host.ts`: `createPiDoorbellAdapter(deps)` over injected
  `{ pi, link, now }`, returning the `session_start` / `session_shutdown` handlers. RED first: the fake `pi`
  records `sendMessage` calls. Pins the ring's exact shape (`customType`, `triggerTurn`, `deliverAs`), that the
  content comes only from the closed doorbell field set, the cooldown / one-in-flight / per-window budget
  constants, the guarded call after the session ended, and the bounded shutdown.
- [ ] **T2 — the extension entry.** `channel-pi/main.ts`: the default export factory that wires the real link
  (`createDaemonLink`) and a `DoorbellWatcher` to `host.ts`. No watcher or timer in the factory (Pi's own
  extension rule); resources start at `session_start`, end at `session_shutdown`. `channel-pi/tsconfig.json`
  mirroring `channel/tsconfig.json`.
- [ ] **T3 — the bundle-closure pin.** `test/security/channel-pi-bundle.test.ts`, modeled on
  `channel-bundle.test.ts`: non-vacuous closure with sentinels; no `src/daemon/`, `child_process`, `node:sqlite`,
  keyring, Telegram URL, `.getUpdates(`, `.sendMessage(`; `fs` confined to the two shipped readers; a closed
  timer allow-list; every rule seeded with a negative.
- [ ] **T4 — packaging and the runbook.** `package.json` `files` entry for `dist/channel-pi/**` (no new `bin`:
  this artifact is loaded by the host, not executed as a command); `docs/runbooks/host-doorbell-pi.md` with the
  manual, user-level arming steps, the best-effort delivery note, and the "a ring is not a delivery guarantee"
  bound.
- [ ] **T5 — docs reconciliation.** `docs/02-architecture/OVERVIEW.md`'s Wake-up row stops saying host wake-up
  is pull-only *without qualification*; `docs/03-adr/0036-*.md` moves to `accepted` on the Director's word;
  `docs/00-INDEX.md` and `docs/06-backlog/CHECKLIST.md` carry B-116.
- [ ] **T6 — the live end-to-end (owed, needs a peer).** Step A of
  [`solo-sesion-viva.md`](./solo-sesion-viva.md) §OWED, with the ring replacing the manual `fetch`: the raw
  transcript showing the ring entry and the automatic turn, and the `audit_log` `send` row with a non-null
  `client_id`. **Blocked on a roster peer**, like B-114.

## Out of scope (stated, not silently skipped)

- No ladder change: arming the despertador stays a human action (CONSTITUTION §3.1, ADR-0032 R4).
- No core change and no daemon route: the beacon and the ring consume what F4 shipped.
- No installer-written entry: ADR-0031 forbids shipping something that executes code when a project opens.
- No send-proof profile for the ring, and no claim that the ring reaches a session with no conmuta tools
  loaded (ADR-0036, option (d) rejected with its reason).
