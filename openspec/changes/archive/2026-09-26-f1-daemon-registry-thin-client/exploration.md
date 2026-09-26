<!-- sdd-explore artifact for change f1-daemon-registry-thin-client.
     Persisted in hybrid mode: this file + Engram topic sdd/f1-daemon-registry-thin-client/explore (obs #3073).
     The explore executor had no file-write tool; the orchestrator materialized this file verbatim from the Engram record on 2026-09-16. -->

## Exploration: F1 — Daemon, registry, thin client, migration (`f1-daemon-registry-thin-client`)

### Current State

Conmuta v2 is at F0 landing: 45 Markdown docs, zero source code (`openspec/config.yaml`). The F1 SDD change is the first to write code. Its authoritative scope is `docs/07-plan/WORK-PLAN.md` F1 row: daemon (long-poll <=50s, lock, heartbeat, idle rule), `registry.json` + `node:sqlite` ledger (ADR-0030), IPC handshake (ADR-0029), thin client with `--project` + cwd cross-check, `conmuta.json` schema (B-18), secret store + fallback (B-15), unilateral migration from `~/.agentbus` (B-13), v1 pure modules imported as a library (D1).

The v1 reuse source is `telegram-agent-bus` at tag `v1.0.2` + 2 commits (`bf8f365`), frozen, never modified. v1 is single-tenant by construction: one process binds one home/config/token/chat_id/roster/state/lock at startup (`src/index.ts:250-269`, `src/config.ts:173-184`). v2 replaces this with one daemon per OS user as sole `getUpdates` consumer (ADR-0029) and per-project thin stdio MCP clients talking to it over authenticated loopback IPC, isolated by a bijective bot<->group<->project binding (ADR-0028) and backed by a `node:sqlite` ledger + human-editable JSON registry + OS keychain (ADR-0030).

### Q1 — Reuse matrix (module-by-module)

| v1 module | Verdict | Why / destination in v2 |
|---|---|---|
| `src/telegram.ts` (`TelegramClient` iface, error taxonomy, `TelegramApiClient`, `requestTimeoutMs`) | **AS-IS**, daemon-only | Zero Telegram-specific logic changes. Moves entirely into the daemon bundle — the client bundle must hold no reference to it at all (THREAT-MODEL PT-07: static assertion that the client bundle has no `api.telegram.org` reference). |
| `src/envelope.ts` (schema, `encodeEnvelope`/`decodeEnvelope`, `normalizeBody`, wire regexes) | **AS-IS**, shared | Pure, no I/O. Used identically by the daemon on ingest (decode) and send (encode). No wire change (W1) means no schema edits. |
| `src/secrets.ts` (`checkForSecrets`) | **AS-IS**, daemon-side | Pure function, zero I/O, zero network. Reused verbatim in the daemon's send validation pipeline (Invariant 5 layer 6). |
| `src/transport/{types,group,direct,dual}.ts` | **AS-IS**, daemon-side | No structural change; OVERVIEW.md §5 already specifies "one `DualWriteTransport` per binding" — same classes, constructed per binding instead of once per process. |
| `src/protocol.ts` (`applyEnvelope`, `isOurBusiness`, `isAddressee`, `classifyRejection`, `selectTiered`, `isNeedsAction`, `computeWorkDigest`) | **SEAM** | `applyEnvelope`/`selectTiered`/`isNeedsAction` are pure and reusable, but must operate over one binding's `threads` view (DATA-MODEL §3.3) instead of a process-wide `State`. `computeWorkDigest` (protocol.ts:357-383) bakes in a SINGLE `last_surfaced_digest`/`first_surfaced_at` per thread — in v2 those become per-client (client_cursors), so its callers must be rewritten to pass per-client surfaced flags; the function body itself needs only a seam, not a rewrite. |
| `src/config.ts` (named constants; `configFileSchema`/`rosterEntrySchema`; `computeIsMainModule`) | **SEAM** | All named constants port as-is into a v2 constants module (CONSTITUTION §5 named-constant rule). `configFileSchema`'s SHAPE is the exact target type DATA-MODEL.md §1 derives per binding from `conmuta.json` + registry ("Derivation for reused v1 modules"). `loadConfig`/`resolveBotToken` (file+env token read) are **NOT reused** — replaced by registry hot-reload + secret store (Invariant 2 forbids env-token traversal, which `resolveBotToken` at `config.ts:239-250` does today). |
| `src/state.ts` — locking primitives (`acquireLock`/`releaseLock`/`isProcessAlive`/`lockAgeSeconds`, lines 463-602) | **AS-IS (seam)**, daemon + client | ADR-0029 cites this file by name for the daemon's singleton election AND the client's spawn lock ("`wx` lock + pid + heartbeat" pattern). Ports conceptually unchanged. |
| `src/state.ts` — whole-file JSON persistence (`loadState`/`saveState`, lines 388-456) and its `stateSchema`/`migrateToCurrent` | **REPLACED** | This is exactly the "closed-permanently, reopened" item ADR-0030 supersedes (`docs/functional-audit/06-verdict.md:171-173` in v1). `ThreadRecord`/`Conditions`/`State` TYPES and the pruning/migration REASONING port conceptually onto SQLite tables (`threads`, `audit_log`), but the file-I/O mechanism does not. |
| `src/tools/fetch.ts` lines 525-656 (classification/admission pipeline: decode, reverse-roster sender verification, `translateAddressee`, `classifyVia`, `applyEnvelope` call, outcome branching) | **SPLIT — daemon side, near-AS-IS** | Maps ~1:1 onto the daemon's receive loop (OVERVIEW §7.2 steps 1-7). Genuinely new: step 3, the `chat.id === binding.group_id OR private` scope check — v1 has no such filter at this point (`fetch.ts:436-438` only classifies via/group, it does not drop foreign chats). |
| `src/tools/fetch.ts` lines 664-927 (tiered selection, `needsAction`/`waitingOnPeer` construction, cursor/gap-warning, digest & compact-tick logic, `first_surfaced_at` stamping) | **SPLIT — becomes the daemon's per-client `fetch` IPC handler** | Pure-function bodies (`selectTiered`, `trimSurfaced`/`trimWaiting`, `wrapUntrusted`) port unchanged; their INPUTS change from one shared `state` to a per-client cursor + per-client surfaced-set. See Q2 for the exact coupling evidence. |
| `src/tools/fetch.ts` — the single `acquireBridgeLock`/`release` wrapping the WHOLE function (390-401, 500-501, 928-930) | **REPLACED** | One process-wide lock serializing fetch+send becomes (a) one per-token poll/write-ahead transaction in the daemon and (b) a separate per-binding in-daemon mutex for tool calls — never a filesystem lock (OVERVIEW §7.4: "Clients never receive `BRIDGE_BUSY`"). |
| `src/tools/send.ts` (`sendInputSchema`, `checkLoopPrevention`, `checkSecretBackstop`, `resolveRecipients`/`checkRecipientsKnown`) | **SEAM** | Validation pipeline reused nearly as-is against the ledger's `threads` table. `sendInputBaseSchema` (send.ts:47-54) already has no `from`/destination field — this is PT-02's basis. Genuinely new: the `chat_id === binding.group_id` assertion (Invariant 1) — v1 never needed it because one process implied one chat_id. |
| `src/index.ts` (`createServer(deps)` injection shape; the four zod input schemas; `toToolErrorPayload`/`toTelegramErrorPayload`) | **SEAM** | `deps: {config, client, transport, homeDir}` (index.ts:112-125) is the literal template OVERVIEW.md cites for "the deps become IPC stubs". The four schemas (`fetchInputSchema`, `statusInputSchema`, `threadInputSchema`, `sendInputSchema`) port as-is as the thin client's MCP-facing validation. Handler BODIES must be rewritten to make an IPC call instead of an in-process call, and a new `DAEMON_DOWN` path must run before any of them. |
| `test/security.test.ts` predicates (`hasChildProcessReference`, `hasFsModuleReference`, etc., lines 44-101) | **AS-IS**, both bundles | Pure string-scanning, zero I/O. Directly reusable for client, daemon, and installer bundles; only the bundle-scan tables (THREAT-MODEL §5.6) differ per bundle. |
| `test/fakes/telegram.ts` (`FakeTelegramClient`, `deliveredText`) | **AS-IS**, test library | Reusable unchanged for daemon-side poller/send-path tests. |
| `src/doctor.ts` | Cited but **not read in this pass** (outside the given file list) | OVERVIEW.md cites `src/doctor.ts:100-143` as reused and re-scoped per binding/tier (F2, not F1) — flagged for completeness, not verified line-by-line here. |

### Q2 — The daemon boundary and the cursor==presentation coupling

**What moves into the daemon:** per-token long-poll loop, the admission/classification pipeline (fetch.ts:525-656 reused near-as-is), the durable inbox write (write-ahead, before offset confirm — Invariant 3), the audit log, hot-reload of `registry.json`, the send-path binding assertion, and the singleton/spawn locks (state.ts:463-602 reused).

**What stays in the thin client:** the four-tool MCP surface (`agentbus_send`/`fetch`/`status`/`thread`, unchanged names per OVERVIEW §8), binding resolution (`--project` + `conmuta.json` walk-up), and the IPC handshake — nothing secret, no token, no ledger handle.

**Exact coupling evidence (v1 `src/tools/fetch.ts`):**
1. One lock scope wraps everything: `acquireBridgeLock` at 390-401/500-501, released only at 928-930 (`finally`). Admission (525-656) and presentation (664-927) run inside the SAME critical section.
2. The cursor (`next_update_id`, computed at line 786) is persisted in the SAME `saveState` call (867-878) as `last_surfaced_digest` (872) and every `ThreadRecord.first_surfaced_at` stamp (836-854) — one `finalState` object, one write.
3. The root cause is the data model: `state.ts:67` (`ThreadRecord.first_surfaced_at`) and `state.ts:123` (`State.last_surfaced_digest`) are single, process-wide fields, not per-client. `protocol.ts:357-383` (`computeWorkDigest`) takes one `state` and one `agentId` — no notion of "caller".
4. Practical effect: two clients calling `agentbus_fetch` race for the same lock; whichever wins both advances Telegram's cursor for BOTH clients and stamps `first_surfaced_at` for BOTH, so the loser's next call renders `body_omitted: true` (`trimSurfaced`, fetch.ts:160-172) for content it never actually saw — this is the literal `BRIDGE_BUSY`/`body_omitted` collision OVERVIEW.md and THREAT-MODEL T05 cite.

**How per-client cursors decouple it:** DATA-MODEL §3.5 `client_cursors.inbox_seq` (replaces the global `next_update_id` from each client's point of view; the bot-level Telegram offset in §3.1 `offsets.next_update_id` stays global/per-token because that is what `getUpdates` itself needs) plus the aux `client_surfaced(client_id, thread_id, first_surfaced_at)` table (replacing the global `first_surfaced_at`) and a per-client `last_surfaced_digest` (also §3.5). Two clients reading concurrently each start from their OWN `inbox_seq` against the append-only `updates` inbox and stamp their OWN surfaced rows — no shared mutable "already shown" flag, which is exactly PT-11's pinning test.

### Q3 — IPC contract seams

- The four v1 `src/index.ts` zod schemas (`fetchInputSchema` 29-34, `statusInputSchema` 37, `threadInputSchema` 40-42, and `sendInputSchema` from `send.ts:47-109`) map 1:1 onto four daemon-facing operations the thin client's IPC stub calls after the handshake (`agentbus_send`→send endpoint, `agentbus_fetch`→per-client fetch endpoint, `agentbus_status`/`agentbus_thread`→local-read endpoints per OVERVIEW §7.4, no Telegram call).
- **Genuinely new semantics, not in v1:** `timeout_s` today (fetch.ts:510-514) IS the long-poll — the MCP call blocks on `client.getUpdates({timeout: input.timeout_s})` directly. In v2 the daemon already long-polls Telegram continuously (ADR-0029 decision 1), so a client's `timeout_s` must mean "block THIS IPC call up to N seconds waiting for new rows past my `inbox_seq`" — a long-poll against the ledger, not against Telegram. This distinction is not yet stated anywhere in the docs and should be made explicit in the F1 spec (see Q8).
- **`DAEMON_DOWN` error taxonomy:** v1's `toTelegramErrorPayload`/`toToolErrorPayload` (index.ts:77-99) classify only Telegram/tool errors and require the client bundle to import `telegram.ts` — which PT-07 forbids for the v2 client. `DAEMON_DOWN` (and `WRONG_ROOM`, `UNBOUND_PROJECT`) must therefore be raised by a small, client-local error-payload constructor that mirrors the SAME shape (`{code, message, retryable, retry_after_s?, new_chat_id?}`, index.ts:45-51) without depending on `telegram.ts`'s classification — this is new code, not reuse, and it runs BEFORE any `Authorization` header per the OVERVIEW §9 handshake sequence, so zero network calls occur on the `DAEMON_DOWN` path (WORK-PLAN F1 validation criterion).

### Q4 — Approaches: resolving the lazy-spawn vs no-`child_process` tension (ADR-0029 Consequences, THREAT-MODEL §5.6/PT-27)

1. **Option A — Scope the static assertion to one allow-listed spawn call site**
   - Description: keep one compiled client bundle; allow exactly one file/call site to reference `child_process`, verified structurally: single call site, `spawn()` called exactly once, a compile-time-constant argv array (`[daemonEntryPath]`), `shell: false`, `detached: true`.
   - Pros: matches ADR-0031/D9 ("one compiled `dist`, never `npx`" — a single product to publish/install); no new npm bin entry, no second `files` whitelist to audit (PT-21); the daemon target is static and code-signed by the same publish either way, so the actual attack surface (no shell, no user-controlled argv) is identical to Option B.
   - Cons: turns the client bundle's "no `child_process` anywhere" scan (test/security.test.ts:44-46 pattern) from a clean boolean into a narrower, more complex allow-listed assertion (must verify absence everywhere ELSE plus the exact shape at the one permitted site) — higher risk of "assertion rot" if a later change loosens the allow-list without noticing.
   - Effort: Low-Medium — one predicate rewrite plus a handful of shape-specific unit tests.

2. **Option B — Separate launcher binary**
   - Description: the thin client's OWN compiled bundle stays 100% `child_process`-free (identical, absolute invariant to v1's today). A physically separate compiled unit (its own `dist/launcher.js`, its own npm bin entry) is the only place that spawns the daemon; the client bundle's static scan excludes that unit entirely — the same treatment THREAT-MODEL §5.6 already gives the installer/doctor CLI ("excluded from the exec assertion").
   - Pros: the artifact closest to the coding agent (the MCP client an IDE spawns directly) keeps a literally absolute, zero-exception invariant — the strongest possible reading of ADR-06 layer 1 for that specific bundle.
   - Cons: a second compiled entry point and a second `package.json` bin (more packaging surface for PT-21's `npm pack --dry-run` whitelist check); the client still has to invoke the launcher somehow (still one exec, just relocated to a file the scan does not cover) — so the actual runtime attack surface does not shrink, only the SHAPE of the static test changes; adds one more thing the installer must wire and document.
   - Effort: Medium — new package/bin entry, packaging changes, doctor/installer updates to reference two entry points instead of one.

**Recommendation: Option A.** D9 already commits to one compiled dist and never `npx`; a second launcher bin buys a marginally cleaner static assertion for a real packaging cost, while the underlying runtime guarantee (no shell, fixed target, no argv injection) is identical either way. Encode Option A in the F1 spec as one module (e.g. `src/daemon-lifecycle/spawn.ts`) with its own falsifiable, multi-clause test (exactly one match for the predicate in the bundle; `spawn()` called exactly once; argv is a literal array; `shell` is `false`) — this is what turns PT-27 from "a requirement, not a settled assertion" (THREAT-MODEL's own wording) into a real pinning test, per CONSTITUTION §1's governing rule.

### Q5 — Migration from `~/.agentbus` (B-13)

v1 `config.json` schema (`config.ts:173-184`, via `configFileSchema`) and `state.json` schema (`state.ts` — `ThreadRecord`/`State`) map onto a synthesized `registry.json` + first binding per DATA-MODEL.md §6:

| v1 source | v2 destination |
|---|---|
| `config.json.agent_id`, `bot_username`, `roster[agent_id].user_id` | `registry.bots[]` (`bot_id` = that `user_id`, `username` = `bot_username`); the future `binding.agent_id` |
| `config.json.chat_id` | `registry.groups[]` (`group_id`) |
| `config.json.roster` | `roster_snapshot` for the future binding; proposed `roster` for the project's `conmuta.json` |
| `config.json.bot_token` / env `AGENTBUS_BOT_TOKEN` | Secret store under `bot:<bot_id>`; dropped from the JSON copy (backup keeps it) |
| `state.json.next_update_id` | `offsets.next_update_id` |
| `state.json.threads` (+ history) | `threads`/`thread_history` via the v1 loader and `migrateToCurrent` (state.ts:333-367) |
| `state.json.seen_eids` | `seen_eids` aux or `UNIQUE(project_id, eid)` on `updates` |
| `last_surfaced_digest`, `first_surfaced_at` | **Dropped** — they become per-client |
| `lock` | **Not migrated** |

**What cannot be migrated:** project assignment itself — v1's `config.json` carries no project/path field at all (`config.ts:173-184`), so `project bind` stays a mandatory human action regardless of migration. And the cursor after a >24h gap: `state.json.next_update_id` migrates verbatim (state.ts:116), but if the v1 bridge was not actively fetching for more than `BOT_API_RETENTION_HOURS` (24h, `config.ts:58-59`) before migration runs, Telegram has already permanently dropped whatever updates existed past that offset — migration cannot detect or recover that silent loss; it can only carry the stale cursor forward and let the v2 daemon's own `gap_warning`-equivalent report the fact going forward, never the lost content itself.

### Q6 — Secret store (B-15) and the ACL question

**`@napi-rs/keyring` feasibility:** confirmed via npm/unpkg inspection — the package publishes per-platform optional-dependency packages, including `@napi-rs/keyring-win32-x64-msvc` (current release line up to 1.1.9) and `@napi-rs/keyring-darwin-arm64` (published, pinned to the parent version — 1.1.3 in the inspected manifest, parent package now at 1.3.0). Both of Conmuta's Windows-first/macOS-second target platforms have actively maintained prebuilds; B-15's central risk (no prebuild coverage) is not present for these two platforms based on this evidence. Remaining B-15 work is verification (round-trip test, PT-09), not a design fork.

**ACL fallback and whether it needs a child process:** already answered by THREAT-MODEL §5.5, not open. `icacls` (Windows) / `chmod 600` (POSIX) is run exactly ONCE by the installer/doctor CLI — which THREAT-MODEL §5.6 already scopes as a THIRD bundle explicitly excluded from the no-exec assertion ("it may spawn `icacls`... so it is excluded from the exec assertion"). Files the daemon creates later (identity file, ledger, fallback token file) inherit that DACL via Windows ACL inheritance on the parent `~/.conmuta` directory — the daemon itself never runs `icacls` and keeps PT-28's "no `child_process`" invariant intact. This is a SEPARATE, already-settled question from Q4's lazy-spawn tension (which concerns the CLIENT bundle, not the installer/doctor bundle).

### Q7 — `node:sqlite` on Node 24

Confirmed via nodejs.org docs (fetched `beta.docs.nodejs.org/sqlite.html`, current at Node 24.15.0 "Krypton" LTS) and the v24.15.0 changelog: stability progressed `--experimental-sqlite` flag (22.5.0) → "no longer behind the flag but still experimental" (23.4.0/22.13.0) → **"Stability: 1.2 – Release candidate"**, reached at 24.15.0 (per `nodejs/node@aaf9af1`, "sqlite: mark as release candidate"). API surface needed by ADR-0030 is present: `DatabaseSync.exec()` supports `PRAGMA journal_mode = WAL`; `prepare()` returns a `StatementSync` with `get`/`all`/`run`/`iterate` (prepared statements); `database.isTransaction` plus raw `BEGIN`/`COMMIT` via `exec`/`run` cover transactions, though (unlike `better-sqlite3`) there is no documented high-level `db.transaction(fn)` wrapper — the F1 spec should confirm the exact transaction idiom against the pinned Node build rather than assume one. **Recommendation:** pin the F1/CI Node floor to `>=24.15`, not merely `>=24` — OVERVIEW §12 already says "RC on 24.15+", and only that point release removes the experimental-stability warning ADR-0030 objection n3 was raised against.

Sources: [Node.js v24.15.0 SQLite docs](https://beta.docs.nodejs.org/sqlite.html), [nodejs/node v24.15.0 release](https://github.com/nodejs/node/releases/tag/v24.15.0), [@napi-rs/keyring-win32-x64-msvc](https://www.npmjs.com/package/@napi-rs/keyring-win32-x64-msvc), [@napi-rs/keyring package.json (unpkg)](https://app.unpkg.com/@napi-rs/keyring@1.1.3/files/package.json).

### Q8 — Open questions and risks, ranked, with spike dependency precision

1. **HIGH — Lazy-spawn vs no-`child_process` (Q4).** Must be settled in the spec before apply (WORK-PLAN F1 risk row); blocks PT-27, which blocks Invariant 5/ADR-06 L1 conformance, which CONSTITUTION §1 requires before any runtime guarantee can be claimed. Depends on **no F0 spike** — this is a design decision the F1 spec author makes directly (recommendation: Option A, above).
2. **HIGH but narrow — B-08 (IPC handshake, named-pipe DACL).** ADR-0029's Decision section has ALREADY chosen loopback HTTP + HMAC as the "Hardened" transport; named pipe is explicitly "Deferred — spike B-08." **F1 does not need B-08's outcome to proceed** with loopback HTTP+HMAC as specified in OVERVIEW §9 — B-08 only decides whether a named pipe is LATER added as an alternative transport. WORK-PLAN's phrasing ("IPC design depends on B-08") should be read narrowly: it gates a future transport option, not the F1 core.
3. **MEDIUM, narrow slice — B-07 (bot-to-bot group visibility AND/OR).** Per WORK-PLAN itself, this gates only "the admin requirement" — specifically whether §3's "bot never holds an admin role" rule and doctor's PT-32 assertion stay unconditional or need a documented exception. It does **not** gate the binding/registry/ledger/IPC-handshake core of F1.
4. **MEDIUM — ADR-0018 null-anchor reconciliation (THREAT-MODEL §5.7).** Not a spike dependency; a careful-spec-writing item. v1 fails open on a null `to_user_id` anchor (`protocol.ts:98-99`); v2 replaces that with a counted `unanchored` rejection (PT-17) while keeping the wire unchanged (D1) — THREAT-MODEL §5.7 already states "the F1 spec must confirm this reading against the thread state machine," so this is a required, well-scoped spec task, not an open research question.
5. **MEDIUM → now largely resolved by this exploration — B-15 (keyring prebuilds).** See Q6: prebuild evidence for both target platforms exists; remaining work is a verification test, not a design fork.
6. **MEDIUM — `node:sqlite` transaction API confirmation (Q7).** A short, direct spike against the pinned Node build (no ADR needed) to confirm the exact BEGIN/COMMIT idiom before the ledger's write-ahead transaction (Invariant 3) is implemented.
7. **LOW, accepted residual — migration cursor gap (Q5).** Already a documented, unavoidable limitation once a v1 install has been offline past `BOT_API_RETENTION_HOURS`; needs a line in the migration runbook, not a design change.
8. **ZERO F1 dependency — B-09 (host notification rendering).** WORK-PLAN scopes this explicitly to F4; it does not touch F1.
9. **LOW, F1-internal — `project_id` format (UUID v4 vs slug) and the roster-delivery-to-daemon mechanism** (DATA-MODEL §8 open points). Both are decisions the F1 spec closes directly; no external dependency.

### Affected Areas

- `docs/02-architecture/DATA-MODEL.md` — every schema here is explicitly draft and must be finalized by the F1 spec (project_id format, `needs_action` VIEW-vs-table, `seen_eids` table-vs-index, bearer derivation).
- `docs/02-architecture/THREAT-MODEL.md` §4/§5.6 — pinning tests PT-01 through PT-33 are proposed names, not files; F1 assigns real identifiers and closes PT-27's "requirement, not settled assertion" status.
- `docs/03-adr/0029-per-user-daemon-and-thin-clients.md` Consequences — the lazy-spawn tension this exploration resolves (Q4) must be recorded as a decision in the F1 spec, citing this ADR.
- v1 `telegram-agent-bus` (read-only, frozen) — every file in the Q1 reuse matrix is a citation source, never a write target.
- No `src/`, `test/`, or `package.json` exist yet in this repository — F1 is the phase that creates them.

### Recommendation

Proceed to `sdd-propose` for `f1-daemon-registry-thin-client` with: (a) Option A adopted for the lazy-spawn tension (Q4), stated as a decision the proposal must record against ADR-0029; (b) B-08 and B-07 treated as narrow, non-blocking dependencies per the precise scoping in Q8 rather than as blanket F1 blockers; (c) the `timeout_s` semantic change (Q3 — long-poll against the ledger, not against Telegram) called out explicitly as new behavior needing its own requirement in the eventual spec; (d) the Node floor pinned to `>=24.15` (Q7).

### Risks

- The lazy-spawn tension is the single item WORK-PLAN itself flags as required before spec (now addressed with a recommendation, but still needs Director/tribunal sign-off since it touches a static security assertion).
- `node:sqlite`'s exact transaction API idiom is unconfirmed against the pinned Node build — a short implementation spike is needed before the ledger's write-ahead transaction can be coded with confidence.
- The migration cursor gap after >24h offline is an accepted, unavoidable data-loss window that must be stated plainly in the migration runbook, not silently absorbed.
- `src/doctor.ts` was cited but not read in this pass (outside the given reading list) — its reuse verdict is inferred from OVERVIEW.md's own citations only, not independently verified line-by-line.

### Ready for Proposal

Yes. Hybrid persistence is complete: Engram observation #3073 and this file.
