# Session handoff — read this first in a new session

> One file, overwritten at the end of every session by the writer. It says where the work stands,
> what the next session does, and what it must not redo. History lives in
> [`LOG.md`](./LOG.md); decisions live in the ADRs and the tribunal index, never here.
> Rule (Director, DN-04): switch sessions at phase boundaries so no session carries unnecessary
> context. A handoff that repeats a decision instead of pointing at it is a defect.

## Where the work stands

| Item | State | Pointer |
|---|---|---|
| Phase | **F1 `apply` in progress. PR-01a…PR-05, PR-06a/PR-06b and PR-07a merged to `main`** (`#1`–`#6`, `#7` `9053908`, `#8` `cf19561`, `#9` `535ce67`); next slice **PR-07b**. | [`WORK-PLAN.md`](../07-plan/WORK-PLAN.md) §F1 |
| SDD change | `f1-daemon-registry-thin-client`; native status reads `nextRecommended: apply`, **38/210 tasks complete**, `blockedReasons: []` | [`state.yaml`](../../openspec/changes/f1-daemon-registry-thin-client/state.yaml) · [`apply-progress.md`](../../openspec/changes/f1-daemon-registry-thin-client/apply-progress.md) |
| Artifacts | [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md) — **45 slices, 210 tasks**; the PR-06 row records its re-slice and the PR-07a block carries its apply-time amendment (420 lines, 20-line exception, the two disclosed deviations). No later PR re-numbered. | Engram under project **`connmuta`** (see the Engram row below) |
| Provenance registry | `test/security/provenance.test.ts` scans tracked `src/**`/`test/**` for a leading `Provenance:` header; the scanned set must equal `test/fixtures/v1-provenance.json` — now **10 entries**: `constants` SEAM, `envelope` AS-IS, `envelope.test` AS-IS, `secrets` SEAM, `thread-record` SEAM, `protocol-apply` SEAM, `protocol-select` SEAM, `fence` SEAM, `tool-schemas` SEAM, `error-payload` SEAM. Every vendored file (AS-IS or SEAM) needs a design §12 header **and** a fixture entry, or `test:static` fails | `test/security/provenance.test.ts` |
| **The registry scanner never validates the header hash against v1** | It only asserts that a SEAM body *differs* from the pinned value. The pinned `v1 body sha256` is verified **only** by independent re-derivation from the read-only v1 checkout. Do it every time, and never with `head -c -1` — except to produce the wrong-value control. `src/shared/constants.ts:3` currently carries the **wrong** (blind-stripped) value; see the queued items | `test/security/provenance.test.ts:113-119` |
| Code on `main` | `src/shared/{constants,version,envelope,secrets,thread-record,protocol-apply,protocol-select,fence,tool-schemas,error-payload}.ts` + twins, `test/fakes/delivered-text.ts`, `test/twins.test.ts`, `test/security/{pack,repo-scan,provenance}.test.ts`, fixtures — **169 tests**, `test:static` **8**, verified from a clean detached worktree of `53d5aad` and again on merged `main` | PRs `#1`–`#9` |
| Audit for the last two slices | PR-06 was **waived** by the Director (Arena bridge down) and PR-07a was given the **same substitute by explicit decision**; both audited by Judgment Day. **DN-05 is not satisfied for either.** The path for PR-07b onward is an open Director decision | [`INDEX.md`](../05-tribunal/INDEX.md) `bus-v2-f1-pr-06-waiver-001`, `bus-v2-f1-pr-07a-audit-001` |

## Pinned provenance values already verified (re-verify with your own method, do not trust blindly)

| v2 path | v1 source | verdict | v1 body sha256 |
|---|---|---|---|
| `src/shared/tool-schemas.ts` | `src/tools/send.ts:47-109` @ `bf8f365` | SEAM | `84aae049e711e5ec6725007d561e65cebcf3ca3b9035333ae9b2b734494d42e6` |
| `src/shared/error-payload.ts` | `src/index.ts:45-103` @ `bf8f365` | SEAM | `1f59f8f8fa186e22ab1281f4ca9a2dded1f559eb9f9e43b6c7494c8c01a3d948` |

Wrong-value controls (what you get if the terminating newline is wrongly stripped): `c16ce5a5…a6e1`
(send) and `b8990a6a…ef76` (index). Both are **interior** ranges, so both pins include the terminating
newline. The method is validated by reproducing the already-ratified fence value `68e241b2…` from
`src/tools/fetch.ts:43-63`. Older values (constants, envelope, secrets, thread-record, protocol-apply,
protocol-select, fence) are in `apply-progress.md`; **`constants.ts`'s is wrong** — see queued items.

## New this session — read these before planning anything

| Item | State | Pointer |
|---|---|---|
| **PR-07b's planned src/twin split is NOT CI-safe** | The tasks phase allowed shipping `shared/tool-output.ts` and, if its twin pushed it past 400 lines, the twin as a separate PR-07c. `test/twins.test.ts:29-44` fails any `src/**/*.ts` whose `test/**/<same>.test.ts` is missing **in the same tree**, so that split fails PR-07b's own merge. Re-verified this session by reading the test. Decide before opening PR-07b: trim to fit, or take a **disclosed** PR-scoped exception — never split a module from its twin | `test/twins.test.ts` · `apply-progress.md` "Carried forward to PR-07b" |
| **The SDD dispatcher is still blocked by the host gate** | `sdd-apply` dispatch is refused with `SDD dispatch refused before child launch: SDD preflight cancelled or invalid; no session consent recorded.` The Pi-native preflight is a **native `ctx.ui.select` dialog** an agent can neither satisfy nor fabricate (`extensions/gentle-ai.ts` ~L9255 → `lib/sdd-preflight.ts:896-926`); answering the questionnaire through the agent's question tool does NOT create consent. **The unblock lever is human only:** run `/gentle:sdd-preflight` in the TUI, or launch the phase agent from a host that confirmed it | `apply-progress.md` PR-07a "Audit path" |
| **The Director chose the audit path before any write, twice** | For PR-07a: ODD + Judgment Day (the PR-06 substitute), and **PT-07's cell deliberately left unannotated** even though task 7a.6 asks for it — its assertion is bundle-level (PR-34/PR-40) and annotating it would repeat the PT-14 over-claim PR-06's judges caught. Ask the Director for PR-07b; do not assume | [`INDEX.md`](../05-tribunal/INDEX.md) `bus-v2-f1-pr-07a-audit-001` |
| **A correction round can exceed the budget it was meant to protect** | PR-07a opened the audit at 398 (inside 400) and closed at **420** — 20 over, under a disclosed PR-scoped exception. Round 1 cost +17, round 2 +5. Budget a correction pass before promising a figure, and when you correct one number in the record, grep the section for the others: this session's judges caught the same arithmetic defect **twice**, in the commit whose subject was reconciling those numbers | `apply-progress.md` D1/D2/C5 |
| **A header `Changes:` line is the only thing a header-only reviewer sees** | Three separate defects this session were claims that did not match the code: a clause saying the JSDoc paragraph states the `to_user_id` half (it did not), `SendToolInput` described as "one line past" a range when line 110 is blank, and a `Changes:` list that never named the rewritten per-tool JSDoc lines. Write the full delta, then make a test or a diff able to falsify each clause | `src/shared/tool-schemas.ts:1-14` |
| **Judgment Day is the repo's proven substitute, and it finds real defects** | Three passes on PR-07a: round 1 found a threat-model cell crediting a pin narrower than the cell claimed (proved with a deterministic zod probe) and a JSDoc that would have made PR-34 mark a transiently-down daemon permanent. Judges must return exactly `{"findings":[…],"evidence":[…]}`; `review-risk`/`review-*` agents are **not** dispatchable outside the native review lifecycle | `~/.agents/skills/judgment-day/SKILL.md` · `apply-progress.md` |
| **`gentle-ai` is 3.0.2 and the attempt ledger is retired** | Only `sdd-attempt grant` remains (`Runtime attempt operations are retired`). Every older instruction about `--max-changed-lines`, `settle` or a ledger `reset` is obsolete. `gentle-pi` is 3.1.1 | `gentle-ai sdd-attempt --help` |
| **Engram project key is `connmuta`** | The provider derives it from the git remote and **rejects** writes passed as `telegram_bus_agent`. Reads across projects still work | `mem_current_project` |
| **Mutation testing is what proves a test can fail** | Eight mutants in this slice, each built on a cleaned `dist/` (a mutant whose build fails is not evidence). One assertion needed a temporary **stub module** before it could be falsified, because the import it forbids cannot resolve yet | `apply-progress.md` mutant matrix |
| **Windows line-ending trap (cost two detours this session)** | `Path.write_text` and `read_text` translate line endings by default, so a "byte-identical" restore silently writes CRLF and a `"\r\n" in text` check never fires. Read/write with `read_bytes`/`write_bytes` or `newline=""`/`newline="\n"`. This repo forces `eol=lf` through `.gitattributes`; `.gitattributes` proves the *committed* form, not the worktree's | this session's EOL sweeps |
| **`gh` refuses `--force-with-lease`** | The tooling blocks destructive git even when the Director authorizes it. Do not plan a force-push | PR #8 history |

## Next session — exact start

1. Read [`../../AGENTS.md`](../../AGENTS.md) §1 (this file is step 0), then [`tasks.md`](../../openspec/changes/f1-daemon-registry-thin-client/tasks.md)'s **PR-07b** block, `apply-progress.md` (the PR-07a section's "Carried forward to PR-07b", the D4 item, the terminal verdict), and `design.md` §12 rows for `src/tools/fetch.ts:65-348` (`shared/tool-output.ts`).
2. `git branch --show-current` must be `main`; `git pull --ff-only`; remove a leftover `dist/` before the first build. Never `gh auth switch`; every `gh` call uses `GH_TOKEN="$(gh auth token -h github.com -u agentesinteligentesllm-oss)" gh …`.
3. Run the SDD preflight (`AskUserQuestion`, canonical marker text **and option order**) and `gentle-ai sdd-status f1-daemon-registry-thin-client --cwd <repo> --json`; it must say `nextRecommended: apply`, **38 completed**, `blockedReasons: []`. Otherwise stop and report.
4. **Decide with the Director how PR-07b is audited** — unblock the SDD dispatcher (`/gentle:sdd-preflight`) and run `sdd-apply`, or repeat ODD + Judgment Day. Ask; do not assume. Also confirm, before writing, whether they want the same PT-cell discipline (annotate only what this slice actually pins).
5. PR-07b is `shared/tool-output.ts` (SEAM from `v1:src/tools/fetch.ts:65-348`, ≈284 extracted lines) on `f1/07b-tool-output` from `main`; it needs **one** fixture entry. **Its twin must ship with it** (see the CI-safety row above), and **D4 is its first correction**: `test/shared/error-payload.test.ts`'s `errorResult` case drives the client-taxonomy code `UNBOUND_PROJECT` through `toolErrorPayload`.
6. After the slice: measure the real diff, read the new files in full, ask the Director before committing, commit as work units, verify from a clean detached worktree (`git worktree add --detach ../telegram_bus_agent-worktrees/verify-07b <sha>`, then `npm ci --ignore-scripts && npm run build && node --test "dist/test/**/*.test.js" && npm run test:static`, then remove it), and run the audit path chosen in step 4.
7. Stop at a PR boundary. Rewrite this file, append to [`LOG.md`](./LOG.md), record the debate or decision in the tribunal index, sweep the status lines in `AGENTS.md`, `README.md`, `docs/00-INDEX.md`, `openspec/config.yaml` and `state.yaml`, `mem_session_summary`, commit docs on `main`, push.

## Do not redo

- Spec, design and tasks are gated and audited; the only apply-time edits are PR-06's row and the PR-07a amendment, both in place, both recording their own numbers.
- Provenance hash rule, registry and the range convention: decided and ratified (`bus-v2-f1-pr-02-002`, `bus-v2-f1-pr-04-001`). **The pinned value includes the range's terminating newline**; `src/protocol.ts` has 477 real lines and the `478` in older citations is the array-slice convention.
- **Doc-hygiene rule** (ratified `bus-v2-f1-pr-03-001`): never quote a matched-and-rejected secret-shaped literal in `apply-progress.md`; describe the shape. PT-22 scans every tracked file.
- **THREAT-MODEL §4 rule**: a PR updates the file-name cell of the PT rows **it actually pins** — and only those. PR-06a left PT-14 as `daemon unit` (its pinning test is daemon-side; PR-25 owns it) and PR-07a left PT-07 as `static (client bundle)` (bundle-level; PR-34/PR-40 own it). An over-claimed cell is a defect. PT-02's cell correctly names `test/shared/tool-schemas.test.ts`.
- **PR-06 and PR-07a are merged; do not re-slice or re-audit them.** Their numbers live in `tasks.md` and `apply-progress.md`.
- `test/fakes/delivered-text.ts` is the home of `deliveredText`; the PR-18 `telegram-client.ts` fake imports it, never redefines it.
- TypeScript 7.0.2 needs `"types": ["node"]`; empty composite units are `TS18003` — `src/{client,daemon,cli}/tsconfig.json` join the root `references` when their first `.ts` lands (PR-08 cli, PR-15 daemon, PR-32 client).
- `test:wrong-room` matches by glob until PR-41; `npm pack` in `pack.test.ts` spawns `npm-cli.js` on win32. `repo-scan.test.ts` and `provenance.test.ts` exclude themselves by path; `git ls-files`-based scanners see only tracked or staged files, so `git add` (or `git add -N`) before a local RED/GREEN.
- `test/security/repo-scan.test.ts:13` intentionally keeps its own `TOKEN_SHAPE_RE` copy — orthogonal by design (`bus-v2-f1-pr-03-001`), not a defect.
- Type-only modules satisfy Strict TDD's triangulation gate via the explicit type-only exception in `strict-tdd.md`; a missing-module `TS2307` from `tsc` is a legitimate RED for a brand-new module.
- **Stale comments and stale records**: when a change alters behavior a prior file's comment describes, grep that prior file for the OLD behavior's keywords — and when you correct a figure, grep the whole record for every other place that repeated it. This session's judges found the same arithmetic defect twice, in the commit written to reconcile those very figures.

## Open points carried forward

| Id | Point | Owner |
|---|---|---|
| **new (D4)** | `test/shared/error-payload.test.ts`'s `errorResult` case drives the client-taxonomy code `UNBOUND_PROJECT` through `toolErrorPayload`. Nothing behaves wrongly (the value coincides with design §10), but it models the pattern the module's own JSDoc forbids. Escalated because the round budget was exhausted and the two judges disagreed on its causality | Kairo → PR-07b, first commit |
| **new** | `src/shared/constants.ts:3` pins the **blind-stripped** hash `4ce5e514…`; the rule-conformant value for `src/config.ts:26-166` is `039d53a2…` (control: `state.ts:15-87` pins `bd177372…`, which is the value *with* the newline). Pre-existing from the PR-01b lineage; a SEAM row's pin is never checked for correctness, only for inequality. Re-pinning invalidates PR-04's wrong-value-control table, so it needs its own audited change | Director → Kairo |
| **new** | design §12's reuse table marks `src/tools/send.ts:47-109` and `src/index.ts:29-42` **AS-IS** → `shared/tool-schemas.ts`, but the module is SEAM by construction (`bus-v2-f1-tasks-001` items 1–2). Reported, not silently resolved: `design.md` is gated | Director |
| new | How PR-07b onward are audited, given the PR-06 waiver and the PR-07a substitute | Director |
| B-16 / D-10 | `LICENSE` shipped with `private: true`; SECURITY/CONTRIBUTING/CHANGELOG and the copyright-holder line open; a **real tenant deny-list** for PT-22 must live outside the tree (CI secret) — decide at PR-42 | Director |
| B-11 | Trademark screening; `PRODUCT_NAME` is the single rename constant (`src/shared/constants.ts`) | Director |
| new | Digest blind spots incl. the `MAX_THREAD_HISTORY = 50` saturation — proposed minimal fix: the last history entry's `eid` in the digest row | Director → Kairo |
| new | The fence's body escape does not neutralise `&`, so the fence is not injective; needs its own decision because THREAT-MODEL §7 ratifies the fence as inherited unchanged | Director |
| — | `npm test` runs whatever is in a stale `dist/`; consider a `clean` step in a later PR, audited | Kairo → Alpha |
| — | GitHub Actions deprecation warning: `actions/checkout@v4` and `actions/setup-node@v4` target Node 20 — bump majors in a later CI PR, audited | Kairo → Alpha |
| — | T22 bytes-per-hour ceiling and origin-label organisation marker: no backlog id (PR-42) | Director |
| B-07, B-08 | Real-Telegram and Windows-ACL spikes | Director + Kairo |

## Environment facts the next session should not re-measure

- Machine: Windows 11, Node 24.16, npm 11.5, gentle-ai 3.0.2 CLI, gentle-pi 3.1.1, TypeScript 7.0.2 pinned.
- Line endings: both repos have `core.autocrlf=true`; this repository forces `eol=lf` through `.gitattributes`, the v1 checkout has none — vendored bodies are copied from `git show bf8f365:<path>` (raw blob) and the provenance hash normalizes CRLF→LF. **A tool that rewrites a file without `newline="\n"` reintroduces CRLF into the worktree**; `git ls-files --eol <path>` reports `i/lf w/lf` when it is clean.
- `node --test` summary lines are `ℹ tests / ℹ pass / ℹ fail` (with ANSI colour), not `# tests`; a grep on `^ℹ` fails when colour codes precede the glyph — strip them.
- GitHub Actions: the workflow is on `main`, so `pull_request` runs trigger on PR open (≈30–40 s per matrix entry, Node 24.15 and 26). `gh pr merge N --merge --delete-branch` also checks out `main` and pulls.
- v1 checkout beside this repository: `telegram-agent-bus` at `bf8f365`, read-only. Verification worktrees live in `../telegram_bus_agent-worktrees/` and are removed as soon as their run finishes. That checkout carries one pre-existing untracked file, `alpha_response.json` (an unrelated old Arena envelope) — harmless, not this project's state.
- Arena bridge: `.mcp.json` (gitignored) points at `http://127.0.0.1:8766/mcp`, which is the **Arena Orion Electron app** (`electron .` in `../Arena_construccion/doble_ventana/Arena_Orion`) and is **down** unless the Director launched it. Never quote `.mcp.json` contents and never commit it.
