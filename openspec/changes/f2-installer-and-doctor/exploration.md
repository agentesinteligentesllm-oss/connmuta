<!-- sdd-explore artifact for change f2-installer-and-doctor.
     Persisted in hybrid mode: this file + Engram topic sdd/f2-installer-and-doctor/explore (obs #3647).
     The explore executor had no Bash/file-write tool; the orchestrator materialized this file verbatim from its
     inline report and persisted it to Engram via the `engram` CLI fallback on 2026-09-26 (MCP mem_save had
     failed twice with "multiple active runtime sessions", a known issue per docs/08-sessions/HANDOFF.md §4). -->

## Exploration: F2 — Installer, requirements validator, IDE detection, binding, doctor (`f2-installer-and-doctor`)

### Current State

F1 (`f1-daemon-registry-thin-client`) is done and archived (`openspec/changes/archive/2026-09-26-f1-daemon-registry-thin-client/`, commit history through `3865b23`, working tree clean, CI green). No `openspec/changes/f2-installer-and-doctor/` folder existed before this exploration — F2 has not been touched by any prior session. F2's authoritative scope is `docs/07-plan/WORK-PLAN.md`'s F2 row plus `docs/02-architecture/OVERVIEW.md` §10 (gate order §10.1, six screens §10.2, per-tool config matrix §10.3, doctor tiers §10.4).

Six screens, one-to-one with proposed CLI verbs and F3 panel views: Installation validator (`conmuta doctor`), Control panel (`conmuta panel`/`status`, panel UI is F3-scoped), Add bot (`conmuta bot add`), Add group (`conmuta group add`), Assign project (`conmuta project bind <path>`), Overview table (`conmuta list`, panel view is F3-scoped). Verb names are explicitly "proposed" per OVERVIEW itself, fixed only at spec time.

**Backlog status (verified against `docs/06-backlog/CHECKLIST.md`, not assumed from WORK-PLAN's summary):**
- **B-17 (Node ≥24 gate, first, before disk/git): `decided`.** Already implemented and proven in F1: `src/daemon/node-floor.ts` (`enforceNodeFloor`, `isNodeAtOrAboveFloor`, `parseSemver`) is reused verbatim by `src/cli/main.ts`'s `mcp` and `migrate-v1` branches, each calling the gate as literally the first action before any flag parsing — a discipline that was itself corrected during session 35's Judgment Day (both judges independently found the gate must precede argument parsing, not merely precede filesystem writes). F2 has a proven, reusable pattern to copy for `setup`/`bot add`/`group add`/`project bind`/`doctor`.
- **B-05 (gentle-ai installer study spike): still `open`, pointer `—`.** WORK-PLAN's F2 dependency row reads as if this spike already produced a config matrix ("Spike B-05 result (config matrix)"). It has not — CHECKLIST shows no pointer at all. §10.3's matrix is well-specified on its own textual merit (attributed to `research[mcp-config-surfaces]`), but the spike WORK-PLAN says "closes here" was never actually performed.

### Affected Areas

- `src/cli/main.ts` — **a closed, audited F1 unit**, currently wiring only `validate`, `daemon stop`, `mcp`, `migrate-v1`. F2 must add `setup`, `bot add`, `group add`, `project bind`, `doctor`, `panel`/`status`, `list` — a substantial extension of an already-merged, already-reviewed file. This project's own freeze-doctrine precedent (B-43, B-54: a defect in a merged module gets its own new slice, never a drive-by edit) suggests this extension deserves its own disclosed slice/PR with its own audit rather than folding into a bigger PR.
- `src/registry/loader.ts` — **read-only by explicit design.** Its own module doc states: "This module never writes... there is no `writeFileSync`, `renameSync`, `unlinkSync` or `openSync` here"; R6 makes every registry change "a human action (CLI wizard, panel or editor)." F2 must design and build a **new** registry writer; none exists to extend. This is the single largest missing piece of infrastructure for "Add bot"/"Add group"/"Assign project."
- `src/shared/project-file.ts` — `parseProjectFile` is pure/read-only (parser + content-safety walk only). F2's "Assign project" screen needs a **new** `conmuta.json` writer, ideally reusing the same strict schema (`PROJECT_FILE_SCHEMA_VERSION`) and the same value-free problem-reporting convention already established.
- `src/secret-store/index.ts` — **already a full read/write module** (`SecretStoreSelection`, OS keyring + ACL'd file fallback, `SECRET_STORE_FALLBACK_CONDITION`). "Add bot" can call directly into this existing module; no new secret-storage code needed, only wiring.
- `src/daemon/home.ts` — `resolveHomeDir`/`ensureHomeDirs` already create `~/.conmuta/`, `run/`, `secrets/` with private POSIX modes (`0o700`). Directly reusable for OVERVIEW §10.1 gate step 2 ("home directory and an empty registry"), but it does **not** create an initial `registry.json` — that scaffold-write is new F2 scope.
- `package.json` — `@clack/prompts` is named as the chosen wizard library (ADR-0031 §Decision item 3, OVERVIEW §12) but is **not yet a dependency** (current deps: `@modelcontextprotocol/sdk`, `zod`, `@napi-rs/keyring` only). Must be added in F2's first slice.
- `docs/02-architecture/THREAT-MODEL.md` §5.6 — the installer/doctor CLI is already scoped as a **third bundle**, explicitly excluded from the no-`child_process` assertion (it may spawn `icacls`/`chmod`) but still included in the settings-path and `deleteMessage` assertions. No `test/security/installer-bundle.test.ts` exists yet, unlike the already-shipped `client-bundle.test.ts`/`daemon-bundle.test.ts` from F1.
- Backlog rows already naming F2 as owner with concrete design input, worth reading before design rather than re-discovering: **B-28** ("no R1–R6 row demands referential integrity... Owner: F2's `doctor` is the natural home — a membership check belongs where the machine is inspected, not where the file is parsed for the daemon"); **B-30** (R5's raw-text token scan refuses ordinary human-authored registry text, e.g. a group title containing `API_KEY=123`; disposition explicitly suggests surfacing the tension "where the human will see it: the F2 `doctor` and the migration runbook").
- `docs/03-adr/0028-project-scoped-bijective-binding.md` — cites "Add bot / Add group / Assign project" as the flow that carries the N×M-bots cost of the bijective binding; no new information beyond OVERVIEW.

### Tool-config formats needing "merge, never overwrite" (OVERVIEW §10.3)

Already reasonably specified for the 8 **project-level** surfaces (all repo-relative paths, so format itself is OS-agnostic): Claude Code (`.mcp.json`→`mcpServers`), Cursor (`.cursor/mcp.json`→`mcpServers`), VS Code (`.vscode/mcp.json`→`servers`, **not** `mcpServers`), Gemini CLI (`.gemini/settings.json`→`mcpServers`), OpenCode (`opencode.json`→`mcp`, `type: "local"`, **project file only, never global**), Codex CLI (`.codex/config.toml`→`[mcp_servers.<name>]`), Antigravity (`.agents/mcp_config.json`→`mcpServers`; its own source note already flags "global path needs re-checking before hard-coding"), plus 3 **global-only** best-effort tools (Windsurf, Cline, JetBrains AI Assistant).

**Genuinely unresolved — correctly flagged as not-to-guess:**
1. The per-tool **detection** heuristic (how the installer decides a tool is installed at all, distinct from knowing where its config would go) is not specified anywhere in the docs read.
2. The exact **merge algorithm** per format (JSON object merge vs. TOML table merge vs. VS Code's differently-named `servers` key) — CHECKLIST's own named F2 risk states plainly: "a merge that overwrites a user's existing MCP entry is a data-loss bug and needs its own test per format."
3. macOS-specific **detection** evidence is "zero" per the critic gap WORK-PLAN cites — though the macOS **smoke test itself** is B-12/F6-scoped, which is a phase-boundary nuance worth surfacing to the Director (F2 designs cross-platform merge logic; F6 is where macOS gets empirically verified), not necessarily a pure F2 blocker.

### Approaches

1. **One shared atomic writer module (registry + `conmuta.json`) vs. ad hoc per-screen writes.**
   - Description: a `registry/writer.ts` plus a `conmuta.json` writer, both reusing this repo's parse-after-write verification convention already visible in the loader/parser docstrings.
   - Pros: matches this codebase's own rigor (every module here is heavily doc-commented and test-pinned against exactly this class of correctness); one place to pin "never corrupts a human-edited file" tests; avoids triplicating the schema-then-write discipline.
   - Cons: none material.
   - Effort: Medium — new module + tests, no unresolved design question.
   - *Recommended.* Ad hoc per-screen writes were considered and rejected: they would risk the exact "each PR's own tests passed, the composition was still broken" failure mode F1 session 40 already recorded as a lesson (`docs/08-sessions/HANDOFF.md` §4).

2. **Installer talks to the daemon over IPC vs. writes registry/secret-store files directly.**
   - Not really an open fork: OVERVIEW §10.2's own "Writes" column already answers it — "Add bot" writes directly to "Secret store, `registry.bots`," consistent with the installer/doctor CLI being a separate third bundle (THREAT-MODEL §5.6) that can act before any daemon exists. Recorded so the eventual spec doesn't silently re-open it.

### Recommendation

Proceed to `sdd-propose` for `f2-installer-and-doctor`, explicitly carrying forward as inputs (not re-derivable facts): (a) the registry/project-file **writer is 100% new scope**, not an extension of anything F1 shipped; (b) `cli/main.ts`'s extension should get its own disclosed slice, per this project's freeze-doctrine precedent; (c) `@clack/prompts` must be added as a dependency in the first slice; (d) B-05's spike is still genuinely open — the proposal should explicitly decide whether to run a short research pass before/alongside spec, or explicitly accept the existing §10.3 matrix as sufficient and close B-05 on that basis, rather than silently assume either; (e) the merge-algorithm-per-format decision and the exact per-tool detection heuristic are real open product/design questions for `sdd-design`, not implementation details to infer.

### Risks

- The merge algorithm per config format is undecided; getting it wrong is explicitly a data-loss bug per this project's own backlog wording.
- B-05's "gentle-ai installer study" spike, which WORK-PLAN treats as informing/closing at F2, was never actually performed — F2 may be starting without the evidence base its own dependency row assumes exists.
- Editing `src/cli/main.ts` reopens an already-merged, already-audited F1 module; needs its own scoped slice and audit rather than a drive-by extension.
- No per-tool detection-heuristic specification or evidence exists for any tool, macOS or otherwise.
- `openspec/config.yaml`'s stale `context:` field (still narrates F1 mid-apply) should be refreshed once F2's SDD change starts — cosmetic, non-blocking.

### Ready for Proposal

Yes, with the explicit caveat that B-05's evidence gap and the merge-algorithm/detection-heuristic open questions should be raised with the Director before or during `sdd-propose` — this is a real, unresolved product decision, not a default the orchestrator should pick unattended.

### Addendum (same session, after Director review): Pi added to the tool-config matrix, 3 decisions debated with Alpha

The Director reviewed the three open questions above, asked for a detailed explanation, then authorized proceeding with Kairo's recommendation on all three and asked to add **Pi** (`@earendil-works/pi-coding-agent`, already installed on this machine) to the tool-config matrix. Kairo investigated Pi's real installed config surfaces directly (not from documentation) and debated all four points with Alpha before locking them (`bus-v2-f2-explore-decisions-001`, `CONSENSUS` after one `AUDIT`/`COUNTER` round):

1. **B-05 closes via F2's own write-then-readback tests, not a separate spike** — with Alpha's added condition: every merge-test fixture must start from a config already containing at least one pre-existing, unrelated MCP server entry (and other non-MCP keys where the format has them), never an empty object, or the test would pass vacuously without pinning non-destructive merging.
2. **Merge algorithm: strict per-format parser, refuse-and-diff on ambiguity, pre-edit backup** — with two added conditions Alpha caught: (a) the Claude Code/Cursor/VS Code/Gemini CLI/OpenCode/Antigravity project-config family needs a **JSONC-tolerant** parser, not raw `JSON.parse` — independently verified via `~/.cursor/argv.json` on this machine, which explicitly uses `//` comments and documents itself as such, confirming this tool family's own config-file convention; (b) Codex CLI's `.codex/config.toml` needs an explicit TOML parser added as a dependency (`package.json` currently has none) — F2's first slice must add both this and a JSONC parser alongside `@clack/prompts`.
3. **Detection via wizard checkboxes, no auto-detect for v1** — fully endorsed by Alpha without changes.
4. **Pi added to the matrix, upgraded from inferred to fully confirmed.** Investigated directly on this machine (not guessed): the real npm-global package is `@earendil-works/pi-coding-agent` (CLI binary `pi`, v0.86.1). A separate installed plugin package, `pi-mcp-adapter` (at `~/.pi/agent/npm/node_modules/pi-mcp-adapter/config.ts`), contains the actual MCP config path logic, confirmed by reading the source directly (lines 16-22, 183-197):
   - **Global**: `getPiGlobalConfigPath()` → `~/.pi/agent/mcp.json` (key `mcpServers`, `{command,args}` shape — same shape as Claude Code/Cursor/Gemini CLI).
   - **Project (Pi-specific)**: `getProjectPiConfigPath(cwd)` → `<cwd>/.pi/mcp.json`.
   - **Project (shared)**: `getProjectConfigPath(cwd)` → `<cwd>/.mcp.json` — **Pi also reads the same project file Claude Code uses.** This is new information beyond the original exploration: `.mcp.json` is a multi-tool shared surface (at least Claude Code + Pi), so F2's merge logic and `doctor` checks must treat writes to it as affecting more than one tool, not as single-owner.

No new backlog items filed from this debate; the three conditions above are carried directly into `sdd-propose` rather than deferred.

