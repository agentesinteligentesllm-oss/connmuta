/**
 * Provenance: telegram-agent-bus src/config.ts:168-233 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 3b7ac64c25a62622589f9ad47b1cfc7a827f226d6aa5c67a3bdfd2403ee319e8
 *   (lines 168-233, LF-normalized, including the terminating newline. Reproduce with a sha256 over
 *    the frozen checkout, or see `test/fixtures/v1-provenance.json`.)
 * Changes: (1) `ConfigError`-throwing `loadConfig` becomes `loadV1Config`, returning a typed
 * `V1ConfigResult` — never throws; (2) a missing `config.json` shares the same `"unreadable"`
 * refusal as any other read fault, matching v1's own undifferentiated throw (v1's `loadConfig` has
 * no file-not-found special case, so neither does this reader); (3) malformed JSON and schema
 * failures become `"invalid_json"`/`"schema_invalid"` refusals instead of a thrown `ConfigError`;
 * (4) `getAgentBusHome` is renamed `resolveV1AgentBusHome`, behavior unchanged; (5)
 * `REQUEST_REMINDER_WINDOW_HOURS` (telegram-agent-bus src/config.ts:53, not separately
 * SEAM-pinned — outside the cited 168-233 range but required as this schema's own default) is
 * reproduced locally as a named constant, disclosed here rather than pinned; (6) `resolveBotToken`
 * (v1 lines 239-250) is intentionally NOT ported — outside this range and out of scope: this module
 * adds no environment-based bot-token resolution.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

/**
 * v1's own reminder-window default (telegram-agent-bus src/config.ts:53). A supporting, non-pinned
 * constant reproduced here — outside the 168-233 SEAM range, but required by the schema default
 * below.
 */
const V1_REQUEST_REMINDER_WINDOW_HOURS = 24;

const v1RosterEntrySchema = z.object({
  username: z.string().min(1),
  user_id: z.number().int(),
});

const v1ConfigFileSchema = z.object({
  agent_id: z.string().min(1),
  bot_username: z.string().min(1),
  chat_id: z
    .number()
    .int()
    .negative("chat_id must be negative — Telegram group/supergroup chat ids are never positive; don't strip the leading minus sign"),
  reminder_window_hours: z.number().positive().default(V1_REQUEST_REMINDER_WINDOW_HOURS),
  secret_markers: z.array(z.string()).default([]),
  roster: z.record(z.string(), v1RosterEntrySchema),
  bot_token: z.string().min(1).optional(),
});

export type V1RosterEntry = z.infer<typeof v1RosterEntrySchema>;
export type V1Config = z.infer<typeof v1ConfigFileSchema>;

/**
 * Why {@link loadV1Config} refused to load v1's `config.json`. Value-free by construction, matching
 * this repository's other typed-result readers (`shared/project-file.ts`, `client/binding.ts`,
 * `registry/loader.ts`).
 */
export type V1ConfigRefusal =
  | { readonly kind: "unreadable" }
  | { readonly kind: "invalid_json" }
  | { readonly kind: "schema_invalid" };

/** {@link loadV1Config}'s outcome: either a validated v1 config, or the refusal that stopped it. */
export type V1ConfigResult =
  | { readonly ok: true; readonly config: V1Config }
  | { readonly ok: false; readonly refusal: V1ConfigRefusal };

/**
 * Resolves AGENTBUS_HOME: an explicit env override, else `os.homedir()/.agentbus`. Ported from v1's
 * `getAgentBusHome` (same pinned range) under a new name, no behavior change.
 */
export function resolveV1AgentBusHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.AGENTBUS_HOME;
  if (override && override.trim().length > 0) {
    return override;
  }
  return join(homedir(), ".agentbus");
}

/**
 * Reads and validates v1's `config.json` from `homeDir`. Never throws — see the module header's
 * Changes list. A missing file is folded into the same `"unreadable"` refusal as any other read
 * fault, matching v1's own `loadConfig`, which has no file-not-found special case.
 */
export function loadV1Config(homeDir: string): V1ConfigResult {
  const configPath = join(homeDir, "config.json");

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    return { ok: false, refusal: { kind: "unreadable" } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, refusal: { kind: "invalid_json" } };
  }

  const result = v1ConfigFileSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, refusal: { kind: "schema_invalid" } };
  }

  return { ok: true, config: result.data };
}
