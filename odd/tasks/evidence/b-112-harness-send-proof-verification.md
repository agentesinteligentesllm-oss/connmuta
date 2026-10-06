# B-112 — live verification of the send-proof profile for the three unset harnesses

**Measured:** 2026-10-06, session 76. **Host:** Windows 11, Node v24.16.0.
**Repository:** `telegram_bus_agent`, branch `docs/b-112-measured-send-proof-negatives`, `main` at `bd0688d`.

## What B-112 asked

`SEND_PROOF_PROFILES` (`runner/constants.ts`) declares a profile for `pi` alone; `claude`, `codex` and
`opencode` are `null`, which fails closed: the runner refuses the pair with `profile_unavailable` instead of
starting a turn with the harness's full toolset. The row asked to verify *each harness's own restriction flag
on the installed binary*, the way session 66 verified the argv **forms** — but session 66 never verified a
restriction *flag*, so the `null`s rested on "not verified" rather than on "verified and impossible".

## Method

The bar is session 71's `pi` probe: start the harness under the candidate profile and make it **declare its
own tools**. The pass condition is the one that matters for the Director's order (*no woken turn may send
anything, directly or indirectly*):

- no shell tool (a shell can read the daemon's run-file secret and speak the IPC — the two steps of the
  improvised send of 2026-10-04), and
- no bus tool (every `conmuta_*` tool arrives through MCP).

Two instruments were added so a pass is discriminating rather than reassuring:

1. **A control per harness**, run without the profile in the *bound* tree, so a "no bus tools" result can be
   read as the profile's doing and not as the bus being absent.
2. **A flag-acceptance discriminator**, which needs no model call: run the candidate flags with a throwaway
   prompt and compare against a deliberately bogus flag. If the candidate flags are real and parse, the run
   fails *later* than option parsing; if they are not, it fails at option parsing. This separates "the flag
   exists" from "the flag works", which are different claims.

## Reference — `pi` (session 71, unchanged)

`pi -p --no-extensions --tools read,grep,find,ls` declares exactly `read, grep, find, ls`: no `bash`, and zero
`mcp__conmuta` tools. This is the only measured pass.

## `claude` — flags exist and parse; the live probe is blocked

`claude --help` documents a genuine analogue:

- `--restricted` — "removes the built-in tools that run commands or code (Bash, PowerShell, REPL and the other
  code-running tools) and WebFetch unless `--tools` names them, and ignores user, project and local settings
  files (managed settings and `--settings` still apply; **add `--strict-mcp-config` to skip MCP servers too**)".
- `--strict-mcp-config` — "Only use MCP servers from `--mcp-config`", so with no `--mcp-config` no MCP server
  loads.
- `--tools <tools...>` — an explicit built-in allow-list (`""` disables all tools).

The discriminator confirms both candidate flags exist on the installed binary:

| Command | Result |
|---|---|
| `claude -p --restricted --strict-mcp-config "x"` | `Failed to authenticate: OAuth session expired and could not be refreshed` — parsed, then failed at auth |
| `claude -p --definitely-not-a-real-flag-xyz "x"` | `error: unknown option '--definitely-not-a-real-flag-xyz'` — failed while parsing |

So the flags are **not** rejected by the parser, and the second row shows the first row's failure is past that
stage. But the binary **cannot authenticate on this host**, so the tool-declaration probe has not been run and
the "no shell, no bus tools" claim is documented, not measured.

## `codex` — probed live, and it FAILS the bar

`codex login status` answers `Logged in using ChatGPT`, so the live probe is possible.

**Control (no profile flags), in the bound tree** — the turn does not start at all:

```
Failed to create session: ... failed to prepare fs sandbox: failed to prepare windows sandbox wrapper:
failed to enumerate unreadable glob paths under C:\Users\LABORATORIO\.pnpm-store\v10\projects\0286...
El sistema no tiene acceso al archivo. (os error 1920)
```

The default (user-config-loaded) sandbox mode cannot be prepared on this host. **This failure is not the
profile's**, and it is why the control could not be used as a tool-listing control.

**Candidate profile, `-s read-only --ignore-user-config`** — the turn starts and answers:

```
$ codex exec -s read-only --ignore-user-config --skip-git-repo-check "Say only: OK"
codex
OK
```

So `--ignore-user-config` + `-s read-only` is *depth*: it removes config-sourced MCP servers and makes the
turn start where the loaded config's sandbox mode fails. It is **not** a send-proof floor. Asked to declare its
tools, the same profile answers with (verbatim, both the streamed and the final list):

```
functions.apply_patch  functions.create_goal  functions.exec_command  functions.get_goal
functions.list_mcp_resource_templates  functions.list_mcp_resources  functions.read_mcp_resource
functions.request_plugin_install  functions.update_goal  functions.view_image  functions.write_stdin
functions.web__run
collaboration.followup_task  collaboration.interrupt_agent  collaboration.list_agents
collaboration.send_message  collaboration.spawn_agent  collaboration.wait_agent
functions.exec  functions.wait
```

Three independent reasons this cannot be a profile:

- **`functions.exec_command`** (and `functions.exec` / `functions.write_stdin`) — a shell survives. Codex's
  core capability is running commands; `-s read-only` restricts the *filesystem*, not the local IPC, so a turn
  could still read the run-file secret and speak the daemon, which is the send path the profile exists to cut.
- **`functions.web__run`** — network egress.
- **`collaboration.send_message`** — inter-agent messaging.
- The MCP **resource** tools remain, so `--ignore-user-config` removed config-sourced MCP *servers* without
  removing MCP as a capability.

## `opencode` — no flag-level profile exists, and the probe is blocked

`opencode run --help` exposes no tool-restriction flag. The nearest options are `--pure` ("run without external
plugins" — no bearing on built-in tools or MCP), `--agent` (an agent definition, i.e. config, not argv) and
`--auto` ("auto-approve permissions that are not explicitly denied (dangerous!)"). Tool permissions in opencode
live in its config/agent layer, so **no argv profile can be declared for it** and a `wake` turn under it would
need a config artifact this package deliberately does not write into another tool's tree.

The live probe is additionally blocked: `opencode run "<prompt>"` selects agent `gentle-orchestrator` with model
`deepseek-flash` and fails with

```
Authentication Fails, Your api key: ****0059 is invalid
```

## Conclusion for the constant

`SEND_PROOF_PROFILES` keeps `pi` and leaves `claude`, `codex` and `opencode` at `null`, now for a *measured*
reason each: `codex` was probed and provably retains a shell, network egress and a messaging tool; `claude` has
the right flags but cannot be run on this host to complete the probe; `opencode` has no flag-level restriction
to declare at all.

The direction of the asymmetry is the whole point of the row, so it is stated once more: for this flag a false
positive is a security regression. `null` fails closed — the turn is refused and nothing is sent — whereas a
wrong profile starts a real turn that can send. A `null` that is merely unexamined is therefore not the thing
to fix first; a `null` replaced by an unmeasured profile would be.

## What would close B-112

- **`claude`:** re-authenticate the installed binary, then run the session-71 probe under
  `--restricted --strict-mcp-config` (plus `--tools` if the default set needs narrowing) and record the declared
  tools. Everything except the credential is already established above.
- **`opencode`:** a decision, not a verification — either accept a per-harness config artifact as the profile
  mechanism, or leave `opencode` permanently outside `wake`.
- **`codex`:** a different profile shape would have to remove `exec_command`, `web__run` and
  `collaboration.send_message` together. No such flag combination was found; treat it as closed-unreachable
  unless one appears.

## Hygiene

No source file was changed by this verification. `git status --short` empty between probes; `%TEMP%/conmuta-*`
0 → 0; no bus tool was called (a `conmuta_fetch` would have advanced the shared inbox cursor).
