# secret-store Specification

## Purpose

The OS keychain and ACL'd-file fallback for bot tokens, the read/write API restricted to the
daemon, and the guarantee that no error, log, registry, or ledger path ever emits a token
(Invariant 2).

## ADDED Requirements

### Requirement: Tokens live only in the keychain or the ACL'd fallback

Bot tokens MUST be stored via `@napi-rs/keyring` under service `conmuta`, account `bot:<bot_id>`;
when the keychain is unavailable, the daemon MUST fall back to `~/.conmuta/secrets/<bot_id>.token`.
Only the daemon reads a token; the thin client and every other process MUST NOT have a code path
that resolves one.

#### Scenario: Round trip on the keychain

- GIVEN a token is written via `bot add` on a platform with keychain support (win-x64)
- WHEN the daemon later reads it for that `bot_id`
- THEN the read returns the same token, and it never touched `registry.json`

#### Scenario: Fallback file created when the keychain is unavailable

- GIVEN a platform or environment where `@napi-rs/keyring` reports unavailable
- WHEN a token is stored
- THEN `~/.conmuta/secrets/<bot_id>.token` is created and the token round-trips from it

Traces: ADR-0030 rule 3; DATA-MODEL.md §4; PT-09; CONSTITUTION.md §2 inv. 2

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

Traces: D-37 (F2); CONSTITUTION.md §2 inv. 2

### Requirement: Fallback file and daemon home are ACL'd

On Windows the daemon home and the fallback token file MUST carry a DACL restricted to the current
user (`icacls <path> /inheritance:r /grant:r <user>:F`), applied once by the installer/doctor CLI
and inherited by files the daemon creates later; on POSIX the mode MUST be `0600`. The daemon
itself MUST NOT run `icacls` (that stays in the installer/doctor bundle, keeping the daemon bundle
free of `child_process`). The `icacls` application MUST be idempotent: running `setup` or `bot add`
again on a machine already ACL'd MUST NOT fail and MUST NOT duplicate or widen the grant.

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
(idempotency precedent, F2); CONSTITUTION.md §2 inv. 2

### Requirement: No token in errors, logs or stacks

Every error and log path the daemon's Telegram client can take (network failure, protocol error,
API error, migration error, startup failure) MUST be asserted free of the token literal and of the
token-shape regex.

#### Scenario: Fixture token never leaks through an error path

- GIVEN a fixture token is used to exercise every classified error path of the Telegram client
- WHEN the resulting error and log output is scanned
- THEN it contains neither the token literal nor a match for the token-shape regex

Traces: ADR-0030 row "No token in errors, logs or stacks"; ADR-0029 §"Secrets never leave the
daemon"; PT-08; CONSTITUTION.md §2 inv. 2

## Traceability

| Source | Requirement / Scenario |
|---|---|
| ADR-0030 row "Secret store fallback is ACL'd" | Fallback file and daemon home are ACL'd (PT-19, idempotent re-run per F2 D-40) |
| ADR-0030 row "No token in errors, logs or stacks" | No token in errors, logs or stacks (PT-08) |
| PT-09 | Tokens live only in the keychain or the ACL'd fallback |
| D-37 (F2) | Installer writes a token through the existing secret-store API only |
