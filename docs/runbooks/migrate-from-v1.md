# Runbook: migrating from v1 (`telegram-agent-bus`) to v2 (`conmuta`)

Audience: an operator running a real v1 (`telegram-agent-bus`) install who wants to move a bot to
v2 (`conmuta`). This is a step-by-step operational guide, not a design document — see
[`docs/03-adr/INDEX.md`](../03-adr/INDEX.md) and the `f1-daemon-registry-thin-client` design for the
architecture behind these steps.

The migration is performed by one non-interactive command, `conmuta migrate-v1`. It is read-only
against your v1 installation: it copies `config.json`/`state.json` into dated backups and never
renames, deletes, or otherwise modifies the originals. It refuses cleanly, with a reason, on any
precondition failure.

## Before you begin

1. **Stop every v1 process for this bot first.** Telegram's `getUpdates` long-poll allows exactly
   one active poller per bot token. If a v1 session (or another v2 daemon) is still polling when
   the v2 daemon starts, the Telegram Bot API returns a conflict; the daemon surfaces this as
   `TELEGRAM_CONFLICT`, the poller stops, and `conmuta`'s `status` output reports it. Confirm the v1
   process has exited before you start the v2 daemon for the first time.
2. **Locate your v1 home.** By default this is `~/.agentbus`, or the directory named by the
   `AGENTBUS_HOME` environment variable if you set one. You will pass this as `--v1-home`.
3. **Know your v2 project's absolute path**, if you are binding a project now (see step 3 below).
   `--project-path` must be an absolute path.
4. **Do not copy real credentials into a ticket, log, or chat when asking for help.** Every example
   below uses placeholder identifiers; substitute your own values when you actually run the
   command, and keep tokens, chat ids, and usernames out of anything you paste elsewhere.

## Step 1: dry run

Run the command once with `--dry-run` to see what it would do, without writing your migrated data
anywhere:

```sh
conmuta migrate-v1 --v1-home /path/to/.agentbus --dry-run
```

This reports which secret store would hold the token, what backups would be created, and a
summary of what would be written to the v2 ledger. None of your migrated data is written anywhere.
The one exception: a self-cleaning secret-store probe (a write-read-delete round trip against a
placeholder credential, never your bot's actual token) runs on every invocation, including a dry
run, to detect an unusable credential store early.

## Step 2: migrate the bot (no project yet)

```sh
conmuta migrate-v1 --v1-home /path/to/.agentbus
```

On success this prints exactly one line:

```
conmuta migrate-v1: migrated bot <bot_id> into <v2-home>
```

This single run: backs up `config.json` and `state.json` in place (see "What gets backed up"
below); stores the bot token in the OS keychain, or the ACL'd file fallback if the keychain is
unavailable on this machine; and writes the bot, the group, and the offsets row into the v2
registry and ledger under `~/.conmuta`. **No thread history is imported yet** — thread import is
keyed by project, so it only happens once a project is bound (step 3 below).

If `config.json` has no `bot_token` field, add `--token-stdin` and pipe the token in instead — the
token is never accepted as a command-line argument (it would be visible in process listings) and
is never read from an environment variable:

```sh
printf '%s' "$BOT_TOKEN" | conmuta migrate-v1 --v1-home /path/to/.agentbus --token-stdin
```

## Step 3: bind a project (optional, can be done later)

To also bind the bot's group to a project in the same run, add `--project-id` and
`--project-path` together (both or neither):

```sh
conmuta migrate-v1 --v1-home /path/to/.agentbus \
  --project-id prj-example \
  --project-path /abs/path/to/project
```

This additionally imports the roster and every open/resolved thread under that project, and prints
a proposed `conmuta.json` to stdout:

```
conmuta migrate-v1: proposed conmuta.json for /abs/path/to/project (commit this yourself; this tool never writes into a repository):
{
  "schema_version": 1,
  "project_id": "prj-example",
  "group_id": -1001111111111,
  "roster": [ ... ]
}
```

**This tool never writes into a repository.** Copy the printed JSON into `conmuta.json` at the
project root yourself and commit it — assigning the project folder is deliberately a human action.
**Bind the project in the same run as the migration, if you want one at all.** This build refuses
to add a project binding after the fact — even a first one — to a bot that has already been
migrated; the refusal is unconditional, not limited to a *second* project. If you already migrated
the bot without a project in step 2, adding one later via this command is not supported; hand-edit
the registry instead (see "Hand-editing the registry" below).

## What gets backed up

Both `config.json` and `state.json` are copied, byte-for-byte, to:

```
config.json.bak-pre-v2-<YYYYMMDD>
state.json.bak-pre-v2-<YYYYMMDD>
```

next to the originals in `--v1-home`. **The backup necessarily retains the bot token in plaintext**,
because it is a copy of `config.json` as-is. Treat these backup files with the same care as the
original `config.json` — restrict their permissions and delete them once you are confident you no
longer need to roll back.

Running the command again on the same (or a later) day against an already-migrated bot is
idempotent: it detects the existing backup and registry entry and reports "already migrated"
without writing anything new, and without touching the secret store again.

## Known limitation: the stale-cursor gap

Telegram's Bot API only retains undelivered updates for a limited retention window. If your v1
bridge was stopped for longer than that window before you migrate, any updates from that gap are
already gone by the time v2 starts polling — migration carries your v1 cursor (`next_update_id`)
forward **verbatim**, but it cannot retrieve messages Telegram has already discarded, and it makes
no claim that it can. Once the v2 daemon starts polling, its `fetch`/`status` tools report this as
`gap_warning`/`retention_warning` when the gap is large enough to matter — they report that a gap
exists, never its content. There is nothing to "recover": if this matters to your workflow, resume
polling (either v1 or v2) well within the retention window, not after an extended outage.

## Known limitation: null-anchor threads fail closed

Every imported thread's `to_user_id` is backfilled from your v1 roster. If a thread's original
recipient (`to`) is not present in `config.json`'s roster, `to_user_id` stays `null` after
migration — exactly as it was in v1. Under v2's stricter authorization rule (an unresolved anchor
never authorizes a reply), any future interaction with such a thread is rejected with reason
`unanchored` rather than silently misdirected. If you have threads addressed to an agent that has
since left the roster, expect them to be inert after migration rather than deliverable.

## Hand-editing the registry (until F2 ships project-management wizards)

This build of `conmuta` has no interactive commands for adding a project — first or second — to an
already-migrated bot, renaming a group, or similar registry edits — those wizards are planned for a
later phase (F2). Until then, hand-editing `~/.conmuta/registry.json` directly is permitted (the
registry is a human-owned file outside the daemon's own write path). Stop the daemon first
(`conmuta daemon stop`), edit the JSON with care — it must stay valid against the schema (each
bot/group/project/binding array entry needs the fields already present on its siblings) — and
restart. Malformed JSON, or an edit that violates a registry invariant (for example two active
bindings for the same bot), causes the daemon to refuse to start rather than run against a
corrupted registry.

## Rollback

If you need to abandon the v2 migration and resume v1:

1. Stop the v2 daemon: `conmuta daemon stop`.
2. Remove the v2 home directory: delete `~/.conmuta` entirely (registry, ledger, and any
   file-fallback secrets all live there).
3. Delete the migrated credential from the OS keychain: remove the entry named `bot:<bot_id>`
   (for example, via your OS's credential manager, keyed under the `conmuta` service). If the
   keychain was unavailable and the fallback file store was used instead, this file already lived
   under `~/.conmuta` and was removed in step 2.
4. Resume the v1 process against your original `~/.agentbus` — the originals were never modified,
   so v1 starts exactly as it left off, including its own `next_update_id` cursor.

## Troubleshooting: exit codes

`migrate-v1` never leaves v1 files modified on any exit code below.

| Exit code | Meaning | What to do |
|---|---|---|
| `0` | Success (including the idempotent "already migrated" case, and `--dry-run`). | — |
| `1` | An unexpected failure (disk full, a permissions error, a locked file). The message on stderr names the failure; no stack trace is printed. | Investigate the reported message, resolve it, and re-run — the run is safe to retry. |
| `2` | Usage error: a flag was misused (for example `--project-id` without `--project-path`, or a relative `--project-path`). | Fix the command line per the usage text printed alongside the error. |
| `5` | The running Node.js version is below this build's minimum. | Install a supported Node.js version. |
| `7` | The migration was refused on a precondition: an unreadable or invalid v1 `config.json`/`state.json`, no bot token available, `agent_id` missing from its own roster, a conflicting or invalid existing v2 registry, or a quarantined v2 ledger. | The stderr message names the specific precondition; resolve it and re-run. |

## Full command reference

```
conmuta migrate-v1 [--v1-home <dir>] [--project-id <slug>] [--project-path <abs dir>] [--token-stdin] [--dry-run]
```

| Flag | Required | Notes |
|---|---|---|
| `--v1-home <dir>` | No | Defaults to `AGENTBUS_HOME`, or `~/.agentbus`. |
| `--project-id <slug>` | Only with `--project-path` | Both or neither. |
| `--project-path <abs dir>` | Only with `--project-id` | Must be an absolute path; the project directory itself does not need to exist yet. |
| `--token-stdin` | No | Reads the bot token from stdin when `config.json` has no `bot_token`. Never pass a token as a plain argument or environment variable. |
| `--dry-run` | No | Runs every check identically but performs no migration writes (a self-cleaning secret-store probe still runs — see step 1). |
