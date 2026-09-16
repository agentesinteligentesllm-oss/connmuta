# ADR-0031 — npm distribution and license

> **Conmuta** is a working name pending trademark clearance (backlog B-11). Package names
> (`conmuta`, `@conmuta/*`, verified free on npm on 2026-09-15) follow the final product name.

## Status

`accepted` — accepted by the tribunal (`bus-v2-landing-architecture-001`) and confirmed by the Director on 2026-09-16 (Director note DN-04). The license is
**pending Director decision** (B-16); the tribunal's recommendation is recorded below.

## Date

2026-09-16 (UTC; consensus of the debate below).

## Debate

`bus-v2-landing-architecture-001`, round 1 proposals D8, D9 and D10, round 1 objection n3
(accepted), round 2 consensus. Record: [../05-tribunal/INDEX.md](../05-tribunal/INDEX.md).

## Context

v1 was private and never published; installs were a git pin resolved through `npx`. Measured in
production: 18.0 s to start warm against a 30 s default MCP timeout, because `npx` against a
`github:` source re-resolves and reinstalls on every start and runs `tsc` in `prepare`
(`telegram-agent-bus/docs/UPGRADE-v1.0.1.md:161-178`). `npm install -g github:…` fails on npm 11
because a global install skips `devDependencies` and the build script has no compiler
(same file). Bare `npx` in Windows MCP configs also yields `spawn npx ENOENT`
(`research[packaging-runtime]`; `critic.top_blockers[8]`).

The name `agentbus` is taken on npm (by another maintainer), on PyPI and as a GitHub org
(`research[prior-art-naming]`). No LICENSE, CONTRIBUTING, SECURITY or CHANGELOG exists in v1
(`maps[governance-docs].key_facts[44]`).

## Options considered

| Concern | Option | Trade-off | Outcome |
|---|---|---|---|
| Distribution | `npx github:` pin (v1) | 18 s per start > 30 s MCP timeout; silent no-tools failure; no cache. | Rejected — **never `npx`** |
| Distribution | npm publish: compiled `dist` + `npm-shrinkwrap.json` + `files` whitelist | Reproducible tree on every machine (shrinkwrap is documented for globally installed CLIs and daemons); no signing burden because the trusted `node` binary executes it. | **Chosen** |
| Distribution | Node SEA single binary | Still experimental (Stability 1.1); `--build-sea` absent in Node 24; needs per-OS signing/notarization. | Deferred — possible second channel later |
| Distribution | Bun compile | 57–105 MB binaries; second runtime semantics; forbids `node:sqlite`. | Rejected |
| Runtime floor | Node ≥ 22 (v1 ADR-01) | `node:sqlite` unflagged only from 24. | Superseded |
| Runtime floor | Node ≥ 24 LTS | Active LTS as of 2026-09-15; the installer's **first** gate, before touching disk or git, with an explicit error and download link; records the node executable used (nvm/fnm aware). | **Chosen** (B-17) |
| License | Apache-2.0 | Explicit patent grant; used by peer projects in the surveyed prior art. | **Chosen** — Director, 2026-09-16 (DN-04); `LICENSE` holds the verbatim text |
| License | MIT | Dominant among the surveyed "agent bus" competitors; no patent grant. | Rejected |

## Decision

1. **Publish to npm** as `conmuta` (CLI, daemon, thin client) with satellites under `@conmuta/*`.
   The tarball ships compiled ESM `dist`, `npm-shrinkwrap.json` and a `files` whitelist; sources,
   tests, transcripts and any secret-shaped file are excluded.
2. **Never `npx`.** Every MCP entry the installer writes uses an id-only stdio command
   (`conmuta mcp --project <id>`) resolved to an installed binary, never `npx`.
3. **Node ≥ 24 LTS** is the runtime floor and the installer's first gate (B-17). TypeScript ESM,
   `node:test`, strict TDD (red before green; every `src` file has a test counterpart).
4. **Windows first**; macOS supported only after a real smoke test (B-12).
5. **Install hygiene**: `npm ci --ignore-scripts` from the committed lockfile; the installer never
   writes `enableAllProjectMcpServers: true`; the repository ships no hooks or settings that execute
   code on open (`research[security-isolation]` T11, T12).
6. **License**: Apache-2.0 recommended for the patent grant; the LICENSE file is written when the
   Director confirms (B-16). Repository hygiene set for open source: LICENSE, SECURITY.md with the
   five invariants, CONTRIBUTING.md, CHANGELOG.md, secret scan in the release checklist.
7. **Name**: working name Conmuta; IMPI/EUIPO screening pending against "Conmuta Soluciones
   Tecnológicas S.L." (class 42); fallback Emisario; the Director decides (B-11). npm scope, GitHub org
   and domain are reserved the same day the name is decided.

## Consequences

- v1 peers stay on their git-pinned install until the migration runbook (B-13); the wire policy
  (emit `AGENTBUS/2`, accept `/1` and `/2`) keeps both products interoperable.
- A single-binary channel (SEA) can be added later without changing this ADR's npm channel; it
  would need a signing budget (Azure Trusted Signing, Apple Developer ID — the same budget the F8
  tray shell needs).
- `engines.node >= 24` in the new product only; the v1 bridge keeps its own floor for live peers.
- Publishing with provenance/OIDC and 2FA is required by the release checklist (T11).

## Supersedes

- Amends [0001](0001-runtime-node-typescript.md) in part: the Node floor (22 → 24) and the
  distribution premise ("byte-identical distribution via one `npx` line" → published npm package).
- Nothing else; [0002](0002-build-from-scratch-minimal-deps.md) is amended by
  [0030](0030-sqlite-ledger-and-json-registry.md), not here.

## Tests that must pin it

| Guarantee | Test |
|---|---|
| No `npx` anywhere in generated config | Installer test: every written MCP entry (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`, `opencode.json`, `.codex/config.toml`, Antigravity) is asserted free of `npx`. |
| Tarball contents | Pack test: `npm pack --dry-run` lists `dist/**`, `npm-shrinkwrap.json`, `package.json`, `README.md`, `LICENSE` and nothing from `src/`, `test/`, transcripts or `.env`-like files. |
| Node gate is first | Installer test on a fake Node < 24: exits with the explicit error and download link with zero filesystem writes and zero git calls. |
| Install without scripts | CI job installs the packed tarball with `--ignore-scripts` on a clean Node 24 and starts the thin client within the MCP timeout; the timeout value is a named constant. |
| No secret-shaped string in the repository | Release checklist and CI secret scan with the bot-token regex over the tree and the tarball. |
| Windows-first claim | CI matrix runs on `windows-latest`; the macOS job is added only when B-12 is done. |
