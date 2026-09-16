# ADR-0028 — Project-scoped bijective binding: one bot ↔ one group ↔ one project

> **Conmuta** is a working name pending trademark clearance (backlog B-11). The committed project
> file is named after the final product name; `conmuta.json` is used here as the working name.

## Status

`accepted` — accepted by the tribunal (`bus-v2-landing-architecture-001`) and confirmed by the Director on 2026-09-16 (Director note DN-04).

## Date

2026-09-16 (UTC; consensus of the debate below).

## Debate

`bus-v2-landing-architecture-001`, round 1 proposal D2 and D5, round 1 objection n4 (accepted),
round 2 consensus. Record: [../05-tribunal/INDEX.md](../05-tribunal/INDEX.md).

## Context

v1 is single-tenant by construction: one process binds one home, one config, one token, one
`chat_id`, one roster, one state file and one lock
(`telegram-agent-bus/src/index.ts:250-269`). The envelope carries no project or group field
(`src/envelope.ts:33-60`), and the DM plane addresses peers by `@username` with no project context
(`src/transport/direct.ts:42-66`). Multi-project use on one machine therefore has no routing key,
and the threat model marks cross-project leakage on send and on receive as the cardinal sins
(`research[security-isolation]` T01, T02: fetch applies no chat-scope filter, the roster is
machine-global, `BROADCAST` fans out to every roster entry).

The critic named bot topology as the root decision every downstream design branches on
(`critic.top_blockers[0]`, `critic.gaps[0]`).

## Options considered

| Option | Description | Trade-off | Outcome |
|---|---|---|---|
| A — one bot per (human, project) | Bot, group and project form a bijection; the token identifies the binding. | Wire stays `AGENTBUS/2`; DM plane keeps working; registry invariant is a simple uniqueness rule. Cost: N × M BotFather bots, guided by the installer. | **Chosen** |
| B — one bot per human across N groups | The daemon routes group updates by `chat.id`. | The DM plane carries no project context (`src/transport/direct.ts:42-66`), so a DM cannot be attributed to a project without a new wire field — `AGENTBUS/3` and a coordinated freeze — or dropping DMs. Isolation becomes a router bug away from mixing clients. | Rejected |
| Hybrid — A by default, B as a later advanced mode | Suggested by the critic. | Nothing in the decision record schedules it; it would require the B spike (DM private topics, numeric addressing). | Not adopted |

Alpha's verdict on A: "the only mathematically watertight architecture without touching the wire".

## Decision

1. **Bijective binding.** One bot token ↔ one group ↔ one project folder. A bot is a member of
   exactly one group and is never reused across bindings. Registry invariant: one `bot_id` appears in
   at most one active binding.
2. **Send carries no destination.** The daemon derives (bot, group, roster) from the binding fixed
   at MCP-session start and asserts `chat_id === binding.group_id` before every `sendMessage`;
   a mismatch is refused as `WRONG_ROOM` and logged.
3. **Committed project file** `conmuta.json` at the repository root: `schema_version`, `project_id`,
   `group_id` (numeric supergroup id), `roster [{agent_id, user_id, username}]`, optional `referee`
   (`agent_id`). Identifiers only — no local paths, no tokens; strict zod schema; a token-shape
   validator runs in pre-commit and in `doctor`. The machine registry maps `project_id` → my bot
   (token reference) + my `agent_id`.
4. **Launcher isolation by construction.** The thin client requires `--project <id>` and
   cross-checks a cwd walk-up to the nearest `conmuta.json`; it refuses to start when unbound or
   mismatched. Never register the bus globally in OpenCode (its global config overlays every
   project). Global-only tools (Windsurf, Cline, JetBrains AI Assistant) are best-effort and
   documented as such.
5. **Scope check on ingest.** Sender = `message.from.id` verified against the binding's roster;
   chat must be the binding's group or a private chat from a roster member; anything else is counted
   (`foreign_chat` / `unknown_sender`) and dropped — never surfaced, never replied to. No fail-open
   anchors.
6. **Bootstrap.** The daemon keeps a "pending unknown senders" list (`user_id`, `username`, no body)
   so a roster can be completed from observed identities without reading a body first
   (`critic.gaps[5]`).

Roster semantics of [0010](0010-roster-three-roles.md) are unchanged; only their scope moves from
one global file to one file per binding.

## Consequences

- Isolation does not depend on cwd inference, environment variables or a router table; it depends
  on the token, which is the binding (T01 implication).
- N humans × M projects means N × M bots created in BotFather. The installer's "Add bot / Add group /
  Assign project" flow carries that cost; it is the price of not changing the wire.
- Whether a project bot must ever be a group admin depends on Telegram's bot-to-bot visibility
  semantics for non-admin bots — spike B-07, open.
- The tension between v1's "a null anchor fails OPEN by derivation"
  ([0018](0018-receive-side-enforces-sender-invariants.md)) and rule 5 above must be reconciled in the F1 SDD
  spec without a wire change; it is recorded as `inherited-revisit` in the index.
- The distribution of the roster across machines is solved by git: `conmuta.json` is committed.

## Supersedes

- Re-bases the scope of [0010](0010-roster-three-roles.md) (roster per binding).
- Fixes `roster` and `chat_id` as human-authorized boundaries, as v1 already required
  (`research[security-isolation]` T15).

## Tests that must pin it

Per the governing rule of [0012](0012-adversarial-audit-governing-rule.md), each guarantee names a
test that can fail:

| Guarantee | Test |
|---|---|
| A message never reaches another binding's group | **Wrong-room CI test**: two bindings side by side on one daemon; assert zero cross-delivery and a counted `WRONG_ROOM` refusal when the assertion `chat_id === binding.group_id` is violated. Runs in CI on every PR. |
| One `bot_id` in at most one active binding | Registry validation rejects a second active binding for the same `bot_id`. |
| Foreign chats and unknown senders are dropped, never surfaced | Ingest test: update from a chat that is not `binding.group_id` and not a roster private chat is counted `foreign_chat` and never appears in `fetch`; unknown `from.id` is counted `unknown_sender`. |
| `conmuta.json` carries identifiers only | Schema test rejects unknown keys, local paths and any token-shaped string (`\d+:[A-Za-z0-9_-]{35}`, v1 `src/secrets.ts:16`). |
| The launcher refuses when unbound or mismatched | Launcher test: missing `--project`, no `conmuta.json` in the walk-up, or a `project_id` mismatch each exit non-zero before any IPC call. |
| Pending unknown senders carry no body | Test asserts the list stores `user_id` and `username` only. |
