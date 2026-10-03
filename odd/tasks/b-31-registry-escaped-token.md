# B-31 — Close the JSON-escape bypass of the registry's R5 raw-text scan

## Objective

Close backlog row **B-31**: R5's forbidden-content scan runs over the registry file's **raw text before
parsing** (design §4), so a bot token written with a JSON escape — `1234567\u003aAAHk…` — has no literal
token shape in the file, is accepted, and then sits in `~/.conmuta/registry.json`, in the daemon's memory,
and is reported by nothing.

Fix: add a **post-parse value walk** beside the raw scan, mirroring the machinery `shared/project-file.ts`
already runs over `conmuta.json` (`collectForbiddenContent`).

## Why this disposition and not the others

B-31's recorded dispositions were "accept the raw-text approximation and say so" or "add a post-parse value
walk beside the raw scan … which is what `shared/project-file.ts` already does for `conmuta.json`, so the
machinery exists and the vocabulary would need no new member." The second is taken: the first leaves a token
that nothing reports, which is precisely the invariant the `ledger`/`registry` specs claim.

Two sibling rows in the same cluster were **deliberately not** taken here, and the reasons are load-bearing:

- **B-27** (the shared token regex matches `sha256:<64 hex>` because its digit run is unbounded) is a
  *detector* defect that reaches three call sites, and its own disposition says bounding the digit run "is
  **not** available as a silent fix" because a test deliberately pins a 7-digit fixture as a match. It needs
  either a stored-format change (a hash prefix that cannot read as a token — `design.md` §2 / DATA-MODEL
  §2.4) or a decision to widen PT-22's strict shape everywhere. That is a product/format decision, not a
  drive-by, so B-27 stays open.
- **B-30** (R5's strictness refuses human-authored text such as a group `title` of `Authorization review`)
  is an availability/diagnosis trade-off with three named dispositions and a product decision inside it.

B-31 is the one of the three that is purely additive and changes no format, no regex and no product surface.

## The trap this change must not fall into

The new walk must **reuse the existing `withoutRosterHashes` mask**. `roster_hash` is required on every
binding and its value `sha256:<64 hex>` matches the token regex by accident (B-27), so a naive walk over
parsed values would refuse **every valid registry** — reintroducing B-27's failure through the new path. The
mask, not the walk, is what makes a valid registry loadable; the existing test "the canonical roster hash is
exempt from R5: a registry carrying one loads" is this change's regression guard for exactly that.

## Tasks

| # | Task | Status |
|---|---|---|
| T1 | Write RED tests in `test/registry/loader.test.ts`: an escaped-colon token in a value, in a key, and inside a nested array/object is refused; a pathological deep document is refused without a `RangeError` | done |
| T2 | Implement the post-parse walk in `src/registry/loader.ts`, reusing `withoutRosterHashes` and the shared `assertNoTokenShape`, with a named depth bound | done |
| T3 | Verify: full suite, `test:static`, zero `%TEMP%` growth; confirm the canonical-hash exemption test still passes (the B-27 regression guard) | done |
| T4 | Update `docs/06-backlog/CHECKLIST.md` (row B-31), `docs/08-sessions/{HANDOFF,LOG}.md` | done |

## Verification plan

- Observed RED: each new test fails before the walk exists (the escaped form loads).
- Observed GREEN after the walk.
- Non-vacuity by mutation: removing the walk fails the new tests.
- **Discrimination test**, because this is the part that could go wrong in the other direction: the canonical
  `sha256:<64 hex>` registry must still load, and a token *completed into* a masked hex run must still be
  caught (`test/registry/loader.test.ts`'s existing `JD-A-001` boundary test).
- `npm test`, `npm run test:static`, and the `%TEMP%\conmuta-*` count unchanged.
