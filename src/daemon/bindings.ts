import type { DatabaseSync } from "node:sqlite";
import { appendAuditRow } from "../ledger/audit.js";
import type { Registry, RegistryBinding, RegistryBot } from "../registry/schema.js";
import type { RegistryLoader } from "../registry/loader.js";
import type { ProjectRosterEntry } from "../shared/project-file.js";
import type { TelegramClient } from "./telegram.js";
import { RoomGuardClient } from "./transport/room-guard.js";
import { GroupTransport } from "./transport/group.js";
import { DirectTransport } from "./transport/direct.js";
import { DualWriteTransport } from "./transport/dual.js";
import type { Transport } from "./transport/types.js";
import { materializeBindingConfig, type BindingConfig } from "./binding-config.js";

export interface PollerHandle {
  stop(): Promise<void> | void;
}

export type PollerFactory = (
  binding: RegistryBinding,
  config: BindingConfig,
  transport?: Transport
) => Promise<PollerHandle> | PollerHandle;

export type TransportFactory = (
  binding: RegistryBinding,
  config: BindingConfig
) => Promise<{ transport: Transport; roomGuard?: RoomGuardClient }> | { transport: Transport; roomGuard?: RoomGuardClient };

export interface BindingsReconcilerOptions {
  readonly db?: DatabaseSync;
  readonly loader?: RegistryLoader;
  readonly createPoller?: PollerFactory;
  readonly createTransport?: TransportFactory;
  readonly createTelegramClient?: (bot: RegistryBot) => TelegramClient;
}

export interface ManagedBinding {
  readonly binding: RegistryBinding;
  readonly config: BindingConfig;
  readonly transport?: Transport;
  readonly roomGuard?: RoomGuardClient;
  readonly poller?: PollerHandle;
  stop?(): Promise<void> | void;
}

export interface ReconcileResult {
  readonly changed: boolean;
  readonly added: readonly RegistryBinding[];
  readonly removed: readonly RegistryBinding[];
  readonly updated: readonly RegistryBinding[];
  readonly active: readonly ManagedBinding[];
  readonly invalid?: boolean;
}

function areBindingsEquivalent(a: RegistryBinding, b: RegistryBinding): boolean {
  if (a.bot_id !== b.bot_id) return false;
  if (a.group_id !== b.group_id) return false;
  if (a.agent_id !== b.agent_id) return false;
  if (a.roster_hash !== b.roster_hash) return false;
  if (JSON.stringify(a.settings) !== JSON.stringify(b.settings)) return false;
  return true;
}

/**
 * Reconciles active bindings from registry hot-reloads, manages poller & transport lifecycles,
 * and records BINDING_CHANGED audit rows in the ledger (D-12, D-22, PT-01, PT-20).
 */
export class BindingsReconciler {
  private readonly db?: DatabaseSync;
  private readonly loader?: RegistryLoader;
  private readonly createPoller?: PollerFactory;
  private readonly createTransport?: TransportFactory;
  private readonly createTelegramClient?: (bot: RegistryBot) => TelegramClient;
  private readonly managedBindings = new Map<string, ManagedBinding>();

  constructor(options: BindingsReconcilerOptions = {}) {
    this.db = options.db;
    this.loader = options.loader;
    this.createPoller = options.createPoller;
    this.createTransport = options.createTransport;
    this.createTelegramClient = options.createTelegramClient;
  }

  getActiveBindings(): readonly ManagedBinding[] {
    return Array.from(this.managedBindings.values());
  }

  getBinding(projectId: string): ManagedBinding | undefined {
    return this.managedBindings.get(projectId);
  }

  private writeAuditRow(binding: RegistryBinding): void {
    if (!this.db) return;
    appendAuditRow(this.db, {
      ts: new Date().toISOString(),
      project_id: binding.project_id,
      bot_id: binding.bot_id,
      chat_id: binding.group_id,
      client_id: null,
      direction: "system",
      eid: null,
      envelope_type: null,
      from_user_id: null,
      to_user_id: null,
      outcome: "ok",
      reason: "BINDING_CHANGED",
    });
  }

  private async buildTransport(
    binding: RegistryBinding,
    config: BindingConfig,
    bot?: RegistryBot
  ): Promise<{ transport?: Transport; roomGuard?: RoomGuardClient }> {
    if (this.createTransport) {
      return await this.createTransport(binding, config);
    }
    if (this.createTelegramClient && bot) {
      const client = this.createTelegramClient(bot);
      const roomGuard = new RoomGuardClient(client, {
        groupId: binding.group_id,
        roster: binding.roster_snapshot,
      });
      const groupTransport = new GroupTransport(roomGuard, binding.group_id);
      const directRoster: Record<string, ProjectRosterEntry> = {};
      for (const entry of binding.roster_snapshot) {
        directRoster[entry.agent_id] = entry;
      }
      const directTransport = new DirectTransport(roomGuard, directRoster);
      const transport = new DualWriteTransport(groupTransport, directTransport);
      return { transport, roomGuard };
    }
    return {};
  }

  async reconcile(registry?: Registry): Promise<ReconcileResult> {
    let targetRegistry = registry;

    if (!targetRegistry && this.loader) {
      const syncResult = this.loader.sync();
      if (syncResult.status === "unchanged") {
        return {
          changed: false,
          added: [],
          removed: [],
          updated: [],
          active: this.getActiveBindings(),
        };
      }
      if (syncResult.status === "invalid") {
        // Keep last-good bindings active; do not stop or mutate (ADR-0030)
        return {
          changed: false,
          added: [],
          removed: [],
          updated: [],
          active: this.getActiveBindings(),
          invalid: true,
        };
      }
      targetRegistry = syncResult.registry;
    } else if (!targetRegistry && this.loader?.current) {
      targetRegistry = this.loader.current();
    }

    if (!targetRegistry) {
      throw new Error("No registry available for reconciliation");
    }

    const activeBindings = targetRegistry.bindings.filter((b) => b.status === "active");
    const activeMap = new Map<string, RegistryBinding>();
    for (const binding of activeBindings) {
      activeMap.set(binding.project_id, binding);
    }

    const added: RegistryBinding[] = [];
    const removed: RegistryBinding[] = [];
    const updated: RegistryBinding[] = [];

    // 1. Remove bindings that are no longer active (removed or suspended)
    for (const [projectId, managed] of Array.from(this.managedBindings.entries())) {
      if (!activeMap.has(projectId)) {
        if (managed.poller?.stop) {
          await managed.poller.stop();
        }
        if (managed.stop) {
          await managed.stop();
        }
        this.writeAuditRow(managed.binding);
        this.managedBindings.delete(projectId);
        removed.push(managed.binding);
      }
    }

    // 2. Add or update active bindings
    for (const [projectId, binding] of activeMap.entries()) {
      const bot = targetRegistry.bots.find((b) => b.bot_id === binding.bot_id);
      const config = materializeBindingConfig(binding, bot ?? { username: "unknown_bot" });
      const current = this.managedBindings.get(projectId);

      if (!current) {
        // New active binding
        const { transport, roomGuard } = await this.buildTransport(binding, config, bot);
        const poller = this.createPoller ? await this.createPoller(binding, config, transport) : undefined;

        this.managedBindings.set(projectId, {
          binding,
          config,
          transport,
          roomGuard,
          poller,
        });
        this.writeAuditRow(binding);
        added.push(binding);
      } else if (!areBindingsEquivalent(current.binding, binding)) {
        // Updated active binding
        if (current.poller?.stop) {
          await current.poller.stop();
        }
        if (current.stop) {
          await current.stop();
        }

        const { transport, roomGuard } = await this.buildTransport(binding, config, bot);
        const poller = this.createPoller ? await this.createPoller(binding, config, transport) : undefined;

        this.managedBindings.set(projectId, {
          binding,
          config,
          transport,
          roomGuard,
          poller,
        });
        this.writeAuditRow(binding);
        updated.push(binding);
      }
    }

    return {
      changed: added.length > 0 || removed.length > 0 || updated.length > 0,
      added,
      removed,
      updated,
      active: this.getActiveBindings(),
    };
  }

  async stopAll(): Promise<void> {
    for (const managed of this.managedBindings.values()) {
      if (managed.poller?.stop) {
        await managed.poller.stop();
      }
      if (managed.stop) {
        await managed.stop();
      }
    }
    this.managedBindings.clear();
  }
}
