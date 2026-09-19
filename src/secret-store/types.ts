/**
 * Secret store abstraction (design §6).
 *
 * The daemon selects exactly one implementation at startup — the OS keychain
 * (`keyring.ts`) or the ACL'd fallback file (`file-fallback.ts`) — and hands
 * tokens to `TelegramApiClient` in memory only.
 */
export interface SecretStore {
	/** Which backend is active: `"keychain"` for `@napi-rs/keyring`, `"file"` for the fallback. */
	readonly kind: "keychain" | "file";
	/** Read the token for `botId`, or `null` if no entry exists. */
	get(botId: string): Promise<string | null>;
	/** Store `token` under `botId`. */
	set(botId: string, token: string): Promise<void>;
	/** Remove the entry for `botId`. No-op if it does not exist. */
	delete(botId: string): Promise<void>;
}
