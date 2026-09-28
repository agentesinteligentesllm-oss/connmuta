# Exploration: F3 — local web panel, roster sync, version observability

## Current State

F3 is greenfield: no `panel` code exists anywhere in `src/` (confirmed by search — the only two
source hits for "panel" are doc comments explicitly deferring it: `src/shared/ipc-contract.ts:93`,
*"`/panel/*` is F3 scope and is deliberately not a member of this table [`IPC_ROUTES`]"*, and
`src/registry/loader.ts:18`, which lists "panel" only as a future human actor for R6). F1 and F2 are
both fully implemented and archived on `main` (HEAD `e0fadec`), and they already shipped every piece
of infrastructure F3's three deliverables sit on top of:

**1. The daemon's loopback HTTP transport and handshake (reusable pattern for the panel's own auth).**
`src/daemon/ipc/server.ts` builds a `node:http` listener bound to `IPC_LOOPBACK_HOST` on
`IPC_EPHEMERAL_PORT` (`= 0`, OS-assigned — `src/shared/constants.ts:282`), with a closed,
exact-match route table (`IPC_ROUTES`, `src/shared/ipc-contract.ts:95`) checked via `routeKeyFor`
(`server.ts:97-100`) and a mandatory `Host` header check against `${IPC_LOOPBACK_HOST}:${boundPort}`
before any route lookup (`server.ts:219-228`). `src/daemon/ipc/handshake.ts` implements the
nonce-challenge / HMAC-proof identity check (`GET /identity`), and `src/daemon/ipc/sessions.ts`
mints a per-session bearer only after that proof verifies (`SessionStore.mint`,
`sessions.ts:81-92`), bounded by `MAX_ACTIVE_SESSIONS` (`= MAX_PENDING_HANDSHAKES`,
`constants.ts:271`). This whole stack is ADR-0029's per-boot-secret handshake (rule 3, `docs/03-adr/
0029-per-user-daemon-and-thin-clients.md:54-58`), already built, tested and audited for the MCP
client. THREAT-MODEL.md T18/PT-29 (`docs/02-architecture/THREAT-MODEL.md:112,152`) already specs the
panel's OWN security bar in the same terms — bind `127.0.0.1` only, random port, per-boot token,
Origin/Host validation — but as a **separate, not-yet-built** control, not as "reuse the MCP
handshake directly."

**2. `SERVER_VERSION` already exists.** `src/shared/version.ts:9` exports
`SERVER_VERSION = "2.0.0-alpha.0"`, asserted equal to `package.json`'s version by
`test/shared/version.test.ts`. `GET /identity`'s response already surfaces it as `build`
(`handshake.ts:153`, consumed client-side for `DAEMON_VERSION_MISMATCH` per `routes.ts:15-21`) — but
that is an MCP-client-only, never-rendered-to-a-human use of the same constant. Nothing today puts
`SERVER_VERSION` (or the wire protocol version, the `2` in `AGENTBUS/2` — `PROTOCOL_SENTINEL` in
`src/shared/envelope.ts`) in front of a human.

**3. The render-only/wire-canonical split already exists and is the exact mechanism amendment A1
needs.** `src/shared/envelope.ts:175-183` (`renderHeader`) builds the one-line header from closed-enum
fields only, and is called from BOTH `encodeEnvelope` (`:206-208`, the canonical wire text used for
`eid` dedup and the 4096-char length guard — **must never change**, ADR-05c) and `renderMessageHtml`
(`:235-245`, the HTML presentation that bolds the header and collapses the sentinel line into an
expandable blockquote — **presentation-only, verified byte-identical on the wire**, per the module's
own 2026-08-15 live-API note). A version stamp riding "the render-only header of posts the agent sends
anyway" can only be correct if it is added inside `renderMessageHtml`'s own composition (the `<b>...</b>`
line or a sibling line within that function), never inside `renderHeader` itself — `renderHeader` is
shared with `encodeEnvelope`, so touching it would leak the version onto the wire and violate B-14's
own "never on the wire" acceptance criterion.

**4. The registry, ledger and roster-drift machinery the panel reads and the roster-sync deliverable
extends.** `src/registry/schema.ts` defines `Registry` (bots/groups/projects/bindings) and
`RegistryBinding.roster_snapshot`/`roster_hash` (`:94-104`) — DATA-MODEL.md:100 states this snapshot
is "copied from `conmuta.json` at bind time; refreshed by roster sync (F3)". Critically, **roster
drift DETECTION already ships** (F1 PR-31): `src/daemon/ipc/routes.ts:139`
(`ROSTER_DRIFT_CONDITION = "roster_drift"`) is raised in `POST /session`'s response when a client's
forwarded `roster_hash` disagrees with the binding's stored one, and per its own doc comment "never
auto-resolved; the session is still minted." There is **no code anywhere that resolves this
drift** — no re-read of `conmuta.json`, no accept/apply path that recomputes `roster_snapshot` and
`roster_hash` and writes them back through `registry/writer.ts`'s `replaceRegistryFile`. "Roster sync
(F3)" is that missing resolution mechanism, not the detection (already done).

**5. `registry/writer.ts` (F2) is the safe write primitive roster sync and any panel-driven registry
edit would reuse.** `replaceRegistryFile` (`writer.ts:105-136`) validates the exact bytes about to
land against the same `parseRegistryText` the daemon's loader uses, then atomically
temp-write-then-rename; a validation failure makes zero filesystem calls. This is registry-authoring's
existing "validate-before-replace" contract (design.md D-41, cited in the module doc) and is the
correct target for any new sync/apply write, not a new ad-hoc write path.

**6. The daemon's boot/reconcile loop (`src/daemon/bootstrap.ts`) is the mounting point for the panel
server and any periodic roster check.** `startDaemon` (`bootstrap.ts:106-326`) already builds
`IpcServerDeps.handlers` as a single mutable object, populates it once the per-boot secret is known
(`:158-204`), and runs `BindingsReconciler.reconcile()` on every heartbeat tick
(`:262-268`, `HEARTBEAT_PERIOD_MS`). A panel server and/or a roster-sync check would most naturally
extend this same composition root — either as more entries in the same `handlers` map (if reusing
`createIpcServer`) or as a second listener started alongside it — and any periodic roster check would
be a natural sibling to the existing `reconciler.reconcile()` call inside `tick()`.

**7. `src/ledger/schema.ts`'s `LEDGER_SCHEMA_DDL`** defines every table the panel's "counters and
pending unknown senders" view would read: `offsets`, `updates`, `threads`, `thread_history`,
`client_cursors`, `client_surfaced`, `audit_log`, `unknown_senders`, `binding_state`, `conditions`.
`src/ledger/unknown-senders.ts` is already the exact pending-unknown-sender store B-14's sibling
deliverable needs (`first_seen_at`/`last_seen_at`/`count` per `(bot_id, user_id)`, no body column —
ADR-0028 rule 6's privacy claim). `src/installer/roster-source.ts`'s `composeRoster` already reads
this same table (read-only) to offer unknown senders as roster candidates during `project bind` — a
precedent for how the panel would surface the same rows for a human decision, not a new query shape
to invent.

## Affected Areas

- `src/daemon/bootstrap.ts` — mounting point for the panel HTTP surface (or a second listener) and any
  periodic roster-sync check inside the existing heartbeat `tick()`.
- `src/daemon/ipc/server.ts`, `src/shared/ipc-contract.ts` — the existing exact-match route dispatch
  (`IPC_ROUTES`, `routeKeyFor`) does not support prefix/wildcard paths, which a static SPA (`/panel/`,
  `/panel/app.js`, `/panel/api/overview`, …) needs; this is the first open technical question below.
- `src/daemon/ipc/handshake.ts`, `src/daemon/ipc/sessions.ts` — precedent for the panel's own per-boot
  token issuance and validation; DATA-MODEL.md:291 explicitly leaves open whether the panel token
  shares the daemon run file or is a separate value.
- `src/shared/envelope.ts` (`renderMessageHtml`, NOT `renderHeader`) — the only correct insertion point
  for the version stamp.
- `src/shared/version.ts` — already the single source of truth for the build version; the wire/protocol
  version constant (`AGENTBUS/2`'s `2`) needs to be located or exported similarly if it is to appear
  alongside the build version (currently only visible embedded in `PROTOCOL_SENTINEL`/
  `SENTINEL_LINE_PATTERN` in `envelope.ts`).
- `src/registry/schema.ts`, `src/registry/writer.ts` — `roster_snapshot`/`roster_hash` recomputation
  and the safe write path for whatever "sync" produces.
- `src/daemon/ipc/routes.ts` (`ROSTER_DRIFT_CONDITION`) — the existing drift *detection* that roster
  sync must give a resolution path for.
- `src/installer/` (`roster-source.ts`, `registry-commit.ts`) — precedent for reading `conmuta.json`
  and unknown-senders together; F3 needs the inverse direction (project file → registry, post-bind)
  that F2 never built (F2 only wrote the registry once, at `project bind` time).
- `src/ledger/unknown-senders.ts`, `src/ledger/audit.ts`, `src/ledger/schema.ts` — read-only data
  sources for the panel's counters/conditions/pending-sender views.
- `docs/02-architecture/DATA-MODEL.md:291` — the "Panel token… whether it shares the run file… is an
  F3 detail" note this exploration must resolve.
- `docs/02-architecture/OVERVIEW.md §10.2` — the six-screen table's "Panel view" column for
  **Add bot / Add group / Assign project** names phase **F2**, but F2's actual shipped specs
  (`installer-wizard`, `registry-authoring`, `tool-config-merge`, `doctor`, `ipc-handshake`,
  `secret-store`) built ONLY the CLI wizards, never a browser UI — see Open Question 1 below.

## Settled by existing decisions — do not re-litigate

- **Panel bind/transport shape**: `127.0.0.1` only, random port, per-boot token, Origin/Host
  validation (THREAT-MODEL T18/PT-29, OVERVIEW §12's stack table, ADR-0029's handshake discipline).
  This is fixed; F3 designs the mechanism, not the requirement.
- **No new envelope type or wire change.** Wire policy is closed (`AGENTBUS/2`, accept `/1` and `/2`);
  version observability rides the render-only header specifically because it must NOT be a wire
  change (amendment A1, ADR-0005 §3rd bullet, ADR-0006 layer 2, ADR-0029 rule 7). Confirmed above:
  the mechanism is `renderMessageHtml`, never `renderHeader`/`encodeEnvelope`.
- **No heartbeat/emission for version observability.** No new timer that sends; the daemon's existing
  heartbeat (`lifecycle/heartbeat.ts`) already exists for lock/reconcile purposes only and must not
  gain a send side-effect.
- **`roster_snapshot`/`roster_hash` are the sync target**; drift detection (`roster_drift`) already
  ships and is intentionally never auto-resolved (D-07) — F3 must not change that non-auto-resolve
  property, only add the human-triggered path that applies a resolution.
- **Autonomy boundary**: no exec, no shell, no tool invocation, zero autonomous emission, no timers
  that emit (CONSTITUTION.md layer 1-2). A panel that could trigger a daemon-initiated Telegram send,
  a roster auto-apply with no human confirmation, or any write with no audit row would violate this;
  see the explicit check under Risks.
- **Registry writes are human actions, always audited (R6, DATA-MODEL.md:113)** — "never derived from
  bus data or Bot API responses." Any roster-sync write the panel or a background check performs must
  append an `audit_log` row and must originate from a human's explicit action reading `conmuta.json`,
  not from an unattended process silently trusting the file.
- **`@clack/prompts` CLI wizards, tool-config merge, doctor tiers (F2)**: unaffected, already shipped;
  F3 does not modify them.

## Open Questions (genuinely undecided — for Alpha debate before proposal)

1. **Does F3's actual scope include write-capable panel screens (Add bot / Add group / Assign
   project), or only the two explicitly-F3 read-only screens (Control panel/Home, Overview table)?**
   OVERVIEW.md §10.2's table tags Add bot/Add group/Assign project's "Panel view" column with phase
   **F2**, but F2's real shipped specs never built a browser UI for them (CLI-only). WORK-PLAN.md's F3
   goal text ("**See** the switchboard...") and its validation criteria (all about refusal/security/
   zero-emission, none about registry mutation) both read as read-only. Tradeoff: treating F3 as
   strictly read-only (Option A below) is smaller, safer, and matches the validation criteria as
   written; treating F3 as also delivering the write screens (Option B) matches OVERVIEW's phase tags
   and R6's "panel" mention as a registry-writing actor, but roughly doubles scope (browser-side forms,
   CSRF-safe mutation endpoints, wizard-equivalent validation now duplicated between CLI and browser).

2. **Same-port or separate-port panel?** The daemon's existing `createIpcServer` (`ipc/server.ts`) uses
   a closed, exact-match route table (`IPC_ROUTES`) incompatible with a static SPA's arbitrary asset
   paths without extending the dispatch model (e.g., a prefix-matched `/panel/*` handler entry). Two
   real options: (a) extend `IpcServerDeps`/`handleRequest` to support one prefix-matched fallback
   route so `/panel/*` can be served from the SAME listener/port the MCP client already uses, reusing
   `Host`-header checking as-is; or (b) run a second `node:http` listener (its own random port) purely
   for the panel, duplicating the `Host` check and body-cap logic OR extracting them into a shared
   module both listeners import. (a) reuses more, but couples an MCP-client transport module to a
   browser-facing concern it was explicitly scoped away from (`ipc-contract.ts:93`'s own comment).
   (b) keeps the two surfaces cleanly separated at the cost of near-duplicate transport code.

3. **Panel token: shares the daemon run file (`~/.conmuta/run/daemon.lock`'s `{pid, acquired_at,
   heartbeat_at}`, or the sibling `run/daemon.json` `{port, pid, secret}` `DaemonRunPayload` from
   `lifecycle/run-file.ts`) or is it a wholly separate per-boot value?** DATA-MODEL.md:291 states this
   explicitly as undecided. Reusing the existing per-boot `secret` (already HMAC-derived into the MCP
   session bearer via `sessions.ts`) risks conflating two trust domains (an MCP client that already
   completed the full nonce/HMAC handshake vs. a browser tab that would need its own, likely simpler,
   presentation — e.g., the token printed once by `conmuta panel` and pasted/embedded in the opened
   URL). A separate `PanelTokenStore` mirroring `SessionStore`'s shape but independent of the MCP
   bearer domain looks more consistent with "distinct trust domains get distinct secrets" (the same
   principle `handshake.ts`'s `"identity:"` vs `sessions.ts`'s `"session:"` HMAC domain-separation
   labels already establish at a smaller scale), but this is not settled by any existing ADR.

4. **Roster-sync trigger and apply mechanism.** `roster_drift` is already detected (session-start
   comparison, never auto-resolved). What is missing: (a) what reads `conmuta.json` again after
   `project bind` — a panel action, a CLI command (`conmuta project bind` re-run?), a doctor check, or
   a boot/heartbeat-tick re-read; and (b) what applies an accepted new roster — presumably
   recomputing `roster_snapshot`/`roster_hash` (`shared/roster-hash.ts`) and writing through
   `registry/writer.ts`'s `replaceRegistryFile`, with an `audit_log` row per R6. Given R6's "human
   action" requirement, an automatic silent re-sync on every heartbeat tick looks wrong (it would
   auto-resolve drift the design says must never auto-resolve); a human-confirmed action surfaced
   through the panel (showing the diff between the stored snapshot and the current `conmuta.json`
   roster) looks like the better fit, but the exact command/screen is undecided.

5. **What exactly does "wire version" mean for B-14's "build/wire version"?** `SERVER_VERSION`
   (`shared/version.ts`) is unambiguous for "build." The wire/protocol version is presently only a
   literal embedded in `PROTOCOL_SENTINEL`/`SENTINEL_LINE_PATTERN` inside `envelope.ts` — there's no
   currently-exported single constant for "the protocol version this build emits" (`AGENTBUS/2`'s
   `2`) separate from the accepted-range check. Whether the render-only header shows both values
   together (e.g. `conmuta 2.0.0-alpha.0 · AGENTBUS/2`) or just the build version is a presentation
   choice, but extracting a named wire-version constant (rather than parsing it back out of
   `PROTOCOL_SENTINEL`) is a small, real design decision.

## Approaches

Given the open questions above are mostly orthogonal (panel scope, panel transport, token domain,
roster-sync trigger), this section frames the one approach dimension most consequential for the
proposal phase's shape:

1. **Minimal F3 (read-only panel + resolve-only roster sync)** — Panel serves exactly the two F3-tagged
   screens (Home/Control panel, Overview table) as a static read-only view over the registry/ledger;
   roster sync is a single explicit CLI/panel action a human triggers to accept a `conmuta.json`
   change into an existing binding, with no browser-side forms for Add bot/Add group/Assign project
   (those stay CLI-only, F2's existing surface).
   - Pros: smallest surface exposed to a browser (smaller attack surface, matches T18's threat
     framing "a browser tab... calls the panel API"); matches WORK-PLAN.md's literal validation
     criteria exactly; ships faster.
   - Cons: leaves OVERVIEW §10.2's "Panel view" column for Add bot/Add group/Assign project
     unaddressed — either a disclosed gap for a later phase, or a sign the work plan's own table needs
     a correcting amendment.
   - Effort: Medium.

2. **Full-parity F3 (read-only panel + write screens matching every OVERVIEW §10.2 "Panel view" cell)**
   — Panel additionally implements browser-equivalent Add bot/Add group/Assign project flows.
   - Pros: matches OVERVIEW's table literally; a browser-only user (no CLI comfort) gets full
     functionality without ever touching a terminal.
   - Cons: materially larger scope (CSRF-safe mutation, masked-token entry over HTTP even on
     loopback, duplicated validation with the CLI wizards, more surface for THREAT-MODEL T18);
     WORK-PLAN.md's F3 validation criteria say nothing about this, suggesting it was not the
     Director's/tribunal's intent when F3 was scoped.
   - Effort: High.

## Recommendation

Approach 1 (Minimal F3). The work plan's own goal statement ("**See** the switchboard"), its four
validation criteria (all read-only/security/non-emission properties), and B-14's amendment text all
describe an observability surface, not a write surface — Approach 2's "full parity" reading looks like
OVERVIEW §10.2's table using the phase column loosely (labeling a *screen concept* F2 without meaning
its *panel rendering* ships in F2) rather than a deliberate scope decision for F3. This should be
confirmed with Alpha as Open Question 1 rather than assumed silently, since it is the one question
that changes F3's size by roughly 2x.

For the panel transport (Open Question 2), reusing `createIpcServer` by adding one prefix-matched
static/API route looks more consistent with this project's stated aversion to duplicated transport
logic (see `registry/writer.ts`'s own doc explicitly calling out and justifying its one unavoidable
duplication) — but `ipc-contract.ts:93`'s explicit "deliberately not a member of this table" comment
reads as a considered decision to keep `/panel/*` OUT of the MCP-client route table, which weakens
that case. This is worth a direct question to Alpha rather than a unilateral pick.

For the panel token (Open Question 3), recommend a separate `PanelTokenStore`, independent of
`SessionStore`/MCP trust domain, following the existing domain-separation pattern
(`"identity:"`/`"session:"` HMAC labels) — smaller blast radius if the panel's simpler browser-facing
protocol is ever found to have a weaker guarantee than the MCP handshake's full nonce/HMAC exchange.

For roster sync (Open Question 4), recommend a human-triggered accept action (CLI verb and/or panel
button) that reads `conmuta.json`, shows the diff against the stored `roster_snapshot`, and on
confirmation recomputes `roster_hash` and writes through `registry/writer.ts` with an audit row —
never an automatic background re-sync, to preserve R6 and the existing "never auto-resolved"
property of `roster_drift`.

For version observability (Open Question 5), recommend exporting a named `WIRE_VERSION` constant
(the `2` in `AGENTBUS/2`) alongside `SERVER_VERSION`, and rendering both inside `renderMessageHtml`
only.

## Risks

- **Autonomy-boundary tension (flagged per this exploration's own brief).** A write-capable panel
  (Approach 2) or an automatic roster-sync (rejected above) would each, in different ways, risk
  turning the panel into something that acts without an explicit human-in-the-loop step — not exec/
  shell (invariant 1 stays intact regardless), but in spirit close to "a background task that
  mutates state no human explicitly asked for in that moment" if not designed carefully. Recommend
  the proposal phase state explicitly, for every panel action in scope, which human click or CLI
  invocation causes it — no action should be reachable by mere navigation/page-load.
  **Conclusion: the panel is not required to be strictly read-only telemetry to satisfy the
  constitution — R6 already contemplates panel-driven registry writes — but every write must be a
  discrete, audited human action, exactly like the CLI wizards it would parallel; the boundary is
  "no autonomous action," not "no write capability."**
- **Second HTTP surface on loopback inherits ADR-0029's threat surface** (already flagged by
  WORK-PLAN.md itself) — DNS rebinding, CSRF from another local browser tab, a port-squatting local
  process. THREAT-MODEL T18/PT-29 already name the mitigations (bind check, random port, per-boot
  token, Origin/Host validation); F3's design must produce the concrete test pinning PT-29's three
  clauses (foreign Origin/Host → refused; missing token → 401; listener bound to 127.0.0.1 — already
  the exact wording of PT-29's row).
- **Route-dispatch extension risk**: modifying `daemon/ipc/server.ts`'s exact-match dispatch to admit
  a prefix-matched panel route (Approach to Open Question 2 option a) touches an already-merged,
  already-audited module (PR-29/30) whose own doc states "pure transport, nothing else" — any change
  here needs its own careful review to avoid weakening the existing `Host`/body-cap/content-type
  guarantees for the MCP-client routes that already depend on this exact-match behavior.
- **Roster-sync scope creep into F2 territory**: F2 already shipped `installer/roster-source.ts`'s
  read-only `composeRoster`; a careless roster-sync design could duplicate rather than reuse it.

## Ready for Proposal

**Yes — resolved via Arena debate `bus-v2-f3-explore-decisions-001`** (session 44, `CONSENSUS` round 2).
See the addendum below for the five locked decisions.

## Resolved Decisions (addendum, session 44 — original exploration above left unmodified)

Debated with Alpha in `bus-v2-f3-explore-decisions-001` (`docs/05-tribunal/INDEX.md`). Alpha's round-1
`AUDIT` returned `APPROVE_WITH_CHANGES` with one objection (decision 4); Kairo's round-2 `CONSENSUS`
accepted it in full.

1. **Panel scope: read-only only.** Home/Control-panel and Overview table screens only. Add bot/Add
   group/Assign project stay CLI-only (F2's existing `@clack/prompts` wizards) — not rebuilt in the
   browser. OVERVIEW.md §10.2's "Panel view" column for those screens is a loose phase tag, not a
   deliberate F3 scope commitment (confirmed: F2's shipped specs never built a browser UI for them).
2. **Panel transport: a separate, second `node:http` listener** on its own ephemeral port — not an
   extension of `daemon/ipc/server.ts`'s `createIpcServer`. `shared/ipc-contract.ts:93` already
   scopes `/panel/*` out of `IPC_ROUTES` deliberately; that exact-match dispatcher stays untouched.
   Extract the shared `Host`/`Origin` check and body-cap logic into one small module both listeners
   import, to avoid duplicating that logic rather than duplicating the whole transport.
3. **Panel token: a separate `PanelTokenStore`**, independent of `SessionStore`/the MCP bearer domain
   — mirrors the existing `"identity:"`/`"session:"` HMAC domain-separation pattern at a new layer.
4. **Roster sync: panel is observe/alert only; apply is CLI-only.** *(Corrected by Alpha's objection —
   the original proposal's "CLI verb and/or panel button" contradicted decision 1's read-only scope
   and would have reopened CSRF/mutation surface on the panel's HTTP listener.)* The panel shows the
   `roster_drift` condition and the diff against the stored `roster_snapshot`; a new CLI verb (e.g.
   `conmuta project sync-roster [path]`) is the only path that recomputes `roster_hash` and writes
   through `registry/writer.ts`'s `replaceRegistryFile` with an `audit_log` row (R6). `roster_drift`'s
   existing "never auto-resolved" property (D-07, `routes.ts:139`) is preserved unchanged.
5. **Version constant: export a new `WIRE_VERSION`** (the `2` in `AGENTBUS/2`) alongside the existing
   `SERVER_VERSION` (`shared/version.ts:9`). Render both only inside `shared/envelope.ts`'s
   `renderMessageHtml` (:235-245) — never inside `renderHeader` (:175-183, shared with the
   wire-canonical `encodeEnvelope`, ADR-05c "must never change").
