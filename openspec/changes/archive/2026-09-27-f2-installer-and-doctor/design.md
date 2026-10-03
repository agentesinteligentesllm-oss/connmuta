# Design: F2 — Installer, requirements validator, tool config, binding, doctor

| Field | Value |
|---|---|
| Change | `f2-installer-and-doctor` |
| Implements | [ADR-0031](../../../../docs/03-adr/0031-npm-distribution-and-license.md) rules 2, 3, 5 and its installer tests; the "Add bot / Add group / Assign project" flow of [ADR-0028](../../../../docs/03-adr/0028-project-scoped-bijective-binding.md); [OVERVIEW §7.1](../../../../docs/02-architecture/OVERVIEW.md) (start at login) and §10 (F2 rows). No ADR amendment: every choice below elaborates a point the proposal or the ADRs delegated. Two documentation corrections follow from it (§12, §15 D-49, D-50) and are made in the docs slice, not by a new ADR |
| Inputs | [proposal.md](./proposal.md) (D-31..D-40, not reopened); [exploration.md](./exploration.md) and its Addendum; the merged F1 code (read, cited `path:line`); `pi-mcp-adapter/config.ts` as installed on the development machine (read-only evidence, §7.3) |
| Status | design — pending Alpha audit (DN-09) and reconciliation with the parallel `sdd-spec` output |
| Binding rules | Strict TDD; PRs ≤ 400 authored lines, auto-chained; English artifacts; placeholders only; every number a named constant |

**Read first.** §4 answers the byte-preservation question (D-36), §5 the audit-row ownership question, §6 token exposure (D-37), §8–§9 the `cli/main.ts` and IPC extension (D-39), §10 start-at-login (D-40). §15 lists every decision this design makes.

---

## 1. Technical approach

A third and fourth compile unit (`installer`, `doctor`) beside `daemon` and `client`, reusing F1 modules and adding no behavior to them except four disclosed, slice-isolated edits (§15 D-48). Every file mutation — registry, `conmuta.json`, tool configs, instruction files, the LaunchAgent plist — goes through **one** edit engine: read → strict parse → compute a minimal edit → refuse-and-diff on ambiguity → exclusive backup → temp-file + rename → read back and re-parse → semantic equality check. The online doctor tier runs inside the daemon behind a new HMAC-authenticated route that mints no session.

```text
conmuta <verb> ──> cli/main.ts (Node-floor gate) ──dynamic import──> installer/cli.ts | doctor/main.ts
   installer ── edit engine ──> tool configs, conmuta.json, AGENTS.md/CLAUDE.md, LaunchAgent plist
       │     ── registry commit: BEGIN IMMEDIATE ledger txn { audit row + registry.json rename } COMMIT
       │     ── secret store (selectSecretStore) ; getMe via TelegramApiClient (redacting)
       │     ── exec allow-list: icacls.exe, reg.exe (Windows only, absolute path, shell:false)
   doctor/offline ── registry, ledger (read-only), files, ACLs          (zero network, pinned)
   doctor/online-client ──GET /identity + POST /doctor──> daemon/ipc/doctor.ts ──> Bot API per binding
```

## 2. Layout

### 2.1 Source tree (the proposal left names to design)

| Path | Unit | Content |
|---|---|---|
| `src/installer/` | installer | `cli.ts` (verb parsing + dispatch), `constants.ts`, `prompter.ts` (port + `@clack/prompts` adapter), `file-edit.ts` (edit engine), `formats/{jsonc,toml,markdown}.ts`, `tool-targets.ts` (8-row matrix + entry builder), `launcher.ts` (node + script path), `ledger-access.ts`, `registry-commit.ts`, `token-ref.ts`, `roster-source.ts`, `exec.ts` (the only `child_process` site), `acl.ts`, `autostart.ts`, `instructions.ts` (AGENTS.md template), `wizards/{setup,bot-add,group-add,project-bind}.ts` |
| `src/registry/writer.ts` | registry | `serializeRegistry`, `validateRegistryBytes` (re-parse through `parseRegistryText`: R5 then schema then R1–R3), `replaceRegistryFile` (temp + rename) — pure of ledger |
| `src/shared/project-file-writer.ts` | shared | `serializeProjectFile`, `verifyProjectFileMatches` (reuses `parseProjectFile`) |
| `src/doctor/` | doctor | `main.ts`, `offline.ts`, `checks/*.ts`, `online-client.ts`, `report.ts` |
| `src/daemon/ipc/doctor.ts` | daemon | `POST /doctor` handler and `computeDoctorProof` |
| `test/**` | — | one twin per `src` file; `test/fixtures/tool-configs/<tool>/{populated,conflict,malformed}.*`; `test/security/installer-bundle.test.ts` |

### 2.2 Compile units

| Unit | Entry | References | Rule |
|---|---|---|---|
| `installer` | `dist/src/installer/cli.js` | `shared`, `registry`, `ledger`, `secret-store`, `daemon` | `node:child_process` only in `installer/exec.ts` (§12) |
| `doctor` | `dist/src/doctor/main.js` | `shared`, `registry`, `ledger`, `secret-store`, `daemon`, `installer` | `doctor/offline.js` closure carries no network module (§9.1) |
| `cli` | unchanged entry | adds `installer`, `doctor` | dynamic import per verb keeps the `mcp` closure unchanged (PT-07) |

### 2.3 Dependencies (ADR-0031 item 1; exact versions pinned in `package.json` and `npm-shrinkwrap.json` at apply time, never ranges)

| Package | Use | Why this one |
|---|---|---|
| `@clack/prompts` | wizard UI (`text`, `password`, `select`, `multiselect`, `confirm`, `isCancel`) | ratified stack (ADR-0031, OVERVIEW §12) |
| `jsonc-parser` (Microsoft, the VS Code parser) | parse with comments/trailing commas; `modify` + `applyEdits` produce a **localized text edit** | the only widely used JSON library whose edit API preserves every byte outside the inserted property (D-36) |
| `smol-toml` | TOML 1.0 `parse` for validation and `stringify` for the one appended table | ESM-native, zero dependencies; no TOML library is trusted to edit in place — the design does not need one (§4.2) |

Rejected: `@iarna/toml` (unmaintained, reserialize-only), `toml-patch` (small maintainer base, not needed), `json5` (reserialize-only, drops comments).

## 3. Named constants (`src/installer/constants.ts`)

Kept out of the merged `shared/constants.ts`; a twin test asserts the new exit codes collide with no `shared` `EXIT_*` value.

| Name | Value | Reasoning |
|---|---|---|
| `MCP_SERVER_NAME` | `PRODUCT_NAME` | one server name on every surface; also what makes Pi's name-keyed merge deduplicate (§7.3) |
| `EXIT_INSTALLER_REFUSED` | next free code after `EXIT_VALIDATION_FAILED` | precondition refusals, same role as `EXIT_MIGRATION_REFUSED` |
| `EXIT_DOCTOR_FAILED` | next free code | any `fail` check; `warn` alone exits 0 |
| `INSTALLER_LEDGER_BUSY_TIMEOUT_MS` | 5000 | a poll-batch commit holds the write lock for milliseconds; 5 s absorbs a burst while a human waits at a prompt |
| `BACKUP_SUFFIX_PREFIX` | `.bak-pre-conmuta-` + `YYYYMMDDTHHMMSSZ` | DATA-MODEL `*.bak-<reason>-<date>` convention; second-resolution plus `COPYFILE_EXCL` so a same-day re-run never overwrites the original backup |
| `JSON_DEFAULT_INDENT` | 2 | used only when the file has no indented line to learn from |
| `AGENTS_MD_MAX_LINES` | 200 | OVERVIEW §10.1 step 5; pinned by a test on the template |
| `AUTOSTART_RUN_KEY` | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` | OVERVIEW §7.1 |
| `AUTOSTART_VALUE_NAME` | `PRODUCT_NAME` | follows B-11 |
| `AUTOSTART_LAUNCHD_LABEL` | `` `io.${PRODUCT_NAME}.daemon` `` | reverse-DNS form launchd expects; renamed with B-11 |
| `DOCTOR_PROOF_LABEL` | `"doctor:"` | D-14 domain separation from `identity:` and `session:` |
| `REGISTRY_REPLACE_ATTEMPTS` | 3 | Windows rename-over can fail with `EPERM`/`EBUSY` while the daemon reads; bounded, then refuse with the backup intact |

## 4. The edit engine (D-32, D-36) — `installer/file-edit.ts`

### 4.1 One pipeline for every file

1. `lstat` the target and its parent: **refuse a symlink** (a rename-over would replace the link with a regular file, silently breaking the user's setup).
2. Absent file → create path (parents `mkdir`), no backup needed.
3. Present → strict parse (§4.2); parse error, non-object root, or container key of the wrong type → **refuse with the parser's position**, write nothing.
4. Same-named entry present: deep-equal to the generated one → **no-op** (idempotent re-run); different → **refuse and print a unified diff** of the entry, write nothing.
5. Compute the minimal edit; `copyFileSync(path, path + BACKUP, COPYFILE_EXCL)`.
6. Write a temp sibling, `renameSync` over the target (Windows: bounded retry, §3).
7. Read back, re-parse, assert **semantic delta = exactly one added key** and **bytes outside the edit range identical** to the original. On failure restore from the backup and refuse.

### 4.2 Per format

| Format | Parse | Edit | Why it preserves bytes |
|---|---|---|---|
| JSON/JSONC (7 surfaces) | `jsonc-parser.parse(text, errors, { allowTrailingComma: true })`, errors ⇒ refuse | `modify(text, [containerKey, MCP_SERVER_NAME], entry, { formattingOptions })` then `applyEdits` | `modify` returns one localized insertion; comments, key order and formatting elsewhere are untouched. `formattingOptions` are learned from the file: EOL (`\r\n` if present), `insertSpaces`/`tabSize` from the first indented line |
| TOML (Codex) | `smol-toml.parse` | **append-only**: ensure a trailing newline, then append `stringify({ mcp_servers: { [MCP_SERVER_NAME]: entry } })` | every original byte is a prefix of the result by construction. An inline `mcp_servers = {…}` or a conflicting dotted key makes the re-parse fail or the delta differ ⇒ refuse (step 7) |
| Markdown (`AGENTS.md`, `CLAUDE.md`) | none | `AGENTS.md`: absent ⇒ write template; present ⇒ append a block delimited by `<!-- conmuta:begin -->`/`<!-- conmuta:end -->`; identical block ⇒ no-op; different block ⇒ refuse-and-diff. `CLAUDE.md`: absent ⇒ `@AGENTS.md`; present without that line ⇒ append it | append-only |

**B-05 closure (D-31):** each of the 8 surfaces has `populated` (an unrelated MCP entry, non-MCP keys, `//` and `/* */` comments, CRLF), `conflict` and `malformed` fixtures; the test asserts byte equality of everything outside the inserted range.

## 5. Registry authoring and the R6 audit row (proposal Risks row 3)

**Decision (D-41): the installer writes its audit row directly, through the shared `appendAuditRow`, inside one `BEGIN IMMEDIATE` ledger transaction that also performs the `registry.json` rename.** Evidence and reasoning:

- `ledger/audit.ts`'s "single writer" is a single **statement spelling** shared by callers (`audit.ts:14-18`), not a single process; `migration/main.ts:411-439` already writes the ledger from a CLI process.
- An IPC-only path fails the first-run case (no daemon exists at `setup`), and making the installer spawn a daemon would add a second exec target for no gain.
- The daemon's own `BINDING_CHANGED` row (`daemon/bindings.ts:132-148`) records the **effect** when it hot-reloads; the installer row records the **human action** (R6, DATA-MODEL §2.5). Both are kept; they answer different questions, and bot/group additions produce no daemon row at all.

`installer/ledger-access.ts`: ledger absent ⇒ `openLedger()` (creates at the current version; only `setup` reaches this). Present ⇒ `new DatabaseSync(path)`, `PRAGMA busy_timeout = INSTALLER_LEDGER_BUSY_TIMEOUT_MS`, `user_version` must equal `LEDGER_SCHEMA_VERSION` else refuse. **The installer never migrates and never quarantines a ledger** — those stay with the daemon, whose file it may hold open.

`installer/registry-commit.ts`, inside `withTransaction` (`BEGIN IMMEDIATE`, `ledger/transaction.ts:147`):

1. read and validate the current `registry.json` (`parseRegistryText`);
2. apply the change; `validateRegistryBytes(serializeRegistry(next))` — the exact bytes are re-parsed, so R5, schema and R1–R3 are checked on what will be on disk;
3. `appendAuditRow` (`direction: "system"`, `outcome: "ok"`, `reason` ∈ {`REGISTRY_CREATED`, `BOT_ADDED`, `GROUP_ADDED`, `PROJECT_BOUND`}, ids populated, `client_id: null`);
4. backup, then `replaceRegistryFile`; a throw rolls back the row.

The immediate lock also serializes two concurrent wizards. A commit failure after the rename (I/O only; the write lock is already held) restores the backup and reports. The registry is reserialized (2-space JSON): it is strict JSON owned by this product, so only human whitespace is lost, and the backup keeps it.

## 6. Token intake and `getMe` (D-37)

| Step | Mechanism | Pin |
|---|---|---|
| Read | `prompter.password()` (masked); refuses a non-TTY stdin; never argv, env or a flag | test: no token in `process.argv`/env of any spawned child (there are none except §12) |
| Shape | `shared/token-shape.ts` before any network call | unit |
| Validate | `new TelegramApiClient(token).getMe()` — **the daemon's own class** (`daemon/telegram.ts:249-312`); `is_bot` must be true; `bot_id = result.id` | — |
| Errors | the URL `…/bot<token>/getMe` exists only inside `call()`; every error class redacts in its constructor (`telegram.ts:62-67`) and `TelegramNetworkError`/`TelegramProtocolError` sanitize the cause's message and stack (`:45-59,113-131`). The installer prints `err.message` only — never `cause`, never `stack` — and passes it through `redactTokenShapes` once more | RED test: an injected `fetchImpl` rejects with an `Error` whose message and stack embed the full URL; captured stdout+stderr must not match `TELEGRAM_BOT_TOKEN_RE` |
| Store | `selectSecretStore(home)` then `store.set(String(bot_id), token)` **before** the registry commit; `token_ref` from `installer/token-ref.ts` | a registry commit that fails leaves an orphan secret that the next `bot add` overwrites (idempotent) |

`token-ref.ts` duplicates `migration/main.ts:82-89`'s private mirrors; converging migration onto it is a backlog row (not a drive-by edit of a merged file).

## 7. Tool configs (D-32, D-33, D-34)

### 7.1 Launcher spelling (OVERVIEW §8 left it to F2)

**Absolute node + absolute script** (D-42): `command = realpathSync(process.execPath)`, `args = [<abs dist/src/cli/main.js>, "mcp", "--project", <id>]`, zero `env`. A bare `conmuta` resolves to `conmuta.cmd` on Windows, which fails under `spawn` without a shell exactly as `npx` does (ADR-0031 context). `realpathSync` makes it nvm/fnm-aware: fnm's per-shell `fnm_multishells` path is ephemeral. Cost: the entry is machine-specific (§16).

### 7.2 Entry per surface (one server named `MCP_SERVER_NAME`)

| Surface | Container | Entry |
|---|---|---|
| `.mcp.json`, `.cursor/mcp.json`, `.gemini/settings.json`, `.agents/mcp_config.json`, `.pi/mcp.json` | `mcpServers` | `{ command, args }` |
| `.vscode/mcp.json` | `servers` | `{ type: "stdio", command, args }` |
| `opencode.json` | `mcp` | `{ type: "local", command: [command, ...args] }` |
| `.codex/config.toml` | `[mcp_servers.<name>]` | `command = …`, `args = […]` |

Never written: `enableAllProjectMcpServers`, Codex `trust_level`, any global file, any settings/permissions file. Trust steps are printed per selected tool.

### 7.3 Pi deduplication

`pi-mcp-adapter` loads `.mcp.json` then `.pi/mcp.json` (`config.ts:558-580`) and merges server maps **by name** (`:670-728`), so one name never yields two servers. Rule (D-43): writing Pi's row targets `.pi/mcp.json` **unless** Claude Code is selected in the same run or `.mcp.json` already holds an identical entry — then Pi's write is skipped as redundant. Pi never causes a `.mcp.json` write (that file also configures Claude Code, Copilot CLI and the VS Code Agent Host, which the user may not have selected). `doctor` lists every host that reads `.mcp.json`.

## 8. CLI dispatch and wizards (D-38, D-39)

### 8.1 `src/cli/main.ts` — the whole edit (own slice)

- One new branch for `setup | bot | group | project | doctor`: the Node-floor gate first (the exact `mcp`/`migrate-v1` idiom, `main.ts:122-126`), then **no flag parsing in this file** — `await import("../installer/cli.js")` (or `../doctor/main.js`) and `return run(command, rest, io)`. Flag parsing moves to the new module, keeping the merged file's diff to one gate and two imports.
- The existing `daemon` branch accepts `start` beside `stop`: dynamic import of `client/run-state.js`'s `ensureDaemonRunning()` (already audited, D-01 spawn site unchanged). Needed by D-40's Windows launcher (§10); an addition under the existing `daemon` namespace, not a new installer verb.
- `USAGE_LINES` gains six lines; `test/cli/main.test.ts` updates its pinned text.

### 8.2 Wizards (`@clack/prompts` behind a `Prompter` port so tests script answers)

| Verb | Flow | Writes |
|---|---|---|
| `setup` | gate → `ensureHomeDirs` → empty registry (`REGISTRY_CREATED`) if absent → ledger → `icacls` (Windows) → start-at-login checkbox (§10) → optional chain into `bot add`/`group add`/`project bind` → offline doctor | home, registry, ledger, ACL, autostart |
| `bot add` | §6 | secret store, `registry.bots` |
| `group add` | negative id; refuse an id already present; display title | `registry.groups` |
| `project bind <path>` | absolute existing dir; pick bot, group, `agent_id`; roster from existing `conmuta.json` (verify) or composed from own bot + `unknown_senders` of that bot (read-only SELECT in `roster-source.ts`) + manual entries; R1–R3 before commit; `conmuta.json` write-if-absent or verify (R4); tool multiselect (D-33) → §7; instruction files; trust steps | `registry.projects`, `registry.bindings`, `conmuta.json`, tool configs, `AGENTS.md`, `CLAUDE.md` |

Disclosed divergence: OVERVIEW §10.2 has `group add` "build the roster", but the shipped registry schema (`registry/schema.ts:165-170`) has no group-level roster — the roster lives in `binding.roster_snapshot` and `conmuta.json`, so it is composed at `project bind`. Re-binding an already-bound project with a different binding is refused in F2 (no `unbind` verb yet).

## 9. Doctor

### 9.1 Tiers

| Tier | Default | Checks | Network |
|---|---|---|---|
| Offline/system | on | Node ≥ floor and the recorded node/script paths exist; home writable; stale `daemon.lock`/`spawn.lock` (dead pid); ledger opens **read-only** (`readOnly: true`) with `quick_check` — never quarantines; ACL on home and `secrets/` (`icacls` read on Windows, mode on POSIX, PT-19) | none |
| Registry | on | `parseRegistryText`; on `forbidden_content` explain B-30 (ordinary text such as `API_KEY=123` is refused by design); B-28 referential integrity (binding ids exist in `bots`/`groups`/`projects`); R4 per bound path; token-shape scan of `conmuta.json` and every installer-written config (PT-05 doctor half); entries match §7.2; `.mcp.json` readers; Pi duplicates | none |
| Online | `--online` | daemon-side, per binding (§9.2) | daemon only |
| DM probe | `--dm-probe --project <id>` | one binding's roster only | daemon only |

Zero-network pin (two layers): the closure of `doctor/offline.js` contains no `telegram.js`, `node:http`, `node:https`, `api.telegram.org` or `fetch(` (static); and the offline run executes with `globalThis.fetch` and `http.request` replaced by throwing spies whose call count must be 0 (runtime).

### 9.2 `POST /doctor` (D-44)

New route in `IPC_ROUTES`, handled by the **new** module `daemon/ipc/doctor.ts` — `routes.ts` is not edited.

- **Request:** `{ server_nonce, hmac, project_id?, dm_probe: boolean }`, `hmac = HMAC-SHA256(secret, "doctor:" + server_nonce)`; `dm_probe: true` requires `project_id`.
- **Auth:** the caller first runs `GET /identity` and verifies `computeIdentityProof` (`daemon/ipc/handshake.ts:48`); the handler single-use-consumes the nonce (`PendingHandshakeStore.consume`) and compares the HMAC in constant time. **No bearer is minted**, so no `MAX_ACTIVE_SESSIONS` slot is used.
- **Checks:** `getMe().id === bot_id`; `getChat(group_id)` reachable, warn when `type !== "supergroup"`; `getChatMember(group_id, user_id)` for every roster bot: fail on `administrator`/`creator` (PT-32) or `left`/`kicked` (B-28 membership). Clients come from an injected `doctorClientFor(bot_id)`: the secret store plus `TelegramApiClient`, wired in `bootstrap.ts`.
- **DM probe:** through that binding's `managed.transport` only (room guard, rate recorder), plus one `DOCTOR_PROBE` audit row. It fires only on a human-initiated IPC request, so zero autonomous emission holds and PT-28's "`sendMessage` reachable only from an IPC handler" is unchanged.
- **Response:** `{ bindings: [{ project_id, checks: [{ id, status: "pass"|"warn"|"fail", detail }] }] }`; every `detail` passes `redactTokenShapes` and carries ids only.
- **No daemon running:** the online tier reports `skipped` and never spawns one.

## 10. Start at login (D-40) — `installer/autostart.ts`

| | Windows | macOS |
|---|---|---|
| Location | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, value `AUTOSTART_VALUE_NAME`, `REG_SZ` | `~/Library/LaunchAgents/<AUTOSTART_LAUNCHD_LABEL>.plist`, mode `0644` |
| Command | `"<realpath node.exe>" "<abs dist/src/cli/main.js>" daemon start` | `ProgramArguments = [<realpath node>, <abs dist/src/daemon/main.js>]` |
| Why that target | `node.exe` is a console binary: a Run entry pointing at the daemon would hold a visible console for the daemon's whole life. The launcher exits once `ensureDaemonRunning` has spawned the detached, `windowsHide` daemon; one brief console at login is disclosed | launchd has no console; running the daemon directly is simplest |
| Write | `reg.exe add <key> /v <name> /t REG_SZ /d <data> /f` via `installer/exec.ts` | edit engine (§4), plist from a fixed template; paths XML-escaped |
| Keys | — | `Label`, `ProgramArguments`, `RunAtLoad = true`; **no `KeepAlive`**, so launchd never fights idle shutdown (`IDLE_SHUTDOWN_HOURS`); no `launchctl` call — it takes effect at next login, so macOS stays exec-free |
| Idempotence | `reg query` first: equal ⇒ no-op; our value with different data (node upgraded) ⇒ overwrite, printing old → new | identical ⇒ no-op; our label with different content ⇒ rewrite with backup |
| Removal (unchecked on re-run) | `reg delete <key> /v <name> /f`, only our value name | delete only a plist whose `Label` equals ours |
| Never | services, Task Scheduler, pm2, admin, `HKLM` | `LaunchDaemons`, `sudo` |

Autostart is a warm start, not a keep-alive: the idle policy is unchanged.

## 11. Windows ACL (secret-store spec, THREAT-MODEL §5.5)

`icacls <home> /inheritance:r /grant:r "<DOMAIN>\<user>:(OI)(CI)F"`, applied once by `setup`. **The `(OI)(CI)` flags are required**: THREAT-MODEL's literal command omits them, and without inheritable ACEs the files the daemon creates later would not inherit the grant (§15 D-49 corrects the doc). The user comes from `os.userInfo().username`, qualified by `USERDOMAIN` when present. Doctor re-reads it with `icacls <path>`.

## 12. Static assertions — `test/security/installer-bundle.test.ts`

Over the closures of `installer/cli.js` and `doctor/main.js` (built `dist`, `closure.ts`), with a non-vacuous floor:

1. `hasSettingsPathReference` and `hasDeleteMessageCallOrDefinition` are false (THREAT-MODEL §5.6).
2. `child_process` appears in `installer/exec.ts` only; its `execFile` targets are `icacls.exe` and `reg.exe` joined under `SystemRoot\System32`, with `shell: false` and no string-built command.
3. No `npx`, `enableAllProjectMcpServers` or `trust_level` literal in the closure.
4. `doctor/offline.js` closure: no network module (§9.1).

**Documentation correction (D-50):** proposal deliverable 10 and THREAT-MODEL §5.6 say "exec allowed only for `icacls`". D-40's own mechanism needs `reg.exe`, and Node has no registry API, so the allow-list becomes {`icacls.exe`, `reg.exe`}, both Windows-only, fixed argv. Alternatives: a native addon (a new native dependency) or the Startup folder (contradicts D-40's locked `HKCU\...\Run`).

## 13. Testing strategy (Strict TDD; every `src` file has a twin)

| Layer | What | How |
|---|---|---|
| Unit | edit engine; per-format merge; registry commit (rollback on rename failure; row absent after a throw); entry builder (no `npx`, zero `env`); Pi rule; autostart argv/plist bytes; doctor checks | temp dirs, injected `Prompter`, `ExecPort`, `fetchImpl`, clock |
| Integration | ADR-0031: fake Node < 24 ⇒ download link, **zero fs writes, zero git calls** (spy on `fs` write APIs and the exec port); two installs into two projects then `test:wrong-room` green; `reg.exe` round trip of a quoted data string under a **scratch** key `HKCU\Software\<PRODUCT_NAME>-test-<random>` (never the Run key), deleted in `finally`; online doctor against a real `startDaemon` with a fake Telegram factory | `windows-latest` CI |
| Static | §12 | built closures |

## 14. Invariants and wire

Wire unchanged (W1: emit `AGENTBUS/2`, accept `/1` and `/2`). I-1 is enforced by re-validating the exact bytes before commit, and pinned by wrong-room after two installs. I-2 by §6, zero-`env` entries and PT-05. I-3, I-4 and I-5 are untouched; the DM probe is human-initiated.

## 15. Decisions made in this design

| Id | Decision | Rejected | Rationale |
|---|---|---|---|
| D-41 | Installer appends its R6 row directly, in one `BEGIN IMMEDIATE` txn with the registry rename; never migrates or quarantines | IPC to the daemon (absent at first run); daemon-observed `REGISTRY_RELOAD` only (loses human attribution and bot/group events) | §5 |
| D-42 | Absolute node (realpath) + absolute script in every entry | bare `conmuta` (`.cmd` spawn failure on Windows); `cmd /c` wrapper (a shell in every entry) | §7.1 |
| D-43 | Pi writes `.pi/mcp.json` unless `.mcp.json` is written or already equal | always both (drift); `.mcp.json` for Pi (configures unselected hosts) | §7.3 |
| D-44 | `POST /doctor` in a new `daemon/ipc/doctor.ts`, HMAC `doctor:` proof, no bearer | a session bearer (needs a project, spends a session slot); editing `routes.ts` | §9.2 |
| D-45 | JSONC via `jsonc-parser` `modify`; TOML append-only with a re-parse delta check | parse-and-reserialize (drops comments, D-36); a TOML patch library | §4 |
| D-46 | Online doctor opt-in (`--online`); default run is offline | online by default (breaks the zero-network default) | §9.1 |
| D-47 | Windows autostart runs `conmuta daemon start`; macOS runs the daemon entry | Run key → daemon (lifetime console); `conhost --headless` (undocumented) | §10 |
| D-48 | Merged-file edits limited to `cli/main.ts` (dispatch), `shared/ipc-contract.ts` (route + schemas), `daemon/telegram.ts` (+`getChatMember` on the class, not the interface, so the room guard and rate recorder stay untouched) and `daemon/bootstrap.ts` (wiring) | editing `routes.ts`, `constants.ts`, `ledger/*` | freeze doctrine; each edit has its own slice (D-39) |
| D-49 | `icacls … (OI)(CI)F` | the doc's literal command | §11 |
| D-50 | Exec allow-list {`icacls`, `reg`} | native addon; Startup folder | §12 |
| D-51 | Installer-local constants plus a collision test | extending `shared/constants.ts` | fewer merged edits |
| D-52 | **Written tool-config files are gitignored, not committed** — the installer checks each target project's `.gitignore` for the written path (or its containing tool directory, e.g. `.cursor/`) and, if not already covered, appends an entry and prints what it added. Absolute node/script paths are machine-specific; a committed file breaks for a teammate on a different machine or Node install. **Doctor-side wording corrected (Arena debate `bus-v2-f2-pr-21-d52-design-001`, Alpha CONSENSUS)**: warns when a config is not `.gitignore`-covered in a git repository, never claims a file "is tracked by git" (that would need a `git.exe` subprocess call this design deliberately avoids — see D-50). **Implemented in PR-21, tasks.md Unit 13 — not in PR-01..PR-20 as this row's own prior wording implied; this decision received no spec requirement at `sdd-spec` time and no task at `sdd-tasks` time, caught by this change's own `sdd-verify` pass.** | committing as-is (breaks across machines); silently doing nothing about `.gitignore` (leaves a real footgun undisclosed); a `git.exe` subprocess call for authoritative tracked-file detection (rejected: expands D-50's allow-list, a new external-binary dependency, a new failure mode when git isn't installed) | Director decision, session 41; §16 |

## 16. Risks and open points

| Risk | Mitigation | Status |
|---|---|---|
| `jsonc-parser` ships UMD/ESM without an `exports` map; Node ESM named imports may fail | first RED test imports and exercises `modify` from the built `dist`; fallback is a default import | verify in the dependencies slice |
| Absolute paths in project configs are machine-specific; committed `.mcp.json` breaks for teammates | **D-52, implemented in PR-21** (disclosed correction — this row previously read "closed" for a decision that shipped as documentation only through PR-20, found by this change's own `sdd-verify` pass): installer ensures each written config path is `.gitignore`-covered, appending an entry if needed; `doctor` warns if a written config is not `.gitignore`-covered in a git repository | closed (PR-21) |
| Windows rename-over while the daemon reads | bounded retry, then refuse with the backup intact | designed |
| Brief console flash at login (Windows) | disclosed; removable later by a signed tray shell (F8) | accepted |
| macOS paths untestable here | concrete templates plus byte tests; empirical evidence in F6 (B-12) | deferred |
| Orphan secret when the registry commit fails | idempotent overwrite on retry | accepted |
| Four merged-file edits instead of the two the proposal named | D-48, each in its own slice | disclosed |

## Threat matrix (skill step 2a)

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Documentation-like paths | N/A — no file is classified or executed; `AGENTS.md`/`CLAUDE.md` are written as data | — | — |
| Git repository selection | N/A — no product code invokes git; the project path is an explicit absolute argument | zero-git-call spy (ADR-0031) | gate test |
| Commit state / Push state / PR commands | N/A — no VCS or PR automation | — | — |
| Subprocess spawn (`icacls`, `reg`, `daemon start`) | Applicable | one module, absolute `System32` paths, `shell: false`, literal argv plus validated path data; `daemon start` reuses the audited D-01 site | `installer/exec.test.ts` (argv shape, no shell); installer-bundle §12.2; `autostart.test.ts` |
| Local process integration (`POST /doctor`) | Applicable | identity verified before any secret-derived proof is sent; single-use nonce; constant-time HMAC; no bearer | `daemon/ipc/doctor.test.ts`: replayed nonce, wrong label (`session:` proof refused), missing `project_id` with `dm_probe` |
| Filesystem writes outside the home | Applicable | fixed relative targets under an absolute project dir; symlink refusal; exclusive backup; readback | `file-edit.test.ts`: symlink target, symlinked parent, pre-existing backup name |
| Login persistence | Applicable | opt-in only; own value name/label only; removal verified | `autostart.test.ts`: unchecked ⇒ value absent; foreign value untouched |

## 17. Suggested build order (authored src + test lines, rough)

| # | Slice | Content | Est. |
|---|---|---|---|
| 1 | deps + constants | `package.json`, shrinkwrap, `installer/constants.ts`, the ESM import RED test | ~150 |
| 2–3 | edit engine | `file-edit.ts`, `formats/jsonc.ts`, `formats/toml.ts`, `formats/markdown.ts` | ~700 |
| 4–5 | tool targets | `tool-targets.ts`, `launcher.ts`, 8 × 3 fixtures (B-05) | ~650 |
| 6–7 | registry authoring | `registry/writer.ts`, `shared/project-file-writer.ts`, `ledger-access.ts`, `registry-commit.ts`, `token-ref.ts` | ~700 |
| 8 | exec + ACL + autostart | `exec.ts`, `acl.ts`, `autostart.ts` | ~450 |
| 9–11 | wizards | `prompter.ts`, `roster-source.ts`, `instructions.ts`, four wizards, `installer/cli.ts` | ~1,100 |
| 12 | `cli/main.ts` (own slice) | dispatch, `daemon start`, usage | ~150 |
| 13–14 | doctor offline | `doctor/{main,offline,report}.ts`, `checks/*` | ~750 |
| 15 | contract + telegram (own slice) | `ipc-contract.ts` route and schemas, `getChatMember` | ~200 |
| 16 | doctor online (own slice) | `daemon/ipc/doctor.ts`, `bootstrap.ts` wiring, `online-client.ts` | ~450 |
| 17 | static + integration | `installer-bundle.test.ts`, two-install wrong-room, gate test | ~350 |
| 18 | docs | OVERVIEW §10.1/§10.3, THREAT-MODEL §4/§5.5/§5.6, DATA-MODEL audit reasons, CHECKLIST B-05/B-17 | ~200 |

Total ≈ 5,850 lines over ≈ 18 chained PRs. `400-line budget risk: High`, expected; `sdd-tasks` slices as above.
