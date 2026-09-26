import { EventEmitter } from "node:events";
import type { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { HEARTBEAT_PERIOD_MS } from "../shared/constants.js";
import { openLedger, type LedgerOpenResult } from "../ledger/open.js";
import { isRetentionSweepDue, sweepRetention } from "../ledger/retention.js";
import { createRegistryLoader, type RegistryLoader } from "../registry/loader.js";
import type { RegistryBot } from "../registry/schema.js";
import { selectSecretStore } from "../secret-store/index.js";
import type { SecretStore } from "../secret-store/types.js";
import { ensureHomeDirs, resolveHomeDir, type HomeDirs } from "./home.js";
import { writeDaemonLog } from "./log.js";
import { startHeartbeat } from "./lifecycle/heartbeat.js";
import { checkIdleShutdown } from "./lifecycle/idle.js";
import { acquireLock } from "./lifecycle/lock.js";
import { deleteRunFile, writeRunFile, type DaemonRunPayload } from "./lifecycle/run-file.js";
import { BindingsReconciler } from "./bindings.js";
import { startPoller } from "./poller.js";
import { TelegramApiClient, type TelegramClient } from "./telegram.js";
import { createIpcServer, type IpcHandler, type IpcServerHandle } from "./ipc/server.js";
import type { IpcRouteKey } from "../shared/ipc-contract.js";
import { createIdentityHandler, PendingHandshakeStore } from "./ipc/handshake.js";
import { createSessionRoutes, type RoutesDeps } from "./ipc/routes.js";
import { SessionStore } from "./ipc/sessions.js";

/**
 * Options for daemon bootstrap dependency injection (design §15).
 */
export interface DaemonOptions {
  readonly homeDir?: string;
  readonly now?: () => number;
  readonly secretStore?: SecretStore;
  /**
   * Overrides the composition root's real `SecretStore.get` + `TelegramApiClient` factory (PR-40a).
   * Production never sets this; tests use it to exercise `BindingsReconciler` wiring without a live
   * Telegram network call.
   */
  readonly telegramClientFactory?: (bot: RegistryBot) => TelegramClient | Promise<TelegramClient>;
  readonly heartbeatPeriodMs?: number;
}

/**
 * Running daemon instance.
 */
export interface DaemonInstance {
  readonly dirs: HomeDirs;
  readonly port: number;
  readonly runFile: DaemonRunPayload;
  readonly ledger: LedgerOpenResult;
  readonly registry: RegistryLoader;
  readonly secretStore: SecretStore;
  readonly stop: () => Promise<void>;
}

/**
 * Helper to load registry for a daemon home directory.
 */
export function loadRegistry(homeDir: string): RegistryLoader {
  const loader = createRegistryLoader({ path: join(homeDir, "registry.json") });
  loader.sync();
  return loader;
}

/**
 * Reads the latest session activity timestamp from the ledger.
 */
export function getLastSessionSeenAt(db: DatabaseSync): number | null {
  try {
    const row = db
      .prepare("SELECT max(last_seen_at) as m FROM client_cursors")
      .get() as { m: string | null } | undefined;
    return row?.m ? Date.parse(row.m) : null;
  } catch {
    return null;
  }
}

/**
 * Boots the daemon following the design §7.1 state machine:
 * ensure ~/.conmuta/{run,secrets} -> acquire run/daemon.lock -> open ledger ->
 * load registry -> select secret store -> listen IPC -> write run/daemon.json ->
 * start heartbeat -> reconcile bindings -> RUNNING.
 *
 * **PR-40a: the real composition root.** Before this PR, `startDaemon` opened a bare `node:http` server
 * that answered every request with 404 — none of `admission.ts`/`poller.ts`/`ipc/*`/`transport/*`/
 * `send/*`/`serve/*` (all already merged and independently audited, PR-18 through PR-31) were ever wired
 * together. This function now builds the real `IpcServerDeps.handlers` (`GET /identity` +
 * `createSessionRoutes`'s `POST/DELETE /session`, `/tools/*`) and a `BindingsReconciler` whose
 * `createTelegramClient`/`createPoller` resolve a real bot token through `SecretStore.get` and construct
 * a real `TelegramApiClient`/`startPoller` — reconciled once at boot and again on every heartbeat tick.
 *
 * **The handlers-before-secret ordering.** `createIdentityHandler`/`createSessionRoutes` both need this
 * boot's per-boot secret, which `writeRunFile` only produces once the IPC server's assigned port is known
 * (`writeRunFile(runDir, port)`) — but `createIpcServer` needs `handlers` at construction time, before
 * `.listen()` resolves a port. Resolved by passing a single MUTABLE `handlers` object by reference into
 * `createIpcServer`: it is empty when the server starts listening (nothing can reach it yet — no `await`
 * yields control back to an external caller before this function finishes populating it) and is filled in
 * once the secret and every other dependency are ready. `daemon/ipc/server.ts`'s own `handleRequest` reads
 * `deps.handlers[routeKey]` fresh on every request, so mutating the same object afterward is effective.
 *
 * **`options.port` is gone.** `createIpcServer` always binds `IPC_EPHEMERAL_PORT` (`0`, OS-assigned,
 * `shared/constants.ts`) with no override hook of its own, and no test in this project ever needed a
 * fixed port — every daemon test already asserts `daemon.port > 0` rather than a specific value.
 */
export async function startDaemon(options?: DaemonOptions): Promise<DaemonInstance> {
  const dirs = ensureHomeDirs(resolveHomeDir(options?.homeDir));
  const lock = acquireLock(dirs.homeDir);

  let ledger: LedgerOpenResult | undefined;
  let reconciler: BindingsReconciler | undefined;
  let ipcServer: IpcServerHandle | undefined;

  try {
    ledger = openLedger({ homeDir: dirs.homeDir, now: options?.now });
    const registry = loadRegistry(dirs.homeDir);

    const secretStore =
      options?.secretStore ?? (await selectSecretStore(dirs.homeDir)).store;

    const emitter = new EventEmitter();

    /** Resolves `bot`'s real token from `secretStore` and builds a `TelegramApiClient` for it. */
    const buildTelegramClient = async (botId: number): Promise<TelegramClient> => {
      if (options?.telegramClientFactory) {
        // The override receives the same `bot` shape production would look up; a test-only factory
        // typically ignores it and returns a fixed fake, so a minimal stand-in bot is enough here.
        return options.telegramClientFactory({ bot_id: botId } as RegistryBot);
      }
      const token = await secretStore.get(String(botId));
      if (token === null) {
        throw new Error(`No token found in the secret store for bot ${botId}`);
      }
      return new TelegramApiClient(token);
    };

    const handlers: Partial<Record<IpcRouteKey, IpcHandler>> = {};
    ipcServer = createIpcServer({
      handlers,
      log: (message) => writeDaemonLog(dirs.runDir, message),
    });

    const { port: assignedPort } = await ipcServer.listen();

    const runFile = writeRunFile(dirs.runDir, assignedPort);
    const startedAt = options?.now ? options.now() : Date.now();

    const handshakeStore = new PendingHandshakeStore(options?.now ?? Date.now);
    const sessionStore = new SessionStore(runFile.secret);

    reconciler = new BindingsReconciler({
      db: ledger.db,
      loader: registry,
      createTelegramClient: (bot) => buildTelegramClient(bot.bot_id),
      createPoller: async (binding) => {
        const client = await buildTelegramClient(binding.bot_id);
        return startPoller({ db: ledger!.db, binding, client, emitter });
      },
    });

    const routesDeps: RoutesDeps = {
      db: ledger.db,
      bindings: reconciler,
      handshakeStore,
      sessionStore,
      daemon: {
        pid: process.pid,
        started_at: new Date(startedAt).toISOString(),
        secret_store_kind: secretStore.kind,
      },
      emitter,
    };

    handlers["GET /identity"] = createIdentityHandler({ secret: runFile.secret, store: handshakeStore });
    Object.assign(handlers, createSessionRoutes(routesDeps));

    // Initial reconciliation (design §7.1's "reconcile bindings" step, before RUNNING). A failure here
    // must not abort the whole boot sequence — the daemon still comes up reachable, and the next
    // heartbeat tick retries.
    try {
      await reconciler.reconcile();
    } catch (err) {
      writeDaemonLog(dirs.runDir, `initial binding reconciliation failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    let stopPromise: Promise<void> | null = null;
    const stop = (): Promise<void> => {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        heartbeat.stop();
        await reconciler!.stopAll();
        await ipcServer!.close();
        deleteRunFile(dirs.runDir, runFile.pid);
        lock.release();
        try {
          ledger!.db.close();
        } catch {
          // Already closed or unavailable
        }
      })();
      return stopPromise;
    };

    let lastSweepAt: string | null = null;
    // `setInterval` (heartbeat.ts) does not wait for a prior async `onTick` to settle before scheduling
    // the next one — if `reconciler.reconcile()` ever takes longer than `periodMs` (a slow secret-store
    // lookup, a slow registry read), an overlapping tick would race the same synchronous
    // `!current`-then-async-add check in `BindingsReconciler.reconcile` (bindings.ts), starting two
    // pollers for the same bot and colliding on Telegram's own single-poller-per-token 409 (PR-40a
    // Alpha audit). Skipping a whole tick when the previous one is still in flight is simpler and safer
    // than partially guarding just the reconcile call, since retention/idle checks reading the same
    // ledger mid-reconcile carry no correctness requirement to run on every single tick.
    let ticking = false;
    const heartbeat = startHeartbeat({
      periodMs: options?.heartbeatPeriodMs ?? HEARTBEAT_PERIOD_MS,
      updateLockHeartbeat: () => {
        lock.updateHeartbeat();
      },
      onTick: async () => {
        if (ticking) return;
        ticking = true;
        try {
          await tick();
        } finally {
          ticking = false;
        }
      },
      onError: (err) => {
        writeDaemonLog(dirs.runDir, `heartbeat tick failed: ${err instanceof Error ? err.message : String(err)}`);
      },
    });

    async function tick(): Promise<void> {
      // `reconciler.reconcile()` (no argument) calls `registry.sync()` itself — `registry` here is the
      // same `RegistryLoader` instance passed to `BindingsReconciler`'s `loader` option (PR-40a). A
      // separate `registry.sync()` call here would consume the "loaded" transition first, leaving the
      // reconciler's own internal sync permanently seeing "unchanged" and, once at least one binding is
      // already active, silently never picking up a later registry change (D-12 hot-reload broken).
      await reconciler!.reconcile();

      const nowIso = new Date(options?.now ? options.now() : Date.now()).toISOString();
      if (isRetentionSweepDue(lastSweepAt, nowIso)) {
        try {
          sweepRetention(ledger!.db, { now: nowIso });
          lastSweepAt = nowIso;
        } catch {
          // Retention sweep failure must not crash heartbeat
        }
      }

      checkIdleShutdown({
        now: options?.now,
        startedAt,
        getLastSessionSeenAt: () => getLastSessionSeenAt(ledger!.db),
        getOpenThreadCount: () => {
          try {
            const row = ledger!.db
              .prepare("SELECT count(*) as c FROM threads WHERE status = 'open'")
              .get() as { c: number } | undefined;
            return row?.c ?? 0;
          } catch {
            return 0;
          }
        },
        onIdle: () => {
          void stop();
        },
      });
    }

    return {
      dirs,
      port: assignedPort,
      runFile,
      ledger,
      registry,
      secretStore,
      stop,
    };
  } catch (err) {
    if (reconciler) {
      await reconciler.stopAll().catch(() => {});
    }
    if (ipcServer) {
      await ipcServer.close().catch(() => {});
    }
    if (ledger) {
      try {
        ledger.db.close();
      } catch {
        // Ignore
      }
    }
    lock.release();
    throw err;
  }
}
