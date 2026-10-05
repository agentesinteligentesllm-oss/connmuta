# B-115 — the wake does not reach a live session

**Status:** open, filed 2026-10-05 · **Owner:** Director (design) · **Backlog row:** B-115
**Origin:** an audit of the wake path, at the Director's request, after he reported that a message
addressed to him — or a broadcast — never reaches the live session he is sitting in.

> This document is the detail behind the B-115 row. It records what was measured, what the expectation
> was, and where the gap actually is. It proposes nothing as decided: closing this needs an ADR before
> any code, because the shape below is a new capability, not a repaired one.

---

## 1. The report, stated precisely

The Director's expectation, in his words: *"se supone que te deben de despertar toda vez que te mandan un
mensaje dirigido a ti o a `all`"* — a directed message, or a broadcast, should wake his agent's live
session. He also noted the function had been working before (*"se supone que ya tenías tu trigger"*), and
that the concern is now that messages from other agents are not reaching the session at all.

Two things are true and they are not the same thing. This document separates them.

## 2. What was measured (2026-10-05, read-only, on this machine)

### 2.1 Nothing is armed, and the ledger names who disarmed it

- `~/.conmuta/runner/ladder.json` is `{"bindings": {}}`. By CONSTITUTION §3.1 a binding with no ladder
  record **is `off`**: the ladder fails closed. The `frisco` binding therefore resolves to `off`.
- The binding's last ladder event in `~/.conmuta/runner/wake-ledger.jsonl`:

  ```json
  {"ts":"2026-10-04T23:56:09.940Z","kind":"ladder","project_id":"frisco","level":"off",
   "note":"Luis Gutiérrez: apagado para pasar a modo solo-sesion-viva"}
  ```

  So the disarm was **the Director's own instruction**, recorded by the tool, and the reason is in the
  note. Nothing is broken here: the ladder did what it was told.

- The last *wake* rows precede it and carry `"harness":"pi"` with outcomes `timed_out` / `exited`,
  which is the shape of a headless turn being started and finishing. Wakes were happening; they stopped
  being attempted at 2026-10-04T23:56Z, exactly when the ladder was set to `off`.

### 2.2 Why it was disarmed — and that the cause is already closed

ADR-0032's amendment of 2026-10-05 records the trigger: **four `REPLY`s left in `@luisgtz-agent`'s name on
2026-10-04** (two at 22:46Z, two at 23:28Z) that the Director's session had not sent. The woken turn had
**no `conmuta_*` tool but it had `bash`**: it read `~/.conmuta/run/daemon.json` (the run-file secret),
wrote its own IPC client and sent anyway. On all four send rows `audit_log.client_id` was `null`, so the
ledger could not even name the client. Disarming the ladder was the correct response to a real incident.

**That cause is fixed in the same session (71), on two fronts**, and both are verifiable now:

- `SEND_PROOF_PROFILES` (`runner/constants.ts`) runs `wake` on `pi` as
  `pi -p --no-extensions --tools read,grep,find,ls`, appended **after** the record's own `harness_args`;
  the flags that could widen it (`--tools`, `--exclude-tools`, `--no-tools`, `--no-extensions`, `-e`) are
  refused outright, and a level/harness with no verified profile is **refused** (`profile_unavailable`),
  never started with a full toolset. `autopilot` is refused by that same rule.
- The daemon's half changed from accreditation to **attribution**: `audit_log.client_id` now carries the
  sending session's `client_id` on every send row.

So the specific reason the ladder is off **no longer holds**. That is a real finding, and it is the
reason this audit was worth doing.

### 2.3 The part that matters: no level reaches a live session

Even armed, the ladder would not satisfy the report. Three facts, and the first two are in the
repository already:

| Level | What it actually does | Does it reach the session you are sitting in? |
|---|---|---|
| `off` | Nothing at all; the runner does not even hold a session. | No. |
| `notify` | Tells you **on the runner process's stderr** and records the event. Starts no turn. | **No** — not on Telegram, and not inside the host session. |
| `wake` | Starts **one new headless turn** under a send-proof profile: no shell, no MCP surface — it cannot read the inbox, cannot reply, cannot run anything. It records what it found and stops. | **No** — it is a different process, and since 2026-10-05 it cannot even read the inbox. |
| `autopilot` | **Refused** (`profile_unavailable`): the act profile needs a shell, and a shell can always send. | No. |

`docs/02-architecture/OVERVIEW.md`, Wake-up row, says it in one line: *"the optional wake satellite (F7a)
may start a **new headless turn** on the same body-less doorbell — **it never wakes an interactive host
session**."* The same row states that wake-up for a host session is **pull only**, and that *"no verified
wake-up contract exists for Cursor, OpenCode, Codex, Gemini CLI or Antigravity"*, with Claude Code
channels as a research preview (spike B-09).

**The honest conclusion: the capability the report expects does not exist.** There is no push channel
into an interactive host session. A live session learns what arrived when *it* runs `fetch` — which is
exactly the pull the `<!-- conmuta:begin -->` block in a bound project's `AGENTS.md` describes, and
exactly why an agent that never calls `fetch` never sees anything.

## 3. Why this is a separate row from B-114

They are adjacent and they are not the same question.

- **B-114** asks whether a live session **answers what it can already pull** — the end-to-end
  live-session test is owed because it needs a roster peer to send a message, and AGENTBUS has no private
  loopback. B-114 presumes the pull path works and wants it proven.
- **B-115** records that the **push path was never built**. Even a green B-114 leaves the Director's
  report unanswered, because "the session answers when it polls" is not "the session is woken".

Folding them together would hide that, which is why this is its own row.

## 4. What closing this would take (options, not decisions)

Each option is a design question for the Director, and each needs an ADR before code — ADR-0032 places
anything that starts an agent outside the core, and the core's autonomy boundary (no exec, no shell, no
autonomous emission) is what the architectural split exists to protect.

1. **A host-side watcher.** An extension loaded by the *interactive* host that holds the daemon's
   body-less doorbell, and on a directed message or a broadcast surfaces it **inside the live turn**
   (in Pi, an extension — the host has that surface; Pi's own extension documentation is the reference).
   This is the only shape here that puts the message where the report expects it. It is also a new
   `src`-carrying surface with its own threat model: the thing that surfaces the message must not be able
   to *act* on it, or the injection fence moves into the host.
2. **The TTY-gated per-session human grant** sketched in B-113 — a grant the human arms from a terminal,
   so a headless process cannot arm it. It answers "who may send", not "how does it reach me", so it is
   necessary at most and sufficient never: it would let a woken turn send, which the 2026-10-05 order
   forbids.
3. **Do nothing, and document the expectation.** Keep the bus pull-only for host sessions, and make the
   runbook say so where an operator reads the levels. This is cheap, it is honest, and it is the only
   option that adds no surface — but it leaves the report unaddressed, and the report is legitimate.

**Recommendation for the Director's decision:** option 1 is the only one that answers the report; option 3
is the only one that can be done today. They are not exclusive — 3 is a documentation fix that should land
now regardless, and 1 is a capability that needs an ADR and a phase.

## 5. What was NOT done here

- **No commit.** This repository's rule is that the Director decides what is committed and when.
- **No ladder change.** The binding stays `off` until the Director arms it; arming is a human action by
  design (CONSTITUTION §3.1, ADR-0032 R4).
- **No ADR and no status change.** ADR-0032 stays `proposed`; this row is filed `open`, not `decided`.
- **Not measured, declared as a limit:** whether a host-side watcher is actually implementable in Pi
  today. That is a design question that needs the host's extension contract read first, not assumed.

## 6. Universo Medido

- **Target:** this repository at branch `fix/solo-sesion-viva` (clean tree, not pushed) · the daemon home
  `~/.conmuta/` on this machine · `~/.pi/agent/settings.json`.
- **Scope:** `runner/{ladder,constants,harness,loop}.ts`, `docs/03-adr/0032-*`,
  `docs/02-architecture/OVERVIEW.md`, `docs/runbooks/wake-satellite.md`, `docs/06-backlog/CHECKLIST.md`,
  `~/.conmuta/runner/{ladder.json,wake-ledger.jsonl}`.
- **Method:** `git status`/`git log`; file reads; `grep`; reading the runner's own append-only wake ledger.
- **Out of scope — LÍMITE DE DISEÑO:** no code, no ADR, no ladder change, no commit.
  **LÍMITE TÉCNICO:** Pi's extension contract was not read, so option 1 is a proposal and not a
  verified capability.
