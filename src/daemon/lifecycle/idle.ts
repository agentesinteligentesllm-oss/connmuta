import { IDLE_SHUTDOWN_HOURS } from "../../shared/constants.js";

const MS_PER_HOUR = 3600 * 1000;
const DEFAULT_IDLE_CHECK_INTERVAL_MS = 60_000;

/**
 * Dependencies for idle check calculation.
 */
export interface IdleCheckDeps {
  readonly now?: () => number;
  readonly startedAt?: number;
  readonly getLastSessionSeenAt: () => number | null;
  readonly getOpenThreadCount: () => number;
  readonly onIdle?: () => void;
}

/**
 * Handle returned by `startIdleCheck` to stop periodic idle checks.
 */
export interface IdleCheckHandle {
  stop(): void;
}

/**
 * Evaluates whether the daemon has been idle long enough to shut down.
 *
 * Rules:
 * 1. If `getOpenThreadCount() > 0`, returns `false` (open thread blocks idle shutdown).
 * 2. If `now() - (getLastSessionSeenAt() ?? startedAt ?? now()) >= IDLE_SHUTDOWN_HOURS * 3600 * 1000`,
 *    returns `true` and triggers `onIdle()`.
 * Must NOT import any transport or send module (ADR-0029, CONSTITUTION layer 2).
 */
export function checkIdleShutdown(deps: IdleCheckDeps): boolean {
  if (deps.getOpenThreadCount() > 0) {
    return false;
  }

  const now = deps.now ? deps.now() : Date.now();
  const lastActivity = deps.getLastSessionSeenAt() ?? deps.startedAt ?? now;
  const idleMs = now - lastActivity;
  const idleThresholdMs = IDLE_SHUTDOWN_HOURS * MS_PER_HOUR;

  if (idleMs >= idleThresholdMs) {
    deps.onIdle?.();
    return true;
  }

  return false;
}

/**
 * Starts a periodic idle check timer.
 */
export function startIdleCheck(
  deps: IdleCheckDeps & { readonly checkIntervalMs?: number },
): IdleCheckHandle {
  const intervalMs = deps.checkIntervalMs ?? DEFAULT_IDLE_CHECK_INTERVAL_MS;
  const startedAt = deps.startedAt ?? (deps.now ? deps.now() : Date.now());
  const effectiveDeps: IdleCheckDeps = {
    ...deps,
    startedAt,
  };

  const timer = setInterval(() => {
    if (checkIdleShutdown(effectiveDeps)) {
      clearInterval(timer);
    }
  }, intervalMs);

  timer.unref();

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
