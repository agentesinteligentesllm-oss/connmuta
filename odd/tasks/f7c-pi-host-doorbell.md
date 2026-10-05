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

- [x] **T1 — the host module, test-first.** Done. `channel-pi/constants.ts` (`PI_DOORBELL_HOST_LABEL`,
  `PI_DOORBELL_CUSTOM_TYPE`, `PI_RING_COOLDOWN_MS`) and `channel-pi/host.ts` (`PiMessenger`,
  `createPiRinger`). RED observed first (the stub rang nothing, so 4 of 6 assertions failed), then GREEN
  6/6 in `test/channel-pi/host.test.ts`: the exact message/options shape, the content being the
  notification's own text, the cooldown merging instead of queueing, a host failure propagating, and a
  failed ring not starting the cooldown.
- [x] **T2 — the extension entry.** Done. `channel-pi/main.ts` (the default-export factory: binding from the
  nearest ancestor `conmuta.json`, link, `DoorbellWatcher` with `createPiRinger` as `deliver`, loop under an
  `AbortController`, idempotent `session_shutdown` that aborts and closes), plus `channel-pi/tsconfig.json`
  and the root `tsconfig.json` reference. No host package is imported: the two host types are declared
  structurally and locally, so `tsc -b` has no new dependency to resolve.
- [x] **T3 — the bundle-closure pin.** Done. `test/security/channel-pi-bundle.test.ts`, 19 tests, all green:
  closure non-vacuous (18 files, floor 14, sentinels incl. `src/shared/roster-hash.js`), no `src/daemon/`,
  `child_process`, `node:sqlite`, keyring, Telegram URL, `.getUpdates(`; `fs` confined to the two shipped
  readers; a closed timer allow-list; no `node:timers`; bare specifiers reduced to
  `node:crypto,node:fs,node:os,node:path,zod`; and the adapted send rule — **the ring is the only
  `.sendMessage(` call site in the closure, exactly one call, in `channel-pi/host.js`**. Every rule seeded.
- [x] **T4 — packaging and the runbook.** Done. `package.json` `files` gained `dist/channel-pi/**` (no bin);
  `test/security/pack.test.ts` gained the whitelist entry plus a packed-entry assertion for
  `dist/channel-pi/main.js`, which is the only thing that would surface a wrong glob because this artifact
  has no bin. Runbook `docs/runbooks/host-doorbell-pi.md` (manual, user-level arming; how to verify; what the
  ring does and how to stop it; best-effort delivery). `docs/02-architecture/OVERVIEW.md`'s Wake-up row no
  longer calls host wake-up pull-only without qualification.
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
