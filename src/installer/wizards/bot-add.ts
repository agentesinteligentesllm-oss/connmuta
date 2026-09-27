import type { DatabaseSync } from "node:sqlite";

import { TelegramApiClient } from "../../daemon/telegram.js";
import { selectSecretStore, type SecretStoreSelection } from "../../secret-store/index.js";
import { redactTokenShapes } from "../../secret-store/redaction.js";
import type { Prompter } from "../prompter.js";
import { commitRegistryChange, type RegistryCommitOutcome } from "../registry-commit.js";
import { buildRegistryTokenRef } from "../token-ref.js";

/**
 * The `bot add` wizard (`installer/wizards/bot-add.ts`, spec.md:61-83, design.md §6 D-37;
 * tasks.md PR-11 sub-task 11.1/11.2).
 *
 * The masked token is used exactly twice — `TelegramApiClient`'s constructor and
 * `selection.store.set` — and never returned, logged, or placed on any outcome. A `getMe` rejection's
 * message is already redacted once by the error class's own constructor (`daemon/telegram.ts`'s
 * `TelegramError`); this function redacts it a second time before returning it (design.md §6's
 * "belt-and-suspenders"), because it is the last place that message is seen before it reaches a human.
 *
 * **Store-then-commit ordering is deliberate** (design.md §6 "Store" row): the secret-store write
 * happens before the registry commit, so a commit failure leaves an orphan secret rather than a bot
 * the human believes failed outright — the next `bot add` for the same bot overwrites it. This
 * function does not attempt to undo the secret-store write on a commit failure.
 */

/** A registry-commit outcome that is not `"committed"`, surfaced rather than swallowed. */
export type BotAddRegistryFailure = Exclude<RegistryCommitOutcome, { readonly outcome: "committed" }>;

/** What {@link runBotAdd} decided. */
export type BotAddOutcome =
	| { readonly outcome: "added"; readonly bot_id: number; readonly username: string }
	| { readonly outcome: "cancelled" }
	| { readonly outcome: "getMe-failed"; readonly message: string }
	| { readonly outcome: "registry-commit-failed"; readonly detail: BotAddRegistryFailure };

/** What {@link runBotAdd} needs. */
export interface RunBotAddOptions {
	/** The open ledger connection `commitRegistryChange` writes through. */
	readonly db: DatabaseSync;
	/** Absolute path of `registry.json`. */
	readonly registryPath: string;
	/** The daemon home; `selectSecretStore` and `buildRegistryTokenRef` are rooted here. */
	readonly homeDir: string;
	/** The wizard's sole prompting port (D-38); never `@clack/prompts` directly. */
	readonly prompter: Prompter;
	/** Overridable for tests; defaults to the real `fetch`. */
	readonly fetchImpl?: typeof fetch;
	/** Overridable for tests; defaults to `() => new Date()`. */
	readonly now?: () => Date;
	/**
	 * Defaults to the real `selectSecretStore`; injected so a test never touches the real OS keychain,
	 * mirroring `migration/main.ts`'s own `selectSecretStoreImpl` seam for the same concern.
	 */
	readonly selectSecretStoreImpl?: (homeDir: string) => Promise<SecretStoreSelection>;
}

/** Builds the redacted refusal `runBotAdd` returns for a `getMe` failure or a non-bot token. */
function getMeFailed(message: string): BotAddOutcome {
	return { outcome: "getMe-failed", message: redactTokenShapes(message) };
}

/**
 * Runs `bot add` (spec.md:61-83): a masked token prompt, `getMe` against the daemon's own redacting
 * Telegram client, then a secret-store write followed by one registry commit.
 */
export async function runBotAdd(options: RunBotAddOptions): Promise<BotAddOutcome> {
	const answer = await options.prompter.password({ message: "Enter the bot's Telegram token:" });
	if (options.prompter.isCancel(answer)) {
		return { outcome: "cancelled" };
	}
	// `isCancel` returning false is this port's own contract for "the answer is the string it looks
	// like" (D-38); `Prompter.password`'s `symbol` arm exists only for the cancel case just handled.
	const token = answer as string;

	let me: Awaited<ReturnType<TelegramApiClient["getMe"]>>;
	try {
		me = await new TelegramApiClient(token, { fetchImpl: options.fetchImpl }).getMe();
	} catch (err) {
		return getMeFailed(err instanceof Error ? err.message : String(err));
	}
	if (!me.is_bot) {
		return getMeFailed("Telegram getMe succeeded, but the account is not a bot.");
	}

	const bot_id = me.id;
	// Telegram omits `username` for an account that has none; `RegistryBot.username` is a required
	// string (`registry/schema.ts`), so the one caller that can hit this records an empty string
	// rather than widening that field to `string | undefined` for a case display-only text can absorb.
	const username = me.username ?? "";

	const selectStore = options.selectSecretStoreImpl ?? ((homeDir: string) => selectSecretStore(homeDir));
	const selection = await selectStore(options.homeDir);
	await selection.store.set(String(bot_id), token);
	const token_ref = buildRegistryTokenRef(options.homeDir, bot_id, selection);

	const now = (options.now?.() ?? new Date()).toISOString();
	const commit = commitRegistryChange({
		db: options.db,
		registryPath: options.registryPath,
		audit: {
			ts: now,
			project_id: null,
			bot_id,
			chat_id: null,
			// This row records an installer action, not a bus envelope, so it has no `eid`/`envelope_type`
			// of its own to carry — the same choice `installer/registry-commit.ts`'s own merged test suite
			// makes for every case that is not about those two fields (`test/installer/registry-commit.
			// test.ts`'s `commitAudit()` default).
			eid: null,
			envelope_type: null,
			from_user_id: null,
			to_user_id: null,
			reason: "BOT_ADDED",
		},
		mutate: (current) => ({
			...current,
			bots: [...current.bots, { bot_id, username, token_ref, added_at: now }],
		}),
	});

	if (commit.outcome !== "committed") {
		return { outcome: "registry-commit-failed", detail: commit as BotAddRegistryFailure };
	}
	return { outcome: "added", bot_id, username };
}
