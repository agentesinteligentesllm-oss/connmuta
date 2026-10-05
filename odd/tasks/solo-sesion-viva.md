# ODD task — solo-sesión-viva: the bus answers only from a live session

**Authorized by:** the Director, 2026-10-05 (front: the bus only; the FRISCO tickets/PR queue front is untouched).

**Objective.** The bus answers **only from a living, interactive session**. With a live session open, that
session reads and answers. With no live session, **nobody answers** and the thread stays pending — that is
correct, not a failure. **No woken (headless) turn may send anything, directly or indirectly.**

## Measured baseline (2026-10-04, read-only from `~/.conmuta/ledger.db`)

| Fact | Evidence |
|---|---|
| Four `REPLY`s left in `@luisgtz-agent`'s name without the Director's interactive session knowing | `thread_history`: `02e84054e0a6`, `7b264c9a6da8` (22:46Z), `e1896bc304ca` (**23:28:52.836Z**), `2b744515195c` (**23:28:54.730Z**) |
| They came from headless turns, not a human | `client_cursors`: `host=conmuta-runner` pid 23692 (22:32:42Z→22:46:53Z) and two WSL clients `host=unknown` pids 38160/38252 (23:27–23:28Z) |
| The woken turn had **no** `conmuta_*` tools but **did** have `bash` | session `…2026-10-04T22-42-57-720Z_01a10915….jsonl` system-prompt tool list: `read, bash, mem_*, codegraph, …`, `conmuta` absent |
| It improvised the send over raw IPC | same transcript: it read `~/.conmuta/run/daemon.json` (the run-file secret) and `dist/src/...`, then ran `node`/`python3` from WSL |
| **`audit_log.client_id` is `NULL` on all four send rows** | direct query: the ledger cannot even say *which client* sent |
| Root cause of the missing tools is **not** trust or `.mcp.json` | `~/.pi/agent/trust.json` exists and trusts FRISCO; `.mcp.json` and the approvals are correct. `~/.pi/agent/settings.json` carries `"extensions": ["-builtin:mcp"]`, injected by an **unregistered** `pi-mcp-adapter`, which disables Pi's built-in MCP for every session |
| **`trust.json` DOES exist** (contradicting the order's point 8) | `~/.pi/agent/trust.json` = `{"C:\\…\\ORION OCG\\FRISCO": true}` |

## Decisions

Each behavior-changing commit carries its own `FUENTE:` / `PROPUESTA:` lines in the body.

### D1 — Where the cut lives

- **FUENTE:** Director's order 2026-10-05: "El corte debe estar en el daemon…"; options a/b/c listed there;
  ADR-0032 R5 (`wake` = read/reply-only) and R7 (`autopilot` = act profile); CONSTITUTION §3 layers 1–3.
- **PROPUESTA:** the load-bearing control is **capability, not permission** — retire the woken turn's ability
  to reach the bus or a shell (order option b), with the daemon gaining the audit and the one fail-closed
  identity denial that is actually enforceable (D3). Reasons, measured: (i) the daemon cannot accredit
  "human present" — every local process of the same user reads the run file and speaks the same IPC, and the
  thin client's `host` is the fixed literal `unknown` for *both* an interactive Pi session and a woken one, so
  any host-name filter is a self-declared label; (ii) the 23:28 sends came from an **orphaned WSL process**
  whose runner was already recorded `exited` at 22:46:53 — a daemon rule keyed on the satellite's liveness
  would have missed exactly the incident that motivated this work.

### D2 — The `wake` profile (up to two `pi` tool flags)

- **FUENTE:** ADR-0032 R5/R7 and the runbook's own "the profile is not a sandbox" limit; the measured
  transcript above; Pi's documented `--tools` / `--no-extensions` flags.
- **PROPUESTA:** `wake` for `pi` is launched with `--no-extensions --tools read,grep,find,ls` appended
  **after** the operator's arguments: no `bash` (so no raw IPC and no run-file read), no MCP entry (so no
  `conmuta_send`). Any harness without a declared send-proof profile is **refused**, never launched with its
  full toolset. Operator arguments that could widen exposure are refused.

### D3 — The daemon half

- **FUENTE:** Director's order (corte in the daemon, fail-closed, audited with its reason); the measured
  `audit_log.client_id = NULL` gap.
- **PROPUESTA:** (i) every `send` audit row records the sending `client_id`; (ii) a closed set of
  non-interactive client labels (today: the satellite's own `conmuta-runner`) is denied the send path,
  fail-closed and audited. The residual — a same-user process with a shell can still impersonate an
  interactive client — is stated in the runbook rather than papered over.

### D4 — Standing operational state

- **FUENTE:** Director's order, Step 0.
- **PROPUESTA:** `frisco: off` in the ladder, autostart entry removed and archived, runner processes stopped.

## Tasks

| # | Task | Result |
|---|---|---|
| T1 | Step 0: stop the bleeding | **Done.** `frisco: off` (ladder empty); `start-frisco.vbs` removed from Startup and archived as `conmuta-runner/start-frisco.vbs.disabled-20261004`; zero `cmd`/`node` of the runner after a 20 s wait. Note: killing the `cmd` alone leaves the `node` orphaned — both must go. |
| T2 | Step 2: restore MCP for live sessions | **Done.** Root cause: `~/.pi/agent/settings.json` carried `"extensions": ["-builtin:mcp"]`, injected by an unregistered `pi-mcp-adapter`. Removed it; added `"exposure": "direct"` to the conmuta entries and dropped `--project frisco` from the FRISCO project entry (ADR-0033). Verified: `pi mcp list` in FRISCO → `conmuta: connected, 4 tools (direct, project)`, and the session's own request declares `mcp__conmuta__conmuta_send` (session `…00-01-47-049Z_01a1095d…`). |
| T3 | Step 1: runner send-proof wake profile | **Done.** `SEND_PROOF_PROFILES` in `runner/constants.ts`; `resolveHarnessSpec` refuses `profile_unavailable`; tool-exposure flags refused. 12 tests RED before GREEN. Live probe: `pi -p --no-extensions --tools read,grep,find,ls` declares exactly `read, grep, find, ls`, no `bash`, no `mcp__conmuta` (session `…00-14-35-140Z_01a10969…`). |
| T4 | Step 1: daemon audit + denial | **Done, narrowed.** The daemon cannot know the satellite (ADR-0032 R3/PT-34), so the enforceable half is attribution: every `send` audit row now carries the session's `client_id` (was hardcoded `null`). RED before GREEN in `test/daemon/ipc/routes.test.ts`. The sentinel/denial rule is documented as not implementable in-core. |
| T5 | Docs | **Done.** Runbook (new section, ladder table, limits, troubleshooting), ADR-0032 amendment, README row 5. |
| T6 | Verification | `npm test` **1912 / 1906 pass / 0 fail / 6 skip**; `test:static` **101/101**; observation window in the closing report. |

## What was rejected, and why

- **A daemon-side rule keyed on the satellite's liveness** ("armed ⇒ the bus is muted"). It would have missed the
  incident: the runner recorded the turn `exited` at 22:46:53 while the sends happened at 23:28:52/54, from an
  orphaned WSL process. It would also make the daemon know the satellite, which ADR-0032 R3 forbids.
- **A host-name allow-list.** The thin client's `host` is the fixed literal `unknown` for an interactive
  session *and* for a woken one, so no filter over it can separate them.
- **A human-attestation flow** (a per-session grant the human arms). It is the only shape that could accredit
  "a human is present", but it adds a route, a tool, a CLI verb and per-session friction, which is not the
  bounded change this order asked for; it remains the option to reach for if a daemon-side proof is ever
  required.


## Independent verification (2026-10-05)

RDD preflight against the frozen candidate: `inspect` offered `review.start`; two pre-authority validation
errors (`requires lineageId`; `supports only "ordinary" or "judgment-day" mode`) created no lineage; the third
START returned a **host-resolved consent** — `consent-declined-this-candidate`, `lineage_created: false`,
`mutation_performed: false`, `risk_level: medium`, 37 files / 2254 lines. The decline is candidate-scoped and is
not the kill switch, so the RDD-off fallback re-enabled the separate verifier, run as `gentle-ai-verify`
(read-only) over this work unit.

Result: **C1–C8 PASS; zero blockers; zero unverified items.**

| Claim | Result |
|---|---|
| C1 the profile is appended last, prompt last (built `dist/runner/harness.js`) | PASS — argv `["-p","--model","x","--no-extensions","--tools","read,grep,find,ls","PROMPT"]` |
| C2 a pair with no profile is refused | PASS — `autopilot+pi` and `wake+claude` both → `{kind:"refused",reason:"profile_unavailable"}` |
| C3 the record cannot widen the profile | PASS — all 8 flags (`--tools`, `-t`, `--exclude-tools`, `--no-extensions`, `-ne`, `-e`, `--extension`, `--tools=bash`) → `arguments_refused` |
| C4 sender attribution in the built daemon | PASS — all 6 send `appendAuditRow` calls carry `client_id: deps.client_id ?? null`; `sendDeps` carries `client_id: auth.session.client_id` |
| C5 named constant, not an inline literal | PASS — `SEND_PROOF_PROFILES` in `dist/runner/constants.js`, `null` for the other three harnesses |
| C6 focused tests + non-vacuity | PASS — 53/53. **Disclosed as weaker than requested:** the verifier pinned the assertions instead of patching a copy, so its non-vacuity proof is indirect. The stronger RED evidence is this change's own stash run: 12 tests failed against the pre-change runner and pass after. |
| C7 documentation matches the code | PASS — runbook no longer claims the turn fetches/replying, names `profile_unavailable`; ADR-0032 carries the amendment; README row 5 links to it |
| C8 live probe: no shell, no bus | PASS — `pi -p --no-extensions --tools read,grep,find,ls` declares exactly `read,grep,find,ls`; `mcp__conmuta` = 0; no `bash` |

Hygiene: `git status --short` empty; `%TEMP%/conmuta-*` = 0 before and 0 after. The verifier ran no bus tool
(a `conmuta_fetch` would have advanced the shared inbox cursor).
