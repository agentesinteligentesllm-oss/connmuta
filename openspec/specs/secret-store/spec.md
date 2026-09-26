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

### Requirement: Fallback file and daemon home are ACL'd

On Windows the daemon home and the fallback token file MUST carry a DACL restricted to the current
user (`icacls <path> /inheritance:r /grant:r <user>:F`), applied once by the installer/doctor CLI
and inherited by files the daemon creates later; on POSIX the mode MUST be `0600`. The daemon
itself MUST NOT run `icacls` (that stays in the installer/doctor bundle, keeping the daemon bundle
free of `child_process`).

#### Scenario: Windows ACL lists only the current user

- GIVEN a fallback token file created under `~/.conmuta/secrets/`
- WHEN `icacls` is run against it
- THEN the listed grantee is only the current user

#### Scenario: POSIX mode is 0600

- GIVEN the same fallback file on a POSIX platform
- WHEN its mode is inspected
- THEN it is `0600`

Traces: ADR-0030 row "Secret store fallback is ACL'd"; THREAT-MODEL.md T09, §5.5, PT-19;
CONSTITUTION.md §2 inv. 2

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
| ADR-0030 row "Secret store fallback is ACL'd" | Fallback file and daemon home are ACL'd (PT-19) |
| ADR-0030 row "No token in errors, logs or stacks" | No token in errors, logs or stacks (PT-08) |
| PT-09 | Tokens live only in the keychain or the ACL'd fallback |
