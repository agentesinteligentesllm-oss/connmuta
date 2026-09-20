import { HEARTBEAT_PERIOD_MS } from "../../shared/constants.js";

/**
 * Options for starting the daemon heartbeat timer.
 */
export interface HeartbeatOptions {
  readonly periodMs?: number;
  readonly onTick: () => void | Promise<void>;
  readonly updateLockHeartbeat?: () => void;
  readonly onError?: (err: unknown) => void;
}

/**
 * Handle returned by `startHeartbeat` allowing caller to cleanly stop the timer.
 */
export interface HeartbeatHandle {
  stop(): void;
}

/**
 * Starts the periodic daemon heartbeat.
 *
 * Ticks every `periodMs` (defaulting to {@link HEARTBEAT_PERIOD_MS}).
 * On each tick, invokes `updateLockHeartbeat` (if provided) and `onTick`.
 * Unrefs the timer so it does not keep the event loop alive on its own.
 * Must NOT import any transport or send module (ADR-0029, CONSTITUTION layer 2).
 */
export function startHeartbeat(options: HeartbeatOptions): HeartbeatHandle {
  const periodMs = options.periodMs ?? HEARTBEAT_PERIOD_MS;

  const timer = setInterval(async () => {
    try {
      options.updateLockHeartbeat?.();
      await options.onTick();
    } catch (err) {
      options.onError?.(err);
    }
  }, periodMs);

  timer.unref();

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
