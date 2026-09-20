import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { HEARTBEAT_PERIOD_MS, IPC_EPHEMERAL_PORT } from "../shared/constants.js";
import { openLedger, type LedgerOpenResult } from "../ledger/open.js";
import { createRegistryLoader, type RegistryLoader } from "../registry/loader.js";
import { selectSecretStore } from "../secret-store/index.js";
import type { SecretStore } from "../secret-store/types.js";
import { ensureHomeDirs, resolveHomeDir, type HomeDirs } from "./home.js";
import { startHeartbeat } from "./lifecycle/heartbeat.js";
import { checkIdleShutdown } from "./lifecycle/idle.js";
import { acquireLock } from "./lifecycle/lock.js";
import { deleteRunFile, writeRunFile, type DaemonRunPayload } from "./lifecycle/run-file.js";

/**
 * Options for daemon bootstrap dependency injection (design §15).
 */
export interface DaemonOptions {
  readonly homeDir?: string;
  readonly now?: () => number;
  readonly secretStore?: SecretStore;
  readonly telegramClientFactory?: (binding: unknown) => unknown;
  readonly port?: number;
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
 * Boots the daemon following the design §7.1 state machine:
 * ensure ~/.conmuta/{run,secrets} -> acquire run/daemon.lock -> open ledger ->
 * load registry -> select secret store -> listen IPC -> write run/daemon.json ->
 * start heartbeat -> reconcile bindings -> RUNNING.
 */
export async function startDaemon(options?: DaemonOptions): Promise<DaemonInstance> {
  const dirs = ensureHomeDirs(resolveHomeDir(options?.homeDir));
  const lock = acquireLock(dirs.homeDir);

  let ledger: LedgerOpenResult | undefined;
  let server: Server | undefined;

  try {
    ledger = openLedger({ homeDir: dirs.homeDir, now: options?.now });
    const registry = loadRegistry(dirs.homeDir);

    const secretStore =
      options?.secretStore ?? (await selectSecretStore(dirs.homeDir)).store;

    // Start IPC server on 127.0.0.1:IPC_EPHEMERAL_PORT (or injected port)
    server = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });

    const targetPort = options?.port ?? IPC_EPHEMERAL_PORT;
    await new Promise<void>((resolve, reject) => {
      server!.on("error", reject);
      server!.listen(targetPort, "127.0.0.1", () => {
        resolve();
      });
    });

    const address = server.address();
    const assignedPort =
      typeof address === "object" && address !== null ? address.port : targetPort;

    const runFile = writeRunFile(dirs.runDir, assignedPort);

    const startedAt = options?.now ? options.now() : Date.now();
    let lastSessionSeenAt: number | null = null;

    let stopped = false;
    const stop = async (): Promise<void> => {
      if (stopped) return;
      stopped = true;

      heartbeat.stop();

      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });

      deleteRunFile(dirs.runDir, runFile.pid);
      lock.release();

      try {
        ledger!.db.close();
      } catch {
        // Already closed or unavailable
      }
    };

    const heartbeat = startHeartbeat({
      periodMs: HEARTBEAT_PERIOD_MS,
      updateLockHeartbeat: () => {
        lock.updateHeartbeat();
      },
      onTick: () => {
        registry.sync();
        checkIdleShutdown({
          now: options?.now,
          startedAt,
          getLastSessionSeenAt: () => lastSessionSeenAt,
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
      },
    });

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
    if (server) {
      server.close();
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
