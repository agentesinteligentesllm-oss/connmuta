# Session log — append-only, newest first

> One entry per session: what closed, what opened, pointers. An entry never expires; the status it
> describes does (see [`HANDOFF.md`](./HANDOFF.md) for the current state). Rules from v1's
> ROLLOUT-LOG apply: dated, newest first, and every claim says how it knows.

## 2026-09-15/16 — Session 1: landing (F0) and F1 planning through proposal

**Closed**

- Analysis of the v1 bus and the external constraints: 5 code mappers, 5 evidence researchers, 1 critic (bundle outside the tree; conclusions absorbed into the ADRs and THREAT-MODEL).
- Debate `bus-v2-landing-architecture-001` (2 rounds, CONSENSUS): architecture D1–D11, four objections accepted, four amendments approved.
- F0 documentation tree (45 files) written, verified (links, leaks, consistency) and audited: debate `bus-v2-f0-docs-audit-001` (CONSENSUS).
- Director notes DN-01..DN-04: mockups; name Conmuta; referee / desktop / gentle-ai requirements; license Apache-2.0 + ADR-0028..0031 confirmed + commit authority.
- gentle-ai SDD initialized (hybrid); `f1-daemon-registry-thin-client` explored and proposed; debate `bus-v2-f1-proposal-001` (CONSENSUS).
- First commits on `main`; `LICENSE` added.

**Opened**

- F1 spec + design + tasks (next session; see HANDOFF).
- Backlog B-01..B-18 (see CHECKLIST); B-06, B-14, B-17, B-18 decided; B-11 name chosen, screening pending.

**How it knows**: tribunal envelopes read through the Arena bridge; files on disk; `gentle-ai sdd-status` output; Engram observations #3053–#3076.
