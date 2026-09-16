# Proposal: F1 — Daemon, registry, thin client, migration

| Field | Value |
|---|---|
| Change | `f1-daemon-registry-thin-client` |
| Status | proposed — pre-proposal handoff confirmed 2026-09-16; research lane unselected by the Director |
| Implements | [ADR-0028](../../../docs/03-adr/0028-project-scoped-bijective-binding.md), [ADR-0029](../../../docs/03-adr/0029-per-user-daemon-and-thin-clients.md), [ADR-0030](../../../docs/03-adr/0030-sqlite-ledger-and-json-registry.md) in full; the packaging part of [ADR-0031](../../../docs/03-adr/0031-npm-distribution-and-license.md) |
| Scope authority | [WORK-PLAN.md](../../../docs/07-plan/WORK-PLAN.md) section F1; backlog B-13, B-15, B-18 |
| Inputs | [exploration.md](./exploration.md) (Engram `sdd/f1-daemon-registry-thin-client/explore`); tribunal `bus-v2-landing-architecture-001` (CONSENSUS); Director notes DN-01..DN-03 |
| Binding rules | Strict TDD from the first commit; PRs <= 400 lines, auto-chained; artifacts in English; no v1 production identifiers anywhere |

## Intent

Conmuta is at F0: 45 documents, zero source code. v1 (`telegram-agent-bus` at `bf8f365`, frozen) is single-tenant by construction: one IDE process owns one token, one chat and one cursor. Two clients on one project collide (`BRIDGE_BUSY` / `body_omitted`), a gap over 24 h loses traffic, the token rides the IDE environment and every request URL, and a foreign chat is ingested whenever its sender is rostered.

F1 builds the passive switch the tribunal landed: one daemon per OS user as the sole `getUpdates` consumer, a durable `node:sqlite` inbox served through per-client cursors, a human-editable registry, tokens in the OS secret store, and a thin stdio client bound to exactly one project. Every later phase (F2–F8) depends on it.

Success is WORK-PLAN F1 validation: every "Tests that must pin it" row of ADR-0028/0029/0030 green, static assertions over both built bundles, a v1 fixture that migrates with `.bak` siblings and a synthesized registry, and a `DAEMON_DOWN` path that makes zero network calls.

## Scope

### In scope

| # | Deliverable | Content | Source |
|---|---|---|---|
| 1 | Package scaffold | TypeScript ESM, `node:test`, compiled `dist`, `files` whitelist, `npm-shrinkwrap.json`, no lifecycle scripts, `engines.node >=24.15`, CI on `windows-latest`; runtime deps limited to `@modelcontextprotocol/sdk`, `zod`, `@napi-rs/keyring` | ADR-0031 packaging; D-03 |
| 2 | Named constants | Every numeric value named with its reasoning; DATA-MODEL §7 values confirmed or changed with a reason | CONSTITUTION §5 |
| 3 | `conmuta.json` schema + token-shape validator (B-18) | Strict zod, identifiers only; validator reusable by pre-commit (opt-in `core.hooksPath`, no `prepare` script) and by `doctor` in F2 | ADR-0028 rule 3 |
| 4 | Registry | `~/.conmuta/registry.json`, strict schema, invariants R1–R6, hot-reload, `registry_invalid` keeps the last good registry | ADR-0030 rule 1 |
| 5 | Ledger | `node:sqlite` WAL: `offsets`, `updates`, `threads` + `thread_history`, `needs_action`, `client_cursors` + `client_surfaced`, `audit_log`, `unknown_senders`; `PRAGMA user_version` forward-only migrations; quarantine on corruption or future version | ADR-0030 rules 2, 4, 5 |
| 6 | Secret store (B-15) | Keyring under `bot:<bot_id>`, ACL'd-file fallback, read/write API; win-x64 round trip | ADR-0030 rule 3 |
| 7 | Daemon lifecycle | Singleton `wx` lock + pid + heartbeat, stale reclaim, idle shutdown disabled while any binding has open threads, Node-floor gate before any disk write, per-boot run file | ADR-0029 rules 1–2 |
| 8 | Poller + admission | One long-poll loop per active binding (<= 50 s), write-ahead transaction, seven-step admission with the new chat-scope check, pending unknown senders, 429/409 surfaced without blind retry | ADR-0029 rule 1; OVERVIEW §7.2 |
| 9 | Send path | No destination input; `from` and `to_user_id` stamped from the binding; v1 validation pipeline + secret backstop; `chat_id === binding.group_id` else `WRONG_ROOM`; one `DualWriteTransport` per binding | ADR-0028 rule 2 |
| 10 | IPC | Loopback HTTP on `127.0.0.1`, random port, ACL'd `{port, pid, secret}`, nonce -> HMAC-SHA256 before any bearer, per-boot rotation, `POST /session` freezes the binding, endpoints for the four tools | ADR-0029 rule 3 |
| 11 | Thin client | `conmuta mcp --project <id>`: four tools with v1 input schemas, cwd walk-up cross-check, client-local error payloads (`DAEMON_DOWN`, `WRONG_ROOM`, `UNBOUND_PROJECT`, handshake-mismatch code), lazy spawn per D-01, fence + origin labels, per-client surfaced state | ADR-0028 rule 4; ADR-0029 rule 4 |
| 12 | Static security assertions | Client bundle (v1 set + PT-07 + the D-01 multi-clause spawn assertion), daemon bundle (PT-28 allow-lists), non-vacuous scan; two-binding wrong-room CI job | CONSTITUTION §3 |
| 13 | v1 migration (B-13) | Reads `~/.agentbus/{config,state}.json`, writes `*.bak-pre-v2-<date>` siblings, synthesizes registry + secret-store entry + ledger rows; never modifies or deletes v1 files; minimal non-interactive CLI entry; runbook page stating the >24 h cursor gap and the one-poller rule | ADR-0030 consequences |
| 14 | v1 pure modules as a library (D1) | Reuse verdicts per exploration Q1: AS-IS modules copied verbatim with a provenance header; SEAM modules adapted with the change named in the header; REPLACED modules not copied | D1 |
| 15 | Documentation in the same change | DATA-MODEL fields finalized; THREAT-MODEL §4 real test file names; CHECKLIST B-13/B-15/B-18 closing pointers | GOVERNANCE |

### Out of scope

| Deferred to | Items |
|---|---|
| F2 | `@clack/prompts` wizards; `bot add`, `group add`, `project bind`; IDE detection and tool-config merge; `AGENTS.md`/`CLAUDE.md` writing; `doctor` (PT-32 and the doctor half of PT-05); `icacls` application on the home; start-at-login registration (HKCU Run, LaunchAgent) |
| F3 | Web panel; roster sync; version header (B-14) |
| F4 / F5 | Channels adapter (B-09); Arena-light, round cap, `debate_journal` DDL (D-06) |
| F6 | npm publish; LICENSE, SECURITY.md, CONTRIBUTING.md, CHANGELOG.md (B-16); macOS evidence (B-12: darwin half of PT-09/PT-19) |
| F7 / F8 | Runner satellite, referee, tray shell |
| Spikes | B-07 (admin rule) and B-08 (named-pipe transport) consumed narrowly per D-04; any rule change needs its own ADR |
| Never in F1 | Any wire change; any edit to CONSTITUTION §2 text; any change to ADR-0028..0031 |

## Capabilities

`openspec/specs/` is empty (greenfield).

### New Capabilities

- `project-binding`: `conmuta.json` schema, registry schema and invariants R1–R6, hot-reload, `project_id` -> binding resolution, token-shape validator.
- `daemon-lifecycle`: singleton election, heartbeat and staleness, lazy spawn (Option A), idle rule, Node-floor gate, run-file lifecycle, static bundle assertions.
- `ipc-handshake`: identity challenge, bearer issuance and rotation, session freeze, 401 semantics, client error taxonomy.
- `durable-inbox`: poller loop, write-ahead transaction, admission pipeline with scope check, unknown-sender list, per-client cursors and surfaced state, ledger-side `timeout_s` long-poll.
- `send-path`: destination-free send, validation pipeline, secret backstop, binding assertion, per-binding dual write, rate discipline without auto-retry.
- `thin-client-tools`: the four MCP tools, fence soundness and origin labels, local `status`/`thread` reads, `DAEMON_DOWN` with zero network.
- `ledger`: schema, WAL, `user_version` migrations, quarantine, retention, audit-log content rules.
- `secret-store`: keyring and fallback, ACL expectations, no token in registry, ledger, errors or logs.
- `v1-migration`: backup, synthesized registry, token relocation, state import, runbook.

### Modified Capabilities

- None.

## Approach

- Two compiled bundles plus a shared pure layer. `daemon`: Telegram client, transports, poller, admission, send path, ledger, registry, secret store, IPC server. `client`: MCP server, binding resolution, handshake, the single spawn site. `shared`: `envelope.ts`, `secrets.ts`, protocol pure functions, constants, zod schemas, fence. The client bundle holds no reference to `api.telegram.org`, the keychain module or the ledger (PT-07).
- v1's `createServer(deps)` shape is kept; the deps become IPC stubs. The four tool input schemas port unchanged so hosts see the same surface.
- Cursor and presentation are decoupled by data, not by locking: `client_cursors.inbox_seq` and `client_surfaced` replace v1's global `next_update_id` / `first_surfaced_at`; the Telegram offset stays per token (exploration Q2).
- Build order for the tasks phase (PRs <= 400 lines, auto-chained): scaffold + constants -> shared and vendored modules -> `project-binding` -> `ledger` -> `secret-store` -> `daemon-lifecycle` -> `durable-inbox` -> `send-path` -> `ipc-handshake` -> `thin-client-tools` -> `v1-migration` -> static assertions + wrong-room CI -> documentation.
- Strict TDD from the first commit: red before green; every `src` file has a `test/` twin with the same base name; fixtures use placeholders only.

## Decisions recorded

| Id | Decision | Rationale |
|---|---|---|
| D-01 | **Lazy spawn: Option A.** One allow-listed spawn site in the client bundle; `spawn()` called exactly once; argv is a compile-time literal (current `node` executable + the daemon entry path); `shell: false`, `detached: true`, `windowsHide: true`; no user-controlled input reaches argv. PT-27 becomes multi-clause: zero `child_process` references outside that site, and the exact shape at the site. | ADR-0029 Consequences delegated this choice to the F1 spec, so no ADR amendment is needed. A separate launcher bin buys a cleaner boolean scan at the cost of a second package entry and a second `files` audit, with an identical runtime surface (exploration Q4). |
| D-02 | **`timeout_s` is a long-poll against the ledger.** `fetch` blocks up to `timeout_s` waiting for rows past the caller's `inbox_seq`; clamped by a named constant derived from `MAX_LONGPOLL_SECONDS`; never forwarded to Telegram. Input schema unchanged. | In v1 the caller's timeout was the Telegram long-poll; the daemon now polls continuously (exploration Q3). New behaviour; gets its own requirement in `durable-inbox`. |
| D-03 | **Node floor `>=24.15`** in `engines`, the CI matrix and the startup gate; explicit error before any disk write. | `node:sqlite` reaches "release candidate" at 24.15.0 (exploration Q7); tightens ADR-0030/0031's ">= 24" within its intent. |
| D-04 | **B-07 and B-08 are narrow, non-blocking.** F1 implements loopback HTTP + HMAC as ADR-0029 decided; B-08 gates only a future pipe transport; B-07 gates only the admin rule (`doctor`, F2). Bearer derivation is fixed in design; recommendation: a per-session token minted at `POST /session`, so the raw per-boot secret never travels on every request. | Exploration Q8 items 2–3; WORK-PLAN's "IPC design depends on B-08" is read narrowly. |
| D-05 | **Null anchor fails closed.** v1's fail-open branch (`protocol.ts:98-99`) becomes a counted `unanchored` rejection (PT-17); the local roster derivation stays; the wire is unchanged. The spec confirms it against the thread state machine. | THREAT-MODEL §5.7; ADR-0028 Consequences (`inherited-revisit` on ADR-0018). |
| D-06 | **Ledger open points.** F1 ships the `user_version` migration mechanism; `debate_journal` DDL arrives with F5's own migration. Recommended, design confirms: `needs_action` as a VIEW over `threads`; `seen_eids` as `UNIQUE(project_id, eid)` on `updates`; `project_id` as slug `^[a-z0-9][a-z0-9-]{2,40}$`. | DATA-MODEL §8; no dead schema without a test under Strict TDD. |
| D-07 | **Roster delivery.** The registry's `roster_snapshot` (copied at bind time) is the daemon's admission source; the client forwards `roster_hash` at `POST /session`; a mismatch raises condition `roster_drift`, never auto-resolved. | DATA-MODEL §2.4 draft adopted; F3 owns sync. |
| D-08 | **v1 reuse mechanism.** Copy from the frozen checkout at `bf8f365`; never a git or path dependency; each copied file carries a provenance header (v1 path, commit, verdict AS-IS or SEAM). | D1 "reused as a library"; v1 was never published and the v2 repository carries no v1 history (T12). |
| D-09 | **Name-bearing identifiers** (`conmuta.json`, `~/.conmuta`, `conmuta mcp`, tool prefixes) derive from one constant. | DN-02 decided the name; screening (B-11) is still pending. |
| D-10 | `package.json` ships `private: true` and no LICENSE until B-16; F6 lifts it at publish. | ADR-0031 rule 6. |

## Invariants touched (CONSTITUTION §2): all five

| Invariant | How F1 honours it | Pinned by |
|---|---|---|
| 1 Bijective binding | Registry R1–R2 reject a second active binding per `bot_id`, `group_id` or `project_id`; the send schema has no destination key; `chat_id === binding.group_id` is asserted before every `sendMessage`, else `WRONG_ROOM` plus an audit row; the launcher refuses an unbound or mismatched `--project`. | PT-01, PT-02, PT-18; ADR-0028 launcher test |
| 2 Secrets never leave the daemon | Tokens only in the keyring or the ACL'd fallback; `token_ref` in the registry; the client bundle has no token path; the Telegram client redacts by construction; the validator rejects token shapes in project files. | PT-05 (validator half), PT-06, PT-07, PT-08, PT-09 and PT-19 (win-x64), PT-24, PT-26 |
| 3 One poller, durable inbox | Singleton lock; inbox + audit + offset advance in one transaction, offset confirmed only after commit; `client_cursors` per session; `DAEMON_DOWN` with zero network. | PT-10, PT-11, PT-12; ADR-0029 rotation, idle and no-emission tests |
| 4 Numeric-id identity + scope check | Admission step 3 drops `foreign_chat`; step 4 drops `unknown_sender` into the pending list without body; the envelope's `from` never overrides `message.from.id`; a null anchor fails closed (D-05). | PT-03, PT-04, PT-16, PT-17, PT-31 |
| 5 Peer content is data | Fence with `<` escaped plus origin label; no exec (D-01 scoped), `fs` confined to the home, no emitting timers; the audit log has no rejected-body column; `migrate_to_chat_id` is never followed. | PT-13, PT-14, PT-15, PT-20, PT-25, PT-27, PT-28, PT-33 (429 half) |

## Wire policy (CONSTITUTION §4, rule W1)

F1 emits `AGENTBUS/2` and accepts `/1` and `/2`. **No wire change.** `envelope.ts` is copied verbatim; no new envelope field, type or `basis` value; the emitted and accepted sentinels remain two constants a test forces to agree (W8). Arena-light metadata, when it comes, lives in body markers (F5).

## Affected areas (proposed layout; design fixes names)

| Area | Impact | Description |
|---|---|---|
| `package.json`, `tsconfig.json`, `npm-shrinkwrap.json`, `.github/workflows/ci.yml` | New | Scaffold per ADR-0031; CI on `windows-latest`, Node 24.15 and 26 |
| `src/shared/` | New | Vendored `envelope.ts`, `secrets.ts`, protocol pure functions, constants, zod schemas, fence |
| `src/daemon/` | New | Telegram client, transports, poller, admission, send path, IPC server, lifecycle |
| `src/ledger/`, `src/registry/`, `src/secret-store/` | New | ADR-0030 stores |
| `src/client/` | New | MCP server, binding resolution, handshake, the single spawn site |
| `src/migration/` | New | B-13 |
| `test/` (mirror of `src/`), `test/security/`, `test/fakes/` | New | Twins, static assertions, wrong-room CI test, `FakeTelegramClient` |
| `docs/02-architecture/DATA-MODEL.md`, `docs/02-architecture/THREAT-MODEL.md` §4, `docs/06-backlog/CHECKLIST.md` | Modified | Fields finalized; PT file names; B-13/B-15/B-18 pointers |
| `docs/01-constitution/*`, `docs/03-adr/0028..0031` | Unchanged | No amendment needed |

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| The D-01 allow-listed assertion rots when a later change loosens it | Med | Multi-clause test over the built bundle: predicate matches == 1, `spawn(` count == 1, literal argv, `shell: false`; non-vacuous scan |
| `node:sqlite` transaction idiom unconfirmed on the pinned build | Med | Short in-phase spike (red test first) before the write-ahead transaction task; no ADR |
| `detached` + `windowsHide` console flash on Windows 11 (nodejs/node#21825) | Med | Verify on Windows 11 in the lifecycle task; document if unavoidable |
| `@napi-rs/keyring` prebuild missing on a CI runner | Low | Fallback path is first-class; PT-09 asserts fallback plus ACL |
| Migration cursor gap after >24 h offline; v1 and the daemon polling the same token (409) | Med | Runbook states both; `status` shows last poll per bot; `TELEGRAM_CONFLICT` surfaced, never retried |
| ADR-0028..0031 still `proposed` in the ADR index (Director confirmation pending) | Low | The handoff confirms the decisions; the index status update is a Director action outside this change |
| Phase size versus 400-line PRs | High | Auto-chain; the tasks phase forecasts and slices per capability |
| Trademark screening fails (B-11) | Low | D-09: one constant to rename |

## Rollback plan

v1 stays frozen (`bf8f365`) and installed; nothing in F1 modifies or deletes `~/.agentbus`. Migration writes `~/.agentbus/*.bak-pre-v2-<date>` siblings and never touches the originals. To revert: stop the daemon (it releases the lock and deletes only its own run files), remove `~/.conmuta/` (registry, ledger, run state, fallback secrets) and the keyring entries `bot:<bot_id>`, and resume v1 sessions. The wire is identical, so peers notice nothing. Updates the daemon admitted while v1 was stopped exist only in the removed ledger; the runbook states this.

## Dependencies

- Node >= 24.15 on developer machines and CI (`windows-latest`).
- `@napi-rs/keyring-win32-x64-msvc` prebuild (evidence in exploration Q6).
- Frozen v1 checkout at `bf8f365` as the read-only copy source.
- Product name decided (DN-02): identifiers use `conmuta`.
- Nothing from spikes B-07, B-08 or B-09 (D-04).

## Success criteria

- [ ] All "Tests that must pin it" rows of ADR-0028 (6), ADR-0029 (8) and ADR-0030 (8) are green in CI.
- [ ] The two-binding wrong-room CI job is green (PT-01).
- [ ] Static assertions are green and non-vacuous over both built bundles (PT-27 with the D-01 clauses, PT-28, PT-07).
- [ ] The `DAEMON_DOWN` path makes zero network calls and sends no `Authorization` header (PT-26 a/b).
- [ ] A v1 `~/.agentbus` fixture (placeholders only) migrates with `.bak-pre-v2-*` siblings, a synthesized registry, a secret-store entry and imported threads; the originals are unchanged.
- [ ] F1 pinning tests green: PT-02..PT-06, PT-08, PT-09 (win-x64), PT-10..PT-20 (PT-19 on Windows), PT-24..PT-28, PT-31, PT-33 (429 half); PT-21 pinned early against the scaffold.
- [ ] Every `src` file has a `test` twin; `npm test` and `npm run build` pass; no v1 production identifier in the tree (PT-22 deny-list).
- [ ] A re-run of `sdd-init` flips `openspec/config.yaml` `strict_tdd` to `true` against the real `npm test`.
