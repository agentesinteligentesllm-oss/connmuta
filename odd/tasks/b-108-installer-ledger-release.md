# B-108 — the installer CLI releases its ledger, so a full test run leaves no `%TEMP%` behind

> **Written retrospectively, and that ordering failure is disclosed.** The code landed first and this
> document was written from the shipped diff afterwards, which inverts the ODD protocol's "track
> substantial work before the first write" rule. Session 61 set the same precedent for **B-105(a)** and
> recorded it the same way; the session-63 LOG entry states it too.

## Objective

Stop the suite's one systematic `%TEMP%` leak by fixing its cause, and leave the three new guarantees —
the ledger is released on return, on throw, and on the `setup` path — pinned by tests that fail if the
release is removed.

## Problem / why

Measured before any code was written, and the measurement changed the plan: the row proposed "one pass
over every `mkdtempSync`" (260 call sites across 40 files), but after a full `npm test` exactly **one**
directory was new — `%TEMP%\conmuta-cli-sync-roster-*` — and the three `main-*` survivors carried mtimes
from session 62's *interrupted* runs, not from a clean one. A sweep would have been churn.

The leak has a real cause, not test sloppiness. `runCli`'s installer paths opened the ledger and never
closed it. The ledger is WAL (`src/ledger/open.ts`'s `PRAGMA journal_mode = WAL`), and while a connection
is open its `-shm` mapping keeps the home directory pinned; on Windows a mapped file cannot be deleted, so
`test/cli/main.test.ts`'s `try { rmSync } catch {}` swallowed an `EPERM` and the directory stayed behind —
one per run, growing without a ceiling, and a stale directory is indistinguishable from a fresh one when
someone has to debug the suite by hand.

**RED observed before GREEN:** with the swallow removed and the old code in place, the test failed with
`EPERM, Permission denied: …\conmuta-cli-sync-roster-V5meG3` and left TWO directories (the failed `rmSync`
aborted before the second one).

## Scope decision

- **In scope:** the ledger's lifecycle in `src/cli/main.ts` (every installer path), and the strictness of
  the one test that can observe it.
- **Deliberately not in scope:** a sweep of the remaining `mkdtempSync` sites. There is no shared helper to
  converge on and the other call sites are already paired with their own cleanup, so adding one would be
  churn for its own sake.
- **Disclosed and still open:** a client killed without a graceful exit, and the B-106 session-slot
  remainder, are different mechanisms and are not touched here.

## Tasks

| # | Task | Evidence |
|---|---|---|
| 1 | Collapse the ledger open into ONE site: exported `withInstallerLedger(homeDir, body)`, closing in a `finally`; the open stays outside the `try` because `openInstallerLedger` closes its own handle on its one refusal path | `src/cli/main.ts`; `grep` shows exactly one `openInstallerLedger(` expression and it is inside the helper |
| 2 | Route all four installer verbs through it (`project sync-roster`, `bot add`, `group add`, `project bind`) | `src/cli/main.ts`'s `InstallerCliDeps` |
| 3 | Close the fifth path: exported `closeSetupOutcomeLedger(outcome)`, used by the `setup` dependency (`runSetup` cannot close the handle itself — a chaining caller continues against it) | `src/cli/main.ts`; `test/security/two-install-wrong-room.test.ts` is the chaining caller that proves why |
| 4 | Make the `project sync-roster` cleanup a real assertion: no `catch {}`, bounded `maxRetries`/`retryDelay` | `test/cli/main.test.ts` |
| 5 | Pin the mechanism directly, including the throwing-body path, instead of one end-to-end run | `test/cli/main.test.ts` (three added tests) |
| 6 | Encode the cause precisely (WAL `-shm` mapping, not "an open file") in the helper doc and the backlog row | `src/cli/main.ts`; `docs/06-backlog/CHECKLIST.md` |

## Verification

- `npm test` **1862 / 1856 / 0 / 6**; `npm run test:static` **99 / 99**.
- **Measured after the fix:** a full run leaves no new `%TEMP%\conmuta-*` directory; the 33 accumulated
  ones were removed.
- **Non-vacuity measured by mutation:** removing `opened.db.close()` fails 4 tests (including the
  pre-existing `project sync-roster` case) and removing `outcome.db.close()` fails its own test.
- Judgment Day round 1 found the fifth path (`setup`) that the first version of this fix missed, plus the
  one-of-four-sites pinning gap; both were corrected and are recorded in the tribunal row
  `bus-v2-b109-id-free-installer-entry-001`.
