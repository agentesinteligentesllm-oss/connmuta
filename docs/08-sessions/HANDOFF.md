# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.
>
> **Reading order for a zero-context session:** §0 → §1 → §2 → §5. Then §3 (pins), §4 (traps),
> §6 (do not redo) and §7 (open points) as the task needs, and §8 for the environment. §0 and §5 are
the operational core; nothing else is required before the first command.

---

## §0 — Quick start

§0 and §5 together are the operational core of this file; §1–§4 and §6–§8 are reference.

**Plan settled in session 9 under the Director's delegation — do not re-open it.** The Arena Orion
debate arena (`http://127.0.0.1:8766/mcp`, the Electron app) is **not available**: assume it stays down,
so **no slice is audited by the tribunal and nothing may wait for a debate**. If the Director ever
relaunches it, a tribunal debate becomes possible again but is not planned and changes nothing before
then. The Pi-native SDD preflight gate is also closed and only a human can open it (§2), so the slice
runs **ODD with the full SDD contract preserved** and is audited by **Judgment Day**. Both were proven
on PR-06 and PR-07a.

**Copy-paste prompt to start the next session (2 lines):**

```text
Continúa el cambio SDD `f1-daemon-registry-thin-client` en su rebanada PR-07b (`shared/tool-output.ts`, SEAM, ≈385 líneas): lee primero `docs/08-sessions/HANDOFF.md` y ejecútalo paso a paso.
La ruta ya está decidida (ODD con el contrato SDD preservado + auditoría Judgment Day); la Arena de debate no está disponible, así que nada depende de un debate ni de una acción en la TUI.
```

**First three commands, in order** (stop and report if any disagrees with §1):

```bash
git branch --show-current && git pull --ff-only      # must be main, up to date
rm -rf dist                                          # a stale dist/ silently fakes results
gentle-ai sdd-status f1-daemon-registry-thin-client --cwd . --json
```

`git pull --ff-only` must be a no-op or a fast-forward. The status command must print
`nextRecommended: apply`, `completed: 38` of `210`, `blockedReasons: []`. Anything else: stop and
report instead of proceeding.

---

## §1 — Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress. PR-01a…PR-05, PR-06a/PR-06b and PR-07a merged to `main`** (`#1`–`#6`, `#7` `9053908`, `#8` `cf19561`, `#9` `535ce67`); next slice **PR-07b**. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status `nextRecommended: apply`, **38/210 tasks**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Artifacts | [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) — **45 slices, 210 tasks**. Two in-place apply-time edits, both recording their own numbers: the PR-06 row (its re-slice) and the PR-07a block (420 lines, the 20-line exception, its two disclosed deviations), plus a carried-findings note on the PR-07b block. No slice was ever re-numbered. | Engram under project **`connmuta`** |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**` for a leading `Provenance:` header; the scanned set must **equal** `test/fixtures/v1-provenance.json` — now **10 entries**: `constants`, `envelope`, `envelope.test`, `secrets`, `thread-record`, `protocol-apply`, `protocol-select`, `fence`, `tool-schemas`, `error-payload`. Every vendored file needs a design §12 header **and** a fixture entry, or `test:static` fails | `test/security/provenance.test.ts` |
| **The registry never validates a header hash against v1** | For a SEAM it asserts only that the body *differs* from the pinned value. Correctness of a pin is proven **only** by independent re-derivation from the read-only v1 checkout — and `src/shared/constants.ts:3` currently carries a wrong one that no gate can see (§7) | `test/security/provenance.test.ts:113-119` |
| Code on `main` | `src/shared/{constants,version,envelope,secrets,thread-record,protocol-apply,protocol-select,fence,tool-schemas,error-payload}.ts` + twins, `test/fakes/delivered-text.ts`, `test/twins.test.ts`, `test/security/{pack,repo-scan,provenance}.test.ts`, fixtures — **169 tests**, `test:static` **8**, verified from clean detached worktrees of the audited code tip `53d5aad` and again on merged `main` | PRs `#1`–`#9` |
| Audit status of the last two slices | PR-06 was **waived** by the Director and PR-07a given the same substitute by explicit decision; both audited by Judgment Day. **DN-05 is not satisfied for either.** The path for PR-07b onward is §2 | [`INDEX.md`](../05-tribunal/INDEX.md) `bus-v2-f1-pr-06-waiver-001`, `bus-v2-f1-pr-07a-audit-001` |

---

## §2 — Settled for the next slice (do not re-litigate; change only if the Director asks)

**1. Workflow: ODD, with every substantive SDD contract preserved.** `sdd-apply` dispatch is refused
before the child launches with

> `SDD dispatch refused before child launch: SDD preflight cancelled or invalid; no session consent recorded.`

That gate is host-owned and, by design, not satisfiable by an agent: `extensions/gentle-ai.ts` ~L9255
calls `runSddPreflight`, which needs a native `ctx.ui.select` confirmation and refuses while
`prefs.prompted` is false (`lib/sdd-preflight.ts:896-926`). Answering the canonical
`Gentle AI SDD preflight 1/3:`–`3/3:` questionnaire through the agent's own question tool does **not**
create consent, and manufacturing it would be the "model-authored preflight cannot create
parent-confirmed authority" defect this repository has recorded twice.

Consequences, all binding on the next session:

- **ODD is the default because it cannot block.** Planning around a TUI action would stall step 1 of a
  zero-context session. The slice still honours: the same design §12 rows, the same `tasks.md`
  sub-tasks and their ids, Strict TDD (red before green, twins), the same pinned hashes and provenance
  fixture, the same THREAT-MODEL §4 discipline, the same 400-line review budget, and a
  tribunal-grade audit.
- **The orchestrator owns the SDD bookkeeping** (checkbox flips, `apply-progress.md`, `state.yaml`) and
  discloses that no `sdd-apply` phase envelope exists for the slice.
- **The only permitted variant:** if a human has already run `/gentle:sdd-preflight` in the TUI, or the
  Director explicitly asks for it, the slice may instead run through `sdd-apply`. This is **not a
  question to put** — state the default once and continue (see §5 step 2). Never wait on the TUI and
  never treat the agent's own questionnaire as consent. A third possibility — the tribunal, if the
  Director relaunches the Arena bridge — is outside the plan and would simply supersede the audit step.
- Switching later costs nothing: ODD and SDD share the same artifacts, so the plan is reversible.

**2. Audit: Judgment Day.** Two blind read-only judges (`jd-judge-a`, `jd-judge-b`) in parallel, same
frozen target, then a bounded correction round and at most two scoped re-judgments. Judges return
**exactly** `{"findings":[…],"evidence":[…]}` with only the allowed fields; `review-risk`/`review-*`
agents are **not** dispatchable outside the native review lifecycle. At close, record the audit-path
decision in the tribunal index the way `bus-v2-f1-pr-07a-audit-001` does, and state plainly that DN-05
is unsatisfied.

**3. PT-cell discipline.** A PR updates the file-name cell of the PT rows it **actually pins**, and only
those. An over-claimed cell is a defect: PR-06a had to revert PT-14 and PR-07a deliberately skipped
PT-07's half of task 7a.6 because its assertion is bundle-level (PR-34/PR-40). If a gated task asks for
a cell the slice cannot pin, **skip it and disclose** — do not annotate it.

**4. Budget policy for PR-07b specifically.** The tasks phase allows shipping the twin as a separate
PR-07c. **Do not do that**: `test/twins.test.ts` fails any `src/**/*.ts` whose twin is missing in the
same tree, so that split fails PR-07b's own merge. Trim to fit, or take a **disclosed** PR-scoped
exception (PR-06b took 26 lines, PR-07a took 20). Budget from PR-07a's evidence: a SEAM module's doc
comments must be re-authored, so an estimate that counts v1's lines lands far short.

---

## §3 — Pinned provenance values (re-verify with your own method; never trust a header blindly)

The rule: the pinned value is the exact byte range of the cited v1 lines **including its terminating
newline** — except when the range runs to EOF, where the file's own final newline is that byte
(`bus-v2-f1-pr-04-001`). Never `head -c -1`, except to produce the wrong-value control.

| v2 path | v1 source | verdict | v1 body sha256 |
|---|---|---|---|
| `src/shared/tool-schemas.ts` | `src/tools/send.ts:47-109` @ `bf8f365` | SEAM | `84aae049e711e5ec6725007d561e65cebcf3ca3b9035333ae9b2b734494d42e6` |
| `src/shared/error-payload.ts` | `src/index.ts:45-103` @ `bf8f365` | SEAM | `1f59f8f8fa186e22ab1281f4ca9a2dded1f559eb9f9e43b6c7494c8c01a3d948` |

Wrong-value controls (the value if the terminating newline is wrongly stripped): `c16ce5a5…a6e1`
(send) and `b8990a6a…ef76` (index). Both ranges are **interior**, so both pins include that newline.
The method validates itself by reproducing two already-ratified values: the fence
`68e241b2…` from `src/tools/fetch.ts:43-63` and `thread-record`'s `bd177372…` from `src/state.ts:15-87`.
Older values (constants, envelope, secrets, protocol-apply, protocol-select) are in `apply-progress.md`;
**`constants`' is wrong** — §7.

**Range-convention detail PR-07b will meet.** A module assembled from **two** v1 ranges can cite only one
in its header and fixture, because the header grammar and the fixture's `v1Path` each hold a single
token; PR-07a's `tool-schemas.ts` cites the larger range (`src/tools/send.ts:47-109`) and names the
second (`src/index.ts:29-42`) inside its `Changes:` line. That is the accepted form, and it is also the
one place where design §12's reuse table disagrees with the shipped verdict (§7).

---

## §4 — Facts that will bite you (read before planning)

| Item | State | Pointer |
|---|---|---|
| **PR-07b's src/twin split is NOT CI-safe** | `test/twins.test.ts:29-44` fails any `src/**/*.ts` whose twin is missing in the same tree, so PR-07b + PR-07c would fail PR-07b's own merge. Re-verified by reading the test in session 9 | `test/twins.test.ts` · §2.4 |
| **The SDD dispatcher is closed, and only a human can open it** | See §2.1 for the exact refusal string and the code path. Do not spend a turn trying to satisfy it from inside the agent | §2 |
| **A correction round can push a slice over the budget it was protecting** | PR-07a opened its audit inside the policy at 398/400 and closed at 420 (round 1 +17, round 2 +5). Budget a correction pass before promising a reviewer a figure | `apply-progress.md` C5/D1/D2 |
| **A `Changes:` header is all a header-only reviewer sees** | Three separate defects in PR-07a were clauses that did not match the code (a paragraph that did not say what the header claimed; `SendToolInput` called "one line past" a range when line 110 is blank; a rewritten JSDoc block never listed). Write the full delta, then make a diff or test able to falsify each clause | `src/shared/tool-schemas.ts:1-14` |
| **Two arithmetic defects were caught in the commit written to reconcile the figures** | When you correct a number, grep the whole section for the others and re-derive the total from `git diff --numstat` | `apply-progress.md` D1/D2 |
| **Mutation testing is what proves a test can fail** | Eight mutants in PR-07a, each built on a cleaned `dist/` — a mutant whose build fails is not evidence. One assertion needed a temporary **stub module** before the import it forbids could even compile | `apply-progress.md` mutant matrix |
| **Windows line-ending trap** | `Path.read_text`/`write_text` translate line endings silently: a `"\r\n" in text` check never fires, and a "byte-identical" mutant restore rewrites the file as CRLF. Use `read_bytes`/`write_bytes`, or `newline=""` / `newline="\n"`; verify with `git ls-files --eol <path>` → `i/lf w/lf` after `git update-index --refresh` | session 9 EOL sweeps |
| **`node --test` output is ANSI-coloured** | A grep anchored at `^ℹ` or `^✖` can find nothing while the suite is failing. Strip escape codes, or trust the exit code | session 9 |
| **`gentle-ai` is 3.0.2 and the attempt ledger is retired** | Only `sdd-attempt grant` remains (`Runtime attempt operations are retired`). Every older instruction about `--max-changed-lines`, `settle` or a ledger `reset` is obsolete. `gentle-pi` is 3.1.1 | `gentle-ai sdd-attempt --help` |
| **Engram project key is `connmuta`** | The provider derives it from the git remote and **rejects** writes passed as `telegram_bus_agent`. Cross-project reads still work | `mem_current_project` |
| **The ODD feature doc stays out of the repository** | PR-07a's `odd/tasks/<feature>.md` was created (ODD requires it) and **deleted at close** by Director decision: AGENTS.md §2 names where live state lives and does not include an ODD tree. Track in `odd/` locally, fold the substance into `apply-progress.md` + Engram, do not commit it | Engram `odd/pr-07a-…/tasks` |
| **`gh` refuses `--force-with-lease`** | The tooling blocks destructive git even when the Director authorizes it. Do not plan a force-push | PR #8 history |

---

## §5 — Next session, exact sequence

1. **§0**: confirm `main`, `git pull --ff-only`, `rm -rf dist`, read the SDD status. Then read
   [`../../AGENTS.md`](../../AGENTS.md) §1 and §2, this file's §2, `apply-progress.md`'s PR-07a section
   (its "Carried forward to PR-07b", D4 and the terminal verdict), `tasks.md`'s **PR-07b** block
   including its carried-findings note, and `design.md` §12's row for
   `src/tools/fetch.ts:65-348` (`shared/tool-output.ts`).
2. **State the plan in one line and proceed — this is not a question and there is no waiting turn:**
   ODD + Judgment Day (§2), with the PR-07c split excluded (§2.4). Do **not** ask the Director to choose
   a workflow and do **not** wait for the TUI: the default cannot block. The only thing that changes it
   is the human volunteering `/gentle:sdd-preflight` (then the slice may run through `sdd-apply`) or an
   explicit Director instruction — if neither happens, continue.
3. **Branch** `f1/07b-tool-output` from `main`. **D4 first** (its own small commit, so the audited range
   carries it explicitly): change the `errorResult` case in `test/shared/error-payload.test.ts` to a
   tool-level code. Then Strict TDD for `shared/tool-output.ts`: RED `test/shared/tool-output.test.ts`
   (fetch-digest rendering, the `body_omitted` marker, fence-safe output — remember `src/shared/fence.ts`
   already exists from PR-06), GREEN the module as a SEAM from `v1:src/tools/fetch.ts:65-348` with its
   `Changes:` line and pinned hash re-derived per §3, and append its fixture entry. **The twin ships in
   the same PR.**
4. **Doc hygiene in the same PR**: run `npm run test:static` (its `provenance.test.ts` compares the
   scanned set to the fixture, so a missing entry fails), and update `docs/02-architecture/THREAT-MODEL.md`
   §4 **only** for a PT id this slice genuinely pins — PR-07b's Requirements line names no PT id, so the
   expected answer is *no cell change*; §2.3 gives the rule if one does apply.
5. **Verify** from a clean detached worktree, not the working tree:
   `git worktree add --detach ../telegram_bus_agent-worktrees/verify-07b <sha>`, then
   `npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js" && npm run test:static`,
   then remove the worktree. Run the focused command too. Also run at least four mutants on a cleaned
   `dist/` to prove the new assertions can fail.
6. **Measure the real diff before committing** (`git diff --numstat`), read every new file in full, and
   ask the Director for commit authorization. Commit as work units (code+its test+its fixture entry
   together), then the docs/bookkeeping commit. If the diff exceeds 400, see §2.4 — do not open the PR
   silently over budget.
7. **Audit** (§2.2) over the frozen range, fix only what the ledger confirms, and record the ledger,
   the corrections and the verdict in `apply-progress.md`. Re-judge once; the skill allows a second
   scoped re-judgment, but spend it **only** on defects the correction round itself introduced — that is
   exactly what consumed PR-07a's second round, and it is not a second chance at new findings.
8. **Stop at a PR boundary.** Push, open the PR with `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh …` (never `gh auth switch`), wait for the CI matrix, merge only with the
   Director's authorization, then: rewrite this file, prepend to [`LOG.md`](./LOG.md), add the
   audit-path record to [`INDEX.md`](../05-tribunal/INDEX.md), sweep every status line in `AGENTS.md`,
   `README.md`, `docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml`, run `mem_session_summary`,
   commit the docs on `main`, and push.

---

## §6 — Do not redo

- Spec, design and tasks are gated and audited. The only apply-time edits are PR-06's row, the PR-07a
  block (both in place, each recording its own numbers) and the PR-07b carried-findings note. Do not
  rewrite a gate's text; append a note.
- Provenance hash rule, registry and range convention are ratified (`bus-v2-f1-pr-02-002`,
  `bus-v2-f1-pr-04-001`) — §3.
- **Doc-hygiene rule** (ratified `bus-v2-f1-pr-03-001`): never quote a matched-and-rejected
  secret-shaped literal in `apply-progress.md`; describe the shape. PT-22 scans every tracked file.
- **THREAT-MODEL §4 rule** — §2.3. PT-02's cell correctly names `test/shared/tool-schemas.test.ts`;
  PT-13's names `test/shared/fence.test.ts`; PT-14 and PT-07 stay unannotated (daemon- and bundle-scoped
  tests own them).
- **PR-06 and PR-07a are merged; do not re-slice, re-audit or re-open them.**
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake
  imports it, never redefines it.
- TypeScript 7.0.2 needs `"types": ["node"]`; an empty composite unit is `TS18003` —
  `src/{client,daemon,cli}/tsconfig.json` join the root `references` when their first `.ts` lands
  (PR-08 cli, PR-15 daemon, PR-32 client).
- `test:wrong-room` matches by glob until PR-41; `npm pack` in `pack.test.ts` spawns `npm-cli.js` on
  win32. `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by path; `git ls-files`-based
  scanners see only tracked or staged files, so `git add` (or `git add -N`) before a local RED/GREEN.
- `test/security/repo-scan.test.ts:13` intentionally keeps its own `TOKEN_SHAPE_RE` copy — orthogonal by
  design (`bus-v2-f1-pr-03-001`), not a defect.
- Type-only modules satisfy Strict TDD's triangulation gate via the explicit type-only exception in
  `strict-tdd.md`; a missing-module `TS2307` from `tsc` is a legitimate RED for a brand-new module.
- **Stale comments and stale records**: when a change alters behavior a prior comment describes, grep
  that file for the OLD behavior's keywords rather than assuming one fix is enough; when you correct a
  figure, grep the whole record for every other place that repeated it.

---

## §7 — Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **D4** (new, PR-07a) | `test/shared/error-payload.test.ts` drives the client-taxonomy code `UNBOUND_PROJECT` through `toolErrorPayload`. Nothing behaves wrongly (the value coincides with design §10), but it models the pattern the module's own JSDoc forbids. Escalated in PR-07a because its round budget was exhausted and its two judges disagreed on causality | Kairo → **PR-07b, first commit** |
| **new (PR-07a)** | `src/shared/constants.ts:3` pins the **blind-stripped** hash `4ce5e514…`; the rule-conformant value for `src/config.ts:26-166` is `039d53a2…` (control: `state.ts:15-87` correctly pins `bd177372…`, the value *with* the newline). Pre-existing since PR-01b; a SEAM row's pin is never checked for correctness, only for inequality. Re-pinning invalidates PR-04's wrong-value-control table, so it needs its own audited change | Director → Kairo |
| **new (PR-07a)** | design §12's reuse table marks `src/tools/send.ts:47-109` and `src/index.ts:29-42` **AS-IS** → `shared/tool-schemas.ts`, but that module is SEAM by construction (`bus-v2-f1-tasks-001` items 1–2). Reported, not silently resolved: `design.md` is gated. PR-07b will meet the same table shape | Director |
| carried (PR-06) | Digest blind spots incl. `MAX_THREAD_HISTORY = 50` saturation — proposed minimal fix: the last history entry's `eid` in the digest row | Director → Kairo |
| carried (PR-06) | The fence's body escape does not neutralise `&`, so the fence is not injective; THREAT-MODEL §7 ratifies the fence as inherited unchanged, so it needs its own decision | Director |
| B-16 / D-10 | `LICENSE` ships with `private: true`; SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line open; a **real tenant deny-list** for PT-22 must live outside the tree (CI secret) — decide at PR-42 | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant (`src/shared/constants.ts`) | Director |
| B-12 | macOS scope; B-13 migration runbook closes when PR-38 merges | Director + Kairo |
| — | `npm test` runs whatever is in a stale `dist/`; consider a `clean` step in a later PR, audited | Kairo → Alpha |
| — | GitHub Actions deprecation warning: `actions/checkout@v4` and `actions/setup-node@v4` target Node 20 — bump majors in a later CI PR, audited | Kairo → Alpha |
| — | T22 bytes-per-hour ceiling and the origin-label organisation marker: no backlog id (PR-42 close-out) | Director |
| B-05, B-07, B-08, B-09 | gentle-ai installer study; Telegram bot-to-bot visibility; Windows IPC/DACL; MCP notification rendering per host — all F0 spikes, all still open | Director + Kairo |

---

## §8 — Environment facts not to re-measure

- Machine: Windows 11, Node 24.16, npm 11.5, gentle-ai 3.0.2 CLI, gentle-pi 3.1.1, TypeScript 7.0.2
  pinned.
- Line endings: both repositories have `core.autocrlf=true`. This one forces `eol=lf` through
  `.gitattributes`; the v1 checkout has none. Vendored bodies come from `git show bf8f365:<path>` (the
  raw blob, always LF) and the provenance hash normalizes CRLF→LF. `.gitattributes` governs the
  **committed** form, not the worktree's — check with `git ls-files --eol`.
- `node --test` prints `ℹ tests / ℹ pass / ℹ fail` (ANSI-coloured), not `# tests`.
- GitHub Actions: the workflow lives on `main`, so `pull_request` runs fire on PR open (≈30–40 s per
  matrix entry, Node 24.15 and 26). `gh pr merge N --merge --delete-branch` also checks out `main` and
  pulls, so the local tree is back on `main` afterwards.
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365` (tag `v1.0.2` + 2 commits),
  **read-only**; cite as `path:line`. It carries one pre-existing untracked file,
  `alpha_response.json` (an unrelated old Arena envelope) — harmless, not this project's state.
- Verification worktrees live in `../telegram_bus_agent-worktrees/` and are removed as soon as their
  run finishes; an empty directory is the expected end state.
- Arena bridge: `.mcp.json` (gitignored) points at `http://127.0.0.1:8766/mcp` — the Arena Orion
  Electron app (`electron .` in `../Arena_construccion/doble_ventana/Arena_Orion`), **down** unless the
  Director launched it. Never quote `.mcp.json` and never commit it.
- GitHub auth is isolated from the machine-global `gh` account: this checkout's `.git/config` carries a
  local `credential.helper`; every `gh` call runs with
  `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh …`. **Never
  `gh auth switch`.**
