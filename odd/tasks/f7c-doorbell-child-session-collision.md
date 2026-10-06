# ODD task — F7c: the doorbell must ring only a session that can answer

**Backlog row:** B-124 · **ADR:** [ADR-0036](../../docs/03-adr/0036-pi-host-doorbell-adapter.md) (amended 2026-10-06)
**Authorized by:** the Director, 2026-10-06, as a directed defect order (fix, test, ADR amendment and evidence;
RDD on; the native review candidate is the unit commit, not the accumulated branch).

**Objective.** The machine-wide `channel-pi` extension rings **every** Pi process started in a bound tree. A
harness subagent is a child `pi --mode rpc` process: the ring fires at `session_start`, starts an automatic turn
before the parent's task, and the parent's `{type:"prompt"}` is then rejected with *"Agent is already
processing…"*. The child fails with zero tool calls. The fix is that the adapter **arms its doorbell watcher only
in an interactive session** — the session the ring actually serves — never in a programmatic one.

## Measured baseline (2026-10-06, on this machine, read-only unless noted)

| Fact | Evidence |
|---|---|
| The extension is armed machine-wide | `~/.pi/agent/settings.json` → `"extensions": ["…/telegram_bus_agent/dist/channel-pi/main.js"]` |
| A child `pi --mode rpc --tools read,grep,find,bash` started in `FRISCO` (a bound tree) is rung | session `2026-10-06T00-09-38-630Z_01a10e8b…jsonl`: line 4 `message system` (`toolsAdded`: `read,grep,find,bash,subagent_parent_message`), line 5 `custom_message` `conmuta-doorbell`, line 6 the assistant turn hunting for `conmuta_fetch` |
| The same child in a tree with **no** ancestor `conmuta.json` completes its task | Director's control run, recorded in the order |
| The parent's prompt is rejected while the ring's turn runs | reproduced this session: `{"type":"response","command":"prompt","success":false,"error":"Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message."}` — rpc stdin prompt at t+2 s, ring at t+1.2 s (session `…00-40-36-739Z_01a10ea7…jsonl`) |
| Project-level exclusion `"extensions": ["-<path>"]` does **not** override a machine-wide inclusion | Director's measurement, recorded in the order |
| `session_start` carries a meaningful `ctx.mode` | live probe this session: `{"reason":"startup","mode":"rpc","hasUI":true,…}` in `FRISCO` |
| `pi.getActiveTools()` at `session_start` does **not** yet list `mcp__conmuta__*`, even in a full session | live probe: undici full session → `[]` at t0 and t+1.5 s, then `["mcp__conmuta__conmuta_send","…_fetch","…_status","…_thread"]` at t+4 s and t+8 s (MCP connects asynchronously) |
| A restricted child never gains the conmuta tools | same probe with `--tools read,grep,find,bash`: `[]` at t0, t+1.5 s, t+4 s and t+8 s |
| `hasUI` cannot separate the two | the child reports `hasUI: true` (RPC is dialog-capable); only `mode` differs |
| The already-guaranteed shape of the ring | one `.sendMessage(` in the whole closure, body-less content, no send path, no peer prose; `test/channel-pi/host.test.ts` (6) + `test/channel-pi/main.test.ts` (6) + `test/security/channel-pi-bundle.test.ts` |

## Decision

**Gate arming on the host's own run mode: `ctx.mode === "tui"`.** A non-interactive session (`rpc`, `json`,
`print`) arms nothing, creates no daemon session, and says nothing — that is a correct no-op, not a failure. This
is the product principle the adapter already serves (*the bus answers only from a live session*,
[`solo-sesion-viva.md`](./solo-sesion-viva.md)) expressed as a mechanism: a session that cannot be answered from
does not hold the doorbell at all.

**Why `ctx.mode` and not tool presence.** The tool signal does not exist at the moment the decision is made:
measured above, `getActiveTools()` is empty of `mcp__conmuta__*` for the first ~4 s **in an interactive session
too**, because MCP connects after `session_start`. A gate on tool presence at `session_start` would suppress the
live session's watcher entirely (breaking the acceptance criterion), and a gate at delivery time would still ring
a programmatic session that happens to carry the tools. `ctx.mode` is truthful at `session_start` and names
exactly the thing the ring needs: a person sitting in the session.

## Tasks

- [x] **T1 — governance before code.** Done. [ADR-0036](../../docs/03-adr/0036-pi-host-doorbell-adapter.md) amended
  (status note, decision 1, the `Not promised` bullet, a test-table row, and the “Amendment (2026-10-06)” section);
  backlog **B-124** added to `docs/06-backlog/CHECKLIST.md`; `docs/runbooks/host-doorbell-pi.md` states the
  interactive-only arming.
- [x] **T2 — test-first.** Done. Three gate tests (one per programmatic mode) and an interactive-still-arms test
  added to `test/channel-pi/main.test.ts`; **RED observed first** (7 pass / 3 fail against the unmodified source),
  then the named constant `PI_INTERACTIVE_MODE` and the early return; **GREEN 19/19** in
  `test/channel-pi/`.
- [x] **T3 — anti-vacuity (mandatory).** Done. With the finished code, removing only the gate and rebuilding made
  exactly the three `B-124` tests fail (7 pass / 3 fail) while the interactive test kept passing; the gate was
  restored and rebuilt. Output pasted in the PR.
- [x] **T4 — live reproduction, before and after.** Done, with both child session files under
  `odd/tasks/evidence/f7c-doorbell-child-session-collision/`: *before* has the `conmuta-doorbell`
  `custom_message` and the prompt rejected with *“Agent is already processing…”*; *after* has no ring entry and
  the prompt answered `success:true, disposition:started`.
- [x] **T5 — verification.** Done. `npm test` **1952 / 1946 pass / 0 fail / 6 skip** and `npm run test:static`
  **120 / 120**, both exit 0, run by `gentle-ai-verify` in a bound tree with no *“Agent is already processing”*;
  the focused ring/lifecycle/bundle/twin/pack files are green (32/32) and `test/channel-pi/` is 19/19.
- [ ] **T6 — close.** Work-unit commit (Conventional Commit, no AI attribution) on the feature branch; native
  review of that commit; PR with the evidence; three merge gates; bus notice with the merge SHA.

## Out of scope (stated, not silently skipped)

- **No change to `gentle-pi`.** Passing `--no-extensions` (or an env marker) to harness children is a real
  defence-in-depth proposal and it lives in **another package**; this session declares the limit and files it as
  a proposal, and does not edit that package by drive-by. The fix here must stay scoped to the doorbell, so that
  a child that legitimately needs other extensions keeps them.
- **No `streamingBehavior: "followUp"` in `agents-runner.ts`.** That would stop the crash but leave a useless
  automatic turn (the child has no `conmuta_*` tools) and remove none of the interference. It treats the symptom.
- No change to the doorbell transport, the daemon, the wire, the cursor or the ring's shape.
