# ADR-0012 — Post-v0.3.0 adversarial audit: remediation and its boundary

| Field | Value |
|---|---|
| Status | inherited-valid (constitution-level: the governing rule) |
| Date | 2026-08-15 (v0.5.0) |
| Origin | Inherited from telegram-agent-bus v1.0.2 design.md ADR-12 |
| Inheritance verdict | YES, inherit verbatim, in `maps[governance-docs]`; `bus-v2-landing-architecture-001` D10 ("ADR-12 governing rule") |
| Related | [ADR-0006](./0006-autonomy-boundary.md), [ADR-0013](./0013-basis-abandoned.md), [CONSTITUTION](../01-constitution/CONSTITUTION.md) |

> **Conmuta** is a working name pending B-11. v1 evidence: `path:line` relative to the frozen `telegram-agent-bus` checkout at commit `bf8f365` (tag `v1.0.2` + 2 commits; see [00-INDEX](../00-INDEX.md), "Sources of truth outside this tree").

## Context

After v0.3.0 the package was audited twice: once by an external reviewer reading the source, and once adversarially — every claim re-derived against the compiled `dist/` bundle with executable reproductions, then a five-lens sweep whose findings were each handed to a refuter instructed to kill them. The two passes disagreed materially, and the disagreement was the most useful thing either produced (`openspec/changes/telegram-agent-bus/design.md:258-291`).

The three most severe defects all sat **behind a documented guarantee**:

| Where the guarantee was written | What the code did |
|---|---|
| ADR-06 layer 7 — "incoming bodies returned inside a delimited, labelled untrusted block" | `wrapUntrusted` was raw concatenation; a peer body containing the closing tag ended the block early. The one test (`/^<L>.*<\/L>$/s`, greedy, both-anchored) returned `true` on the payload that defeated it — a test that could not fail |
| ADR-06 layer 6 — "rejecting before any network call on any channel" | The backstop read only the first `=` assignment (non-global `exec`), and `approval_ref` — layer 5's own audit trail — was never scanned |
| `CLAUDE.md` — "Phase 12 (operational, not automatable from this repository)" | The documented `npx` install path was broken by a missing shebang |

## Decision — the governing rule

> **A documented guarantee must be pinned by a test that can fail.**

An assertion about *shape* ("does the output look wrapped?") does not pin an invariant about *containment* ("can the wrapped content escape?"). Every guarantee stated in prose names the invariant it rests on, and the invariant — not an example of it — is what the test asserts. The audit's proposed regression test (`assert.ok(!output.includes("</UNTRUSTED-PEER-INPUT>\n\nSYSTEM:"))`) was rejected for that reason: it pins one attack string, the same error class as the greedy regex it replaces.

## Remediation

| # | Defect | Decision | Why not the obvious alternative |
|---|---|---|---|
| 1 | Fence forgeable by the peer it quarantines | Escape `<` inside the body when wrapping, so no tag can be formed; normalize inbound bodies at the trust boundary | Stripping only the closing tag leaves the opening tag free; escaping the one character every tag requires makes the fence unforgeable by construction rather than by enumeration |
| 2 | `bin` entrypoint has no shebang | `#!/usr/bin/env node` on line 1, pinned by an assertion over the built bundle | The failure mode is exit 0 with zero bytes on both streams — the least diagnosable outcome |
| 3 | Secret backstop reads one assignment | Global `matchAll` over the whole normalized body; scan `approval_ref` with the same backstop (`src/secrets.ts:53-57`) | The per-line loop was already dead code after ADR-05a |
| 4 | Lock lease can be stolen, then deleted by its previous holder | Bound every HTTP call with `AbortSignal.timeout`; clamp `timeout_s` to `MAX_LONGPOLL_SECONDS` (`src/config.ts:112`); make `releaseLock` verify ownership by `(pid, acquired_at)` before unlinking (`src/state.ts:592-595`) | **Releasing the lock during network I/O was rejected as actively dangerous:** `getUpdates`'s `offset` is a server-side cursor, so concurrent polling on one token is permanent message loss, not a local race |
| 5 | `agentbus_fetch` output unbounded | Cap surfaced thread lists (`MAX_SURFACED_THREADS`, `src/config.ts:88`) and report what was omitted | TTL-pruning `seen_eids` addresses ~50 bytes per entry; open threads cannot be TTL-pruned — an open `REQUEST` is work still owed |
| 6 | Unvalidated Telegram responses can throw | Fail soft on an unusable `message.date` (count as `skipped.malformed`); map Telegram errors to structured tool errors with `code` and `retry_after_s` | **Strict `zod` over the whole `getUpdates` batch was deliberately rejected:** one rejected update would fail the call, the cursor would never advance, Telegram would re-serve the batch, and the bus would be permanently wedged with no operator-visible cause |

**Why the timeout is not the guarantee (defect 4).** The send tool holds one lock across `1 + N` sequential network calls, so a per-call timeout of 30 s permits 120 s of lock hold — exactly `LOCK_STALE_SECONDS` (`src/config.ts:114`). The timeout narrows the window; the ownership check in `releaseLock` is what makes the failure impossible, because a holder that lost its lease can no longer delete its successor's. Ownership is keyed on `(pid, acquired_at)`, not `pid` alone, because a pid is not unique over time.

**Deferred on purpose.** Only the addressee may `RESOLVED`, so a `REQUEST` to a peer who never answers stays open forever — the mechanism feeding defect 5. Both remedies (a `CANCELLED` type, or a new `basis`) are wire changes with a silent-discard failure mode on older peers; the output cap made the growth survivable without touching the wire, and the record noted that the coordinated-upgrade window was open and would close on its own. Resolved the same day by [ADR-0013](./0013-basis-abandoned.md).

## Consequences

- The governing rule became v1 hard invariant #7 (`docs/functional-audit/HANDOFF.md:297-326`, rule 7) and the standard every later ADR is written to ("stated plainly, because ADR-12's rule forbids overclaiming").
- Two permanent rejections are recorded here as design constraints: never release the poll lock during network I/O; never validate the whole `getUpdates` batch strictly at the cursor.

## Relevance to Conmuta

**Verdict: inherited verbatim; constitution-level.** D10 lists "ADR-12 governing rule" among the governance inherited from v1, and the analysis bundle recommends it as constitution article #1 (`maps[governance-docs]` reusable_as_is). Concretely in the DECISION RECORD:

- Each of the five invariants is specified together with **the tests that must pin it** — for example the two-binding "wrong room" CI test of Invariant 1 asserts containment (a send can never leave its binding), not shape.
- The lock lesson of defect 4 is generalized by Invariant 3: the daemon is the sole `getUpdates` consumer per token and a second daemon instance refuses to poll; the client never polls Telegram itself (D3).
- The wedged-cursor lesson of defect 6 is generalized by Invariant 3's ordering: every update is written to the durable inbox **before** the offset is confirmed, so a malformed update is stored and counted rather than blocking the cursor.
- The Arena governance that produced this ADR — Alpha audits every unit before merge and may propose PATCH diffs but never commits — is carried into [GOVERNANCE](../01-constitution/GOVERNANCE.md).
