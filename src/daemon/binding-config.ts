/**
 * Provenance: telegram-agent-bus src/config.ts:168-187 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 20ec5756b6877e6ca1beffdbf196ab43f2dae89557aef627e09606e2b905f1ff
 * Changes: (1) bot_token removed (I-2); (2) materialized per binding from RegistryBinding and ProjectFile/RegistryBot (DATA-MODEL §1); (3) types updated for v2.
 */

import { z } from "zod";
import { REQUEST_REMINDER_WINDOW_HOURS } from "../shared/constants.js";
import type { RegistryBinding, RegistryBot } from "../registry/schema.js";

export const bindingRosterEntrySchema = z.object({
  username: z.string().min(1),
  user_id: z.number().int(),
});

export const bindingConfigSchema = z.object({
  agent_id: z.string().min(1),
  bot_username: z.string().min(1),
  chat_id: z
    .number()
    .int()
    .negative("chat_id must be negative — Telegram group/supergroup chat ids are never positive; don't strip the leading minus sign"),
  reminder_window_hours: z.number().positive().default(REQUEST_REMINDER_WINDOW_HOURS),
  secret_markers: z.array(z.string()).default([]),
  roster: z.record(z.string(), bindingRosterEntrySchema),
});

export type BindingRosterEntry = z.infer<typeof bindingRosterEntrySchema>;
export type BindingConfig = z.infer<typeof bindingConfigSchema>;

export class BindingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BindingConfigError";
  }
}

/**
 * Materializes a BindingConfig from a RegistryBinding and the bot's username (or RegistryBot).
 * v1 Config minus bot_token (DATA-MODEL §1 derivation).
 */
export function materializeBindingConfig(
  binding: RegistryBinding,
  botOrUsername: RegistryBot | { username: string } | string | null | undefined
): BindingConfig {
  if (!botOrUsername) {
    throw new BindingConfigError(
      `Cannot materialize BindingConfig for project ${binding.project_id}: bot or username is required`
    );
  }
  const bot_username = typeof botOrUsername === "string" ? botOrUsername : botOrUsername.username;
  if (!bot_username) {
    throw new BindingConfigError(
      `Cannot materialize BindingConfig for project ${binding.project_id}: bot username is required`
    );
  }
  const roster: Record<string, BindingRosterEntry> = {};
  const entries = binding.roster_snapshot ?? [];
  for (const entry of entries) {
    roster[entry.agent_id] = {
      username: entry.username,
      user_id: entry.user_id,
    };
  }

  const result = bindingConfigSchema.safeParse({
    agent_id: binding.agent_id,
    bot_username,
    chat_id: binding.group_id,
    reminder_window_hours: binding.settings?.reminder_window_hours ?? REQUEST_REMINDER_WINDOW_HOURS,
    secret_markers: binding.settings?.secret_markers ? [...binding.settings.secret_markers] : [],
    roster,
  });

  if (!result.success) {
    throw new BindingConfigError(
      `Failed to materialize BindingConfig for project ${binding.project_id}: ${result.error.message}`
    );
  }

  return result.data;
}
