# Evidence — F7c: the doorbell collided with harness RPC children (B-124)

Reproduction on 2026-10-06, Windows 11, Node v24.16.0, `channel-pi` armed machine-wide
(`~/.pi/agent/settings.json` → `<repo>/dist/channel-pi/main.js`).

## Command (identical for both runs)

```sh
cd "<repo>/../FRISCO"   # any tree with an ancestor conmuta.json
{ sleep 2; printf '{"type":"prompt","message":"Say exactly AFTER_OK and nothing else."}\n'; sleep 14; } \
  | timeout 18 node <pi>/dist/cli.js --mode rpc \
      --session-dir <tmp>/<run> --tools read,grep,find,bash
```

The prompt is exactly the one `gentle-pi` sends (`lib/agents-runner.ts`: `{ type: "prompt", message }`) and is
written at t+2 s; the ring fires about t+1.2 s after `session_start`.

## Before — `dist` built from the unmodified source

- `before-child-session.jsonl`: 12 entries. Entry 4 is the system message
  (`toolsAdded`: `read,grep,find,bash,subagent_parent_message`) and **entry 5 is the ring**, before any parent
  prompt:

  ```
  5  custom_message/conmuta-doorbell
  ```

- RPC stdout:

  ```
  {"type":"response","command":"prompt","success":false,"error":"Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message."}
  ```

## After — the gate `ctx.mode === "tui"` in `channel-pi/main.ts`

- `after-child-session.jsonl`: 12 entries and **no** `custom_message/conmuta-doorbell` (grep count 0).
  Entry-type census: `session`, `model_change`, `thinking_level_change`,
  `custom/gentle-pi.session-worktree/v1`, 5× `message`, 3× `context_edit`.
- RPC stdout:

  ```
  {"type":"response","command":"prompt","success":true,"data":{"disposition":"started"}}
  ```

## What this proves

The child's own prompt is accepted and it runs its own turn; the automatic ring turn is gone. The interactive
path is pinned by "an interactive session still arms…" in `test/channel-pi/main.test.ts`, and the programmatic
path by the three `B-124` tests, which fail when the gate is removed (mutation evidence is pasted in the PR).
