# ADR-0038 — A ring is best-effort, and the loss is bounded by the cursor split

## Status

`accepted` — confirmed by the Director on 2026-10-07, who delegated the choice among the options below with full
authority and left it to the maintainer's judgement; option (b) was taken. The one further amendment to ADR-0036
and the four pins below land in the same unit as the code. Written by session 76 on 2026-10-06 to close the open
design question of **B-119**, whose row had reserved the choice to the Director.

## Date

2026-10-06.

## Debate

None, and this ADR does not claim one. Arena has been unreachable at every session start since session 55, so
**no debate id exists for this ADR**. Its source is the PR #106 audit (`JD-A-002` round 1, `JD-B-1` round 2)
**and that audit's own follow-up pass, which found the round-1 claim itself wrong**; the audit record is the
tribunal row for that audit, not a sentence here.

## Context

ADR-0036's host adapter rings the live session through Pi's extension-facing `sendMessage`, and the shipped
`DoorbellWatcher` treats a resolved `deliver` as "the ring was delivered", so it commits the doorbell cursor. The
question is what a *failed* ring means at that call site.

This was measured in Pi's own source, and the measurement is two-layered — the layers behave **oppositely**:

- **A stale context throws.** The host hands the extension an API object whose `sendMessage` calls
  `assertActive()` first (`@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:302-305`), and
  `assertActive` throws `Error(state.staleMessage)` once the runtime was replaced, reloaded or shut down
  (`:113-115`). The throw is **synchronous**. It propagates out of `host.ts`, the watcher records
  `deliver_failed`, backs off, and does **not** commit the cursor — so that ring **is** retried. This half already
  behaves correctly and needs no decision.
- **A live session's rejected delivery is swallowed.** One layer down, the runtime binds
  `sendMessage: (message, options) => { this.sendCustomMessage(message, options).catch(err => runner.emitError({ event: "send_message", … })) }`,
  and the extension-facing declaration is `void` — the `sendMessage(...): void` signature in
  `@earendil-works/pi-coding-agent`'s `dist/core/extensions/types.d.ts`, cited by symbol rather than by line
  because a dependency's line numbers move with its version and the claim is about the declaration, not a
  location. A rejection from there is reported to
  the **host's own** error surface and never reaches `host.ts`, so the ring resolves, the cursor commits, that
  window is not re-read, and the live session is not told.

Three facts bound the severity, and all three are load-bearing for the decision:

1. **The message is not lost.** The doorbell cursor is not the session's own client cursor. The session still
   sees the row the next time it fetches. What is lost is the **nudge**, not the message.
2. **There is no failure to inspect.** The extension-facing `sendMessage` is declared `void`: it returns nothing,
   so there is no value at the call site that distinguishes "delivered" from "the runtime's `.catch` ran".
3. **Resolving is deliberate, not sloppy.** `host.ts` resolves normally when a ring is merged into the next one
   by the cooldown (`PI_RING_COOLDOWN_MS`); rejecting there would look like a delivery failure and make the
   watcher back off and re-read the same window. So "reject to force a retry" cannot be the blanket rule — a
   *merge* is not a failure, and the call site cannot tell the two apart from the outside.

## Options considered

**(a) Make delivery verifiable, and refuse to advance the cursor for an unverifiable ring.** The stronger
guarantee, and honest in shape. Rejected on measurement: the extension-facing API exposes no delivery result
(fact 2), and the only signal is the host's internal `runner.emitError` surface, which the extension API does
not hand out. Making it observable means either patching or wrapping the host's own runtime — a dependency the
adapter deliberately does not take, and one that would break on a host update without notice — or verifying
against the live host per ring, which is a round trip the adapter cannot make inside a `deliver` that the
watcher expects to settle. It would also collide with fact 3: refusing on an *undecidable* outcome would turn
every merged ring into a back-off loop.

**(b) Accept best-effort explicitly, and record the loss as a known, bounded degradation.** The adapter states
that a resolved ring means "the ring was handed to the host", not "the session saw it"; ADR-0036 carries that
statement; the loss is bounded by the cursor split, and the half that *can* be detected (the stale-context
throw, which propagates) keeps being retried.

**(c) Poll the session's own cursor to confirm the session turned.** Would make the ring verifiable after the
fact, but it re-reads the ledger from inside a delivery path, needs the daemon, and replaces a push guarantee
with a weaker polling one. Rejected: it inverts what ADR-0036 exists to do.

## Decision

**Adopt (b).**

1. `channel-pi/host.ts` keeps resolving for a ring it handed to the host, and its module doc keeps stating the
   two layers separately: the stale-context throw propagates and **is** retried; the runtime's own swallowed
   rejection is **not** observable from here and is accepted.
2. **ADR-0036 gets one **further** appended amendment** — not a rewrite — stating that the host-push plane is
   **best-effort**: a resolved ring means the ring was handed to the host, not that the session received it;
   the retry guarantee covers the throw it can see, and the swallowed case is a bounded, disclosed degradation,
   not a guarantee. The amendment lands with the code, after this ADR is confirmed.
3. The bound is **pinned, not narrated**: a test must show that a ring which is resolved but never delivered
   leaves the *message* visible to the session's own client cursor. Without that test, "the message is not
   lost" is a claim; with it, it is the property that makes best-effort acceptable.
4. `channel/doorbell-loop.ts` is **not** changed. The loop must not branch on the link's error code; the
   decision belongs at the delivery site, which is where the adapter sits.

## Consequences

- The product states one honest guarantee instead of two: **the message is guaranteed, the nudge is
  best-effort**. A session that is asleep through a swallowed ring learns about the message when it next fetches
  rather than when the ring failed.
- Nobody is told about the individual loss. There is no UI surface for it and this ADR does not invent one; the
  degradation is recorded here, in ADR-0036's amendment, and in the runbook, which is what "disclosed rather
  than papered over" means in this repository.
- The retry story becomes narrower and therefore clearable: retries cover the stale-context throw, and that is
  the only failure the adapter can see.
- Choosing (b) is a decision to stop: option (a) remains available if a future host version exposes a delivery
  result, and this ADR does not forbid reopening it — it records that today the signal does not exist.

## Supersedes

Nothing. It decides the open question **inside** ADR-0036 (the host-push plane's delivery guarantee) and
proposes one appended amendment to it; it does not supersede ADR-0036, and it changes no invariant, no layer
rule and no wire behaviour.

## Tests that must pin it

Each can fail, and the third is the one that carries the decision:

1. **The detectable half still retries.** A ring attempted against a stale context rejects/throws, the watcher
   records `deliver_failed`, and the doorbell cursor is **not** advanced — so the same window is read again.
2. **A merge is not a failure.** A ring merged by the cooldown resolves normally and advances the cursor, so the
   watcher does not back off and re-read the window it just handled.
3. **The bound, pinned.** For a ring that resolved without being delivered, the message row is still visible to
   the session's own client cursor: advancing the doorbell cursor does not consume it from the session's side.
   This is the property that makes best-effort acceptable, and it is asserted directly rather than inferred from
   the cursor code.
4. **The module doc and the runbook say the same thing as the tests** — best-effort for the ring, guaranteed for
   the message — so the three cannot drift apart silently.
