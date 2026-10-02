# thin-client-tools Specification

## Purpose

The four MCP tools (`send`, `fetch`, `status`, `thread`) with v1's input schemas, the cwd walk-up
binding cross-check, client-local error payloads, fence soundness with origin labels, and local
no-network reads (Invariant 1, Invariant 5; CONSTITUTION.md §3 layer 1).

## ADDED Requirements

### Requirement: Four tool input schemas port unchanged

The thin client MUST expose exactly four tools (`agentbus_send`, `agentbus_fetch`,
`agentbus_status`, `agentbus_thread`, prefix per D-09) whose input schemas are v1's
`sendInputSchema`, `fetchInputSchema`, `statusInputSchema` (`{}`), and `threadInputSchema`
unchanged, so hosts see the same tool surface.

#### Scenario: Tool count and shapes are unchanged

- GIVEN the thin client's registered tool list
- WHEN it is compared against v1's four schemas (`src/index.ts:29-42`, `src/tools/send.ts:47-109`)
- THEN the field set and validation rules are identical for all four tools

Traces: ADR-0028 rule 4; OVERVIEW.md §8; exploration.md Q3

### Requirement: Launcher resolves the nearest binding and refuses when unbound or mismatched

The thin client MUST resolve its binding by walking up from its cwd to the nearest `conmuta.json`, and
MUST refuse to start — exiting non-zero before any IPC call — when no such file is found, when the file
it finds is invalid or unreadable, or when an explicitly supplied `--project <id>` disagrees with that
file's `project_id`. An optional `--project <id>` flag is an assertion on that resolution, never a
requirement: omitted, the nearest file fixes the binding on its own. The client MUST NOT infer a binding
from any source other than that file (ADR-0033, amending ADR-0028 rule 4).

A malformed `--project` is a usage error, never an instruction to infer the project: `--project` with no
value, `--project` followed by an empty token, and `--project=` all MUST exit with the usage code before
any binding resolution.

#### Scenario: No conmuta.json in the walk-up exits before any IPC call

- GIVEN a cwd with no `conmuta.json` anywhere in the walk-up
- WHEN the thin client starts, with or without `--project`
- THEN it exits non-zero and makes zero IPC calls

#### Scenario: An omitted --project binds to the nearest ancestor conmuta.json

- GIVEN a cwd nested inside a tree whose bound root holds a valid `conmuta.json`
- WHEN the client starts with no `--project` flag
- THEN it binds to that file's `project_id` and serves that project's tools

#### Scenario: An explicit --project that disagrees is refused

- GIVEN a cwd whose nearest `conmuta.json` has `project_id: "prj-other"` and `--project prj-example`
- WHEN the client starts
- THEN it refuses before any IPC call, with the mismatch exit code that names that situation

#### Scenario: A malformed --project is a usage error

- GIVEN any cwd, and `--project` written with no value, with an empty value token, or as `--project=`
- WHEN the client starts
- THEN it exits with the usage code before resolving any binding

Traces: ADR-0033 (amending ADR-0028 rule 4), row "The launcher resolves the nearest binding and refuses
when unbound or mismatched"; DATA-MODEL.md §1; OVERVIEW.md §8; CONSTITUTION.md §2 inv. 1

### Requirement: DAEMON_DOWN makes zero network calls

When the run file is absent, unreadable, names a dead pid, or the handshake fails, and the bounded
spawn-and-wait also times out, the client MUST return `DAEMON_DOWN` and MUST make zero network
calls of its own — it never calls `getUpdates` or any other Telegram method itself.

#### Scenario: No daemon, zero network calls

- GIVEN no daemon is running and the bounded lazy-spawn wait times out
- WHEN a tool is called
- THEN the client returns `DAEMON_DOWN` and a network recorder attached to the process shows zero
  outbound calls and no `Authorization` header sent

Traces: ADR-0029 row "The client never polls Telegram" (runtime half); PT-26 a/b; WORK-PLAN.md F1
validation criterion; CONSTITUTION.md §2 inv. 3

### Requirement: Client-local error payload constructor

`DAEMON_DOWN`, `WRONG_ROOM`, `UNBOUND_PROJECT` and the handshake-mismatch code MUST be raised by a
client-local constructor mirroring v1's `{code, message, retryable, retry_after_s?, new_chat_id?}`
shape, without the client bundle importing any Telegram-classification module.

#### Scenario: Client-local codes need no Telegram import

- GIVEN the built client bundle
- WHEN it is scanned for a reference to the Telegram error-classification module
- THEN none is found, and `DAEMON_DOWN`/`WRONG_ROOM`/`UNBOUND_PROJECT`/handshake-mismatch payloads
  are still produced with the closed `{code, message, retryable}` shape

Traces: exploration.md Q3; THREAT-MODEL.md §5.6 PT-07; CONSTITUTION.md §3 layer 1

### Requirement: Fence soundness and origin labels

Every surfaced peer body MUST be wrapped in `<UNTRUSTED-PEER-INPUT>...</UNTRUSTED-PEER-INPUT>` with
`<` escaped to `&lt;`, opening and closing the label exactly once with no unescaped `<` inside, and
MUST carry an origin label of `project_id`, `agent_id`, and numeric `user_id` taken from the binding
and the verified sender — never from the envelope's own claim.

#### Scenario: Fence cannot be forged by peer content

- GIVEN a peer body containing the literal text `</UNTRUSTED-PEER-INPUT>`
- WHEN it is surfaced by `fetch` or `thread`
- THEN the wrapped output still opens and closes the label exactly once and contains no unescaped
  `<` between them

#### Scenario: Origin label reflects the verified sender

- GIVEN a surfaced body from a message whose Telegram sender resolves to `@alice-agent` in the
  binding's roster
- WHEN it is presented
- THEN the origin label reads `project_id`, `@alice-agent`, and the numeric `user_id`, regardless
  of what the envelope's own `from` field claimed

Traces: THREAT-MODEL.md T06, PT-13, PT-14; CONSTITUTION.md §2 inv. 5; §3 layer 7

### Requirement: status and thread are local, no-network reads

`agentbus_status` and `agentbus_thread` MUST read only the ledger through the daemon (via IPC) and
MUST make no Telegram call; `status` MUST report daemon uptime, last poll per bot, and binding
identity.

#### Scenario: status makes no Telegram call

- GIVEN a live daemon with an open binding
- WHEN `agentbus_status` is called
- THEN the response includes daemon uptime and last-poll-per-bot, and a network recorder shows no
  Telegram call

Traces: OVERVIEW.md §7.4; CONSTITUTION.md §3 layer 1

## Traceability

| Source | Requirement / Scenario |
|---|---|
| ADR-0033 (amending ADR-0028 rule 4) | Launcher resolves the nearest binding and refuses when unbound or mismatched |
| ADR-0029 row "The client never polls Telegram" | DAEMON_DOWN makes zero network calls (PT-26 a/b) |
| THREAT-MODEL.md PT-07 | Client-local error payload constructor |
| PT-13, PT-14 | Fence soundness and origin labels |
