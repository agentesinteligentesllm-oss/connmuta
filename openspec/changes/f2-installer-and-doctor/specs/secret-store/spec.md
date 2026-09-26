# Delta for secret-store

## ADDED Requirements

### Requirement: Installer writes a token through the existing secret-store API only

`bot add` MUST write a bot token using the same secret-store write API the daemon uses to read it
(`@napi-rs/keyring` under service `conmuta`, account `bot:<bot_id>`, with the same ACL'd-file
fallback), never a separate or ad hoc write path. The token MUST reach the secret-store write call
directly from the masked prompt, with no intermediate step that places it in argv, an environment
variable, a log line, or an error message.

#### Scenario: bot add writes through the shared secret-store API

- GIVEN a token entered at `bot add`'s masked prompt
- WHEN the token is stored
- THEN it is written via the same secret-store write call the daemon's read path reads from, under
  `bot:<bot_id>`, and no separate storage mechanism was used

#### Scenario: No intermediate exposure between prompt and store

- GIVEN a token entered at the masked prompt
- WHEN the write completes or fails
- THEN the token never appeared in process argv, in an environment variable, in a log line, or in
  an error message at any point in the flow

Traces: D-37; CONSTITUTION.md §2 inv. 2

## MODIFIED Requirements

### Requirement: Fallback file and daemon home are ACL'd

On Windows the daemon home and the fallback token file MUST carry a DACL restricted to the current
user (`icacls <path> /inheritance:r /grant:r <user>:F`), applied once by the installer/doctor CLI
and inherited by files the daemon creates later; on POSIX the mode MUST be `0600`. The daemon
itself MUST NOT run `icacls` (that stays in the installer/doctor bundle, keeping the daemon bundle
free of `child_process`). The `icacls` application MUST be idempotent: running `setup` or `bot add`
again on a machine already ACL'd MUST NOT fail and MUST NOT duplicate or widen the grant.
(Previously: the requirement stated the ACL rule and the daemon's non-involvement; it did not yet
specify that the installer-side application must be idempotent across repeated runs, because no
installer existed to apply it.)

#### Scenario: Windows ACL lists only the current user

- GIVEN a fallback token file created under `~/.conmuta/secrets/`
- WHEN `icacls` is run against it
- THEN the listed grantee is only the current user

#### Scenario: POSIX mode is 0600

- GIVEN the same fallback file on a POSIX platform
- WHEN its mode is inspected
- THEN it is `0600`

#### Scenario: Re-running the installer does not duplicate or widen the ACL

- GIVEN a home directory and fallback file already ACL'd by a prior installer run
- WHEN `setup` or `bot add` runs again and re-applies the ACL step
- THEN the command succeeds, and the grantee list still lists only the current user with no
  duplicate or additional grantee

Traces: ADR-0030 row "Secret store fallback is ACL'd"; THREAT-MODEL.md T09, §5.5, PT-19; D-40
(idempotency precedent); CONSTITUTION.md §2 inv. 2

## Traceability

| Source | Requirement / Scenario |
|---|---|
| D-37 | Installer writes a token through the existing secret-store API only |
| ADR-0030 row "Secret store fallback is ACL'd" | Fallback file and daemon home are ACL'd (idempotent re-run) |
