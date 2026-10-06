# B-125 — the exact change the harness child needs, with the host semantics it depends on

> **Status:** proposal only. Nothing in this repository or in the installed package was edited.
> **Row:** `docs/06-backlog/CHECKLIST.md` → `B-125`; [ADR-0036](../../../docs/03-adr/0036-pi-host-doorbell-adapter.md)
> "Amendment (2026-10-06)".
> **Target of the change:** `gentle-pi` (`gentle-pi` v4.0.0, repository
> `git+https://github.com/Gentleman-Programming/gentle-shell.git`), installed here at
> `~/.pi/agent/npm/node_modules/gentle-pi/`.

## The gap

The B-124 gate stops *this* repository's doorbell from ringing a headless harness child. The child still loads
**every** machine-wide extension, so any other settings-driven extension that injects a message at
`session_start` can reproduce the same defect — an automatic turn before the caller's own task, whose prompt is
then rejected with *"Agent is already processing"*. The structural remedy belongs where the child's argv is
built, not in each extension.

## The change

`lib/agents-runner.ts` → `childArguments` (lines 258–271 at v4.0.0). Today:

```ts
const args = ["--mode", "rpc", "--session-dir", request.sessionDir];
for (const path of request.extensionPaths ?? []) args.push("--extension", path);
```

Proposed:

```ts
const args = ["--mode", "rpc", "--session-dir", request.sessionDir, "--no-extensions"];
// Only the caller's own extensions, never the machine-wide settings ones: a headless child must not pick up
// an extension that injects a turn at session_start (B-124). `--no-extensions` suppresses settings discovery
// only; the explicit `--extension` paths below still load, so a child that legitimately needs one keeps it.
for (const path of request.extensionPaths ?? []) args.push("--extension", path);
```

## Why that is safe, measured in the host's own code

- `--no-extensions` **drops settings-driven discovery only**. The host's own launcher depends on exactly this:
  it pushes `--no-extensions`, then re-adds what must survive as explicit `-e <path>` entries —
  `lib/gentle-shell-launcher.ts:928` (`args.push("--no-extensions")`) and its comment at `:904-908`
  (*"`--no-extensions` drops normal settings-driven extension discovery, so it is replaced by an explicit
  `-e <dir>` for every OTHER settings package"*).
- The runner already passes per-child extensions explicitly: `lib/agents-runner.ts:260`
  (`args.push("--extension", path)` for each `request.extensionPaths`). Those are unaffected.
- `--no-extensions` is a boolean flag: unlike a value-consuming flag it cannot swallow the token that follows
  it, which is the defect class session 73 found in the wake profile's deny-list (B-117).
- The runner already strips the interactive-host marker from every child
  (`lib/agents-runner.ts:471`, `withoutInteractiveHost`). This change closes the same class one layer down: not
  *our* extension declining to arm, but *no settings-driven extension* loading at all.

## Acceptance, if the Director takes it

1. A unit test on `childArguments` asserting the output contains `--no-extensions` **and still contains**
   `--extension <path>` for a request carrying `request.extensionPaths` (the pair is the whole guarantee; either
   half alone is not it).
2. A negative control: a request with no `extensionPaths` carries `--no-extensions` and no `--extension`.
3. Behavioural: in a bound tree with a settings-driven extension armed, a harness child completes its parent's
   task with no injected turn — the B-124 reproduction, now unreachable.

## What it deliberately does not do

- It does not touch this repository, and no local patch to `node_modules/` is acceptable as the fix: an
  installed-package edit is invisible, lost on the next install, and diverges the running harness from its own
  release.
- It does not decide whether a child should be able to load a machine-wide extension at all. If some child
  legitimately needs one, the answer is `request.extensionPaths`, which keeps working.
