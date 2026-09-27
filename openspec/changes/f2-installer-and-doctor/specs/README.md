# F2 spec coverage matrix

Change: `f2-installer-and-doctor`. Four new capabilities, two modified. Sources:
[proposal.md](../proposal.md) · [exploration.md](../exploration.md) (including its Addendum) ·
[ADR-0031](../../../../docs/03-adr/0031-npm-distribution-and-license.md) ·
[OVERVIEW.md §10](../../../../docs/02-architecture/OVERVIEW.md#10-installer-doctor-and-control-panel-f2--f3) ·
[THREAT-MODEL.md §5.6](../../../../docs/02-architecture/THREAT-MODEL.md#56-inherited-static-assertions-re-scoped-for-two-bundles-t17) ·
[DATA-MODEL.md §2.5](../../../../docs/02-architecture/DATA-MODEL.md).

## Decisions (D-31..D-40) coverage

| Decision | Capability |
|---|---|
| D-31 (B-05 closes via write-then-readback merge tests, non-empty fixtures) | tool-config-merge (test-level; fixture discipline named in requirement traces) |
| D-32 (strict per-format merge: JSONC / TOML, refuse-and-diff, pre-edit backup) | tool-config-merge |
| D-33 (tool selection by checkbox, no auto-detect) | installer-wizard (implicit: wizards never probe for installed tools) |
| D-34 (Pi as 8th row; `.mcp.json` shared-surface handling) | tool-config-merge |
| D-35 (writers are new modules; loader stays read-only) | registry-authoring |
| D-36 (merge preserves bytes outside the inserted entry) | tool-config-merge |
| D-37 (token handling: masked prompt, redacting `getMe`, straight to secret store) | installer-wizard, secret-store |
| D-38 (F2 verbs: `setup`, `bot add`, `group add`, `project bind`, `doctor`) | installer-wizard, doctor |
| D-39 (edits to merged F1 files get their own disclosed slice) | Not a spec-level item — a delivery/build-order note (proposal.md "Approach") |
| D-40 (start-at-login: opt-in, idempotent, removable, no services) | installer-wizard |

## PT coverage

| PT | Capability |
|---|---|
| PT-05 (doctor half: token-shape scan runnable from `doctor`) | doctor |
| PT-32 (doctor admin flag) | doctor |

## Intentionally uncovered by a capability spec

| Item | Reason | Pointer |
|---|---|---|
| B-05 spike itself | Closes via tool-config-merge's own tests (D-31), not a separate spec item | exploration.md Addendum item 1 |
| Auto-detection of installed tools (D-33) | Explicitly out of scope for the first slice | proposal.md "Out of scope" |
| Control panel (`panel`, `status`), Overview table (`list`) | Deferred to F3 | proposal.md "Out of scope" |
| macOS evidence, npm publish, pack test | Deferred to F6 | proposal.md "Out of scope" |
| Any wire change; `enableAllProjectMcpServers`; Codex `trust_level`; any settings/permissions file | Never in scope | proposal.md "Out of scope" |
| D-39 (own-slice discipline for merged-file edits) | A build-order/delivery decision, not an observable runtime behavior | proposal.md "Decisions recorded" D-39 |

## Requirements and scenarios per capability

| Capability | Type | Requirements | Scenarios |
|---|---|---|---|
| installer-wizard | New | 8 | 19 |
| registry-authoring | New | 3 | 7 |
| tool-config-merge | New | 7 | 12 |
| doctor | New | 6 | 11 |
| ipc-handshake | Delta (ADDED) | 1 | 4 |
| secret-store | Delta (1 ADDED, 1 MODIFIED) | 2 | 5 |
| **Total** | | **27** | **58** |

## Invariants touched (CONSTITUTION.md §2, repeated here for reviewer convenience)

- **Invariant 1** (bijective binding): `installer-wizard`'s `group add`/`project bind` requirements;
  `registry-authoring`'s validate-before-replace and R1-R6 enforcement; `ipc-handshake`'s
  project-scoping of the online doctor route.
- **Invariant 2** (secrets never leave the daemon): `installer-wizard`'s `bot add` requirement;
  `secret-store`'s installer write-path and ACL requirements; `tool-config-merge`'s zero-`env`
  requirement; `doctor`'s "prints `bot_id` only, never a token" requirement.

## Wire policy

No capability here touches the wire. `AGENTBUS/2` emitted, `/1` and `/2` accepted, unchanged
(CONSTITUTION.md rule W1); F2 has no envelope, sentinel, or `basis` change.
