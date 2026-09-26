# Proposal: F2 — Installer, requirements validator, tool config, binding, doctor

| Field | Value |
|---|---|
| Change | `f2-installer-and-doctor` |
| Status | proposed — pre-proposal decisions locked 2026-09-26 (tribunal `bus-v2-f2-explore-decisions-001`, CONSENSUS); D-40 (start-at-login) added same day by direct Director decision after the subagent flagged the F1-vs-WORK-PLAN gap |
| Implements | [ADR-0031](../../../docs/03-adr/0031-npm-distribution-and-license.md) installer rules 2, 3, 5 and its installer tests; the "Add bot / Add group / Assign project" flow of [ADR-0028](../../../docs/03-adr/0028-project-scoped-bijective-binding.md); [OVERVIEW §10](../../../docs/02-architecture/OVERVIEW.md) (F2 rows) |
| Scope authority | [WORK-PLAN.md](../../../docs/07-plan/WORK-PLAN.md) section F2; backlog B-05 (closes here), B-17 |
| Inputs | [exploration.md](./exploration.md) including its Addendum (Engram `sdd/f2-installer-and-doctor/explore`) |
| Binding rules | Strict TDD; PRs <= 400 authored lines, auto-chained; artifacts in English; placeholders only, no v1 production identifiers |

## Intent

F1 shipped a working daemon and thin client, but a human can only configure them by hand-editing `~/.conmuta/registry.json`, calling the secret store from code, and writing each tool's MCP entry manually. `src/registry/loader.ts` is read-only by design, and no writer exists for the registry or `conmuta.json`. F2 delivers the guided path: a Node-floor-first `@clack/prompts` wizard that adds bots and groups, binds a project, merges one id-only stdio entry into the tool configs the user selects (never overwriting), and a `doctor` that validates the machine offline without a token.

Success is WORK-PLAN F2 validation: ADR-0031 installer tests, one merge test per config format, an offline `doctor` with zero network calls, and the wrong-room test still green after installing into two projects.

## Scope

### In scope

| # | Deliverable | Content | Source |
|---|---|---|---|
| 1 | Dependencies | `@clack/prompts`, a JSONC-tolerant parser, a TOML parser; shrinkwrap updated; the specific packages are fixed in design | ADR-0031 item 3; D-32 |
| 2 | Gate order | Node-floor gate first (reusing `src/daemon/node-floor.ts`), before flag parsing, disk or git; then home + empty registry scaffold, ledger open, tool selection, wizards, config merge, `doctor` | OVERVIEW §10.1; B-17 |
| 3 | Registry writer | New module; every write re-validated through the existing schema and R1–R6 before an atomic replace; an R6 audit row per change | D-35 |
| 4 | `conmuta.json` writer | Identifiers only; reuses `parseProjectFile`'s schema; write-if-absent or verify | OVERVIEW §10.2 |
| 5 | Wizards | `setup`, `bot add`, `group add`, `project bind <path>` | D-38 |
| 6 | Tool-config merge | 8 project-level surfaces (table below), opt-in per tool, per-format merge with backup and refuse-and-diff | D-32, D-34 |
| 7 | Instruction files | `AGENTS.md` (<= 200 lines, bus protocol for agents) + `CLAUDE.md` = `@AGENTS.md`; trust steps printed, never bypassed | OVERVIEW §10.1 step 5 |
| 8 | `doctor` | Offline/system and registry tiers (no token); online tier per binding inside the daemon; opt-in DM probe; PT-05 doctor half, PT-32; B-28 membership check; B-30 tension surfaced | OVERVIEW §10.4; D-37 |
| 9 | Windows ACL | `icacls` applied once to the home and fallback secrets | secret-store spec |
| 10 | Installer bundle assertions | `test/security/installer-bundle.test.ts`: settings-path and `deleteMessage` assertions; exec allowed only for `icacls` | THREAT-MODEL §5.6 |
| 11 | Documentation | OVERVIEW §10.1/§10.3 (Pi row, detection wording); THREAT-MODEL §4 PT file names; CHECKLIST B-05 closed, B-17 pointer | GOVERNANCE |
| 12 | Start-at-login registration | Opt-in checkbox in `setup`; `HKCU\...\Run` value on Windows, `~/Library/LaunchAgents` plist on macOS; no services, no Task Scheduler, no pm2; removable from the same wizard or by unchecking on a re-run | OVERVIEW §7.1 (D3); design.md:298 (F1's own explicit deferral to F2); D-40 |

### Tool-config matrix (project level; OVERVIEW §10.3 plus Pi)

| Tool | File | Key |
|---|---|---|
| Claude Code | `.mcp.json` (shared: also read by Pi, Copilot CLI, VS Code Agent Host) | `mcpServers` |
| Cursor | `.cursor/mcp.json` | `mcpServers` |
| VS Code | `.vscode/mcp.json` | `servers` |
| Gemini CLI | `.gemini/settings.json` | `mcpServers` |
| OpenCode | `opencode.json` (never global) | `mcp` |
| Codex CLI | `.codex/config.toml` | `[mcp_servers.<name>]` |
| Antigravity | `.agents/mcp_config.json` | `mcpServers` |
| **Pi** (new, 8th row) | `.pi/mcp.json`; shared `.mcp.json`; global `~/.pi/agent/mcp.json` (never written) | `mcpServers` |

### Out of scope

| Deferred to | Items |
|---|---|
| F3 | Control panel (`panel`, `status`) and Overview table (`list`) — OVERVIEW §10.2 phase column; roster sync |
| F6 | macOS evidence (B-12); npm publish; pack test |
| Not in first slice | Auto-detection of installed tools (D-33); writing global configs other than best-effort documentation |
| Never | Any wire change; writing `enableAllProjectMcpServers`, Codex `trust_level`, or any settings/permissions file |

## Capabilities

### New Capabilities

- `installer-wizard`: gate order, home/registry scaffold, `setup`, `bot add`, `group add`, `project bind`, zero writes on gate failure, instruction files.
- `registry-authoring`: registry and `conmuta.json` writers, validate-before-replace, R6 audit rows.
- `tool-config-merge`: per-format parse, merge, backup, refuse-and-diff, readback, shared-surface handling, no `npx`, zero `env`.
- `doctor`: tiers, offline no-network guarantee, online checks, DM probe opt-in.

### Modified Capabilities

- `ipc-handshake`: an authenticated route for the online doctor tier (runs inside the daemon, OVERVIEW §10.4).
- `secret-store`: installer-side write path and one-time `icacls` application become specified behavior.

## Approach

- A third bundle `src/installer/` (plus `src/doctor/`) beside `daemon` and `client`, reusing F1 modules: `node-floor`, `home`, `secret-store`, registry schema/invariants, `project-file`, `token-shape`, the redacting Telegram client.
- Every file mutation follows one pattern: parse strictly, compute the edit, back up, write, read back and re-parse; on ambiguity, refuse and show the diff.
- Build order: dependencies + gate → registry/project writers → per-format merge → wizards → `cli/main.ts` wiring (own slice) → doctor offline → doctor online + IPC route (own slice) → installer bundle assertions → docs.

## Decisions recorded

| Id | Decision | Rationale |
|---|---|---|
| D-31 | **B-05 closes via F2's write-then-readback merge tests**, one per format, with realistic pre-populated fixtures (an unrelated MCP entry plus non-MCP keys), never empty objects. No separate spike. | Locked, `bus-v2-f2-explore-decisions-001` |
| D-32 | **Strict per-format merge**: JSONC-tolerant parser for the JSON family; TOML parser for Codex; refuse-and-diff when a file does not parse cleanly or a same-named entry differs; pre-edit backup mirroring F1's `*.bak-pre-v2-<date>` convention (`src/migration/main.ts`). | Locked, same debate |
| D-33 | **Tool selection by wizard checkbox**, no auto-detection. "Detected tool" in OVERVIEW §10.1 step 3 and CONSTITUTION §3 layer 3 is read as "tool the user selected" — stricter opt-in, no amendment needed. | Locked, same debate |
| D-34 | **Pi is the 8th project-level row**. `.mcp.json` is a multi-reader surface; `doctor` reports every host that reads it. Pi's global file is never written (same reason as OpenCode). Deduplication between `.pi/mcp.json` and `.mcp.json` is fixed in design against `pi-mcp-adapter`'s load order. | Locked surfaces; global rule follows OVERVIEW §10.3 |
| D-35 | **Writers are new modules; the loader stays read-only.** A write is accepted only if the resulting bytes pass the same schema and R1–R6 the daemon enforces. | R6; exploration approach 1 |
| D-36 | **Merge preserves bytes outside the inserted entry** (comments, key order, formatting); design selects edit-in-place APIs, not parse-and-reserialize. | A reserialize drops JSONC/TOML comments: data loss |
| D-37 | **Token handling**: `bot add` reads the token once, masked; `getMe` goes through F1's redacting client; the token goes straight to the secret store; never in argv, env, logs or errors. The online `doctor` tier runs daemon-side. | Invariant 2; OVERVIEW §10.4 |
| D-38 | **F2 verbs**: `setup`, `bot add`, `group add`, `project bind <path>`, `doctor`. | OVERVIEW §10.2 proposed names |
| D-39 | **Edits to merged F1 files** each get their own disclosed slice. **Amended by design (D-48)**: the actual list is 4 files, not the 2 named here — `src/cli/main.ts` (dispatch), `src/shared/ipc-contract.ts` (route + schemas), `src/daemon/telegram.ts` (adds `getChatMember` to the class only), and `src/daemon/bootstrap.ts` (wiring). `src/daemon/ipc/routes.ts` is NOT edited after all — design chose a new `daemon/ipc/doctor.ts` module instead (D-44). | Freeze-doctrine precedent (B-43, B-54); corrected by `sdd-design` after reading the real merged files |
| D-40 | **Start-at-login is in scope for F2**, resolving F1's own explicit deferral (`design.md:298`, "the start-at-login registration (F2) becomes the recommended path"), which `WORK-PLAN.md`'s F2 row never named. Implemented as an opt-in `setup` checkbox writing the mechanism OVERVIEW §7.1 already specifies (`HKCU\...\Run` on Windows, `LaunchAgents` plist on macOS); no services, no Task Scheduler, no pm2; removable by re-running `setup` and unchecking. | Director decision, session 41 |

## Invariants touched (CONSTITUTION §2)

| Invariant | Touched? | How |
|---|---|---|
| 1 Bijective binding | **Yes** | `project bind` and `group add` write bindings; the writer rejects R1/R2 violations before replace; the wrong-room CI test must stay green after two installs |
| 2 Secrets never leave the daemon | **Yes** | Token intake in `bot add` (D-37); id-only, zero-`env` entries in every tool config; the token-shape validator runs in `doctor` (PT-05 doctor half) |
| 3 One poller, durable inbox | No | The installer never calls `getUpdates`; online checks run inside the daemon |
| 4 Numeric-id identity + scope check | No | Admission unchanged; roster entries from pending unknown senders are chosen by a human |
| 5 Peer content is data | No | No path from bus content to installer action. The installer is outside the core; its only exec is `icacls` (THREAT-MODEL §5.6) |

CONSTITUTION §3 layer 3 (settings immutability) is directly exercised and pinned by the installer bundle assertion.

## Wire policy (CONSTITUTION §4, rule W1)

F2 emits `AGENTBUS/2` and accepts `/1` and `/2`. **No wire change:** F2 does not touch envelopes, sentinels or the send/receive path.

## Affected areas (design fixes names)

| Area | Impact | Description |
|---|---|---|
| `package.json`, `npm-shrinkwrap.json` | Modified | Three runtime dependencies |
| `src/installer/**`, `src/doctor/**` + `test/` twins | New | Wizards, merge, doctor |
| `src/registry/writer.ts`, project-file writer + twins | New | Registry and `conmuta.json` authoring |
| `src/installer/autostart.ts` + twin | New | D-40: Windows `HKCU\...\Run` value / macOS `LaunchAgents` plist, opt-in, idempotent, removable |
| `src/cli/main.ts` | Modified | Verb dispatch (own slice) |
| `src/shared/ipc-contract.ts` | Modified | `/doctor` route + schemas (own slice, corrected by design D-48) |
| `src/daemon/telegram.ts` | Modified | Adds `getChatMember` to the class only (own slice, corrected by design D-48) |
| `src/daemon/bootstrap.ts` | Modified | Wires `doctorClientFor` (own slice, corrected by design D-48) |
| `src/daemon/ipc/doctor.ts` | New | Online doctor route — design D-44 chose a new module over editing `routes.ts` |
| `test/security/installer-bundle.test.ts`, fixtures per format | New | Static assertions, B-05 fixtures |
| `docs/02-architecture/OVERVIEW.md`, `THREAT-MODEL.md` §4, `docs/06-backlog/CHECKLIST.md` | Modified | Pi row, detection wording, PT names, B-05/B-17 |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A merge destroys user content (entries, comments) | Med | D-31 fixtures, D-36 byte preservation, backup, refuse-and-diff |
| `.mcp.json` shared by several hosts; duplicate server under Pi | Med | D-34; `doctor` reports readers and duplicates |
| Installer and daemon both touch the ledger (R6 audit rows) | Med | WAL; design fixes whether audit writes go direct or via IPC |
| Online doctor needs a new IPC route in a merged unit | Med | D-39 own slice and audit |
| WORK-PLAN "six screens" vs OVERVIEW phasing two screens to F3 | Low | Follow OVERVIEW; disclosed here |
| Windows Run-key/macOS LaunchAgent write path never built before in this project | Low | Small, isolated, opt-in, fully specified by OVERVIEW §7.1; own test (registry/plist write + idempotent re-run + uninstall) |
| Phase size vs 400-line PRs | High | Auto-chain per capability |

## Rollback plan

Every file F2 edits has a pre-edit backup sibling; restoring it reverts the edit. Remove the inserted entries, `~/.conmuta/registry.json` changes (from backup), the secret-store entries `bot:<bot_id>`, and the written `AGENTS.md`/`CLAUDE.md`/`conmuta.json`. Revert the F2 PRs; F1's daemon keeps working because the registry remains hand-editable. The wire is unchanged, so peers notice nothing.

## Dependencies

- F1 archived; its modules reused, not modified except D-39 slices.
- Node >= 24.15; `windows-latest` CI.
- Nothing from B-07 (closed), B-09 or B-12.

## Success criteria

- [ ] ADR-0031 installer tests green: no `npx` in any written entry; fake Node < 24 exits with the download link and zero filesystem writes and zero git calls.
- [ ] One merge test per format (8 surfaces) with realistic fixtures: pre-existing entries, non-MCP keys and comments survive byte-for-byte; a conflicting same-named entry is refused with a diff; a backup exists.
- [ ] `doctor` offline tiers make zero network calls (test fails if any occurs).
- [ ] PT-05 doctor half and PT-32 green.
- [ ] Wrong-room test green after installing into two projects.
- [ ] Installer bundle static assertions green and non-vacuous.
- [ ] B-05 closed in CHECKLIST with a pointer to the merge tests; every `src` file has a test twin; `npm test` and `npm run build` pass.
- [ ] Start-at-login (D-40) writes the Windows Run key / macOS LaunchAgent plist only when opted in, is idempotent on re-run, and is fully removed when unchecked; no service, Task Scheduler, or pm2 entry is ever created.
