/**
 * Races `promise` against a `timeoutMs` timer so a caller never waits past that bound.
 *
 * The timer side always resolves (never rejects) — a timeout is silent, not an error; a caller that
 * must know whether it actually timed out should check its own state after this returns.
 * Must NOT import any transport or send module (ADR-0029, CONSTITUTION layer 2) — kept as an
 * isolated, single-purpose module so the daemon bundle's timer inventory (design.md §14) stays
 * confined and auditable, same reasoning as this file's `heartbeat.ts`/`idle.ts` siblings.
 */
export async function raceAgainstTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  await Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
}
