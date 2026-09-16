# Backlog checklist — items to land gradually

> Purpose: one row per item the Director or the tribunal has deferred, so nothing is lost and
> nothing is re-debated. Each item is processed in its own session or debate, in the order the
> Director decides. A row is closed only with a pointer (debate id, ADR, commit or Director note).
>
> Rules: one item per row; never delete a row, mark it `done` or `dropped` with the pointer;
> the phase column follows the work plan agreed in debate `bus-v2-landing-architecture-001`
> (F0 landing … F6 packaging; F7+ are post-v1 tracks).

Status legend: `open` · `in-debate` · `decided` · `done` · `dropped`

| # | Item | Origin | Phase | Status | Pointer |
|---|------|--------|-------|--------|---------|
| B-01 | **Group referee role** (Director: "árbitro / coordinador" per Telegram group). One optional referee per group, with an explicit rule set: registers tickets with mandatory labels (raising agent, date, status, repo version vs local/VPS version), homologates state, blocks duplicates, re-work and re-debate. Precedent: `FRISCO/frisco-erp/coordinador` (mechanical gate, writes nothing, authorizes nothing, own ledger outside the tree). Runs as a satellite package, never inside the bus core (Alpha objection n1, ADR-06). | Director 2026-09-15 | F7 | open | dedicated debate `bus-v2-referee-001` |
| B-02 | **Skill templates** shipped with the product: Markdown prompts (referee, auditor, developer, documenter…) placed where the control panel can offer them per bot/group for one-click adoption by any agent host. | Director 2026-09-15 | F7 | open | same debate as B-01 |
| B-03 | **Ticket ledger location**: daemon-owned SQLite table exposed as MCP tools (`ticket_open`, `ticket_find`, `ticket_status`) vs external adapters (Odoo, GitHub Issues, Linear). Decide after B-01. | Director 2026-09-15 | F7 | open | — |
| B-04 | **Desktop shell** (system-tray app) for Windows first, macOS second, wrapping the SAME daemon and the SAME local web panel (no second UI). Candidates: Tauri v2 (small, native tray, autostart plugin, Node daemon as sidecar, needs Rust toolchain) vs Electron (JS-only, heavier). Signing budget: Azure Trusted Signing + Apple Developer ID. | Director 2026-09-15 | F8 | open | amendment A2 in `bus-v2-landing-architecture-001` |
| B-05 | **Study gentle-ai installer** (`Gentleman-Programming/gentle-ai`, Go binary, `install --agent <list> --scope global\|workspace`) in a dedicated exploration session: its per-agent adapters (detection paths, config merge semantics, TUI flow). Goal: validate/complete our 15-tool MCP config matrix, reuse knowledge, not code. | Director 2026-09-15 | F0 spike | open | — |
| B-06 | **Headless runner satellite package** (invokes `claude -p`, `codex exec`, `opencode run`, `gemini -p` on new `needs_action`). Out of the core by ADR-06 layers 1–2; own constitution and package; read/reply-only default. First consumer: B-01. | Alpha objection n1 | post-F6 | decided | `bus-v2-landing-architecture-001` round 2 |
| B-07 | **Spike**: bot-to-bot group visibility for a NON-admin bot with privacy disabled — AND vs OR semantics (two official Telegram pages disagree). Determines whether project bots must ever be admins. | critic gap | F0 | open | — |
| B-08 | **Spike**: IPC handshake on Windows 11 — challenge-response over the per-boot secret before any bearer is sent (Alpha objection n2), plus whether a Node-created named pipe is reachable by another local user. | Alpha objection n2 | F0 | open | — |
| B-09 | **Spike**: per host (Cursor, OpenCode, Codex, Gemini CLI, Antigravity, Claude Code) whether any MCP server-initiated notification reaches the model or triggers a turn. Decides what "timely attention" can honestly promise. | critic gap | F0 | open | — |
| B-10 | **N-party tribunal over the bus** (proposer + judges on different models): needs AGENTBUS/3 or Arena Orion integration; v1 ships 2-party Arena-light only. | proposal D7 | post-F6 | open | — |
| B-11 | **Name clearance**: IMPI + EUIPO screening for "Conmuta" (collision: Conmuta Soluciones Tecnológicas S.L., class 42); fallback "Emisario". Reserve npm scope, GitHub org and domain the same day the Director decides. | proposal D8 | F0 | open | Name decided: Conmuta (DN-02, 2026-09-16); screening and reservations still open |
| B-12 | **macOS smoke test** (installer + daemon + LaunchAgent + one IDE) before claiming dual-platform support. | proposal D9 | F6 | open | — |
| B-13 | **Migration runbook from `~/.agentbus`** (FRISCO team on v1.0.1/v1.0.2): backup, synthesized registry, wire-compat policy (emit AGENTBUS/2, accept /1 and /2). | proposal D1 | F1 | open | — |
| B-14 | **Version observability without autonomous emission**: no heartbeat timer (ADR-06 layer 2); build/wire version rides on the render-only header of posts the agent sends anyway. | Kairo self-correction | F3 | decided | amendment A1 |
| B-15 | **Secrets storage verification**: `@napi-rs/keyring` prebuilds on win-x64 and darwin-arm64; fallback file ACL (`icacls` / `chmod 600`) with tests on both platforms. | proposal D4 | F1 | open | — |
| B-16 | **Repository hygiene for open source**: LICENSE (Apache-2.0, Director to confirm), SECURITY.md (five invariants), CONTRIBUTING.md, CHANGELOG.md, secret scan in release checklist. | proposal D10 | F0 | open | LICENSE done (Apache-2.0, DN-04, 2026-09-16); SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line still open |
| B-17 | **Node ≥ 24 gate** as the first check of the installer, before touching disk or git, with an explicit error and download link (Alpha objection n3). | Alpha objection n3 | F2 | decided | `bus-v2-landing-architecture-001` round 2 |
| B-18 | **Committed project file** `conmuta.json` at repository root, strict zod schema, identifiers only, no local paths, `schema_version` (Alpha objection n4). File name follows the final product name. | Alpha objection n4 | F1 | decided | `bus-v2-landing-architecture-001` round 2 |
